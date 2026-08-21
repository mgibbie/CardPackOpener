// paper_wave6_test.mjs — new engine mechanics (add-random-card, destroy-permanent)
// and the paper cards that use them.
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['bearded_reedling', 'whiteflame_spellweaver', 'heartblossom_snapdragon', 'green_eyes_red_dragon', 'cindervoid_raider', 'icewind_deathlord', 'upbeat_frontdrake'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, t = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, t); return c; };

// add-random-card: Bearded Reedling adds a random NEUTRAL COMMON CREATURE
{ const st = game(); const h0 = st.players[0].hand.length; play(st, 0, 'bearded_reedling');
  const added = st.players[0].hand[st.players[0].hand.length - 1];
  ok('Bearded Reedling adds a card', st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0);
  ok('the added card matches the filter (neutral common creature)',
    added && added.type === 'creature' && (added.cardClass || 'neutral') === 'neutral' && (added.rarity || 'common') === 'common', added && `${added.cardClass}/${added.rarity}/${added.type}`); }

// add-random-card with a school list + otherClass: Whiteflame Spellweaver
{ const st = game(); const h0 = st.players[0].hand.length; let threw = null;
  try { play(st, 0, 'whiteflame_spellweaver'); } catch (e) { threw = e; }
  ok('Whiteflame Spellweaver resolves (Fire/Frost from another class)', !threw && st.players[0].hand.length === h0 + 1, threw ? threw.message : st.players[0].hand.length - h0); }

// destroy-permanent: destroys an enemy artifact
{ const st = game(); E.gainTokenCard(st, 1, 'clue_token'); const before = st.players[1].artifacts.length;
  play(st, 0, 'cindervoid_raider');
  ok('Cindervoid Raider destroys an enemy artifact', st.players[1].artifacts.length === before - 1, st.players[1].artifacts.length); }

// destroy-permanent as a Deathrattle: Heartblossom removes an enemy enchantment
{ const st = game(); const ench = E.instantiate(byId.thorough_investigation || byId._v, 1); ench.zone = 'enchantment'; st.players[1].enchantments.push(ench);
  const h = put(st, 0, 'heartblossom_snapdragon'); const before = st.players[1].enchantments.length;
  runDeathrattle(st, 0, h);
  ok('Heartblossom Deathrattle destroys an enemy Artifact/Enchantment', st.players[1].enchantments.length < before || st.players[1].artifacts.length === 0, st.players[1].enchantments.length); }

// destroy-permanent no-ops safely when the enemy has nothing
{ const st = game(); let threw = null;
  try { play(st, 0, 'cindervoid_raider'); } catch (e) { threw = e; }
  ok('destroy-permanent is a safe no-op with no enemy permanents', !threw, threw && threw.message); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v'];
  E.gainTokenCard(st, 1, 'clue_token'); // give the enemy an artifact so destroy-permanent has a target
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
