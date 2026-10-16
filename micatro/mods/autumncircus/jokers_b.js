/**
 * Þe Autumn Circus — jokers, part B (37): LooksLikeTheJokers.lua from Twisted Mind to Amalgam Joker — Twisted Mind,
 * Joke Book of the Dead, Gravedigger, Matchbook, Dark Hallway, Triplicate Soul, Grasp of Emptiness, Shut-In,
 * Ace in the Hole, Underdog's Secret, Topple the Titans, Autoapotheosis, Amalgamiter, Somber Snowfall, Grave Legion,
 * Scrapper, Snecko Eye, Hardlyquin, Golden Ratio, Whispers of Beyond, Jet Worldmage, Ruby Sunmage, Opal Moonmage,
 * Coven Joker, Cartowomancer + Cartowomancer! (MoreFluff cross-mod), the Homestuck line (nekoGloop, autumnMood, the
 * unnamed third Player "j_thac_", Knight of Heart, Witch of Mind, Lord of Void), Stirring Graves, Amalgam Joker —
 * and Emojiokers.lua: 🃏 :joker:, 🎨 :art: (MoreFluff cross-mod, never in the pool), 🆓 :free:.
 * Skipped: :currency_exchange: (needs pta_saka's Pyroxenes; util.joker returns null), and the part-B entries that
 * need mods Micatro doesn't ship (Celestial Awe, Penumbra Phantasm, Amethyst Starmage, Onyx Moonmage, Meteorite,
 * Olivine — see index.js). Cosmetic drops: art-credit tooltips, pronouns, the 1% joke tooltips (math.random),
 * card flip / juice animations (Snecko Eye's flips), Cryptid's forcetrigger.
 *
 * SMODS contexts the engine doesn't emit, rebuilt from this module's hooks:
 *   final_scoring_step + hand_chips / mult (Underdog's Secret, Topple the Titans, Autoapotheosis read the running
 *        score)  -> modify_scoring('final_scoring_step'): each such joker (and a Blueprint / Brainstorm copying one)
 *        is evaluated with the running score, in joker order, its effect applied like SMODS.calculate_effect
 *   card_added (SMODS: calculate_context at the end of Card:add_to_deck, non-playing cards, not from_debuff)
 *        -> add_to_deck hook -> calculate_context({card_added, card}) (Lord of Void)
 *   debuff_card -> prevent_debuff (nekoGloop, Knight of Heart) -> set_debuff hook
 *   Twisted Mind's graveyard scoring -> held_cards_scored + G.scoring.score_held (see fix 1)
 *   :free:'s update() in the shop (Lua runs it every frame) -> emplace hook (G.shop_jokers) + its update()
 *   G.I.CARDAREA (autumnMood / Witch of Mind count every card area holding exactly 3 cards) -> G.areas (jokers,
 *        consumables, hand, play, deck, discard, shop jokers / vouchers / boosters, pack — Micatro empties the
 *        shop / pack areas when they close, like the Lua removing them), AMM's G.graveyard_area (a CardArea in Lua
 *        too), and SMODS's G.vouchers area (one card per applied voucher) counted from G.GAME.used_vouchers.
 *
 * INTENDED-DESIGN FIXES (each pinned in micatro/tests/mods/autumncircus_jokers_b_test.mjs, failing when reverted):
 *  1. Twisted Mind: its calculate read `context.other_card.area` before checking anything (every context without
 *     other_card — joker_main, setting_blind, the probability passes — crashed), and it waited for graveyard cards
 *     to be evaluated individually, which never happens: it did nothing. "Cards in your graveyard are scored as if
 *     they were held in your hand": after the held cards score, each graveyard card is scored as held
 *     (SMODS.score_card with cardarea G.hand, as its calculate does), once per Twisted Mind owned and not debuffed.
 *  2. Opal Moonmage: its repetition branch ran for HELD cards too (index 0 in G.play), so an unscored Club played
 *     first retriggered every card held in hand. "retrigger the cards to their left and right" — only played cards.
 *  3. Ruby Sunmage: the unscored-Heart scaling has no `not context.blueprint` guard (the author's other scaling
 *     jokers have it), so a Blueprint / Brainstorm copying it scaled Ruby's own counter a second time. Copies now
 *     only copy its +Mult.
 *
 * Approximations (engine seams this file works around):
 *  - Opal Moonmage's second neighbour retrigger rides in `extra` in the Lua (SMODS.insert_repetitions walks the
 *    extra chain); the engine only reads the top-level `repetitions`, so one return carries both (repetitions 2).
 *    Its card list holds sort ids (the Lua kept Card objects in ability.extra, which a save can't hold).
 *  - Grave Legion's top-level `func` sits inside its `extra` (the per-card G.play loop only runs extra.func).
 *  - card_added fires from the START of Card:add_to_deck here (the engine's add_to_deck hook), the end in SMODS: Lord
 *    of Void sets Negative without set_edition's slot (add_to_deck's own Negative bookkeeping then adds it once),
 *    and its shatters are queued. Wished-for seam: an add_to_deck hook at the end of Card:add_to_deck.
 *  - Snecko Eye answers hand_drawn only (the engine doesn't emit SMODS's other_drawn).
 *  - Homelatro's "hmlt_extinct" / "hmlt_safe" strings aren't in Micatro: they fall back to vanilla's
 *    "Extinct!" / "Safe!" (k_extinct_ex / k_safe_ex).
 *  - The Homestuck jokers' text is SMODS multi-box (arrays of line arrays), which describe()'s fill() can't read
 *    (it crashed): their boxes are flattened into one line list at load (a describe.js box seam would keep them apart).
 *  - With Pokermon on, TAC's lovely patch stops the Silver Seal from triggering on a graveyard card scored by
 *    Twisted Mind: the card is flagged `discarded` (the seal's own guard) while it scores.
 */
import {
  G, P_CENTERS, localize, pseudorandom, pseudoseed, pseudorandom_element, create_playing_card, playing_card_joker_effects,
  card_eval_status_text, play_sound, juice_card, joker, find, say, chance, prob_vars, scale_card, change_base, poll_seal,
  has_no_suit, has_no_rank, has_any_suit, RANKS, AMM,
} from './util.js';
import { pseudoshuffle, copy_card, ease_dollars, ease_discard, poll_edition, eval_card } from '../../js/engine/core.js';
import { calculate_context, smods_effect, joker_retriggers } from '../../js/engine/run.js';
import { isActive } from '../../js/mods/registry.js';
import LOC from './loc.js';

const J = [];
const add = (key, def) => { const c = joker(key, def); if (c) J.push(c); return c; };
const K = (key) => 'j_thac_' + key;
const GRAVE = { key: 'graveyard', set: 'Other' };
const PET = { key: 'petting', set: 'Other' };
const gy_count = () => AMM.GRAVEYARD.count_cards();
const gy_in_pool = () => gy_count() > 0;
/** SMODS's end_of_round pass over the joker row (cardarea G.jokers; the engine's pass carries main_eval). */
const jokers_eor = (ctx) => ctx.end_of_round && !ctx.repetition && !ctx.individual && (ctx.cardarea === G.jokers || ctx.main_eval);
const unscored = (ctx) => ctx.individual && ctx.cardarea === 'unscored' && !ctx.end_of_round;
/** A localized string, or vanilla's when the key isn't in Micatro (Homelatro's own strings). */
const L = (key, fallback) => { const s = localize(key); return s === key && fallback ? localize(fallback) : s; };
/** A card shown outside a run area (the collection / describeCenter): Lua `card.area.config.collection`. */
const in_collection = (card) => !card.area || (card.area.config && card.area.config.collection);
/** Negative jokers, consumables and playing cards. */
function negatives() {
  let n = 0;
  for (const list of [G.playing_cards, G.jokers && G.jokers.cards, G.consumeables && G.consumeables.cards]) {
    for (const v of list || []) if (v.edition && v.edition.negative) n++;
  }
  return n;
}
/** G.I.CARDAREA: card areas holding exactly `n` cards (see the header for which areas). */
function areas_with(n) {
  let zones = 0;
  for (const a of [...(G.areas || []), G.graveyard_area]) if (a && a.cards && a.cards.length === n) zones++;
  const vouchers = Object.keys((G.GAME && G.GAME.used_vouchers) || {}).filter((k) => G.GAME.used_vouchers[k]).length;
  if (vouchers === n) zones++;
  return zones;
}

// ------------------------------------------------------------------ Twisted Mind
// FIX (intended design, header 1): the Lua calculate (`if context.other_card.area == G.graveyard_area and
// context.individual then SMODS.score_card(...)`) crashed on every context without other_card and never saw a
// graveyard card; the scoring is done by the held_cards_scored hook below.
add('twisted_mind', {
  loc_vars: (s, iq) => { iq.push(GRAVE); return { vars: [] }; },
  calculate() { return undefined; },
  in_pool: gy_in_pool,
});
/** Score every graveyard card as held, once per Twisted Mind (SMODS.score_card, cardarea G.hand). */
function twisted_mind_scoring() {
  if (!G.scoring || !G.graveyard) return;
  for (const tm of find(K('twisted_mind'))) {
    void tm;
    for (const gy of AMM.GRAVEYARD.get_cards().slice()) {
      // (TAC's lovely patch: Pokermon's Silver Seal doesn't trigger on a graveyard card — its own guard is `discarded`)
      const silver = isActive('pokermon') && gy.seal === 'poke_silver';
      const was = gy.ability.discarded;
      if (silver) gy.ability.discarded = true;
      try { G.scoring.score_held(gy); } finally { if (silver) gy.ability.discarded = was; }
    }
  }
}

// ------------------------------------------------------------------ Joke Book of the Dead
add('joke_book_of_the_dead', {
  loc_vars(s, iq, card) {
    iq.push(GRAVE);
    const e = card.ability.extra;
    return { vars: [Math.floor(e.discards), Math.floor(e.discards) !== 1 ? 's' : '', Math.floor(e.targets), Math.floor(e.discards) * Math.floor(gy_count() / Math.floor(e.targets))] };
  },
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !card.getting_sliced && !(ctx.blueprint_card || card).getting_sliced) {
      const tally = Math.floor(gy_count() / Math.floor(card.ability.extra.targets));
      const d_rate = Math.floor(card.ability.extra.discards);
      if (tally === 0 || d_rate === 0) return undefined;
      ease_discard(d_rate * tally);
      return { message: localize('k_thac_heeheehee'), colour: 'RED' };
    }
    return undefined;
  },
  in_pool: gy_in_pool,
});

// ------------------------------------------------------------------ Gravedigger
add('gravedigger', {
  loc_vars: (s, iq, card) => { iq.push(GRAVE); return { vars: [Math.floor(card.ability.extra.money)] }; },
  calculate(s, card, ctx) {
    if (ctx.amm_buried_card) {
      ease_dollars(Math.floor(card.ability.extra.money));
      return { message: '$' + Math.floor(card.ability.extra.money), colour: 'MONEY' };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Matchbook
add('matchbook', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    return { vars: [e.Xmult, Math.floor(e.targets), Math.floor(e.targets) !== 1 ? 's' : '', Math.floor(e.targets_curr), Math.floor(e.targets_curr) !== 1 ? 's' : ''] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main) return { xmult: card.ability.extra.Xmult };
    if (!ctx.blueprint) {
      if (ctx.setting_blind) card.ability.extra.targets_curr = Math.floor(card.ability.extra.targets);
      if (ctx.destroying_card && card.ability.extra.targets_curr > 0) {
        card.ability.extra.targets_curr -= 1;
        return true; // (SMODS: `true` = {remove = true})
      }
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Dark Hallway
add('dark_hallway', {
  loc_vars(s, iq, card) {
    const t = Math.floor(card.ability.extra.targets);
    const blah = t !== 1 ? 's' : '';
    return { vars: [blah, t === 1 ? 'a' : t, blah] };
  },
  calculate(s, card, ctx) {
    if (ctx.setting_blind) {
      const temp_deck = G.playing_cards.slice();
      const destroyed_cards = [];
      pseudoshuffle(temp_deck, pseudoseed('dark_hallway'));
      for (let i = temp_deck.length; i >= temp_deck.length - Math.floor(card.ability.extra.targets - 1) && i >= 1; i--) destroyed_cards.push(temp_deck[i - 1]);
      G.E_MANAGER.add_event(() => {
        for (let i = destroyed_cards.length - 1; i >= 0; i--) {
          const c = destroyed_cards[i];
          if (c.ability.name === 'Glass Card') c.shatter(); else c.start_dissolve();
        }
      });
      // SMODS.calculate_context({remove_playing_cards = true, removed = destroyed_cards}) — every joker
      for (const j of G.jokers.cards.slice()) eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: destroyed_cards });
      return true;
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Triplicate Soul
add('triplicate_soul', {
  loc_vars(s, iq, card) {
    iq.push(GRAVE);
    const n = Math.floor(card.ability.extra.cards);
    return { vars: [n, n === 1 ? 'y' : 'ies'] };
  },
  calculate(s, card, ctx) {
    if (ctx.amm_buried_card) {
      for (let i = 1; i <= Math.floor(card.ability.extra.cards); i++) {
        const _card = copy_card(ctx.other_card, null, null, G.playing_card);
        G.graveyard_area.emplace(_card);
        G.graveyard.push(_card);
        _card.playing_card = G.graveyard.length;
        _card.graveyard = true;
      }
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_copied_ex'), colour: 'JOKER_GREY', instant: true });
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Grasp of Emptiness
add('grasp_of_emptiness', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xmult] }),
  calculate(s, card, ctx) {
    if (unscored(ctx)) return { xmult: card.ability.extra.Xmult };
    return undefined;
  },
});

// ------------------------------------------------------------------ Shut-In
add('shutin', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (unscored(ctx)) {
      ctx.other_card.ability.perma_mult = (ctx.other_card.ability.perma_mult || 0) + card.ability.extra.mult;
      return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Ace in the Hole
add('ace_in_the_hole', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.money] }),
  calculate(s, card, ctx) {
    if (unscored(ctx) && ctx.other_card.get_id() === 14) return { dollars: card.ability.extra.money };
    if (ctx.destroy_card && ctx.cardarea === 'unscored' && ctx.destroy_card.get_id() === 14) return { remove: true };
    return undefined;
  },
});

// ---------------------------------------- Underdog's Secret / Topple the Titans / Autoapotheosis (final_scoring_step)
/** The running score at final_scoring_step (Lua globals hand_chips / mult), passed by this module's modify_scoring hook. */
const final_step = (ctx) => ctx.final_scoring_step && ctx.thac_final_step;
add('underdogs_secret', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.threshold, card.ability.extra.money] }),
  calculate(s, card, ctx) {
    if (final_step(ctx) && ctx.hand_chips >= ctx.mult * card.ability.extra.threshold) {
      ease_dollars(card.ability.extra.money);
      return { message: localize('$') + card.ability.extra.money, colour: 'MONEY' };
    }
    return undefined;
  },
});
add('topple_the_titans', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.threshold, card.ability.extra.reduction * 100] }),
  calculate(s, card, ctx) {
    if (final_step(ctx) && ctx.hand_chips >= ctx.mult * card.ability.extra.threshold) {
      return {
        extra: { focus: card, message: localize({ type: 'variable', key: 'a_blind_minus_percent', vars: [card.ability.extra.reduction * 100] }) },
        card,
        func() { G.E_MANAGER.add_event(() => { AMM.mod_blind(1 - card.ability.extra.reduction, null, true); }); },
      };
    }
    return undefined;
  },
});
add('autoapotheosis', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.threshold] }),
  calculate(s, card, ctx) {
    if (final_step(ctx) && ctx.hand_chips >= ctx.mult * card.ability.extra.threshold) {
      // (pairs(AMM.Aspects): the registered aspects, in registration order here)
      const keyset = AMM.active_aspects().map((a) => a.key);
      let n = 0;
      for (const v of ctx.scoring_hand) {
        if (v.aspect == null && keyset.length) {
          const god_tier = pseudorandom_element(keyset, pseudoseed('god_tier'))[0];
          G.E_MANAGER.add_event(() => { AMM.set_aspect(v, god_tier, null, true); });
          n = 1;
        }
      }
      if (n !== 0) return { message: localize('k_thac_godtier'), colour: 'RED' };
    }
    return undefined;
  },
});
const FINAL_STEP = new Set([K('underdogs_secret'), K('topple_the_titans'), K('autoapotheosis')]);
/** Does this joker answer final_scoring_step with the running score (itself, or a Blueprint / Brainstorm copying one)? */
function final_step_joker(j, depth = 0) {
  if (!j || j.debuff || depth > G.jokers.cards.length) return false;
  const k = j.config.center.key;
  if (FINAL_STEP.has(k)) return true;
  if (k === 'j_blueprint') return final_step_joker(G.jokers.cards[G.jokers.cards.indexOf(j) + 1], depth + 1);
  if (k === 'j_brainstorm') return G.jokers.cards[0] !== j && final_step_joker(G.jokers.cards[0], depth + 1);
  return false;
}

// ------------------------------------------------------------------ Amalgamiter
add('amalgamiter', {
  loc_vars: (s, iq, card) => { iq.push(GRAVE); return { vars: [card.ability.extra.threshold] }; },
  calculate(s, card, ctx) {
    if (ctx.first_hand_drawn && !ctx.blueprint) {
      const gy_cards = AMM.GRAVEYARD.get_cards();
      if (gy_cards.length < card.ability.extra.threshold) return undefined;
      AMM.combine_cards(gy_cards.slice(), 'amalgamiter', G.hand);
    }
    return undefined;
  },
  in_pool: gy_in_pool,
});

// ------------------------------------------------------------------ Somber Snowfall
add('somber_snowfall', {
  loc_vars: (s, iq, card) => { iq.push(GRAVE); return { vars: [card.ability.extra.chips] }; },
  calculate(s, card, ctx) {
    if (unscored(ctx)) {
      const oc = ctx.other_card;
      if (has_any_suit(oc)) {
        return { chips: card.ability.extra.chips * AMM.GRAVEYARD.filter_count((v) => !has_no_suit(v)) };
      } else if (!has_no_suit(oc)) {
        const SUITS = AMM.suit_buffer().filter((k) => oc.is_suit(k));
        return {
          chips: card.ability.extra.chips * AMM.GRAVEYARD.filter_count((v) => {
            if (has_no_suit(v)) return false;
            return SUITS.some((k) => v.is_suit(k));
          }),
        };
      }
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Grave Legion
add('grave_legion', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    return { vars: [...prob_vars(card, 1, e.odds, 'grave_legion'), e.cards === 1 ? 'a' : Math.floor(e.cards), e.cards === 1 ? 'y' : 'ies', e.cards === 1 ? 'it' : 'them'] };
  },
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && !ctx.repetition && !ctx.end_of_round && chance(card, 'grave_legion', 1, card.ability.extra.odds)) {
      const card_ = ctx.other_card;
      return {
        // (the Lua's top-level func rides in extra: the engine's per-card loop runs extra.func — see the header)
        extra: {
          message: localize('k_copied_ex'), colour: 'JOKER_GREY',
          func() {
            G.E_MANAGER.add_event(() => {
              for (let i = 1; i <= Math.floor(card.ability.extra.cards); i++) {
                const _card = copy_card(card_, null, null, G.playing_card);
                AMM.move_to_graveyard(_card);
              }
            });
          },
        },
        card, colour: 'JOKER_GREY',
      };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Scrapper
const scrapper_centers = () => {
  const c = [P_CENTERS.m_steel, P_CENTERS.m_gold];
  // (Ortalab's Rusty Card: no Ortalab in Micatro)
  if (isActive('morefluff') && P_CENTERS.m_mf_brass) c.push(P_CENTERS.m_mf_brass);
  return c;
};
add('scrapper', {
  loc_vars(s, iq, card) {
    for (const c of scrapper_centers()) iq.push(c);
    iq.push(GRAVE);
    const n = card.ability.extra.cards;
    return { vars: [n === 1 ? 'a' : n, n === 1 ? '' : 's', n === 1 ? 'it' : 'them'] };
  },
  calculate(s, card, ctx) {
    if (ctx.first_hand_drawn && !ctx.blueprint) {
      const centers = scrapper_centers();
      const gy_cards = AMM.GRAVEYARD.get_cards();
      if (gy_cards.length < 1) return undefined;
      const metals = [];
      for (const gy_card of gy_cards) for (const c of centers) if (c.key === gy_card.config.center.key) metals.push(gy_card);
      if (metals.length < 1) return undefined;
      pseudoshuffle(metals, pseudoseed('scrapper'));
      AMM.remove_from_game(metals[0]);
      for (let i = 1; i <= card.ability.extra.cards; i++) {
        const cardmak = create_playing_card({ center: pseudorandom_element(centers, pseudoseed('scrapper'))[0] }, G.hand);
        cardmak.set_edition(poll_edition('scrapper'), true, true);
        cardmak.set_seal(poll_seal({ key: 'scrapper', mod: 10 }), true, true);
      }
      return { card, message: localize('k_thac_scrapped'), colour: 'JOKER_GREY' };
    }
    return undefined;
  },
  in_pool: gy_in_pool,
});

// ------------------------------------------------------------------ Snecko Eye
add('snecko_eye', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.h_size] }),
  calculate(s, card, ctx) {
    const temp_drawn = ctx.hand_drawn || ctx.other_drawn;
    if (temp_drawn && temp_drawn.length > 0 && !ctx.blueprint) {
      return {
        colour: 'GREEN',
        func() {
          G.E_MANAGER.add_event(() => { play_sound('tarot1'); juice_card(card); });
          // (the flip-over / flip-back animation events are visual)
          for (const _card of temp_drawn) {
            G.E_MANAGER.add_event(() => { change_base(_card, null, pseudorandom_element(RANKS, pseudoseed('snecko'))[0]); });
          }
          return true;
        },
      };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Hardlyquin
add('hardlyquin', {
  loc_vars: (s, iq, card) => ({ vars: [...prob_vars(card, 1, card.ability.extra.odds, 'hardlyquin'), card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      if (chance(card, 'hardlyquin', 1, card.ability.extra.odds)) return { mult: card.ability.extra.mult };
      return { message: localize('k_nope_ex'), colour: 'ORANGE' };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Golden Ratio
add('golden_ratio', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xmult] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && !ctx.repetition && !ctx.end_of_round) {
      const v = ctx.other_card.base.value;
      if (v === 'Ace' || v === '2' || v === '3' || v === '5' || v === '8') return { xmult: card.ability.extra.Xmult };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Whispers of Beyond
add('whispers_of_beyond', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.retriggers === 1 ? 'once' : card.ability.extra.retriggers, card.ability.extra.retriggers === 1 ? '' : ' times'] }),
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check) {
      if (G.jokers.cards.length < 6) return undefined;
      if (ctx.other_card === G.jokers.cards[5]) {
        return { card: ctx.blueprint_card || card, colour: 'ORANGE', repetitions: card.ability.extra.retriggers, message: localize('k_again_ex') };
      }
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Jet Worldmage / Ruby Sunmage / Opal Moonmage
add('jet_worldmage', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xchips] }),
  calculate(s, card, ctx) {
    if (unscored(ctx) && ctx.other_card.is_suit('Spades')) return { xchips: card.ability.extra.Xchips };
    return undefined;
  },
});
add('ruby_sunmage', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult, card.ability.extra.mult_curr] }),
  calculate(s, card, ctx) {
    // FIX (intended design, header 3): `not context.blueprint` — a copy doesn't scale Ruby's own counter again.
    if (unscored(ctx) && ctx.other_card.is_suit('Hearts') && !ctx.blueprint) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'mult_curr', scalar_value: 'mult', message_colour: 'MULT' });
    }
    if (ctx.joker_main && card.ability.extra.mult_curr > 0) return { mult: card.ability.extra.mult_curr };
    if (jokers_eor(ctx)) {
      card.ability.extra.mult_curr = 0;
      return { card, focus: card, message: localize('k_reset'), colour: 'MULT' };
    }
    return undefined;
  },
});
add('opal_moonmage', {
  loc_vars: () => ({ vars: [] }),
  calculate(s, card, ctx) {
    const e = card.ability.extra;
    if (ctx.before) {
      // [sort_id, 1-based index in G.play] of each unscored Club (the Lua kept the Card itself)
      e.temp_cardlist = [];
      G.play.cards.forEach((c, i) => {
        if (c.is_suit('Clubs') && !ctx.scoring_hand.includes(c)) e.temp_cardlist.push([c.sort_id, i + 1]);
      });
    }
    // FIX (intended design, header 2): played cards only (held cards sat at "index 0", next to the first played card).
    if (ctx.repetition && !ctx.end_of_round && (ctx.cardarea === G.play || ctx.cardarea === 'unscored')) {
      const index = G.play.cards.indexOf(ctx.other_card) + 1;
      let reps = 0;
      for (const [, i] of e.temp_cardlist || []) if (i === index - 1 || i === index + 1) reps++;
      // (the Lua returns the second neighbour's retrigger in `extra`; the engine reads one `repetitions`)
      if (reps > 0) return { card, repetitions: reps, colour: 'ORANGE', message: localize('k_again_ex') };
    }
    if (ctx.after) e.temp_cardlist = [];
    return undefined;
  },
});

// ------------------------------------------------------------------ Coven Joker
add('coven', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      const ranks = {};
      let ranknum = 0;
      for (const c of G.play.cards) {
        if (!ranks[c.base.value] && !has_no_rank(c)) { ranks[c.base.value] = true; ranknum++; }
      }
      if (ranknum >= 3) return { mult: card.ability.extra.mult };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Cartowomancer / Cartowomancer! (MoreFluff)
const CARTOWO_CW = {
  c_fool: 'c_mf_rot_fool', c_magician: 'c_mf_rot_magician', c_high_priestess: 'c_mf_rot_high_priestess', c_empress: 'c_mf_rot_empress',
  c_emperor: 'c_mf_rot_emperor', c_heirophant: 'c_mf_rot_heirophant', c_lovers: 'c_mf_rot_lovers', c_chariot: 'c_mf_rot_chariot',
  c_justice: 'c_mf_rot_justice', c_hermit: 'c_mf_rot_hermit', c_wheel_of_fortune: 'c_mf_rot_wheel', c_strength: 'c_mf_rot_strength',
  c_hanged_man: 'c_mf_rot_hanged_man', c_death: 'c_mf_rot_death', c_temperance: 'c_mf_rot_temperance', c_devil: 'c_mf_rot_devil',
  c_tower: 'c_mf_rot_tower', c_star: 'c_mf_rot_star', c_moon: 'c_mf_rot_moon', c_sun: 'c_mf_rot_sun', c_judgement: 'c_mf_rot_judgement',
  c_world: 'c_mf_rot_world',
  c_thac_universe: 'c_thac_rot_universe', c_thac_void: 'c_thac_rot_void', c_thac_happy_squirrel: 'c_thac_rot_happy_squirrel',
  c_thac_artist: 'c_thac_rot_artist', c_thac_veteran: 'c_thac_rot_veteran', c_thac_drunkard: 'c_thac_rot_drunkard',
  c_thac_juggler: 'c_thac_rot_juggler', c_thac_joker: 'c_thac_rot_joker',
  c_six_star_q: 'c_thac_rotflip_star', c_six_moon_q: 'c_thac_rotflip_moon', // (SixSuits: never in Micatro)
  j_thac_cartowomancer: 'j_thac_rot_cartowomancer', j_cartomancer: 'j_mf_rot_cartomancer',
};
const CARTOWO = { clockwise: CARTOWO_CW, 'counter-clockwise': Object.fromEntries(Object.entries(CARTOWO_CW).map(([k, v]) => [v, k])) };
/** func_cartowo(cardkey, direction) -> the rotated / unrotated key, or undefined. */
export const func_cartowo = (cardkey, direction) => (CARTOWO[direction] || {})[cardkey];
const cartowo_calc = (colour) => function (s, card, ctx) {
  if (ctx.amm_pet_card) {
    const to = func_cartowo(ctx.amm_pet_card.config.center.key, ctx.amm_pet_direction);
    if (to && P_CENTERS[to]) {
      const pet = ctx.amm_pet_card;
      return {
        message: localize('k_thac_owo'), card: pet, message_card: pet, focus: pet, colour,
        func() { pet.set_ability(P_CENTERS[to]); pet.set_cost(); },
      };
    }
  }
  return undefined;
};
add('cartowomancer', { loc_vars: (s, iq) => { iq.push(PET); return { vars: [] }; }, func_cartowo, calculate: cartowo_calc('GREEN') });
add('rot_cartowomancer', { loc_vars: (s, iq) => { iq.push(PET); return { vars: [] }; }, func_cartowo, calculate: cartowo_calc('PURPLE') });

// ------------------------------------------------------------------ the Homestuck line (Homelatro rarities)
/** The Players' end-of-round extinction roll (seed = the pool flag set when it hits). */
function extinction(card, ctx, flag) {
  if (ctx.end_of_round && ctx.game_over === false && ctx.main_eval && !ctx.blueprint) {
    if (chance(card, flag, card.ability.extra.numer, card.ability.extra.denom)) {
      G.E_MANAGER.add_event(() => {
        play_sound('slice1');
        G.E_MANAGER.add_event(() => { card.remove(); G.GAME.pool_flags[flag] = true; });
      });
      return { message: L('hmlt_extinct', 'k_extinct_ex') };
    }
    return { message: L('hmlt_safe', 'k_safe_ex') };
  }
  return undefined;
}
const hearts_guard = (ctx) => ctx.debuff_card && ctx.debuff_card.is_suit('Hearts', true);
add('nekogloop', {
  loc_vars: (s, iq, card) => ({ vars: prob_vars(card, card.ability.extra.numer, card.ability.extra.denom, 'thac_nekogloop_extinct') }),
  calculate(s, card, ctx) {
    if (hearts_guard(ctx)) return { prevent_debuff: true };
    return extinction(card, ctx, 'thac_nekogloop_extinct');
  },
});
add('autumnmood', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    const pv = prob_vars(card, e.numer, e.denom, 'thac_autumnmood_extinct');
    return { vars: [...pv, e.mult, Math.floor(e.threshold), in_collection(card) ? 'N/A' : e.mult * areas_with(Math.floor(e.threshold))] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main) return { mult: card.ability.extra.mult * areas_with(Math.floor(card.ability.extra.threshold)) };
    return extinction(card, ctx, 'thac_autumnmood_extinct');
  },
});
add('', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    iq.push(P_CENTERS.e_negative);
    const pv = prob_vars(card, e.numer, e.denom, 'thac__extinct');
    return { vars: [...pv, e.mult, in_collection(card) ? 'N/A' : e.mult * negatives()] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main) return { mult: card.ability.extra.mult * negatives() };
    return extinction(card, ctx, 'thac__extinct');
  },
});
add('hmlt_knightofheart', {
  loc_vars: (s, iq) => { iq.push(GRAVE); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (hearts_guard(ctx)) return { prevent_debuff: true };
    if (ctx.amm_buried_card && ctx.other_card.is_suit('Hearts')) {
      const _card = copy_card(ctx.other_card, null, null, G.playing_card);
      return {
        message: localize('k_copied_ex'),
        func() {
          _card.add_to_deck();
          G.deck.config.card_limit += 1;
          G.deck.emplace(_card); // (a deck emplaces at the bottom)
          G.playing_cards.push(_card);
          playing_card_joker_effects([true]);
          return true;
        },
      };
    }
    return undefined;
  },
});
add('hmlt_witchofmind', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    return { vars: [e.xmult, Math.floor(e.threshold), in_collection(card) ? 'N/A' : 1 + e.xmult * areas_with(Math.floor(e.threshold))] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main) return { xmult: 1 + card.ability.extra.xmult * areas_with(Math.floor(card.ability.extra.threshold)) };
    return undefined;
  },
});
add('hmlt_lordofvoid', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    iq.push(P_CENTERS.e_negative);
    const pv = prob_vars(card, e.numer, e.denom, 'thac_lordofvoid2');
    const pv2 = prob_vars(card, 1, 10);
    if (in_collection(card)) return { vars: [e.mult, 'N/A', ...pv, ''] };
    return { vars: [e.mult, e.mult * negatives(), ...pv, pv2[0] >= pv2[1] ? localize('k_thac_hubris') : ''] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main) return { mult: card.ability.extra.mult * negatives() };
    // ("another" Joker: in the Lua the gained card isn't in G.jokers yet when card_added fires)
    if (ctx.card_added && ctx.card && ctx.card !== card && ctx.card.ability.set === 'Joker' && !ctx.card.edition &&
        chance(card, 'thac_lordofvoid2', card.ability.extra.numer, card.ability.extra.denom)) {
      const other = ctx.card;
      const pv2 = prob_vars(card, 1, 10);
      // (the shatters are queued: the Lua shatter removes the cards after its animation, once add_to_deck is done)
      if (pv2[0] >= pv2[1]) {
        return { func() { G.E_MANAGER.add_event(() => { card.shatter(); other.shatter(); }); return true; }, message: localize('k_thac_not_fun') };
      }
      return {
        func() {
          // card_added fires from the start of Card:add_to_deck here (the end in SMODS), before its own Negative slot
          // (+1 for a Negative card): the edition goes on without set_edition's +1 so the slot is counted once.
          other.added_to_deck = false;
          other.set_edition({ negative: true });
          other.added_to_deck = true;
          return true;
        },
        message: localize('k_thac_negative'),
      };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Stirring Graves
add('stirring_graves', {
  loc_vars: (s, iq, card) => { iq.push(GRAVE); return { vars: [Math.floor(card.ability.extra.retriggers)] }; },
  calculate(s, card, ctx) {
    if (ctx.amm_buried_card) {
      ctx.other_card.ability.perma_repetitions = (ctx.other_card.ability.perma_repetitions || 0) + Math.floor(card.ability.extra.retriggers);
      return { message: localize('k_upgrade_ex'), colour: 'ORANGE' };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Amalgam Joker
add('amalgam_joker', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.combines, card.ability.extra.value_gain] }),
  calculate(s, card, ctx) {
    if (jokers_eor(ctx) && G.hand.cards.length > card.ability.extra.combines && !ctx.blueprint) {
      G.E_MANAGER.add_event(() => {
        const hand_cards = G.hand.cards.slice();
        pseudoshuffle(hand_cards, pseudoseed('amalgam_joker'));
        const new_card = AMM.combine_cards([hand_cards[0], hand_cards[1]], 'amalgam_joker', G.hand);
        card.ability.extra_value = (card.ability.extra_value || 0) + Math.floor(new_card.get_chip_bonus() * card.ability.extra.value_gain);
        card.set_cost();
      });
      return { message: localize('k_val_up'), colour: 'MONEY' };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ Emojiokers
/** Emojiokers' set_ability: a random background row (pseudorandom("emojiokers", 0, 3)); the emoji is the soul sprite. */
const emoji = (key, def) => add(key, {
  set_ability(center, card) { card.ability.thac_emoji_row = pseudorandom('emojiokers', 0, 3); },
  get_pos: (center, card) => ({ x: 0, y: (card && card.ability && card.ability.thac_emoji_row) || 0 }),
  ...def,
});
emoji(':joker:', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) { return ctx.joker_main ? { mult: card.ability.extra.mult } : undefined; },
});
emoji(':art:', { loc_vars: () => ({ vars: [] }), calculate: () => undefined });
// (:currency_exchange: needs pta_saka's Pyroxenes — not in Micatro)
/** :free:'s update: in the shop it is couponed (free). */
const free_update = (center, card) => {
  if (card.area && card.area === G.shop_jokers && !card.ability.couponed) { card.ability.couponed = true; card.set_cost(); }
};
emoji(':free:', { loc_vars: () => ({ vars: [] }), calculate: () => undefined, update: free_update });

export const centers = J;
/** The joker keys of this part (tests). */
export const JOKERS_B = J.map((c) => c.key);
// The Homestuck jokers' text is SMODS multi-box (an array of line arrays); Micatro's describe() reads one line list,
// so their boxes are shown one after another (see the header).
for (const k of JOKERS_B) {
  const d = LOC.descriptions && LOC.descriptions.Joker && LOC.descriptions.Joker[k];
  if (d && Array.isArray(d.text) && d.text.some(Array.isArray)) d.text = d.text.flat();
}

// ------------------------------------------------------------------ hooks
export const hooks = {
  // Twisted Mind (fix 1): graveyard cards scored as held, after the held cards
  held_cards_scored() { twisted_mind_scoring(); },
  // final_scoring_step with the running score (Underdog's Secret, Topple the Titans, Autoapotheosis)
  modify_scoring([chips, mult], step, ctx) {
    if (step !== 'final_scoring_step' || !G.jokers) return undefined;
    for (const j of G.jokers.cards.slice()) {
      if (!final_step_joker(j)) continue;
      const fctx = { ...ctx, cardarea: G.jokers, final_scoring_step: true, thac_final_step: true, hand_chips: chips, mult };
      let eff = j.calculate_joker(fctx);
      for (let t = eff ? joker_retriggers(j, fctx) + 1 : 0; t > 0; t--) {
        [chips, mult] = smods_effect(eff, j, chips, mult);
        if (t > 1) { eff = j.calculate_joker({ ...fctx, retrigger_joker: true, hand_chips: chips, mult }); if (!eff) break; }
      }
    }
    return [chips, mult];
  },
  // nekoGloop / Knight of Heart: context.debuff_card -> prevent_debuff on Hearts (jokers that aren't debuffed)
  set_debuff(card) {
    if (!G.jokers || (card.ability.set !== 'Default' && card.ability.set !== 'Enhanced')) return undefined;
    const guards = [...find(K('nekogloop')), ...find(K('hmlt_knightofheart'))];
    for (const g of guards) {
      const r = g.calculate_joker({ debuff_card: card });
      if (r && r.prevent_debuff) return 'prevent_debuff';
    }
    return undefined;
  },
  // SMODS card_added: a non-playing card was added to the deck (not from_debuff) — Lord of Void
  add_to_deck(card, from_debuff) {
    if (from_debuff || !G.hand || !G.jokers) return;
    if (card.ability.set === 'Default' || card.ability.set === 'Enhanced') return;
    calculate_context({ card_added: true, card });
  },
  // :free: in the shop (its update(), which the Lua runs every frame)
  emplace(area, card) {
    if (area === G.shop_jokers && card.config.center.key === K(':free:')) free_update(card.config.center, card);
  },
};
