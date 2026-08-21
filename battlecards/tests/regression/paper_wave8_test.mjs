// paper_wave8_test.mjs — sacrifice-cost activated abilities (+ destroy-permanent),
// and school/spell-filtered graveyard returns.
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._song = { id: '_song', name: 'Aria', type: 'sorcery', cost: 2, rarity: 'common', tribe: 'Song', effects: [{ type: 'draw', value: 1 }] };
byId._shadow = { id: '_shadow', name: 'Dread', type: 'sorcery', cost: 2, rarity: 'common', tribe: 'Shadow', effects: [{ type: 'draw', value: 1 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['poison_dart_frog', 'thrashing_brontodon', 'mockingjay', 'shadowglade_sprites', 'dedicated_dollmaker'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, t = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, t); return c; };

// Poison Dart Frog: Sacrifice this creature -> destroy an enemy artifact (self dies as the cost)
{ const st = game(); const frog = put(st, 0, 'poison_dart_frog'); E.gainTokenCard(st, 1, 'clue_token');
  const before = st.players[1].artifacts.length;
  const okAct = E.activateAbility(st, 0, frog.uid, 0, null); E.sweepDeaths && E.sweepDeaths(st);
  ok('Poison Dart Frog activates its sacrifice ability', okAct === true, okAct);
  ok('the frog is sacrificed as the cost', E.isDead(frog) || !st.players[0].board.some(c => c.uid === frog.uid));
  ok('an enemy artifact is destroyed', st.players[1].artifacts.length === before - 1, st.players[1].artifacts.length); }

// Mockingjay: Battlecry returns a Song spell from the graveyard
{ const st = game(); st.players[0].graveyard = [E.instantiate(byId._v, 0), E.instantiate(byId._song, 0)];
  play(st, 0, 'mockingjay');
  ok('Mockingjay Battlecry returns a Song spell (not the creature)', st.players[0].hand.some(c => c.id === '_song') && !st.players[0].hand.some(c => c.id === '_v'), st.players[0].hand.map(c => c.id)); }

// Shadowglade Sprites: activated 3 -> return a Shadow spell
{ const st = game(); const s = put(st, 0, 'shadowglade_sprites'); st.players[0].graveyard = [E.instantiate(byId._shadow, 0), E.instantiate(byId._v, 0)];
  const okAct = E.activateAbility(st, 0, s.uid, 0, null);
  ok('Shadowglade Sprites returns a Shadow spell', okAct && st.players[0].hand.some(c => c.id === '_shadow'), st.players[0].hand.map(c => c.id)); }

// Dedicated Dollmaker: Battlecry destroys a noncreature; activated 5 summons a Mech
{ const st = game(); E.gainTokenCard(st, 1, 'clue_token'); const before = st.players[1].artifacts.length;
  const doll = play(st, 0, 'dedicated_dollmaker');
  ok('Dedicated Dollmaker destroys an enemy noncreature', st.players[1].artifacts.length === before - 1, st.players[1].artifacts.length);
  const n0 = st.players[0].board.length; E.activateAbility(st, 0, doll.uid, 0, null);
  ok('Dedicated Dollmaker summons a 1/1 Mech', st.players[0].board.length === n0 + 1 && st.players[0].board.some(c => c.name === 'Mech'), st.players[0].board.length - n0); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v']; E.gainTokenCard(st, 1, 'clue_token');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
