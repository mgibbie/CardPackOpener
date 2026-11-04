/**
 * More Fluff 1.9.9999 — jokers, part A (28): the commons, the "spire" uncommons and the first uncommons of
 * the 1.5.6 joker list. Each is a line-for-line port of src/jokers/<slug>.lua (numbers from data.js).
 * Cryptid's context.forcetrigger branches are left out (no Cryptid in Micatro). Coupon Catalogue is retired
 * upstream to the hidden "Old Fluff" rarity; Cartomancer! keeps its pre-turned 1.5.6 art (legacy.js).
 * 1.9.9999 changes ported here: Lollipop (extra.xmult, scale_card), Lucky Charm (text order, money return), MS Paint
 * (+3 hand size from blind select), Philosophical (extra.slots, slots change in an event), Expansion Pack (SMODS.add_card:
 * no key_append), Dropkick ("+1 Hand "), Blade Dance (first hand drawn), Bad Legal Defence (returned message).
 *
 * Port notes (Micatro equivalents, not behaviour changes):
 *  - Basepaul Card: the Lua gives X12.5 when the PROFILE name contains "paul"; Micatro has no Balatro
 *    profile, so it is always the X1.25 branch.
 *  - Unregistered Hypercam 2: the mod's before_scoring_ctx lovely patch (SMODS.calculate_context
 *    {mf_before_cards} right after the blind's modify_hand) is the `modify_scoring` hook at step
 *    'before_cards'; without Talisman the mod gives Xmult_mod = mult^(mult^0.04 - 1), i.e.
 *    mult -> mult^(mult^0.04) (its "^^1.04"). The watermark overlay is visual only (not drawn).
 *  - MS Paint Joker: Steamodded's CardArea:change_size no longer draws, so the Lua also calls
 *    SMODS.draw_cards(4); Micatro's change_size (the base game's) draws the 4 cards itself while a hand
 *    is being drawn, so only the size change is made — the same 4 cards are drawn either way.
 *  - Philosophical Joker: its G.FUNCS.check_for_buy_space / can_select_card wraps are the `buy_space` hook.
 *  - Expansion Pack: the vanilla-joker temp-ban is util.modded_begin/modded_end (every base-game joker
 *    is left out while it is raised — see extras.js for the Modded-pack fix that covers it too).
 *  - Steamodded evaluates a joker's end_of_round with cardarea = G.jokers; Micatro's end-of-round joker
 *    pass has no cardarea, so `context.cardarea == G.jokers` there reads as the main (non-individual) pass.
 */
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_CENTERS, P_CARDS, create_card, create_playing_card, ease_dollars, ease_discard, ease_hands_played,
  probability_roll, probability_vars, pseudorandom_element, pseudoseed, localize, juice_card, card_eval_status_text,
} from '../../js/engine/core.js';
import { joker, find, has, room, say, remove_joker, modded_begin, modded_end, scale_card, RANKS, SUITS_T } from './util.js';

/** The main (non-individual, non-repetition) end_of_round pass for jokers. */
const eor = (ctx) => ctx.end_of_round && !ctx.individual && !ctx.repetition && (ctx.cardarea === undefined || ctx.cardarea === G.jokers);
const next = (t) => !!(t && t.length);

export const centers = [];
const J = (slug, def) => centers.push(joker(slug, def));

// Basepaul Card
J('basepaul_card', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult, card.ability.extra.x_mult * 10] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.x_mult] }), Xmult_mod: card.ability.extra.x_mult };
    }
  },
});

// Blahaj
J('blahaj', {
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main) return { swap: true, message: localize('k_swap_ex') };
  },
});

// Clownfish
J('clownfish', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.ability.name !== 'Default Base') {
      return { chips: card.ability.extra.chips, mult: card.ability.extra.mult, card };
    }
  },
});

// Expansion Pack
J('expansion_pack', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !card.getting_sliced && !(ctx.blueprint_card || card).getting_sliced && G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit) {
      const jokers_to_create = Math.floor(Math.min(card.ability.extra, G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer)));
      G.GAME.joker_buffer = G.GAME.joker_buffer + jokers_to_create;
      modded_begin();
      G.E_MANAGER.add_event(() => {
        for (let i = 1; i <= jokers_to_create; i++) {
          const n_card = create_card('Joker', G.jokers, null, null, null, null, null, undefined); // (SMODS.add_card: no key_append)
          n_card.add_to_deck();
          G.jokers.emplace(n_card);
          G.GAME.joker_buffer = 0;
        }
        modded_end();
      });
      return { message: localize('k_plus_joker'), colour: 'BLUE' };
    }
  },
});

// Hollow Joker
J('hollow', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.h_size, card.ability.extra.mult_per, card.ability.extra.thresh] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main && G.hand.config.card_limit < card.ability.extra.thresh) {
      const m = card.ability.extra.mult_per * (card.ability.extra.thresh - G.hand.config.card_limit);
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [m] }), mult_mod: m };
    }
  },
});

// Jack of all Trades
J('jackofalltrades', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult, card.ability.extra.chips, card.ability.extra.dollars] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.hand && !ctx.end_of_round && ctx.other_card.get_id() === 11) {
      return { mult: card.ability.extra.mult, chips: card.ability.extra.chips, dollars: card.ability.extra.dollars };
    }
  },
});

// Jester
J('jester', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), chip_mod: card.ability.extra.chips, colour: 'CHIPS' };
    }
  },
});

// Lollipop
J('lollipop', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult, card.ability.extra.xmult_per] }),
  calculate(s, card, ctx) {
    if (ctx.end_of_round && !ctx.individual && !ctx.repetition && !ctx.blueprint && !ctx.retrigger_joker) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'xmult', scalar_value: 'xmult_per', operation: '-', message_key: 'a_xmult_minus', message_colour: 'PURPLE' });
      if (card.ability.extra.xmult <= 1.01) {
        remove_joker(card);
        return { message: localize('k_eaten_ex'), colour: 'FILTER' };
      }
    } else if (ctx.cardarea === G.jokers && ctx.joker_main) {
      return { xmult: card.ability.extra.xmult };
    }
  },
});

// Lucky Charm
J('luckycharm', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    const [n1, d1] = probability_vars(card, 1, e.mult_chance, 'luckycharm_mult');
    const [n2, d2] = probability_vars(card, 1, e.money_chance, 'luckycharm_money');
    return { vars: [n1, d1, e.mult, n2, d2, e.money] };
  },
  calculate(s, card, ctx) {
    const e = card.ability.extra;
    if (ctx.end_of_round && !ctx.individual && !ctx.repetition && !ctx.blueprint) {
      if (probability_roll(card, 'lucky_charm_money', 1, e.money_chance, 'lucky_charm_money')) {
        return { dollars: e.money };
      }
    }
    if (ctx.cardarea === G.jokers && ctx.joker_main) {
      if (probability_roll(card, 'lucky_charm_mult', 1, e.mult_chance, 'lucky_charm_mult')) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [e.mult] }), mult_mod: e.mult };
      }
    }
  },
});

// MS Paint Joker
J('mspaint', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !ctx.blueprint && card.ability.h_size === 0) {
      card.ability.h_size = card.ability.h_size + card.ability.extra;
      G.hand.change_size(card.ability.extra);
    }
    if (ctx.after && !ctx.blueprint && card.ability.h_size !== 0 && ctx.cardarea === G.jokers) {
      G.E_MANAGER.add_event(() => { G.hand.change_size(-card.ability.extra); card.ability.h_size = 0; });
    }
  },
});

// Philosophical Joker
J('philosophical', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.slots] }),
  // (1.9.9999 changes the slot count in an event)
  add_to_deck(s, card) { G.E_MANAGER.add_event(() => { G.jokers.config.card_limit = G.jokers.config.card_limit + card.ability.extra.slots; }); },
  remove_from_deck(s, card) { G.E_MANAGER.add_event(() => { G.jokers.config.card_limit = G.jokers.config.card_limit - card.ability.extra.slots; }); },
});

// Simplified Joker
J('simplified', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.other_joker && ctx.other_joker.config.center.rarity === 1 && ctx.other_joker.ability.set === 'Joker') {
      juice_card(ctx.other_joker);
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), mult_mod: card.ability.extra.mult };
    }
  },
});

// Spiral Joker
const spiral_val = (e) => e.mult + Math.floor(e.coeff * Math.cos(Math.PI / e.dilation * (G.GAME ? G.GAME.dollars : 0)) + 0.5);
J('spiral', {
  loc_vars: (s, iq, card) => { const e = card.ability.extra; return { vars: [e.mult, e.coeff, e.dilation, spiral_val(e)] }; },
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      const val = spiral_val(card.ability.extra);
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [val] }), mult_mod: val };
    }
  },
});

// Treasure Map
J('treasuremap', {
  loc_vars: (s, iq, card) => { const e = card.ability.extra; return { vars: [e.c_rounds, e.rounds, e.money] }; },
  calculate(s, card, ctx) {
    const e = card.ability.extra;
    if (ctx.end_of_round && !ctx.individual && !ctx.repetition && !ctx.blueprint) {
      e.c_rounds = e.c_rounds + 1;
      return { message: e.c_rounds < e.rounds ? e.c_rounds + '/' + e.rounds : localize('k_active_ex'), colour: 'FILTER' };
    }
    if (ctx.selling_self && e.c_rounds >= e.rounds && !ctx.blueprint) {
      ease_dollars(e.money);
      return { message: localize('$') + e.money, colour: 'MONEY', card };
    }
  },
});

// Unregistered Hypercam 2 (behaviour: the modify_scoring hook below)
J('unregisteredhypercam', {
  loc_vars(s, iq, card) {
    iq.push({ key: 'tetr_explainer', set: 'Other', vars: [card.ability.val, Math.round((card.ability.val - 1) * 1e9) / 1e9] });
    return { vars: [card.ability.val] };
  },
  calculate(s, card, ctx) {
    if (ctx.mf_before_cards) {
      const mult = ctx.mf_mult;
      return { Xmult_mod: Math.pow(mult, Math.pow(mult, 0.04) - 1), message: '^^1.04 Mult', colour: 'DARK_EDITION' };
    }
  },
});

// ---------------------------------------------------------------- the spire uncommons
// Dropkick
J('dropkick', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.hands] }),
  calculate(s, card, ctx) {
    if (ctx.after && ctx.cardarea === G.jokers && ctx.poker_hands && next(ctx.poker_hands.Straight)) {
      ease_hands_played(card.ability.extra.hands);
      return { message: localize({ type: 'variable', key: 'a_plus_hand', vars: [card.ability.extra.hands] }), colour: 'BLUE' };
    }
  },
});

// Blade Dance (named "Dramatic Entrance" in its Lua)
J('bladedance', {
  loc_vars: (s, iq, card) => { iq.push({ key: 'm_steel', set: 'Enhanced', vars: [P_CENTERS.m_steel.config.h_x_mult] }); return { vars: [card.ability.extra] }; },
  calculate(s, card, ctx) {
    if (ctx.first_hand_drawn && !card.getting_sliced && !(ctx.blueprint_card || card).getting_sliced) {
      G.E_MANAGER.add_event(() => {
        const cards = [];
        for (let i = 1; i <= card.ability.extra; i++) {
          const _rank = pseudorandom_element(RANKS, pseudoseed('bladedance_create'))[0].card_key;
          const _suit = pseudorandom_element(SUITS_T, pseudoseed('bladedance_create'))[0].card_key;
          const c = create_playing_card({ front: P_CARDS[_suit + '_' + _rank], center: P_CENTERS.m_steel }, G.hand);
          c.ability.mf_temporary = true;
          cards.push(c);
        }
        // playing_card_joker_effects(cards)
        for (const j of G.jokers.cards.slice()) j.calculate_joker({ playing_card_added: true, cards });
      });
    }
  },
});

// Hyper Beam
J('hyperbeam', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !(ctx.blueprint_card || card).getting_sliced) {
      G.E_MANAGER.add_event(() => { ease_discard(-G.GAME.current_round.discards_left, true); });
    }
    if (ctx.cardarea === G.jokers && ctx.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra] }), Xmult_mod: card.ability.extra };
    }
  },
});

// Blasphemy
J('blasphemy', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult, card.ability.extra.hands_lost] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.before && !ctx.blueprint) ease_hands_played(-G.GAME.current_round.hands_left, true);
    if (ctx.cardarea === G.jokers && ctx.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.xmult] }), Xmult_mod: card.ability.extra.xmult };
    }
  },
});

// Dramatic Entrance
J('dramaticentrance', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main && G.GAME.current_round.hands_played === 0) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), chip_mod: card.ability.extra.chips };
    }
  },
});

// ---------------------------------------------------------------- other uncommons
// Bad Legal Defence
J('badlegaldefence', {
  loc_vars: (s, iq) => { iq.push({ key: 'c_death', set: 'Tarot', vars: [P_CENTERS.c_death.config.max_highlighted] }); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.setting_blind && ctx.blind && ctx.blind.boss && !(ctx.blueprint_card || card).getting_sliced) {
      if (room()) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          const n_card = create_card(null, G.consumeables, null, null, null, null, 'c_death', 'sup');
          n_card.add_to_deck();
          G.consumeables.emplace(n_card);
          G.GAME.consumeable_buffer = 0;
        });
        return { message: localize('k_death_caps'), colour: 'PURPLE' };
      }
    }
  },
});

// Blunder
J('blunder', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(s, card, ctx) {
    if (ctx.hand_drawn) {
      let any_forced = false;
      for (const v of G.hand.cards) if (v.ability.forced_selection) any_forced = true;
      if (!any_forced) {
        G.hand.unhighlight_all();
        const pool = G.hand.cards.slice();
        if (pool.length) {
          const [forced_card] = pseudorandom_element(pool, pseudoseed('blunder'));
          forced_card.ability.forced_selection = true;
          G.hand.add_to_highlighted(forced_card);
        }
      }
    }
    if (ctx.selling_self && !ctx.blueprint) {
      for (const v of G.hand.cards) v.ability.forced_selection = false;
      G.hand.unhighlight_all();
    }
    if (ctx.cardarea === G.jokers && ctx.joker_main) return { xmult: card.ability.extra };
  },
});

// Brilliant
J('brilliant', {
  calculate(s, card, ctx) {
    if (eor(ctx)) {
      if (G.GAME.current_round.hands_played <= 1 && room()) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          const c = create_card('Spectral', G.consumeables, null, null, null, null, null, 'sea');
          c.add_to_deck();
          G.consumeables.emplace(c);
          G.GAME.consumeable_buffer = 0;
        });
        return { message: localize('k_plus_spectral'), colour: 'Spectral', card };
      }
    }
  },
});

// The Broom Closet
J('broomcloset', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra, card.ability.active ? 'active!' : 'inactive'] }),
  calculate(s, card, ctx) {
    if (((ctx.buying_card && ctx.card !== card) || ctx.open_booster) && card.ability.active) {
      card.ability.active = false;
      return { message: localize('k_disabled_ex'), colour: 'RED' };
    }
    if (eor(ctx) && !ctx.blueprint) {
      card.ability.active = true;
      return { message: localize('k_reset') };
    }
    if (ctx.cardarea === G.jokers && ctx.joker_main && card.ability.active) return { xmult: card.ability.extra };
  },
});

// Cartomancer!
J('rot_cartomancer', {
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !(ctx.blueprint_card || card).getting_sliced) {
      if (room()) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          const n_card = create_card('Rotarot', G.consumeables, null, null, null, null, null, 'car');
          n_card.add_to_deck();
          G.consumeables.emplace(n_card);
          G.GAME.consumeable_buffer = 0;
        });
        say(card, localize('k_plus_rotarot'), 'PURPLE');
      }
    }
  },
});

// Clipart Joker
J('clipart', {
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !card.getting_sliced && !(ctx.blueprint_card || card).getting_sliced && room()) {
      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
      G.E_MANAGER.add_event(() => {
        G.E_MANAGER.add_event(() => {
          const c = create_card('Colour', G.consumeables, null, null, null, null, null, 'clipart');
          c.add_to_deck();
          G.consumeables.emplace(c);
          G.GAME.consumeable_buffer = 0;
        });
        say(ctx.blueprint_card || card, localize('k_plus_colour'), 'PURPLE');
      });
    }
  },
});

// Coupon Catalogue
const redeemed = () => Object.values(G.GAME.used_vouchers || {}).filter((v) => v === true).length;
J('coupon_catalogue', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult, redeemed() * card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main) {
      const n = redeemed();
      if (n > 0 && card.ability.extra.mult) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult * n] }), mult_mod: card.ability.extra.mult * n };
      }
    }
  },
});

// CSS
J('css', {
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main && room() && ctx.poker_hands) {
      if (next(ctx.poker_hands.Flush)) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        G.E_MANAGER.add_event(() => {
          G.E_MANAGER.add_event(() => {
            const c = create_card('Colour', G.consumeables, null, null, null, null, null, 'css');
            c.add_to_deck();
            G.consumeables.emplace(c);
            G.GAME.consumeable_buffer = 0;
          });
          say(ctx.blueprint_card || card, localize('k_plus_colour'), 'PURPLE');
        });
      }
    }
  },
});

// ------------------------------------------------------------------ hooks
export const hooks = {
  /** before_scoring_ctx.toml: {mf_before_cards} after modify_hand — Unregistered Hypercam 2. */
  modify_scoring([chips, mult], step, ctx) {
    if (step !== 'before_cards') return undefined;
    for (const j of G.jokers.cards.slice()) {
      if (j.config.center.key !== 'j_mf_unregisteredhypercam' || j.debuff) continue;
      const r = j.calculate_joker({ ...ctx, cardarea: G.jokers, mf_before_cards: true, main_eval: true, mf_mult: mult, mf_chips: chips });
      if (r && r.Xmult_mod) {
        mult = BN.mul(mult, r.Xmult_mod);
        card_eval_status_text(j, 'extra', null, null, null, { message: r.message, colour: r.colour });
      }
    }
    return [chips, mult];
  },
  /** G.FUNCS.check_for_buy_space / can_select_card: a Philosophical Joker always fits. */
  buy_space(card) {
    if (card.ability.name === 'Philosophical Joker' && card.ability.extra && card.ability.extra.slots >= 1) return true;
    return undefined;
  },
};
export { has, find };
