// Pokermon 3.9.1 — pokemon/pokejokers_16.lua (Pokédex 451-480: Mantyke -> the Rotom forms), 24 jokers + 1 new in 3.9.1
// (Gallade, Kirlia's Dawn Stone evolution: at the end, new-jokers sub-batch 14; static data: data391.js new_jokers).
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, enhancement_gate) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
// Also elsewhere: Rotom's Booster discount (systems/rules.js set_cost), Probopass's Stone = face
// (rules.js is_face), Tangrowth's Wild-card debuff protection (rules.js set_debuff); the Rotom
// forms are swapped by the machine items (consumables/zmachine).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, ease_dollars,
  create_card, copy_card, poll_edition, juice_card_until, play_sound, math_random, all_cards,
  defineJokers, type_tooltip, detailed, level_evo, faint_baby_poke, find_pokemon_type, is_type, has_enhancement,
  ease_poke_dollars, get_probability_vars, pseudorandom_probability, poke_add_shop_card, poke_convert_cards_to,
  poke_vary_rank, juice_flip_table, add_card, POKE_POOL_RULES, get_total_energy, create_consumeable, energy_max,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { P_TAGS } from '../../../js/engine/core.js';
import { activeConsumableTypes, centerActive } from '../../../js/mods/registry.js';

const FILE = 'pokemon/pokejokers_16.lua';

const end_of_round = (context) => context.end_of_round && !context.individual && !context.repetition;
const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;
/** Gallade: Jokers with e_level+ Energy (3.9.1 pokermon.energy.get_total_energy). */
const gallade_energized = (e_level) => (G.jokers ? G.jokers.cards.filter((v) => get_total_energy(v) >= e_level).length : 0);
/** $ paid during scoring (Pokermon 3.9.1): G.GAME.dollar_buffer holds it until the event queue runs. */
function buffered_dollars(card, seed, amount) {
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + amount;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return ease_poke_dollars(card, seed, amount, true);
}

/** Every Rotom form: 1 in 2 chance to create an Item when a Booster Pack is opened (must have room). */
function rotom_item(card, context) {
  if (context.open_booster && room()) {
    if (pseudorandom_probability(card, 'rotom', card.ability.extra.num, card.ability.extra.dem, 'rotom')) {
      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
      G.E_MANAGER.add_event(() => {
        const _card = create_card('Item', G.consumeables, null, null, null, null, null, 'rotom');
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        G.GAME.consumeable_buffer = 0;
      });
      // Display fix: the Lua pops "+1 Tarot" for the Item it makes.
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'item' });
    }
  }
}
function rotom_vars(self, info_queue, center) {
  type_tooltip(self, info_queue, center);
  const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'rotom');
  return { vars: [num, dem] };
}
/** Rotom: re-price every card (its Booster discount lives in the set_cost hook). */
const reprice = () => G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); });
/** SMODS.ConsumableTypes (vanilla Tarot / Planet / Spectral + the active mods' types), by key. */
function consumable_types() {
  const out = { Tarot: { key: 'Tarot' }, Planet: { key: 'Planet' }, Spectral: { key: 'Spectral' } };
  for (const t of activeConsumableTypes()) out[t.key] = t;
  return out;
}
/**
 * Effects in a played card's `individual` context: Steamodded reads chip_mod / Xmult_mod there
 * too; Micatro's per-card pass reads chips / x_mult (Togekiss returns the joker_main keys).
 */
function as_individual(ret) {
  if (!ret) return ret;
  const out = { card: ret.card };
  for (const r of [ret, ret.extra]) {
    if (!r) continue;
    if (r.chip_mod) out.chips = (out.chips || 0) + r.chip_mod;
    if (r.Xmult_mod) out.x_mult = (out.x_mult || 1) * r.Xmult_mod;
  }
  return out;
}

defineJokers({
  // Mantyke 458
  mantyke: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
        info_queue.push(P_CENTERS.c_devil);
      }
      return { vars: [center.ability.extra.chips, center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          faint_baby_poke(self, card, context);
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_minus] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
        }
      }
      if (end_of_round(context) && !card.debuff) {
        const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_devil');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
      return level_evo(self, card, context, 'j_poke_mantine');
    },
  },
  // Weavile 461
  weavile: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const sc = G.GAME && G.GAME.current_round && G.GAME.current_round.sneaselcard;
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult, localize((sc && sc.rank) || 'Ace', 'ranks'), card.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.final_scoring_step && context.full_hand.length === 1 && context.full_hand[0].get_id() === G.GAME.current_round.sneaselcard.id && !context.blueprint) {
        context.full_hand[0].to_be_removed_by = card;
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        ease_poke_dollars(card, 'weavile', card.ability.extra.money);
        card.juice_up();
      }
      if (context.destroy_card && context.destroy_card.to_be_removed_by === card && !context.blueprint) {
        context.destroy_card.to_be_removed_by = undefined;
        return { remove: true };
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult !== 1) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      if (end_of_round(context) && !context.blueprint) {
        if (G.GAME.blind.boss && card.ability.extra.Xmult > 1) {
          card.ability.extra.Xmult = card.ability.extra.Xmult2;
          return { message: localize('k_reset'), colour: 'RED' };
        }
      }
      return undefined;
    },
  },
  // Magnezone 462
  magnezone: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_steel);
      const total = find_pokemon_type('Metal').length;
      return { vars: [center.ability.extra.Xmult_multi, center.ability.extra.Xmult_multi2, center.ability.extra.Xmult_multi + (total * center.ability.extra.Xmult_multi2)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.play && context.individual && !context.other_card.debuff && !context.end_of_round && has_enhancement(context.other_card, 'm_steel')) {
        const total = find_pokemon_type('Metal').length;
        return { x_mult: card.ability.extra.Xmult_multi + (total * card.ability.extra.Xmult_multi2), card };
      }
      return undefined;
    },
  },
  // Lickilicky 463
  lickilicky: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_multi, center.ability.extra.Xmult_multi - center.ability.extra.subtract] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff) {
        let first_jack = null, second_jack = null;
        for (let i = 0; i < context.scoring_hand.length; i++) {
          if (context.scoring_hand[i].get_id() === 11) {
            if (!first_jack) first_jack = context.scoring_hand[i];
            else { second_jack = context.scoring_hand[i]; break; }
          }
        }
        if (context.other_card === first_jack || context.other_card === second_jack) {
          return { x_mult: card.ability.extra.Xmult_multi, colour: 'RED', card };
        } else if (context.other_card.get_id() === 11) {
          return { x_mult: card.ability.extra.Xmult_multi - card.ability.extra.subtract, colour: 'RED', card };
        }
      }
      return undefined;
    },
  },
  // Rhyperior 464
  rhyperior: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_stone);
      return { vars: [center.ability.extra.chips, 1 + Math.floor(find_pokemon_type('Earth').length / 3)] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && !context.end_of_round && has_enhancement(context.other_card, 'm_stone')) {
        context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus || 0;
        context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus + card.ability.extra.chips;
        return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && has_enhancement(context.other_card, 'm_stone')) {
        const rhytriggers = 1 + Math.floor(find_pokemon_type('Earth').length / 3);
        return { message: localize('k_again_ex'), repetitions: rhytriggers, card };
      }
      return undefined;
    },
  },
  // Tangrowth 465
  tangrowth: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_wild);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'tangrowth');
      return { vars: [center.ability.extra.mult, center.ability.extra.chips, center.ability.extra.money_mod, num, dem] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && !context.end_of_round && has_enhancement(context.other_card, 'm_wild')) {
        if (pseudorandom_probability(card, 'tangrowth', card.ability.extra.num, card.ability.extra.dem, 'tangrowth')) {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.money_mod;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return {
            message: localize('poke_tangela_bonus'), colour: 'BLACK',
            mult: card.ability.extra.mult, chips: card.ability.extra.chips,
            dollars: ease_poke_dollars(card, 'tangrowth', card.ability.extra.money_mod, true),
            card,
          };
        }
        const bonus = pseudorandom_element(['Mult', 'Chips', 'Money'], pseudoseed('tangela'))[0];
        if (bonus === 'Mult') return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult: card.ability.extra.mult };
        if (bonus === 'Chips') return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chips: card.ability.extra.chips };
        if (bonus === 'Money') {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.money_mod;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return { dollars: ease_poke_dollars(card, 'tangrowth', card.ability.extra.money_mod, true), card };
        }
      }
      return undefined;
    },
  },
  // Electivire 466
  electivire: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_linkcable);
      return { vars: [center.ability.extra.money_mod, center.ability.extra.Xmult_mod, 1 + center.ability.extra.Xmult_mod * center.sell_cost] };
    },
    calculate(self, card, context) {
      if ((context.selling_card || (!context.repetition && !context.individual && context.end_of_round)) && !context.blueprint) {
        card.ability.extra_value = (card.ability.extra_value || 0) + card.ability.extra.money_mod;
        card.set_cost();
        G.E_MANAGER.add_event(() => { card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_val_up') }); });
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [1 + card.ability.extra.Xmult_mod * card.sell_cost] }), colour: 'MULT', Xmult_mod: 1 + card.ability.extra.Xmult_mod * card.sell_cost };
        }
      }
      return undefined;
    },
  },
  // Magmortar 467
  magmortar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      // Pokermon 3.9.1: Blueprint-compatible (it copies the score); no remove_triggered flag; scores only once it has gained.
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.discards_used === 0 && !G.RESET_JIGGLES, true);
      }
      if (context.pre_discard && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
      }
      if (context.discard && !context.blueprint && G.GAME.current_round.discards_used === 0 && context.full_hand.length === 1) {
        card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
        return { remove: true };
      }
      if (context.joker_main && (card.ability.extra.mult > 0 || card.ability.extra.Xmult > 1)) {
        return { message: localize('poke_fire_blast_ex'), colour: 'XMULT', mult_mod: card.ability.extra.mult, Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
  // Togekiss 468
  togekiss: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [num, chip_dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.chip_dem, 'togekiss');
      const [, Xmult_dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.Xmult_dem, 'togekiss');
      return { vars: [num, chip_dem, Xmult_dem, card.ability.extra.chips, card.ability.extra.Xmult_multi, card.ability.extra.plus_odds] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card && context.other_card.ability.effect === 'Lucky Card') {
        let ret;
        if (pseudorandom_probability(card, 'togekiss', card.ability.extra.num, card.ability.extra.chip_dem, 'togekiss')) {
          ret = { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
        }
        if (pseudorandom_probability(card, 'togekiss', card.ability.extra.num, card.ability.extra.Xmult_dem, 'togekiss')) {
          const temp = { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_multi] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
          if (ret) ret.extra = temp;
          else ret = temp;
        }
        return as_individual(ret);
      }
      // +1 to every listed probability's numerator (SMODS.get_probability_vars).
      if (context.mod_probability && !context.blueprint) return { numerator: context.numerator + card.ability.extra.plus_odds };
      return undefined;
    },
  },
  // Yanmega 469
  yanmega: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'yanmega');
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.chip_mod, num, dem] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play) {
        if (context.other_card.get_id() === 3 || context.other_card.get_id() === 6) {
          // (Pokermon 3.9.1 renamed mult / chips to mult_mod / chip_mod)
          return { mult: card.ability.extra.mult_mod, chips: card.ability.extra.chip_mod, card };
        }
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play) {
        if (context.other_card.get_id() === 3 || context.other_card.get_id() === 6) {
          if (pseudorandom_probability(card, 'yanmega', card.ability.extra.num, card.ability.extra.dem, 'yanmega')) {
            return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
          }
        }
      }
      return undefined;
    },
  },
  // Leafeon 470
  leafeon: {
    // Pokermon 3.9.1 (Eevee line rework): no hand size; triples every listed probability's numerator once a Lucky card
    // has successfully triggered this round (G.GAME.poke_lucky_triggers, counted by the mod calculate: systems/rules.js).
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_lucky);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.mod_probability && G.GAME.poke_lucky_triggers && G.GAME.poke_lucky_triggers > 0 && !context.blueprint) {
        return { numerator: context.numerator * 3 };
      }
      return undefined;
    },
  },
  // Glaceon 471
  glaceon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_glass);
      return { vars: [] };
    },
    // Pokermon 3.9.1 (Eevee line rework): retrigger every played Glass card (no more Glass copies in the shop).
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && has_enhancement(context.other_card, 'm_glass')) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Gliscor 472
  gliscor: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const suit = (G.GAME && G.GAME.current_round && G.GAME.current_round.gligar_suit) || 'Clubs';
      let played_Xmult = 1;
      if (G.hand) {
        let suit_count = 0;
        for (const c of G.hand.cards) if ((c.is_suit(suit) || c.debuff) && !G.hand.highlighted.includes(c)) suit_count = suit_count + 1;
        played_Xmult = 1 + (card.ability.extra.Xmult_multi * suit_count);
      }
      return { vars: [card.ability.extra.Xmult_multi, localize(suit, 'suits_singular'), played_Xmult], colours: ['SUITS.' + suit] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
        let suit_count = 0;
        for (const c of G.hand.cards) if (c.is_suit(G.GAME.current_round.gligar_suit) || c.debuff) suit_count = suit_count + 1;
        if (suit_count > 0) return { x_mult: 1 + (card.ability.extra.Xmult_multi * suit_count), card };
      }
      return undefined;
    },
  },
  // Mamoswine 473
  mamoswine: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'mamoswine');
      return { vars: [center.ability.extra.mult, center.ability.extra.money, num, dem] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && context.scoring_hand) {
        const stone_or_glass = (v) => has_enhancement(v, 'm_stone') || has_enhancement(v, 'm_glass');
        let earn = false;
        if (stone_or_glass(context.other_card)) {
          if (pseudorandom_probability(card, 'mamoswine', card.ability.extra.num, card.ability.extra.dem, 'mamoswine')) earn = true;
        }
        if (context.other_card === context.scoring_hand[0]) {
          let stoneglass = 0;
          for (const v of context.scoring_hand) if (stone_or_glass(v)) stoneglass = stoneglass + 1;
          if (stoneglass > 0) {
            if (earn) return { mult: card.ability.extra.mult * stoneglass, dollars: buffered_dollars(card, '2mamoswine', card.ability.extra.money), card };
            return { mult: card.ability.extra.mult * stoneglass, card };
          }
        } else if (earn) {
          return { dollars: buffered_dollars(card, '2mamoswine', card.ability.extra.money), card };
        }
      }
      return undefined;
    },
  },
  // Porygon-Z 474
  porygonz: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [1 + ((G.GAME.energies_used || 0) * center.ability.extra.Xmult_mod), center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const Xmult = 1 + ((G.GAME.energies_used || 0) * card.ability.extra.Xmult_mod);
          if (Xmult > 1) return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'XMULT', Xmult_mod: Xmult };
        }
      }
      if (context.using_consumeable && context.consumeable.ability.set === 'Energy' && room()) {
        // Pokermon 3.9.1: the Bird Energy roll is 1 in 256, and its key is then unused (Lua: SMODS.add_card{set =
        // 'poke_energy'}), so a random Energy is always made; the roll still draws from 'porygonz'.
        pseudorandom('porygonz');
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          add_card({ set: 'Energy' });
          G.GAME.consumeable_buffer = 0;
        });
        card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('poke_plus_energy'), colour: 'pink' });
      }
      return undefined;
    },
    add_to_deck() {
      if (!G.GAME.energy_plus) G.GAME.energy_plus = 3;
      else G.GAME.energy_plus = G.GAME.energy_plus + 3;
    },
    remove_from_deck() {
      if (!G.GAME.energy_plus) G.GAME.energy_plus = 0;
      else G.GAME.energy_plus = G.GAME.energy_plus - 3;
    },
  },
  // Probopass 476
  probopass: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && has_enhancement(context.other_card, 'm_stone')) {
        return { x_mult: card.ability.extra.Xmult_multi, colour: 'XMULT', card };
      }
      return undefined;
    },
  },
  // Dusknoir 477
  dusknoir: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_left === 0) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
    add_to_deck(self, card) { G.GAME.spectral_rate = G.GAME.spectral_rate + card.ability.extra.spec_up; },
    remove_from_deck(self, card) { G.GAME.spectral_rate = Math.max(0, G.GAME.spectral_rate - card.ability.extra.spec_up); },
  },
  // Froslass 478
  froslass: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.debt] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const in_debt = G.GAME.dollars < 0;
          if (in_debt && room()) {
            const _card = create_card('Item', G.consumeables, null, null, null, null, null);
            _card.add_to_deck();
            G.consumeables.emplace(_card);
          }
        }
      }
      return undefined;
    },
    add_to_deck(self, card) { G.GAME.bankrupt_at = G.GAME.bankrupt_at - card.ability.extra.debt; },
    remove_from_deck(self, card) { G.GAME.bankrupt_at = G.GAME.bankrupt_at + card.ability.extra.debt; },
  },
  // Rotom 479
  rotom: {
    loc_vars: rotom_vars,
    calculate(self, card, context) { rotom_item(card, context); return undefined; },
    add_to_deck() { reprice(); },
    remove_from_deck() { reprice(); },
  },
  rotomh: {
    loc_vars: rotom_vars,
    calculate(self, card, context) {
      if (context.pre_discard && context.full_hand && context.full_hand.length === 2 && G.GAME.current_round.discards_used === 0 && !context.hook && !context.blueprint) {
        const target = [context.full_hand[0], context.full_hand[1]];
        poke_convert_cards_to(target, { mod_conv: 'm_mult' });
      }
      rotom_item(card, context);
      return undefined;
    },
  },
  rotomw: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'rotom');
      return { vars: [num, dem, center.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.before && !context.blueprint) {
        const enhanced = [];
        for (const v of context.scoring_hand) {
          if (v.config.center !== P_CENTERS.c_base && !v.debuff && !v.vampired) {
            enhanced.push(v);
            v.vampired = true;
            v.set_ability(P_CENTERS.c_base, null, true);
            G.E_MANAGER.add_event(() => { v.juice_up(); v.vampired = undefined; });
          }
        }
        if (enhanced.length > 0) ease_poke_dollars(card, 'rotomw', card.ability.extra.money * enhanced.length);
      }
      rotom_item(card, context);
      return undefined;
    },
  },
  rotomf: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        if (!center.edition || !center.edition.polychrome) info_queue.push(P_CENTERS.e_polychrome);
        if (!center.edition || !center.edition.foil) info_queue.push(P_CENTERS.e_foil);
        if (!center.edition || !center.edition.holo) info_queue.push(P_CENTERS.e_holo);
      }
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'rotom');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && room()) {
        const set = pseudorandom_element(consumable_types(), pseudoseed('rotomf'))[0];
        const _card = create_card(set.key, G.consumeables, null, null, null, null, null, 'rotomf');
        const edition = poll_edition('aura', null, true, true);
        _card.set_edition(edition);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_consumable'), colour: 'FILTER' });
      }
      rotom_item(card, context);
      return undefined;
    },
  },
  rotomfan: {
    loc_vars: rotom_vars,
    calculate(self, card, context) {
      if (context.setting_blind && !card.getting_sliced && !context.blueprint) {
        let my_pos = null;
        for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] === card) { my_pos = i; break; }
        const right = my_pos !== null ? G.jokers.cards[my_pos + 1] : undefined;
        if (right && !card.getting_sliced && !right.ability.eternal && !right.getting_sliced) {
          const sliced_card = right;
          sliced_card.getting_sliced = true;
          G.GAME.joker_buffer = G.GAME.joker_buffer - 1;
          G.E_MANAGER.add_event(() => {
            G.GAME.joker_buffer = 0;
            card.juice_up(0.8, 0.8);
            sliced_card.start_dissolve(['#57ecab'], null, 1.6);
            play_sound('slice1', 0.96 + math_random() * 0.08);
          });
          G.E_MANAGER.add_event(() => {
            // pairs(G.P_TAGS): every tag but the Boss Tag (the run's active, ported tags here).
            const tags = Object.values(P_TAGS).filter((v) => v.key !== 'tag_boss' && centerActive(v) && !v.unported);
            const temp_tag = pseudorandom_element(tags, pseudoseed('rotomfan'))[0];
            const tag = new Tag(temp_tag.key);
            if (tag.key === 'tag_orbital') {
              const _poker_hands = [];
              for (const [k, v] of Object.entries(G.GAME.hands)) if (v.visible) _poker_hands.push(k);
              tag.ability.orbital_hand = pseudorandom_element(_poker_hands, pseudoseed('rotomfan'))[0];
            }
            add_tag(tag);
            play_sound('generic1', 0.9 + math_random() * 0.1, 0.8);
            play_sound('holo1', 1.2 + math_random() * 0.1, 0.4);
          });
        }
      }
      rotom_item(card, context);
      return undefined;
    },
  },
  rotomm: {
    loc_vars: rotom_vars,
    calculate(self, card, context) {
      if (end_of_round(context)) {
        const targets = [G.hand.cards[0], G.hand.cards[1]].filter(Boolean);
        juice_flip_table(card, targets, false, targets.length);
        for (let i = 0; i < targets.length; i++) poke_vary_rank(G.hand.cards[i], true);
        juice_flip_table(card, targets, true, targets.length);
      }
      rotom_item(card, context);
      return undefined;
    },
  },
  // ---------------------------------------------------------------- new in 3.9.1 (new-jokers sub-batch 14)
  // Gallade 475 (Kirlia's Dawn Stone evolution): X(1 + 0.5 per Joker with 2+ Energy); comes holding a Double Rainbow Energy.
  gallade: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Spectral', key: 'c_poke_double_rainbow_energy', vars: [energy_max + (G.GAME.energy_plus || 0)] });
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Double Rainbow Energy'] });
      }
      const total = 1 + center.ability.extra.Xmult_mod * gallade_energized(center.ability.extra.e_level);
      return { vars: [center.ability.extra.Xmult_mod, total, center.ability.extra.e_level] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { Xmult: 1 + card.ability.extra.Xmult_mod * gallade_energized(card.ability.extra.e_level) };
      return undefined;
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) create_consumeable('c_poke_double_rainbow_energy');
    },
  },
}, FILE);

// Pokermon 3.9.1: the Rotom forms are never in a pool (only the machines make them).
const ROTOM_FORMS = ['j_poke_rotomh', 'j_poke_rotomw', 'j_poke_rotomf', 'j_poke_rotomfan', 'j_poke_rotomm'];
POKE_POOL_RULES.push((self) => (self && ROTOM_FORMS.includes(self.key) ? false : undefined));
