// Pokermon+ — src/pokemon/453_croagunk_line.lua: Croagunk, Toxicroak.
//
// Croagunk shipped switched OFF (config.lua croagunk = false; the localization even has a
// "Croagunk Test" challenge name): as written it could never evolve. Its retriggers were zeroed
// after EVERY hand (`context.after`), and every round ends on a played hand, so the end-of-round
// check "retriggers >= 5" never saw more than 0. Fixed as its text describes, and on by default:
//  - Intended-design fix: "If scoring hand contains Purple Seal cards, retrigger them and reset
//    this Joker's retriggers to 0" — the reset happens only after a hand whose scoring cards
//    include a Purple Seal (the stored retriggers were spent), not after every hand.
// Toxicroak, intended-design fixes:
//  - it compared `consumeable.ability.key`, a field cards don't have (nil == nil, so EVERY
//    consumable of any kind counted as "the same Tarot"), while its tooltip expects a {key, set}
//    table. Now: only Tarot cards count; the same Tarot again = +1, a different Tarot = back to 1;
//    previous_tarot is stored as {key, set} for the "(Previous Tarot: ...)" line.
//  - "(Resets at end of Ante if no Tarot cards were used)": `reset` was set false on the first
//    use and never set true again, so it never reset. Now each Boss Blind's end of round resets
//    the count if no Tarot was used that Ante, and re-arms the check for the next Ante.
import { G, localize, type_tooltip, scaling_evo } from '../../../pokermon/api.js';

export default {
  croagunk: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      return { vars: [a.retriggers || 0, a.evo_rqmt] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      // A discard of exactly 5 Purple Seal cards: +1 stored retrigger (once per discard).
      if (context.discard && context.full_hand && context.full_hand.length === 5) {
        if (!a.handled) {
          if (context.full_hand.every((c) => c.seal === 'Purple')) a.retriggers = (a.retriggers || 0) + 1;
          a.handled = true;
        }
      }
      if (!context.discard) a.handled = false;

      if (context.repetition && !context.end_of_round && context.cardarea === G.play && context.other_card.seal === 'Purple') {
        // The stored retriggers are split evenly over the scoring cards (by position).
        const total = a.retriggers || 0;
        const cards = context.scoring_hand.length;
        const pos = context.scoring_hand.indexOf(context.other_card) + 1;
        let retriggers = Math.floor(total / cards);
        const remainder = total % cards;
        if (pos <= remainder) retriggers = retriggers + 1;
        if (retriggers > 0) return { message: localize('k_again_ex'), repetitions: retriggers, card };
        return undefined;
      }

      if (context.after && context.scoring_hand && context.scoring_hand.some((c) => c.seal === 'Purple')) a.retriggers = 0;

      return scaling_evo(self, card, context, 'j_sonfive_toxicroak', a.retriggers || 0, a.evo_rqmt);
    },
  },

  toxicroak: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      let last_tarot;
      if (a.previous_tarot && typeof a.previous_tarot === 'object' && a.previous_tarot.key && a.previous_tarot.set) {
        last_tarot = localize({ type: 'name_text', key: a.previous_tarot.key, set: a.previous_tarot.set });
      } else last_tarot = localize('poke_none');
      return { vars: [a.retriggers || 0, last_tarot] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.using_consumeable && !context.blueprint) {
        const used = context.consumeable;
        if (used && used.ability.set === 'Tarot') {
          const key = used.config.center.key;
          const prev = a.previous_tarot && typeof a.previous_tarot === 'object' ? a.previous_tarot.key : undefined;
          if (key === prev) a.retriggers = (a.retriggers || 0) + 1;
          else { a.retriggers = 1; a.previous_tarot = { key, set: 'Tarot' }; }
          a.reset = false;
        }
      } else if (context.repetition && context.cardarea === G.play && !context.other_card.debuff) {
        if (context.other_card.seal === 'Purple' && (a.retriggers || 0) > 0) {
          return { message: localize('k_again_ex'), repetitions: a.retriggers, card };
        }
      } else if (context.end_of_round && G.GAME.blind.boss && !context.repetition && !context.individual && !context.blueprint) {
        if (a.reset) a.retriggers = 0;
        a.reset = true;
      }
      return undefined;
    },
  },
};
