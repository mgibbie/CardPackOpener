// pool_dromoka_test.mjs — Dromoka land pool (GW / Tarkir dragon brood: Dragon tribal + +1/+1 counters + lifegain + go-wide + defensive).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const warriors = (st, pi) => st.players[pi].board.filter(c => c.name === 'Warrior').length;

const pool = raw.cards.filter(c => c.landSet === 'Dromoka');
// ---- rubric ----
ok('Dromoka pool has 15 cards', pool.length === 15, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GW', pool.every(c => JSON.stringify(c.colors) === '["G","W"]'));
ok('all names contain Dromoka', pool.every(c => /dromoka/i.test(c.name)));

function game() {
  const st = E.createGame(byId, seededRng(92), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = ['dromoka_champion', 'dromoka_gift'].includes(c.id);
  const foeTgt = c.id === 'dromoka_dunecaster';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Dragonlord Dromoka: gain 5 + team anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const life0 = st.players[0].life;
  play(st, 0, 'dragonlord_dromoka', null);
  ok('Dragonlord Dromoka gains 5 and gives +1/+1', st.players[0].life === life0 + 5 && v.attack === a0 + 1, [life0, st.players[0].life, a0, v.attack]); }

// ---- radiance enchantment: lifegain -> counters ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'dromoka_radiance', null); const a0 = v.attack;
  play(st, 0, 'dromoka_sunscorcher', null); // gains 4 life -> bolster
  ok('Radiance bolsters your weakest creature when you gain life', v.attack === a0 + 1, [a0, v.attack]); }

// ---- ascendancy artifact: +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'dromoka_ascendancy', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'dromoka_ascendancy').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Ascendancy taps to put a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- monument location: tap for a Warrior ----
{ const st = game(); play(st, 0, 'dromoka_monument', null); const loc = st.players[0].board.find(c => c.id === 'dromoka_monument'); const w0 = warriors(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const w = st.players[0].board.find(c => c.name === 'Warrior');
  ok('Monument taps for a 2/2 Taunt Warrior', warriors(st, 0) === w0 + 1 && w && has(w, 'taunt'), [w0, warriors(st, 0)]); }

// ---- gift instant: +2/+2 and Taunt ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'dromoka_gift', { type: 'creature', uid: v.uid, player: 0 });
  ok('Gift gives +2/+2 and Taunt', v.attack === a0 + 2 && has(v, 'taunt'), [a0, v.attack, v.keywords]); }

// ---- command sorcery: anthem + life ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const life0 = st.players[0].life;
  play(st, 0, 'dromoka_command', null);
  ok("Dromoka's Command: team +1/+1 and gain 3", v.attack === a0 + 1 && st.players[0].life === life0 + 3, [a0, v.attack, life0, st.players[0].life]); }

// ---- dunecaster: freeze ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'dromoka_dunecaster', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Dunecaster freezes an enemy', !!foe.frozen, foe.frozen); }

// ---- captain: taunt + divine shield ----
{ const st = game(); const { c } = play(st, 0, 'dromoka_captain', null);
  ok('Captain has Taunt + Divine Shield', has(c, 'taunt') && has(c, 'divine_shield') && c.shield === true, c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
