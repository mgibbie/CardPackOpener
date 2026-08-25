// pool_starnheim_test.mjs — Starnheim land pool (WB / Kaldheim realm, 30 cards: Angels/Valkyries + lifegain/lifedrain + reanimation + go-wide + board wipes).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'Big', type: 'creature', cost: 8, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const angels = (st, pi) => st.players[pi].board.filter(c => c.name === 'Angel').length;

const pool = raw.cards.filter(c => c.landSet === 'Starnheim');
// ---- rubric ----
ok('Starnheim pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WB', pool.every(c => JSON.stringify(c.colors) === '["W","B"]'));
ok('all names contain Starnheim + uncollectible', pool.every(c => /starnheim/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(104), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['firjas_retribution'].includes(c.id);
  const frTgt = ['starnheim_aspirant', 'angelfire_ignition'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Firja: reanimate ----
{ const st = game(); const big = put(st, 0, '_big'); kill(st, big);
  play(st, 0, 'firja_judge_of_valor', null);
  ok('Firja returns a dead creature', st.players[0].board.some(c => c.id === '_big'), st.players[0].board.map(c => c.id)); }

// ---- Valkyrie Harbinger: an Angel ----
{ const st = game(); const a0 = angels(st, 0);
  play(st, 0, 'valkyrie_harbinger', null);
  ok('Valkyrie Harbinger summons a lifesteal Angel', angels(st, 0) === a0 + 1 && st.players[0].board.some(c => c.name === 'Angel' && has(c, 'lifesteal')), [a0, angels(st, 0)]); }

// ---- unleashed sorcery: two 4/4 Angels ----
{ const st = game(); const a0 = angels(st, 0);
  play(st, 0, 'starnheim_unleashed', null);
  const ang = st.players[0].board.find(c => c.name === 'Angel');
  ok('Unleashed summons two 4/4 Angels', angels(st, 0) === a0 + 2 && ang && ang.attack === 4, [a0, angels(st, 0)]); }

// ---- monument location: tap for an Angel ----
{ const st = game(); play(st, 0, 'starnheim_monument', null); const loc = st.players[0].board.find(c => c.id === 'starnheim_monument'); const a0 = angels(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for a lifesteal Angel', angels(st, 0) === a0 + 1, [a0, angels(st, 0)]); }

// ---- astral wheel enchantment: turn-start draw ----
{ const st = game(); play(st, 0, 'starnheim_astral_wheel', null); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Astral Wheel draws a card at turn start', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- search for glory artifact: tap draw ----
{ const st = game(); play(st, 0, 'search_for_glory', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'search_for_glory').uid, null);
  E.resolveScry(st, []); ok('Search for Glory taps to draw', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- doomskar: board wipe ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'doomskar', null);
  ok('Doomskar deals 5 to all enemy creatures', a.damage === 5 && b.damage === 5, [a.damage, b.damage]); }

// ---- NEW Valkyrie's Sword weapon: lifegain on hero attack ----
{ const st = game(); play(st, 0, 'starnheim_valkyries_sword', null); const life0 = st.players[0].life;
  ok("Valkyrie's Sword equips a weapon", !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok("Valkyrie's Sword gains 1 life after the hero attacks", st.players[0].life === life0 + 1, [life0, st.players[0].life]); }

// ---- NEW Halvar: team anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'starnheim_halvar', null);
  ok('Halvar gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
