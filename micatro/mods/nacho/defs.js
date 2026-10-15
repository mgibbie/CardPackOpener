/**
 * Behaviour registry for Nacho's Pokermon Dip — the same shape as Pokermon's defs.js:
 * a pokemon/<file>.js port calls defineNacho({ name: {loc_vars, calculate, ...} }, 'src/pokemon/<file>.lua')
 * keyed by the Lua `name`; index.js merges each definition with the static data (data.js) and
 * builds the center through Pokermon's add-on API (addon_pokemon_center).
 */
export const NACHO_DEFS = {};
/** Lua source file -> names ported from it. */
export const NACHO_FILES = {};

export function defineNacho(map, file) {
  for (const [name, def] of Object.entries(map)) {
    if (NACHO_DEFS[name]) throw new Error(`nacho: joker '${name}' defined twice`);
    NACHO_DEFS[name] = { ...def, poke_file: file };
    (NACHO_FILES[file] = NACHO_FILES[file] || []).push(name);
  }
}

export const NACHO_ID = 'nacho';
