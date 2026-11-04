// Pokermon 3.9.1 — pokemon/pokejokers_24.lua (Pokédex 691-720: Sylveon -> Gourgeist), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file).
// Pumpkaboo / Gourgeist sizes (card scale + sprite) are view data: `ability.extra.form`
// (systems/anim.js `v.poke.form`).
import {
  G, P_CENTERS, localize, card_eval_status_text, poll_edition,
  pseudorandom_element, pseudoseed,
  defineJokers, type_tooltip, detailed, item_evo, ease_poke_dollars, apply_type_sticker,
  smods_copy_card, create_consumeable,
} from '../api.js';

const FILE = 'pokemon/pokejokers_24.lua';

// ------------------------------------------------------------ shared bodies
/**
 * Pumpkaboo / Gourgeist (3.9.1): at pre_discard every undebuffed Jack in the discard counts; the one that reaches
 * jack_target is marked (per joker, `unique_val`) and makes a Spectral (with room) as it is discarded. Other Jacks say "Boo!".
 */
function pumpkin_discard(card, context, mark) {
  const flag = mark + card.unique_val;
  if (context.pre_discard && !context.blueprint) {
    for (const v of context.full_hand.filter((c) => c.get_id() === 11 && !c.debuff)) {
      card.ability.extra.jacks_discarded = card.ability.extra.jacks_discarded + 1;
      if (card.ability.extra.jacks_discarded === card.ability.extra.jack_target) {
        v[flag] = true;
        card.ability.extra.jacks_discarded = 0;
      }
    }
  }
  if (context.discard) {
    if (context.other_card[flag]) {
      create_consumeable({ set: 'Spectral' }, true, card);
      context.other_card[flag] = undefined;
    } else if (context.other_card.get_id() === 11 && !context.other_card.debuff && !context.blueprint) {
      return { message: localize('poke_boo_ex'), colour: 'RED' };
    }
  }
  return undefined;
}
const pumpkin_add = {
  add_to_deck(self, card, from_debuff) { if (!from_debuff) self.set_ability(self, card); },
};
const FORMS = ['small', 'average', 'large', 'super'];

defineJokers({
  // Sylveon 700
  sylveon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.e_foil);
        info_queue.push(P_CENTERS.e_holo);
        info_queue.push(P_CENTERS.e_polychrome);
      }
      return { vars: [] };
    },
    // Pokermon 3.9.1 rework: when the round begins, a Foil / Holographic / Polychrome copy of a random deck card joins
    // the hand (was: a lone unenhanced first hand gets an edition). Blueprint-compatible.
    calculate(self, card, context) {
      if (context.first_hand_drawn && G.deck.cards.length > 0) {
        const [card_to_copy] = pseudorandom_element(G.deck.cards, pseudoseed('sylveon'));
        if (card_to_copy) {
          const copy = smods_copy_card(card_to_copy, { area: G.hand });
          G.E_MANAGER.add_event(() => {
            const edition = poll_edition('aura', null, true, true);
            copy.set_edition(edition, true);
          });
        }
      }
      return undefined;
    },
  },
  // Pumpkaboo 710
  pumpkaboo: {
    poke_custom_values_to_keep: ['jack_target', 'jacks_discarded'],
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const extra = center.ability.extra || self.config.extra;
      return { vars: [extra.jack_target, Math.max(0, extra.jack_target - extra.jacks_discarded)], key: 'j_poke_pumpkaboo_' + (FORMS[extra.form] || 'average') };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom_element([0, 1, 2, 3], pseudoseed('pumpkaboo'))[0];
      card.ability.extra.jack_target = 4 + card.ability.extra.form;
      // (scale 0.7 / 1 / 1.1 / 1.2 and the sprite per form: the renderer's, from `form`.)
    },
    calculate(self, card, context) { return pumpkin_discard(card, context, 'pumpkaboo_trigger') || item_evo(self, card, context, 'j_poke_gourgeist'); },
    ...pumpkin_add,
  },
  // Gourgeist 711
  gourgeist: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const extra = center.ability.extra || self.config.extra;
      return { vars: [extra.jack_target, Math.max(0, extra.jack_target - extra.jacks_discarded), extra.money],
        key: 'j_poke_gourgeist_' + (FORMS[extra.form] || 'average') }; // (form -1 = no size picked yet, the collection's card: Average)
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom_element([0, 1, 2, 3], pseudoseed('gourgeist'))[0];
      card.ability.extra.jack_target = 4 + card.ability.extra.form;
      // (Pokermon 3.9.1: the size no longer sets the payout — $2 / $5 / $8 / $11 — it is config money, $6, at every size.)
    },
    calculate(self, card, context) {
      const r = pumpkin_discard(card, context, 'gourgeist_trigger');
      if (r) return r;
      if (context.using_consumeable && context.consumeable.ability.set === 'Spectral') {
        ease_poke_dollars(card, 'gourgeist', card.ability.extra.money);
        apply_type_sticker(G.jokers.cards[0], 'Psychic');
        card.juice_up();
        card_eval_status_text(G.jokers.cards[0], 'extra', null, null, null, { message: localize('poke_tera_ex'), colour: 'Spectral' });
      }
      return undefined;
    },
    ...pumpkin_add,
  },
}, FILE);
