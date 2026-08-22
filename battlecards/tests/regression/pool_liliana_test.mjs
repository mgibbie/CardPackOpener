// pool_liliana_test.mjs — Liliana pool redesign (B: sacrifice/reanimation + UNDEAD + discard/drain).
// This game uses "Undead", never "Zombie" — asserted below.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._u = { id: '_u', name: 'U', type: 'creature', cost: 3, attack: 2, health: 2, rarity: 'common', tribe: 'Undead' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Liliana');
// ---- rubric + Undead-not-Zombie ----
ok('Liliana pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/enchantment/quest/instant', types.size >= 6 && ['planeswalker', 'enchantment', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura).length >= 3, pool.filter(c => c.ongoing || c.aura).map(c => c.id));
ok('NO card in the pool mentions "Zombie"', !pool.some(c => /zombie/i.test(JSON.stringify(c))), pool.filter(c => /zombie/i.test(JSON.stringify(c))).map(c => c.id));
ok('Liliana makes Undead (sig + mastery use tribe Undead)', /Undead/.test(JSON.stringify(byId.liliana_sig)) && byId.liliana_mastery.effects[0].tribe === 'Undead');

function game() {
  const st = E.createGame(byId, seededRng(3), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const kill = (st, c) => { c.damage = c.maxHealth; c.shield = false; E.sweepDeaths(st); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_u'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = c.id === 'liliana_defeat' ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- caress: recurring discard at end of turn ----
{ const st = game(); play(st, 0, 'liliana_caress', null);
  st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)];
  E.fireOngoing(st, 0, 'turn-end');
  ok('Caress makes each opponent discard at end of turn', st.players[1].hand.length === 2, st.players[1].hand.length); }

// ---- scrounger deathrattle draws ----
{ const st = game(); const s = put(st, 0, 'liliana_scrounger'); const h0 = st.players[0].hand.length;
  kill(st, s);
  ok('Scrounger deathrattle draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- devotee: grows when a friendly dies ----
{ const st = game(); const d = put(st, 0, 'liliana_devotee'); const fodder = put(st, 0, '_v');
  kill(st, fodder);
  ok('Devotee gains +1/+0 when a friendly dies', d.attack === 3, d.attack); }

// ---- reaver: Undead lord (+1/+0 and Deathtouch to your other Undead) ----
{ const st = game(); put(st, 0, 'liliana_reaver'); const other = put(st, 0, '_u'); E.recomputeAuras(st);
  ok('Reaver buffs other Undead +1/+0 and grants Deathtouch', other.attack === 3 && (E.has ? E.has(other, 'deathtouch') : (other.keywords || []).includes('deathtouch')), [other.attack, other.keywords]); }

// ---- scorn: resurrect the best creature that died this game ----
{ const st = game(); const big = put(st, 0, '_u'); big.__die = true; kill(st, big);
  const b0 = st.players[0].board.length;
  play(st, 0, 'liliana_scorn', null);
  const revived = st.players[0].board.find(c => c.id === '_u');
  ok('Scorn resurrects a dead creature with Reborn', st.players[0].board.length === b0 + 1 && revived && (revived.keywords || []).includes('reborn'), [b0, st.players[0].board.length, revived && revived.keywords]); }

// ---- specter discard battlecry ----
{ const st = game(); st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)];
  play(st, 0, 'liliana_specter', null);
  ok('Specter battlecry: opponent discards', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- mastery: two 3/3 Undead with Deathtouch + Reborn ----
{ const st = game(); const b0 = st.players[0].board.length;
  play(st, 0, 'liliana_mastery', null);
  const und = st.players[0].board.filter(c => c.name === 'Undead');
  ok('Mastery summons two Undead (deathtouch + reborn)', st.players[0].board.length === b0 + 2 && und.length === 2 && und.every(c => c.keywords.includes('deathtouch') && c.keywords.includes('reborn')), und.map(c => c.keywords)); }

// ---- contract quest: 6 deaths -> resurrect x2 + drain 5 + gain 5 ----
{ const st = game(); st.players[0].life = 20; play(st, 0, 'liliana_contract', null);
  ok('Contract installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  const foeLife = st.players[1].life;
  for (let i = 0; i < 6; i++) { const c = put(st, 0, '_u'); kill(st, c); }
  ok('Contract reward drains 5 from each opponent', st.players[1].life === foeLife - 5, [foeLife, st.players[1].life]);
  ok('Contract reward heals the hero 5', st.players[0].life === 25, st.players[0].life);
  ok('Contract reward resurrects dead creatures', st.players[0].board.some(c => c.id === '_u'), st.players[0].board.map(c => c.id)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
