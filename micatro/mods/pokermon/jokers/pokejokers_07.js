// Pokermon 3.2.1 — pokemon/pokejokers_07.lua (Pokédex 181-210: Ampharos -> Granbull), 33 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req, megas, volatile, custom_pool_func) comes from data.js. See ../PORTING.md.
// Rules that live in systems: Aipom's 3-card straights/flushes (rules.js straight_min /
// flush_min), Unown's $0 sell value (rules.js set_cost), Unown's form (anim.js view data).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, poll_edition,
  ease_discard, ease_hands_played, level_up_hand, juice_card_until, next, get_poker_hand_info,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, ease_poke_dollars,
  get_probability_vars, pseudorandom_probability, find_pokemon_type, has_enhancement, poke_is_odd,
  is_type, apply_type_sticker, find_other_poke_or_energy_type, find_card, any, poke_change_poli_suit,
  poke_convert_cards_to, remove, volatile_active, get_poke_target_card_ranks, add_target_cards_to_vars,
  change_play_limit, change_discard_limit,
} from '../api.js';

const FILE = 'pokemon/pokejokers_07.lua';

// ------------------------------------------------------------ shared bodies
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
const ALL_HANDS = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Five of a Kind', 'Flush House', 'Flush Five'];
const visible_hands = () => ALL_HANDS.filter((h) => G.GAME.hands[h] && G.GAME.hands[h].visible);

/** Hoppip line: on discard, the first `n` discarded cards (all when n is undefined) become Wild; it hops away. */
function hop_calc(self, card, context, n, msg) {
  if (context.pre_discard && context.full_hand && context.full_hand.length > 0 && !context.hook) {
    const target = (n === undefined ? context.full_hand : context.full_hand.slice(0, n)).filter((v) => v);
    poke_convert_cards_to(target, { mod_conv: 'm_wild' });
    G.E_MANAGER.add_event(() => { remove(self, card, context, true); });
    return { message: localize(msg) };
  }
  return undefined;
}
function hop_vars(self, info_queue, center, with_rounds) {
  type_tooltip(self, info_queue, center);
  if (detailed()) info_queue.push(P_CENTERS.m_wild);
  return { vars: with_rounds ? [center.ability.extra.h_size, center.ability.extra.rounds] : [center.ability.extra.h_size] };
}
/** Wooper / Quagsire: +mult, -mult_mod per face card left in the deck. */
function quag_mult(center) {
  let Mult = center.ability.extra.mult;
  if (G.deck && G.deck.cards) for (const v of G.deck.cards) if (v.is_face()) Mult = Mult - center.ability.extra.mult_mod;
  return Mult;
}
function quag_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    const Mult = quag_mult(card);
    if (Mult > 0) return { message: a_mult(Mult), colour: 'MULT', mult_mod: Mult };
  }
  return undefined;
}
/** Pineco / Forretress: explode (faint for the round) for chips while leftmost. */
function explode(card) {
  G.E_MANAGER.add_event(() => { card.ability.fainted = G.GAME.round; card.set_debuff(); });
}
/** Snubbull / Granbull: the first scoring face card. */
function first_face(scoring_hand) {
  for (const c of scoring_hand) if (c.is_face()) return c;
  return undefined;
}
const volatile_tip = (info_queue, center) => { if (detailed()) info_queue.push({ set: 'Other', key: 'poke_volatile_' + center.ability.extra.volatile }); };

defineJokers({
  // Ampharos 181
  ampharos: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'mega_poke' });
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult > 0 && card.ability.extra.Xmult !== 1) {
          return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      if (context.playing_card_added && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
      }
      return undefined;
    },
  },
  // Mega Ampharos 181-1
  mega_ampharos: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, G.deck ? Math.ceil(G.deck.cards.length / 2) : 0] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blueprint) {
        if (G.hand.config.card_limit < Math.ceil(G.deck.cards.length / 2)) {
          const increase = Math.ceil(G.deck.cards.length / 2) - G.hand.config.card_limit;
          G.hand.change_size(increase);
          G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + increase;
        }
        ease_discard(-G.GAME.current_round.discards_left, null, true);
        if (G.GAME.blind.name !== 'The Needle') ease_hands_played(-G.GAME.current_round.hands_left + 1);
      }
      if (context.joker_main && card.ability.extra.Xmult > 0 && card.ability.extra.Xmult !== 1) {
        return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
  // Bellossom 182
  bellossom: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        if (!center.edition || !center.edition.polychrome) info_queue.push(P_CENTERS.e_polychrome);
        if (!center.edition || !center.edition.foil) info_queue.push(P_CENTERS.e_foil);
        if (!center.edition || !center.edition.holo) info_queue.push(P_CENTERS.e_holo);
        info_queue.push(P_CENTERS.m_wild);
      }
      return { vars: [center.ability.extra.mult] };
    },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        const odds = [];
        for (const v of context.scoring_hand) {
          const upgrade = pseudorandom(pseudoseed('bellossom'));
          if (poke_is_odd(v) && upgrade > 0.50 && !v.edition) {
            odds.push(v);
            if (v.ability.name === 'Wild Card' && !v.edition) {
              const edition = poll_edition('aura', null, true, true);
              v.set_edition(edition, true, true);
            }
            v.set_ability(P_CENTERS.m_wild, null, true);
            G.E_MANAGER.add_event(() => { v.juice_up(); });
          } else {
            v.bellossom_score = true;
          }
        }
        if (odds.length > 0) return { message: localize('poke_petal_dance_ex'), colour: 'MULT', card };
      }
      if (context.after && context.cardarea === G.jokers && !context.blueprint) {
        for (const v of context.scoring_hand) if (v.bellossom_score) v.bellossom_score = undefined;
      }
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff) {
        if (poke_is_odd(context.other_card) && context.other_card.bellossom_score) return { mult: card.ability.extra.mult, card };
      }
      return undefined;
    },
  },
  // Marill 183
  marill: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push(P_CENTERS.m_bonus);
      return { vars: [Math.max(0, self.config.evo_rqmt - card.ability.extra.bonus_scored), card.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
        if (has_enhancement(context.other_card, 'm_bonus')) card.ability.extra.bonus_scored = card.ability.extra.bonus_scored + 1;
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let enhanced, unenhanced;
        for (const v of context.scoring_hand) {
          if (v.config.center === P_CENTERS.c_base) unenhanced = true;
          else enhanced = true;
        }
        if (enhanced && unenhanced) return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      return scaling_evo(self, card, context, 'j_poke_azumarill', card.ability.extra.bonus_scored, self.config.evo_rqmt);
    },
  },
  // Azumarill 184
  azumarill: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push(P_CENTERS.m_bonus);
      return { vars: [card.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let Xmult = card.ability.extra.Xmult;
        let bonus, unbonus;
        for (const v of context.scoring_hand) {
          if (has_enhancement(v, 'm_bonus')) bonus = true;
          else unbonus = true;
        }
        if (bonus && unbonus) Xmult = Xmult * 2;
        return { message: a_xmult(Xmult), colour: 'XMULT', Xmult_mod: Xmult };
      }
      return undefined;
    },
  },
  // Sudowoodo 185
  sudowoodo: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play) {
        if (context.other_card.is_face()) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      if (context.repetition && context.cardarea === G.hand && (next(context.card_effects[0]) || context.card_effects.length > 1) && context.other_card.is_face()) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Weird Tree (Sudowoodo's disguise; transforms once it isn't Grass or you have a Water type)
  weird_tree: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'typechangerpoke', vars: ['Grass Type'], colours: ['grass'] });
      return { vars: [] };
    },
    calculate(self, card, context) {
      return scaling_evo(self, card, context, 'j_poke_sudowoodo',
        ((!is_type(card, 'Grass')) || find_other_poke_or_energy_type(card, 'Water', true) > 0) ? 1 : 0, 1, localize('poke_transform_success'));
    },
    set_ability(self, card, initial) {
      if (initial) apply_type_sticker(card, 'Grass');
    },
    in_pool(self) {
      return !(any(find_card('j_poke_sudowoodo')) || any(find_card('j_poke_bonsly')));
    },
  },
  // Politoed 186
  politoed: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const suit = (G.GAME && G.GAME.poke_poli_suit) || 'Spades';
      return {
        vars: [center.ability.extra.mult, localize(suit, 'suits_singular'), localize('Spades', 'suits_plural'), localize('Hearts', 'suits_plural'),
          localize('Clubs', 'suits_plural'), localize('Diamonds', 'suits_plural'), find_pokemon_type('Water').length],
        colours: [suit],
      };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && !context.blueprint) {
          poke_change_poli_suit();
          G.GAME.poke_poli_suit_change_triggered = true;
        }
        if (context.after && G.GAME.poke_poli_suit_change_triggered) G.GAME.poke_poli_suit_change_triggered = false;
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
        const scoring_suit = G.GAME.poke_poli_suit || 'Spades';
        if (context.other_card.is_suit(scoring_suit)) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult: card.ability.extra.mult, card };
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play) {
        const scoring_suit = G.GAME.poke_poli_suit || 'Spades';
        if (context.other_card.is_suit(scoring_suit)) {
          const total = find_pokemon_type('Water').length;
          const cards = context.scoring_hand.length;
          let pos;
          for (let i = 1; i <= context.scoring_hand.length; i++) {
            if (context.scoring_hand[i - 1] === context.other_card) { pos = i; break; }
          }
          let retriggers = Math.floor(total / cards);
          const remainder = total % cards;
          if (pos <= remainder) retriggers = retriggers + 1;
          return { message: localize('k_again_ex'), repetitions: retriggers, card };
        }
      }
      return undefined;
    },
  },
  // Hoppip 187
  hoppip: {
    loc_vars(self, info_queue, center) { return hop_vars(self, info_queue, center, true); },
    calculate(self, card, context) { return hop_calc(self, card, context, 2, 'poke_hop_ex') || level_evo(self, card, context, 'j_poke_skiploom'); },
    ...hand_size,
  },
  // Skiploom 188
  skiploom: {
    loc_vars(self, info_queue, center) { return hop_vars(self, info_queue, center, true); },
    calculate(self, card, context) { return hop_calc(self, card, context, 3, 'poke_skip_ex') || level_evo(self, card, context, 'j_poke_jumpluff'); },
    ...hand_size,
  },
  // Jumpluff 189
  jumpluff: {
    loc_vars(self, info_queue, center) { return hop_vars(self, info_queue, center, false); },
    calculate(self, card, context) { return hop_calc(self, card, context, undefined, 'poke_jump_ex'); },
    ...hand_size,
  },
  // Aipom 190 (-2 play / discard limit; 3-card straights and flushes: systems/rules.js)
  aipom: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const straights_remaining = Math.max(0, self.config.straight_rqmt - center.ability.extra.straights_played);
      const flushes_remaining = Math.max(0, self.config.flush_rqmt - center.ability.extra.flushes_played);
      return { vars: [straights_remaining, flushes_remaining, center.ability.extra.limit] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        if (context.poker_hands.Straight.length) card.ability.extra.straights_played = card.ability.extra.straights_played + 1;
        if (context.poker_hands.Flush.length) card.ability.extra.flushes_played = card.ability.extra.flushes_played + 1;
      }
      // (Lua caps the flush count with straight_rqmt too — both are 5.)
      return scaling_evo(self, card, context, 'j_poke_ambipom', Math.min(self.config.straight_rqmt, card.ability.extra.straights_played)
        + Math.min(self.config.straight_rqmt, card.ability.extra.flushes_played), self.config.straight_rqmt + self.config.flush_rqmt);
    },
    add_to_deck(self, card) {
      change_play_limit(-card.ability.extra.limit);
      change_discard_limit(-card.ability.extra.limit);
    },
    remove_from_deck(self, card) {
      change_play_limit(card.ability.extra.limit);
      change_discard_limit(card.ability.extra.limit);
      if (!G.GAME.before_play_buffer) G.hand.unhighlight_all();
    },
  },
  // Sunkern 191
  sunkern: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_sunstone);
      return { vars: [card.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.setting_blind || context.joker_main) {
        const earned = ease_poke_dollars(card, 'sunkern', card.ability.extra.money, true);
        return { dollars: earned, card };
      }
      return item_evo(self, card, context, 'j_poke_sunflora');
    },
  },
  // Sunflora 192
  sunflora: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.money] }; },
    calculate(self, card, context) {
      if (context.setting_blind || context.joker_main || context.pre_discard || context.using_consumeable) {
        const earned = ease_poke_dollars(card, 'sunflora', card.ability.extra.money, true);
        return { dollars: earned, card };
      }
      return undefined;
    },
    calc_dollar_bonus(self, card) { return ease_poke_dollars(card, 'sunflora', card.ability.extra.money, true); },
  },
  // Yanma 193
  yanma: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      const [num, dem] = get_probability_vars(center, ex.num, ex.dem, 'yanma');
      return { vars: [ex.mult, ex.chips, ex.mult2, ex.chips2, num, dem, Math.max(0, self.config.evo_rqmt - ex.scored)] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play) {
        if (context.other_card.get_id() === 3 || context.other_card.get_id() === 6) {
          if (!context.blueprint) card.ability.extra.scored = card.ability.extra.scored + 1;
          let Mult = card.ability.extra.mult;
          let Chips = card.ability.extra.chips;
          if (pseudorandom_probability(card, 'yanma', card.ability.extra.num, card.ability.extra.dem, 'yanma')) {
            Mult = card.ability.extra.mult2;
            Chips = card.ability.extra.chips2;
          }
          return { mult: Mult, chips: Chips, card };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_yanmega', card.ability.extra.scored, self.config.evo_rqmt);
    },
  },
  // Wooper 194
  wooper: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.rounds, center.ability.extra.mult_mod, Math.max(0, quag_mult(center))] };
    },
    calculate(self, card, context) { return quag_calc(card, context) || level_evo(self, card, context, 'j_poke_quagsire'); },
  },
  // Quagsire 195 (the Lua level_evo targets itself and it has no `rounds`: a no-op)
  quagsire: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, Math.max(0, quag_mult(center)), center.ability.extra.rerolls] };
    },
    calculate(self, card, context) { return quag_calc(card, context) || level_evo(self, card, context, 'j_poke_quagsire'); },
  },
  // Espeon 196
  espeon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const cr = (G.GAME && G.GAME.current_round) || {};
      return {
        vars: [center.ability.extra.retriggers, center.ability.extra.Xmult_multi, localize(cr.espeon_rank || 'Ace', 'ranks'), localize(cr.espeon_suit || 'Spades', 'suits_singular')],
        colours: [cr.espeon_suit || 'Spades'],
      };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(G.GAME.current_round.espeon_suit)) {
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      if (context.repetition && context.cardarea === G.play && !context.end_of_round && context.other_card.get_id() === G.GAME.current_round.espeon_id) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Umbreon 197
  umbreon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hand_played ? localize(center.ability.extra.hand_played, 'poker_hands') : localize('poke_none')] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
        // cycle hand_name
        const vis = visible_hands();
        for (let j = 0; j < vis.length; j++) {
          if (vis[j] === card.ability.extra.hand_played) {
            card.ability.extra.hand_played = j === vis.length - 1 ? vis[0] : vis[j + 1];
            break;
          }
        }
      }
      if (context.pre_discard && !context.blueprint && !context.hook) {
        const { text } = get_poker_hand_info(G.hand.highlighted);
        const can_level = G.GAME.hands[card.ability.extra.hand_played].level > 1;
        if (can_level && G.GAME.hands[card.ability.extra.hand_played] === G.GAME.hands[text]) {
          level_up_hand(card, card.ability.extra.hand_played, null, -1);
          let highest_played = 0;
          let highest_hands = [];
          for (const [handname, values] of Object.entries(G.GAME.hands)) {
            if (values.visible) {
              if (values.played > highest_played) {
                highest_hands = [handname];
                highest_played = values.played;
              } else if (values.played === highest_played) {
                highest_hands.push(handname);
              }
            }
          }
          const target = pseudorandom_element(highest_hands, pseudoseed('umbreon'))[0];
          return { level_up: true, level_up_hand: target };
        }
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial && G.GAME && G.GAME.hands) card.ability.extra.hand_played = pseudorandom_element(visible_hands(), pseudoseed('umbreon'))[0];
    },
  },
  // Murkrow 198
  murkrow: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, Math.max(1, 1 + center.ability.extra.Xmult * find_pokemon_type('Dark').length)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const Xmult = Math.max(1, 1 + card.ability.extra.Xmult * find_pokemon_type('Dark').length);
        if (Xmult > 1) return { message: a_xmult(Xmult), colour: 'XMULT', Xmult_mod: Xmult };
      }
      return item_evo(self, card, context, 'j_poke_honchkrow');
    },
  },
  // Slowking 199
  slowking: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult_multi, center.ability.extra.Xmult_multi2] }; },
    calculate(self, card, context) {
      if (context.first_hand_drawn) card.ability.extra.oXmult = card.ability.extra.Xmult_multi;
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint) {
          card.ability.extra.Xmult_multi = card.ability.extra.Xmult_multi + card.ability.extra.Xmult_multi2;
          return { message: localize('k_upgrade_ex'), colour: 'XMULT' };
        }
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && context.other_card.get_id() === 13) {
        return { x_mult: card.ability.extra.Xmult_multi, colour: 'RED', card };
      }
      if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        card.ability.extra.Xmult_multi = card.ability.extra.oXmult;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
  // Misdreavus 200
  misdreavus: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.chip_mod, card.ability.extra.chips] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card) {
        const oc = context.other_card;
        if (!oc.debuff && oc.is_face()) {
          oc.ability.nominal_drain = oc.ability.nominal_drain || 0;
          oc.ability.perma_bonus = oc.ability.perma_bonus || 0;
          let drained_vals = Math.min(card.ability.extra.chip_mod, oc.base.nominal - oc.ability.nominal_drain - 1);
          if (drained_vals > 0) oc.ability.nominal_drain = oc.ability.nominal_drain + drained_vals;
          const drain_bonus = Math.min(oc.ability.bonus + oc.ability.perma_bonus, card.ability.extra.chip_mod - drained_vals);
          if (drain_bonus > 0) {
            oc.ability.perma_bonus = oc.ability.perma_bonus - drain_bonus;
            drained_vals = drained_vals + drain_bonus;
          }
          if (drained_vals > 0) {
            card.ability.extra.chips = card.ability.extra.chips + drained_vals;
            return {
              message: localize('k_eroded_ex'),
              colour: 'CHIPS',
              card: oc,
              extra: { func() { card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') }); } },
            };
          }
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      return item_evo(self, card, context, 'j_poke_mismagius');
    },
  },
  // Unown 201
  unown: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'nature', vars: ['rank'] });
      const card_vars = [center.ability.extra.mult];
      add_target_cards_to_vars(card_vars, center.ability.extra.targets);
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          let score;
          for (const v of context.scoring_hand) if (v.get_id() === card.ability.extra.targets[0].id) score = true;
          if (score) {
            card.ability.extra.triggered = true;
            return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
          }
        }
        if (context.after && card.ability.extra.triggered && any(find_card('j_poke_ruins_of_alph')) && !context.blueprint) {
          G.E_MANAGER.add_event(() => { remove(self, card, context); });
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        G.E_MANAGER.add_event(() => { remove(self, card, context); });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_flees_ex') });
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) {
        let form = 'A';
        const forms = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
          'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'ZEx', 'ZQu'];
        if (G.jokers && G.jokers.cards) {
          for (const v of G.jokers.cards) {
            if (v.config.center.name === 'unown') {
              const i = forms.indexOf(v.ability.extra.form);
              if (i >= 0) forms.splice(i, 1);
            }
            if (v.config.center.name === 'ruins_of_alph') {
              const have = Object.values((v.ability.extra && v.ability.extra.forms) || {});
              for (let i = forms.length - 1; i >= 0; i--) if (have.includes(forms[i])) forms.splice(i, 1);
            }
          }
        }
        if (forms.length > 0) form = pseudorandom_element(forms, pseudoseed('unown'))[0];
        card.ability.extra.form = form;
        // (set_sprites: the form is exposed to the UI through systems/anim.js view data.)
        card.ability.extra.targets = get_poke_target_card_ranks('unown', 1, card.ability.extra.targets);
      }
    },
  },
  // Wobbuffet 202
  wobbuffet: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'poke_volatile_' + center.ability.extra.volatile });
        info_queue.push({ key: 'eternal', set: 'Other' });
      }
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blueprint && volatile_active(self, card, card.ability.extra.volatile)) {
        const target = G.jokers.cards[G.jokers.cards.length - 1];
        if (target !== card && !(target.ability.eternal || target.ability.perishable) && target.config.center.eternal_compat) {
          target.set_eternal(true);
          card.juice_up();
          card_eval_status_text(target, 'extra', null, null, null, { message: localize('poke_shadow_tag_ex'), colour: 'DARK_EDITION' });
        }
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play) {
        const id = context.other_card.get_id();
        if (id === 6 || id === 7 || id === 8 || id === 9 || id === 10) {
          return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        }
      }
      return undefined;
    },
    update(self, card) {
      if (card.area === G.jokers) {
        const right_joker = G.jokers.cards[G.jokers.cards.length - 1];
        card.ability.blueprint_compat = (right_joker && right_joker !== card && !right_joker.debuff && right_joker.config.center.eternal_compat) ? 'compatible' : 'incompatible';
      }
    },
  },
  // Girafarig 203
  girafarig: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && context.poker_hands['Two Pair'].length && !context.blueprint) card.ability.extra.score = true;
        if (context.after) card.ability.extra.score = false;
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && card.ability.extra.score) {
        let first_face, last_face;
        for (let i = 0; i < context.scoring_hand.length; i++) {
          if (context.scoring_hand[i].is_face()) { first_face = context.scoring_hand[i]; break; }
        }
        for (let i = context.scoring_hand.length - 1; i >= 0; i--) {
          if (context.scoring_hand[i].is_face() && context.scoring_hand[i] !== first_face) { last_face = context.scoring_hand[i]; break; }
        }
        if (context.other_card === first_face || context.other_card === last_face) return { x_mult: card.ability.extra.Xmult_multi, colour: 'RED', card };
      }
      // Lua: consumeable.label == "Death" (the card's name).
      if (context.using_consumeable && context.consumeable.ability.name === 'Death') {
        if (G.hand && G.hand.highlighted && G.hand.highlighted.length > 1) {
          if (G.hand.highlighted[0].is_face() && G.hand.highlighted[1].is_face()) card.ability.extra.death_used = card.ability.extra.death_used + 1;
        }
      }
      return scaling_evo(self, card, context, 'j_poke_farigiraf', card.ability.extra.death_used, 1);
    },
  },
  // Pineco 204
  pineco: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); volatile_tip(info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && volatile_active(self, card, card.ability.extra.volatile)) {
        explode(card);
        return { message: localize('poke_explosion_ex'), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      return level_evo(self, card, context, 'j_poke_forretress');
    },
  },
  // Forretress 205
  forretress: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); volatile_tip(info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && volatile_active(self, card, card.ability.extra.volatile)) {
        let multiplier = 1;
        for (const v of G.hand.cards) if (has_enhancement(v, 'm_steel')) { multiplier = 2; break; }
        explode(card);
        return { message: localize('poke_explosion_ex'), colour: 'CHIPS', chip_mod: card.ability.extra.chips * multiplier };
      }
      return undefined;
    },
  },
  // Dunsparce 206
  dunsparce: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.reroll_shop && !context.blueprint) {
        card.ability.extra.rerolled = true;
        juice_card_until(card, () => !card.removed, true);
      }
      if (context.ending_shop && !context.blueprint && card.ability.extra.rerolled) {
        G.E_MANAGER.add_event(() => { remove(self, card, context, true); });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_screech_ex') });
      }
      return level_evo(self, card, context, 'j_poke_dudunsparce');
    },
  },
  // Gligar 207
  gligar: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const suit = G.GAME && G.GAME.current_round.gligar_suit;
      let played_Xmult = 1;
      if (G.hand) {
        let suit_count = 0;
        for (const c of G.hand.cards) if (c.is_suit(suit) && !c.highlighted) suit_count = suit_count + 1;
        played_Xmult = 1 + (card.ability.extra.Xmult_multi * suit_count);
      }
      return { vars: [card.ability.extra.Xmult_multi, localize(suit || 'Clubs', 'suits_singular'), played_Xmult], colours: [suit || 'Clubs'] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
        let suit_count = 0;
        for (const c of G.hand.cards) if (c.is_suit(G.GAME.current_round.gligar_suit)) suit_count = suit_count + 1;
        if (suit_count > 0) return { x_mult: 1 + (card.ability.extra.Xmult_multi * suit_count), card };
      }
      return item_evo(self, card, context, 'j_poke_gliscor');
    },
  },
  // Steelix 208
  steelix: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.m_stone);
        info_queue.push(P_CENTERS.m_steel);
        info_queue.push({ set: 'Other', key: 'mega_poke' });
      }
      return undefined;
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES, true);
      }
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        if (G.GAME.current_round.hands_played === 0) {
          const c = context.scoring_hand[0];
          c.set_ability(P_CENTERS.m_steel, null, true);
          G.E_MANAGER.add_event(() => { c.juice_up(); });
        }
      }
      if (context.individual && context.cardarea === G.hand && has_enhancement(context.other_card, 'm_stone') && !context.blueprint) {
        context.other_card.set_ability(P_CENTERS.m_steel, null, true);
        return { message: localize('poke_iron_tail_ex'), colour: 'metal', card };
      }
      return undefined;
    },
  },
  // Mega Steelix 208-1
  mega_steelix: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money, localize(center.ability.extra.suit, 'suits_singular'), localize(center.ability.extra.suit, 'suits_plural')] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.hand && has_enhancement(context.other_card, 'm_steel')
        && !context.other_card.is_suit(card.ability.extra.suit) && !context.blueprint) {
        context.other_card.change_suit(card.ability.extra.suit);
        context.other_card.set_ability(P_CENTERS.c_base, null, true);
        return { message: localize('poke_autotomize_ex'), colour: 'metal', card };
      }
      return undefined;
    },
    calc_dollar_bonus(self, card) {
      let diamond_tally = 0;
      for (const playing_card of G.playing_cards) if (playing_card.is_suit(card.ability.extra.suit)) diamond_tally = diamond_tally + 1;
      return diamond_tally > 0 ? card.ability.extra.money * diamond_tally : undefined;
    },
  },
  // Snubbull 209
  snubbull: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult_multi, card.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play) {
        if (context.other_card === first_face(context.scoring_hand)) return { x_mult: card.ability.extra.Xmult_multi, colour: 'RED' };
      }
      return level_evo(self, card, context, 'j_poke_granbull');
    },
  },
  // Granbull 210
  granbull: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult_multi, card.ability.extra.Xmult_multi2] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play) {
        if (context.other_card === first_face(context.scoring_hand)) {
          const Xmult = context.other_card.get_id() === 12 ? card.ability.extra.Xmult_multi2 : card.ability.extra.Xmult_multi;
          return { x_mult: Xmult, colour: 'RED' };
        }
      }
      return undefined;
    },
  },
}, FILE);
