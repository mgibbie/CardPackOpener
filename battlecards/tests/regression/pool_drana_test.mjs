// pool_drana_test.mjs — Drana boss pool (B go-tall evasive vampire aggro: First Strike + attack-pumps + tribal scaling).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._vamp = { id: '_vamp', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Vampire' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Drana');
// ---- rubric ----
ok('Drana pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/enchantment/instant/quest', types.size >= 6 && ['weapon', 'enchantment', 'instant', 'quest'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords incl first_strike', kws.size >= 6 && kws.has('first_strike'), [...kws]);
ok('stays mono-Black', pool.every(c => (c.colors || []).join('') === 'B'));
ok('>=4 persistent engines', pool.filter(c => c.ongoing || c.aura || c.selfScale).length >= 4, pool.filter(c => c.ongoing || c.aura || c.selfScale).map(c => c.id));
ok('the boss (sig) is a Vampire creature commander that pumps on attack', byId.drana_sig.type === 'creature' && (byId.drana_sig.tribe || '').includes('Vampire') && byId.drana_sig.ongoing && byId.drana_sig.ongoing.on === 'self-attacks');

function game() {
  const st = E.createGame(byId, seededRng(28), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_vamp', '_vamp', '_vamp', '_vamp', '_vamp', '_vamp']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._vamp, pi)); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_vamp'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const needsFoe = ['drana_silencer', 'drana_hunger', 'drana_command'].includes(c.id);
  const tgt = needsFoe ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'drana_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig: attacking pumps your team (+1/+1 counters) ----
{ const st = game(); const drana = put(st, 0, 'drana_sig'); const ally = put(st, 0, '_vamp'); const a0 = ally.attack, h0 = E.hp(ally);
  E.attack(st, 0, drana.uid, { type: 'hero', player: 1 });
  ok('Drana boss: attacking gives your creatures +1/+1', ally.attack === a0 + 1 && E.hp(ally) === h0 + 1, [a0, ally.attack, h0, E.hp(ally)]); }

// ---- chosen: Vampire lord aura ----
{ const st = game(); put(st, 0, 'drana_chosen'); const v = put(st, 0, '_vamp'); E.recomputeAuras(st);
  ok('Chosen buffs other Vampires +1/+1', v.attack === 3 && E.hp(v) === 3, [v.attack, E.hp(v)]); }

// ---- bloodlord: +1 Attack per other Vampire ----
{ const st = game(); const bl = put(st, 0, 'drana_bloodlord'); put(st, 0, '_vamp'); put(st, 0, '_vamp'); E.recomputeAuras(st);
  ok('Bloodlord gains +1 Attack per other Vampire', bl.attack === 4 + 2, bl.attack); }

// ---- scavenger: grows when a friendly creature dies ----
{ const st = game(); const scav = put(st, 0, 'drana_scavenger'); const fodder = put(st, 0, '_vamp'); const a0 = scav.attack;
  fodder.damage = fodder.maxHealth; E.sweepDeaths(st);
  ok('Scavenger gains +1/+1 when a friendly creature dies', scav.attack === a0 + 1, [a0, scav.attack]); }

// ---- bloodthirst enchantment: +1/+0 to the team each turn start ----
{ const st = game(); const v = put(st, 0, '_vamp'); play(st, 0, 'drana_bloodthirst', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Bloodthirst gives your creatures +1/+0 at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- defiance weapon: lifesteal + pumps team after hero attacks ----
{ const st = game(); const v = put(st, 0, '_vamp'); play(st, 0, 'drana_defiance', null);
  const w = st.players[0].weapon; const a0 = v.attack;
  ok('Defiance equips a Lifesteal weapon', w && (w.keywords || []).includes('lifesteal'), w && w.keywords);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Defiance gives your creatures +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

// ---- command modal: summon a 4/4 Vampire (mode 2) ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'drana_command', null, 2);
  ok('Command (summon mode) makes a 4/4 Vampire with Lifesteal', st.players[0].board.some(c => c.name === 'Vampire' && c.attack === 4 && (c.keywords || []).includes('lifesteal')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name + c.attack)); }

// ---- command modal: team +2/+1 and First Strike (mode 1) ----
{ const st = game(); const v = put(st, 0, '_vamp'); const a0 = v.attack;
  play(st, 0, 'drana_command', null, 1);
  ok('Command (anthem mode) gives +2/+1 and First Strike', v.attack === a0 + 2 && (v.keywords || []).includes('first_strike'), [a0, v.attack, v.keywords]); }

// ---- mind drain instant: opponent discards 2 ----
{ const st = game(); hand(st, 1, 3);
  play(st, 0, 'drana_mind_drain', null);
  ok('Mind Drain: opponent discards 2 cards', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- silencer: battlecry silence ----
{ const st = game(); const foe = put(st, 1, 'drana_chosen'); // a creature with an aura/keywords to strip
  play(st, 0, 'drana_silencer', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Silencer battlecry silences a creature', (foe.keywords || []).length === 0 && !foe.aura, [foe.keywords, !!foe.aura]); }

// ---- first strike combat: kills the blocker before taking damage ----
{ const st = game(); const knight = put(st, 0, 'drana_vampire_knight'); const foe = put(st, 1, '_wall'); // 4/3 FS vs 3/4
  E.attack(st, 0, knight.uid, { type: 'creature', uid: foe.uid, player: 1 });
  E.sweepDeaths(st);
  ok('First Strike: the 3/4 blocker dies and the knight takes no damage', !st.players[1].board.some(c => c.uid === foe.uid) && knight.damage === 0, [st.players[1].board.length, knight.damage]); }

// ---- quest bloodrite: play 5 cards -> reward ----
{ const st = game(); play(st, 0, 'drana_bloodrite', null);
  ok('Bloodrite installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  const pre = put(st, 0, '_vamp'); const pa0 = pre.attack;
  for (let i = 0; i < 5; i++) play(st, 0, '_vamp', null);
  ok('Bloodrite reward: a 5/5 First Strike Vampire appears', st.players[0].board.some(c => c.attack >= 5 && c.name === 'Vampire' && (c.keywords || []).includes('first_strike')), st.players[0].board.map(c => c.name + c.attack));
  ok('Bloodrite reward: your creatures get +1/+1', pre.attack >= pa0 + 1, [pa0, pre.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
