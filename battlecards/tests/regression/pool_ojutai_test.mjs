// pool_ojutai_test.mjs — Ojutai land pool (WU / Tarkir dragon brood: flying Dragons/Birds + freeze control + card draw + defensive walls).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const birds = (st, pi) => st.players[pi].board.filter(c => c.name === 'Bird').length;

const pool = raw.cards.filter(c => c.landSet === 'Ojutai');
// ---- rubric ----
ok('Ojutai pool has 15 cards', pool.length === 15, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays WU', pool.every(c => JSON.stringify(c.colors) === '["W","U"]'));
ok('all names contain Ojutai', pool.every(c => /ojutai/i.test(c.name)));

function game() {
  const st = E.createGame(byId, seededRng(94), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = c.id === 'ojutai_breath';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Dragonlord Ojutai: draw 2, evasive shield ----
{ const st = game(); const h0 = st.players[0].hand.length;
  const { c } = play(st, 0, 'dragonlord_ojutai', null);
  ok('Dragonlord Ojutai draws 2 and has Elusive+Divine Shield', st.players[0].hand.length === h0 + 2 && has(c, 'elusive') && has(c, 'divine_shield') && c.shield === true, [h0, st.players[0].hand.length]); }

// ---- soul of winter: board freeze ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'ojutai_soul_of_winter', null);
  ok('Soul of Winter freezes all enemy creatures', !!a.frozen && !!b.frozen, [a.frozen, b.frozen]); }

// ---- breath instant: freeze + draw ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'ojutai_breath', { type: 'creature', uid: foe.uid, player: 1 });
  ok("Ojutai's Breath freezes an enemy and draws", !!foe.frozen && st.players[0].hand.length === h0 + 1, [foe.frozen, h0, st.players[0].hand.length]); }

// ---- command sorcery: draw + life ----
{ const st = game(); const h0 = st.players[0].hand.length; const life0 = st.players[0].life;
  play(st, 0, 'ojutai_command', null);
  ok("Ojutai's Command draws 2 and gains 4", st.players[0].hand.length === h0 + 2 && st.players[0].life === life0 + 4, [h0, st.players[0].hand.length, life0, st.players[0].life]); }

// ---- monument artifact: tap for a Bird ----
{ const st = game(); play(st, 0, 'ojutai_monument', null); const b0 = birds(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'ojutai_monument').uid, null);
  const b = st.players[0].board.find(c => c.name === 'Bird');
  ok('Monument taps for a 2/2 Elusive Bird', birds(st, 0) === b0 + 1 && b && has(b, 'elusive'), [b0, birds(st, 0)]); }

// ---- summons location: tap for a 3/3 Bird ----
{ const st = game(); play(st, 0, 'ojutai_summons', null); const loc = st.players[0].board.find(c => c.id === 'ojutai_summons'); const b0 = birds(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const b = st.players[0].board.find(c => c.name === 'Bird');
  ok('Summons taps for a 3/3 Elusive Bird', birds(st, 0) === b0 + 1 && b && b.attack === 3, [b0, birds(st, 0)]); }

// ---- breezedancer enchantment: spell -> team +1/+0 ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'ojutai_breezedancer', null); const a0 = v.attack;
  cast(st, 0, '_cantrip');
  ok('Breezedancer gives your creatures +1/+0 on cast', v.attack === a0 + 1, [a0, v.attack]); }

// ---- taigam: scry + draw ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'taigam_ojutai_master', null);
  ok('Taigam draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
