// pool_dimir_test.mjs — Dimir land pool (UB mill + surveillance + theft + Elusive/Deathtouch assassins).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Dimir');
// ---- rubric ----
ok('Dimir pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/artifact/enchantment/secret', types.size >= 6 && ['instant', 'artifact', 'enchantment', 'secret'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UB', pool.every(c => (c.colors || []).slice().sort().join('') === 'BU'));

function game() {
  const st = E.createGame(byId, seededRng(41), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = Array(20).fill('_v'); p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_v'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['dimir_doppelganger', 'dimir_charm'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'dimir_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Circu: mill 5 + discard ----
{ const st = game(); hand(st, 1, 2); const d0 = st.players[1].deck.length;
  play(st, 0, 'circu_dimir_lobotomist', null);
  ok('Circu exiles 5 from the opponent deck and makes them discard', st.players[1].deck.length === d0 - 5 && st.players[1].hand.length === 1, [d0, st.players[1].deck.length, st.players[1].hand.length]); }

// ---- Lazav: mills 3 when it attacks ----
{ const st = game(); const lz = put(st, 0, 'lazav_dimir_mastermind'); const d0 = st.players[1].deck.length;
  E.attack(st, 0, lz.uid, { type: 'hero', player: 1 });
  ok('Lazav exiles 3 from the opponent deck on attack', st.players[1].deck.length === d0 - 3, [d0, st.players[1].deck.length]); }

// ---- cutpurse: discard + draw ----
{ const st = game(); hand(st, 1, 2); const h0 = st.players[0].hand.length;
  play(st, 0, 'dimir_cutpurse', null);
  ok('Cutpurse: opponent discards, you draw', st.players[1].hand.length === 1 && st.players[0].hand.length === h0 + 1, [st.players[1].hand.length, h0, st.players[0].hand.length]); }

// ---- doppelganger: steal a small creature ----
{ const st = game(); const foe = put(st, 1, '_v'); // 3 Attack
  play(st, 0, 'dimir_doppelganger', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Doppelganger steals an enemy creature (<=3 Attack)', st.players[0].board.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid)); }

// ---- informant: scry + draw ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'dimir_informant', null);
  E.resolveScry(st, []); ok('Informant draws a card (after Scry 2)', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- charm modal: mill 3 (mode 1) ----
{ const st = game(); const d0 = st.players[1].deck.length;
  play(st, 0, 'dimir_charm', null, 1);
  ok('Charm (mill mode) exiles 3 from the opponent deck', st.players[1].deck.length === d0 - 3, [d0, st.players[1].deck.length]); }

// ---- charm modal: kill a small creature (mode 0) ----
{ const st = game(); const foe = put(st, 1, '_v'); // 3/3
  play(st, 0, 'dimir_charm', { type: 'creature', uid: foe.uid, player: 1 }, 0); E.sweepDeaths(st);
  ok('Charm (kill mode) destroys a creature with <=3 Attack', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'dimir_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'dimir_cluestone').uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- signet artifact: tap for mana ----
{ const st = game(); play(st, 0, 'dimir_signet', null); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'dimir_signet').uid, null);
  ok('Signet taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- locket enchantment: mill on each cast ----
{ const st = game(); play(st, 0, 'dimir_locket', null); const d0 = st.players[1].deck.length;
  play(st, 0, 'dimir_keyrune', null); // cast a spell
  ok('Locket exiles the top card of the opponent deck when you cast a spell', st.players[1].deck.length === d0 - 1, [d0, st.players[1].deck.length]); }

// ---- keyrune: an Elusive Deathtouch Assassin ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'dimir_keyrune', null);
  ok('Keyrune summons a 2/2 Assassin with Elusive + Deathtouch', st.players[0].board.some(c => c.name === 'Assassin' && has(c, 'elusive') && has(c, 'deathtouch')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- machinations secret: counter + mill ----
{ const st = game(); play(st, 0, 'dimir_machinations', null);
  ok('Machinations installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const life0 = st.players[0].life; const d0 = st.players[1].deck.length;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Machinations counters the enemy spell (no damage)', st.players[0].life === life0, [life0, st.players[0].life]);
  ok('Machinations then mills the opponent 3', st.players[1].deck.length === d0 - 3, [d0, st.players[1].deck.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
