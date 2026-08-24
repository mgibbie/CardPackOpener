// pool_hazoret_test.mjs — Hazoret land pool (R devotion: aggressive haste + burn + weapons + go-wide).
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
const warriors = (st, pi) => st.players[pi].board.filter(c => c.name === 'Warrior').length;

const pool = raw.cards.filter(c => c.landSet === 'Hazoret');
// ---- rubric ----
ok('Hazoret pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Red', pool.every(c => (c.colors || []).join('') === 'R'));

function game() {
  const st = E.createGame(byId, seededRng(70), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = ['hazorets_favor', 'hazorets_cartouche', 'hazorets_zeal'].includes(c.id);
  const foeCreat = c.id === 'hymn_of_hazoret';
  const foeHero = c.id === 'hazoret_the_fervent';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeCreat ? { type: 'creature', uid: foe.uid, player: 1 } : foeHero ? { type: 'hero', player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry burn + turn-start zeal ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'hazoret_the_fervent', { type: 'hero', player: 1 });
  ok('Hazoret battlecry deals 3 to the opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Hazoret turn-start deals 2 more to the opponent', st.players[1].life === life0 - 5, [life0, st.players[1].life]); }

// ---- hymn: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'hymn_of_hazoret', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Hymn deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- favor: +2/+2 and Charge ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'hazorets_favor', { type: 'creature', uid: v.uid, player: 0 });
  ok('Favor gives +2/+2 and Charge', v.attack === a0 + 2 && has(v, 'charge'), [a0, v.attack]); }

// ---- undying fury: three Warriors ----
{ const st = game(); const w0 = warriors(st, 0);
  play(st, 0, 'hazorets_undying_fury', null);
  ok('Undying Fury summons three 2/2 Warriors with Rush', warriors(st, 0) === w0 + 3 && st.players[0].board.some(c => c.name === 'Warrior' && has(c, 'rush')), [w0, warriors(st, 0)]); }

// ---- cartouche: +1/+1 and Rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'hazorets_cartouche', { type: 'creature', uid: v.uid, player: 0 });
  ok('Cartouche gives +1/+1 and Rush', v.attack === a0 + 1 && has(v, 'rush'), [a0, v.attack]); }

// ---- zeal: +2/+1 and Charge ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'hazorets_zeal', { type: 'creature', uid: v.uid, player: 0 });
  ok('Zeal gives +2/+1 and Charge', v.attack === a0 + 2 && has(v, 'charge'), [a0, v.attack]); }

// ---- protection enchantment: Rush on played creatures ----
{ const st = game(); play(st, 0, 'hazorets_protection', null);
  const { c } = play(st, 0, '_v', null);
  ok('Protection gives a freshly played creature Rush', has(c, 'rush'), c.keywords); }

// ---- armory location: tap for a Warrior ----
{ const st = game(); play(st, 0, 'hazorets_armory', null); const loc = st.players[0].board.find(c => c.id === 'hazorets_armory'); const w0 = warriors(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Armory taps for a 2/2 Warrior with Rush', warriors(st, 0) === w0 + 1, [w0, warriors(st, 0)]); }

// ---- flameblade weapon: burn on hero attack ----
{ const st = game(); play(st, 0, 'hazorets_flameblade', null); const life0 = st.players[1].life;
  ok('Flameblade equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Flameblade deals 1 to the opponent after the hero attacks', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- spear weapon: rally on hero attack ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'spear_of_hazoret', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Spear gives your creatures +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
