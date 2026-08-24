// pool_gnottvold_test.mjs — Gnottvold land pool (RG / Kaldheim realm, 30 cards: Troll/Giant/Beast big aggro + ramp + trample + reborn + burn + weapons).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const beasts = (st, pi) => st.players[pi].board.filter(c => c.name === 'Beast').length;

const pool = raw.cards.filter(c => c.landSet === 'Gnottvold');
// ---- rubric ----
ok('Gnottvold pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RG', pool.every(c => JSON.stringify(c.colors) === '["R","G"]'));
ok('all names contain Gnottvold + uncollectible', pool.every(c => /gnottvold/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(98), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['gnottvold_shaman', 'gnottvold_firebeast', 'gnottvold_plunderer', 'gnottvold_boulder', 'gnottvold_charm', 'gnottvold_toralf'].includes(c.id);
  const frTgt = ['gnottvold_runemage', 'gnottvold_rampage'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Arni: go-wide anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'arni_brokenbrow', null);
  ok('Arni gives your creatures +1/+0', v.attack === a0 + 1, [a0, v.attack]); }

// ---- Troll: Reborn (comes back once) ----
{ const st = game(); const t = put(st, 0, 'gnottvold_troll'); const n0 = st.players[0].board.length;
  ok('Troll has Reborn', has(t, 'reborn'));
  kill(st, t);
  ok('Troll returns via Reborn', st.players[0].board.some(c => c.id === 'gnottvold_troll'), st.players[0].board.map(c => c.id)); }

// ---- beastcaller: a Beast ----
{ const st = game(); const b0 = beasts(st, 0);
  play(st, 0, 'gnottvold_beastcaller', null);
  ok('Beastcaller summons a 3/3 Trample Beast', beasts(st, 0) === b0 + 1 && st.players[0].board.some(c => c.name === 'Beast' && has(c, 'trample')), [b0, beasts(st, 0)]); }

// ---- hymn enchantment: go-wide ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'hymn_of_gnottvold', null); const a0 = v.attack;
  play(st, 0, '_v', null);
  ok('Hymn gives +1/+0 when a creature enters', v.attack >= a0 + 1, [a0, v.attack]); }

// ---- hunt artifact: +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'gnottvold_hunt', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'gnottvold_hunt').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Hunt taps to put a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- monument location: tap for a Beast ----
{ const st = game(); play(st, 0, 'gnottvold_monument', null); const loc = st.players[0].board.find(c => c.id === 'gnottvold_monument'); const b0 = beasts(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for a 3/3 Trample Beast', beasts(st, 0) === b0 + 1, [b0, beasts(st, 0)]); }

// ---- rampage instant: +2/+2 trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'gnottvold_rampage', { type: 'creature', uid: v.uid, player: 0 });
  ok('Rampage gives +2/+2 and Trample', v.attack === a0 + 2 && has(v, 'trample'), [a0, v.attack]); }

// ---- boulder sorcery: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'gnottvold_boulder', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Boulder deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- slumberwand weapon: rally on hero attack ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'gnottvold_slumberwand', null); const a0 = v.attack;
  ok('Slumberwand equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Slumberwand gives +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

// ---- NEW Toralf: charge burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  const { c } = play(st, 0, 'gnottvold_toralf', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Toralf has Charge and deals 3 to a creature', has(c, 'charge') && foe.damage === 3, [foe.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
