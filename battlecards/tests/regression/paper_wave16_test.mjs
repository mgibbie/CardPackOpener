// paper_wave16_test.mjs — granting triggered abilities (grant-deathrattle / grant-ongoing) +
// two tiny control mechanics (add-dead-copy trigger, skip-enemy-turn effect).
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._vamp = { id: '_vamp', name: 'V', type: 'creature', cost: 3, attack: 2, health: 3, rarity: 'common', tribe: 'Vampire' };
byId._merf = { id: '_merf', name: 'M', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Merfolk' };
byId._undead = { id: '_undead', name: 'U', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', tribe: 'Undead' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['antique_collector', 'clavileno_first_of_the_blessed', 'merfolk_tunnel_guide', 'veteran_ghoulcaller', 'eon_frolicker'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(16), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Antique Collector — Battlecry grants every friendly creature "Deathrattle: Excavate"
{ const st = game(); const ally = put(st, 0, '_v'); const c = toHand(st, 0, 'antique_collector'); E.playCard(st, 0, c.uid, null);
  const coll = st.players[0].board.find(x => x.id === 'antique_collector');
  ok('Antique Collector grants the ally a Deathrattle: Excavate', (ally.deathrattle || []).some(e => e.type === 'excavate') && ally.keywords.includes('deathrattle'), ally.deathrattle);
  ok('Antique Collector grants itself the Deathrattle too', coll && (coll.deathrattle || []).some(e => e.type === 'excavate'), coll && coll.deathrattle); }

// Clavileño — Swing grants your other Vampires "Deathrattle: create a 4/3 Demon"
{ const st = game(); const vamp = put(st, 0, '_vamp'); const clav = put(st, 0, 'clavileno_first_of_the_blessed'); clav.sick = false;
  E.attack(st, 0, clav.uid, { type: 'hero', player: 1 });
  ok('Clavileño Swing gives the other Vampire a summon-Demon Deathrattle', (vamp.deathrattle || []).some(e => e.type === 'summon'), vamp.deathrattle);
  runDeathrattle(st, 0, vamp);
  ok('that Deathrattle creates a 4/3 Demon', st.players[0].board.some(x => x.name === 'Demon' && x.attack === 4), st.players[0].board.map(x => x.name)); }

// Merfolk Tunnel-Guide — Battlecry buffs other Merfolk +1/+1 & grants Connect: Advance
{ const st = game(); const merf = put(st, 0, '_merf'); const tg = toHand(st, 0, 'merfolk_tunnel_guide'); E.playCard(st, 0, tg.uid, null);
  ok('Tunnel-Guide buffs the other Merfolk +1/+1', merf.attack === 3 && merf.maxHealth === 3, [merf.attack, merf.maxHealth]);
  ok('Tunnel-Guide grants it a Connect (self-hit-player) ongoing', (merf.ongoings || []).some(o => o.on === 'self-hit-player'), merf.ongoings); }

// Veteran Ghoulcaller — when an Undead dies, add a copy of it to your hand
{ const st = game(); put(st, 0, 'veteran_ghoulcaller'); const undead = put(st, 0, '_undead');
  const h0 = st.players[0].hand.length;
  undead.damage = undead.maxHealth; E.sweepDeaths(st);
  ok('Veteran Ghoulcaller adds a copy of the dead Undead to hand', st.players[0].hand.some(x => x.id === '_undead') && st.players[0].hand.length === h0 + 1, st.players[0].hand.map(x => x.id)); }

// Eon Frolicker — Battlecry: the opponent skips their next turn; Deathrattle: Planeshift
{ const st = game(); const c = toHand(st, 0, 'eon_frolicker'); E.playCard(st, 0, c.uid, null);
  ok('Eon Frolicker makes the opponent skip a turn (skipTurns++)', (st.players[1].skipTurns || 0) === 1, st.players[1].skipTurns); }
{ const st = game(); const eon = put(st, 0, 'eon_frolicker'); let threw = null;
  try { runDeathrattle(st, 0, eon); } catch (e) { threw = e; }
  ok('Eon Frolicker Deathrattle (Planeshift) runs without throwing', !threw, threw && threw.message); }

// skip-enemy-turn actually skips a turn in the turn cycle
{ const st = game(); st.players[1].skipTurns = 1; const before = st.current;
  E.endTurn(st); // player 0 ends; player 1 should be skipped -> back to player 0
  ok('a queued skipTurns skips that player in the turn cycle', st.current === before, [before, st.current]); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 0, '_vamp'); put(st, 0, '_merf'); put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
