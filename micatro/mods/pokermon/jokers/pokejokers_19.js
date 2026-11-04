// Pokermon 3.9.1 — pokemon/pokejokers_19.lua (Pokédex 541-570: Trubbish -> Zorua), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file).
// Zorua's Illusion (shown as another Pokémon outside the joker row: set_card_type_badge /
// set_sprites / generate_ui) is view data: `ability.extra.hidden_key`, exposed by
// systems/anim.js as `v.poke.illusion`.
import {
  G, localize, card_eval_status_text, play_sound,
  defineJokers, type_tooltip, detailed, level_evo, scaling_evo, ease_poke_dollars, scale_card,
  type_sticker_applied, apply_type_sticker, get_random_poke_key_options, poke_is_in_collection,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { blueprint_effect } from './pokejokers_08.js';

const FILE = 'pokemon/pokejokers_19.lua';

/** Discards used this ante (lovely "Garbodor functionality": the counter resets when the ante changes). */
const ante_discards_used = () => (G.GAME.poke_ante_of_discards === G.GAME.round_resets.ante ? (G.GAME.poke_ante_discards_used || 0) : 0);

const flat_chips = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.chips > 0
  ? { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips } : undefined);

/** Trubbish / Garbodor (3.9.1): at end of round with no discard used, +chip_mod Chips per discard left (SMODS.scale_card). */
function trash_scale(card, context) {
  if (context.end_of_round && !context.individual && !context.repetition
    && G.GAME.current_round.discards_used === 0 && G.GAME.current_round.discards_left > 0 && !context.blueprint) {
    scale_card(card, {
      ref_value: 'chips', scalar_value: 'chip_mod', message_colour: 'CHIPS',
      operation: (t, k, initial, modifier) => { t[k] = initial + modifier * G.GAME.current_round.discards_left; },
    });
    return true;
  }
  return false;
}

/**
 * Zorua / Zoroark (3.9.1): SMODS.blueprint_effect of the rightmost joker (only a Blueprint-compatible, undebuffed one —
 * 3.2.1 copied anything), the popup in black. Shared with pokejokers_20.js (Zoroark), exported from here.
 */
export function illusion_copy(card, context) {
  const other_joker = G.jokers.cards[G.jokers.cards.length - 1];
  if (!other_joker || other_joker === card) return undefined;
  const ret = blueprint_effect(card, other_joker, context);
  if (ret) ret.colour = 'BLACK';
  return ret;
}
/** Zorua / Zoroark update(): the Blueprint-compat tag (the sprite mimicry is the renderer's). */
export function illusion_update(card) {
  if (card.area === G.jokers) {
    const other_joker = G.jokers.cards[G.jokers.cards.length - 1];
    card.ability.blueprint_compat = (other_joker && other_joker !== card && !other_joker.debuff && other_joker.config.center.blueprint_compat) ? 'compatible' : 'incompatible';
  }
}
/** Zorua / Zoroark set_ability (3.9.1): outside the joker row only, a Dark Tera sticker and the disguise. */
export function illusion_set_ability(self, card, pick) {
  if (!G.GAME || !G.GAME.banned_keys) return;
  if (card.area !== G.jokers && !poke_is_in_collection(card)) {
    if (!type_sticker_applied(card)) apply_type_sticker(card, 'Dark');
    if (!card.ability.extra.hidden_key) card.ability.extra.hidden_key = pick();
  }
}
/** Zorua / Zoroark add_to_deck (3.9.1): the Illusion is dropped once it joins the joker row. */
export function illusion_add_to_deck(self, card) { card.ability.extra.hidden_key = undefined; }

defineJokers({
  // Trubbish 568
  trubbish: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.chips, ex.chip_mod, ex.money, Math.max(0, self.config.evo_rqmt - ex.triggers)] };
    },
    calculate(self, card, context) {
      const r = flat_chips(card, context);
      if (r) return r;
      // Pokermon 3.9.1: the Chips gain and the trigger count move from the cash-out to end of round, and it evolves
      // through scaling_evo; the cash-out only pays the $.
      if (trash_scale(card, context)) card.ability.extra.triggers = card.ability.extra.triggers + 1;
      return scaling_evo(self, card, context, 'j_poke_garbodor', card.ability.extra.triggers, self.config.evo_rqmt);
    },
    calc_dollar_bonus(self, card) {
      if (G.GAME.current_round.discards_used === 0 && G.GAME.current_round.discards_left > 0) {
        return ease_poke_dollars(card, 'trubbish', G.GAME.current_round.discards_left * card.ability.extra.money, true);
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
        trash_scale(card, context);
        // Pokermon 3.9.1: a Boss beaten with no discard used this ante arms the Garbage Tag; it comes at the cash-out.
        if (ante_discards_used() === 0 && G.GAME.blind.boss) card.ability.extra.active = true;
      }
      return undefined;
    },
    calc_dollar_bonus(self, card) {
      if (card.ability.extra.active) {
        card.ability.extra.active = false;
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_garbage'));
          play_sound('generic1');
          play_sound('holo1');
        });
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
      const other_joker = G.jokers.cards[G.jokers.cards.length - 1];
      if (card.ability.extra.active && other_joker && other_joker !== card) {
        const ret = illusion_copy(card, context);
        // (3.9.1: what the copied joker does at `after` is not returned — the Illusion is revealed instead.)
        if (ret && !context.after) return ret;
        if (context.after) {
          G.E_MANAGER.add_event(() => {
            card.ability.extra.active = false;
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_reveal_ex') });
          });
        }
      }
      // Pokermon 3.9.1: it resets only once revealed, in the main end-of-round pass of a won round. (The Lua returns the
      // "Reset" there; its level count runs in 3.9.1's later `evolution` context. Ours counts at end of round — the
      // batch-6 timing deviation — so the message is shown here and the count still runs.)
      if (context.end_of_round && context.game_over === false && context.main_eval && !card.ability.extra.active) {
        card.ability.extra.active = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return level_evo(self, card, context, 'j_poke_zoroark');
    },
    set_ability(self, card) { illusion_set_ability(self, card, () => get_random_poke_key_options({ key_append: 'zorua', rarity: 'Common', exclude_types: 'Dark' })); },
    add_to_deck: illusion_add_to_deck,
    update(self, card) { illusion_update(card); },
  },
}, FILE);
