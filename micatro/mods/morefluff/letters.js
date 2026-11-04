/**
 * More Fluff 1.9.9999 — batch B2: the hidden pools with real art. src/jokers/lettergem_a..z.lua (the 26 Letter jokers,
 * rarity "Letter", mf_letterjokers.png) and the 3 Purple jokers (aura_farm, crad_shuffler, purple_economy_joker; the
 * "Scrapped" rarity, mf_purple.png).
 *
 * WHERE THEY COME FROM: in 1.9.9999 only FLUFF.get_hidden_rarity() rolls these rarities — the Old Deck (its Buffoon
 * packs add two hidden-rarity jokers) and Bonus Sheet. Both stay out of this port (the Old Deck's other 32 "Old Fluff"
 * jokers and Bonus Sheet are placeholder sketches), and the rarities weigh 0. So, as upstream without those two, these
 * jokers are registered (with their behaviour and art: old saves / replays / a later Old Deck batch load them) but never
 * offered; F (a Letter joker that makes Letter jokers) is the only in-pool way to one, and F is a Letter joker itself.
 *
 * Seams (js/engine): straight_min (I: SMODS.four_fingers), check_enhancement + quantum_enhancements (L), the
 * probability contexts mod_probability / fix_probability (L, O), post_trigger (J: run.js joker_retriggers, opt-in by
 * optional_features.post_trigger), modify_scoring_hand (U: More Fluff's smods_seams), hand_drawn (T), eval_card_result
 * (X: its SMODS.calculate_individual_effect wrap on every XMult), the blind-size effect (P: SMODS.mod_blind_size),
 * held_cards_scored + G.scoring.score_played (crad shuffler: the bottom three deck cards also score), shuffled (Purple
 * Economy Joker: context.mf_deck_shuffled), the prepared-card system (prepared.js: Aura Farm), describe (the D / G / Z
 * tooltip pictures: lettergem_destroy / lettergem_g, animated, as their generate_ui draws them).
 *
 * Port notes: N's text names "j_vremade_joker" (an unlocalized key upstream): shown as "Joker". Letter tiles are 71 x 78
 * (display_size h 78): staged centred in a 71 x 95 cell (mf_letterjokers_b.png), not stretched. Their "Lettergem"
 * badge (lettergem_badge) is the Letter rarity's badge here. E / G's sounds: G's riff is registered (mf_g_riff).
 */
import {
  G, P_CENTERS, localize, emit, card_eval_status_text, pseudoshuffle, pseudoseed, ease_round, has_quantum_enhancement,
  number_format, play_sound, ease_dollars,
} from '../../js/engine/core.js';
import * as BN from '../../js/engine/bignum.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { add_booster_to_shop, draw_from_deck_to_hand } from '../../js/engine/run.js';
import { scale_card } from '../../js/engine/smods.js';
import { joker, find, has, say, destroy_cards, add_card, ART } from './util.js';

export const centers = [];
const J = (slug, def) => centers.push({ ...joker(slug, def), atlas: slug.startsWith('lettergem_') ? 'mf_letterjokers_b' : 'mf_purple' });
const L = (ch, def) => J('lettergem_' + ch, def);
const eor_main = (ctx) => ctx.end_of_round && ctx.main_eval && !ctx.individual && !ctx.repetition;
const room = () => G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit;
const not_eternal = (c) => !c.ability.eternal;
/** SMODS.mod_blind_size({mult}): the current blind's chips times `mult`, with its popup. */
export function mod_blind_size(mult, card) {
  if (mult === 1 || !G.GAME.blind) return;
  G.GAME.blind.chips = BN.mul(G.GAME.blind.chips, mult);
  G.GAME.blind.chip_text = number_format(G.GAME.blind.chips);
  emit('blind', { action: 'chips', chips: G.GAME.blind.chips, chip_text: G.GAME.blind.chip_text });
  if (card) card_eval_status_text(card, 'extra', null, null, null, { message: 'X' + mult + ' Blind Size', colour: 'PURPLE' });
}
const is_wild = (c) => c.config.center.key === 'm_wild' || has_quantum_enhancement(c, 'm_wild');

// A: played Aces +2 Mult and retriggered
L('a', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.get_id() === 14) return { mult: card.ability.extra.mult };
    if (ctx.repetition && ctx.cardarea === G.play && ctx.other_card.get_id() === 14) return { repetitions: 1 };
  },
});
// B: a $7 Buffoon Pack in each shop (once a round: `triggered`, cleared at the end of the round)
L('b', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.cost] }),
  calculate(s, card, ctx) { if (ctx.end_of_round) card.ability.triggered = undefined; },
});
function letter_b_shop() {
  for (const card of find('j_mf_lettergem_b')) {
    if (card.ability.triggered) continue;
    card.ability.triggered = true;
    const pack = add_booster_to_shop('p_buffoon_normal_1');
    pack.base_cost = card.ability.extra.cost;
    pack.set_cost();
  }
}
// C: X5 Mult for every 100 chips' worth of scored cards
L('c', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult, card.ability.extra.counter] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && !ctx.blueprint) {
      const o = ctx.other_card;
      // (the Lua adds the JOKER's perma_bonus — 0 — to a Stone card's 50)
      card.ability.extra.counter += o.ability && o.ability.effect === 'Stone Card' ? 50 + (card.ability.perma_bonus || 0) : o.base.nominal + (o.ability.perma_bonus || 0);
      let n = 0;
      while (card.ability.extra.counter >= 100) { card.ability.extra.counter -= 100; n++; }
      if (n) return { x_mult: Math.pow(card.ability.extra.xmult, n) }; // (SMODS.merge_effects of n X5s)
    }
  },
});
// D: at the end of each round, destroy 2 random playing cards
L('d', {
  calculate(s, card, ctx) {
    if (eor_main(ctx)) {
      const cards = G.playing_cards.filter(not_eternal);
      pseudoshuffle(cards, pseudoseed('letter_d'));
      for (const c of cards.slice(0, card.ability.extra.cards_per_round)) { if (c.area) c.area.remove_card(c); destroy_cards([c]); }
    }
  },
});
// E: ^1.4 Mult
L('e', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.emult] }),
  calculate(s, card, ctx) {
    if (ctx.cardarea === G.jokers && ctx.joker_main) return { emult: card.ability.extra.emult, message: '^' + card.ability.extra.emult + ' Mult', colour: 'DARK_EDITION' };
  },
});
// F: a Letter joker when a Blind is selected (must have room)
L('f', {
  loc_vars: () => ({ vars: [], colours: ['#a9683b'] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && room()) {
      const n = Math.min(1, G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer));
      G.GAME.joker_buffer += n;
      G.E_MANAGER.add_event(() => { for (let i = 0; i < n; i++) { add_card({ set: 'Joker', rarity: 'mf_letter' }); G.GAME.joker_buffer = 0; } });
      return { message: localize('k_plus_joker'), colour: '#a9683b' };
    }
  },
});
// G: "G" (X1.01 Mult per scored card, with its riff)
L('g', {
  calculate(s, card, ctx) {
    if (ctx.setting_blind) return { message: 'G', colour: 'DARK_EDITION', sound: 'mf_g_riff' };
    if (ctx.individual && ctx.cardarea === G.play) return { message: 'G', colour: 'DARK_EDITION', remove_default_message: true, x_mult: card.ability.extra.xmult, sound: 'mf_g_riff' };
  },
});
// H: retrigger every scoring card but the first
L('h', {
  calculate(s, card, ctx) {
    if (ctx.repetition && ctx.cardarea === G.play && ctx.scoring_hand && ctx.other_card !== ctx.scoring_hand[0]) return { repetitions: 1 };
  },
});
// I: Straights need two fewer cards (the straight_min hook); X2 Mult with a five-card Straight
L('i', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.straight_mult] }),
  calculate(s, card, ctx) {
    if (ctx.joker_main && ctx.poker_hands && (ctx.poker_hands.Straight || []).some((h) => h.length >= 5)) return { xmult: card.ability.extra.straight_mult };
  },
});
// J: retriggers the two jokers to its right; -$0.5 each time they trigger (post_trigger)
const j_targets = (card, other) => { const i = G.jokers.cards.indexOf(card); return i >= 0 && (G.jokers.cards[i + 1] === other || G.jokers.cards[i + 2] === other); };
L('j', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.money_per] }),
  calculate(s, card, ctx) {
    if (ctx.retrigger_joker_check && j_targets(card, ctx.other_card)) return { repetitions: 1 };
    if (ctx.post_trigger && j_targets(card, ctx.other_card)) return { dollars: -card.ability.extra.money_per };
  },
});
// K: a Negative Cavendish when a Blind is selected, 500X likelier to die (1 in 2)
L('k', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.odds] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind) {
      const c = add_card({ set: 'Joker', key: 'j_cavendish', edition: 'e_negative' });
      c.ability.extra.odds = Math.floor(c.ability.extra.odds / card.ability.extra.odds);
      return { message: localize('k_plus_joker'), colour: 'BLUE' };
    }
  },
});
// L: the first played card is also Lucky (quantum enhancement), its chances X3
L('l', {
  quantum_enhancements: true,
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.odds] }),
  calculate(s, card, ctx) {
    if (ctx.check_enhancement && G.play.cards.length > 0 && ctx.other_card === G.play.cards[0]) return { m_lucky: true };
    if (ctx.mod_probability && G.play.cards.length > 0 && ctx.trigger_obj === G.play.cards[0]) return { numerator: ctx.numerator * card.ability.extra.odds, denominator: ctx.denominator };
  },
});
// M: a Jolly Joker with +$3 sell value when a Blind is selected (must have room)
L('m', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.price] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && room()) {
      const n = Math.min(1, G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer));
      G.GAME.joker_buffer += n;
      G.E_MANAGER.add_event(() => {
        for (let i = 0; i < n; i++) {
          const c = add_card({ set: 'Joker', key: 'j_jolly' });
          c.ability.extra_value = (c.ability.extra_value || 0) + card.ability.extra.price;
          c.set_cost();
          G.GAME.joker_buffer = 0;
        }
      });
      return { message: localize('k_plus_joker'), colour: 'BLUE' };
    }
  },
});
// N: a Negative Joker when a Boss Blind is selected
L('n', {
  calculate(s, card, ctx) {
    if (ctx.setting_blind && ctx.blind && ctx.blind.boss) {
      add_card({ set: 'Joker', key: 'j_joker', edition: 'e_negative' });
      return { message: localize('k_plus_joker'), colour: 'BLUE' };
    }
  },
});
// O: every probability is 1 in 2
L('o', { calculate(s, card, ctx) { if (ctx.fix_probability) return { numerator: 1, denominator: 2 }; } });
// P: when a Blind is selected, X0.9 its size per Ante
L('p', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.per_ante, Math.pow(card.ability.extra.per_ante, (G.GAME && G.GAME.round_resets.ante) || 1)] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && !card.getting_sliced && G.GAME.round_resets.ante >= 0) {
      for (let i = 0; i < G.GAME.round_resets.ante; i++) mod_blind_size(card.ability.extra.per_ante, ctx.blueprint_card || card);
    }
  },
});
// Q: cards held next to a held Queen give X1.3 Mult
L('q', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.xmult] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.hand && !ctx.end_of_round) {
      if (ctx.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED' };
      const h = G.hand.cards;
      for (let i = 0; i < h.length; i++) if (h[i].get_id() === 12 && (h[i - 1] === ctx.other_card || h[i + 1] === ctx.other_card)) return { x_mult: card.ability.extra.xmult };
    }
  },
});
// R: +1 Round when a Blind is selected; +1 Mult per Round
L('r', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.rounds_per, card.ability.extra.mult_per, card.ability.extra.mult_per * ((G.GAME && G.GAME.round) || 0)] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind) {
      G.E_MANAGER.add_event(() => ease_round(card.ability.extra.rounds_per));
      return { message: localize({ type: 'variable', key: 'a_plus_rounds', vars: [card.ability.extra.rounds_per] }) };
    }
    if (ctx.joker_main) return { mult: card.ability.extra.mult_per * (G.GAME.round || 0) };
  },
});
// S: scored and held 6s and 7s give +6 Chips and +7 Mult
L('s', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.individual && !ctx.end_of_round && (ctx.cardarea === G.play || ctx.cardarea === G.hand) && [6, 7].includes(ctx.other_card.get_id())) {
      return { chips: card.ability.extra.chips, mult: card.ability.extra.mult };
    }
  },
});
// T: draw another card for each Wild Card drawn (hand_drawn; the extra draws are other_drawn: they chain)
function letter_t_draw(drawn) {
  const n = drawn.filter(is_wild).length * find('j_mf_lettergem_t').length;
  if (!n) return;
  draw_from_deck_to_hand(n);
  G.E_MANAGER.add_event(() => { const more = (G.drawn_cards || []).slice(); G.drawn_cards = []; letter_t_draw(more); });
}
L('t', {
  calculate(s, card, ctx) {
    if (ctx.hand_drawn && card === find('j_mf_lettergem_t')[0]) letter_t_draw(ctx.hand_drawn); // (every copy draws: counted once here)
  },
});
// U: played cards don't score; +13 Mult for each (non-debuffed) played card
L('u', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.mult] }),
  calculate(s, card, ctx) {
    if (ctx.modify_scoring_hand && !ctx.blueprint) return { remove_from_hand: true };
    if (ctx.joker_main) {
      const n = G.play.cards.filter((c) => !c.debuff).length;
      if (n) return { mult: card.ability.extra.mult * n }; // (SMODS.merge_effects of n +13s, one popup here)
    }
  },
});
// V: a Voucher Tag whenever a card is bought
L('v', {
  calculate(s, card, ctx) {
    if (ctx.buying_card) G.E_MANAGER.add_event(() => { add_tag(new Tag('tag_voucher')); play_sound('generic1', 0.95, 0.8); play_sound('holo1', 1.25, 0.4); });
  },
});
// W: a Wheel of Fortune (1 in 5) when a Blind is selected (must have room)
L('w', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.odds] }),
  calculate(s, card, ctx) {
    if (ctx.setting_blind && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      G.GAME.consumeable_buffer += 1;
      G.E_MANAGER.add_event(() => {
        G.E_MANAGER.add_event(() => {
          const c = add_card({ key: 'c_wheel_of_fortune' });
          c.ability.extra = Math.floor(c.ability.extra / card.ability.extra.odds);
          G.GAME.consumeable_buffer = 0;
        });
        say(ctx.blueprint_card || card, localize('k_plus_tarot'), 'PURPLE');
      });
    }
  },
});
// X: every XMult trigger gets +X(current), which grows +0.02 a trigger (eval_card_result below)
L('x', { loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.current_increase, card.ability.extra.scale_increase] }), calculate() {} });
const XKEYS = ['x_mult', 'xmult', 'Xmult', 'x_mult_mod', 'Xmult_mod'];
function letter_x(eff, xs, depth = 0) {
  if (!eff || typeof eff !== 'object' || depth > 20) return;
  for (const k of XKEYS) {
    if (typeof eff[k] !== 'number') continue;
    let bonus = 0;
    for (const x of xs) {
      scale_card(x, { ref_table: x.ability.extra, ref_value: 'current_increase', scalar_value: 'scale_increase' });
      bonus += x.ability.extra.current_increase;
    }
    eff[k] = eff[k] + bonus;
    if ((k === 'x_mult_mod' || k === 'Xmult_mod') && eff.message) eff.message = localize({ type: 'variable', key: 'a_xmult', vars: [eff[k]] });
  }
  letter_x(eff.extra, xs, depth + 1);
}
// Y: $10 for every 13 cards scored
L('y', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.dollars, card.ability.extra.card_total, card.ability.extra.cards_scored] }),
  calculate(s, card, ctx) {
    if (ctx.individual && ctx.cardarea === G.play && !ctx.blueprint) {
      card.ability.extra.cards_scored += 1;
      let d = 0;
      while (card.ability.extra.cards_scored >= card.ability.extra.card_total) { card.ability.extra.cards_scored -= card.ability.extra.card_total; d += card.ability.extra.dollars; }
      if (d) return { dollars: d };
    }
  },
});
// Z: prevents death — and destroys 13 playing cards (needs 13)
L('z', {
  calculate(s, card, ctx) {
    if (ctx.end_of_round && ctx.game_over && ctx.main_eval && G.playing_cards.length >= 13) {
      play_sound('tarot1');
      const cards = G.playing_cards.filter(not_eternal);
      pseudoshuffle(cards, pseudoseed('letter_z'));
      for (const c of cards.slice(0, 13)) { if (c.area) c.area.remove_card(c); destroy_cards([c]); }
      return { message: localize('k_saved_ex'), saved: 'k_zenith', colour: 'RED' };
    }
  },
});

// ------------------------------------------------------------------ the 3 Purple jokers
// Aura Farm: held Tarot cards also have Aura as a prepared consumable, prepared from the start (prepared.js)
J('aura_farm', { loc_vars(s, iq) { iq.push(P_CENTERS.c_aura); return { vars: [] }; }, calculate() {} });
// crad shuffler: the bottom three deck cards also score; discarding shuffles the deck
J('crad_shuffler', {
  calculate(s, card, ctx) {
    if (ctx.discard && !ctx.blueprint) {
      G.E_MANAGER.add_event(() => G.deck.shuffle());
      return { message: localize('k_shuffled_ex'), colour: 'PURPLE' };
    }
  },
});
/** context.mf_add_to_hand (lovely/adding_to_hand.toml): each crad shuffler adds the 3 bottom-most deck cards not yet added. */
export function crad_deck_hand() {
  const out = [];
  for (const card of find('j_mf_crad_shuffler')) {
    for (let i = 0; i < 3; i++) { const c = G.deck.cards.find((o) => !o.mf_added_to_hand); if (c) { c.mf_added_to_hand = true; out.push(c); } }
  }
  for (const c of out) c.mf_added_to_hand = false;
  return out;
}
// Purple Economy Joker: $2 whenever the deck is shuffled
J('purple_economy_joker', {
  loc_vars: (s, iq, card) => ({ vars: [card.ability.extra.dollars] }),
  calculate(s, card, ctx) {
    if (ctx.mf_deck_shuffled) return { dollars: card.ability.extra.dollars };
    // (lovely/ourple.toml: opening a pack that draws a hand "shuffles" — the order is put back — so it pays too)
    if (ctx.open_booster && ctx.card && ctx.card.config.center.draw_hand && card === find('j_mf_purple_economy_joker')[0]) {
      const keep = G.deck.cards.slice();
      G.deck.shuffle();
      G.deck.cards = keep; G.deck.set_ranks();
    }
  },
});

// The tooltip pictures (generate_ui): D's first line and G's are the animated "Destroy" / "G"; Z's second line is "Destroy".
const PIC_DESTROY = { src: ART + 'lettergem_destroy_b.png', w: 259, h: 79, frames: 5, fps: 10 };
const PIC_G = { src: ART + 'lettergem_g_b.png', w: 76, h: 92, frames: 5, fps: 10 };
const PICS = { j_mf_lettergem_d: [0, PIC_DESTROY], j_mf_lettergem_g: [0, PIC_G], j_mf_lettergem_z: [1, PIC_DESTROY] };

export const hooks = {
  /** I: SMODS.four_fingers('straight') - 2 (at least 1). */
  straight_min(n) { return has('j_mf_lettergem_i') ? Math.max(1, n - 2) : n; },
  /** B: context.starting_shop. */
  shop_stocked() { if (find('j_mf_lettergem_b').length) letter_b_shop(); },
  /** X: XMult amounts. */
  eval_card_result(card, context, ret) {
    const xs = find('j_mf_lettergem_x');
    if (!xs.length) return;
    letter_x(ret, xs);
    if (ret.jokers) letter_x(ret.jokers, xs);
    if (ret.edition) letter_x(ret.edition, xs);
  },
  /** crad shuffler: the bottom three deck cards score as played cards (SMODS.calculate_main_scoring, cardarea G.play). */
  held_cards_scored() {
    if (!find('j_mf_crad_shuffler').length || !G.scoring) return;
    for (const c of crad_deck_hand()) G.scoring.score_played(c);
  },
  /** Purple Economy Joker: CardArea:shuffle on the deck -> context.mf_deck_shuffled. */
  shuffled(area) {
    if (area !== G.deck || !find('j_mf_purple_economy_joker').length) return;
    for (const j of find('j_mf_purple_economy_joker')) {
      const eff = j.calculate_joker({ mf_deck_shuffled: true });
      if (eff && eff.dollars) { ease_dollars(eff.dollars); card_eval_status_text(j, 'dollars', eff.dollars); }
    }
  },
  describe(card, desc) {
    const p = PICS[card.config && card.config.center && card.config.center.key];
    if (p) desc.imgs = [...(desc.imgs || []), { at: p[0], ...p[1] }];
  },
};
// (N's text names an unlocalized key upstream; the loc fix is applied in index.js)
export const LOC_FIX = { j_mf_lettergem_n: { from: 'j_vremade_joker{}*', to: 'Joker{}' } };
