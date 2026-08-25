// scry_order_test.mjs — "Scry N, then draw" must resolve the SCRY before the draw.
// The scry pulls the top card into an async decision (scryQueue); the draw (and any later effect) must
// wait for resolveScry, so the draw pulls the card you KEPT on top — not the one beneath it.
// Reported via Palantír of Orthanc (me_aragorn_palantir: {T}: Scry 1, then draw a card).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
// three DISTINCT real card ids so we can tell which one got drawn
const [A, B, C] = raw.cards.filter(c => c.type === 'creature' && c.collectible !== false).slice(0, 3).map(c => c.id);
const handIds = st => st.players[0].hand.map(c => c.id);

function game(deckTopLast) {
  const st = E.createGame(byId, seededRng(4), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  st.players[0].deck = [...deckTopLast]; // deck.pop() draws the top -> top card is the LAST element
  return st;
}

// ── keep the scried card on top → the draw pulls THAT card ──
{ const st = game([C, B, A]); // A is on top
  E.execEffects(st, 0, [{ type: 'scry', value: 1 }, { type: 'draw', value: 1 }], null, null);
  ok('a scry queues an async decision', st.scryQueue.length === 1, st.scryQueue.length);
  ok('the draw is DEFERRED (no card drawn yet)', handIds(st).length === 0, handIds(st));
  E.resolveScry(st, [{ id: A, bottom: false }]); // keep A on top
  ok('after resolving (kept on top), the draw pulls the scried card A', handIds(st).join() === A, handIds(st));
  ok('scry queue emptied', st.scryQueue.length === 0);
  ok('state valid', validateGameState(st).length === 0); }

// ── bottom the scried card → the draw pulls the NEXT card down ──
{ const st = game([C, B, A]);
  E.execEffects(st, 0, [{ type: 'scry', value: 1 }, { type: 'draw', value: 1 }], null, null);
  E.resolveScry(st, [{ id: A, bottom: true }]); // send A to the bottom
  ok('after bottoming, the draw pulls the next card B (A went to the bottom)', handIds(st).join() === B, handIds(st));
  ok('A is now on the bottom of the deck', st.players[0].deck[0] === A, st.players[0].deck); }

// ── the actual card: Palantír of Orthanc tapAbility ──
{ const st = game([C, B, A]);
  const eff = byId['me_aragorn_palantir'].tapAbility.effects; // [{scry 1},{draw 1}]
  E.execEffects(st, 0, eff, null, null);
  ok('Palantír: scry pending, draw deferred', st.scryQueue.length === 1 && handIds(st).length === 0);
  E.resolveScry(st, [{ id: A, bottom: false }]);
  ok('Palantír: keeping the top card draws it', handIds(st).join() === A, handIds(st)); }

// ── deferral only kicks in when scry actually queues (empty deck = no scry, draw runs normally) ──
{ const st = game([A]); // 1 card
  E.execEffects(st, 0, [{ type: 'scry', value: 1 }, { type: 'draw', value: 1 }], null, null);
  // scry pops A into the queue; the draw is deferred; resolve keeps A -> draw A
  ok('single-card deck: still deferred + correct', st.scryQueue.length === 1, st.scryQueue.length);
  E.resolveScry(st, [{ id: A, bottom: false }]);
  ok('single-card deck draws the kept card', handIds(st).join() === A, handIds(st)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
