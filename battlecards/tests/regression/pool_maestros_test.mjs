// pool_maestros_test.mjs — Maestros land pool (UBR / Grixis tri-color: aristocrats + spellslinging + Vampires/assassins + drain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const vamps = (st, pi) => st.players[pi].board.filter(c => c.name === 'Vampire').length;

const pool = raw.cards.filter(c => c.landSet === 'Maestros');
// ---- rubric ----
ok('Maestros pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UBR (order U,B,R)', pool.every(c => JSON.stringify(c.colors) === '["U","B","R"]'));

function game() {
  const st = E.createGame(byId, seededRng(78), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['maestros_diabolist', 'maestros_charm', 'maestros_confluence', 'maestros_invitation', 'maestros_command'].includes(c.id);
  const frTgt = c.id === 'maestros_sigil';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Xander: discard 2 + burn ----
{ const st = game(); hand(st, 1, 3); const h0 = st.players[1].hand.length; const life0 = st.players[1].life;
  play(st, 0, 'xander_maestros_lord', null);
  ok('Xander: opponent discards 2 and takes 3', st.players[1].hand.length === h0 - 2 && st.players[1].life === life0 - 3, [h0, st.players[1].hand.length, life0, st.players[1].life]); }

// ---- Anhelo: spellslinger ping ----
{ const st = game(); put(st, 0, 'anhelo_maestros_leader'); const life0 = st.players[1].life;
  cast(st, 0, '_cantrip');
  ok('Anhelo deals 1 to each opponent when you cast a spell', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- ascendancy enchantment: aristocrat drain ----
{ const st = game(); const fodder = put(st, 0, '_v');
  // place the enchantment
  play(st, 0, 'maestros_ascendancy', null);
  const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  kill(st, fodder);
  ok('Ascendancy drains 1 when a friendly dies', st.players[1].life === foeLife0 - 1 && st.players[0].life === myLife0 + 1, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- charm: burn a creature ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'maestros_charm', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Charm deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- invitation: destroy + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'maestros_invitation', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Invitation destroys and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

// ---- command: destroy + reach ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = st.players[1].life;
  play(st, 0, 'maestros_command', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Command destroys and deals 2 to each opponent', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].life === life0 - 2, [st.players[1].board.length, life0, st.players[1].life]); }

// ---- mask weapon: burn on hero attack ----
{ const st = game(); play(st, 0, 'maestros_mask', null); const life0 = st.players[1].life;
  ok('Mask equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Mask deals 1 to the opponent after the hero attacks', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- sigil: +2/+0 and Lifesteal ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'maestros_sigil', { type: 'creature', uid: v.uid, player: 0 });
  ok('Sigil gives +2/+0 and Lifesteal', v.attack === a0 + 2 && has(v, 'lifesteal'), [a0, v.attack, v.keywords]); }

// ---- performance artifact: tap discard ----
{ const st = game(); hand(st, 1, 3); play(st, 0, 'maestros_performance', null); const h0 = st.players[1].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'maestros_performance').uid, null);
  ok('Performance taps: opponent discards a card', st.players[1].hand.length === h0 - 1, [h0, st.players[1].hand.length]); }

// ---- ceremony location: tap for a Vampire ----
{ const st = game(); play(st, 0, 'maestros_ceremony', null); const loc = st.players[0].board.find(c => c.id === 'maestros_ceremony'); const vp0 = vamps(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const vp = st.players[0].board.find(c => c.name === 'Vampire');
  ok('Ceremony taps for a Lifesteal Vampire', vamps(st, 0) === vp0 + 1 && vp && has(vp, 'lifesteal'), [vp0, vamps(st, 0)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
