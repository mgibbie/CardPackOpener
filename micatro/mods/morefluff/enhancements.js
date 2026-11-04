// More Fluff 1.9.9999 — the 8 enhancements of src/modifiers.lua (made by the 45 Degree Rotated Tarot cards).
// (1.9.9999 drops Gemstone's weight 4: it rolls at the default 5. Its other two, Power and Ransom Note, belong to
// the Halt / Ransom Note jokers and come with them.)
//   Monus  +10 Chips per level of the played hand      Cult     +1 Mult per level of the played hand
//   Styled gains a random Seal when drawn to hand       Brass    retriggers 2 more times; 1 in 3 to break
//   Teal   X1.5 Chips while held in hand                Gemstone +$3 when scored; no rank or suit; always scores
//   Marigold $1 at end of round (+$1 per other Marigold held)   Yucky 1 in 2 to break after scoring
// Steamodded seams used: a mod enhancement's calculate (main_scoring / repetition / destroy_card), the
// held-card end-of-round effect (end_of_round_effect hook), the hand_drawn context (mod `calculate` hook).
import { G, P_CENTERS, probability_vars, probability_roll, play_sound, juice_card } from '../../js/engine/core.js';
import { get_poker_hand_info } from '../../js/engine/run.js';
import { DATA, poll_seal } from './util.js';

const enh = (key, def = {}) => {
  const s = DATA.enhancements.find((e) => e.key === key);
  const { key: _k, fns: _f, ...rest } = s;
  return { ...JSON.parse(JSON.stringify(rest)), key: 'm_mf_' + key, set: 'Enhanced', name: 'm_mf_' + key, ...def }; // (SMODS: name = key)
};
const level = () => G.GAME.hands[get_poker_hand_info(G.play.cards).text].level;

export const centers = [
  enh('monus', {

    loc_vars: (s, iq, card) => ({ vars: [(card && card.ability && card.ability.per_level) ?? s.config.per_level] }),
    calculate: (s, card, ctx) => { if (ctx.main_scoring && ctx.cardarea === G.play) return { chips: card.ability.per_level * level() }; },
  }),
  enh('cult', {

    loc_vars: (s, iq, card) => ({ vars: [(card && card.ability && card.ability.per_level) ?? s.config.per_level] }),
    calculate: (s, card, ctx) => { if (ctx.main_scoring && ctx.cardarea === G.play) return { mult: card.ability.per_level * level() }; },
  }),
  enh('styled'),
  enh('brass', {

    loc_vars: (s, iq, card) => {
      const a = (card && card.ability) || s.config;
      const [n, d] = probability_vars(card, 1, a.chance ?? s.config.chance, 'brass_card');
      return { vars: [a.retriggers ?? s.config.retriggers, n, d] };
    },
    calculate(s, card, ctx) {
      if (ctx.repetition && ctx.cardarea === G.play) return { message: 'Again!', repetitions: card.ability.retriggers, card };
      if (ctx.destroy_card && ctx.destroying_card === card && probability_roll(card, 'brass_card', 1, card.ability.chance, 'brass_card')) return { remove: true };
    },
  }),
  enh('teal', {

    loc_vars: (s, iq, card) => ({ vars: [(card && card.ability && card.ability.h_x_chips) ?? s.config.h_x_chips] }),
    // SMODS reads config.h_x_chips for a held card: X1.5 Chips while this card stays in hand.
    calculate: (s, card, ctx) => { if (ctx.main_scoring && ctx.cardarea === G.hand) return { x_chips: card.ability.h_x_chips }; },
  }),
  enh('gemstone', {

    loc_vars: (s, iq, card) => ({ vars: [(card && card.ability && card.ability.p_dollars) ?? s.config.p_dollars] }),
  }),
  enh('marigold', {

    loc_vars: (s, iq, card) => ({ vars: [(card && card.ability && card.ability.cash) ?? s.config.cash] }),
  }),
  enh('yucky', {

    loc_vars: (s, iq, card) => { const [n, d] = probability_vars(card, 1, (card && card.ability && card.ability.chance) ?? s.config.chance, 'yucky_card'); return { vars: [n, d] }; },
    calculate(s, card, ctx) {
      if (ctx.destroy_card && ctx.destroying_card === card && probability_roll(card, 'yucky', 1, card.ability.chance, 'yucky_card')) return { remove: true };
    },
  }),
];

export const hooks = {
  /** Marigold: playing_card_end_of_round in hand -> $cash x (1 + other Marigold cards held). */
  end_of_round_effect(card, ret) {
    if (card.config.center.key !== 'm_mf_marigold') return;
    let c = 1;
    for (const other of G.hand.cards) if (other !== card && other.config.center_key === card.config.center_key) { c++; juice_card(other); }
    ret.h_dollars = (ret.h_dollars || 0) + card.ability.cash * c;
    ret.card = card;
  },
  /** Styled: a Styled card drawn to hand gains a random Seal (SMODS.poll_seal, guaranteed, 'styledcard'). */
  calculate(ctx) {
    if (!ctx.hand_drawn) return;
    for (const card of ctx.hand_drawn) {
      if (card.debuff || card.config.center.key !== 'm_mf_styled') continue;
      G.E_MANAGER.add_event(() => {
        card.set_seal(poll_seal({ guaranteed: true, type_key: 'styledcard' }), true);
        juice_card(card);
        play_sound('gold_seal', 1.2, 0.4);
      });
    }
  },
};
export const ENHANCEMENT_KEYS = centers.map((c) => c.key);
export { P_CENTERS };
