// pool_silverquill_test.mjs — Silverquill land pool (WB devotion: Inkling tokens + magecraft + lifedrain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const inklings = (st, pi) => st.players[pi].board.filter(c => c.name === 'Inkling').length;

const pool = raw.cards.filter(c => c.landSet === 'Silverquill');
// ---- rubric ----
ok('Silverquill pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl location/enchantment/instant/artifact', types.size >= 6 && ['location', 'enchantment', 'instant', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WB', pool.every(c => (c.colors || []).slice().sort().join('') === 'BW'));

function game() {
  const st = E.createGame(byId, seededRng(71), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 2); let threw = null;
  const frTgt = c.id === 'silverquill_charm';
  const foeTgt = ['silverquill_silencer', 'silverquill_fracture'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Shadrix: Inklings + draw ----
{ const st = game(); const i0 = inklings(st, 0); const h0 = st.players[0].hand.length;
  play(st, 0, 'shadrix_silverquill', null);
  ok('Shadrix summons two Inklings and draws', inklings(st, 0) === i0 + 2 && st.players[0].hand.length === h0 + 1 && st.players[0].board.some(c => c.name === 'Inkling' && has(c, 'lifesteal')), [i0, inklings(st, 0)]); }

// ---- Felisa: aristocrat Inkling engine ----
{ const st = game(); put(st, 0, 'felisa_fang_of_silverquill'); const fodder = put(st, 0, '_v'); const i0 = inklings(st, 0);
  kill(st, fodder);
  ok('Felisa summons an Inkling when a friendly dies', inklings(st, 0) === i0 + 1, [i0, inklings(st, 0)]); }

// ---- silencer: silence ----
{ const st = game(); const foe = put(st, 1, '_wall'); foe.keywords = ['taunt', 'divine_shield'];
  play(st, 0, 'silverquill_silencer', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Silencer silences an enemy creature', (foe.keywords || []).length === 0, foe.keywords); }

// ---- grand inkling: +1/+1 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'silverquill_grand_inkling', null);
  ok('Grand Inkling gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- Killian magecraft: spells drain ----
{ const st = game(); put(st, 0, 'killian_ink_duelist'); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  cast(st, 0, '_cantrip');
  ok('Killian drains 1 when you cast a spell', st.players[1].life === foeLife0 - 1 && st.players[0].life === myLife0 + 1, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- command location: tap for an Inkling ----
{ const st = game(); play(st, 0, 'silverquill_command', null); const loc = st.players[0].board.find(c => c.id === 'silverquill_command'); const i0 = inklings(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Command taps for an Inkling', inklings(st, 0) === i0 + 1, [i0, inklings(st, 0)]); }

// ---- elocution enchantment: magecraft anthem ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'silverquill_elocution', null); const a0 = v.attack;
  cast(st, 0, '_cantrip');
  ok('Elocution gives your creatures +1/+1 when you cast a spell', v.attack === a0 + 1, [a0, v.attack]); }

// ---- finale: drain 4 ----
{ const st = game(); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'silverquill_finale', null);
  ok('Finale drains 4', st.players[1].life === foeLife0 - 4 && st.players[0].life === myLife0 + 4, [foeLife0, st.players[1].life]); }

// ---- fracture: destroy ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'silverquill_fracture', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Fracture destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- charm: +2/+2 and Lifesteal ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'silverquill_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and Lifesteal', v.attack === a0 + 2 && has(v, 'lifesteal'), [a0, v.attack]); }

// ---- vanishverse artifact: tap to destroy a small creature ----
{ const st = game(); const foe = put(st, 1, '_v'); // 2 Attack
  play(st, 0, 'silverquill_vanishverse', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'silverquill_vanishverse').uid, { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Vanishverse taps to destroy a creature with 2 or less Attack', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- spite: discard + drain ----
{ const st = game(); hand(st, 1, 2); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  play(st, 0, 'silverquill_spite', null);
  ok('Spite: opponent discards, and drain 2', st.players[1].hand.length === 1 && st.players[1].life === foeLife0 - 2 && st.players[0].life === myLife0 + 2, [st.players[1].hand.length, foeLife0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
