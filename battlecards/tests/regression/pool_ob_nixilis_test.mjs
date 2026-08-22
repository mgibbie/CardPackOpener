// pool_ob_nixilis_test.mjs — Ob Nixilis pool redesign (B demons + drain + sacrifice aristocrats).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._dem = { id: '_dem', name: 'D', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', tribe: 'Demon' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Ob Nixilis');
// ---- rubric ----
ok('Ob Nixilis pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/weapon/enchantment/quest/instant', types.size >= 6 && ['planeswalker', 'weapon', 'enchantment', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura).length >= 3, pool.filter(c => c.ongoing || c.aura).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(9), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const kill = (st, c) => { c.damage = c.maxHealth; c.shield = false; E.sweepDeaths(st); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_dem'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['ob_nixilis_fall', 'ob_nixilis_grasp'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'ob_nixilis_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- vengeance: Demon anthem ----
{ const st = game(); play(st, 0, 'ob_nixilis_vengeance', null); const d = put(st, 0, '_dem'); E.recomputeAuras(st);
  ok('Vengeance gives Demons +1/+1', d.attack === 4 && E.hp(d) === 4, [d.attack, E.hp(d)]); }

// ---- torment: aristocrats drain on a friendly death ----
{ const st = game(); put(st, 0, 'ob_nixilis_torment'); const fodder = put(st, 0, '_v'); const foeLife = st.players[1].life;
  kill(st, fodder);
  ok('Torment drains 1 from each opponent when a friendly dies', st.players[1].life === foeLife - 1, [foeLife, st.players[1].life]); }

// ---- cruelty: sacrifice a friendly, draw 2, drain 2 ----
{ const st = game(); const fodder = put(st, 0, '_v'); const h0 = st.players[0].hand.length; const foeLife = st.players[1].life;
  play(st, 0, 'ob_nixilis_cruelty', null);
  ok('Cruelty sacrifices a friendly, draws 2, drains 2', !st.players[0].board.some(c => c.uid === fodder.uid) && st.players[0].hand.length === h0 + 2 && st.players[1].life === foeLife - 2, [st.players[0].board.length, st.players[0].hand.length - h0, foeLife - st.players[1].life]); }

// ---- chain veil weapon: drain 1 after the hero attacks ----
{ const st = game(); play(st, 0, 'ob_nixilis_chain_veil', null);
  const w = st.players[0].weapon; ok('Chain Veil equips (3/2, Lifesteal)', w && w.attack === 3 && (w.keywords || []).includes('lifesteal'), w && [w.attack, w.keywords]);
  const foeLife = st.players[1].life; E.fireOngoing(st, 0, 'hero-attacks');
  ok('Chain Veil drains 1 after the hero attacks', st.players[1].life === foeLife - 1, [foeLife, st.players[1].life]); }

// ---- demon: battlecry drain 3 + reborn ----
{ const st = game(); const foeLife = st.players[1].life;
  const d = play(st, 0, 'ob_nixilis_demon', null).c;
  ok('Demon battlecry drains 3 and has Reborn', st.players[1].life === foeLife - 3 && (d.keywords || []).includes('reborn'), [foeLife, st.players[1].life, d.keywords]); }

// ---- command Choose One (mode 1 = drain finish) ----
{ const st = game(); st.players[0].life = 20; const foeLife = st.players[1].life;
  play(st, 0, 'ob_nixilis_command', null, 1);
  ok('Command (drain mode) deals 4 to each opponent and heals 4', st.players[1].life === foeLife - 4 && st.players[0].life === 24, [foeLife, st.players[1].life, st.players[0].life]); }

// ---- malediction quest: 6 deaths -> drain 8 + gain 8 ----
{ const st = game(); st.players[0].life = 20; play(st, 0, 'ob_nixilis_malediction', null);
  ok('Malediction installs as a quest', st.players[0].quests.length === 1);
  const foeLife = st.players[1].life;
  for (let i = 0; i < 6; i++) { const c = put(st, 0, '_v'); kill(st, c); }
  ok('Malediction reward drains 8 from each opponent', st.players[1].life === foeLife - 8, [foeLife, st.players[1].life]);
  ok('Malediction reward heals the hero 8', st.players[0].life === 28, st.players[0].life); }

// ---- void titan: massive drain finisher ----
{ const st = game(); const foeLife = st.players[1].life;
  play(st, 0, 'ob_nixilis_void_titan', null);
  ok('Void Titan battlecry drains 4', st.players[1].life === foeLife - 4 && ['lifesteal', 'trample'].every(k => byId.ob_nixilis_void_titan.keywords.includes(k)), [foeLife, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
