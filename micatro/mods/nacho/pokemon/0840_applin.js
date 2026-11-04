// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0840_applin.lua: Applin, Flapple, Appletun, Dipplin, Hydrapple (new in 1.7.9).
// Applin: +1 hand size; destroys a random deck card at the end of each round; evolves with an apple (custom_item_evo +
// evo_list: Tart Apple -> Flapple, Sweet Apple -> Appletun, Syrupy Apple -> Dipplin; the apples: ../items.js).
// Flapple: +X0.3 Mult per destroyed playing card, -X0.1 after each hand (min X1). Appletun: +1 hand size (+2 while a rank is
// depleted from the deck), $3 per destroyed playing card. Dipplin: each destroyed card comes back as a Wild copy (a Wild one:
// two); evolves with 1/4 of the deck Wild. Hydrapple: the Wild copy, and +X0.2 Mult each (a Wild one +X0.4).
// (The G-Max Flapple / Appletun need Agarmons: 1.7.9 loads them only with it — not ported.)
import { G, P_CENTERS, pseudorandom_element, pseudoseed, defineNacho, type_tooltip, detailed, item_evo, deck_enhance_evo, scale_card, ease_poke_dollars, poke_remove_card, main_eval } from '../api.js';
import { calc, con, copy_playing_card } from '../dip.js';

const FILE = 'src/pokemon/0840_applin.lua';

const wild_tip = (info_queue) => { if (detailed()) info_queue.push(P_CENTERS.m_wild); };
const end_main = (context) => context.end_of_round && main_eval(context) && !context.individual && !context.repetition;

defineNacho({
  // Applin 840
  applin: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ set: 'Other', key: 'apple_evolutions' });
      return { vars: [card.ability.extra.h_size] };
    },
    calculate(self, card, context) {
      if (end_main(context)) {
        const target = pseudorandom_element(G.deck.cards, pseudoseed('applin'))[0];
        if (target) { poke_remove_card(target, card); card.juice_up(); }
      }
      return item_evo(self, card, context);
    },
    add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
    remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
  },
  // Flapple 841
  flapple: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult_mod, 0.1, card.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.remove_playing_cards && !context.blueprint) {
        const n = (context.removed || []).length;
        scale_card(card, {
          ref_value: 'Xmult', scalar_value: 'Xmult_mod',
          operation: (t, k, initial, change) => { t[k] = initial + change * n; },
          message_key: 'a_xmult', message_colour: 'XMULT',
        });
      }
      if (context.joker_main) return { xmult: a.Xmult };
      if (context.after && !context.blueprint && !context.retrigger_joker) {
        scale_card(card, { ref_value: 'Xmult', operation: (t, k, initial) => { t[k] = Math.max(initial - 0.1, 1); }, no_message: true });
      }
      return undefined;
    },
  },
  // Appletun 842
  appletun: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'depleted' });
      return { vars: [card.ability.extra.money] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if ((context.hand_drawn || context.other_drawn) && !context.blueprint) {
        const h = a.h_size;
        a.h_size = calc.get_depleted().length > 0 ? 2 : 1;
        G.hand.change_size(a.h_size - h);
      }
      if (context.remove_playing_cards) ease_poke_dollars(card, 'appletun', a.money * (context.removed || []).length);
      return undefined;
    },
    add_to_deck(self, card) {
      if (calc.get_depleted().length > 0) card.ability.extra.h_size = 2;
      G.hand.change_size(card.ability.extra.h_size);
    },
    remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
  },
  // Dipplin 1011
  dipplin: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      wild_tip(info_queue);
      let deck_data = '';
      if (G.playing_cards) deck_data = '[' + G.playing_cards.filter((v) => con.is_wild(v)).length + '/' + Math.ceil(G.playing_cards.length / 4) + '] ';
      return { vars: [deck_data] };
    },
    calculate(self, card, context) {
      if (context.remove_playing_cards) {
        for (const removed of context.removed || []) {
          const copies = con.is_wild(removed) ? 2 : 1;
          for (let i = 0; i < copies; i++) copy_playing_card(removed, { mod_conv: 'm_wild' }, null, card);
        }
        return { playing_cards_created: [true] };
      }
      return deck_enhance_evo(self, card, context, 'j_nacho_hydrapple', 'Wild', 0.25);
    },
  },
  // Hydrapple 1019
  hydrapple: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      wild_tip(info_queue);
      const a = card.ability.extra;
      return { vars: [a.Xmult, a.Xmult_mod, a.Xmult_mod * 2] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.remove_playing_cards) {
        for (const removed of context.removed || []) {
          copy_playing_card(removed, { mod_conv: 'm_wild' }, null, card);
          const wild = con.is_wild(removed);
          scale_card(card, {
            ref_value: 'Xmult', scalar_value: 'Xmult_mod',
            operation: (t, k, initial, change) => { t[k] = initial + change * (wild ? 2 : 1); },
            message_key: 'a_xmult', message_colour: 'XMULT',
          });
        }
        return { playing_cards_created: [true] };
      }
      if (context.joker_main) return { xmult: a.Xmult };
      return undefined;
    },
  },
}, FILE);
