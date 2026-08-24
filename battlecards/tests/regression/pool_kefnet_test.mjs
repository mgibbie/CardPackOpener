// pool_kefnet_test.mjs — Kefnet land pool (U devotion: card advantage + draw-matters flyers + tempo control).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._bolt = { id: '_bolt', name: 'B', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Kefnet');
// ---- rubric ----
ok('Kefnet pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/secret', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'secret'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Blue', pool.every(c => (c.colors || []).join('') === 'U'));

function game() {
  const st = E.createGame(byId, seededRng(67), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const frTgt = c.id === 'cartouche_of_knowledge';
  const foeTgt = ['kefnets_last_word', 'kefnets_charm', 'kefnets_boltbend'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: draw 2 + draw-matters growth ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'god_eternal_kefnet', null);
  ok('Kefnet battlecry draws 2', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
  const k = st.players[0].board.find(c => c.id === 'god_eternal_kefnet'); const a0 = k.attack;
  E.execEffects(st, 0, [{ type: 'draw', value: 1 }], null, null);
  ok('Kefnet gains +1/+0 when you draw', k.attack === a0 + 1, [a0, k.attack]); }

// ---- last word: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'kefnets_last_word', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Last Word bounces an enemy and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

// ---- cartouche: +1/+1 Elusive + draw ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'cartouche_of_knowledge', { type: 'creature', uid: v.uid, player: 0 });
  ok('Cartouche gives +1/+1 and Elusive and draws', v.attack === a0 + 1 && has(v, 'elusive') && st.players[0].hand.length === h0 + 1, [a0, v.attack, v.keywords]); }

// ---- charm: draw + bounce ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'kefnets_charm', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Charm draws and bounces an enemy', st.players[0].hand.length === h0 + 1 && !st.players[1].board.some(c => c.uid === foe.uid), [h0, st.players[0].hand.length, st.players[1].board.length]); }

// ---- flood enchantment: freeze the board each turn ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v'); play(st, 0, 'kefnets_flood', null);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Flood freezes all enemy creatures at turn start', !!a.frozen && !!b.frozen, [a.frozen, b.frozen]); }

// ---- boltbend: freeze + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'kefnets_boltbend', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Boltbend freezes an enemy and draws', !!foe.frozen && st.players[0].hand.length === h0 + 1, [foe.frozen, h0, st.players[0].hand.length]); }

// ---- puzzlebox artifact: tap to scry + draw ----
{ const st = game(); play(st, 0, 'kefnets_puzzlebox', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'kefnets_puzzlebox').uid, null);
  ok('Puzzlebox taps to draw a card (after Scry 1)', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- cluestone location: tap to draw ----
{ const st = game(); play(st, 0, 'cluestone_of_kefnet', null); const loc = st.players[0].board.find(c => c.id === 'cluestone_of_kefnet'); const h0 = st.players[0].hand.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- rebuke secret: counter + draw ----
{ const st = game(); play(st, 0, 'kefnets_rebuke', null);
  ok('Rebuke installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Rebuke counters the enemy spell and draws', st.players[0].life === life0 && st.players[0].hand.length === h0 + 1, [life0, st.players[0].life, h0, st.players[0].hand.length]); }

// ---- epiphany: big draw ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'kefnets_epiphany', null);
  ok('Epiphany draws 3 cards', st.players[0].hand.length === h0 + 3, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
