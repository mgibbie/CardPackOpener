/**
 * Scry — native rebuild of Pokermon's scry view (functions/uifunctions.lua
 * create/update/hide_scry_cardarea + the lovely "Scry Functionality" patches).
 *
 * G.GAME.scry_amount (Future deck +4, Natu/Xatu, ...) reveals the top N cards of the
 * deck (the next cards to be drawn). During scoring those cards are evaluated like an
 * extra "held" card area: jokers see `context.cardarea === G.scry_view` with
 * `context.individual` (Steamodded's playing_cards areas — the patch on smods utils.lua).
 *
 * Micatro difference: the Lua shows COPIES of the deck cards (temp cards re-synced every
 * frame). Here G.scry_view.cards are the real top-of-deck cards, computed on read — no
 * extra Card objects (so no sort_id churn, and spectators see the same thing). Effects
 * that would modify the temporary copy therefore modify the real card; no Pokermon joker
 * modifies scry cards, they only read them.
 *
 * The view exposes `areas.scry` (top first) while a round is being played.
 */
import { G } from '../../../js/engine/core.js';

export const scry_view = {
  name: 'scry',
  config: { type: 'scry', card_limit: 0 },
  get cards() {
    const n = (G.GAME && G.GAME.scry_amount) || 0;
    if (!n || !G.deck) return [];
    const out = [];
    for (let i = 1; i <= n; i++) {
      if (G.deck.cards.length + 1 <= i) break;
      out.push(G.deck.cards[G.deck.cards.length - i]); // Lua: deck[#deck + 1 - i] (top of the deck)
    }
    return out;
  },
};

/** Install G.scry_view for the run (start_run hook). */
export function install_scry() {
  G.GAME.scry_amount = G.GAME.scry_amount || 0;
  G.scry_view = scry_view;
}

/** scoring_areas hook: scry cards are scored like held cards. */
export function scoring_areas() {
  return G.GAME.scry_amount ? [scry_view] : undefined;
}

/** The scry area is visible during the round (hidden at round eval / in the shop). */
export function scry_visible() {
  const S = G.STATES;
  return !!G.GAME.scry_amount && [S.SELECTING_HAND, S.HAND_PLAYED, S.DRAW_TO_HAND].includes(G.STATE);
}
