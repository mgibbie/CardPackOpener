// Bunco — core systems (Bunco.lua + lovely.toml), ported line for line:
//  * Exotic suits: Fleurons and Halberds (SMODS.Suit, Bunco.lua ~5823-5875) — `hidden`, out of the starting
//    deck, and out of random card picks until the Exotic System is enabled (G.GAME.Exotic: The Sky / The Abyss,
//    the Fairy deck, Filigree Tag, ...). Bunco re-sorts SMODS.Suit.obj_buffer to Halberds, Fleurons, Diamonds,
//    Clubs, Hearts, Spades (util.SUIT_BUFFER); suit nominals follow registration order (0.05 / 0.06).
//    A Smeared Joker never smears an exotic suit (lovely "Myopia & Astigmatism" patch, last part).
//  * Poker hands (Bunco.lua ~6035-6293): the Spectrum part (5+ cards, every one a different suit — wilds
//    take any free suit), Spectrum, Straight Spectrum (Royal Spectrum), Spectrum House, Spectrum Five, and
//    the Deal part / hand (the 5 ranks Registration Plate picked; its chips & mult are the sum of every
//    visible played hand's, level 0, never leveled up). Order in the hand list = Steamodded's mult*chips sort
//    (run.js rebuild_handlist).
//  * Linked cards (Bunco.lua ~4867-5042 + lovely "Linked cards ..."): a group is selected / deselected
//    together, can't be picked when it won't fit the selection (unless it's bigger than the limit and nothing
//    else is selected), is drawn together (the rest of the group follows a drawn card out of the deck), plays
//    past the 5-card limit when the group is bigger, and is destroyed together.
//  * The 8 (lovely "Linked cards selection"): while it is the selected consumable, any number of hand cards can
//    be selected (G.GAME.THE_8_BYPASS) — set by the 'use' action's targets and by the bunc_select action.
//  * Card:highlight side effects (The Gate, The Veil, Trigger Finger -> 'card_highlighted' on the bus) and
//    CardArea:remove_from_highlighted's (Fluorescent, The Gate).
//  * Temporary extra chips (Bunco.lua ~763): ability.temporary_extra_chips adds to a card's chips until the
//    end of the round.
//  * Cassette / Fluorescent flips (lovely "Card:flip() (Cassette)", "Fluorescent edition 1/3").
import { G, P_CENTERS, find_joker, eval_card, emit, draw_card } from '../../js/engine/core.js';
import LOC from './loc.js';
import { STATES, merge_lists } from '../../js/engine/run.js';
import {
  MOD_ID, FLEURONS, HALBERDS, SUIT_BUFFER, is_exotic_suit, exotic_in_pool, group_of, emitB, find, localize,
} from './util.js';

// ------------------------------------------------------------------ suits
const exotic_in_pool_suit = (s, args) => (args && args.initial_deck ? false : exotic_in_pool());
export const suits = [
  { key: FLEURONS, card_key: 'bunc_FLEURON', name: 'Fleurons', hidden: true, pos: { x: 0, y: 0 }, ui_pos: { x: 0, y: 0 },
    atlas: 'bunco_cards', hc_atlas: 'bunco_cards_hc', ui_atlas: 'bunco_suits', hc_ui_atlas: 'bunco_suits_hc',
    colour: '#d6901a', hc_colour: '#dbb529', nominal: 0.05, in_pool: exotic_in_pool_suit },
  { key: HALBERDS, card_key: 'bunc_HALBERD', name: 'Halberds', hidden: true, pos: { x: 0, y: 1 }, ui_pos: { x: 1, y: 0 },
    atlas: 'bunco_cards', hc_atlas: 'bunco_cards_hc', ui_atlas: 'bunco_suits', hc_ui_atlas: 'bunco_suits_hc',
    colour: '#6e3c63', hc_colour: '#993283', nominal: 0.06, in_pool: exotic_in_pool_suit },
];

// ------------------------------------------------------------- poker hands
/** SMODS.PokerHandPart 'bunc_spectrum' (Bunco.lua ~6037, referenced from SixSuits). */
export function spectrum_part(hand) {
  const suits = {};
  for (const v of SUIT_BUFFER) suits[v] = 1;
  if (hand.length < 5) return [];
  // (5.4.8b "Fix spectrum detection when playing 6+ cards": up to #hand - 5 cards may add no new suit)
  let extraCardsAllowed = hand.length - 5;
  const nonwilds = [];
  for (const card of hand) {
    const cardsuits = [];
    for (const v of SUIT_BUFFER) if (card.is_suit(v, null, true)) cardsuits.push(v);
    if (cardsuits.length === 0) {
      if (extraCardsAllowed <= 0) return [];
      extraCardsAllowed--;
    } else if (cardsuits.length === 1) {
      if (suits[cardsuits[0]] === 0) {
        if (extraCardsAllowed <= 0) return [];
        extraCardsAllowed--;
      }
      suits[cardsuits[0]] = 0;
    } else if (cardsuits.length < 5) nonwilds.push(cardsuits);
  }
  const isSpectrum = (i, remaining) => {
    if (i === nonwilds.length) return true;
    const newremaining = { ...remaining };
    for (const suit of nonwilds[i]) {
      if (remaining[suit] === 1) {
        newremaining[suit] = 0;
        if (isSpectrum(i + 1, newremaining)) return true;
        newremaining[suit] = 1;
      }
    }
    return false;
  };
  return isSpectrum(0, suits) ? [hand] : [];
}
/**
 * SMODS.PokerHandPart 'bunc_deal' (5.4.8b): 5+ cards, every card one of a Registration Plate's ranks and at least as many
 * of each rank as the Plate names (5.1 wanted the exact 5: a 6-card hand was never a Deal). Unlike 5.4.8b, a Plate that
 * doesn't match moves on to the next Plate (the fork returns from the whole part on the first mismatch).
 */
export function deal_part(hand) {
  if (hand.length < 5) return [];
  const count = (list) => { const m = new Map(); for (const v of list) m.set(v, (m.get(v) || 0) + 1); return m; };
  const deals = [];
  if (G.jokers) for (const v of G.jokers.cards) if (v.config.center.key === 'j_bunc_registration_plate' && !v.debuff) deals.push(v.ability.extra.ranks || []);
  for (const deal of deals) {
    const deal_count = count(deal);
    const hand_count = count(hand.map((c) => c.get_id()).filter((id) => deal_count.has(id)));
    let equal = hand.every((c) => deal_count.has(c.get_id()));
    if (equal) for (const [k, n] of deal_count) if ((hand_count.get(k) || 0) < n) { equal = false; break; }
    if (equal) {
      const self = G.GAME.hands.bunc_Deal;
      self.chips = 0; self.mult = 0; self.level = 0;
      for (const [k, v] of Object.entries(G.GAME.hands)) {
        if (v.visible && v.played > 0 && v !== self) { self.chips += v.chips; self.mult += v.mult; }
      }
      return [hand];
    }
  }
  return [];
}
export const poker_hand_parts = [
  { key: 'bunc_spectrum', func: spectrum_part },
  { key: 'bunc_deal', func: deal_part },
];
const next = (t) => !!(t && t.length);
const royal = (scoring_hand) => scoring_hand.every((c) => ['Ace', '10', 'Jack', 'Queen', 'King'].includes(c.base.value));
export const poker_hands = [
  { key: 'bunc_Spectrum', visible: false, chips: 50, mult: 6, l_chips: 20, l_mult: 2,
    example: [['S_2', true], ['D_7', true], ['C_3', true], ['bunc_FLEURON_5', true], ['H_K', true]],
    evaluate: (parts) => parts.bunc_spectrum },
  { key: 'bunc_Straight Spectrum', visible: false, chips: 120, mult: 10, l_chips: 45, l_mult: 4,
    example: [['S_Q', true], ['bunc_FLEURON_J', true], ['C_T', true], ['D_9', true], ['H_8', true]],
    evaluate: (parts) => (!next(parts.bunc_spectrum) || !next(parts._straight) ? [] : [merge_lists(parts.bunc_spectrum, parts._straight)]),
    modify_display_text: (self, _cards, scoring_hand) => (royal(scoring_hand) ? self.key + ' (Royal)' : undefined) },
  { key: 'bunc_Spectrum House', above_hand: 'Flush House', visible: false, chips: 150, mult: 15, l_chips: 40, l_mult: 4,
    example: [['S_Q', true], ['bunc_FLEURON_Q', true], ['C_Q', true], ['D_8', true], ['H_8', true]],
    evaluate: (parts) => (parts._3.length < 1 || parts._2.length < 2 || !next(parts.bunc_spectrum) ? [] : [merge_lists(parts._all_pairs, parts.bunc_spectrum)]) },
  { key: 'bunc_Spectrum Five', above_hand: 'Flush Five', visible: false, chips: 180, mult: 18, l_chips: 55, l_mult: 3,
    example: [['S_7', true], ['D_7', true], ['bunc_FLEURON_7', true], ['H_7', true], ['C_7', true]],
    evaluate: (parts) => (!next(parts._5) || !next(parts.bunc_spectrum) ? [] : [merge_lists(parts._5, parts.bunc_spectrum)]) },
  { key: 'bunc_Deal', above_hand: 'bunc_Spectrum Five', visible: false, no_collection: true, chips: 0, mult: 0, l_chips: 0, l_mult: 0, example: [],
    evaluate: (parts) => parts.bunc_deal },
];

// ------------------------------------------------------------- linked cards
const in_draw = () => G.STATE === STATES.DRAW_TO_HAND;
const gate_on = () => G.GAME.blind && G.GAME.blind.name === 'bl_bunc_gate' && !G.GAME.blind.disabled;
/** Card:highlight(true) side effects for a hand card (lovely: The Veil, The Gate, Trigger Finger). */
function highlighted_side_effects(card) {
  if (!card.highlighted || card.area !== G.hand) return;
  // The Veil: the selected card (and its linked group) turns face down.
  if (G.GAME.blind && G.GAME.blind.name === 'bl_bunc_veil' && !G.GAME.blind.disabled) {
    if (card.ability.group) {
      for (const gc of G.hand.cards) {
        if (gc.ability && gc.ability.group && gc.ability.group.id === card.ability.group.id && gc !== card && gc.facing === 'front') gc.flip();
      }
    }
    if (card.facing === 'front') { card.flip(); G.GAME.blind.wiggle(); }
  }
  // The Gate: a selected card stays selected.
  if (gate_on()) card.ability.forced_selection = true;
  // Trigger Finger
  emitB('card_highlighted', card);
}
function add_to_highlighted(area, card, silent) {
  if (in_draw()) return true; // (Bunco's wrapper: nothing is selected while cards are being drawn)
  if (card.ability.group && area) {
    const group = area.config.type === 'hand' ? area.cards.filter((c) => c.ability.group && c.ability.group.id === card.ability.group.id && !c.highlighted) : [];
    group.forEach((c, i) => {
      if (i !== group.length - 1) {
        area.highlighted.push(c);
        c.highlighted = true;
        if (gate_on() && area === G.hand) c.ability.forced_selection = true; // (The Gate fix)
      } else {
        area.add_to_highlighted(c, silent === undefined ? false : silent);
        highlighted_side_effects(c);
      }
    });
    return true;
  }
  area.add_to_highlighted(card, silent);
  highlighted_side_effects(card);
  return true;
}
/** CardArea:remove_from_highlighted's own patches (Fluorescent edition 2/3, The Gate 2/2) before the vanilla body. */
function pre_remove(area, card, force) {
  if (card.edition && card.edition.bunc_fluorescent) card.ability.forced_selection = false;
  if (G.GAME.blind && G.GAME.blind.name === 'bl_bunc_gate' && !force && card.area === G.hand) {
    if (G.GAME.blind.disabled) card.ability.forced_selection = false;
    else if (card.ability.forced_selection === true) G.GAME.blind.wiggle();
  }
}
function remove_from_highlighted(area, card, force) {
  if (card.ability.group && area && !force) {
    const group = area.config.type === 'hand' ? area.cards.filter((c) => c.ability.group && c.ability.group.id === card.ability.group.id) : [];
    group.forEach((c, i) => {
      const k = area.highlighted.indexOf(c);
      if (k >= 0) area.highlighted.splice(k, 1);
      c.highlighted = false;
      if (i === group.length - 1) { pre_remove(area, c, force); area.remove_from_highlighted(c, force); }
    });
    return true;
  }
  pre_remove(area, card, force);
  return undefined; // the vanilla body
}
/** CardArea:can_highlight (lovely "Linked cards selection 1/2"). */
function can_highlight(area, card) {
  if (card && area === G.hand && G.GAME && G.GAME.THE_8_BYPASS) return true;
  if (card && card.ability.group) {
    let group_amount = 0, highlighted_amount = 0;
    for (const c of area.cards) {
      if (c.ability.group && c.ability.group.id === card.ability.group.id && !c.highlighted) group_amount++;
      if (c.highlighted) highlighted_amount++;
    }
    const limit = area.config.highlighted_limit;
    if (!card.highlighted && group_amount > limit) return highlighted_amount === 0 ? true : false;
    if (!card.highlighted && limit < group_amount + highlighted_amount) return false;
  }
  return undefined;
}
/** The linked-card draw (Bunco.lua's G.FUNCS.draw_from_deck_to_hand wrap): a group follows its drawn card. */
function draw_linked() {
  G.E_MANAGER.add_event(() => {
    const groups = [];
    for (const card of G.hand.cards) {
      if (card.ability.group && !groups.some((g) => g.id === card.ability.group.id)) groups.push(card.ability.group);
    }
    const cards_from_groups = [];
    for (const group of groups) {
      for (let n = G.deck.cards.length - 1; n >= 0; n--) {
        const card = G.deck.cards[n];
        if (card.ability.group && card.ability.group.id === group.id) cards_from_groups.push(card);
      }
    }
    cards_from_groups.forEach((card, i) => {
      if (G.deck.cards.includes(card)) { draw_card(G.deck, G.hand, (i + 1) * 100 / cards_from_groups.length, 'up', true, card); }
    });
    // (5.4.8b: Games Collector hears of every group that reaches the hand — counted once per group per round by the
    // joker — not only when a card had to be pulled from the deck; 5.1 re-counted every group in hand on each pull)
    if (groups.length && G.jokers) {
      for (const v of G.jokers.cards.slice()) if (v.config.center.key === 'j_bunc_games_collector' && !v.debuff) v.calculate_joker({ groups_drawn: groups });
    }
  });
}
/** A linked group is destroyed together (lovely "Linked cards destruction"). */
function destroy_group(card) {
  if (!card.ability.group || !G.playing_cards || !G.playing_cards.length) return;
  const id = card.ability.group.id;
  const destroyed_cards = G.playing_cards.filter((c) => c.ability.group && c.ability.group.id === id && !c.destroyed && !c.shattered);
  // (Micatro dissolves at once, so the flags go on first — in the Lua the removal waits for an event)
  for (const c of destroyed_cards) { if (c.config.center.key === 'm_glass') c.shattered = true; else c.destroyed = true; }
  for (const next_card of destroyed_cards) {
    if (next_card.shattered) next_card.shatter(); else next_card.start_dissolve();
    for (const j of G.jokers.cards.slice()) eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: [next_card] });
  }
}

// -------------------------------------------------------------- the hooks
export const hooks = {
  init_game_object(GAME) {
    GAME.current_round.most_played_rank = '2'; // (The Tine 3/3)
    GAME.current_round.least_played_poker_hand = 'High Card'; // (The Mask 2/2)
  },
  // ---- exotic suits
  flush_suits: (suits) => [...suits, ...SUIT_BUFFER.filter((s) => is_exotic_suit(s) && !suits.includes(s))],
  is_suit(card, suit) {
    // A Smeared Joker never smears an exotic suit (both ways).
    if (!G.jokers || !G.jokers.cards.some((v) => v.ability.name === 'Smeared Joker' && !v.debuff)) return undefined;
    const b = card.base.suit;
    if (is_exotic_suit(b) && suit !== b) return false;
    if (!is_exotic_suit(b) && is_exotic_suit(suit)) return false;
    return undefined;
  },
  // ---- poker hands
  level_up_hand: (card, hand) => (hand === 'bunc_Deal' ? false : undefined),
  // ---- linked cards
  add_to_highlighted,
  remove_from_highlighted,
  can_highlight: (area, card) => can_highlight(area, card),
  highlight_limit: (limit, area, card) => ((card && card.ability.group) || (G.GAME && G.GAME.THE_8_BYPASS) ? Infinity : undefined),
  selection_limit(n, kind) {
    const lim = G.hand.config.highlighted_limit;
    if (kind === 'play') {
      const group_size = G.hand.highlighted.filter((c) => c.ability.group).length;
      return group_size > lim ? Infinity : undefined;
    }
    if (kind === 'discard') return G.GAME.THE_8_BYPASS ? lim : Infinity;
    return undefined;
  },
  draw_from_deck_to_hand: () => draw_linked(),
  card_removed_after: (card) => destroy_group(card),
  use_targets(card) { if (card.config.center.key === 'c_bunc_the_8') G.GAME.THE_8_BYPASS = true; },
  action(a) {
    // Select / deselect a consumable (The 8: while selected, any number of hand cards may be selected).
    if (a.type !== 'bunc_select') return undefined;
    const c = G.consumeables.cards.find((x) => x.sort_id === a.id);
    if (!c) return 'no such consumable';
    const on = a.on === undefined ? !G.consumeables.highlighted.includes(c) : !!a.on;
    if (!on) G.consumeables.remove_from_highlighted(c);
    else if (!G.consumeables.highlighted.includes(c)) G.consumeables.add_to_highlighted(c);
    emit('highlight', { area: 'consumeables', ids: G.consumeables.highlighted.map((x) => x.sort_id) });
    return true;
  },
  update() {
    // Game:update: THE_8_BYPASS is false unless The 8 is the selected consumable (its Card:update).
    if (G.GAME) G.GAME.THE_8_BYPASS = !!(G.consumeables && G.consumeables.highlighted.some((c) => c.config.center.key === 'c_bunc_the_8'));
  },
  // ---- flips
  flip(card) {
    if ((card.area === G.hand || card.area === G.jokers || card.area === G.consumeables) && card.edition && card.edition.bunc_fluorescent) return false;
    if (card.config.center.key === 'j_bunc_cassette') { card.calculate_joker({ flip: true }); return false; }
    return undefined;
  },
  // ---- temporary extra chips
  chip_bonus: (ret, card) => ret + (card.ability && !card.debuff && card.ability.temporary_extra_chips ? card.ability.temporary_extra_chips : 0),
  end_round_start() { for (const v of G.playing_cards) if (v.ability && v.ability.temporary_extra_chips) v.ability.temporary_extra_chips = undefined; },
  // ---- descriptions: linked group + temporary chips on playing cards
  describe(card, desc) {
    if (!card || !card.ability || !(card.ability.set === 'Default' || card.ability.set === 'Enhanced') || card.debuff) return;
    const other = (k, vars) => (LOC.descriptions.Other[k].text || []).map((l) => l.replace(/#(d+)#/g, (m, n) => (vars && vars[n - 1] !== undefined ? String(vars[n - 1]) : m)));
    if (card.ability.temporary_extra_chips) desc.lines = [...(desc.lines || []), ...other('bunc_temporary_extra_chips', [card.ability.temporary_extra_chips])];
    if (card.ability.group) {
      desc.lines = [...(desc.lines || []), ...other(card.greyed ? 'bunc_drawn_linked_cards' : 'bunc_linked_cards')];
      desc.linked = group_of(card, card.area || G.deck).map((c) => c.sort_id);
      desc.info = [...(desc.info || []), { key: 'bunc_linked_group', name: LOC.descriptions.Other.bunc_linked_group.name, lines: other('bunc_linked_group') }];
    }
  },
  view_card(card, v) {
    // The 8: the UI tells the engine when it is (de)selected (its selection lifts the hand's limit)
    if (card.config.center.key === 'c_bunc_the_8' && card.area === G.consumeables) v.select_action = { type: 'bunc_select', id: card.sort_id };
    const lines = [];
    const fill = (k, vars) => (LOC.descriptions.Other[k].text || []).map((l) => l.replace(/#(d+)#/g, (m, n) => (vars && vars[n - 1] !== undefined ? String(vars[n - 1]) : m)));
    if (card.ability && card.ability.group) {
      v.group = card.ability.group.id;
      lines.push(...fill('bunc_linked_cards'), '{C:inactive}(' + group_of(card, card.area || G.deck).length + ' cards)');
    }
    if (card.ability && card.ability.temporary_extra_chips && !card.debuff) { v.temp_chips = card.ability.temporary_extra_chips; lines.push(...fill('bunc_temporary_extra_chips', [card.ability.temporary_extra_chips])); }
    if (lines.length) v.mod_lines = [...(v.mod_lines || []), ...lines];
  },
};
export { MOD_ID, find, find_joker, P_CENTERS };
