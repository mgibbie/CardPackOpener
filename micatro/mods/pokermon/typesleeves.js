// Micatro's own Pokermon sleeves (the owner's design, 2026-10-27; contentRev 22): one Type Sleeve per Pokermon type, the 12 of
// systems/types.js POKETYPES (each with its Energy card: Dark's is "Darkness Energy", so its sleeve is the Darkness Sleeve).
// Not in Pokermon upstream. Each "<Type> Sleeve":
//   1. starts the run with a NEGATIVE Energy card of that type (Whismur's Negative Justice: add_card with e_negative, in an
//      event after the deck), so it never takes a consumable slot;
//   2. the first 2 shops of the run each START with a Joker of that type: the shop's last joker slot of its initial stock is
//      that Joker (the shop size is unchanged). A reroll restocks normally: the guarantee is the initial stock's only.
//      The pick: the shop's own pools (get_current_pool 'Joker' with the shop's 'sho' append: in_pool, every mod's
//      pool_filter — Pokémon only, the Gen options, Hazards allowed —, the add-on precedence, no duplicates unless Showman,
//      banned keys, enhancement gates; no Legendary, as the shop never rolls one), cut to the jokers of that type, with the
//      normal rarity odds (Common 0.7 / Uncommon 0.25 / Rare 0.05 + an active mod rarity's weight, each times its
//      G.GAME <rarity>_mod) over the rarities that still hold one. Seeded on the shop's streams: the rarity roll is
//      'rarity' + ante + 'sho' and the pick is that pool's key ('Joker' + rarity + 'sho' + ante), so a replay, a resume
//      (the recipe re-simulates) or a spectator stocks the same Joker. No Joker of the type left -> the slot rolls as
//      normal (and draws nothing from those streams first).
//      On the Luminous Deck (every Joker gets a random Tera type) the guaranteed Joker's Tera sticker is the sleeve's type.
//   3. Unlocked from the start (Micatro's sleeves have no unlocks), any deck, no alternate effect.
// Art: tools/micatro/compose_pokermon_type_sleeves.mjs (the Trainer Sleeve's pocket + that type's Energy card) ->
// assets/2x/type_sleeves.png, one row of 12 cells in POKETYPES order.
import { G, P_CENTERS, localize, pseudorandom, pseudoseed, pseudorandom_element } from './api.js';
import { get_current_pool, create_card } from '../../js/engine/core.js';
import { RARITIES, centerActive } from '../../js/mods/registry.js';
import { POKETYPES, get_type, apply_type_sticker } from './systems/types.js';
import { add_card } from './systems/utils.js';

const MOD = 'pokermon';
export const TYPE_SLEEVE_ATLAS = 'poke_type_sleeves';
export const TYPE_SLEEVE_SHOPS = 2;
/** Each type's Energy card name (consumables: c_poke_<name>_energy) — and the sleeve's name. */
export const TYPE_ENERGY = {
  Grass: 'grass', Fire: 'fire', Water: 'water', Lightning: 'lightning', Psychic: 'psychic', Fighting: 'fighting',
  Colorless: 'colorless', Dark: 'darkness', Metal: 'metal', Fairy: 'fairy', Dragon: 'dragon', Earth: 'earth',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const typeSleeveKey = (ptype) => 'sleeve_poke_' + TYPE_ENERGY[ptype] + 'sleeve';

/** A joker center's Pokermon type (its ptype; Nacho / Pokermon+ jokers carry the same field). */
const center_type = (c) => (c && c.config && c.config.extra && typeof c.config.extra === 'object' && c.config.extra.ptype) || (c && c.ptype) || null;

const RARITY_ROLL = { 1: 0, 2: 0.9, 3: 1 };
/** The shop's joker rarities with their normal weights (Legendary is 0 in a shop roll: left out). */
function shop_rarities() {
  const mod = (k) => { const v = G.GAME[k]; return v === undefined || v === null ? 1 : v; };
  const out = [{ key: 1, weight: 0.7 * mod('common_mod') }, { key: 2, weight: 0.25 * mod('uncommon_mod') }, { key: 3, weight: 0.05 * mod('rare_mod') }];
  for (const r of Object.values(RARITIES)) {
    if (!r.mod || !centerActive(r) || (r.pools && !r.pools.Joker)) continue;
    const w = (r.get_weight ? r.get_weight(r) : r.weight) || 0;
    if (w > 0) out.push({ key: r.key, weight: w * mod(String(r.key).toLowerCase() + '_mod') });
  }
  return out.filter((r) => r.weight > 0);
}

/**
 * The guaranteed Joker's key for this type, drawn as described above; undefined when no Joker of the type can come up
 * (nothing drawn from the RNG then).
 */
export function pick_type_joker(ptype, append = 'sho') {
  const ante = G.GAME.round_resets.ante;
  const avail = [];
  for (const r of shop_rarities()) {
    // (get_current_pool's Joker rarity argument is a ROLL, as the Lua's: 0 -> Common, 0.9 -> Uncommon, 1 -> Rare; a mod rarity by key)
    const [pool, pool_key] = get_current_pool('Joker', RARITY_ROLL[r.key] ?? r.key, false, append);
    const keys = pool.filter((k) => k !== 'UNAVAILABLE' && P_CENTERS[k] && P_CENTERS[k].set === 'Joker' && center_type(P_CENTERS[k]) === ptype);
    if (keys.length) avail.push({ ...r, keys, pool_key });
  }
  if (!avail.length) return undefined;
  const total = avail.reduce((n, r) => n + r.weight, 0);
  const roll = pseudorandom(pseudoseed('rarity' + ante + append));
  let wi = 0, pick = avail[avail.length - 1];
  for (const r of avail) { wi += r.weight / total; if (roll < wi) { pick = r; break; } }
  return pseudorandom_element(pick.keys, pseudoseed(pick.pool_key))[0];
}

/** The sleeve's shop hooks (the engine's internal sleeve mod runs them while this sleeve is on). */
function shop_hooks(ptype) {
  return {
    // update_shop: before a NEW shop is stocked (not when it re-opens after a pack), count the visit.
    shop_start() {
      if (G.shop_populated) return;
      const n = G.GAME.poke_type_sleeve_shops || 0;
      G.GAME.poke_type_sleeve_due = n < TYPE_SLEEVE_SHOPS ? ptype : null;
      G.GAME.poke_type_sleeve_shops = n + 1;
    },
    // The initial stock's last joker slot (Rare / Uncommon Tags still make the first ones).
    create_card_for_shop(area) {
      if (!G.GAME.poke_type_sleeve_due || area !== G.shop_jokers || G.shop_jokers.cards.length !== G.GAME.shop.joker_max - 1) return undefined;
      G.GAME.poke_type_sleeve_due = null;
      const key = pick_type_joker(ptype);
      G.GAME.poke_type_sleeve_last = key || null; // (what the guarantee stocked; null = the fallback)
      if (!key) return undefined;
      const card = create_card('Joker', area, null, null, null, null, key, 'sho');
      // (the Luminous Deck's random Tera sticker: the guaranteed Joker keeps the sleeve's type)
      if (get_type(card) !== ptype) apply_type_sticker(card, ptype);
      G.E_MANAGER.add_event(() => {
        for (const t of G.GAME.tags.slice()) if (t.apply_to_run({ type: 'store_joker_modify', card })) break;
      });
      return card;
    },
    // The initial stock is done (also when no slot asked: a 0-slot shop, a mod that stocks the shop itself).
    shop_stocked() { G.GAME.poke_type_sleeve_due = null; },
  };
}

function type_sleeve(ptype, i) {
  const energy = 'c_poke_' + TYPE_ENERGY[ptype] + '_energy';
  return {
    key: typeSleeveKey(ptype), name: cap(TYPE_ENERGY[ptype]) + ' Sleeve', pos: { x: i, y: 0 }, atlas: TYPE_SLEEVE_ATLAS, mod: MOD,
    unlocked: true, poke_type_sleeve: ptype,
    config: { extra: { ptype, energy, shops: TYPE_SLEEVE_SHOPS } },
    loc_vars: (self) => ({ vars: [localize({ type: 'name_text', set: 'Energy', key: self.config.extra.energy }), self.config.extra.shops, ptype] }),
    apply(self) {
      G.E_MANAGER.add_event(() => { add_card({ set: 'Energy', key: self.config.extra.energy, edition: 'e_negative' }); });
    },
    hooks: shop_hooks(ptype),
  };
}

export const TYPE_SLEEVES = POKETYPES.map(type_sleeve);

/** Their text (descriptions.Sleeve; merged into the mod's loc in index.js). */
export const TYPE_SLEEVE_LOC = Object.fromEntries(POKETYPES.map((t) => {
  const box = '{X:poke_' + t.toLowerCase() + ',C:' + (t === 'Lightning' ? 'black' : 'white') + '}#3#{}';
  return [typeSleeveKey(t), {
    name: cap(TYPE_ENERGY[t]) + ' Sleeve',
    text: [
      'Start with a {C:dark_edition}Negative{}',
      '{C:attention}#1#{} card',
      'The first {C:attention}#2#{} shops each',
      'start with a ' + box + ' Joker',
    ],
  }];
}));
