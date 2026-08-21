// paper_wave31_test.mjs — Cirdan (Castellan + Elusive + Battlecry/Swing each-player-draw) and
// Galea (Castellan). Both data-only via aura.position:'ends' + draw-all.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['cirdan_the_shipwright', 'galea_kindler_of_hope'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
  ok(`${id} has Castellan (aura position ends -> Taunt)`, c.aura && c.aura.position === 'ends' && (c.aura.keywords || []).includes('taunt'));
}

function game() {
  const st = E.createGame(byId, seededRng(31), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Cirdan — Battlecry: each player draws a card
{ const st = game(); const c = toHand(st, 0, 'cirdan_the_shipwright'); const h0 = [st.players[0].hand.length, st.players[1].hand.length];
  E.playCard(st, 0, c.uid, null);
  // player 0 played Cirdan (-1) then drew (+1) -> net 0 from the post-add baseline; player 1 drew (+1)
  ok('Cirdan Battlecry: both players draw a card', st.players[0].hand.length === h0[0] && st.players[1].hand.length === h0[1] + 1, [st.players[0].hand.length, st.players[1].hand.length, h0]); }
// Cirdan — Swing (self-attacks) also draws for each player
{ const st = game(); const cir = put(st, 0, 'cirdan_the_shipwright'); cir.sick = false;
  const h0 = [st.players[0].hand.length, st.players[1].hand.length];
  E.attack(st, 0, cir.uid, { type: 'hero', player: 1 });
  ok('Cirdan Swing: both players draw a card', st.players[0].hand.length === h0[0] + 1 && st.players[1].hand.length === h0[1] + 1, [st.players[0].hand.length, st.players[1].hand.length]); }

// Castellan — an end creature (leftmost/rightmost) gains Taunt from the aura; a middle one does not
{ const st = game(); const left = put(st, 0, '_v'); const mid = put(st, 0, '_v'); put(st, 0, 'galea_kindler_of_hope'); // galea rightmost
  E.recomputeAuras(st);
  ok('Castellan gives the leftmost creature Taunt', left.keywords.includes('taunt'), left.keywords);
  ok('Castellan does NOT give a middle creature Taunt', !mid.keywords.includes('taunt'), mid.keywords); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); put(st, 0, '_v'); put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
