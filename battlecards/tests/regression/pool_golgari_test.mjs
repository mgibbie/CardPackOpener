// pool_golgari_test.mjs — Golgari land pool (BG graveyard value: reanimation + aristocrats + Deathtouch + undergrowth).
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
const insects = (st, pi) => st.players[pi].board.filter(c => c.name === 'Insect').length;

const pool = raw.cards.filter(c => c.landSet === 'Golgari');
// ---- rubric ----
ok('Golgari pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl location/instant/enchantment/artifact', types.size >= 6 && ['location', 'instant', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BG', pool.every(c => (c.colors || []).slice().sort().join('') === 'BG'));

function game() {
  const st = E.createGame(byId, seededRng(43), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const foeTgt = c.id === 'vraska_golgari_conqueror';
  const frTgt = c.id === 'golgari_guildmage';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'golgari_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Jarad: reanimate on entry ----
{ const st = game(); const dead = put(st, 0, '_big'); kill(st, dead); const n0 = st.players[0].board.length;
  play(st, 0, 'jarad_golgari_rot_lord', null);
  ok('Jarad reanimates your highest-Attack dead creature', st.players[0].board.some(c => c.id === '_big') && st.players[0].board.length === n0 + 2, [n0, st.players[0].board.length]); }

// ---- Vraska: destroy ----
{ const st = game(); const foe = put(st, 1, '_big');
  play(st, 0, 'vraska_golgari_conqueror', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Vraska destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- Savra: aristocrat lifegain ----
{ const st = game(); put(st, 0, 'savra_queen_of_the_golgari'); const fodder = put(st, 0, '_v'); const life0 = st.players[0].life;
  kill(st, fodder);
  ok('Savra gains 2 life when a friendly creature dies', st.players[0].life === life0 + 2, [life0, st.players[0].life]); }

// ---- grave troll: Reborn ----
{ const st = game(); const gt = put(st, 0, 'golgari_grave_troll');
  kill(st, gt);
  ok('Grave-Troll Reborns (returns to the board)', st.players[0].board.some(c => c.id === 'golgari_grave_troll'), st.players[0].board.map(c => c.id)); }

// ---- brownscale: Deathrattle lifegain ----
{ const st = game(); const bs = put(st, 0, 'golgari_brownscale'); const life0 = st.players[0].life;
  kill(st, bs);
  ok('Brownscale Deathrattle gains 3 life', st.players[0].life === life0 + 3, [life0, st.players[0].life]); }

// ---- guildmage: +1/+1 and Deathtouch ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'golgari_guildmage', { type: 'creature', uid: v.uid, player: 0 });
  ok('Guildmage gives +1/+1 and Deathtouch', v.attack === a0 + 1 && has(v, 'deathtouch'), [a0, v.attack, v.keywords]); }

// ---- charm modal: sweep 1 (mode 0) ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'golgari_charm', null, 0);
  ok('Charm (sweep mode) deals 1 to all enemy creatures', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

// ---- charm modal: reanimate (mode 2) ----
{ const st = game(); const dead = put(st, 0, '_big'); kill(st, dead); const n0 = st.players[0].board.length;
  play(st, 0, 'golgari_charm', null, 2);
  ok('Charm (reanimate mode) returns a dead creature', st.players[0].board.length === n0 + 1, [n0, st.players[0].board.length]); }

// ---- germination enchantment: an Insect each turn ----
{ const st = game(); play(st, 0, 'golgari_germination', null); const i0 = insects(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Germination summons a 1/1 Deathtouch Insect at turn start', insects(st, 0) === i0 + 1 && st.players[0].board.some(c => c.name === 'Insect' && has(c, 'deathtouch')), [i0, insects(st, 0)]); }

// ---- keyrune: a 3/3 Deathtouch Beast ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'golgari_keyrune', null);
  ok('Keyrune summons a 3/3 Beast with Deathtouch', st.players[0].board.some(c => c.name === 'Beast' && c.attack === 3 && has(c, 'deathtouch')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'golgari_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'golgari_cluestone').uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- findbroker location: tap to reanimate ----
{ const st = game(); const dead = put(st, 0, '_big'); kill(st, dead); play(st, 0, 'golgari_findbroker', null);
  const loc = st.players[0].board.find(c => c.id === 'golgari_findbroker'); const n0 = st.players[0].board.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Findbroker taps to return a dead creature', st.players[0].board.some(c => c.id === '_big') && st.players[0].board.length === n0 + 1, [n0, st.players[0].board.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
