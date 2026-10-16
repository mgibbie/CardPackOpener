/**
 * More Fluff jokers, part C (27): Recycling, Virtual Joker, Wild Draw Four, Yucky Rat, All I Can't Do,
 * Blood Pact, Book Move ("Treasure Map" in the Lua), Brass Joker, Bowling Ball, Card Buffer Advanced,
 * Complexity Creep, Flesh Prison, Grep ("Jester" in the Lua), Huge Joker, Hyperjimbo, Jankman, Mashup
 * Album, Pixel Joker, Rainbow Joker, Rose-Tinted Glasses, The Solo, Top 10 Jokers From 1 To 10, Wide
 * Joker, Triangle, Marigold, Less Fluff and the Token-rarity "Oops! All 5s" (oopsallfives).
 * Ported from `mods off/MoreFluff-main/jokers/<file>.lua`; numbers from data.js (the mod's own).
 * Cryptid's `context.forcetrigger` branches are left out (Cryptid isn't part of Micatro).
 *
 * Lua -> Micatro:
 *  - Hyperjimbo's mf_before_cards context (lovely/before_scoring_ctx.toml) -> the `modify_scoring` hook,
 *    step 'before_cards'; without Talisman the mod itself uses X chips^(chips^0.04 - 1), i.e.
 *    chips -> chips^(chips^0.04) (its "^^1.04" tetration approximation) — used here.
 *  - Wide Joker returns {emult: 1.14} (^1.14 Mult; the engine applies ^). Equal to the mod's own
 *    non-Talisman fallback Xmult_mod = mult^0.14.
 *  - All I Can't Do: SMODS.debuff_card(c, true/false, 'allicantdo') -> ability.debuff_sources.allicantdo
 *    + a debuff recalculation; the Game:update_round_eval wrap that clears it on deck cards -> the
 *    `evaluate_round` hook (adds no cash-out rows).
 *  - "Modded" (Jankman, Less Fluff) = a joker from any mod (center.mod); vanilla = base-game joker.
 *    Jankman's Lua vanilla list leaves out Jolly Joker — and its text says "(and also Jolly Joker)",
 *    so Jolly Joker counts, as written.
 *  - Brass Joker's `upgraded` is an undeclared global never reset (it only gated an unused string):
 *    harmless, kept out.
 *
 * INTENDED-DESIGN FIXES (each pinned in micatro/tests/mods/morefluff_jokers_c_test.mjs):
 *  1. Complexity Creep's description: for a "1 in N chance" gate the Lua passed an undeclared
 *     `demoninator` (nil) and an undeclared `card` to SMODS.get_probability_vars, with the base numerator
 *     already multiplied by G.GAME.probabilities.normal (so it would be doubled twice). The text showed
 *     "1 in nil". It shows the real roll's odds: "#num# in N" (num = 1 x probability modifiers).
 *  2. Complexity Creep's "Creates a Tarot/Planet" popup called localize{message = ...} (a table with no
 *     type -> no text). It shows +1 Tarot / +1 Planet.
 *  3. (port) Complexity Creep's "when a card is sold" / "when shop is rerolled" effects: SMODS's
 *     calculate_effect pays the money those return; Micatro's sell / reroll passes ignore joker returns, so
 *     those two triggers settle their effects (money + popups) themselves.
 *  4. Less Fluff's "X#1#" popup used the variable key 'x_mult' (not a key: no text); it uses a_xmult.
 */
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_CENTERS, create_card, copy_card, pseudorandom, pseudoseed, pseudorandom_element, probability_roll,
  probability_vars, localize, ease_dollars, number_format, emit, card_eval_status_text,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { get_poker_hand_info, joker_retriggers } from '../../js/engine/run.js';
import { MOD_LOC } from '../../js/mods/registry.js';
import { joker, room, say, remove_joker, has_enh, progressbar } from './util.js';

const centers = [];
/** info_queue entry for a center with its description vars (its own loc_vars, or a base joker's config.extra). */
function iq_center(key) {
  const c = P_CENTERS[key];
  if (!c) return undefined;
  let vars = [];
  if (c.mod && c.loc_vars) { try { vars = (c.loc_vars(c, [], { ability: JSON.parse(JSON.stringify(c.config || {})), config: { center: c } }) || {}).vars || []; } catch (e) { vars = []; } }
  else if (c.config && c.config.extra !== undefined && typeof c.config.extra !== 'object') vars = [c.config.extra];
  return { key, set: c.set, vars };
}
const J = (slug, def) => { const c = joker(slug, def); centers.push(c); return c; };
const isJ = (card) => card && card.ability && card.ability.set === 'Joker';
const axmult = (x) => localize({ type: 'variable', key: 'a_xmult', vars: [x] });
const amult = (x) => localize({ type: 'variable', key: 'a_mult', vars: [x] });
const achips = (x) => localize({ type: 'variable', key: 'a_chips', vars: [x] });
/** Non-joker-event "end of round" context (not the per-card / repetition passes). */
const eor = (ctx) => ctx.end_of_round && !ctx.individual && !ctx.repetition;
/** Make a consumable (Tarot / Planet / ...) if there's room — the Lua's buffer + queued create. */
function make_consumable(set, key_append, forced) {
  if (!room()) return false;
  G.GAME.consumeable_buffer += 1;
  G.E_MANAGER.add_event(() => {
    const n = create_card(set, G.consumeables, null, null, null, null, forced || null, key_append);
    n.add_to_deck();
    G.consumeables.emplace(n);
    G.GAME.consumeable_buffer = 0;
  });
  return true;
}

// ------------------------------------------------------------------ Recycling
J('recycling', {
  calculate(self, card, context) {
    if (context.skipping_booster && room()) {
      const [card_type] = pseudorandom_element(['Tarot', 'Planet'], pseudoseed('recycling_type'));
      make_consumable(card_type, 'sup');
      return card_type === 'Tarot' ? { message: localize('k_plus_tarot'), colour: 'Tarot', card } : { message: localize('k_plus_planet'), colour: 'Planet', card };
    }
  },
});

// ------------------------------------------------------------------ Virtual Joker
J('virtual', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(self, card, context) {
    if (context.setting_blind && !card.getting_sliced && !(context.blueprint_card || card).getting_sliced && !context.blueprint) {
      G.jokers.unhighlight_all();
      for (const v of G.jokers.cards) v.flip();
      G.E_MANAGER.add_event(() => {
        G.E_MANAGER.add_event(() => { G.jokers.shuffle('aajk'); });
        G.E_MANAGER.add_event(() => { G.jokers.shuffle('aajk'); });
        G.E_MANAGER.add_event(() => { G.jokers.shuffle('aajk'); });
      });
    }
    if (context.cardarea === G.jokers && context.joker_main) return { message: axmult(card.ability.extra), Xmult_mod: card.ability.extra };
  },
});

// ------------------------------------------------------------------ Wild Draw Four
J('wilddrawfour', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.h_size, card.ability.extra] }),
  calculate(self, card, context) {
    if (context.individual && context.cardarea === G.play && has_enh(context.other_card, 'm_wild') && !context.blueprint) {
      card.ability.h_size += card.ability.extra;
      G.hand.change_size(card.ability.extra);
      return { message: localize('k_upgrade_ex'), colour: 'MONEY' };
    }
    if (context.end_of_round && !context.blueprint && !context.repetition && !context.individual) {
      G.hand.change_size(-card.ability.h_size);
      card.ability.h_size = 0;
    }
  },
});

// ------------------------------------------------------------------ Yucky Rat
J('yuckyrat', {
  loc_vars(s, iq, card) { iq.push(iq_center('m_mf_yucky')); return { vars: [card.ability.extra.x_mult_mod, card.ability.extra.x_mult] }; },
  calculate(self, card, context) {
    const e = card.ability.extra;
    if (context.cardarea === G.jokers && context.joker_main && e.x_mult > 1.0) return { xmult: e.x_mult };
    if (context.cardarea === G.jokers && context.before) {
      let gain = 0;
      const cards = [];
      for (const other of G.play.cards) {
        if (other.config.center !== P_CENTERS.c_base) continue;
        cards.push(other);
        gain += e.x_mult_mod;
      }
      for (const other of cards) G.E_MANAGER.add_event(() => { other.set_ability(P_CENTERS.m_mf_yucky); });
      if (gain > 0) {
        e.x_mult += gain;
        return { message: axmult(e.x_mult), colour: 'RED' };
      }
    }
  },
});

// ------------------------------------------------------------------ All I Can't Do
const SRC = 'allicantdo';
/** SMODS.debuff_card(card, debuff, source) */
function debuff_card(c, debuff) {
  c.ability.debuff_sources = c.ability.debuff_sources || {};
  c.ability.debuff_sources[SRC] = debuff;
  if (G.GAME.blind) G.GAME.blind.debuff_card(c); else c.set_debuff(false);
}
J('allicantdo', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult_mod, card.ability.extra.x_mult] }),
  calculate(self, card, context) {
    const e = card.ability.extra;
    if (context.first_hand_drawn && !context.blueprint) {
      // (Micatro calls first_hand_drawn as the draw is queued; the Lua after it lands — read the hand then.)
      G.E_MANAGER.add_event(() => { for (const c of G.hand.cards.slice()) G.E_MANAGER.add_event(() => { debuff_card(c, true); }); });
    }
    if (context.before && !context.blueprint) {
      let mod = 0;
      for (const c of G.play.cards) if (c.debuff) mod += e.x_mult_mod;
      if (mod > 0) {
        e.x_mult += mod;
        return { message: 'X' + e.x_mult + ' Mult', colour: 'MULT' };
      }
    }
    if (context.cardarea === G.jokers && context.joker_main) return { xmult: e.x_mult };
  },
});

// ------------------------------------------------------------------ Blood Pact
J('bloodpact', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(self, card, context) {
    if (context.cardarea === G.jokers && context.joker_main && context.full_hand) {
      let non_hearts = 0;
      for (const v of context.full_hand) if (!v.is_suit('Hearts', null, true)) non_hearts++;
      if (non_hearts > 0) {
        if (!context.blueprint) {
          remove_joker(card);
          card.gone = true;
          return { message: localize('k_extinct_ex') };
        }
      } else return { message: axmult(card.ability.extra), Xmult_mod: card.ability.extra };
    }
  },
});

// ------------------------------------------------------------------ Book Move
J('bookmove', {
  loc_vars(s, iq, card) { iq.push(iq_center('j_hanging_chad'), iq_center('j_photograph')); return { vars: [card.ability.extra.c_rounds, card.ability.extra.rounds] }; },
  calculate(self, card, context) {
    const e = card.ability.extra;
    if (eor(context) && !context.blueprint) {
      e.c_rounds += 1;
      return { message: e.c_rounds < e.rounds ? e.c_rounds + '/' + e.rounds : localize('k_active_ex'), colour: 'FILTER' };
    }
    if (context.selling_self && e.c_rounds >= e.rounds && !context.blueprint) {
      const gained_slots = 1;
      for (const key of ['j_hanging_chad', 'j_photograph']) {
        if (G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit + gained_slots) {
          G.GAME.joker_buffer += 1;
          G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => {
            const n = create_card('Joker', G.consumeables, null, null, null, null, key, null);
            n.add_to_deck();
            G.jokers.emplace(n);
            G.GAME.joker_buffer -= 1;
          }));
        }
      }
    }
  },
});

// ------------------------------------------------------------------ Brass Joker
J('brass', {
  loc_vars(s, iq, card) {
    iq.push(iq_center('m_mf_brass'));
    const a = card.ability;
    const [val, max] = progressbar(a.partial_rounds, a.upgrade_rounds);
    return { vars: [a.retriggers, val, max, a.upgrade_rounds] };
  },
  calculate(self, card, context) {
    const a = card.ability;
    if (context.retrigger_joker_check && !context.retrigger_joker && a.retriggers >= 1) {
      let retrigger_card = null;
      for (let i = 0; i < G.jokers.cards.length; i++) if (G.jokers.cards[i] === card) retrigger_card = G.jokers.cards[i + 1];
      if (retrigger_card && retrigger_card === context.other_card) return { message: localize('k_again_ex'), repetitions: a.retriggers, card };
    }
    if (context.remove_playing_cards) {
      let count = 0;
      for (const other of context.removed) if (other.config.center.key === 'm_mf_brass') count++;
      for (let i = 0; i < count; i++) {
        a.partial_rounds += 1;
        while (a.partial_rounds >= a.upgrade_rounds) { a.retriggers += 1; a.partial_rounds -= a.upgrade_rounds; }
      }
    }
  },
});

// ------------------------------------------------------------------ Bowling Ball
J('bowlingball', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.mult] }),
  calculate(self, card, context) {
    if (context.individual && context.cardarea === G.play && context.other_card.get_id() === 3) {
      return { chips: card.ability.extra.chips, mult: card.ability.extra.mult, card };
    }
  },
});

// ------------------------------------------------------------------ Card Buffer Advanced
J('cba', {
  calculate(self, card, context) {
    if (context.retrigger_joker_check && !context.retrigger_joker) {
      let retrigger_card = null;
      for (const j of G.jokers.cards) if (j.edition) { retrigger_card = j; break; }
      if (retrigger_card && retrigger_card === context.other_card) return { message: localize('k_again_ex'), repetitions: 1, card };
    }
  },
});

// ------------------------------------------------------------------ Complexity Creep
const CC_SCORING = [
  ...Array(10).fill(['plusmult', 1, 9, 1, 'cc_plusmult']),
  ...Array(10).fill(['pluschips', 10, 190, 1, 'cc_pluschips']),
  ...Array(5).fill(['xmult', 1, 20, 0.1, 'cc_xmult']),
  ...Array(5).fill(['xchips', 1, 20, 0.1, 'cc_xchips']),
  ['emult', 1, 25, 0.01, 'cc_emult'],
  ['echips', 1, 25, 0.01, 'cc_echips'],
  ...Array(5).fill(['dollars', 1, 3, 1, 'cc_dollars']),
  ...Array(2).fill(['swapchipmult', 0, 0, 0, 'cc_swapchipmult']),
  ...Array(5).fill(['createtarot', 0, 0, 0, 'cc_createtarot']),
  ...Array(5).fill(['createplanet', 0, 0, 0, 'cc_createplanet']),
  ['copyconsumeable', 0, 0, 0, 'cc_copyconsumeable'],
];
const CC_ODDS = ['odds', [2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 10, 100], 'cc_mf_odds'];
const CC_GATES = [['handtype', ['Two Pair', 'Three of a Kind', 'Straight Flush', 'Full House', 'Flush Five', 'High Card', 'Pair'], 'cc_mf_handtype'], CC_ODDS];
const CC_TRIGGERS = [
  ['cardscored', ['chicken jockey'], 'cc_mf_card_trigger'],
  ...Array(3).fill(['firstscored', ['chicken jockey'], 'cc_mf_first_card_trigger']),
  ...Array(2).fill(['facescored', ['chicken jockey'], 'cc_mf_face_card_trigger']),
];
const CC_OTHER = [
  ...Array(5).fill(['dollars', 1, 3, 1, 'cc_dollars']),
  ...Array(5).fill(['createtarot', 0, 0, 0, 'cc_createtarot']),
  ...Array(5).fill(['createplanet', 0, 0, 0, 'cc_createplanet']),
  ['copyconsumeable', 0, 0, 0, 'cc_copyconsumeable'],
];
const CC_OTHER_TRIGGERS = [['endofround', ['chicken jockey'], 'cc_mf_endofround'], ['cardsold', ['chicken jockey'], 'cc_mf_cardsold'], ['shoproll', ['chicken jockey'], 'cc_mf_shoproll']];
/** grow_complexity_creep(effects): effect = [effect, value, trigger, trigger_value, gate, gate_value, loc, gate_loc, trigger_loc] (Lua 1..9). */
export function grow_complexity_creep(effects) {
  const effect = [null, null, null, null, null, null, null, null, null];
  const scoring_trigger = pseudorandom('ccreep_grow') < 0.8;
  const pool = scoring_trigger ? CC_SCORING : CC_OTHER;
  const [chosen] = pseudorandom_element(pool, pseudoseed('ccreep_grow'));
  pseudorandom('ccreep_grow'); // value_roll (unused, still rolled)
  const value = chosen[1] + Math.floor(pseudorandom('ccreep_grow') * (chosen[2] + 1)) * chosen[3];
  effect[0] = chosen[0]; effect[1] = value; effect[6] = chosen[4];
  if (pseudorandom('ccreep_grow') < 0.3) {
    const [gate] = pseudorandom_element(scoring_trigger ? CC_GATES : [CC_ODDS], pseudoseed('ccreep_grow'));
    const [gate_value] = pseudorandom_element(gate[1], pseudoseed('ccreep_grow'));
    effect[4] = gate[0]; effect[5] = gate_value; effect[7] = gate[2];
  }
  if (!scoring_trigger || pseudorandom('ccreep_grow') < 0.3) {
    const [trigger] = pseudorandom_element(scoring_trigger ? CC_TRIGGERS : CC_OTHER_TRIGGERS, pseudoseed('ccreep_grow'));
    const [trigger_value] = pseudorandom_element(trigger[1], pseudoseed('ccreep_grow'));
    effect[2] = trigger[0]; effect[3] = trigger_value; effect[8] = trigger[2];
  } else {
    effect[2] = 'joker'; effect[8] = 'cc_mf_joker_trigger';
  }
  effects.push(effect);
}
const CC_EVAL = {
  plusmult: (e) => ({ mult: e[1] }),
  pluschips: (e) => ({ chips: e[1] }),
  xmult: (e) => ({ xmult: e[1] }),
  xchips: (e) => ({ xchips: e[1] }),
  emult: (e) => ({ emult: e[1] }),
  echips: (e) => ({ echips: e[1] }),
  dollars: (e) => ({ dollars: e[1] }),
  swapchipmult: () => ({ swap: true }),
  createtarot: () => { make_consumable('Tarot', 'ccr'); return { message: localize('k_plus_tarot'), colour: 'PURPLE' }; }, // fix 2
  createplanet: () => { make_consumable('Planet', 'ccr'); return { message: localize('k_plus_planet'), colour: 'BLUE' }; }, // fix 2
  copyconsumeable: () => {
    if (!G.consumeables.cards[0]) return undefined;
    G.E_MANAGER.add_event(() => {
      const [src] = pseudorandom_element(G.consumeables.cards, pseudoseed('perkeo'));
      if (!src) return;
      const c = copy_card(src, null);
      c.set_edition({ negative: true }, true);
      c.add_to_deck();
      G.consumeables.emplace(c);
    });
    return { message: localize('k_duplicated_ex') };
  },
};
const CC_GUARD = {
  handtype: (context, e) => !!(context.poker_hands && context.poker_hands[e[5]] && context.poker_hands[e[5]].length),
  odds: (context, e) => probability_roll('complexitycreep_odds', 'seed', 1, e[5], 'ccreep'),
};
/** localize{type='variable', key, vars}[1] for the mod's v_dictionary lines. */
function vline(key, vars) {
  const v = MOD_LOC.misc.v_dictionary && MOD_LOC.misc.v_dictionary[key];
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return '';
  return s.replace(/#(\d+)#/g, (m, n) => (vars[n - 1] !== undefined && vars[n - 1] !== null ? String(vars[n - 1]) : m));
}
J('complexitycreep', {
  set_ability(self, card) {
    card.ability.effects = [];
    if (G.GAME && G.GAME.pseudorandom) grow_complexity_creep(card.ability.effects);
  },
  loc_vars(self, iq, card) {
    for (const e of card.ability.effects || []) {
      let numerator = 1, denominator = e[5];
      if (e[7] === 'cc_mf_odds') [numerator, denominator] = probability_vars(card, 1, e[5], 'ccreep'); // fix 1
      const v = [e[1], e[3], denominator, numerator];
      const thunk = e[7] ? vline(e[7], v) : '';
      const thunk2 = e[8] ? vline(e[8], v) : '';
      iq.push({ key: e[6] + (e[7] ? '_if' : ''), set: 'ComplexityCreep', vars: [e[1], thunk2, thunk] });
    }
    return { vars: [] };
  },
  calculate(self, card, context) {
    if (context.setting_blind && context.blind && context.blind.boss && !context.blueprint) {
      grow_complexity_creep(card.ability.effects);
      say(card, localize('k_effect_added_ex'), 'PURPLE');
    }
    const list = [];
    const guard = (e) => (e[4] ? CC_GUARD[e[4]](context, e) : true);
    const run = (e) => { const r = CC_EVAL[e[0]](e); if (r) list.push(r); };
    for (const e of card.ability.effects || []) {
      const t = e[2];
      if (t === 'joker') {
        if (context.cardarea === G.jokers && context.joker_main && guard(e)) run(e);
      } else if (t === 'cardscored' || t === 'firstscored' || t === 'facescored') {
        if (context.individual && context.cardarea === G.play) {
          let g = guard(e);
          if (t === 'firstscored' && context.other_card !== context.scoring_hand[0]) g = false;
          if (t === 'facescored' && !context.other_card.is_face()) g = false;
          if (g) run(e);
        }
      } else if (t === 'endofround') {
        if (eor(context) && guard(e)) run(e);
      } else if (t === 'cardsold') {
        if (context.selling_card && guard(e)) run(e);
      } else if (t === 'shoproll') {
        if (context.reroll_shop && guard(e)) run(e);
      }
    }
    if (!list.length) return undefined;
    if (context.selling_card || context.reroll_shop) {
      // fix 3: Micatro's sell / reroll passes ignore joker returns — settle the effects here.
      for (const r of list) {
        if (r.message) say(card, r.message, r.colour);
        if (r.dollars) { ease_dollars(r.dollars); card_eval_status_text(card, 'dollars', r.dollars); }
      }
      return undefined;
    }
    const root = list[0];
    let add = root;
    for (let i = 1; i < list.length; i++) { add.extra = list[i]; add = list[i]; }
    return root;
  },
});

// ------------------------------------------------------------------ Flesh Prison
J('fleshprison', {
  loc_vars(s, iq, card) { iq.push(iq_center('c_soul')); return { vars: [card.ability.extra.boss_size] }; },
  calculate(self, card, context) {
    if (context.setting_blind && !context.blueprint && context.blind && context.blind.boss && !card.getting_sliced) {
      card.gone = false;
      G.GAME.blind.chips = BN.mul(G.GAME.blind.chips, card.ability.extra.boss_size);
      G.GAME.blind.chip_text = number_format(G.GAME.blind.chips);
      G.E_MANAGER.add_event(() => { say(card, 'Good luck!'); });
    }
    if (eor(context) && !context.blueprint && G.GAME.blind.boss && !card.gone) {
      G.E_MANAGER.add_event(() => {
        const c = create_card(null, G.consumeables, null, null, null, null, 'c_soul', 'sup');
        c.set_edition({ negative: true }, true);
        c.add_to_deck();
        G.consumeables.emplace(c);
      });
      if (!card.ability.eternal) remove_joker(card);
      card.gone = true;
    }
  },
});

// ------------------------------------------------------------------ Grep
J('grep', {
  calculate(self, card, context) {
    if (context.discard && !context.blueprint && G.GAME.current_round.discards_used <= 0 && context.full_hand.length === 1) {
      const rank = context.full_hand[0].get_id();
      const suit = context.full_hand[0].base.suit;
      const m = (c) => c.get_id() === rank || c.base.suit === suit;
      // table.sort(..., b matches and a doesn't): matching cards go to the end = the top of the deck.
      G.deck.cards.sort((a, b) => (m(a) === m(b) ? 0 : m(a) ? 1 : -1));
      G.deck.set_ranks();
      return { message: localize('k_searched_ex') };
    }
  },
});

// ------------------------------------------------------------------ Huge Joker
J('hugejoker', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult, card.ability.h_size < 0 ? card.ability.h_size : '+' + card.ability.h_size] }),
  calculate(self, card, context) {
    if (context.cardarea === G.jokers && context.joker_main) return { message: axmult(card.ability.extra.x_mult), Xmult_mod: card.ability.extra.x_mult };
  },
});

// ------------------------------------------------------------------ Hyperjimbo
J('hyperjimbo', {
  loc_vars(s, iq, card) {
    iq.push({ key: 'tetr_explainer', set: 'Other', vars: [card.ability.val, Math.round((card.ability.val - 1) * 1e9) / 1e9] });
    return { vars: [card.ability.val] };
  },
  calculate(self, card, context) {
    // (applied by the modify_scoring hook below; the Lua's mf_before_cards context)
    if (context.mf_before_cards && G.play.cards.length === 4) return { mf_eechips: card.ability.val, message: '^^' + card.ability.val + ' Chips', colour: 'DARK_EDITION' };
  },
});

// ------------------------------------------------------------------ Jankman
J('jankman', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_chips] }),
  calculate(self, card, context) {
    if (context.other_joker && context.other_joker.ability.set === 'Joker') {
      const c = context.other_joker.config.center;
      if (c.mod || c.key === 'j_jolly') return { xchips: card.ability.extra.x_chips };
    }
  },
});

// ------------------------------------------------------------------ Mashup Album
J('mashupalbum', {
  loc_vars: (s, iq, card) => { const e = card.ability.extra; return { vars: [e.mult, e.chips, e.mult_gain, e.chips_gain] }; },
  calculate(self, card, context) {
    const e = card.ability.extra;
    if (!context.repetition && !context.other_joker && context.cardarea === G.jokers && context.before && context.poker_hands.Flush.length) {
      const h_card = context.poker_hands.Flush[0][0];
      if (h_card.is_suit('Hearts') || h_card.is_suit('Diamonds')) { e.mult += 4; return { message: localize('k_upgrade_ex'), card, colour: 'RED' }; }
      e.chips += 15;
      return { message: localize('k_upgrade_ex'), card, colour: 'CHIPS' };
    }
    if (context.cardarea === G.jokers && context.joker_main) {
      if (e.mult > 0 && e.chips > 0) {
        say(card, achips(e.chips), 'CHIPS');
        return { message: amult(e.mult), mult_mod: e.mult, chip_mod: e.chips };
      } else if (e.mult > 0) return { message: amult(e.mult), mult_mod: e.mult };
      else if (e.chips > 0) return { message: achips(e.chips), chip_mod: e.chips };
    }
  },
});

// ------------------------------------------------------------------ Pixel Joker
J('pixeljoker', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult] }),
  calculate(self, card, context) {
    if (context.individual && context.cardarea === G.play) {
      const id = context.other_card.get_id();
      if (id === 14 || id === 4 || id === 9) return { x_mult: card.ability.extra.x_mult, colour: 'RED', card };
    }
  },
});

// ------------------------------------------------------------------ Rainbow Joker
J('rainbowjoker', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(self, card, context) {
    if (context.other_consumeable && context.other_consumeable.ability.set === 'Colour') {
      return { message: axmult(card.ability.extra), Xmult_mod: card.ability.extra };
    }
  },
});

// ------------------------------------------------------------------ Rose-Tinted Glasses
J('rosetinted', {
  calculate(self, card, context) {
    if (context.destroying_card && !context.blueprint && context.full_hand.length === 1 && context.full_hand[0].get_id() === 2 && G.GAME.current_round.hands_played === 0) {
      G.E_MANAGER.add_event(() => { add_tag(new Tag('tag_double')); });
      return true;
    }
  },
});

// ------------------------------------------------------------------ The Solo
J('the_solo', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult, card.ability.extra.x_mult_gain] }),
  calculate(self, card, context) {
    const e = card.ability.extra;
    if (context.before && context.full_hand && context.cardarea === G.jokers && !context.blueprint && context.full_hand.length === 1) {
      e.x_mult += e.x_mult_gain;
      return { message: axmult(e.x_mult) };
    }
    if (context.cardarea === G.jokers && context.joker_main) return { message: axmult(e.x_mult), Xmult_mod: e.x_mult };
  },
});

// ------------------------------------------------------------------ Top 10
/** Unique digits in the money as the Lua prints it (G.GAME.dollars..""). */
export function top10_digits() {
  const s = String(G.GAME.dollars);
  let n = 0;
  for (let i = 0; i <= 9; i++) if (s.includes(String(i))) n++;
  return n;
}
J('top10', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.cash_per] }),
  calc_dollar_bonus(self, card) {
    const n = top10_digits();
    if (n > 0) return card.ability.cash_per * n;
  },
});

// ------------------------------------------------------------------ Wide Joker
J('widejoker', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.powmult] }),
  calculate(self, card, context) {
    if (context.cardarea === G.jokers && context.joker_main) return { emult: card.ability.extra.powmult, message: '^' + card.ability.extra.powmult + ' Mult', colour: 'DARK_EDITION' };
  },
});

// ------------------------------------------------------------------ Triangle
J('triangle', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult] }),
  calculate(self, card, context) {
    if (context.individual && context.cardarea === G.play) {
      if (get_poker_hand_info(G.play.cards).disp_text === 'Three of a Kind') return { x_mult: card.ability.extra.x_mult, colour: 'RED', card };
    }
  },
});

// ------------------------------------------------------------------ Marigold
J('marigold', {
  loc_vars(s, iq, card) { iq.push(iq_center('m_mf_marigold')); return { vars: [card.ability.extra.retriggers] }; },
  calculate(self, card, context) {
    if (context.repetition && context.other_card && context.other_card.config.center.key === 'm_mf_marigold') {
      return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
    }
  },
});

// ------------------------------------------------------------------ Less Fluff
J('lessfluff', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult, card.ability.extra.x_mult_per] }),
  calculate(self, card, context) {
    const e = card.ability.extra;
    if (context.cardarea === G.jokers && context.joker_main) return { xmult: e.x_mult };
    if (context.setting_blind && !context.blueprint && !card.getting_sliced) {
      let gained = 0;
      for (const other of G.jokers.cards.slice()) {
        if (other.getting_sliced) continue;
        const c = other.config.center;
        if (!c.mod || c.key === 'j_mf_lessfluff') continue; // the Lua's "safe" list: every base joker + Less Fluff
        gained += e.x_mult_per;
        other.getting_sliced = true;
        G.E_MANAGER.add_event(() => { other.start_dissolve(); });
      }
      if (gained > 0) {
        e.x_mult += gained;
        return { message: axmult(e.x_mult), colour: 'RED' }; // fix 4
      }
    }
  },
});

// ------------------------------------------------------------------ Oops! All 5s (Token)
J('oopsallfives', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(self, card, context) {
    if (context.mod_probability && !context.blueprint) {
      let d = context.denominator;
      if (context.denominator >= 1 && context.denominator < 2) d = 1;
      else if (context.denominator >= 2) d = d - 1;
      return { denominator: d };
    }
  },
});

// ------------------------------------------------------------------ hooks
export const hooks = {
  /** Hyperjimbo's mf_before_cards context: chips -> chips^(chips^0.04) (each owned copy, + retriggers). */
  modify_scoring([chips, mult], step, ctx) {
    if (step !== 'before_cards') return undefined;
    for (const j of G.jokers.cards.slice()) {
      if (j.config.center.key !== 'j_mf_hyperjimbo') continue;
      const jctx = { cardarea: G.jokers, ...ctx, mf_before_cards: true };
      let eff = j.calculate_joker(jctx);
      for (let t = eff ? joker_retriggers(j, jctx) + 1 : 0; t > 0; t--) {
        const x = BN.pow(chips, BN.sub(BN.pow(chips, eff.mf_eechips - 1), 1)); // the mod's Xchip_mod
        chips = BN.mul(chips, x);
        card_eval_status_text(j, 'extra', null, null, null, { message: eff.message, colour: eff.colour });
        emit('hand_text', { chips, mult });
        if (t > 1) { eff = j.calculate_joker({ ...jctx, retrigger_joker: true }); if (!eff) break; }
      }
    }
    return [chips, mult];
  },
  /** Game:update_round_eval: All I Can't Do's debuffs leave the deck cards. */
  evaluate_round() {
    for (const c of G.deck.cards) if (c.ability.debuff_sources && c.ability.debuff_sources[SRC] !== undefined) debuff_card(c, false);
    return undefined;
  },
};
export { centers };
