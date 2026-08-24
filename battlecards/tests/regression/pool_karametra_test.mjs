// pool_karametra_test.mjs — Karametra land pool (GW devotion: ramp + tokens/harvest + lifegain + go-wide).
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
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;

const pool = raw.cards.filter(c => c.landSet === 'Karametra');
// ---- rubric ----
ok('Karametra pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/instant/weapon/location', types.size >= 6 && ['enchantment', 'instant', 'weapon', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GW', pool.every(c => (c.colors || []).slice().sort().join('') === 'GW'));

function game() {
  const st = E.createGame(byId, seededRng(57), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_v'); let threw = null;
  const frTgt = ['karametras_blessing', 'karametras_favor', 'karametras_repeal'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry Elementals + harvest engine ----
{ const st = game(); const e0 = named(st, 0, 'Elemental');
  play(st, 0, 'karametra_god_of_harvests', null);
  ok('Karametra battlecry summons two 2/2 Elementals', named(st, 0, 'Elemental') === e0 + 2, [e0, named(st, 0, 'Elemental')]);
  const e1 = named(st, 0, 'Elemental');
  play(st, 0, '_v');
  ok('Karametra: playing a creature summons a 1/1 Elemental', named(st, 0, 'Elemental') === e1 + 1, [e1, named(st, 0, 'Elemental')]); }

// ---- acolyte: permanent ramp ----
{ const st = game(); st.players[0].mana = { cur: 30, max: 5, bonus: 0 };
  play(st, 0, 'karametras_acolyte', null);
  ok('Acolyte gains a Mana Crystal (max +1)', st.players[0].mana.max === 6, st.players[0].mana.max); }

// ---- mystic: temp ramp ----
{ const st = game(); const b0 = st.players[0].mana.bonus;
  play(st, 0, 'karametras_mystic', null);
  ok('Mystic gains 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- battle priest: gain 4 + Divine Shield ----
{ const st = game(); const life0 = st.players[0].life;
  const { c } = play(st, 0, 'karametras_battle_priest', null);
  ok('Battle Priest gains 4 life and has Divine Shield', st.players[0].life === life0 + 4 && (has(c, 'divine_shield') || c.shield), [life0, st.players[0].life]); }

// ---- dictate enchantment: ramp on creatures ----
{ const st = game(); play(st, 0, 'dictate_of_karametra', null); const b0 = st.players[0].mana.bonus;
  play(st, 0, '_v');
  ok('Dictate gains a Mana Crystal when you play a creature', st.players[0].mana.bonus === b0 + 1, [b0, st.players[0].mana.bonus]); }

// ---- blessing: +2/+2 and Divine Shield ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'karametras_blessing', { type: 'creature', uid: v.uid, player: 0 });
  ok('Blessing gives +2/+2 and Divine Shield', v.attack === a0 + 2 && (has(v, 'divine_shield') || v.shield), [a0, v.attack]); }

// ---- favor: +1/+1 + draw ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'karametras_favor', { type: 'creature', uid: v.uid, player: 0 });
  ok('Favor gives +1/+1 and draws', v.attack === a0 + 1 && st.players[0].hand.length === h0 + 1, [a0, v.attack, h0, st.players[0].hand.length]); }

// ---- repeal: three counters ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'karametras_repeal', { type: 'creature', uid: v.uid, player: 0 });
  ok('Repeal puts three +1/+1 counters on a creature', v.attack === a0 + 3, [a0, v.attack]); }

// ---- bountiful harvest: Saprolings + life ----
{ const st = game(); const s0 = named(st, 0, 'Saproling'); const life0 = st.players[0].life;
  play(st, 0, 'karametras_bountiful_harvest', null);
  ok('Bountiful Harvest summons three Saprolings and gains 3 life', named(st, 0, 'Saproling') === s0 + 3 && st.players[0].life === life0 + 3, [s0, named(st, 0, 'Saproling'), life0, st.players[0].life]); }

// ---- veneration location: tap for an Elemental + life ----
{ const st = game(); play(st, 0, 'veneration_of_karametra', null); const loc = st.players[0].board.find(c => c.id === 'veneration_of_karametra');
  const e0 = named(st, 0, 'Elemental'); const life0 = st.players[0].life;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Veneration taps for a 2/2 Elemental and 1 life', named(st, 0, 'Elemental') === e0 + 1 && st.players[0].life === life0 + 1, [e0, named(st, 0, 'Elemental'), life0, st.players[0].life]); }

// ---- scythe weapon: Elemental on hero attack ----
{ const st = game(); play(st, 0, 'scythe_of_karametra', null); const e0 = named(st, 0, 'Elemental');
  ok('Scythe equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Scythe summons an Elemental after the hero attacks', named(st, 0, 'Elemental') === e0 + 1, [e0, named(st, 0, 'Elemental')]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
