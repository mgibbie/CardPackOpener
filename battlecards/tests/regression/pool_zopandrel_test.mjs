// pool_zopandrel_test.mjs — Zopandrel boss pool (G Eldrazi: big bodies + devour enemies + fight + swarm/anthem growth).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 3, attack: 4, health: 3, rarity: 'common', tribe: 'Beast' };
byId._small = { id: '_small', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const mites = (st, pi) => st.players[pi].board.filter(c => c.name === 'Mite').length;

const pool = raw.cards.filter(c => c.loreDeck === 'Zopandrel');
// ---- rubric ----
ok('Zopandrel pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/enchantment/instant/quest', types.size >= 6 && ['weapon', 'enchantment', 'instant', 'quest'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Green', pool.every(c => (c.colors || []).join('') === 'G'));
ok('the boss (sig) devours enemies', byId.zopandrel_sig.type === 'creature' && byId.zopandrel_sig.effects.some(e => e.type === 'devour-enemy'));

function game() {
  const st = E.createGame(byId, seededRng(35), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['zopandrel_sig', 'zopandrel_apex_predator', 'zopandrel_devourer', 'zopandrel_maze_warden', 'zopandrel_beheading_strike', 'zopandrel_command'].includes(c.id);
  const frTgt = c.id === 'zopandrel_beast_trainer';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'zopandrel_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig: devour on entry (destroy + gain stats) ----
{ const st = game(); const foe = put(st, 1, '_v'); // 4/3
  play(st, 0, 'zopandrel_sig', { type: 'creature', uid: foe.uid, player: 1 });
  const sig = st.players[0].board.find(c => c.id === 'zopandrel_sig');
  ok('Sig devours an enemy on entry: destroyed + grew (7/7 -> 11/10)', !st.players[1].board.some(c => c.uid === foe.uid) && sig.attack === 11 && E.hp(sig) === 10, [sig.attack, E.hp(sig), st.players[1].board.length]); }

// ---- sig: devours a random enemy when it attacks ----
{ const st = game(); const sig = put(st, 0, 'zopandrel_sig'); const foe = put(st, 1, '_v'); const a0 = sig.attack;
  E.attack(st, 0, sig.uid, { type: 'hero', player: 1 }); E.sweepDeaths(st);
  ok('Sig devours a random enemy on attack (enemy gone, sig grew)', !st.players[1].board.some(c => c.uid === foe.uid) && sig.attack === a0 + 4, [a0, sig.attack, st.players[1].board.length]); }

// ---- apex predator: devour target + neighbors ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v'); const c = put(st, 1, '_v'); // 3 in a row
  play(st, 0, 'zopandrel_apex_predator', { type: 'creature', uid: b.uid, player: 1 });
  ok('Apex Predator devours the target and its neighbors (board cleared)', st.players[1].board.length === 0, st.players[1].board.length); }

// ---- behemoth overkill: grows on overkill ----
{ const st = game(); const beh = put(st, 0, 'zopandrel_behemoth'); const chump = put(st, 1, '_small'); const a0 = beh.attack;
  E.attack(st, 0, beh.uid, { type: 'creature', uid: chump.uid, player: 1 }); E.sweepDeaths(st);
  ok('Behemoth Overkill: +2/+2 after crushing a small creature', beh.attack === a0 + 2, [a0, beh.attack]); }

// ---- maze warden: fights an enemy on entry ----
{ const st = game(); const foe = put(st, 1, '_wall'); // 3/4; warden is 3/5
  play(st, 0, 'zopandrel_maze_warden', { type: 'creature', uid: foe.uid, player: 1 });
  const warden = st.players[0].board.find(c => c.id === 'zopandrel_maze_warden');
  ok('Maze Warden fights an enemy on entry (both take damage)', foe.damage === 3 && warden.damage === 3, [foe.damage, warden.damage]); }

// ---- beast trainer: buff a friendly + trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'zopandrel_beast_trainer', { type: 'creature', uid: v.uid, player: 0 });
  ok('Beast Trainer gives +2/+2 and Trample', v.attack === a0 + 2 && (v.keywords || []).includes('trample'), [a0, v.attack, v.keywords]); }

// ---- mite swarm: three Mites ----
{ const st = game(); const m0 = mites(st, 0);
  play(st, 0, 'zopandrel_mite_swarm', null);
  ok('Mite Swarm summons three 1/1 Mites', mites(st, 0) === m0 + 3, [m0, mites(st, 0)]); }

// ---- scythestrike weapon: a Mite when the hero attacks ----
{ const st = game(); play(st, 0, 'zopandrel_scythestrike', null); const m0 = mites(st, 0);
  ok('Scythestrike equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Scythestrike summons a Mite after the hero attacks', mites(st, 0) === m0 + 1, [m0, mites(st, 0)]); }

// ---- murmuring maze-song: +1/+1 each turn ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'zopandrel_murmuring_maze_song', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Maze-Song gives your creatures +1/+1 at turn start', v.attack === a0 + 1 && E.hp(v) === 4, [a0, v.attack, E.hp(v)]); }

// ---- uncaring cruelty: sweep enemy creatures ----
{ const st = game(); const a = put(st, 1, '_wall'); const b = put(st, 1, '_wall');
  play(st, 0, 'zopandrel_uncaring_cruelty', null);
  ok('Uncaring Cruelty deals 3 to all enemy creatures', a.damage === 3 && b.damage === 3, [a.damage, b.damage]); }

// ---- command modal: 6/6 body (mode 2) ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'zopandrel_command', null, 2);
  ok('Command (body mode) makes a 6/6 Eldrazi with Trample', st.players[0].board.some(c => c.name === 'Eldrazi' && c.attack === 6 && (c.keywords || []).includes('trample')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name + c.attack)); }

// ---- feast quest: summon 5 -> reward ----
{ const st = game(); play(st, 0, 'zopandrel_feast', null);
  ok('Feast installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  const pre = put(st, 0, '_v'); const pa0 = pre.attack;
  for (let i = 0; i < 5; i++) play(st, 0, '_small', null);
  ok('Feast reward: your creatures get +2/+2', pre.attack >= pa0 + 2, [pa0, pre.attack]);
  ok('Feast reward: a 7/7 Eldrazi appears', st.players[0].board.some(c => c.name === 'Eldrazi' && c.attack >= 7), st.players[0].board.map(c => c.name + c.attack)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
