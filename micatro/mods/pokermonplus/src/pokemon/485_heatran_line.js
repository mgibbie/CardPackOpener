// Pokermon+ 1.2.0 — src/pokemon/485_heatran_line.lua: Heatran (new).
//
// "Forge": every scored card permanently gains its modifiers' stats, then loses them (and gets the Forged sticker):
//   Bonus +30 Chips, Mult +4 Mult, Stone +50 Chips, Steel X0.5 held Mult, Gold +$3 held at end of round, Glass X1 Mult,
//   Flower (Pokermon's) X2 Mult, Lucky: 1 in 5 for +20 Mult and 1 in 15 for +$20 (rolled once, at the forge);
//   Foil +50 Chips, Holographic +10 Mult, Polychrome X0.5 Mult; Red Seal +1 retrigger, Gold Seal +$3 when scored.
// The stats are Steamodded's permanent card values (perma_bonus / perma_mult / perma_x_mult / perma_h_x_mult /
// perma_h_dollars / perma_p_dollars / perma_repetitions). The engine scores perma_bonus / perma_mult / perma_x_mult /
// perma_h_dollars itself; this mod's hooks add the other three (index.js: chip_h_x_mult, p_dollars, card_repetitions),
// with Steamodded's multiplicative_stacking for the held X Mult.
// (`(perma or 1) + n` in the Lua starts from Steamodded's 0 — every ability has perma_* = 0 — so it is `(perma || 0) + n`.)
import { G, P_CENTERS, pseudorandom, pseudoseed } from '../../../pokermon/api.js';
import { FORGED } from '../stakes.js';

const add = (card, k, n, start = 0) => { card.ability[k] = (card.ability[k] || start) + n; };
const ENHANCEMENT = {
  m_bonus: (c) => add(c, 'perma_bonus', 30),
  m_mult: (c) => add(c, 'perma_mult', 4),
  m_stone: (c) => add(c, 'perma_bonus', 50),
  m_steel: (c) => add(c, 'perma_h_x_mult', 0.5),
  m_gold: (c) => add(c, 'perma_h_dollars', 3),
  m_glass: (c) => add(c, 'perma_x_mult', 1),
  m_poke_flower: (c) => add(c, 'perma_x_mult', 2),
  m_lucky: (c) => {
    if (pseudorandom('heatran_lucky_mult') < 1 / 5) add(c, 'perma_mult', 20);
    if (pseudorandom('heatran_lucky_dollars') < 1 / 15) add(c, 'perma_p_dollars', 20);
  },
};
const EDITION = {
  e_foil: (c) => add(c, 'perma_bonus', 50),
  e_holo: (c) => add(c, 'perma_mult', 10),
  e_polychrome: (c) => add(c, 'perma_x_mult', 0.5),
};
const SEAL = {
  Red: (c) => add(c, 'perma_repetitions', 1),
  Gold: (c) => add(c, 'perma_p_dollars', 3),
};
const editionKey = (c) => (c.edition ? (c.edition.key || (c.edition.foil && 'e_foil') || (c.edition.holo && 'e_holo') || (c.edition.polychrome && 'e_polychrome')) : null);
const forge = (c) => { if (!c.ability[FORGED]) c.ability[FORGED] = true; };

export default {
  heatran: {
    loc_vars() { return { vars: [] }; },
    calculate(self, card, context) {
      if (!(context.individual && context.cardarea === G.play && context.scoring_hand)) return undefined;
      const target = context.other_card;
      if (!target) return undefined;
      const ck = target.config.center.key;
      if (ck !== 'c_base') {
        const effect = ENHANCEMENT[ck];
        if (effect) { effect(target); target.set_ability(P_CENTERS.c_base, null, true); forge(target); }
      }
      if (target.edition) {
        const effect = EDITION[editionKey(target)];
        if (effect) { effect(target); target.set_edition(null, true, true); forge(target); }
      }
      if (target.seal) {
        const effect = SEAL[target.seal];
        if (effect) { effect(target); target.set_seal(null, true); forge(target); }
      }
      return undefined;
    },
  },
};

// ------------------------------------------------------------------ the permanent values the engine doesn't score itself
/** SMODS.multiplicative_stacking(base, perma). */
export const multiplicative_stacking = (base, perma) => {
  const b = base !== 0 && base ? base : 1;
  const ret = b * (perma + 1);
  return ret === 1 ? 0 : ret > 0 ? ret : 0;
};
/** Card:get_chip_h_x_mult with perma_h_x_mult (hook chip_h_x_mult). */
export function perma_h_x_mult(v, card) {
  const p = card && card.ability && card.ability.perma_h_x_mult;
  if (!p || card.debuff) return undefined;
  return multiplicative_stacking(v || 1, p);
}
/** Card:get_p_dollars + perma_p_dollars (hook p_dollars). */
export function perma_p_dollars(v, card) {
  const p = card && card.ability && card.ability.perma_p_dollars;
  if (!p || card.debuff) return undefined;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + p;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return (v || 0) + p;
}
/** Steamodded better_calc: a card's perma_repetitions retrigger it like a seal (hook card_repetitions). */
export function perma_repetitions(card, context) {
  const p = card && card.ability && card.ability.perma_repetitions;
  if (!p || p <= 0 || card.debuff) return undefined;
  return { repetitions: p, card, message: 'Again!' };
}
export { pseudoseed };
