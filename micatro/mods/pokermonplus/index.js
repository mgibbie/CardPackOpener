/**
 * Sonfive's Pokermon+ 1.2.0-261018a (Sonfive, with marcavis, Kek, MyDude & Emma), rebuilt natively for Micatro on top of the
 * Pokermon rebuild (requires 'pokermon'; no Steamodded layer). Upstream: SonfiveTV/PokermonPlus @ 52c7416 (2026-10-18).
 * Porting notes: PORTING.md (this folder).
 *
 *   data120.js                  GENERATED 1.2.0 static data (tools/micatro/extract_mod_data.cjs + specs/pokermonplus_120.json)
 *   sprites120.js               GENERATED 3.9.1 sheet cell of every 1.2.0 joker (tools/micatro/gen_pokermonplus_120_sprites.mjs)
 *   data.js                     GENERATED 1.0.3 data: only the legacy definitions (below) read it
 *   src/functions.js            functions/functions.lua: negative Energy (Void deck), e_limit_up, Energy with an amount,
 *                               the Weakened compat pass, Grafaiai's is_type rule, tag_triggered, set_debuff
 *   src/pokemon/*.js            one per 1.2.0 Lua file (21 jokers); 290 / 453 / 629 are the 1.0.3 legacy lines
 *   src/consumables/timerball.js  the Timer Ball (Item)
 *   src/backs/backs.js          Virtuous, Shiny, Void, Rogue, Pearlescent decks (+ the legacy Prophetic deck)
 *   src/stakes.js               Lilac Stake + the Weakened and Forged stickers
 *
 * Jokers are registered through Pokermon's machinery the way pokermon.Pokemon(item, "sonfive") does it: key
 * j_sonfive_<name>, poke_custom_prefix 'sonfive', ptype / item_req in config.extra, type badges, Pokermon's 3.9.1 Basic
 * sheets (pokermon.sprites.load_sprites) or Pokermon+'s own `other` sheet, families.
 *
 * LEGACY (1.2.0 dropped them; registered so saves, replays, custom decks and win stickers resolve, an owned one keeps
 * playing its 1.0.3 behaviour; out of every pool, off the deck editor / wiki, `sonfive_legacy`):
 *   the Nincada line (base Pokermon's now: also superseded, Pokermon precedence), Croagunk / Toxicroak, Vullaby /
 *   Mandibuzz; the Prophetic deck and sleeve (off the New Run picker). The Wonder Guard challenge (1.2.0 deleted it) stays
 *   listed by the owner's ruling (its eternal Shedinja is Pokermon+'s legacy one): PORTING.md.
 *
 * INTENDED-DESIGN FIXES carried from 1.0.3 (each tested in micatro/tests/mods/pokermonplus_test.mjs): the per-line toggles are
 * a Pokermon POKE_POOL_RULES entry scoped to this mod (1.0.3 overrode Pokermon's pokemon_in_pool globally), the Balls of
 * Patience challenge bans Balatro's real tag_holo (it named "tag_holographic") and drops 4 nonexistent Buffoon pack ids
 * (both still wrong upstream in 1.2.0), and the legacy jokers' own fixes (their files). The 1.2.0 ones are listed in
 * PORTING.md and tested in micatro/tests/mods/pokermonplus_120_test.mjs.
 *
 * Pokermon extension points used (additive, all empty without an add-on): pools.POKE_POOL_RULES, energy.ENERGY_OVERRIDES,
 * types.ENERGY_LIMIT_BONUS, types.IS_TYPE_RULES, evolution.EVO_KEEP / POST_EVOLVE, precedence.mark_precedence, and
 * anim.view_card treating centers with poke_custom_prefix as Pokémon. Engine: mod stakes, the hooks below (no_interest,
 * evaluate_round, reroll_shop, chip_h_x_mult, p_dollars, card_repetitions, create_card, describe, view_card).
 */
import { registerMod, isActive, opt } from '../../js/mods/registry.js';
import { G, P_CENTERS } from '../../js/engine/core.js';
import PDATA from '../pokermon/data.js';
import DATA from './data.js';
import DATA120 from './data120.js';
import SPRITES120 from './sprites120.js';
import {
  add_family, poke_set_type_badge, pokemon_in_pool, POKE_POOL_RULES, ENERGY_OVERRIDES, ENERGY_LIMIT_BONUS, IS_TYPE_RULES,
  EVO_KEEP, mark_precedence, replaced_by, type_tooltip, get_total_energy,
} from '../pokermon/api.js';
import { MOD_ID, set_debuff, void_energy_override, e_limit_up_of, sonfive_base_evo_name, grafaiai_is_type, deenergize_one } from './src/functions.js';
import { weakened_in_shop, lilac_stake, weakened_sticker, forged_sticker, WEAKENED, FORGED } from './src/stakes.js';
import { perma_h_x_mult, perma_repetitions } from './src/pokemon/485_heatran_line.js';
import { minior_soul, minior_round_eval } from './src/pokemon/774_minior_line.js';
import { void_reroll } from './src/backs/backs.js';

import nincada from './src/pokemon/290_nincada_line.js';
import croagunk from './src/pokemon/453_croagunk_line.js';
import vullaby from './src/pokemon/629_vullaby_line.js';
import heatran from './src/pokemon/485_heatran_line.js';
import darkrai from './src/pokemon/491_darkrai_line.js';
import helioptile from './src/pokemon/694_helioptile_line.js';
import minior from './src/pokemon/774_minior_line.js';
import meltan from './src/pokemon/808_meltan_line.js';
import stonjourner from './src/pokemon/874_stonjourner_line.js';
import duraludon from './src/pokemon/884_duraludon_line.js';
import lechonk from './src/pokemon/915_lechonk_line.js';
import nacli from './src/pokemon/932_nacli_line.js';
import shroodle from './src/pokemon/944_shroodle_line.js';
import cetoddle from './src/pokemon/974_cetoddle_line.js';
import key_items from './src/pokemon/key_items.js';
import canari from './src/pokemon/zzz_canari_plush.js';
import timerball from './src/consumables/timerball.js';
import backs from './src/backs/backs.js';
import { SLEEVES } from './sleeves.js';

/** 1.2.0's jokers by name; the legacy (1.0.3) lines apart. */
const JOKER_DEFS = { ...heatran, ...darkrai, ...helioptile, ...minior, ...meltan, ...stonjourner, ...duraludon, ...lechonk, ...nacli, ...shroodle, ...cetoddle, ...key_items, ...canari };
const LEGACY_DEFS = { ...nincada, ...croagunk, ...vullaby };
/** The 1.0.3 files 1.2.0 dropped (or emptied): every joker in them is a legacy definition. */
const LEGACY_FILES = ['src/pokemon/290_nincada_line.lua', 'src/pokemon/453_croagunk_line.lua', 'src/pokemon/629_vullaby_line.lua'];
export const LEGACY_VERSION = '1.0.3-251101e';
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

// ------------------------------------------------------------------ atlases (1.2.0's new / changed sheets vendored as *-120.png)
const atlases = {
  sonfive_backs: { src: ART + '/backs-120.png', px: 71, py: 95 },
  sonfive_consumables: { src: ART + '/consumables.png', px: 71, py: 95 },
  sonfive_sleeves: { src: ART + '/sleeves.png', px: 73, py: 95 },
  sonfive_stakes: { src: ART + '/stakes.png', px: 29, py: 29 },
  sonfive_stake_stickers: { src: ART + '/stakes_stickers.png', px: 71, py: 95 },
  sonfive_stickers: { src: ART + '/stickers-120.png', px: 71, py: 95 },
  sonfive_other: { src: ART + '/other-120.png', px: 71, py: 95 },
  sonfive_modicon: { src: ART + '/icon.png', px: 32, py: 32 },
};

// ------------------------------------------------------------------- jokers
/** 1.0.3 (legacy): pokespriteload.lua via Pokermon's 3.2.1 PokemonSprites, the Basic sheets (registered by Pokermon). */
function legacySprite(item, c) {
  const info = PDATA.globals.PokemonSprites[item.name] || {};
  let atlas;
  if (info.gen_atlas && item.gen) atlas = 'AtlasJokersBasicGen' + (item.gen < 10 ? '0' + item.gen : item.gen);
  else if (info.others_atlas) atlas = 'AtlasJokersBasicOthers';
  else atlas = 'AtlasJokersBasicNatdex';
  c.atlas = 'poke_' + atlas;
  const base = info.base || {};
  if (base.pos) c.pos = { ...base.pos };
  if (base.soul_pos) c.soul_pos = { ...base.soul_pos };
}
/** 1.2.0: its own `other` sheet (sonfive_other), or the joker's 3.9.1 PokemonSprites cell (sprites120.js). */
function sprite120(item, c) {
  if (item.atlas) {
    c.atlas = item.atlas; // 'sonfive_other'
    c.pos = { ...item.pos };
    if (item.soul_pos) c.soul_pos = { ...item.soul_pos };
    return;
  }
  const s = SPRITES120[item.name];
  if (!s) throw new Error(`pokermonplus: joker '${item.name}' has no 3.9.1 sprite`);
  c.atlas = 'poke_' + s.atlas + '391';
  c.pos = { ...s.pos };
  if (s.soul_pos) c.soul_pos = { ...s.soul_pos };
}

function makeCenter(f, item, def, legacy) {
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
  delete c.atlas; delete c.pos; delete c.soul_pos;
  if (legacy) {
    legacySprite(item, c);
    c.sonfive_legacy = LEGACY_VERSION;
    c.legacy = true; // (generic: the deck editor's pickers and the design wiki leave it out)
  } else sprite120(item, c);
  c.set_badges = poke_set_type_badge;
  for (const [k, v] of Object.entries(def)) c[k] = v;
  // 1.2.0 jokers: Pokermon 3.9.1 shows the type / Energy tooltip itself (1.0.3 called type_tooltip in each loc_vars)
  if (!legacy && c.stage !== 'Other' && def.loc_vars) {
    const lv = def.loc_vars;
    c.loc_vars = function (self, info_queue, card) { type_tooltip(self, info_queue, card); return lv.call(this, self, info_queue, card); };
  }
  // pokermon.load_pokemon: an item's own in_pool (Melmetal, the key items), else pokemon_in_pool; a legacy joker: never
  if (legacy) c.in_pool = () => false;
  else c.in_pool = def.in_pool ? def.in_pool : (self) => pokemon_in_pool(self);
  return c;
}

const PORTED = [];
export const LEGACY_KEYS = [];
const centers = [];
const families = [];
// the 1.2.0 jokers
for (const f of DATA120.groups.jokers) {
  const fam = [];
  for (const item of listOf(f)) {
    const def = JOKER_DEFS[item.name];
    if (!def) throw new Error(`pokermonplus: joker '${item.name}' has no behaviour`);
    const c = makeCenter(f, item, def, false);
    // 1.2.0 loaders/pokemon.lua: the line's config key (its first name, or the item's own: the key items' "key_items")
    c.sonfive_config_key = item.sonfive_config_key || listOf(f)[0].name;
    centers.push(c);
    PORTED.push(c.key);
    fam.push(item.name);
  }
  if (fam.length > 1) families.push(fam);
}
// the legacy (1.0.3) lines
for (const f of DATA.groups.jokers) {
  if (!LEGACY_FILES.includes(f.file)) continue;
  const fam = [];
  for (const item of listOf(f)) {
    const def = LEGACY_DEFS[item.name];
    if (!def) throw new Error(`pokermonplus: legacy joker '${item.name}' has no behaviour`);
    const c = makeCenter(f, item, def, true);
    c.sonfive_config_key = listOf(f)[0].name;
    centers.push(c);
    LEGACY_KEYS.push(c.key);
    fam.push(item.name);
  }
  if (fam.length > 1) families.push(fam);
}
for (const fam of families) add_family(fam);
// Add-on dedupe (Pokermon precedence; pokermon/systems/precedence.js): the legacy Nincada / Ninjask / Shedinja are Pokermon's.
// Every 1.2.0 joker is checked too (none is a Pokermon joker today; any future overlap goes to Pokermon).
export const REPLACED = mark_precedence(centers);

/** The per-line toggles (config.lua; 1.2.0 reset_game_globals bans a disabled line), scoped to this mod; never a legacy joker. */
POKE_POOL_RULES.push((center) => {
  if (!center || center.mod !== MOD_ID) return undefined;
  if (center.sonfive_legacy) return false;
  if (!isActive(MOD_ID)) return undefined;
  return opt(MOD_ID, center.sonfive_config_key || sonfive_base_evo_name(center)) === false ? false : undefined;
});
ENERGY_OVERRIDES.push(void_energy_override);
ENERGY_LIMIT_BONUS.push((card) => (isActive(MOD_ID) ? e_limit_up_of(card) : 0));
IS_TYPE_RULES.push(grafaiai_is_type);
EVO_KEEP.push('e_limit_up');

// --------------------------------------------------------------- consumables
for (const f of DATA120.groups.consumables) {
  for (const item of listOf(f)) {
    const c = stripFns(item);
    c.key = 'c_' + PREFIX + '_' + item.key;
    c.set = 'Item'; // (1.2.0's poke_item: Pokermon's set alias for Item)
    c.consumeable = true;
    c.atlas = 'sonfive_' + (item.atlas || 'consumables');
    c.poke_file = f.file;
    Object.assign(c, timerball[item.name] || {});
    centers.push(c);
    PORTED.push(c.key);
  }
}

// --------------------------------------------------------------------- backs
function makeBack(f, item, legacy) {
  const c = stripFns(item);
  c.key = 'b_' + PREFIX + '_' + item.key;
  c.set = 'Back';
  c.atlas = 'sonfive_' + (item.atlas || 'backs');
  c.poke_file = f.file;
  Object.assign(c, backs[item.key] || {});
  if (legacy) { c.legacy = true; c.sonfive_legacy = LEGACY_VERSION; }
  return c;
}
for (const f of DATA120.groups.backs) for (const item of listOf(f)) { const c = makeBack(f, item, false); centers.push(c); PORTED.push(c.key); }
// the legacy Prophetic deck (1.0.3; off the New Run picker)
for (const f of DATA.groups.backs) for (const item of listOf(f)) if (item.key === 'propheticdeck') { const c = makeBack(f, item, true); centers.push(c); LEGACY_KEYS.push(c.key); }

// ---------------------------------------------------------------- challenges
/**
 * Keys the shipped challenges name that Balatro doesn't have, mapped to the ones the author meant
 * (null = drop: the intent is already met by the rest of the list). 1.0.3 intended-design fix, still needed in 1.2.0.
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
const challengeOf = (item, loc) => {
  const c = stripFns(item);
  c.key = 'c_' + PREFIX + '_' + item.key;
  c.name = ((loc.misc || {}).challenge_names || {})[c.key] || item.key;
  c.button_colour = '#87DEFF';
  // (1.2.0 gives Metallurgy / Salt Cured a custom rule {id = 'no'} with no text and no effect — a placeholder for the
  // challenge screen's rules line; not ported: our screen lists rules only when there are some.)
  if (c.rules && Array.isArray(c.rules.custom)) c.rules.custom = c.rules.custom.filter((r) => r && r.id !== 'no');
  fix_challenge_keys(c);
  return c;
};
/** Registered as data (engine/challenge.js plays them). */
const challenges = [];
for (const f of DATA120.groups.challenges) for (const item of listOf(f)) challenges.push(challengeOf(item, DATA120.loc));
// Wonder Guard: 1.2.0 deleted it (with its Shedinja). Kept and still listed (the owner's ruling: it keeps Pokermon+'s own —
// now the legacy — Shedinja), so old runs and its win stickers stay; PORTING.md.
for (const f of DATA.groups.challenges) for (const item of listOf(f)) if (item.key === 'wonder_guard') challenges.unshift(challengeOf(item, DATA.loc));

// ---------------------------------------------------------------------- loc
/** 1.2.0's text over 1.0.3's (the legacy cards keep theirs). */
function mergeLoc(base, over) {
  const out = JSON.parse(JSON.stringify(base));
  for (const sec of ['descriptions', 'misc']) {
    out[sec] = out[sec] || {};
    for (const [set, entries] of Object.entries((over && over[sec]) || {})) out[sec][set] = { ...(out[sec][set] || {}), ...entries };
  }
  return out;
}
export const LOC = mergeLoc(DATA.loc, DATA120.loc);

// --------------------------------------------------------------------- hooks
/** What a Forged card keeps (Steamodded localize_perma_bonuses: the permanent values the card text doesn't show). */
function forged_lines(a) {
  const out = [];
  if (a.perma_mult) out.push('{C:mult}+' + a.perma_mult + '{} Mult');
  if (a.perma_x_mult) out.push('{X:mult,C:white}X' + (a.perma_x_mult + 1) + '{} Mult');
  if (a.perma_h_x_mult) out.push('{X:mult,C:white}X' + (a.perma_h_x_mult + 1) + '{} Mult while held');
  if (a.perma_h_dollars) out.push('{C:money}$' + a.perma_h_dollars + '{} if held at end of round');
  if (a.perma_p_dollars) out.push('{C:money}+$' + a.perma_p_dollars + '{} when scored');
  if (a.perma_repetitions) out.push('Retrigger {C:attention}' + a.perma_repetitions + '{} time' + (a.perma_repetitions > 1 ? 's' : ''));
  return out;
}
const isPlus = (c) => !!(c && c.config && c.config.center && c.config.center.mod === MOD_ID);
const hooks = {
  create_card(card, _type, area) {
    // Pearlescent deck (its lovely patch, after the card is made): every joker -1 Energy, -1 Energy limit.
    if (_type === 'Joker' && G.GAME.modifiers.sonfive_pearlescent) deenergize_one(card);
    // the Lilac stake's Weakened sticker (Steamodded's sticker roll)
    weakened_in_shop(card, _type, area);
  },
  set_debuff,
  /** Lechonk / Oinkologne: no interest while either is held (lovely). */
  no_interest() { return G.jokers.cards.some((j) => isPlus(j) && (j.ability.name === 'lechonk' || j.ability.name === 'oinkologne')) ? true : undefined; },
  /** The cash out: the Pearlescent deck's row ($1 per de-energized joker) and Minior's round_eval (shields back up). */
  evaluate_round() {
    for (const j of G.jokers.cards) if (isPlus(j) && j.ability.name === 'minior') minior_round_eval(j);
    if (!G.GAME.modifiers.sonfive_pearlescent) return undefined;
    const tally = G.jokers.cards.filter((j) => get_total_energy(j) < 0).length;
    if (tally <= 0) return undefined;
    return [{ name: 'custom', dollars: tally, bonus: true, disp: tally, text: G.GAME.modifiers.sonfive_pearlescent_text || ' De-Energized Jokers' }];
  },
  /** The Void deck's calculate on context.reroll_shop (the Void Sleeve has its own: sleeves.js). */
  reroll_shop() { if (G.GAME.selected_back_key === 'b_sonfive_voiddeck') void_reroll(P_CENTERS.b_sonfive_voiddeck.config, G.GAME.selected_back); },
  /** SMODS: consumables see setting_blind too (the Timer Ball counts rounds). */
  new_round() {
    for (const c of G.consumeables.cards.slice()) {
      const mc = c.config.center;
      if (mc.mod === MOD_ID && mc.calculate && !c.debuff) mc.calculate(mc, c, { setting_blind: true, blind: G.GAME.round_resets.blind });
    }
  },
  // Heatran's forged cards: Steamodded's permanent values the engine doesn't score itself.
  // (perma_p_dollars is base Pokermon's hook since its contentRev 20 — Sprigatito's Lucky cards use it too; one hook, never twice)
  chip_h_x_mult: perma_h_x_mult,
  card_repetitions: perma_repetitions,
  /** Shiny Sleeve: e_poke_shiny's weight + (rate - 1) * its base weight (the Lua get_weight wrap). */
  edition_weight(w, type) {
    if (type !== 'poke_shiny' || !G.GAME.shiny_edition_rate || G.GAME.shiny_edition_rate === 1) return undefined;
    return w + (G.GAME.shiny_edition_rate - 1) * (P_CENTERS.e_poke_shiny ? P_CENTERS.e_poke_shiny.weight : 0);
  },
  describe(card, desc) {
    if (!card.ability || !desc) return;
    for (const [k, st] of [[WEAKENED, weakened_sticker], [FORGED, forged_sticker]]) {
      if (!card.ability[k]) continue;
      if (Array.isArray(desc.badges)) desc.badges.push({ key: k, label: st.label, colour: st.badge_colour });
      const d = LOC.descriptions.Other[k];
      if (d) (desc.info = desc.info || []).push({ key: k, name: d.name, lines: d.text.slice().concat(k === FORGED ? forged_lines(card.ability) : []) });
    }
  },
  view_card(card, v) {
    if (card.ability && card.ability[WEAKENED]) v.stickers = [...(v.stickers || []), WEAKENED];
    if (card.ability && card.ability[FORGED]) v.stickers = [...(v.stickers || []), FORGED];
    // Minior: its shell or its Core floats over the card (set_sprites)
    if (card.config.center.key === 'j_sonfive_minior') { const s = minior_soul(card); if (s) v.soul_pos = s; }
  },
};

// ------------------------------------------------------------------- options
const OPT = (def, label) => ({ default: def, label });
const LEGACY_OPT = (label) => ({ ...OPT(true, label), hidden: () => true });
export const POKERMONPLUS = registerMod({
  id: MOD_ID,
  name: "Sonfive's Pokermon+",
  prefix: PREFIX,
  version: '1.2.0-261018a',
  // Our behaviour counter (mods/pins.js; the pin reads "1.2.0-261018a (rev 2)"). 1 = the add-on dedupe (Pokermon precedence,
  // Pokermon PORTING.md "Add-on dedupe"); 2 = the 1.2.0 upgrade's intended-design fixes and Micatro shapes (PORTING.md).
  contentRev: 2,
  by: 'Sonfive, with marcavis, Kek, MyDude & Emma (rebuilt for Micatro)',
  badge_colour: '#87DEFF',
  requires: ['pokermon'],
  description: 'Pokémon add-on: Heatran, Darkrai and Mega Darkrai, Minior, Archaludon, Grafaiai, Garganacl and more, the Canari Plush, two key items, the Timer Ball, five decks, negative Energy and the Lilac stake.',
  // config.lua's per-line toggles (all on) + the Timer Ball toggle (settings.lua "Extra").
  options: {
    // Hidden while base Pokermon supersedes the whole line (always: Pokermon+ requires Pokermon; PORTING.md "Add-on
    // dedupe"): the toggle only gates Pokermon+'s own Nincada / Ninjask / Shedinja, which are out of every pool anyway
    // (1.2.0 ships the line empty; ours is legacy), so it would do nothing. The value stays stored and read (a saved
    // selection / recipe with nincada: false loads).
    nincada: { ...OPT(true, 'Nincada line'), hidden: () => ['j_sonfive_nincada', 'j_sonfive_ninjask', 'j_sonfive_shedinja'].every((k) => replaced_by(k)) },
    darkrai: OPT(true, 'Darkrai'),
    heatran: OPT(true, 'Heatran'),
    helioptile: OPT(true, 'Helioptile line'),
    minior: OPT(true, 'Minior'),
    meltan: OPT(true, 'Meltan line'),
    stonjourner: OPT(true, 'Stonjourner'),
    lechonk: OPT(true, 'Lechonk line'),
    duraludon: OPT(true, 'Duraludon line'),
    nacli: OPT(true, 'Nacli line'),
    shroodle: OPT(true, 'Shroodle line'),
    cetoddle: OPT(true, 'Cetoddle line'),
    canari_plush: OPT(true, 'Canari Plush'),
    key_items: OPT(true, 'Key items'),
    timerball: OPT(true, 'Enable Timer Ball'),
    // 1.0.3 lines 1.2.0 dropped (legacy, never in a pool): hidden; a stored value still loads.
    croagunk: LEGACY_OPT('Croagunk line'),
    vullaby: LEGACY_OPT('Vullaby line'),
  },
  content: {
    centers,
    stakes: [lilac_stake],
    stickers: [weakened_sticker, forged_sticker],
    atlases,
    loc: LOC,
  },
  challenges,
  sleeves: SLEEVES, // (sleeves.js: deck variants, engine/sleeve.js)
  hooks,
});

export const STATUS = { PORTED, LEGACY_KEYS, challenges };
