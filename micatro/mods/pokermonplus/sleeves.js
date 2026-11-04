// Sonfive's Pokermon+ 1.2.0 — src/sleeves/sleeves.lua: the CardSleeves sleeves (deck variants, engine/sleeve.js), each with
// its deck pairing (`alt`, CardSleeves' get_current_deck_key) as the Lua's loc_vars set it. 1.2.0 ships 4 (Virtuous, Shiny,
// Rogue, Void); the 1.0.3 Prophetic Sleeve is kept as a legacy definition (off the New Run picker: `legacy`), so old runs load.
// Notes (as the mod plays: loc_vars rewrites self.config when the sleeve is shown, before the run starts):
//   * Virtuous: a Timer Ball and -1 hand (the config's dollars = -4 is replaced by loc_vars); with the
//     Virtuous deck: the Hieroglyph voucher instead.
//   * Prophetic (legacy): -1 hand size, Foresight set to 3; with the Prophetic deck: Foresight set to 6 (+3 over the deck).
//   * Shiny: shiny Pokémon x100 (the mod's edition_weight hook reads G.GAME.shiny_edition_rate). 1.2.0's Shiny deck no longer
//     touches the rate, so with the deck it multiplies once too (its `_alt` text).
//   * Rogue: a Mega Stone and +4 win ante.
//   * Void (1.2.0): Negative Energy +1 limit (modifiers.void) and the Void deck's calculate — each shop reroll has a 1 in 15
//     chance to add a Nightmare to the shop (1.0.3: a Nightmare after each Boss Blind).
import { G, localize, get_probability_vars } from '../pokermon/api.js';
import { void_reroll } from './src/backs/backs.js';

const MOD = 'pokermonplus', ATLAS = 'sonfive_sleeves';
const sleeve = (key, x, def) => ({ key: 'sleeve_sonfive_' + key, pos: { x, y: 0 }, atlas: ATLAS, mod: MOD, config: {}, ...def });

export const SLEEVES = [
  sleeve('virtuoussleeve', 1, {
    name: 'Virtuous Sleeve',
    config: { consumables: ['c_sonfive_timerball'], hands: -1 },
    loc_vars: () => ({ vars: [] }),
    alt: { deck: 'b_sonfive_virtuousdeck', config: { vouchers: ['v_hieroglyph'] } },
  }),
  sleeve('propheticsleeve', 2, {
    name: 'Prophetic Sleeve',
    legacy: true, // (1.0.3: dropped by 1.2.0)
    config: { hand_size: -1, extra: { scry: 3 } },
    loc_vars: (self) => ({ vars: [self.config.hand_size, self.config.extra.scry] }),
    apply(self) { G.GAME.scry_amount = 0; G.GAME.scry_amount += self.config.extra.scry; },
    alt: { deck: 'b_sonfive_propheticdeck', config: { extra: { scry: 6 } } },
  }),
  sleeve('shinysleeve', 3, {
    name: 'Shiny Sleeve',
    config: { extra: { chance: 100 } },
    loc_vars: () => ({ vars: [] }),
    apply(self) {
      if (self.alt_active || !G.GAME.modifiers.shinydeck) {
        G.GAME.shiny_edition_rate = (G.GAME.shiny_edition_rate || 1) * self.config.extra.chance;
        G.GAME.modifiers.shinydeck = true;
      }
    },
    alt: { deck: 'b_sonfive_shinydeck' },
  }),
  sleeve('roguesleeve', 4, {
    name: 'Rogue Sleeve',
    config: { consumables: ['c_poke_megastone'] },
    loc_vars: () => ({ vars: [localize({ type: 'name_text', set: 'Item', key: 'c_poke_megastone' })] }),
    apply() { G.GAME.win_ante = G.GAME.win_ante + 4; },
  }),
  sleeve('voidsleeve', 5, {
    name: 'Void Sleeve',
    config: { extra: { num: 1, dem: 15 } },
    loc_vars: (self) => {
      const [num, dem] = get_probability_vars(G.GAME && G.GAME.sleeve_back, self.config.extra.num, self.config.extra.dem, 'voiddeck');
      return { vars: ['c_poke_nightmare', num, dem] };
    },
    apply() { G.GAME.modifiers.void = true; },
    hooks: { reroll_shop() { void_reroll({ extra: { num: 1, dem: 15 } }, G.GAME.sleeve_back); } },
  }),
];
