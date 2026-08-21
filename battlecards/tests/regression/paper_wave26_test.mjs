// paper_wave26_test.mjs — Millicent (costReducePerTribe + Spirit tokens on death/hit),
// Saloon Owner (activated buff), Dunbarrow Revivalist (Deathrattle return an Aura).
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._spirit = { id: '_spirit', name: 'Sp', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Spirit' };
byId._aura = { id: '_aura', name: 'Aura', type: 'enchantment', cost: 3, rarity: 'common', aura: { attack: 1, health: 1 } };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['millicent_restless_revenant', 'saloon_owner', 'dunbarrow_revivalist'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(26), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const grave = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'graveyard'; st.players[pi].graveyard.push(c); return c; };

// Millicent — costs (1) less per Spirit you control
{ const st = game(); put(st, 0, '_spirit'); put(st, 0, '_spirit'); const mil = toHand(st, 0, 'millicent_restless_revenant');
  ok('Millicent costs 1 less per Spirit (7 - 2 = 5)', E.effectiveCost(st, 0, mil) === 5, E.effectiveCost(st, 0, mil));
  ok('Millicent has Windfury', mil.keywords.includes('windfury')); }
// Millicent — a Spirit dying makes a 1/1 Spirit token
{ const st = game(); put(st, 0, 'millicent_restless_revenant'); const sp = put(st, 0, '_spirit');
  sp.damage = sp.maxHealth; E.sweepDeaths(st);
  ok('Millicent makes a Spirit token when a Spirit dies', st.players[0].board.filter(c => c.name === 'Spirit' && c.token).length >= 1, st.players[0].board.map(c => c.name)); }
// Millicent — dealing combat damage to a player makes a Spirit token
{ const st = game(); const mil = put(st, 0, 'millicent_restless_revenant'); mil.sick = false;
  const before = st.players[0].board.filter(c => c.name === 'Spirit').length;
  E.attack(st, 0, mil.uid, { type: 'hero', player: 1 });
  ok('Millicent makes a Spirit token when it hits a player', st.players[0].board.filter(c => c.name === 'Spirit').length > before, st.players[0].board.map(c => c.name)); }

// Saloon Owner — activated: give a creature +2/+4
{ const st = game(); const so = put(st, 0, 'saloon_owner'); const t = put(st, 0, '_v'); st.players[0].mana = { cur: 5, max: 5, bonus: 0 };
  const okA = E.activateAbility(st, 0, so.uid, 0, { type: 'creature', uid: t.uid, player: 0 });
  ok('Saloon Owner activated gives +2/+4', okA && t.attack === 4 && t.maxHealth === 6, [okA, t.attack, t.maxHealth]); }

// Dunbarrow Revivalist — Deathrattle returns an Aura (enchantment) from your graveyard
{ const st = game(); grave(st, 0, '_aura'); const dr = put(st, 0, 'dunbarrow_revivalist');
  runDeathrattle(st, 0, dr);
  ok('Dunbarrow Deathrattle returns an Aura to hand', st.players[0].hand.some(c => c.id === '_aura'), st.players[0].hand.map(c => c.id)); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; grave(st, 0, '_aura'); put(st, 0, '_v'); put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
