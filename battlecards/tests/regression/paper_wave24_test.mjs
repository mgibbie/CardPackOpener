// paper_wave24_test.mjs — Triton (targeted-by-spell draw, from either side), Lincale
// (Battlecry Dredge+buff, Ponder tutor Aura, Council heal), Doomstar Ulka keywords.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { firePonder } from '../../engine/core.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._zap = { id: '_zap', name: 'Zap', type: 'sorcery', cost: 1, tribe: 'Fire', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'creature' }] };
byId._aura = { id: '_aura', name: 'Aura', type: 'enchantment', cost: 2, rarity: 'common', description: 'x', aura: { attack: 1, health: 1 } };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['triton_fortune_hunter', 'lincale_calm_researcher', 'doomstar_ulka'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(24), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const cast = (st, pi, id, tgtUid, tgtPl) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, { type: 'creature', uid: tgtUid, player: tgtPl }); };

// Triton — targeting it with a spell (even the enemy's) draws you a card
{ const st = game(); st.players[0].deck = ['_v', '_v']; const tri = put(st, 0, 'triton_fortune_hunter'); const h0 = st.players[0].hand.length;
  st.current = 1; cast(st, 1, '_zap', tri.uid, 0); // the OPPONENT zaps Triton
  ok('Triton draws when the opponent targets it with a spell', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }
{ const st = game(); const foe = put(st, 1, '_v'); st.players[0].deck = ['_v']; const h0 = st.players[0].hand.length;
  cast(st, 0, '_zap', foe.uid, 1); // a spell NOT targeting Triton
  ok('no draw when a spell targets a non-Triton creature', st.players[0].hand.length === h0, st.players[0].hand.length); }

// Lincale — Battlecry: Dredge & a creature gains +2/+2
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v']; const ally = put(st, 0, '_v');
  const lin = toHand(st, 0, 'lincale_calm_researcher'); E.playCard(st, 0, lin.uid, { type: 'creature', uid: ally.uid, player: 0 });
  ok('Lincale Battlecry buffs a creature +2/+2', ally.attack === 4 && ally.maxHealth === 8, [ally.attack, ally.maxHealth]);
  ok('Lincale Battlecry Dredges (queues a dredge pick)', st.dredgeQueue.length > 0, st.dredgeQueue.length); }
// Lincale — Ponder: tutor an Aura from your deck
{ const st = game(); put(st, 0, 'lincale_calm_researcher'); st.players[0].deck = ['_v', '_aura', '_v'];
  st.players[0].drawsThisTurn = 2; firePonder(st, 0, {});
  ok('Lincale Ponder tutors an Aura (enchantment) to hand', st.players[0].hand.some(c => c.id === '_aura'), st.players[0].hand.map(c => c.id)); }
// Lincale — Council: gain 10 Life
{ const st = game(); put(st, 0, 'lincale_calm_researcher'); st.players[0].life = 20;
  fireOngoing(st, 0, 'council', {});
  ok('Lincale Council gains 10 Life', st.players[0].life === 30, st.players[0].life); }

// Doomstar Ulka — Rush & Static
{ ok('Doomstar Ulka has Rush & Static', byId.doomstar_ulka.keywords.includes('rush') && byId.doomstar_ulka.keywords.includes('static')); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_aura', '_v']; put(st, 0, '_v'); put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: st.players[0].board[0].uid, player: 0 }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
