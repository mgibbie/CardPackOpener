// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0570_1_hisuian_zorua.lua: Hisuian Zorua, Hisuian Zoroark.
// Copy the LEFTMOST joker (Pokermon's Zorua copies the rightmost) through SMODS.blueprint_effect (1.7.9: only a
// Blueprint-compatible, undebuffed one; 1.6.4 copied anything). Zorua stops after a hand it copied (revealed) and comes back
// at the end of a won round. Illusion (another Pokémon outside the joker row: a Colorless-excluded Common / Safari pick, a
// Colorless Tera sticker) is view data: `ability.extra.hidden_key` (Pokermon's anim.js exposes it as `v.poke.illusion`).
import {
  G, localize, card_eval_status_text, defineNacho, type_tooltip, level_evo,
  type_sticker_applied, apply_type_sticker, get_random_poke_key_options, poke_is_in_collection,
} from '../api.js';
import { blueprint_effect } from '../../pokermon/jokers/pokejokers_08.js';
import { defer } from '../dip.js';

const FILE = 'src/pokemon/0570_1_hisuian_zorua.lua';

/** SMODS.blueprint_effect of the leftmost joker, the popup in black. */
function copy_leftmost(card, context) {
  const other_joker = G.jokers.cards[0];
  if (!other_joker || other_joker === card) return undefined;
  const ret = blueprint_effect(card, other_joker, context);
  if (ret) ret.colour = 'BLACK';
  return ret;
}
/** set_ability: outside the joker row only, a Colorless Tera sticker and the disguise. */
function illusion(self, card, pick) {
  if (!G.GAME || !G.GAME.banned_keys) return;
  if (card.area !== G.jokers && !poke_is_in_collection(card)) {
    if (!type_sticker_applied(card)) apply_type_sticker(card, 'Colorless');
    if (!card.ability.extra.hidden_key) card.ability.extra.hidden_key = pick();
  }
}
/** update: the Blueprint-compat tag (the sprite mimicry is the renderer's). */
function compat(card) {
  if (card.area === G.jokers) {
    const other_joker = G.jokers.cards[0];
    card.ability.blueprint_compat = (other_joker && other_joker !== card && !other_joker.debuff && other_joker.config.center.blueprint_compat) ? 'compatible' : 'incompatible';
  }
}

defineNacho({
  // Hisuian Zorua 570-1: copies the leftmost joker until it copies a hand (5 rounds to evolve)
  hisuian_zorua: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      return { vars: [a.rounds], colours: [!a.active ? 'UI.TEXT_INACTIVE' : undefined] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      const other_joker = G.jokers.cards[0];
      if (a.active && other_joker && other_joker !== card) {
        const ret = copy_leftmost(card, context);
        if (ret) return ret;
      }
      if (context.after && other_joker && other_joker !== card) {
        defer(() => {
          a.active = false;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_reveal_ex') });
        });
      }
      // (1.7.9 returns the "Reset" here; its level count runs in Pokermon 3.9.1's later `evolution` context. Ours counts at
      // end of round — Pokermon's batch-6 timing — so the message is shown and the count still runs.)
      if (context.end_of_round && context.game_over === false && context.main_eval && !a.active) {
        a.active = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return level_evo(self, card, context, 'j_nacho_hisuian_zoroark');
    },
    set_ability(self, card) { illusion(self, card, () => get_random_poke_key_options({ key_append: 'zorua_h', rarity: 'Common', exclude_types: 'Colorless' })); },
    update(self, card) { compat(card); },
  },
  // Hisuian Zoroark 571-1: always copies the leftmost joker
  hisuian_zoroark: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      if (G.jokers.cards[0] && G.jokers.cards[0] !== card) {
        const ret = copy_leftmost(card, context);
        if (ret) return ret;
      }
      return undefined;
    },
    set_ability(self, card) { illusion(self, card, () => get_random_poke_key_options({ key_append: 'zoroark_h', rarity: 'poke_safari', exclude_types: 'Colorless' })); },
    add_to_deck(self, card) { card.ability.extra.hidden_key = undefined; },
    update(self, card) { compat(card); },
  },
}, FILE);
