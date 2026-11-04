/**
 * Bunco — jokers, part B (25): Bunco.lua ~2273-3363, in the Lua's order — Slothful, Neon, Gameplan, Conquest,
 * Hierarchy of Needs, Dwarven, Aristocrat, Metallurgist, Juggalo, Head in the Clouds, Headshot, Trigger Finger,
 * Hopscotch, Pawn, Puzzle Board, Vandalism, Protester, Doodle, Disproportionality, Running Joke, On Broadway,
 * Rasta, Critic, Cellphone, Wino. Numbers come from data.js (the mod's `vars`); each calculate is a line-for-line
 * port of the create_joker block, the lovely patches are the hooks below.
 *
 * Port notes (Micatro equivalents, not behaviour changes):
 *  - Neon: the "Card:set_ability (Neon Joker)" patch (SMODS.calculate_context{enhance_card}) is the
 *    `set_ability` hook (non-initial, centre changed, new centre Enhanced).
 *  - Gameplan / Conquest: BUNCOMOD.content.set_debuff's position / target checks are the `set_debuff` hook; the
 *    per-frame update (G.GAME.blind:debuff_card on every joker) runs from the centre's update (before each
 *    calculate) and from the `update` hook (after every action). Conquest keeps its target as the joker's
 *    sort_id (the Lua keeps the card table) so the run state stays serialisable.
 *  - Head in the Clouds: the level_up_hand patch is the `level_up_hand` hook; the Lua's own re-entry trick (level
 *    up "Head in the Clouds", renamed to High Card after the joker loop) is a module flag around the High Card
 *    level-up — the joker isn't asked again for its own upgrade, exactly as in the Lua.
 *  - Trigger Finger: the Card:highlight patch arrives through the bus ('card_highlighted', systems.js); the Lua's
 *    `cards[i]:highlight()` re-highlight loop calls highlight(nil) (a no-op un-highlight on already-unhighlighted
 *    cards) and is left out.
 *  - Vandalism (5.4.8b): the Steamodded stay_flipped context (engine/smods.js seam, after the blind's own rule);
 *    Blueprint / Brainstorm copies roll too (`copiers_of`); the play_cards patch = `play_start`. card_list holds
 *    sort_ids (the Lua: card tables).
 *  - Cellphone: draw_from_play_to_discard patch = `draw_from_play_to_discard` hook (the returned cards go first,
 *    the engine sends the rest to the discard in the following event); cards_to_hand holds sort_ids. The
 *    press_play patch duplicates Steamodded's own press_play context, which Micatro already sends to every joker,
 *    so "Accepted!" comes from that one context (the Lua showed it twice).
 *  - Running Joke: the update_shop patch (enter_shop) = `fill_shop_jokers` (returns undefined: the normal fill
 *    still runs and, as in the Lua, the Negative Joker takes one of the joker slots).
 *  - Pawn: the flip / juice events are visual and left out; the rank-up event is kept.
 *  - Critic: the Lua reads the globals hand_chips / mult; Micatro's joker_main context carries them in mod runs.
 *  - Disproportionality: its DynaText "error" box is the main_start text (static).
 *  - Juggalo: SMODS poll_edition(.., _options) (weighted over the given list) is vouchers.js's `poll_options`.
 *
 * Intended-design fixes (each has a test that fails with the fix reverted):
 *  1. Protester read `G.hand.cards[i].ability.effect` (the i-th HAND card) while walking G.hand.highlighted, so a
 *     discarded Stone Card counted (and a normal card next to a Stone one didn't); it checks the discarded card.
 *  2. Juggalo: with only editioned consumables the Lua's math.random(#{}) raises "interval is empty"; no
 *     consumable is picked then.
 *  3. Pawn's description localized the rank ID ('11' -> ERROR for Jack ... Ace); it names the rank.
 */
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_CENTERS, P_CARDS, Card, copy_card, poll_edition, pseudorandom, level_up_hand, ease_discard,
  math_random, play_sound, localize, draw_card,
} from '../../js/engine/core.js';
import { STATES, calculate_context, play_cards_from_highlighted } from '../../js/engine/run.js';
import { poll_options } from './vouchers.js';
import {
  joker, say, forced_message, event, big_juice, SEED, HUGE, SUIT_BUFFER, change_base, onB, on, has_no_rank, exotic_in_pool,
} from './util.js';

export const centers = [];
const J = (slug, def) => { const c = joker(slug, def); centers.push(c); return c; };
const next = (t) => !!(t && t.length);
const G_MULT = 'RED', G_GREEN = 'GREEN', G_CHIPS = 'CHIPS';
const a_mult = (v) => localize({ type: 'variable', key: 'a_mult', vars: [v] });
const a_chips = (v) => localize({ type: 'variable', key: 'a_chips', vars: [v] });
const a_xmult = (v) => localize({ type: 'variable', key: 'a_xmult', vars: [v] });
const dict = (k) => localize(k);
const prob = () => (G.GAME && G.GAME.probabilities && G.GAME.probabilities.normal) || 1;
const SELECTING = () => G.STATE === STATES.SELECTING_HAND || G.STATE === STATES.DRAW_TO_HAND;

const FOUR_EDITIONS = ['e_holo', 'e_foil', 'e_polychrome', 'e_bunc_glitter'];

/** G.GAME.blind:debuff_card on every joker (Gameplan / Conquest's update and remove). */
function refresh_joker_debuffs() {
  if (!G.jokers || !G.GAME || !G.GAME.blind || !G.GAME.blind.debuff_card) return;
  for (const j of G.jokers.cards.slice()) G.GAME.blind.debuff_card(j);
}
const POSITIONAL = new Set(['j_bunc_gameplan', 'j_bunc_conquest']);

// Slothful
J('slothful', {
  /** 5.4.8b: the exotic-suits art (cell 74) once exotics are on (75 / 76 are Paperback's suits: n/a). */
  get_pos: (s) => (exotic_in_pool() ? { x: 3, y: 7 } : s.pos),
  in_pool: () => !!(G.playing_cards && G.playing_cards.some((v) => v.config.center === P_CENTERS.m_wild)),
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play) {
      if (ctx.other_card.config.center === P_CENTERS.m_wild) return { mult: card.ability.extra.mult, card };
    }
  },
});

// Neon
J('neon', {
  loc_vars(s, iq) { iq.push(P_CENTERS.e_bunc_fluorescent); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.enhance_card && !ctx.blueprint) {
      if (!ctx.enhanced_card.edition) {
        ctx.enhanced_card.set_edition({ bunc_fluorescent: true });
        event(() => big_juice(card));
      }
    }
  },
});

// Gameplan
J('gameplan', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  update() { refresh_joker_debuffs(); },
  remove_from_deck() { refresh_joker_debuffs(); },
  // (5.4.8b: +20 Mult per adjacent joker AT THAT JOKER'S TURN — the other_joker context — not +40 at its own)
  calculate(s, card, ctx) {
    if (ctx.other_joker) {
      const my_pos = G.jokers.cards.indexOf(card);
      if (my_pos < 0) return undefined;
      const o = ctx.other_joker;
      if (o === G.jokers.cards[my_pos - 1] || o === G.jokers.cards[my_pos + 1]) {
        const mult = card.ability.extra.mult;
        return { message: a_mult(mult), mult_mod: mult, card };
      }
    }
  },
});

// Conquest
const marked = (j) => j.ability.bunc_conquest_chosen !== undefined && j.ability.bunc_conquest_chosen !== null;
J('conquest', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.joker] }),
  update() { refresh_joker_debuffs(); },
  // (5.4.8b: ONE random pick among the other jokers — math.random(#jokers - 1), skipping its own slot — marked on the
  // chosen joker (ability.bunc_conquest_chosen = this Conquest), in an event after the blind is set; the mark goes when
  // the next blind is set or Conquest leaves. 5.1 re-rolled until it missed itself and kept the target on Conquest.)
  remove_from_deck(s, card, from_debuff) {
    if (!from_debuff && G.jokers) for (const j of G.jokers.cards) if (j.ability.bunc_conquest_chosen === card.sort_id) j.ability.bunc_conquest_chosen = undefined;
    refresh_joker_debuffs();
  },
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !ctx.blueprint) {
      for (const j of G.jokers.cards) if (j.ability.bunc_conquest_chosen === card.sort_id) j.ability.bunc_conquest_chosen = undefined;
      card.ability.extra.joker = 0;
      if (G.jokers.cards.length > 1) {
        event(() => {
          const my_pos = G.jokers.cards.indexOf(card);
          if (my_pos < 0 || G.jokers.cards.length < 2) return;
          let i = math_random(G.jokers.cards.length - 1) - 1;
          if (i >= my_pos) i += 1;
          const target = G.jokers.cards[i];
          target.ability.bunc_conquest_chosen = card.sort_id;
          card.ability.extra.joker = target.sort_id;
          if (G.GAME.blind) G.GAME.blind.debuff_card(target);
          big_juice(target);
          if (!card.debuff) say(card, dict('bunc_debuffed'), G_MULT);
        });
      }
    }
    if (ctx.joker_main) {
      return { message: a_chips(card.ability.extra.chips), chip_mod: card.ability.extra.chips, card: ctx.blueprint_card || card };
    }
  },
});

// Hierarchy of Needs
const REQUIRED_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
J('hierarchy_of_needs', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.bonus, card.ability.extra.mult] }),
  update(s, card) {
    if (G.playing_cards) {
      let set_count = 0;
      for (const suit of SUIT_BUFFER) {
        const rank_count = {};
        for (const r of REQUIRED_RANKS) rank_count[r] = 0;
        for (const deck_card of G.playing_cards) {
          let rank;
          if (deck_card.config.center !== P_CENTERS.m_stone && deck_card.base.suit === suit) rank = deck_card.base.value;
          if (rank !== undefined && rank_count[rank] !== undefined) {
            rank_count[rank] += 1;
            if (REQUIRED_RANKS.every((r) => rank_count[r] !== 0)) {
              set_count += 1;
              for (const r of REQUIRED_RANKS) rank_count[r] -= 1;
            }
          }
        }
      }
      card.ability.extra.mult = card.ability.extra.bonus * set_count;
    } else {
      card.ability.extra.mult = card.ability.extra.bonus * 4;
    }
  },
  calculate(s, card, ctx) {
    if (ctx.joker_main && card.ability.extra.mult !== 0) {
      return { message: a_mult(card.ability.extra.mult), mult_mod: card.ability.extra.mult, card };
    }
  },
});

// Dwarven
J('dwarven', {
  in_pool: () => !!(G.playing_cards && G.playing_cards.some((v) => v.config.center === P_CENTERS.m_stone)),
  loc_vars(s, iq) { iq.push(P_CENTERS.m_stone, P_CENTERS.m_steel, P_CENTERS.m_gold); return { vars: [] }; },
  add_to_deck() {
    const steel = P_CENTERS.m_steel.config.h_x_mult, gold = P_CENTERS.m_gold.config.h_dollars;
    for (const deck_card of G.playing_cards) {
      if (deck_card.config.center === P_CENTERS.m_stone) {
        deck_card.ability.h_x_mult = (deck_card.ability.h_x_mult || 0) + steel;
        deck_card.ability.h_dollars = (deck_card.ability.h_dollars || 0) + gold;
      }
    }
    const sc = P_CENTERS.m_stone.config;
    sc.h_x_mult = (sc.h_x_mult || 0) + steel;
    sc.h_dollars = (sc.h_dollars || 0) + gold;
  },
  remove_from_deck() {
    const steel = P_CENTERS.m_steel.config.h_x_mult, gold = P_CENTERS.m_gold.config.h_dollars;
    for (const deck_card of G.playing_cards) {
      if (deck_card.config.center === P_CENTERS.m_stone) {
        deck_card.ability.h_x_mult -= steel;
        deck_card.ability.h_dollars -= gold;
      }
    }
    const sc = P_CENTERS.m_stone.config;
    sc.h_x_mult -= steel;
    sc.h_dollars -= gold;
  },
});

// Aristocrat
J('aristocrat', {
  calculate(s, card, ctx) {
    if (ctx.open_booster && ctx.card.ability.name && !G.GAME.rerolled_pack) {
      event(() => {
        if (G.pack_cards && G.pack_cards.cards && G.pack_cards.cards[0]) {
          G.GAME.pack_choices = G.GAME.pack_choices + 1;
          if (G.GAME.pack_choices > G.pack_cards.cards.length) G.GAME.pack_choices = G.pack_cards.cards.length;
        }
      });
    }
  },
});

// Metallurgist
J('metallurgist', {
  in_pool: () => !!(G.playing_cards && G.playing_cards.some((v) => v.config.center === P_CENTERS.m_gold)),
  loc_vars(s, iq, card) { iq.push(P_CENTERS.m_gold); return { vars: [card.ability.extra.mult] }; },
  add_to_deck(s, card) {
    for (const deck_card of G.playing_cards) {
      if (deck_card.config.center === P_CENTERS.m_gold) {
        deck_card.ability.h_mult = deck_card.ability.h_mult !== undefined ? deck_card.ability.h_mult + card.ability.extra.mult : 0;
      }
    }
    const gc = P_CENTERS.m_gold.config;
    gc.h_mult = (gc.h_mult || 0) + card.ability.extra.mult;
  },
  remove_from_deck(s, card) {
    for (const deck_card of G.playing_cards) {
      if (deck_card.config.center === P_CENTERS.m_gold) deck_card.ability.h_mult -= card.ability.extra.mult;
    }
    const gc = P_CENTERS.m_gold.config;
    gc.h_mult = gc.h_mult !== undefined ? gc.h_mult - card.ability.extra.mult : 0;
  },
});

// Juggalo
J('juggalo', {
  loc_vars(s, iq) { iq.push(P_CENTERS.e_foil, P_CENTERS.e_holo, P_CENTERS.e_polychrome, P_CENTERS.e_bunc_glitter); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.setting_blind) {
      if (G.consumeables.cards[0]) {
        const consumables_table = G.consumeables.cards.filter((c) => !c.edition);
        // (fix 2: math.random(0) is an error in Lua — nothing to pick from then)
        const consumable = consumables_table.length ? consumables_table[math_random(consumables_table.length) - 1] : undefined;
        const edition = poll_options('standard_edition' + G.GAME.round_resets.ante, null, true, true, FOUR_EDITIONS);
        if (consumable) {
          event(() => consumable.set_edition(edition, true));
          forced_message(localize('k_upgrade_ex'), card, G_MULT, true, consumable);
        }
      }
    }
  },
});

// Head in the Clouds
let IN_CLOUDS = false;
J('head_in_the_clouds', {
  in_pool: () => !!(G.GAME && G.GAME.hands && G.GAME.hands['High Card'].level > 1),
  loc_vars: (s, iq, card) => ({ vars: [prob(), card.ability.extra.odds] }),
  calculate(s, card, ctx) {
    if (ctx.level_up_hand && ctx.level_up_hand !== s.name) {
      if (pseudorandom('head_in_the_clouds' + SEED()) < G.GAME.probabilities.normal / card.ability.extra.odds) {
        event(() => {
          say(ctx.blueprint_card || card, localize('k_upgrade_ex'));
          IN_CLOUDS = true;
          try { level_up_hand(ctx.blueprint_card || card, 'High Card', null, 1); } finally { IN_CLOUDS = false; }
        });
      }
    }
  },
});

// Headshot
J('headshot', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main && ctx.scoring_hand) {
      const face_amount = ctx.scoring_hand.filter((c) => c.is_face()).length;
      if (face_amount === 1) return { Xmult_mod: card.ability.extra.xmult, card, message: a_xmult(card.ability.extra.xmult) };
    }
  },
});

// Trigger Finger
J('trigger_finger', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult, prob(), card.ability.extra.odds] }),
  calculate(s, card, ctx) {
    if (ctx.highlight_card && SELECTING()) {
      event(() => {
        if (G.hand.highlighted) {
          play_cards_from_highlighted();
          play_sound('bunc_gunshot');
          forced_message(dict('bunc_pew'), card, G_MULT);
        }
      });
    }
    if (ctx.joker_main) return { Xmult_mod: card.ability.extra.xmult, card, message: a_xmult(card.ability.extra.xmult) };
  },
});
// lovely "Card:highlight (Trigger Finger)": a hand card just became highlighted.
onB('card_highlighted', (hc) => {
  if (!on() || !G.jokers || hc.area !== G.hand) return;
  for (const v of G.jokers.cards) {
    if (v.config.center.key === 'j_bunc_trigger_finger' && !v.debuff) {
      if (pseudorandom('trigger_finger' + SEED()) < G.GAME.probabilities.normal / v.ability.extra.odds) {
        v.calculate_joker({ highlight_card: true });
        break;
      }
    }
  }
});

// Hopscotch
J('hopscotch', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.discard] }),
  calculate(s, card, ctx) {
    if (ctx.before && ctx.poker_hands && next(ctx.poker_hands.Straight)) {
      ease_discard(card.ability.extra.discard);
      forced_message('+' + card.ability.extra.discard + ' ' + localize('b_discard'), card, G_MULT, true);
    }
  },
});

// Pawn
const RANK_KEY = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const RANK_NEXT = { 2: '3', 3: '4', 4: '5', 5: '6', 6: '7', 7: '8', 8: '9', 9: '10', 10: 'Jack', Jack: 'Queen', Queen: 'King', King: 'Ace', Ace: '2' };
const lowest_rank = () => {
  let rank = Infinity;
  for (const deck_card of G.playing_cards) {
    if (deck_card.get_id() < rank && !has_no_rank(deck_card)) rank = deck_card.get_id(); // (5.4.8b: any rankless card)
  }
  return rank;
};
J('pawn', {
  loc_vars() {
    if (G.playing_cards && G.playing_cards.length > 0) {
      const rank = lowest_rank();
      // (fix 3: the Lua localized the ID — '11'..'14' have no rank text)
      if (rank !== Infinity) return { vars: [localize(RANK_KEY[rank] || String(rank), 'ranks')] };
    }
    return { vars: [localize('2', 'ranks')] };
  },
  calculate(s, card, ctx) {
    if (ctx.after && ctx.scoring_hand && !ctx.blueprint) {
      for (const other_card of ctx.scoring_hand) {
        const rank = lowest_rank();
        if (other_card.get_id() === rank) {
          event(() => {
            const nx = RANK_NEXT[other_card.base.value];
            if (nx) change_base(other_card, null, nx);
          });
          event(() => { play_sound('tarot2', 1, 0.6); big_juice(card); });
        }
      }
    }
  },
});

// Puzzle Board
J('puzzle_board', {
  loc_vars(s, iq, card) {
    iq.push(P_CENTERS.e_foil, P_CENTERS.e_holo, P_CENTERS.e_polychrome, P_CENTERS.e_bunc_glitter);
    return { vars: [prob(), card.ability.extra.odds] };
  },
  calculate(s, card, ctx) {
    // (5.4.8b: only when the Tarot is used with cards selected — no roll, no "Nope!" otherwise)
    if (ctx.using_consumeable && ctx.consumeable.ability.set === 'Tarot' && G.hand && G.hand.highlighted.length > 0) {
      if (pseudorandom('puzzle_board' + SEED()) < G.GAME.probabilities.normal / card.ability.extra.odds) {
        // (the 'wheel_of_fortune' key: the base editions, + Glitter with gameplay_reworks — Bunco's poll_edition patch)
        const edition = poll_edition('wheel_of_fortune', null, true, true);
        const cards = G.hand.highlighted.filter((c) => !c.edition);
        event(() => {
          if (cards.length > 0) {
            big_juice(card);
            cards[math_random(cards.length) - 1].set_edition(edition, true);
          }
        });
      } else {
        event(() => forced_message(localize('k_nope_ex'), card, G_MULT));
      }
    }
  },
});

// Vandalism
J('vandalism', {
  config: { extra: { odds: 4, xmult: 2, card_list: [] } },
  loc_vars: (s, iq, card) => ({ vars: [prob(), card.ability.extra.odds, card.ability.extra.xmult] }),
  // (5.4.8b: the draw is Steamodded's stay_flipped context — after the blind's own rule (The Wheel rolls first) — and
  // Blueprint / Brainstorm copy it: each copy rolls its own 1 in 4. The seam asks the Vandalisms; each one rolls for
  // itself and for the copiers that resolve to it — the same number of rolls on the same seed as one per joker.)
  calculate(s, card, ctx) {
    if (ctx.stay_flipped && !ctx.blueprint && ctx.to_area === G.hand && SELECTING()) {
      let flipped = false;
      for (const who of [card, ...copiers_of(card)]) {
        if (pseudorandom('vandalism' + SEED()) < G.GAME.probabilities.normal / card.ability.extra.odds) { flipped = true; big_juice(who); }
      }
      return flipped ? { stay_flipped: true } : undefined;
    }
    if (ctx.play_cards) {
      card.ability.extra.card_list = [];
      for (const h of G.hand.highlighted) if (h.facing === 'back') card.ability.extra.card_list.push(h.sort_id);
    }
    if (ctx.individual && ctx.cardarea === G.play && ctx.other_card) {
      if ((card.ability.extra.card_list || []).includes(ctx.other_card.sort_id)) return { x_mult: card.ability.extra.xmult, card };
    }
  },
});

/** The non-debuffed Blueprints / Brainstorms whose copy chain ends on `target` (vanilla Blueprint: the joker to the right;
 * Brainstorm: the leftmost; a debuffed link breaks the chain). */
function copiers_of(target) {
  const out = [];
  const js = G.jokers.cards;
  for (const j of js) {
    if (j === target || j.debuff) continue;
    let t = j, depth = 0;
    while (t && (t.ability.name === 'Blueprint' || t.ability.name === 'Brainstorm') && depth++ <= js.length) {
      const nx = t.ability.name === 'Blueprint' ? js[js.indexOf(t) + 1] : js[0];
      t = nx && nx !== t && !nx.debuff ? nx : null;
    }
    if (t === target) out.push(j);
  }
  return out;
}

// Protester
J('protester', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chip_mult, card.ability.extra.chips] }),
  calculate(s, card, ctx) {
    if (ctx.pre_discard) {
      let raised_card;
      for (let i = 0; i < G.hand.highlighted.length; i++) {
        const h = G.hand.highlighted[i];
        // (fix 1: the Lua tested G.hand.cards[i] — some other hand card — for Stone; 5.4.8b fixed it its own way, adopted:
        // the discarded card itself, any rankless card, and never a debuffed one — as vanilla discard jokers do)
        if (!card.debuff && card.ability.extra.rank < h.base.nominal && !has_no_rank(h) && !h.debuff) {
          card.ability.extra.chips = h.base.nominal * card.ability.extra.chip_mult;
          card.ability.extra.rank = h.base.nominal;
          raised_card = h;
        }
      }
      if (raised_card) event(() => { play_sound('generic1', null, 1); big_juice(card); big_juice(raised_card); });
    }
    if (ctx.joker_main && card.ability.extra.chips !== 0) {
      return { message: a_chips(card.ability.extra.chips), chip_mod: card.ability.extra.chips };
    }
    if (ctx.end_of_round) {
      if (card.ability.extra.rank !== -HUGE) {
        card.ability.extra.rank = -HUGE;
        card.ability.extra.chips = 0;
        forced_message(localize('k_reset'), card, G_MULT, true);
      }
    }
  },
});

// Doodle
J('doodle', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.active, card.ability.extra.unlock] }),
  calculate(s, card, ctx) {
    if (ctx.end_of_round && !card.ability.extra.active) card.ability.extra.active = true;
    if (ctx.using_consumeable && card.ability.extra.active && (ctx.consumeable.ability.set === 'Tarot' || ctx.consumeable.ability.set === 'Planet')) {
      event(() => {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          forced_message(localize('k_duplicated_ex'), ctx.blueprint_card || card, null, true);
          card.ability.extra.active = false;
          const copy = copy_card(ctx.consumeable);
          copy.add_to_deck();
          G.consumeables.emplace(copy);
        }
      });
    }
  },
});

// Disproportionality
J('disproportionality', {
  loc_vars: (s, iq, card) => ({
    vars: [],
    main_start: [
      "{C:inactive}[1] Lua local 'handler'{} {C:inactive}ERROR{} Stack Traceback",
      "at file 'chip_mod.lua:{C:chips}" + String(card.ability.extra.min).padStart(3, '0') + '-' + String(card.ability.extra.max).padStart(3, '0') + "{}'",
    ],
  }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      const temp_chips = pseudorandom('disproportionality', card.ability.extra.min, card.ability.extra.max);
      return { message: a_chips(temp_chips), chip_mod: temp_chips };
    }
  },
});

// Running Joke
J('running_joke', {
  loc_vars(s, iq) { iq.push(P_CENTERS.e_negative, P_CENTERS.j_joker); return { vars: [] }; },
  calculate(s, card, ctx) {
    if (ctx.enter_shop) {
      big_juice(card);
      const shop_card = new Card(P_CARDS.empty, P_CENTERS.j_joker, { bypass_discovery_center: true, bypass_discovery_ui: true, discover: true });
      shop_card.set_edition({ negative: true });
      G.shop_jokers.emplace(shop_card);
    }
  },
});

// On Broadway
J('on_broadway', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main && ctx.scoring_hand && ctx.poker_hands && next(ctx.poker_hands.Straight)) {
      if (ctx.scoring_hand.some((c) => c.is_face())) {
        forced_message('+' + card.ability.extra.chips, card, G_CHIPS, true);
        return { chip_mod: card.ability.extra.chips, message: a_mult(card.ability.extra.mult), mult_mod: card.ability.extra.mult, card };
      }
    }
  },
});

// Rasta
J('rasta', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main && ctx.scoring_hand) {
      const enhancement = ctx.scoring_hand.some((c) => c.config.center !== P_CENTERS.c_base);
      if (!enhancement) return { message: a_mult(card.ability.extra.mult), mult_mod: card.ability.extra.mult, card };
    }
    if (ctx.joker_main && !ctx.scoring_hand) return { message: a_mult(card.ability.extra.mult), mult_mod: card.ability.extra.mult, card };
  },
});

// Critic
J('critic', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult, card.ability.extra.fraction] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main) {
      const temp_chips = G.GAME.blind.chips;
      const hand_chips = ctx.hand_chips, mult = ctx.mult;
      if (BN.lt(BN.floor(BN.mul(hand_chips, mult)), BN.div(temp_chips, card.ability.extra.fraction))) {
        return { Xmult_mod: card.ability.extra.xmult, card, message: a_xmult(card.ability.extra.xmult) };
      }
    }
  },
});

// Cellphone
J('cellphone', {
  config: { extra: { active: true, cards_to_hand: [] } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.active, card.ability.extra.cards_to_hand] }),
  calculate(s, card, ctx) {
    if (ctx.first_hand_drawn) card.ability.extra.active = true;
    if (ctx.joker_main && ctx.scoring_hand) card.ability.extra.cards_to_hand = ctx.scoring_hand.map((c) => c.sort_id);
    if (ctx.press_play && card.ability.extra.active && G.GAME.current_round.hands_played === 0) {
      forced_message(dict('bunc_accepted'), card, G_GREEN);
    }
    if (ctx.after && G.GAME.current_round.hands_played === 0) event(() => { card.ability.extra.active = false; });
    if (ctx.pre_discard && card.ability.extra.active) {
      card.ability.extra.active = false;
      forced_message(dict('bunc_declined'), card, G_MULT, true);
    }
  },
});

// Wino
J('wino', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play) {
      if (ctx.other_card.is_suit('Hearts') || ctx.other_card.is_suit('Diamonds')) return { chips: card.ability.extra.chips, card };
    }
  },
});

// ------------------------------------------------------------------ hooks (the lovely patches)
const VANILLA_CFG = { m_stone: null, m_gold: null };
const snap = (k) => JSON.parse(JSON.stringify(P_CENTERS[k].config));
if (P_CENTERS.m_stone) { VANILLA_CFG.m_stone = snap('m_stone'); VANILLA_CFG.m_gold = snap('m_gold'); }

/** Dwarven / Metallurgist change the shared Stone / Gold centre configs: back to vanilla at every new run. */
export function reset_run() {
  for (const k of ['m_stone', 'm_gold']) {
    if (!VANILLA_CFG[k]) VANILLA_CFG[k] = snap(k);
    const cfg = P_CENTERS[k].config;
    for (const f of ['h_x_mult', 'h_dollars', 'h_mult']) {
      if (VANILLA_CFG[k][f] === undefined) delete cfg[f]; else cfg[f] = VANILLA_CFG[k][f];
    }
  }
  IN_CLOUDS = false;
}

export const hooks = {
  // BUNCOMOD.content.set_debuff: Gameplan (next to a non-debuffed Gameplan) / Conquest (its target).
  set_debuff(card) {
    if (!G.jokers) return undefined;
    const my_pos = G.jokers.cards.indexOf(card);
    if (my_pos >= 0) {
      const l = G.jokers.cards[my_pos - 1], r = G.jokers.cards[my_pos + 1];
      if (l && l.config.center.key === 'j_bunc_gameplan' && !l.debuff) return true;
      if (r && r.config.center.key === 'j_bunc_gameplan' && !r.debuff) return true;
    }
    if (G.jokers.cards.includes(card) && marked(card)) return true; // (Conquest's mark, 5.4.8b)
    return undefined;
  },
  // Gameplan / Conquest's per-frame update (G.GAME.blind:debuff_card on every joker while one is owned).
  update() {
    if (G.jokers && G.jokers.cards.some((c) => POSITIONAL.has(c.config.center.key))) refresh_joker_debuffs();
    return undefined;
  },
  // lovely "Card:set_ability (Neon Joker)"
  set_ability(card, center, old_center, initial) {
    if (center && !initial && old_center !== center && center.set === 'Enhanced') calculate_context({ enhance_card: true, enhanced_card: card });
  },
  // lovely "level_up_hand (Head in the Clouds)" — never blocks (returns undefined)
  level_up_hand(card, hand, amount) {
    if (IN_CLOUDS || !G.jokers) return undefined;
    for (const v of G.jokers.cards.slice()) {
      if (v.config.center.key === 'j_bunc_head_in_the_clouds' && !v.debuff) {
        if (amount === undefined || amount === null || !(amount <= 0)) v.calculate_joker({ level_up_hand: hand });
      }
    }
    return undefined;
  },
  // (lovely "Blind:stay_flipped (Vandalism 2/3)" is gone in 5.4.8b: Vandalism answers the stay_flipped seam context —
  // registerMod({smods_seams: ['stay_flipped']}) in index.js)
  // lovely "G.FUNCS.play_cards_from_highlighted (Vandalism 3/3)"
  play_start() {
    if (!G.jokers) return;
    for (const v of G.jokers.cards.slice()) {
      if (v.config.center.key === 'j_bunc_vandalism' && !v.debuff) v.calculate_joker({ play_cards: true });
    }
  },
  // lovely "G.FUNCS.reroll_shop (Running Joke)" (Game:update_shop) — the normal fill still runs
  fill_shop_jokers() {
    if (!G.jokers) return undefined;
    for (const v of G.jokers.cards.slice()) {
      if (v.config.center.key === 'j_bunc_running_joke' && !v.debuff) v.calculate_joker({ enter_shop: true });
    }
    return undefined;
  },
  // lovely "G.FUNCS.draw_from_play_to_discard (Cellphone 1/2)": the first active Cellphone's scored cards go back to hand
  draw_from_play_to_discard() {
    if (!G.jokers) return;
    let ids = [];
    for (const j of G.jokers.cards) {
      if (j.config.center.key === 'j_bunc_cellphone' && j.ability.extra.active && !j.debuff) { ids = (j.ability.extra.cards_to_hand || []).slice(); break; }
    }
    if (!ids.length) return;
    for (const v of G.play.cards.slice()) {
      if (!v.shattered && !v.destroyed && ids.includes(v.sort_id)) draw_card_to_hand(v);
    }
  },
};
const draw_card_to_hand = (v) => draw_card(G.play, G.hand, 0, 'up', true, v);
