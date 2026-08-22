// pool_garruk_test.mjs — Garruk pool redesign (G: beast aggression — lords + big trample + overrun + fight).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._x = { id: '_x', name: 'X', type: 'creature', cost: 2, attack: 2, health: 8, rarity: 'common', tribe: 'Ogre' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Garruk');
// ---- rubric ----
ok('Garruk pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/weapon/enchantment/instant', types.size >= 6 && ['planeswalker', 'weapon', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.selfScale).length >= 3, pool.filter(c => c.ongoing || c.aura || c.selfScale).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(5), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_x'); let threw = null;
  const tgt = (c.id === 'garruk_apex_predator') ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'garruk_wrath') ? { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid } : null;
  try { play(st, 0, c.id, tgt, c.id === 'garruk_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- primalist: beast lord (buffs a played Beast) ----
{ const st = game(); put(st, 0, 'garruk_primalist'); const { c: b } = play(st, 0, '_v', null);
  ok('Primalist buffs a played Beast +1/+1', b.attack === 3 && E.hp(b) === 3, [b.attack, E.hp(b)]); }

// ---- uprising: Beast anthem (+1/+1 and Trample) ----
{ const st = game(); play(st, 0, 'garruk_uprising', null); const b = put(st, 0, '_v'); E.recomputeAuras(st);
  ok('Uprising gives Beasts +1/+1 and Trample', b.attack === 3 && E.hp(b) === 3 && (E.has ? E.has(b, 'trample') : b.keywords.includes('trample')), [b.attack, E.hp(b), b.keywords]); }

// ---- packleader: Beast lord (+1/+0) ----
{ const st = game(); put(st, 0, 'garruk_packleader'); const b = put(st, 0, '_v'); E.recomputeAuras(st);
  ok('Packleader buffs other Beasts +1/+0', b.attack === 3 && E.hp(b) === 2, [b.attack, E.hp(b)]); }

// ---- hordebeast: +1 Attack per other Beast ----
{ const st = game(); const h = put(st, 0, 'garruk_hordebeast'); put(st, 0, '_v'); put(st, 0, '_v'); E.recomputeAuras(st);
  ok('Hordebeast scales +1 Attack per other Beast (5 -> 7)', h.attack === 7, h.attack); }

// ---- harbinger: draws when it attacks ----
{ const st = game(); const hb = put(st, 0, 'garruk_harbinger'); const h0 = st.players[0].hand.length;
  E.attack(st, 0, hb.uid, { type: 'hero', player: 1 });
  ok('Harbinger draws a card when it attacks', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- savagery weapon: equip + spawn a Beast when the hero kills ----
{ const st = game(); play(st, 0, 'garruk_savagery', null);
  const w = st.players[0].weapon;
  ok('Savagery equips (4/2 axe)', w && w.attack === 4 && w.durability === 2, w && [w.attack, w.durability]);
  const b0 = st.players[0].board.length;
  E.fireOngoing(st, 0, 'hero-kills-creature');
  ok('Savagery spawns a 3/3 Beast when the hero kills a creature', st.players[0].board.some(c => c.name === 'Beast' && c.attack === 3) && st.players[0].board.length === b0 + 1, st.players[0].board.map(c => c.name)); }

// ---- gorehorn: Overkill spawns a Beast ----
{ const st = game(); const g = put(st, 0, 'garruk_gorehorn'); const foe = put(st, 1, '_v'); const b0 = st.players[0].board.length;
  E.attack(st, 0, g.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Gorehorn Overkill summons a 2/2 Beast when it overkills', st.players[0].board.some(c => c.name === 'Beast'), st.players[0].board.map(c => c.name + c.attack)); }

// ---- command Choose One (mode 1 = overrun) ----
{ const st = game(); const b = put(st, 0, '_v'); play(st, 0, 'garruk_command', null, 1);
  ok('Command (overrun mode) gives +2/+2 and Trample', b.attack === 4 && E.hp(b) === 4 && (E.has ? E.has(b, 'trample') : b.keywords.includes('trample')), [b.attack, E.hp(b), b.keywords]); }

// ---- wake: overrun ----
{ const st = game(); const b = put(st, 0, '_v'); play(st, 0, 'garruk_wake', null);
  ok('Wake gives your creatures +3/+3 and Trample', b.attack === 5 && E.hp(b) === 5 && (E.has ? E.has(b, 'trample') : b.keywords.includes('trample')), [b.attack, E.hp(b)]); }

// ---- apex predator: destroy battlecry ----
{ const st = game(); const foe = put(st, 1, '_x');
  play(st, 0, 'garruk_apex_predator', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Apex Predator destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.map(c => c.id)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
