// pool_surtland_test.mjs — Surtland land pool (UR / Kaldheim realm, 30 cards: Giants + spellslinging burn + freeze control + big beaters + spell value).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 8, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const giants = (st, pi) => st.players[pi].board.filter(c => c.name === 'Giant').length;

const pool = raw.cards.filter(c => c.landSet === 'Surtland');
// ---- rubric ----
ok('Surtland pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UR', pool.every(c => JSON.stringify(c.colors) === '["U","R"]'));
ok('all names contain Surtland + uncollectible', pool.every(c => /surtland/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(105), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['surtr_fire_giant', 'cinderheart_giant', 'surtland_stormcaller', 'surtland_elementalist', 'surtland_frost_giant', 'surtland_volcanic_cryomancer', 'surtland_firebolt', 'flame_of_surtr', 'surtland_iceflame_bolt', 'surtland_lava_blast', 'surtland_command'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Surtr: burn battlecry + charge ----
{ const st = game(); const foe = put(st, 1, '_wall');
  const { c } = play(st, 0, 'surtr_fire_giant', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Surtr deals 4 to a creature and has Charge', foe.damage === 4 && has(c, 'charge'), [foe.damage]); }

// ---- Fire Giant King: board wipe ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'surtland_fire_giant_king', null);
  ok('Fire Giant King deals 4 to all enemy creatures', a.damage === 4 && b.damage === 4, [a.damage, b.damage]); }

// ---- monument location: tap for a Giant ----
{ const st = game(); play(st, 0, 'surtland_monument', null); const loc = st.players[0].board.find(c => c.id === 'surtland_monument'); const g0 = giants(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for a 3/3 Trample Giant', giants(st, 0) === g0 + 1, [g0, giants(st, 0)]); }

// ---- charm enchantment: spellslinger ping ----
{ const st = game(); play(st, 0, 'surtland_charm', null); const life0 = st.players[1].life;
  cast(st, 0, '_cantrip');
  ok('Charm deals 1 to each opp when you cast a spell', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- keyrune artifact: tap ramp + scry ----
{ const st = game(); play(st, 0, 'surtland_keyrune', null); const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'surtland_keyrune').uid, null);
  ok('Keyrune taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- firebolt instant: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'surtland_firebolt', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Firebolt deals 4 to a creature', foe.damage === 4, foe.damage); }

// ---- crush the weak: sweep ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'crush_the_weak', null);
  ok('Eruption deals 2 to all enemy creatures', a.damage === 2 && b.damage === 2, [a.damage, b.damage]); }

// ---- cryomagma staff weapon: burn on hero attack ----
{ const st = game(); play(st, 0, 'surtland_cryomagma_staff', null); const life0 = st.players[1].life;
  ok('Cryomagma Staff equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Cryomagma Staff deals 1 to the opponent after the hero attacks', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- NEW Basalt Ravager: burn battlecry ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'surtland_basalt_ravager', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Basalt Ravager deals 3 to any target', foe.damage === 3, foe.damage); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
