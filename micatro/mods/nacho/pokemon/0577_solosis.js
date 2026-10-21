// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0577_solosis.lua: Solosis, Duosion, Reuniclus (new in 1.7.9).
// When the hand is played (Solosis / Duosion: the first hand of the round only), the first played card is copied into the
// played hand — 1 copy (Duosion / Reuniclus: 2), as far as the play limit allows — and the copies are destroyed after scoring.
// Solosis evolves after 4 copies, Duosion after 8.
import { G, defineNacho, type_tooltip, scaling_evo, juice_card_until, calculate_context, smods_copy_card } from '../api.js';
import { defer_after_play } from '../dip.js';

const FILE = 'src/pokemon/0577_solosis.lua';

/** The deferred copy (after the played cards reach G.play): `count` copies of G.play.cards[1] up to the play limit. */
function copy_first(card, count, tally) {
  defer_after_play(() => {
    const copies = [];
    const delta = (G.GAME.starting_params.play_limit ?? 5) - G.play.cards.length;
    if (delta > 0 && G.play.cards[0]) {
      for (let i = 0; i < Math.min(count, delta); i++) {
        const copy = smods_copy_card(G.play.cards[0], { area: G.play });
        copy.is_solosis_copy = true;
        copies.push(copy);
        if (tally) card.ability.extra.copies_made = card.ability.extra.copies_made + 1;
      }
    }
    if (copies.length) calculate_context({ playing_card_added: true, cards: copies });
  });
}
function cell(self, card, context, tally, first_only) {
  if (first_only && context.first_hand_drawn && !context.blueprint) {
    juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES, true);
  }
  if (context.press_play && (!first_only || G.GAME.current_round.hands_played === 0)) copy_first(card, card.ability.extra.copies, tally);
  if (context.destroy_card && context.destroy_card.is_solosis_copy && !context.blueprint) return { remove: true };
  return undefined;
}

defineNacho({
  // Solosis 577
  solosis: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.copies, Math.max(0, self.config.evo_rqmt - card.ability.extra.copies_made)] };
    },
    calculate(self, card, context) {
      return cell(self, card, context, true, true) || scaling_evo(self, card, context, 'j_nacho_duosion', card.ability.extra.copies_made, self.config.evo_rqmt);
    },
  },
  // Duosion 578
  duosion: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.copies, Math.max(0, self.config.evo_rqmt - card.ability.extra.copies_made)] };
    },
    calculate(self, card, context) {
      return cell(self, card, context, true, true) || scaling_evo(self, card, context, 'j_nacho_reuniclus', card.ability.extra.copies_made, self.config.evo_rqmt);
    },
  },
  // Reuniclus 579
  reuniclus: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.copies] }; },
    calculate(self, card, context) { return cell(self, card, context, false, false); },
  },
}, FILE);
