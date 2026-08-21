// paper_wave25_test.mjs — Custodi Squire (graveyard-vote: return the voted graveyard cards) +
// Bloodrage Alpha (Battlecry a Beast fights an enemy; Frenzy damage a random enemy).
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._g1 = { id: '_g1', name: 'G1', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common' };
byId._g2 = { id: '_g2', name: 'G2', type: 'creature', cost: 4, attack: 4, health: 4, rarity: 'common' };
byId._art = { id: '_art', name: 'Art', type: 'artifact', cost: 2, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['custodi_squire', 'bloodrage_alpha'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(25), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const grave = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'graveyard'; st.players[pi].graveyard.push(c); return c; };

// Custodi Squire — with 2+ eligible graveyard cards, queue a vote; resolving returns the voted (both, in 2p)
{ const st = game(); grave(st, 0, '_g1'); grave(st, 0, '_g2'); grave(st, 0, '_art');
  const cs = toHand(st, 0, 'custodi_squire'); E.playCard(st, 0, cs.uid, null);
  const pq = st.pickQueue.find(p => p.mode === 'gy-vote');
  ok('Custodi queues a graveyard vote (3 eligible)', pq && pq.ids.length === 3, pq && pq.ids);
  const g0 = st.players[0].graveyard.length, h0 = st.players[0].hand.length;
  E.resolvePick(st, pq.ids[0]);
  ok('Custodi returns two graveyard cards to hand (2p: both tie)', st.players[0].graveyard.length === g0 - 2 && st.players[0].hand.length === h0 + 2, [st.players[0].graveyard.length, st.players[0].hand.length]); }
// Custodi with exactly one eligible card auto-returns it (no vote needed)
{ const st = game(); grave(st, 0, '_g1');
  const cs = toHand(st, 0, 'custodi_squire'); E.playCard(st, 0, cs.uid, null);
  ok('Custodi auto-returns the only eligible card', st.players[0].hand.some(c => c.id === '_g1') && st.players[0].graveyard.length === 0, st.players[0].hand.map(c => c.id)); }

// Bloodrage Alpha — Battlecry: another friendly Beast fights an enemy creature
{ const st = game(); const myBeast = put(st, 0, '_v'); const foe = put(st, 1, '_v'); // both 2/6 Beasts
  const ba = toHand(st, 0, 'bloodrage_alpha'); E.playCard(st, 0, ba.uid, null);
  ok('Bloodrage Battlecry: the friendly Beast and an enemy creature trade damage', myBeast.damage === foe.attack && foe.damage === myBeast.attack, [myBeast.damage, foe.damage]); }
// Bloodrage Frenzy — deal 4 to a random enemy creature
{ const st = game(); const ba = put(st, 0, 'bloodrage_alpha'); const foe = put(st, 1, '_v');
  damageCreature(st, ba, 1, null); // survives -> Frenzy
  ok('Bloodrage Frenzy deals 4 to a random enemy creature', foe.damage === 4, foe.damage); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; grave(st, 0, '_g1'); grave(st, 0, '_g2'); put(st, 0, '_v'); put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); if (st.pickQueue.length) E.resolvePick(st, st.pickQueue[0].ids[0]); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
