// Servidor del Capo en Cloudflare: una "sala" (Durable Object) por código de partida.
// La sala guarda el estado, reparte, comprueba las jugadas y manda a cada uno solo lo que puede ver.
import { DurableObject } from 'cloudflare:workers';
import { newGame, startRound, beginPlay, finishGame, act, viewFor, eventFor, MAX_PLAYERS, DEFAULTS } from './engine.js';

const ALLOWED = [
  /^https:\/\/dongumer\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/, // pruebas por la wifi de casa
];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O para no confundir
const ROOM_TTL = 1000 * 60 * 60 * 24; // una sala sin movimiento se borra a las 24 h
const COUNTDOWN_MS = 3000; // cuenta atrás antes de enseñar las dos cartas de abajo
const SHOW_MS = 3000; // lo que se ven en grande
const LOOK_MS = 3500; // lo que tiene quien usa la sota para mirar su carta antes de pasar el turno

const okOrigin = o => !o || ALLOWED.some(r => r.test(o));
const cors = o => ({ 'Access-Control-Allow-Origin': o || '*', 'Content-Type': 'application/json' });
const json = (data, o, status = 200) => new Response(JSON.stringify(data), { status, headers: cors(o) });
const clean = (s, n) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, n);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (!okOrigin(origin)) return new Response('Origen no permitido', { status: 403 });
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors(origin), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' } });

    // Crear partida: busca un código libre y lo reserva para quien la crea.
    if (url.pathname === '/api/new') {
      const pid = clean(url.searchParams.get('pid'), 40);
      if (!pid) return json({ error: 'Falta el jugador' }, origin, 400);
      for (let i = 0; i < 8; i++) {
        let code = '';
        for (let k = 0; k < 4; k++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.claim(code, pid);
        if (r) return json({ code }, origin);
      }
      return json({ error: 'No se pudo crear la partida, prueba otra vez' }, origin, 503);
    }

    // Entrar en una sala: /api/room/ABCD?pid=..&name=..&avatar=..&color=..
    const m = url.pathname.match(/^\/api\/room\/([A-Z]{4})$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'Se esperaba WebSocket' }, origin, 426);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch(req);
    }
    return json({ ok: true, name: 'capo' }, origin);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) || null;
    });
  }

  // Temporizadores de la partida: empezar tras el vistazo inicial o pasar el turno tras mirar con la sota.
  timerAt() {
    const g = this.s.game;
    if (!g) return null;
    if (g.phase === 'peek' && this.s.peekAt) return this.s.peekAt;
    if (g.phase === 'play' && g.step === 'power' && g.power.stage === 'seeing') return this.s.lookAt || null;
    return null;
  }

  async save() {
    this.s.touched = Date.now();
    const g = this.s.game;
    if (g && g.phase === 'play' && g.step === 'power' && g.power.stage === 'seeing') this.s.lookAt = this.s.lookAt || Date.now() + LOOK_MS;
    else this.s.lookAt = null;
    await this.ctx.storage.put('s', this.s);
    // La alarma sirve también para borrar salas viejas.
    await this.ctx.storage.setAlarm(this.timerAt() || Date.now() + ROOM_TTL);
  }

  // Al repartir: animación, cuenta atrás y las dos cartas de abajo en grande. Luego empieza solo.
  async deal() {
    const ev = startRound(this.s.game);
    const dealMs = 1300 + 280 * this.s.game.players.length;
    ev[0].showIn = dealMs + COUNTDOWN_MS;
    ev[0].showMs = SHOW_MS;
    this.s.peekAt = Date.now() + dealMs + COUNTDOWN_MS + SHOW_MS + 400;
    await this.save();
    this.broadcast(ev);
  }

  async alarm() {
    const g = this.s && this.s.game;
    const at = this.s && this.timerAt();
    if (at) {
      if (Date.now() < at - 50) { await this.ctx.storage.setAlarm(at); return; }
      const ev = g.phase === 'peek' ? beginPlay(g) : act(g, g.turn, { a: 'done' }).events;
      this.s.peekAt = null;
      await this.save();
      this.broadcast(ev);
      return;
    }
    if (this.s && Date.now() - (this.s.touched || 0) < ROOM_TTL) { await this.ctx.storage.setAlarm((this.s.touched || 0) + ROOM_TTL); return; }
    for (const ws of this.ctx.getWebSockets()) ws.close(4000, 'Sala cerrada');
    await this.ctx.storage.deleteAll();
    this.s = null;
  }

  async claim(code, pid) {
    if (this.s && Date.now() - (this.s.touched || 0) < ROOM_TTL) return false;
    this.s = { code, host: pid, lobby: [], settings: { ...DEFAULTS }, game: null };
    await this.save();
    return true;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const pid = clean(url.searchParams.get('pid'), 40);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [pid]);
    const fail = msg => {
      server.send(JSON.stringify({ type: 'fatal', error: msg }));
      server.close(4001, 'rechazado');
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!pid) return fail('Falta el jugador');
    if (!this.s) return fail('Esa partida no existe. Revisa el código.');

    const me = {
      id: pid,
      name: clean(url.searchParams.get('name'), 16) || 'Jugador',
      avatar: clean(url.searchParams.get('avatar'), 8) || '🙂',
      color: clean(url.searchParams.get('color'), 9) || '#e0b04a',
    };
    const known = this.s.lobby.find(p => p.id === pid);
    if (known) {
      Object.assign(known, me);
    } else {
      if (this.s.game) return fail('La partida ya ha empezado y no se puede entrar.');
      if (this.s.lobby.length >= MAX_PLAYERS) return fail('La partida está llena (máximo ' + MAX_PLAYERS + ').');
      this.s.lobby.push(me);
    }
    if (!this.s.lobby.some(p => p.id === this.s.host)) this.s.host = this.s.lobby[0].id;
    await this.save();
    // Cierra conexiones antiguas del mismo jugador (p. ej. otra pestaña)
    for (const ws of this.ctx.getWebSockets(pid)) if (ws !== server) try { ws.close(4002, 'Abierta en otro sitio'); } catch {}
    this.broadcast([]);
    return new Response(null, { status: 101, webSocket: client });
  }

  online() {
    const set = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1) set.add(this.ctx.getTags(ws)[0]);
    }
    return set;
  }

  // Manda a cada conectado su vista y los eventos que puede ver.
  broadcast(events, extra = {}) {
    const on = this.online();
    const { code, host, lobby, settings, game } = this.s;
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.ctx.getTags(ws)[0];
      const gi = game ? game.players.findIndex(p => p.id === pid) : -1;
      const msg = {
        type: 'state',
        code, host, settings,
        lobby: lobby.map(p => ({ ...p, online: on.has(p.id) })),
        view: game ? viewFor(game, gi) : null,
        events: game ? events.map(e => eventFor(e, gi)) : events,
        ...extra,
      };
      try { ws.send(JSON.stringify(msg)); } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    if (!this.s) return;
    const pid = this.ctx.getTags(ws)[0];
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const isHost = pid === this.s.host;
    const reply = error => ws.send(JSON.stringify({ type: 'error', error }));

    switch (m.a) {
      case 'ping':
        ws.send('{"type":"pong"}');
        return;
      case 'react':
        this.broadcast([{ t: 'react', pid, e: clean(m.e, 8) }]);
        return;
      case 'finish': {
        if (!isHost) return reply('Solo quien creó la partida puede terminarla');
        const g = this.s.game;
        if (!g || g.phase === 'gameEnd') return;
        const ev = finishGame(g);
        await this.save();
        this.broadcast(ev);
        return;
      }
      case 'kick':
        if (!isHost || this.s.game || m.pid === pid) return;
        this.s.lobby = this.s.lobby.filter(p => p.id !== m.pid);
        for (const w of this.ctx.getWebSockets(m.pid)) w.close(4003, 'Expulsado');
        await this.save();
        this.broadcast([]);
        return;
      case 'leave':
        if (this.s.game) return;
        this.s.lobby = this.s.lobby.filter(p => p.id !== pid);
        if (pid === this.s.host && this.s.lobby.length) this.s.host = this.s.lobby[0].id;
        await this.save();
        ws.close(1000, 'Salió');
        this.broadcast([]);
        return;
      case 'start': {
        if (!isHost) return reply('Solo quien creó la partida puede empezarla');
        if (this.s.game && this.s.game.phase !== 'gameEnd') return;
        if (this.s.lobby.length < 2) return reply('Hacen falta al menos 2 jugadores');
        this.s.game = newGame(this.s.lobby, this.s.settings);
        await this.deal();
        return;
      }
      case 'nextRound': {
        const g = this.s.game;
        if (!g || g.phase !== 'roundEnd') return;
        await this.deal();
        return;
      }
      case 'toLobby':
        if (!isHost) return;
        this.s.game = null;
        await this.save();
        this.broadcast([]);
        return;
    }

    const g = this.s.game;
    if (!g) return;
    const pi = g.players.findIndex(p => p.id === pid);
    if (m.a === 'forceSkip' && !isHost) return reply('Solo quien creó la partida puede saltar turnos');
    const res = act(g, pi, m);
    if (!res.ok) return reply(res.error);
    await this.save();
    this.broadcast(res.events);
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch {}
    if (this.s) this.broadcast([]);
  }
  async webSocketError(ws) {
    if (this.s) this.broadcast([]);
  }
}
