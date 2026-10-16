/**
 * More Fluff 1.5.6 (notmario & contributors; Steamodded 1.0), rebuilt natively for Micatro.
 * Source: `Desktop/mods off/MoreFluff-main` — MoreFluff.lua (the active joker list), jokers/*.lua,
 * other/{colours,rotarots,enhancers,moddedpack,superboss}.lua, lovely/*.toml, localization/en-us.lua.
 * Keys keep the mod's prefix (`j_mf_<file>`, `c_mf_...`, `p_mf_...`) so descriptions match.
 * Static numbers come from data.js / loc.js (generated from the mod's own Lua by
 * tools/micatro/extract_mod_data.cjs); behaviour is ported by hand in the content modules:
 *   jokers_a.js / jokers_b.js / jokers_c.js   83 jokers (+ the Token-rarity "Oops! All 5s")
 *   colours.js      the Colour consumable type: 17 cards that CHARGE a round at a time, 4 Colour packs,
 *                   Painter's Tag, Paint Roller / Colour Theory vouchers
 *   rotarots.js     the 45 Degree Rotated Tarot type: 22 cards, 8 packs, Rotarot Tag
 *   enhancements.js 8 enhancements (Monus, Cult, Styled, Brass, Teal, Gemstone, Marigold, Yucky)
 *   superboss.js    Bigger Blind + 15 DX bosses, The Ticket, the Superboss endless mode, the challenge data
 *   extras.js       4 Modded packs + Modded Tag, Clutch Tag, 4 decks, temporary cards, music
 * The lovely patches become hooks (see each module); the engine seams they needed are the hooks
 * blind_slot / new_boss_choice / end_round_start / draw_hand_space / modify_scoring / seal_retriggers /
 * voucher_add / buy_space / can_skip_blind (js/mods/registry.js HOOKS), plus Steamodded parity in run.js
 * (mod_score_ops: x_chips / e_mult / swap / `extra` chains; joker retriggers in every scoring context;
 * a mod enhancement's repetitions and {remove}), SMODS.get_blind_amount for scaling > 3, blind_type,
 * and mod sounds (registry SOUNDS -> ui/sound.js; music via the view's `music`).
 *
 * Skipped: the cut / unused jokers (monochrome, selfinsert, colorem, farmmergecivilisation, fleshpanopticon,
 * johnbalatro, jokers/ortalab/*, jokers/familiar/*), every cross-mod item (Shape type & Ascendant tags:
 * Entropy; Art Program voucher & aliases: Cryptid; finity / Yahimod / aikoyori / ... Colour cards), the
 * CardSleeves sleeves, achievements, JokerDisplay / Balatest / DebugPlus files, the speedmult QoL patch,
 * the config menu, the title-screen card, and the debug `print(v)` of each joker file name.
 */
import { registerMod } from '../../js/mods/registry.js';
import DATA from './data.js';
import LOC from './loc.js';
import { MOD_ID, ART, SND } from './util.js';
import * as JA from './jokers_a.js';
import * as JB from './jokers_b.js';
import * as JC from './jokers_c.js';
import * as COLOURS from './colours.js';
import * as ROTAROTS from './rotarots.js';
import * as ENH from './enhancements.js';
import * as SUPERBOSS from './superboss.js';
import { CHALLENGES } from './challenges.js';
import { SLEEVES } from './sleeves.js';
import * as EXTRAS from './extras.js';

const PARTS = [JA, JB, JC, COLOURS, ROTAROTS, ENH, SUPERBOSS, EXTRAS];

// Hooks: every module may define any hook; they are composed in PARTS order.
// Value-threading hooks pass each module's result on to the next; list hooks concatenate.
const THREAD = new Set(['booster_limit', 'pack_choices', 'pack_size', 'cash_out', 'empty_pool_default', 'straight_min',
  'flush_min', 'flush_suits', 'edition_weight', 'booster_loc_vars', 'draw_hand_space', 'modify_scoring']);
const LISTS = new Set(['evaluate_round', 'seal_retriggers', 'scoring_areas']);
const hooks = {};
for (const name of new Set(PARTS.flatMap((p) => Object.keys(p.hooks || {})))) {
  const fns = PARTS.map((p) => p.hooks && p.hooks[name]).filter(Boolean);
  if (fns.length === 1) { hooks[name] = fns[0]; continue; }
  if (THREAD.has(name)) hooks[name] = (v, ...a) => { for (const f of fns) { const r = f(v, ...a); if (r !== undefined) v = r; } return v; };
  else if (LISTS.has(name)) hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (r !== undefined) out = (out || []).concat(r); } return out; };
  else hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (out === undefined && r !== undefined) out = r; } return out; };
}

const atlases = {
  mf_jokers: { src: ART + 'mf_jokers_refresh.png', px: 71, py: 95 },
  mf_hyperjimbo: { src: ART + 'mf_hyperjimbo.png', px: 95, py: 95 },
  mf_rot_cartomancer: { src: ART + 'mf_rot_cartomancer.png', px: 112, py: 112 },
  mf_colours: { src: ART + 'mf_colours_refresh.png', px: 71, py: 95 },
  mf_rotarots: { src: ART + 'mf_rotarots.png', px: 107, py: 107 },
  mf_rotarotpacks: { src: ART + 'mf_rotarotpacks.png', px: 106, py: 106 },
  mf_packs: { src: ART + 'mf_packs.png', px: 71, py: 95 },
  mf_vouchers: { src: ART + 'mf_vouchers.png', px: 71, py: 95 },
  mf_enhancers: { src: ART + 'mf_enhancers.png', px: 71, py: 95 },
  mf_tags: { src: ART + 'mf_tags.png', px: 34, py: 34 },
  mf_blinds: { src: ART + 'mf_blinds.png', px: 34, py: 34, frames: 21 },
  mf_lst: { src: ART + 'lightningstrikesthrice.png', px: 32, py: 32 },
  mf_mv: { src: ART + 'mf_mv.png', px: 71, py: 95 },
  mf_watermark: { src: ART + 'watermark.png', px: 336, py: 32 },
};

// SMODS.Sound: the four music tracks (picked through the run view: extras.js `view` hook) and the sfx.
const sounds = {
  mf_music_colourpack: { src: SND + 'music_colourpack.ogg', music: true },
  mf_music_rotarot: { src: SND + 'music_rotarot.ogg', music: true },
  mf_music_modded: { src: SND + 'music_modded.ogg', music: true },
  mf_music_duelzone: { src: SND + 'music_duelzone.ogg', music: true },
  mf_treethree: { src: SND + 'treethree.ogg' },
  mf_lightningstrikesthrice: { src: SND + 'lightningstrikesthrice.ogg' },
  mf_horsebounce: { src: SND + 'horsebounce.ogg' },
};

const centers = PARTS.flatMap((p) => p.centers || []);
export const MOREFLUFF = registerMod({
  id: MOD_ID,
  name: 'More Fluff',
  prefix: 'mf',
  version: '1.5.6',
  by: 'notmario & contributors (rebuilt for Micatro)',
  badge_colour: '#814BA8',
  description: '83 jokers, Colour cards that charge up over rounds, Rotarot cards, new enhancements and decks, and DX Superboss blinds for after you win.',
  content: {
    centers,
    blinds: PARTS.flatMap((p) => p.blinds || []),
    tags: PARTS.flatMap((p) => p.tags || []),
    consumable_types: PARTS.flatMap((p) => p.consumable_types || []),
    rarities: [{ key: 'mf_token', name: 'Token', weight: 0, badge_colour: '#474747' }],
    atlases,
    sounds,
    loc: LOC,
  },
  hooks,
  challenges: CHALLENGES, // (challenges.js: engine/challenge.js plays it)
  sleeves: SLEEVES, // (sleeves.js: deck variants, engine/sleeve.js)
});

const keys = (set) => centers.filter((c) => c.set === set).map((c) => c.key);
export const JOKER_KEYS = keys('Joker');
export const STATUS = {
  jokers: JOKER_KEYS,
  colours: keys('Colour'),
  rotarots: keys('Rotarot'),
  boosters: keys('Booster'),
  vouchers: keys('Voucher'),
  enhancements: keys('Enhanced'),
  decks: keys('Back'),
  tags: PARTS.flatMap((p) => p.tags || []).map((t) => t.key),
  blinds: PARTS.flatMap((p) => p.blinds || []).map((b) => b.key),
  challenges: SUPERBOSS.CHALLENGES ? SUPERBOSS.CHALLENGES.map((c) => c.key) : [],
  data: DATA,
};
