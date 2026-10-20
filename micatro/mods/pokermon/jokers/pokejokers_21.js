// Pokermon 3.9.1 — pokemon/pokejokers_21.lua (Pokédex 601-630: Elgyem -> Bisharp), 9 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8, Golett / Golurk (the Hazard layer) since batch 10.
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, localize, card_eval_status_text, juice_card_until,
  pseudorandom_element, pseudoseed, create_card,
  defineJokers, type_tooltip, detailed, scaling_evo, item_evo, level_evo, scale_card,
  poke_get_adjacent_jokers, poke_drain, has_enhancement, hazard_layer, hazard_level_tip,
  pseudorandom_probability, get_probability_vars,
} from '../api.js';

const FILE = 'pokemon/pokejokers_21.lua';

// ------------------------------------------------------------ shared bodies
/**
 * Elgyem / Beheeyem: at blind select, a Negative Planet for one of the top_planets
 * highest-level visible hands. (Lua sorts a pairs() list with table.sort; here the hands are
 * taken in G.GAME.hands order and sorted stably, so the pick is deterministic.)
 */
function elgyem_planet(card, context) {
  if (!context.setting_blind) return;
  const temp_hands = [];
  for (const [k, v] of Object.entries(G.GAME.hands)) if (v.visible) temp_hands.push({ handname: k, level: v.level });
  temp_hands.sort((hand1, hand2) => hand2.level - hand1.level);
  const highest_level_hands = temp_hands.filter((n, i) => i + 1 <= card.ability.extra.top_planets);
  const [_hand] = pseudorandom_element(highest_level_hands, pseudoseed('elgyem'));
  let _planet;
  for (const y of P_CENTER_POOLS.Planet) {
    if (y.config.hand_type === _hand.handname) { _planet = y.key; break; }
  }
  const _card = create_card('Planet', G.consumeables, null, null, null, null, _planet);
  _card.set_edition({ negative: true }, true);
  _card.add_to_deck();
  G.consumeables.emplace(_card);
  card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_planet'), colour: 'Planet' });
}
const neg_tip = (info_queue) => { if (detailed()) info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); };
/** A shop Voucher added by Beheeyem (Lua: Card(...) + create_shop_card_ui + emplace). */
function add_shop_voucher(key) {
  G.shop_vouchers.config.card_limit = G.shop_vouchers.config.card_limit + 1;
  const _card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
  _card.start_materialize();
  G.shop_vouchers.emplace(_card);
}
/** Golett / Golurk: held Hazard cards (or a roll) give XMult. */
function golem_held(card, context, seed) {
  if (context.individual && !context.end_of_round && context.cardarea === G.hand) {
    if (has_enhancement(context.other_card, 'm_poke_hazard') || pseudorandom_probability(card, seed, card.ability.extra.num, card.ability.extra.dem, seed)) {
      if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
      return { x_mult: card.ability.extra.Xmult_multi, card };
    }
  }
  return undefined;
}
const xmult_main = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult } : undefined);
/** Pawniard / Bisharp (3.9.1): +Xmult_mod XMult per destroyed face card (SMODS.scale_card, the total in the popup). */
function face_scale(card, face_cards) {
  scale_card(card, {
    ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_key: 'a_xmult', message_colour: 'XMULT',
    operation: (t, k, initial, modifier) => { t[k] = initial + modifier * face_cards; },
  });
}
const sell_mult = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_mult', vars: [card.sell_cost] }), colour: 'MULT', mult_mod: card.sell_cost } : undefined);

defineJokers({
  // Elgyem 605
  elgyem: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      neg_tip(info_queue);
      return { vars: [card.ability.extra.top_planets, card.ability.extra.current_planet_count, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      elgyem_planet(card, context);
      return scaling_evo(self, card, context, 'j_poke_beheeyem', card.ability.extra.current_planet_count, self.config.evo_rqmt);
    },
    update(self, card) {
      if (!G.consumeables) return;
      const uniques = [];
      for (const c of G.consumeables.cards) {
        let unique = true;
        for (const v of uniques) if (v.ability.name === c.ability.name) { unique = false; break; }
        if (unique && c.ability.set === 'Planet') uniques.push(c);
      }
      card.ability.extra.current_planet_count = uniques.length;
    },
  },
  // Beheeyem 606
  beheeyem: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      neg_tip(info_queue);
      return { vars: [center.ability.extra.top_planets, center.ability.extra.boosters_to_open] };
    },
    calculate(self, card, context) {
      elgyem_planet(card, context);
      // Pokermon 3.9.1: Blueprint no longer counts the Boosters.
      if (context.open_booster && !context.blueprint) {
        let added = false, telescope_in_shop = false, observatory_in_shop = false;
        const uv = G.GAME.used_vouchers;
        // (Lua `G.shop_vouchers and G.shop_vouchers.cards`: the shop's voucher row exists — i.e. the shop is open.)
        const shop_vouchers = G.shop_open && G.shop_vouchers && G.shop_vouchers.cards;
        if (!(uv.v_telescope && uv.v_observatory) && !(card.ability.extra.boosters_to_open === 1 && !shop_vouchers)) {
          card.ability.extra.boosters_to_open = card.ability.extra.boosters_to_open - 1;
        }
        if (card.ability.extra.boosters_to_open === 0) {
          card.ability.extra.boosters_to_open = 9;
          if (shop_vouchers) {
            for (const v of G.shop_vouchers.cards) {
              if (v.ability.name === 'Telescope') telescope_in_shop = true;
              if (v.ability.name === 'Observatory') observatory_in_shop = true;
            }
            if (!uv.v_telescope && !telescope_in_shop) { add_shop_voucher('v_telescope'); added = true; }
            if (uv.v_telescope && !uv.v_observatory && !observatory_in_shop) { add_shop_voucher('v_observatory'); added = true; }
          }
          if (added) card.juice_up();
        }
      }
      return undefined;
    },
  },
  // Litwick 607
  litwick: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'poke_drain' });
      return { vars: [center.ability.extra.money_minus, self.config.evo_rqmt, center.sell_cost, center.ability.extra.mult, center.ability.extra.sell_goal] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let Mult = card.ability.extra.mult;
        if (card.sell_cost >= card.ability.extra.sell_goal) Mult = 3 * card.ability.extra.mult;
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [Mult] }), colour: 'MULT', mult_mod: Mult };
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        const adjacent = poke_get_adjacent_jokers(card);
        for (const a of adjacent) poke_drain(card, a, card.ability.extra.money_minus);
      }
      return scaling_evo(self, card, context, 'j_poke_lampent', card.sell_cost, self.config.evo_rqmt);
    },
  },
  // Lampent 608
  lampent: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'poke_drain' });
      return { vars: [center.ability.extra.money_minus, center.sell_cost] };
    },
    calculate(self, card, context) {
      const r = sell_mult(card, context);
      if (r) return r;
      if (context.end_of_round && !context.individual && !context.repetition) {
        for (const j of G.jokers.cards.slice()) if (j !== card) poke_drain(card, j, card.ability.extra.money_minus);
      }
      return item_evo(self, card, context, 'j_poke_chandelure');
    },
  },
  // Chandelure 609
  chandelure: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult_multi, center.sell_cost] }; },
    calculate(self, card, context) {
      const r = sell_mult(card, context);
      if (r) return r;
      // Pokermon 3.9.1: any joker worth less than $2 (no post_trigger / set checks).
      if (context.other_joker && context.other_joker.sell_cost < 2) {
        const other = context.other_joker;
        G.E_MANAGER.add_event(() => other.juice_up(0.5, 0.5));
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_multi] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
      }
      return undefined;
    },
  },
  // Golett 622
  golett: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const abbr = center.ability.extra;
      info_queue.push(hazard_level_tip());
      info_queue.push(P_CENTERS.m_poke_hazard);
      const [num, dem] = get_probability_vars(center, abbr.num, abbr.dem, 'golett');
      return { vars: [abbr.hazard_level, abbr.Xmult_multi, abbr.rounds, num, dem] };
    },
    calculate(self, card, context) {
      return golem_held(card, context, 'golett') || level_evo(self, card, context, 'j_poke_golurk');
    },
    ...hazard_layer,
  },
  // Golurk 623
  golurk: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const abbr = center.ability.extra;
      info_queue.push(hazard_level_tip());
      info_queue.push(P_CENTERS.m_poke_hazard);
      const [num, dem] = get_probability_vars(center, abbr.num, abbr.dem, 'golurk');
      return { vars: [abbr.hazard_level, abbr.Xmult_multi, num, dem] };
    },
    calculate(self, card, context) {
      return golem_held(card, context, 'golurk');
    },
    ...hazard_layer,
  },
  // Pawniard 624
  pawniard: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      if (context.remove_playing_cards && !context.blueprint) {
        let face_cards = 0;
        for (const removed_card of context.removed) if (removed_card.is_face()) face_cards = face_cards + 1;
        if (face_cards > 0) face_scale(card, face_cards);
      }
      const r = xmult_main(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_bisharp', card.ability.extra.Xmult, self.config.evo_rqmt);
    },
  },
  // Bisharp 625
  bisharp: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, Math.max(0, self.config.evo_rqmt - center.ability.extra.kings_destroyed)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn) juice_card_until(card, () => G.GAME.current_round.hands_played === 0, true);
      if (context.remove_playing_cards && !context.blueprint) {
        let face_cards = 0;
        for (const removed_card of context.removed) {
          if (removed_card.is_face()) face_cards = face_cards + 1;
          if (removed_card.get_id() === 13) card.ability.extra.kings_destroyed = card.ability.extra.kings_destroyed + 1;
        }
        if (face_cards > 0) face_scale(card, face_cards);
      }
      const r = xmult_main(card, context);
      if (r) return r;
      // Pokermon 3.9.1: the lone face card of a first hand is destroyed straight from the destroy_card pass (no
      // final_scoring_step marker).
      if (context.destroy_card && context.full_hand.length === 1 && context.destroy_card === context.full_hand[0] && context.full_hand[0].is_face()
        && G.GAME.current_round.hands_played === 0 && !context.blueprint) {
        card.juice_up();
        return { remove: true };
      }
      return scaling_evo(self, card, context, 'j_poke_kingambit', card.ability.extra.kings_destroyed, self.config.evo_rqmt);
    },
  },
}, FILE);
