// pool_nylea_test.mjs — Nylea land pool (G devotion: stompy Beasts + trample + ramp + fight).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._small = { id: '_small', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const beasts = (st, pi) => st.players[pi].board.filter(c => c.name === 'Beast').length;

const pool = raw.cards.filter(c => c.landSet === 'Nylea');
// ---- rubric ----
ok('Nylea pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/instant/enchantment/location', types.size >= 6 && ['weapon', 'instant', 'enchantment', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Green', pool.every(c => (c.colors || []).join('') === 'G'));

function game() {
  const st = E.createGame(byId, seededRng(54), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_wall'); const foe = put(st, 1, '_wall'); let threw = null;
  const tgt = (c.id === 'ordeal_of_nylea') ? { type: 'creature', uid: fr.uid, player: 0 }
    : (c.id === 'omen_of_nylea') ? { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: +2/+0 and Trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'nylea_god_of_the_hunt', null);
  ok('Nylea gives your creatures +2/+0 and Trample', v.attack === a0 + 2 && has(v, 'trample'), [a0, v.attack, v.keywords]); }

// ---- colossus overkill ----
{ const st = game(); const col = put(st, 0, 'nyleas_colossus'); const chump = put(st, 1, '_small'); const a0 = col.attack;
  E.attack(st, 0, col.uid, { type: 'creature', uid: chump.uid, player: 1 }); E.sweepDeaths(st);
  ok('Colossus Overkill: +2/+2 after crushing a small creature', col.attack === a0 + 2, [a0, col.attack]); }

// ---- forerunner: +1/+1 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'nyleas_forerunner', null);
  ok('Forerunner gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- disciple: gain 5 ----
{ const st = game(); const life0 = st.players[0].life;
  play(st, 0, 'nyleas_disciple', null);
  ok('Disciple gains 5 life', st.players[0].life === life0 + 5, [life0, st.players[0].life]); }

// ---- huntmaster: a Beast ----
{ const st = game(); const b0 = beasts(st, 0);
  play(st, 0, 'nyleas_huntmaster', null);
  ok('Huntmaster summons a 2/2 Beast', beasts(st, 0) === b0 + 1, [b0, beasts(st, 0)]); }

// ---- grovedancer: ramp ----
{ const st = game(); const b0 = st.players[0].mana.bonus;
  play(st, 0, 'nyleas_grovedancer', null);
  ok('Grovedancer gains 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- bow weapon: deathtouch + ping on hero attack ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall'); play(st, 0, 'bow_of_nylea', null);
  ok('Bow equips a Deathtouch weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('deathtouch'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Bow deals 1 to all enemy creatures after the hero attacks', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

// ---- keen eyes: draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'keen_eyes_of_nylea', null);
  ok('Keen Eyes draws 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- intervention: permanent ramp + draw ----
{ const st = game(); st.players[0].mana = { cur: 30, max: 5, bonus: 0 }; const h0 = st.players[0].hand.length;
  play(st, 0, 'nyleas_intervention', null);
  ok('Intervention gains 2 Mana Crystals and draws', st.players[0].mana.max === 7 && st.players[0].hand.length === h0 + 1, [st.players[0].mana.max, h0, st.players[0].hand.length]); }

// ---- presence enchantment: a Beast each turn ----
{ const st = game(); play(st, 0, 'nyleas_presence', null); const b0 = beasts(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Presence summons a Beast at turn start', beasts(st, 0) === b0 + 1, [b0, beasts(st, 0)]); }

// ---- ordeal: counters + ramp ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const bonus0 = st.players[0].mana.bonus;
  play(st, 0, 'ordeal_of_nylea', { type: 'creature', uid: v.uid, player: 0 });
  ok('Ordeal puts two +1/+1 counters and gains 2 Mana', v.attack === a0 + 2 && st.players[0].mana.bonus === bonus0 + 2, [a0, v.attack, bonus0, st.players[0].mana.bonus]); }

// ---- chrysalis location: tap for a Beast ----
{ const st = game(); play(st, 0, 'chrysalis_of_nylea', null); const loc = st.players[0].board.find(c => c.id === 'chrysalis_of_nylea'); const b0 = beasts(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Chrysalis taps for a 2/2 Beast', beasts(st, 0) === b0 + 1, [b0, beasts(st, 0)]); }

// ---- omen: a friendly fights an enemy ----
{ const st = game(); const fr = put(st, 0, '_wall'); const foe = put(st, 1, '_wall');
  play(st, 0, 'omen_of_nylea', { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid });
  ok('Omen makes a friendly fight an enemy (both take damage)', fr.damage === 3 && foe.damage === 3, [fr.damage, foe.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
