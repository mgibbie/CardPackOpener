// Pokermon 3.2.1 — pokemon/pokejokers_11.lua (Pokédex 301-330: Aron -> Mega Camerupt), 6 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, megas, enhancement_gate) comes from data.js. See ../PORTING.md.
import {
  G, P_CENTERS, localize, card_eval_status_text, juice_card_until,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, has_enhancement,
} from '../api.js';

const FILE = 'pokemon/pokejokers_11.lua';

/**
 * Aron line: scoring cards of the eaten enhancements give +Xmult_mod each and are destroyed.
 * `eats` = enhancement keys, `flag` = the per-card target marker (aron_target / lairon_target / aggron_target).
 */
function aron_calc(self, card, context, eats, flag) {
  const edible = (v) => eats.some((k) => has_enhancement(v, k));
  if (context.cardarea === G.jokers && context.before && !context.blueprint) {
    for (const v of context.scoring_hand) {
      if (edible(v) && !v.debuff) {
        card.ability.extra.eaten = card.ability.extra.eaten + 1;
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        v[flag] = true;
        G.E_MANAGER.add_event(() => { v.juice_up(); });
      }
    }
  } else if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
  } else if (context.destroying_card) {
    return !context.blueprint && edible(context.destroying_card) && !!context.destroying_card[flag];
  }
  return undefined;
}

/** Numel / Camerupt: X Mult on the hand after `score_goal` cards were scored. */
function numel_calc(card, context, mult_cards_twice) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && card.ability.extra.active) card.ability.extra.cards_scored = 0;
    if (context.joker_main && card.ability.extra.active) {
      card.ability.extra.active = false;
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
    }
    if (context.after && card.ability.extra.cards_scored >= card.ability.extra.score_goal) {
      card.ability.extra.active = true;
      juice_card_until(card, (c) => c.ability.extra.active && !G.RESET_JIGGLES, true);
    }
  }
  if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.blueprint) {
    card.ability.extra.cards_scored = card.ability.extra.cards_scored + 1;
    if (mult_cards_twice && has_enhancement(context.other_card, 'm_mult')) card.ability.extra.cards_scored = card.ability.extra.cards_scored + 1;
  }
  return undefined;
}

defineJokers({
  // Aron 304
  aron: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_steel);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.eaten] };
    },
    calculate(self, card, context) {
      // (Lua: the if/elseif chain returns from the destroying_card branch even when it's false.)
      if (context.destroying_card) return aron_calc(self, card, context, ['m_steel'], 'aron_target');
      const r = aron_calc(self, card, context, ['m_steel'], 'aron_target');
      if (r !== undefined) return r;
      return scaling_evo(self, card, context, 'j_poke_lairon', card.ability.extra.Xmult, self.config.evo_rqmt);
    },
  },
  // Lairon 305
  lairon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push(P_CENTERS.m_steel); info_queue.push(P_CENTERS.m_stone); }
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.eaten] };
    },
    calculate(self, card, context) {
      if (context.destroying_card) return aron_calc(self, card, context, ['m_steel', 'm_stone'], 'lairon_target');
      const r = aron_calc(self, card, context, ['m_steel', 'm_stone'], 'lairon_target');
      if (r !== undefined) return r;
      return scaling_evo(self, card, context, 'j_poke_aggron', card.ability.extra.Xmult, self.config.evo_rqmt);
    },
  },
  // Aggron 306
  aggron: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push(P_CENTERS.m_steel); info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_gold); }
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.eaten] };
    },
    calculate(self, card, context) {
      return aron_calc(self, card, context, ['m_steel', 'm_stone', 'm_gold'], 'aggron_target');
    },
  },
  // Numel 322
  numel: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.rounds, center.ability.extra.score_goal, Math.max(0, center.ability.extra.score_goal - center.ability.extra.cards_scored)] };
    },
    calculate(self, card, context) {
      const r = numel_calc(card, context, false);
      if (r) return r;
      return level_evo(self, card, context, 'j_poke_camerupt');
    },
  },
  // Camerupt 323
  camerupt: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.score_goal, Math.max(0, center.ability.extra.score_goal - center.ability.extra.cards_scored)] };
    },
    calculate(self, card, context) { return numel_calc(card, context, true); },
  },
  // Mega Camerupt 323-1
  mega_camerupt: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult > 1) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.blueprint && has_enhancement(context.other_card, 'm_mult')) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_multi;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.ability.extra.Xmult = card.ability.extra.Xmult2;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
}, FILE);
