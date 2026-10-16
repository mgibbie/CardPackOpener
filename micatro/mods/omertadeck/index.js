/**
 * Omerta Deck (Mica) — Steamodded 0.9.x old-API mod, rebuilt natively for Micatro.
 * Source: OmertaDeck.lua. One deck: SMODS.Deck:new("Omerta Deck", "pact_slug",
 * {darkpact = true, joker_slot = 3}, {x = 5, y = 5}, loc) plus a Back.trigger_effect wrap that,
 * at cash-out ('eval') after a Boss Blind, adds a Negative Tag (the Anaglyph Deck's Double Tag
 * pattern). +3 Joker slots come from config.joker_slot through the vanilla Back.apply_to_run;
 * the Negative Tag runs from the deck's `calculate` on the engine's mod-back round_eval seam
 * (back.js: trigger_effect 'eval'). `darkpact` is an inert marker nothing reads (kept in config).
 *
 * INTENDED-DESIGN FIX (tested in micatro/tests/mods/omertadeck_test.mjs):
 *  1. The deck art: the Lua registered its Enhancers.png AS the game's "centers" atlas, which
 *     replaced the art of every enhancement, deck back, voucher-less center in the whole game
 *     just to give this deck its cell {5,5}. Here the sheet is the deck's own atlas
 *     (omertadeck_enhancers) and vanilla art is untouched.
 *  (The trigger's math.random sound pitch is visual-only and dropped — no unseeded RNG.)
 */
import { registerMod } from '../../js/mods/registry.js';
import { G, play_sound } from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';

export const MOD_ID = 'omertadeck';

const omerta = {
  key: 'b_omertadeck_pact_slug', set: 'Back', name: 'Omerta Deck', stake: 1, alerted: true,
  pos: { x: 5, y: 5 }, atlas: 'omertadeck_enhancers',
  config: { darkpact: true, joker_slot: 3 },
  loc_vars() { return { vars: [] }; },
  /** Back.trigger_effect 'eval' (the engine calls this with {round_eval: true}). */
  calculate(self, back, context) {
    if (context.round_eval && G.GAME.last_blind && G.GAME.last_blind.boss) {
      G.E_MANAGER.add_event(() => {
        add_tag(new Tag('tag_negative'));
        play_sound('generic1', 0.95, 0.8);
        play_sound('holo1', 1.25, 0.4);
      });
    }
  },
};

export const OMERTADECK = registerMod({
  id: MOD_ID,
  name: 'Omerta Deck',
  version: '1.0',
  by: 'Mica (rebuilt for Micatro)',
  description: 'A deck with extra Joker slots, and extra Negative Jokers!',
  content: {
    centers: [omerta],
    atlases: { omertadeck_enhancers: { src: '/micatro/mods/omertadeck/assets/2x/Enhancers.png', px: 71, py: 95 } },
    loc: {
      descriptions: {
        Back: {
          b_omertadeck_pact_slug: { name: 'Omerta Deck', text: [
            'After defeating each',
            '{C:attention}Boss Blind{}, gain a',
            '{C:dark_edition,T:tag_negative}Negative Tag{}',
            '{C:red}+3{} Joker slots',
          ] },
        },
      },
    },
  },
});
