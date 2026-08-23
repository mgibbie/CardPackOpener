// pool_azorius_test.mjs — Azorius land pool (WU control: detain/freeze + flyers + card advantage + tempo bounce).
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

const pool = raw.cards.filter(c => c.landSet === 'Azorius');
// ---- rubric ----
ok('Azorius pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl secret/instant/artifact/enchantment', types.size >= 6 && ['secret', 'instant', 'artifact', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WU', pool.every(c => (c.colors || []).slice().sort().join('') === 'UW'));

function game() {
  const st = E.createGame(byId, seededRng(40), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const castAs = (st, pi, id, tgt) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, tgt ?? null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const foeTgt = ['azorius_arrester', 'lavinia_azorius_renegade', 'azorius_arbiter'].includes(c.id);
  const anyTgt = c.id === 'azorius_charm';
  const tgt = (foeTgt || anyTgt) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'azorius_charm' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Isperia: draw 2 + freeze the enemy board ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'isperia_azorius_sphinx', null);
  ok('Isperia draws 2 and freezes all enemy creatures', st.players[0].hand.length === h0 + 2 && !!foe.frozen, [h0, st.players[0].hand.length, foe.frozen]);
  const sph = st.players[0].board.find(c => c.id === 'isperia_azorius_sphinx');
  ok('Isperia is an Elusive Windfury flyer', has(sph, 'elusive') && has(sph, 'windfury')); }

// ---- Lavinia: bounce an enemy ----
{ const st = game(); const foe = put(st, 1, '_v'); const eh0 = st.players[1].hand.length;
  play(st, 0, 'lavinia_azorius_renegade', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Lavinia bounces an enemy creature to hand', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === eh0 + 1, [st.players[1].board.length, st.players[1].hand.length]); }

// ---- arrester: detain (freeze) a creature ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'azorius_arrester', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Arrester freezes an enemy creature', !!foe.frozen, foe.frozen); }

// ---- justiciar: freeze the board ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_v');
  play(st, 0, 'azorius_justiciar', null);
  ok('Justiciar freezes all enemy creatures', !!a.frozen && !!b.frozen, [a.frozen, b.frozen]); }

// ---- ploy secret: counter + draw ----
{ const st = game(); play(st, 0, 'azorius_ploy', null);
  ok('Ploy installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  castAs(st, 1, '_bolt', { type: 'hero', player: 0 });
  ok('Ploy counters the enemy spell (no damage)', st.players[0].life === life0, [life0, st.players[0].life]);
  ok('Ploy draws you a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- charm modal: draw + gain 3 (mode 1) ----
{ const st = game(); const h0 = st.players[0].hand.length; const life0 = st.players[0].life;
  play(st, 0, 'azorius_charm', null, 1);
  ok('Charm (value mode) draws a card and gains 3 life', st.players[0].hand.length === h0 + 1 && st.players[0].life === life0 + 3, [h0, st.players[0].hand.length, life0, st.players[0].life]); }

// ---- signet artifact: tap for mana (gain-mana adds to mana.bonus) ----
{ const st = game(); play(st, 0, 'azorius_signet', null);
  const art = st.players[0].artifacts.find(a => a.id === 'azorius_signet'); const b0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, art.uid, null);
  ok('Signet taps for 2 Mana this turn', st.players[0].mana.bonus === b0 + 2, [b0, st.players[0].mana.bonus]); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'azorius_cluestone', null); const h0 = st.players[0].hand.length;
  const art = st.players[0].artifacts.find(a => a.id === 'azorius_cluestone');
  E.tapArtifact(st, 0, art.uid, null);
  ok('Cluestone taps to draw a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- locket enchantment installs (spell -> Scry engine) ----
{ const st = game(); play(st, 0, 'azorius_locket', null);
  ok('Locket installs as an enchantment', st.players[0].enchantments.some(e => e.id === 'azorius_locket'));
  let threw = null; try { play(st, 0, 'azorius_keyrune', null); } catch (e) { threw = e; }
  ok('casting a spell with Locket out does not throw', !threw, threw && threw.message); }

// ---- keyrune: a 2/2 Elusive Elemental ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'azorius_keyrune', null);
  ok('Keyrune summons a 2/2 Elusive Elemental', st.players[0].board.some(c => c.name === 'Elemental' && c.attack === 2 && has(c, 'elusive')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name)); }

// ---- arbiter: bounce + draw 2 ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'azorius_arbiter', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Arbiter bounces an enemy and draws 2', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 2, [st.players[1].board.length, h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
