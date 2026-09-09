// pool_esper_test.mjs — Esper shard pool (BUW, 30, T3 ARTIFACT CONTROL:
// artifact-played engines, thopters, taxes). Rubric + fired signatures.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Esper');
ok('Esper pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location/secret', types.size >= 6 && ['artifact', 'location', 'secret', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('no rarity on any card', pool.every(c => !('rarity' in c)));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell', 'kicker', 'activated', 'overkill', 'ward', 'medic', 'regen'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(121), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- Master of Etherium: the artifact engine fires when an artifact is played ----
{ const st = game(); const m = put(st, 0, 'esper_master_of_etherium'); const a0 = m.attack;
  play(st, 0, 'obelisk_of_esper', null);
  ok('Master of Etherium pumps the team when an artifact enters', m.attack === a0 + 1, [a0, m.attack]); }

// ---- Sharuum: draws 2 + artifact growth ----
{ const st = game(); const h0 = st.players[0].hand.length;
  const { c } = play(st, 0, 'esper_sharuum', null);
  ok('Sharuum draws two', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
  const a0 = c.attack; play(st, 0, 'esper_etherwrought_page', null);
  ok('Sharuum grows on artifact-played', c.attack === a0 + 1, [a0, c.attack]); }

// ---- Execution exiles (no graveyard) ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'esper_cast_down', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Esper Execution removes the creature', !st.players[1].board.some(c => c.uid === foe.uid));
  ok('...and it is exiled, not in the graveyard', !st.players[1].graveyard.some(c => c.uid === foe.uid), st.players[1].graveyard.map(c => c.id)); }

// ---- Hegemon's Decree: a real secret ----
{ const st = game(); play(st, 0, 'esper_hegemons_decree', null);
  ok('Hegemon’s Decree installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  ok('...that destroys an attacker', byId.esper_hegemons_decree.secret.effects[0].type === 'destroy-attacker'); }

// ---- Monument taps for a Thopter ----
{ const st = game(); play(st, 0, 'esper_monument', null); const loc = st.players[0].board.find(c => c.id === 'esper_monument');
  E.tapLand(st, 0, loc.uid, 0);
  const t = st.players[0].board.find(c => c.name === 'Thopter');
  ok('Esper Monument taps for an Elusive Thopter', t && has(t, 'elusive'), !!t); }

// ---- Esper Sentinel: rhystic tax shape ----
{ ok('Esper Sentinel taxes enemy spells', byId.esper_sentinel.ongoing && byId.esper_sentinel.ongoing.on === 'enemy-spell-played' && byId.esper_sentinel.ongoing.effects[0].type === 'opponent-may-pay', byId.esper_sentinel.ongoing); }

// ---- Charm: modal instant ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'esper_charm', null, 0);
  ok('Esper Charm (mode: draw) draws two', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- redesigned cards leave state valid ----
for (const id of ['esper_sphinx_steel_wind', 'esper_ethersworn_adjudicator', 'esper_tidehollow_sculler', 'esper_sanctum_gargoyle', 'esper_stormblade', 'esper_deathmage', 'esper_dispersal', 'esper_battlemage', 'esper_cormorant', 'esper_sojourner', 'esper_soulblade', 'esper_trailblazer', 'esper_canonist', 'esper_cloud_drake', 'esper_leviathan', 'esper_agent', 'esper_outlander', 'esper_enigma_sphinx', 'esper_magister_sphinx', 'esper_arsenal_thresher', 'esper_brilliant_ultimatum']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
