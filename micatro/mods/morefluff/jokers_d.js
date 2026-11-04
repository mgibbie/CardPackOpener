/**
 * More Fluff 1.9.9999 — batch B1: the new jokers that have real art upstream (src/jokers/<file>.lua at tag 1.9.9999),
 * plus the two Tokens they make. The Planeswalkers (Jimbo, the Mind Sculptor; John Balatro?) are in planeswalker.js.
 *
 *   Dinner                  retriggers the joker to its right (retrigger_joker_check) for 5 rounds, then is eaten
 *   Forge ("Joker Forge")   every 2 Jokers sold create a random Joker (a Forge Residue token while another Forge is held)
 *   Doubled Scale           every SMODS.scale_card scales twice as fast (calc_scaling: 'X' scalings square the scalar)
 *   Bouncer                 entering the shop, the joker (else the first consumable) to its right goes back to the
 *                           shop; +3 Chips per $1 of its sell value; a returned Joker leaves a Fish token
 *   Jokes for Minecrafters  a joke a round: the first discarded card it names is destroyed
 *   Apple Friends           every +Chips / +Mult is doubled (per copy); destroyed when another Joker is sold
 *   Gem Alert               Rare jokers X6.7 as common (G.GAME.rare_mod); +X0.1 Mult per Rare / Editioned shop Joker
 *   Gentlemelon             duplicates allowed (SMODS.showman), owned cards' duplicates X100 likelier; dies after 4
 *                           purchases / packs opened
 *   Joker Reacts            Food jokers X3 likelier and face down in the shop; buying one: $2 and +1 Mult
 *   Retrigger Joker         retriggers every other joker that retriggers (the "retrigger" attribute) and the 5th
 *                           scoring card
 *   Alchemy Joker           (j_mf_digital_exclusive) sold: a random "passive" Joker that perpetually gains
 *                           A-Hit the Road (discarded Jacks are exiled until the end of the Ante; X0.5 Mult per exiled card)
 *
 * Steamodded seams used (js/engine/smods.js; More Fluff opts in to these contexts only, index.js `smods_seams`):
 * scaling_card (+ the deprecated calc_scaling), modify_weights (SMODS.poll_object, on since More Fluff turns on
 * object_weights), modify_shop_card (SMODS.create_shop_card). Engine hooks: eval_card_result (Apple Friends' wrap of
 * SMODS.calculate_individual_effect), the G.GAME.rare_mod rarity weight (core.js poll_joker_rarity), pool_duplicates
 * (SMODS.showman), emplace (Joker Reacts' face-down shop card), calculate_joker (the perpetual Alchemy ability: FLUFF.
 * calculate_extra_effects), shop_stocked (Bouncer: context.starting_shop), describe (the perpetual ability's box).
 *
 * Port notes: Gem Alert's polychrome diamond layer (its `draw`: cell 6,18 through the polychrome shader) is drawn as a
 * plain overlay (view_card mod_stickers). Forge Residue's art is upstream's own scribbled "slop" token card.
 */
import {
  G, P_CENTERS, localize, emit, play_sound, pseudorandom_element, pseudoseed, juice_card,
} from '../../js/engine/core.js';
import { has_attribute } from '../../js/engine/smods.js';
import { joker, find, has, say, remove_joker, scale_card, progressbar, destroy_cards, add_card } from './util.js';
import { exile_card } from './exile.js';
import LOC from './loc.js';

export const centers = [];
const J = (slug, def) => centers.push(joker(slug, def));
/** The main end_of_round pass for jokers (context.end_of_round and context.cardarea == G.jokers). */
const eor = (ctx) => ctx.end_of_round && !ctx.individual && !ctx.repetition && (ctx.cardarea === undefined || ctx.cardarea === G.jokers);
const right_of = (card) => { const i = G.jokers.cards.indexOf(card); return i >= 0 ? G.jokers.cards[i + 1] : undefined; };

// ------------------------------------------------------------------ Dinner
J('dinner', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.rounds_left] }),
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check && !ctx.retrigger_joker && ctx.other_card !== card) {
      if (right_of(card) && right_of(card) === ctx.other_card) return { message: localize('k_again_ex'), repetitions: 1, card };
    }
    if (eor(ctx) && !ctx.blueprint) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'rounds_left', operation: '-' });
      if (card.ability.extra.rounds_left <= 0) {
        destroy_cards(card);
        return { message: localize('k_eaten_ex'), colour: 'FILTER' };
      }
    }
  },
});

// ------------------------------------------------------------------ Forge
J('forge', {
  loc_vars: (s, iq, card) => { const [val, max] = progressbar(card.ability.partial_rounds, card.ability.upgrade_rounds); return { vars: [val, max, card.ability.upgrade_rounds] }; },
  calculate(s, card, ctx) {
    if (ctx.selling_card && !ctx.selling_self && ctx.card.ability.set === 'Joker' && ctx.card.config.center.key !== 'j_mf_forgeslop') {
      let upgraded = false;
      card.ability.partial_rounds = card.ability.partial_rounds + 1;
      while (card.ability.partial_rounds >= card.ability.upgrade_rounds) {
        card.ability.partial_rounds = card.ability.partial_rounds - card.ability.upgrade_rounds;
        // (the Lua: "shenanigans" when the FIRST Forge in the joker row isn't this one -> a Forge Residue instead)
        const first = G.jokers.cards.find((o) => o.config.center.key === 'j_mf_forge');
        const force_key = first && first !== card ? 'j_mf_forgeslop' : undefined;
        play_sound('timpani');
        add_card({ set: 'Joker', key: force_key });
        juice_card(card);
        upgraded = true;
      }
      if (!upgraded) say(card, card.ability.partial_rounds + '/' + card.ability.upgrade_rounds, 'YELLOW');
    }
  },
});
// Forge Residue (the Forge's token)
J('forgeslop', { calculate() {} });

// ------------------------------------------------------------------ Doubled Scale
J('doubledscale', {
  calculate() {},
  calc_scaling(center, self, card, initial, scalar_value, args) {
    if (args.operation === 'X') return { override_scalar_value: { value: scalar_value * scalar_value } };
    return { override_scalar_value: { value: scalar_value * 2 } };
  },
});

// ------------------------------------------------------------------ Bouncer (+ its Fish token)
J('bouncer', {
  loc_vars(s, iq, card) {
    iq.push(P_CENTERS.j_mf_fish);
    const c = card.ability.extra.chips;
    return { vars: [card.ability.extra.chips_per, (c >= 0 ? '+' : '') + c] }; // (SMODS.signed)
  },
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main) return { chips: card.ability.extra.chips };
  },
});
J('fish', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main) return { chips: card.ability.extra.chips, mult: card.ability.extra.mult };
  },
});
/** context.starting_shop (not Blueprint): each Bouncer sends the card to its right back to the shop. */
function bouncers() {
  for (const card of find('j_mf_bouncer')) {
    G.E_MANAGER.add_event(() => {
      let other = right_of(card);
      const is_joker = !!other;
      if (!other) other = G.consumeables.cards[0];
      if (other) {
        card.ability.extra.scale_by = other.sell_cost * card.ability.extra.chips_per;
        scale_card(card, { ref_table: card.ability.extra, ref_value: 'chips', scalar_value: 'scale_by', message_key: 'a_chips', message_colour: 'CHIPS' });
        other.remove_from_deck();
        other.area.remove_card(other);
        G.shop_jokers.emplace(other); // (create_shop_card_ui: its price tag is the card's own cost)
      }
      if (is_joker) {
        G.E_MANAGER.add_event(() => {
          const fish = add_card({ set: 'Joker', key: 'j_mf_fish' });
          say(fish, localize('k_gift_ex'), 'BLUE');
        });
      }
    });
  }
}

// ------------------------------------------------------------------ Jokes for Minecrafters
const JOKES = {
  none: { key: 'none', check: () => true },
  hearts: { key: 'hearts', check_suit: 'Hearts' },
  diamonds: { key: 'diamonds', check_suit: 'Diamonds' },
  clubs: { key: 'clubs', check_suit: 'Clubs' },
  spades: { key: 'spades', check_suit: 'Spades' },
  face: { key: 'face', check: (c) => c.is_face(true) },
  hack: { key: 'hack', check_ranks: [2, 3, 4, 5] },
  odd: { key: 'odd', check_ranks: [14, 3, 5, 7, 9] },
  even: { key: 'even', check_ranks: [2, 4, 6, 8, 10] },
  fib: { key: 'fib', check_ranks: [14, 2, 3, 5, 8] },
};
const pick_joke = () => pseudorandom_element(JOKES, pseudoseed('choose_joke'))[0].key;
J('jokesforminecrafters', {
  loc_vars: (s, iq, card) => ({ key: 'j_mf_jokesforminecrafters_' + card.ability.extra.current_joke, vars: [] }),
  set_ability(s, card) { card.ability.extra.current_joke = pick_joke(); },
  calculate(s, card, ctx) {
    if (ctx.end_of_round && !ctx.individual && !ctx.repetition && !ctx.blueprint) {
      card.ability.extra.current_joke = pick_joke();
      card.ability.extra.has_triggered = false;
      return { message: localize('k_page_turn') };
    }
    if (ctx.pre_discard) {
      for (const other of ctx.full_hand) {
        if (card.ability.extra.has_triggered) break;
        const joke = JOKES[card.ability.extra.current_joke];
        let valid = false;
        if (joke.check) valid = joke.check(other);
        if (joke.check_suit) valid = other.is_suit(joke.check_suit);
        if (joke.check_ranks) for (const r of joke.check_ranks) if (other.get_id() === r) valid = true;
        if (valid) {
          card.ability.extra.has_triggered = true;
          G.E_MANAGER.add_event(() => destroy_cards([other]));
        }
      }
    }
  },
});

// ------------------------------------------------------------------ Apple Friends
J('applefriends', {
  calculate(s, card, ctx) {
    if (ctx.selling_card && ctx.card !== card && ctx.card.ability.set === 'Joker') {
      destroy_cards(card);
      return { message: localize('k_dead_ex'), colour: 'RED' };
    }
  },
});
/** The SMODS.calculate_individual_effect wrap: mult / mult_mod / h_mult / chips / chip_mod / h_chips amounts X2 per
 *  Apple Friends (mult_mod / chip_mod become mult / chips: their joker's own popup gives way to the default one). */
const APPLE_KEYS = ['mult', 'mult_mod', 'h_mult', 'chips', 'chip_mod', 'h_chips'];
function apple_double(eff, bonus, joker_row, depth = 0) {
  if (!eff || typeof eff !== 'object' || depth > 20) return;
  let msg;
  for (const k of APPLE_KEYS) {
    if (typeof eff[k] !== 'number' || !eff[k]) continue;
    eff[k] = eff[k] * bonus;
    if (k === 'mult_mod') msg = localize({ type: 'variable', key: 'a_mult', vars: [eff[k]] });
    else if (k === 'chip_mod' && !msg) msg = localize({ type: 'variable', key: 'a_chips', vars: [eff[k]] });
  }
  if (msg && joker_row && eff.message) eff.message = msg;
  apple_double(eff.extra, bonus, joker_row, depth + 1);
}

// ------------------------------------------------------------------ Gem Alert
J('gemalert', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult_per, card.ability.extra.xmult, card.ability.extra.rate_mod] }),
  calculate(s, card, ctx) {
    if (ctx.modify_shop_card && ctx.card.ability.set === 'Joker') {
      // (the Lua's `edition or is_rarity("Rare") and not blueprint`: an Editioned joker counts even for a Blueprint copy)
      if (ctx.card.edition || (ctx.card.config.center.rarity === 3 && !ctx.blueprint)) {
        scale_card(card, { ref_table: card.ability.extra, ref_value: 'xmult', scalar_value: 'xmult_per', message_key: 'a_xmult' });
      }
    }
    if (ctx.joker_main) return { xmult: card.ability.extra.xmult };
  },
  add_to_deck(s, card) { G.GAME.rare_mod = (G.GAME.rare_mod ?? 1) * card.ability.extra.rate_mod; },
  remove_from_deck(s, card) { G.GAME.rare_mod = (G.GAME.rare_mod ?? 1) / card.ability.extra.rate_mod; },
});

// ------------------------------------------------------------------ Gentlemelon
J('gentlemelon', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.odds, card.ability.extra.purchases] }),
  calculate(s, card, ctx) {
    if (ctx.modify_weights) {
      for (const c of ctx.pool) {
        let count = find(c.key).length;
        if (c.key === 'j_mf_gentlemelon') count = count - 1;
        c.weight = c.weight * Math.pow(card.ability.extra.odds, count);
      }
    }
    if (((ctx.buying_card && !ctx.buying_self && card !== ctx.card) || ctx.open_booster) && !ctx.blueprint) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'purchases', operation: '-', no_message: true });
      if (card.ability.extra.purchases <= 0) {
        remove_joker(card);
        return { message: localize('k_dead_ex'), colour: 'RED' };
      }
      return { message: '' + card.ability.extra.purchases, colour: 'RED' };
    }
  },
});

// ------------------------------------------------------------------ Joker Reacts To Broccoli
J('jokerreacts', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.odds, card.ability.extra.dollars, card.ability.extra.mult_gain, card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.modify_weights && ctx.pool_types.Joker) {
      for (const c of ctx.pool) if (P_CENTERS[c.key] && has_attribute(P_CENTERS[c.key], 'food')) c.weight = c.weight * card.ability.extra.odds;
    }
    if (ctx.modify_shop_card && has_attribute(ctx.card.config.center, 'food')) ctx.card.mf_force_face_down = true;
    if (ctx.buying_card && has_attribute(ctx.card.config.center, 'food')) {
      scale_card(card, { ref_table: card.ability.extra, ref_value: 'mult', scalar_value: 'mult_gain', message_key: 'a_mult', message_colour: 'RED' });
      return { dollars: card.ability.extra.dollars };
    }
    if (ctx.cardarea === G.jokers && ctx.joker_main) return { mult: card.ability.extra.mult };
  },
});

// ------------------------------------------------------------------ Retrigger Joker
J('retrigger_joker', {
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check && !ctx.retrigger_joker && ctx.other_card !== card) {
      if (has_attribute(ctx.other_card.config.center, 'retrigger')) return { message: localize('k_again_ex'), repetitions: 1, card };
    }
    if (ctx.repetition && ctx.cardarea === G.play && ctx.scoring_hand && ctx.other_card === ctx.scoring_hand[4]) return { repetitions: 1 };
  },
});

// ------------------------------------------------------------------ Alchemy Joker (A-Hit the Road)
J('digital_exclusive', {
  calculate(s, card, ctx) {
    if (ctx.selling_self) {
      let gained = 1;
      if (card.edition && card.edition.card_limit) gained = 1 - card.edition.card_limit;
      if (G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit + gained) {
        const created = add_card({ set: 'Joker', attributes: ['passive'] });
        created.ability.mf_alchemy_hit_the_road = (created.ability.mf_alchemy_hit_the_road || 0) + 1;
      }
    }
  },
});
const alchemy_xmult = () => 1 + ((G.mf_exile && G.mf_exile.cards.length) || 0) * 0.5;
/** FLUFF.calculate_extra_effects for a joker with the perpetual A-Hit the Road: its own effect, then the ability's. */
let in_alchemy = false;
function alchemy_calculate(card, ctx) {
  const n = card.ability.mf_alchemy_hit_the_road;
  if (!n || in_alchemy || card.debuff || !(ctx.discard || ctx.joker_main)) return undefined;
  if (ctx.discard && !(ctx.other_card && ctx.other_card.get_id() === 11)) return undefined;
  in_alchemy = true;
  let own;
  try { own = card.calculate_joker(ctx); } finally { in_alchemy = false; }
  if (ctx.discard) {
    const jack = ctx.other_card;
    G.E_MANAGER.add_event(() => exile_card(jack, 'ante'));
    return own === undefined ? null : own;
  }
  // joker_main: X(1 + 0.5 per exiled card) per stack, chained after the joker's own effect (SMODS.merge_effects)
  const adds = [];
  for (let i = 0; i < n; i++) { const x = alchemy_xmult(); adds.push({ Xmult_mod: x, message: localize({ type: 'variable', key: 'a_xmult', vars: [x] }) }); }
  if (!own) { own = adds.shift(); if (!adds.length) return own; }
  let tail = own;
  while (tail.extra && typeof tail.extra === 'object') tail = tail.extra;
  for (const a of adds) { tail.extra = { x_mult: a.Xmult_mod, message: a.message }; tail = tail.extra; }
  if (!own._mod) Object.defineProperty(own, '_mod', { value: true, enumerable: false, configurable: true });
  return own;
}

export const hooks = {
  /** Bouncer: context.starting_shop, after the shop is stocked. */
  shop_stocked() { if (find('j_mf_bouncer').length) bouncers(); },
  /** Apple Friends: every evaluation's +Chips / +Mult X2 per copy. */
  eval_card_result(card, context, ret) {
    const n = find('j_mf_applefriends').length;
    if (!n) return;
    const bonus = Math.pow(2, n);
    apple_double(ret, bonus, false);
    if (ret.jokers) apple_double(ret.jokers, bonus, true);
    if (ret.edition) apple_double(ret.edition, bonus, false);
  },
  /** Gentlemelon: SMODS.showman (duplicates may appear). */
  pool_duplicates() { return has('j_mf_gentlemelon') ? true : undefined; },
  /** Joker Reacts: a Food joker stocked in the shop lies face down (unless Sword of Steven and Todd). */
  emplace(area, card) {
    if (card.mf_force_face_down && area === G.shop_jokers && !has('j_mf_sword_of_steven_and_todd')) { card.facing = 'back'; emit('card_changed', { card: card.sort_id }); }
  },
  /** Alchemy Joker's perpetual ability on any joker. */
  calculate_joker(card, ctx) { return card.ability && card.ability.mf_alchemy_hit_the_road ? alchemy_calculate(card, ctx) : undefined; },
  describe(card, desc) {
    const n = card.ability && card.ability.mf_alchemy_hit_the_road;
    const d = LOC.descriptions.Other.mf_alchemy_hit_the_road_perpetual;
    if (!n || !d) return;
    const x = alchemy_xmult();
    for (let i = 0; i < n; i++) desc.info = [...(desc.info || []), { key: 'mf_alchemy_hit_the_road_perpetual', name: '', lines: d.text.map((l) => l.replace('#1#', x)) }];
  },
  view_card(card, v) {
    if (card.config.center.key === 'j_mf_gemalert' && card.facing !== 'back') v.mod_stickers = [...(v.mod_stickers || []), { atlas: 'mf_jokers', pos: { x: 6, y: 18 } }];
  },
};
