/**
 * Milatro 1.1.0 (Milan, Emilia & Emma; Steamodded 1.0), rebuilt natively for Micatro.
 * Source: `mods off/milatro-mod-main` — src/jokers.lua (30 SMODS.Joker), localization/default.lua
 * (Toast / Rapture), assets/2x/MilatroJokers.png (one 10x3 atlas, 71x95 cells). Keys keep the
 * mod's prefix (`j_mlnc_<key>`, including its `symmertry_joker` typo) so saves/descriptions match.
 *
 * The Lua replaced three base-game functions; here they are engine hooks:
 *   Rigged Wheel  -> `poll_edition` hook (the mod's poll_edition override)
 *   Colorblindness-> `is_suit` hook (its Card:is_suit override)
 *   Phalanx       -> `set_debuff` hook (its Card:set_debuff override; 'prevent_debuff')
 *   Butterfly     -> init_game_object / reset_game_globals hooks + Steamodded quantum enhancements
 *
 * INTENDED-DESIGN FIXES (each pinned in micatro/tests/mods/milatro_test.mjs):
 *  1. Colorblindness: the Lua test `(self is Club/Diamond) == (suit is Club/Diamond)` also made
 *     Spades and Hearts one suit (a Spade answered is_suit('Hearts')). Its text — and the Smeared
 *     combo, where everything merges — say only Clubs and Diamonds count as the same suit.
 *  2. The Reaper / Magic Hat set G.GAME.consumeable_buffer to the NUMBER of held consumables (and
 *     Magic Hat never reset it), which starved every vanilla consumable creator (Seance, 8 Ball,
 *     Cartomancer, Purple/Blue seals...) for the rest of the run. They use Balatro's own room check
 *     (#cards + buffer < limit, buffer reset when the card lands).
 *  3. How Hungry: `contains7` was never cleared, so after ONE hand with a scoring 7 every later
 *     scoring 9 was eaten. It is re-evaluated each hand ("If hand contains both ... 7 and 9").
 *  4. Hole in One checked every PLAYED card for the Ace; the text (and name) say a SCORING Ace.
 *  + How Hungry kept card objects in ability.extra (not serialisable here): it keeps sort ids.
 */
import { registerMod } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CENTER_POOLS, localize, pseudorandom, pseudoseed, pseudorandom_element, create_card,
  card_eval_status_text, ease_dollars, ease_discard, level_up_hand, emit, play_sound,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';

const P = 'mlnc';
const ATLAS = 'mlnc_MilatroMod';
const K = (k) => 'j_' + P + '_' + k;
/** SMODS.find_card(key): owned, non-debuffed jokers with this key. */
const find = (key) => (G.jokers ? G.jokers.cards.filter((c) => c.config.center.key === key && !c.debuff) : []);
const has = (key) => find(key).length > 0;
const SUIT_VARS = ['Spade', 'Heart', 'Club', 'Diamond'];
const SUIT_COLOURS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const upgrade = (card) => ({ message: localize('k_upgrade_ex'), card });
/** A popup on the joker itself (SMODS shows a per-card return's message on `card`). */
const say = (card, message, colour) => card_eval_status_text(card, 'extra', null, null, null, { message, colour });
const spectral_used = () => Object.values(G.GAME.consumeable_usage || {}).filter((v) => v.set === 'Spectral').length;
/** Balatro's consumable room check (8 Ball / Vagabond / seals). */
const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;

const J = [];
const joker = (key, def) => {
  J.push({
    key: K(key), set: 'Joker', atlas: ATLAS, unlocked: true, discovered: true,
    blueprint_compat: false, perishable_compat: true, eternal_compat: true, config: {}, ...def,
  });
};

// Humble Joker
joker('humble_joker', {
  name: 'Humble Joker', rarity: 3, cost: 7, pos: { x: 0, y: 0 }, blueprint_compat: true,
  config: { extra: { Xmult: 2 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xmult] }),
  calculate(s, card, context) {
    if (context.joker_main) return { Xmult: card.ability.extra.Xmult };
  },
});

// Circle Joker
joker('circle_joker', {
  name: 'Circle Joker', rarity: 3, cost: 9, pos: { x: 1, y: 0 }, blueprint_compat: true, perishable_compat: false,
  config: { extra: { mult: 0, mult_gain: 3, chips: 0, chip_gain: 14 } },
  loc_vars: (s, iq, card) => { const e = card.ability.extra; return { vars: [e.mult, e.mult_gain, e.chips, e.chip_gain] }; },
  calculate(s, card, context) {
    const e = card.ability.extra;
    if (context.joker_main) return { mult: e.mult, chips: e.chips, card };
    if (context.before && context.full_hand.length === 1 && !context.blueprint) {
      e.chips += e.chip_gain;
      e.mult += e.mult_gain;
      return upgrade(card);
    }
  },
});

// Bad Omen
joker('bad_omen', {
  name: 'Bad Omen', rarity: 3, cost: 9, pos: { x: 2, y: 0 }, blueprint_compat: true,
  config: { extra: { Xmult_gain: 0.5, Xmult: 1 } },
  loc_vars: (s, iq, card) => { const e = card.ability.extra; return { vars: [e.Xmult_gain, e.Xmult + spectral_used() * e.Xmult_gain] }; },
  calculate(s, card, context) {
    if (context.joker_main) return { Xmult: card.ability.extra.Xmult + spectral_used() * card.ability.extra.Xmult_gain };
  },
});

// Red Joker
joker('red_joker', {
  name: 'Red Joker', rarity: 1, cost: 5, pos: { x: 3, y: 0 }, blueprint_compat: true, perishable_compat: false,
  config: { extra: { chips_gain: 4, chips: 0 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips_gain, card.ability.extra.chips] }),
  calculate(s, card, context) {
    if (context.joker_main) return { chips: card.ability.extra.chips };
    if (context.discard && !context.blueprint && context.other_card === context.full_hand[context.full_hand.length - 1]) {
      card.ability.extra.chips += card.ability.extra.chips_gain;
      return upgrade(card);
    }
  },
});

// Rigged Wheel (behaviour: the poll_edition hook below)
joker('rigged_wheel', {
  name: 'Rigged Wheel', rarity: 3, cost: 9, pos: { x: 4, y: 0 },
  config: { extra: {} },
  loc_vars: (s, iq) => { iq.push(P_CENTERS.e_negative); return {}; },
});
/** milatro poll_edition override: one roll for "an edition at all", one for which of the 4. */
function rigged_poll_edition(key, mod, no_neg, guaranteed) {
  if (!has(K('rigged_wheel'))) return undefined;
  mod = mod || 1;
  const edition_poll = pseudorandom(pseudoseed(key || 'edition_generic'));
  const tempval = pseudorandom(pseudoseed(key || 'edition_generic'), 1, 4);
  const pick = () => [{ negative: true }, { polychrome: true }, { holo: true }, { foil: true }][tempval - 1];
  if (guaranteed && edition_poll > 1 - 0.01725 * 100) return pick();
  if (edition_poll > 1 - 0.01725 * G.GAME.edition_rate * mod) return pick();
  return null;
}

// Brick by Brick
joker('brick_by_brick', {
  name: 'Brick by Brick', rarity: 1, cost: 5, pos: { x: 5, y: 0 }, blueprint_compat: true, perishable_compat: false,
  config: { extra: { mult_gain: 3, mult: 0 } },
  loc_vars: (s, iq, card) => { iq.push(P_CENTERS.m_stone); return { vars: [card.ability.extra.mult_gain, card.ability.extra.mult] }; },
  calculate(s, card, context) {
    if (context.joker_main) return { mult: card.ability.extra.mult };
    if (context.individual && context.cardarea === G.play && context.other_card.get_id() < 0 && !context.blueprint) {
      card.ability.extra.mult += card.ability.extra.mult_gain;
      say(card, localize('k_upgrade_ex'));
    }
  },
});

// Miner
joker('miner', {
  name: 'Miner', rarity: 1, cost: 4, pos: { x: 6, y: 0 }, blueprint_compat: true,
  config: { extra: { repetitions: 1 } },
  loc_vars: (s, iq, card) => { iq.push(P_CENTERS.m_stone); return { vars: [card.ability.extra.repetitions + 1] }; },
  calculate(s, card, context) {
    if (context.cardarea === G.play && context.repetition && !context.repetition_only && context.other_card.get_id() < 0) {
      return { message: localize('k_again_ex'), repetitions: card.ability.extra.repetitions, card };
    }
  },
});

// Colorblindness (behaviour: the is_suit hook below)
joker('colorblindness', {
  name: 'Colorblindness', rarity: 1, cost: 7, pos: { x: 7, y: 0 },
  config: { extra: {} },
  loc_vars: () => ({ vars: SUIT_VARS.slice(), colours: SUIT_COLOURS.slice() }),
});
const clubs_or_diamonds = (s) => s === 'Clubs' || s === 'Diamonds';
/** Card:is_suit override. Fix 1: only Clubs <-> Diamonds (the Lua's `==` also paired Spades/Hearts). */
function colorblind_is_suit(card, suit) {
  if (!has(K('colorblindness'))) return undefined;
  if (clubs_or_diamonds(card.base.suit) && clubs_or_diamonds(suit)) return true;
  // With Smeared Joker (Hearts=Diamonds, Spades=Clubs) every suit becomes one.
  if (G.jokers.cards.some((c) => c.ability.name === 'Smeared Joker' && !c.debuff)) return true;
  return undefined;
}

// Wild West
joker('wild_west', {
  name: 'Wild West', rarity: 1, cost: 5, pos: { x: 8, y: 0 }, blueprint_compat: true,
  config: { extra: { mult: 30 } },
  loc_vars: (s, iq, card) => { iq.push(P_CENTERS.m_wild); return { vars: [card.ability.extra.mult] }; },
  calculate(s, card, context) {
    if (context.individual && context.cardarea === G.play) {
      if (context.other_card === context.full_hand[0] && context.other_card.config.center.key === 'm_wild') {
        say(card, 'YEEE-HAW!');
        return { mult: card.ability.extra.mult, card };
      }
    }
  },
});

// Fire Tornado
joker('fire_tornado', {
  name: 'Fire Tornado', rarity: 1, cost: 5, pos: { x: 9, y: 0 }, blueprint_compat: true,
  config: { extra: { mult: 20 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult, ...SUIT_VARS], colours: SUIT_COLOURS.slice() }),
  calculate(s, card, context) {
    if (context.joker_main) {
      const suits = { Hearts: 0, Diamonds: 0, Spades: 0, Clubs: 0 };
      for (const c of context.full_hand) {
        if (c.ability.name === 'Wild Card') continue;
        if (c.is_suit('Hearts', true)) suits.Hearts++;
        else if (c.is_suit('Diamonds', true)) suits.Diamonds++;
        else if (c.is_suit('Spades', true)) suits.Spades++;
        else if (c.is_suit('Clubs', true)) suits.Clubs++;
      }
      if (suits.Clubs <= 0 && suits.Spades <= 0) return { mult: card.ability.extra.mult };
    }
  },
});

// Symmetry Joker
joker('symmertry_joker', {
  name: 'Symmetry Joker', rarity: 2, cost: 6, pos: { x: 0, y: 1 }, blueprint_compat: true,
  config: { extra: { repetitions: 1 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.repetitions + 1] }),
  calculate(s, card, context) {
    if (context.cardarea === G.play && context.repetition && !context.repetition_only) {
      const id = context.other_card.get_id();
      if (id === 6 || id === 8 || id === 9 || id === 14) return { message: localize('k_again_ex'), repetitions: card.ability.extra.repetitions, card };
    }
  },
});

// Hole in One
joker('hole_in_one', {
  name: 'Hole in One', rarity: 1, cost: 5, pos: { x: 1, y: 1 }, blueprint_compat: true,
  config: { extra: { dollar: 5 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.dollar] }),
  calculate(s, card, context) {
    if (context.joker_main && G.GAME.current_round.hands_played === 0) {
      // Fix 4: a SCORING Ace (the Lua walked context.full_hand).
      if (context.scoring_hand.some((c) => c.get_id() === 14)) {
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.dollar;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: card.ability.extra.dollar };
      }
    }
  },
});

// Slot Machine
joker('slot_machine', {
  name: 'Slot Machine', rarity: 3, cost: 8, pos: { x: 2, y: 1 }, blueprint_compat: true,
  loc_vars: (s, iq) => { iq.push(P_CENTERS.e_negative); return {}; },
  calculate(s, card, context) {
    if (context.joker_main) {
      const sevens = context.scoring_hand.filter((c) => c.get_id() === 7).length;
      if (sevens >= 3) {
        G.E_MANAGER.add_event(() => {
          for (let i = 0; i < 3; i++) {
            const t = pseudorandom(pseudoseed('slot_machine'), 1, 3);
            const c = create_card(t === 1 ? 'Tarot' : t === 2 ? 'Planet' : 'Spectral', G.consumeables, null, null, null, true);
            c.set_edition({ negative: true }, true);
            c.add_to_deck();
            G.consumeables.emplace(c);
          }
        });
        return { message: 'JACKPOT!' };
      }
    }
  },
});

// The Deal
joker('the_deal', {
  name: 'The Deal', rarity: 2, cost: 6, pos: { x: 3, y: 1 }, blueprint_compat: true,
  config: { extra: { hands: 1, discards: 5 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.hands, card.ability.extra.discards] }),
  calculate(s, card, context) {
    if (context.setting_blind) {
      G.E_MANAGER.add_event(() => {
        ease_discard(card.ability.extra.discards, false);
        if (G.GAME.current_round.hands_left > 1) {
          const diff = -G.GAME.current_round.hands_left + 1;
          G.GAME.current_round.hands_left = 1;
          emit('hands', { mod: diff, total: 1 });
        }
        play_sound('chips2');
      });
      return { message: '+5 Discards' };
    }
  },
});

// Loan Shark
joker('loan_shark', {
  name: 'Loan Shark', rarity: 3, cost: 8, pos: { x: 4, y: 1 }, blueprint_compat: true,
  config: { extra: { Xmult_gain: 0.5, debt: 5, Xmult: 1, compareNum: 0 } },
  loc_vars: (s, iq, card) => {
    const e = card.ability.extra;
    const d = G.GAME ? G.GAME.dollars : 0;
    return { vars: [e.Xmult_gain, e.debt, d < 0 ? e.Xmult + Math.abs(d) * e.Xmult_gain : e.Xmult] };
  },
  add_to_deck(s, card) { G.GAME.bankrupt_at -= card.ability.extra.debt; },
  remove_from_deck(s, card) { G.GAME.bankrupt_at += card.ability.extra.debt; },
  calculate(s, card, context) {
    if (context.joker_main) {
      const e = card.ability.extra;
      return { Xmult: G.GAME.dollars < 0 ? e.Xmult + Math.abs(G.GAME.dollars) * e.Xmult_gain : e.Xmult };
    }
  },
});

// The Reaper
joker('the_reaper', {
  name: 'The Reaper', rarity: 1, cost: 5, pos: { x: 5, y: 1 }, blueprint_compat: true,
  config: { extra: { min: 1, odds: 2, last_hand: 0 } },
  loc_vars: (s, iq, card) => {
    card.ability.extra.min = (G.GAME && G.GAME.probabilities.normal) || 1;
    iq.push(P_CENTERS.c_death);
    return { vars: [card.ability.extra.min, card.ability.extra.odds] };
  },
  calculate(s, card, context) {
    if (context.before) card.ability.extra.last_hand = context.poker_hands.Pair && context.poker_hands.Pair.length ? 1 : 0;
    // Fix 2: Balatro's room check instead of overwriting G.GAME.consumeable_buffer.
    if (context.end_of_round && !context.individual && !context.repetition && card.ability.extra.last_hand === 1 && room() && !card.debuff) {
      if (pseudorandom('reaper') < G.GAME.probabilities.normal / card.ability.extra.odds) {
        G.GAME.consumeable_buffer += 1;
        G.E_MANAGER.add_event(() => {
          const c = create_card(null, G.consumeables, null, null, null, null, 'c_death');
          c.add_to_deck();
          G.consumeables.emplace(c);
          G.GAME.consumeable_buffer = 0;
        });
        return { message: 'Death comes...' };
      }
      return { message: 'Death waits...' };
    }
  },
});

// Black Kitten
joker('black_kitten', {
  name: 'Black Kitten', rarity: 2, cost: 6, pos: { x: 6, y: 1 }, blueprint_compat: true, perishable_compat: false,
  config: { extra: { Xmult_gain: 0.1, Xmult_loss: 0.1, Xmult: 1 } },
  loc_vars: (s, iq, card) => { iq.push(P_CENTERS.m_lucky); const e = card.ability.extra; return { vars: [e.Xmult_gain, e.Xmult_loss, e.Xmult] }; },
  calculate(s, card, context) {
    const e = card.ability.extra;
    if (context.joker_main) {
      if (e.Xmult <= 1) return undefined;
      return { Xmult: e.Xmult };
    }
    if (context.individual && context.cardarea === G.play && !context.blueprint) {
      if (context.other_card.ability.name === 'Lucky Card' && !context.other_card.lucky_trigger) {
        e.Xmult += e.Xmult_gain;
        say(card, '+X0.1');
        return undefined;
      }
      if (context.other_card.lucky_trigger) {
        if (e.Xmult < 1.1) { e.Xmult = 1; return undefined; }
        e.Xmult = e.Xmult - e.Xmult_loss;
        say(card, '-X0.1');
      }
    }
  },
});

// Lumberjack
joker('lumberjack', {
  name: 'Lumberjack', rarity: 2, cost: 6, pos: { x: 7, y: 1 }, blueprint_compat: true, eternal_compat: false,
  config: { extra: { three_count: 0, dollars: 1 } },
  loc_vars: (s, iq, card) => {
    card.ability.extra.three_count = 0;
    if (G.playing_cards && !card.fake) for (const v of G.playing_cards) if (v.get_id() === 3) card.ability.extra.three_count++;
    return { vars: [card.ability.extra.three_count, card.ability.extra.dollars] };
  },
  calculate(s, card, context) {
    if (context.selling_self) {
      const destroyed = G.playing_cards.filter((v) => v.get_id() === 3);
      for (const c of destroyed) c.start_dissolve();
      const amt = card.ability.extra.dollars * destroyed.length;
      if (amt) {
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + amt;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        ease_dollars(amt);
        card_eval_status_text(card, 'dollars', amt);
      }
    }
  },
});

// Clown Fiesta
joker('clown_fiesta', {
  name: 'Clown Fiesta', rarity: 2, cost: 6, pos: { x: 8, y: 1 }, blueprint_compat: true, eternal_compat: false,
  config: { extra: { tags: 2 } },
  loc_vars: (s, iq, card) => { iq.push({ key: 'tag_juggle', set: 'Tag' }); return { vars: [card.ability.extra.tags] }; },
  calculate(s, card, context) {
    if (context.selling_self) {
      for (let i = 0; i < card.ability.extra.tags; i++) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_juggle'));
          play_sound('generic1');
          play_sound('holo1');
        });
      }
    }
  },
});

// Force of Nature
const calc_force_of_nature = (gain) => {
  let thunk = 1;
  for (const v of G.playing_cards || []) if (v.get_id() === 4 && v.ability.name === 'Wild Card') thunk += gain;
  return thunk;
};
joker('force_of_nature', {
  name: 'Force of Nature', rarity: 3, cost: 7, pos: { x: 9, y: 1 }, blueprint_compat: true,
  config: { extra: { Xmult_gain: 1, Xmult: 1 } },
  loc_vars: (s, iq, card) => {
    iq.push(P_CENTERS.m_wild);
    card.ability.extra.Xmult = 1;
    if (G.playing_cards && !card.fake) return { vars: [card.ability.extra.Xmult_gain, card.ability.extra.Xmult * calc_force_of_nature(1)] };
    return { vars: [card.ability.extra.Xmult_gain, 1] };
  },
  calculate(s, card, context) {
    if (context.joker_main) return { Xmult: card.ability.extra.Xmult * calc_force_of_nature(1) };
  },
});

// Multitasking
joker('multitasking', {
  name: 'Multitasking', rarity: 1, cost: 4, pos: { x: 0, y: 2 }, blueprint_compat: true,
  config: { extra: { mult: 5, chips: 60, dollars: 2 } },
  loc_vars: (s, iq, card) => { const e = card.ability.extra; return { vars: [e.mult, e.chips, e.dollars] }; },
  calculate(s, card, context) {
    if (context.joker_main) {
      const e = card.ability.extra;
      const round_hand_played_on = G.GAME.current_round.hands_left + 1;
      if (round_hand_played_on === 1) {
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + e.dollars;
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: e.dollars };
      }
      if (round_hand_played_on % 2 === 0) return { mult: e.mult };
      return { chips: e.chips };
    }
  },
});

// The Toilet
joker('the_toilet', {
  name: 'The Toilet', rarity: 1, cost: 5, pos: { x: 1, y: 2 }, blueprint_compat: true,
  config: { extra: { min: 1, odds: 2 } },
  loc_vars: (s, iq, card) => {
    card.ability.extra.min = (G.GAME && G.GAME.probabilities.normal) || 1;
    return { vars: [card.ability.extra.min, card.ability.extra.odds] };
  },
  calculate(s, card, context) {
    if (context.cardarea === G.jokers && context.before) {
      if (pseudorandom('toilet') < G.GAME.probabilities.normal / card.ability.extra.odds) {
        const r = pseudorandom('flush_hand', 1, 4);
        // G.handlist[1], [2], [4], [7]: Flush Five, Flush House, Straight Flush, Flush.
        const flush_hand = r === 1 ? G.handlist[0] : r === 2 ? G.handlist[1] : r === 3 ? G.handlist[3] : G.handlist[6];
        emit('hand_text', { handname: flush_hand, chips: G.GAME.hands[flush_hand].chips, mult: G.GAME.hands[flush_hand].mult, level: G.GAME.hands[flush_hand].level });
        level_up_hand(context.blueprint_card || card, flush_hand, null, 1);
        const h = G.GAME.hands[context.scoring_name];
        emit('hand_text', { handname: context.scoring_name, chips: h.chips, mult: h.mult, level: h.level });
      }
    }
  },
});

// Magic Hat
joker('magic_hat', {
  name: 'Magic Hat', rarity: 1, cost: 5, pos: { x: 2, y: 2 }, blueprint_compat: true,
  loc_vars: (s, iq) => { iq.push({ key: 'blue_seal', set: 'Other' }); iq.push({ key: 'purple_seal', set: 'Other' }); return {}; },
  calculate(s, card, context) {
    if (!(context.individual && context.cardarea === G.play)) return undefined;
    // Fix 2: the room check reads (not overwrites) G.GAME.consumeable_buffer, and resets it.
    if (context.other_card.seal === 'Blue' && room()) {
      G.GAME.consumeable_buffer += 1;
      G.E_MANAGER.add_event(() => {
        if (G.GAME.last_hand_played) {
          let _planet = 0;
          for (const v of P_CENTER_POOLS.Planet) if (v.config.hand_type === G.GAME.last_hand_played) _planet = v.key;
          const c = create_card('Planet', G.consumeables, null, null, null, null, _planet, 'blusl');
          c.add_to_deck();
          G.consumeables.emplace(c);
        }
        G.GAME.consumeable_buffer = 0;
      });
    } else if (context.other_card.seal === 'Purple' && room()) {
      G.GAME.consumeable_buffer += 1;
      G.E_MANAGER.add_event(() => {
        const c = create_card('Tarot', G.consumeables, null, null, null, null, null, '8ba');
        c.add_to_deck();
        G.consumeables.emplace(c);
        G.GAME.consumeable_buffer = 0;
      });
    }
  },
});

// Phalanx (behaviour: the set_debuff hook below)
joker('phalanx', { name: 'Phalanx', rarity: 2, cost: 7, pos: { x: 3, y: 2 } });
/** The rank with the most cards in the full deck (ties -> the higher rank, the Lua's 14..2 scan). */
function phalanx_rank() {
  const freq = {};
  for (let i = 2; i <= 14; i++) freq[i] = 0;
  for (const v of G.playing_cards) { const id = v.get_id(); if (id > 0 && freq[id] !== undefined) freq[id]++; }
  let best = 14;
  for (let i = 14; i >= 2; i--) if (freq[i] > freq[best]) best = i;
  return best;
}
function phalanx_set_debuff(card) {
  if (!G.playing_cards || card.ability.set === 'Joker' || !has(K('phalanx'))) return undefined;
  if (card.get_id() === phalanx_rank()) return 'prevent_debuff';
  return undefined;
}

// Betrayal
joker('betrayal', {
  name: 'Betrayal', rarity: 2, cost: 7, pos: { x: 4, y: 2 },
  config: { extra: { dollars: 20 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.dollars] }),
  calculate(s, card, context) {
    if (context.setting_blind && !context.blueprint) {
      const destructable = G.jokers.cards.filter((j) => j !== card && !j.ability.eternal && !j.getting_sliced);
      const joker_to_destroy = destructable.length > 0 ? pseudorandom_element(destructable, pseudoseed('betrayal'))[0] : null;
      if (joker_to_destroy && !(context.blueprint_card || card).getting_sliced) {
        joker_to_destroy.getting_sliced = true;
        G.E_MANAGER.add_event(() => { joker_to_destroy.start_dissolve(); });
      }
      G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.dollars;
      G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
      return { dollars: card.ability.extra.dollars };
    }
  },
});

// The Landlords
joker('the_landlords', {
  name: 'The Landlords', rarity: 3, cost: 8, pos: { x: 5, y: 2 }, blueprint_compat: true,
  config: { extra: { Xmult: 4 } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.Xmult] }),
  calculate(s, card, context) {
    if (context.joker_main && context.poker_hands['Full House'] && context.poker_hands['Full House'].length) return { Xmult: card.ability.extra.Xmult };
  },
});

// Toast / Rapture
joker('toast', {
  name: 'Toast', rarity: 3, cost: 8, pos: { x: 6, y: 2 }, blueprint_compat: true,
  // count -50 just so the collection never shows the Holy Toast (the mod's own comment).
  config: { extra: { Xmult: 5, actual_rounds: 0, count: -50 } },
  loc_vars: (s, iq, card) => {
    const e = card.ability.extra;
    if (e.count === e.actual_rounds) return { vars: [e.Xmult], key: K('toast_alt') };
    return { vars: [], key: K('toast') };
  },
  add_to_deck(s, card) {
    if (card.ability.extra.actual_rounds === 0) {
      card.ability.extra.actual_rounds = pseudorandom('toast', 3, 6);
      card.ability.extra.count = 0;
    }
  },
  calculate(s, card, context) {
    const e = card.ability.extra;
    if (context.joker_main && e.count === e.actual_rounds) return { Xmult: e.Xmult };
    if (context.end_of_round && context.main_eval && e.count < e.actual_rounds && !context.blueprint) {
      e.count += 1;
      if (e.count === e.actual_rounds) return { message: 'Blessed!' };
    }
  },
});

// Recursive Joker
joker('recursive_joker', {
  name: 'Recursive Joker', rarity: 2, cost: 7, pos: { x: 7, y: 2 }, blueprint_compat: true, perishable_compat: false,
  config: { extra: { mult_gain: 4, mult_loss: 20, mult: 0 } },
  loc_vars: (s, iq, card) => { const e = card.ability.extra; return { vars: [e.mult_gain, e.mult_loss, e.mult] }; },
  calculate(s, card, context) {
    const e = card.ability.extra;
    if (context.joker_main) return { mult: e.mult };
    if (context.before && !context.blueprint) e.mult += e.mult_gain;
    if (context.end_of_round && G.GAME.blind.boss && !context.blueprint && !context.repetition && !context.individual) {
      e.mult = Math.max(0, e.mult - e.mult_loss);
      return { message: 'Falling...' };
    }
  },
});

// Butterfly Effect
const ENHANCEMENTS = ['Lucky Card', 'Glass Card', 'Mult Card', 'Bonus Card', 'Stone Card', 'Steel Card', 'Gold Card'];
const ENH_KEY = { 'Lucky Card': 'm_lucky', 'Glass Card': 'm_glass', 'Mult Card': 'm_mult', 'Bonus Card': 'm_bonus', 'Stone Card': 'm_stone', 'Steel Card': 'm_steel', 'Gold Card': 'm_gold' };
joker('butterfly_effect', {
  name: 'Butterfly Effect', rarity: 2, cost: 6, pos: { x: 8, y: 2 },
  quantum_enhancements: true,
  loc_vars: (s, iq) => {
    iq.push(P_CENTERS.m_wild);
    const b = G.GAME && G.GAME.current_round && G.GAME.current_round.butterfly_card;
    return { vars: [b ? b.enhancement : ENHANCEMENTS[0]] };
  },
  calculate(s, card, context) {
    if (context.check_enhancement && context.other_card.ability.name === 'Wild Card') {
      const k = ENH_KEY[G.GAME.current_round.butterfly_card && G.GAME.current_round.butterfly_card.enhancement];
      if (k) return { [k]: true };
    }
  },
});

// How Hungry
joker('how_hungry', {
  name: 'How Hungry', rarity: 2, cost: 6, pos: { x: 9, y: 2 },
  config: { extra: { dollars: 6, contains7: false, to_destroy: [], money_granted: false } },
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.dollars] }),
  calculate(s, card, context) {
    const e = card.ability.extra;
    if (context.before && !context.blueprint) {
      e.to_destroy = [];
      // Fix 3: re-evaluated every hand (the Lua only ever set it to true).
      e.contains7 = context.scoring_hand.some((c) => c.get_id() === 7);
    }
    if (context.individual && context.cardarea === G.play && !context.blueprint) {
      if (context.other_card.get_id() === 9 && e.contains7) {
        e.to_destroy = e.to_destroy || [];
        if (!e.to_destroy.includes(context.other_card.sort_id)) e.to_destroy.push(context.other_card.sort_id);
      }
    }
    if (context.destroying_card && !context.blueprint) {
      const hit = (e.to_destroy || []).includes(context.destroying_card.sort_id);
      if (!e.money_granted && hit) {
        e.money_granted = true;
        ease_dollars(e.dollars);
      }
      return hit || undefined;
    }
    if (context.after && !context.blueprint) {
      e.to_destroy = null;
      e.money_granted = false;
    }
  },
});

const LOC = {
  j_mlnc_humble_joker: ['Humble Joker', ['{C:white,X:mult} X#1# {} Mult']],
  j_mlnc_circle_joker: ['Circle Joker', ['If hand contains exactly {C:attention}1 {}card', 'this joker gains {C:mult}+#2# {}Mult', 'and {C:chips}+#4# {}Chips', '{C:inactive}(Currently {C:mult}+#1# {C:inactive}Mult & {C:chips}+#3# {C:inactive}Chips)']],
  j_mlnc_bad_omen: ['Bad Omen', ['Gains {C:white,X:mult}X#1#{} Mult per', 'unique {C:spectral}Spectral {}card used this run', '{C:inactive}(Currently {C:white,X:mult}X#2#{C:inactive} Mult)']],
  j_mlnc_red_joker: ['Red Joker', ['Gains {C:chips}+#1# {}Chips per {C:attention}discard{}', '{C:inactive}(Currently {C:chips}+#2# {C:inactive}Chips)']],
  j_mlnc_rigged_wheel: ['Rigged Wheel', ['All chances for {C:enhanced}Editions {}are', 'equally likely, including {C:dark_edition}Negative{}']],
  j_mlnc_brick_by_brick: ['Brick by Brick', ['This Joker gains {C:mult}+#1# {}Mult', 'for each scoring {C:attention}Stone {}card', '{C:inactive}(Currently {C:mult}+#2# {C:inactive}Mult)']],
  j_mlnc_miner: ['Miner', ['Retriggers all played {C:attention}Stone {}cards']],
  j_mlnc_colorblindness: ['Colorblindness', ['{V:3}Clubs{} and {V:4}Diamonds{} count', 'as the same suit']],
  j_mlnc_wild_west: ['Wild West', ['{C:mult}+#1# {}Mult for scoring {C:attention}Wild {}card', 'in the leftmost position']],
  j_mlnc_fire_tornado: ['Fire Tornado', ['{C:mult}+#1# {}Mult if played hand only', 'contains {V:2}Hearts {}and {V:4}Diamonds{}']],
  j_mlnc_symmertry_joker: ['Symmetry Joker', ['Retrigger all scoring {C:attention}8s{},', '{C:attention}6s{}, {C:attention}9s {}and {C:attention}Aces {}']],
  j_mlnc_hole_in_one: ['Hole in One', ['If {C:attention}first hand{} of round contains', 'a scoring {C:attention}Ace{}, earn {C:money}$#1#{}']],
  j_mlnc_slot_machine: ['Slot Machine', ['If hand contains 3 {C:attention}7s{},', 'create {C:attention}3 {C:dark_edition}Negative {}Consumables']],
  j_mlnc_the_deal: ['The Deal', ['Go down to {C:blue}#1#{} Hand, gain {C:red}+#2# {}Discards']],
  j_mlnc_loan_shark: ['Loan Shark', ['This Joker gains {C:white,X:mult}X#1# {} Mult for', 'each {C:money}$1{} below {C:money}0{}', 'Go up to {C:red}-$#2#{} in debt', '{C:inactive}(Currently {C:white,X:mult}X#3#{C:inactive} Mult)']],
  j_mlnc_the_reaper: ['The Reaper', ['If the {C:attention}winning hand{} of round contains', 'a {C:attention}Pair{}, {C:green,E:1}#1# in #2#{} chance', 'to create a {C:tarot}Death Tarot{} card']],
  j_mlnc_black_kitten: ['Black Kitten', ['This Joker gains {C:white,X:mult}X#1# {} Mult if a {C:attention}Lucky {}card', '{C:red}unsuccesfully {}triggers, loses {C:white,X:mult}X#2# {} Mult', 'for a {C:green}succesful {}trigger', '{C:inactive}(Currently {C:white,X:mult}X#3# {C:inactive} Mult)']],
  j_mlnc_lumberjack: ['Lumberjack', ['Sell this Joker to remove', 'all {C:attention}3s {}from full deck', 'Earn {C:money}$#2# {}for each {C:attention}3 {}destroyed', '{C:inactive}(Currently {C:attention}#1# {C:inactive}cards to remove)']],
  j_mlnc_clown_fiesta: ['Clown Fiesta', ['Sell this Joker to create {C:attention}#1#{}', 'free {C:attention}Juggle Tags{}']],
  j_mlnc_force_of_nature: ['Force of Nature', ['Gains {C:white,X:mult}X#1#{} Mult for every', '{C:attention}Wild 4 {}in your {C:attention}full deck{}', '{C:inactive}(Currently {C:white,X:mult}X#2#{C:inactive} Mult)']],
  j_mlnc_multitasking: ['Multitasking', ['{C:mult}+#1# {}Mult on {C:attention}even{} hands', '{C:chips}+#2# {}Chips on {C:attention}odd{} hands', '{C:gold}$#3#{} on {C:attention}final{} hand of round']],
  j_mlnc_the_toilet: ['The Toilet', ['{C:green,E:1}#1# in #2#{} chance to upgrade level', 'of {C:attention}poker hand {}containing {C:attention}Flush{}']],
  j_mlnc_magic_hat: ['Magic Hat', ['Blue and purple {C:attention}seals {}', 'can activate when played']],
  j_mlnc_phalanx: ['Phalanx', ['The {C:attention}card {}with highest frequency', 'in your entire deck can', 'no longer be {C:attention}debuffed{}']],
  j_mlnc_betrayal: ['Betrayal', ['When {C:attention}Blind {}is selected, earn', '{C:money}$#1# {}and {C:red}destroy {}a random Joker']],
  j_mlnc_the_landlords: ['The Landlords', ['{C:white,X:mult}X#1#{} Mult if played hand', 'contains a {C:attention}Full House{}']],
  j_mlnc_recursive_joker: ['Recursive Joker', ['{C:mult}+#1# {}Mult per hand played', '{C:mult}-#2# {}Mult after defeating {C:attention}Boss Blind{}', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)']],
  j_mlnc_butterfly_effect: ['Butterfly Effect', ['{C:attention}Wild Cards{} have the ', 'additional effect of {C:attention}#1#s{}', 'Enhancement changes at ', 'the end of each round']],
  j_mlnc_how_hungry: ['How Hungry', ['If hand contains both a', 'scoring {C:attention}7 {}and {C:attention}9{},', 'destroy {C:attention}all {}scoring {C:attention}9{} and earn {C:money}$#1#{}']],
  // localization/default.lua
  j_mlnc_toast: ['Toast', ['{C:inactive}Does nothing..?{}']],
  j_mlnc_toast_alt: ['Rapture', ['{C:edition,E:2}The Holy Toast{}', '{C:white,X:mult}X#1#{} Mult']],
};
const Joker = {};
for (const [k, [name, text]] of Object.entries(LOC)) Joker[k] = { name, text };

export const MILATRO = registerMod({
  id: 'milatro',
  name: 'Milatro',
  prefix: P,
  version: '1.1.0',
  by: 'Milan, Emilia & Emma (rebuilt for Micatro)',
  badge_colour: '#008000',
  description: "Milan's cool mod that adds a bunch of jokers. Enjoy!",
  content: {
    centers: J,
    atlases: { [ATLAS]: { src: '/micatro/mods/milatro/assets/2x/MilatroJokers.png', px: 71, py: 95 } },
    loc: { descriptions: { Joker } },
  },
  hooks: {
    poll_edition: rigged_poll_edition,
    is_suit: colorblind_is_suit,
    set_debuff: phalanx_set_debuff,
    // Game:init_game_object wrap + SMODS reset_game_globals (run start and every round).
    init_game_object(GAME) { GAME.current_round.butterfly_card = { enhancement: ENHANCEMENTS[0] }; },
    reset_game_globals() {
      G.GAME.current_round.butterfly_card = { enhancement: ENHANCEMENTS[0] };
      G.GAME.current_round.butterfly_card.enhancement = ENHANCEMENTS[pseudorandom('butterfly', 1, ENHANCEMENTS.length) - 1];
    },
  },
});
export const JOKER_KEYS = J.map((c) => c.key);
