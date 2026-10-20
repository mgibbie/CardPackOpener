// Pokermon 3.9.1 — pokemon/pokejokers_33.lua (Pokédex 961-990: Wugtrio -> Kingambit), 5 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, play_sound,
  change_shop_size, change_booster_limit, change_voucher_limit,
  defineJokers, type_tooltip, detailed, create_consumeable,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { dig_calc } from './pokejokers_32.js';

const FILE = 'pokemon/pokejokers_33.lua';

defineJokers({
  // Wugtrio 961
  wugtrio: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.chips] };
    },
    calculate(self, card, context) { return dig_calc(card, context, true); },
  },
  // Annihilape 979
  annihilape: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const hp = (G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played) || 0;
      // (Pokermon 3.9.1 renamed the keys: mult -> mult_mod, chips -> chip_mod.)
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.chip_mod, center.ability.extra.mult_mod * (1 + hp), center.ability.extra.chip_mod * (1 + hp)] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff) {
        const id = context.other_card.get_id();
        if (id === 2 || id === 3 || id === 5 || id === 7) {
          return {
            chips: card.ability.extra.chip_mod * (1 + G.GAME.current_round.hands_played),
            mult: card.ability.extra.mult_mod * (1 + G.GAME.current_round.hands_played),
            card,
          };
        }
      }
      return undefined;
    },
  },
  // Farigiraf 981
  farigiraf: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Cryptid'] });
        info_queue.push({ set: 'Spectral', key: 'c_cryptid', vars: [2] });
      }
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && context.poker_hands['Two Pair'].length && !context.blueprint) card.ability.extra.score = true;
        if (context.after) card.ability.extra.score = false;
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && card.ability.extra.score) {
        let first_face = null, last_face = null;
        for (let i = 0; i < context.scoring_hand.length; i++) {
          if (context.scoring_hand[i].is_face()) { first_face = context.scoring_hand[i]; break; }
        }
        for (let i = context.scoring_hand.length - 1; i >= 0; i--) {
          if (context.scoring_hand[i].is_face() && context.scoring_hand[i] !== first_face) { last_face = context.scoring_hand[i]; break; }
        }
        if (context.other_card === first_face || context.other_card === last_face) {
          return { x_mult: card.ability.extra.Xmult_multi, colour: 'RED', card };
        }
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) create_consumeable('c_cryptid');
    },
  },
  // Dudunsparce 982 (1 in 6 is the three-segment form, which also brings a Coupon Tag)
  dudunsparce: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      let alt_key;
      if (center.ability.extra.form === 1) {
        alt_key = 'j_poke_dudunsparce2';
        if (detailed()) {
          info_queue.push({ key: 'tag_coupon', set: 'Tag' });
          info_queue.push({ set: 'Other', key: 'holding', vars: ['Coupon Tag'] });
        }
      }
      return { vars: [center.ability.extra.card_slots, center.ability.extra.pack_slots, center.ability.extra.voucher_slots], key: alt_key };
    },
    set_ability(self, card, initial) {
      if (initial) {
        if (pseudorandom('dudunsparce') < (1 / 6)) card.ability.extra.form = 1;
      }
    },
    add_to_deck(self, card, from_debuff) {
      change_shop_size(card.ability.extra.card_slots);
      change_booster_limit(card.ability.extra.pack_slots);
      change_voucher_limit(card.ability.extra.voucher_slots);
      if (card.ability.extra.form === 1) {
        if (!from_debuff) {
          G.E_MANAGER.add_event(() => {
            add_tag(new Tag('tag_coupon'));
            play_sound('generic1', 0.9, 0.8);
            play_sound('holo1', 1.2, 0.4);
          });
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_wowthree') });
        }
      }
    },
    remove_from_deck(self, card) {
      // (Lua takes card_slots off all three; the three values are equal.)
      change_shop_size(-card.ability.extra.card_slots);
      change_booster_limit(-card.ability.extra.card_slots);
      change_voucher_limit(-card.ability.extra.card_slots);
    },
  },
  // Kingambit 983
  kingambit: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult / 2] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      // Pokermon 3.9.1: the deck's only King must be HELD in hand (3.2.1: in the played hand).
      if (context.individual && !context.end_of_round && context.cardarea === G.play) {
        let king_count = 0;
        for (const playing_card of G.playing_cards) if (playing_card.get_id() === 13) king_count = king_count + 1;
        if (king_count === 1) {
          let has_king = false;
          for (const v of G.hand.cards) if (v.get_id() === 13) { has_king = true; break; }
          if (has_king && !context.other_card.is_face()) {
            const Xmult = card.ability.extra.Xmult / 2;
            if (Xmult > 1) return { x_mult: Xmult, card };
          }
        }
      }
      return undefined;
    },
  },
}, FILE);
