// pool_nicol_bolas_test.mjs — Nicol Bolas boss pool (UBR tyrant control: discard + steal + counter + Elder Dragons).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 7, attack: 7, health: 7, rarity: 'common', tribe: 'Ogre' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 4, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Nicol Bolas');
// ---- rubric ----
ok('Nicol Bolas pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/secret/instant', types.size >= 6 && ['artifact', 'enchantment', 'secret', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays Grixis (all UBR)', pool.every(c => c.colors && c.colors.join('') === 'UBR'));
ok('the boss (sig) is an Elder Dragon creature commander', byId.nicol_bolas_sig.type === 'creature' && (byId.nicol_bolas_sig.tribe || '').includes('Dragon'));

function game() {
  const st = E.createGame(byId, seededRng(27), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_v'); hand(st, 1, 2); let threw = null;
  const tgt = (['nicol_bolas_scorn'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 }
    : (['nicol_bolas_enslaver', 'nicol_bolas_sig'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'nicol_bolas_dominance') ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'nicol_bolas_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- cultist: discard battlecry ----
{ const st = game(); hand(st, 1, 2);
  play(st, 0, 'nicol_bolas_cultist', null);
  ok('Cultist battlecry: opponent discards a card', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- clutches: counterspell secret ----
{ const st = game(); play(st, 0, 'nicol_bolas_clutches', null);
  ok('Clutches installs as a secret', st.players[0].secrets.length === 1);
  hand(st, 1, 2); const life0 = st.players[0].life;
  castAs(st, 1, '_bolt'); // opponent casts a 4-damage bolt at Bolas
  ok('Clutches counters the enemy spell (no damage)', st.players[0].life === life0, [life0, st.players[0].life]);
  ok('Clutches also makes the opponent discard', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- spy network: draw + discard each turn start ----
{ const st = game(); play(st, 0, 'nicol_bolas_spy_network', null); hand(st, 1, 2); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Spy Network: you draw and opponent discards at turn start', st.players[0].hand.length === h0 + 1 && st.players[1].hand.length === 1, [h0, st.players[0].hand.length, st.players[1].hand.length]); }

// ---- citadel artifact: tap to draw ----
{ const st = game(); const cd = putArt(st, 0, 'nicol_bolas_citadel'); const h0 = st.players[0].hand.length;
  ok('Citadel taps to draw a card', E.tapArtifact(st, 0, cd.uid, null) && st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0); }

// ---- command Choose One (mode 1 = discard 2) ----
{ const st = game(); hand(st, 1, 3);
  play(st, 0, 'nicol_bolas_command', null, 1);
  ok('Command (discard mode): opponent discards 2', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- enslaver: steal an enemy creature (<=5 Attack) ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'nicol_bolas_enslaver', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Enslaver steals an enemy creature to your board', st.players[0].board.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid), [st.players[0].board.map(c => c.id), st.players[1].board.map(c => c.id)]); }

// ---- the boss: discard 2 + 3 damage + steal ----
{ const st = game(); hand(st, 1, 3); const foe = put(st, 1, '_v'); const life0 = st.players[1].life;
  play(st, 0, 'nicol_bolas_sig', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Bolas boss: opponent discards 2', st.players[1].hand.length === 1, st.players[1].hand.length);
  ok('Bolas boss: opponent takes 3', st.players[1].life === life0 - 3, [life0, st.players[1].life]);
  ok('Bolas boss: steals an enemy creature', st.players[0].board.some(c => c.uid === foe.uid), st.players[0].board.map(c => c.id)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
