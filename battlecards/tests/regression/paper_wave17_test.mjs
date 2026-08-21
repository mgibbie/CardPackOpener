// paper_wave17_test.mjs — Platinum Emperion (life-locked), Gravelskin Shinobi (exile a
// graveyard card on Swing), Sobekthos (grant every other creature a Plunder Deathrattle).
import fs from 'fs';
import * as E from '../../engine.js';
import { damageHero, healHero } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._g = { id: '_g', name: 'G', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['platinum_emperion', 'gravelskin_shinobi', 'sobekthos_the_mercurial'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(17), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.exile = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Platinum Emperion — its controller can't gain or lose Life
{ const st = game(); const emp = put(st, 0, 'platinum_emperion'); const life0 = st.players[0].life;
  damageHero(st, 0, 5, null); ok('Platinum Emperion: damage to your hero is prevented', st.players[0].life === life0, st.players[0].life);
  healHero(st, 0, 5); ok('Platinum Emperion: healing your hero is prevented', st.players[0].life === life0, st.players[0].life);
  // once it leaves play, life changes normally again
  emp.zone = 'gone'; st.players[0].board = st.players[0].board.filter(c => c !== emp); E.recomputeAuras(st);
  damageHero(st, 0, 4, null); ok('with Emperion gone, life changes again', st.players[0].life === life0 - 4, st.players[0].life); }

// Gravelskin Shinobi — Swing exiles a card from a graveyard
{ const st = game(); const dead = E.instantiate(byId._g, 1); dead.zone = 'graveyard'; st.players[1].graveyard.push(dead);
  const gs = put(st, 0, 'gravelskin_shinobi'); gs.sick = false;
  const gy0 = st.players[1].graveyard.length, ex0 = st.players[1].exile.length;
  E.attack(st, 0, gs.uid, { type: 'hero', player: 1 });
  ok('Gravelskin Shinobi Swing exiles a graveyard card', st.players[1].graveyard.length === gy0 - 1 && st.players[1].exile.length === ex0 + 1, [st.players[1].graveyard.length, st.players[1].exile.length]);
  ok('Gravelskin Shinobi has Trample & Rush', gs.keywords.includes('trample') && gs.keywords.includes('rush')); }

// Sobekthos — Battlecry grants existing other creatures a Plunder Deathrattle; future creatures get it on play
{ const st = game(); const ally = put(st, 0, '_v');
  const s = toHand(st, 0, 'sobekthos_the_mercurial'); E.playCard(st, 0, s.uid, null);
  ok('Sobekthos gives an existing other creature a Plunder Deathrattle', (ally.deathrattle || []).some(e => e.type === 'plunder'), ally.deathrattle);
  const s2 = st.players[0].board.find(c => c.id === 'sobekthos_the_mercurial');
  ok('Sobekthos does NOT grant itself the Deathrattle', !(s2.deathrattle || []).some(e => e.type === 'plunder'), s2.deathrattle);
  // a creature played afterward gets the Deathrattle via the ongoing
  const later = toHand(st, 0, '_v'); E.playCard(st, 0, later.uid, null);
  const lc = st.players[0].board.find(c => c.uid === later.uid);
  ok('a creature played while Sobekthos is out gets the Plunder Deathrattle', lc && (lc.deathrattle || []).some(e => e.type === 'plunder'), lc && lc.deathrattle); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 0, '_v'); put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
