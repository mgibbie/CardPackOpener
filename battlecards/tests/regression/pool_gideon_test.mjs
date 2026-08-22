// pool_gideon_test.mjs — Gideon pool redesign (W: go-wide Soldiers + anthem + protection).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._sol = { id: '_sol', name: 'S', type: 'creature', cost: 1, attack: 2, health: 2, rarity: 'common', tribe: 'Soldier' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Gideon');
// ---- rubric ----
ok('Gideon pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/enchantment/quest/instant', types.size >= 6 && ['planeswalker', 'enchantment', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.selfScale).length >= 3, pool.filter(c => c.ongoing || c.aura || c.selfScale).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(4), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.armor = 0; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_sol'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['gideon_reproach'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 }
    : (['gideon_sacrifice', 'gideon_intervention'].includes(c.id)) ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'gideon_defeat' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- battle_cry: Soldier anthem ----
{ const st = game(); play(st, 0, 'gideon_battle_cry', null); const s = put(st, 0, '_sol'); E.recomputeAuras(st);
  ok('Battle Cry gives Soldiers +1/+1', s.attack === 3 && E.hp(s) === 3, [s.attack, E.hp(s)]); }

// ---- avenger: +1 Attack per other Soldier ----
{ const st = game(); const av = put(st, 0, 'gideon_avenger'); put(st, 0, '_sol'); put(st, 0, '_sol'); put(st, 0, '_sol'); E.recomputeAuras(st);
  ok('Avenger scales +1 Attack per other Soldier (2 -> 5)', av.attack === 5, av.attack); }

// ---- phalanx: Soldier lord +1/+0 ----
{ const st = game(); put(st, 0, 'gideon_phalanx'); const s = put(st, 0, '_sol'); E.recomputeAuras(st);
  ok('Phalanx buffs other Soldiers +1/+0', s.attack === 3 && E.hp(s) === 2, [s.attack, E.hp(s)]); }

// ---- lawkeeper: Freeze battlecry ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'gideon_lawkeeper', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Lawkeeper battlecry freezes an enemy', !!foe.frozen, foe.frozen); }

// ---- intervention: +2/+2 and Divine Shield ----
{ const st = game(); const s = put(st, 0, '_sol');
  play(st, 0, 'gideon_intervention', { type: 'creature', uid: s.uid, player: 0 });
  ok('Intervention grants +2/+2 and Divine Shield', s.attack === 4 && E.hp(s) === 4 && s.shield === true, [s.attack, E.hp(s), s.shield]); }

// ---- talent: two Divine Shield Soldiers ----
{ const st = game(); const b0 = st.players[0].board.length; play(st, 0, 'gideon_talent', null);
  const sol = st.players[0].board.filter(c => c.name === 'Soldier');
  ok('Talent summons two Soldiers with Divine Shield', st.players[0].board.length === b0 + 2 && sol.length === 2 && sol.every(c => c.shield === true), sol.map(c => c.shield)); }

// ---- triumph: mass +2/+2 and Divine Shield ----
{ const st = game(); const s = put(st, 0, '_sol'); play(st, 0, 'gideon_triumph', null);
  ok('Triumph gives your creatures +2/+2 and Divine Shield', s.attack === 4 && E.hp(s) === 4 && s.shield === true, [s.attack, E.hp(s), s.shield]); }

// ---- defeat Choose One (mode 1 = armor) ----
{ const st = game(); play(st, 0, 'gideon_defeat', null, 1);
  ok('Defeat (armor mode) gains 8 Armor', st.players[0].armor === 8, st.players[0].armor); }

// ---- resolve quest: 5 Soldiers -> mass buff + 10 armor ----
{ const st = game(); play(st, 0, 'gideon_resolve', null);
  ok('Resolve installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  for (let i = 0; i < 4; i++) play(st, 0, '_sol', null); // 4 Soldiers: not complete
  const notYet = st.players[0].quests.length === 1;
  play(st, 0, '_sol', null); // 5th Soldier completes it
  const sol = st.players[0].board.filter(c => c.id === '_sol');
  ok('Resolve rewards only after 5 Soldiers (+2/+2 & Divine Shield)', notYet && st.players[0].quests.length === 0 && sol.some(c => c.attack === 4 && c.shield === true), [notYet, st.players[0].quests.length, sol.map(c => c.attack + '/' + (c.shield ? 'DS' : '-'))]);
  ok('Resolve reward gains 10 Armor', st.players[0].armor === 10, st.players[0].armor); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
