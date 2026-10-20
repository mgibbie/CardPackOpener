// Pokermon 3.9.1 — seals/seals1.lua (Pink / Silver on 3.9.1 since batch 17): the Pink Seal (scored in the round's first hand,
// with room: an Energy matching one of your jokers, else a random one; with the Obituary Sleeve on the Obituary Deck the seal
// then has a 1 in 3 chance to fall off — G.GAME.modifiers.poke_pink_seal_selfdestruct, sleeves.js) and the Silver Seal (held in
// hand when a hand is played: an Item if there is room, then the card is discarded through the discard pipeline — every
// joker's `discard` context, destroyed if one says remove). 3.9.1 claims the consumable slot when the seal triggers
// (consumeable_buffer) and makes the card with SMODS.add_card. Seal `calculate` runs through the engine's mod_card_calculate
// seam (core.js) with main_scoring, like SMODS 1.0.
import {
  G, localize, play_sound, delay, draw_card, eval_card, card_eval_status_text, create_card, copy_card,
  pseudorandom_element, pseudoseed, defineSeals, matching_energy, find_card, playing_card_joker_effects, add_card,
  pseudorandom_probability,
} from '../api.js';
import { P_SEALS } from '../../../js/engine/core.js';

const FILE = 'seals/seals1.lua';
const has_room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;

defineSeals({
  pink_seal: {
    config: { num: 1, dem: 3 }, // (3.9.1: the Obituary Sleeve's 1 in 3 fall-off chance)
    calculate(self, card, context) {
      if (context.cardarea === G.play && !context.repetition_only && context.main_scoring && G.GAME.current_round.hands_played === 0) {
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

  silver: {
    loc_vars(self) { return { vars: [self.config.match_amount] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.hand && !context.repetition_only && context.scoring_hand && !card.ability.discarded && context.main_scoring && !card.destroyed) {
        card.ability.discarded = true;
        if (has_room()) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            add_card({ set: 'Item' });
            G.GAME.consumeable_buffer = 0;
          });
        }
        G.E_MANAGER.add_event(() => {
          G.hand.add_to_highlighted(card, true);
          play_sound('card1', 1);
          let removed = false;
          for (const j of G.jokers.cards.slice()) {
            const ev = j.calculate_joker({ discard: true, other_card: card, full_hand: G.hand.highlighted });
            if (ev) {
              if (ev.remove) removed = true;
              card_eval_status_text(j, 'jokers', null, 1, null, ev);
            }
          }
          if (removed) {
            if (card.ability.name === 'Glass Card') card.shatter();
            else card.start_dissolve();
            // Intended-design fix: the Lua passes `removed = card` (not a list, so jokers iterating it
            // saw nothing) and fires remove_playing_cards twice; once, with the list, here.
            for (const j of G.jokers.cards.slice()) eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: [card] });
          } else {
            draw_card(G.hand, G.discard, 100, 'down', false, card);
            G.GAME.round_scores.cards_discarded.amt = G.GAME.round_scores.cards_discarded.amt + 1;
          }
        });
        delay(0.3);
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
