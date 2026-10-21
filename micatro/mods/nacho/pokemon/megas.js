// Nacho's Pokermon Dip 1.7.9 — src/pokemon/megas/: Mega Gardevoir (282_1), Mega Altaria (334_1), Mega Gallade (475_1).
// 1.7.9 RE-KEYS them into Pokermon's namespace (`nacho_inject_prefix = "poke"`): j_poke_mega_gardevoir / _altaria / _gallade,
// registered by Nacho, attached to POKERMON's Gardevoir / Altaria / Gallade (take_ownership `megas`, add_to_family: ../index.js
// attach_mega) and reached from them with a Mega Stone. Each has its own option (mega_gardevoir / mega_altaria / mega_gallade).
// The 1.6.4 keys (j_nacho_mega_*) are `renamed` aliases to these (../index.js aliases). All three are 1.7.9 reworks:
//   Mega Gardevoir: X1 +X0.1 per Energized joker and per hand level above 1 (1.6.4: two Black Holes when gained).
//   Mega Altaria (Fairy): 9s can't be debuffed (../functions.js set_debuff); each 9 drawn in a blind becomes Polychrome and
//     earns $2 (1.6.4: played 9s got an edition).
//   Mega Gallade: X3 Mult, +1 Energy limit, can't be debuffed; using an Item gives a random joker +1 Energy limit (1.6.4: X per
//     time the hand was played, and the most-played-hand debuff rules).
// Mega Salamence was DROPPED by 1.7.9: its 1.6.4 key stays a legacy definition (legacy/0371_bagon.js).
import { G, localize, pseudorandom_element, pseudoseed, defineNacho, type_tooltip, detailed, P_CENTERS, ease_poke_dollars, get_total_energy } from '../api.js';
import { defer, utils } from '../dip.js';

const has_energy = (joker) => get_total_energy(joker) > 0;
const levels_above_one = () => { let n = 0; for (const v of Object.values(G.GAME.hands)) n = n + Math.max(v.level - 1, 0); return n; };

defineNacho({
  // Mega Gardevoir 282-1
  mega_gardevoir: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      let xmult = a.Xmult + levels_above_one() * a.Xmult_mod;
      if (G.jokers && G.jokers.cards) xmult = xmult + a.Xmult_mod * utils.filter(G.jokers.cards, has_energy).length;
      return { vars: [a.e_limit, a.Xmult_mod, xmult] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.joker_main) {
        let xmult = a.Xmult;
        for (const v of Object.values(G.GAME.hands)) xmult = xmult + Math.max((v.level - 1) * a.Xmult_mod, 0);
        xmult = xmult + a.Xmult_mod * utils.filter(G.jokers.cards, has_energy).length;
        if (xmult > 1) return { xmult };
      }
      return undefined;
    },
  },
}, 'src/pokemon/megas/282_1_mega_gardevoir.lua');

defineNacho({
  // Mega Altaria 334-1
  mega_altaria: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed() && (!card.edition || !card.edition.polychrome)) info_queue.push(P_CENTERS.e_polychrome);
      return { vars: [card.ability.extra.chips, card.ability.extra.money_mod] };
    },
    calculate(self, card, context) {
      if (context.hand_drawn && Array.isArray(context.hand_drawn)) {
        for (const pcard of context.hand_drawn) {
          if (pcard.get_id() !== 9) continue;
          defer(() => pcard.set_edition('e_polychrome', true));
          const earned = ease_poke_dollars(card, 'mega_altaria', card.ability.extra.money_mod);
          G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + (earned || 0);
          defer(() => { G.GAME.dollar_buffer = 0; });
        }
      }
      if (context.joker_main) return { chips: card.ability.extra.chips };
      return undefined;
    },
  },
}, 'src/pokemon/megas/334_1_mega_altaria.lua');

defineNacho({
  // Mega Gallade 475-1
  mega_gallade: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.e_limit, card.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Item') {
        const target = pseudorandom_element(G.jokers.cards, pseudoseed('mega_gallade'))[0];
        if (target) {
          // (The Lua replaces a non-table `extra` with {e_limit_up = 1} — a base joker's own number would be lost; ours keeps
          // it and counts the bonus in ability.nacho_e_limit_up: ../systems.js ENERGY_LIMIT_BONUS.)
          const ex = target.ability.extra;
          if (ex !== null && typeof ex === 'object') ex.e_limit_up = (ex.e_limit_up || 0) + 1;
          else target.ability.nacho_e_limit_up = (target.ability.nacho_e_limit_up || 0) + 1;
          return { message: localize('k_upgrade_ex'), message_card: target };
        }
      }
      if (context.joker_main) return { xmult: card.ability.extra.Xmult };
      return undefined;
    },
    add_to_deck() { G.GAME.energy_plus = (G.GAME.energy_plus || 0) + 1; },
    remove_from_deck() { G.GAME.energy_plus = Math.max((G.GAME.energy_plus || 0) - 1, 0); },
  },
}, 'src/pokemon/megas/475_1_mega_gallade.lua');
