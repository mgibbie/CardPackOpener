// Pokermon 3.2.1 — challenges/pokechallenges.lua: the 7 challenges (Nuzlocke, Good As Gold, Parenthood,
// Little Cup, Hammertime, Lonesome, Randomizer), played by engine/challenge.js.
// Data from the mod's own file (data.js groups.challenges); names from its localization.
// Custom rules with code:
//   * poke_add_joker_slots (Nuzlocke): an ease_ante wrap — +1 Joker slot each time the ante goes up
//     (beating a Boss Blind), up to 5.
//   * poke_nuzlocke: the same wrap re-arms the first-shop Buffoon Pack each ante, and a get_pack wrap
//     serves it (a Buffoon Pack 1 or 2) even though Nuzlocke bans the Buffoon packs from the pool.
//     (The Lua's math.random pick is the run's seeded RNG here.)
//   * apply_randomizer (Randomizer): read by the evolution system (systems/evolution.js).
// (Nuzlocke nests its `deck` inside `restrictions`; SMODS ignores it there, so it plays the Challenge Deck too.)
import { G, P_CENTERS, pseudorandom, pseudoseed } from './api.js';
import DATA from './data.js';

const names = (DATA.loc.misc && DATA.loc.misc.challenge_names) || {};
const NUZLOCKE_HOOKS = {
  ease_ante(m) {
    if (!(m > 0)) return;
    if (G.GAME.modifiers.poke_add_joker_slots) {
      G.GAME.poke_slots_added = (G.GAME.poke_slots_added || 0) + 1;
      if (G.GAME.poke_slots_added <= 5) G.jokers.config.card_limit = G.jokers.config.card_limit + 1;
    }
    if (G.GAME.modifiers.poke_nuzlocke) G.GAME.first_shop_buffoon = false;
  },
  get_pack() {
    if (G.GAME.modifiers.poke_nuzlocke && !G.GAME.first_shop_buffoon) {
      G.GAME.first_shop_buffoon = true;
      return P_CENTERS['p_buffoon_normal_' + (pseudorandom(pseudoseed('poke_nuzlocke')) < 0.5 ? 1 : 2)];
    }
    return undefined;
  },
};

export const CHALLENGES = [];
for (const f of DATA.groups.challenges || []) {
  for (const item of (f.ret && f.ret.list) || []) {
    const c = JSON.parse(JSON.stringify(item));
    delete c.object_type;
    c.key = 'c_poke_' + item.key;
    c.name = names[c.key] || item.name || item.key;
    c.mod = 'pokermon';
    c.button_colour = '#ED533A';
    if (item.key === 'nuzlocke') c.hooks = NUZLOCKE_HOOKS;
    CHALLENGES.push(c);
  }
}
