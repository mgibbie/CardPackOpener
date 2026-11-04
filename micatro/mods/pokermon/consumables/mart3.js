// Pokermon 3.2.1 — consumables/mart3.lua: Prism Scale, Dawn Stone, Dusk Stone, Hard Stone and
// Heart Scale. Line-for-line; card flips (juice_flip*) are cosmetic.
import {
  G, P_CENTERS, localize, delay, ease_dollars, copy_card, pseudoshuffle, pseudoseed, juice_card_until,
  defineConsumables, set_spoon_item, is_evo_item_for, evo_item_use_total, highlighted_evo_item,
  poke_unhighlight_cards, poke_drain, find_pokemon_type, juice_flip, juice_flip_table,
} from '../api.js';

const FILE = 'consumables/mart3.lua';
const joker_target_ok = (self) => G.jokers.highlighted && G.jokers.highlighted.length === 1 && is_evo_item_for(self, G.jokers.highlighted[0]);
/** Hand index stands in for screen x (Lua compares card.T.x). */
const hand_x = (c) => G.hand.cards.indexOf(c);

defineConsumables({
  // Prism Scale: up to 4 other cards held in hand take the selected card's suit.
  prismscale: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); return { vars: [self.config.max_highlighted, self.config.converted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 1);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted.length === 1) {
        const selected_suit = G.hand.highlighted[0].base.suit;
        const cards_held = G.hand.cards.filter((v) => v !== G.hand.highlighted[0]);
        pseudoshuffle(cards_held, pseudoseed('prism'));
        const limit = Math.min(cards_held.length, self.config.converted);
        juice_flip_table(card, cards_held, false, limit);
        for (let i = 0; i < limit; i++) G.E_MANAGER.add_event(() => { cards_held[i].change_suit(selected_suit); });
        juice_flip_table(card, cards_held, true, limit);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Dusk Stone: $4 per Drainable joker (draining $1 from each), or per joker once it has been
  // held for 3 rounds; max $30.
  duskstone: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'eitem' });
      info_queue.push({ set: 'Other', key: 'poke_drain_item' });
      const ci = (center && center.ability && center.ability.extra) || self.config.extra;
      const round = (G.GAME && G.GAME.round) || 0;
      let joker_count = 0;
      for (const j of (G.jokers && G.jokers.cards) || []) if (j.sell_cost > 1 || round >= ci.round_on_add + ci.rounds) joker_count++;
      return { vars: [ci.money, ci.rounds, Math.max(0, ci.round_on_add + ci.rounds - round), Math.min(ci.max, ci.money * joker_count), ci.max] };
    },
    can_use() { return true; },
    use(self, card, area, copier) {
      set_spoon_item(card);
      const ex = card.ability.extra;
      let joker_count = 0;
      for (const j of G.jokers.cards) {
        if (j.sell_cost > 1 || G.GAME.round >= ex.round_on_add + ex.rounds) {
          joker_count++;
          if (!(G.GAME.round >= ex.round_on_add + ex.rounds)) poke_drain(card, j, 1, true);
        }
      }
      ease_dollars(Math.min(ex.max, ex.money * joker_count));
      evo_item_use_total(self, card, area, copier);
    },
    set_ability(self, card, initial) {
      if (initial && G.GAME) card.ability.extra.round_on_add = G.GAME.round;
    },
    /** Juices once it has matured (cosmetic; runs whenever the card is calculated). */
    update(self, card) {
      const ex = card.ability.extra;
      if (G.GAME.round >= ex.round_on_add + ex.rounds && !ex.juiced) {
        ex.juiced = true;
        juice_card_until(card, (c) => !c.removed, true);
      }
    },
    in_pool() { return true; },
  },

  // Dawn Stone: earn twice the Mult of the first hand played after getting it (max $40).
  dawnstone: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'eitem' });
      let money = 0;
      let message = localize('poke_dawn_info2');
      const ex = (center && center.ability && center.ability.extra) || self.config.extra;
      const hand_played = ex.hand_played;
      const money_limit = ex.money_limit;
      if (hand_played) money = G.GAME.hands[hand_played].mult * 2;
      else message = localize('poke_dawn_info1');
      return { vars: [hand_played ? localize(hand_played, 'poker_hands') : localize('poke_none'), Math.min(money_limit, money), money_limit, message] };
    },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!card.ability.extra.hand_played;
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (card.ability.extra.hand_played) {
        const hand_played = card.ability.extra.hand_played;
        const money_limit = card.ability.extra.money_limit;
        const mult = G.GAME.hands[hand_played].mult;
        ease_dollars(Math.min(mult * 2, money_limit));
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && !card.ability.extra.hand_played) {
        card.ability.extra.hand_played = context.scoring_name;
        card.juice_up();
      }
      return undefined;
    },
    in_pool() { return true; },
  },

  // Hard Stone: 1 card becomes Stone, +10 permanent chips per Earth-type joker.
  hardstone: {
    loc_vars(self, info_queue) { info_queue.push(P_CENTERS.m_stone); info_queue.push({ set: 'Other', key: 'eitem' }); return { vars: [self.config.max_highlighted, self.config.max_chips] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 1);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 1) {
        const conv_card = G.hand.highlighted[0];
        juice_flip(card);
        conv_card.set_ability(P_CENTERS.m_stone, null, true);
        const bonus = self.config.max_chips * find_pokemon_type('Earth').length;
        if (bonus > 0) conv_card.ability.perma_bonus = (conv_card.ability.perma_bonus || 0) + bonus;
        juice_flip(card, true);
        delay(0.5);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Heart Scale: of 2 selected cards, the left becomes a copy of the right; both become Hearts.
  // (No can_use in the Lua: the vanilla rule — exactly 2 selected — applies.) Never in a pool.
  heartscale: {
    loc_vars(self) { return { vars: [self.config.max_highlighted, localize(self.config.suit, 'suits_plural')] }; },
    use(self, card) {
      set_spoon_item(card);
      juice_flip(card);
      const highlighted = G.hand.highlighted.slice();
      let rightmost = highlighted[0];
      for (const c of highlighted) if (hand_x(c) > hand_x(rightmost)) rightmost = c;
      for (const c of highlighted) G.E_MANAGER.add_event(() => { if (c !== rightmost) copy_card(rightmost, c); });
      for (const c of highlighted) G.E_MANAGER.add_event(() => { c.change_suit(self.config.suit); });
      juice_flip(card, true);
      delay(0.5);
      poke_unhighlight_cards();
    },
    in_pool() { return false; },
  },
}, FILE);
