// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0692_clauncher.lua: Clauncher, Clawitzer.
// OFF by default (the shipped config.lua has Clauncher = false); the "Clauncher line" option enables it.
import { G, P_CENTERS, localize, next, defineNacho, type_tooltip, detailed, level_evo } from '../api.js';

const FILE = 'src/pokemon/0692_clauncher.lua';

function edition_tips(info_queue, card) {
  if (!detailed()) return;
  if (!card.edition || !card.edition.polychrome) info_queue.push(P_CENTERS.e_polychrome);
  if (!card.edition || !card.edition.foil) info_queue.push(P_CENTERS.e_foil);
  if (!card.edition || !card.edition.holo) info_queue.push(P_CENTERS.e_holo);
}
/**
 * `next(context.card_effects[1]) or #context.card_effects > 1` — did the card do anything?
 * Intended-design fix: SMODS only passes card_effects to the held-in-hand repetition pass, so on a
 * PLAYED card the Lua indexed nil and errored (one reason the line shipped disabled); a played
 * card always scores, so it counts as having an effect.
 */
const has_effect = (context) => !context.card_effects || next(context.card_effects[0] || {}) || context.card_effects.length > 1;
/** In the pool only while a deck card has Foil / Holo / Polychrome.
 *  Intended-design fix: the Lua tests `edition.holographic`, a key no edition has (Holographic is
 *  `edition.holo`), so Holographic cards never counted. */
function in_pool() {
  for (const v of G.playing_cards || []) if (v.edition && (v.edition.foil || v.edition.holo || v.edition.polychrome)) return true;
  return false;
}
const edition_key = (e) => e.key || (e.type ? 'e_' + e.type : undefined);

defineNacho({
  // Clauncher 692: retrigger each played / held card whose edition is new this pass
  clauncher: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); edition_tips(info_queue, card); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) {
      // (Lua `editions = {}` survives the data export as an object: a list here.)
      if (!Array.isArray(card.ability.extra.editions)) card.ability.extra.editions = [];
      const eds = card.ability.extra.editions;
      if (context.repetition && (context.cardarea === G.play || context.cardarea === G.hand) && context.other_card.edition && has_effect(context)) {
        const k = edition_key(context.other_card.edition);
        if (!eds.includes(k)) {
          if (!context.blueprint) eds.push(k);
          return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        }
      }
      // Reset the scored editions between the played and the held cards ...
      if (context.repetition && context.cardarea === G.play && !context.blueprint && context.other_card === G.play.cards[G.play.cards.length - 1]) eds.length = 0;
      // ... and after a hand scores / when a blind starts
      if ((context.joker_main || context.setting_blind) && !context.blueprint) eds.length = 0;
      return level_evo(self, card, context, 'j_nacho_clawitzer');
    },
    in_pool,
  },
  // Clawitzer 693: retrigger every played / held card with an edition
  clawitzer: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); edition_tips(info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      if (context.repetition && (context.cardarea === G.hand || context.cardarea === G.play) && has_effect(context) && context.other_card.edition) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
    in_pool,
  },
}, FILE);
