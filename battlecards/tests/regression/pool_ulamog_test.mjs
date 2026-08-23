// pool_ulamog_test.mjs — Ulamog boss pool (colorless Eldrazi: exile-removal + Indestructible + deck-exile + Scion ramp).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 6, attack: 8, health: 8, rarity: 'common', tribe: 'Beast' };
byId._dr = { id: '_dr', name: 'D', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', tribe: 'Beast', keywords: ['deathrattle'], deathrattle: [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Spawn', tribe: 'Beast' }] };
byId._eld = { id: '_eld', name: 'E', type: 'creature', cost: 5, attack: 5, health: 5, rarity: 'common', tribe: 'Eldrazi' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Ulamog');
// ---- rubric ----
ok('Ulamog pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl location/instant/enchantment/quest', types.size >= 6 && ['location', 'instant', 'enchantment', 'quest'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords incl immune (Indestructible)', kws.size >= 6 && kws.has('immune'), [...kws]);
ok('stays colorless', pool.every(c => Array.isArray(c.colors) && c.colors.length === 0));
ok('the boss (sig) is Indestructible and exiles', byId.ulamog_sig.type === 'creature' && (byId.ulamog_sig.keywords || []).includes('immune') && byId.ulamog_sig.effects.some(e => e.type === 'exile'));

function game() {
  const st = E.createGame(byId, seededRng(33), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = Array(20).fill('_v'); p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.exile = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const scions = (st, pi) => st.players[pi].board.filter(c => c.name === 'Eldrazi Scion');

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_big'); let threw = null;
  const foeTgt = ['ulamog_sig', 'ulamog_ceaseless_hunger', 'ulamog_despoiler', 'ulamog_nullifier', 'ulamog_corruption', 'ulamog_command'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'ulamog_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- immune: Ulamog survives lethal combat (Indestructible) ----
{ const st = game(); const titan = put(st, 0, 'ulamog_titan'); const foe = put(st, 1, '_big'); // 8/8
  E.attack(st, 0, titan.uid, { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Titan is Immune — takes no combat damage and survives', titan.damage === 0 && st.players[0].board.some(c => c.uid === titan.uid), [titan.damage]); }

// ---- sig: exile two enemy creatures + deck-exile on attack ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'ulamog_sig', { type: 'creature', uid: a.uid, player: 1 });
  ok('Ulamog battlecry exiles two enemy creatures', st.players[1].board.length === 0 && st.players[1].exile.length === 2, [st.players[1].board.length, st.players[1].exile.length]);
  const sig = st.players[0].board.find(c => c.id === 'ulamog_sig'); sig.sick = false; const d0 = st.players[1].deck.length;
  E.attack(st, 0, sig.uid, { type: 'hero', player: 1 });
  ok('Ulamog attack exiles the top 5 of the opponent deck', st.players[1].deck.length === d0 - 5, [d0, st.players[1].deck.length]); }

// ---- exile is hard removal: no deathrattle ----
{ const st = game(); const drc = put(st, 1, '_dr'); const spawns0 = st.players[1].board.filter(c => c.name === 'Spawn').length;
  play(st, 0, 'ulamog_corruption', { type: 'creature', uid: drc.uid, player: 1 });
  ok('Corruption exiles a creature (into exile, not graveyard)', st.players[1].exile.some(c => c.id === '_dr') && !st.players[1].board.some(c => c.uid === drc.uid), st.players[1].exile.map(c => c.id));
  ok('Exile dodges the Deathrattle (no Spawn token)', st.players[1].board.filter(c => c.name === 'Spawn').length === spawns0, st.players[1].board.map(c => c.name)); }

// ---- consumer: mill 5 ----
{ const st = game(); const d0 = st.players[1].deck.length;
  play(st, 0, 'ulamog_consumer', null);
  ok('Consumer exiles the top 5 of the opponent deck', st.players[1].deck.length === d0 - 5, [d0, st.players[1].deck.length]); }

// ---- locus: Eldrazi cost 1 less ----
{ const st = game(); const base = E.effectiveCost(st, 0, E.instantiate(byId._eld, 0));
  put(st, 0, 'ulamog_locus'); E.recomputeAuras(st);
  const cut = E.effectiveCost(st, 0, E.instantiate(byId._eld, 0));
  ok('Locus reduces your Eldrazi cost by 1', cut === base - 1, [base, cut]); }

// ---- monument location: tap for a Scion ----
{ const st = game(); play(st, 0, 'ulamog_monument', null);
  const loc = st.players[0].board.find(c => c.id === 'ulamog_monument'); const s0 = scions(st, 0).length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for a 1/1 Eldrazi Scion', scions(st, 0).length === s0 + 1, [s0, scions(st, 0).length]); }

// ---- reclaimer + drone: Scion ramp ----
{ const st = game(); play(st, 0, 'ulamog_reclaimer', null);
  ok('Reclaimer summons two Eldrazi Scions', scions(st, 0).length === 2, scions(st, 0).length);
  play(st, 0, 'ulamog_drone', null);
  ok('Drone summons a third Scion', scions(st, 0).length === 3, scions(st, 0).length); }

// ---- devouring enchantment: mill each turn ----
{ const st = game(); play(st, 0, 'ulamog_devouring', null); const d0 = st.players[1].deck.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Devouring exiles the top 2 of the opponent deck each turn', st.players[1].deck.length === d0 - 2, [d0, st.players[1].deck.length]); }

// ---- command modal: summon 5/5 (mode 1) ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'ulamog_command', null, 1);
  ok('Command (body mode) makes a 5/5 Eldrazi with Trample', st.players[0].board.some(c => c.name === 'Eldrazi' && c.attack === 5 && (c.keywords || []).includes('trample')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name + c.attack)); }

// ---- nullifier: silence ----
{ const st = game(); const foe = put(st, 1, 'ulamog_titan'); // an Immune/Taunt body to strip
  play(st, 0, 'ulamog_nullifier', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Nullifier silences a creature (strips Immune/Taunt)', (foe.keywords || []).length === 0, foe.keywords); }

// ---- descent quest: play 8 -> exile the whole enemy deck + 10/10 ----
{ const st = game(); play(st, 0, 'ulamog_descent_into_oblivion', null);
  ok('Descent installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  for (let i = 0; i < 8; i++) play(st, 0, '_cantrip', null);
  ok('Descent reward: exile the opponent’s entire deck', st.players[1].deck.length === 0, st.players[1].deck.length);
  ok('Descent reward: summon a 10/10 Eldrazi', st.players[0].board.some(c => c.name === 'Eldrazi' && c.attack === 10), st.players[0].board.map(c => c.name + c.attack)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
