/**
 * Pokermon helpers — native rebuild of `functions/pokeutils.lua` plus the small
 * Steamodded utilities the Pokermon Lua leans on (SMODS.find_card, has_enhancement,
 * pseudorandom_probability, change_base, create_card/add_card, Ranks next/prev).
 *
 * Names are kept identical to the Lua (snake_case) so a joker port can be diffed
 * against pokemon/pokejokers_NN.lua by eye. Purely visual helpers (juice_flip*,
 * poke_debug) are kept as no-ops so ported code can call them unchanged.
 *
 * Source: Pokermon 3.2.1 functions/pokeutils.lua, functions/pokefunctions.lua
 * (remove, poke_drain, poke_total_chips, poke_draw_one, poke_change_poli_suit),
 * Steamodded src/utils.lua (find_card, change_base, pseudorandom_probability).
 */
import {
  G, P_CENTERS, P_CARDS, P_CARDS_LIST, Card, copy_table, emit, card_eval_status_text, play_sound, localize,
  pseudorandom, pseudoseed, pseudorandom_element, pseudoshuffle, ease_dollars, draw_card,
  create_card as core_create_card, create_playing_card, poll_edition, find_joker, probability_vars, probability_roll,
  quantum_enhancements,
} from '../../../js/engine/core.js';
import { playing_card_joker_effects } from '../../../js/engine/jokers.js';
import { calculate_context } from '../../../js/engine/run.js';
import { change_booster_limit as smods_change_booster_limit } from '../../../js/engine/run.js';
import { opt } from '../../../js/mods/registry.js';

export const MOD_ID = 'pokermon';
/** Pokermon config option for the current run (pokermon_config.<key> in the Lua). */
export const cfg = (key) => opt(MOD_ID, key);

// ------------------------------------------------------------ SMODS shims
/** SMODS.find_card(key, count_debuffed): jokers + consumables with this CENTER KEY. */
export function find_card(key, count_debuffed) {
  let out = [];
  for (const area of [G.jokers, G.consumeables]) {
    if (!area) continue;
    for (const v of area.cards) if (v.config.center.key === key && (count_debuffed || !v.debuff)) out.push(v);
  }
  // Pokermon's SMODS.find_card hook (pokermon.lua): vanilla keys also find their stand-ins.
  if (!out.length) {
    if (key === 'j_shortcut') out = find_joker('Shortcut');
    else if (key === 'j_four_fingers') out = find_joker('Four Fingers');
    else if (key === 'j_pareidolia') out = find_joker('Pareidolia');
    else if (key === 'j_smeared') out = find_joker('Smeared Joker');
  }
  // Add-on wrappers of SMODS.find_card append their own finds (Nacho: a Passimian holding the key's ability).
  for (const f of FIND_CARD_EXTRA) { const more = f(key, count_debuffed); if (more && more.length) out = out.concat(more); }
  return out;
}
/** Add-on extension point (additive; empty = Pokermon unchanged): fn(key, count_debuffed) -> extra cards find_card returns. */
export const FIND_CARD_EXTRA = [];
/** Lua `next(t)` on an array. */
export const any = (t) => !!(t && t.length);

/** SMODS.has_enhancement(card, key), quantum enhancements included (core.js quantum_enhancements). */
export const has_enhancement = (card, key) => !!(card && card.config && card.config.center
  && (card.config.center.key === key || (key.startsWith('m_') && quantum_enhancements(card).includes(key))));
/** SMODS.has_no_rank / has_no_suit: Stone cards and enhancements flagged no_rank / no_suit. */
export const has_no_rank = (card) => card.ability.effect === 'Stone Card' || !!card.config.center.no_rank;
export const has_no_suit = (card) => card.ability.effect === 'Stone Card' || !!card.config.center.no_suit;
/** SMODS.has_any_suit: Wild cards (not debuffed). */
export const has_any_suit = (card) => (card.ability.name === 'Wild Card' || has_enhancement(card, 'm_wild')) && !card.debuff;

/**
 * SMODS.get_probability_vars(card, num, dem, identifier) -> [numerator, denominator]: mod_probability
 * (Venonat), Oops! All 6s, fix_probability — the engine's probability_vars.
 */
export function get_probability_vars(card, base_numerator, base_denominator, identifier) {
  if (!G.jokers) return [base_numerator, base_denominator];
  return probability_vars(card, base_numerator, base_denominator, identifier);
}
/** SMODS.pseudorandom_probability(card, seed, num, dem, identifier): the roll succeeds. */
export function pseudorandom_probability(card, seed, base_numerator, base_denominator, identifier) {
  return probability_roll(card, seed, base_numerator, base_denominator, identifier);
}

/** SMODS.Ranks order (2..Ace); Ace -> 2 wraps for next/prev like Steamodded's rank table. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_ID = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, Jack: 11, Queen: 12, King: 13, Ace: 14 };
export const rank_next = (r) => { const i = RANKS.indexOf(r); return i < 0 ? [] : [RANKS[(i + 1) % RANKS.length]]; };
export const rank_prev = (r) => { const i = RANKS.indexOf(r); return i < 0 ? [] : [RANKS[(i + RANKS.length - 1) % RANKS.length]]; };
const RANK_CODE = { 10: 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
const SUIT_CODE = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };
/** SMODS.change_base(card, suit, rank): swap suit and/or rank keeping everything else. */
export function change_base(card, suit, rank) {
  const s = suit || card.base.suit;
  const r = rank || card.base.value;
  const key = SUIT_CODE[s] + '_' + (RANK_CODE[r] || r);
  if (!P_CARDS[key]) return false;
  card.set_base(P_CARDS[key]);
  return card;
}

/**
 * SMODS.create_card({set, area, key, rarity, legendary, edition, no_edition, skip_materialize,
 * soulable, key_append, stickers}) — the table-argument card factory Pokermon uses.
 */
export function smods_create_card(t) {
  const playing = t.set === 'Base' || t.set === 'Enhanced';
  // SMODS: playing cards (set Base / Enhanced) default to G.hand.
  const area = t.area || (playing ? G.hand : t.set === 'Joker' ? G.jokers : G.consumeables);
  const card = core_create_card(t.set || (t.key && P_CENTERS[t.key] && P_CENTERS[t.key].set) || 'Joker', area, t.legendary, t.rarity, t.skip_materialize, t.soulable, t.key || undefined, t.key_append);
  if (t.no_edition && card.edition) card.set_edition(null, true, true);
  if (t.edition) card.set_edition(t.edition, true, true);
  if (t.enhancement) card.set_ability(P_CENTERS[t.enhancement]);
  if (t.seal) card.set_seal(t.seal, true);
  return card;
}
/**
 * SMODS.debuff_card(card, debuff, source): debuff (true) / protect ('prevent_debuff') / clear (nil)
 * a card on behalf of `source` (ability.debuff_sources, read by Card.set_debuff); 'reset' forgets
 * every source without re-evaluating (the next blind's debuff pass does).
 */
export function smods_debuff_card(card, debuff, source) {
  if (debuff === 'reset') { card.ability.debuff_sources = {}; return; }
  const key = source && typeof source === 'object' ? 'card_' + source.sort_id : String(source);
  card.ability.debuff_sources = card.ability.debuff_sources || {};
  if (debuff === undefined || debuff === null || debuff === false) delete card.ability.debuff_sources[key];
  else card.ability.debuff_sources[key] = debuff;
  card.set_debuff();
}
/** SMODS.add_card(t): create and put it where it belongs (joker row / consumables). */
export function add_card(t) {
  const card = smods_create_card(t);
  const playing = t.set === 'Base' || t.set === 'Enhanced';
  if (playing) {
    G.playing_card = (G.playing_card || 0) + 1;
    card.playing_card = G.playing_card;
    G.playing_cards.push(card);
  }
  card.add_to_deck();
  (t.area || (playing ? G.hand : card.ability.set === 'Joker' ? G.jokers : G.consumeables)).emplace(card);
  return card;
}

// ---------------------------------------------------------- pokeutils.lua
export function pseudorandom_multi(args) {
  // Args: array(table), amt(num), seed(string), add_con(function), mod_func(function)
  const elements = [];
  const result = [];
  if (args.array) {
    for (const v of args.array) if (!args.add_con || args.add_con(v)) elements.push(v);
    pseudoshuffle(elements, args.seed ? pseudoseed(args.seed) : pseudoseed('default'));
    const amt = args.amt ? Math.min(elements.length, args.amt) : elements.length;
    for (let j = 0; j < amt; j++) {
      if (args.mod_func) args.mod_func(elements[j]);
      result.push(elements[j]);
    }
  }
  return result;
}

/** juice_flip* are card-flip animations — the flips are cosmetic in Micatro. */
export function juice_flip() {}
export function juice_flip_hand() {}
export function juice_flip_table() {}
export function juice_flip_single() {}
export function poke_debug() {}

export function poke_add_card(add_card, card, area) {
  if (!area) area = G.hand;
  add_card.add_to_deck();
  G.deck.config.card_limit = G.deck.config.card_limit + 1;
  G.playing_cards.push(add_card);
  area.emplace(add_card);
  G.E_MANAGER.add_event(() => add_card.start_materialize());
  playing_card_joker_effects([add_card]);
  return { message: localize('k_copied_ex'), colour: 'CHIPS', card, playing_cards_created: [true] };
}

export function poke_add_shop_card(add_card, card) {
  if (G.GAME.shop.joker_max === 1) G.shop_jokers.config.card_limit = G.GAME.shop.joker_max + 1;
  G.shop_jokers.emplace(add_card);
  add_card.start_materialize();
  add_card.set_cost();
  card.juice_up();
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_plus_shop'), colour: 'GREEN' });
}

export function poke_remove_card(target, card) {
  if (target.ability.name === 'Glass Card') target.shattered = true;
  else target.destroyed = true;
  G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.juice_up(0.3, 0.5); });
  G.E_MANAGER.add_event(() => {
    if (target.ability.name === 'Glass Card') target.shatter();
    else target.start_dissolve();
  });
  for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed: [target] });
  card.juice_up();
}

/** poke_vary_rank(card, decrease, seed, immediate): nil = random rank of its suit, true = down, false = up. */
export function poke_vary_rank(card, decrease, seed, immediate) {
  if (!card.base || !card.base.value || !card.base.suit || !RANK_ID[card.base.value]) return;
  let next_rank;
  if (decrease === undefined || decrease === null) {
    const poss = [];
    for (const v of Object.values(P_CARDS_LIST())) if (v.suit === card.base.suit) poss.push(v.value);
    if (poss.length) next_rank = pseudorandom_element(poss, pseudoseed(seed || 'random_rank'))[0];
  } else if (decrease) {
    const poss = rank_prev(card.base.value);
    if (poss.length) next_rank = pseudorandom_element(poss, pseudoseed(seed || 'decrease_rank'))[0];
  } else {
    const poss = rank_next(card.base.value);
    if (poss.length) next_rank = pseudorandom_element(poss, pseudoseed(seed || 'increase_rank'))[0];
  }
  if (immediate) change_base(card, null, next_rank);
  else G.E_MANAGER.add_event(() => change_base(card, null, next_rank));
}

export function poke_create_base_copy(selected) {
  for (let j = 1; j <= 2; j++) create_playing_card({ front: selected.config.card, center: P_CENTERS.c_base }, G.hand);
}

export function poke_get_adjacent_jokers(card) {
  const jokers = [];
  if (G.jokers.cards.length > 1) {
    const pos = G.jokers.cards.indexOf(card);
    if (pos > 0 && G.jokers.cards[pos - 1]) jokers.push(G.jokers.cards[pos - 1]);
    if (pos >= 0 && pos < G.jokers.cards.length - 1 && G.jokers.cards[pos + 1]) jokers.push(G.jokers.cards[pos + 1]);
  }
  return jokers;
}

/** -> [id, rank] of the next rank up that exists in the deck. */
export function poke_next_highest_rank(id, rank) {
  const rank_list = [];
  const owned = {};
  for (const v of G.playing_cards) {
    if (v.base && v.base.value && !has_no_rank(v) && !owned[v.base.value]) { rank_list.push(v.base.value); owned[v.base.value] = true; }
  }
  if (rank_list.length === 1) return [RANK_ID[rank], rank];
  let curr = rank, found;
  while (!found) {
    curr = rank_next(curr)[0];
    if (!curr || curr === rank) found = rank;
    else if (owned[curr]) found = curr;
  }
  if (found === rank) found = pseudorandom_element(rank_list, pseudoseed('next_highest_rank'))[0];
  return [RANK_ID[found], found];
}

export function poke_lowest_rank(id, rank) {
  const cards = G.playing_cards.filter((v) => v.get_id() && v.get_id() < id && !has_no_rank(v));
  if (cards.length) {
    cards.sort((a, b) => a.get_id() - b.get_id());
    return [cards[0].get_id(), cards[0].base.value];
  }
  return [id, rank];
}

/** Remember the last Item/Energy used (Twisted Spoon), two events later like the Lua. */
export function set_spoon_item(card) {
  const key = card.config.center_key;
  G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => { G.GAME.last_poke_item = key; }));
}

export function poke_conversion_event_helper(func, _delay, immediate) {
  if (immediate) func(); else G.E_MANAGER.add_event(func);
}

export function poke_convert_cards_to(cards, t, noflip, immediate) {
  if (!cards) return;
  if (cards instanceof Card) cards = [cards];
  const list = cards === G.hand.highlighted ? cards.slice() : cards;
  for (const c of list) {
    if (t.mod_conv) poke_conversion_event_helper(() => c.set_ability(P_CENTERS[t.mod_conv]), null, immediate);
    if (t.edition) poke_conversion_event_helper(() => c.set_edition(t.edition, true), null, immediate);
    if (t.suit_conv) poke_conversion_event_helper(() => c.change_suit(t.suit_conv), null, immediate);
    if (t.seal) poke_conversion_event_helper(() => c.set_seal(t.seal, null), null, immediate);
    if (t.random) poke_vary_rank(c, undefined, undefined, immediate);
    if (t.up || t.down) poke_vary_rank(c, !t.up, undefined, immediate);
    if (t.bonus_chips) poke_conversion_event_helper(() => { c.ability.perma_bonus = (c.ability.perma_bonus || 0) + t.bonus_chips; }, null, immediate);
  }
  if (cards === G.hand.highlighted) poke_conversion_event_helper(() => G.hand.unhighlight_all());
}

export function poke_unhighlight_cards() { G.E_MANAGER.add_event(() => G.hand.unhighlight_all()); }

export const poke_is_in_collection = () => false;

export function poke_stabilize_chip_drain(card) {
  if (!card || !card.ability || !card.base || !card.base.nominal || card.ability.bonus === undefined) return;
  card.ability.nominal_drain = Math.min(card.ability.nominal_drain || 0, card.base.nominal - 1);
  card.ability.perma_bonus = Math.max(card.ability.perma_bonus || 0, -card.ability.bonus);
}

/** Add ratio-based (1 per `ratio` non-hazard cards) or flat Hazard cards to the deck. */
export function poke_add_hazards(ratio, flat) {
  const hazards = [];
  flat = flat || 0;
  let count = G.playing_cards.length;
  for (const v of G.playing_cards) if (has_enhancement(v, 'm_poke_hazard')) count--;
  const to_add = ratio ? Math.floor(count / ratio) : flat;
  for (let i = 1; i <= to_add; i++) {
    const c = create_playing_card({ front: pseudorandom_element(P_CARDS_LIST(), pseudoseed('qwilfish'))[0], center: P_CENTERS.m_poke_hazard }, G.deck);
    hazards.push(c);
    if (G.GAME.blind) G.GAME.blind.debuff_card(c);
  }
  playing_card_joker_effects(hazards);
}

export function poke_set_hazards(amount) {
  for (let i = 1; i <= amount; i++) {
    const valid = G.deck.cards.filter((v) => v.config.center === P_CENTERS.c_base);
    if (valid.length) {
      const [card] = pseudorandom_element(valid, pseudoseed('hazard'));
      card.set_ability(P_CENTERS.m_poke_hazard, null, true);
    }
  }
}

export function poke_same_suit(hand) {
  for (const suit of ['Spades', 'Hearts', 'Clubs', 'Diamonds']) {
    let n = 0;
    for (const c of hand) if (c.is_suit(suit, null, true)) n++;
    if (n === hand.length) return true;
  }
  return false;
}

export function poke_get_rank(card) {
  const id = card.base.id;
  if (id === 14) return 'Ace';
  if (id === 13) return 'King';
  if (id === 12) return 'Queen';
  if (id === 11) return 'Jack';
  return '' + id;
}

/** Magikarp / Feebas / Luvdisc: every played card scores (like Splash). */
export function applies_splash() {
  return any(find_card('j_poke_magikarp')) || any(find_card('j_poke_feebas')) || any(find_card('j_poke_luvdisc'));
}

export const poke_is_even = (card) => [2, 4, 6, 8, 10].includes(card.get_id());
export const poke_is_odd = (card) => [3, 5, 7, 9, 14].includes(card.get_id());

export function poke_suit_check(hand, num) {
  const suits = {};
  let n = 0;
  const SUITS4 = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
  for (const v of hand) for (const s of SUITS4) if (!has_any_suit(v) && v.is_suit(s) && !suits[s]) { suits[s] = true; n++; break; }
  for (const v of hand) for (const s of SUITS4) if (has_any_suit(v) && v.is_suit(s) && !suits[s]) { suits[s] = true; n++; break; }
  return n >= num;
}

// ----------------------------------------------------- pokefunctions bits
/** Add-on extension point (additive; empty = Pokermon unchanged): fn(card, skip) -> 'no_destroy' to cancel remove(). */
export const BEFORE_REMOVE = [];
/** remove(self, card, context, check_shiny): the "fainted/eaten" self-destruct. */
export function remove(self, card, context, check_shiny, skip_joker_type_destroyed) {
  // Add-on overrides of remove (Nacho's Passimian): fire joker_type_destroyed first; a
  // {no_destroy} answer cancels the removal.
  for (const f of BEFORE_REMOVE) if (f(card, skip_joker_type_destroyed) === 'no_destroy') return undefined;
  // check_shiny: the shiny booster slot goes back here — the card leaves the joker row before
  // Card:remove, so the shiny card_removed hook doesn't see it (same as the Lua).
  if (check_shiny && card.edition && card.edition.poke_shiny) smods_change_booster_limit(-1);
  play_sound('tarot1');
  card.juice_up(0.3, 0.4);
  G.E_MANAGER.add_event(() => {
    emit('dissolve', { card: card.sort_id, reason: 'removed' });
    G.jokers.remove_card(card);
    card.remove();
  });
  card.gone = true;
  return true;
}

/** Total chips a playing card scores before jokers (rank + bonus + edition). */
export function poke_total_chips(card) {
  let total = card.ability.bonus + (card.ability.perma_bonus || 0);
  if (card.ability.effect !== 'Stone Card' && !card.config.center.replace_base_card) total += card.base.nominal;
  if (card.edition) total += card.edition.chips || 0;
  return total;
}

/** Drain sell value from `target` into `card` (one_way: just drain). */
export function poke_drain(card, target, amount, one_way) {
  const amt = amount;
  let amt_drained = 0;
  if (target.sell_cost === 1) return;
  target.ability.extra_value = target.ability.extra_value || 0;
  if (target.sell_cost <= amt) {
    amt_drained = amt_drained + target.sell_cost - 1;
    target.ability.extra_value = target.ability.extra_value - amt_drained;
  } else {
    target.ability.extra_value = target.ability.extra_value - amt;
    amt_drained = amt;
  }
  if (amt_drained > 0) {
    target.set_cost();
    card_eval_status_text(target, 'extra', null, null, null, { message: localize('poke_val_down'), colour: 'RED' });
    if (!one_way) {
      card.ability.extra_value = (card.ability.extra_value || 0) + amt_drained;
      card.set_cost();
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_val_up') });
    }
  }
}

/**
 * poke_draw_one(): draw one card from the deck, then re-fire Steamodded's draw contexts
 * (first_hand_drawn on the round's first draw, hand_drawn while facing a blind).
 */
export function poke_draw_one() {
  G.drawn_cards = G.drawn_cards || [];
  draw_card(G.deck, G.hand, null, null, true);
  G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => {
    if (G.drawn_cards && G.drawn_cards.length) {
      const drawn = G.drawn_cards; G.drawn_cards = [];
      const ctx = {};
      if (!G.GAME.current_round.any_hand_drawn && G.GAME.facing_blind) ctx.first_hand_drawn = true;
      if (G.GAME.facing_blind) ctx.hand_drawn = drawn; else ctx.other_drawn = drawn;
      calculate_context(ctx);
      if (G.GAME.facing_blind) G.GAME.current_round.any_hand_drawn = true;
    }
  }));
}

/** Politoed line: cycle G.GAME.poke_poli_suit Spades -> Hearts -> Clubs -> Diamonds. */
export function poke_change_poli_suit() {
  if (!G.GAME.poke_poli_suit_change_triggered) {
    const suits = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
    if (G.GAME.poke_poli_suit) {
      const i = suits.indexOf(G.GAME.poke_poli_suit);
      G.GAME.poke_poli_suit = suits[(i + 1) % suits.length];
    } else G.GAME.poke_poli_suit = 'Hearts';
  }
}

/** G.C colour names Pokermon returns (kept as strings; the renderer maps them). */
export const C = {
  MULT: 'MULT', CHIPS: 'CHIPS', XMULT: 'XMULT', MONEY: 'MONEY', RED: 'RED', GREEN: 'GREEN', FILTER: 'FILTER',
  PURPLE: 'PURPLE', BLUE: 'BLUE', BLACK: 'BLACK', DARK_EDITION: 'DARK_EDITION', SECONDARY_SET: { Tarot: 'Tarot', Planet: 'Planet', Spectral: 'Spectral', Enhanced: 'Enhanced' },
};


// ------------------------------------------- pokefunctions.lua: "nature" target ranks
/**
 * get_poke_target_card_ranks(seed, num, default, use_deck): `num` target ranks sorted by id —
 * random distinct ranks (pseudorandom_multi, seed 'default' like the Lua), or picked from the
 * deck's non-Stone cards when use_deck. Returns `default` outside a run.
 */
export function get_poke_target_card_ranks(seed, num, _default, use_deck) {
  let target_ranks = [];
  let valid_cards = [];
  if (!G.playing_cards) return _default;
  if (use_deck) {
    for (let i = 1; i <= num; i++) {
      for (const v of G.playing_cards) {
        if (v.ability.effect !== 'Stone Card') {
          let already_picked = false;
          for (const t of target_ranks) if (t.id === v.base.id) { already_picked = true; break; }
          if (!already_picked) valid_cards.push(v);
        }
      }
      if (valid_cards.length > 0) {
        const [picked] = pseudorandom_element(valid_cards, pseudoseed(seed));
        target_ranks.push({ value: picked.base.value, id: picked.base.id });
        valid_cards = [];
      } else if (target_ranks.length > 0) target_ranks.push(target_ranks[0]);
      else target_ranks.push({ value: 'Ace', id: 14 });
    }
  } else {
    const random = [];
    for (let i = 2; i <= 14; i++) {
      const cvalue = i === 11 ? 'Jack' : i === 12 ? 'Queen' : i === 13 ? 'King' : i === 14 ? 'Ace' : '' + i;
      random.push({ value: cvalue, id: i });
    }
    target_ranks = pseudorandom_multi({ array: random, amt: num });
  }
  target_ranks.sort((a, b) => a.id - b.id);
  return target_ranks;
}
/** add_target_cards_to_vars(vars, targets): append each target's localized rank to a loc_vars list. */
export function add_target_cards_to_vars(vars, targets) {
  for (const t of targets) vars.push(localize(t.value || 'Ace', 'ranks'));
}

// ------------------------------------------- SMODS hand-limit API (src/utils.lua)
/** SMODS.change_play_limit(mod): most cards a played hand may hold (the 'play' action checks it). */
export function change_play_limit(mod) {
  const sp = G.GAME.starting_params;
  sp.play_limit = (sp.play_limit ?? 5) + mod;
  G.hand.config.highlighted_limit = Math.max(sp.discard_limit ?? 5, sp.play_limit, 5);
}
/** SMODS.change_discard_limit(mod): most cards one discard may hold (the 'discard' action checks it). */
export function change_discard_limit(mod) {
  const sp = G.GAME.starting_params;
  sp.discard_limit = (sp.discard_limit ?? 5) + mod;
  G.hand.config.highlighted_limit = Math.max(sp.discard_limit, sp.play_limit ?? 5, 5);
}
