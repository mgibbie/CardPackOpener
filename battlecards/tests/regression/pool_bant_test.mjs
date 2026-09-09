// pool_bant_test.mjs — Bant shard pool (GUW, 30, T3 EXALTED: Swing/attack triggers,
// protection, angels). Rubric + fired signature mechanics. (bant_pool_test.mjs
// still guards the tri-color/uncollectible structure + play-all.)
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

const pool = raw.cards.filter(c => c.landSet === 'Bant');
// ---- rubric ----
ok('Bant pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location/enchantment', types.size >= 6 && ['artifact', 'location', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('no rarity on any card', pool.every(c => !('rarity' in c)));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell', 'kicker', 'activated', 'overkill', 'ward', 'medic', 'regen'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(120), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- Rafiq: Swing pumps the team ----
{ const st = game(); const v = put(st, 0, '_v'); const r = put(st, 0, 'bant_rafiq'); const a0 = v.attack;
  E.attack(st, 0, r.uid, { type: 'hero', player: 1 });
  ok('Rafiq Swing gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- Exalted Angel: temp pump on attack ----
{ const st = game(); const c = put(st, 0, 'bant_exalted_angel'); const a0 = c.attack;
  E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
  ok('Exalted Angel swings as a bigger creature', c.attack === a0 + 2, [a0, c.attack]); }

// ---- Battlegrace Angel: gains Divine Shield on attack ----
{ const st = game(); const c = put(st, 0, 'bant_battlegrace_angel');
  E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
  ok('Battlegrace Angel gains Divine Shield on Swing', has(c, 'divine_shield') || c.shield === true, c.keywords); }

// ---- Finest Hour: enchantment aura grants +1/+1 & Elusive ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'bant_finest_hour', null); E.recomputeAuras(st);
  ok('Finest Hour buffs the team', v.attack === a0 + 1, [a0, v.attack]);
  ok('Finest Hour grants Elusive', has(v, 'elusive'), v.keywords); }

// ---- Monument location + Obelisk artifact ----
{ const st = game(); play(st, 0, 'bant_monument', null); const loc = st.players[0].board.find(c => c.id === 'bant_monument');
  const life0 = st.players[0].life; E.tapLand(st, 0, loc.uid, 0);
  const bird = st.players[0].board.find(c => c.name === 'Bird');
  ok('Bant Monument taps for an Elusive Bird + 2 Life', bird && has(bird, 'elusive') && st.players[0].life === life0 + 2, [!!bird, st.players[0].life - life0]); }
{ const st = game(); const v = put(st, 0, '_v'); const h0 = E.hp(v); play(st, 0, 'bant_obelisk', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'bant_obelisk').uid, null);
  ok('Bant Obelisk taps for mana + team +0/+1', E.hp(v) === h0 + 1, [h0, E.hp(v)]); }

// ---- Charm: modal instant ----
{ const st = game(); const life0 = st.players[0].life; const h0 = st.players[0].hand.length;
  play(st, 0, 'bant_charm', null, 1);
  ok('Bant Charm (mode: heal+draw) gains 4 & draws', st.players[0].life === life0 + 4 && st.players[0].hand.length === h0 + 1, [st.players[0].life - life0, st.players[0].hand.length - h0]); }

// ---- Wargate discovers from the Bant pool ----
{ const st = game(); play(st, 0, 'bant_wargate', null);
  const pend = st.pickQueue && st.pickQueue[0];
  ok('Wargate queues a Bant discover', pend && pend.ids && pend.ids.every(id => byId[id] && byId[id].landSet === 'Bant'), pend && pend.ids); }

// ---- Empyrial Archangel shields the hero ----
{ ok('Empyrial Archangel carries the hero-Immune aura', byId.bant_empyrial_archangel.heroImmuneAura === true); }

// ---- redesigned cards leave state valid ----
for (const id of ['bant_jenara', 'bant_rhox_war_monk', 'bant_mystic_snake', 'bant_sovereigns', 'bant_sureblade', 'bant_skyknight', 'bant_lifebinder', 'bant_vanguard', 'bant_archangel', 'bant_battlemage', 'bant_eclipse_ritual', 'bant_leotau', 'bant_messenger', 'bant_primalist', 'bant_pugilist', 'bant_soulsinger', 'bant_stardrake', 'bant_vizier', 'bant_aerie_mystics', 'bant_sojourners']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
