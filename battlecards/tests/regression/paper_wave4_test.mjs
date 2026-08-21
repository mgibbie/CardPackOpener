// paper_wave4_test.mjs — fourth hand-import wave of neutral paper cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { runDeathrattle } from '../../engine/death.js';
import { damageCreature } from '../../engine/damage.js';
import { staticValue } from '../../engine/auras.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beast = { id: '_beast', name: 'B', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._dragon = { id: '_dragon', name: 'D', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Dragon' };
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['mako_marauder', 'zato_feywild_frog', 'helicoprion', 'tarot_forest_ritualist', 'expedition_supplier',
  'sefris_of_the_hidden_ways', 'sandshaper_drake', 'vrondiss_rage_of_ancients', 'millenium_dragon', 'red_eyes_obsidian_dragon'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, t = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, t); return c; };
const boardSum = (st, pi) => st.players[pi].board.reduce((n, c) => n + c.attack + c.maxHealth, 0);

// Mako Marauder: play a Beast -> Scry 1
{ const st = game(); put(st, 0, 'mako_marauder'); st.players[0].deck = ['_v', '_v', '_v']; const s0 = st.scryQueue.length;
  play(st, 0, '_beast'); ok('Mako Marauder scries when you play a Beast', st.scryQueue.length > s0); }

// Zato: Spell Damage +1 static; Frenzy draw; Spellburst +0/+2
{ const st = game(); const z = put(st, 0, 'zato_feywild_frog'); st.players[0].deck = ['_v', '_v'];
  ok('Zato grants Spell Damage +1', staticValue(st.players[0], 'spell-damage') === 1, staticValue(st.players[0], 'spell-damage'));
  const h0 = st.players[0].hand.length; damageCreature(st, z, 1, null);
  ok('Zato Frenzy draws after surviving damage', st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0);
  const hp0 = z.maxHealth; fireOngoing(st, 0, 'spell-played', {});
  ok('Zato Spellburst gains +2 Health', z.maxHealth === hp0 + 2, z.maxHealth - hp0); }

// Helicoprion: Spell Damage +1; Deathrattle buffs a friendly +3/+3
{ const st = game(); const h = put(st, 0, 'helicoprion'); put(st, 0, '_beast');
  ok('Helicoprion grants Spell Damage +1', staticValue(st.players[0], 'spell-damage') === 1);
  const b0 = boardSum(st, 0); runDeathrattle(st, 0, h);
  ok('Helicoprion Deathrattle grants +3/+3 to a friendly', boardSum(st, 0) === b0 + 6, boardSum(st, 0) - b0); }

// Tarot Forest Ritualist: Constellation -> draw
{ const st = game(); put(st, 0, 'tarot_forest_ritualist'); st.players[0].deck = ['_v', '_v']; const h0 = st.players[0].hand.length;
  fireOngoing(st, 0, 'enchantment-played', {});
  ok('Tarot Forest Ritualist draws on Constellation', st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0); }

// Expedition Supplier: Alliance buffs a friendly; Deathrattle Investigate
{ const st = game(); put(st, 0, 'expedition_supplier'); put(st, 0, '_beast'); const b0 = boardSum(st, 0);
  fireOngoing(st, 0, 'creature-played', { minion: E.instantiate(byId._v, 0) });
  ok('Expedition Supplier Alliance buffs a friendly +1 Attack', boardSum(st, 0) === b0 + 1, boardSum(st, 0) - b0);
  const es = st.players[0].board.find(c => c.id === 'expedition_supplier'); runDeathrattle(st, 0, es);
  ok('Expedition Supplier Deathrattle investigates', st.players[0].artifacts.some(a => a.id === 'clue_token')); }

// Sefris: a friendly creature dying -> Advance
{ const st = game(); put(st, 0, 'sefris_of_the_hidden_ways'); const pq0 = st.pickQueue.length, d0 = st.players[0].dungeon;
  fireOngoing(st, 0, 'friendly-creature-died', { dead: E.instantiate(byId._v, 0) });
  ok('Sefris Advances when a friendly creature dies', st.pickQueue.length > pq0 || st.players[0].dungeon !== d0); }

// Sandshaper Drake: buff a target + summon a 2/2 Elemental
{ const st = game(); const foe = put(st, 1, '_v'); const own0 = st.players[0].board.length;
  play(st, 0, 'sandshaper_drake', { type: 'creature', uid: foe.uid });
  ok('Sandshaper Drake buffs the target +1/+1', foe.attack === 3 && foe.maxHealth === 3, `${foe.attack}/${foe.maxHealth}`);
  ok('Sandshaper Drake summons an Elemental', st.players[0].board.length >= own0 + 2 && st.players[0].board.some(c => c.name === 'Elemental')); }

// Vrondiss: survives damage -> summon a 5/4
{ const st = game(); const v = put(st, 0, 'vrondiss_rage_of_ancients'); const n0 = st.players[0].board.length;
  damageCreature(st, v, 1, null);
  ok('Vrondiss summons a Dragon Spirit after surviving damage', st.players[0].board.length === n0 + 1, st.players[0].board.length - n0); }

// Millenium Dragon: Spellburst returns two Dragons from graveyard
{ const st = game(); put(st, 0, 'millenium_dragon'); st.players[0].graveyard = [E.instantiate(byId._dragon, 0), E.instantiate(byId._dragon, 0), E.instantiate(byId._v, 0)];
  const h0 = st.players[0].hand.length; fireOngoing(st, 0, 'spell-played', {});
  ok('Millenium Dragon Spellburst returns two Dragons', st.players[0].hand.filter(c => c.id === '_dragon').length === 2, st.players[0].hand.map(c => c.id)); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v']; st.players[1].deck = ['_v', '_v', '_v'];
  const foe = put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
