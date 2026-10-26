// Prueba de red: 3 bots se conectan al servidor local y juegan una partida entera.
// Uso: node test/net.mjs [http://127.0.0.1:8787]
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];

function bot(pid, name, code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/api/room/${code}?pid=${pid}&name=${name}&avatar=%F0%9F%90%B8`);
    const b = { pid, ws, last: null, errors: [], seenPrivate: [], send: m => ws.send(JSON.stringify(m)) };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.type === 'fatal') reject(new Error(m.error));
      if (m.type === 'error') b.errors.push(m.error);
      if (m.type === 'state') {
        b.last = m;
        for (const ev of m.events) if (ev.inc || ev.mine || (ev.t === 'peek' && ev.card) || (ev.t === 'draw' && ev.card)) b.seenPrivate.push(ev);
      }
    };
    ws.onopen = () => resolve(b);
    ws.onerror = reject;
  });
}

const r = await fetch(`${BASE}/api/new?pid=a`).then(r => r.json());
assert.match(r.code, /^[A-Z]{4}$/);
const code = r.code;
const bots = [await bot('a', 'Ana', code), await bot('b', 'Bea', code), await bot('c', 'Carlos', code)];
await sleep(300);
assert.equal(bots[0].last.lobby.length, 3);
assert.equal(bots[0].last.host, 'a');

// Un cuarto jugador no puede entrar con un código que no existe
{
  const ws = new WebSocket(`${WS}/api/room/ZZZZ?pid=z&name=Zoe`);
  const msg = await new Promise(res => { ws.onmessage = e => res(JSON.parse(e.data)); });
  assert.equal(msg.type, 'fatal');
}

bots[0].send({ a: 'start' });
await sleep(300);
assert.equal(bots[1].last.view.phase, 'peek');

let steps = 0;
while (steps++ < 6000) {
  const v = bots[0].last.view;
  if (v.phase === 'gameEnd') break;
  if (v.phase === 'roundEnd') { if (v.round >= 3) bots[0].send({ a: 'finish' }); else bots[1].send({ a: 'nextRound' }); await sleep(150); continue; }
  if (v.phase === 'peek') { await sleep(200); continue; } // el servidor empieza solo tras enseñar las cartas
  // Privacidad: nadie ve cartas ajenas ni la carta robada de otro
  for (const b of bots) {
    const w = b.last.view;
    w.players.forEach(p => p.hand.forEach(h => assert.ok(h === 0 || h === 1)));
    if (w.held && w.held.from === 'deck' && w.turn !== w.me) assert.equal(w.held.card, null);
  }
  const cur = bots[v.turn], w = cur.last.view, me = w.players[w.me];
  const mine = me.hand.map((h, i) => (h ? i : -1)).filter(i => i >= 0);
  if (w.matchRank !== null && Math.random() < 0.2) {
    const o = pick(bots), ov = o.last.view, oh = ov.players[ov.me].hand.map((h, i) => (h ? i : -1)).filter(i => i >= 0);
    if (oh.length && ov.caboBy !== ov.me) o.send({ a: 'match', slot: pick(oh) });
  } else if (w.step === 'draw') {
    if (w.caboBy === null && Math.random() < 0.08) cur.send({ a: 'cabo' });
    else cur.send({ a: 'draw' });
  } else if (w.step === 'hold') {
    if (mine.length && Math.random() < 0.5) cur.send({ a: 'swap', slot: pick(mine) });
    else cur.send({ a: 'discard' });
  } else if (w.step === 'power') {
    const t = w.power.type;
    const others = w.players.map((p, i) => i).filter(i => i !== w.me && i !== w.caboBy && w.players[i].hand.some(Boolean));
    if (t === 10 && w.power.stage === 'seeing') { if (Math.random() < 0.3) cur.send({ a: 'done' }); } // si no, lo cierra el servidor
    else if (t === 10 && mine.length) cur.send({ a: 'p10', slot: pick(mine) });
    else if (w.power.stage === 'decide') cur.send({ a: 'p12swap', yes: Math.random() < 0.5 });
    else if (mine.length && others.length) {
      const tp = pick(others);
      const ts = w.players[tp].hand.map((h, i) => (h ? i : -1)).filter(i => i >= 0);
      cur.send({ a: 'p' + t, slot: pick(mine), tp, tslot: pick(ts) });
    } else cur.send({ a: 'skip' });
  }
  await sleep(25);
}
const end = bots[0].last.view;
assert.equal(end.phase, 'gameEnd', 'la partida no terminó');
console.log('Ganador:', end.winner.map(i => end.players[i].name).join(', '), '| totales', end.players.map(p => p.total).join('/'));
console.log('Rondas:', end.round, '| errores (jugadas rechazadas):', bots.reduce((a, b) => a + b.errors.length, 0));
console.log('Eventos privados recibidos por cada bot:', bots.map(b => b.seenPrivate.length).join('/'));

// Reconexión: Bea se va y vuelve con el mismo id y sigue en la partida
bots[1].ws.close();
await sleep(200);
assert.equal(bots[0].last.lobby.find(p => p.id === 'b').online, false);
const back = await bot('b', 'Bea', code);
await sleep(200);
assert.equal(back.last.view.me, 1);
assert.equal(bots[0].last.lobby.find(p => p.id === 'b').online, true);
for (const b of [...bots, back]) b.ws.close();
console.log('OK prueba de red');
