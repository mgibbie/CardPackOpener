// Pokermon 3.9.1 — pokemon/pokejokers_22.lua (Pokédex 631-660: Deino -> Diggersby), 3 jokers + 2 new in 3.9.1
// (Bunnelby / Diggersby: at the end, new-jokers sub-batch 15; static data: data391.js new_jokers).
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file; the Deino / Zweilous house rule stays).
import {
  G, localize,
  defineJokers, type_tooltip, scaling_evo, scale_card,
  card_eval_status_text, has_no_rank, find_playing_card, add_card, get_probability_vars, pseudorandom_probability, poke_nope,
} from '../api.js';

const FILE = 'pokemon/pokejokers_22.lua';
// Bunnelby / Diggersby (3.9.1, new-jokers sub-batch 15)
const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;
/** A drawn card with a rank, none of which is left in the deck (pokermon.find_playing_card over G.deck). */
const depleted_rank = (drawnCard) => !has_no_rank(drawnCard) && !find_playing_card((v) => drawnCard.get_id() === v.get_id()).length;
/** A Tarot card (SMODS.add_card in an event, held by consumeable_buffer meanwhile) and its "+1 Tarot". */
function dig_tarot(card) {
  G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
  G.E_MANAGER.add_event(() => { add_card({ set: 'Tarot' }); G.GAME.consumeable_buffer = 0; });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: 'PURPLE' });
}

const has_three = (context) => context.poker_hands && context.poker_hands['Three of a Kind'] && context.poker_hands['Three of a Kind'].length;

/** Deino / Zweilous: XMult on a hand containing a Three of a Kind, counting the hands toward evolution.
 *  House rule (owner, 2026-10-18): the Lua checks scoring_name === 'Three of a Kind' (an exact one), so a Full
 *  House never triggered; here any hand that contains one does (text updated in index.js).
 *  Pokermon 3.9.1: the hand is counted at `before` (not Blueprint), the XMult comes at joker_main. */
function deino_calc(self, card, context, key) {
  if (has_three(context)) {
    if (context.before && context.cardarea === G.jokers && !context.blueprint) card.ability.extra.hand_played = card.ability.extra.hand_played + 1;
    if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
      // (Lua colour G.C.mult — lowercase, nil — so the default popup colour.)
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), Xmult_mod: card.ability.extra.Xmult };
    }
  }
  return scaling_evo(self, card, context, key, card.ability.extra.hand_played, self.config.evo_rqmt);
}
function deino_vars(self, info_queue, center) {
  type_tooltip(self, info_queue, center);
  return { vars: [center.ability.extra.Xmult, Math.max(0, self.config.evo_rqmt - center.ability.extra.hand_played)] };
}

defineJokers({
  // Deino 633
  deino: {
    loc_vars: deino_vars,
    calculate(self, card, context) { return deino_calc(self, card, context, 'j_poke_zweilous'); },
  },
  // Zweilous 634
  zweilous: {
    loc_vars: deino_vars,
    calculate(self, card, context) { return deino_calc(self, card, context, 'j_poke_hydreigon'); },
  },
  // Hydreigon 635
  hydreigon: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      // Pokermon 3.9.1: a Three of a Kind's unscored cards are destroyed in the destroy_card pass (cardarea 'unscored').
      if (context.destroy_card && context.scoring_name === 'Three of a Kind' && !context.blueprint && context.cardarea === 'unscored') {
        return { remove: true };
      }
      if (context.remove_playing_cards && !context.blueprint) {
        for (let i = 0; i < context.removed.length; i++) scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod' });
      }
      return undefined;
    },
  },
  // ---------------------------------------------------------------- new in 3.9.1 (new-jokers sub-batch 15)
  // Bunnelby 659: a drawn card whose rank is now depleted from the deck gives 1 in 3 for a Tarot card (must have room);
  // evolves after 4 Tarots.
  bunnelby: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'deplete' });
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'bunnelby');
      return { vars: [num, dem, Math.max(self.config.evo_rqmt - card.ability.extra.triggers, 0)] };
    },
    calculate(self, card, context) {
      // (SMODS.drawn_cards = Micatro's context.hand_drawn, during the Blind)
      if (context.hand_drawn && G.deck && G.deck.cards) {
        for (const drawnCard of context.hand_drawn) {
          if (!depleted_rank(drawnCard)) continue;
          if (pseudorandom_probability(card, 'bunnelby', card.ability.extra.num, card.ability.extra.dem, 'bunnelby')) {
            if (room()) {
              if (!context.blueprint) card.ability.extra.triggers = card.ability.extra.triggers + 1;
              dig_tarot(context.blueprint_card || card);
            }
          } else {
            poke_nope(context.blueprint_card || card);
          }
        }
      }
      return scaling_evo(self, card, context, 'j_poke_diggersby', card.ability.extra.triggers, self.config.evo_rqmt);
    },
  },
  // Diggersby 660: a drawn card whose rank is now depleted from the deck gives 1 in 3 for a Tarot card (must have room) and
  // +2 Mult (room or not).
  diggersby: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'deplete' });
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'diggersby');
      return { vars: [num, dem, card.ability.extra.mult, card.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.hand_drawn && G.deck && G.deck.cards) {
        for (const drawnCard of context.hand_drawn) {
          if (!depleted_rank(drawnCard)) continue;
          // (its roll uses Bunnelby's seed, as the Lua)
          if (pseudorandom_probability(card, 'bunnelby', card.ability.extra.num, card.ability.extra.dem, 'bunnelby')) {
            if (room()) dig_tarot(context.blueprint_card || card);
            if (!context.blueprint) scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', message_colour: 'MULT' });
          } else {
            poke_nope(context.blueprint_card || card);
          }
        }
      }
      if (context.joker_main && card.ability.extra.mult > 0) return { mult: card.ability.extra.mult };
      return undefined;
    },
  },
}, FILE);
