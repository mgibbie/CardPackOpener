// pool_sorin_test.mjs — Sorin pool redesign (B lifedrain vampires + lifegain payoffs + vampire tribal).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._vamp = { id: '_vamp', name: 'B', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Vampire' };
byId._heal = { id: '_heal', name: 'H', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'heal', value: 1, target: 'self' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Sorin');
// ---- rubric ----
ok('Sorin pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/weapon/enchantment/instant', types.size >= 6 && ['planeswalker', 'weapon', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura).length >= 3, pool.filter(c => c.ongoing || c.aura).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(6), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_vamp'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['sorin_silence', 'sorin_thirst', 'sorin_declaration', 'sorin_command'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'sorin_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- guide: grows when you gain life ----
{ const st = game(); st.players[0].life = 20; const g = put(st, 0, 'sorin_guide');
  play(st, 0, '_heal', null);
  ok('Sorin’s Guide gains +1/+0 when you gain life', g.attack === 3, g.attack); }

// ---- sorrowbringer: grows when you gain life ----
{ const st = game(); st.players[0].life = 20; const s = put(st, 0, 'sorin_sorrowbringer');
  play(st, 0, '_heal', null);
  ok('Sorrowbringer gains +1/+1 when you gain life', s.attack === 5 && E.hp(s) === 5, [s.attack, E.hp(s)]); }

// ---- vampire lord: anthem ----
{ const st = game(); put(st, 0, 'sorin_vampire_lord'); const other = put(st, 0, '_vamp'); E.recomputeAuras(st);
  ok('Vampire Lord buffs other Vampires +1/+1', other.attack === 3 && E.hp(other) === 3, [other.attack, E.hp(other)]); }

// ---- bloody blade: equips + spawns a Vampire when the hero attacks ----
{ const st = game(); play(st, 0, 'sorin_bloody_blade', null);
  const w = st.players[0].weapon;
  ok('Bloody Blade equips (3/2, Lifesteal)', w && w.attack === 3 && w.durability === 2 && (w.keywords || []).includes('lifesteal'), w && [w.attack, w.durability, w.keywords]);
  const b0 = st.players[0].board.length;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Bloody Blade spawns a Vampire after the hero attacks', st.players[0].board.some(c => c.name === 'Vampire') && st.players[0].board.length === b0 + 1, st.players[0].board.map(c => c.name)); }

// ---- curse: recurring end-of-turn drain ----
{ const st = game(); st.players[0].life = 20; play(st, 0, 'sorin_curse', null);
  const foeLife = st.players[1].life;
  E.fireOngoing(st, 0, 'turn-end');
  ok('Curse drains 2 from each opponent at end of turn', st.players[1].life === foeLife - 2, [foeLife, st.players[1].life]);
  ok('Curse heals you 2', st.players[0].life === 22, st.players[0].life); }

// ---- declaration: comeback kicker at <=15 life ----
{ const st = game(); const foe = put(st, 1, '_v'); st.players[0].life = 15;
  play(st, 0, 'sorin_declaration', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Declaration deals 5 to a creature when you are low', foe.damage === 5, foe.damage); }
{ const st = game(); const foe = put(st, 1, '_v'); st.players[0].life = 30;
  play(st, 0, 'sorin_declaration', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Declaration deals only 3 at high life', foe.damage === 3, foe.damage); }

// ---- charm Choose One (mode 1 = drain face) ----
{ const st = game(); st.players[0].life = 20; const foeLife = st.players[1].life;
  play(st, 0, 'sorin_charm', null, 1);
  ok('Charm (mode 2) drains each opponent for 3 and heals 3', st.players[1].life === foeLife - 3 && st.players[0].life === 23, [st.players[1].life, st.players[0].life]); }

// ---- silence: strips a creature then damages it ----
{ const st = game(); const foe = put(st, 1, '_v'); foe.keywords = ['taunt', 'divine_shield']; foe.shield = true;
  play(st, 0, 'sorin_silence', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Silence removes keywords and deals 2', (foe.keywords || []).length === 0 && foe.damage === 2, [foe.keywords, foe.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
