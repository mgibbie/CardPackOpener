// Bunco — the 20 boss blinds and 5 finishers (Bunco.lua ~6295-7004 + their lovely patches). Steamodded blind
// methods map to Micatro's mod-blind calls with (proto, blind instance, ...): set_blind, defeat, disable,
// press_play, drawn_to_hand, stay_flipped, modify_hand, debuff_hand, and recalc_debuff (= debuff_card here: a
// true answer debuffs the playing card, anything else leaves it undebuffed, like SMODS). SMODS names a mod blind
// by its key (G.GAME.blind.name == 'bl_bunc_gate'). Rules that live in other engine paths:
//   flow.js     The Paling, The Claw, The Swing's discard flip, The Blade, Magenta Dagger, The Tine's tally
//   systems.js  The Gate, The Veil (Card:highlight / remove_from_highlighted)
//   here        The Umbrella / The Swing's play flips, The Miser's skipped shop, The Wind / The Prince joker
//               debuffs, The Tine / The Mask's most / least played rank and hand, Vermilion Trident's purchase
//               count, Turquoise Shield's overscore
// Port notes: The Stone / The Sand / Vermilion Trident / Turquoise Shield raise the blind over ~120 animation
// ticks in the Lua — the end value is set in one event here. The Depths / The Chasm also require the profile to
// have won the deck on stake 7 / 10 (get_deck_win_stake); Micatro has no profile and everything is unlocked,
// so that requirement counts as met (only the ante minimum applies).
import { G, number_format, math_random, get_blind_amount, localize, ease_dollars } from '../../js/engine/core.js';
import { get_poker_hand_info, HANDLIST, discard_cards_from_highlighted } from '../../js/engine/run.js';
import { add_tag, Tag } from '../../js/engine/tag.js';
import { data_of, event, big_juice, RANK_LIST, FLEURONS, HALBERDS } from './util.js';

const on = (key) => G.GAME.blind && G.GAME.blind.name === key && !G.GAME.blind.disabled;
const first_hand = () => G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0;
/** The animated chip ramp of The Stone & co., as its end value. */
function raise_to(b, final_chips) {
  event(() => { b.chips = final_chips; b.chip_text = number_format(b.chips); b.wiggle(); });
}
const restore = (self, b) => { b.chips = b.original_chips; b.chip_text = number_format(b.chips); };
const unflip_hand = () => {
  for (const c of G.hand.cards) if (c.facing === 'back') c.flip();
  for (const v of G.playing_cards) v.ability.wheel_flipped = undefined;
};

const blind = (slug, def = {}) => {
  const d = data_of('blinds', 'bl_bunc_' + slug);
  return { dollars: 5, mult: 2, vars: [], debuff: {}, ...d, pos: { x: 0, y: d.pos.y }, name: d.key, ...def };
};

export const blinds = [
  blind('paling'),
  blind('umbrella', { disable: () => unflip_hand() }),
  blind('tine', {
    loc_vars: () => ({ vars: [localize(G.GAME.current_round.most_played_rank, 'ranks')] }),
    debuff_card: (self, b, card) => card.config.center.key !== 'm_stone' && card.base.value === G.GAME.current_round.most_played_rank,
  }),
  blind('swing', {
    defeat() { G.GAME.Swing = false; },
    stay_flipped: () => G.GAME.Swing === true,
    disable: () => unflip_hand(),
  }),
  blind('miser', { defeat(self, b) { if (!b.disabled) G.GAME.Miser = true; } }),
  blind('gate'),
  blind('flame', { debuff_card: (self, b, card) => card.config.center.key !== 'c_base' }),
  blind('mask', {
    loc_vars: () => ({ vars: [localize(G.GAME.current_round.most_played_poker_hand, 'poker_hands'), localize(G.GAME.current_round.least_played_poker_hand, 'poker_hands')] }),
    modify_hand(self, b, cards, poker_hands, text, mult, hand_chips) {
      if (G.GAME.last_hand_played === G.GAME.current_round.most_played_poker_hand) {
        b.triggered = true;
        const h = G.GAME.hands[G.GAME.current_round.least_played_poker_hand];
        return [h.s_mult, h.s_chips, true];
      }
      return [mult, hand_chips, false];
    },
  }),
  blind('bulwark', {
    loc_vars: () => ({ vars: [localize(G.GAME.current_round.most_played_poker_hand, 'poker_hands')] }),
    press_play(self, b) {
      if (get_poker_hand_info(G.hand.highlighted).text === G.GAME.current_round.most_played_poker_hand) {
        event(() => {
          const original_limit = G.hand.config.highlighted_limit;
          G.hand.config.highlighted_limit = Infinity;
          for (const v of G.hand.cards.slice()) G.hand.add_to_highlighted(v, true);
          G.hand.config.highlighted_limit = original_limit || 5;
          discard_cards_from_highlighted(true);
          b.wiggle();
        });
        b.triggered = true;
      }
    },
  }),
  blind('knoll', {
    stay_flipped(self, b, area, card) {
      if (area === G.hand && first_hand() && G.GAME.dollars > 5) {
        G.GAME.Knoll = G.GAME.Knoll || [];
        G.GAME.Knoll.push(card.sort_id); // (the Lua keeps the Card; its id here)
        card.set_debuff(true);
      }
      return false;
    },
    debuff_card: (self, b, card) => !!(G.GAME.Knoll && G.GAME.Knoll.includes(card.sort_id)),
    defeat() { G.GAME.Knoll = undefined; },
  }),
  blind('stone', {
    set_blind(self, b) {
      b.original_chips = b.chips;
      if (G.GAME.dollars >= 10) raise_to(b, (b.chips / b.mult) * (Math.floor(G.GAME.dollars / 10) + b.mult));
    },
    disable: restore,
  }),
  blind('sand', {
    set_blind(self, b) {
      b.original_chips = b.chips;
      if (G.GAME.tags.length !== 0) raise_to(b, (b.chips / b.mult) * (G.GAME.tags.length + b.mult));
    },
    disable: restore,
    in_pool: (self) => !(G.GAME.round_resets.ante < self.boss.min || G.GAME.tags.length < 2),
  }),
  blind('blade', {
    loc_vars: (self) => ({ vars: [number_format(get_blind_amount(G.GAME.round_resets.ante) * self.mult * G.GAME.starting_params.ante_scaling * 1.5)] }),
  }),
  blind('claw'),
  blind('veil'),
  blind('cadaver', {
    debuff_hand(self, b, cards, hand, handname, check) {
      for (const c of cards) if (c.is_face() && (c.facing === 'front' || !check)) return false;
      return true;
    },
    in_pool: (self) => G.GAME.round_resets.ante >= self.boss.min && (G.playing_cards || []).some((c) => c.is_face()),
  }),
  blind('wind', {
    drawn_to_hand(self, b) {
      if (first_hand()) {
        b.ready = true;
        if (G.jokers && G.jokers.cards[0]) big_juice(G.jokers.cards[0]);
        b.wiggle();
      }
    },
  }),
  blind('prince', {
    drawn_to_hand(self, b) {
      if (first_hand()) {
        b.ready = true;
        for (const j of G.jokers.cards) { b.debuff_card(j); big_juice(j); }
        b.wiggle();
      }
      if (!b.disabled && G.GAME.current_round.hands_played > 0) b.disable();
    },
  }),
  blind('depths', {
    press_play(self, b) {
      const stickers = ['tag_bunc_eternal', 'tag_bunc_perishable', 'tag_bunc_scattering'];
      add_tag(new Tag(stickers[math_random(stickers.length) - 1]));
      b.wiggle(); b.triggered = true;
    },
    in_pool: (self) => G.GAME.round_resets.ante >= self.boss.min,
  }),
  blind('chasm', {
    press_play(self, b) {
      const stickers = ['tag_bunc_hindered', 'tag_bunc_reactive', 'tag_bunc_rental'];
      add_tag(new Tag(stickers[math_random(stickers.length) - 1]));
      b.wiggle(); b.triggered = true;
    },
    in_pool: (self) => G.GAME.round_resets.ante >= self.boss.min,
  }),
  // ---- finishers
  blind('final_crown', {
    debuff_card: (self, b, card) => ['Spades', 'Hearts', 'Clubs', 'Diamonds'].includes(card.base.suit) && card.ability.name !== 'Stone Card',
    in_pool: () => (G.playing_cards || []).filter((v) => (v.base.suit === FLEURONS || v.base.suit === HALBERDS) && v.ability.name !== 'Stone Card').length >= 10,
  }),
  blind('final_trident', {
    set_blind(self, b) {
      b.original_chips = b.chips;
      if (G.GAME.ante_purchases) raise_to(b, (b.chips / b.mult) * (G.GAME.ante_purchases + b.mult));
    },
    disable: restore,
  }),
  blind('final_tower', { debuff_card: (self, b, card) => !card.ability.played_this_ante }),
  blind('final_dagger'),
  blind('final_shield', {
    set_blind(self, b) {
      b.original_chips = b.chips;
      if (G.GAME.overscore && G.GAME.overscore !== 0) raise_to(b, b.chips + (G.GAME.overscore || 0));
    },
    disable: restore,
    defeat() { G.GAME.Shield = false; },
  }),
];

export const hooks = {
  // The Umbrella / The Swing 2/2: a played hand flips the rest of the hand (lovely order: Swing, then Umbrella).
  play_pressed() {
    if (on('bl_bunc_swing')) {
      event(() => {
        for (const v of G.hand.cards) if (!(v.area === G.hand && v.highlighted && v.facing === 'front')) v.flip();
        G.GAME.blind.wiggle(); G.GAME.blind.triggered = true;
        G.GAME.Swing = !(G.GAME.Swing === true);
      });
    }
    if (on('bl_bunc_umbrella')) {
      event(() => {
        for (const v of G.hand.cards) if (v.facing === 'front' && !v.highlighted) v.flip();
        G.GAME.blind.wiggle(); G.GAME.blind.triggered = true;
      });
    }
  },
  // The Miser: no shop after it.
  skip_shop() { if (G.GAME.Miser) { G.GAME.Miser = false; return true; } return undefined; },
  // The Wind / The Prince (BUNCOMOD.content.set_debuff)
  set_debuff(card) {
    const b = G.GAME.blind;
    if (!b || !b.ready || b.disabled || !G.jokers) return undefined;
    if (b.name === 'bl_bunc_wind' && G.jokers.cards[0] === card) return true;
    if (b.name === 'bl_bunc_prince' && card.area === G.jokers) return true;
    return undefined;
  },
  update() {
    const rr = G.GAME.round_resets;
    // Vermilion Trident / Turquoise Shield 1/2 (Game:update)
    if (rr.blind_choices && rr.blind_choices.Boss === 'bl_bunc_final_trident') G.GAME.Trident = true;
    else { G.GAME.Trident = false; G.GAME.ante_purchases = 0; }
    G.GAME.Shield = !!(rr.blind_choices && rr.blind_choices.Boss === 'bl_bunc_final_shield');
    // The Wind (Game:update): its first joker stays debuffed
    if (on('bl_bunc_wind') && G.GAME.blind.ready) for (const j of G.jokers.cards) G.GAME.blind.debuff_card(j);
  },
  // Vermilion Trident 1/2: every payment (or no-gain change) this ante counts.
  ease_dollars(mod) { if (G.GAME.Trident && mod <= 0) G.GAME.ante_purchases = (G.GAME.ante_purchases || 0) + 1; return mod; },
  // Turquoise Shield 2/2: chips scored over a blind add to the Shield's.
  end_round_start() {
    if (G.GAME.Shield === true && G.GAME.chips - G.GAME.blind.chips >= 0) G.GAME.overscore = (G.GAME.overscore || 0) + G.GAME.chips - G.GAME.blind.chips;
  },
  // The Tine 2/3 + The Mask 1/2 (end_round, after a Boss): most played rank, least played visible hand.
  end_round() {
    if (G.GAME.blind.get_type() !== 'Boss') return;
    if (G.GAME.played_ranks) {
      let max_rank = null, max_count = -1;
      for (const r of RANK_LIST) { const count = G.GAME.played_ranks[r.key] || 0; if (count >= max_count) { max_count = count; max_rank = r.key; } }
      G.GAME.current_round.most_played_rank = max_rank;
    }
    let lowest = Infinity, least = '';
    for (let i = HANDLIST.length - 1; i >= 0; i--) {
      const h = G.GAME.hands[HANDLIST[i]];
      const played = h ? h.played : 0;
      if (played < lowest && h.visible) { lowest = played; least = HANDLIST[i]; }
    }
    G.GAME.current_round.least_played_poker_hand = least;
  },
};
export const centers = [];
export { ease_dollars };
