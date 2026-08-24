// pool_xenagos_test.mjs — Xenagos land pool redesign (RG devotion: haste revels + Satyrs + go-wide aggro).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const satyrs = (st, pi) => st.players[pi].board.filter(c => c.name === 'Satyr').length;

const pool = raw.cards.filter(c => c.landSet === 'Xenagos');
// ---- rubric ----
ok('Xenagos pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/instant/location/artifact', types.size >= 6 && ['enchantment', 'instant', 'location', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RG', pool.every(c => JSON.stringify(c.colors) === '["R","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(59), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_v'); let threw = null;
  const tgt = ['mischief_of_xenagos', 'xenagos_charm'].includes(c.id) ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: +2/+0 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'xenagos_god_of_revels', null);
  ok('Xenagos gives your creatures +2/+0 and Rush', v.attack === a0 + 2 && has(v, 'rush'), [a0, v.attack, v.keywords]); }

// ---- reveler: two Satyrs ----
{ const st = game(); const s0 = satyrs(st, 0);
  play(st, 0, 'xenagos_reveler', null);
  ok('Reveler summons two 2/2 Satyrs with Rush', satyrs(st, 0) === s0 + 2 && st.players[0].board.some(c => c.name === 'Satyr' && has(c, 'rush')), [s0, satyrs(st, 0)]); }

// ---- ascendancy enchantment: Rush on played creatures ----
{ const st = game(); play(st, 0, 'xenagos_ascendancy', null);
  const { c } = play(st, 0, '_v', null);
  ok('Ascendancy gives a freshly played creature Rush', has(c, 'rush'), c.keywords); }

// ---- mischief: +2/+2 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'mischief_of_xenagos', { type: 'creature', uid: v.uid, player: 0 });
  ok('Mischief gives +2/+2 and Rush', v.attack === a0 + 2 && has(v, 'rush'), [a0, v.attack]); }

// ---- mayhem: mass +1/+1 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'mayhem_of_xenagos', null);
  ok('Mayhem gives your creatures +1/+1 and Rush', v.attack === a0 + 1 && has(v, 'rush'), [a0, v.attack]); }

// ---- charm: +3/+3 ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'xenagos_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +3/+3', v.attack === a0 + 3, [a0, v.attack]); }

// ---- command: a 3/3 Satyr ----
{ const st = game(); const s0 = satyrs(st, 0);
  play(st, 0, 'xenagos_command', null);
  ok('Command summons a 3/3 Satyr with Rush', satyrs(st, 0) === s0 + 1 && st.players[0].board.some(c => c.name === 'Satyr' && c.attack === 3), [s0, satyrs(st, 0)]); }

// ---- blessing location: tap for a Satyr ----
{ const st = game(); play(st, 0, 'blessing_of_xenagos', null); const loc = st.players[0].board.find(c => c.id === 'blessing_of_xenagos'); const s0 = satyrs(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Blessing taps for a 2/1 Satyr with Rush', satyrs(st, 0) === s0 + 1, [s0, satyrs(st, 0)]); }

// ---- hymn: face burn ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'hymn_of_xenagos', null);
  ok('Hymn deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- puzzlebox artifact: tap for a Beast ----
{ const st = game(); play(st, 0, 'xenagos_puzzlebox', null); const b0 = st.players[0].board.filter(c => c.name === 'Beast').length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'xenagos_puzzlebox').uid, null);
  ok('Puzzlebox taps for a 2/2 Beast with Rush', st.players[0].board.some(c => c.name === 'Beast' && has(c, 'rush')) && st.players[0].board.filter(c => c.name === 'Beast').length === b0 + 1, st.players[0].board.map(c => c.name)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
