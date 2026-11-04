// Pokermon 3.9.1 attributes (Steamodded SMODS.Attribute; engine side: js/engine/smods.js + js/mods/registry.js ATTRIBUTES).
// Source: InertSteak/Pokermon tag 3.9.1 — functions/pokeconstants.lua (the SMODS.Attribute list) and
// functions/apifunctions.lua (pokermon.load_pokemon: every Pokémon gets `<type>_type`, `stage_<stage>` and `pokemon`).
// The attributes 3.9.1's jokers declare themselves (`attributes = {"mult", "round_evo", ...}`) come with the batch-5
// data re-extract; the Poké Balls / Stage tags of 3.9.1 draw from these pools (create_card with `attributes`).
// Nothing in 3.2.1 content reads them, so registering them changes no run.

/** pokeconstants.lua's SMODS.Attribute keys, in order (pokermon.add_stage adds `stage_<new stage>` the same way). */
export const POKE_ATTRIBUTES = [
  'pokemon',
  'grass_type', 'fire_type', 'water_type', 'lightning_type', 'psychic_type', 'fighting_type', 'colorless_type',
  'dark_type', 'metal_type', 'fairy_type', 'dragon_type', 'earth_type',
  'stage_baby', 'stage_basic', 'stage_one', 'stage_two', 'stage_legendary', 'stage_mega', 'stage_other', 'stage_???',
  'round_evo', 'scaling_evo', 'item_evo', 'type_evo', 'trigger_evo', 'condition_evo',
  'starter', 'holding', 'item', 'types', 'volatile', 'energy', 'energy_count', 'energy_limit', 'ancient', 'foresight',
  'baby', 'nature', 'hazards', 'applies', 'drain',
  // (upstream main after 3.9.1, sub-batch 15b: Greavard / Houndstone declare it; main's other new key, 'draw', waits for its jokers)
  'deplete',
].map((key) => ({ key }));

/**
 * pokermon.load_pokemon's attributes for a Pokémon center: its own `attributes` (3.9.1 data) then
 * `<ptype>_type`, `stage_<stage>` and — unless stage Other — `pokemon`. -> a new array (the center's is not mutated).
 */
export function pokemon_attributes(item) {
  const out = Array.isArray(item.attributes) ? item.attributes.slice() : [];
  if (item.ptype) out.push(String(item.ptype).toLowerCase() + '_type');
  if (item.stage) {
    out.push('stage_' + String(item.stage).toLowerCase());
    if (item.stage !== 'Other') out.push('pokemon');
  }
  return out;
}
