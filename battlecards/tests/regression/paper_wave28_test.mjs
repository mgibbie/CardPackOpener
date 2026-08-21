// paper_wave28_test.mjs — sacrifice-friendly: Undercity Eliminator (sac a friendly, exile an
// enemy) and The Meep (Swing: sac a friendly, team gains +MV/+MV until end of turn).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._c4 = { id: '_c4', name: 'C4', type: 'creature', cost: 4, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['undercity_eliminator', 'the_meep'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(28), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.exile = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Undercity Eliminator — with another creature, sacrifice it and exile the enemy target
{ const st = game(); const fodder = put(st, 0, '_v'); const foe = put(st, 1, '_v');
  const ue = toHand(st, 0, 'undercity_eliminator'); E.playCard(st, 0, ue.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Undercity sacrifices your other creature', !st.players[0].board.some(c => c.uid === fodder.uid), st.players[0].board.map(c => c.id));
  ok('Undercity exiles the enemy target', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.map(c => c.id)); }
// Undercity with NO other creature -> nothing happens (no sac, no exile)
{ const st = game(); const foe = put(st, 1, '_v');
  const ue = toHand(st, 0, 'undercity_eliminator'); E.playCard(st, 0, ue.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Undercity does nothing without another creature (enemy survives)', st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.map(c => c.id)); }

// The Meep — sacrifice a friendly; your other creatures gain +MV/+MV this turn
// (exactly one fodder creature, so the random sacrifice is forced onto it)
{ const st = game(); const meep = put(st, 0, 'the_meep'); const fodder = put(st, 0, '_c4'); // fodder is cost 4 -> +4/+4
  E.execEffects(st, 0, meep.ongoing.effects, null, meep); // fire the Swing effect
  ok('The Meep sacrifices the only other friendly creature', !st.players[0].board.some(c => c.uid === fodder.uid), st.players[0].board.map(c => c.id));
  const m = st.players[0].board.find(c => c.uid === meep.uid); // The Meep (0/4) itself gets the +4/+4
  ok('your other creatures gain +MV/+MV (the sacrificed 4-cost -> +4/+4)', m && m.attack === 4 && m.maxHealth === 8, m && [m.attack, m.maxHealth]);
  ok('the buff is temporary (tempAttack tracked)', m && m.tempAttack === 4, m && m.tempAttack); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 0, '_v'); put(st, 0, '_c4'); const foe = put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid, player: 1 }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
