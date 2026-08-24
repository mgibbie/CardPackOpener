// pool_silumgar_test.mjs — Silumgar land pool (UB / Tarkir dragon brood: elusive Dragons + steal/control + deathtouch + exploit + discard).
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
const undead = (st, pi) => st.players[pi].board.filter(c => c.name === 'Undead').length;

const pool = raw.cards.filter(c => c.landSet === 'Silumgar');
// ---- rubric ----
ok('Silumgar pool has 15 cards', pool.length === 15, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UB', pool.every(c => JSON.stringify(c.colors) === '["U","B"]'));
ok('all names contain Silumgar', pool.every(c => /silumgar/i.test(c.name)));

function game() {
  const st = E.createGame(byId, seededRng(95), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_v'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['dragonlord_silumgar', 'silumgar_sorcerer', 'silumgar_command', 'silumgar_scorn'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Dragonlord Silumgar: steal a small enemy ----
{ const st = game(); const foe = put(st, 1, '_v'); const own0 = st.players[0].board.length;
  play(st, 0, 'dragonlord_silumgar', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Dragonlord Silumgar steals a <=4 Attack enemy creature', st.players[0].board.some(c => c.uid === foe.uid) && !st.players[1].board.some(c => c.uid === foe.uid), [st.players[0].board.map(c => c.name)]); }

// ---- scalelord: board freeze ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'silumgar_scalelord', null);
  ok('Scalelord freezes all enemy creatures', !!a.frozen && !!b.frozen, [a.frozen, b.frozen]); }

// ---- sorcerer: freeze one ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'silumgar_sorcerer', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Sorcerer freezes an enemy', !!foe.frozen, foe.frozen); }

// ---- monument artifact: tap for an Undead ----
{ const st = game(); play(st, 0, 'silumgar_monument', null); const u0 = undead(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'silumgar_monument').uid, null);
  const u = st.players[0].board.find(c => c.name === 'Undead');
  ok('Monument taps for a deathtouch Undead', undead(st, 0) === u0 + 1 && u && has(u, 'deathtouch'), [u0, undead(st, 0)]); }

// ---- scavenger location: tap enemy discard ----
{ const st = game(); hand(st, 1, 3); play(st, 0, 'silumgar_scavenger', null); const loc = st.players[0].board.find(c => c.id === 'silumgar_scavenger'); const h1 = st.players[1].hand.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Scavenger taps: each opponent discards a card', st.players[1].hand.length === h1 - 1, [h1, st.players[1].hand.length]); }

// ---- spell-eater enchantment: exploit discard ----
{ const st = game(); const fodder = put(st, 0, '_v'); hand(st, 1, 3); play(st, 0, 'silumgar_spell_eater', null); const h1 = st.players[1].hand.length;
  kill(st, fodder);
  ok('Spell-Eater: opponent discards when a friendly dies', st.players[1].hand.length === h1 - 1, [h1, st.players[1].hand.length]); }

// ---- scorn instant: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length; const fh0 = st.players[1].hand.length;
  play(st, 0, 'silumgar_scorn', { type: 'creature', uid: foe.uid, player: 1 });
  ok("Silumgar's Scorn bounces a creature and draws", !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === fh0 + 1 && st.players[0].hand.length === h0 + 1, [st.players[1].board.length]); }

// ---- pact sorcery: discard 2 ----
{ const st = game(); hand(st, 1, 4); const h1 = st.players[1].hand.length;
  play(st, 0, 'silumgar_pact', null);
  ok("Silumgar's Pact: opponent discards 2", st.players[1].hand.length === h1 - 2, [h1, st.players[1].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
