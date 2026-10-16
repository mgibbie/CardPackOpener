/**
 * Þe Autumn Circus — jokers, part A (36): LooksLikeTheJokers.lua, Standardized .. Gaudy Bracelet (the jokers
 * between the SixSuits pair and Twisted Mind; Paint Mixer needs SpectrumFramework and is skipped, like
 * Helpful / Dutiful Joker — util.joker() returns null for them anyway). Static fields come from data.js;
 * behaviour is a line-for-line port of each joker's Lua. Cryptid's context.forcetrigger branches are left out.
 *
 * Intended-design fixes (each marked "FIX (intended design)" at the item, each with a test that fails without it):
 *  1. Gift from the Void: the Lua's create_playing_card(..., G.deck) already puts the new card in the deck and
 *     then G.deck:emplace(_card) puts it there AGAIN — the deck held the same card twice (drawn twice, corrupting
 *     the hand). It is emplaced once.
 *  2. The C.S.I.: gated on `#G.graveyard > 1`, so a graveyard holding exactly one face card gave nothing while its
 *     text promised "+10 Chips for each face card (Currently +10)". The gate is "graveyard not empty" (the faces
 *     count already returns early at 0).
 *  3. Exorcist: the same `#G.graveyard > 1` gate, yet its body handles a one-card graveyard (`if temp_gy[2]`);
 *     a lone graveyard card was never exorcised. The gate is "graveyard not empty" (its in_pool is count > 0).
 *  4. Gallows Humor: text "X3 Mult if there are 15 or more cards in your graveyard", code `count > 15` (16+).
 *     It fires at 15 or more, as written.
 *
 * Port notes (Micatro equivalents, not behaviour changes):
 *  - Steamodded's card_added context (SMODS fires calculate_context({card_added, card}) at the end of
 *    Card:add_to_deck for non-playing cards, not from_debuff) — Clown Posse's trigger — is emitted by
 *    jokers_b.js's add_to_deck hook (one emitter for the whole mod, so it never fires twice).
 *  - Common Ground: Steamodded removes the vanilla first_hand_drawn call and fires first_hand_drawn together
 *    with hand_drawn once the cards are in hand (`not any_hand_drawn and facing_blind`). Micatro's hand_drawn
 *    context is that event, so Common Ground acts on it (the vanilla call comes before the draw: empty hand).
 *  - Transfusion: Steamodded evaluates a joker's main effect and all its retriggers BEFORE applying any of them
 *    (the global hand_chips is unchanged meanwhile) and the buffer carries what the earlier evaluations already
 *    converted; Micatro's joker_main context carries the running hand_chips as of the joker's turn into its
 *    retriggers too, so the buffer resets at each fresh (non-retrigger) evaluation instead of in a func.
 *  - Witch of Mind: the Lua's func re-runs SMODS.calculate_context(joker_main) mid-scoring. Micatro's func
 *    can't touch the running score, so the rescore happens when Witch is evaluated: every joker / consumable's
 *    joker_main (and its joker retriggers) is evaluated again with witch_of_mind_repeat set, and the results
 *    ride on Witch's return as its `extra` chain (applied in order, each with its own message card). The inner
 *    contexts carry a running hand_chips / mult. (Redeemed vouchers aren't rescored: Micatro has no G.vouchers.)
 *  - Lord of Void: #G.vouchers.cards (Steamodded's area of every applied voucher) is the count of redeemed
 *    vouchers, G.GAME.used_vouchers.
 *  - The Highest Number: the per-card return's func (the blind reduction) rides in its `extra` — Micatro's
 *    played-card loop runs `extra.func` but not a joker's top-level func.
 *  - Discarded Vessel: `pairs(AMM.Aspects)` (undefined order) is the aspects' registration order.
 *  - Steamodded evaluates a joker's end_of_round with cardarea = G.jokers; Micatro's end-of-round joker pass
 *    has no cardarea, so `context.cardarea == G.jokers` there reads as the main (non-individual) pass.
 *  - Dropped (cosmetic): art-credit tooltips, the 1-in-100 math.random() easter-egg tooltips (Witch of Mind,
 *    The Highest Number, the Specibi, Pseudo-Scratch Gambit, Discarded Vessel), update_hand_text, juice.
 *  - Daggerkind / Bladekind / Pokerkind / Combat Capability / Pseudo-Scratch Gambit are the mod's unfinished
 *    ("Work In Progress!") jokers: no effect, yes_pool_flag 'no' (never rolled), text from their inline loc_txt.
 */
import { G, P_CENTERS, P_CENTER_POOLS, P_CARDS_LIST, pseudoshuffle, ease_dollars } from '../../js/engine/core.js';
import { get_poker_hand_info, joker_retriggers } from '../../js/engine/run.js';
import {
  joker, data, AMM, chance, prob_vars, scale_card, localize, pseudorandom_element, pseudoseed, create_playing_card,
  playing_card_joker_effects, placeholder_jokers, context_strict_standard_hands, force_draw_cards, has_enhancement,
  has_no_suit, has_no_rank, juice_card,
} from './util.js';
import LOC from './loc.js';

const GY = AMM.GRAVEYARD;
/** The main (non-individual, non-repetition) end_of_round pass for jokers. */
const eor_main = (ctx) => ctx.end_of_round && !ctx.individual && !ctx.repetition && (ctx.cardarea === undefined || ctx.cardarea === G.jokers);
/** TheAutumnCircus.placeholder_jokers (memoised per pool build: it scans every center). */
let _ph_pool = null, _ph = [];
const PLACEHOLDERS = () => { if (_ph_pool !== P_CENTER_POOLS.Joker) { _ph_pool = P_CENTER_POOLS.Joker; _ph = placeholder_jokers(); } return _ph; };
const is_placeholder = (c) => PLACEHOLDERS().includes(c.config.center.key);
const s_ = (n) => (n > 1 ? 's' : '');
/** Steamodded's first_hand_drawn: fired with hand_drawn once the round's first hand is in. */
const first_hand_drawn = (ctx) => !!ctx.hand_drawn && !G.GAME.current_round.any_hand_drawn && !!G.GAME.facing_blind;

export const centers = [];
const J = (key, def) => { const c = joker(key, def); if (c) centers.push(c); return c; };
/** The mod's unfinished jokers: their name / subtitle / text are inline (loc_txt). */
const wip = (key, def = {}) => {
  const c = joker(key, def);
  if (!c) return;
  const s = data('Jokers', key);
  c.loc_txt = { name: [s.name, '{C:autumn,s:0.5}' + s.subtitle], text: s.text || [] };
  centers.push(c);
};

// ------------------------------------------------------------------ Standardized / Nonstandard
J('standardized', {
  loc_vars(s, iq, card) { iq.push({ key: 'thac_standard_hands', set: 'Other' }); return { vars: [card.ability.extra.Xmult] }; },
  calculate(s, card, ctx) {
    if (ctx.joker_main && context_strict_standard_hands(ctx)) return { xmult: card.ability.extra.Xmult };
  },
});
J('nonstandard', {
  loc_vars(s, iq, card) { iq.push({ key: 'thac_standard_hands', set: 'Other' }); return { vars: [card.ability.extra.Xmult] }; },
  calculate(s, card, ctx) {
    if (ctx.joker_main && !context_strict_standard_hands(ctx)) return { xmult: card.ability.extra.Xmult };
  },
});

// ------------------------------------------------------------------ Gift from the Void
J('gift_from_the_void', {
  loc_vars: () => ({ vars: [] }),
  calculate(s, card, ctx) {
    if (ctx.end_of_round && !ctx.individual && !ctx.repetition) {
      return {
        extra: {
          func() {
            G.deck.config.card_limit = G.deck.config.card_limit + 1;
            // FIX (intended design): create_playing_card(..., G.deck) already emplaces the card; the Lua's extra
            // G.deck:emplace(_card) put the same card in the deck twice. It goes in once.
            const _card = create_playing_card({ front: pseudorandom_element(P_CARDS_LIST(), pseudoseed('gftv'))[0], center: P_CENTERS.c_base }, G.deck);
            _card.set_edition({ negative: true }, null, true);
            G.GAME.blind.debuff_card(_card);
            juice_card(ctx.blueprint_card || card);
            playing_card_joker_effects([true]);
            return true;
          },
        },
        message: localize('k_thac_negative'),
      };
    }
  },
});

// ------------------------------------------------------------------ Lord of the Meek / Mirage Joker
J('lord_of_the_meek', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.retriggers, s_(card.ability.extra.retriggers)] }),
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check && ctx.other_card.config.center.rarity === 1) {
      return { repetitions: card.ability.extra.retriggers, card, colour: 'ORANGE', message: localize('k_again_ex') };
    }
  },
});
J('mirage_joker', {
  loc_vars(s, iq, card) {
    const [n, d] = prob_vars(card, 1, card.ability.extra.odds);
    return { vars: [n, d, card.ability.extra.retriggers, s_(card.ability.extra.retriggers)] };
  },
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check && !ctx.other_context.mod_probability && !ctx.other_context.fix_probability && ctx.other_card !== card
      && chance(card, 'mirage_joker', 1, card.ability.extra.odds)) {
      return { repetitions: card.ability.extra.retriggers, card, colour: 'ORANGE', message: localize('k_again_ex') };
    }
  },
});

// ------------------------------------------------------------------ Transfusion
J('transfusion', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.rate * 100, card.ability.extra.Xmult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      const e = card.ability.extra;
      if (!ctx.retrigger_joker) e.buffer = 0; // (port note: the Lua's func resets it once all evaluations applied)
      const hchips = ctx.hand_chips - e.buffer;
      const val = Math.floor(e.rate * hchips);
      e.buffer = e.buffer + val;
      return { chip_mod: -val, mult_mod: val * e.Xmult, card, colour: 'PURPLE', message: localize('k_thac_converted') };
    }
  },
});

// ------------------------------------------------------------------ Placeholder Joker / Filler Card / Test Print / sans / null
J('placeholder_joker', {
  loc_vars(s, iq, card) { const [n, d] = prob_vars(card, 1, card.ability.extra.odds); return { vars: [n, d] }; },
  calculate(s, card, ctx) {
    if (ctx.joker_main && chance(card, 'placeholder_joker', 1, card.ability.extra.odds)) {
      card.set_ability(P_CENTERS[pseudorandom_element(PLACEHOLDERS(), pseudoseed('placeholder_joker'))[0]]);
    }
  },
});
J('filler_card', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xchips, card.ability.extra.Xchips_curr] }),
  calculate(s, card, ctx) {
    if (ctx.individual && !ctx.repetition && !ctx.end_of_round && !ctx.blueprint && ctx.cardarea === G.play
      && ctx.other_card.config.center.set === 'Default' && !ctx.other_card.seal && !ctx.other_card.edition && !ctx.other_card.aspect) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'Xchips_curr', scalar_value: 'Xchips', message_colour: 'CHIPS' });
    }
    if (ctx.joker_main && card.ability.extra.Xchips_curr > 1) return { colour: 'CHIPS', xchips: card.ability.extra.Xchips_curr };
  },
});
J('test_print', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xchips] }),
  calculate(s, card, ctx) {
    if (ctx.other_joker && !ctx.end_of_round && is_placeholder(ctx.other_joker)) {
      return { card: ctx.blueprint_card || card, colour: 'CHIPS', xchips: card.ability.extra.Xchips };
    }
  },
});
J('sans', {
  loc_vars: () => ({ vars: [] }),
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check && is_placeholder(ctx.other_card)) {
      return { card: ctx.blueprint_card || card, colour: 'BLUE', repetitions: 1, message: localize('k_again_ex') };
    }
  },
});
J('null', {
  loc_vars(s, iq) { iq.push('e_negative'); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !(ctx.blueprint_card || card).getting_sliced) {
      const candidates = G.jokers.cards.filter((c) => is_placeholder(c) && !(c.edition && c.edition.negative));
      if (candidates.length) {
        return {
          card: ctx.blueprint_card || card,
          colour: 'JOKER_GREY',
          extra: { func() { pseudoshuffle(candidates, pseudoseed('null')); candidates[0].set_edition({ negative: true }); } },
          message: localize('k_thac_negative'),
        };
      }
    }
  },
});

// ------------------------------------------------------------------ Clown Posse
J('clown_posse', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult_curr] }),
  calculate(s, card, ctx) {
    if (ctx.card_added && ctx.card.ability.set === 'Joker' && !ctx.blueprint) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'Xmult_curr', scalar_value: 'Xmult_mod', message_colour: 'MULT' });
    }
    if (ctx.joker_main && card.ability.extra.Xmult_curr > 1) return { colour: 'MULT', xmult: card.ability.extra.Xmult_curr };
  },
});

// ------------------------------------------------------------------ Stellar Alignment
J('stellar_alignment', {
  loc_vars(s, iq, card) { iq.push('m_thac_star'); return { vars: [card.ability.extra.retriggers, s_(card.ability.extra.retriggers)] }; },
  calculate(s, card, ctx) {
    if (ctx.repetition && ctx.cardarea === G.play && ctx.other_card.config.center.key === 'm_thac_star') {
      const ret = card.ability.extra.retriggers * G.GAME.amm_data.suit_levels[ctx.other_card.base.suit].level;
      return { repetitions: ret, card, message: localize('k_again_ex'), colour: 'ORANGE' };
    }
  },
});

// ------------------------------------------------------------------ Knight of Heart
/** append_extra(ret, append): hang `append` at the end of ret's extra chain. */
function append_extra(ret, append) {
  while (ret.extra) ret = ret.extra;
  ret.extra = append;
  return ret;
}
const KNIGHT_LOC = LOC.descriptions.Joker.j_thac_knight_of_heart;
J('knight_of_heart', {
  // (its text is two SMODS boxes — nested lists, which describe.js can't fill: the boxes are flattened into
  // loc_txt and the description is pointed at it through a set with no entry)
  loc_txt: { name: KNIGHT_LOC.name, text: [].concat(...KNIGHT_LOC.text) },
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    return { set: 'thac_boxes', vars: [e.chips, e.curr_chips, e.mult, e.curr_mult, e.money, Math.floor(e.curr_money), e.Xmult, e.curr_Xmult] };
  },
  calculate(s, card, ctx) {
    const e = card.ability.extra;
    const ret = {};
    if (ctx.joker_main) {
      if (e.curr_chips > 0) append_extra(ret, { chips: e.curr_chips });
      if (e.curr_mult > 0) append_extra(ret, { mult: e.curr_mult });
      if (e.curr_Xmult > 1) append_extra(ret, { Xmult: e.curr_Xmult });
    }
    if (ctx.before && !ctx.blueprint) {
      let state = 0;
      const scale = (ref, sc, colour) => () => scale_card(card, { ref_table: e, ref_value: ref, scalar_value: sc, message_colour: colour });
      for (const v of ctx.scoring_hand) {
        if (v.base.suit === 'Hearts' || has_no_suit(v)) {
          // (v.ability.akyrs_special_card_type == "rank": Aikoyori's letter cards — not in Micatro)
        } else if (v.base.suit === 'Spades') {
          append_extra(ret, { func: scale('curr_chips', 'chips', 'CHIPS') });
          v.change_suit('Hearts');
          state = 1;
        } else if (v.base.suit === 'Clubs') {
          append_extra(ret, { func: scale('curr_mult', 'mult', 'MULT') });
          v.change_suit('Hearts');
          state = 1;
        } else if (v.base.suit === 'Diamonds') {
          const f = scale('curr_money', 'money', 'MONEY');
          append_extra(ret, { func() { f(); v.change_suit('Hearts'); } });
          state = 1;
        } else {
          const f = scale('curr_Xmult', 'Xmult', 'MULT');
          append_extra(ret, { func() { f(); v.change_suit('Hearts'); } });
          state = 1;
        }
      }
      if (state === 1) {
        append_extra(ret, { message: 'Hearts', colour: 'SUITS.Hearts', card, func() { for (const val of ctx.scoring_hand) juice_card(val); } });
      }
    }
    if (ret.extra) return ret.extra;
  },
  calc_dollar_bonus(s, card) {
    if (card.ability.extra.curr_money >= 1) return Math.floor(card.ability.extra.curr_money);
  },
});

// ------------------------------------------------------------------ Witch of Mind
/** The running score after an effect (and its extra chain) applies — what the next rescored joker sees. */
function after(eff, c, m) {
  let x = eff, guard = 0;
  while (x && typeof x === 'object' && guard++ < 20) {
    const ch = x.chip_mod ?? x.chips; if (ch) c += ch;
    const mu = x.mult_mod ?? x.mult; if (mu) m += mu;
    const xc = x.x_chips ?? x.xchips ?? x.Xchip_mod; if (xc !== undefined && xc !== 1) c *= xc;
    const xm = x.Xmult_mod ?? x.x_mult ?? x.xmult ?? x.Xmult; if (xm !== undefined && xm !== 1) m *= xm;
    if (x.swap) [c, m] = [m, c];
    x = x.extra;
  }
  return [c, m];
}
/** SMODS.calculate_context(joker_main) with witch_of_mind_repeat: every joker / consumable's main effect again. */
function rescore(ctx) {
  const ictx = { ...ctx, witch_of_mind_repeat: true, blueprint: undefined, blueprint_card: undefined, retrigger_joker: undefined };
  let c = ctx.hand_chips, m = ctx.mult;
  const head = {};
  let tail = head;
  const push = (j, eff) => {
    const copy = { ...eff, message_card: eff.message_card || j };
    let t = copy;
    while (t.extra && typeof t.extra === 'object') { t.extra = { ...t.extra }; t = t.extra; }
    tail.extra = copy;
    tail = t;
    if (typeof c === 'number' && typeof m === 'number') [c, m] = after(copy, c, m);
  };
  for (const area of [G.jokers, G.consumeables]) {
    for (const j of area.cards.slice()) {
      const jctx = { ...ictx, hand_chips: c, mult: m };
      const eff = j.calculate_joker(jctx);
      if (!eff) continue;
      push(j, eff);
      for (let t = joker_retriggers(j, jctx); t > 0; t--) {
        const ev2 = j.calculate_joker({ ...jctx, hand_chips: c, mult: m, retrigger_joker: true });
        if (ev2) push(j, ev2);
      }
    }
  }
  return head.extra;
}
J('witch_of_mind', {
  calculate(s, card, ctx) {
    if (ctx.joker_main && !ctx.retrigger_joker_check && !ctx.witch_of_mind_repeat) {
      const extra = rescore(ctx);
      return { message: localize('k_again_ex'), colour: '#50B250', extra };
    }
  },
});

// ------------------------------------------------------------------ Lord of Void
const voucher_count = () => (G.GAME && G.GAME.used_vouchers ? Object.values(G.GAME.used_vouchers).filter(Boolean).length : 0);
const void_vars = (card) => [
  card.ability.extra.Xmult,
  1 + card.ability.extra.Xmult * voucher_count(),
  G.consumeables ? G.consumeables.config.card_limit - G.consumeables.cards.length : 2,
];
J('lord_of_void', {
  loc_vars: (s, iq, card) => ({ vars: void_vars(card) }),
  calculate(s, card, ctx) {
    const vars = void_vars(card);
    if (ctx.joker_main && vars[1] > 1) return { Xmult: vars[1] };
    if (ctx.retrigger_joker_check && ctx.other_card === card && vars[2] > 0) {
      return { repetitions: vars[2], card, colour: 'ORANGE', message: localize('k_again_ex') };
    }
  },
});

// ------------------------------------------------------------------ The Highest Number
J('highest_number', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.reduction * 100] }),
  calculate(s, card, ctx) {
    const e = card.ability.extra;
    if (ctx.individual && !ctx.repetition && ctx.cardarea === G.play && !ctx.end_of_round && ctx.other_card.get_id() === 9 && !has_no_rank(ctx.other_card)) {
      const red = e.reduction;
      return {
        extra: {
          focus: card,
          message: localize({ type: 'variable', key: 'a_blind_minus_percent', vars: [red * 100] }),
          // (port note: the Lua's top-level func; Micatro's played-card loop runs extra.func)
          func() { G.E_MANAGER.add_event(() => { AMM.mod_blind(1 - red, null, true); }); },
        },
        card,
      };
    }
    if (eor_main(ctx) && G.GAME.blind.boss && ctx.main_eval && !ctx.blueprint) {
      e.reduction = e.reduction * (1 + e.level_factor);
      e.reduction = Math.floor(e.reduction * 100) / 100;
      e.level_factor = e.level_factor * e.level_factor_reduction;
      return { card, focus: card, message: localize('k_thac_lvup'), colour: 'RED' };
    }
  },
});

// ------------------------------------------------------------------ the unfinished ones (no effect, never rolled)
wip('daggerkind');
wip('bladekind');
wip('pokerkind');
wip('combat_capability');
wip('pseudoscratch', {
  loc_vars(s, iq) { iq.push('j_thac_knight_of_heart', 'j_thac_witch_of_mind', 'j_thac_lord_of_void'); return { vars: [] }; },
});

// ------------------------------------------------------------------ Astron't / Torrential / Landlord
J('astront', {
  loc_vars(s, iq, card) { const [n, d] = prob_vars(card, 1, card.ability.extra.odds); return { vars: [n, d] }; },
  calculate(s, card, ctx) {
    if (ctx.before && chance(card, 'astront', 1, card.ability.extra.odds)) {
      if (!has_no_suit(ctx.scoring_hand[0])) {
        const suit = ctx.scoring_hand[0].base.suit;
        return { func() { AMM.level_up_suit(ctx.blueprint_card || card, suit); }, card, message: localize('k_level_up_ex') };
      }
    }
  },
});
J('torrential', {
  loc_vars: () => ({ vars: [] }),
  calculate(s, card, ctx) {
    if (ctx.pre_discard) {
      const { poker_hands } = get_poker_hand_info(G.hand.highlighted);
      if (poker_hands.Flush && poker_hands.Flush.length) {
        const suit = G.hand.highlighted[0].base.suit;
        return { func() { AMM.level_up_suit(ctx.blueprint_card || card, suit); }, card, message: localize('k_level_up_ex') };
      }
    }
  },
});
J('landlord', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.money] }),
  calculate(s, card, ctx) {
    if (ctx.pre_discard) {
      const { poker_hands } = get_poker_hand_info(G.hand.highlighted);
      if (poker_hands['Full House'] && poker_hands['Full House'].length) {
        ease_dollars(card.ability.extra.money);
        return { message: localize('$') + card.ability.extra.money, colour: 'MONEY', card };
      }
    }
  },
});

// ------------------------------------------------------------------ Lost Sock
J('lost_sock', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.chips_curr] }),
  calculate(s, card, ctx) {
    if (ctx.before && !ctx.blueprint && G.play.cards.length === ctx.scoring_hand.length + 1) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'chips_curr', scalar_value: 'chips', message_colour: 'CHIPS' });
    }
    if (ctx.joker_main && card.ability.extra.chips_curr > 1) return { colour: 'CHIPS', chips: card.ability.extra.chips_curr };
  },
});

// ------------------------------------------------------------------ the graveyard jokers
J('the_csi', {
  loc_vars(s, iq, card) { iq.push({ key: 'graveyard', set: 'Other' }); return { vars: [card.ability.extra.chips, card.ability.extra.chips * GY.count_faces()] }; },
  calculate(s, card, ctx) {
    // FIX (intended design): the Lua gates on #G.graveyard > 1, so one face card in the graveyard gave nothing.
    if (ctx.joker_main && G.graveyard.length > 0) {
      const faces = GY.count_faces();
      if (faces === 0) return;
      return { colour: 'CHIPS', chips: card.ability.extra.chips * faces };
    }
  },
  in_pool: () => GY.count_faces() > 0,
});
J('exorcist', {
  loc_vars(s, iq, card) {
    iq.push({ key: 'graveyard', set: 'Other' });
    const e = card.ability.extra;
    return { vars: [e.targets === 1 ? 'a' : e.targets, e.targets === 1 ? '' : 's', e.Xmult_mod, e.Xmult_curr] };
  },
  calculate(s, card, ctx) {
    // FIX (intended design): the Lua gates on #G.graveyard > 1 although it handles a one-card graveyard below.
    if (ctx.setting_blind && !ctx.blueprint && !card.getting_sliced && G.graveyard.length > 0) {
      const temp_gy = GY.get_cards(); // (G.graveyard itself, shuffled in place like the Lua)
      let success = 0;
      pseudoshuffle(temp_gy, pseudoseed('exorcism'));
      const second = temp_gy[1], first = temp_gy[0];
      if (second) { AMM.remove_from_game(second); success += 1; }
      if (first) { AMM.remove_from_game(first); success += 1; }
      for (let i = 1; i <= success; i++) scale_card(card, { ref_table: card.ability.extra, ref_value: 'Xmult_curr', scalar_value: 'Xmult_mod', message_colour: 'MULT' });
    }
    if (ctx.joker_main && card.ability.extra.Xmult_curr > 1) return { colour: 'MULT', xmult: card.ability.extra.Xmult_curr };
  },
  in_pool: () => GY.count_cards() > 0,
});
J('gallows_humor', {
  loc_vars(s, iq, card) { iq.push({ key: 'graveyard', set: 'Other' }); return { vars: [card.ability.extra.Xmult, card.ability.extra.targets, GY.count_cards()] }; },
  calculate(s, card, ctx) {
    // FIX (intended design): the text says "15 or more cards"; the Lua tested count > 15.
    if (ctx.joker_main && GY.count_cards() >= card.ability.extra.targets) return { colour: 'MULT', xmult: card.ability.extra.Xmult };
  },
  in_pool: () => GY.count_cards() > 0,
});
J('common_ground', {
  loc_vars(s, iq, card) {
    iq.push({ key: 'graveyard', set: 'Other' });
    const n = Math.floor(card.ability.extra.cards);
    return { vars: [n === 1 ? 'an' : n, n !== 1 ? 's' : '', GY.count_different_ranks()] };
  },
  calculate(s, card, ctx) {
    if (first_hand_drawn(ctx)) {
      const gy_ranks = GY.count_different_ranks();
      if (gy_ranks === 0) return;
      force_draw_cards(Math.floor(card.ability.extra.cards) * gy_ranks);
    }
  },
  in_pool: () => GY.count_cards() > 0,
});
J('tombstone', {
  loc_vars(s, iq, card) {
    iq.push({ key: 'graveyard', set: 'Other' }, 'm_stone');
    return { vars: [card.ability.extra.Xchips, 1 + card.ability.extra.Xchips * GY.count_center(P_CENTERS.m_stone)] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      const gy_stones = GY.count_center(P_CENTERS.m_stone);
      if (gy_stones > 0) return { colour: 'CHIPS', xchips: 1 + card.ability.extra.Xchips * gy_stones };
    }
  },
  in_pool: () => GY.count_center(P_CENTERS.m_stone) > 0,
});

// ------------------------------------------------------------------ Gem Joker
J('gem_joker', {
  loc_vars(s, iq, card) { iq.push('m_thac_jewel'); return { vars: [card.ability.extra.Xchips] }; },
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.hand && has_enhancement(ctx.other_card, 'm_thac_jewel') && !ctx.end_of_round) {
      return { card: ctx.other_card, xchips: card.ability.extra.Xchips };
    }
  },
});

// ------------------------------------------------------------------ Discarded Vessel
J('discarded_vessel', {
  loc_vars(s, iq, card) { const [n, d] = prob_vars(card, 1, card.ability.extra.odds); return { vars: [n, d] }; },
  calculate(s, card, ctx) {
    if (ctx.discard && ctx.other_card.aspect == null && chance(card, 'discarded_vessel', 1, card.ability.extra.odds)) {
      const keyset = AMM.active_aspects().map((a) => a.key);
      const god_tier = pseudorandom_element(keyset, pseudoseed('god_tier'))[0];
      AMM.set_aspect(ctx.other_card, god_tier);
    }
  },
});

// ------------------------------------------------------------------ Afterlife Archive
const gy_4_9 = () => GY.count_rank('4') + GY.count_rank('9');
J('afterlife_archive', {
  loc_vars(s, iq, card) {
    iq.push({ key: 'graveyard', set: 'Other' });
    return { vars: [Math.floor(card.ability.extra.money), Math.floor(card.ability.extra.money) * gy_4_9()] };
  },
  calc_dollar_bonus: (s, card) => Math.floor(card.ability.extra.money) * gy_4_9(),
  in_pool: () => GY.count_rank('4') > 0 || GY.count_rank('9') > 0,
});

// ------------------------------------------------------------------ Jokermancer
J('jokermancer', {
  loc_vars(s, iq, card) { iq.push({ key: 'graveyard', set: 'Other' }); return { vars: [card.ability.extra.mult] }; },
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && !ctx.end_of_round) {
      const oc = ctx.other_card;
      const no_suit = has_no_suit(oc), no_rank = has_no_rank(oc);
      const suit_check = (v) => { for (const k of AMM.suit_buffer()) if (v.is_suit(k) && oc.is_suit(k)) return true; return false; };
      const rank_check = (v) => v.base.value === oc.base.value && !has_no_rank(v);
      let gy_matches = 0;
      if (no_suit) {
        if (no_rank) return;
        gy_matches = GY.filter_count(rank_check);
      } else if (no_rank) gy_matches = GY.filter_count(suit_check);
      else gy_matches = GY.filter_count((v) => rank_check(v) || suit_check(v));
      if (gy_matches === 0) return;
      return { card: oc, mult: gy_matches * card.ability.extra.mult };
    }
  },
  in_pool: () => GY.count_cards() > 5,
});

// ------------------------------------------------------------------ Gaudy Bracelet
J('gaudy_bracelet', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.chips_curr] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && has_enhancement(ctx.other_card, 'm_thac_jewel') && !ctx.end_of_round && !ctx.blueprint) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'chips_curr', scalar_value: 'chips', message_colour: 'CHIPS' });
    }
    if (ctx.joker_main && card.ability.extra.chips_curr > 1) return { colour: 'CHIPS', chips: card.ability.extra.chips_curr };
  },
});

// ======================================================================= hooks
// (Steamodded's card_added context, which Clown Posse reads, is emitted once for all of Þe Autumn Circus by
// jokers_b.js's add_to_deck hook: calculate_context({card_added, card}) for a non-playing card, not from_debuff.)
export const hooks = {};
