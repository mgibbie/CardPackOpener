// pool_erebos_test.mjs — Erebos land pool (B devotion: death + drain + aristocrats + Undead recursion).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 5, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const undead = (st, pi) => st.players[pi].board.filter(c => c.name === 'Undead').length;

const pool = raw.cards.filter(c => c.landSet === 'Erebos');
// ---- rubric ----
ok('Erebos pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/instant/weapon/secret', types.size >= 6 && ['enchantment', 'instant', 'weapon', 'secret'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Black', pool.every(c => (c.colors || []).join('') === 'B'));

function game() {
  const st = E.createGame(byId, seededRng(51), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_big'); hand(st, 1, 2); let threw = null;
  const frTgt = ['boon_of_erebos', 'ordeal_of_erebos', 'scourgemark_of_erebos'].includes(c.id);
  const foeTgt = c.id === 'erebos_intervention';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: drain + draw ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life; const h0 = st.players[0].hand.length;
  play(st, 0, 'erebos_god_of_the_dead', null);
  ok('Erebos drains 3 and draws', st.players[1].life === foeLife0 - 3 && st.players[0].life === myLife0 + 3 && st.players[0].hand.length === h0 + 1, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- Anikthea: reanimate + Undead ----
{ const st = game(); const dead = put(st, 0, '_big'); kill(st, dead); const u0 = undead(st, 0); const n0 = st.players[0].board.length;
  play(st, 0, 'anikthea_hand_of_erebos', null);
  ok('Anikthea reanimates and makes an Undead', st.players[0].board.some(c => c.id === '_big') && undead(st, 0) === u0 + 1, [n0, st.players[0].board.length]); }

// ---- Dictate: deaths cripple a random enemy ----
{ const st = game(); play(st, 0, 'dictate_of_erebos', null); const fodder = put(st, 0, '_v'); const foe = put(st, 1, '_big'); const a0 = foe.attack;
  kill(st, fodder);
  ok('Dictate puts a -2/-2 counter on a random enemy when a friendly dies', foe.attack === a0 - 2, [a0, foe.attack]); }

// ---- intervention: removal + life ----
{ const st = game(); const foe = put(st, 1, '_big'); const life0 = st.players[0].life;
  play(st, 0, 'erebos_intervention', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Intervention deals 4 to a creature and gains 4 life', foe.damage === 4 && st.players[0].life === life0 + 4, [foe.damage, life0, st.players[0].life]); }

// ---- whip weapon: an Undead on hero attack ----
{ const st = game(); play(st, 0, 'whip_of_erebos', null); const u0 = undead(st, 0);
  ok('Whip equips a Lifesteal weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('lifesteal'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Whip summons a 2/2 Undead after the hero attacks', undead(st, 0) === u0 + 1, [u0, undead(st, 0)]); }

// ---- claim: a 4/4 Undead ----
{ const st = game(); const u0 = undead(st, 0);
  play(st, 0, 'claim_of_erebos', null);
  ok('Claim summons a 4/4 Undead with Lifesteal', undead(st, 0) === u0 + 1 && st.players[0].board.some(c => c.name === 'Undead' && c.attack === 4 && has(c, 'lifesteal')), [u0, undead(st, 0)]); }

// ---- bleak heart: drain 3 ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'bleak_heart_of_erebos', null);
  ok('Bleak Heart drains 3', st.players[1].life === foeLife0 - 3 && st.players[0].life === myLife0 + 3, [foeLife0, st.players[1].life]); }

// ---- boon: +2/+2 and Lifesteal ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'boon_of_erebos', { type: 'creature', uid: v.uid, player: 0 });
  ok('Boon gives +2/+2 and Lifesteal', v.attack === a0 + 2 && has(v, 'lifesteal'), [a0, v.attack]); }

// ---- ordeal: buff + discard ----
{ const st = game(); const v = put(st, 0, '_v'); hand(st, 1, 2); const a0 = v.attack;
  play(st, 0, 'ordeal_of_erebos', { type: 'creature', uid: v.uid, player: 0 });
  ok('Ordeal gives +2/+2 and makes the opponent discard', v.attack === a0 + 2 && st.players[1].hand.length === 1, [a0, v.attack, st.players[1].hand.length]); }

// ---- omen: token + draw ----
{ const st = game(); const u0 = undead(st, 0); const h0 = st.players[0].hand.length;
  play(st, 0, 'omen_of_erebos', null);
  ok('Omen makes a Deathtouch Undead and draws', undead(st, 0) === u0 + 1 && st.players[0].board.some(c => c.name === 'Undead' && has(c, 'deathtouch')) && st.players[0].hand.length === h0 + 1, [u0, undead(st, 0)]); }

// ---- hymn secret: counter + discard ----
{ const st = game(); play(st, 0, 'hymn_of_erebos', null);
  ok('Hymn installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  hand(st, 1, 2); const life0 = st.players[0].life;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Hymn counters the enemy spell (no damage) and they discard', st.players[0].life === life0 && st.players[1].hand.length === 1, [life0, st.players[0].life, st.players[1].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
