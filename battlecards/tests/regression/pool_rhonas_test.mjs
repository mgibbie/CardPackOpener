// pool_rhonas_test.mjs — Rhonas land pool redesign (G devotion: big tramplers + ramp + fight + pump).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._small = { id: '_small', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Rhonas');
// ---- rubric ----
ok('Rhonas pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/location/enchantment/weapon', types.size >= 6 && ['instant', 'location', 'enchantment', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Green', pool.every(c => (c.colors || []).join('') === 'G'));

function game() {
  const st = E.createGame(byId, seededRng(69), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const beasts = (st, pi) => st.players[pi].board.filter(c => c.name === 'Beast').length;

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_wall'); const foe = put(st, 1, '_wall'); let threw = null;
  const tgt = (c.id === 'trial_of_rhonas') ? { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid }
    : ['champion_of_rhonas', 'rhonas_cartouche', 'strength_of_rhonas'].includes(c.id) ? { type: 'creature', uid: fr.uid, player: 0 }
    : (c.id === 'rhonas_hour_of_glory') ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: +2/+0 and Trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'god_eternal_rhonas', null);
  ok('Rhonas gives your creatures +2/+0 and Trample', v.attack === a0 + 2 && has(v, 'trample'), [a0, v.attack, v.keywords]); }

// ---- wurm overkill ----
{ const st = game(); const w = put(st, 0, 'rhonas_wurm'); const chump = put(st, 1, '_small'); const a0 = w.attack;
  E.attack(st, 0, w.uid, { type: 'creature', uid: chump.uid, player: 1 }); E.sweepDeaths(st);
  ok('Wurm Overkill: +2/+2 after crushing a small creature', w.attack === a0 + 2, [a0, w.attack]); }

// ---- hydra: +2/+2 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'rhonas_hydra', null);
  ok('Hydra gives your creatures +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- champion: +2/+2 and Trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'champion_of_rhonas', { type: 'creature', uid: v.uid, player: 0 });
  ok('Champion gives a creature +2/+2 and Trample', v.attack === a0 + 2 && has(v, 'trample'), [a0, v.attack]); }

// ---- devotee: ramp ----
{ const st = game(); const b0 = st.players[0].mana.bonus;
  play(st, 0, 'devotee_of_rhonas', null);
  ok('Devotee gains 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- benefaction: draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'benefaction_of_rhonas', null);
  ok('Benefaction draws 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- last stand: two Beasts ----
{ const st = game(); const b0 = beasts(st, 0);
  play(st, 0, 'rhonas_last_stand', null);
  ok('Last Stand summons two 4/4 Beasts with Trample', beasts(st, 0) === b0 + 2 && st.players[0].board.some(c => c.name === 'Beast' && c.attack === 4), [b0, beasts(st, 0)]); }

// ---- strength: counters ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'strength_of_rhonas', { type: 'creature', uid: v.uid, player: 0 });
  ok('Strength puts three +1/+1 counters on a creature', v.attack === a0 + 3, [a0, v.attack]); }

// ---- menagerie location: tap for a Beast + life ----
{ const st = game(); play(st, 0, 'rhonas_menagerie', null); const loc = st.players[0].board.find(c => c.id === 'rhonas_menagerie');
  const b0 = beasts(st, 0); const life0 = st.players[0].life;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Menagerie taps for a 4/4 Beast and 2 life', beasts(st, 0) === b0 + 1 && st.players[0].life === life0 + 2, [b0, beasts(st, 0), life0, st.players[0].life]); }

// ---- trial: fight + draw ----
{ const st = game(); const fr = put(st, 0, '_wall'); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'trial_of_rhonas', { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid });
  ok('Trial makes a friendly fight an enemy and draws', fr.damage === 3 && foe.damage === 3 && st.players[0].hand.length === h0 + 1, [fr.damage, foe.damage, h0, st.players[0].hand.length]); }

// ---- hour of glory: destroy ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'rhonas_hour_of_glory', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Hour of Glory destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- command enchantment: escalating anthem ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'rhonas_command', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Command gives your creatures +1/+1 at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- charm weapon: deathtouch + rally ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'rhonas_charm', null); const a0 = v.attack;
  ok('Charm equips a Deathtouch weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('deathtouch'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Charm gives your creatures +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
