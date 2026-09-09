// pool_jund_test.mjs — Jund shard pool (BGR, 30, T3 DEVOUR midrange: deaths &
// sacrifice into power, treasures, dragons). Rubric + fired signatures.
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

const pool = raw.cards.filter(c => c.landSet === 'Jund');
ok('Jund pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location/weapon', types.size >= 6 && ['artifact', 'location', 'weapon', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('no rarity on any card', pool.every(c => !('rarity' in c)));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell', 'kicker', 'activated', 'overkill', 'ward', 'medic', 'regen', 'addCost'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(123), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- Karrthus: dragon lord aura + team rush ----
{ const st = game(); const v = put(st, 0, '_v', true);
  play(st, 0, 'jund_karrthus', null);
  ok('Karrthus gives your creatures Rush', has(v, 'rush'), v.keywords); }
{ const st = game(); const d = put(st, 0, 'jund_broodmate_dragon'); const a0 = d.attack;
  put(st, 0, 'jund_karrthus'); E.recomputeAuras(st);
  ok('Karrthus buffs your other Dragons', d.attack === a0 + 1, [a0, d.attack]); }

// ---- Kresh: grows on any death ----
{ const st = game(); const k = put(st, 0, 'jund_kresh'); const v = put(st, 1, '_v'); const a0 = k.attack;
  kill(st, v);
  ok('Kresh grows when any creature dies', k.attack === a0 + 1, [a0, k.attack]); }

// ---- Thrinax: dies into lizards ----
{ const st = game(); const t = put(st, 0, 'jund_sprouting_thrinax');
  kill(st, t);
  ok('Thrinax leaves three 1/1 Lizards', st.players[0].board.filter(c => c.name === 'Lizard').length === 3, st.players[0].board.map(c => c.name)); }

// ---- Bituminous Blast: cascades into a spell from the deck ----
{ const st = game(); st.players[0].deck = ['lightning_bolt']; const foe = put(st, 1, '_v');
  play(st, 0, 'jund_bituminous_blast', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Bituminous Blast cascades (deck spell was cast)', st.players[0].deck.length === 0, st.players[0].deck.length); }

// ---- Devouring: sacrifice-fueled pump ----
{ ok('Jund Devouring costs a sacrifice', byId.jund_devouring.addCost && byId.jund_devouring.addCost.sacrifice === 'creature');
  ok('...for +5/+5 & Trample', byId.jund_devouring.effects[0].attack === 5 && byId.jund_devouring.effects[0].grant === 'trample'); }

// ---- Prossh: kobolds + sac outlet ----
{ const st = game(); play(st, 0, 'jund_prossh', null);
  ok('Prossh brings two Rush Kobolds', st.players[0].board.filter(c => c.name === 'Kobold').length === 2, st.players[0].board.map(c => c.name));
  ok('Prossh carries a sacrifice outlet', Array.isArray(byId.jund_prossh.activated) && byId.jund_prossh.activated[0].sacCost != null); }

// ---- Bloodhunter: deaths become Treasures (shape) ----
{ ok('Bloodhunter converts deaths to Enrich', byId.jund_bloodhunter.ongoing && byId.jund_bloodhunter.ongoing.on === 'friendly-creature-died' && byId.jund_bloodhunter.ongoing.effects[0].type === 'enrich', byId.jund_bloodhunter.ongoing); }

// ---- Hackblade: now a real weapon ----
{ const st = game(); play(st, 0, 'jund_hackblade', null);
  ok('Jund Hackblade equips as a weapon', !!st.players[0].weapon, st.players[0].weapon && st.players[0].weapon.id); }

// ---- Monument + Obelisk ----
{ const st = game(); play(st, 0, 'jund_monument', null); const loc = st.players[0].board.find(c => c.id === 'jund_monument');
  E.tapLand(st, 0, loc.uid, 0);
  const b = st.players[0].board.find(c => c.name === 'Beast');
  ok('Jund Monument taps for a Trample Beast', b && has(b, 'trample'), !!b); }
{ const st = game(); const foe = put(st, 1, '_v'); play(st, 0, 'obelisk_of_jund', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'obelisk_of_jund').uid, null);
  ok('Obelisk of Jund pings a random enemy creature', foe.damage === 1, foe.damage); }

// ---- redesigned cards leave state valid ----
for (const id of ['jund_hackblade', 'jund_charm', 'jund_deathbringer_thoctar', 'jund_berserker', 'jund_ravager', 'jund_firebeast', 'jund_savage', 'jund_monument', 'godtracker_of_jund', 'jund_battlemage', 'jund_sojourner', 'jund_command', 'jund_primalist', 'jund_dinomancer', 'jund_imperiosaur', 'jund_swamp_shaman', 'jund_hellkite', 'jund_bloodflame_elemental', 'jund_mountaineer', 'jund_broodmate_dragon', 'jund_charnelhoard_wurm', 'jund_hellkite_overlord']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
