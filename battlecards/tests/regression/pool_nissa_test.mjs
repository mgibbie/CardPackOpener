// pool_nissa_test.mjs — Nissa pool redesign (G: ramp -> big Elementals + lands-matter + fight).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._ele = { id: '_ele', name: 'E', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Elemental' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Nissa');
// ---- rubric ----
ok('Nissa pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('Nissa pool spans >=6 card types incl location + quest + enchantment', types.size >= 6 && ['planeswalker', 'location', 'quest', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('Nissa pool uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('Nissa pool has >=3 persistent engines', pool.filter(c => c.ongoing || c.aura).length >= 3, pool.filter(c => c.ongoing || c.aura).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(7), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.lands = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_v'); let threw = null;
  const tgt = (['nissa_encouragement', 'nissa_judgement', 'nissa_defeat'].includes(c.id)) ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'nissa_renewal' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- location: tap for ramp + draw, durability ticks ----
{ const st = game(); play(st, 0, 'nissa_pilgrimage', null);
  const loc = st.players[0].board.find(c => c.id === 'nissa_pilgrimage');
  ok('Pilgrimage enters as a location with durability 2', loc && loc.type === 'location' && loc.durability === 2, loc && loc.durability);
  const h0 = st.players[0].hand.length; const dur0 = loc.durability;
  const tapped = E.tapLand(st, 0, loc.uid, 0);
  ok('Pilgrimage taps: draws a card and loses durability', tapped && st.players[0].hand.length === h0 + 1 && loc.durability === dur0 - 1, [tapped, h0, st.players[0].hand.length, loc.durability]); }

// ---- naturalist: ramp battlecry + Elemental payoff ongoing ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'nissa_naturalist', null);
  ok('Naturalist battlecry gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]);
  const { c: ele } = play(st, 0, '_ele', null);
  ok('Naturalist buffs a played Elemental +1/+1', ele.attack === 3 && E.hp(ele) === 3, [ele.attack, E.hp(ele)]); }

// ---- elemental: Landfall grows on a land drop ----
{ const st = game(); const el = put(st, 0, 'nissa_elemental');
  const bought = E.buyLand(st, 0, 'forest');
  ok('Landfall: Elemental grows +1/+1 when a land enters', bought && el.attack === 5 && E.hp(el) === 5, [bought, el.attack, E.hp(el)]); }

// ---- vital_force: Elemental anthem (+1/+1 and Trample) ----
{ const st = game(); play(st, 0, 'nissa_vital_force', null); const ele = put(st, 0, '_ele'); E.recomputeAuras(st);
  ok('Vital Force gives Elementals +1/+1 and Trample', ele.attack === 3 && E.hp(ele) === 3 && (E.has ? E.has(ele, 'trample') : (ele.keywords || []).includes('trample')), [ele.attack, E.hp(ele), ele.keywords]); }

// ---- renewal Choose One (ramp mode) ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'nissa_renewal', null, 0);
  ok('Renewal (ramp mode) gains 2 Mana Crystals', st.players[0].mana.max === max0 + 2, [max0, st.players[0].mana.max]); }

// ---- defeat: a friendly creature fights an enemy ----
{ const st = game(); const fr = put(st, 0, '_v'); fr.attack = 5; fr.maxHealth = 5; const foe = put(st, 1, '_ele');
  // a fight target carries both the fighter (uid) and its foe (fightTarget)
  play(st, 0, 'nissa_defeat', { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid });
  ok('Defeat: the friendly fights and kills an enemy creature', !st.players[1].board.some(c => c.uid === foe.uid), [st.players[1].board.map(c => c.id), foe.damage]); }

// ---- expedition quest: summon 5 -> big Elemental + ramp ----
{ const st = game(); const max0 = st.players[0].mana.max; play(st, 0, 'nissa_expedition', null);
  ok('Expedition installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  for (let i = 0; i < 5; i++) play(st, 0, '_v', null);
  ok('Expedition reward summons a 6/6 Elemental', st.players[0].board.some(c => c.name === 'Elemental' && c.attack === 6), st.players[0].board.map(c => c.name + c.attack));
  ok('Expedition reward gains 2 Mana Crystals', st.players[0].mana.max === max0 + 2, [max0, st.players[0].mana.max]); }

// ---- resurgence: reborn + deathrattle both present ----
ok('Resurgence is a sticky Elemental (reborn + deathrattle)', (byId.nissa_resurgence.keywords || []).includes('reborn') && Array.isArray(byId.nissa_resurgence.deathrattle));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
