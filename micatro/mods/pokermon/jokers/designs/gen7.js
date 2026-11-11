// designs/gen7.js — the owner's Generation 7 Pokermon jokers and the helpers only they use, cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another
// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);
// a NEW joker is just added to JOKERS below and registers after them.
import {
  G, scale_card, card_eval_status_text, smods_debuff_card, is_type, POKETYPES, localize, pseudorandom, pseudoseed, emit, has_enhancement, type_tooltip,
  blueprint_compat_line, level_evo, P_CENTERS, HISUI_REV, has_no_rank, pseudorandom_probability, can_be_destroyed_by_joker, energy_values,
  can_increase_energy, pseudorandom_element, increment_energy, get_probability_vars, scaling_evo, get_type, create_card,
} from '../../api.js';
import { blueprint_effect } from '../pokejokers_08.js';
import {
  a_chips, a_mult, a_xmult, bank, boss_now, cherrim_sunny, discards, final_hand, first_deal, gender_name, hand_size, hands, hands_before, innards_out,
  innards_payout, lucky_scored, ninja_others, protean_set, r3, r9, rain_read, rain_state, recoil, round_end, sprite, stone_scored, sun_read, sun_state,
  swift_swim_raining, sync_kecleons, unbroken,
} from './common.js';


/** Mudbray / Mudsdale, Stamina: +chip_mod Chips for each hand that isn't the round's first. */
function stamina(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint && G.GAME.current_round.hands_played > 0) {
    scale_card(card, { ref_value: 'chips', scalar_value: 'chip_mod', message_colour: 'CHIPS' });
  }
  if (context.joker_main && card.ability.extra.chips > 0) return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
  return undefined;
}

// ---------------------------------------------------------------- Gen 7, batch 3: the Ultra Beasts (contentRev 66; 793-799, 803-806)
/** Beast Boost (the Ultra Beasts' shared ability, solo): each Boss Blind beaten (the main end_of_round pass with beat_boss, not on a game over,
 *  not Blueprint, not a joker retrigger) adds 1 to the card's `beast_boosts` (a count, in no energy_values; it carries through evolution:
 *  poke_custom_values_to_keep). The joker's MAIN number is the field its center names (`poke_beast_boost`); its effective value is
 *    ex[field] (the energized value) + beast_boosts x BEAST_BOOST x center.config.extra[field] (the UNENERGIZED base)
 *  so a boost is always 10% of the base: Energy never scales a boost and a boost never scales an Energy (neither is retroactive on the
 *  other; the order they come in doesn't matter). Nihilego has no number of its own: no field, no count. */
export const BEAST_BOOST = 0.1;
const beast_step = (card) => { const f = card.config.center.poke_beast_boost; return f ? r9(BEAST_BOOST * ((card.config.center.config.extra || {})[f] || 0)) : 0; };
const beast_bonus = (card) => r9((card.ability.extra.beast_boosts || 0) * beast_step(card));
/** The effective main number: the field (as Energy left it) + the Beast Boosts. */
export const beast_value = (card, field = card.config.center.poke_beast_boost) => r9((card.ability.extra[field] || 0) + (field === card.config.center.poke_beast_boost ? beast_bonus(card) : 0));
function beast_boost(card, context) {
  if (!(round_end(context) && context.beat_boss && !context.game_over) || context.blueprint || context.retrigger_joker) return false;
  if (!card.config.center.poke_beast_boost) return false;
  const ex = card.ability.extra;
  ex.beast_boosts = (ex.beast_boosts || 0) + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Beast Boost!', colour: 'FILTER' });
  return true;
}
/** The tooltip's "(Beast Boost: +n)": the total the boosts add (n = boosts x step). */
const beast_vars = (card) => [r3(beast_step(card)), r3(beast_bonus(card))];
/** Nihilego, Parasite: the Joker directly to its LEFT (Blueprint mirrored; none at the row's left end). */
const nihilego_target = (card) => { const i = G.jokers && G.jokers.cards ? G.jokers.cards.indexOf(card) : -1; return i > 0 ? G.jokers.cards[i - 1] : undefined; };
/** Pheromosa: X on the round's first 2 hands (current_round.hands_played, the hands BEFORE this one, < pheromosa_hands); after the 2nd
 *  hand (or any later one) has scored it is debuffed (an SMODS debuff source, 'pheromosa', on the card) until the round ends. */
export const PHEROMOSA_HANDS = 2;
function pheromosa_tire(card, context) {
  if (!context.after || context.blueprint || context.retrigger_joker) return false;
  if ((G.GAME.current_round.hands_played || 0) < PHEROMOSA_HANDS - 1) return true;
  smods_debuff_card(card, true, 'pheromosa');
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Tired!', colour: 'RED' });
  return true;
}
/** Celesteela, Launch: X(1 + Xmult_mod per $1 of its current sell value). */
const launch_x = (card) => r9(1 + beast_value(card) * (card.sell_cost || 0));
/** Guzzlord, Gluttony: when a Blind is selected (not Blueprint), the LEFTMOST consumable (Shuckle's choice; one already being sliced is
 *  skipped) is destroyed and the bank `gluttony_Xmult` (from X1, no energy field) gains `Xmult_mod`. No consumable, nothing. */
function gluttony(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced) return false;
  const meal = ((G.consumeables && G.consumeables.cards) || []).find((c) => !c.getting_sliced);
  if (!meal) return true;
  meal.getting_sliced = true;
  const ex = card.ability.extra;
  ex.gluttony_Xmult = r9(ex.gluttony_Xmult + ex.Xmult_mod);
  G.E_MANAGER.add_event(() => { meal.start_dissolve(); });
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(r3(beast_value(card))), colour: 'XMULT' });
  return true;
}
/** Poipole / Naganadel: undebuffed Dragon Jokers (is_type: a Tera sticker counts), the joker itself included when it is one. */
const dragon_count = () => ((G.jokers && G.jokers.cards) || []).filter((j) => !j.debuff && is_type(j, 'Dragon')).length;
const poipole_mult = (card) => r3(beast_value(card) * dragon_count());
const naganadel_x = (card) => r9(beast_value(card) + card.ability.extra.Xmult_mod * dragon_count());

// ---------------------------------------------------------------- Gen 7, batch 4: the Gen 7 Legendaries (contentRev 67; 772-807)
/** A banked X gain at the main end of round (not Blueprint, not a joker retrigger, not on a game over): `ref` += `mod` (bank outside
 *  energy_values, gain an energy field: never retroactive). Type: Null, Cosmog (Mult), Cosmoem. */
function round_bank(card, context, ref, mod, colour) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  bank(card, ref, mod, 1, colour);
}
/** Silvally, RKS System: the Energy card's type (c_poke_<type>_energy; Darkness = Dark), or null (Bird Energy, a non-Energy). */
const ENERGY_TYPE = Object.fromEntries(POKETYPES.map((t) => ['c_poke_' + (t === 'Dark' ? 'darkness' : t.toLowerCase()) + '_energy', t]));
export const rks_type_of = (consumeable) => (consumeable && consumeable.ability && consumeable.ability.set === 'Energy' && ENERGY_TYPE[consumeable.config.center.key]) || null;
/** Using any Energy card (on any joker, while Silvally is held; not Blueprint) sets Silvally's own type (Greninja's protean_set: its ptype,
 *  a Tera sticker still overrides; set_debuff + Kecleon re-sync). The Energy's use() runs first, so an Energy put on Silvally itself
 *  energizes it before the type moves. */
function rks_system(card, context) {
  if (!context.using_consumeable || context.blueprint) return false;
  const t = rks_type_of(context.consumeable);
  if (!t) return false;
  if (protean_set(card, t)) card_eval_status_text(card, 'extra', null, null, null, { message: 'RKS: ' + t + '!', colour: 'BLUE' });
  return true;
}
/** Silvally's X: (Xmult + Xmult_mod per OTHER undebuffed joker of its current type: Greninja's count) x Type: Null's bank. */
const rks_x = (card) => r9((card.ability.extra.Xmult + card.ability.extra.Xmult_mod * ninja_others(card)) * (card.ability.extra.null_Xmult || 1));
/** Cosmoem: the scored cards' colours while it is held (once per hand in the `after` pass, Zygarde's count: a retrigger, a Blueprint or a
 *  debuffed card adds none). A Heart or Diamond is red, a Spade or Club black (is_suit: a Wild card is both, a Stone card neither). */
function cosmo_count(card, context) {
  if (!context.after || context.blueprint || context.retrigger_joker) return false;
  const ex = card.ability.extra;
  for (const c of (context.scoring_hand || [])) {
    if (c.debuff) continue;
    if (c.is_suit('Hearts') || c.is_suit('Diamonds')) ex.red = (ex.red || 0) + 1;
    if (c.is_suit('Spades') || c.is_suit('Clubs')) ex.black = (ex.black || 0) + 1;
  }
  return true;
}
/** Cosmoem's branch: more red than black scored -> Solgaleo, more black -> Lunala, a tie -> Solgaleo. */
export const cosmo_branch = (card) => ((card.ability.extra.black || 0) > (card.ability.extra.red || 0) ? 'j_poke_lunala' : 'j_poke_solgaleo');
/** The Cosmog line's banks, every hand: Cosmog's +Mult (`cosmo_mult`) and Cosmoem's X (`cosmo_Xmult`). Blueprint copies them. */
function cosmo_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.cosmo_mult > 0) r.mult_mod = ex.cosmo_mult;
  if (ex.cosmo_Xmult > 1) r.Xmult_mod = ex.cosmo_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Solgaleo / Lunala: each scored card of their colour gives X Xmult_multi (Blueprint copies it). */
function cosmo_suit_x(card, context, suits) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && suits.some((s) => context.other_card.is_suit(s))) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
/** Necrozma, Prism: Ultra Necrozma for good once the bank reaches NECROZMA_ULTRA (it never drops). */
export const NECROZMA_ULTRA = 3;
export const necrozma_ultra = (card) => (card.ability.extra.prism_Xmult || 1) >= NECROZMA_ULTRA - 1e-9;
/** Ultra Necrozma's +hand size (`ultra_size`, fixed): Zygarde's Complete Forme pair (given on becoming Ultra and in add_to_deck when
 *  already Ultra; taken in remove_from_deck: sold, destroyed, debuffed; `ultra_given` so never twice). */
function ultra_give(card) {
  const ex = card.ability.extra;
  if (ex.ultra_given || !necrozma_ultra(card)) return;
  ex.ultra_given = true;
  G.hand.change_size(ex.ultra_size);
}
const ultra_size = {
  add_to_deck(self, card) { card.ability.extra.ultra_given = false; ultra_give(card); },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    if (!ex.ultra_given) return;
    ex.ultra_given = false;
    G.hand.change_size(-ex.ultra_size);
  },
};
/** Each Planet card used while it is held (by anyone; not Blueprint) banks +Xmult_mod in `prism_Xmult`. Reaching X3: Ultra Necrozma,
 *  its type the Ultra card's (Dragon: protean_set, so is_type / Energy follow; Monotype still accepts the Psychic it was gained as),
 *  +1 hand size. It keeps banking. */
function prism(card, context) {
  const c = context.consumeable;
  if (!context.using_consumeable || context.blueprint || !c || c.ability.set !== 'Planet') return false;
  const was = necrozma_ultra(card);
  bank(card, 'prism_Xmult', 'Xmult_mod', 1, 'XMULT');
  if (!was && necrozma_ultra(card)) {
    protean_set(card, 'Dragon');
    ultra_give(card);
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Ultra Necrozma!', colour: 'GOLD' });
  }
  return true;
}

// ---------------------------------------------------------------- the Gen 7 starters (Rowlet / Litten / Popplio lines)
/** Rowlet line: the RIGHTMOST scored card (by position, as the Shellos line's East Sea: a debuffed card there gets nothing, the end
 *  never shifts inward; a 1-card hand's card is it). */
const rightmost_scored = (context) => { const s = context.scoring_hand || []; return s.length ? s[s.length - 1] : undefined; };
/** Rowlet / Dartrix / Decidueye: the rightmost scored card retriggers `retriggers` times (fixed); Decidueye's Spirit Shackle also gives
 *  X`Xmult_multi` each time it scores (so X1.3 three times with both retriggers). Rowlet / Dartrix carry the unused Xmult_multi so they
 *  can take Energy for Decidueye (the Combee pattern). */
function shackle_calc(card, context) {
  const ex = card.ability.extra;
  if (context.repetition && !context.end_of_round && context.cardarea === G.play && context.other_card === rightmost_scored(context) && !context.other_card.debuff) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  if (ex.shackle && context.individual && !context.end_of_round && context.cardarea === G.play && context.other_card === rightmost_scored(context)) {
    return { x_mult: r3(ex.Xmult_multi), card };
  }
  return undefined;
}
const litten_mult = (card) => r3(card.ability.extra.mult * hands_before());
const incineroar_x = (card) => r3(1 + card.ability.extra.Xmult_mod * hands_before());
/** Popplio line: scored Hearts (is_suit: Wild cards and Smeared Joker count) give +mult, Primarina's Sparkling Aria X`Xmult_multi`. */
function aria_calc(card, context) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Hearts'))) return undefined;
  const ex = card.ability.extra;
  if (ex.aria) return { x_mult: r3(ex.Xmult_multi), card };
  return { mult: r3(ex.mult), card };
}

// ------------------------------------------------------------ Gen 7, batch 1 (#731-756)
/** Pikipek / Trumbeak, Multi-hit: each hand hits 2-5 times, rolled ONCE a hand in `before` (not Blueprint, not a joker retrigger) on
 *  the run's seeded stream (seed 'poke_multi_hit'), at the main series' Gen 5+ odds: 2 or 3 hits 35% each, 4 or 5 hits 15% each
 *  (3.1 on average). The roll is kept on the joker (`hits`, for the tooltip and a Blueprint copy, which gives the same hits); joker_main
 *  gives +mult per hit. A debuffed hand (The Eye, The Psychic...) has no `before` pass: no roll, no Mult. Toucannon's Skill Link is always
 *  5 hits (MULTI_HIT_MAX). The hit count is fixed (never energized); Energy raises the per-hit number. */
export const MULTI_HIT = [[2, 0.35], [3, 0.35], [4, 0.15], [5, 0.15]];
export const MULTI_HIT_MAX = 5;
export function multi_hit_roll() {
  const r = pseudorandom(pseudoseed('poke_multi_hit'));
  let acc = 0;
  for (const [n, p] of MULTI_HIT) { acc += p; if (r < acc) return n; }
  return MULTI_HIT_MAX;
}
function multi_hit(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
    ex.hits = multi_hit_roll();
    card_eval_status_text(card, 'extra', null, null, null, { message: ex.hits + ' hits!', colour: 'MULT' });
    return undefined;
  }
  if (context.joker_main && ex.hits > 0) { const m = r3(ex.mult * ex.hits); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
  return undefined;
}
/** Toucannon, Skill Link: always 5 hits, each X(Xmult_multi): one X of Xmult_multi^5 (X1.1 -> X1.61051) in joker_main. */
const skill_link_x = (card) => Math.pow(card.ability.extra.Xmult_multi, MULTI_HIT_MAX);
/** Yungoos / Gumshoos, Stakeout: the poker hand played differs from the LAST poker hand played this run. The run's record is Pokermon's
 *  own G.GAME.poke_last_hand (systems/rules.js calculate: set in the mod's `after` pass of every hand, a debuffed one too), so it is
 *  kept with or without a Yungoos and a late buy sees it; during scoring it still names the PREVIOUS hand. The run's first hand (no
 *  record yet) counts as different. */
export const stakeout_on = (context) => !!(context.scoring_name && context.scoring_name !== (G.GAME && G.GAME.poke_last_hand));
const last_hand_vars = () => { const h = G.GAME && G.GAME.poke_last_hand; return h ? localize(h, 'poker_hands') : 'none yet'; };
/** Crabrawler / Crabominable, Power-Up Punch: the FIRST scored card (scoring_hand[0], by position: a debuffed card there scores nothing,
 *  the first never shifts inward) permanently gains +mult_mod Mult (Crabominable: +mult_mod2), every other scored card +mult_mod
 *  (Crabominable only) — Steamodded's perma_mult (Hiker's way: the card keeps it and gives it each time it scores AFTER this; a
 *  retrigger of the card gains again, as Hiker). Never from a Blueprint (blueprint_compat false: the gain is the whole joker). */
function power_up_punch(card, context, all) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.scoring_hand) || context.blueprint) return undefined;
  const ex = card.ability.extra, first = context.other_card === context.scoring_hand[0];
  const gain = first ? (all ? ex.mult_mod2 : ex.mult_mod) : all ? ex.mult_mod : 0;
  if (!gain) return undefined;
  const a = context.other_card.ability;
  a.perma_mult = r3((a.perma_mult || 0) + gain);
  return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
}
/** Oricorio's dance styles: the suit held most on the round's first deal picks one (Castform's moment and counting: is_suit, so a Wild
 *  card counts for all four suits and a debuffed / suitless card for none; but the four suits apart, no red pair). A tie for the most, or
 *  no suited card, keeps the current style. The style STAYS between rounds (ability.extra.form; no evolution). Its type follows the style
 *  (ability.extra.ptype, Castform's / Greninja's way: a Tera sticker still owns the type); the shop card is Baile (Fire). */
export const ORICORIO_STYLES = {
  baile: { name: 'Baile Style', suit: 'Hearts', ptype: 'Fire' },
  pompom: { name: 'Pom-Pom Style', suit: 'Diamonds', ptype: 'Lightning' },
  pau: { name: 'Pa\'u Style', suit: 'Spades', ptype: 'Psychic' },
  sensu: { name: 'Sensu Style', suit: 'Clubs', ptype: 'Psychic' },
};
const STYLE_OF_SUIT = { Hearts: 'baile', Diamonds: 'pompom', Spades: 'pau', Clubs: 'sensu' };
export function dance_pick(cards, current) {
  const n = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
  for (const c of cards || []) for (const s of Object.keys(n)) if (c.is_suit(s)) n[s] += 1;
  const top = Math.max(...Object.values(n));
  const best = Object.keys(n).filter((s) => n[s] === top);
  return top > 0 && best.length === 1 ? STYLE_OF_SUIT[best[0]] : current;
}
export const style_of = (card) => (ORICORIO_STYLES[card.ability.extra.form] ? card.ability.extra.form : 'baile');
function oricorio_set(card, style) {
  const ex = card.ability.extra, t = ORICORIO_STYLES[style].ptype;
  const changed = ex.form !== style || ex.ptype !== t;
  ex.form = style;
  ex.ptype = t;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
  emit('card_changed', { card: card.sort_id });
}
function revelation_dance(card, context) {
  if (first_deal(card, context, 'dance_round')) {
    card.ability.extra.dance_round = G.GAME.round;
    const s = dance_pick(G.hand.cards, style_of(card));
    oricorio_set(card, s);
    card_eval_status_text(card, 'extra', null, null, null, { message: ORICORIO_STYLES[s].name + '!', colour: 'FILTER' });
    return undefined;
  }
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(ORICORIO_STYLES[style_of(card)].suit)) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
/** Cutiefly / Ribombee, the first Fairy team count (Barboach / Starly's: is_type, so a Tera sticker counts and replaces; not debuffed;
 *  itself always included, +1, so the shop card shows what it gives once bought). */
const fairy_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Fairy')).length + 1;
/** Wishiwashi, Schooling: School Form while the hands left BEFORE this hand are at least half the round's hands, rounded up (4 hands: the
 *  1st-3rd hands; 5: the 1st-3rd; 3: the 1st-2nd). The round's hands = hands already played + hands left before this one, so a hand
 *  given at the round's start (Kyogre, Burglar) counts in both. While a hand scores run.js has already taken it (hands_left is one less):
 *  `scoring` adds it back. Out of a round (the shop) it is the next round's first hand: School. */
export function school_on(scoring) {
  const GM = G.GAME, cr = GM && GM.current_round;
  if (!cr || !GM.facing_blind) return true;
  const before = (cr.hands_left || 0) + (scoring ? 1 : 0);
  const total = (cr.hands_played || 0) + before;
  return before >= Math.ceil(total / 2);
}
/** Mareanie / Toxapex, Merciless: the Boss Blinds beaten this run, Pokermon's own run record G.GAME.poke_bosses_beaten (systems/rules.js
 *  calculate: +1 in the end-of-round pass of a won Boss Blind, with or without a Mareanie), so a late buy counts every one. */
export const bosses_beaten = () => (G.GAME && G.GAME.poke_bosses_beaten) || 0;
/** Dewpider / Araquanid, Water Bubble: scored Clubs (is_suit) +chips Chips, Araquanid also X(Xmult_multi); both DOUBLED while it's raining
 *  (Swift Swim's check, swift_swim_raining / rain_read: Clubs held most on the round's first deal, or a working Kyogre). Doubled X means
 *  its bonus doubles: X(1 + 2 x (X - 1)), X1.25 -> X1.5. */
function water_bubble(card, context, x) {
  if (rain_read(card, context)) return undefined;
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Clubs'))) return undefined;
  const ex = card.ability.extra, k = swift_swim_raining(card) ? 2 : 1;
  const r = { chips: r3(ex.chips * k), card };
  if (x) r.x_mult = r3(1 + k * (ex.Xmult_multi - 1));
  return r;
}
/** Fomantis / Lurantis, Solar Blade: the round's FINAL hand (final_hand: hands_left 0 while it scores, i.e. 1 before it is played). */
const final_vars = () => (G.GAME && G.GAME.facing_blind && G.GAME.current_round.hands_left <= 1 ? 'Active!' : 'Inactive');
/** Morelull / Shiinotic: Lucky cards in the full deck (has_enhancement: a quantum Lucky counts). */
const lucky_in_deck = () => (G.playing_cards || []).filter((c) => unbroken(c) && has_enhancement(c, 'm_lucky')).length;
const glow_mult = (card) => r3(card.ability.extra.mult * lucky_in_deck() + (card.ability.extra.glow_mult || 0));

// ---------------------------------------------------------------- Gen 7, batch 2 (contentRev 65; the owner's "Yes build it", 2026-11-02), #757-784
/** Salandit: its gender, rolled when it is OBTAINED (add_to_deck, if none yet: Glameow's / Furfrou's moment, never on creation, so a shop
 *  card has none), the run's seeded pseudorandom 'salandit_gender', 50/50; kept on ability.extra.gender (save / resume re-play it). Only a ♀
 *  evolves (5 rounds, level_evo); a ♂ never counts down (Everstone or not). */
const salandit_gender = (card) => (card.ability.extra.gender === 'male' || card.ability.extra.gender === 'female' ? card.ability.extra.gender : null);
const queen_scores = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 12);
function salandit_state(card) {
  const g = salandit_gender(card);
  if (!g) return 'Gender rolled when obtained';
  return g === 'female' ? gender_name(g) : gender_name(g) + ': never evolves';
}
/** Bewear, Strong hug: at end of round (the main pass, not Blueprint), 1 in `dem` (pseudorandom_probability 'bewear': Oops! All 6s doubles the
 *  odds, as every Pokermon roll) to destroy the Joker directly to its RIGHT — Ceremonial Dagger's slice (getting_sliced + start_dissolve), so an
 *  Eternal one or one already being destroyed is skipped, a joker that refuses (Komala's Comatose, Nacho's Passimian) stays, and Drifblim /
 *  Pyukumuku still pay on leaving. Nothing to its right: no roll at all. */
function strong_hug(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over || card.getting_sliced) return undefined;
  const i = G.jokers.cards.indexOf(card), right = i >= 0 ? G.jokers.cards[i + 1] : undefined;
  if (!right || !can_be_destroyed_by_joker(right) || right.getting_sliced) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'bewear', ex.num, ex.dem, 'bewear')) return undefined;
  right.getting_sliced = true;
  G.E_MANAGER.add_event(() => {
    card.juice_up(0.8, 0.8);
    right.start_dissolve();
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Strong Hug!', colour: 'MULT' });
  return undefined;
}
/** Comfey, Floral Gift: a joker that can take Energy now — a Pokémon Joker (a table `extra` with a ptype) with an Energy field
 *  (energy_values) that is under its cap (can_increase_energy: 3 + energy_plus + its own bonus, or unlimited). Never Comfey itself. */
const can_take_energy = (j) => !!(j && !j.removed && !j.getting_sliced && j.ability && j.ability.extra && typeof j.ability.extra === 'object' && j.ability.extra.ptype
  && Object.keys(energy_values).some((f) => typeof j.ability.extra[f] === 'number') && can_increase_energy(j));
export const comfey_targets = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && can_take_energy(j));
/** At end of round (the main pass, not Blueprint): 1 in `dem` (pseudorandom_probability 'comfey', Oops! doubles it) to give +1 Energy to a
 *  random eligible OTHER Pokémon Joker (the run's seeded pseudorandom_element 'comfey'); none eligible, no roll. The gift goes through
 *  increment_energy as a 'Trans' Energy (the Mystery Egg's): full strength on any type (as a matching Energy card), one energy_count, so the
 *  cap holds and it carries through evolution. It is not an Energy CARD: Porygon-Z / Gastrodon / Fusion Flare don't count it. */
function floral_gift(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return undefined;
  const pool = comfey_targets(card);
  if (!pool.length) return undefined;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'comfey', ex.num, ex.dem, 'comfey')) return undefined;
  const [t] = pseudorandom_element(pool, pseudoseed('comfey'));
  increment_energy(t, 'Trans');
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Floral Gift!', colour: 'GREEN' });
  return undefined;
}
function sand_castle(card, context) {
  const ex = card.ability.extra;
  if (stone_scored(context) && !context.blueprint && !context.retrigger_joker) {
    if (ex.Xmult_mod !== undefined) {
      ex.castle_Xmult = r3((ex.castle_Xmult || 1) + ex.Xmult_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.castle_Xmult), colour: 'XMULT' });
    } else {
      ex.castle_chips = r3(ex.castle_chips + ex.chip_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: a_chips(ex.castle_chips), colour: 'CHIPS' });
    }
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const r = {};
  if (ex.castle_chips > 0) r.chip_mod = ex.castle_chips;
  if (ex.castle_Xmult > 1) r.Xmult_mod = ex.castle_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_chips(r3(r.chip_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'CHIPS';
  return r;
}
/** Jangmo-o / Hakamo-o, Clangorous Scales: each hand played whose poker hand IS a Full House (scoring_name: a Flush House is its own hand
 *  and doesn't count, Larvitar's rule) banks +mult_mod Mult (`clang_mult`, no energy field), in `before`, not Blueprint; given every hand. */
function clangorous(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.scoring_name === 'Full House' && !context.blueprint && !context.retrigger_joker && ex.mult_mod !== undefined) {
    ex.clang_mult = r3(ex.clang_mult + ex.mult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: a_mult(ex.clang_mult), colour: 'MULT' });
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const r = {};
  if (ex.clang_mult > 0) r.mult_mod = ex.clang_mult;
  if (ex.Xmult_mod !== undefined) { const x = kommo_x(card); if (x > 1) r.Xmult_mod = x; }
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Kommo-o: the run's Full Houses (G.GAME.hands['Full House'].played: run.js counts the hand before the jokers score, never resets it in a run,
 *  so a Kommo-o bought late counts every one and the hand being played already counts). */
export const full_houses_played = () => (G.GAME && G.GAME.hands && G.GAME.hands['Full House'] && G.GAME.hands['Full House'].played) || 0;
const kommo_x = (card) => r3(1 + card.ability.extra.Xmult_mod * full_houses_played());

export const JOKERS = {

  // ---------------------------------------------------------------- Gen 7, batch 3: the Ultra Beasts, 793-799 / 803-806 (contentRev 66)
  // The owner's design ("Yes build it and merge when the gate passes", 2026-11-02). Rare $7 single-stage Basics, but Poipole (Common $5)
  // -> Naganadel (Safari $8, after 5 rounds). Types from the card art (pokermon_art_type.mjs): Nihilego Dark, Buzzwole Fighting, Pheromosa
  // Grass, Xurkitree Lightning, Celesteela Metal, Kartana Grass, Guzzlord Dragon, Poipole Dark, Naganadel Dragon, Stakataka Earth,
  // Blacephalon Psychic. Every one carries the `ultra_beast` attribute (nothing reads it yet but the wiki). Neither Nacho nor Pokermon+
  // has any. Art: upstream 3.9.1's own Natdex cells with their floating souls ({24,52} ... {20,53}). After Kommo-o (784) in Pokédex order.
  // BEAST BOOST (shared, solo): each Boss Blind beaten permanently raises the joker's main number (`poke_beast_boost`) by 10% of its
  // UNENERGIZED base (`beast_boosts`, a count: beast_value above). Energy raises the main number at its standard rate, the rest is fixed.
  //
  // Nihilego 793 (Dark), Parasite: copies the ability of the Joker to its LEFT (Blueprint mirrored; the compatible / incompatible line).
  // No number of its own: Beast Boost has nothing to raise and it is Energy-inert (poke_no_energy_field).
  nihilego: {
    name: 'nihilego', poke_sprite391: sprite('Natdex', 24, 52, [25, 52]),
    config: { extra: {} },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'copy'], poke_after: 'mega_drampa',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const main_end = G.jokers && card.area === G.jokers ? blueprint_compat_line(nihilego_target(card)) : undefined;
      return { vars: [], main_end };
    },
    calculate(self, card, context) {
      const left = nihilego_target(card);
      if (!left) return undefined;
      const ret = blueprint_effect(card, left, context);
      if (ret) ret.colour = 'BLACK';
      return ret;
    },
    update(self, card) {
      if (G.jokers && card.area === G.jokers) {
        const left = nihilego_target(card);
        card.ability.blueprint_compat = (left && !left.debuff && left.config.center.blueprint_compat && 'compatible') || 'incompatible';
      }
    },
  },
  // Buzzwole 794 (Fighting), Muscle: X3 Mult (`Xmult` +20%: 3.6 / 4.2 / 4.8; Beast Boost +X0.3 each) and -1 hand size (fixed).
  buzzwole: {
    name: 'buzzwole', poke_sprite391: sprite('Natdex', 26, 52, [27, 52]),
    config: { extra: { Xmult: 3, h_size: -1, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'hand_size', 'scaling'], poke_after: 'nihilego', poke_beast_boost: 'Xmult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), -card.ability.extra.h_size, ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = beast_value(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...hand_size,
  },
  // Pheromosa 795 (Grass), Glass Cannon: X3 Mult on the first 2 hands of each round (`Xmult` +20%: 3.6 / 4.2 / 4.8; Beast Boost +X0.3);
  // after the 2nd hand scores it is debuffed (source 'pheromosa') until the round ends, when it recovers (index.js end_round_start:
  // before any end_of_round, so it still takes its Beast Boost). Blueprint copies the X while Pheromosa is fresh.
  pheromosa: {
    name: 'pheromosa', poke_sprite391: sprite('Natdex', 28, 52, [29, 52]),
    config: { extra: { Xmult: 3, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'scaling', 'debuff'], poke_after: 'buzzwole', poke_beast_boost: 'Xmult',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const tired = !!(card.ability.debuff_sources && card.ability.debuff_sources.pheromosa);
      const left = tired ? 0 : Math.max(0, PHEROMOSA_HANDS - ((G.GAME && G.GAME.facing_blind && G.GAME.current_round.hands_played) || 0));
      return { vars: [r3(beast_value(card)), PHEROMOSA_HANDS, ...beast_vars(card), tired ? 'Tired until the round ends' : left + '/' + PHEROMOSA_HANDS + ' hands left'] };
    },
    calculate(self, card, context) {
      if (pheromosa_tire(card, context) || beast_boost(card, context)) return undefined;
      if (context.joker_main && (G.GAME.current_round.hands_played || 0) < PHEROMOSA_HANDS) {
        const x = beast_value(card);
        return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      }
      return undefined;
    },
  },
  // Xurkitree 796 (Lightning), Live Wire: each card held in hand (not debuffed) gives +4 Mult when a hand scores (Baron's held shape:
  // Mime retriggers it). `mult` +40%: 5.6 / 7.2 / 8.8; Beast Boost +0.4 each.
  xurkitree: {
    name: 'xurkitree', poke_sprite391: sprite('Natdex', 0, 53, [1, 53]),
    config: { extra: { mult: 4, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'mult', 'scaling'], poke_after: 'pheromosa', poke_beast_boost: 'mult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff) return { h_mult: beast_value(card), card };
      return undefined;
    },
  },
  // Celesteela 797 (Metal), Launch: its sell value rises by $1 at the end of each round (Egg's way: extra_value, `val_gain` fixed; not
  // Blueprint) and it gives X1 plus X0.05 per $1 of its CURRENT sell value (`Xmult_mod` +20%: 0.06 / 0.07 / 0.08; Beast Boost +X0.005
  // per $1 each). Blueprint copies the X.
  celesteela: {
    name: 'celesteela', poke_sprite391: sprite('Natdex', 2, 53, [3, 53]),
    config: { extra: { Xmult_mod: 0.05, val_gain: 1, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'economy', 'scaling'], poke_after: 'xurkitree', poke_beast_boost: 'Xmult_mod',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), card.ability.extra.val_gain, ...beast_vars(card), r3(launch_x(card))] }; },
    calculate(self, card, context) {
      beast_boost(card, context);
      if (round_end(context) && !context.blueprint && !context.retrigger_joker) {
        card.ability.extra_value = (card.ability.extra_value || 0) + card.ability.extra.val_gain;
        card.set_cost();
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_val_up'), colour: 'MONEY' });
        return undefined;
      }
      if (context.joker_main) { const x = launch_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Kartana 798 (Grass), Sacred Sword: when the played hand has exactly 1 scoring card, that card retriggers 3 times (`retriggers`, fixed)
  // and gives X2 each time it scores (`Xmult_multi` +5%: 2.1 / 2.2 / 2.3; Beast Boost +X0.2 each). Blueprint copies both.
  kartana: {
    name: 'kartana', poke_sprite391: sprite('Natdex', 4, 53, [5, 53]),
    config: { extra: { Xmult_multi: 2, retriggers: 3, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'retrigger', 'scaling'], poke_after: 'celesteela', poke_beast_boost: 'Xmult_multi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), card.ability.extra.retriggers, ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      const lone = context.cardarea === G.play && !context.end_of_round && context.scoring_hand && context.scoring_hand.length === 1 && context.other_card === context.scoring_hand[0];
      if (lone && context.repetition && !context.other_card.debuff) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      if (lone && context.individual) return { x_mult: r3(beast_value(card)), card };
      return undefined;
    },
  },
  // Guzzlord 799 (Dragon), Gluttony: when a Blind is selected, destroys your LEFTMOST consumable and gains X0.2 Mult (`gluttony_Xmult`
  // from X1, no energy field; the gain `Xmult_mod` +20%: 0.24 / 0.28 / 0.32, future meals only). Nothing held, nothing. Beast Boost +X0.1
  // each (10% of the X1 base). Not Blueprint for the meal; Blueprint copies the X.
  guzzlord: {
    name: 'guzzlord', poke_sprite391: sprite('Natdex', 6, 53, [7, 53]),
    config: { extra: { gluttony_Xmult: 1, Xmult_mod: 0.2, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'scaling', 'consumable'], poke_after: 'kartana', poke_beast_boost: 'gluttony_Xmult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_mod), r3(beast_value(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (gluttony(card, context) || beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = beast_value(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Poipole 803 (Dark, Common $5): +2 Mult for each Dragon Joker (undebuffed, is_type: a Tera sticker counts; Poipole itself isn't one).
  // `mult` +40%: 2.8 / 3.6 / 4.4; Beast Boost +0.2 each. Evolves after 5 rounds into Naganadel (its Beast Boosts and Energy carry over).
  poipole: {
    name: 'poipole', poke_sprite391: sprite('Natdex', 14, 53, [15, 53]),
    config: { extra: { mult: 2, rounds: 5, beast_boosts: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'mult', 'types', 'scaling', 'round_evo'], poke_after: 'guzzlord', poke_beast_boost: 'mult',
    poke_custom_values_to_keep: ['beast_boosts'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(beast_value(card)), dragon_count(), r3(poipole_mult(card)), ...beast_vars(card), ex.rounds] }; },
    calculate(self, card, context) {
      beast_boost(card, context);
      if (context.joker_main) { const m = poipole_mult(card); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_naganadel');
    },
  },
  // Naganadel 804 (Dragon, Safari $8), Dragon Pulse: X1.5 Mult plus X0.25 for each Dragon Joker, itself included (`Xmult` +20%: 1.8 / 2.1
  // / 2.4, `Xmult_mod` +20%: 0.3 / 0.35 / 0.4; Beast Boost +X0.15 each, on the X1.5).
  naganadel: {
    name: 'naganadel', poke_sprite391: sprite('Natdex', 16, 53, [17, 53]),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.25, beast_boosts: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'types', 'scaling'], poke_after: 'poipole', poke_beast_boost: 'Xmult',
    poke_custom_values_to_keep: ['beast_boosts'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), r3(card.ability.extra.Xmult_mod), r3(naganadel_x(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = naganadel_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Stakataka 805 (Earth), Stone Wall: each Stone card held in hand (not debuffed) gives X1.25 Mult when a hand scores — the joker's own
  // held-card pass (Baron's shape: Mime retriggers it; a Stone card has no held effect of its own). `Xmult_multi` +5%: 1.3125 / 1.375 /
  // 1.4375; Beast Boost +X0.125 each.
  stakataka: {
    name: 'stakataka', poke_sprite391: sprite('Natdex', 18, 53, [19, 53]),
    config: { extra: { Xmult_multi: 1.25, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'enhancements', 'scaling'], poke_after: 'naganadel', poke_beast_boost: 'Xmult_multi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); return { vars: [r3(beast_value(card)), ...beast_vars(card)] }; },
    calculate(self, card, context) {
      if (beast_boost(card, context)) return undefined;
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_stone')) {
        return { x_mult: r3(beast_value(card)), card };
      }
      return undefined;
    },
  },
  // Blacephalon 806 (Psychic), Mind Blown: X3 Mult (`Xmult` +20%: 3.6 / 4.2 / 4.8; Beast Boost +X0.3 each); each hand played costs $2
  // (`recoil`, fixed; Staraptor's Recoil: never past the debt limit). Blueprint copies the X only.
  blacephalon: {
    name: 'blacephalon', poke_sprite391: sprite('Natdex', 20, 53, [21, 53]),
    config: { extra: { Xmult: 3, recoil: 2, beast_boosts: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['ultra_beast', 'xmult', 'economy', 'scaling'], poke_after: 'stakataka', poke_beast_boost: 'Xmult',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(beast_value(card)), card.ability.extra.recoil, ...beast_vars(card)] }; },
    calculate(self, card, context) {
      recoil(card, context);
      if (beast_boost(card, context)) return undefined;
      if (context.joker_main) { const x = beast_value(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- the Gen 7 starters (contentRev 48)
  // The owner's "build" (2026-10-28, the Gen 5-9 starters spec). Pokermon's starter rules: the type perk at every stage (Grass +1 hand
  // size like Bulbasaur, Fire +1 discard like Charmander, Water +1 hand like Squirtle; fixed, never Energy), Basic Uncommon $5 with the
  // 'starter' attribute (`starter: true`: the Starter Pack's Grass / Fire / Water slot), Stage 1 Safari $8, Stage 2 Safari $10;
  // evolution by rounds, 5 then 5 (level_evo). Types are the cards' (upstream 3.9.1 draws all nine on the Natdex sheet, row 48: Rowlet
  // {2,48} ... Primarina {18,48}). No banked values: every number is read live. Neither Nacho nor Pokermon+ has these lines.
  // Rowlet 722: +1 hand size; the rightmost scored card retriggers once. Energy: carries Decidueye's per-card X (Xmult_multi, +5%).
  rowlet: {
    name: 'rowlet', poke_sprite391: sprite('Natdex', 2, 48),
    config: { extra: { h_size: 1, retriggers: 1, Xmult_multi: 1.3, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'position', 'round_evo'], poke_after: 'volcanion',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.retriggers, ex.rounds, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return shackle_calc(card, context) || level_evo(self, card, context, 'j_poke_dartrix'); },
    ...hand_size,
  },
  // Dartrix 723: +1 hand size; the rightmost scored card retriggers twice.
  dartrix: {
    // (+ regional batch C: a Fighting Energy used on it evolves it into Hisuian Decidueye — systems/energy.js energy_evo_target, from HISUI_REV)
    poke_energy_evo: { etype: 'Fighting', into: 'j_poke_hisuian_decidueye', rev: HISUI_REV },
    name: 'dartrix', poke_sprite391: sprite('Natdex', 4, 48),
    config: { extra: { h_size: 1, retriggers: 2, Xmult_multi: 1.3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'position', 'round_evo'], poke_after: 'rowlet',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.retriggers, ex.rounds, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return shackle_calc(card, context) || level_evo(self, card, context, 'j_poke_decidueye'); },
    ...hand_size,
  },
  // Decidueye 724: +1 hand size; Spirit Shackle, the rightmost scored card retriggers twice and gives X1.3 Mult each time it scores.
  decidueye: {
    name: 'decidueye', poke_sprite391: sprite('Natdex', 6, 48),
    config: { extra: { h_size: 1, retriggers: 2, Xmult_multi: 1.3, shackle: true } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'position', 'xmult'], poke_after: 'dartrix',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.retriggers, r3(ex.Xmult_multi), r3(Math.pow(ex.Xmult_multi, ex.retriggers + 1))] }; },
    calculate(self, card, context) { return shackle_calc(card, context); },
    ...hand_size,
  },
  // Litten 725: +1 discard; +2 Mult for each hand already played this round (the hands BEFORE this one: the round's first hand +0).
  // Energy: `mult` +40% (2 -> 2.8 / 3.6 / 4.4).
  litten: {
    name: 'litten', poke_sprite391: sprite('Natdex', 8, 48),
    config: { extra: { d_size: 1, mult: 2, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 7, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'mult', 'round_evo'], poke_after: 'decidueye',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), litten_mult(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && hands_before() > 0) { const m = litten_mult(card); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_torracat');
    },
    ...discards,
  },
  // Torracat 726: +1 discard; +4 Mult for each hand already played this round. Energy: `mult` +40% (4 -> 5.6 / 7.2 / 8.8).
  torracat: {
    name: 'torracat', poke_sprite391: sprite('Natdex', 10, 48),
    config: { extra: { d_size: 1, mult: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'discard', 'mult', 'round_evo'], poke_after: 'litten',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), litten_mult(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && hands_before() > 0) { const m = litten_mult(card); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_incineroar');
    },
    ...discards,
  },
  // Incineroar 727: +1 discard; X(1 + 0.25 per hand already played this round): X1 / X1.25 / X1.5 / X1.75 on hands 1-4.
  // Energy: `Xmult_mod` +20% (0.25 -> 0.3 / 0.35 / 0.4).
  incineroar: {
    name: 'incineroar', poke_sprite391: sprite('Natdex', 12, 48),
    config: { extra: { d_size: 1, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'discard', 'xmult'], poke_after: 'torracat',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_mod), incineroar_x(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main && hands_before() > 0) { const x = incineroar_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    ...discards,
  },
  // Popplio 728: +1 hand; scored Hearts give +3 Mult. Energy: `mult` +40% (3 -> 4.2 / 5.4 / 6.6).
  popplio: {
    name: 'popplio', poke_sprite391: sprite('Natdex', 14, 48),
    config: { extra: { hands: 1, mult: 3, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'mult', 'suit', 'hearts', 'round_evo'], poke_after: 'incineroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return aria_calc(card, context) || level_evo(self, card, context, 'j_poke_brionne'); },
    ...hands,
  },
  // Brionne 729: +1 hand; scored Hearts give +5 Mult. Energy: `mult` +40% (5 -> 7 / 9 / 11).
  brionne: {
    name: 'brionne', poke_sprite391: sprite('Natdex', 16, 48),
    config: { extra: { hands: 1, mult: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hands', 'mult', 'suit', 'hearts', 'round_evo'], poke_after: 'popplio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return aria_calc(card, context) || level_evo(self, card, context, 'j_poke_primarina'); },
    ...hands,
  },
  // Primarina 730: +1 hand; Sparkling Aria, scored Hearts give X1.2 Mult. Energy: `Xmult_multi` +5% (1.2 -> 1.26 / 1.32 / 1.38).
  primarina: {
    name: 'primarina', poke_sprite391: sprite('Natdex', 18, 48),
    config: { extra: { hands: 1, Xmult_multi: 1.2, aria: true } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['starter', 'hands', 'xmult', 'suit', 'hearts'], poke_after: 'brionne',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return aria_calc(card, context); },
    ...hands,
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
  // ---------------------------------------------------------------- Gen 7, batch 1 (contentRev 64; the owner's "Yes build it", 2026-11-02), #731-756
  // Pikipek 731 (Colorless, Uncommon $6; 3-stage), Multi-hit: each hand hits 2-5 times (seeded, Gen 5+ odds 35/35/15/15%), +3 Mult per
  // hit (`mult` +40%: 4.2 / 5.4 / 6.6 a hit; the hit count fixed). 4 rounds (an early evolver).
  pikipek: {
    name: 'pikipek', poke_sprite391: sprite('Natdex', 20, 48),
    config: { extra: { mult: 3, hits: 0, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'chance', 'round_evo'], poke_after: 'primarina',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.hits || '-', ex.rounds] }; },
    calculate(self, card, context) { return multi_hit(card, context) || level_evo(self, card, context, 'j_poke_trumbeak'); },
  },
  // Trumbeak 732 (Safari $8): 2-5 hits, +5 Mult per hit (`mult` +40%: 7 / 9 / 11). 5 rounds.
  trumbeak: {
    name: 'trumbeak', poke_sprite391: sprite('Natdex', 22, 48),
    config: { extra: { mult: 5, hits: 0, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'chance', 'round_evo'], poke_after: 'pikipek',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.hits || '-', ex.rounds] }; },
    calculate(self, card, context) { return multi_hit(card, context) || level_evo(self, card, context, 'j_poke_toucannon'); },
  },
  // Toucannon 733 (Safari $10), Skill Link: always 5 hits, each X1.1 (`Xmult_multi` +5%, a per-hit X: 1.155 / 1.21 / 1.265 a hit), scored
  // as ONE X of the five: X1.611 (X2.061 / X2.594 / X3.236 energized).
  toucannon: {
    name: 'toucannon', poke_sprite391: sprite('Natdex', 24, 48),
    config: { extra: { Xmult_multi: 1.1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'trumbeak',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi), MULTI_HIT_MAX, r3(skill_link_x(card))] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = skill_link_x(card);
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  // Yungoos 734 (Colorless, Common $5), Stakeout: +15 Mult if the poker hand differs from the last poker hand played this run (the run's
  // first hand counts as different; `mult` +40%: 21 / 27 / 33). 4 rounds.
  yungoos: {
    name: 'yungoos', poke_sprite391: sprite('Natdex', 26, 48),
    config: { extra: { mult: 15, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'hand_type', 'round_evo'], poke_after: 'toucannon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), last_hand_vars(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && stakeout_on(context)) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_gumshoos');
    },
  },
  // Gumshoos 735 (Safari $8): X2 under the same condition (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  gumshoos: {
    name: 'gumshoos', poke_sprite391: sprite('Natdex', 28, 48),
    config: { extra: { Xmult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'hand_type'], poke_after: 'yungoos',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult), last_hand_vars()] }; },
    calculate(self, card, context) {
      if (context.joker_main && stakeout_on(context)) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Crabrawler 739 (Fighting, Common $5), Power-Up Punch: the first scored card of each hand permanently gains +2 Mult (perma_mult; gain
  // `mult_mod` +20%: 2.4 / 2.8 / 3.2). Not Blueprint. 5 rounds.
  crabrawler: {
    name: 'crabrawler', poke_sprite391: sprite('Natdex', 6, 49),
    config: { extra: { mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 7, blueprint_compat: false,
    attributes: ['mult', 'scaling', 'modify_card', 'round_evo'], poke_after: 'vikavolt',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), ex.rounds] }; },
    calculate(self, card, context) { return power_up_punch(card, context, false) || level_evo(self, card, context, 'j_poke_crabominable'); },
  },
  // Crabominable 740 (Water: its card; Safari $8): every scored card permanently gains +1 Mult (`mult_mod` +20%: 1.2 / 1.4 / 1.6), the first
  // +3 instead (`mult_mod2` +20%: 3.6 / 4.2 / 4.8). Not Blueprint.
  crabominable: {
    name: 'crabominable', poke_sprite391: sprite('Natdex', 8, 49),
    config: { extra: { mult_mod: 1, mult_mod2: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 7, blueprint_compat: false,
    attributes: ['mult', 'scaling', 'modify_card'], poke_after: 'crabrawler',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.mult_mod2)] }; },
    calculate(self, card, context) { return power_up_punch(card, context, true); },
  },
  // Oricorio 741 (Fire: Baile, its own card; Rare $7, single-stage), Dance styles: on each round's first deal the suit held most picks its
  // style (Hearts Baile / Fire, Diamonds Pom-Pom / Lightning, Spades Pa'u / Psychic, Clubs Sensu / Psychic; a tie keeps the style; kept
  // between rounds); scored cards of its style's suit give X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Its type follows the style
  // (Monotype-exempt, Castform's rule); art: the style's 3.9.1 card (the Gen 7 sheet, systems/anim.js GEN7_FORM_SPRITES).
  oricorio: {
    name: 'oricorio', poke_sprite391: sprite('Gen07', 0, 0),
    config: { extra: { Xmult_multi: 1.25, form: 'baile' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'suits', 'types', 'hand_drawn'], poke_after: 'crabominable',
    poke_mono_exempt: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const st = ORICORIO_STYLES[style_of(card)];
      return { vars: [r3(card.ability.extra.Xmult_multi), st.name, localize(st.suit, 'suits_plural')], colours: [st.suit] };
    },
    calculate(self, card, context) { return revelation_dance(card, context); },
  },
  // Cutiefly 742 (Fairy, Common $5): +4 Mult for each Fairy Joker, itself included (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  cutiefly: {
    name: 'cutiefly', poke_sprite391: sprite('Natdex', 12, 49),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'oricorio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = fairy_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * fairy_count(card)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_ribombee');
    },
  },
  // Ribombee 743 (Safari $8): X1, plus X0.25 for each Fairy Joker, itself included (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  ribombee: {
    name: 'ribombee', poke_sprite391: sprite('Natdex', 14, 49),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'cutiefly',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = fairy_count(card); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = r3(1 + card.ability.extra.Xmult_mod * fairy_count(card)); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Wishiwashi 746 (Water, Rare $7, single-stage), Schooling: School Form X2.5 (`Xmult` +20%: 3 / 3.5 / 4) while the hands left before this
  // hand are at least half the round's hands (rounded up); Solo Form +5 Mult (`mult` +40%: 7 / 9 / 11) otherwise. The art follows the form
  // (its School card beside the Solo one on the Gen 7 sheet; poke_view_form, live).
  wishiwashi: {
    name: 'wishiwashi', poke_sprite391: sprite('Gen07', 2, 1),
    config: { extra: { Xmult: 2.5, mult: 5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'mult', 'hands'], poke_after: 'lycanroc_dusk',
    poke_view_form(self, card) { return school_on(false) ? 'school' : 'solo'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.mult), school_on(false) ? 'School Form' : 'Solo Form'] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra;
      if (school_on(true)) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      return { message: a_mult(r3(ex.mult)), colour: 'MULT', mult_mod: ex.mult };
    },
  },
  // Mareanie 747 (Dark, Common $5), Merciless: each scored card gives +1 Mult for each Boss Blind beaten this run (`mult` +40%: 1.4 / 1.8 /
  // 2.2; the run's record, so a late buy counts all). 5 rounds.
  mareanie: {
    name: 'mareanie', poke_sprite391: sprite('Natdex', 22, 49),
    config: { extra: { mult: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'boss', 'round_evo'], poke_after: 'wishiwashi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = bosses_beaten(); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && bosses_beaten() > 0) return { mult: r3(card.ability.extra.mult * bosses_beaten()), card };
      return level_evo(self, card, context, 'j_poke_toxapex');
    },
  },
  // Toxapex 748 (Safari $8): X1, plus X0.25 for each Boss Blind beaten this run (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4).
  toxapex: {
    name: 'toxapex', poke_sprite391: sprite('Natdex', 24, 49),
    config: { extra: { Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'boss'], poke_after: 'mareanie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = bosses_beaten(); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      if (context.joker_main && bosses_beaten() > 0) { const x = r3(1 + card.ability.extra.Xmult_mod * bosses_beaten()); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Dewpider 751 (Water, Common $5), Water Bubble: scored Clubs give +15 Chips (`chips` +30%: 19.5 / 24 / 28.5), doubled while it's raining
  // (Swift Swim's rain). 5 rounds.
  dewpider: {
    name: 'dewpider', poke_sprite391: sprite('Natdex', 0, 50),
    config: { extra: { chips: 15, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'suit', 'clubs', 'hand_drawn', 'round_evo'], poke_after: 'mudsdale',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card), ex.rounds] }; },
    calculate(self, card, context) { return water_bubble(card, context, false) || level_evo(self, card, context, 'j_poke_araquanid'); },
  },
  // Araquanid 752 (Safari $8): scored Clubs give +15 Chips and X1.25 (`chips` +30%; `Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375), both doubled in
  // rain (+30 Chips and X1.5: the X's bonus doubles).
  araquanid: {
    name: 'araquanid', poke_sprite391: sprite('Natdex', 2, 50),
    config: { extra: { chips: 15, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'suit', 'clubs', 'hand_drawn'], poke_after: 'dewpider',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi), rain_state(card), r3(ex.chips * 2), r3(1 + 2 * (ex.Xmult_multi - 1))] }; },
    calculate(self, card, context) { return water_bubble(card, context, true); },
  },
  // Fomantis 753 (Grass, Common $5), Solar Blade: +10 Mult on the round's final hand (`mult` +40%: 14 / 18 / 22). 5 rounds.
  fomantis: {
    name: 'fomantis', poke_sprite391: sprite('Natdex', 4, 50),
    config: { extra: { mult: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'hands', 'round_evo'], poke_after: 'araquanid',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), final_vars(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && G.GAME.facing_blind && final_hand()) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_lurantis');
    },
  },
  // Lurantis 754 (Safari $8): X2.5 on the final hand (`Xmult` +20%: 3 / 3.5 / 4), X3.5 instead while it's sunny (`Xmult2` +20%: 4.2 / 4.9 /
  // 5.6; the shared sun check: a red first deal, a working Groudon, Volcarona).
  lurantis: {
    name: 'lurantis', poke_sprite391: sprite('Natdex', 6, 50),
    config: { extra: { Xmult: 2.5, Xmult2: 3.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'hands', 'hand_drawn'], poke_after: 'fomantis',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), final_vars(), sun_state(card)] }; },
    calculate(self, card, context) {
      if (sun_read(card, context)) return undefined;
      if (!(context.joker_main && G.GAME.facing_blind && final_hand())) return undefined;
      const x = cherrim_sunny(card) ? card.ability.extra.Xmult2 : card.ability.extra.Xmult;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  // Morelull 755 (Fairy, Common $5): +3 Mult for each Lucky card in your full deck (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  morelull: {
    name: 'morelull', poke_sprite391: sprite('Natdex', 8, 50),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'lurantis',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(glow_mult(card)), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = glow_mult(card); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_shiinotic');
    },
  },
  // Shiinotic 756 (Safari $8): Morelull's +3 per Lucky card kept, and permanently +2 Mult each time a scored Lucky card triggers (its Mult or
  // its money roll; both at once count once: Tranquill's lucky_scored) — `glow_mult` banked (never energized), gain `mult_mod` +20%: 2.4 /
  // 2.8 / 3.2. Not Blueprint for the gain.
  shiinotic: {
    name: 'shiinotic', poke_sprite391: sprite('Natdex', 10, 50),
    config: { extra: { mult: 3, glow_mult: 0, mult_mod: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fairy', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'enhancements', 'full_deck', 'chance'], poke_after: 'morelull',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult_mod), r3(ex.glow_mult), r3(glow_mult(card))] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (lucky_scored(context)) {
        if (context.blueprint) return undefined;
        ex.glow_mult = r3(ex.glow_mult + ex.mult_mod);
        return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
      }
      if (context.joker_main) { const m = glow_mult(card); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return undefined;
    },
  },


  // Salandit 757 (Fire, Common $5), Queen: +1 discard each round (fixed); each scored Queen +5 Mult (`mult` +40%: 7 / 9 / 11). Its gender is
  // rolled when obtained: only a ♀ evolves (after 5 rounds), a ♂ never does.
  salandit: {
    name: 'salandit', poke_sprite391: sprite('Natdex', 12, 50),
    config: { extra: { d_size: 1, mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['discard', 'mult', 'rank', 'face', 'round_evo', 'condition_evo'], poke_after: 'shiinotic',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), salandit_state(card), ex.rounds] }; },
    add_to_deck(self, card) {
      discards.add_to_deck(self, card);
      if (!salandit_gender(card)) card.ability.extra.gender = pseudorandom(pseudoseed('salandit_gender')) < 0.5 ? 'female' : 'male';
    },
    remove_from_deck: discards.remove_from_deck,
    calculate(self, card, context) {
      if (queen_scores(context)) return { mult: card.ability.extra.mult, card };
      if (salandit_gender(card) === 'female') return level_evo(self, card, context, 'j_poke_salazzle');
      return undefined;
    },
  },
  // Salazzle 758 (Safari $8): +1 discard each round; each scored Queen X1.5 Mult (`Xmult_multi` +5%: 1.575 / 1.65 / 1.725).
  salazzle: {
    name: 'salazzle', poke_sprite391: sprite('Natdex', 14, 50),
    config: { extra: { d_size: 1, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 7, blueprint_compat: true,
    attributes: ['discard', 'xmult', 'rank', 'face'], poke_after: 'salandit',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return queen_scores(context) ? { x_mult: card.ability.extra.Xmult_multi, card } : undefined; },
    ...discards,
  },
  // Stufful 759 (Fighting: its card; Common $5): +40 Chips (`chips` +30%: 52 / 64 / 76) and +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  stufful: {
    name: 'stufful', poke_sprite391: sprite('Natdex', 16, 50),
    config: { extra: { chips: 40, mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'mult', 'round_evo'], poke_after: 'salazzle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra; return { message: a_mult(r3(ex.mult)), colour: 'MULT', chip_mod: ex.chips, mult_mod: ex.mult }; }
      return level_evo(self, card, context, 'j_poke_bewear');
    },
  },
  // Bewear 760 (Safari $8), Strong hug: X2.5 Mult (`Xmult` +20%: 3 / 3.5 / 4). At end of round, 1 in 4 (fixed odds) to destroy the Joker
  // directly to its right (strong_hug; not Eternal; nothing if none). Not Blueprint (it copies the X only).
  bewear: {
    name: 'bewear', poke_sprite391: sprite('Natdex', 18, 50),
    config: { extra: { Xmult: 2.5, num: 1, dem: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'chance', 'joker', 'position'], poke_after: 'stufful',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [n, d] = get_probability_vars(card, ex.num, ex.dem, 'bewear');
      const i = G.jokers ? G.jokers.cards.indexOf(card) : -1, right = i >= 0 ? G.jokers.cards[i + 1] : undefined;
      return { vars: [r3(ex.Xmult), n, d, right ? (right.ability.eternal ? 'Eternal: safe' : !can_be_destroyed_by_joker(right) ? 'Comatose: safe' : 'In its arms: ' + localize({ type: 'name_text', set: 'Joker', key: right.config.center.key })) : 'Nothing to its right'] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return strong_hug(card, context);
    },
  },
  // Comfey 764 (Fairy, Rare $7), Floral Gift: at end of round, 1 in 3 (fixed odds) to give +1 Energy to a random OTHER Pokémon Joker that can
  // still take one (floral_gift). Energy-inert itself (it has no number).
  comfey: {
    name: 'comfey', poke_sprite391: sprite('Natdex', 26, 50),
    config: { extra: { num: 1, dem: 3 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fairy', gen: 7, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['energy', 'chance', 'joker'],
    poke_after: 'bewear',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [n, d] = get_probability_vars(card, ex.num, ex.dem, 'comfey');
      const k = G.jokers && G.jokers.cards.includes(card) ? comfey_targets(card).length : null;
      return { vars: [n, d, k === null ? 'Picks among your Jokers' : k === 1 ? '1 Joker can take it' : k + ' Jokers can take it'] };
    },
    calculate(self, card, context) { return floral_gift(card, context); },
  },
  // Sandygast 769 (Psychic: its card; Common $5), Sand castle: permanently +10 Chips each time a Stone card scores (`castle_chips` banked; gain
  // `chip_mod` +20%: 12 / 14 / 16). 5 rounds; the bank carries into Palossand.
  sandygast: {
    name: 'sandygast', poke_sprite391: sprite('Natdex', 6, 51),
    config: { extra: { castle_chips: 0, chip_mod: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'enhancements', 'round_evo'], poke_after: 'comfey',
    poke_custom_values_to_keep: ['castle_chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chip_mod), r3(ex.castle_chips), ex.rounds] }; },
    calculate(self, card, context) { return sand_castle(card, context) || level_evo(self, card, context, 'j_poke_palossand'); },
  },
  // Palossand 770 (Safari $8): gains X0.05 per scored Stone card (`castle_Xmult` banked from X1; gain `Xmult_mod` +20%: 0.06 / 0.07 / 0.08),
  // and gives Sandygast's Chips (kept, no longer growing).
  palossand: {
    name: 'palossand', poke_sprite391: sprite('Natdex', 8, 51),
    config: { extra: { castle_chips: 0, castle_Xmult: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'scaling', 'enhancements'], poke_after: 'sandygast',
    poke_custom_values_to_keep: ['castle_chips', 'castle_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.castle_Xmult), r3(ex.castle_chips)] }; },
    calculate(self, card, context) { return sand_castle(card, context); },
  },
  // Pyukumuku 771 (Water, Rare $7), Innards Out: permanently +10 Chips at the end of each round held (`innards_chips` banked; gain `chip_mod`
  // +20%: 12 / 14 / 16); when sold or destroyed, earn $1 per round held (`innards_money` / `held_rounds`, fixed).
  pyukumuku: {
    name: 'pyukumuku', poke_sprite391: sprite('Natdex', 10, 51),
    config: { extra: { innards_chips: 0, chip_mod: 10, innards_money: 1, held_rounds: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'money', 'on_sell', 'sell_value'], poke_after: 'palossand',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chip_mod), r3(ex.innards_chips), ex.innards_money, innards_payout(card)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.selling_self && !context.blueprint) { innards_out(card); return undefined; }
      if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
        ex.innards_chips = r3(ex.innards_chips + ex.chip_mod);
        ex.held_rounds = (ex.held_rounds || 0) + 1;
        card_eval_status_text(card, 'extra', null, null, null, { message: a_chips(ex.innards_chips), colour: 'CHIPS' });
        return undefined;
      }
      if (context.joker_main && ex.innards_chips > 0) return { message: a_chips(r3(ex.innards_chips)), colour: 'CHIPS', chip_mod: ex.innards_chips };
      return undefined;
    },
  },
  // Komala 775 (Colorless, Rare $7), Comatose: X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4). Can't be debuffed (systems/rules.js set_debuff) and
  // can't be destroyed by a Joker: from r68 Jokers skip it when choosing what to destroy, as an Eternal (komala_destroy_immune, index.js
  // hooks.joker_destroy_immune -> the engine's can_be_destroyed_by_joker: Ceremonial Dagger, Madness, Bewear, Carvanha / Sharpedo, Scyther /
  // Scizor / Kleavor, Rotom Fan, Mega Mewtwo X, Nacli...), so the destroyer gains nothing. r65-r67 (and any path that still marks it
  // getting_sliced: a Boss Blind, another mod's joker) it refuses the destroy (joker_type_destroyed -> no_destroy). Hex and Ankh (Spectral
  // cards you choose) and selling still remove it.
  komala: {
    name: 'komala', poke_sprite391: sprite('Natdex', 18, 51),
    config: { extra: { Xmult: 1.5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'debuff'], poke_after: 'pyukumuku',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_type_destroyed && context.card === card && !context.blueprint) {
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Comatose!', colour: 'FILTER' });
        return { no_destroy: true };
      }
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Bruxish 779 (Water, Rare $7), Strong Jaw: every scored card with a seal retriggers once (fixed: Energy-inert). Blueprint copies it.
  bruxish: {
    name: 'bruxish', poke_sprite391: sprite('Natdex', 26, 51),
    config: { extra: { retriggers: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 7, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'seals'], poke_after: 'mimikyu',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card && context.other_card.get_seal()) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Jangmo-o 782 (Dragon, Uncommon $6), Clangorous Scales: permanently +2 Mult each time you play a Full House (`clang_mult` banked; gain
  // `mult_mod` +20%: 2.4 / 2.8 / 3.2). Evolves at +16 Mult (scaling_evo).
  jangmoo: {
    name: 'jangmoo', poke_sprite391: sprite('Natdex', 2, 52),
    config: { evo_rqmt: 16, extra: { clang_mult: 0, mult_mod: 2 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'scaling_evo'], poke_after: 'mega_drampa',
    poke_custom_values_to_keep: ['clang_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.clang_mult), self.config.evo_rqmt] }; },
    calculate(self, card, context) { return clangorous(card, context) || scaling_evo(self, card, context, 'j_poke_hakamoo', card.ability.extra.clang_mult, self.config.evo_rqmt); },
  },
  // Hakamo-o 783 (Safari $8): +4 Mult per Full House (`mult_mod` +20%: 4.8 / 5.6 / 6.4) on Jangmo-o's bank. Evolves at +40 Mult in all.
  hakamoo: {
    name: 'hakamoo', poke_sprite391: sprite('Natdex', 4, 52),
    config: { evo_rqmt: 40, extra: { clang_mult: 0, mult_mod: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'hand_type', 'scaling_evo'], poke_after: 'jangmoo',
    poke_custom_values_to_keep: ['clang_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.clang_mult), self.config.evo_rqmt] }; },
    calculate(self, card, context) { return clangorous(card, context) || scaling_evo(self, card, context, 'j_poke_kommoo', card.ability.extra.clang_mult, self.config.evo_rqmt); },
  },
  // Kommo-o 784 (Safari $10): gives the banked Mult (no longer growing) and X1 + X0.15 per Full House played this run (`Xmult_mod` +20%:
  // 0.18 / 0.21 / 0.24; G.GAME.hands['Full House'].played, so a late Kommo-o counts every one).
  kommoo: {
    name: 'kommoo', poke_sprite391: sprite('Natdex', 6, 52),
    config: { extra: { clang_mult: 0, Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dragon', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'hand_type'], poke_after: 'hakamoo',
    poke_custom_values_to_keep: ['clang_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), full_houses_played(), kommo_x(card), r3(ex.clang_mult)] }; },
    calculate(self, card, context) { return clangorous(card, context); },
  },

  // ---------------------------------------------------------------- Gen 7, batch 4: the Gen 7 Legendaries, 772-807 (contentRev 67)
  // The owner's design ("Yes build it", 2026-11-02). Legendary (The Soul / the Legendary pool); each complete ALONE (the solo rule, r59:
  // no partner clause; line members only evolve into each other). $20, the pre-evolutions $10 (Kubfu's precedent): Type: Null, Cosmog,
  // Cosmoem. The evolved stages (Silvally, Cosmoem, Solgaleo, Lunala) come only through their line (never in a pool: Urshifu's way).
  // Types from the card art (pokermon_art_type.mjs; every form cell checked): Type: Null / Silvally Colorless (Silvally's 11 Memory cells
  // each their own type), Tapu Koko Lightning, Lele Psychic, Bulu Grass, Fini Water, Cosmog / Cosmoem Psychic, Solgaleo Metal, Lunala
  // Psychic, Necrozma Psychic (its Ultra cell Dragon), Magearna Metal, Marshadow Fighting (its Zenith cell too), Zeraora Lightning. Neither
  // Nacho nor Pokermon+ has any. Art: upstream 3.9.1's own cells with their souls; the forms (systems/anim.js GEN7_LEGEND_FORMS) drawn
  // live by ui.js ownFace from each center's poke_view_form. Defined here, at the end, so every poke_after is registered first. Pokédex
  // order: Type: Null / Silvally after Pyukumuku (771); the Tapus and the Cosmog line after Kommo-o (784); Necrozma / Magearna / Marshadow
  // after Guzzlord (799); Zeraora after Blacephalon (806).
  //
  // Type: Null 772 (Colorless, $10): permanently gains X0.1 Mult at the end of each round (`null_Xmult` from X1, no energy field; the gain
  // `Xmult_mod` +20%: 0.12 / 0.14 / 0.16, never retroactive). Evolves after 5 rounds into Silvally, the bank kept. Blueprint copies the X.
  typenull: {
    name: 'typenull', poke_sprite391: sprite('Natdex', 12, 51, [13, 51]),
    config: { extra: { null_Xmult: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Colorless', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'round_evo'], poke_after: 'pyukumuku',
    poke_custom_values_to_keep: ['null_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.null_Xmult), ex.rounds] }; },
    calculate(self, card, context) {
      round_bank(card, context, 'null_Xmult', 'Xmult_mod', 'XMULT');
      const ex = card.ability.extra;
      if (context.joker_main && ex.null_Xmult > 1) return { message: a_xmult(r3(ex.null_Xmult)), colour: 'XMULT', Xmult_mod: ex.null_Xmult };
      return level_evo(self, card, context, 'j_poke_silvally');
    },
  },
  // Silvally 773 (Colorless; only through Type: Null), RKS System: X2 Mult plus X0.25 for each OTHER undebuffed Joker of its current type
  // (Greninja's count; `Xmult` / `Xmult_mod` +20%: 2.4 / 2.8 / 3.2 and 0.3 / 0.35 / 0.4), times Type: Null's bank (kept, no longer
  // growing). Using any Energy card (on any Joker, while held; not Blueprint) sets its type to that Energy's (Colorless Energy: Colorless;
  // Bird Energy, Double Rainbow and Berry Juice don't): its ptype, Castform's way (is_type / Energy / Kecleon follow; a Tera sticker still
  // overrides). Every type's Energy can go on it, full strength (poke_any_energy, so a lone Silvally can pick its type). Its Memory card
  // shows (the 12 cells on the Gen 7 sheet). Its type never breaks Monotype (poke_mono_exempt).
  silvally: {
    name: 'silvally', poke_sprite391: sprite('Gen07', 6, 1, [7, 1]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.25, null_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'types', 'energy'], poke_after: 'typenull',
    poke_mono_exempt: true, poke_any_energy: true,
    poke_view_form(self, card) { return card.ability.extra.ptype || 'Colorless'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), r3(ex.null_Xmult || 1), get_type(card) || ex.ptype, ninja_others(card), r3(rks_x(card))] };
    },
    calculate(self, card, context) {
      if (rks_system(card, context)) return undefined;
      if (context.joker_main) { const x = rks_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    in_pool() { return false; },
  },
  // Tapu Koko 785 (Lightning), Electric Surge: every scored card gives X1.1 Mult (`Xmult_multi` +5%: 1.155 / 1.21 / 1.265). Blueprint
  // copies it.
  tapu_koko: {
    name: 'tapu_koko', poke_sprite391: sprite('Natdex', 8, 52, [9, 52]),
    config: { extra: { Xmult_multi: 1.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 7, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'kommoo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Tapu Lele 786 (Psychic), Psychic Surge: each Tarot card used (by anyone, while held) creates a random Planet card (must have room NOW:
  // no room, nothing). Blueprint copies it (Cartomancer-like: a second Planet, room permitting). No number: Energy-inert.
  tapu_lele: {
    name: 'tapu_lele', poke_sprite391: sprite('Natdex', 10, 52, [11, 52]),
    config: { extra: {} },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['generation', 'tarot', 'planet'], poke_after: 'tapu_koko',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      const c = context.consumeable;
      if (!context.using_consumeable || !c || c.ability.set !== 'Tarot') return undefined;
      if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return undefined;
      G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
      G.E_MANAGER.add_event(() => {
        const p = create_card('Planet', G.consumeables, null, null, null, null, null, 'tapu_lele');
        p.add_to_deck();
        G.consumeables.emplace(p);
        G.GAME.consumeable_buffer = 0;
      });
      card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_plus_planet'), colour: 'Planet' });
      return undefined;
    },
  },
  // Tapu Bulu 787 (Grass), Grassy Surge: +2 hand size (`h_size`, fixed) and X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4). Blueprint copies
  // the X.
  tapu_bulu: {
    name: 'tapu_bulu', poke_sprite391: sprite('Natdex', 12, 52, [13, 52]),
    config: { extra: { h_size: 2, Xmult: 1.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'hand_size'], poke_after: 'tapu_lele',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    ...hand_size,
  },
  // Tapu Fini 788 (Water), Misty Surge: +1 hand each round (`hands`, fixed: the Squirtle pair); at the end of round (the cash-out,
  // calc_dollar_bonus) earns $2 for each unused hand (`mist_money`, fixed). No number Energy raises: Energy-inert. Nothing to copy.
  tapu_fini: {
    name: 'tapu_fini', poke_sprite391: sprite('Natdex', 14, 52, [15, 52]),
    config: { extra: { hands: 1, mist_money: 2 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 7, blueprint_compat: false,
    attributes: ['hands', 'money', 'economy'], poke_after: 'tapu_bulu',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.mist_money] }; },
    calc_dollar_bonus(self, card) {
      const n = Math.max(0, (G.GAME.current_round && G.GAME.current_round.hands_left) || 0);
      return n > 0 ? n * card.ability.extra.mist_money : undefined;
    },
    ...hands,
  },
  // Cosmog 789 (Psychic, $10): permanently gains +1 Mult at the end of each round (`cosmo_mult` from 0, no energy field; the gain
  // `mult_mod` +20%: 1.2 / 1.4 / 1.6). Evolves after 3 rounds into Cosmoem, the bank kept (and still given). Blueprint copies the Mult.
  cosmog: {
    name: 'cosmog', poke_sprite391: sprite('Natdex', 16, 52, [17, 52]),
    config: { extra: { cosmo_mult: 0, mult_mod: 1, rounds: 3 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'tapu_fini',
    poke_custom_values_to_keep: ['cosmo_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.cosmo_mult), ex.rounds] }; },
    calculate(self, card, context) {
      round_bank(card, context, 'cosmo_mult', 'mult_mod', 'MULT');
      return cosmo_main(card, context) || level_evo(self, card, context, 'j_poke_cosmoem');
    },
  },
  // Cosmoem 790 (Psychic, $10; only through Cosmog): permanently gains X0.25 Mult at the end of each round (`cosmo_Xmult` from X1, no
  // energy field; the gain `Xmult_mod` +20%: 0.3 / 0.35 / 0.4) and gives Cosmog's Mult too (kept, no longer growing). While held it counts
  // the scored cards' colours (cosmo_count: red Hearts / Diamonds, black Spades / Clubs; a Wild card both, a Stone card neither; once per
  // hand). After 3 rounds it evolves: more red -> Solgaleo, more black -> Lunala, a tie -> Solgaleo; both banks kept.
  cosmoem: {
    name: 'cosmoem', poke_sprite391: sprite('Natdex', 18, 52, [19, 52]),
    config: { extra: { cosmo_mult: 0, cosmo_Xmult: 1, Xmult_mod: 0.25, red: 0, black: 0, rounds: 3 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['mult', 'xmult', 'scaling', 'suits', 'round_evo'], poke_after: 'cosmog',
    poke_custom_values_to_keep: ['cosmo_mult', 'cosmo_Xmult'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.cosmo_mult), r3(ex.cosmo_Xmult), ex.red || 0, ex.black || 0, ex.rounds] };
    },
    calculate(self, card, context) {
      if (cosmo_count(card, context)) return undefined;
      round_bank(card, context, 'cosmo_Xmult', 'Xmult_mod', 'XMULT');
      return cosmo_main(card, context) || level_evo(self, card, context, cosmo_branch(card));
    },
    in_pool() { return false; },
  },
  // Solgaleo 791 (Metal; only through Cosmoem), Sunsteel Strike: each scored Heart or Diamond (is_suit: Wild counts) gives X1.25 Mult
  // (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375); plus the Cosmog line's banks (+Mult and X, kept, no longer growing). Blueprint copies all.
  solgaleo: {
    name: 'solgaleo', poke_sprite391: sprite('Natdex', 20, 52, [21, 52]),
    config: { extra: { Xmult_multi: 1.25, cosmo_mult: 0, cosmo_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'mult', 'suit', 'hearts', 'diamonds'], poke_after: 'cosmoem',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), r3(ex.cosmo_mult), r3(ex.cosmo_Xmult)] }; },
    calculate(self, card, context) { return cosmo_suit_x(card, context, ['Hearts', 'Diamonds']) || cosmo_main(card, context); },
    in_pool() { return false; },
  },
  // Lunala 792 (Psychic; only through Cosmoem), Moongeist Beam: each scored Spade or Club gives X1.25 Mult (`Xmult_multi` +5%); plus the
  // Cosmog line's banks. Blueprint copies all.
  lunala: {
    name: 'lunala', poke_sprite391: sprite('Natdex', 22, 52, [23, 52]),
    config: { extra: { Xmult_multi: 1.25, cosmo_mult: 0, cosmo_Xmult: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'mult', 'suit', 'spades', 'clubs'], poke_after: 'solgaleo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), r3(ex.cosmo_mult), r3(ex.cosmo_Xmult)] }; },
    calculate(self, card, context) { return cosmo_suit_x(card, context, ['Spades', 'Clubs']) || cosmo_main(card, context); },
    in_pool() { return false; },
  },
  // Necrozma 800 (Psychic), Prism: each Planet card used while held (by anyone; not Blueprint) banks +X0.1 Mult (`prism_Xmult` from X1,
  // no energy field; the gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16, never retroactive). At X3 it becomes Ultra Necrozma for good: its
  // Ultra card (Gen 7 {0,5}), its type the card's (Dragon; Monotype still accepts the Psychic it was gained as), +1 hand size
  // (`ultra_size`, fixed; Zygarde's pair). It keeps banking. Blueprint copies the X.
  necrozma: {
    name: 'necrozma', poke_sprite391: sprite('Gen07', 6, 4, [7, 4]),
    config: { extra: { prism_Xmult: 1, Xmult_mod: 0.1, ultra_size: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'planet', 'hand_size', 'types'], poke_after: 'guzzlord',
    poke_view_form(self, card) { return necrozma_ultra(card) ? 'ultra' : 'base'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.prism_Xmult), NECROZMA_ULTRA, ex.ultra_size, necrozma_ultra(card) ? 'Ultra Necrozma' : 'Necrozma'] };
    },
    calculate(self, card, context) {
      if (prism(card, context)) return undefined;
      const ex = card.ability.extra;
      if (context.joker_main && ex.prism_Xmult > 1) return { message: a_xmult(r3(ex.prism_Xmult)), colour: 'XMULT', Xmult_mod: ex.prism_Xmult };
      return undefined;
    },
    ...ultra_size,
  },
  // Magearna 801 (Metal), Soul-Heart: each scored Steel card gives X1.5 Mult (the joker's own per-card pass, so a retrigger repeats it and
  // Blueprint copies it; `Xmult_multi` +5%: 1.575 / 1.65 / 1.725). A Steel card held in hand keeps its own X1.5 as usual.
  magearna: {
    name: 'magearna', poke_sprite391: sprite('Natdex', 10, 53, [11, 53]),
    config: { extra: { Xmult_multi: 1.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'necrozma',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_steel')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Marshadow 802 (Fighting), Spectral Thief: X2 Mult (`Xmult` +20%: 2.4 / 2.8 / 3.2); X4 during a Boss Blind (`Xmult1` +20%: 4.8 / 5.6 /
  // 6.4; boss_now: a disabled Boss is still a Boss). During one its Zenith card shows (Gen 7 {4,5}, Fighting too). Blueprint copies it.
  marshadow: {
    name: 'marshadow', poke_sprite391: sprite('Gen07', 2, 5, [3, 5]),
    config: { extra: { Xmult: 2, Xmult1: 4 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind'], poke_after: 'magearna',
    poke_view_form(self, card) { return boss_now() ? 'zenith' : 'base'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult1), r3(boss_now() ? ex.Xmult1 : ex.Xmult)] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = boss_now() ? card.ability.extra.Xmult1 : card.ability.extra.Xmult;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  // Zeraora 807 (Lightning), Plasma Fists: each scored face card (is_face: Pareidolia counts) earns $1 (`plasma_money`, fixed) and gives
  // X1.25 Mult (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Blueprint copies both.
  zeraora: {
    name: 'zeraora', poke_sprite391: sprite('Natdex', 22, 53, [23, 53]),
    config: { extra: { Xmult_multi: 1.25, plasma_money: 1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 7, blueprint_compat: true,
    attributes: ['xmult', 'money', 'face'], poke_after: 'blacephalon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.plasma_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_face()) {
        const ex = card.ability.extra;
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.plasma_money;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: ex.plasma_money, x_mult: ex.Xmult_multi, card };
      }
      return undefined;
    },
  },
};
