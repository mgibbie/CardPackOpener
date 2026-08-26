// pool_thassa_test.mjs — Thassa land pool (U devotion: card advantage/scry + tempo bounce/freeze + Elusive + sea creatures).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) if (c.landSet === 'Thassa' || !byId[c.id]) byId[c.id] = c; // prefer Thassa cards on id collision
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Thassa');
// ---- rubric ----
ok('Thassa pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/artifact/instant/secret', types.size >= 6 && ['enchantment', 'artifact', 'instant', 'secret'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Blue', pool.every(c => (c.colors || []).join('') === 'U'));

function game() {
  const st = E.createGame(byId, seededRng(52), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const frTgt = c.id === 'ordeal_of_thassa';
  const foeTgt = ['thassas_devourer', 'thassas_rebuff'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: scry + draw + turn-start scry ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'thassa_god_of_the_sea', null);
  E.resolveScry(st, []); ok('Thassa draws a card on entry (after the Scry resolves)', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
  let threw = null; try { E.fireOngoing(st, 0, 'turn-start'); } catch (e) { threw = e; }
  ok('Thassa turn-start Scry does not throw', !threw, threw && threw.message); }

// ---- devourer: bounce + draw ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'thassas_devourer', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Devourer bounces an enemy and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }

// ---- leviathan: freeze the enemy board ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'thassas_leviathan', null);
  ok('Leviathan freezes all enemy creatures', !!a.frozen && !!b.frozen, [a.frozen, b.frozen]); }

// ---- bident enchantment: draw each turn ----
{ const st = game(); play(st, 0, 'bident_of_thassa', null); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Bident draws a card at turn start', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- bounty artifact: tap for mana ----
{ const st = game(); play(st, 0, 'thassas_bounty', null); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'thassas_bounty').uid, null);
  ok('Bounty taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- intervention: dig ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'thassas_intervention', null);
  E.resolveScry(st, []); ok('Intervention draws 2 (after Scry 2)', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- rebuff: bounce ----
{ const st = game(); const foe = put(st, 1, '_v'); const eh0 = st.players[1].hand.length;
  play(st, 0, 'thassas_rebuff', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Rebuff bounces an enemy creature to hand', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === eh0 + 1, [st.players[1].board.length, st.players[1].hand.length]); }

// ---- ordeal: +2/+2 and Elusive + draw ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'ordeal_of_thassa', { type: 'creature', uid: v.uid, player: 0 });
  ok('Ordeal gives +2/+2 and Elusive and draws', v.attack === a0 + 2 && has(v, 'elusive') && st.players[0].hand.length === h0 + 1, [a0, v.attack, v.keywords]); }

// ---- tidal wave secret: freeze an attacker ----
{ const st = game(); play(st, 0, 'thassas_tidal_wave', null);
  ok('Tidal Wave installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const foe = put(st, 1, '_v'); foe.sick = false; st.current = 1;
  E.attack(st, 1, foe.uid, { type: 'hero', player: 0 });
  ok('Tidal Wave freezes the attacking enemy', !!foe.frozen, foe.frozen); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
