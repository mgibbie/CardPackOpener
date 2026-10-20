// Pokermon 3.9.1 — pokemon/pokejokers_26.lua (Pokédex 751-780: Mimikyu), 1 joker.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file).
// The busted-disguise sprite (broke_pos) is view data: `ability.extra.disguise_broken` (3.9.1; 3.2.1 saves carry
// `disguise === false`, which systems/anim.js still reads).
import * as BN from '../../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { G, localize, play_sound, defineJokers, type_tooltip } from '../api.js';

const FILE = 'pokemon/pokejokers_26.lua';

/** Broken? (3.9.1 `disguise_broken`; a 3.2.1 card in a resumed run has `disguise: false` instead.) */
const broken = (card) => !!card.ability.extra.disguise_broken || card.ability.extra.disguise === false;

defineJokers({
  // Mimikyu 778
  mimikyu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, localize(center.ability.extra.suit, 'suits_plural'),
        !broken(center) ? localize('poke_disguise_intact') : localize('poke_disguise_broken')] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let no_hearts = true;
        for (const c of context.scoring_hand) {
          if (c.is_suit(card.ability.extra.suit)) { no_hearts = false; break; }
        }
        if (no_hearts) return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      if (context.end_of_round && context.game_over && !broken(card)) {
        let save = false;
        if (BN.gte(BN.div(G.GAME.chips, G.GAME.blind.chips), 0.50)) save = true;
        if (save) {
          // Pokermon 3.9.1: the flag is `disguise_broken` (was `disguise = false`); the "Saved by Mimikyu" line is the
          // engine's (G.GAME.saved_by).
          card.ability.extra.disguise_broken = true;
          card.ability.extra.disguise = undefined;
          G.E_MANAGER.add_event(() => { play_sound('tarot2', 1, 0.4); play_sound('tarot2', 0.76, 0.4); });
          return { message: localize('k_saved_ex'), saved: true, colour: 'RED' };
        }
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) { card.ability.extra.disguise_broken = undefined; card.ability.extra.disguise = undefined; }
    },
  },
}, FILE);
