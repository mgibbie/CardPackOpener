/**
 * Nacho's Pokermon Dip 1.7.9-5 (Eternalnacho & contributors; GPL-3.0), rebuilt natively for Micatro as a Pokermon add-on
 * (requires Pokermon). Toggleable per run like every Micatro mod: off = gone. Upgraded from 1.6.4 in batches 18 / 19 of
 * Plans/MICATRO_MODS_UPGRADES.md (upstream commit 904ae39; see ./PORTING.md).
 *
 *   data179.js     GENERATED 1.7.9 static data (tools/micatro/extract_mod_data.cjs + specs/nacho_179.json)
 *   sprites179.js  GENERATED: the Pokermon 3.9.1 sheet cell of every 1.7.9 joker (tools/micatro/gen_nacho_179_sprites.mjs)
 *   data.js        GENERATED 1.6.4 static data: only the LEGACY definitions read it now
 *   pokemon/       one behaviour file per 1.7.9 src/pokemon/*.lua (defineNacho, ./defs.js); pokemon/legacy/ the 1.6.4 lines
 *                  1.7.9 retired (defineNachoLegacy)
 *   dip.js         1.7.9's PkmnDip.utils / con / calc / eff helpers
 *   items.js       the apples, the Ancient Pack, the Fossil Tag
 *   functions.js   the mod's set_debuff rules, common_ranks_tooltip; legacy helpers
 *   systems.js     the Stellar type, the lovely patches and init hooks, as Pokermon extension points + engine hooks
 *
 * Jokers are built through Pokermon's add-on API (addon_pokemon_center = pokermon.Pokemon with the 'nacho' prefix — 'poke'
 * for the three re-keyed Megas, 1.7.9's nacho_inject_prefix): Pokermon's type badges / pool rules / evolution machinery apply,
 * the sprites are Pokermon 3.9.1's sheets (1.7.9 draws its jokers through pokermon.sprites.load_atlas), and the families go
 * into Pokermon's family table (pokermon.add_family).
 *
 * What 1.7.9 retired (batch 18; PORTING.md "Retired keys: legacy definitions vs aliases"):
 *   - the Ralts / Swablu / Bagon lines (deprecated/, can_load = false: base Pokermon owns those Pokémon) and Mega Salamence
 *     (dropped): LEGACY definitions — still registered on their 1.6.4 behaviour, out of every pool, evolving into Pokermon's
 *     jokers (Pokermon precedence: ../pokermon/systems/precedence.js), so saves, replays, custom decks and win stickers keep
 *     working; the sticker merge (js/mods/superseded.js) keeps counting their wins for Pokermon's twins.
 *   - Mega Gardevoir / Altaria / Gallade: RE-KEYED to j_poke_* (1.7.9 reworks); the j_nacho_* keys are `renamed` aliases.
 *   - the Elite stake: Pokermon owns it (stake_poke_elite); stake_nacho_elite_stake is a `renamed` alias.
 *   - the Bronzor / Smoliv lines (1.7.9 deprecated them on arrival) and the Impidimp line (can_load = false upstream) and
 *     the G-Max apples (Agarmons only) were never ours: not registered.
 *   - the Toxic-Stall lines (Hisuian Sneasel / Sneasler, the Loyal Three, Pecharunt): data only (pokemon/0903_sneasler.js).
 *
 * Options (config.lua, 1.7.9 defaults: every line ON, Clauncher too now): one toggle per evolution line and one per re-keyed
 * Mega. The option keys keep their 1.6.4 names (recipes store them): the Lua `config_key` with each word capitalised.
 */
import { registerMod, centerActive } from '../../js/mods/registry.js';
import DATA from './data179.js';
import DATA164 from './data.js';
import SPRITES179 from './sprites179.js';
import { NACHO_DEFS, NACHO_LEGACY_DEFS, NACHO_FILES, NACHO_ID } from './defs.js';
import { addon_pokemon_center } from '../pokermon/index.js';
import { add_family, POKE_POOL_RULES, mark_precedence, attach_mega, pokemon_in_pool } from '../pokermon/api.js';

import './pokemon/0387_turtwig.js';
import './pokemon/0390_chimchar.js';
import './pokemon/0393_piplup.js';
import './pokemon/0408_cranidos.js';
import './pokemon/0410_shieldon.js';
import './pokemon/0459_snover.js';
import './pokemon/0494_victini.js';
import './pokemon/0531_audino.js';
import './pokemon/0570_1_hisuian_zorua.js';
import './pokemon/0577_solosis.js';
import './pokemon/0692_clauncher.js';
import './pokemon/0702_dedenne.js';
import './pokemon/0703_carbink.js';
import './pokemon/0704_goomy.js';
import './pokemon/0761_bounsweet.js';
import './pokemon/0765_oranguru.js';
import './pokemon/0766_passimian.js';
import './pokemon/0767_wimpod.js';
import './pokemon/0776_turtonator.js';
import './pokemon/0777_togedemaru.js';
import './pokemon/0781_dhelmise.js';
import './pokemon/0819_skwovet.js';
import './pokemon/0840_applin.js';
import './pokemon/0863_perrserker.js';
import './pokemon/0963_finizen.js';
import './pokemon/0996_frigibax.js';
import './pokemon/1024_terapagos.js';
import './pokemon/megas.js';
import './pokemon/other_excavator.js';
import './pokemon/legacy/0280_ralts.js';
import './pokemon/legacy/0333_swablu.js';
import './pokemon/legacy/0371_bagon.js';
import { UNAVAILABLE } from './pokemon/0903_sneasler.js';
import { APPLES, ANCIENT_PACK, FOSSIL_TAG } from './items.js';
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
const behaviourOf = (def) => { const out = {}; for (const [k, v] of Object.entries(def || {})) if (typeof v === 'function') out[k] = v; return out; };
/** The 1.7.9 config_key -> our option key (1.6.4's names: 'hisuian_zorua' -> 'Hisuian_Zorua'). */
const optionKey = (k) => String(k).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('_');

// ------------------------------------------------------------------ atlases (1.7.9 src/atlases.lua; files vendored as *-179.png)
const atlases = {
  nacho_modicon: { src: art('icon.png'), px: 32, py: 32 },
  nacho_consumables179: { src: art('consumables-179.png'), px: 71, py: 95 },
  nacho_boosters179: { src: art('boosters-179.png'), px: 71, py: 95 },
  nacho_tags179: { src: art('tags-179.png'), px: 34, py: 34 },
  nacho_excavator179: { src: art('excavator-179.png'), px: 71, py: 95 },
  nacho_shiny_excavator179: { src: art('excavator_shiny-179.png'), px: 71, py: 95 },
  // Terapagos-Stellar's floating sprite (ANIMATION_ATLAS: 13 frames of 110 x 147 in one row, 12 fps; systems.js ANIMATED)
  nacho_terapagos_stellar_soul179: { src: art('terapagos_stellar-179.png'), px: 110, py: 147, frames: 13 },
  nacho_shiny_terapagos_stellar_soul179: { src: art('terapagos_stellar_shiny-179.png'), px: 110, py: 147, frames: 13 },
};
/** A 1.7.9 joker's own atlas -> ours ('nacho_excavator' -> nacho_excavator179; Pokermon's 'AtlasJokersBasicGen09' -> its 3.9.1 sheet). */
const own_atlas = (a) => (String(a).includes('nacho') ? a + '179' : 'poke_' + a + '391');

// ------------------------------------------------------------------ jokers (1.7.9)
const unavailable = new Set(UNAVAILABLE.names);
export const LINES = []; // [{file, option, names}]
const centers = [];
/** The 1.7.9 megas re-keyed into Pokermon's namespace, and the Pokermon joker each attaches to (their init()). */
const ATTACH = { mega_gardevoir: 'gardevoir', mega_altaria: 'altaria', mega_gallade: 'gallade' };
for (const f of DATA.groups.jokers) {
  if (f.ret.can_load === false) continue; // deprecated/, the Impidimp line, the G-Max apples (see the header)
  const toxic = f.ret.misc_config === 'ToxicStall';
  const option = toxic ? null : optionKey(f.ret.config_key);
  const names = [];
  for (const item0 of listOf(f)) {
    const name = item0.name;
    names.push(name);
    const def = toxic ? undefined : NACHO_DEFS[name];
    if (!def && !unavailable.has(name)) throw new Error(`nacho: joker '${name}' has no behaviour`);
    const item = { ...item0 };
    delete item.loc_txt;
    let atlas;
    if (item.atlas) atlas = own_atlas(item.atlas);
    else {
      const s = SPRITES179[name];
      if (!s) throw new Error(`nacho: joker '${name}' has no sprite`);
      atlas = 'poke_' + s.atlas + '391';
      item.pos = { ...s.pos };
      if (s.soul_pos) item.soul_pos = { ...s.soul_pos }; else delete item.soul_pos;
    }
    const prefix = item.nacho_inject_prefix || 'nacho';
    const c = addon_pokemon_center(item, def, { prefix, file: f.file, atlas });
    if (option) c.mod_option = option;
    if (toxic) { c.mod_option = 'ToxicStall_unavailable'; c.nacho_unavailable = UNAVAILABLE.needs; c.in_pool = () => false; }
    // (1.7.9 items with their own in_pool and no custom_pool_func: Pokermon's rules AND theirs — the Hisuian Goomy line)
    if (def && typeof def.in_pool === 'function' && !item0.custom_pool_func) { const own = def.in_pool; c.in_pool = (self, args) => pokemon_in_pool(self) && own(self, args); }
    if (c.soul_pos && c.soul_pos.draw !== undefined) delete c.soul_pos.draw;
    if (name === 'terapagos_stellar') { c.soul_pos = { x: 0, y: 0 }; c.soul_atlas = 'nacho_terapagos_stellar_soul179'; delete c.soul_altas; }
    centers.push(c);
    if (ATTACH[name]) { attach_mega('j_poke_' + ATTACH[name], c.key); add_family([ATTACH[name], name]); }
  }
  // pokermon.add_family (1.7.9 loader: the file's `family`, else its list)
  const fam = Array.isArray(f.ret.family) && f.ret.family.length > 1 ? f.ret.family : names;
  if (fam.length > 1) add_family(fam);
  LINES.push({ file: f.file, option, names, unavailable: toxic });
}

// ------------------------------------------------------------------ legacy definitions (1.6.4; see the header)
/** 1.6.4 src/pokemon.lua sprites of the legacy jokers (the 3.2.1 sheets, as before the upgrade). */
const SPRITES164 = { mega_salamence: { base: { pos: { x: 8, y: 6 }, soul_pos: { x: 9, y: 6 } }, gen_atlas: true } };
const LEGACY = {
  'src/pokemon/0280_ralts.lua': ['ralts', 'kirlia', 'gardevoir', 'gallade'],
  'src/pokemon/0333_swablu.lua': ['swablu', 'altaria'],
  'src/pokemon/0371_bagon.lua': ['bagon', 'shelgon', 'salamence', 'mega_salamence'],
};
/** A legacy Gardevoir / Altaria / Gallade still reaches its (re-keyed) Mega with a Mega Stone, as the 1.6.4 card did. */
const LEGACY_MEGA = { gardevoir: 'j_poke_mega_gardevoir', altaria: 'j_poke_mega_altaria', gallade: 'j_poke_mega_gallade' };
export const LEGACY_KEYS = [];
for (const f of DATA164.groups.jokers) {
  const keep = LEGACY[f.file];
  if (!keep) continue;
  for (const item of listOf(f)) {
    if (!keep.includes(item.name)) continue;
    const def = NACHO_LEGACY_DEFS[item.name];
    if (!def) throw new Error(`nacho: legacy joker '${item.name}' has no behaviour`);
    const c = addon_pokemon_center(item, def, { prefix: 'nacho', file: f.file, sprites: SPRITES164 });
    // (1.6.4 listed Megas the upgrade re-keyed / dropped: the re-keyed ones are attached instead, Mega Salamence is gone)
    delete c.megas;
    if (LEGACY_MEGA[item.name]) attach_mega(c.key, LEGACY_MEGA[item.name]);
    c.nacho_legacy = '1.6.4';
    c.legacy = true; // (generic: the deck editor's pickers and the design wiki leave it out)
    c.in_pool = () => false;
    if (c.soul_pos && c.soul_pos.draw !== undefined) delete c.soul_pos.draw;
    centers.push(c);
    LEGACY_KEYS.push(c.key);
  }
}
// Pokermon's random-Pokémon picks (Poké Balls, Zorua's disguise, Transformation, ...) walk every registered center: keep
// Nacho's out while the mod or the line is off, and never pick a legacy or an unavailable one.
POKE_POOL_RULES.push((c) => (c.mod === NACHO_ID && (!centerActive(c) || c.nacho_legacy || c.nacho_unavailable) ? false : undefined));
// Add-on dedupe (Pokermon precedence; pokermon/systems/precedence.js): the legacy Ralts / Swablu / Bagon lines are Pokermon's.
// (No 1.7.9 joker is a Pokermon joker: the check is for any future overlap; Pokermon wins it.)
export const REPLACED = mark_precedence(centers);

// ------------------------------------------------------------------ consumables, pack, tag, sticker, challenges
const consumables = [];
for (const f of DATA.groups.consumables) {
  for (const item of listOf(f)) {
    const c = stripFns(item);
    Object.assign(c, behaviourOf(APPLES[item.key]));
    c.key = 'c_nacho_' + item.key;
    c.set = 'Item'; // (1.7.9's poke_item = our Item: Pokermon set_aliases)
    c.consumeable = true;
    c.atlas = 'nacho_consumables179';
    c.mod_option = 'Applin';
    c.poke_file = f.file;
    consumables.push(c);
  }
}
const boosters = [];
for (const f of DATA.groups.boosters) {
  for (const item of listOf(f)) {
    const c = stripFns(item);
    delete c.artist;
    Object.assign(c, behaviourOf(ANCIENT_PACK));
    c.key = 'p_nacho_' + item.key;
    c.set = 'Booster';
    c.atlas = 'nacho_boosters179';
    c.poke_file = f.file;
    boosters.push(c);
  }
}
const tags = [];
for (const f of DATA.groups.tags) {
  for (const item of listOf(f)) {
    const c = stripFns(item);
    Object.assign(c, behaviourOf(FOSSIL_TAG));
    c.key = 'tag_nacho_' + item.key;
    c.set = 'Tag';
    c.name = item.name;
    c.atlas = 'nacho_tags179';
    c.poke_file = f.file;
    tags.push(c);
  }
}
const stickers = [];
for (const f of DATA.groups.stickers) {
  for (const item of listOf(f)) {
    // stellar_sticker: the Stellar Tera flag (prefix_config key = false: the ability key is `stellar_sticker`); badge hidden,
    // never rolled (rate 0), no collection entry; 1.7.9 draws it from Pokermon's sticker sheet {7,1}.
    const s = stripFns(item);
    delete s.prefix_config;
    stickers.push({ ...s, atlas: 'poke_AtlasStickersBasic391', label: 'Tera', type: 'Stellar', hide_badge: true, gradient: STELLAR_GRADIENT });
  }
}
/** A Lua empty table survives the export as {}: list fields of a challenge become []. */
const listy = (x) => (Array.isArray(x) ? x : isTable(x) && !Object.keys(x).length ? [] : x);
export const CHALLENGES = [];
for (const f of DATA.groups.challenges) for (const item of listOf(f)) {
  const ch = { ...stripFns(item), key: 'c_nacho_' + item.key, mod: NACHO_ID, button_colour: '#E9B800' };
  if (ch.restrictions) for (const k of Object.keys(ch.restrictions)) ch.restrictions[k] = listy(ch.restrictions[k]);
  CHALLENGES.push(ch);
}

// ------------------------------------------------------------------ loc (1.7.9 over 1.6.4: the legacy jokers keep their text)
const LOC_SET = { poke_item: 'Item', poke_energy: 'Energy' };
const loc = JSON.parse(JSON.stringify(DATA164.loc));
for (const [set, entries] of Object.entries(DATA.loc.descriptions || {})) {
  const to = LOC_SET[set] || set;
  loc.descriptions[to] = { ...(loc.descriptions[to] || {}), ...JSON.parse(JSON.stringify(entries)) };
}
loc.misc = loc.misc || {};
for (const [k, v] of Object.entries(DATA.loc.misc || {})) loc.misc[k] = { ...(loc.misc[k] || {}), ...JSON.parse(JSON.stringify(v)) };
loc.misc.dictionary = loc.misc.dictionary || {};
loc.misc.dictionary.poke_stellar_badge = 'Stellar'; // (lovely patch on Pokermon's en-us.lua)
// The re-keyed Megas carry their text inline (loc_txt): Joker entries under their j_poke_* keys.
for (const f of DATA.groups.jokers) for (const item of listOf(f)) {
  if (item.loc_txt && item.nacho_inject_prefix) loc.descriptions.Joker['j_' + item.nacho_inject_prefix + '_' + item.name] = JSON.parse(JSON.stringify(item.loc_txt));
}
// The Stellar sticker's text (Nacho has none for the sticker key itself): its Stellar Type box.
loc.descriptions.Other = loc.descriptions.Other || {};
if (loc.descriptions.Other.stellar_type) loc.descriptions.Other.stellar_sticker = JSON.parse(JSON.stringify(loc.descriptions.Other.stellar_type));

// ------------------------------------------------------------------ options (1.7.9 config.lua defaults)
const OPT = (def, label) => ({ default: def, label });
const options = {};
for (const l of LINES) if (l.option && !l.unavailable) {
  const first = l.names[0];
  // (the option key, readable: some 1.7.9 names carry text markup — '{s:0.6}Hisuian{}Zorua')
  const label = l.option.replace(/_/g, ' ') + (l.names.length > 1 ? ' line' : '');
  void first;
  options[l.option] = OPT(true, label);
}

export const NACHO = registerMod({
  id: NACHO_ID,
  name: "Nacho's Pokermon Dip",
  prefix: 'nacho',
  version: '1.7.9-5',
  // Our behaviour counter (mods/pins.js; the pin reads "1.7.9-5 (rev 2)"). 1 = the add-on dedupe (1.6.4). 2 = the 1.7.9-5
  // upgrade (batches 18 / 19) with our deviations: the intended-design fixes and Micatro shapes listed in PORTING.md
  // "1.7.9 upgrade" (Palafin-Hero's perma X Mult from 0, Mega Gallade's Energy limit on base jokers, Dhelmise's held card).
  contentRev: 2,
  by: 'Eternalnacho & contributors (rebuilt for Micatro)',
  badge_colour: '#E9B800',
  requires: ['pokermon'],
  // Steamodded seams (js/engine/smods.js): modify_scoring_hand (Rampardos), ending_booster / modify_booster_card (Oranguru),
  // 'unscored' destroy_card (Cranidos), the mod-level calculate (Palafin's return).
  smods_seams: true,
  description: 'More Pokémon for Pokermon (the Sinnoh starters, fossils, Applin, Frigibax, Terapagos...), Megas for Pokermon’s Gardevoir, Altaria and Gallade, the apples, the Ancient Pack and the Stellar type.',
  options,
  content: { centers: [...centers, ...consumables, ...boosters], tags, stickers, atlases, loc },
  hooks,
  challenges: CHALLENGES, // (engine/challenge.js plays them; sinnoh_adv is systems.js)
  // Retired keys (Plans/MICATRO_MODS_UPGRADES.md "Mod upgrade checklist"): the renamed ones resolve to their new key when a
  // save / replay / custom deck / sticker names them (js/mods/aliases.js). The legacy definitions stay registered: no alias.
  aliases: {
    renamed: {
      j_nacho_mega_gardevoir: 'j_poke_mega_gardevoir',
      j_nacho_mega_altaria: 'j_poke_mega_altaria',
      j_nacho_mega_gallade: 'j_poke_mega_gallade',
      stake_nacho_elite_stake: 'stake_poke_elite',
    },
    removed: [],
    names: {},
  },
});

/** Port status for tests / the wiki. */
export const STATUS = {
  ported: centers.filter((c) => c.set === 'Joker' && !c.unported && !c.nacho_unavailable).map((c) => c.key),
  unavailable: centers.filter((c) => c.nacho_unavailable).map((c) => c.key),
  legacy: LEGACY_KEYS.slice(),
  files: NACHO_FILES,
};
