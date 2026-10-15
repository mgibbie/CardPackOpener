// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0765_oranguru.lua: Oranguru.
// +1 choice in Standard packs (G.GAME.modifiers.booster_choice_mod, which the engine's SMODS
// pack_choices formula reads); "Standard packs contain your most common rank" is the Standard
// booster's create_card (../functions.js standard_pack_card via the pack_card hook).
import { G, P_CENTERS, defineNacho, type_tooltip, common_ranks_tooltip } from '../api.js';

const FILE = 'src/pokemon/0765_oranguru.lua';

/** SMODS's pack_choices formula for the open booster `b`. */
function recompute_choices(b) {
  const ex = typeof b.ability.extra === 'number' ? b.ability.extra : b.config.center.config.extra;
  G.GAME.pack_choices = Math.min((b.ability.choose || b.config.center.config.choose || 1) + (G.GAME.modifiers.booster_choice_mod || 0),
    typeof ex === 'number' ? Math.max(1, ex + (G.GAME.modifiers.booster_size_mod || 0)) : 1);
}
/** The open booster when it's a Standard pack (SMODS.OPENED_BOOSTER / G.STATE == STANDARD_PACK). */
function open_standard() {
  const c = G.GAME.pack_center && P_CENTERS[G.GAME.pack_center];
  if (G.STATE !== G.STATES.STANDARD_PACK || !c || !String(c.name).includes('Standard')) return undefined;
  return { ability: { name: c.name, extra: c.config.extra }, config: { center: c } };
}

defineNacho({
  // Oranguru 765
  oranguru: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      common_ranks_tooltip(self, info_queue);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.open_booster && !context.blueprint) {
        if (context.card.ability.name.includes('Standard')) {
          if (!card.ability.extra.raised) {
            G.GAME.modifiers.booster_choice_mod = (G.GAME.modifiers.booster_choice_mod || 0) + 1;
            recompute_choices(context.card);
            card.ability.extra.raised = true;
          }
        } else if (card.ability.extra.raised) {
          G.GAME.modifiers.booster_choice_mod = G.GAME.modifiers.booster_choice_mod ? G.GAME.modifiers.booster_choice_mod - 1 : 0;
          recompute_choices(context.card);
          card.ability.extra.raised = false;
        }
      }
      return undefined;
    },
    // Intended-design fix: the Lua's add_to_deck / remove_from_deck read `context.card` — there is
    // no `context` in those functions (a Lua error whenever Oranguru arrives or leaves while a
    // Standard pack is open). They mean the open Standard booster (SMODS.OPENED_BOOSTER).
    add_to_deck(self, card) {
      const b = open_standard();
      if (b !== undefined && !card.ability.extra.raised) {
        G.GAME.modifiers.booster_choice_mod = (G.GAME.modifiers.booster_choice_mod || 0) + 1;
        recompute_choices(b);
        card.ability.extra.raised = true;
      }
    },
    remove_from_deck(self, card) {
      if (card.ability.extra.raised) {
        G.GAME.modifiers.booster_choice_mod = G.GAME.modifiers.booster_choice_mod ? G.GAME.modifiers.booster_choice_mod - 1 : 0;
        const b = open_standard();
        if (b) recompute_choices(b);
        card.ability.extra.raised = false;
      }
    },
  },
}, FILE);
