// Pokermon 3.2.1 — pokemon/pokejokers_26.lua (Pokédex 751-780: Mimikyu), 1 joker.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
// The busted-disguise sprite (broke_pos) is view data: `ability.extra.disguise === false`.
import * as BN from '../../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { G, localize, play_sound, defineJokers, type_tooltip } from '../api.js';

const FILE = 'pokemon/pokejokers_26.lua';

defineJokers({
  // Mimikyu 778
  mimikyu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, localize(center.ability.extra.suit, 'suits_plural'),
        center.ability.extra.disguise ? localize('poke_disguise_intact') : localize('poke_disguise_broken')] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let no_hearts = true;
        for (const c of context.scoring_hand) {
          if (c.is_suit(card.ability.extra.suit)) { no_hearts = false; break; }
        }
        if (no_hearts) return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      if (context.end_of_round && context.game_over && card.ability.extra.disguise) {
        let save = false;
        if (BN.gte(BN.div(G.GAME.chips, G.GAME.blind.chips), 0.50)) save = true;
        if (save) {
          card.ability.extra.disguise = false;
          G.E_MANAGER.add_event(() => { play_sound('tarot2', 1, 0.4); play_sound('tarot2', 0.76, 0.4); });
          return { message: localize('k_saved_ex'), saved: true, colour: 'RED' };
        }
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) card.ability.extra.disguise = true;
    },
  },
}, FILE);
