// Pokermon 3.9.1 — blinds/pokebossblind.lua (batch 17): the six boss blinds, all on 3.9.1's SMODS.Blind `calculate`
// (js/engine/smods.js blind_calculate / calculate_seam: Blind:calculate, also while disabled — each checks blind.disabled):
//   The Mirror (ante 3+): when the first hand is drawn, the rightmost joker becomes a Ditto (an Eternal one loses Eternal).
//   The Rocket (ante 2+): with $25 or more, every card is drawn face down (stay_flipped).
//   The Star (ante 3+): when the blind is set and on every hand played, one random type; its jokers are debuffed (debuff_card).
//   Gray Godfather (showdown, ante 8+): -$5 when a hand is played or discarded; in debt after it, a random non-Eternal joker is
//     destroyed.
//   White Executive (showdown): when the blind is set, as many random playing cards as the total sell value of your jokers and
//     consumables are debuffed (SMODS.debuff_card source 'white_executive'), until the round ends or it is disabled.
//   Iridescent Hacker (showdown; 3.2.1's Chartreuse Chamber, bl_poke_cgoose, renamed in batch 5): 1-3 random types, picked when
//     the blind is set and on every hand played; their jokers are debuffed. Batch 5 kept the 3.2.1 behaviour under the new key;
//     batch 17 ports 3.9.1's own (the debuff_card context, pick_random_types, is_type: Tera stickers / wildcards count, where
//     3.2.1 read a joker's base ptype first). Its per-fight state is on the Blind instance (blind.effect), as SMODS keeps it.
// 3.9.1 also writes The Magma and The Aqua (Chips / Mult x0.25) but never registers them (not in the file's list): not ported.
// The static data of the five new blinds is given here in full (data.js is 3.2.1's); index.js puts them before the Hacker. Their
// `name` is their key, as Steamodded gives a mod blind (Nacho's boss checks read names); the shown name is the loc entry's.
import { G, pseudoshuffle, pseudoseed, pseudorandom, pseudorandom_element, ease_dollars, localize, defineBlinds } from '../api.js';
import { is_type, poke_evolve, smods_debuff_card, pseudorandom_multi } from '../api.js';

const FILE = 'blinds/pokebossblind.lua';
/** pokeconstants.lua POKE_TYPES, in order. */
const POKE_TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];

/** 3.9.1 pick_random_types(amount): the first `amount` of the type chart shuffled with seed 'chart'. */
export function pick_random_types(amount) {
  const ptype_list = POKE_TYPES.slice();
  pseudoshuffle(ptype_list, pseudoseed('chart'));
  return ptype_list.slice(0, amount);
}
/** The Iridescent Hacker's pick: 1 type, +1 over 0.33, +1 more over 0.66 (seed 'increasetypes'). */
export function determine_type() {
  let type_count = 1;
  const chance_to_increase = pseudorandom('increasetypes');
  if (chance_to_increase > 0.66) type_count = type_count + 1;
  if (chance_to_increase > 0.33) type_count = type_count + 1;
  return pick_random_types(type_count);
}
const ptype_matches = (card, types) => (types || []).some((t) => is_type(card, t));
/** SMODS.recalc_debuff(card): the card's debuff, re-evaluated (sources + the blind's debuff_card, with its context). */
const recalc_debuff = (card) => G.GAME.blind.debuff_card(card);
const effect = (blind) => (blind.effect = blind.effect || {});

/** The White Executive's count: the total sell value of every joker and consumable (floored). */
export function white_executive_total() {
  let total = 0;
  for (const area of [G.jokers, G.consumeables]) if (area) for (const c of area.cards) total = total + (c.sell_cost || 0);
  return Math.floor(total);
}
/** Gray Godfather: after the -$5, in debt -> a random joker that isn't Eternal (or being destroyed) is destroyed. */
function gray_godfather_remove(difference) {
  const dollars = G.GAME.dollars || 0, buffer = G.GAME.dollar_buffer || 0;
  if (dollars + buffer - difference < 0) {
    const destructable = G.jokers.cards.filter((j) => !j.ability.eternal && !j.getting_sliced);
    const [joker_to_destroy] = destructable.length ? pseudorandom_element(destructable, pseudoseed('gray_godfather')) : [];
    if (joker_to_destroy) {
      joker_to_destroy.getting_sliced = true;
      G.E_MANAGER.add_event(() => { joker_to_destroy.start_dissolve(); });
    }
  }
}
/** The Star / the Hacker: after the draw following a pick, every joker of a picked type (or already debuffed) re-evaluates. */
function type_debuff_pass(blind, types) {
  for (const v of G.jokers.cards) {
    if (v.debuff) recalc_debuff(v);
    else if (ptype_matches(v, types)) { recalc_debuff(v); v.juice_up(); }
  }
  blind.wiggle();
}

/** The live #1# of a blind's HUD text (engine/blind.js set_text reads the center's `vars`; index.js makes these getters). */
export const BLIND_HUD_VARS = {
  bl_poke_gray_godfather: (self) => [String(self.config.dollars)],
  bl_poke_white_executive: () => [String(white_executive_total())],
};

defineBlinds({
  mirror: {
    key: 'mirror', dollars: 5, mult: 2, boss: { min: 3, max: 80 }, pos: { x: 0, y: 1 },
    atlas: 'AtlasBossblinds', artist: 'InertSteak', boss_colour: '#C57BE6', debuff: {}, config: {}, discovered: true, order: 2001,
    calculate(self, blind, context) {
      if (context.first_hand_drawn && !blind.disabled) {
        if (G.jokers.cards.length > 0) {
          const target = G.jokers.cards[G.jokers.cards.length - 1];
          if (!target.getting_sliced) {
            if (target.ability.eternal) target.set_eternal(false);
            poke_evolve(target, 'j_poke_ditto', null, localize('poke_transform_success'), true);
          }
        }
      }
      return undefined;
    },
  },
  rocket: {
    key: 'rocket', dollars: 5, mult: 2, boss: { min: 2, max: 80 }, pos: { x: 0, y: 2 },
    atlas: 'AtlasBossblinds', artist: 'Catzzadilla', boss_colour: '#C90000', debuff: {}, config: {}, discovered: true, order: 2002,
    calculate(self, blind, context) {
      if (!blind.disabled && context.stay_flipped && context.to_area === G.hand && G.GAME.dollars >= 25) return { stay_flipped: true };
      return undefined;
    },
  },
  star: {
    key: 'star', dollars: 5, mult: 2, boss: { showdown: false, min: 3, max: 80 }, pos: { x: 0, y: 24 },
    atlas: 'AtlasBossblinds', artist: 'Catzzadilla', boss_colour: '#D9B673', config: {}, discovered: true, order: 2003,
    calculate(self, blind, context) {
      const e = effect(blind);
      let ret;
      if (!blind.disabled) {
        if (context.debuff_card && context.debuff_card.area === G.jokers && e.ptype && is_type(context.debuff_card, e.ptype)) ret = { debuff: true };
        if (context.press_play || context.setting_blind) {
          e.ptype = pick_random_types(1)[0];
          blind.triggered = true;
          blind.prepped = true;
        }
        if (context.drawing_cards && blind.prepped) type_debuff_pass(blind, [e.ptype]);
      }
      if (context.drawing_cards) blind.prepped = undefined;
      return ret;
    },
  },
  gray_godfather: {
    key: 'gray_godfather', dollars: 8, mult: 2, boss: { showdown: true, min: 8, max: 80 }, pos: { x: 0, y: 3 },
    atlas: 'AtlasBossblinds', boss_colour: '#B3B3B3', debuff: {}, config: { dollars: 5 }, discovered: true, order: 2004,
    loc_vars(self) { return { vars: [self.config.dollars] }; },
    collection_loc_vars(self) { return { vars: [self.config.dollars] }; },
    calculate(self, blind, context) {
      if (!blind.disabled && (context.before || context.pre_discard)) {
        ease_dollars(-self.config.dollars);
        gray_godfather_remove(self.config.dollars);
      }
      return undefined;
    },
  },
  white_executive: {
    key: 'white_executive', dollars: 8, mult: 2, boss: { showdown: true, min: 8, max: 80 }, pos: { x: 0, y: 4 },
    atlas: 'AtlasBossblinds', boss_colour: '#E8E8F8', debuff: {}, config: {}, discovered: true, order: 2005,
    loc_vars() { return { vars: [white_executive_total()] }; },
    collection_loc_vars() { return { vars: [white_executive_total()] }; },
    calculate(self, blind, context) {
      if (!blind.disabled) {
        if (context.setting_blind) {
          pseudorandom_multi({ array: G.playing_cards, amt: white_executive_total(), seed: 'whiteexec', mod_func: (v) => smods_debuff_card(v, true, 'white_executive') });
        }
        if (context.end_of_round && !context.individual && !context.repetition) {
          for (const v of G.playing_cards) smods_debuff_card(v, false, 'white_executive');
        }
      }
      return undefined;
    },
    disable() { for (const v of G.playing_cards) smods_debuff_card(v, false, 'white_executive'); },
  },
  iridescent_hacker: {
    calculate(self, blind, context) {
      const e = effect(blind);
      let ret;
      if (!blind.disabled) {
        if (context.debuff_card && context.debuff_card.area === G.jokers && ptype_matches(context.debuff_card, e.ptypes)) ret = { debuff: true };
        if (context.press_play || context.setting_blind) {
          e.ptypes = determine_type();
          blind.triggered = true;
          blind.prepped = true;
        }
        if (context.drawing_cards && blind.prepped) type_debuff_pass(blind, e.ptypes);
      }
      if (context.drawing_cards) blind.prepped = undefined;
      return ret;
    },
  },
}, FILE);
