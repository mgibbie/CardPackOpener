// pool_prismari_test.mjs — Prismari land pool (UR devotion: magecraft + ramp + Elementals + burn).
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
const elems = (st, pi) => st.players[pi].board.filter(c => c.name === 'Elemental').length;

const pool = raw.cards.filter(c => c.landSet === 'Prismari');
// ---- rubric ----
ok('Prismari pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/artifact/location/enchantment', types.size >= 6 && ['instant', 'artifact', 'location', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays UR', pool.every(c => (c.colors || []).slice().sort().join('') === 'RU'));

function game() {
  const st = E.createGame(byId, seededRng(72), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 0, 2); let threw = null;
  const foeCreat = ['prismari_star_student', 'prismari_command', 'prismari_charm'].includes(c.id);
  const anyTgt = ['galazeth_prismari', 'prismari_pledgemage'].includes(c.id);
  const tgt = foeCreat ? { type: 'creature', uid: foe.uid, player: 1 } : anyTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Galazeth: burn battlecry + spell ramp ----
{ const st = game(); const foe = put(st, 1, '_wall'); const life0 = foe.maxHealth;
  play(st, 0, 'galazeth_prismari', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Galazeth battlecry deals 3', foe.damage === 3, foe.damage);
  const avail0 = st.players[0].mana.cur + st.players[0].mana.bonus;
  cast(st, 0, '_cantrip');
  ok('Galazeth ramps 1 mana when you cast a spell', st.players[0].mana.cur + st.players[0].mana.bonus === avail0 + 1, [avail0, st.players[0].mana.bonus]); }

// ---- star student: burn body, First Strike ----
{ const st = game(); const foe = put(st, 1, '_wall');
  const { c } = play(st, 0, 'prismari_star_student', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Star Student deals 2 and has First Strike', foe.damage === 2 && has(c, 'first_strike'), [foe.damage, c.keywords]); }

// ---- keyrune: Elemental token ----
{ const st = game(); const e0 = elems(st, 0);
  play(st, 0, 'prismari_keyrune', null);
  ok('Keyrune summons a 3/2 Elusive Elemental', elems(st, 0) === e0 + 1 && st.players[0].board.some(c => c.name === 'Elemental' && has(c, 'elusive')), [e0, elems(st, 0)]); }

// ---- summoning location: tap for an Elemental ----
{ const st = game(); play(st, 0, 'prismari_summoning', null); const loc = st.players[0].board.find(c => c.id === 'prismari_summoning'); const e0 = elems(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Summoning taps for a 3/3 Elemental', elems(st, 0) === e0 + 1, [e0, elems(st, 0)]); }

// ---- cluestone artifact: tap to draw ----
{ const st = game(); play(st, 0, 'prismari_cluestone', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'prismari_cluestone').uid, null);
  ok('Cluestone taps to draw', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- puzzlebox artifact: tap to scry + draw ----
{ const st = game(); play(st, 0, 'prismari_puzzlebox', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'prismari_puzzlebox').uid, null);
  ok('Puzzlebox taps to draw', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- expression enchantment: magecraft sweep ----
{ const st = game(); const foe = put(st, 1, '_wall'); play(st, 0, 'prismari_expression', null);
  cast(st, 0, '_cantrip');
  ok('Expression deals 1 to enemy creatures when you cast a spell', foe.damage === 1, foe.damage); }

// ---- inspiration: ramp + draw (bonus mana gained; the card's own cost is deducted from cur separately) ----
{ const st = game(); const bonus0 = st.players[0].mana.bonus; const h0 = st.players[0].hand.length;
  play(st, 0, 'prismari_inspiration', null);
  ok('Inspiration grants +2 bonus mana and draws', st.players[0].mana.bonus === bonus0 + 2 && st.players[0].hand.length === h0 + 1, [bonus0, st.players[0].mana.bonus, h0, st.players[0].hand.length]); }

// ---- iteration: draw 2 ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'prismari_iteration', null);
  ok('Iteration draws 2', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
