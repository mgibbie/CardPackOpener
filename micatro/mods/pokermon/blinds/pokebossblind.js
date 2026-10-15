// Pokermon 3.2.1 — blinds/pokebossblind.lua: Cyber Goose? (bl_poke_cgoose), a showdown boss
// (ante 8+, x2 blind, $8). It picks 1-3 Pokémon types when set and re-picks them every hand
// played; after each draw it debuffs every joker of those types (and lifts the others).
// Hooks run through Micatro's mod-blind seams (engine/blind.js) as (prototype, Blind instance).
import { G, pseudoshuffle, pseudoseed, pseudorandom, defineBlinds } from '../api.js';

const FILE = 'blinds/pokebossblind.lua';

/** 1 type, 33% +1, 33% +2 (a shuffled type chart). */
export function determine_type() {
  const ptype_list = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];
  pseudoshuffle(ptype_list, pseudoseed('chart'));
  let count = 1;
  const increase = pseudorandom('increasetypes');
  if (increase > 0.66) count = count + 2;
  else if (increase > 0.33) count = count + 1;
  return ptype_list.slice(0, count);
}

/** Is this joker one of the goose's types? (its base ptype first; Tera stickers only when it has none) */
export function goose_disable(disabled, card, btypes) {
  if (disabled) return false;
  const ex = card.ability && card.ability.extra;
  if (ex && typeof ex === 'object' && ex.ptype) return (btypes || []).includes(ex.ptype);
  if (btypes) return btypes.some((v) => !!card.ability[v.toLowerCase() + '_sticker']);
  return false;
}

defineBlinds({
  cgoose: {
    // Intended-design fix: the Lua keeps ptypes / disabled on the shared prototype (self.config), so
    // a goose disabled once (Chicot, Luchador) stayed disabled for every later goose until a
    // restart. Per-fight state lives on the Blind instance here (blind.poke_ptypes, blind.disabled).
    set_blind(self, blind) { blind.poke_ptypes = determine_type(); },
    press_play(self, blind) {
      blind.triggered = true;
      blind.prepped = true;
      blind.poke_ptypes = determine_type();
      return undefined;
    },
    drawn_to_hand(self, blind) {
      if (blind.prepped) {
        for (const y of G.jokers.cards) y.set_debuff(false);
        for (const v of G.jokers.cards) {
          if (goose_disable(blind.disabled, v, blind.poke_ptypes)) {
            v.set_debuff(true);
            v.juice_up();
            blind.wiggle();
          }
        }
      }
    },
    disable(self, blind) { blind.poke_ptypes = undefined; },
  },
}, FILE);
