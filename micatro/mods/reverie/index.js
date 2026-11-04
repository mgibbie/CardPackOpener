/**
 * Reverie (DVRP; Steamodded 0.9.x old API — SMODS.INIT.Reverie, SMODS.Joker:new, Deck:new, Spectral:new,
 * Voucher:new — plus a 24 KB lovely.toml and ~40 Lua function wraps), rebuilt natively for Micatro from
 * `Desktop/mods off/Reverie` (Reverie.lua, data/*.lua, localizations.lua, lovely.toml). Numbers, rules and
 * text are the mod's; keys are prefixed `rev` (c_gem_heist -> c_rev_gem_heist, p_flim_normal_1 ->
 * p_rev_flim_normal_1, tag_cine -> tag_rev_cine, ...).
 *
 *   11 Cine cards     I Sing I've No Shape, The Unseen, Gem Heist, Crazy Lucky, Tag or Die, Let It Moon,
 *                     Poker Face, Eerie Inn, Adrifting, Morsel, Every Hue (Every Hue only with More Fluff on,
 *                     as the mod registers it only when MoreFluff is installed)
 *   11 Exchange Coupons (quests: progress toward a goal, then turn into their Cine)
 *    1 spectral       Reverie (applies every Cine to this shop; a 0.3% "soul" roll in Cine / Film / Spectral packs)
 *    1 joker          Dynamic Film
 *    2 decks          Filmstrip (Cines stack, +1 Cine slot), Stamp (skips give a Jumbo Tag Pack)
 *    9 boosters       Tag Pack x2 / Jumbo / Mega (only while Tag or Die is on), Crazy Lucky "Pack",
 *                     Film Pack x2 / Jumbo (Exchange Coupons) / Mega (Cines)
 *    2 tags           Stub (free Film Pack), Stamp (free Jumbo Tag Pack; Stamp Deck only)
 *    2 vouchers       Script (+2 shop slots while a Cine is active), Megaphone (quest goals halved)
 *
 * NOT PORTED: Fool Metal Alchemist (+ coupon) needs Codex Arcanum and Radioactive (+ coupon) needs Fusion
 * Jokers — neither is a Micatro mod, and Reverie itself skips both without them (`dependency`). The Mark Tag
 * is commented out in the mod. The Cine collection page / tallies, Korean text, discovery alerts and the
 * pack particles are UI of the original game.
 *
 * The Lua wraps become seams (each a no-op without this mod): create_card -> create_card_key (the Reverie
 * roll); create_card_for_shop -> create_card_for_shop; CardArea:emplace -> emplace; calculate_reroll_cost ->
 * reroll_cost; get_pack -> get_pack; Card:use_consumeable / G.FUNCS.use_card -> the Cine's own use +
 * pack_take_area / pack_select / use_other / use_card_done; G.FUNCS.buy_from_shop (lovely) -> buy_place +
 * buy_space; Tag:apply_to_run -> tag_apply + the mod tags' apply; G.FUNCS.toggle_shop -> shop_end;
 * end_round -> end_round_start; Card:add_to_deck / remove_from_deck / remove (negative Cines) ->
 * negative_area; Card:set_ability -> set_ability; Card:remove -> card_removed; G.FUNCS.sell_card ->
 * sell_card; G.FUNCS.skip_blind -> skip_blind; Card:explode (boosters) -> booster_open;
 * G.FUNCS.play_cards_from_highlighted -> pre_play; Card:calculate_joker (Morsel extras) -> calculate_joker;
 * Back:trigger_effect 'setting_tags' -> start_run / round_counts('after', 'cash_out'); Game:update_shop
 * (immediate tags bought in the shop) -> update. The Cine quest area is G.cine_quests (a 'joker'-type
 * CardArea in G.areas, shown by the board as a mod area); the ticket shaders are mod "editions" the
 * card renderer runs as its plain pass (view only).
 *
 * INTENDED-DESIGN FIXES (each tested in micatro/tests/mods/reverie_test.mjs, failing with the fix reverted):
 *  1. The Morsel coupon ("after getting 2 Food Jokers") counted a Food Joker again every time it came back
 *     from a debuff (Card:add_to_deck(from_debuff) re-ran the joker_added context): only getting one counts.
 *  2. In a Cine shop that doesn't force the card kinds (The Unseen, Gem Heist, Adrifting with other Cines),
 *     an Uncommon / Rare Tag made its joker, was used up — and the joker was thrown away (the forced card
 *     was only returned when Adrifting was the sole Cine). The tag's joker is stocked.
 *  3. Rerolling a Cine shop rolled (and threw away) one extra shop card: the lovely patch ran inside the
 *     vanilla refill loop after its first create_card_for_shop. The thrown-away joker stayed marked as used,
 *     so it could not show up again. The reroll stocks exactly the shop's slots.
 *  4. Reverie / Crazy Lucky replaced the shop's vouchers while iterating the same list: with two voucher
 *     slots the second voucher was never replaced (and the first replacement was replaced again). Every
 *     voucher is replaced once.
 * Adaptations: Every Hue sets More Fluff 1.5.6's Colour fields (val / partial_rounds; Reverie wrote the
 * older extra / partial_rounds_held); Morsel's Golden Carrot rule is already in its doubled {gain, loss}
 * config (Reverie's numeric-extra branch would crash on 1.5.6); the Crazy Lucky pack's weight table is
 * walked in its declared order (Lua pairs() order is unspecified); every roll is seeded (the Stub Tag's /
 * Eerie Inn's math.random -> math_random).
 */
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { registerMod, isActive } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_TAGS, P_CARDS, P_CENTER_POOLS, Card, CardArea, emit, play_sound, localize, card_eval_status_text,
  pseudorandom, pseudoseed, pseudorandom_element, math_random, create_card, get_current_pool, get_pack,
  poll_edition, copy_card, find_joker, calculate_reroll_cost, get_next_tag_key,
} from '../../js/engine/core.js';
import { STATES, HANDLIST, change_shop_size, use_card } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { describeTag } from '../../js/engine/describe.js';
import { LOC, MORSEL_ALT } from './loc.js';
import { LOC as BASE_LOC } from '../../js/engine/core.js';

const MOD_ID = 'reverie';
const ART = '/micatro/mods/reverie/assets/2x/';
const CINE_COLOUR = '#9db95f';
const TAG_COLOUR = '#a6b8ce';
const on = () => isActive(MOD_ID);
const cr = () => G.GAME.current_round;
const byOrder = (a, b) => a.order - b.order;

const atlases = {
  rev_cines: { src: ART + 'cines.png', px: 71, py: 95 },
  rev_jokers: { src: ART + 'jokers.png', px: 71, py: 95 },
  rev_boosters: { src: ART + 'boosters.png', px: 71, py: 95 },
  rev_vouchers: { src: ART + 'vouchers.png', px: 71, py: 95 },
  rev_tags: { src: ART + 'tags.png', px: 34, py: 34 },
  rev_backs: { src: ART + 'backs.png', px: 71, py: 95 },
  rev_sleeves: { src: ART + 'sleeves.png', px: 71, py: 95 }, // (1.3.0 main: assets/2x/sleeves.png, cine_sleeves)
};
/** Reverie.flipped_*_pos: the backs Adrifting shows for face-down vouchers / tags / boosters. */
const FLIPPED = { Voucher: ['rev_vouchers', { x: 1, y: 0 }], Tag: ['rev_tags', { x: 0, y: 1 }], Booster: ['rev_boosters', { x: 5, y: 0 }] };

// ------------------------------------------------------------------ data (data/cines.lua)
// [slug, name, config, pos, order, quest config, quest pos, quest order, needs-mod]
const CINES = [
  ['ive_no_shape', "I Sing, I've No Shape", { extra: { add: 20 } }, { x: 6, y: 0 }, 20, { extra: { chips: 2, goal: 3 } }, { x: 8, y: 1 }, 19],
  ['unseen', 'The Unseen', { extra: { mult: 5 } }, { x: 2, y: 0 }, 18, { extra: { slots: 1, goal: 5 } }, { x: 4, y: 1 }, 17],
  ['gem_heist', 'Gem Heist', { extra: 25 }, { x: 1, y: 0 }, 2, { extra: { goal: 2 } }, { x: 3, y: 1 }, 1],
  ['crazy_lucky', 'Crazy Lucky', { extra: { mult: 1, kind: ['p_crazy_lucky'] } }, { x: 7, y: 0 }, 12, { extra: { goal: 6 } }, { x: 9, y: 1 }, 11],
  ['tag_or_die', 'Tag or Die', { extra: { cost: 8, kind: ['p_tag_'] } }, { x: 3, y: 0 }, 4, { extra: { goal: 4 } }, { x: 5, y: 1 }, 3],
  ['let_it_moon', 'Let It Moon', { extra: { kind: ['p_arcana_', 'p_celestial_'] } }, { x: 0, y: 0 }, 8, { extra: { goal: 10 } }, { x: 2, y: 1 }, 7],
  ['poker_face', 'Poker Face', { extra: { kind: ['p_standard_'] } }, { x: 4, y: 0 }, 10, { extra: { goal: 8 } }, { x: 6, y: 1 }, 9],
  ['eerie_inn', 'Eerie Inn', { extra: { mult: 2, kind: ['p_spectral_'] } }, { x: 5, y: 0 }, 6, { extra: { goal: 5 } }, { x: 7, y: 1 }, 5],
  ['adrifting', 'Adrifting', { extra: 1 }, { x: 8, y: 0 }, 14, { extra: { goal: 5 } }, { x: 0, y: 2 }, 13],
  ['morsel', 'Morsel', { extra: { kind: ['p_buffoon_'] } }, { x: 9, y: 0 }, 16, { extra: { goal: 2 } }, { x: 1, y: 2 }, 15],
  ['every_hue', 'Every Hue', { extra: { rounds: 3, kind: ['p_colour_'] } }, { x: 4, y: 2 }, 24, { extra: { goal: 2 } }, { x: 5, y: 2 }, 23, 'morefluff'],
];
/** The mod's pack-key slugs -> Micatro's keys (its own packs are prefixed; More Fluff's Colour packs are p_mf_colour_*). */
const KIND = { p_tag_: 'p_rev_tag_', p_crazy_lucky: 'p_rev_crazy_lucky', p_colour_: 'p_mf_colour_' };
const kindKey = (k) => KIND[k] || k;

const centers = [];
const ck = (slug) => 'c_rev_' + slug;
/** A Cine / coupon center is in this run (Every Hue needs More Fluff, like the mod's `dependency`). */
const cine_available = (c) => !c.needs || isActive(c.needs);
const pool_cines = (quest) => Object.values(P_CENTERS).filter((c) => c.mod === MOD_ID && c.set === 'Cine' && !!c.reward === quest && cine_available(c)).sort(byOrder);

// ------------------------------------------------------------------ helpers (Reverie.*)
export function find_used_cine(name) {
  const u = G.GAME && G.GAME.current_round.used_cine;
  if (!u) return null;
  const i = u.indexOf(name);
  return i >= 0 ? i + 1 : null;
}
const find_used_cine_or = (...names) => !!cr().used_cine && names.some((n) => cr().used_cine.includes(n));
const is_cine_or_reverie = (card) => card.ability.set === 'Cine' || (card.ability.set === 'Spectral' && card.ability.name === 'Reverie');
const is_cine_forcing_card_set = () => find_used_cine_or("I Sing, I've No Shape", 'Crazy Lucky', 'Tag or Die', 'Let It Moon',
  'Poker Face', 'Eerie Inn', 'Morsel', 'Fool Metal Alchemist', 'Every Hue', 'Radioactive');
function find_cine_center(name) {
  for (const v of Object.values(P_CENTERS)) if (v.set === 'Cine' && v.name === name && cine_available(v)) return v;
  return null;
}
export function get_used_cine_kinds() {
  if (!cr().used_cine) return null;
  if (find_used_cine('Crazy Lucky')) return ['p_rev_crazy_lucky'];
  const flag = {}, kinds = [];
  for (const v of cr().used_cine) {
    const center = find_cine_center(v);
    if (center && typeof center.config.extra === 'object' && center.config.extra.kind && !flag[v]) {
      for (const k of center.config.extra.kind) kinds.push(kindKey(k));
      flag[v] = true;
    }
  }
  return kinds.length ? kinds : null;
}
/** The pack the open pack is ('Tag' | 'Crazy' | 'Film'), Lua's G.GAME.in_reverie_pack. */
function in_reverie_pack() {
  if (G.STATE !== STATES.MOD_PACK && G.STATE !== STATES.MOD_PACK_HAND) return null; // (cleared by end_consumeable in the Lua)
  const pc = G.GAME.pack_center && P_CENTERS[G.GAME.pack_center];
  return pc && pc.mod === MOD_ID ? pc.reverie_pack : null;
}
export function set_cine_banned_keys() {
  for (const [k, v] of Object.entries(P_CENTERS)) {
    if (v.mod === MOD_ID && v.set === 'Booster' && v.yes_flag) G.GAME.banned_keys[k] = !find_used_cine(v.yes_flag);
  }
}
const halve_cine_quest_goal = (value) => Math.max(1, Math.floor(value * P_CENTERS.v_rev_megaphone.config.extra));
export function get_food_jokers() {
  const foods = [G.GAME.pool_flags.gros_michel_extinct ? 'j_cavendish' : 'j_gros_michel', 'j_ice_cream', 'j_turtle_bean', 'j_diet_cola', 'j_popcorn', 'j_ramen', 'j_selzer', 'j_egg'];
  if (isActive('morefluff')) foods.push('j_mf_lollipop', 'j_mf_goldencarrot', 'j_mf_tonersoup', 'j_mf_teacup');
  // (1.3.0 main's refined list: Bunco's two foods, while Bunco is on; the other mods it names aren't Micatro mods)
  if (isActive('bunco')) foods.push('j_bunc_fondue', 'j_bunc_starfruit');
  return foods;
}
const is_food_joker = (key) => get_food_jokers().includes(key);
/** Reverie.double_ability: every number in the center's config, doubled on the card (Xmult -> x_mult too). */
function double_ability(origin, neu) {
  for (const [k, v] of Object.entries(origin)) {
    if (typeof v === 'number') {
      neu[k] = v * 2;
      if (k === 'Xmult') neu.x_mult = v * 2;
    } else if (v && typeof v === 'object' && neu[k] && typeof neu[k] === 'object') double_ability(v, neu[k]);
  }
}

// ------------------------------------------------------------------ special cards
/** Reverie.create_tag_as_card: a Tag sold / packed as a card (base cost: Tag or Die's $8). */
export function create_tag_as_card(area, big, excludes) {
  const [_pool, _pool_key] = get_current_pool('Tag');
  let [key] = pseudorandom_element(_pool, pseudoseed(_pool_key));
  let it = 1;
  while (key === 'UNAVAILABLE' || (excludes && excludes.includes(key))) {
    it++;
    [key] = pseudorandom_element(_pool, pseudoseed(_pool_key + '_resample' + it));
    if (it > 1000) { key = 'tag_handy'; break; } // (every tag excluded: Lua would spin forever)
  }
  const card = new Card(P_CARDS.empty, P_TAGS[key], { bypass_discovery_center: area === G.shop_jokers, bypass_discovery_ui: area === G.shop_jokers, discover: false });
  card.tag_card = big ? 'big' : 'small';
  card.ability.tag = new Tag(key);
  card.ability.tag.ability.as_card = true;
  card.base_cost = P_CENTERS.c_rev_tag_or_die.config.extra.cost;
  card.set_cost();
  if (card.ability.name === 'Orbital Tag') {
    const poker_hands = HANDLIST.filter((k) => G.GAME.hands[k].visible);
    card.ability.orbital_hand = pseudorandom_element(poker_hands, pseudoseed('orbital'))[0];
    card.ability.tag.ability.orbital_hand = card.ability.orbital_hand;
  }
  return card;
}
function create_booster(area, center) {
  return new Card(P_CARDS.empty, center, { bypass_discovery_center: true, bypass_discovery_ui: true });
}
/** Reverie.create_special_joker: Morsel's food jokers / I Sing's copies of your jokers (null = none). */
export function create_special_joker(area) {
  const types = [];
  if (find_used_cine('Morsel')) types.push('Morsel');
  if (find_used_cine("I Sing, I've No Shape") && G.jokers.cards && G.jokers.cards[0]) types.push("I Sing, I've No Shape");
  if (!types.length) return null;
  const [type] = pseudorandom_element(types, pseudoseed('cine_joker'));
  if (type === 'Morsel') {
    let available = get_food_jokers().filter((k) => P_CENTERS[k]);
    if (!find_joker('Showman').length) available = available.filter((k) => !find_joker(P_CENTERS[k].name).length);
    if (!available.length) available.push('j_ice_cream');
    const [target] = pseudorandom_element(available, pseudoseed('mor'));
    return create_card('Joker', area, null, null, null, null, target, 'sel');
  }
  const [force] = pseudorandom_element(G.jokers.cards, pseudoseed('ising'));
  return create_card('Joker', area, null, null, null, null, force.config.center.key, 'iveno');
}
/** Reverie.create_poker_face_card: a copy of a random card in your deck. */
export function create_poker_face_card() {
  if (!G.deck.cards.length) return null;
  const [target] = pseudorandom_element(G.deck.cards, pseudoseed('pokerface'));
  return copy_card(target, new Card(P_CARDS.empty, P_CENTERS.c_base));
}
/** Reverie.get_pack_by_slug: a weighted pick among the (unbanned) boosters whose key contains `slug`. */
export function get_pack_by_slug(key, slug) {
  let cume = 0, it = 0, center;
  for (const v of P_CENTER_POOLS.Booster) if (v.key.includes(slug) && !G.GAME.banned_keys[v.key]) cume += v.weight ?? 1;
  const poll = pseudorandom(pseudoseed((key || 'pack_generic') + G.GAME.round_resets.ante)) * cume;
  for (const v of P_CENTER_POOLS.Booster) {
    if (!G.GAME.banned_keys[v.key]) {
      if (v.key.includes(slug)) it += v.weight ?? 1;
      if (it >= poll && it - (v.weight ?? 1) <= poll) { center = v; break; }
    }
  }
  return center;
}
const CRAZY_TYPES = ['Joker', 'Consumeables', 'Playing', 'Tag', 'Voucher', 'Cine'];
/** Reverie.create_crazy_random_card: a Crazy Lucky pack card — anything. */
export function create_crazy_random_card(area, excludes) {
  let cumulative = 0, pointer = 0, target = null, card = null;
  const tag_or_die = find_used_cine('Tag or Die');
  const W = P_CENTERS.p_rev_crazy_lucky_1.config.weights;
  const weights = CRAZY_TYPES.map((k) => [k, W[k] * (k === 'Tag' && tag_or_die ? 3 : 1)]);
  for (const [, v] of weights) cumulative += v;
  const poll = pseudorandom(pseudoseed('crazy_pack' + G.GAME.round_resets.ante)) * cumulative;
  for (const [k, v] of weights) {
    pointer += v;
    if (pointer >= poll && pointer - v <= poll) { target = k; break; }
  }
  const ante = G.GAME.round_resets.ante;
  if (target === 'Joker') {
    card = create_special_joker(G.pack_cards);
    if (!card) card = create_card('Joker', area, null, null, true, true, null, 'crazy_j');
  } else if (target === 'Consumeables') {
    const types = [];
    if (find_used_cine('Let It Moon')) types.push('Tarot_Planet');
    if (find_used_cine('Eerie Inn')) types.push('Spectral');
    if (find_used_cine('Every Hue') && P_CENTER_POOLS.Colour) types.push('Colour');
    if (types.length) {
      const [type] = pseudorandom_element(types, pseudoseed('cine_consumable'));
      card = create_card(type, area, null, null, true, true, null, 'crazy_consumable');
    } else {
      const [pool, pool_key] = get_current_pool('Consumeables', null, null, 'crazy_c');
      let [center] = pseudorandom_element(pool, pseudoseed(pool_key));
      let it = 1;
      while (center === 'UNAVAILABLE' || (P_CENTERS[center].set === 'Cine' && !P_CENTERS[center].reward)) {
        it++;
        [center] = pseudorandom_element(pool, pseudoseed(pool_key + '_resample' + it));
        if (it > 1000) { center = 'c_strength'; break; }
      }
      card = create_card('Consumeables', area, null, null, true, true, center, 'crazy_c');
    }
  } else if (target === 'Voucher') {
    card = create_card('Voucher', area, null, null, true, true, null, 'crazy_v');
  } else if (target === 'Cine') {
    card = create_card('Cine', area, null, null, true, true, null, 'crazy_cine');
  } else if (target === 'Playing') {
    if (find_used_cine('Poker Face')) card = create_poker_face_card();
    if (!card) {
      card = create_card(pseudorandom(pseudoseed('crazy_playing' + ante)) > 0.6 ? 'Enhanced' : 'Base', G.pack_cards, null, null, null, true, null, 'crazy_p');
      card.set_edition(poll_edition('crazy_edition' + ante, 2, true));
      const seal_poll = pseudorandom(pseudoseed('crazy_seal' + ante));
      if (seal_poll > 1 - 0.02 * 10) {
        const seal_type = pseudorandom(pseudoseed('crazy_sealtype' + ante));
        card.set_seal(seal_type > 0.75 ? 'Red' : seal_type > 0.5 ? 'Blue' : seal_type > 0.25 ? 'Gold' : 'Purple');
      }
    }
  } else if (target === 'Tag') {
    card = create_tag_as_card(area, true, excludes);
  }
  if (!card) card = create_card('Joker', area, null, null, true, true, null, 'crazy_j');
  return card;
}

/** Reverie.create_card_for_cine_shop: a shop slot of the special shop. */
export function create_card_for_cine_shop(area) {
  const used = cr().used_cine;
  const is_forcing_card_set = is_cine_forcing_card_set();
  let forced_tag = null;
  for (const v of G.GAME.tags.slice()) {
    if (!forced_tag && !is_forcing_card_set) {
      forced_tag = v.apply_to_run({ type: 'store_joker_create', area });
      if (forced_tag) {
        if (find_used_cine('Adrifting') && used.length === 1) {
          for (const vv of G.GAME.tags.slice()) if (vv.apply_to_run({ type: 'store_joker_modify', card: forced_tag })) break;
        }
        // Fix 2: the tag's joker is stocked (the Lua returned it only when Adrifting was the sole Cine,
        // otherwise the tag was spent and its joker dropped).
        return forced_tag;
      }
    }
  }
  const crazy_pack_available = !!find_used_cine('Crazy Lucky');
  const joker_available = (find_used_cine_or("I Sing, I've No Shape", 'Morsel', 'Radioactive') || !is_forcing_card_set) && !crazy_pack_available;
  const planet_or_tarot_available = (!!find_used_cine('Let It Moon') || !is_forcing_card_set) && !crazy_pack_available;
  const playing_available = (!!find_used_cine('Poker Face') || !is_forcing_card_set) && !crazy_pack_available;
  const spectral_available = (!!find_used_cine('Eerie Inn') || !is_forcing_card_set) && !crazy_pack_available;
  const tag_available = !!find_used_cine('Tag or Die') && !crazy_pack_available;
  const GM = G.GAME;
  const playing_card_rate = find_used_cine('Poker Face') ? GM.joker_rate : (GM.playing_card_rate || 0);
  const spectral_rate = find_used_cine('Eerie Inn') ? GM.joker_rate : (GM.spectral_rate || 0);
  let total_rate = (joker_available ? GM.joker_rate : 0) +
    (planet_or_tarot_available ? GM.tarot_rate + GM.planet_rate : 0) +
    (playing_available ? playing_card_rate : 0) +
    (spectral_available ? spectral_rate : 0) +
    (tag_available ? GM.joker_rate : 0) +
    (crazy_pack_available ? GM.joker_rate : 0);
  const candidates = [
    { type: 'Joker', val: joker_available ? GM.joker_rate : 0, available: joker_available },
    { type: 'Tarot', val: planet_or_tarot_available ? GM.tarot_rate : 0, available: planet_or_tarot_available },
    { type: 'Planet', val: planet_or_tarot_available ? GM.planet_rate : 0, available: planet_or_tarot_available },
    { type: (GM.used_vouchers.v_illusion && pseudorandom(pseudoseed('illusion')) > 0.6) ? 'Enhanced' : 'Base', val: playing_available ? playing_card_rate : 0, available: playing_available },
    { type: 'Spectral', val: spectral_available ? spectral_rate : 0, available: spectral_available },
    { type: 'Tag', val: tag_available ? GM.joker_rate : 0, available: tag_available },
    { type: 'Crazy', val: crazy_pack_available ? GM.joker_rate : 0, available: crazy_pack_available },
  ];
  // (The Autumn Circus' Oddities / Codex Arcanum's Alchemicals: not Micatro mods.) More Fluff's Colour cards:
  if (isActive('morefluff')) {
    const colour_available = !!find_used_cine('Every Hue') && !crazy_pack_available;
    const colour_rate = find_used_cine('Every Hue') ? GM.joker_rate : 0;
    total_rate += colour_available ? colour_rate : 0;
    candidates.push({ type: 'Colour', val: colour_available ? colour_rate : 0, available: colour_available });
  }
  const polled_rate = pseudorandom(pseudoseed('cdt' + GM.round_resets.ante)) * total_rate;
  let check_rate = 0;
  for (const v of candidates) {
    if (v.available && polled_rate > check_rate && polled_rate <= check_rate + v.val) {
      let card = null;
      if (v.type === 'Joker') card = create_special_joker(area);
      else if (find_used_cine('Poker Face') && (v.type === 'Enhanced' || v.type === 'Base')) card = create_poker_face_card();
      else if (find_used_cine('Eerie Inn') && v.type === 'Spectral') {
        const poll = pseudorandom('cine_spectral_size');
        const grade = poll >= 0.95 ? 'mega' : poll >= 0.75 ? 'jumbo' : 'normal';
        const index = grade === 'normal' ? math_random(1, 2) : 1;
        card = create_booster(area, P_CENTERS['p_spectral_' + grade + '_' + index]);
      } else if (v.type === 'Tag') card = create_tag_as_card(area);
      else if (v.type === 'Crazy') card = create_booster(area, P_CENTERS.p_rev_crazy_lucky_1);
      if (!card) card = create_card(v.type, area, null, null, null, null, null, 'sho');
      if (find_used_cine('Adrifting') && used.length === 1) {
        G.E_MANAGER.add_event(() => {
          for (const vv of G.GAME.tags.slice()) if (vv.apply_to_run({ type: 'store_joker_modify', card })) break;
        });
      }
      if (!find_used_cine('Gem Heist') && (!find_used_cine('Poker Face') || !card.edition) && (v.type === 'Base' || v.type === 'Enhanced') &&
          GM.used_vouchers.v_illusion && pseudorandom(pseudoseed('illusion')) > 0.8) {
        const edition_poll = pseudorandom(pseudoseed('illusion'));
        card.set_edition(edition_poll > 1 - 0.15 ? { polychrome: true } : edition_poll > 0.5 ? { holo: true } : { foil: true });
      }
      return card;
    }
    if (v.available) check_rate += v.val;
  }
  // (nothing rolled — e.g. a zero total rate: the Lua returned nil and crashed in emplace)
  return create_card('Joker', area, null, null, null, null, null, 'sho');
}

// ------------------------------------------------------------------ using a Cine (Card:use_consumeable wrap)
function use_cine(card) {
  const is_reverie = card.ability.name === 'Reverie';
  const name = card.ability.name;
  if (!cr().used_cine) cr().used_cine = [];
  G.E_MANAGER.add_event(() => {
    const c = cr();
    if (is_reverie) {
      c.used_cine.push('Reverie');
      for (const v of pool_cines(false)) c.used_cine.push(v.name);
    } else if (G.GAME.selected_back_key === 'b_rev_filmstrip' || G.GAME.selected_sleeve === 'sleeve_rev_filmstrip') c.used_cine.push(name);
    else if (!find_used_cine(name)) c.used_cine = [name];
    calculate_reroll_cost(true);
    if (G.GAME.used_vouchers.v_rev_script && !c.cine_temporary_shop_card_limit) {
      c.cine_temporary_shop_card_limit = true;
      G.GAME.shop.joker_max += P_CENTERS.v_rev_script.config.extra;
      G.shop_jokers.config.card_limit = G.GAME.shop.joker_max;
    }
    set_cine_banned_keys();
  });
  G.E_MANAGER.add_event(() => {
    const c = cr();
    for (const x of G.shop_jokers.cards.slice().reverse()) x.remove();
    const n = G.GAME.shop.joker_max - G.shop_jokers.cards.length;
    for (let i = 0; i < n; i++) G.shop_jokers.emplace(create_card_for_cine_shop(G.shop_jokers));
    // Fix 4: each voucher is replaced once (the Lua replaced while walking the same list).
    for (const v of G.shop_vouchers.cards.slice()) {
      if (name === 'Adrifting') { v.cost = P_CENTERS.c_rev_adrifting.config.extra; v.flip(); }
      else if (is_reverie || name === 'Crazy Lucky') {
        v.remove();
        G.shop_vouchers.emplace(create_card_for_cine_shop(G.shop_vouchers));
      }
    }
    const kinds = get_used_cine_kinds();
    if (find_used_cine('Adrifting') || kinds) {
      for (const x of G.shop_booster.cards.slice().reverse()) x.remove();
      for (let i = 1; i <= (c.max_boosters || 0); i++) {
        let kind = null;
        if (kinds) [kind] = pseudorandom_element(kinds, pseudoseed('cine_booster'));
        c.used_packs = {};
        if (!c.used_packs[i]) {
          const p = kind ? get_pack_by_slug('shop_pack', kind) : null;
          c.used_packs[i] = (p || get_pack('shop_pack')).key;
        }
        if (c.used_packs[i] !== 'USED') {
          const b = create_booster(G.shop_booster, P_CENTERS[c.used_packs[i]]);
          b.ability.booster_pos = i;
          G.shop_booster.emplace(b);
        }
      }
    }
  });
}

// ------------------------------------------------------------------ quests (Exchange Coupons)
/** Reverie.complete_cine_quest: flip, become the reward Cine, flip back. */
export function complete_cine_quest(card) {
  G.E_MANAGER.add_event(() => {
    G.E_MANAGER.add_event(() => { card.flip(); play_sound('card1', 1.15); card.juice_up(0.3, 0.3); });
    G.E_MANAGER.add_event(() => {
      delete G.GAME.used_jokers[card.config.center_key];
      card.set_ability(P_CENTERS[card.config.center.reward], true);
      delete card.ability.progress; // (a fresh ability table in the Lua)
      emit('card_changed', { card: card.sort_id });
    });
    G.E_MANAGER.add_event(() => { card.flip(); play_sound('tarot2', 0.85, 0.6); card.juice_up(0.3, 0.3); });
  });
}
/** Reverie.progress_cine_quest. `gone` = a card being removed (no longer in the joker row). */
function progress_cine_quest(card, gone) {
  card.ability.progress += 1;
  for (const v of G.jokers.cards.slice()) if (v !== gone) v.calculate_joker({ cine_progress: true, card });
  if (card.ability.progress === card.ability.extra.goal) complete_cine_quest(card);
  else card_eval_status_text(card, 'extra', null, null, null, { message: card.ability.progress + '/' + card.ability.extra.goal, colour: CINE_COLOUR });
}
/** The quest half of Reverie's Card:calculate_joker wrap: does this context progress this coupon? */
function quest_calc(q, ctx, gone) {
  if (q.debuff || q.ability.set !== 'Cine' || q.ability.progress === undefined) return;
  const r = q.config.center.reward, a = q.ability;
  const csets = (s) => ctx.using_consumeable && ctx.consumeable.ability.set === s;
  if ((r === 'c_rev_gem_heist' && ctx.selling_card && ctx.card.ability.set === 'Joker' && ctx.card.edition) ||
      (r === 'c_rev_ive_no_shape' && ctx.end_of_round && BN.gte(G.GAME.chips, BN.mul(G.GAME.blind.chips, a.extra.chips))) ||
      (r === 'c_rev_unseen' && ctx.end_of_round && G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer) >= a.extra.slots) ||
      (r === 'c_rev_crazy_lucky' && ctx.open_booster) ||
      (r === 'c_rev_tag_or_die' && ctx.skip_blind) ||
      (r === 'c_rev_let_it_moon' && (csets('Tarot') || csets('Planet'))) ||
      (r === 'c_rev_poker_face' && ctx.enhancing_card) ||
      (r === 'c_rev_eerie_inn' && ctx.any_card_destroyed) ||
      (r === 'c_rev_adrifting' && ctx.debuff_or_flipped_played) ||
      (r === 'c_rev_morsel' && ctx.joker_added && is_food_joker(ctx.card.config.center_key)) ||
      (r === 'c_rev_every_hue' && csets('Colour'))) {
    progress_cine_quest(q, gone);
  }
}
function quests_see(ctx, except, gone) {
  if (!G.cine_quests) return;
  for (const q of G.cine_quests.cards.slice()) if (q !== except) quest_calc(q, ctx, gone);
}
const quests_see_later = (ctx) => G.E_MANAGER.add_event(() => quests_see(ctx));

// ------------------------------------------------------------------ centers: Cines + coupons
const cine_loc_vars = (self, iq) => {
  const e = self.config.extra;
  if (self.name === 'Tag or Die') return { vars: [e.cost] };
  if (self.name === 'The Unseen' || self.name === 'Eerie Inn') return { vars: [e.mult] };
  if (self.name === "I Sing, I've No Shape") return { vars: [e.add] };
  if (self.name === 'Crazy Lucky') { iq.push({ key: 'p_rev_crazy_lucky_1' }); return { vars: [] }; }
  if (self.name === 'Every Hue') return { vars: [e.rounds] };
  return { vars: [e] };
};
const can_use_cine = () => G.STATE === STATES.SHOP && !!G.shop_open;
for (const [slug, name, config, pos, order, qconfig, qpos, qorder, needs] of CINES) {
  centers.push({
    key: ck(slug), set: 'Cine', name, consumeable: true, cost: 4, cost_mult: 1.0, pos, atlas: 'rev_cines', order: 20000 + order, config, needs,
    loc_vars: cine_loc_vars,
    can_use: () => can_use_cine(),
    use(self, card) { use_cine(card); },
  });
  centers.push({
    key: ck(slug) + '_quest', set: 'Cine', name: name + ' Exchange Coupon', reward: ck(slug), consumeable: true, cost: 4, cost_mult: 1.0,
    pos: qpos, atlas: 'rev_cines', order: 20000 + qorder, config: qconfig, needs,
    loc_vars(self, iq, card) {
      iq.push({ key: self.reward });
      const a = (card && card.ability && card.ability.extra && card.ability.extra.goal !== undefined) ? card.ability : { extra: self.config.extra };
      const p = a.progress ?? 0;
      if (self.reward === 'c_rev_unseen') return { vars: [a.extra.slots, a.extra.goal, p] };
      if (self.reward === 'c_rev_ive_no_shape') return { vars: [a.extra.chips, a.extra.goal, p] };
      return { vars: [a.extra.goal, p] };
    },
    can_use: () => false,
  });
}
centers.push({
  key: 'c_rev_reverie', set: 'Spectral', name: 'Reverie', consumeable: true, cost: 4, pos: { x: 1, y: 1 }, atlas: 'rev_cines', config: {},
  can_use: () => can_use_cine(),
  use(self, card) { use_cine(card); },
});

// ------------------------------------------------------------------ joker
centers.push({
  key: 'j_rev_dynamic_film', set: 'Joker', name: 'Dynamic Film', rarity: 1, cost: 4, pos: { x: 0, y: 0 }, atlas: 'rev_jokers',
  config: { extra: { chips: 0, chip_mod: 15 } }, blueprint_compat: true, eternal_compat: true, perishable_compat: true,
  loc_vars: (self, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.chip_mod] }),
  calculate(self, card, ctx) {
    if (ctx.cine_progress && !ctx.blueprint) {
      card.ability.extra.chips += card.ability.extra.chip_mod;
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'CHIPS', card });
      return undefined;
    }
    if (ctx.joker_main && card.ability.extra.chips > 0) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), chip_mod: card.ability.extra.chips };
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ boosters (data/boosters.lua)
const packCards = []; // the cards this pack has made so far (Card:open's local pack_cards)
const track = (i, card) => { if (i === 1) packCards.length = 0; packCards.push(card); return card; };
const booster_loc = (key) => (self) => ({ key, set: 'Other', vars: [self.config.choose, self.config.extra] });
const BOOSTERS = [
  ['tag_normal_1', 'Tag Pack', 'Tag', { extra: 2, choose: 1 }, 1, 4, { x: 0, y: 0 }, 1, 'p_tag_normal'],
  ['tag_normal_2', 'Tag Pack', 'Tag', { extra: 2, choose: 1 }, 1, 4, { x: 1, y: 0 }, 2, 'p_tag_normal'],
  ['tag_jumbo_1', 'Jumbo Tag Pack', 'Tag', { extra: 4, choose: 1 }, 1, 6, { x: 2, y: 0 }, 3, 'p_tag_jumbo'],
  ['tag_mega_1', 'Mega Tag Pack', 'Tag', { extra: 4, choose: 2 }, 0.25, 8, { x: 3, y: 0 }, 4, 'p_tag_mega'],
  ['crazy_lucky_1', 'Pack', 'Crazy', { extra: 4, choose: 1, weights: { Joker: 1, Consumeables: 0.75, Playing: 1, Tag: 0.15, Voucher: 0.05, Cine: 0.01 } }, undefined, 6, { x: 4, y: 0 }, 6, 'p_crazy_lucky'],
  ['flim_normal_1', 'Film Pack', 'Cine', { extra: 2, choose: 1 }, 1, 4, { x: 1, y: 1 }, 7, 'p_film_normal'],
  ['flim_normal_2', 'Film Pack', 'Cine', { extra: 2, choose: 1 }, 1, 4, { x: 2, y: 1 }, 8, 'p_film_normal'],
  ['flim_jumbo_1', 'Jumbo Film Pack', 'Cine', { extra: 4, choose: 1 }, 0.6, 6, { x: 3, y: 1 }, 9, 'p_film_jumbo'],
  ['flim_mega_1', 'Mega Film Pack', 'Cine', { extra: 2, choose: 1 }, 0.07, 8, { x: 4, y: 1 }, 10, 'p_film_mega'],
];
for (const [slug, name, kind, config, weight, cost, pos, order, loc] of BOOSTERS) {
  const reverie_pack = kind === 'Cine' ? 'Film' : kind;
  centers.push({
    key: 'p_rev_' + slug, set: 'Booster', name, kind, reverie_pack, config, weight, cost, pos, atlas: 'rev_boosters', order: 9000 + order,
    // yes_pool_flag "Tag or Die" / "Crazy Lucky": banned unless that Cine is on (Reverie.set_cine_banned_keys)
    yes_flag: kind === 'Tag' ? 'Tag or Die' : kind === 'Crazy' ? 'Crazy Lucky' : undefined,
    loc_vars: booster_loc(loc),
    create_card(self, booster, i) {
      if (kind === 'Tag') return track(i, create_tag_as_card(G.pack_cards, true, packCards.map((c) => c.config.center.key)));
      if (kind === 'Crazy') return track(i, create_crazy_random_card(G.pack_cards, packCards.map((c) => c.config.center.key)));
      return track(i, create_card(name.includes('Mega') ? 'Cine' : 'Cine_Quest', G.pack_cards, null, null, true, true, null, 'film'));
    },
  });
}

// ------------------------------------------------------------------ vouchers / decks / tags
centers.push(
  {
    key: 'v_rev_script', set: 'Voucher', name: 'Script', config: { extra: 2 }, cost: 10, pos: { x: 0, y: 0 }, atlas: 'rev_vouchers', available: true,
    loc_vars: (self) => ({ vars: [self.config.extra] }),
    redeem(self) {
      if (cr().used_cine && !cr().cine_temporary_shop_card_limit) {
        cr().cine_temporary_shop_card_limit = true;
        change_shop_size(self.config.extra);
      }
    },
  },
  {
    key: 'v_rev_megaphone', set: 'Voucher', name: 'Megaphone', config: { extra: 0.5 }, cost: 10, pos: { x: 0, y: 1 }, atlas: 'rev_vouchers', available: true,
    requires: ['v_rev_script'], loc_vars: () => ({ vars: [] }),
    redeem() {
      if (!G.cine_quests) return;
      G.E_MANAGER.add_event(() => {
        for (const v of G.cine_quests.cards.slice()) {
          if (v.ability.progress !== undefined) {
            v.ability.extra.goal = halve_cine_quest_goal(v.ability.extra.goal);
            if (v.ability.progress >= v.ability.extra.goal) complete_cine_quest(v);
          }
        }
      });
    },
  },
  {
    key: 'b_rev_filmstrip', set: 'Back', name: 'Filmstrip Deck', config: { cine_slot: 1 }, pos: { x: 0, y: 0 }, atlas: 'rev_backs', order: 9001,
    loc_vars: (self) => ({ vars: [self.config.cine_slot] }),
    apply(self) { G.GAME.starting_params.cine_quest_slots += self.config.cine_slot; },
  },
  {
    key: 'b_rev_stamp', set: 'Back', name: 'Stamp Deck', config: {}, pos: { x: 1, y: 0 }, atlas: 'rev_backs', order: 9002,
    loc_vars: () => ({ vars: [localize({ type: 'name_text', key: 'p_tag_jumbo', set: 'Other' })] }),
  },
);
function open_free_pack(key) {
  const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
  card.cost = 0;
  card.from_tag = true;
  use_card(card);
  emit('materialize', { card: card.sort_id });
}
const tags = [
  {
    key: 'tag_rev_cine', name: 'Stub Tag', set: 'Tag', atlas: 'rev_tags', pos: { x: 0, y: 0 }, config: { type: 'new_blind_choice' },
    loc_vars: (self, iq) => { iq.push({ key: 'p_rev_flim_normal_1' }); return { vars: [] }; },
    apply(self, tag, context) {
      if (context.type !== 'new_blind_choice') return undefined;
      tag.yep('+', CINE_COLOUR, () => { open_free_pack('p_rev_flim_normal_' + math_random(1, 2)); return true; });
      tag.triggered = true;
      return true;
    },
  },
  {
    key: 'tag_rev_mega_tag', name: 'Stamp Tag', set: 'Tag', atlas: 'rev_tags', pos: { x: 2, y: 0 }, config: { type: 'new_blind_choice' },
    yes_pool_flag: 'tag_tag_available',
    loc_vars: (self, iq) => { iq.push({ key: 'p_rev_tag_jumbo_1' }); return { vars: [] }; },
    apply(self, tag, context) {
      if (context.type !== 'new_blind_choice') return undefined;
      tag.yep('+', TAG_COLOUR, () => { open_free_pack('p_rev_tag_jumbo_1'); return true; });
      tag.triggered = true;
      return true;
    },
  },
  // Mega Stamp Tag (1.3.0 main, tags.lua `mega_tag`, a CardSleeves dependency): the Stamp Sleeve on the Stamp Deck. A free
  // Jumbo Tag Pack AND a random tag. (Its 1.3.0 key `mega_tag` is OUR 1.2.6 Stamp Tag's key, so it is keyed apart here.)
  {
    key: 'tag_rev_mega_stamp', name: 'Mega Stamp Tag', set: 'Tag', atlas: 'rev_tags', pos: { x: 2, y: 0 }, config: { type: 'new_blind_choice' },
    yes_pool_flag: 'tag_tag_available',
    loc_vars: (self, iq) => { iq.push({ key: 'p_rev_tag_jumbo_1' }); return { vars: [] }; },
    apply(self, tag, context) {
      if (context.type !== 'new_blind_choice') return undefined;
      tag.yep('+', TAG_COLOUR, () => {
        open_free_pack('p_rev_tag_jumbo_1');
        const t = new Tag(get_next_tag_key('mega_stamp'));
        if (t.name === 'Orbital Tag') {
          const poker_hands = HANDLIST.filter((k) => G.GAME.hands[k].visible);
          t.ability.orbital_hand = pseudorandom_element(poker_hands, pseudoseed('mega_stamp_orbital'))[0];
        }
        add_tag(t);
        return true;
      });
      tag.triggered = true;
      return true;
    },
  },
];

// ------------------------------------------------------------------ sleeves (1.3.0 main, data/sleeves.lua; CardSleeves)
// Filmstrip Sleeve: the Filmstrip Deck's effect (Cines stack, +1 Cine slot); on the Filmstrip Deck (alt) no second slot, and
// an Exchange Coupon placed in the shop / a pack is Negative 1 in 4 (`filmstrip_sleeve`; 1.3.0's config.rate is unused).
// Stamp Sleeve: skips give Stamp Tags (the Stamp Deck's effect); on the Stamp Deck (alt) Mega Stamp Tags.
const prob_normal = () => String(G.GAME && G.GAME.probabilities ? G.GAME.probabilities.normal : 1);
const sleeves = [
  {
    key: 'sleeve_rev_filmstrip', name: 'Filmstrip Sleeve', atlas: 'rev_sleeves', pos: { x: 0, y: 0 }, config: { cine_slot: 1, odds: 4, rate: 2 },
    loc_vars: (self) => ({ vars: [self.config.cine_slot, prob_normal(), self.config.odds] }),
    apply(self) { G.GAME.starting_params.cine_quest_slots += self.config.cine_slot; },
    alt: { deck: 'b_rev_filmstrip', apply() {} },
  },
  {
    key: 'sleeve_rev_stamp', name: 'Stamp Sleeve', atlas: 'rev_sleeves', pos: { x: 1, y: 0 }, config: {},
    loc_vars: () => ({ vars: [localize({ type: 'name_text', key: 'p_tag_jumbo', set: 'Other' })] }),
    alt: { deck: 'b_rev_stamp' },
  },
];

// ------------------------------------------------------------------ ticket shaders (assets/shaders/*.fs)
// Lua draws them on top of a Cine (no Negative edition): ticket_negative + negative_shine on The Unseen,
// ticket_polychrome on I Sing, ticket on the rest. Here each is one pass over the card face (the board's
// mod-edition seam), blending the overlay the way the Lua's second draw does.
const NOT_BORDER = `
  vec3 b1 = vec3(1., 244./255., 180./255.), b2 = vec3(189./255., 188./255., 132./255.), b3 = vec3(171./255., 170./255., 120./255.);
  bool inside = any(greaterThan(abs(base.rgb - b1), vec3(0.1))) && any(greaterThan(abs(base.rgb - b2), vec3(0.1))) && any(greaterThan(abs(base.rgb - b3), vec3(0.1)));`;
const SHADERS = {
  rev_ticket: `void main(){
    vec4 base = texture2D(tex0, vUv); vec2 uv = vUv; vec2 ticket = fx; vec4 tex = base;${NOT_BORDER}
    vec3 jb = vec3(79./255., 99./255., 103./255.);
    if (inside && any(greaterThan(abs(base.rgb - jb), vec3(0.1)))) {
      float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b)); float delta = max(high-low, low*0.7);
      float fac = 0.8 + 0.9*sin(13.*uv.x+5.32*uv.y + ticket.r*12. + cos(ticket.r*5.3 + uv.y*4.2 - uv.x*4.));
      float fac2 = 0.5 + 0.5*sin(10.*uv.x+2.32*uv.y + ticket.r*5. - cos(ticket.r*2.3 + uv.x*8.2));
      float fac3 = 0.5 + 0.5*sin(12.*uv.x+6.32*uv.y + ticket.r*6.111 + sin(ticket.r*5.3 + uv.y*3.2));
      float fac4 = 0.5 + 0.5*sin(4.*uv.x+2.32*uv.y + ticket.r*8.111 + sin(ticket.r*1.3 + uv.y*13.2));
      float fac5 = sin(0.5*16.*uv.x+5.32*uv.y + ticket.r*12. + cos(ticket.r*5.3 + uv.y*4.2 - uv.x*4.));
      float maxfac = 0.6*max(max(fac, max(fac2, max(fac3,0.0))) + (fac+fac2+fac3*fac4), 0.);
      tex.rgb = tex.rgb*0.5 + vec3(0.4, 0.4, 0.8);
      tex.r = tex.r-delta + delta*maxfac*(0.7 + fac5*0.07) - 0.1;
      tex.g = tex.g-delta + delta*maxfac*(0.7 - fac5*0.17) - 0.1;
      tex.b = tex.b-delta + delta*maxfac*0.7 - 0.1;
      tex.a = tex.a*(0.8*max(min(1., max(0.,0.3*max(low*0.2, delta)+ min(max(maxfac*0.1,0.), 0.4)) ), 0.) + 0.15*maxfac*(0.1+delta));
      tex.a *= 0.6;
      base = vec4(mix(base.rgb, clamp(tex.rgb, 0., 1.), clamp(tex.a, 0., 1.)), base.a);
    }
    gl_FragColor = dissolve_mask(base, vUv, uv); }`,
  rev_ticket_negative: `void main(){
    vec4 base = texture2D(tex0, vUv); vec2 uv = vUv; vec2 shine = fx; vec4 tex = base;${NOT_BORDER}
    if (inside) { vec4 SAT = HSL(tex); SAT.b = (1.-SAT.b); SAT.r = -SAT.r+0.2; tex = RGB(SAT) + 0.8*vec4(79./255., 99./255.,103./255.,0.); tex.a = base.a; }
    if (tex.a < 0.7) tex.a = tex.a/3.;
    float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b)); float delta = high-low -0.1;
    float fac = 0.8 + 0.9*sin(11.*uv.x+4.32*uv.y + shine.r*12. + cos(shine.r*5.3 + uv.y*4.2 - uv.x*4.));
    float fac2 = 0.5 + 0.5*sin(8.*uv.x+2.32*uv.y + shine.r*5. - cos(shine.r*2.3 + uv.x*8.2));
    float fac3 = 0.5 + 0.5*sin(10.*uv.x+5.32*uv.y + shine.r*6.111 + sin(shine.r*5.3 + uv.y*3.2));
    float fac4 = 0.5 + 0.5*sin(3.*uv.x+2.32*uv.y + shine.r*8.111 + sin(shine.r*1.3 + uv.y*11.2));
    float maxfac = 0.7*max(max(fac, max(fac2, max(fac3,0.0))) + (fac+fac2+fac3*fac4), 0.);
    float sa = 0.5*max(min(1., max(0.,0.3*max(low*0.2, delta)+ min(max(maxfac*0.1,0.), 0.4)) ), 0.) + 0.15*maxfac*(0.1+delta);
    vec3 s = tex.rgb*0.5 + vec3(0.4, 0.4, 0.8) - delta + delta*maxfac*0.7 - 0.1;
    tex.rgb = mix(tex.rgb, clamp(s, 0., 1.), clamp(sa, 0., 1.));
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
  rev_ticket_polychrome: `void main(){
    vec4 base = texture2D(tex0, vUv); vec2 uv = vUv; vec2 tp = fx; vec4 tex = base;${NOT_BORDER}
    vec3 jb = vec3(79./255., 99./255., 103./255.);
    if (inside && any(greaterThan(abs(base.rgb - jb), vec3(0.1)))) {
      float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b)); float delta = high - low;
      float saturation_fac = 1. - max(0., 0.05*(1.1-delta));
      vec4 hsl = HSL(vec4(tex.r*saturation_fac, tex.g*saturation_fac, tex.b, tex.a));
      float t = tp.y*2.221 + time;
      vec2 floored_uv = (floor((uv*texture_details.ba)))/texture_details.ba;
      vec2 uv_scaled_centered = (floored_uv - 0.5) * 50.;
      vec2 field_part1 = uv_scaled_centered + 50.*vec2(sin(-t / 143.6340), cos(-t / 99.4324));
      vec2 field_part2 = uv_scaled_centered + 50.*vec2(cos( t / 53.1532),  cos( t / 61.4532));
      vec2 field_part3 = uv_scaled_centered + 50.*vec2(sin(-t / 87.53218), sin(-t / 49.0000));
      float field = (1.+ (cos(length(field_part1) / 19.483) + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73) + cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92) ))/2.;
      float res = (.5 + .5* cos( (tp.x) * 2.612 + ( field + -.5 ) *3.14));
      hsl.x = hsl.x+ res + tp.y*0.04; hsl.y = min(0.6,hsl.y+0.5);
      tex.rgb = RGB(hsl).rgb;
    }
    if (tex.a < 0.7) tex.a = tex.a/3.;
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
};
// Registered as centers of their own set ('Shader', never pooled or rolled) so the renderer's
// mod-edition pass (MODREG.center('e_' + type).shader_fs) finds them.
for (const [k, fs] of Object.entries(SHADERS)) centers.push({ key: 'e_' + k, set: 'Shader', name: k, config: {}, shader_fs: fs, omit: true });
const ticket_of = (card) => (card.ability.name === 'The Unseen' ? 'rev_ticket_negative' : card.ability.name === "I Sing, I've No Shape" ? 'rev_ticket_polychrome' : 'rev_ticket');

// ------------------------------------------------------------------ hooks
const SHOP_AREAS = () => [G.shop_jokers, G.shop_vouchers, G.shop_booster, G.pack_cards];
let raw_emplace = false; // emplace_ref: the Crazy Lucky stand-in pack skips the wrap
const fill_lines = (lines, vars) => lines.map((l) => l.replace(/#(\d+)#/g, (m, n) => (vars[n - 1] !== undefined ? String(vars[n - 1]) : m)));

const hooks = {
  init_game_object(GAME) {
    GAME.starting_params.cine_quest_slots = 1; // get_starting_params wrap
    // G.P_CENTER_POOLS.Cine / Cine_Quest (inject_cines), each in the mod's order; a Cine whose mod
    // dependency is off is not registered at all.
    P_CENTER_POOLS.Cine = pool_cines(false);
    P_CENTER_POOLS.Cine_Quest = pool_cines(true);
    if (P_CENTER_POOLS.Consumeables) {
      const keep = P_CENTER_POOLS.Consumeables.filter((c) => !(c.mod === MOD_ID && !cine_available(c)));
      P_CENTER_POOLS.Consumeables.length = 0;
      P_CENTER_POOLS.Consumeables.push(...keep);
    }
  },
  start_run() {
    // game.lua (lovely): the Cine quest area, sized by starting_params (after the deck's apply_to_run).
    G.cine_quests = new CardArea('cine_quests', { card_limit: G.GAME.starting_params.cine_quest_slots, type: 'joker', highlighted_limit: 1 });
    G.areas.push(G.cine_quests);
    set_cine_banned_keys();
    stamp_tags();
  },
  /** get_current_pool (lovely): Reverie never rolls from a pool — only its own "soul" roll. */
  pool_filter(v) {
    if (v.key === 'c_rev_reverie') return false;
    if (v.mod === MOD_ID && !cine_available(v)) return false;
    return undefined;
  },
  empty_pool_default: (key, _type) => (_type === 'Cine_Quest' ? 'c_rev_gem_heist_quest' : undefined),
  /** create_card wrap: the Reverie spectral as a soul-like roll in Cine / coupon / Spectral cards. */
  create_card_key(_type) {
    if ((_type === 'Cine' || _type === 'Cine_Quest' || _type === 'Spectral') && !(G.GAME.used_jokers.c_rev_reverie && !find_joker('Showman').length)) {
      if (pseudorandom('reverie_' + _type + G.GAME.round_resets.ante) > 0.997) return 'c_rev_reverie';
    }
    return undefined;
  },
  create_card_for_shop: (area) => (cr().used_cine ? create_card_for_cine_shop(area) : undefined),
  /** calculate_reroll_cost wrap: each Cine in use multiplies or adds to the reroll cost. */
  reroll_cost(cost) {
    if (!cr().used_cine) return undefined;
    let add = 0;
    for (const v of cr().used_cine) {
      const center = find_cine_center(v);
      if (center && typeof center.config.extra === 'object') {
        if (center.config.extra.mult) cost = Math.max(0, Math.floor(cost * center.config.extra.mult));
        else if (center.config.extra.add) add += center.config.extra.add;
      }
    }
    return cost + add;
  },
  /** get_pack wrap: a pack outside the Cine's kinds becomes one of them. */
  get_pack(pack, _key, _type) {
    if (_type || !cr().used_cine || !pack) return undefined;
    const kinds = get_used_cine_kinds();
    if (!kinds || kinds.some((k) => pack.key.includes(k))) return undefined;
    const [k] = pseudorandom_element(kinds, pseudoseed('cine_booster'));
    return get_pack_by_slug(_key, k) || pack;
  },
  /** CardArea:emplace wrap. */
  emplace(area, card) {
    if (raw_emplace) return;
    const c = cr();
    if (card.ability.booster_pos) c.max_boosters = Math.max(c.max_boosters || 0, card.ability.booster_pos);
    if (!SHOP_AREAS().includes(area)) return;
    const unseen = find_used_cine('The Unseen'), heist = find_used_cine('Gem Heist');
    const set = card.ability.set;
    const editions = [];
    if (heist && (set === 'Joker' || set === 'Default' || set === 'Enhanced')) editions.push('polychrome');
    if (unseen && (set === 'Joker' || card.ability.consumeable)) editions.push('negative');
    if (editions.length) {
      const [ed] = pseudorandom_element(editions, pseudoseed('edition'));
      card.set_edition({ [ed]: true });
    } else if (set === 'Cine' && card.ability.progress !== undefined && G.GAME.selected_sleeve === 'sleeve_rev_filmstrip' && G.GAME.selected_back_key === 'b_rev_filmstrip') {
      // (1.3.0: the Filmstrip Sleeve on the Filmstrip Deck: an Exchange Coupon 1 in 4 Negative)
      if (pseudorandom('filmstrip_sleeve') < G.GAME.probabilities.normal / sleeves[0].config.odds) card.set_edition({ negative: true });
    }
    if (heist) {
      card.cost = Math.max(1, Math.floor(card.cost * (100 - P_CENTERS.c_rev_gem_heist.config.extra) / 100));
      card.sell_cost = Math.max(1, Math.floor(card.cost / 2)) + (card.ability.extra_value || 0);
    }
    if (find_used_cine('Morsel') && is_food_joker(card.config.center.key)) {
      card.ability.morseled = true;
      double_ability(card.config.center.config, card.ability);
    }
    if (find_used_cine('Every Hue') && set === 'Colour' && card.ability.upgrade_rounds) {
      const rounds = P_CENTERS.c_rev_every_hue.config.extra.rounds;
      card.ability.val = Math.floor(rounds / card.ability.upgrade_rounds);
      card.ability.partial_rounds = rounds % card.ability.upgrade_rounds;
      if (card.config.center.key === 'c_mf_yellow' && card.ability.val > 0) {
        card.ability.extra_value = (card.ability.extra_value || 0) + (card.ability.value_per || 8) * card.ability.val;
        card.set_cost();
      }
    }
    if (find_used_cine('Adrifting') && area !== G.pack_cards) {
      card.cost = P_CENTERS.c_rev_adrifting.config.extra;
      card.sell_cost = P_CENTERS.c_rev_adrifting.config.extra;
      card.facing = 'back';
    } else if (find_used_cine('Crazy Lucky') && area === G.shop_booster && card.config.center.kind !== 'Crazy') {
      area.remove_card(card);
      card.remove();
      const nb = create_booster(area, P_CENTERS.p_rev_crazy_lucky_1);
      raw_emplace = true;
      try { area.emplace(nb); } finally { raw_emplace = false; }
    }
  },
  /** Card:open (lovely): Poker Face fills Standard packs with copies of your deck; Morsel / I Sing fill Buffoon packs. */
  pack_card(booster) {
    const n = booster.ability.name;
    if (n.includes('Standard') && find_used_cine('Poker Face')) return create_poker_face_card() || undefined;
    if (n.includes('Buffoon')) return create_special_joker(G.pack_cards) || undefined;
    return undefined;
  },
  /** G.FUNCS.toggle_shop wrap: Reverie.end_cine_shop. */
  shop_end() {
    const c = cr();
    if (c.cine_temporary_shop_card_limit) {
      c.cine_temporary_shop_card_limit = undefined;
      G.GAME.shop.joker_max -= P_CENTERS.v_rev_script.config.extra;
      G.shop_jokers.config.card_limit = G.GAME.shop.joker_max;
    }
    c.max_boosters = undefined;
    c.used_cine = undefined;
    set_cine_banned_keys();
  },
  /** Tag:apply_to_run wrap + lovely's "blocking newly gained new_blind_choice tags from triggering in shop". */
  tag_apply(tag, context) {
    if (context.type === 'new_blind_choice' && (cr().used_cine || G.shop_open)) return false;
    return undefined;
  },
  /** Game:update_shop wrap: tags bought as cards apply their 'immediate' effect in the shop. */
  update() {
    if (G.STATE === STATES.SHOP && G.STATE_COMPLETE) for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' });
  },
  // ---- the Cine area: use / sell, negative slots
  action_area: (card, kind) => (card.area === G.cine_quests ? true : undefined),
  negative_area: (card) => (G.cine_quests && is_cine_or_reverie(card) ? G.cine_quests : undefined),
  /** G.FUNCS.can_select_card / can_select_crazy_card. */
  pack_select(card) {
    if (!card.ability.consumeable) return undefined;
    const to = hooks.pack_take_area(card);
    if (!to) return undefined;
    return to.cards.length < to.config.card_limit + (card.edition && card.edition.negative ? 1 : 0);
  },
  /** G.FUNCS.use_card (lovely): a Cine — or any consumable in a Tag / Crazy / Film pack — is taken, not used. */
  pack_take_area(card) {
    const cine = is_cine_or_reverie(card);
    if (in_reverie_pack() || cine) return cine ? G.cine_quests : G.consumeables;
    return undefined;
  },
  /** use_card (lovely): a Tag card picked from a pack joins your tags; 'immediate' tags apply now. */
  use_other(card) {
    if (card.ability.set !== 'Tag' || !card.ability.tag) return undefined;
    add_tag(card.ability.tag);
    card.remove();
    play_sound('generic1', 0.9, 0.8);
    play_sound('holo1', 1.2, 0.4);
    for (const v of G.GAME.tags.slice()) v.apply_to_run({ type: 'immediate' });
    return true;
  },
  /** Card:redeem (lovely): a Crazy Lucky pack's voucher is free, and clears the round's voucher if it is that one. */
  redeem(card) {
    if (in_reverie_pack() !== 'Crazy' || card.area) return undefined;
    card.cost = 0;
    if (G.GAME.current_round.voucher === card.config.center_key) G.GAME.current_round.voucher = null;
    return undefined;
  },
  /** G.FUNCS.use_card wrap: coupons see every consumable used (or taken from a pack). */
  use_card_done(card) { if (card.ability.consumeable) quests_see_later({ using_consumeable: true, consumeable: card }); },
  /** G.FUNCS.use_card (lovely): a used consumable isn't "destroyed" (Eerie Inn's coupon). */
  used_consumeable(card) { card.ability.not_destroyed = true; },
  // ---- tags bought as cards (lovely buy_from_shop patches)
  buy_space: (card) => (card.ability.set === 'Tag' ? true : undefined),
  buy_place(card) {
    if (card.ability.set !== 'Tag' || !card.ability.tag) return undefined;
    add_tag(card.ability.tag);
    card.remove();
    play_sound('generic1', 0.9, 0.8);
    play_sound('holo1', 1.2, 0.4);
    return true;
  },
  // ---- quest progress sources
  sell_card(card) {
    card.ability.not_destroyed = true; // Card:sell_card wrap
    quests_see_later({ selling_card: true, card }); // G.FUNCS.sell_card wrap
  },
  end_round_start() {
    // end_round wrap: queued after end_round's own event (so it sees that event's work, not its nested events)
    if (G.cine_quests && G.STATE !== STATES.GAME_OVER) G.E_MANAGER.add_event(() => quests_see_later({ end_of_round: true }));
  },
  booster_open() { quests_see_later({ open_booster: true }); },
  skip_blind(when) { if (when === 'before') quests_see_later({ skip_blind: true }); },
  pre_play() {
    if (G.play && G.play.cards[0]) return undefined;
    for (const v of G.hand.highlighted) if (v.debuff || v.facing === 'back') quests_see_later({ debuff_or_flipped_played: true });
    return undefined;
  },
  add_to_deck(card, from_debuff) {
    // Fix 1: only getting a joker counts (not one coming back from a debuff).
    if (card.ability.set === 'Joker' && !from_debuff) quests_see({ joker_added: true, card });
  },
  set_ability(card, center, old_center, initial) {
    if (center.mod === MOD_ID && center.set === 'Cine' && center.reward) {
      card.ability.progress = 0;
      if (G.GAME.used_vouchers.v_rev_megaphone) card.ability.extra.goal = halve_cine_quest_goal(card.ability.extra.goal);
    }
    if (!initial && G.cine_quests && center.set === 'Enhanced' && old_center === P_CENTERS.c_base && G.playing_cards.includes(card)) {
      quests_see_later({ enhancing_card: true, card });
    }
  },
  card_removed(card) {
    if (!G.cine_quests || card.removed) return;
    const destroyed = (card.added_to_deck && !card.ability.not_destroyed) || (G.playing_cards && card.playing_card);
    if (destroyed && card.area && G.areas.includes(card.area)) quests_see({ any_card_destroyed: true, card }, card, card);
  },
  // ---- Morsel's doubled food jokers (Card:calculate_joker wrap)
  calculate_joker(card, ctx) {
    if (!card.ability.morseled || card.debuff) return undefined;
    const k = card.config.center.key;
    if (k === 'j_diet_cola' && ctx.selling_self) {
      G.E_MANAGER.add_event(() => { add_tag(new Tag('tag_double')); play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4); });
    } else if (k === 'j_bunc_fondue' && ctx.after && G.GAME.current_round.hands_played === 1 && ctx.scoring_hand && !ctx.blueprint) {
      // (1.3.0 custom_morsel_compat: a morseled Fondue converts the SECOND hand of the round too; its own code does the first)
      G.GAME.Exotic = true; // (Bunco's enable_exotics())
      const sh = ctx.scoring_hand.slice();
      for (const c of sh) G.E_MANAGER.add_event(() => { c.flip(); play_sound('card1', 1); });
      for (const c of sh) G.E_MANAGER.add_event(() => { c.change_suit('bunc_Fleurons'); });
      for (const c of sh) G.E_MANAGER.add_event(() => { c.flip(); play_sound('tarot2', 1, 0.6); });
    } else if (k === 'j_mf_tonersoup' && ctx.cardarea === G.jokers && ctx.before) {
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        G.GAME.consumeable_buffer += 1;
        G.E_MANAGER.add_event(() => {
          const c = create_card('Tarot', G.consumeables, null, null, null, null, null, 'sup');
          c.add_to_deck();
          G.consumeables.emplace(c);
          G.GAME.consumeable_buffer = 0;
        });
      }
    }
    return undefined;
  },
  // ---- Stamp Deck (Back:trigger_effect 'setting_tags': start_run and every cash out)
  round_counts(when, where) { if (when === 'after' && where === 'cash_out') stamp_tags(); },
  // ---- descriptions / view
  describe(card, desc) {
    if (card.ability.set === 'Tag' && card.ability.tag) {
      const t = card.ability.tag;
      const d = describeTag(t);
      if (t.name === 'Skip Tag') {
        const L = BASE_LOC.descriptions.Tag.tag_skip;
        d.lines = fill_lines(L.text, [t.config.skip_bonus, t.config.skip_bonus * (G.GAME.skips || 0)]);
      }
      Object.assign(desc, { name: d.name, lines: d.lines, info: d.info || [] });
      return;
    }
    if (card.edition && card.edition.negative && is_cine_or_reverie(card)) {
      desc.info = (desc.info || []).filter((x) => !/^e_negative/.test(x.key));
      desc.info.push({ key: 'e_negative_cine', name: 'Negative', lines: ['{C:dark_edition}+1{} Cine slot'] });
    }
    if (card.ability.morseled) {
      const alt = MORSEL_ALT[card.config.center.key];
      if (alt && desc.lines) alt.forEach((l, i) => { if (l !== '.' && i < desc.lines.length) desc.lines[i] = l; });
      (desc.info = desc.info || []).unshift({ key: 'morseled', name: 'Morsel', lines: ['Ability is {C:attention}doubled'] });
    }
  },
  view_card(card, v) {
    if (card.ability.set === 'Tag' && card.ability.tag) {
      v.tag_card = card.tag_card || 'small';
      v.tag = card.config.center.key;
    }
    if (card.area === G.cine_quests) v.sell = card.sell_cost;
    if (card.area === G.pack_cards && card.ability.consumeable && hooks.pack_take_area(card)) v.use_label = 'Select';
    if (card.facing === 'back' && FLIPPED[card.ability.set]) [v.back_atlas, v.back_pos] = FLIPPED[card.ability.set];
    if (card.ability.set === 'Cine' && !card.edition && card.facing !== 'back') v.edition = ticket_of(card);
  },
  view(view, cardView) {
    if (!G.cine_quests) return;
    view.areas.cine_quests = G.cine_quests.cards.map((c) => cardView(c, true));
    view.mod_areas = (view.mod_areas || []).concat([{ key: 'cine_quests', label: 'Cine', limit: G.cine_quests.config.card_limit, buttons: ['sell', 'use'] }]);
    const rp = in_reverie_pack();
    if (rp && /^MOD_PACK/.test(view.state)) {
      view.pack_kind = rp === 'Tag' ? 'Tag Pack' : rp === 'Crazy' ? 'Pack' : 'Film Pack';
      view.pack_colours = rp === 'Tag' ? { colour: TAG_COLOUR, special: '#000000' }
        : rp === 'Crazy' ? { colour: '#cb4c44', special: '#5e6f39' } : { colour: CINE_COLOUR, special: '#000000' };
    }
  },
};
function stamp_tags() {
  // (Back:trigger_effect 'setting_tags', then (1.3.0) the sleeve's: the Stamp Sleeve gives Stamp Tags, Mega Stamp Tags on
  // the Stamp Deck)
  const deck = G.GAME.selected_back_key === 'b_rev_stamp', sleeve = G.GAME.selected_sleeve === 'sleeve_rev_stamp';
  if (!deck && !sleeve) return;
  const tag = sleeve && deck ? 'tag_rev_mega_stamp' : 'tag_rev_mega_tag';
  G.GAME.round_resets.blind_tags.Small = tag;
  G.GAME.round_resets.blind_tags.Big = tag;
}

export const REVERIE = registerMod({
  id: MOD_ID,
  name: 'Reverie',
  prefix: 'rev',
  // The label: our source is byte-identical to tag v1.2.6 (the latest release). contentRev 1: from 1.3.0 main (3728d64,
  // 2024-10-10) the two sleeves, the Mega Stamp Tag and Bunco's foods in Morsel (PORTING.md).
  version: '1.2.6',
  contentRev: 1,
  sleeves, // (engine/sleeve.js)
  by: 'DVRP (rebuilt for Micatro)',
  badge_colour: CINE_COLOUR,
  description: 'A movie-themed expansion: Cine cards and quests that turn the next shop into a special shop (tags, packs, food jokers...).',
  content: {
    centers, tags, atlases, loc: LOC,
    consumable_types: [{ key: 'Cine', name: 'Cine', shop_rate: 0, default: 'c_rev_gem_heist', primary_colour: CINE_COLOUR, secondary_colour: CINE_COLOUR }],
  },
  hooks,
});

export const STATUS = {
  cines: centers.filter((c) => c.set === 'Cine' && !c.reward).map((c) => c.key),
  quests: centers.filter((c) => c.set === 'Cine' && c.reward).map((c) => c.key),
  boosters: centers.filter((c) => c.set === 'Booster').map((c) => c.key),
  vouchers: centers.filter((c) => c.set === 'Voucher').map((c) => c.key),
  decks: centers.filter((c) => c.set === 'Back').map((c) => c.key),
  tags: tags.map((t) => t.key),
  skipped: ['c_alchemist + coupon (needs Codex Arcanum)', 'c_radioactive + coupon (needs Fusion Jokers)', 'tag_tag (Mark Tag: commented out in the mod)'],
};
