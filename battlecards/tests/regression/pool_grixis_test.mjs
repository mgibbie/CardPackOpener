// pool_grixis_test.mjs — Grixis shard pool (BRU, 30, T3 SPELL-DRAIN + graveyard
// recursion). Rubric + fired signatures.
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

const pool = raw.cards.filter(c => c.landSet === 'Grixis');
ok('Grixis pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location/weapon', types.size >= 6 && ['artifact', 'location', 'weapon', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('no rarity on any card', pool.every(c => !('rarity' in c)));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell', 'kicker', 'activated', 'overkill', 'ward', 'medic', 'regen'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(122), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- Nicol Bolas: spell-drain engine ----
{ const st = game(); put(st, 0, 'grixis_nicol_bolas'); const life0 = st.players[1].life;
  play(st, 0, 'grixis_charm', null, 2); // mode: discard + lose 2
  ok('Bolas adds 1 drain to the spell (2+1)', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

// ---- Thraximundar: attack = edict ----
{ const st = game(); put(st, 1, '_v'); put(st, 1, '_v');
  const t = put(st, 0, 'grixis_thraximundar');
  E.attack(st, 0, t.uid, { type: 'hero', player: 1 }); E.sweepDeaths(st);
  ok('Thraximundar makes each opponent sacrifice on Swing', st.players[1].board.length === 1, st.players[1].board.length); }

// ---- Sedris: reanimates the fallen ----
{ const st = game(); const v = put(st, 0, '_v'); kill(st, v);
  ok('setup: a creature died', st.players[0].graveyard.length >= 1 || (st.players[0].deathLogIds || []).length >= 1);
  play(st, 0, 'grixis_sedris', null);
  ok('Sedris returns it to the battlefield', st.players[0].board.some(c => c.id === '_v'), st.players[0].board.map(c => c.id)); }

// ---- Denial: a Grixis counterspell ----
{ ok('Grixis Denial is a counterspell (unless pay 2, cantrip)', byId.grixis_deny_reality.counterSpell === true && byId.grixis_deny_reality.counter.unlessPay === 2 && byId.grixis_deny_reality.type === 'instant'); }

// ---- Skeleton: Reborn + deathrattle fires on both deaths ----
{ const st = game(); const c = put(st, 0, 'grixis_skeleton'); const life0 = st.players[1].life;
  kill(st, c);
  ok('Skeleton deathrattle fires on first death (reborn)', st.players[1].life === life0 - 1, [life0, st.players[1].life]);
  ok('Skeleton reborn returned it', st.players[0].board.some(x => x.id === 'grixis_skeleton'), st.players[0].board.map(x => x.id)); }

// ---- Whip: hero-attack drain ----
{ const st = game(); play(st, 0, 'grixis_demonspine_whip', null); const life0 = st.players[1].life; const mine0 = st.players[0].life;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Demonspine Whip drains 1 after the hero attacks', st.players[1].life === life0 - 1 && st.players[0].life === mine0 + 1, [life0, st.players[1].life]); }

// ---- Monument + Obelisk ----
{ const st = game(); play(st, 0, 'grixis_monument', null); const loc = st.players[0].board.find(c => c.id === 'grixis_monument');
  const life0 = st.players[1].life; E.tapLand(st, 0, loc.uid, 0);
  const u = st.players[0].board.find(c => c.name === 'Undead');
  ok('Grixis Monument taps for a Deathtouch Undead + drain', u && has(u, 'deathtouch') && st.players[1].life === life0 - 1, [!!u, life0 - st.players[1].life]); }
{ const st = game(); play(st, 0, 'obelisk_of_grixis', null); const life0 = st.players[1].life;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'obelisk_of_grixis').uid, null);
  ok('Obelisk of Grixis taps for mana + 1 drain', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- redesigned cards leave state valid ----
for (const id of ['grixis_sedraxis_specter', 'grixis_blood_tyrant', 'grixis_vithian_stinger', 'grixis_kederekt_leviathan', 'grixis_slavedriver', 'grixis_cruel_ultimatum', 'grixis_pyromancer', 'grixis_soulreaper', 'grixis_firebrand', 'grixis_battlemage', 'grixis_grimblade', 'grixis_illusionist', 'grixis_sojourner', 'nefarox_overlord_of_grixis', 'grixis_command', 'grixis_vampire_king', 'grixis_marauder', 'grixis_outlander', 'grixis_parasite', 'grixis_fire_field_ogre', 'grixis_kederekt_creeper']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
