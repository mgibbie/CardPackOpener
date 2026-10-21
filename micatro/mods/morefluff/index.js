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
 * Batch B (contentRev 2; PORTING.md "Batch B"): object_weights on, Tall Joker's and Triangle's 1.9.9999 reworks on the
 * engine's attribute / scale_card seams, and the new content with real art:
 *   jokers_d.js     13 new jokers (Dinner, Forge, Doubled Scale, Bouncer, Jokes for Minecrafters, Apple Friends, Gem
 *                   Alert, Gentlemelon, Joker Reacts, Retrigger Joker, Alchemy Joker) + the Fish / Forge Residue tokens
 *   planeswalker.js the loyalty system: Jimbo, the Mind Sculptor; John Balatro? (+ John Balatro, unleashed)
 *   prepared.js     prepared cards (a joker's / Aura Farm Tarot's USE button for its prepared consumable)
 *   letters.js      the 26 Letter jokers and the 3 Purple jokers (hidden pools: never offered, see its header)
 *   rot.js          the 7 rot legendaries, their 7 prepared Spectral cards and The Soul!
 * Kept from 1.5.6 on purpose (legacy.js): the retired jokers' real art (1.9.9999 draws them as placeholder sketches),
 * Fast-Growing Sapling's Jimbo art (1.9.9999: a placeholder), and the pre-turned art of the Rotarot cards / packs and
 * Cartomancer! (1.9.9999 turns upright sprites in the engine; batch B pre-turns the rot legendaries and The Soul! too).
 *
 * NOT PORTED (placeholder sketches upstream: PORTING.md lists them): about 61 new jokers (the Slivers, Pacts, Emeritus
 * jokers, Triangle Walker, Lone Wolf, Bonus Sheet, ...), the Old Deck (its 32 other Old Fluff jokers are sketches) and
 * the Spellchaser's Deck, the Nemesis pack + tag, the Cryptic edition, the Power and Ransom Note enhancements, Event
 * Horizon; poison-, tetration- and cascade-based effects.
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
import * as JD from './jokers_d.js';
import * as PW from './planeswalker.js';
import * as PREP from './prepared.js';
import * as LETTERS from './letters.js';
import * as ROT from './rot.js';
import * as COLOURS from './colours.js';
import * as ROTAROTS from './rotarots.js';
import * as ENH from './enhancements.js';
import * as SUPERBOSS from './superboss.js';
import * as EXTRAS from './extras.js';
import * as STAKES from './stakes.js';
import * as EXILE from './exile.js';

export const VERSION = '1.9.9999';
const PARTS = [JA, JB, JC, JD, PW, PREP, LETTERS, ROT, COLOURS, ROTAROTS, ENH, SUPERBOSS, EXTRAS, STAKES, EXILE];

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
for (const [k, f] of Object.entries(LETTERS.LOC_FIX)) { const d = LOC.descriptions.Joker[k]; if (d) d.text = d.text.map((l) => l.replace(f.from, f.to)); }
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
  // batch B (tools/micatro/stage_morefluff_batch_b_art.mjs): the loyalty counter, the Letter tiles centred in card cells,
  // the Purple jokers, the rot legendaries / The Soul! pre-turned 45 degrees, the rot Spectral cards (composed)
  mf_loyalty: { src: ART + 'mf_loyalty.png', px: 71, py: 95 },
  mf_letterjokers_b: { src: ART + 'mf_letterjokers_b.png', px: 71, py: 95 },
  mf_purple: { src: ART + 'mf_purple.png', px: 71, py: 95 },
  mf_rot_jokers_b: { src: ART + 'mf_rot_jokers_b.png', px: 112, py: 112 },
  mf_rot_soul_b: { src: ART + 'mf_rot_soul_b.png', px: 112, py: 112 },
  mf_rot_spectrals_b: { src: ART + 'mf_rot_spectrals_b.png', px: 71, py: 95 },
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
  mf_g_riff: { src: SND + '1.9.9999/g.ogg' }, // (Lettergem G)
};

const centers = PARTS.flatMap((p) => p.centers || []);
// Every object keeps 1.9.9999's Steamodded `attributes` (data.js): the jokers get theirs from util.joker(); the hand-built
// consumables, packs, vouchers, enhancements, tags and blinds get them here (SMODS.has_attribute / get_attribute_pool).
const ATTR_SRC = { consumables: 'c_mf_', boosters: 'p_mf_', vouchers: 'v_mf_', enhancements: 'm_mf_', tags: 'tag_mf_', blinds: 'bl_mf_' };
const ATTRS = {};
for (const [sec, pre] of Object.entries(ATTR_SRC)) for (const o of DATA[sec] || []) if (Array.isArray(o.attributes) && o.attributes.length) ATTRS[pre + o.key] = o.attributes;
const with_attributes = (list) => { for (const o of list) if (!o.attributes && ATTRS[o.key]) o.attributes = ATTRS[o.key].slice(); return list; };
with_attributes(centers);
// 1.9.9999's hidden rarities (weight 0: never rolled): Token (Oops! All 5s, Fish, Forge Residue), "Old Fluff" (the
// retired jokers and the Purple ones — loadable, never offered), Super Legendary (John Balatro, unleashed), Letter (the
// Lettergems: only Lettergem F, the Old Deck and Bonus Sheet roll it), Legendary! (the rot legendaries: The Soul!).
const rarities = DATA.rarities.filter((r) => ['token', 'oldfluff', 'superlegendary', 'letter', 'rot_legendary'].includes(r.key)).map((r) => ({
  key: 'mf_' + r.key, name: LOC.misc.labels['mf_' + r.key] || r.key, weight: 0, badge_colour: r.badge_colour,
}));

export const MOREFLUFF = registerMod({
  id: MOD_ID,
  name: 'More Fluff',
  prefix: 'mf',
  version: VERSION,
  // Our behaviour counter on top of 1.9.9999 (js/mods/pins.js): 1 = the first, partial batch (69 updated jokers,
  // 11 retired, systems, stakes); 2 = batch B (object_weights on, the Steamodded scale_card / attribute seams,
  // Tall Joker's and Triangle's reworks, the new jokers with real art). Every later batch that adds jokers bumps it.
  contentRev: 2,
  by: 'notmario and contributors (rebuilt for Micatro)',
  badge_colour: '#814BA8',
  description: 'More Fluff 1.9.9999: 89 jokers (Planeswalkers with loyalty abilities, Rotated Legendaries with prepared Spectral cards), Colour cards that charge up over rounds, Rotarot cards, new enhancements, decks and six harder stakes, and DX Superboss blinds you pick yourself at the winning ante.',
  content: {
    centers,
    blinds: with_attributes(PARTS.flatMap((p) => p.blinds || [])),
    tags: with_attributes(PARTS.flatMap((p) => p.tags || [])),
    stakes: PARTS.flatMap((p) => p.stakes || []),
    stickers: PARTS.flatMap((p) => p.stickers || []),
    consumable_types: PARTS.flatMap((p) => p.consumable_types || []),
    rarities,
    atlases,
    sounds,
    fonts: { mf_emoji: { src: '/micatro/mods/morefluff/assets/fonts/1.9.9999/NotoEmoji-Bold.ttf', family: 'mf_emoji' } },
    loc: LOC,
    // src/attributes.lua + tetr_stuff.lua: More Fluff's own SMODS.Attributes (its cards list theirs, data.js `attributes`)
    attributes: DATA.attributes.map((key) => ({ key })),
  },
  hooks,
  // 1.9.9999 src/misc.lua: FLUFF.optional_features = {retrigger_joker, post_trigger, quantum_enhancements, object_weights}.
  // object_weights sends create_card's key, editions, tags, packs, bosses, vouchers and the shop roll through
  // SMODS.poll_object (js/engine/smods.js); joker retriggers and quantum enhancements are always on in the engine;
  // no ported card reads post_trigger.
  optional_features: { retrigger_joker: true, post_trigger: true, quantum_enhancements: true, object_weights: true },
  // The Steamodded contexts this port takes from the engine (only these: it emulates stay_flipped / debuff_card itself).
  smods_seams: ['scaling_card', 'modify_weights', 'modify_shop_card', 'modify_scoring_hand', 'setting_ability'],
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
