// paper_wave9_test.mjs — Metallurgy (artifact/mech-played trigger) + Sanguine/Prowess
// keywords, heal->counter, buff-friendly-tribe.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { healHero } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._art = { id: '_art', name: 'A', type: 'artifact', cost: 1, rarity: 'common', description: 'nothing' };
byId._mech = { id: '_mech', name: 'M', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Mech' };
byId._totem = { id: '_totem', name: 'T', type: 'creature', cost: 1, attack: 0, health: 2, rarity: 'common', tribe: 'Totem' };
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['netherese_dungeoneer', 'fugitive_codebreaker', 'mystic_seraph', 'terragoros', 'quagorox', 'sangor_dark_prince_of_neon_shadows'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, t = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, t); return c; };

// Metallurgy fires when you PLAY AN ARTIFACT: Netherese Dungeoneer Advances
{ const st = game(); put(st, 0, 'netherese_dungeoneer'); const pq0 = st.pickQueue.length, d0 = st.players[0].dungeon;
  play(st, 0, '_art');
  ok('Metallurgy (artifact play) triggers Netherese Advance', st.pickQueue.length > pq0 || st.players[0].dungeon !== d0); }

// Metallurgy also fires when you play a MECH creature
{ const st = game(); put(st, 0, 'netherese_dungeoneer'); const pq0 = st.pickQueue.length, d0 = st.players[0].dungeon;
  play(st, 0, '_mech');
  ok('Metallurgy (mech play) triggers Netherese Advance', st.pickQueue.length > pq0 || st.players[0].dungeon !== d0); }

// Netherese Constellation: play an enchantment -> Scry 2
{ const st = game(); put(st, 0, 'netherese_dungeoneer'); st.players[0].deck = ['_v', '_v', '_v']; const s0 = st.scryQueue.length;
  fireOngoing(st, 0, 'enchantment-played', { played: byId._art });
  ok('Netherese Constellation scries when you play an enchantment', st.scryQueue.length > s0); }

// Mystic Seraph: gaining life grows it +1/+1
{ const st = game(); const m = put(st, 0, 'mystic_seraph'); const a0 = m.attack; st.players[0].life = 20;
  healHero(st, 0, 5);
  ok('Mystic Seraph grows when you gain life', m.attack === a0 + 1, m.attack - a0); }

// Terragoros: Sanguine keyword + Metallurgy buffs your Totems
{ const st = game(); const tot = put(st, 0, '_totem'); put(st, 0, 'terragoros');
  ok('Terragoros has Sanguine', (byId.terragoros.keywords || []).includes('sanguine'));
  const a0 = tot.attack; play(st, 0, '_art');
  ok('Terragoros Metallurgy gives your Totems +2 Attack', tot.attack === a0 + 2, tot.attack - a0); }

// Quagorox: activated 4 -> Cook (a Food token appears)
{ const st = game(); const q = put(st, 0, 'quagorox');
  E.activateAbility(st, 0, q.uid, 0, null);
  ok('Quagorox activated ability cooks a Food', st.players[0].artifacts.some(a => a.id === 'food_token'), st.players[0].artifacts.map(a => a.id)); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v'];
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
