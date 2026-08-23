// pool_rakdos_test.mjs — Rakdos land pool (BR reckless aggro + sacrifice/aristocrats burn + lifedrain).
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

const pool = raw.cards.filter(c => c.landSet === 'Rakdos');
// ---- rubric ----
ok('Rakdos pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/instant/artifact/weapon', types.size >= 6 && ['enchantment', 'instant', 'artifact', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BR', pool.every(c => (c.colors || []).slice().sort().join('') === 'BR'));

function game() {
  const st = E.createGame(byId, seededRng(42), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['rakdos_firewheeler', 'rakdos_charm'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'rakdos_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Lord of Riots: burn finisher ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'rakdos_lord_of_riots', null);
  ok('Lord of Riots deals 4 to the opponent', st.players[1].life === life0 - 4, [life0, st.players[1].life]);
  const lr = st.players[0].board.find(c => c.id === 'rakdos_lord_of_riots');
  ok('Lord of Riots has Charge + Lifesteal', has(lr, 'charge') && has(lr, 'lifesteal')); }

// ---- Exava: unleash +2/+0 and Charge ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'exava_rakdos_blood_witch', null);
  ok('Exava gives your creatures +2/+0 and Charge', v.attack === a0 + 2 && has(v, 'charge') && E.canAttackWith(st, 0, v), [a0, v.attack, has(v, 'charge')]); }

// ---- guildmage: sac a creature -> burn ----
{ const st = game(); put(st, 0, '_v'); const life0 = st.players[1].life; const g0 = st.players[0].graveyard.length;
  play(st, 0, 'rakdos_guildmage', null);
  ok('Guildmage sacrifices a creature and deals 3 to the opponent', st.players[1].life === life0 - 3 && st.players[0].graveyard.length > g0, [life0, st.players[1].life, g0, st.players[0].graveyard.length]); }

// ---- firewheeler: split burn ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = st.players[1].life;
  play(st, 0, 'rakdos_firewheeler', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Firewheeler deals 2 to the opponent and 2 to a creature', st.players[1].life === life0 - 2 && foe.damage === 2, [life0, st.players[1].life, foe.damage]); }

// ---- shred freak: deathrattle burn ----
{ const st = game(); const sf = put(st, 0, 'rakdos_shred_freak'); const life0 = st.players[1].life;
  kill(st, sf);
  ok('Shred-Freak Deathrattle deals 1 to the opponent', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- Anthem of Rakdos: deaths burn the opponent ----
{ const st = game(); play(st, 0, 'anthem_of_rakdos', null); const fodder = put(st, 0, '_v'); const life0 = st.players[1].life;
  kill(st, fodder);
  ok('Anthem of Rakdos: a friendly death deals 1 to the opponent', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- showstopper: symmetric wrath ----
{ const st = game(); const mine = put(st, 0, '_v'); const foe = put(st, 1, '_wall');
  play(st, 0, 'rakdos_showstopper', null);
  ok('Showstopper deals 3 to all creatures', mine.damage === 3 && foe.damage === 3, [mine.damage, foe.damage]); }

// ---- charm modal: face burn (mode 1) ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'rakdos_charm', null, 1);
  ok('Charm (face mode) deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- charm modal: sac -> draw 2 (mode 2) ----
{ const st = game(); put(st, 0, '_v'); const h0 = st.players[0].hand.length; const g0 = st.players[0].graveyard.length;
  play(st, 0, 'rakdos_charm', null, 2);
  ok('Charm (sac mode) sacrifices a creature and draws 2', st.players[0].hand.length === h0 + 2 && st.players[0].graveyard.length > g0, [h0, st.players[0].hand.length]); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'rakdos_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'rakdos_cluestone').uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- riteknife weapon: lifesteal + sweep on hero attack ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall'); play(st, 0, 'rakdos_riteknife', null);
  ok('Riteknife equips a Lifesteal weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('lifesteal'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Riteknife deals 1 to all enemy creatures after the hero attacks', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
