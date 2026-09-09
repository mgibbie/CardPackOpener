// pool_naya_test.mjs — Naya shard pool (GRW, 30, T3 POWER MATTERS: big bodies,
// cascade, team-wide might). Rubric + fired signatures.
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

const pool = raw.cards.filter(c => c.landSet === 'Naya');
ok('Naya pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location/enchantment', types.size >= 6 && ['artifact', 'location', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('no rarity on any card', pool.every(c => !('rarity' in c)));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell', 'kicker', 'activated', 'overkill', 'ward', 'medic', 'regen'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(124), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- Mayael: cheats a 5+ Attack creature from hand into play ----
{ const st = game(); const big = E.instantiate(byId.naya_gargantuan, 0); big.zone = 'hand'; st.players[0].hand.push(big);
  play(st, 0, 'naya_mayael', null);
  ok('Mayael puts an 8-Attack creature from hand into play', st.players[0].board.some(c => c.id === 'naya_gargantuan'), st.players[0].board.map(c => c.id)); }

// ---- Bloodbraid Elf: cascade ----
{ const st = game(); st.players[0].deck = ['lightning_bolt'];
  play(st, 0, 'naya_bloodbraid_elf', null);
  ok('Bloodbraid Elf cascades into the deck spell', st.players[0].deck.length === 0, st.players[0].deck.length); }

// ---- Ascendancy: every played creature enters bigger ----
{ const st = game(); play(st, 0, 'naya_ascendancy', null);
  const { c } = play(st, 0, 'naya_wild_nacatl', null);
  ok('Ascendancy pumps the played creature (+1/+1)', c.attack === byId.naya_wild_nacatl.attack + 1, [byId.naya_wild_nacatl.attack, c.attack]); }

// ---- Knight of New Alara: lord aura ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  put(st, 0, 'naya_knight_of_new_alara'); E.recomputeAuras(st);
  ok('Knight of New Alara buffs your other creatures', v.attack === a0 + 1, [a0, v.attack]); }

// ---- Gloryscale Viashino: swings huge ----
{ const st = game(); const c = put(st, 0, 'naya_gloryscale_viashino'); const a0 = c.attack;
  E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
  ok('Gloryscale swings at +3 Attack', c.attack === a0 + 3, [a0, c.attack]); }

// ---- Soulbeast: kicker scaling ----
{ ok('Soulbeast has the Kicker 3 upgrade', byId.naya_soulbeast.kicker && byId.naya_soulbeast.kicker.cost === 3 && byId.naya_soulbeast.kicker.effects.some(e => e.keyword === 'taunt')); }

// ---- Monument + Obelisk ----
{ const st = game(); play(st, 0, 'naya_monument', null); const loc = st.players[0].board.find(c => c.id === 'naya_monument');
  E.tapLand(st, 0, loc.uid, 0);
  const b = st.players[0].board.find(c => c.name === 'Beast');
  ok('Naya Monument taps for a Trample Beast', b && has(b, 'trample'), !!b); }
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'obelisk_of_naya', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'obelisk_of_naya').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Obelisk of Naya taps for mana + a +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- Charm: modal instant ----
{ const st = game(); play(st, 0, 'naya_charm', null, 2);
  ok('Naya Charm (mode: cats) summons two Rush Cats', st.players[0].board.filter(c => c.name === 'Cat').length === 2, st.players[0].board.map(c => c.name)); }

// ---- redesigned cards leave state valid ----
for (const id of ['naya_woolly_thoctar', 'naya_rhox_charger', 'naya_wild_nacatl', 'naya_gahiji', 'naya_huntmaster', 'naya_battlecaller', 'naya_titanic_ultimatum', 'naya_behemoth', 'naya_charger', 'naya_battlemage', 'naya_hushblade', 'naya_sojourner', 'naya_soulbeast', 'sigil_of_the_naya_gods', 'naya_cavern_thoctar', 'naya_anima_druid', 'naya_knotvine_mystic', 'naya_vitality', 'naya_outlander', 'naya_gargantuan', 'naya_growth', 'naya_marisis_twinclaws']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
