// pool_istfell_test.mjs — Istfell land pool (WU / Kaldheim realm, 30 cards: Spirit tokens + elusive fliers + freeze/bounce control + card draw + lifegain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const spirits = (st, pi) => st.players[pi].board.filter(c => c.name === 'Spirit').length;

const pool = raw.cards.filter(c => c.landSet === 'Istfell');
// ---- rubric ----
ok('Istfell pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WU', pool.every(c => JSON.stringify(c.colors) === '["W","U"]'));
ok('all names contain Istfell + uncollectible', pool.every(c => /istfell/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(100), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['saw_it_coming', 'depart_the_realm', 'iron_verdict', 'istfell_iceblade'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Ranar: two Spirits + draw ----
{ const st = game(); const s0 = spirits(st, 0); const h0 = st.players[0].hand.length;
  play(st, 0, 'ranar_the_everwatchful', null);
  ok('Ranar summons two Elusive Spirits and draws', spirits(st, 0) === s0 + 2 && st.players[0].hand.length === h0 + 1, [s0, spirits(st, 0)]); }

// ---- fog of istfell: board freeze + draw ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'fog_of_istfell', null);
  ok('Fog freezes all enemy creatures and draws', !!a.frozen && !!b.frozen && st.players[0].hand.length === h0 + 1, [a.frozen, b.frozen]); }

// ---- ascendance enchantment: spell -> Spirit ----
{ const st = game(); play(st, 0, 'istfell_ascendance', null); const s0 = spirits(st, 0);
  cast(st, 0, '_cantrip');
  ok('Ascendance summons a Spirit when you cast a spell', spirits(st, 0) === s0 + 1, [s0, spirits(st, 0)]); }

// ---- monument location: tap for a Spirit ----
{ const st = game(); play(st, 0, 'istfell_monument', null); const loc = st.players[0].board.find(c => c.id === 'istfell_monument'); const s0 = spirits(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for an Elusive Spirit', spirits(st, 0) === s0 + 1, [s0, spirits(st, 0)]); }

// ---- aura artifact: +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'istfell_aura', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'istfell_aura').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Aura taps to put a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- saw it coming instant: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'saw_it_coming', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Foresight bounces a creature and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length]); }

// ---- iron verdict instant: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'iron_verdict', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Iron Verdict deals 4 to a creature', foe.damage === 4, foe.damage); }

// ---- NEW Cyclone Summoner: bounce all enemies ----
{ const st = game(); put(st, 1, '_v'); put(st, 1, '_wall'); const foeBoard0 = st.players[1].board.length;
  play(st, 0, 'istfell_cyclone_summoner', null);
  ok('Cyclone Summoner bounces all enemy creatures', st.players[1].board.length === 0, [foeBoard0, st.players[1].board.length]); }

// ---- NEW Cosmos Charger: charge flier ----
{ const st = game(); const { c } = play(st, 0, 'istfell_cosmos_charger', null);
  ok('Cosmos Charger has Elusive + Charge', has(c, 'elusive') && has(c, 'charge'), c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
