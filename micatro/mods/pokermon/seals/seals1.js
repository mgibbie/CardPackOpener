// Pokermon 3.9.1 — seals/seals1.lua (Pink / Silver on 3.9.1 since batch 17; the Silver Seal on upstream main's refactor): the Pink
// Seal (scored in the round's first hand, with room: an Energy matching one of your jokers, else a random one; with the Obituary
// Sleeve on the Obituary Deck the seal then has a 1 in 3 chance to fall off — G.GAME.modifiers.poke_pink_seal_selfdestruct,
// sleeves.js; house: while the owner's Grumpig is held, every hand, and each trigger is told to the Spoink line — pink_triggered)
// and the Silver Seal (held in hand while a hand scores: "+1 Item" and an Item if there is room, then the card is
// discarded through pokermon.discard_cards — the discard pipeline, every joker's `discard` effect applied). The card is made
// with SMODS.add_card. Seal `calculate` runs through the engine's mod_card_calculate seam (core.js) with main_scoring, like
// SMODS 1.0. Players get them from Obituary / Revenant, the Obituary / Revenant decks and sleeves, and (Steamodded) the base
// game's seal rolls — Standard Pack cards and Certificate (js/engine/smods.js base_seal_roll; pokermon_seals_test.mjs).
import {
  G, localize, copy_card, pseudorandom_element, pseudoseed, defineSeals, matching_energy, find_card, playing_card_joker_effects,
  add_card, pseudorandom_probability, calculate_effect,
} from '../api.js';
import { P_SEALS } from '../../../js/engine/core.js';
import { discard_cards_from_highlighted } from '../../../js/engine/run.js';

const FILE = 'seals/seals1.lua';
const has_room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;
/** A Pink Seal's scoring effect fired (house, the owner's Spoink line): every owned joker with a `poke_pink_trigger(self, joker, seal_card,
 *  overflow)` center hook hears it, once per trigger (each retrigger of the card is one more), not debuffed; a Blueprint has no hook, so it
 *  never counts. `overflow`: no consumable room, so no Energy (Grumpig's Black Pearl). No such joker owned: nothing happens. */
function pink_triggered(card, overflow) {
  for (const j of G.jokers.cards.slice()) {
    const c = j.config.center;
    if (c.poke_pink_trigger && !j.debuff) c.poke_pink_trigger(c, j, card, overflow);
  }
}

/**
 * pokermon.discard_cards (upstream main, functions/pokeutils.lua, 2ce6bc7): discard these hand cards outside the Discard button.
 * It is Steamodded's hook discard — pre_discard, each card's discard seal and every joker's discard context (effects applied),
 * destroyed ones -> remove_playing_cards, cards_discarded counted, no discard used, no post_discard — which the engine's
 * discard_cards_from_highlighted(hook) is. (Main's poke_drawn_to guard: a card no longer in hand is not discarded again.)
 */
export function discard_cards(cards) {
  cards = [].concat(cards).filter((c) => c && c.area === G.hand);
  if (!cards.length) return;
  const keep = G.hand.highlighted.filter((c) => !cards.includes(c));
  G.hand.highlighted = cards.slice();
  discard_cards_from_highlighted(true);
  G.hand.highlighted = keep.filter((c) => c.area === G.hand);
}

defineSeals({
  pink_seal: {
    config: { num: 1, dem: 3 }, // (3.9.1: the Obituary Sleeve's 1 in 3 fall-off chance)
    calculate(self, card, context) {
      // (house, the owner's Grumpig — jokers/pokejokers_designs.js: while a Grumpig is held, not debuffed, Pink Seals trigger on
      // EVERY hand; without one, the round's first hand only, as upstream)
      if (context.cardarea === G.play && !context.repetition_only && context.main_scoring
          && (G.GAME.current_round.hands_played === 0 || find_card('j_poke_grumpig').length > 0)) {
        // (house: the owner's Spoink line counts every trigger, with or without room for the Energy — `overflow` when none)
        pink_triggered(card, !has_room());
        if (has_room()) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            const energy_types = [];
            for (const v of G.jokers.cards) {
              const match = matching_energy(v, true);
              if (match) energy_types.push(match);
            }
            let energy_key;
            if (energy_types.length > 0) {
              energy_key = pseudorandom_element(energy_types, pseudoseed('pink'))[0];
              if (energy_key === 'c_poke_bird_energy') card.set_seal(null);
            }
            add_card({ set: 'Energy', key: energy_key });
            G.GAME.consumeable_buffer = 0;
            const cfg = (P_SEALS.poke_pink_seal && P_SEALS.poke_pink_seal.config) || self.config || { num: 1, dem: 3 };
            if (G.GAME.modifiers.poke_pink_seal_selfdestruct
                && pseudorandom_probability(card, 'poke_pink_seal_selfdestruct', cfg.num, cfg.dem, 'poke_pink_seal_selfdestruct')) {
              card.set_seal(null);
            }
          });
          return { message: localize('poke_plus_energy'), colour: 'pink' };
        }
      }
      return undefined;
    },
  },

  // Upstream main's Silver Seal (InertSteak/Pokermon af0b656, 7ba51bb "refactor silver seals" on 2ce6bc7's draw/discard helpers),
  // a behaviour fix over 3.9.1's: the room check runs when the event does, the seal says "+1 Item", and the card goes through
  // pokermon.discard_cards — every joker's discard context with its effect APPLIED (3.9.1 only read `remove`: a Silver-discarded
  // Gold card never paid Jolteon, a card of the round's rank never paid Wingull), pre_discard first, counted as discarded.
  silver: {
    loc_vars(self) { return { vars: [self.config.match_amount] }; },
    calculate(self, card, context) {
      if (context.main_scoring && context.cardarea === G.hand && !card.ability.discarded && !card.destroyed) {
        card.ability.discarded = true;
        G.E_MANAGER.add_event(() => {
          if (has_room()) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            G.E_MANAGER.add_event(() => {
              add_card({ set: 'Item' });
              G.GAME.consumeable_buffer = 0;
            });
            calculate_effect({ message: localize('poke_plus_pokeitem'), colour: 'item' }, card);
          }
          discard_cards(card);
        });
      }
      return undefined;
    },
  },
}, FILE);

// Pokermon 3.9.1 (seals/seals1.lua) adds the DNA Seal, Deoxys's (new-jokers sub-batch 14; 3.2.1's data.js doesn't have it, so the
// definition carries its static data and index.js builds it after data.js's seals): a played hand of exactly 1 card with it makes
// a Sealless copy of that card in hand. Each Deoxys in a forme adds to the copy: Attack +X Mult, Defense +$ held at end of round,
// Speed +Chips (permanent: perma_x_mult / perma_h_dollars / perma_bonus). Never in a pool; its shader draw is cosmetic.
defineSeals({
  dna_seal: {
    key: 'dna_seal',
    name: 'dna_seal',
    badge_colour: '#f81020', // (fire)
    atlas: 'AtlasStickersBasic',
    pos: { x: 6, y: 1 },
    artist: 'CBMX',
    config: {},
    no_collection: true,
    loc_vars() { return { vars: [] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.play && !context.repetition_only && context.main_scoring && context.full_hand && context.full_hand.length === 1) {
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const card_copied = copy_card(context.full_hand[0], null, null, G.playing_card);
        card_copied.add_to_deck();
        G.deck.config.card_limit = G.deck.config.card_limit + 1;
        G.playing_cards.push(card_copied);
        G.hand.emplace(card_copied);
        card_copied.set_seal(null);
        // (Lua: card_copied.states.visible = nil until it materializes: visual only)

        let Xmult = 0, Money = 0, Chips = 0;
        for (const d of find_card('j_poke_deoxys')) {
          const form = d.ability.extra.form;
          if (form === 1) Xmult = Xmult + d.ability.extra.Xmult_multi;
          if (form === 2) Money = Money + d.ability.extra.money_mod;
          if (form === 3) Chips = Chips + d.ability.extra.chip_mod;
        }
        // (Lua `perma_x_mult or 1`: Steamodded initialises perma_x_mult / perma_h_dollars to 0 on every card, so the `or` never
        // applies; ours leaves them unset, hence 0 here)
        if (Xmult > 0) card_copied.ability.perma_x_mult = (card_copied.ability.perma_x_mult || 0) + Xmult;
        if (Money > 0) card_copied.ability.perma_h_dollars = (card_copied.ability.perma_h_dollars || 0) + Money;
        if (Chips > 0) card_copied.ability.perma_bonus = (card_copied.ability.perma_bonus || 0) + Chips;

        G.E_MANAGER.add_event(() => { card_copied.start_materialize(); });
        return {
          message: localize('k_copied_ex'),
          colour: 'CHIPS',
          // (timing: after the message) SMODS.calculate_context({playing_card_added = true, cards = {card_copied}})
          func() { G.E_MANAGER.add_event(() => { playing_card_joker_effects([card_copied]); }); },
        };
      }
      return undefined;
    },
    in_pool() { return false; },
  },
}, 'seals/seals1.lua');
