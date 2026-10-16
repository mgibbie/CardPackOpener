// Pokermon 3.2.1 — sleeves/sleeve.lua: the CardSleeves sleeves (deck variants, engine/sleeve.js).
// Each mirrors its deck (backs/backs1.js): Trainer, Luminous, Telekinetic, Amped, Future, Stadium,
// Mega, Vending, and (pokemon_legacy only, like the Lua's slist) Obituary / Revenant.
// `config` goes through the same handling as a deck (vouchers, consumables); `apply` / `calculate`
// are the Lua's. Art: AtlasDecksBasic row 1 (Stadium / Mega use placeholder_sleeve, as shipped).
import { G, P_CENTERS, localize, play_sound, create_card, change_shop_size } from './api.js';
import { Tag, add_tag } from '../../js/engine/tag.js';

const MOD = 'pokermon';
const DECKS = 'poke_AtlasDecksBasic', PLACEHOLDER = 'poke_placeholder_sleeve';
const name_text = (set, key) => localize({ type: 'name_text', set, key });

/** sleeve.lua init(): after the deck (and sleeve) apply, every playing card gets poke_force_seal. */
function force_seal_event() {
  G.E_MANAGER.add_event(() => {
    if (G.GAME.modifiers.poke_force_seal) for (const c of G.playing_cards) c.set_seal(G.GAME.modifiers.poke_force_seal, true);
  });
}

const sleeve = (key, name, pos, atlas, def) => ({ key: 'sleeve_poke_' + key, name, pos, atlas, mod: MOD, config: {}, ...def });

export const SLEEVES = [
  sleeve('pokemonsleeve', 'Trainer Sleeve', { x: 0, y: 1 }, DECKS, {
    config: { vouchers: ['v_poke_goodrod'], consumables: ['c_poke_pokeball'] },
    loc_vars: () => ({ vars: [localize('goodrod_variable'), localize('pokeball_variable')] }),
  }),
  sleeve('obituarysleeve', 'Obituary Sleeve', { x: 2, y: 1 }, DECKS, {
    mod_option: 'pokemon_legacy',
    loc_vars: () => ({ vars: [localize('pinkseal_variable')] }),
    apply() { G.GAME.modifiers.poke_force_seal = 'poke_pink_seal'; force_seal_event(); },
  }),
  sleeve('revenantsleeve', 'Revenant Sleeve', { x: 5, y: 1 }, DECKS, {
    mod_option: 'pokemon_legacy',
    loc_vars: () => ({ vars: [localize('silverseal_variable')] }),
    apply() { G.GAME.modifiers.poke_force_seal = 'poke_silver'; force_seal_event(); },
  }),
  sleeve('luminoussleeve', 'Luminous Sleeve', { x: 1, y: 1 }, DECKS, {
    loc_vars: () => ({ vars: [] }),
    apply() { G.GAME.modifiers.apply_type = true; },
  }),
  sleeve('telekineticsleeve', 'Telekinetic Sleeve', { x: 3, y: 1 }, DECKS, {
    config: { vouchers: ['v_crystal_ball'], consumables: ['c_poke_twisted_spoon', 'c_poke_twisted_spoon'] },
    loc_vars: () => ({ vars: [name_text('Voucher', 'v_crystal_ball'), localize('twisted_spoon_variable')] }),
  }),
  sleeve('ampedsleeve', 'Amped Sleeve', { x: 4, y: 1 }, DECKS, {
    config: { vouchers: ['v_poke_energysearch'], consumables: ['c_poke_double_rainbow_energy'] },
    loc_vars: () => ({ vars: [name_text('Voucher', 'v_poke_energysearch'), localize('double_rainbow_energy_variable')] }),
  }),
  sleeve('futuresleeve', 'Future Sleeve', { x: 6, y: 1 }, DECKS, {
    config: { scry: 4 },
    loc_vars: (self) => ({ vars: [self.config.scry] }),
    apply(self) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + self.config.scry; },
  }),
  sleeve('stadiumsleeve', 'Stadium Sleeve', { x: 0, y: 0 }, PLACEHOLDER, {
    loc_vars: () => ({ vars: [] }),
    apply() {
      G.E_MANAGER.add_event(() => {
        const enhancements = ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky'];
        for (const e of enhancements) {
          // SMODS.add_card{set = 'Base', area = G.deck, no_edition = true, enhancement = e}
          const added = create_card('Base', G.deck, null, null, true, null, null, null);
          added.set_ability(P_CENTERS[e]);
          G.playing_card = (G.playing_card || 0) + 1;
          added.playing_card = G.playing_card;
          G.playing_cards.push(added);
          added.add_to_deck();
          G.deck.emplace(added);
        }
        G.GAME.starting_deck_size = G.GAME.starting_deck_size + enhancements.length;
      });
    },
  }),
  sleeve('megasleeve', 'Mega Sleeve', { x: 0, y: 0 }, PLACEHOLDER, {
    config: { vouchers: ['v_reroll_surplus', 'v_reroll_glut'], consumables: ['c_poke_megastone'], shop_size: 1 },
    loc_vars: (self) => ({ vars: [localize('megastone_variable'), name_text('Voucher', 'v_reroll_surplus'), name_text('Voucher', 'v_reroll_glut'), self.config.shop_size] }),
    apply(self) { G.E_MANAGER.add_event(() => { change_shop_size(-self.config.shop_size); }); },
  }),
  sleeve('vendingsleeve', 'Vending Sleeve', { x: 7, y: 1 }, DECKS, {
    loc_vars: () => ({ vars: [name_text('Tag', 'tag_voucher')] }),
    calculate(self, back, context) {
      if (context.round_eval && G.GAME.last_blind && G.GAME.last_blind.boss && ((G.GAME.round_resets.ante - 1) % 2 === 1)) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_voucher'));
          play_sound('generic1', 0.9, 0.8);
          play_sound('holo1', 1.2, 0.4);
        });
      }
    },
  }),
];
