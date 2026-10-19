/**
 * More Fluff 1.9.9999 — jokers, part B (27): Cue Ball, Flint and Steel, Gemstone Joker, Globe, Golden Carrot,
 * Hall of Mirrors, Impostor, Joke Merge Valley, Friend Inside Me, Junk Mail, One Slip Too Late,
 * I Sip Toner Soup, Unpleasant Card, Loaded Disk, Missing Joker, Paint Can, Passing Balatro in 5 Minutes,
 * Fast-Growing Sapling, Snake, Big Win, Style Meter, Stone Joker Joker, Sudoku, Tall Joker, Teacup, Teal Joker,
 * the way home. Each is ported from src/jokers/<file>.lua (Cryptid's `context.forcetrigger` branches are dropped).
 * Flint and Steel, Hall of Mirrors, Impostor, Toner Soup and Sudoku are retired upstream to the hidden "Old Fluff"
 * rarity; Tall Joker keeps its 1.5.6 behaviour for now (legacy.js). Lightning Strikes Thrice was deleted.
 * 1.9.9999 changes ported here: Golden Carrot / Teacup scale through SMODS.scale_card; Junk Mail (starting_shop,
 * base cost X1.5, once a round, no Blueprint); Unpleasant Card (X2.067 Chips, every pack holds 1 card choose 1);
 * Snake (copies add up); Sapling (6 rounds); Big Win ("Again!!"); Friend Inside Me / Missing Joker texts; Joke Merge
 * Valley (rankless cards never merge, more perma stats).
 *
 * Lovely patches / Lua wraps as hooks:
 *   (junk mail)           -> voucher_add('after_tags'): the extra voucher, its base_cost X1.5
 *   snake.toml            -> draw_hand_space (after a play or discard, draw the Snakes' draws added up)
 *   unpleasantcard.toml   -> pack_size / pack_choices (rotarots.js composes it last: 1 card, choose 1)
 *   tree_three.toml       -> new_round / shop_start resets (G.GAME.mf_tree_three)
 *   Game:update_round_eval (Missing Joker turns back) -> evaluate_round (no rows)
 *
 * INTENDED-DESIGN FIXES (each pinned in micatro/tests/mods/morefluff_jokers_b_test.mjs):
 *  1. (fixed upstream too in 1.9.9999) Fast-Growing Sapling: selling it called G.GAME.blind:defeat() itself before the round ended, so the
 *     blind was already cleared when end_round ran — on a Boss Blind the ante never advanced (a boss beaten
 *     with TREE(3) could never win the run at ante 8), the blind paid no reward, and a disable/defeat effect
 *     ran twice (The Manacle gave its hand size back twice). The round now ends normally with the score set
 *     to the blind's ("set round score to TREE(3)"): end_round/evaluate_round defeat the blind once.
 *  2. Joke Merge Valley destroyed the merged cards with an instant start_dissolve while they were still being
 *     discarded; here (instant dissolves) the discard then drew the removed cards into the discard pile as
 *     zombies. They dissolve once the discard has moved them (as the Lua animation does).
 *  + Missing Joker kept its transformed cards in a global (G.missingjoker_revert): it is per run state
 *    (G.GAME.mf_missingjoker_revert, sort ids) so a save / replay turns them back too.
 */
import {
  G, P_CENTERS, P_CENTER_POOLS, P_CARDS, Card, create_card, pseudorandom_element, pseudoseed, probability_roll,
  probability_vars, ease_hands_played, level_up_hand, localize, play_sound, get_next_voucher_key, emit,
} from '../../js/engine/core.js';
import { get_poker_hand_info, end_consumeable, STATES } from '../../js/engine/run.js';
import { joker, find, has, room, say, has_enh, has_no_rank, remove_joker, scale_card, progressbar } from './util.js';

const J = [];
const add = (slug, def) => { J.push(joker(slug, def)); };
const main = (ctx) => ctx.cardarea === G.jokers && ctx.joker_main;
const end_main = (ctx) => ctx.end_of_round && !ctx.individual && !ctx.repetition;
const prob = (card, den, id) => { const [n, d] = probability_vars(card, 1, den, id); return [n, d]; };
/** An info_queue entry for a center, its #n# filled (describe_mod reads q.vars). */
function info(key) {
  const c = P_CENTERS[key];
  if (!c) return null;
  const cfg = c.config || {};
  let vars = [];
  if (key === 'm_stone') vars = [cfg.bonus];
  else if (key === 'j_diet_cola') vars = [localize({ type: 'name_text', set: 'Tag', key: 'tag_double' })];
  else if (key === 'm_steel') vars = [cfg.h_x_mult];
  else if (c.mod && c.loc_vars) { try { vars = (c.loc_vars(c, [], { ability: JSON.parse(JSON.stringify({ ...cfg, extra: cfg.extra })), config: { center: c }, fake: true }) || {}).vars || []; } catch (e) { vars = []; } }
  return { key, set: c.set, vars };
}
const iq_push = (iq, ...keys) => { for (const k of keys) { const q = info(k); if (q) iq.push(q); } };
const tally = (key) => (G.playing_cards || []).filter((v) => has_enh(v, key)).length;

// ------------------------------------------------------------------ Cue Ball
add('cueball', {
  loc_vars: (s, iq, card) => ({ vars: prob(card, card.ability.odds, 'cueball') }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && has_no_rank(ctx.other_card)) {
      if (room() && probability_roll(card, 'cueball', 1, card.ability.odds, 'cueball')) {
        G.GAME.consumeable_buffer += 1;
        return {
          extra: {
            focus: card, message: localize('k_plus_rotarot'), func() {
              G.E_MANAGER.add_event(() => {
                const c = create_card('Rotarot', G.consumeables, null, null, null, null, null, 'cba');
                c.add_to_deck();
                G.consumeables.emplace(c);
                G.GAME.consumeable_buffer = 0;
              });
            },
          },
          colour: 'Tarot', card,
        };
      }
    }
  },
});

// ------------------------------------------------------------------ Flint and Steel
add('flintandsteel', {
  loc_vars: (s, iq) => { iq_push(iq, 'm_stone', 'm_steel'); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.before) {
      let flint = false, steel = false;
      for (const c of ctx.scoring_hand) { if (has_enh(c, 'm_stone')) flint = true; if (has_enh(c, 'm_steel')) steel = true; }
      if (flint && steel) { // PEAK CINEMA
        const { text } = get_poker_hand_info(ctx.full_hand);
        say(ctx.blueprint_card || card, localize('k_upgrade_ex'));
        level_up_hand(ctx.blueprint_card || card, text, null, 1);
      }
    }
  },
});

// ------------------------------------------------------------------ Gemstone Joker
add('gemstonejoker', {
  update(s, card) { card.ability.extra.gemstone_tally = G.playing_cards ? tally('m_mf_gemstone') : 0; },
  loc_vars(s, iq, card) {
    iq_push(iq, 'm_mf_gemstone');
    const e = card.ability.extra;
    const t = card.fake ? 0 : tally('m_mf_gemstone');
    return { vars: [e.dollars_per, e.dollars_per * t] };
  },
  calc_dollar_bonus(s, card) {
    const t = tally('m_mf_gemstone');
    card.ability.extra.gemstone_tally = t;
    if (t > 0) return card.ability.extra.dollars_per * t;
  },
});

// ------------------------------------------------------------------ Globe
add('globe', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(s, card, ctx) {
    if (ctx.reroll_shop && room()) {
      const n = Math.floor(Math.min(card.ability.extra, G.consumeables.config.card_limit - (G.consumeables.cards.length + G.GAME.consumeable_buffer)));
      for (let i = 0; i < n; i++) {
        G.GAME.consumeable_buffer += 1;
        G.E_MANAGER.add_event(() => {
          const c = create_card('Planet', G.consumeables, null, null, null, null, null, '8ba');
          c.add_to_deck();
          G.consumeables.emplace(c);
          G.GAME.consumeable_buffer = 0;
        });
      }
      return { message: localize('k_plus_planet'), colour: 'Planet', card };
    }
  },
});

// ------------------------------------------------------------------ Golden Carrot
add('goldencarrot', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.gain, card.ability.extra.loss] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.after && !ctx.blueprint && !card.gone) {
      const e = card.ability.extra;
      scale_card(card, { ref_table: e, ref_value: 'gain', scalar_value: 'loss', operation: '-', message_key: 'a_minus_dollars' });
      if (e.gain <= 0) {
        remove_joker(card);
        return { message: localize('k_eaten_ex'), colour: 'MONEY' };
      }
    }
  },
  calc_dollar_bonus(s, card) {
    const bonus = Math.max(0, card.ability.extra.gain);
    if (bonus > 0) return bonus;
  },
});

// ------------------------------------------------------------------ Hall of Mirrors
add('hallofmirrors', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.h_size, card.ability.extra] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.get_id() === 6 && !ctx.blueprint) {
      card.ability.h_size = card.ability.h_size + card.ability.extra;
      G.hand.change_size(card.ability.extra);
      return { message: localize('k_upgrade_ex'), card };
    }
    if (ctx.end_of_round && !ctx.blueprint && !ctx.repetition && !ctx.individual) {
      G.hand.change_size(-card.ability.h_size);
      card.ability.h_size = 0;
      return { message: localize('k_reset'), colour: 'RED' };
    }
  },
});

// ------------------------------------------------------------------ Impostor
add('impostor', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_mult] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.before && !ctx.blueprint) {
      let red = 0;
      for (const v of ctx.full_hand) if (v.is_suit('Hearts', null, true) || v.is_suit('Diamonds', null, true)) red++;
      card.ability.extra.check = red;
    }
    if (main(ctx) && card.ability.extra.check === 1) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.x_mult] }), Xmult_mod: card.ability.extra.x_mult };
    }
  },
});

// ------------------------------------------------------------------ Joke Merge Valley
// (1.9.9999 also merges perma_repetitions and Steamodded's score / blind-size stats; SpectraLib's slib_* stats are
//  left out: no SpectraLib here)
const MERGE_STATS = ['perma_bonus', 'perma_mult', 'perma_x_chips', 'perma_x_mult', 'perma_h_chips', 'perma_h_mult',
  'perma_h_x_chips', 'perma_h_x_mult', 'perma_p_dollars', 'perma_h_dollars', 'perma_repetitions', 'perma_score', 'perma_h_score',
  'perma_x_score', 'perma_h_x_score', 'perma_blind_size', 'perma_h_blind_size', 'perma_x_blind_size', 'perma_h_x_blind_size'];
add('farmmerge', {
  calculate(s, card, ctx) {
    // (Steamodded's pre_discard context is a joker-row context: cardarea G.jokers)
    if (!ctx.pre_discard || ctx.blueprint) return undefined;
    if (ctx.full_hand.length !== 3) return undefined;
    const last = ctx.full_hand[2];
    const stats = Object.fromEntries(MERGE_STATS.map((k) => [k, 0]));
    let enhancement = null, edition = null, seal = null;
    for (const v of ctx.full_hand) {
      if (v.base.value !== last.base.value || has_no_rank(v)) return undefined; // (1.9.9999: rankless cards never merge)
      for (const k of MERGE_STATS) stats[k] += v.ability[k] || 0;
      if (v !== last) stats.perma_bonus += v.base.nominal;
      if (v.config.center !== P_CENTERS.c_base) enhancement = v.config.center;
      if (v.seal) seal = v.seal;
      if (v.edition) edition = v.edition;
    }
    if (enhancement && enhancement !== last.config.center) last.set_ability(enhancement);
    if (edition && edition !== last.edition) last.set_edition({ [edition.type]: true });
    if (seal && seal !== last.seal) last.set_seal(seal);
    for (const k of MERGE_STATS) last.ability[k] = stats[k];
    const destroyed = ctx.full_hand.filter((v) => v !== last);
    for (const v of destroyed) {
      v.remove_from_deck();
      // fix 2: dissolve after the discard has drawn them away (the Lua animation finishes later too)
      G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => { if (!v.removed) v.start_dissolve(); }));
    }
    for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed: destroyed });
    return { message: localize('k_merged_ex') };
  },
});

// ------------------------------------------------------------------ Friend Inside Me
add('friendinsideme', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.active ? 'active' : 'inactive'] }),
  calculate(s, card, ctx) {
    if (ctx.selling_card && card.ability.active) {
      const sold = ctx.card;
      const r = sold.config.center.rarity;
      if (sold.ability.set === 'Joker' && (r === 1 || r === 2)) {
        card.ability.active = false;
        // SMODS.add_card{set = 'Joker', rarity = 0.9 (uncommon roll) / 1 (rare roll), edition = sold's}
        const n = create_card('Joker', G.jokers, null, r === 2 ? 1 : 0.9);
        if (sold.edition) n.set_edition({ [sold.edition.type]: true });
        n.add_to_deck();
        G.jokers.emplace(n);
        return { message: localize('k_friend_ex') };
      }
    }
    if (end_main(ctx) && !ctx.blueprint && G.GAME.blind.boss) {
      card.ability.active = true;
      return { message: localize('k_active_ex') };
    }
  },
});

// ------------------------------------------------------------------ Junk Mail
// 1.9.9999: context.starting_shop (once a round: `triggered`, cleared at the end of the round) ->
// SMODS.add_voucher_to_shop() with its base_cost X1.5 (1.5.6's bonus_cost lovely patch is gone). Not Blueprint-compatible.
add('junkmail', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.val_mult] }),
  calculate(s, card, ctx) {
    if (ctx.end_of_round && !ctx.blueprint) card.ability.triggered = undefined;
  },
});
function junkmail_vouchers() {
  for (const card of find('j_mf_junkmail')) {
    if (card.ability.triggered) continue;
    card.ability.triggered = true;
    const key = get_next_voucher_key(true);
    G.shop_vouchers.config.card_limit = G.shop_vouchers.config.card_limit + 1;
    const nc = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
    nc.shop_voucher = true;
    nc.base_cost = nc.base_cost * card.ability.extra.val_mult;
    nc.set_cost();
    G.shop_vouchers.emplace(nc);
    emit('materialize', { card: nc.sort_id });
    say(card, localize('k_plus_voucher'));
  }
}

// ------------------------------------------------------------------ One Slip Too Late
add('onesliptoolate', {
  loc_vars: () => ({ vars: [((G.GAME && G.GAME.current_round.hands_played) || 0) + 1] }),
  calculate(s, card, ctx) {
    const n = (G.GAME.current_round.hands_played || 0) + 1;
    if (main(ctx) && ctx.scoring_hand && ctx.scoring_hand.length === n) return { xmult: n };
  },
});

// ------------------------------------------------------------------ I Sip Toner Soup
add('tonersoup', {
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.before && room()) {
      G.GAME.consumeable_buffer += 1;
      G.E_MANAGER.add_event(() => {
        const c = create_card('Tarot', G.consumeables, null, null, null, null, null, undefined); // (1.9.9999: SMODS.add_card{set='Tarot'})
        c.add_to_deck();
        G.consumeables.emplace(c);
        G.GAME.consumeable_buffer = 0;
      });
    }
    if (end_main(ctx) && !ctx.blueprint) {
      remove_joker(card);
      return { message: localize('k_drank_ex'), colour: 'FILTER' };
    }
  },
});

// ------------------------------------------------------------------ Unpleasant Card
add('unpleasantcard', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.x_chips] }),
  calculate(s, card, ctx) {
    if (main(ctx)) return { xchips: card.ability.extra.x_chips };
  },
});
/** unpleasantcard.toml (1.9.9999, Card:open): with an Unpleasant Card, every opened pack holds 1 card, choose 1. */
export const unpleasant = () => !!(G.jokers && G.jokers.cards.some((j) => j.config.center.key === 'j_mf_unpleasantcard'));

// ------------------------------------------------------------------ Loaded Disk
add('loadeddisk', {
  loc_vars: (s, iq) => { iq_push(iq, 'c_mf_pink', 'c_mf_yellow'); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (!ctx.selling_self) return undefined;
    for (const key of ['c_mf_pink', 'c_mf_yellow']) {
      if (room()) {
        G.GAME.consumeable_buffer += 1;
        G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => {
          const n = create_card('Colour', G.consumeables, null, null, null, null, key, null);
          n.add_to_deck();
          G.consumeables.emplace(n);
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer - 1;
        }));
        say(ctx.blueprint_card || card, localize('k_plus_colour'), 'PURPLE');
      }
    }
  },
});

// ------------------------------------------------------------------ Missing Joker
add('missingjoker', {
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !ctx.blueprint) {
      const pool = [];
      for (const v of P_CENTER_POOLS.Joker) {
        if (v.unlocked !== false && v.perishable_compat && v.eternal_compat && !G.GAME.banned_keys[v.key]) pool.push(v.key);
      }
      if (pool.length <= 0) pool.push('v_blank');
      const [elem] = pseudorandom_element(pool, pseudoseed('missingjoker'));
      card.set_ability(P_CENTERS[elem]);
      (G.GAME.mf_missingjoker_revert = G.GAME.mf_missingjoker_revert || []).push(card.sort_id);
      return { message: localize('k_transformed_ex'), colour: 'DARK_EDITION' };
    }
  },
});
/** Game:update_round_eval: Missing Jokers turn back. */
function missingjoker_revert() {
  const ids = G.GAME.mf_missingjoker_revert;
  if (!ids || !ids.length) return;
  for (const id of ids) {
    const j = G.jokers.cards.find((c) => c.sort_id === id);
    if (j) { j.set_ability(P_CENTERS.j_mf_missingjoker); j.juice_up(); }
  }
  G.GAME.mf_missingjoker_revert = [];
}

// ------------------------------------------------------------------ Paint Can (the charging lives in colours.js)
add('paintcan', {
  loc_vars: (s, iq, card) => ({ vars: prob(card, card.ability.extra.odds, 'paintcan') }),
});

// ------------------------------------------------------------------ Passing Balatro in 5 Minutes
add('passando', {
  loc_vars: (s, iq, card) => { iq_push(iq, 'j_diet_cola'); return { vars: [card.ability.extra.blinds_skipped, card.ability.extra.threshold] }; },
  calculate(s, card, ctx) {
    if (ctx.skip_blind && !ctx.blueprint) {
      const e = card.ability.extra;
      e.blinds_skipped += 1;
      let create = 0;
      while (e.blinds_skipped >= e.threshold) { create++; e.blinds_skipped -= e.threshold; }
      if (create !== 0) {
        G.E_MANAGER.add_event(() => {
          for (let i = 0; i < create; i++) {
            G.E_MANAGER.add_event(() => {
              play_sound('timpani');
              const n = create_card(null, G.jokers, null, null, null, null, 'j_diet_cola', 'sup');
              n.add_to_deck();
              n.set_edition({ negative: true }, true);
              G.jokers.emplace(n);
              card.juice_up();
            });
          }
        });
      } else {
        return { message: e.blinds_skipped + '/' + e.threshold };
      }
    }
  },
});

// ------------------------------------------------------------------ Fast-Growing Sapling
add('sapling', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    const [val, max] = progressbar(Math.min(e.c_rounds, e.rounds), e.rounds);
    return { vars: [val, max, e.rounds, e.c_rounds] };
  },
  calculate(s, card, ctx) {
    const e = card.ability.extra;
    if (!card.self_sold && end_main(ctx) && !ctx.blueprint) {
      e.c_rounds += 1;
      return { message: e.c_rounds < e.rounds ? e.c_rounds + '/' + e.rounds : localize('k_active_ex'), colour: 'FILTER' };
    }
    const in_blind = !!(G.GAME.facing_blind && G.GAME.blind && G.GAME.blind.name);
    if (in_blind && ctx.selling_self && e.c_rounds >= e.rounds && !ctx.blueprint) {
      card.self_sold = true;
      say(card, localize('k_equals_tree_three'), 'DARK_EDITION');
      play_sound('mf_treethree');
      G.GAME.mf_tree_three = true;
      G.GAME.chips = G.GAME.blind.chips;
      // fix 1: no early G.GAME.blind:defeat() — the round ends normally (end_round / evaluate_round defeat it).
      G.STATE = STATES.NEW_ROUND;
      G.STATE_COMPLETE = false;
    }
  },
});

// ------------------------------------------------------------------ Snake
add('snake', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
});
/** snake.toml (1.9.9999): after a play or discard, draw min(#deck, every Snake's draw added up). */
function snake_space(n) {
  if (G.STATE !== STATES.DRAW_TO_HAND || !(G.GAME.current_round.hands_played > 0 || G.GAME.current_round.discards_used > 0)) return undefined;
  let count = 0;
  for (const j of find('j_mf_snake')) count += j.ability.extra;
  return count !== 0 ? Math.min(G.deck.cards.length, count) : n;
}

// ------------------------------------------------------------------ Big Win
add('slotmachine', {
  loc_vars: (s, iq, card) => { const [n, d] = prob(card, card.ability.extra.odds, 'slotmachine'); return { vars: [n, d, card.ability.extra.retriggers] }; },
  calculate(s, card, ctx) {
    if (ctx.repetition && ctx.other_card && ctx.other_card.get_id() === 7) {
      if (probability_roll(card, 'slotmachine', 1, card.ability.extra.odds, 'slotmachine')) {
        return { message: localize('k_again_ex_ex'), repetitions: card.ability.extra.retriggers, card };
      }
    }
  },
});

// ------------------------------------------------------------------ Style Meter
add('stylemeter', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.per, card.ability.extra.per * ((G.GAME && G.GAME.skips) || 0)] }),
  calculate(s, card, ctx) {
    if (ctx.skip_blind && !ctx.blueprint) {
      G.E_MANAGER.add_event(() => say(card, localize('$') + (G.GAME.skips * card.ability.extra.per), 'MONEY'));
    }
  },
  calc_dollar_bonus(s, card) {
    if (G.GAME.skips > 0) return G.GAME.skips * card.ability.extra.per;
  },
});

// ------------------------------------------------------------------ Stone Joker Joker
add('stonejokerjoker', {
  loc_vars: (s, iq) => { iq_push(iq, 'j_marble'); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.ending_shop && !card.getting_sliced && !(ctx.blueprint_card || card).getting_sliced) {
      G.E_MANAGER.add_event(() => {
        const n = create_card('Joker', G.jokers, null, null, null, null, 'j_marble', 'sjj');
        n.add_to_deck();
        n.set_edition({ negative: true });
        n.set_eternal(true);
        G.jokers.emplace(n);
        G.GAME.joker_buffer = 0;
      });
      say(ctx.blueprint_card || card, localize('k_plus_joker'), 'BLUE');
    }
  },
});

// ------------------------------------------------------------------ Sudoku
add('sudoku', {
  loc_vars(s, iq, card) {
    const colours = card.ability.extra.map((v) => (v > 0 ? 'FILTER' : 'UI.TEXT_INACTIVE'));
    return { vars: [card.ability.my_x_mult], colours };
  },
  calculate(s, card, ctx) {
    if (end_main(ctx) && !ctx.other_card && !ctx.blueprint && G.GAME.blind.boss) { // (cardarea G.jokers: the main end_of_round pass)
      card.ability.extra = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      return { message: localize('k_reset'), colour: 'RED', card };
    }
    if (ctx.individual && ctx.cardarea === G.play && !ctx.blueprint && !ctx.repetition) {
      let rank = ctx.other_card.get_id();
      if (rank === 14) rank = 1;
      if (rank >= 1 && rank <= 9 && card.ability.extra[rank - 1] === 0) {
        card.ability.extra[rank - 1] = 1;
        say(card, localize('k_noted_ex')); // (a per-card return's lone message isn't shown by the engine's scoring loop)
        return undefined;
      }
    }
    if (main(ctx) && card.ability.extra.every((v) => v !== 0)) return { xmult: card.ability.my_x_mult };
  },
});

// ------------------------------------------------------------------ Tall Joker
add('talljoker', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) { if (main(ctx)) return { mult: card.ability.extra.mult }; },
});

// ------------------------------------------------------------------ Teacup
add('teacup', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.before) {
      const { text } = get_poker_hand_info(ctx.full_hand);
      say(ctx.blueprint_card || card, localize('k_upgrade_ex'));
      level_up_hand(ctx.blueprint_card || card, text, null, 1);
      if (!ctx.blueprint && !ctx.retrigger_joker) {
        // (1.9.9999: SMODS.scale_card(ref_table = ability, 'extra', '-') — its default "Upgrade!" popup, as upstream)
        scale_card(card, { ref_table: card.ability, ref_value: 'extra', operation: '-' });
        if (card.ability.extra <= 0) {
          remove_joker(card);
          return { message: localize('k_drank_ex'), colour: 'FILTER' };
        }
      }
    }
  },
});

// ------------------------------------------------------------------ Teal Joker
add('tealjoker', {
  update(s, card) { card.ability.extra.teal_tally = G.playing_cards ? tally('m_mf_teal') : 0; },
  loc_vars(s, iq, card) {
    iq_push(iq, 'm_mf_teal');
    const t = card.fake ? 0 : tally('m_mf_teal');
    return { vars: [card.ability.extra.x_chips_per, 1 + card.ability.extra.x_chips_per * t] };
  },
  calculate(s, card, ctx) {
    if (main(ctx) && card.ability.extra.teal_tally > 0) return { xchips: 1 + card.ability.extra.x_chips_per * card.ability.extra.teal_tally };
  },
});

// ------------------------------------------------------------------ the way home
add('thewayhome', {
  loc_vars: (s, iq, card) => { const [n, d] = prob(card, card.ability.odds, 'thewayhome'); return { vars: [n, d, card.ability.extra] }; },
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !(ctx.blueprint_card || card).getting_sliced) {
      if (probability_roll(card, 'thewayhome', 1, card.ability.odds, 'thewayhome')) {
        return { message: localize('k_correct_ex'), func() { ease_hands_played(card.ability.extra); } };
      }
    }
  },
});

export const centers = J;
export const JOKERS_B = J.map((c) => c.key);
export const hooks = {
  voucher_add(phase) { if (phase === 'after_tags') junkmail_vouchers(); },
  draw_hand_space: snake_space,

  evaluate_round() { missingjoker_revert(); return undefined; },
  new_round() { G.GAME.mf_tree_three = false; },
  // tree_three.toml at cash out (ease_chips(0)): the shop opens right after. (1.9.9999 dropped onesliptoolate.toml,
  // 1.5.6's reset of hands_played at cash out.)
  shop_start() { if (G.STATE === STATES.SHOP && !G.shop_populated) G.GAME.mf_tree_three = false; },
  view(v) { if (G.GAME && G.GAME.mf_tree_three) v.chips_text = 'TREE(3)'; },
};
