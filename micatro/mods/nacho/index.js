/**
 * Nacho's Pokermon Dip 1.6.4 (Eternalnacho & contributors), rebuilt natively for Micatro as a
 * Pokermon add-on (requires Pokermon). Toggleable per run like every Micatro mod: off = gone.
 *
 *   data.js        GENERATED static data (tools/micatro/extract_mod_data.cjs + specs/nacho.json)
 *   pokemon/       one behaviour file per src/pokemon/*.lua (defineNacho, ./defs.js)
 *   functions.js   src/functions/nacho_functions.lua + nacho_utils.lua
 *   systems.js     the Stellar type and the lovely patches, as Pokermon add-on extension points
 *                  + engine hooks
 *
 * Jokers are built through Pokermon's add-on API (addon_pokemon_center = pokermon.Pokemon with
 * the 'nacho' prefix): Pokermon's sprites / type badges / pool rules / evolution machinery apply,
 * and the families go into Pokermon's family table (pokermon.add_family) like the Lua.
 *
 * Options (config.lua, shipped defaults): one toggle per evolution line (Clauncher OFF), plus
 * customStakes (registers the Elite stake), orderJokers and pokemon_only (collection ordering —
 * cosmetic, kept for parity). A disabled line's jokers are inactive for the run (center
 * `mod_option`, honoured by the registry's centerActive) and out of Pokermon's random-Pokémon picks.
 * Hisuian Sneasel / Sneasler need the ToxicStall mod: data only, never available (pokemon/0215_1...).
 * Challenges (4) are registered as data for the later Challenges screen.
 */
import { registerMod, isActive, centerActive, opt } from '../../js/mods/registry.js';
import { G, P_STAKES } from '../../js/engine/core.js';
import DATA from './data.js';
import { NACHO_DEFS, NACHO_FILES, NACHO_ID } from './defs.js';
import { addon_pokemon_center } from '../pokermon/index.js';
import { add_family, POKE_POOL_RULES, mark_precedence } from '../pokermon/api.js';

import './pokemon/0280_ralts.js';
import './pokemon/0333_swablu.js';
import './pokemon/0371_bagon.js';
import './pokemon/0387_turtwig.js';
import './pokemon/0390_chimchar.js';
import './pokemon/0393_piplup.js';
import './pokemon/0531_audino.js';
import './pokemon/0570_1_hisuian_zorua.js';
import './pokemon/0692_clauncher.js';
import './pokemon/0702_dedenne.js';
import './pokemon/0704_goomy.js';
import './pokemon/0765_oranguru.js';
import './pokemon/0766_passimian.js';
import './pokemon/0776_turtonator.js';
import './pokemon/0819_skwovet.js';
import './pokemon/0863_perrserker.js';
import './pokemon/1024_terapagos.js';
import { UNAVAILABLE } from './pokemon/0215_1_hisuian_sneasel.js';
import { hooks, STELLAR_GRADIENT } from './systems.js';

const ART_BASE = '/micatro/mods/nacho/assets/2x';
const art = (p) => ART_BASE + '/' + p;

// ------------------------------------------------------------------ helpers
const FN = '__fn';
const isTable = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
function stripFns(o) {
  if (Array.isArray(o)) return o.map(stripFns);
  if (!isTable(o)) return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v !== FN) r[k] = stripFns(v);
  return r;
}
const listOf = (f) => (f && f.ret && Array.isArray(f.ret.list) ? f.ret.list : []);

/** src/pokemon.lua: the PokemonSprites entries Nacho adds / overrides (they win over Pokermon's). */
const SPRITES = {
  hisuian_sneasel: { base: { pos: { x: 4, y: 5 } }, gen_atlas: true },
  mega_gardevoir: { base: { pos: { x: 6, y: 4 }, soul_pos: { x: 7, y: 4 } }, gen_atlas: true },
  mega_altaria: { base: { pos: { x: 2, y: 6 }, soul_pos: { x: 3, y: 6 } }, gen_atlas: true },
  mega_salamence: { base: { pos: { x: 8, y: 6 }, soul_pos: { x: 9, y: 6 } }, gen_atlas: true },
  mega_gallade: { base: { pos: { x: 0, y: 7 }, soul_pos: { x: 1, y: 7 } }, gen_atlas: true },
  mega_audino: { base: { pos: { x: 6, y: 7 }, soul_pos: { x: 7, y: 7 } }, gen_atlas: true },
  galarian_meowth: { base: { pos: { x: 8, y: 4 } }, gen_atlas: true },
  hisuian_zorua: { base: { pos: { x: 0, y: 9 }, soul_pos: { x: 99, y: 99 } }, gen_atlas: true },
  hisuian_zoroark: { base: { pos: { x: 2, y: 9 }, soul_pos: { x: 99, y: 99 } }, gen_atlas: true },
  hisuian_sliggoo: { base: { pos: { x: 0, y: 12 } }, gen_atlas: true },
  hisuian_goodra: { base: { pos: { x: 2, y: 12 } }, gen_atlas: true },
  terapagos: { base: { pos: { x: 0, y: 6 }, soul_pos: { x: 1, y: 6 } }, gen_atlas: true },
  terapagos_terastal: { base: { pos: { x: 2, y: 6 }, soul_pos: { x: 3, y: 6 } }, gen_atlas: true },
};

// ------------------------------------------------------------------ atlases (src/atlases.lua + animations)
const atlases = {
  nacho_modicon: { src: art('icon.png'), px: 32, py: 32 },
  nacho_stakes: { src: art('stakes.png'), px: 29, py: 29 },
  nacho_stake_stickers: { src: art('stakes_stickers.png'), px: 71, py: 95 },
  nacho_stickers: { src: art('stickers.png'), px: 71, py: 95 },
  // NachosAnimatedPokemon: Terapagos-Stellar, 13 frames (7 per row) at 24 fps, a 108x145 soul.
  nacho_j_nacho_terapagos_stellar: { src: art('j_nacho_terapagos_stellar.png'), px: 71, py: 95, frames: 13 },
  nacho_shiny_j_nacho_terapagos_stellar: { src: art('shiny_j_nacho_terapagos_stellar.png'), px: 71, py: 95, frames: 13 },
  nacho_j_nacho_terapagos_stellar_soul: { src: art('j_nacho_terapagos_stellar_soul.png'), px: 108, py: 145, frames: 13 },
  nacho_shiny_j_nacho_terapagos_stellar_soul: { src: art('shiny_j_nacho_terapagos_stellar_soul.png'), px: 108, py: 145, frames: 13 },
};

// ------------------------------------------------------------------ jokers
/** "nacho_config.Ralts" -> 'Ralts' (the line's option key); null when the line can't load. */
const lineOption = (f) => (f.ret && f.ret.enabled && f.ret.enabled.__stub ? String(f.ret.enabled.__stub).split('.').pop() : null);
const unavailable = new Set(UNAVAILABLE.names);
export const LINES = []; // [{file, option, names}]
const centers = [];
for (const f of DATA.groups.jokers) {
  const option = lineOption(f);
  const names = [];
  for (const item of listOf(f)) {
    names.push(item.name);
    const def = unavailable.has(item.name) ? undefined : NACHO_DEFS[item.name];
    if (!def && !unavailable.has(item.name)) throw new Error(`nacho: joker '${item.name}' has no behaviour`);
    const c = addon_pokemon_center(item, def, {
      prefix: 'nacho', file: f.file, sprites: SPRITES,
      atlas: item.atlas && String(item.atlas).includes('nacho') ? 'nacho_' + item.atlas : undefined,
    });
    if (option) c.mod_option = option;
    if (unavailable.has(item.name)) { c.mod_option = 'ToxicStall_unavailable'; c.nacho_unavailable = UNAVAILABLE.needs; }
    if (c.soul_pos && c.soul_pos.draw !== undefined) delete c.soul_pos.draw;
    centers.push(c);
  }
  // pokermon.add_family (src/pokemon.lua adds every file's family, enabled or not)
  if (names.length > 1) add_family(names);
  LINES.push({ file: f.file, option, names });
}
// Pokermon's random-Pokémon picks (Poké Balls, Zorua's disguise, Transformation, ...) walk every
// registered center: keep Nacho's out while the mod or the line is off.
POKE_POOL_RULES.push((c) => (c.mod === NACHO_ID && !centerActive(c) ? false : undefined));
// Add-on dedupe (Pokermon precedence; pokermon/systems/precedence.js): Ralts, Kirlia, Gardevoir, Gallade, Swablu, Altaria,
// Bagon, Shelgon and Salamence are Pokermon's own now. Nacho's stay registered (legacy definitions: saves, replays and
// stickers resolve; an owned one keeps working) but are out of every pool; their evolutions give Pokermon's joker, and
// Nacho's four Megas are reached from Pokermon's Gardevoir / Gallade / Altaria / Salamence with a Mega Stone.
export const REPLACED = mark_precedence(centers);

// ------------------------------------------------------------------ stake, sticker, challenges
const stakes = [];
for (const f of DATA.groups.stakes) {
  for (const item of listOf(f)) {
    const s = stripFns(item);
    s.key = 'stake_nacho_' + item.key;
    s.atlas = 'nacho_stakes';
    s.sticker_atlas = 'nacho_stake_stickers';
    s.name = 'Elite Stake';
    // Above Pokermon+'s Lilac stake when that mod is on for the run, else above Gold (the Lua
    // decides at load: SMODS.Mods["SonfivesPokermonPlus"].can_load).
    const lilac = () => Object.values(P_STAKES).find((v) => v.mod === 'pokermonplus' && /lilac_stake$/.test(v.key));
    Object.defineProperty(s, 'applied_stakes', { enumerable: true, get() { const l = lilac(); return l && isActive('pokermonplus') ? [l.key] : ['gold']; } });
    Object.defineProperty(s, 'above_stake', { enumerable: true, get() { return s.applied_stakes[0]; } });
    s.mod_option = 'customStakes';
    // Pokermon 3.9.1 ships the same Elite stake (stake_poke_elite; Nacho 1.7.9 re-keys to it, batch 18): base Pokermon wins, so
    // this one leaves the New Run picker while Pokermon's is listed (js/mods/index.js modStakes); it stays registered, so a
    // recipe naming it still plays it.
    s.superseded_by = 'stake_poke_elite';
    // modifiers(): +2 win ante, and the last 4 antes are showdown bosses (systems.js boss_eligible)
    // (customStakes off = the Lua never registers the stake: no Elite rules even if its key is passed.)
    s.modifiers = () => { if (!opt(NACHO_ID, 'customStakes')) return; G.GAME.win_ante = G.GAME.win_ante + 2; G.GAME.modifiers.elite4 = true; };
    // a win on it records the Elite sticker (level 9, like Pokermon's: js/engine/run.js win_sticker_level) — only while its rules
    // apply (customStakes off: a plain Gold run, Gold sticker)
    Object.defineProperty(s, 'sticker_level', { enumerable: true, get() { return opt(NACHO_ID, 'customStakes') ? 9 : undefined; } });
    stakes.push(s);
  }
}
const stickers = [];
for (const f of DATA.groups.stickers) {
  for (const item of listOf(f)) {
    // stellar_sticker: the Stellar Tera flag (prefix_config key = false: the ability key is
    // `stellar_sticker`); badge hidden, never rolled (rate 0), no collection entry.
    stickers.push({ ...stripFns(item), atlas: 'nacho_stickers', label: 'Tera', type: 'Stellar', hide_badge: true, gradient: STELLAR_GRADIENT });
  }
}
export const CHALLENGES = [];
for (const f of DATA.groups.challenges) for (const item of listOf(f)) CHALLENGES.push({ ...stripFns(item), key: 'c_nacho_' + item.key, mod: NACHO_ID, button_colour: '#E9B800' });

// ------------------------------------------------------------------ loc
const loc = JSON.parse(JSON.stringify(DATA.loc));
loc.misc.dictionary = loc.misc.dictionary || {};
loc.misc.dictionary.poke_stellar_badge = 'Stellar'; // (lovely patch on Pokermon's en-us.lua)
// The Stellar sticker's text (Nacho has none for the sticker key itself): its Stellar Type box.
loc.descriptions.Other = loc.descriptions.Other || {};
if (!loc.descriptions.Other.stellar_sticker && loc.descriptions.Other.stellar_type) loc.descriptions.Other.stellar_sticker = JSON.parse(JSON.stringify(loc.descriptions.Other.stellar_type));

// ------------------------------------------------------------------ options (config.lua defaults)
const OPT = (def, label) => ({ default: def, label });
const options = {};
for (const l of LINES) if (l.option && !unavailable.has(l.names[0])) {
  const label = (DATA.loc.misc.dictionary[l.names[0] + '_line'] || DATA.loc.misc.dictionary[l.names[0]] || l.option.replace(/_/g, ' ') + ' line?').replace(/\?$/, '');
  options[l.option] = OPT(l.option !== 'Clauncher', label);
}
options.customStakes = OPT(true, 'Elite stake');
options.orderJokers = OPT(true, 'Order jokers by Pokédex (collection)');
options.pokemon_only = OPT(false, 'Pokémon only in collection ordering');

export const NACHO = registerMod({
  id: NACHO_ID,
  name: "Nacho's Pokermon Dip",
  prefix: 'nacho',
  version: '1.6.4',
  // Our behaviour counter (mods/pins.js; the pin reads "1.6.4 (rev 1)"). 1 = the add-on dedupe (Pokermon precedence, Pokermon
  // PORTING.md "Add-on dedupe"): the Ralts / Swablu / Bagon lines are Pokermon's (Nacho's out of the pools, their evolutions give
  // Pokermon's), the four Megas come from Pokermon's Gardevoir / Gallade / Altaria / Salamence; Altaria's 9s rule is Nacho's only.
  contentRev: 1,
  by: 'Eternalnacho & contributors (rebuilt for Micatro)',
  badge_colour: '#E9B800',
  requires: ['pokermon'],
  description: 'More Pokémon for Pokermon (Sinnoh starters, Goomy, Terapagos, Megas for Pokermon’s Gardevoir, Gallade, Altaria and Salamence...), the Stellar type and the Elite Four stake.',
  options,
  content: { centers, stakes, stickers, atlases, loc },
  hooks,
  challenges: CHALLENGES, // (engine/challenge.js plays them; sinnoh_adv is systems.js)
});

/** Port status for tests / the wiki. */
export const STATUS = {
  ported: centers.filter((c) => !c.unported).map((c) => c.key),
  unavailable: centers.filter((c) => c.nacho_unavailable).map((c) => c.key),
  files: NACHO_FILES,
};
