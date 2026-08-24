// pool_obscura_test.mjs — Obscura land pool (WUB / Esper tri-color: Connive/card-advantage + spy tokens + evasion + control).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const thopters = (st, pi) => st.players[pi].board.filter(c => c.name === 'Thopter').length;

const pool = raw.cards.filter(c => c.landSet === 'Obscura');
// ---- rubric ----
ok('Obscura pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WUB (order W,U,B)', pool.every(c => JSON.stringify(c.colors) === '["W","U","B"]'));

function game() {
  const st = E.createGame(byId, seededRng(77), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['obscura_charm', 'obscura_silencer'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Raffine: Connive (team +1/+1 + draw) ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'raffine_obscura_schemer', null);
  ok('Raffine gives your creatures +1/+1 and draws', v.attack === a0 + 1 && st.players[0].hand.length === h0 + 1, [a0, v.attack, h0, st.players[0].hand.length]); }

// ---- Tivit: two Thopters + draw ----
{ const st = game(); const t0 = thopters(st, 0); const h0 = st.players[0].hand.length;
  play(st, 0, 'tivit_obscura_secretseller', null);
  ok('Tivit summons two Elusive Thopters and draws', thopters(st, 0) === t0 + 2 && st.players[0].board.some(c => c.name === 'Thopter' && has(c, 'elusive')) && st.players[0].hand.length === h0 + 1, [t0, thopters(st, 0)]); }

// ---- Kamiz: grant Elusive + draw ----
{ const st = game(); const v = put(st, 0, '_v');
  play(st, 0, 'kamiz_obscura_spymaster', null);
  ok('Kamiz gives your creatures Elusive', has(v, 'elusive'), v.keywords); }

// ---- informant: enemy discard ----
{ const st = game(); hand(st, 1, 3); const h0 = st.players[1].hand.length;
  play(st, 0, 'obscura_informant', null);
  ok('Informant makes each opponent discard 1', st.players[1].hand.length === h0 - 1, [h0, st.players[1].hand.length]); }

// ---- confluence: discard 2 + draw 2 ----
{ const st = game(); hand(st, 1, 4); const h1 = st.players[1].hand.length; const h0 = st.players[0].hand.length;
  play(st, 0, 'obscura_confluence', null);
  ok('Confluence: opponent discards 2, you draw 2', st.players[1].hand.length === h1 - 2 && st.players[0].hand.length === h0 + 2, [h1, st.players[1].hand.length, h0, st.players[0].hand.length]); }

// ---- silencer: deathtouch + silence ----
{ const st = game(); const foe = put(st, 1, '_wall'); foe.keywords = ['taunt', 'divine_shield'];
  const { c } = play(st, 0, 'obscura_silencer', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Silencer has Deathtouch and silences an enemy', has(c, 'deathtouch') && (foe.keywords || []).length === 0, [c.keywords, foe.keywords]); }

// ---- charm: destroy ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'obscura_charm', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Charm destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- ascendancy enchantment: turn-start scry + draw ----
{ const st = game(); play(st, 0, 'obscura_ascendancy', null); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Ascendancy draws a card at turn start', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- crown artifact: tap team +1/+0 and Elusive ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'obscura_crown_of_intrigue', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'obscura_crown_of_intrigue').uid, null);
  ok('Crown taps to give your creatures +1/+0 and Elusive', v.attack === a0 + 1 && has(v, 'elusive'), [a0, v.attack, v.keywords]); }

// ---- sentinel location: tap for a Thopter ----
{ const st = game(); play(st, 0, 'obscura_sentinel', null); const loc = st.players[0].board.find(c => c.id === 'obscura_sentinel'); const t0 = thopters(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Sentinel taps for an Elusive Thopter', thopters(st, 0) === t0 + 1, [t0, thopters(st, 0)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
