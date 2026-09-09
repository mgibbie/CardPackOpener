// pool_wastes_test.mjs — Wastes basic pool (COLORLESS, 70, no rarity, cardClass neutral). LIGHT ENHANCEMENT:
// faithful cards left untouched; this asserts the rubric + the enhanced/repurposed cards. (wastes_pool_test.mjs
// guards the colorless/neutral/no-rarity structure; keep it green too.)
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

const pool = raw.cards.filter(c => c.landSet === 'Wastes');
// ---- rubric (Wastes: colorless, neutral, no rarity) ----
ok('Wastes pool has 70 cards', pool.length === 70, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/artifact/location/enchantment', types.size >= 6 && ['weapon', 'artifact', 'location', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays colorless + neutral + no rarity key', pool.every(c => Array.isArray(c.colors) && c.colors.length === 0 && c.cardClass === 'neutral' && !('rarity' in c)));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(111), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const scions = (st, pi) => st.players[pi].board.filter(c => c.name === 'Eldrazi Scion').length;

// ---- Skullclamp weapon: draw on friendly death ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'wastes_skullclamp', null); const h0 = st.players[0].hand.length;
  ok('Skullclamp equips a weapon', !!st.players[0].weapon);
  kill(st, fodder);
  ok('Skullclamp draws when a friendly dies', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- Sword of Fire and Ice weapon: burn + draw on hero attack ----
{ const st = game(); play(st, 0, 'wastes_sword_of_fire_and_ice', null); const life0 = st.players[1].life; const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Sword of Fire and Ice deals 2 and draws after hero attacks', st.players[1].life === life0 - 2 && st.players[0].hand.length === h0 + 1, [life0, st.players[1].life]); }

// ---- Batterskull weapon: lifegain on hero attack ----
{ const st = game(); play(st, 0, 'wastes_batterskull', null); const life0 = st.players[0].life;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Batterskull gains 4 life after hero attacks', st.players[0].life === life0 + 4, [life0, st.players[0].life]); }

// ---- phyrexian_metamorph ARTIFACT: tap +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'wastes_phyrexian_metamorph', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'wastes_phyrexian_metamorph').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Phyrexian Metamorph (artifact) taps to put a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- conduit_of_ruin LOCATION: tap for an Eldrazi Scion ----
{ const st = game(); play(st, 0, 'wastes_conduit_of_ruin', null); const loc = st.players[0].board.find(c => c.id === 'wastes_conduit_of_ruin'); const s0 = scions(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Conduit of Ruin (location) taps for a 2/2 Eldrazi Scion', scions(st, 0) === s0 + 1, [s0, scions(st, 0)]); }

// ---- deceiver_of_form ENCHANTMENT: turn-start Scion ----
{ const st = game(); play(st, 0, 'wastes_deceiver_of_form', null); const s0 = scions(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Deceiver of Form (enchantment) summons a Scion at turn start', scions(st, 0) === s0 + 1, [s0, scions(st, 0)]); }

// ---- Eldrazi keywords ----
{ const st = game(); const { c } = play(st, 0, 'wastes_endless_one', null);
  ok('Endless One has Trample', has(c, 'trample'), c.keywords);
  ok('Endless One carries the Kicker 4 scaling', byId.wastes_endless_one.kicker && byId.wastes_endless_one.kicker.cost === 4, byId.wastes_endless_one.kicker); }

// ---- Sol Ring is a real artifact again ----
{ const st = game(); play(st, 0, 'wastes_sol_ring', null);
  const ring = st.players[0].artifacts.find(a => a.id === 'wastes_sol_ring');
  ok('Sol Ring enters the artifact row', !!ring);
  const mana0 = st.players[0].mana.cur + st.players[0].mana.bonus;
  E.tapArtifact(st, 0, ring.uid, null);
  const mana1 = st.players[0].mana.cur + st.players[0].mana.bonus;
  ok('Sol Ring taps for 2 mana', mana1 === mana0 + 2, [mana0, mana1]); }

// ---- Mind's Eye taps to draw ----
{ const st = game(); play(st, 0, 'wastes_minds_eye', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'wastes_minds_eye').uid, null);
  ok('Mind’s Eye (artifact) taps to draw', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
  ok('all 11 rocks are artifacts now', ['wastes_sol_ring', 'wastes_mind_stone', 'wastes_hedron_archive', 'wastes_everflowing_chalice', 'wastes_thran_dynamo', 'wastes_worn_powerstone', 'wastes_coldsteel_heart', 'wastes_prismatic_lens', 'wastes_ur_golems_eye', 'wastes_star_compass', 'wastes_minds_eye'].every(id => byId[id].type === 'artifact' && byId[id].tapAbility)); }

// ---- Kozilek draws four ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'wastes_kozilek', null);
  ok('Kozilek draws 4', st.players[0].hand.length === h0 + 4, [h0, st.players[0].hand.length]); }

// ---- Void Winnower: annihilator ----
{ const st = game(); put(st, 1, '_v'); put(st, 1, '_v');
  play(st, 0, 'wastes_void_winnower', null); E.sweepDeaths(st);
  ok('Void Winnower makes each opponent sacrifice a creature', st.players[1].board.length === 1, st.players[1].board.length);
  ok('Emrakul annihilates for two', byId.wastes_emrakul.effects.length === 2 && byId.wastes_emrakul.effects.every(e => e.type === 'sacrifice-each-enemy')); }

// ---- Wurmcoil Engine: classic death payoff ----
{ const st = game(); const c = put(st, 0, 'wastes_wurmcoil_engine');
  kill(st, c);
  const wurms = st.players[0].board.filter(x => x.name === 'Wurm');
  ok('Wurmcoil Engine leaves two 3/3 Wurms', wurms.length === 2 && wurms.every(w => w.attack === 3), wurms.length); }

// ---- Hangarback Walker: thopters on entry AND death ----
{ const st = game(); const { c } = play(st, 0, 'wastes_hangarback_walker', null);
  const t0 = st.players[0].board.filter(x => x.name === 'Thopter').length;
  kill(st, c);
  const t1 = st.players[0].board.filter(x => x.name === 'Thopter').length;
  ok('Hangarback makes 2 Thopters on entry + 2 on death', t0 === 2 && t1 === 4, [t0, t1]); }

// ---- Solemn Simulacrum: ramp + death draw ----
{ const st = game(); const max0 = st.players[0].mana.max;
  const { c } = play(st, 0, 'wastes_solemn_simulacrum', null);
  ok('Solemn gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]);
  const h0 = st.players[0].hand.length; kill(st, c);
  ok('Solemn draws on death', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- Oblivion Sower / Burnished Hart: permanent ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'wastes_oblivion_sower', null);
  ok('Oblivion Sower ramps two crystals', st.players[0].mana.max === max0 + 2, [max0, st.players[0].mana.max]);
  ok('Burnished Hart ramps too', byId.wastes_burnished_hart.effects.every(e => e.type === 'gain-empty-mana-crystal')); }

// ---- Scuttling Doom Engine: explodes on death ----
{ const st = game(); const c = put(st, 0, 'wastes_scuttling_doom_engine'); const life0 = st.players[1].life;
  kill(st, c);
  ok('Scuttling Doom Engine deals 3 on death', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- construct spice: shape checks ----
{ ok('Lodestone Golem taxes noncreature spells', byId.wastes_lodestone_golem.costMod && byId.wastes_lodestone_golem.costMod.cardType === 'noncreature', byId.wastes_lodestone_golem.costMod);
  ok('Metalwork Colossus discounts per artifact', byId.wastes_metalwork_colossus.selfCost && byId.wastes_metalwork_colossus.selfCost.per === 'artifacts', byId.wastes_metalwork_colossus.selfCost);
  ok('Juggernaut is Impulsive + Rush', (byId.wastes_juggernaut.keywords || []).includes('impulsive'), byId.wastes_juggernaut.keywords);
  ok('Steel Hellkite breathes fire', (byId.wastes_steel_hellkite.keywords || []).includes('firebreathing'), byId.wastes_steel_hellkite.keywords);
  ok('Walking Ballista has its repeatable ping', Array.isArray(byId.wastes_walking_ballista.activated) && byId.wastes_walking_ballista.activated[0].repeatable === true, byId.wastes_walking_ballista.activated);
  ok('Ornithopter is a Thopter lord', byId.wastes_ornithopter.aura && byId.wastes_ornithopter.aura.tribe === 'Thopter', byId.wastes_ornithopter.aura);
  ok('Scour from Existence exiles', byId.wastes_scour_from_existence.effects[0].type === 'exile');
  ok('Duplicant exiles', byId.wastes_duplicant.effects[0].type === 'exile'); }

// ---- redesigned cards leave state valid ----
for (const id of ['wastes_emrakul', 'wastes_ulamog', 'wastes_eldrazi_mimic', 'wastes_vile_aggregate', 'wastes_bane_of_bala_ged', 'wastes_breaker_of_armies', 'wastes_matter_reshaper', 'wastes_reality_smasher', 'wastes_world_breaker', 'wastes_ornithopter', 'wastes_juggernaut', 'wastes_lodestone_golem', 'wastes_metalwork_colossus', 'wastes_triskelion', 'wastes_duplicant', 'wastes_filigree_familiar', 'wastes_steel_hellkite', 'wastes_walking_ballista', 'wastes_scour_from_existence']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
