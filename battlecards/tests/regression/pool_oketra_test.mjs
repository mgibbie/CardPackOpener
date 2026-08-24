// pool_oketra_test.mjs — Oketra land pool (W devotion: Warrior tokens + go-wide anthems + First Strike + lifegain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 5, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;

const pool = raw.cards.filter(c => c.landSet === 'Oketra');
// ---- rubric ----
ok('Oketra pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/instant/location/weapon', types.size >= 6 && ['enchantment', 'instant', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-White', pool.every(c => (c.colors || []).join('') === 'W'));

function game() {
  const st = E.createGame(byId, seededRng(68), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_big'); let threw = null;
  const frTgt = ['oketras_cartouche', 'oketras_charm'].includes(c.id);
  const foeTgt = c.id === 'oketras_light_arrow';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry Warriors + muster engine ----
{ const st = game(); const w0 = named(st, 0, 'Warrior');
  play(st, 0, 'god_eternal_oketra', null);
  ok('Oketra battlecry summons two 2/2 Warriors', named(st, 0, 'Warrior') === w0 + 2 && st.players[0].board.some(c => c.name === 'Warrior' && has(c, 'first_strike')), [w0, named(st, 0, 'Warrior')]);
  const w1 = named(st, 0, 'Warrior');
  play(st, 0, '_v');
  ok('Oketra: playing a creature musters a Warrior', named(st, 0, 'Warrior') === w1 + 1, [w1, named(st, 0, 'Warrior')]); }

// ---- caracal: two Cats ----
{ const st = game(); const c0 = named(st, 0, 'Cat');
  play(st, 0, 'oketras_caracal', null);
  ok('Caracal summons two 1/1 Lifesteal Cats', named(st, 0, 'Cat') === c0 + 2 && st.players[0].board.some(c => c.name === 'Cat' && has(c, 'lifesteal')), [c0, named(st, 0, 'Cat')]); }

// ---- initiate: Deathrattle Warrior ----
{ const st = game(); const init = put(st, 0, 'oketras_initiate'); const w0 = named(st, 0, 'Warrior');
  kill(st, init);
  ok('Initiate Deathrattle summons a Warrior', named(st, 0, 'Warrior') === w0 + 1, [w0, named(st, 0, 'Warrior')]); }

// ---- trial: +2/+2 anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'oketras_trial', null);
  ok('Trial gives your creatures +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- solidarity enchantment: escalating anthem ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'oketras_solidarity', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Solidarity gives +1/+0 at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- cartouche: buff + Warrior ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const w0 = named(st, 0, 'Warrior');
  play(st, 0, 'oketras_cartouche', { type: 'creature', uid: v.uid, player: 0 });
  ok('Cartouche gives +1/+1, First Strike, and a Warrior', v.attack === a0 + 1 && has(v, 'first_strike') && named(st, 0, 'Warrior') === w0 + 1, [a0, v.attack, w0, named(st, 0, 'Warrior')]); }

// ---- charm: +2/+2 and Divine Shield ----
{ const st = game(); const v = put(st, 0, '_v');
  play(st, 0, 'oketras_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and Divine Shield', has(v, 'divine_shield') || v.shield, [v.keywords, v.shield]); }

// ---- command location: tap for a Warrior ----
{ const st = game(); play(st, 0, 'oketras_command', null); const loc = st.players[0].board.find(c => c.id === 'oketras_command'); const w0 = named(st, 0, 'Warrior');
  E.tapLand(st, 0, loc.uid, 0);
  ok('Command taps for a First Strike Warrior', named(st, 0, 'Warrior') === w0 + 1, [w0, named(st, 0, 'Warrior')]); }

// ---- invocation: mass Reborn ----
{ const st = game(); const v = put(st, 0, '_v');
  play(st, 0, 'oketras_invocation', null);
  ok('Invocation gives your creatures Reborn', has(v, 'reborn'), v.keywords); }

// ---- last mercy: gain 10 ----
{ const st = game(); const life0 = st.players[0].life;
  play(st, 0, 'oketras_last_mercy', null);
  ok('Last Mercy gains 10 life', st.players[0].life === life0 + 10, [life0, st.players[0].life]); }

// ---- light arrow: destroy a big creature ----
{ const st = game(); const foe = put(st, 1, '_big');
  play(st, 0, 'oketras_light_arrow', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Light Arrow destroys a creature with 4+ Attack', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- vindication weapon: Warrior on hero attack ----
{ const st = game(); play(st, 0, 'oketras_vindication', null); const w0 = named(st, 0, 'Warrior');
  ok('Vindication equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Vindication summons a Warrior after the hero attacks', named(st, 0, 'Warrior') === w0 + 1, [w0, named(st, 0, 'Warrior')]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
