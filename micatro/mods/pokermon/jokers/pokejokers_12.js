// Pokermon 3.2.1 — pokemon/pokejokers_12.lua (Pokédex 331-360: Feebas -> Wynaut), 6 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req) comes from data.js. See ../PORTING.md.
import {
  G, P_CENTERS, localize, card_eval_status_text, create_card,
  defineJokers, type_tooltip, detailed, level_evo, item_evo, faint_baby_poke, poke_same_suit, poke_remove_card, add_card,
} from '../api.js';

const FILE = 'pokemon/pokejokers_12.lua';

/** Duskull / Dusclops: retrigger the first 4 scoring cards of the final hand. */
function dusk_retrigger(card, context) {
  if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_left === 0) {
    const sh = context.scoring_hand;
    if (context.other_card === sh[0] || context.other_card === sh[1] || context.other_card === sh[2] || context.other_card === sh[3]) {
      return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
    }
  }
  return undefined;
}
/** Baby Pokémon: X Mult below 1 (faints unless only Babies are to its right). */
function baby_xmult(self, card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.joker_main) {
      faint_baby_poke(self, card, context);
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_minus] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
    }
  }
  return undefined;
}

defineJokers({
  // Feebas 349
  feebas: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Joker', key: 'j_splash', config: {} });
      return { vars: [center.ability.extra.mult] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return item_evo(self, card, context, 'j_poke_milotic');
    },
  },
  // Milotic 350
  milotic: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return undefined; // (Lua returns nothing)
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && poke_same_suit(context.scoring_hand)) card.ability.extra.active = true;
        if (context.after && card.ability.extra.active) card.ability.extra.active = false;
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && card.ability.extra.active) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Duskull 355
  duskull: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.retriggers, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = dusk_retrigger(card, context);
      if (r) return r;
      return level_evo(self, card, context, 'j_poke_dusclops');
    },
  },
  // Dusclops 356
  dusclops: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      const r = dusk_retrigger(card, context);
      if (r) return r;
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.after && G.GAME.current_round.hands_left === 0 && (context.full_hand.length - context.scoring_hand.length) === 1 && !context.blueprint) {
          for (const v of context.full_hand) {
            if (!context.scoring_hand.includes(v)) {
              poke_remove_card(v, card);
              G.E_MANAGER.add_event(() => {
                const _card = add_card({ set: 'Spectral' });
                card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
              });
              break;
            }
          }
        }
      }
      return item_evo(self, card, context, 'j_poke_dusknoir');
    },
  },
  // Absol 359
  absol: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.scry] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      // Every listed probability (SMODS.get_probability_vars) is fixed to 0.
      if (context.fix_probability && !context.blueprint) return { numerator: 0 };
      return undefined;
    },
  },
  // Wynaut 360
  wynaut: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
        info_queue.push(P_CENTERS.c_fool);
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = baby_xmult(self, card, context);
      if (r) return r;
      if (context.end_of_round && !context.individual && !context.repetition && !card.debuff) {
        const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
      return level_evo(self, card, context, 'j_poke_wobbuffet');
    },
  },
}, FILE);
