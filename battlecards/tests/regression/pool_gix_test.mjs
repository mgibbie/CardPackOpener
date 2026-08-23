// pool_gix_test.mjs — Gix boss pool (B Phyrexian spymaster: Connect:draw aggression + card advantage + steal/discard).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Gix');
// ---- rubric ----
ok('Gix pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/instant/secret/enchantment', types.size >= 6 && ['weapon', 'instant', 'secret', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Black', pool.every(c => (c.colors || []).join('') === 'B'));
ok('the boss (sig) is a Phyrexian creature with Connect:draw', byId.gix_sig.type === 'creature' && byId.gix_sig.ongoing && byId.gix_sig.ongoing.on === 'self-hit-player');
ok('>=4 creatures carry Connect:draw', pool.filter(c => c.ongoing && c.ongoing.on === 'self-hit-player').length >= 4);

function game() {
  const st = E.createGame(byId, seededRng(31), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.deathLogIds = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const castAs = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, { type: 'hero', player: 0 }); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_v'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['gix_puppeteer', 'gix_reckoning'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'gix_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Connect: sig draws when it hits a player ----
{ const st = game(); const gix = put(st, 0, 'gix_sig'); const h0 = st.players[0].hand.length;
  E.attack(st, 0, gix.uid, { type: 'hero', player: 1 });
  ok('Gix Connect: dealing combat damage to a player draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- sig battlecry: draw 2 + opponent discards ----
{ const st = game(); hand(st, 1, 3); const h0 = st.players[0].hand.length;
  play(st, 0, 'gix_sig', null);
  ok('Gix battlecry draws 2', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
  ok('Gix battlecry: opponent discards 1', st.players[1].hand.length === 2, st.players[1].hand.length); }

// ---- nemesis Connect: draw + burn the player ----
{ const st = game(); const nem = put(st, 0, 'gix_nemesis'); const h0 = st.players[0].hand.length; const life0 = st.players[1].life;
  E.attack(st, 0, nem.uid, { type: 'hero', player: 1 });
  ok('Nemesis Connect: draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
  ok('Nemesis Connect: 5 combat + 1 = 6 to the opponent', st.players[1].life === life0 - 6, [life0, st.players[1].life]); }

// ---- puppeteer: mind-control a small enemy ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'gix_puppeteer', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Puppeteer steals an enemy creature (<=3 Attack)', st.players[0].board.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid)); }

// ---- vivisector: sac a friendly, draw 2 ----
{ const st = game(); put(st, 0, '_v'); const h0 = st.players[0].hand.length; const g0 = st.players[0].graveyard.length;
  play(st, 0, 'gix_vivisector', null);
  ok('Vivisector draws 2', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
  ok('Vivisector sacrifices a friendly creature', st.players[0].graveyard.length > g0, [g0, st.players[0].graveyard.length]); }

// ---- bloodletter: discard on attack ----
{ const st = game(); const bl = put(st, 0, 'gix_bloodletter'); hand(st, 1, 2);
  E.attack(st, 0, bl.uid, { type: 'hero', player: 1 });
  ok('Bloodletter: attacking makes the opponent discard', st.players[1].hand.length === 1, st.players[1].hand.length); }

// ---- recycler: Reborn + Deathrattle both fire on the first death ----
{ const st = game(); const rec = put(st, 0, 'gix_recycler'); const h0 = st.players[0].hand.length;
  rec.damage = rec.maxHealth; E.sweepDeaths(st);
  ok('Recycler Deathrattle draws a card on the first death', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
  ok('Recycler also Reborns (returns to the board)', st.players[0].board.some(c => c.id === 'gix_recycler'), st.players[0].board.map(c => c.id));
  const back = st.players[0].board.find(c => c.id === 'gix_recycler'); back.damage = back.maxHealth; E.sweepDeaths(st);
  ok('Recycler draws again on its final death', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- skullflayer weapon: draw when the hero attacks ----
{ const st = game(); play(st, 0, 'gix_skullflayer', null); const h0 = st.players[0].hand.length;
  ok('Skullflayer equips a Lifesteal weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('lifesteal'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Skullflayer draws a card after the hero attacks', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- caress instant: opponent discards 2, you draw ----
{ const st = game(); hand(st, 1, 3); const h0 = st.players[0].hand.length;
  play(st, 0, 'gix_caress', null);
  ok('Caress: opponent discards 2 and you draw 1', st.players[1].hand.length === 1 && st.players[0].hand.length === h0 + 1, [st.players[1].hand.length, h0, st.players[0].hand.length]); }

// ---- devotion enchantment: draw + burn each turn ----
{ const st = game(); play(st, 0, 'gix_devotion', null); const h0 = st.players[0].hand.length; const life0 = st.players[1].life;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Devotion: turn start draws and deals 1 to the opponent', st.players[0].hand.length === h0 + 1 && st.players[1].life === life0 - 1, [h0, st.players[0].hand.length, life0, st.players[1].life]); }

// ---- sacrifice: return your highest-Attack dead creature ----
{ const st = game(); const dead = put(st, 0, '_wall'); dead.damage = dead.maxHealth; E.sweepDeaths(st);
  const n0 = st.players[0].board.length;
  play(st, 0, 'gix_sacrifice', null);
  ok('Sacrifice resurrects a dead creature', st.players[0].board.length === n0 + 1, [n0, st.players[0].board.length]); }

// ---- painful quandary secret: punish the opponent's spell ----
{ const st = game(); play(st, 0, 'gix_painful_quandary', null);
  ok('Painful Quandary installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  hand(st, 1, 2); const life1 = st.players[1].life;
  castAs(st, 1, '_bolt');
  ok('Painful Quandary: opponent discards and takes 3', st.players[1].hand.length === 1 && st.players[1].life === life1 - 3, [st.players[1].hand.length, life1, st.players[1].life]); }

// ---- command modal: mind-control (mode 2) ----
{ const st = game(); const foe = put(st, 1, '_wall'); // 3 Attack
  play(st, 0, 'gix_command', { type: 'creature', uid: foe.uid, player: 1 }, 2);
  ok('Command (steal mode) takes an enemy creature (<=4 Attack)', st.players[0].board.some(c => c.uid === foe.uid)); }

// ---- reckoning: destroy + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'gix_reckoning', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Reckoning destroys a creature and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
