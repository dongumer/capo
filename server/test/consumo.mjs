// Mide lo que gasta una partida "normal" del cupo gratuito de Cloudflare.
// 4 jugadores, 5 rondas, jugando como personas: roban, cambian o tiran, usan poderes,
// a veces echan una carta y cantan Capo tras unas vueltas.
// Uso: node test/consumo.mjs [https://capo.capo-server.workers.dev]
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
const ORIGIN = { Origin: 'https://dongumer.github.io' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const ROUNDS = 5;

let workerReqs = 0;
const get = path => { workerReqs++; return fetch(BASE + path, { headers: ORIGIN }).then(r => r.json()); };

function bot(pid, code) {
  return new Promise((res, rej) => {
    workerReqs++;
    const ws = new WebSocket(`${WS}/api/room/${code}?pid=${pid}&name=${pid}`, { headers: ORIGIN });
    const b = { pid, ws, v: null, sent: 0, send: m => { b.sent++; ws.send(JSON.stringify(m)); } };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') b.v = m.view; };
    ws.onopen = () => res(b); ws.onerror = rej;
  });
}

const { code } = await get(`/api/new?pid=p0`);
const bots = [];
for (let i = 0; i < 4; i++) bots.push(await bot('p' + i, code));
await sleep(800);
bots[0].send({ a: 'start' });

// Un ping de los móviles: debería contestarlo la respuesta automática sin contar como mensaje
const before = await get(`/api/stats/${code}`);
bots[1].ws.send('{"a":"ping"}');
await sleep(800);
const afterPing = await get(`/api/stats/${code}`);

let turnsThisRound = 0, lastTurnKey = '', lastKeyAt = 0, lastRound = 0;
const t0 = Date.now();
while (Date.now() - t0 < 420000) {
  await sleep(250);
  const v = bots[0].v;
  if (!v) continue;
  if (v.round !== lastRound) { lastRound = v.round; console.error(`ronda ${v.round}…`); }
  if (v.phase === 'roundEnd') {
    if (v.round >= ROUNDS) { bots[0].send({ a: 'finish' }); await sleep(1500); break; }
    bots[0].send({ a: 'nextRound' }); turnsThisRound = 0; await sleep(800); continue;
  }
  if (v.phase === 'ready') { for (const b of bots) if (b.v && !b.v.players[b.v.me].ready) b.send({ a: 'ready' }); await sleep(800); continue; }
  if (v.phase !== 'play') continue;
  const cur = bots[v.turn], w = cur.v;
  if (!w || w.turn !== v.turn) continue;
  const key = `${w.round}:${w.turn}:${w.step}:${w.discard.length}:${w.deckCount}`;
  if (key === lastTurnKey && Date.now() - lastKeyAt < 2000) continue; // espera a que llegue el estado nuevo (o reintenta)
  lastTurnKey = key; lastKeyAt = Date.now();
  const mine = w.players[w.me].hand.map((h, i) => (h ? i : -1)).filter(i => i >= 0);
  // De vez en cuando alguien echa una carta (acierta o falla)
  if (w.matchRank !== null && Math.random() < 0.12) {
    const o = pick(bots), oh = o.v.players[o.v.me].hand.map((h, i) => (h ? i : -1)).filter(i => i >= 0);
    if (oh.length) o.send({ a: 'match', slot: pick(oh) });
  }
  // Y a veces alguien recoloca sus cartas
  if (Math.random() < 0.05) { const o = pick(bots); o.send({ a: 'move', from: 0, to: 1 }); }
  if (w.step === 'closing') continue;
  if (w.step === 'draw') {
    turnsThisRound++;
    if (w.caboBy === null && turnsThisRound > 4 * 5 && Math.random() < 0.3) cur.send({ a: 'cabo' });
    else cur.send({ a: 'draw' });
  } else if (w.step === 'hold') {
    if (mine.length && Math.random() < 0.55) cur.send({ a: 'swap', slot: pick(mine) });
    else cur.send({ a: 'discard' });
  } else if (w.step === 'power') {
    const t = w.power.type;
    const others = w.players.map((p, i) => i).filter(i => i !== w.me && w.players[i].hand.some(Boolean));
    if (t === 10 && w.power.stage === 'seeing') cur.send({ a: 'done' });
    else if (t === 10) cur.send({ a: 'p10', slot: pick(mine) });
    else if (w.power.stage === 'decide') cur.send({ a: 'p12swap', yes: Math.random() < 0.5 });
    else if (mine.length && others.length) {
      const tp = pick(others), ts = w.players[tp].hand.map((h, i) => (h ? i : -1)).filter(i => i >= 0);
      cur.send({ a: 'p' + t, slot: pick(mine), tp, tslot: pick(ts) });
    } else cur.send({ a: 'skip' });
  }
}
const end = bots[0].v;
for (const b of bots) b.ws.close();
await sleep(1500);
const s = await get(`/api/stats/${code}`);
workerReqs -= 4; // las consultas de estadísticas no forman parte de una partida normal
const sent = bots.reduce((a, b) => a + b.sent, 0);
const rows = s.puts + s.alarms + 1; // +1: la escritura al crear la sala
const doReqs = s.conns + 1 + Math.ceil(s.msgs / 20); // conexiones + crear sala + mensajes (20 = 1)
console.log(JSON.stringify({ rondas: end && end.round, fase: end && end.phase, mensajes_enviados: sent, ...s }, null, 0));
console.log(`ping automático gratis: ${afterPing.msgs === before.msgs ? 'sí' : 'NO'} (mensajes antes ${before.msgs}, después ${afterPing.msgs})`);
console.log(`escrituras por partida: ${rows}  ->  partidas al día con 100.000: ${Math.floor(100000 / rows)}`);
console.log(`peticiones a las salas por partida: ${doReqs}  ->  partidas al día con 100.000: ${Math.floor(100000 / doReqs)}`);
console.log(`peticiones al Worker por partida: ${workerReqs}  ->  partidas al día con 100.000: ${Math.floor(100000 / workerReqs)}`);
