// Micatro engine core — a headless, deterministic port of Balatro's game logic.
//
// The port mirrors Balatro's own structure on purpose (a global-ish `G`, Card /
// CardArea objects, `calculate_joker`, `use_consumeable`, ...) so each Lua
// function can be translated nearly line-for-line. Differences from Lua:
//   * Balatro's frame-driven event manager becomes a synchronous FIFO queue
//     (`G.E_MANAGER.add_event(fn)`), flushed at the end of every player action.
//     Purely visual events are dropped; anything that changes state is kept, in
//     the same order, so "read now, apply later" logic (dollar_buffer,
//     consumeable_buffer, ...) behaves exactly as in the original.
//   * Visual feedback (card_eval_status_text, juice, sounds) is emitted as
//     plain-data UI events (`emit`) the renderer — or a spectator — replays.
//   * Every random roll goes through `pseudoseed`/`pseudorandom` keyed off the
//     run seed, so a run is fully reproducible from its seed + action list.

import DATA from '../../data/balatro_data.js';
import { callHook, reduceHook, firstHook, activeConsumableTypes, CONSUMABLE_TYPES, MOD_LOC, ACTIVE as ACTIVE_MODS, centerActive, activeModEditions } from '../mods/registry.js';

export const G = {};

// ---------------------------------------------------------------- data tables
export const P_CENTERS = DATA.centers;
export const P_CARDS = DATA.cards;
export const P_BLINDS = DATA.blinds;
export const P_TAGS = DATA.tags;
export const P_SEALS = DATA.seals;
export const P_STAKES = DATA.stakes;
export const HANDS_PROTO = DATA.hands;
export const LOC = DATA.loc;
for (const [k, v] of Object.entries(P_CENTERS)) v.key = k;
for (const [k, v] of Object.entries(P_BLINDS)) v.key = k;
for (const [k, v] of Object.entries(P_TAGS)) v.key = k;
for (const [k, v] of Object.entries(P_SEALS)) v.key = k;
for (const [k, v] of Object.entries(P_STAKES)) v.key = k;
for (const [k, v] of Object.entries(P_CARDS)) v.key = k;
P_CARDS.empty = {};

const byOrder = (a, b) => a.order - b.order;
const BASE_POOL_KEYS = ['Booster', 'Default', 'Enhanced', 'Edition', 'Joker', 'Tarot', 'Planet', 'Tarot_Planet', 'Spectral', 'Consumeables', 'Voucher', 'Back', 'Tag', 'Seal', 'Stake', 'Demo'];
export const P_CENTER_POOLS = {};
export const P_JOKER_RARITY_POOLS = [null, [], [], [], []];
/**
 * (Re)build the center pools from base content plus whatever mod content
 * `isActive(center)` allows. Called once at load (base only) and again by the
 * mod system on every newRun, so a disabled mod's cards never enter a pool.
 * Mod consumable sets get their own pool; mod rarities (string keys such as
 * 'poke_safari') get a rarity pool under that key.
 */
export function rebuildPools(isActive = (c) => !c.mod) {
  for (const k of Object.keys(P_CENTER_POOLS)) delete P_CENTER_POOLS[k];
  for (const k of BASE_POOL_KEYS) P_CENTER_POOLS[k] = [];
  P_JOKER_RARITY_POOLS.length = 0;
  P_JOKER_RARITY_POOLS.push(null, [], [], [], []);
  for (const k of Object.keys(P_JOKER_RARITY_POOLS)) if (isNaN(Number(k))) delete P_JOKER_RARITY_POOLS[k];
  for (const v of Object.values(P_TAGS)) if (isActive(v)) P_CENTER_POOLS.Tag.push(v);
  for (const v of Object.values(P_SEALS)) if (isActive(v)) P_CENTER_POOLS.Seal.push(v);
  for (const v of Object.values(P_STAKES)) if (isActive(v)) P_CENTER_POOLS.Stake.push(v);
  for (const v of Object.values(P_CENTERS)) {
    if (!isActive(v)) continue;
    if (v.set === 'Joker') P_CENTER_POOLS.Joker.push(v);
    if (v.set && v.demo && v.pos) P_CENTER_POOLS.Demo.push(v);
    if (!v.wip && !v.demo) {
      if (v.set && v.set !== 'Joker' && !v.skip_pool && !v.omit) (P_CENTER_POOLS[v.set] = P_CENTER_POOLS[v.set] || []).push(v);
      if (v.set === 'Tarot' || v.set === 'Planet') P_CENTER_POOLS.Tarot_Planet.push(v);
      if (v.consumeable) P_CENTER_POOLS.Consumeables.push(v);
      if (v.rarity && v.set === 'Joker' && !v.demo) (P_JOKER_RARITY_POOLS[v.rarity] = P_JOKER_RARITY_POOLS[v.rarity] || []).push(v);
    }
  }
  for (const k of Object.keys(P_CENTER_POOLS)) P_CENTER_POOLS[k].sort(byOrder);
  // Balatro sorts the rarity pools by insertion of pairs() — make it stable by order.
  for (const k of Object.keys(P_JOKER_RARITY_POOLS)) if (P_JOKER_RARITY_POOLS[k]) P_JOKER_RARITY_POOLS[k].sort(byOrder);
}
rebuildPools();
// Online/unlock state: everything counts as unlocked + discovered in Micatro.
for (const v of Object.values(P_CENTERS)) { v.unlocked = true; v.discovered = true; }

// --------------------------------------------------------------------- utils
export function copy_table(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(copy_table);
  const r = {};
  for (const [k, v] of Object.entries(o)) r[k] = copy_table(v);
  return r;
}
/** Lua's `next(t)` truthiness for tables/arrays. */
export function next(t) {
  if (!t) return false;
  if (Array.isArray(t)) return t.length > 0;
  return Object.keys(t).length > 0;
}
export const SUITS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];

// ------------------------------------------------------------------- RNG
// Balatro: pseudoseed(key) advances a per-key float stream mixed with the run
// seed; pseudorandom(seed) = math.randomseed(seed); math.random(). LuaJIT's
// PRNG isn't reproduced bit-for-bit — instead every seed float deterministically
// seeds a small PRNG, which keeps the per-key independence that matters.
export function pseudohash(str) {
  let num = 1;
  for (let i = str.length; i >= 1; i--) {
    num = ((1.1239285023 / num) * str.charCodeAt(i - 1) * Math.PI + Math.PI * i) % 1;
  }
  return num;
}
const fix13 = (x) => Math.abs(Number(x.toFixed(13)));
export function pseudoseed(key, predict_seed) {
  if (predict_seed) {
    let p = pseudohash(key + (predict_seed || ''));
    p = fix13((2.134453429141 + p * 1.72431234) % 1);
    return (p + (pseudohash(predict_seed) || 0)) / 2;
  }
  const pr = G.GAME.pseudorandom;
  if (pr[key] === undefined) pr[key] = pseudohash(key + (pr.seed || ''));
  pr[key] = fix13((2.134453429141 + pr[key] * 1.72431234) % 1);
  return (pr[key] + (pr.hashed_seed || 0)) / 2;
}
/** A fresh PRNG seeded from a float — the moral equivalent of math.randomseed(seed). */
export function seeded(seed) {
  let a = Math.floor((seed % 1) * 4294967296) >>> 0;
  let b = Math.floor(seed * 1000003) >>> 0 ^ 0x9e3779b9;
  let c = (a ^ 0x85ebca6b) >>> 0, d = (b ^ 0xc2b2ae35) >>> 0;
  const rnd = () => { // sfc32
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) rnd();
  return rnd;
}
/** math.random(min,max) semantics on a PRNG. */
const rint = (r, min, max) => min + Math.floor(r() * (max - min + 1));
export function pseudorandom(seed, min, max) {
  if (typeof seed === 'string') seed = pseudoseed(seed);
  const r = seeded(seed);
  if (min !== undefined && max !== undefined) return rint(r, min, max);
  return r();
}
/** Unkeyed math.random() calls in Balatro's logic, made deterministic. */
export function math_random(min, max) {
  const r = seeded(pseudoseed('__math_random'));
  if (min !== undefined && max === undefined) return rint(r, 1, min);
  if (min !== undefined) return rint(r, min, max);
  return r();
}
/**
 * pseudorandom_element(t, seed) -> [value, key]. Arrays use 1-based keys like
 * Lua; objects sort keys as strings; card lists sort by sort_id.
 */
export function pseudorandom_element(t, seed) {
  const r = seed === undefined ? seeded(pseudoseed('__elem')) : seeded(seed);
  let keys;
  if (Array.isArray(t)) keys = t.map((v, i) => ({ k: i + 1, v }));
  else keys = Object.keys(t).map((k) => ({ k, v: t[k] }));
  if (keys[0] && keys[0].v && typeof keys[0].v === 'object' && keys[0].v.sort_id !== undefined) {
    keys.sort((a, b) => a.v.sort_id - b.v.sort_id);
  } else if (!Array.isArray(t)) {
    keys.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  }
  if (!keys.length) return [undefined, undefined];
  const pick = keys[rint(r, 1, keys.length) - 1];
  return [pick.v, pick.k];
}
export function pseudoshuffle(list, seed) {
  const r = seeded(seed);
  if (list[0] && list[0].sort_id !== undefined) list.sort((a, b) => (a.sort_id ?? 1) - (b.sort_id ?? 2));
  for (let i = list.length; i >= 2; i--) {
    const j = rint(r, 1, i);
    const tmp = list[i - 1]; list[i - 1] = list[j - 1]; list[j - 1] = tmp;
  }
}
export function random_string(length, seed) {
  const r = seeded(seed);
  let ret = '';
  for (let i = 0; i < length; i++) {
    const c = r() > 0.7 ? rint(r, 49, 57) : (r() > 0.45 ? rint(r, 65, 78) : rint(r, 80, 90));
    ret += String.fromCharCode(c);
  }
  return ret.toUpperCase();
}

// ------------------------------------------------------------ event manager
/** Synchronous stand-in for Balatro's G.E_MANAGER. */
export const E_MANAGER = {
  queue: [],
  add_event(fn, front) { if (front) this.queue.unshift(fn); else this.queue.push(fn); },
  flush() {
    let guard = 0;
    while (this.queue.length) {
      if (++guard > 100000) throw new Error('micatro: event queue runaway');
      const fn = this.queue.shift();
      fn();
    }
  },
};

/** UI event log. The renderer drains it; spectators receive it in snapshots. */
export function emit(type, data = {}) {
  if (!G.ui_events) return;
  G.ui_events.push({ type, seq: ++G.ui_seq, ...data });
}
const cid = (card) => (card && card.sort_id !== undefined ? card.sort_id : undefined);
/** card_eval_status_text(card, eval_type, amt, percent, dir, extra) */
export function card_eval_status_text(card, eval_type, amt, percent, dir, extra) {
  const e = { card: cid(card), area: card && card.area && card.area.name, eval_type, amt };
  if (extra) {
    e.message = extra.message;
    for (const k of ['mult_mod', 'chip_mod', 'Xmult_mod', 'x_mult_mod', 'edition', 'dollars', 'colour'])
      if (extra[k] !== undefined && typeof extra[k] !== 'object') e[k] = extra[k];
    if (extra.card && extra.card !== card) e.source = cid(extra.card);
  }
  emit('status', e);
  // Lua: card_eval_status_text ends with playing_card_joker_effects(extra.playing_cards_created) (DNA -> Hologram).
  if (extra && extra.playing_cards_created) for (const j of G.jokers.cards) j.calculate_joker({ playing_card_added: true, cards: extra.playing_cards_created });
}
export function juice_card(card) { emit('juice', { card: cid(card) }); }
export function play_sound(sound, per, vol) { emit('sound', { sound, per, vol }); }
export function attention_text(text) { emit('attention', { text }); }

export function localize(key, set) {
  const m = LOC.misc;
  // Mods' localization (MOD_LOC) is the fallback for keys the base game doesn't have.
  const mm = MOD_LOC.misc;
  if (set === 'poker_hands') return (m.poker_hands && m.poker_hands[key]) || (mm.poker_hands && mm.poker_hands[key]) || key;
  if (typeof key === 'string') return (m.dictionary && m.dictionary[key]) || (mm.dictionary && mm.dictionary[key]) || key;
  if (key && key.type === 'variable') {
    let s = (m.v_dictionary && m.v_dictionary[key.key]) || (mm.v_dictionary && mm.v_dictionary[key.key]) || key.key;
    (key.vars || []).forEach((v, i) => { s = s.replace('#' + (i + 1) + '#', v); });
    return s;
  }
  if (key && key.type === 'name_text') {
    const d = (LOC.descriptions[key.set] && LOC.descriptions[key.set][key.key]) ||
      (MOD_LOC.descriptions[key.set] && MOD_LOC.descriptions[key.set][key.key]);
    return (d && d.name) || key.key;
  }
  return String(key);
}

// ----------------------------------------------------------------- CardArea
export class CardArea {
  constructor(name, config) {
    this.name = name;
    this.cards = [];
    this.highlighted = [];
    this.config = Object.assign({ card_limit: 52, type: 'hand', highlighted_limit: 5 }, config || {});
  }
  emplace(card, location, stay_flipped) {
    if (location === 'front' || this.config.type === 'deck') this.cards.unshift(card);
    // Pokermon's lovely patch (cardarea.lua): a numeric location inserts at that 1-based slot.
    else if (typeof location === 'number') this.cards.splice(Math.max(0, location - 1), 0, card);
    else this.cards.push(card);
    if (card.facing === 'back' && this.config.type !== 'discard' && this.config.type !== 'deck' && !stay_flipped) card.flip();
    // Lua's CardArea:align_cards turns every deck/discard card face down each
    // frame; without it a stay_flipped draw (The House/Wheel/Mark/Fish) would
    // land face up. Silent: it is the resting state of those piles.
    if ((this.config.type === 'deck' || this.config.type === 'discard') && card.facing === 'front') card.facing = 'back';
    if (this === G.hand && stay_flipped) card.ability.wheel_flipped = true;
    if (this.cards.length > this.config.card_limit && this === G.deck) this.config.card_limit = this.cards.length;
    card.area = this;
    this.set_ranks();
    if (this === G.jokers) {
      let tally = 0;
      for (const c of G.jokers.cards) if (c.ability.set === 'Joker') tally++;
      if (tally > G.GAME.max_jokers) G.GAME.max_jokers = tally;
    }
    emit('move', { card: card.sort_id, to: this.name, front: location === 'front' || undefined });
  }
  remove_card(card, discarded_only) {
    let _cards = this.cards;
    if (discarded_only) _cards = this.cards.filter((v) => v.ability && v.ability.discarded);
    if (this.config.type === 'discard' || this.config.type === 'deck') card = card || _cards[_cards.length - 1];
    else card = card || _cards[0];
    for (let i = this.cards.length - 1; i >= 0; i--) {
      if (this.cards[i] === card) {
        card.area = null;
        this.cards.splice(i, 1);
        this.remove_from_highlighted(card, true);
        break;
      }
    }
    this.set_ranks();
    return card;
  }
  change_size(delta) {
    if (delta === 0) return;
    G.E_MANAGER.add_event(() => {
      this.config.real_card_limit = (this.config.real_card_limit ?? this.config.card_limit) + delta;
      this.config.card_limit = Math.max(0, this.config.real_card_limit);
      if (delta > 0 && this.config.real_card_limit > 1 && this === G.hand && this.cards[0] &&
          (G.STATE === G.STATES.DRAW_TO_HAND || G.STATE === G.STATES.SELECTING_HAND)) {
        for (let i = 0; i < Math.abs(delta); i++) {
          draw_card(G.deck, G.hand);
          G.E_MANAGER.add_event(() => this.sort());
        }
      }
    });
  }
  add_to_highlighted(card) {
    // A card can only be selected once (Cerulean Bell's forced card survives unhighlight_all).
    if (this.highlighted.includes(card)) return;
    if (this.config.type === 'shop') {
      if (this.highlighted[0]) this.remove_from_highlighted(this.highlighted[0]);
      this.highlighted.push(card); card.highlighted = true;
    } else if (this.config.type === 'joker' || this.config.type === 'consumeable') {
      if (this.highlighted.length >= this.config.highlighted_limit) this.remove_from_highlighted(this.highlighted[0]);
      this.highlighted.push(card); card.highlighted = true;
    } else {
      if (this.highlighted.length >= this.config.highlighted_limit) card.highlighted = false;
      else { this.highlighted.push(card); card.highlighted = true; }
    }
  }
  remove_from_highlighted(card, force) {
    if (!force && card && card.ability.forced_selection && this === G.hand) return;
    const i = this.highlighted.indexOf(card);
    if (i >= 0) this.highlighted.splice(i, 1);
    if (card) card.highlighted = false;
  }
  unhighlight_all() {
    for (let i = this.highlighted.length - 1; i >= 0; i--) {
      const c = this.highlighted[i];
      if (c.ability.forced_selection && this === G.hand) continue;
      c.highlighted = false;
      this.highlighted.splice(i, 1);
    }
  }
  set_ranks() { this.cards.forEach((c, i) => { c.rank = i + 1; }); }
  shuffle(seed) { pseudoshuffle(this.cards, pseudoseed(seed || 'shuffle')); this.set_ranks(); emit('shuffle', { area: this.name }); }
  sort(method) {
    this.config.sort = method || this.config.sort;
    const s = this.config.sort;
    if (s === 'desc') this.cards.sort((a, b) => b.get_nominal() - a.get_nominal());
    else if (s === 'asc') this.cards.sort((a, b) => a.get_nominal() - b.get_nominal());
    else if (s === 'suit desc') this.cards.sort((a, b) => b.get_nominal('suit') - a.get_nominal('suit'));
    else if (s === 'suit asc') this.cards.sort((a, b) => a.get_nominal('suit') - b.get_nominal('suit'));
    else if (s === 'order') this.cards.sort((a, b) => (a.config.card.order || a.config.center.order) - (b.config.card.order || b.config.center.order));
    this.set_ranks();
  }
  draw_card_from(area, stay_flipped, discarded_only) {
    if (this.cards.length < this.config.card_limit || this === G.deck || this === G.hand) {
      const card = area.remove_card(undefined, discarded_only);
      if (card) {
        let sf = G.GAME && G.GAME.blind && G.GAME.blind.stay_flipped(this, card);
        if (this === G.hand && G.GAME.modifiers.flipped_cards) {
          if (pseudorandom(pseudoseed('flipped_card')) < 1 / G.GAME.modifiers.flipped_cards) sf = true;
        }
        this.emplace(card, undefined, sf);
        if (this === G.hand && area === G.deck && G.drawn_cards) G.drawn_cards.push(card); // SMODS.drawn_cards
        return true;
      }
    }
  }
}

// --------------------------------------------------------------------- Card
const RANK_TABLE = {
  '2': [2, 0, 2], '3': [3, 0, 3], '4': [4, 0, 4], '5': [5, 0, 5], '6': [6, 0, 6], '7': [7, 0, 7], '8': [8, 0, 8],
  '9': [9, 0, 9], '10': [10, 0, 10], Jack: [10, 0.1, 11], Queen: [10, 0.2, 12], King: [10, 0.3, 13], Ace: [11, 0.4, 14],
};
const SUIT_NOM = { Diamonds: [0.01, 0.001], Clubs: [0.02, 0.002], Hearts: [0.03, 0.003], Spades: [0.04, 0.004] };

export class Card {
  /** Card(front, center, params) — positions/sizes from the Lua signature are dropped. */
  constructor(card, center, params) {
    this.params = (params && typeof params === 'object') ? params : {};
    this.config = { card: card || {}, center };
    this.playing_card = this.params.playing_card;
    G.sort_id = (G.sort_id || 0) + 1;
    this.sort_id = G.sort_id;
    this.base_cost = 0; this.extra_cost = 0; this.cost = 0; this.sell_cost = 0;
    this.unique_val = 1 - this.sort_id / 1603301;
    this.edition = null;
    this.set_ability(center, true);
    this.set_base(card, true);
    this.facing = 'front';
    this.area = null;
    this.highlighted = false;
    this.debuff = false;
    this.rank = null;
    this.added_to_deck = null;
    this.set_cost();
  }
  get center_key() { return this.config.center.key; }

  set_base(card, initial) {
    card = card || {};
    this.config.card = card;
    this.config.card_key = card.key;
    const orig = this.base && this.base.suit_nominal_original;
    const times_played = this.base ? this.base.times_played : 0;
    this.base = { name: card.name, suit: card.suit, value: card.value, nominal: 0, suit_nominal: 0, face_nominal: 0, times_played: initial ? 0 : times_played };
    const r = RANK_TABLE[this.base.value];
    if (r) { this.base.nominal = r[0]; this.base.face_nominal = r[1]; this.base.id = r[2]; }
    if (initial) this.base.original_value = this.base.value;
    else this.base.original_value = this.base.original_value ?? card.value;
    const s = SUIT_NOM[this.base.suit];
    if (s) { this.base.suit_nominal = s[0]; this.base.suit_nominal_original = orig || s[1]; }
    if (!initial && G.GAME.blind) G.GAME.blind.debuff_card(this);
    if (!initial) emit('card_changed', { card: this.sort_id });
  }

  set_ability(center, initial, delay_sprites) {
    const old_center = this.config.center;
    // Steamodded (lovely/fixes.toml): with mods installed a card already in the deck takes
    // its old center's remove_from_deck / new center's add_to_deck effects across the swap,
    // and keeps every ability field the new center doesn't reset (e.g. Pokermon's Tera
    // sticker flags and money fractions survive an evolution). Vanilla runs: unchanged.
    const smods = ACTIVE_MODS.length > 0;
    let was_added_to_deck = false;
    if (smods && this.added_to_deck && old_center && !this.debuff) {
      this.remove_from_deck();
      was_added_to_deck = true;
    }
    this.config.center = center;
    this.config.center_key = center.key;
    if (this.ability && old_center && old_center.config.bonus) this.ability.bonus = this.ability.bonus - old_center.config.bonus;
    const prev = this.ability;
    const c = center.config || {};
    this.ability = {
      name: center.name, effect: center.effect, set: center.set,
      mult: c.mult || 0, h_mult: c.h_mult || 0, h_x_mult: c.h_x_mult || 0, h_dollars: c.h_dollars || 0,
      p_dollars: c.p_dollars || 0, t_mult: c.t_mult || 0, t_chips: c.t_chips || 0, x_mult: c.Xmult || 1,
      h_size: c.h_size || 0, d_size: c.d_size || 0,
      extra: c.extra !== undefined ? copy_table(c.extra) : undefined,
      extra_value: 0, type: c.type || '', order: center.order,
      forced_selection: prev ? prev.forced_selection : undefined,
      perma_bonus: prev ? prev.perma_bonus || 0 : 0,
    };
    this.ability.bonus = ((prev && prev.bonus) || 0) + (c.bonus || 0);
    if (center.consumeable) this.ability.consumeable = c;
    if (smods && prev) {
      // SMODS: old fields persist unless the new ability sets them; reset keys always take the new value.
      const fresh = this.ability;
      this.ability = prev;
      const extra_value = prev.extra_value || 0;
      for (const [k, v] of Object.entries(fresh)) if (v !== undefined) this.ability[k] = v; // Lua pairs() skips nils
      this.ability.extra_value = extra_value;
      for (const k of ['name', 'effect', 'set', 'extra', 'played_this_ante', 'perma_debuff']) this.ability[k] = fresh[k];
      if (!center.consumeable) delete this.ability.consumeable;
    }
    // SMODS center.toml: a mod center's whole config is copied onto the ability.
    if (center.mod) for (const [k, v] of Object.entries(c)) if (k !== 'bonus' && k !== 'extra') this.ability[k] = copy_table(v);
    if (this.ability.name === 'Invisible Joker') this.ability.invis_rounds = 0;
    if (this.ability.name === 'To Do List') {
      const ph = Object.keys(G.GAME.hands).filter((k) => G.GAME.hands[k].visible);
      const old = this.ability.to_do_poker_hand;
      this.ability.to_do_poker_hand = undefined;
      let guard = 0;
      while (!this.ability.to_do_poker_hand && guard++ < 100) {
        this.ability.to_do_poker_hand = pseudorandom_element(ph, pseudoseed('to_do'))[0];
        if (this.ability.to_do_poker_hand === old) this.ability.to_do_poker_hand = undefined;
      }
    }
    if (this.ability.name === 'Caino') this.ability.caino_xmult = 1;
    if (this.ability.name === 'Yorick') this.ability.yorick_discards = this.ability.extra.discards;
    if (this.ability.name === 'Loyalty Card') { this.ability.burnt_hand = 0; this.ability.loyalty_remaining = this.ability.extra.every; }
    this.base_cost = center.cost || 1;
    this.ability.hands_played_at_create = (G.GAME && G.GAME.hands_played) || 0;
    if (G.GAME && G.GAME.used_jokers) {
      for (const [k, v] of Object.entries(P_CENTERS)) if (v.name === this.ability.name) G.GAME.used_jokers[k] = true;
    }
    if (center.set_ability) center.set_ability(center, this, initial, delay_sprites);
    if (was_added_to_deck && !this.debuff) this.add_to_deck();
    if (!initial && G.GAME.blind) G.GAME.blind.debuff_card(this);
    if (!initial) emit('card_changed', { card: this.sort_id });
  }

  set_cost() {
    this.extra_cost = 0 + G.GAME.inflation;
    if (this.edition) {
      this.extra_cost += (this.edition.holo ? 3 : 0) + (this.edition.foil ? 2 : 0) + (this.edition.polychrome ? 5 : 0) + (this.edition.negative ? 5 : 0);
      if (this.edition.key && P_CENTERS[this.edition.key] && P_CENTERS[this.edition.key].mod) this.extra_cost += P_CENTERS[this.edition.key].extra_cost || 0;
    }
    this.cost = Math.max(1, Math.floor((this.base_cost + this.extra_cost + 0.5) * (100 - G.GAME.discount_percent) / 100));
    if (this.ability.set === 'Booster' && G.GAME.modifiers.booster_ante_scaling) this.cost += G.GAME.round_resets.ante - 1;
    if ((this.ability.set === 'Planet' || (this.ability.set === 'Booster' && this.ability.name.includes('Celestial'))) && find_joker('Astronomer').length > 0) this.cost = 0;
    if (this.ability.rental) this.cost = 1;
    this.sell_cost = Math.max(1, Math.floor(this.cost / 2)) + (this.ability.extra_value || 0);
    if (this.area && this.ability.couponed && (this.area === G.shop_jokers || this.area === G.shop_booster)) this.cost = 0;
    callHook('set_cost', this);
  }

  set_edition(edition, immediate, silent) {
    // Mod editions (Steamodded SMODS.Edition): `edition` may also be a key string
    // ('e_poke_shiny') or {poke_shiny: true}. Mods may refuse an edition (set_edition hook);
    // the old mod edition's on_remove / the new one's on_apply run like SMODS's set_edition.
    const ek = edition_key_of(edition);
    if (ek && callHook('set_edition', this, ek).includes(false)) return;
    const old = this.edition;
    if (old && old.key && P_CENTERS[old.key] && P_CENTERS[old.key].mod && P_CENTERS[old.key].on_remove) P_CENTERS[old.key].on_remove(this);
    this.edition = null;
    if (!edition || !ek || ek === 'e_base') { this.set_cost(); if (old) emit('card_changed', { card: this.sort_id }); return; }
    const E = P_CENTERS;
    const pe = E[ek];
    if (pe && pe.mod && pe.set === 'Edition') {
      const type = ek.slice(2);
      this.edition = { [type]: true, type, key: ek };
      for (const [k, v] of Object.entries(pe.config || {})) this.edition[k] = copy_table(v);
      if (pe.on_apply) pe.on_apply(this);
      if (!silent) { emit('edition', { card: this.sort_id, edition: type }); if (pe.sound) play_sound(pe.sound.sound || pe.sound, pe.sound.per, pe.sound.vol); }
      else emit('card_changed', { card: this.sort_id });
      this.set_cost();
      return;
    }
    if (edition.holo) this.edition = { mult: E.e_holo.config.extra, holo: true, type: 'holo' };
    else if (edition.foil) this.edition = { chips: E.e_foil.config.extra, foil: true, type: 'foil' };
    else if (edition.polychrome) this.edition = { x_mult: E.e_polychrome.config.extra, polychrome: true, type: 'polychrome' };
    else if (edition.negative) {
      this.edition = { negative: true, type: 'negative' };
      if (this.added_to_deck) {
        if (this.ability.consumeable) G.consumeables.config.card_limit += 1;
        else G.jokers.config.card_limit += 1;
      }
    }
    if (this.edition && !silent) { emit('edition', { card: this.sort_id, edition: this.edition.type }); play_sound(this.edition.type === 'holo' ? 'holo1' : this.edition.type === 'foil' ? 'foil1' : this.edition.type === 'polychrome' ? 'polychrome1' : 'negative'); }
    else emit('card_changed', { card: this.sort_id });
    this.set_cost();
  }

  set_seal(_seal, silent) {
    this.seal = _seal || null;
    if (_seal && !silent) { emit('seal', { card: this.sort_id, seal: _seal }); play_sound('gold_seal'); }
    else emit('card_changed', { card: this.sort_id });
    this.set_cost();
  }
  get_seal(bypass_debuff) { if (this.debuff && !bypass_debuff) return undefined; return this.seal; }
  set_eternal(e) { this.ability.eternal = undefined; if (this.config.center.eternal_compat && !this.ability.perishable) this.ability.eternal = e; }
  set_perishable() {
    this.ability.perishable = undefined;
    if (this.config.center.perishable_compat && !this.ability.eternal) { this.ability.perishable = true; this.ability.perish_tally = G.GAME.perishable_rounds; }
  }
  set_rental(r) {
    // Pokermon (lovely: Zorua): centers with rental_compat === false never become Rental.
    if (this.config.center.rental_compat === false) return;
    this.ability.rental = r; this.set_cost();
  }
  set_debuff(should_debuff) {
    // Steamodded mod.set_debuff (runs first): true debuffs, 'prevent_debuff' wins outright.
    for (const res of callHook('set_debuff', this, should_debuff)) {
      if (res === 'prevent_debuff') {
        if (this.debuff) { this.debuff = false; if (this.area === G.jokers) this.add_to_deck(true); emit('card_changed', { card: this.sort_id }); }
        return;
      }
      if (res === true) should_debuff = true;
    }
    if (this.ability.perishable && this.ability.perish_tally <= 0) {
      if (!this.debuff) { this.debuff = true; if (this.area === G.jokers) this.remove_from_deck(true); emit('card_changed', { card: this.sort_id }); }
      return;
    }
    should_debuff = !!should_debuff;
    if (should_debuff !== !!this.debuff) {
      if (this.area === G.jokers) { if (should_debuff) this.remove_from_deck(true); else this.add_to_deck(true); }
      this.debuff = should_debuff;
      emit('card_changed', { card: this.sort_id });
    }
  }
  flip() { this.facing = this.facing === 'front' ? 'back' : 'front'; emit('flip', { card: this.sort_id, facing: this.facing }); }

  change_suit(new_suit) {
    const code = { Diamonds: 'D_', Spades: 'S_', Clubs: 'C_', Hearts: 'H_' }[new_suit];
    const v = this.base.value;
    const val = v === 'Ace' ? 'A' : v === 'King' ? 'K' : v === 'Queen' ? 'Q' : v === 'Jack' ? 'J' : v === '10' ? 'T' : v;
    this.set_base(P_CARDS[code + val]);
    G.GAME.blind.debuff_card(this);
  }

  add_to_deck(from_debuff) {
    if (this.added_to_deck) return;
    this.added_to_deck = true;
    callHook('add_to_deck', this, from_debuff);
    if (this.ability.set === 'Enhanced' || this.ability.set === 'Default') return;
    // Steamodded center API: a mod center's own add_to_deck runs before the vanilla effects.
    if (this.config.center.mod && this.config.center.add_to_deck) this.config.center.add_to_deck(this.config.center, this, from_debuff);
    const n = this.ability.name;
    if (this.ability.h_size !== 0) G.hand.change_size(this.ability.h_size);
    if (this.ability.d_size > 0) { G.GAME.round_resets.discards += this.ability.d_size; ease_discard(this.ability.d_size); }
    if (n === 'Credit Card') G.GAME.bankrupt_at -= this.ability.extra;
    if (n === 'Chicot' && G.GAME.blind && G.GAME.blind.boss && !G.GAME.blind.disabled) {
      G.GAME.blind.disable();
      card_eval_status_text(this, 'extra', null, null, null, { message: localize('ph_boss_disabled') });
    }
    if (n === 'Chaos the Clown') { G.GAME.current_round.free_rerolls += 1; calculate_reroll_cost(true); }
    if (n === 'Turtle Bean') G.hand.change_size(this.ability.extra.h_size);
    if (n === 'Oops! All 6s') for (const k of Object.keys(G.GAME.probabilities)) G.GAME.probabilities[k] *= 2;
    if (n === 'To the Moon') G.GAME.interest_amount += this.ability.extra;
    if (n === 'Astronomer') G.E_MANAGER.add_event(() => all_cards().forEach((c) => c.set_cost()));
    if (n === 'Troubadour') { G.hand.change_size(this.ability.extra.h_size); G.GAME.round_resets.hands += this.ability.extra.h_plays; }
    if (n === 'Stuntman') G.hand.change_size(-this.ability.extra.h_size);
    if (this.edition && this.edition.negative) {
      if (from_debuff) this.ability.queue_negative_removal = undefined;
      else if (this.ability.consumeable) G.consumeables.config.card_limit += 1;
      else G.jokers.config.card_limit += 1;
    }
    if (G.GAME.blind) G.E_MANAGER.add_event(() => G.GAME.blind.set_blind(null, true, null));
  }
  remove_from_deck(from_debuff) {
    if (!this.added_to_deck) return;
    this.added_to_deck = false;
    if (this.config.center.mod && this.config.center.remove_from_deck) this.config.center.remove_from_deck(this.config.center, this, from_debuff);
    const n = this.ability.name;
    if (this.ability.h_size !== 0) G.hand.change_size(-this.ability.h_size);
    if (this.ability.d_size > 0) { G.GAME.round_resets.discards -= this.ability.d_size; ease_discard(-this.ability.d_size); }
    if (n === 'Credit Card') G.GAME.bankrupt_at += this.ability.extra;
    if (n === 'Chaos the Clown') { G.GAME.current_round.free_rerolls -= 1; calculate_reroll_cost(true); }
    if (n === 'Turtle Bean') G.hand.change_size(-this.ability.extra.h_size);
    if (n === 'Oops! All 6s') for (const k of Object.keys(G.GAME.probabilities)) G.GAME.probabilities[k] /= 2;
    if (n === 'To the Moon') G.GAME.interest_amount -= this.ability.extra;
    if (n === 'Astronomer') G.E_MANAGER.add_event(() => all_cards().forEach((c) => c.set_cost()));
    if (n === 'Troubadour') { G.hand.change_size(-this.ability.extra.h_size); G.GAME.round_resets.hands -= this.ability.extra.h_plays; }
    if (n === 'Stuntman') G.hand.change_size(this.ability.extra.h_size);
    if (this.edition && this.edition.negative && G.jokers) {
      if (from_debuff) this.ability.queue_negative_removal = true;
      else if (this.ability.consumeable) G.consumeables.config.card_limit -= 1;
      else G.jokers.config.card_limit -= 1;
    }
    if (G.GAME.blind) G.E_MANAGER.add_event(() => G.GAME.blind.set_blind(null, true, null));
  }

  get_nominal(mod) {
    let mult = 1;
    if (mod === 'suit') mult = 1000;
    if (this.ability.effect === 'Stone Card') mult = -1000;
    return this.base.nominal + this.base.suit_nominal * mult + (this.base.suit_nominal_original || 0) * 0.0001 * mult + this.base.face_nominal + 0.000001 * this.unique_val;
  }
  get_id() {
    if (this.ability.effect === 'Stone Card' && !this.vampired) return -(100 + this.sort_id * 7919); // never matches a rank
    return this.base.id;
  }
  is_face(from_boss) {
    if (this.debuff && !from_boss) return false;
    const id = this.get_id();
    const base = id === 11 || id === 12 || id === 13 || find_joker('Pareidolia').length > 0;
    const o = firstHook('is_face', this, base);
    return o === undefined ? base : !!o;
  }
  get_original_rank() { return this.base.original_value; }
  get_chip_bonus() {
    if (this.debuff) return 0;
    if (this.ability.effect === 'Stone Card') return this.ability.bonus + (this.ability.perma_bonus || 0);
    // Pokermon (lovely: Misdreavus): ability.nominal_drain lowers the rank's chips (never below 1).
    if (this.ability.nominal_drain) {
      this.ability.nominal_drain = Math.min(this.ability.nominal_drain, this.base.nominal - 1);
      this.ability.perma_bonus = Math.max(this.ability.perma_bonus || 0, -this.ability.bonus);
      return this.base.nominal - this.ability.nominal_drain + this.ability.bonus + this.ability.perma_bonus;
    }
    return this.base.nominal + this.ability.bonus + (this.ability.perma_bonus || 0);
  }
  get_chip_mult() {
    if (this.debuff) return 0;
    if (this.ability.set === 'Joker') return 0;
    if (this.ability.effect === 'Lucky Card') {
      if (pseudorandom('lucky_mult') < G.GAME.probabilities.normal / 5) { this.lucky_trigger = true; return this.ability.mult; }
      return 0;
    }
    return this.ability.mult;
  }
  get_chip_x_mult() {
    if (this.debuff) return 0;
    if (this.ability.set === 'Joker') return 0;
    if (this.ability.x_mult <= 1) return 0;
    return this.ability.x_mult;
  }
  get_chip_h_mult() { return this.debuff ? 0 : this.ability.h_mult; }
  get_chip_h_x_mult() { return this.debuff ? 0 : this.ability.h_x_mult; }
  get_edition() {
    if (this.debuff) return undefined;
    // A mod edition with no scoring numbers (e.g. Pokermon's Shiny) scores nothing.
    if (this.edition && this.edition.key && P_CENTERS[this.edition.key] && P_CENTERS[this.edition.key].mod &&
        !this.edition.chips && !this.edition.mult && !this.edition.x_mult) return undefined;
    if (this.edition) {
      const ret = { card: this };
      if (this.edition.x_mult) ret.x_mult_mod = this.edition.x_mult;
      if (this.edition.mult) ret.mult_mod = this.edition.mult;
      if (this.edition.chips) ret.chip_mod = this.edition.chips;
      return ret;
    }
  }
  get_end_of_round_effect() {
    if (this.debuff) return {};
    const ret = {};
    if (this.ability.h_dollars > 0) { ret.h_dollars = this.ability.h_dollars; ret.card = this; }
    if (this.seal === 'Blue' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      G.GAME.consumeable_buffer += 1;
      G.E_MANAGER.add_event(() => {
        if (G.GAME.last_hand_played) {
          let _planet = 0;
          for (const v of P_CENTER_POOLS.Planet) if (v.config.hand_type === G.GAME.last_hand_played) _planet = v.key;
          const card = create_card('Planet', G.consumeables, null, null, null, null, _planet, 'blusl');
          card.add_to_deck();
          G.consumeables.emplace(card);
          G.GAME.consumeable_buffer = 0;
        }
      });
      card_eval_status_text(this, 'extra', null, null, null, { message: localize('k_plus_planet') });
      ret.effect = true;
    }
    return ret;
  }
  get_p_dollars() {
    if (this.debuff) return 0;
    let ret = 0;
    if (this.seal === 'Gold') ret += 3;
    if (this.ability.p_dollars > 0) {
      if (this.ability.effect === 'Lucky Card') {
        if (pseudorandom('lucky_money') < G.GAME.probabilities.normal / 15) { this.lucky_trigger = true; ret += this.ability.p_dollars; }
      } else ret += this.ability.p_dollars;
    }
    if (ret > 0) {
      G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ret;
      G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
    }
    return ret;
  }
  calculate_seal(context) {
    if (this.debuff) return undefined;
    if (context.repetition && this.seal === 'Red') return { message: localize('k_again_ex'), repetitions: 1, card: this };
    if (context.discard && this.seal === 'Purple' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      G.GAME.consumeable_buffer += 1;
      G.E_MANAGER.add_event(() => {
        const card = create_card('Tarot', G.consumeables, null, null, null, null, null, '8ba');
        card.add_to_deck();
        G.consumeables.emplace(card);
        G.GAME.consumeable_buffer = 0;
      });
      card_eval_status_text(this, 'extra', null, null, null, { message: localize('k_plus_tarot') });
    }
  }
  calculate_rental() {
    if (this.ability.rental) { ease_dollars(-G.GAME.rental_rate); card_eval_status_text(this, 'dollars', -G.GAME.rental_rate); }
  }
  calculate_perishable() {
    if (this.ability.perishable && this.ability.perish_tally > 0) {
      if (this.ability.perish_tally === 1) { this.ability.perish_tally = 0; this.set_debuff(); }
      else this.ability.perish_tally -= 1;
    }
  }
  is_suit(suit, bypass_debuff, flush_calc) {
    if (flush_calc) {
      if (this.ability.effect === 'Stone Card') return false;
      if (this.ability.name === 'Wild Card' && !this.debuff) return true;
      if (find_joker('Smeared Joker').length && (this.base.suit === 'Hearts' || this.base.suit === 'Diamonds') === (suit === 'Hearts' || suit === 'Diamonds')) return true;
      return this.base.suit === suit;
    }
    if (this.debuff && !bypass_debuff) return false;
    if (this.ability.effect === 'Stone Card') return false;
    if (this.ability.name === 'Wild Card') return true;
    if (find_joker('Smeared Joker').length && (this.base.suit === 'Hearts' || this.base.suit === 'Diamonds') === (suit === 'Hearts' || suit === 'Diamonds')) return true;
    return this.base.suit === suit;
  }
  can_sell_card() {
    if ((G.play && G.play.cards.length > 0) || (G.GAME.STOP_USE && G.GAME.STOP_USE > 0)) return false;
    return !!(this.area && this.area.config.type === 'joker' && !this.ability.eternal) ||
      !!(this.area && this.area.config.type === 'consumeable');
  }
  /** Card:sell_card — synchronous; sell price paid via the queue like Lua. */
  sell_card() {
    this.calculate_joker({ selling_self: true });
    G.E_MANAGER.add_event(() => {
      play_sound('coin2');
      ease_dollars(this.sell_cost);
      emit('dissolve', { card: this.sort_id, reason: 'sold' });
      this.remove();
      if (this.ability.set === 'Joker' && G.GAME.blind && G.GAME.blind.name === 'Verdant Leaf') {
        G.E_MANAGER.add_event(() => G.GAME.blind.disable());
      }
    });
  }
  calculate_dollar_bonus() {
    if (this.debuff) return undefined;
    if (this.config.center.mod) return this.config.center.calc_dollar_bonus ? this.config.center.calc_dollar_bonus(this.config.center, this) : undefined;
    if (this.ability.set === 'Joker') {
      const n = this.ability.name;
      if (n === 'Golden Joker') return this.ability.extra;
      if (n === 'Cloud 9' && this.ability.nine_tally && this.ability.nine_tally > 0) return this.ability.extra * this.ability.nine_tally;
      if (n === 'Rocket') return this.ability.extra.dollars;
      if (n === 'Satellite') {
        let used = 0;
        for (const v of Object.values(G.GAME.consumeable_usage)) if (v.set === 'Planet') used++;
        if (used === 0) return undefined;
        return this.ability.extra * used;
      }
      if (n === 'Delayed Gratification' && G.GAME.current_round.discards_used === 0 && G.GAME.current_round.discards_left > 0) {
        return G.GAME.current_round.discards_left * this.ability.extra;
      }
    }
  }
  start_dissolve() { emit('dissolve', { card: this.sort_id }); this.remove(); }
  shatter() { emit('shatter', { card: this.sort_id }); play_sound('glass1'); this.remove(); }
  juice_up() { juice_card(this); }
  /** Card:remove — take the card out of its area, the deck list, and the joker slots. */
  remove() {
    if (!this.removed) callHook('card_removed', this);
    this.removed = true;
    if (this.area) this.area.remove_card(this);
    this.remove_from_deck();
    if (this.ability.queue_negative_removal) {
      if (this.ability.consumeable) G.consumeables.config.card_limit -= 1;
      else G.jokers.config.card_limit -= 1;
    }
    // Free the center for future pools (rerolled shop jokers can come back).
    if (G.GAME && G.GAME.used_jokers && !find_joker(this.ability.name, true).length) {
      for (const [k, v] of Object.entries(P_CENTERS)) if (v.name === this.ability.name) delete G.GAME.used_jokers[k];
    }
    if (G.playing_cards) {
      const i = G.playing_cards.indexOf(this);
      if (i >= 0) G.playing_cards.splice(i, 1);
      G.playing_cards.forEach((v, k) => { v.playing_card = k + 1; });
    }
  }
  // Filled in by sibling modules:
  //   calculate_joker(context)        -> jokers.js
  //   use_consumeable / can_use_consumeable / open / redeem / apply_to_run -> consumables.js
}

// ------------------------------------------------------------ common_events
export function all_cards() {
  const out = [];
  for (const a of G.areas || []) for (const c of a.cards) out.push(c);
  return out;
}
/** find_joker(name, non_debuff) — jokers AND consumables with this ability name. */
export function find_joker(name, non_debuff) {
  const found = [];
  if (G.jokers && G.jokers.cards) for (const v of G.jokers.cards) if (v.ability.name === name && (non_debuff || !v.debuff)) found.push(v);
  if (G.consumeables && G.consumeables.cards) for (const v of G.consumeables.cards) if (v.ability.name === name && (non_debuff || !v.debuff)) found.push(v);
  // Mods: cards that count as `name` (e.g. a joker that acts as Four Fingers).
  for (const extra of callHook('find_joker_alias', name, non_debuff)) for (const c of extra) if (!found.includes(c)) found.push(c);
  return found;
}
export function ease_dollars(mod, instant) {
  const _mod = () => {
    mod = mod || 0;
    G.GAME.dollars += mod;
    if (mod > 0) G.GAME.stats.dollars_earned = (G.GAME.stats.dollars_earned || 0) + mod;
    emit('dollars', { mod, total: G.GAME.dollars });
    play_sound(mod < 0 ? 'coin2' : 'coin1');
  };
  if (instant) _mod(); else G.E_MANAGER.add_event(_mod);
}
export function ease_discard(mod, instant) {
  const _mod = () => {
    if (Math.abs(Math.max(G.GAME.current_round.discards_left, mod)) === 0) return;
    mod = Math.max(-G.GAME.current_round.discards_left, mod || 0);
    G.GAME.current_round.discards_left += mod;
    emit('discards', { mod, total: G.GAME.current_round.discards_left });
  };
  if (instant) _mod(); else G.E_MANAGER.add_event(_mod);
}
export function ease_hands_played(mod, instant) {
  const _mod = () => {
    G.GAME.current_round.hands_left += mod || 0;
    emit('hands', { mod, total: G.GAME.current_round.hands_left });
  };
  if (instant) _mod(); else G.E_MANAGER.add_event(_mod);
}
export function ease_ante(mod) {
  G.E_MANAGER.add_event(() => {
    G.GAME.round_resets.ante += mod || 0;
    G.GAME.stats.furthest_ante = Math.max(G.GAME.stats.furthest_ante || 0, G.GAME.round_resets.ante);
    emit('ante', { mod, total: G.GAME.round_resets.ante });
  });
}
export function ease_round(mod) {
  G.E_MANAGER.add_event(() => {
    G.GAME.round += mod || 0;
    emit('round', { mod, total: G.GAME.round });
  });
}
export function ease_chips(mod) {
  G.E_MANAGER.add_event(() => { G.GAME.chips = mod || 0; emit('chips', { total: G.GAME.chips }); });
}
export function delay() { /* visual only */ }
export function update_hand_text(config, vals) { emit('hand_text', { ...vals }); }

export function add_joker(joker, edition, silent, eternal) {
  const _area = P_CENTERS[joker].consumeable ? G.consumeables : G.jokers;
  const card = new Card(P_CARDS.empty, P_CENTERS[joker], { discover: true });
  if (_area) card.add_to_deck();
  if (edition) card.set_edition({ [edition]: true });
  if (eternal) card.set_eternal(true);
  if (_area && card.ability.set === 'Joker') _area.emplace(card);
  else if (G.consumeables) G.consumeables.emplace(card);
  return card;
}

/** draw_card(from, to, percent, dir, sort, card, ...) — queued, like Lua. */
export function draw_card(from, to, percent, dir, sort, card, _delay, mute, stay_flipped, vol, discarded_only) {
  G.E_MANAGER.add_event(() => {
    if (card) {
      if (from) card = from.remove_card(card);
      if (card) {
        let sf = G.GAME && G.GAME.blind && G.GAME.blind.stay_flipped(to, card);
        if (G.GAME.modifiers.flipped_cards && to === G.hand) {
          if (pseudorandom(pseudoseed('flipped_card')) < 1 / G.GAME.modifiers.flipped_cards) sf = true;
        }
        to.emplace(card, undefined, sf);
        if (to === G.hand && from === G.deck && G.drawn_cards) G.drawn_cards.push(card); // SMODS.drawn_cards
      }
    } else {
      to.draw_card_from(from, stay_flipped, discarded_only);
    }
    if (sort) to.sort();
  });
}

export function level_up_hand(card, hand, instant, amount) {
  amount = amount === undefined ? 1 : amount;
  if (callHook('level_up_hand', card, hand, amount).includes(false)) return;
  const h = G.GAME.hands[hand];
  h.level = Math.max(0, h.level + amount);
  h.mult = Math.max(h.s_mult + h.l_mult * (h.level - 1), 1);
  h.chips = Math.max(h.s_chips + h.l_chips * (h.level - 1), 0);
  emit('level_up', { hand, level: h.level, chips: h.chips, mult: h.mult, card: card && card.sort_id, instant: !!instant });
}

export function eval_card(card, context) {
  context = context || {};
  const ret = {};
  if (context.repetition_only) {
    const seals = card.calculate_seal(context);
    if (seals) ret.seals = seals;
    return ret;
  }
  if (context.cardarea === G.play) {
    const chips = card.get_chip_bonus(); if (chips > 0) ret.chips = chips;
    const mult = card.get_chip_mult(); if (mult > 0) ret.mult = mult;
    const x_mult = card.get_chip_x_mult(context); if (x_mult > 0) ret.x_mult = x_mult;
    const p_dollars = card.get_p_dollars(); if (p_dollars > 0) ret.p_dollars = p_dollars;
    const jokers = card.calculate_joker(context); if (jokers) ret.jokers = jokers;
    const edition = card.get_edition(context); if (edition) ret.edition = edition;
  }
  if (context.cardarea === G.hand) {
    const h_mult = card.get_chip_h_mult(); if (h_mult > 0) ret.h_mult = h_mult;
    const h_x_mult = card.get_chip_h_x_mult(); if (h_x_mult > 0) ret.x_mult = h_x_mult;
    const jokers = card.calculate_joker(context); if (jokers) ret.jokers = jokers;
  }
  if (context.cardarea === G.jokers || context.card === G.consumeables) {
    let jokers;
    if (context.edition) jokers = card.get_edition(context);
    else if (context.other_joker) jokers = context.other_joker.calculate_joker(context);
    else jokers = card.calculate_joker(context);
    if (jokers) ret.jokers = jokers;
  }
  return ret;
}

export function get_current_pool(_type, _rarity, _legendary, _append) {
  const _pool = [];
  let _starting_pool, _pool_key = '', _pool_size = 0;
  if (_type === 'Joker') {
    let rarity = _rarity ?? pseudorandom('rarity' + G.GAME.round_resets.ante + (_append || ''));
    // Steamodded: a rarity KEY (mod rarity such as 'poke_safari') picks that pool directly.
    if (typeof rarity === 'string') rarity = _legendary ? 4 : rarity;
    else rarity = (_legendary && 4) || (rarity > 0.95 && 3) || (rarity > 0.7 && 2) || 1;
    _starting_pool = P_JOKER_RARITY_POOLS[rarity] || [];
    _pool_key = 'Joker' + rarity + ((!_legendary && _append) || '');
  } else {
    _starting_pool = P_CENTER_POOLS[_type];
    _pool_key = _type + (_append || '');
  }
  const showman = find_joker('Showman').length > 0;
  for (const v of _starting_pool) {
    let add = false;
    if (_type === 'Enhanced') add = true;
    else if (_type === 'Demo') add = !!(v.pos && v.config);
    else if (_type === 'Tag') {
      if ((!v.requires || (P_CENTERS[v.requires] && P_CENTERS[v.requires].discovered)) && (!v.min_ante || v.min_ante <= G.GAME.round_resets.ante)) add = true;
    } else if (!(G.GAME.used_jokers[v.key] && !showman) && (v.unlocked !== false || v.rarity === 4)) {
      if (v.set === 'Voucher') {
        if (!G.GAME.used_vouchers[v.key]) {
          let include = true;
          if (v.requires) for (const vv of Object.values(v.requires)) if (!G.GAME.used_vouchers[vv]) include = false;
          if (G.shop_vouchers && G.shop_vouchers.cards) for (const vv of G.shop_vouchers.cards) if (vv.config.center.key === v.key) include = false;
          if (include) add = true;
        }
      } else if (v.set === 'Planet') {
        if (!v.config.softlock || G.GAME.hands[v.config.hand_type].played > 0) add = true;
      } else if (v.enhancement_gate) {
        add = false;
        for (const vv of G.playing_cards) if (vv.config.center.key === v.enhancement_gate) add = true;
      } else add = true;
      if (v.name === 'Black Hole' || v.name === 'The Soul' || v.hidden) add = false;
    }
    // Mod content: the center's own in_pool and every active mod's pool_filter.
    if (add && v.in_pool && !v.in_pool(v, { type: _type, append: _append })) add = false;
    if (add && callHook('pool_filter', v, _type, _append).includes(false)) add = false;
    if (v.no_pool_flag && G.GAME.pool_flags[v.no_pool_flag]) add = false;
    if (v.yes_pool_flag && !G.GAME.pool_flags[v.yes_pool_flag]) add = false;
    if (add && !G.GAME.banned_keys[v.key]) { _pool.push(v.key); _pool_size++; }
    else _pool.push('UNAVAILABLE');
  }
  if (_pool_size === 0) {
    _pool.length = 0;
    if (_type === 'Tarot' || _type === 'Tarot_Planet') _pool.push('c_strength');
    else if (_type === 'Planet') _pool.push('c_pluto');
    else if (_type === 'Spectral') _pool.push('c_incantation');
    else if (_type === 'Voucher') _pool.push('v_blank');
    else if (_type === 'Tag') _pool.push('tag_handy');
    else if (CONSUMABLE_TYPES[_type] && CONSUMABLE_TYPES[_type].default) _pool.push(CONSUMABLE_TYPES[_type].default);
    else _pool.push(reduceHook('empty_pool_default', 'j_joker', _type));
  }
  return [_pool, _pool_key + (!_legendary ? G.GAME.round_resets.ante : '')];
}

/** Edition key ('e_holo', 'e_poke_shiny') of a set_edition argument, or null. */
export function edition_key_of(edition) {
  if (!edition) return null;
  if (typeof edition === 'string') return edition.startsWith('e_') ? edition : 'e_' + edition;
  if (edition.type) return 'e_' + edition.type;
  for (const [k, v] of Object.entries(edition)) if (v) return 'e_' + k;
  return null;
}

export function poll_edition(_key, _mod, _no_neg, _guaranteed) {
  // Steamodded's weighted poll_edition, used only when an active mod adds a shop edition
  // (so vanilla runs keep the exact vanilla thresholds). Vanilla weights: foil 20, holo 14,
  // polychrome 3, negative 3; non-guaranteed polls pad the total so 96% stay editionless.
  const modEds = (_key === 'wheel_of_fortune' || _key === 'aura') ? [] : activeModEditions().filter((e) => e.in_shop && (e.weight || 0) > 0 && (!e.in_pool || e.in_pool(e)));
  if (modEds.length) return poll_edition_weighted(_key, _mod, _no_neg, _guaranteed, modEds);
  _mod = _mod || 1;
  const p = pseudorandom(pseudoseed(_key || 'edition_generic'));
  if (_guaranteed) {
    if (p > 1 - 0.003 * 25 && !_no_neg) return { negative: true };
    if (p > 1 - 0.006 * 25) return { polychrome: true };
    if (p > 1 - 0.02 * 25) return { holo: true };
    if (p > 1 - 0.04 * 25) return { foil: true };
  } else {
    if (p > 1 - 0.003 * _mod && !_no_neg) return { negative: true };
    if (p > 1 - 0.006 * G.GAME.edition_rate * _mod) return { polychrome: true };
    if (p > 1 - 0.02 * G.GAME.edition_rate * _mod) return { holo: true };
    if (p > 1 - 0.04 * G.GAME.edition_rate * _mod) return { foil: true };
  }
  return null;
}
function poll_edition_weighted(_key, _mod, _no_neg, _guaranteed, modEds) {
  let _modifier = 1;
  const edition_poll = pseudorandom(pseudoseed(_key || 'edition_generic'));
  const rate = G.GAME.edition_rate;
  // Vanilla editions first (flipped: negative, polychrome, holo, foil), then mod editions.
  const opts = [
    { name: 'negative', weight: 3, get: () => 3 },
    { name: 'polychrome', weight: 3, get: () => (rate - 1) * 3 + rate * 3 },
    { name: 'holo', weight: 14, get: () => rate * 14 },
    { name: 'foil', weight: 20, get: () => rate * 20 },
    ...modEds.map((e) => ({ name: e.key.slice(2), weight: e.weight, get: () => (e.get_weight ? e.get_weight(e) : e.weight) })),
  ];
  let total_weight = 0;
  for (const v of opts) total_weight += v.weight;
  if (!_guaranteed) {
    _modifier = _mod || 1;
    total_weight = total_weight + (total_weight / 4 * 96);
    for (const v of opts) v.weight = reduceHook('edition_weight', v.get(), v.name);
  }
  let weight_i = 0;
  for (const v of opts) {
    weight_i += v.weight * _modifier;
    if (edition_poll > 1 - weight_i / total_weight) {
      if (!(v.name === 'negative' && _no_neg)) return { [v.name]: true };
    }
  }
  return null;
}

export function create_card(_type, area, legendary, _rarity, skip_materialize, soulable, forced_key, key_append) {
  area = area || G.jokers;
  let center = P_CENTERS.b_red;
  const showman = find_joker('Showman').length > 0;
  if (!forced_key && soulable && !G.GAME.banned_keys.c_soul) {
    // Steamodded: hidden mod consumables (soul_set / soul_rate) roll like The Soul, first.
    if (ACTIVE_MODS.length) {
      for (const v of P_CENTER_POOLS.Consumeables) {
        if (!v.mod || !v.hidden || !(_type === v.set || _type === v.soul_set)) continue;
        if (G.GAME.used_jokers[v.key] && !showman && !v.can_repeat_soul) continue;
        if (v.in_pool && !v.in_pool(v, { type: _type, soul: true })) continue;
        if (pseudorandom('soul_' + v.key + _type + G.GAME.round_resets.ante) > 1 - (v.soul_rate ?? 0.003)) forced_key = v.key;
      }
    }
    if ((_type === 'Tarot' || _type === 'Spectral' || _type === 'Tarot_Planet') && !(G.GAME.used_jokers.c_soul && !showman)) {
      if (pseudorandom('soul_' + _type + G.GAME.round_resets.ante) > 0.997) forced_key = 'c_soul';
    }
    if ((_type === 'Planet' || _type === 'Spectral') && !(G.GAME.used_jokers.c_black_hole && !showman)) {
      if (pseudorandom('soul_' + _type + G.GAME.round_resets.ante) > 0.997) forced_key = 'c_black_hole';
    }
  }
  if (_type === 'Base') forced_key = 'c_base';
  if (forced_key && !G.GAME.banned_keys[forced_key]) {
    center = P_CENTERS[forced_key];
    _type = center.set !== 'Default' ? center.set : _type;
  } else {
    const [_pool, _pool_key] = get_current_pool(_type, _rarity, legendary, key_append);
    let [c] = pseudorandom_element(_pool, pseudoseed(_pool_key));
    let it = 1;
    while (c === 'UNAVAILABLE') { it++; [c] = pseudorandom_element(_pool, pseudoseed(_pool_key + '_resample' + it)); }
    center = P_CENTERS[c];
  }
  const front = (_type === 'Base' || _type === 'Enhanced') ? pseudorandom_element(P_CARDS_LIST(), pseudoseed('front' + (key_append || '') + G.GAME.round_resets.ante))[0] : undefined;
  const card = new Card(front, center, { discover: area === G.jokers || area === G.consumeables });
  if (_type === 'Joker') {
    if (G.GAME.modifiers.all_eternal) card.set_eternal(true);
    if (area === G.shop_jokers || area === G.pack_cards) {
      const poll = pseudorandom((area === G.pack_cards ? 'packetper' : 'etperpoll') + G.GAME.round_resets.ante);
      if (G.GAME.modifiers.enable_eternals_in_shop && poll > 0.7) card.set_eternal(true);
      else if (G.GAME.modifiers.enable_perishables_in_shop && poll > 0.4 && poll <= 0.7) card.set_perishable(true);
      if (G.GAME.modifiers.enable_rentals_in_shop && pseudorandom((area === G.pack_cards ? 'packssjr' : 'ssjr') + G.GAME.round_resets.ante) > 0.7) card.set_rental(true);
    }
    card.set_edition(poll_edition('edi' + (key_append || '') + G.GAME.round_resets.ante), true, true);
  }
  callHook('create_card', card, _type, area, key_append);
  return card;
}
/** G.P_CARDS without the synthetic `empty` entry, as an object keyed like Lua. */
let _pcards;
export function P_CARDS_LIST() {
  if (!_pcards) { _pcards = {}; for (const [k, v] of Object.entries(P_CARDS)) if (k !== 'empty') _pcards[k] = v; }
  return _pcards;
}

export function create_playing_card(card_init, area) {
  card_init = card_init || {};
  card_init.front = card_init.front || pseudorandom_element(P_CARDS_LIST(), pseudoseed('front'))[0];
  card_init.center = card_init.center || P_CENTERS.c_base;
  G.playing_card = (G.playing_card || 0) + 1;
  const card = new Card(card_init.front, card_init.center, { playing_card: G.playing_card });
  G.playing_cards.push(card);
  card.playing_card = G.playing_card;
  if (area) area.emplace(card);
  return card;
}

export function copy_card(other, new_card, card_scale, playing_card, strip_edition) {
  new_card = new_card || new Card(P_CARDS.empty, P_CENTERS.c_base, { playing_card });
  new_card.set_ability(other.config.center);
  new_card.ability.type = other.ability.type;
  new_card.set_base(other.config.card);
  for (const [k, v] of Object.entries(other.ability)) new_card.ability[k] = copy_table(v);
  if (!strip_edition) new_card.set_edition(other.edition ? { [other.edition.type]: true } : null, null, true);
  new_card.set_seal(other.seal, true);
  if (other.params) { new_card.params = { ...other.params, playing_card }; }
  new_card.debuff = other.debuff;
  new_card.pinned = other.pinned;
  if (playing_card) new_card.playing_card = playing_card;
  return new_card;
}

export function calculate_reroll_cost(skip_increment) {
  const cr = G.GAME.current_round;
  if (cr.free_rerolls < 0) cr.free_rerolls = 0;
  if (cr.free_rerolls > 0) { cr.reroll_cost = 0; return; }
  cr.reroll_cost_increase = cr.reroll_cost_increase || 0;
  if (!skip_increment) cr.reroll_cost_increase += 1;
  cr.reroll_cost = (G.GAME.round_resets.temp_reroll_cost ?? G.GAME.round_resets.reroll_cost) + cr.reroll_cost_increase;
}

export function reset_idol_card() {
  const ic = G.GAME.current_round.idol_card;
  ic.rank = 'Ace'; ic.suit = 'Spades';
  const valid = G.playing_cards.filter((v) => v.ability.effect !== 'Stone Card');
  if (valid[0]) {
    const [c] = pseudorandom_element(valid, pseudoseed('idol' + G.GAME.round_resets.ante));
    ic.rank = c.base.value; ic.suit = c.base.suit; ic.id = c.base.id;
  }
}
export function reset_mail_rank() {
  const mc = G.GAME.current_round.mail_card;
  mc.rank = 'Ace';
  const valid = G.playing_cards.filter((v) => v.ability.effect !== 'Stone Card');
  if (valid[0]) {
    const [c] = pseudorandom_element(valid, pseudoseed('mail' + G.GAME.round_resets.ante));
    mc.rank = c.base.value; mc.id = c.base.id;
  }
}
export function reset_ancient_card() {
  const suits = SUITS.filter((v) => v !== G.GAME.current_round.ancient_card.suit);
  G.GAME.current_round.ancient_card.suit = pseudorandom_element(suits, pseudoseed('anc' + G.GAME.round_resets.ante))[0];
}
export function reset_castle_card() {
  G.GAME.current_round.castle_card.suit = 'Spades';
  const valid = G.playing_cards.filter((v) => v.ability.effect !== 'Stone Card');
  if (valid[0]) {
    const [c] = pseudorandom_element(valid, pseudoseed('cas' + G.GAME.round_resets.ante));
    G.GAME.current_round.castle_card.suit = c.base.suit;
  }
}
export function reset_blinds() {
  const rr = G.GAME.round_resets;
  rr.blind_states = rr.blind_states || { Small: 'Select', Big: 'Upcoming', Boss: 'Upcoming' };
  if (rr.blind_states.Boss === 'Defeated') {
    rr.blind_states.Small = 'Upcoming'; rr.blind_states.Big = 'Upcoming'; rr.blind_states.Boss = 'Upcoming';
    G.GAME.blind_on_deck = 'Small';
    rr.blind_choices.Boss = get_new_boss();
    rr.boss_rerolled = false;
  }
}
export function get_new_boss() {
  G.GAME.perscribed_bosses = G.GAME.perscribed_bosses || {};
  const ante = G.GAME.round_resets.ante;
  if (G.GAME.perscribed_bosses[ante]) {
    const b = G.GAME.perscribed_bosses[ante];
    delete G.GAME.perscribed_bosses[ante];
    G.GAME.bosses_used[b] += 1;
    return b;
  }
  if (G.FORCE_BOSS) return G.FORCE_BOSS;
  const eligible = {};
  const a1 = Math.max(1, ante);
  for (const [k, v] of Object.entries(P_BLINDS)) {
    if (!v.boss) continue;
    if (v.mod && (!centerActive(v) || (v.in_pool && !v.in_pool(v)))) continue;
    if (!v.boss.showdown && v.boss.min <= a1 && (a1 % G.GAME.win_ante !== 0 || ante < 2)) eligible[k] = true;
    else if (v.boss.showdown && ante % G.GAME.win_ante === 0 && ante >= 2) eligible[k] = true;
  }
  for (const k of Object.keys(G.GAME.banned_keys)) delete eligible[k];
  let min_use = 100;
  for (const [k, v] of Object.entries(G.GAME.bosses_used)) {
    if (eligible[k]) { eligible[k] = v; if (v <= min_use) min_use = v; }
  }
  for (const k of Object.keys(eligible)) if (eligible[k] > min_use) delete eligible[k];
  const [, boss] = pseudorandom_element(eligible, pseudoseed('boss'));
  G.GAME.bosses_used[boss] += 1;
  return boss;
}
export function get_next_voucher_key(_from_tag) {
  let [_pool, _pool_key] = get_current_pool('Voucher');
  if (_from_tag) _pool_key = 'Voucher_fromtag';
  let [center] = pseudorandom_element(_pool, pseudoseed(_pool_key));
  let it = 1;
  while (center === 'UNAVAILABLE') { it++; [center] = pseudorandom_element(_pool, pseudoseed(_pool_key + '_resample' + it)); }
  return center;
}
export function get_next_tag_key(append) {
  if (G.FORCE_TAG) return G.FORCE_TAG;
  const [_pool, _pool_key] = get_current_pool('Tag', null, null, append);
  let [tag] = pseudorandom_element(_pool, pseudoseed(_pool_key));
  let it = 1;
  while (tag === 'UNAVAILABLE') { it++; [tag] = pseudorandom_element(_pool, pseudoseed(_pool_key + '_resample' + it)); }
  return tag;
}
export function get_pack(_key, _type) {
  if (!G.GAME.first_shop_buffoon && !G.GAME.banned_keys.p_buffoon_normal_1) {
    G.GAME.first_shop_buffoon = true;
    return P_CENTERS['p_buffoon_normal_' + math_random(1, 2)];
  }
  let cume = 0, it = 0, center;
  // Lua `v.weight or 1` (a weight of 0 stays 0); mod packs may also refuse via in_pool.
  const ok = (v) => !G.GAME.banned_keys[v.key] && !(v.mod && v.in_pool && !v.in_pool(v, { type: 'Booster' }));
  for (const v of P_CENTER_POOLS.Booster) if ((!_type || _type === v.kind) && ok(v)) cume += v.weight ?? 1;
  const poll = pseudorandom(pseudoseed((_key || 'pack_generic') + G.GAME.round_resets.ante)) * cume;
  for (const v of P_CENTER_POOLS.Booster) {
    if (ok(v)) {
      if (!_type || _type === v.kind) it += v.weight ?? 1;
      if (it >= poll && it - (v.weight ?? 1) <= poll) { center = v; break; }
    }
  }
  return center;
}

export function get_blind_amount(ante) {
  const k = 0.75;
  const tables = {
    1: [300, 800, 2000, 5000, 11000, 20000, 35000, 50000],
    2: [300, 900, 2600, 8000, 20000, 36000, 60000, 100000],
    3: [300, 1000, 3200, 9000, 25000, 60000, 110000, 200000],
  };
  const amounts = tables[G.GAME.modifiers.scaling || 1] || tables[1];
  if (ante < 1) return 100;
  if (ante <= 8) return amounts[ante - 1];
  const a = amounts[7], b = 1.6, c = ante - 8, d = 1 + 0.2 * (ante - 8);
  let amount = Math.floor(a * Math.pow(b + Math.pow(k * c, d), c));
  if (!isFinite(amount)) return amount;
  amount = amount - amount % Math.pow(10, Math.floor(Math.log10(amount) - 1));
  return amount;
}

export function number_format(num) {
  if (num === undefined || num === null) return '0';
  if (!isFinite(num)) return num > 0 ? 'naneinf' : '-naneinf';
  if (Math.abs(num) >= 1e11) {
    const e = Math.floor(Math.log10(Math.abs(num)));
    return (num / Math.pow(10, e)).toFixed(3) + 'e' + e;
  }
  return Math.floor(num).toLocaleString('en-US');
}

export function mod_chips(c) { return G.GAME.modifiers.chips_dollar_cap ? Math.min(c, Math.max(G.GAME.dollars, 0)) : c; }
export function mod_mult(m) { return m; }

export function check_for_unlock() { /* achievements are out of scope */ }
export function inc_career_stat() {}
export function set_consumeable_usage(card) {
  if (card.config.center_key && card.ability.consumeable) {
    const u = G.GAME.consumeable_usage;
    if (u[card.config.center_key]) u[card.config.center_key].count += 1;
    else u[card.config.center_key] = { count: 1, order: card.config.center.order, set: card.ability.set };
    if (card.config.center.set === 'Tarot' || card.config.center.set === 'Planet') {
      // Lua sets this two events later, so The Fool used right now still sees the previous card.
      const key = card.config.center_key;
      G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => { G.GAME.last_tarot_planet = key; }));
    }
    if (card.config.center.set === 'Tarot') G.GAME.consumeable_usage_total.tarot = (G.GAME.consumeable_usage_total.tarot || 0) + 1;
    if (card.config.center.set === 'Planet') G.GAME.consumeable_usage_total.planet = (G.GAME.consumeable_usage_total.planet || 0) + 1;
    if (card.config.center.set === 'Spectral') G.GAME.consumeable_usage_total.spectral = (G.GAME.consumeable_usage_total.spectral || 0) + 1;
    if (card.config.center.set === 'Tarot' || card.config.center.set === 'Planet') G.GAME.consumeable_usage_total.tarot_planet = (G.GAME.consumeable_usage_total.tarot_planet || 0) + 1;
    G.GAME.consumeable_usage_total.all = (G.GAME.consumeable_usage_total.all || 0) + 1;
  }
}
export function set_hand_usage(hand) {
  const u = G.GAME.hand_usage;
  u[hand] = u[hand] || { count: 0, order: hand };
  u[hand].count += 1;
}
