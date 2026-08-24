// pool_brokers_test.mjs — Brokers land pool (GWU tri-color: +1/+1 counters + shield counters + Citizens + draw/lifegain).
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
const citizens = (st, pi) => st.players[pi].board.filter(c => c.name === 'Citizen').length;

const pool = raw.cards.filter(c => c.landSet === 'Brokers');
// ---- rubric ----
ok('Brokers pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GWU (order W,U,G)', pool.every(c => JSON.stringify(c.colors) === '["W","U","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(76), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const frTgt = c.id === 'brokers_charm';
  const foeTgt = ['brokers_verdict', 'brokers_regulator'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Falco: team +1/+1 and Divine Shield ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'falco_spara_brokers_pactweaver', null);
  ok('Falco gives your creatures +1/+1 and Divine Shield', v.attack === a0 + 1 && has(v, 'divine_shield') && v.shield === true, [a0, v.attack, v.keywords, v.shield]); }

// ---- veteran: counters anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'brokers_veteran', null);
  ok('Veteran gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- charm: +2/+2 and Divine Shield (shield flag set) ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'brokers_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and a working Divine Shield', v.attack === a0 + 2 && has(v, 'divine_shield') && v.shield === true, [a0, v.attack, v.shield]); }

// ---- verdict: destroy ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'brokers_verdict', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Verdict destroys a creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- regulator: bounce ----
{ const st = game(); const foe = put(st, 1, '_wall'); const h0 = st.players[1].hand.length;
  play(st, 0, 'brokers_regulator', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Regulator returns a creature to hand', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[1].hand.length]); }

// ---- ascendancy enchantment: turn-start bolster ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'brokers_ascendancy', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Ascendancy bolsters your weakest creature at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- reconnaissance artifact: tap scry + draw ----
{ const st = game(); play(st, 0, 'brokers_reconnaissance', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'brokers_reconnaissance').uid, null);
  ok('Reconnaissance taps to draw', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- resourcefulness location: tap for a shielded Citizen ----
{ const st = game(); play(st, 0, 'brokers_resourcefulness', null); const loc = st.players[0].board.find(c => c.id === 'brokers_resourcefulness'); const c0 = citizens(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const cit = st.players[0].board.find(c => c.name === 'Citizen');
  ok('Resourcefulness taps for a Divine Shield Citizen', citizens(st, 0) === c0 + 1 && cit && has(cit, 'divine_shield'), [c0, citizens(st, 0)]); }

// ---- initiate: gain 2 ----
{ const st = game(); const life0 = st.players[0].life;
  play(st, 0, 'brokers_initiate', null);
  ok('Initiate gains 2 life', st.players[0].life === life0 + 2, [life0, st.players[0].life]); }

// ---- catering: gain 4 + draw ----
{ const st = game(); const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  play(st, 0, 'brokers_catering', null);
  ok('Catering gains 4 and draws', st.players[0].life === life0 + 4 && st.players[0].hand.length === h0 + 1, [life0, st.players[0].life, h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
