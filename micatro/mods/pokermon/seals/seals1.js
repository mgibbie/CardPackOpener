// Pokermon 3.2.1 — seals/seals1.lua: the Pink Seal (scored in the round's first hand: create an
// Energy matching one of your jokers, else a random one) and the Silver Seal (held in hand when a
// hand is played: create an Item, then the card is discarded through the discard pipeline — every
// joker's `discard` context, destroyed if one says remove). Seal `calculate` runs through the
// engine's mod_card_calculate seam (core.js) with main_scoring, like SMODS 1.0.
import {
  G, localize, play_sound, delay, draw_card, eval_card, card_eval_status_text, create_card,
  pseudorandom_element, pseudoseed, defineSeals, matching_energy,
} from '../api.js';

const FILE = 'seals/seals1.lua';
const has_room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;

defineSeals({
  pink_seal: {
    calculate(self, card, context) {
      if (context.cardarea === G.play && !context.repetition_only && context.main_scoring && G.GAME.current_round.hands_played === 0) {
        G.E_MANAGER.add_event(() => {
          if (has_room()) {
            const energy_types = [];
            for (const v of G.jokers.cards) {
              const match = matching_energy(v, true);
              if (match) energy_types.push(match);
            }
            let _card;
            if (energy_types.length > 0) {
              const energy = pseudorandom_element(energy_types, pseudoseed('pink'))[0];
              _card = create_card('Energy', G.pack_cards, null, null, true, true, energy, null);
              if (energy === 'c_poke_bird_energy') card.set_seal(null);
            } else {
              _card = create_card('Energy', G.consumeables, null, null, null, null, null, null);
            }
            _card.add_to_deck();
            G.consumeables.emplace(_card);
            card.juice_up();
          }
        });
        if (has_room()) card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_plus_energy'), colour: 'pink' });
      }
      return undefined;
    },
  },

  silver: {
    loc_vars(self) { return { vars: [self.config.match_amount] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.hand && !context.repetition_only && context.scoring_hand && !card.ability.discarded && context.main_scoring && !card.destroyed) {
        card.ability.discarded = true;
        G.E_MANAGER.add_event(() => {
          if (has_room()) {
            const _card = create_card('Item', G.consumeables, null, null, null, null, null, null);
            _card.add_to_deck();
            G.consumeables.emplace(_card);
            card.juice_up();
          }
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
