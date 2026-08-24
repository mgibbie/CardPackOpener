// pool_phenax_test.mjs — Phenax land pool (UB devotion: defensive mill + discard + control).
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

const pool = raw.cards.filter(c => c.landSet === 'Phenax');
// ---- rubric ----
ok('Phenax pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl secret/instant/enchantment/artifact', types.size >= 6 && ['secret', 'instant', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UB', pool.every(c => (c.colors || []).slice().sort().join('') === 'BU'));

function game() {
  const st = E.createGame(byId, seededRng(62), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = Array(20).fill('_v'); p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_v'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['phenax_deceit', 'phenax_treachery', 'hubris_of_phenax'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: discard 2 + mill 3 + turn-start mill ----
{ const st = game(); hand(st, 1, 3); const d0 = st.players[1].deck.length;
  play(st, 0, 'phenax_god_of_deception', null);
  ok('Phenax battlecry: opponent discards 2 and mills 3', st.players[1].hand.length === 1 && st.players[1].deck.length === d0 - 3, [st.players[1].hand.length, d0, st.players[1].deck.length]);
  const d1 = st.players[1].deck.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Phenax turn-start mills 3 more', st.players[1].deck.length === d1 - 3, [d1, st.players[1].deck.length]); }

// ---- disciple: discard ----
{ const st = game(); hand(st, 1, 2);
  play(st, 0, 'disciple_of_phenax', null);
  ok('Disciple makes the opponent discard', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- command: discard + draw ----
{ const st = game(); hand(st, 1, 2); const h0 = st.players[0].hand.length;
  play(st, 0, 'phenax_command', null);
  ok('Command: opponent discards and you draw', st.players[1].hand.length === 1 && st.players[0].hand.length === h0 + 1, [st.players[1].hand.length, h0, st.players[0].hand.length]); }

// ---- deceit: freeze + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'phenax_deceit', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Deceit freezes an enemy and draws', !!foe.frozen && st.players[0].hand.length === h0 + 1, [foe.frozen, h0, st.players[0].hand.length]); }

// ---- blessing enchantment: Deathtouch to played creatures ----
{ const st = game(); play(st, 0, 'phenax_blessing', null);
  const { c } = play(st, 0, '_v', null);
  ok('Blessing gives a freshly played creature Deathtouch', has(c, 'deathtouch'), c.keywords); }

// ---- treachery: steal ----
{ const st = game(); const foe = put(st, 1, '_v'); // 3 Attack
  play(st, 0, 'phenax_treachery', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Treachery steals an enemy creature (<=5 Attack)', st.players[0].board.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid)); }

// ---- spite: discard 2 ----
{ const st = game(); hand(st, 1, 3);
  play(st, 0, 'spite_of_phenax', null);
  ok('Spite: opponent discards 2', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- dictate artifact: tap to mill ----
{ const st = game(); play(st, 0, 'dictate_of_phenax', null); const d0 = st.players[1].deck.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'dictate_of_phenax').uid, null);
  ok('Dictate taps to exile the top 2 of the opponent deck', st.players[1].deck.length === d0 - 2, [d0, st.players[1].deck.length]); }

// ---- hubris: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'hubris_of_phenax', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Hubris bounces an enemy and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

// ---- charm secret: counter + mill ----
{ const st = game(); play(st, 0, 'phenax_charm', null);
  ok('Charm installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const life0 = st.players[0].life; const d0 = st.players[1].deck.length;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Charm counters the enemy spell (no damage) and mills 3', st.players[0].life === life0 && st.players[1].deck.length === d0 - 3, [life0, st.players[0].life, d0, st.players[1].deck.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
