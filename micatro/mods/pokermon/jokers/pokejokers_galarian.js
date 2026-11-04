// The owner's regional forms, batch B: the 19 Galarian forms ("yes", 2026-11-03; Pokermon regional batch B, contentRev GALAR_FORMS_REV;
// PORTING.md "Regional batch B"; DESIGN_GUIDE.txt 2.1 "REGIONAL FORMS"). Micatro's own designs. Upstream Pokermon 3.9.1 draws all of them but
// one on its Gen 1 / 2 / 3 / 5 sheets (pokespriteload.lua galarian_*: AtlasJokersBasicGen01 {10,4}-{13,5}, Gen02 {6,4} {8,4}, Gen03 {8,7}
// {10,7}, Gen05 {10,7} {0,8} {4,8} {6,8}) but registers none; nothing to deploy. Galarian Darmanitan's Zen Mode is drawn too, UNLISTED in
// pokespriteload.lua beside its Standard Mode card: Gen05 {2,8} (+ its Shiny twin; the overworld battle sprite's Pokémon, a Water card like
// its Standard Mode), so it takes that upstream card (the owner's "upstream first") rather than a composed one. Types from the card art
// (owner rule; tools/micatro/pokermon_art_type.mjs).
//
// Three shapes (the forms audit's patterns 1 and 2):
//   - OWN LINES with their own pool entries beside the Kanto / Johto / Hoenn / Unova originals, on the spec's slots (a 2-stage line C $5 /
//     S $8, the 3-stage Zigzagoon line U $6 / S $8, a single Basic Rare $7 / $8, the birds Legendary $20): Ponyta -> Rapidash, Slowpoke ->
//     Slowbro / Slowking, Zigzagoon -> Linoone, Darumaka -> Darmanitan, and the single Farfetch'd, Mr. Mime, Corsola, Yamask, Stunfisk and the
//     three birds. A Kanto joker never blocks its Galarian form in the shop, nor the other way round (their own families).
//   - NATURAL EVOLUTIONS into the existing Galarian evolutions (Gen 8 batch 3, r72): Galarian Linoone -> Obstagoon (5 rounds), Galarian
//     Farfetch'd -> Sirfetch'd (3 Lucky triggers in a round: pokejokers_03.js farfetchd_lucky), Galarian Corsola -> Cursola (a Psychic Energy:
//     systems/energy.js energy_evo_target), Galarian Mr. Mime -> Mr. Rime (5 rounds), Galarian Yamask -> Runerigus (10 Stone cards scored:
//     RUNERIGUS_STONES). Each Galarian line is its own family sharing the existing final (GALARIAN_OWN_FAMILIES, pushed as is: the final's
//     own lookups keep its Kanto line). The Kanto Energy paths of PR #940 are unchanged.
//   - A BRANCH of a Kanto Basic: Koffing -> Galarian Weezing, a Fairy Energy used on it (energize first, then evolve; refused while debuffed or
//     with an Everstone; gated by rulesRev GALAR_FORMS_REV, so runs recorded before it replay as recorded). Its Kanto Weezing path is
//     unchanged.
// Every one shows the "Galarian" region pill before its type pill (systems/types.js region_badge, from the key).
// Energy at the standard shares (`mult` +40%, `Xmult` / `Xmult2` / `Xmult_mod` / `mult_mod` +20%, `Xmult_multi` +5%); fixed: odds,
// retriggers, discards. Banks take no Energy (never retroactive) and carry through evolution.
// Generation = the base species' (the generation-filter rule): Slowking 2, Corsola 2, Zigzagoon / Linoone 3, Darumaka / Darmanitan / Yamask /
// Stunfisk 5, the rest 1.
import {
  G, P_CENTERS, card_eval_status_text, localize, pseudoseed, pseudorandom_element, defineJokers, type_tooltip, level_evo, scaling_evo,
  has_enhancement, get_probability_vars, pseudorandom_probability, can_evolve, ease_discard, GALAR_FORMS_REV,
} from '../api.js';
import { farfetchd_lucky, farfetchd_lucky_count, SIRFETCH_LUCKY } from './pokejokers_03.js';
import { RUNERIGUS_STONES } from './pokejokers_designs.js';

const FILE = 'micatro/pokejokers_galarian';
const sprite = (sheet, x, y, soul) => ({ atlas: 'AtlasJokersBasic' + sheet, pos: { x, y }, ...(soul ? { soul_pos: { x: soul[0], y: soul[1] } } : {}) });
const r3 = (x) => Math.round(x * 1000) / 1000;
const r9 = (x) => Math.round(x * 1e9) / 1e9;
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
const scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff);
const held = (context) => !!(context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff);
const retrigger_play = (context) => !!(context.repetition && context.cardarea === G.play && context.other_card && !context.other_card.debuff);
const xmain = (x) => ({ message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x });

// ------------------------------------------------------------ shared bodies
/** The round's FINAL hand: while it scores, no hand is left (current_round.hands_left is taken before the jokers score: Kanto Slowpoke's
 *  read). For the card's face and tooltip (no hand scoring), "the next hand is the final one": in a round with at most 1 hand left. */
const final_hand = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left === 0);
const final_next = () => !!(G.GAME && G.GAME.facing_blind && G.GAME.current_round && G.GAME.current_round.hands_left <= 1);
const final_state = () => (final_next() ? 'Final hand!' : 'Not the final hand');
/** A Lucky card trigger (its Mult roll and its money roll each count: lucky_procs, as Sirfetch'd and Farfetch'd count them). */
const lucky_procs = (c) => (c.lucky_trigger ? Math.max(1, c.lucky_procs || 0) : 0);
const lucky_hit = (context) => scored(context) && !!context.other_card.lucky_trigger;
/** The two rolls of a Lucky card (Super Luck's identifiers): 'lucky_mult' 1 in 5, 'lucky_money' 1 in 15. */
const LUCKY_ROLLS = ['lucky_mult', 'lucky_money'];
/** Galarian Ponyta, Pastel Veil: a Lucky card's Mult roll always hits (the mod_probability pass: the numerator raised to the denominator, so
 *  Oops! All 6s changes nothing and an Absol, which fixes the odds at 0, still wins). Never Blueprint. */
function pastel_veil(card, context) {
  if (context.mod_probability && !context.blueprint && context.identifier === 'lucky_mult') return { numerator: Math.max(context.numerator, context.denominator) };
  return undefined;
}
/** Galarian Rapidash, Pastel Veil: both of a Lucky card's rolls have their numerator DOUBLED (Oops! All 6s's shape on Lucky cards only, in
 *  the same mod_probability pass: two Rapidash x4, and Oops! doubles again after; Super Luck's +1 adds where it stands in the row, left to
 *  right). Never Blueprint. */
function lucky_double(card, context) {
  if (context.mod_probability && !context.blueprint && LUCKY_ROLLS.includes(context.identifier)) return { numerator: context.numerator * 2 };
  return undefined;
}
/** The Lucky odds now ([Mult num, dem, money num, dem]), as the tooltip shows them: a Rapidash not held yet (the shop) counts its own doubling,
 *  and a sure roll reads "N in N" (Ponyta's raise, doubled, is still a sure thing). */
function lucky_vars(card) {
  const own = G.jokers && G.jokers.cards.includes(card) ? 1 : 2;
  const v = [...get_probability_vars(card, own, 5, 'lucky_mult'), ...get_probability_vars(card, own, 15, 'lucky_money')];
  return [Math.min(v[0], v[1]), v[1], Math.min(v[2], v[3]), v[3]].map(r3);
}

/** Galarian Slowpoke: every Slowpoke of yours (Kanto or Galarian), left to right. */
const slowpokes = () => ((G.jokers && G.jokers.cards) || []).filter((j) => ['j_poke_slowpoke', 'j_poke_galarian_slowpoke'].includes(j.config.center.key));
/** Galarian Slowpoke's branch (Charizard's Mega X / Y by position, systems/items.js getMega_by_position): Galarian Slowbro when it is the
 *  LEFTMOST of your Slowpokes, Galarian Slowking when the RIGHTMOST; alone (or between two others) a seeded pick ('galarian_slowpoke'). */
function slow_branch(card) {
  const s = slowpokes(), i = s.indexOf(card);
  if (s.length > 1 && i === 0) return 'j_poke_galarian_slowbro';
  if (s.length > 1 && i === s.length - 1) return 'j_poke_galarian_slowking';
  return pseudorandom_element(['j_poke_galarian_slowbro', 'j_poke_galarian_slowking'], pseudoseed('galarian_slowpoke'))[0];
}
const slow_branch_text = (card) => {
  const s = slowpokes(), i = s.indexOf(card);
  if (s.length > 1 && i === 0) return 'Slowbro: leftmost';
  if (s.length > 1 && i === s.length - 1) return 'Slowking: rightmost';
  return 'random';
};
/** Galarian Slowpoke's bank: +mult_mod Mult (`slow_mult`, no Energy field) in the main end-of-round pass (not Blueprint), BEFORE its countdown
 *  (so the round it evolves in still banks). Given every hand; kept by Slowbro and Slowking (they bank no more). */
function slow_bank(card, context) {
  if (!(context.end_of_round && !context.individual && !context.repetition && !context.blueprint && !card.debuff)) return;
  const ex = card.ability.extra;
  ex.slow_mult = r9((ex.slow_mult || 0) + ex.mult_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: a_mult(r3(ex.slow_mult)), colour: 'MULT' });
}
const slow_main = (card) => { const m = card.ability.extra.slow_mult || 0; return m > 0 ? { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m } : undefined; };
/** Galarian Slowbro, Quick Draw: once per hand (`before`, not Blueprint) a 1 in 3 roll ('galarian_slowbro'; Oops! All 6s doubles it); a hit
 *  retriggers EVERY scored card of that hand once (`quick_hand` = the run's hand number). */
function quick_draw(card, context) {
  const ex = card.ability.extra;
  if (context.before && !context.blueprint && !context.retrigger_joker) {
    ex.quick_hand = pseudorandom_probability(card, 'galarian_slowbro', ex.quick_num, ex.quick_dem, 'galarian_slowbro') ? G.GAME.hands_played : -1;
    if (ex.quick_hand === G.GAME.hands_played) card_eval_status_text(card, 'extra', null, null, null, { message: 'Quick Draw!', colour: 'GREEN' });
    return true;
  }
  return false;
}
/** Galarian Slowking, Curious Medicine: each Spectral card used (not Blueprint) permanently adds Xmult_mod (`med_Xmult`, from X1). */
function curious_medicine(card, context) {
  if (!context.using_consumeable || context.blueprint || !context.consumeable || context.consumeable.ability.set !== 'Spectral') return false;
  const ex = card.ability.extra;
  ex.med_Xmult = r9((ex.med_Xmult || 1) + ex.Xmult_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(r3(ex.med_Xmult)), colour: 'XMULT' });
  return true;
}
/** Galarian Weezing, Neutralizing Gas: when a Blind is selected (once a round, not Blueprint) one Hazard card of your full deck (a seeded pick,
 *  'galarian_weezing') loses its enhancement (a plain card now) and the bank `gas_Xmult` (from 0, no Energy field) gains Xmult_mod. No Hazard
 *  card: nothing. */
function neutralize(card, context) {
  if (!context.setting_blind || context.blueprint || card.getting_sliced) return false;
  const ex = card.ability.extra;
  if (ex.gas_round === G.GAME.round) return true;
  const hz = (G.playing_cards || []).filter((c) => !c.destroyed && !c.shattered && !c.removed && has_enhancement(c, 'm_poke_hazard'));
  if (!hz.length) return true;
  ex.gas_round = G.GAME.round;
  const [target] = pseudorandom_element(hz, pseudoseed('galarian_weezing'));
  target.set_ability(P_CENTERS.c_base, null, true);
  ex.gas_Xmult = r9((ex.gas_Xmult || 0) + ex.Xmult_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Neutralized!', colour: 'PURPLE' });
  return true;
}
const gas_x = (card) => r9(card.ability.extra.Xmult + (card.ability.extra.gas_Xmult || 0));
const hazards_in_deck = () => (G.playing_cards || []).filter((c) => !c.destroyed && !c.shattered && !c.removed && has_enhancement(c, 'm_poke_hazard')).length;
/** Galarian Corsola, Cursed Body: a playing card of your deck destroyed (any way: a shattered Glass, The Hanged Man, a devouring joker...)
 *  while an undebuffed Galarian Corsola is held gives each one +Xmult_mod on its bank `curse_Xmult` (from X1, no Energy field). Called by
 *  index.js's card_removed hook (beside poke_card_destroyed); from GALAR_FORMS_REV on. */
export function galarian_corsola_destroyed(card) {
  if (!G.GAME || !G.jokers || !G.playing_cards || !card || !G.playing_cards.includes(card)) return;
  for (const j of G.jokers.cards) {
    if (j.config.center.key !== 'j_poke_galarian_corsola' || j.debuff || j.removed) continue;
    const ex = j.ability.extra;
    ex.curse_Xmult = r9((ex.curse_Xmult || 1) + ex.Xmult_mod);
    card_eval_status_text(j, 'extra', null, null, null, { message: a_xmult(r3(ex.curse_Xmult)), colour: 'XMULT' });
  }
}
/** Galarian Darumaka / Darmanitan, Gorilla Tactics: the played poker hand is your MOST-PLAYED hand (G.GAME.hands[].played, this hand already
 *  counted; a tie for the most counts). */
function most_played(name) {
  const hs = (G.GAME && G.GAME.hands) || {};
  if (!name || !hs[name]) return false;
  const top = Math.max(...Object.values(hs).map((h) => h.played || 0));
  return (hs[name].played || 0) >= top && top > 0;
}
/** The most-played hand(s) now, for the tooltip. */
function most_played_text() {
  const hs = (G.GAME && G.GAME.hands) || {};
  const top = Math.max(0, ...Object.values(hs).map((h) => h.played || 0));
  if (!top) return 'none yet';
  const names = Object.entries(hs).filter(([, h]) => (h.played || 0) === top).map(([k]) => localize(k, 'poker_hands'));
  return names.length > 2 ? names.slice(0, 2).join(', ') + ', ...' : names.join(', ');
}
/** Galarian Yamask: the Stone cards scored while it is held (counted once per hand in `before`, from the scoring hand; not Blueprint). */
function stone_count(card, context) {
  if (!(context.before && context.scoring_hand && !context.blueprint && !context.retrigger_joker)) return;
  const n = context.scoring_hand.filter((c) => has_enhancement(c, 'm_stone')).length;
  if (n) card.ability.extra.stones_scored = (card.ability.extra.stones_scored || 0) + n;
}
/** Galarian Stunfisk, Snap Trap: your FIRST discard of the round (a player's discard: not The Hook's; once a round, not Blueprint) gives the
 *  discard back as it is used (ease_discard +1 before the discard's own -1: discards left stay the same; discards_used still counts it). */
function snap_trap(card, context) {
  if (!context.pre_discard || context.hook || context.blueprint || card.debuff) return false;
  const ex = card.ability.extra, cr = G.GAME.current_round;
  if ((cr.discards_used || 0) > 0 || ex.snap_round === G.GAME.round) return true;
  ex.snap_round = G.GAME.round;
  ease_discard(1);
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Snap Trap!', colour: 'RED' });
  return true;
}
const snap_state = (card) => (G.GAME && G.GAME.facing_blind && (card.ability.extra.snap_round === G.GAME.round || (G.GAME.current_round.discards_used || 0) > 0) ? 'used this round' : 'ready');
const d_size = {
  add_to_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size; ease_discard(card.ability.extra.d_size); },
  remove_from_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size; ease_discard(-card.ability.extra.d_size); },
};

defineJokers({
  // Galarian Ponyta (Psychic; a 2-stage line's Basic, Common $5), Pastel Veil: scored Lucky cards always trigger their Mult. It carries
  // Rapidash's `Xmult_multi` ("Energy carries to Galarian Rapidash"). 5 rounds.
  galarian_ponyta: {
    name: 'galarian_ponyta', poke_sprite391: sprite('Gen01', 10, 4),
    config: { extra: { Xmult_multi: 1.2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 1, blueprint_compat: false, poke_region: 'galarian',
    attributes: ['enhancements', 'lucky', 'chance', 'round_evo'], poke_after: 'rapidash',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) { return pastel_veil(card, context) || level_evo(self, card, context, 'j_poke_galarian_rapidash'); },
  },
  // Galarian Rapidash (Safari $8), Pastel Veil: Lucky cards' odds are doubled, and each Lucky trigger gives X1.2 (`Xmult_multi` +5%: 1.26 /
  // 1.32 / 1.38; a card whose both rolls hit gives it twice).
  galarian_rapidash: {
    name: 'galarian_rapidash', poke_sprite391: sprite('Gen01', 12, 4),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 1, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['xmult', 'enhancements', 'lucky', 'chance'], poke_after: 'galarian_ponyta',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: [r3(card.ability.extra.Xmult_multi), ...lucky_vars(card)] }; },
    calculate(self, card, context) {
      const r = lucky_double(card, context);
      if (r) return r;
      if (lucky_hit(context)) return { x_mult: r9(card.ability.extra.Xmult_multi ** lucky_procs(context.other_card)), card };
      return undefined;
    },
  },
  // Galarian Slowpoke (Psychic; Common $5): permanently gains +1 Mult each round (`slow_mult`, the bank; its gain `mult_mod` +20%: 1.2 / 1.4 /
  // 1.6). After 5 rounds it evolves by position (slow_branch). It carries Slowking's `Xmult_mod`.
  galarian_slowpoke: {
    name: 'galarian_slowpoke', poke_sprite391: sprite('Gen01', 14, 4),
    config: { extra: { slow_mult: 0, mult_mod: 1, Xmult_mod: 0.25, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 1, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['mult', 'scaling', 'position', 'round_evo'], poke_after: 'mega_slowbro',
    poke_custom_values_to_keep: ['slow_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.slow_mult || 0), ex.rounds, slow_branch_text(card)] }; },
    calculate(self, card, context) {
      slow_bank(card, context);
      if (context.joker_main) return slow_main(card);
      // (the branch is read only in the pass that counts down, where it may evolve: its seeded pick is this joker's own stream)
      const key = can_evolve(self, card, context, 'j_poke_galarian_slowbro') && !card.debuff && card.ability.extra.rounds <= 1 ? slow_branch(card) : 'j_poke_galarian_slowbro';
      return level_evo(self, card, context, key);
    },
  },
  // Galarian Slowbro (Dark; Safari $8), Quick Draw: each hand, a 1 in 3 chance (fixed; Oops! doubles it) to retrigger every scored card; it
  // keeps Slowpoke's banked Mult (given each hand; it banks no more). No Energy field: Energy-inert.
  galarian_slowbro: {
    name: 'galarian_slowbro', poke_sprite391: sprite('Gen01', 0, 5),
    config: { extra: { slow_mult: 0, quick_num: 1, quick_dem: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 1, blueprint_compat: true, poke_region: 'galarian', poke_no_energy_field: true,
    attributes: ['mult', 'retrigger', 'chance'], poke_after: 'galarian_slowpoke',
    poke_custom_values_to_keep: ['slow_mult'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.quick_num, ex.quick_dem, 'galarian_slowbro');
      return { vars: [num, dem, r3(ex.slow_mult || 0)] };
    },
    calculate(self, card, context) {
      if (quick_draw(card, context)) return undefined;
      if (retrigger_play(context) && card.ability.extra.quick_hand === G.GAME.hands_played) return { message: localize('k_again_ex'), repetitions: 1, card };
      if (context.joker_main) return slow_main(card);
      return undefined;
    },
  },
  // Galarian Slowking (Dark; Safari $8), Curious Medicine: permanently gains X0.25 per Spectral card used (`med_Xmult` from X1; the gain
  // `Xmult_mod` +20%: 0.3 / 0.35 / 0.4); keeps Slowpoke's banked Mult (given each hand).
  galarian_slowking: {
    name: 'galarian_slowking', poke_sprite391: sprite('Gen02', 6, 4),
    config: { extra: { slow_mult: 0, med_Xmult: 1, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 2, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['mult', 'xmult', 'scaling', 'spectral'], poke_after: 'slowking',
    poke_custom_values_to_keep: ['slow_mult', 'med_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.med_Xmult || 1), r3(ex.slow_mult || 0)] }; },
    calculate(self, card, context) {
      if (curious_medicine(card, context)) return undefined;
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra, r = {};
      if ((ex.slow_mult || 0) > 0) r.mult_mod = ex.slow_mult;
      if ((ex.med_Xmult || 1) > 1) r.Xmult_mod = ex.med_Xmult;
      if (!Object.keys(r).length) return undefined;
      return { message: r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod)), colour: r.Xmult_mod ? 'XMULT' : 'MULT', ...r };
    },
  },
  // Galarian Farfetch'd (Fighting; Common $5): each Lucky card trigger gives +5 Mult (`mult` +40%: 7 / 9 / 11). It evolves into Sirfetch'd at
  // the end of a round with SIRFETCH_LUCKY (3) Lucky triggers while held (Farfetch'd's own rule, pokejokers_03.js farfetchd_lucky).
  galarian_farfetchd: {
    name: 'galarian_farfetchd', poke_sprite391: sprite('Gen01', 2, 5),
    config: { extra: { mult: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 1, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['mult', 'enhancements', 'lucky'], poke_after: 'farfetchd',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: [r3(card.ability.extra.mult), farfetchd_lucky_count(card), SIRFETCH_LUCKY] }; },
    calculate(self, card, context) {
      if (lucky_hit(context)) { farfetchd_lucky(self, card, context); return { mult: r9(card.ability.extra.mult * lucky_procs(context.other_card)), card }; }
      return farfetchd_lucky(self, card, context);
    },
  },
  // Galarian Weezing (Fairy; Safari $8; a Fairy Energy used on Koffing), Neutralizing Gas: X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); when a Blind
  // is selected, one Hazard card of your deck loses its enhancement and it permanently gains X0.1 (`gas_Xmult`; its gain `Xmult_mod` +20%).
  galarian_weezing: {
    name: 'galarian_weezing', poke_sprite391: sprite('Gen01', 4, 5),
    config: { extra: { Xmult: 1.5, gas_Xmult: 0, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 1, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['xmult', 'scaling', 'hazard', 'modify_card'], poke_after: 'weezing',
    poke_custom_values_to_keep: ['gas_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); if (P_CENTERS.m_poke_hazard) info_queue.push(P_CENTERS.m_poke_hazard); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), r3(gas_x(card)), hazards_in_deck()] }; },
    calculate(self, card, context) {
      if (neutralize(card, context)) return undefined;
      if (context.joker_main) return xmain(gas_x(card));
      return undefined;
    },
  },
  // Galarian Mr. Mime (Water; Kanto Mr. Mime's slot, Rare $8): each Glass card held in hand gives +10 Mult (h_mult, Baron's shape; `mult`
  // +40%: 14 / 18 / 22). Evolves into Mr. Rime after 5 rounds.
  galarian_mrmime: {
    name: 'galarian_mrmime', poke_sprite391: sprite('Gen01', 6, 5),
    config: { extra: { mult: 10, rounds: 5 } },
    rarity: 3, cost: 8, stage: 'Basic', ptype: 'Water', gen: 1, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['mult', 'enhancements', 'glass', 'hand_held', 'round_evo'], poke_after: 'mrmime',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (held(context) && has_enhancement(context.other_card, 'm_glass')) return { h_mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_mrrime');
    },
  },
  // Galarian Corsola (Psychic; Rare $7), Cursed Body: permanently gains X0.1 per playing card destroyed while held (`curse_Xmult` from X1;
  // the gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16). A Psychic Energy used on it energizes it, then evolves it into Cursola (Corsola's rule).
  galarian_corsola: {
    name: 'galarian_corsola', poke_sprite391: sprite('Gen02', 8, 4),
    poke_energy_evo: { etype: 'Psychic', into: 'j_poke_cursola', rev: GALAR_FORMS_REV },
    config: { extra: { curse_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 2, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['xmult', 'scaling', 'destroy_card'], poke_after: 'corsola',
    poke_custom_values_to_keep: ['curse_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.curse_Xmult || 1)] }; },
    calculate(self, card, context) {
      if (context.joker_main && (card.ability.extra.curse_Xmult || 1) > 1) return xmain(card.ability.extra.curse_Xmult);
      return undefined;
    },
  },
  // Galarian Zigzagoon (Dark; the 3-stage line's Basic, Uncommon $6): each scored Spade gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 4 rounds.
  galarian_zigzagoon: {
    name: 'galarian_zigzagoon', poke_sprite391: sprite('Gen03', 8, 7),
    config: { extra: { mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 3, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['mult', 'suit', 'spades', 'round_evo'], poke_after: 'linoone',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (scored(context) && context.other_card.is_suit('Spades')) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_galarian_linoone');
    },
  },
  // Galarian Linoone (Safari $8): each scored Spade gives X1.15 (`Xmult_multi` +5%: 1.2075 / 1.265 / 1.3225). Evolves into Obstagoon after
  // 5 rounds.
  galarian_linoone: {
    name: 'galarian_linoone', poke_sprite391: sprite('Gen03', 10, 7),
    config: { extra: { Xmult_multi: 1.15, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 3, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['xmult', 'suit', 'spades', 'round_evo'], poke_after: 'galarian_zigzagoon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.rounds] }; },
    calculate(self, card, context) {
      if (scored(context) && context.other_card.is_suit('Spades')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return level_evo(self, card, context, 'j_poke_obstagoon');
    },
  },
  // Galarian Darumaka (Water; Common $5), Gorilla Tactics: +12 Mult if the played poker hand is your most-played hand (ties count; `mult` +40%:
  // 16.8 / 21.6 / 26.4). 4 rounds (Darumaka's).
  galarian_darumaka: {
    name: 'galarian_darumaka', poke_sprite391: sprite('Gen05', 10, 7),
    config: { extra: { mult: 12, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['mult', 'hand_type', 'round_evo'], poke_after: 'darmanitan',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), most_played_text(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && most_played(context.scoring_name)) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_galarian_darmanitan');
    },
  },
  // Galarian Darmanitan (Safari $8), Gorilla Tactics: X3 if the played hand is your most-played hand, else nothing (`Xmult` +20%: 3.6 / 4.2 /
  // 4.8); Zen Mode: on the round's final hand X4 whatever the hand (`Xmult2` +20%: 4.8 / 5.6 / 6.4). Its face is upstream's Zen Mode card
  // (Gen05 {2,8}, unlisted) while the next hand is the final one (poke_view_form 'zen'; poke_form_art, ui.js ownFace).
  galarian_darmanitan: {
    name: 'galarian_darmanitan', poke_sprite391: sprite('Gen05', 0, 8),
    config: { extra: { Xmult: 3, Xmult2: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['xmult', 'hand_type', 'final_hand'], poke_after: 'galarian_darumaka',
    poke_view_form: () => (final_next() ? 'zen' : undefined),
    poke_form_art: { zen: { atlas: 'poke_AtlasJokersBasicGen05391', pos: { x: 2, y: 8 } } },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), most_played_text(), final_next() ? 'Zen Mode!' : 'Standard Mode'] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      if (final_hand()) return { message: 'Zen Mode! ' + a_xmult(r3(ex.Xmult2)), colour: 'XMULT', Xmult_mod: ex.Xmult2 };
      if (most_played(context.scoring_name)) return xmain(ex.Xmult);
      return undefined;
    },
  },
  // Galarian Yamask (Earth; Common $5): each scored Stone card gives +5 Mult (`mult` +40%: 7 / 9 / 11). Evolves into Runerigus at the end of
  // a round once RUNERIGUS_STONES (10) Stone cards have scored while held (Yamask's rule).
  galarian_yamask: {
    name: 'galarian_yamask', poke_sprite391: sprite('Gen05', 4, 8),
    config: { extra: { mult: 5, stones_scored: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 5, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['mult', 'enhancements', 'stone'], poke_after: 'cofagrigus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), Math.min(ex.stones_scored || 0, RUNERIGUS_STONES), RUNERIGUS_STONES] }; },
    calculate(self, card, context) {
      stone_count(card, context);
      if (scored(context) && has_enhancement(context.other_card, 'm_stone')) return { mult: card.ability.extra.mult, card };
      return scaling_evo(self, card, context, 'j_poke_runerigus', card.ability.extra.stones_scored || 0, RUNERIGUS_STONES);
    },
  },
  // Galarian Stunfisk (Metal; Rare $7), Snap Trap: your first discard each round is free (it doesn't use a discard). No number: Energy-inert.
  galarian_stunfisk: {
    name: 'galarian_stunfisk', poke_sprite391: sprite('Gen05', 6, 8),
    config: { extra: {} },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 5, blueprint_compat: false, poke_region: 'galarian', poke_no_energy_field: true,
    attributes: ['discard'], poke_after: 'stunfisk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [snap_state(card)] }; },
    calculate(self, card, context) { snap_trap(card, context); return undefined; },
  },
  // Galarian Articuno (Psychic; Legendary $20), Freezing Glare: on the round's final hand every scored card retriggers once (fixed). Complete
  // alone (the owner's legendary rule). Energy-inert.
  galarian_articuno: {
    name: 'galarian_articuno', poke_sprite391: sprite('Gen01', 8, 5, [9, 5]),
    config: { extra: { retriggers: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 1, blueprint_compat: true, poke_region: 'galarian', poke_no_energy_field: true,
    attributes: ['retrigger', 'final_hand'], poke_after: 'articuno',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [final_state()] }; },
    calculate(self, card, context) {
      if (retrigger_play(context) && final_hand()) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      return undefined;
    },
  },
  // Galarian Zapdos (Fighting; Legendary $20), Thunderous Kick: the first scored card of each hand retriggers 3 times (fixed). Energy-inert.
  galarian_zapdos: {
    name: 'galarian_zapdos', poke_sprite391: sprite('Gen01', 10, 5, [11, 5]),
    config: { extra: { retriggers: 3 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 1, blueprint_compat: true, poke_region: 'galarian', poke_no_energy_field: true,
    attributes: ['retrigger'], poke_after: 'zapdos',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      if (retrigger_play(context) && context.scoring_hand && context.other_card === context.scoring_hand[0]) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      return undefined;
    },
  },
  // Galarian Moltres (Dark; Legendary $20), Fiery Wrath: +1 discard (fixed) and X3.5 on the round's final hand (`Xmult` +20%: 4.2 / 4.9 / 5.6).
  galarian_moltres: {
    name: 'galarian_moltres', poke_sprite391: sprite('Gen01', 12, 5, [13, 5]),
    config: { extra: { d_size: 1, Xmult: 3.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dark', gen: 1, blueprint_compat: true, poke_region: 'galarian',
    attributes: ['xmult', 'discard', 'final_hand'], poke_after: 'moltres',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult), final_state()] }; },
    calculate(self, card, context) {
      if (context.joker_main && final_hand()) return xmain(card.ability.extra.Xmult);
      return undefined;
    },
    ...d_size,
  },
}, FILE);

/** The Galarian lines that are new families (systems/evolution.js set_family): no member is in another family. */
export const GALARIAN_FAMILIES = [
  ['galarian_ponyta', 'galarian_rapidash'],
  ['galarian_slowpoke', 'galarian_slowbro', 'galarian_slowking'],
  ['galarian_darumaka', 'galarian_darmanitan'],
  ['galarian_stunfisk'],
  ['galarian_articuno'], ['galarian_zapdos'], ['galarian_moltres'],
];
/** The Galarian lines that share an existing final (Obstagoon, Sirfetch'd, Cursola, Mr. Rime, Runerigus): pushed as their OWN families
 *  (index.js, not set_family, which would replace the Kanto line): the Galarian Basic's pool check, highest / previous evo read them; the
 *  final's own lookups (its devolve, the Pokédex) keep finding its Kanto line first. */
export const GALARIAN_OWN_FAMILIES = [
  ['galarian_zigzagoon', 'galarian_linoone', 'obstagoon'],
  ['galarian_farfetchd', 'sirfetchd'],
  ['galarian_corsola', 'cursola'],
  ['galarian_mrmime', 'mrrime'],
  ['galarian_yamask', 'runerigus'],
];
/** The branch: Galarian Weezing joins Koffing's line, seen from GALAR_FORMS_REV on (FAMILY_MEMBER_REV). */
export const GALARIAN_BRANCH_FAMILIES = [['koffing', 'weezing', 'galarian_weezing']];
export const GALARIAN_FAMILY_REV = { galarian_weezing: GALAR_FORMS_REV };

// ------------------------------------------------------------ text (Pokermon loc style; #n# filled by loc_vars)
const EVOLVES_ROUNDS = (n) => '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#' + n + '#{C:inactive,s:0.8} rounds)';
const ENERGY_TO = (name) => '{C:inactive,s:0.8}(Energy carries to ' + name + ')';
const BR = '{br:2}ERROR - CONTACT STEAK';
const box = (parts) => parts.flatMap((p, i) => (Array.isArray(p) ? (i ? [BR, ...p] : p) : [p]));
export const GALARIAN_LOC = {
  Joker: {
    j_poke_galarian_ponyta: { name: 'Galarian Ponyta', text: [
      '{C:attention}Pastel Veil:{} scored', '{C:attention}Lucky{} cards always', 'trigger their {C:mult}Mult{}', ENERGY_TO('Galarian Rapidash'), EVOLVES_ROUNDS(1)] },
    j_poke_galarian_rapidash: { name: 'Galarian Rapidash', text: box([
      ['{C:attention}Pastel Veil:{} {C:attention}Lucky{} cards\'', 'odds are doubled', '{C:inactive}(Mult {C:green}#2# in #3#{C:inactive}, money {C:green}#4# in #5#{C:inactive})'],
      ['Each {C:attention}Lucky{} card trigger', 'gives {X:mult,C:white} X#1# {} Mult']]) },
    j_poke_galarian_slowpoke: { name: 'Galarian Slowpoke', text: [
      'Permanently gains {C:mult}+#1#{} Mult', 'at the end of each round', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)',
      '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} rounds: Slowbro if', '{C:inactive,s:0.8}it is your leftmost Slowpoke,', '{C:inactive,s:0.8}Slowking if your rightmost,', '{C:inactive,s:0.8}else random; now: #4#)'] },
    j_poke_galarian_slowbro: { name: 'Galarian Slowbro', text: box([
      ['{C:attention}Quick Draw:{} each hand,', '{C:green}#1# in #2#{} chance to retrigger', 'every scored card'],
      ['{C:mult}+#3#{} Mult', '{C:inactive}(banked by Slowpoke)']]) },
    j_poke_galarian_slowking: { name: 'Galarian Slowking', text: box([
      ['{C:attention}Curious Medicine:{} gains', '{X:mult,C:white} X#1# {} Mult for each', '{C:spectral}Spectral{} card used', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'],
      ['{C:mult}+#3#{} Mult', '{C:inactive}(banked by Slowpoke)']]) },
    j_poke_galarian_farfetchd: { name: 'Galarian Farfetch\'d', text: [
      'Each {C:attention}Lucky{} card trigger', 'gives {C:mult}+#1#{} Mult',
      '{C:inactive,s:0.8}(Evolves into Sirfetch\'d at end', '{C:inactive,s:0.8}of a round with {C:attention,s:0.8}#3#{C:inactive,s:0.8} Lucky triggers;', '{C:inactive,s:0.8}this round: #2#/#3#)'] },
    j_poke_galarian_weezing: { name: 'Galarian Weezing', text: box([
      ['{C:attention}Neutralizing Gas:{} {X:mult,C:white} X#1# {} Mult'],
      ['When a {C:attention}Blind{} is selected,', 'one {C:attention}Hazard{} card in your', 'deck loses its enhancement', 'and this gains {X:mult,C:white} X#2# {} Mult',
        '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult; #4# Hazard)']]) },
    j_poke_galarian_mrmime: { name: 'Galarian Mr. Mime', text: [
      'Each {C:attention}Glass{} card', 'held in hand', 'gives {C:mult}+#1#{} Mult', '{C:inactive,s:0.8}(Evolves into Mr. Rime', '{C:inactive,s:0.8}after {C:attention,s:0.8}#2#{C:inactive,s:0.8} rounds)'] },
    j_poke_galarian_corsola: { name: 'Galarian Corsola', text: box([
      ['{C:attention}Cursed Body:{} gains', '{X:mult,C:white} X#1# {} Mult for each', 'playing card destroyed', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'],
      ['A {X:poke_psychic,C:white}Psychic{} Energy used on', 'it evolves it into {C:attention}Cursola{}']]) },
    j_poke_galarian_zigzagoon: { name: 'Galarian Zigzagoon', text: ['Each scored {C:spades}Spade{}', 'gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_galarian_linoone: { name: 'Galarian Linoone', text: [
      'Each scored {C:spades}Spade{}', 'gives {X:mult,C:white} X#1# {} Mult', '{C:inactive,s:0.8}(Evolves into Obstagoon', '{C:inactive,s:0.8}after {C:attention,s:0.8}#2#{C:inactive,s:0.8} rounds)'] },
    j_poke_galarian_darumaka: { name: 'Galarian Darumaka', text: [
      '{C:attention}Gorilla Tactics:{} {C:mult}+#1#{} Mult', 'if the played poker hand', 'is your most played hand', '{C:inactive}(Most played: #2#)', EVOLVES_ROUNDS(3)] },
    j_poke_galarian_darmanitan: { name: 'Galarian Darmanitan', text: box([
      ['{C:attention}Gorilla Tactics:{} {X:mult,C:white} X#1# {} Mult', 'if the played poker hand', 'is your most played hand', '{C:inactive}(Most played: #3#)'],
      ['{C:attention}Zen Mode:{} {X:mult,C:white} X#2# {} Mult', 'on the round\'s final', 'hand instead, whatever', 'the hand', '{C:inactive}(#4#)']]) },
    j_poke_galarian_yamask: { name: 'Galarian Yamask', text: [
      'Each scored {C:attention}Stone{} card', 'gives {C:mult}+#1#{} Mult', '{C:inactive,s:0.8}(Evolves into Runerigus once', '{C:inactive,s:0.8}{C:attention,s:0.8}#3#{C:inactive,s:0.8} Stone cards scored: #2#/#3#)'] },
    j_poke_galarian_stunfisk: { name: 'Galarian Stunfisk', text: [
      '{C:attention}Snap Trap:{} your first', 'discard each round', 'is free', '{C:inactive}(#1#)'] },
    j_poke_galarian_articuno: { name: 'Galarian Articuno', text: [
      '{C:attention}Freezing Glare:{} on the', 'round\'s final hand, every', 'scored card retriggers', '{C:inactive}(#1#)'] },
    j_poke_galarian_zapdos: { name: 'Galarian Zapdos', text: [
      '{C:attention}Thunderous Kick:{} the first', 'scored card of each hand', 'retriggers {C:attention}#1#{} times'] },
    j_poke_galarian_moltres: { name: 'Galarian Moltres', text: box([
      ['{C:attention}Fiery Wrath:{} {C:red}+#1#{} discard'],
      ['{X:mult,C:white} X#2# {} Mult on the', 'round\'s final hand', '{C:inactive}(#3#)']]) },
  },
};
/** The branch's box, APPENDED to Koffing's own 3.9.1 text (index.js, as GALAR_UPSTREAM_TEXT). */
export const GALARIAN_UPSTREAM_TEXT = {
  j_poke_koffing: [BR, '{C:attention}Galarian form:{} a', '{X:poke_fairy,C:white}Fairy{} Energy used on it', 'evolves it into {C:attention}Galarian Weezing{}'],
};
