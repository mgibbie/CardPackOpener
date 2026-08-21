// paper_wave20_test.mjs — school-specific Spell Damage (Xixira Fire+2 / Shorigo Arcane+1),
// Shorigo's play-a-Samurai/Ninja buff, Xixira's activated grant-Taunt, Stormkeld's Adventure.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 9, rarity: 'common', tribe: 'Beast' };
byId._samurai = { id: '_samurai', name: 'S', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', tribe: 'Samurai' };
byId._fire = { id: '_fire', name: 'Fireball', type: 'sorcery', cost: 3, tribe: 'Fire', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'creature' }] };
byId._arcane = { id: '_arcane', name: 'Arc', type: 'sorcery', cost: 3, tribe: 'Arcane', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'creature' }] };
byId._holy = { id: '_holy', name: 'Holy', type: 'sorcery', cost: 3, tribe: 'Holy', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'creature' }] };
byId._giant = { id: '_giant', name: 'G', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Giant', rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['shorigo_eastern_wind', 'xixira_mirror_realm_necroczar', 'stormkeld_curator'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(20), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id, tgtUid, tgtPl) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, { type: 'creature', uid: tgtUid, player: tgtPl }); };

// Xixira — Fire Spell Damage +2 (only Fire spells)
{ const st = game(); put(st, 0, 'xixira_mirror_realm_necroczar'); const foe = put(st, 1, '_v');
  cast(st, 0, '_fire', foe.uid, 1);
  ok('Xixira: a Fire spell deals +2 (3 -> 5)', foe.damage === 5, foe.damage); }
{ const st = game(); put(st, 0, 'xixira_mirror_realm_necroczar'); const foe = put(st, 1, '_v');
  cast(st, 0, '_holy', foe.uid, 1);
  ok('Xixira: a non-Fire spell is unaffected (3)', foe.damage === 3, foe.damage); }
// Xixira — activated: give a creature Taunt
{ const st = game(); const xi = put(st, 0, 'xixira_mirror_realm_necroczar'); const t = put(st, 0, '_v'); st.players[0].mana = { cur: 5, max: 5, bonus: 0 };
  const okA = E.activateAbility(st, 0, xi.uid, 0, { type: 'creature', uid: t.uid, player: 0 });
  ok('Xixira activated gives the target Taunt', okA && t.keywords.includes('taunt'), [okA, t.keywords]); }

// Shorigo — Arcane Spell Damage +1 (only Arcane); Hexproof/Windfury; play a Samurai buffs a friendly
{ const st = game(); put(st, 0, 'shorigo_eastern_wind'); const foe = put(st, 1, '_v');
  cast(st, 0, '_arcane', foe.uid, 1);
  ok('Shorigo: an Arcane spell deals +1 (3 -> 4)', foe.damage === 4, foe.damage); }
{ const st = game(); put(st, 0, 'shorigo_eastern_wind'); const foe = put(st, 1, '_v');
  cast(st, 0, '_fire', foe.uid, 1);
  ok('Shorigo: a non-Arcane spell is unaffected (3)', foe.damage === 3, foe.damage);
  ok('Shorigo has Hexproof(elusive) & Windfury', byId.shorigo_eastern_wind.keywords.includes('elusive') && byId.shorigo_eastern_wind.keywords.includes('windfury')); }
{ const st = game(); put(st, 0, 'shorigo_eastern_wind'); put(st, 0, '_v'); // Shorigo(5) + _v(2) = 7 total attack
  const c = E.instantiate(byId._samurai, 0); c.zone = 'hand'; st.players[0].hand.push(c); E.playCard(st, 0, c.uid, null); // +3 base, then +2 buff
  const total = st.players[0].board.reduce((s, x) => s + (x.attack || 0), 0);
  ok('Shorigo: playing a Samurai buffs a friendly +2/+2 (total atk 7+3+2=12)', total === 12, total); }

// Stormkeld Curator — Adventure "Giant Secrets": draw 3 if you control a Giant or Faerie
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v', '_v']; put(st, 0, '_giant'); // a Giant on board
  const sc = E.instantiate(byId.stormkeld_curator, 0); sc.zone = 'hand'; st.players[0].hand.push(sc);
  const h0 = st.players[0].hand.length;
  E.playAdventure(st, 0, sc.uid, null, null);
  // cast the adventure (hand -1) then draw 3, and the card returns to hand -> net +3
  ok('Stormkeld Adventure draws 3 with a Giant in play', st.players[0].hand.length === h0 - 1 + 3 + 1, st.players[0].hand.length); }
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v', '_v'];
  const sc = E.instantiate(byId.stormkeld_curator, 0); sc.zone = 'hand'; st.players[0].hand.push(sc);
  const h0 = st.players[0].hand.length;
  E.playAdventure(st, 0, sc.uid, null, null);
  ok('Stormkeld Adventure draws nothing without a Giant/Faerie', st.players[0].hand.length === h0 - 1 + 1, st.players[0].hand.length); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
