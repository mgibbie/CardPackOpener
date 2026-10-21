/**
 * More Fluff 1.9.9999 — the Planeswalker loyalty system (src/planeswalker.lua) and the two walkers with real art:
 * Jimbo, the Mind Sculptor and John Balatro? (+ the hidden John Balatro she unleashes). Triangle, Planeswalker is a
 * "wip" sketch upstream: not ported.
 *
 * A walker carries ability.extra.loyalty and its center lists `planeswalker_costs`; each cost is an ability button on
 * the joker (view_card mod_actions -> the 'mf_loyalty' action). can_loyalty: nothing in play, the loyalty can pay the
 * cost (loyalty + cost >= 0), a use left this round (`uses`, back to 1 when a Blind is selected: FLUFF.calculate's
 * setting_blind) and the walker's own can_loyalty. Activating: its loyalty(card, i), one use spent, loyalty += cost.
 * The loyalty is drawn on the card from mf_loyalty.png (the walker_loyalty DrawStep: a shield, then one digit for
 * 0-9, two for 10-99, "99+" above), as view_card mod_stickers.
 *
 *   Mind Sculptor  +2 draw a card / 0 draw four, then the three leftmost hand cards go back into the deck (shuffled) /
 *                  -1 shuffle the whole hand into the deck / -12 destroy every card left in the deck
 *   John Balatro?  +1 exactly five selected cards with no Mult bonus get +4 Mult (perma_mult) / -11 becomes John
 *                  Balatro (^2 Mult before scoring: initial_scoring_step, jokers_c.js modify_scoring)
 */
import { G, P_CENTERS, localize, play_sound, draw_card, juice_card } from '../../js/engine/core.js';
import { draw_from_deck_to_hand, STATES } from '../../js/engine/run.js';
import { joker, destroy_cards } from './util.js';

export const centers = [];
const J = (slug, def) => centers.push(joker(slug, def));
const explainer = (n) => ({ key: 'planeswalker_explainer', set: 'Other', vars: [n] });

/** is_planeswalker(joker) */
export const is_planeswalker = (card) => !!(card && card.config && card.config.center && (typeof card.config.center.planeswalker === 'function' ? card.config.center.planeswalker(card) : card.config.center.planeswalker === true));
const costs = (card) => { const c = card.config.center.planeswalker_costs; return typeof c === 'function' ? c(card) : Array.isArray(c) ? c : []; };

/** can_loyalty(joker, ability_number) — 1-based, as the Lua. */
export function can_loyalty(card, i) {
  if ((G.play && G.play.cards.length > 0) || (G.GAME.STOP_USE && G.GAME.STOP_USE > 0)) return false;
  const center = card.config.center, cost = costs(card)[i - 1];
  if (cost === undefined) return false;
  const can_pay = typeof cost === 'number' ? cost + card.ability.extra.loyalty >= 0 : true;
  return can_pay && (card.ability.extra.uses !== 0 || !center.default_loyalty_effects) && !!center.can_loyalty(card, i);
}
/** loyalty(joker, ability_number) */
export function loyalty(card, i) {
  const center = card.config.center;
  center.loyalty(card, i);
  if (center.default_loyalty_effects) {
    card.ability.extra.uses = card.ability.extra.uses - 1;
    const cost = costs(card)[i - 1];
    if (typeof cost === 'number') card.ability.extra.loyalty = card.ability.extra.loyalty + cost;
  }
}

// ------------------------------------------------------------------ Jimbo, the Mind Sculptor
J('mindsculptor', {
  loc_vars(s, iq) { iq.push(explainer(3)); return { vars: [] }; },
  calculate() {},
  can_loyalty(card, i) {
    if (i >= 1 && i <= 3) return G.hand.cards.length > 0;
    return i === 4;
  },
  loyalty(card, i) {
    if (i === 1) draw_from_deck_to_hand(1);
    else if (i === 2) {
      draw_from_deck_to_hand(4);
      for (let k = 1; k <= 3; k++) draw_card(G.hand, G.deck, k * 100 / 3, 'down', null, null, 0.08);
      G.deck.shuffle('jace' + G.GAME.round_resets.ante);
    } else if (i === 3) {
      const n = G.hand.cards.length;
      for (let k = 1; k <= n; k++) draw_card(G.hand, G.deck, k * 100 / n, 'down', null, null, 0.08);
      G.deck.shuffle('jace' + G.GAME.round_resets.ante);
    } else if (i === 4) {
      destroy_cards(G.deck.cards.slice());
    }
  },
});

// ------------------------------------------------------------------ John Balatro?
J('johnbalatro', {
  loc_vars(s, iq) { iq.push(explainer(1)); return { vars: [] }; },
  calculate() {},
  can_loyalty(card, i) {
    if (i === 1) return G.hand.highlighted.length === 5 && G.hand.highlighted.every((c) => (c.ability.perma_mult || 0) === 0);
    return i === 2;
  },
  loyalty(card, i) {
    if (i === 1) {
      const hl = G.hand.highlighted.slice();
      hl.forEach((c, k) => {
        c.ability.perma_mult = (c.ability.perma_mult || 0) + 4;
        const percent = 0.85 + (k + 1 - 0.999) / (hl.length - 0.998) * 0.3;
        G.E_MANAGER.add_event(() => { play_sound('multhit1', percent, 0.6); juice_card(c); });
      });
    } else if (i === 2) {
      card.set_ability(P_CENTERS.j_mf_johnbalatrotrue);
      play_sound('mf_treethree');
      juice_card(card);
      G.jokers.unhighlight_all();
    }
  },
});
// John Balatro (unleashed; never offered: superlegendary rarity, no_collection)
J('johnbalatrotrue', {
  calculate(s, card, ctx) {
    // (non-Talisman: mult = mult ^ 2 in a pre_func; applied by jokers_c.js's modify_scoring 'before_cards')
    if (ctx.initial_scoring_step) return { mf_square_mult: true, message: '^2 Mult', colour: 'DARK_EDITION' };
  },
});

/** The loyalty counter's cells on mf_loyalty.png (the walker_loyalty DrawStep). */
function loyalty_cells(n) {
  const out = [{ x: 0, y: 3 }];
  if (n > 99) out.push({ x: 1, y: 3 });
  else if (n <= 9) out.push({ x: Math.max(0, n), y: 0 });
  else { out.push({ x: Math.floor(n / 10), y: 1 }); out.push({ x: n % 10, y: 2 }); }
  return out;
}

export const hooks = {
  /** FLUFF.calculate setting_blind (the engine's new_round hook, as the Blind is set): every default-effects walker
   *  gets its use back. */
  new_round() {
    for (const j of G.jokers.cards) if (is_planeswalker(j) && j.config.center.default_loyalty_effects) j.ability.extra.uses = 1;
  },
  /** The 'mf_loyalty' action {id, idx}: activate a walker's ability (idx 1-based). */
  action(a) {
    if (a.type !== 'mf_loyalty') return undefined;
    const card = G.jokers.cards.find((c) => c.sort_id === a.id);
    if (!card || card.debuff || !is_planeswalker(card)) return 'no Planeswalker';
    if (!can_loyalty(card, a.idx)) return 'cannot use that ability now';
    loyalty(card, a.idx);
    return true;
  },
  view_card(card, v) {
    if (!is_planeswalker(card) || card.facing === 'back') return;
    v.mod_stickers = [...(v.mod_stickers || []), ...loyalty_cells(card.ability.extra.loyalty).map((pos) => ({ atlas: 'mf_loyalty', pos }))];
    if (card.area !== G.jokers || card.debuff) return;
    v.mod_actions = [...(v.mod_actions || []), ...costs(card).map((cost, k) => ({
      label: typeof cost === 'number' && cost > 0 ? '+' + cost : '' + cost,
      action: { type: 'mf_loyalty', id: card.sort_id, idx: k + 1 },
      disabled: !can_loyalty(card, k + 1),
    }))];
  },
};
export { STATES };
