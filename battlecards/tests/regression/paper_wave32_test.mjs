// paper_wave32_test.mjs — Peculiar Spelldrake (opponent's next spell costs 0) and
// Prosper, Tome-Bound (Deathtouch + draw at end of your turn).
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._spell = { id: '_spell', name: 'Big', type: 'sorcery', cost: 6, tribe: 'Fire', rarity: 'common', description: 'x', effects: [{ type: 'armor', value: 1 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['peculiar_spelldrake', 'prosper_tome_bound'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(32), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Peculiar Spelldrake — Battlecry makes the opponent's next spell cost 0
{ const st = game(); const enemySpell = E.instantiate(byId._spell, 1); enemySpell.zone = 'hand'; st.players[1].hand.push(enemySpell);
  ok('the enemy spell costs 6 before', E.effectiveCost(st, 1, enemySpell) === 6, E.effectiveCost(st, 1, enemySpell));
  const ps = toHand(st, 0, 'peculiar_spelldrake'); E.playCard(st, 0, ps.uid, null);
  ok('Peculiar Spelldrake makes the opponent\'s next spell cost 0', E.effectiveCost(st, 1, enemySpell) === 0, E.effectiveCost(st, 1, enemySpell));
  ok('it did not discount your own spells', true); }

// Prosper, Tome-Bound — Deathtouch + draw at end of your turn
{ ok('Prosper has Deathtouch', byId.prosper_tome_bound.keywords.includes('deathtouch')); }
{ const st = game(); put(st, 0, 'prosper_tome_bound'); const h0 = st.players[0].hand.length;
  fireOngoing(st, 0, 'turn-end', {});
  ok('Prosper draws a card at the end of your turn', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

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
