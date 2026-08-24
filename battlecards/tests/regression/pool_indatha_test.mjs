// pool_indatha_test.mjs — Indatha land pool (WBG / Abzan tri-color: deathtouch menagerie + reanimation + lifedrain + counters).
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
const nightmares = (st, pi) => st.players[pi].board.filter(c => c.name === 'Nightmare').length;

const pool = raw.cards.filter(c => c.landSet === 'Indatha');
// ---- rubric ----
ok('Indatha pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WBG (order W,B,G)', pool.every(c => JSON.stringify(c.colors) === '["W","B","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(81), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['indatha_charm', 'indatha_command', 'indatha_mythos'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Nethroi: reanimate + Nightmare ----
{ const st = game(); const big = put(st, 0, '_big'); kill(st, big); const n0 = nightmares(st, 0);
  play(st, 0, 'nethroi_indatha_deathdweller', null);
  ok('Nethroi returns a dead creature and summons a Nightmare', st.players[0].board.some(c => c.id === '_big') && nightmares(st, 0) === n0 + 1, [st.players[0].board.map(c => c.id)]);
  const nm = st.players[0].board.find(c => c.name === 'Nightmare');
  ok('Nethroi Nightmare has Deathtouch', nm && has(nm, 'deathtouch'), nm && nm.keywords); }

// ---- runemark enchantment: lifegain -> counters ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'indatha_runemark', null); const a0 = v.attack;
  play(st, 0, 'indatha_puzzlebox', null); // gains 2 life -> bolster
  ok('Runemark bolsters your weakest creature when you gain life', v.attack === a0 + 1, [a0, v.attack]); }

// ---- crystal artifact: tap ramp + scry ----
{ const st = game(); play(st, 0, 'indatha_crystal', null); const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'indatha_crystal').uid, null);
  ok('Crystal taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- cluestone location: tap for a deathtouch Nightmare ----
{ const st = game(); play(st, 0, 'indatha_cluestone', null); const loc = st.players[0].board.find(c => c.id === 'indatha_cluestone'); const n0 = nightmares(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const nm = st.players[0].board.find(c => c.name === 'Nightmare');
  ok('Cluestone taps for a Deathtouch Nightmare', nightmares(st, 0) === n0 + 1 && nm && has(nm, 'deathtouch'), [n0, nightmares(st, 0)]); }

// ---- charm: destroy ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'indatha_charm', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Charm destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- command: destroy + gain 3 + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  play(st, 0, 'indatha_command', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Command destroys, gains 3, and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].life === life0 + 3 && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, life0, st.players[0].life, h0, st.players[0].hand.length]); }

// ---- puzzlebox: draw 2 + gain 2 ----
{ const st = game(); const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  play(st, 0, 'indatha_puzzlebox', null);
  ok('Puzzlebox draws 2 and gains 2', st.players[0].hand.length === h0 + 2 && st.players[0].life === life0 + 2, [h0, st.players[0].hand.length, life0, st.players[0].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
