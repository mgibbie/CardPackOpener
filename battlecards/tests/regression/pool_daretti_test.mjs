// pool_daretti_test.mjs — Daretti pool redesign (R artifact/goblin aristocrats + burn).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common', tribe: 'Beast' };
byId._gob = { id: '_gob', name: 'G', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Goblin' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Daretti');
// ---- rubric ----
ok('Daretti pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/artifact/weapon/enchantment/instant', types.size >= 6 && ['planeswalker', 'artifact', 'weapon', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.tapAbility).length >= 3, pool.filter(c => c.ongoing || c.aura || c.tapAbility).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(6), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const kill = (st, c) => { c.damage = c.maxHealth; c.shield = false; E.sweepDeaths(st); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_gob'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['daretti_rocket_turret', 'daretti_command', 'daretti_deadly_derision'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'daretti_tripwire') ? { type: 'hero', player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'daretti_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- workshop: aristocrats burn on a friendly death ----
{ const st = game(); play(st, 0, 'daretti_workshop', null); const fodder = put(st, 0, '_gob'); put(st, 1, '_v'); const foeLife = st.players[1].life;
  kill(st, fodder);
  const dealt = st.players[1].life < foeLife || st.players[1].board.some(c => c.damage > 0);
  ok('Workshop deals 1 to a random enemy when a friendly dies', dealt, [foeLife, st.players[1].life]); }

// ---- cluestone artifact: tap to deal 2 to any target ----
{ const st = game(); const cs = putArt(st, 0, 'daretti_cluestone'); const foe = put(st, 1, '_v');
  const okTap = E.tapArtifact(st, 0, cs.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Cluestone taps to deal 2 to a creature', okTap && foe.damage === 2, [okTap, foe.damage]); }

// ---- cogwork deathrattle: dies -> 2 to a random enemy ----
{ const st = game(); const cog = put(st, 0, 'daretti_cogwork_machine'); put(st, 1, '_v'); const foeLife = st.players[1].life;
  kill(st, cog);
  const dealt = st.players[1].life < foeLife || st.players[1].board.some(c => c.damage > 0);
  ok('Cogwork Machine deathrattle deals 2 to a random enemy', dealt); }

// ---- goblin alliance: lord + battlecry swarm ----
{ const st = game(); put(st, 0, 'daretti_goblin_alliance'); const g = put(st, 0, '_gob'); E.recomputeAuras(st);
  ok('Goblin Alliance buffs other Goblins +1/+0', g.attack === 2, g.attack); }
{ const st = game(); const b0 = st.players[0].board.length; play(st, 0, 'daretti_goblin_alliance', null);
  ok('Goblin Alliance battlecry summons two Goblins', st.players[0].board.filter(c => c.name === 'Goblin').length === 2, st.players[0].board.map(c => c.name)); }

// ---- exoskeleton weapon: hero attack -> a Goblin ----
{ const st = game(); play(st, 0, 'daretti_darksteel_exoskeleton', null);
  const w = st.players[0].weapon; ok('Exoskeleton equips (3/2)', w && w.attack === 3 && w.durability === 2, w && [w.attack, w.durability]);
  const b0 = st.players[0].board.length; E.fireOngoing(st, 0, 'hero-attacks');
  ok('Exoskeleton makes a Goblin after the hero attacks', st.players[0].board.some(c => c.name === 'Goblin') && st.players[0].board.length === b0 + 1, st.players[0].board.map(c => c.name)); }

// ---- charm Choose One (mode 1 = face burn) ----
{ const st = game(); const foeLife = st.players[1].life; play(st, 0, 'daretti_charm', null, 1);
  ok('Charm (face mode) deals 3 to each opponent', st.players[1].life === foeLife - 3, [foeLife, st.players[1].life]); }

// ---- scrap mastery: resurrect 2 dead creatures ----
{ const st = game(); const a = put(st, 0, '_v'); const b = put(st, 0, '_v'); kill(st, a); kill(st, b);
  const b0 = st.players[0].board.length;
  play(st, 0, 'daretti_scrap_mastery', null);
  ok('Scrap Mastery resurrects two creatures', st.players[0].board.length === b0 + 2 && st.players[0].board.filter(c => c.id === '_v').length === 2, [b0, st.players[0].board.length]); }

// ---- reckless automaton is Impulsive ----
ok('Advanced Automaton is Impulsive (must attack)', (byId.daretti_advanced_automaton.keywords || []).includes('impulsive'));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
