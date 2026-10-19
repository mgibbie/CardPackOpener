/**
 * Bunco — jokers, part A (25): Bunco.lua's create_joker blocks from Cassette to Registration Plate
 * (~lines 1170-2273), in the Lua's order, plus their lovely patches (lovely.toml: Cassette's Card:flip,
 * X-Ray's CardArea:emplace, Dread's copy_card, Loan Shark's Card:set_cost, Knight's Node:drag / stop_drag,
 * JMJB's and Doorhanger's create_card) and Fiendish's part of BUNCOMOD.funcs.ease_dollars (Bunco.lua ~836)
 * and Sledgehammer's Game:start_run wrap (~1000). Numbers come from data.js.
 *
 * Port notes (Micatro equivalents, not behaviour changes):
 *  - Card lists kept in an ability (Prehistoric's card_list, Dread's trash_list, Registration Plate's
 *    card_list) hold Card sort_ids, resolved through REFS (every card ever listed, by id): a Card inside an
 *    ability would be deep-copied by copy_table (copy_card) — which recurses through the whole game (Lua's
 *    copy_table does the same and would hang). Same cards, same checks.
 *  - Cassette: the lovely "Card:flip() (Cassette)" patch is systems.js's `flip` hook (keeps the card face up
 *    and calls calculate_joker({flip = true})); the B-side art is `get_pos` (Lua update / set_sprites).
 *  - Ghost Print adds the last hand's chips and mult right in joker_main (Lua: mult = mod_mult(mult + ...));
 *    here that is its return {chip_mod, mult_mod} with the hand-name message (same totals).
 *  - Zero Shapiro's D6 Tag `func` rides in its `extra` (where Micatro's per-card loop runs funcs).
 *  - Knight: the Node:drag / stop_drag patch is the `reordered` hook (a 'reorder' action of G.jokers):
 *    the jokers' names before vs after. Its own setting_blind shuffle is not a drag (no reset), as in Lua.
 *  - Registration Plate re-rolls its ranks on the main end_of_round pass only (Lua: on every end_of_round
 *    context, held-card ones included — repeated re-rolls, the last one wins; same outcome).
 *  - Fiendish: its BUNCOMOD.funcs.ease_dollars part is jokers_c.js's `ease_dollars` hook (one walk over G.jokers,
 *    Fiendish and Bounty Hunter in joker order, as the Lua loop).
 *  - Sledgehammer: `reset_run` restores m_glass's vanilla Xmult 2 / extra 4 at every new run (the Lua start_run
 *    wrap re-applied loaded Sledgehammers on top of whatever the table held; Micatro runs replay from scratch).
 *  - Dread destroys context.full_hand as the Lua does (its text says "scored cards").
 *  - Purely visual parts skipped: Knight / Bierdeckel square and Doorhanger narrow shapes, juice_card_until,
 *    update_hand_text, Carnival's random slice pitch. Unlock conditions are skipped (everything unlocked).
 *
 * Intended-design fixes (each has a test that fails with the fix reverted):
 *  1. Sledgehammer: add / remove count SMODS.find_card('j_bunc_sledgehammer') to apply Glass's 1 in 4 -> 1 in 1
 *     only for the first / last one. A debuff (Card:set_debuff calls remove_from_deck(true) while the card is
 *     still in G.jokers and not yet debuffed) counts the card itself, so the chance is not restored; the
 *     un-debuff (add_to_deck(true) while still debuffed) then divides it again (1 in 0.25), and Glass stays
 *     guaranteed to break for the rest of the run even after the Sledgehammer is gone. Both now count the
 *     OTHER Sledgehammers (same result as the Lua for buying / selling / destroying).
 *  2. Dread: SMODS calls remove_from_deck on a debuff too, so a debuffed Dread dropped its levels, regained
 *     nothing when re-enabled, and dropped them again when removed. Levels are now lost only on a real
 *     removal (from_debuff is ignored), as its text says.
 *  3. Loan Shark: SMODS calls add_to_deck again when a debuffed card is re-enabled, so every debuff cycle
 *     (e.g. Crimson Heart) paid another $50. It pays only when acquired (from_debuff is ignored).
 *  4. Knight: the stop_drag patch clears break_table after the first Knight it finds, so only the first
 *     Knight reset; every (non-debuffed) Knight now resets when the jokers are rearranged.
 */
import {
  G, P_CENTERS, P_CENTER_POOLS, enhancement_pool, create_card, ease_dollars, ease_ante, eval_card, level_up_hand, localize,
  math_random, poll_edition, pseudorandom, pseudorandom_element, pseudoseed, play_sound,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import LOC from './loc.js';
import { joker, find, say, forced_message, event, big_juice, SEED, HUGE, FLEURONS, HALBERDS } from './util.js';

export const centers = [];
const J = (slug, def) => centers.push(joker(slug, def));
const E = (card) => card.ability.extra;
/** The main (non-individual) end_of_round pass (Lua `context.end_of_round and not context.other_card`). */
const eor = (ctx) => ctx.end_of_round && !ctx.other_card && !ctx.individual && !ctx.repetition;
/** Collection view (no live card area) — the Lua's `card.area.config.collection` (+ Fairy Deck unlocked). */
const in_collection = (card) => !card || !card.area || (card.area.config && card.area.config.collection);
/** Lua tostring() of a float (14 significant digits): 1.4000000000000001 -> 1.4. */
const num = (x) => Number(Number(x).toPrecision(14));
const text_of = (key) => (LOC.descriptions.Joker[key] || { text: [] }).text;
const fill = (lines, vars) => lines.map((l) => l.replace(/#(\d+)#/g, (m, n) => (vars[n - 1] !== undefined ? vars[n - 1] : m)));

/** Cards referenced by id from an ability list (see header). */
const REFS = new Map();
const ref = (c) => { REFS.set(c.sort_id, c); return c.sort_id; };
const deref = (id) => REFS.get(id);

// Cassette
J('cassette', {
  loc_vars(s, info_queue, card) {
    const e = E(card);
    const vars = [e.chips, e.mult];
    const other = e.side === 'A' ? 'b' : 'a';
    const main_end = [
      ...text_of('j_bunc_cassette_extra'),
      '{C:white,X:inactive} ' + localize('bunc_' + other + '_side') + ' {}',
      ...fill(text_of('j_bunc_cassette_' + other), vars),
    ];
    const exotic = in_collection(card) || (G.GAME && G.GAME.Exotic);
    if (e.side === 'A') {
      info_queue.push({ set: 'Other', key: exotic ? 'bunc_light_suits_exotic' : 'bunc_light_suits' });
      return { key: s.key + '_a', main_end, vars };
    }
    info_queue.push({ set: 'Other', key: exotic ? 'bunc_dark_suits_exotic' : 'bunc_dark_suits' });
    return { key: s.key + '_b', main_end, vars };
  },
  /** B side: the next atlas cell (Lua update / set_sprites: coordinate(1) / coordinate(2)). */
  get_pos: (s, card) => (card && card.ability && card.ability.extra && card.ability.extra.side === 'B' ? { x: 1, y: 0 } : { x: 0, y: 0 }),
  calculate(s, card, ctx) {
    if (ctx.pre_discard && !ctx.blueprint) card.flip();
    if (ctx.flip && !ctx.blueprint) {
      forced_message(localize('bunc_' + (E(card).side === 'A' ? 'b' : 'a') + '_side'), card, 'RED');
      E(card).side = E(card).side === 'A' ? 'B' : 'A';
    }
    if (ctx.individual && ctx.cardarea === G.play) {
      const other_card = ctx.other_card;
      const side = E(card).side;
      if (other_card.is_suit('Hearts') || other_card.is_suit('Diamonds') || other_card.is_suit(FLEURONS)) {
        if (side === 'A') return { chips: E(card).chips, card };
      }
      if (other_card.is_suit('Spades') || other_card.is_suit('Clubs') || other_card.is_suit(HALBERDS)) {
        if (side === 'B') return { mult: E(card).mult, card };
      }
    }
  },
});

// Mosaic
J('mosaic', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).mult] }),
  in_pool: () => !!(G.playing_cards && G.playing_cards.some((v) => v.config.center === P_CENTERS.m_stone)),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.config.center === P_CENTERS.m_stone) {
      return { mult: E(card).mult, card };
    }
  },
});

// Voxel
function voxel_update(card) {
  if (G.playing_cards) {
    const e = E(card);
    e.tally = 0;
    for (const v of G.playing_cards) if (v.config.center !== P_CENTERS.c_base) e.tally = e.tally + 1;
    e.xmult = (e.base - e.tally * e.bonus) >= 1 ? e.base - e.tally * e.bonus : 1;
  }
}
J('voxel', {
  loc_vars(s, iq, card) { voxel_update(card); const e = E(card); return { vars: [e.base, e.bonus, num(e.xmult), e.tally, e.unlock] }; },
  update: (s, card) => voxel_update(card),
  calculate(s, card, ctx) {
    if (ctx.joker_main && E(card).xmult !== 1) {
      return { Xmult_mod: E(card).xmult, card, message: localize({ type: 'variable', key: 'a_xmult', vars: [num(E(card).xmult)] }) };
    }
  },
});

// Crop Circles
J('crop_circles', {
  loc_vars(s, iq, card) {
    if (in_collection(card) || (G.GAME && G.GAME.Exotic)) return { key: s.key + '_exotic' };
    return {};
  },
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play) {
      const oc = ctx.other_card;
      if (oc.config.center !== P_CENTERS.m_stone) {
        const id = oc.get_id();
        const mid = id === 12 || id === 10 || id === 9 || id === 6;
        if (oc.base.suit === FLEURONS) return { mult: id === 8 ? 6 : mid ? 5 : 4, card };
        if (oc.base.suit === 'Clubs') return { mult: id === 8 ? 5 : mid ? 4 : 3, card };
        if (id === 8) return { mult: 2, card };
        if (mid) return { mult: 1, card };
      }
    }
  },
});

// Xray
J('xray', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).bonus, num(E(card).xmult)] }),
  calculate(s, card, ctx) {
    if (ctx.emplaced_card && ctx.emplaced_card.facing === 'back' && !ctx.blueprint) {
      E(card).xmult = E(card).xmult + E(card).bonus;
      forced_message('X' + num(E(card).xmult) + ' ' + localize('k_mult'), card, 'RED', E(card).bonus);
    }
    if (ctx.joker_main && E(card).xmult !== 1) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [num(E(card).xmult)] }), Xmult_mod: E(card).xmult, card };
    }
  },
});

// Dread
J('dread', {
  config: { extra: { levels: 2, trash_list: [], level_up_list: {}, unlock: 10 } },
  loc_vars: (s, iq, card) => ({ vars: [E(card).levels, '', '', E(card).unlock] }),
  calculate(s, card, ctx) {
    if (ctx.blueprint) return;
    const e = E(card);
    if (ctx.full_hand && !ctx.other_card) e.trash_list = ctx.full_hand.map(ref);
    if (ctx.after && G.GAME.current_round.hands_left <= 0 && ctx.scoring_name) {
      forced_message(localize('k_level_up_ex'), card, 'RED', true);
      level_up_hand(card, ctx.scoring_name, false, e.levels);
      e.level_up_list[ctx.scoring_name] = (e.level_up_list[ctx.scoring_name] || 0) + e.levels;
      const trash_list = e.trash_list.map(deref).filter(Boolean);
      event(() => {
        big_juice(card);
        for (const c of trash_list) if (!c.removed) c.start_dissolve();
      });
      for (const c of trash_list) c.destroyed = true;
      // SMODS.calculate_context({remove_playing_cards = true, removed = trash_list})
      for (const j of G.jokers.cards.slice()) eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: trash_list });
      e.trash_list = [];
    }
  },
  remove_from_deck(s, card, from_debuff) {
    if (from_debuff) return; // (fix 2)
    for (const [name, level] of Object.entries(E(card).level_up_list)) level_up_hand(card, name, true, -level);
  },
});

// Prehistoric
J('prehistoric', {
  config: { extra: { mult: 16, card_list: [] } },
  loc_vars: (s, iq, card) => ({ vars: [E(card).mult] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play) {
      const oc = ctx.other_card;
      for (const v of E(card).card_list.map(deref)) {
        if (v && v.get_id() === oc.get_id() && (v.is_suit(oc.base.suit) || oc.config.center === P_CENTERS.m_wild) && oc.config.center !== P_CENTERS.m_stone) {
          return { mult: E(card).mult, card };
        }
      }
      if (!ctx.blueprint && oc.config.center !== P_CENTERS.m_stone) E(card).card_list.push(ref(oc));
    }
    if (ctx.end_of_round && !ctx.other_card) E(card).card_list = [];
  },
});

// Linocut
J('linocut', {
  loc_vars: () => ({ vars: [] }),
  calculate(s, card, ctx) {
    if (ctx.after && ctx.scoring_hand && ctx.scoring_hand.length === 2 && !ctx.blueprint) {
      if (ctx.poker_hands && ctx.poker_hands.Pair && ctx.poker_hands.Pair.length) {
        const [left, right] = ctx.scoring_hand;
        event(() => { left.flip(); play_sound('card1', 1); });
        event(() => { left.change_suit(right.config.card.suit); });
        event(() => { left.flip(); play_sound('tarot2', 1, 0.6); big_juice(card); });
        forced_message(localize('bunc_copied'), card, 'RED', true);
      }
    }
  },
});

// Ghost Print
J('ghost_print', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).last_hand === 'Nothing' ? localize('bunc_nothing') : localize(E(card).last_hand, 'poker_hands')] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      let ret;
      const lh = E(card).last_hand;
      if (lh !== 'Nothing' && G.GAME.hands[lh]) {
        const h = G.GAME.hands[lh];
        ret = { chip_mod: h.chips, mult_mod: h.mult, message: localize(lh, 'poker_hands') + '!', colour: 'HAND_LEVELS', card: ctx.blueprint_card || card };
      }
      if (!ctx.blueprint) E(card).last_hand = G.GAME.last_hand_played;
      return ret;
    }
  },
});

// Loan Shark
J('loan_shark', {
  loc_vars(s, iq, card) {
    const vars = [E(card).dollars, E(card).cost];
    return in_collection(card) ? { key: s.key + '_full', vars } : { vars };
  },
  add_to_deck(s, card, from_debuff) {
    if (from_debuff) return; // (fix 3)
    ease_dollars(E(card).dollars);
    card.set_cost();
  },
});

// Basement
J('basement', {
  loc_vars: () => ({ vars: [] }),
  calculate(s, card, ctx) {
    if (eor(ctx) && G.GAME.blind.boss) {
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        forced_message(localize('k_plus_spectral'), ctx.blueprint ? ctx.blueprint_card : card, 'SECONDARY_SET.Spectral');
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        const spectral = create_card('Spectral', G.consumeables, null, null, null, null, null);
        spectral.add_to_deck();
        G.consumeables.emplace(spectral);
        G.GAME.consumeable_buffer = 0;
      }
    }
  },
});

// Shepherd
J('shepherd', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).bonus, E(card).chips] }),
  calculate(s, card, ctx) {
    if (ctx.before && ctx.poker_hands && ctx.poker_hands.Pair && ctx.poker_hands.Pair.length && !ctx.blueprint) {
      E(card).chips = E(card).chips + E(card).bonus;
      forced_message('+' + E(card).chips + ' ' + localize('bunc_chips'), card, 'BLUE', true);
    }
    if (ctx.joker_main && E(card).chips !== 0) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [E(card).chips] }), chip_mod: E(card).chips, card };
    }
  },
});

// Knight
J('knight', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).bonus, E(card).mult] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !card.getting_sliced && !ctx.blueprint) {
      E(card).mult = E(card).mult + E(card).bonus;
      event(() => {
        event(() => { G.jokers.shuffle('aajk'); play_sound('cardSlide1', 0.85); });
        event(() => { G.jokers.shuffle('aajk'); play_sound('cardSlide1', 1.15); });
        event(() => { G.jokers.shuffle('aajk'); play_sound('cardSlide1', 1); });
      });
      forced_message('+' + E(card).mult + ' ' + localize('k_mult'), card, 'RED');
    }
    if (ctx.break_positions && !ctx.blueprint && E(card).mult !== 0) {
      E(card).mult = 0;
      forced_message(localize('k_reset'), card, 'RED');
    }
    if (ctx.joker_main && E(card).mult !== 0) {
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [E(card).mult] }), mult_mod: E(card).mult, card };
    }
  },
});

// JMJB
J('jmjb', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).unlock] }),
  calculate(s, card, ctx) {
    if (ctx.open_booster && ctx.card.ability.name) {
      const n = ctx.card.ability.name;
      if (n === 'Standard Pack' || n === 'Jumbo Standard Pack' || n === 'Mega Standard Pack') {
        event(() => {
          if (G.pack_cards && G.pack_cards.cards && G.pack_cards.cards[0]) {
            for (const v of G.pack_cards.cards) {
              if (v.config.center === P_CENTERS.c_base) { const pool = enhancement_pool(); v.set_ability(pool[math_random(pool.length) - 1]); }
            }
          }
        });
      }
    }
  },
});

// Dogs Playing Poker
J('dogs_playing_poker', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).xmult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      let condition = true;
      if (ctx.scoring_hand) {
        for (const c of ctx.scoring_hand) {
          if ((c.get_id() >= 6 || c.get_id() < 2) && c.config.center !== P_CENTERS.m_stone) condition = false;
        }
      }
      if (condition) return { Xmult_mod: E(card).xmult, card, message: localize({ type: 'variable', key: 'a_xmult', vars: [E(card).xmult] }) };
    }
  },
});

// Righthook
J('righthook', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).unlock] }),
  calculate(s, card, ctx) {
    if (ctx.repetition && ctx.cardarea === G.play && ctx.scoring_hand && ctx.other_card === ctx.scoring_hand[ctx.scoring_hand.length - 1]) {
      return { message: localize('k_again_ex'), repetitions: G.GAME.current_round.hands_left, card };
    }
  },
});

// Fiendish (its effect: the ease_dollars hook below)
J('fiendish', {
  loc_vars: (s, iq, card) => ({ vars: [G.GAME && G.GAME.probabilities ? G.GAME.probabilities.normal : 1, E(card).odds] }),
});

// Carnival
J('carnival', {
  config: { extra: { ante: -HUGE } },
  loc_vars(s, iq, card) {
    const active = !!(G.GAME && G.GAME.round_resets && G.GAME.round_resets.ante > E(card).ante);
    return { vars: [], main_end: [(active ? '{C:green}' : '{C:red}') + ' ' + localize(active ? 'k_active' : 'bunc_inactive') + ' {}'] };
  },
  calculate(s, card, ctx) {
    if (eor(ctx) && G.GAME.blind.boss && !ctx.blueprint) {
      if (G.GAME.round_resets.ante > E(card).ante) {
        const destructable_jokers = G.jokers.cards.filter((j) => j !== card && !j.ability.eternal && !j.getting_sliced);
        const joker_to_destroy = destructable_jokers.length > 0 ? pseudorandom_element(destructable_jokers, pseudoseed('carnival'))[0] : null;
        if (joker_to_destroy && !card.getting_sliced) {
          joker_to_destroy.getting_sliced = true;
          E(card).ante = G.GAME.round_resets.ante;
          ease_ante(-1);
          forced_message(localize('bunc_loop'), card, 'BLACK');
          joker_to_destroy.start_dissolve();
          play_sound('slice1', 1);
        }
      }
    }
  },
});

// Sledgehammer
const VANILLA_GLASS = { Xmult: 2, extra: 4 };
const other_sledgehammers = (card) => find('j_bunc_sledgehammer').filter((c) => c !== card).length; // (fix 1)
const glass_cards = () => (G.playing_cards || []).filter((c) => c.config.center === P_CENTERS.m_glass);
function sledge_xmult(d) {
  P_CENTERS.m_glass.config.Xmult = P_CENTERS.m_glass.config.Xmult + d;
  for (const c of glass_cards()) {
    if (c.ability.Xmult !== undefined) c.ability.Xmult = c.ability.Xmult + d;
    c.ability.x_mult = c.ability.x_mult + d;
  }
}
function sledge_chance(f) {
  P_CENTERS.m_glass.config.extra = P_CENTERS.m_glass.config.extra * f;
  for (const c of glass_cards()) c.ability.extra = c.ability.extra * f;
}
J('sledgehammer', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).plus_xmult, E(card).div_chance_denom] }),
  in_pool: () => glass_cards().length > 0,
  add_to_deck(s, card) {
    sledge_xmult(E(card).plus_xmult);
    if (other_sledgehammers(card) === 0) sledge_chance(1 / s.config.extra.div_chance_denom);
  },
  remove_from_deck(s, card) {
    sledge_xmult(-E(card).plus_xmult);
    if (other_sledgehammers(card) === 0) sledge_chance(s.config.extra.div_chance_denom);
  },
});

// Doorhanger (its effect: the create_card_rarity hook below)
J('doorhanger', { loc_vars: () => ({ vars: [] }) });

// Fingerprints
J('fingerprints', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).bonus] }),
  calculate(s, card, ctx) {
    if (ctx.after && ctx.scoring_name !== undefined && ctx.scoring_hand && !ctx.blueprint) {
      E(card).scoring_card_set = {};
      for (const c of ctx.scoring_hand) E(card).scoring_card_set[c.unique_val] = true;
    }
    if (eor(ctx) && !ctx.blueprint) {
      const set = E(card).scoring_card_set || {};
      for (const v of G.playing_cards) {
        if (set[v.unique_val]) v.ability.temporary_extra_chips = (v.ability.temporary_extra_chips || 0) + E(card).bonus;
      }
      E(card).scoring_card_set = undefined;
      forced_message(localize('k_upgrade_ex'), card, 'CHIPS', true);
    }
  },
});

// Zero Shapiro
J('zero_shapiro', {
  loc_vars(s, info_queue, card) {
    info_queue.push({ set: 'Tag', key: 'tag_d_six' });
    return { vars: [G.GAME && G.GAME.probabilities ? G.GAME.probabilities.normal : 1, E(card).odds] };
  },
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play) {
      const oc = ctx.other_card;
      const v = oc.base.value;
      if (oc.config.center.key === 'm_stone' || oc.get_id() === 0 || (isNaN(Number(v)) && v !== 'Ace')) {
        if (pseudorandom('zero_shapiro' + SEED()) < G.GAME.probabilities.normal / E(card).odds) {
          return {
            extra: {
              message: '+' + localize({ type: 'name_text', key: 'tag_d_six', set: 'Tag' }), colour: 'GREEN',
              func: () => { event(() => { add_tag(new Tag('tag_d_six')); }); },
            },
            card,
          };
        }
      }
    }
  },
});

// Nil Bill
J('nil_bill', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).bonus] }),
  calculate(s, card, ctx) {
    if (ctx.remove_playing_cards && ctx.removed) {
      ease_dollars(E(card).bonus * ctx.removed.length);
      forced_message('$' + E(card).bonus * ctx.removed.length, card, 'MONEY');
    }
  },
});

// Bierdeckel
J('bierdeckel', {
  loc_vars: (s, iq, card) => ({ vars: [E(card).bonus] }),
  calculate(s, card, ctx) {
    if (ctx.after || (ctx.discard && ctx.full_hand && ctx.other_card === ctx.full_hand[0])) {
      const full_hand_set = new Set(ctx.discard ? ctx.full_hand : []);
      for (const c of G.hand.cards) {
        if (!full_hand_set.has(c) && !c.highlighted && !G.hand.highlighted.includes(c)) {
          c.ability.temporary_extra_chips = (c.ability.temporary_extra_chips || 0) + E(card).bonus;
        }
      }
      forced_message(localize('k_upgrade_ex'), ctx.blueprint_card || card, 'CHIPS', true);
    }
  },
});

// Registration Plate
function plate_roll(card) {
  const e = E(card);
  if (!G.deck || G.deck.cards.length === 0) return; // (Lua: math.random(0) errors on an empty deck)
  const list = [];
  for (let i = 1; i <= 5; i++) list.push(G.deck.cards[math_random(G.deck.cards.length) - 1]);
  e.card_list = list.map(ref);
  const combination = list.map((c) => c.base.value);
  e.ranks = list.map((c) => c.get_id());
  e.combination = combination.slice(0, 4).join(', ') + ' ' + localize('bunc_word_and') + ' ' + combination[4];
}
J('registration_plate', {
  config: { extra: { combination: '', card_list: [], ranks: [] } },
  loc_vars: (s, iq, card) => ({ vars: [E(card).combination === '' ? '2, 3, 4, 5 ' + localize('bunc_word_and') + ' 6' : E(card).combination] }),
  add_to_deck: (s, card) => plate_roll(card),
  calculate(s, card, ctx) {
    if (eor(ctx) && G.deck.cards.length !== 0) plate_roll(card);
  },
});

// ------------------------------------------------------------------ hooks
export const hooks = {
  /** CardArea:emplace (X-Ray): each card that lands in hand is shown to every X-Ray. */
  emplace(area, card) {
    if (G.jokers && area === G.hand) {
      for (const v of G.jokers.cards.slice()) if (v.config.center.key === 'j_bunc_xray') v.calculate_joker({ emplaced_card: card });
    }
  },
  /** copy_card (Dread): a copy starts with no levels of its own to take back. */
  copy_card(new_card) {
    if (new_card.config.center.key === 'j_bunc_dread') new_card.ability.extra.level_up_list = {};
  },
  /** Card:set_cost (Loan Shark): once owned, it sells for -$100. */
  set_cost(card) {
    if (card.config.center.key === 'j_bunc_loan_shark' && card.added_to_deck) card.sell_cost = card.ability.extra.cost + (card.ability.extra_value || 0);
  },
  /** Node:drag / stop_drag (Knight): rearranged jokers reset every Knight (fix 4). */
  reordered(area, before) {
    if (!G.jokers || area !== G.jokers || !before) return;
    const knights = G.jokers.cards.filter((v) => v.config.center.key === 'j_bunc_knight' && !v.debuff);
    if (!knights.length) return;
    if (before.map((v) => v.ability.name).join() === G.jokers.cards.map((v) => v.ability.name).join()) return;
    for (const v of knights) v.calculate_joker({ break_positions: true });
  },
  /** create_card (JMJB): JMJB always comes with an edition (never Negative). */
  create_card(card) {
    if (card.config.center.key === 'j_bunc_jmjb') card.set_edition(poll_edition(null, null, true, true), true, true);
  },
  /** create_card (Doorhanger): a Common roll becomes Uncommon (2% Rare) per Doorhanger. */
  create_card_rarity(_rarity) {
    if (!G.jokers) return undefined;
    let changed = false;
    for (const v of G.jokers.cards) {
      if (v.config.center.key === 'j_bunc_doorhanger' && !v.debuff) {
        if (_rarity === undefined || _rarity === null || (typeof _rarity === 'number' && _rarity < 0.9) || _rarity === 'Common') {
          _rarity = 0.9;
          if (pseudorandom('doorhanger' + SEED()) > 0.98) _rarity = 1;
          changed = true;
        }
      }
    }
    return changed ? _rarity : undefined;
  },
  // (Fiendish's BUNCOMOD.funcs.ease_dollars part is walked with Bounty Hunter's in jokers_c.js `ease_dollars`,
  // one pass over G.jokers in joker order, like the Lua.)
};

/** Every new run: Glass back to its vanilla X2 / 1 in 4 (Sledgehammer edits the shared center). */
export function reset_run() {
  REFS.clear();
  if (P_CENTERS.m_glass) {
    P_CENTERS.m_glass.config.Xmult = VANILLA_GLASS.Xmult;
    P_CENTERS.m_glass.config.extra = VANILLA_GLASS.extra;
  }
}
