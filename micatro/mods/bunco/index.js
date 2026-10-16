/**
 * Bunco 5.1 (Firch, RENREN, Peas, minichibis, J.D., Guwahavel, Ciirulean & ejwu; Steamodded 1.0), rebuilt
 * natively for Micatro. Source: `Desktop/mods off/Bunco-main` — Bunco.lua (all the content), lovely.toml
 * (~160 patches), localization/default.lua, assets/. Keys keep the mod's prefix (`j_bunc_...`, `c_bunc_...`).
 * Static numbers come from data.js / loc.js (generated from the mod's own Lua by tools/micatro/extract_mod_data.cjs,
 * spec tools/micatro/specs/bunco.json); behaviour is ported by hand in the content modules:
 *   jokers_a.js / jokers_b.js / jokers_c.js   the 80 jokers (incl. the 13 Exotic and the legendary Rigoletto)
 *   systems.js       exotic suits (Fleurons, Halberds) + the Exotic System toggle, the 5 poker hands (Spectrum,
 *                    Straight Spectrum, Spectrum House, Spectrum Five, Deal), linked cards (selection, draw,
 *                    destruction), The 8's selection bypass, temporary extra chips, the Exotic Smeared rule
 *   flow.js          the discard / play rule changes (Cracker Cards, The Paling / Claw / Swing / Umbrella /
 *                    Magenta Dagger), the Copper re-score pass, the hand_played tags' scoring steps
 *   consumables.js   6 tarots, 4 planets, Cleanse, the Polymino type (The I, O, T, S, Z, J, L, /) and The 8
 *   packs.js         4 Blind Packs (Blind cards that replace this ante's boss) + 4 Virtual Packs (the whole deck,
 *                    Polyminoes used at once), Shell Game's pack reroll, Lamination / Supercoating editions
 *   blinds.js        20 bosses + 5 finishers
 *   tags.js          16 tags (+ the Pin Collector Double -> Triple swap and Fanny Pack)
 *   vouchers.js      12 vouchers
 *   decks.js         Fairy, Digital
 *   editions.js      Glitter (X1.3 Chips), Fluorescent (never debuffed or flipped) + their shaders
 *   enhancements.js  Cracker, Copper
 *   stickers.js      Scattering, Hindered, Reactive + the Cyan / Pink / Magenta stakes (and the Gold takeover)
 *   reworks.js       the `gameplay_reworks` option (Lovers, Luchador, Red Card, Boss Tag, D6 Tag, Wheel of
 *                    Fortune / Aura with Glitter) and the `fixed_sprites` / `fixed_badges` options
 * The lovely patches become hooks (see each module); the engine seams Bunco needed are listed in
 * js/mods/registry.js (HOOKS, "Bunco" block) plus MOD_SUITS / MOD_POKER_HANDS (generic mod suits and poker hands).
 *
 * Skipped (see the module headers for details): the unlock conditions (Micatro has everything unlocked — and
 * The Depths / The Chasm's "won the deck on stake 7 / 10" profile checks count as met), the 4 deck skins
 * (later phase), the high_quality_shaders background / splash / flame replacements, the colorful_finishers
 * background tints, the replacement font ("text icons"), JokerDisplay compat, the config / credits tabs,
 * and the "Infinite redebuff fix" lovely patch (a guard for an SMODS re-debuff loop Micatro doesn't have).
 */
import { registerMod } from '../../js/mods/registry.js';
import DATA from './data.js';
import LOC from './loc.js';
import { MOD_ID, ART, SND } from './util.js';
import * as EDITIONS from './editions.js';
import * as STICKERS from './stickers.js';
import * as JA from './jokers_a.js';
import * as JB from './jokers_b.js';
import * as JC from './jokers_c.js';
import * as SYSTEMS from './systems.js';
import * as FLOW from './flow.js';
import * as CONSUMABLES from './consumables.js';
import * as PACKS from './packs.js';
import * as BLINDS from './blinds.js';
import * as TAGS from './tags.js';
import * as VOUCHERS from './vouchers.js';
import * as DECKS from './decks.js';
import * as ENH from './enhancements.js';
import * as REWORKS from './reworks.js';

// Order matters where several modules answer the same hook (first answer wins for plain hooks):
// editions first (Fluorescent's prevent_debuff), blinds before jokers (Vermilion Trident counts a payment
// before Fiendish / Bounty Hunter change it; The Swing / The Umbrella act before Cellphone on a play), the
// jokers before systems (Myopia / Astigmatism's is_suit before the Exotic Smeared rule) — the Lua's own order.
const PARTS = [EDITIONS, STICKERS, BLINDS, JA, JB, JC, SYSTEMS, FLOW, CONSUMABLES, PACKS, TAGS, VOUCHERS, DECKS, ENH, REWORKS];

// Value-threading hooks pass each module's result on to the next; list hooks concatenate; ANY_TRUE hooks stop
// at the first module that answers true (take-overs); ANY_FALSE hooks are false when any module says false.
const THREAD = new Set(['booster_limit', 'pack_choices', 'pack_size', 'cash_out', 'empty_pool_default', 'straight_min', 'flush_min',
  'flush_suits', 'edition_weight', 'booster_loc_vars', 'draw_hand_space', 'modify_scoring', 'highlight_limit', 'selection_limit',
  'ease_dollars', 'chip_bonus', 'chip_mult', 'chip_x_mult', 'p_dollars', 'blind_amount', 'mod_chips', 'mod_mult', 'chips_scored',
  'create_card_rarity']);
const LISTS = new Set(['evaluate_round', 'seal_retriggers', 'scoring_areas', 'card_repetitions', 'shop_card_types']);
const ANY_TRUE = new Set(['add_to_highlighted', 'remove_from_highlighted', 'use_card_override', 'discard_begin', 'discard_counted',
  'discard_end', 'skip_shop', 'sell_card_keep', 'block_eternal', 'blind_stay_flipped', 'buy_space', 'can_discard']);
const ANY_FALSE = new Set(['can_highlight', 'can_sell', 'consume_hand', 'flip', 'double_tag_copies', 'consumable_edition_scores',
  'level_up_hand', 'pool_filter', 'set_edition']);
const hooks = {};
for (const name of new Set(PARTS.flatMap((p) => Object.keys(p.hooks || {})))) {
  const fns = PARTS.map((p) => p.hooks && p.hooks[name]).filter(Boolean);
  if (fns.length === 1) { hooks[name] = fns[0]; continue; }
  if (THREAD.has(name)) hooks[name] = (v, ...a) => { for (const f of fns) { const r = f(v, ...a); if (r !== undefined) v = r; } return v; };
  else if (LISTS.has(name)) hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (r !== undefined) out = (out || []).concat(r); } return out; };
  else if (ANY_TRUE.has(name)) hooks[name] = (...a) => { for (const f of fns) if (f(...a) === true) return true; return undefined; };
  else if (ANY_FALSE.has(name)) hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (r === false) out = false; } return out; };
  else if (name === 'set_debuff') {
    hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (r === 'prevent_debuff') return r; if (r === true) out = true; } return out; };
  } else hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (out === undefined && r !== undefined) out = r; } return out; };
}

const atlases = {};
for (const a of Object.values(DATA.atlases)) {
  if (a.key === 'modicon' || /^bunco_skins_/.test(a.key)) continue; // (deck skins: a later phase)
  atlases[a.key] = { src: ART + a.path, px: a.px, py: a.py, ...(a.frames ? { frames: a.frames } : {}) };
}
const sounds = {};
for (const s of Object.values(DATA.sounds)) sounds[s.key] = { src: SND + s.path, ...(s.key === 'bunc_music_virtual' ? { music: true } : {}) };

const OPT = (def, label, desc) => ({ default: def, label, desc });
const centers = PARTS.flatMap((p) => p.centers || []);
export const BUNCO = registerMod({
  id: MOD_ID,
  name: 'Bunco',
  prefix: 'bunc',
  version: '5.1',
  by: 'Firch, RENREN, Peas, minichibis, J.D., Guwahavel, Ciirulean & ejwu (rebuilt for Micatro)',
  badge_colour: '#5C76A8',
  description: '80 jokers, two exotic suits (Fleurons, Halberds), Spectrum hands, Polymino cards that link cards together, Blind and Virtual packs, 25 blinds, 16 tags and more.',
  // config.lua (the shipped defaults)
  options: {
    gameplay_reworks: OPT(true, 'Gameplay reworks', 'Reworks some vanilla cards: Lovers, Luchador, Red Card, Boss Tag, D6 Tag, Wheel of Fortune and Aura (Glitter)'),
    jokerlike_consumable_editions: OPT(false, 'Joker-like consumable editions', 'Editions on consumables score like on jokers (off: using one gives a Tag)'),
    fixed_sprites: OPT(true, 'Fixed sprites', 'Bunco\'s cleaned-up art for 14 vanilla jokers and 14 consumables'),
    fixed_badges: OPT(false, 'Fixed badges', '"Planet" / "Planet?" badges on Pluto, Ceres and Eris (off: "Dwarf Planet")'),
  },
  content: {
    centers,
    blinds: PARTS.flatMap((p) => p.blinds || []),
    tags: PARTS.flatMap((p) => p.tags || []),
    stakes: PARTS.flatMap((p) => p.stakes || []),
    stickers: PARTS.flatMap((p) => p.stickers || []),
    suits: PARTS.flatMap((p) => p.suits || []),
    poker_hands: PARTS.flatMap((p) => p.poker_hands || []),
    poker_hand_parts: PARTS.flatMap((p) => p.poker_hand_parts || []),
    consumable_types: PARTS.flatMap((p) => p.consumable_types || []),
    atlases,
    sounds,
    loc: LOC,
  },
  hooks,
  reset_run() { for (const p of PARTS) if (typeof p.reset_run === 'function') p.reset_run(); },
});

const keys = (set) => centers.filter((c) => c.set === set).map((c) => c.key);
export const JOKER_KEYS = keys('Joker');
export const STATUS = {
  jokers: JOKER_KEYS,
  tarots: keys('Tarot'),
  planets: keys('Planet'),
  spectrals: keys('Spectral'),
  polyminoes: keys('Polymino'),
  boosters: keys('Booster'),
  vouchers: keys('Voucher'),
  decks: keys('Back'),
  editions: keys('Edition'),
  enhancements: keys('Enhanced'),
  tags: PARTS.flatMap((p) => p.tags || []).map((t) => t.key),
  blinds: PARTS.flatMap((p) => p.blinds || []).map((b) => b.key),
  stakes: PARTS.flatMap((p) => p.stakes || []).map((s) => s.key),
  stickers: PARTS.flatMap((p) => p.stickers || []).map((s) => s.key),
  suits: PARTS.flatMap((p) => p.suits || []).map((s) => s.key),
  poker_hands: PARTS.flatMap((p) => p.poker_hands || []).map((h) => h.key),
};
