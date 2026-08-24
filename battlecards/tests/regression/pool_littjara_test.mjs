// pool_littjara_test.mjs — Littjara land pool (GU / Kaldheim realm, 30 cards: Shapeshifter tokens + counters + ramp + card draw + freeze/bounce).
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
const shifters = (st, pi) => st.players[pi].board.filter(c => c.name === 'Shapeshifter').length;

const pool = raw.cards.filter(c => c.landSet === 'Littjara');
// ---- rubric ----
ok('Littjara pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GU', pool.every(c => JSON.stringify(c.colors) === '["G","U"]'));
ok('all names contain Littjara + uncollectible', pool.every(c => /littjara/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(102), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['masked_vandal', 'littjara_reflection', 'ravenform', 'littjara_mirage', 'littjara_berg_strider'].includes(c.id);
  const frTgt = ['littjara_treefolk', 'littjara_gladewalker'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Alrund: draw 3 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'alrund_god_of_the_cosmos', null);
  ok('Alrund draws 3 cards', st.players[0].hand.length === h0 + 3, [h0, st.players[0].hand.length]); }

// ---- monument sorcery: two Shapeshifters ----
{ const st = game(); const s0 = shifters(st, 0);
  play(st, 0, 'littjara_monument', null);
  ok('Monument summons two Elusive Shapeshifters', shifters(st, 0) === s0 + 2 && st.players[0].board.some(c => c.name === 'Shapeshifter' && has(c, 'elusive')), [s0, shifters(st, 0)]); }

// ---- bears location: tap for a Shapeshifter ----
{ const st = game(); play(st, 0, 'the_bears_of_littjara', null); const loc = st.players[0].board.find(c => c.id === 'the_bears_of_littjara'); const s0 = shifters(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('The Bears taps for a 3/3 Shapeshifter', shifters(st, 0) === s0 + 1, [s0, shifters(st, 0)]); }

// ---- metamorphosis artifact: tap for a Shapeshifter ----
{ const st = game(); play(st, 0, 'littjara_metamorphosis', null); const s0 = shifters(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'littjara_metamorphosis').uid, null);
  ok('Metamorphosis taps for a Shapeshifter', shifters(st, 0) === s0 + 1, [s0, shifters(st, 0)]); }

// ---- paradox enchantment: turn-start draw ----
{ const st = game(); play(st, 0, 'littjara_paradox', null); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Paradox draws a card at turn start', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- reflection instant: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'littjara_reflection', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Reflection bounces and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length]); }

// ---- icebreaker kraken: board freeze ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'icebreaker_kraken', null);
  ok('Icebreaker Kraken freezes all enemy creatures', !!a.frozen && !!b.frozen, [a.frozen, b.frozen]); }

// ---- kelpie guide: ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'kelpie_guide', null);
  ok('Kelpie Guide gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- NEW Moritte: team anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'littjara_moritte', null);
  ok('Moritte gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- NEW Old-Growth Troll: reborn trampler ----
{ const st = game(); const { c } = play(st, 0, 'littjara_old_growth_troll', null);
  ok('Old-Growth Troll has Trample + Reborn', has(c, 'trample') && has(c, 'reborn'), c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
