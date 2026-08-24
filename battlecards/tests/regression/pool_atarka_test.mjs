// pool_atarka_test.mjs — Atarka land pool (RG / Tarkir dragon brood: Dragon tribal + big fatties + burn + haste + trample).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;

const pool = raw.cards.filter(c => c.landSet === 'Atarka');
// ---- rubric ----
ok('Atarka pool has 15 cards', pool.length === 15, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RG', pool.every(c => JSON.stringify(c.colors) === '["R","G"]'));
ok('all names contain Atarka', pool.every(c => /atarka/i.test(c.name)));

function game() {
  const st = E.createGame(byId, seededRng(91), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = c.id === 'atarka_lava_ritual';
  const frTgt = c.id === 'atarka_beastbreaker';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Dragonlord Atarka: dragonfire sweep ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'dragonlord_atarka', null);
  ok('Dragonlord Atarka deals 3 to all enemy creatures', a.damage === 3 && b.damage === 3, [a.damage, b.damage]); }

// ---- command sorcery: reach + anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const life0 = st.players[1].life;
  play(st, 0, 'atarka_command', null);
  ok("Atarka's Command: 3 to each opp + team +1/+0", st.players[1].life === life0 - 3 && v.attack === a0 + 1, [life0, st.players[1].life, a0, v.attack]); }

// ---- lava ritual instant: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'atarka_lava_ritual', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Lava Ritual deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- descending armada artifact: tap for a Dragon ----
{ const st = game(); play(st, 0, 'atarka_descending_armada', null); const d0 = named(st, 0, 'Dragon');
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'atarka_descending_armada').uid, null);
  const d = st.players[0].board.find(c => c.name === 'Dragon');
  ok('Descending Armada taps for a 3/3 Elusive Dragon', named(st, 0, 'Dragon') === d0 + 1 && d && has(d, 'elusive'), [d0, named(st, 0, 'Dragon')]); }

// ---- monument location: tap for a Beast ----
{ const st = game(); play(st, 0, 'atarka_monument', null); const loc = st.players[0].board.find(c => c.id === 'atarka_monument'); const b0 = named(st, 0, 'Beast');
  E.tapLand(st, 0, loc.uid, 0);
  const b = st.players[0].board.find(c => c.name === 'Beast');
  ok('Monument taps for a 3/3 Trample Beast', named(st, 0, 'Beast') === b0 + 1 && b && has(b, 'trample'), [b0, named(st, 0, 'Beast')]); }

// ---- harbinger enchantment: turn-start burn ----
{ const st = game(); play(st, 0, 'atarka_harbinger', null); const life0 = st.players[1].life;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Harbinger deals 1 to each opponent at turn start', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- beastbreaker: +2/+2 ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'atarka_beastbreaker', { type: 'creature', uid: v.uid, player: 0 });
  ok('Beastbreaker gives +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- woodwalker: team anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'atarka_woodwalker', null);
  ok('Woodwalker gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
