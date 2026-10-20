// Pokermon 3.9.1 — pokemon/pokejokers_15.lua (Pokédex 421-450: Ambipom -> Lucario), 12 jokers + 3 new in 3.9.1.
// The 3 jokers 3.9.1 added to this file (Chingling, Bronzor, Bronzong) are at the end (new-jokers sub-batch 14; static data:
// data391.js new_jokers). Bronzor's card of the round: systems/rules.js reset_bronzo_card.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, megas) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
// Ambipom's 3-card Flushes / Straights live in systems/rules.js (straight_min / flush_min).
import {
  G, P_CENTERS, P_CARDS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, create_card,
  create_playing_card, playing_card_joker_effects, get_poker_hand_info,
  defineJokers, type_tooltip, detailed, level_evo, scaling_evo, faint_baby_poke, is_type, get_probability_vars, pseudorandom_probability,
  add_card,
  POKE_POOL_RULES,
} from '../api.js';

const FILE = 'pokemon/pokejokers_15.lua';

/** Baby Pokémon: X Mult below 1 (faints unless only Babies are to its right). */
function baby_xmult(self, card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.joker_main) {
      faint_baby_poke(self, card, context);
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_minus] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
    }
  }
  return undefined;
}
const end_of_round = (card, context) => context.end_of_round && !context.individual && !context.repetition && !card.debuff;
/** Bronzor / Bronzong: the round's card (systems/rules.js reset_bronzo_card; Ace of Spades before one is picked). */
const bronzo_round = () => (G.GAME && G.GAME.current_round) || {};
const bronzo_rank = () => localize(bronzo_round().bronzo_rank || 'Ace', 'ranks');
const bronzo_suit_key = () => bronzo_round().bronzo_suit || 'Spades';
const bronzo_suit = () => localize(bronzo_suit_key(), 'suits_singular');
/** Lopunny / Mega Lopunny: look at the top `scry` cards of the deck. */
const scry = {
  add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
  remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
};
/**
 * SMODS.poll_enhancement({options, guaranteed, key, type_key, mod}): Steamodded's weighted
 * enhancement roll (each option weighs its center's weight, 5 by default).
 */
function poll_enhancement(args = {}) {
  let key = args.key || 'std_enhance';
  const mod = args.mod || 1;
  const guaranteed = args.guaranteed || false;
  const options = args.options || Object.values(P_CENTERS).filter((c) => c.set === 'Enhanced' && !c.unported && (!c.in_pool || c.in_pool(c) !== false)).map((c) => c.key);
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  key = key + G.GAME.round_resets.ante;
  const available = [];
  let total_weight = 0;
  for (const v of options) {
    if (v === 'UNAVAILABLE') continue;
    const opt = typeof v === 'string' ? { key: v, weight: P_CENTERS[v].weight ?? 5 } : { key: v.key, weight: v.weight };
    if (opt.weight > 0) { available.push(opt); total_weight = total_weight + opt.weight; }
  }
  total_weight = total_weight + (total_weight / 40 * 60); // set base rate to 40%
  let type_weight = 0;
  for (const v of available) {
    v.weight = P_CENTERS[v.key].get_weight ? P_CENTERS[v.key].get_weight() : v.weight;
    type_weight = type_weight + v.weight;
  }
  const enhance_poll = pseudorandom(pseudoseed(key));
  if (enhance_poll > 1 - (type_weight * mod / total_weight) || guaranteed) {
    const type_poll = pseudorandom(pseudoseed(type_key));
    let weight_i = 0;
    for (const v of available) {
      weight_i = weight_i + v.weight;
      if (type_poll > 1 - (weight_i / type_weight)) return v.key;
    }
  }
  return undefined;
}

defineJokers({
  // Ambipom 424
  ambipom: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.limit] };
    },
  },
  // Buneary 427
  buneary: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const Mult = card.ability.extra.mult * Math.abs(context.scoring_hand.length - context.full_hand.length);
          if (Mult > 0) return { message: localize({ type: 'variable', key: 'a_mult', vars: [Mult] }), colour: 'MULT', mult_mod: Mult };
        }
      }
      return level_evo(self, card, context, 'j_poke_lopunny');
    },
  },
  // Lopunny 428
  lopunny: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'scry_cards' }); // (Pokermon 3.9.1: the Foresight tooltip, not the Mega one)
      return { vars: [center.ability.extra.mult, center.ability.extra.Xmult, center.ability.extra.scry] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const Mult = card.ability.extra.mult * Math.abs(context.scoring_hand.length - context.full_hand.length);
          let score_xmult;
          const found_ranks = {};
          for (const unscored_card of context.full_hand) {
            if (!context.scoring_hand.includes(unscored_card)) found_ranks[unscored_card.get_id()] = true;
          }
          for (const scry_card of G.scry_view.cards) {
            if (found_ranks[scry_card.get_id()]) { score_xmult = true; break; }
          }
          if (Mult > 0) {
            if (score_xmult) return { message: localize('poke_highjumpkick_ex'), colour: 'XMULT', mult_mod: Mult, Xmult_mod: card.ability.extra.Xmult };
            return { message: localize({ type: 'variable', key: 'a_mult', vars: [Mult] }), colour: 'MULT', mult_mod: Mult };
          }
        }
      }
      return undefined;
    },
    ...scry,
  },
  // Mega Lopunny 428-1
  mega_lopunny: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'scry_cards' });
      let hand = localize('poke_none');
      if (G.scry_view && G.scry_view.cards && G.scry_view.cards.length > 0) hand = get_poker_hand_info(G.scry_view.cards).text;
      return { vars: [center.ability.extra.scry, hand] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && G.scry_view && G.scry_view.cards && G.scry_view.cards.length > 0) {
          const { text } = get_poker_hand_info(G.scry_view.cards);
          const Xmult = G.GAME.hands[text].level;
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'XMULT', Xmult_mod: Xmult };
        }
      }
      return undefined;
    },
    ...scry,
  },
  // Mismagius 429
  mismagius: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'mismagius');
      return { vars: [card.ability.extra.chip_mod, card.ability.extra.chips, num, dem, card.ability.extra.chips2] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card) {
        const oc = context.other_card;
        if (!oc.debuff && oc.is_face()) {
          oc.ability.nominal_drain = oc.ability.nominal_drain || 0;
          oc.ability.perma_bonus = oc.ability.perma_bonus || 0;
          if (pseudorandom_probability(card, 'mismagius', card.ability.extra.num, card.ability.extra.dem, 'mismagius')) {
            oc.ability.perma_bonus = oc.ability.perma_bonus + card.ability.extra.chips2;
            return { message: localize('k_upgrade_ex'), colour: 'CHIPS', card: oc };
          }
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
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
        }
      }
      return undefined;
    },
  },
  // Honchkrow 430
  honchkrow: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.other_joker && is_type(context.other_joker, 'Dark')) {
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_multi] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
      }
      return undefined;
    },
  },
  // Bonsly 438
  bonsly: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'baby' });
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = baby_xmult(self, card, context);
      if (r) return r;
      if (end_of_round(card, context)) {
        const rank = pseudorandom_element(['J', 'Q', 'K'], pseudoseed('familiar_create'))[0];
        const suit = pseudorandom_element(['S', 'H', 'D', 'C'], pseudoseed('familiar_create'))[0];
        const enhancement = poll_enhancement({ options: ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_gold', 'm_lucky'], guaranteed: true });
        const created_card = create_playing_card({ front: P_CARDS[suit + '_' + rank], center: P_CENTERS[enhancement] }, G.deck, null, null, ['PURPLE']);
        playing_card_joker_effects([created_card]);
      }
      return level_evo(self, card, context, 'j_poke_sudowoodo');
    },
  },
  // Mime Jr. 439
  mimejr: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push({ key: 'red_seal', set: 'Other' });
        info_queue.push({ key: 'blue_seal', set: 'Other' });
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = baby_xmult(self, card, context);
      if (r) return r;
      if (end_of_round(card, context)) {
        const _card = pseudorandom_element(G.playing_cards, pseudoseed('mimejr'))[0];
        const seal_type = pseudorandom(pseudoseed('mimejr'));
        if (seal_type > 0.50) _card.set_seal('Red', true);
        else _card.set_seal('Blue', true);
        card.juice_up(0.5, 0.5);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_mime_ex'), colour: 'CHIPS' });
      }
      return level_evo(self, card, context, 'j_poke_mrmime');
    },
  },
  // Happiny 440
  happiny: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push(P_CENTERS.m_lucky);
      }
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'happiny');
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds, num, dem] };
    },
    calculate(self, card, context) {
      const r = baby_xmult(self, card, context);
      if (r) return r;
      if (context.end_of_round && !context.individual && !context.repetition && !context.post_trigger && !card.debuff) {
        let max = 1;
        if (pseudorandom_probability(card, 'happiny', card.ability.extra.num, card.ability.extra.dem, 'happiny')) max = max + 1;
        for (let i = 1; i <= max; i++) {
          const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_magician');
          _card.set_edition({ negative: true }, true);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
        }
      }
      return level_evo(self, card, context, 'j_poke_chansey');
    },
  },
  // Munchlax 446
  munchlax: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = baby_xmult(self, card, context);
      if (r) return r;
      if (end_of_round(card, context)) {
        const _card = create_card('Item', G.consumeables, null, null, null, null, null);
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
      return level_evo(self, card, context, 'j_poke_snorlax');
    },
  },
  // Riolu 447
  riolu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'baby' });
      if (detailed()) info_queue.push(P_CENTERS.c_aura);
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = baby_xmult(self, card, context);
      if (r) return r;
      if (end_of_round(card, context)) {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          const _card = create_card('Spectral', G.consumeables, null, null, null, null, 'c_aura');
          _card.add_to_deck();
          G.consumeables.emplace(_card);
        }
      }
      return level_evo(self, card, context, 'j_poke_lucario');
    },
  },
  // Lucario 448 (Pokermon 3.9.1: only in the pool while a playing card has an edition - POKE_POOL_RULES below; its
  // 3.9.1 Mega, mega_lucario, is a new joker: not here yet)
  lucario: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.hand && context.other_card.edition && !context.end_of_round) {
        if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
  },
  // ---------------------------------------------------------------- new in 3.9.1 (new-jokers sub-batch 14)
  // Chingling 433 (Baby): X0.75 Mult (faints unless only Babies are to its right); a Negative Justice at end of round;
  // evolves into Chimecho in 2 rounds.
  chingling: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'baby' });
      if (detailed()) {
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
        info_queue.push(P_CENTERS.c_justice);
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        faint_baby_poke(self, card, context);
        return { Xmult: card.ability.extra.Xmult_minus };
      }
      if (end_of_round(card, context)) {
        G.E_MANAGER.add_event(() => { add_card({ set: 'Tarot', key: 'c_justice', edition: 'e_negative' }); });
      }
      return level_evo(self, card, context, 'j_poke_chimecho');
    },
  },
  // Bronzor 436: scored cards of the round's suit give X1.3 Mult; evolves after 10 scored cards of the round's rank.
  bronzor: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const abbr = center.ability.extra;
      return { vars: [abbr.Xmult_multi, bronzo_rank(), bronzo_suit(), Math.max(0, self.config.evo_rqmt - abbr.scored)], colours: ['SUITS.' + bronzo_suit_key()] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round) {
        if (context.other_card.get_id() === G.GAME.current_round.bronzo_id) card.ability.extra.scored = card.ability.extra.scored + 1;
        if (context.other_card.is_suit(G.GAME.current_round.bronzo_suit)) return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return scaling_evo(self, card, context, 'j_poke_bronzong', card.ability.extra.scored, self.config.evo_rqmt);
    },
  },
  // Bronzong 437: scored cards of the round's suit give X1.3 Mult; scored cards of the round's rank retrigger once.
  bronzong: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.retriggers, center.ability.extra.Xmult_multi, bronzo_rank(), bronzo_suit()], colours: ['SUITS.' + bronzo_suit_key()] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.is_suit(G.GAME.current_round.bronzo_suit)) {
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      if (context.repetition && context.cardarea === G.play && !context.end_of_round && context.other_card.get_id() === G.GAME.current_round.bronzo_id) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
}, FILE);

// Pokermon 3.9.1 Lucario in_pool: some playing card has an edition.
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_lucario' && !(G.playing_cards && G.playing_cards.some((v) => v.edition)) ? false : undefined));
