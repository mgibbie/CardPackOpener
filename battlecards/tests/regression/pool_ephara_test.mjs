// pool_ephara_test.mjs — Ephara land pool (WU devotion: card advantage on creatures + control + Soldier tokens + defense).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const soldiers = (st, pi) => st.players[pi].board.filter(c => c.name === 'Soldier').length;

const pool = raw.cards.filter(c => c.landSet === 'Ephara');
// ---- rubric ----
ok('Ephara pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/secret/location/enchantment', types.size >= 6 && ['instant', 'secret', 'location', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WU', pool.every(c => (c.colors || []).slice().sort().join('') === 'UW'));

function game() {
  const st = E.createGame(byId, seededRng(56), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = c.id === 'epharas_charm';
  const foeTgt = ['epharas_dispersal', 'epharas_godfire'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry draw 2 + creature-played every 2 -> draw ----
{ const st = game(); put(st, 0, 'ephara_god_of_the_polis'); const h0 = st.players[0].hand.length;
  play(st, 0, '_v'); const mid = st.players[0].hand.length;
  play(st, 0, '_v');
  ok('Ephara draws after your 2nd creature (not the 1st)', mid === h0 && st.players[0].hand.length === h0 + 1, [h0, mid, st.players[0].hand.length]); }

// ---- god battlecry draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'ephara_god_of_the_polis', null);
  ok('Ephara battlecry draws 2', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- dispersal: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'epharas_dispersal', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Dispersal bounces an enemy and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

// ---- radiance: sweep + life ----
{ const st = game(); const a = put(st, 1, '_v'); const life0 = st.players[0].life;
  play(st, 0, 'epharas_radiance', null);
  ok('Radiance deals 1 to all enemy creatures and gains 2 life', a.damage === 1 && st.players[0].life === life0 + 2, [a.damage, life0, st.players[0].life]); }

// ---- stern dismissal secret: counter + draw ----
{ const st = game(); play(st, 0, 'epharas_stern_dismissal', null);
  ok('Stern Dismissal installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Stern Dismissal counters the enemy spell and draws', st.players[0].life === life0 && st.players[0].hand.length === h0 + 1, [life0, st.players[0].life, h0, st.players[0].hand.length]); }

// ---- prayer of shelter: mass Divine Shield ----
{ const st = game(); const v = put(st, 0, '_v');
  play(st, 0, 'epharas_prayer_of_shelter', null);
  ok('Prayer of Shelter gives your creatures Divine Shield', has(v, 'divine_shield') || v.shield, [v.keywords, v.shield]); }

// ---- command: draw + Soldier ----
{ const st = game(); const h0 = st.players[0].hand.length; const s0 = soldiers(st, 0);
  play(st, 0, 'epharas_command', null);
  ok('Command draws a card and summons a Soldier', st.players[0].hand.length === h0 + 1 && soldiers(st, 0) === s0 + 1, [h0, st.players[0].hand.length, s0, soldiers(st, 0)]); }

// ---- charm: +1/+1 and Divine Shield + draw ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'epharas_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +1/+1 and Divine Shield and draws', v.attack === a0 + 1 && (has(v, 'divine_shield') || v.shield) && st.players[0].hand.length === h0 + 1, [a0, v.attack, v.shield]); }

// ---- temple grounds location: tap for a Soldier ----
{ const st = game(); play(st, 0, 'epharas_temple_grounds', null); const loc = st.players[0].board.find(c => c.id === 'epharas_temple_grounds'); const s0 = soldiers(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Temple Grounds taps for a 2/2 Soldier', soldiers(st, 0) === s0 + 1, [s0, soldiers(st, 0)]); }

// ---- city blessing enchantment: draw + anthem each turn ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'epharas_city_blessing', null); const h0 = st.players[0].hand.length; const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('City Blessing draws and gives +1/+0 at turn start', st.players[0].hand.length === h0 + 1 && v.attack === a0 + 1, [h0, st.players[0].hand.length, a0, v.attack]); }

// ---- godfire: removal + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'epharas_godfire', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Godfire destroys a creature and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
