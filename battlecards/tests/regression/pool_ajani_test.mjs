// pool_ajani_test.mjs — Ajani pool redesign (W: gain life -> go wide with Cats -> anthem).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._cat = { id: '_cat', name: 'C', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Cat' };
byId._heal = { id: '_heal', name: 'H', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'heal', value: 1, target: 'self' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Ajani');
// ---- rubric ----
ok('Ajani pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('Ajani pool spans >=6 card types', types.size >= 6, [...types]);
ok('includes planeswalker + enchantment + secret + quest + instant', ['planeswalker', 'enchantment', 'secret', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('Ajani pool uses >=6 distinct keywords', kws.size >= 6, [...kws]);
const engines = pool.filter(c => c.ongoing || c.aura || c.static);
ok('Ajani pool has >=3 persistent engines (ongoing/aura)', engines.length >= 3, engines.map(c => c.id));
ok('has a Choose One spell (command)', !!byId.ajani_command.choices);
ok('ajani_sig is still the planeswalker', byId.ajani_sig.type === 'planeswalker');

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw + valid-state sweep (all 15) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_cat'); let threw = null;
  const tgt = (['ajani_aid', 'ajani_grace', 'ajani_presence'].includes(c.id)) ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'ajani_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- lifegain engines ----
// welcome: gain 1 life whenever you summon a creature
{ const st = game(); st.players[0].life = 20; play(st, 0, 'ajani_welcome', null);
  play(st, 0, '_v', null);
  ok('Ajani’s Welcome gains 1 life on a summon', st.players[0].life === 21, st.players[0].life); }
// mantra: Cat anthem +1/+1
{ const st = game(); play(st, 0, 'ajani_mantra', null); const cat = put(st, 0, '_cat'); E.recomputeAuras(st);
  ok('Ajani’s Mantra gives your Cats +1/+1', cat.attack === 3 && E.hp(cat) === 3, [cat.attack, E.hp(cat)]); }
// pridemate: grows on lifegain
{ const st = game(); st.players[0].life = 20; const pm = put(st, 0, 'ajani_pridemate');
  play(st, 0, '_heal', null);
  ok('Ajani’s Pridemate grows +1/+1 when you gain life', pm.attack === 3 && E.hp(pm) === 3, [pm.attack, E.hp(pm)]); }
// chosen: every 2nd lifegain -> a Cat
{ const st = game(); st.players[0].life = 20; put(st, 0, 'ajani_chosen'); const b0 = st.players[0].board.length;
  play(st, 0, '_heal', null);
  const after1 = st.players[0].board.length;
  play(st, 0, '_heal', null);
  const after2 = st.players[0].board.length;
  ok('Ajani’s Chosen makes a Cat on the 2nd lifegain (not the 1st)', after1 === b0 && after2 === b0 + 1 && st.players[0].board.some(c => c.name === 'Cat'), [b0, after1, after2]); }

// ---- grace grants Divine Shield ----
{ const st = game(); const fr = put(st, 0, '_cat');
  play(st, 0, 'ajani_grace', { type: 'creature', uid: fr.uid, player: 0 });
  ok('Ajani’s Grace grants +0/+3 and Divine Shield', E.hp(fr) === 5 && fr.shield === true, [E.hp(fr), fr.shield]); }

// ---- command Choose One (branch 1 = two Cats) ----
{ const st = game(); const b0 = st.players[0].board.length;
  play(st, 0, 'ajani_command', null, 1);
  ok('Ajani’s Command (2nd mode) summons two Cats', st.players[0].board.length === b0 + 2 && st.players[0].board.filter(c => c.name === 'Cat').length === 2, st.players[0].board.map(c => c.name)); }

// ---- retribution secret: destroys an attacking enemy creature ----
{ const st = game(); play(st, 0, 'ajani_retribution', null);
  ok('Ajani’s Retribution installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const foe = put(st, 1, '_cat'); st.current = 1; st.priority = null; st.stack = [];
  E.attack(st, 1, foe.uid, { type: 'hero', player: 0 });
  ok('Ajani’s Retribution destroys the attacker', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.map(c => c.id)); }

// ---- ultimatum quest: summon 6 -> reward buffs your creatures + heals ----
{ const st = game(); st.players[0].life = 20; play(st, 0, 'ajani_ultimatum', null);
  ok('Ajani’s Ultimatum installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  for (let i = 0; i < 6; i++) play(st, 0, '_v', null);
  const buffed = st.players[0].board.filter(c => c.id === '_v' && c.attack >= 3);
  ok('Ultimatum reward buffs your creatures +2/+2 after 6 summons', buffed.length >= 1, st.players[0].board.filter(c => c.id === '_v').map(c => c.attack + '/' + E.hp(c)));
  ok('Ultimatum reward heals the hero', st.players[0].life > 20, st.players[0].life); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
