// Bunco — the play / discard rule changes and the extra scoring passes (lovely.toml + Bunco.lua):
//  * Cracker Cards (lovely "Cracker Cards 1/3-3/3" + calculate_cracker_cards, Bunco.lua ~8179): discarding
//    Cracker Cards plays them instead (a free hand: no hand used), and after that hand they are eaten
//    (destroyed) unless you have Hardtack. With Pica, a discard holding a Cracker plays every selected card.
//  * Magenta Dagger (lovely 1/5-5/5): a discard plays the cards instead, uses a discard (not a hand), and the
//    hand's score is SUBTRACTED from the round score.
//  * The Paling ($1 per discarded card), The Claw (discards shuffle back into the deck), The Swing (a discard
//    flips the hand), The Tine's played-rank tally, The Blade (scoring over 1.5X the blind scores nothing and
//    disables it), the hand_played tags (Chips / Mult before the blind's modify_hand, Megamult / Ultrachips at
//    the end of the hand).
//  * Copper Cards' re-score (Bunco.lua post_eval_card + SMODS.calculate_main_scoring wrap): once the played
//    cards have scored, each Copper that ends a streak of adjacent Coppers scores the whole streak again.
import { G, P_CENTERS, eval_card, ease_dollars, ease_discard, card_eval_status_text, emit, juice_card } from '../../js/engine/core.js';
import { calculate_context, mod_context_effect, play_cards_from_highlighted } from '../../js/engine/run.js';
import { find, forced_message, event, localize, play_sound } from './util.js';

const blind_is = (key) => G.GAME.blind && G.GAME.blind.name === key && !G.GAME.blind.disabled;
const is_cracker = (c) => c.config.center === P_CENTERS.m_bunc_cracker;

// ------------------------------------------------------------------ discards
function discard_begin() {
  // Cracker Cards 1/3: the Crackers (or, with Pica and a Cracker selected, every card) step out of the discard.
  G.hand.crackers_highlighted = [];
  const crackers_in_hand = G.hand.cards.some((c) => c.highlighted && is_cracker(c) && !c.debuff);
  for (const c of G.hand.cards.slice()) {
    if (c.highlighted && ((is_cracker(c) && !c.debuff) || (crackers_in_hand && find('j_bunc_pica').length > 0))) {
      G.hand.crackers_highlighted.push(c);
      G.hand.remove_from_highlighted(c, true);
    }
  }
  // Magenta Dagger 1/5: the discard is played instead (scoring negatively).
  if (blind_is('bl_bunc_final_dagger')) {
    G.GAME.blind.wiggle();
    G.GAME.blind.antiscore = true;
    play_cards_from_highlighted();
    return true;
  }
  // The Paling 2/2
  if (blind_is('bl_bunc_paling')) G.GAME.blind.wiggle();
  return undefined;
}
function rehighlight_crackers() {
  for (const c of G.hand.crackers_highlighted) {
    if (!c.highlighted) G.hand.add_to_highlighted(c, true);
    c.marked_cracker = true;
  }
}
export const hooks = {
  discard_begin,
  // The Paling 1/2: $1 per discarded card.
  discard_cards(cards, count) {
    if (!blind_is('bl_bunc_paling')) return;
    for (let i = 0; i < count; i++) {
      const c = cards[i];
      event(() => { if (c && !c.removed) juice_card(c); });
      ease_dollars(-1);
    }
  },
  // The Claw: discarded cards go back into the deck, which is reshuffled.
  discard_destination() {
    if (!blind_is('bl_bunc_claw')) return undefined;
    G.deck.shuffle('claw' + G.GAME.round_resets.ante);
    return G.deck;
  },
  discard_counted() {
    // Cracker Cards 2/3: the Crackers are played now (a free hand).
    if (G.hand.crackers_highlighted && G.hand.crackers_highlighted.length >= 1) {
      rehighlight_crackers();
      event(() => { G.GAME.ignore_hand_played = true; play_cards_from_highlighted(); });
      return true;
    }
    // The Swing 1/2: a discard flips the hand.
    if (blind_is('bl_bunc_swing')) {
      event(() => {
        for (const v of G.hand.cards) v.flip();
        G.GAME.blind.wiggle();
        G.GAME.blind.triggered = true;
        G.GAME.Swing = !(G.GAME.Swing === true);
      });
    }
    return undefined;
  },
  // Cracker Cards 3/3: only Crackers were discarded (or a hook discard took them): they are played, for a discard.
  discard_end() {
    if (!(G.hand.crackers_highlighted && G.hand.crackers_highlighted.length >= 1)) return undefined;
    ease_discard(-1);
    rehighlight_crackers();
    if (G.play.cards.length !== 0) {
      const hl = G.hand.highlighted.slice();
      hl.forEach((c) => {
        if (is_cracker(c)) {
          c.base.times_played += 1;
          c.ability.played_this_ante = true;
          G.GAME.round_scores.cards_played.amt += 1;
          event(() => { if (c.area === G.hand) { G.hand.remove_card(c); G.play.emplace(c); } });
        }
      });
    }
    event(() => { if (G.play.cards.length === 0) { G.GAME.ignore_hand_played = true; play_cards_from_highlighted(); } });
    return true;
  },
  // ------------------------------------------------------------------ plays
  // Magenta Dagger 2/5: a Cracker play uses no hand; a Dagger play uses a discard instead.
  consume_hand() {
    if (G.GAME.ignore_hand_played) { G.GAME.ignore_hand_played = undefined; return false; }
    if (G.GAME.blind && G.GAME.blind.antiscore) {
      ease_discard(-1);
      const hl = G.hand.highlighted;
      for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ pre_discard: true, full_hand: hl }));
      return false;
    }
    return undefined;
  },
  // Magenta Dagger 5/5: the score goes down.
  chips_scored: (total) => (G.GAME.blind && G.GAME.blind.antiscore ? -total : total),
  hand_scored(hand_chips, mult, ctx) {
    // Magenta Dagger 3/5
    if (G.GAME.blind && G.GAME.blind.antiscore) G.GAME.blind.antiscore = false;
    // The Tine 1/3: the played-rank tally (every scoring card, as the Lua's highlight loop)
    G.GAME.played_ranks = G.GAME.played_ranks || {};
    for (const c of ctx.scoring_hand || []) G.GAME.played_ranks[c.base.value] = (G.GAME.played_ranks[c.base.value] || 0) + 1;
    // calculate_cracker_cards: played Crackers marked by a discard are eaten (unless Hardtack).
    if (find('j_bunc_hardtack').length <= 0) {
      const eaten = [];
      for (const c of ctx.full_hand || []) {
        if (c.marked_cracker && is_cracker(c) && !c.debuff && !c.destroyed) {
          eaten.push(c);
          forced_message(localize('k_eaten_ex'), c);
          event(() => { if (c && !c.removed) { play_sound('bunc_cracker'); c.start_dissolve(); } });
          c.destroyed = true;
        }
      }
      if (eaten.length) for (const j of G.jokers.cards.slice()) eval_card(j, { cardarea: G.jokers, remove_playing_cards: true, removed: eaten });
    }
    // Copper: reset the re-score counters (its context.after)
    for (const c of ctx.scoring_hand || []) if (c.config.copper_rescored_times) c.config.copper_rescored_times = 0;
  },
  // Copper Cards: re-score a streak of adjacent Coppers once its last card has scored.
  rescore_cards(scoring_hand, ctx, score_card) {
    const copper = P_CENTERS.m_bunc_copper;
    scoring_hand.forEach((card, p) => {
      if (card.debuff || card.config.center !== copper) return;
      if ((card.config.copper_rescored_times || 0) >= copper.rescore_amount) return;
      const next = scoring_hand[p + 1], prev = scoring_hand[p - 1];
      if (next && next.config.center === copper && !next.debuff) return; // not the last in its streak
      if (!(prev && prev.config.center === copper && !prev.debuff)) return; // no streak
      let guard = 0;
      while ((card.config.copper_rescored_times || 0) < copper.rescore_amount && guard++ < 100) {
        const streak = [card];
        for (let i = 1; scoring_hand[p - i] && scoring_hand[p - i].config.center === copper && !scoring_hand[p - i].debuff; i++) streak.push(scoring_hand[p - i]);
        for (const c of streak) juice_card(c);
        emit('attention', { text: localize('bunc_repeat') });
        for (let k = streak.length - 1; k >= 0; k--) {
          const sc = streak[k];
          if (G.play.cards.includes(sc)) {
            sc.config.copper_rescored_times = (sc.config.copper_rescored_times || 0) + 1;
            score_card(sc);
          }
        }
        calculate_context({ rescore_cards: streak });
      }
    });
  },
  // ------------------------------------------------------------- scoring steps
  modify_scoring([hand_chips, mult], step, ctx) {
    if (step === 'before_blind') {
      // Edition tags 1/5: Chips / Mult Tags (hand_played, before)
      const score = { hand_chips, mult };
      for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'hand_played', before: true, score });
      return [score.hand_chips, score.mult];
    }
    if (step === 'end_scoring') {
      // The Blade (before the tags, as in the lovely order)
      if (blind_is('bl_bunc_blade')) {
        const overscore = G.GAME.blind.chips * 1.5;
        if (overscore < Math.floor(hand_chips * mult) + G.GAME.chips) {
          mult = 0; hand_chips = 0;
          event(() => G.GAME.blind.disable());
          emit('attention', { text: localize('bunc_exceeded_score') });
          emit('hand_text', { chips: 0, mult: 0 });
        }
      }
      // Edition tags 2/5: Megamult / Ultrachips Tags (hand_played, after)
      const score = { hand_chips, mult };
      for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'hand_played', after: true, score });
      return [score.hand_chips, score.mult];
    }
    return undefined;
  },
};
export const centers = [];
export { card_eval_status_text };
