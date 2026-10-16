/**
 * Bunco — jokers, part C (30, Bunco.lua ~3363-4388, in the mod's order): Bounty Hunter, Mousetrap, The Joker,
 * Tangram, Domino, Glue Gun, Taped, Rubber Band Ball, Headache, Games Collector, Jumper, Stylophone,
 * Kite Experiment, Robot, Hardtack, Pica; the Exotic jokers Zealous, Lurid, Envious, Proud, Wishalloy,
 * Unobtanium, Dynasty, Magic Wand, Starfruit, Fondue, Myopia, Astigmatism, ROYGBIV; the legendary Rigoletto.
 * Numbers come from data.js (create_joker's `vars` -> config.extra, in order; `custom_config` as is).
 *
 * Port notes (Micatro equivalents, not behaviour changes):
 *  - Every `pseudorandom('x'..G.SEED)` roll uses util SEED() (the run's seed — see util.js).
 *  - Bounty Hunter: BUNCOMOD.funcs.ease_dollars (Bunco.lua ~834, patched into the top of ease_dollars) is the
 *    threaded `ease_dollars` hook: each non-debuffed Bounty Hunter, while the amount is still positive, gets
 *    calculate_joker({get_money}) and takes $1 off. Fiendish's part (jokers_a) is in the same walk, so both act in
 *    joker order as in the Lua's single loop.
 *  - Zealous / Lurid / Dynasty / Envious / Proud have no calculate in the mod: Steamodded falls back to the
 *    vanilla generic t_mult / t_chips / x_mult+type / 'Suit Mult' code. Micatro's mod centers don't reach that
 *    code, so those lines are ported here (vanilla card.lua's own conditions).
 *  - The Joker: SMODS.calculate_context({remove_playing_cards}) reaches every joker (vanilla ones too), so the
 *    cards it destroys are announced to G.jokers with eval_card like the engine's own destroy pass. Its
 *    animated atlas / square shape are visual. In Blind Packs it is created by packs.js (Bunco.lua ~7935).
 *  - Domino: the lovely patches (~1212-1335) capture the bought / used card's neighbours in its area before it
 *    leaves, then call Domino. Buying: the `bought` hook (runs after buy_from_shop queued its event, card still
 *    in the shop) captures them and queues the Domino call right behind the buy event. Using: the `use_card`
 *    hook captures them and queues the call; Lua only calls it once the card was actually taken / used (the
 *    add_to_deck / use_consumeable branches, after check_use), so the queued call is skipped when the card is
 *    still in its old area (check_use refused it). Boosters and vouchers never reach those branches.
 *  - Rubber Band Ball / Rigoletto: their `update` runs every frame in Lua; Micatro runs it before each
 *    calculate (engine) and before their loc_vars (so the description is current).
 *  - Myopia / Astigmatism: the Card:is_suit lovely patch (~1375) is the `is_suit` hook (true / no opinion); the
 *    Exotic Smeared `false` rule of the same patch is systems.js's.
 *  - Games Collector (context.groups_drawn, called by systems' linked draw), Kite Experiment / Robot
 *    (context.rescore_cards, the Copper re-score's calculate_context; copper_rescored_times lives on the
 *    playing card's `config`), Hardtack / Pica (their cracker rules are flow.js's: only the centers here).
 *  - Skipped (visual): Stylophone's Card:click sounds, Taped's offset / size, Domino's narrow shape, Headache's
 *    shader / floating sprite, The Joker's animation. Unlock conditions are skipped (everything unlocked).
 *
 * Intended-design fixes: none were needed in this range.
 */
import {
  G, P_CENTERS, ease_dollars, ease_hands_played, level_up_hand, eval_card, pseudorandom, localize, play_sound,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { check_for_buy_space, STATES } from '../../js/engine/run.js';
import { playing_card_joker_effects } from '../../js/engine/consumables.js';
import {
  joker, find, say, event, forced_message, big_juice, exotic_in_pool, enable_exotics, link_cards, SEED, FLEURONS, HALBERDS,
} from './util.js';

const nx = (t) => !!(t && t.length);
const odds_vars = (card) => [G.GAME && G.GAME.probabilities.normal ? G.GAME.probabilities.normal : 1, card.ability.extra.odds];
const roll = (key, odds) => pseudorandom(key + SEED()) < G.GAME.probabilities.normal / odds;
const LINKED = { set: 'Other', key: 'bunc_linked_group' };
const has_center = (key) => !!(G.playing_cards && G.playing_cards.some((v) => v.config.center.key === key));
const exotic = { in_pool: () => exotic_in_pool() };

export const centers = [];
/** create_joker's default loc_vars: config.extra values in the `vars` order. */
const J = (slug, def, var_keys) => {
  const d = { ...def };
  if (!d.loc_vars && var_keys) d.loc_vars = (s, iq, card) => ({ vars: var_keys.map((k) => card.ability.extra[k]) });
  centers.push(joker(slug, d));
};

// Bounty Hunter
J('bounty_hunter', {
  calculate(s, card, ctx) {
    if (ctx.get_money && !ctx.blueprint) card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.bonus;
    if (ctx.joker_main && card.ability.extra.mult !== 0) {
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), mult_mod: card.ability.extra.mult, card };
    }
  },
}, ['bonus', 'mult', 'unlock']);

// Mousetrap
J('mousetrap', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, ...odds_vars(card)] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      if (roll('mousetrap', card.ability.extra.odds)) {
        if (G.GAME.current_round.hands_left !== 0) ease_hands_played(-1);
        event(() => play_sound('bunc_mousetrap'));
        forced_message(localize('bunc_ouch'), card, 'RED', true);
      } else {
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), chip_mod: card.ability.extra.chips };
      }
    }
  },
});

// The Joker
J('the_joker', {
  config: { extra: { trash_list: [], odds: 3 } },
  loc_vars: (s, iq, card) => ({ vars: odds_vars(card) }),
  calculate(s, card, ctx) {
    if (ctx.blueprint) return;
    if (ctx.scoring_hand && !ctx.other_card) {
      card.ability.extra.trash_list = [];
      for (const v of ctx.scoring_hand) {
        if (v.config.center.key === 'c_base' && roll('the_joker', card.ability.extra.odds)) card.ability.extra.trash_list.push(v);
      }
    }
    if (ctx.after) {
      const trash_list = card.ability.extra.trash_list;
      if (trash_list.length !== 0) {
        event(() => {
          big_juice(card);
          play_sound('tarot2', 1.2, 0.4);
          const destroyed_cards = [];
          for (const c of trash_list) {
            if (!c.removed) { c.start_dissolve(); destroyed_cards.push(c); }
          }
          if (destroyed_cards.length) {
            for (const j of G.jokers.cards.slice()) eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: destroyed_cards });
          }
        });
        for (const c of trash_list) c.destroyed = true;
      }
      card.ability.extra.trash_list = [];
    }
  },
});

// Tangram
J('tangram', {
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play) {
      let sevens = 0;
      for (const v of ctx.full_hand) if (v.get_id() === 7) sevens += 1;
      if (ctx.other_card.get_id() === 7) return { mult: card.ability.extra.mult * sevens, card };
    }
  },
}, ['mult']);

// Domino
const PACK_STATES_LUA = () => [STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND];
function domino_acquire(c) {
  c.area.remove_card(c);
  c.add_to_deck();
  if (c.ability.set === 'Default' || c.ability.set === 'Enhanced') {
    G.playing_card = (G.playing_card || 0) + 1;
    G.deck.emplace(c);
    c.playing_card = G.playing_card;
    playing_card_joker_effects([c]);
    G.playing_cards.push(c);
  } else {
    if (c.ability.consumeable) G.consumeables.emplace(c);
    else G.jokers.emplace(c);
    event(() => c.calculate_joker({ buying_card: true, card: c }));
  }
  G.GAME.round_scores.cards_purchased.amt += 1;
  if (!c.ability.consumeable && c.ability.set === 'Joker') G.GAME.current_round.jokers_purchased += 1;
}
J('domino', {
  calculate(s, card, ctx) {
    if ((ctx.buying_card || ctx.getting_booster_card) && ctx.pre_cardarea && !ctx.blueprint) {
      if (ctx.pre_card_pos) {
        if (ctx.pre_card_left && ctx.pre_card_left.area !== G.consumeables) {
          if (ctx.pre_card_left.area && check_for_buy_space(ctx.pre_card_left)) domino_acquire(ctx.pre_card_left);
          big_juice(card);
        }
        if (ctx.pre_card_right && ctx.pre_card_right.area !== G.consumeables) {
          if (ctx.pre_card_right.area && check_for_buy_space(ctx.pre_card_right)) domino_acquire(ctx.pre_card_right);
          big_juice(card);
        }
        if (PACK_STATES_LUA().includes(G.STATE) && ctx.pre_cardarea === G.pack_cards && ctx.pre_cardarea.cards.length === 0) G.GAME.pack_choices = 0;
      }
    }
  },
});
/** The neighbours of `card` in its area right now (Domino 1/5, 3/5). */
function neighbours(card) {
  const pre_cardarea = card.area;
  if (!pre_cardarea) return null;
  const i = pre_cardarea.cards.indexOf(card);
  if (i < 0) return null;
  return { pre_cardarea, pre_card_pos: i + 1, pre_card_left: pre_cardarea.cards[i - 1], pre_card_right: pre_cardarea.cards[i + 1] };
}
/** The first non-debuffed Domino gets the context (the patches `break` after one). */
function call_domino(ctx) {
  for (const v of G.jokers.cards) {
    if (v.config.center.key === 'j_bunc_domino' && !v.debuff) { v.calculate_joker(ctx); break; }
  }
}

// Glue Gun
const glue_active = (card) => !!(G.hand && G.hand.highlighted && G.hand.highlighted.length > 1 && G.hand.highlighted.length <= card.ability.extra.amount);
J('glue_gun', {
  loc_vars(s, iq, card) {
    iq.push(LINKED);
    const active = glue_active(card);
    return { vars: [card.ability.extra.amount], main_end: [(active ? '{C:green}' : '{C:red}') + ' ' + localize(active ? 'k_active' : 'bunc_inactive') + ' {}'] };
  },
  calculate(s, card, ctx) {
    if (ctx.selling_self && !ctx.blueprint) {
      event(() => {
        if (glue_active(card)) {
          for (const c of G.hand.highlighted) if (c.ability.group) return;
          link_cards(G.hand.highlighted.slice(), s.key);
          for (const c of G.hand.highlighted) big_juice(c);
        }
      });
    }
  },
});

// Taped
J('taped', {
  loc_vars(s, iq) { iq.push(LINKED); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.before && ctx.full_hand && !ctx.other_card && G.GAME.current_round.hands_played === 0 && G.GAME.blind.boss && !ctx.blueprint) {
      const full_hand = ctx.full_hand.slice();
      event(() => {
        const cards = full_hand.filter((c) => !c.ability.group);
        if (cards.length > 1) {
          link_cards(cards, s.key);
          big_juice(card);
          for (const c of cards) big_juice(c);
        }
      });
    }
  },
});

// Rubber Band Ball
const rbb_update = (s, card) => {
  const g = G.GAME.last_card_group;
  card.ability.extra.xmult = (g !== undefined && g !== null ? g + 1 : 1) * card.ability.extra.bonus;
};
J('rubber_band_ball', {
  loc_vars(s, iq, card) {
    iq.push(LINKED);
    if (G.GAME) rbb_update(s, card);
    return { vars: [card.ability.extra.bonus, card.ability.extra.xmult] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main && card.ability.extra.xmult !== 1) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.xmult] }), Xmult_mod: card.ability.extra.xmult, card };
    }
  },
  update: rbb_update,
  in_pool: () => G.GAME.last_card_group !== undefined && G.GAME.last_card_group !== null,
});

// Headache
J('headache', {
  loc_vars(s, iq, card) {
    iq.push({ set: 'Tag', key: 'tag_bunc_arcade' });
    const vm = P_CENTERS.p_bunc_virtual_mega;
    if (vm) iq.push({ key: 'p_bunc_virtual_mega', set: 'Other', vars: [vm.config.choose, vm.config.extra] });
    return { vars: [card.ability.extra.amount, card.ability.extra.destroyed] };
  },
  calculate(s, card, ctx) {
    if (ctx.remove_playing_cards) {
      card.ability.extra.destroyed = card.ability.extra.destroyed + ctx.removed.length;
      while (card.ability.extra.destroyed >= card.ability.extra.amount) {
        add_tag(new Tag('tag_bunc_arcade'));
        forced_message('+1 ' + localize({ type: 'name_text', key: 'tag_bunc_arcade', set: 'Tag' }), card, 'BUNCO_VIRTUAL');
        card.ability.extra.destroyed = card.ability.extra.destroyed - card.ability.extra.amount;
      }
    }
  },
});

// Games Collector
J('games_collector', {
  loc_vars(s, iq, card) { iq.push(LINKED); return { vars: [card.ability.extra.bonus, card.ability.extra.chips] }; },
  calculate(s, card, ctx) {
    if (ctx.groups_drawn && !ctx.blueprint) {
      for (const _ of ctx.groups_drawn) card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.bonus; // eslint-disable-line no-unused-vars
      forced_message(localize('k_upgrade_ex'), card, 'CHIPS');
    }
    if (ctx.joker_main && card.ability.extra.chips !== 0) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), chip_mod: card.ability.extra.chips, card };
    }
  },
  in_pool: () => G.GAME.last_card_group !== undefined && G.GAME.last_card_group !== null,
});

// Jumper
J('jumper', {
  calculate(s, card, ctx) {
    if (ctx.before && ctx.poker_hands && nx(ctx.poker_hands['Flush']) && !ctx.blueprint) {
      card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.bonus;
      return { message: localize('k_upgrade_ex'), colour: 'CHIPS', card };
    }
    if (ctx.joker_main && card.ability.extra.chips !== 0) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), chip_mod: card.ability.extra.chips, card };
    }
  },
}, ['bonus', 'chips']);

// Stylophone
const INSTRUMENT = { Spades: 'bunc_spade', Clubs: 'bunc_club', Hearts: 'bunc_heart', Diamonds: 'bunc_diamond', [FLEURONS]: 'bunc_fleuron', [HALBERDS]: 'bunc_halberd' };
function play_stylophone(other_card) {
  if (other_card.config.center !== P_CENTERS.m_stone) {
    const instrument = INSTRUMENT[other_card.base.suit] || 'bunc_stone';
    event(() => play_sound(instrument, 2 ** (other_card.get_id() / 12), 2.0));
  } else event(() => play_sound('bunc_stone', 1.0, 2.0));
}
J('stylophone', {
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play) {
      play_stylophone(ctx.other_card);
      if (ctx.other_card.config.center !== P_CENTERS.m_stone) return { mult: ctx.other_card.get_id() * card.ability.extra.x, card };
    }
    // (context.click — Card:click on a hand card — only juices and plays the note: cosmetic, skipped)
  },
}, ['x']);

// Kite Experiment
const copper_in_deck = () => has_center('m_bunc_copper');
const copper_info = (iq) => { if (P_CENTERS.m_bunc_copper) iq.push(P_CENTERS.m_bunc_copper); };
J('kite_experiment', {
  config: { extra: { odds: 2, cards_rescored: [] } },
  loc_vars(s, iq, card) { copper_info(iq); return { vars: odds_vars(card) }; },
  in_pool: copper_in_deck,
  calculate(s, card, ctx) {
    if (ctx.rescore_cards) {
      const first = ctx.rescore_cards[0];
      const condition = !card.ability.extra.cards_rescored.includes(first);
      if (condition && roll('kite_experiment', card.ability.extra.odds)) {
        first.config.copper_rescored_times = first.config.copper_rescored_times - 1;
        card.ability.extra.cards_rescored.push(first);
        return { message: '+1', card };
      }
    }
    if (ctx.after) card.ability.extra.cards_rescored = [];
  },
});

// Robot
J('robot', {
  loc_vars(s, iq, card) { copper_info(iq); return { vars: [card.ability.extra.bonus, card.ability.extra.mult] }; },
  in_pool: copper_in_deck,
  calculate(s, card, ctx) {
    if (ctx.rescore_cards && !ctx.blueprint) {
      card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.bonus * ctx.rescore_cards.length;
      return { message: localize('k_upgrade_ex'), card };
    }
    if (ctx.joker_main && card.ability.extra.mult !== 0) {
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), mult_mod: card.ability.extra.mult, card };
    }
  },
});

// Hardtack / Pica (their discard rules are flow.js's)
const cracker_info = (iq) => { if (P_CENTERS.m_bunc_cracker) iq.push(P_CENTERS.m_bunc_cracker); return { vars: [] }; };
J('hardtack', { loc_vars: (s, iq) => cracker_info(iq), in_pool: () => has_center('m_bunc_cracker') });
J('pica', { loc_vars: (s, iq) => cracker_info(iq), in_pool: () => has_center('m_bunc_cracker') });

// ------------------------------------------------------------------ Exotic jokers
// (vanilla card.lua's generic joker_main lines: t_mult / t_chips / x_mult with a hand type)
J('zealous', {
  ...exotic,
  loc_vars: (s, iq, card) => ({ vars: [card.ability.t_mult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main && card.ability.t_mult > 0 && ctx.poker_hands && nx(ctx.poker_hands[card.ability.type])) {
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.t_mult] }), mult_mod: card.ability.t_mult };
    }
  },
});
J('lurid', {
  ...exotic,
  loc_vars: (s, iq, card) => ({ vars: [card.ability.t_chips] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main && card.ability.t_chips > 0 && ctx.poker_hands && nx(ctx.poker_hands[card.ability.type])) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.t_chips] }), chip_mod: card.ability.t_chips };
    }
  },
});
// (vanilla 'Suit Mult')
const suit_mult = {
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && card.ability.effect === 'Suit Mult' && ctx.other_card.is_suit(card.ability.extra.suit)) {
      return { mult: card.ability.extra.s_mult, card };
    }
  },
};
J('envious', { ...exotic, ...suit_mult }, ['s_mult', 'suit']);
J('proud', { ...exotic, ...suit_mult }, ['s_mult', 'suit']);

// Wishalloy
J('wishalloy', {
  ...exotic,
  loc_vars: (s, iq, card) => ({ vars: odds_vars(card) }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.is_suit(FLEURONS)) {
      if (roll('wishalloy', card.ability.extra.odds)) {
        const value = ctx.other_card.get_chip_bonus();
        ease_dollars(value);
        forced_message('$' + value, ctx.other_card, 'MONEY', true, card);
      }
    }
  },
});

// Unobtanium
J('unobtanium', {
  ...exotic,
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.is_suit(HALBERDS)) {
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), chips: card.ability.extra.chips, mult: card.ability.extra.mult, card };
    }
  },
}, ['chips', 'mult']);

// Dynasty
J('dynasty', {
  ...exotic,
  loc_vars: (s, iq, card) => ({ vars: [card.ability.x_mult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main && card.ability.x_mult > 1 && (card.ability.type === '' || (ctx.poker_hands && nx(ctx.poker_hands[card.ability.type])))) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.x_mult] }), colour: 'RED', Xmult_mod: card.ability.x_mult };
    }
  },
});

// Magic Wand
const spectrum = (ctx) => ctx.poker_hands !== undefined && ctx.poker_hands !== null && nx(ctx.poker_hands['bunc_Spectrum']);
J('magic_wand', {
  ...exotic,
  calculate(s, card, ctx) {
    if (ctx.before && spectrum(ctx) && !ctx.blueprint) {
      card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.bonus;
    } else if (ctx.after && ctx.poker_hands !== undefined && ctx.poker_hands !== null && !spectrum(ctx) && !ctx.blueprint) {
      if (card.ability.extra.mult !== 0) {
        card.ability.extra.mult = 0;
        forced_message(localize('k_reset'), card, 'RED');
      }
    }
    if (ctx.joker_main && card.ability.extra.mult !== 0) return { mult: card.ability.extra.mult, card };
  },
}, ['bonus', 'mult']);

// Starfruit
J('starfruit', {
  ...exotic,
  loc_vars: (s, iq, card) => ({ vars: odds_vars(card) }),
  calculate(s, card, ctx) {
    if (ctx.before && spectrum(ctx) && !ctx.blueprint) {
      forced_message(localize('k_level_up_ex'), card, 'RED', true);
      level_up_hand(card, ctx.scoring_name, false, 1);
    }
    if (ctx.end_of_round && !ctx.other_card && !ctx.individual && !ctx.repetition && !ctx.blueprint) {
      if (roll('starfruit', card.ability.extra.odds)) {
        forced_message(localize('k_eaten_ex'), card, 'FILTER', true);
        card.start_dissolve();
      } else {
        forced_message(localize('k_safe_ex'), card, null, true);
        card.ability.extra.condition = false;
      }
    }
  },
});

// Fondue
J('fondue', {
  ...exotic,
  calculate(s, card, ctx) {
    if (ctx.after && G.GAME.current_round.hands_played === 0 && ctx.scoring_hand && !ctx.blueprint) {
      enable_exotics();
      const sh = ctx.scoring_hand.slice();
      for (const c of sh) event(() => { c.flip(); play_sound('card1', 1); c.juice_up(0.3, 0.3); });
      for (const c of sh) event(() => { c.change_suit(FLEURONS); });
      for (const c of sh) event(() => { c.flip(); play_sound('tarot2', 1, 0.6); big_juice(card); c.juice_up(0.3, 0.3); });
    }
  },
});

// Myopia / Astigmatism (the is_suit hook below)
J('myopia', { ...exotic });
J('astigmatism', { ...exotic });

// ROYGBIV
J('roygbiv', {
  ...exotic,
  loc_vars(s, iq, card) {
    if (P_CENTERS.e_polychrome) iq.push(P_CENTERS.e_polychrome);
    return { vars: odds_vars(card) };
  },
  calculate(s, card, ctx) {
    if (ctx.before && spectrum(ctx) && ctx.scoring_hand && !ctx.blueprint) {
      if (roll('roygbiv', card.ability.extra.odds)) {
        const cards = ctx.scoring_hand.filter((c) => !c.edition);
        if (cards.length > 0) {
          forced_message('+' + localize({ type: 'name_text', key: 'e_polychrome', set: 'Edition' }), card);
          for (const c of cards) c.set_edition({ polychrome: true });
        }
      }
    }
  },
});

// ------------------------------------------------------------------ Legendary
const rigoletto_update = (s, card) => {
  if (G.playing_cards) {
    card.ability.extra.tally = 0;
    for (const v of G.playing_cards) if (v.is_suit(FLEURONS) || v.is_suit(HALBERDS)) card.ability.extra.tally += 1;
    card.ability.extra.xmult = 1 + card.ability.extra.tally * card.ability.extra.bonus;
  }
};
J('rigoletto', {
  ...exotic,
  loc_vars(s, iq, card) {
    iq.push({ set: 'Other', key: 'bunc_exotic_cards' });
    if (G.GAME) rigoletto_update(s, card);
    return { vars: [card.ability.extra.bonus, card.ability.extra.xmult] };
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main && card.ability.extra.xmult !== 1) {
      return { Xmult_mod: card.ability.extra.xmult, card, message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.xmult] }) };
    }
  },
  update: rigoletto_update,
});

// ------------------------------------------------------------------ hooks
export const hooks = {
  /** BUNCOMOD.funcs.ease_dollars — Fiendish (jokers_a) and Bounty Hunter, one walk over G.jokers in joker order. */
  ease_dollars(mod) {
    if (!G.jokers) return undefined;
    for (const v of G.jokers.cards.slice()) {
      if (v.config.center.key === 'j_bunc_fiendish' && !v.debuff && mod > 0) {
        if (pseudorandom('fiendish' + SEED()) < G.GAME.probabilities.normal / v.ability.extra.odds) {
          mod = 1;
          event(() => say(v, '$1', 'RED'));
        } else {
          mod = mod * 2;
          const message = mod;
          event(() => say(v, '$' + message, 'ORANGE'));
        }
      }
      if (v.config.center.key === 'j_bunc_bounty_hunter' && !v.debuff && mod > 0) {
        v.calculate_joker({ get_money: true });
        mod = mod - 1;
        event(() => say(v, localize('bunc_robbed'), 'ORANGE'));
      }
    }
    return mod;
  },
  /** Card:is_suit (Myopia & Astigmatism). */
  is_suit(card, suit) {
    if (!G.jokers) return undefined;
    const s = card.base.suit;
    for (const v of G.jokers.cards) {
      if (v.config.center.key === 'j_bunc_myopia' && !v.debuff && (s === 'Spades' || s === 'Clubs') && (suit === s || suit === HALBERDS)) return true;
    }
    for (const v of G.jokers.cards) {
      if (v.config.center.key === 'j_bunc_astigmatism' && !v.debuff && (s === 'Hearts' || s === 'Diamonds') && (suit === s || suit === FLEURONS)) return true;
    }
    return undefined;
  },
  /** Domino 1/5 + 2/5 (G.FUNCS.buy_from_shop). */
  bought(c1) {
    if (!find('j_bunc_domino').length) return;
    const n = neighbours(c1);
    if (!n) return;
    event(() => call_domino({ buying_card: true, card: c1, ...n }));
  },
  /** Domino 3/5 - 5/5 (G.FUNCS.use_card). */
  use_card(card) {
    if (!find('j_bunc_domino').length) return;
    if (card.ability.set === 'Booster' || card.ability.set === 'Voucher') return;
    if (!(card.ability.consumeable || card.ability.set === 'Enhanced' || card.ability.set === 'Default' || card.ability.set === 'Joker')) return;
    const n = neighbours(card);
    if (!n) return;
    event(() => {
      if (card.area === n.pre_cardarea && !card.removed) return; // (check_use refused it: never taken / used)
      call_domino({ getting_booster_card: true, card, ...n });
    });
  },
};
