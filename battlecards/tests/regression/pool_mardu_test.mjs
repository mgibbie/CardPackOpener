// pool_mardu_test.mjs — Mardu land pool (BRW / Tarkir wedge, 30 cards: Warrior go-wide + dash/haste + raid + burn + anthems).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const warriors = (st, pi) => st.players[pi].board.filter(c => c.name === 'Warrior').length;

const pool = raw.cards.filter(c => c.landSet === 'Mardu');
// ---- rubric ----
ok('Mardu pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BRW (order B,R,W)', pool.every(c => JSON.stringify(c.colors) === '["B","R","W"]'));
ok('all names contain Mardu + uncollectible', pool.every(c => /mardu/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(89), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['mardu_charm', 'mardu_crackling_doom', 'mardu_heart_piercer'].includes(c.id);
  const frTgt = c.id === 'mardu_runemark';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Alesha: dash anthem (+1/+0 and Rush) ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'mardu_alesha', null);
  ok('Alesha gives your creatures +1/+0 and Rush', v.attack === a0 + 1 && has(v, 'rush'), [a0, v.attack, v.keywords]); }

// ---- Hordechief: two Warriors ----
{ const st = game(); const w0 = warriors(st, 0);
  play(st, 0, 'mardu_hordechief', null);
  ok('Hordechief summons two 2/1 Rush Warriors', warriors(st, 0) === w0 + 2 && st.players[0].board.some(c => c.name === 'Warrior' && has(c, 'rush')), [w0, warriors(st, 0)]); }

// ---- Ponyback: three Warriors ----
{ const st = game(); const w0 = warriors(st, 0);
  play(st, 0, 'mardu_ponyback_brigade', null);
  ok('Ponyback summons three Warriors', warriors(st, 0) === w0 + 3, [w0, warriors(st, 0)]); }

// ---- ascendancy enchantment: go-wide war-drum ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'mardu_ascendancy', null); const a0 = v.attack;
  play(st, 0, '_v', null); // a creature enters -> +1/+0
  ok('Ascendancy gives +1/+0 when a creature enters', v.attack >= a0 + 1, [a0, v.attack]); }

// ---- monument artifact: tap for a Warrior ----
{ const st = game(); play(st, 0, 'mardu_monument', null); const w0 = warriors(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'mardu_monument').uid, null);
  ok('Monument taps for a 2/1 Rush Warrior', warriors(st, 0) === w0 + 1, [w0, warriors(st, 0)]); }

// ---- command location: tap for a Warrior ----
{ const st = game(); play(st, 0, 'mardu_command', null); const loc = st.players[0].board.find(c => c.id === 'mardu_command'); const w0 = warriors(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Command taps for a 2/1 Rush Warrior', warriors(st, 0) === w0 + 1, [w0, warriors(st, 0)]); }

// ---- crackling doom: destroy + reach ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = st.players[1].life;
  play(st, 0, 'mardu_crackling_doom', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Crackling Doom destroys and deals 2 to each opponent', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].life === life0 - 2, [st.players[1].board.length, life0, st.players[1].life]); }

// ---- charm: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'mardu_charm', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Charm deals 4 to a creature', foe.damage === 4, foe.damage); }

// ---- NEW Wingmate Roc: token flier ----
{ const st = game(); const b0 = st.players[0].board.length;
  play(st, 0, 'mardu_wingmate_roc', null);
  ok('Wingmate Roc summons a 3/4 Elusive Roc', st.players[0].board.some(c => c.name === 'Roc' && has(c, 'elusive')), st.players[0].board.map(c => c.name)); }

// ---- NEW Chief of the Edge: anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'mardu_chief_of_the_edge', null);
  ok('Chief of the Edge gives your creatures +1/+0', v.attack === a0 + 1, [a0, v.attack]); }

// ---- NEW Herald of Anafenza: a Warrior ----
{ const st = game(); const w0 = warriors(st, 0);
  play(st, 0, 'mardu_herald_of_anafenza', null);
  ok('Herald of Anafenza summons a 1/1 Rush Warrior', warriors(st, 0) === w0 + 1, [w0, warriors(st, 0)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
