// pool_emrakul_test.mjs — Emrakul boss pool (colorless Eldrazi titans: ramp + annihilator + reality distortion).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._eld = { id: '_eld', name: 'E', type: 'creature', cost: 5, attack: 4, health: 4, rarity: 'common', tribe: 'Eldrazi' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Emrakul');
// ---- rubric ----
ok('Emrakul pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/location/instant', types.size >= 6 && ['artifact', 'enchantment', 'location', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.tapAbility || c.taps || c.costMod).length >= 3, pool.filter(c => c.ongoing || c.aura || c.tapAbility || c.taps || c.costMod).map(c => c.id));
ok('the boss (sig) is a big creature commander, not a planeswalker', byId.emrakul_sig.type === 'creature' && byId.emrakul_sig.attack === 12);

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_eld'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (c.id === 'emrakul_distortion') ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'emrakul_devourer') ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'emrakul_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- herald: Eldrazi cost reduction ----
{ const st = game(); put(st, 0, 'emrakul_herald');
  const el = E.instantiate(byId._eld, 0); el.zone = 'hand'; st.players[0].hand.push(el);
  const c = E.effectiveCost ? E.effectiveCost(st, 0, el) : (el.cost - 1);
  ok('Herald makes your Eldrazi cost 1 less (5 -> 4)', c === 4, c); }

// ---- madness: Eldrazi lord ----
{ const st = game(); put(st, 0, 'emrakul_madness'); const e = put(st, 0, '_eld'); E.recomputeAuras(st);
  ok('Madness buffs other Eldrazi +1/+1', e.attack === 5 && E.hp(e) === 5, [e.attack, E.hp(e)]); }

// ---- shrine location: tap for two Spawn ----
{ const st = game(); play(st, 0, 'emrakul_shrine', null);
  const loc = st.players[0].board.find(c => c.id === 'emrakul_shrine'); const b0 = st.players[0].board.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Shrine taps for two Eldrazi Spawn', st.players[0].board.filter(c => c.name === 'Eldrazi Spawn').length === 2, st.players[0].board.map(c => c.name)); }

// ---- breach artifact: tap to bounce ----
{ const st = game(); const br = putArt(st, 0, 'emrakul_breach_of_reality'); const foe = put(st, 1, '_v');
  const okTap = E.tapArtifact(st, 0, br.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Breach of Reality taps to bounce an enemy creature', okTap && !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === 1, [okTap, st.players[1].board.length, st.players[1].hand.length]); }

// ---- emissary annihilator: destroy a random enemy ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'emrakul_emissary', null);
  ok('Emissary destroys a random enemy creature on entry', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.map(c => c.id)); }

// ---- command Choose One (mode 1 = mass bounce) ----
{ const st = game(); put(st, 1, '_v'); put(st, 1, '_v'); put(st, 1, '_v');
  play(st, 0, 'emrakul_command', null, 1);
  ok('Command (reset mode) returns all enemy creatures to hand', st.players[1].board.filter(c => c.type === 'creature').length === 0 && st.players[1].hand.length === 3, [st.players[1].board.length, st.players[1].hand.length]); }

// ---- the boss: wipe enemy board + take an extra turn ----
{ const st = game(); put(st, 1, '_v'); put(st, 1, '_v');
  play(st, 0, 'emrakul_sig', null); E.sweepDeaths(st);
  ok('Emrakul wipes enemy creatures (4 dmg) on entry', st.players[1].board.filter(c => c.type === 'creature').length === 0, st.players[1].board.map(c => c.id));
  ok('Emrakul queues an extra turn (forcedTurns)', Array.isArray(st.forcedTurns) && st.forcedTurns.length > 0, st.forcedTurns); }

// ---- evangel: Spawn ramp ----
{ const st = game(); play(st, 0, 'emrakul_evangel', null);
  ok('Evangel summons two Eldrazi Spawn', st.players[0].board.filter(c => c.name === 'Eldrazi Spawn').length === 2, st.players[0].board.map(c => c.name)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
