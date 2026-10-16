// Sonfive's Pokermon+ — src/sleeves/sleeves.lua: the 5 CardSleeves sleeves (deck variants, engine/sleeve.js),
// each with its deck pairing (`alt`, CardSleeves' get_current_deck_key) as the Lua's loc_vars set it.
// Notes (as the mod plays: loc_vars rewrites self.config when the sleeve is shown, before the run starts):
//   * Virtuous: a Timer Ball and -1 hand (the config's dollars = -4 is replaced by loc_vars); with the
//     Virtuous deck: the Hieroglyph voucher instead.
//   * Prophetic: -1 hand size, Foresight set to 3; with the Prophetic deck: Foresight set to 6 (+3 over the deck).
//   * Shiny: shiny Pokémon x100 (the mod's edition_weight hook reads G.GAME.shiny_edition_rate). With the Shiny
//     deck the Lua's per-run guard made it a no-op although its text says "even more likely" — intended-design
//     fix: it multiplies again.
//   * Rogue: a Mega Stone and +4 win ante. Void: Negative Energy +1 limit (modifiers.void) and a Nightmare after
//     each Boss Blind (the Void deck's own calculate); its `_alt` text is never used by the Lua (no deck check).
import { G, localize } from '../pokermon/api.js';
import { nightmare_after_boss } from './src/pokemon/491_darkrai_line.js';

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
    loc_vars: () => ({ vars: ['c_poke_nightmare'] }),
    apply() { G.GAME.modifiers.void = true; },
    hooks: { end_round() { nightmare_after_boss({ end_of_round: true }); } },
  }),
];
