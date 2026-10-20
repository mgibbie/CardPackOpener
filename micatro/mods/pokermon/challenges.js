// Pokermon 3.9.1 — challenges/pokechallenges.lua (batch 17): the 12 challenges, played by engine/challenge.js. Data: 3.9.1's own
// list (data391.js challenges, generated from the 3.9.1 extract); names from its localization.
//   The 7 of 3.2.1 — Nuzlocke, Good As Gold, Parenthood, Little Cup, Hammertime, Lonesome, Randomizer — take 3.9.1's changes:
//   The Mirror is banned from all but Randomizer (and Good As Gold also bans Verdant Leaf), 3.9.1's button / text colours, and
//   Randomizer's rule is renamed poke_apply_randomizer (systems/evolution.js reads both names).
//   New in 3.9.1: Delibird Dilemma (no blind reward / extra-hand money / interest; an Eternal Delibird), Safety First (an all-Hazard
//   deck, Eternal Mudkip / Roggenrola / Bronzor, no shop jokers, no Energy: poke_no_energy — systems/rules.js reset_game_globals,
//   boosters/packs1.js, the Dragon Scale), Mystery Dungeon (the daily challenge: a random Pokermon deck's effect and an Eternal
//   random joker), Imposter Syndrome (non-Colorless jokers debuffed, a Ditto per Boss beaten: systems/rules.js calculate) and Mean
//   Look (+7 Foresight; a hand the Foreseen cards also make is debuffed: systems/rules.js calculate; 4 discards).
// Custom rules with code here:
//   * poke_add_joker_slots (Nuzlocke): an ease_ante wrap — +1 Joker slot each time the ante goes up
//     (beating a Boss Blind), up to 5.
//   * poke_nuzlocke: the same wrap re-arms the first-shop Buffoon Pack each ante, and a get_pack wrap
//     serves it (a Buffoon Pack 1 or 2) even though Nuzlocke bans the Buffoon packs from the pool.
//     (The Lua's math.random pick is the run's seeded RNG here.)
//   * Mystery Dungeon's apply. 3.9.1 sets the run's seed to "poke_" + today's UTC date (DDMMYYYY: lovely/daily_challenge.toml) and
//     picks the deck with that seed. Here the ENGINE never reads the clock: the UI passes today's date at the start (`daily`,
//     js/ui/main.js), newRun turns it into the run's seed 'POKE_DDMMYYYY' (daily_seed below), the recipe records that seed, and the
//     deck pick reads the date back from the seed — so a resume, a replay or a spectator rebuild the same day's run on any day.
//   * Mean Look's apply: +7 Foresight (G.GAME.scry_amount, 3.9.1's poke_scry_amount).
// (Nuzlocke nests its `deck` inside `restrictions`; SMODS ignores it there, so it plays the Challenge Deck too.)
import { G, P_CENTERS, P_CENTER_POOLS, pseudorandom, pseudoseed, pseudorandom_element } from './api.js';
import { add_card } from './systems/utils.js';
import { Back } from '../../js/engine/back.js';
import DATA from './data.js';
import D391 from './data391.js';

const names = { ...((DATA.loc.misc && DATA.loc.misc.challenge_names) || {}), ...((D391.loc && D391.loc.challenge_names) || {}) };
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

/** The Mystery Dungeon's run seed for a UTC date 'DDMMYYYY' (3.9.1: "poke_" .. os.date("!%d%m%Y"); our seeds are upper case). */
export const daily_seed = (date) => 'POKE_' + date;
/** The date a Mystery Dungeon seed was made for ('DDMMYYYY'), or null. */
export const daily_of_seed = (seed) => { const m = /^POKE_(\d{8})$/i.exec(String(seed || '')); return m ? m[1] : null; };
/** The decks Mystery Dungeon picks from: Pokermon's registered, non-legacy decks (3.9.1: P_CENTER_POOLS.Back, not legacy_deck). */
export const mystery_dungeon_decks = () => (P_CENTER_POOLS.Back || []).filter((v) => v.mod === 'pokermon' && v.poke_option !== 'pokemon_legacy' && !v.unported);

const APPLY = {
  mystery_dungeon() {
    G.E_MANAGER.add_event(() => {
      const decks = mystery_dungeon_decks();
      const date = daily_of_seed(G.GAME.pseudorandom.seed);
      const [deck] = decks.length ? pseudorandom_element(decks, pseudoseed(date ? 'poke_' + date : G.GAME.pseudorandom.seed)) : [];
      if (deck) {
        if (deck.key === 'b_poke_vendingdeck') G.GAME.modifiers.poke_vending = true; // (systems/rules.js evaluate_round)
        else new Back(P_CENTERS[deck.key]).apply_to_run();
        G.GAME.poke_mystery_dungeon_deck_key = deck.key; // (the deck's back art on the Challenge Deck: the view's challenge_back)
      }
      const card = add_card({ area: G.jokers, set: 'Joker' });
      card.set_eternal(true);
    });
  },
  mean_look() {
    G.E_MANAGER.add_event(() => { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + G.GAME.modifiers.poke_foresight_plus; });
  },
};

export const CHALLENGES = [];
for (const item of D391.challenges || []) {
  const c = JSON.parse(JSON.stringify(item));
  delete c.object_type;
  delete c.apply;
  c.key = 'c_poke_' + item.key;
  c.name = names[c.key] || item.name || item.key;
  c.mod = 'pokermon';
  if (item.key === 'nuzlocke') c.hooks = NUZLOCKE_HOOKS;
  if (APPLY[item.key]) c.apply = APPLY[item.key];
  if (item.key === 'mystery_dungeon') c.daily_seed = daily_seed;
  CHALLENGES.push(c);
}
