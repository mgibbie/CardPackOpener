/**
 * Animated cards, Unown forms and the per-card view data — the data side of Pokermon's
 * functions/pokeanimations.lua (AnimatedPokemon) and pokedraw.lua. Rendering is the UI's
 * job: this only exposes what to draw.
 *
 * cardView extras (view_card hook), under `v.poke`:
 *   ptype, tera (sticker type), energy / c_energy / energy_max, stage, rounds (level-evo
 *   countdown), evolve (an evolution item is applied — evolves at end of round), megas,
 *   form (Unown / Gourgeist / Rival ... forms), illusion (Zorua's disguise key), broke_pos
 *   (Mimikyu's busted disguise), fainted, shiny (edition), anim
 *   {frames, frames_per_row, fps, soul, atlas} for animated cards.
 */
import { G } from '../../../js/engine/core.js';
import { get_type, type_sticker_applied, energy_limit_bonus } from './types.js';
import { energy_max } from './energy.js';

/**
 * AnimatedPokemon (pokeanimations.lua). `native` ones have their own atlas per key. The Unown Swarm (batch 10b): 3.9.1's
 * strips (pokesprites.lua ANIMATION_ATLAS: 36 frames, 12 fps, one row), tiled by index.js; 3.2.1 laid them 12 per row.
 */
export const ANIMATED = {
  j_poke_unown_swarm: { native: true, frames_per_row: 36, frames: 36, fps: 12, soul: true, size: { x: 290, y: 285 } },
  j_poke_voltorb: { shiny_offset: 1, frames_per_row: 11, frames: 11, fps: 11 },
  j_poke_electrode: { shiny_offset: 1, frames_per_row: 13, frames: 13, fps: 13 },
  c_poke_bird_energy: { frames_per_row: 18, frames: 36, fps: 15 },
  // Miror Budicolo (3.9.1 April Fools, batch 17): pokesprites.lua's 4-frame, 8 fps strip (and its Shiny twin), atlas
  // poke_miror_budicolo / poke_miror_budicolo_shiny (index.js).
  j_poke_miror_budicolo: { native: true, atlas: 'miror_budicolo', frames_per_row: 4, frames: 4, fps: 8 },
};

/**
 * Pokermon 3.9.1's animated Series A alternates (pokesprites.lua ANIMATION_ATLAS: frames / fps; one-row strips, + Shiny twins),
 * drawn by ui.js when the viewer picks the Series A sprite series (the cosmetic `series` option). Atlases: index.js.
 */
export const SERIES_A_ANIM = {
  AtlasJokersSeriesABellsprout: { frames: 24, fps: 10 },
  AtlasJokersSeriesAVoltorb: { frames: 11, fps: 11 },
  AtlasJokersSeriesAElectrode: { frames: 13, fps: 13 },
  AtlasJokersSeriesABaltoy: { frames: 32, fps: 50 },
  AtlasJokersSeriesAClaydol: { frames: 32, fps: 50 },
};

/**
 * Kecleon's card per type (3.9.1 pokejokers_12.lua set_sprites: its poke_lookup_atlas = the Gen 3 sheet, pokespriteload.lua
 * lookup_gen_atlas 3). Colorless (or a type without a cell) is its own Natdex card. Drawn by ui.js face() (+ the Shiny shader).
 */
export const KECLEON_ATLAS = 'poke_AtlasJokersBasicGen03391';
export const KECLEON_SPRITES = {
  Dark: { x: 6, y: 0 }, Dragon: { x: 8, y: 0 }, Earth: { x: 10, y: 0 }, Fairy: { x: 0, y: 1 }, Fighting: { x: 2, y: 1 },
  Fire: { x: 4, y: 1 }, Grass: { x: 6, y: 1 }, Lightning: { x: 8, y: 1 }, Metal: { x: 10, y: 1 }, Psychic: { x: 0, y: 2 }, Water: { x: 2, y: 2 },
};

/**
 * Castform's weather forms (the owner's design, jokers/pokejokers_designs.js): upstream 3.9.1 draws them on the Gen 3 sheet (row 0,
 * left of Kecleon's type cards; pokespriteload.lua lists only its Natdex card, no joker uses them upstream) — by ability.extra.form.
 * Normal is its own Natdex card. Drawn by ui.js face() (+ the Shiny sheet's twin cells).
 */
export const CASTFORM_SPRITES = { sunny: { x: 0, y: 0 }, rainy: { x: 2, y: 0 }, snowy: { x: 4, y: 0 } };
/** Cherrim's Sunshine Form (the owner's design): upstream 3.9.1's Gen 4 sheet draws it beside its Overcast card {0,1} (unlisted in
 *  pokespriteload.lua). By the view's form (its center's poke_view_form: live). Overcast = its own card. */
export const CHERRIM_SPRITES = { sunshine: { x: 2, y: 1 } };

/**
 * Burmy's and Wormadam's cloaks (the owner's design, jokers/pokejokers_designs.js): upstream 3.9.1 draws all three on the Gen 4 sheet
 * (row 0: Burmy Plant / Sandy / Trash at 0 / 2 / 4, Wormadam at 6 / 8 / 10; pokespriteload.lua lists only the Plant cells) — by
 * ability.extra.form. Plant is each one's own card. Drawn by ui.js face() (+ the Shiny sheet's twin cells).
 */
export const CLOAK_ATLAS = 'poke_AtlasJokersBasicGen04391';
export const BURMY_SPRITES = {
  j_poke_burmy: { sandy: { x: 2, y: 0 }, trash: { x: 4, y: 0 } },
  j_poke_wormadam: { sandy: { x: 8, y: 0 }, trash: { x: 10, y: 0 } },
};

/**
 * Deoxys's forme (3.9.1 pokejokers_13.lua set_sprites, sub-batch 14): its floating sprite on the Gen 3 sheet by extra.form —
 * 1 Attack {5,3}, 2 Defense {7,3}, 3 Speed {9,3}; Normal (4) is its own soul {3,3}. Drawn by ui.js face().
 */
/** The Imposter Professor's unmasked card (3.9.1 zotherjokers.lua set_sprites: form 1 -> Others {8,1}; batch 17). */
export const IMPOSTER_REVEALED = { x: 8, y: 1 };

export const DEOXYS_SOULS = { 1: { x: 5, y: 3 }, 2: { x: 7, y: 3 }, 3: { x: 9, y: 3 } };

export function view_card(card, v) {
  const c = card.config.center;
  const ex = card.ability.extra;
  const tera = type_sticker_applied(card);
  const ptype = get_type(card);
  // (+ add-on Pokémon registered through Pokermon's machinery: pokermon.Pokemon sets poke_custom_prefix)
  const isPoke = (c.mod === 'pokermon' || !!c.poke_custom_prefix) && c.set === 'Joker';
  if (!isPoke && !tera && !(card.edition && card.edition.poke_shiny) && !ANIMATED[c.key]) return;
  const p = {};
  if (ptype) p.ptype = ptype;
  if (tera) p.tera = tera;
  const holder = ex && typeof ex === 'object' ? ex : card.ability;
  const e = holder.energy_count || 0, ce = holder.c_energy_count || 0;
  if (e || ce) { p.energy = e; p.c_energy = ce; p.energy_max = energy_max + ((G.GAME && G.GAME.energy_plus) || 0) + energy_limit_bonus(card); }
  if (c.stage) p.stage = c.stage;
  if (ex && typeof ex === 'object') {
    if (typeof ex.rounds === 'number') p.rounds = ex.rounds;
    if (ex.evolve) p.evolve = ex.evolve;
    if (ex.form !== undefined) p.form = ex.form;
    // (a form read live from the game, not stored: the owner's Cherrim, sunny or overcast)
    if (typeof c.poke_view_form === 'function') p.form = c.poke_view_form(c, card);
    // Zorua's copy switch (its disguise + shadow show only while active: pokedraw.lua zorua_shadow)
    if (typeof ex.active === 'boolean' && (c.key === 'j_poke_zorua' || c.key === 'j_poke_zoroark')) p.active = ex.active;
    // Zorua / Zoroark Illusion: drawn (and described) as this Pokémon outside the joker row.
    if (ex.hidden_key && card.area !== G.jokers) p.illusion = ex.hidden_key;
    // Mimikyu: the busted-disguise sprite (center.broke_pos): 3.9.1 `disguise_broken`, or a 3.2.1 card's `disguise === false`.
    if ((ex.disguise_broken || ex.disguise === false) && c.broke_pos) p.broke_pos = c.broke_pos;
  }
  if (c.megas) p.megas = c.megas.slice();
  if (card.ability.fainted !== undefined && G.GAME && card.ability.fainted === G.GAME.round) p.fainted = true;
  if (card.edition && card.edition.poke_shiny) p.shiny = true;
  const an = ANIMATED[c.key];
  if (an) p.anim = { frames: an.frames, frames_per_row: an.frames_per_row, fps: an.fps, soul: !!an.soul, atlas: an.native ? (an.atlas || c.key) : undefined, size: an.size,
    ...(an.soul_only ? { soul_only: true, shiny_atlas: an.shiny_atlas } : {}) };
  // Capture Disc (3.9.1 April Fools): the board reports its drags (the 'poke_capture_disc_drag' action, jokers/zzzapril_fools.js)
  if (c.key === 'j_poke_capture_disc') v.drag_tracked = 'poke_capture_disc_drag';
  v.poke = p;
}
