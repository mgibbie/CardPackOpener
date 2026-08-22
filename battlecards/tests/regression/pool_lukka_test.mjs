// pool_lukka_test.mjs — Lukka pool redesign (R monsters: recruit -> evolve up -> big rushing beasts).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beast = { id: '_beast', name: 'B', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._x = { id: '_x', name: 'X', type: 'creature', cost: 2, attack: 2, health: 8, rarity: 'common', tribe: 'Ogre' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Lukka');
// ---- rubric ----
ok('Lukka pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/enchantment/quest/instant', types.size >= 6 && ['planeswalker', 'enchantment', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.selfScale).length >= 3, pool.filter(c => c.ongoing || c.aura || c.selfScale).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(3), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_beast', '_beast', '_beast', '_beast', '_beast', '_beast']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_beast'); const foe = put(st, 1, '_x'); let threw = null;
  const tgt = (['lukka_heartless_act', 'lukka_command', 'lukka_wildfire_beast'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'lukka_beastbonding') ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'lukka_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- talent: recurring evolve-up (transform each creature into one costing 1 more) ----
{ const st = game(); play(st, 0, 'lukka_talent', null); const b = put(st, 0, '_beast');
  E.fireOngoing(st, 0, 'turn-end');
  const survivor = st.players[0].board.find(c => c.type === 'creature');
  ok('Talent transforms your creatures into costlier ones at end of turn', survivor && survivor.uid !== b.uid, [b.uid, survivor && survivor.uid, survivor && survivor.name]); }

// ---- connection: recruit a Beast from your deck ----
{ const st = game(); const d0 = st.players[0].deck.length; const b0 = st.players[0].board.length;
  play(st, 0, 'lukka_connection', null);
  ok('Connection recruits a Beast from your deck onto the board', st.players[0].board.length === b0 + 1 && st.players[0].deck.length < d0, [d0, st.players[0].deck.length, b0, st.players[0].board.length]); }

// ---- charm Choose One (mode 1 = face) ----
{ const st = game(); const foeLife = st.players[1].life; play(st, 0, 'lukka_charm', null, 1);
  ok('Charm (face mode) deals 3 to each opponent', st.players[1].life === foeLife - 3, [foeLife, st.players[1].life]); }

// ---- vow: Beast lord (+1/+0) ----
{ const st = game(); put(st, 0, 'lukka_vow'); const b = put(st, 0, '_beast'); E.recomputeAuras(st);
  ok('Vow buffs other Beasts +1/+0', b.attack === 3, b.attack); }

// ---- monstrosity: +1 Attack per other Beast ----
{ const st = game(); const m = put(st, 0, 'lukka_monstrosity'); put(st, 0, '_beast'); put(st, 0, '_beast'); E.recomputeAuras(st);
  ok('Monstrosity scales +1 Attack per other Beast (6 -> 8)', m.attack === 8, m.attack); }

// ---- armada quest: summon 5 -> an 8/8 Beast ----
{ const st = game(); play(st, 0, 'lukka_armada', null);
  ok('Armada installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  for (let i = 0; i < 5; i++) play(st, 0, '_beast', null);
  ok('Armada reward summons an 8/8 Beast', st.players[0].board.some(c => c.name === 'Beast' && c.attack === 8), st.players[0].board.filter(c => c.name === 'Beast').map(c => c.attack)); }

// ---- flying tiger: evasive striker ----
ok('Flying Tiger is Elusive + Rush + First Strike', ['elusive', 'rush', 'first_strike'].every(k => (byId.lukka_flying_tiger.keywords || []).includes(k)));

// ---- wildfire beast: rush + burn battlecry ----
{ const st = game(); const foe = put(st, 1, '_x');
  play(st, 0, 'lukka_wildfire_beast', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Wildfire Beast battlecry deals 2 to a creature', foe.damage === 2, foe.damage); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
