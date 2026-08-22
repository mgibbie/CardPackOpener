// pool_chandra_planeswalkers_test.mjs — pilot pool redesign (Chandra) + the 17
// lorequest signature planeswalkers (creature -> real planeswalker).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._sp = { id: '_sp', name: 'S', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// The 16 lorequest planeswalker pools + Urza (a boss-rostered planeswalker char).
const PW = ['ajani', 'chandra', 'daretti', 'elspeth', 'garruk', 'gideon', 'jace', 'karn', 'liliana',
  'lukka', 'nissa', 'ob_nixilis', 'sorin', 'teferi', 'tezzeret', 'urza', 'vivian'].map(n => n + '_sig');

// ---- STRUCTURAL: all 17 signatures are real planeswalkers ----
for (const id of PW) {
  const c = byId[id];
  const abil = c.abilities || [];
  const hasPlus = abil.some(a => a.cost > 0);
  const hasEmblem = abil.some(a => (a.effects || []).some(e => e.type === 'emblem'));
  const noCreatureFields = c.attack == null && c.health == null && c.tribe == null && c.keywords == null;
  ok(`${id} is a planeswalker w/ loyalty+abilities`, c.type === 'planeswalker' && c.loyalty > 0 && abil.length >= 2, [c.type, c.loyalty, abil.length]);
  ok(`${id} has a + ability and an emblem ultimate`, hasPlus && hasEmblem, [hasPlus, hasEmblem]);
  ok(`${id} dropped its creature fields`, noCreatureFields, { a: c.attack, h: c.health, t: c.tribe, k: c.keywords });
}

// ---- CHANDRA POOL rubric ----
const chandra = raw.cards.filter(c => c.loreDeck === 'Chandra');
ok('Chandra pool still has 15 cards', chandra.length === 15, chandra.length);
const types = new Set(chandra.map(c => c.type));
ok('Chandra pool spans >=4 card types incl planeswalker + instant', types.size >= 4 && types.has('planeswalker') && types.has('instant'), [...types]);
const kws = new Set(chandra.flatMap(c => c.keywords || []));
ok('Chandra pool uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('Chandra pool uses flashy keywords (finale/overkill/firebreathing)', ['finale', 'overkill', 'firebreathing'].every(k => kws.has(k)), [...kws]);
const engines = chandra.filter(c => c.ongoing || c.ongoings || c.static);
ok('Chandra pool has >=3 persistent engines (ongoing/static)', engines.length >= 3, engines.map(c => c.id));

// ---- GAME HELPERS ----
function game() {
  const st = E.createGame(byId, seededRng(35), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const walkerOf = (st, pi, id) => st.players[pi].planeswalkers.find(w => w.id === id);

// ---- every planeswalker plays cleanly and lands in the planeswalker zone ----
for (const id of PW) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  const inZone = st.players[0].planeswalkers.some(w => w.id === id);
  ok(`${id} plays into the planeswalker zone`, !threw && inZone, threw ? threw.message : inZone);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !v || v.length === 0, v);
}

// ---- representative ability resolutions ----
// chandra +1: deal 2 to each opponent (no target); loyalty 4 -> 5
{ const st = game(); play(st, 0, 'chandra_sig', null); const w = walkerOf(st, 0, 'chandra_sig'); const life0 = st.players[1].life;
  const used = E.useWalker(st, 0, w.uid, 0, null);
  ok('Chandra +1 burns each opponent for 2 and gains loyalty', used && w.loyalty === 5 && st.players[1].life === life0 - 2, [used, w.loyalty, life0, st.players[1].life]); }
// chandra -2: deal 4 to any target (an enemy creature)
{ const st = game(); const foe = put(st, 1, '_v'); play(st, 0, 'chandra_sig', null); const w = walkerOf(st, 0, 'chandra_sig');
  const used = E.useWalker(st, 0, w.uid, 1, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Chandra −2 deals 4 to a creature and spends loyalty', used && w.loyalty === 2 && foe.damage === 4, [used, w.loyalty, foe.damage]); }
// chandra -6 emblem
{ const st = game(); play(st, 0, 'chandra_sig', null); const w = walkerOf(st, 0, 'chandra_sig'); w.loyalty = 6;
  const used = E.useWalker(st, 0, w.uid, 2, null);
  ok('Chandra −6 creates the Pyromaster emblem', used && st.players[0].emblems.some(e => e.ongoing && e.ongoing.on === 'turn-end'), [used, st.players[0].emblems.map(e => e.name)]); }
// ajani +1: buff a friendly creature +2/+2
{ const st = game(); const f = put(st, 0, '_v'); play(st, 0, 'ajani_sig', null); const w = walkerOf(st, 0, 'ajani_sig');
  const used = E.useWalker(st, 0, w.uid, 0, { type: 'creature', uid: f.uid, player: 0 });
  ok('Ajani +1 buffs a friendly creature +2/+2', used && f.attack === 4 && E.hp(f) === 8, [used, f.attack, E.hp(f)]); }
// elspeth +1: summon two 1/1 Soldiers
{ const st = game(); play(st, 0, 'elspeth_sig', null); const w = walkerOf(st, 0, 'elspeth_sig'); const b0 = st.players[0].board.length;
  E.useWalker(st, 0, w.uid, 0, null);
  ok('Elspeth +1 summons two Soldiers', st.players[0].board.length === b0 + 2 && st.players[0].board.filter(c => c.name === 'Soldier').length === 2, st.players[0].board.map(c => c.name)); }
// teferi -2: bounce an enemy creature
{ const st = game(); const foe = put(st, 1, '_v'); play(st, 0, 'teferi_sig', null); const w = walkerOf(st, 0, 'teferi_sig');
  const used = E.useWalker(st, 0, w.uid, 1, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Teferi −2 bounces an enemy creature to hand', used && !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === 1, [used, st.players[1].board.length, st.players[1].hand.length]); }
// sorin +1: summon a Vampire with Lifesteal
{ const st = game(); play(st, 0, 'sorin_sig', null); const w = walkerOf(st, 0, 'sorin_sig');
  E.useWalker(st, 0, w.uid, 0, null);
  const v = st.players[0].board.find(c => c.name === 'Vampire');
  ok('Sorin +1 makes a Lifesteal Vampire', v && (v.keywords || []).includes('lifesteal'), v && v.keywords); }

// ---- CHANDRA POOL mechanics ----
// pyreling prowess: +1/+1 per spell
{ const st = game(); const p = put(st, 0, 'chandra_pyreling'); play(st, 0, '_sp', null);
  ok('Chandra’s Pyreling grows +1/+1 when you cast a spell', p.attack === 3 && E.hp(p) === 3, [p.attack, E.hp(p)]); }
// magmutt: ping a random enemy on spell cast
{ const st = game(); put(st, 0, 'chandra_magmutt'); const foeLife = st.players[1].life; put(st, 1, '_v'); // enemy present so "random enemy" can be creature or face
  play(st, 0, '_sp', null);
  const dealt = (st.players[1].life < foeLife) || st.players[1].board.some(c => c.damage > 0);
  ok('Chandra’s Magmutt pings a random enemy on spell cast', dealt, [st.players[1].life, st.players[1].board.map(c => c.damage)]); }
// firemaw deathrattle
{ const st = game(); const fm = put(st, 0, 'chandra_firemaw'); put(st, 1, '_v'); const foeLife = st.players[1].life;
  fm.damage = fm.maxHealth; E.sweepDeaths ? E.sweepDeaths(st) : null; // force death + sweep
  // if sweepDeaths isn't exported, kill via a lethal source
  const died = !st.players[0].board.some(c => c.uid === fm.uid);
  const dealt = (st.players[1].life < foeLife) || st.players[1].board.some(c => c.damage > 0);
  ok('Chandra’s Firemaw deathrattle deals 3 to a random enemy', died && dealt, [died, dealt]); }
// defeat finale: exactly-enough mana -> finale bonus hits face
{ const st = game(); const foe = put(st, 1, '_v'); st.players[0].mana = { cur: 1, max: 1, bonus: 0 }; const foeLife = st.players[1].life;
  play(st, 0, 'chandra_defeat', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Chandra’s Defeat Finale also burns the opponent for 3', foe.damage === 3 && st.players[1].life === foeLife - 3, [foe.damage, foeLife, st.players[1].life]); }

// ---- incinerator has the firebreathing keyword (mana-sink) ----
ok('Chandra’s Incinerator is a Firebreathing finisher', (byId.chandra_incinerator.keywords || []).includes('firebreathing') && byId.chandra_incinerator.type === 'creature');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
