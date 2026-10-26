// Reglas del Capo (el Cabo con las reglas de casa). Sin dependencias: lo usa el servidor y las pruebas.
//
// Baraja española de 40 cartas (1-7, sota 10, caballo 11, rey 12).
// - El 7 vale -1. El resto vale su número.
// - 10: miras una carta tuya.  11: cambias a ciegas una tuya por una de otro.
//   12: miras una tuya y una de otro y, si quieres, las cambias.
// - Cuando cae una carta al descarte, el primero que eche una del mismo número se la quita.
//   Si se equivoca, la carta vuelve a su sitio y roba una de castigo.
// - Al repartir, todos pulsan «Estoy listo»; tras una cuenta atrás cada uno ve sus dos cartas de abajo (huecos 1 y 3).
// - En tu turno robas del mazo (no se puede coger del descarte) o cantas «¡Capo!».
// - Tras cantar Capo los demás juegan una vuelta más. Quien menos sume gana la ronda: +1.
//   Se juega hasta que queráis; gana quien más rondas haya ganado.
// - Quien se va (o pasa mucho rato sin conexión) deja de estar en la partida: sus cartas vuelven
//   al mazo y se salta su turno. Quien está sin conexión no hace esperar a los demás para empezar.

export const SUITS = ['o', 'c', 'e', 'b']; // oros, copas, espadas, bastos
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const MAX_PLAYERS = 8;
export const DEFAULTS = {};

export const value = c => (c.r === 7 ? -1 : c.r);
export const powerOf = c => (c.r >= 10 ? c.r : 0);

function rnd(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ s, r });
  return shuffle(d);
}

export function newGame(players, settings = {}) {
  const st = {
    settings: { ...DEFAULTS, ...settings },
    phase: 'peek',
    round: 0,
    starter: rnd(players.length),
    players: players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, total: 0, hand: [], ready: false, left: false, away: false })),
    deck: [], discard: [],
    turn: 0, step: 'draw', held: null, power: null,
    caboBy: null, turnsLeft: 0, matchRank: null,
    results: null, winner: null,
  };
  return st;
}

// Reparte una ronda nueva. Devuelve los eventos.
// Jugadores que siguen en la partida
export const active = st => st.players.map((p, i) => i).filter(i => !st.players[i].left);
const nextActive = (st, from) => {
  const n = st.players.length;
  let i = from;
  for (let k = 0; k < n; k++) { i = (i + 1) % n; if (!st.players[i].left) return i; }
  return from;
};

export function startRound(st) {
  st.round++;
  st.deck = newDeck();
  st.discard = [];
  for (const p of st.players) {
    p.hand = p.left ? [] : [st.deck.pop(), st.deck.pop(), st.deck.pop(), st.deck.pop()];
    p.ready = p.left;
  }
  if (st.round > 1) st.starter = nextActive(st, st.starter);
  else if (st.players[st.starter].left) st.starter = nextActive(st, st.starter);
  st.turn = st.starter;
  st.phase = 'ready';
  st.step = 'draw';
  st.held = null; st.power = null;
  st.caboBy = null; st.turnsLeft = 0; st.matchRank = null;
  st.results = null;
  return [{ t: 'deal', round: st.round, starter: st.starter }];
}

// Cuando todos están listos: cuenta atrás y cada uno ve sus dos cartas de abajo.
function startPeek(st) {
  st.phase = 'peek';
  st.players.forEach(p => { p.ready = true; });
  const events = [{ t: 'countdown' }];
  st.players.forEach((p, pi) => {
    if (p.left) return;
    for (const slot of BOTTOM) events.push({ t: 'peek', p: pi, slot, initial: true, priv: { to: pi, card: p.hand[slot] } });
  });
  return events;
}

// Cartas de abajo (las más cercanas a cada jugador) que se enseñan al repartir.
export const BOTTOM = [1, 3];

// Termina el vistazo inicial y empieza a jugar quien sale.
export function beginPlay(st) {
  if (st.phase !== 'peek') return [];
  st.phase = 'play';
  if (st.players[st.turn].left) advance(st);
  return [{ t: 'start' }, { t: 'turn', p: st.turn }];
}

const err = msg => ({ ok: false, error: msg, events: [] });
const okEv = events => ({ ok: true, events });

function drawFromDeck(st, events) {
  if (!st.deck.length) {
    if (st.discard.length <= 1) return null;
    const top = st.discard.pop();
    st.deck = shuffle(st.discard);
    st.discard = [top];
    events.push({ t: 'reshuffle', count: st.deck.length });
  }
  return st.deck.pop();
}

function putInHand(p, card) {
  const i = p.hand.indexOf(null);
  if (i >= 0) { p.hand[i] = card; return i; }
  p.hand.push(card);
  return p.hand.length - 1;
}

function advance(st) {
  const n = st.players.length;
  for (let k = 0; k < n; k++) {
    st.turn = (st.turn + 1) % n;
    if (st.turn !== st.caboBy && !st.players[st.turn].left) return;
  }
}

// ¿Están listos todos los que siguen y tienen conexión? (los desconectados no hacen esperar)
function allReady(st) {
  const waiting = st.players.filter(p => !p.left && !p.away);
  return waiting.length > 0 && waiting.every(p => p.ready);
}
export function checkReady(st) {
  return st.phase === 'ready' && allReady(st) ? startPeek(st) : [];
}

// Conexión de un jugador (lo marca el servidor). Si estaban esperándole para empezar, ya no.
export function setAway(st, pi, away) {
  const p = st.players[pi];
  if (!p || p.left || p.away === away) return [];
  p.away = away;
  return [{ t: away ? 'away' : 'back', p: pi }, ...checkReady(st)];
}

// Un jugador se va de la partida. Devuelve { events, alone } (alone: queda menos de 2).
export function leaveGame(st, pi) {
  const p = st.players[pi];
  const events = [];
  if (!p || p.left) return { events, alone: active(st).length < 2 };
  const wasTurn = st.phase === 'play' && st.turn === pi;
  // sus cartas vuelven al fondo del mazo
  const cards = p.hand.filter(Boolean);
  if (wasTurn && st.held) cards.push(st.held.card);
  st.deck = shuffle(cards).concat(st.deck);
  p.hand = [];
  p.left = true;
  p.ready = true;
  events.push({ t: 'left', p: pi });
  if (st.caboBy === pi) { st.caboBy = null; st.turnsLeft = 0; }
  if (st.winner) st.winner = st.winner.filter(i => i !== pi);
  const alone = active(st).length < 2;
  if (alone) return { events, alone };
  if (st.phase === 'ready') events.push(...checkReady(st));
  if (st.phase === 'play') {
    if (wasTurn) {
      st.held = null;
      if (st.caboBy !== null) st.turnsLeft++; // su turno no cuenta para la vuelta final
      endTurn(st, events);
    } else if (st.step === 'power' && st.power && st.power.tp === pi) {
      // estaban mirando o cambiando una de sus cartas: se cancela
      events.push({ t: 'keep', p: st.turn });
      endTurn(st, events);
    }
    if (st.caboBy !== null && st.phase === 'play') st.turnsLeft = Math.min(st.turnsLeft, active(st).length - 1);
  }
  return { events, alone };
}

function endTurn(st, events) {
  st.step = 'draw';
  st.held = null;
  st.power = null;
  if (st.caboBy !== null) {
    st.turnsLeft--;
    if (st.turnsLeft <= 0) return endRound(st, events);
  }
  advance(st);
  events.push({ t: 'turn', p: st.turn });
}

export function handTotal(p) {
  return p.hand.reduce((a, c) => a + (c ? value(c) : 0), 0);
}

function endRound(st, events) {
  const sums = st.players.map(handTotal);
  const best = Math.min(...active(st).map(i => sums[i]));
  const winners = active(st).filter(i => sums[i] === best);
  const add = sums.map((v, i) => (winners.includes(i) ? 1 : 0));
  st.players.forEach((p, i) => { p.total += add[i]; });
  st.results = { sums, winners, add, caboBy: st.caboBy };
  st.matchRank = null;
  st.held = null; st.power = null;
  st.phase = 'roundEnd';
  events.push({ t: 'roundEnd', results: st.results, hands: st.players.map(p => p.hand), totals: st.players.map(p => p.total) });
}

// Se acaba la partida cuando lo decidís: gana quien más rondas haya ganado.
export function finishGame(st) {
  const best = Math.max(...active(st).map(i => st.players[i].total));
  st.winner = active(st).filter(i => st.players[i].total === best);
  st.phase = 'gameEnd';
  st.held = null; st.power = null; st.matchRank = null;
  return [{ t: 'gameEnd', winner: st.winner }];
}

const validSlot = (p, s) => Number.isInteger(s) && s >= 0 && s < p.hand.length && p.hand[s] !== null;

// Aplica una acción del jugador `pi` (índice). Muta st y devuelve { ok, error, events }.
export function act(st, pi, a) {
  const p = st.players[pi];
  if (!p || !a) return err('Acción no válida');
  if (p.left) return err('Ya no estás en esta partida');
  const events = [];
  const myTurn = st.turn === pi && st.phase === 'play';

  switch (a.a) {
    // --- Antes de la cuenta atrás: todos confirman que están preparados ---
    case 'ready': {
      if (st.phase !== 'ready') return err('La ronda ya ha empezado');
      p.ready = true;
      events.push({ t: 'ready', p: pi });
      events.push(...checkReady(st));
      return okEv(events);
    }
    // --- Turno: robar del mazo o cantar Capo ---
    case 'draw': {
      if (!myTurn || st.step !== 'draw') return err('Ahora no puedes robar');
      const c = drawFromDeck(st, events);
      if (!c) { endRound(st, events); return okEv(events); }
      st.held = { card: c, from: 'deck' };
      st.step = 'hold';
      events.push({ t: 'draw', p: pi, priv: { to: pi, card: c } });
      return okEv(events);
    }
    case 'cabo': {
      if (!myTurn || st.step !== 'draw') return err('Solo puedes cantar Capo al empezar tu turno');
      if (st.caboBy !== null) return err('Ya se ha cantado Capo');
      st.caboBy = pi;
      st.turnsLeft = active(st).length - 1;
      events.push({ t: 'cabo', p: pi });
      if (st.turnsLeft <= 0) { endRound(st, events); return okEv(events); }
      advance(st);
      events.push({ t: 'turn', p: st.turn });
      return okEv(events);
    }

    // --- Con la carta en la mano: cambiarla por una tuya o tirarla ---
    case 'swap': {
      if (!myTurn || st.step !== 'hold') return err('No tienes ninguna carta en la mano');
      if (!validSlot(p, a.slot)) return err('Elige una de tus cartas');
      const out = p.hand[a.slot];
      const inc = st.held.card;
      const from = st.held.from;
      p.hand[a.slot] = inc;
      st.discard.push(out);
      st.matchRank = out.r;
      events.push({ t: 'swap', p: pi, slot: a.slot, out, from, ...(from === 'discard' ? { inc } : { priv: { to: pi, inc } }) });
      endTurn(st, events);
      return okEv(events);
    }
    case 'discard': {
      if (!myTurn || st.step !== 'hold') return err('No tienes ninguna carta en la mano');
      if (st.held.from !== 'deck') return err('La carta del descarte tienes que cambiarla por una tuya');
      const c = st.held.card;
      st.held = null;
      st.discard.push(c);
      st.matchRank = c.r;
      events.push({ t: 'discard', p: pi, card: c });
      const pw = powerOf(c);
      if (pw) {
        st.step = 'power';
        st.power = { type: pw, stage: 'pick', own: null, tp: null, tslot: null };
        events.push({ t: 'power', p: pi, type: pw });
      } else {
        endTurn(st, events);
      }
      return okEv(events);
    }

    // --- Poderes ---
    case 'skip': {
      if (!myTurn || st.step !== 'power') return err('No tienes ningún poder pendiente');
      events.push({ t: 'skipPower', p: pi });
      endTurn(st, events);
      return okEv(events);
    }
    case 'p10': {
      if (!myTurn || st.step !== 'power' || st.power.type !== 10) return err('No puedes mirar ahora');
      if (!validSlot(p, a.slot)) return err('Elige una de tus cartas');
      // El turno no pasa hasta que termina de mirarla (lo cierra él o el servidor a los pocos segundos)
      st.power = { type: 10, stage: 'seeing', own: a.slot, tp: null, tslot: null };
      events.push({ t: 'peek', p: pi, slot: a.slot, priv: { to: pi, card: p.hand[a.slot] } });
      return okEv(events);
    }
    case 'done': {
      if (!myTurn || st.step !== 'power' || st.power.stage !== 'seeing') return err('No estás mirando ninguna carta');
      endTurn(st, events);
      return okEv(events);
    }
    case 'p11':
    case 'p12': {
      const type = a.a === 'p11' ? 11 : 12;
      if (!myTurn || st.step !== 'power' || st.power.type !== type || st.power.stage !== 'pick') return err('No puedes hacer eso ahora');
      if (!validSlot(p, a.slot)) return err('Elige una de tus cartas');
      const tp = a.tp, q = st.players[tp];
      if (!q || tp === pi || q.left) return err('Elige una carta de otro jugador');
      if (tp === st.caboBy) return err('Las cartas de quien ha cantado Capo no se tocan');
      if (!validSlot(q, a.tslot)) return err('Esa carta no existe');
      if (type === 11) {
        [p.hand[a.slot], q.hand[a.tslot]] = [q.hand[a.tslot], p.hand[a.slot]];
        events.push({ t: 'exchange', p: pi, slot: a.slot, tp, tslot: a.tslot, blind: true });
        endTurn(st, events);
      } else {
        st.power = { type, stage: 'decide', own: a.slot, tp, tslot: a.tslot };
        events.push({ t: 'look', p: pi, slot: a.slot, tp, tslot: a.tslot, priv: { to: pi, mine: p.hand[a.slot], theirs: q.hand[a.tslot] } });
      }
      return okEv(events);
    }
    case 'p12swap': {
      if (!myTurn || st.step !== 'power' || st.power.type !== 12 || st.power.stage !== 'decide') return err('No puedes hacer eso ahora');
      const { own, tp, tslot } = st.power;
      const q = st.players[tp];
      if (a.yes && validSlot(p, own) && validSlot(q, tslot)) {
        [p.hand[own], q.hand[tslot]] = [q.hand[tslot], p.hand[own]];
        events.push({ t: 'exchange', p: pi, slot: own, tp, tslot, blind: false });
      } else {
        events.push({ t: 'keep', p: pi });
      }
      endTurn(st, events);
      return okEv(events);
    }

    // --- Echar una carta igual a la del descarte (cualquiera, el más rápido) ---
    case 'match': {
      if (st.phase !== 'play') return err('Ahora no se puede echar');
      if (pi === st.caboBy) return err('Has cantado Capo: tus cartas ya no se mueven');
      if (st.matchRank === null) return err('Llegas tarde: ya lo ha echado otro');
      if (!validSlot(p, a.slot)) return err('Esa carta no existe');
      const c = p.hand[a.slot];
      if (c.r === st.matchRank) {
        p.hand[a.slot] = null;
        st.discard.push(c);
        st.matchRank = null;
        events.push({ t: 'match', p: pi, slot: a.slot, card: c, ok: true });
      } else {
        const pen = drawFromDeck(st, events);
        let pslot = null;
        if (pen) pslot = putInHand(p, pen);
        events.push({ t: 'match', p: pi, slot: a.slot, card: c, ok: false, pslot });
      }
      return okEv(events);
    }

    // --- Recolocar tus cartas (los demás ven que las mueves) ---
    case 'move': {
      if (st.phase !== 'play') return err('Ahora no puedes mover cartas');
      if (myTurn && st.step === 'power') return err('Termina primero el poder');
      const { from, to } = a;
      const ok = i => Number.isInteger(i) && i >= 0 && i < p.hand.length;
      if (!ok(from) || !ok(to) || from === to) return err('Movimiento no válido');
      [p.hand[from], p.hand[to]] = [p.hand[to], p.hand[from]];
      events.push({ t: 'move', p: pi, from, to });
      return okEv(events);
    }

    // --- El anfitrión salta el turno de alguien que no responde ---
    case 'forceSkip': {
      if (st.phase === 'ready') return okEv(startPeek(st));
      if (st.phase === 'peek') return okEv(beginPlay(st));
      if (st.phase !== 'play') return err('No hay turno que saltar');
      if (st.step === 'hold') {
        st.discard.push(st.held.card);
        st.matchRank = st.held.card.r;
        events.push({ t: 'discard', p: st.turn, card: st.held.card });
      }
      events.push({ t: 'skipped', p: st.turn });
      endTurn(st, events);
      return okEv(events);
    }
  }
  return err('Acción desconocida');
}

// Lo que ve el jugador `pi`: nunca incluye cartas ocultas.
export function viewFor(st, pi) {
  const reveal = st.phase === 'roundEnd' || st.phase === 'gameEnd';
  return {
    phase: st.phase,
    round: st.round,
    settings: st.settings,
    me: pi,
    turn: st.turn,
    step: st.step,
    players: st.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color, total: p.total, ready: p.ready, left: p.left, away: p.away,
      hand: p.hand.map(c => (c ? (reveal ? c : 1) : 0)),
    })),
    deckCount: st.deck.length,
    discard: st.discard.slice(-3),
    held: st.held ? { from: st.held.from, card: st.held.from === 'discard' || st.turn === pi ? st.held.card : null } : null,
    power: st.power,
    caboBy: st.caboBy,
    turnsLeft: st.turnsLeft,
    matchRank: st.matchRank,
    results: st.results,
    winner: st.winner,
  };
}

// Quita de un evento lo que no debe saber el jugador `pi`.
export function eventFor(ev, pi) {
  if (!ev.priv) return ev;
  const { priv, ...rest } = ev;
  if (priv.to !== pi) return rest;
  const { to, ...data } = priv;
  return { ...rest, ...data };
}
