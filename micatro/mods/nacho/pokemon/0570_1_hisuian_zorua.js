// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0570_1_hisuian_zorua.lua: Hisuian Zorua, Hisuian Zoroark.
// Copy the LEFTMOST joker (Pokermon's Zorua copies the rightmost). Illusion (shown as another
// Pokémon outside the joker row: set_card_type_badge / set_sprites / generate_ui / the zorua shader)
// is view data: `ability.extra.hidden_key`, which Pokermon's anim.js exposes as `v.poke.illusion`.
import {
  G, localize, card_eval_status_text, defineNacho, type_tooltip, level_evo,
  type_sticker_applied, apply_type_sticker, get_random_poke_key, poke_is_in_collection,
} from '../api.js';

const FILE = 'src/pokemon/0570_1_hisuian_zorua.lua';

/** Blueprint-style copy of G.jokers.cards[1]. -> {ret} | {stop} | undefined. */
function copy_leftmost(card, context) {
  const other_joker = G.jokers.cards[0];
  if (other_joker && other_joker !== card && !context.no_blueprint) {
    context.blueprint = (context.blueprint || 0) + 1;
    context.blueprint_card = context.blueprint_card || card;
    if (context.blueprint > G.jokers.cards.length + 1) return { stop: true };
    const other_joker_ret = other_joker.calculate_joker(context);
    context.blueprint = undefined;
    const eff_card = context.blueprint_card || card;
    context.blueprint_card = undefined;
    if (other_joker_ret) {
      other_joker_ret.card = eff_card;
      other_joker_ret.colour = 'BLACK';
      return { ret: other_joker_ret };
    }
  }
  return undefined;
}
/** set_ability: a Colorless Tera sticker, and the disguise picked outside the joker row. */
function illusion(self, card, pick) {
  if (!G.GAME || !G.GAME.banned_keys) return;
  if (!type_sticker_applied(card) && !poke_is_in_collection(card)) apply_type_sticker(card, 'Colorless');
  if (card.area !== G.jokers && !poke_is_in_collection(card)) card.ability.extra.hidden_key = card.ability.extra.hidden_key || pick();
}
/** update: the Blueprint-compat tag (the sprite mimicry is the renderer's). */
function compat(card) {
  if (card.area === G.jokers) {
    const other_joker = G.jokers.cards[0];
    card.ability.blueprint_compat = (other_joker && other_joker !== card && !other_joker.debuff && other_joker.config.center.blueprint_compat) ? 'compatible' : 'incompatible';
  }
}

defineNacho({
  // Hisuian Zorua 570-1: copies the leftmost joker until it scores a hand while copying
  hisuian_zorua: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.rounds], colours: [!card.ability.extra.active ? 'UI.TEXT_INACTIVE' : undefined] };
    },
    calculate(self, card, context) {
      if (card.ability.extra.active) {
        const c = copy_leftmost(card, context);
        if (c) { if (c.stop) return undefined; return c.ret; }
      }
      if (context.after && G.jokers.cards[0] !== card && card.ability.extra.active) {
        G.E_MANAGER.add_event(() => {
          card.ability.extra.active = false;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_reveal_ex') });
        });
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.ability.extra.active = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return level_evo(self, card, context, 'j_nacho_hisuian_zoroark');
    },
    set_ability(self, card) { illusion(self, card, () => get_random_poke_key('zorua', null, 1)); },
    update(self, card) { compat(card); },
  },
  // Hisuian Zoroark 571-1: always copies the leftmost joker
  hisuian_zoroark: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      const c = copy_leftmost(card, context);
      if (c && c.ret) return c.ret;
      return undefined;
    },
    set_ability(self, card) { illusion(self, card, () => get_random_poke_key('zoroark', null, 'poke_safari', null, null, { j_poke_zoroark: true })); },
    update(self, card) { compat(card); },
  },
}, FILE);
