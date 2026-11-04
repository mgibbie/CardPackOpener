// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0531_audino.lua: Audino, Mega Audino.
// Audino: X Mult that grows (SMODS.scale_card) whenever a Pokémon evolves (the poke_evolved context: not to / from a Mega);
// while owned, every level-evolving Pokémon takes an extra step per Audino (1.7.9 re-fires the `evolution` context once:
// ../systems.js LEVEL_EVO_EXTRA, as 1.6.4's patch did).
// Mega Audino (1.7.9 rework): when a Boss Blind is beaten, a Daycare egg of an adjacent parent (PkmnDip.eff.breed: both
// neighbours Daycare-compatible), hatching in 1 round, with an edition (1 in 5 Shiny, else Foil / Holo / Polychrome).
// 1.6.4 made an egg of any kind at every end of round.
import { G, play_sound, pseudorandom_element, pseudoseed, defineNacho, type_tooltip, scale_card, pseudorandom_probability, get_probability_vars, poke_get_adjacent_jokers } from '../api.js';
import { breed, defer } from '../dip.js';

const FILE = 'src/pokemon/0531_audino.lua';

defineNacho({
  // Audino 531
  audino: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult, card.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.poke_evolved && !context.blueprint) {
        scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_key: 'a_xmult', message_colour: 'XMULT' });
      }
      if (context.joker_main) return { xmult: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Mega Audino 531-1
  mega_audino: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'incubator' });
      const [num, den] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.den, 'mega_audino');
      return { vars: [card.ability.extra.Xmult, num, den] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.joker_main) return { xmult: a.Xmult };
      if (context.end_of_round && context.beat_boss && context.game_over === false && !context.blueprint && !context.individual && !context.repetition) {
        const adj = poke_get_adjacent_jokers(card);
        const poll_audino_edition = (args) => {
          const shiny = pseudorandom_probability(card, 'mega_audino', a.num, a.den);
          args.edition = shiny ? 'e_poke_shiny' : pseudorandom_element(['e_foil', 'e_holo', 'e_polychrome'], pseudoseed('mega_audino'))[0];
        };
        const incubate = (egg) => { egg.ability.extra.rounds = 1; };
        breed(card, adj, poll_audino_edition, incubate);
        defer(() => play_sound('timpani'));
      }
      return undefined;
    },
  },
}, FILE);
