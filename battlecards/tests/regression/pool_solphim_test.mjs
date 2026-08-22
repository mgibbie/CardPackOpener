// pool_solphim_test.mjs — Solphim boss pool (R damage DOUBLER: noncombat damage doubled).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 3, attack: 2, health: 30, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Solphim');
// ---- rubric ----
ok('Solphim pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/location/instant', types.size >= 6 && ['artifact', 'enchantment', 'location', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('has two damage doublers (sig + Mayhem enchantment)', pool.filter(c => c.static && c.static.type === 'damage-doubler').length === 2);
ok('the boss (sig) is an Elemental creature commander', byId.solphim_sig.type === 'creature');

function game() {
  const st = E.createGame(byId, seededRng(19), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_foe', '_foe', '_foe', '_foe', '_foe']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_foe'); const foe = put(st, 1, '_foe'); let threw = null;
  const tgt = (['solphim_radiant_entropy', 'solphim_volcano_priest', 'solphim_eruption', 'solphim_furnace_colossus'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'solphim_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- baseline: 3-damage bolt with no doubler ----
{ const st = game(); const foe = put(st, 1, '_foe');
  play(st, 0, 'solphim_radiant_entropy', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Radiant Entropy deals 3 (no doubler)', foe.damage === 3, foe.damage); }

// ---- 1 doubler (sig on board): 3 -> 6 ----
{ const st = game(); const foe = put(st, 1, '_foe'); put(st, 0, 'solphim_sig');
  play(st, 0, 'solphim_radiant_entropy', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Solphim doubles noncombat damage (3 -> 6)', foe.damage === 6, foe.damage); }

// ---- 2 doublers stack (sig + Mayhem enchantment): 3 -> 12 ----
{ const st = game(); const foe = put(st, 1, '_foe'); put(st, 0, 'solphim_sig'); play(st, 0, 'solphim_ultimatum', null);
  play(st, 0, 'solphim_radiant_entropy', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Two doublers stack multiplicatively (3 -> 12)', foe.damage === 12, foe.damage); }

// ---- the boss battlecry self-doubles: 4 -> 8 to face ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'solphim_sig', null);
  ok('Solphim boss battlecry (4) is doubled by its own static -> 8 to face', st.players[1].life === life0 - 8, [life0, st.players[1].life]); }

// ---- mayhem crown artifact: 2 -> 4 with a doubler ----
{ const st = game(); const foe = put(st, 1, '_foe'); put(st, 0, 'solphim_sig'); const cr = putArt(st, 0, 'solphim_mayhem_crown');
  E.tapArtifact(st, 0, cr.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Mayhem Crown deals 2, doubled to 4', foe.damage === 4, foe.damage); }

// ---- puzzlebox location: AoE, doubled ----
{ const st = game(); const a = put(st, 1, '_foe'); const b = put(st, 1, '_foe'); put(st, 0, 'solphim_sig');
  play(st, 0, 'solphim_puzzlebox', null);
  const loc = st.players[0].board.find(c => c.id === 'solphim_puzzlebox');
  E.tapLand(st, 0, loc.uid, 0);
  ok('Puzzlebox furnace deals 1 to all enemy creatures, doubled to 2', a.damage === 2 && b.damage === 2, [a.damage, b.damage]); }

// ---- fireblood warlock: Spell Damage +1 on a spell ----
{ const st = game(); const foe = put(st, 1, '_foe'); put(st, 0, 'solphim_fireblood_warlock');
  play(st, 0, 'solphim_radiant_entropy', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Fireblood Warlock gives Spell Damage +1 (3 -> 4)', foe.damage === 4, foe.damage); }

// ---- command Choose One (mode 1 = face, doubled) ----
{ const st = game(); put(st, 0, 'solphim_sig'); const life0 = st.players[1].life;
  play(st, 0, 'solphim_command', null, 1);
  ok('Command (face mode) deals 4, doubled to 8', st.players[1].life === life0 - 8, [life0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
