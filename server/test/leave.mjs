// Prueba: jugadores que se van o pierden la conexión a mitad de partida.
// Uso: arrancar un servidor con la espera corta y lanzar la prueba:
//   npx wrangler dev --port 8788 --var AWAY_MS:3000
//   node test/leave.mjs http://127.0.0.1:8788
import assert from 'node:assert/strict';
const BASE = process.argv[2] || 'http://127.0.0.1:8788';
const WS = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('tiempo agotado'); await sleep(50); } };

function bot(pid, code) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${WS}/api/room/${code}?pid=${pid}&name=${pid}`);
    const b = { pid, ws, last: null, notice: null, fatal: null, send: m => ws.send(JSON.stringify(m)) };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') { b.last = m; if (m.notice) b.notice = m.notice; } if (m.type === 'fatal') b.fatal = m.error; };
    ws.onopen = () => res(b); ws.onerror = rej;
  });
}
const { code } = await fetch(`${BASE}/api/new?pid=ana`).then(r => r.json());
const [A, B, C, D] = [await bot('ana', code), await bot('bea', code), await bot('cris', code), await bot('dani', code)];
await sleep(300);
A.send({ a: 'start' });
await until(() => A.last.view && A.last.view.phase === 'ready');

// Dani pierde la conexión antes de pulsar «listo»: no se le espera
D.ws.close();
await until(() => A.last.view.players[3].away);
for (const b of [A, B, C]) b.send({ a: 'ready' });
await until(() => A.last.view.phase === 'peek');
console.log('✓ no se espera a quien está sin conexión para empezar');

// Cris sale de la partida a mitad
await until(() => A.last.view.phase === 'play', 15000);
C.send({ a: 'leave' });
await until(() => A.last.view.players[2].left);
assert.equal(A.last.view.players[2].hand.filter(Boolean).length, 0);
assert.ok(!A.last.lobby.some(p => p.id === 'cris'));
console.log('✓ quien sale desaparece de la mesa y sus cartas vuelven al mazo');
// Y no puede volver a entrar
const C2 = await bot('cris', code);
await until(() => C2.fatal);
console.log('✓ quien ha salido no puede volver:', C2.fatal);

// Dani no vuelve: a los pocos segundos sale solo
await until(() => A.last.view.players[3].left, 10000);
console.log('✓ quien pasa demasiado rato sin conexión sale de la partida');

// Turnos: nunca le toca a quien se ha ido
for (let i = 0; i < 6; i++) {
  const v = A.last.view;
  assert.ok(!v.players[v.turn].left, 'le toca a alguien que se ha ido');
  const cur = v.turn === 0 ? A : B;
  if (v.step === 'draw') cur.send({ a: 'draw' });
  else if (v.step === 'hold') cur.send({ a: 'discard' });
  else if (v.step === 'power') cur.send({ a: v.power.stage === 'decide' ? 'p12swap' : 'skip' });
  await sleep(300);
}
console.log('✓ los turnos se saltan a quien se ha ido');

// Bea se va: Ana se queda sola y vuelve a la sala
B.send({ a: 'leave' });
await until(() => A.last.view === null && A.notice);
assert.deepEqual(A.last.lobby.map(p => p.id), ['ana']);
console.log('✓ al quedarse sola, Ana vuelve a la sala con el aviso:', A.notice);
for (const b of [A, B, C, D, C2]) try { b.ws.close(); } catch {}
console.log('OK prueba de salidas');
