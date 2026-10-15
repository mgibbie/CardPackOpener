// Pokermon 3.2.1 — pokemon/pokejokers_19.lua (Pokédex 541-570: Trubbish -> Zorua), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
// Zorua's Illusion (shown as another Pokémon outside the joker row: set_card_type_badge /
// set_sprites / generate_ui) is view data: `ability.extra.hidden_key`, exposed by
// systems/anim.js as `v.poke.illusion`.
import {
  G, localize, card_eval_status_text, play_sound,
  defineJokers, type_tooltip, detailed, level_evo, poke_evolve, find_joker, ease_poke_dollars,
  type_sticker_applied, apply_type_sticker, get_random_poke_key, poke_is_in_collection,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';

const FILE = 'pokemon/pokejokers_19.lua';

/** Discards used this ante (lovely "Garbodor functionality": the counter resets when the ante changes). */
const ante_discards_used = () => (G.GAME.poke_ante_of_discards === G.GAME.round_resets.ante ? (G.GAME.poke_ante_discards_used || 0) : 0);

const flat_chips = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.chips > 0
  ? { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips } : undefined);

/**
 * Zorua / Zoroark: copy the rightmost joker (Blueprint-style). Shared with pokejokers_20.js
 * (Zoroark), exported from here.
 */
export function illusion_copy(card, context) {
  const other_joker = G.jokers.cards[G.jokers.cards.length - 1];
  if (other_joker && other_joker !== card && !context.no_blueprint) {
    context.blueprint = (context.blueprint || 0) + 1;
    context.blueprint_card = context.blueprint_card || card;
    if (context.blueprint > G.jokers.cards.length + 1) return { stop: true };
    const other_joker_ret = other_joker.calculate_joker(context);
    // (Lua sets these to nil — not back to the outer copier's values.)
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
/** Zorua / Zoroark update(): the Blueprint-compat tag (the sprite mimicry is the renderer's). */
export function illusion_update(card) {
  if (card.area === G.jokers) {
    const other_joker = G.jokers.cards[G.jokers.cards.length - 1];
    card.ability.blueprint_compat = (other_joker && other_joker !== card && !other_joker.debuff && other_joker.config.center.blueprint_compat) ? 'compatible' : 'incompatible';
  }
}
/** Zorua / Zoroark set_ability: a Dark Tera sticker, and the disguise picked outside the joker row. */
export function illusion_set_ability(self, card, pick) {
  if (!G.GAME || !G.GAME.banned_keys) return;
  if (!type_sticker_applied(card) && !poke_is_in_collection(card)) apply_type_sticker(card, 'Dark');
  if (card.area !== G.jokers && !poke_is_in_collection(card)) {
    card.ability.extra.hidden_key = card.ability.extra.hidden_key || pick();
  }
}

defineJokers({
  // Trubbish 568
  trubbish: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.chips, ex.chip_mod, ex.money, Math.max(0, self.config.evo_rqmt - ex.triggers)] };
    },
    calculate(self, card, context) { return flat_chips(card, context); },
    calc_dollar_bonus(self, card) {
      if (G.GAME.current_round.discards_used === 0 && G.GAME.current_round.discards_left > 0) {
        card.ability.extra.chips = card.ability.extra.chips + (card.ability.extra.chip_mod * G.GAME.current_round.discards_left);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'CHIPS' });
        card.ability.extra.triggers = card.ability.extra.triggers + 1;
        if (card.ability.extra.triggers >= self.config.evo_rqmt && !find_joker('everstone').length) poke_evolve(card, 'j_poke_garbodor');
        const earned = ease_poke_dollars(card, 'trubbish', G.GAME.current_round.discards_left * card.ability.extra.money, true);
        return earned;
      }
      return undefined;
    },
  },
  // Garbodor 569
  garbodor: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ key: 'tag_garbage', set: 'Tag', specific_vars: [1, G.GAME.unused_discards || 0] });
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.money] };
    },
    calculate(self, card, context) {
      const r = flat_chips(card, context);
      if (r) return r;
      if (context.end_of_round && !context.individual && !context.repetition) {
        if (G.GAME.current_round.discards_used === 0 && G.GAME.current_round.discards_left > 0 && !context.blueprint) {
          card.ability.extra.chips = card.ability.extra.chips + (card.ability.extra.chip_mod * G.GAME.current_round.discards_left);
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'CHIPS' });
        }
        if (ante_discards_used() === 0 && G.GAME.blind.boss) {
          G.E_MANAGER.add_event(() => {
            add_tag(new Tag('tag_garbage'));
            play_sound('generic1');
            play_sound('holo1');
          });
        }
      }
      return undefined;
    },
  },
  // Zorua 570
  zorua: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.rounds], colours: [!center.ability.extra.active ? 'UI.TEXT_INACTIVE' : undefined] };
    },
    calculate(self, card, context) {
      if (card.ability.extra.active) {
        const c = illusion_copy(card, context);
        if (c) { if (c.stop) return undefined; return c.ret; }
      }
      if (context.after && G.jokers.cards[G.jokers.cards.length - 1] !== card && card.ability.extra.active) {
        G.E_MANAGER.add_event(() => {
          card.ability.extra.active = false;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_reveal_ex') });
        });
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.ability.extra.active = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return level_evo(self, card, context, 'j_poke_zoroark');
    },
    set_ability(self, card) { illusion_set_ability(self, card, () => get_random_poke_key('zorua', null, 1)); },
    update(self, card) { illusion_update(card); },
  },
}, FILE);

