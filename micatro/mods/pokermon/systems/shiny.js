/**
 * Shiny edition (e_poke_shiny) — native rebuild of Pokermon's editions/editions1.lua and
 * the shiny bookkeeping spread over pokermon.lua / lovely.toml:
 *   - weight 2, in_shop, +$5 cost (extra_cost), no scoring effect; alt (shiny) art is the
 *     renderer's job (the view exposes edition 'poke_shiny').
 *   - While a shiny card is owned the shop has +1 booster slot (SMODS.change_booster_limit):
 *       on_apply: owned (not in a pack / the shop) -> +1 now; otherwise remember
 *                 shiny_on_add and give the slot when the card is added to the deck;
 *       on_remove (edition replaced) -> -1; Card:remove of an owned, non-debuffed shiny
 *       in the joker row / hand / play -> -1; a Perishable shiny running out -> -1.
 *   - shiny_playing_cards option OFF (default): playing cards (anything but jokers) can't
 *     become shiny. (Lua only caught the 'e_poke_shiny' string form; Micatro refuses the
 *     {poke_shiny=true} form too — the intended rule.)
 *
 * Engine seams used: content edition center (Card.set_edition on_apply/on_remove/extra_cost,
 * weighted poll_edition), hooks add_to_deck / card_removed / set_edition / end_round.
 */
import { G } from '../../../js/engine/core.js';
import { change_booster_limit } from '../../../js/engine/run.js';
import { cfg } from './utils.js';

export const shiny_edition = {
  key: 'e_poke_shiny', set: 'Edition', name: 'Shiny',
  atlas: 'AtlasJokersBasicNatdexShiny', pos: { x: 0, y: 0 },
  shader: 'shiny', apply_to_float: true,
  config: {}, in_shop: true, weight: 2, extra_cost: 5,
  sound: { sound: 'poke_e_shiny', per: 1, vol: 0.2 },
  loc_vars: () => ({ vars: [] }),
  on_apply(card) {
    if (card.area) {
      if (card.area === G.pack_cards || card.area === G.shop_jokers) card.shiny_on_add = true;
      else change_booster_limit(1);
    } else card.shiny_on_add = true;
  },
  on_remove(card) { change_booster_limit(-1); },
};

export const shiny_hooks = {
  /** lovely "Extra Booster Functionality": the slot arrives when a shop / pack shiny is added. */
  add_to_deck(card) {
    if (card.shiny_on_add && !card.debuff) {
      card.shiny_on_add = false;
      change_booster_limit(1);
    }
  },
  /** pokermon.lua Card:remove hook. */
  card_removed(card) {
    if (card.edition && card.edition.poke_shiny && !card.debuff && card.area && (card.area === G.jokers || card.area === G.hand || card.area === G.play)) {
      change_booster_limit(-1);
    }
  },
  /** pokermon.lua Card:set_edition hook: no shiny playing cards unless the option is on. */
  set_edition(card, key) {
    if (key === 'e_poke_shiny' && !cfg('shiny_playing_cards') && card.ability.set !== 'Joker' && card.ability.set !== 'Edition') return false;
    return undefined;
  },
  /** lovely "Make sure evolve before debuff": a perished shiny gives its slot back. */
  end_round() {
    for (const v of G.jokers.cards) {
      if (v.edition && v.edition.poke_shiny && v.ability.perishable && v.ability.perish_tally === 0 && !v.ability.poke_shiny_perished) {
        v.ability.poke_shiny_perished = true;
        change_booster_limit(-1);
      }
    }
  },
};
