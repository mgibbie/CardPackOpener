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
// Barboach -> Whiscash (Muddy Water: +12 / +20 Chips per Water or Earth Joker, itself included, a dual-type one once; Whiscash's
// Earthquake: with 2+ OTHER Water / Earth Jokers the round's first hand retriggers every scored card; Water; contentRev 28) — upstream
// 3.9.1 draws them too (Natdex 16 / 18, 22).
// Lunatone + Solrock, a pair like Plusle / Minun (day / night: each round's 1st, 3rd, 5th hands are day, 2nd and 4th night; Solrock
// +100 Chips on day hands, Lunatone X2 on night hands; Cosmic Power: with the other one, each covers the other half at half strength,
// +50 Chips / X1.5; Earth, Uncommon $6; contentRev 29) — upstream 3.9.1 draws them (Natdex 12 / 14, 22).
// The Regi trio: Regirock (Stone Body: Stone +100 Chips instead of +50, +10 permanent per score; Earth), Regice (Ice Body: Glass never
// shatters; Water), Registeel (Iron Body: held Steel X2 instead of X1.5; Metal), Legendary $20 each; each converts 1 + (other Regi species
// held) random deck cards to its enhancement when a Blind is selected; contentRev 31 — upstream 3.9.1 draws them with their souls
// (Natdex 2 / 4 / 6, 25).
// The Eon duo and the weather trio (contentRev 33), Legendary $20 each: Latias / Latios (Psychic: X0.15 per Tarot / per Planet used; Soul
// Dew, both held: either grows both), Kyogre (Water: +1 hand, scored Clubs retrigger, Castform Rainy), Groudon (Earth: +1 discard, scored
// Hearts / Diamonds X1.25, Castform Sunny) and their Primal Clash (both held, no Rayquaza: the suits held on the round's first deal pick one
// for the round), Rayquaza (Dragon: Delta Stream calms the clash; Dragon Ascent X0.2 per Straight / Flush) — upstream 3.9.1 draws them with
// their souls (Natdex 8-17, 25).
// Chatot (Vocabulary: +4 Mult for each different poker hand played this run; New Word: a hand's first play this run, while held,
// creates its Planet; Colorless) and Pachirisu (Quick Spark: X2 on each round's first hand, Nuzzle +X0.25 per other Lightning Joker;
// Cheek Pouch: $1 per Lightning Joker at end of round; Lightning), Rare $7 each — upstream 3.9.1 draws them (Natdex 10,29 / 22,27).
// Burmy -> Wormadam (Female) / Mothim (Male) (contentRev 37; 41 the three piles): Burmy's Cloak follows the full deck's biggest pile at each end of
// round (Stone Sandy / Earth +40 Chips, Steel Trash / Metal $1, every other card Plant / Grass +5 Mult; a tie keeps it), its type and card with
// it; its gender is rolled once when created; Wormadam keeps the cloak for good (unenhanced +3 Mult / Stone X1.5 / held Steel $1), Mothim
// X(1 + 0.25 per different enhancement in the deck) — upstream 3.9.1 draws all six cloak cards (Gen 4 sheet 0-10, 0) and Mothim (Natdex 16, 27).
// Combee -> Vespiquen (Honey Gather: at end of round the Jokers directly left and right gain +$1 / +$2 sell value; Vespiquen's Attack
// Order X(1 + 0.1 per $ of those two Jokers' sell value), max X3; Grass, Common $5 / Safari $8; contentRev 38) — upstream 3.9.1 draws
// them (Natdex 18 / 20, 27).
// The owner's Cherubi line (contentRev 39): Cherubi -> Cherrim (Grass; Sweet Seeds: a random unenhanced deck card becomes a Seed each
// Blind, +1 growth level; Cherubi evolves after 2 blooms; Cherrim's Flower Gift (3+ suits) and Sunshine Form (Flowers X2.5 instead of X2
// while sunny: a red first deal by Castform's forecast, or Groudon working)) — upstream 3.9.1 draws them (Natdex 28, 27; Gen 4 0 / 2, 1).
// Shellos -> Gastrodon (contentRev 40): a sea, West or East, rolled once per card; Tide Pool +40 Chips on the leftmost (West) / rightmost
// (East) scored card; Gastrodon's Tide retriggers it, Storm Drain X0.1 per Energy card used (X0.2 Water); Two Seas: both seas held, every one
// works on both ends; Water — upstream 3.9.1 draws both seas (Gen 4 sheet: East {4,1} / {8,1}, West {6,1} / {10,1}).
// Stunky -> Skuntank (contentRev 42): Poison Gas poisons the BLIND — after each hand you play (after its scoring and the win check, so it
// only helps later hands) the Blind's score requirement drops by 4% of its starting requirement (Skuntank's Toxic: n x 4% after the nth
// hand of the round); one shared record per Blind, at most -75% in all, never below 1 chip; reach the lowered requirement and the Blind
// is won right then; Dark — upstream 3.9.1 draws them (Natdex 26 / 28, 28).
// Gible -> Gabite -> Garchomp (contentRev 43): bite -> hoard -> cash in. Bite banks +1 Mult per scored card of a hand containing a Pair
// (evolves at +25); Gabite's Treasure Nest turns one scored card of a Full House Gold (evolves with 6 Gold cards in the full deck);
// Garchomp's Dragon Rush X(1 + 0.5 per Gold card held in hand) on top of the bank; Dragon — upstream 3.9.1 draws them (Natdex 14 / 16 /
// 18, 29).
// The last Gen 4 regulars (contentRev 44): Hippopotas -> Hippowdon (Sand Stream: scored Stone cards +30 / +60 extra Chips; Hippowdon turns
// 1 unenhanced card in hand Stone on each round's first deal), Skorupi -> Drapion (Sniper: scored cards 1 in 5 X1.25 / 1 in 3 X1.5 crits;
// Lucky cards always crit for Drapion), Carnivine (Flytrap: the round's first discarded card is devoured, +4 Mult banked), Finneon ->
// Lumineon (night hands: +40 Chips / +15 a scored card; Lumineon by day too with Lunatone) — upstream 3.9.1 draws them (Natdex 26-28, 29;
// 0-12, 30).
// The creation trio, Regigigas and Arceus (contentRev 45), Legendary $20 each: Dialga (Metal; Roar of Time: the round's first hand is scored
// twice, every scored card retriggering), Palkia (Water; Spacial Rend: +1 Joker slot, +1 hand size), Giratina (Psychic; Shadow Force: X0.25
// per destroyed playing card, X0.5 in its Origin Forme with Dialga / Palkia), Regigigas (Colorless; Slow Start: X4 once its 5-round wait,
// cut by each Regi, is over; awake with the trio, +1 Regi conversion each) and Arceus (Colorless; Multitype: every type for type checks,
// X0.25 per different type among your Jokers) — upstream 3.9.1 draws them with their souls (Gen 4 sheet; Regigigas Natdex 10, 32).
// The Lake trio, Cresselia, Manaphy and Phione (contentRev 46), Legendary $20 each: Uxie (+2 Foresight, X1.3 per Foreseen card), Mesprit (X1.5,
// X2.5 on a poker hand not yet played this round), Azelf (X2.5 on the final hand), each +X0.25 per other guardian held (Lake Guardians); Psychic.
// Cresselia (Lunar Blessing: playing cards can't be debuffed; X1.5; Psychic). Phione (+6 Mult per Water Joker) and Manaphy (X1.2 per Water
// Joker; Egg: 1 in 4 at the end of each shop, with a free slot, to create a Phione); Water — upstream 3.9.1 draws them with their souls
// (Natdex {28,31}, {0,32}, {2,32}, {14,32}, {16,32}, {18,32}).
// The Gen 8 starters (contentRev 48; the starters spec): Scorbunny -> Raboot -> Cinderace (Fire, +1 discard; +3 / +5 Mult per discard left,
// then Libero X(1 + 0.5 per discard left)) and Sobble -> Drizzile -> Inteleon (Water, +1 hand; +20 / +35 Chips per played card that doesn't
// score, then Snipe Shot X2 on the highest-ranked scored card) — upstream 3.9.1 draws them (Natdex 4-14, 54).
import {
  G, P_CENTERS, P_CENTER_POOLS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, ease_hands_played,
  create_card, copy_card, playing_card_joker_effects, defineJokers, type_tooltip, level_evo, scaling_evo, item_evo,
  ease_poke_dollars, has_enhancement, has_no_rank, get_probability_vars, pseudorandom_probability, scale_card,
  find_pokemon_type, is_type, apply_type_sticker, remove_type_stickers, type_sticker_applied, get_type, multitype, wildcard_type, POKETYPES,
  add_card, detailed, energy_values, poke_remove_card, ease_dollars, ease_discard, juice_card_until, find_card, get_total_energy, POST_EVOLVE, can_evolve,
  poke_change_growth_level,
  poke_get_adjacent_jokers, emit,
} from '../api.js';
import * as BN from '../../../js/engine/bignum.js'; // the Blind's requirement (Poison Gas) may be a big number in modded runs
import { number_format } from '../../../js/engine/core.js';

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

/** The Gen 8 starters (contentRev 48). Scorbunny / Raboot, Libero's warm-up: +mult for each discard left when the hand scores (the
 *  Cyndaquil line's cynda_calc, read at joker_main: the joker's own +1 discard counts while unused; 0 left, nothing). */
function libero_mult(card, context) {
  if (!context.joker_main) return undefined;
  const dl = G.GAME.current_round.discards_left;
  if (!(dl > 0)) return undefined;
  const m = card.ability.extra.mult * dl;
  return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
}
/** Cinderace, Libero: X(1 + Xmult_mod per discard left) (Typhlosion's X half without its +Mult; 0 left, X1: nothing). */
const libero_x = (card) => 1 + card.ability.extra.Xmult_mod * Math.max(0, G.GAME.current_round.discards_left || 0);
/** Sobble / Drizzile: the played cards that are NOT in the scoring hand (a debuffed card outside it counts; a debuffed card inside the
 *  scoring hand is part of it and doesn't; with Splash every played card scores, so none count). */
const unscored_count = (context) => (context.full_hand && context.scoring_hand ? context.full_hand.filter((c) => !context.scoring_hand.includes(c)).length : 0);
function unscored_chips(card, context) {
  if (!context.joker_main) return undefined;
  const n = unscored_count(context);
  if (!n) return undefined;
  const c = card.ability.extra.chips * n;
  return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c };
}
/** Inteleon, Snipe Shot: the target is the highest-ranked scored card that can score (not debuffed, not rankless like Stone); on a tie
 *  the LEFTMOST of them (the first to score). Read from the scoring hand each time a card scores, so a retrigger hits again. */
function snipe_target(scoring_hand) {
  let best = null;
  for (const c of scoring_hand || []) {
    if (c.debuff || has_no_rank(c)) continue;
    if (!best || c.get_id() > best.get_id()) best = c;
  }
  return best;
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

/** Gulpin / Swalot / Drifloon / Drifblim: max Stockpile (`stockpile_max`, the house energy field: base 3, +1 per Energy, +0.5 per
 *  mismatched Colorless — floored), plus a fixed `stockpile_bonus` (Drifblim's +2: its base 5, still +1 per Energy, since the energy
 *  field grows by a third of ITS base, 3). */
const stock_max = (ex) => Math.floor(ex.stockpile_max + 1e-9) + (ex.stockpile_bonus || 0);
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

/** Drifloon / Drifblim, Stockpile: each PLAYER discard action (pre_discard of a real discard; `hook` = an effect's discard, as Sand Pit)
 *  gains 1 Stockpile below max — once per discard, however many cards. Not Blueprint, not a joker retrigger. */
function drift_charge(card, context) {
  if (!context.pre_discard || context.hook || context.blueprint || context.retrigger_joker) return;
  const ex = card.ability.extra;
  if (ex.stockpile >= stock_max(ex)) return;
  ex.stockpile = ex.stockpile + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Stockpile!', colour: 'XMULT' });
}
/** Spit Up's X: X1 + spit_Xmult (0.5, in no energy field) per Stockpile. */
const spit_x = (ex) => r3(1 + ex.spit_Xmult * ex.stockpile);
/** The round's final hand: no hands left after this one is played (Acrobat's check: hands_left is already spent while it scores). */
const final_hand = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left === 0);
/** Drifloon / Drifblim, Spit Up: on the final hand, with 1+ Stockpile, X(1 + 0.5 per Stockpile) in joker_main (a Blueprint copies it,
 *  either side of the joker: the Stockpile is still there for it). The joker itself marks the Spit Up (`spitting`), and in `after` (once
 *  the whole hand has scored) resets the Stockpile to 0 and counts it (`spit_ups`, Drifloon's evolution) — once, never by a Blueprint or a
 *  joker retrigger. 0 Stockpile: nothing, and it doesn't count. */
function spit_up(card, context) {
  const ex = card.ability.extra;
  if (context.joker_main && final_hand() && ex.stockpile > 0) {
    if (!context.blueprint) ex.spitting = true;
    const x = spit_x(ex);
    return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
  }
  if (context.after && ex.spitting && !context.blueprint && !context.retrigger_joker) {
    ex.spitting = undefined;
    ex.stockpile = 0;
    if (ex.spit_ups !== undefined) ex.spit_ups = ex.spit_ups + 1;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Spit Up!', colour: 'XMULT' });
  }
  return undefined;
}
/** Drifblim, Aftermath: a Negative Spectral (random: create_card's seeded roll, key_append 'drifblim'; Negative, so it needs no free
 *  consumable slot). From selling_self (sold) and from the start_dissolve hook (destroyed: Ceremonial Dagger, Madness, Hex, Ankh, a
 *  Pokermon eater...; index.js hooks.start_dissolve -> drifblim_destroyed). Not on evolving or any transform (set_ability: no
 *  dissolve); not from a Blueprint; not while debuffed (a debuffed joker has no abilities). */
function aftermath(card) {
  G.E_MANAGER.add_event(() => { add_card({ set: 'Spectral', edition: 'e_negative', key_append: 'drifblim' }); });
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Aftermath!', colour: 'Spectral' });
}
/** index.js hooks.start_dissolve: an owned Drifblim being destroyed (a saved one — joker_type_destroyed's no_destroy — never gets here). */
export function drifblim_destroyed(card) {
  if (!card || card.debuff || card.removed || !G.jokers || card.area !== G.jokers) return;
  if (!card.config || !card.config.center || card.config.center.key !== 'j_poke_drifblim') return;
  aftermath(card);
}
const drift_vars = (ex, evo) => [ex.stockpile, stock_max(ex), r3(ex.spit_Xmult), spit_x(ex), ex.spit_ups || 0, evo];

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
const first_deal = (card, context, field = 'forecast_round') => !!(context.hand_drawn && !context.blueprint && G.STATE === G.STATES.DRAW_TO_HAND && G.GAME.current_round
  && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && card.ability.extra[field] !== G.GAME.round);
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
// Lunatone / Solrock: the round's day-night cycle. A hand is DAY when the round has played an even number of hands before it
// (the 1st, 3rd, 5th...), NIGHT otherwise; during scoring hands_played is still the count before this hand (run.js adds 1 after).
const is_day = () => (((G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0) % 2) === 0;
/** For the tooltip: the NEXT hand — this round's next one, or (out of a round: the shop, the blind select) the next round's first, a day. */
const next_is_day = () => !(G.GAME && G.GAME.facing_blind) || is_day();
/** Cosmic Power: the partner is owned and not debuffed (find_card skips debuffed cards); a Blueprint copy isn't the partner. */
const cosmic = (card, partner) => !!(G.jokers && find_card(partner).length > 0);
/** The half-strength cross-coverage, derived so Energy keeps the ratio: half the Chips; X1 + (X - 1) / 2. */
const sun_half = (ex) => ex.chips / 2;
const moon_half = (ex) => 1 + (ex.Xmult - 1) / 2;
const commanded = (card) => G.jokers.cards.find((c) => c !== card && is_type(c, 'Water'));
const TATSU_FORMS = ['curly', 'droopy', 'stretchy'];

// The owner's Barboach line (Muddy Water / Earthquake): a joker counts when it is Water OR Earth by Pokermon's own is_type (its ptype,
// a Tera sticker, Castform's current form, an add-on's IS_TYPE_RULES), ONCE however many of the two it is, and only while it isn't
// debuffed (a debuffed joker does nothing this hand; NOTE Pelipper / Politoed / Corsola count through find_pokemon_type, which counts
// debuffed jokers too — this line deliberately doesn't). Itself always counts (+1), so the shop / collection card shows the number
// it would give once bought.
const muddy = (j) => !j.debuff && (is_type(j, 'Water') || is_type(j, 'Earth'));
const muddy_others = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && muddy(j)).length;
const muddy_count = (card) => muddy_others(card) + 1;
function muddy_main(card, context) {
  if (!context.joker_main) return undefined;
  const chips = r3(card.ability.extra.chips * muddy_count(card));
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}
/** Whiscash, Earthquake: on the round's first hand, with quake_req+ OTHER Water / Earth Jokers, every scored card retriggers. */
const quake_on = (card) => muddy_others(card) >= card.ability.extra.quake_req;
function quake_state(card) {
  const ex = card.ability.extra, n = muddy_others(card);
  if (n < ex.quake_req) return 'Inactive: ' + n + '/' + ex.quake_req + ' others';
  if (G.GAME && G.GAME.facing_blind && G.GAME.current_round && G.GAME.current_round.hands_played > 0) return 'Used this round';
  return 'Active!';
}
// The owner's Starly line (Flock / Brave Bird): a Colorless team count, Barboach's shape with one type — a joker counts when
// is_type(j, 'Colorless') (its ptype, a Tera sticker, Castform while Normal, an add-on's IS_TYPE_RULES) and isn't debuffed; itself
// always counts (+1). NOTE Miltank counts through find_pokemon_type (debuffed jokers too); this line deliberately doesn't.
const flock = (j) => !j.debuff && is_type(j, 'Colorless');
const flock_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && flock(j)).length + 1;
const flock_mult = (card) => r3(card.ability.extra.mult * flock_count(card));
const brave_x = (card) => r3(1 + card.ability.extra.Xmult_mod * flock_count(card));
function flock_main(card, context) {
  if (!context.joker_main) return undefined;
  const mult = flock_mult(card);
  return { message: a_mult(mult), colour: 'MULT', mult_mod: mult };
}
/** Staraptor's Recoil: each hand played costs `recoil` dollars, never past the run's debt limit (bankrupt_at: $0, Credit Card -$20). */
function recoil(card, context) {
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
const hive = (card) => ((G.jokers && G.jokers.cards && G.jokers.cards.includes(card)) ? poke_get_adjacent_jokers(card) : []);
function honey_gather(card, context) {
  if (!(context.end_of_round && context.main_eval) || context.blueprint) return;
  for (const j of hive(card)) {
    j.ability.extra_value = (j.ability.extra_value || 0) + card.ability.extra.honey;
    j.set_cost();
    card_eval_status_text(j, 'extra', null, null, null, { message: localize('k_val_up'), colour: 'MONEY' });
  }
}
/** Vespiquen's Attack Order: the neighbours' current sell value ($, card.sell_cost) and X(1 + Xmult_mod per $), capped at Xmult_cap. */
const hive_value = (card) => hive(card).reduce((s, j) => s + (j.sell_cost || 0), 0);
const attack_order_x = (card) => r3(Math.min(card.ability.extra.Xmult_cap, 1 + card.ability.extra.Xmult_mod * hive_value(card)));

// ------------------------------------------------------------ the Regi trio (Regirock / Regice / Registeel)
const REGIS = ['j_poke_regirock', 'j_poke_regice', 'j_poke_registeel'];
/** Undebuffed owned jokers of this key (the rule hooks below read them: a debuffed Regi does nothing). */
const regis_held = (key) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === key);
/** Regi Trio: how many OTHER Regi species you have (undebuffed). Distinct species: two Regices (Showman) are one "other Regi" for
 *  a Regirock, and a Regice never counts its own twin. */
export function regi_others(card) {
  const own = card.config.center.key, seen = new Set();
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const k = j.config.center.key;
    if (j !== card && !j.debuff && k !== own && REGIS.includes(k)) seen.add(k);
  }
  return seen.size;
}
/** Cards this Regi converts when a Blind is selected: its base (1; Regice's `glass_convert`, +1 per Energy, floored) + the others. */
/** (+1 with all three Regis and an awake Regigigas: giga_trio_bonus, the owner's Regigigas.) */
const regi_converts = (card) => Math.floor((card.ability.extra.glass_convert || 1) + 1e-9) + regi_others(card) + giga_trio_bonus(card);
const unbroken = (c) => !c.destroyed && !c.shattered && !c.removed;
/** When a Blind is selected: `n` random cards of the FULL deck (G.playing_cards, the run's seeded pseudorandom_element) become `enh`.
 *  Unenhanced cards first; once none is left, any card that isn't already `enh` (overwriting its enhancement; seal and edition kept).
 *  Never a card that already is `enh`. Blueprint copies it (as Marble Joker). */
function regi_convert(card, context, enh, seed, word) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const n = regi_converts(card);
  let done = 0;
  for (let i = 0; i < n; i++) {
    const live = (G.playing_cards || []).filter(unbroken);
    const plain = live.filter((c) => c.config.center.key === 'c_base');
    const pool = plain.length ? plain : live.filter((c) => c.config.center.key !== enh);
    if (!pool.length) break;
    const [pick] = pseudorandom_element(pool, pseudoseed(seed));
    pick.set_ability(P_CENTERS[enh], null, true);
    done++;
  }
  if (done) card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+' + done + ' ' + word, colour: 'CHIPS' });
}
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
export function regi_h_x_mult(v, card) {
  if (!v || card.debuff || !has_enhancement(card, 'm_steel') || !G.jokers) return undefined;
  const steels = regis_held('j_poke_registeel');
  if (!steels.length) return undefined;
  const base = card.ability.h_x_mult || 1.5;
  return v * Math.max(...steels.map((j) => j.ability.extra.Xmult_multi)) / base;
}
/** The Stone / Steel card's own tooltip (engine hook enh_loc_vars, describe.js enh_live_vars): the number the two hooks above will
 *  score, from those same functions — Stone +100 (+ its banked perma_bonus) with Regirock, held Steel X2 (energized X2.1 / X2.2 / X2.3)
 *  with Registeel. No undebuffed Regi: undefined (the card's own +50 / X1.5). */
export function regi_enh_vars(vars, card) {
  const ab = card.ability, f = ab.effect === 'Stone Card' ? regi_chip_bonus : ab.effect === 'Steel Card' ? regi_h_x_mult : null;
  const v = f ? f(vars[0], card) : undefined;
  return v === undefined ? undefined : [v, ...vars.slice(1)];
}
const regi_tips = (self, info_queue, card, enh) => { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS[enh]); };
/** Burmy's cloaks (the owner's design): the Pokermon type each one's card shows (Gen 4 sheet: Plant Grass, Sandy Earth, Trash Metal;
 *  pokermon_art_type reads all six Burmy / Wormadam cells so) and the colour of its pop-up. */
export const BURMY_CLOAKS = {
  plant: { ptype: 'Grass', name: 'Plant', colour: '#289830' },
  sandy: { ptype: 'Earth', name: 'Sandy', colour: '#e97333' },
  trash: { ptype: 'Metal', name: 'Trash', colour: '#888080' },
};
/** The cloak pile a card's enhancement (its center key) adds to: Stone Sandy, Steel Trash, unenhanced or any other enhancement Plant. */
const cloak_for = (k) => (k === 'm_stone' ? 'sandy' : k === 'm_steel' ? 'trash' : 'plant');
/** Cloak (the owner's ruling, contentRev 41): the full deck in three piles by each card's own enhancement (its center; quantum
 *  enhancements don't count): Sandy = Stone cards, Trash = Steel cards, Plant = every other card (unenhanced, Glass, Gold, Lucky,
 *  Bonus, Mult, Wild, Seed, Flower, Hazard, any mod's). The biggest pile is the cloak (22 Stone lose to 20 unenhanced + 10 Glass:
 *  Plant 30). A tie for the biggest keeps `current`; an empty deck keeps it too. */
export function cloak_of_deck(cards, current) {
  const n = { plant: 0, sandy: 0, trash: 0 };
  for (const c of cards || []) n[cloak_for((c.config && c.config.center && c.config.center.key) || 'c_base')]++;
  const top = Math.max(n.plant, n.sandy, n.trash);
  if (!top) return current;
  const best = Object.keys(n).filter((k) => n[k] === top);
  return best.length === 1 ? best[0] : current;
}
/** Burmy / Wormadam put a cloak on: its own Pokermon type (ability.extra.ptype) becomes the cloak's, as Castform's form does —
 *  unless a Tera sticker owns the type (the sticker still decides, as on any joker). The debuff and Kecleons are re-read. */
function set_cloak(card, cloak) {
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
/** Mothim's Free Flight counts these enhancements: the 8 vanilla ones and Pokermon's Seed and Flower (not Hazard: a cost, not
 *  an enhancement anyone builds toward; not the April Fools Ludicolo). */
export const MOTHIM_ENHANCEMENTS = ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky', 'm_poke_seed', 'm_poke_flower'];
/** The different enhancements (of MOTHIM_ENHANCEMENTS) the full deck holds, by each card's own enhancement. */
export const distinct_enhancements = (cards) => new Set((cards || []).map((c) => c.config && c.config.center && c.config.center.key).filter((k) => MOTHIM_ENHANCEMENTS.includes(k))).size;
const free_flight_x = (card) => r3(1 + card.ability.extra.Xmult_mod * distinct_enhancements(G.playing_cards));
// the gender signs (m6x11plus draws both since tools/micatro/add_gender_glyphs.py; before it, the text spelt Female / Male)
const gender_name = (g) => (g === 'male' ? '♂' : '♀');

// ------------------------------------------------------------ the weather trio (Kyogre / Groudon / Rayquaza) and the Eon duo (Latias / Latios)
/** Undebuffed owned jokers of this design (a debuffed one does nothing; a Blueprint copy has its own key, so it never counts). */
const legends = (name) => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && j.config.center.key === 'j_poke_' + name);
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
  const ky = legends('kyogre'), gr = legends('groudon'), ray = legends('rayquaza').length > 0;
  const { red, clubs } = clash_count(G.hand.cards);
  let winner = null, tie = false;
  if (ky.length && gr.length && !ray) {
    if (clubs !== red) winner = clubs > red ? 'kyogre' : 'groudon';
    else {
      tie = true;
      const ek = Math.max(...ky.map(get_total_energy)), eg = Math.max(...gr.map(get_total_energy));
      winner = eg > ek ? 'groudon' : 'kyogre';
    }
  }
  GM.poke_primal = { round: GM.round, kyogre: ky.length > 0, groudon: gr.length > 0, rayquaza: ray, winner, tie, red, clubs };
  if (winner) {
    for (const j of winner === 'kyogre' ? gr : ky) primal_take_back(j);
    const w = (winner === 'kyogre' ? ky : gr)[0];
    card_eval_status_text(w, 'extra', null, null, null, { message: winner === 'kyogre' ? 'Primordial Sea!' : 'Desolate Land!', colour: winner === 'kyogre' ? '#6169ff' : '#f48e62' });
  }
  return GM.poke_primal;
}
/** Is this Kyogre / Groudon working right now? Only the round's clash loser isn't (out of a round — the shop — every one is). */
export function primal_on(card) {
  const GM = G.GAME, P = GM && GM.poke_primal;
  if (!P || !P.winner || !GM.facing_blind || P.round !== GM.round) return true;
  return 'j_poke_' + P.winner === card.config.center.key;
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
/** Kyogre's +hands / Groudon's +d_size each round (the Squirtle / Charmander pairs), except while it is the round's clash loser:
 *  bought (or made) then, it gives nothing this round; sold then, it takes back only what is still given. */
const primal_bonus = (field) => {
  const give = (n) => (field === 'hands' ? ease_hands_played(n) : ease_discard(n));
  const reset = (n) => { if (field === 'hands') G.GAME.round_resets.hands += n; else G.GAME.round_resets.discards += n; };
  return {
    add_to_deck(self, card, from_debuff) {
      const ex = card.ability.extra, n = ex[field];
      reset(n);
      if (from_debuff) return;
      if (!primal_on(card)) { ex.primal_off = G.GAME.round; ex.primal_taken = n; return; }
      give(n);
    },
    remove_from_deck(self, card) {
      const ex = card.ability.extra, n = ex[field], cr = G.GAME.current_round;
      reset(-n);
      const still = ex.primal_off === G.GAME.round && G.GAME.facing_blind ? n - (ex.primal_taken || 0) : n;
      const dec = field === 'hands' ? Math.min(cr.hands_left - 1, still) : Math.min(cr.discards_left, still);
      if (dec > 0) give(-dec);
    },
  };
};
/** Castform's weather lock (its Forecast, first deal): Kyogre held -> Rainy, Groudon -> Sunny; both (the clash) -> the winner's.
 *  Rayquaza (Delta Stream, the weather calmed) -> no lock: Castform reads the normal forecast. null: no lock. */
export function castform_lock() {
  const P = primal_read();
  if (P.rayquaza) return null;
  if (P.winner) return P.winner === 'kyogre' ? 'rainy' : 'sunny';
  return P.kyogre ? 'rainy' : P.groudon ? 'sunny' : null;
}
/** The tooltip's clash line for Kyogre / Groudon. */
function clash_state(partner) {
  if (legends('rayquaza').length) return 'calmed by Rayquaza';
  if (!legends(partner).length) return 'no ' + partner[0].toUpperCase() + partner.slice(1);
  const GM = G.GAME, P = GM.poke_primal;
  if (!GM.facing_blind || !P || P.round !== GM.round || !P.winner) return 'read on the next first deal';
  return (P.winner === 'kyogre' ? 'Kyogre' : 'Groudon') + "'s round" + (P.tie ? ', a tie' : '') + ' (' + P.clubs + ' Clubs, ' + P.red + ' red)';
}
/** Rayquaza, Dragon Ascent: the played hand contains a Straight or a Flush (a Straight Flush is one hand: it grows once). */
const ascends = (context) => !!context.poker_hands && ((context.poker_hands.Straight || []).length > 0 || (context.poker_hands.Flush || []).length > 0);
/** Latias / Latios: the banked X (`eon_Xmult`, in no energy field: what is banked keeps its worth), each gain `Xmult_mod` (Energy +20%).
 *  Soul Dew: with the partner held (undebuffed; find_card), every Tarot OR Planet grows both. Not Blueprint (it copies the X only). */
const soul_dew = (partner) => !!(G.jokers && find_card('j_poke_' + partner).length > 0);
function eon(card, context, own, partner) {
  const ex = card.ability.extra;
  if (context.using_consumeable && !context.blueprint && context.consumeable) {
    const set = context.consumeable.ability.set;
    if (set === own || ((set === 'Tarot' || set === 'Planet') && soul_dew(partner))) {
      ex.eon_Xmult = r3(ex.eon_Xmult + ex.Xmult_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    }
    return undefined;
  }
  if (context.joker_main && ex.eon_Xmult > 1) return { message: a_xmult(r3(ex.eon_Xmult)), colour: 'XMULT', Xmult_mod: ex.eon_Xmult };
  return undefined;
}

// ------------------------------------------------------------ the owner's Cherubi line (Cherubi -> Cherrim): Seeds and the sun
/** Sweet Seeds: when a Blind is selected, ONE random unenhanced card of the full deck (G.playing_cards, the run's seeded
 *  pseudorandom_element) becomes a Seed card; none unenhanced, nothing (it never overwrites). Blueprint copies it (as Marble Joker). */
function sweet_seeds(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed('poke_cherubi_seeds'));
  pick.set_ability(P_CENTERS.m_poke_seed, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Seed', colour: 'GREEN' });
}
/** ... and +1 growth level while owned (Shiftry's `growth`: G.GAME.poke_growth_level, read by the Seed card itself), so a scored Seed
 *  grows 2 a score and blooms in 3 scores instead of 5. Off while debuffed (SMODS removes / re-adds a debuffed joker), carried across
 *  the evolution (set_ability removes Cherubi's, adds Cherrim's). Copies stack, like Shiftry + Brambleghast. */
const sweet_growth = {
  add_to_deck(self, card) { poke_change_growth_level(card.ability.extra.growth); },
  remove_from_deck(self, card) { poke_change_growth_level(-card.ability.extra.growth); },
};
/** Is it sunny for Cherrim? (a) the round's FIRST deal read red: Castform's own forecast() (Hearts + Diamonds vs Clubs vs Spades,
 *  a tie is not sunny), remembered for the round (`sun_round`); or (b) Desolate Land: an undebuffed Groudon is held and working (not
 *  the loser of a Primal Clash this round: primal_on). Rayquaza's Delta Stream keeps Groudon working, so Groudon still means sun
 *  (Rayquaza only un-locks CASTFORM's weather). (b) is live: a Groudon gained or sold mid-round changes it at once. Out of a round
 *  (the shop) only (b) counts. */
const desolate_sun = () => legends('groudon').some((j) => primal_on(j));
export function cherrim_sunny(card) {
  const ex = card.ability.extra, GM = G.GAME;
  return !!((GM && GM.facing_blind && ex.sun_round === GM.round) || desolate_sun());
}
const cherrim_form = (card) => (cherrim_sunny(card) ? 'sunshine' : 'overcast');
const seed_tips = (self, info_queue, card) => {
  type_tooltip(self, info_queue, card);
  info_queue.push(P_CENTERS.m_poke_seed);
  info_queue.push({ set: 'Other', key: 'growth_level' });
};
// ------------------------------------------------------------ Chatot (Vocabulary / New Word)
// The run's played-hand records: G.GAME.hands[h].played is the run's count for that poker hand (run.js evaluate_play adds 1 before
// the jokers' `before` pass; it never resets during a run), so it counts every hand type played this run, from before Chatot was
// bought too, secret hands (Five of a Kind, Flush House, Flush Five) and add-on hands included. The hand being played counts at once.
const vocabulary = () => Object.values((G.GAME && G.GAME.hands) || {}).filter((h) => h && h.played > 0).length;
const vocab_mult = (card) => r3(card.ability.extra.mult * vocabulary());
/** New Word: in `before`, a hand whose run count just became 1 (its first play this run) creates its Planet, with consumable room
 *  (the Blue Seal's buffer check). `new_words` (on the joker) names the hand types this Chatot already granted, so it never grants
 *  twice for one type (a joker retrigger re-running `before`, a mod resetting a count); a hand first played while no Chatot was held
 *  is never granted later (its count is past 1). Not Blueprint (Blueprint copies the Mult). A debuffed hand (The Psychic...) has no
 *  `before` pass, so its first play grants nothing. */
function new_word(card, context) {
  if (!(context.before && context.cardarea === G.jokers) || context.blueprint) return;
  const name = context.scoring_name, h = name && G.GAME.hands[name];
  const ex = card.ability.extra;
  ex.new_words = ex.new_words || {};
  if (!h || h.played !== 1 || ex.new_words[name]) return;
  const planet = (P_CENTER_POOLS.Planet || []).find((p) => p.config && p.config.hand_type === name);
  if (!planet || G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit) return;
  ex.new_words[name] = true;
  G.GAME.consumeable_buffer += 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card('Planet', G.consumeables, null, null, null, null, planet.key, 'chatot');
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_planet'), colour: 'Planet' });
}

// ------------------------------------------------------------ Pachirisu (Quick Spark / Nuzzle / Cheek Pouch)
// A Lightning Joker: Pokermon's is_type (its ptype, a Tera sticker, an add-on's IS_TYPE_RULES), not debuffed (the Barboach / Starly
// count with one type).
const sparky = (j) => !j.debuff && is_type(j, 'Lightning');
const spark_others = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && sparky(j)).length;
const spark_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * spark_others(card));
const pouch_money = (card) => card.ability.extra.pouch * (spark_others(card) + 1);
/** Quick Spark: on the round's first hand (current_round.hands_played is 0 while it scores). The tooltip names its state. */
const spark_on = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played === 0);
const spark_state = () => (G.GAME && G.GAME.facing_blind && !spark_on() ? 'Used this round' : 'Active!');
// The owner's Shellos line (Tide Pool / Tide / Storm Drain / Two Seas): each card's sea (ability.extra.form, 'west' or 'east') is rolled
// ONCE when the card is created (set_ability initial, the run's seeded RNG), so a save / resume — which rebuilds the run from its
// recipe — gives it back the same sea; `form` is one of the values every evolution keeps (systems/evolution.js NAMES_TO_KEEP).
export const SEAS = { west: { name: 'West Sea', end: 'leftmost' }, east: { name: 'East Sea', end: 'rightmost' } };
const SEA_LINE = ['j_poke_shellos', 'j_poke_gastrodon'];
const sea_of = (card) => (SEAS[card.ability.extra.form] ? card.ability.extra.form : 'east');
/** The seas held: every undebuffed Shellos / Gastrodon in the joker row (a Blueprint copying one is not one). */
const seas_held = () => new Set(((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && SEA_LINE.includes(j.config.center.key)).map(sea_of));
/** Two Seas: a West AND an East Shellos / Gastrodon held (any mix, undebuffed). */
export const two_seas = () => { const s = seas_held(); return s.has('west') && s.has('east'); };
/** The seas this card works on: its own, or both under Two Seas. */
const seas_for = (card) => (two_seas() ? ['west', 'east'] : [sea_of(card)]);
/** The scored card this sea names: the leftmost (West) or the rightmost (East) of the scoring hand, by position (a debuffed one there
 *  scores nothing: the end never shifts inward). A 1-card hand's card is both ends, and still counts once. */
const sea_end = (context, sea) => { const s = context.scoring_hand || []; return s.length ? (sea === 'west' ? s[0] : s[s.length - 1]) : undefined; };
const at_sea_end = (card, context, c) => seas_for(card).some((sea) => sea_end(context, sea) === c);
const sea_ends_text = (card) => (two_seas_text(card) === 'active' ? 'leftmost and rightmost scored cards' : SEAS[sea_of(card)].end + ' scored card');
const two_seas_text = (card) => {
  const s = seas_held(); // (+ its own sea: a shop card says what it would be once bought)
  s.add(sea_of(card));
  if (s.has('west') && s.has('east')) return 'active';
  return s.has('west') ? 'needs an East Sea' : 'needs a West Sea';
};
/** Tide Pool / Tide: the sea's end card gives +chips each time it scores (Gastrodon's retrigger scores it again, so again). */
function tide_chips(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && at_sea_end(card, context, context.other_card)) return { chips: card.ability.extra.chips, card };
  return undefined;
}
/** Storm Drain: each Energy card used (the Energy set — the 12 type Energies and Bird Energy, the cards Porygon-Z counts — on any
 *  joker, or none) banks Xmult_mod, twice that for Water Energy (one energy field scales both, the ratio holds). Not Blueprint. */
const storm_gain = (ex, consumeable) => (consumeable.config.center.key === 'c_poke_water_energy' ? 2 : 1) * ex.Xmult_mod;


// ---------------------------------------------------------------- the owner's Glameow line: Fickle + Thick Fat
// Fickle: a favourite suit per joker, held on the ABILITY (card.ability.fav_suit, not in extra), so it survives the evolution's
// set_ability (Steamodded keeps the ability fields the new center doesn't set) with no keep-list. It is picked when the joker is first
// obtained (add_to_deck, when none is set yet: an evolving card keeps its own) and again at each end of round, Ancient Joker's pick
// (core.js reset_ancient_card): the run's seeded pseudorandom_element over the four suits minus the current favourite, seeded by the
// ante ('fickle' + ante). Never on creation (a shop / collection card would draw from the run's seed outside the recipe), so the shop
// card reads "(Favourite: picked when obtained)". Wild cards and Smeared Joker count through is_suit.
const FICKLE_SUITS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
function fickle_pick(card) {
  const suits = FICKLE_SUITS.filter((s) => s !== card.ability.fav_suit);
  card.ability.fav_suit = pseudorandom_element(suits, pseudoseed('fickle' + G.GAME.round_resets.ante))[0];
  return card.ability.fav_suit;
}
const fav_scored = (card, context) => !!(card.ability.fav_suit && context.individual && context.cardarea === G.play && !context.end_of_round
  && context.other_card.is_suit(card.ability.fav_suit));
const fav_vars = (card) => (card.ability.fav_suit ? localize(card.ability.fav_suit, 'suits_plural') : 'picked when obtained');
const fav_colour = (card) => [card.ability.fav_suit || 'inactive'];
function fickle(card, context) {
  if (round_end(context) && !context.blueprint) {
    const s = fickle_pick(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize(s, 'suits_plural') + '!', colour: 'FILTER' });
  }
}
// Thick Fat: -1 Joker slot while held (G.jokers.config.card_limit, as Banette's +1), paid in add_to_deck and refunded in
// remove_from_deck (sold, destroyed, or turned into another joker). Kept while DEBUFFED, as vanilla keeps a Negative's slot
// (queue_negative_removal): a debuff gives no slot back, so lifting it can never put the jokers over the limit; a debuffed Purugly
// that is sold / destroyed is refunded by the card_removed hook (index.js -> slot_cost_removed). A Negative Purugly nets 0 (its +1).
export function slot_cost_add(card, from_debuff) {
  if (!from_debuff) G.jokers.config.card_limit -= card.ability.extra.slot_cost;
  card.ability.poke_slot_queued = undefined;
}
export function slot_cost_remove(card, from_debuff) {
  if (from_debuff) { card.ability.poke_slot_queued = card.ability.extra.slot_cost; return; }
  G.jokers.config.card_limit += card.ability.extra.slot_cost;
}
/** index.js card_removed: a DEBUFFED Purugly leaving (its remove_from_deck already ran on the debuff) gives its slot back. */
export function slot_cost_removed(card) {
  if (card.ability && card.ability.poke_slot_queued && !card.added_to_deck && G.jokers) {
    G.jokers.config.card_limit += card.ability.poke_slot_queued;
    card.ability.poke_slot_queued = undefined;
  }
}
// The evolution waits for room: Purugly's -1 slot must not put the jokers over the limit (owner: never push a joker out). Room =
// a free slot now (cards + pending creations < limit), so after the -1 every joker still fits. A Glameow whose countdown ends without
// room stays at 0 rounds and evolves at the first end of round with a free slot. Committing reserves the slot in G.GAME.joker_buffer
// (as Riff-raff does) until the queued evolution has landed, so two Glameows ready in one round never both take the last slot.
const slot_room = () => G.jokers.cards.length + (G.GAME.joker_buffer || 0) < G.jokers.config.card_limit;
function glameow_evo(self, card, context) {
  const ex = card.ability.extra;
  if (!can_evolve(self, card, context, 'j_poke_purugly') || card.debuff || ex.rounds === undefined || ex.rounds > 1) return level_evo(self, card, context, 'j_poke_purugly');
  if (!slot_room()) {
    ex.rounds = 0;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Needs a slot!', colour: 'FILTER' });
    return undefined;
  }
  G.GAME.joker_buffer = (G.GAME.joker_buffer || 0) + 1;
  const r = level_evo(self, card, context, 'j_poke_purugly');
  G.E_MANAGER.add_event(() => { G.GAME.joker_buffer = Math.max(0, (G.GAME.joker_buffer || 0) - 1); });
  return r;
}

// ---------------------------------------------------------------- Poison Gas (the owner's Stunky line): poisoning the Blind
// One record per Blind, shared by every copy (G.GAME.poke_poison, keyed by G.GAME.round, so a new Blind starts clean): `base` the
// starting requirement, `cut` the chips taken off so far. It is captured on the round's first deal (after every setting_blind effect:
// The Wall's x4 / Violet Vessel's x6 base, a Chicot-disabled Wall's half), or lazily by the first drop (a Stunky that arrived mid-round).
// The state lives in G.GAME and the run is rebuilt from its recipe on resume / replay, so the lowered requirement comes back exactly.
export const POISON_CAP = 75; // % of the starting requirement: the most all copies together can take off one Blind
export function poison_state(create) {
  const s = G.GAME && G.GAME.poke_poison;
  if (s && s.round === G.GAME.round) return s;
  if (!create) return null;
  return (G.GAME.poke_poison = { round: G.GAME.round, base: G.GAME.blind.chips, cut: 0 });
}
/** The share (%) of this Blind's starting requirement taken off so far (0 outside a Blind). */
export function poison_taken() {
  const s = G.GAME && G.GAME.facing_blind ? poison_state(false) : null;
  return s && BN.gt(s.base, 0) ? r3(BN.toNumber(BN.div(BN.mul(s.cut, 100), s.base))) : 0;
}
/** The drop after the nth hand: Stunky n = 1 (a flat step), Skuntank n = the round's hand number (escalating). */
const poison_step = (card, n) => r3(card.ability.extra.poison_pct * n);
const poison_capture = (context) => { if (context.first_hand_drawn && !context.blueprint && G.GAME.facing_blind) poison_state(true); };
// After each hand (context.after, which Blueprint copies): queued, so it runs once this hand's chips have been added and the round's hand
// count has gone up, and before the engine's post-hand check (STATES.HAND_PLAYED). It first does that check itself: a hand that already
// beat the Blind, or the round's final hand (no later hand to help), gets nothing, so the drop never wins the hand that scored. Otherwise
// the requirement drops (capped at POISON_CAP% of the base in all, never below 1 chip), and if it is now at or below the chips already
// scored, the engine's check right after ends the Blind as won (the same check that ends a Blind Chicot / Luchador disables).
function poison_gas(card, context, escalating) {
  poison_capture(context);
  if (!context.after || context.cardarea !== G.jokers || context.retrigger_joker) return undefined;
  const by = context.blueprint_card || card;
  G.E_MANAGER.add_event(() => {
    const cr = G.GAME.current_round, b = G.GAME.blind;
    if (!G.GAME.facing_blind || !b || BN.beats(G.GAME.chips, b.chips) || cr.hands_left < 1) return;
    const s = poison_state(true);
    const pct = poison_step(card, escalating ? cr.hands_played : 1);
    const room = BN.sub(BN.floor(BN.div(BN.mul(s.base, POISON_CAP), 100)), s.cut);
    const drop = BN.min(BN.min(BN.floor(BN.div(BN.mul(s.base, pct), 100)), room), BN.sub(b.chips, 1));
    if (!BN.gt(drop, 0)) return;
    b.chips = BN.sub(b.chips, drop);
    b.chip_text = number_format(b.chips);
    s.cut = BN.add(s.cut, drop);
    emit('blind', { action: 'chips', key: b.config && b.config.blind && b.config.blind.key, chips: BN.toJSONValue(b.chips), chip_text: b.chip_text });
    card_eval_status_text(by, 'extra', null, null, null, { message: '-' + pct + '%', colour: 'PURPLE' });
  });
  return undefined;
}

// ---------------------------------------------------------------- Bite / Treasure Nest / Dragon Rush (the owner's Gible line)
// Bite -> hoard -> cash in. The bank is `bite_mult` (in no energy_values: a banked Mult keeps what it was worth when earned, so Energy is
// never retroactive; carried through both evolutions by poke_custom_values_to_keep); the gain per scored card is `mult_mod` (+20% of
// base per Energy: 1 -> 1.2 / 1.4 / 1.6). A hand "contains a Pair" when the engine's poker_hands['Pair'] is non-empty (Lua next()): Pair,
// Two Pair, Three of a Kind, Full House, Four of a Kind and the secret hands built on them. "Scored cards" are the scoring hand's cards
// that aren't debuffed (a debuffed card doesn't score). Not Blueprint (it scales); Blueprint copies the banked Mult.
const hand_has = (context, name) => !!(context.poker_hands && context.poker_hands[name] && context.poker_hands[name].length);
function bite(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker && hand_has(context, 'Pair')) {
    const n = (context.scoring_hand || []).filter((c) => !c.debuff).length;
    if (n > 0) {
      let gained = 0;
      scale_card(card, {
        ref_value: 'bite_mult', scalar_value: 'mult_mod', scalar_factor: n, no_message: true,
        operation: (t, k, v, change) => { t[k] = r3(v + change); gained = change; },
      });
      return { message: a_mult(r3(gained)), colour: 'MULT', card };
    }
  }
  if (context.joker_main && ex.bite_mult > 0) return { message: a_mult(r3(ex.bite_mult)), colour: 'MULT', mult_mod: ex.bite_mult };
  return undefined;
}
/** Gold cards in the FULL deck (G.playing_cards; any Gold card, not only the ones Gabite made; has_enhancement, so a quantum Gold counts). */
export const gold_in_deck = () => (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_gold')).length;
/** Gold cards held in hand that aren't debuffed (a debuffed Gold card counts for nothing). */
export const gold_held = () => ((G.hand && G.hand.cards) || []).filter((c) => has_enhancement(c, 'm_gold') && !c.debuff).length;
/** Gabite, Treasure Nest: when a hand containing a Full House scores (poker_hands['Full House']: a Flush House too), ONE of its scored
 *  cards becomes a Gold card, in context.after (once the hand has scored, so the card scored as what it was; Midas Mask's set_ability
 *  call). The pick: the run's seeded pseudorandom_element ('gabite_nest') over the scored cards that aren't debuffed, already Gold, or
 *  being destroyed (a shattered Glass card); UNENHANCED ones first, and only when none is left any other non-Gold one (it overwrites that
 *  enhancement, keeping seal and edition, as the Regis' conversion does). None eligible: nothing. One card a hand, fixed (no Energy).
 *  Not Blueprint (Blueprint copies the bank only). */
function treasure_nest(card, context) {
  if (!context.after || context.cardarea !== G.jokers || context.blueprint || context.retrigger_joker || !hand_has(context, 'Full House')) return undefined;
  const pool = (context.scoring_hand || []).filter((c) => !c.debuff && !c.shattered && !c.destroyed && !has_enhancement(c, 'm_gold'));
  if (!pool.length) return undefined;
  const plain = pool.filter((c) => c.config.center === P_CENTERS.c_base);
  const [pick] = pseudorandom_element(plain.length ? plain : pool, pseudoseed('gabite_nest'));
  if (!pick) return undefined;
  pick.set_ability(P_CENTERS.m_gold, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_gold'), colour: 'MONEY' });
  return undefined;
}
/** Garchomp, Dragon Rush: X(1 + Xmult_mod per undebuffed Gold card held in hand). */
const dragon_rush_x = (card) => r3(1 + card.ability.extra.Xmult_mod * gold_held());

// ------------------------------------------------------------ the last Gen 4 regulars (contentRev 44)
/** Hippopotas / Hippowdon, Sand Stream: a scored Stone card gives +chips EXTRA (a joker effect on top of the Stone card's own +50, or
 *  Regirock's +100 instead: the two stack). Any card that counts as Stone (has_enhancement: quantum too); debuffed cards never score.
 *  Blueprint copies it; a Red Seal / Mime retrigger repeats it. */
function sand_stream(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_stone')) {
    return { chips: card.ability.extra.chips, card };
  }
  return undefined;
}
/** Hippowdon, Sand Stream: on the round's FIRST deal (Castform's moment, first_deal: every card is in hand), 1 random UNENHANCED card
 *  held in hand becomes a Stone card (Midas Mask's set_ability; seal and edition kept). The run's seeded pseudorandom_element
 *  ('hippowdon_sand'); none unenhanced: nothing (it never overwrites another enhancement). Once a round (sand_round), fixed (no Energy
 *  field), not Blueprint. */
function sand_stone(card, context) {
  if (!first_deal(card, context, 'sand_round')) return;
  card.ability.extra.sand_round = G.GAME.round;
  const pool = G.hand.cards.filter((c) => c.config.center === P_CENTERS.c_base && !c.destroyed && !c.shattered && !c.removed);
  if (!pool.length) return;
  const [pick] = pseudorandom_element(pool, pseudoseed('hippowdon_sand'));
  pick.set_ability(P_CENTERS.m_stone, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Sand Stream!', colour: '#e1c019' });
}
/** Skorupi / Drapion, Sniper: each scored card rolls num in dem (Pokermon's probability helpers: Oops! / Venonat raise it, Absol fixes it
 *  at 0) to CRIT for X Xmult_multi; Drapion's Lucky cards (always_crit: any card counting as Lucky) crit with no roll, so Absol never
 *  stops them. Each retrigger rolls again. Blueprint copies it (its own roll). */
function sniper(card, context, seed) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round)) return undefined;
  const ex = card.ability.extra;
  const crit = (ex.always_crit && has_enhancement(context.other_card, 'm_lucky')) || pseudorandom_probability(card, seed, ex.num, ex.dem, seed);
  return crit ? { x_mult: ex.Xmult_multi, card } : undefined;
}
const sniper_vars = (card, seed) => { const ex = card.ability.extra; const [num, dem] = get_probability_vars(card, ex.num, ex.dem, seed); return [num, dem, r3(ex.Xmult_multi)]; };
/** Carnivine, Flytrap: the round's FIRST player discard (pre_discard, not an effect's `hook` discard, discards_used 0; once a round:
 *  devour_round) marks its leftmost card (the discard's own order: hand position); in that card's discard pass the joker returns
 *  { remove: true }, so the engine destroys it like Trading Card / Entei / Magmar do — dissolved (a Glass card shatters), and every
 *  joker's remove_playing_cards runs (Hydreigon, Cacnea, Kingambit, Spiritomb... count it as a destroyed card). Each devour banks +mult_mod
 *  Mult (`devour_mult`, no energy field: never retroactive). Not Blueprint, once even under a joker retrigger (the mark is cleared). */
function flytrap(card, context) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && context.full_hand && context.full_hand.length
    && G.GAME.current_round.discards_used === 0 && ex.devour_round !== G.GAME.round) {
    ex.devour_round = G.GAME.round;
    context.full_hand[0].poke_devoured_by = card;
    return undefined;
  }
  if (context.discard && !context.blueprint && context.other_card && context.other_card.poke_devoured_by === card) {
    context.other_card.poke_devoured_by = undefined;
    ex.devour_mult = r3(ex.devour_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Devoured!', colour: 'MULT' });
    return { remove: true };
  }
  return undefined;
}
const flytrap_state = (card) => (G.GAME && G.GAME.facing_blind && (G.GAME.current_round.discards_used > 0 || card.ability.extra.devour_round === G.GAME.round) ? 'fed this round' : 'hungry');
/** Lumineon, Luminous: night hands (Lunatone / Solrock's cycle, is_day above); with Lunatone (owned, undebuffed: cosmic) day hands too. */
const luminous = (card) => !is_day() || cosmic(card, 'j_poke_lunatone');
// ---------------------------------------------------------------- the creation trio, Regigigas and Arceus (the owner's Gen 4 Legendaries)
/** Dialga, Roar of Time: the round's first hand (hands_played === 0 while it scores; a discard before it doesn't use it up). */
const roar_on = () => !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played === 0);
/** Giratina's Origin Forme: an undebuffed Dialga or Palkia is held (find_card skips debuffed cards; a Blueprint is neither). */
const origin_forme = () => !!(G.jokers && (find_card('j_poke_dialga').length > 0 || find_card('j_poke_palkia').length > 0));
/** Shadow Force's gain per destroyed playing card: Xmult_mod, doubled in the Origin Forme (one energy field scales both). */
const shadow_gain = (card) => r3(card.ability.extra.Xmult_mod * (origin_forme() ? 2 : 1));
/** Palkia, Spacial Rend: +slots Joker slots and +h_size hand size while held AND undebuffed. Both are given in add_to_deck and taken
 *  in remove_from_deck, from_debuff included (Juggler's hand size; unlike a Negative's slot, which vanilla keeps through a debuff):
 *  a debuff takes both away and lifting it gives both back. Nobody is ever pushed out: a debuff on a full row leaves the row one
 *  over the limit until a Joker leaves (the shop and every effect that makes a Joker need a free slot, so none can join meanwhile).
 *  Sold or destroyed it takes its own slot with it, so the row is never over the limit; a debuffed Palkia leaving gives nothing
 *  back twice (remove_from_deck already ran on the debuff). A Negative Palkia gives +2 (its edition's +1 and Spacial Rend's). */
const spacial_rend = {
  add_to_deck(self, card) { const ex = card.ability.extra; G.jokers.config.card_limit += ex.slots; G.hand.change_size(ex.h_size); },
  remove_from_deck(self, card) { const ex = card.ability.extra; G.jokers.config.card_limit -= ex.slots; G.hand.change_size(-ex.h_size); },
};
/** Regigigas, Slow Start: the distinct Regi species held (undebuffed; two Regices count once) — each cuts a round off the wait,
 *  and all three wake it at the next end of round (giga_drop). */
const regis_distinct = () => new Set(((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && REGIS.includes(j.config.center.key)).map((j) => j.config.center.key)).size;
const giga_awake = (card) => !((card.ability.extra.slow_start || 0) > 0);
/** One end of round's cut to the Slow Start countdown `left` with `n` distinct Regis held: 1 + n, or all of it with the full trio. */
const giga_drop = (left, n) => (n >= 3 ? left : 1 + n);
/** Regi Trio + Regigigas: with all three Regis held and an awake Regigigas (undebuffed), each Regi converts 1 more card per Blind
 *  (once, however many Regigigas). */
function giga_trio_bonus(regi) {
  if (regi_others(regi) < 2) return 0;
  return ((G.jokers && G.jokers.cards) || []).some((j) => !j.debuff && j.config.center.key === 'j_poke_regigigas' && giga_awake(j)) ? 1 : 0;
}
/** Arceus, Multitype: the different types among your Jokers. Each other undebuffed joker gives its shown type (get_type: a Tera
 *  sticker, else its ptype; one of the 12); a joker that counts as every type (another Arceus, a Stellar Tera) adds one type of
 *  its own (a missing one), never all twelve; Arceus itself counts as one. At most 12. */
function multitype_count(card) {
  const seen = new Set();
  let wild = 0;
  for (const j of (G.jokers && G.jokers.cards) || []) {
    if (j === card || j.debuff) continue;
    if (multitype(j) || wildcard_type(j)) { wild++; continue; }
    const t = get_type(j);
    if (POKETYPES.includes(t)) seen.add(t);
  }
  return Math.min(POKETYPES.length, seen.size + wild + 1);
}
const multitype_x = (card) => r3(1 + card.ability.extra.Xmult_mod * multitype_count(card));

// ---------------------------------------------------------------- the Lake trio (Uxie / Mesprit / Azelf), Cresselia, Manaphy / Phione
const LAKE = ['j_poke_uxie', 'j_poke_mesprit', 'j_poke_azelf'];
/** Lake Guardians: how many OTHER Lake guardian species you have (undebuffed) — the Regi Trio's count (regi_others): distinct species, so
 *  a twin of the same guardian (Showman) is never an "other guardian", and two Mesprits count once for an Uxie. 0, 1 or 2. */
export function lake_others(card) {
  const own = card.config.center.key, seen = new Set();
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const k = j.config.center.key;
    if (j !== card && !j.debuff && k !== own && LAKE.includes(k)) seen.add(k);
  }
  return seen.size;
}
/** A guardian's X: its own field (an energy field) + `lake_mod` (0.25, in no energy field) for each other guardian. */
const lake_x = (card, field) => r3(card.ability.extra[field] + card.ability.extra.lake_mod * lake_others(card));
/** Mesprit, Emotion: the hand's poker hand had not been played yet this round. run.js evaluate_play has already counted THIS play
 *  (played_this_round is 1 on its first play of the round) before the jokers score, as Abra's "already played" (> 1) reads it. */
const first_this_round = (context) => { const h = context.scoring_name && G.GAME.hands[context.scoring_name]; return !!h && (h.played_this_round || 0) <= 1; };
/** Cresselia, Lunar Blessing (systems/rules.js set_debuff: playing cards get 'prevent_debuff' while an undebuffed Cresselia is owned).
 *  Gaining or losing it re-runs the Blind's debuff pass over every playing card (Blind:disable's own pass), queued so it runs once the
 *  card has landed / left / been debuffed: a Cresselia gained mid-Blind lifts the Boss's debuffs at once, and one sold, destroyed or
 *  debuffed mid-Blind gives them back. Outside a Blind nothing is debuffed anyway. */
function lunar_refresh() {
  G.E_MANAGER.add_event(() => {
    if (G.GAME && G.GAME.facing_blind && G.GAME.blind && G.playing_cards) for (const c of G.playing_cards) G.GAME.blind.debuff_card(c);
  });
}
/** Manaphy / Phione: a Water Joker for "each Water Joker gives": is_type (a Tera sticker counts — it replaces the type), undebuffed. */
const sea_joker = (j) => !!(j && j.ability && j.ability.set === 'Joker' && !j.debuff && is_type(j, 'Water'));
/** Water Jokers for the tooltip, itself included (+1 while it is Water: a Tera of another type takes it out), so a shop card shows what it
 *  would give once bought. */
const sea_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && sea_joker(j)).length + (is_type(card, 'Water') ? 1 : 0);
/** Manaphy, Egg: at the end of each shop (not Blueprint), with a free Joker slot NOW (cards + pending creations < limit, Glameow's
 *  slot_room; no slot, no roll), a 1 in 4 chance (Pokermon's pseudorandom_probability: the run's seeded stream, seed 'manaphy_egg', so
 *  Oops! All 6s raises it and Absol fixes it) to create a Phione, appended at the right end of the row. Created at once (add_card), so a
 *  second Manaphy sees the slot taken. */
function manaphy_egg(card, context) {
  if (!context.ending_shop || context.blueprint || !slot_room()) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'manaphy_egg', ex.num, ex.dem, 'manaphy_egg')) return;
  const egg = add_card({ set: 'Joker', key: 'j_poke_phione', key_append: 'manaphy' });
  card_eval_status_text(egg, 'extra', null, null, null, { message: 'Hatched!', colour: 'BLUE' });
  card.juice_up();
}

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

  // ---------------------------------------------------------------- Gen 8 starters (contentRev 48; the starters spec, 2026-10-28)
  // Pokermon's starter conventions: the type perk at every stage (Fire +1 discard: the `discards` pair; Water +1 hand: the `hands`
  // pair), Basic Uncommon $5 with the 'starter' attribute (the Starter Pack), Stage 1 Safari $8, Stage 2 Safari $10; evolution by
  // rounds, 5 then 5 (the Johto starters' timers: Cyndaquil / Quilava, Totodile / Croconaw). Energy: the line's main number only
  // (Scorbunny / Raboot `mult` +40%, Cinderace `Xmult_mod` +20%, Sobble / Drizzile `chips` +30%, Inteleon `Xmult_multi` +5%: a per-card
  // X); d_size, hands and rounds are fixed. Art: upstream 3.9.1's own (Natdex 4-14, 54), nothing to deploy. Neither Nacho nor
  // Pokermon+ has either line. After Rillaboom in Pokédex order (813-818, then Nickit 827).
  // Scorbunny 813 (Fire): +1 discard; +3 Mult for each discard left. Evolves after 5 rounds.
  scorbunny: {
    name: 'scorbunny', poke_sprite391: sprite('Natdex', 4, 54),
    config: { extra: { d_size: 1, mult: 3, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 8, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'round_evo'], poke_after: 'rillaboom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), r3(ex.mult * Math.max(0, G.GAME.current_round.discards_left || 0)), ex.rounds] }; },
    calculate(self, card, context) { return libero_mult(card, context) || level_evo(self, card, context, 'j_poke_raboot'); },
    ...discards,
  },
  // Raboot 814 (Fire): +1 discard; +5 Mult for each discard left. Evolves after 5 rounds.
  raboot: {
    name: 'raboot', poke_sprite391: sprite('Natdex', 6, 54),
    config: { extra: { d_size: 1, mult: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'round_evo'], poke_after: 'scorbunny',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), r3(ex.mult * Math.max(0, G.GAME.current_round.discards_left || 0)), ex.rounds] }; },
    calculate(self, card, context) { return libero_mult(card, context) || level_evo(self, card, context, 'j_poke_cinderace'); },
    ...discards,
  },
  // Cinderace 815 (Fire): +1 discard; Libero, X(1 + 0.5 for each discard left).
  cinderace: {
    name: 'cinderace', poke_sprite391: sprite('Natdex', 8, 54),
    config: { extra: { d_size: 1, Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'xmult'], poke_after: 'raboot',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_mod), r3(libero_x(card))] }; },
    calculate(self, card, context) {
      if (context.joker_main && G.GAME.current_round.discards_left > 0) { const x = libero_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...discards,
  },
  // Sobble 816 (Water): +1 hand; each played card that doesn't score gives +20 Chips. Evolves after 5 rounds.
  sobble: {
    name: 'sobble', poke_sprite391: sprite('Natdex', 10, 54),
    config: { extra: { hands: 1, chips: 20, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'round_evo'], poke_after: 'cinderace',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return unscored_chips(card, context) || level_evo(self, card, context, 'j_poke_drizzile'); },
    ...hands,
  },
  // Drizzile 817 (Water): +1 hand; each played card that doesn't score gives +35 Chips. Evolves after 5 rounds.
  drizzile: {
    name: 'drizzile', poke_sprite391: sprite('Natdex', 12, 54),
    config: { extra: { hands: 1, chips: 35, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'round_evo'], poke_after: 'sobble',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return unscored_chips(card, context) || level_evo(self, card, context, 'j_poke_inteleon'); },
    ...hands,
  },
  // Inteleon 818 (Water): +1 hand; Snipe Shot, the highest-ranked scored card gives X2 Mult (a tie: the leftmost; snipe_target).
  inteleon: {
    name: 'inteleon', poke_sprite391: sprite('Natdex', 14, 54),
    config: { extra: { hands: 1, Xmult_multi: 2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hands', 'xmult', 'rank'], poke_after: 'drizzile',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card === snipe_target(context.scoring_hand)) {
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
    ...hands,
  },

  // ---------------------------------------------------------------- LINE E: Kubfu -> Urshifu (Legendary, Gen 8: Kubfu Fighting, Urshifu Dark / Water)
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
  // Dark (contentRev 30): the type its upstream card draws (owner rule: the card's type wins; tools/micatro/pokermon_art_type.mjs).
  urshifu_single: {
    name: 'urshifu_single', poke_sprite391: sprite('Gen08', 2, 10, [3, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dark', gen: 8, blueprint_compat: true, custom_pool_func: true,
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
  // retriggered. Only through Kubfu. Water (contentRev 30): the type its upstream card draws (owner rule: the card's type wins).
  urshifu_rapid: {
    name: 'urshifu_rapid', poke_sprite391: sprite('Gen08', 4, 10, [5, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1, retriggers: 1, strikes: 3 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 8, blueprint_compat: true, custom_pool_func: true,
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

  // ---------------------------------------------------------------- the pair: Lunatone + Solrock (Earth, Gen 3; like Plusle / Minun)
  // The owner's design (2026-10-28). Day and night: within each round the 1st, 3rd and 5th hands are DAY, the 2nd and 4th NIGHT
  // (G.GAME.current_round.hands_played before the hand: even = day). Solrock, Sunlight: +100 Chips on day hands (`chips`). Lunatone,
  // Moonlight: X2 Mult on night hands (`Xmult`). Cosmic Power: with the other one owned (not debuffed; find_card), each also covers
  // the other half of the cycle at half strength — Solrock +chips/2 on night hands, Lunatone X(1 + (Xmult - 1) / 2) on day hands — so
  // every hand gets both. Each copy acts on its own. Energy: chips +30% / Xmult +20% of base; the half values are DERIVED from them,
  // so they stay exactly half (one Energy: +130 / +65 Chips, X2.4 / X1.7). Uncommon $6: single-stage, priced below the usual Rare $7
  // because each alone works half the time. Not Blueprint-restricted. Art: upstream 3.9.1's own cells (Natdex 12 / 14, 22).
  lunatone: {
    name: 'lunatone', poke_sprite391: sprite('Natdex', 12, 22),
    config: { extra: { Xmult: 2 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'hands', 'pair'], poke_after: 'seviper',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(moon_half(ex)), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_solrock') ? 'active' : 'needs Solrock'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      const x = !is_day() ? ex.Xmult : cosmic(card, 'j_poke_solrock') ? moon_half(ex) : 1;
      if (x === 1) return undefined;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  solrock: {
    name: 'solrock', poke_sprite391: sprite('Natdex', 14, 22),
    config: { extra: { chips: 100 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hands', 'pair'], poke_after: 'lunatone',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), r3(sun_half(ex)), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_lunatone') ? 'active' : 'needs Lunatone'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      const c = is_day() ? ex.chips : cosmic(card, 'j_poke_lunatone') ? sun_half(ex) : 0;
      if (!c) return undefined;
      return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c };
    },
  },

  // ---------------------------------------------------------------- LINE F7: Barboach -> Whiscash (Water, Gen 3)
  // The owner's design (2026-10-28): a Water / Earth team. Muddy Water: +Chips for each Water or Earth Joker you have, itself included
  // (muddy_count above: a dual-type joker once; Tera stickers and Castform's form through is_type; debuffed jokers don't count). The
  // per-joker Chips is `chips` (Energy +30% of its base each: Barboach 12 -> 15.6 / 19.2 / 22.8, Whiscash 20 -> 26 / 32 / 38). Neither
  // Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 16 / 18, 22).
  // Barboach 339: Common $5; +12 Chips per Water / Earth Joker. Evolves after 5 rounds.
  barboach: {
    name: 'barboach', poke_sprite391: sprite('Natdex', 16, 22),
    config: { extra: { chips: 12, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'types', 'round_evo'], poke_after: 'solrock',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = muddy_count(card);
      return { vars: [r3(ex.chips), n, r3(ex.chips * n), ex.rounds] };
    },
    calculate(self, card, context) { return muddy_main(card, context) || level_evo(self, card, context, 'j_poke_whiscash'); },
  },
  // Whiscash 340: Safari $8; +20 Chips per Water / Earth Joker; Earthquake: with at least 2 OTHER Water / Earth Jokers, the first hand
  // of each round (hands_played === 0) retriggers every scored card once (`retriggers`, fixed: never energized; `quake_req` neither).
  // A Blueprint copying it adds its own retrigger, as on Remoraid / Octillery (the condition is read from Whiscash's row).
  whiscash: {
    name: 'whiscash', poke_sprite391: sprite('Natdex', 18, 22),
    config: { extra: { chips: 20, retriggers: 1, quake_req: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'types', 'retrigger'], poke_after: 'barboach',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = muddy_count(card);
      return { vars: [r3(ex.chips), n, r3(ex.chips * n), ex.quake_req, quake_state(card)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint && quake_on(card)) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES && quake_on(card), true);
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_played === 0 && quake_on(card)) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return muddy_main(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE F8: Starly -> Staravia -> Staraptor (Colorless, Gen 4)
  // The owner's design (2026-10-28): a Colorless team (flock_count above: Tera stickers and Castform's Normal form through is_type;
  // debuffed jokers don't count; itself always does). Energy: Starly / Staravia's per-joker `mult` (+40% of base each: 2 -> 2.8 / 3.6
  // / 4.4, 4 -> 5.6 / 7.2 / 8.8), Staraptor's per-joker `Xmult_mod` (+20%: X0.5 -> X0.6 / X0.7 / X0.8); the $1 `recoil` is fixed (in
  // no energy field). Energy is re-applied to each new base on evolution. Neither Nacho nor Pokermon+ has the line. Art: upstream
  // 3.9.1's own (Natdex 10 / 12 / 14, 26). After Deoxys in Pokédex order (Pokermon has no joker for 387-395).
  // Starly 396: Uncommon $6; Flock, +2 Mult per Colorless Joker. Evolves after 4 rounds.
  starly: {
    name: 'starly', poke_sprite391: sprite('Natdex', 10, 26),
    config: { extra: { mult: 2, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'deoxys',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), flock_count(card), flock_mult(card), ex.rounds] }; },
    calculate(self, card, context) { return flock_main(card, context) || level_evo(self, card, context, 'j_poke_staravia'); },
  },
  // Staravia 397: Safari $8; Flock, +4 Mult per Colorless Joker. Evolves after 5 rounds.
  staravia: {
    name: 'staravia', poke_sprite391: sprite('Natdex', 12, 26),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'starly',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), flock_count(card), flock_mult(card), ex.rounds] }; },
    calculate(self, card, context) { return flock_main(card, context) || level_evo(self, card, context, 'j_poke_staraptor'); },
  },
  // Staraptor 398: Safari $10; Brave Bird, X(1 + 0.5 per Colorless Joker); Recoil: each hand played loses $1 (recoil() above: only
  // while the money stays at or above the debt limit, as the shop's own check; not copied by Blueprint, which copies the X Mult).
  staraptor: {
    name: 'staraptor', poke_sprite391: sprite('Natdex', 14, 26),
    config: { extra: { Xmult_mod: 0.5, recoil: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'types', 'money'], poke_after: 'staravia',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), ex.recoil, flock_count(card), brave_x(card)] }; },
    calculate(self, card, context) {
      recoil(card, context);
      if (context.joker_main) { const x = brave_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F9: Drifloon -> Drifblim (Psychic: Ghost/Flying, Gen 4)
  // The owner's design (2026-10-28): Stockpile (Gulpin's counter and its `stockpile_max` energy field, reused: stock_max) charged by
  // discards, released on the round's last hand. Each player DISCARD action gains 1 Stockpile up to max (once per discard, not per
  // card: drift_charge). Spit Up: on the FINAL hand of the round (hands_left 0, Acrobat's check) X(1 + 0.5 per Stockpile), then the
  // Stockpile resets to 0 (spit_up: the reset waits for `after`, so a Blueprint either side copies the X; it never adds or resets).
  // Energy: +1 max Stockpile each (Colorless +0.5, floored); the X0.5 per Stockpile (`spit_Xmult`) is never energized. Stockpile and
  // Energy carry into Drifblim. Art: upstream 3.9.1's own cells (Natdex 8 / 10, 28: the Psychic frame).
  // Drifloon 425: Common $5 (a 2-stage line's Basic); max 3; evolves after 4 Spit Ups (each with 1+ Stockpile; `spit_ups`, end of round).
  drifloon: {
    name: 'drifloon', poke_sprite391: sprite('Natdex', 8, 28),
    config: { evo_rqmt: 4, extra: { stockpile: 0, stockpile_max: 3, spit_Xmult: 0.5, spit_ups: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'discard', 'reset', 'scaling_evo'], poke_after: 'ambipom',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: drift_vars(card.ability.extra, self.config.evo_rqmt) }; },
    calculate(self, card, context) {
      drift_charge(card, context);
      return spit_up(card, context) || scaling_evo(self, card, context, 'j_poke_drifblim', card.ability.extra.spit_ups || 0, self.config.evo_rqmt);
    },
  },
  // Drifblim 426: Safari $8. The same Stockpile and Spit Up, max 5 (stockpile_max 3 — the energy field's base, so still +1 per Energy —
  // plus a fixed `stockpile_bonus` 2: 5 -> 8 with 3 Energy). Aftermath: when SOLD (selling_self) or DESTROYED (index.js
  // hooks.start_dissolve -> drifblim_destroyed), create a Negative Spectral card (aftermath). Not when it transforms; not a Blueprint.
  drifblim: {
    name: 'drifblim', poke_sprite391: sprite('Natdex', 10, 28),
    config: { extra: { stockpile: 0, stockpile_max: 3, stockpile_bonus: 2, spit_Xmult: 0.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'discard', 'reset', 'spectral', 'on_sell'], poke_after: 'drifloon',
    poke_custom_values_to_keep: ['stockpile'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
      return { vars: drift_vars(card.ability.extra) };
    },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) { aftermath(card); return undefined; }
      drift_charge(card, context);
      return spit_up(card, context);
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
        const form = castform_lock() || forecast(G.hand.cards); // (Kyogre / Groudon lock the weather; Rayquaza calms it)
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

  // ---------------------------------------------------------------- The Regi trio: Regirock 377 / Regice 378 / Registeel 379 (Gen 3)
  // The owner's design (2026-10-28). Three Legendaries ($20; The Soul / the Legendary pool, like Pokermon's other Legendaries), each
  // with a "Body" rule for one enhancement and the same Regi Trio conversion: when a Blind is selected, 1 + (OTHER Regi species you
  // have, undebuffed; regi_others) random cards of your full deck become that enhancement (regi_convert: unenhanced cards first, then
  // any card not already it). Types from the card art: Regirock Earth, Regice Water (Ice), Registeel Metal. Neither Nacho nor
  // Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex 2-7, 25).
  // Regirock 377 (Earth), Stone Body: Stone cards give +100 Chips instead of +50 (hook chip_bonus: regi_chip_bonus; `chips1`, Energy
  // +30%: 130 / 160 / 190) and permanently gain +10 Chips each time they score (perma_bonus, as Rhyhorn / Hiker; `chip_mod`, Energy
  // +20%: 12 / 14 / 16; Blueprint copies it).
  regirock: {
    name: 'regirock', poke_sprite391: sprite('Natdex', 2, 25, [3, 25]),
    config: { extra: { chips1: 100, chip_mod: 10 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'metagross',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_stone'); const ex = card.ability.extra; return { vars: [r3(ex.chips1), r3(ex.chip_mod), regi_converts(card)] }; },
    calculate(self, card, context) {
      regi_convert(card, context, 'm_stone', 'regirock', 'Stone');
      if (context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_stone')) {
        const c = context.other_card;
        c.ability.perma_bonus = (c.ability.perma_bonus || 0) + card.ability.extra.chip_mod;
        return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
      }
      return undefined;
    },
  },
  // Regice 378 (Water), Ice Body: Glass cards never shatter (their 1 in 4 break roll, identifier 'glass', is fixed to 0 — SMODS's
  // fix_probability, as Absol fixes every roll; nothing breaks, so Glass Joker / the Whismur line count nothing). Its conversion makes
  // Glass; `glass_convert` is its base 1 (the house energy field, systems/energy.js: +1 per Energy, +0.5 per mismatched Colorless,
  // floored), so each Energy converts 1 more Glass card per Blind.
  regice: {
    name: 'regice', poke_sprite391: sprite('Natdex', 4, 25, [5, 25]),
    config: { extra: { glass_convert: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'chance'], poke_after: 'regirock',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_glass'); return { vars: [regi_converts(card), Math.floor(card.ability.extra.glass_convert + 1e-9)] }; },
    calculate(self, card, context) {
      if (context.fix_probability && !context.blueprint && context.identifier === 'glass') return { numerator: 0 };
      regi_convert(card, context, 'm_glass', 'regice', 'Glass');
      return undefined;
    },
  },
  // Registeel 379 (Metal), Iron Body: Steel cards held in hand give X2 Mult instead of X1.5 (hook chip_h_x_mult: regi_h_x_mult — the
  // Steel card's own held effect, so Mime / a Red Seal retrigger it; `Xmult_multi`, the per-card X, Energy +5%: X2.1 / X2.2 / X2.3).
  registeel: {
    name: 'registeel', poke_sprite391: sprite('Natdex', 6, 25, [7, 25]),
    config: { extra: { Xmult_multi: 2 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'regice',
    loc_vars(self, info_queue, card) { regi_tips(self, info_queue, card, 'm_steel'); return { vars: [r3(card.ability.extra.Xmult_multi), regi_converts(card)] }; },
    calculate(self, card, context) { regi_convert(card, context, 'm_steel', 'registeel', 'Steel'); return undefined; },
  },

  // ---------------------------------------------------------------- The Eon duo: Latias 380 / Latios 381 (Psychic, Gen 3)
  // The owner's design (2026-10-28). Legendary $20 each (The Soul / the Legendary pool). Types from the card art: both Psychic (their
  // real Dragon type is the mapping's; the 3.9.1 card draws the Psychic icon). Latias, Mist Ball: permanently gains X0.15 Mult each time
  // you use a Tarot card. Latios, Luster Purge: the same for a Planet card. Soul Dew: holding BOTH (the partner undebuffed; find_card),
  // every Tarot OR Planet grows both — each copy on its own. A Blueprint copies the X, never the growth. Banked in `eon_Xmult` (no
  // energy field), the gain `Xmult_mod` (Energy +20% of base: 0.15 -> 0.18 / 0.21 / 0.24). Neither Nacho nor Pokermon+ has them. Art:
  // upstream 3.9.1's own cells with their floating souls (Natdex 8 / 10, 25).
  latias: {
    name: 'latias', poke_sprite391: sprite('Natdex', 8, 25, [9, 25]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'tarot', 'planet'], poke_after: 'registeel',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), soul_dew('latios') ? 'active' : 'needs Latios'] }; },
    calculate(self, card, context) { return eon(card, context, 'Tarot', 'latios'); },
  },
  latios: {
    name: 'latios', poke_sprite391: sprite('Natdex', 10, 25, [11, 25]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'tarot', 'planet'], poke_after: 'latias',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), soul_dew('latias') ? 'active' : 'needs Latias'] }; },
    calculate(self, card, context) { return eon(card, context, 'Planet', 'latias'); },
  },

  // ---------------------------------------------------------------- The weather trio: Kyogre 382 / Groudon 383 / Rayquaza 384 (Gen 3)
  // The owner's design (2026-10-28). Legendary $20 each. Types from the card art: Kyogre Water, Groudon Earth, Rayquaza Dragon.
  // Kyogre, Primordial Sea: +1 hand each round; every scored Club retriggers once; Castform is locked Rainy. Groudon, Desolate Land:
  // +1 discard each round; scored Hearts and Diamonds each give X1.25 Mult; Castform is locked Sunny. Primal Clash (both held, no
  // Rayquaza): on the round's first deal (Castform's weather read) the cards held decide — more Clubs: Kyogre's round, more Hearts +
  // Diamonds: Groudon's (Wild both, debuffed / Stone / Hazard neither); a tie: the one with more Energy, else Kyogre. The other one does
  // nothing that round, its +1 hand / discard included (primal_read). Rayquaza, Delta Stream: while held both work every round (no
  // clash; Castform reads its normal forecast, the weather calmed); Dragon Ascent: permanently gains X0.2 Mult each time a played hand
  // contains a Straight or a Flush (once for a Straight Flush). Energy: Groudon's per-card `Xmult_multi` +5% of base (X1.25 -> X1.3125
  // / X1.375 / X1.4375); Rayquaza's gain `Xmult_mod` +20% (0.2 -> 0.24 / 0.28 / 0.32; banked in `ascent_Xmult`, no energy field).
  // Kyogre has no number (+1 hand and the retrigger are fixed): Energy-inert by design (poke_no_energy_field). Neither Nacho nor
  // Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex 12 / 14 / 16, 25).
  kyogre: {
    name: 'kyogre', poke_sprite391: sprite('Natdex', 12, 25, [13, 25]),
    config: { extra: { hands: 1, retriggers: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['hands', 'retrigger', 'suit', 'clubs', 'types'], poke_after: 'latios',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, clash_state('groudon')] }; },
    calculate(self, card, context) {
      if (first_deal(card, context)) { card.ability.extra.forecast_round = G.GAME.round; primal_read(); return undefined; }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && primal_on(card) && context.other_card.is_suit('Clubs')) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
    ...primal_bonus('hands'),
  },
  groudon: {
    name: 'groudon', poke_sprite391: sprite('Natdex', 14, 25, [15, 25]),
    config: { extra: { d_size: 1, Xmult_multi: 1.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 3, blueprint_compat: true,
    attributes: ['discard', 'xmult', 'suit', 'hearts', 'diamonds', 'types'], poke_after: 'kyogre',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_multi), clash_state('kyogre')] }; },
    calculate(self, card, context) {
      if (first_deal(card, context)) { card.ability.extra.forecast_round = G.GAME.round; primal_read(); return undefined; }
      if (context.individual && context.cardarea === G.play && !context.end_of_round && primal_on(card)
        && (context.other_card.is_suit('Hearts') || context.other_card.is_suit('Diamonds'))) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...primal_bonus('d_size'),
  },
  rayquaza: {
    name: 'rayquaza', poke_sprite391: sprite('Natdex', 16, 25, [17, 25]),
    config: { extra: { ascent_Xmult: 1, Xmult_mod: 0.2 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 3, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'hand_type', 'types'], poke_after: 'groudon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.ascent_Xmult), r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.before && context.cardarea === G.jokers && !context.blueprint && ascends(context)) {
        ex.ascent_Xmult = r3(ex.ascent_Xmult + ex.Xmult_mod);
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Dragon Ascent!', colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.ascent_Xmult > 1) return { message: a_xmult(r3(ex.ascent_Xmult)), colour: 'XMULT', Xmult_mod: ex.ascent_Xmult };
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE J: Cherubi -> Cherrim (Grass, Gen 4)
  // The owner's design (2026-10-28). Types from the card art: both Grass. Sweet Seeds (both): when a Blind is selected, 1 random
  // unenhanced card in the full deck becomes a Seed card (sweet_seeds), and +1 growth level while owned (sweet_growth: a scored Seed
  // grows 2, blooming in 3 scores instead of 5). Cherubi evolves after 2 of your Seeds bloom into Flowers while it is held (the Seed
  // card's bloom calls every owned joker's poke_seed_bloom hook, enhancements/enhancement1.js). Cherrim, Flower Gift: Flower cards need
  // only 3+ suits (as Roserade; with both still 3: a minimum, never stacking); Sunshine Form: while it's sunny (cherrim_sunny) Flower
  // cards give X2.5 instead of X2 (the Flower card asks every owned joker's poke_flower_rule; the best X wins, Shaymin's +1 still on
  // top: X3.5). Energy: the Sunshine X is `Xmult_multi` (the per-card X, +5% of base: X2.625 / X2.75 / X2.875); the conversion and
  // the growth are fixed. Cherubi carries the same field (it has no X of its own) so Energy used on it shows and carries to Cherrim.
  // Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own cells — Cherubi Natdex {28,27}; Cherrim Overcast Gen 4 {0,1},
  // Sunshine Gen 4 {2,1} (unlisted in pokespriteload.lua, drawn by ui.js ownFace from the view's form, as Castform's weathers).
  // Cherubi 420: Common $5; evolves after 2 Seeds bloom (`seeds_bloomed`, checked at end of round).
  cherubi: {
    name: 'cherubi', poke_sprite391: sprite('Natdex', 28, 27),
    config: { evo_rqmt: 2, extra: { growth: 1, Xmult_multi: 2.5, seeds_bloomed: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'scaling_evo'], poke_after: 'floatzel',
    poke_seed_bloom(self, card) {
      const ex = card.ability.extra;
      ex.seeds_bloomed = (ex.seeds_bloomed || 0) + 1;
      card_eval_status_text(card, 'extra', null, null, null, { message: 'Bloom ' + Math.min(ex.seeds_bloomed, self.config.evo_rqmt) + '/' + self.config.evo_rqmt, colour: 'GREEN' });
    },
    loc_vars(self, info_queue, card) {
      seed_tips(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.growth, Math.min(ex.seeds_bloomed || 0, self.config.evo_rqmt), self.config.evo_rqmt, r3(ex.Xmult_multi)] };
    },
    calculate(self, card, context) {
      sweet_seeds(card, context);
      return scaling_evo(self, card, context, 'j_poke_cherrim', card.ability.extra.seeds_bloomed || 0, self.config.evo_rqmt);
    },
    ...sweet_growth,
  },
  // Cherrim 421: Safari $8; Sweet Seeds, Flower Gift, Sunshine Form (Overcast otherwise). Its form shows on the card (poke_view_form).
  cherrim: {
    name: 'cherrim', poke_sprite391: sprite('Gen04', 0, 1),
    config: { extra: { growth: 1, Xmult_multi: 2.5, suits: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'suits', 'hand_drawn'], poke_after: 'cherubi',
    /** The Flower card's rule (enhancements/enhancement1.js flower): 3+ suits always; X2.5 (energized) instead of X2 while sunny. */
    poke_flower_rule(self, card) { const ex = card.ability.extra; return { suits: ex.suits, x: cherrim_sunny(card) ? ex.Xmult_multi : undefined }; },
    /** The view's form (systems/anim.js view_card): live, so a Groudon bought or sold redraws it at once. */
    poke_view_form(self, card) { return cherrim_form(card); },
    loc_vars(self, info_queue, card) {
      seed_tips(self, info_queue, card);
      info_queue.push(P_CENTERS.m_poke_flower);
      const ex = card.ability.extra, sun = cherrim_sunny(card);
      return { vars: [ex.growth, ex.suits, r3(ex.Xmult_multi)], key: sun ? 'j_poke_cherrim_sunshine' : undefined };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (first_deal(card, context)) {
        ex.forecast_round = G.GAME.round;
        if (forecast(G.hand.cards) === 'sunny') ex.sun_round = G.GAME.round;
        if (cherrim_sunny(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Sunshine!', colour: CASTFORM_FORMS.sunny.colour });
        return undefined;
      }
      sweet_seeds(card, context);
      return undefined;
    },
    ...sweet_growth,
  },

  // ---------------------------------------------------------------- LINE F10: Shellos -> Gastrodon (Water, Gen 4)
  // The owner's design (2026-10-28). Each card has a SEA, West or East, rolled once when it is created (set_ability initial: the run's
  // seeded pseudorandom 'shellos_sea' / 'gastrodon_sea'), kept on ability.extra.form — so through save / resume and evolution — and
  // its card shows that sea: upstream 3.9.1 draws both on the Gen 4 sheet (Shellos East {4,1} blue / West {6,1} pink, Gastrodon East
  // {8,1} / West {10,1}, Shiny twins on the Shiny sheet; systems/anim.js SEA_SPRITES, ui.js ownFace). West works on the LEFTMOST
  // scored card, East on the RIGHTMOST (by position; a debuffed one there scores nothing). Two Seas: holding a West AND an East
  // Shellos / Gastrodon (any mix, undebuffed), every one of them works on BOTH ends; a 1-card hand's card is both ends, once.
  // Energy: the end card's Chips `chips` +30% of base (40 -> 52 / 64 / 76) and Storm Drain's gain `Xmult_mod` +20% (0.1 -> 0.12 /
  // 0.14 / 0.16, Water Energy twice that); the retrigger is fixed; carried through evolution (energy_count re-applied to the new
  // base), never retroactive (the bank `drain_Xmult` is in no energy field). Neither Nacho nor Pokermon+ has the line.
  // Shellos 422: Common $5; Tide Pool, the sea's end card +40 Chips when scored. Evolves after 5 rounds, keeping its sea.
  shellos: {
    name: 'shellos', poke_sprite391: sprite('Gen04', 4, 1),
    config: { extra: { chips: 40, form: 'east', rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'position', 'round_evo'], poke_after: 'cherrim',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), sea_ends_text(card), SEAS[sea_of(card)].name, two_seas_text(card), ex.rounds] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom(pseudoseed('shellos_sea')) < 0.5 ? 'west' : 'east';
    },
    calculate(self, card, context) { return tide_chips(card, context) || level_evo(self, card, context, 'j_poke_gastrodon'); },
  },
  // Gastrodon 423: Safari $8; Tide, the sea's end card retriggers once (`retriggers`, fixed) and gives +40 Chips each time it scores
  // (so +80 with the retrigger); Storm Drain, each Energy card used (on any joker) banks X0.1 Mult, X0.2 for Water Energy. Blueprint
  // copies the retrigger, the Chips and the X, never the growth.
  gastrodon: {
    name: 'gastrodon', poke_sprite391: sprite('Gen04', 8, 1),
    config: { extra: { chips: 40, retriggers: 1, Xmult_mod: 0.1, drain_Xmult: 1, form: 'east' } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'retrigger', 'xmult', 'scaling', 'energy', 'position'], poke_after: 'shellos',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), sea_ends_text(card), SEAS[sea_of(card)].name, two_seas_text(card), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod), r3(ex.drain_Xmult)] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom(pseudoseed('gastrodon_sea')) < 0.5 ? 'west' : 'east';
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.using_consumeable && !context.blueprint && context.consumeable && context.consumeable.ability.set === 'Energy') {
        ex.drain_Xmult = r3(ex.drain_Xmult + storm_gain(ex, context.consumeable));
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Storm Drain!', colour: 'XMULT' });
        return undefined;
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && at_sea_end(card, context, context.other_card)) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (context.joker_main && ex.drain_Xmult > 1) return { message: a_xmult(r3(ex.drain_Xmult)), colour: 'XMULT', Xmult_mod: ex.drain_Xmult };
      return tide_chips(card, context);
    },
  },

  // ---------------------------------------------------------------- Chatot 441 (Colorless, Gen 4)
  // The owner's design (2026-10-28). Rare $7, single-stage. Vocabulary: +4 Mult for each DIFFERENT poker hand type played this run
  // (vocabulary above: G.GAME.hands[h].played > 0, the run's own records, so a Chatot bought late sees the whole run; secret hands
  // count). New Word: the first time each poker hand type is played this run, WHILE Chatot is held, it creates that hand's Planet if
  // there is consumable room (new_word above; tracked per joker in `new_words`, granted once a type). Energy: the per-hand `mult`
  // (+40% of base: 4 -> 5.6 / 7.2 / 8.8); the Planets are fixed. Blueprint copies the Mult, not New Word. Neither Nacho nor Pokermon+
  // has it. Art: upstream 3.9.1's own cell (Natdex 10, 29: the Colorless frame).
  chatot: {
    name: 'chatot', poke_sprite391: sprite('Natdex', 10, 29),
    config: { extra: { mult: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'hand_type', 'planet', 'generation'], poke_after: 'happiny',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.mult), vocabulary(), vocab_mult(card)] };
    },
    calculate(self, card, context) {
      new_word(card, context);
      if (!context.joker_main) return undefined;
      const mult = vocab_mult(card);
      if (!mult) return undefined;
      return { message: a_mult(mult), colour: 'MULT', mult_mod: mult };
    },
  },

  // ---------------------------------------------------------------- The Burmy line: Burmy 412 -> Wormadam 413 (female) / Mothim 414 (male)
  // The owner's design (2026-10-28). Burmy (Basic, Common $5) wears a cloak, and its type and card follow it: Plant (Grass), Sandy
  // (Earth), Trash (Metal) — the types upstream 3.9.1's own cards show (the Gen 4 sheet, row 0: Burmy 0 / 2 / 4, Wormadam 6 / 8 /
  // 10; systems/anim.js BURMY_SPRITES). Cloak: at the end of each round (the main end_of_round pass, not Blueprint) it takes the
  // cloak of the biggest pile in the full deck (cloak_of_deck, the owner's ruling of contentRev 41: Stone cards Sandy, Steel cards
  // Trash, every other card — unenhanced or any other enhancement — Plant; a tie keeps the cloak). It starts as Plant. Plant +5 Mult (`mult1`), Sandy +40 Chips (`chips1`), Trash $1 at end of
  // round (calc_dollar_bonus; `trash_money`, fixed). Its gender is rolled once when the card is created (set_ability initial, the
  // run's seeded pseudorandom 'burmy_gender': Female or Male, kept on ability.extra and so through save / resume, which rebuild
  // the run from its recipe). After 4 rounds a Female becomes Wormadam wearing its cloak (locked: the type stays), a Male Mothim.
  // Monotype: Burmy's cloak type never counts (poke_mono_exempt, as Castform); Wormadam and Mothim are checked like any joker.
  burmy: {
    name: 'burmy', poke_sprite391: sprite('Gen04', 0, 0),
    config: { extra: { mult1: 5, chips1: 40, trash_money: 1, form: 'plant', gender: 'female', rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'chips', 'money', 'enhancements', 'full_deck', 'types', 'round_evo'], poke_after: 'roserade',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, cloak = BURMY_CLOAKS[ex.form] ? ex.form : 'plant';
      return { vars: [r3(ex.mult1), r3(ex.chips1), ex.trash_money, BURMY_CLOAKS[cloak].name, gender_name(ex.gender), ex.rounds, ex.gender === 'male' ? 'Mothim' : 'Wormadam'] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.gender = pseudorandom(pseudoseed('burmy_gender')) < 0.5 ? 'female' : 'male';
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (round_end(context) && !context.blueprint) {
        const cloak = cloak_of_deck(G.playing_cards, BURMY_CLOAKS[ex.form] ? ex.form : 'plant');
        if (cloak !== ex.form) {
          set_cloak(card, cloak);
          card_eval_status_text(card, 'extra', null, null, null, { message: BURMY_CLOAKS[cloak].name + ' Cloak!', colour: BURMY_CLOAKS[cloak].colour });
        }
        return level_evo(self, card, context, ex.gender === 'male' ? 'j_poke_mothim' : 'j_poke_wormadam');
      }
      if (context.joker_main) {
        if (ex.form === 'plant') return { message: a_mult(r3(ex.mult1)), colour: 'MULT', mult_mod: ex.mult1 };
        if (ex.form === 'sandy') return { message: a_chips(r3(ex.chips1)), colour: 'CHIPS', chip_mod: ex.chips1 };
      }
      return undefined;
    },
    calc_dollar_bonus(self, card) {
      const ex = card.ability.extra;
      return ex.form === 'trash' ? ease_poke_dollars(card, 'burmy', ex.trash_money, true) : undefined;
    },
  },
  // Wormadam 413 (Stage 1, Safari $8), Cloaked: the cloak (and its type) Burmy wore when it evolved, for good. Plant: each scored
  // UNENHANCED card +3 Mult (`mult1`); Sandy: each scored Stone card X1.5 Mult (`Xmult_multi`, the per-card X); Trash: each Steel
  // card held in hand at end of round earns $1 (`steel_money`, fixed; Mime / a Red Seal repeat it, as a Gold card's).
  wormadam: {
    name: 'wormadam', poke_sprite391: sprite('Gen04', 6, 0),
    config: { extra: { mult1: 3, Xmult_multi: 1.5, steel_money: 1, form: 'plant' } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'enhancements', 'types'], poke_after: 'burmy',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, cloak = BURMY_CLOAKS[ex.form] ? ex.form : 'plant';
      if (cloak === 'sandy') info_queue.push(P_CENTERS.m_stone);
      if (cloak === 'trash') info_queue.push(P_CENTERS.m_steel);
      return { vars: [r3(ex.mult1), r3(ex.Xmult_multi), ex.steel_money], key: cloak === 'plant' ? undefined : 'j_poke_wormadam_' + cloak };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra, oc = context.other_card;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && oc && !oc.debuff) {
        if (ex.form === 'plant' && oc.config.center.key === 'c_base') return { mult: ex.mult1, card };
        if (ex.form === 'sandy' && has_enhancement(oc, 'm_stone')) return { x_mult: ex.Xmult_multi, card };
      }
      if (ex.form === 'trash' && context.end_of_round && context.individual && context.cardarea === G.hand && oc && !oc.debuff && has_enhancement(oc, 'm_steel')) {
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.steel_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ease_poke_dollars(card, 'wormadam', ex.steel_money, true), card: oc };
      }
      return undefined;
    },
  },
  // Mothim 414 (Stage 1, Safari $8, Grass: its card's type), Free Flight: X(1 + 0.25 for each DIFFERENT enhancement in the full
  // deck), of MOTHIM_ENHANCEMENTS (the 8 vanilla ones + Seed + Flower: up to X3.5). `Xmult_mod` (+20% per Energy: 0.3 / 0.35 / 0.4).
  mothim: {
    name: 'mothim', poke_sprite391: sprite('Natdex', 16, 27),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'full_deck'], poke_after: 'wormadam',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const n = G.playing_cards ? distinct_enhancements(G.playing_cards) : 0;
      return { vars: [r3(card.ability.extra.Xmult_mod), n, r3(1 + card.ability.extra.Xmult_mod * n)] };
    },
    calculate(self, card, context) {
      if (context.joker_main) { const x = free_flight_x(card); if (x > 1) return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F10: Combee -> Vespiquen (Grass, Gen 4)
  // The owner's design (2026-10-28): Honey Gather (honey_gather above) — at end of round the Jokers directly left and right gain a
  // FIXED +$1 / +$2 sell value (`honey`: no energy field; nothing on an empty side; a debuffed one gives nothing; Blueprint never feeds
  // it twice). Vespiquen's Attack Order: X(1 + 0.1 per $ of the two neighbours' current sell value, card.sell_cost), capped at X3
  // (`Xmult_cap`, fixed). Energy raises the per-$ `Xmult_mod` (+20% of base: 0.1 -> 0.12 / 0.14 / 0.16); Combee carries the same field
  // so it can take Energy, which evolution re-applies to Vespiquen's base (it adds nothing to Combee's own honey). Every Combee evolves
  // (the female-only lore rule is not used). Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 18 / 20, 27:
  // the green Grass frame). After Mothim (414) in Pokédex order.
  // Combee 415: Common $5; Honey Gather +$1. Evolves after 5 rounds.
  combee: {
    name: 'combee', poke_sprite391: sprite('Natdex', 18, 27),
    config: { extra: { honey: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: false,
    attributes: ['sell_value', 'joker', 'economy', 'round_evo'], poke_after: 'mothim',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.honey, ex.rounds, r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) { honey_gather(card, context); return level_evo(self, card, context, 'j_poke_vespiquen'); },
  },
  // Vespiquen 416: Safari $8; Honey Gather +$2; Attack Order X(1 + 0.1 per $ of the neighbours' sell value), max X3.
  vespiquen: {
    name: 'vespiquen', poke_sprite391: sprite('Natdex', 20, 27),
    config: { extra: { honey: 2, Xmult_mod: 0.1, Xmult_cap: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['sell_value', 'joker', 'economy', 'xmult'], poke_after: 'combee',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.honey, r3(ex.Xmult_mod), ex.Xmult_cap, hive_value(card), attack_order_x(card)] };
    },
    calculate(self, card, context) {
      honey_gather(card, context);
      if (context.joker_main) { const x = attack_order_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Pachirisu 417 (Lightning, Gen 4)
  // The owner's design (2026-10-28). Rare $7, single-stage. Quick Spark: the first hand of each round (hands_played === 0) gives X2
  // Mult (`Xmult`); Nuzzle: plus X0.25 (`Xmult_mod`) for each OTHER Lightning Joker (spark_others above: is_type, so Tera stickers
  // count; debuffed ones don't). Cheek Pouch: at end of round earn $1 (`pouch`) for each Lightning Joker, itself included, through
  // calc_dollar_bonus (a row of the round's cash-out list, as Miltank). Energy: Xmult +20% (2 -> 2.4 / 2.8 / 3.2) and Xmult_mod +20%
  // (0.25 -> 0.3 / 0.35 / 0.4); the $ is fixed. Blueprint copies the first-hand X Mult (Blueprint is no Lightning joker, so it never
  // adds to the counts), never the Cheek Pouch (calc_dollar_bonus is not copied, as Golden Joker). Neither Nacho nor Pokermon+ has
  // it. Art: upstream 3.9.1's own cell (Natdex 22, 27: the Lightning frame). After Vespiquen (416) in Pokédex order.
  pachirisu: {
    name: 'pachirisu', poke_sprite391: sprite('Natdex', 22, 27),
    config: { extra: { Xmult: 2, Xmult_mod: 0.25, pouch: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'economy', 'types', 'hands'], poke_after: 'vespiquen',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), spark_x(card), spark_state(), ex.pouch, pouch_money(card)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, () => spark_on() && !G.RESET_JIGGLES, true);
      if (!context.joker_main || !spark_on()) return undefined;
      const x = spark_x(card);
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
    calc_dollar_bonus(self, card) { return pouch_money(card); },
  },
  // ---------------------------------------------------------------- LINE: Glameow -> Purugly (Colorless, Gen 4)
  // The owner's design (2026-10-28): Fickle — a favourite suit, picked when first obtained and again each end of round (the run's
  // seeded RNG, Ancient Joker's pick: never the same suit twice running; fickle_pick above); scored cards of it give +5 Mult (Glameow)
  // / X1.25 Mult each (Purugly). Purugly's Thick Fat: -1 Joker slot while held (slot_cost_*). Glameow evolves after 5 rounds, but only
  // with a free Joker slot (glameow_evo: it waits, never pushing a joker out). Energy: Glameow's per-card `mult` (+40% of base: 5 -> 7 /
  // 9 / 11), Purugly's per-card `Xmult_multi` (+5%: X1.25 -> X1.3125 / X1.375 / X1.4375), re-applied on evolution; the slot cost is fixed
  // (`slot_cost`, no energy field). Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 20 / 22, 28). After
  // Honchkrow (430) in Pokédex order.
  // Glameow 431: Common $5.
  glameow: {
    name: 'glameow', poke_sprite391: sprite('Natdex', 20, 28),
    config: { extra: { mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'suit', 'round_evo'], poke_after: 'honchkrow',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), fav_vars(card), ex.rounds], colours: fav_colour(card) }; },
    add_to_deck(self, card) { if (!card.ability.fav_suit) fickle_pick(card); },
    calculate(self, card, context) {
      if (fav_scored(card, context)) return { mult: card.ability.extra.mult, card };
      fickle(card, context);
      return glameow_evo(self, card, context);
    },
  },
  // Purugly 432: Safari $8.
  purugly: {
    name: 'purugly', poke_sprite391: sprite('Natdex', 22, 28),
    config: { extra: { Xmult_multi: 1.25, slot_cost: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'joker_slot'], poke_after: 'glameow',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.slot_cost, fav_vars(card)], colours: fav_colour(card) }; },
    add_to_deck(self, card, from_debuff) { if (!card.ability.fav_suit) fickle_pick(card); slot_cost_add(card, from_debuff); },
    remove_from_deck(self, card, from_debuff) { slot_cost_remove(card, from_debuff); },
    calculate(self, card, context) {
      if (fav_scored(card, context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      fickle(card, context);
      return undefined;
    },
  },
  // ---------------------------------------------------------------- LINE: Stunky -> Skuntank (Dark, Gen 4)
  // The owner's design (2026-10-28): the Blind is poisoned (poison_gas above). Stunky's Poison Gas: after each hand you play, the Blind's
  // requirement drops by 4% of its starting requirement; Skuntank's Toxic: after the nth hand of the round, by n x 4% (4, 8, 12...: 40%
  // by the end of hand 4). Resets each Blind; all copies share one record and its cap (-75% of the start), never below 1 chip; copies
  // stack additively and Blueprint copies the drop (a copied ability, its own message). Never the hand that scored: it acts after the win
  // check, and not after the round's final hand. Reaching the lowered requirement wins the Blind right after that hand (no draw).
  // Energy: `poison_pct` +20% of base per Energy (energy.js: 4 -> 4.8 / 5.6 / 6.4%, Colorless half), re-applied on evolution; the
  // cap is fixed. Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 26 / 28, 28). After Chingling (433).
  // Stunky 434: Common $5. Evolves after 5 rounds.
  stunky: {
    name: 'stunky', poke_sprite391: sprite('Natdex', 26, 28),
    config: { extra: { poison_pct: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['blind', 'round_evo'], poke_after: 'chingling',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.poison_pct), POISON_CAP, poison_taken(), ex.rounds] }; },
    calculate(self, card, context) { return poison_gas(card, context, false) || level_evo(self, card, context, 'j_poke_skuntank'); },
  },
  // Skuntank 435: Safari $8.
  skuntank: {
    name: 'skuntank', poke_sprite391: sprite('Natdex', 28, 28),
    config: { extra: { poison_pct: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['blind', 'scaling'], poke_after: 'stunky',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, next = ((G.GAME && G.GAME.facing_blind && G.GAME.current_round && G.GAME.current_round.hands_played) || 0) + 1;
      return { vars: [r3(ex.poison_pct), POISON_CAP, poison_taken(), poison_step(card, 2), poison_step(card, 3), poison_step(card, next)] };
    },
    calculate(self, card, context) { return poison_gas(card, context, true); },
  },
  // ---------------------------------------------------------------- LINE: Gible -> Gabite -> Garchomp (Dragon, Gen 4)
  // The owner's design (2026-10-28): bite -> hoard -> cash in (bite / treasure_nest / dragon_rush_x above). Gible's Bite banks +1 Mult per
  // scored card of every hand containing a Pair (bite_mult; Energy raises mult_mod, never the bank); Gabite keeps biting and its Treasure
  // Nest turns one scored card of a Full House Gold; Garchomp gives the bank and Dragon Rush, X(1 + 0.5 per Gold card held in hand).
  // Energy: mult_mod +20% (1 -> 1.2 / 1.4 / 1.6 a card), Garchomp's Xmult_mod +20% (0.5 -> 0.6 / 0.7 / 0.8 a Gold card); the conversion is
  // fixed; carried through evolution (re-applied to the new base). Blueprint copies the Mult / X, never the bank's growth or the Gold.
  // Neither Nacho nor Pokermon+ has the line. Art: upstream 3.9.1's own (Natdex 14 / 16 / 18, 29). After Spiritomb (442). No Mega here.
  // Gible 443: Uncommon $6. Evolves at +25 banked Mult (Dratini's scaling_evo).
  gible: {
    name: 'gible', poke_sprite391: sprite('Natdex', 14, 29),
    config: { evo_rqmt: 25, extra: { bite_mult: 0, mult_mod: 1 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dragon', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'scaling_evo'], poke_after: 'spiritomb',
    poke_custom_values_to_keep: ['bite_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.bite_mult), r3(ex.mult_mod), self.config.evo_rqmt] }; },
    calculate(self, card, context) {
      return bite(card, context) || scaling_evo(self, card, context, 'j_poke_gabite', card.ability.extra.bite_mult, self.config.evo_rqmt);
    },
  },
  // Gabite 444: Safari $8. Keeps biting (+1 a scored card); Treasure Nest. Evolves at end of round with 6 Gold cards in the full deck.
  gabite: {
    name: 'gabite', poke_sprite391: sprite('Natdex', 16, 29),
    config: { evo_rqmt: 6, extra: { bite_mult: 0, mult_mod: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'enhancements', 'modify_card', 'full_deck', 'scaling_evo'], poke_after: 'gible',
    poke_custom_values_to_keep: ['bite_mult'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold);
      const ex = card.ability.extra;
      return { vars: [r3(ex.bite_mult), r3(ex.mult_mod), self.config.evo_rqmt, gold_in_deck()] };
    },
    calculate(self, card, context) {
      return treasure_nest(card, context) || bite(card, context) || scaling_evo(self, card, context, 'j_poke_garchomp', gold_in_deck(), self.config.evo_rqmt);
    },
  },
  // Garchomp 445: Safari $10. The bank (it banks no more) and Dragon Rush.
  garchomp: {
    name: 'garchomp', poke_sprite391: sprite('Natdex', 18, 29),
    config: { extra: { bite_mult: 0, Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dragon', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements'], poke_after: 'gabite',
    poke_custom_values_to_keep: ['bite_mult'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold);
      const ex = card.ability.extra;
      return { vars: [r3(ex.bite_mult), r3(ex.Xmult_mod), gold_held(), dragon_rush_x(card)] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra, x = dragon_rush_x(card), r = {};
      if (ex.bite_mult > 0) r.mult_mod = ex.bite_mult;
      if (x > 1) r.Xmult_mod = x;
      if (!Object.keys(r).length) return undefined;
      r.message = r.Xmult_mod ? a_xmult(x) : a_mult(r3(r.mult_mod));
      r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
      return r;
    },
  },
  // ---------------------------------------------------------------- the last Gen 4 regulars (contentRev 44): Hippopotas -> Hippowdon,
  // Skorupi -> Drapion, Carnivine, Finneon -> Lumineon. The owner's designs (2026-10-28). Neither Nacho nor Pokermon+ has any of them.
  // Art: upstream 3.9.1's own cells (Natdex {26,29} / {28,29}, {0,30} / {2,30}, {8,30}, {10,30} / {12,30}); nothing to deploy. After
  // Lucario's Mega (448), before Mantyke (458); Croagunk / Toxicroak (453 / 454) are Pokermon+'s.
  // Hippopotas 449: Common $5, Earth. Sand Stream: scored Stone cards give +30 extra Chips (`chips` +30%: 39 / 48 / 57). 5 rounds.
  hippopotas: {
    name: 'hippopotas', poke_sprite391: sprite('Natdex', 26, 29),
    config: { extra: { chips: 30, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'round_evo'], poke_after: 'mega_lucario',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return sand_stream(card, context) || level_evo(self, card, context, 'j_poke_hippowdon'); },
  },
  // Hippowdon 450: Safari $8. +60 extra Chips per scored Stone card (78 / 96 / 114 energized); on each round's first deal, 1 random
  // unenhanced card held in hand becomes a Stone card (fixed: Energy never raises the conversion).
  hippowdon: {
    name: 'hippowdon', poke_sprite391: sprite('Natdex', 28, 29),
    config: { extra: { chips: 60 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'modify_card'], poke_after: 'hippopotas',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); return { vars: [r3(card.ability.extra.chips)] }; },
    calculate(self, card, context) { sand_stone(card, context); return sand_stream(card, context); },
  },
  // Skorupi 451: Common $5, Dark. Sniper: each scored card, 1 in 5 to crit for X1.25 (`Xmult_multi` +5%: X1.3125 / 1.375 / 1.4375; the odds
  // are num / dem, never energized). 5 rounds.
  skorupi: {
    name: 'skorupi', poke_sprite391: sprite('Natdex', 0, 30),
    config: { extra: { num: 1, dem: 5, Xmult_multi: 1.25, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'chance', 'round_evo'], poke_after: 'hippowdon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...sniper_vars(card, 'skorupi'), card.ability.extra.rounds] }; },
    calculate(self, card, context) { return sniper(card, context, 'skorupi') || level_evo(self, card, context, 'j_poke_drapion'); },
  },
  // Drapion 452: Safari $8. 1 in 3 to crit for X1.5 (X1.575 / 1.65 / 1.725); Lucky cards always crit (no roll: Absol can't stop them).
  drapion: {
    name: 'drapion', poke_sprite391: sprite('Natdex', 2, 30),
    config: { extra: { num: 1, dem: 3, Xmult_multi: 1.5, always_crit: true } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'chance', 'enhancements'], poke_after: 'skorupi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: sniper_vars(card, 'drapion') }; },
    calculate(self, card, context) { return sniper(card, context, 'drapion'); },
  },
  // Carnivine 455: Rare $7, Grass, single-stage. Flytrap: the first card you discard each round is devoured (destroyed: the engine's
  // discard-destroy, so "card destroyed" payoffs fire) and banks +4 Mult for good (`mult_mod` +20%: 4.8 / 5.6 / 6.4 a devour; the bank
  // `devour_mult` is never retroactive). It gives the bank every hand (Blueprint copies the Mult, never the devour).
  carnivine: {
    name: 'carnivine', poke_sprite391: sprite('Natdex', 8, 30),
    config: { extra: { devour_mult: 0, mult_mod: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'discard', 'destroy_card'], poke_after: 'drapion',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.devour_mult), r3(ex.mult_mod), flytrap_state(card)] }; },
    calculate(self, card, context) {
      const r = flytrap(card, context);
      if (r) return r;
      const m = card.ability.extra.devour_mult;
      if (context.joker_main && m > 0) return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
      return undefined;
    },
  },
  // Finneon 456: Common $5, Water. +40 Chips on NIGHT hands (the 2nd and 4th of each round: Lunatone / Solrock's cycle; `chips` +30%:
  // 52 / 64 / 76). 5 rounds.
  finneon: {
    name: 'finneon', poke_sprite391: sprite('Natdex', 10, 30),
    config: { extra: { chips: 40, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'hands', 'round_evo'], poke_after: 'carnivine',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), next_is_day() ? 'Day' : 'Night', ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && !is_day()) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_lumineon');
    },
  },
  // Lumineon 457: Safari $8. On night hands each scored card gives +15 Chips (19.5 / 24 / 28.5); with Lunatone (owned, undebuffed) on
  // day hands too.
  lumineon: {
    name: 'lumineon', poke_sprite391: sprite('Natdex', 12, 30),
    config: { extra: { chips: 15 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['chips', 'hands'], poke_after: 'finneon',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.chips), next_is_day() ? 'Day' : 'Night', cosmic(card, 'j_poke_lunatone') ? 'active' : 'needs Lunatone'] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && luminous(card)) return { chips: card.ability.extra.chips, card };
      return undefined;
    },
  },
  // ---------------------------------------------------------------- The Lake trio: Uxie 480 / Mesprit 481 / Azelf 482 (Psychic, Gen 4)
  // The owner's design (2026-10-28). Legendary $20 each (The Soul / the Legendary pool). Types from the card art: all three Psychic.
  // Uxie, Knowledge: +2 Foresight (the Shinx line's scry); each Foreseen card gives X1.3 Mult (the Foreseen cards are scored like held
  // cards, context.individual with cardarea G.scry_view, as Hoothoot's; a debuffed one gives nothing). Mesprit, Emotion: X1.5 Mult, or
  // X2.5 on a hand whose poker hand hasn't been played yet this round (first_this_round). Azelf, Willpower: X2.5 Mult on the final hand
  // of each round (final_hand, Drifloon's check). Lake Guardians: each one's X values get +X0.25 for each OTHER guardian species held,
  // undebuffed (lake_others, the Regi Trio's distinct count) — all three: Uxie X1.8 per Foreseen card, Mesprit X2 / X3, Azelf X3.
  // Energy: Uxie's per-card `Xmult_multi` +5% (1.3 -> 1.365 / 1.43 / 1.495), Mesprit's `Xmult` / `Xmult2` +20% (1.5 -> 1.8 / 2.1 / 2.4,
  // 2.5 -> 3 / 3.5 / 4), Azelf's `Xmult` +20% (2.5 -> 3 / 3.5 / 4); the +0.25 per guardian (`lake_mod`) and the Foresight are fixed.
  // Neither Nacho nor Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex {28,31}, {0,32}, {2,32}).
  uxie: {
    name: 'uxie', poke_sprite391: sprite('Natdex', 28, 31, [29, 31]),
    config: { extra: { scry: 2, Xmult_multi: 1.3, lake_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'xmult'], poke_after: 'rotomm',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); scry_tip(info_queue);
      const ex = card.ability.extra;
      return { vars: [ex.scry, r3(ex.Xmult_multi), r3(ex.lake_mod), lake_others(card), lake_x(card, 'Xmult_multi')] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.scry_view && !context.end_of_round && !context.other_card.debuff) {
        return { x_mult: lake_x(card, 'Xmult_multi'), card };
      }
      return undefined;
    },
    ...scry,
  },
  mesprit: {
    name: 'mesprit', poke_sprite391: sprite('Natdex', 0, 32, [1, 32]),
    config: { extra: { Xmult: 1.5, Xmult2: 2.5, lake_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'hand_type'], poke_after: 'uxie',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.Xmult2), r3(ex.lake_mod), lake_others(card), lake_x(card, 'Xmult'), lake_x(card, 'Xmult2')] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = lake_x(card, first_this_round(context) ? 'Xmult2' : 'Xmult');
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },
  azelf: {
    name: 'azelf', poke_sprite391: sprite('Natdex', 2, 32, [3, 32]),
    config: { extra: { Xmult: 2.5, lake_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'mesprit',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.lake_mod), lake_others(card), lake_x(card, 'Xmult')] };
    },
    calculate(self, card, context) {
      if (!context.joker_main || !final_hand()) return undefined;
      const x = lake_x(card, 'Xmult');
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },

  // ---------------------------------------------------------------- The creation trio: Dialga 483 / Palkia 484 / Giratina 487 (Gen 4)
  // The owner's design (2026-10-28). Legendary $20 each (The Soul / the Legendary pool). Types from the card art: Dialga Metal, Palkia
  // Water, Giratina Psychic (both its Altered and its Origin card show the Psychic icon). Neither Nacho nor Pokermon+ has them. Art:
  // upstream 3.9.1's own cells with their floating souls (Gen 4 sheet: Dialga {10,2}, Palkia {4,3}, Giratina {8,3}; the Origin Forme
  // {10,3} / soul {11,3}, drawn by ui.js ownFace from the view's live form, as Cherrim's Sunshine). After Rotom's forms (479) in Pokédex
  // order (Pokermon has no joker for 480-491 but Shaymin 492).
  // Dialga 483, Roar of Time: the FIRST hand of each round is scored twice — every scored card retriggers once (a repetition for each
  // card of G.play while hands_played === 0, Whiscash's Earthquake without its gate), so the cards' chips, mult, enhancements, seals
  // and every per-card joker effect happen twice while the jokers' own hand effects (joker_main, after) run once, as for one hand.
  // Fixed (no number): Energy-inert by design (poke_no_energy_field). Blueprint copies it like Whiscash / Remoraid (a second retrigger).
  dialga: {
    name: 'dialga', poke_sprite391: sprite('Gen04', 10, 2, [11, 2]),
    config: { extra: { retriggers: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 4, blueprint_compat: true,
    attributes: ['retrigger', 'hands'], poke_after: 'azelf',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [spark_state()] }; },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, () => roar_on() && !G.RESET_JIGGLES, true);
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && roar_on()) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Palkia 484, Spacial Rend: +1 Joker slot and +1 hand size while held (spacial_rend above: reverted when sold, destroyed or debuffed;
  // never pushing a Joker out). Fixed: Energy-inert by design (poke_no_energy_field). Nothing to copy (blueprint_compat false).
  palkia: {
    name: 'palkia', poke_sprite391: sprite('Gen04', 4, 3, [5, 3]),
    config: { extra: { slots: 1, h_size: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 4, blueprint_compat: false,
    attributes: ['joker_slot', 'hand_size'], poke_after: 'dialga',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.slots, ex.h_size] }; },
    ...spacial_rend,
  },
  // Regigigas 486, Slow Start (Colorless): asleep (it gives nothing) until its countdown `slow_start` (5 when obtained) reaches 0;
  // then X4 Mult for the rest of the run. The countdown: at each end of round (the main end_of_round pass; not Blueprint; a debuffed
  // Regigigas isn't calculated, so it waits) it drops by 1 + the DISTINCT Regis held then (Regirock / Regice / Registeel, undebuffed;
  // regis_distinct): no Regi 5 rounds (5 4 3 2 1 0), one 3 (5 3 1 0), two 2 (5 2 0); with ALL THREE the countdown goes straight to 0
  // (giga_drop; the owner, contentRev 47: "full trio can make it 1 round"), so the trio wakes it after 1 round (5 0), and a trio
  // assembled partway through the wait wakes it at the next end of round. Awake, with all three Regis
  // held, each Regi converts 1 extra card per Blind (giga_trio_bonus in regi_converts; once, however many Regigigas). Energy: `Xmult`
  // +20% of base (X4 -> X4.8 / X5.6 / X6.4); the wait is fixed (`slow_start`, no energy field). Blueprint copies the X only when awake.
  // After Palkia (Pokermon has no Heatran 485).
  regigigas: {
    name: 'regigigas', poke_sprite391: sprite('Natdex', 10, 32, [11, 32]),
    config: { extra: { Xmult: 4, slow_start: 5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'full_deck'], poke_after: 'palkia',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = regis_distinct(), left = Math.max(0, ex.slow_start || 0);
      return { vars: [r3(ex.Xmult), left, n, giga_awake(card) ? 'Awake!' : n >= 3 ? 'Asleep: ' + left + ' left, wakes at end of round' : 'Asleep: ' + left + ' left, -' + (1 + n) + ' a round'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (round_end(context) && !context.blueprint && !giga_awake(card)) {
        ex.slow_start = Math.max(0, ex.slow_start - giga_drop(ex.slow_start, regis_distinct()));
        card_eval_status_text(card, 'extra', null, null, null, giga_awake(card) ? { message: 'Awake!', colour: 'XMULT' } : { message: 'Slow Start: ' + ex.slow_start, colour: 'FILTER' });
        return undefined;
      }
      if (context.joker_main && giga_awake(card)) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      return undefined;
    },
  },
  // Giratina 487, Shadow Force (Psychic): permanently gains X0.25 Mult for each playing card destroyed, by any cause (the
  // remove_playing_cards context every destroying path sends: Glass shattering, Hanged Man, Gulpin's swallow, a discard eaten...),
  // banked in `shadow_Xmult` (no energy field; never retroactive). Origin Forme: while an undebuffed Dialga or Palkia is held, its
  // gain is doubled (X0.5) and it shows the Origin card (poke_view_form, live). Energy: the gain `Xmult_mod` +20% (0.25 -> 0.3 / 0.35 /
  // 0.4; Origin 0.6 / 0.7 / 0.8). Blueprint copies the X, never the growth. After Regigigas.
  giratina: {
    name: 'giratina', poke_sprite391: sprite('Gen04', 8, 3, [9, 3]),
    config: { extra: { shadow_Xmult: 1, Xmult_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card'], poke_after: 'regigigas',
    /** The view's form (systems/anim.js view_card): live, so a Dialga / Palkia bought, sold or debuffed redraws it at once. */
    poke_view_form(self, card) { return origin_forme() ? 'origin' : 'altered'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.shadow_Xmult), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod), origin_forme() ? 'Origin Forme' : 'Altered Forme'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.remove_playing_cards && !context.blueprint && (context.removed || []).length) {
        ex.shadow_Xmult = r3(ex.shadow_Xmult + shadow_gain(card) * context.removed.length);
        card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.shadow_Xmult), colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.shadow_Xmult > 1) return { message: a_xmult(r3(ex.shadow_Xmult)), colour: 'XMULT', Xmult_mod: ex.shadow_Xmult };
      return undefined;
    },
  },
  // Arceus 493, Multitype (Colorless): counts as EVERY Pokermon type for type checks and synergies (center.poke_multitype: systems/
  // types.js is_type / find_pokemon_type, energy.js energy_matches): Barboach's Water / Earth Jokers (once), Starly's Colorless flock,
  // Pachirisu's Lightning Jokers, Corsola / Pelipper's find_pokemon_type, and every type's Energy matches it at full strength. Its own
  // ptype stays Colorless (get_type, badge, Kecleon); a Tera sticker gives it that one type instead, as on any joker. Its type never
  // breaks Monotype (poke_mono_exempt, Castform's exemption: it would match any lock). Judgment: X(1 + 0.25 per different type among
  // your Jokers), itself counting as one type (multitype_count: at most 12, X4). Energy: `Xmult_mod` +20% (0.25 -> 0.3 / 0.35 / 0.4).
  // After Shaymin Sky (492).
  arceus: {
    name: 'arceus', poke_sprite391: sprite('Gen04', 4, 4, [5, 4]),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'shaymin_sky',
    poke_multitype: true, poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.Xmult_mod), multitype_count(card), multitype_x(card)] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = multitype_x(card);
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },

  // ---------------------------------------------------------------- Cresselia 488 (Psychic, Gen 4)
  // The owner's design (2026-10-28). Legendary $20. Lunar Blessing: while you have it (undebuffed), your playing cards can't be debuffed —
  // by a Boss Blind (The Goad / Head / Club / Window / Plant / Pillar / Verdant Leaf...) or anything else (a mod's debuff_card, an
  // SMODS.debuff_card source): systems/rules.js set_debuff answers 'prevent_debuff', which Card:set_debuff lets win outright, Urshifu's
  // Unseen Fist rule. Gaining / losing it re-runs the debuff pass at once (lunar_refresh). Jokers can still be debuffed (Crimson Heart),
  // Cresselia included. And X1.5 Mult (`Xmult`, Energy +20%: 1.8 / 2.1 / 2.4); the blessing is fixed.
  // Pokermon+'s Darkrai: no rule between them. Darkrai never debuffs playing cards (it brings a Nightmare and lends held Energy), so the
  // blessing has nothing to block; Darkrai's held-Energy energizing reaches Cresselia like any Psychic joker (a held Psychic Energy
  // raises its X1.5), and it can't raise the blessing. Neither Nacho nor Pokermon+ has Cresselia. Art: upstream 3.9.1 (Natdex {14,32}).
  cresselia: {
    name: 'cresselia', poke_sprite391: sprite('Natdex', 14, 32, [15, 32]),
    config: { extra: { Xmult: 1.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'debuff'], poke_after: 'giratina',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    add_to_deck() { lunar_refresh(); },
    remove_from_deck() { lunar_refresh(); },
  },

  // ---------------------------------------------------------------- Phione 489 / Manaphy 490 (Water, Gen 4)
  // The owner's design (2026-10-28). Legendary $20 each. Phione: each Water Joker (itself included) gives +6 Mult (`mult`, Energy +40%:
  // 8.4 / 10.8 / 13.2). Manaphy, Sea Guardian: each Water Joker (itself included) gives X1.2 Mult (`Xmult_multi`, the per-joker X as
  // Blaziken's, Energy +5%: 1.26 / 1.32 / 1.38); Egg: at the end of each shop, with a free Joker slot, a 1 in 4 chance (seeded) to create
  // a Phione (manaphy_egg). Both use the other_joker context (Baseball Card's: each Water Joker shows its own bonus): is_type, so a Tera
  // sticker counts (and a Water joker with another Tera doesn't); a debuffed joker gives nothing. Not families: Phione never evolves.
  // Neither Nacho nor Pokermon+ has them. Art: upstream 3.9.1's own cells with their floating souls (Natdex {16,32} / {18,32}).
  phione: {
    name: 'phione', poke_sprite391: sprite('Natdex', 16, 32, [17, 32]),
    config: { extra: { mult: 6 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['mult', 'types', 'joker'], poke_after: 'cresselia',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const n = sea_count(card); return { vars: [r3(card.ability.extra.mult), n, r3(card.ability.extra.mult * n)] }; },
    calculate(self, card, context) {
      if (context.other_joker && sea_joker(context.other_joker)) {
        const m = r3(card.ability.extra.mult);
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: a_mult(m), colour: 'MULT', mult_mod: m };
      }
      return undefined;
    },
  },
  manaphy: {
    name: 'manaphy', poke_sprite391: sprite('Natdex', 18, 32, [19, 32]),
    config: { extra: { Xmult_multi: 1.2, num: 1, dem: 4 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'chance', 'generation'], poke_after: 'phione',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'manaphy_egg'), n = sea_count(card);
      return { vars: [r3(ex.Xmult_multi), num, dem, n, r3(Math.pow(ex.Xmult_multi, n))] };
    },
    calculate(self, card, context) {
      manaphy_egg(card, context);
      if (context.other_joker && sea_joker(context.other_joker)) {
        const x = r3(card.ability.extra.Xmult_multi);
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
      }
      return undefined;
    },
  },
}, FILE);

/** The families (functions/pokefamily.lua style): index.js adds them with set_family. */
export const DESIGN_FAMILIES = [
  ['shinx', 'luxio', 'luxray'],
  ['honedge', 'doublade', 'aegislash'],
  ['spheal', 'sealeo', 'walrein'],
  ['grookey', 'thwackey', 'rillaboom'],
  ['scorbunny', 'raboot', 'cinderace'],
  ['sobble', 'drizzile', 'inteleon'],
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
  ['barboach', 'whiscash'],
  ['starly', 'staravia', 'staraptor'],
  ['cherubi', 'cherrim'],
  ['burmy', 'wormadam', 'mothim'],
  ['glameow', 'purugly'],
  ['drifloon', 'drifblim'],
  ['combee', 'vespiquen'],
  ['shellos', 'gastrodon'],
  ['stunky', 'skuntank'],
  ['gible', 'gabite', 'garchomp'],
  ['hippopotas', 'hippowdon'],
  ['skorupi', 'drapion'],
  ['finneon', 'lumineon'],
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
const FORECAST_NOTE = ['{C:inactive,s:0.8}(Normal again after the round;', '{C:inactive,s:0.8}its type never breaks Monotype;', '{C:inactive,s:0.8}Kyogre / Groudon lock its weather)'];
const MUDDY = ['{C:attention}Muddy Water:{} {C:chips}+#1#{} Chips for', 'each {X:poke_water,C:white}Water{} or {X:poke_earth,C:white}Earth{} Joker', '{C:inactive}(Itself included)',
  '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:chips}+#3#{C:inactive} Chips)'];
const FLOCK = ['{C:attention}Flock:{} {C:mult}+#1#{} Mult for each', '{X:poke_colorless,C:white}Colorless{} Joker {C:inactive}(Itself included)',
  '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)'];
const DRIFT_CHARGE = ['{C:attention}Stockpile:{} each discard gains', '{C:attention}1{} Stockpile {C:inactive}(once per discard,', '{C:inactive}not per card; max #2#)',
  '{C:inactive}(Currently {C:attention}#1#{C:inactive}/#2# Stockpile)', STOCK_ENERGY];
const SPIT_UP = ['{C:attention}Spit Up:{} on the final hand of', 'the round, {X:mult,C:white} X1 {} Mult plus {X:mult,C:white} X#3# {}', 'per Stockpile, then the', 'Stockpile resets to {C:attention}0{}',
  '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive} Mult)', '{C:inactive,s:0.8}(Nothing with 0 Stockpile)'];
const AFTERMATH = ['{C:attention}Aftermath:{} when this Joker is', 'sold or destroyed, create a', '{C:dark_edition}Negative{} {C:spectral}Spectral{} card', '{C:inactive}(Not when it transforms)'];
const HONEY = ['{C:attention}Honey Gather:{} at end of', 'round, the Jokers directly left', 'and right of this one each', 'gain {C:money}$#1#{} of sell value'];
const COMMANDER = ['{C:attention}Commander:{} the leftmost', '{X:poke_water,C:white}Water{} Joker gives'];
const CLASH = (n) => ['{C:attention}Primal Clash:{} with {C:attention}Kyogre{} and', '{C:attention}Groudon{} and no {C:attention}Rayquaza{}, the', "round's first deal picks one:", 'more {C:clubs}Clubs{} held, Kyogre; more', '{C:hearts}Hearts{} + {C:diamonds}Diamonds{}, Groudon', '{C:inactive}(a tie: more Energy, else Kyogre)', 'The other does nothing that round', '{C:inactive}(#' + n + '#)'];
const EON = (p) => ['{C:attention}Soul Dew:{} with {C:attention}' + p + '{}, every', '{C:tarot}Tarot{} or {C:planet}Planet{} used', 'grows both of them', '{C:inactive}(Soul Dew: #3#)'];
const CLOAKED = (name, c, type) => ['{C:attention}Cloaked:{} ' + name + ' Cloak, {X:poke_' + c + ',C:white}' + type + '{}', '{C:inactive}(kept from Burmy, for good)'];
const TWO_SEAS = (n) => ['{C:attention}Two Seas:{} with a {C:attention}West{} and an', '{C:attention}East{} Shellos or Gastrodon, each', 'works on both end cards', '{C:inactive}(Two Seas: #' + n + '#)'];
const REGI_TRIO = (enh, n) => ['{C:attention}Regi Trio:{} when a {C:attention}Blind{} is', 'selected, {C:attention}#' + n + '#{} random card(s) in', 'your deck become {C:attention}' + enh + '{} cards',
  '{C:inactive}(+1 for each other Regi)'];
const SWEET_SEEDS = ['{C:attention}Sweet Seeds:{} when a {C:attention}Blind{}', 'is selected, a random unenhanced', 'card in your deck becomes a', '{C:attention}Seed{} card',
  '{C:attention}+#1#{} growth level {C:inactive}(Seeds bloom', '{C:inactive}in 3 scores instead of 5)'];
const FLOWER_GIFT = ['{C:attention}Flower Gift:{} {C:attention}Flower{} cards', 'need only {C:attention}#2#+{} suits'];
const SUNSHINE = ['{C:poke_sun}Sunshine Form:{} while sunny,', '{C:attention}Flower{} cards give {X:mult,C:white} X#3# {}', 'Mult instead of {X:mult,C:white} X2 {}',
  '{C:inactive}(Sunny: {C:hearts}Hearts{C:inactive}+{C:diamonds}Diamonds{C:inactive} held most', '{C:inactive}on the round\'s first deal,', '{C:inactive}or {C:attention}Groudon{C:inactive} held)'];
const FICKLE = (gain, n) => ['{C:attention}Fickle:{} picks a new favourite', 'suit each round', 'Scored cards of its favourite', 'suit each give ' + gain, '{C:inactive}(Favourite: {V:1}#' + n + '#{C:inactive})'];
const POISON_GAS = (name, by, nth) => ['{C:attention}' + name + ':{} after ' + (nth ? 'your {C:attention}nth{}' : 'each'), (nth ? 'hand this round' : 'hand you play') + ', the Blind\'s', 'requirement drops by ' + by, 'of its starting requirement',
  '{C:inactive}(Never the hand that scored;', '{C:inactive}reach it and the Blind is won)', '{C:inactive}(Max -#2#% a Blind; this Blind: {C:attention}-#3#%{C:inactive})'];
const BITE = ['{C:attention}Bite:{} when a hand containing', 'a {C:attention}Pair{} scores, permanently', 'gains {C:mult}+#2#{} Mult for each', 'scored card', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)'];
const SAND_STREAM = ['{C:poke_sand}Sand Stream:{} scored', '{C:attention}Stone{} cards give', '{C:chips}+#1#{} extra Chips'];
const SNIPER = ['{C:attention}Sniper:{} each scored card', 'has a {C:green}#1# in #2#{} chance to', 'crit for {X:mult,C:white} X#3# {} Mult'];
const LAKE_GUARDIANS = (x, n) => ['{C:attention}Lake Guardians:{} plus {X:mult,C:white} X#' + x + '# {}', 'to its X Mult for each other', '{C:attention}Uxie{}, {C:attention}Mesprit{} or {C:attention}Azelf{} held', '{C:inactive}(Currently #' + n + '#/2 others)'];
const LIBERO_MULT = ['{C:red}+#1#{} discard', '{C:mult}+#2#{} Mult for each', 'remaining {C:attention}discard{}', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)'];
const UNSCORED_CHIPS = ['{C:chips}+#1#{} hand', 'Each played card that', 'doesn\'t score gives', '{C:chips}+#2#{} Chips'];
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
    j_poke_scorbunny: { name: 'Scorbunny', text: [...LIBERO_MULT, EVOLVES_ROUNDS(4)] },
    j_poke_raboot: { name: 'Raboot', text: [...LIBERO_MULT, EVOLVES_ROUNDS(4)] },
    j_poke_cinderace: { name: 'Cinderace', text: ['{C:red}+#1#{} discard', '{C:attention}Libero:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each', 'remaining {C:attention}discard{}', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_sobble: { name: 'Sobble', text: [...UNSCORED_CHIPS, EVOLVES_ROUNDS(3)] },
    j_poke_drizzile: { name: 'Drizzile', text: [...UNSCORED_CHIPS, EVOLVES_ROUNDS(3)] },
    j_poke_inteleon: { name: 'Inteleon', text: ['{C:chips}+#1#{} hand', '{C:attention}Snipe Shot:{} the', 'highest-ranked scored card', 'gives {X:mult,C:white} X#2# {} Mult', '{C:inactive}(A tie: the leftmost)'] },
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
    j_poke_barboach: { name: 'Barboach', text: [...MUDDY, EVOLVES_ROUNDS(4)] },
    j_poke_whiscash: { name: 'Whiscash', text: [
      MUDDY,
      ['{C:attention}Earthquake:{} with at least {C:attention}#4#{}', 'other {X:poke_water,C:white}Water{} or {X:poke_earth,C:white}Earth{} Jokers,', 'the first hand of each round', 'retriggers every scored card', '{C:inactive}(#5#)'],
    ] },
    j_poke_starly: { name: 'Starly', text: [...FLOCK, EVOLVES_ROUNDS(4)] },
    j_poke_staravia: { name: 'Staravia', text: [...FLOCK, EVOLVES_ROUNDS(4)] },
    j_poke_staraptor: { name: 'Staraptor', text: [
      ['{C:attention}Brave Bird:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each {X:poke_colorless,C:white}Colorless{} Joker', '{C:inactive}(Itself included)',
        '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'],
      ['{C:attention}Recoil:{} lose {C:money}$#2#{} each', 'hand played', '{C:inactive,s:0.8}(Never past your debt limit)'],
    ] },
    j_poke_drifloon: { name: 'Drifloon', text: [
      DRIFT_CHARGE,
      [...SPIT_UP, '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#6#{C:inactive,s:0.8} Spit Ups)', '{C:inactive,s:0.8}(Spit Ups: #5#/#6#)'],
    ] },
    j_poke_drifblim: { name: 'Drifblim', text: [DRIFT_CHARGE, SPIT_UP, AFTERMATH] },
    j_poke_combee: { name: 'Combee', text: [...HONEY, '{C:inactive,s:0.8}(Energy carries to Vespiquen)', EVOLVES_ROUNDS(2)] },
    j_poke_vespiquen: { name: 'Vespiquen', text: [
      HONEY,
      ['{C:attention}Attack Order:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each {C:money}$1{} of sell', 'value of the Jokers directly', 'left and right of this one',
        '{C:inactive}(Max {X:mult,C:white} X#3# {C:inactive})', '{C:inactive}(Currently {C:money}$#4#{C:inactive}: {X:mult,C:white} X#5# {C:inactive} Mult)',
        '{C:inactive,s:0.8}(Blueprint copies only the X)'],
    ] },
    j_poke_shellos: { name: 'Shellos', text: [
      ['{C:attention}Tide Pool:{} {C:chips}+#1#{} Chips on the', '{C:attention}#2#{}', '{C:inactive}(#3#: rolled once when created)'],
      [...TWO_SEAS(4), EVOLVES_ROUNDS(5)],
    ] },
    j_poke_gastrodon: { name: 'Gastrodon', text: [
      ['{C:attention}Tide:{} retrigger the', '{C:attention}#2#{},', '{C:chips}+#1#{} Chips per trigger', '{C:inactive}(#3#, kept from Shellos)'],
      ['{C:attention}Storm Drain:{} gains {X:mult,C:white} X#5# {} Mult', 'each time you use an {C:poke_pink}Energy{}', 'card, {X:mult,C:white} X#6# {} for {X:poke_water,C:white}Water{} Energy', '{C:inactive}(Currently {X:mult,C:white} X#7# {C:inactive} Mult)'],
      TWO_SEAS(4),
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
    j_poke_lunatone: { name: 'Lunatone', text: [
      ['{C:attention}Moonlight:{} {X:mult,C:white} X#1# {} Mult', 'on {C:attention}night{} hands', '{C:inactive}(each round\'s 2nd and 4th hands)'],
      ['{C:attention}Cosmic Power:{} with {C:attention}Solrock{},', 'also {X:mult,C:white} X#2# {} Mult on {C:attention}day{} hands', '{C:inactive}(Next hand: {C:attention}#3#{C:inactive})', '{C:inactive}(Cosmic Power: {C:attention}#4#{C:inactive})'],
    ] },
    j_poke_solrock: { name: 'Solrock', text: [
      ['{C:attention}Sunlight:{} {C:chips}+#1#{} Chips', 'on {C:attention}day{} hands', '{C:inactive}(each round\'s 1st, 3rd and 5th hands)'],
      ['{C:attention}Cosmic Power:{} with {C:attention}Lunatone{},', 'also {C:chips}+#2#{} Chips on {C:attention}night{} hands', '{C:inactive}(Next hand: {C:attention}#3#{C:inactive})', '{C:inactive}(Cosmic Power: {C:attention}#4#{C:inactive})'],
    ] },
    j_poke_mudbray: { name: 'Mudbray', text:['{C:chips}+#1#{} Chips', '{C:attention}Stamina:{} gains {C:chips}+#2#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round', '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)', EVOLVES_ROUNDS(3)] },
    j_poke_mudsdale: { name: 'Mudsdale', text: [
      ['{C:attention}Stamina:{} gains {C:chips}+#1#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round'],
      ['{C:attention}Mud Spit:{} the first unscored', 'card in each played hand', 'becomes a {C:attention}Stone{} card', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'],
    ] },
    j_poke_regirock: { name: 'Regirock', text: [
      ['{C:attention}Stone Body:{} {C:attention}Stone{} cards give', '{C:chips}+#1#{} Chips instead of {C:chips}+50{}', 'and permanently gain', '{C:chips}+#2#{} Chips each time they score'],
      REGI_TRIO('Stone', 3),
    ] },
    j_poke_regice: { name: 'Regice', text: [
      ['{C:attention}Ice Body:{} {C:attention}Glass{} cards', 'never shatter'],
      [...REGI_TRIO('Glass', 1), '{C:inactive,s:0.8}(Each Energy: +1 card)'],
    ] },
    j_poke_registeel: { name: 'Registeel', text: [
      ['{C:attention}Iron Body:{} {C:attention}Steel{} cards held', 'in hand give {X:mult,C:white} X#1# {} Mult', 'instead of {X:mult,C:white} X1.5 {}'],
      REGI_TRIO('Steel', 2),
    ] },
    j_poke_latias: { name: 'Latias', text: [
      ['{C:attention}Mist Ball:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:tarot}Tarot{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
      EON('Latios'),
    ] },
    j_poke_latios: { name: 'Latios', text: [
      ['{C:attention}Luster Purge:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:planet}Planet{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
      EON('Latias'),
    ] },
    j_poke_kyogre: { name: 'Kyogre', text: [
      ['{C:attention}Primordial Sea:{} {C:chips}+#1#{} hand', 'each round', 'Every scored {C:clubs}Club{}', 'retriggers once', '{C:attention}Castform{} is always {C:poke_rain}Rainy{}'],
      CLASH(2),
    ] },
    j_poke_groudon: { name: 'Groudon', text: [
      ['{C:attention}Desolate Land:{} {C:red}+#1#{} discard', 'each round', 'Scored {C:hearts}Hearts{} and {C:diamonds}Diamonds{}', 'each give {X:mult,C:white} X#2# {} Mult', '{C:attention}Castform{} is always {C:poke_sun}Sunny{}'],
      CLASH(3),
    ] },
    j_poke_rayquaza: { name: 'Rayquaza', text: [
      ['{C:attention}Delta Stream:{} {C:attention}Kyogre{} and', '{C:attention}Groudon{} both work every round', '{C:inactive}(no Primal Clash; Castform reads', '{C:inactive}the weather as usual)'],
      ['{C:attention}Dragon Ascent:{} gains {X:mult,C:white} X#2# {} Mult', 'when a played hand contains', 'a {C:attention}Straight{} or a {C:attention}Flush{}', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
    ] },
    j_poke_cherubi: { name: 'Cherubi', text: [
      SWEET_SEEDS,
      ['{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} of your Seeds', '{C:inactive,s:0.8}bloom into Flowers)', '{C:inactive,s:0.8}(Bloomed: #2#/#3#)',
        '{C:inactive,s:0.8}(Energy also raises Cherrim\'s', '{C:inactive,s:0.8}Sunshine Flowers: X#4#)'],
    ] },
    j_poke_cherrim: { name: 'Cherrim', text: [SWEET_SEEDS, FLOWER_GIFT, [...SUNSHINE, '{C:inactive}(Currently {C:attention}Overcast{C:inactive})']] },
    j_poke_cherrim_sunshine: { name: 'Cherrim', text: [SWEET_SEEDS, FLOWER_GIFT, [...SUNSHINE, '{C:inactive}(Currently {C:poke_sun}Sunshine{C:inactive})']] },
    j_poke_chatot: { name: 'Chatot', text: [
      ['{C:attention}Vocabulary:{} {C:mult}+#1#{} Mult for each', 'different {C:attention}poker hand{} played', 'this run', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)'],
      ['{C:attention}New Word:{} the first time each', '{C:attention}poker hand{} is played this run,', 'create its {C:planet}Planet{} card', '{C:inactive}(Must have room)'],
    ] },
    j_poke_pachirisu: { name: 'Pachirisu', text: [
      ['{C:attention}Quick Spark:{} the first hand', 'of each round gives {X:mult,C:white} X#1# {} Mult', '{C:attention}Nuzzle:{} plus {X:mult,C:white} X#2# {} for each', 'other {X:poke_lightning,C:black}Lightning{} Joker',
        '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive}, #4#)'],
      ['{C:attention}Cheek Pouch:{} earn {C:money}$#5#{} for each', '{X:poke_lightning,C:black}Lightning{} Joker at end of round', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:money}$#6#{C:inactive})'],
    ] },
    j_poke_glameow: { name: 'Glameow', text: [...FICKLE('{C:mult}+#1#{} Mult', 2), EVOLVES_ROUNDS(3), '{C:inactive,s:0.8}(Needs a free Joker slot to evolve)'] },
    j_poke_purugly: { name: 'Purugly', text: [
      ['{C:attention}Thick Fat:{} {C:red}-#2#{} Joker slot'],
      FICKLE('{X:mult,C:white} X#1# {} Mult', 3),
    ] },
    j_poke_stunky: { name: 'Stunky', text: [...POISON_GAS('Poison Gas', '{C:attention}#1#%{}'), EVOLVES_ROUNDS(4)] },
    j_poke_skuntank: { name: 'Skuntank', text: [...POISON_GAS('Toxic', '{C:attention}n x #1#%{}', true), '{C:inactive}(#1#%, then #4#%, then #5#%...;', '{C:inactive}next hand: {C:attention}-#6#%{C:inactive})'] },
    j_poke_gible: { name: 'Gible', text: [...BITE, '{C:inactive}(Evolves at {C:mult}+#1#{C:inactive} / +#3# Mult)'] },
    j_poke_gabite: { name: 'Gabite', text: [
      BITE,
      ['{C:attention}Treasure Nest:{} when a hand', 'containing a {C:attention}Full House{} scores,', 'one of its scored cards', 'becomes a {C:attention}Gold{} card',
        '{C:inactive}(Unenhanced cards first)', '{C:inactive}(Evolves with {C:attention}#3#{C:inactive} Gold cards in deck)', '{C:inactive}(Gold cards: #4#/#3#)'],
    ] },
    j_poke_garchomp: { name: 'Garchomp', text: [
      ['{C:mult}+#1#{} Mult {C:inactive}(banked by Bite)'],
      ['{C:attention}Dragon Rush:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each {C:attention}Gold{} card', 'held in hand',
        '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'],
    ] },
    j_poke_hippopotas: { name: 'Hippopotas', text: [...SAND_STREAM, EVOLVES_ROUNDS(2)] },
    j_poke_hippowdon: { name: 'Hippowdon', text: [
      SAND_STREAM,
      ["On each round's first deal, 1", 'random {C:attention}unenhanced{} card held', 'in hand becomes a {C:attention}Stone{} card'],
    ] },
    j_poke_skorupi: { name: 'Skorupi', text: [...SNIPER, EVOLVES_ROUNDS(4)] },
    j_poke_drapion: { name: 'Drapion', text: [...SNIPER, '{C:attention}Lucky{} cards always crit'] },
    j_poke_carnivine: { name: 'Carnivine', text: [
      '{C:attention}Flytrap:{} the first card you', 'discard each round is', 'devoured ({C:red}destroyed{}) and', 'permanently adds {C:mult}+#2#{} Mult',
      '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult; #3#)',
    ] },
    j_poke_finneon: { name: 'Finneon', text: [
      '{C:chips}+#1#{} Chips on {C:attention}night{} hands', '{C:inactive}(each round\'s 2nd and 4th hands)', '{C:inactive}(Next hand: {C:attention}#2#{C:inactive})', EVOLVES_ROUNDS(3),
    ] },
    j_poke_lumineon: { name: 'Lumineon', text: [
      ['On {C:attention}night{} hands, each scored', 'card gives {C:chips}+#1#{} Chips', '{C:inactive}(each round\'s 2nd and 4th hands)'],
      ['With {C:attention}Lunatone{}, on {C:attention}day{} hands too', '{C:inactive}(Next hand: {C:attention}#2#{C:inactive})', '{C:inactive}(Lunatone: {C:attention}#3#{C:inactive})'],
    ] },
    j_poke_burmy: { name: 'Burmy', text: [
      ['{C:attention}Cloak:{} at end of round, takes', 'the cloak most common in your', 'full deck: {C:attention}Stone{} (Sandy), {C:attention}Steel{}', '(Trash), or everything else (Plant)', '{C:inactive}(A tie keeps the cloak)'],
      ['{C:attention}Plant{} {X:poke_grass,C:white}Grass{}: {C:mult}+#1#{} Mult', '{C:inactive}(any card not Stone or Steel)', '{C:attention}Sandy{} {X:poke_earth,C:white}Earth{}: {C:chips}+#2#{} Chips {C:inactive}(Stone)',
        '{C:attention}Trash{} {X:poke_metal,C:white}Metal{}: earn {C:money}$#3#{} at end', 'of round {C:inactive}(Steel)'],
      ['{C:inactive}(Currently {C:attention}#4#{C:inactive} Cloak, #5#)', '{C:inactive,s:0.8}(Its type never breaks Monotype)', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#6#{C:inactive,s:0.8} rounds:', '{C:inactive,s:0.8}♀ into Wormadam, ♂ into Mothim)'],
    ] },
    j_poke_wormadam: { name: 'Wormadam', text: [CLOAKED('Plant', 'grass', 'Grass'), ['Each scored {C:attention}unenhanced{}', 'card gives {C:mult}+#1#{} Mult']] },
    j_poke_wormadam_sandy: { name: 'Wormadam', text: [CLOAKED('Sandy', 'earth', 'Earth'), ['Each scored {C:attention}Stone{} card', 'gives {X:mult,C:white} X#2# {} Mult']] },
    j_poke_wormadam_trash: { name: 'Wormadam', text: [CLOAKED('Trash', 'metal', 'Metal'), ['Each {C:attention}Steel{} card held in hand', 'at end of round earns {C:money}$#3#{}']] },
    j_poke_mothim: { name: 'Mothim', text: [
      '{C:attention}Free Flight:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each different', 'enhancement in your full deck',
      '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)', '{C:inactive,s:0.8}(Bonus, Mult, Wild, Glass, Steel,', '{C:inactive,s:0.8}Stone, Gold, Lucky, Seed, Flower)',
    ] },
    j_poke_dialga: { name: 'Dialga', text: ['{C:attention}Roar of Time:{} the first hand', 'of each round is scored twice:', 'every scored card', 'retriggers once', '{C:inactive}(#1#)'] },
    j_poke_palkia: { name: 'Palkia', text: ['{C:attention}Spacial Rend:{} {C:dark_edition}+#1#{} Joker slot', 'and {C:attention}+#2#{} hand size'] },
    j_poke_regigigas: { name: 'Regigigas', text: [
      ['{C:attention}Slow Start:{} gives nothing for', 'its first {C:attention}5{} rounds, then', '{X:mult,C:white} X#1# {} Mult for the rest of the run', 'Each {C:attention}Regi{} you have cuts',
        '{C:attention}1{} more round off the wait', 'at each end of round', '{C:inactive}(With all three Regis:', '{C:inactive}wakes after 1 round)', '{C:inactive}(#4#)'],
      ['{C:attention}Regi Trio:{} while awake, with', '{C:attention}Regirock{}, {C:attention}Regice{} and {C:attention}Registeel{},', 'each of them converts', '{C:attention}1{} more card per Blind'],
    ] },
    j_poke_giratina: { name: 'Giratina', text: [
      ['{C:attention}Shadow Force:{} gains {X:mult,C:white} X#2# {} Mult', 'each time a playing card', 'is destroyed', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'],
      ['{C:attention}Origin Forme:{} with {C:attention}Dialga{} or', '{C:attention}Palkia{}, gains {X:mult,C:white} X#3# {} instead', '{C:inactive}(#4#)'],
    ] },
    j_poke_arceus: { name: 'Arceus', text: [
      ['{C:attention}Multitype:{} counts as', 'every {C:attention}type{}', '{C:inactive,s:0.8}(Its type never breaks Monotype)'],
      ['{C:attention}Judgment:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each different', '{C:attention}type{} among your Jokers', '{C:inactive}(Itself counts as one)',
        '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {X:mult,C:white} X#3# {C:inactive} Mult)'],
    ] },
    j_poke_uxie: { name: 'Uxie', text: [
      ['{C:purple}+#1# Foresight', '{C:attention}Knowledge:{} each {C:attention}Foreseen{}', 'card gives {X:mult,C:white} X#2# {} Mult', '{C:inactive}(scored like a held card)'],
      [...LAKE_GUARDIANS(3, 4), '{C:inactive}(Currently {X:mult,C:white} X#5# {C:inactive} a card)'],
    ] },
    j_poke_mesprit: { name: 'Mesprit', text: [
      ['{C:attention}Emotion:{} {X:mult,C:white} X#1# {} Mult, or', '{X:mult,C:white} X#2# {} if the {C:attention}poker hand{}', 'hasn\'t been played yet', 'this round'],
      [...LAKE_GUARDIANS(3, 4), '{C:inactive}(Currently {X:mult,C:white} X#5# {C:inactive} / {X:mult,C:white} X#6# {C:inactive})'],
    ] },
    j_poke_azelf: { name: 'Azelf', text: [
      ['{C:attention}Willpower:{} {X:mult,C:white} X#1# {} Mult on the', 'final hand of each round'],
      [...LAKE_GUARDIANS(2, 3), '{C:inactive}(Currently {X:mult,C:white} X#4# {C:inactive})'],
    ] },
    j_poke_cresselia: { name: 'Cresselia', text: [
      ['{C:attention}Lunar Blessing:{} while you', 'have this Joker, playing cards', 'can\'t be {C:attention}debuffed{}', '{C:inactive}(Boss Blinds or anything else)'],
      ['{X:mult,C:white} X#1# {} Mult'],
    ] },
    j_poke_phione: { name: 'Phione', text: ['Each {X:poke_water,C:white}Water{} Joker', 'gives {C:mult}+#1#{} Mult', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#2#{C:inactive}: {C:mult}+#3#{C:inactive} Mult)'] },
    j_poke_manaphy: { name: 'Manaphy', text: [
      ['{C:attention}Sea Guardian:{} each', '{X:poke_water,C:white}Water{} Joker gives {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Itself included)', '{C:inactive}(Currently {C:attention}#4#{C:inactive}: {X:mult,C:white} X#5# {C:inactive} Mult)'],
      ['{C:attention}Egg:{} at the end of the shop,', 'if you have a free Joker slot,', '{C:green}#2# in #3#{} chance to', 'create a {C:attention}Phione{}'],
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
