// Pokermon 3.9.1 — pokemon/pokejokers_10.lua (Pokédex 271-300: Shroomish -> Nosepass), 4 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, ease_discard, ease_hands_played, create_card,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, faint_baby_poke,
} from '../api.js';

const FILE = 'pokemon/pokejokers_10.lua';

/** Shroomish / Breloom: a random +hands / +discards / +hand size when the blind is selected. */
function shroom_blind(card, context) {
  if (context.setting_blind) {
    const bonus = pseudorandom('shroomish');
    const message_card = context.blueprint_card || card;
    if (bonus > 0.66) {
      card_eval_status_text(message_card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_hands', vars: [card.ability.extra.hands] }), colour: 'CHIPS' });
      ease_hands_played(card.ability.extra.hands);
    } else if (bonus > 0.33) {
      card_eval_status_text(message_card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'poke_discards', vars: [card.ability.extra.d_size] }), colour: 'MULT' });
      ease_discard(card.ability.extra.d_size);
    } else {
      card_eval_status_text(message_card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [card.ability.extra.h_size] }) });
      G.hand.change_size(card.ability.extra.h_size);
      G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + card.ability.extra.h_size;
    }
    card.juice_up();
  }
}

defineJokers({
  // Shroomish 285
  shroomish: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands, center.ability.extra.d_size, center.ability.extra.h_size, Math.max(0, self.config.evo_rqmt - center.ability.extra.boss_defeated)] };
    },
    calculate(self, card, context) {
      shroom_blind(card, context);
      if (context.end_of_round && !context.individual && !context.repetition && G.GAME.blind.boss) {
        card.ability.extra.boss_defeated = card.ability.extra.boss_defeated + 1;
      }
      return scaling_evo(self, card, context, 'j_poke_breloom', card.ability.extra.boss_defeated, self.config.evo_rqmt);
    },
  },
  // Breloom 286
  breloom: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands, center.ability.extra.d_size, center.ability.extra.h_size] };
    },
    calculate(self, card, context) {
      shroom_blind(card, context);
      return undefined;
    },
  },
  // Azurill 298
  azurill: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
        info_queue.push(P_CENTERS.c_heirophant);
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          faint_baby_poke(self, card, context);
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_minus] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition && !card.debuff) {
        const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_heirophant');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
      return level_evo(self, card, context, 'j_poke_marill');
    },
  },
  // Nosepass 299
  nosepass: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play) {
        if (context.other_card === card.ability.extra.first) {
          return { x_mult: card.ability.extra.Xmult_multi, colour: 'XMULT', card };
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) {
          if (!card.ability.extra.first) {
            for (let i = 0; i < context.scoring_hand.length; i++) {
              if (context.scoring_hand[i].is_face()) {
                context.scoring_hand[i].set_ability(P_CENTERS.m_stone, null, true);
                card.ability.extra.first = context.scoring_hand[i];
                break;
              }
            }
          }
        }
        if (context.after) card.ability.extra.first = undefined;
      }
      return item_evo(self, card, context, 'j_poke_probopass');
    },
  },
}, FILE);
