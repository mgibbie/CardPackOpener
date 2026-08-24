// pool_savai_test.mjs — Savai land pool (RWB / Mardu tri-color: aggressive Cats + aristocrat drain + haste + lifedrain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const cats = (st, pi) => st.players[pi].board.filter(c => c.name === 'Cat').length;

const pool = raw.cards.filter(c => c.landSet === 'Savai');
// ---- rubric ----
ok('Savai pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RWB (order W,B,R)', pool.every(c => JSON.stringify(c.colors) === '["W","B","R"]'));

function game() {
  const st = E.createGame(byId, seededRng(84), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['savai_charm', 'savai_mythos'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Snapdax: alpha strike (+2/+0 and Rush) ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'snapdax_savai_apex_hunter', null);
  ok('Snapdax gives your creatures +2/+0 and Rush', v.attack === a0 + 2 && has(v, 'rush'), [a0, v.attack, v.keywords]); }

// ---- Egg: hatches a Cat on death ----
{ const st = game(); const egg = put(st, 0, 'savai_egg'); const c0 = cats(st, 0);
  kill(st, egg);
  const cat = st.players[0].board.find(c => c.name === 'Cat');
  ok('Egg hatches a 3/2 Rush Cat when it dies', cats(st, 0) === c0 + 1 && cat && cat.attack === 3 && has(cat, 'rush'), [c0, cats(st, 0)]); }

// ---- bonder enchantment: aristocrat drain ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'savai_bonder', null);
  const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  kill(st, fodder);
  ok('Bonder drains 1 when a friendly dies', st.players[1].life === foeLife0 - 1 && st.players[0].life === myLife0 + 1, [foeLife0, st.players[1].life, myLife0, st.players[0].life]); }

// ---- command location: tap for a Rush Cat ----
{ const st = game(); play(st, 0, 'savai_command', null); const loc = st.players[0].board.find(c => c.id === 'savai_command'); const c0 = cats(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const cat = st.players[0].board.find(c => c.name === 'Cat');
  ok('Command taps for a 3/2 Rush Cat', cats(st, 0) === c0 + 1 && cat && has(cat, 'rush'), [c0, cats(st, 0)]); }

// ---- crystal artifact: tap ramp + scry ----
{ const st = game(); play(st, 0, 'savai_crystal', null); const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'savai_crystal').uid, null);
  ok('Crystal taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- charm: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'savai_charm', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Charm deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- mythos: removal + drain ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = st.players[0].life;
  play(st, 0, 'savai_mythos', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Mythos deals 3 and gains 2 life', foe.damage === 3 && st.players[0].life === life0 + 2, [foe.damage, life0, st.players[0].life]); }

// ---- thundermane: rush lifelinker ----
{ const st = game();
  const { c } = play(st, 0, 'savai_thundermane', null);
  ok('Thundermane has Rush and Lifesteal', has(c, 'rush') && has(c, 'lifesteal'), c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
