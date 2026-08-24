// pool_kolaghan_test.mjs — Kolaghan land pool (BR / Tarkir dragon brood: Dragon tribal + dash/charge haste aggro + burn + Warriors).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const warriors = (st, pi) => st.players[pi].board.filter(c => c.name === 'Warrior').length;

const pool = raw.cards.filter(c => c.landSet === 'Kolaghan');
// ---- rubric ----
ok('Kolaghan pool has 15 cards', pool.length === 15, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BR', pool.every(c => JSON.stringify(c.colors) === '["B","R"]'));
ok('all names contain Kolaghan', pool.every(c => /kolaghan/i.test(c.name)));

function game() {
  const st = E.createGame(byId, seededRng(93), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['kolaghan_warmonger', 'kolaghan_thunder_regent', 'kolaghan_command'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Dragonlord Kolaghan: haste reach ----
{ const st = game(); const life0 = st.players[1].life;
  const { c } = play(st, 0, 'dragonlord_kolaghan', null);
  ok('Dragonlord Kolaghan deals 3 to each opp and has Charge+Lifesteal', st.players[1].life === life0 - 3 && has(c, 'charge') && has(c, 'lifesteal'), [life0, st.players[1].life]); }

// ---- forerunner: charge lord anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'kolaghan_forerunner', null);
  ok('Forerunner gives your creatures +1/+0', v.attack === a0 + 1, [a0, v.attack]); }

// ---- command sorcery: burn + discard ----
{ const st = game(); const foe = put(st, 1, '_wall'); hand(st, 1, 3); const h1 = st.players[1].hand.length;
  play(st, 0, 'kolaghan_command', { type: 'creature', uid: foe.uid, player: 1 });
  ok("Kolaghan's Command: 2 to a creature + opponent discards", foe.damage === 2 && st.players[1].hand.length === h1 - 1, [foe.damage, h1, st.players[1].hand.length]); }

// ---- fury instant: reach ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'fury_of_kolaghan', null);
  ok('Fury of Kolaghan deals 3 to each opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- monument location: tap for a Warrior ----
{ const st = game(); play(st, 0, 'kolaghan_monument', null); const loc = st.players[0].board.find(c => c.id === 'kolaghan_monument'); const w0 = warriors(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const w = st.players[0].board.find(c => c.name === 'Warrior');
  ok('Monument taps for a 3/2 Rush Warrior', warriors(st, 0) === w0 + 1 && w && has(w, 'rush'), [w0, warriors(st, 0)]); }

// ---- stormsinger enchantment: turn-start burn ----
{ const st = game(); play(st, 0, 'kolaghan_stormsinger', null); const life0 = st.players[1].life;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Stormsinger deals 1 to each opponent at turn start', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- scaleguard artifact: tap burn ----
{ const st = game(); play(st, 0, 'kolaghan_scaleguard', null); const life0 = st.players[1].life;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'kolaghan_scaleguard').uid, null);
  ok('Scaleguard taps to deal 2 to each opponent', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// ---- thunder regent: burn a creature ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'kolaghan_thunder_regent', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Thunder Regent deals 3 to a creature', foe.damage === 3, foe.damage); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
