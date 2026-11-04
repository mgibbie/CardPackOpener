// Pokermon+ 1.2.0 — src/pokemon/zzz_canari_plush.lua: Canari Plush (new; a non-Pokémon "Other" joker on Pokermon+'s own sheet).
// Destroying cards with seals levels up a bonus per seal (level 1 at 3 destroyed, 2 at 5 more, 3 at 8 more; the count
// restarts after each level and stops at level 3):
//   Red: +1 discard per level   Blue: +1 hand   Gold: +$5 interest cap   Purple: +1 Foresight
//   Pink (Pokermon's): +1 Energy limit   Silver (Pokermon's): +1 consumable slot
// Selling or losing it takes every level back.
// Micatro shapes: Pokermon 3.9.1's G.GAME.poke_energy_plus / poke_scry_amount are our energy_plus / scry_amount.
import { G } from '../../../pokermon/api.js';

const level = (n) => (n >= 8 ? 3 : n >= 5 ? 2 : n >= 3 ? 1 : 0);
const goal = (lv) => (lv === 0 ? 3 : lv === 1 ? 5 : lv === 2 ? 8 : lv === 3 ? 8 : 3);
const SEALS = { Red: 'red', Blue: 'blue', Gold: 'gold', Purple: 'purple', poke_pink_seal: 'pink', poke_silver: 'silver' };
const APPLY = {
  red: (n) => { G.GAME.round_resets.discards = G.GAME.round_resets.discards + n; },
  blue: (n) => { G.GAME.round_resets.hands = G.GAME.round_resets.hands + n; },
  gold: (n) => { G.GAME.interest_cap = G.GAME.interest_cap + 5 * n; },
  purple: (n) => { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + n; },
  pink: (n) => { G.GAME.energy_plus = (G.GAME.energy_plus || 0) + n; },
  silver: (n) => { G.consumeables.config.card_limit = G.consumeables.config.card_limit + n; },
};
/**
 * remove_from_deck (sign -1), and the way back when a debuff ends (+1). Intended-design fixes: the Lua took the consumable
 * slots back by level(silver) — the count since the last level, 0 right after one — instead of the level reached, so the
 * slots stayed after selling it; and a debuff took every bonus away for good (remove_from_deck runs on a debuff, nothing
 * gave them back): the bonuses come back with the card.
 */
function take_back(a, sign) {
  const silver = a.silver_current;
  G.E_MANAGER.add_event(() => { G.consumeables.config.card_limit = G.consumeables.config.card_limit + sign * silver; });
  G.GAME.round_resets.discards = G.GAME.round_resets.discards + sign * a.red_current;
  G.GAME.interest_cap = G.GAME.interest_cap + sign * 5 * a.gold_current;
  G.GAME.scry_amount = (G.GAME.scry_amount || 0) + sign * a.purple_current;
  G.GAME.round_resets.hands = G.GAME.round_resets.hands + sign * a.blue_current;
  G.GAME.energy_plus = (G.GAME.energy_plus || 0) + sign * a.pink_current;
}
const progress = (a, k) => (level(a[k]) === 3 ? 'MAXED' : Math.min(a[k] || 0, 8) + '/' + goal(a[k + '_current']));

export default {
  canari_plush: {
    loc_vars(self, info_queue, card) {
      const a = card.ability.extra;
      return { vars: ['red', 'blue', 'gold', 'purple', 'pink', 'silver'].flatMap((k) => [a[k + '_current'], progress(a, k)]) };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.remove_playing_cards) {
        for (const v of context.removed || []) {
          const k = SEALS[v.seal];
          if (!k) continue;
          a[k] = a[k] + 1;
          const lv = level(a[k]);
          if (lv > a[k + '_current']) {
            APPLY[k](lv - a[k + '_current']);
            a[k + '_current'] = lv;
            if (lv !== 3) a[k] = 0;
          }
          card.juice_up();
        }
      }
      return undefined;
    },
    remove_from_deck(self, card, from_debuff) { take_back(card.ability.extra, -1); },
    add_to_deck(self, card, from_debuff) { if (from_debuff) take_back(card.ability.extra, 1); },
  },
};
