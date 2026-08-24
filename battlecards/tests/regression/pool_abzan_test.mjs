// pool_abzan_test.mjs — Abzan land pool REVISIT (WBG: +1/+1 counters + go-wide Warriors + lifegain + resilience).
// The 7 originally-clean cards (Warlord/Survivalist/Battlepriest/Runemark-Coven/Sand Blessing/Strike/Advantage) are
// covered by abzan_pool_test.mjs; this covers the rubric + the 8 cleaned-up cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 4, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;

const pool = raw.cards.filter(c => c.landSet === 'Abzan' && c.type !== 'land');
// ---- rubric ----
ok('Abzan pool has 15 cards', pool.length === 15, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location/enchantment/instant', types.size >= 6 && ['artifact', 'location', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WBG', pool.every(c => JSON.stringify([...(c.colors || [])].sort()) === '["B","G","W"]'));
ok('carries NO rarity (Abzan pool rule)', pool.every(c => !c.rarity));

function game() {
  const st = E.createGame(byId, seededRng(87), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice ?? undefined); return { c, okp }; };

// ---- play-without-throw sweep (all 15) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = c.id === 'abzan_charm';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  const choice = c.id === 'abzan_charm' ? 0 : undefined;
  try { play(st, 0, c.id, tgt, choice); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- falconer artifact: tap puts a +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'abzan_falconer', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'abzan_falconer').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Falconer taps to put a +1/+1 counter on a creature', v.attack === a0 + 1 && E.hp(v) >= 3, [a0, v.attack, E.hp(v)]); }

// ---- fortification location: tap for a Taunt Warrior ----
{ const st = game(); play(st, 0, 'abzan_fortification', null); const loc = st.players[0].board.find(c => c.id === 'abzan_fortification'); const w0 = named(st, 0, 'Warrior');
  E.tapLand(st, 0, loc.uid, 0);
  const w = st.players[0].board.find(c => c.name === 'Warrior');
  ok('Fortification taps for a 2/2 Taunt Warrior', named(st, 0, 'Warrior') === w0 + 1 && w && has(w, 'taunt'), [w0, named(st, 0, 'Warrior')]); }

// ---- guide: lifesteal + gain 4 ----
{ const st = game(); const life0 = st.players[0].life;
  const { c } = play(st, 0, 'abzan_guide', null);
  ok('Guide has Lifesteal and gains 4 life', has(c, 'lifesteal') && st.players[0].life === life0 + 4, [life0, st.players[0].life]); }

// ---- skycaptain: +1/+1 counter battlecry ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'abzan_skycaptain', { type: 'creature', uid: v.uid, player: 0 });
  ok('Skycaptain battlecry puts a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- ascendancy enchantment: aristocrat Spirit ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'abzan_ascendancy', null); const s0 = named(st, 0, 'Spirit');
  kill(st, fodder);
  ok('Ascendancy summons a Spirit when a friendly dies', named(st, 0, 'Spirit') === s0 + 1, [s0, named(st, 0, 'Spirit')]); }

// ---- infantry: deathrattle Warrior ----
{ const st = game(); const inf = put(st, 0, 'abzan_infantry'); const w0 = named(st, 0, 'Warrior');
  kill(st, inf);
  ok('Infantry deathrattle summons a Taunt Warrior', named(st, 0, 'Warrior') === w0 + 1, [w0, named(st, 0, 'Warrior')]); }

// ---- charm mode 0: destroy a big creature ----
{ const st = game(); const foe = put(st, 1, '_wall'); // 4 Attack
  play(st, 0, 'abzan_charm', { type: 'creature', uid: foe.uid, player: 1 }, 0); E.sweepDeaths(st);
  ok('Charm (mode 1) destroys a 3+ Attack creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- charm mode 1: team anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'abzan_charm', null, 1);
  ok('Charm (mode 2) gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
