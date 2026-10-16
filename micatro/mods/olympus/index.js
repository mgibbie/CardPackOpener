/**
 * Olympus (AbhinavR314) — Steamodded 0.9.x old-API mod, rebuilt natively for Micatro.
 * Source: olympus.lua (SMODS.INIT.Olympus + a Card:calculate_joker wrap). 6 Greek-myth jokers
 * and the two README "synergies" (The Twins: Artemis + Apollo, Royal Matrimony: Zeus + Hera),
 * which the Lua implements as other_joker effects.
 *
 * Data exactly as add_item(...): rarity / cost / config.extra; no blueprint_compat (Blueprint shows
 * "incompatible" — see the note below) and no eternal_compat (never Eternal), as the Lua registers.
 * Art: one 71x95 sheet per joker (assets/2x/j_<name>.png).
 *
 * INTENDED-DESIGN FIXES (each tested in micatro/tests/mods/olympus_test.mjs):
 *  1. Artemis / Apollo checked for a free consumable slot but never reserved it
 *     (G.GAME.consumeable_buffer was only reset, never incremented — Cartomancer increments it),
 *     so Artemis + Apollo with one free slot both passed the check and overfilled the slots.
 *     They reserve the slot like Cartomancer.
 *  2. Hades told the jokers `remove_playing_cards` with `removed = <the card>` — a single card
 *     where every listener iterates a LIST (Glass Joker, Caino, mod jokers), so nothing ever saw
 *     the destroyed card. It passes `removed = [card]`.
 *  3. Hades destroys a card once: a retriggered card (Red Seal) or a Blueprint copy still pays
 *     $3 per trigger as in the Lua, but the card is dissolved — and remove_playing_cards
 *     announced — once (the Lua dissolved it and told every joker again per trigger).
 *  Note: Blueprint/Brainstorm DO copy these jokers even without blueprint_compat — vanilla
 *  Blueprint never checks the flag when calculating (it only drives the compatible/incompatible
 *  badge), so Hera/Zeus/Hades/Artemis/Apollo copy; Hephaestus guards with not context.blueprint.
 *  (Dropped as irrelevant natively: the ShamPack set_sprites / UIBox wraps and the unused
 *  `unique_jokers_owned` tracker.)
 */
import { registerMod } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, create_card, ease_dollars, localize, card_eval_status_text,
} from '../../js/engine/core.js';
import { mod_context_effect } from '../../js/engine/run.js';

export const MOD_ID = 'olympus';
const ART = '/micatro/mods/olympus/assets/2x';
const NAMES = ['artemis', 'apollo', 'hephaestus', 'hades', 'hera', 'zeus'];

const atlases = {};
for (const n of NAMES) atlases['olympus_' + n] = { src: `${ART}/j_${n}.png`, px: 71, py: 95 };

/** add_item's center: unlocked/discovered, rarity, cost, name, config.extra. */
const joker = (n, name, rarity, cost, extra, calculate) => ({
  key: 'j_olympus_' + n, set: 'Joker', name, rarity, cost, pos: { x: 0, y: 0 }, atlas: 'olympus_' + n,
  config: extra === null ? {} : { extra }, blueprint_compat: false, eternal_compat: false, calculate,
});

/** Artemis / Apollo: a fixed Tarot when the Blind is selected, if there is room. */
function tarot_on_blind(key) {
  return (self, card, context) => {
    if (!context.setting_blind || card.getting_sliced) return undefined;
    if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1; // fix 1
      G.E_MANAGER.add_event(() => {
        const c = create_card('Tarot', G.consumeables, null, null, null, null, key, 'art');
        c.add_to_deck();
        G.consumeables.emplace(c);
        G.GAME.consumeable_buffer = 0;
      });
      card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: 'PURPLE' });
    }
    return undefined;
  };
}

/** The Twins: suits in the scoring hand, Wild Cards filling a missing suit (Clubs, Diamonds, Spades, Hearts). */
function twins_suits(scoring_hand) {
  const suits = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
  for (const c of scoring_hand) {
    if (c.ability.name !== 'Wild Card') {
      if (c.is_suit('Hearts')) suits.Hearts++;
      if (c.is_suit('Diamonds')) suits.Diamonds++;
      if (c.is_suit('Spades')) suits.Spades++;
      if (c.is_suit('Clubs')) suits.Clubs++;
    }
  }
  for (const c of scoring_hand) {
    if (c.ability.name === 'Wild Card') {
      if (c.is_suit('Clubs') && suits.Clubs === 0) suits.Clubs++;
      else if (c.is_suit('Diamonds') && suits.Diamonds === 0) suits.Diamonds++;
      else if (c.is_suit('Spades') && suits.Spades === 0) suits.Spades++;
      else if (c.is_suit('Hearts') && suits.Hearts === 0) suits.Hearts++;
    }
  }
  return suits;
}

const artemis_blind = tarot_on_blind('c_moon');
const apollo_blind = tarot_on_blind('c_sun');

const centers = [
  joker('artemis', 'Artemis', 3, 8, null, (self, card, context) => {
    if (context.setting_blind) return artemis_blind(self, card, context);
    if (context.other_joker && context.other_joker.ability.name === 'Apollo' && card !== context.other_joker) {
      const s = twins_suits(context.scoring_hand);
      if (s.Hearts > 0 && s.Clubs > 0) return { message: localize({ type: 'variable', key: 'a_xmult', vars: [5] }), Xmult_mod: 5 };
    }
    return undefined;
  }),
  joker('apollo', 'Apollo', 3, 8, null, (self, card, context) => {
    if (context.setting_blind) return apollo_blind(self, card, context);
    return undefined;
  }),
  joker('hephaestus', 'Hephaestus', 3, 8, null, (self, card, context) => {
    if (context.individual && context.cardarea === G.play && !context.blueprint) {
      context.other_card.set_ability(P_CENTERS.m_steel, null, true);
    }
    return undefined;
  }),
  joker('hades', 'Hades', 2, 5, 3, (self, card, context) => {
    if (context.individual && context.cardarea === G.play && context.full_hand.length === 1
      && G.GAME.current_round.hands_played === 0) {
      ease_dollars(card.ability.extra);
      const victim = context.other_card;
      if (!victim.destroyed) { // fix 3: once per card
        // Like the engine's own destroy pass: flagged now (so it isn't drawn to the discard
        // pile after the hand), dissolved by event.
        victim.destroyed = true;
        G.E_MANAGER.add_event(() => { if (!victim.removed) victim.start_dissolve(); });
        for (const j of G.jokers.cards.slice()) {
          mod_context_effect(j, j.calculate_joker({ remove_playing_cards: true, removed: [victim] })); // fix 2
        }
      }
    }
    return undefined;
  }),
  joker('hera', 'Hera', 2, 6, 13, (self, card, context) => {
    if (context.individual && context.cardarea === G.play && context.other_card.get_id() === 12) {
      return { mult: card.ability.extra, card };
    }
    return undefined;
  }),
  joker('zeus', 'Zeus', 2, 6, 13, (self, card, context) => {
    if (context.individual && context.cardarea === G.play && context.other_card.get_id() === 13) {
      return { mult: card.ability.extra, card };
    }
    if (context.other_joker && context.other_joker.ability.name === 'Hera' && card !== context.other_joker) {
      let queens = 0, kings = 0;
      for (const c of context.scoring_hand) {
        if (c.get_id() === 12) queens++;
        if (c.get_id() === 13) kings++;
      }
      if (queens > 0 && kings > 0) return { message: localize({ type: 'variable', key: 'a_xmult', vars: [3] }), Xmult_mod: 3 };
    }
    return undefined;
  }),
];

const loc = {
  descriptions: {
    Joker: {
      j_olympus_artemis: { name: 'Artemis', text: ['Creates a {C:attention}The Moon{} {C:tarot}Tarot{} card', 'when {C:attention}Blind{} is selected'] },
      j_olympus_apollo: { name: 'Apollo', text: ['Creates a {C:attention}The Sun{} {C:tarot}Tarot{} card', 'when {C:attention}Blind{} is selected'] },
      j_olympus_hephaestus: { name: 'Hephaestus', text: ['All cards become {C:attention}Steel{} cards', 'when scored'] },
      j_olympus_hades: { name: 'Hades', text: ['If {C:attention}first hand{} of round', 'has only {C:attention}1{} card, destroy', 'it and earn {C:money}$3{}'] },
      j_olympus_hera: { name: 'Hera', text: ['Each played {C:attention}Queen{}', 'gives {C:mult}+13{} Mult when scored'] },
      j_olympus_zeus: { name: 'Zeus', text: ['Each played {C:attention}King{}', 'gives {C:mult}+13{} Mult when scored'] },
    },
  },
};

export const OLYMPUS = registerMod({
  id: MOD_ID,
  name: 'Olympus',
  version: '1.0',
  by: 'AbhinavR314 (rebuilt for Micatro)',
  description: 'Jokers based on Greek myth.',
  content: { centers, atlases, loc },
});
