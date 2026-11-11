// designs/gen5.js — the owner's Generation 5 Pokermon jokers and the helpers only they use, cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another
// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);
// a NEW joker is just added to JOKERS below and registers after them.
import {
  G, scale_card, apply_type_sticker, type_sticker_applied, remove_type_stickers, type_tooltip, card_eval_status_text, pseudorandom_probability,
  has_enhancement, is_type, localize, has_no_rank, pseudorandom, pseudoseed, create_card, get_probability_vars, poke_drain, find_card, P_CENTERS,
  scaling_evo, level_up_hand, can_evolve, poke_evolve, add_card, copy_card, playing_card_joker_effects, emit, ease_dollars, level_evo,
  find_pokemon_type, HISUI_REV,
} from '../../api.js';
import { rulesRev } from '../../../../js/mods/pins.js';
import {
  THERIAN_AT, a_chips, a_mult, a_xmult, ancient_count, ancient_third, ancient_tip, bank, boss_now, cherrim_sunny, consumable_room, discards,
  discards_used, final_hand, frozen_by, grudge, grudge_cap, grudge_main, grudge_used, hand_size, hands, hands_before, hands_discards, legend_held,
  lucky_odds_vars, lucky_scored, mummy_used, r3, r9, rain_read, rain_state, round_end, scry, scry_tip, snipe_target, solo59, sprite, steel_in_deck,
  sun_read, sun_state, super_luck, swift_swim_raining, sync_kecleons, tailor, therian, typed_joker, unbroken,
} from './common.js';


/** Scraggy / Scrafty, Moxie: grows at end of round when the Blind fell to the round's first hand. */
export function moxie(card, context, step) {
  if (round_end(context) && !context.blueprint && !context.game_over && G.GAME.current_round.hands_played === 1) {
    scale_card(card, { ref_value: 'mult', scalar_table: { moxie: step() }, scalar_value: 'moxie', message_colour: 'MULT' });
  }
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
/** The Swords of Justice (Keldeo counts as one) and each one's suit. */
export const SWORDS = { j_poke_cobalion: 'Spades', j_poke_terrakion: 'Diamonds', j_poke_virizion: 'Clubs', j_poke_keldeo: 'Hearts' };
/** Swords of Justice: how many OTHER sword species you have (undebuffed) — the Regi Trio's distinct count (regi_others): a twin of the
 *  same sword (Showman) is never an "other sword", and two Terrakions count once for a Cobalion. 0 to 3. */
export function sword_others(card) {
  const own = card.config.center.key, seen = new Set();
  for (const j of (G.jokers && G.jokers.cards) || []) {
    const k = j.config.center.key;
    if (j !== card && !j.debuff && k !== own && SWORDS[k]) seen.add(k);
  }
  return seen.size;
}
/** Keldeo's Resolute Form (contentRev 59, solo): for good once RESOLUTE_AT (25) Hearts have scored while it was held (`hearts`, counted
 *  on the card under every rules rev). Before r59: Cobalion, Terrakion AND Virizion all held, undebuffed. */
export const RESOLUTE_AT = 25;
export const keldeo_resolute = (card) => (solo59() ? !!card && (card.ability.extra.hearts || 0) >= RESOLUTE_AT : legend_held('cobalion') && legend_held('terrakion') && legend_held('virizion'));
/** The full deck's count of each suit (is_suit with the debuff bypassed: a Wild card counts for EVERY suit, a Stone card for none). */
export function deck_suits() {
  const n = { Spades: 0, Hearts: 0, Clubs: 0, Diamonds: 0 };
  for (const c of G.playing_cards || []) if (unbroken(c)) for (const s of Object.keys(n)) if (c.is_suit(s, true)) n[s]++;
  return n;
}
/** Swords of Justice (contentRev 59, solo): the sword's suit is the most common in the full deck (an empty count never). contentRev 60
 *  (the owner's follow-up): STRICTLY the most common, a tie doesn't count (a standard 52-card deck: every sword X1.25); a move recorded on
 *  r59 re-plays with ties counting (js/mods/pins.js RULES). */
const strict60 = () => rulesRev('pokermon') >= 60;
export function suit_leads(suit) {
  const n = deck_suits(), top = Math.max(...Object.values(n));
  if (!(top > 0 && n[suit] === top)) return false;
  return !strict60() || Object.keys(n).every((s) => s === suit || n[s] < top);
}
/** The Swords of Justice X: X1.5, i.e. the base `Xmult_multi` x 1.2 (one energy field scales both: 1.575 / 1.65 / 1.725). */
const justice_x = (card) => r9(card.ability.extra.Xmult_multi * 1.2);
/** A sword's per-card X. contentRev 59: Keldeo's Resolute `Xmult_multi2` (X2), else X1.5 while its suit leads the deck, else its base.
 *  Before r59: the base (Keldeo's Resolute X2) + `sword_mod` (0.1, fixed) per other sword. */
export function sword_x(card) {
  const ex = card.ability.extra, keldeo = card.config.center.key === 'j_poke_keldeo';
  if (solo59()) return keldeo && keldeo_resolute(card) ? ex.Xmult_multi2 : suit_leads(SWORDS[card.config.center.key]) ? justice_x(card) : ex.Xmult_multi;
  const base = keldeo && keldeo_resolute(card) ? ex.Xmult_multi2 : ex.Xmult_multi;
  return r9(base + ex.sword_mod * sword_others(card));
}
/** Each scored card of the sword's suit (is_suit: a Wild card counts; a debuffed card doesn't score) gives the sword's X. Keldeo counts
 *  each Heart that scores (a retrigger scores again, so counts again; not Blueprint) AFTER it pays: the 25th pays Ordinary, the 26th X2. */
function sacred_sword(card, context) {
  const suit = SWORDS[card.config.center.key];
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(suit)) {
    const x = sword_x(card);
    if (card.config.center.key === 'j_poke_keldeo' && !context.blueprint) card.ability.extra.hearts = (card.ability.extra.hearts || 0) + 1;
    return { x_mult: x, card };
  }
  return undefined;
}
/** A sword's tooltip: [base X, Justice X, "<its suit's count>, top <the most common suit's count>" (contentRev 60: "<count>, tied for
 *  top" while it shares the top, which no longer counts), the X it gives now]. */
function sword_vars(self, info_queue, card) {
  type_tooltip(self, info_queue, card);
  const ex = card.ability.extra, suit = SWORDS[card.config.center.key], n = deck_suits(), top = Math.max(...Object.values(n));
  const tied = strict60() && top > 0 && n[suit] === top && Object.keys(n).some((s) => s !== suit && n[s] === top);
  return { vars: [r3(ex.Xmult_multi), r3(justice_x(card)), n[suit] + (tied ? ', tied for top' : ', top ' + top), r3(sword_x(card))] };
}
/** The Therian clock: +1 round held at each end of round. */
function therian_tick(card, context) {
  if (!round_end(context) || context.blueprint) return false;
  const ex = card.ability.extra, was = therian(card);
  ex.therian_rounds = (ex.therian_rounds || 0) + 1;
  if (!was && therian(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Therian Forme!', colour: 'FILTER' });
  return true;
}
const therian_left = (card) => Math.max(0, THERIAN_AT - (card.ability.extra.therian_rounds || 0));
/** The tooltip's forme line: "Therian Forme" / "Therian in k rounds". */
const forme_state = (card) => (therian(card) ? 'Therian Forme' : 'Therian in ' + therian_left(card) + (therian_left(card) === 1 ? ' round' : ' rounds'));
/** Tornadus's Therian Forme: +mult Mult per hand left, read when it scores (hands_left: the hand being scored is already taken, so the
 *  round's final hand counts 0). */
const tornadus_left = () => Math.max(0, (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left) || 0);
const tornadus_mult = (card) => r9(card.ability.extra.mult * tornadus_left());
function wild_charge(card, context) {
  if (therian_tick(card, context)) return undefined;
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round)) return undefined;
  const ex = card.ability.extra, t = therian(card);
  if (!pseudorandom_probability(card, 'thundurus', ex.num, t ? ex.dem2 : ex.dem, 'thundurus')) return undefined;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.storm_money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return t ? { dollars: ex.storm_money, x_mult: ex.Xmult_multi, card } : { dollars: ex.storm_money, card };
}
/** Landorus: Incarnate, each Stone card HELD in hand (undebuffed) gives +chips Chips; Therian, each SCORED Stone card gives X`Xmult_multi`
 *  instead (has_enhancement: quantum Stone too). */
function sand_force(card, context) {
  if (therian_tick(card, context)) return undefined;
  if (!context.individual || context.end_of_round || !has_enhancement(context.other_card, 'm_stone')) return undefined;
  const ex = card.ability.extra, t = therian(card);
  if (!t && context.cardarea === G.hand && !context.other_card.debuff) return { h_chips: ex.chips, card };
  if (t && context.cardarea === G.play) return { x_mult: ex.Xmult_multi, card };
  return undefined;
}
/** The Tao trio's types: Reshiram's Fire, Zekrom's Lightning. */
export const TAO = { j_poke_reshiram: { type: 'Fire', partner: 'zekrom' }, j_poke_zekrom: { type: 'Lightning', partner: 'reshiram' } };
/** Truth vs Ideals (before r59): Reshiram and Zekrom both held (undebuffed): each one's per-joker X was +tao_mod (0.25, fixed). */
const truth_ideals = (card) => legend_held(TAO[card.config.center.key].partner);
/** A Tao dragon's per-joker X: `Xmult_multi` (+5% per Energy) + its Fusion bank (`fusion_x`, contentRev 59). Before r59: + tao_mod with
 *  its partner. */
export const tao_x = (card) => r9(card.ability.extra.Xmult_multi + (solo59() ? card.ability.extra.fusion_x || 0 : truth_ideals(card) ? card.ability.extra.tao_mod : 0));
/** Fusion Flare / Fusion Bolt (contentRev 59): each Fire (Reshiram) / Lightning (Zekrom) Energy card used, on any joker or none, banks
 *  +fusion_mod (0.05, fixed) into `fusion_x` (no energy field: Energy never raises what is banked). Not Blueprint. */
const FUSION_ENERGY = { j_poke_reshiram: 'c_poke_fire_energy', j_poke_zekrom: 'c_poke_lightning_energy' };
function fusion_bank(card, context) {
  if (!context.using_consumeable || context.blueprint || !context.consumeable || !solo59()) return false;
  if (context.consumeable.config.center.key !== FUSION_ENERGY[card.config.center.key]) return false;
  const ex = card.ability.extra;
  ex.fusion_x = r9((ex.fusion_x || 0) + ex.fusion_mod);
  card_eval_status_text(card, 'extra', null, null, null, { message: card.config.center.key === 'j_poke_reshiram' ? 'Fusion Flare!' : 'Fusion Bolt!', colour: 'XMULT' });
  return true;
}
/** Jokers of this type (is_type, undebuffed), the card itself included when it is one: the tooltip's count (a shop card shows what it
 *  would give once bought). */
const typed_count = (card, type) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && typed_joker(j, type)).length + (is_type(card, type) ? 1 : 0);
/** Turboblaze / Teravolt: each Fire / Lightning Joker (itself included) gives the dragon's X, in the other_joker pass (Manaphy's shape). */
function tao_boost(card, context) {
  if (fusion_bank(card, context)) return undefined;
  const tao = TAO[card.config.center.key];
  if (!(context.other_joker && typed_joker(context.other_joker, tao.type))) return undefined;
  const x = tao_x(card);
  G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
  return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
}
/** Kyurem's partner: the LEFTMOST undebuffed Reshiram or Zekrom in the row (both held: whichever sits further left), or none. White
 *  Kyurem borrows Reshiram's Turboblaze, Black Kyurem Zekrom's Teravolt. */
export function kyurem_partner() {
  return ((G.jokers && G.jokers.cards) || []).find((j) => !j.debuff && TAO[j.config.center.key]);
}
/** Kyurem's form. contentRev 59 (solo): White while you have more Fire Jokers than Lightning Jokers, Black while more Lightning than Fire
 *  (typed_joker: undebuffed; Arceus counts for both, so it never tips it; a Tera counts; Kyurem itself is left out); a tie keeps the form
 *  it had (`kyurem_form`, written by its own calculate on every context, so it is the same in live play, resume and replay), plain Kyurem
 *  until one side first leads. Before r59: the leftmost undebuffed Reshiram (White) / Zekrom (Black). */
const kyurem_count = (card, type) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && typed_joker(j, type)).length;
export const kyurem_form = (card) => {
  if (solo59()) {
    const f = kyurem_count(card, 'Fire'), l = kyurem_count(card, 'Lightning');
    return f > l ? 'white' : l > f ? 'black' : (card && card.ability.extra.kyurem_form) || 'base';
  }
  const p = kyurem_partner(); return !p ? 'base' : p.config.center.key === 'j_poke_reshiram' ? 'white' : 'black';
};
const KYUREM_TYPE = { white: 'Fire', black: 'Lightning' };
/** Kyurem's borrowed boost: each joker of the partner's type gives Kyurem the partner's OWN current per-joker X (its Energy and Truth vs
 *  Ideals included) a second time, on top of the partner's: a separate multiplier, so a Fire Joker with Reshiram and White Kyurem gives
 *  X1.25 x X1.25. Nothing is consumed; the partner works as usual. */
function kyurem_borrow(card, context) {
  if (solo59()) {
    const t = context.other_joker && KYUREM_TYPE[kyurem_form(card)];
    if (!t || context.other_joker === card || !typed_joker(context.other_joker, t)) return undefined;
    const x = r9(card.ability.extra.Xmult_multi);
    G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
    return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
  }
  const p = context.other_joker && kyurem_partner();
  if (!p || !typed_joker(context.other_joker, TAO[p.config.center.key].type)) return undefined;
  const x = tao_x(p);
  G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
  return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
}
/** Meloetta's formes: the Pokermon type each one's card shows (Aria Psychic; Pirouette Fighting: its 3.9.1 cell's icon). */
export const MELOETTA_FORMES = { aria: { ptype: 'Psychic', name: 'Aria Forme' }, pirouette: { ptype: 'Fighting', name: 'Pirouette Forme' } };
/** Meloetta's forme: Pirouette only if it switched to it THIS round (`form_round`); every round starts in Aria (a Meloetta debuffed through
 *  the end of round, whose reset never ran, still reads Aria in the next one). */
export const meloetta_form = (card) => { const ex = card.ability.extra; return ex.form === 'pirouette' && ex.form_round === (G.GAME && G.GAME.round) ? 'pirouette' : 'aria'; };
/** Meloetta takes a forme: its own Pokermon type (ability.extra.ptype) becomes the forme's, Castform's / Burmy's way — unless a Tera sticker
 *  owns the type. The debuff and Kecleons are re-read. */
function meloetta_set(card, form) {
  const ex = card.ability.extra, f = MELOETTA_FORMES[form] || MELOETTA_FORMES.aria;
  const ptype = type_sticker_applied(card) ? ex.ptype : f.ptype;
  const changed = ex.form !== form || ex.ptype !== ptype;
  ex.form = form;
  ex.form_round = form === 'pirouette' ? G.GAME.round : undefined;
  ex.ptype = ptype;
  if (!changed) return;
  card.set_debuff();
  sync_kecleons();
}
/** Relic Song: after EVERY hand played (the `after` pass, which a debuffed hand gets too; not Blueprint, not a joker retrigger) it switches
 *  Aria <-> Pirouette. Every round starts in Aria: reset in the main end_of_round pass (queued, so the round's other end-of-round effects
 *  still see its forme), and a stale Pirouette from an earlier round is put back first thing. */
function relic_song(card, context) {
  if (context.blueprint) return;
  const ex = card.ability.extra;
  if (ex.form === 'pirouette' && meloetta_form(card) === 'aria') meloetta_set(card, 'aria');
  if (context.after && !context.retrigger_joker) {
    const next = meloetta_form(card) === 'aria' ? 'pirouette' : 'aria';
    meloetta_set(card, next);
    card_eval_status_text(card, 'extra', null, null, null, { message: MELOETTA_FORMES[next].name + '!', colour: next === 'aria' ? 'PURPLE' : 'RED' });
  } else if (round_end(context)) {
    G.E_MANAGER.add_event(() => { meloetta_set(card, 'aria'); });
  }
}
/** Genesect, Techno Blast: the Water, Lightning or Fire Jokers you have — one test per joker (is_type for each of the three, so a joker of
 *  two of them, a Tera, or Arceus counts ONCE), undebuffed, Genesect itself included when it is one (a Tera sticker). */
const techno_joker = (j) => !j.debuff && (is_type(j, 'Water') || is_type(j, 'Lightning') || is_type(j, 'Fire'));
export const techno_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && techno_joker(j)).length + (techno_joker(card) ? 1 : 0);
const techno_x = (card) => r9(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * techno_count(card));

// ---------------------------------------------------------------- the Gen 5 starters: Snivy / Tepig / Oshawott lines (contentRev 50)
/** Snivy / Servine, Contrary: each DEBUFFED card held in hand gives +mult Mult (a held-in-hand effect, h_mult, Baron's shape: Mime and a
 *  held card's retriggers repeat it). Any debuff counts: a Boss Blind's (The Goad / Head / Club / Window / Plant / Pillar, Verdant Leaf), a
 *  mod's. Blueprint copies it. Cresselia (playing cards can't be debuffed) leaves nothing to count: anti-synergy. */
function contrary_held(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && context.other_card.debuff) return { h_mult: card.ability.extra.mult, card };
  return undefined;
}
const debuffed_held = () => ((G.hand && G.hand.cards) || []).filter((c) => c.debuff).length;
/** Tepig line, Flame Charge: the streak of hands in a row of the same poker hand this round, THIS hand included (1 on a new poker hand,
 *  2 on the second in a row...). Set when a hand is played (before), not by a Blueprint or a joker retrigger; a debuffed hand (The Eye,
 *  The Psychic: no `before` pass, so its debuffed_hand context) still continues or breaks it, and scores nothing. Kept for the round
 *  (streak_round: a new round starts at 0, even for a joker that missed the end-of-round pass while debuffed). Discards don't break it. */
export function flame_charge(card, context) {
  const ex = card.ability.extra;
  if ((context.before || context.debuffed_hand) && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
    const same = ex.streak_round === G.GAME.round && ex.last_hand === context.scoring_name;
    ex.streak = same ? (ex.streak || 0) + 1 : 1;
    ex.last_hand = context.scoring_name;
    ex.streak_round = G.GAME.round;
  }
  if (round_end(context) && !context.blueprint) { ex.streak = 0; ex.last_hand = undefined; }
  return undefined;
}
/** The current streak (0 outside its round: the shop shows 0). */
export const flame_streak = (ex) => (G.GAME && ex.streak_round === G.GAME.round ? ex.streak || 0 : 0);
function flame_vars(ex) {
  const n = flame_streak(ex);
  return [n, n && ex.last_hand ? localize(ex.last_hand, 'poker_hands') : localize('poke_none')];
}
/** Tepig / Pignite: +mult per streak hand; Emboar: X(1 + Xmult_mod per streak hand). */
export function flame_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, n = flame_streak(ex);
  if (n <= 0) return undefined;
  // (the exact number scores; the message shows it rounded)
  if (ex.Xmult_mod) { const x = 1 + ex.Xmult_mod * n; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
  const m = ex.mult * n;
  return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
}
/** Oshawott line, Razor Shell: the first `strikes` cards of the scoring hand (by position, Urshifu Rapid Strike's rule) retrigger
 *  `retriggers` time(s). A debuffed one there scores nothing and the count never moves past it (the next card isn't promoted). */
export function razor_shell(card, context) {
  if (context.repetition && context.cardarea === G.play && context.scoring_hand) {
    const i = context.scoring_hand.indexOf(context.other_card), ex = card.ability.extra;
    if (i >= 0 && i < ex.strikes) return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  return undefined;
}
/** Samurott, Shell Blade: a scored Ace gives X(Xmult_multi) each time it scores (a retrigger repeats it). A Stone card has no rank. */
function shell_blade(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 14) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}

// ---------------------------------------------------------------- Gen 5, batch 1 (contentRev 53): Patrat ... Sawk (504-539)
/** Patrat / Watchog, Lookout: each Foreseen card (the top of the deck, G.scry_view, scored like a held card: Uxie's moment) gives +mult
 *  Mult; a debuffed one gives nothing. The Foresight itself is the Shinx line's `scry` pair. */
function lookout(card, context) {
  if (context.individual && context.cardarea === G.scry_view && !context.end_of_round && !context.other_card.debuff) return { mult: card.ability.extra.mult, card };
  return undefined;
}
/** Lillipup / Herdier / Stoutland, Pickup: in the main end_of_round pass (not Blueprint), WITH consumable room only — no room, no roll, so a
 *  full row never moves the seeded stream (Manaphy's "slot first, then the roll") — a num in dem chance (pseudorandom_probability, the
 *  joker's own seed: Oops! All 6s / Venonat raise it, Absol fixes it) to create a random Tarot (Lillipup) or a Tarot or Planet (Herdier /
 *  Stoutland: a seeded coin, `<seed>_set`). The card itself is the run's seeded create_card (key_append = the seed). */
function pickup(card, context, seed) {
  if (!round_end(context) || context.blueprint || !consumable_room()) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, seed, ex.num, ex.dem, seed)) return;
  const set = ex.planets && pseudorandom(pseudoseed(seed + '_set')) < 0.5 ? 'Planet' : 'Tarot';
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const c = create_card(set, G.consumeables, null, null, null, null, undefined, seed);
    c.add_to_deck();
    G.consumeables.emplace(c);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize(set === 'Tarot' ? 'k_plus_tarot' : 'k_plus_planet'), colour: set });
}
const pickup_vars = (card, seed) => { const ex = card.ability.extra; return get_probability_vars(card, ex.num, ex.dem, seed); };
/** Stoutland: +mult for each consumable held (G.consumeables.cards: Negative ones too). */
const held_consumables = () => ((G.consumeables && G.consumeables.cards) || []).length;
const stout_mult = (card) => r3(card.ability.extra.mult * held_consumables());
/** Purrloin / Liepard, Pickpocket: the Joker directly to the RIGHT in the row (none at the right end, or alone). */
const right_of = (card) => { const row = (G.jokers && G.jokers.cards) || []; const i = row.indexOf(card); return i >= 0 ? row[i + 1] : undefined; };
/** At end of round (the main pass, not Blueprint) the right neighbour loses `drain` of sell value — Pokermon's Drain (poke_drain, one way:
 *  nothing goes to the thief), which never takes a Joker below $1 of sell value (one at $1 loses nothing). No right neighbour: no loss.
 *  The money is earned either way, through calc_dollar_bonus (`steal`, a row of the cash-out list; Blueprint never copies it). A debuffed
 *  neighbour still loses it (sell value isn't an ability, the Combee rule). */
function pickpocket(card, context) {
  if (!round_end(context) || context.blueprint) return;
  const j = right_of(card);
  if (j) poke_drain(card, j, card.ability.extra.drain, true);
}
/** Blitzle / Zebstrika, Motor Drive: no player discard used this round yet (current_round.discards_used; The Hook's forced discards
 *  don't count it). Out of a round (the shop) the tooltip reads the next round's start: on. */
const motor_on = () => { const GM = G.GAME, cr = GM && GM.current_round; return !!cr && (!GM.facing_blind || !(cr.discards_used > 0)); };
/** Blitzle: +mult for each hand played this round before any discard, THIS hand included (hands_played is the pre-hand count while it
 *  scores: the round's 1st hand counts 1, the 2nd 2...); after a discard, 0 for the rest of the round. */
const motor_count = () => (motor_on() ? hands_before() + 1 : 0);
const motor_mult = (card) => r3(card.ability.extra.mult * motor_count());
/** Woobat / Swoobat, Heart Stamp: each scored Heart (is_suit: Wild cards count, a debuffed card doesn't) earns `stamp_money` (Rough Gem's
 *  shape and dollar_buffer), Swoobat also X(Xmult_multi). Money is fixed; Energy raises only the X. */
function heart_stamp(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit('Hearts'))) return undefined;
  const ex = card.ability.extra;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.stamp_money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  const r = { dollars: ex.stamp_money, card };
  if (x) r.x_mult = ex.Xmult_multi;
  return r;
}
/** Timburr / Gurdurr / Conkeldurr: each scored Stone card (has_enhancement: quantum Stone too) gives +mult, Conkeldurr also X(Xmult_multi) —
 *  a joker effect on top of whatever the card gives itself, so it stacks with Regirock's "+100 instead of +50" and Hippowdon's extra Chips. */
function pillars(card, context, x) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_stone'))) return undefined;
  const ex = card.ability.extra;
  return x ? { mult: ex.mult, x_mult: ex.Xmult_multi, card } : { mult: ex.mult, card };
}
function swift_swim(card, context) {
  if (rain_read(card, context) || !context.joker_main) return undefined;
  const c = card.ability.extra.chips * (swift_swim_raining(card) ? 2 : 1);
  return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c };
}
/** Throh, Seismic Toss: the LOWEST-ranked scored card that can score (not debuffed, not rankless like Stone; Aces high, so an Ace is the
 *  lowest only when every candidate is an Ace); a tie the LEFTMOST. Sawk's Karate Chop is Inteleon's snipe_target (the highest). */
function toss_target(scoring_hand) {
  let best = null;
  for (const c of scoring_hand || []) {
    if (c.debuff || has_no_rank(c)) continue;
    if (!best || c.get_id() < best.get_id()) best = c;
  }
  return best;
}
/** Dojo Rivals: the partner held, undebuffed (find_card; a Blueprint isn't the partner). The bonus is fixed (rival_x / rival_mult). */
const dojo = (partner) => !!(G.jokers && find_card(partner).length > 0);
const throh_x = (card) => r3(card.ability.extra.Xmult_multi + (dojo('j_poke_sawk') ? card.ability.extra.rival_x : 0));
const sawk_mult = (card) => r3(card.ability.extra.mult + (dojo('j_poke_throh') ? card.ability.extra.rival_mult : 0));
// ---------------------------------------------------------------- Gen 5, batch 2 (#540-573; the owner's "Yes", 2026-10-28)
/** The Sewaddle line, the tailor: when a Blind is selected, ONE random UNENHANCED card of the full deck (G.playing_cards, the run's
 *  seeded pseudorandom_element: Cherubi's sweet_seeds) becomes one of the stage's cloths — Sewaddle a Bonus card; Swadloon a Bonus or
 *  Mult card; Leavanny a Bonus, Mult or Lucky card (the cloth is a second seeded pick, 'poke_tailor_cloth', drawn only when there is a
 *  choice). None unenhanced: nothing (it never overwrites another enhancement). One card a Blind, fixed (no Energy field). Blueprint
 *  copies it (Marble Joker's moment), as Cherubi's. */
export const TAILOR_CLOTHS = { sewaddle: ['m_bonus'], swadloon: ['m_bonus', 'm_mult'], leavanny: ['m_bonus', 'm_mult', 'm_lucky'] };
/** Leavanny: each scored ENHANCED card (its own enhancement: any center but the plain card; Stone and Hazard cards included) gives
 *  +mult Mult. A retrigger repeats it; Blueprint copies it. */
function leaf_blade(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.config.center.key !== 'c_base') return { mult: card.ability.extra.mult, card };
  return undefined;
}

/** The Venipede line, Poison Point (a spreading poison): every card the PLAYER discards (pre_discard without `hook`, Trapinch's rule:
 *  The Hook and seals don't count) is poisoned for good: -chip_loss Chips (perma_bonus) and +mult_mod Mult (Steamodded's perma_mult,
 *  which the engine scores every time the card scores). The Chips are FLOORED at the card's own: perma_bonus never goes below minus
 *  the Chips the card gives without it (rank + enhancement bonus; a Stone card's +50), so a card's Chips stop at 0 and the Mult keeps
 *  growing; a card already at 0 (a Hazard card) loses nothing. Scolipede also turns each poisoned UNENHANCED card into a Mult card
 *  (seal, edition and the perma values kept). Blueprint copies it (Hiker's growth: a second dose). */
export const own_chips = (c) => {
  const a = c.ability;
  if (a.effect === 'Stone Card' || c.config.center.replace_base_card) return a.bonus || 0;
  return (c.base.nominal - (a.nominal_drain || 0)) + (a.bonus || 0);
};
export function poison_card(c, loss, gain) {
  const a = c.ability, perma = a.perma_bonus || 0;
  a.perma_bonus = Math.min(perma, Math.max(perma - loss, -own_chips(c)));
  a.perma_mult = r3((a.perma_mult || 0) + gain);
}
export function poison_point(card, context) {
  if (!(context.pre_discard && !context.hook && !context.retrigger_joker && context.full_hand && context.full_hand.length)) return undefined;
  const ex = card.ability.extra;
  for (const c of context.full_hand) {
    poison_card(c, ex.chip_loss, ex.mult_mod);
    if (ex.toxic && c.config.center.key === 'c_base' && unbroken(c)) c.set_ability(P_CENTERS.m_mult, null, true);
  }
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Poisoned!', colour: 'PURPLE' });
  return undefined;
}

/** Cottonee, Prankster: +h_size hand size while held, and the round's FIRST hand drawn draws 1 extra card: when a Blind is selected
 *  (before the deal) +1 temporary hand size (`prank_draw`), taken back on that first deal (first_hand_drawn), so the hand starts one
 *  card over its size and the next draw refills only to the normal size. Not Blueprint (one extra card a round). Sold or evolved
 *  with the +1 still pending, it gives back both. Whimsicott: +2 hand size, nothing temporary. */
const prankster = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) {
    const ex = card.ability.extra;
    G.hand.change_size(-(ex.h_size + (ex.prank_draw || 0)));
    ex.prank_draw = 0;
  },
};
function prank_draw(card, context) {
  const ex = card.ability.extra;
  if (context.setting_blind && !context.blueprint && !card.getting_sliced && !ex.prank_draw) {
    ex.prank_draw = 1;
    G.hand.change_size(1);
    card_eval_status_text(card, 'extra', null, null, null, { message: '+1 card', colour: 'FILTER' });
  }
  if (context.first_hand_drawn && !context.blueprint && ex.prank_draw) {
    G.hand.change_size(-ex.prank_draw);
    ex.prank_draw = 0;
  }
}

/** Petilil / Lilligant: each scored Flower card (any card counting as one) earns $flower_money (fixed: money never takes Energy).
 *  A retrigger pays again; Blueprint copies it. Lilligant's Flower rule is Cherrim's poke_flower_rule (3+ suits; the fewest asked wins). */
function flower_money(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_poke_flower')) {
    const dollars = card.ability.extra.flower_money;
    G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + dollars;
    return { dollars, card, func() { G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); } };
  }
  return undefined;
}

/** Basculin's stripe (the Shellos line's rolled-once trait, with its own art): Red or Blue, rolled when the card is created
 *  (set_ability initial, seeded 'basculin_stripe'), kept on ability.extra.form; upstream 3.9.1 draws both on the Gen 5 sheet
 *  (Red {4,0}, its own card; Blue {6,0}: systems/anim.js BASCULIN_SPRITES). */
export const STRIPES = { red: { name: 'Red-Striped', suits: ['Hearts', 'Diamonds'] }, blue: { name: 'Blue-Striped', suits: ['Clubs', 'Spades'] } };
export const stripe_of = (card) => (STRIPES[card.ability.extra.form] ? card.ability.extra.form : 'red');
function stripe_chips(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && STRIPES[stripe_of(card)].suits.some((s) => context.other_card.is_suit(s))) {
    return { chips: card.ability.extra.chips, card };
  }
  return undefined;
}
/** The owner's Gen 8 batch 3 (Pokermon r72): Basculin -> Basculegion. Every scored card of its stripe's suits (counted once per hand in
 *  `before`, from the scoring hand: a debuffed card or a Stone card isn't of a suit, a Wild card is; retriggers don't count again; not a
 *  Blueprint's copy) adds 1 to `stripe_scored`; at the end of a round with BASCULEGION_CARDS (25) or more it evolves (scaling_evo). The
 *  count is kept on every rules rev, the evolution only on r72+ (an older recorded move replays as recorded). */
export const BASCULEGION_CARDS = 25;
function stripe_count(card, context) {
  if (!(context.before && context.scoring_hand && !context.blueprint && !context.retrigger_joker)) return;
  const suits = STRIPES[stripe_of(card)].suits;
  const n = context.scoring_hand.filter((c) => suits.some((s) => c.is_suit(s))).length;
  if (n) card.ability.extra.stripe_scored = (card.ability.extra.stripe_scored || 0) + n;
}
function basculegion_evo(self, card, context) {
  if (rulesRev('pokermon') < 72 || !context.end_of_round) return undefined;
  return scaling_evo(self, card, context, 'j_poke_basculegion', card.ability.extra.stripe_scored || 0, BASCULEGION_CARDS);
}

/** The Sandile line, Moxie: when you beat a Blind (the main end_of_round pass, not a game over; Quaxly's moment) it banks +mult_mod
 *  Mult (`moxie_mult`), Krookodile +Xmult_mod X Mult instead (`moxie_Xmult` from X1), in fields Energy never touches (Quaxly's bank:
 *  never retroactive; carried through both evolutions). Gain first, then the evolution countdown. Not Blueprint. */
function blind_moxie(card, context) {
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
    if (card.ability.extra.Xmult_mod !== undefined) bank(card, 'moxie_Xmult', 'Xmult_mod', 1, 'XMULT');
    else bank(card, 'moxie_mult', 'mult_mod', 1, 'MULT');
  }
}
function moxie_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.moxie_mult > 0) r.mult_mod = ex.moxie_mult;
  if (ex.moxie_Xmult > 1) r.Xmult_mod = ex.moxie_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(r.mult_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}

/** Maractus, a Hazard-held payoff: each Hazard card HELD in hand (any card counting as one, not debuffed) gives +mult Mult when a hand
 *  scores (h_mult, Baron's shape: Mime and held retriggers repeat it). Pokermon's Hazard layer deals them; Maractus turns them from a
 *  cost into fuel. */
const hazards_held = () => ((G.hand && G.hand.cards) || []).filter((c) => !c.debuff && has_enhancement(c, 'm_poke_hazard')).length;
function hazard_held_mult(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_poke_hazard')) {
    return { h_mult: card.ability.extra.mult, card };
  }
  return undefined;
}

/** Dwebble / Crustle: +chips Chips for each Stone card in the full deck (any card counting as one). */
const stones_in_deck = () => (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_stone')).length;
function stone_shell(card, context) {
  if (!context.joker_main) return undefined;
  const n = stones_in_deck(), chips = r3(card.ability.extra.chips * n);
  return chips > 0 ? { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips } : undefined;
}

/** Sigilyph: using a Planet card for Pair (Mercury, or any mod's Planet whose hand_type is Pair) levels Pair up `levels` more time(s),
 *  after the Planet's own level (the using_consumeable context runs once the Planet is used). Not Blueprint; fixed. */
function sigil_pair(card, context) {
  const c = context.consumeable;
  if (context.using_consumeable && !context.blueprint && c && c.ability.set === 'Planet' && c.ability.consumeable && c.ability.consumeable.hand_type === 'Pair') {
    level_up_hand(card, 'Pair', null, card.ability.extra.levels);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_level_up_ex'), colour: 'Planet' });
  }
}
const grudge_left = (card) => Math.max(0, grudge_cap(card) - grudge_used(card));
function grudge_sell(card, context) {
  if (context.selling_card && !context.blueprint && !context.retrigger_joker && context.card !== card && context.card.ability.set === 'Joker') grudge(card);
}
/** The owner's Gen 8 batch 3 (Pokermon r72): Yamask evolves into Runerigus INSTEAD of Cofagrigus if RUNERIGUS_STONES (10) Stone cards
 *  have scored while it was held (counted once per hand in `before`, from the scoring hand; not a Blueprint's copy), read when its
 *  evolution fires. Counted on every rules rev; the branch only on r72+ (an older recorded move evolves into Cofagrigus as recorded). */
export const RUNERIGUS_STONES = 10;
function wandering_count(card, context) {
  if (!(context.before && context.scoring_hand && !context.blueprint && !context.retrigger_joker)) return;
  const n = context.scoring_hand.filter((c) => has_enhancement(c, 'm_stone')).length;
  if (n) card.ability.extra.stones_scored = (card.ability.extra.stones_scored || 0) + n;
}
const runerigus_ready = (card) => rulesRev('pokermon') >= 72 && (card.ability.extra.stones_scored || 0) >= RUNERIGUS_STONES;
const mummy_state = () => (mummy_used() ? 'used this Ante' : 'ready');
/** Tirtouga / Carracosta, Ancient 9s: 1+ +chips1 Chips; 2+ each scored 9 permanently gains +chips2 Chips (perma_bonus, Kabuto's); 3+
 *  +chips3 Chips; Carracosta 4+ retriggers every scored 9. */
function ancient_nines(card, context) {
  const ex = card.ability.extra;
  if (context.joker_main && context.scoring_hand) {
    const n = ancient_count(context, 9);
    let chips = 0;
    if (n >= 1) chips += ex.chips1;
    if (n >= 3) { chips += ex.chips3; ancient_third(card, context); }
    if (chips > 0) return { message: a_chips(r3(chips)), colour: 'CHIPS', chip_mod: chips };
    return undefined;
  }
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.scoring_hand && !has_no_rank(context.other_card)
    && context.other_card.get_id() === 9 && ancient_count(context, 9) >= 2) {
    const a = context.other_card.ability;
    a.perma_bonus = r3((a.perma_bonus || 0) + ex.chips2);
    return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
  }
  if (ex.retriggers && context.repetition && context.cardarea === G.play && context.scoring_hand && !has_no_rank(context.other_card)
    && context.other_card.get_id() === 9 && ancient_count(context, 9) >= 4) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  return undefined;
}
/** Archen / Archeops, Ancient 10s: 1+ +mult Mult; 2+ X(Xmult); 3+ earn $ancient_money (once a hand: joker_main); Archeops 4+ X(Xmult2)
 *  too. Archeops's Defeatist: on the round's final hand (hands_left 0 while it scores, Azelf's check) every one of its numbers is
 *  halved: Mult / 2, an X keeps half its bonus (1 + (X - 1) / 2: X2 -> X1.5, X1.25 -> X1.125), the money rounds down ($3 -> $1). */
const defeatist = (card) => !!(card.ability.extra.Xmult2 !== undefined && G.GAME && G.GAME.facing_blind && final_hand());
const half_x = (x) => r3(1 + (x - 1) / 2);
export function ancient_tens_values(card) {
  const ex = card.ability.extra, half = defeatist(card);
  return {
    mult: r3(half ? ex.mult / 2 : ex.mult), x1: half ? half_x(ex.Xmult) : r3(ex.Xmult),
    x2: ex.Xmult2 === undefined ? undefined : (half ? half_x(ex.Xmult2) : r3(ex.Xmult2)),
    money: half ? Math.floor(ex.ancient_money / 2) : ex.ancient_money, half,
  };
}
function ancient_tens(card, context) {
  if (!context.joker_main || !context.scoring_hand) return undefined;
  const n = ancient_count(context, 10), v = ancient_tens_values(card);
  if (n < 1) return undefined;
  const r = { mult_mod: v.mult };
  let x = 1;
  if (n >= 2) x *= v.x1;
  if (n >= 4 && v.x2 !== undefined) x *= v.x2;
  if (x !== 1) r.Xmult_mod = x;
  if (n >= 3) { ancient_third(card, context); if (v.money > 0) r.dollars = v.money; }
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(v.mult);
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}

/** Minccino, Tidy Up: each discard you make (a player discard, once per discard, not per card) gives +1 hand size until your next hand
 *  is played (`tidy_draws`, taken back on press_play; and at the end of the round, or when it leaves, if still pending), so that
 *  discard's refill draws 1 extra card. Not Blueprint. */
function tidy_up(card, context) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker) {
    ex.tidy_draws = (ex.tidy_draws || 0) + 1;
    G.hand.change_size(1);
    card_eval_status_text(card, 'extra', null, null, null, { message: '+1 card', colour: 'FILTER' });
    return;
  }
  if ((context.press_play || round_end(context) || context.setting_blind) && !context.blueprint && ex.tidy_draws) {
    G.hand.change_size(-ex.tidy_draws);
    ex.tidy_draws = 0;
  }
}
const tidy = {
  remove_from_deck(self, card) { const ex = card.ability.extra; if (ex.tidy_draws) { G.hand.change_size(-ex.tidy_draws); ex.tidy_draws = 0; } },
};
/** Cinccino, Skill Link: the FIRST scored card (by position: a debuffed one there gets nothing, the next is never promoted) retriggers
 *  once per discard used this round (current_round.discards_used: a discard USE, whatever its size; effect discards never count),
 *  at most `link_cap` (5) times. Blueprint copies it. */
const skill_links = (card) => Math.min(card.ability.extra.link_cap, (G.GAME && G.GAME.current_round && G.GAME.current_round.discards_used) || 0);
function skill_link(card, context) {
  if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand[0] === context.other_card) {
    const n = skill_links(card);
    if (n > 0) return { message: localize('k_again_ex'), repetitions: n, card };
  }
  return undefined;
}

// ---------------------------------------------------------------- Gen 5, batch 3 (#580-637; the owner's "Build batch 3", 2026-10-29)
/** Ducklett / Swanna: the poker hand CONTAINS a Flush (the engine's poker_hands.Flush: a Straight Flush, a Flush House and a Flush Five
 *  contain one too). */
const has_flush = (context) => !!(context.poker_hands && (context.poker_hands.Flush || []).length > 0);

/** Deerling / Sawsbuck, Seasons: the season follows the Ante, cycling Spring -> Summer -> Autumn -> Winter (Ante 1 Spring, 2 Summer, 3
 *  Autumn, 4 Winter, 5 Spring...): DETERMINISTIC, read from G.GAME.round_resets.ante, so there is nothing to roll or save and every
 *  Deerling / Sawsbuck agrees. It changes at the start of each Ante (the ante goes up when its Boss Blind is beaten, so the shop after the
 *  Boss is already the next season). An Ante below 1 (a Hieroglyph) keeps cycling backwards (Ante 0 is Winter). Each season has a suit:
 *  Spring Hearts, Summer Diamonds, Autumn Clubs, Winter Spades. */
export const SEASONS = {
  spring: { name: 'Spring', suit: 'Hearts', colour: '#f0a0c8' },
  summer: { name: 'Summer', suit: 'Diamonds', colour: '#4bc292' },
  autumn: { name: 'Autumn', suit: 'Clubs', colour: '#e97333' },
  winter: { name: 'Winter', suit: 'Spades', colour: '#82c8e8' },
};
export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
export const season_of_ante = (ante) => SEASON_ORDER[((((ante === undefined || ante === null ? 1 : ante) - 1) % 4) + 4) % 4];
export const season_now = () => season_of_ante(G.GAME && G.GAME.round_resets && G.GAME.round_resets.ante);
/** A scored card of the season's suit (is_suit: a Wild card counts, a debuffed card doesn't). */
const season_card = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(SEASONS[season_now()].suit));
const season_vars = () => { const s = SEASONS[season_now()]; return { name: s.name, suit: localize(s.suit, 'suits_plural'), colour: s.suit }; };

/** Emolga, Static: each scored face card (is_face: a Jack, Queen or King — or any card with Pareidolia; a debuffed card is no face) earns
 *  $static_money (fixed) and gives +mult Mult. Heart Stamp's money (dollar_buffer). A retrigger pays and scores again. */
function static_face(card, context) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_face())) return undefined;
  const ex = card.ability.extra;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ex.static_money;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return { dollars: ex.static_money, mult: ex.mult, card };
}

/** Karrablast + Shelmet, the trade pair: they evolve ONLY together. Pairing: the undebuffed Karrablasts and Shelmets in row order, the 1st
 *  Karrablast with the 1st Shelmet, the 2nd with the 2nd... (a Blueprint is neither); one left without a partner counts nothing. At each
 *  end of round (the main pass, once for the whole row: whichever of them is calculated first does it) every paired one counts a round
 *  held together (`together`, at most 4; a counter of its own, kept if the partner leaves: a new partner must catch up). When BOTH of a
 *  pair have 4, that end of round Karrablast becomes Escavalier and Shelmet becomes Accelgor at the same time. An Everstone stops the
 *  evolution, not the count. */
export const TRADE_NEED = 4;
const TRADE_INTO = { j_poke_karrablast: 'j_poke_escavalier', j_poke_shelmet: 'j_poke_accelgor' };
export function trade_pairs() {
  const row = (G.jokers && G.jokers.cards) || [];
  const k = row.filter((j) => !j.debuff && j.config.center.key === 'j_poke_karrablast');
  const s = row.filter((j) => !j.debuff && j.config.center.key === 'j_poke_shelmet');
  return k.slice(0, Math.min(k.length, s.length)).map((j, i) => [j, s[i]]);
}
const trade_partner = (card) => { for (const [k, s] of trade_pairs()) { if (k === card) return s; if (s === card) return k; } return null; };
function trade_round(self, card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over || card.debuff) return;
  const GM = G.GAME;
  if (GM.poke_trade_round === GM.round) return;
  GM.poke_trade_round = GM.round;
  for (const pair of trade_pairs()) {
    for (const j of pair) j.ability.extra.together = Math.min(TRADE_NEED, (j.ability.extra.together || 0) + 1);
    const ready = pair.every((j) => j.ability.extra.together >= TRADE_NEED);
    if (ready && pair.every((j) => can_evolve(P_CENTERS[j.config.center.key], j, context, TRADE_INTO[j.config.center.key]))) {
      for (const j of pair) poke_evolve(j, TRADE_INTO[j.config.center.key]);
    } else {
      for (const j of pair) card_eval_status_text(j, 'extra', null, null, null, { message: 'Trade ' + j.ability.extra.together + '/' + TRADE_NEED, colour: 'FILTER' });
    }
  }
}
const trade_state = (card, partner) => {
  const p = G.jokers && G.jokers.cards.includes(card) ? trade_partner(card) : null;
  return p ? 'with ' + partner : 'needs ' + partner;
};
const hands_left_now = () => Math.max(0, (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left) || 0);

/** Foongus: at the end of each shop (Manaphy's Egg moment, not Blueprint), WITH consumable room only (no room, no roll: a full row never
 *  moves the seeded stream), a num in dem chance (Pokermon's pseudorandom_probability, seed 'foongus': Oops! All 6s raises it, Absol
 *  fixes it) to create a Poke Ball (Pokermon's Item c_poke_pokeball). Made at once, so a second Foongus sees the room taken. */
function foongus_ball(card, context) {
  if (!context.ending_shop || context.blueprint || !consumable_room()) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'foongus', ex.num, ex.dem, 'foongus')) return;
  add_card({ set: 'Item', key: 'c_poke_pokeball', key_append: 'foongus' });
  card_eval_status_text(card, 'extra', null, null, null, { message: '+1 Poke Ball', colour: 'GREEN' });
}
const spore_state = () => {
  const GM = G.GAME, b = GM && GM.blind;
  if (!GM || !GM.facing_blind || !b || !b.boss) return 'next Boss Blind';
  if (b.suspended) return 'active this hand';
  return GM.poke_spore_round === GM.round ? 'used this round' : 'not this round';
};

/** Alomomola, Healing Heart: the FIRST playing card destroyed each round (any cause: the remove_playing_cards context every destroying
 *  path sends — Glass shattering, The Hanged Man, a devouring joker, a destroying discard) is copied back into your full deck: a new card
 *  of the same rank, suit, enhancement, seal and edition (copy_card, as Cryptid / DNA; its permanent bonuses too), shuffled into the
 *  draw pile (G.deck). The original is still destroyed, so every "a card is destroyed" payoff fires. Each Alomomola copies once a round
 *  (`heal_round`, from selecting a Blind to selecting the next, its shop included). Not Blueprint (one copy a round). */
function healing_heart(card, context) {
  if (!context.remove_playing_cards || context.blueprint || !(context.removed || []).length) return;
  const ex = card.ability.extra;
  if (ex.heal_round === G.GAME.round) return;
  const orig = context.removed.find((c) => c && c.config && c.base);
  if (!orig) return;
  ex.heal_round = G.GAME.round;
  G.playing_card = (G.playing_card || 0) + 1;
  const copy = copy_card(orig, undefined, undefined, G.playing_card);
  delete copy.ability.poke_frozen;
  copy.ability.discarded = undefined;
  copy.add_to_deck();
  G.deck.config.card_limit = G.deck.config.card_limit + 1;
  G.playing_cards.push(copy);
  G.deck.emplace(copy);
  if (G.GAME.blind && G.GAME.facing_blind) G.GAME.blind.debuff_card(copy); else copy.set_debuff(false);
  playing_card_joker_effects([copy]);
  card_eval_status_text(card, 'extra', null, null, null, { message: 'Healing Heart!', colour: 'BLUE' });
}
const heal_state = (card) => (G.GAME && card.ability.extra.heal_round === G.GAME.round ? 'used this round' : 'ready');

/** Joltik: OTHER Lightning Jokers (is_type: a Tera sticker counts, it replaces the type; undebuffed), itself never. */
const other_lightning = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Lightning')).length;
/** Galvantula, Electroweb: each Gold card held in hand (not debuffed) gives X(Xmult_multi) when a hand scores (Baron's held shape: Mime and
 *  held retriggers repeat it). */
function electroweb(card, context) {
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_gold')) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
const steel_held_count = () => ((G.hand && G.hand.cards) || []).filter((c) => !c.debuff && has_enhancement(c, 'm_steel')).length;
const eelektross_x = (card) => r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * steel_in_deck());

/** Cubchoo: each scored Glass card (any card counting as one) gives +chips Chips. */
function glass_chips(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && has_enhancement(context.other_card, 'm_glass')) return { chips: card.ability.extra.chips, card };
  return undefined;
}
const frozen_card = (card) => ((G.hand && G.hand.cards) || []).find((c) => c.ability.poke_frozen === card.sort_id) || null;
function freeze(card, context) {
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
    const mine = frozen_card(card);
    for (const c of G.playing_cards || []) if (c !== mine && c.ability.poke_frozen === card.sort_id) delete c.ability.poke_frozen; // (it left the hand: thawed)
    if (mine) return undefined;
    const pick = G.hand.cards.find((c) => unbroken(c) && !frozen_by(c));
    if (!pick) return undefined;
    pick.ability.poke_frozen = card.sort_id;
    emit('card_changed', { card: pick.sort_id });
    G.E_MANAGER.add_event(() => { pick.juice_up(); });
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Frozen!', colour: '#82c8e8' });
    return undefined;
  }
  if (context.individual && context.cardarea === G.hand && !context.end_of_round && context.other_card.ability.poke_frozen === card.sort_id && !context.other_card.debuff) {
    return { x_mult: card.ability.extra.Xmult_multi, card };
  }
  return undefined;
}
const card_name = (c) => (c ? (has_no_rank(c) ? localize({ type: 'name_text', set: 'Enhanced', key: c.config.center.key }) : localize(c.base.value, 'ranks') + ' of ' + localize(c.base.suit, 'suits_plural')) : 'none');

/** Stunfisk, Static: each player discard (pre_discard without `hook`: The Hook's and the seals' discards don't count) earns $static_money,
 *  at most $money_cap a round (`static_paid`, kept with its round). Money is fixed: Energy-inert. Not Blueprint (the cap is its own). */
function static_discard(card, context) {
  if (!context.pre_discard || context.hook || context.blueprint || context.retrigger_joker) return undefined;
  const ex = card.ability.extra;
  if (ex.static_round !== G.GAME.round) { ex.static_round = G.GAME.round; ex.static_paid = 0; }
  const pay = Math.min(ex.static_money, ex.money_cap - ex.static_paid);
  if (pay <= 0) return undefined;
  ex.static_paid += pay;
  ease_dollars(pay);
  card_eval_status_text(card, 'dollars', pay);
  return undefined;
}
const static_paid = (card) => { const ex = card.ability.extra; return G.GAME && ex.static_round === G.GAME.round ? ex.static_paid || 0 : 0; };

/** Mienfoo / Mienshao: the TOP n scored cards by rank (Aces high; a tie the leftmost; never a debuffed or rankless (Stone) card): Sawk's
 *  snipe_target taken n times. Read from the scoring hand at every repetition call, so the same cards are picked each time. */
function top_ranked(scoring_hand, n) {
  const live = (scoring_hand || []).filter((c) => !c.debuff && !has_no_rank(c));
  return live.map((c, i) => [c, i]).sort((a, b) => b[0].get_id() - a[0].get_id() || a[1] - b[1]).slice(0, n).map(([c]) => c);
}
function top_retrigger(card, context) {
  if (context.repetition && context.cardarea === G.play && !context.end_of_round && top_ranked(context.scoring_hand, card.ability.extra.targets).includes(context.other_card)) {
    return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
  }
  return undefined;
}

/** Bouffalant, Head Charge: beat a Blind with the round's FIRST hand (current_round.hands_played === 1 at the end of round, Scraggy's Moxie
 *  check; not a game over) and it banks +Xmult_mod X Mult (`charge_Xmult` from X1, no energy field: never retroactive), up to Xmult_cap
 *  (X4 in all, fixed). Not Blueprint (it copies the X). */
function head_charge(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over || G.GAME.current_round.hands_played !== 1) return;
  const ex = card.ability.extra;
  if (ex.charge_Xmult >= ex.Xmult_cap) return;
  ex.charge_Xmult = r3(Math.min(ex.Xmult_cap, ex.charge_Xmult + ex.Xmult_mod));
  card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.charge_Xmult), colour: 'XMULT' });
}

/** Heatmor + Durant, the rivals. Heatmor: +mult Mult per discard used this round (current_round.discards_used: a discard USE; effect
 *  discards never count). Together (an undebuffed Durant held: find_card; a Blueprint isn't one) Heatmor banks +Xmult_mod X Mult at each
 *  end of round (`ant_Xmult` from X1, no energy field: Energy never raises what is banked), and Heatmor gives that X from then on, with or
 *  without Durant. Durant's own rule is the card-level Steel one (steel_rule_x). Not Blueprint for the bank. */
const rivals = () => !!(G.jokers && find_card('j_poke_durant').length > 0);
function heatmor_calc(card, context) {
  const ex = card.ability.extra;
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over && rivals()) {
    ex.ant_Xmult = r3(ex.ant_Xmult + ex.Xmult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: a_xmult(ex.ant_Xmult), colour: 'XMULT' });
    return undefined;
  }
  if (!context.joker_main) return undefined;
  const m = r3(ex.mult * discards_used()), r = {};
  if (m > 0) r.mult_mod = m;
  if (ex.ant_Xmult > 1) r.Xmult_mod = ex.ant_Xmult;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : a_mult(m);
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Volcarona, Quiver Dance: each Fire Joker (is_type: a Tera counts; undebuffed; itself included) gives X(Xmult_multi), the other_joker
 *  context (Manaphy's "each Water Joker gives"). */
const fire_joker = (j) => !!(j && j.ability && j.ability.set === 'Joker' && !j.debuff && is_type(j, 'Fire'));
const fire_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && fire_joker(j)).length + (is_type(card, 'Fire') ? 1 : 0);

export const JOKERS = {

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

  // ---------------------------------------------------------------- Gen 5, batch 4: the Gen 5 Legendaries, 638-649 (contentRev 55)
  // The owner's design ("Build as pitched", 2026-10-29). Legendary $20 each (The Soul / the Legendary pool). Types from the card art
  // (pokermon_art_type.mjs; every form cell checked): Cobalion Metal, Terrakion Earth, Virizion Grass, Tornadus Colorless, Thundurus
  // Lightning, Reshiram Fire, Zekrom Lightning, Landorus Earth, Kyurem Water, Keldeo Fighting, Meloetta Psychic (its Pirouette cell
  // Fighting), Genesect Grass; the Therian, Black / White and Resolute cells show their base type. Neither Nacho nor Pokermon+ has
  // any. Art: upstream 3.9.1's own cells with their floating souls (Cobalion / Terrakion / Virizion Natdex {14..18,42}, the rest the
  // Gen 5 sheet), the forms drawn live by ui.js ownFace (systems/anim.js GEN5_LEGEND_FORMS) from each center's poke_view_form.
  // After Hydreigon (635) in Pokédex order (Pokermon has no Larvesta / Volcarona).
  //
  // The Swords of Justice, Cobalion 638 / Terrakion 639 / Virizion 640 (and Keldeo 647): each scored card of the sword's suit (Spades /
  // Diamonds / Clubs / Hearts; is_suit, so Wild cards count) gives X1.25 Mult (`Xmult_multi`, Energy +5%: 1.3125 / 1.375 / 1.4375).
  // Swords of Justice (contentRev 59, the owner's solo rule; it was +X0.1 per other sword): while its suit is the most common suit in
  // your full deck (suit_leads: contentRev 60, STRICTLY the most common, a tie doesn't count (r59 runs re-play with ties counting); Wild
  // cards count for every suit, Stone for none), X1.5 instead (Xmult_multi x 1.2: 1.575 / 1.65 / 1.725). Blueprint copies it.
  // (`sword_mod` stays for runs recorded before r59.)
  cobalion: {
    name: 'cobalion', poke_sprite391: sprite('Natdex', 14, 42, [15, 42]),
    config: { extra: { Xmult_multi: 1.25, sword_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Metal', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'spades'], poke_after: 'hydreigon',
    loc_vars(self, info_queue, card) { return sword_vars(self, info_queue, card); },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  terrakion: {
    name: 'terrakion', poke_sprite391: sprite('Natdex', 16, 42, [17, 42]),
    config: { extra: { Xmult_multi: 1.25, sword_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'diamonds'], poke_after: 'cobalion',
    loc_vars(self, info_queue, card) { return sword_vars(self, info_queue, card); },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  virizion: {
    name: 'virizion', poke_sprite391: sprite('Natdex', 18, 42, [19, 42]),
    config: { extra: { Xmult_multi: 1.25, sword_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'clubs'], poke_after: 'terrakion',
    loc_vars(self, info_queue, card) { return sword_vars(self, info_queue, card); },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  // The Forces of Nature, Tornadus 641 / Thundurus 642 / Landorus 645. Formes (therian; contentRev 59, the owner's solo rule; a partner
  // set it before): each one's Therian Forme comes for good after it has been held for 4 rounds (a Reveal Glass), the art with it. The forme only
  // changes the effect (the type stays). Tornadus (Colorless): +1 hand each round (the Squirtle line's pair, fixed); Therian, also +3
  // Mult per hand left when it scores (`mult`, Energy +40%: 4.2 / 5.4 / 6.6). Thundurus (Lightning): each scored card 1 in 4 to earn
  // $1; Therian 1 in 2 (`dem2`), and a card that pays also gives X1.1 (`Xmult_multi` +5%: 1.155 / 1.21 / 1.265); the odds and the $1
  // (`storm_money`) are fixed. Landorus (Earth): each Stone card held in hand +40 Chips (`chips` +30%: 52 / 64 / 76); Therian, each
  // scored Stone card X1.5 instead (`Xmult_multi` +5%: 1.575 / 1.65 / 1.725).
  tornadus: {
    name: 'tornadus', poke_sprite391: sprite('Gen05', 6, 3, [7, 3]),
    config: { extra: { hands: 1, mult: 3, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['hands', 'mult'], poke_after: 'virizion',
    poke_view_form(self, card) { return therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.hands, r3(ex.mult), therian(card) ? 'Therian Forme: +' + r3(tornadus_mult(card)) + ' Mult' : forme_state(card)] };
    },
    calculate(self, card, context) {
      if (therian_tick(card, context)) return undefined;
      if (context.joker_main && therian(card)) { const m = tornadus_mult(card); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
    ...hands,
  },
  thundurus: {
    name: 'thundurus', poke_sprite391: sprite('Gen05', 10, 3, [11, 3]),
    config: { extra: { num: 1, dem: 4, dem2: 2, storm_money: 1, Xmult_multi: 1.1, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['money', 'chance', 'xmult'], poke_after: 'tornadus',
    poke_view_form(self, card) { return therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [n1, d1] = get_probability_vars(card, ex.num, ex.dem, 'thundurus'), [n2, d2] = get_probability_vars(card, ex.num, ex.dem2, 'thundurus');
      return { vars: [n1, d1, ex.storm_money, n2, d2, r3(ex.Xmult_multi), forme_state(card)] };
    },
    calculate(self, card, context) { return wild_charge(card, context); },
  },
  // The Tao trio, Reshiram 643 (Fire) / Zekrom 644 (Lightning) / Kyurem 646 (Water). Turboblaze / Teravolt: each Fire / Lightning Joker,
  // itself included, gives X1.25 Mult (the other_joker pass, Manaphy's shape: is_type, so Arceus and a Tera count; a debuffed joker
  // doesn't; `Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Fusion Flare / Fusion Bolt (contentRev 59, the owner's solo rule; it was Truth
  // vs Ideals, +0.25 each with both held): each Fire / Lightning Energy card used (on any joker) permanently adds +X0.05 to its per-joker
  // X (`fusion_x`, a bank in no energy field; `fusion_mod` fixed). Blueprint copies the X (a second X per joker, as Baseball Card),
  // never the bank. (`tao_mod` stays for runs recorded before r59.)
  reshiram: {
    name: 'reshiram', poke_sprite391: sprite('Gen05', 2, 4, [3, 4]),
    config: { extra: { Xmult_multi: 1.25, tao_mod: 0.25, fusion_x: 0, fusion_mod: 0.05 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'energy', 'scaling'], poke_after: 'thundurus',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(tao_x(card)), typed_count(card, 'Fire'), r3(ex.fusion_mod), r3(ex.fusion_x || 0)] };
    },
    calculate(self, card, context) { return tao_boost(card, context); },
  },
  zekrom: {
    name: 'zekrom', poke_sprite391: sprite('Gen05', 6, 4, [7, 4]),
    config: { extra: { Xmult_multi: 1.25, tao_mod: 0.25, fusion_x: 0, fusion_mod: 0.05 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'energy', 'scaling'], poke_after: 'reshiram',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(tao_x(card)), typed_count(card, 'Lightning'), r3(ex.fusion_mod), r3(ex.fusion_x || 0)] };
    },
    calculate(self, card, context) { return tao_boost(card, context); },
  },
  landorus: {
    name: 'landorus', poke_sprite391: sprite('Gen05', 10, 4, [11, 4]),
    config: { extra: { chips: 40, Xmult_multi: 1.5, therian_rounds: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'enhancements'], poke_after: 'zekrom',
    poke_view_form(self, card) { return therian(card) ? 'therian' : 'incarnate'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone);
      const ex = card.ability.extra;
      return { vars: [r3(ex.chips), r3(ex.Xmult_multi), forme_state(card)] };
    },
    calculate(self, card, context) { return sand_force(card, context); },
  },
  // Kyurem 646 (Water): X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4). contentRev 59 (the owner's solo rule; it borrowed a held Reshiram's /
  // Zekrom's X before): White Kyurem while you have more Fire Jokers than Lightning Jokers, Black Kyurem while more Lightning than Fire
  // (itself left out; kyurem_form: a tie keeps its form, plain Kyurem until one side first leads), the art with it; then each Joker of
  // that type gives X1.25 Mult (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Blueprint copies the X and the per-type X.
  kyurem: {
    name: 'kyurem', poke_sprite391: sprite('Gen05', 2, 5, [3, 5]),
    config: { extra: { Xmult: 1.5, Xmult_multi: 1.25 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker'], poke_after: 'landorus',
    poke_view_form(self, card) { return kyurem_form(card); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, f = kyurem_form(card), fire = kyurem_count(card, 'Fire'), bolt = kyurem_count(card, 'Lightning');
      const state = (f === 'white' ? 'White Kyurem' : f === 'black' ? 'Black Kyurem' : 'Kyurem') + ': ' + fire + ' Fire, ' + bolt + ' Lightning';
      return { vars: [r3(ex.Xmult), r3(ex.Xmult_multi), state] };
    },
    calculate(self, card, context) {
      if (!context.blueprint && solo59()) card.ability.extra.kyurem_form = kyurem_form(card);
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return kyurem_borrow(card, context);
    },
  },
  // Keldeo 647 (Fighting), the fourth sword: each scored Heart X1.25 (`Xmult_multi` +5%), X1.5 while Hearts lead the full deck (Swords of
  // Justice). Resolute Form (contentRev 59, the owner's solo rule; it needed the other three swords before): for good once 25 Hearts have
  // scored while it is held (`hearts`, on the card; retriggers count, the 25th still pays Ordinary), its Resolute card shows and its
  // per-Heart X is X2 (`Xmult_multi2` +5%: 2.1 / 2.2 / 2.3) instead of either.
  keldeo: {
    name: 'keldeo', poke_sprite391: sprite('Gen05', 0, 6, [1, 6]),
    config: { extra: { Xmult_multi: 1.25, Xmult_multi2: 2, sword_mod: 0.1, hearts: 0 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit', 'hearts'], poke_after: 'kyurem',
    poke_view_form(self, card) { return keldeo_resolute(card) ? 'resolute' : 'ordinary'; },
    loc_vars(self, info_queue, card) {
      const v = sword_vars(self, info_queue, card).vars, ex = card.ability.extra;
      return { vars: [...v, r3(ex.Xmult_multi2), keldeo_resolute(card) ? 'Resolute Form' : 'Hearts: ' + Math.min(RESOLUTE_AT, ex.hearts || 0) + '/' + RESOLUTE_AT] };
    },
    calculate(self, card, context) { return sacred_sword(card, context); },
  },
  // Meloetta 648, Relic Song: switches forme after EVERY hand played (relic_song: the `after` pass, a debuffed hand too; not Blueprint);
  // every round starts in Aria (it resets each round, never carries over). Aria (Psychic): X2 Mult (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  // Pirouette (Fighting): the first scored card (by position, Cinccino's) retriggers 3 times (fixed). Its type follows the forme
  // (ability.extra.ptype, Castform's way; a Tera sticker still owns it), so the forme's Energy matches; its type never breaks Monotype
  // (poke_mono_exempt). Art: the Pirouette cell, live. Save / resume replay the hands, so the forme comes back exactly.
  meloetta: {
    name: 'meloetta', poke_sprite391: sprite('Gen05', 4, 6, [5, 6]),
    config: { extra: { Xmult: 2, retriggers: 3, form: 'aria' } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'retrigger', 'types'], poke_after: 'keldeo',
    poke_mono_exempt: true,
    poke_view_form(self, card) { return meloetta_form(card); },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult), ex.retriggers, MELOETTA_FORMES[meloetta_form(card)].name] };
    },
    calculate(self, card, context) {
      relic_song(card, context);
      const ex = card.ability.extra, f = meloetta_form(card);
      if (f === 'aria' && context.joker_main) return { message: a_xmult(r3(ex.Xmult)), colour: 'XMULT', Xmult_mod: ex.Xmult };
      if (f === 'pirouette' && context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand[0] === context.other_card) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      return undefined;
    },
  },
  // Genesect 649 (Grass), Techno Blast: X(1.5 + 0.5 per Water, Lightning or Fire Joker you have) Mult (techno_count: one is_type test per
  // joker, so Arceus or a two-type joker counts once; undebuffed; Ice already maps to Water). `Xmult` and `Xmult_mod` +20% (1.8 / 2.1 /
  // 2.4 and 0.6 / 0.7 / 0.8).
  genesect: {
    name: 'genesect', poke_sprite391: sprite('Gen05', 8, 6, [9, 6]),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types'], poke_after: 'meloetta',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), techno_count(card), r3(techno_x(card))] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = techno_x(card);
      return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
    },
  },

  // ---------------------------------------------------------------- The Gen 5 starters (contentRev 50): Snivy 495 -> Servine 496 -> Serperior 497
  // (Grass), Tepig 498 -> Pignite 499 -> Emboar 500 (Fire), Oshawott 501 -> Dewott 502 -> Samurott 503 (Water). Pokermon's starter rules:
  // the type's perk at every stage (Grass +1 hand size, Bulbasaur's; Fire +1 discard, Charmander's; Water +1 hand, Squirtle's), Basic
  // Uncommon $5 with `starter` (the Starter Pack), Stage 1 Safari $8, Stage 2 Safari $10; evolution by rounds, 5 then 5 (Chikorita's /
  // Cyndaquil's / Totodile's timers). Types from their upstream cards (Grass / Fire / Fire / Water: Pignite and Emboar are Fire/Fighting,
  // their cards Fire). Nacho and Pokermon+ have none of the nine. Art: upstream 3.9.1 (Natdex {28,32}, then {0..14,33}).
  // Snivy (Contrary): each debuffed card held in hand gives +4 Mult (`mult`, Energy +40%: 5.6 / 7.2 / 8.8).
  snivy: {
    name: 'snivy', poke_sprite391: sprite('Natdex', 28, 32),
    config: { extra: { h_size: 1, mult: 4, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'mult', 'debuff', 'round_evo'], poke_after: 'arceus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = debuffed_held(); return { vars: [ex.h_size, r3(ex.mult), ex.rounds, n, r3(ex.mult * n)] }; },
    calculate(self, card, context) { return contrary_held(card, context) || level_evo(self, card, context, 'j_poke_servine'); },
    ...hand_size,
  },
  // Servine: +8 Mult per debuffed card held (Energy: 11.2 / 14.4 / 17.6).
  servine: {
    name: 'servine', poke_sprite391: sprite('Natdex', 0, 33),
    config: { extra: { h_size: 1, mult: 8, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'mult', 'debuff', 'round_evo'], poke_after: 'snivy',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = debuffed_held(); return { vars: [ex.h_size, r3(ex.mult), ex.rounds, n, r3(ex.mult * n)] }; },
    calculate(self, card, context) { return contrary_held(card, context) || level_evo(self, card, context, 'j_poke_serperior'); },
    ...hand_size,
  },
  // Serperior: debuffed scored cards score as if not debuffed (contrary_lifts, the score_debuffed hook), and each gives X1.25
  // (`Xmult_multi`, Energy +5%: 1.3125 / 1.375 / 1.4375). Its Contrary is the payoff the line was building to: the held +Mult is gone.
  serperior: {
    name: 'serperior', poke_sprite391: sprite('Natdex', 2, 33),
    config: { extra: { h_size: 1, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'xmult', 'debuff'], poke_after: 'servine',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.debuff_lifted) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...hand_size,
  },
  // Tepig (Flame Charge): +4 Mult per hand in a row of the same poker hand this round, this one included (`mult`, Energy +40%: 5.6 / 7.2 / 8.8).
  tepig: {
    name: 'tepig', poke_sprite391: sprite('Natdex', 4, 33),
    config: { extra: { d_size: 1, mult: 4, rounds: 5, streak: 0 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'mult', 'hand_type', 'reset', 'round_evo'], poke_after: 'serperior',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), ex.rounds, ...flame_vars(ex)] }; },
    calculate(self, card, context) { flame_charge(card, context); return flame_main(card, context) || level_evo(self, card, context, 'j_poke_pignite'); },
    ...discards,
  },
  // Pignite: +6 Mult per streak hand (Energy: 8.4 / 10.8 / 13.2).
  pignite: {
    name: 'pignite', poke_sprite391: sprite('Natdex', 6, 33),
    config: { extra: { d_size: 1, mult: 6, rounds: 5, streak: 0 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'discard', 'mult', 'hand_type', 'reset', 'round_evo'], poke_after: 'tepig',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult), ex.rounds, ...flame_vars(ex)] }; },
    calculate(self, card, context) { flame_charge(card, context); return flame_main(card, context) || level_evo(self, card, context, 'j_poke_emboar'); },
    ...discards,
  },
  // Emboar: X1 + X0.25 per streak hand (`Xmult_mod`, Energy +20%: 0.3 / 0.35 / 0.4).
  emboar: {
    name: 'emboar', poke_sprite391: sprite('Natdex', 8, 33),
    config: { extra: { d_size: 1, Xmult_mod: 0.25, streak: 0 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'discard', 'xmult', 'hand_type', 'reset'], poke_after: 'pignite',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [n, h] = flame_vars(ex);
      return { vars: [ex.d_size, r3(ex.Xmult_mod), n, h, r3(1 + ex.Xmult_mod * n)] };
    },
    calculate(self, card, context) { flame_charge(card, context); return flame_main(card, context); },
    ...discards,
  },
  // Oshawott (Razor Shell): the first scored card retriggers once. The retriggers are fixed; it carries Samurott's Ace X (`Xmult_multi` 1.5,
  // unused until then: Combee's "Energy for later"), so Energy can be used on it and is re-applied at each evolution.
  oshawott: {
    name: 'oshawott', poke_sprite391: sprite('Natdex', 10, 33),
    config: { extra: { hands: 1, strikes: 1, retriggers: 1, Xmult_multi: 1.5, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'retrigger', 'position', 'round_evo'], poke_after: 'emboar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.strikes, ex.rounds] }; },
    calculate(self, card, context) { return razor_shell(card, context) || level_evo(self, card, context, 'j_poke_dewott'); },
    ...hands,
  },
  // Dewott: the first 2 scored cards retrigger.
  dewott: {
    // (+ regional batch C: a Dark Energy used on it evolves it into Hisuian Samurott — systems/energy.js energy_evo_target, from HISUI_REV)
    poke_energy_evo: { etype: 'Dark', into: 'j_poke_hisuian_samurott', rev: HISUI_REV },
    name: 'dewott', poke_sprite391: sprite('Natdex', 12, 33),
    config: { extra: { hands: 1, strikes: 2, retriggers: 1, Xmult_multi: 1.5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hands', 'retrigger', 'position', 'round_evo'], poke_after: 'oshawott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.strikes, ex.rounds] }; },
    calculate(self, card, context) { return razor_shell(card, context) || level_evo(self, card, context, 'j_poke_samurott'); },
    ...hands,
  },
  // Samurott: the first 3 scored cards retrigger; Shell Blade: scored Aces give X1.5 (Energy +5%: 1.575 / 1.65 / 1.725).
  samurott: {
    name: 'samurott', poke_sprite391: sprite('Natdex', 14, 33),
    config: { extra: { hands: 1, strikes: 3, retriggers: 1, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['starter', 'hands', 'retrigger', 'position', 'xmult', 'rank'], poke_after: 'dewott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.strikes, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return razor_shell(card, context) || shell_blade(card, context); },
    ...hands,
  },
  // ---------------------------------------------------------------- Gen 5, batch 1 (the owner's "Build it", 2026-10-28; contentRev 53)
  // 22 jokers, #504-539. Prices by the DESIGN_GUIDE slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7);
  // evolution by rounds (4 for an early evolver, else 5). Types = the cards'. Energy raises each joker's main number at the standard
  // share; odds, Foresight, money and retriggers are fixed; a stage with no number carries its evolution's field ("Energy carries to
  // ..."). Art: upstream 3.9.1's own cells (Natdex {16..28,33}, {16..24,34}, {2..26,35}; Unfezant Gen05 {0,0}); nothing to deploy.
  // Neither Nacho nor Pokermon+ has any of them.
  // Patrat 504: Common $5, Colorless. +1 Foresight; Lookout: each Foreseen card gives +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 4 rounds.
  patrat: {
    name: 'patrat', poke_sprite391: sprite('Natdex', 16, 33),
    config: { extra: { scry: 1, mult: 6, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['foresight', 'mult', 'round_evo'], poke_after: 'samurott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return lookout(card, context) || level_evo(self, card, context, 'j_poke_watchog'); },
    ...scry,
  },
  // Watchog 505: Safari $8. +2 Foresight; each Foreseen card +10 Mult (14 / 18 / 22).
  watchog: {
    name: 'watchog', poke_sprite391: sprite('Natdex', 18, 33),
    config: { extra: { scry: 2, mult: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['foresight', 'mult'], poke_after: 'patrat',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, r3(ex.mult)] }; },
    calculate(self, card, context) { return lookout(card, context); },
    ...scry,
  },
  // Lillipup 506: Uncommon $6, Colorless. Pickup: at end of round, 1 in 4 to create a random Tarot (with room; no room, no roll). Its odds are
  // fixed; it carries Stoutland's `mult` 3 ("Energy carries to Stoutland"). 4 rounds.
  lillipup: {
    name: 'lillipup', poke_sprite391: sprite('Natdex', 20, 33),
    config: { extra: { num: 1, dem: 4, mult: 3, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: false,
    attributes: ['tarot', 'chance', 'round_evo'], poke_after: 'watchog',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...pickup_vars(card, 'lillipup'), card.ability.extra.rounds] }; },
    calculate(self, card, context) { pickup(card, context, 'lillipup'); return level_evo(self, card, context, 'j_poke_herdier'); },
  },
  // Herdier 507: Safari $8. 1 in 3: a Tarot or a Planet (a seeded coin). 5 rounds.
  herdier: {
    name: 'herdier', poke_sprite391: sprite('Natdex', 22, 33),
    config: { extra: { num: 1, dem: 3, planets: true, mult: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: false,
    attributes: ['tarot', 'planet', 'chance', 'round_evo'], poke_after: 'lillipup',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...pickup_vars(card, 'herdier'), card.ability.extra.rounds] }; },
    calculate(self, card, context) { pickup(card, context, 'herdier'); return level_evo(self, card, context, 'j_poke_stoutland'); },
  },
  // Stoutland 508: Safari $10. 1 in 2: a Tarot or a Planet; +3 Mult for each consumable held (`mult` +40%: 4.2 / 5.4 / 6.6).
  stoutland: {
    name: 'stoutland', poke_sprite391: sprite('Natdex', 24, 33),
    config: { extra: { num: 1, dem: 2, planets: true, mult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['tarot', 'planet', 'chance', 'mult'], poke_after: 'herdier',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [...pickup_vars(card, 'stoutland'), r3(card.ability.extra.mult), stout_mult(card)] }; },
    calculate(self, card, context) {
      pickup(card, context, 'stoutland');
      if (context.joker_main && held_consumables() > 0) { const m = stout_mult(card); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
  },
  // Purrloin 509: Common $5, Dark. Pickpocket: earn $2 at end of round (calc_dollar_bonus); the Joker directly to its right loses $1 of
  // sell value (never below $1; nothing on its right: no loss, the $2 still earned). Money and drain fixed: Energy-inert
  // (poke_no_energy_field). 4 rounds.
  purrloin: {
    name: 'purrloin', poke_sprite391: sprite('Natdex', 26, 33),
    config: { extra: { steal: 2, drain: 1, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: false,
    attributes: ['economy', 'drain', 'round_evo'], poke_after: 'stoutland',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.steal, ex.drain, ex.rounds] }; },
    calculate(self, card, context) { pickpocket(card, context); return level_evo(self, card, context, 'j_poke_liepard'); },
    calc_dollar_bonus(self, card) { return card.ability.extra.steal; },
  },
  // Liepard 510: Safari $8. $4 at end of round; the right neighbour still loses $1.
  liepard: {
    name: 'liepard', poke_sprite391: sprite('Natdex', 28, 33),
    config: { extra: { steal: 4, drain: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: false,
    attributes: ['economy', 'drain'], poke_after: 'purrloin',
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.steal, ex.drain] }; },
    calculate(self, card, context) { pickpocket(card, context); return undefined; },
    calc_dollar_bonus(self, card) { return card.ability.extra.steal; },
  },
  // Pidove 519: Uncommon $6, Colorless. Super Luck: Lucky cards' odds +1 (the numerator, before Oops! doubles it). The odds are fixed; it
  // carries Tranquill's `mult` 5 ("Energy carries to Tranquill"). Starly's flock counts all three (Colorless). 4 rounds.
  pidove: {
    name: 'pidove', poke_sprite391: sprite('Natdex', 16, 34),
    config: { extra: { lucky_odds: 1, mult: 5, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: false,
    attributes: ['chance', 'enhancements', 'round_evo'], poke_after: 'musharna',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.lucky_odds, ...lucky_odds_vars(card), ex.rounds] }; },
    calculate(self, card, context) { return super_luck(card, context) || level_evo(self, card, context, 'j_poke_tranquill'); },
  },
  // Tranquill 520: Safari $8. Super Luck; a scored Lucky card that triggers also gives +5 Mult (`mult` +40%: 7 / 9 / 11). 5 rounds.
  tranquill: {
    name: 'tranquill', poke_sprite391: sprite('Natdex', 18, 34),
    config: { extra: { lucky_odds: 1, mult: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['chance', 'enhancements', 'mult', 'round_evo'], poke_after: 'pidove',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.lucky_odds, ...lucky_odds_vars(card), r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      const r = super_luck(card, context);
      if (r) return r;
      if (lucky_scored(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_unfezant');
    },
  },
  // Unfezant 521: Safari $10. Super Luck; a triggering Lucky card gives X1.5 instead (`Xmult_multi` +5%: X1.575 / 1.65 / 1.725).
  unfezant: {
    name: 'unfezant', poke_sprite391: sprite('Gen05', 0, 0),
    config: { extra: { lucky_odds: 1, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['chance', 'enhancements', 'xmult'], poke_after: 'tranquill',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.lucky_odds, ...lucky_odds_vars(card), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      const r = super_luck(card, context);
      if (r) return r;
      if (lucky_scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Blitzle 522: Common $5, Lightning. Motor Drive: +4 Mult for each hand played this round before any discard, this one included (the 1st
  // hand +4, the 2nd +8...; once you discard, +0 for the rest of the round). `mult` +40%: 5.6 / 7.2 / 8.8 a hand. 5 rounds.
  blitzle: {
    name: 'blitzle', poke_sprite391: sprite('Natdex', 22, 34),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'hands', 'round_evo'], poke_after: 'unfezant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), motor_mult(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = motor_mult(card); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_zebstrika');
    },
  },
  // Zebstrika 523: Safari $8. X1.5 Mult if you haven't discarded this round (`Xmult` +20%: 1.8 / 2.1 / 2.4).
  zebstrika: {
    name: 'zebstrika', poke_sprite391: sprite('Natdex', 24, 34),
    config: { extra: { Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'discard'], poke_after: 'blitzle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult), motor_on() ? 'Active!' : 'Inactive: you discarded'] }; },
    calculate(self, card, context) {
      if (context.joker_main && motor_on()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Woobat 527: Common $5, Psychic. Heart Stamp: each scored Heart earns $1 (Rough Gem's, Wild cards count). The $ is fixed; it carries
  // Swoobat's `Xmult_multi` ("Energy carries to Swoobat"). 5 rounds.
  woobat: {
    name: 'woobat', poke_sprite391: sprite('Natdex', 2, 35),
    config: { extra: { stamp_money: 1, Xmult_multi: 1.1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['economy', 'suit', 'hearts', 'round_evo'], poke_after: 'gigalith',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.stamp_money, ex.rounds] }; },
    calculate(self, card, context) { return heart_stamp(card, context, false) || level_evo(self, card, context, 'j_poke_swoobat'); },
  },
  // Swoobat 528: Safari $8. Each scored Heart earns $1 and gives X1.1 (`Xmult_multi` +5%: X1.155 / 1.21 / 1.265).
  swoobat: {
    name: 'swoobat', poke_sprite391: sprite('Natdex', 4, 35),
    config: { extra: { stamp_money: 1, Xmult_multi: 1.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['economy', 'xmult', 'suit', 'hearts'], poke_after: 'woobat',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.stamp_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return heart_stamp(card, context, true); },
  },
  // Timburr 532: Uncommon $6, Fighting. Scored Stone cards each give +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8). 5 rounds.
  timburr: {
    name: 'timburr', poke_sprite391: sprite('Natdex', 12, 35),
    config: { extra: { mult: 4, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'excadrill',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return pillars(card, context, false) || level_evo(self, card, context, 'j_poke_gurdurr'); },
  },
  // Gurdurr 533: Safari $8. +8 Mult per scored Stone card (11.2 / 14.4 / 17.6). 5 rounds.
  gurdurr: {
    name: 'gurdurr', poke_sprite391: sprite('Natdex', 14, 35),
    config: { extra: { mult: 8, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'timburr',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { return pillars(card, context, false) || level_evo(self, card, context, 'j_poke_conkeldurr'); },
  },
  // Conkeldurr 534: Safari $10. +8 Mult and X1.5 per scored Stone card (`mult` +40%: 11.2 / 14.4 / 17.6, kept from Gurdurr so its Energy
  // never shrinks on evolving; `Xmult_multi` +5%: X1.575 / 1.65 / 1.725).
  conkeldurr: {
    name: 'conkeldurr', poke_sprite391: sprite('Natdex', 16, 35),
    config: { extra: { mult: 8, Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements'], poke_after: 'gurdurr',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) { return pillars(card, context, true); },
  },
  // Tympole 535: Uncommon $6, Water. Swift Swim: +30 Chips, doubled while it's raining (swift_swim_raining: a working Kyogre, or a Clubs
  // forecast on the round's first deal). `chips` +30%: 39 / 48 / 57. 5 rounds.
  tympole: {
    name: 'tympole', poke_sprite391: sprite('Natdex', 18, 35),
    config: { extra: { chips: 30, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'suit', 'clubs', 'hand_drawn', 'round_evo'], poke_after: 'conkeldurr',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card), ex.rounds] }; },
    calculate(self, card, context) { return swift_swim(card, context) || level_evo(self, card, context, 'j_poke_palpitoad'); },
  },
  // Palpitoad 536: Safari $8. +50 Chips, doubled in rain (65 / 80 / 95). 5 rounds.
  palpitoad: {
    name: 'palpitoad', poke_sprite391: sprite('Natdex', 20, 35),
    config: { extra: { chips: 50, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'suit', 'clubs', 'hand_drawn', 'round_evo'], poke_after: 'tympole',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card), ex.rounds] }; },
    calculate(self, card, context) { return swift_swim(card, context) || level_evo(self, card, context, 'j_poke_seismitoad'); },
  },
  // Seismitoad 537: Safari $10. +50 Chips, doubled in rain; in rain every scored Club also retriggers once (fixed).
  seismitoad: {
    name: 'seismitoad', poke_sprite391: sprite('Natdex', 22, 35),
    config: { extra: { chips: 50, retriggers: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'retrigger', 'suit', 'clubs', 'hand_drawn'], poke_after: 'palpitoad',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), rain_state(card)] }; },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && context.other_card.is_suit('Clubs') && swift_swim_raining(card)) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return swift_swim(card, context);
    },
  },
  // Throh 538: Rare $7, Fighting. Seismic Toss: the lowest-ranked scored card gives X2 (`Xmult_multi` +5%: X2.1 / 2.2 / 2.3) each time it
  // scores (re-read per scoring, so its retriggers hit again); a tie the leftmost; never a Stone or debuffed card. Dojo Rivals: with Sawk
  // held (undebuffed) +X0.5 (`rival_x`, fixed): X2.5.
  throh: {
    name: 'throh', poke_sprite391: sprite('Natdex', 24, 35),
    config: { extra: { Xmult_multi: 2, rival_x: 0.5 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'rank', 'pair'], poke_after: 'seismitoad',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_multi), r3(ex.rival_x), dojo('j_poke_sawk') ? 'active' : 'needs Sawk', throh_x(card)] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card === toss_target(context.scoring_hand)) return { x_mult: throh_x(card), card };
      return undefined;
    },
  },
  // Sawk 539: Rare $7, Fighting. Karate Chop: the highest-ranked scored card (Aces high; a tie the leftmost; Inteleon's snipe_target: never
  // a Stone or debuffed card) gives +30 Mult (`mult` +40%: 42 / 54 / 66). Dojo Rivals: with Throh, +15 (`rival_mult`, fixed): +45.
  sawk: {
    name: 'sawk', poke_sprite391: sprite('Natdex', 26, 35),
    config: { extra: { mult: 30, rival_mult: 15 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'rank', 'pair'], poke_after: 'throh',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult), r3(ex.rival_mult), dojo('j_poke_throh') ? 'active' : 'needs Throh', sawk_mult(card)] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card === snipe_target(context.scoring_hand)) return { mult: sawk_mult(card), card };
      return undefined;
    },
  },
  // ---------------------------------------------------------------- Gen 5, batch 2 (2026-10-28, the owner's "Yes"): 26 jokers, #540-573
  // Prices on the guide's slots (3-stage line U $6 / S $8 / S $10; 2-stage line C $5 / S $8; single-stage R $7); evolution by rounds (an
  // early evolver 4, else 5), the fossils by the Ancient convention (trigger the 3+ tier 5 times). Energy raises each line's main number at
  // the standard rate; counts, conversions, money, odds and retriggers are fixed; banks are never retroactive. Types from their upstream
  // cards (Venipede and Sandile lines Dark, Dwebble Earth: pokermon_art_type). Art: upstream 3.9.1's own cells (Natdex {28,35}..{4,38};
  // Basculin Gen 5 {4,0} / {6,0}); nothing to deploy. Neither Nacho nor Pokermon+ has any of them.
  // Sewaddle 540 (Grass, Uncommon $6): the tailor, 1 unenhanced deck card a Blind becomes a Bonus card. 4 rounds. Its own effect has no
  // number: it carries Leavanny's `mult` 3 (Combee's "Energy for later"), so Energy used on it lands on Leavanny's +Mult.
  sewaddle: {
    name: 'sewaddle', poke_sprite391: sprite('Natdex', 28, 35),
    config: { extra: { mult: 3, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'sawk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_bonus); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { tailor(card, context, TAILOR_CLOTHS.sewaddle); return level_evo(self, card, context, 'j_poke_swadloon'); },
  },
  // Swadloon 541 (Safari $8): a Bonus or a Mult card (a seeded pick). 5 rounds.
  swadloon: {
    name: 'swadloon', poke_sprite391: sprite('Natdex', 0, 36),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['enhancements', 'modify_card', 'full_deck', 'round_evo'], poke_after: 'sewaddle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_bonus); info_queue.push(P_CENTERS.m_mult); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) { tailor(card, context, TAILOR_CLOTHS.swadloon); return level_evo(self, card, context, 'j_poke_leavanny'); },
  },
  // Leavanny 542 (Safari $10): a Bonus, Mult or Lucky card; each scored enhanced card +3 Mult (`mult`, Energy +40%: 4.2 / 5.4 / 6.6).
  leavanny: {
    name: 'leavanny', poke_sprite391: sprite('Natdex', 2, 36),
    config: { extra: { mult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'modify_card', 'full_deck'], poke_after: 'swadloon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: [r3(card.ability.extra.mult)] }; },
    calculate(self, card, context) { tailor(card, context, TAILOR_CLOTHS.leavanny); return leaf_blade(card, context); },
  },
  // Venipede 543 (Dark: its card; Uncommon $6): Poison Point, each card you discard permanently -2 Chips (floored at 0) and +3 Mult
  // (`mult_mod`, a per-card gain: Energy +20%, 3.6 / 4.2 / 4.8; the -2 `chip_loss` is fixed). 4 rounds.
  venipede: {
    name: 'venipede', poke_sprite391: sprite('Natdex', 4, 36),
    config: { extra: { chip_loss: 2, mult_mod: 3, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'modify_card', 'round_evo'], poke_after: 'leavanny',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chip_loss, r3(ex.mult_mod), ex.rounds] }; },
    calculate(self, card, context) { poison_point(card, context); return level_evo(self, card, context, 'j_poke_whirlipede'); },
  },
  // Whirlipede 544 (Safari $8): -3 Chips and +5 Mult (Energy: 6 / 7 / 8). 5 rounds.
  whirlipede: {
    name: 'whirlipede', poke_sprite391: sprite('Natdex', 6, 36),
    config: { extra: { chip_loss: 3, mult_mod: 5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'modify_card', 'round_evo'], poke_after: 'venipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chip_loss, r3(ex.mult_mod), ex.rounds] }; },
    calculate(self, card, context) { poison_point(card, context); return level_evo(self, card, context, 'j_poke_scolipede'); },
  },
  // Scolipede 545 (Safari $10): Whirlipede's poison, and each poisoned unenhanced card becomes a Mult card.
  scolipede: {
    name: 'scolipede', poke_sprite391: sprite('Natdex', 8, 36),
    config: { extra: { chip_loss: 3, mult_mod: 5, toxic: true } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'discard', 'modify_card', 'enhancements'], poke_after: 'whirlipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_mult); const ex = card.ability.extra; return { vars: [ex.chip_loss, r3(ex.mult_mod)] }; },
    calculate(self, card, context) { poison_point(card, context); return undefined; },
  },
  // Cottonee 546 (Grass, Common $5): +1 hand size; Prankster, the round's first hand drawn draws 1 extra card (a +1 hand size for that
  // deal only). 5 rounds. No number: Energy-inert by design (poke_no_energy_field), as Whimsicott.
  cottonee: {
    name: 'cottonee', poke_sprite391: sprite('Natdex', 10, 36),
    config: { extra: { h_size: 1, prank_draw: 0, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['hand_size', 'round_evo'], poke_after: 'scolipede',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.rounds] }; },
    calculate(self, card, context) { prank_draw(card, context); return level_evo(self, card, context, 'j_poke_whimsicott'); },
    ...prankster,
  },
  // Whimsicott 547 (Safari $8): +2 hand size, fixed (never energized: the guide's hand-size pitfall; a +2 that grew with Energy would
  // stack past every other Grass hand-size joker).
  whimsicott: {
    name: 'whimsicott', poke_sprite391: sprite('Natdex', 12, 36),
    config: { extra: { h_size: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['hand_size'], poke_after: 'cottonee',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.h_size] }; },
    ...hand_size,
  },
  // Petilil 548 (Grass, Common $5): each scored Flower card earns $1 (fixed: money takes no Energy, so the line is Energy-inert). 5 rounds.
  petilil: {
    // (+ regional batch C: a Fighting Energy used on it evolves it into Hisuian Lilligant — systems/energy.js energy_evo_target, from HISUI_REV)
    poke_energy_evo: { etype: 'Fighting', into: 'j_poke_hisuian_lilligant', rev: HISUI_REV },
    name: 'petilil', poke_sprite391: sprite('Natdex', 14, 36),
    config: { extra: { flower_money: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'round_evo'], poke_after: 'whimsicott',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_flower); const ex = card.ability.extra; return { vars: [ex.flower_money, ex.rounds] }; },
    calculate(self, card, context) { return flower_money(card, context) || level_evo(self, card, context, 'j_poke_lilligant'); },
  },
  // Lilligant 549 (Safari $8): Flower cards need only 3+ suits (Cherrim's / Roserade's rule: the fewest suits asked wins, never 2);
  // each scored Flower card earns $2.
  lilligant: {
    name: 'lilligant', poke_sprite391: sprite('Natdex', 16, 36),
    config: { extra: { flower_money: 2, suits: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'enhancements', 'suits'], poke_after: 'petilil',
    poke_flower_rule(self, card) { return { suits: card.ability.extra.suits }; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_flower); const ex = card.ability.extra; return { vars: [ex.suits, ex.flower_money] }; },
    calculate(self, card, context) { return flower_money(card, context); },
  },
  // Basculin 550 (Water, Rare $7, single-stage): a stripe rolled once when created (Red or Blue, Shellos's sea); Red: scored Hearts and
  // Diamonds +20 Chips each, Blue: Clubs and Spades (`chips`, Energy +30%: 26 / 32 / 38). Each stripe draws its own 3.9.1 cell.
  basculin: {
    name: 'basculin', poke_sprite391: sprite('Gen05', 4, 0),
    config: { extra: { chips: 20, form: 'red' } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'suit'], poke_after: 'lilligant',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const s = STRIPES[stripe_of(card)];
      return { vars: [r3(card.ability.extra.chips), s.name, localize(s.suits[0], 'suits_plural'), localize(s.suits[1], 'suits_plural'), card.ability.extra.stripe_scored || 0, BASCULEGION_CARDS], colours: s.suits.slice() };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom(pseudoseed('basculin_stripe')) < 0.5 ? 'red' : 'blue';
    },
    calculate(self, card, context) { stripe_count(card, context); return stripe_chips(card, context) || basculegion_evo(self, card, context); },
  },
  // Sandile 551 (Dark: its card; Uncommon $6): Moxie, +2 Mult banked each Blind beaten (`moxie_mult`; gain `mult_mod`, Energy +20%:
  // 2.4 / 2.8 / 3.2). 5 rounds.
  sandile: {
    name: 'sandile', poke_sprite391: sprite('Natdex', 20, 36),
    config: { extra: { moxie_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'basculin',
    poke_custom_values_to_keep: ['moxie_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.moxie_mult), ex.rounds] }; },
    calculate(self, card, context) { blind_moxie(card, context); return moxie_main(card, context) || level_evo(self, card, context, 'j_poke_krokorok'); },
  },
  // Krokorok 552 (Safari $8): +4 Mult a Blind (Energy: 4.8 / 5.6 / 6.4), on Sandile's bank. 5 rounds.
  krokorok: {
    name: 'krokorok', poke_sprite391: sprite('Natdex', 22, 36),
    config: { extra: { moxie_mult: 0, mult_mod: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'sandile',
    poke_custom_values_to_keep: ['moxie_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.moxie_mult), ex.rounds] }; },
    calculate(self, card, context) { blind_moxie(card, context); return moxie_main(card, context) || level_evo(self, card, context, 'j_poke_krookodile'); },
  },
  // Krookodile 553 (Safari $10): gives the banked Mult (it banks no more) and banks X0.15 a Blind instead (`Xmult_mod`, 0.18 / 0.21 / 0.24).
  krookodile: {
    name: 'krookodile', poke_sprite391: sprite('Natdex', 24, 36),
    config: { extra: { moxie_mult: 0, moxie_Xmult: 1, Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling'], poke_after: 'krokorok',
    poke_custom_values_to_keep: ['moxie_mult', 'moxie_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.moxie_mult), r3(ex.moxie_Xmult)] }; },
    calculate(self, card, context) { blind_moxie(card, context); return moxie_main(card, context); },
  },
  // Maractus 556 (Grass, Rare $7, single-stage): each Hazard card held in hand +8 Mult (`mult`, Energy +40%: 11.2 / 14.4 / 17.6).
  maractus: {
    name: 'maractus', poke_sprite391: sprite('Natdex', 0, 37),
    config: { extra: { mult: 8 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'hazards'], poke_after: 'darmanitan',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard); const ex = card.ability.extra, n = hazards_held(); return { vars: [r3(ex.mult), n, r3(ex.mult * n)] }; },
    calculate(self, card, context) { return hazard_held_mult(card, context); },
  },
  // Dwebble 557 (Earth: its card; Common $5): +5 Chips per Stone card in the full deck (`chips`, Energy +30%: 6.5 / 8 / 9.5). 5 rounds.
  dwebble: {
    name: 'dwebble', poke_sprite391: sprite('Natdex', 2, 37),
    config: { extra: { chips: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'maractus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * stones_in_deck()), ex.rounds] }; },
    calculate(self, card, context) { return stone_shell(card, context) || level_evo(self, card, context, 'j_poke_crustle'); },
  },
  // Crustle 558 (Safari $8): +10 Chips per Stone card (13 / 16 / 19).
  crustle: {
    name: 'crustle', poke_sprite391: sprite('Natdex', 4, 37),
    config: { extra: { chips: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck'], poke_after: 'dwebble',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * stones_in_deck())] }; },
    calculate(self, card, context) { return stone_shell(card, context); },
  },
  // Sigilyph 561 (Psychic, Rare $7, single-stage): +2 Foresight; a Planet used for Pair (Mercury) levels it 1 extra time. Foresight and the
  // level are fixed: Energy-inert by design (poke_no_energy_field).
  sigilyph: {
    name: 'sigilyph', poke_sprite391: sprite('Natdex', 10, 37),
    config: { extra: { scry: 2, levels: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['foresight', 'planet', 'hand_type'], poke_after: 'scrafty',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); info_queue.push(P_CENTERS.c_mercury); const ex = card.ability.extra; return { vars: [ex.scry, ex.levels] }; },
    calculate(self, card, context) { sigil_pair(card, context); return undefined; },
    ...scry,
  },
  // Yamask 562 (Psychic, Common $5): X0.1 banked per other Joker sold, the first 1 a round (`grudge_Xmult`; gain `Xmult_mod`, Energy
  // +20%: 0.12 / 0.14 / 0.16; the cap is fixed). 5 rounds.
  yamask: {
    name: 'yamask', poke_sprite391: sprite('Natdex', 12, 37),
    config: { extra: { grudge_Xmult: 1, Xmult_mod: 0.1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'on_sell', 'round_evo'], poke_after: 'sigilyph',
    poke_custom_values_to_keep: ['grudge_Xmult', 'grudge_round', 'grudge_count'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.grudge_Xmult), ex.rounds, grudge_cap(card), grudge_left(card), Math.min(ex.stones_scored || 0, RUNERIGUS_STONES), RUNERIGUS_STONES] };
    },
    calculate(self, card, context) {
      grudge_sell(card, context); wandering_count(card, context);
      return grudge_main(card, context) || level_evo(self, card, context, runerigus_ready(card) ? 'j_poke_runerigus' : 'j_poke_cofagrigus');
    },
  },
  // Cofagrigus 563 (Safari $8): X0.2 per Joker sold, the first 2 a round (0.24 / 0.28 / 0.32), and Mummy (mummy_sell: the Ante's first
  // Joker sold stays, Negative, no money; it still counts for the X, one of the round's 2).
  cofagrigus: {
    name: 'cofagrigus', poke_sprite391: sprite('Natdex', 14, 37),
    config: { extra: { grudge_Xmult: 1, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'on_sell', 'joker_slot'], poke_after: 'yamask',
    poke_custom_values_to_keep: ['grudge_Xmult', 'grudge_round', 'grudge_count'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ key: 'e_negative', set: 'Edition', config: { extra: 1 } });
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(ex.grudge_Xmult), mummy_state(), grudge_cap(card), grudge_left(card)] };
    },
    calculate(self, card, context) { grudge_sell(card, context); return grudge_main(card, context); },
  },
  // Tirtouga 564 (Water, Common $5), Ancient 9s: 1+ +30 Chips, 2+ scored 9s permanently +5 Chips, 3+ +50 Chips (`chips1` / `chips2` /
  // `chips3`, Energy +30% each: 39 / 48 / 57, 6.5 / 8 / 9.5, 65 / 80 / 95). Evolves after its 3+ tier fires 5 times.
  tirtouga: {
    name: 'tirtouga', poke_sprite391: sprite('Natdex', 16, 37),
    config: { evo_rqmt: 5, extra: { rank: '9', chips1: 30, chips2: 5, chips3: 50, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'ancient', 'rank', 'modify_card', 'trigger_evo'], poke_after: 'cofagrigus',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips1), r3(ex.chips2), r3(ex.chips3), Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_nines(card, context) || scaling_evo(self, card, context, 'j_poke_carracosta', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Carracosta 565 (Safari $8): Tirtouga's tiers, the same numbers, and 4+ retriggers every scored 9 (fixed).
  carracosta: {
    name: 'carracosta', poke_sprite391: sprite('Natdex', 18, 37),
    config: { extra: { rank: '9', chips1: 30, chips2: 5, chips3: 50, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'ancient', 'rank', 'modify_card', 'retrigger'], poke_after: 'tirtouga',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.chips1), r3(ex.chips2), r3(ex.chips3)] };
    },
    calculate(self, card, context) { return ancient_nines(card, context); },
  },
  // Archen 566 (Earth, Common $5), Ancient 10s: 1+ +4 Mult (`mult` +40%: 5.6 / 7.2 / 8.8), 2+ X1.25 (`Xmult` +20%: 1.5 / 1.75 / 2), 3+ earn
  // $3 (`ancient_money`, fixed). Evolves after its 3+ tier fires 5 times.
  archen: {
    name: 'archen', poke_sprite391: sprite('Natdex', 20, 37),
    config: { evo_rqmt: 5, extra: { rank: '10', mult: 4, Xmult: 1.25, ancient_money: 3, third_times: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'ancient', 'rank', 'trigger_evo'], poke_after: 'carracosta',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), ex.ancient_money, Math.max(0, self.config.evo_rqmt - (ex.third_times || 0))] };
    },
    calculate(self, card, context) {
      return ancient_tens(card, context) || scaling_evo(self, card, context, 'j_poke_archeops', card.ability.extra.third_times || 0, self.config.evo_rqmt);
    },
  },
  // Archeops 567 (Safari $8): Archen's tiers and 4+ X2 (`Xmult2` +20%: 2.4 / 2.8 / 3.2); Defeatist halves them all on the round's final hand.
  archeops: {
    name: 'archeops', poke_sprite391: sprite('Natdex', 22, 37),
    config: { extra: { rank: '10', mult: 4, Xmult: 1.25, ancient_money: 3, Xmult2: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'money', 'ancient', 'rank'], poke_after: 'archen',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); ancient_tip(info_queue, card.ability.extra.rank);
      const ex = card.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), r3(ex.mult), r3(ex.Xmult), ex.ancient_money, r3(ex.Xmult2), defeatist(card) ? 'halved' : 'full'] };
    },
    calculate(self, card, context) { return ancient_tens(card, context); },
  },
  // Minccino 572 (Colorless, Common $5): Tidy Up, each discard draws 1 extra card (+1 hand size until your next hand). 5 rounds. No number:
  // Energy-inert by design, as Cinccino (its retrigger count and cap are fixed).
  minccino: {
    name: 'minccino', poke_sprite391: sprite('Natdex', 2, 38),
    config: { extra: { tidy_draws: 0, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['discard', 'hand_size', 'round_evo'], poke_after: 'zoroark',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) { tidy_up(card, context); return level_evo(self, card, context, 'j_poke_cinccino'); },
    ...tidy,
  },
  // Cinccino 573 (Safari $8): Skill Link, the first scored card retriggers once per discard used this round, at most 5.
  cinccino: {
    name: 'cinccino', poke_sprite391: sprite('Natdex', 4, 38),
    config: { extra: { link_cap: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'discard', 'position'], poke_after: 'minccino',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.link_cap, skill_links(card)] }; },
    calculate(self, card, context) { return skill_link(card, context); },
  },
  // ---------------------------------------------------------------- Gen 5, batch 3 (2026-10-29, the owner's "Build batch 3"): 30 jokers, #580-637
  // The batch 1 / 2 rules: prices on the guide's slots (3-stage U $6 / S $8 / S $10; 2-stage C $5 / S $8; single-stage R $7), evolution by
  // rounds (5 each: none of these is an early evolver; Karrablast / Shelmet by 4 rounds held TOGETHER), types from their upstream cards
  // (Escavalier Grass, Durant Metal, Larvesta / Volcarona Fire, Joltik Lightning: pokermon_art_type). Energy raises each joker's main number
  // at the standard share; odds, counts, money, conversions and retriggers are fixed; banks are never retroactive. Art: upstream 3.9.1's own
  // cells (Natdex {18,38}..{12,42}; Deerling / Sawsbuck Gen 5, a cell per season); nothing to deploy. Neither Nacho nor Pokermon+ has any.
  // Ducklett 580 (Water, Common $5): +40 Chips if the hand contains a Flush (`chips` +30%: 52 / 64 / 76). 5 rounds.
  ducklett: {
    name: 'ducklett', poke_sprite391: sprite('Natdex', 18, 38),
    config: { extra: { chips: 40, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'hand_type', 'round_evo'], poke_after: 'gothitelle',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && has_flush(context)) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_poke_swanna');
    },
  },
  // Swanna 581 (Safari $8): X2 if the hand contains a Flush (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  swanna: {
    name: 'swanna', poke_sprite391: sprite('Natdex', 20, 38),
    config: { extra: { Xmult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'hand_type'], poke_after: 'ducklett',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && has_flush(context)) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Deerling 585 (Grass, Common $5), Seasons: the season follows the Ante (Spring Hearts, Summer Diamonds, Autumn Clubs, Winter Spades); each
  // scored card of its suit +3 Mult (`mult` +40%: 4.2 / 5.4 / 6.6). Each season shows its own 3.9.1 card (Gen 5 sheet). 5 rounds.
  deerling: {
    name: 'deerling', poke_sprite391: sprite('Gen05', 2, 1),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'suit', 'round_evo'], poke_after: 'vanilluxe',
    poke_view_form() { return season_now(); },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const s = season_vars(); return { vars: [r3(card.ability.extra.mult), s.name, s.suit, card.ability.extra.rounds], colours: [s.colour] }; },
    calculate(self, card, context) {
      if (season_card(context)) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_sawsbuck');
    },
  },
  // Sawsbuck 586 (Safari $8): each scored card of the season's suit X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38).
  sawsbuck: {
    name: 'sawsbuck', poke_sprite391: sprite('Gen05', 10, 1),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'suit'], poke_after: 'deerling',
    poke_view_form() { return season_now(); },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const s = season_vars(); return { vars: [r3(card.ability.extra.Xmult_multi), s.name, s.suit], colours: [s.colour] }; },
    calculate(self, card, context) {
      if (season_card(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Emolga 587 (Lightning, Rare $7, single-stage), Static: each scored face card earns $1 (fixed) and gives +2 Mult (`mult` +40%: 2.8 / 3.6 /
  // 4.4).
  emolga: {
    name: 'emolga', poke_sprite391: sprite('Natdex', 2, 39),
    config: { extra: { static_money: 1, mult: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['money', 'economy', 'mult', 'face'], poke_after: 'sawsbuck',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.static_money, r3(ex.mult)] }; },
    calculate(self, card, context) { return static_face(card, context); },
  },
  // Karrablast 588 (Grass, Common $5): +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). The trade pair: evolves only TOGETHER with a Shelmet, after
  // both have been held together 4 rounds (trade_round).
  karrablast: {
    name: 'karrablast', poke_sprite391: sprite('Natdex', 4, 39),
    config: { extra: { mult: 6, together: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'joker', 'trigger_evo'], poke_after: 'emolga',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.together || 0, TRADE_NEED, trade_state(card, 'Shelmet')] }; },
    calculate(self, card, context) {
      trade_round(self, card, context);
      if (context.joker_main) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return undefined;
    },
  },
  // Escavalier 589 (Safari $8): X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); Steel cards held in hand give X1.75 instead of X1.5 (`steel_x`, fixed;
  // the card-level rule: with Registeel / Durant the best one wins).
  escavalier: {
    name: 'escavalier', poke_sprite391: sprite('Natdex', 6, 39),
    config: { extra: { Xmult: 1.5, steel_x: 1.75 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'karrablast',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.steel_x)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Foongus 590 (Grass, Common $5): at the end of each shop, 1 in 4 to create a Poke Ball (with room). Odds fixed; Energy-inert, as Amoonguss
  // (neither has a number). 5 rounds.
  foongus: {
    name: 'foongus', poke_sprite391: sprite('Natdex', 8, 39),
    config: { extra: { num: 1, dem: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['item', 'chance', 'round_evo'], poke_after: 'escavalier',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push({ set: 'Item', key: 'c_poke_pokeball', poke_add_desc: true });
      const ex = card.ability.extra; return { vars: [...get_probability_vars(card, ex.num, ex.dem, 'foongus'), ex.rounds] };
    },
    calculate(self, card, context) { foongus_ball(card, context); return level_evo(self, card, context, 'j_poke_amoonguss'); },
  },
  // Amoonguss 591 (Safari $8): Spore, the Boss Blind's ability is off during the round's first hand (Blind.suspend), back after it.
  amoonguss: {
    name: 'amoonguss', poke_sprite391: sprite('Natdex', 10, 39),
    config: { extra: {} },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['boss_blind', 'debuff'], poke_after: 'foongus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [spore_state()] }; },
    remove_from_deck(self, card) {
      // sold, destroyed or debuffed during the suspended first hand, with no other Amoonguss: the Blind comes back at once
      const b = G.GAME && G.GAME.blind;
      // (Gen 8 batch 3: not while a Mr. Rime holds it off for the round's final hand — rime_final_deal)
      const rime = () => G.GAME.current_round.hands_left <= 1 && find_card('j_poke_mrrime').length > 0;
      if (b && b.suspended && !find_card('j_poke_amoonguss').some((j) => j !== card)) G.E_MANAGER.add_event(() => { if (b.suspended && !find_card('j_poke_amoonguss').length && !rime()) b.suspend(false); });
    },
  },
  // Alomomola 594 (Water, Rare $7, single-stage), Healing Heart: the first playing card destroyed each round is copied back into your deck.
  // No number: Energy-inert.
  alomomola: {
    name: 'alomomola', poke_sprite391: sprite('Natdex', 16, 39),
    config: { extra: {} },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['full_deck', 'destroy_card', 'playing_card', 'generation'], poke_after: 'jellicent',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [heal_state(card)] }; },
    calculate(self, card, context) { healing_heart(card, context); return undefined; },
  },
  // Joltik 595 (Lightning, Common $5): +3 Mult per OTHER Lightning Joker (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  joltik: {
    name: 'joltik', poke_sprite391: sprite('Natdex', 18, 39),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'alomomola',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = other_lightning(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * other_lightning(card)); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_galvantula');
    },
  },
  // Galvantula 596 (Safari $8), Electroweb: each Gold card held in hand X1.2 when a hand scores (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38).
  galvantula: {
    name: 'galvantula', poke_sprite391: sprite('Natdex', 20, 39),
    config: { extra: { Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'enhancements'], poke_after: 'joltik',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_gold); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { return electroweb(card, context); },
  },
  // Tynamo 602 (Lightning, Uncommon $6): +1 Mult per Steel card in your full deck (`mult` +40%: 1.4 / 1.8 / 2.2). 5 rounds.
  tynamo: {
    name: 'tynamo', poke_sprite391: sprite('Natdex', 2, 40),
    config: { extra: { mult: 1, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'full_deck', 'round_evo'], poke_after: 'klinklang',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult * steel_in_deck()), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * steel_in_deck()); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_eelektrik');
    },
  },
  // Eelektrik 603 (Safari $8): each Steel card held in hand +3 Mult (h_mult; `mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  eelektrik: {
    name: 'eelektrik', poke_sprite391: sprite('Natdex', 4, 40),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'tynamo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult * steel_held_count()), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff && has_enhancement(context.other_card, 'm_steel')) return { h_mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_eelektross');
    },
  },
  // Eelektross 604 (Safari $10): X1.5, plus X0.1 per Steel card in your full deck (`Xmult` / `Xmult_mod` +20%: 1.8 / 2.1 / 2.4, 0.12 / 0.14 /
  // 0.16).
  eelektross: {
    name: 'eelektross', poke_sprite391: sprite('Natdex', 6, 40),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Lightning', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'full_deck'], poke_after: 'eelektrik',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), eelektross_x(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = eelektross_x(card); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Cubchoo 613 (Water, Common $5): each scored Glass card +20 Chips (`chips` +30%: 26 / 32 / 38). 5 rounds.
  cubchoo: {
    name: 'cubchoo', poke_sprite391: sprite('Natdex', 24, 40),
    config: { extra: { chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'round_evo'], poke_after: 'haxorus',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return glass_chips(card, context) || level_evo(self, card, context, 'j_poke_beartic'); },
  },
  // Beartic 614 (Safari $8), Freeze: at the end of each round the leftmost card held in hand is frozen and stays in your hand into the next
  // round; while frozen it gives X1.5 held (`Xmult_multi` +5%: 1.575 / 1.65 / 1.725); played or discarded, it thaws.
  beartic: {
    name: 'beartic', poke_sprite391: sprite('Natdex', 26, 40),
    config: { extra: { Xmult_multi: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'position', 'playing_card'], poke_after: 'cubchoo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push({ set: 'Other', key: 'poke_design_frozen' }); return { vars: [r3(card.ability.extra.Xmult_multi), card_name(frozen_card(card))] }; },
    calculate(self, card, context) { return freeze(card, context); },
  },
  // Shelmet 616 (Grass, Common $5): +40 Chips (`chips` +30%: 52 / 64 / 76). Evolves only together with a Karrablast (trade_round).
  shelmet: {
    name: 'shelmet', poke_sprite391: sprite('Natdex', 0, 41),
    config: { extra: { chips: 40, together: 0 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['chips', 'joker', 'trigger_evo'], poke_after: 'cryogonal',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.together || 0, TRADE_NEED, trade_state(card, 'Karrablast')] }; },
    calculate(self, card, context) {
      trade_round(self, card, context);
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return undefined;
    },
  },
  // Accelgor 617 (Safari $8): +1 hand and +1 discard each round (fixed), +4 Mult for each hand left (`mult` +40%: 5.6 / 7.2 / 8.8).
  accelgor: {
    name: 'accelgor', poke_sprite391: sprite('Natdex', 2, 41),
    config: { extra: { hands: 1, d_size: 1, mult: 4 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 5, blueprint_compat: true,
    attributes: ['hands', 'discard', 'mult'], poke_after: 'shelmet',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.d_size, r3(ex.mult), r3(ex.mult * hands_left_now())] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * hands_left_now()); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
    ...hands_discards,
  },
  // Stunfisk 618 (Lightning: its card; Rare $7, single-stage): each discard earns $1, at most $4 a round. Money: Energy-inert.
  stunfisk: {
    name: 'stunfisk', poke_sprite391: sprite('Natdex', 4, 41),
    config: { extra: { static_money: 1, money_cap: 4, static_paid: 0 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Lightning', gen: 5, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['money', 'economy', 'discard'], poke_after: 'accelgor',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.static_money, ex.money_cap, static_paid(card)] }; },
    calculate(self, card, context) { return static_discard(card, context); },
  },
  // Mienfoo 619 (Fighting, Common $5): the highest-ranked scored card retriggers once. Mienshao 620 (Safari $8): the top 2. Retriggers are
  // fixed: Energy-inert. 5 rounds.
  mienfoo: {
    name: 'mienfoo', poke_sprite391: sprite('Natdex', 6, 41),
    config: { extra: { targets: 1, retriggers: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fighting', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'rank', 'round_evo'], poke_after: 'stunfisk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) { return top_retrigger(card, context) || level_evo(self, card, context, 'j_poke_mienshao'); },
  },
  mienshao: {
    name: 'mienshao', poke_sprite391: sprite('Natdex', 8, 41),
    config: { extra: { targets: 2, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 5, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['retrigger', 'rank'], poke_after: 'mienfoo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.targets] }; },
    calculate(self, card, context) { return top_retrigger(card, context); },
  },
  // Druddigon 621 (Dragon, Rare $7, single-stage): each scored King X1.4 (`Xmult_multi` +5%: 1.47 / 1.54 / 1.61).
  druddigon: {
    name: 'druddigon', poke_sprite391: sprite('Natdex', 10, 41),
    config: { extra: { Xmult_multi: 1.4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'rank', 'face'], poke_after: 'mienshao',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card) && context.other_card.get_id() === 13) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Bouffalant 626 (Colorless, Rare $7, single-stage), Head Charge: banks X0.5 each time a Blind falls to the round's first hand, up to X4
  // (`charge_Xmult`; gain `Xmult_mod` +20%: 0.6 / 0.7 / 0.8; the X4 cap fixed).
  bouffalant: {
    name: 'bouffalant', poke_sprite391: sprite('Natdex', 20, 41),
    config: { extra: { charge_Xmult: 1, Xmult_mod: 0.5, Xmult_cap: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'scaling'], poke_after: 'bisharp',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), ex.Xmult_cap, r3(ex.charge_Xmult)] }; },
    calculate(self, card, context) {
      head_charge(card, context);
      const x = card.ability.extra.charge_Xmult;
      if (context.joker_main && x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      return undefined;
    },
  },
  // Rufflet 627 (Colorless, Common $5): +10 Mult during Boss Blinds (`mult` +40%: 14 / 18 / 22). 5 rounds.
  rufflet: {
    // (+ regional batch C: a Psychic Energy used on it evolves it into Hisuian Braviary — systems/energy.js energy_evo_target, from HISUI_REV)
    poke_energy_evo: { etype: 'Psychic', into: 'j_poke_hisuian_braviary', rev: HISUI_REV },
    name: 'rufflet', poke_sprite391: sprite('Natdex', 22, 41),
    config: { extra: { mult: 10, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'boss_blind', 'round_evo'], poke_after: 'bouffalant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && boss_now()) return { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_braviary');
    },
  },
  // Braviary 628 (Safari $8): X2 during Boss Blinds (`Xmult` +20%: 2.4 / 2.8 / 3.2).
  braviary: {
    name: 'braviary', poke_sprite391: sprite('Natdex', 24, 41),
    config: { extra: { Xmult: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind'], poke_after: 'rufflet',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && boss_now()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Heatmor 631 (Fire, Rare $7, single-stage): +4 Mult per discard used this round (`mult` +40%: 5.6 / 7.2 / 8.8); with Durant, banks X0.1
  // each end of round (`ant_Xmult`; gain `Xmult_mod` +20%: 0.12 / 0.14 / 0.16), which it gives from then on.
  heatmor: {
    name: 'heatmor', poke_sprite391: sprite('Natdex', 0, 42),
    config: { extra: { mult: 4, ant_Xmult: 1, Xmult_mod: 0.1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'discard', 'scaling'], poke_after: 'braviary',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.mult), r3(ex.mult * discards_used()), r3(ex.Xmult_mod), r3(ex.ant_Xmult), rivals() ? 'active' : 'needs Durant'] };
    },
    calculate(self, card, context) { return heatmor_calc(card, context); },
  },
  // Durant 632 (Metal, Rare $7, single-stage): Steel cards held in hand give X1.75 instead of X1.5 (`Xmult_multi` +5%: 1.8375 / 1.925 /
  // 2.0125; the card-level rule, steel_rule_x: never stacking with Escavalier / Registeel, the best wins). With Heatmor, Heatmor grows.
  durant: {
    name: 'durant', poke_sprite391: sprite('Natdex', 2, 42),
    config: { extra: { Xmult_multi: 1.75 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 5, blueprint_compat: false,
    attributes: ['xmult', 'enhancements'], poke_after: 'heatmor',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); return { vars: [r3(card.ability.extra.Xmult_multi), find_card('j_poke_heatmor').length ? 'active' : 'needs Heatmor'] }; },
  },
  // Larvesta 636 (Fire, Common $5): +5 Mult, doubled while it's sunny (`mult` +40%: 7 / 9 / 11, sunny 14 / 18 / 22). 5 rounds.
  larvesta: {
    name: 'larvesta', poke_sprite391: sprite('Natdex', 10, 42),
    config: { extra: { mult: 5, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'hand_drawn', 'round_evo'], poke_after: 'hydreigon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), sun_state(card), ex.rounds] }; },
    calculate(self, card, context) {
      if (sun_read(card, context)) return undefined;
      if (context.joker_main) { const m = r3(card.ability.extra.mult * (cherrim_sunny(card) ? 2 : 1)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_volcarona');
    },
  },
  // Volcarona 637 (Safari $8): while held it's always sunny (cherrim_sunny, Castform's first deal); each Fire Joker, itself included, X1.25
  // (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375).
  volcarona: {
    name: 'volcarona', poke_sprite391: sprite('Natdex', 12, 42),
    config: { extra: { Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['xmult', 'types', 'joker', 'hand_drawn'], poke_after: 'larvesta',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = fire_count(card); return { vars: [r3(ex.Xmult_multi), n, r3(Math.pow(ex.Xmult_multi, n))] }; },
    calculate(self, card, context) {
      if (context.other_joker && fire_joker(context.other_joker)) {
        const x = r3(card.ability.extra.Xmult_multi);
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
      }
      return undefined;
    },
  },
};
