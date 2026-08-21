// paper_artifacts_test.mjs — the rescanned paper imports: creature-equipment
// (incl. the new equip.spellDamage), artifact tap/trigger abilities, a tribe-
// filtered graveyard return, Dredge, Tradeable, and the Farscape Fiend keyword fix.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { staticValue } from '../../engine/auras.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const NEW = ['soulstealer_axe', 'robe_of_stars', 'vulshok_wand', 'key_to_the_archive',
  'creation_station', 'polygraph_orb', 'jar_of_astral_flora', 'farscape_fiend', 'bedraggled_toucan'];
for (const id of NEW) {
  const c = byId[id];
  ok(`${id} exists`, !!c, id);
  ok(`${id} is a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2,
    [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const putBoard = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
byId._beast = { id: '_beast', name: 'Vanilla Beast', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._drake = { id: '_drake', name: 'Vanilla Drake', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Dragon' };
byId._arcane = { id: '_arcane', name: 'Zap', type: 'sorcery', cost: 1, rarity: 'common', tribe: 'Arcane', effects: [{ type: 'damage', value: 1, target: 'any' }] };

// --- equipment: attach grants stats + keywords, and Vulshok grants spell damage while equipped ---
{
  const st = game();
  const bear = putBoard(st, 0, '_beast');
  const wand = E.instantiate(byId.vulshok_wand, 0); wand.zone = 'artifact'; st.players[0].artifacts.push(wand);
  ok('spell damage is 0 before equipping', staticValue(st.players[0], 'spell-damage') === 0);
  wand.attachedTo = bear.uid; E.recomputeAuras(st);
  ok('Vulshok Wand grants +0/+3 to the holder', bear.maxHealth - byId._beast.health === 3, bear.maxHealth);
  ok('Vulshok Wand grants Hexproof (elusive)', (bear.keywords || []).includes('elusive'));
  ok('Vulshok Wand grants Spell Damage +2 WHILE equipped', staticValue(st.players[0], 'spell-damage') === 2, staticValue(st.players[0], 'spell-damage'));
  wand.attachedTo = null; E.recomputeAuras(st);
  ok('spell damage returns to 0 when unequipped', staticValue(st.players[0], 'spell-damage') === 0);

  const axe = E.instantiate(byId.soulstealer_axe, 0); st.players[0].artifacts.push(axe); axe.attachedTo = bear.uid; E.recomputeAuras(st);
  ok('Soulstealer Axe grants Trample & Lifesteal', ['trample', 'lifesteal'].every(k => (bear.keywords || []).includes(k)), bear.keywords);
}

// --- Bedraggled Toucan: battlecry returns a BEAST (not a Dragon) from graveyard ---
{
  const st = game();
  st.players[0].graveyard = [E.instantiate(byId._drake, 0), E.instantiate(byId._beast, 0)];
  const toucan = E.instantiate(byId.bedraggled_toucan, 0); toucan.zone = 'hand'; st.players[0].hand.push(toucan);
  E.playCard(st, 0, toucan.uid, null);
  const returned = st.players[0].hand.filter(c => c.id === '_beast');
  ok('Toucan battlecry returns a Beast from the graveyard', returned.length === 1, st.players[0].hand.map(c => c.id));
  ok('Toucan battlecry does NOT return the non-Beast', !st.players[0].hand.some(c => c.id === '_drake'));
  ok('Toucan carries Deathrattle: Dredge', JSON.stringify(byId.bedraggled_toucan.deathrattle) === JSON.stringify([{ type: 'dredge' }]));
  ok('state valid after Toucan', (validateGameState(st) || []).length === 0, validateGameState(st));
}

// --- Farscape Fiend: the keyword fix (Lifesteal & Hexproof actually granted) + Tradeable ---
{
  ok('Farscape Fiend keywords now include lifesteal + elusive', ['lifesteal', 'elusive'].every(k => (byId.farscape_fiend.keywords || []).includes(k)), byId.farscape_fiend.keywords);
  ok('Farscape Fiend is Tradeable', byId.farscape_fiend.tradeable === true);
}

// --- Jar of Astral Flora: casting an Arcane spell -> Scry 2 ---
{
  const st = game();
  st.players[0].deck = ['_beast', '_drake', '_beast', '_drake'];
  const jar = E.instantiate(byId.jar_of_astral_flora, 0); jar.zone = 'artifact'; st.players[0].artifacts.push(jar);
  const scry0 = st.scryQueue.length;
  fireOngoing(st, 0, 'spell-played', { played: byId._arcane });
  ok('Jar of Astral Flora scries when you cast an Arcane spell', st.scryQueue.length > scry0, st.scryQueue.length);
}

// --- Creation Station: Alliance (play a creature) -> Investigate ---
{
  const st = game();
  const cs = E.instantiate(byId.creation_station, 0); cs.zone = 'artifact'; st.players[0].artifacts.push(cs);
  const clues0 = st.players[0].artifacts.filter(a => a.id === 'clue_token').length;
  fireOngoing(st, 0, 'creature-played', { minion: E.instantiate(byId._beast, 0) });
  ok('Creation Station Alliance makes a Clue when you play a creature', st.players[0].artifacts.filter(a => a.id === 'clue_token').length === clues0 + 1);
}

// --- play-without-throw + valid-state sweep for every new card ---
for (const id of NEW) {
  let threw = null; const st = game();
  st.players[0].deck = ['_beast', '_drake', '_beast'];
  try {
    const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst);
    E.playCard(st, 0, inst.uid, null);
  } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st);
  ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
