// pool_mogis_test.mjs — Mogis land pool (BR devotion: aggro Minotaurs + burn + sacrifice punishment).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Mogis');
// ---- rubric ----
ok('Mogis pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/secret/enchantment/artifact', types.size >= 6 && ['instant', 'secret', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BR', pool.every(c => (c.colors || []).slice().sort().join('') === 'BR'));

function game() {
  const st = E.createGame(byId, seededRng(58), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_wall'); let threw = null;
  const tgt = (c.id === 'mogis_favor') ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry burn + turn-start slaughter ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'mogis_god_of_slaughter', null);
  ok('Mogis battlecry deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Mogis turn-start deals 2 more to the opponent', st.players[1].life === life0 - 5, [life0, st.players[1].life]); }

// ---- fanatic: burn ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'fanatic_of_mogis', null);
  ok('Fanatic deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- marauder: give Rush ----
{ const st = game(); const v = put(st, 0, '_v', true);
  play(st, 0, 'mogis_marauder', null);
  ok('Marauder gives your creatures Rush', has(v, 'rush'), v.keywords); }

// ---- slaughter priest: sac -> burn ----
{ const st = game(); put(st, 0, '_v'); const life0 = st.players[1].life; const g0 = st.players[0].graveyard.length;
  play(st, 0, 'slaughter_priest_of_mogis', null);
  ok('Slaughter-Priest sacrifices a creature and deals 3 to the opponent', st.players[1].life === life0 - 3 && st.players[0].graveyard.length > g0, [life0, st.players[1].life, g0, st.players[0].graveyard.length]); }

// ---- soulreaper: aristocrat grower ----
{ const st = game(); const sr = put(st, 0, 'soulreaper_of_mogis'); const fodder = put(st, 0, '_v'); const a0 = sr.attack;
  kill(st, fodder);
  ok('Soulreaper gains +1/+1 when a friendly creature dies', sr.attack === a0 + 1, [a0, sr.attack]); }

// ---- warleader: +2/+1 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'mogis_warleader', null);
  ok('Warleader gives your creatures +2/+1', v.attack === a0 + 2, [a0, v.attack]); }

// ---- favor: +2/+1 and Charge ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'mogis_favor', { type: 'creature', uid: v.uid, player: 0 });
  ok('Favor gives +2/+1 and Charge', v.attack === a0 + 2 && has(v, 'charge'), [a0, v.attack, v.keywords]); }

// ---- spite secret: destroy an attacker ----
{ const st = game(); play(st, 0, 'spite_of_mogis', null);
  ok('Spite installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const foe = put(st, 1, '_wall'); foe.sick = false; st.current = 1;
  E.attack(st, 1, foe.uid, { type: 'hero', player: 0 }); E.sweepDeaths(st);
  ok('Spite destroys the attacking enemy', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- hymn: face burn ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'hymn_of_mogis', null);
  ok('Hymn deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- red eye enchantment: recurring burn ----
{ const st = game(); const a = put(st, 1, '_v'); play(st, 0, 'red_eye_of_mogis', null); const life0 = st.players[1].life;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Red Eye deals 1 to all enemy creatures and 1 to the opponent', a.damage === 1 && st.players[1].life === life0 - 1, [a.damage, life0, st.players[1].life]); }

// ---- dictate artifact: tap for burn ----
{ const st = game(); play(st, 0, 'dictate_of_mogis', null); const life0 = st.players[1].life;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'dictate_of_mogis').uid, null);
  ok('Dictate taps to deal 2 to the opponent', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
