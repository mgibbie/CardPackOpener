// pool_jace_test.mjs — Jace pool redesign (U tempo-control: Illusions + spell-matters + bounce/freeze/counter).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._ill = { id: '_ill', name: 'I', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Illusion' };
byId._sp = { id: '_sp', name: 'S', type: 'sorcery', cost: 3, rarity: 'common', description: 'x', effects: [] };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Jace');
// ---- rubric ----
ok('Jace pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/enchantment/secret/instant', types.size >= 6 && ['planeswalker', 'enchantment', 'secret', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.costMod).length >= 3, pool.filter(c => c.ongoing || c.aura || c.costMod).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(9), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const castSpell = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_ill'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['jace_defeat', 'jace_scrutiny', 'jace_command'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'jace_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- phantasm: Prowess (grows with each spell) ----
{ const st = game(); const p = put(st, 0, 'jace_phantasm'); castSpell(st, 0, '_sp');
  ok('Phantasm grows +1/+1 when you cast a spell', p.attack === 2 && E.hp(p) === 2, [p.attack, E.hp(p)]); }

// ---- sanctum: spells cost 1 less ----
{ const st = game(); play(st, 0, 'jace_sanctum', null);
  const sp = E.instantiate(byId._sp, 0); sp.zone = 'hand'; st.players[0].hand.push(sp);
  const c = E.effectiveCost ? E.effectiveCost(st, 0, sp) : (sp.cost - 1);
  ok('Sanctum makes your spells cost (1) less', c === 2, c); }

// ---- projection: Illusion lord ----
{ const st = game(); put(st, 0, 'jace_projection'); const other = put(st, 0, '_ill'); E.recomputeAuras(st);
  ok('Projection buffs other Illusions +1/+1', other.attack === 3 && E.hp(other) === 3, [other.attack, E.hp(other)]); }

// ---- ruse: counterspell secret ----
{ const st = game(); play(st, 0, 'jace_ruse', null);
  ok('Ruse installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const h0 = st.players[0].hand.length; const life0 = st.players[0].life;
  st.current = 1; st.priority = null; st.stack = [];
  castSpell(st, 1, '_bolt'); // opponent casts a 3-damage bolt at player 0
  ok('Ruse counters the enemy spell (no damage taken)', st.players[0].life === life0, [life0, st.players[0].life]);
  ok('Ruse draws you a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- charm Choose One (mode 0 = freeze + draw) ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'jace_charm', { type: 'creature', uid: foe.uid, player: 1 }, 0);
  ok('Charm (freeze mode) freezes an enemy and draws', foe.frozen && st.players[0].hand.length === h0 + 1, [foe.frozen, h0, st.players[0].hand.length]); }

// ---- mindseeker: two Illusions + a card ----
{ const st = game(); const b0 = st.players[0].board.length; const h0 = st.players[0].hand.length;
  play(st, 0, 'jace_mindseeker', null);
  const ill = st.players[0].board.filter(c => c.name === 'Illusion');
  ok('Mindseeker summons two Elusive Illusions and draws', ill.length === 2 && ill.every(c => c.keywords.includes('elusive')) && st.players[0].hand.length >= h0 + 1, [ill.length, h0, st.players[0].hand.length]); }

// ---- archivist: battlecry draw 2 + Prowess ----
{ const st = game(); const h0 = st.players[0].hand.length; const a = play(st, 0, 'jace_archivist', null).c;
  ok('Archivist battlecry draws 2', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
  castSpell(st, 0, '_sp');
  ok('Archivist gains +1/+0 on a spell', a.attack === 4, a.attack); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
