// Auditoría de las manos: sigue cada carta de cada jugador durante miles de jugadas al azar y comprueba
// que una carta solo cambia de sitio o de dueño cuando una acción lo permite.
//   - robar, tirar, cantar Capo, pasar, mirar (sota), el rey al mirar, listo…: no tocan ninguna mano
//   - cambiar (swap): solo el hueco elegido del que juega, y entra justo la carta que tenía en la mano
//   - echar: acierto = el hueco queda vacío; fallo = la carta vuelve y entra una más; nada más cambia
//   - mover: solo dos huecos del que mueve, intercambiados
//   - caballo: justo las dos cartas elegidas cambian entre sí
//   - rey (decidir): justo las dos cartas QUE SE VIERON cambian entre sí (aunque su dueño las haya movido mientras tanto)
import assert from 'node:assert/strict';
import { newGame, startRound, beginPlay, closeRound, act, leaveGame, active } from '../src/engine.js';

const id = c => (c ? c.s + c.r : '.');
const snap = st => st.players.map(p => p.hand.map(id));
const pick = a => a[Math.floor(Math.random() * a.length)];
const slots = p => p.hand.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

const NO_HANDS = new Set(['draw', 'discard', 'cabo', 'skip', 'done', 'p10', 'p12', 'forceSkip']);
let acts = 0, moves = 0, rey = 0, reyMovidas = 0, caballos = 0, fallos = 0;

function unique(st) {
  const all = [...st.deck.map(id), ...st.discard.map(id), ...(st.held ? [id(st.held.card)] : []), ...st.players.flatMap(p => p.hand.filter(Boolean).map(id))];
  assert.equal(all.length, 40, 'se han perdido o duplicado cartas');
  assert.equal(new Set(all).size, 40, 'hay una carta repetida');
}

function check(st, before, pi, a, res, seen) {
  const after = snap(st);
  const actor = pi;
  const changed = st.players.map((_, i) => i).filter(i => !same(before[i], after[i]));
  const fail = msg => { throw new Error(`${msg}\n acción ${JSON.stringify(a)} de ${pi}\n antes ${JSON.stringify(before)}\n después ${JSON.stringify(after)}`); };
  if (NO_HANDS.has(a.a) || a.a === 'ready') { if (changed.length) fail('una acción que no debe tocar manos las ha tocado'); return; }
  if (a.a === 'swap') {
    const held = seen.held;
    if (changed.some(i => i !== actor)) fail('cambio de carta tocó la mano de otro');
    const h = after[actor].filter((c, i) => c !== before[actor][i]);
    if (h.length !== 1 || after[actor][a.slot] !== held) fail('swap: no ha entrado justo la carta de la mano en el hueco elegido');
    return;
  }
  if (a.a === 'move') {
    if (changed.some(i => i !== actor)) fail('mover tocó la mano de otro');
    const b = before[actor].slice(); [b[a.from], b[a.to]] = [b[a.to], b[a.from]];
    if (!same(b, after[actor])) fail('mover no ha intercambiado justo los dos huecos');
    moves++; return;
  }
  if (a.a === 'match') {
    if (changed.some(i => i !== actor)) fail('echar tocó la mano de otro');
    const ev = res.events.find(e => e.t === 'match');
    if (ev.ok) { const b = before[actor].slice(); b[a.slot] = '.'; if (!same(b, after[actor])) fail('echar bien: debe quedar solo ese hueco vacío'); }
    else {
      fallos++;
      const keep = before[actor].every((c, i) => c === after[actor][i] || c === '.'); // lo que había sigue igual (puede llenarse un hueco)
      const sinCastigo = ev.pslot === null; // sin cartas que robar no hay castigo
      if (!keep || after[actor].filter(c => c !== '.').length !== before[actor].filter(c => c !== '.').length + (sinCastigo ? 0 : 1)) fail('echar mal: la carta debe volver y entrar solo una más');
    }
    return;
  }
  if (a.a === 'p11') {
    if (changed.some(i => i !== actor && i !== a.tp)) fail('caballo tocó una mano que no era');
    const b = before.map(h => h.slice()); [b[actor][a.slot], b[a.tp][a.tslot]] = [b[a.tp][a.tslot], b[actor][a.slot]];
    if (!same(b, after)) fail('caballo: no se han intercambiado justo las dos cartas elegidas');
    caballos++; return;
  }
  if (a.a === 'p12swap') {
    const { mine, theirs, tp } = seen.rey;
    rey++;
    const cancelado = res.events.some(e => e.t === 'keep');
    if (!a.yes || cancelado) { // sin cambio (o la carta vista ya no estaba: alguien la echó)
      if (changed.length) fail('rey sin cambiar tocó manos');
      if (a.yes && cancelado) { const nov = st.players[seen.rey.tp].hand.map(id).includes(seen.rey.theirs) && st.players[actor].hand.map(id).includes(seen.rey.mine); if (nov) fail('se canceló el cambio con las dos cartas aún en su sitio'); }
      return;
    }
    if (!after[actor].includes(theirs) || !after[tp].includes(mine) || after[actor].includes(mine) || after[tp].includes(theirs)) fail('REY: se han cambiado cartas distintas de las que se vieron');
    return;
  }
  fail('acción sin comprobar: ' + a.a);
}

for (let g = 0; g < 600; g++) {
  const n = 2 + (g % 7);
  const st = newGame(Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'J' + i })));
  startRound(st);
  let guard = 0;
  const seen = {};
  while (st.phase !== 'gameEnd' && guard++ < 6000) {
    unique(st);
    if (st.phase === 'roundEnd') { if (st.round >= 3) break; startRound(st); continue; }
    if (st.phase === 'ready') { for (let i = 0; i < n; i++) act(st, i, { a: 'ready' }); continue; }
    if (st.phase === 'peek') { beginPlay(st); continue; }
    let before = snap(st);
    let pi, a;
    const r = Math.random();
    const cur = st.turn;
    if (st.step === 'closing') { closeRound(st); continue; }
    if (r < 0.14) { // cualquiera recoloca sus cartas, también fuera de turno
      pi = pick(active(st)); const s = st.players[pi].hand.length;
      if (s < 2) continue; a = { a: 'move', from: Math.floor(Math.random() * s), to: Math.floor(Math.random() * s) };
    } else if (r < 0.2 && st.matchRank !== null) {
      pi = pick(active(st)); const sl = slots(st.players[pi]); if (!sl.length) continue; a = { a: 'match', slot: pick(sl) };
    } else {
      pi = cur; const p = st.players[pi]; const sl = slots(p);
      if (st.step === 'draw') a = st.caboBy === null && Math.random() < 0.03 ? { a: 'cabo' } : { a: 'draw' };
      else if (st.step === 'hold') { if (sl.length && Math.random() < 0.5) { a = { a: 'swap', slot: pick(sl) }; seen.held = id(st.held.card); } else a = { a: 'discard' }; }
      else if (st.step === 'power') {
        const pw = st.power;
        const others = active(st).filter(i => i !== pi && slots(st.players[i]).length);
        if (pw.type === 10) a = pw.stage === 'seeing' ? { a: 'done' } : (sl.length ? { a: 'p10', slot: pick(sl) } : { a: 'skip' });
        else if (pw.stage === 'decide') {
          // entre mirar y decidir, el dueño de la carta puede recolocar sus cartas
          const q = st.players[pw.tp];
          if (Math.random() < 0.7 && q.hand.length > 1) {
            const b0 = snap(st); const res0 = act(st, pw.tp, { a: 'move', from: 0, to: q.hand.length - 1 }); if (res0.ok) { check(st, b0, pw.tp, { a: 'move', from: 0, to: q.hand.length - 1 }, res0, seen); reyMovidas++; }
          }
          before = snap(st); // foto justo antes de decidir
          a = { a: 'p12swap', yes: Math.random() < 0.7 };
        } else if (sl.length && others.length) { const tp = pick(others); a = { a: 'p' + pw.type, slot: pick(sl), tp, tslot: pick(slots(st.players[tp])) }; }
        else a = { a: 'skip' };
      }
    }
    if (!a) continue;
    const res = act(st, pi, a);
    if (!res.ok) continue;
    acts++;
    const look = res.events.find(e => e.t === 'look');
    if (look) seen.rey = { mine: id(look.priv.mine), theirs: id(look.priv.theirs), tp: look.tp };
    if (a.a !== 'p12') check(st, before, pi, a, res, seen);
    else if (snap(st).some((h, i) => !same(h, before[i]))) throw new Error('mirar con el rey cambió manos');
  }
}
console.log(`OK auditoría de manos: ${acts} acciones; mover ${moves}, caballos ${caballos}, reyes ${rey} (con las cartas recolocadas entre mirar y decidir: ${reyMovidas}), echadas falladas ${fallos}`);
