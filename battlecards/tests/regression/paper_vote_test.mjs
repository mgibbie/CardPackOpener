// paper_vote_test.mjs — the voting subsystem (will-of-the-council) + Council triggers.
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['magister_of_worth', 'vannifar_evolved_enigma', 'fexar_wandering_emissary', 'financial_fraudster'];
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

// Magister of Worth: Battlecry queues a vote; in 2 players the tie -> Condemnation (destroy all OTHER creatures)
{ const st = game(); const ally = put(st, 0, '_v'); const foe = put(st, 1, '_v'); st.players[0].deck = ['_v', '_v'];
  const mag = play(st, 0, 'magister_of_worth');
  ok('Magister queues a vote', st.pickQueue.length > 0 && st.pickQueue[0].mode === 'vote', st.pickQueue[0]?.mode);
  E.resolvePick(st, '0'); // controller votes Grace; opponent opposes -> tie -> Condemnation
  ok('Condemnation destroys other creatures', E.isDead(ally) && E.isDead(foe), [E.isDead(ally), E.isDead(foe)]);
  ok('Magister survives its own board wipe (others:true)', !E.isDead(mag)); }

// Vannifar Deathrattle vote -> Ascendance (tie wins) -> each player draws; Council triggers fire
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v', '_v', '_v']; st.players[1].deck = ['_v', '_v'];
  const fexar = put(st, 0, 'fexar_wandering_emissary'); const fraud = put(st, 0, 'financial_fraudster');
  const vann = put(st, 0, 'vannifar_evolved_enigma');
  const h0 = st.players[0].hand.length, coins0 = st.players[0].hand.filter(c => c.id === 'coin').length;
  runDeathrattle(st, 0, vann);
  ok('Vannifar queues a vote', st.pickQueue.length > 0 && st.pickQueue[0].mode === 'vote');
  E.resolvePick(st, '0'); // Ascendance (tie:0 wins ties) -> draw-all + Council
  ok('Ascendance + Council draw for the controller', st.players[0].hand.length > h0, st.players[0].hand.length - h0);
  ok('board survived (no wipe on Ascendance)', !E.isDead(fexar) && !E.isDead(fraud));
  ok('Financial Fraudster Council added coins', st.players[0].hand.filter(c => c.id === 'coin').length > coins0, st.players[0].hand.filter(c => c.id === 'coin').length); }

// Financial Fraudster activated: Pay 2 Life -> Luck: add a coin (resolves without throwing)
{ const st = game(); const f = put(st, 0, 'financial_fraudster'); st.players[0].life = 20;
  let threw = null; try { E.activateAbility(st, 0, f.uid, 0, null); } catch (e) { threw = e; }
  ok('Financial Fraudster pay-life ability resolves', !threw && st.players[0].life === 18, threw ? threw.message : st.players[0].life); }

// play-without-throw + valid-state sweep (a queued vote is a valid pending state)
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v']; put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
