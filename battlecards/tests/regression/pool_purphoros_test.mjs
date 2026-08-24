// pool_purphoros_test.mjs — Purphoros land pool (R devotion: ETB-burn + Golems + haste + burn).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Purphoros');
// ---- rubric ----
ok('Purphoros pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/instant/weapon', types.size >= 6 && ['artifact', 'enchantment', 'instant', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Red', pool.every(c => (c.colors || []).join('') === 'R'));

function game() {
  const st = E.createGame(byId, seededRng(53), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = ['ordeal_of_purphoros', 'temper_of_purphoros'].includes(c.id);
  const foeTgt = ['purphoros_intervention', 'omen_of_purphoros', 'sparkjolt_of_purphoros', 'flamecast_wheel_of_purphoros'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry burn + ETB-burn engine ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'purphoros_god_of_the_forge', null);
  ok('Purphoros battlecry deals 2 to the opponent', st.players[1].life === life0 - 2, [life0, st.players[1].life]);
  E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Golem', tribe: 'Golem', keywords: [] }], null, null);
  ok('Purphoros: a creature entering deals 1 more to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- bronze blood: +1/+0 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'bronze_blood_of_purphoros', null);
  ok('Bronze Blood gives your creatures +1/+0 and Rush', v.attack === a0 + 1 && has(v, 'rush'), [a0, v.attack, v.keywords]); }

// ---- oracle: sweep 1 ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'oracle_of_purphoros', null);
  ok('Oracle deals 1 to all enemy creatures', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

// ---- hammer artifact: tap for a Golem ----
{ const st = game(); play(st, 0, 'hammer_of_purphoros', null); const g0 = st.players[0].board.filter(c => c.name === 'Golem').length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'hammer_of_purphoros').uid, null);
  ok('Hammer taps for a 3/3 Golem with Rush', st.players[0].board.some(c => c.name === 'Golem' && c.attack === 3 && has(c, 'rush')) && st.players[0].board.filter(c => c.name === 'Golem').length === g0 + 1, st.players[0].board.map(c => c.name)); }

// ---- ordeal: buff + face burn ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const life0 = st.players[1].life;
  play(st, 0, 'ordeal_of_purphoros', { type: 'creature', uid: v.uid, player: 0 });
  ok('Ordeal gives +2/+2 and deals 3 to the opponent', v.attack === a0 + 2 && st.players[1].life === life0 - 3, [a0, v.attack, life0, st.players[1].life]); }

// ---- intervention: big burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'purphoros_intervention', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Intervention deals 6 to a creature', foe.damage === 6, foe.damage); }

// ---- rage enchantment: recurring sweep ----
{ const st = game(); const a = put(st, 1, '_v'); play(st, 0, 'rage_of_purphoros', null);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Rage deals 1 to all enemy creatures at turn start', a.damage === 1, a.damage); }

// ---- omen: burn + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'omen_of_purphoros', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Omen deals 2 to a creature and draws', foe.damage === 2 && st.players[0].hand.length === h0 + 1, [foe.damage, h0, st.players[0].hand.length]); }

// ---- temper: +2/+2 and Windfury ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'temper_of_purphoros', { type: 'creature', uid: v.uid, player: 0 });
  ok('Temper gives +2/+2 and Windfury', v.attack === a0 + 2 && has(v, 'windfury'), [a0, v.attack, v.keywords]); }

// ---- flamecast wheel: any target ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'flamecast_wheel_of_purphoros', { type: 'hero', player: 1 });
  ok('Flamecast Wheel deals 2 to any target (the opponent)', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// ---- magmaforge weapon: sweep on hero attack ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall'); play(st, 0, 'magmaforge_of_purphoros', null);
  ok('Magmaforge equips a Windfury weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('windfury'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Magmaforge deals 1 to all enemy creatures after the hero attacks', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
