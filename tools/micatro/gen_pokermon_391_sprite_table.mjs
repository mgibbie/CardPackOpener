// gen_pokermon_391_sprite_table.mjs — Pokermon 3.9.1's whole sprite table (functions/pokespriteload.lua PokemonSprites.list),
// resolved to the sheet and cell the game draws (pokermon.sprites.get_atlas_string: gen_atlas N -> AtlasJokersBasicGen0N,
// others_atlas -> AtlasJokersBasicOthers, else AtlasJokersBasicNatdex; the Shiny twin is the same cell on <atlas>Shiny), for
// EVERY entry, not only the jokers 3.9.1 registers: upstream draws a card for many species it has no joker for yet (the owner's
// new jokers take those cells, `poke_sprite391`; the design wiki's "not in the game yet" cards show them,
// compose_missing_pokermon_jokers.mjs upstreamCell). data391.js `sprites` is the same lookup for the jokers the port has.
//
//   1. the Pokermon 3.9.1 extract (the same one data391.js is generated from):
//        NODE_PATH=<fengari> node tools/micatro/extract_mod_data.cjs <Pokermon 3.9.1> <tmp>/pokermon391.js tools/micatro/specs/pokermon_391.json
//   2. node tools/micatro/gen_pokermon_391_sprite_table.mjs <tmp>/pokermon391.js
//      -> tools/micatro/specs/pokermon_391_sprite_table.json (GENERATED: never hand-edit)
// Entry: name -> {atlas, pos: [x, y], soul?: [x, y], multi?: n}. A `multi` entry (upstream picks one of n cells at random,
// load_sprites) lists its first cell, as data391.js does.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const OUT = 'tools/micatro/specs/pokermon_391_sprite_table.json';
export const atlasOf = (s) => 'AtlasJokersBasic' + (s.gen_atlas ? (s.gen_atlas < 10 ? 'Gen0' : 'Gen') + s.gen_atlas : s.others_atlas ? 'Others' : 'Natdex');

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/micatro/gen_pokermon_391_sprite_table.mjs <Pokermon 3.9.1 extract .js>'); process.exit(1); }
const P391 = (await import(pathToFileURL(path.resolve(SRC)).href)).default;
const list = (P391.globals.PokemonSprites && P391.globals.PokemonSprites.list) || [];
if (list.length < 1000) throw new Error(`the extract has ${list.length} PokemonSprites entries (expected 1000+)`);
const sprites = {};
for (const s of list) {
  if (s.gen_atlas !== undefined && typeof s.gen_atlas !== 'number') throw new Error(`${s.name}: gen_atlas ${JSON.stringify(s.gen_atlas)} is not a gen number`);
  const multi = Array.isArray(s.base.pos);
  const pos = multi ? s.base.pos[0] : s.base.pos;
  sprites[s.name] = { atlas: atlasOf(s), pos: [pos.x, pos.y], ...(s.base.soul_pos ? { soul: [s.base.soul_pos.x, s.base.soul_pos.y] } : {}), ...(multi ? { multi: s.base.pos.length } : {}) };
}
const names = Object.keys(sprites);
const text = '{\r\n "generated": "tools/micatro/gen_pokermon_391_sprite_table.mjs from Pokermon 3.9.1 functions/pokespriteload.lua",\r\n'
  + ` "count": ${names.length},\r\n "sprites": {\r\n`
  + names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(sprites[n])}`).join(',\r\n') + '\r\n }\r\n}\r\n';
JSON.parse(text);
fs.writeFileSync(OUT, text);
console.log(`wrote ${OUT} (${names.length} entries)`);
