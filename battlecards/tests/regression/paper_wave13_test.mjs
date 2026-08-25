// paper_wave13_test.mjs — the Harvest keyword (choose 1 of 3: untap a land / 1-1 Plant / Food)
// across a Battlecry (Ruska Elk), a Scry+Harvest Battlecry (Flowersoul Guardian),
// a Swing (Beanstalk Giant), and a Location tap (Captivating Crossroads).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['flowersoul_guardian', 'ruska_elk', 'beanstalk_giant', 'captivating_crossroads'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(13), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.lands = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const playBC = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); return c; };
const tappedLand = (st, pi) => { const l = { uid: 90000 + pi, id: '_land', name: 'Land', type: 'land', zone: 'land', tapped: true, colors: [] }; st.players[pi].lands.push(l); return l; };

// Harvest offers exactly three options as a 'harvest' pick
{ const st = game(); playBC(st, 0, 'ruska_elk');
  const pq = st.pickQueue[0];
  ok('Ruska Elk Battlecry queues a Harvest pick with 3 options', pq && pq.mode === 'harvest' && pq.ids.length === 3, pq && [pq.mode, pq.ids]); }

// Harvest option 0 — untap a land
{ const st = game(); const land = tappedLand(st, 0); playBC(st, 0, 'ruska_elk');
  E.resolvePick(st, '0');
  ok('Harvest "untap a land" untaps a tapped land', land.tapped === false, land.tapped); }

// Harvest option 1 — summon a 1/1 Plant
{ const st = game(); playBC(st, 0, 'ruska_elk');
  E.resolvePick(st, '1');
  const plant = st.players[0].board.find(c => c.name === 'Plant');
  ok('Harvest "1/1 Plant" summons a 1/1 Plant', plant && plant.attack === 1 && plant.maxHealth === 1 && (plant.tribe || '').includes('Plant'), plant && [plant.attack, plant.maxHealth, plant.tribe]); }

// Harvest option 2 — make a Food (food_token lives in the artifact/consumable zone)
{ const st = game(); playBC(st, 0, 'ruska_elk');
  E.resolvePick(st, '2');
  ok('Harvest "Food" creates a food_token', st.players[0].artifacts.some(c => c.id === 'food_token'), st.players[0].artifacts.map(c => c.id)); }

// Flowersoul Guardian — Scry 1 & Harvest
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v']; playBC(st, 0, 'flowersoul_guardian');
  ok('Flowersoul Guardian queues a Scry', st.scryQueue.length > 0, st.scryQueue.length);
  E.resolveScry(st, []); ok('Flowersoul Guardian also queues a Harvest pick', st.pickQueue.some(p => p.mode === 'harvest'), st.pickQueue.map(p => p.mode)); }

// Beanstalk Giant — Swing: Harvest (fires on attack)
{ const st = game(); const bg = put(st, 0, 'beanstalk_giant'); bg.sick = false;
  E.attack(st, 0, bg.uid, { type: 'hero', player: 1 });
  ok('Beanstalk Giant Swing queues a Harvest pick on attack', st.pickQueue.some(p => p.mode === 'harvest'), st.pickQueue.map(p => p.mode)); }

// Captivating Crossroads — Location tap: Bounce target creature & Harvest
{ const c = byId.captivating_crossroads;
  ok('Captivating Crossroads is a 2-Durability Location', c.type === 'location' && c.durability === 2, [c.type, c.durability]);
  const eff = (c.taps && c.taps[0] && c.taps[0].effects) || [];
  ok('its tap Bounces a creature & Harvests', eff.some(e => e.type === 'bounce') && eff.some(e => e.type === 'harvest'), eff.map(e => e.type));
  // run the tap effects directly: bounce the foe + queue Harvest
  const st = game(); const foe = put(st, 1, '_v');
  E.execEffects(st, 0, eff, { type: 'creature', uid: foe.uid, player: 1 }, null);
  ok('Crossroads tap bounces the target creature to hand', !st.players[1].board.some(x => x.uid === foe.uid) && st.players[1].hand.some(x => x.id === '_v'), st.players[1].board.map(x => x.id));
  ok('Crossroads tap queues a Harvest pick', st.pickQueue.some(p => p.mode === 'harvest'), st.pickQueue.map(p => p.mode)); }

// play-without-throw + valid-state sweep (creatures play with a Harvest pick pending)
for (const id of ['flowersoul_guardian', 'ruska_elk', 'beanstalk_giant']) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v'];
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
