// Bots que se unen a una sala y juegan solos, despacio, para probar la web.
// Uso: node test/bots.mjs CODIGO [numero_de_bots] [http://127.0.0.1:8787]
const [code, nArg, base = 'http://127.0.0.1:8787'] = process.argv.slice(2);
const WS = base.replace(/^http/, 'ws');
const pick = a => a[Math.floor(Math.random() * a.length)];
const NAMES = [['Lucía', '🦊', '#e8543f'], ['Pablo', '🐼', '#3f8fe8'], ['Marta', '🦄', '#a05de8'], ['Dani', '🤖', '#39c6c6'], ['Sara', '🐯', '#f08a2e']];

function run(i) {
  const [name, avatar, color] = NAMES[i];
  const q = new URLSearchParams({ pid: 'bot' + i, name, avatar, color });
  const ws = new WebSocket(`${WS}/api/room/${code}?${q}`);
  const send = m => ws.send(JSON.stringify(m));
  let v = null, wait = 0;
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'fatal') { console.log(name, m.error); process.exit(1); }
    if (m.type === 'state') { v = m.view; wait = 2; }
  };
  setInterval(() => {
    if (!v || ws.readyState !== 1 || wait-- > 0) return;
    const me = v.players[v.me];
    const mine = me.hand.map((h, k) => (h ? k : -1)).filter(k => k >= 0);
    if (v.phase !== 'play') return;
    if (v.matchRank !== null && v.caboBy !== v.me && mine.length && Math.random() < 0.05) return send({ a: 'match', slot: pick(mine) });
    if (v.turn !== v.me) return;
    if (v.step === 'draw') return send(v.caboBy === null && Math.random() < 0.06 ? { a: 'cabo' } : Math.random() < 0.25 && v.discard.length && mine.length ? { a: 'take' } : { a: 'draw' });
    if (v.step === 'hold') return send(v.held.from === 'discard' || Math.random() < 0.5 ? { a: 'swap', slot: pick(mine) } : { a: 'discard' });
    if (v.step === 'power') {
      const t = v.power.type;
      const others = v.players.map((p, k) => k).filter(k => k !== v.me && k !== v.caboBy && v.players[k].hand.some(Boolean));
      if (t === 10 && mine.length) return send({ a: 'p10', slot: pick(mine) });
      if (v.power.stage === 'decide') return send({ a: 'p12swap', yes: Math.random() < 0.5 });
      if (mine.length && others.length) {
        const tp = pick(others), ts = v.players[tp].hand.map((h, k) => (h ? k : -1)).filter(k => k >= 0);
        return send({ a: 'p' + t, slot: pick(mine), tp, tslot: pick(ts) });
      }
      return send({ a: 'skip' });
    }
  }, 650);
  // Si se queda parado por una carrera, vuelve a mirar
  setInterval(() => { if (ws.readyState === 1) send({ a: 'ping' }); }, 20000);
}
for (let i = 0; i < (+nArg || 2); i++) run(i);
