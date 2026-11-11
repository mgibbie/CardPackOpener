// designs/gen4.js — the owner's Generation 4 Pokermon jokers and the helpers only they use, cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another
// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);
// a NEW joker is just added to JOKERS below and registers after them.
import {
  G, ease_poke_dollars, card_eval_status_text, localize, create_card, is_type, P_CENTERS, pseudoseed, pseudorandom_element, P_CENTER_POOLS, level_evo,
  can_evolve, emit, scale_card, has_enhancement, pseudorandom_probability, get_probability_vars, find_card, get_type, multitype, wildcard_type,
  POKETYPES, add_card, type_tooltip, scaling_evo, detailed, pseudorandom, juice_card_until,
} from '../../api.js';
import * as BN from '../../../../js/engine/bignum.js';
import { number_format } from '../../../../js/engine/core.js';
import {
  BURMY_CLOAKS, CASTFORM_FORMS, REGIS, a_chips, a_mult, a_xmult, aftermath, cherrim_sunny, cosmic, final_hand, first_deal, forecast, foreseen,
  gender_name, giga_awake, hive, honey_gather, is_day, next_is_day, r3, recoil, round_end, scry, scry_tip, seed_tips, set_cloak, solo59, spark_on,
  spark_state, sprite, stock_max, sweet_growth, typed_joker, unbroken,
} from './common.js';

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
const drift_vars = (ex, evo) => [ex.stockpile, stock_max(ex), r3(ex.spit_Xmult), spit_x(ex), ex.spit_ups || 0, evo];

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
/** Vespiquen's Attack Order: the neighbours' current sell value ($, card.sell_cost) and X(1 + Xmult_mod per $), capped at Xmult_cap. */
const hive_value = (card) => hive(card).reduce((s, j) => s + (j.sell_cost || 0), 0);
const attack_order_x = (card) => r3(Math.min(card.ability.extra.Xmult_cap, 1 + card.ability.extra.Xmult_mod * hive_value(card)));
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
/** Mothim's Free Flight counts these enhancements: the 8 vanilla ones and Pokermon's Seed and Flower (not Hazard: a cost, not
 *  an enhancement anyone builds toward; not the April Fools Ludicolo). */
export const MOTHIM_ENHANCEMENTS = ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky', 'm_poke_seed', 'm_poke_flower'];
/** The different enhancements (of MOTHIM_ENHANCEMENTS) the full deck holds, by each card's own enhancement. */
export const distinct_enhancements = (cards) => new Set((cards || []).map((c) => c.config && c.config.center && c.config.center.key).filter((k) => MOTHIM_ENHANCEMENTS.includes(k))).size;
const free_flight_x = (card) => r3(1 + card.ability.extra.Xmult_mod * distinct_enhancements(G.playing_cards));

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
const cherrim_form = (card) => (cherrim_sunny(card) ? 'sunshine' : 'overcast');
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
/** Giratina's Origin Forme (contentRev 59, solo): for good once ORIGIN_AT (10) playing cards have been destroyed while it was held
 *  (`destroyed`, counted on the card under every rules rev). Before r59: while an undebuffed Dialga or Palkia was held (find_card). */
export const ORIGIN_AT = 10;
const origin_old = () => !!(G.jokers && (find_card('j_poke_dialga').length > 0 || find_card('j_poke_palkia').length > 0));
const origin_forme = (card) => (solo59() ? (card.ability.extra.destroyed || 0) >= ORIGIN_AT : origin_old());
/** Shadow Force's gain per destroyed playing card: Xmult_mod, doubled in the Origin Forme (one energy field scales both). */
const shadow_gain = (card) => r3(card.ability.extra.Xmult_mod * (origin_forme(card) ? 2 : 1));
/** The destroyed cards, one at a time: each gains at the forme it finds, then counts (so the 10th gains Altered, the 11th Origin). */
function shadow_force(card, n) {
  const ex = card.ability.extra;
  for (let i = 0; i < n; i++) {
    ex.shadow_Xmult = r3(ex.shadow_Xmult + shadow_gain(card));
    ex.destroyed = (ex.destroyed || 0) + 1;
  }
}
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
/** Regigigas, Slow Start (contentRev 59, solo): it wakes at the end of round `giga_wait` (5 rounds, 1 sooner for every 5 Stone, Glass or
 *  Steel cards in the full deck by each card's own enhancement, at least 1) of the rounds it has been held (`giga_rounds`, counted on the
 *  card under every rules rev). Read live: a deck that grows mid-wait shortens it at once. Awake is for good (`slow_start` 0). */
const GIGA_ENH = ['m_stone', 'm_glass', 'm_steel'];
export const giga_deck = () => (G.playing_cards || []).filter((c) => unbroken(c) && GIGA_ENH.includes(c.config.center.key)).length;
export const giga_wait = () => Math.max(1, 5 - Math.floor(giga_deck() / 5));
/** Creator (contentRev 59): while awake, when a Blind is selected, 1 random card of the full deck (the run's seeded stream: unenhanced
 *  cards first, else any card that isn't Stone, Glass or Steel already; none, nothing) becomes Stone, Glass or Steel (seeded too).
 *  Blueprint copies it (as the Regis' conversion). */
function giga_create(card, context) {
  if (!context.setting_blind || !solo59() || !giga_awake(card) || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const live = (G.playing_cards || []).filter(unbroken);
  const plain = live.filter((c) => c.config.center.key === 'c_base');
  const pool = plain.length ? plain : live.filter((c) => !GIGA_ENH.includes(c.config.center.key));
  if (!pool.length) return;
  const [pick] = pseudorandom_element(pool, pseudoseed('regigigas'));
  const [enh] = pseudorandom_element(GIGA_ENH, pseudoseed('regigigas_enh'));
  pick.set_ability(P_CENTERS[enh], null, true);
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 ' + { m_stone: 'Stone', m_glass: 'Glass', m_steel: 'Steel' }[enh], colour: 'CHIPS' });
}
/** Regigigas before r59: the distinct Regi species held (undebuffed; two Regices count once) — each cut a round off the wait,
 *  and all three woke it at the next end of round (giga_drop). */
const regis_distinct = () => new Set(((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && REGIS.includes(j.config.center.key)).map((j) => j.config.center.key)).size;
/** One end of round's cut to the Slow Start countdown `left` with `n` distinct Regis held: 1 + n, or all of it with the full trio. */
const giga_drop = (left, n) => (n >= 3 ? left : 1 + n);
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
export const LAKE_CAP = 2;
export function lake_others(card) {
  // contentRev 59 (solo): each OTHER Psychic Joker (is_type: Arceus and a Psychic Tera count, a debuffed one doesn't; a twin guardian
  // is a Psychic Joker too), at most LAKE_CAP (2), the same +X per other.
  if (solo59()) return Math.min(LAKE_CAP, ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && typed_joker(j, 'Psychic')).length);
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

export const JOKERS = {


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
  // of each round (final_hand, Drifloon's check). Lake Guardians: each one's X values get +X0.25 for each OTHER Psychic Joker held,
  // undebuffed, at most 2 (lake_others; contentRev 59, the owner's solo rule: it counted the other guardian species before) — with two:
  // Uxie X1.8 per Foreseen card, Mesprit X2 / X3, Azelf X3.
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
  // Regigigas 486, Slow Start (Colorless): asleep (it gives nothing) until it wakes, then X4 Mult for the rest of the run. contentRev 59
  // (the owner's solo rule; the Regis cut the wait before): it wakes at the end of the round that makes `giga_rounds` (rounds held: the
  // main end_of_round pass; not Blueprint; a debuffed Regigigas isn't calculated, so it waits) reach giga_wait: 5, 1 round sooner for every
  // 5 Stone, Glass or Steel cards in the full deck, at least 1 (read live). Creator: while awake, when a Blind is selected, 1 random card
  // in the deck (unenhanced first) becomes Stone, Glass or Steel (giga_create, seeded). Energy: `Xmult` +20% of base (X4 -> X4.8 / X5.6 /
  // X6.4); the wait is fixed (`slow_start`, no energy field). Blueprint copies the X (and Creator) only when awake.
  // After Palkia (Pokermon has no Heatran 485).
  regigigas: {
    name: 'regigigas', poke_sprite391: sprite('Natdex', 10, 32, [11, 32]),
    config: { extra: { Xmult: 4, slow_start: 5, giga_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'full_deck', 'modify_card'], poke_after: 'palkia',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_glass); info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra, wait = giga_wait(), left = Math.max(0, wait - (ex.giga_rounds || 0));
      return { vars: [r3(ex.Xmult), giga_deck(), wait, giga_awake(card) ? 'Awake!' : left > 0 ? 'Asleep: ' + left + ' left' : 'Asleep: wakes at end of round'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      giga_create(card, context);
      if (round_end(context) && !context.blueprint) ex.giga_rounds = (ex.giga_rounds || 0) + 1;
      if (round_end(context) && !context.blueprint && !giga_awake(card)) {
        if (solo59()) ex.slow_start = ex.giga_rounds >= giga_wait() ? 0 : giga_wait() - ex.giga_rounds;
        else ex.slow_start = Math.max(0, ex.slow_start - giga_drop(ex.slow_start, regis_distinct()));
        card_eval_status_text(card, 'extra', null, null, null, giga_awake(card) ? { message: 'Awake!', colour: 'XMULT' } : { message: 'Slow Start: ' + ex.slow_start, colour: 'FILTER' });
        return undefined;
      }
      if (context.joker_main && giga_awake(card)) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      return undefined;
    },
  },
  // Giratina 487, Shadow Force (Psychic): permanently gains X0.25 Mult for each playing card destroyed, by any cause (the
  // remove_playing_cards context every destroying path sends: Glass shattering, Hanged Man, Gulpin's swallow, a discard eaten...),
  // banked in `shadow_Xmult` (no energy field; never retroactive). Origin Forme (contentRev 59, the owner's solo rule; it needed a
  // Dialga or Palkia before): for good once 10 playing cards have been destroyed while it is held (`destroyed`, on the card; the 10th
  // still gains Altered), its gain is doubled (X0.5) and it shows the Origin card (poke_view_form). Energy: the gain `Xmult_mod` +20% (0.25 -> 0.3 / 0.35 /
  // 0.4; Origin 0.6 / 0.7 / 0.8). Blueprint copies the X, never the growth. After Regigigas.
  giratina: {
    name: 'giratina', poke_sprite391: sprite('Gen04', 8, 3, [9, 3]),
    config: { extra: { shadow_Xmult: 1, Xmult_mod: 0.25, destroyed: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card'], poke_after: 'regigigas',
    /** The view's form (systems/anim.js view_card): from the card's own count (before r59: live from a Dialga / Palkia). */
    poke_view_form(self, card) { return origin_forme(card) ? 'origin' : 'altered'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.shadow_Xmult), r3(ex.Xmult_mod), r3(2 * ex.Xmult_mod), origin_forme(card) ? 'Origin Forme' : 'Destroyed: ' + Math.min(ORIGIN_AT, ex.destroyed || 0) + '/' + ORIGIN_AT] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.remove_playing_cards && !context.blueprint && (context.removed || []).length) {
        if (solo59()) shadow_force(card, context.removed.length);
        else { ex.shadow_Xmult = r3(ex.shadow_Xmult + shadow_gain(card) * context.removed.length); ex.destroyed = (ex.destroyed || 0) + context.removed.length; }
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
};
