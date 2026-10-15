// Pokermon 3.2.1 — pokemon/pokejokers_34.lua (Pokédex 991-1020: Gimmighoul -> Gholdengo), 3 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
import {
  G, P_CENTERS, localize, pseudorandom, juice_card_until,
  defineJokers, type_tooltip, detailed, scaling_evo, has_enhancement, ease_poke_dollars,
  smods_create_card, poke_add_shop_card, remove,
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
        return { dollars: earned, card };
      }
      // Lua: `G.shop_jokers and G.shop_jokers.cards` — the shop row only exists while the shop is open.
      if (context.skipping_booster && G.shop_open && G.shop_jokers && G.shop_jokers.cards) {
        const new_card = smods_create_card({ set: 'Joker', area: G.shop_jokers, key: 'j_poke_gimmighoulr' });
        new_card.set_edition({ negative: true }, true);
        poke_add_shop_card(new_card, card);
        new_card.cost = 0;
      }
      return scaling_evo(self, card, context, 'j_poke_gholdengo', card.ability.extra.money_seen, card.ability.extra.money_goal);
    },
    set_ability(self, card, initial) {
      if (initial && G.GAME && G.GAME.dollars !== undefined) card.ability.extra.previous_money = G.GAME.dollars;
    },
    // Lua runs this every frame; Micatro runs mod update() before every calculate and after every
    // change of money (ease_dollars), so each earn / spend is seen on its own.
    update(self, card) {
      if (!G.GAME || G.GAME.dollars === undefined) return;
      if (card.ability.extra.previous_money === undefined) card.ability.extra.previous_money = 0;
      const money_diff = Math.abs(G.GAME.dollars - card.ability.extra.previous_money);
      if (money_diff > 0) {
        card.ability.extra.money_seen = card.ability.extra.money_seen + money_diff;
        card.ability.extra.previous_money = G.GAME.dollars;
      }
      if (card.ability.extra.money_seen >= card.ability.extra.money_goal && !card.ability.extra.juiced) {
        card.ability.extra.juiced = true;
        juice_card_until(card, (c) => !c.removed && !G.RESET_JIGGLES, true);
      }
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
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) card.ability.extra.future_dollars = G.GAME.dollars;
        if (context.joker_main) return { message: localize('poke_make_it_rain'), colour: 'MONEY', Xmult_mod: card.ability.extra.Xmult };
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && has_enhancement(context.other_card, 'm_gold')) {
        card.ability.extra.future_dollars = card.ability.extra.future_dollars - card.ability.extra.money_minus;
        if (card.ability.extra.future_dollars >= 0) {
          card.ability.extra.Xmult = card.ability.extra.Xmult * card.ability.extra.Xmult_multi;
          return { dollars: -card.ability.extra.money_minus, card };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.ability.extra.Xmult = card.ability.extra.oXmult;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
}, FILE);
