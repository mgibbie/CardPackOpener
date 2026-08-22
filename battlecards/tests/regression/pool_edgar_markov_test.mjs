// pool_edgar_markov_test.mjs — Edgar Markov boss pool (B go-wide vampire swarm: Eminence + tribal anthem + Rush).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._vamp = { id: '_vamp', name: 'V', type: 'creature', cost: 3, attack: 2, health: 2, rarity: 'common', tribe: 'Vampire' };
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 3, attack: 3, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const vampTokens = (st, pi) => st.players[pi].board.filter(c => c.name === 'Vampire').length;

const pool = raw.cards.filter(c => c.loreDeck === 'Edgar Markov');
// ---- rubric ----
ok('Edgar Markov pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/enchantment/location/instant', types.size >= 6 && ['weapon', 'enchantment', 'location', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.taps).length >= 3, pool.filter(c => c.ongoing || c.aura || c.taps).map(c => c.id));
ok('the boss (sig) is a Vampire creature commander with Eminence', byId.edgar_markov_sig.type === 'creature' && byId.edgar_markov_sig.ongoing && byId.edgar_markov_sig.ongoing.on === 'creature-played');

function game() {
  const st = E.createGame(byId, seededRng(25), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_foe', '_foe', '_foe', '_foe', '_foe', '_foe']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_vamp'); const foe = put(st, 1, '_foe'); let threw = null;
  const tgt = (c.id === 'edgar_markov_fateful_absence') ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'edgar_markov_sure_strike') ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'edgar_markov_infernal_alchemy' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Eminence: playing a Vampire summons a 1/1 Vampire ----
{ const st = game(); put(st, 0, 'edgar_markov_sig'); const t0 = vampTokens(st, 0);
  play(st, 0, '_vamp', null); // play a Vampire from hand
  ok('Eminence: playing a Vampire summons a 1/1 Vampire token', vampTokens(st, 0) === t0 + 1, [t0, vampTokens(st, 0)]); }

// ---- sig battlecry: two Vampires ----
{ const st = game(); const t0 = vampTokens(st, 0);
  play(st, 0, 'edgar_markov_sig', null);
  ok('Edgar boss battlecry summons two Vampires', vampTokens(st, 0) === t0 + 2, [t0, vampTokens(st, 0)]); }

// ---- crimson vow: counters on attack ----
{ const st = game(); const cv = put(st, 0, 'edgar_markov_crimson_vow'); const ally = put(st, 0, '_vamp');
  E.attack(st, 0, cv.uid, { type: 'hero', player: 1 });
  ok('Crimson Vow gives your creatures +1/+1 when it attacks', ally.attack === 3 && E.hp(ally) === 3, [ally.attack, E.hp(ally)]); }

// ---- bloodline: Vampire lord ----
{ const st = game(); put(st, 0, 'edgar_markov_bloodline'); const v = put(st, 0, '_vamp'); E.recomputeAuras(st);
  ok('Bloodline buffs other Vampires +1/+0', v.attack === 3, v.attack); }

// ---- coffin weapon: a Vampire after the hero attacks ----
{ const st = game(); play(st, 0, 'edgar_markov_coffin', null);
  const w = st.players[0].weapon; const t0 = vampTokens(st, 0);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Coffin makes a Vampire after the hero attacks', w && (w.keywords || []).includes('lifesteal') && vampTokens(st, 0) === t0 + 1, [t0, vampTokens(st, 0)]); }

// ---- blood crypt location: tap for a Lifesteal Vampire ----
{ const st = game(); play(st, 0, 'edgar_markov_blood_crypt', null);
  const loc = st.players[0].board.find(c => c.id === 'edgar_markov_blood_crypt'); const t0 = vampTokens(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Blood Crypt taps for a 2/2 Lifesteal Vampire', vampTokens(st, 0) === t0 + 1 && st.players[0].board.some(c => c.name === 'Vampire' && c.attack === 2 && c.keywords.includes('lifesteal')), st.players[0].board.map(c => c.name)); }

// ---- wedding announcement enchantment: a Vampire each turn start ----
{ const st = game(); play(st, 0, 'edgar_markov_wedding_announcement', null); const t0 = vampTokens(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Wedding Announcement summons a Vampire at turn start', vampTokens(st, 0) === t0 + 1, [t0, vampTokens(st, 0)]); }

// ---- uncanny speed: mass +2/+0 and Rush ----
{ const st = game(); const v = put(st, 0, '_vamp'); play(st, 0, 'edgar_markov_uncanny_speed', null);
  ok('Uncanny Speed gives your creatures +2/+0 and Rush', v.attack === 4 && (E.has ? E.has(v, 'rush') : v.keywords.includes('rush')), [v.attack, v.keywords]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
