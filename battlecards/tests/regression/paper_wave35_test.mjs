// paper_wave35_test.mjs — Hex, Kellan's Shadow: the Companion mechanic.
//  - a Companion with a real deckbuilding constraint (15 artifacts that cost 3 or less)
//  - the first companion carrying ONGOING triggers
//  - "Whenever you cast an Adventure or Shadow spell, gain +2/+2 & flip a coin.
//     Heads: destroy target permanent with even MV. Tails: destroy target creature with odd MV."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';
import { validateDeck } from '../../collection.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v     = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common', tribe: 'Beast' };
byId._shadow = { id: '_shadow', name: 'S', type: 'sorcery', cost: 1, tribe: 'Shadow', rarity: 'common', description: 'x', effects: [] };
byId._fire   = { id: '_fire', name: 'F', type: 'sorcery', cost: 1, tribe: 'Fire', rarity: 'common', description: 'x', effects: [] };
byId._c3 = { id: '_c3', name: 'C3', type: 'creature', cost: 3, attack: 2, health: 2, rarity: 'common' };
byId._c4 = { id: '_c4', name: 'C4', type: 'creature', cost: 4, attack: 2, health: 2, rarity: 'common' };
byId._c5 = { id: '_c5', name: 'C5', type: 'creature', cost: 5, attack: 2, health: 2, rarity: 'common' };
byId._a2 = { id: '_a2', name: 'A2', type: 'artifact', cost: 2, rarity: 'common' };
byId._adv = { id: '_adv', name: 'Adv', type: 'creature', cost: 2, attack: 1, health: 1, rarity: 'common',
  adventure: { name: 'Poke', cost: 1, type: 'sorcery', effects: [] } };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const H = byId.hex_kellans_shadow;
ok('hex exists as a neutral legendary companion', H && H.cardClass === 'neutral' && H.rarity === 'legendary' && H.companion === true && H.collectible !== false && !H.colors);
ok('hex has the 15-artifacts-<=3 deckbuilding requirement', H.companionReq && H.companionReq.type === 'artifact' && H.companionReq.maxCost === 3 && H.companionReq.count === 15);
ok('hex triggers on Shadow spells AND on Adventures', Array.isArray(H.ongoings) && H.ongoings.some(o => o.on === 'spell-played' && o.if && o.if.school === 'Shadow') && H.ongoings.some(o => o.on === 'adventure-cast'));

function game(loadouts) {
  // loadouts go in the 6th arg (per-deck companion/commander); the 3rd is playerDeckIds. Passing the
  // companion loadout deterministically (not via the random-companion fallback) keeps this test immune
  // to cards.json seed-drift.
  const st = E.createGame(byId, seededRng(35), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }], loadouts || null);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const castSpell = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };
const onBoard = (st, pl, uid) => st.players[pl].board.some(c => c.uid === uid);
const hasArt = (st, pl, uid) => st.players[pl].artifacts.some(c => c.uid === uid);

// --- COMPANION ZONE: the loadout seats Hex, and it plays straight from the zone ---
{ const st = game([{ companion: 'hex_kellans_shadow' }, {}]);
  ok('Hex starts in the companion zone', st.players[0].companion && st.players[0].companion.id === 'hex_kellans_shadow' && st.players[0].companion.zone === 'companion');
  const played = E.playCard(st, 0, st.players[0].companion.uid, null);
  ok('Hex plays from the companion zone onto the board', played === true && st.players[0].companion === null && st.players[0].board.some(c => c.id === 'hex_kellans_shadow'), [played, st.players[0].board.map(c => c.id)]); }

// --- SHADOW spell + HEADS: gain +2/+2, destroy the costliest EVEN-MV permanent ---
{ const st = game(); const hex = put(st, 0, 'hex_kellans_shadow');
  const c4 = put(st, 1, '_c4'); const c3 = put(st, 1, '_c3'); const a2 = putArt(st, 1, '_a2');
  st.rng = () => 0.1; // heads
  castSpell(st, 0, '_shadow');
  ok('Shadow spell pumps Hex +2/+2 (1/1 -> 3/3)', hex.attack === 3 && E.hp(hex) === 3, [hex.attack, E.hp(hex)]);
  ok('heads destroys the costliest EVEN-MV permanent (the 4-cost creature)', !onBoard(st, 1, c4.uid), st.players[1].board.map(c => c.id));
  ok('the odd-MV creature survives heads', onBoard(st, 1, c3.uid));
  ok('the cheaper even-MV artifact survives (4-cost creature was costlier)', hasArt(st, 1, a2.uid)); }

// --- SHADOW spell + TAILS: destroy the costliest ODD-MV creature ---
{ const st = game(); const hex = put(st, 0, 'hex_kellans_shadow');
  const c5 = put(st, 1, '_c5'); const c3 = put(st, 1, '_c3'); const c4 = put(st, 1, '_c4');
  st.rng = () => 0.9; // tails
  castSpell(st, 0, '_shadow');
  ok('tails also pumps Hex +2/+2', hex.attack === 3 && E.hp(hex) === 3, [hex.attack, E.hp(hex)]);
  ok('tails destroys the costliest ODD-MV creature (the 5-cost)', !onBoard(st, 1, c5.uid), st.players[1].board.map(c => c.id));
  ok('the cheaper odd-MV creature survives tails', onBoard(st, 1, c3.uid));
  ok('the even-MV creature is immune to tails', onBoard(st, 1, c4.uid)); }

// --- ADVENTURE cast also triggers Hex ---
{ const st = game(); const hex = put(st, 0, 'hex_kellans_shadow');
  const c4 = put(st, 1, '_c4');
  const adv = E.instantiate(byId._adv, 0); adv.zone = 'hand'; st.players[0].hand.push(adv);
  st.rng = () => 0.1; // heads
  const cast = E.playAdventure(st, 0, adv.uid, null);
  ok('an Adventure can be cast', cast === true);
  ok('casting an Adventure pumps Hex +2/+2', hex.attack === 3 && E.hp(hex) === 3, [hex.attack, E.hp(hex)]);
  ok('the Adventure trigger destroys an even-MV permanent', !onBoard(st, 1, c4.uid)); }

// --- a NON-Shadow spell does not trigger Hex ---
{ const st = game(); const hex = put(st, 0, 'hex_kellans_shadow');
  const c4 = put(st, 1, '_c4');
  st.rng = () => 0.1;
  castSpell(st, 0, '_fire'); // Fire, not Shadow
  ok('a Fire spell does not trigger Hex (stays 1/1)', hex.attack === 1 && E.hp(hex) === 1, [hex.attack, E.hp(hex)]);
  ok('a Fire spell destroys nothing', onBoard(st, 1, c4.uid)); }

// --- DECKBUILDING CONSTRAINT (validateDeck enforces companionReq) ---
{ const vById = { hex_kellans_shadow: byId.hex_kellans_shadow };
  const coll = {};
  for (let i = 0; i < 40; i++) { vById['fc' + i] = { id: 'fc' + i, name: 'FC' + i, type: 'creature', cardClass: 'neutral', cost: 2, attack: 1, health: 1, rarity: 'common' }; coll['fc' + i] = 2; }
  for (let i = 0; i < 20; i++) { vById['fa' + i] = { id: 'fa' + i, name: 'FA' + i, type: 'artifact', cardClass: 'neutral', cost: 2, rarity: 'common' }; coll['fa' + i] = 2; }
  const bad = Array.from({ length: 40 }, (_, i) => 'fc' + i); // 0 artifacts
  const good = [...Array.from({ length: 25 }, (_, i) => 'fc' + i), ...Array.from({ length: 15 }, (_, i) => 'fa' + i)]; // 15 cheap artifacts
  const eBad = validateDeck(bad, vById, coll, 'mage', null, 'hex_kellans_shadow');
  ok('a deck with < 15 cheap artifacts is rejected for Hex', typeof eBad === 'string' && /15/.test(eBad), eBad);
  const eGood = validateDeck(good, vById, coll, 'mage', null, 'hex_kellans_shadow');
  ok('a deck with 15 artifacts (<=3) is accepted for Hex', eGood === null, eGood);
  // sanity: without a companion the same all-creature deck is legal
  ok('the constraint only applies when Hex is the companion', validateDeck(bad, vById, coll, 'mage', null, null) === null); }

// --- play-without-throw + valid-state sweep ---
{ let threw = null; const st = game(); put(st, 1, '_v');
  try { const inst = E.instantiate(byId.hex_kellans_shadow, 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); } catch (e) { threw = e; }
  ok('hex plays without throwing', !threw, threw && threw.message);
  const v = validateGameState(st); ok('hex leaves state valid', !threw && (!v || v.length === 0), v); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
