// pool_quandrix_test.mjs — Quandrix land pool (GU devotion: Fractals + token-doubling + ramp + growth).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._cantrip = { id: '_cantrip', name: 'C', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const fractals = (st, pi) => st.players[pi].board.filter(c => c.name === 'Fractal').length;

const pool = raw.cards.filter(c => c.landSet === 'Quandrix');
// ---- rubric ----
ok('Quandrix pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GU', pool.every(c => (c.colors || []).slice().sort().join('') === 'GU'));

function game() {
  const st = E.createGame(byId, seededRng(75), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_v'); let threw = null;
  const frTgt = ['quandrix_pledgemage', 'quandrix_command', 'quandrix_charm'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Tanazir: token doubler ----
{ const st = game(); play(st, 0, 'tanazir_quandrix', null);
  const f0 = fractals(st, 0); // includes Tanazir's own battlecry Fractal (doubled)
  play(st, 0, 'quandrix_fractal_summoning', null); // 2 Fractals -> doubled to 4
  ok('Fractal Summoning is doubled to four Fractals under Tanazir', fractals(st, 0) === f0 + 4, [f0, fractals(st, 0)]); }

// ---- Fractal Summoning without Tanazir: two ----
{ const st = game(); const f0 = fractals(st, 0);
  play(st, 0, 'quandrix_fractal_summoning', null);
  ok('Fractal Summoning alone makes two Fractals', fractals(st, 0) === f0 + 2 && st.players[0].board.some(c => c.name === 'Fractal' && has(c, 'trample')), [f0, fractals(st, 0)]); }

// ---- Kianne: a 4/4 Fractal ----
{ const st = game(); const f0 = fractals(st, 0);
  play(st, 0, 'kianne_dean_of_substance', null);
  const frac = st.players[0].board.find(c => c.name === 'Fractal');
  ok('Kianne summons a 4/4 Fractal', fractals(st, 0) === f0 + 1 && frac && frac.attack === 4, [f0, fractals(st, 0), frac && frac.attack]); }

// ---- cultivator: permanent ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'quandrix_cultivator', null);
  ok('Cultivator gains an empty Mana Crystal (max +1)', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- ascendancy enchantment: magecraft growth ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'quandrix_ascendancy', null); const a0 = v.attack;
  cast(st, 0, '_cantrip');
  ok('Ascendancy gives your creatures +1/+1 when you cast a spell', v.attack === a0 + 1, [a0, v.attack]); }

// ---- manifestation artifact: tap ramp + draw ----
{ const st = game(); play(st, 0, 'quandrix_manifestation', null); const h0 = st.players[0].hand.length; const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'quandrix_manifestation').uid, null);
  ok('Manifestation taps for +1 bonus mana and a card', st.players[0].mana.bonus === bonus0 + 1 && st.players[0].hand.length === h0 + 1, [bonus0, st.players[0].mana.bonus, h0, st.players[0].hand.length]); }

// ---- duplication location: tap for a Fractal ----
{ const st = game(); play(st, 0, 'quandrix_duplication', null); const loc = st.players[0].board.find(c => c.id === 'quandrix_duplication'); const f0 = fractals(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Duplication taps for a 3/3 Fractal', fractals(st, 0) === f0 + 1, [f0, fractals(st, 0)]); }

// ---- charm: +2/+2 and Elusive ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'quandrix_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and Elusive', v.attack === a0 + 2 && has(v, 'elusive'), [a0, v.attack, v.keywords]); }

// ---- command: draw 2 + buff ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const h0 = st.players[0].hand.length;
  play(st, 0, 'quandrix_command', { type: 'creature', uid: v.uid, player: 0 });
  ok('Command draws 2 and buffs +2/+2', st.players[0].hand.length === h0 + 2 && v.attack === a0 + 2, [h0, st.players[0].hand.length, a0, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
