// paper_wave27_test.mjs — the five Excavation cards (Choose One: Powerstone/Relic/Discover/treasure).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['first_excavation', 'second_excavation', 'third_excavation', 'fourth_excavation', 'final_excavation'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible instant`, c && c.cardClass === 'neutral' && c.type === 'instant' && c.collectible !== false && !c.colors && !c.token);
  ok(`${id} has 4 Choose-One branches`, (c.choices || []).length === 4, c.choices && c.choices.length);
}
// rarity ladder: First=common ... Final=legendary, and the Discover/add rarity matches
const LADDER = { first_excavation: 'common', second_excavation: 'uncommon', third_excavation: 'rare', fourth_excavation: 'epic', final_excavation: 'legendary' };
for (const id of WAVE) {
  ok(`${id} card rarity + Discover rarity are ${LADDER[id]}`, byId[id].rarity === LADDER[id] && byId[id].choices[2].effects[0].rarity === LADDER[id] && byId[id].choices[3].effects[0].rarity === LADDER[id]);
}

function game() {
  const st = E.createGame(byId, seededRng(27), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.coins = 0; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const play = (st, pi, id, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null, choice); };

// Third Excavation — each of the four options
{ const st = game(); const h0 = st.players[0].hand.length; play(st, 0, 'third_excavation', 0); // Powerstone -> a coin card
  ok('Excavation option 0 gains a coin (Powerstone)', st.players[0].hand.some(c => c.id === 'coin'), st.players[0].hand.map(c => c.id)); }
{ const st = game(); play(st, 0, 'third_excavation', 1); // Relic -> treasure
  ok('Excavation option 1 makes a Treasure (Relic)', st.players[0].artifacts.some(a => a.id === 'treasure_token'), st.players[0].artifacts.map(a => a.id)); }
{ const st = game(); play(st, 0, 'third_excavation', 2); // Discover a Rare card
  ok('Excavation option 2 queues a Discover', st.pickQueue.length > 0, st.pickQueue.length);
  if (st.pickQueue.length) { E.resolvePick(st, st.pickQueue[0].ids[0]); ok('the discovered card is Rare', byId[st.players[0].hand[st.players[0].hand.length - 1].id]?.rarity === 'rare', st.players[0].hand.map(c => byId[c.id]?.rarity)); }
  else ok('the discovered card is Rare', false); }
{ const st = game(); const h0 = st.players[0].hand.length; play(st, 0, 'third_excavation', 3); // add a random Rare
  const added = st.players[0].hand[st.players[0].hand.length - 1];
  ok('Excavation option 3 adds a random Rare card', st.players[0].hand.length === h0 + 1 && byId[added.id]?.rarity === 'rare', added && [byId[added.id]?.rarity]); }

// play-without-throw + valid-state sweep (each excavation, each branch)
for (const id of WAVE) {
  for (let ch = 0; ch < 4; ch++) {
    let threw = null; const st = game(); st.players[0].deck = ['_v', '_v'];
    try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null, ch); if (st.pickQueue.length) E.resolvePick(st, st.pickQueue[0].ids[0]); }
    catch (e) { threw = e; }
    ok(`${id} branch ${ch} plays without throwing`, !threw, threw && threw.message);
    const v = validateGameState(st); ok(`${id} branch ${ch} leaves state valid`, !threw && (!v || v.length === 0), v);
  }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
