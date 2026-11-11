// designs/common.js — helpers the owner's Pokermon jokers share: used by two or more generations' jokers, by the text
// tables, or only by the mod's hooks (index.js). Cut out of pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11);
// every statement is unchanged. A helper only ONE generation uses lives in that generation's file.
import {
  localize, G, ease_hands_played, has_no_rank, add_card, card_eval_status_text, ease_discard, scale_card, find_card, ease_dollars,
  poke_get_adjacent_jokers, P_CENTERS, has_enhancement, type_sticker_applied, POST_EVOLVE, find_joker, POKE_POOL_RULES, get_total_energy,
  poke_change_growth_level, type_tooltip, get_probability_vars, is_type, smods_debuff_card, get_type, pseudoseed, pseudorandom_element, emit,
  pseudorandom_probability, copy_card,
} from '../../api.js';
import { calculate_reroll_cost } from '../../../../js/engine/core.js';
import { rulesRev } from '../../../../js/mods/pins.js';

/** contentRev 59, the owner's rule "legendaries must be complete alone": every partner clause of the Gen 3-5 Legendaries became a solo
 *  trigger (Rayquaza, the Lati twins, the Lake trio, the Regis, Regigigas, Giratina, the Swords of Justice, the Forces of Nature, the
 *  Tao trio). A move re-simulated from a run recorded before r59 (resume / replay; js/mods/pins.js RULES) keeps the old partner rules,
 *  so an old run re-plays exactly and nothing it banked shrinks; live play is always on the new ones. The progress counters (Giratina's
 *  destroyed cards, Keldeo's Hearts, the Therian rounds, Regigigas's rounds) are kept under both, so an old run carries them over. */
export const solo59 = () => rulesRev('pokermon') >= 59;
export const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
export const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
export const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
/** The main end_of_round pass (not a held card's, not a repetition), as can_evolve reads it. */
export const round_end = (context) => !!(context.end_of_round && !context.individual && !context.repetition);
/** A card on Pokermon 3.9.1's sheets (pokespriteload.lua PokemonSprites: the Natdex sheet, or a Gen sheet for `gen_atlas`). */
export const sprite = (sheet, x, y, soul) => ({ atlas: 'AtlasJokersBasic' + sheet, pos: { x, y }, ...(soul ? { soul_pos: { x: soul[0], y: soul[1] } } : {}) });

// ------------------------------------------------------------ shared bodies
export const scry = {
  add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
  remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
};
export const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
/** The Squirtle line's +hands pair (pokejokers_01). */
export const hands = {
  add_to_deck(self, card, from_debuff) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + card.ability.extra.hands;
    if (!from_debuff) ease_hands_played(card.ability.extra.hands);
  },
  remove_from_deck(self, card) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands - card.ability.extra.hands;
    const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (to_decrease > 0) ease_hands_played(-to_decrease);
  },
};
export const scry_tip = (info_queue) => info_queue.push({ set: 'Other', key: 'scry_cards' });

/** Shinx line: a played card that shares a rank with a Foreseen card (G.scry_view, the top of the deck) pays and scores. */
export const foreseen = (c) => !has_no_rank(c) && !!(G.scry_view && G.scry_view.cards && G.scry_view.cards.some((s) => !has_no_rank(s) && s.get_id() === c.get_id()));
/** Inteleon, Snipe Shot: the target is the highest-ranked scored card that can score (not debuffed, not rankless like Stone); on a tie
 *  the LEFTMOST of them (the first to score). Read from the scoring hand each time a card scores, so a retrigger hits again. */
export function snipe_target(scoring_hand) {
  let best = null;
  for (const c of scoring_hand || []) {
    if (c.debuff || has_no_rank(c)) continue;
    if (!best || c.get_id() > best.get_id()) best = c;
  }
  return best;
}

/** The Sprigatito line: how many of this scored card's Lucky rolls hit (its 1 in 5 Mult and 1 in 15 money count 1 each: the engine's
 *  lucky_procs; at least 1 when only lucky_trigger is known — a mod's own Lucky roll), or 0 when it didn't trigger. */
export const lucky_procs = (c) => (c.lucky_trigger ? Math.max(1, c.lucky_procs || 0) : 0);
export const lucky_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.lucky_trigger);
export const r3 = (x) => Math.round(x * 1000) / 1000;
/** A Negative Tarot (`tarot`: Whismur's line c_justice, Sprigatito's c_magician) when this card evolved from `from` (the poke_evolved
 *  context, after the swap; Chingling's add_card). Negative: it needs no consumable slot. */
export function evolved_tarot(card, context, from, tarot) {
  if (context.poke_evolved && context.card === card && context.from === 'j_poke_' + from && !context.blueprint) {
    G.E_MANAGER.add_event(() => { add_card({ set: 'Tarot', key: tarot, edition: 'e_negative' }); });
  }
  return undefined;
}

/** Gulpin / Swalot / Drifloon / Drifblim: max Stockpile (`stockpile_max`, the house energy field: base 3, +1 per Energy, +0.5 per
 *  mismatched Colorless — floored), plus a fixed `stockpile_bonus` (Drifblim's +2: its base 5, still +1 per Energy, since the energy
 *  field grows by a third of ITS base, 3). */
export const stock_max = (ex) => Math.floor(ex.stockpile_max + 1e-9) + (ex.stockpile_bonus || 0);
/** The round's final hand: no hands left after this one is played (Acrobat's check: hands_left is already spent while it scores). */
export const final_hand = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left === 0);
/** Drifblim, Aftermath: a Negative Spectral (random: create_card's seeded roll, key_append 'drifblim'; Negative, so it needs no free
 *  consumable slot). From selling_self (sold) and from the start_dissolve hook (destroyed: Ceremonial Dagger, Madness, Hex, Ankh, a
 *  Pokermon eater...; index.js hooks.start_dissolve -> drifblim_destroyed). Not on evolving or any transform (set_ability: no
 *  dissolve); not from a Blueprint; not while debuffed (a debuffed joker has no abilities). */
export function aftermath(card) {
  G.E_MANAGER.add_event(() => { add_card({ set: 'Spectral', edition: 'e_negative', key_append: 'drifblim' }); });
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Aftermath!', colour: 'Spectral' });
}
/** index.js hooks.start_dissolve: an owned Drifblim being destroyed (a saved one — joker_type_destroyed's no_destroy — never gets here). */
export function drifblim_destroyed(card) {
  if (!card || card.debuff || card.removed || !G.jokers || card.area !== G.jokers) return;
  if (!card.config || !card.config.center || card.config.center.key !== 'j_poke_drifblim') return;
  aftermath(card);
}

/** Vibrava: +d_size discards each round while held (the Charmander line's pair, pokejokers_01): on gain, and off again when sold,
 *  destroyed or evolved (set_ability runs the old center's remove_from_deck across an evolution). */
export const discards = {
  add_to_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size; ease_discard(card.ability.extra.d_size); },
  remove_from_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size; ease_discard(-card.ability.extra.d_size); },
};

/** The Gen 9 starters' bank (Trapinch's sand_chips pattern): `ref` (a field in no energy_values: a banked gain keeps what it was
 *  worth when earned, Energy is never retroactive) grows by `mod` x `n` (the gain is the Energy field). r3-rounded; `xm` shows the
 *  new X total, else the gain. */
export function bank(card, ref, mod, n, colour) {
  let gained = 0;
  scale_card(card, {
    ref_value: ref, scalar_value: mod, scalar_factor: n, no_message: true,
    operation: (t, k, v, change) => { t[k] = r3(v + change); gained = change; },
  });
  const ex = card.ability.extra;
  const message = colour === 'XMULT' ? a_xmult(ex[ref]) : colour === 'MULT' ? a_mult(r3(gained)) : a_chips(r3(gained));
  card_eval_status_text(card, 'extra', null, null, null, { message, colour });
}
/** Quaxly / Quaxwell / Quaquaval, Moxie: when you beat a Blind (the main end_of_round pass, not a game over), banks +chip_mod
 *  Chips (`moxie_chips`; Quaquaval: +Xmult_mod X Mult on `moxie_Xmult`) for each unused hand — the hands left after the winning
 *  hand (G.GAME.current_round.hands_left, before the next round refills them). None left: nothing. Not Blueprint. */
export const unused_hands = () => Math.max(0, (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left) || 0);

/** Castform's forms: the weather, the Pokermon type it gives (Ice maps to Water) and its name (+ the poke_sun / poke_rain / poke_snow / Colorless colour of its pop-up). 'normal' is its own card. */
export const CASTFORM_FORMS = {
  normal: { ptype: 'Colorless', name: 'Normal', colour: '#c8c0f8' },
  sunny: { ptype: 'Fire', name: 'Sunny', colour: '#f48e62' },
  rainy: { ptype: 'Water', name: 'Rainy', colour: '#6169ff' },
  snowy: { ptype: 'Water', name: 'Snowy', colour: '#82c8e8' },
};
/** Forecast: the form the cards held in hand call for. Hearts and Diamonds count together ("red") against Clubs and against
 *  Spades; a Wild card counts once for each of the three; a debuffed card, a Stone card or a card with no suit (a Hazard) counts
 *  for none (the engine's is_suit). The single highest count wins; a tie for the top (or no suited card) is Normal. */
export function forecast(cards) {
  let red = 0, clubs = 0, spades = 0;
  for (const c of cards) {
    if (c.is_suit('Hearts') || c.is_suit('Diamonds')) red += 1;
    if (c.is_suit('Clubs')) clubs += 1;
    if (c.is_suit('Spades')) spades += 1;
  }
  const top = Math.max(red, clubs, spades);
  if (top === 0 || [red, clubs, spades].filter((n) => n === top).length > 1) return 'normal';
  return red === top ? 'sunny' : clubs === top ? 'rainy' : 'snowy';
}
/** Kecleon takes the type of the joker to its right: re-read it when Castform's type changes (its Lua update runs every frame). */
export function sync_kecleons() {
  for (const c of G.jokers.cards.slice()) { const mc = c.config.center; if (mc.key === 'j_poke_kecleon' && mc.update) mc.update(mc, c); }
}
/** The round's FIRST deal (Steamodded hand_drawn while the first hand is dealt: nothing played or discarded yet, once a round):
 *  every card is in hand by then (the first_hand_drawn context runs before the deal's draw events land). */
export const first_deal = (card, context, field = 'forecast_round') => !!(context.hand_drawn && !context.blueprint && G.STATE === G.STATES.DRAW_TO_HAND && G.GAME.current_round
  && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && card.ability.extra[field] !== G.GAME.round);

/** Tatsugiri: the leftmost Water Joker (never Tatsugiri itself) in the joker row. */
// Lunatone / Solrock: the round's day-night cycle. A hand is DAY when the round has played an even number of hands before it
// (the 1st, 3rd, 5th...), NIGHT otherwise; during scoring hands_played is still the count before this hand (run.js adds 1 after).
export const is_day = () => (((G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0) % 2) === 0;
/** For the tooltip: the NEXT hand — this round's next one, or (out of a round: the shop, the blind select) the next round's first, a day. */
export const next_is_day = () => !(G.GAME && G.GAME.facing_blind) || is_day();
/** Cosmic Power: the partner is owned and not debuffed (find_card skips debuffed cards); a Blueprint copy isn't the partner. */
export const cosmic = (card, partner) => !!(G.jokers && find_card(partner).length > 0);
/** Staraptor's Recoil: each hand played costs `recoil` dollars, never past the run's debt limit (bankrupt_at: $0, Credit Card -$20). */
export function recoil(card, context) {
  if (!(context.before && context.cardarea === G.jokers) || context.blueprint) return;
  const lose = card.ability.extra.recoil, buffer = G.GAME.dollar_buffer || 0;
  if ((G.GAME.dollars || 0) + buffer - lose < (G.GAME.bankrupt_at || 0)) return;
  G.GAME.dollar_buffer = buffer - lose;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  ease_dollars(-lose);
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Recoil! -$' + lose, colour: 'MONEY' });
}

// The owner's Combee line (Honey Gather / Attack Order): joker-row ADJACENCY on sell value. Neighbours are poke_get_adjacent_jokers
// (Magneton's / Dolliv's: the Jokers directly left and right; none at a row edge). Honey is Dolliv's end-of-round sell-value growth
// without the self part, by a FIXED amount (`honey`, no energy field) and never from a Blueprint copy (main_eval + !blueprint: once a
// round, so a copied Combee / Vespiquen never feeds twice). A debuffed Combee / Vespiquen is never calculated, so it gives nothing.
/** The Jokers directly left and right of `card` in the joker row (0-2 of them). */
export const hive = (card) => ((G.jokers && G.jokers.cards && G.jokers.cards.includes(card)) ? poke_get_adjacent_jokers(card) : []);
export function honey_gather(card, context) {
  if (!(context.end_of_round && context.main_eval) || context.blueprint) return;
  for (const j of hive(card)) {
    j.ability.extra_value = (j.ability.extra_value || 0) + card.ability.extra.honey;
    j.set_cost();
    card_eval_status_text(j, 'extra', null, null, null, { message: localize('k_val_up'), colour: 'MONEY' });
  }
}

// ------------------------------------------------------------ the Regi trio (Regirock / Regice / Registeel)
export const REGIS = ['j_poke_regirock', 'j_poke_regice', 'j_poke_registeel'];
/** Undebuffed owned jokers of this key (the rule hooks below read them: a debuffed Regi does nothing). */
const regis_held = (key) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === key);
export const unbroken = (c) => !c.destroyed && !c.shattered && !c.removed;
/** Regirock (hook chip_bonus): a Stone card gives the best undebuffed Regirock's `chips1` (100) INSTEAD of its +50 (the card's
 *  perma_bonus stays on top). Only real Stone cards (the get_chip_bonus Stone branch), not while debuffed. */
export function regi_chip_bonus(v, card) {
  if (!v || card.debuff || card.ability.effect !== 'Stone Card' || !G.jokers) return undefined;
  const rocks = regis_held('j_poke_regirock');
  if (!rocks.length) return undefined;
  const best = Math.max(...rocks.map((j) => j.ability.extra.chips1));
  return v + best - ((P_CENTERS.m_stone.config && P_CENTERS.m_stone.config.bonus) || 50);
}
/** Registeel (hook chip_h_x_mult): a held Steel card's own X Mult becomes the best undebuffed Registeel's `Xmult_multi` (X2) instead of
 *  X1.5. It IS the Steel card's held effect (Card:get_chip_h_x_mult), so every retrigger (Mime, a Red Seal) gives it again; a
 *  multiplicative add-on bonus (Nacho's Dhelmise, Pokermon+'s perma_h_x_mult) scales with it whichever hook runs first. */
/** (Gen 5 batch 3: Escavalier's and Durant's "X1.75 instead of X1.5" are the same card-level rule: steel_rule_x takes the best undebuffed
 *  Registeel / Durant / Escavalier, so they never stack — Registeel's X2 wins over both, and two of them give X1.75 once.) */
export function regi_h_x_mult(v, card) {
  // (regional batch A, Alolan Golem's Galvanize: a Stone card held in hand counts as a Steel card for its held X — the Steel card's own
  // X1.5, or the best Registeel / Durant / Escavalier rule's: the same card-level rule, never stacking)
  if (galvanized(card)) return steel_rule_x() || (P_CENTERS.m_steel.config && P_CENTERS.m_steel.config.h_x_mult) || 1.5;
  if (!v || card.debuff || !has_enhancement(card, 'm_steel') || !G.jokers) return undefined;
  const best = steel_rule_x();
  if (!best) return undefined;
  const base = card.ability.h_x_mult || 1.5;
  return v * best / base;
}
/** Alolan Golem, Galvanize: a Stone card (not debuffed, not also a Steel card) held in hand while an undebuffed Alolan Golem is held. */
export const galvanized = (card) => !!(G.jokers && G.hand && card && !card.debuff && card.area === G.hand && has_enhancement(card, 'm_stone')
  && !has_enhancement(card, 'm_steel') && legends('alolan_golem').length > 0);
/** The Stone / Steel card's own tooltip (engine hook enh_loc_vars, describe.js enh_live_vars): the number the two hooks above will
 *  score, from those same functions — Stone +100 (+ its banked perma_bonus) with Regirock, held Steel X2 (energized X2.1 / X2.2 / X2.3)
 *  with Registeel. No undebuffed Regi: undefined (the card's own +50 / X1.5). */
export function regi_enh_vars(vars, card) {
  const ab = card.ability, f = ab.effect === 'Stone Card' ? regi_chip_bonus : ab.effect === 'Steel Card' ? regi_h_x_mult : ab.effect === 'Glass Card' ? glass_x_mult : null;
  const v = f ? f(vars[0], card) : undefined;
  return v === undefined ? undefined : [v, ...vars.slice(1)];
}
/** Burmy's cloaks (the owner's design): the Pokermon type each one's card shows (Gen 4 sheet: Plant Grass, Sandy Earth, Trash Metal;
 *  pokermon_art_type reads all six Burmy / Wormadam cells so) and the colour of its pop-up. */
export const BURMY_CLOAKS = {
  plant: { ptype: 'Grass', name: 'Plant', colour: '#289830' },
  sandy: { ptype: 'Earth', name: 'Sandy', colour: '#e97333' },
  trash: { ptype: 'Metal', name: 'Trash', colour: '#888080' },
};
/** Burmy / Wormadam put a cloak on: its own Pokermon type (ability.extra.ptype) becomes the cloak's, as Castform's form does —
 *  unless a Tera sticker owns the type (the sticker still decides, as on any joker). The debuff and Kecleons are re-read. */
export function set_cloak(card, cloak) {
  const ex = card.ability.extra, c = BURMY_CLOAKS[cloak] || BURMY_CLOAKS.plant;
  const ptype = type_sticker_applied(card) ? ex.ptype : c.ptype;
  const changed = ex.form !== cloak || ex.ptype !== ptype;
  ex.form = cloak;
  ex.ptype = ptype;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
}
// A Burmy evolving into Wormadam keeps its cloak (ability.extra.form, one of the values every evolution keeps): the cloak's type
// lands on the new card once the kept values are restored (the POST_EVOLVE seam). A Mothim has no cloak.
POST_EVOLVE.push((card, from, to) => { if (from === 'j_poke_burmy' && to === 'j_poke_wormadam') set_cloak(card, card.ability.extra.form); });
// the gender signs (m6x11plus draws both since tools/micatro/add_gender_glyphs.py; before it, the text spelt Female / Male)
export const gender_name = (g) => (g === 'male' ? '♂' : '♀');

// ------------------------------------------------------------ the weather trio (Kyogre / Groudon / Rayquaza) and the Eon duo (Latias / Latios)
/** Undebuffed owned jokers of this design (a debuffed one does nothing; a Blueprint copy has its own key, so it never counts). */
export const legends = (name) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === 'j_poke_' + name);
/** Batch E, the Primal Reversions (the owner's "orb version yes", 2026-11-03; consumables in ../primal.js): the Blue Orb / Red Orb turn
 *  a Kyogre / Groudon into Primal Kyogre / Primal Groudon for good. Each Primal stands on its normal form's side of the weather trio: the
 *  clash, the rain / sun checks and Castform's lock read the SIDE (the normal form and its Primal). A Primal always wins the Clash against
 *  a side with no Primal; Primal against Primal, the cards held decide as before; Rayquaza still calms everything. The Orbs reach the
 *  pools (and the Ancient / Future Packs) only on rules rev PRIMAL_REV, so a run recorded before it can't hold a Primal: with none held,
 *  every rule below reads exactly as it did. */
export const PRIMAL_REV = 85;
export const PRIMAL_SIDES = { kyogre: ['j_poke_kyogre', 'j_poke_primal_kyogre'], groudon: ['j_poke_groudon', 'j_poke_primal_groudon'] };
/** contentRev 111 (SIMPLE_TRIO_REV), the owner's simplification (2026-11-09: "Kyogre's tooltip is unreadable"): the six cards are plain,
 *  separate Legendaries with no weather, no Castform and no reference to each other. Kyogre +1 hand, scored Clubs retrigger once and give
 *  X1.25; Groudon +1 discard, scored Hearts / Diamonds X1.25; Rayquaza +1 hand / +1 discard and Dragon Ascent; Primal Kyogre +2 hands,
 *  Clubs retrigger twice and X1.5; Primal Groudon +2 discards, Hearts / Diamonds X1.75; Mega Rayquaza +2 / +2 and X0.4 Ascent. Gone: the
 *  Primal Clash, Rayquaza's calm, Kyogre / Groudon (and the Primals) making rain / sun and locking Castform (it reads its own forecast).
 *  A move re-simulated from a run recorded before r111 (resume / replay; js/mods/pins.js RULES) keeps every old rule below (primal_read,
 *  primal_on, castform_lock, the rain / sun checks), so an old run re-plays exactly; live play is always on the new rules.
 *  The new numbers live in their own config fields (TRIO_FIELDS: Kyogre / Primal Kyogre Xmult_multi, Primal Groudon Xmult_multi2, all at
 *  the standard per-card Energy rate, +5% of base). A card made on an old rev drops them (trio_set: Kyogre / Primal Kyogre stay
 *  Energy-inert there, Primal Groudon keeps X1.5), and one made on an old rev but played on r111 gains them on its next calculate
 *  (trio_fields), scaled by the Energy it already holds. */
export const SIMPLE_TRIO_REV = 111;
export const trio111 = () => rulesRev('pokermon') >= SIMPLE_TRIO_REV;
/** Undebuffed owned jokers of this side (Kyogre / Groudon and its Primal). */
const side = (name) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && PRIMAL_SIDES[name].includes(j.config.center.key));
/** 'kyogre' | 'groudon' | null: the weather-trio side this joker stands on. */
const side_of = (card) => (PRIMAL_SIDES.kyogre.includes(card.config.center.key) ? 'kyogre' : PRIMAL_SIDES.groudon.includes(card.config.center.key) ? 'groudon' : null);
const is_primal = (j) => !!j.config.center.poke_primal;
// (held, a Primal is its species: no second Kyogre / Groudon in the pools while you hold its Primal, as a held Kyogre keeps Kyogre out;
// Showman / the Pokedex still allow it. Only a run on PRIMAL_REV can hold a Primal.)
POKE_POOL_RULES.push((self) => {
  const k = self && self.key;
  if (k !== 'j_poke_kyogre' && k !== 'j_poke_groudon') return undefined;
  if (!find_card('j_poke_primal_' + k.slice(7), true).length || find_joker('Showman').length || find_joker('pokedex').length) return undefined;
  return false;
});
/** Delta Stream is on: an undebuffed Rayquaza, or (Mega batch D, jokers/pokejokers_megas.js) a Mega Rayquaza — Delta Stream is Mega Rayquaza's own
 *  ability. A Mega Rayquaza only exists from MEGA_D_REV on (Rayquaza's `megas` is gated by it), so an older run reads as it did. */
const delta_calm = () => legends('rayquaza').length > 0 || legends('mega_rayquaza').length > 0;
/** Primal Clash's count of the cards held: Castform's Forecast rules (forecast above) for its two sides — Hearts + Diamonds ("red")
 *  vs Clubs; a Wild card counts for both; a debuffed card, a Stone card or a Hazard (no suit: is_suit) for neither. Spades don't count. */
export function clash_count(cards) {
  let red = 0, clubs = 0;
  for (const c of cards) {
    if (c.is_suit('Hearts') || c.is_suit('Diamonds')) red += 1;
    if (c.is_suit('Clubs')) clubs += 1;
  }
  return { red, clubs };
}
/** The round's weather, read ONCE on the round's first deal by whichever of Kyogre / Groudon / Castform reads first (their first_deal),
 *  so Castform sees the same weather wherever it sits: G.GAME.poke_primal = {round, kyogre, groudon, rayquaza, winner, tie, red, clubs}.
 *  Primal Clash: with an undebuffed Kyogre AND Groudon and no Rayquaza, the side with more cards held wins the whole round (Clubs:
 *  Kyogre; Hearts + Diamonds: Groudon); a tie goes to the one with more Energy (its best copy's), still tied Kyogre. The loser's own
 *  +1 hand / +1 discard is taken back for that round (primal_take_back). Delta Stream (Rayquaza held): no clash, winner null. */
export function primal_read() {
  const GM = G.GAME;
  if (GM.poke_primal && GM.poke_primal.round === GM.round) return GM.poke_primal;
  const ky = side('kyogre'), gr = side('groudon'), ray = delta_calm();
  const { red, clubs } = clash_count(G.hand.cards);
  let winner = null, tie = false, primal = null;
  if (ky.length && gr.length && !ray) {
    // (batch E: a Primal on one side only wins every round; a Primal each, or none, the cards held decide)
    const pk = ky.some(is_primal), pg = gr.some(is_primal);
    if (pk !== pg) winner = primal = pk ? 'kyogre' : 'groudon';
    else if (clubs !== red) winner = clubs > red ? 'kyogre' : 'groudon';
    else {
      tie = true;
      const ek = Math.max(...ky.map(get_total_energy)), eg = Math.max(...gr.map(get_total_energy));
      winner = eg > ek ? 'groudon' : 'kyogre';
    }
  }
  GM.poke_primal = { round: GM.round, kyogre: ky.length > 0, groudon: gr.length > 0, rayquaza: ray, winner, tie, red, clubs };
  if (primal) GM.poke_primal.primal = primal;
  if (winner) {
    for (const j of winner === 'kyogre' ? gr : ky) primal_take_back(j);
    const w = (winner === 'kyogre' ? ky : gr)[0];
    card_eval_status_text(w, 'extra', null, null, null, { message: winner === 'kyogre' ? 'Primordial Sea!' : 'Desolate Land!', colour: winner === 'kyogre' ? '#6169ff' : '#f48e62' });
  }
  return GM.poke_primal;
}
/** Is this Kyogre / Groudon working right now? Only the round's clash loser isn't (out of a round — the shop — every one is). */
export function primal_on(card) {
  if (trio111()) return true; // (r111: no clash)
  const GM = G.GAME, P = GM && GM.poke_primal;
  if (!P || !P.winner || !GM.facing_blind || P.round !== GM.round) return true;
  return side_of(card) === P.winner;
}
/** The clash loser's +1 hand (Kyogre) / +1 discard (Groudon) doesn't apply this round: take back what it gave (once a round; never below
 *  1 hand / 0 discards). primal_taken remembers how much, so selling it this round doesn't take it twice. */
function primal_take_back(j) {
  const ex = j.ability.extra, cr = G.GAME.current_round;
  if (ex.primal_off === G.GAME.round) return;
  ex.primal_off = G.GAME.round;
  const n = ex.hands ? Math.max(0, Math.min(cr.hands_left - 1, ex.hands)) : Math.max(0, Math.min(cr.discards_left, ex.d_size || 0));
  ex.primal_taken = n;
  if (n > 0) { if (ex.hands) ease_hands_played(-n); else ease_discard(-n); }
  card_eval_status_text(j, 'extra', null, null, null, { message: localize('k_nope_ex'), colour: 'inactive' });
}
/** Castform's weather lock (its Forecast, first deal): Kyogre held -> Rainy, Groudon -> Sunny; both (the clash) -> the winner's.
 *  Rayquaza (Delta Stream, the weather calmed) -> no lock: Castform reads the normal forecast. null: no lock. */
export function castform_lock() {
  if (trio111()) return null; // (r111: Castform reads its own forecast; no Primal Clash read)
  const P = primal_read();
  if (P.rayquaza) return null;
  if (P.winner) return P.winner === 'kyogre' ? 'rainy' : 'sunny';
  return P.kyogre ? 'rainy' : P.groudon ? 'sunny' : null;
}
/** ... and +1 growth level while owned (Shiftry's `growth`: G.GAME.poke_growth_level, read by the Seed card itself), so a scored Seed
 *  grows 2 a score and blooms in 3 scores instead of 5. Off while debuffed (SMODS removes / re-adds a debuffed joker), carried across
 *  the evolution (set_ability removes Cherubi's, adds Cherrim's). Copies stack, like Shiftry + Brambleghast. */
export const sweet_growth = {
  add_to_deck(self, card) { poke_change_growth_level(card.ability.extra.growth); },
  remove_from_deck(self, card) { poke_change_growth_level(-card.ability.extra.growth); },
};
/** Is it sunny for Cherrim? (a) the round's FIRST deal read red: Castform's own forecast() (Hearts + Diamonds vs Clubs vs Spades,
 *  a tie is not sunny), remembered for the round (`sun_round`); or (b) ONLY BEFORE contentRev 111 (SIMPLE_TRIO_REV) Desolate Land: an undebuffed Groudon is held and working (not
 *  the loser of a Primal Clash this round: primal_on). Rayquaza's Delta Stream keeps Groudon working, so Groudon still means sun
 *  (Rayquaza only un-locks CASTFORM's weather). (b) is live: a Groudon gained or sold mid-round changes it at once. Out of a round
 *  (the shop) only (b) counts. (c) An undebuffed Volcarona held (Gen 5 batch 3: it is always sunny; live, in the shop too). */
const desolate_sun = () => !trio111() && side('groudon').some((j) => primal_on(j)); // (+ Primal Groudon: batch E; none from r111)
export function cherrim_sunny(card) {
  const ex = card.ability.extra, GM = G.GAME;
  return !!((GM && GM.facing_blind && ex.sun_round === GM.round) || desolate_sun() || volcarona_sun());
}
export const seed_tips = (self, info_queue, card) => {
  type_tooltip(self, info_queue, card);
  info_queue.push(P_CENTERS.m_poke_seed);
  info_queue.push({ set: 'Other', key: 'growth_level' });
};
/** Quick Spark: on the round's first hand (current_round.hands_played is 0 while it scores). The tooltip names its state. */
export const spark_on = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played === 0);
export const spark_state = () => (G.GAME && G.GAME.facing_blind && !spark_on() ? 'Used this round' : 'Active!');
/** index.js card_removed: a DEBUFFED Purugly leaving (its remove_from_deck already ran on the debuff) gives its slot back. */
export function slot_cost_removed(card) {
  if (card.ability && card.ability.poke_slot_queued && !card.added_to_deck && G.jokers) {
    G.jokers.config.card_limit += card.ability.poke_slot_queued;
    card.ability.poke_slot_queued = undefined;
  }
}
export const giga_awake = (card) => !((card.ability.extra.slow_start || 0) > 0);

// ---------------------------------------------------------------- Gen 5, batch 4: the Gen 5 Legendaries (contentRev 55; 638-649)
/** Held, undebuffed (find_card skips debuffed cards; a Blueprint is never one): the formes, the Tao pair and Kyurem's partner read it. */
export const legend_held = (name) => !!(G.jokers && find_card('j_poke_' + name).length > 0);
/** Exact sums for scoring (X1.4375 + 0.3 stays X1.7375; r3 is for the text): float noise off, nothing else rounded. */
export const r9 = (x) => Math.round(x * 1e9) / 1e9;
/** The Forces of Nature's formes: Tornadus and Thundurus are Therian while an undebuffed Landorus is held; Landorus while both Tornadus
 *  AND Thundurus are. Live (bought, sold or debuffed, it changes at once): the card's art follows it (poke_view_form). */
export const THERIAN_AT = 4;
export function therian(card) {
  // contentRev 59 (solo): for good after it has been held for THERIAN_AT (4) rounds (`therian_rounds`, counted on the card under every
  // rules rev: the main end_of_round pass, not Blueprint; a debuffed one isn't calculated, so that round doesn't count), a Reveal Glass.
  if (solo59()) return (card.ability.extra.therian_rounds || 0) >= THERIAN_AT;
  const k = card.config.center.key;
  if (k === 'j_poke_landorus') return legend_held('tornadus') && legend_held('thundurus');
  return legend_held('landorus');
}
const forme_name = (card) => (therian(card) ? 'Therian Forme' : 'Incarnate Forme');
/** Thundurus: each scored card rolls 1 in `dem` (Incarnate 4, Therian `dem2` 2; Pokermon's pseudorandom_probability, so Oops! All 6s raises
 *  it and Absol fixes it) to earn `storm_money` ($1); in the Therian Forme a card that pays also gives X`Xmult_multi`. Each retrigger
 *  rolls again; Blueprint rolls its own. */
function thunder_odds(card) { const ex = card.ability.extra; return get_probability_vars(card, ex.num, therian(card) ? ex.dem2 : ex.dem, 'thundurus'); }
/** A typed joker for "each Fire / Lightning Joker gives": is_type (Arceus counts, a Tera sticker counts and replaces), undebuffed. */
export const typed_joker = (j, type) => !!(j && j.ability && j.ability.set === 'Joker' && !j.debuff && is_type(j, type));
/** The end of the round (run.js end_round's first step, before any joker's end_of_round — index.js hook end_round_start): every
 *  tired Pheromosa recovers (the source dropped; the card re-evaluated), so it is undebuffed for the round's end and its Beast Boost. */
export function pheromosa_rest() {
  for (const j of ((G.jokers && G.jokers.cards) || []).slice()) {
    if (j.ability && j.ability.debuff_sources && j.ability.debuff_sources.pheromosa) smods_debuff_card(j, null, 'pheromosa');
  }
}
/** Litten line: the hands already played this round, BEFORE this one (current_round.hands_played is still the pre-hand count while a
 *  hand scores; run.js adds 1 after evaluate_play; reset each round). The round's first hand counts 0. */
export const hands_before = () => (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0;
/** Greninja's own type: its ptype (which is_type / find_pokemon_type / get_type / energy_matches read), as Castform's form; a Tera
 *  sticker still overrides it. Re-run its debuff and re-sync Kecleons when it changes. */
export function protean_set(card, type) {
  const ex = card.ability.extra;
  if (ex.ptype === type) return false;
  ex.ptype = type;
  card.set_debuff();
  sync_kecleons();
  return true;
}
/** Greninja's X: Xmult + Xmult_mod for each OTHER undebuffed joker of its current type (get_type: a Tera sticker's type if it has one). */
export const ninja_others = (card) => { const t = get_type(card); return t ? ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, t)).length : 0; };
/** Serperior, Contrary: while an undebuffed Serperior is owned (find_joker skips a debuffed one), a debuffed PLAYING card that scores is
 *  scored as if it weren't debuffed — the score_debuffed hook (index.js), which run.js score_played_card asks before giving up on a
 *  debuffed card: the debuff is lifted for that card's own scoring (its Chips, enhancement, seal, edition, retriggers and the jokers'
 *  per-card effects) with debuff_lifted set, and restored right after (still debuffed in hand, for the Glass break check, after the
 *  hand). One rule however many Serperiors (each copy gives its own X1.25). A lifted card doesn't trigger the Boss Blind (Matador). */
export const contrary_lifts = (c) => !!(c && c.ability && (c.ability.set === 'Default' || c.ability.set === 'Enhanced') && find_joker('serperior').length);
/** Consumable room (the Blue Seal's check: cards + pending creations < limit). */
export const consumable_room = () => G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) < G.consumeables.config.card_limit;
/** Pidove / Tranquill / Unfezant, Super Luck: +lucky_odds to the numerator of a Lucky card's two rolls (identifiers 'lucky_mult' 1 in 5 and
 *  'lucky_money' 1 in 15), the mod_probability pass Venonat uses for every roll: so it is added BEFORE Oops! All 6s doubles the numerator
 *  ((1 + 1) x 2 = 4 in 5), stacks with Venonat (+1 each) and with other copies, and Absol still fixes it at 0. Never Blueprint. */
const LUCKY_ROLLS = ['lucky_mult', 'lucky_money'];
export function super_luck(card, context) {
  if (context.mod_probability && !context.blueprint && LUCKY_ROLLS.includes(context.identifier)) return { numerator: context.numerator + card.ability.extra.lucky_odds };
  return undefined;
}
/** The Lucky odds now ([Mult num, dem, money num, dem]); a card not held yet (the shop) counts its own +odds, so it shows what it would give. */
export function lucky_odds_vars(card) {
  const own = G.jokers && G.jokers.cards.includes(card) ? 0 : card.ability.extra.lucky_odds;
  return [...get_probability_vars(card, 1 + own, 5, 'lucky_mult'), ...get_probability_vars(card, 1 + own, 15, 'lucky_money')].map(r3);
}
/** Tympole / Palpitoad / Seismitoad, Swift Swim: is it RAINING? (a) the round's FIRST deal read Clubs: Castform's own forecast() says Rainy
 *  (Clubs held more than Hearts + Diamonds and more than Spades; a tie is not), remembered for the round (`rain_round`); or (b), ONLY
 *  BEFORE contentRev 111 (SIMPLE_TRIO_REV: Kyogre makes no rain since), a working
 *  Kyogre: held, undebuffed and not the loser of this round's Primal Clash (primal_on) — so on Groudon's round of a clash it isn't raining
 *  (and the forecast can't be Rainy either: Groudon only wins with at least as many red cards as Clubs). Rayquaza's calm keeps Kyogre
 *  working. (b) is live. Groudon alone doesn't stop a Clubs forecast (Cherrim's sun the other way round). Out of a round only (b) counts. */
const kyogre_rain = () => !trio111() && side('kyogre').some((j) => primal_on(j)); // (+ Primal Kyogre: batch E; none from r111)
export function swift_swim_raining(card) {
  const ex = card.ability.extra, GM = G.GAME;
  return !!((GM && GM.facing_blind && ex.rain_round === GM.round) || kyogre_rain());
}
export function rain_read(card, context) {
  if (!first_deal(card, context)) return false;
  const ex = card.ability.extra;
  ex.forecast_round = G.GAME.round;
  if (forecast(G.hand.cards) === 'rainy') ex.rain_round = G.GAME.round;
  if (swift_swim_raining(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Swift Swim!', colour: CASTFORM_FORMS.rainy.colour });
  return true;
}
export const rain_state = (card) => (swift_swim_raining(card) ? 'Raining!' : G.GAME && G.GAME.facing_blind && card.ability.extra.forecast_round === G.GAME.round ? 'Not raining' : 'Not raining yet');
const CLOTH_WORD = { m_bonus: 'Bonus', m_mult: 'Mult', m_lucky: 'Lucky', m_wild: 'Wild' };
/** (The Gen 6 Spewpa / Vivillon reuse it: one Wild card, their own seed.) */
export function tailor(card, context, cloths, seed = 'poke_sewaddle_tailor') {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed(seed));
  const cloth = cloths.length > 1 ? pseudorandom_element(cloths, pseudoseed('poke_tailor_cloth'))[0] : cloths[0];
  pick.set_ability(P_CENTERS[cloth], null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 ' + CLOTH_WORD[cloth], colour: 'GREEN' });
}

/** Yamask / Cofagrigus: the first GRUDGE_CAP OTHER Jokers you sell each round (Yamask 1, Cofagrigus 2; the round is G.GAME.round, from
 *  selecting a Blind to selecting the next, its shop included) each bank +Xmult_mod X Mult (`grudge_Xmult` from X1, no energy field:
 *  never retroactive; carried through the evolution). Not Blueprint. A Joker Cofagrigus mummifies counts as sold for this (mummy_sell
 *  below) and uses up one of the round's grudges like any sale. The count is kept per card: `grudge_round` (the round counted) and
 *  `grudge_count` (grudges banked in it), both carried through the evolution (poke_custom_values_to_keep), so a Yamask that banked its 1
 *  this round evolves into a Cofagrigus with 1 left (2 in all that round, never a fresh 2). Neither is an energy field.
 *  contentRev 58 (the owner's nerf: it was every sale, uncapped). A re-simulated move recorded before r58 (a resumed or replayed old run,
 *  js/mods/pins.js RULES) banks every sale as it did, so a bank already earned stays; it still counts, so a run that switches to r58
 *  mid-round has that round's grudges used up. */
const YAMASK_LINE = ['j_poke_yamask', 'j_poke_cofagrigus'];
const GRUDGE_CAP = { j_poke_yamask: 1, j_poke_cofagrigus: 2 };
const nerf58 = () => rulesRev('pokermon') >= 58;
/** Pokermon r68 (the Komala fix): Joker effects skip Komala when choosing what to destroy, as an Eternal (index.js hooks.joker_destroy_immune ->
 *  the engine's can_be_destroyed_by_joker). On r65-r67 they targeted it, it refused (no_destroy) and the destroyer still took its gain
 *  (Ceremonial Dagger's +2x sell value every Blind): a recorded run replays as recorded. */
export const komala_destroy_immune = (card) => (card && card.ability && card.ability.name === 'komala' && rulesRev('pokermon') >= 68 ? true : undefined);
export const grudge_cap = (card) => GRUDGE_CAP[card.config.center.key] || 1;
export const grudge_used = (card) => { const ex = card.ability.extra; return G.GAME && ex.grudge_round === G.GAME.round ? (ex.grudge_count || 0) : 0; };
export function grudge(card) {
  if (!G.GAME) return;
  const used = grudge_used(card);
  if (nerf58() && used >= grudge_cap(card)) return;
  const ex = card.ability.extra;
  ex.grudge_round = G.GAME.round;
  ex.grudge_count = used + 1;
  bank(card, 'grudge_Xmult', 'Xmult_mod', 1, 'XMULT');
}
export function grudge_main(card, context) {
  const x = card.ability.extra.grudge_Xmult;
  if (context.joker_main && x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
  return undefined;
}
/** Cofagrigus, Mummy (the sell_instead hook, index.js; run.js asks it before a player's sale): the FIRST Joker you sell each ANTE
 *  (contentRev 58, was each round; keyed by G.GAME.round_resets.ante in G.GAME.poke_mummy_ante: it re-arms when the Ante goes up, i.e.
 *  when the Boss Blind is beaten, so the shop after a Boss is already the next Ante's; one for the whole row, however many Cofagrigus)
 *  is NOT sold while an undebuffed Cofagrigus other than that Joker is held (find_card: a Blueprint is not one, so it can't copy
 *  Mummy). The Joker stays and becomes Negative instead (its old edition replaced; the Negative's +1 Joker slot makes room for it), no
 *  money is paid, and the vanilla sell contexts (selling_self / selling_card) don't run: nothing was sold. It still counts as a sale for
 *  the Yamask line's X (every undebuffed Yamask / Cofagrigus but the mummified one, within its round's grudges). An already Negative
 *  Joker is sold as usual, and uses up the Ante's Mummy (it was that Ante's first sale). A consumable is never mummified. A move
 *  recorded before r58 (pins.js RULES) keeps the old once-a-round key, G.GAME.poke_mummy_round; a Mummy used under it this round reads
 *  as used for the rest of this Ante too (a run that switched rules mid-round). -> true to keep it. */
export const mummy_used = () => {
  if (!G.GAME) return false;
  if (G.GAME.poke_mummy_round !== undefined && G.GAME.poke_mummy_round === G.GAME.round) return true;
  return nerf58() && G.GAME.poke_mummy_ante !== undefined && G.GAME.poke_mummy_ante === G.GAME.round_resets.ante;
};
export function mummy_sell(sold) {
  if (!sold || !sold.ability || sold.ability.set !== 'Joker' || sold.area !== G.jokers || !G.GAME) return false;
  const coffins = find_card('j_poke_cofagrigus').filter((j) => j !== sold);
  if (!coffins.length || mummy_used()) return false;
  if (nerf58()) G.GAME.poke_mummy_ante = G.GAME.round_resets.ante;
  else G.GAME.poke_mummy_round = G.GAME.round;
  if (sold.edition && sold.edition.negative) return false;
  sold.set_edition({ negative: true });
  for (const j of G.jokers.cards) if (j !== sold && !j.debuff && YAMASK_LINE.includes(j.config.center.key)) grudge(j);
  card_eval_status_text(coffins[0], 'extra', null, null, null, { message: 'Mummy!', colour: 'DARK_EDITION' });
  emit('card_changed', { card: sold.sort_id });
  return true;
}

/** The fossils' Ancient (Kabuto's / Omanyte's cumulative tiers, pokejokers_05): how many cards of rank `id` are in the SCORING hand, read
 *  live from context.scoring_hand (no state kept between contexts). A Stone card has no rank. */
export const ancient_tip = (info_queue, rank) => info_queue.push({ set: 'Other', key: 'ancient', vars: [localize(rank, 'ranks')] });
export const ancient_count = (context, id) => (context.scoring_hand || []).filter((c) => !has_no_rank(c) && c.get_id() === id).length;
/** The 3+ tier fired: counts toward evolving (`third_times`, "Trigger 3+ ability 5 times"), never from a Blueprint or a retrigger. */
export const ancient_third = (card, context) => { if (!context.blueprint && !context.retrigger_joker) card.ability.extra.third_times = (card.ability.extra.third_times || 0) + 1; };

/** Escavalier / Durant (and the owner's Registeel): the value a held Steel card's X becomes, INSTEAD of X1.5 — a card-level rule
 *  (regi_h_x_mult below, the chip_h_x_mult hook), so the best one wins and they never stack: Registeel X2 (`Xmult_multi`), Durant X1.75
 *  (`Xmult_multi`, energized), Escavalier X1.75 (`steel_x`, fixed: its Energy goes to its own X1.5). Only undebuffed ones count. */
const STEEL_RULES = { j_poke_registeel: 'Xmult_multi', j_poke_durant: 'Xmult_multi', j_poke_escavalier: 'steel_x' };
export function steel_rule_x() {
  let best = 0;
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const f = !j.debuff && STEEL_RULES[j.config.center.key];
    if (f && j.ability.extra[f] > best) best = j.ability.extra[f];
  }
  return best || undefined;
}

/** Accelgor: +hands hand and +d_size discard each round while held (Kyogre's / Vibrava's pairs in ONE add / remove, as discards_scry:
 *  two spread pairs would overwrite each other), and +mult Mult for each hand left (current_round.hands_left while it scores: the hand
 *  being scored is already used, so the round's last hand counts 0). */
export const hands_discards = {
  add_to_deck(self, card, from_debuff) {
    const ex = card.ability.extra;
    G.GAME.round_resets.hands += ex.hands;
    if (!from_debuff) ease_hands_played(ex.hands);
    G.GAME.round_resets.discards += ex.d_size;
    ease_discard(ex.d_size);
  },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    G.GAME.round_resets.hands -= ex.hands;
    const dec = Math.min(G.GAME.current_round.hands_left - 1, ex.hands);
    if (dec > 0) ease_hands_played(-dec);
    G.GAME.round_resets.discards -= ex.d_size;
    ease_discard(-ex.d_size);
  },
};

/** Amoonguss, Spore: during the round's FIRST hand the Boss Blind's ability is off, and it comes back once that hand has scored. The engine's
 *  Blind.suspend (blind.js): from the round's first deal (index.js draw_from_deck_to_hand, before the dealt cards land, so The House / The
 *  Wheel / The Mark / The Fish don't flip them and Cerulean Bell forces nothing) to the end of the first hand's scoring (index.js
 *  hand_scored; discards before it are inside). Meanwhile the Blind is `off` for every rule it applies in play: its debuffed cards and
 *  jokers are lifted at once (The Goad / Head / Club / Window / Plant / Pillar, Verdant Leaf), hands aren't debuffed (The Psychic, The Eye,
 *  The Mouth, The Arm, The Ox: nor recorded, so The Eye / The Mouth start with the second hand), The Flint doesn't halve, The Hook / The
 *  Tooth do nothing on that play, and a mod blind's calculate sees itself disabled (Pokermon's six). Its set-up at selection stays (The
 *  Wall / Violet Vessel's size, The Water / The Needle / The Manacle's counts, Amber Acorn's shuffle, White Executive's debuffed cards).
 *  It is not Blind:disable: nothing is undone for good, so a Chicot or Luchador during the first hand still disables the Blind for good.
 *  Once per round, Boss Blinds only, with an undebuffed Amoonguss held at the first deal; sold or debuffed meanwhile (no other Amoonguss
 *  left), the Blind comes back at once. */
export function spore_first_deal() {
  const GM = G.GAME, b = GM && GM.blind, cr = GM && GM.current_round;
  if (!b || !GM.facing_blind || !b.boss || b.disabled || b.suspended || !cr || cr.hands_played !== 0 || cr.discards_used !== 0) return;
  if (G.STATE !== G.STATES.DRAW_TO_HAND || GM.poke_spore_round === GM.round) return;
  const spores = find_card('j_poke_amoonguss');
  if (!spores.length) return;
  GM.poke_spore_round = GM.round;
  b.suspend(true);
  card_eval_status_text(spores[0], 'extra', null, null, null, { message: 'Spore!', colour: 'GREEN' });
}
export function spore_hand_scored() {
  const b = G.GAME && G.GAME.blind;
  if (b && b.suspended) b.suspend(false);
}
/** The Tynamo line: Steel cards in the full deck (any card counting as one) / held in hand (not debuffed). */
export const steel_in_deck = () => (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_steel')).length;

/** Beartic, Freeze: at each end of round (the main pass, not Blueprint, not a game over) the LEFTMOST card held in hand is frozen
 *  (card.ability.poke_frozen = this Beartic's sort_id): it STAYS IN YOUR HAND into the next round (index.js keep_in_hand: run.js leaves it
 *  in the hand when the round's end empties it, and when a pack opened in the shop closes), and the next round's deal fills around it
 *  (the hand is dealt up to its size, the frozen card already counting). While frozen it gives X(Xmult_multi) when a hand scores (a held
 *  effect: Mime and held retriggers repeat it; Blueprint copies it). It thaws once it is played or discarded (index.js play_pressed /
 *  discard_card; an effect discard such as The Hook's too), or when it leaves the hand any other way. At most ONE card per Beartic: while
 *  its frozen card is still held at the end of a round it stays frozen and nothing else is (it is held one more round); once it has thawed,
 *  the next end of round freezes the leftmost held card again. A card another Beartic froze is skipped (two Beartics freeze two cards).
 *  A Beartic sold or destroyed leaves its card unfrozen: it goes back to the deck at the next end of round. A debuffed Beartic gives no X
 *  and freezes nothing new, but its frozen card stays. Nothing to save by hand: a resumed run is rebuilt from its recipe, so the same card
 *  is frozen again. */
export const frozen_by = (c) => {
  const id = c && c.ability && c.ability.poke_frozen;
  if (id === undefined || id === null) return null;
  return ((G.jokers && G.jokers.cards) || []).find((j) => j.sort_id === id && j.config.center.key === 'j_poke_beartic') || null;
};
export function freeze_keep(c) { return !!(c && c.area === G.hand && frozen_by(c)); }
export function freeze_thaw(cards) { for (const c of cards || []) if (c && c.ability && c.ability.poke_frozen !== undefined) { delete c.ability.poke_frozen; emit('card_changed', { card: c.sort_id }); } }

/** Rufflet / Braviary: facing a Boss Blind (G.GAME.blind.boss while a Blind is faced; a disabled Boss is still a Boss). */
export const boss_now = () => !!(G.GAME && G.GAME.facing_blind && G.GAME.blind && G.GAME.blind.boss);
export const discards_used = () => (G.GAME && G.GAME.current_round && G.GAME.current_round.discards_used) || 0;

/** Volcarona: while an undebuffed one is held it is ALWAYS SUNNY. It ADDS sun to the shared check (cherrim_sunny: Cherrim's Sunshine
 *  Form, Larvesta) and Castform turns Sunny on its first deal; it doesn't touch rain (a Clubs first deal still rains). Before contentRev
 *  111 (SIMPLE_TRIO_REV; Kyogre / Groudon have no weather since): Kyogre still rains (Swift Swim) and Kyogre's lock
 *  or Primal Clash win keeps Castform Rainy (Volcarona doesn't override Kyogre), and the Primal Clash itself is read as before (a held
 *  Volcarona is not a side). So with Kyogre and Volcarona it is both raining and sunny. Live: bought or sold mid-round, it changes the
 *  sun checks at once (not Castform's form, which holds for the round). */
export const volcarona_sun = () => legends('volcarona').length > 0 || legends('koraidon').length > 0; // (+ Koraidon, Orichalcum Pulse: Gen 9 batch 4)
/** Larvesta: the round's FIRST deal reads the sun (Castform's forecast: Hearts + Diamonds held most), remembered for the round
 *  (`sun_round`, Cherrim's field), so cherrim_sunny answers for it as for Cherrim. */
export function sun_read(card, context) {
  if (!first_deal(card, context, 'sunread_round')) return false;
  const ex = card.ability.extra;
  ex.sunread_round = G.GAME.round;
  if (forecast(G.hand.cards) === 'sunny') ex.sun_round = G.GAME.round;
  if (cherrim_sunny(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Sunny!', colour: CASTFORM_FORMS.sunny.colour });
  return true;
}
export const sun_state = (card) => (cherrim_sunny(card) ? 'Sunny!' : G.GAME && G.GAME.facing_blind && card.ability.extra.sunread_round === G.GAME.round ? 'Not sunny' : 'Not sunny yet');
export const face_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_face());
/** Malamar, Topsy-Turvy (hook chip_bonus, a Card:get_chip_bonus wrap, Regirock's seam): while an undebuffed Malamar is held, every playing
 *  card's chip bonus uses the Chips of its FLIPPED rank instead of its own rank's (2 <-> Ace, 3 <-> King, 4 <-> Queen, 5 <-> Jack,
 *  6 <-> 10, 7 <-> 9, 8 stays 8): a 2 scores 11, an Ace 2, a King 3, a 6 10. Only the rank's part changes: the enhancement's bonus (a
 *  Bonus card's +30) and the card's own perma_bonus (Hiker's +5 a score, Tirtouga's +5) stay on top. A Stone card (no rank; it replaces
 *  the base card) and any rankless card are unaffected; a debuffed card scores 0 as usual; a rank outside 2-Ace (an add-on's) keeps its
 *  Chips. Two Malamars flip once (it is a rule, not a stacking bonus). Card level, so a retrigger (Hack, Hawlucha) scores the flipped
 *  Chips again, and every reader of a card's Chips sees them. */
const FLIP = { 2: 14, 3: 13, 4: 12, 5: 11, 6: 10, 7: 9, 8: 8, 9: 7, 10: 6, 11: 5, 12: 4, 13: 3, 14: 2 };
const rank_chips = (id) => (id === 14 ? 11 : id >= 11 ? 10 : id);
const malamar_on = () => ((G.jokers && G.jokers.cards) || []).some((j) => !j.debuff && (j.config.center.key === 'j_poke_malamar' || j.config.center.key === 'j_poke_mega_malamar'));
/** The flipped rank's Chips for a card (undefined: no flip applies). Exported for the tests / tooltips. */
export function flipped_chips(card) {
  if (!card || !card.base || card.ability.set === 'Joker' || card.ability.effect === 'Stone Card' || card.config.center.replace_base_card || card.config.center.no_rank) return undefined;
  const f = FLIP[card.base.id];
  return f === undefined ? undefined : rank_chips(f);
}
export function malamar_chip_bonus(v, card) {
  if (!card || card.debuff || !G.jokers || !malamar_on()) return undefined;
  const f = flipped_chips(card);
  if (f === undefined || typeof card.base.nominal !== 'number') return undefined;
  return v - card.base.nominal + f;
}
/** One random card of the FULL deck becomes `enh` (seeded): unenhanced cards first; once none is left, any card that isn't already
 *  `enh` (its enhancement replaced; seal and edition kept), never a card being destroyed nor one in `skip`. -> the card, or undefined. */
export function deck_convert(enh, seed, skip) {
  const live = (G.playing_cards || []).filter((c) => unbroken(c) && !(skip && skip.includes(c)));
  const plain = live.filter((c) => c.config.center.key === 'c_base');
  const pool = plain.length ? plain : live.filter((c) => c.config.center.key !== enh);
  if (!pool.length) return undefined;
  const [pick] = pseudorandom_element(pool, pseudoseed(seed));
  pick.set_ability(P_CENTERS[enh], null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  return pick;
}
/** Skrelp: +mult Mult per Hazard card in the full deck (any card counting as one). */
export const hazards_in_deck = () => (G.playing_cards || []).filter((c) => unbroken(c) && has_enhancement(c, 'm_poke_hazard')).length;
/** Dragalge: each Hazard card HELD in hand (not debuffed) gives X(Xmult_multi) (Galvantula's held shape: Mime repeats it). */
export function hazard_held_x(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_poke_hazard')) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
/** Sandygast / Palossand, Sand castle: each time a Stone card scores (has_enhancement: a quantum Stone too; each retrigger is another
 *  score), Sandygast banks +chip_mod Chips (`castle_chips`), Palossand +Xmult_mod X Mult (`castle_Xmult`, from X1) instead, still giving
 *  the Chips it carried. Banks in no energy field (never retroactive); not Blueprint for the gain (Blueprint copies the score). */
export const stone_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_stone'));
/** Pyukumuku, Innards Out: the payout when it leaves — `innards_money` ($1, fixed) per round held (`held_rounds`). */
export const innards_payout = (card) => (card.ability.extra.innards_money || 0) * (card.ability.extra.held_rounds || 0);
export function innards_out(card) {
  const n = innards_payout(card);
  if (n <= 0) return;
  ease_dollars(n);
  card_eval_status_text(card, 'extra', null, null, null, { message: '$' + n, colour: 'MONEY' });
}
/** index.js hooks.start_dissolve (Drifblim's): an owned, undebuffed Pyukumuku being destroyed (Ceremonial Dagger, Madness, Bewear, Hex, Ankh,
 *  a Pokermon eater...) pays out; a saved one (no_destroy) never gets here; selling pays through selling_self. */
export function pyukumuku_destroyed(card) {
  if (!card || card.debuff || card.removed || !G.jokers || card.area !== G.jokers) return;
  if (!card.config || !card.config.center || card.config.center.key !== 'j_poke_pyukumuku') return;
  innards_out(card);
}
/** Dubwool, Cotton Guard: when a Boss Blind is selected, +hands hand for that round (ease_hands_played; once a round, `guard_round`; not
 *  Blueprint). At the main end of round an unused one is taken back before the cash-out counts hands (so it never pays $1 there); sold
 *  mid-round, it takes it back too (never the last hand). */
export function cotton_guard(card, context) {
  const ex = card.ability.extra;
  if (context.setting_blind && !context.blueprint && !context.retrigger_joker && G.GAME.blind && G.GAME.blind.boss && ex.guard_round !== G.GAME.round) {
    ex.guard_round = G.GAME.round;
    ease_hands_played(ex.hands);
    card_eval_status_text(card, 'extra', null, null, null, { message: '+' + ex.hands + ' Hand', colour: 'CHIPS' });
  }
  if (round_end(context) && !context.blueprint && ex.guard_round === G.GAME.round) {
    ex.guard_round = -1;
    const back = Math.min(ex.hands, G.GAME.current_round.hands_left);
    if (back > 0) ease_hands_played(-back);
  }
}
export const guard_on = (card) => !!(G.GAME && G.GAME.facing_blind && card.ability.extra.guard_round === G.GAME.round);
/** Silicobra, Sand Spit: each card the PLAYER discards (the pre_discard of a real discard: Trapinch's rule, `hook` set by every effect that
 *  discards for you) that is unenhanced has a num in dem chance (pseudorandom_probability on 'silicobra_spit': Oops! / Venonat raise it,
 *  Absol fixes it) to become a Stone card as it goes. Enhanced cards never roll (it never overwrites). Blueprint copies it (its own roll). */
let spit_hand = null;
export function sand_spit(card, context) {
  if (context.pre_discard) { spit_hand = context.hook ? null : context.full_hand; return undefined; }
  if (!(context.discard && context.other_card && spit_hand && spit_hand.includes(context.other_card))) return undefined;
  const c = context.other_card;
  if (c.config.center.key !== 'c_base' || !unbroken(c)) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'silicobra_spit', ex.num, ex.dem, 'silicobra_spit')) return undefined;
  c.set_ability(P_CENTERS.m_stone, null, true);
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Sand Spit!', colour: '#e1c019' });
  return undefined;
}
/** The Impidimp line, Prankster (the reroll_cost / reroll_shop / shop_start hooks, index.js):
 *  - Impidimp (and Morgrem, r73; and Grimmsnarl, r75): a PAID reroll costs $reroll_discount less per undebuffed one (they stack), never
 *    below $1; a free one stays free.
 *  - Morgrem / Grimmsnarl: the FIRST reroll in each shop is free while an undebuffed one is held — one free reroll however many are held,
 *    and none on top of another free reroll (Chaos the Clown's, Bidoof's, a D6 Tag's $0): it is the shop's FIRST reroll, so whatever made
 *    that one free uses it up. Like Chaos's, it never raises the next reroll's price (it is spent as one of the engine's free rerolls).
 *  "Each shop" is counted from the shop opening (shop_start), so one bought mid-shop gives it only if nothing has been rerolled yet. */
const prank_held = (key) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === key);
const prank_free_held = () => prank_held('j_poke_morgrem').length + prank_held('j_poke_grimmsnarl').length > 0;
/** r73 (the owner's): Morgrem keeps Impidimp's discount (its own `reroll_discount`, stacking with Impidimps' as theirs do). Moves recorded
 *  before r73 (js/mods/pins.js RULES) price rerolls without it. Grimmsnarl got it at r75 (below). */
const prank_discount73 = () => rulesRev('pokermon') >= 73;
/** r75 (the owner's): Grimmsnarl keeps the discount too (its own `reroll_discount`, stacking with Impidimps' / Morgrems'). Moves recorded
 *  before r75 price rerolls without it. A Grimmsnarl made on older rules has no `reroll_discount` field, so it gives the base $1. */
const prank_discount75 = () => rulesRev('pokermon') >= 75;
const prank_discounters = () => [
  ...prank_held('j_poke_impidimp'),
  ...(prank_discount73() ? prank_held('j_poke_morgrem') : []),
  ...(prank_discount75() ? prank_held('j_poke_grimmsnarl') : []),
];
const prank_discount_of = (j) => (typeof j.ability.extra.reroll_discount === 'number' ? j.ability.extra.reroll_discount
  : j.config.center.key === 'j_poke_grimmsnarl' ? P_CENTERS.j_poke_grimmsnarl.config.extra.reroll_discount : 0);
export const shop_rerolls = () => (G.GAME && G.GAME.current_round && G.GAME.current_round.poke_shop_rerolls) || 0;
export function prank_reroll_cost(cost) {
  if (!G.GAME || !G.GAME.current_round || !G.jokers) return undefined;
  const cr = G.GAME.current_round;
  cr.poke_prank_free = false;
  let c = cost;
  if (c > 0) {
    const off = prank_discounters().reduce((s, j) => s + prank_discount_of(j), 0);
    if (off) c = Math.max(1, c - off);
  }
  if (c > 0 && (cr.free_rerolls || 0) <= 0 && shop_rerolls() === 0 && prank_free_held()) { c = 0; cr.poke_prank_free = true; }
  return c === cost ? undefined : c;
}
/** reroll_shop hook (sync, before the reroll's queued event): a reroll Prankster made free is spent as one of the engine's free rerolls
 *  (the event then neither raises the price nor counts it as paid), and the shop's reroll count goes up. */
export function prank_reroll_shop() {
  const cr = G.GAME.current_round;
  if (cr.poke_prank_free) { cr.free_rerolls = (cr.free_rerolls || 0) + 1; cr.poke_prank_free = false; }
  cr.poke_shop_rerolls = shop_rerolls() + 1;
}
export function prank_shop_start() {
  G.GAME.current_round.poke_shop_rerolls = 0;
  calculate_reroll_cost(true);
}
export const alcremie_cell = (i) => (i < 3 ? { x: 10 + 2 * i, y: 0 } : { x: ((i - 3) % 8) * 2, y: 1 + Math.floor((i - 3) / 8) });
/** The round's weather as Castform reads it on the round's first deal (Volcarona brings the sun, else the suit held most: forecast; before
 *  contentRev 111 Kyogre / Groudon also locked it: castform_lock). Read by Eiscue on that same first deal. */
export const round_forecast = () => { const lock = castform_lock(); return lock === 'rainy' ? lock : volcarona_sun() ? 'sunny' : lock || forecast(G.hand.cards); };
/** SNOW, the house snow (the owner's regional batch A, Alolan Sandshrew / Sandslash / Ninetales; beside cherrim_sunny, swift_swim_raining
 *  and is_sandstorm): is it SNOWY for this card? (a) the round's FIRST deal's forecast is Snowy (round_forecast, Castform's own read: Spades
 *  held most, unless Volcarona brings the sun; before r111 Kyogre / Groudon locked it), remembered on the card for the round (`snowy_round`,
 *  read once a round on `snowread_round`); or (b) Snow Warning: an undebuffed Alolan Ninetales is held — every round is snowy, live (bought,
 *  sold or debuffed, it changes at once; the shop too). Snow ADDS to the other weathers, never removes one: rain, Volcarona's sun and a sandstorm all hold beside it, and Castform's form never changes for it (its Forecast stands). Out of a round only
 *  (b) counts. */
export const snow_warning = () => legends('alolan_ninetales').length > 0;
export function is_snowy(card) {
  const ex = card && card.ability && card.ability.extra, GM = G.GAME;
  return !!((GM && GM.facing_blind && ex && ex.snowy_round === GM.round) || snow_warning());
}
/** The snow readers' first-deal read (Swift Swim's rain_read shape): true on the round's first deal (consumed). */
export function snow_read(card, context, message) {
  if (!first_deal(card, context, 'snowread_round')) return false;
  const ex = card.ability.extra;
  ex.snowread_round = G.GAME.round;
  if (round_forecast() === 'snowy') ex.snowy_round = G.GAME.round;
  if (message && is_snowy(card)) card_eval_status_text(card, 'extra', null, null, null, { message, colour: CASTFORM_FORMS.snowy.colour });
  return true;
}
export const snow_state = (card) => (is_snowy(card) ? 'Snowy!' : G.GAME && G.GAME.facing_blind && card.ability.extra.snowread_round === G.GAME.round ? 'Not snowy' : 'Not snowy yet');
/** Mr. Rime, Screen Cleaner: the Boss Blind's ability is off for your FINAL hand of the round (Amoonguss's Blind.suspend): from the draw that
 *  leaves exactly 1 hand to play (index.js draw_from_deck_to_hand -> rime_final_deal, before the drawn cards land) until that hand has
 *  scored (spore_hand_scored). A hand gained during it (+1 hand) makes the next one the final hand: off again then. Boss Blinds only, with
 *  an undebuffed Mr. Rime held at that draw; sold or debuffed meanwhile (no other one left), the Blind comes back at once. */
export function rime_final_deal() {
  const GM = G.GAME, b = GM && GM.blind, cr = GM && GM.current_round;
  if (!b || !GM.facing_blind || !b.boss || b.disabled || b.suspended || !cr || cr.hands_left !== 1) return;
  if (G.STATE !== G.STATES.DRAW_TO_HAND) return;
  const rimes = find_card('j_poke_mrrime');
  if (!rimes.length) return;
  b.suspend(true);
  card_eval_status_text(rimes[0], 'extra', null, null, null, { message: 'Screen Cleaner!', colour: 'BLUE' });
}
/** Basculegion, Last Respects: Jokers sold or destroyed this RUN (G.GAME.poke_jokers_gone, counted from the run's start by index.js: every
 *  Joker sold from your row, and every one of yours destroyed — start_dissolve —; a transformation never; a late buy counts them all). */
export function jokers_gone_count(card) {
  if (!G.GAME || !card || !card.ability || card.ability.set !== 'Joker' || card.area !== G.jokers || card.removed) return;
  G.GAME.poke_jokers_gone = (G.GAME.poke_jokers_gone || 0) + 1;
}
/** Glastrier, Chilling Neigh (hook chip_x_mult): a Glass card's X Mult becomes the best undebuffed Glastrier's `Xmult_multi` (X2.5) INSTEAD of
 *  X2 — a card-level rule like Registeel's Steel (regi_h_x_mult): it IS the Glass card's own X (Card:get_chip_x_mult), so retriggers repeat
 *  the new value, a perma X on the card scales with it, and two Glastriers give it once (the best wins; GLASS_RULES takes any later Glass-X
 *  rule the same way). Only real Glass cards (ability.effect), never debuffed ones. */
const GLASS_RULES = { j_poke_glastrier: 'Xmult_multi' };
export function glass_rule_x() {
  let best = 0;
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const f = !j.debuff && GLASS_RULES[j.config.center.key];
    if (f && j.ability.extra[f] > best) best = j.ability.extra[f];
  }
  return best || undefined;
}
export function glass_x_mult(v, card) {
  if (!v || card.debuff || card.ability.effect !== 'Glass Card' || !G.jokers) return undefined;
  const best = glass_rule_x();
  if (!best) return undefined;
  const base = card.ability.x_mult || 2;
  return v * best / base;
}
export const x_main = (x) => (x > 1 ? { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x } : undefined);
/** Pawmot, Revival Blessing: ONCE PER ANTE (`blessing_ante`, the Ante it was used in; fixed, no energy field), when ANOTHER of your Jokers is
 *  DESTROYED (index.js hooks.start_dissolve: Ceremonial Dagger, Madness, Hex, Ankh, Bewear, Cursola's crumble, Mr. Bones... every destroying
 *  path ends in Card:start_dissolve; SELLING never does, and neither does an evolution or a Pokermon / food self-removal — Gros Michel,
 *  Ice Cream, Jelly Donut, the eggs: those are "eaten", not destroyed), an undebuffed Pawmot (the first ready one, row order) brings it back
 *  AT ONCE: a copy_card copy (Ankh's / Invisible Joker's: the same center, edition — Negative too, its own slot —, Eternal / Perishable (with
 *  its tally) / Rental stickers, Tera sticker, Energy and every banked value: card.ability exactly as it was when destroyed), placed in the
 *  destroyed Joker's own position (it takes the freed slot, so the row never grows). It comes back UNDEBUFFED (a fresh card: Crimson Heart's
 *  pick doesn't carry; a lasting source — a Perishable's end, an SMODS debuff source — is re-read at once). Only with room: if the row is
 *  already full without it (other cards + pending creations, G.GAME.joker_buffer, at the limit), nothing comes back and the blessing stays
 *  ready. Not Blueprint (a hook, not a context). */
export function pawmot_revive(card) {
  if (!card || card.removed || !G.jokers || card.area !== G.jokers || !card.ability || card.ability.set !== 'Joker' || !G.GAME) return;
  const ante = G.GAME.round_resets.ante;
  const p = G.jokers.cards.find((j) => j !== card && !j.debuff && !j.removed && j.config.center.key === 'j_poke_pawmot' && j.ability.extra.blessing_ante !== ante);
  if (!p) return;
  const others = G.jokers.cards.filter((j) => j !== card).length;
  if (others + (G.GAME.joker_buffer || 0) >= G.jokers.config.card_limit) return;
  p.ability.extra.blessing_ante = ante;
  const at = G.jokers.cards.indexOf(card);
  const back = copy_card(card);
  back.debuff = false;
  back.ability.queue_negative_removal = undefined;
  back.add_to_deck();
  G.jokers.emplace(back, at + 1); // (1-based: in front of the leaving card, which then goes: the copy holds its place)
  emit('materialize', { card: back.sort_id });
  back.set_debuff();
  card_eval_status_text(p, 'extra', null, null, null, { message: 'Revival Blessing!', colour: 'GREEN' });
  G.E_MANAGER.add_event(() => { back.juice_up(); });
}

// ---------------------------------------------------------------- Gen 9, batch 2 (contentRev 77; the owner's "Yes", 2026-11-03), #951-1013
/** Flittle / Espathra, Opportunist: whenever ANOTHER Joker in your row permanently GROWS, every undebuffed Flittle banks +mult_mod Mult
 *  (`opp_mult`) and every Espathra banks +X(Xmult_mod) (`opp_Xmult`). "Grows" = one gain event of the shared scaling helper, the engine's
 *  SMODS.scale_card (js/engine/smods.js; its value went UP: a '-' or a lowering function is no growth), heard through the mod hook
 *  `card_scaled` (index.js): every house bank (bank / round_bank: the Gen 9 starters' Torch Song / Moxie, Yamask's grudge, Type: Null,
 *  Cosmog, Necrozma, the Gen 8 Legendaries...), every upstream 3.9.1 joker that scales through SMODS.scale_card, and the vanilla jokers
 *  Steamodded routes through it (js/engine/jokers.js vscale: Ride the Bus, Green Joker, Hologram, Campfire, ...; heard even when nothing
 *  else listens). One event = one gain, however big (a Moxie bank of 3 unused hands is 1). A Flittle / Espathra's own gain is never
 *  growth for another (no loop between two of them); a Blueprint never scales, so it never counts, and a Blueprint copying Flittle copies
 *  only the Mult it gives. Values that grow outside scale_card (a plain `+=` in a joker's own code) aren't heard. */
const OPPORTUNISTS = ['j_poke_flittle', 'j_poke_espathra'];
export function opportunist_scaled(card, grew) {
  if (!grew || !G.jokers || !card || !card.ability || card.ability.set !== 'Joker' || card.area !== G.jokers) return;
  if (OPPORTUNISTS.includes(card.config.center.key)) return;
  for (const j of G.jokers.cards.slice()) {
    if (j === card || j.debuff || j.getting_sliced || !OPPORTUNISTS.includes(j.config.center.key)) continue;
    if (j.config.center.key === 'j_poke_espathra') bank(j, 'opp_Xmult', 'Xmult_mod', 1, 'XMULT');
    else bank(j, 'opp_mult', 'mult_mod', 1, 'MULT');
  }
}
/** Clodsire, Poison Point: Silicobra's Sand Spit (each card the PLAYER discards that is unenhanced, num in dem on 'clodsire_poison', Oops!
 *  raises it), making a Hazard card instead of Stone. Blueprint copies it (its own roll). Shares Sand Spit's record of the discard. */
export function clodsire_poison(card, context, seed = 'clodsire_poison') {
  if (context.pre_discard) { spit_hand = context.hook ? null : context.full_hand; return undefined; }
  if (!(context.discard && context.other_card && spit_hand && spit_hand.includes(context.other_card))) return undefined;
  const c = context.other_card;
  if (c.config.center.key !== 'c_base' || !unbroken(c)) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, seed, ex.num, ex.dem, seed)) return undefined;
  c.set_ability(P_CENTERS.m_poke_hazard, null, true);
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Poison Point!', colour: 'PURPLE' });
  return undefined;
}
export const PARADOX_COLOUR = '#7B3FBF';
