// pool_iroas_test.mjs — Iroas land pool (RW devotion: aggressive first-strike combat + go-wide anthems + burn).
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

const pool = raw.cards.filter(c => c.landSet === 'Iroas');
// ---- rubric ----
ok('Iroas pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/instant/enchantment/location', types.size >= 6 && ['weapon', 'instant', 'enchantment', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RW', pool.every(c => (c.colors || []).slice().sort().join('') === 'RW'));

function game() {
  const st = E.createGame(byId, seededRng(64), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const soldiers = (st, pi) => st.players[pi].board.filter(c => c.name === 'Soldier').length;

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = ['hero_of_iroas', 'iroas_blessing'].includes(c.id);
  const foeTgt = c.id === 'priest_of_iroas';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: +2/+0 and First Strike ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'iroas_god_of_victory', null);
  ok('Iroas gives your creatures +2/+0 and First Strike', v.attack === a0 + 2 && has(v, 'first_strike'), [a0, v.attack, v.keywords]); }

// ---- hero: +2/+2 ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'hero_of_iroas', { type: 'creature', uid: v.uid, player: 0 });
  ok('Hero gives a creature +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- kalemne: team Divine Shield ----
{ const st = game(); const v = put(st, 0, '_v');
  play(st, 0, 'kalemne_disciple_of_iroas', null);
  ok('Kalemne gives your creatures Divine Shield', has(v, 'divine_shield') || v.shield, [v.keywords, v.shield]); }

// ---- priest: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'priest_of_iroas', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Priest deals 2 to a creature', foe.damage === 2, foe.damage); }

// ---- armory weapon: rally on hero attack ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'armory_of_iroas', null); const a0 = v.attack;
  ok('Armory equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Armory gives your creatures +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

// ---- blessing: +2/+2 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'iroas_blessing', { type: 'creature', uid: v.uid, player: 0 });
  ok('Blessing gives +2/+2 and Rush', v.attack === a0 + 2 && has(v, 'rush'), [a0, v.attack]); }

// ---- triumph enchantment: escalating anthem ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'triumph_of_iroas', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Triumph gives your creatures +1/+0 at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- hymn: face burn ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'hymn_of_iroas', null);
  ok('Hymn deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- will location: tap for a First Strike Soldier ----
{ const st = game(); play(st, 0, 'will_of_iroas', null); const loc = st.players[0].board.find(c => c.id === 'will_of_iroas'); const s0 = soldiers(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Will taps for a 2/1 Soldier with First Strike', soldiers(st, 0) === s0 + 1 && st.players[0].board.some(c => c.name === 'Soldier' && has(c, 'first_strike')), [s0, soldiers(st, 0)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
