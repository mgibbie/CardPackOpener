// Pokermon 3.2.1 — pokemon/pokejokers_30.lua (Pokédex 871-900: Dreepy -> Kleavor), 6 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
import {
  G, P_CENTERS, localize, card_eval_status_text, play_sound, delay, pseudoseed, pseudorandom_element,
  create_playing_card, poll_edition, find_joker, juice_card_until, P_CARDS_LIST,
  defineJokers, type_tooltip, detailed, scaling_evo, smods_create_card, juice_flip_hand, has_no_suit,
} from '../api.js';

const FILE = 'pokemon/pokejokers_30.lua';

// ------------------------------------------------------------ shared bodies
/** Dreepy / Dreepy Dart: when sold, +$money sell value to every joker and hand -> suit. */
function dreepy_sell(card, context) {
  for (const v of G.jokers.cards) {
    if (v.set_cost) {
      v.ability.extra_value = (v.ability.extra_value || 0) + card.ability.extra.money;
      v.set_cost();
    }
  }
  if (G.hand && G.hand.cards && G.hand.cards.length > 0) {
    juice_flip_hand(card);
    for (let i = 0; i < G.hand.cards.length; i++) {
      G.E_MANAGER.add_event(() => { if (G.hand.cards[i]) G.hand.cards[i].change_suit(card.ability.extra.suit); });
    }
    juice_flip_hand(card, true);
  }
}
/** Drakloak / Dragapult update(): total sell value of every joker in the row. */
function sell_value_update(self, card) {
  if (G.jokers) {
    let sell_cost = 0;
    for (let i = 0; i < G.jokers.cards.length; i++) {
      if (G.jokers.cards[i].area && G.jokers.cards[i].area === G.jokers) sell_cost = sell_cost + G.jokers.cards[i].sell_cost;
    }
    card.ability.extra.total_sell_value = sell_cost;
  }
}
const sell_xmult = (card) => ({
  message: localize({ type: 'variable', key: 'a_xmult', vars: [1 + card.ability.extra.total_sell_value * card.ability.extra.Xmult] }),
  colour: 'MULT',
  Xmult_mod: 1 + card.ability.extra.total_sell_value * card.ability.extra.Xmult,
  card,
});

defineJokers({
  // Dreepy 885
  dreepy: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money, localize(center.ability.extra.suit, 'suits_plural')] };
    },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) {
        dreepy_sell(card, context);
        return { message: localize('k_val_up'), colour: 'MONEY' };
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && context.poker_hands['Straight Flush'].length) {
          card.ability.extra.straight_flush_played = card.ability.extra.straight_flush_played + 1;
        }
      }
      return scaling_evo(self, card, context, 'j_poke_drakloak', card.ability.extra.straight_flush_played, 1);
    },
  },
  // Drakloak 886
  drakloak: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money, center.ability.extra.total_sell_value, self.config.evo_rqmt, center.ability.extra.Xmult,
        1 + center.ability.extra.total_sell_value * center.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          if (context.poker_hands['Straight Flush'].length) {
            for (const v of G.jokers.cards) {
              if (v.set_cost) {
                v.ability.extra_value = (v.ability.extra_value || 0) + card.ability.extra.money;
                v.set_cost();
              }
            }
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_val_up'), colour: 'MONEY' });
          }
          return sell_xmult(card);
        }
      }
      return scaling_evo(self, card, context, 'j_poke_dragapult', card.ability.extra.total_sell_value, self.config.evo_rqmt);
    },
    update: sell_value_update,
  },
  // Dragapult 887
  dragapult: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        if (!center.edition || (center.edition && !center.edition.negative)) info_queue.push(P_CENTERS.e_negative);
      }
      return { vars: [center.ability.extra.money, center.ability.extra.Xmult, 1 + center.ability.extra.total_sell_value * center.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          if (context.poker_hands['Straight Flush'].length && !find_joker('dreepy_dart').length) {
            for (let i = 1; i <= 2; i++) {
              G.E_MANAGER.add_event(() => {
                play_sound('negative', 1.5, 0.4);
                const new_card = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_poke_dreepy_dart', no_edition: true });
                // SMODS keeps the Negative that dreepy_dart's set_ability gave it (no_edition only skips
                // the edition poll); the Micatro shim strips it, so put it back.
                new_card.set_edition({ negative: true }, true, true);
                new_card.add_to_deck();
                G.jokers.emplace(new_card);
              });
            }
            delay(0.6);
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_darts_ex'), colour: 'MULT' });
          }
          return sell_xmult(card);
        }
      }
      return undefined;
    },
    update: sell_value_update,
  },
  // Dreepy Dart (Dragapult's ammunition)
  dreepy_dart: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money, localize(center.ability.extra.suit, 'suits_plural')] };
    },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) dreepy_sell(card, context);
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) card.set_edition({ negative: true }, true, true);
    },
  },
  // Wyrdeer 899
  wyrdeer: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.scry, center.ability.extra.scry_plus] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) {
          G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry_plus;
          card.ability.extra.scry_added = card.ability.extra.scry_added + card.ability.extra.scry_plus;
        }
      }
      if (!context.end_of_round && context.scoring_hand) {
        if (context.individual && context.cardarea === G.scry_view && !context.other_card.debuff) {
          let highest = null, highest_card = null;
          for (const v of G.scry_view.cards) {
            if (!has_no_suit(v)) {
              if (highest === null) { highest = v.base.id; highest_card = v; }
              if (v.base.id > highest) { highest = v.base.id; highest_card = v; }
            }
          }
          if (highest_card && context.other_card === highest_card) {
            const Mult = 2 * highest_card.base.nominal;
            return { message: localize({ type: 'variable', key: 'a_mult', vars: [Mult] }), message_card: context.other_card, colour: 'MULT', mult_mod: Mult, card };
          }
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        G.GAME.scry_amount = Math.max(card.ability.extra.scry, (G.GAME.scry_amount || 0) - card.ability.extra.scry_added);
        card.ability.extra.scry_added = 0;
        return { message: localize('k_reset'), colour: 'PURPLE' };
      }
      return undefined;
    },
    add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
    remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
  },
  // Kleavor 900
  kleavor: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.e_foil);
        info_queue.push(P_CENTERS.e_holo);
        info_queue.push(P_CENTERS.e_polychrome);
        info_queue.push(P_CENTERS.m_stone);
      }
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.ending_shop) {
        card.ability.extra.selected = false;
        juice_card_until(card, () => !card.ability.extra.selected, true);
      }
      if (context.setting_blind && !card.getting_sliced && !context.blueprint) {
        let my_pos = null;
        for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] === card) { my_pos = i; break; }
        const next = my_pos !== null ? G.jokers.cards[my_pos + 1] : undefined;
        if (next && !card.getting_sliced && !next.ability.eternal && !next.getting_sliced) {
          const sliced_card = next;
          sliced_card.getting_sliced = true;
          if (sliced_card.config.center.rarity !== 1) {
            const edition = poll_edition('aura', null, true, true);
            const _card = create_playing_card({ front: pseudorandom_element(P_CARDS_LIST(), pseudoseed('kleavor'))[0], center: P_CENTERS.m_stone }, G.deck);
            _card.set_edition(edition, true);
          }
          G.GAME.joker_buffer = G.GAME.joker_buffer - 1;
          G.E_MANAGER.add_event(() => {
            G.GAME.joker_buffer = 0;
            card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
            card.juice_up(0.8, 0.8);
            sliced_card.start_dissolve();
            play_sound('slice1', 0.96);
          });
          // (Lua passes `self` — the center — as the status card; it's this card's popup.)
          card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'RED', no_juice: true });
        }
        card.ability.extra.selected = true;
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), mult_mod: card.ability.extra.mult };
        }
      }
      return undefined;
    },
  },
}, FILE);
