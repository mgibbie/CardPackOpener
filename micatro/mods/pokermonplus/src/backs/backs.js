// Pokermon+ 1.2.0 — src/backs/backs.lua: Virtuous, Shiny, Void, Rogue and Pearlescent decks (+ the 1.0.3 Prophetic deck,
// dropped by 1.2.0: a legacy definition, off the New Run picker, so old runs still load). Starting consumables / hands /
// hand size come from `config` through the vanilla Back.apply_to_run; `apply` runs through the engine's mod-back seam;
// `calculate` gets the cash out's round_eval (back.js); the Void deck's reroll_shop runs from the mod's reroll_shop hook.
//
//   Shiny (reworked): -1 shop Booster slot; after beating a Small or Big Blind, a Shiny Tag. (1.0.3: shiny Pokémon x100 —
//     that is the Shiny Sleeve's effect now; the sleeve is unchanged.)
//   Void (reworked): Negative Energy cards give +1 Energy limit (functions.js void_energy_override); each shop reroll has a
//     1 in 15 chance to add a Nightmare to the shop. (1.0.3: a Nightmare after each Boss Blind.)
//   Pearlescent (new): every joker made comes with -1 Energy and -1 Energy limit (the lovely patch in create_card: index.js
//     create_card hook); at the end of each round $1 per de-energized joker (total Energy below 0) — its own cash-out row.
//   Virtuous, Rogue: unchanged.
import { G, localize, get_probability_vars, pseudorandom_probability, change_booster_limit, smods_create_card } from '../../../pokermon/api.js';
import { Tag, add_tag } from '../../../../js/engine/tag.js';

/** SONFIVE.add_shop_card(key): a card for sale in the shop (Steak's 1-slot shop fix). */
export function add_shop_card(key) {
  const card = smods_create_card({ area: G.shop_jokers, key });
  if (G.GAME.shop.joker_max === 1) G.shop_jokers.config.card_limit = G.GAME.shop.joker_max + 1;
  G.shop_jokers.emplace(card);
  card.set_cost();
  card.juice_up();
  return card;
}
/** The Void deck / sleeve's reroll (a Steamodded back calculate with context.reroll_shop): after the reroll restocks. */
export function void_reroll(back_cfg, back) {
  const ex = (back_cfg && back_cfg.extra) || { num: 1, dem: 15 };
  G.E_MANAGER.add_event(() => {
    G.E_MANAGER.add_event(() => {
      if (pseudorandom_probability(back || G.GAME.selected_back, 'void_nightmare', ex.num, ex.dem, 'voiddeck')) add_shop_card('c_poke_nightmare');
    });
  });
}

export default {
  virtuousdeck: {
    loc_vars() { return { vars: [] }; },
  },
  // (1.0.3, legacy)
  propheticdeck: {
    loc_vars(self) { return { vars: [self.config.hand_size, self.config.extra.scry] }; },
    // (Sets, not adds: the Lua assigns G.GAME.scry_amount.)
    apply(self) { G.GAME.scry_amount = self.config.extra.scry; },
  },
  shinydeck: {
    loc_vars() { return { vars: [] }; },
    apply(self) { change_booster_limit(self.config.extra.pack_slots); },
    calculate(self, back, context) {
      if (context.round_eval && G.GAME.last_blind && !G.GAME.last_blind.boss) {
        G.E_MANAGER.add_event(() => { add_tag(new Tag('tag_poke_shiny_tag')); });
      }
    },
  },
  roguedeck: {
    loc_vars() { return { vars: [localize({ type: 'name_text', set: 'Item', key: 'c_poke_megastone' })] }; },
    apply() { G.GAME.win_ante = G.GAME.win_ante + 4; },
  },
  voiddeck: {
    loc_vars(self) {
      const [num, dem] = get_probability_vars(G.GAME && G.GAME.selected_back, self.config.extra.num, self.config.extra.dem, 'voiddeck');
      return { vars: ['c_poke_nightmare', num, dem] };
    },
    apply() { G.GAME.modifiers.void = true; },
  },
  pearlescentdeck: {
    loc_vars() { return { vars: [] }; },
    // (an event in the Lua: the flag is up once the run starts, after the starting cards were made)
    apply() { G.E_MANAGER.add_event(() => { G.GAME.modifiers.sonfive_pearlescent = true; G.GAME.modifiers.sonfive_pearlescent_text = ' De-Energized Jokers'; }); },
  },
};
