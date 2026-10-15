// Pokermon zotherjokers (the non-Pokédex jokers): every joker fired through real plays (act).
//   node micatro/tests/mods/zotherjokers_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { smods_create_card } from '../../mods/pokermon/systems/utils.js';
import { type_sticker_applied } from '../../mods/pokermon/systems/types.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FILE_JOKERS = ['pokedex', 'rotomdex', 'everstone', 'tall_grass', 'jelly_donut', 'treasure_eatery', 'mystery_egg', 'rival', 'ruins_of_alph', 'unown_swarm', 'professor', 'billion_lions'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 12 zotherjokers ported');
ok(STATUS.PORTED_FILES['pokemon/zotherjokers.lua'].length === 12, 'defs: 12 from zotherjokers.lua');
const toShop = () => { winRound(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); };
const toBlind = () => { act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); };

// ---------------------------------------------------------------- Pokédex / Everstone
{
  start('DEX');
  add('j_poke_everstone');
  const y = add('j_poke_yamper');
  y.ability.extra.rounds = 1;
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.75), 'everstone: Basic joker X1.75', r.total);
  winRound();
  ok(key(y) === 'j_poke_yamper', 'everstone: no evolution');
  add('j_poke_pokedex');
  ok(P_CENTERS.j_poke_boltund.in_pool(P_CENTERS.j_poke_boltund), 'pokedex: same family may appear');
}

// ---------------------------------------------------------------- Rotom Dex
{
  start('ROTOMDEX');
  add('j_poke_yamper'); add('j_poke_nickit'); add('j_poke_boltund');
  add('j_poke_rotomdex');
  ok(G.GAME.rotom_discount === 2, 'rotomdex: 2 different types', G.GAME.rotom_discount);
  toShop();
  const pack = G.shop_booster.cards[0];
  const base = P_CENTERS[key(pack)].cost;
  ok(pack.cost === Math.max(0, base - 2), 'rotomdex: Booster Packs $1 cheaper per type', [base, pack.cost]);
  ok(P_CENTERS.j_poke_rotomdex.loc_vars(P_CENTERS.j_poke_rotomdex, [], G.jokers.cards[3]).vars[0] === 2, 'rotomdex loc_vars');
}

// ---------------------------------------------------------------- Tall Grass
{
  start('TALLGRASS');
  add('j_poke_tall_grass');
  play(hand(['S_A'], { center: 'm_wild' }));
  const made = G.jokers.cards.filter((c) => key(c) !== 'j_poke_tall_grass');
  ok(made.length === 1 && made[0].config.center.stage && made[0].config.center.rarity === 1, 'tall grass: a scoring Wild card guarantees a common Pokémon', made.map(key));
  let more = 0;
  for (let i = 0; i < 12; i++) { const n = G.jokers.cards.length; play(hand(['S_K'])); if (G.jokers.cards.length > n) more++; if (G.jokers.cards.length >= 5) break; }
  ok(more >= 1, 'tall grass: 1 in 2 otherwise', more);
  const n = G.jokers.cards.length;
  G.jokers.config.card_limit = n;
  play(hand(['S_A'], { center: 'm_wild' }));
  ok(G.jokers.cards.length === n, 'tall grass: needs room');
}

// ---------------------------------------------------------------- Jelly Donut
{
  start('JELLY', {}, { noBlind: true });
  const j = add('j_poke_jelly_donut');
  act({ type: 'select_blind' }); clearHand();
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_poke_colorless_energy' && j.ability.extra.rounds === 3, 'jelly donut: a Colorless Energy each blind');
  for (let i = 0; i < 3; i++) { toShop(); toBlind(); }
  ok(!G.jokers.cards.includes(j) && j.removed, 'jelly donut: eaten after 4 blinds');
  ok(G.consumeables.cards.length === 2, 'jelly donut: no room -> no energy', G.consumeables.cards.length);
}

// ---------------------------------------------------------------- Treasure Eatery
{
  start('EATERY', {}, { noBlind: true });
  const left = add('j_poke_yamper');
  const j = add('j_poke_treasure_eatery');
  add('j_poke_nickit');
  act({ type: 'select_blind' }); clearHand();
  ok(type_sticker_applied(left) === 'Dark' && left.ability.extra.ptype === 'Dark', 'treasure eatery: leftmost joker takes the rightmost joker\'s type', type_sticker_applied(left));
  for (let i = 0; i < 3; i++) { toShop(); toBlind(); }
  ok(!G.jokers.cards.includes(j), 'treasure eatery: closes after 4 blinds');
}

// ---------------------------------------------------------------- Mystery Egg
{
  start('EGG');
  const j = add('j_poke_mystery_egg');
  const target = j.ability.extra.key;
  const tc = P_CENTERS[target];
  ok(tc && (tc.stage === 'Basic' || tc.stage === 'Baby') && !tc.unported && typeof tc.rarity === 'number' && tc.rarity !== 4, 'mystery egg: holds a Basic/Baby Pokémon', target);
  const rounds = j.ability.extra.rounds;
  ok(rounds === (tc.rarity === 1 ? 2 : tc.rarity === 3 ? 3 : rounds) && rounds >= 2 && rounds <= 3, 'mystery egg: 2-3 rounds by rarity', [tc.rarity, rounds]);
  let w = winRound();
  ok(j.ability.extra.rounds === rounds - 1 && statusMsgs(w.events).length >= 1, 'mystery egg: shakes', j.ability.extra.rounds);
  for (let i = 0; i < 3 && G.jokers.cards.includes(j); i++) { nextRound(); w = winRound(); }
  const hatched = G.jokers.cards.find((c) => key(c) === target);
  ok(!G.jokers.cards.includes(j) && hatched, 'mystery egg hatches into its Pokémon', G.jokers.cards.map(key));
  ok(hatched && (hatched.ability.extra.energy_count || 0) === 1, 'mystery egg: the hatchling is Energized', hatched && hatched.ability.extra);
}
{
  // An adjacent Flame Body / Magma Armor Pokémon speeds it up.
  start('EGG2');
  const j = add('j_poke_mystery_egg');
  add('j_poke_charcadet');
  j.ability.extra.rounds = 3;
  winRound();
  ok(j.ability.extra.rounds === 3 - 1 - 0.25 || j.ability.extra.rounds === 3 - 2 - 0.25, 'mystery egg: a hatching helper next to it', j.ability.extra.rounds);
}

// ---------------------------------------------------------------- Rival
{
  start('RIVAL');
  const j = add('j_poke_rival');
  ok(j.ability.extra.form === 0 && G.GAME.rival_losses === 0, 'rival: form 0');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 11, 'rival: +10 Mult', r.total);
  winRound();
  ok(G.jokers.cards.includes(j), 'rival: a close win does not beat it');
  nextRound();
  const d0 = G.GAME.dollars;
  G.GAME.chips = G.GAME.blind.chips * 2;
  clearHand();
  const w = play(hand(['S_2']), { keepChips: true });
  ok(G.GAME.rival_losses === 1 && !G.jokers.cards.includes(j) && statusMsgs(w.events).length >= 1, 'rival: 2X the blind -> smell ya later', G.GAME.rival_losses);
  ok(G.GAME.dollars - d0 >= 5, 'rival: pays $5');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const b = add('j_poke_rival');
  ok(b.ability.extra.form === 1 && P_CENTERS.j_poke_rival.loc_vars(P_CENTERS.j_poke_rival, [], b).key === 'j_poke_bitter_rival', 'rival: comes back as Bitter Rival');
  r = play(hand(['S_A']));
  ok(r.total.mult === 21, 'bitter rival: +20 Mult', r.total);
  G.GAME.chips = G.GAME.blind.chips * 2;
  clearHand();
  play(hand(['S_2']), { keepChips: true });
  ok(G.jokers.cards.includes(b), 'bitter rival: needs 3X the blind');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  G.GAME.chips = G.GAME.blind.chips * 3;
  clearHand();
  play(hand(['S_2']), { keepChips: true });
  ok(!G.jokers.cards.includes(b) && G.GAME.rival_losses === 2, 'bitter rival beaten at 3X');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  add('j_poke_rival');
  r = play(hand(['S_A']));
  ok(r.total.mult === 3, 'champion: X3 Mult', r.total);
}

// ---------------------------------------------------------------- Ruins of Alph + Unown Swarm
{
  start('RUINS', {}, { noBlind: true });
  const j = add('j_poke_ruins_of_alph');
  act({ type: 'select_blind' }); clearHand();
  const unowns = G.jokers.cards.filter((c) => key(c) === 'j_poke_unown');
  ok(unowns.length === 3 && unowns.every((u) => u.edition && u.edition.negative && u.sell_cost === 0), 'ruins of alph: 3 Negative Unown on blind select', unowns.map((u) => [u.edition, u.sell_cost]));
  unowns[0].ability.extra.triggered = true;
  unowns[0].ability.extra.form = unowns[0].ability.extra.form || 'Q';
  play(hand(['S_A']));
  ok(j.ability.extra.merged === 1 && j.ability.extra.mult === 2 && j.ability.extra.forms.length === 1 && unowns[0].ability.extra.merged === true, 'ruins of alph: merges a triggered Unown (+2 Mult)', j.ability.extra);
  const r = play(hand(['S_A']));
  ok(r.total.mult >= 3, 'ruins of alph: +2 Mult scored', r.total);
}
const sellRuins = (merged) => {
  start('RUINS' + merged);
  const j = add('j_poke_ruins_of_alph');
  const other = add('j_poke_yamper');
  j.ability.extra.merged = merged;
  const before = G.jokers.cards.map(key);
  act({ type: 'sell', id: j.sort_id });
  return { before, after: G.jokers.cards.map(key), other };
};
{
  let s = sellRuins(5);
  ok(s.after.length === 2 && P_CENTERS[s.after[1]].rarity === 'poke_safari', 'ruins of alph (5): a Safari Pokémon', s.after);
  s = sellRuins(10);
  ok(s.after.length === 2 && s.after[1] === 'j_poke_yamper', 'ruins of alph (10): copies a joker', s.after);
  s = sellRuins(20);
  ok(s.after.includes('j_brainstorm'), 'ruins of alph (20): Brainstorm', s.after);
  s = sellRuins(28);
  ok(s.after.includes('j_poke_unown_swarm') && G.consumeables.cards.some((c) => key(c) === 'c_soul'), 'ruins of alph (28): Unown Swarm + The Soul', s.after);
  s = sellRuins(4);
  ok(s.after.length === 1, 'ruins of alph (<5): nothing');
}
{
  start('SWARM');
  add('j_poke_unown_swarm');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'unown swarm: nothing without a Legendary', r.total);
  const leg = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_poke_billion_lions' });
  leg.add_to_deck(); G.jokers.emplace(leg);
  r = play(hand(['S_A']));
  // Billion Lions X1 itself; the swarm gives +28 Mult and X2.8 for it.
  ok(near(r.total.mult, (1 + 28) * 2.8), 'unown swarm: Legendary jokers give +28 Mult X2.8', r.total);
}

// ---------------------------------------------------------------- Professor
{
  start('PROFESSOR');
  const j = add('j_poke_professor');
  let w = winRound();
  ok(j.ability.extra.rounds_current === 1 && statusMsgs(w.events).includes('1/2'), 'professor: 1/2', statusMsgs(w.events));
  act({ type: 'sell', id: j.sort_id });
  ok(!G.GAME.tags.some((t) => t.key === 'tag_poke_starter_tag'), 'professor: sold early -> nothing');
  start('PROFESSOR2');
  const p = add('j_poke_professor');
  winRound(); nextRound(); w = winRound();
  ok(p.ability.extra.rounds_current === 2, 'professor: 2/2 -> active');
  act({ type: 'sell', id: p.sort_id });
  ok(G.GAME.tags.some((t) => t.key === 'tag_poke_starter_tag'), 'professor: sold after 2 rounds -> Starter Tag');
}

// ---------------------------------------------------------------- A Billion Lions (April Fools)
{
  start('LIONS', {}, { noBlind: true });
  ok(!P_CENTERS.j_poke_billion_lions.in_pool(P_CENTERS.j_poke_billion_lions), 'billion lions: off without the joke option');
  const l = add('j_poke_billion_lions');
  add('j_poke_yamper'); add('j_poke_nickit');
  const e = add('j_poke_boltund'); e.set_eternal(true);
  act({ type: 'select_blind' }); clearHand();
  ok(G.jokers.cards.length === 2 && l.ability.extra.Xmult === 3 && l.ability.extra.lions === 1e9 - 2, 'billion lions: eats the typed jokers (not eternal), +X1 each', [G.jokers.cards.map(key), l.ability.extra]);
  const r = play(hand(['S_A']));
  ok(r.total.mult === 3, 'billion lions: X3', r.total);
  start('LIONS2', { pokemon_aprilfools: true }, { noBlind: true });
  ok(P_CENTERS.j_poke_billion_lions.in_pool(P_CENTERS.j_poke_billion_lions), 'billion lions: offered with the joke option');
}

done();
