// pool_klothys_test.mjs — Klothys land pool (RG devotion: ramp + burn + fight + destiny engine).
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
const beasts = (st, pi) => st.players[pi].board.filter(c => c.name === 'Beast').length;

const pool = raw.cards.filter(c => c.landSet === 'Klothys');
// ---- rubric ----
ok('Klothys pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/instant/artifact/location', types.size >= 6 && ['enchantment', 'instant', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RG', pool.every(c => JSON.stringify(c.colors) === '["R","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(60), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_wall'); const foe = put(st, 1, '_wall'); let threw = null;
  const tgt = (c.id === 'calix_servant_of_klothys') ? { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid }
    : ['klothys_charm', 'klothys_runemark'].includes(c.id) ? { type: 'creature', uid: fr.uid, player: 0 }
    : ['klothys_command', 'reckoning_of_klothys', 'klothys_will'].includes(c.id) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry burn + turn-start destiny ----
{ const st = game(); const life0 = st.players[1].life; const b0 = st.players[0].mana.bonus; const my0 = st.players[0].life;
  play(st, 0, 'klothys_god_of_destiny', null);
  ok('Klothys battlecry deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Klothys turn-start: drain 1 + gain 1 Mana', st.players[1].life === life0 - 4 && st.players[0].life === my0 + 1 && st.players[0].mana.bonus === b0 + 1, [st.players[1].life, st.players[0].life, st.players[0].mana.bonus]); }

// ---- calix: fight ----
{ const st = game(); const fr = put(st, 0, '_wall'); const foe = put(st, 1, '_wall');
  play(st, 0, 'calix_servant_of_klothys', { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid });
  ok('Calix makes a friendly fight an enemy (both take damage)', fr.damage === 3 && foe.damage === 3, [fr.damage, foe.damage]); }

// ---- seal: ramp ----
{ const st = game(); const b0 = st.players[0].mana.bonus;
  play(st, 0, 'klothys_seal', null);
  ok('Seal gains 3 Mana this turn', st.players[0].mana.bonus === b0 + 3, [b0, st.players[0].mana.bonus]); }

// ---- fateweaver: +1/+1 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'klothys_fateweaver', null);
  ok('Fateweaver gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- design enchantment: ramp + anthem each turn ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'klothys_design', null); const b0 = st.players[0].mana.bonus; const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Design gains Mana and gives +1/+0 at turn start', st.players[0].mana.bonus === b0 + 1 && v.attack === a0 + 1, [b0, st.players[0].mana.bonus, a0, v.attack]); }

// ---- charm: +2/+2 and Trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'klothys_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and Trample', v.attack === a0 + 2 && has(v, 'trample'), [a0, v.attack]); }

// ---- command: burn + ramp ----
{ const st = game(); const foe = put(st, 1, '_wall'); const b0 = st.players[0].mana.bonus;
  play(st, 0, 'klothys_command', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Command deals 2 to a creature and gains 2 Mana', foe.damage === 2 && st.players[0].mana.bonus === b0 + 2, [foe.damage, b0, st.players[0].mana.bonus]); }

// ---- reckoning: burn + drain ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = st.players[1].life;
  play(st, 0, 'reckoning_of_klothys', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Reckoning deals 3 to a creature and 2 to the opponent', foe.damage === 3 && st.players[1].life === life0 - 2, [foe.damage, life0, st.players[1].life]); }

// ---- puzzlebox artifact: tap for a Beast ----
{ const st = game(); play(st, 0, 'klothys_puzzlebox', null); const b0 = beasts(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'klothys_puzzlebox').uid, null);
  ok('Puzzlebox taps for a 2/2 Beast with Trample', beasts(st, 0) === b0 + 1 && st.players[0].board.some(c => c.name === 'Beast' && has(c, 'trample')), [b0, beasts(st, 0)]); }

// ---- runemark: +2/+2 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'klothys_runemark', { type: 'creature', uid: v.uid, player: 0 });
  ok('Runemark gives +2/+2 and Rush', v.attack === a0 + 2 && has(v, 'rush'), [a0, v.attack]); }

// ---- triumph location: tap for a Beast ----
{ const st = game(); play(st, 0, 'triumph_of_klothys', null); const loc = st.players[0].board.find(c => c.id === 'triumph_of_klothys'); const b0 = beasts(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Triumph taps for a 3/3 Beast with Trample', beasts(st, 0) === b0 + 1 && st.players[0].board.some(c => c.name === 'Beast' && c.attack === 3), [b0, beasts(st, 0)]); }

// ---- maelstrom: sweep ----
{ const st = game(); const a = put(st, 1, '_wall'); const b = put(st, 1, '_wall');
  play(st, 0, 'maelstrom_of_klothys', null);
  ok('Maelstrom deals 4 to all enemy creatures', a.damage === 4 && b.damage === 4, [a.damage, b.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
