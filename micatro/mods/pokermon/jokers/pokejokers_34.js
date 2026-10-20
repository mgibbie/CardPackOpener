// Pokermon 3.9.1 — pokemon/pokejokers_34.lua (Pokédex 991-1020: Gimmighoul -> Gholdengo), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file).
import {
  G, P_CENTERS, localize, pseudorandom,
  defineJokers, type_tooltip, detailed, scaling_evo, has_enhancement, ease_poke_dollars, scale_card, multiplicative_scaling,
  smods_create_card, poke_add_shop_card, remove, POKE_POOL_RULES,
} from '../api.js';

const FILE = 'pokemon/pokejokers_34.lua';

defineJokers({
  // Gimmighoul 999 (Chest form)
  gimmighoul: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_gold);
      return { vars: [center.ability.extra.money, center.ability.extra.money_seen, center.ability.extra.money_goal] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && has_enhancement(context.other_card, 'm_gold')) {
        const earned = ease_poke_dollars(card, 'gimmi', card.ability.extra.money, true);
        // Pokermon 3.9.1: the $ goes into dollar_buffer (Gholdengo, Raichu-style readers see it before it lands).
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + earned;
        return { dollars: earned, card, func() { G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); } };
      }
      // Lua: `G.shop_jokers and G.shop_jokers.cards` — the shop row only exists while the shop is open.
      // (3.9.1: the Roaming Gimmighoul comes Negative and couponed.)
      if (context.skipping_booster && G.shop_open && G.shop_jokers && G.shop_jokers.cards) {
        const new_card = smods_create_card({ set: 'Joker', area: G.shop_jokers, key: 'j_poke_gimmighoulr', edition: 'e_negative' });
        poke_add_shop_card(new_card, card, true);
      }
      // Pokermon 3.9.1: every money change is counted through Steamodded's money_altered context (3.2.1 diffed the
      // money in update() every frame).
      if (context.money_altered) card.ability.extra.money_seen = card.ability.extra.money_seen + Math.abs(context.amount);
      return scaling_evo(self, card, context, 'j_poke_gholdengo', card.ability.extra.money_seen, card.ability.extra.money_goal);
    },
  },
  // Gimmighoul (Roaming form): pays out a random amount when obtained, then leaves.
  gimmighoulr: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [] };
    },
    add_to_deck(self, card, from_debuff) {
      let amount_earned;
      const money_chance = pseudorandom('gimmir');
      if (money_chance < 0.50) amount_earned = 1;
      else if (money_chance < 0.70) amount_earned = 3;
      else if (money_chance < 0.90) amount_earned = 5;
      else if (money_chance < 0.97) amount_earned = 10;
      else if (money_chance < 0.99) amount_earned = 30;
      else if (money_chance < 0.999) amount_earned = 50;
      else if (money_chance < 0.9999) amount_earned = 100;
      else amount_earned = 200;
      ease_poke_dollars(card, 'gimmir', amount_earned);
      remove(self, card, {});
    },
    // (3.9.1: never in a pool — POKE_POOL_RULES below.)
    set_ability(self, card, initial) {
      if (initial) card.set_edition({ negative: true }, true, true);
    },
  },
  // Gholdengo 1000
  gholdengo: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.money_minus, center.ability.extra.Xmult_multi] };
    },
    // Pokermon 3.9.1: a scored Gold card pays $money_minus for XXmult_multi while the money plus dollar_buffer covers it
    // (3.2.1 tracked a future_dollars copy from `before`); nothing at X1; resets to Xmult1.
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.Xmult > 1) {
        return { message: localize('poke_make_it_rain'), colour: 'MONEY', Xmult_mod: card.ability.extra.Xmult };
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && has_enhancement(context.other_card, 'm_gold')) {
        const buffer = G.GAME.dollar_buffer || 0, money_minus = card.ability.extra.money_minus;
        if ((G.GAME.dollars || 0) + buffer - money_minus >= 0) {
          scale_card(card, {
            ref_value: 'Xmult', scalar_value: 'Xmult_multi', no_message: true,
            operation: (t, k, initial, scalar) => multiplicative_scaling(t, k, initial, scalar),
          });
          G.GAME.dollar_buffer = buffer - money_minus;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return { dollars: -money_minus, card };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.ability.extra.Xmult = card.ability.extra.Xmult1;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
}, FILE);

// Pokermon 3.9.1: the Roaming Gimmighoul is never in a pool.
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_gimmighoulr' ? false : undefined));
