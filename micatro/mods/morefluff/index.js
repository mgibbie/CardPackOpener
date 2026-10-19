/**
 * More Fluff 1.9.9999 (notmario and contributors; Steamodded >= 26.829.0), rebuilt natively for Micatro.
 * Upstream: github.com/notmario/MoreFluff at tag 1.9.9999 (8eb1e77, 2026-09-06), "a full rewrite" of the 1.5.6 mod
 * this port was first built from (main at b32b916, 2025-09-17). LICENCE: upstream's MIT LICENSE file was deleted on
 * 2026-03-06 (commit 32701ac "Kill"); the mod's manifest (MoreFluff.json) still says `"allow_redistribution": true`,
 * and nothing in the 1.9.9999 tree forbids redistribution or porting. The owner chose to port 1.9.9999 (2026-10-19).
 * Credits: notmario and contributors; art credits in the mod (mf_art_credit) name Multi (the Colour cards) and others.
 *
 * Keys keep the mod's prefix (`j_mf_<file>`, `c_mf_...`, `p_mf_...`) so descriptions match. Static numbers and text
 * come from data.js / loc.js, generated from the mod's own Lua by tools/micatro/gen_morefluff_data.cjs; behaviour is
 * ported by hand in the content modules:
 *   jokers_a.js / jokers_b.js / jokers_c.js   the 69 jokers of 1.9.9999 that the 1.5.6 port already had (+ the 11
 *                   it RETIRES to its hidden "Old Fluff" rarity — still registered, so old saves / replays / stickers
 *                   load them, but weight 0: no shop or pack ever offers them — and the Token "Oops! All 5s")
 *   colours.js      the Colour type: 16 cards that CHARGE a round at a time (+ Gold, now a hidden Spectral),
 *                   4 Colour packs, the Colour Tag, Paint Roller / Colour Theory
 *   rotarots.js     the 45 Degree Rotated Tarot type: 22 cards, 8 packs, Rotarot Tag, Rotarot Merchant / Tycoon
 *   enhancements.js 8 enhancements (Monus, Cult, Styled, Brass, Teal, Gemstone, Marigold, Yucky)
 *   superboss.js    The Ticket, Bigger Blind, 15 DX bosses, the Superboss Pack and its 15 Superboss Tokens
 *   stakes.js       6 stakes above Gold (Pink, Steel, Zodiac, Hot, Ultramarine, Final) + Heavy / Potato / Suspended
 *   exile.js        the exile zone and suspended cards (the Purple Deck's Wheel, Ultramarine's Suspended sticker)
 *   extras.js       2 Modded packs (Repack's), 3 decks (Philosophical, Rainbow, Purple), temporary cards, music
 * Kept from 1.5.6 on purpose (legacy.js): the retired jokers' real art (1.9.9999 draws them as placeholder sketches),
 * Tall Joker's and Triangle's 1.5.6 behaviour (their reworks need the Steamodded attribute / scale_card seams of the
 * unmerged feat/micatro-pokermon-391-seams branch), Fast-Growing Sapling's Jimbo art (1.9.9999: a placeholder), and
 * the pre-turned art of the Rotarot cards / packs and Cartomancer! (1.9.9999 turns upright sprites in the engine).
 *
 * NOT IN THIS BATCH (the follow-up batches register them with their behaviour, art permitting): 81 new jokers
 * (Slivers, Pacts, Emeritus, Planeswalkers, rot legendaries + their Spectrals, The Soul!, ...), the hidden Old Fluff /
 * Letter / Purple jokers, the Old and Spellchaser's decks, the Nemesis pack + tag, the Cryptic edition, the Power and
 * Ransom Note enhancements, Event Horizon, Attributes-, poison-, tetration- and cascade-based effects.
 * Gone upstream (retired keys, js/mods/aliases.js): Complexity Creep, Lightning Strikes Thrice, the Gros Michel and
 * Blasphemous decks, the 4 CardSleeves sleeves, the Modded Jumbo / Mega packs, the Modded and Clutch tags, and the
 * "Better Balatro II" challenge.
 *
 * The lovely patches become hooks (see each module). Skipped: every cross-mod item (Cryptid, Entropy, aikoyori,
 * SpectraLib, Talisman paths), JokerDisplay, the mod-page UI, the art-credit popup, screen shaders and the superboss
 * chain backdrop (visual only), the speedmult QoL patch.
 */
import { registerMod } from '../../js/mods/registry.js';
import DATA from './data.js';
import LOC0 from './loc.js';
import { MOD_ID, ART, ART_156, SND } from './util.js';
import { KEPT_156, LOC_156, RETIRED } from './legacy.js';
import * as JA from './jokers_a.js';
import * as JB from './jokers_b.js';
import * as JC from './jokers_c.js';
import * as COLOURS from './colours.js';
import * as ROTAROTS from './rotarots.js';
import * as ENH from './enhancements.js';
import * as SUPERBOSS from './superboss.js';
import * as EXTRAS from './extras.js';
import * as STAKES from './stakes.js';
import * as EXILE from './exile.js';

export const VERSION = '1.9.9999';
const PARTS = [JA, JB, JC, COLOURS, ROTAROTS, ENH, SUPERBOSS, EXTRAS, STAKES, EXILE];

// Hooks: every module may define any hook; they are composed in PARTS order.
// Value-threading hooks pass each module's result on to the next; list hooks concatenate.
const THREAD = new Set(['booster_limit', 'pack_choices', 'pack_size', 'cash_out', 'empty_pool_default', 'straight_min',
  'flush_min', 'flush_suits', 'edition_weight', 'booster_loc_vars', 'draw_hand_space', 'modify_scoring', 'selection_limit',
  'ease_ante_mod', 'blind_amount', 'get_pack']);
const LISTS = new Set(['evaluate_round', 'seal_retriggers', 'scoring_areas']);
const hooks = {};
for (const name of new Set(PARTS.flatMap((p) => Object.keys(p.hooks || {})))) {
  const fns = PARTS.map((p) => p.hooks && p.hooks[name]).filter(Boolean);
  if (fns.length === 1) { hooks[name] = fns[0]; continue; }
  if (THREAD.has(name)) hooks[name] = (v, ...a) => { for (const f of fns) { const r = f(v, ...a); if (r !== undefined) v = r; } return v; };
  else if (LISTS.has(name)) hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (r !== undefined) out = (out || []).concat(r); } return out; };
  else hooks[name] = (...a) => { let out; for (const f of fns) { const r = f(...a); if (out === undefined && r !== undefined) out = r; } return out; };
}

// The mod's text (loc.js, generated), plus: the 1.5.6 texts of the two jokers kept at 1.5.6 and of the helper
// entries the port still shows; pack descriptions under their own keys (the Lua uses one per pack group); plain
// names (the {E:...} DynaText effects are drawn as plain text) and one-line variable strings.
const LOC = JSON.parse(JSON.stringify(LOC0));
for (const [k, v] of Object.entries(KEPT_156)) LOC.descriptions.Joker[k] = v.loc;
Object.assign(LOC.descriptions.Other, LOC_156.Other);
LOC.misc.dictionary = { ...LOC_156.dictionary, ...LOC.misc.dictionary };
LOC.misc.labels = { ...LOC_156.labels, ...LOC.misc.labels };
LOC.descriptions.Booster = LOC.descriptions.Booster || {};
for (const b of DATA.boosters) {
  const group = 'p_mf_' + b.key.replace(/_\d+$/, '');
  if (LOC.descriptions.Other[group]) LOC.descriptions.Booster['p_mf_' + b.key] = LOC.descriptions.Other[group];
}
LOC.descriptions.Booster.p_mf_superboss_normal_1 = LOC.descriptions.Booster.p_mf_superboss_mega_1 = {
  name: 'Superboss Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2#{C:red} Superboss Tokens{}'],
};
for (const set of Object.values(LOC.descriptions)) for (const d of Object.values(set)) if (d && typeof d.name === 'string') d.name = d.name.replace(/\{[^}]*\}/g, '');
for (const [k, v] of Object.entries(LOC.misc.v_dictionary || {})) if (Array.isArray(v)) LOC.misc.v_dictionary[k] = v[0];

const atlases = {
  mf_jokers: { src: ART + 'mf_jokers.png', px: 71, py: 95 },
  mf_jokers_156: { src: ART_156 + 'mf_jokers_refresh.png', px: 71, py: 95 },
  mf_vanilla_jokers: { src: '/micatro/assets/textures/Jokers.png', px: 71, py: 95 },
  mf_hyperjimbo: { src: ART_156 + 'mf_hyperjimbo.png', px: 95, py: 95 },
  mf_rot_cartomancer: { src: ART_156 + 'mf_rot_cartomancer.png', px: 112, py: 112 },
  mf_colours: { src: ART + 'mf_colours.png', px: 71, py: 95 },
  mf_rotarots: { src: ART_156 + 'mf_rotarots.png', px: 107, py: 107 },
  mf_rotarotpacks: { src: ART_156 + 'mf_rotarotpacks.png', px: 106, py: 106 },
  mf_packs: { src: ART + 'mf_packs.png', px: 71, py: 95 },
  mf_vouchers: { src: ART + 'mf_vouchers.png', px: 71, py: 95 },
  mf_enhancers: { src: ART + 'mf_enhancers.png', px: 71, py: 95 },
  mf_tags: { src: ART + 'mf_tags.png', px: 34, py: 34 },
  mf_blinds: { src: ART + 'mf_blinds.png', px: 34, py: 34, frames: 21 },
  mf_stakes: { src: ART + 'mf_stakes.png', px: 29, py: 29 },
  mf_stake_stickers: { src: ART + 'mf_stake_stickers.png', px: 71, py: 95 },
  mf_mv: { src: ART_156 + 'mf_mv.png', px: 71, py: 95 },
  mf_watermark: { src: ART_156 + 'watermark.png', px: 336, py: 32 },
};

// SMODS.Sound: the music tracks (picked through the run view: extras.js `view` hook) and the sfx.
const sounds = {
  mf_music_colourpack: { src: SND + 'music_colourpack.ogg', music: true },
  mf_music_rotarot: { src: SND + 'music_rotarot.ogg', music: true },
  mf_music_modded: { src: SND + 'music_modded.ogg', music: true },
  mf_music_duelzone: { src: SND + 'music_duelzone.ogg', music: true },
  mf_treethree: { src: SND + 'treethree.ogg' },
  mf_horsebounce: { src: SND + 'horsebounce.ogg' },
  mf_buzzer: { src: SND + '1.9.9999/buzzer.ogg' },
};

const centers = PARTS.flatMap((p) => p.centers || []);
// The retired jokers: 1.9.9999's hidden "Old Fluff" rarity (weight 0) — loadable, never offered.
const rarities = DATA.rarities.filter((r) => ['token', 'oldfluff'].includes(r.key)).map((r) => ({
  key: 'mf_' + r.key, name: LOC.misc.labels['mf_' + r.key] || r.key, weight: 0, badge_colour: r.badge_colour,
}));

export const MOREFLUFF = registerMod({
  id: MOD_ID,
  name: 'More Fluff',
  prefix: 'mf',
  version: VERSION,
  // Our behaviour counter on top of 1.9.9999 (js/mods/pins.js): 1 = this first, partial batch (69 updated jokers,
  // 11 retired, systems, stakes); every later batch that adds jokers changes the pools, so it bumps this.
  contentRev: 1,
  by: 'notmario and contributors (rebuilt for Micatro)',
  badge_colour: '#814BA8',
  description: 'More Fluff 1.9.9999: 69 jokers, Colour cards that charge up over rounds, Rotarot cards, new enhancements, decks and six harder stakes, and DX Superboss blinds you pick yourself at the winning ante.',
  content: {
    centers,
    blinds: PARTS.flatMap((p) => p.blinds || []),
    tags: PARTS.flatMap((p) => p.tags || []),
    stakes: PARTS.flatMap((p) => p.stakes || []),
    stickers: PARTS.flatMap((p) => p.stickers || []),
    consumable_types: PARTS.flatMap((p) => p.consumable_types || []),
    rarities,
    atlases,
    sounds,
    fonts: { mf_emoji: { src: '/micatro/mods/morefluff/assets/fonts/1.9.9999/NotoEmoji-Bold.ttf', family: 'mf_emoji' } },
    loc: LOC,
  },
  hooks,
});

const keys = (set) => centers.filter((c) => c.set === set).map((c) => c.key);
export const JOKER_KEYS = keys('Joker');
export const RETIRED_KEYS = RETIRED.map((s) => 'j_mf_' + s);
export const STATUS = {
  version: VERSION,
  jokers: JOKER_KEYS,
  active_jokers: JOKER_KEYS.filter((k) => DATA.pools.active.includes(k)),
  retired_jokers: RETIRED_KEYS,
  colours: keys('Colour'),
  spectrals: keys('Spectral'),
  rotarots: keys('Rotarot'),
  superboss_tokens: keys('SuperbossToken'),
  boosters: keys('Booster'),
  vouchers: keys('Voucher'),
  enhancements: keys('Enhanced'),
  decks: keys('Back'),
  tags: PARTS.flatMap((p) => p.tags || []).map((t) => t.key),
  blinds: PARTS.flatMap((p) => p.blinds || []).map((b) => b.key),
  stakes: PARTS.flatMap((p) => p.stakes || []).map((s) => s.key),
  stickers: PARTS.flatMap((p) => p.stickers || []).map((s) => s.key),
  data: DATA,
};
