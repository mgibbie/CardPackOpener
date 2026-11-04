// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0765_oranguru.lua: Oranguru.
// 1.7.9 rework: +1 card selection while a Standard Pack is open (PkmnDip.eff.mod_booster on open_booster / ending_booster, and
// when bought or sold mid-pack), and every card a booster makes (Steamodded's modify_booster_card) takes one of your full deck's
// most common ranks (seed 'Oranguru'). 1.6.4 raised booster_choice_mod and re-rolled the Standard pack's cards (suit, edition,
// seal) itself. (A booster card without a rank — a Tarot — keeps its face: SMODS.change_base can't give it one.)
import { G, pseudorandom_element, pseudoseed, change_base, defineNacho, type_tooltip, common_ranks_tooltip } from '../api.js';
import { calc, con, mod_booster } from '../dip.js';

const FILE = 'src/pokemon/0765_oranguru.lua';

defineNacho({
  oranguru: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      common_ranks_tooltip(self, info_queue);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.open_booster && con.in_booster('Standard')) mod_booster(card.ability.extra.booster_choice_mod);
      if (context.ending_booster && con.in_booster('Standard')) mod_booster(-card.ability.extra.booster_choice_mod);
      if (context.modify_booster_card && context.card && context.card.base && context.card.base.suit && !context.card.ability.consumeable) {
        const ranks = calc.get_common_ranks();
        if (ranks.length) {
          const rank = pseudorandom_element(ranks, pseudoseed('Oranguru'))[0];
          change_base(context.card, undefined, rank.key);
        }
      }
      return undefined;
    },
    add_to_deck(self, card) { if (con.in_booster('Standard')) mod_booster(card.ability.extra.booster_choice_mod); },
    remove_from_deck(self, card) { if (con.in_booster('Standard')) mod_booster(-card.ability.extra.booster_choice_mod); },
  },
}, FILE);
