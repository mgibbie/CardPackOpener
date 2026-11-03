// The owner's regional forms, batch A: the 18 Alolan forms ("Yes", 2026-11-03; Pokermon regional batch A, contentRev ALOLA_REV;
// PORTING.md "Regional batch A"; DESIGN_GUIDE.txt 2.1 "REGIONAL FORMS"). Micatro's own designs (upstream Pokermon 3.9.1 draws every one of
// them on its Gen 1 sheet, AtlasJokersBasicGen01 {2,2}-{6,4}, but registers none): nothing to deploy. Types from the card art (owner rule,
// tools/micatro/pokermon_art_type.mjs: every cell read with a margin of 0.46+).
//
// Two shapes (the audit's patterns 1 and 2):
//   - OWN LINES, their own pool entries beside the Kanto originals (the Kanto line's rarity / cost slots, stage by stage; a level_evo of 4
//     or 5 rounds): Rattata -> Raticate, Sandshrew -> Sandslash, Vulpix -> Ninetales, Diglett -> Dugtrio, Meowth -> Persian,
//     Geodude -> Graveler -> Golem, Grimer -> Muk. The Kanto Basic never turns into one, and one never blocks the other in the shop.
//   - BRANCH EVOLUTIONS of a Kanto Basic (the Galarian Energy-evolution pattern, systems/energy.js energy_evo_target): Pikachu -> Alolan
//     Raichu (a Psychic Energy used on it), Exeggcute -> Alolan Exeggutor (Dragon), Cubone -> Alolan Marowak (Fire). Energize first, then
//     evolve; refused while debuffed or with an Everstone; gated by rulesRev (ALOLA_REV, `rev` on each poke_energy_evo; the three join their
//     families on that rev: FAMILY_MEMBER_REV), so runs recorded before it replay as recorded. The Kanto paths are unchanged.
// Every regional joker shows a region pill ("Alolan") before its type pill (systems/types.js region_badge).
// After its Kanto line in Pokédex order (Alolan Rattata / Raticate after Raticate, Alolan Raichu after Raichu's Megas, ...). Gen 1:
// a regional form takes its base species' generation (the generation-filter rule, pokermon_gen_filter_test).
import {
  G, P_CENTERS, card_eval_status_text, localize, pseudoseed, pseudorandom_element, defineJokers, type_tooltip, level_evo,
  has_enhancement, has_no_rank, poke_remove_card, ALOLA_REV,
} from '../api.js';
import { is_snowy, snow_read, snow_state } from './pokejokers_designs.js';

const FILE = 'micatro/pokejokers_regional';
const sprite = (x, y) => ({ atlas: 'AtlasJokersBasicGen01', pos: { x, y } });
const r3 = (x) => Math.round(x * 1000) / 1000;
const r9 = (x) => Math.round(x * 1e9) / 1e9;
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
const scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff);
const held = (context) => !!(context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff);
const held_eor = (context) => !!(context.individual && context.cardarea === G.hand && context.end_of_round && !context.other_card.debuff);
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};

// ------------------------------------------------------------ shared bodies
/** Alolan Rattata / Raticate, Hoarder (the Basic's half): each scored 2, 3 or 4 (by rank: a Stone card has none) gives +mult. */
const low_rank = (context) => scored(context) && !has_no_rank(context.other_card) && [2, 3, 4].includes(context.other_card.get_id());
/** Alolan Raticate, Hoarder: X1 + Xmult_mod per consumable held (the consumable row's cards: Energy, Items, Tarots, Planets... ), read when it
 *  scores. */
const consumables_held = () => ((G.consumeables && G.consumeables.cards) || []).length;
const hoard_x = (card) => r9(1 + card.ability.extra.Xmult_mod * consumables_held());
/** Alolan Raichu, Surge Surfer: X(Xmult) plus the bank `surf_Xmult` (from 0, no energy field: never retroactive), which gains Xmult_mod for
 *  each Planet card used while it is held (context.using_consumeable; a Black Hole is a Spectral and doesn't count). Not Blueprint. */
const surf_x = (card) => r9(card.ability.extra.Xmult + card.ability.extra.surf_Xmult);
function surge_surfer(card, context) {
  if (!context.using_consumeable || context.blueprint || !context.consumeable || context.consumeable.ability.set !== 'Planet') return false;
  const ex = card.ability.extra;
  ex.surf_Xmult = r9(ex.surf_Xmult + ex.Xmult_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(r3(surf_x(card))), colour: 'XMULT' });
  return true;
}
/** Alolan Diglett / Dugtrio, Golden hair: each Gold card held in hand at end of round (the held-card pass where the Gold card pays: Mime and a
 *  Red Seal repeat it, as the card's own $3) earns $gold_money more (fixed). */
const gold_eor = (card, context) => (held_eor(context) && has_enhancement(context.other_card, 'm_gold') ? { dollars: card.ability.extra.gold_money, card } : undefined);
/** Alolan Persian, Pay Day: X1 + Xmult_mod per $10 you have (your current money, floored to tens; nothing while at or below $0). */
const dollars_now = () => Math.max(0, Number((G.GAME && G.GAME.dollars) || 0));
const payday_x = (card) => r9(1 + card.ability.extra.Xmult_mod * Math.floor(dollars_now() / 10));
/** Alolan Geodude / Graveler / Golem, Galvanize: a scored Stone card. */
const stone_scored = (context) => scored(context) && has_enhancement(context.other_card, 'm_stone');
/** Alolan Grimer / Muk, Gluttony: when a Blind is selected (once a round; not Blueprint), destroys the LOWEST-ranked card of your full deck
 *  (by rank, Aces high: 2s first; a Stone card or any card with no rank is skipped; a tie is the run's seeded pick, 'poke_alolan_gluttony';
 *  through Pokermon's poke_remove_card, so every "a card was destroyed" payoff sees it), then banks its gain: Grimer +mult_mod Mult
 *  (`eat_mult`), Muk +Xmult_mod X Mult (`eat_Xmult` from X1). The banks take no Energy (only the gains do: never retroactive) and Grimer's
 *  Mult is kept by Muk (poke_custom_values_to_keep). Nothing ranked in the deck: nothing eaten, nothing gained. */
function gluttony(card, context, field, gain) {
  if (!context.setting_blind || context.blueprint || card.getting_sliced) return false;
  const ex = card.ability.extra;
  if (ex.eat_round === G.GAME.round) return true;
  const pool = (G.playing_cards || []).filter((c) => !c.destroyed && !c.shattered && !c.removed && !c.poke_swallowed && !has_no_rank(c));
  if (!pool.length) return true;
  ex.eat_round = G.GAME.round;
  const low = Math.min(...pool.map((c) => c.get_id()));
  const ties = pool.filter((c) => c.get_id() === low);
  const [target] = pseudorandom_element(ties, pseudoseed('poke_alolan_gluttony'));
  target.poke_swallowed = true;
  poke_remove_card(target, card);
  ex[field] = r9(ex[field] + ex[gain]);
  card_eval_status_text(card, 'extra', null, null, null, field === 'eat_mult' ? { message: a_mult(r3(ex.eat_mult)), colour: 'MULT' } : { message: a_xmult(r3(ex.eat_Xmult)), colour: 'XMULT' });
  return true;
}
/** Alolan Marowak, Shadow Bone: was any playing card destroyed THIS round (G.GAME.poke_destroyed_round, set by index.js's card_removed hook
 *  whenever a card of your deck is destroyed: a shattered Glass, The Hanged Man, a devouring joker, Gluttony...; a round runs from selecting
 *  its Blind to the next one)? Run-wide, so it counts what happened before this card was held (a Cubone evolving mid-round). */
export function poke_card_destroyed(card) {
  if (G.GAME && G.playing_cards && card && G.playing_cards.includes(card)) G.GAME.poke_destroyed_round = G.GAME.round;
}
const bone_round = () => !!(G.GAME && G.GAME.poke_destroyed_round === G.GAME.round && G.GAME.round > 0);

defineJokers({
  // Alolan Rattata (Dark; Rattata's slot, Common $5), Hoarder: each scored 2, 3 or 4 gives +5 Mult (`mult` +40%: 7 / 9 / 11). 5 rounds.
  alolan_rattata: {
    name: 'alolan_rattata', poke_sprite391: sprite(2, 2),
    config: { extra: { mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['mult', 'rank', 'two', 'three', 'four', 'round_evo'], poke_after: 'raticate',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (low_rank(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_alolan_raticate');
    },
  },
  // Alolan Raticate (Raticate's slot, Safari $7), Hoarder: X1 + X0.2 per consumable held (`Xmult_mod` +20%: 0.24 / 0.28 / 0.32), and it keeps
  // Rattata's +5 Mult on scored 2s, 3s and 4s (`mult` +40%).
  alolan_raticate: {
    name: 'alolan_raticate', poke_sprite391: sprite(4, 2),
    config: { extra: { mult: 5, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 7, stage: 'One', ptype: 'Dark', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['mult', 'xmult', 'rank', 'two', 'three', 'four', 'consumable'], poke_after: 'alolan_rattata',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), consumables_held(), r3(hoard_x(card)), r3(ex.mult)] }; },
    calculate(self, card, context) {
      if (low_rank(context)) return { mult: card.ability.extra.mult, card };
      if (context.joker_main) { const x = hoard_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Alolan Raichu (Psychic; Raichu's slot, Safari $8; a Psychic Energy used on Pikachu), Surge Surfer: X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4),
  // and each Planet card used permanently adds X0.1 (`surf_Xmult`, the bank; its gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16).
  alolan_raichu: {
    name: 'alolan_raichu', poke_sprite391: sprite(6, 2),
    config: { extra: { Xmult: 1.5, surf_Xmult: 0, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['xmult', 'scaling', 'planet'], poke_after: 'mega_raichu_y',
    poke_custom_values_to_keep: ['surf_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), r3(surf_x(card))] }; },
    calculate(self, card, context) {
      if (surge_surfer(card, context)) return undefined;
      if (context.joker_main) { const x = surf_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Alolan Sandshrew (Water; Sandshrew's slot, Common $4), Slush Rush: +30 Chips on a snowy round (is_snowy, the house snow: the round's
  // first deal forecast Snowy, or an Alolan Ninetales held; `chips` +30%: 39 / 48 / 57). 4 rounds.
  alolan_sandshrew: {
    name: 'alolan_sandshrew', poke_sprite391: sprite(8, 2),
    config: { extra: { chips: 30, rounds: 4 } },
    rarity: 1, cost: 4, stage: 'Basic', ptype: 'Water', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['chips', 'hand_drawn', 'suits', 'round_evo'], poke_after: 'sandslash',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), snow_state(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (snow_read(card, context, 'Slush Rush!')) return undefined;
      if (context.joker_main && is_snowy(card)) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_alolan_sandslash');
    },
  },
  // Alolan Sandslash (Sandslash's slot, Safari $6), Slush Rush: X2 on a snowy round (`Xmult` +20%: 2.4 / 2.8 / 3.2), +30 Chips otherwise
  // (`chips` +30%).
  alolan_sandslash: {
    name: 'alolan_sandslash', poke_sprite391: sprite(10, 2),
    config: { extra: { chips: 30, Xmult: 2 } },
    rarity: 'poke_safari', cost: 6, stage: 'One', ptype: 'Water', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['chips', 'xmult', 'hand_drawn', 'suits'], poke_after: 'alolan_sandshrew',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.chips), snow_state(card)] }; },
    calculate(self, card, context) {
      if (snow_read(card, context, 'Slush Rush!')) return undefined;
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      return is_snowy(card) ? { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult } : { message: a_chips(r3(ex.chips)), colour: 'CHIPS', chip_mod: ex.chips };
    },
  },
  // Alolan Vulpix (Water; Vulpix's slot, Common $4): each scored Spade gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  alolan_vulpix: {
    name: 'alolan_vulpix', poke_sprite391: sprite(12, 2),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 4, stage: 'Basic', ptype: 'Water', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['mult', 'suit', 'spades', 'round_evo'], poke_after: 'ninetales',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (scored(context) && context.other_card.is_suit('Spades')) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_alolan_ninetales');
    },
  },
  // Alolan Ninetales (Fairy; Ninetales's slot, Safari $8), Snow Warning: while held (undebuffed) every round is snowy (is_snowy: Alolan
  // Sandshrew / Sandslash's snow, Eiscue's ice re-forms); scored Spades give X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38).
  alolan_ninetales: {
    name: 'alolan_ninetales', poke_sprite391: sprite(14, 2),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['xmult', 'suit', 'spades', 'weather'], poke_after: 'alolan_vulpix',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (scored(context) && context.other_card.is_suit('Spades')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Alolan Diglett (Metal; Diglett's slot, Common $5), Golden hair: each Gold card held in hand at end of round earns $1 more (fixed). It
  // carries Dugtrio's `Xmult_multi` ("Energy carries to Alolan Dugtrio"). 4 rounds.
  alolan_diglett: {
    name: 'alolan_diglett', poke_sprite391: sprite(0, 3),
    config: { extra: { gold_money: 1, Xmult_multi: 1.2, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Metal', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['economy', 'enhancements', 'round_evo'], poke_after: 'dugtrio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold); const ex = card.ability.extra; return { vars: [ex.gold_money, ex.rounds] }; },
    calculate(self, card, context) { return gold_eor(card, context) || level_evo(self, card, context, 'j_poke_alolan_dugtrio'); },
  },
  // Alolan Dugtrio (Dugtrio's slot, Uncommon $6 — shop-able, as Dugtrio): each Gold card held in hand gives X1.2 when a hand scores (the held
  // pass, Baron's shape; `Xmult_multi` +5%: 1.26 / 1.32 / 1.38), and Golden hair stays ($1, fixed).
  alolan_dugtrio: {
    name: 'alolan_dugtrio', poke_sprite391: sprite(2, 3),
    config: { extra: { gold_money: 1, Xmult_multi: 1.2 } },
    rarity: 2, cost: 6, stage: 'One', ptype: 'Metal', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['xmult', 'economy', 'enhancements'], poke_after: 'alolan_diglett',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.gold_money] }; },
    calculate(self, card, context) {
      if (held(context) && has_enhancement(context.other_card, 'm_gold')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return gold_eor(card, context);
    },
  },
  // Alolan Meowth (Dark; Meowth's slot, Common $5), Pay Day: earn $2 at end of round (calc_dollar_bonus, fixed). It carries Persian's
  // `Xmult_mod` ("Energy carries to Alolan Persian"). 5 rounds.
  alolan_meowth: {
    name: 'alolan_meowth', poke_sprite391: sprite(4, 3),
    config: { extra: { pay_money: 2, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 1, blueprint_compat: false, poke_region: 'alolan',
    attributes: ['economy', 'round_evo'], poke_after: 'persian',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.pay_money, ex.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_alolan_persian'); },
    calc_dollar_bonus(self, card) { return card.ability.extra.pay_money; },
  },
  // Alolan Persian (Persian's slot, Safari $9), Pay Day: X1 + X0.1 per $10 you have (`Xmult_mod` +20%: 0.12 / 0.14 / 0.16), and still $2 at end
  // of round (fixed).
  alolan_persian: {
    name: 'alolan_persian', poke_sprite391: sprite(6, 3),
    config: { extra: { pay_money: 2, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 9, stage: 'One', ptype: 'Dark', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['xmult', 'economy'], poke_after: 'alolan_meowth',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(payday_x(card)), ex.pay_money] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = payday_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    calc_dollar_bonus(self, card) { return card.ability.extra.pay_money; },
  },
  // Alolan Geodude (Lightning; Geodude's slot, Common $6), Galvanize: each scored Stone card earns $1 (fixed). It carries Graveler's `mult`
  // ("Energy carries to Alolan Graveler"). 4 rounds.
  alolan_geodude: {
    name: 'alolan_geodude', poke_sprite391: sprite(8, 3),
    config: { extra: { stone_money: 1, mult: 6, rounds: 4 } },
    rarity: 1, cost: 6, stage: 'Basic', ptype: 'Lightning', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['economy', 'enhancements', 'stone', 'round_evo'], poke_after: 'golem',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [ex.stone_money, ex.rounds] }; },
    calculate(self, card, context) {
      if (stone_scored(context)) return { dollars: card.ability.extra.stone_money, card };
      return level_evo(self, card, context, 'j_poke_alolan_graveler');
    },
  },
  // Alolan Graveler (Graveler's slot, Safari $8): each scored Stone card earns $1 (fixed) and gives +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2).
  // 5 rounds (a trade evolution: rounds here).
  alolan_graveler: {
    name: 'alolan_graveler', poke_sprite391: sprite(10, 3),
    config: { extra: { stone_money: 1, mult: 6, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['mult', 'economy', 'enhancements', 'stone', 'round_evo'], poke_after: 'alolan_geodude',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [ex.stone_money, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (stone_scored(context)) return { dollars: card.ability.extra.stone_money, mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_alolan_golem');
    },
  },
  // Alolan Golem (Golem's slot, Safari $10), Galvanize: each scored Stone card earns $1 (fixed) and gives X1.25 (`Xmult_multi` +5%: 1.3125 /
  // 1.375 / 1.4375); and Stone cards HELD in hand count as Steel cards for their held X (X1.5, or the best Registeel / Durant / Escavalier
  // rule's: the card-level rule, pokejokers_designs.js galvanized / regi_h_x_mult; never stacking; Mime / a Red Seal repeat it; fixed).
  alolan_golem: {
    name: 'alolan_golem', poke_sprite391: sprite(12, 3),
    config: { extra: { stone_money: 1, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Lightning', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['xmult', 'economy', 'enhancements', 'stone', 'steel'], poke_after: 'alolan_graveler',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [ex.stone_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (stone_scored(context)) return { dollars: card.ability.extra.stone_money, x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Alolan Grimer (Dark; Grimer's slot, Common $4), Gluttony: when a Blind is selected, destroys the lowest-ranked card in your full deck and
  // permanently gains +3 Mult (`eat_mult`; the gain `mult_mod` +20%: 3.6 / 4.2 / 4.8). 5 rounds.
  alolan_grimer: {
    name: 'alolan_grimer', poke_sprite391: sprite(14, 3),
    config: { extra: { eat_mult: 0, mult_mod: 3, rounds: 5 } },
    rarity: 1, cost: 4, stage: 'Basic', ptype: 'Dark', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['mult', 'scaling', 'full_deck', 'destroy_card', 'round_evo'], poke_after: 'muk',
    poke_custom_values_to_keep: ['eat_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.eat_mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (gluttony(card, context, 'eat_mult', 'mult_mod')) return undefined;
      const ex = card.ability.extra;
      if (context.joker_main && ex.eat_mult > 0) return { message: a_mult(r3(ex.eat_mult)), colour: 'MULT', mult_mod: ex.eat_mult };
      return level_evo(self, card, context, 'j_poke_alolan_muk');
    },
  },
  // Alolan Muk (Grimer's slot, Safari $6), Gluttony: the same eat, now banking X0.1 (`eat_Xmult` from X1; the gain `Xmult_mod` +20%: 0.12 /
  // 0.14 / 0.16); Grimer's banked Mult is kept and still given (it banks no more Mult).
  alolan_muk: {
    name: 'alolan_muk', poke_sprite391: sprite(0, 4),
    config: { extra: { eat_mult: 0, eat_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 6, stage: 'One', ptype: 'Dark', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['mult', 'xmult', 'scaling', 'full_deck', 'destroy_card'], poke_after: 'alolan_grimer',
    poke_custom_values_to_keep: ['eat_mult', 'eat_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.eat_Xmult), r3(ex.eat_mult)] }; },
    calculate(self, card, context) {
      if (gluttony(card, context, 'eat_Xmult', 'Xmult_mod')) return undefined;
      const ex = card.ability.extra;
      if (!context.joker_main) return undefined;
      const r = {};
      if (ex.eat_mult > 0) r.mult_mod = ex.eat_mult;
      if (ex.eat_Xmult > 1) r.Xmult_mod = ex.eat_Xmult;
      if (!Object.keys(r).length) return undefined;
      return { message: r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod)), colour: r.Xmult_mod ? 'XMULT' : 'MULT', ...r };
    },
  },
  // Alolan Exeggutor (Dragon; Exeggutor's slot, Safari $10; a Dragon Energy used on Exeggcute), Long Neck: +1 hand size (fixed) and X2 when
  // the played hand has 5 cards (all played cards count, scoring or not; `Xmult` +20%: 2.4 / 2.8 / 3.2).
  alolan_exeggutor: {
    name: 'alolan_exeggutor', poke_sprite391: sprite(2, 4),
    config: { extra: { h_size: 1, Xmult: 2 } },
    rarity: 'poke_safari', cost: 10, stage: 'One', ptype: 'Dragon', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['xmult', 'hand_size', 'hand_type'], poke_after: 'exeggutor',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && context.full_hand && context.full_hand.length === 5) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    ...hand_size,
  },
  // Alolan Marowak (Fire; Marowak's slot, Safari $8; a Fire Energy used on Cubone), Shadow Bone: X2 (`Xmult` +20%: 2.4 / 2.8 / 3.2), or X2.5
  // if any playing card was destroyed this round (`Xmult2` +20%: 3 / 3.5 / 4).
  alolan_marowak: {
    name: 'alolan_marowak', poke_sprite391: sprite(6, 4),
    config: { extra: { Xmult: 2, Xmult2: 2.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 1, blueprint_compat: true, poke_region: 'alolan',
    attributes: ['xmult', 'destroy_card'], poke_after: 'marowak',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), bone_round() ? 'Yes' : 'No'] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = bone_round() ? card.ability.extra.Xmult2 : card.ability.extra.Xmult;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
}, FILE);

/** Their lines (systems/evolution.js set_family): the own lines are new families; the three branches join their Kanto lines (before
 *  Raichu's Megas, so the Megas stay at the end), seen from ALOLA_REV on (REGIONAL_FAMILY_REV -> FAMILY_MEMBER_REV). */
export const REGIONAL_FAMILIES = [
  ['alolan_rattata', 'alolan_raticate'],
  ['alolan_sandshrew', 'alolan_sandslash'],
  ['alolan_vulpix', 'alolan_ninetales'],
  ['alolan_diglett', 'alolan_dugtrio'],
  ['alolan_meowth', 'alolan_persian'],
  ['alolan_geodude', 'alolan_graveler', 'alolan_golem'],
  ['alolan_grimer', 'alolan_muk'],
  ['pichu', 'pikachu', 'raichu', 'alolan_raichu', 'mega_raichu_x', 'mega_raichu_y'],
  ['exeggcute', 'exeggutor', 'alolan_exeggutor'],
  ['cubone', 'marowak', 'alolan_marowak'],
];
export const REGIONAL_FAMILY_REV = { alolan_raichu: ALOLA_REV, alolan_exeggutor: ALOLA_REV, alolan_marowak: ALOLA_REV };

// ------------------------------------------------------------ text (Pokermon loc style; #n# filled by loc_vars)
const EVOLVES_ROUNDS = (n) => '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#' + n + '#{C:inactive,s:0.8} rounds)';
const ENERGY_TO = (name) => '{C:inactive,s:0.8}(Energy carries to ' + name + ')';
const LOW = (n) => ['{C:attention}Hoarder:{} each scored', '{C:attention}2{}, {C:attention}3{} or {C:attention}4{} gives {C:mult}+#' + n + '#{} Mult'];
const SNOWY = ['{C:inactive,s:0.8}(Snowy: Spades held most on', '{C:inactive,s:0.8}the first deal, or an Alolan', '{C:inactive,s:0.8}Ninetales held)'];
const GOLD_EOR = (n) => ['{C:attention}Golden hair:{} each {C:attention}Gold{}', 'card held in hand at end', 'of round earns {C:money}$#' + n + '#{} more'];
const PAY = (n) => ['{C:attention}Pay Day:{} earn {C:money}$#' + n + '#{}', 'at end of round'];
const BR = '{br:2}ERROR - CONTACT STEAK';
const box = (parts) => parts.flatMap((p, i) => (Array.isArray(p) ? (i ? [BR, ...p] : p) : [p]));
export const REGIONAL_LOC = {
  Joker: {
    j_poke_alolan_rattata: { name: 'Alolan Rattata', text: [...LOW(1), EVOLVES_ROUNDS(2)] },
    j_poke_alolan_raticate: { name: 'Alolan Raticate', text: box([
      ['{C:attention}Hoarder:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each', 'consumable you hold', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'],
      ['Each scored {C:attention}2{}, {C:attention}3{} or {C:attention}4{}', 'gives {C:mult}+#4#{} Mult']]) },
    j_poke_alolan_raichu: { name: 'Alolan Raichu', text: [
      '{C:attention}Surge Surfer:{} {X:mult,C:white} X#1# {} Mult', 'Each {C:planet}Planet{} card used', 'permanently adds {X:mult,C:white} X#2# {}', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_alolan_sandshrew: { name: 'Alolan Sandshrew', text: [
      '{C:attention}Slush Rush:{} {C:chips}+#1#{} Chips', 'on a {C:poke_snow}Snowy{} round', ...SNOWY, '{C:inactive}(#2#)', EVOLVES_ROUNDS(3)] },
    j_poke_alolan_sandslash: { name: 'Alolan Sandslash', text: [
      '{C:attention}Slush Rush:{} {X:mult,C:white} X#1# {} Mult', 'on a {C:poke_snow}Snowy{} round,', '{C:chips}+#2#{} Chips otherwise', ...SNOWY, '{C:inactive}(#3#)'] },
    j_poke_alolan_vulpix: { name: 'Alolan Vulpix', text: ['Each scored {C:spades}Spade{}', 'gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_alolan_ninetales: { name: 'Alolan Ninetales', text: box([
      ['{C:attention}Snow Warning:{} while you', 'have this Joker, every', 'round is {C:poke_snow}Snowy{}'],
      ['Each scored {C:spades}Spade{}', 'gives {X:mult,C:white} X#1# {} Mult']]) },
    j_poke_alolan_diglett: { name: 'Alolan Diglett', text: [...GOLD_EOR(1), ENERGY_TO('Alolan Dugtrio'), EVOLVES_ROUNDS(2)] },
    j_poke_alolan_dugtrio: { name: 'Alolan Dugtrio', text: box([
      ['Each {C:attention}Gold{} card held', 'in hand gives {X:mult,C:white} X#1# {} Mult'], GOLD_EOR(2)]) },
    j_poke_alolan_meowth: { name: 'Alolan Meowth', text: [...PAY(1), ENERGY_TO('Alolan Persian'), EVOLVES_ROUNDS(2)] },
    j_poke_alolan_persian: { name: 'Alolan Persian', text: box([
      ['{X:mult,C:white} X1 {} Mult, plus {X:mult,C:white} X#1# {}', 'for every {C:money}$10{} you have', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'], PAY(3)]) },
    j_poke_alolan_geodude: { name: 'Alolan Geodude', text: [
      '{C:attention}Galvanize:{} each scored', '{C:attention}Stone{} card earns {C:money}$#1#{}', ENERGY_TO('Alolan Graveler'), EVOLVES_ROUNDS(2)] },
    j_poke_alolan_graveler: { name: 'Alolan Graveler', text: [
      '{C:attention}Galvanize:{} each scored', '{C:attention}Stone{} card earns {C:money}$#1#{}', 'and gives {C:mult}+#2#{} Mult', EVOLVES_ROUNDS(3)] },
    j_poke_alolan_golem: { name: 'Alolan Golem', text: box([
      ['{C:attention}Galvanize:{} each scored', '{C:attention}Stone{} card earns {C:money}$#1#{}', 'and gives {X:mult,C:white} X#2# {} Mult'],
      ['{C:attention}Stone{} cards held in hand', 'count as {C:attention}Steel{} cards', '{C:inactive}(Held: {X:mult,C:white} X1.5 {C:inactive} Mult)']]) },
    j_poke_alolan_grimer: { name: 'Alolan Grimer', text: [
      '{C:attention}Gluttony:{} when a {C:attention}Blind{} is', 'selected, destroy the', 'lowest-ranked card in your', 'full deck and gain {C:mult}+#1#{} Mult',
      '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_alolan_muk: { name: 'Alolan Muk', text: [
      '{C:attention}Gluttony:{} when a {C:attention}Blind{} is', 'selected, destroy the', 'lowest-ranked card in your', 'full deck and gain {X:mult,C:white} X#1# {} Mult',
      '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult', '{C:inactive}and {C:mult}+#3#{C:inactive} Mult)'] },
    j_poke_alolan_exeggutor: { name: 'Alolan Exeggutor', text: [
      '{C:attention}Long Neck:{} {C:attention}+#1#{} hand size', '{X:mult,C:white} X#2# {} Mult if the played', 'hand has {C:attention}5{} cards'] },
    j_poke_alolan_marowak: { name: 'Alolan Marowak', text: [
      '{C:attention}Shadow Bone:{} {X:mult,C:white} X#1# {} Mult,', 'or {X:mult,C:white} X#2# {} Mult if a playing', 'card was destroyed', 'this round', '{C:inactive}(This round: #3#)'] },
  },
};
/** The branch forms' box, APPENDED to the Kanto Basic's own 3.9.1 text (index.js, as GALAR_UPSTREAM_TEXT). */
export const REGIONAL_UPSTREAM_TEXT = {
  j_poke_pikachu: [BR, '{C:attention}Alolan form:{} a', '{X:poke_psychic,C:white}Psychic{} Energy used on it', 'evolves it into {C:attention}Alolan Raichu{}'],
  j_poke_exeggcute: [BR, '{C:attention}Alolan form:{} a', '{X:poke_dragon,C:white}Dragon{} Energy used on it', 'evolves it into {C:attention}Alolan Exeggutor{}'],
  j_poke_cubone: [BR, '{C:attention}Alolan form:{} a', '{X:poke_fire,C:white}Fire{} Energy used on it', 'evolves it into {C:attention}Alolan Marowak{}'],
};
