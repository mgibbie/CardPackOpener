// Pokermon 3.2.1 — sleeves/sleeve.lua: the CardSleeves sleeves (deck variants, engine/sleeve.js).
// Each mirrors its deck (backs/backs1.js): Trainer, Luminous, Telekinetic, Amped, Future, Stadium,
// Mega (3.9.1: + Crystal Ball, and its Mega Deck alt), Vending, and (pokemon_legacy only, like the Lua's slist) Obituary / Revenant.
// `config` goes through the same handling as a deck (vouchers, consumables); `apply` / `calculate`
// are the Lua's. Art: AtlasDecksBasic row 1, from Pokermon 3.9.1's sheet (AtlasDecksBasic391 in index.js; the same cells
// as 3.2.1's — Stadium / Mega: 3.2.1 shipped placeholder_sleeve, their art is 3.9.1's {8,1} / {9,1}).
import { G, P_CENTERS, localize, play_sound, create_card, change_shop_size, get_probability_vars } from './api.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { debris_apply } from './backs/backs1.js';

const MOD = 'pokermon';
const DECKS = 'poke_AtlasDecksBasic391', DECKS_391 = DECKS;
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
  // Obituary Sleeve: every card has a Pink Seal. Its 3.9.1 alt on the Obituary Deck (batch 17): Pink Seals have a 1 in 3 chance
  // to fall off after triggering (G.GAME.modifiers.poke_pink_seal_selfdestruct: seals/seals1.js), and a joker sold or destroyed
  // makes a Negative Energy of its type (poke_obituary_alt: systems/rules.js calculate + index.js sell_card).
  sleeve('obituarysleeve', 'Obituary Sleeve', { x: 2, y: 1 }, DECKS, {
    mod_option: 'pokemon_legacy',
    config: { num: 1, dem: 3 },
    loc_vars: () => ({ vars: [localize('pinkseal_variable')] }),
    apply() { G.GAME.modifiers.poke_force_seal = 'poke_pink_seal'; force_seal_event(); },
    alt: {
      deck: 'b_poke_obituarydeck',
      config: { num: 1, dem: 3 },
      loc_vars: (self) => ({ vars: get_probability_vars(null, self.config.num, self.config.dem, 'poke_pink_seal_selfdestruct') }),
      apply() {
        G.GAME.modifiers.poke_force_seal = 'poke_pink_seal';
        G.GAME.modifiers.poke_pink_seal_selfdestruct = true;
        G.GAME.modifiers.poke_obituary_alt = true;
        force_seal_event();
      },
    },
  }),
  // Revenant Sleeve: every card has a Silver Seal. Its 3.9.1 alt on the Revenant Deck (batch 17): +3 consumable slots, and Pocket
  // Packs never appear in the shop (poke_no_pocket_packs: their pool weight is 0 under object_weights — index.js; 3.9.1's
  // override also returns 1 for every Pocket Pack, the Megas' 0.25 included, until the game restarts: that quirk is not kept).
  sleeve('revenantsleeve', 'Revenant Sleeve', { x: 5, y: 1 }, DECKS, {
    mod_option: 'pokemon_legacy',
    loc_vars: () => ({ vars: [localize('silverseal_variable')] }),
    apply() { G.GAME.modifiers.poke_force_seal = 'poke_silver'; force_seal_event(); },
    alt: {
      deck: 'b_poke_revenantdeck',
      config: { consumable_slot: 3 },
      loc_vars: (self) => ({ vars: [self.config.consumable_slot] }),
      apply() {
        G.GAME.modifiers.poke_force_seal = 'poke_silver';
        G.GAME.modifiers.poke_no_pocket_packs = true;
        force_seal_event();
      },
    },
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
  sleeve('stadiumsleeve', 'Stadium Sleeve', { x: 8, y: 1 }, DECKS_391, {
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
  // Mega Sleeve (3.9.1, batch 16: + the Crystal Ball voucher; on the Mega Deck its alt: no vouchers / stone / slot, and
  // G.GAME.modifiers.poke_infinite_megastone, so Mega Evolution is no longer 1 Joker per Mega Stone: systems/items.js)
  sleeve('megasleeve', 'Mega Sleeve', { x: 9, y: 1 }, DECKS_391, {
    config: { vouchers: ['v_reroll_surplus', 'v_reroll_glut', 'v_crystal_ball'], consumables: ['c_poke_megastone'], shop_size: 1 },
    loc_vars: (self) => ({ vars: [localize('megastone_variable'), name_text('Voucher', 'v_reroll_surplus'), name_text('Voucher', 'v_reroll_glut'), self.config.shop_size, name_text('Voucher', 'v_crystal_ball')] }),
    apply(self) { G.E_MANAGER.add_event(() => { change_shop_size(-self.config.shop_size); }); },
    alt: {
      deck: 'b_poke_megadeck',
      config: {},
      loc_vars: () => ({ vars: [localize('megastone_variable')] }),
      apply() { G.GAME.modifiers.poke_infinite_megastone = true; },
    },
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
  // Debris Sleeve (3.9.1 sleeve.lua diceysleeve, AtlasDecksBasic {10,1}): as the Debris deck. Its alt with the Debris deck
  // (3.9.1: G.GAME.modifiers.poke_negative_hazards — every Hazard card carries card_limit +1, i.e. +1 hand size while
  // held) needs a playing-card card_limit seam the engine doesn't have: NOT registered, so on the Debris deck the sleeve
  // plays its own effect (one more layer and limit, +1 hand size). Deferred, with the playing-card card_limit seam.
  sleeve('diceysleeve', 'Debris Sleeve', { x: 10, y: 1 }, DECKS, {
    config: { no_interest: true, hazard_layer: 1, hazard_layer_max: 1, h_size: 1, money: 1 },
    loc_vars: (self) => ({ vars: [self.config.hazard_layer, self.config.hazard_layer_max, self.config.h_size, self.config.money] }),
    apply(self) { G.E_MANAGER.add_event(() => { debris_apply(self.config); }); },
  }),
];
