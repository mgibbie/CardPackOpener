// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0776_turtonator.lua: Turtonator (Shell Trap).
// When the Boss Blind's ability triggers (calc_boss_trigger, ../functions.js), the next played
// hand's scoring cards give X1.5 Mult.
import { G, localize, card_eval_status_text, defineNacho, type_tooltip, calc_boss_trigger, main_eval } from '../api.js';

defineNacho({
  turtonator: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.trapped ? 'Active!' : 'Inactive'] };
    },
    calculate(self, card, context) {
      if (calc_boss_trigger(context) && !card.ability.extra.trapped) {
        card.ability.extra.trapped = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_shell_trap_ex') });
      }
      if (context.before && main_eval(context) && card.ability.extra.trapped) {
        return { message: localize('poke_shell_trap_ex'), colour: 'XMULT', card };
      }
      if (context.individual && context.cardarea === G.play && context.scoring_hand && card.ability.extra.trapped) {
        card.ability.extra.set_off = true;
        return { xmult: card.ability.extra.Xmult_mod, colour: 'XMULT' };
      }
      // Shell Trap on/off switch
      if ((context.joker_main || context.debuffed_hand) && card.ability.extra.trapped && card.ability.extra.set_off) {
        card.ability.extra.trapped = false;
        card.ability.extra.set_off = false;
      }
      return undefined;
    },
  },
}, 'src/pokemon/0776_turtonator.lua');
