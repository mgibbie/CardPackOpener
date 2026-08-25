// paper_wave19_test.mjs — adjacency (Glowing Glyph buff target+neighbors, Meteorhorn destroy
// target+neighbors) + Bahamut (exile artifacts from graveyards, +1/+1 each; DR Scry 2 & Armor 5).
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._art = { id: '_art', name: 'Art', type: 'artifact', cost: 2, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['glowing_glyph', 'meteorhorn', 'bahamut_the_grey'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(19), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.exile = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const grave = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'graveyard'; st.players[pi].graveyard.push(c); return c; };

// Glowing Glyph — buff the target creature and its two neighbors +1/+2; not the far one
{ const st = game(); const a = put(st, 0, '_v'), b = put(st, 0, '_v'), c = put(st, 0, '_v'), d = put(st, 0, '_v');
  const gg = toHand(st, 0, 'glowing_glyph'); E.playCard(st, 0, gg.uid, { type: 'creature', uid: b.uid, player: 0 });
  ok('Glowing Glyph buffs the target +1/+2', b.attack === 3 && b.maxHealth === 4, [b.attack, b.maxHealth]);
  ok('Glowing Glyph buffs both neighbors +1/+2', a.attack === 3 && a.maxHealth === 4 && c.attack === 3 && c.maxHealth === 4, [a.attack, c.attack]);
  ok('Glowing Glyph leaves the non-adjacent creature untouched', d.attack === 2 && d.maxHealth === 2, [d.attack, d.maxHealth]); }

// Meteorhorn — Battlecry destroys the target and its neighbors; a far creature survives
{ const st = game(); const a = put(st, 1, '_v'), b = put(st, 1, '_v'), c = put(st, 1, '_v'), d = put(st, 1, '_v');
  const m = toHand(st, 0, 'meteorhorn'); E.playCard(st, 0, m.uid, { type: 'creature', uid: b.uid, player: 1 });
  const gone = x => x.damage >= x.maxHealth || !st.players[1].board.includes(x);
  ok('Meteorhorn destroys the target + its neighbors', gone(a) && gone(b) && gone(c), [a.damage, b.damage, c.damage]);
  ok('Meteorhorn leaves the far creature alive', !gone(d), d.damage); }

// Bahamut the Grey — Battlecry exiles Artifacts from graveyards and gains +1/+1 each
{ const st = game(); grave(st, 0, '_art'); grave(st, 0, '_art'); grave(st, 1, '_art'); grave(st, 0, '_v'); // a non-artifact stays
  const b = toHand(st, 0, 'bahamut_the_grey'); E.playCard(st, 0, b.uid, null);
  const bah = st.players[0].board.find(c => c.id === 'bahamut_the_grey');
  ok('Bahamut exiles all Artifacts from graveyards', st.players[0].graveyard.filter(c => c.id === '_art').length === 0 && st.players[1].graveyard.length === 0, [st.players[0].graveyard.map(c => c.id), st.players[1].graveyard.length]);
  ok('Bahamut gains +1/+1 per exiled Artifact (3 -> 13/13)', bah && bah.attack === 13 && bah.maxHealth === 13, bah && [bah.attack, bah.maxHealth]);
  ok('Bahamut leaves non-Artifact graveyard cards', st.players[0].graveyard.some(c => c.id === '_v'), st.players[0].graveyard.map(c => c.id)); }
// Bahamut Deathrattle — Scry 2 & Gain 5 Armor
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v']; const bah = put(st, 0, 'bahamut_the_grey'); const ar0 = st.players[0].armor || 0;
  runDeathrattle(st, 0, bah);
  ok('Bahamut Deathrattle queues a Scry', st.scryQueue.length > 0, st.scryQueue.length);
  E.resolveScry(st, []); ok('Bahamut Deathrattle gains 5 Armor (after the Scry resolves)', (st.players[0].armor || 0) === ar0 + 5, st.players[0].armor); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; grave(st, 0, '_art'); const foe = put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid, player: 1 }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
