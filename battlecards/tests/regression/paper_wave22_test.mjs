// paper_wave22_test.mjs — Heartblossom (Choose-two via choices), Octowunder (Metallurgy
// destroy-walker), Opal Drake (Chromatic/Hexproof + Connect: Enrich).
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common', tribe: 'Beast' };
byId._pw = { id: '_pw', name: 'PW', type: 'planeswalker', cost: 5, loyalty: 3, rarity: 'legendary', abilities: [{ cost: 1, text: 'x', effects: [] }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['heartblossom', 'octowunder', 'opal_drake'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(22), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Heartblossom — Choose two (3 branches, each does two of the three effects)
ok('Heartblossom has 3 Choose-two branches', (byId.heartblossom.choices || []).length === 3);
{ const st = game(); const ally = put(st, 0, '_v'); const foe = put(st, 1, '_v');
  const hb = toHand(st, 0, 'heartblossom'); E.playCard(st, 0, hb.uid, { type: 'creature', uid: ally.uid, player: 0 }, 0); // branch 0: buff + damage
  ok('Heartblossom branch 0 buffs a friendly +2/+2', ally.attack === 4 && ally.maxHealth === 7, [ally.attack, ally.maxHealth]);
  ok('Heartblossom branch 0 deals 2 to a random enemy creature', foe.damage === 2, foe.damage); }
{ const st = game(); st.players[0].deck = ['_v', '_v']; const foe = put(st, 1, '_v');
  const hb = toHand(st, 0, 'heartblossom'); E.playCard(st, 0, hb.uid, null, 2); // branch 2: damage + draw
  // started with only Heartblossom in hand; play it (-1) then draw 1 (+1) -> 1 drawn card left
  ok('Heartblossom branch 2 deals 2 to an enemy & draws', foe.damage === 2 && st.players[0].hand.length === 1 && !st.players[0].hand.some(x => x.id === 'heartblossom'), [foe.damage, st.players[0].hand.map(x => x.id)]); }

// Octowunder — Metallurgy (on artifact/mech played) destroys an enemy planeswalker
{ const st = game(); put(st, 0, 'octowunder'); const w = E.instantiate(byId._pw, 1); w.zone = 'planeswalker'; st.players[1].planeswalkers.push(w);
  fireOngoing(st, 0, 'artifact-played', { played: { type: 'artifact' } });
  ok('Octowunder Metallurgy destroys an enemy planeswalker', st.players[1].planeswalkers.length === 0, st.players[1].planeswalkers.length);
  ok('Octowunder has Chromatic', byId.octowunder.keywords.includes('chromatic')); }

// Opal Drake — Chromatic/Hexproof + Connect: Enrich (a treasure on hitting the enemy hero)
{ const st = game(); const od = put(st, 0, 'opal_drake'); od.sick = false;
  E.attack(st, 0, od.uid, { type: 'hero', player: 1 });
  ok('Opal Drake Connect: Enrich makes a treasure_token', st.players[0].artifacts.some(a => a.id === 'treasure_token'), st.players[0].artifacts.map(a => a.id));
  ok('Opal Drake has Chromatic & Hexproof(elusive)', byId.opal_drake.keywords.includes('chromatic') && byId.opal_drake.keywords.includes('elusive')); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; const foe = put(st, 1, '_v'); put(st, 0, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = inst.type === 'creature' ? 'hand' : 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid, player: 1 }, 0); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
