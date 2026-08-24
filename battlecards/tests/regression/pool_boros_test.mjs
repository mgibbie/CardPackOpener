// pool_boros_test.mjs — Boros land pool (RW go-wide Soldiers + mentor/battalion + First Strike + burn).
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
const soldiers = (st, pi) => st.players[pi].board.filter(c => c.name === 'Soldier').length;

const pool = raw.cards.filter(c => c.landSet === 'Boros');
// ---- rubric ----
ok('Boros pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/secret/enchantment/artifact', types.size >= 6 && ['instant', 'secret', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RW', pool.every(c => (c.colors || []).slice().sort().join('') === 'RW'));

function game() {
  const st = E.createGame(byId, seededRng(45), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const tgt = (c.id === 'boros_challenger') ? { type: 'creature', uid: fr.uid, player: 0 }
    : (c.id === 'boros_guildmage' || c.id === 'boros_charm') ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'boros_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Razia: go-wide +2/+2 and First Strike ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'razia_boros_archangel', null);
  ok('Razia gives your creatures +2/+2 and First Strike', v.attack === a0 + 2 && has(v, 'first_strike'), [a0, v.attack, v.keywords]); }

// ---- Battleshaper: mentor pumps the team on attack ----
{ const st = game(); const bs = put(st, 0, 'boros_battleshaper'); const ally = put(st, 0, '_v'); const a0 = ally.attack;
  E.attack(st, 0, bs.uid, { type: 'hero', player: 1 });
  ok('Battleshaper gives your creatures +1/+1 when it attacks', ally.attack === a0 + 1 && E.hp(ally) === 3, [a0, ally.attack]); }

// ---- challenger: +2/+2 ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'boros_challenger', { type: 'creature', uid: v.uid, player: 0 });
  ok('Challenger gives a creature +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- guildmage: burn a creature ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'boros_guildmage', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Guildmage deals 2 to a creature', foe.damage === 2, foe.damage); }

// ---- charm modal: face burn (mode 1) ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'boros_charm', null, 1);
  ok('Charm (face mode) deals 4 to the opponent', st.players[1].life === life0 - 4, [life0, st.players[1].life]); }

// ---- charm modal: Divine Shield the team (mode 2) ----
{ const st = game(); const v = put(st, 0, '_v');
  play(st, 0, 'boros_charm', null, 2);
  ok('Charm (shield mode) gives your creatures Divine Shield', has(v, 'divine_shield') || v.shield, [v.keywords, v.shield]); }

// ---- fury shield secret: destroy an attacker ----
{ const st = game(); play(st, 0, 'boros_fury_shield', null);
  ok('Fury-Shield installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const foe = put(st, 1, '_wall'); foe.sick = false; st.current = 1;
  E.attack(st, 1, foe.uid, { type: 'hero', player: 0 }); E.sweepDeaths(st);
  ok('Fury-Shield destroys the attacking enemy', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- garrison enchantment: a Soldier each turn ----
{ const st = game(); play(st, 0, 'boros_garrison', null); const s0 = soldiers(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Garrison summons a Soldier at turn start', soldiers(st, 0) === s0 + 1, [s0, soldiers(st, 0)]); }

// ---- keyrune: a 3/1 Rush Soldier ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'boros_keyrune', null);
  ok('Keyrune summons a 3/1 Soldier with Rush', st.players[0].board.some(c => c.name === 'Soldier' && c.attack === 3 && has(c, 'rush')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- signet artifact: tap for mana ----
{ const st = game(); play(st, 0, 'boros_signet', null); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'boros_signet').uid, null);
  ok('Signet taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'boros_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'boros_cluestone').uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
