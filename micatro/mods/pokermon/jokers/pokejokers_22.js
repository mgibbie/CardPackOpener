// Pokermon 3.9.1 — pokemon/pokejokers_22.lua (Pokédex 631-660: Deino -> Hydreigon), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file; the Deino / Zweilous house rule stays).
import {
  G, localize,
  defineJokers, type_tooltip, scaling_evo, scale_card,
} from '../api.js';

const FILE = 'pokemon/pokejokers_22.lua';

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
}, FILE);
