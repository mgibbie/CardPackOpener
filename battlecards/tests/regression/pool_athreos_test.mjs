// pool_athreos_test.mjs — Athreos land pool (WB devotion: recursion + aristocrats drain + lifesteal).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 5, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast', keywords: ['taunt', 'divine_shield'] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Athreos');
// ---- rubric ----
ok('Athreos pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/weapon/location', types.size >= 6 && ['instant', 'enchantment', 'weapon', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WB', pool.every(c => (c.colors || []).slice().sort().join('') === 'BW'));

function game() {
  const st = E.createGame(byId, seededRng(55), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_foe'); hand(st, 1, 2); let threw = null;
  const frTgt = ['veil_of_athreos', 'shroud_of_athreos'].includes(c.id);
  const foeTgt = c.id === 'silence_of_athreos';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: drain + death-drain engine ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'athreos_god_of_passage', null);
  ok('Athreos battlecry drains 3', st.players[1].life === foeLife0 - 3 && st.players[0].life === myLife0 + 3, [foeLife0, st.players[1].life]);
  const fodder = put(st, 0, '_v'); kill(st, fodder);
  ok('Athreos: a friendly death drains 1 more', st.players[1].life === foeLife0 - 4 && st.players[0].life === myLife0 + 4, [foeLife0, st.players[1].life]); }

// ---- Kroxa: discard + burn ----
{ const st = game(); hand(st, 1, 2); const life0 = st.players[1].life;
  play(st, 0, 'kroxa_freed_by_athreos', null);
  ok('Kroxa: opponent discards and takes 2', st.players[1].hand.length === 1 && st.players[1].life === life0 - 2, [st.players[1].hand.length, life0, st.players[1].life]); }

// ---- oracle: discard ----
{ const st = game(); hand(st, 1, 2);
  play(st, 0, 'oracle_of_athreos', null);
  ok('Oracle makes the opponent discard', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- veil: +1/+1 and Reborn ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'veil_of_athreos', { type: 'creature', uid: v.uid, player: 0 });
  ok('Veil gives +1/+1 and Reborn', v.attack === a0 + 1 && has(v, 'reborn'), [a0, v.attack, v.keywords]); }

// ---- shroud: +2/+2 and Lifesteal ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'shroud_of_athreos', { type: 'creature', uid: v.uid, player: 0 });
  ok('Shroud gives +2/+2 and Lifesteal', v.attack === a0 + 2 && has(v, 'lifesteal'), [a0, v.attack, v.keywords]); }

// ---- aegis enchantment: Divine Shield to played creatures ----
{ const st = game(); play(st, 0, 'aegis_of_athreos', null);
  const { c } = play(st, 0, '_v', null);
  ok('Aegis gives a freshly played creature Divine Shield', has(c, 'divine_shield') || c.shield, [c.keywords, c.shield]); }

// ---- silence: silence a creature ----
{ const st = game(); const foe = put(st, 1, '_foe');
  play(st, 0, 'silence_of_athreos', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Silence strips a creature of its keywords', (foe.keywords || []).length === 0, foe.keywords); }

// ---- staff weapon: drain on hero attack ----
{ const st = game(); play(st, 0, 'staff_of_athreos', null); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  ok('Staff equips a Lifesteal weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('lifesteal'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Staff drains 1 after the hero attacks', st.players[1].life === foeLife0 - 1 && st.players[0].life === myLife0 + 1, [foeLife0, st.players[1].life]); }

// ---- mask location: tap to reanimate ----
{ const st = game(); const dead = put(st, 0, '_big'); kill(st, dead); play(st, 0, 'mask_of_athreos', null);
  const loc = st.players[0].board.find(c => c.id === 'mask_of_athreos'); const n0 = st.players[0].board.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Mask taps to return a dead creature', st.players[0].board.some(c => c.id === '_big') && st.players[0].board.length === n0 + 1, [n0, st.players[0].board.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
