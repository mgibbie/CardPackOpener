// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0781_dhelmise.lua: Dhelmise (new in 1.7.9).
// This joker scores as a held Steel card (PkmnDip.eff.joker_as_card: a temporary Steel card in hand for the hand, with the
// joker's edition — ../dip.js), and the Energy on every Dhelmise applies to held Steel cards: X(1.5 + 1.5 x 0.05 x Energy)
// (its Card:get_chip_h_x_mult wrap: ../systems.js chip_h_x_mult).
import { G, P_CENTERS, defineNacho, type_tooltip, find_card, get_total_energy } from '../api.js';
import { joker_as_card } from '../dip.js';

const FILE = 'src/pokemon/0781_dhelmise.lua';

/** the Energy on every Dhelmise (SMODS.find_card('j_nacho_dhelmise')) */
export const total_ecount = () => find_card('j_nacho_dhelmise').reduce((n, j) => n + get_total_energy(j), 0);

defineNacho({
  dhelmise: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'energize' });
      info_queue.push(P_CENTERS.m_steel);
      return { vars: [1.5 + 1.5 * 0.05 * (G.jokers ? total_ecount() : 0)] };
    },
    calculate(self, card, context) {
      if (context.before) joker_as_card(card, { area: G.hand, enhancement: 'm_steel', edition: card.edition });
      return undefined;
    },
  },
}, FILE);
