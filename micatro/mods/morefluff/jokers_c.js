/**
 * More Fluff jokers, part C (26): Recycling, Virtual Joker, Wild Draw Four, Yucky Rat, All I Can't Do,
 * Blood Pact, Book Move ("Treasure Map" in the 1.5.6 Lua), Brass Joker, Bowling Ball, Card Buffer Advanced,
 * Flesh Prison, grep, Huge Joker, Hyperjimbo, Jankman, Mashup Album, Pixel Joker, Rainbow Joker,
 * Rose-Tinted Glasses, The Solo, Top 10 Jokers From 1 To 10, Wide Joker, Triangle, Marigold, Less Fluff and the
 * Token-rarity "Oops! All 5s" (oopsallfives).
 * Ported from More Fluff 1.9.9999 src/jokers/<file>.lua (numbers from data.js, the mod's own); Virtual Joker, Wild
 * Draw Four, Flesh Prison, Mashup Album and Rose-Tinted Glasses are retired upstream to the hidden "Old Fluff"
 * rarity (still registered, never in a shop: see index.js). Triangle keeps its 1.5.6 behaviour for now (legacy.js).
 * Complexity Creep was deleted in 1.9.9999 (its key is a retired card: js/mods/aliases.js).
 * Cryptid's `context.forcetrigger` branches are left out (Cryptid isn't part of Micatro).
 *
 * Lua -> Micatro:
 *  - Hyperjimbo's context.initial_scoring_step (1.5.6: mf_before_cards, lovely/before_scoring_ctx.toml) -> the
 *    `modify_scoring` hook, step 'before_cards'; without Talisman the mod itself uses chips -> chips^(chips^0.04)
 *    (its "^^1.04" tetration approximation) — used here.
 *  - Wide Joker returns {emult: 1.14} (^1.14 Mult; the engine applies ^) = the mod's own non-Talisman fallback.
 *  - All I Can't Do: SMODS.debuff_card(c, true/false, 'allicantdo') -> ability.debuff_sources.allicantdo
 *    + a debuff recalculation; the Game:update_round_eval wrap that clears it on deck cards -> the
 *    `evaluate_round` hook (adds no cash-out rows).
 *  - "Modded" (Jankman, Less Fluff) = a joker from any mod (center.mod; the Lua's center.original_mod).
 *    Jankman's text says "(and also Jolly Joker)", so Jolly Joker counts, as written (1.5.6 port fix, kept).
 *  - SMODS.scale_card (All I Can't Do, Yucky Rat, The Solo, Mashup Album, Less Fluff) -> util.scale_card.
 *
 * INTENDED-DESIGN FIXES (pinned in micatro/tests/mods/morefluff_jokers_c_test.mjs):
 *  4. Less Fluff's "X#1#" popup used the variable key 'x_mult' (not a key: no text); it uses a_xmult (1.9.9999 too).
 */
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_CENTERS, create_card, copy_card, pseudorandom, pseudoseed, pseudorandom_element, probability_roll,
  probability_vars, localize, ease_dollars, number_format, emit, card_eval_status_text,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { get_poker_hand_info, joker_retriggers } from '../../js/engine/run.js';
import { joker, room, say, remove_joker, has_enh, progressbar, scale_card, is_colour } from './util.js';

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
        e.scale_by = gain;
        scale_card(card, { ref_table: e, ref_value: 'x_mult', scalar_value: 'scale_by', message_key: 'a_xmult' });
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
        e.scale_by = mod;
        scale_card(card, { ref_table: e, ref_value: 'x_mult', scalar_value: 'scale_by', message_key: 'a_xmult' });
      }
    }
    if (context.cardarea === G.jokers && context.joker_main) return { xmult: e.x_mult };
  },
});

// ------------------------------------------------------------------ Blood Pact
J('bloodpact', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult] }),
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
      } else return { xmult: card.ability.extra.xmult };
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
      if (retrigger_card && retrigger_card === context.other_card && context.other_card !== card) return { message: localize('k_again_ex'), repetitions: 1, card };
    }
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
      say(card, 'X' + card.ability.extra.boss_size + ' Blind Size'); // (1.9.9999 returns {xblindsize = 5})
    }
    if (eor(context) && !context.blueprint && G.GAME.blind.boss && !card.gone) {
      G.E_MANAGER.add_event(() => {
        const c = create_card(null, G.consumeables, null, null, null, null, 'c_soul', undefined); // (SMODS.add_card)
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
      const found = G.deck.cards.filter(m).length;
      return { message: localize({ type: 'variable', key: 'a_searched', vars: [found] }) };
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
      if (h_card.is_suit('Hearts') || h_card.is_suit('Diamonds')) scale_card(card, { ref_table: e, ref_value: 'mult', scalar_value: 'mult_gain' });
      else scale_card(card, { ref_table: e, ref_value: 'chips', scalar_value: 'chips_gain' });
      return undefined;
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
    if (context.other_consumeable && is_colour(context.other_consumeable)) {
      return { xmult: card.ability.extra };
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
      scale_card(card, { ref_table: e, ref_value: 'x_mult', scalar_value: 'x_mult_gain', message_key: 'a_xmult' });
      return undefined;
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
        if (!c.mod || other === card) continue; // (1.9.9999: every modded joker but itself — another Less Fluff too)
        gained += 1;
        other.getting_sliced = true;
        G.E_MANAGER.add_event(() => { other.start_dissolve(); });
      }
      if (gained > 0) {
        for (let i = 0; i < gained; i++) scale_card(card, { ref_table: e, ref_value: 'x_mult', scalar_value: 'x_mult_per' });
        return { message: axmult(e.x_mult), colour: 'RED' }; // fix 4 (fixed upstream too)
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
