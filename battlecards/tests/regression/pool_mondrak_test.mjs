// pool_mondrak_test.mjs — Mondrak boss pool (W go-wide token DOUBLING).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._phy = { id: '_phy', name: 'P', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Phyrexian' };
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const phyCount = (st, pi) => st.players[pi].board.filter(c => c.name === 'Phyrexian').length;

const pool = raw.cards.filter(c => c.loreDeck === 'Mondrak');
// ---- rubric ----
ok('Mondrak pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/location/instant', types.size >= 6 && ['artifact', 'enchantment', 'location', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('has two token doublers (sig + Mirror Spire)', pool.filter(c => c.static && c.static.type === 'token-doubler').length === 2);
ok('the boss (sig) is a Phyrexian creature commander', byId.mondrak_sig.type === 'creature');

function game() {
  const st = E.createGame(byId, seededRng(17), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_foe', '_foe', '_foe', '_foe', '_foe', '_foe']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_phy'); put(st, 1, '_foe'); let threw = null;
  const tgt = (c.id === 'mondrak_mountainshifting') ? { type: 'creature', uid: st.players[0].board[0].uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'mondrak_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- baseline: paradox makes 1 Phyrexian with no doubler ----
{ const st = game(); play(st, 0, 'mondrak_paradox', null);
  ok('Paradox makes 1 Phyrexian (no doubler)', phyCount(st, 0) === 1, phyCount(st, 0)); }

// ---- 1 doubler (Mirror Spire): paradox makes 2 ----
{ const st = game(); putArt(st, 0, 'mondrak_mirror_spire'); play(st, 0, 'mondrak_paradox', null);
  ok('Mirror Spire doubles: Paradox makes 2 Phyrexians', phyCount(st, 0) === 2, phyCount(st, 0)); }

// ---- 2 doublers stack (Mirror Spire + sig on board): paradox makes 4 ----
{ const st = game(); putArt(st, 0, 'mondrak_mirror_spire'); put(st, 0, 'mondrak_sig'); const before = phyCount(st, 0);
  play(st, 0, 'mondrak_paradox', null);
  ok('Two doublers stack multiplicatively: Paradox makes 4', phyCount(st, 0) - before === 4, [before, phyCount(st, 0)]); }

// ---- the boss battlecry self-doubles: 2 -> 4 ----
{ const st = game(); play(st, 0, 'mondrak_sig', null);
  ok('Mondrak boss battlecry (2 tokens) is doubled by its own static -> 4', phyCount(st, 0) === 4, phyCount(st, 0)); }

// ---- eternal hymns enchantment: a Phyrexian each turn start ----
{ const st = game(); play(st, 0, 'mondrak_eternal_hymns', null); const b0 = phyCount(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Eternal Hymns summons a Phyrexian at turn start', phyCount(st, 0) === b0 + 1, [b0, phyCount(st, 0)]); }

// ---- puzzlebox location: tap for a Phyrexian ----
{ const st = game(); play(st, 0, 'mondrak_puzzlebox', null);
  const loc = st.players[0].board.find(c => c.id === 'mondrak_puzzlebox'); const b0 = phyCount(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Puzzlebox taps for a Phyrexian', phyCount(st, 0) === b0 + 1, [b0, phyCount(st, 0)]); }

// ---- warleader: Phyrexian lord ----
{ const st = game(); put(st, 0, 'mondrak_warleader'); const p = put(st, 0, '_phy'); E.recomputeAuras(st);
  ok('Warleader buffs other Phyrexians +1/+1', p.attack === 3 && E.hp(p) === 3, [p.attack, E.hp(p)]); }

// ---- hulk: go-wide payoff ----
{ const st = game(); put(st, 0, '_phy'); put(st, 0, '_phy'); const { c: h } = play(st, 0, 'mondrak_hulk', null);
  ok('Hulk gains +1/+1 per other creature (5/5 -> 7/7)', h.attack === 7 && E.hp(h) === 7, [h.attack, E.hp(h)]); }

// ---- command Choose One (mode 0 = tokens, doubled if a doubler is out) ----
{ const st = game(); putArt(st, 0, 'mondrak_mirror_spire'); play(st, 0, 'mondrak_command', null, 0);
  ok('Command (token mode) makes 2, doubled to 4', phyCount(st, 0) === 4, phyCount(st, 0)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
