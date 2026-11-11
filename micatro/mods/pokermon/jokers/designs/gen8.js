// designs/gen8.js — the owner's Generation 8 Pokermon jokers and the helpers only they use, cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another
// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);
// a NEW joker is just added to JOKERS below and registers after them.
import {
  G, localize, scale_card, type_tooltip, scaling_evo, level_evo, change_shop_size, has_enhancement, P_CENTERS, card_eval_status_text, pseudoseed,
  pseudorandom_element, is_type, ease_hands_played, get_probability_vars, pseudorandom, has_no_rank, apply_type_sticker, faint_baby_poke, ALOLA_REV,
  play_sound, find_card, ease_dollars, poke_drain, detailed,
} from '../../api.js';
import * as BN from '../../../../js/engine/bignum.js';
import { calculate_reroll_cost } from '../../../../js/engine/core.js';
import { rulesRev } from '../../../../js/mods/pins.js';
import {
  THERIAN_AT, a_chips, a_mult, a_xmult, ancient_count, ancient_tip, bank, cotton_guard, discards, first_deal, grudge_main, guard_on, hand_size, hands,
  legends, lucky_procs, lucky_scored, r3, r9, round_end, round_forecast, sand_spit, scry, scry_tip, seed_tips, shop_rerolls, snipe_target,
  snow_warning, sprite, steel_in_deck, stone_scored, sweet_growth, unbroken, unused_hands, x_main,
} from './common.js';

const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

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

/** The Gen 8 starters (contentRev 49). Scorbunny / Raboot, Libero's warm-up: +mult for each discard left when the hand scores (the
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

// ---------------------------------------------------------------- Gen 8, batch 1 (contentRev 70; the owner's "yes", 2026-11-02), #821-847
/** Rookidee line, Flying Taxi: $taxi_money at end of round (calc_dollar_bonus: a row of the cash-out list, as Purrloin; fixed, no Energy; a
 *  Blueprint never copies it, as Golden Joker). */
const taxi_money = (card) => card.ability.extra.taxi_money;
/** Corviknight: +card_slots shop card slot while owned (Overstock's change_shop_size, Dudunsparce's add / remove pair: a debuffed one lends
 *  none). Taken back when it leaves, but never below 1 shop slot (the engine's own floor: a shop is never empty). */
const shop_slot = {
  add_to_deck(self, card) { change_shop_size(card.ability.extra.card_slots); },
  remove_from_deck(self, card) {
    const n = Math.min(card.ability.extra.card_slots, Math.max(0, ((G.GAME.shop && G.GAME.shop.joker_max) || 1) - 1));
    if (n > 0) change_shop_size(-n);
  },
};
/** Dottler / Orbeetle: each Foreseen card (G.scry_view, the top of the deck, scored like a held card: Patrat's / Uxie's moment) gives +mult
 *  (Dottler) or X Xmult_multi (Orbeetle); a debuffed one gives nothing. The Foresight itself is the Shinx line's `scry` pair. */
function foreseen_score(card, context, x) {
  if (!(context.individual && context.cardarea === G.scry_view && !context.end_of_round && !context.other_card.debuff)) return undefined;
  return x ? { x_mult: card.ability.extra.Xmult_multi, card } : { mult: card.ability.extra.mult, card };
}
/** Gossifleur / Eldegoss, Cotton Down: each scored card that is a Seed when the hand is played gives +mult. A Seed that blooms while it
 *  scores (Shiftry / Cherubi growth) still counts: the Seed card's growth runs before the jokers read it, so the hand's Seeds are marked in
 *  `before` (poke_seed_hand = this hand's number) — a Blueprint copy reads the same marks. */
const seed_scored = (c) => has_enhancement(c, 'm_poke_seed') || c.poke_seed_hand === G.GAME.hands_played;
function cotton_down(card, context) {
  if (context.before && context.scoring_hand) {
    for (const c of context.scoring_hand) if (has_enhancement(c, 'm_poke_seed')) c.poke_seed_hand = G.GAME.hands_played;
    return undefined;
  }
  if (context.individual && context.cardarea === G.play && !context.end_of_round && seed_scored(context.other_card)) return { mult: card.ability.extra.mult, card };
  return undefined;
}
/** When a Blind is selected, ONE random unenhanced card of the full deck (the run's seeded pseudorandom_element on `seed`) takes `enh` —
 *  Cherubi's sweet_seeds with its own stream, for Eldegoss (Seed) and the Rolycoly line (Stone, Marble Joker's shape on a deck card). None
 *  unenhanced: nothing (it never overwrites another enhancement). Blueprint copies it (a second card). */
function blind_convert(card, context, enh, seed, message) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed(seed));
  pick.set_ability(P_CENTERS[enh], null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message, colour: enh === 'm_stone' ? 'CHIPS' : 'GREEN' });
}
/** How many scores a fresh Seed needs to bloom now (5 growth, 1 + growth level a score). */
const bloom_scores = () => Math.ceil(5 / (1 + Math.max(0, (G.GAME && G.GAME.poke_growth_level) || 0)));
/** Chewtle / Drednaw: the Water Jokers, itself included (Barboach's / Cutiefly's count: is_type, undebuffed; a Water Tera counts). */
const water_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Water')).length + 1;
/** THE HOUSE SANDSTORM (Gen 8 batch 1): is it a sandstorm? While an undebuffed Sandaconda is held, every round is (live: bought or sold, it
 *  changes at once; in the shop too). The weather check future sand jokers read, beside the sun (cherrim_sunny) and the rain
 *  (swift_swim_raining). Castform has no sand form: the sandstorm never changes its forecast. Flygon's "Sandstorm" and the Hippopotas
 *  line's "Sand Stream" are move names; they neither make nor read it. */
export const is_sandstorm = () => legends('sandaconda').length > 0;
/** Sandaconda r73 (the owner's: it keeps Silicobra's Sand Spit, its own num / dem, the same roll). Moves recorded before r73 (js/mods/pins.js
 *  RULES) never roll it, so a run from then replays as recorded. */
const sand_spit73 = () => rulesRev('pokermon') >= 73;
/** Cramorant, Gulp Missile: the round's FIRST discard (a player's: pre_discard, not a hook, with no discard used yet; once a round,
 *  `load_round`) loads the missile; the next hand that scores fires it (joker_main: X Xmult, a Blueprint copy too; spent in `after`). A
 *  debuffed hand doesn't score, so it doesn't fire. Unfired at the end of the round: lost. Loaded, it shows its Gulping Form card. */
function gulp_missile(card, context) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && G.GAME.current_round.discards_used === 0 && ex.load_round !== G.GAME.round) {
    ex.load_round = G.GAME.round;
    ex.missile = true;
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Gulp!', colour: 'XMULT' });
    return undefined;
  }
  if (context.joker_main && ex.missile) {
    if (!context.blueprint) ex.firing = true;
    return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
  }
  if (context.after && !context.blueprint && ex.firing) { ex.firing = false; ex.missile = false; return undefined; }
  if (round_end(context) && !context.blueprint) { ex.missile = false; ex.firing = false; }
  return undefined;
}
/** Arrokuda / Barraskewda, Propeller Tail: the FIRST scored card (scoring_hand[0] by position, Crabrawler's rule: a debuffed one there gives
 *  nothing and the next isn't promoted; a retrigger of it gives again). */
function propeller_tail(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.scoring_hand && context.other_card === context.scoring_hand[0])) return undefined;
  return x ? { x_mult: card.ability.extra.Xmult_multi, card } : { mult: card.ability.extra.mult, card };
}

// ---------------------------------------------------------------- Gen 8, batch 2 (contentRev 71; the owner's "go ahead with batch 2", 2026-11-02), #848-861
/** Toxtricity's form, Amped or Low Key: rolled when OBTAINED (Glameow's rule: in add_to_deck, never on creation, so a shop / collection card
 *  never moves the seeded stream), 50 / 50 on the run's seeded 'toxtricity_form'. Held on card.ability (not ability.extra): Steamodded's
 *  set_ability keeps ability fields the new center doesn't set, so it rides through copies, and a Toxel evolving into it rolls it right then
 *  (set_ability runs the new center's add_to_deck). The unobtained card says "(Form: rolled when obtained)". */
export const TOX_FORMS = ['amped', 'lowkey'];
export const tox_form = (card) => (TOX_FORMS.includes(card.ability.poke_tox_form) ? card.ability.poke_tox_form : null);
function tox_roll(card) {
  if (!tox_form(card)) card.ability.poke_tox_form = pseudorandom(pseudoseed('toxtricity_form')) < 0.5 ? 'amped' : 'lowkey';
}
/** Toxtricity: Amped (Punk Rock) X Xmult on a hand of exactly 5 PLAYED cards (full_hand: the kickers count, scoring doesn't matter); Low Key
 *  +chips for each card fewer than 5 played (1 card: 4 x). Both numbers are energy fields, so Energy raises the form it doesn't have too. */
function punk_rock(card, context) {
  if (!context.joker_main) return undefined;
  const n = (context.full_hand || G.play.cards).length, ex = card.ability.extra, f = tox_form(card);
  if (f === 'amped' && n === 5) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
  if (f === 'lowkey' && n < 5) { const c = r3(ex.chips * (5 - n)); return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
  return undefined;
}
/** Sizzlipede / Centiskorch, Fire Spin: Carnivine's Flytrap (the round's FIRST player discard: pre_discard, no hook, discards_used 0, once a
 *  round, `burn_round`; its LEFTMOST card) destroyed in its own discard pass ({ remove: true }: dissolved, a Glass card shatters, every
 *  joker's remove_playing_cards runs). Its own mark list (poke_burned_by), so a Carnivine and a Sizzlipede (or two Sizzlipedes) on the same
 *  card each take it — the card is destroyed once, each joker banks. Sizzlipede banks +mult_mod Mult (`burn_mult`), Centiskorch X Xmult_mod
 *  (`burn_Xmult`, from X1) and keeps scoring the Mult it carried. Not Blueprint (the burn / gain); a Blueprint copies the score. */
function fire_spin(card, context, x) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker && context.full_hand && context.full_hand.length
    && G.GAME.current_round.discards_used === 0 && ex.burn_round !== G.GAME.round) {
    ex.burn_round = G.GAME.round;
    const c = context.full_hand[0];
    c.poke_burned_by = (c.poke_burned_by || []).concat([card]);
    return undefined;
  }
  if (context.discard && !context.blueprint && context.other_card && context.other_card.poke_burned_by && context.other_card.poke_burned_by.includes(card)) {
    const c = context.other_card;
    c.poke_burned_by = c.poke_burned_by.filter((j) => j !== card);
    if (!c.poke_burned_by.length) c.poke_burned_by = undefined;
    if (x) ex.burn_Xmult = r3(ex.burn_Xmult + ex.Xmult_mod);
    else ex.burn_mult = r3(ex.burn_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Fire Spin!', colour: 'MULT' });
    return { remove: true };
  }
  return undefined;
}
const burn_state = (card) => (G.GAME && G.GAME.facing_blind && (G.GAME.current_round.discards_used > 0 || card.ability.extra.burn_round === G.GAME.round) ? 'burned this round' : 'ready');
/** Clobbopus / Grapploct, Octolock: the ranks of the hand's SCORED cards (the scoring hand's undebuffed ranked cards: a Stone card has none,
 *  a debuffed one doesn't score) and the cards HELD in hand that share one (undebuffed, ranked). */
const scored_ranks = (context) => new Set((context.scoring_hand || []).filter((c) => !c.debuff && !has_no_rank(c)).map((c) => c.get_id()));
const octo_held = (c, ranks) => !c.debuff && !has_no_rank(c) && ranks.has(c.get_id());
/** Sinistea / Polteageist, Phony or Antique: rolled when OBTAINED (Glameow's rule, as Toxtricity), Antique num in dem (1 in 10, FIXED: a trait,
 *  not a chance effect, so Oops! All 6s / Absol never touch it), the run's seeded 'sinistea_antique'; on card.ability, so it rides through
 *  evolution. Antique doubles the X (derived: one energy field, `Xmult`, scales both). */
export const tea_form = (card) => (card.ability.poke_tea === 'antique' || card.ability.poke_tea === 'phony' ? card.ability.poke_tea : null);
function tea_roll(card) {
  if (!tea_form(card)) card.ability.poke_tea = pseudorandom(pseudoseed('sinistea_antique')) < card.ability.extra.num / card.ability.extra.dem ? 'antique' : 'phony';
}
const tea_x = (card) => r3(card.ability.extra.Xmult * (tea_form(card) === 'antique' ? 2 : 1));
const tea_state = (card) => (tea_form(card) === 'antique' ? 'Antique!' : tea_form(card) === 'phony' ? 'Phony' : 'rolled when obtained');
/** The Hatenna line: the Psychic Jokers, itself included (Chewtle's count: is_type, undebuffed; a Psychic Tera and Arceus count). */
const psychic_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Psychic')).length + 1;
/** Hatterene, Magic Powder: when a Blind is selected (once a round), the Joker directly to its RIGHT gets a Psychic Tera sticker
 *  (apply_type_sticker: a non-Pokémon joker takes one too) unless it is already Psychic (is_type: its type, a Psychic Tera, Arceus). Nothing
 *  at the row's right end. Not Blueprint; a debuffed Hatterene isn't calculated, so it converts nothing. */
function magic_powder(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced) return;
  const row = G.jokers.cards, right = row[row.indexOf(card) + 1];
  if (!right || right.getting_sliced || is_type(right, 'Psychic')) return;
  apply_type_sticker(right, 'Psychic');
  right.set_debuff && right.set_debuff();
  card_eval_status_text(right, 'extra', null, null, null, { message: localize('poke_tera_ex'), colour: 'Spectral' });
}
const prank_recost = {
  add_to_deck() { G.E_MANAGER.add_event(() => { calculate_reroll_cost(true); }); },
  remove_from_deck() { G.E_MANAGER.add_event(() => { calculate_reroll_cost(true); }); },
};
const prank_state = () => (G.STATE === G.STATES.SHOP ? (shop_rerolls() === 0 ? 'free reroll ready' : 'used this shop') : 'ready next shop');

// ---------------------------------------------------------------- Gen 8, batch 3 (contentRev 72; the owner's "yes build it", 2026-11-02), #862-902
/** Alcremie's 63 forms (Sweet x Cream): upstream 3.9.1 draws every one on the Gen 8 sheet, UNLISTED beside its own card {10,0} (Strawberry
 *  Sweet, Vanilla Cream): sweet-major, nine creams each, in reading order ({10,0} {12,0} {14,0}, then rows 1-7 x 0-14, then row 8 x 0-6). */
export const ALCREMIE_SWEETS = ['Strawberry', 'Berry', 'Love', 'Star', 'Clover', 'Flower', 'Ribbon'];
export const ALCREMIE_CREAMS = ['Vanilla Cream', 'Ruby Cream', 'Matcha Cream', 'Mint Cream', 'Lemon Cream', 'Salted Cream', 'Ruby Swirl', 'Caramel Swirl', 'Rainbow Swirl'];
const alcremie_form = (card) => { const f = card.ability.extra.form; return Number.isInteger(f) && f >= 0 && f < 63 ? f : 0; };
const alcremie_name = (card) => { const f = alcremie_form(card); return ALCREMIE_SWEETS[Math.floor(f / 9)] + ' Sweet, ' + ALCREMIE_CREAMS[f % 9]; };
/** Milcery / Alcremie, Decorate: each scored card with an edition (any: Foil, Holographic, Polychrome, a mod's) gives +mult. */
function decorate(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && context.other_card.edition) return { mult: card.ability.extra.mult, card };
  return undefined;
}
/** Alcremie, Whipped Cream: when a Blind is selected, ONE random card of the full deck with no edition (the run's seeded pseudorandom_element,
 *  'poke_alcremie_cream') becomes Foil or Holographic (a seeded coin, 'poke_alcremie_topping'). None without an edition: nothing (it never
 *  overwrites one). Blueprint copies it (a second card), as blind_convert. */
function whipped_cream(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && !c.edition);
  if (!plain.length) return;
  const [pick] = pseudorandom_element(plain, pseudoseed('poke_alcremie_cream'));
  const holo = pseudorandom(pseudoseed('poke_alcremie_topping')) < 0.5;
  pick.set_edition(holo ? { holo: true } : { foil: true }, true, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: holo ? 'Holographic!' : 'Foil!', colour: 'DARK_EDITION' });
}
/** Falinks, Formation: every scored card shares one suit (is_suit, its suit read through a debuff: a Wild card fits any, a Stone card has
 *  none and breaks it; Smeared Joker joins red / black as usual). */
const SUITS4 = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const in_formation = (cards) => !!(cards && cards.length) && SUITS4.some((s) => cards.every((c) => c.is_suit(s, true)));
/** Pincurchin, Lightning Rod: Lightning Energy cards used this run (the engine's run-long consumeable_usage, from the run's start: a late
 *  buy counts every one; whatever it was used on, or nothing energized). */
const lightning_used = () => (((G.GAME && G.GAME.consumeable_usage) || {}).c_poke_lightning_energy || {}).count || 0;
const pincurchin_x = (card) => r9(1 + card.ability.extra.Xmult_mod * lightning_used());
/** Snom / Frosmoth: a Glass card. */
const glass_scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_glass'));
const glass_held = (context) => !!(context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_glass'));
/** Eiscue, Ice Face: X(Xmult) while its ice holds (form 'ice'); X(Xmult2) once broken (form 'noice', Noice Face's card). The ice breaks
 *  when the round's FIRST hand doesn't beat the Blind (in `after`, the hand's total added to the round's chips is still below the Blind's
 *  requirement: the round goes on); once a round at most, not a Blueprint's. It re-forms on the first deal of the next round whose
 *  forecast (round_forecast, Castform's) is Snowy. */
const eiscue_broken = (card) => card.ability.extra.form === 'noice';
function ice_face(card, context) {
  const ex = card.ability.extra;
  if (first_deal(card, context, 'snow_round')) {
    ex.snow_round = G.GAME.round;
    // (regional batch A: an Alolan Ninetales's Snow Warning makes every round snowy, so the ice re-forms then too — a move recorded on an
    // older rev reads the forecast alone, as it did)
    if (eiscue_broken(card) && (round_forecast() === 'snowy' || (rulesRev('pokermon') >= ALOLA_REV && snow_warning()))) {
      ex.form = 'ice';
      card_eval_status_text(card, 'extra', null, null, null, { message: 'Ice Face!', colour: '#8fd8ff' });
    }
    return undefined;
  }
  if (context.joker_main) { const x = eiscue_broken(card) ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
  if (context.after && !context.blueprint && !context.retrigger_joker && !eiscue_broken(card) && G.GAME.facing_blind && G.GAME.current_round.hands_played === 0
    && BN.lt(BN.add(G.GAME.chips, G.GAME.last_hand_total || 0), G.GAME.blind.chips)) {
    ex.form = 'noice';
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Noice Face!', colour: 'XMULT' });
  }
  return undefined;
}
/** Indeedee: its gender, rolled when it is OBTAINED (add_to_deck, if none yet: Salandit's moment, the run's seeded 'indeedee_gender', 50/50;
 *  kept on ability.extra.gender). ♂: X(Xmult) and +card_limit consumable slot (Slurpuff's pair: while held AND undebuffed). ♀: each Tarot
 *  used earns $tarot_money (fixed; its `Xmult` is dropped when it rolls ♀, so it takes no Energy). */
const indeedee_gender = (card) => (card.ability.extra.gender === 'male' || card.ability.extra.gender === 'female' ? card.ability.extra.gender : null);
/** Morpeko, Hunger Switch: Full Belly +mult / Hangry X(Xmult), switching after EVERY hand played (in `after`, a debuffed hand too; not a
 *  Blueprint's), carried across rounds (and through save / resume: ability.extra.form). A new Morpeko starts Full Belly. */
const morpeko_hangry = (card) => card.ability.extra.form === 'hangry';
/** Obstagoon, Blocking: a Boss Blind whose ability is on (not disabled, not suspended) while any of your playing cards (the full deck) or
 *  Jokers is debuffed. Read live when it scores. */
const boss_debuffing = () => {
  const GM = G.GAME, b = GM && GM.blind;
  if (!GM || !GM.facing_blind || !b || !b.boss || b.off) return false;
  return (G.playing_cards || []).some((c) => c.debuff) || ((G.jokers && G.jokers.cards) || []).some((j) => j.debuff);
};
/** Cursola, Perish Body: it crumbles (destroyed: start_dissolve, so "a Joker is destroyed" counts it) at the end of its `perish_rounds`th
 *  round held (counted from its evolution, the round it evolved in included; the main end_of_round pass, so a debuffed one doesn't count
 *  down; not a Blueprint's). An Eternal one never crumbles. */
function perish_body(card, context) {
  const ex = card.ability.extra;
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  ex.perish_rounds = Math.max(0, ex.perish_rounds - 1);
  if (ex.perish_rounds > 0 || card.ability.eternal || card.getting_sliced) {
    if (ex.perish_rounds > 0) card_eval_status_text(card, 'extra', null, null, null, { message: ex.perish_rounds + ' left', colour: 'FILTER' });
    return;
  }
  card.getting_sliced = true;
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Crumbled!', colour: 'RED' });
  G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.start_dissolve(); });
}
/** Sirfetch'd, Meteor Assault: the Lucky hits this round while it is held (Farfetch'd's count, jokers/pokejokers_03.js: a card hitting both
 *  rolls counts 2; not a Blueprint's copy); X(1 + Xmult_mod per hit) when it scores. */
const meteor_count = (card) => { const ex = card.ability.extra; return G.GAME && ex.lucky_round === G.GAME.round ? (ex.lucky_count || 0) : 0; };
function meteor_assault(card, context) {
  const ex = card.ability.extra;
  if (lucky_scored(context) && !context.blueprint) { const n = meteor_count(card); ex.lucky_round = G.GAME.round; ex.lucky_count = n + lucky_procs(context.other_card); return undefined; }
  if (context.joker_main && meteor_count(card) > 0) { const x = r9(1 + ex.Xmult_mod * meteor_count(card)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
  return undefined;
}
const rime_state = () => {
  const GM = G.GAME, b = GM && GM.blind;
  if (!GM || !GM.facing_blind || !b || !b.boss) return 'Boss Blinds only';
  if (b.suspended && GM.current_round.hands_left <= 1) return 'active this hand';
  return 'on your final hand';
};
const jokers_gone = () => (G.GAME && G.GAME.poke_jokers_gone) || 0;
/** The Galar fossils, Ancient Jacks (Kabuto's / Tirtouga's cumulative tiers by the Jacks in the scoring hand): one body each. */
const JACK = 11;
const jacks = (context) => ancient_count(context, JACK);
const is_jack = (c) => !!c && !has_no_rank(c) && c.get_id() === JACK;
const first_jack = (context) => (context.scoring_hand || []).find(is_jack);

// ---------------------------------------------------------------- Gen 8, batch 4: the Gen 8 Legendaries (contentRev 74; the owner's "Yes", 2026-11-03)
/** Zacian / Zamazenta / Eternatus count the Boss Blinds beaten while held (the main end_of_round pass with beat_boss, Beast Boost's moment:
 *  not on a game over, not a Blueprint's, not a joker retrigger; a debuffed one isn't calculated, so that Boss doesn't count). The count
 *  lives on the card (`crown_bosses`, capped at CROWN_AT; Eternatus's `bosses`), so save / resume / replay rebuild the forms from it. */
const boss_beaten = (context) => !!(round_end(context) && context.beat_boss && !context.game_over && !context.blueprint && !context.retrigger_joker);
export const CROWN_AT = 3;
export const crowned = (card) => (card.ability.extra.crown_bosses || 0) >= CROWN_AT;
const crown_state = (card, form) => (crowned(card) ? form : 'Boss Blinds: ' + (card.ability.extra.crown_bosses || 0) + '/' + CROWN_AT);
/** Zacian / Zamazenta: +1 to the count for each Boss Blind beaten, until crowned (the 3rd Boss crowns it: the next hand pays the crown).
 *  `on_crown` runs once, at that moment. Returns true on the end-of-round pass it counted on. */
function crown_tick(card, context, word, on_crown) {
  if (!boss_beaten(context) || crowned(card)) return false;
  const ex = card.ability.extra;
  ex.crown_bosses = (ex.crown_bosses || 0) + 1;
  if (crowned(card)) {
    if (on_crown) on_crown(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: word + '!', colour: 'GOLD' });
  } else card_eval_status_text(card, 'extra', null, null, null, { message: ex.crown_bosses + '/' + CROWN_AT, colour: 'FILTER' });
  return true;
}
/** Zamazenta, Crowned Shield: its +hands become `crowned_hands` IN ALL (+2, not +1 +2): the difference is added to the round's hands now
 *  (round_resets: the next round has them) and `hands` is raised, so the +hands pair (Squirtle's) takes the full 2 back when it leaves. */
function shield_crown(card) {
  const ex = card.ability.extra, d = ex.crowned_hands - ex.hands;
  if (d <= 0) return;
  G.GAME.round_resets.hands = G.GAME.round_resets.hands + d;
  ex.hands = ex.crowned_hands;
}
/** Eternatus, Dynamax: each Boss Blind beaten banks +Xmult_mod on `eterna_Xmult` (from X1; never retroactive). Eternamax for good from the
 *  ETERNAMAX_AT-th Boss (counted in `bosses`): its X is the bank x ETERNAMAX_X (both fixed), and the bank keeps growing, so each later Boss
 *  adds twice the gain to what it scores. The Boss that makes it Eternamax banks first, then doubles. */
export const ETERNAMAX_AT = 5;
export const ETERNAMAX_X = 2;
export const eternamax = (card) => (card.ability.extra.bosses || 0) >= ETERNAMAX_AT;
export const eterna_x = (card) => r9((card.ability.extra.eterna_Xmult || 1) * (eternamax(card) ? ETERNAMAX_X : 1));
/** Zarude, Jungle Drain: when a Blind is selected (not a Blueprint's: a copy would drain twice), each OTHER Joker loses `drain` of sell
 *  value (Pokermon's Drain, Lampent's: poke_drain one way, never below $1; one already at $1 gives nothing); +Xmult_mod banked per $1
 *  actually drained (`jungle_Xmult` from X1). Debuffed Jokers are drained too, as Lampent's. */
function jungle_drain(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced) return false;
  let n = 0;
  for (const j of G.jokers.cards.slice()) {
    if (j === card || j.getting_sliced || !(j.sell_cost > 1)) continue;
    const before = j.sell_cost;
    poke_drain(card, j, card.ability.extra.drain, true);
    n += Math.max(0, before - j.sell_cost);
  }
  if (n > 0) bank(card, 'jungle_Xmult', 'Xmult_mod', n, 'XMULT');
  return true;
}
/** Regidrago, Dragon Energy: X(Xmult) on the round's first hand, X`drago_step` less for each hand already played this round
 *  (current_round.hands_played while scoring: the hands before this one), never below X1. */
const drago_x = (card) => { const ex = card.ability.extra, hp = (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0; return Math.max(1, r9(ex.Xmult - ex.drago_step * hp)); };
/** Calyrex, Bountiful Harvest: the Flower cards in the full deck (each card's own enhancement: bloomed Seeds). */
const flowers = () => (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'm_poke_flower').length;
const harvest_x = (card) => r9(1 + card.ability.extra.Xmult_mod * flowers());
/** ... and when a Blind is selected, ONE random unenhanced card of the full deck becomes a Seed (the Cherubi line's Sweet Seeds, its own
 *  seed 'poke_calyrex_seeds'; none unenhanced, nothing: it never overwrites). Blueprint copies it (as Marble Joker). */
function bountiful_harvest(card, context) {
  if (!context.setting_blind || card.getting_sliced || (context.blueprint_card && context.blueprint_card.getting_sliced)) return false;
  const plain = (G.playing_cards || []).filter((c) => unbroken(c) && c.config.center.key === 'c_base');
  if (!plain.length) return true;
  const [pick] = pseudorandom_element(plain, pseudoseed('poke_calyrex_seeds'));
  pick.set_ability(P_CENTERS.m_poke_seed, null, true);
  G.E_MANAGER.add_event(() => { pick.juice_up(); });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: '+1 Seed', colour: 'GREEN' });
  return true;
}
/** Enamorus's Therian clock (the Forces of Nature's: THERIAN_AT rounds held, counted on the card in the main end_of_round pass; not a
 *  Blueprint's; a debuffed one isn't calculated, so that round doesn't count). Its own reader: a new joker never takes the pre-r59 partner rule. */
const enamorus_therian = (card) => (card.ability.extra.therian_rounds || 0) >= THERIAN_AT;
function enamorus_tick(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker) return false;
  const ex = card.ability.extra, was = enamorus_therian(card);
  ex.therian_rounds = (ex.therian_rounds || 0) + 1;
  if (!was && enamorus_therian(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Therian Forme!', colour: 'FILTER' });
  return true;
}
const enamorus_state = (card) => { const k = Math.max(0, THERIAN_AT - (card.ability.extra.therian_rounds || 0)); return enamorus_therian(card) ? 'Therian Forme' : 'Therian in ' + k + (k === 1 ? ' round' : ' rounds'); };

export const JOKERS = {

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

  // ---------------------------------------------------------------- Gen 8 starters (contentRev 49; the starters spec, 2026-10-28)
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


  // The owner's Gen 8 batch 1 ("yes", 2026-11-02): 20 jokers, #821-847, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 /
  // S $8, single-stage R $7); evolution by rounds (4 for the 3-stage Basics, else 5). Types = the cards' (pokermon_art_type.mjs). Energy raises
  // the main number at the standard share; money, slots, hands / discards, Foresight, conversions and odds are fixed; a stage with no number
  // of its own carries its evolution's ("Energy carries to ..."). Art: upstream 3.9.1's own cells (Natdex {20,54}-{12,56}; Cramorant Gen 8
  // {0,0}, its Gulping Form {2,0} beside it, systems/anim.js GEN8_FORM_SPRITES); nothing to deploy. Neither Nacho nor Pokermon+ has any.
  // Pokédex order: Rookidee ... Orbeetle (821-826) after Inteleon, before Nickit; Gossifleur ... Drednaw (829-834) after Thievul, before
  // Yamper; Rolycoly ... Barraskewda (837-847) after Boltund, before Dreepy.
  //
  // Rookidee 821 (Colorless, Uncommon $6), Flying Taxi: earn $1 at end of round (`taxi_money`, fixed). Carries Corviknight's `Xmult` (1.5:
  // "Energy carries to Corviknight"). 4 rounds.
  rookidee: {
    name: 'rookidee', poke_sprite391: sprite('Natdex', 20, 54),
    config: { extra: { taxi_money: 1, Xmult: 1.5, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 8, blueprint_compat: false,
    attributes: ['money', 'economy', 'round_evo'], poke_after: 'inteleon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.taxi_money, ex.rounds, r3(ex.Xmult)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_corvisquire'); },
    calc_dollar_bonus(self, card) { return taxi_money(card); },
  },
  // Corvisquire 822 (Safari $8): $2 at end of round; carries Corviknight's `Xmult`. 5 rounds.
  corvisquire: {
    name: 'corvisquire', poke_sprite391: sprite('Natdex', 22, 54),
    config: { extra: { taxi_money: 2, Xmult: 1.5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 8, blueprint_compat: false,
    attributes: ['money', 'economy', 'round_evo'], poke_after: 'rookidee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.taxi_money, ex.rounds, r3(ex.Xmult)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_corviknight'); },
    calc_dollar_bonus(self, card) { return taxi_money(card); },
  },
  // Corviknight 823 (Metal: its card; Safari $10): $2 at end of round, X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4) and +1 shop card slot
  // (`card_slots`, fixed; shop_slot). Blueprint copies the X only.
  corviknight: {
    name: 'corviknight', poke_sprite391: sprite('Natdex', 24, 54),
    config: { extra: { taxi_money: 2, Xmult: 1.5, card_slots: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Metal', gen: 8, blueprint_compat: true,
    attributes: ['money', 'economy', 'xmult', 'shop'], poke_after: 'corvisquire',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.taxi_money, r3(ex.Xmult), ex.card_slots] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    calc_dollar_bonus(self, card) { return taxi_money(card); },
    ...shop_slot,
  },
  // Blipbug 824 (Grass: its card; Uncommon $6): +1 Foresight (`scry`, fixed). Carries Dottler's `mult` (4: "Energy carries to Dottler").
  // 4 rounds.
  blipbug: {
    name: 'blipbug', poke_sprite391: sprite('Natdex', 26, 54),
    config: { extra: { scry: 1, mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Grass', gen: 8, blueprint_compat: false,
    attributes: ['foresight', 'round_evo'], poke_after: 'corviknight',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.rounds, r3(ex.mult)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_dottler'); },
    ...scry,
  },
  // Dottler 825 (Psychic: its card; Safari $8): +2 Foresight; each Foreseen card gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  dottler: {
    name: 'dottler', poke_sprite391: sprite('Natdex', 28, 54),
    config: { extra: { scry: 2, mult: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['foresight', 'mult', 'round_evo'], poke_after: 'blipbug',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return foreseen_score(card, context, false) || level_evo(self, card, context, 'j_poke_orbeetle'); },
    ...scry,
  },
  // Orbeetle 826 (Safari $10): +3 Foresight; each Foreseen card gives X1.15 (`Xmult_multi` +5%: 1.2075 / 1.265 / 1.3225).
  orbeetle: {
    name: 'orbeetle', poke_sprite391: sprite('Natdex', 0, 55),
    config: { extra: { scry: 3, Xmult_multi: 1.15 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['foresight', 'xmult'], poke_after: 'dottler',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return foreseen_score(card, context, true); },
    ...scry,
  },
  // Gossifleur 829 (Grass, Common $5), Cotton Down: each scored Seed card gives +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  gossifleur: {
    name: 'gossifleur', poke_sprite391: sprite('Natdex', 6, 55),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'thievul',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_seed); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return cotton_down(card, context) || level_evo(self, card, context, 'j_poke_eldegoss'); },
  },
  // Eldegoss 830 (Safari $8): Cotton Down kept (`mult` +40%); Cotton Spore: when a Blind is selected a random unenhanced deck card becomes a
  // Seed (blind_convert, 'poke_eldegoss_seeds'); and +1 growth level while owned (Cherubi's sweet_growth: `growth`, fixed; it STACKS with
  // Cherubi / Cherrim / Shiftry / Brambleghast: +1 each, so a Seed blooms in 3 scores with one, 2 with two).
  eldegoss: {
    name: 'eldegoss', poke_sprite391: sprite('Natdex', 8, 55),
    config: { extra: { mult: 4, growth: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'gossifleur',
    loc_vars(self, info_queue, card) { seed_tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.growth, bloom_scores()] }; },
    calculate(self, card, context) { blind_convert(card, context, 'm_poke_seed', 'poke_eldegoss_seeds', '+1 Seed'); return cotton_down(card, context); },
    ...sweet_growth,
  },
  // Wooloo 831 (Colorless, Common $5): +50 Chips (`chips` +30%: 65 / 80 / 95). 5 rounds.
  wooloo: {
    name: 'wooloo', poke_sprite391: sprite('Natdex', 10, 55),
    config: { extra: { chips: 50, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'round_evo'], poke_after: 'eldegoss',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_dubwool');
    },
  },
  // Dubwool 832 (Safari $8): +100 Chips (`chips` +30%: 130 / 160 / 190); Cotton Guard: +1 hand during Boss Blinds (`hands`, fixed;
  // cotton_guard: given when the Boss Blind is selected, gone at the round's end). Blueprint copies the Chips only.
  dubwool: {
    name: 'dubwool', poke_sprite391: sprite('Natdex', 12, 55),
    config: { extra: { chips: 100, hands: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'hands', 'boss_blind'], poke_after: 'wooloo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.hands, guard_on(card) ? 'Active!' : 'Boss Blinds only'] }; },
    calculate(self, card, context) {
      cotton_guard(card, context);
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return undefined;
    },
    remove_from_deck(self, card, from_debuff) {
      if (from_debuff || !guard_on(card)) return;
      card.ability.extra.guard_round = -1;
      const back = Math.min(card.ability.extra.hands, G.GAME.current_round.hands_left - 1);
      if (back > 0) ease_hands_played(-back);
    },
  },
  // Chewtle 833 (Water, Common $5): +3 Mult for each Water Joker, itself included (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  chewtle: {
    name: 'chewtle', poke_sprite391: sprite('Natdex', 14, 55),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'dubwool',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = water_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * water_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_drednaw');
    },
  },
  // Drednaw 834 (Safari $8): X1, plus X0.3 for each Water Joker, itself included (`Xmult_mod` +20%: 0.36 / 0.42 / 0.48).
  drednaw: {
    name: 'drednaw', poke_sprite391: sprite('Natdex', 16, 55),
    config: { extra: { Xmult_mod: 0.3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'chewtle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = water_count(card); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = r9(1 + card.ability.extra.Xmult_mod * water_count(card)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Rolycoly 837 (Earth, Uncommon $6), Coal: when a Blind is selected, a random unenhanced card in your deck becomes Stone (blind_convert,
  // 'poke_rolycoly_coal'; Blueprint copies it). Carries Carkol's `mult` (6: "Energy carries to Carkol"). 4 rounds.
  rolycoly: {
    name: 'rolycoly', poke_sprite391: sprite('Natdex', 22, 55),
    config: { extra: { mult: 6, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Earth', gen: 8, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'boltund',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [ex.rounds, r3(ex.mult)] }; },
    calculate(self, card, context) { blind_convert(card, context, 'm_stone', 'poke_rolycoly_coal', '+1 Stone'); return level_evo(self, card, context, 'j_poke_carkol'); },
  },
  // Carkol 838 (Fire: its card; Safari $8): the same conversion; scored Stone cards also give +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  carkol: {
    name: 'carkol', poke_sprite391: sprite('Natdex', 24, 55),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'rolycoly',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      blind_convert(card, context, 'm_stone', 'poke_rolycoly_coal', '+1 Stone');
      if (stone_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_coalossal');
    },
  },
  // Coalossal 839 (Safari $10), Steam Engine: the same conversion; scored Stone cards give X1.3 (`Xmult_multi` +5%: 1.365 / 1.43 / 1.495);
  // +1 discard each round (`d_size`, fixed; the Charmander line's pair).
  coalossal: {
    name: 'coalossal', poke_sprite391: sprite('Natdex', 26, 55),
    config: { extra: { Xmult_multi: 1.3, d_size: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'discard', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'carkol',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.d_size] }; },
    calculate(self, card, context) {
      blind_convert(card, context, 'm_stone', 'poke_rolycoly_coal', '+1 Stone');
      if (stone_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...discards,
  },
  // Silicobra 843 (Earth, Common $5), Sand Spit: each card you discard (unenhanced) has a 1 in 4 chance to become Stone (sand_spit; odds
  // fixed). Carries Sandaconda's `chips` (20: "Energy carries to Sandaconda"). 5 rounds.
  silicobra: {
    name: 'silicobra', poke_sprite391: sprite('Natdex', 4, 56),
    config: { extra: { num: 1, dem: 4, chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 8, blueprint_compat: true,
    attributes: ['discard', 'enhancements', 'modify_card', 'chance', 'round_evo'], poke_after: 'coalossal',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'silicobra_spit');
      return { vars: [num, dem, ex.rounds, r3(ex.chips)] };
    },
    calculate(self, card, context) { return sand_spit(card, context) || level_evo(self, card, context, 'j_poke_sandaconda'); },
  },
  // Sandaconda 844 (Safari $8), Sandstorm: while held (undebuffed) every round is a sandstorm (is_sandstorm, the house sandstorm); scored
  // Stone cards give +20 Chips (`chips` +30%: 26 / 32 / 38) and X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38). r73 (the owner's): it keeps
  // Silicobra's Sand Spit (each discarded unenhanced card 1 in 4 to become Stone; odds fixed; sand_spit73).
  sandaconda: {
    name: 'sandaconda', poke_sprite391: sprite('Natdex', 6, 56),
    config: { extra: { chips: 20, Xmult_multi: 1.2, num: 1, dem: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'enhancements', 'discard', 'modify_card', 'chance'], poke_after: 'silicobra',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'silicobra_spit');
      return { vars: [r3(ex.chips), r3(ex.Xmult_multi), is_sandstorm() ? 'Sandstorm!' : 'No sandstorm', num, dem] };
    },
    calculate(self, card, context) {
      if (stone_scored(context)) return { chips: card.ability.extra.chips, x_mult: card.ability.extra.Xmult_multi, card };
      if (sand_spit73()) return sand_spit(card, context);
      return undefined;
    },
  },
  // Cramorant 845 (Water, Rare $7, single-stage), Gulp Missile: the round's first discard loads a missile; the next scored hand fires it,
  // X2.5 (`Xmult` +20%: 3 / 3.5 / 4); unfired at the round's end, it's lost. Loaded, it shows its Gulping Form card (Gen 8 {2,0}; poke_view_form).
  cramorant: {
    name: 'cramorant', poke_sprite391: sprite('Gen08', 0, 0),
    config: { extra: { Xmult: 2.5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'discard'], poke_after: 'sandaconda',
    poke_view_form(self, card) { return card.ability.extra.missile ? 'gulping' : 'normal'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), ex.missile ? 'Loaded!' : 'Empty'] }; },
    calculate(self, card, context) { return gulp_missile(card, context); },
  },
  // Arrokuda 846 (Water, Common $5), Propeller Tail: the first scored card gives +10 Mult (`mult` +40%: 14 / 18 / 22). 5 rounds.
  arrokuda: {
    name: 'arrokuda', poke_sprite391: sprite('Natdex', 10, 56),
    config: { extra: { mult: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'position', 'round_evo'], poke_after: 'cramorant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return propeller_tail(card, context, false) || level_evo(self, card, context, 'j_poke_barraskewda'); },
  },
  // Barraskewda 847 (Safari $8): the first scored card gives X2 (`Xmult_multi` +5%, a per-card X: 2.1 / 2.2 / 2.3).
  barraskewda: {
    name: 'barraskewda', poke_sprite391: sprite('Natdex', 12, 56),
    config: { extra: { Xmult_multi: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'position'], poke_after: 'arrokuda',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { return propeller_tail(card, context, true); },
  },


  // The owner's Gen 8 batch 2 ("go ahead with batch 2", 2026-11-02): 14 jokers, #848-861, on the guide's price slots (3-stage U $6 / S $8 /
  // S $10, 2-stage C $5 / S $8; Toxel a Baby, U $4 as Elekid; Toxtricity after a Baby is a shop Basic, R $7 as Lucario / Electabuzz), types =
  // the cards' (pokermon_art_type.mjs). Evolution by rounds: Toxel 3 (the owner's; Babies are usually 2), the 3-stage Basics 4, the rest 5.
  // Energy raises each main number at the standard share; the reroll discount, the free reroll, the Antique odds and the Tera conversion are
  // fixed; a stage with no number carries its evolution's ("Energy carries to Grimmsnarl"). Art: upstream 3.9.1's own cells (Natdex
  // {14,56}-{10,57}; Toxtricity Gen 8 {6,0} Amped, {8,0} Low Key beside it, systems/anim.js GEN8_FORM_SPRITES; Sinistea / Polteageist have
  // no Antique cell upstream, so both use their one card); nothing to deploy. Neither Nacho nor Pokermon+ has any. Pokédex order: Toxel ...
  // Grimmsnarl (848-861) after Barraskewda, before Dreepy.
  //
  // Toxel 848 (Lightning, Baby, Uncommon $4): +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). The Baby rule (faint_baby_poke: a non-Baby Joker to
  // its right debuffs it when a hand is played); its +4 replaces the Babies' usual X0.75 penalty (the owner's design). 3 rounds.
  toxel: {
    name: 'toxel', poke_sprite391: sprite('Natdex', 14, 56),
    config: { extra: { mult: 4, rounds: 3 } },
    rarity: 2, cost: 4, stage: 'Baby', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'baby', 'round_evo'], poke_after: 'barraskewda',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push({ set: 'Other', key: 'baby' }); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        faint_baby_poke(self, card, context);
        return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return level_evo(self, card, context, 'j_poke_toxtricity');
    },
  },
  // Toxtricity 849 (Lightning, Rare $7, a shop Basic): its form is rolled when obtained (or on evolving from Toxel), 50 / 50, and kept.
  // Amped, Punk Rock: X2 Mult on a hand of exactly 5 played cards (`Xmult` +20%: 2.4 / 2.8 / 3.2). Low Key: +40 Chips for each card fewer
  // than 5 played (`chips` +30%: 52 / 64 / 76; 1 card +160). Art: Amped {6,0}, Low Key {8,0} (Gen 8 sheet; poke_view_form).
  toxtricity: {
    name: 'toxtricity', poke_sprite391: sprite('Gen08', 6, 0),
    config: { extra: { Xmult: 2, chips: 40 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'chips', 'nature'], poke_after: 'toxel',
    poke_view_form(self, card) { return tox_form(card) || 'amped'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, f = tox_form(card);
      return { vars: [r3(ex.Xmult), r3(ex.chips)], key: f ? 'j_poke_toxtricity_' + f : undefined };
    },
    add_to_deck(self, card) { tox_roll(card); },
    calculate(self, card, context) { return punk_rock(card, context); },
  },
  // Sizzlipede 850 (Fire, Common $5), Fire Spin: the first card you discard each round is destroyed and it permanently gains +2 Mult
  // (`burn_mult`, banked; gain `mult_mod` +20%: 2.4 / 2.8 / 3.2). 5 rounds.
  sizzlipede: {
    name: 'sizzlipede', poke_sprite391: sprite('Natdex', 18, 56),
    config: { extra: { burn_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'discard', 'destroy_card', 'round_evo'], poke_after: 'toxtricity',
    poke_custom_values_to_keep: ['burn_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.burn_mult), burn_state(card), ex.rounds] }; },
    calculate(self, card, context) {
      const r = fire_spin(card, context, false);
      if (r) return r;
      const m = card.ability.extra.burn_mult;
      if (context.joker_main && m > 0) return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
      return level_evo(self, card, context, 'j_poke_centiskorch');
    },
  },
  // Centiskorch 851 (Safari $8): the same Fire Spin, gaining X0.1 (`burn_Xmult` from X1, banked; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16);
  // Sizzlipede's Mult bank carries and keeps scoring.
  centiskorch: {
    name: 'centiskorch', poke_sprite391: sprite('Natdex', 20, 56),
    config: { extra: { burn_mult: 0, burn_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'discard', 'destroy_card'], poke_after: 'sizzlipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.burn_Xmult), r3(ex.burn_mult), burn_state(card)] }; },
    calculate(self, card, context) {
      const r = fire_spin(card, context, true);
      if (r) return r;
      const ex = card.ability.extra;
      if (context.joker_main && (ex.burn_mult > 0 || ex.burn_Xmult > 1)) return { mult_mod: ex.burn_mult || undefined, Xmult_mod: ex.burn_Xmult > 1 ? ex.burn_Xmult : undefined };
      return undefined;
    },
  },
  // Clobbopus 852 (Fighting, Common $5), Octolock: +2 Mult for each card held in hand that shares a rank with a scored card (`mult` +40%:
  // 2.8 / 3.6 / 4.4). 5 rounds.
  clobbopus: {
    name: 'clobbopus', poke_sprite391: sprite('Natdex', 22, 56),
    config: { extra: { mult: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'hand', 'rank', 'round_evo'], poke_after: 'centiskorch',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        const ranks = scored_ranks(context), n = G.hand.cards.filter((c) => octo_held(c, ranks)).length;
        if (n > 0) { const m = r3(card.ability.extra.mult * n); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
        return undefined;
      }
      return level_evo(self, card, context, 'j_poke_grapploct');
    },
  },
  // Grapploct 853 (Safari $8), Octolock: each card held in hand that shares a rank with a scored card gives X1.25 (the held pass, Baron's
  // shape: Mime and held retriggers repeat it; `Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375).
  grapploct: {
    name: 'grapploct', poke_sprite391: sprite('Natdex', 24, 56),
    config: { extra: { Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'hand', 'rank'], poke_after: 'clobbopus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && octo_held(context.other_card, scored_ranks(context))) {
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
  },
  // Sinistea 854 (Psychic, Common $5): X1.5 Mult; Antique (1 in 10, rolled when obtained, fixed odds) X3 (`Xmult` +20%: 1.8 / 2.1 / 2.4, Antique
  // twice that). 5 rounds; the roll carries to Polteageist.
  sinistea: {
    name: 'sinistea', poke_sprite391: sprite('Natdex', 26, 56),
    config: { extra: { Xmult: 1.5, num: 1, dem: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'nature', 'round_evo'], poke_after: 'grapploct',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult * 2), ex.num, ex.dem, tea_state(card), ex.rounds] }; },
    add_to_deck(self, card) { tea_roll(card); },
    calculate(self, card, context) {
      if (context.joker_main) { const x = tea_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return level_evo(self, card, context, 'j_poke_polteageist');
    },
  },
  // Polteageist 855 (Safari $8): X2 Mult; Antique X4 (`Xmult` +20%: 2.4 / 2.8 / 3.2, Antique twice that).
  polteageist: {
    name: 'polteageist', poke_sprite391: sprite('Natdex', 28, 56),
    config: { extra: { Xmult: 2, num: 1, dem: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'nature'], poke_after: 'sinistea',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult * 2), ex.num, ex.dem, tea_state(card)] }; },
    add_to_deck(self, card) { tea_roll(card); },
    calculate(self, card, context) {
      if (context.joker_main) { const x = tea_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Hatenna 856 (Psychic, Uncommon $6): +4 Mult for each Psychic Joker, itself included (`mult` +40%: 5.6 / 7.2 / 8.8). 4 rounds.
  hatenna: {
    name: 'hatenna', poke_sprite391: sprite('Natdex', 0, 57),
    config: { extra: { mult: 4, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'polteageist',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = psychic_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * psychic_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_hattrem');
    },
  },
  // Hattrem 857 (Safari $8): +6 Mult for each Psychic Joker, itself included (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  hattrem: {
    name: 'hattrem', poke_sprite391: sprite('Natdex', 2, 57),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'hatenna',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = psychic_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * psychic_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_hatterene');
    },
  },
  // Hatterene 858 (Safari $10): X1 plus X0.25 for each Psychic Joker, itself included (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4); Magic Powder: when
  // a Blind is selected, the Joker to its right gets a Psychic Tera sticker unless it is Psychic already (fixed; not Blueprint).
  hatterene: {
    name: 'hatterene', poke_sprite391: sprite('Natdex', 4, 57),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'types', 'tera'], poke_after: 'hattrem',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = psychic_count(card);
      return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] };
    },
    calculate(self, card, context) {
      magic_powder(card, context);
      if (context.joker_main) { const x = r9(1 + card.ability.extra.Xmult_mod * psychic_count(card)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Impidimp 859 (Fairy, Uncommon $6), Prankster: shop rerolls cost $1 less (`reroll_discount`, fixed; each copy stacks; never below $1, a free
  // reroll stays free). Carries Grimmsnarl's `Xmult_mod` (0.1: "Energy carries to Grimmsnarl"). 4 rounds.
  impidimp: {
    name: 'impidimp', poke_sprite391: sprite('Natdex', 6, 57),
    config: { extra: { reroll_discount: 1, Xmult_mod: 0.1, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Fairy', gen: 8, blueprint_compat: false,
    attributes: ['economy', 'reroll', 'round_evo'], poke_after: 'hatterene',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.reroll_discount, ex.rounds, r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_morgrem'); },
    ...prank_recost,
  },
  // Morgrem 860 (Safari $8), Prankster: your first reroll in each shop is free (one however many are held; none on top of Chaos the Clown's /
  // a D6 Tag's: whatever makes the shop's first reroll free uses it). r73 (the owner's): it keeps Impidimp's discount, shop rerolls $1 less
  // (`reroll_discount`, fixed; never below $1; prank_discount73). Carries Grimmsnarl's `Xmult_mod`. 5 rounds.
  morgrem: {
    name: 'morgrem', poke_sprite391: sprite('Natdex', 8, 57),
    config: { extra: { reroll_discount: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 8, blueprint_compat: false,
    attributes: ['economy', 'reroll', 'round_evo'], poke_after: 'impidimp',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [prank_state(), ex.rounds, r3(ex.Xmult_mod), ex.reroll_discount] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_grimmsnarl'); },
    ...prank_recost,
  },
  // Grimmsnarl 861 (Safari $10): Prankster (the first reroll in each shop free) and it permanently gains X0.1 for every shop reroll, free ones
  // included (`prank_Xmult` from X1, banked; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16). Blueprint copies the X, never the gain. r75 (the
  // owner's): it keeps Impidimp's discount too, shop rerolls $1 less (`reroll_discount`, fixed; stacks; never below $1; prank_discount75).
  grimmsnarl: {
    name: 'grimmsnarl', poke_sprite391: sprite('Natdex', 10, 57),
    config: { extra: { prank_Xmult: 1, Xmult_mod: 0.1, reroll_discount: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'economy', 'reroll'], poke_after: 'morgrem',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [prank_state(), r3(ex.Xmult_mod), r3(ex.prank_Xmult), typeof ex.reroll_discount === 'number' ? ex.reroll_discount : self.config.extra.reroll_discount] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.reroll_shop && !context.blueprint && !context.retrigger_joker) {
        ex.prank_Xmult = r3(ex.prank_Xmult + ex.Xmult_mod);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [ex.prank_Xmult] }), colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.prank_Xmult > 1) return { message: a_xmult(r3(ex.prank_Xmult)), colour: 'XMULT', Xmult_mod: ex.prank_Xmult };
      return undefined;
    },
    ...prank_recost,
  },


  // The owner's Gen 8 batch 3 ("yes build it", 2026-11-02): 21 jokers, #862-902, on the guide's price slots (2-stage C $5 / S $8,
  // single-stage R $7, a Stage 2 S $10); evolution by rounds (5). Types = the cards' (pokermon_art_type.mjs). Energy raises the main number
  // at the standard share; money, slots, odds, retriggers, counts and thresholds are fixed; banks never retroactive and carried. Six are NEW
  // EVOLUTIONS of existing jokers (an approved exception to "base Pokermon wins"; the upstream jokers otherwise unchanged; gated by rules rev
  // 72, so older runs replay as recorded): Linoone -> Obstagoon (a Dark Energy), Corsola -> Cursola (a Psychic Energy), Farfetch'd ->
  // Sirfetch'd (3 Lucky triggers in a round), Mr. Mime -> Mr. Rime (a Water Energy), Yamask -> Runerigus (10 Stones scored), Basculin ->
  // Basculegion (25 cards of its stripe). Art: upstream 3.9.1's own cells (Natdex {12,57}-{24,58}; Gen 8 Alcremie {10,0} + its 62 other
  // forms, Eiscue {8,8} / Noice {10,8}, Indeedee {12,8} / ♀ {14,8}, Morpeko {0,9} / Hangry {2,9}, Basculegion {2,11}); nothing to deploy.
  // Pokédex order: Obstagoon ... Arctovish (862-883) after Grimmsnarl, before Dreepy; Basculegion (902) after Ursaluna.
  //
  // Obstagoon 862 (Dark, Stage 2 Safari $10), Blocking: X2 Mult, X3 while the Boss Blind is debuffing any of your cards (`Xmult` /
  // `Xmult2` +20%: 2.4 / 2.8 / 3.2 and 3.6 / 4.2 / 4.8).
  obstagoon: {
    name: 'obstagoon', poke_sprite391: sprite('Natdex', 12, 57),
    config: { extra: { Xmult: 2, Xmult2: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dark', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind', 'debuff'], poke_after: 'grimmsnarl',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), boss_debuffing() ? 'Blocking!' : 'no debuffing Boss'] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra, x = boss_debuffing() ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Cursola 864 (Psychic, Safari $8), Perish Body: X3 Mult (`Xmult` +20%: 3.6 / 4.2 / 4.8); crumbles at the end of its 4th round held
  // (`perish_rounds`, fixed).
  cursola: {
    name: 'cursola', poke_sprite391: sprite('Natdex', 16, 57),
    config: { extra: { Xmult: 3, perish_rounds: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'self_destruct'], poke_after: 'obstagoon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), ex.perish_rounds] }; },
    calculate(self, card, context) {
      perish_body(card, context);
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Sirfetch'd 865 (Fighting, Safari $8), Meteor Assault: X1 + X0.5 per Lucky trigger this round (`Xmult_mod` +20%: 0.6 / 0.7 / 0.8).
  sirfetchd: {
    name: 'sirfetchd', poke_sprite391: sprite('Natdex', 18, 57),
    config: { extra: { Xmult_mod: 0.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'chance'], poke_after: 'cursola',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra, n = meteor_count(card); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) { return meteor_assault(card, context); },
  },
  // Mr. Rime 866 (Water, Safari $8), Screen Cleaner: the Boss Blind's ability is off on your final hand (rime_final_deal). No number:
  // Energy-inert.
  mrrime: {
    name: 'mrrime', poke_sprite391: sprite('Natdex', 20, 57),
    config: { extra: {} },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['boss_blind', 'debuff'], poke_after: 'sirfetchd',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [rime_state()] }; },
    remove_from_deck(self, card) {
      // sold, destroyed or debuffed during the suspended final hand, with no other Mr. Rime (and not Amoonguss's first hand): back at once
      const GM = G.GAME, b = GM && GM.blind;
      if (!b || !b.suspended || GM.current_round.hands_left > 1) return;
      G.E_MANAGER.add_event(() => {
        const spore = GM.current_round.hands_played === 0 && find_card('j_poke_amoonguss').length > 0;
        if (b.suspended && !find_card('j_poke_mrrime').length && !spore) b.suspend(false);
      });
    },
  },
  // Runerigus 867 (Psychic, Safari $8), Wandering Spirit: each scored Stone card gives X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375);
  // keeps giving Yamask's banked grudge X (`grudge_Xmult`; it banks no more).
  runerigus: {
    name: 'runerigus', poke_sprite391: sprite('Natdex', 22, 57),
    config: { extra: { grudge_Xmult: 1, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'mrrime',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), r3(ex.grudge_Xmult)] }; },
    calculate(self, card, context) {
      if (stone_scored(context) && !context.other_card.debuff) return { x_mult: card.ability.extra.Xmult_multi, card };
      return grudge_main(card, context);
    },
  },
  // Milcery 868 (Fairy, Common $5), Decorate: each scored card with an edition gives +5 Mult (`mult` +40%: 7 / 9 / 11). 5 rounds.
  milcery: {
    name: 'milcery', poke_sprite391: sprite('Natdex', 24, 57),
    config: { extra: { mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'editions', 'round_evo'], poke_after: 'runerigus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return decorate(card, context) || level_evo(self, card, context, 'j_poke_alcremie'); },
  },
  // Alcremie 869 (Safari $8): Decorate kept (`mult` +40%); Whipped Cream: when a Blind is selected a random card in your deck with no edition
  // becomes Foil or Holographic (whipped_cream). Its Sweet x Cream form (63) is rolled when it becomes an Alcremie (seeded), art only.
  alcremie: {
    name: 'alcremie', poke_sprite391: sprite('Gen08', 10, 0),
    config: { extra: { mult: 5, form: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'editions', 'modify_card', 'full_deck'], poke_after: 'milcery',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.e_foil); info_queue.push(P_CENTERS.e_holo);
      return { vars: [r3(card.ability.extra.mult), alcremie_name(card)] };
    },
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = Math.min(62, Math.floor(pseudorandom(pseudoseed('alcremie_form')) * 63)); },
    calculate(self, card, context) { whipped_cream(card, context); return decorate(card, context); },
  },
  // Falinks 870 (Fighting, Rare $7, single-stage), Formation: if every scored card shares a suit, each gives +6 Mult (`mult` +40%: 8.4 /
  // 10.8 / 13.2).
  falinks: {
    name: 'falinks', poke_sprite391: sprite('Natdex', 28, 57),
    config: { extra: { mult: 6 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'suits'], poke_after: 'alcremie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.mult)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff && in_formation(context.scoring_hand)) return { mult: card.ability.extra.mult, card };
      return undefined;
    },
  },
  // Pincurchin 871 (Lightning, Rare $7), Lightning Rod: X1 + X0.25 per Lightning Energy card used this run (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  pincurchin: {
    name: 'pincurchin', poke_sprite391: sprite('Natdex', 0, 58),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'energy'], poke_after: 'falinks',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_mod), lightning_used(), r3(pincurchin_x(card))] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = pincurchin_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Snom 872 (Water, Common $5): each scored Glass card gives +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  snom: {
    name: 'snom', poke_sprite391: sprite('Natdex', 2, 58),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'pincurchin',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { if (glass_scored(context)) return { mult: card.ability.extra.mult, card }; return level_evo(self, card, context, 'j_poke_frosmoth'); },
  },
  // Frosmoth 873 (Safari $8), Ice Scales: each Glass card held in hand gives X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38).
  frosmoth: {
    name: 'frosmoth', poke_sprite391: sprite('Natdex', 4, 58),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'hand'], poke_after: 'snom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { if (glass_held(context)) return { x_mult: card.ability.extra.Xmult_multi, card }; return undefined; },
  },
  // Eiscue 875 (Water, Rare $7), Ice Face: X2.5 (`Xmult` +20%: 3 / 3.5 / 4); broken by a round's first hand that doesn't beat the Blind,
  // Noice Face X1.25 (`Xmult2` +20%: 1.5 / 1.75 / 2) until a Snowy round re-forms it (ice_face). Each face its own 3.9.1 card.
  eiscue: {
    name: 'eiscue', poke_sprite391: sprite('Gen08', 8, 8),
    config: { extra: { Xmult: 2.5, Xmult2: 1.25, form: 'ice' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'hand_drawn', 'suits'], poke_after: 'frosmoth',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2)], key: eiscue_broken(card) ? 'j_poke_eiscue_noice' : undefined }; },
    calculate(self, card, context) { return ice_face(card, context); },
  },
  // Indeedee 876 (Psychic, Rare $7): its gender rolled when obtained. ♂: X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4) and +1 consumable slot
  // (fixed). ♀: each Tarot used earns $2 (fixed: Energy-inert). Each its own 3.9.1 card.
  indeedee: {
    name: 'indeedee', poke_sprite391: sprite('Gen08', 12, 8),
    config: { extra: { Xmult: 1.5, card_limit: 1, tarot_money: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'consumable_slot', 'money', 'tarot'], poke_after: 'eiscue',
    poke_view_form(self, card) { return indeedee_gender(card) || 'male'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, g = indeedee_gender(card);
      return { vars: [r3(ex.Xmult === undefined ? self.config.extra.Xmult : ex.Xmult), ex.card_limit, ex.tarot_money], key: g ? 'j_poke_indeedee_' + g : undefined };
    },
    add_to_deck(self, card) {
      const ex = card.ability.extra;
      if (!indeedee_gender(card)) {
        ex.gender = pseudorandom(pseudoseed('indeedee_gender')) < 0.5 ? 'female' : 'male';
        if (ex.gender === 'female') delete ex.Xmult;
      }
      if (ex.gender === 'male') G.consumeables.config.card_limit += ex.card_limit;
    },
    remove_from_deck(self, card) { if (indeedee_gender(card) === 'male') G.consumeables.config.card_limit -= card.ability.extra.card_limit; },
    calculate(self, card, context) {
      const ex = card.ability.extra, g = indeedee_gender(card);
      if (g === 'male' && context.joker_main) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      if (g === 'female' && context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Tarot') {
        ease_dollars(ex.tarot_money);
        card_eval_status_text(context.blueprint_card || card, 'dollars', ex.tarot_money);
      }
      return undefined;
    },
  },
  // Morpeko 877 (Lightning, Rare $7), Hunger Switch: Full Belly +20 Mult / Hangry X2, switching after every hand played (`mult` +40%: 28 /
  // 36 / 44; `Xmult` +20%: 2.4 / 2.8 / 3.2). Each mode its own 3.9.1 card (its type stays Lightning).
  morpeko: {
    name: 'morpeko', poke_sprite391: sprite('Gen08', 0, 9),
    config: { extra: { mult: 20, Xmult: 2, form: 'full' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult'], poke_after: 'indeedee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.Xmult), morpeko_hangry(card) ? 'Hangry' : 'Full Belly'] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) return morpeko_hangry(card) ? { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult } : { message: a_mult(r3(ex.mult)), colour: 'MULT', mult_mod: ex.mult };
      if (context.after && !context.blueprint && !context.retrigger_joker) {
        ex.form = morpeko_hangry(card) ? 'full' : 'hangry';
        card_eval_status_text(card, 'extra', null, null, null, { message: morpeko_hangry(card) ? 'Hangry!' : 'Full Belly!', colour: morpeko_hangry(card) ? 'XMULT' : 'MULT' });
      }
      return undefined;
    },
  },
  // Cufant 878 (Metal, Common $5): +10 Chips for each Steel card in your full deck (`chips` +30%: 13 / 16 / 19). 5 rounds.
  cufant: {
    name: 'cufant', poke_sprite391: sprite('Natdex', 14, 58),
    config: { extra: { chips: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Metal', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'morpeko',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * steel_in_deck()), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = r3(card.ability.extra.chips * steel_in_deck()); if (c > 0) return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return level_evo(self, card, context, 'j_poke_copperajah');
    },
  },
  // Copperajah 879 (Safari $8): each Steel card held in hand at end of round earns $1 (Gold card style; `steel_money`, fixed: Energy-inert).
  copperajah: {
    name: 'copperajah', poke_sprite391: sprite('Natdex', 16, 58),
    config: { extra: { steel_money: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 8, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'hand'], poke_after: 'cufant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); return { vars: [card.ability.extra.steel_money] }; },
    calculate(self, card, context) {
      const oc = context.other_card;
      if (context.end_of_round && context.individual && context.cardarea === G.hand && oc && !oc.debuff && has_enhancement(oc, 'm_steel')) {
        const n = card.ability.extra.steel_money;
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + n;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: n, card: oc };
      }
      return undefined;
    },
  },
  // Dracozolt 880 (Lightning, Rare $7), Ancient Jacks: 1+ +5 Mult (`mult` +40%: 7 / 9 / 11); 2+ X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); 3+ earn
  // $3 (`ancient_money`, fixed; once a hand).
  dracozolt: {
    name: 'dracozolt', poke_sprite391: sprite('Natdex', 18, 58),
    config: { extra: { rank: 'Jack', mult: 5, Xmult: 1.5, ancient_money: 3 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'ancient', 'rank', 'face'], poke_after: 'copperajah',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra; return { vars: [localize('Jack', 'ranks'), r3(ex.mult), r3(ex.Xmult), ex.ancient_money] }; },
    calculate(self, card, context) {
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context), ex = card.ability.extra;
      if (n < 1) return undefined;
      const r = { mult_mod: ex.mult, message: a_mult(r3(ex.mult)), colour: 'MULT' };
      if (n >= 2) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      if (n >= 3) r.dollars = ex.ancient_money;
      return r;
    },
  },
  // Arctozolt 881 (Lightning, Rare $7), Ancient Jacks: 1+ +40 Chips (`chips` +30%: 52 / 64 / 76); 2+ scored Jacks retrigger once (fixed); 3+
  // X2 (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  arctozolt: {
    name: 'arctozolt', poke_sprite391: sprite('Natdex', 20, 58),
    config: { extra: { rank: 'Jack', chips: 40, retriggers: 1, Xmult: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'retrigger', 'ancient', 'rank', 'face'], poke_after: 'dracozolt',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra; return { vars: [localize('Jack', 'ranks'), r3(ex.chips), ex.retriggers, r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && is_jack(context.other_card) && jacks(context) >= 2) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context);
      if (n < 1) return undefined;
      const r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
      if (n >= 3) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Dracovish 882 (Water, Rare $7), Ancient Jacks: 1+ +5 Mult (`mult` +40%); 2+ the first scored Jack retriggers twice (fixed); 3+ X2 (`Xmult`
  // +20%: 2.4 / 2.8 / 3.2).
  dracovish: {
    name: 'dracovish', poke_sprite391: sprite('Natdex', 22, 58),
    config: { extra: { rank: 'Jack', mult: 5, retriggers: 2, Xmult: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'retrigger', 'ancient', 'rank', 'face'], poke_after: 'arctozolt',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra; return { vars: [localize('Jack', 'ranks'), r3(ex.mult), ex.retriggers, r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card === first_jack(context) && jacks(context) >= 2) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context);
      if (n < 1) return undefined;
      const r = { mult_mod: ex.mult, message: a_mult(r3(ex.mult)), colour: 'MULT' };
      if (n >= 3) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Arctovish 883 (Water, Rare $7), Ancient Jacks: 1+ +40 Chips (`chips` +30%); 2+ X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); 3+ +1 hand this
  // round (`hands`, fixed; once a round, `hand_round`; not Blueprint).
  arctovish: {
    name: 'arctovish', poke_sprite391: sprite('Natdex', 24, 58),
    config: { extra: { rank: 'Jack', chips: 40, Xmult: 1.5, hands: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands', 'ancient', 'rank', 'face'], poke_after: 'dracovish',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, 'Jack'); const ex = card.ability.extra;
      return { vars: [localize('Jack', 'ranks'), r3(ex.chips), r3(ex.Xmult), ex.hands, G.GAME && ex.hand_round === G.GAME.round ? 'used this round' : 'ready'] };
    },
    calculate(self, card, context) {
      if (!context.joker_main || !context.scoring_hand) return undefined;
      const n = jacks(context), ex = card.ability.extra;
      if (n < 1) return undefined;
      if (n >= 3 && !context.blueprint && !context.retrigger_joker && ex.hand_round !== G.GAME.round) {
        ex.hand_round = G.GAME.round;
        ease_hands_played(ex.hands);
        card_eval_status_text(card, 'extra', null, null, null, { message: '+' + ex.hands + ' Hand', colour: 'CHIPS' });
      }
      const r = { chip_mod: ex.chips, message: a_chips(r3(ex.chips)), colour: 'CHIPS' };
      if (n >= 2) { r.Xmult_mod = ex.Xmult; r.message = a_xmult(r3(ex.Xmult)); r.colour = 'XMULT'; }
      return r;
    },
  },
  // Basculegion 902 (Psychic: its card; Safari $8), Last Respects: X1 + X0.1 for each Joker sold or destroyed this run (`Xmult_mod` +20%:
  // 0.12 / 0.14 / 0.16; jokers_gone).
  basculegion: {
    name: 'basculegion', poke_sprite391: sprite('Gen08', 2, 11),
    config: { extra: { Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'on_sell'], poke_after: 'ursaluna',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = jokers_gone(); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main && jokers_gone() > 0) { const x = r9(1 + card.ability.extra.Xmult_mod * jokers_gone()); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },


  // The owner's Gen 8 batch 4 ("Yes", 2026-11-03): the 10 Gen 8 Legendaries still missing, each complete ALONE (the solo rule, r59), all
  // Legendary $20 (The Soul / the Legendary pool). Types = the cards' (pokermon_art_type.mjs; every form cell shows its base's type). Energy
  // raises the X / the gains at the standard share; hands, money, thresholds, counts and conversions are fixed; banks never retroactive.
  // Art: upstream 3.9.1's own cells, forms included (Crowned Sword / Shield, Eternamax, Therian Enamorus: card and soul, systems/anim.js
  // GEN8_LEGEND_FORMS); nothing to deploy. Pokédex order: Zacian, Zamazenta, Eternatus after Dreepy (Dart), before Kubfu; Zarude ... Calyrex
  // after Urshifu, before Wyrdeer; Enamorus after Basculegion.
  //
  // Zacian 888 (Fairy), Intrepid Sword: X2 Mult (`Xmult` +20%: 2.4 / 2.8 / 3.2). Crowned Sword for good once 3 Boss Blinds are beaten while
  // it is held (`crown_bosses` on the card): X3 instead (`Xmult2` +20%: 3.6 / 4.2 / 4.8; its own field, so Energy taken before is kept).
  zacian: {
    name: 'zacian', poke_sprite391: sprite('Gen08', 6, 9, [7, 9]),
    config: { extra: { Xmult: 2, Xmult2: 3, crown_bosses: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind', 'scaling'], poke_after: 'dreepy_dart',
    poke_view_form(self, card) { return crowned(card) ? 'crowned' : 'hero'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), crown_state(card, 'Crowned Sword')] }; },
    calculate(self, card, context) {
      if (crown_tick(card, context, 'Crowned Sword')) return undefined;
      if (context.joker_main) return x_main(crowned(card) ? card.ability.extra.Xmult2 : card.ability.extra.Xmult);
      return undefined;
    },
  },
  // Zamazenta 889 (Fighting), Dauntless Shield: +1 hand each round (the Squirtle line's pair, fixed). Crowned Shield for good once 3 Boss
  // Blinds are beaten while it is held: +2 hands in all (`crowned_hands`, fixed; not +3) and X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4; Energy
  // can go on before it is crowned and is kept). Blueprint copies the X, never the hands.
  zamazenta: {
    name: 'zamazenta', poke_sprite391: sprite('Gen08', 10, 9, [11, 9]),
    config: { extra: { hands: 1, crowned_hands: 2, Xmult: 1.5, crown_bosses: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['hands', 'xmult', 'boss_blind', 'scaling'], poke_after: 'zacian',
    poke_view_form(self, card) { return crowned(card) ? 'crowned' : 'hero'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [self.config.extra.hands, ex.crowned_hands, r3(ex.Xmult), crown_state(card, 'Crowned Shield')] }; },
    calculate(self, card, context) {
      if (crown_tick(card, context, 'Crowned Shield', shield_crown)) return undefined;
      if (context.joker_main && crowned(card)) return x_main(card.ability.extra.Xmult);
      return undefined;
    },
    ...hands,
  },
  // Eternatus 890 (Dark), Dynamax: each Boss Blind beaten while held permanently adds X0.5 (`eterna_Xmult` from X1, a bank; the gain
  // `Xmult_mod` +20%: 0.6 / 0.7 / 0.8). Eternamax for good at the 5th Boss (`bosses`): its X is the bank x2 from then on, and the bank keeps
  // growing (5 Bosses: X3.5 x2 = X7; 6: X4 x2 = X8). The doubling and the 5 are fixed.
  eternatus: {
    name: 'eternatus', poke_sprite391: sprite('Natdex', 8, 59, [9, 59]),
    config: { extra: { eterna_Xmult: 1, Xmult_mod: 0.5, bosses: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dark', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind', 'scaling'], poke_after: 'zamazenta',
    poke_view_form(self, card) { return eternamax(card) ? 'eternamax' : 'base'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(eterna_x(card)), eternamax(card) ? 'Eternamax: X' + r3(ex.eterna_Xmult) + ' doubled' : 'Boss Blinds: ' + (ex.bosses || 0) + '/' + ETERNAMAX_AT] };
    },
    calculate(self, card, context) {
      if (boss_beaten(context)) {
        const ex = card.ability.extra, was = eternamax(card);
        ex.bosses = (ex.bosses || 0) + 1;
        bank(card, 'eterna_Xmult', 'Xmult_mod', 1, 'XMULT');
        if (!was && eternamax(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Eternamax!', colour: 'GOLD' });
        return undefined;
      }
      if (context.joker_main) return x_main(eterna_x(card));
      return undefined;
    },
  },
  // Zarude 893 (Grass), Jungle Drain: when a Blind is selected, drains $1 of sell value from each other Joker (`drain`, fixed; never below
  // $1) and banks +X0.05 per $1 drained (`jungle_Xmult` from X1; the gain `Xmult_mod` +20%: 0.06 / 0.07 / 0.08). Blueprint copies the X.
  zarude: {
    name: 'zarude', poke_sprite391: sprite('Gen08', 6, 10, [7, 10]),
    config: { extra: { drain: 1, Xmult_mod: 0.05, jungle_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'economy'], poke_after: 'urshifu_rapid',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ set: 'Other', key: 'poke_drain' });
      const ex = card.ability.extra; return { vars: [ex.drain, r3(ex.Xmult_mod), r3(ex.jungle_Xmult)] };
    },
    calculate(self, card, context) {
      if (jungle_drain(card, context)) return undefined;
      if (context.joker_main) return x_main(card.ability.extra.jungle_Xmult);
      return undefined;
    },
  },
  // Regieleki 894 (Lightning), Transistor: +1 hand each round (fixed); at end of round each unused hand permanently adds X0.1 (`eleki_Xmult`
  // from X1; the gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16; Quaquaval's Moxie count: the hands left after the winning hand).
  regieleki: {
    name: 'regieleki', poke_sprite391: sprite('Natdex', 16, 59, [17, 59]),
    config: { extra: { hands: 1, Xmult_mod: 0.1, eleki_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 8, blueprint_compat: true,
    attributes: ['hands', 'xmult', 'scaling'], poke_after: 'zarude',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.Xmult_mod), r3(ex.eleki_Xmult)] }; },
    calculate(self, card, context) {
      if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
        const n = unused_hands();
        if (n > 0) bank(card, 'eleki_Xmult', 'Xmult_mod', n, 'XMULT');
        return undefined;
      }
      if (context.joker_main) return x_main(card.ability.extra.eleki_Xmult);
      return undefined;
    },
    ...hands,
  },
  // Regidrago 895 (Dragon), Dragon Energy: X3 Mult on the round's first hand (`Xmult` +20%: 3.6 / 4.2 / 4.8), X0.5 less for each hand already
  // played this round (`drago_step`, fixed), never below X1 (X3 / 2.5 / 2 / 1.5 / 1).
  regidrago: {
    name: 'regidrago', poke_sprite391: sprite('Natdex', 18, 59, [19, 59]),
    config: { extra: { Xmult: 3, drago_step: 0.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 8, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'regieleki',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.drago_step), r3(drago_x(card))] }; },
    calculate(self, card, context) { return context.joker_main ? x_main(drago_x(card)) : undefined; },
  },
  // Glastrier 896 (Water), Chilling Neigh: +80 Chips (`chips` +30%: 104 / 128 / 152); Glass cards give X2.5 instead of X2 (a card-level rule,
  // glass_x_mult through the chip_x_mult hook, Registeel's way: `Xmult_multi` +5%: 2.625 / 2.75 / 2.875; the best Glass-X rule wins; the
  // Glass card's own tooltip says it). Blueprint copies the Chips, never the rule.
  glastrier: {
    name: 'glastrier', poke_sprite391: sprite('Natdex', 20, 59, [21, 59]),
    config: { extra: { chips: 80, Xmult_multi: 2.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 8, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'enhancements'], poke_after: 'regidrago',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return undefined;
    },
  },
  // Spectrier 897 (Psychic), Grim Neigh: each Spectral card used while held (by anyone; not Blueprint) banks +X0.25 (`grim_Xmult` from X1;
  // the gain `Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  spectrier: {
    name: 'spectrier', poke_sprite391: sprite('Natdex', 22, 59, [23, 59]),
    config: { extra: { Xmult_mod: 0.25, grim_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'spectral'], poke_after: 'glastrier',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.grim_Xmult)] }; },
    calculate(self, card, context) {
      const c = context.consumeable;
      if (context.using_consumeable && !context.blueprint && c && c.ability.set === 'Spectral') { bank(card, 'grim_Xmult', 'Xmult_mod', 1, 'XMULT'); return undefined; }
      if (context.joker_main) return x_main(card.ability.extra.grim_Xmult);
      return undefined;
    },
  },
  // Calyrex 898 (Psychic), King of Bountiful Harvest: when a Blind is selected, a random unenhanced card becomes a Seed (Sweet Seeds' rule;
  // Blueprint copies it); X1 + X0.1 for each Flower card in the full deck (bloomed Seeds; `Xmult_mod` +20%: 0.12 / 0.14 / 0.16; read live).
  calyrex: {
    name: 'calyrex', poke_sprite391: sprite('Gen08', 10, 10, [11, 10]),
    config: { extra: { Xmult_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'spectrier',
    loc_vars(self, info_queue, card) {
      seed_tips(self, info_queue, card);
      info_queue.push(P_CENTERS.m_poke_flower);
      const ex = card.ability.extra, n = flowers(); return { vars: [r3(ex.Xmult_mod), n, r3(harvest_x(card))] };
    },
    calculate(self, card, context) {
      if (bountiful_harvest(card, context)) return undefined;
      if (context.joker_main) return x_main(harvest_x(card));
      return undefined;
    },
  },
  // Enamorus 905 (Fairy), Springtide Storm: each scored Heart (is_suit: Wild counts) gives X1.25 Mult (`Xmult_multi` +5%: 1.3125 / 1.375 /
  // 1.4375). Therian Forme for good after it has been held for 4 rounds (the Forces of Nature's clock, `therian_rounds`): each scored Heart
  // also earns $1 (`heart_money`, fixed). Blueprint copies both.
  enamorus: {
    name: 'enamorus', poke_sprite391: sprite('Gen08', 6, 11, [7, 11]),
    config: { extra: { Xmult_multi: 1.25, heart_money: 1, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'money', 'suit'], poke_after: 'basculegion',
    poke_view_form(self, card) { return enamorus_therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.heart_money, enamorus_state(card)] }; },
    calculate(self, card, context) {
      if (enamorus_tick(card, context)) return undefined;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Hearts')) {
        const ex = card.ability.extra;
        if (!enamorus_therian(card)) return { x_mult: ex.Xmult_multi, card };
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.heart_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ex.heart_money, x_mult: ex.Xmult_multi, card };
      }
      return undefined;
    },
  },
};
