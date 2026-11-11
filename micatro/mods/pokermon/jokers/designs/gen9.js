// designs/gen9.js — the owner's Generation 9 Pokermon jokers and the helpers only they use, cut out of
// pokejokers_designs.js by tools/micatro/split_designs.mjs (2026-11); every definition is unchanged. Helpers shared with another
// generation are in common.js. The jokers are REGISTERED by ../pokejokers_designs.js (in the old file's order: BATCHES there);
// a NEW joker is just added to JOKERS below and registers after them.
import {
  localize, energy_values, P_CENTERS, detailed, G, has_no_rank, is_type, type_tooltip, level_evo, card_eval_status_text, pseudorandom,
  ease_poke_dollars, get_probability_vars, pseudorandom_probability, pseudoseed, pseudorandom_element, scaling_evo, level_up_hand, play_sound,
  has_enhancement, create_card, emit, ease_hands_played,
} from '../../api.js';
import { Tag, add_tag } from '../../../../js/engine/tag.js';
import { poke_set_type_badge } from '../../systems/types.js';
import * as BN from '../../../../js/engine/bignum.js';
import { get_next_tag_key, number_format } from '../../../../js/engine/core.js';
import {
  CASTFORM_FORMS, a_chips, a_mult, a_xmult, bank, boss_now, cherrim_sunny, clodsire_poison, cotton_guard, deck_convert, discards, discards_used,
  evolved_tarot, face_scored, first_deal, forecast, guard_on, hand_size, hands, hazard_held_x, hazards_in_deck, honey_gather, legends, lucky_procs,
  lucky_scored, protean_set, r3, r9, round_end, sprite, steel_in_deck, stone_scored, unbroken, unused_hands, x_main,
} from './common.js';

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
const lucky_tips = (info_queue, evolves) => {
  info_queue.push(P_CENTERS.m_lucky);
  if (evolves && detailed()) { info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); info_queue.push(P_CENTERS.c_magician); }
};
/** Fuecoco / Crocalor / Skeledirge, Torch Song: every hand you play (its `before`: the hand being played counts itself) banks
 *  +mult_mod Mult (`torch_mult`; Skeledirge banks X Mult instead, +Xmult_mod on `torch_Xmult`). Not Blueprint, not a joker
 *  retrigger (it scales). */
function torch_song(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
    const ex = card.ability.extra;
    if (ex.Xmult_mod !== undefined) bank(card, 'torch_Xmult', 'Xmult_mod', 1, 'XMULT');
    else bank(card, 'torch_mult', 'mult_mod', 1, 'MULT');
  }
  return undefined;
}
function moxie_bank(card, context) {
  if (round_end(context) && !context.blueprint && !context.retrigger_joker && !context.game_over) {
    const n = unused_hands(), ex = card.ability.extra;
    if (n > 0) {
      if (ex.Xmult_mod !== undefined) bank(card, 'moxie_Xmult', 'Xmult_mod', n, 'XMULT');
      else bank(card, 'moxie_chips', 'chip_mod', n, 'CHIPS');
    }
  }
  return undefined;
}
/** The Gen 9 starters: their banked Chips / Mult and X Mult, every hand (Blueprint copies them). */
function starter9_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.moxie_chips > 0) r.chip_mod = ex.moxie_chips;
  if (ex.torch_mult > 0) r.mult_mod = ex.torch_mult;
  const x = ex.torch_Xmult !== undefined ? ex.torch_Xmult : ex.moxie_Xmult;
  if (x !== undefined && x > 1) r.Xmult_mod = x;
  if (!Object.keys(r).length) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r.Xmult_mod) : r.mult_mod ? a_mult(r.mult_mod) : a_chips(r.chip_mod);
  r.colour = r.Xmult_mod ? 'XMULT' : r.mult_mod ? 'MULT' : 'CHIPS';
  return r;
}

/** Tandemaus / Maushold: a scored card sharing its rank with another scored card gives +mult. */
function pair_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card)) {
    const id = context.other_card.get_id();
    if (context.scoring_hand.some((c) => c !== context.other_card && !has_no_rank(c) && c.get_id() === id)) return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}
const commanded = (card) => G.jokers.cards.find((c) => c !== card && is_type(c, 'Water'));
const TATSU_FORMS = ['curly', 'droopy', 'stretchy'];

// ---------------------------------------------------------------- Gen 9, batch 1 (contentRev 76; the owner's "Yes", 2026-11-03), #919-950
/** Nymble / Lokix, Lunge: the PLAYED hand (full_hand: kickers count, scoring doesn't matter) has 3 or fewer cards. */
const lunge = (context) => (context.full_hand || G.play.cards).length <= 3;
/** Pawmi: a Lightning Joker for "each Lightning Joker" (Barboach / Starly's team count: is_type, so a Tera sticker counts and replaces the type;
 *  undebuffed), itself included (+1 while it is Lightning: a Tera of another type takes it out), so a shop card shows what it gives once bought. */
const volt_count = (card) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && is_type(j, 'Lightning')).length + (is_type(card, 'Lightning') ? 1 : 0);
const blessing_state = (card) => (G.GAME && card.ability.extra.blessing_ante === G.GAME.round_resets.ante ? 'used this Ante' : 'ready');
/** Squawkabilly's plumage, rolled when it is OBTAINED (add_to_deck, if none yet: Toxtricity's moment; the run's seeded 'squawkabilly_plumage',
 *  1 in 4 each), kept on card.ability (poke_plumage): art only (systems/anim.js GEN9_FORM_SPRITES; Green is its own card). */
export const PLUMAGES = ['green', 'blue', 'yellow', 'white'];
const PLUMAGE_NAMES = { green: 'Green Plumage', blue: 'Blue Plumage', yellow: 'Yellow Plumage', white: 'White Plumage' };
const plumage = (card) => (PLUMAGES.includes(card.ability.poke_plumage) ? card.ability.poke_plumage : null);
function plumage_roll(card) {
  if (!plumage(card)) card.ability.poke_plumage = PLUMAGES[Math.min(3, Math.floor(pseudorandom(pseudoseed('squawkabilly_plumage')) * 4))];
}
/** Squawkabilly, Parrot: each Planet card used (context.using_consumeable, set Planet with a hand_type: Planet X / Ceres / Eris too; Black
 *  Hole is a Spectral) rolls 1 in 2 (Pokermon's pseudorandom_probability 'squawkabilly': Oops! All 6s raises it) to level that hand up ONCE
 *  MORE (level_up_hand, Sigilyph's). Each Squawkabilly rolls on its own. Not Blueprint (as Sigilyph). */
function parrot(card, context) {
  const c = context.consumeable;
  if (!context.using_consumeable || context.blueprint || !c || c.ability.set !== 'Planet') return;
  const hand = c.ability.consumeable && c.ability.consumeable.hand_type;
  if (!hand || !G.GAME.hands[hand]) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'squawkabilly', ex.num, ex.dem, 'squawkabilly')) return;
  level_up_hand(card, hand, null, ex.levels);
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_level_up_ex'), colour: 'Planet' });
}
/** Bellibolt, Electromorphosis: each discard you use (a player's: pre_discard without `hook`; once per discard, not per card) adds
 *  +Xmult_mod to a CHARGE (`charge_Xmult` from X1; banked: Energy raises only later gains). The next hand that SCORES fires it: joker_main
 *  gives the X (a Blueprint / Brainstorm copy too) and marks it; `after` resets it to X1 (Drifblim's Blueprint-safe release). A debuffed hand
 *  (no joker_main) doesn't fire it. The charge is lost at the end of the round (the main end_of_round pass). Not Blueprint for the charge. */
function electromorphosis(card, context) {
  const ex = card.ability.extra;
  if (context.pre_discard && !context.hook && !context.blueprint && !context.retrigger_joker) {
    ex.charge_Xmult = r3(ex.charge_Xmult + ex.Xmult_mod);
    card_eval_status_text(card, 'extra', null, null, null, { message: 'Charge X' + ex.charge_Xmult, colour: 'XMULT' });
    return undefined;
  }
  if (context.joker_main && ex.charge_Xmult > 1) {
    if (!context.blueprint) ex.charge_fired = true;
    return { message: a_xmult(r3(ex.charge_Xmult)), colour: 'XMULT', Xmult_mod: ex.charge_Xmult };
  }
  if (context.after && !context.blueprint && !context.retrigger_joker && ex.charge_fired) { ex.charge_fired = false; ex.charge_Xmult = 1; return undefined; }
  if (round_end(context) && !context.blueprint && !context.retrigger_joker) { ex.charge_fired = false; ex.charge_Xmult = 1; }
  return undefined;
}
/** Wattrel / Kilowattrel, Wind Power: $wind_money (fixed) per discard LEFT when the round is cashed out (calc_dollar_bonus: a row of the
 *  cash-out list, Delayed Gratification's read; a debuffed joker pays nothing, Blueprint never copies it). */
const wind_money = (card) => Math.max(0, (G.GAME && G.GAME.current_round && G.GAME.current_round.discards_left) || 0) * card.ability.extra.wind_money;
/** Mabosstiff, Guard Dog: while it is held (undebuffed — and it can't be), your Jokers can't be debuffed (systems/rules.js set_debuff answers
 *  'prevent_debuff'). Gaining it lifts the row's current debuffs at once (Crimson Heart's pick, an SMODS debuff source); losing it re-reads
 *  the lasting sources (debuff_sources); Crimson Heart picks again on the next hand. */
function guard_dog_refresh(gained) {
  G.E_MANAGER.add_event(() => {
    for (const j of ((G.jokers && G.jokers.cards) || []).slice()) {
      if (gained ? j.debuff : Object.values(j.ability.debuff_sources || {}).some(Boolean)) j.set_debuff();
    }
  });
}
/** Toedscool / Toedscruel, Mycelium: the cards of your FULL deck (G.playing_cards, broken / destroyed ones not) above a threshold (never
 *  below 0). */
const deck_size = () => (G.playing_cards || []).filter(unbroken).length;
const mycelium = (over) => Math.max(0, deck_size() - over);
/** Klawf, Anger Shell: X1 + Xmult_mod for each hand already played this round (current_round.hands_played: still the pre-hand count while a
 *  hand scores, so the round's first hand is X1). A round only goes on while the Blind is unbeaten, so every earlier hand of the round is
 *  one that didn't beat it. */
const anger_x = (card) => r9(1 + card.ability.extra.Xmult_mod * ((G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0));
/** Flittle / Espathra: the banked Mult (and Espathra's banked X), every hand (Blueprint copies them). */
function opportunist_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, r = {};
  if (ex.opp_mult > 0) r.mult_mod = ex.opp_mult;
  if (ex.opp_Xmult > 1) r.Xmult_mod = ex.opp_Xmult;
  if (!r.mult_mod && !r.Xmult_mod) return undefined;
  r.message = r.Xmult_mod ? a_xmult(r3(r.Xmult_mod)) : a_mult(r3(r.mult_mod));
  r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
  return r;
}
/** Capsakid / Scovillain, Spicy: scored Clubs +chips; Scovillain's scored Hearts X(Xmult_multi) too (is_suit: a Wild card is both). */
function spicy(card, context, hearts) {
  if (!(context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff)) return undefined;
  const ex = card.ability.extra, c = context.other_card, r = {};
  if (c.is_suit('Clubs')) r.chips = ex.chips;
  if (hearts && c.is_suit('Hearts')) r.x_mult = ex.Xmult_multi;
  if (r.chips === undefined && r.x_mult === undefined) return undefined;
  r.card = card;
  return r;
}
/** Bombirdier, Stork Delivery: at the end of each shop (ending_shop), num in dem (pseudorandom_probability on 'bombirdier': Oops! / Venonat
 *  raise it) to create a random Tag from the engine's tag pool (get_next_tag_key: the run's seeded Tag pool, as a Blind's skip Tag; an
 *  Orbital Tag names a random visible poker hand, seeded). Blueprint copies it (its own roll). */
function stork_delivery(card, context) {
  if (!context.ending_shop) return;
  const ex = card.ability.extra;
  if (!pseudorandom_probability(card, 'bombirdier', ex.num, ex.dem, 'bombirdier')) return;
  const tag = new Tag(get_next_tag_key('bombirdier'));
  if (tag.name === 'Orbital Tag') {
    const hs = Object.keys(G.GAME.hands).filter((k) => G.GAME.hands[k].visible);
    tag.ability.orbital_hand = pseudorandom_element(hs, pseudoseed('bombirdier_orbital'))[0];
  }
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'Delivery!', colour: 'FILTER' });
  G.E_MANAGER.add_event(() => { add_tag(tag); play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4); });
}
/** Varoom / Revavroom, Rev the Engine: hands played in a row without a discard (G.GAME.poke_rev_streak, run-wide: systems/rules.js
 *  calculate, +1 after every hand played, 0 on any discard you make, kept across rounds). While a hand scores it counts itself. */
const rev_streak = () => (G.GAME && G.GAME.poke_rev_streak) || 0;
/** Cyclizar, Ride: +hands each round and +h_size hand size, one add/remove pair (two spreads would overwrite each other's add_to_deck). */
const hands_hand_size = {
  add_to_deck(self, card, from_debuff) { hands.add_to_deck(self, card, from_debuff); hand_size.add_to_deck(self, card, from_debuff); },
  remove_from_deck(self, card, from_debuff) { hands.remove_from_deck(self, card, from_debuff); hand_size.remove_from_deck(self, card, from_debuff); },
};
/** Glimmora, Toxic Debris: each scored Stone card (undebuffed; a retrigger again) turns one random card of the full deck into a Hazard card
 *  (deck_convert: unenhanced first, then any card that isn't one; NEVER a Stone card — its own fuel — nor a card of the played hand, which is
 *  still scoring), at most `debris_cap` (3, fixed) a hand (G.GAME.hands_played names the hand). Not a Blueprint's (it modifies the deck). */
export function toxic_debris(card, context) {
  if (!stone_scored(context) || context.other_card.debuff || context.blueprint || context.retrigger_joker) return;
  const ex = card.ability.extra, hand_id = G.GAME.hands_played;
  const n = ex.debris_hand === hand_id ? (ex.debris_count || 0) : 0;
  if (n >= ex.debris_cap) return;
  const skip = (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_stone') || c.area === G.play);
  if (!deck_convert('m_poke_hazard', 'poke_glimmora_debris', skip)) return;
  ex.debris_hand = hand_id; ex.debris_count = n + 1;
  card_eval_status_text(card, 'extra', null, null, null, { message: '+1 Hazard', colour: 'PURPLE' });
}
/** Veluza, Fillet Away: at the end of each round (the main pass, not a Blueprint's) it loses $val_loss of its own sell value (extra_value,
 *  then set_cost: Celesteela's field, the other way) and banks +X(Xmult_mod) (`fillet_Xmult`). Pokermon's sell value never goes below $1
 *  (systems/rules.js set_cost, the drain floor), so at $1 it can lose no more and STOPS gaining (refill it — Poltchageist / Sinistcha,
 *  Combee, a Gift Card... — and it fillets again). */
function fillet_away(card, context) {
  if (!round_end(context) || context.blueprint || context.retrigger_joker || context.game_over) return;
  const ex = card.ability.extra;
  if ((card.sell_cost || 0) - ex.val_loss < 1) return;
  card.ability.extra_value = (card.ability.extra_value || 0) - ex.val_loss;
  card.set_cost();
  bank(card, 'fillet_Xmult', 'Xmult_mod', 1, 'XMULT');
}
/** Dondozo, Commander: an undebuffed Tatsugiri directly to its LEFT. */
const dondozo_commanded = (card) => {
  const row = (G.jokers && G.jokers.cards) || [], i = row.indexOf(card), left = i > 0 ? row[i - 1] : null;
  return !!left && !left.debuff && ['j_poke_tatsugiri', 'j_poke_mega_tatsugiri'].includes(left.config.center.key);
};
const clodsire_x = (card) => r9(1 + card.ability.extra.Xmult_mod * hazards_in_deck());
/** Sinistcha: the sell value of ALL your Jokers (itself included; a debuffed one too: sell value isn't an ability). */
const row_value = () => ((G.jokers && G.jokers.cards) || []).reduce((s, j) => s + Math.max(0, j.sell_cost || 0), 0);
const sinistcha_x = (card) => r9(1 + card.ability.extra.Xmult_mod * row_value());

// ---------------------------------------------------------------- Gen 9, batch 3: the Paradox Pokémon (contentRev 78)
/** The owner's Paradox rarity (index.js rarities: 'poke_paradox', weight 0, so never a shop roll, never a Poké Ball's (get_random_poke_key
 *  skips it unless asked for it): only the Paradox Ball and the Ancient / Future Packs (paradox.js) make one). Each Paradox joker's center
 *  names its era: `poke_paradox` 'ancient' | 'future' (its second pill, set_badges: "Ancient" / "Future"). */
export const PARADOX_ERAS = {
  ancient: { name: 'Ancient', colour: '#9A5B1E', ability: 'Protosynthesis' },
  future: { name: 'Future', colour: '#1F7A99', ability: 'Quark Drive' },
};
/** "Boosted" (Protosynthesis / Quark Drive): 50% stronger. A +Mult / +Chips number x1.5; an X number's bonus part x1.5 (X2 -> X2.5,
 *  X1.2 -> X1.3). Energy raises the base number first; the boost applies on top of the energized value. */
export const PARADOX_BOOST = 1.5;
const boost_add = (v, on) => r9(on ? v * PARADOX_BOOST : v);
const boost_x = (x, on) => r9(on ? 1 + (x - 1) * PARADOX_BOOST : x);
/** THE HOUSE ELECTRIC TERRAIN (Gen 9 batch 3): the round's FIRST deal holds MORE Diamonds than any other suit (strictly: a tie for the top is
 *  not; a Wild card counts for every suit, so it never breaks a tie; a debuffed / Stone / suitless card counts for none: the engine's is_suit).
 *  Read on the first deal like Castform's forecast (the sun and the rain read the same deal), remembered on the card for the round
 *  (`terrain_round`), so a Future Paradox gained mid-round waits for the next round's deal. The weather check future Electric jokers read,
 *  beside the sun (cherrim_sunny), the rain (swift_swim_raining) and the sandstorm (is_sandstorm). Castform has no terrain form. */
export function electric_terrain(cards) {
  const n = { Spades: 0, Hearts: 0, Clubs: 0, Diamonds: 0 };
  for (const c of cards || []) for (const s of Object.keys(n)) if (c.is_suit(s)) n[s] += 1;
  return n.Diamonds > n.Spades && n.Diamonds > n.Hearts && n.Diamonds > n.Clubs;
}
export function is_electric_terrain(card) {
  const ex = card && card.ability && card.ability.extra, GM = G.GAME;
  return !!((ex && GM && GM.facing_blind && ex.terrain_round === GM.round) || hadron_terrain());
}
/** Miraidon, Hadron Engine (Gen 9 batch 4): while an undebuffed one is held every round is Electric Terrain — live (bought / sold / debuffed,
 *  it changes at once; in the shop too), as Volcarona's sun. It adds terrain; the deal's own read stays. */
const hadron_terrain = () => legends('miraidon').length > 0;
export const paradox_era = (card) => (card && card.config && card.config.center && card.config.center.poke_paradox) || null;
/** Is this Paradox boosted now? Ancient: Protosynthesis while it's sunny (cherrim_sunny: the red first deal, a working Groudon, a Volcarona, a Koraidon);
 *  Future: Quark Drive on Electric Terrain. */
export const paradox_boosted = (card) => (paradox_era(card) === 'ancient' ? cherrim_sunny(card) : paradox_era(card) === 'future' ? is_electric_terrain(card) : false);
/** The round's first deal: an Ancient reads the sun (Larvesta's sun_read fields), a Future reads the terrain. Not Blueprint (first_deal). */
function paradox_read(card, context) {
  const era = paradox_era(card);
  if (era === 'ancient') {
    if (!first_deal(card, context, 'sunread_round')) return false;
    const ex = card.ability.extra;
    ex.sunread_round = G.GAME.round;
    if (forecast(G.hand.cards) === 'sunny') ex.sun_round = G.GAME.round;
    if (cherrim_sunny(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Protosynthesis!', colour: CASTFORM_FORMS.sunny.colour });
    return true;
  }
  if (era === 'future') {
    if (!first_deal(card, context, 'terrainread_round')) return false;
    const ex = card.ability.extra;
    ex.terrainread_round = G.GAME.round;
    if (electric_terrain(G.hand.cards)) ex.terrain_round = G.GAME.round;
    if (is_electric_terrain(card)) card_eval_status_text(card, 'extra', null, null, null, { message: 'Quark Drive!', colour: '#f8d030' });
    return true;
  }
  return false;
}
/** The tooltip's state line. */
const paradox_state = (card) => {
  const anc = paradox_era(card) === 'ancient', on = paradox_boosted(card);
  if (on) return anc ? 'Sunny: boosted!' : 'Electric Terrain: boosted!';
  const read = G.GAME && G.GAME.facing_blind && card.ability.extra[anc ? 'sunread_round' : 'terrainread_round'] === G.GAME.round;
  return anc ? (read ? 'Not sunny' : 'Not sunny yet') : (read ? 'No Electric Terrain' : 'No Electric Terrain yet');
};
/** Its pills: the rarity's "Paradox" (describe), then the era's ("Ancient" / "Future"), then the type's. */
function paradox_badges(self, card, badges) {
  const e = PARADOX_ERAS[self.poke_paradox];
  if (e) badges.push({ key: 'poke_paradox_' + self.poke_paradox, label: e.name, colour: e.colour });
  poke_set_type_badge(self, card, badges);
}
/** A Paradox center's static data: rarity Paradox, $7, a single-stage Basic of Gen 9, Blueprint-compatible; its 3.9.1 cell + soul. */
const paradox = (name, era, ptype, cell, after, attributes, extra) => ({
  name, poke_sprite391: sprite('Natdex', cell[0], cell[1], cell[2]), poke_paradox: era, config: { extra },
  rarity: 'poke_paradox', cost: 7, stage: 'Basic', ptype, gen: 9, blueprint_compat: true,
  attributes: [...attributes, 'paradox'], poke_after: after,
  set_badges: paradox_badges,
});
const scored_card = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round);
/** "Each scored <filter> card gives X" (Xmult_multi, boosted). */
const per_card_x = (filter) => (card, context) => {
  if (!scored_card(context) || !filter(context.other_card, context)) return undefined;
  return { x_mult: boost_x(card.ability.extra.Xmult_multi, paradox_boosted(card)), card };
};
const x_vars = (card) => { const ex = card.ability.extra; return [r3(ex.Xmult_multi), r3(boost_x(ex.Xmult_multi, true)), paradox_state(card)]; };
const tips = (self, info_queue, card, ...more) => { type_tooltip(self, info_queue, card); for (const m of more) info_queue.push(m); };
/** Roaring Moon: the Straights played this run (G.GAME.hands, the run's own records: a Straight Flush is a Straight too, so it counts; the
 *  hand being played counts at once, run.js adds 1 before the jokers). */
export const straights_played = () => { const H = (G.GAME && G.GAME.hands) || {}; return ((H.Straight && H.Straight.played) || 0) + ((H['Straight Flush'] && H['Straight Flush'].played) || 0); };
/** Raging Bolt: the hands left before this hand (while it scores hands_left is already spent: +1); out of a round, a round's hands. */
export const bolt_hands = (scoring) => {
  const GM = G.GAME, cr = GM && GM.current_round;
  if (!GM) return 0;
  if (!GM.facing_blind) return (GM.round_resets && GM.round_resets.hands) || 0;
  return ((cr && cr.hands_left) || 0) + (scoring ? 1 : 0);
};
const bolt_x = (card, scoring, on) => r9(1 + boost_add(card.ability.extra.Xmult_mod, on) * bolt_hands(scoring));
/** Iron Bundle: at end of round (the main pass; Blueprint copies it) a random Tarot or Planet (a seeded coin, then the set's own seeded
 *  pick, key_append 'iron_bundle'), with room (cards + consumeable_buffer < limit). Never boosted. */
function iron_bundle_make(card, context) {
  if (!round_end(context) || context.retrigger_joker) return false;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return true;
  const set = pseudorandom(pseudoseed('poke_iron_bundle_set')) < 0.5 ? 'Tarot' : 'Planet';
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const t = create_card(set, G.consumeables, null, null, null, null, undefined, 'iron_bundle');
    t.add_to_deck();
    G.consumeables.emplace(t);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize(set === 'Tarot' ? 'k_plus_tarot' : 'k_plus_planet'), colour: set === 'Tarot' ? 'Tarot' : 'Planet' });
  return true;
}

// ---------------------------------------------------------------- Gen 9, batch 4: the Gen 9 Legendaries (the owner's "yes", 2026-11-03)
/** Wo-Chien, Tablets of Ruin: when a Blind is selected its chip requirement drops by RUIN_PCT% (fixed: Energy-inert). Queued after the
 *  setting_blind pass (and the blind's own setting_blind effects), so The Wall's x4 / Violet Vessel's x6 are in the number it cuts; Chicot's
 *  disable (also queued) halves it after, and the order of two multiplications doesn't matter. One cut per Blind whatever the copies (the
 *  shared per-Blind record G.GAME.poke_ruin_tablets, keyed by G.GAME.round: the best of equals wins, nothing stacks; a Blueprint copies
 *  nothing). Never below 1 chip. The HUD's "Score at least" updates (the 'blind' chips event, Poison Gas's). It lives in G.GAME and the run
 *  is rebuilt from its recipe, so a resume / replay comes back with the same requirement. A Wo-Chien gained mid-Blind cuts from the next
 *  Blind; one sold mid-Blind leaves this Blind's cut in place (it was applied when the Blind was set). */
export const RUIN_PCT = 15;
function tablets_of_ruin(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced) return false;
  G.E_MANAGER.add_event(() => {
    const GM = G.GAME, b = GM.blind;
    if (!GM.facing_blind || !b || GM.poke_ruin_tablets === GM.round) return;
    GM.poke_ruin_tablets = GM.round;
    const cut = BN.min(BN.floor(BN.div(BN.mul(b.chips, RUIN_PCT), 100)), BN.sub(b.chips, 1));
    if (!BN.gt(cut, 0)) return;
    b.chips = BN.sub(b.chips, cut);
    b.chip_text = number_format(b.chips);
    emit('blind', { action: 'chips', key: b.config && b.config.blind && b.config.blind.key, chips: BN.toJSONValue(b.chips), chip_text: b.chip_text });
    card_eval_status_text(card, 'extra', null, null, null, { message: '-' + RUIN_PCT + '%', colour: 'GREEN' });
  });
  return true;
}
const ruin_state = () => (G.GAME && G.GAME.facing_blind && G.GAME.poke_ruin_tablets === G.GAME.round ? 'This Blind: -' + RUIN_PCT + '%' : 'From the next Blind');
/** Chi-Yu, Beads of Ruin: the Boss Blind's ability is disabled (Chicot's behaviour: when a Boss Blind is selected, and when it is gained
 *  or un-debuffed during one). With an undebuffed Chicot held, Chicot does it and Chi-Yu does nothing, and it never disables an already
 *  disabled Blind (Blind:disable is not idempotent: a second one would halve The Wall again). Not Blueprint. */
const chicot_on = () => ((G.jokers && G.jokers.cards) || []).some((j) => j.ability.name === 'Chicot' && !j.debuff && !j.getting_sliced);
function beads_disable(card) {
  const b = G.GAME.blind;
  if (!b || !b.boss || b.disabled || chicot_on()) return false;
  b.disable();
  play_sound('timpani');
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
  return true;
}
function beads_of_ruin(card, context) {
  if (!context.setting_blind || context.blueprint || context.retrigger_joker || card.getting_sliced || !(context.blind && context.blind.boss)) return false;
  G.E_MANAGER.add_event(() => { if (!card.getting_sliced && !card.debuff) beads_disable(card); });
  return true;
}
const beads_state = () => (G.GAME && G.GAME.blind && G.GAME.blind.boss && G.GAME.facing_blind ? (G.GAME.blind.disabled ? 'Boss disabled' : chicot_on() ? 'Chicot disables it' : 'Boss active') : 'Boss Blinds only');
/** Koraidon / Miraidon: the undebuffed Ancient / Future Paradox Jokers held (the Paradox batch's era: paradox_era, the "Ancient" / "Future"
 *  pill; itself never: neither is a Paradox). */
const paradox_count = (card, side) => ((G.jokers && G.jokers.cards) || []).filter((j) => j !== card && !j.debuff && paradox_era(j) === side).length;
const pulse_x = (card, side) => r9(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * paradox_count(card, side));
/** Ogerpon's masks: one per Ante, cycling Teal -> Wellspring -> Hearthflame -> Cornerstone (Ante 1 Teal, 2 Wellspring, 3 Hearthflame,
 *  4 Cornerstone, 5 Teal...; an Ante below 1 keeps cycling backwards): DETERMINISTIC from G.GAME.round_resets.ante (Deerling's seasons),
 *  so nothing is rolled or saved and a resume / replay agrees. The ante goes up when the Boss is beaten, so the shop after a Boss already
 *  wears the next mask. Its TYPE follows the mask (Grass / Water / Fire / Earth: protean_set, so is_type / Energy / Kecleon follow; a Tera
 *  sticker still overrides; Monotype-exempt, poke_mono_exempt) and so does its card (systems/anim.js GEN9_LEGEND_FORMS). */
export const OGERPON_MASKS = {
  teal: { name: 'Teal Mask', ptype: 'Grass', colour: '#4bc292' },
  wellspring: { name: 'Wellspring Mask', ptype: 'Water', colour: '#0093ff' },
  hearthflame: { name: 'Hearthflame Mask', ptype: 'Fire', colour: '#fe5f55' },
  cornerstone: { name: 'Cornerstone Mask', ptype: 'Earth', colour: '#b5763c' },
};
export const MASK_ORDER = ['teal', 'wellspring', 'hearthflame', 'cornerstone'];
export const mask_of_ante = (ante) => MASK_ORDER[((((ante === undefined || ante === null ? 1 : ante) - 1) % 4) + 4) % 4];
export const mask_now = () => mask_of_ante(G.GAME && G.GAME.round_resets && G.GAME.round_resets.ante);
/** Ogerpon's type = its mask's (run before every calculate: the center's update hook; on add_to_deck and in its tooltip too). */
function ogerpon_sync(card) {
  if (!card || !card.ability || !card.ability.extra) return;
  protean_set(card, OGERPON_MASKS[mask_now()].ptype);
}
/** Wellspring Mask's +1 hand: given when a Blind is selected in a Wellspring Ante (once a round, `well_round`; not Blueprint), Dubwool's
 *  Cotton Guard: an unused one is taken back at the round's end before the cash-out counts hands, and sold mid-round it is taken back too
 *  (never the last hand). */
function wellspring_hand(card, context) {
  const ex = card.ability.extra;
  if (context.setting_blind && !context.blueprint && !context.retrigger_joker && mask_now() === 'wellspring' && ex.well_round !== G.GAME.round) {
    ex.well_round = G.GAME.round;
    ease_hands_played(ex.hands);
    card_eval_status_text(card, 'extra', null, null, null, { message: '+' + ex.hands + ' Hand', colour: 'CHIPS' });
    return true;
  }
  if (round_end(context) && !context.blueprint && ex.well_round === G.GAME.round) {
    ex.well_round = -1;
    const back = Math.min(ex.hands, G.GAME.current_round.hands_left);
    if (back > 0) ease_hands_played(-back);
  }
  return false;
}
const well_on = (card) => !!(G.GAME && G.GAME.facing_blind && card.ability.extra.well_round === G.GAME.round);
/** Ogerpon's score by mask: Teal +Mult, Wellspring X, Hearthflame X, Cornerstone +Chips. */
function ogerpon_main(card) {
  const ex = card.ability.extra, m = mask_now();
  if (m === 'teal') return { message: a_mult(r3(ex.mult)), colour: 'MULT', mult_mod: ex.mult };
  if (m === 'wellspring') return x_main(ex.Xmult);
  if (m === 'hearthflame') return x_main(ex.Xmult2);
  return { message: a_chips(r3(ex.chips)), colour: 'CHIPS', chip_mod: ex.chips };
}

export const JOKERS = {

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

  // ---------------------------------------------------------------- LINE F2b: Fuecoco -> Crocalor -> Skeledirge (Fire starter, Gen 9)
  // The owner's Gen 9 starters (2026-10-28, contentRev 51). Torch Song: every hand played (counted in `before`, so the hand being
  // played counts itself) permanently banks Mult on the joker (`torch_mult`, in no energy_values: never retroactive; kept through
  // both evolutions). The gain is `mult_mod` (Energy +20% of its base each: Fuecoco 1 -> 1.2 / 1.4 / 1.6, Crocalor 2 -> 2.4 / 2.8 / 3.2).
  // Skeledirge banks X Mult instead (`torch_Xmult` from X1, gain `Xmult_mod` 0.05 -> 0.06 / 0.07 / 0.08) and still gives the banked
  // Mult. The Fire starter perk at every stage: +1 discard (`d_size`, fixed). Evolves after 5 rounds, then 5 (Cyndaquil's timers).
  // Fuecoco 909: Uncommon $5, a starter (the Starter Pack).
  fuecoco: {
    name: 'fuecoco', poke_sprite391: sprite('Natdex', 16, 60),
    config: { extra: { d_size: 1, torch_mult: 0, mult_mod: 1, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 9, blueprint_compat: true, starter: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'scaling', 'round_evo'], poke_after: 'meowscarada',
    poke_custom_values_to_keep: ['torch_mult'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult_mod), r3(ex.torch_mult), ex.rounds] }; },
    calculate(self, card, context) { return torch_song(card, context) || starter9_main(card, context) || level_evo(self, card, context, 'j_poke_crocalor'); },
  },
  // Crocalor 910: Safari $8; Fuecoco's bank, +2 Mult per hand.
  crocalor: {
    name: 'crocalor', poke_sprite391: sprite('Natdex', 18, 60),
    config: { extra: { d_size: 1, torch_mult: 0, mult_mod: 2, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'scaling', 'round_evo'], poke_after: 'fuecoco',
    poke_custom_values_to_keep: ['torch_mult'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.mult_mod), r3(ex.torch_mult), ex.rounds] }; },
    calculate(self, card, context) { return torch_song(card, context) || starter9_main(card, context) || level_evo(self, card, context, 'j_poke_skeledirge'); },
  },
  // Skeledirge 911: Safari $10; gives the banked Mult (it banks no more) and banks X0.05 Mult per hand played.
  skeledirge: {
    name: 'skeledirge', poke_sprite391: sprite('Natdex', 20, 60),
    config: { extra: { d_size: 1, torch_mult: 0, torch_Xmult: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fire', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'discard', 'passive', 'mult', 'xmult', 'scaling'], poke_after: 'crocalor',
    poke_custom_values_to_keep: ['torch_mult', 'torch_Xmult'],
    ...discards,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.torch_mult), r3(ex.Xmult_mod), r3(ex.torch_Xmult)] }; },
    calculate(self, card, context) { return torch_song(card, context) || starter9_main(card, context); },
  },

  // ---------------------------------------------------------------- LINE F2c: Quaxly -> Quaxwell -> Quaquaval (Water starter, Gen 9)
  // The owner's Gen 9 starters (2026-10-28, contentRev 51). Moxie: when you beat a Blind, permanently banks Chips for each unused hand
  // (the hands left after the winning one) on the joker (`moxie_chips`, in no energy_values: never retroactive; kept through both
  // evolutions). The gain is `chip_mod` (Energy +20% of its base each: Quaxly 4 -> 4.8 / 5.6 / 6.4, Quaxwell 6 -> 7.2 / 8.4 / 9.6).
  // Quaquaval banks X Mult instead (`moxie_Xmult` from X1, gain `Xmult_mod` 0.2 -> 0.24 / 0.28 / 0.32 per unused hand) and still gives
  // the banked Chips. The Water starter perk at every stage: +1 hand (`hands`, fixed: the Squirtle line's pair). 5 rounds, then 5.
  // Quaxly 912: Uncommon $5, a starter (the Starter Pack).
  quaxly: {
    name: 'quaxly', poke_sprite391: sprite('Natdex', 22, 60),
    config: { extra: { hands: 1, moxie_chips: 0, chip_mod: 4, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Water', gen: 9, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'scaling', 'round_evo'], poke_after: 'skeledirge',
    poke_custom_values_to_keep: ['moxie_chips'],
    ...hands,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chip_mod), r3(ex.moxie_chips), ex.rounds] }; },
    calculate(self, card, context) { moxie_bank(card, context); return starter9_main(card, context) || level_evo(self, card, context, 'j_poke_quaxwell'); },
  },
  // Quaxwell 913: Safari $8; Quaxly's bank, +6 Chips per unused hand.
  quaxwell: {
    name: 'quaxwell', poke_sprite391: sprite('Natdex', 24, 60),
    config: { extra: { hands: 1, moxie_chips: 0, chip_mod: 6, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'scaling', 'round_evo'], poke_after: 'quaxly',
    poke_custom_values_to_keep: ['moxie_chips'],
    ...hands,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chip_mod), r3(ex.moxie_chips), ex.rounds] }; },
    calculate(self, card, context) { moxie_bank(card, context); return starter9_main(card, context) || level_evo(self, card, context, 'j_poke_quaquaval'); },
  },
  // Quaquaval 914: Safari $10; gives the banked Chips (it banks no more) and banks X0.2 Mult per unused hand when you beat a Blind.
  quaquaval: {
    name: 'quaquaval', poke_sprite391: sprite('Natdex', 26, 60),
    config: { extra: { hands: 1, moxie_chips: 0, moxie_Xmult: 1, Xmult_mod: 0.2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'hands', 'passive', 'chips', 'xmult', 'scaling'], poke_after: 'quaxwell',
    poke_custom_values_to_keep: ['moxie_chips', 'moxie_Xmult'],
    ...hands,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.moxie_chips), r3(ex.Xmult_mod), r3(ex.moxie_Xmult)] }; },
    calculate(self, card, context) { moxie_bank(card, context); return starter9_main(card, context); },
  },


  // The owner's Gen 9 batch 1 ("Yes", 2026-11-03): 15 jokers, #919-950, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage
  // C $5 / S $8, single-stage R $7); evolution by rounds (4 for the early evolvers Nymble, Pawmi, Wattrel; 5 for the rest). Types = the
  // cards' (pokermon_art_type.mjs). Energy raises each main number at the standard share; money, odds, counts, slots and the debuff guard are
  // fixed; banks never retroactive. Art: upstream 3.9.1's own cells (Natdex {6,61}-{8,63}; Squawkabilly Gen 9 {8,0} Green and, beside it,
  // {0,1} Blue / {2,1} Yellow / {4,1} White: systems/anim.js GEN9_FORM_SPRITES); nothing to deploy. Neither Nacho nor Pokermon+ has any.
  // Pokédex order: Nymble ... Pawmot after Spidops (918), Squawkabilly after Arboliva (930), Tadbulb ... Mabosstiff after Ceruledge (937),
  // Toedscool ... Klawf after Brambleghast (947).
  //
  // Nymble 919 (Grass, Common $5), Lunge: +15 Mult if the played hand has 3 or fewer cards (`mult` +40%: 21 / 27 / 33). 4 rounds.
  nymble: {
    name: 'nymble', poke_sprite391: sprite('Natdex', 6, 61),
    config: { extra: { mult: 15, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'round_evo'], poke_after: 'spidops',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return lunge(context) ? { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult } : undefined;
      return level_evo(self, card, context, 'j_poke_lokix');
    },
  },
  // Lokix 920 (Safari $8): X2.5 Mult under the same condition (`Xmult` +20%: 3 / 3.5 / 4).
  lokix: {
    name: 'lokix', poke_sprite391: sprite('Natdex', 8, 61),
    config: { extra: { Xmult: 2.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'nymble',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && lunge(context)) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Pawmi 921 (Lightning, Uncommon $6): +2 Mult for each Lightning Joker, itself included (`mult` +40%: 2.8 / 3.6 / 4.4). 4 rounds.
  pawmi: {
    name: 'pawmi', poke_sprite391: sprite('Natdex', 10, 61),
    config: { extra: { mult: 2, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Lightning', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'types', 'round_evo'], poke_after: 'lokix',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = volt_count(card); return { vars: [r3(ex.mult), n, r3(ex.mult * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * volt_count(card)); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_pawmo');
    },
  },
  // Pawmo 922 (Safari $8): each scored face card earns $1 (`face_money`, fixed; Emolga's Static: a retrigger pays again). Carries Pawmot's
  // `Xmult` (1.5: "Energy carries to Pawmot"; no Xmult_mod beside it, so evolution never copies it over). 5 rounds.
  pawmo: {
    name: 'pawmo', poke_sprite391: sprite('Natdex', 12, 61),
    config: { extra: { face_money: 1, Xmult: 1.5, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 9, blueprint_compat: true,
    attributes: ['economy', 'face', 'round_evo'], poke_after: 'pawmi',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.face_money, ex.rounds] }; },
    calculate(self, card, context) {
      if (face_scored(context)) {
        const d = card.ability.extra.face_money;
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + d;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: d, card };
      }
      return level_evo(self, card, context, 'j_poke_pawmot');
    },
  },
  // Pawmot 923 (Safari $10): X1.5 Mult (`Xmult` +20%: 1.8 / 2.1 / 2.4); Revival Blessing (pawmot_revive above; once per Ante, fixed).
  pawmot: {
    name: 'pawmot', poke_sprite391: sprite('Natdex', 14, 61),
    config: { extra: { Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Lightning', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'joker', 'destroy_card'], poke_after: 'pawmo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult), blessing_state(card)] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Squawkabilly 931 (Colorless, Rare $7), Parrot: each Planet used has a 1 in 2 chance to level that hand up once more (parrot above; the odds
  // and the level are fixed: Energy-inert). Its plumage is rolled when obtained (art only). A Colorless Joker, so it joins Starly's flock.
  squawkabilly: {
    name: 'squawkabilly', poke_sprite391: sprite('Gen09', 8, 0),
    config: { extra: { num: 1, dem: 2, levels: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Colorless', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['planet', 'hand_level', 'chance', 'nature'], poke_after: 'arboliva',
    poke_view_form(self, card) { return plumage(card) || 'green'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'squawkabilly'), p = plumage(card);
      return { vars: [num, dem, p ? PLUMAGE_NAMES[p] : 'Plumage: rolled when obtained'] };
    },
    add_to_deck(self, card) { plumage_roll(card); },
    calculate(self, card, context) { parrot(card, context); return undefined; },
  },
  // Tadbulb 938 (Lightning, Common $5): +3 Mult for each discard used this round (`mult` +40%: 4.2 / 5.4 / 6.6). 5 rounds.
  tadbulb: {
    name: 'tadbulb', poke_sprite391: sprite('Natdex', 14, 62),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Lightning', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'discard', 'round_evo'], poke_after: 'ceruledge',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.mult * discards_used()), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult * discards_used()); return m > 0 ? { message: a_mult(m), colour: 'MULT', mult_mod: m } : undefined; }
      return level_evo(self, card, context, 'j_poke_bellibolt');
    },
  },
  // Bellibolt 939 (Safari $8), Electromorphosis (above): +X0.25 charge per discard used (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4), fired by the
  // next scoring hand, lost at round end.
  bellibolt: {
    name: 'bellibolt', poke_sprite391: sprite('Natdex', 16, 62),
    config: { extra: { charge_Xmult: 1, Xmult_mod: 0.25 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'discard', 'scaling'], poke_after: 'tadbulb',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.charge_Xmult)] }; },
    calculate(self, card, context) { return electromorphosis(card, context); },
  },
  // Wattrel 940 (Lightning, Common $5), Wind Power: at end of round, earn $1 per discard left (`wind_money`, fixed: Energy-inert). 4 rounds.
  wattrel: {
    name: 'wattrel', poke_sprite391: sprite('Natdex', 18, 62),
    config: { extra: { wind_money: 1, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Lightning', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['economy', 'discard', 'round_evo'], poke_after: 'bellibolt',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.wind_money, wind_money(card), ex.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_kilowattrel'); },
    calc_dollar_bonus(self, card) { const d = wind_money(card); return d > 0 ? d : undefined; },
  },
  // Kilowattrel 941 (Safari $8): $2 per discard left (fixed).
  kilowattrel: {
    name: 'kilowattrel', poke_sprite391: sprite('Natdex', 20, 62),
    config: { extra: { wind_money: 2 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['economy', 'discard'], poke_after: 'wattrel',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.wind_money, wind_money(card)] }; },
    calc_dollar_bonus(self, card) { const d = wind_money(card); return d > 0 ? d : undefined; },
  },
  // Maschiff 942 (Dark, Common $5): +12 Mult during Boss Blinds (`mult` +40%: 16.8 / 21.6 / 26.4). 5 rounds.
  maschiff: {
    name: 'maschiff', poke_sprite391: sprite('Natdex', 22, 62),
    config: { extra: { mult: 12, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'boss_blind', 'round_evo'], poke_after: 'kilowattrel',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return boss_now() ? { message: a_mult(r3(card.ability.extra.mult)), colour: 'MULT', mult_mod: card.ability.extra.mult } : undefined;
      return level_evo(self, card, context, 'j_poke_mabosstiff');
    },
  },
  // Mabosstiff 943 (Safari $8): X1.5 Mult during Boss Blinds (`Xmult` +20%: 1.8 / 2.1 / 2.4); Guard Dog: your Jokers can't be debuffed, itself
  // included (systems/rules.js set_debuff; a Perishable's end of life and a Baby's faint still happen: a sticker's and a joker's own costs).
  mabosstiff: {
    name: 'mabosstiff', poke_sprite391: sprite('Natdex', 24, 62),
    config: { extra: { Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'boss_blind', 'debuff', 'joker'], poke_after: 'maschiff',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && boss_now()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
    add_to_deck() { guard_dog_refresh(true); },
    remove_from_deck() { guard_dog_refresh(false); },
  },
  // Toedscool 948 (Grass, Common $5), Mycelium: +4 Chips for each card in your full deck above 52 (`chips` +30%: 5.2 / 6.4 / 7.6). 5 rounds.
  toedscool: {
    name: 'toedscool', poke_sprite391: sprite('Natdex', 4, 63),
    config: { extra: { chips: 4, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['chips', 'full_deck', 'round_evo'], poke_after: 'brambleghast',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = mycelium(52); return { vars: [r3(ex.chips), n, r3(ex.chips * n), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = r3(card.ability.extra.chips * mycelium(52)); return c > 0 ? { message: a_chips(c), colour: 'CHIPS', chip_mod: c } : undefined; }
      return level_evo(self, card, context, 'j_poke_toedscruel');
    },
  },
  // Toedscruel 949 (Safari $8): X1 plus X0.02 for each card in your full deck above 40 (`Xmult_mod` +20%: 0.024 / 0.028 / 0.032): X1.24 on 52.
  toedscruel: {
    name: 'toedscruel', poke_sprite391: sprite('Natdex', 6, 63),
    config: { extra: { Xmult_mod: 0.02 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'full_deck'], poke_after: 'toedscool',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = mycelium(40); return { vars: [r3(ex.Xmult_mod), n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) { return context.joker_main ? x_main(r9(1 + card.ability.extra.Xmult_mod * mycelium(40))) : undefined; },
  },
  // Klawf 950 (Earth, Rare $7), Anger Shell: X1 plus X1 for each hand already played this round (anger_x; `Xmult_mod` +20%: 1.2 / 1.4 / 1.6).
  // On the Red Deck's 4 hands: X1 / X2 / X3 / X4 (X1 / 2.6 / 4.2 / 5.8 with 3 Energy).
  klawf: {
    name: 'klawf', poke_sprite391: sprite('Natdex', 8, 63),
    config: { extra: { Xmult_mod: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Earth', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'hands'], poke_after: 'toedscruel',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_mod), r3(anger_x(card))] }; },
    calculate(self, card, context) { return context.joker_main ? x_main(anger_x(card)) : undefined; },
  },


  // The owner's Gen 9 batch 2 ("Yes", 2026-11-03): 17 jokers, #951-1013, on the guide's price slots (2-stage C $5 / S $8, single-stage R $7;
  // Clodsire a Stage 1 S $8); every 2-stage Basic evolves after 5 rounds. Types = the cards' (pokermon_art_type.mjs). Energy raises the main
  // number at the standard share; money, odds, slots, tags, conversions and caps are fixed; banks never retroactive and carried. One is a
  // NEW EVOLUTION of an existing joker (the Gen 8 Galarian exception, owner-approved): Wooper -> Clodsire by a Dark Energy used on it
  // (gated by rules rev 77, so older runs replay as recorded; Wooper -> Quagsire unchanged). Art: upstream 3.9.1's own cells (Natdex
  // {10,63}-{14,67}); nothing to deploy. Pokédex order: each after the Gen 9 joker before it (Capsakid after Klawf, Flittle after
  // Rabsca, Bombirdier ... Glimmora after Wugtrio, Flamigo / Veluza / Dondozo after Houndstone, Clodsire after Annihilape, Poltchageist /
  // Sinistcha after Gholdengo).
  //
  // Capsakid 951 (Grass, Common $5), Spicy: scored Clubs +20 Chips (`chips` +30%: 26 / 32 / 38). 5 rounds.
  capsakid: {
    name: 'capsakid', poke_sprite391: sprite('Natdex', 10, 63),
    config: { extra: { chips: 20, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['chips', 'suit', 'round_evo'], poke_after: 'klawf',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), ex.rounds] }; },
    calculate(self, card, context) { return spicy(card, context, false) || level_evo(self, card, context, 'j_poke_scovillain'); },
  },
  // Scovillain 952 (Fire, Safari $8): Spicy kept (`chips` +30%) and scored Hearts X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38); +1 discard
  // each round (`d_size`, fixed).
  scovillain: {
    name: 'scovillain', poke_sprite391: sprite('Natdex', 12, 63),
    config: { extra: { chips: 20, Xmult_multi: 1.2, d_size: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 9, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'suit', 'discard'], poke_after: 'capsakid',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi), ex.d_size] }; },
    calculate(self, card, context) { return spicy(card, context, true); },
    ...discards,
  },
  // Flittle 955 (Psychic, Common $5), Opportunist: +1 Mult banked whenever another Joker permanently grows (`opp_mult`; gain `mult_mod`
  // +20%: 1.2 / 1.4 / 1.6). 5 rounds.
  flittle: {
    name: 'flittle', poke_sprite391: sprite('Natdex', 18, 63),
    config: { extra: { opp_mult: 0, mult_mod: 1, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Psychic', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'joker', 'round_evo'], poke_after: 'rabsca',
    poke_custom_values_to_keep: ['opp_mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.opp_mult), ex.rounds] }; },
    calculate(self, card, context) { return opportunist_main(card, context) || level_evo(self, card, context, 'j_poke_espathra'); },
  },
  // Espathra 956 (Safari $8): gives Flittle's banked Mult (it banks no more Mult) and banks X0.05 per growth (`opp_Xmult` from X1; gain
  // `Xmult_mod` +20%: 0.06 / 0.07 / 0.08).
  espathra: {
    name: 'espathra', poke_sprite391: sprite('Natdex', 20, 63),
    config: { extra: { opp_mult: 0, opp_Xmult: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling', 'joker'], poke_after: 'flittle',
    poke_custom_values_to_keep: ['opp_mult', 'opp_Xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.opp_Xmult), r3(ex.opp_mult)] }; },
    calculate(self, card, context) { return opportunist_main(card, context); },
  },
  // Bombirdier 962 (Dark, Rare $7), Stork Delivery: at the end of each shop, 1 in 2 to create a random Tag (odds fixed: Energy-inert).
  bombirdier: {
    name: 'bombirdier', poke_sprite391: sprite('Natdex', 2, 64),
    config: { extra: { num: 1, dem: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dark', gen: 9, blueprint_compat: true, poke_no_energy_field: true,
    attributes: ['tag', 'chance', 'economy'], poke_after: 'wugtrio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'bombirdier'); return { vars: [num, dem] }; },
    calculate(self, card, context) { stork_delivery(card, context); return undefined; },
  },
  // Varoom 965 (Metal, Common $5), Rev the Engine: +2 Mult per hand in the streak, this hand included (`mult_mod` +20%: 2.4 / 2.8 / 3.2).
  // 5 rounds.
  varoom: {
    name: 'varoom', poke_sprite391: sprite('Natdex', 8, 64),
    config: { extra: { mult_mod: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Metal', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'discard', 'round_evo'], poke_after: 'bombirdier',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), rev_streak(), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r3(card.ability.extra.mult_mod * (rev_streak() + 1)); return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_revavroom');
    },
  },
  // Revavroom 966 (Safari $8): X1 + X0.1 per hand in the streak, this hand included (`Xmult_mod` +20%: 0.12 / 0.14 / 0.16).
  revavroom: {
    name: 'revavroom', poke_sprite391: sprite('Natdex', 10, 64),
    config: { extra: { Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'discard'], poke_after: 'varoom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_mod), rev_streak()] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = r9(1 + card.ability.extra.Xmult_mod * (rev_streak() + 1)); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Cyclizar 967 (Dragon, Rare $7), Ride: +1 hand each round and +1 hand size (both fixed: Energy-inert).
  cyclizar: {
    name: 'cyclizar', poke_sprite391: sprite('Natdex', 12, 64),
    config: { extra: { hands: 1, h_size: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['hands', 'hand_size', 'passive'], poke_after: 'revavroom',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.h_size] }; },
    ...hands_hand_size,
  },
  // Orthworm 968 (Metal, Rare $7), Earth Eater: +15 Chips per Steel card in your full deck (`chips` +30%: 19.5 / 24 / 28.5).
  orthworm: {
    name: 'orthworm', poke_sprite391: sprite('Natdex', 14, 64),
    config: { extra: { chips: 15 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Metal', gen: 9, blueprint_compat: true,
    attributes: ['chips', 'enhancements', 'full_deck'], poke_after: 'cyclizar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * steel_in_deck())] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = r3(card.ability.extra.chips * steel_in_deck()); if (c > 0) return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return undefined;
    },
  },
  // Glimmet 969 (Earth, Common $5): scored Stone cards +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 5 rounds.
  glimmet: {
    name: 'glimmet', poke_sprite391: sprite('Natdex', 16, 64),
    config: { extra: { mult: 6, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'orthworm',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (stone_scored(context) && !context.other_card.debuff) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_glimmora');
    },
  },
  // Glimmora 970 (Safari $8), Toxic Debris: each scored Stone card turns a random deck card into a Hazard card (up to 3 a hand, fixed);
  // each Hazard card held in hand X1.15 (`Xmult_multi` +5%: 1.2075 / 1.265 / 1.3225).
  glimmora: {
    name: 'glimmora', poke_sprite391: sprite('Natdex', 18, 64),
    config: { extra: { Xmult_multi: 1.15, debris_cap: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'hand'], poke_after: 'glimmet',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.debris_cap] };
    },
    calculate(self, card, context) { toxic_debris(card, context); return hazard_held_x(card, context); },
  },
  // Flamigo 973 (Fighting, Rare $7): X1.5 Mult, X2 if the played hand is a Pair (`Xmult` / `Xmult2` +20%: 1.8 / 2.1 / 2.4 and 2.4 / 2.8 / 3.2).
  flamigo: {
    name: 'flamigo', poke_sprite391: sprite('Natdex', 24, 64),
    config: { extra: { Xmult: 1.5, Xmult2: 2 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'pair'], poke_after: 'houndstone',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra, x = context.scoring_name === 'Pair' ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Veluza 976 (Water, Rare $7), Fillet Away: at end of round loses $1 of sell value and banks +X0.25 (`fillet_Xmult` from X1; gain
  // `Xmult_mod` +20%: 0.3 / 0.35 / 0.4); at $1 (Pokermon's sell-value floor) it stops (`val_loss` fixed).
  veluza: {
    name: 'veluza', poke_sprite391: sprite('Natdex', 0, 65),
    config: { extra: { fillet_Xmult: 1, Xmult_mod: 0.25, val_loss: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'sell_value'], poke_after: 'flamigo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), ex.val_loss, r3(ex.fillet_Xmult)] }; },
    calculate(self, card, context) {
      fillet_away(card, context);
      if (context.joker_main && card.ability.extra.fillet_Xmult > 1) { const x = card.ability.extra.fillet_Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Dondozo 977 (Water, Rare $7), Commander: X2 Mult, X4 while an (undebuffed) Tatsugiri is directly to its left (`Xmult` / `Xmult2` +20%:
  // 2.4 / 2.8 / 3.2 and 4.8 / 5.6 / 6.4).
  dondozo: {
    name: 'dondozo', poke_sprite391: sprite('Natdex', 2, 65),
    config: { extra: { Xmult: 2, Xmult2: 4 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'joker', 'position'], poke_after: 'veluza',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2), dondozo_commanded(card) ? 'Commanded!' : 'no Tatsugiri on its left'] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const ex = card.ability.extra, x = dondozo_commanded(card) ? ex.Xmult2 : ex.Xmult; return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Clodsire 980 (Dark, Stage 1 Safari $8; from Wooper by a Dark Energy, r77), Poison Point: each card you discard (unenhanced) 1 in 4 to
  // become a Hazard card (odds fixed); X1 + X0.05 per Hazard card in your full deck (`Xmult_mod` +20%: 0.06 / 0.07 / 0.08).
  clodsire: {
    name: 'clodsire', poke_sprite391: sprite('Natdex', 8, 65),
    config: { extra: { num: 1, dem: 4, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'discard', 'enhancements', 'modify_card', 'full_deck', 'chance'], poke_after: 'annihilape',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'clodsire_poison');
      return { vars: [num, dem, r3(ex.Xmult_mod), hazards_in_deck(), r3(clodsire_x(card))] };
    },
    calculate(self, card, context) {
      clodsire_poison(card, context);
      if (context.joker_main) { const x = clodsire_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Poltchageist 1012 (Grass, Common $5), Hospitality: at end of round the Jokers directly left and right gain $1 of sell value (Combee's
  // honey, `honey` fixed). Carries Sinistcha's `Xmult_mod` ("Energy carries to Sinistcha"). 5 rounds.
  poltchageist: {
    name: 'poltchageist', poke_sprite391: sprite('Natdex', 12, 67),
    config: { extra: { honey: 1, Xmult_mod: 0.05, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: false,
    attributes: ['sell_value', 'joker', 'economy', 'round_evo'], poke_after: 'gholdengo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.honey, ex.rounds] }; },
    calculate(self, card, context) { honey_gather(card, context); return level_evo(self, card, context, 'j_poke_sinistcha'); },
  },
  // Sinistcha 1013 (Safari $8): Hospitality kept ($1, fixed); X1 + X0.05 per $1 of sell value of ALL your Jokers, itself included
  // (`Xmult_mod` +20%: 0.06 / 0.07 / 0.08; no cap).
  sinistcha: {
    name: 'sinistcha', poke_sprite391: sprite('Natdex', 14, 67),
    config: { extra: { honey: 1, Xmult_mod: 0.05 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'sell_value', 'joker', 'economy'], poke_after: 'poltchageist',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.honey, r3(ex.Xmult_mod), row_value(), r3(sinistcha_x(card))] }; },
    calculate(self, card, context) {
      honey_gather(card, context);
      if (context.joker_main) { const x = sinistcha_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },


  // The owner's Gen 9 batch 3 ("yes", 2026-11-03): the 20 Paradox Pokémon, each its own single-stage Basic, the owner's new Paradox rarity ($7,
  // Rare-equivalent power; only from the Paradox Ball and the Ancient / Future Packs: never the shop, never a Poké Ball), with a second pill:
  // Ancient (Protosynthesis: 50% stronger while it's sunny) or Future (Quark Drive: 50% stronger on Electric Terrain). Types = the cards'
  // (pokermon_art_type.mjs). Energy raises the main number at the standard share; the boost applies on top. Art: upstream 3.9.1's own cells
  // (Natdex 65-68, each with its soul; Walking Wake's soul is {7,67} and Iron Leaves' {9,67} — the sprite table's {5,67} / {7,67} are
  // their neighbours' souls, Miraidon's and Walking Wake's); nothing to deploy. Pokédex order: Great Tusk ... Iron Thorns after Kingambit, before Gimmighoul;
  // Roaring Moon, Iron Valiant, Walking Wake, Iron Leaves after Gholdengo, before Poltchageist; Gouging Fire ... Iron Crown after Sinistcha.
  //
  // Great Tusk 984 (Earth, Ancient): each scored Stone card X1.3 (`Xmult_multi` +5%: 1.365 / 1.43 / 1.495); sunny X1.45.
  great_tusk: {
    ...paradox('great_tusk', 'ancient', 'Earth', [16, 65, [17, 65]], 'kingambit', ['xmult', 'enhancements'], { Xmult_multi: 1.3 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card, P_CENTERS.m_stone); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => has_enhancement(c, 'm_stone'))(card, context); },
  },
  // Scream Tail 985 (Fairy, Ancient): each scored Spade +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2); sunny +9.
  scream_tail: {
    ...paradox('scream_tail', 'ancient', 'Fairy', [18, 65, [19, 65]], 'great_tusk', ['mult', 'suit', 'spades'], { mult: 6 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(boost_add(ex.mult, true)), paradox_state(card)] }; },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (scored_card(context) && context.other_card.is_suit('Spades')) return { mult: boost_add(card.ability.extra.mult, paradox_boosted(card)), card };
      return undefined;
    },
  },
  // Brute Bonnet 986 (Dark, Ancient): +25 Mult (`mult` +40%: 35 / 45 / 55); sunny +37.5.
  brute_bonnet: {
    ...paradox('brute_bonnet', 'ancient', 'Dark', [20, 65, [21, 65]], 'scream_tail', ['mult'], { mult: 25 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(boost_add(ex.mult, true)), paradox_state(card)] }; },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) { const m = boost_add(card.ability.extra.mult, paradox_boosted(card)); return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
  },
  // Flutter Mane 987 (Psychic, Ancient): X2 (`Xmult` +20%: 2.4 / 2.8 / 3.2); sunny X2.5.
  flutter_mane: {
    ...paradox('flutter_mane', 'ancient', 'Psychic', [22, 65, [23, 65]], 'brute_bonnet', ['xmult'], { Xmult: 2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(boost_x(ex.Xmult, true)), paradox_state(card)] }; },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) return x_main(boost_x(card.ability.extra.Xmult, paradox_boosted(card)));
      return undefined;
    },
  },
  // Slither Wing 988 (Grass, Ancient): each scored Heart X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38); sunny X1.3.
  slither_wing: {
    ...paradox('slither_wing', 'ancient', 'Grass', [24, 65, [25, 65]], 'flutter_mane', ['xmult', 'suit', 'hearts'], { Xmult_multi: 1.2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => c.is_suit('Hearts'))(card, context); },
  },
  // Sandy Shocks 989 (Lightning, Ancient): +20 Chips for each Steel card in the full deck (`chips` +30%: 26 / 32 / 38 each); sunny +30 each.
  sandy_shocks: {
    ...paradox('sandy_shocks', 'ancient', 'Lightning', [26, 65, [27, 65]], 'slither_wing', ['chips', 'enhancements', 'full_deck'], { chips: 20 }),
    loc_vars(self, info_queue, card) {
      tips(self, info_queue, card, P_CENTERS.m_steel);
      const ex = card.ability.extra, on = paradox_boosted(card);
      return { vars: [r3(ex.chips), r3(boost_add(ex.chips, true)), paradox_state(card), r3(boost_add(ex.chips, on) * steel_in_deck())] };
    },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) { const c = r9(boost_add(card.ability.extra.chips, paradox_boosted(card)) * steel_in_deck()); if (c > 0) return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c }; }
      return undefined;
    },
  },
  // Iron Treads 990 (Metal, Future): +100 Chips (`chips` +30%: 130 / 160 / 190); Electric Terrain +150.
  iron_treads: {
    ...paradox('iron_treads', 'future', 'Metal', [28, 65, [29, 65]], 'sandy_shocks', ['chips'], { chips: 100 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(boost_add(ex.chips, true)), paradox_state(card)] }; },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) { const c = boost_add(card.ability.extra.chips, paradox_boosted(card)); return { message: a_chips(r3(c)), colour: 'CHIPS', chip_mod: c }; }
      return undefined;
    },
  },
  // Iron Bundle 991 (Water, Future): at end of round a random Tarot or Planet card, with room. No number: never boosted, Energy-inert.
  iron_bundle: {
    ...paradox('iron_bundle', 'future', 'Water', [0, 66, [1, 66]], 'iron_treads', ['tarot', 'planet'], {}),
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) { iron_bundle_make(card, context); return undefined; },
  },
  // Iron Hands 992 (Fighting, Future): each scored face card X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375); Electric Terrain X1.375.
  iron_hands: {
    ...paradox('iron_hands', 'future', 'Fighting', [2, 66, [3, 66]], 'iron_bundle', ['xmult', 'face'], { Xmult_multi: 1.25 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => c.is_face())(card, context); },
  },
  // Iron Jugulis 993 (Dark, Future): X2 (`Xmult` +20%: 2.4 / 2.8 / 3.2); Electric Terrain X2.5.
  iron_jugulis: {
    ...paradox('iron_jugulis', 'future', 'Dark', [4, 66, [5, 66]], 'iron_hands', ['xmult'], { Xmult: 2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(boost_x(ex.Xmult, true)), paradox_state(card)] }; },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) return x_main(boost_x(card.ability.extra.Xmult, paradox_boosted(card)));
      return undefined;
    },
  },
  // Iron Moth 994 (Fire, Future): each scored Diamond X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38); Electric Terrain X1.3.
  iron_moth: {
    ...paradox('iron_moth', 'future', 'Fire', [6, 66, [7, 66]], 'iron_jugulis', ['xmult', 'suit', 'diamonds'], { Xmult_multi: 1.2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => c.is_suit('Diamonds'))(card, context); },
  },
  // Iron Thorns 995 (Lightning, Future): each scored Stone card +30 Chips (`chips` +30%: 39 / 48 / 57); Electric Terrain +45.
  iron_thorns: {
    ...paradox('iron_thorns', 'future', 'Lightning', [8, 66, [9, 66]], 'iron_moth', ['chips', 'enhancements'], { chips: 30 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card, P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(boost_add(ex.chips, true)), paradox_state(card)] }; },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (scored_card(context) && has_enhancement(context.other_card, 'm_stone')) return { chips: boost_add(card.ability.extra.chips, paradox_boosted(card)), card };
      return undefined;
    },
  },
  // Roaring Moon 1005 (Dark, Ancient): +4 Mult for each Straight played this run (a Straight Flush counts; `mult` +40%: 5.6 / 7.2 / 8.8
  // each); sunny +6 each.
  roaring_moon: {
    ...paradox('roaring_moon', 'ancient', 'Dark', [28, 66, [29, 66]], 'gholdengo', ['mult', 'hand_type'], { mult: 4 }),
    loc_vars(self, info_queue, card) {
      tips(self, info_queue, card);
      const ex = card.ability.extra, n = straights_played();
      return { vars: [r3(ex.mult), r3(boost_add(ex.mult, true)), paradox_state(card), n, r3(boost_add(ex.mult, paradox_boosted(card)) * n)] };
    },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) { const m = r9(boost_add(card.ability.extra.mult, paradox_boosted(card)) * straights_played()); if (m > 0) return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
  },
  // Iron Valiant 1006 (Fairy, Future): each scored Queen or King X1.2 (`Xmult_multi` +5%); Electric Terrain X1.3.
  iron_valiant: {
    ...paradox('iron_valiant', 'future', 'Fairy', [0, 67, [1, 67]], 'roaring_moon', ['xmult', 'rank', 'face'], { Xmult_multi: 1.2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => c.get_id() === 12 || c.get_id() === 13)(card, context); },
  },
  // Walking Wake 1009 (Water, Ancient): each scored Club X1.2 (`Xmult_multi` +5%); sunny X1.3.
  walking_wake: {
    ...paradox('walking_wake', 'ancient', 'Water', [6, 67, [7, 67]], 'iron_valiant', ['xmult', 'suit', 'clubs'], { Xmult_multi: 1.2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => c.is_suit('Clubs'))(card, context); },
  },
  // Iron Leaves 1010 (Grass, Future): each scored Club X1.2 (`Xmult_multi` +5%); Electric Terrain X1.3.
  iron_leaves: {
    ...paradox('iron_leaves', 'future', 'Grass', [8, 67, [9, 67]], 'walking_wake', ['xmult', 'suit', 'clubs'], { Xmult_multi: 1.2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => c.is_suit('Clubs'))(card, context); },
  },
  // Gouging Fire 1020 (Fire, Ancient): +1 discard each round (the Charmander pair, fixed) and X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); sunny X1.75.
  gouging_fire: {
    ...paradox('gouging_fire', 'ancient', 'Fire', [28, 67, [29, 67]], 'sinistcha', ['xmult', 'discard'], { d_size: 1, Xmult: 1.5 }),
    ...discards,
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult), r3(boost_x(ex.Xmult, true)), paradox_state(card)] }; },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) return x_main(boost_x(card.ability.extra.Xmult, paradox_boosted(card)));
      return undefined;
    },
  },
  // Raging Bolt 1021 (Lightning, Ancient): X1, plus X0.25 for each hand left, this one included (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4);
  // sunny X0.375 each (the bonus part x1.5).
  raging_bolt: {
    ...paradox('raging_bolt', 'ancient', 'Lightning', [0, 68, [1, 68]], 'gouging_fire', ['xmult', 'hands'], { Xmult_mod: 0.25 }),
    loc_vars(self, info_queue, card) {
      tips(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [r3(ex.Xmult_mod), r3(boost_add(ex.Xmult_mod, true)), paradox_state(card), r3(bolt_x(card, false, paradox_boosted(card)))] };
    },
    calculate(self, card, context) {
      if (paradox_read(card, context)) return undefined;
      if (context.joker_main) return x_main(bolt_x(card, true, paradox_boosted(card)));
      return undefined;
    },
  },
  // Iron Boulder 1022 (Earth, Future): the first scored card (by position; a debuffed one there scores nothing) X2 (`Xmult_multi` +5%:
  // 2.1 / 2.2 / 2.3); Electric Terrain X2.5.
  iron_boulder: {
    ...paradox('iron_boulder', 'future', 'Earth', [2, 68, [3, 68]], 'raging_bolt', ['xmult', 'position'], { Xmult_multi: 2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c, cx) => (cx.scoring_hand || [])[0] === c)(card, context); },
  },
  // Iron Crown 1023 (Metal, Future): each scored Spade X1.2 (`Xmult_multi` +5%); Electric Terrain X1.3.
  iron_crown: {
    ...paradox('iron_crown', 'future', 'Metal', [4, 68, [5, 68]], 'iron_boulder', ['xmult', 'suit', 'spades'], { Xmult_multi: 1.2 }),
    loc_vars(self, info_queue, card) { tips(self, info_queue, card); return { vars: x_vars(card) }; },
    calculate(self, card, context) { if (paradox_read(card, context)) return undefined; return per_card_x((c) => c.is_suit('Spades'))(card, context); },
  },


  // The owner's Gen 9 batch 4 ("yes", 2026-11-03): the 7 Gen 9 Legendaries, each complete ALONE (the solo rule, r59), all Legendary $20
  // (The Soul / the Legendary pool). Types = the cards' (pokermon_art_type.mjs; Ogerpon's four mask cells show Grass / Water / Fire / Earth).
  // Energy raises the X / Mult / Chips at the standard share; hands, the 15%, the Boss disable and the weather are fixed; banks never
  // retroactive. Art: upstream 3.9.1's own cells (the Ruinous four and the box legendaries on Natdex {20..27,66} / {1..4,67}; Ogerpon and its
  // masks on the Gen 9 sheet: card and soul, systems/anim.js GEN9_LEGEND_FORMS); nothing to deploy.
  //
  // Wo-Chien 1001 (Grass), Tablets of Ruin: every Blind's chip requirement is 15% lower (tablets_of_ruin: cut when the Blind is set, the HUD
  // updates; copies don't stack). No number: Energy-inert (poke_no_energy_field). Nothing for a Blueprint to copy.
  wochien: {
    name: 'wochien', poke_sprite391: sprite('Natdex', 20, 66, [21, 66]),
    config: { extra: {} },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['blind'], poke_after: 'gholdengo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [RUIN_PCT, ruin_state()] }; },
    calculate(self, card, context) { tablets_of_ruin(card, context); return undefined; },
  },
  // Chien-Pao 1002 (Water), Sword of Ruin: every scored card gives X1.1 Mult (`Xmult_multi` +5%: 1.155 / 1.21 / 1.265). Blueprint copies it.
  chienpao: {
    name: 'chienpao', poke_sprite391: sprite('Natdex', 22, 66, [23, 66]),
    config: { extra: { Xmult_multi: 1.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Water', gen: 9, blueprint_compat: true,
    attributes: ['xmult'], poke_after: 'wochien',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Ting-Lu 1003 (Earth), Vessel of Ruin: +2 hands during Boss Blinds (Dubwool's Cotton Guard with `hands` 2, fixed: given when the Boss Blind
  // is selected, an unused one taken back at the round's end, so they never pay the $1 a hand). No number: Energy-inert. Not Blueprint.
  tinglu: {
    name: 'tinglu', poke_sprite391: sprite('Natdex', 24, 66, [25, 66]),
    config: { extra: { hands: 2 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Earth', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['hands', 'boss_blind'], poke_after: 'chienpao',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, guard_on(card) ? 'Active!' : 'Boss Blinds only'] }; },
    calculate(self, card, context) { cotton_guard(card, context); return undefined; },
    remove_from_deck(self, card, from_debuff) {
      if (from_debuff || !guard_on(card)) return;
      card.ability.extra.guard_round = -1;
      const back = Math.min(card.ability.extra.hands, G.GAME.current_round.hands_left - 1);
      if (back > 0) ease_hands_played(-back);
    },
  },
  // Chi-Yu 1004 (Fire), Beads of Ruin: disables every Boss Blind (Chicot's behaviour; with Chicot held, Chicot does it: no double effects).
  // No number: Energy-inert. Not Blueprint (as Chicot).
  chiyu: {
    name: 'chiyu', poke_sprite391: sprite('Natdex', 26, 66, [27, 66]),
    config: { extra: {} },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fire', gen: 9, blueprint_compat: false, poke_no_energy_field: true,
    attributes: ['boss_blind'], poke_after: 'tinglu',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [beads_state()] }; },
    calculate(self, card, context) { beads_of_ruin(card, context); return undefined; },
    add_to_deck(self, card) { if (G.GAME && G.GAME.facing_blind) beads_disable(card); },
  },
  // Koraidon 1007 (Dragon), Orichalcum Pulse: while held it's always SUNNY (the shared sun check, volcarona_sun: Cherrim / Larvesta /
  // Lurantis / Castform Sunny on its first deal unless Kyogre's rain wins; rain still falls). X2 Mult (`Xmult` +20%: 2.4 / 2.8 / 3.2), plus
  // X0.5 for each Ancient Paradox Joker held (undebuffed; `Xmult_mod` +20%: 0.6 / 0.7 / 0.8). Blueprint copies the X, never the sun.
  koraidon: {
    name: 'koraidon', poke_sprite391: sprite('Natdex', 2, 67, [1, 67]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'weather', 'paradox'], poke_after: 'iron_valiant',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), paradox_count(card, 'ancient'), r3(pulse_x(card, 'ancient'))] }; },
    calculate(self, card, context) { return context.joker_main ? x_main(pulse_x(card, 'ancient')) : undefined; },
  },
  // Miraidon 1008 (Dragon), Hadron Engine: while held every round is ELECTRIC TERRAIN (is_electric_terrain). X2 Mult (`Xmult` +20%), plus X0.5
  // for each Future Paradox Joker held (undebuffed; `Xmult_mod` +20%). Blueprint copies the X, never the terrain.
  miraidon: {
    name: 'miraidon', poke_sprite391: sprite('Natdex', 4, 67, [3, 67]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.5 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Dragon', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'weather', 'paradox'], poke_after: 'koraidon',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod), paradox_count(card, 'future'), r3(pulse_x(card, 'future'))] }; },
    calculate(self, card, context) { return context.joker_main ? x_main(pulse_x(card, 'future')) : undefined; },
  },
  // Ogerpon 1017 (Grass, its Teal card), Masks: a mask a Ante (mask_now: Teal -> Wellspring -> Hearthflame -> Cornerstone, from the Ante,
  // Teal at Ante 1); its type and card follow the mask (Monotype-exempt). Teal (Grass) +30 Mult (`mult` +40%: 42 / 54 / 66); Wellspring
  // (Water) +1 hand each round (`hands`, fixed; Cotton Guard's grant) and X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); Hearthflame (Fire) X2.5
  // (`Xmult2` +20%: 3 / 3.5 / 4); Cornerstone (Earth) +150 Chips (`chips` +30%: 195 / 240 / 285). Each mask's number is its own energy field,
  // so every Energy raises all four (Castform's way); the Energy of its CURRENT type matches. Blueprint copies the score, never the hand.
  ogerpon: {
    name: 'ogerpon', poke_sprite391: sprite('Gen09', 4, 4, [5, 4]),
    config: { extra: { mult: 30, hands: 1, Xmult: 1.5, Xmult2: 2.5, chips: 150 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Grass', gen: 9, blueprint_compat: true, poke_mono_exempt: true,
    attributes: ['mult', 'xmult', 'chips', 'hands', 'types', 'ante'], poke_after: 'sinistcha',
    poke_view_form() { return mask_now(); },
    update(self, card) { ogerpon_sync(card); },
    loc_vars(self, info_queue, card) {
      ogerpon_sync(card);
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, m = OGERPON_MASKS[mask_now()];
      return { vars: [r3(ex.mult), ex.hands, r3(ex.Xmult), r3(ex.Xmult2), r3(ex.chips), m.name, well_on(card) ? ', its hand given' : ''], colours: [m.colour] };
    },
    calculate(self, card, context) {
      if (wellspring_hand(card, context)) return undefined;
      if (context.joker_main) return ogerpon_main(card);
      return undefined;
    },
    add_to_deck(self, card) { ogerpon_sync(card); },
    remove_from_deck(self, card, from_debuff) {
      if (from_debuff || !well_on(card)) return;
      card.ability.extra.well_round = -1;
      const back = Math.min(card.ability.extra.hands, G.GAME.current_round.hands_left - 1);
      if (back > 0) ease_hands_played(-back);
    },
  },
};
