// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0333_swablu.lua: Swablu, Altaria, Mega Altaria.
// (Altaria's "9s can't be debuffed" is the mod's set_debuff rule: ../functions.js.)
import { G, P_CENTERS, poll_edition, defineNacho, type_tooltip, level_evo, ease_poke_dollars } from '../api.js';

const FILE = 'src/pokemon/0333_swablu.lua';

const nines = () => { let n = 0; if (G.playing_cards) for (const v of G.playing_cards) if (v.get_id() === 9) n = n + 1; return n; };
/** Altaria: unenhanced 9s count once, enhanced 9s twice. */
const altaria_nines = () => {
  let n = 0;
  if (G.playing_cards) for (const v of G.playing_cards) if (v.get_id() === 9) { n = n + 1; if (v.config.center !== P_CENTERS.c_base) n = n + 1; }
  return n;
};

defineNacho({
  // Swablu 333
  swablu: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.money, card.ability.extra.money * nines(), card.ability.extra.rounds] };
    },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_nacho_altaria'); },
    calc_dollar_bonus(self, card) { return ease_poke_dollars(card, 'swablu', card.ability.extra.money * nines(), true); },
  },
  // Altaria 334
  altaria: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.money, card.ability.extra.money * 2, card.ability.extra.money * altaria_nines()] };
    },
    calc_dollar_bonus(self, card) { return ease_poke_dollars(card, 'altaria', card.ability.extra.money * altaria_nines(), true); },
  },
  // Mega Altaria 334-1: each played 9 without an edition gets Foil / Holo / Polychrome
  mega_altaria: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        for (const v of G.play.cards) {
          if (v.get_id() === 9 && !v.edition) {
            const edition = poll_edition('aura', null, true, true);
            v.set_edition(edition, true, true);
            v.juice_up(0.3, 0.5);
          }
        }
      }
      return undefined;
    },
  },
}, FILE);
