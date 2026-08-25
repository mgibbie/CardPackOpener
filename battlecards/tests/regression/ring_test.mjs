// ring_test.mjs — Tempt (MTG's "The Ring tempts you"): the per-player Ring emblem (p.ring 0-4)
// + Ring-bearer (p.ringBearer), the four cumulative tiers, and the {type:'tempt'} effect.
// Faithful-adaptation tiers: L1 Stealth (+ bearer marker), L2 loot-on-attack (draw then discard),
// L3 Deathtouch + +1/+1, L4 each opponent loses 3 when the bearer damages a hero.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
const dummy = (a, h, name, kw = []) => ({ id: '_' + name, name, type: 'creature', cost: 2, attack: a, health: h, rarity: 'common', tribe: 'Beast', keywords: kw });
for (const n of ['Bearer', 'A', 'B', 'Frail', 'New', 'H', 'X']) byId['_' + n] = dummy(1, 1, n);
byId._X = dummy(1, 1, 'X');
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, def, sick = false) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const valid = (st, l) => { const v = validateGameState(st); ok(l + ': state valid', !v || v.length === 0, v); };

// ── exports present ──
ok('tempt / setRingBearer exported', typeof E.tempt === 'function' && typeof E.setRingBearer === 'function');

// T1 — tempt L1: sole creature auto-becomes bearer, gains Stealth
{ const st = game(); const c = put(st, 0, dummy(3, 3, 'Bearer'));
  E.tempt(st, 0);
  ok('T1: ring level 1', st.players[0].ring === 1, st.players[0].ring);
  ok('T1: sole creature auto-becomes Ring-bearer', st.players[0].ringBearer === c.uid);
  ok('T1: L1 grants Stealth', E.has(c, 'stealth') && c.stealthed === true);
  ok('T1: bearer marked isRingBearer', c.isRingBearer === true);
  ok('T1: no pick queued (auto-assigned)', st.pickQueue.length === 0);
  valid(st, 'T1'); }

// T2 — tempt with multiple creatures queues a bearer pick; resolvePick sets it
{ const st = game(); const a = put(st, 0, dummy(3, 3, 'A')); const b = put(st, 0, dummy(2, 2, 'B'));
  E.tempt(st, 0);
  ok('T2: bearer pick queued', st.pickQueue.length === 1 && st.pickQueue[0].mode === 'tempt' && st.pickQueue[0].ids.length === 2);
  E.resolvePick(st, b.uid);
  ok('T2: chosen creature is the bearer', st.players[0].ringBearer === b.uid);
  ok('T2: only B has Stealth', E.has(b, 'stealth') && !E.has(a, 'stealth'));
  valid(st, 'T2'); }

// T3 — level caps at 4; with no creatures you level up but pick no bearer
{ const st = game();
  for (let i = 0; i < 6; i++) E.tempt(st, 0);
  ok('T3: ring caps at 4', st.players[0].ring === 4, st.players[0].ring);
  ok('T3: no bearer with no creatures', st.players[0].ringBearer === null);
  ok('T3: no picks queued (no creatures)', st.pickQueue.length === 0); }

// T4 — tier 2: bearer attack draws a card then discards one (deck -1, graveyard +1)
{ const st = game(); const c = put(st, 0, dummy(3, 3, 'Bearer'));
  st.players[0].deck = ['_X', '_X']; st.players[0].hand = [E.instantiate(byId._H, 0)];
  E.tempt(st, 0); E.tempt(st, 0);
  ok('T4: ring level 2', st.players[0].ring === 2);
  const deck0 = st.players[0].deck.length, gy0 = st.players[0].graveyard.length, hand0 = st.players[0].hand.length;
  E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
  ok('T4: L2 drew a card (deck -1)', st.players[0].deck.length === deck0 - 1, [deck0, st.players[0].deck.length]);
  ok('T4: L2 discarded a card (graveyard +1)', st.players[0].graveyard.length === gy0 + 1, [gy0, st.players[0].graveyard.length]);
  ok('T4: hand size net unchanged (draw + discard)', st.players[0].hand.length === hand0, [hand0, st.players[0].hand.length]);
  valid(st, 'T4'); }

// T5 — tier 3: bearer gains Deathtouch and +1/+1
{ const st = game(); const c = put(st, 0, dummy(3, 3, 'Bearer'));
  E.tempt(st, 0); E.tempt(st, 0); E.tempt(st, 0);
  ok('T5: ring level 3', st.players[0].ring === 3);
  ok('T5: L3 grants Deathtouch', E.has(c, 'deathtouch'));
  ok('T5: L3 grants +1/+1 (3/3 -> 4/4)', c.attack === 4 && E.hp(c) === 4, [c.attack, E.hp(c)]);
  valid(st, 'T5'); }

// T6 — tier 4: when the bearer damages the enemy hero, each opponent loses 3 (on top of combat)
{ const st = game(); const c = put(st, 0, dummy(3, 3, 'Bearer')); put(st, 1, dummy(0, 30, 'Wall')); // filler so board non-empty
  for (let i = 0; i < 4; i++) E.tempt(st, 0);
  ok('T6: ring level 4', st.players[0].ring === 4);
  ok('T6: bearer is 4/4 (base 3/3 + L3)', c.attack === 4 && E.hp(c) === 4, [c.attack, E.hp(c)]);
  const life0 = st.players[1].life;
  E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
  ok('T6: enemy hero loses combat(4) + Ring(3) = 7', st.players[1].life === life0 - 7, [life0, st.players[1].life]);
  valid(st, 'T6'); }

// T6b — the Ring's extra 3 does NOT fire when a non-bearer hits the hero
{ const st = game(); const bearer = put(st, 0, dummy(3, 3, 'A')); const other = put(st, 0, dummy(2, 2, 'B'));
  for (let i = 0; i < 4; i++) { E.tempt(st, 0); if (st.pickQueue.length) E.resolvePick(st, bearer.uid); }
  const life0 = st.players[1].life;
  E.attack(st, 0, other.uid, { type: 'hero', player: 1 });
  ok('T6b: non-bearer deals only its combat damage (no Ring bonus)', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// T7 — bearer death clears ringBearer but the level persists; re-tempt re-grants at current level
{ const st = game(); const c = put(st, 0, dummy(1, 1, 'Frail'));
  E.tempt(st, 0); E.tempt(st, 0); E.tempt(st, 0);
  ok('T7: bearer set at L3', st.players[0].ringBearer === c.uid);
  c.damage = 99; E.sweepDeaths(st); E.recomputeAuras(st);
  ok('T7: dead bearer clears ringBearer', st.players[0].ringBearer === null);
  ok('T7: ring level persists (3)', st.players[0].ring === 3);
  const d = put(st, 0, dummy(3, 3, 'New'));
  E.tempt(st, 0); // -> level 4, sole creature auto-bearer
  ok('T7: re-tempt sets a new bearer', st.players[0].ringBearer === d.uid);
  ok('T7: new bearer re-gains statics (Stealth + Deathtouch)', E.has(d, 'stealth') && E.has(d, 'deathtouch'));
  valid(st, 'T7'); }

// T8 — moving the bearer strips the old one's grants and applies them to the new one
{ const st = game(); const a = put(st, 0, dummy(3, 3, 'A')); const b = put(st, 0, dummy(3, 3, 'B'));
  E.tempt(st, 0); E.resolvePick(st, a.uid);
  ok('T8: A is bearer with Stealth', st.players[0].ringBearer === a.uid && E.has(a, 'stealth'));
  E.tempt(st, 0); E.resolvePick(st, b.uid);
  ok('T8: bearer moved to B', st.players[0].ringBearer === b.uid);
  ok('T8: A lost Stealth', !E.has(a, 'stealth'));
  ok('T8: B gained Stealth', E.has(b, 'stealth'));
  valid(st, 'T8'); }

// T9 — ring/ringBearer are JSON-safe (ride along in MP/replay snapshots like p.dungeon)
{ const st = game(); const c = put(st, 0, dummy(3, 3, 'Bearer'));
  E.tempt(st, 0); E.tempt(st, 0);
  const snap = JSON.parse(JSON.stringify(st));
  ok('T9: ring + ringBearer survive a JSON round-trip', snap.players[0].ring === 2 && snap.players[0].ringBearer === c.uid); }

// T10 — the {type:'tempt'} effect (as a card would use it) drives the mechanic
{ const st = game(); const c = put(st, 0, dummy(3, 3, 'Bearer'));
  E.execEffects(st, 0, [{ type: 'tempt' }], null, null);
  ok('T10: {type:tempt} levels the Ring and picks the bearer', st.players[0].ring === 1 && st.players[0].ringBearer === c.uid);
  valid(st, 'T10'); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
