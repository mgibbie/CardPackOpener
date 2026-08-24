// pool_selesnya_test.mjs — Selesnya land pool (GW token swarm + populate + go-wide anthems + lifegain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const saps = (st, pi) => st.players[pi].board.filter(c => c.name === 'Saproling').length;

const pool = raw.cards.filter(c => c.landSet === 'Selesnya');
// ---- rubric ----
ok('Selesnya pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/location/enchantment/artifact', types.size >= 6 && ['instant', 'location', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GW', pool.every(c => (c.colors || []).slice().sort().join('') === 'GW'));

function game() {
  const st = E.createGame(byId, seededRng(46), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_wall'); let threw = null;
  const tgt = (c.id === 'selesnya_guildmage') ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'selesnya_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Emmara: go-wide +2/+2 and Divine Shield ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'emmara_tandris_selesnya_oversoul', null);
  ok('Emmara gives your creatures +2/+2 and Divine Shield', v.attack === a0 + 2 && (has(v, 'divine_shield') || v.shield), [a0, v.attack, v.shield]); }

// ---- Trostani: lifegain on summon ----
{ const st = game(); put(st, 0, 'trostani_selesnyas_voice'); const life0 = st.players[0].life;
  E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Saproling', tribe: 'Saproling', keywords: [] }], null, null);
  ok('Trostani gains 1 life when you summon a creature', st.players[0].life === life0 + 1, [life0, st.players[0].life]); }

// ---- bloom hulk: +1/+1 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'selesnya_bloom_hulk', null);
  ok('Bloom Hulk gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- gardener: two 2/2 Saprolings ----
{ const st = game(); const s0 = saps(st, 0);
  play(st, 0, 'selesnya_gardener', null);
  ok('Gardener summons two 2/2 Saprolings', saps(st, 0) === s0 + 2 && st.players[0].board.some(c => c.name === 'Saproling' && c.attack === 2), [s0, saps(st, 0)]); }

// ---- eulogist: two Saprolings + gain 2 ----
{ const st = game(); const s0 = saps(st, 0); const life0 = st.players[0].life;
  play(st, 0, 'selesnya_eulogist', null);
  ok('Eulogist summons two Saprolings and gains 2 life', saps(st, 0) === s0 + 2 && st.players[0].life === life0 + 2, [s0, saps(st, 0), life0, st.players[0].life]); }

// ---- guildmage: +1/+1 and Taunt ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'selesnya_guildmage', { type: 'creature', uid: v.uid, player: 0 });
  ok('Guildmage gives +1/+1 and Taunt', v.attack === a0 + 1 && has(v, 'taunt'), [a0, v.attack, v.keywords]); }

// ---- sagittar: sweep 1 ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'selesnya_sagittar', null);
  ok('Sagittar deals 1 to all enemy creatures', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

// ---- charm modal: gain 5 (mode 2) ----
{ const st = game(); const life0 = st.players[0].life;
  play(st, 0, 'selesnya_charm', null, 2);
  ok('Charm (lifegain mode) gains 5 life', st.players[0].life === life0 + 5, [life0, st.players[0].life]); }

// ---- charm modal: a 2/2 Knight (mode 0) ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'selesnya_charm', null, 0);
  ok('Charm (token mode) summons a 2/2 Knight with Taunt', st.players[0].board.some(c => c.name === 'Knight' && has(c, 'taunt')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- keyrune location: tap for a Wolf ----
{ const st = game(); play(st, 0, 'selesnya_keyrune', null); const loc = st.players[0].board.find(c => c.id === 'selesnya_keyrune'); const n0 = st.players[0].board.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Keyrune taps for a 2/2 Wolf with Trample', st.players[0].board.some(c => c.name === 'Wolf' && has(c, 'trample')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- locket enchantment: a Saproling each turn ----
{ const st = game(); play(st, 0, 'selesnya_locket', null); const s0 = saps(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Locket summons a Saproling at turn start', saps(st, 0) === s0 + 1, [s0, saps(st, 0)]); }

// ---- signet artifact: tap for mana ----
{ const st = game(); play(st, 0, 'selesnya_signet', null); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'selesnya_signet').uid, null);
  ok('Signet taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- cluestone: draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'selesnya_cluestone', null);
  ok('Cluestone draws 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
