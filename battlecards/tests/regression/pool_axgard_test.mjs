// pool_axgard_test.mjs — Axgard land pool (RW / Kaldheim realm, 30 cards: Dwarf go-wide + weapons + anthems + Treasure + aggro).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const dwarves = (st, pi) => st.players[pi].board.filter(c => c.name === 'Dwarf').length;

const pool = raw.cards.filter(c => c.landSet === 'Axgard');
// ---- rubric ----
ok('Axgard pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RW', pool.every(c => JSON.stringify(c.colors) === '["R","W"]'));
ok('all names contain Axgard + uncollectible', pool.every(c => /axgard/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(96), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['forge_devil', 'demon_bolt', 'frost_bite', 'goldmaw_chasm_of_axgard'].includes(c.id);
  const frTgt = ['axgard_forgemaster', 'axgard_artisan', 'axgard_bladeblesser', 'rune_of_might'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Magda: go-wide anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'magda_brazen_outlaw', null);
  ok('Magda gives your creatures +1/+0', v.attack === a0 + 1, [a0, v.attack]); }

// ---- dwarf king: two Dwarves ----
{ const st = game(); const d0 = dwarves(st, 0);
  play(st, 0, 'axgard_dwarf_king', null);
  ok('Dwarf King summons two Rush Dwarves', dwarves(st, 0) === d0 + 2 && st.players[0].board.some(c => c.name === 'Dwarf' && has(c, 'rush')), [d0, dwarves(st, 0)]); }

// ---- mountain song enchantment: go-wide ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'axgard_mountain_song', null); const a0 = v.attack;
  play(st, 0, '_v', null);
  ok('Mountain Song gives +1/+0 when a creature enters', v.attack >= a0 + 1, [a0, v.attack]); }

// ---- monument location: tap for a Dwarf ----
{ const st = game(); play(st, 0, 'axgard_monument', null); const loc = st.players[0].board.find(c => c.id === 'axgard_monument'); const d0 = dwarves(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps for a Rush Dwarf', dwarves(st, 0) === d0 + 1, [d0, dwarves(st, 0)]); }

// ---- golden doors artifact: tap ramp + draw ----
{ const st = game(); play(st, 0, 'golden_doors_of_axgard', null); const bonus0 = st.players[0].mana.bonus; const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'golden_doors_of_axgard').uid, null);
  ok('Golden Doors taps for +1 bonus mana and a card', st.players[0].mana.bonus === bonus0 + 1 && st.players[0].hand.length === h0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- demon bolt instant: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'demon_bolt', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Demon Bolt deals 4 to a creature', foe.damage === 4, foe.damage); }

// ---- dwarven hammer weapon: rally on hero attack ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'dwarven_hammer', null); const a0 = v.attack;
  ok('Dwarven Hammer equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Dwarven Hammer gives +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

// ---- NEW Goldspan Dragon: ramp charge ----
{ const st = game(); const bonus0 = st.players[0].mana.bonus;
  const { c } = play(st, 0, 'axgard_goldspan_dragon', null);
  ok('Goldspan Dragon has Charge and ramps 2', has(c, 'charge') && st.players[0].mana.bonus === bonus0 + 2, [bonus0, st.players[0].mana.bonus]); }

// ---- NEW Battlefield Raptor: evasive first-striker ----
{ const st = game();
  const { c } = play(st, 0, 'axgard_battlefield_raptor', null);
  ok('Battlefield Raptor has Elusive + First Strike', has(c, 'elusive') && has(c, 'first_strike'), c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
