// Pokermon 3.2.1 — pokemon/pokejokers_24.lua (Pokédex 691-720: Sylveon -> Gourgeist), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
// Pumpkaboo / Gourgeist sizes (card scale + sprite) are view data: `ability.extra.form`
// (systems/anim.js `v.poke.form`).
import {
  G, P_CENTERS, localize, card_eval_status_text, juice_card_until, poll_edition,
  pseudorandom_element, pseudoseed,
  defineJokers, type_tooltip, detailed, item_evo, ease_poke_dollars, apply_type_sticker, add_card,
} from '../api.js';

const FILE = 'pokemon/pokejokers_24.lua';

// ------------------------------------------------------------ shared bodies
/** Pumpkaboo / Gourgeist: every jack_target-th discarded Jack makes a Spectral card. */
function pumpkin_discard(card, context) {
  if (context.discard && !context.other_card.debuff && context.other_card.get_id() === 11) {
    if (card.ability.extra.jacks_discarded === card.ability.extra.jack_target - 1) {
      card.ability.extra.jacks_discarded = 0;
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          add_card({ set: 'Spectral' });
          G.GAME.consumeable_buffer = 0;
        });
        return { message: localize('k_plus_spectral'), colour: 'Spectral' };
      }
    } else {
      card.ability.extra.jacks_discarded = card.ability.extra.jacks_discarded + 1;
      return { message: localize('poke_boo_ex'), colour: 'RED' };
    }
  }
  return undefined;
}
const pumpkin_add = {
  add_to_deck(self, card, from_debuff) { if (!from_debuff) self.set_ability(self, card); },
};

defineJokers({
  // Sylveon 700
  sylveon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        if (!center.edition || !center.edition.polychrome) info_queue.push(P_CENTERS.e_polychrome);
        if (!center.edition || !center.edition.foil) info_queue.push(P_CENTERS.e_foil);
        if (!center.edition || !center.edition.holo) info_queue.push(P_CENTERS.e_holo);
      }
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && G.GAME.current_round.hands_played === 0 && context.full_hand.length === 1 && !context.blueprint) {
        const _card = context.scoring_hand[0];
        if (_card && _card.config.center === P_CENTERS.c_base) {
          const edition = poll_edition('aura', null, true, true);
          _card.set_edition(edition, true, true);
        }
      }
      if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, () => G.GAME.current_round.hands_played === 0, true);
      return undefined;
    },
  },
  // Pumpkaboo 710
  pumpkaboo: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const forms = ['j_poke_pumpkaboo_small', 'j_poke_pumpkaboo_average', 'j_poke_pumpkaboo_large', 'j_poke_pumpkaboo_super'];
      return { vars: [center.ability.extra.jack_target, Math.max(0, center.ability.extra.jack_target - center.ability.extra.jacks_discarded)], key: forms[center.ability.extra.form] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom_element([0, 1, 2, 3], pseudoseed('pumpkaboo'))[0];
      card.ability.extra.jack_target = 4 + card.ability.extra.form;
      // (scale 0.7 / 1 / 1.1 / 1.2 and the sprite per form: the renderer's, from `form`.)
    },
    calculate(self, card, context) { return pumpkin_discard(card, context) || item_evo(self, card, context, 'j_poke_gourgeist'); },
    ...pumpkin_add,
  },
  // Gourgeist 711
  gourgeist: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const forms = ['j_poke_gourgeist_small', 'j_poke_gourgeist_average', 'j_poke_gourgeist_large', 'j_poke_gourgeist_super'];
      return { vars: [center.ability.extra.jack_target, Math.max(0, center.ability.extra.jack_target - center.ability.extra.jacks_discarded), center.ability.extra.money],
        key: forms[center.ability.extra.form] };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom_element([0, 1, 2, 3], pseudoseed('gourgeist'))[0];
      card.ability.extra.jack_target = 4 + card.ability.extra.form;
      if (card.ability.extra.form === 0) card.ability.extra.money = 2;
      else if (card.ability.extra.form === 1) card.ability.extra.money = 5;
      else if (card.ability.extra.form === 2) card.ability.extra.money = 8;
      else if (card.ability.extra.form === 3) card.ability.extra.money = 11;
    },
    calculate(self, card, context) {
      const r = pumpkin_discard(card, context);
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
