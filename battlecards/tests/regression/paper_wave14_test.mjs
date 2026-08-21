// paper_wave14_test.mjs — Adventure cards (the spell "adventure" half + the creature half).
// Adventure is already engine-supported (playAdventure/canPlayAdventure); this wave is data +
// two tiny param filters (add-random-card nameIncludes, valuePer 'lands-you-control').
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { firePonder } from '../../engine/core.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const NEW = ['mosswood_dreadknight', 'kellan_inquisitive_prodigy', 'accident_prone_apprentice', 'porcine_potioneer'];
for (const id of NEW) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible with an Adventure`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token && !!c.adventure);
}
ok('Beanstalk Giant now has its Fertile Footsteps Adventure', !!byId.beanstalk_giant.adventure && byId.beanstalk_giant.adventure.name === 'Fertile Footsteps');

function game() {
  const st = E.createGame(byId, seededRng(14), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.lands = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const land = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].lands.push({ uid: 70000 + pi * 100 + i, id: '_land', name: 'Land', type: 'land', zone: 'land', tapped: false, colors: [] }); };

// Mosswood Dreadknight — Adventure "Dread Whispers": draw 1 & lose 1 life; creature has Trample
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v']; const c = toHand(st, 0, 'mosswood_dreadknight');
  const life0 = st.players[0].life;
  ok('Mosswood Adventure is castable', E.canPlayAdventure(st, 0, c));
  E.playAdventure(st, 0, c.uid, null, null);
  ok('Dread Whispers: lost 1 life', st.players[0].life === life0 - 1, [life0, st.players[0].life]);
  const back = st.players[0].hand.find(x => x.id === 'mosswood_dreadknight');
  ok('Dread Whispers: the card returns to hand, adventure spent', back && back.adventureSpent === true, back && back.adventureSpent);
  ok('Mosswood the creature has Trample', (byId.mosswood_dreadknight.keywords || []).includes('trample')); }

// Kellan — Adventure "Tail the Suspect": Investigate (clue); creature Swing destroys an enemy artifact
{ const st = game(); const c = toHand(st, 0, 'kellan_inquisitive_prodigy');
  E.playAdventure(st, 0, c.uid, null, null);
  ok('Tail the Suspect: Investigate makes a Clue', st.players[0].artifacts.some(a => a.id === 'clue_token'), st.players[0].artifacts.map(a => a.id)); }
{ const st = game(); const k = put(st, 0, 'kellan_inquisitive_prodigy'); k.sick = false;
  const art = E.instantiate({ id: '_art', name: 'A', type: 'artifact', cost: 2, rarity: 'common' }, 1); art.zone = 'artifact'; st.players[1].artifacts.push(art);
  E.attack(st, 0, k.uid, { type: 'hero', player: 1 });
  ok('Kellan Swing destroys an enemy Artifact', st.players[1].artifacts.length === 0, st.players[1].artifacts.map(a => a.id)); }

// Accident-Prone Apprentice — Adventure "Anuran Error": add two Hex; Ponder: +1/+1
{ const st = game(); const c = toHand(st, 0, 'accident_prone_apprentice');
  E.playAdventure(st, 0, c.uid, null, null);
  ok('Anuran Error adds two copies of Hex', st.players[0].hand.filter(x => x.id === 'hex').length === 2, st.players[0].hand.map(x => x.id)); }
{ const st = game(); const ap = put(st, 0, 'accident_prone_apprentice'); const a0 = ap.attack, h0 = ap.maxHealth;
  st.players[0].drawsThisTurn = 2; firePonder(st, 0, {});
  ok('Ponder gives Accident-Prone Apprentice +1/+1', ap.attack === a0 + 1 && ap.maxHealth === h0 + 1, [ap.attack, ap.maxHealth]); }

// Porcine Potioneer — Battlecry adds a random Potion; Deathrattle draws; Adventure exiles + heals per Beast
{ const st = game(); const c = toHand(st, 0, 'porcine_potioneer'); E.playCard(st, 0, c.uid, null);
  ok('Porcine Battlecry adds a Potion spell', st.players[0].hand.some(x => /Potion/.test(byId[x.id]?.name || '')), st.players[0].hand.map(x => byId[x.id]?.name)); }
{ const st = game(); const c = toHand(st, 0, 'porcine_potioneer'); put(st, 0, '_v'); put(st, 0, '_v'); // 2 Beasts on board
  st.players[0].life = 20; const foe = put(st, 1, '_v');
  ok('Lend a Ham Adventure is castable', E.canPlayAdventure(st, 0, c));
  E.playAdventure(st, 0, c.uid, { type: 'creature', uid: foe.uid, player: 1 }, null);
  ok('Lend a Ham exiles the target creature', !st.players[1].board.some(x => x.uid === foe.uid), st.players[1].board.map(x => x.id));
  ok('Lend a Ham heals per Beast you control (>=2)', st.players[0].life >= 22, st.players[0].life); }

// Beanstalk Giant — Adventure "Fertile Footsteps": damage any target = lands you control
{ const st = game(); land(st, 0, 3); const c = toHand(st, 0, 'beanstalk_giant');
  const life0 = st.players[1].life;
  E.playAdventure(st, 0, c.uid, { type: 'hero', player: 1 }, null);
  ok('Fertile Footsteps deals damage equal to your land count (3)', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// play-without-throw + valid-state sweep (as creatures)
for (const id of NEW) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays as a creature without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
