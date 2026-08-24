// pool_simic_test.mjs — Simic land pool (GU ramp + +1/+1 counters + proliferate + evolve + draw).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Simic');
// ---- rubric ----
ok('Simic pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/location/artifact', types.size >= 6 && ['instant', 'enchantment', 'location', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GU', pool.every(c => (c.colors || []).slice().sort().join('') === 'GU'));

function game() {
  const st = E.createGame(byId, seededRng(49), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const seed = (st, c) => { E.execEffects(st, c.controller, [{ type: 'grow', target: 'self', attack: 1, health: 1 }], null, c); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_v'); let threw = null;
  const frTgt = ['simic_manipulator', 'simic_guildmage', 'simic_initiate', 'simic_charm'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'simic_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Sky Swallower: counters on the whole team ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'simic_sky_swallower', null);
  ok('Sky Swallower puts a +1/+1 counter on each of your creatures', v.attack === a0 + 1, [a0, v.attack]); }

// ---- Momir Vig: draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'momir_vig_simic_visionary', null);
  ok('Momir Vig draws 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- ragworm: evolve on attack ----
{ const st = game(); const rw = put(st, 0, 'simic_ragworm'); const a0 = rw.attack;
  E.attack(st, 0, rw.uid, { type: 'hero', player: 1 });
  ok('Ragworm gains a +1/+1 counter when it attacks', rw.attack === a0 + 1, [a0, rw.attack]); }

// ---- manipulator: two counters ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'simic_manipulator', { type: 'creature', uid: v.uid, player: 0 });
  ok('Manipulator puts two +1/+1 counters on a creature', v.attack === a0 + 2 && v.counters >= 2, [a0, v.attack, v.counters]); }

// ---- guildmage: counter + draw ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'simic_guildmage', { type: 'creature', uid: v.uid, player: 0 });
  ok('Guildmage puts a counter and draws', v.attack === a0 + 1 && st.players[0].hand.length === h0 + 1, [a0, v.attack, h0, st.players[0].hand.length]); }

// ---- fluxmage: proliferate ----
{ const st = game(); const v = put(st, 0, '_v'); seed(st, v); const a0 = v.attack; // 3/3 with a counter
  play(st, 0, 'simic_fluxmage', null);
  ok('Fluxmage proliferates (the counter-bearer grows +1/+1)', v.attack === a0 + 1, [a0, v.attack]); }

// ---- charm modal: team counters (mode 2) ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'simic_charm', null, 2);
  ok('Charm (team mode) puts a +1/+1 counter on each of your creatures', v.attack === a0 + 1, [a0, v.attack]); }

// ---- ascendancy enchantment: counters each turn ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'simic_ascendancy', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Ascendancy puts a +1/+1 counter on your creatures at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- growth chamber location: tap for team counters ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'simic_growth_chamber', null);
  const loc = st.players[0].board.find(c => c.id === 'simic_growth_chamber'); const a0 = v.attack;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Growth Chamber taps to put a +1/+1 counter on your creatures', v.attack === a0 + 1, [a0, v.attack]); }

// ---- signet: permanent ramp ----
{ const st = game(); st.players[0].mana = { cur: 30, max: 5, bonus: 0 };
  play(st, 0, 'simic_signet', null);
  ok('Signet gains 2 Mana Crystals (max +2)', st.players[0].mana.max === 7, st.players[0].mana.max); }

// ---- keyrune: a 3/3 Elusive Crab ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'simic_keyrune', null);
  ok('Keyrune summons a 3/3 Elusive Crab', st.players[0].board.some(c => c.name === 'Crab' && c.attack === 3 && has(c, 'elusive')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'simic_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'simic_cluestone').uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- locket artifact: tap for mana ----
{ const st = game(); play(st, 0, 'simic_locket', null); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'simic_locket').uid, null);
  ok('Locket taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
