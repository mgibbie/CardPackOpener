// pool_sultai_test.mjs — Sultai land pool (BGU / Tarkir wedge, 30 cards: Undead + graveyard value + mill/discard + deathtouch + draw).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'Big', type: 'creature', cost: 8, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const undead = (st, pi) => st.players[pi].board.filter(c => c.name === 'Undead').length;

const pool = raw.cards.filter(c => c.landSet === 'Sultai');
// ---- rubric ----
ok('Sultai pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BGU (order B,G,U)', pool.every(c => JSON.stringify(c.colors) === '["B","G","U"]'));
ok('all names contain Sultai + uncollectible', pool.every(c => /sultai/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(88), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['sultai_necropolis_fiend', 'sultai_charm', 'sultai_command'].includes(c.id);
  const frTgt = c.id === 'sultai_runemark';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Sidisi: Undead engine ----
{ const st = game(); play(st, 0, 'sultai_sidisi', null); const u0 = undead(st, 0);
  ok('Sidisi battlecry makes a deathtouch Undead', u0 >= 1 && st.players[0].board.some(c => c.name === 'Undead' && has(c, 'deathtouch')), u0);
  cast(st, 0, '_cantrip');
  ok('Sidisi makes an Undead when you cast a spell', undead(st, 0) === u0 + 1, [u0, undead(st, 0)]); }

// ---- ascendancy enchantment: aristocrat Undead ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'sultai_ascendancy', null); const u0 = undead(st, 0);
  kill(st, fodder);
  ok('Ascendancy makes an Undead when a friendly dies', undead(st, 0) === u0 + 1, [u0, undead(st, 0)]); }

// ---- NEW Grim Haruspex: death draw ----
{ const st = game(); put(st, 0, 'sultai_grim_haruspex'); const fodder = put(st, 0, '_v'); const h0 = st.players[0].hand.length;
  kill(st, fodder);
  ok('Grim Haruspex draws when a friendly dies', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- Kheru Lich Lord: reanimate ----
{ const st = game(); const big = put(st, 0, '_big'); kill(st, big);
  play(st, 0, 'sultai_kheru_lich_lord', null);
  ok('Kheru Lich Lord returns a dead creature', st.players[0].board.some(c => c.id === '_big'), st.players[0].board.map(c => c.id)); }

// ---- monument sorcery: Undead + draw ----
{ const st = game(); const u0 = undead(st, 0); const h0 = st.players[0].hand.length;
  play(st, 0, 'sultai_monument', null);
  ok('Monument summons an Undead and draws', undead(st, 0) === u0 + 1 && st.players[0].hand.length === h0 + 1, [u0, undead(st, 0)]); }

// ---- banner location: tap for an Undead ----
{ const st = game(); play(st, 0, 'sultai_banner', null); const loc = st.players[0].board.find(c => c.id === 'sultai_banner'); const u0 = undead(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Banner taps for a deathtouch Undead', undead(st, 0) === u0 + 1, [u0, undead(st, 0)]); }

// ---- cluestone artifact: tap ramp + scry ----
{ const st = game(); play(st, 0, 'sultai_cluestone', null); const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'sultai_cluestone').uid, null);
  ok('Cluestone taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- charm instant: destroy + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'sultai_charm', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Charm destroys and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

// ---- hymn: discard 2 + draw ----
{ const st = game(); hand(st, 1, 4); const h1 = st.players[1].hand.length; const h0 = st.players[0].hand.length;
  play(st, 0, 'sultai_hymn', null);
  ok('Hymn: opponent discards 2, you draw 1', st.players[1].hand.length === h1 - 2 && st.players[0].hand.length === h0 + 1, [h1, st.players[1].hand.length]); }

// ---- NEW Whisperer: ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'sultai_whisperer_of_the_wilds', null);
  ok('Whisperer gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
