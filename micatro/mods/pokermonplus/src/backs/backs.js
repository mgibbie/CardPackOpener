// Pokermon+ — src/backs/backs.lua: the 5 decks. Starting consumables / hands / hand size come
// from `config` through the vanilla Back.apply_to_run; `apply` runs through the engine's mod-back
// seam. The Void deck's Boss Blind Nightmare (its `calculate`, which Steamodded calls with every
// context) runs from the mod's calculate hook (index.js) on end_of_round.
//
// Intended-design fix (Shiny deck): its apply() wrapped the GLOBAL e_poke_shiny.get_weight in a
// new closure every time a Shiny-deck run started (the guard was per-run), so a second Shiny run
// in the same session stacked another +99x, and the wrapper outlived the run. Here the bonus is
// the mod's edition_weight hook reading this run's G.GAME.shiny_edition_rate: x100 once, this run only.
import { G, localize } from '../../../pokermon/api.js';

export default {
  virtuousdeck: {
    loc_vars() { return { vars: [] }; },
  },
  propheticdeck: {
    loc_vars(self) { return { vars: [self.config.hand_size, self.config.extra.scry] }; },
    // (Sets, not adds: the Lua assigns G.GAME.scry_amount.)
    apply(self) { G.GAME.scry_amount = self.config.extra.scry; },
  },
  shinydeck: {
    loc_vars() { return { vars: [] }; },
    apply(self) {
      if (!G.GAME.modifiers.shinydeck) {
        G.GAME.shiny_edition_rate = (G.GAME.shiny_edition_rate || 1) * self.config.extra.chance;
        G.GAME.modifiers.shinydeck = true;
      }
    },
  },
  roguedeck: {
    loc_vars() { return { vars: [localize({ type: 'name_text', set: 'Item', key: 'c_poke_megastone' })] }; },
    apply() { G.GAME.win_ante = G.GAME.win_ante + 4; },
  },
  voiddeck: {
    loc_vars() { return { vars: ['c_poke_nightmare'] }; },
    apply() { G.GAME.modifiers.void = true; },
  },
};
