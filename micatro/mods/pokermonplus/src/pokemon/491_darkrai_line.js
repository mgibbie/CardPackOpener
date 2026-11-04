// Pokermon+ 1.2.0 — src/pokemon/491_darkrai_line.lua: Darkrai, Mega Darkrai.
//
// Darkrai (reworked in 1.2.0): it brings a Nightmare when it joins (1.0.3: one after every Boss Blind), and every Energy
// card you HOLD counts as applied to each joker of its type (times the Darkrai you have), without moving the Energy count
// or the limit. Each joker remembers how many it got (`darkrai_ecount`) and is energized by the difference whenever Darkrai
// calculates; selling Darkrai takes it all back.
// Mega Darkrai (new, a Mega Stone on Darkrai): each held Energy card gives X(Xmult_multi) Mult per joker of its type.
//
// Micatro shapes:
//  - A base-game joker's `extra` may be a number (Hiker) or nil: the Lua indexed / replaced it (a crash, or a joker that lost
//    its own numbers). Its count lives on `ability.sonfive_darkrai_ecount` there; `extra` is left alone.
//  - remove_from_deck: the Lua cleared `extra.darkrai_ecount` on every joker even when `extra` was nil (a crash). Only the
//    jokers that have a count are touched.
//  - The 1.0.3 Nightmare after each Boss Blind is gone with the rework; the Void deck no longer gives one either (backs.js).
import { G, P_CENTERS, localize, create_card, card_eval_status_text, find_card, is_type, get_type, find_pokemon_type } from '../../../pokermon/api.js';
import { energize_amount, is_energizable } from '../functions.js';

const isTable = (x) => x !== null && typeof x === 'object';
const isEnergy = (c) => c && c.ability && (c.ability.set === 'Energy' || c.ability.set === 'poke_energy');
const etypeOf = (c) => c.config.center.etype;
const getCount = (j) => (isTable(j.ability.extra) ? j.ability.extra.darkrai_ecount : j.ability.sonfive_darkrai_ecount) || 0;
function setCount(j, n) {
  if (isTable(j.ability.extra)) j.ability.extra.darkrai_ecount = n;
  else j.ability.sonfive_darkrai_ecount = n;
}

/** add_to_deck: a Nightmare if there is room (not from a debuff). */
function give_nightmare() {
  if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit && P_CENTERS.c_poke_nightmare) {
    const _card = create_card('Spectral', G.consumeables, null, null, null, null, 'c_poke_nightmare');
    _card.add_to_deck();
    G.consumeables.emplace(_card);
    card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
  }
}

/** Re-sync every joker to the held Energy of its type (Darkrai's calculate, any context). */
export function darkrai_sync() {
  if (!G.consumeables || !G.jokers) return;
  const darkrai_count = find_card('j_sonfive_darkrai').length;
  const energies = G.consumeables.cards.filter(isEnergy);
  for (const joker of G.jokers.cards) {
    let curr = 0;
    for (const e of energies) if (is_type(joker, etypeOf(e))) curr += darkrai_count;
    const prev = getCount(joker);
    if (curr !== prev && is_energizable(joker)) {
      energize_amount(joker, get_type(joker), curr - prev, true);
      setCount(joker, curr);
    }
  }
}

export default {
  darkrai: {
    loc_vars(self, info_queue) {
      info_queue.push({ set: 'Spectral', key: 'c_poke_nightmare' });
      return { vars: [] };
    },
    add_to_deck(self, card, from_debuff) { if (!from_debuff) give_nightmare(); },
    calculate(self, card, context) {
      if (!context.blueprint && G.consumeables) darkrai_sync();
      return undefined;
    },
    remove_from_deck() {
      for (const joker of G.jokers.cards) {
        const n = getCount(joker);
        if (!n) continue;
        energize_amount(joker, get_type(joker), -n, true);
        setCount(joker, 0);
      }
    },
  },

  mega_darkrai: {
    loc_vars(self, info_queue, card) { return { vars: [card.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      if (context.other_consumeable && isEnergy(context.other_consumeable)) {
        const Xmult = find_pokemon_type(etypeOf(context.other_consumeable)).length * card.ability.extra.Xmult_multi;
        if (Xmult > 1) return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'XMULT', Xmult_mod: Xmult, message_card: context.other_consumeable };
      }
      return undefined;
    },
  },
};
