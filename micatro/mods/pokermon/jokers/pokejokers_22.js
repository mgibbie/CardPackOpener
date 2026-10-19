// Pokermon 3.2.1 — pokemon/pokejokers_22.lua (Pokédex 631-660: Deino -> Hydreigon), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
import {
  G, localize, card_eval_status_text,
  defineJokers, type_tooltip, scaling_evo, poke_remove_card,
} from '../api.js';

const FILE = 'pokemon/pokejokers_22.lua';

/** Deino / Zweilous: XMult on a hand containing a Three of a Kind, counting the hands toward evolution.
 *  House rule (owner, 2026-10-18): the Lua checks scoring_name === 'Three of a Kind' (an exact one), so a Full
 *  House never triggered; here any hand that contains one does (text updated in index.js). */
function deino_calc(self, card, context, key) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands
    && context.poker_hands['Three of a Kind'] && context.poker_hands['Three of a Kind'].length) {
    if (!context.blueprint) card.ability.extra.hand_played = card.ability.extra.hand_played + 1;
    // (Lua colour G.C.mult — lowercase, nil — so the default popup colour.)
    return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), Xmult_mod: card.ability.extra.Xmult };
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
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
        if (context.after && context.scoring_name === 'Three of a Kind' && !context.blueprint) {
          for (const v of context.full_hand.slice()) {
            if (!context.scoring_hand.includes(v)) poke_remove_card(v, card);
          }
        }
      }
      if (context.remove_playing_cards && !context.blueprint) {
        for (let i = 0; i < context.removed.length; i++) {
          card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        }
      }
      return undefined;
    },
  },
}, FILE);
