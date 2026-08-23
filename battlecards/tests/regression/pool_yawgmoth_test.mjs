// pool_yawgmoth_test.mjs — Yawgmoth boss pool (B aristocrats: sacrifice -> draw + -1/-1 counters + proliferate + recursion).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 5, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Yawgmoth');
// ---- rubric ----
ok('Yawgmoth pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/enchantment/quest/instant', types.size >= 6 && ['weapon', 'enchantment', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Black', pool.every(c => (c.colors || []).join('') === 'B'));
ok('the boss (sig) turns deaths into cards', byId.yawgmoth_sig.type === 'creature' && byId.yawgmoth_sig.ongoing && byId.yawgmoth_sig.ongoing.on === 'friendly-creature-died');

function game() {
  const st = E.createGame(byId, seededRng(32), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_big'); let threw = null;
  const foeTgt = ['yawgmoth_cruelty', 'yawgmoth_edict', 'yawgmoth_command'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'yawgmoth_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig death-engine: a friendly death draws + shrinks a random enemy ----
{ const st = game(); put(st, 0, 'yawgmoth_sig'); const fodder = put(st, 0, '_v'); const foe = put(st, 1, '_v');
  const h0 = st.players[0].hand.length; const fa0 = foe.attack;
  kill(st, fodder);
  ok('Sig: a friendly death draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
  ok('Sig: a friendly death puts a -1/-1 counter on a random enemy', foe.attack === fa0 - 1, [fa0, foe.attack]); }

// ---- sig battlecry: sacrifice + draw ----
{ const st = game(); const fodder = put(st, 0, '_v'); const g0 = st.players[0].graveyard.length; const h0 = st.players[0].hand.length;
  play(st, 0, 'yawgmoth_sig', null);
  ok('Sig battlecry sacrifices a friendly creature', st.players[0].graveyard.length > g0, [g0, st.players[0].graveyard.length]);
  ok('Sig battlecry draws (at least the battlecry card)', st.players[0].hand.length >= h0 + 1, [h0, st.players[0].hand.length]); }

// ---- demon: grows on friendly deaths ----
{ const st = game(); const dem = put(st, 0, 'yawgmoth_demon'); const fodder = put(st, 0, '_v'); const a0 = dem.attack;
  kill(st, fodder);
  ok('Demon gains +1/+1 when a friendly creature dies', dem.attack === a0 + 1, [a0, dem.attack]); }

// ---- reaper: shrinks a random enemy on friendly death ----
{ const st = game(); put(st, 0, 'yawgmoth_reaper'); const fodder = put(st, 0, '_v'); const foe = put(st, 1, '_v'); const fa0 = foe.attack;
  kill(st, fodder);
  ok('Reaper: a friendly death puts a -1/-1 counter on a random enemy', foe.attack === fa0 - 1, [fa0, foe.attack]); }

// ---- immortal: Reborn + Deathrattle proliferate fires on BOTH deaths ----
{ const st = game(); const imm = put(st, 0, 'yawgmoth_immortal'); const ally = put(st, 0, '_v'); const a0 = ally.attack;
  kill(st, imm);
  ok('Immortal Deathrattle grows the team on first death', ally.attack === a0 + 1, [a0, ally.attack]);
  ok('Immortal Reborns (returns to the board)', st.players[0].board.some(c => c.id === 'yawgmoth_immortal'));
  const back = st.players[0].board.find(c => c.id === 'yawgmoth_immortal'); kill(st, back);
  ok('Immortal Deathrattle grows the team again on the final death', ally.attack === a0 + 2, [a0, ally.attack]); }

// ---- agenda enchantment: proliferate each turn ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'yawgmoth_agenda', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Agenda puts a +1/+1 counter on your creatures each turn', v.attack === a0 + 1 && E.hp(v) === 4, [a0, v.attack, E.hp(v)]); }

// ---- vile offering weapon: shrink a random enemy on hero attack ----
{ const st = game(); const foe = put(st, 1, '_v'); play(st, 0, 'yawgmoth_vile_offering', null); const fa0 = foe.attack;
  ok('Vile Offering equips a Lifesteal weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('lifesteal'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Vile Offering puts a -1/-1 counter on a random enemy after the hero attacks', foe.attack === fa0 - 1, [fa0, foe.attack]); }

// ---- cruelty instant: -2/-2 counter + cantrip ----
{ const st = game(); const foe = put(st, 1, '_big'); const a0 = foe.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'yawgmoth_cruelty', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Cruelty puts -2/-2 on a creature and draws', foe.attack === a0 - 2 && st.players[0].hand.length === h0 + 1, [a0, foe.attack, h0, st.players[0].hand.length]); }

// ---- bargain: sacrifice for 3 cards ----
{ const st = game(); put(st, 0, '_v'); const h0 = st.players[0].hand.length; const g0 = st.players[0].graveyard.length;
  play(st, 0, 'yawgmoth_bargain', null);
  ok('Bargain sacrifices a creature and draws 3', st.players[0].hand.length === h0 + 3 && st.players[0].graveyard.length > g0, [h0, st.players[0].hand.length]); }

// ---- plague: mass -2/-2 ----
{ const st = game(); const a = put(st, 1, '_big'); const b = put(st, 1, '_big');
  play(st, 0, 'yawgmoth_plague', null);
  ok('Plague gives all enemy creatures -2/-2', a.attack === 4 && b.attack === 4 && E.hp(a) === 4, [a.attack, b.attack, E.hp(a)]); }

// ---- contagion: enemies -1/-1, your creatures +1/+1 ----
{ const st = game(); const mine = put(st, 0, '_v'); const foe = put(st, 1, '_v'); const ma0 = mine.attack, fa0 = foe.attack;
  play(st, 0, 'yawgmoth_contagion', null);
  ok('Contagion shrinks enemies and grows your creatures', foe.attack === fa0 - 1 && mine.attack === ma0 + 1, [fa0, foe.attack, ma0, mine.attack]); }

// ---- command modal: resurrect (mode 2) ----
{ const st = game(); const dead = put(st, 0, '_big'); kill(st, dead); const n0 = st.players[0].board.length;
  play(st, 0, 'yawgmoth_command', null, 2);
  ok('Command (reanimate mode) returns a dead creature', st.players[0].board.length === n0 + 1, [n0, st.players[0].board.length]); }

// ---- will quest: 6 deaths -> reward ----
{ const st = game(); play(st, 0, 'yawgmoth_will', null);
  ok('Will installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  const h0 = st.players[0].hand.length;
  for (let i = 0; i < 6; i++) { const f = put(st, 0, '_v'); kill(st, f); }
  ok('Will reward: draw 2 (and reanimate) after 6 deaths', st.players[0].hand.length >= h0 + 2, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
