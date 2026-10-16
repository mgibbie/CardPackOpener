/**
 * More Fluff — jokers, part B (28): Cue Ball, Flint and Steel, Gemstone Joker, Globe, Golden Carrot,
 * Hall of Mirrors, Impostor, Joke Merge Valley, Friend Inside Me, Junk Mail, One Slip Too Late,
 * I Sip Toner Soup, Unpleasant Card, Lightning Strikes Thrice, Loaded Disk, Missing Joker, Paint Can,
 * Passing Balatro in 5 Minutes, Fast-Growing Sapling, Snake, Big Win, Style Meter, Stone Joker Joker,
 * Sudoku, Tall Joker, Teacup, Teal Joker, the way home.
 * Each is ported from `jokers/<file>.lua` (Cryptid's `context.forcetrigger` branches are dropped: no Cryptid).
 *
 * Lovely patches / Lua wraps as hooks:
 *   junkmail.toml         -> voucher_add('after_tags') + set_cost (Card.bonus_cost: the voucher costs X1.5)
 *   snake.toml            -> draw_hand_space (after a play or discard, draw exactly 3)
 *   unpleasantcard.toml   -> booster_open (the opened pack is skipped at once, like G.FUNCS.skip_booster)
 *   retrigger_seal_ctx    -> seal_retriggers (Lightning Strikes Thrice retriggers a Purple Seal's discard)
 *   tree_three.toml / onesliptoolate.toml -> new_round / shop_start resets (G.GAME.mf_tree_three,
 *                            current_round.hands_played = 0 at cash out)
 *   Game:update_round_eval (Missing Joker turns back) -> evaluate_round (no rows)
 *
 * INTENDED-DESIGN FIXES (each pinned in micatro/tests/mods/morefluff_jokers_b_test.mjs):
 *  1. Fast-Growing Sapling: selling it called G.GAME.blind:defeat() itself before the round ended, so the
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
import { joker, find, has, room, say, has_enh, has_no_rank, remove_joker } from './util.js';

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
      // (the reroll_shop context's return isn't shown by the engine: show it here)
      say(ctx.blueprint_card || card, localize('k_plus_planet'), 'Planet');
    }
  },
});

// ------------------------------------------------------------------ Golden Carrot
add('goldencarrot', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.gain, card.ability.extra.loss] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.after && !ctx.blueprint && !card.gone) {
      const e = card.ability.extra;
      if (e.gain - e.loss <= 0) {
        remove_joker(card);
        return { message: localize('k_eaten_ex'), colour: 'MONEY' };
      }
      e.gain = e.gain - e.loss;
      return { message: '$' + e.gain, colour: 'MONEY' };
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
      return { extra: { focus: card, message: localize('k_upgrade_ex') }, card, colour: 'MONEY' };
    }
    if (ctx.end_of_round && !ctx.blueprint && !ctx.repetition && !ctx.individual) {
      G.hand.change_size(-card.ability.h_size);
      card.ability.h_size = 0;
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
const MERGE_STATS = ['perma_bonus', 'perma_mult', 'perma_x_chips', 'perma_x_mult', 'perma_h_chips', 'perma_h_mult',
  'perma_h_x_chips', 'perma_h_x_mult', 'perma_p_dollars', 'perma_h_dollars'];
add('farmmerge', {
  calculate(s, card, ctx) {
    // (Steamodded's pre_discard context is a joker-row context: cardarea G.jokers)
    if (!ctx.pre_discard || ctx.blueprint) return undefined;
    if (ctx.full_hand.length !== 3) return undefined;
    const last = ctx.full_hand[2];
    const stats = Object.fromEntries(MERGE_STATS.map((k) => [k, 0]));
    let enhancement = null, edition = null, seal = null;
    for (const v of ctx.full_hand) {
      if (v.base.value !== last.base.value) return undefined;
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
        say(card, 'Friend!'); // (the engine ignores a selling_card return: shown here)
      }
    }
    if (end_main(ctx) && !ctx.blueprint && G.GAME.blind.boss) {
      card.ability.active = true;
      return { message: localize('k_active_ex') };
    }
  },
});

// ------------------------------------------------------------------ Junk Mail
add('junkmail', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.val_mult] }),
});
function junkmail_vouchers() {
  for (const card of find('j_mf_junkmail')) {
    const key = get_next_voucher_key(true);
    G.shop_vouchers.config.card_limit = G.shop_vouchers.config.card_limit + 1;
    const nc = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
    nc.shop_voucher = true;
    nc.bonus_cost = nc.cost * (card.ability.val_mult - 1);
    nc.set_cost();
    G.shop_vouchers.emplace(nc);
    emit('materialize', { card: nc.sort_id });
    say(card, localize('k_plus_voucher'));
  }
}
/** junkmail.toml: Card:set_cost adds `self.bonus_cost` to extra_cost before the cost is computed. */
function bonus_cost(card) {
  if (!card.bonus_cost) return;
  card.extra_cost += card.bonus_cost;
  card.cost = Math.max(1, Math.floor((card.base_cost + card.extra_cost + 0.5) * (100 - G.GAME.discount_percent) / 100));
  if (card.ability.rental) card.cost = 1;
  card.sell_cost = Math.max(1, Math.floor(card.cost / 2)) + (card.ability.extra_value || 0);
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
        const c = create_card('Tarot', G.consumeables, null, null, null, null, null, 'sup');
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
const PACK = [STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND];
/** unpleasantcard.toml (SMODS Booster update_pack): with Unpleasant Card, an opened pack skips itself. */
function unpleasant_skip() {
  if (!has('j_mf_unpleasantcard')) return;
  let tries = 0;
  const check = () => {
    // (the Lua checks every frame: wait for the pack's STOP_USE to clear)
    if (G.GAME.STOP_USE && G.GAME.STOP_USE > 0 && tries++ < 50) { G.E_MANAGER.add_event(check); return; }
    if (!PACK.includes(G.STATE) || !(G.pack_cards && G.pack_cards.cards.length)) return;
    // G.FUNCS.skip_booster
    for (const j of G.jokers.cards.slice()) j.calculate_joker({ skipping_booster: true });
    end_consumeable();
  };
  G.E_MANAGER.add_event(check);
}

// ------------------------------------------------------------------ Lightning Strikes Thrice
add('lightningstrikesthrice', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.retriggers] }),
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check && !ctx.retrigger_joker && ctx.other_context && ctx.other_context.discard) {
      return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
    }
  },
});
/** retrigger_seal_ctx.toml: jokers answering mf_seal_repetition retrigger a seal (here: a discard). */
function lst_seal_retriggers(seal_card, context) {
  if (!context.discard) return undefined;
  const out = [];
  for (const j of G.jokers.cards) {
    if (j.debuff || j.config.center.key !== 'j_mf_lightningstrikesthrice') continue;
    out.push({ card: j, ret: { message: localize('k_again_ex'), repetitions: j.ability.extra.retriggers, card: j } });
  }
  return out.length ? out : undefined;
}

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
      return { message: 'Transformed!', colour: 'DARK_EDITION' };
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
        say(card, e.blinds_skipped + '/' + e.threshold); // (the engine ignores a skip_blind return: shown here)
      }
    }
  },
});

// ------------------------------------------------------------------ Fast-Growing Sapling
const sap_bar = (val, max) => (max > 12 ? [val, '/' + max] : ['#'.repeat(val), '#'.repeat(Math.max(0, max - val))]);
add('sapling', {
  loc_vars(s, iq, card) {
    const e = card.ability.extra;
    const [val, max] = sap_bar(Math.min(e.c_rounds, e.rounds), e.rounds);
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
/** snake.toml: after a play or discard, each Snake sets the draw to min(#deck, 3). */
function snake_space(n) {
  if (G.STATE !== STATES.DRAW_TO_HAND || !(G.GAME.current_round.hands_played > 0 || G.GAME.current_round.discards_used > 0)) return undefined;
  for (const j of find('j_mf_snake')) n = Math.min(G.deck.cards.length, j.ability.extra);
  return n;
}

// ------------------------------------------------------------------ Big Win
add('slotmachine', {
  loc_vars: (s, iq, card) => { const [n, d] = prob(card, card.ability.extra.odds, 'slotmachine'); return { vars: [n, d, card.ability.extra.retriggers] }; },
  calculate(s, card, ctx) {
    if (ctx.repetition && ctx.other_card && ctx.other_card.get_id() === 7) {
      if (probability_roll(card, 'slotmachine', 1, card.ability.extra.odds, 'slotmachine')) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
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
        if (card.ability.extra - 1 <= 0) {
          remove_joker(card);
          return { message: localize('k_drank_ex'), colour: 'FILTER' };
        }
        card.ability.extra = card.ability.extra - 1;
        return { message: card.ability.extra + '', colour: 'FILTER' };
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
  set_cost: bonus_cost,
  draw_hand_space: snake_space,
  booster_open: unpleasant_skip,
  seal_retriggers: lst_seal_retriggers,
  evaluate_round() { missingjoker_revert(); return undefined; },
  new_round() { G.GAME.mf_tree_three = false; },
  // tree_three / onesliptoolate patches at cash out (ease_chips(0)): the shop opens right after.
  shop_start() { if (G.STATE === STATES.SHOP && !G.shop_populated) { G.GAME.mf_tree_three = false; G.GAME.current_round.hands_played = 0; } },
  view(v) { if (G.GAME && G.GAME.mf_tree_three) v.chips_text = 'TREE(3)'; },
};
