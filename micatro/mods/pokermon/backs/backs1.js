// Pokermon 3.2.1 — backs/backs1.lua: the 10 decks. Trainer (Good Rod + a Poké Ball; only with the
// pokeballs option), Luminous (every joker is created with a random Tera type, +1 Energy if it
// matches: G.GAME.modifiers.apply_type, see systems/rules.js create_card), Telekinetic (Crystal
// Ball + 2 Twisted Spoons), Amped (Energy Search + Double Rainbow Energy), Future (+4 Foresight:
// G.GAME.scry_amount, systems/scry.js), Stadium (+8 enhanced cards), Mega (Reroll Surplus + Glut,
// a Megastone, -1 shop slot), Vending (a Voucher Tag after each odd Ante's Boss), and the legacy
// Obituary / Revenant (every card has a Pink / Silver seal; only with pokemon_legacy).
// Vouchers / consumables in `config` are applied by the vanilla Back.apply_to_run; `apply` /
// `calculate` run through Micatro's mod-back seams (engine/back.js).
import { G, P_CENTERS, localize, play_sound, create_card, defineBacks, change_shop_size } from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';

const FILE = 'backs/backs1.lua';

/**
 * backs1.lua init(): after any back applies, every playing card gets G.GAME.modifiers.poke_force_seal
 * (created cards get it from rules.js create_card). Only Obituary / Revenant set it in 3.2.1.
 */
function force_seal_event() {
  G.E_MANAGER.add_event(() => {
    if (G.GAME.modifiers.poke_force_seal) for (const c of G.playing_cards) c.set_seal(G.GAME.modifiers.poke_force_seal, true);
  });
}

defineBacks({
  pokemondeck: {
    loc_vars() { return { vars: [localize('goodrod_variable'), localize('pokeball_variable')] }; },
  },
  luminousdeck: {
    loc_vars() { return { vars: [] }; },
    apply() { G.GAME.modifiers.apply_type = true; },
  },
  obituarydeck: {
    loc_vars() { return { vars: [localize('pinkseal_variable')] }; },
    apply() { G.GAME.modifiers.poke_force_seal = 'poke_pink_seal'; force_seal_event(); },
  },
  revenantdeck: {
    loc_vars() { return { vars: [localize('silverseal_variable')] }; },
    apply() { G.GAME.modifiers.poke_force_seal = 'poke_silver'; force_seal_event(); },
  },
  telekineticdeck: {
    loc_vars() { return { vars: [localize({ type: 'name_text', key: 'v_crystal_ball', set: 'Voucher' }), localize('twisted_spoon_variable')] }; },
  },
  ampeddeck: {
    loc_vars() { return { vars: [localize({ type: 'name_text', key: 'v_poke_energysearch', set: 'Voucher' }), localize('double_rainbow_energy_variable')] }; },
  },
  futuredeck: {
    loc_vars(self) { return { vars: [self.config.scry] }; },
    apply(self) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + self.config.scry; },
  },
  stadiumdeck: {
    loc_vars() { return { vars: [] }; },
    apply() {
      G.E_MANAGER.add_event(() => {
        const enhancements = ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky'];
        for (const e of enhancements) {
          // SMODS.add_card{set = 'Base', area = G.deck, no_edition = true, enhancement = e, skip_materialize = true}:
          // a random playing card (create_card 'Base') joins the deck as a new playing card.
          const added_card = create_card('Base', G.deck, null, null, true, null, null, null);
          added_card.set_ability(P_CENTERS[e]);
          G.playing_card = (G.playing_card || 0) + 1;
          added_card.playing_card = G.playing_card;
          G.playing_cards.push(added_card);
          added_card.add_to_deck();
          G.deck.emplace(added_card);
        }
        G.GAME.starting_deck_size = G.GAME.starting_deck_size + enhancements.length;
      });
    },
  },
  megadeck: {
    loc_vars(self) {
      return { vars: [localize('megastone_variable'), localize({ type: 'name_text', key: 'v_reroll_surplus', set: 'Voucher' }),
        localize({ type: 'name_text', key: 'v_reroll_glut', set: 'Voucher' }), self.config.shop_size] };
    },
    apply(self) { G.E_MANAGER.add_event(() => { change_shop_size(-self.config.shop_size); }); },
  },
  vendingdeck: {
    loc_vars() { return { vars: [localize({ type: 'name_text', key: 'tag_voucher', set: 'Tag' })] }; },
    calculate(self, back, context) {
      if (context.round_eval && G.GAME.last_blind && G.GAME.last_blind.boss && ((G.GAME.round_resets.ante - 1) % 2 === 1)) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_voucher'));
          play_sound('generic1', 0.9, 0.8);
          play_sound('holo1', 1.2, 0.4);
        });
      }
    },
  },
}, FILE);
