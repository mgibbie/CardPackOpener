// Pokermon 3.9.1 (batch 6) — pokemon/pokejokers_05.lua (Pokédex 121-150: Starmie -> Mega Mewtwo Y), 36 jokers + 2 new 3.9.1 Megas (Mega Starmie / Dragonite, batch 16).
// Line-for-line port of the 3.9.1 behaviour (reworked: Magmar, Lapras, Ditto, Eevee, Vaporeon, Jolteon, Flareon,
// Aerodactyl, Snorlax, Mewtwo; Jynx's copies are announced); static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req, evo_list, megas, volatile, custom_pool_func) comes from data.js + data391.js (the 3.9.1 config).
// Magikarp's "every played card scores" (Splash) rule lives in systems/rules.js (splash hook).
import {
  G, P_CENTERS, P_CENTER_POOLS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element,
  create_card, copy_card, juice_card_until, playing_card_joker_effects, play_sound, poll_edition, level_up_hand,
  update_hand_text, get_poker_hand_info,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, type_evo, ease_poke_dollars,
  has_enhancement, find_joker, find_card, any, get_probability_vars, pseudorandom_probability, volatile_active,
  remove, poke_evolve, apply_type_sticker, type_sticker_applied, energy_increase, poke_convert_cards_to,
  smods_create_card, poke_add_shop_card, can_evolve_to_highest, POKE_POOL_RULES,
  object_weights, poll_seal_weighted,
} from '../api.js';
import { calculate_reroll_cost } from '../../../js/engine/core.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { STATES } from '../../../js/engine/run.js';

const FILE = 'pokemon/pokejokers_05.lua';

// ------------------------------------------------------------ shared bodies
const mega_tip = (info_queue) => { if (detailed()) info_queue.push({ set: 'Other', key: 'mega_poke' }); };
const ancient_tip = (info_queue, rank) => info_queue.push({ set: 'Other', key: 'ancient', vars: [localize(rank, 'ranks')] });
const a_mult = (card) => ({ message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult });
const a_xmult = (x) => ({ message: localize({ type: 'variable', key: 'a_xmult', vars: [x] }), colour: 'XMULT', Xmult_mod: x });
const count_id = (scoring_hand, id) => { let n = 0; for (const c of scoring_hand) if (c.get_id() === id) n = n + 1; return n; };
const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;

/** Starmie (and Staryu in pokejokers_04): +Mult and $ per scored Diamond. */
function star_calc(card, context) {
  if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
    if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
      G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.money_mod;
      G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
      const earned = ease_poke_dollars(card, 'starmie', card.ability.extra.money_mod, true);
      return { mult: card.ability.extra.mult, dollars: earned, card };
    }
  }
  return undefined;
}

/**
 * SMODS.poll_seal({guaranteed = true}): a weighted pick (weight 5 each unless the seal says
 * otherwise) from the current Seal pool, seeded 'stdsealtype<ante>'. Seals that aren't in
 * pool (unported / their in_pool says no) are skipped, like get_current_pool's UNAVAILABLE.
 */
export function poll_seal_guaranteed() { // (also Spidops, pokejokers_31.js)
  // (Pokermon 3.9.1 turns Steamodded's object_weights on: SMODS.poll_seal is then SMODS.poll_object over the Seal set. Batch 17.)
  if (object_weights()) return poll_seal_weighted({ guaranteed: true });
  const available = [];
  let type_weight = 0;
  for (const v of P_CENTER_POOLS.Seal || []) {
    if (v.unported || (typeof v.in_pool === 'function' && !v.in_pool(v, {}))) continue;
    const weight = (v.get_weight ? v.get_weight(v) : v.weight) ?? 5;
    if (weight > 0) { available.push({ key: v.key, weight }); type_weight = type_weight + weight; }
  }
  // (the "is a seal generated" roll still happens, then `or guaranteed` makes it a yes)
  pseudorandom(pseudoseed('stdseal' + G.GAME.round_resets.ante));
  const seal_type_poll = pseudorandom(pseudoseed('stdsealtype' + G.GAME.round_resets.ante));
  let weight_i = 0;
  for (const v of available) {
    weight_i = weight_i + v.weight;
    if (seal_type_poll > 1 - (weight_i / type_weight)) return v.key;
  }
  return undefined;
}

/** Omanyte / Omastar: create a card of `set` in the consumable slots if there's room. */
function fossil_create(set, msg, colour) {
  if (room()) {
    const _card = create_card(set, G.consumeables, null, null, null, null, null);
    _card.add_to_deck();
    G.consumeables.emplace(_card);
    card_eval_status_text(_card, 'extra', null, null, null, { message: localize(msg), colour });
  }
}
/** Kabuto / Kabutops: Ancient 2s — level flags set before scoring. */
function kabuto_before(card, context, fourth) {
  const twos = count_id(context.scoring_hand, 2);
  card.ability.extra.first_level = twos > 0;
  card.ability.extra.second_level = twos > 1;
  card.ability.extra.third_level = twos > 2;
  if (fourth) card.ability.extra.fourth_level = twos > 3;
}
function kabuto_perma(card, context) {
  if (context.individual && !context.end_of_round && context.cardarea === G.play && card.ability.extra.second_level) {
    if (context.other_card.get_id() === 2) {
      context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus || 0;
      context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus + card.ability.extra.chips2;
      return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
    }
  }
  return undefined;
}
/**
 * pokermon.get_highest_evo(v) as Eevee asks it (3.9.1): can this Pokémon still evolve? A stage with a next one
 * (POKE_STAGES: Baby / Basic / One / Legendary) whose line has a higher form. (No RNG drawn: 3.9.1 rolls the
 * branch it would pick, which only matters for the pick, not for the yes / no.)
 */
const EVO_STAGES = new Set(['Baby', 'Basic', 'One', 'Legendary']);
function eevee_can_evolve() {
  let n = 0;
  if (G.jokers && G.jokers.cards) for (const v of G.jokers.cards) if (EVO_STAGES.has(v.config.center.stage) && can_evolve_to_highest(v)) n = n + 1;
  return n;
}
/** Dratini / Dragonair: +mult_mod per hand of `size` cards or fewer. */
function dratini_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.full_hand) {
    if (context.before && context.full_hand.length <= card.ability.extra.size && !context.blueprint) {
      card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
    }
    if (context.joker_main) return a_mult(card);
  }
  return undefined;
}

defineJokers({
  // Starmie 121
  starmie: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      mega_tip(info_queue);
      return { vars: [center.ability.extra.mult, center.ability.extra.money_mod, localize(center.ability.extra.suit, 'suits_singular')] };
    },
    calculate(self, card, context) { return star_calc(card, context); },
  },
  // Mega Starmie 121-1 (3.9.1, batch 16): in a 2-card hand, each scoring Diamond gives X2.5 Mult and $5.
  mega_starmie: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.Xmult_multi, ex.money_mod, localize(ex.suit, 'suits_plural')] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.full_hand.length === 2 && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.money_mod;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          const earned = ease_poke_dollars(card, 'starmie', card.ability.extra.money_mod, true);
          return { xmult: card.ability.extra.Xmult_multi, dollars: earned, card };
        }
      }
      return undefined;
    },
  },
  // Mr Mime 122
  mrmime: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.hand && context.card_effects) {
        if (context.other_card === G.hand.cards[0] && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length > 0) || context.card_effects.length > 1)) {
          return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        }
      }
      return undefined;
    },
  },
  // Scyther 123
  scyther: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.e_foil);
        info_queue.push(P_CENTERS.e_holo);
        info_queue.push(P_CENTERS.e_polychrome);
        info_queue.push(P_CENTERS.c_poke_hardstone);
      }
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.ending_shop) {
        card.ability.extra.selected = false;
        juice_card_until(card, () => !card.ability.extra.selected, true);
      }
      if (context.setting_blind && !card.getting_sliced && !context.blueprint) {
        const my_pos = G.jokers.cards.indexOf(card);
        const sliced_card = my_pos >= 0 ? G.jokers.cards[my_pos + 1] : undefined;
        if (sliced_card && !card.getting_sliced && !sliced_card.ability.eternal && !sliced_card.getting_sliced) {
          sliced_card.getting_sliced = true;
          if (sliced_card.config.center.rarity !== 1 && sliced_card.config.center.rarity !== 2 && !card.edition) {
            const edition = poll_edition('wheel_of_fortune', null, true, true);
            card.set_edition(edition, true);
          }
          G.GAME.joker_buffer = G.GAME.joker_buffer - 1;
          G.E_MANAGER.add_event(() => {
            G.GAME.joker_buffer = 0;
            card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
            card.juice_up(0.8, 0.8);
            sliced_card.start_dissolve();
            play_sound('slice1');
          });
          // Intended-design fix (display): the Lua pops the pre-slice Mult; show the new total.
          card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult + card.ability.extra.mult_mod] }), colour: 'RED', no_juice: true });
        }
        card.ability.extra.selected = true;
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), mult_mod: card.ability.extra.mult };
      }
      let evo = type_evo(self, card, context, 'j_poke_scizor', 'metal');
      if (!evo) evo = item_evo(self, card, context, 'j_poke_kleavor');
      return evo;
    },
  },
  // Jynx 124
  jynx: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.h_size, G.GAME.starting_deck_size + center.ability.extra.deck_size] };
    },
    calculate(self, card, context) {
      if (context.playing_card_added && !card.getting_sliced && context.cards) {
        if (Array.isArray(context.cards) && context.cards.length > 0) {
          const cards_added = [];
          for (const v of context.cards) {
            if (v && typeof v === 'object') {
              // (3.9.1: the mark clears in an event, so every Jynx still sees it while the copies are announced)
              if (v.jynx) G.E_MANAGER.add_event(() => { v.jynx = undefined; });
              else {
                const copy = copy_card(v, null, null, G.playing_card);
                copy.add_to_deck();
                G.deck.config.card_limit = G.deck.config.card_limit + 1;
                G.playing_cards.push(copy);
                G.deck.emplace(copy);
                card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_copied_ex') });
                copy.jynx = true;
                cards_added.push(copy); // (3.9.1 fixed `cards_added[#cards_added]`: the copies are announced)
              }
            }
          }
          if (cards_added.length > 0) playing_card_joker_effects(cards_added);
        }
      }
      if (context.setting_blind) {
        if (((G.playing_cards && G.playing_cards.length) || 0) >= (G.GAME.starting_deck_size + card.ability.extra.deck_size)) {
          G.hand.change_size(card.ability.extra.h_size);
          G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + card.ability.extra.h_size;
          card.juice_up();
        }
      }
      return undefined;
    },
  },
  // Electabuzz 125
  electabuzz: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_linkcable);
      return { vars: [center.ability.extra.money_mod, center.ability.extra.percent, Math.min(center.ability.extra.max, Math.ceil(center.sell_cost * center.ability.extra.percent / 100)), center.ability.extra.max] };
    },
    calculate(self, card, context) {
      if (((context.selling_card && !context.selling_self) || (!context.repetition && !context.individual && context.end_of_round)) && !context.blueprint) {
        card.ability.extra_value = card.ability.extra_value + card.ability.extra.money_mod;
        card.set_cost();
        G.E_MANAGER.add_event(() => card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_val_up') }));
      }
      return item_evo(self, card, context, 'j_poke_electivire');
    },
    calc_dollar_bonus(self, card) {
      const earned = Math.min(card.ability.extra.max, Math.ceil(card.sell_cost * card.ability.extra.percent / 100));
      return ease_poke_dollars(card, 'electabuzz', earned, true);
    },
  },
  // Magmar 126
  magmar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_linkcable);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.discards_used === 0, true);
      }
      // 3.9.1: no once-per-round flag (the first discard is the one with discards_used 0)
      if (context.discard && !context.blueprint && G.GAME.current_round.discards_used === 0 && context.full_hand.length === 1) {
        card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        return { remove: true };
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return a_mult(card);
      return item_evo(self, card, context, 'j_poke_magmortar');
    },
  },
  // Pinsir 127
  pinsir: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); mega_tip(info_queue); return { vars: [center.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.full_hand && context.joker_main) {
        if (G.hand && G.hand.cards) {
          const found_ranks = {};
          for (const played_card of context.scoring_hand) found_ranks[played_card.get_id()] = true;
          for (const hand_card of G.hand.cards) if (found_ranks[hand_card.get_id()]) return a_xmult(card.ability.extra.Xmult);
        }
      }
      return undefined;
    },
  },
  // Mega Pinsir 127-1
  mega_pinsir: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && context.other_card.config.center === P_CENTERS.c_base) {
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
  },
  // Tauros 128
  tauros: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'tauros');
      return { vars: [center.ability.extra.Xmult_multi, num, dem] };
    },
    calculate(self, card, context) {
      // Lua compares `other_joker.label`; a Pokermon card's label is its name (ability.name here).
      const ol = context.other_joker && context.other_joker.ability && context.other_joker.ability.name;
      if (context.other_joker && context.other_joker.config && (ol === 'tauros' || ol === 'taurosh' || ol === 'miltank')) {
        G.E_MANAGER.add_event(() => context.other_joker.juice_up(0.5, 0.5));
        return a_xmult(card.ability.extra.Xmult_multi);
      }
      if (context.reroll_shop && !context.blueprint) {
        if (pseudorandom_probability(card, 'tauros', card.ability.extra.num, card.ability.extra.dem, 'tauros')) {
          const add = smods_create_card({ set: 'Joker', area: G.shop_jokers, key: 'j_poke_taurosh' });
          poke_add_shop_card(add, card);
        }
      }
      return undefined;
    },
  },
  // Tauros-Herd 128-1
  taurosh: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return a_mult(card);
      return undefined;
    },
  },
  // Magikarp 129
  magikarp: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Joker', key: 'j_splash', config: {} });
      return { vars: [center.ability.extra.rounds, center.ability.extra.chips] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      return level_evo(self, card, context, 'j_poke_gyarados');
    },
  },
  // Gyarados 130
  gyarados: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); mega_tip(info_queue); return { vars: [center.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return a_xmult(card.ability.extra.Xmult);
      return undefined;
    },
  },
  // Mega Gyarados 130-1
  mega_gyarados: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return a_xmult(card.ability.extra.Xmult);
      if (context.setting_blind && !card.getting_sliced) {
        if (!context.blueprint && context.blind.boss && !card.getting_sliced) {
          G.E_MANAGER.add_event(() => {
            G.E_MANAGER.add_event(() => {
              G.GAME.blind.disable();
              play_sound('timpani');
            });
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
          });
        }
      }
      return undefined;
    },
    add_to_deck(self, card) {
      if (G.GAME.blind && G.GAME.blind.boss && !G.GAME.blind.disabled) {
        G.GAME.blind.disable();
        play_sound('timpani');
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
      }
    },
  },
  // Lapras 131
  lapras: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      if (context.skip_blind && !context.blueprint && !G.GAME.lapras_skip) {
        G.GAME.lapras_skip = true;
        G.E_MANAGER.add_event(() => {
          // (G.blind_select / G.blind_prompt_box are UI boxes — the renderer follows G.STATE.)
          G.GAME.current_round.jokers_purchased = 0;
          G.STATE = STATES.SHOP;
          G.GAME.shop_free = null;
          G.GAME.shop_d6ed = null;
          G.STATE_COMPLETE = false;
          G.GAME.current_round.used_packs = {};
          G.GAME.current_round.reroll_cost_increase = 0;
          // 3.9.1: the shop's free rerolls reset too (round_resets.free_rerolls; + Chaos the Clown, like run.js)
          G.GAME.current_round.free_rerolls = find_joker('Chaos the Clown').length + (G.GAME.round_resets.free_rerolls || 0);
          calculate_reroll_cost(true);
        });
      }
      if (context.ending_shop && !context.blueprint) G.GAME.lapras_skip = undefined;
      return undefined;
    },
    update(self, card) { card.ability.extra.chips = (G.GAME.skips || 0) * card.ability.extra.chip_mod; },
  },
  // Ditto 132
  ditto: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'availability', vars: ['you have a Perishable Joker'] });
        if (!center.ability.perishable) info_queue.push({ key: 'perishable', set: 'Other', vars: [G.GAME.perishable_rounds || 1, G.GAME.perishable_rounds] });
        info_queue.push({ set: 'Other', key: 'poke_volatile_' + center.ability.extra.volatile });
      }
      return undefined;
    },
    calculate(self, card, context) { // mostly copied from how invisible joker works
      if (context.ending_shop && !context.blueprint && volatile_active(self, card, card.ability.extra.volatile)) {
        const jokers = [];
        for (const j of G.jokers.cards) if (j !== card && j.ability.name !== 'ditto') jokers.push(j);
        if (jokers.length > 0) {
          const chosen_joker_key = jokers[0].config.center.key;
          card.ability.perishable = true;
          card.ability.perish_tally = G.GAME.perishable_rounds;
          apply_type_sticker(card, 'Colorless');
          return { message: poke_evolve(card, chosen_joker_key, null, localize('poke_transform_success'), true) };
        }
        card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_no_other_jokers') });
      }
      return undefined;
    },
    in_pool(self) {
      if (find_joker('Showman').length > 0) return true; // (3.9.1 SMODS.showman)
      if (G.jokers && G.jokers.cards && G.jokers.cards.length > 0) {
        for (const v of G.jokers.cards) if (v.ability.perishable) return false;
      }
      return true;
    },
  },
  // Eevee 133
  eevee: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'eeveelution' });
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.mult_mod * eevee_can_evolve()] };
    },
    calculate(self, card, context) {
      // 3.9.1: +mult_mod Mult for each Joker you have that can evolve (itself included)
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const can_evolve = eevee_can_evolve();
        if (can_evolve > 0) {
          const m = card.ability.extra.mult_mod * can_evolve;
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [m] }), colour: 'MULT', mult_mod: m };
        }
      }
      return item_evo(self, card, context, undefined);
    },
  },
  // Vaporeon 134
  vaporeon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_bonus);
      return { vars: [center.ability.extra.chip_mod] };
    },
    calculate(self, card, context) {
      // 3.9.1: when a Bonus card scores, every card in the poker hand permanently gains +chip_mod Chips
      if (context.individual && context.cardarea === G.play && has_enhancement(context.other_card, 'm_bonus')) {
        for (const scoring_card of context.scoring_hand) {
          scoring_card.ability.perma_bonus = (scoring_card.ability.perma_bonus || 0) + card.ability.extra.chip_mod;
          card_eval_status_text(scoring_card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        }
      }
      return undefined;
    },
  },
  // Jolteon 135
  jolteon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_gold);
      return { vars: [center.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.discard && has_enhancement(context.other_card, 'm_gold')) {
        if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED' }; // (3.9.1)
        const earned = ease_poke_dollars(card, 'jolteon', card.ability.extra.money, true);
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + earned;
        return {
          dollars: earned,
          func() { // This is for timing purposes, it runs after the dollar manipulation
            G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          },
        };
      }
      return undefined;
    },
  },
  // Flareon 136
  flareon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_mult);
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      // 3.9.1: the last 2 scoring Mult cards give XMult when scored (was: the first Mult card held)
      if (context.individual && context.cardarea === G.play && !context.end_of_round) {
        const mult_cards = context.scoring_hand.filter((c) => has_enhancement(c, 'm_mult'));
        const last_mult = mult_cards[mult_cards.length - 1];
        const second_to_last_mult = mult_cards.length > 1 ? mult_cards[mult_cards.length - 2] : undefined;
        if (context.other_card === last_mult || context.other_card === second_to_last_mult) return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
  },
  // Porygon 137
  porygon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_upgrade);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.open_booster && room()) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          const _card = create_card('Energy', G.consumeables, null, null, null, null, null, 'pory');
          _card.add_to_deck();
          G.consumeables.emplace(_card);
          G.GAME.consumeable_buffer = 0;
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_plus_energy'), colour: 'pink' });
      }
      return item_evo(self, card, context, 'j_poke_porygon2');
    },
    add_to_deck() { G.GAME.energy_plus = G.GAME.energy_plus === undefined ? 1 : G.GAME.energy_plus + 1; },
    remove_from_deck() { G.GAME.energy_plus = G.GAME.energy_plus === undefined ? 0 : G.GAME.energy_plus - 1; },
  },
  // Omanyte 138
  omanyte: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      ancient_tip(info_queue, card.ability.extra.rank);
      const third_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.third_times);
      return { vars: [localize(card.ability.extra.rank, 'ranks'), card.ability.extra.money, third_left] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const threes = count_id(context.scoring_hand, 3);
        const first_level = threes > 0, second_level = threes > 1, third_level = threes > 2;
        if (first_level) fossil_create('Tarot', 'k_plus_tarot', 'PURPLE');
        if (third_level) {
          card.ability.extra.third_times = card.ability.extra.third_times + 1;
          fossil_create('Item', 'poke_plus_pokeitem', 'item');
        }
        if (second_level) {
          const earned = ease_poke_dollars(card, 'omanyte', card.ability.extra.money, true);
          return { dollars: earned, card };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_omastar', card.ability.extra.third_times, self.config.evo_rqmt);
    },
  },
  // Omastar 139
  omastar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      ancient_tip(info_queue, center.ability.extra.rank);
      info_queue.push({ set: 'Other', key: 'omastar_tag_pool', vars: ['Handy', 'Garbage', 'Investment', 'Economy', 'D6'] });
      return { vars: [localize(center.ability.extra.rank, 'ranks'), center.ability.extra.money, !center.ability.extra.tag_created ? '(' + localize('k_active_ex') + ')' : ''] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const threes = count_id(context.scoring_hand, 3);
        const first_level = threes > 0, second_level = threes > 1, third_level = threes > 2, fourth_level = threes > 3;
        if (first_level) fossil_create('Tarot', 'k_plus_tarot', 'PURPLE');
        if (third_level) fossil_create('Item', 'poke_plus_pokeitem', 'item');
        if (fourth_level && !card.ability.extra.tag_created) {
          card.ability.extra.tag_created = true;
          let tag;
          const tag_choice = pseudorandom('sylveon');
          if (tag_choice < 1 / 5) tag = 'tag_handy';
          else if (tag_choice < 2 / 5) tag = 'tag_garbage';
          else if (tag_choice < 3 / 5) tag = 'tag_investment';
          else if (tag_choice < 4 / 5) tag = 'tag_economy';
          else tag = 'tag_d_six';
          G.E_MANAGER.add_event(() => {
            add_tag(new Tag(tag));
            play_sound('generic1');
            play_sound('holo1');
          });
        }
        if (second_level) {
          const earned = ease_poke_dollars(card, 'omastar', card.ability.extra.money, true);
          return { dollars: earned, card };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) card.ability.extra.tag_created = undefined;
      return undefined;
    },
  },
  // Kabuto 140
  kabuto: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      ancient_tip(info_queue, card.ability.extra.rank);
      const third_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.third_times);
      return { vars: [localize(card.ability.extra.rank, 'ranks'), card.ability.extra.chips1, card.ability.extra.chips2, card.ability.extra.chips3, third_left] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) kabuto_before(card, context, false);
        if (context.joker_main) {
          let chips = 0;
          if (card.ability.extra.first_level) chips = chips + card.ability.extra.chips1;
          if (card.ability.extra.third_level) {
            card.ability.extra.third_times = card.ability.extra.third_times + 1;
            chips = chips + card.ability.extra.chips3;
          }
          if (chips > 0) return { message: localize({ type: 'variable', key: 'a_chips', vars: [chips] }), colour: 'CHIPS', chip_mod: chips };
        }
      }
      const r = kabuto_perma(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_kabutops', card.ability.extra.third_times, self.config.evo_rqmt);
    },
  },
  // Kabutops 141
  kabutops: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      ancient_tip(info_queue, center.ability.extra.rank);
      const ex = center.ability.extra;
      return { vars: [localize(ex.rank, 'ranks'), ex.chips1, ex.chips2, ex.chips3, ex.retriggers] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) kabuto_before(card, context, true);
        if (context.joker_main) {
          let chips = 0;
          if (card.ability.extra.first_level) chips = chips + card.ability.extra.chips1;
          if (card.ability.extra.third_level) chips = chips + card.ability.extra.chips3;
          if (chips > 0) return { message: localize({ type: 'variable', key: 'a_chips', vars: [chips] }), colour: 'CHIPS', chip_mod: chips };
        }
      }
      const r = kabuto_perma(card, context);
      if (r) return r;
      if (context.repetition && context.cardarea === G.play && card.ability.extra.fourth_level) {
        if (context.other_card.get_id() === 2) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Aerodactyl 142
  aerodactyl: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      ancient_tip(info_queue, center.ability.extra.rank);
      if (detailed()) { info_queue.push({ set: 'Other', key: 'mega_poke' }); info_queue.push(P_CENTERS.m_glass); }
      return { vars: [localize(center.ability.extra.rank, 'ranks'), center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.before) {
        const aces = count_id(context.scoring_hand, 14);
        const third_level = aces > 2;
        if (third_level && !context.blueprint) {
          let target;
          for (const v of context.scoring_hand) if (v.get_id() === 14 && v.config.center === P_CENTERS.c_base) { target = v; break; }
          if (target) poke_convert_cards_to(target, { mod_conv: 'm_glass' }, true, true);
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const aces = count_id(context.scoring_hand, 14);
        const first_level = aces > 0, second_level = aces > 1, fourth_level = aces > 3;
        if (second_level && !context.blueprint) card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        if (fourth_level && !context.blueprint) card.ability.extra.Xmult = card.ability.extra.Xmult * 2;
        if (first_level) return a_xmult(card.ability.extra.Xmult);
      }
      if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult1; // (3.9.1: back to the base, was the round-start value)
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
  // Mega Aerodactyl 142-1
  mega_aerodactyl: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'mega_aerodactyl');
      return { vars: [localize(center.ability.extra.rank, 'ranks'), center.ability.extra.Xmult_multi, num, dem] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && context.other_card.get_id() === 14) {
        return { x_mult: card.ability.extra.Xmult_multi * card.ability.extra.aces, card };
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) card.ability.extra.aces = count_id(context.scoring_hand, 14);
        if (context.after) card.ability.extra.aces = 0;
      }
      if (context.destroying_card && pseudorandom_probability(card, 'mega_aerodactyl', card.ability.extra.num, card.ability.extra.dem, 'mega_aerodactyl')) {
        return !context.blueprint && context.destroying_card.get_id() === 14;
      }
      return undefined;
    },
  },
  // Snorlax 143
  snorlax: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Leftovers'] });
        info_queue.push(P_CENTERS.c_poke_leftovers);
      }
      return { vars: [center.ability.extra.Xmult_mod, center.ability.extra.Xmult] };
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff && room()) {
        const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_leftovers');
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'FILTER' });
      }
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult > 1) return a_xmult(card.ability.extra.Xmult);
      } else if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        const count = find_card('c_poke_leftovers');
        if (count.length > 0) {
          card.ability.extra.Xmult = card.ability.extra.Xmult + (card.ability.extra.Xmult_mod * count.length);
          return { message: localize('k_upgrade_ex'), colour: 'RED' };
        }
      }
      return undefined;
    },
  },
  // Articuno 144
  articuno: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); info_queue.push(P_CENTERS.e_foil); return undefined; },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint && context.scoring_hand) {
        const target = context.scoring_hand[0];
        poke_convert_cards_to(target, { edition: 'e_foil', seal: poll_seal_guaranteed() }, true, true);
      }
      return undefined;
    },
  },
  // Zapdos 145
  zapdos: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.Xmult, ex.money_threshold, 1 + ex.Xmult * Math.floor((G.GAME.dollars + (G.GAME.dollar_buffer || 0)) / ex.money_threshold)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const Xmult = 1 + card.ability.extra.Xmult * Math.floor((G.GAME.dollars + (G.GAME.dollar_buffer || 0)) / card.ability.extra.money_threshold);
        if (Xmult > 1) return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'MULT', Xmult_mod: Xmult };
      }
      return undefined;
    },
  },
  // Moltres 146
  moltres: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return undefined; },
    calculate(self, card, context) {
      if (context.pre_discard && G.GAME.current_round.discards_used <= 0 && !context.hook) {
        const { text } = get_poker_hand_info(G.hand.highlighted);
        card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize(text, 'poker_hands'), chips: G.GAME.hands[text].chips, mult: G.GAME.hands[text].mult, level: G.GAME.hands[text].level });
        level_up_hand(context.blueprint_card || card, text, null, 3);
        update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
      }
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.discards_used <= 0, true);
      }
      return undefined;
    },
  },
  // Dratini 147
  dratini: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.size, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      return dratini_calc(card, context) || scaling_evo(self, card, context, 'j_poke_dragonair', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Dragonair 148
  dragonair: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.size, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      return dratini_calc(card, context) || scaling_evo(self, card, context, 'j_poke_dragonite', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Dragonite 149
  dragonite: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); mega_tip(info_queue); return { vars: [center.ability.extra.mult, center.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return a_mult(card);
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.full_hand && context.full_hand.length === 1) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Mega Dragonite 149-1 (3.9.1, batch 16): +55 Mult; a 1-card final hand is retriggered once per card held in hand.
  mega_dragonite: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { mult: card.ability.extra.mult };
      if (context.repetition && context.cardarea === G.play && context.full_hand.length === 1 && G.GAME.current_round.hands_left === 0) {
        return { repetitions: G.hand.cards.length };
      }
      return undefined;
    },
  },
  // Mewtwo 150
  mewtwo: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'energize' });
        if (!center.edition || (center.edition && !center.edition.polychrome)) info_queue.push(P_CENTERS.e_polychrome);
        if (any(find_card('c_poke_megastone'))) info_queue.push({ set: 'Other', key: 'split_mega', vars: ['Mega Mewtwo X', 'Mega Mewtwo Y'] });
        info_queue.push({ set: 'Other', key: 'mega_poke' });
      }
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if ((context.end_of_round && G.GAME.blind.boss) && !context.repetition && !context.individual && !context.blueprint) {
        const leftmost = G.jokers.cards[0];
        if (leftmost !== card && !leftmost.getting_sliced) {
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_duplicated_ex') });
          const chosen_joker = G.jokers.cards[0];
          if ((G.jokers.cards.length - 1 < G.jokers.config.card_limit && !leftmost.ability.eternal) || (G.jokers.cards.length < G.jokers.config.card_limit && leftmost.ability.eternal)) {
            G.E_MANAGER.add_event(() => {
              const _card = copy_card(chosen_joker, null, null, null, chosen_joker.edition && chosen_joker.edition.negative);
              _card.set_edition({ polychrome: true }, true);
              _card.ability.card_limit = 0;
              if (_card.config && _card.config.center.stage && _card.config.center.stage !== 'Other' && !type_sticker_applied(_card)) {
                energy_increase(_card, _card.ability.extra.ptype);
              } else if (type_sticker_applied(_card)) {
                energy_increase(_card, type_sticker_applied(_card));
              }
              _card.add_to_deck();
              G.jokers.emplace(_card);
              if (_card.debuff) {
                _card.debuff = false;
                if (_card.ability.perishable) _card.ability.perish_tally = G.GAME.perishable_rounds;
              }
            });
          }
          // Lua: `Event({ remove(...) })` calls remove() right away (it queues its own removal event).
          if (!leftmost.ability.eternal) remove(self, G.jokers.cards[0], context);
        }
      }
      if (context.other_joker && context.other_joker.edition && context.other_joker.edition.polychrome) {
        G.E_MANAGER.add_event(() => context.other_joker.juice_up(0.5, 0.5));
        return a_xmult(card.ability.extra.Xmult_multi);
      }
      return undefined;
    },
    getMega(self, card) {
      // Leftmost = X, Rightmost = Y, Middle = Random
      let mega;
      for (let k = 0; k < G.jokers.cards.length; k++) {
        const v = G.jokers.cards[k];
        if (card === v && k === 0) { mega = self.megas[0]; break; }
        else if (card === v && k === G.jokers.cards.length - 1) mega = self.megas[1];
      }
      if (!mega) mega = pseudorandom_element(self.megas, pseudoseed('megastone_charizard'))[0];
      return mega;
    },
  },
  // Mega Mewtwo X 150-1
  mega_mewtwo_x: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      if (context.other_joker) return a_xmult(card.ability.extra.Xmult_multi);
      return undefined;
    },
  },
  // Mega Mewtwo Y 150-2
  mega_mewtwo_y: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'energize' });
      return { vars: [center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.ending_shop && !context.blueprint) {
        const leftmost = G.jokers.cards[0];
        if (leftmost !== card) {
          const _card = G.jokers.cards[0];
          if (_card.config && _card.config.center.stage && _card.config.center.stage !== 'Other' && !type_sticker_applied(_card)) {
            for (let i = 1; i <= 2; i++) energy_increase(_card, _card.ability.extra.ptype);
          } else if (type_sticker_applied(_card)) {
            for (let i = 1; i <= 2; i++) energy_increase(_card, type_sticker_applied(_card));
          }
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition && G.GAME.blind.boss) {
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_future_sight'), colour: 'psychic' });
        G.GAME.energy_plus = G.GAME.energy_plus === undefined ? 1 : G.GAME.energy_plus + 1;
      }
      return undefined;
    },
  },
}, FILE);

// Tauros (Herd) (3.9.1 in_pool = false): never in a pool; Tauros puts it in the shop itself.
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_taurosh' ? false : undefined));
