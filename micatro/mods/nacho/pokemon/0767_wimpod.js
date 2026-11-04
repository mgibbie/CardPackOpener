// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0767_wimpod.lua: Wimpod, Golisopod (new in 1.7.9; BFP designs by One Punch Idiot).
// Emergency Exit: from the second hand of a round on, it faints (debuffed for the round: PkmnDip.eff.faint) before scoring.
// Wimpod: +30 Chips (4 rounds to evolve). Golisopod: X3 Mult; beating a Boss Blind without having fainted this ante gives +1
// hand size for good (lost if it faints later). Neither can be Eternal.
import { G, defineNacho, type_tooltip, level_evo, main_eval } from '../api.js';
import { faint } from '../dip.js';

const FILE = 'src/pokemon/0767_wimpod.lua';
const emergency_exit = (context) => context.before && main_eval(context) && !context.blueprint && G.GAME.current_round.hands_played >= 1;

defineNacho({
  // Wimpod 767
  wimpod: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.chips, card.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (emergency_exit(context)) faint(card, false, true);
      if (context.joker_main) return { chips: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_nacho_golisopod');
    },
  },
  // Golisopod 768
  golisopod: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (emergency_exit(context)) { a.ante_debuffed = true; faint(card, false, true); }
      if (context.joker_main) return { Xmult: a.Xmult };
      if (context.end_of_round && main_eval(context) && !context.individual && !context.repetition && !context.blueprint && context.beat_boss) {
        if (!a.ante_debuffed && !a.raised) {
          G.hand.change_size(a.h_size);
          a.raised = true;
        }
        a.ante_debuffed = undefined;
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) { if (card.ability.extra.raised && from_debuff) G.hand.change_size(card.ability.extra.h_size); },
    remove_from_deck(self, card) {
      const a = card.ability.extra;
      G.hand.change_size(a.raised ? -a.h_size : 0);
      if (a.ante_debuffed) a.raised = undefined;
    },
  },
}, FILE);
