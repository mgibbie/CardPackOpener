// The owner's new Pokermon jokers (2026-10-27): the 25 species of Desktop/Pokermon_Joker_Design_Guide.txt section 5, "25 DESIGN
// RECOMMENDATIONS" — species no mod (Pokermon / Nacho / Pokermon+) had a joker for (the design wiki's "not in the game yet" list).
// They are Micatro's own designs, not upstream Pokermon code: there is no Lua file behind this one, so every joker is defined in
// FULL here (static data + behaviour, like Repel / Jirachi's forms) and index.js registers it after the joker named by `poke_after`
// (Pokédex order). Text: DESIGN_LOC (merged into Pokermon's Joker descriptions); families: DESIGN_FAMILIES.
// Art: upstream's own. Pokermon 3.9.1's pokespriteload.lua already has a finished card for all 25 species (no joker uses them
// upstream) on the vendored 3.9.1 sheets, with Shiny twins and the Legendaries' floating souls — so, by the owner's art rule
// (a composed card only where upstream has none), each joker takes its 3.9.1 cell (`poke_sprite391`, read like data391.js
// sprites). PORTING.md "The owner's 25 new jokers".
//
// Lines: Shinx -> Luxio -> Luxray (Foresight money), Honedge -> Doublade -> Aegislash (held Steel; Stance Change), Spheal ->
// Sealeo -> Walrein (Rollout), Grookey -> Thwackey -> Rillaboom (the beat; Grass starter), Kubfu -> Urshifu (Single / Rapid Strike,
// chosen by its training), Tandemaus -> Maushold (Population Bomb), Darumaka -> Darmanitan (Hustle / Zen Mode), Scraggy -> Scrafty
// (Moxie), Mudbray -> Mudsdale (Stamina / Mud Spit); and Xerneas, Spiritomb, Tatsugiri on their own.
// Then the owner's wiki designs (CLAUDE.md "do the joker design list"): Sprigatito -> Floragato -> Meowscarada (Lucky cards grow like
// Hiker's: +Mult / +$, then X Mult; evolves by Lucky triggers, a Negative The Magician on each evolution; Grass starter; contentRev 20,
// reworked in 23) — upstream 3.9.1 draws them too (Natdex 10 / 12 / 14, 60);
// Whismur -> Loudred -> Exploud (each broken Glass card grows its Chips, then Mult, then X Mult, every form keeping the last's; a
// Negative Justice on each evolution; Colorless; contentRev 21) — upstream 3.9.1 draws them too (Natdex 14 / 16 / 18, 19).
// Gulpin -> Swalot (Stockpile: each end of round swallows a held Hazard, else a held Diamond; +Mult on scored Diamonds; Swalot's $ by
// rank and X Mult per card the deck has lost; Dark; contentRev 24) — upstream 3.9.1 draws them too (Natdex 0 / 2, 21).
// Trapinch -> Vibrava -> Flygon (Sand Pit: each card you discard banks +2 / +3 Chips on the joker, evolving after 40 then 60 more;
// Vibrava +1 discard; Flygon keeps the bank and gives X1 + 0.25 per discard used this round; Earth; contentRev 25) — upstream 3.9.1
// draws them too (Natdex 24 / 26 / 28, 21).
// Spoink -> Grumpig (Pearl: each end of round a held unsealed card gains a Pink Seal; Spoink X0.1 per Pink Seal trigger, evolving after 8;
// Grumpig makes Pink Seals trigger every hand, X0.15 per hand one triggers in, X0.3 on an overflow; Psychic; contentRev 26) — upstream
// 3.9.1 draws them too (Natdex 18 / 20, 21).
// Castform (Forecast: on the round's first deal, the suit held most picks Sunny / Rainy / Snowy, a tie Normal, its type following
// the weather for the round; Colorless; contentRev 27) — upstream 3.9.1 draws it (Natdex 10, 23) and its three weather forms
// (Gen 3 sheet 0 / 2 / 4, 0).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, ease_hands_played,
  create_card, copy_card, playing_card_joker_effects, defineJokers, type_tooltip, level_evo, scaling_evo, item_evo,
  ease_poke_dollars, has_enhancement, has_no_rank, get_probability_vars, pseudorandom_probability, scale_card,
  find_pokemon_type, is_type, apply_type_sticker, remove_type_stickers, type_sticker_applied,
  add_card, detailed, energy_values, poke_remove_card, ease_dollars, ease_discard,
} from '../api.js';

const FILE = 'micatro/pokejokers_designs';
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
/** The main end_of_round pass (not a held card's, not a repetition), as can_evolve reads it. */
const round_end = (context) => !!(context.end_of_round && !context.individual && !context.repetition);
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
/** A card on Pokermon 3.9.1's sheets (pokespriteload.lua PokemonSprites: the Natdex sheet, or a Gen sheet for `gen_atlas`). */
const sprite = (sheet, x, y, soul) => ({ atlas: 'AtlasJokersBasic' + sheet, pos: { x, y }, ...(soul ? { soul_pos: { x: soul[0], y: soul[1] } } : {}) });

// ------------------------------------------------------------ shared bodies
const scry = {
  add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
  remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
};
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
/** The Squirtle line's +hands pair (pokejokers_01). */
const hands = {
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
const scry_tip = (info_queue) => info_queue.push({ set: 'Other', key: 'scry_cards' });

/** Shinx line: a played card that shares a rank with a Foreseen card (G.scry_view, the top of the deck) pays and scores. */
const foreseen = (c) => !has_no_rank(c) && !!(G.scry_view && G.scry_view.cards && G.scry_view.cards.some((s) => !has_no_rank(s) && s.get_id() === c.get_id()));
function lux_calc(card, context, seed) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && foreseen(context.other_card)) {
    const ex = card.ability.extra;
    const dollars = ease_poke_dollars(card, seed, ex.money, true);
    // (Electrike: dollar_buffer holds money still being paid out, for jokers that read the total)
    G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + dollars;
    const r = { dollars, card, func() { G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); } };
    if (ex.mult) r.mult = ex.mult;
    if (ex.Xmult_multi) r.x_mult = ex.Xmult_multi;
    return r;
  }
  return undefined;
}

/** Honedge / Doublade: +mult_mod Mult per Steel card held when a hand is played. */
const held_steel = () => G.hand.cards.filter((c) => has_enhancement(c, 'm_steel'));
function blade_scale(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    const n = held_steel().length;
    if (n > 0) scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', scalar_factor: n, message_colour: 'MULT' });
  }
  if (context.joker_main && card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
  return undefined;
}
/** A held card's repetition only counts when it did something (Ferrothorn's card_effects guard). */
const held_effective = (context) => !!(context.card_effects && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length) || context.card_effects.length > 1));

/** Spheal line, Rollout: a streak (0..max) of the same poker hand in a row this round; Chips = chips x 2^streak. */
function rollout(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    ex.streak = ex.last_hand === context.scoring_name ? Math.min(ex.max_streak, ex.streak + 1) : 0;
    ex.last_hand = context.scoring_name;
  }
  if (round_end(context) && !context.blueprint) { ex.streak = 0; ex.last_hand = undefined; }
  return undefined;
}
const rollout_chips = (ex) => ex.chips * Math.pow(2, ex.streak || 0);
function rollout_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, chips = rollout_chips(ex);
  if (ex.Xmult && ex.streak >= ex.max_streak) return { message: 'Sheer Cold!', colour: 'XMULT', chip_mod: chips, Xmult_mod: ex.Xmult };
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}

/** Grookey line, the beat: every `every`-th card scored this round is retriggered (the round's count; the hand's beats in beat_idx). */
function beat_calc(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    ex.beat_idx = [];
    for (let i = 0; i < context.scoring_hand.length; i++) {
      ex.beat = ex.beat + 1;
      if (ex.beat % ex.every === 0) { ex.beat_idx.push(i); ex.beats = ex.beats + 1; }
    }
  }
  const on_beat = (c) => !!(context.scoring_hand && ex.beat_idx && ex.beat_idx.includes(context.scoring_hand.indexOf(c)));
  if (context.repetition && context.cardarea === G.play && !context.other_card.debuff && on_beat(context.other_card)) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  // Rillaboom's Drum Beating: a card on the beat gives +mult each time it scores
  if (ex.mult && context.individual && context.cardarea === G.play && !context.end_of_round && on_beat(context.other_card)) return { mult: ex.mult, card };
  if (context.after && context.cardarea === G.jokers && !context.blueprint) ex.beat_idx = [];
  if (round_end(context) && !context.blueprint) ex.beat = 0;
  return undefined;
}

/** The Sprigatito line: how many of this scored card's Lucky rolls hit (its 1 in 5 Mult and 1 in 15 money count 1 each: the engine's
 *  lucky_procs; at least 1 when only lucky_trigger is known — a mod's own Lucky roll), or 0 when it didn't trigger. */
const lucky_procs = (c) => (c.lucky_trigger ? Math.max(1, c.lucky_procs || 0) : 0);
const lucky_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.lucky_trigger);
/** Sprigatito / Floragato (Hiker for Lucky cards): a scored card whose Lucky effect triggered permanently gains +mult_mod Mult and
 *  +$dollars when scored (Steamodded's perma_mult / perma_p_dollars; the value at the time, kept by the card) — once per scoring, even
 *  when both rolls hit. Every hit counts toward evolving (lucky_triggers; not Blueprint's copy). Blueprint copies the growth, as Hiker. */
function lucky_grow(card, context) {
  if (lucky_scored(context)) {
    const a = context.other_card.ability, ex = card.ability.extra;
    if (!context.blueprint) ex.lucky_triggers = (ex.lucky_triggers || 0) + lucky_procs(context.other_card);
    a.perma_mult = (a.perma_mult || 0) + ex.mult_mod;
    a.perma_p_dollars = (a.perma_p_dollars || 0) + ex.dollars;
    return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
  }
  return undefined;
}
/** Meowscarada: a scored card whose Lucky effect triggered permanently gains X(Xmult_mod) Mult (Steamodded's perma_x_mult: the engine
 *  scores x_mult * (1 + perma_x_mult) every time the card scores after — X1.5 after one trigger, X2 after two). Once per scoring. */
function lucky_xgrow(card, context) {
  if (lucky_scored(context)) {
    const a = context.other_card.ability;
    a.perma_x_mult = (a.perma_x_mult || 0) + card.ability.extra.Xmult_mod;
    return { extra: { message: localize('k_upgrade_ex'), colour: 'XMULT' }, colour: 'XMULT', card };
  }
  return undefined;
}
/** The Sprigatito line: an extra table from before contentRev 23 (a round counter, Meowscarada's held X) brought to the new shape —
 *  the Lucky-trigger count from 0 (rounds played don't map to triggers), Meowscarada's X gain from its base with the Energy it has. */
function lucky_legacy(self, card) {
  const ex = card.ability.extra, base = self.config.extra;
  if (!ex || typeof ex !== 'object') return;
  if (base.lucky_triggers !== undefined && typeof ex.lucky_triggers !== 'number') ex.lucky_triggers = 0;
  if (base.Xmult_mod !== undefined && typeof ex.Xmult_mod !== 'number') {
    ex.Xmult_mod = base.Xmult_mod * (1 + energy_values.Xmult_mod * ((ex.energy_count || 0) + (ex.c_energy_count || 0) / 2));
    delete ex.Xmult_multi;
  }
  if (base.rounds === undefined && ex.rounds !== undefined) delete ex.rounds;
}
const lucky_left = (self, card) => Math.max(0, self.config.evo_rqmt - (card.ability.extra.lucky_triggers || 0));
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Whismur line: how many Glass cards broke (their 1 in 4 shatter; Glass Joker's count — remove_playing_cards, the `shattered`
 *  ones), each growing `ref` by its gain `mod` (Energy scales only the gain; the totals are in fields energize ignores, so a
 *  banked amount keeps what it was worth when earned). Not Blueprint (it scales, as Glass Joker). */
function glass_grow(card, context, ref, mod, message_key) {
  if (context.remove_playing_cards && !context.blueprint && context.removed) {
    const n = context.removed.filter((c) => c.shattered).length;
    if (n > 0) scale_card(card, { ref_value: ref, scalar_value: mod, scalar_factor: n, message_key, message_colour: message_key === 'a_chips' ? 'CHIPS' : message_key === 'a_mult' ? 'MULT' : 'XMULT' });
  }
  return undefined;
}
/** Whismur line: the Chips (Whismur's), the Mult (Loudred's) and the X Mult (Exploud's) this form has. */
function glass_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.glass_chips) r.chip_mod = ex.glass_chips;
  if (ex.glass_mult) r.mult_mod = ex.glass_mult;
  if (ex.glass_Xmult && ex.glass_Xmult !== 1) r.Xmult_mod = ex.glass_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : r.mult_mod ? a_mult(r.mult_mod) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : r.mult_mod ? 'MULT' : 'CHIPS';
  return r;
}
/** A Negative Tarot (`tarot`: Whismur's line c_justice, Sprigatito's c_magician) when this card evolved from `from` (the poke_evolved
 *  context, after the swap; Chingling's add_card). Negative: it needs no consumable slot. */
function evolved_tarot(card, context, from, tarot) {
  if (context.poke_evolved && context.card === card && context.from === 'j_poke_' + from && !context.blueprint) {
    G.E_MANAGER.add_event(() => { add_card({ set: 'Tarot', key: tarot, edition: 'e_negative' }); });
  }
  return undefined;
}
const glass_evolved = (card, context, from) => evolved_tarot(card, context, from, 'c_justice');
const lucky_tips = (info_queue, evolves) => {
  info_queue.push(P_CENTERS.m_lucky);
  if (evolves && detailed()) { info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); info_queue.push(P_CENTERS.c_magician); }
};
const glass_tips = (info_queue, evolves) => {
  info_queue.push(P_CENTERS.m_glass);
  if (evolves && detailed()) { info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); info_queue.push(P_CENTERS.c_justice); }
};

/** Gulpin / Swalot: max Stockpile (`stockpile_max`, the house energy field: +1 per Energy, +0.5 per mismatched Colorless — floored). */
const stock_max = (ex) => Math.floor(ex.stockpile_max + 1e-9);
const stock_mult = (ex) => ex.stockpile_mult * ex.stockpile;
/** Gulpin / Swalot: a scored Diamond card gives +stockpile_mult Mult per Stockpile (Blueprint copies it). */
function stockpile_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && card.ability.extra.stockpile > 0 && context.other_card.is_suit('Diamonds')) {
    return { mult: stock_mult(card.ability.extra), card };
  }
  return undefined;
}
/** Swalot: X1 + Xmult_mod per card the full deck is below the run's starting size (Erosion's count), never below X1. */
const swalot_x = (ex) => {
  const below = G.GAME && G.playing_cards ? (G.GAME.starting_deck_size || 0) - G.playing_cards.length : 0;
  return Math.max(1, 1 + ex.Xmult_mod * Math.max(0, below));
};
const swallowable = (c) => !c.destroyed && !c.shattered && !c.removed && !c.poke_swallowed;
/** Gulpin / Swalot, end of round: swallow the leftmost held Hazard (else the leftmost held Diamond — a debuffed one isn't a Diamond,
 *  as is_suit) through Pokermon's poke_remove_card (dissolve, remove_playing_cards: Qwilfish / Spiritomb count it as any destroyed
 *  card); +1 Stockpile below max. At max, Gulpin leaves the Diamonds alone; Swalot still swallows one for its rank in $. The Hazard's
 *  own 1 in 3 roll later this pass skips it (`poke_swallowed`, enhancement1.js). Once per round: not Blueprint, not a joker retrigger. */
function swallow(card, context, swalot) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const ex = card.ability.extra, room = ex.stockpile < stock_max(ex);
  let target = G.hand.cards.find((c) => swallowable(c) && has_enhancement(c, 'm_poke_hazard'));
  let dollars = 0;
  if (!target && (room || swalot)) {
    target = G.hand.cards.find((c) => swallowable(c) && c.is_suit('Diamonds'));
    if (target && swalot && !has_no_rank(target)) dollars = target.get_id();
  }
  if (!target) return;
  target.poke_swallowed = true;
  poke_remove_card(target, card);
  if (room) ex.stockpile = ex.stockpile + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: room ? 'Stockpile!' : 'Swallow!', colour: 'MULT' });
  if (dollars > 0) { ease_dollars(dollars); card_eval_status_text(card, 'dollars', dollars); }
}

/** Vibrava: +d_size discards each round while held (the Charmander line's pair, pokejokers_01): on gain, and off again when sold,
 *  destroyed or evolved (set_ability runs the old center's remove_from_deck across an evolution). */
const discards = {
  add_to_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size; ease_discard(card.ability.extra.d_size); },
  remove_from_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size; ease_discard(-card.ability.extra.d_size); },
};
/** Trapinch / Vibrava, Sand Pit: every card the PLAYER discards (the pre_discard context of a real discard: `hook` is set by every
 *  effect that discards for you — The Hook, Pokermon's seals, Bunco / MoreFluff blinds — and those don't count) banks +chip_mod Chips
 *  on the joker (`sand_chips`, in no energy_values: a banked Chip keeps what it was worth when earned) and counts toward evolution
 *  (`sand_cards`). A discard of N cards counts N. Not Blueprint (it scales). */
function sand_pit(card, context) {
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && context.full_hand && context.full_hand.length) {
    const ex = card.ability.extra, n = context.full_hand.length;
    let gained = 0;
    scale_card(card, {
      ref_value: 'sand_chips', scalar_value: 'chip_mod', scalar_factor: n, no_message: true,
      operation: (t, k, v, change) => { t[k] = r3(v + change); gained = change; },
    });
    ex.sand_cards = (ex.sand_cards || 0) + n;
    card_eval_status_text(card, 'extra', null, null, null, { message: a_chips(r3(gained)), colour: 'CHIPS' });
  }
  return undefined;
}
/** Trapinch / Vibrava / Flygon: the banked Chips, every hand (Blueprint copies them). */
function sand_main(card, context) {
  const ex = card.ability.extra;
  if (!context.joker_main) return undefined;
  const x = ex.Xmult_mod !== undefined ? sandstorm_x(ex) : 1;
  const r = {};
  if (ex.sand_chips > 0) r.chip_mod = ex.sand_chips;
  if (x > 1) r.Xmult_mod = x;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(x) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : 'CHIPS';
  return r;
}
/** Flygon, Sandstorm: X(1 + Xmult_mod per discard used this round). A discard USE counts once however many cards it had; effect
 *  discards (hook) never raise discards_used; it is 0 again each round (run.js new round). */
const sandstorm_x = (ex) => r3(1 + ex.Xmult_mod * ((G.GAME && G.GAME.current_round && G.GAME.current_round.discards_used) || 0));

/** Spoink / Grumpig, Pearl: at the end of the round, a random card held in hand with no seal gains a Pink Seal (the run's seeded RNG;
 *  none unsealed: nothing). Once per round: not Blueprint, not a joker retrigger, not on a game over. */
function pearl(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const bare = G.hand.cards.filter((c) => !c.seal && !c.destroyed && !c.shattered && !c.removed);
  if (!bare.length) return;
  const target = pseudorandom_element(bare, pseudoseed('poke_spoink_pearl'))[0];
  target.set_seal('poke_pink_seal');
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Pearl!', colour: 'pink' });
}
/** Spoink / Grumpig: the banked X Mult (`pink_Xmult`, in no energy field), every hand (Blueprint copies it). */
function pearl_main(card, context) {
  const x = card.ability.extra.pink_Xmult;
  if (context.joker_main && x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
  return undefined;
}
/** Grumpig's gain for the current hand: Xmult_mod for a hand with a Pink Seal trigger, twice that (Black Pearl) when one of them had no
 *  room for its Energy — once per hand, the overflow gain replacing the normal one (G.GAME.hands_played names the hand: it only goes up
 *  after the hand has scored). */
function grumpig_gain(card, overflow) {
  const ex = card.ability.extra, hand_no = G.GAME.hands_played || 0;
  if (ex.pink_hand !== hand_no) { ex.pink_hand = hand_no; ex.pink_gain = 0; }
  const want = overflow ? 2 * ex.Xmult_mod : ex.Xmult_mod;
  if (want <= (ex.pink_gain || 0) + 1e-12) return;
  const add = want - (ex.pink_gain || 0);
  ex.pink_gain = want;
  ex.pink_Xmult = r3(ex.pink_Xmult + add);
  card_eval_status_text(card, 'extra', null, null, null, { message: overflow ? 'Black Pearl!' : localize('k_upgrade_ex'), colour: 'XMULT' });
}
const pink_tip = (info_queue) => info_queue.push({ key: 'poke_pink_seal_seal', set: 'Other' });

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
function sync_kecleons() {
  for (const c of G.jokers.cards.slice()) { const mc = c.config.center; if (mc.key === 'j_poke_kecleon' && mc.update) mc.update(mc, c); }
}
/** Castform takes a form: its own Pokermon type (ability.extra.ptype, which energy_matches, is_type and find_pokemon_type read)
 *  becomes the form's. A Tera sticker still overrides it, as on any joker. Its debuff is re-evaluated (as Kecleon's set_type). */
function castform_set_form(card, form) {
  const ex = card.ability.extra, f = CASTFORM_FORMS[form] || CASTFORM_FORMS.normal;
  const changed = ex.form !== form || ex.ptype !== f.ptype;
  ex.form = form;
  ex.ptype = f.ptype;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
}
/** The round's FIRST deal (Steamodded hand_drawn while the first hand is dealt: nothing played or discarded yet, once a round):
 *  every card is in hand by then (the first_hand_drawn context runs before the deal's draw events land). */
const first_deal = (card, context) => !!(context.hand_drawn && !context.blueprint && G.STATE === G.STATES.DRAW_TO_HAND && G.GAME.current_round
  && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && card.ability.extra.forecast_round !== G.GAME.round);
/** Rainy: the first Club among the scoring cards (a debuffed one isn't a Club: is_suit). */
const first_club = (context) => (context.scoring_hand || []).find((c) => c.is_suit('Clubs'));

/** Kubfu / Urshifu, training: X Mult grows on a hand of exactly 1 or exactly 5 scoring cards (Kubfu counts each school). */
function training(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint && context.scoring_hand) {
    const n = context.scoring_hand.length;
    if (n === 1 || n === 5) {
      if (ex.single !== undefined) { if (n === 1) ex.single = ex.single + 1; else ex.rapid = ex.rapid + 1; ex.last = n === 1 ? 'single' : 'rapid'; }
      scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_key: 'a_xmult', message_colour: 'XMULT' });
    }
  }
  if (context.joker_main && ex.Xmult > 1) return { message: a_xmult(ex.Xmult), colour: 'XMULT', Xmult_mod: ex.Xmult };
  return undefined;
}
const urshifu_tips = (info_queue) => info_queue.push({ set: 'Other', key: 'poke_design_unseen_fist' });

/** Tandemaus / Maushold: a scored card sharing its rank with another scored card gives +mult. */
function pair_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card)) {
    const id = context.other_card.get_id();
    if (context.scoring_hand.some((c) => c !== context.other_card && !has_no_rank(c) && c.get_id() === id)) return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}

/** Scraggy / Scrafty, Moxie: grows at end of round when the Blind fell to the round's first hand. */
function moxie(card, context, step) {
  if (round_end(context) && !context.blueprint && !context.game_over && G.GAME.current_round.hands_played === 1) {
    scale_card(card, { ref_value: 'mult', scalar_table: { moxie: step() }, scalar_value: 'moxie', message_colour: 'MULT' });
  }
  return undefined;
}

/** Mudbray / Mudsdale, Stamina: +chip_mod Chips for each hand that isn't the round's first. */
function stamina(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint && G.GAME.current_round.hands_played > 0) {
    scale_card(card, { ref_value: 'chips', scalar_value: 'chip_mod', message_colour: 'CHIPS' });
  }
  if (context.joker_main && card.ability.extra.chips > 0) return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
  return undefined;
}

/** Darmanitan's Zen Mode type: a Psychic Tera sticker until end of round, then the type it had (its own, or a Tera it wore). */
function zen_on(self, card) {
  const ex = card.ability.extra;
  ex.zen_prev = type_sticker_applied(card) || false;
  apply_type_sticker(card, 'Psychic');
  ex.zen = true;
  ex.form = 'zen';
}
function zen_off(self, card) {
  const ex = card.ability.extra;
  if (ex.zen_prev) apply_type_sticker(card, ex.zen_prev);
  else { remove_type_stickers(card); ex.ptype = self.config.extra.ptype; }
  ex.zen = false;
  ex.zen_prev = undefined;
  ex.form = undefined;
}

/** Spiritomb: create The Soul once, at the goal, when a consumable slot is free. */
function spirit_soul(card) {
  const ex = card.ability.extra;
  if (ex.created || ex.spirits < ex.goal) return;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return;
  ex.created = true;
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const soul = create_card('Spectral', G.consumeables, null, null, null, null, 'c_soul');
    soul.add_to_deck();
    G.consumeables.emplace(soul);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
}
const spirit_x = (ex) => 1 + ex.spirits * ex.Xmult_mod;

/** Tatsugiri: the leftmost Water Joker (never Tatsugiri itself) in the joker row. */
const commanded = (card) => G.jokers.cards.find((c) => c !== card && is_type(c, 'Water'));
const TATSU_FORMS = ['curly', 'droopy', 'stretchy'];

defineJokers({
  // ---------------------------------------------------------------- LINE A: Shinx -> Luxio -> Luxray (Lightning, Gen 4)
  // Shinx 403: +1 Foresight; a played card sharing a rank with a Foreseen card earns $1 when scored. Evolves in 4 rounds.
  shinx: {
    name: 'shinx', poke_sprite391: sprite('Natdex', 24, 26),
    config: { extra: { scry: 1, money: 1, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'economy', 'round_evo'], poke_after: 'kricketune',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.money, ex.rounds] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'shinx') || level_evo(self, card, context, 'j_poke_luxio'); },
    ...scry,
  },
  // Luxio 404: +2 Foresight; matching cards give +6 Mult and earn $1. Evolves in 5 rounds.
  luxio: {
    name: 'luxio', poke_sprite391: sprite('Natdex', 26, 26),
    config: { extra: { scry: 2, mult: 6, money: 1, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'mult', 'economy', 'round_evo'], poke_after: 'shinx',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.mult, ex.money, ex.rounds] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'luxio') || level_evo(self, card, context, 'j_poke_luxray'); },
    ...scry,
  },
  // Luxray 405: +3 Foresight; matching cards give X1.4 Mult and earn $1.
  luxray: {
    name: 'luxray', poke_sprite391: sprite('Natdex', 28, 26),
    config: { extra: { scry: 3, Xmult_multi: 1.4, money: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'xmult', 'economy'], poke_after: 'luxio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.Xmult_multi, ex.money] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'luxray'); },
    ...scry,
  },

  // ---------------------------------------------------------------- LINE B: Honedge -> Doublade -> Aegislash (Metal, Gen 6)
  // Honedge 679: gains +1 Mult per Steel card held when a hand is played; evolves at +20 Mult.
  honedge: {
    name: 'honedge', poke_sprite391: sprite('Natdex', 6, 45),
    config: { evo_rqmt: 20, extra: { mult: 0, mult_mod: 1 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'enhancements', 'scaling_evo'], poke_after: 'pyroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.mult, self.config.evo_rqmt] }; },
    calculate(self, card, context) { return blade_scale(card, context) || scaling_evo(self, card, context, 'j_poke_doublade', card.ability.extra.mult, self.config.evo_rqmt); },
  },
  // Doublade 680: +2 Mult per held Steel card; the first 2 Steel cards held are retriggered. Evolves with a Dusk Stone.
  doublade: {
    name: 'doublade', poke_sprite391: sprite('Natdex', 8, 45),
    config: { extra: { mult: 0, mult_mod: 2, steel_retriggers: 2, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 6, blueprint_compat: true, item_req: 'duskstone',
    attributes: ['mult', 'scaling', 'enhancements', 'retrigger', 'item_evo'], poke_after: 'honedge',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult_mod, ex.steel_retriggers, ex.mult] };
    },
    calculate(self, card, context) {
      const r = blade_scale(card, context);
      if (r) return r;
      // the first `steel_retriggers` Steel cards held (that score: not debuffed), left to right
      if (context.repetition && context.cardarea === G.hand && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        const first = held_steel().filter((c) => !c.debuff).slice(0, card.ability.extra.steel_retriggers);
        if (first.includes(context.other_card)) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return item_evo(self, card, context, 'j_poke_aegislash');
    },
  },
  // Aegislash 681: +20 Mult (kept from Doublade); Stance Change — Blade Forme X2.5 Mult, Shield Forme retriggers every held Steel
  // card. A played hand switches to Blade, a discard to Shield; each round starts in Shield.
  aegislash: {
    name: 'aegislash', poke_sprite391: sprite('Gen06', 6, 8),
    config: { extra: { mult: 20, Xmult: 2.5, retriggers: 1, form: 'shield' } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements', 'retrigger', 'discard'], poke_after: 'doublade',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult, ex.Xmult, ex.form === 'blade' ? 'Blade' : 'Shield'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) {
        if (ex.form === 'blade') return { message: a_xmult(ex.Xmult), colour: 'XMULT', mult_mod: ex.mult, Xmult_mod: ex.Xmult };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      if (context.repetition && context.cardarea === G.hand && ex.form !== 'blade' && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (context.after && context.cardarea === G.jokers && !context.blueprint && ex.form !== 'blade') {
        ex.form = 'blade';
        return { message: 'Blade Forme', colour: 'XMULT' };
      }
      if (context.pre_discard && !context.blueprint && ex.form !== 'shield') {
        ex.form = 'shield';
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Shield Forme', colour: 'FILTER' });
      }
      if (round_end(context) && !context.blueprint) ex.form = 'shield';
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE C: Spheal -> Sealeo -> Walrein (Water, Gen 3)
  // Spheal 363: Rollout +10 Chips, doubled for each consecutive hand of the same poker hand (max 4 doublings). Evolves in 5 rounds.
  spheal: {
    name: 'spheal', poke_sprite391: sprite('Natdex', 4, 24),
    config: { extra: { chips: 10, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hand_type', 'reset', 'round_evo'], poke_after: 'glalie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chips, ex.max_streak, rollout_chips(ex), ex.rounds] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_sealeo'); },
  },
  // Sealeo 364: +1 hand; Rollout +20 Chips. Evolves in 5 rounds.
  sealeo: {
    name: 'sealeo', poke_sprite391: sprite('Natdex', 6, 24),
    config: { extra: { hands: 1, chips: 20, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hands', 'hand_type', 'reset', 'round_evo'], poke_after: 'spheal',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.rounds, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_walrein'); },
    ...hands,
  },
  // Walrein 365: +1 hand; Rollout +40 Chips; Sheer Cold X3 Mult while Rollout is at full power.
  walrein: {
    name: 'walrein', poke_sprite391: sprite('Natdex', 8, 24),
    config: { extra: { hands: 1, chips: 40, streak: 0, max_streak: 4, Xmult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands', 'hand_type', 'reset'], poke_after: 'sealeo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.Xmult, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context); },
    ...hands,
  },

  // ---------------------------------------------------------------- LINE D: Grookey -> Thwackey -> Rillaboom (Grass starter, Gen 8)
  // Grookey 810: +1 hand size; every 4th card scored this round is retriggered. Evolves after 12 beats.
  // (contentRev 21: on-beat cards also give +1 Mult — the lead-in to Rillaboom's Drum Beating; `mult` is its Energy field.)
  grookey: {
    name: 'grookey', poke_sprite391: sprite('Natdex', 28, 53),
    config: { evo_rqmt: 12, extra: { h_size: 1, every: 4, beat: 0, beats: 0, retriggers: 1, mult: 1 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 8, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'mult', 'trigger_evo'], poke_after: 'mega_drampa',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), ex.beat % ex.every, Math.max(0, self.config.evo_rqmt - ex.beats), ex.every, ex.mult] }; },
    calculate(self, card, context) { return beat_calc(card, context) || scaling_evo(self, card, context, 'j_poke_thwackey', card.ability.extra.beats, self.config.evo_rqmt); },
    ...hand_size,
  },
  // Thwackey 811: +1 hand size; every 3rd card scored this round is retriggered, and gives +2 Mult (contentRev 21: the lead-in to
  // Drum Beating, so Energy has a field to scale — `mult`, as Rillaboom's). Evolves after 16 beats.
  thwackey: {
    name: 'thwackey', poke_sprite391: sprite('Natdex', 0, 54),
    config: { evo_rqmt: 16, extra: { h_size: 1, every: 3, beat: 0, beats: 0, retriggers: 1, mult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'mult', 'trigger_evo'], poke_after: 'grookey',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), Math.max(0, self.config.evo_rqmt - ex.beats), ex.mult] }; },
    calculate(self, card, context) { return beat_calc(card, context) || scaling_evo(self, card, context, 'j_poke_rillaboom', card.ability.extra.beats, self.config.evo_rqmt); },
    ...hand_size,
  },
  // Rillaboom 812: +1 hand size; every 2nd card scored this round is retriggered; Drum Beating: those cards give +3 Mult.
  rillaboom: {
    name: 'rillaboom', poke_sprite391: sprite('Natdex', 2, 54),
    config: { extra: { h_size: 1, every: 2, beat: 0, beats: 0, retriggers: 1, mult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'mult'], poke_after: 'thwackey',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), ex.mult] }; },
    calculate(self, card, context) { return beat_calc(card, context); },
    ...hand_size,
  },

  // ---------------------------------------------------------------- LINE E: Kubfu -> Urshifu (Fighting Legendary, Gen 8)
  // Kubfu 891: can't be debuffed (systems/rules.js set_debuff); gains X0.1 Mult on a hand of exactly 1 or 5 scoring cards. After 10
  // trainings it evolves into the school it trained more: 1-card hands Single Strike, 5-card hands Rapid Strike (a tie: the school
  // of its last training).
  kubfu: {
    name: 'kubfu', poke_sprite391: sprite('Natdex', 10, 59, [11, 59]),
    config: { evo_rqmt: 10, extra: { Xmult: 1, Xmult_mod: 0.1, single: 0, rapid: 0 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'debuff', 'scaling_evo'], poke_after: 'dreepy_dart',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_mod, ex.Xmult, self.config.evo_rqmt, ex.single, ex.rapid] };
    },
    calculate(self, card, context) {
      const r = training(card, context);
      if (r) return r;
      const ex = card.ability.extra;
      const school = ex.single > ex.rapid ? 'single' : ex.rapid > ex.single ? 'rapid' : (ex.last || 'single');
      return scaling_evo(self, card, context, 'j_poke_urshifu_' + school, ex.single + ex.rapid, self.config.evo_rqmt);
    },
  },
  // Urshifu (Single Strike Style) 892: X Mult (kept from Kubfu; keeps training); Unseen Fist: playing cards can't be debuffed
  // (rules.js); Wicked Blow: a 1-card hand's card also gives this Joker's X Mult when scored. Only through Kubfu (never in a pool).
  urshifu_single: {
    name: 'urshifu_single', poke_sprite391: sprite('Gen08', 2, 10, [3, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'scaling', 'debuff'], poke_after: 'kubfu',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); urshifu_tips(info_queue); const ex = card.ability.extra; return { vars: [ex.Xmult, ex.Xmult_mod] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.full_hand && context.full_hand.length === 1 && card.ability.extra.Xmult > 1) {
        return { x_mult: card.ability.extra.Xmult, card };
      }
      return training(card, context);
    },
    in_pool() { return false; },
  },
  // Urshifu (Rapid Strike Style) 892: X Mult (kept from Kubfu; keeps training); Surging Strikes: the first 3 scored cards are
  // retriggered. Only through Kubfu.
  urshifu_rapid: {
    name: 'urshifu_rapid', poke_sprite391: sprite('Gen08', 4, 10, [5, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1, retriggers: 1, strikes: 3 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'scaling', 'retrigger', 'debuff'], poke_after: 'urshifu_single',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.Xmult, ex.Xmult_mod, ex.strikes] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand.indexOf(context.other_card) >= 0
        && context.scoring_hand.indexOf(context.other_card) < card.ability.extra.strikes) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return training(card, context);
    },
    in_pool() { return false; },
  },

  // ---------------------------------------------------------------- Xerneas 716 (Fairy Legendary, Gen 6)
  // Geomancy: after the round's first hand, played cards give X1.25 Mult when scored. The first playing card destroyed each round
  // comes back as a copy: to the hand during a Blind (outside one — the shop — into the deck).
  xerneas: {
    name: 'xerneas', poke_sprite391: sprite('Gen06', 8, 10, [9, 10]),
    config: { extra: { Xmult_multi: 1.25, revived: false } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'destroy_card', 'playing_card'], poke_after: 'gourgeist',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const charged = !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played > 0);
      return { vars: [card.ability.extra.Xmult_multi, charged ? 'Active!' : 'Charging...'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && G.GAME.current_round.hands_played > 0) {
        return { x_mult: ex.Xmult_multi, card };
      }
      if (context.remove_playing_cards && !context.blueprint && !ex.revived && context.removed && context.removed.length) {
        ex.revived = true;
        const src = context.removed[0];
        const to_hand = !!G.GAME.facing_blind;
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const id = G.playing_card;
        G.E_MANAGER.add_event(() => {
          const copy = copy_card(src, null, null, id);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          (to_hand ? G.hand : G.deck).emplace(copy);
          copy.start_materialize();
          playing_card_joker_effects([copy]);
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_copied_ex'), colour: 'pink' });
      }
      if (round_end(context) && !context.blueprint) ex.revived = false;
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F: Tandemaus -> Maushold (Colorless, Gen 9)
  // Tandemaus 924: scored cards that share a rank with another scored card give +3 Mult. Evolves in 5 rounds.
  tandemaus: {
    name: 'tandemaus', poke_sprite391: sprite('Natdex', 16, 61),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'rank', 'round_evo'], poke_after: 'spidops',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.rounds] }; },
    calculate(self, card, context) { return pair_mult(card, context) || level_evo(self, card, context, 'j_poke_maushold'); },
  },
  // Maushold 925: as Tandemaus; Population Bomb: the first scored card is retriggered, then 1 in 2 for each more retrigger, up to 4
  // (Family of Four). 1 in 100 is the Family of Three (rolled on creation): up to 3, and each retrigger earns $1.
  maushold: {
    name: 'maushold', poke_sprite391: sprite('Gen09', 6, 0),
    config: { extra: { mult: 3, num: 1, dem: 2, max: 4, max_three: 3, money: 1, form: 'four' } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'rank', 'retrigger', 'chance', 'economy'], poke_after: 'tandemaus',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'maushold');
      const three = ex.form === 'three';
      return { vars: [ex.mult, num, dem, three ? ex.max_three : ex.max, ex.money], key: three ? 'j_poke_maushold_three' : undefined };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom('maushold_family') < 0.01 ? 'three' : 'four';
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card === context.scoring_hand[0] && !context.other_card.debuff) {
        const max = ex.form === 'three' ? ex.max_three : ex.max;
        let reps = 1;
        while (reps < max && pseudorandom_probability(card, 'maushold', ex.num, ex.dem, 'maushold')) reps++;
        if (ex.form === 'three') {
          const earned = ease_poke_dollars(card, 'maushold', ex.money * reps);
          card_eval_status_text(card, 'dollars', earned);
        }
        return { message: localize('k_again_ex'), repetitions: reps, card };
      }
      return pair_mult(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE G: Darumaka -> Darmanitan (Fire, Gen 5)
  // Darumaka 554: +15 Mult; Hustle: 1 in 4 to give nothing (probability jokers make it miss MORE). Evolves in 4 rounds.
  darumaka: {
    name: 'darumaka', poke_sprite391: sprite('Natdex', 26, 36),
    config: { extra: { mult: 15, num: 1, dem: 4, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'chance', 'round_evo'], poke_after: 'excadrill',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'darumaka');
      return { vars: [ex.mult, num, dem, ex.rounds] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        const ex = card.ability.extra;
        if (pseudorandom_probability(card, 'darumaka', ex.num, ex.dem, 'darumaka')) return { message: localize('k_nope_ex'), colour: 'GREEN' };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      return level_evo(self, card, context, 'j_poke_darmanitan');
    },
  },
  // Darmanitan 555: +30 Mult; Zen Mode: on the round's final hand, X3 Mult instead, and Psychic (a Tera sticker) until end of round.
  darmanitan: {
    name: 'darmanitan', poke_sprite391: sprite('Gen05', 10, 0),
    config: { extra: { mult: 30, Xmult: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'types', 'hands'], poke_after: 'darumaka',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.Xmult] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.before && context.cardarea === G.jokers && !context.blueprint && G.GAME.current_round.hands_left === 0 && !ex.zen) {
        zen_on(self, card);
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Zen Mode!', colour: 'Planet' });
      }
      if (context.joker_main) {
        if (G.GAME.current_round.hands_left === 0) return { message: a_xmult(ex.Xmult), colour: 'XMULT', Xmult_mod: ex.Xmult };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      if (round_end(context) && !context.blueprint && ex.zen) zen_off(self, card);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE H: Scraggy -> Scrafty (Dark, Gen 5)
  // Scraggy 559: +4 Mult; Moxie: +3 Mult when a Blind is defeated with the round's first hand. Evolves in 4 rounds.
  scraggy: {
    name: 'scraggy', poke_sprite391: sprite('Natdex', 6, 37),
    config: { extra: { mult: 4, mult_mod: 3, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'darmanitan',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.mult_mod, ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
      moxie(card, context, () => card.ability.extra.mult_mod);
      return level_evo(self, card, context, 'j_poke_scrafty');
    },
  },
  // Scrafty 560: Moxie +3 Mult, +1 more per other Dark Joker; X1.5 Mult on the round's first hand.
  scrafty: {
    name: 'scrafty', poke_sprite391: sprite('Natdex', 8, 37),
    config: { extra: { mult: 4, mult_mod: 3, mult_scaling_mod: 1, Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling'], poke_after: 'scraggy',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.mult_scaling_mod, ex.Xmult, ex.mult] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) {
        if (G.GAME.current_round.hands_played === 0) return { message: a_xmult(ex.Xmult), colour: 'XMULT', mult_mod: ex.mult, Xmult_mod: ex.Xmult };
        if (ex.mult > 0) return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      moxie(card, context, () => ex.mult_mod + ex.mult_scaling_mod * find_pokemon_type('Dark', card).length);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Spiritomb 442 (Psychic: Ghost/Dark, Gen 4)
  // A spirit per playing card destroyed and per Joker sold; X0.02 Mult per spirit; at 108 spirits, The Soul (once; must have room).
  spiritomb: {
    name: 'spiritomb', poke_sprite391: sprite('Natdex', 12, 29),
    config: { extra: { spirits: 0, goal: 108, Xmult_mod: 0.02, created: false } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card', 'on_sell', 'spectral'], poke_after: 'happiny',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Spectral', key: 'c_soul' });
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_mod, ex.spirits, ex.goal, spirit_x(ex)] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main && spirit_x(ex) > 1) return { message: a_xmult(spirit_x(ex)), colour: 'XMULT', Xmult_mod: spirit_x(ex) };
      let gained = 0;
      if (context.remove_playing_cards && !context.blueprint && context.removed) gained = context.removed.length;
      if (context.selling_card && !context.blueprint && context.card !== card && context.card.ability.set === 'Joker') gained = 1;
      if (gained > 0) {
        ex.spirits = ex.spirits + gained;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
      }
      if ((gained > 0 || round_end(context)) && !context.blueprint) spirit_soul(card);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Tatsugiri 978 (Dragon, Gen 9)
  // Nature (rolled on creation): Curly, Droopy or Stretchy. Commander: the leftmost Water Joker gives X1.75 Mult / +100 Chips /
  // +20 Mult. Tatsugiri itself gives nothing.
  tatsugiri: {
    name: 'tatsugiri', poke_sprite391: sprite('Gen09', 0, 3),
    config: { extra: { Xmult_multi: 1.75, chips: 100, mult: 20 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'chips', 'mult', 'joker', 'types', 'nature', 'position'], poke_after: 'houndstone',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_multi, ex.chips, ex.mult], key: TATSU_FORMS.includes(ex.form) ? 'j_poke_tatsugiri_' + ex.form : undefined };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom_element(TATSU_FORMS, pseudoseed('tatsugiri'))[0];
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.other_joker && TATSU_FORMS.includes(ex.form) && context.other_joker === commanded(card)) {
        const target = context.other_joker;
        G.E_MANAGER.add_event(() => { target.juice_up(0.5, 0.5); });
        if (ex.form === 'curly') return { message: a_xmult(ex.Xmult_multi), colour: 'XMULT', Xmult_mod: ex.Xmult_multi };
        if (ex.form === 'droopy') return { message: a_chips(ex.chips), colour: 'CHIPS', chip_mod: ex.chips };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F2: Sprigatito -> Floragato -> Meowscarada (Grass starter, Gen 9)
  // The owner's design (2026-10-27, after the 25; reworked in contentRev 23): Hiker for Lucky cards. Sprigatito 906: when a Lucky card
  // triggers (its 1 in 5 Mult or 1 in 15 money), that card permanently gains +1 Mult and +$1 when scored (perma_mult / perma_p_dollars,
  // Hiker's perma_bonus route), every time it scores after. The Mult step is `mult_mod` (Energy: +20% of its base each), the money step
  // `dollars` (in no energy_values: fixed); a card keeps what it was given — later Energy doesn't re-grow it (Houndour's perma_mult).
  // Evolves after 8 Lucky triggers (scaling_evo on `lucky_triggers`, at end of round; a card hitting both rolls counts 2 but grows
  // once); each evolution creates a Negative The Magician (Whismur's Negative Justice).
  sprigatito: {
    name: 'sprigatito', poke_sprite391: sprite('Natdex', 10, 60),
    config: { evo_rqmt: 8, extra: { mult_mod: 1, dollars: 1, lucky_triggers: 0 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: true, starter: true,
    attributes: ['starter', 'mult', 'economy', 'enhancements', 'modify_card', 'tarot', 'trigger_evo'], poke_after: 'ursaluna',
    loc_vars(self, info_queue, card) {
      lucky_legacy(self, card);
      type_tooltip(self, info_queue, card); lucky_tips(info_queue, true);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult_mod), ex.dollars, lucky_left(self, card), ex.lucky_triggers || 0, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      lucky_legacy(self, card);
      return lucky_grow(card, context) || scaling_evo(self, card, context, 'j_poke_floragato', card.ability.extra.lucky_triggers || 0, self.config.evo_rqmt);
    },
  },
  // Floragato 907: the same, +2 Mult and +$2 per Lucky trigger. Evolves after 12 more Lucky triggers (the count starts over). A Negative
  // The Magician when it evolves in.
  floragato: {
    name: 'floragato', poke_sprite391: sprite('Natdex', 12, 60),
    config: { evo_rqmt: 12, extra: { mult_mod: 2, dollars: 2, lucky_triggers: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'mult', 'economy', 'enhancements', 'modify_card', 'tarot', 'trigger_evo'], poke_after: 'sprigatito',
    loc_vars(self, info_queue, card) {
      lucky_legacy(self, card);
      type_tooltip(self, info_queue, card); lucky_tips(info_queue, true);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult_mod), ex.dollars, lucky_left(self, card), ex.lucky_triggers || 0, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      lucky_legacy(self, card);
      evolved_tarot(card, context, 'sprigatito', 'c_magician');
      return lucky_grow(card, context) || scaling_evo(self, card, context, 'j_poke_meowscarada', card.ability.extra.lucky_triggers || 0, self.config.evo_rqmt);
    },
  },
  // Meowscarada 908: no more +Mult / +$ (the cards keep theirs); a Lucky card that triggers permanently gains X0.5 Mult (perma_x_mult:
  // X1.5 after one trigger, X2 after two, scored every time after). The gain is `Xmult_mod` (Energy +20% of its base each: X0.6 / X0.7 /
  // X0.8); a banked X stays what it was. A Negative The Magician when it evolves in.
  meowscarada: {
    name: 'meowscarada', poke_sprite391: sprite('Natdex', 14, 60),
    config: { extra: { Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'xmult', 'scaling', 'enhancements', 'modify_card'], poke_after: 'floragato',
    loc_vars(self, info_queue, card) { lucky_legacy(self, card); type_tooltip(self, info_queue, card); lucky_tips(info_queue, false); return { vars: [r3(card.ability.extra.Xmult_mod)] }; },
    calculate(self, card, context) {
      lucky_legacy(self, card);
      evolved_tarot(card, context, 'floragato', 'c_magician');
      return lucky_xgrow(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE F3: Whismur -> Loudred -> Exploud (Colorless, Gen 3)
  // The owner's design (2026-10-27): each Glass card that breaks (its 1 in 4 shatter, as Glass Joker counts) grows the joker, and
  // every form keeps what the last had. Starting / banked totals: glass_chips / glass_mult / glass_Xmult (in no energy_values:
  // Energy never scales them, so a banked gain keeps its worth); the gain per break: chip_mod / mult_mod / Xmult_mod (Energy +20%
  // of its base each: +4 / +0.6 / +X0.04). The totals carry over on evolution (poke_custom_values_to_keep); Energy too
  // (energy_count, re-applied to the new base gain). Each evolution makes a Negative Justice (Chingling's). 4 rounds, then 5.
  // Whismur 293: +30 Chips; +20 Chips per broken Glass card.
  whismur: {
    name: 'whismur', poke_sprite391: sprite('Natdex', 14, 19),
    config: { extra: { glass_chips: 30, chip_mod: 20, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'tarot', 'round_evo'], poke_after: 'shedinja',
    poke_custom_values_to_keep: ['glass_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, true); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.chip_mod, ex.rounds] }; },
    calculate(self, card, context) {
      return glass_grow(card, context, 'glass_chips', 'chip_mod', 'a_chips') || glass_main(card, context) || level_evo(self, card, context, 'j_poke_loudred');
    },
  },
  // Loudred 294: Whismur's Chips (+30 fresh) and +4 Mult; +3 Mult per broken Glass card. A Negative Justice when it evolves in.
  loudred: {
    name: 'loudred', poke_sprite391: sprite('Natdex', 16, 19),
    config: { extra: { glass_chips: 30, glass_mult: 4, mult_mod: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'mult', 'scaling', 'enhancements', 'tarot', 'round_evo'], poke_after: 'whismur',
    poke_custom_values_to_keep: ['glass_chips', 'glass_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, true); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.glass_mult, ex.mult_mod, ex.rounds] }; },
    calculate(self, card, context) {
      glass_evolved(card, context, 'whismur');
      return glass_grow(card, context, 'glass_mult', 'mult_mod', 'a_mult') || glass_main(card, context) || level_evo(self, card, context, 'j_poke_exploud');
    },
  },
  // Exploud 295: the Chips and the Mult (+30 / +4 fresh) and X1.5 Mult; +X0.2 per broken Glass card. A Negative Justice when it
  // evolves in.
  exploud: {
    name: 'exploud', poke_sprite391: sprite('Natdex', 18, 19),
    config: { extra: { glass_chips: 30, glass_mult: 4, glass_Xmult: 1.5, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'mult', 'xmult', 'scaling', 'enhancements'], poke_after: 'loudred',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tips(info_queue, false); const ex = card.ability.extra; return { vars: [ex.glass_chips, ex.glass_mult, ex.glass_Xmult, ex.Xmult_mod] }; },
    calculate(self, card, context) {
      glass_evolved(card, context, 'loudred');
      return glass_grow(card, context, 'glass_Xmult', 'Xmult_mod', 'a_xmult') || glass_main(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE F4: Gulpin -> Swalot (Dark, Gen 3)
  // The owner's design (2026-10-27): Stockpile. At the end of each round it swallows (destroys, Pokermon's poke_remove_card — the
  // Hazard plumbing) 1 Hazard card held in hand, else 1 Diamond card held in hand, gaining 1 Stockpile up to its max (3; each
  // Energy +1: the house energy field `stockpile_max`, systems/energy.js). Scored Diamonds give +2 Mult per Stockpile
  // (`stockpile_mult`: not energized). Gulpin at max swallows only Hazards (a Diamond would be eaten for nothing); it evolves at
  // exactly 3 Stockpile (fixed: Energy never slows it), and the Stockpile carries into Swalot.
  // Gulpin 316: Uncommon $6.
  gulpin: {
    name: 'gulpin', poke_sprite391: sprite('Natdex', 0, 21),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_mult: 2, stockpile_evo: 3 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'suit', 'diamonds', 'hazards', 'destroy_card', 'scaling_evo'], poke_after: 'roselia',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra;
      return { vars: [ex.stockpile, stock_max(ex), ex.stockpile_mult, stock_mult(ex), ex.stockpile_evo] };
    },
    calculate(self, card, context) {
      const r = stockpile_mult(card, context);
      if (r) return r;
      swallow(card, context, false);
      return scaling_evo(self, card, context, 'j_poke_swalot', card.ability.extra.stockpile, card.ability.extra.stockpile_evo);
    },
  },
  // Swalot 317: Safari $8. Keeps the Stockpile and its Mult; a swallowed Diamond (when no Hazard is held) also pays its rank in $
  // (2-10, J 11, Q 12, K 13, A 14: get_id, as Balatro numbers ranks; fixed, not energized) — even at max. X0.1 Mult per card the
  // deck is below its starting size (Erosion's G.GAME.starting_deck_size; `Xmult_mod`, energized: +X0.02 per Energy), never below X1.
  swalot: {
    name: 'swalot', poke_sprite391: sprite('Natdex', 2, 21),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_mult: 2, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'economy', 'suit', 'diamonds', 'hazards', 'destroy_card', 'full_deck'], poke_after: 'gulpin',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra;
      return { vars: [ex.stockpile, stock_max(ex), ex.stockpile_mult, stock_mult(ex), r3(ex.Xmult_mod), r3(swalot_x(ex))] };
    },
    calculate(self, card, context) {
      const r = stockpile_mult(card, context);
      if (r) return r;
      if (context.joker_main && swalot_x(card.ability.extra) > 1) {
        const x = swalot_x(card.ability.extra);
        return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      }
      swallow(card, context, true);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F5: Trapinch -> Vibrava -> Flygon (Earth, Gen 3)
  // The owner's design (2026-10-27): Sand Pit. Every card you discard (a real discard: not one an effect makes — `hook`) permanently
  // banks Chips on the joker (`sand_chips`, in no energy_values, so a banked Chip keeps its worth and Energy is never retroactive),
  // which it gives every hand. The gain per card is `chip_mod` (Energy +20% of its base each: Trapinch +0.4, Vibrava +0.6). The bank
  // carries through both evolutions (poke_custom_values_to_keep); Energy too (energy_count, re-applied to the new base). Evolution by
  // cards discarded (`sand_cards`, at end of round): 40, then 60 more (the count starts over).
  // Trapinch 328: Uncommon $6; +2 Chips per discarded card.
  trapinch: {
    name: 'trapinch', poke_sprite391: sprite('Natdex', 24, 21),
    config: { evo_rqmt: 40, extra: { sand_chips: 0, chip_mod: 2, sand_cards: 0 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'discard', 'scaling_evo'], poke_after: 'spinda',
    poke_custom_values_to_keep: ['sand_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.chip_mod), ex.sand_cards || 0, self.config.evo_rqmt] }; },
    calculate(self, card, context) {
      return sand_pit(card, context) || sand_main(card, context) || scaling_evo(self, card, context, 'j_poke_vibrava', card.ability.extra.sand_cards || 0, self.config.evo_rqmt);
    },
  },
  // Vibrava 329: Safari $8. Trapinch's bank, +3 Chips per discarded card; Supersonic: +1 discard each round while held (fixed: d_size
  // is never energized). Evolves after 60 more discarded cards.
  vibrava: {
    name: 'vibrava', poke_sprite391: sprite('Natdex', 26, 21),
    config: { evo_rqmt: 60, extra: { sand_chips: 0, chip_mod: 3, sand_cards: 0, d_size: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'discard', 'scaling_evo'], poke_after: 'trapinch',
    poke_custom_values_to_keep: ['sand_chips'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.chip_mod), ex.sand_cards || 0, self.config.evo_rqmt, ex.d_size] }; },
    calculate(self, card, context) {
      return sand_pit(card, context) || sand_main(card, context) || scaling_evo(self, card, context, 'j_poke_flygon', card.ability.extra.sand_cards || 0, self.config.evo_rqmt);
    },
  },
  // Flygon 330: Safari $10. Gives the whole bank (it banks no more: its power is the X Mult) and, Sandstorm, X(1 + 0.25 per discard
  // used this round): a discard use counts once however many cards; it resets each round. `Xmult_mod` (Energy +20% of its base each:
  // X0.3 / X0.35 / X0.4 per discard). No +1 discard (Vibrava's goes when it evolves).
  flygon: {
    name: 'flygon', poke_sprite391: sprite('Natdex', 28, 21),
    config: { extra: { sand_chips: 0, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'discard', 'reset'], poke_after: 'vibrava',
    poke_custom_values_to_keep: ['sand_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.sand_chips), r3(ex.Xmult_mod), sandstorm_x(ex)] }; },
    calculate(self, card, context) { return sand_main(card, context); },
  },

  // ---------------------------------------------------------------- LINE F6: Spoink -> Grumpig (Psychic, Gen 3)
  // The owner's design (2026-10-27): Pearl. At the end of each round a random card held in hand with no seal gains a Pink Seal
  // (pearl: seeded; none unsealed, nothing). Every Pink Seal trigger (its scoring effect firing, with or without room for the Energy:
  // seals1.js pink_triggered -> the center's poke_pink_trigger hook; Blueprint has none, so it copies the X Mult and never counts)
  // grows the banked X Mult (`pink_Xmult`, in no energy field: never retroactive; kept through evolution). The gains are `Xmult_mod`
  // (Energy +20% of its base each: Spoink X0.1 -> +0.02, Grumpig X0.15 -> +0.03, its Black Pearl twice that -> +0.06).
  // Spoink 325: Common $5; X0.1 per Pink Seal trigger; evolves after 8 triggers (`pink_triggers`, at end of round).
  spoink: {
    name: 'spoink', poke_sprite391: sprite('Natdex', 18, 21),
    config: { evo_rqmt: 8, extra: { pink_Xmult: 1, Xmult_mod: 0.1, pink_triggers: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'seals', 'energy', 'scaling_evo'], poke_after: 'torkoal',
    poke_custom_values_to_keep: ['pink_Xmult'],
    poke_pink_trigger(self, card) {
      const ex = card.ability.extra;
      ex.pink_triggers = (ex.pink_triggers || 0) + 1;
      ex.pink_Xmult = r3(ex.pink_Xmult + ex.Xmult_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); pink_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [r3(ex.pink_Xmult), r3(ex.Xmult_mod), ex.pink_triggers || 0, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      pearl(card, context);
      return pearl_main(card, context) || scaling_evo(self, card, context, 'j_poke_grumpig', card.ability.extra.pink_triggers || 0, self.config.evo_rqmt);
    },
  },
  // Grumpig 326: Safari $8. Spoink's bank and Pearl; Spoink Dance: Pink Seals trigger on EVERY hand while it is held (seals1.js);
  // X0.15 for each hand in which a Pink Seal triggered (once per hand, not per seal); Black Pearl: X0.3 instead when one of that
  // hand's Pink Seals had no room for its Energy (the overflow gain replaces the normal one: still once per hand).
  grumpig: {
    name: 'grumpig', poke_sprite391: sprite('Natdex', 20, 21),
    config: { extra: { pink_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'seals', 'energy'], poke_after: 'spoink',
    poke_custom_values_to_keep: ['pink_Xmult'],
    poke_pink_trigger(self, card, seal_card, overflow) { grumpig_gain(card, overflow); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); pink_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [r3(ex.pink_Xmult), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod)] };
    },
    calculate(self, card, context) {
      pearl(card, context);
      return pearl_main(card, context);
    },
  },

  // ---------------------------------------------------------------- Castform 351 (Colorless, Gen 3)
  // The owner's design (2026-10-27): Forecast. When the round's first hand is drawn, Castform reads the weather from the suit held
  // most (forecast: Hearts + Diamonds together vs Clubs vs Spades; Wild counts for all three; debuffed / suitless cards for none;
  // a tie is Normal) and takes that form for the whole round — its type too (Sunny Fire, Rainy Water, Snowy Water: Ice maps to
  // Water, Normal Colorless). After the round (the end_of_round pass, queued so the other jokers' end-of-round effects still see the
  // form) it is Normal again: in the shop it is Colorless. Effects: Sunny, scored Hearts / Diamonds +4 Mult (`mult1`); Rainy, scored
  // Clubs +30 Chips (`chips1`) and the first scored Club retriggers (fixed); Snowy, Spades held in hand X1.1 Mult each (`Xmult_multi`);
  // Normal, +10 Mult (`mult2`). Energy (energize, the usual shares of base): every form's number at once — mult1 / mult2 +40%, chips1
  // +30%, Xmult_multi +5%; Colorless Energy always matches (half strength unless it is Normal, as on any non-Colorless joker), its
  // current form's type matches while it is in that form. Its changing type never counts against a Monotype run (poke_mono_exempt:
  // systems/runbadges.js leaves it out of the check). Art: upstream 3.9.1's own cards — its Natdex card (Normal) and the three
  // weather forms on the Gen 3 sheet (ui.js, systems/anim.js CASTFORM_SPRITES).
  castform: {
    name: 'castform', poke_sprite391: sprite('Natdex', 10, 23),
    config: { extra: { mult1: 4, chips1: 30, retriggers: 1, Xmult_multi: 1.1, mult2: 10, form: 'normal' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 3, blueprint_compat: true,
    attributes: ['mult', 'chips', 'xmult', 'retrigger', 'suits', 'types', 'hand_drawn'], poke_after: 'milotic',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, form = CASTFORM_FORMS[ex.form] ? ex.form : 'normal';
      return { vars: [r3(ex.mult1), r3(ex.chips1), r3(ex.Xmult_multi), r3(ex.mult2), CASTFORM_FORMS[form].name], key: form === 'normal' ? undefined : 'j_poke_castform_' + form };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (first_deal(card, context)) {
        ex.forecast_round = G.GAME.round;
        const form = forecast(G.hand.cards);
        castform_set_form(card, form);
        card_eval_status_text(card, 'extra', null, null, null, { message: CASTFORM_FORMS[form].name + '!', colour: CASTFORM_FORMS[form].colour });
        return undefined;
      }
      if (round_end(context) && !context.blueprint) {
        G.E_MANAGER.add_event(() => { castform_set_form(card, 'normal'); });
        return undefined;
      }
      const form = ex.form;
      if (form === 'sunny' && context.individual && context.cardarea === G.play && !context.end_of_round
        && (context.other_card.is_suit('Hearts') || context.other_card.is_suit('Diamonds'))) return { mult: ex.mult1, card };
      if (form === 'rainy') {
        if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Clubs')) return { chips: ex.chips1, card };
        if (context.repetition && context.cardarea === G.play && context.other_card === first_club(context)) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (form === 'snowy' && context.individual && context.cardarea === G.hand && !context.end_of_round && context.other_card.is_suit('Spades')) {
        return { x_mult: ex.Xmult_multi, card };
      }
      if (form === 'normal' && context.joker_main) return { message: a_mult(r3(ex.mult2)), colour: 'MULT', mult_mod: ex.mult2 };
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE I: Mudbray -> Mudsdale (Earth, Gen 7)
  // Mudbray 749: +20 Chips; Stamina: +6 Chips for each hand that isn't the round's first. Evolves in 5 rounds.
  mudbray: {
    name: 'mudbray', poke_sprite391: sprite('Natdex', 26, 49),
    config: { extra: { chips: 20, chip_mod: 6, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'round_evo'], poke_after: 'lycanroc_dusk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chips, ex.chip_mod, ex.rounds] }; },
    calculate(self, card, context) { return stamina(card, context) || level_evo(self, card, context, 'j_poke_mudsdale'); },
  },
  // Mudsdale 750: Stamina +10 Chips; Mud Spit: the first unscored card of each played hand becomes a Stone card.
  mudsdale: {
    name: 'mudsdale', poke_sprite391: sprite('Natdex', 28, 49),
    config: { extra: { chips: 20, chip_mod: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'modify_card', 'enhancements'], poke_after: 'mudbray',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [ex.chip_mod, ex.chips] }; },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint && context.full_hand) {
        const target = context.full_hand.find((c) => !context.scoring_hand.includes(c));
        if (target) {
          target.set_ability(P_CENTERS.m_stone, null, true);
          G.E_MANAGER.add_event(() => { target.juice_up(); });
          card_eval_status_text(card, 'extra', null, null, null, { message: 'Mud Spit!', colour: 'CHIPS' });
        }
      }
      return stamina(card, context);
    },
  },
}, FILE);

/** The families (functions/pokefamily.lua style): index.js adds them with set_family. */
export const DESIGN_FAMILIES = [
  ['shinx', 'luxio', 'luxray'],
  ['honedge', 'doublade', 'aegislash'],
  ['spheal', 'sealeo', 'walrein'],
  ['grookey', 'thwackey', 'rillaboom'],
  ['kubfu', 'urshifu_single', 'urshifu_rapid'],
  ['tandemaus', 'maushold'],
  ['darumaka', 'darmanitan'],
  ['scraggy', 'scrafty'],
  ['mudbray', 'mudsdale'],
  ['sprigatito', 'floragato', 'meowscarada'],
  ['whismur', 'loudred', 'exploud'],
  ['gulpin', 'swalot'],
  ['trapinch', 'vibrava', 'flygon'],
  ['spoink', 'grumpig'],
];

/** Their text (Pokermon loc style: #n# filled by loc_vars), from the design guide; index.js merges it into descriptions.Joker. */
const EVOLVES_ROUNDS = (n) => '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#' + n + '#{C:inactive,s:0.8} rounds)';
const ROLLOUT = (c, m) => ['{C:attention}Rollout:{} {C:chips}+#' + c + '#{} Chips, doubled', 'for each consecutive hand of', 'the same poker hand {C:inactive}(max #' + m + '# doublings)'];
const PAIR = ['Played cards that share a rank', 'with another scored card give', '{C:mult}+#1#{} Mult when scored'];
const TRAIN = (x) => ['Gains {X:mult,C:white} X#' + x + '# {} Mult when a hand', 'with exactly {C:attention}1{} or exactly {C:attention}5{}', 'scoring cards is played', '{C:inactive}(Can\'t be debuffed)'];
const LUCKY_GROW = [
  ['When a {C:attention}Lucky{} card triggers,', 'it permanently gains {C:mult}+#1#{} Mult', 'and {C:money}$#2#{} when scored'],
  ['On evolution, create a', '{C:dark_edition}Negative{} {C:tarot}The Magician{}', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} Lucky triggers)', '{C:inactive,s:0.8}(Lucky triggers: #4#/#5#)'],
];
const GLASS_BREAKS = (gain) => [gain + ' each', 'time a {C:attention}Glass{} card breaks'];
const NEG_JUSTICE = ['On evolution, create a', '{C:dark_edition}Negative{} {C:tarot}Justice{}'];
const SWALLOW = (money) => ['At end of round, swallow (destroy)', 'a {C:attention}Hazard{} card held in hand', 'and gain {C:attention}1{} Stockpile; if none,', 'a {C:diamonds}Diamond{} card held in hand',
  ...(money ? ['and earn {C:money}${} equal to its rank', '{C:inactive,s:0.8}(J 11, Q 12, K 13, A 14)'] : []), '{C:inactive}(Currently {C:attention}#1#{C:inactive}/#2# Stockpile)'];
const STOCK_MULT = ['Scored {C:diamonds}Diamond{} cards give', '{C:mult}+#3#{} Mult per Stockpile', '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)'];
const STOCK_ENERGY = '{C:inactive,s:0.8}(Each Energy: +1 max Stockpile)';
const SAND_PIT = (name) => ['{C:attention}' + name + ':{} each card you', 'discard permanently adds', '{C:chips}+#2#{} Chips to this Joker', '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)'];
const SAND_EVO = ['{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#4#{C:inactive,s:0.8} discarded cards)', '{C:inactive,s:0.8}(Discarded: #3#/#4#)'];
const PEARL = ['{C:attention}Pearl:{} at end of round, a', 'random card held in hand', 'with no seal gains a {C:attention}Pink Seal{}'];
const FORECAST = ['{C:attention}Forecast:{} when a round\'s first', 'hand is drawn, takes the form', 'of the suit held most'];
const FORECAST_NOTE = ['{C:inactive,s:0.8}(Normal again after the round;', '{C:inactive,s:0.8}its type never breaks Monotype)'];
const COMMANDER = ['{C:attention}Commander:{} the leftmost', '{X:poke_water,C:white}Water{} Joker gives'];
export const DESIGN_LOC = {
  Joker: {
    j_poke_shinx: { name: 'Shinx', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card', 'earn {C:money}$#2#{} when scored', EVOLVES_ROUNDS(3)] },
    j_poke_luxio: { name: 'Luxio', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card give', '{C:mult}+#2#{} Mult and earn {C:money}$#3#{} when scored', EVOLVES_ROUNDS(4)] },
    j_poke_luxray: { name: 'Luxray', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card give', '{X:mult,C:white} X#2# {} Mult and earn {C:money}$#3#{}', 'when scored'] },
    j_poke_honedge: { name: 'Honedge', text: ['Gains {C:mult}+#1#{} Mult for each', '{C:attention}Steel{} card held in hand', 'when a hand is played', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves at {C:mult,s:0.8}+#2#{C:inactive,s:0.8} / +#3# Mult)'] },
    j_poke_doublade: { name: 'Doublade', text: [
      ['Gains {C:mult}+#1#{} Mult for each', '{C:attention}Steel{} card held in hand', 'when a hand is played'],
      ['Retrigger the first {C:attention}#2#{}', '{C:attention}Steel{} cards held in hand', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves with a {C:attention,s:0.8}Dusk Stone{C:inactive,s:0.8})'],
    ] },
    j_poke_aegislash: { name: 'Aegislash', text: [
      ['{C:mult}+#1#{} Mult {C:inactive}(kept from Doublade)', '{C:attention}Stance Change:{}', '{C:attention}Blade Forme:{} {X:mult,C:white} X#2# {} Mult', '{C:attention}Shield Forme:{} retrigger all', '{C:attention}Steel{} cards held in hand'],
      ['Playing a hand switches to Blade Forme,', 'discarding switches to Shield Forme', '{C:inactive}(Starts each round in Shield Forme)', '{C:inactive}(Currently {C:attention}#3#{C:inactive} Forme)'],
    ] },
    j_poke_spheal: { name: 'Spheal', text: [...ROLLOUT(1, 2), '{C:inactive}(Resets when the hand changes', '{C:inactive}and at end of round)', '{C:inactive}(Currently {C:chips}+#3#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_sealeo: { name: 'Sealeo', text: ['{C:chips}+#1#{} hand', ...ROLLOUT(2, 3), '{C:inactive}(Currently {C:chips}+#5#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_walrein: { name: 'Walrein', text: [
      ['{C:chips}+#1#{} hand', ...ROLLOUT(2, 3), '{C:inactive}(Currently {C:chips}+#5#{C:inactive} Chips)'],
      ['{C:attention}Sheer Cold:{} {X:mult,C:white} X#4# {} Mult while', 'Rollout is at full power'],
    ] },
    j_poke_grookey: { name: 'Grookey', text: ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered and', 'gives {C:mult}+#6#{} Mult', '{C:inactive}(Beat {C:attention}#3#{C:inactive}/#5#)', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#4#{C:inactive,s:0.8} beats)'] },
    j_poke_thwackey: { name: 'Thwackey', text: ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered and', 'gives {C:mult}+#4#{} Mult', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} beats)'] },
    j_poke_rillaboom: { name: 'Rillaboom', text: [
      ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered'],
      ['{C:attention}Drum Beating:{} retriggered cards', 'give {C:mult}+#3#{} Mult'],
    ] },
    j_poke_kubfu: { name: 'Kubfu', text: ['This Joker can\'t be debuffed', 'Gains {X:mult,C:white} X#1# {} Mult when a hand', 'with exactly {C:attention}1{} or exactly {C:attention}5{}', 'scoring cards is played', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)',
      '{C:inactive,s:0.8}(Evolves after #3# trainings:', '{C:inactive,s:0.8}more 1-card hands: Single Strike,', '{C:inactive,s:0.8}more 5-card hands: Rapid Strike)', '{C:inactive,s:0.8}(Single {C:attention,s:0.8}#4#{C:inactive,s:0.8} / Rapid {C:attention,s:0.8}#5#{C:inactive,s:0.8})'] },
    j_poke_urshifu_single: { name: 'Urshifu', text: [
      ['{C:attention}Single Strike Style', '{X:mult,C:white} X#1# {} Mult {C:inactive}(kept from Kubfu)', '{C:attention}Unseen Fist:{} playing cards', 'can\'t be debuffed'],
      ['{C:attention}Wicked Blow:{} if played hand is', 'exactly {C:attention}1{} card, it also gives this', 'Joker\'s {X:mult,C:white}X{} Mult when scored'],
      TRAIN(2),
    ] },
    j_poke_urshifu_rapid: { name: 'Urshifu', text: [
      ['{C:attention}Rapid Strike Style', '{X:mult,C:white} X#1# {} Mult {C:inactive}(kept from Kubfu)', '{C:attention}Surging Strikes:{} retrigger', 'the first {C:attention}#3#{} scored cards'],
      TRAIN(2),
    ] },
    j_poke_xerneas: { name: 'Xerneas', text: [
      ['{C:attention}Geomancy:{} after the first hand', 'of each round, played cards give', '{X:mult,C:white} X#1# {} Mult when scored', '{C:inactive}(#2#)'],
      ['The first playing card destroyed', 'each round returns to your hand', 'as a copy'],
    ] },
    j_poke_tandemaus: { name: 'Tandemaus', text: [...PAIR, '{C:inactive}(The pair never separates)', EVOLVES_ROUNDS(2)] },
    j_poke_maushold: { name: 'Maushold', text: [PAIR,
      ['{C:attention}Population Bomb:{} retrigger the', 'first scored card, then {C:green}#2# in #3#{}', 'chance to retrigger it again,', 'up to {C:attention}#4#{} times {C:inactive}(Family of Four)']] },
    j_poke_maushold_three: { name: 'Maushold', text: [PAIR,
      ['{C:attention}Population Bomb:{} retrigger the', 'first scored card, then {C:green}#2# in #3#{}', 'chance to retrigger it again,', 'up to {C:attention}#4#{} times; each retrigger', 'earns {C:money}$#5#{} {C:inactive}(Family of Three)']] },
    j_poke_darumaka: { name: 'Darumaka', text: ['{C:mult}+#1#{} Mult', '{C:attention}Hustle:{} {C:green}#2# in #3#{} chance', 'to give nothing', EVOLVES_ROUNDS(4)] },
    j_poke_darmanitan: { name: 'Darmanitan', text: [['{C:mult}+#1#{} Mult'],
      ['{C:attention}Zen Mode:{} on the final hand of', 'the round, gives {X:mult,C:white} X#2# {} Mult instead', 'and becomes {X:poke_psychic,C:white}Psychic{} until', 'end of round']] },
    j_poke_scraggy: { name: 'Scraggy', text: ['{C:mult}+#1#{} Mult', '{C:attention}Moxie:{} gains {C:mult}+#2#{} Mult when a', 'Blind is defeated with the', 'first hand of the round', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_scrafty: { name: 'Scrafty', text: [
      ['{C:attention}Moxie:{} gains {C:mult}+#1#{} Mult, plus {C:mult}+#2#{}', 'for each other {X:poke_dark,C:white}Dark{} Joker, when a', 'Blind is defeated with the first', 'hand of the round'],
      ['{X:mult,C:white} X#3# {} Mult on the first', 'hand of each round', '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)'],
    ] },
    j_poke_spiritomb: { name: 'Spiritomb', text: [
      ['Gains {C:attention}1{} spirit when a playing', 'card is destroyed or a Joker is sold', '{X:mult,C:white} X#1# {} Mult per spirit', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#3# spirits, {X:mult,C:white} X#4# {C:inactive})'],
      ['At {C:attention}#3#{} spirits, create {C:spectral}The Soul{}', '{C:inactive}(Once; must have room)'],
    ] },
    j_poke_tatsugiri: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Curly, Droopy or Stretchy', ...COMMANDER, '{C:inactive}Curly:{} {X:mult,C:white} X#1# {} Mult', '{C:inactive}Droopy:{} {C:chips}+#2#{} Chips', '{C:inactive}Stretchy:{} {C:mult}+#3#{} Mult'] },
    j_poke_tatsugiri_curly: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Curly', ...COMMANDER, '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_tatsugiri_droopy: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Droopy', ...COMMANDER, '{C:chips}+#2#{} Chips'] },
    j_poke_tatsugiri_stretchy: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Stretchy', ...COMMANDER, '{C:mult}+#3#{} Mult'] },
    j_poke_sprigatito: { name: 'Sprigatito', text: LUCKY_GROW },
    j_poke_floragato: { name: 'Floragato', text: LUCKY_GROW },
    j_poke_meowscarada: { name: 'Meowscarada', text: ['When a {C:attention}Lucky{} card triggers,', 'it permanently gains', '{X:mult,C:white} X#1# {} Mult when scored'] },
    j_poke_whismur: { name: 'Whismur', text: [
      ['{C:chips}+#1#{} Chips', ...GLASS_BREAKS('Gains {C:chips}+#2#{} Chips')],
      [...NEG_JUSTICE, EVOLVES_ROUNDS(3)],
    ] },
    j_poke_loudred: { name: 'Loudred', text: [
      ['{C:chips}+#1#{} Chips, {C:mult}+#2#{} Mult', ...GLASS_BREAKS('Gains {C:mult}+#3#{} Mult')],
      [...NEG_JUSTICE, EVOLVES_ROUNDS(4)],
    ] },
    j_poke_exploud: { name: 'Exploud', text: [
      '{C:chips}+#1#{} Chips, {C:mult}+#2#{} Mult,', '{X:mult,C:white} X#3# {} Mult', ...GLASS_BREAKS('Gains {X:mult,C:white} X#4# {} Mult'),
    ] },
    j_poke_gulpin: { name: 'Gulpin', text: [
      [...SWALLOW(false), '{C:inactive}(At max, only Hazards)', STOCK_ENERGY],
      [...STOCK_MULT, '{C:inactive,s:0.8}(Evolves at {C:attention,s:0.8}#5#{C:inactive,s:0.8} Stockpile)'],
    ] },
    j_poke_swalot: { name: 'Swalot', text: [
      [...SWALLOW(true), STOCK_ENERGY],
      STOCK_MULT,
      ['{X:mult,C:white} X#5# {} Mult for each card', 'below your starting deck size', '{C:inactive}(Currently {X:mult,C:white} X#6# {C:inactive} Mult)'],
    ] },
    j_poke_trapinch: { name: 'Trapinch', text: [...SAND_PIT('Sand Pit'), ...SAND_EVO] },
    j_poke_vibrava: { name: 'Vibrava', text: [
      ['{C:red}+#5#{} discard each round'],
      [...SAND_PIT('Supersonic'), ...SAND_EVO],
    ] },
    j_poke_flygon: { name: 'Flygon', text: [
      ['{C:chips}+#1#{} Chips {C:inactive}(kept from Vibrava)'],
      ['{C:poke_sand}Sandstorm:{} {X:mult,C:white} X#2# {} Mult for', 'each discard used this round', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    j_poke_spoink: { name: 'Spoink', text: [
      PEARL,
      ['Gains {X:mult,C:white} X#2# {} Mult each', 'time a {C:attention}Pink Seal{} triggers', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)',
        '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#4#{C:inactive,s:0.8} Pink Seal triggers)', '{C:inactive,s:0.8}(Pink Seal triggers: #3#/#4#)'],
    ] },
    j_poke_grumpig: { name: 'Grumpig', text: [
      PEARL,
      ['{C:attention}Spoink Dance:{} {C:attention}Pink Seals{}', 'trigger on every hand'],
      ['Gains {X:mult,C:white} X#2# {} Mult for each', 'hand a {C:attention}Pink Seal{} triggers in', '{C:attention}Black Pearl:{} {X:mult,C:white} X#3# {} instead if', 'one had no room for its Energy', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
    ] },
    j_poke_castform: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_sun}Sunny{} ({C:hearts}Hearts{}+{C:diamonds}Diamonds{}): {X:poke_fire,C:white}Fire{}', 'scored {C:hearts}Hearts{}/{C:diamonds}Diamonds{} {C:mult}+#1#{} Mult',
        '{C:poke_rain}Rainy{} ({C:clubs}Clubs{}): {X:poke_water,C:white}Water{}', 'scored {C:clubs}Clubs{} {C:chips}+#2#{} Chips,', 'retrigger the first scored {C:clubs}Club{}',
        '{C:poke_snow}Snowy{} ({C:spades}Spades{}): {X:poke_water,C:white}Water{}', '{C:spades}Spades{} held in hand {X:mult,C:white} X#3# {} Mult',
        'Normal (a tie): {X:poke_colorless,C:white}Colorless{}', '{C:mult}+#4#{} Mult'],
      ['{C:inactive}(Currently {C:attention}#5#{C:inactive})', ...FORECAST_NOTE],
    ] },
    j_poke_castform_sunny: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_sun}Sunny Form:{} {X:poke_fire,C:white}Fire{} this round', 'Scored {C:hearts}Hearts{} and {C:diamonds}Diamonds{}', 'give {C:mult}+#1#{} Mult', ...FORECAST_NOTE],
    ] },
    j_poke_castform_rainy: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_rain}Rainy Form:{} {X:poke_water,C:white}Water{} this round', 'Scored {C:clubs}Clubs{} give {C:chips}+#2#{} Chips', 'Retrigger the first scored {C:clubs}Club{}', ...FORECAST_NOTE],
    ] },
    j_poke_castform_snowy: { name: 'Castform', text: [
      FORECAST,
      ['{C:poke_snow}Snowy Form:{} {X:poke_water,C:white}Water{} this round', 'Each {C:spades}Spade{} held in hand', 'gives {X:mult,C:white} X#3# {} Mult', ...FORECAST_NOTE],
    ] },
    j_poke_mudbray: { name: 'Mudbray', text:['{C:chips}+#1#{} Chips', '{C:attention}Stamina:{} gains {C:chips}+#2#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round', '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)', EVOLVES_ROUNDS(3)] },
    j_poke_mudsdale: { name: 'Mudsdale', text: [
      ['{C:attention}Stamina:{} gains {C:chips}+#1#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round'],
      ['{C:attention}Mud Spit:{} the first unscored', 'card in each played hand', 'becomes a {C:attention}Stone{} card', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'],
    ] },
  },
  Other: {
    poke_design_unseen_fist: { name: 'Unseen Fist', text: ['While you have this Joker,', 'no playing card is {C:attention}debuffed{}', '{C:inactive}(Boss Blind suits, faces...)'] },
  },
};

// Text boxes: a list of line lists is several boxes, written as SMODS's box break ({br:2} + filler, as Pokermon's en-us.lua) between them.
const BR = '{br:2}ERROR - CONTACT STEAK';
for (const set of Object.values(DESIGN_LOC)) {
  for (const e of Object.values(set)) if (e.text.some(Array.isArray)) e.text = e.text.flatMap((p, i) => (Array.isArray(p) ? (i ? [BR, ...p] : p) : [p]));
}
