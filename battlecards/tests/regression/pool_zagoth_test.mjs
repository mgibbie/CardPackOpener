// pool_zagoth_test.mjs — Zagoth land pool (BGU / Sultai tri-color: graveyard value + reanimation + deathtouch + draw).
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
const snakes = (st, pi) => st.players[pi].board.filter(c => c.name === 'Snake').length;

const pool = raw.cards.filter(c => c.landSet === 'Zagoth');
// ---- rubric ----
ok('Zagoth pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BGU (order U,B,G)', pool.every(c => JSON.stringify(c.colors) === '["U","B","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(85), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
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
  const frTgt = c.id === 'zagoth_charm';
  const foeTgt = c.id === 'zagoth_command';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Brokkos: reanimate + Reborn ----
{ const st = game(); const big = put(st, 0, '_big'); kill(st, big);
  play(st, 0, 'brokkos_zagoth_eternal_apex', null);
  ok('Brokkos returns a dead creature to the battlefield', st.players[0].board.some(c => c.id === '_big'), st.players[0].board.map(c => c.id));
  const brk = st.players[0].board.find(c => c.id === 'brokkos_zagoth_eternal_apex');
  ok('Brokkos has Reborn', brk && has(brk, 'reborn'), brk && brk.keywords); }

// ---- hymn enchantment: deaths draw cards ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'zagoth_hymn', null); const h0 = st.players[0].hand.length;
  kill(st, fodder);
  ok('Hymn draws a card when a friendly dies', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- nantuko: permanent ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'zagoth_nantuko', null);
  ok('Nantuko gains an empty Mana Crystal (max +1)', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- crystal artifact: tap ramp + scry ----
{ const st = game(); play(st, 0, 'zagoth_crystal', null); const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'zagoth_crystal').uid, null);
  ok('Crystal taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- rhino location: tap for a deathtouch Snake ----
{ const st = game(); play(st, 0, 'zagoth_rhino', null); const loc = st.players[0].board.find(c => c.id === 'zagoth_rhino'); const s0 = snakes(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const sn = st.players[0].board.find(c => c.name === 'Snake');
  ok('Rhino taps for a Deathtouch Snake', snakes(st, 0) === s0 + 1 && sn && has(sn, 'deathtouch'), [s0, snakes(st, 0)]); }

// ---- charm: +1/+1, Deathtouch, cantrip ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'zagoth_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +1/+1, Deathtouch, and draws', v.attack === a0 + 1 && has(v, 'deathtouch') && st.players[0].hand.length === h0 + 1, [a0, v.attack, v.keywords, h0, st.players[0].hand.length]); }

// ---- command: destroy + ramp + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const max0 = st.players[0].mana.max; const h0 = st.players[0].hand.length;
  play(st, 0, 'zagoth_command', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Command destroys, ramps, and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].mana.max === max0 + 1 && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, max0, st.players[0].mana.max, h0, st.players[0].hand.length]); }

// ---- mythos: draw 2 + ramp ----
{ const st = game(); const max0 = st.players[0].mana.max; const h0 = st.players[0].hand.length;
  play(st, 0, 'zagoth_mythos', null);
  ok('Mythos draws 2 and ramps', st.players[0].hand.length === h0 + 2 && st.players[0].mana.max === max0 + 1, [h0, st.players[0].hand.length, max0, st.players[0].mana.max]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
