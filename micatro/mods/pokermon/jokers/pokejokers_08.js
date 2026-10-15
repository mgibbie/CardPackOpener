// Pokermon 3.2.1 — pokemon/pokejokers_08.lua (Pokédex 211-240: Qwilfish -> Magby), 33 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req, megas) comes from data.js. See ../PORTING.md.
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, pseudoshuffle,
  ease_discard, create_card, copy_card, poll_edition, juice_card_until, playing_card_joker_effects, delay, play_sound,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, ease_poke_dollars, has_enhancement, has_no_suit,
  get_probability_vars, pseudorandom_probability, poke_set_hazards, poke_remove_card, create_random_poke_joker,
  matching_energy, poke_evolve, faint_baby_poke, smods_create_card,
} from '../api.js';
import { discard_cards_from_highlighted } from '../../../js/engine/run.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';

const FILE = 'pokemon/pokejokers_08.lua';

// zberryjuice.lua: pokermon.juice_list
const juice_list = { Energy: 'c_poke_berry_juice_energy', Spectral: 'c_poke_berry_juice_spectral', Planet: 'c_poke_berry_juice_planet', Item: 'c_poke_berry_juice_item', Tarot: 'c_poke_berry_juice_tarot' };

// ------------------------------------------------------------ shared bodies
const is_base = (c) => c.config.center === P_CENTERS.c_base;
const mega_tip = (info_queue) => info_queue.push({ set: 'Other', key: 'mega_poke' });
const a_mult = (m) => localize({ type: 'variable', key: 'a_mult', vars: [m] });
const a_chips = (c) => localize({ type: 'variable', key: 'a_chips', vars: [c] });
const a_xmult = (x) => localize({ type: 'variable', key: 'a_xmult', vars: [x] });
const faint = (card) => G.E_MANAGER.add_event(() => { card.ability.fainted = G.GAME.round; card.set_debuff(); });

const hazard_tip = (info_queue, abbr) => {
  info_queue.push({ set: 'Other', key: 'poke_hazards', vars: [abbr.hazards] });
  info_queue.push(P_CENTERS.m_poke_hazard);
};

/** Slugma / Magcargo: every `hand_reset` hands, +chip_mod chips and destroy the leftmost held card. */
function slug_calc(card, context) {
  if (context.first_hand_drawn && card.ability.extra.hands === 1) {
    juice_card_until(card, (c) => c.ability.extra.hands <= 1 && !G.RESET_JIGGLES, true);
  }
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && !context.blueprint) {
      card.ability.extra.hands = card.ability.extra.hands - 1;
      if (card.ability.extra.hands === 1) juice_card_until(card, (c) => c.ability.extra.hands <= 1 && !G.RESET_JIGGLES, true);
      if (card.ability.extra.hands === 0) {
        if (G.hand && G.hand.cards && G.hand.cards[0]) card.ability.extra.remove = true;
        card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
        card.ability.extra.hands = card.ability.extra.hand_reset;
      }
    }
    if (context.after && card.ability.extra.remove && !context.blueprint) {
      card.ability.extra.remove = false;
      poke_remove_card(G.hand.cards[0], card);
    }
  }
  if (context.joker_main) return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
  return undefined;
}

/** Swinub / Piloswine: the first scoring card gives mult per Stone/Glass card scored. */
function stoneglass_mult(card, context) {
  if (context.other_card === context.scoring_hand[0]) {
    let stoneglass = 0;
    for (const v of context.scoring_hand) if (has_enhancement(v, 'm_stone') || has_enhancement(v, 'm_glass')) stoneglass = stoneglass + 1;
    if (stoneglass > 0) return { mult: card.ability.extra.mult * stoneglass, card };
  }
  return undefined;
}

/** Houndour / Houndoom / Mega Houndoom: after a discard, discard `n` (or all) more random held cards. */
function hound_post_discard(card, n) {
  G.E_MANAGER.add_event(() => {
    card.ability.extra.active = false;
    const targets = [];
    let selected = null;
    for (let i = 0; i < G.hand.cards.length; i++) {
      if (G.hand.cards[i] && !G.hand.cards[i].ability.discarded) targets.push(G.hand.cards[i]);
    }
    if (n !== undefined) pseudoshuffle(targets, pseudoseed('houndour'));
    if (targets.length > 0) {
      const count = n !== undefined ? Math.min(targets.length, n) : targets.length;
      const old_limit = G.hand.config.highlighted_limit;
      if (n === undefined) G.hand.config.highlighted_limit = targets.length;
      for (let i = 0; i < count; i++) {
        G.hand.add_to_highlighted(targets[i], true);
        selected = true;
        play_sound('card1', 1);
      }
      if (selected) {
        delay(0.2);
        discard_cards_from_highlighted(true);
      }
      for (let i = 0; i < count; i++) G.hand.remove_from_highlighted(targets[i], true);
      if (n === undefined) G.hand.config.highlighted_limit = old_limit;
    }
  });
}
function hound_calc(card, context, n) {
  if (context.pre_discard && context.full_hand && context.full_hand.length > 0 && !context.hook && !context.blueprint) {
    if (card.ability.extra.active) card.ability.extra.active = false;
    else if (context.full_hand.length > 3) card.ability.extra.active = true;
  }
  if (context.discard && context.other_card) {
    context.other_card.ability.perma_mult = (context.other_card.ability.perma_mult || 0) + card.ability.extra.mult_mod;
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'RED' });
  }
  if (context.post_discard && card.ability.extra.active && !context.recursive && !context.blueprint) hound_post_discard(card, n);
  if (context.end_of_round && !context.individual && !context.repetition) card.ability.extra.active = false;
  return undefined;
}

/** Phanpy / Donphan: X grows on 5-card scoring hands, resets otherwise. */
function phanpy_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && !context.blueprint) {
      if (context.scoring_hand.length >= 5) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        return { message: localize('k_upgrade_ex'), colour: 'RED', card };
      }
      card.ability.extra.Xmult = card.ability.extra.Xmult2;
      return { message: localize('k_reset'), colour: 'RED' };
    }
    if (context.joker_main && card.ability.extra.Xmult > 1) {
      return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
    }
  }
  return undefined;
}

/** Baby Pokémon X-mult (faints unless only Babies to its right). */
function baby_calc(self, card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    faint_baby_poke(self, card, context);
    return { message: a_xmult(card.ability.extra.Xmult_minus), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
  }
  return undefined;
}
function baby_tag_evo(self, card, context, key, tag) {
  const evo = level_evo(self, card, context, key);
  if (evo && typeof evo === 'object') {
    G.E_MANAGER.add_event(() => {
      add_tag(new Tag(tag));
      play_sound('generic1', 0.9, 0.8);
      play_sound('holo1', 1.2, 0.4);
    });
  }
  return evo;
}

/** Smeargle's copied joker lives on the card (a Card reference can't sit in ability.extra:
 *  ability tables are deep-copied and serialised). Lua: card.ability.extra.copy_joker. */
const smeargle_target = (card) => card.smeargle_copy_joker;

defineJokers({
  // Qwilfish 211
  qwilfish: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      hazard_tip(info_queue, abbr);
      return { vars: [abbr.hazards, abbr.chip_mod, abbr.chips] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) poke_set_hazards(card.ability.extra.hazards);
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      if (context.remove_playing_cards && !context.blueprint) {
        for (const removed_card of context.removed) {
          if (!is_base(removed_card)) {
            card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'CHIPS' });
          }
        }
      }
      return undefined;
    },
  },
  // Scizor 212
  scizor: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.e_foil, P_CENTERS.e_holo, P_CENTERS.e_polychrome);
        mega_tip(info_queue);
      }
      let emult = 0, echips = 0, eXmult = 1;
      if (center.edition && center.edition.holo) emult = center.edition.mult || 0;
      if (center.edition && center.edition.foil) echips = center.edition.chips || 0;
      if (center.edition && center.edition.polychrome) eXmult = center.edition.x_mult || 1;
      const ex = center.ability.extra;
      return { vars: [ex.mult + emult, ex.scizor_chips + echips, ex.scizor_Xmult * eXmult, ex.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.ending_shop) {
        card.ability.extra.selected = false;
        juice_card_until(card, () => !card.ability.extra.selected, true);
      }
      if (context.setting_blind && !card.getting_sliced && !context.blueprint) {
        let my_pos = null;
        for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] === card) { my_pos = i; break; }
        const right = my_pos !== null ? G.jokers.cards[my_pos + 1] : undefined;
        if (right && !card.getting_sliced && !right.ability.eternal && !right.getting_sliced) {
          const sliced_card = right;
          sliced_card.getting_sliced = true;
          if (sliced_card.config.center.rarity !== 1 && sliced_card.config.center.rarity !== 2) {
            if (card.edition) {
              if (card.edition.chips) card.ability.extra.scizor_chips = card.ability.extra.scizor_chips + card.edition.chips;
              if (card.edition.mult) card.ability.extra.mult = card.ability.extra.mult + card.edition.mult;
              if (card.edition.x_mult) card.ability.extra.scizor_Xmult = card.ability.extra.scizor_Xmult * card.edition.x_mult;
            }
            let edition = null;
            if (sliced_card.edition && (sliced_card.edition.foil || sliced_card.edition.holo || sliced_card.edition.polychrome)) edition = sliced_card.edition;
            else edition = poll_edition('wheel_of_fortune', null, true, true);
            card.set_edition(edition, true);
          }
          card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
          G.GAME.joker_buffer = G.GAME.joker_buffer - 1;
          G.E_MANAGER.add_event(() => {
            G.GAME.joker_buffer = 0;
            card.juice_up(0.8, 0.8);
            sliced_card.start_dissolve();
            play_sound('slice1', 0.96);
          });
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'RED', no_juice: true });
        }
        card.ability.extra.selected = true;
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return {
          message: localize('poke_x_scissor_ex'), colour: 'metal',
          mult_mod: card.ability.extra.mult, chip_mod: card.ability.extra.scizor_chips, Xmult_mod: card.ability.extra.scizor_Xmult,
        };
      }
      return undefined;
    },
  },
  // Mega Scizor 212-1
  mega_scizor: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      if (context.other_joker && context.other_joker.config.center.rarity === 1) {
        const oj = context.other_joker;
        G.E_MANAGER.add_event(() => oj.juice_up(0.5, 0.5));
        return { message: a_xmult(card.ability.extra.Xmult_multi), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.juice_up();
        for (const v of G.jokers.cards.slice()) {
          if (v.config.center.rarity === 1 && !v.ability.eternal) {
            v.start_dissolve();
            play_sound('slice1', 0.96);
          }
        }
      }
      return undefined;
    },
  },
  // Shuckle 213
  shuckle: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_berry_juice);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && !card.getting_sliced && !context.blueprint && G.consumeables && G.consumeables.cards && G.consumeables.cards.length > 0) {
        const sliced_card = G.consumeables.cards[0];
        if (!sliced_card.getting_sliced && !sliced_card.config.center.berry_juice) {
          sliced_card.getting_sliced = true;
          G.E_MANAGER.add_event(() => {
            card.juice_up(0.8, 0.8);
            sliced_card.start_dissolve();
            play_sound('slice1', 0.96);
            const _card = create_card('Item', G.consumeables, null, null, null, null, juice_list[sliced_card.config.center.set] || 'c_poke_berry_juice_mystery');
            _card.add_to_deck();
            G.consumeables.emplace(_card);
            card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'FILTER' });
          });
        }
      }
      return undefined;
    },
  },
  // Heracross 214
  heracross: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); mega_tip(info_queue); return { vars: [center.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.full_hand && context.joker_main) {
        if (G.hand && G.hand.cards) {
          const found_ranks = {};
          for (const played_card of context.scoring_hand) found_ranks[played_card.get_id()] = true;
          for (const hand_card of G.hand.cards) if (found_ranks[hand_card.get_id()]) return undefined;
          return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      return undefined;
    },
  },
  // Mega Heracross 214-1
  mega_heracross: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) card.ability.extra.no_score = undefined;
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && !card.ability.extra.no_score) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint) {
        if (context.before && context.full_hand.length < 5) {
          card.ability.extra.no_score = true;
          G.E_MANAGER.add_event(() => { card.juice_up(); card.ability.fainted = G.GAME.round; card.set_debuff(); });
        }
      }
      if (context.pre_discard && G.hand.highlighted.length < 5 && !context.hook && !context.blueprint) {
        G.E_MANAGER.add_event(() => { card.juice_up(); card.ability.fainted = G.GAME.round; card.set_debuff(); });
      }
      return undefined;
    },
  },
  // Sneasel 215
  sneasel: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_duskstone);
      const sc = G.GAME && G.GAME.current_round && G.GAME.current_round.sneaselcard;
      return { vars: [localize((sc && sc.rank) || 'Ace', 'ranks'), card.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.final_scoring_step && context.full_hand.length === 1 && context.full_hand[0].get_id() === G.GAME.current_round.sneaselcard.id && !context.blueprint) {
        context.full_hand[0].to_be_removed_by = card;
        ease_poke_dollars(card, 'sneasel', card.ability.extra.money);
        card.juice_up();
      }
      if (context.destroy_card && context.destroy_card.to_be_removed_by === card && !context.blueprint) {
        context.destroy_card.to_be_removed_by = undefined;
        return { remove: true };
      }
      return item_evo(self, card, context, 'j_poke_weavile');
    },
  },
  // Teddiursa 216
  teddiursa: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      if (context.skipping_booster && !context.blueprint) {
        card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.mult > 0) {
        return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult, card };
      }
      return scaling_evo(self, card, context, 'j_poke_ursaring', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Ursaring 217
  ursaring: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_moonstone);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.skipping_booster) {
        if (!context.blueprint) card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          const _card = create_card('Item', G.consumeables, null, null, null, null, null);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.mult > 0) {
        return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult, card };
      }
      return item_evo(self, card, context, 'j_poke_ursaluna');
    },
  },
  // Slugma 218
  slugma: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, self.config.evo_rqmt, center.ability.extra.hands] };
    },
    calculate(self, card, context) {
      const r = slug_calc(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_magcargo', card.ability.extra.chips, self.config.evo_rqmt);
    },
  },
  // Magcargo 219
  magcargo: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.hands] };
    },
    calculate(self, card, context) { return slug_calc(card, context); },
  },
  // Swinub 220
  swinub: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'swinub');
      return { vars: [center.ability.extra.mult, center.ability.extra.money, num, dem, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && context.scoring_hand) {
        const r = stoneglass_mult(card, context);
        if (r) return r;
      }
      return level_evo(self, card, context, 'j_poke_piloswine');
    },
    calc_dollar_bonus(self, card) {
      if (pseudorandom_probability(card, 'swinub', card.ability.extra.num, card.ability.extra.dem, 'swinub')) {
        return ease_poke_dollars(card, '2swinub', card.ability.extra.money, true);
      }
      return undefined;
    },
  },
  // Piloswine 221
  piloswine: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'piloswine');
      return { vars: [center.ability.extra.mult, center.ability.extra.money, num, dem, Math.max(0, self.config.evo_rqmt - center.ability.extra.scored)] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && context.scoring_hand) {
        if (has_enhancement(context.other_card, 'm_stone') || has_enhancement(context.other_card, 'm_glass')) {
          card.ability.extra.scored = card.ability.extra.scored + 1;
        }
        const r = stoneglass_mult(card, context);
        if (r) return r;
      }
      return scaling_evo(self, card, context, 'j_poke_mamoswine', card.ability.extra.scored, self.config.evo_rqmt);
    },
    calc_dollar_bonus(self, card) {
      if (pseudorandom_probability(card, 'piloswine', card.ability.extra.num, card.ability.extra.dem, 'piloswine')) {
        return ease_poke_dollars(card, '2piloswine', card.ability.extra.money, true);
      }
      return undefined;
    },
  },
  // Corsola 222
  corsola: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'basic' });
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.mult_mod * center.ability.extra.corsola_tally] };
    },
    update(self, card) {
      if (G.playing_cards) {
        card.ability.extra.corsola_tally = 0;
        for (const v of G.playing_cards) if (!is_base(v)) card.ability.extra.corsola_tally = card.ability.extra.corsola_tally + 1;
      }
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let enhanced = 0;
        for (const v of context.scoring_hand) if (!is_base(v)) enhanced = enhanced + 1;
        if (enhanced === 5) {
          if ((G.jokers.cards.length + G.GAME.joker_buffer) < G.jokers.config.card_limit) {
            G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
            G.E_MANAGER.add_event(() => {
              G.GAME.joker_buffer = 0;
              play_sound('timpani');
              const _card = create_random_poke_joker('corsola', 'Basic', null, null, 'Water');
              _card.add_to_deck();
              G.jokers.emplace(_card);
            });
          }
        }
        if (card.ability.extra.corsola_tally > 0) {
          const m = card.ability.extra.mult_mod * card.ability.extra.corsola_tally;
          return { message: a_mult(m), colour: 'MULT', mult_mod: m };
        }
      }
      return undefined;
    },
  },
  // Remoraid 223
  remoraid: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.retriggers, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES, true);
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_played === 0) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return level_evo(self, card, context, 'j_poke_octillery');
    },
  },
  // Octillery 224
  octillery: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.retriggers, ex.card_max, ex.card_max - ex.cards] };
    },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint && context.joker_main) {
        let has_eight = null;
        for (const v of context.scoring_hand) if (v.get_id() === 8) has_eight = true;
        if (!has_eight) faint(card);
      }
      return undefined;
    },
  },
  // Delibird 225
  delibird: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'deli_gift' });
      if (detailed()) {
        if (!center.edition || !center.edition.polychrome) info_queue.push(P_CENTERS.e_polychrome);
        info_queue.push({ key: 'tag_coupon', set: 'Tag' });
        info_queue.push(P_CENTERS.j_gift);
      }
      return { vars: [] };
    },
    calc_dollar_bonus(self, card) {
      const gift = pseudorandom(pseudoseed('delibird'));
      let ret;
      if (gift > 0.65) {
        ret = 8;
      } else if (gift > 0.35) {
        // create item
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          const _card = create_card('Item', G.consumeables, null, null, null, null, null);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
        }
      } else if (gift > 0.15) {
        // create coupon tag
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_coupon'));
          play_sound('generic1', 0.9, 0.8);
          play_sound('holo1', 1.2, 0.4);
        });
      } else if (G.jokers.cards.length < G.jokers.config.card_limit) {
        // create polychrome gift card
        const new_card = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_gift', no_edition: true });
        new_card.set_edition({ polychrome: true }, true);
        new_card.add_to_deck();
        G.jokers.emplace(new_card);
      }
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_gift_ex'), colour: 'GREEN' });
      return ret;
    },
  },
  // Mantine 226
  mantine: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      if (context.individual && !context.end_of_round && (context.cardarea === G.play || context.cardarea === G.hand)) {
        if (has_enhancement(context.other_card, 'm_gold')) {
          card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
          return { card, colour: 'CHIPS', message: localize('k_upgrade_ex') };
        }
      }
      return undefined;
    },
  },
  // Skarmory 227
  skarmory: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      hazard_tip(info_queue, abbr);
      if (detailed()) info_queue.push(P_CENTERS.m_steel);
      let hazard_count = 0;
      if (G.hand && G.hand.cards && G.hand.cards.length > 0) {
        for (const c of G.hand.cards) if (has_enhancement(c, 'm_poke_hazard') || has_enhancement(c, 'm_steel')) hazard_count = hazard_count + 1;
      }
      return { vars: [abbr.hazards, abbr.Xmult_mod, 1 + abbr.Xmult_mod * hazard_count] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) poke_set_hazards(card.ability.extra.hazards);
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let hazard_count = 0;
        if (G.hand && G.hand.cards && G.hand.cards.length > 0) {
          for (const c of G.hand.cards) if (has_enhancement(c, 'm_poke_hazard') || has_enhancement(c, 'm_steel')) hazard_count = hazard_count + 1;
        }
        const Xmult = 1 + card.ability.extra.Xmult_mod * hazard_count;
        if (Xmult > 1) return { message: a_xmult(Xmult), colour: 'XMULT', Xmult_mod: Xmult };
      }
      return undefined;
    },
  },
  // Houndour 228
  houndour: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.rounds, center.ability.extra.discards] };
    },
    calculate(self, card, context) {
      hound_calc(card, context, card.ability.extra.discards);
      return level_evo(self, card, context, 'j_poke_houndoom');
    },
  },
  // Houndoom 229
  houndoom: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); mega_tip(info_queue); return { vars: [center.ability.extra.mult_mod] }; },
    calculate(self, card, context) { return hound_calc(card, context, undefined); },
  },
  // Mega Houndoom 229-1
  mega_houndoom: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      if (context.pre_discard && !context.hook && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        return { message: localize('k_upgrade_ex'), colour: 'XMULT' };
      }
      if (context.post_discard && !context.recursive && !context.blueprint) hound_post_discard(card, undefined);
      if (context.first_hand_drawn) card.ability.extra.oXmult = card.ability.extra.Xmult;
      if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.oXmult;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
  // Kingdra 230
  kingdra: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.mult, ex.mult_mod, ex.Xmult, ex.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && !context.blueprint) {
        if (context.other_card.get_id() === 6) {
          let has_king = false;
          for (const c of G.hand.cards) if (c.get_id() === 13) { has_king = true; break; }
          if (has_king) card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
          else card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize('poke_twister_ex'), colour: 'XMULT', mult_mod: card.ability.extra.mult, Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
  // Phanpy 231
  phanpy: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return phanpy_calc(card, context) || level_evo(self, card, context, 'j_poke_donphan'); },
  },
  // Donphan 232
  donphan: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] }; },
    calculate(self, card, context) { return phanpy_calc(card, context); },
  },
  // Porygon2 233
  porygon2: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_dubious_disc);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.open_booster && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        const forced_key = matching_energy(G.jokers.cards[0], true);
        if (forced_key === 'c_poke_bird_energy') poke_evolve(card, 'j_poke_porygonz');
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          const c = create_card('Energy', G.consumeables, null, null, null, null, forced_key);
          c.add_to_deck();
          G.consumeables.emplace(c);
          G.GAME.consumeable_buffer = 0;
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_plus_energy'), colour: 'pink' });
      }
      return item_evo(self, card, context, 'j_poke_porygonz');
    },
    add_to_deck(self, card) {
      if (!G.GAME.energy_plus) G.GAME.energy_plus = 2;
      else G.GAME.energy_plus = G.GAME.energy_plus + 2;
    },
    remove_from_deck(self, card) {
      if (!G.GAME.energy_plus) G.GAME.energy_plus = 0;
      else G.GAME.energy_plus = G.GAME.energy_plus - 2;
    },
  },
  // Stantler 234
  stantler: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.scry, Math.max(0, self.config.evo_rqmt - center.ability.extra.triggered)] };
    },
    calculate(self, card, context) {
      if (!context.end_of_round && context.scoring_hand) {
        if (context.individual && context.cardarea === G.scry_view && !context.other_card.debuff) {
          let highest = null, highest_card = null;
          for (const v of G.scry_view.cards) {
            if (!has_no_suit(v)) {
              if (highest === null) { highest = v.base.id; highest_card = v; }
              if (v.base.id > highest) { highest = v.base.id; highest_card = v; }
            }
          }
          if (highest_card && context.other_card === highest_card) {
            if (!context.blueprint) card.ability.extra.triggered = card.ability.extra.triggered + 1;
            const Mult = highest_card.base.nominal;
            return { message: a_mult(Mult), message_card: context.other_card, colour: 'MULT', mult_mod: Mult, card };
          }
        }
      }
      return scaling_evo(self, card, context, 'j_poke_wyrdeer', card.ability.extra.triggered, self.config.evo_rqmt);
    },
    add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
    remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
  },
  // Smeargle 235
  smeargle: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Joker', key: 'j_smeared', config: {} });
        info_queue.push({ set: 'Other', key: 'sketch', vars: [] });
      }
      // (generate_ui: the copied joker's tooltip + the compatible/incompatible badge.)
      const copy = smeargle_target(center);
      if (copy) info_queue.push({ set: 'Joker', key: copy.config.center.key, name: copy.config.center.name });
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && card.ability.blueprint_compat === 'compatible' && G.jokers.cards[G.jokers.cards.length - 1] !== card && !card.getting_sliced) {
        let found_pos = 0; // 1-based like the Lua
        for (let i = 1; i <= G.jokers.cards.length; i++) if (G.jokers.cards[i - 1] === card) found_pos = i + 1;
        if (G.jokers.cards[found_pos - 1]) {
          card.smeargle_copy_joker = G.jokers.cards[found_pos - 1];
          card.ability.extra.copy_pos = found_pos;
        }
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_copied_ex') });
      }
      const other_joker = card.ability.extra.copy_pos > 0 ? G.jokers.cards[card.ability.extra.copy_pos - 1] : undefined;
      if (other_joker && other_joker !== card && !context.no_blueprint) {
        context.blueprint = (context.blueprint || 0) + 1;
        context.blueprint_card = context.blueprint_card || card;
        if (context.blueprint > G.jokers.cards.length + 1) return undefined;
        const other_joker_ret = other_joker.calculate_joker(context);
        context.blueprint = undefined;
        const eff_card = context.blueprint_card || card;
        context.blueprint_card = undefined;
        if (other_joker_ret) {
          other_joker_ret.card = eff_card;
          other_joker_ret.colour = 'BLACK';
          return other_joker_ret;
        }
      }
      return undefined;
    },
    update(self, card) {
      const at = (pos) => (pos > 0 ? G.jokers.cards[pos - 1] : undefined);
      if (card.smeargle_copy_joker && card.smeargle_copy_joker !== at(card.ability.extra.copy_pos)) {
        let found = null;
        for (let i = 1; i <= G.jokers.cards.length; i++) {
          if (card.smeargle_copy_joker === G.jokers.cards[i - 1]) { card.ability.extra.copy_pos = i; found = true; break; }
        }
        if (!found) { card.smeargle_copy_joker = undefined; card.ability.extra.copy_pos = 0; }
      }
      // Resume (Lua `load` -> has_loaded): re-resolve the copied joker from copy_pos.
      if (!card.smeargle_copy_joker && card.ability.extra.copy_pos > 0) card.smeargle_copy_joker = at(card.ability.extra.copy_pos);
      if (G.jokers && card.area === G.jokers) {
        let found_pos = 0;
        for (let i = 1; i <= G.jokers.cards.length; i++) if (G.jokers.cards[i - 1] === card) found_pos = i + 1;
        const right_joker = at(found_pos);
        card.ability.blueprint_compat = (right_joker && right_joker !== card && !right_joker.debuff && right_joker.config.center.blueprint_compat && 'compatible') || 'incompatible';
      }
    },
    add_to_deck(self, card) { card.smeargle_copy_joker = undefined; },
  },
  // Tyrogue 236
  tyrogue: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'baby' });
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          faint_baby_poke(self, card, context);
          return { message: a_xmult(card.ability.extra.Xmult_minus), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
        }
        if (context.after && !context.blueprint && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && context.full_hand && context.full_hand.length === 5) {
          const [target] = pseudorandom_element(context.full_hand, pseudoseed('tyrogue'));
          const copy = copy_card(target, null, null, G.playing_card);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          G.hand.emplace(copy);
          G.E_MANAGER.add_event(() => copy.start_materialize());
          playing_card_joker_effects([copy]);
          return { message: localize('k_copied_ex'), colour: 'CHIPS', card, playing_cards_created: [true] };
        }
      }
      if (context.discard && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && context.full_hand && context.full_hand.length === 5) {
        // (Lua keeps the Card itself in ability.extra; Micatro keeps its sort_id — ability tables are serialised.)
        if (!card.ability.extra.destroyed_card) card.ability.extra.destroyed_card = pseudorandom_element(context.full_hand, pseudoseed('tyrogue'))[0].sort_id;
        if (context.other_card.sort_id === card.ability.extra.destroyed_card) return { delay: 0.45, remove: true, card };
      }
      if (context.first_hand_drawn && !context.blueprint) {
        card.ability.extra.destroyed_card = undefined;
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0 && !G.RESET_JIGGLES, true);
      }
      let forced_key;
      if (G.playing_cards.length > G.GAME.starting_deck_size) forced_key = 'j_poke_hitmonchan';
      else if (G.playing_cards.length < G.GAME.starting_deck_size) forced_key = 'j_poke_hitmonlee';
      else forced_key = 'j_poke_hitmontop';
      return level_evo(self, card, context, forced_key);
    },
  },
  // Hitmontop 237
  hitmontop: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, G.GAME ? G.GAME.starting_deck_size : 52, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      if (context.setting_blind && G.playing_cards.length === G.GAME.starting_deck_size && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
      }
      return undefined;
    },
  },
  // Smoochum 238
  smoochum: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push({ set: 'Other', key: 'baby' }); info_queue.push({ key: 'tag_standard', set: 'Tag' }); }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) { return baby_calc(self, card, context) || baby_tag_evo(self, card, context, 'j_poke_jynx', 'tag_standard'); },
  },
  // Elekid 239
  elekid: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push({ set: 'Other', key: 'baby' }); info_queue.push({ key: 'tag_coupon', set: 'Tag' }); }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) { return baby_calc(self, card, context) || baby_tag_evo(self, card, context, 'j_poke_electabuzz', 'tag_coupon'); },
  },
  // Magby 240
  magby: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'baby' });
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.d_size, center.ability.extra.rounds] };
    },
    calculate(self, card, context) { return baby_calc(self, card, context) || level_evo(self, card, context, 'j_poke_magmar'); },
    add_to_deck(self, card) {
      G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size;
      ease_discard(card.ability.extra.d_size);
    },
    remove_from_deck(self, card) {
      G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size;
      ease_discard(-card.ability.extra.d_size);
    },
  },
}, FILE);
