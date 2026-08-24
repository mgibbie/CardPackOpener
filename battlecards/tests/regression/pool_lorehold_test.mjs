// pool_lorehold_test.mjs — Lorehold land pool (RW devotion: Spirits + reanimation + relics + magecraft).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'Big', type: 'creature', cost: 8, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const spirits = (st, pi) => st.players[pi].board.filter(c => c.name === 'Spirit').length;

const pool = raw.cards.filter(c => c.landSet === 'Lorehold');
// ---- rubric ----
ok('Lorehold pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/artifact/location/enchantment', types.size >= 6 && ['instant', 'artifact', 'location', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RW', pool.every(c => (c.colors || []).slice().sort().join('') === 'RW'));

function game() {
  const st = E.createGame(byId, seededRng(74), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const foeTgt = ['lorehold_apprentice', 'lorehold_command'].includes(c.id);
  const frTgt = c.id === 'lorehold_charm';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Velomachus: reanimate highest-Cost dead creature ----
{ const st = game(); const big = put(st, 0, '_big'); kill(st, big); // logged as dead
  ok('deathLog captured the big creature', st.players[0].deathLogIds.includes('_big'), st.players[0].deathLogIds);
  const b0 = st.players[0].board.length;
  play(st, 0, 'velomachus_lorehold', null);
  ok('Velomachus returns a dead creature to the battlefield', st.players[0].board.some(c => c.id === '_big'), st.players[0].board.map(c => c.id)); }

// ---- pastcaller: two Spirits ----
{ const st = game(); const s0 = spirits(st, 0);
  play(st, 0, 'lorehold_pastcaller', null);
  ok('Pastcaller summons two 2/2 Spirits', spirits(st, 0) === s0 + 2, [s0, spirits(st, 0)]); }

// ---- excavation artifact: tap for a Spirit ----
{ const st = game(); play(st, 0, 'lorehold_excavation', null); const s0 = spirits(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'lorehold_excavation').uid, null);
  ok('Excavation taps for a 2/2 Spirit', spirits(st, 0) === s0 + 1, [s0, spirits(st, 0)]); }

// ---- chronomancer enchantment: magecraft Spirit ----
{ const st = game(); play(st, 0, 'lorehold_chronomancer', null); const s0 = spirits(st, 0);
  cast(st, 0, '_cantrip');
  ok('Chronomancer summons a Spirit when you cast a spell', spirits(st, 0) === s0 + 1, [s0, spirits(st, 0)]); }

// ---- guardian location: tap for a Divine Shield Spirit ----
{ const st = game(); play(st, 0, 'lorehold_guardian', null); const loc = st.players[0].board.find(c => c.id === 'lorehold_guardian'); const s0 = spirits(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const spirit = st.players[0].board.find(c => c.name === 'Spirit');
  ok('Guardian taps for a Divine Shield Spirit', spirits(st, 0) === s0 + 1 && spirit && has(spirit, 'divine_shield'), [s0, spirits(st, 0)]); }

// ---- apprentice: burn a creature ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'lorehold_apprentice', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Apprentice deals 1 to a creature', foe.damage === 1, foe.damage); }

// ---- command: burn + anthem ----
{ const st = game(); const foe = put(st, 1, '_big'); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'lorehold_command', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Command deals 2 and buffs your creatures +2/+2', foe.damage === 2 && v.attack === a0 + 2, [foe.damage, a0, v.attack]); }

// ---- hymn: reach ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'lorehold_hymn', null);
  ok('Hymn deals 3 to each opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- charm: +2/+2 and Rush ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'lorehold_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and Rush', v.attack === a0 + 2 && has(v, 'rush'), [a0, v.attack, v.keywords]); }

// ---- historian: gain 4 ----
{ const st = game(); const life0 = st.players[0].life;
  play(st, 0, 'lorehold_historian', null);
  ok('Historian gains 4 life', st.players[0].life === life0 + 4, [life0, st.players[0].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
