// More Fluff 1.9.9999 — Superboss (src/superboss.lua, src/mod_calculate.lua, lovely/superboss.toml), reworked from
// 1.5.6: The Ticket is now FREE and shows up in the first shop of the winning ante (context.starting_shop at
// ante == win_ante, once per arrival: mf_missed_superboss, cleared at an end of round below the win ante); it stays
// in that ante's shops until redeemed. Redeeming it: the ante moves to the win ante, blind scaling +3, Small ->
// Bigger Blind, Big -> a regular boss, and a Superboss Pack opens (it can't be skipped) whose 3 DX Superboss Tokens
// let you CHOOSE the DX boss that fills the Boss slot (The Violet Vessel DX until you pick). While Superboss is on
// the ante can't move (ease_ante buzzes) and blinds can't be skipped. Beating the DX boss wins the run and turns
// Superboss off. The DX bosses also show up on their own as showdown bosses past the win ante (Endless).
// Final Stake (stakes.js): the Ticket is used the moment that shop opens, its Mega Superboss Pack picks 3 of 7
// tokens for the Small, Big and Boss slots, every blind of that ante is 3,333,333 chips (scaling 6), and Superboss
// only ends after all three DX bosses are beaten.
// PORT NOTES: the Superboss music (DUEL ZONE) plays through the view (extras.js); the chain backdrop and screen
// shader are visual only (not drawn). The 1.5.6 "Better Balatro II" challenge is gone upstream (a retired key).
// FIX (port): a Superboss Token's text names the slot the NEXT pick fills (the Lua's `used or 0 + 1` reads the last).
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_BLINDS, P_CENTERS, pseudorandom, pseudorandom_element, pseudoseed, ease_hands_played, ease_discard,
  number_format, level_up_hand, get_new_boss, draw_card, ease_ante, play_sound, localize, emit,
} from '../../js/engine/core.js';
import { draw_from_deck_to_hand, discard_cards_from_highlighted, use_card } from '../../js/engine/run.js';
import { DATA, center_card } from './util.js';
import { open_free_pack } from './rotarots.js';

const SUPER = { superboss: true, akyrs_blind_difficulty: 'dx', akyrs_cannot_be_disabled: true };
const BOSS = { min: 9, max: 10, showdown: true };
const after_win_ante = () => G.GAME.round_resets.ante > G.GAME.win_ante;
const final_stake = () => !!(G.GAME.modifiers && G.GAME.modifiers.mf_final_stake);
const dx = (slug, name, y, extra = {}) => ({
  key: 'bl_mf_' + slug, name, dollars: 10, mult: 3, vars: [], pos: { x: 0, y }, boss: BOSS, boss_colour: '#ac3232',
  atlas: 'mf_blinds', ...extra, debuff: { ...SUPER, ...(extra.debuff || {}) }, in_pool: after_win_ante,
});
/** All non-suit cards of `suit` are debuffed (recalc_debuff -> the engine's mod debuff_card). */
const suit_dx = (suit) => (self, b, card) => !card.is_suit(suit);
/** FIX (intended design, kept from 1.5.6): the Lua's hook-discard (G.FUNCS.discard_cards_from_highlighted(nil, true))
 *  never draws again, so House DX / Hook DX left an EMPTY hand and the round could not go on. The hand is
 *  redrawn after the discard (the mod's own test house_dx_discards expects the deck drawn through). */
function discard_hand_and_redraw() {
  G.hand.highlighted.length = 0;
  for (const v of G.hand.cards) { G.hand.highlighted.push(v); v.highlighted = true; }
  discard_cards_from_highlighted(true);
  G.E_MANAGER.add_event(() => draw_from_deck_to_hand());
}

export const SUPERBOSSES = ['violet_vessel_dx', 'cerulean_bell_dx', 'needle_dx', 'manacle_dx', 'pillar_dx', 'serpent_dx', 'club_dx',
  'goad_dx', 'window_dx', 'head_dx', 'arm_dx', 'wheel_dx', 'house_dx', 'psychic_dx', 'hook_dx'];

export const blinds = [
  {
    key: 'bl_mf_bigger_blind', name: 'Bigger Blind', blind_type: 'Small', dollars: 6, mult: 1, vars: [], debuff: {}, pos: { x: 0, y: 0 },
    boss_colour: '#ac3232', atlas: 'mf_blinds', in_pool: () => false,
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

/** G.get_new_superboss(): any blind with debuff.superboss (seed 'boss'). (Unused by 1.9.9999 itself; kept for callers.) */
export function get_new_superboss() {
  const pool = {};
  for (const [k, v] of Object.entries(P_BLINDS)) if (v.debuff && v.debuff.superboss && v.mod) pool[k] = true;
  return pseudorandom_element(pool, pseudoseed('boss'))[1];
}
/** The Superboss blind choices (kept while it's on: a boss reroll can't change them). */
function superboss_choices() {
  const rr = G.GAME.round_resets;
  rr.blind_choices.Small = 'bl_mf_bigger_blind';
  rr.blind_choices.Big = get_new_boss();
  rr.blind_choices.Boss = 'bl_mf_violet_vessel_dx';
  G.GAME.mf_superboss_choices = { ...rr.blind_choices };
}
/** FLUFF.use_superboss_token(key): the Boss slot (Final Stake: Small, then Big, then Boss). */
export function use_superboss_token(key) {
  const rr = G.GAME.round_resets;
  if (final_stake()) {
    G.GAME.mf_finalstake_used = (G.GAME.mf_finalstake_used || 0) + 1;
    const slot = ['Small', 'Big', 'Boss'][G.GAME.mf_finalstake_used - 1];
    if (slot) rr.blind_choices[slot] = key;
  } else rr.blind_choices.Boss = key;
  if (G.GAME.mf_superboss_active) G.GAME.mf_superboss_choices = { ...rr.blind_choices };
  emit('boss_rerolled', { boss: key, blind_card: true });
}

const ticket = DATA.vouchers.find((v) => v.key === 'superboss_ticket');
const pack = (key) => {
  const s = DATA.boosters.find((b) => b.key === key);
  return {
    key: 'p_mf_' + key, set: 'Booster', name: s.key, kind: 'Superboss', cost: 0, weight: 0, pos: s.pos, atlas: 'mf_packs',
    config: JSON.parse(JSON.stringify(s.config)), group_key: 'k_superboss_pack', in_pool: () => false,
    loc_vars: (self, iq, card) => ({ vars: [self.config.choose, (card && card.ability && card.ability.extra) ?? self.config.extra] }),
    create_card() {
      G.GAME.mf_generating_superboss_pack = true; // (_G.generating_superboss_pack: the tokens' in_pool; cleared by the create_card hook)
      return { set: 'SuperbossToken', area: G.pack_cards, skip_materialize: true, soulable: true, key_append: 'mf_superbosstoken' };
    },
  };
};
const token = (slug, i) => ({
  key: 'c_mf_' + slug, set: 'SuperbossToken', name: slug, consumeable: true, cost: 3, pos: { x: 0, y: i + 1 }, atlas: 'mf_blinds',
  config: { blind: 'bl_mf_' + slug },
  in_pool: () => !!G.GAME.mf_generating_superboss_pack,
  can_use: () => true,
  loc_vars(self) {
    const used = (G.GAME && G.GAME.mf_finalstake_used) || 0;
    const slot = G.GAME && final_stake() ? ['Small Blind', 'Big Blind', 'Boss Blind'][Math.min(used, 2)] : 'Superboss';
    return { key: 'c_mf_superboss_token', vars: [localize({ type: 'name_text', set: 'Blind', key: self.config.blind }), slot] };
  },
  use(self) { use_superboss_token(self.config.blind); },
});

export const centers = [
  {
    key: 'v_mf_superboss_ticket', set: 'Voucher', name: 'v_mf_superboss_ticket', cost: 0, pos: ticket.pos, atlas: 'mf_vouchers', config: {},
    no_collection: true, requires: ['v_mf_impossiblevoucher'], // (never in the voucher pool: added to the shop below)
    loc_vars: () => ({
      vars: [G.GAME && G.GAME.win_ante || 8,
        G.GAME && G.GAME.win_ante && G.GAME.round_resets.ante ? Math.floor(G.GAME.round_resets.ante + (G.GAME.win_ante - G.GAME.round_resets.ante % G.GAME.win_ante)) : 8],
    }),
    redeem() {
      const win = G.GAME.win_ante || 8;
      if (G.GAME.round_resets.ante !== win) ease_ante(win - G.GAME.round_resets.ante);
      G.GAME.mf_superboss_ticket_used = true;
      G.E_MANAGER.add_event(() => {
        G.GAME.mf_superboss_active = true;
        // (the Superboss Pack opens once the redeem has settled: the update hook)
        G.GAME.mf_open_superboss_pack = final_stake() ? 'p_mf_superboss_mega_1' : 'p_mf_superboss_normal_1';
      });
      G.GAME.modifiers.scaling = G.GAME.modifiers.scaling || 1;
      G.GAME.modifiers.bonus_scaling = G.GAME.modifiers.bonus_scaling || 3; // (Lua `bonus_scaling or 0 + 3`)
      G.GAME.modifiers.scaling += G.GAME.modifiers.bonus_scaling;
      superboss_choices();
    },
  },
  pack('superboss_normal_1'),
  pack('superboss_mega_1'),
  ...SUPERBOSSES.map(token),
];
export const consumable_types = [{ key: 'SuperbossToken', name: 'Superboss Token', shop_rate: 0, default: 'c_mf_violet_vessel_dx', primary_colour: '#ac3232', secondary_colour: '#ac3232' }];

const sb_blind = () => !!(G.GAME.blind && G.GAME.blind.debuff && G.GAME.blind.debuff.superboss);
const is_ticket = (c) => c && c.config.center.key === 'v_mf_superboss_ticket';
const PACK_KEYS = ['p_mf_superboss_normal_1', 'p_mf_superboss_mega_1'];
export const hooks = {
  /** mod_calculate starting_shop: The Ticket (free) in the win ante's shops until it is used. */
  voucher_add(phase) {
    if (phase !== 'before_tags' || !P_CENTERS.v_mf_superboss_ticket) return;
    const rr = G.GAME.round_resets;
    if (rr.ante === G.GAME.win_ante && !G.GAME.mf_missed_superboss) { G.GAME.mf_missed_superboss = true; G.GAME.mf_superboss_offered = rr.ante; }
    if (G.GAME.mf_superboss_offered === rr.ante && rr.ante === G.GAME.win_ante && !G.GAME.mf_superboss_active && !G.GAME.mf_superboss_ticket_used) {
      G.shop_vouchers.config.card_limit += 1;
      const card = center_card('v_mf_superboss_ticket', { bypass_discovery_center: true, bypass_discovery_ui: true });
      card.set_cost();
      G.shop_vouchers.emplace(card);
    }
  },
  /** Final Stake: the Ticket is used as soon as the shop opens (mf_forced_weird_routed). */
  shop_stocked() {
    if (!final_stake() || G.STATE !== G.STATES.SHOP || G.GAME.mf_superboss_ticket_used) return;
    const t = G.shop_vouchers && G.shop_vouchers.cards.find(is_ticket);
    if (!t) return;
    G.GAME.mf_forced_weird_routed = true;
    use_card(t);
  },
  /** Card:set_cost: The Ticket and the Superboss Packs are free. */
  set_cost(card) { if (is_ticket(card) || PACK_KEYS.includes(card.config.center.key)) { card.cost = 0; card.sell_cost = Math.max(1, Math.floor(card.cost / 2)) + (card.ability.extra_value || 0); } },
  create_card(card) { if (card.ability.set === 'SuperbossToken') G.GAME.mf_generating_superboss_pack = undefined; },
  /** The redeem's pack opens once the shop is back in control (the Lua's nested events). */
  update() {
    const key = G.GAME.mf_open_superboss_pack;
    if (!key || G.STATE !== G.STATES.SHOP) return;
    G.GAME.mf_open_superboss_pack = undefined;
    G.GAME.mf_generating_superboss_pack = true;
    open_free_pack(key);
    G.GAME.mf_generating_superboss_pack = undefined;
  },
  /** G.FUNCS.can_skip_booster: a Superboss Pack can't be skipped. */
  can_skip_booster() { return G.GAME.pack_center && PACK_KEYS.includes(G.GAME.pack_center) ? false : undefined; },
  /** While Superboss is on, a boss reroll leaves its blinds alone (G.FUNCS.reroll_boss buzzes). */
  new_boss_choice() { if (G.GAME.mf_superboss_active && G.GAME.mf_superboss_choices) Object.assign(G.GAME.round_resets.blind_choices, G.GAME.mf_superboss_choices); },
  /** Bigger Blind fills the Small slot; while Superboss is on a regular boss fills the Big slot — and on Final Stake
   *  every DX boss fills the slot it was picked for. */
  blind_slot(blind) {
    if (blind.config.blind === P_BLINDS.bl_mf_bigger_blind) return 'Small';
    if (G.GAME.mf_superboss_active && final_stake() && sb_blind()) return G.GAME.blind_on_deck || 'Boss';
    if (G.GAME.mf_superboss_active && blind.get_type() === 'Boss' && !sb_blind()) return 'Big';
    return undefined;
  },
  /** Beating a DX boss of the win ante: Superboss ends (Final Stake: after the third) — scaling back, blinds back. */
  end_round() {
    const rr = G.GAME.round_resets;
    if (rr.ante < (G.GAME.win_ante || 8)) G.GAME.mf_missed_superboss = undefined;
    G.GAME.mf_ante_end = !!(G.GAME.blind && G.GAME.blind.get_type() === 'Boss');
    if (G.GAME.mf_superboss_active && rr.ante === G.GAME.win_ante && sb_blind()) {
      let reset = !final_stake();
      if (final_stake()) {
        G.GAME.mf_superbosses_defeated = (G.GAME.mf_superbosses_defeated || 0) + 1;
        if (G.GAME.mf_superbosses_defeated >= 3) { reset = true; G.GAME.mf_superbosses_defeated = 0; }
      }
      if (reset) {
        G.GAME.mf_superboss_active = false;
        G.GAME.mf_superboss_choices = undefined;
        G.GAME.modifiers.scaling = Math.max(G.GAME.modifiers.scaling - (G.GAME.modifiers.bonus_scaling || 0), 1);
        G.GAME.modifiers.bonus_scaling = 0;
        rr.blind_choices.Small = 'bl_small';
        rr.blind_choices.Big = 'bl_big';
      }
    }
  },
  /** ease_ante: frozen while Superboss is on (a buzzer); Final Stake holds the ante below the win ante until the
   *  Ticket's route (only the boss of win_ante - 1 may step onto it). */
  ease_ante_mod(mod) {
    if (!mod) return mod;
    if (final_stake() && !G.GAME.mf_forced_weird_routed) {
      const rr = G.GAME.round_resets, win = G.GAME.win_ante || 8;
      if (rr.ante + mod > win - 1 && !(rr.ante === win - 1 && G.GAME.mf_ante_end)) return (win - 1) - rr.ante;
      return mod;
    }
    if (G.GAME.mf_superboss_active) { play_sound('mf_buzzer'); return 0; }
    return mod;
  },
  can_skip_blind: () => (G.GAME.mf_superboss_active ? false : undefined),
  new_round() { G.GAME.mf_ante_end = false; },
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
  view(v) {
    if (G.GAME.pack_center && PACK_KEYS.includes(G.GAME.pack_center) && G.pack_cards && G.pack_cards.cards.length) { v.pack_no_skip = true; v.pack_kind = 'Superboss'; v.pack_colours = { colour: '#ac3232', special: '#1f2a2c' }; }
    if (G.GAME.mf_superboss_active) v.mf_superboss = true;
  },
  /** A Superboss Token is drawn as its DX boss's chip. */
  view_card(card, v) {
    if (card.ability.set !== 'SuperbossToken') return;
    const b = P_BLINDS[card.ability.blind || (card.config.center.config || {}).blind];
    if (b) v.blind_card = { key: b.key, atlas: b.atlas || null, pos: b.pos, colour: b.boss_colour, mod: b.mod || null };
  },
};
export { draw_card };
