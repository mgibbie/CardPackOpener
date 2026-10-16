/**
 * Inscrybed Jokers (LunaAstraCassiopeia) — Steamodded 0.9.x old-API mod, rebuilt natively for
 * Micatro. Source: InscrybedJokers.lua (SMODS.INIT.InscrybedJokers). 4 jokers, one per
 * Inscryption scrybe: Beastly, Deathly, Techno, Magickal. Each SMODS.Joker:new(..., rarity 2,
 * cost 5, unlocked, discovered, blueprint_compat true, eternal_compat true).
 * Art: assets/2x/j_<slug>.png (one 71x95 cell each; the unused j_aha.png is not shipped).
 *
 * The shipped mod could not work as written; rebuilt as its author evidently intended
 * (each fix tested in micatro/tests/mods/inscrybed_test.mjs):
 *  1. Every scoring branch tested `context.end_calculate_context == G.jokers` — a field no
 *     context has (Steamodded's helper is the FUNCTION SMODS.end_calculate_context(context)),
 *     so no joker ever added its Chips/Mult. They score in the main joker pass (joker_main).
 *  2. Deathly listened for `context.cards_removed` (no such context; the game's is
 *     remove_playing_cards with `removed`) and called `v.getID()` (crash: it's v:get_id()).
 *     It grows on remove_playing_cards (and cards_destroyed / glass_shattered) by 2 x rank
 *     (get_id: J 11, Q 12, K 13, A 14), and only shows "Upgrade!" when a card was destroyed.
 *  3. Techno reset to `extra.base_mult`, which config never defines (nil -> the next hand
 *     crashed on nil + 8). It resets to its starting +8 Mult (the reset message says +8), once
 *     at end of round (not again per held card / repetition pass).
 *  4. Magickal added `self.ability.mult_mod` (nil -> crash); the config value is
 *     extra.mult_mod (+3).
 *  5. Upgrade popups: `localize{'k_upgrade_ex'}` (a malformed call -> "ERROR") is
 *     localize('k_upgrade_ex'); a_chips got a bare number for vars -> [n].
 *  6. Blueprint / Brainstorm copy the Chips/Mult but don't scale the original a second time
 *     (the Lua scaled `self` — the copied joker — on every copy; vanilla scaling jokers all
 *     guard with `not context.blueprint`). Beastly's destroy-on-discard is the original's alone.
 */
import { registerMod } from '../../js/mods/registry.js';
import { G, localize } from '../../js/engine/core.js';

export const MOD_ID = 'inscrybed';
const ART = '/micatro/mods/inscrybed/assets/2x';
const SLUGS = ['beast', 'deathly', 'techno', 'magickal'];
const atlases = {};
for (const s of SLUGS) atlases['inscrybed_' + s] = { src: `${ART}/j_${s}.png`, px: 71, py: 95 };

const joker = (slug, name, config, loc_vars, calculate) => ({
  key: 'j_inscrybed_' + slug, set: 'Joker', name, rarity: 2, cost: 5, pos: { x: 0, y: 0 }, atlas: 'inscrybed_' + slug,
  config, blueprint_compat: true, eternal_compat: true, loc_vars, calculate,
});
const upgrade = (card) => ({ message: localize('k_upgrade_ex'), card, colour: 'CHIPS', delay: 0.45 });
const chips_main = (card) => ({
  message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.current_chips] }),
  chip_mod: card.ability.extra.current_chips, card,
});

/** Deathly: 2 x the summed ranks of the destroyed cards. */
function deathly_grow(card, cards) {
  let value = 0;
  for (const v of cards || []) value = value + v.get_id();
  if (value <= 0) return undefined;
  card.ability.extra.current_chips = card.ability.extra.current_chips + value * 2;
  return upgrade(card);
}

const centers = [
  joker('beast', 'Beastly Joker', { extra: { current_chips: 10, chip_mod: 10 } },
    (self, iq, card) => ({ vars: [card.ability.extra.current_chips, card.ability.extra.chip_mod] }),
    (self, card, context) => {
      if (context.joker_main) return chips_main(card);
      if (context.discard && !context.blueprint) {
        if (G.GAME.current_round.discards_used <= 0 && context.full_hand.length === 1) {
          card.ability.extra.current_chips = card.ability.extra.current_chips + card.ability.extra.chip_mod;
          return { ...upgrade(card), remove: true };
        }
      }
      return undefined;
    }),
  joker('deathly', 'Deathly Joker', { extra: { current_chips: 22 } },
    (self, iq, card) => ({ vars: [card.ability.extra.current_chips] }),
    (self, card, context) => {
      if (context.joker_main) return chips_main(card);
      if (context.blueprint) return undefined;
      if (context.cards_destroyed) return deathly_grow(card, context.glass_shattered);
      if (context.remove_playing_cards) return deathly_grow(card, context.removed);
      return undefined;
    }),
  joker('techno', 'Techno Joker', { mult: 8, extra: { mult_mod: 8 } },
    (self, iq, card) => ({ vars: [card.ability.mult, card.ability.extra.mult_mod] }),
    (self, card, context) => {
      if (context.end_of_round) {
        if (context.individual || context.repetition || context.blueprint) return undefined;
        card.ability.mult = self.config.mult; // fix 3: the starting +8
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [8] }) };
      }
      if (context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.mult] }), mult_mod: card.ability.mult };
      }
      if (context.after && context.cardarea === G.jokers && !context.blueprint) {
        card.ability.mult = card.ability.mult + card.ability.extra.mult_mod;
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.mult] }) };
      }
      return undefined;
    }),
  joker('magickal', 'Magickal Joker', { mult: 4, extra: { mult_mod: 3 } },
    (self, iq, card) => ({ vars: [card.ability.mult, card.ability.extra.mult_mod] }),
    (self, card, context) => {
      if (!context.joker_main) return undefined;
      const suits = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
      const fill = (c) => {
        if (c.is_suit('Hearts') && suits.Hearts === 0) suits.Hearts++;
        else if (c.is_suit('Diamonds') && suits.Diamonds === 0) suits.Diamonds++;
        else if (c.is_suit('Spades') && suits.Spades === 0) suits.Spades++;
        else if (c.is_suit('Clubs') && suits.Clubs === 0) suits.Clubs++;
      };
      for (const c of context.scoring_hand) if (c.ability.name !== 'Wild Card') fill(c);
      for (const c of context.scoring_hand) if (c.ability.name === 'Wild Card') fill(c);
      if (suits.Hearts > 0 && suits.Diamonds > 0 && suits.Spades > 0 && suits.Clubs > 0 && !context.blueprint) {
        card.ability.mult = card.ability.mult + card.ability.extra.mult_mod; // fix 4
      }
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.mult] }), mult_mod: card.ability.mult };
    }),
];

const loc = {
  descriptions: {
    Joker: {
      j_inscrybed_beast: { name: 'Beastly Joker', text: [
        'If {C:attention}first discard{} of round',
        'has only {C:attention}1{} card, destroy',
        'it and gain {C:chips}+#2#{} Chips',
        '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)',
      ] },
      j_inscrybed_deathly: { name: 'Deathly Joker', text: [
        'When a card is destroyed, gains',
        'Chips equal to twice the rank',
        'of the destroyed card.',
        '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)',
      ] },
      j_inscrybed_techno: { name: 'Techno Joker', text: [
        'Gains {C:red}+#2#{} Mult for each ',
        'hand played this round.',
        'Resets at end of round.',
        '{C:inactive}(Currently {C:red}+#1#{C:inactive} Mult)',
      ] },
      j_inscrybed_magickal: { name: 'Magickal Joker', text: [
        'Gains {C:mult}+#2#{} Mult if hand played',
        'contains a {C:spades}Spade{}, a {C:hearts}Heart{},',
        'a {C:clubs}Club{} and a {C:diamonds}Diamond{} card',
        '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)',
      ] },
    },
  },
};

export const INSCRYBED = registerMod({
  id: MOD_ID,
  name: 'Inscrybed Jokers',
  version: '1.0',
  by: 'LunaAstraCassiopeia (rebuilt for Micatro)',
  description: 'Jokers inspired by Inscryption.',
  content: { centers, atlases, loc },
});
