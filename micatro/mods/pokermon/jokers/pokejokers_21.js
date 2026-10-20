// Pokermon 3.9.1 — pokemon/pokejokers_21.lua (Pokédex 601-630: Klinklang -> Bisharp), 9 jokers + 4 new in 3.9.1
// (Klinklang, the Axew line: at the end, new-jokers sub-batch 15; static data: data391.js new_jokers).
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8, Golett / Golurk (the Hazard layer) since batch 10.
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, localize, card_eval_status_text, juice_card_until,
  pseudorandom_element, pseudoseed, create_card,
  defineJokers, type_tooltip, detailed, scaling_evo, item_evo, level_evo, scale_card,
  poke_get_adjacent_jokers, poke_drain, has_enhancement, hazard_layer, hazard_level_tip,
  pseudorandom_probability, get_probability_vars,
  pseudoshuffle, update_hand_text, ease_poke_dollars,
} from '../api.js';
import * as BN from '../../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { mod_mult, mod_chips } from '../../../js/engine/core.js';

const FILE = 'pokemon/pokejokers_21.lua';

// ------------------------------------------------------------ shared bodies
/** Axew line (3.9.1, new-jokers sub-batch 15): the Nature's 2 poker hands (targets = {{hand}, {hand}}). */
const axew_vars = (center) => center.ability.extra.targets.slice(0, 2).map((t) => (t[0] ? localize(t[0], 'poker_hands') : localize('poke_none')));
const axew_nature = (card, context) => context.scoring_name === card.ability.extra.targets[0][0] || context.scoring_name === card.ability.extra.targets[1][0];
/** The modify_hand context: the Lua sets the globals `mult = mod_mult(mult * n)` / `hand_chips = mod_chips(hand_chips * n)`. */
function axew_modify(card, context, n) {
  context.mult = mod_mult(BN.mul(context.mult, n));
  context.hand_chips = mod_chips(BN.mul(context.hand_chips, n));
  update_hand_text({ sound: 'gong' }, { chips: context.hand_chips, mult: context.mult });
  card.juice_up();
}
/** set_nature: 2 of the visible poker hands, shuffled with the joker's seed. (Lua shuffles a pairs() list of G.GAME.hands,
 *  whose order Lua leaves unspecified; here the hands are taken in G.GAME.hands order, so the pick is deterministic.) */
function axew_set_nature(card, seed) {
  const visible_hands = [];
  for (const [k, v] of Object.entries(G.GAME.hands)) if (v.visible) visible_hands.push(k);
  pseudoshuffle(visible_hands, pseudoseed(seed));
  if (visible_hands[0]) card.ability.extra.targets[0][0] = visible_hands[0];
  if (visible_hands[1]) card.ability.extra.targets[1][0] = visible_hands[1];
}
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
  // ---------------------------------------------------------------- new in 3.9.1 (new-jokers sub-batch 15)
  // Klinklang 601: $1 and +X0.4 Mult for every 8 cards drawn during the Blind; the X Mult resets at end of round.
  klinklang: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      return { vars: [abbr.money, abbr.to_draw, Math.max(0, abbr.to_draw - abbr.drawn), abbr.Xmult, abbr.Xmult_mod] };
    },
    calculate(self, card, context) {
      // (SMODS.drawn_cards = Micatro's context.hand_drawn: the cards this draw brought in, during the Blind)
      if (context.hand_drawn && !context.blueprint) {
        card.ability.extra.drawn = card.ability.extra.drawn + context.hand_drawn.length;
        if (card.ability.extra.drawn >= card.ability.extra.to_draw) {
          scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_colour: 'MULT' });
          const earned = ease_poke_dollars(card, 'klinklang', card.ability.extra.money * Math.floor(card.ability.extra.drawn / card.ability.extra.to_draw));
          card.ability.extra.drawn = card.ability.extra.drawn % card.ability.extra.to_draw;
          return { message: '$' + earned, colour: 'MONEY' };
        }
      }
      if (context.joker_main) return { xmult: card.ability.extra.Xmult };
      if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult2;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
  // Axew 610: Nature = 2 poker hands (set on creation). The first Nature hand of the round has its base Chips and Mult
  // doubled (the modify_hand context); evolves after 7 Nature hands.
  axew: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'nature', vars: ['poker hand'] });
      return { vars: [...axew_vars(center), Math.max(0, self.config.evo_rqmt - center.ability.extra.nature_played)] };
    },
    calculate(self, card, context) {
      if (context.joker_main && axew_nature(card, context) && !context.blueprint) {
        card.ability.extra.nature_played = card.ability.extra.nature_played + 1;
      }
      if (context.modify_hand && axew_nature(card, context) && card.ability.extra.active) {
        axew_modify(card, context, 2);
        card.ability.extra.active = false;
      }
      if (context.end_of_round && context.main_eval && !context.blueprint) card.ability.extra.active = true;
      return scaling_evo(self, card, context, 'j_poke_fraxure', card.ability.extra.nature_played, self.config.evo_rqmt);
    },
    set_ability(self, card, initial) { if (initial) axew_set_nature(card, 'axew'); },
  },
  // Fraxure 611: Nature hands have their base Chips and Mult doubled; evolves after 7 more Nature hands.
  fraxure: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'nature', vars: ['poker hand'] });
      return { vars: [...axew_vars(center), Math.max(0, self.config.evo_rqmt - center.ability.extra.nature_played)] };
    },
    calculate(self, card, context) {
      if (context.joker_main && axew_nature(card, context) && !context.blueprint) {
        card.ability.extra.nature_played = card.ability.extra.nature_played + 1;
      }
      if (context.modify_hand && axew_nature(card, context)) axew_modify(card, context, 2);
      return scaling_evo(self, card, context, 'j_poke_haxorus', card.ability.extra.nature_played, self.config.evo_rqmt);
    },
    set_ability(self, card, initial) { if (initial) axew_set_nature(card, 'fraxure'); },
  },
  // Haxorus 612: Nature hands have their base Chips and Mult tripled. (Its config's `rounds` is read by nothing.)
  haxorus: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'nature', vars: ['poker hand'] });
      return { vars: axew_vars(center) };
    },
    calculate(self, card, context) {
      if (context.modify_hand && axew_nature(card, context)) axew_modify(card, context, 3);
      return undefined;
    },
    set_ability(self, card, initial) { if (initial) axew_set_nature(card, 'haxorus'); },
  },
}, FILE);
