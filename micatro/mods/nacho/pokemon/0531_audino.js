// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0531_audino.lua: Audino, Mega Audino.
// (Audino's "Pokémon gain an extra level at end of round" is a lovely patch on level_evo:
// ../systems.js registers it on Pokermon's LEVEL_EVO_EXTRA.)
import {
  G, localize, play_sound, poll_edition, defineNacho, type_tooltip, smods_create_card,
  get_probability_vars, pseudorandom_probability,
} from '../api.js';

const FILE = 'src/pokemon/0531_audino.lua';

defineNacho({
  // Audino 531: gains X0.25 whenever a Pokémon evolves (poke_evolved)
  audino: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult, card.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.poke_evolved) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        return { message: localize('k_upgrade_ex'), colour: 'RED' };
      }
      if (context.joker_main) return { xmult: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Mega Audino 531-1: a Mystery Egg (with an edition, 1 in 10 shiny) at end of round
  mega_audino: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'daycare' });
      const [num, den] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.den, 'mega_audino');
      return { vars: [card.ability.extra.Xmult, num, den] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { xmult: card.ability.extra.Xmult };
      if (context.end_of_round && context.game_over === false && !context.blueprint && !context.individual && !context.repetition) {
        let hatchlings = false;
        for (const v of G.jokers.cards) {
          if (v.config.center.stage === 'Baby' || v.config.center.stage === 'Basic' || v.config.center_key === 'j_poke_mystery_egg') hatchlings = true;
        }
        // Intended-design fix (the "Pokemon Day Care" tooltip: eggs may exceed the Joker slots only
        // when you have no Basic / Baby Jokers). The Lua tested `#G.jokers.cards <= card_limit` —
        // true whenever the row isn't already over-full, so eggs always overflowed — and reserved a
        // joker_buffer slot even when it made no egg, a slot nothing gave back (leaked every round).
        // Now: an egg needs a free slot unless there are no hatchlings, and the buffer is only
        // reserved for an egg actually made.
        const room = G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit;
        if (room || !hatchlings) {
          G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
          G.E_MANAGER.add_event(() => {
            G.GAME.joker_buffer = 0;
            play_sound('timpani');
            const _card = smods_create_card({ set: 'Joker', key: 'j_poke_mystery_egg' });
            let _edition = poll_edition('aura', null, true, true);
            if (pseudorandom_probability(card, 'mega_audino', card.ability.extra.num, card.ability.extra.den, 'mega_audino')) _edition = 'e_poke_shiny';
            _card.set_edition(_edition, true);
            _card.add_to_deck();
            G.jokers.emplace(_card);
            if (_card.ability && _card.ability.extra) _card.ability.extra.rounds = 1;
          });
        }
      }
      return undefined;
    },
  },
}, FILE);
