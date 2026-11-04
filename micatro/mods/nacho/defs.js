/**
 * Behaviour registry for Nacho's Pokermon Dip — the same shape as Pokermon's defs.js:
 * a pokemon/<file>.js port calls defineNacho({ name: {loc_vars, calculate, ...} }, 'src/pokemon/<file>.lua')
 * keyed by the Lua `name`; index.js merges each definition with the static data (data179.js, 1.7.9) and
 * builds the center through Pokermon's add-on API (addon_pokemon_center).
 *
 * Legacy definitions (batch 18): the 1.6.4 jokers 1.7.9 retired (deprecated/: base Pokermon owns those Pokémon now; and
 * the dropped Mega Salamence) keep their 1.6.4 behaviour (pokemon/legacy/*.js, defineNachoLegacy) on their 1.6.4 static
 * data (data.js): registered for saves, replays, custom decks and win stickers, out of every pool.
 */
export const NACHO_DEFS = {};
export const NACHO_LEGACY_DEFS = {};
/** Lua source file -> names ported from it (1.7.9 files; legacy files are listed under their 1.6.4 path). */
export const NACHO_FILES = {};

function define(into, map, file) {
  for (const [name, def] of Object.entries(map)) {
    if (into[name]) throw new Error(`nacho: joker '${name}' defined twice`);
    into[name] = { ...def, poke_file: file };
    (NACHO_FILES[file] = NACHO_FILES[file] || []).push(name);
  }
}
export function defineNacho(map, file) { define(NACHO_DEFS, map, file); }
export function defineNachoLegacy(map, file) { define(NACHO_LEGACY_DEFS, map, file); }

export const NACHO_ID = 'nacho';
