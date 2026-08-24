// pool_karfell_test.mjs — Karfell land pool (UB / Kaldheim realm, 30 cards: Undead + deathtouch + mill/discard + reanimation/aristocrats + control).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'Big', type: 'creature', cost: 8, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const undead = (st, pi) => st.players[pi].board.filter(c => c.name === 'Undead').length;

const pool = raw.cards.filter(c => c.landSet === 'Karfell');
// ---- rubric ----
ok('Karfell pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UB', pool.every(c => JSON.stringify(c.colors) === '["U","B"]'));
ok('all names contain Karfell + uncollectible', pool.every(c => /karfell/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(101), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['poison_the_cup', 'deathknell_of_karfell'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Narfi: two Undead ----
{ const st = game(); const u0 = undead(st, 0);
  play(st, 0, 'narfi_karfell_lich_king', null);
  ok('Narfi summons two deathtouch Undead', undead(st, 0) === u0 + 2 && st.players[0].board.some(c => c.name === 'Undead' && has(c, 'deathtouch')), [u0, undead(st, 0)]); }

// ---- Draugr Necromancer: reanimate ----
{ const st = game(); const big = put(st, 0, '_big'); kill(st, big);
  play(st, 0, 'draugr_necromancer', null);
  ok('Draugr Necromancer returns a dead creature', st.players[0].board.some(c => c.id === '_big'), st.players[0].board.map(c => c.id)); }

// ---- priest enchantment: aristocrat discard ----
{ const st = game(); const fodder = put(st, 0, '_v'); hand(st, 1, 3); play(st, 0, 'priest_of_the_haunted_edge', null); const h1 = st.players[1].hand.length;
  kill(st, fodder);
  ok('Priest: opponent discards when a friendly dies', st.players[1].hand.length === h1 - 1, [h1, st.players[1].hand.length]); }

// ---- reanimation location: tap for an Undead ----
{ const st = game(); play(st, 0, 'raise_the_draugr', null); const loc = st.players[0].board.find(c => c.id === 'raise_the_draugr'); const u0 = undead(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Reanimation taps for a deathtouch Undead', undead(st, 0) === u0 + 1, [u0, undead(st, 0)]); }

// ---- monument artifact: tap for an Undead ----
{ const st = game(); play(st, 0, 'karfell_monument', null); const u0 = undead(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'karfell_monument').uid, null);
  ok('Monument taps for a deathtouch Undead', undead(st, 0) === u0 + 1, [u0, undead(st, 0)]); }

// ---- deathknell instant: destroy ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'deathknell_of_karfell', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Deathknell destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- helm weapon: burn on hero attack ----
{ const st = game(); play(st, 0, 'helm_of_karfell', null); const life0 = st.players[1].life;
  ok('Helm equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Helm deals 1 to the opponent after the hero attacks', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- NEW Tergrid: discard 2 ----
{ const st = game(); hand(st, 1, 3); const h1 = st.players[1].hand.length;
  play(st, 0, 'karfell_tergrid', null);
  ok('Tergrid: opponent discards 2', st.players[1].hand.length === h1 - 2, [h1, st.players[1].hand.length]); }

// ---- skeleton: Reborn ----
{ const st = game(); const s = put(st, 0, 'karfell_skeleton');
  ok('Skeleton has Reborn', has(s, 'reborn'));
  kill(st, s);
  ok('Skeleton returns via Reborn', st.players[0].board.some(c => c.id === 'karfell_skeleton'), st.players[0].board.map(c => c.id)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
