// pool_teferi_test.mjs — Teferi pool redesign (U time control: freeze + blink + mind-control + draw).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 6, attack: 7, health: 7, rarity: 'common', tribe: 'Ogre' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Teferi');
// ---- rubric ----
ok('Teferi pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/artifact/enchantment/instant', types.size >= 6 && ['planeswalker', 'artifact', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.tapAbility).length >= 3, pool.filter(c => c.ongoing || c.aura || c.tapAbility).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(1), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['teferi_curse', 'teferi_wavecaster'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 }
    : (['teferi_veil', 'teferi_protection'].includes(c.id)) ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'teferi_care' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- care Choose One (mode 1 = freeze + draw) ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'teferi_care', { type: 'creature', uid: foe.uid, player: 1 }, 1);
  ok('Care (freeze mode) freezes an enemy and draws', foe.frozen && st.players[0].hand.length === h0 + 1, [foe.frozen, h0, st.players[0].hand.length]); }

// ---- veil: blink re-triggers a Battlecry ----
{ const st = game(); const pg = put(st, 0, 'teferi_protege'); const h0 = st.players[0].hand.length;
  play(st, 0, 'teferi_veil', { type: 'creature', uid: pg.uid, player: 0 });
  ok('Veil blinks a creature and re-triggers its Battlecry (draw)', st.players[0].hand.length >= h0 + 1 && st.players[0].board.some(c => c.id === 'teferi_protege'), [h0, st.players[0].hand.length]); }

// ---- tutelage: card advantage at turn start ----
{ const st = game(); play(st, 0, 'teferi_tutelage', null); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Tutelage draws a card at the start of your turn', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- puzzlebox artifact: tap to draw + scry ----
{ const st = game(); const box = (() => { const c = E.instantiate(byId.teferi_puzzlebox, 0); c.zone = 'artifact'; c.tapped = false; st.players[0].artifacts.push(c); return c; })();
  const h0 = st.players[0].hand.length;
  const okTap = E.tapArtifact(st, 0, box.uid, null);
  ok('Puzzlebox taps to draw a card', okTap && st.players[0].hand.length === h0 + 1 && box.tapped === true, [okTap, h0, st.players[0].hand.length]); }

// ---- sentinel: freeze a random enemy at end of turn ----
{ const st = game(); put(st, 0, 'teferi_sentinel'); const foe = put(st, 1, '_v');
  E.fireOngoing(st, 0, 'turn-end');
  ok('Sentinel freezes a random enemy at end of turn', !!foe.frozen, foe.frozen); }

// ---- time twist: freeze all enemy creatures ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'teferi_time_twist', null);
  ok('Time Twist freezes all enemy creatures', a.frozen && b.frozen, [a.frozen, b.frozen]); }

// ---- wavecaster: mind-control a small enemy ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'teferi_wavecaster', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Wavecaster steals an enemy creature (<=4 Attack)', st.players[0].board.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid), [st.players[0].board.map(c => c.id), st.players[1].board.map(c => c.id)]); }
// ...but not a big one
{ const st = game(); const big = put(st, 1, '_big');
  play(st, 0, 'teferi_wavecaster', { type: 'creature', uid: big.uid, player: 1 });
  ok('Wavecaster cannot steal a 7-Attack creature', st.players[1].board.some(c => c.uid === big.uid), st.players[0].board.map(c => c.id)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
