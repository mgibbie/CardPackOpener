// More Fluff — Superboss (other/superboss.lua + lovely/superboss.toml): The Ticket ($10 to TAKE) shows up
// in the shop before the winning ante (ante == win_ante after its first boss, i.e. after the ante-7 boss);
// redeeming it "upgrades Ante 8": blind scaling +3, Small -> Bigger Blind, Big -> a regular (finisher) boss,
// Boss -> one of 15 DX bosses. Only the DX boss wins the run / ends the ante; winning it switches Superboss
// off again. Skip tags are hidden (no skipping) while it is on, and DUEL ZONE plays (extras.js view hook).
// The DX bosses also appear on their own as showdown bosses past the win ante (ante 16, 24, ... in Endless).
//   + the "Better Balatro II" challenge's data (superboss_always): registered as data; challenge UI later.
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_BLINDS, P_CENTERS, pseudorandom, pseudorandom_element, pseudoseed, ease_hands_played, ease_discard,
  number_format, level_up_hand, get_new_boss, draw_card,
} from '../../js/engine/core.js';
import { draw_from_deck_to_hand, discard_cards_from_highlighted } from '../../js/engine/run.js';
import { DATA, center_card } from './util.js';

const SUPER = { superboss: true, akyrs_blind_difficulty: 'dx', akyrs_cannot_be_disabled: true };
const BOSS = { min: 9, max: 10, showdown: true };
const live = (b) => G.GAME.blind && G.GAME.blind.config.blind === b; // (the hook's blind is the live one)
const after_win_ante = () => G.GAME.round_resets.ante > G.GAME.win_ante;
const dx = (slug, name, y, extra = {}) => ({
  key: 'bl_mf_' + slug, name, dollars: 10, mult: 3, vars: [], pos: { x: 0, y }, boss: BOSS, boss_colour: '#ac3232',
  atlas: 'mf_blinds', ...extra, debuff: { ...SUPER, ...(extra.debuff || {}) }, in_pool: after_win_ante,
});
/** All non-suit cards of `suit` are debuffed (recalc_debuff -> the engine's mod debuff_card). */
const suit_dx = (suit) => (self, b, card) => !card.is_suit(suit);
/** FIX (intended design): the Lua's hook-discard (G.FUNCS.discard_cards_from_highlighted(nil, true)) never
 *  draws again, so House DX / Hook DX left an EMPTY hand and the round could not go on. The hand is
 *  redrawn after the discard (the mod's own test house_dx_discards expects the deck drawn through). */
function discard_hand_and_redraw() {
  G.hand.highlighted.length = 0;
  for (const v of G.hand.cards) { G.hand.highlighted.push(v); v.highlighted = true; }
  discard_cards_from_highlighted(true);
  G.E_MANAGER.add_event(() => draw_from_deck_to_hand());
}

export const blinds = [
  {
    key: 'bl_mf_bigger_blind', name: 'Bigger Blind', blind_type: 'Small', dollars: 6, mult: 1, vars: [], debuff: {}, pos: { x: 0, y: 0 },
    boss_colour: '#793aab', atlas: 'mf_blinds', in_pool: () => false,
  },
  dx('violet_vessel_dx', 'Violet Vessel DX', 1, {
    mult: 24,
    disable(self, b) { b.chips = BN.div(b.chips, 8); b.chip_text = number_format(b.chips); },
  }),
  dx('cerulean_bell_dx', 'Cerulean Bell DX', 2, {
    debuff: { force_select_count: 3 },
    loc_vars: (self) => ({ vars: [self.debuff.force_select_count] }),
    disable() { for (const v of G.playing_cards) v.ability.forced_selection = undefined; },
    drawn_to_hand(self, b) {
      if (G.hand.cards.some((v) => v.ability.forced_selection)) return;
      G.hand.unhighlight_all();
      const pool = G.hand.cards.slice();
      for (let i = 0; i < b.debuff.force_select_count; i++) {
        if (!pool.length) break;
        const [c] = pseudorandom_element(pool, pseudoseed('cerulean_bell_dx'));
        pool.splice(pool.indexOf(c), 1);
        c.ability.forced_selection = true;
        G.hand.add_to_highlighted(c);
      }
    },
  }),
  dx('needle_dx', 'The Needle DX', 3, {
    mult: 1,
    set_blind(self, b) {
      b.hands_sub = G.GAME.round_resets.hands - 1;
      ease_hands_played(-b.hands_sub);
      b.discards_sub = G.GAME.round_resets.discards - 1;
      ease_discard(-b.discards_sub);
      G.GAME.current_round.discards_used += b.discards_sub;
    },
    disable(self, b) {
      ease_hands_played(b.hands_sub);
      ease_discard(b.discards_sub);
      G.GAME.current_round.discards_used -= b.discards_sub;
    },
  }),
  dx('manacle_dx', 'The Manacle DX', 4, {
    set_blind() { G.hand.change_size(-3); },
    defeat(self, b) { if (!b.disabled) G.hand.change_size(3); },
    disable(self, b) { G.hand.change_size(3); draw_from_deck_to_hand(3); },
  }),
  dx('pillar_dx', 'The Pillar DX', 5, {
    set_blind() {
      for (const card of G.playing_cards) if (card.ability.mf_played_this_game && pseudorandom('pillar_dx') < 1 / 2) card.ability.mf_played_this_game = false;
    },
    debuff_card: (self, b, card) => !!card.ability.mf_played_this_game,
  }),
  dx('serpent_dx', 'The Serpent DX', 6),
  dx('club_dx', 'The Club DX', 7, { debuff_card: suit_dx('Clubs') }),
  dx('goad_dx', 'The Goad DX', 8, { debuff_card: suit_dx('Spades') }),
  dx('window_dx', 'The Window DX', 9, { debuff_card: suit_dx('Diamonds') }),
  dx('head_dx', 'The Head DX', 10, { debuff_card: suit_dx('Hearts') }),
  dx('arm_dx', 'The Arm DX', 11), // (debuff_hand: the hook below)
  dx('wheel_dx', 'The Wheel DX', 12, {
    stay_flipped: (self, b, area, card) => area === G.hand && G.hand.cards.some((o) => o.facing === 'front'),
  }),
  dx('house_dx', 'The House DX', 13, {
    set_blind(self, b) { b.has_discarded = false; },
    drawn_to_hand(self, b) {
      if (!b.has_discarded) { b.has_discarded = true; discard_hand_and_redraw(); }
    },
  }),
  dx('psychic_dx', 'The Psychic DX', 14, { debuff: { h_size_le: 4 } }),
  dx('hook_dx', 'The Hook DX', 15, {
    set_blind(self, b) { b.should_discard = false; },
    drawn_to_hand(self, b) {
      if (b.should_discard) { b.should_discard = false; discard_hand_and_redraw(); }
    },
    press_play(self, b) { b.should_discard = true; },
  }),
];

/** G.get_new_superboss(): any blind with debuff.superboss (seed 'boss'). */
export function get_new_superboss() {
  const pool = {};
  for (const [k, v] of Object.entries(P_BLINDS)) if (v.debuff && v.debuff.superboss && v.mod) pool[k] = true;
  return pseudorandom_element(pool, pseudoseed('boss'))[1];
}
function superboss_choices() {
  const rr = G.GAME.round_resets;
  rr.blind_choices.Small = 'bl_mf_bigger_blind';
  rr.blind_choices.Big = get_new_boss();
  rr.blind_choices.Boss = get_new_superboss();
}

const ticket = DATA.vouchers.find((v) => v.key === 'superboss_ticket');
export const centers = [{
  key: 'v_mf_superboss_ticket', set: 'Voucher', name: 'v_mf_superboss_ticket', cost: 0, pos: ticket.pos, atlas: 'mf_vouchers', config: {},
  no_collection: true, requires: ['v_mf_impossiblevoucher'], // (never in the voucher pool: the shop patch adds it)
  loc_vars: () => ({
    vars: [G.GAME && G.GAME.win_ante || 8,
      G.GAME && G.GAME.win_ante && G.GAME.round_resets.ante ? Math.floor(G.GAME.round_resets.ante + (G.GAME.win_ante - G.GAME.round_resets.ante % G.GAME.win_ante)) : 8],
  }),
  redeem() {
    G.GAME.superboss_active = true;
    G.GAME.modifiers.scaling = G.GAME.modifiers.scaling || 1;
    G.GAME.modifiers.bonus_scaling = 3;
    G.GAME.modifiers.scaling += G.GAME.modifiers.bonus_scaling;
    superboss_choices();
  },
}];

export const CHALLENGES = [{
  key: 'c_mf_superboss_always', name: 'Better Balatro II', mod: 'morefluff',
  rules: { custom: [{ id: 'mf_superboss_active' }, { id: 'scaling', value: 4 }, { id: 'bonus_scaling', value: 4 }], modifiers: [{ id: 'dollars', value: 14 }] },
  consumeables: [{ id: 'c_judgement' }],
}];

const sb_blind = () => !!(G.GAME.blind && G.GAME.blind.debuff && G.GAME.blind.debuff.superboss);
export const hooks = {
  /** The Ticket: in the shop after a boss of the win ante (ante == win_ante), $-10, while Superboss is off. */
  voucher_add(phase) {
    if (phase !== 'before_tags') return;
    const rr = G.GAME.round_resets;
    if (rr.ante === G.GAME.win_ante && rr.blind !== P_BLINDS.bl_small && rr.blind !== P_BLINDS.bl_big && !G.GAME.superboss_active && P_CENTERS.v_mf_superboss_ticket) {
      G.shop_vouchers.config.card_limit += 1;
      const card = center_card('v_mf_superboss_ticket', { bypass_discovery_center: true, bypass_discovery_ui: true });
      card.forced_cost = -10;
      card.set_cost();
      G.shop_vouchers.emplace(card);
    }
  },
  /** lovely: `if self.forced_cost ~= nil then self.cost = self.forced_cost end` (after the rental line). */
  set_cost(card) { if (card.forced_cost !== undefined) { card.cost = card.forced_cost; card.sell_cost = Math.max(1, Math.floor(card.cost / 2)) + (card.ability.extra_value || 0); } },
  new_boss_choice() { if (G.GAME.superboss_active) superboss_choices(); },
  /** Bigger Blind fills the Small slot; while Superboss is on, a regular boss fills the Big slot. */
  blind_slot(blind) {
    if (blind.config.blind === P_BLINDS.bl_mf_bigger_blind) return 'Small';
    if (G.GAME.superboss_active && blind.get_type() === 'Boss' && !sb_blind()) return 'Big';
    return undefined;
  },
  /** Beating the DX boss of the win ante wins the run and ends Superboss (scaling back, blinds back). */
  end_round() {
    if (G.GAME.superboss_active && G.GAME.round_resets.ante === G.GAME.win_ante && sb_blind()) {
      G.GAME.superboss_active = false;
      G.GAME.modifiers.scaling = Math.max(G.GAME.modifiers.scaling - (G.GAME.modifiers.bonus_scaling || 0), 1);
      G.GAME.modifiers.bonus_scaling = 0;
      G.GAME.round_resets.blind_choices.Small = 'bl_small';
      G.GAME.round_resets.blind_choices.Big = 'bl_big';
    }
  },
  can_skip_blind: () => (G.GAME.superboss_active ? false : undefined),
  /** The Serpent DX: once a hand was played / discarded, no redraw until the hand is empty. */
  draw_hand_space(n) {
    const b = G.GAME.blind;
    if (b && b.name === 'The Serpent DX' && !b.disabled && (G.GAME.current_round.hands_played > 0 || G.GAME.current_round.discards_used > 0)) {
      if (G.hand.cards.length > 0) return 0;
    }
    return undefined;
  },
  /** The Arm DX: the played hand drops to level 0. */
  debuff_hand(cards, hand, handname, check) {
    const b = G.GAME.blind;
    if (!b || b.name !== 'The Arm DX' || b.disabled) return undefined;
    b.triggered = false;
    if (G.GAME.hands[handname].level > 0) {
      b.triggered = true;
      if (!check) level_up_hand(null, handname, null, -G.GAME.hands[handname].level);
    }
    return undefined;
  },
  /** lovely: played cards are marked mf_played_this_game (The Pillar DX). */
  calculate(ctx) {
    if (ctx.press_play) for (const c of G.hand.highlighted) c.ability.mf_played_this_game = true;
  },
};
export { draw_card };
