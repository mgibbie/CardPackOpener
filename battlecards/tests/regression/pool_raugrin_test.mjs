// pool_raugrin_test.mjs — Raugrin land pool (URW / Jeskai tri-color: Dino aggro + prowess/spellslinging + burn + tempo).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 6, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const dinos = (st, pi) => st.players[pi].board.filter(c => c.name === 'Dinosaur').length;

const pool = raw.cards.filter(c => c.landSet === 'Raugrin');
// ---- rubric ----
ok('Raugrin pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays URW (order W,U,R)', pool.every(c => JSON.stringify(c.colors) === '["W","U","R"]'));

function game() {
  const st = E.createGame(byId, seededRng(83), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['vadrok_raugrin_apex', 'raugrin_baryonyx', 'raugrin_mythos'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Vadrok: burn battlecry + prowess anthem ----
{ const st = game(); const foe = put(st, 1, '_wall'); const v = put(st, 0, '_v');
  play(st, 0, 'vadrok_raugrin_apex', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Vadrok battlecry deals 3', foe.damage === 3, foe.damage);
  const a0 = v.attack;
  cast(st, 0, '_cantrip');
  ok('Vadrok pumps your creatures +1/+0 when you cast a spell', v.attack === a0 + 1, [a0, v.attack]); }

// ---- vantasaur enchantment: spellslinger ping ----
{ const st = game(); play(st, 0, 'raugrin_vantasaur', null); const life0 = st.players[1].life;
  cast(st, 0, '_cantrip');
  ok('Vantasaur deals 1 to each opponent when you cast a spell', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- baryonyx instant: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'raugrin_baryonyx', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Baryonyx deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- mythos sorcery: burn + card ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[0].hand.length;
  play(st, 0, 'raugrin_mythos', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Mythos deals 3 and draws', foe.damage === 3 && st.players[0].hand.length === h0 + 1, [foe.damage, h0, st.players[0].hand.length]); }

// ---- crystal artifact: tap ramp + scry ----
{ const st = game(); play(st, 0, 'raugrin_crystal', null); const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'raugrin_crystal').uid, null);
  ok('Crystal taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- dinomancer location: tap for a Dino ----
{ const st = game(); play(st, 0, 'raugrin_dinomancer', null); const loc = st.players[0].board.find(c => c.id === 'raugrin_dinomancer'); const d0 = dinos(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const d = st.players[0].board.find(c => c.name === 'Dinosaur');
  ok('Dinomancer taps for a 3/3 Trample Dinosaur', dinos(st, 0) === d0 + 1 && d && has(d, 'trample'), [d0, dinos(st, 0)]); }

// ---- imperiosaur: efficient beater ----
{ const st = game();
  const { c } = play(st, 0, 'raugrin_imperiosaur', null);
  ok('Imperiosaur is a 6/5', c.attack === 6 && E.hp(c) === 5, [c.attack, E.hp(c)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
