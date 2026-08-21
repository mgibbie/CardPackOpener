// paper_wave34_test.mjs — Rampage Condenser (artifact, {T}: deal 3 to any target, then draw).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

ok('rampage_condenser exists as a neutral artifact', byId.rampage_condenser && byId.rampage_condenser.cardClass === 'neutral' && byId.rampage_condenser.type === 'artifact' && byId.rampage_condenser.collectible !== false && !byId.rampage_condenser.colors);
ok('rampage_condenser has a {T} ability', !!byId.rampage_condenser.tapAbility);

function game() {
  const st = E.createGame(byId, seededRng(34), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };

// Rampage Condenser — {T}: deal 3 to a creature, then draw
{ const st = game(); const rc = putArt(st, 0, 'rampage_condenser'); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  const okTap = E.tapArtifact(st, 0, rc.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Rampage Condenser deals 3 to the target creature', okTap && foe.damage === 3, [okTap, foe.damage]);
  ok('Rampage Condenser draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
  ok('Rampage Condenser taps after use', rc.tapped === true, rc.tapped); }
// {T} to the enemy face
{ const st = game(); const rc = putArt(st, 0, 'rampage_condenser'); const life0 = st.players[1].life;
  E.tapArtifact(st, 0, rc.uid, { type: 'hero', player: 1 });
  ok('Rampage Condenser can hit the enemy hero for 3', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// play-without-throw + valid-state sweep
{ let threw = null; const st = game();
  try { const inst = E.instantiate(byId.rampage_condenser, 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); } catch (e) { threw = e; }
  ok('rampage_condenser plays without throwing', !threw, threw && threw.message);
  const v = validateGameState(st); ok('rampage_condenser leaves state valid', !threw && (!v || v.length === 0), v); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
