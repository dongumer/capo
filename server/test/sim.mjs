// Juega muchas partidas con jugadores al azar y comprueba que las reglas no se rompen.
import assert from 'node:assert/strict';
import { newGame, startRound, beginPlay, finishGame, closeRound, leaveGame, setAway, active, act, viewFor, eventFor, value, handTotal } from '../src/engine.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const slots = p => p.hand.map((c, i) => (c ? i : -1)).filter(i => i >= 0);

function countCards(st) {
  return st.deck.length + st.discard.length + (st.held ? 1 : 0) + st.players.reduce((a, p) => a + p.hand.filter(Boolean).length, 0);
}

function checkPrivacy(st, events) {
  // Ninguna vista ni evento enseña a otro jugador cartas ocultas.
  st.players.forEach((_, i) => {
    const v = viewFor(st, i);
    if (st.phase === 'play' || st.phase === 'peek') {
      v.players.forEach(q => q.hand.forEach(h => assert.ok(h === 0 || h === 1)));
      if (st.held && st.held.from === 'deck' && st.turn !== i) assert.equal(v.held.card, null);
    }
    for (const ev of events) {
      const e = eventFor(ev, i);
      if (ev.priv && ev.priv.to !== i) {
        assert.equal(e.card === undefined || ev.t === 'match' || ev.t === 'discard', true, 'fuga en ' + ev.t);
        assert.equal(e.inc, undefined);
        assert.equal(e.mine, undefined);
      }
    }
  });
}

let closings = 0;
let leaves = 0, aways = 0, alones = 0;
let games = 0, rounds = 0, actions = 0, matchesOk = 0, matchesBad = 0, cabos = 0;
for (let g = 0; g < 400; g++) {
  const n = 2 + (g % 7);
  const st = newGame(Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'J' + i })));
  let startEvents = startRound(st);
  assert.equal(startEvents.some(e => e.t === 'peek'), false); // nadie ve nada hasta que todos estén listos
  let guard = 0;
  let alone = false;
  while (st.phase !== 'gameEnd' && guard++ < 200000) {
    // De vez en cuando alguien se desconecta, vuelve o se va de la partida
    if (Math.random() < 0.004) {
      const act_ = active(st), j = act_[Math.floor(Math.random() * act_.length)];
      const r = leaveGame(st, j); leaves++;
      assert.ok(st.players[j].left && st.players[j].hand.length === 0);
      checkPrivacy(st, r.events);
      if (r.alone) { alone = true; alones++; break; }
      assert.ok(!st.players[st.turn].left || st.phase !== 'play', 'turno de alguien que se ha ido');
      if (st.phase === 'play' || st.phase === 'peek') assert.equal(countCards(st), 40);
      continue;
    }
    if (Math.random() < 0.01) {
      const act_ = active(st), j = act_[Math.floor(Math.random() * act_.length)];
      const others = act_.filter(i => i !== j && !st.players[i].away);
      if (others.length) { setAway(st, j, !st.players[j].away); aways++; }
      continue;
    }
    if (st.phase === 'roundEnd') {
      rounds++;
      const R = st.results;
      R.sums.forEach((v, i) => assert.equal(R.add[i], R.winners.includes(i) ? 1 : 0));
      // nadie que siga en la partida tiene menos que un ganador
      for (const w of R.winners) for (const i of active(st)) assert.ok(R.sums[w] <= R.sums[i] || st.players[w].left);
      if (st.round >= 3) { finishGame(st); break; }
      startEvents = startRound(st); continue;
    }
    let res;
    if (st.phase === 'ready') {
      let i = st.players.findIndex(q => !q.ready && !q.left && !q.away);
      if (i < 0) { setAway(st, st.players.findIndex(q => q.away), false); continue; }
      res = act(st, i, { a: 'ready' });
      const last = st.phase === 'peek';
      assert.equal(res.events.some(e => e.t === 'countdown'), last);
      // Tras la cuenta atrás, cada uno ve sus dos cartas de abajo y nadie más
      for (const ev of res.events.filter(e => e.t === 'peek')) {
        assert.ok([1, 3].includes(ev.slot));
        st.players.forEach((_, j) => assert.equal(eventFor(ev, j).card !== undefined, j === ev.p));
      }
    } else if (st.phase === 'peek') {
      const ev = startEvents.splice(0);
      checkPrivacy(st, ev);
      res = { ok: true, events: beginPlay(st) };
    } else {
      const i = st.turn, p = st.players[i];
      // A veces alguien intenta echar una carta (bien o mal)
      if (st.matchRank !== null && Math.random() < 0.3) {
        const j = Math.floor(Math.random() * n), q = st.players[j];
        const s = slots(q);
        if (s.length) {
          const hit = s.find(k => q.hand[k].r === st.matchRank);
          const k = hit !== undefined && Math.random() < 0.7 ? hit : pick(s);
          const r = act(st, j, { a: 'match', slot: k });
          assert.ok(r.ok, r.error);
          r.events.filter(e => e.t === 'match').forEach(e => (e.ok ? matchesOk++ : matchesBad++));
          checkPrivacy(st, r.events);
          assert.equal(countCards(st), 40);
          continue;
        }
      }
      if (Math.random() < 0.05) {
        const s = p.hand.length;
        if (s > 1 && !(st.step === 'power')) { const r = act(st, i, { a: 'move', from: 0, to: s - 1 }); assert.ok(r.ok, r.error); }
      }
      if (st.step === 'closing') {
        // última oportunidad para echar; luego se destapa
        res = { ok: true, events: closeRound(st) };
        closings++;
      } else if (st.step === 'draw') {
        if (st.caboBy === null && (handTotal(p) < 12 || Math.random() < 0.03) && Math.random() < 0.5) { res = act(st, i, { a: 'cabo' }); cabos++; }
        else res = act(st, i, { a: 'draw' });
      } else if (st.step === 'hold') {
        const s = slots(p);
        if (s.length && Math.random() < 0.5) res = act(st, i, { a: 'swap', slot: pick(s) });
        else res = act(st, i, { a: 'discard' });
      } else if (st.step === 'power') {
        const pw = st.power;
        const others = st.players.map((q, k) => k).filter(k => k !== i && slots(st.players[k]).length);
        const s = slots(p);
        if (pw.type === 10 && pw.stage === 'seeing') { assert.equal(st.turn, i); res = act(st, i, { a: 'done' }); }
        else if (pw.type === 10 && s.length) res = act(st, i, { a: 'p10', slot: pick(s) });
        else if ((pw.type === 11 || pw.type === 12) && pw.stage === 'pick' && s.length && others.length) {
          const tp = pick(others);
          res = act(st, i, { a: 'p' + pw.type, slot: pick(s), tp, tslot: pick(slots(st.players[tp])) });
        } else if (pw.stage === 'decide') res = act(st, i, { a: 'p12swap', yes: Math.random() < 0.5 });
        else res = act(st, i, { a: 'skip' });
      }
    }
    assert.ok(res.ok, res.error + ' ' + JSON.stringify({ phase: st.phase, step: st.step }));
    actions++;
    checkPrivacy(st, res.events);
    if (st.phase === 'play' || st.phase === 'peek') assert.equal(countCards(st), 40);
  }
  if (alone) { games++; continue; }
  assert.equal(st.phase, 'gameEnd', 'partida sin terminar');
  assert.ok(st.winner.every(w => st.players[w].total === Math.max(...active(st).map(i => st.players[i].total))));
  games++;
}

// Casos concretos
{
  const st = newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  startRound(st);
  st.phase = 'play'; st.turn = 0;
  // Puntos: el 7 vale -1
  assert.equal(value({ s: 'o', r: 7 }), -1);
  assert.equal(value({ s: 'o', r: 12 }), 12);
  // Echar: solo el primero
  st.players[0].hand = [{ s: 'o', r: 3 }, { s: 'c', r: 5 }, { s: 'e', r: 1 }, { s: 'b', r: 2 }];
  st.players[1].hand = [{ s: 'c', r: 5 }, { s: 'o', r: 4 }, { s: 'e', r: 6 }, { s: 'b', r: 7 }];
  st.players[2].hand = [{ s: 'e', r: 5 }, { s: 'o', r: 1 }, { s: 'e', r: 4 }, { s: 'b', r: 10 }];
  st.deck = [{ s: 'o', r: 5 }, { s: 'b', r: 3 }];
  act(st, 0, { a: 'draw' });
  act(st, 0, { a: 'discard' }); // tira un 3? no: roba el último del mazo (3)
  assert.equal(st.matchRank, 3);
  let r = act(st, 1, { a: 'match', slot: 0 }); // tiene un 5: se equivoca
  assert.equal(r.events.find(e => e.t === 'match').ok, false);
  assert.equal(st.players[1].hand.filter(Boolean).length, 5);
  r = act(st, 0, { a: 'match', slot: 0 }); // tiene el 3: acierta
  assert.equal(r.events.find(e => e.t === 'match').ok, true);
  assert.equal(st.players[0].hand[0], null);
  r = act(st, 2, { a: 'match', slot: 0 });
  assert.equal(r.ok, false); // ya lo echó otro
  // Cabo: los demás juegan un turno más y se puntúa
  st.turn = 1; st.step = 'draw';
  st.players[0].hand = [null, { s: 'o', r: 7 }, null, null]; // -1
  st.turn = 0;
  act(st, 0, { a: 'cabo' });
  assert.equal(st.turn, 1);
  st.deck = [{ s: 'o', r: 1 }, { s: 'c', r: 1 }];
  act(st, 1, { a: 'draw' }); act(st, 1, { a: 'discard' });
  assert.equal(st.turn, 2);
  act(st, 2, { a: 'draw' }); act(st, 2, { a: 'discard' });
  assert.equal(st.step, 'closing'); // última oportunidad para echar antes de destapar
  closeRound(st);
  assert.ok(st.phase === 'roundEnd' || st.phase === 'gameEnd');
  assert.deepEqual(st.results.winners, [0]); // tenía -1
  assert.equal(st.players[0].total, 1);
  assert.equal(act(st, 0, { a: 'take' }).ok, false); // ya no se coge del descarte
  // 12: mirar y cambiar
  const s2 = newGame([{ id: 'a' }, { id: 'b' }]);
  startRound(s2); s2.phase = 'play'; s2.turn = 0;
  s2.deck.push({ s: 'o', r: 12 });
  act(s2, 0, { a: 'draw' }); act(s2, 0, { a: 'discard' });
  assert.equal(s2.step, 'power');
  const a0 = s2.players[0].hand[0], b2 = s2.players[1].hand[2];
  r = act(s2, 0, { a: 'p12', slot: 0, tp: 1, tslot: 2 });
  assert.deepEqual(eventFor(r.events[0], 0).theirs, b2);
  assert.equal(eventFor(r.events[0], 1).theirs, undefined);
  act(s2, 0, { a: 'p12swap', yes: true });
  assert.deepEqual(s2.players[0].hand[0], b2);
  assert.deepEqual(s2.players[1].hand[2], a0);
  assert.equal(s2.turn, 1);
}

// Tu ejemplo: cambias y cae tu 5 al medio; si tienes otro 5 puedes echarlo después, una sola vez
{
  const st = newGame([{ id: 'a' }, { id: 'b' }]);
  startRound(st); st.phase = 'play'; st.turn = 0;
  st.players[0].hand = [{ s: 'o', r: 5 }, { s: 'c', r: 5 }, { s: 'e', r: 5 }, { s: 'b', r: 2 }];
  st.players[1].hand = [{ s: 'b', r: 5 }, { s: 'o', r: 1 }, { s: 'e', r: 4 }, { s: 'c', r: 3 }];
  st.deck.push({ s: 'o', r: 1 });
  act(st, 0, { a: 'draw' });
  let r = act(st, 0, { a: 'swap', slot: 0 }); // el 5 de oros va al medio (no se pueden echar dos a la vez)
  assert.equal(st.discard.at(-1).r, 5);
  assert.equal(st.players[0].hand.filter(Boolean).length, 4);
  r = act(st, 0, { a: 'match', slot: 1 }); // echa su otro 5 después
  assert.ok(r.ok && r.events[0].ok);
  assert.equal(st.players[0].hand.filter(Boolean).length, 3);
  r = act(st, 0, { a: 'match', slot: 2 }); // un tercer 5: ya no, solo una vez
  assert.equal(r.ok, false);
  r = act(st, 1, { a: 'match', slot: 0 }); // ni el rival
  assert.equal(r.ok, false);
  console.log('✓ echar tu segundo 5 después de cambiar el primero: sí, una vez; dos a la vez: no');
}

// Tu ejemplo: alguien canta Capo, eres el último, robas un 3, lo tiras y aún puedes echar tu otro 3.
// Quien canta Capo también puede echar.
{
  const st = newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  startRound(st); st.phase = 'play'; st.turn = 0;
  st.players[0].hand = [{ s: 'o', r: 6 }, { s: 'c', r: 6 }, { s: 'e', r: 2 }, { s: 'b', r: 1 }];
  st.players[2].hand = [{ s: 'b', r: 3 }, { s: 'o', r: 4 }, { s: 'e', r: 4 }, { s: 'c', r: 5 }];
  act(st, 0, { a: 'cabo' });
  st.deck.push({ s: 'o', r: 1 });
  act(st, 1, { a: 'draw' }); act(st, 1, { a: 'discard' });
  st.deck.push({ s: 'e', r: 3 });
  act(st, 2, { a: 'draw' }); act(st, 2, { a: 'discard' }); // último turno: tira el 3 robado
  assert.equal(st.step, 'closing');
  let r = act(st, 2, { a: 'match', slot: 0 }); // y echa su otro 3
  assert.ok(r.ok && r.events[0].ok, r.error);
  assert.equal(st.players[2].hand.filter(Boolean).length, 3);
  closeRound(st);
  assert.equal(st.phase, 'roundEnd');
  console.log('✓ el último en jugar puede echar su carta igual antes de destapar');

  const s2 = newGame([{ id: 'a' }, { id: 'b' }]);
  startRound(s2); s2.phase = 'play'; s2.turn = 0;
  s2.players[0].hand = [{ s: 'o', r: 6 }, { s: 'c', r: 2 }, { s: 'e', r: 2 }, { s: 'b', r: 1 }];
  act(s2, 0, { a: 'cabo' });
  s2.deck.push({ s: 'c', r: 6 });
  act(s2, 1, { a: 'draw' }); act(s2, 1, { a: 'discard' });
  r = act(s2, 0, { a: 'match', slot: 0 }); // quien cantó Capo echa su 6
  assert.ok(r.ok && r.events[0].ok, r.error);
  console.log('✓ quien canta Capo puede echar cartas');
}

// Las cartas de quien canta Capo sí se pueden cambiar con el caballo o el rey
{
  const st = newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  startRound(st); st.phase = 'play'; st.turn = 0;
  act(st, 0, { a: 'cabo' });
  assert.equal(st.turn, 1);
  st.deck.push({ s: 'o', r: 11 });
  act(st, 1, { a: 'draw' }); act(st, 1, { a: 'discard' });
  const mine = st.players[1].hand[0], his = st.players[0].hand[2];
  const r = act(st, 1, { a: 'p11', slot: 0, tp: 0, tslot: 2 });
  assert.ok(r.ok, r.error);
  assert.deepEqual(st.players[0].hand[2], mine);
  assert.deepEqual(st.players[1].hand[0], his);
  console.log('✓ a quien canta Capo le pueden cambiar cartas');
}

console.log(`Últimas oportunidades: ${closings}`);
console.log(`Se van ${leaves}, desconexiones ${aways}, se quedan solos ${alones}`);
console.log(`OK: ${games} partidas, ${rounds} rondas, ${actions} acciones, ${cabos} cabos, echadas buenas ${matchesOk} / malas ${matchesBad}`);
