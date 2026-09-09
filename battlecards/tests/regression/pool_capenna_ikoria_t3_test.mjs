// pool_capenna_ikoria_t3_test.mjs — Batch C signature mechanics, fired.
// Brokers ward · Obscura connive · Maestros casualty · Riveteers blitz ·
// Cabaretti alliance · Indatha lifegain · Ketria elemental magic ·
// Raugrin dino tempo · Savai cat aristocrats · Zagoth death-value.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

function game() {
  const st = E.createGame(byId, seededRng(131), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// Brokers: the family is warded
{ const wards = ['brokers_chauffeur', 'brokers_consigliere', 'brokers_emancipator'].filter(id => byId[id].ward && byId[id].ward.mana >= 1);
  ok('Brokers creatures carry Ward', wards.length === 3, wards); }

// Obscura: Raffine connives (grows on draw)
{ const st = game(); const { c } = play(st, 0, 'raffine_obscura_schemer', null);
  const a0 = c.attack;
  E.drawCards ? E.drawCards(st, 0, 1) : play(st, 0, 'obscura_guidance', null);
  ok('Raffine grows when you draw', c.attack > a0, [a0, c.attack]); }

// Maestros: Diabolist sac outlet shape
{ ok('Diabolist has a sacrifice cannon', Array.isArray(byId.maestros_diabolist.activated) && byId.maestros_diabolist.activated[0].sacCost != null && byId.maestros_diabolist.activated[0].effects[0].type === 'damage'); }

// Riveteers: blitz — everything dies into cards
{ const blitz = ['riveteers_initiate', 'riveteers_provocateur', 'riveteers_requisitioner', 'henzie_torre_riveteers_thief', 'riveteers_bruiser', 'riveteers_vigilante', 'riveteers_decoy'].filter(id => (byId[id].deathrattle || []).some(e => e.type === 'draw'));
  ok('7 Riveteers die into cards (Blitz)', blitz.length === 7, blitz.length); }
{ const st = game(); const c = put(st, 0, 'riveteers_vigilante'); const h0 = st.players[0].hand.length;
  kill(st, c);
  ok('Vigilante blitz-draws on death', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// Cabaretti: the party grows as guests arrive
{ const st = game(); const c = put(st, 0, 'cabaretti_thespian'); const a0 = c.attack;
  play(st, 0, 'cabaretti_initiate', null);
  ok('Thespian grows on Alliance', c.attack === a0 + 1, [a0, c.attack]); }

// Indatha: lifegain feeds the nightmares
{ const st = game(); st.players[0].life = 30; const c = put(st, 0, 'indatha_felidar'); const a0 = c.attack;
  play(st, 0, 'indatha_puzzlebox', null);
  ok('Felidar grows when you gain Life', c.attack === a0 + 1, [a0, c.attack]); }

// Ketria: elementals grow with magic
{ const st = game(); const c = put(st, 0, 'ketria_crystal_elemental'); const a0 = c.attack;
  play(st, 0, 'ketria_boon', { type: 'creature', uid: c.uid, player: 0 });
  ok('Crystal Elemental grows permanently per spell (+1 beyond the +3 boon)', c.attack === a0 + 4, [a0, c.attack]); }

// Raugrin: Plesiosaur spellburst tempo
{ const st = game(); put(st, 0, 'raugrin_plesiosaur'); const h0 = st.players[0].hand.length;
  play(st, 0, 'raugrin_baryonyx', { type: 'creature', uid: put(st, 1, '_v').uid, player: 1 });
  ok('Plesiosaur Spellburst draws', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// Savai: deaths feed the pride
{ const st = game(); const j = put(st, 0, 'savai_jaguar'); const v = put(st, 0, '_v'); const a0 = j.attack;
  kill(st, v);
  ok('Jaguar grows when a friendly dies', j.attack === a0 + 1, [a0, j.attack]); }

// Zagoth: Elk death-value + Mamba splits
{ const st = game(); const e = put(st, 0, 'zagoth_elk'); const m = put(st, 0, 'zagoth_mamba'); const a0 = e.attack;
  kill(st, m);
  ok('Elk grows on the death', e.attack === a0 + 1, [a0, e.attack]);
  ok('Mamba leaves a Deathtouch Snake', st.players[0].board.some(x => x.name === 'Snake' && has(x, 'deathtouch')), st.players[0].board.map(x => x.name)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
