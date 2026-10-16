// Pokermon 3.2.1 — pokemon/pokejokers_04.lua (Pokédex 091-120: Cloyster -> Staryu), 32 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage,
// ptype, gen, item_req, megas, volatile, enhancement_gate) comes from data.js.
import * as BN from '../../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element,
  create_card, copy_card, juice_card_until, playing_card_joker_effects, play_sound,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, type_evo, deck_enhance_evo,
  ease_poke_dollars, has_enhancement, find_joker, get_probability_vars, pseudorandom_probability,
  volatile_active, remove,
} from '../api.js';
import { number_format } from '../../../js/engine/core.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';

const FILE = 'pokemon/pokejokers_04.lua';

// ------------------------------------------------------------ shared bodies
const negative_tip = (info_queue, center) => {
  if (detailed() && (!center.edition || (center.edition && !center.edition.negative))) info_queue.push(P_CENTERS.e_negative);
};
const mega_tip = (info_queue) => { if (detailed()) info_queue.push({ set: 'Other', key: 'mega_poke' }); };
const volatile_tip = (info_queue, center) => { if (detailed()) info_queue.push({ set: 'Other', key: 'poke_volatile_' + center.ability.extra.volatile }); };

/** Gastly / Haunter cash-out: a random other joker turns Negative and this one self-destructs. */
function lick(self, card, seed, fallback_seed) {
  let eligible_card;
  if (G.jokers.cards.length > 0) {
    const eligible_editionless_jokers = [];
    for (const v of G.jokers.cards) if (v.ability.set === 'Joker' && v !== card && !v.gone) eligible_editionless_jokers.push(v);
    if (eligible_editionless_jokers.length > 0) {
      eligible_card = pseudorandom_element(eligible_editionless_jokers, pseudoseed(seed))[0];
      eligible_card.set_edition({ negative: true }, true);
    } else {
      // (Lua: with no other joker this one itself may be picked.)
      eligible_card = pseudorandom_element(G.jokers.cards, pseudoseed(fallback_seed))[0];
      eligible_card.set_edition({ negative: true }, true);
    }
  }
  remove(self, card, {});
  card_eval_status_text(eligible_card, 'extra', null, null, null, { message: localize('poke_lick_ex'), colour: 'PURPLE' });
}
/** Gengar's "picks a new number" roll. */
function gengar_roll(card) {
  const gengar_chance = pseudorandom('gengar');
  if (gengar_chance < 0.05) card.ability.extra.gengar_rounds = 2;
  else if (gengar_chance < 0.15) card.ability.extra.gengar_rounds = 3;
  else if (gengar_chance < 0.35) card.ability.extra.gengar_rounds = 4;
  else if (gengar_chance < 0.65) card.ability.extra.gengar_rounds = 5;
  else if (gengar_chance < 0.85) card.ability.extra.gengar_rounds = 6;
  else if (gengar_chance < 0.95) card.ability.extra.gengar_rounds = 7;
  else card.ability.extra.gengar_rounds = 8;
}
/** Drowzee / Hypno: unique Planet cards used this run. */
function planets_update(self, card) {
  let planets_used = 0;
  for (const v of Object.values(G.GAME.consumeable_usage)) if (v.set === 'Planet') planets_used = planets_used + 1;
  card.ability.extra.planets_used = planets_used;
}
function planets_xmult(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.joker_main && card.ability.extra.planets_used > 0) {
      const Xmult = 1 + card.ability.extra.planets_used * card.ability.extra.Xmult_mod;
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'MULT', Xmult_mod: Xmult };
    }
  }
  return undefined;
}
/** Krabby / Kingler: +chips per scored face card. */
function face_chips(card, context) {
  if (context.individual && context.cardarea === G.play && context.other_card.is_face()) {
    if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
      return { colour: 'CHIPS', chips: card.ability.extra.chips };
    }
  }
  return undefined;
}
/** Voltorb / Electrode: Explosion — the volatile joker faints for the round. */
function explode(card, context) {
  if (!context.blueprint) {
    G.E_MANAGER.add_event(() => {
      card.ability.fainted = G.GAME.round;
      card.set_debuff();
    });
  }
}
/** Rhyhorn / Rhydon: scored Stone cards permanently gain chips. */
function stone_bonus(card, context) {
  if (context.individual && context.cardarea === G.play && !context.other_card.debuff && !context.end_of_round && has_enhancement(context.other_card, 'm_stone')) {
    context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus || 0;
    context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus + card.ability.extra.chips;
    return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
  }
  return undefined;
}
/** Koffing / Weezing: halve the Boss Blind's requirement when sold. */
function halve_boss() {
  G.GAME.blind.chips = BN.div(G.GAME.blind.chips, 2);
  G.GAME.blind.chip_text = number_format(G.GAME.blind.chips);
}
/** Goldeen / Seaking: retrigger Gold cards held in hand. */
function gold_retrigger(card, context) {
  if (context.repetition && context.cardarea === G.hand && context.card_effects &&
      ((context.card_effects[0] && Object.keys(context.card_effects[0]).length > 0) || context.card_effects.length > 1) &&
      has_enhancement(context.other_card, 'm_gold')) {
    return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
  }
  return undefined;
}
/** Thick Club count (Cubone / Marowak): held consumables + Thick Clubs (count double). */
const club_count = () => ((G.consumeables && G.consumeables.cards.length) || 0) + find_joker('thickclub').length;

defineJokers({
  // Cloyster 091
  cloyster: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'cloyster');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && context.scoring_hand.length === 5) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          if (pseudorandom_probability(card, 'cloyster', card.ability.extra.num, card.ability.extra.dem, 'cloyster')) {
            return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
          }
        }
      }
      return undefined;
    },
  },
  // Gastly 092
  gastly: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      negative_tip(info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'gastly');
      return { vars: [num, dem, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (!card.gone) return level_evo(self, card, context, 'j_poke_haunter');
      return undefined;
    },
    calc_dollar_bonus(self, card) {
      if (pseudorandom_probability(card, 'gastly', card.ability.extra.num, card.ability.extra.dem, 'gastly')) lick(self, card, 'gastly', 'gastly');
      return undefined;
    },
  },
  // Haunter 093
  haunter: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      negative_tip(info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_linkcable);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'haunter');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) {
      if (!card.gone) return item_evo(self, card, context, 'j_poke_gengar');
      return undefined;
    },
    calc_dollar_bonus(self, card) {
      if (pseudorandom_probability(card, 'haunter', card.ability.extra.num, card.ability.extra.dem, 'haunter') && !card.ability.extra.evolve) {
        lick(self, card, 'haunter', 'gastly');
      }
      return undefined;
    },
  },
  // Gengar 094
  gengar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      negative_tip(info_queue, center);
      mega_tip(info_queue);
      return { vars: [center.ability.extra.gengar_rounds] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
        card.ability.extra.gengar_rounds = card.ability.extra.gengar_rounds - 1;
        if (card.ability.extra.gengar_rounds !== 0) {
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_nasty_plot_ex'), colour: 'PURPLE' });
        }
        if (card.ability.extra.gengar_rounds === 0) {
          card.ability.extra.trigger = true;
          gengar_roll(card);
        }
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) gengar_roll(card);
    },
    calc_dollar_bonus(self, card) {
      if (card.ability.extra.trigger) {
        card.ability.extra.trigger = false;
        if (G.jokers.cards.length > 0) {
          const eligible_jokers = [];
          for (const v of G.jokers.cards) if (v.ability.set === 'Joker' && v.ability.name !== 'gengar' && !v.gone) eligible_jokers.push(v);
          if (eligible_jokers.length > 0) {
            const eligible_card = pseudorandom_element(eligible_jokers, pseudoseed('gengar'))[0];
            eligible_card.set_edition({ negative: true }, true);
            card_eval_status_text(eligible_card, 'extra', null, null, null, { message: localize('poke_lick_ex'), colour: 'PURPLE' });
          }
        }
      }
      return undefined;
    },
  },
  // Mega Gengar 094-1
  mega_gengar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (!center.edition || (center.edition && !center.edition.negative)) info_queue.push(P_CENTERS.e_negative);
      return undefined;
    },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blind.boss) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_negative'));
          play_sound('generic1');
          play_sound('holo1');
        });
      }
      return undefined;
    },
  },
  // Onix 095
  onix: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_stone);
      return undefined;
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0, true);
      }
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        if (G.GAME.current_round.hands_played === 0) {
          const target = context.scoring_hand[0];
          target.set_ability(P_CENTERS.m_stone, null, true);
          G.E_MANAGER.add_event(() => target.juice_up());
        }
      }
      return type_evo(self, card, context, 'j_poke_steelix', 'metal');
    },
  },
  // Drowzee 096
  drowzee: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const Xmult = 1 + card.ability.extra.planets_used * card.ability.extra.Xmult_mod;
      const planets_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.planets_used);
      return { vars: [Xmult, card.ability.extra.Xmult_mod, planets_left] };
    },
    calculate(self, card, context) {
      const r = planets_xmult(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_hypno', card.ability.extra.planets_used, self.config.evo_rqmt);
    },
    update: planets_update,
  },
  // Hypno 097
  hypno: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Trance'] });
        info_queue.push({ set: 'Spectral', key: 'c_trance' });
        info_queue.push({ key: 'blue_seal', set: 'Other' });
      }
      const Xmult = 1 + card.ability.extra.planets_used * card.ability.extra.Xmult_mod;
      return { vars: [Xmult, card.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) { return planets_xmult(card, context); },
    update: planets_update,
    add_to_deck(self, card, from_debuff) {
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit && !from_debuff) {
        const _card = create_card('Spectral', G.consumeables, null, null, null, null, 'c_trance');
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
      }
    },
  },
  // Krabby 098
  krabby: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return face_chips(card, context) || level_evo(self, card, context, 'j_poke_kingler'); },
  },
  // Kingler 099
  kingler: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_bonus);
      return { vars: [center.ability.extra.chips] };
    },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        const faces = [];
        for (const v of context.scoring_hand) {
          if (v.is_face() && v.config.center === P_CENTERS.c_base) {
            faces.push(v);
            v.set_ability(P_CENTERS.m_bonus, null, true);
            G.E_MANAGER.add_event(() => v.juice_up());
          }
        }
        if (faces.length > 0) return { message: localize('poke_surf_ex'), colour: 'CHIPS', card };
      }
      const r = face_chips(card, context);
      if (r) G.E_MANAGER.add_event(() => card.juice_up(0.8, 0.8));
      return r;
    },
  },
  // Voltorb 100
  voltorb: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      volatile_tip(info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && volatile_active(self, card, card.ability.extra.volatile)) {
          explode(card, context);
          return { message: localize('poke_explosion_ex'), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      return level_evo(self, card, context, 'j_poke_electrode');
    },
  },
  // Electrode 101
  electrode: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      volatile_tip(info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && volatile_active(self, card, card.ability.extra.volatile)) {
          ease_poke_dollars(card, 'electrode', card.ability.extra.money);
          explode(card, context);
          return { message: localize('poke_explosion_ex'), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      return undefined;
    },
  },
  // Exeggcute 102
  exeggcute: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_leafstone);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'exeggcute');
      return { vars: [center.ability.extra.mult, localize(center.ability.extra.suit, 'suits_singular'), center.ability.extra.mult2, num, dem] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          let Mult = card.ability.extra.mult;
          if (pseudorandom_probability(card, 'exeggcute', card.ability.extra.num, card.ability.extra.dem, 'exeggcute')) Mult = card.ability.extra.mult2;
          return { mult: Mult, card };
        }
      }
      return item_evo(self, card, context, 'j_poke_exeggutor');
    },
  },
  // Exeggutor 103
  exeggutor: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'exeggutor');
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.Xmult_multi, localize(center.ability.extra.suit, 'suits_singular'), num, dem] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          if (pseudorandom_probability(card, 'exeggutor', card.ability.extra.num, card.ability.extra.dem, 'exeggutor')) {
            return { message: localize('poke_solar_ex'), colour: 'XMULT', x_mult: card.ability.extra.Xmult_multi, card };
          }
          return { colour: 'MULT', mult: card.ability.extra.mult_mod, card };
        }
      }
      return undefined;
    },
  },
  // Cubone 104
  cubone: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Thick Club'] });
        info_queue.push(P_CENTERS.c_poke_thickclub);
      }
      const consumables_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.consumables_used);
      return { vars: [card.ability.extra.mult, card.ability.extra.mult * club_count(), consumables_left] };
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_thickclub');
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'FILTER' });
      }
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const count = G.consumeables.cards.length + find_joker('thickclub').length;
          if (count > 0) {
            return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult * count] }), colour: 'MULT', mult_mod: card.ability.extra.mult * count };
          }
        }
      }
      if (context.using_consumeable) card.ability.extra.consumables_used = card.ability.extra.consumables_used + 1;
      return scaling_evo(self, card, context, 'j_poke_marowak', card.ability.extra.consumables_used, self.config.evo_rqmt);
    },
  },
  // Marowak 105
  marowak: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_thickclub);
      const count = club_count();
      return { vars: [center.ability.extra.Xmult_mod, center.ability.extra.card_limit, 1 + (center.ability.extra.Xmult_mod * count)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const count = G.consumeables.cards.length + find_joker('thickclub').length;
          if (count > 0) {
            const x = 1 + (card.ability.extra.Xmult_mod * count);
            return { message: localize({ type: 'variable', key: 'a_xmult', vars: [x] }), colour: 'XMULT', Xmult_mod: x };
          }
        }
      }
      return undefined;
    },
    add_to_deck(self, card) {
      G.E_MANAGER.add_event(() => { G.consumeables.config.card_limit = G.consumeables.config.card_limit + card.ability.extra.card_limit; });
    },
    remove_from_deck(self, card) {
      G.E_MANAGER.add_event(() => { G.consumeables.config.card_limit = G.consumeables.config.card_limit - card.ability.extra.card_limit; });
    },
  },
  // Hitmonlee 106
  hitmonlee: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_mod, G.GAME.starting_deck_size, Math.max(1, 1 + (G.playing_cards ? (G.GAME.starting_deck_size - G.playing_cards.length) : 0) * center.ability.extra.Xmult_mod)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const Xmult = 1 + ((G.GAME.starting_deck_size - G.playing_cards.length) * card.ability.extra.Xmult_mod);
        if (Xmult > 1) return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'MULT', Xmult_mod: Xmult };
      }
      return undefined;
    },
  },
  // Hitmonchan 107
  hitmonchan: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_mod, G.GAME.starting_deck_size, Math.max(1, 1 + (G.playing_cards ? (G.playing_cards.length - G.GAME.starting_deck_size) : 0) * center.ability.extra.Xmult_mod)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const Xmult = 1 + ((G.playing_cards.length - G.GAME.starting_deck_size) * card.ability.extra.Xmult_mod);
        if (Xmult > 1) return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'MULT', Xmult_mod: Xmult };
      }
      return undefined;
    },
  },
  // Lickitung 108
  lickitung: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const jacks_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.jacks_played);
      return { vars: [card.ability.extra.Xmult_multi, jacks_left] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff) {
        let first_jack, second_jack;
        for (const c of context.scoring_hand) {
          if (c.get_id() === 11) {
            if (!first_jack) first_jack = c;
            else { second_jack = c; break; }
          }
        }
        if (context.other_card === first_jack || context.other_card === second_jack) {
          if (!context.blueprint) card.ability.extra.jacks_played = card.ability.extra.jacks_played + 1;
          return { x_mult: card.ability.extra.Xmult_multi, colour: 'RED', card };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_lickilicky', card.ability.extra.jacks_played, self.config.evo_rqmt);
    },
  },
  // Koffing 109
  koffing: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) {
        if (G.GAME.blind && G.GAME.blind.get_type() === 'Boss') halve_boss();
      }
      return level_evo(self, card, context, 'j_poke_weezing');
    },
  },
  // Weezing 110
  weezing: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return undefined; },
    calculate(self, card, context) {
      if (context.selling_self && !context.blueprint) {
        if (G.GAME.blind && G.GAME.blind.get_type() === 'Boss') {
          halve_boss();
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
          G.GAME.blind.disable();
        }
      }
      return undefined;
    },
  },
  // Rhyhorn 111
  rhyhorn: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_stone);
      return { vars: [center.ability.extra.chips, center.ability.extra.rounds] };
    },
    calculate(self, card, context) { return stone_bonus(card, context) || level_evo(self, card, context, 'j_poke_rhydon'); },
  },
  // Rhydon 112
  rhydon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.c_poke_linkcable); }
      return { vars: [center.ability.extra.chips] };
    },
    calculate(self, card, context) {
      const r = stone_bonus(card, context);
      if (r) return r;
      if (context.repetition && !context.end_of_round && context.cardarea === G.play) {
        if (context.other_card.ability.name === 'Stone Card') {
          let first;
          for (const c of context.scoring_hand) {
            if (c === context.other_card) { first = true; break; } else if (c.ability.name === 'Stone Card') break;
          }
          if (first) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        }
      }
      return item_evo(self, card, context, 'j_poke_rhyperior');
    },
  },
  // Chansey 113
  chansey: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_lucky);
      let deck_data = '';
      if (G.playing_cards) {
        let enhance_count = 0;
        for (const v of G.playing_cards) if (has_enhancement(v, 'm_lucky')) enhance_count = enhance_count + 1;
        deck_data = '[' + enhance_count + '/' + Math.ceil(G.playing_cards.length / 4) + '] ';
      }
      return { vars: [center.ability.extra.limit, center.ability.extra.triggers, deck_data] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.lucky_trigger && card.ability.extra.triggers < card.ability.extra.limit) {
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const card_to_copy = context.other_card;
        G.E_MANAGER.add_event(() => {
          const copy = copy_card(card_to_copy, null, null, G.playing_card);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          G.hand.emplace(copy);
          copy.start_materialize();
          playing_card_joker_effects([copy]);
        });
        if (!context.blueprint) card.ability.extra.triggers = card.ability.extra.triggers + 1;
        return { message: localize('k_copied_ex'), colour: 'CHIPS', card, playing_cards_created: [true] };
      }
      if (!context.repetition && !context.individual && context.end_of_round) card.ability.extra.triggers = 0;
      return deck_enhance_evo(self, card, context, 'j_poke_blissey', 'Lucky', 0.25);
    },
  },
  // Tangela 114
  tangela: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push(P_CENTERS.m_wild);
      const wild_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.wilds_scored);
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'tangela');
      return { vars: [card.ability.extra.mult, card.ability.extra.chips, card.ability.extra.money_mod, num, dem, wild_left] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && !context.end_of_round && has_enhancement(context.other_card, 'm_wild')) {
        if (!context.blueprint) card.ability.extra.wilds_scored = card.ability.extra.wilds_scored + 1;
        if (pseudorandom_probability(card, 'tangela', card.ability.extra.num, card.ability.extra.dem, 'tangela')) {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.money_mod;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return {
            message: localize('poke_tangela_bonus'), colour: 'BLACK',
            mult: card.ability.extra.mult, chips: card.ability.extra.chips,
            dollars: ease_poke_dollars(card, 'tangela', card.ability.extra.money_mod, true), card,
          };
        }
        const bonus = pseudorandom_element(['Mult', 'Chips', 'Money'], pseudoseed('tangela'))[0];
        if (bonus === 'Mult') return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult: card.ability.extra.mult };
        if (bonus === 'Chips') return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chips: card.ability.extra.chips };
        if (bonus === 'Money') {
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.money_mod;
          G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          return { dollars: ease_poke_dollars(card, 'tangela', card.ability.extra.money_mod, true), card };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_tangrowth', card.ability.extra.wilds_scored, self.config.evo_rqmt);
    },
  },
  // Kangaskhan 115
  kangaskhan: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      mega_tip(info_queue);
      return { vars: [center.ability.extra.card_limit, center.ability.extra.interest_cap / 5] };
    },
    add_to_deck(self, card) {
      const add = card.ability.extra.card_limit;
      G.E_MANAGER.add_event(() => { G.consumeables.config.card_limit = G.consumeables.config.card_limit + add; });
      G.GAME.interest_cap = G.GAME.interest_cap - card.ability.extra.interest_cap;
    },
    remove_from_deck(self, card) {
      const rem = card.ability.extra.card_limit;
      G.E_MANAGER.add_event(() => { G.consumeables.config.card_limit = G.consumeables.config.card_limit - rem; });
      G.GAME.interest_cap = G.GAME.interest_cap + card.ability.extra.interest_cap;
    },
  },
  // Mega Kangaskhan 115-1
  mega_kangaskhan: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.consumeable_target, center.ability.extra.consumeables_used] }; },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      if (context.using_consumeable) {
        card.ability.extra.consumeables_used = card.ability.extra.consumeables_used + 1;
        if (card.ability.extra.consumeables_used >= 2) {
          juice_card_until(card, (c) => (c.ability.extra.consumeables_used !== undefined && c.ability.extra.consumeables_used >= 2), true);
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        if (card.ability.extra.consumeables_used >= 2) {
          G.E_MANAGER.add_event(() => {
            add_tag(new Tag('tag_double'));
            play_sound('generic1');
            play_sound('holo1');
          });
        }
        card.ability.extra.consumeables_used = 0;
      }
      return undefined;
    },
  },
  // Horsea 116
  horsea: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint) {
          let upgraded = false;
          for (const v of context.scoring_hand) {
            if (v.get_id() === 6) {
              card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
              upgraded = true;
            }
          }
          if (upgraded) return { message: localize('k_upgrade_ex'), colour: 'MULT' };
        }
        if (context.joker_main && card.ability.extra.mult > 0) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_seadra', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Seadra 117
  seadra: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.mult > 0) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && !context.blueprint) {
        if (context.other_card.get_id() === 6) {
          let has_king = false;
          for (const c of G.hand.cards) if (c.get_id() === 13) { has_king = true; break; }
          if (has_king) card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod * 2;
          else card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        }
      }
      return type_evo(self, card, context, 'j_poke_kingdra', 'dragon');
    },
  },
  // Goldeen 118
  goldeen: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_gold);
      return { vars: [center.ability.extra.retriggers, center.ability.extra.rounds] };
    },
    calculate(self, card, context) { return gold_retrigger(card, context) || level_evo(self, card, context, 'j_poke_seaking'); },
  },
  // Seaking 119
  seaking: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_gold);
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) { return gold_retrigger(card, context); },
  },
  // Staryu 120
  staryu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_waterstone);
      return { vars: [center.ability.extra.mult, localize(center.ability.extra.suit, 'suits_singular'), center.ability.extra.money_mod] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          // (Lua seeds the money roll with "starmie" here too.)
          const earned = ease_poke_dollars(card, 'starmie', card.ability.extra.money_mod, true);
          return { mult: card.ability.extra.mult, dollars: earned, card };
        }
      }
      return item_evo(self, card, context, 'j_poke_starmie');
    },
  },
}, FILE);
