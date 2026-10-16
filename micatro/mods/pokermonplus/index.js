/**
 * Sonfive's Pokermon+ 1.0.3-251101e (Sonfive, with marcavis, Kek & MyDude), rebuilt natively
 * for Micatro on top of the Pokermon rebuild (requires 'pokermon'; no Steamodded layer).
 *
 *   src/functions.js            functions/functions.lua: energy_shift, negative Energy (Void deck),
 *                               sandstorm/hail/rain/sunny, unique_hand_tooltip, set_debuff
 *   src/pokemon/*.js            the 9 evolution lines (18 jokers), one file per Lua file
 *   src/consumables/timerball.js  the Timer Ball (Item)
 *   src/backs/backs.js          Virtuous, Prophetic, Shiny, Rogue, Void decks
 *   src/stakes.js               Lilac Stake + the Weakened sticker (and their lovely patches)
 *
 * Jokers are registered through Pokermon's machinery the way pokermon.Pokemon(item, "sonfive")
 * does it: key j_sonfive_<name>, poke_custom_prefix 'sonfive', ptype / item_req in config.extra,
 * type badges, Pokermon's Basic sprite sheets (PokemonSprites), pokemon_in_pool, families.
 * Sleeves (CardSleeves) and the challenge UI are later phases; the 4 challenges are registered
 * as data on the mod (`challenges`).
 *
 * INTENDED-DESIGN FIXES (the owner asked for Pokermon+'s breakage to be fixed as its author
 * intended; each is tested in micatro/tests/mods/pokermonplus_test.mjs):
 *  1. None of the 18 jokers loaded as shipped: src/pokemon.lua required
 *     `sonfive_config.customJokers`, which config.lua never defines (its toggle is commented out
 *     in settings.lua). Jokers load; each line has its config.lua toggle as a mod option, all ON
 *     by default — Croagunk and Vullaby shipped off: Croagunk because it could never evolve
 *     (fixed, see 453_croagunk_line.js), Vullaby with no code reason (see 629_vullaby_line.js).
 *  2. The per-line toggles were a global override of Pokermon's pokemon_in_pool, which every
 *     Pokémon's pool check (Pokermon's own, other add-ons') was routed through. They are a
 *     Pokermon POKE_POOL_RULES entry that only ever answers for this mod's own centers.
 *  3. sandstorm() checked the nonexistent 'm_count' -> 'm_stone' (src/functions.js header).
 *  4. Nacli was staged "One" -> "Basic" (src/pokemon/932_nacli_line.js).
 *  5. energy_shift's j_marcpoke_toxtricity_amped branch (another mod's joker) is dropped.
 *  6. (Manifest: missing Steamodded/Lovely deps, jokerdisplay/definitions9.lua never loaded —
 *     irrelevant natively; JokerDisplay isn't part of Micatro.)
 *  7. Balls of Patience (src/challenges/000_balls_of_patience.lua) banned "tag_holographic", a tag
 *     Balatro doesn't have (its Holographic Tag is tag_holo), so the Holographic Tag still rolled in
 *     the challenge; it bans tag_holo. Its Buffoon-pack ban also listed p_buffoon_normal_3/_4,
 *     p_buffoon_jumbo_2 and p_buffoon_mega_2, which don't exist (every real Buffoon pack is already
 *     in the list); they are dropped.
 *  + Croagunk / Toxicroak logic, Lechonk/Oinkologne volatile flag, Darkrai on base jokers,
 *    Shiny deck weight stacking, negative Energy on base jokers, Oinkologne's sprite — each
 *    documented at its site.
 *
 * Pokermon extension points used (additive, all empty without an add-on): pools.POKE_POOL_RULES,
 * energy.ENERGY_OVERRIDES, types.ENERGY_LIMIT_BONUS, evolution.EVO_KEEP / POST_EVOLVE, and
 * anim.view_card treating centers with poke_custom_prefix as Pokémon. Engine: mod stakes
 * (newRun `stake` may be a mod stake key — run.js mod_stake_chain).
 */
import { registerMod, isActive, opt } from '../../js/mods/registry.js';
import { G, P_CENTERS } from '../../js/engine/core.js';
import PDATA from '../pokermon/data.js';
import DATA from './data.js';
import {
  add_family, poke_set_type_badge, pokemon_in_pool, POKE_POOL_RULES, ENERGY_OVERRIDES, ENERGY_LIMIT_BONUS,
  EVO_KEEP, POST_EVOLVE,
} from '../pokermon/api.js';
import { MOD_ID, set_debuff, void_energy_override, energy_plus_of, sonfive_base_evo_name } from './src/functions.js';
import { weakened_in_shop, weakened_after_evolve, lilac_stake, weakened_sticker, WEAKENED } from './src/stakes.js';
import { nightmare_after_boss } from './src/pokemon/491_darkrai_line.js';

import nincada from './src/pokemon/290_nincada_line.js';
import croagunk from './src/pokemon/453_croagunk_line.js';
import darkrai from './src/pokemon/491_darkrai_line.js';
import vullaby from './src/pokemon/629_vullaby_line.js';
import meltan from './src/pokemon/808_meltan_line.js';
import stonjourner from './src/pokemon/874_stonjourner_line.js';
import lechonk from './src/pokemon/915_lechonk_line.js';
import nacli from './src/pokemon/932_nacli_line.js';
import cetoddle from './src/pokemon/974_cetoddle_line.js';
import timerball from './src/consumables/timerball.js';
import backs from './src/backs/backs.js';
import { SLEEVES } from './sleeves.js';

const JOKER_DEFS = { ...nincada, ...croagunk, ...darkrai, ...vullaby, ...meltan, ...stonjourner, ...lechonk, ...nacli, ...cetoddle };
const PREFIX = 'sonfive';
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
const ART = '/micatro/mods/pokermonplus/assets/2x';

// ------------------------------------------------------------------ atlases
const atlases = {
  sonfive_backs: { src: ART + '/backs.png', px: 71, py: 95 },
  sonfive_consumables: { src: ART + '/consumables.png', px: 71, py: 95 },
  sonfive_sleeves: { src: ART + '/sleeves.png', px: 73, py: 95 },
  sonfive_stakes: { src: ART + '/stakes.png', px: 29, py: 29 },
  sonfive_stake_stickers: { src: ART + '/stakes_stickers.png', px: 71, py: 95 },
  sonfive_stickers: { src: ART + '/stickers.png', px: 71, py: 95 },
  sonfive_modicon: { src: ART + '/icon.png', px: 32, py: 32 },
};

// ------------------------------------------------------------------- jokers
/** pokespriteload.lua via Pokermon's PokemonSprites: the Basic sheets (registered by Pokermon). */
function jokerSprite(item, c) {
  const info = PDATA.globals.PokemonSprites[item.name] || {};
  let atlas;
  if (info.gen_atlas && item.gen) atlas = 'AtlasJokersBasicGen' + (item.gen < 10 ? '0' + item.gen : item.gen);
  else if (info.others_atlas) atlas = 'AtlasJokersBasicOthers';
  else atlas = 'AtlasJokersBasicNatdex';
  c.atlas = 'poke_' + atlas;
  const base = info.base || {};
  if (base.pos) c.pos = { ...base.pos };
  if (base.soul_pos) c.soul_pos = { ...base.soul_pos };
  // Lechonk / Cetoddle ask for Sonfive's own "Series A" art (custom_art), which Pokermon 3.2.1
  // doesn't ship: they use the Basic sprite. Oinkologne pinned atlas Gen09 at {0,0} — that cell
  // is another Pokémon; display fix: its own PokemonSprites cell.
}

const PORTED = [];
const centers = [];
const families = [];
for (const f of DATA.groups.jokers) {
  const fam = [];
  for (const item of listOf(f)) {
    const def = JOKER_DEFS[item.name];
    if (!def) throw new Error(`pokermonplus: joker '${item.name}' has no behaviour`);
    const c = stripFns(item);
    c.key = 'j_' + PREFIX + '_' + item.name;
    c.set = 'Joker';
    c.poke_custom_prefix = PREFIX;
    c.tagged = PREFIX;
    c.poke_file = f.file;
    c.rarity = c.rarity ?? 1;
    c.cost = c.cost ?? 3;
    c.blueprint_compat = !!c.blueprint_compat;
    c.perishable_compat = c.perishable_compat !== false;
    c.eternal_compat = c.eternal_compat !== false;
    c.config = c.config || {};
    if (!isTable(c.config.extra)) c.config.extra = {};
    if (c.ptype) c.config.extra.ptype = c.ptype;
    if (c.item_req) c.config.extra.item_req = c.item_req;
    if (c.evo_list) c.config.extra.evo_list = c.evo_list;
    delete c.atlas; delete c.pos;
    jokerSprite(item, c);
    // Intended-design fixes (see the line files).
    if (item.name === 'nacli') c.stage = 'Basic';
    if (item.name === 'lechonk' || item.name === 'oinkologne') c.volatile = true;
    c.set_badges = poke_set_type_badge;
    for (const [k, v] of Object.entries(def)) c[k] = v;
    // pokermon.load_pokemon: in_pool = pokemon_in_pool unless custom_pool_func (Shedinja, Melmetal).
    c.in_pool = item.custom_pool_func ? def.in_pool : (self) => pokemon_in_pool(self);
    centers.push(c);
    PORTED.push(c.key);
    fam.push(item.name);
  }
  if (fam.length > 1) families.push(fam);
}
for (const fam of families) add_family(fam);

/** The per-evolution-line toggles (config.lua), scoped to this mod's own Pokémon. */
POKE_POOL_RULES.push((center) => {
  if (!center || center.mod !== MOD_ID || !isActive(MOD_ID)) return undefined;
  return opt(MOD_ID, sonfive_base_evo_name(center)) === false ? false : undefined;
});
ENERGY_OVERRIDES.push(void_energy_override);
ENERGY_LIMIT_BONUS.push((card) => (isActive(MOD_ID) ? energy_plus_of(card) : 0));
EVO_KEEP.push('energy_plus');
POST_EVOLVE.push(weakened_after_evolve);

// --------------------------------------------------------------- consumables
for (const f of DATA.groups.consumables) {
  for (const item of listOf(f)) {
    const c = stripFns(item);
    c.key = 'c_' + PREFIX + '_' + item.key;
    c.set = item.set || 'Item';
    c.consumeable = true;
    c.atlas = 'sonfive_' + (item.atlas || 'consumables');
    c.poke_file = f.file;
    Object.assign(c, timerball[item.name] || {});
    centers.push(c);
    PORTED.push(c.key);
  }
}

// --------------------------------------------------------------------- backs
for (const f of DATA.groups.backs) {
  for (const item of listOf(f)) {
    const c = stripFns(item);
    c.key = 'b_' + PREFIX + '_' + item.key;
    c.set = 'Back';
    c.atlas = 'sonfive_' + (item.atlas || 'backs');
    c.poke_file = f.file;
    Object.assign(c, backs[item.key] || {});
    centers.push(c);
    PORTED.push(c.key);
  }
}

// ---------------------------------------------------------------- challenges
/**
 * Keys the shipped challenges name that Balatro doesn't have, mapped to the ones the author meant
 * (null = drop: the intent is already met by the rest of the list). Intended-design fix 7 above.
 */
const CHALLENGE_KEY_FIXES = {
  tag_holographic: 'tag_holo',
  p_buffoon_normal_3: null, p_buffoon_normal_4: null, p_buffoon_jumbo_2: null, p_buffoon_mega_2: null,
};
function fix_challenge_keys(c) {
  const rs = c.restrictions;
  if (!rs) return;
  const fix = (k) => (k in CHALLENGE_KEY_FIXES ? CHALLENGE_KEY_FIXES[k] : k);
  for (const list of [rs.banned_cards, rs.banned_tags, rs.banned_other]) for (const v of Array.isArray(list) ? list : []) {
    if (v && v.id) v.id = fix(v.id);
    if (v && Array.isArray(v.ids)) v.ids = v.ids.map(fix).filter(Boolean);
  }
}
/** Registered as data only (challenge UI is a later phase for every mod). */
const challenges = [];
for (const f of DATA.groups.challenges) {
  for (const item of listOf(f)) {
    const c = stripFns(item);
    c.key = 'c_' + PREFIX + '_' + item.key;
    c.name = (DATA.loc.misc.challenge_names || {})[c.key] || item.key;
    c.button_colour = '#87DEFF';
    fix_challenge_keys(c);
    challenges.push(c);
  }
}

// --------------------------------------------------------------------- hooks
const hooks = {
  create_card(card, _type, area) { weakened_in_shop(card, _type, area); },
  set_debuff,
  /** SMODS calls a deck's calculate with every context: the Void deck's Boss Blind Nightmare
   *  (its end_of_round — the engine's end_round hook runs right after the jokers' pass). */
  end_round() {
    if (G.GAME.selected_back_key === 'b_sonfive_voiddeck') nightmare_after_boss({ end_of_round: true });
  },
  /** SMODS: consumables see setting_blind too (the Timer Ball counts rounds). */
  new_round() {
    for (const c of G.consumeables.cards.slice()) {
      const mc = c.config.center;
      if (mc.mod === MOD_ID && mc.calculate && !c.debuff) mc.calculate(mc, c, { setting_blind: true, blind: G.GAME.round_resets.blind });
    }
  },
  /** Shiny deck: e_poke_shiny's weight + (rate - 1) * its base weight (the Lua get_weight wrap). */
  edition_weight(w, type) {
    if (type !== 'poke_shiny' || !G.GAME.shiny_edition_rate || G.GAME.shiny_edition_rate === 1) return undefined;
    return w + (G.GAME.shiny_edition_rate - 1) * (P_CENTERS.e_poke_shiny ? P_CENTERS.e_poke_shiny.weight : 0);
  },
  describe(card, desc) {
    if (!card.ability || !card.ability[WEAKENED] || !desc) return;
    if (Array.isArray(desc.badges)) desc.badges.push({ key: WEAKENED, label: 'Weakened', colour: weakened_sticker.badge_colour });
    const d = DATA.loc.descriptions.Other[WEAKENED];
    if (d) (desc.info = desc.info || []).push({ key: WEAKENED, name: d.name, lines: d.text.slice() });
  },
  view_card(card, v) {
    if (card.ability && card.ability[WEAKENED]) v.stickers = [...(v.stickers || []), WEAKENED];
    // Timer Ball: the soul layer changes at the Legendary tier (update()).
    if (card.config.center.key === 'c_sonfive_timerball' && card.ability.extra
      && card.ability.extra.count - card.ability.extra.round_on_add >= card.config.center.config.extra.legendary) v.soul_pos = { x: 1, y: 4 };
  },
};

// ------------------------------------------------------------------- options
const OPT = (def, label) => ({ default: def, label });
export const POKERMONPLUS = registerMod({
  id: MOD_ID,
  name: "Sonfive's Pokermon+",
  prefix: PREFIX,
  version: '1.0.3-251101e',
  by: 'Sonfive, with marcavis, Kek & MyDude (rebuilt for Micatro)',
  badge_colour: '#87DEFF',
  requires: ['pokermon'],
  description: 'Pokémon add-on: Nincada, Darkrai, Meltan, Garganacl and more, the Timer Ball, five new decks, negative Energy and the Lilac stake.',
  // config.lua's per-line toggles (all on: see fix 1) + the Timer Ball toggle (settings.lua "Extra").
  options: {
    nincada: OPT(true, 'Nincada line'),
    croagunk: OPT(true, 'Croagunk line'),
    darkrai: OPT(true, 'Darkrai'),
    vullaby: OPT(true, 'Vullaby line'),
    meltan: OPT(true, 'Meltan line'),
    stonjourner: OPT(true, 'Stonjourner'),
    lechonk: OPT(true, 'Lechonk line'),
    nacli: OPT(true, 'Nacli line'),
    cetoddle: OPT(true, 'Cetoddle line'),
    timerball: OPT(true, 'Enable Timer Ball'),
  },
  content: {
    centers,
    stakes: [lilac_stake],
    stickers: [weakened_sticker],
    atlases,
    loc: DATA.loc,
  },
  challenges,
  sleeves: SLEEVES, // (sleeves.js: deck variants, engine/sleeve.js)
  hooks,
});

export const STATUS = { PORTED, challenges };
