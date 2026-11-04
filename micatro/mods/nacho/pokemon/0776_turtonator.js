// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0776_turtonator.lua: Turtonator (Shell Trap).
// 1.7.9 rework: Shell Trap arms when your hand is debuffed or anything is debuffed while it is owned (the shell_trap context:
// its Card:set_debuff wrap and the SMODS debuff patch — ../systems.js debuff_set); the next played hand's scoring cards give
// X1.5 Mult, then it disarms (and re-arms at once if a scoring card was debuffed). 1.6.4 armed on a Boss Blind's ability
// (calc_boss_trigger).
import { G, localize, calculate_context, defineNacho, type_tooltip, juice_card_until, main_eval } from '../api.js';
import { defer, utils, in_blind } from '../dip.js';

const FILE = 'src/pokemon/0776_turtonator.lua';

defineNacho({
  turtonator: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'shell_trap' });
      return { vars: [card.ability.extra.Xmult_multi, card.ability.extra.trapped ? 'Active!' : 'Inactive'] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      const eval_fn = () => a.trapped && in_blind();
      if (context.setting_blind && a.trapped) juice_card_until(card, eval_fn, true);
      if ((context.debuffed_hand || context.shell_trap) && !a.trapped) {
        juice_card_until(card, eval_fn, true);
        // (the Lua sets it in the effect's func; the debuffed_hand path doesn't run funcs in Micatro, so it is set here)
        a.trapped = true;
        return { message: localize('k_active_ex') };
      }
      if (context.after) {
        const hand = context.scoring_hand || [];
        defer(() => {
          if (a.trapped) a.trapped = undefined;
          if (utils.any(hand, (c) => c.debuff)) calculate_context({ shell_trap: true });
        });
      }
      if (context.before && main_eval(context) && a.trapped) return { message: localize('poke_shell_trap_ex'), colour: 'XMULT' };
      if (context.individual && context.cardarea === G.play && a.trapped) return { xmult: a.Xmult_multi };
      return undefined;
    },
  },
}, FILE);

