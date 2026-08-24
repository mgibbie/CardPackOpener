// pool_witherbloom_test.mjs — Witherbloom land pool (BG devotion: Pests + sacrifice value + lifegain payoff + drain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 2, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const pests = (st, pi) => st.players[pi].board.filter(c => c.name === 'Pest').length;

const pool = raw.cards.filter(c => c.landSet === 'Witherbloom');
// ---- rubric ----
ok('Witherbloom pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BG', pool.every(c => (c.colors || []).slice().sort().join('') === 'BG'));

function game() {
  const st = E.createGame(byId, seededRng(73), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = c.id === 'witherbloom_charm';
  const foeTgt = c.id === 'witherbloom_command';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Pest gives 1 life on death ----
{ const st = game(); play(st, 0, 'witherbloom_witch', null); const life0 = st.players[0].life;
  ok('Witch summons two Pests', pests(st, 0) === 2, pests(st, 0));
  const pest = st.players[0].board.find(c => c.name === 'Pest');
  kill(st, pest);
  ok('a Pest gives 1 life when it dies', st.players[0].life === life0 + 1, [life0, st.players[0].life]); }

// ---- Beledros: turn-start Pest ----
{ const st = game(); play(st, 0, 'beledros_witherbloom', null); const p0 = pests(st, 0);
  ok('Beledros battlecry summons two Pests', p0 === 2, p0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Beledros summons a Pest at start of turn', pests(st, 0) === p0 + 1, [p0, pests(st, 0)]); }

// ---- apprentice: drain 1 ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'witherbloom_apprentice', null);
  ok('Apprentice drains 1', st.players[1].life === foeLife0 - 1 && st.players[0].life === myLife0 + 1, [foeLife0, st.players[1].life]); }

// ---- potionmaster: Blood Artist drain on friendly death ----
{ const st = game(); put(st, 0, 'witherbloom_potionmaster'); const fodder = put(st, 0, '_v');
  const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  kill(st, fodder);
  ok('Potionmaster drains 1 when a friendly dies', st.players[1].life === foeLife0 - 1 && st.players[0].life === myLife0 + 1, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- pledgemage enchantment: lifegain payoff (bolster) ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'witherbloom_pledgemage', null); const a0 = v.attack;
  play(st, 0, 'witherbloom_librarian', null); // gains 2 life -> bolster
  ok('Pledgemage bolsters your weakest creature when you gain life', v.attack === a0 + 1, [a0, v.attack]); }

// ---- command: destroy small creature + gain 2 ----
{ const st = game(); const foe = put(st, 1, '_wall'); const myLife0 = st.players[0].life; // wall is 2 Attack
  play(st, 0, 'witherbloom_command', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Command destroys a <=3 Attack creature and gains 2', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].life === myLife0 + 2, [st.players[1].board.length, myLife0, st.players[0].life]); }

// ---- tangletrap: sweep ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'witherbloom_tangletrap', null);
  ok('Tangletrap deals 2 to all enemy creatures', a.damage === 2 && b.damage === 2, [a.damage, b.damage]); }

// ---- charm: +2/+2 and Deathtouch ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'witherbloom_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and Deathtouch', v.attack === a0 + 2 && has(v, 'deathtouch'), [a0, v.attack, v.keywords]); }

// ---- concoction artifact: tap draw + gain 2 ----
{ const st = game(); play(st, 0, 'witherbloom_concoction', null); const h0 = st.players[0].hand.length; const myLife0 = st.players[0].life;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'witherbloom_concoction').uid, null);
  ok('Concoction taps to draw and gain 2 life', st.players[0].hand.length === h0 + 1 && st.players[0].life === myLife0 + 2, [h0, st.players[0].hand.length, myLife0, st.players[0].life]); }

// ---- vineclinger location: tap for a Pest ----
{ const st = game(); play(st, 0, 'witherbloom_vineclinger', null); const loc = st.players[0].board.find(c => c.id === 'witherbloom_vineclinger'); const p0 = pests(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Vineclinger taps for a Pest', pests(st, 0) === p0 + 1, [p0, pests(st, 0)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
