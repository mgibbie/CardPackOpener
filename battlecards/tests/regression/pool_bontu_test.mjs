// pool_bontu_test.mjs — Bontu land pool (B devotion: sacrifice/aristocrats + drain + removal + deathtouch).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 5, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Bontu');
// ---- rubric ----
ok('Bontu pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/location/enchantment/artifact', types.size >= 6 && ['instant', 'location', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Black', pool.every(c => (c.colors || []).join('') === 'B'));

function game() {
  const st = E.createGame(byId, seededRng(66), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_big'); hand(st, 1, 2); let threw = null;
  const frTgt = c.id === 'bontus_cartouche';
  const foeTgt = ['bontus_maelstrom', 'bontus_despark'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: sac + drain + draw ----
{ const st = game(); put(st, 0, '_v'); const life0 = st.players[1].life; const g0 = st.players[0].graveyard.length; const h0 = st.players[0].hand.length;
  play(st, 0, 'god_eternal_bontu', null);
  ok('Bontu: sac a creature, opponent loses 3, you draw 2', st.players[1].life === life0 - 3 && st.players[0].hand.length === h0 + 2 && st.players[0].graveyard.length > g0, [life0, st.players[1].life, h0, st.players[0].hand.length]); }

// ---- acolyte: aristocrat lifegain ----
{ const st = game(); put(st, 0, 'bontu_acolyte'); const fodder = put(st, 0, '_v'); const life0 = st.players[0].life;
  kill(st, fodder);
  ok('Acolyte gains 1 life when a friendly creature dies', st.players[0].life === life0 + 1, [life0, st.players[0].life]); }

// ---- last reckoning: board wipe ----
{ const st = game(); const mine = put(st, 0, '_v'); const foe = put(st, 1, '_big');
  play(st, 0, 'bontus_last_reckoning', null); E.sweepDeaths(st);
  ok('Last Reckoning destroys all creatures', !st.players[0].board.some(c => c.uid === mine.uid) && !st.players[1].board.some(c => c.uid === foe.uid), [st.players[0].board.length, st.players[1].board.length]); }

// ---- ambition: draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'ambition_of_bontu', null);
  ok('Ambition draws 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- cartouche: +1/+1 and Lifesteal ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'bontus_cartouche', { type: 'creature', uid: v.uid, player: 0 });
  ok('Cartouche gives +1/+1 and Lifesteal', v.attack === a0 + 1 && has(v, 'lifesteal'), [a0, v.attack]); }

// ---- scarab swarm location: tap for an Insect ----
{ const st = game(); play(st, 0, 'bontus_scarab_swarm', null); const loc = st.players[0].board.find(c => c.id === 'bontus_scarab_swarm'); const i0 = st.players[0].board.filter(c => c.name === 'Insect').length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Scarab Swarm taps for a 1/1 Deathtouch Insect', st.players[0].board.some(c => c.name === 'Insect' && has(c, 'deathtouch')) && st.players[0].board.filter(c => c.name === 'Insect').length === i0 + 1, st.players[0].board.map(c => c.name)); }

// ---- painful lesson: draw + drain ----
{ const st = game(); const h0 = st.players[0].hand.length; const life0 = st.players[1].life;
  play(st, 0, 'bontus_painful_lesson', null);
  ok('Painful Lesson draws and deals 2 to the opponent', st.players[0].hand.length === h0 + 1 && st.players[1].life === life0 - 2, [h0, st.players[0].hand.length, life0, st.players[1].life]); }

// ---- maelstrom: removal + drain ----
{ const st = game(); const foe = put(st, 1, '_big'); const life0 = st.players[1].life;
  play(st, 0, 'bontus_maelstrom', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Maelstrom destroys a creature and deals 2 to the opponent', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].life === life0 - 2, [st.players[1].board.length, life0, st.players[1].life]); }

// ---- sacrifice to bontu: sac for cards ----
{ const st = game(); put(st, 0, '_v'); const h0 = st.players[0].hand.length; const g0 = st.players[0].graveyard.length;
  play(st, 0, 'sacrifice_to_bontu', null);
  ok('Sacrifice to Bontu sacs a creature and draws 2', st.players[0].hand.length === h0 + 2 && st.players[0].graveyard.length > g0, [h0, st.players[0].hand.length]); }

// ---- despark: destroy a big creature ----
{ const st = game(); const foe = put(st, 1, '_big'); // 6 Attack
  play(st, 0, 'bontus_despark', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Despark destroys a creature with 4+ Attack', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- barren heart enchantment: discard + drain each turn ----
{ const st = game(); hand(st, 1, 2); play(st, 0, 'barren_heart_of_bontu', null); const life0 = st.players[1].life;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Barren Heart: opponent discards and takes 1 at turn start', st.players[1].hand.length === 1 && st.players[1].life === life0 - 1, [st.players[1].hand.length, life0, st.players[1].life]); }

// ---- vindication artifact: tap to discard ----
{ const st = game(); hand(st, 1, 2); play(st, 0, 'vindication_of_bontu', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'vindication_of_bontu').uid, null);
  ok('Vindication taps to make the opponent discard', st.players[1].hand.length === 1, st.players[1].hand.length); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
