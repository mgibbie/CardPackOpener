// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0963_Finizen.lua: Finizen, Palafin, Palafin-Hero (new in 1.7.9; BFP designs).
// Finizen: +30 Chips (6 rounds to evolve). Palafin: +50 Chips; after the first hand it scores it vanishes ("Flip Turn!":
// removed, its joker slot kept), then comes back at the end of the round as Palafin-Hero (a copy of it, transformed: the mod's
// own calculate — ../systems.js palafin_return). Palafin-Hero (Gen 9 {8,1}, aux form, not in the collection): +100 Chips; the
// first scoring card gains +5 Chips for good, and +X0.05 Mult if it is a Bonus card; beating the Boss Blind turns it back
// into Palafin. Neither can be Eternal.
// Intended-design fix: the Lua starts a card's perma_x_mult at 1 (`or 1`), so the first Bonus card jumped to +X1.05; the card
// text ("gains X0.05 Mult") and Steamodded's own default start it at 0.
import { G, localize, card_eval_status_text, defineNacho, type_tooltip, level_evo, poke_evolve, main_eval } from '../api.js';
import { con, defer, vanish_joker } from '../dip.js';

const FILE = 'src/pokemon/0963_Finizen.lua';

/** The Palafins that vanished this round (PkmnDip.palafin), by unique_val; ../systems.js brings them back. Per run. */
export const vanished = () => (G.nacho_palafin = G.nacho_palafin || new Map());

defineNacho({
  // Finizen 963
  finizen: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.chips, card.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { chips: card.ability.extra.chips };
      return level_evo(self, card, context, 'j_nacho_palafin');
    },
  },
  // Palafin 964
  palafin: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.chips] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        if (!context.blueprint) {
          vanished().set(card.unique_val, card);
          defer(() => {
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_flipturn_ex'), colour: 'CHIPS' });
            vanish_joker(card);
          });
        }
        return { chips: card.ability.extra.chips };
      }
      return undefined;
    },
  },
  // Palafin-Hero 964-1
  palafin_hero: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.chips1, card.ability.extra.chip_mod, card.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.joker_main) return { chips: a.chips1 };
      if (context.before && main_eval(context)) {
        return { message: localize(con.is_bonus(context.scoring_hand[0]) ? 'poke_jetpunch_ex' : 'poke_aquajet_ex'), colour: 'CHIPS' };
      }
      if (context.individual && context.cardarea === G.play && context.other_card === context.scoring_hand[0]) {
        const other = context.other_card;
        other.ability.perma_bonus = (other.ability.perma_bonus || 0) + a.chip_mod;
        if (con.is_bonus(other)) other.ability.perma_x_mult = (other.ability.perma_x_mult || 0) + a.Xmult_multi;
      }
      if (context.beat_boss && context.end_of_round && main_eval(context) && !context.individual && !context.repetition && !context.blueprint) {
        const message = poke_evolve(card, 'j_nacho_palafin', true);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_devolve_success'), colour: 'CHIPS' });
        return { message };
      }
      return undefined;
    },
  },
}, FILE);
