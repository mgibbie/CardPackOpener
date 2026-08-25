// pool_kruphix_test.mjs — Kruphix land pool (GU devotion: ramp + big card draw + big Elusive threats).
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

const pool = raw.cards.filter(c => c.landSet === 'Kruphix');
// ---- rubric ----
ok('Kruphix pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/artifact/instant/location', types.size >= 6 && ['enchantment', 'artifact', 'instant', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GU', pool.every(c => (c.colors || []).slice().sort().join('') === 'GU'));

function game() {
  const st = E.createGame(byId, seededRng(63), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_v'); let threw = null;
  const tgt = ['kruphix_enigma', 'cloak_of_kruphix'].includes(c.id) ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: draw 2 + turn-start draw + ramp ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'kruphix_god_of_horizons', null);
  ok('Kruphix battlecry draws 2', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
  const h1 = st.players[0].hand.length; const b0 = st.players[0].mana.bonus;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Kruphix turn-start draws 1 and ramps 1', st.players[0].hand.length === h1 + 1 && st.players[0].mana.bonus === b0 + 1, [h1, st.players[0].hand.length, b0, st.players[0].mana.bonus]); }

// ---- courser: gain 3 ----
{ const st = game(); const life0 = st.players[0].life;
  play(st, 0, 'courser_of_kruphix', null);
  ok('Courser gains 3 life', st.players[0].life === life0 + 3, [life0, st.players[0].life]); }

// ---- prophet: ramp ----
{ const st = game(); const b0 = st.players[0].mana.bonus;
  play(st, 0, 'prophet_of_kruphix', null);
  ok('Prophet gains 3 Mana this turn', st.players[0].mana.bonus === b0 + 3, [b0, st.players[0].mana.bonus]); }

// ---- horizon chimera: draw -> lifegain ----
{ const st = game(); put(st, 0, 'kruphix_horizon_chimera'); const life0 = st.players[0].life;
  E.execEffects(st, 0, [{ type: 'draw', value: 1 }], null, null);
  ok('Horizon Chimera gains 1 life when you draw', st.players[0].life === life0 + 1, [life0, st.players[0].life]); }

// ---- dictate enchantment: draw each turn ----
{ const st = game(); play(st, 0, 'dictate_of_kruphix', null); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Dictate draws a card at turn start', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- insight: draw + life ----
{ const st = game(); const h0 = st.players[0].hand.length; const life0 = st.players[0].life;
  play(st, 0, 'kruphix_insight', null);
  ok('Insight draws 2 and gains 2 life', st.players[0].hand.length === h0 + 2 && st.players[0].life === life0 + 2, [h0, st.players[0].hand.length, life0, st.players[0].life]); }

// ---- puzzlebox artifact: tap to scry + draw ----
{ const st = game(); play(st, 0, 'kruphix_puzzlebox', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'kruphix_puzzlebox').uid, null);
  E.resolveScry(st, []); ok('Puzzlebox taps to draw a card (after Scry 1)', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- enigma: draw + buff ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'kruphix_enigma', { type: 'creature', uid: v.uid, player: 0 });
  ok('Enigma draws and gives +2/+2', st.players[0].hand.length === h0 + 1 && v.attack === a0 + 2, [h0, st.players[0].hand.length, a0, v.attack]); }

// ---- sigil location: tap for a card + ramp ----
{ const st = game(); st.players[0].mana = { cur: 30, max: 5, bonus: 0 }; play(st, 0, 'sigil_of_kruphix', null);
  const loc = st.players[0].board.find(c => c.id === 'sigil_of_kruphix'); const h0 = st.players[0].hand.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Sigil taps to draw a card and gain a Mana Crystal', st.players[0].hand.length === h0 + 1 && st.players[0].mana.max === 6, [h0, st.players[0].hand.length, st.players[0].mana.max]); }

// ---- cloak: +2/+2 and Elusive ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'cloak_of_kruphix', { type: 'creature', uid: v.uid, player: 0 });
  ok('Cloak gives +2/+2 and Elusive', v.attack === a0 + 2 && has(v, 'elusive'), [a0, v.attack, v.keywords]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
