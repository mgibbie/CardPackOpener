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
import * as B from './bignum.js';
import { callHook, reduceHook, firstHook, activeConsumableTypes, CONSUMABLE_TYPES, MOD_LOC, ACTIVE as ACTIVE_MODS, centerActive, activeModEditions, MOD_SUITS, activeModSuits, RARITIES, resolve_set, SET_ALIASES } from '../mods/registry.js';
// (Steamodded seams for Pokermon 3.9.1 — opt-in contexts and the object_weights routes; all no-ops unless a mod uses them)
import { wanted, calculate_seam, object_weights, poll_object, SEAM_STATE } from './smods.js';

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
  // (a mod 'seal' of another set — AutumnMoodMechanics' joker Stamps, set 'Stamp' — pools apart, like SMODS)
  for (const v of Object.values(P_SEALS)) if (isActive(v)) (P_CENTER_POOLS[v.set && v.set !== 'Seal' ? v.set : 'Seal'] = P_CENTER_POOLS[v.set && v.set !== 'Seal' ? v.set : 'Seal'] || []).push(v);
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
/**
 * SMODS.get_probability_vars(trigger_obj, num, den, identifier) -> [numerator, denominator]: every mod
 * card's `mod_probability` context (each sees the running numerator/denominator and may return new
 * ones — Pokermon's Venonat), then Oops! All 6s (G.GAME.probabilities.normal), then `fix_probability`.
 */
export function probability_vars(trigger_obj, base_numerator, base_denominator, identifier, from_roll) {
  let numerator = base_numerator, denominator = base_denominator;
  const pass = (key) => {
    for (const area of [G.jokers, G.consumeables]) {
      if (!area) continue;
      for (const c of area.cards.slice()) {
        if (!c.config.center.mod || !c.config.center.calculate) continue;
        const r = c.calculate_joker({ [key]: true, from_roll, trigger_obj, identifier, numerator, denominator });
        if (r && typeof r === 'object') {
          if (r.numerator !== undefined) numerator = r.numerator;
          if (r.denominator !== undefined) denominator = r.denominator;
        }
      }
    }
    // SMODS's 'individual' areas (the deck, blind, stake) see the context after the jokers: AutumnCircus' Gambling Deck
    if (ACTIVE_MODS.length) [numerator, denominator] = reduceHook('probability_pass', [numerator, denominator], key, { from_roll, trigger_obj, identifier });
  };
  pass('mod_probability');
  numerator = numerator * (G.GAME && G.GAME.probabilities ? G.GAME.probabilities.normal : 1); // (Lua: 0 is truthy)
  pass('fix_probability');
  // (a mod rule on any listed probability: AutumnCircus' Dusk Stamp)
  if (ACTIVE_MODS.length) [numerator, denominator] = reduceHook('probability_vars', [numerator, denominator], trigger_obj, identifier);
  return [numerator, denominator];
}
/** SMODS.pseudorandom_probability(trigger_obj, seed, num, den, identifier): the listed-probability roll. */
export function probability_roll(trigger_obj, seed, base_numerator, base_denominator, identifier) {
  const [numerator, denominator] = probability_vars(trigger_obj, base_numerator, base_denominator, identifier || seed, true);
  return pseudorandom(seed) < numerator / denominator;
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
// ------------------------------------------------------------ the acting card
// The card whose OWN effect is running now: a joker's calculate_joker / calculate_dollar_bonus, its mod center's
// add_to_deck / remove_from_deck, and the post-effect funcs its calculate returned (Card.prototype.calculate_joker
// binds them). An event carries the acting card of the moment it was queued (E_MANAGER.add_event), so a card made in a
// joker's queued event (Tropius's banana) still knows its maker. Using a consumable and a tag applying run with no
// acting card: those are their own effects, not the joker's. Read-only bookkeeping: nothing in the game's rules reads
// it (Pokermon's run badges do: mods/pokermon/systems/runbadges.js), so it changes no run.
let actingCard = null;
/** -> the card whose effect is running now (null: a player action, a consumable, a tag, the engine itself). */
export function acting_card() { return actingCard; }
/** Make `card` the acting card (null: none) -> the previous one, for the caller to restore (a hot path's with_actor). */
export function set_actor(card) { const prev = actingCard; actingCard = card || null; return prev; }
/** Run fn with `card` as the acting card (null: none), restoring the previous one after. */
export function with_actor(card, fn) {
  const prev = actingCard;
  actingCard = card || null;
  try { return fn(); } finally { actingCard = prev; }
}

/** Synchronous stand-in for Balatro's G.E_MANAGER. */
export const E_MANAGER = {
  queue: [],
  add_event(fn, front) {
    // (the event runs with the acting card it was queued under, or none: see acting_card)
    const actor = actingCard, ev = () => with_actor(actor, fn);
    if (front) this.queue.unshift(ev); else this.queue.push(ev);
  },
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
  const ev = { type, seq: ++G.ui_seq, ...data };
  // A card's in-place change (an enhancement, seal, edition, rank/suit, debuff) or flip carries the card's
  // view as it is right now, so the board redraws it at that moment. Without it the board only had the
  // end-of-action view, which misses a card that has left the table by then (an Arcana pack's hand goes
  // back to the deck when the pack closes: The Empress's Mult showed only the next time the card was drawn).
  if (eventCardView && CARD_VIEW_EVENTS.has(type) && ev.card != null && ev.view === undefined) {
    const c = cardById(ev.card);
    if (c) { try { ev.view = eventCardView(c); } catch (e) { /* the board falls back to the final view */ } }
  }
  G.ui_events.push(ev);
}
const CARD_VIEW_EVENTS = new Set(['card_changed', 'edition', 'seal', 'flip']);
let eventCardView = null;
/** engine/view.js registers its cardView here (view.js imports core.js, so core can't import it). */
export function setEventCardView(fn) { eventCardView = fn; }
function cardById(id) {
  for (const a of G.areas || []) for (const c of a.cards) if (c.sort_id === id) return c;
  for (const c of G.playing_cards || []) if (c.sort_id === id) return c;
  return null;
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
  // (Bunco's Nil Bill / Neon Joker watch the 'debuff' popup — "a debuffed card was played")
  if (ACTIVE_MODS.length) callHook('status_text', card, eval_type, amt, extra);
  // Lua: card_eval_status_text ends with playing_card_joker_effects(extra.playing_cards_created) (DNA -> Hologram).
  if (extra && extra.playing_cards_created) for (const j of G.jokers.cards) mod_context_effect(j, j.calculate_joker({ playing_card_added: true, cards: extra.playing_cards_created }));
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
    if (ACTIVE_MODS.length) callHook('emplace', this, card, location, stay_flipped);
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
  add_to_highlighted(card, silent) {
    // A mod may do the highlighting itself (a Lua CardArea:add_to_highlighted wrap — Bunco's linked cards
    // select their whole group); its own add_to_highlighted calls take the vanilla path below.
    if (ACTIVE_MODS.length && !this.mod_highlighting) {
      this.mod_highlighting = true;
      let done;
      try { done = callHook('add_to_highlighted', this, card, silent).includes(true); } finally { this.mod_highlighting = false; }
      if (done) return;
    }
    // A card can only be selected once (Cerulean Bell's forced card survives unhighlight_all).
    if (this.highlighted.includes(card)) return;
    if (this.config.type === 'shop') {
      if (this.highlighted[0]) this.remove_from_highlighted(this.highlighted[0]);
      this.highlighted.push(card); card.highlighted = true;
    } else if (this.config.type === 'joker' || this.config.type === 'consumeable') {
      if (this.highlighted.length >= this.config.highlighted_limit) this.remove_from_highlighted(this.highlighted[0]);
      this.highlighted.push(card); card.highlighted = true;
    } else {
      // Mods may change how many cards this area lets you select (BETMMA's Slate: Stone Cards don't count).
      const limit = ACTIVE_MODS.length ? reduceHook('highlight_limit', this.config.highlighted_limit, this, card) : this.config.highlighted_limit;
      if (this.highlighted.length >= limit) card.highlighted = false;
      else { this.highlighted.push(card); card.highlighted = true; }
    }
  }
  remove_from_highlighted(card, force) {
    // (a Lua CardArea:remove_from_highlighted wrap — Bunco: a linked group is deselected together)
    if (ACTIVE_MODS.length && !this.mod_highlighting && card) {
      this.mod_highlighting = true;
      let done;
      try { done = callHook('remove_from_highlighted', this, card, force).includes(true); } finally { this.mod_highlighting = false; }
      if (done) return;
    }
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
  shuffle(seed) {
    pseudoshuffle(this.cards, pseudoseed(seed || 'shuffle'));
    // (a mod reorders after a shuffle: AutumnMoodMechanics' Bottled cards go on top)
    if (ACTIVE_MODS.length) callHook('shuffled', this, seed);
    this.set_ranks(); emit('shuffle', { area: this.name });
  }
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
        let sf = G.GAME && G.GAME.blind && G.GAME.blind.stay_flipped(this, card, area);
        if (this === G.hand && G.GAME.modifiers.flipped_cards) {
          if (pseudorandom(pseudoseed('flipped_card')) < 1 / G.GAME.modifiers.flipped_cards) sf = true;
        }
        if (SEAM_STATE.to_area) { const dest = SEAM_STATE.to_area; SEAM_STATE.to_area = undefined; dest.emplace(card, undefined, sf); return true; } // (SMODS.to_area)
        this.emplace(card, undefined, sf);
        if (this === G.hand && area === G.deck && G.drawn_cards) G.drawn_cards.push(card); // SMODS.drawn_cards
        if (ACTIVE_MODS.length && this === G.hand && area === G.deck) callHook('drawn_to_hand', card); // (custom decks: rank up on draw)
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
    // (a mod suit: SMODS gives each suit the next 0.01 of suit_nominal in registration order)
    const s = SUIT_NOM[this.base.suit] || (MOD_SUITS[this.base.suit] && [MOD_SUITS[this.base.suit].nominal, MOD_SUITS[this.base.suit].nominal / 10]);
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
      // SMODS perma_mult / perma_x_mult (Houndour, Tyranitar) persist like perma_bonus.
      perma_mult: prev && prev.perma_mult ? prev.perma_mult : undefined,
      perma_x_mult: prev && prev.perma_x_mult ? prev.perma_x_mult : undefined,
    };
    // SMODS perma_h_dollars (Pokermon 3.9.1's DNA Seal copies with a Defense Deoxys) persists too; only set when a card has it.
    if (prev && prev.perma_h_dollars) this.ability.perma_h_dollars = prev.perma_h_dollars;
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
    // Mods acting on any set_ability (a Lua Card:set_ability wrap; BETMMA's Chaos / Real Random).
    if (smods) callHook('set_ability', this, center, old_center, initial);
    if (was_added_to_deck && !this.debuff) this.add_to_deck();
    if (!initial && G.GAME.blind) G.GAME.blind.debuff_card(this);
    if (!initial) emit('card_changed', { card: this.sort_id });
    // Steamodded's setting_ability context (not in a booster or the shop unless a consumable is being used).
    if (!initial && old_center && smods && wanted('setting_ability') && (!SEAM_STATE.in_pack_or_shop() || G.TAROT_INTERRUPT)) {
      calculate_seam({ setting_ability: true, old: old_center.key, new: this.config.center_key, other_card: this, unchanged: old_center.key === this.config.center.key }, 'setting_ability');
    }
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
    if (!edition || !ek || ek === 'e_base') {
      this.set_cost(); if (old) emit('card_changed', { card: this.sort_id });
      // Lua `edition == nil` (not {}): Sylvie's Aurora deck rolls one for playing cards.
      if (edition == null && ACTIVE_MODS.length) callHook('edition_nil', this);
      return;
    }
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
    // SMODS: a base edition may also come as its key ('e_foil').
    if (typeof edition === 'string') edition = { [ek.slice(2)]: true };
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
    const prev = this.seal;
    this.seal = _seal || null;
    // (SMODS seal / AMM Stamp apply-unapply: e.g. Jimbo's Stamp's +1 hand size while it's on an owned joker)
    if (ACTIVE_MODS.length) callHook('set_seal', this, this.seal, prev);
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
    // Steamodded SMODS.debuff_card(card, debuff, source) sources (ability.debuff_sources):
    // a 'prevent_debuff' source wins outright, any other truthy source debuffs.
    for (const v of Object.values(this.ability.debuff_sources || {})) {
      if (v === 'prevent_debuff') {
        if (this.debuff) { this.debuff = false; if (this.area === G.jokers) this.add_to_deck(true); emit('card_changed', { card: this.sort_id }); }
        return;
      }
      if (v) should_debuff = true;
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
  flip() {
    // A mod may keep a face-up card face up (Bunco's Fluorescent edition).
    if (ACTIVE_MODS.length && this.facing === 'front' && callHook('flip', this).includes(false)) return;
    this.facing = this.facing === 'front' ? 'back' : 'front'; emit('flip', { card: this.sort_id, facing: this.facing });
  }

  change_suit(new_suit) {
    const code = { Diamonds: 'D_', Spades: 'S_', Clubs: 'C_', Hearts: 'H_' }[new_suit] || (MOD_SUITS[new_suit] && MOD_SUITS[new_suit].card_key + '_');
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
    if (this.config.center.mod && this.config.center.add_to_deck) with_actor(this, () => this.config.center.add_to_deck(this.config.center, this, from_debuff));
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
      else negative_area(this).config.card_limit += 1;
    }
    if (G.GAME.blind) G.E_MANAGER.add_event(() => G.GAME.blind.set_blind(null, true, null));
  }
  remove_from_deck(from_debuff) {
    if (!this.added_to_deck) return;
    this.added_to_deck = false;
    if (ACTIVE_MODS.length) callHook('remove_from_deck', this, from_debuff);
    if (this.config.center.mod && this.config.center.remove_from_deck) with_actor(this, () => this.config.center.remove_from_deck(this.config.center, this, from_debuff));
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
      else negative_area(this).config.card_limit -= 1;
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
    if (this.config.center.no_rank && !this.vampired) return -(100 + this.sort_id * 7919); // SMODS no_rank enhancement
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
    if (this.ability.effect === 'Stone Card' || this.config.center.replace_base_card) return this.ability.bonus + (this.ability.perma_bonus || 0);
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
    // SMODS: + ability.perma_mult (absent in the base game).
    const perma = this.ability.perma_mult || 0;
    if (this.ability.effect === 'Lucky Card') {
      if (probability_roll(this, 'lucky_mult', 1, 5)) { this.lucky_trigger = true; return perma + this.ability.mult; }
      return perma;
    }
    return perma + this.ability.mult;
  }
  get_chip_x_mult() {
    if (this.debuff) return 0;
    if (this.ability.set === 'Joker') return 0;
    // SMODS.multiplicative_stacking(x_mult, perma_x_mult) = x_mult * (1 + perma_x_mult); 1 -> 0 (no effect).
    if (this.ability.perma_x_mult) {
      const ret = (this.ability.x_mult || 1) * (this.ability.perma_x_mult + 1);
      return ret === 1 ? 0 : ret > 0 ? ret : 0;
    }
    if (this.ability.x_mult <= 1) return 0;
    return this.ability.x_mult;
  }
  get_chip_h_mult() { return this.debuff ? 0 : this.ability.h_mult; }
  get_chip_h_x_mult() { return this.debuff ? 0 : this.ability.h_x_mult; }
  get_edition() {
    if (this.debuff) return undefined;
    // A mod edition with no scoring numbers (e.g. Pokermon's Shiny) scores nothing.
    if (this.edition && this.edition.key && P_CENTERS[this.edition.key] && P_CENTERS[this.edition.key].mod &&
        !this.edition.chips && !this.edition.mult && !this.edition.x_mult && !(this.edition.x_chips ?? this.edition.Xchips)) return undefined;
    if (this.edition) {
      const ret = { card: this };
      if (this.edition.x_mult) ret.x_mult_mod = this.edition.x_mult;
      if (this.edition.mult) ret.mult_mod = this.edition.mult;
      if (this.edition.chips) ret.chip_mod = this.edition.chips;
      // A mod edition's X Chips (Bunco's Glitter) scores where X Mult does (mod editions only).
      const xc = this.edition.x_chips ?? this.edition.Xchips;
      if (xc) ret.x_chip_mod = xc;
      return ret;
    }
  }
  get_end_of_round_effect() {
    if (this.debuff) return {};
    const ret = {};
    if (this.ability.h_dollars > 0) { ret.h_dollars = this.ability.h_dollars; ret.card = this; }
    // SMODS get_h_dollars: + ability.perma_h_dollars (absent in the base game: Pokermon 3.9.1's DNA Seal sets it).
    if (this.ability.perma_h_dollars > 0) { ret.h_dollars = (ret.h_dollars || 0) + this.ability.perma_h_dollars; ret.card = this; }
    // Steamodded quantum enhancements: an extra Gold enhancement pays too (Nacho's Carbink).
    if (ACTIVE_MODS.length) {
      for (const k of quantum_enhancements(this)) {
        const q = P_CENTERS[k].config || {};
        if (q.h_dollars > 0) { ret.h_dollars = (ret.h_dollars || 0) + q.h_dollars; ret.card = this; }
      }
    }
    if (this.seal === 'Blue' && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      G.GAME.consumeable_buffer += 1;
      // (a custom deck may name the planet: Deck Creator's blue_seal_always_most_played)
      const forced = ACTIVE_MODS.length ? firstHook('blue_seal', this) : undefined;
      G.E_MANAGER.add_event(() => {
        if (forced || G.GAME.last_hand_played) {
          let _planet = forced || 0;
          if (!forced) for (const v of P_CENTER_POOLS.Planet) if (v.config.hand_type === G.GAME.last_hand_played) _planet = v.key;
          // A mod hand without a planet (Bunco's Deal): Pluto, like Bunco's "Deal hand crash fix for Blue Seal".
          if (_planet === 0 && ACTIVE_MODS.length) _planet = 'c_pluto';
          const card = create_card('Planet', G.consumeables, null, null, null, null, _planet, 'blusl');
          card.add_to_deck();
          G.consumeables.emplace(card);
          G.GAME.consumeable_buffer = 0;
        }
      });
      card_eval_status_text(this, 'extra', null, null, null, { message: localize('k_plus_planet') });
      ret.effect = true;
    }
    // Mods may add to a held card's end-of-round effect (Mika's: Blue Seal + Aurora Borealis / Harp Seal).
    if (ACTIVE_MODS.length) callHook('end_of_round_effect', this, ret);
    return ret;
  }
  get_p_dollars() {
    if (this.debuff) return 0;
    let ret = 0;
    if (this.seal === 'Gold') ret += 3;
    if (this.ability.p_dollars > 0) {
      if (this.ability.effect === 'Lucky Card') {
        if (probability_roll(this, 'lucky_money', 1, 15)) { this.lucky_trigger = true; ret += this.ability.p_dollars; }
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
    // (a custom deck's seal rules replace the vanilla Red / Purple Seal: Deck Creator's seal options)
    if (ACTIVE_MODS.length) { const o = firstHook('calculate_seal', this, context); if (o !== undefined) return o || undefined; }
    if (context.repetition && this.seal === 'Red') return { message: localize('k_again_ex'), repetitions: 1, card: this };
    // Mods may retrigger the seal (MoreFluff's retrigger_seal_ctx: Lightning Strikes Thrice on a Purple
    // Seal's discard): the hook returns [{card, ret: {repetitions, message}}] per retriggering joker.
    if (ACTIVE_MODS.length && !context.retriggered) {
      context.retriggered = true;
      for (const list of callHook('seal_retriggers', this, context)) {
        for (const { card, ret } of list) {
          for (let i = 0; i < (ret.repetitions || 0); i++) { card_eval_status_text(card, 'jokers', null, null, null, ret); this.calculate_seal(context); }
        }
      }
    }
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
    if (ACTIVE_MODS.length && callHook('calculate_rental', this).includes(false)) return; // (BETMMA's Debt Burden)
    if (this.ability.rental) { ease_dollars(-G.GAME.rental_rate); card_eval_status_text(this, 'dollars', -G.GAME.rental_rate); }
  }
  calculate_perishable() {
    if (this.ability.perishable && this.ability.perish_tally > 0) {
      if (this.ability.perish_tally === 1) { this.ability.perish_tally = 0; this.set_debuff(); }
      else this.ability.perish_tally -= 1;
    }
  }
  is_suit(suit, bypass_debuff, flush_calc) {
    if (this.config.center.no_suit) return false; // SMODS no_suit enhancement
    if (flush_calc) {
      if (this.ability.effect === 'Stone Card') return false;
      if ((this.ability.name === 'Wild Card' || (ACTIVE_MODS.length && quantum_enhancements(this).includes('m_wild'))) && !this.debuff) return true;
      // mod suit rules (Milatro's Colorblindness; Bunco's Myopia / Astigmatism — or false: an exotic suit is never Smeared)
      if (ACTIVE_MODS.length) { const o = firstHook('is_suit', this, suit, bypass_debuff, flush_calc); if (o === true || o === false) return o; }
      if (find_joker('Smeared Joker').length && (this.base.suit === 'Hearts' || this.base.suit === 'Diamonds') === (suit === 'Hearts' || suit === 'Diamonds')) return true;
      return this.base.suit === suit;
    }
    if (this.debuff && !bypass_debuff) return false;
    if (this.ability.effect === 'Stone Card') return false;
    // (+ Steamodded quantum Wild: e.g. Pokermon's Shaymin Sky makes Flower cards Wild too)
    if (this.ability.name === 'Wild Card' || (ACTIVE_MODS.length && quantum_enhancements(this).includes('m_wild'))) return true;
    if (ACTIVE_MODS.length) { const o = firstHook('is_suit', this, suit, bypass_debuff, flush_calc); if (o === true || o === false) return o; }
    if (find_joker('Smeared Joker').length && (this.base.suit === 'Hearts' || this.base.suit === 'Diamonds') === (suit === 'Hearts' || suit === 'Diamonds')) return true;
    return this.base.suit === suit;
  }
  can_sell_card() {
    if ((G.play && G.play.cards.length > 0) || (G.GAME.STOP_USE && G.GAME.STOP_USE > 0)) return false;
    if (ACTIVE_MODS.length && callHook('can_sell', this).includes(false)) return false; // (Bunco: a sold Hindered joker)
    return !!(this.area && this.area.config.type === 'joker' && !this.ability.eternal) ||
      // (Lua: the consumable area is a 'joker' type area too, so an Eternal consumable — mods only — can't be sold)
      !!(this.area && this.area.config.type === 'consumeable' && !this.ability.eternal);
  }
  /** Card:sell_card — synchronous; sell price paid via the queue like Lua. */
  sell_card() {
    if (ACTIVE_MODS.length) callHook('sell_card', this);
    mod_context_effect(this, this.calculate_joker({ selling_self: true }));
    G.E_MANAGER.add_event(() => {
      play_sound('coin2');
      ease_dollars(this.sell_cost);
      // A mod may keep the sold card in place (Bunco's Hindered sticker: it leaves at the end of the round).
      if (ACTIVE_MODS.length && callHook('sell_card_keep', this).includes(true)) { emit('card_changed', { card: this.sort_id }); }
      else {
        emit('dissolve', { card: this.sort_id, reason: 'sold' });
        this.remove();
      }
      if (this.ability.set === 'Joker' && G.GAME.blind && G.GAME.blind.name === 'Verdant Leaf') {
        G.E_MANAGER.add_event(() => G.GAME.blind.disable());
      }
    });
  }
  calculate_dollar_bonus() {
    if (this.debuff) return undefined;
    if (this.config.center.mod) return this.config.center.calc_dollar_bonus ? with_actor(this, () => this.config.center.calc_dollar_bonus(this.config.center, this)) : undefined;
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
  start_dissolve() {
    if (ACTIVE_MODS.length) callHook('start_dissolve', this);
    emit('dissolve', { card: this.sort_id }); this.remove();
  }
  shatter() {
    // A mod may keep a breaking card in play (BETMMA's Bulletproof Glass Cards).
    if (ACTIVE_MODS.length && callHook('shatter', this).includes(true)) return;
    emit('shatter', { card: this.sort_id }); play_sound('glass1'); this.remove();
  }
  juice_up() { juice_card(this); }
  /** Card:remove — take the card out of its area, the deck list, and the joker slots. */
  remove() {
    const first = !this.removed;
    if (first) callHook('card_removed', this);
    this.removed = true;
    if (this.area) this.area.remove_card(this);
    this.remove_from_deck();
    if (this.ability.queue_negative_removal) negative_area(this).config.card_limit -= 1;
    // Free the center for future pools (rerolled shop jokers can come back).
    if (G.GAME && G.GAME.used_jokers && !find_joker(this.ability.name, true).length) {
      for (const [k, v] of Object.entries(P_CENTERS)) if (v.name === this.ability.name) delete G.GAME.used_jokers[k];
    }
    if (G.playing_cards) {
      const i = G.playing_cards.indexOf(this);
      if (i >= 0) G.playing_cards.splice(i, 1);
      G.playing_cards.forEach((v, k) => { v.playing_card = k + 1; });
    }
    // (Bunco: a linked group goes with its card; a Scattering joker takes a neighbour with it)
    if (first && ACTIVE_MODS.length) callHook('card_removed_after', this);
  }
  // Filled in by sibling modules:
  //   calculate_joker(context)        -> jokers.js
  //   use_consumeable / can_use_consumeable / open / redeem / apply_to_run -> consumables.js
}

/**
 * Mods may adjust what a card scores (a Lua Card:get_chip_bonus / get_chip_mult / get_chip_x_mult /
 * get_p_dollars wrap; BETMMA's Real Random and over-retriggered cards): reduceHook(name, value, card).
 */
for (const [m, h] of [['get_chip_bonus', 'chip_bonus'], ['get_chip_mult', 'chip_mult'], ['get_chip_x_mult', 'chip_x_mult'], ['get_p_dollars', 'p_dollars']]) {
  const base = Card.prototype[m];
  Card.prototype[m] = function (...args) {
    const r = base.apply(this, args);
    return ACTIVE_MODS.length ? reduceHook(h, r, this) : r;
  };
}

/** The area whose slots a Negative edition on this card adds to (a mod may say: Reverie's Cine slots). */
function negative_area(card) {
  return (ACTIVE_MODS.length && firstHook('negative_area', card)) || (card.ability.consumeable ? G.consumeables : G.jokers);
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
  // Mods may change the amount (BETMMA's Gold Round Up) and react to it (Piggy Bank), like Lua wraps.
  const orig = mod;
  const initial = G.GAME.dollars;
  if (ACTIVE_MODS.length) mod = reduceHook('ease_dollars', mod, instant);
  queue_ease_dollars(mod, instant);
  if (ACTIVE_MODS.length) callHook('dollars_eased', orig, instant);
  // Steamodded's money_altered context (fired at the call, like SMODS's ease_dollars wrap; the change may still be queued)
  if (ACTIVE_MODS.length && wanted('money_altered')) {
    calculate_seam({
      money_altered: true, amount: mod, initial,
      from_shop: SEAM_STATE.in_pack_or_shop() || undefined, from_consumeable: SEAM_STATE.is('PLAY_TAROT') || undefined,
      from_scoring: SEAM_STATE.is('HAND_PLAYED') || undefined, from_cashout: SEAM_STATE.money_from_cashout || undefined,
    }, 'money_altered');
  }
}
function queue_ease_dollars(mod, instant) {
  const _mod = () => {
    mod = mod || 0;
    G.GAME.dollars += mod;
    if (mod > 0) G.GAME.stats.dollars_earned = (G.GAME.stats.dollars_earned || 0) + mod;
    emit('dollars', { mod, total: G.GAME.dollars });
    play_sound(mod < 0 ? 'coin2' : 'coin1');
    // Steamodded center update(dt) runs every frame in Lua, so a joker watching the money
    // (Pokermon's Gimmighoul) sees each change on its own: run mod jokers' update() now.
    if (ACTIVE_MODS.length && mod) {
      for (const c of all_cards()) {
        const mc = c.config.center;
        if (mc.mod && mc.update && c.ability.set === 'Joker') mc.update(mc, c);
      }
    }
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
  // Steamodded's modify_ante (a listener may return {modify = n}) and ante_change contexts; ante_end = the boss was beaten
  if (ACTIVE_MODS.length && wanted('modify_ante')) {
    const f = calculate_seam({ modify_ante: mod, ante_end: SEAM_STATE.ante_end }, 'modify_ante');
    if (f.modify !== undefined && f.modify !== null && f.modify !== false) mod = f.modify;
  }
  // (a Lua ease_ante wrap that changes the step: MoreFluff's Superboss freezes the ante, Final Stake holds it)
  if (ACTIVE_MODS.length) mod = reduceHook('ease_ante_mod', mod);
  if (ACTIVE_MODS.length) callHook('ease_ante', mod);
  G.E_MANAGER.add_event(() => {
    G.GAME.round_resets.ante += mod || 0;
    G.GAME.stats.furthest_ante = Math.max(G.GAME.stats.furthest_ante || 0, G.GAME.round_resets.ante);
    emit('ante', { mod, total: G.GAME.round_resets.ante });
  });
  if (ACTIVE_MODS.length && wanted('ante_change')) calculate_seam({ ante_change: mod, ante_end: SEAM_STATE.ante_end }, 'ante_change');
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
        let sf = G.GAME && G.GAME.blind && G.GAME.blind.stay_flipped(to, card, from);
        if (G.GAME.modifiers.flipped_cards && to === G.hand) {
          if (pseudorandom(pseudoseed('flipped_card')) < 1 / G.GAME.modifiers.flipped_cards) sf = true;
        }
        if (SEAM_STATE.to_area) { to = SEAM_STATE.to_area; SEAM_STATE.to_area = undefined; } // (SMODS.to_area)
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
  const old = { level: h.level, chips: h.chips, mult: h.mult };
  h.level = Math.max(0, h.level + amount);
  h.mult = Math.max(h.s_mult + h.l_mult * (h.level - 1), 1);
  h.chips = Math.max(h.s_chips + h.l_chips * (h.level - 1), 0);
  emit('level_up', { hand, level: h.level, chips: h.chips, mult: h.mult, card: card && card.sort_id, instant: !!instant });
  if (ACTIVE_MODS.length) callHook('hand_leveled', card, hand, amount);
  // Steamodded's poker_hand_changed context (SMODS.upgrade_poker_hands, which level_up_hand runs through)
  if (ACTIVE_MODS.length && wanted('poker_hand_changed')) {
    calculate_seam({
      card, poker_hand_changed: true, scoring_name: hand, old_level: old.level, new_level: h.level,
      old_parameters: { chips: old.chips, mult: old.mult }, new_parameters: { chips: h.chips, mult: h.mult },
    }, 'poker_hand_changed');
  }
}

/**
 * Steamodded: a playing card's MOD enhancement and MOD seal `calculate(self, card, context)`
 * (skipped while debuffed) -> {enhancement, seal} results, or undefined.
 */
export function mod_card_calculate(card, context) {
  if (card.debuff || card.ability.set === 'Joker') return undefined;
  let out;
  const ec = card.config.center;
  if (ec && ec.mod && ec.set === 'Enhanced' && ec.calculate) { const r = ec.calculate(ec, card, context); if (r) (out = out || {}).enhancement = r; }
  const sc = card.seal && P_SEALS[card.seal];
  if (sc && sc.mod && sc.calculate) { const r = sc.calculate(sc, card, context); if (r) (out = out || {}).seal = r; }
  return out;
}
/** Merge a mod enhancement / seal scoring return into eval_card's playing-card result. */
function merge_mod_card_effect(ret, ms, held) {
  for (const r of ms ? [ms.enhancement, ms.seal] : []) {
    if (!r || typeof r !== 'object') continue;
    const x = r.x_mult ?? r.xmult ?? r.Xmult;
    if (x !== undefined && x !== 1) ret.x_mult = ret.x_mult ? ret.x_mult * x : x;
    const m = held ? (r.h_mult ?? r.mult) : r.mult;
    if (m) ret[held ? 'h_mult' : 'mult'] = (ret[held ? 'h_mult' : 'mult'] || 0) + m;
    const c = held ? (r.h_chips ?? r.chips) : r.chips;
    if (c) ret[held ? 'h_chips' : 'chips'] = (ret[held ? 'h_chips' : 'chips'] || 0) + c;
    if (r.dollars) ret.dollars = (ret.dollars || 0) + r.dollars;
    // SMODS x_chips (MoreFluff's Teal Card: X1.5 Chips while held).
    const xc = r.x_chips ?? r.xchips ?? r.Xchip_mod;
    if (xc !== undefined && xc !== 1) ret.x_chips = ret.x_chips ? ret.x_chips * xc : xc;
    // SMODS p_dollars on a scored card (AutumnCircus' Jewel Card), and the rest of a full SMODS effect —
    // message / func / extra — evaluated after the card's own effects (run.js post_effects).
    if (!held && r.p_dollars) ret.p_dollars = (ret.p_dollars || 0) + r.p_dollars;
    if (r.message || typeof r.func === 'function' || (r.extra && typeof r.extra === 'object')) {
      (ret.post_effects = ret.post_effects || []).push({ message: r.message, colour: r.colour, card: r.card, func: r.func, extra: r.extra });
    }
  }
}

export function eval_card(card, context) {
  context = context || {};
  const ret = {};
  if (context.repetition_only) {
    const seals = card.calculate_seal(context);
    if (seals) ret.seals = seals;
    const ms = ACTIVE_MODS.length ? mod_card_calculate(card, context) : undefined;
    if (!ret.seals && ms && ms.seal && ms.seal.repetitions) ret.seals = ms.seal;
    // A mod ENHANCEMENT's repetitions add to the seal's (MoreFluff's Brass Card: 2 more).
    const er = ms && ms.enhancement && ms.enhancement.repetitions;
    if (er) ret.seals = ret.seals ? { ...ret.seals, repetitions: (ret.seals.repetitions || 0) + er } : ms.enhancement;
    // A mod's own-card retriggers add up the same way (BETMMA's Omnicard Wild Cards, Mirror's queued ones).
    if (ACTIVE_MODS.length) {
      for (const r of callHook('card_repetitions', card, context)) {
        for (const x of [].concat(r)) if (x && x.repetitions) ret.seals = ret.seals ? { ...ret.seals, repetitions: (ret.seals.repetitions || 0) + x.repetitions } : x;
      }
    }
    return ret;
  }
  if (context.cardarea === G.play) {
    const chips = card.get_chip_bonus(); if (chips > 0) ret.chips = chips;
    const mult = card.get_chip_mult(); if (mult > 0) ret.mult = mult;
    const x_mult = card.get_chip_x_mult(context); if (x_mult > 0) ret.x_mult = x_mult;
    const p_dollars = card.get_p_dollars(); if (p_dollars > 0) ret.p_dollars = p_dollars;
    const jokers = card.calculate_joker(context); if (jokers) ret.jokers = jokers;
    const edition = card.get_edition(context); if (edition) ret.edition = edition;
    if (ACTIVE_MODS.length) merge_mod_card_effect(ret, mod_card_calculate(card, { ...context, main_scoring: true }), false);
  }
  if (context.cardarea === G.hand) {
    const h_mult = card.get_chip_h_mult(); if (h_mult > 0) ret.h_mult = h_mult;
    const h_x_mult = card.get_chip_h_x_mult(); if (h_x_mult > 0) ret.x_mult = h_x_mult;
    const jokers = card.calculate_joker(context); if (jokers) ret.jokers = jokers;
    if (ACTIVE_MODS.length) merge_mod_card_effect(ret, mod_card_calculate(card, { ...context, main_scoring: true }), true);
  }
  // Steamodded quantum enhancements: the config effects of extra enhancements mod jokers grant.
  if ((context.cardarea === G.play || context.cardarea === G.hand) && ACTIVE_MODS.length && !card.debuff) {
    for (const k of quantum_enhancements(card)) {
      const q = P_CENTERS[k].config || {};
      if (context.cardarea === G.play && k === 'm_lucky') {
        // SMODS scores a quantum enhancement as that enhancement, so a quantum Lucky card ROLLS
        // like a real one (1 in 5 Mult, 1 in 15 money) — Milatro's Butterfly Effect.
        if (probability_roll(card, 'lucky_mult', 1, 5)) { card.lucky_trigger = true; ret.mult = (ret.mult || 0) + q.mult; }
        if (probability_roll(card, 'lucky_money', 1, 15)) { card.lucky_trigger = true; ret.p_dollars = (ret.p_dollars || 0) + q.p_dollars; }
      } else if (context.cardarea === G.play) {
        if (q.bonus) ret.chips = (ret.chips || 0) + q.bonus;
        if (q.mult) ret.mult = (ret.mult || 0) + q.mult;
        if (q.Xmult && q.Xmult !== 1) ret.x_mult = (ret.x_mult || 1) * q.Xmult;
        if (q.p_dollars) ret.p_dollars = (ret.p_dollars || 0) + q.p_dollars;
      } else {
        if (q.h_mult) ret.h_mult = (ret.h_mult || 0) + q.h_mult;
        if (q.h_x_mult) ret.x_mult = (ret.x_mult || 1) * q.h_x_mult;
      }
    }
  }
  // Mods acting on a played / held card's main scoring (lovely "main scoring on played/held cards"
  // targets; BETMMA's Mirror, Real Random, Echo Chamber) — they may add to ret.
  if (ACTIVE_MODS.length && (context.cardarea === G.play || context.cardarea === G.hand) && !context.repetition &&
      (card.ability.set === 'Default' || card.ability.set === 'Enhanced')) callHook('eval_card', card, context, ret);
  if (context.cardarea === G.jokers || context.card === G.consumeables) {
    let jokers;
    if (context.edition) jokers = card.get_edition(context);
    else if (context.other_joker) jokers = context.other_joker.calculate_joker(context);
    else jokers = card.calculate_joker(context);
    if (jokers) ret.jokers = jokers;
  }
  // A mod may change an evaluation's amounts (a Steamodded SMODS.calculate_individual_effect wrap: More Fluff's Apple
  // Friends doubles every +Chips / +Mult). Only while an active mod defines the hook.
  if (ACTIVE_MODS.length) callHook('eval_card_result', card, context, ret);
  return ret;
}

/**
 * Steamodded quantum enhancements (SMODS optional_features.quantum_enhancements): the extra
 * enhancement keys mod jokers grant `card` by answering the check_enhancement context with
 * {m_steel = true, ...}. Only centers that declare it are asked: `quantum_enhancements: true` on the
 * joker / consumable center that grants the extra enhancement (an explicit flag — nothing is inferred
 * from source text); nested checks see only real enhancements.
 */
let _quantum_busy = false;
export function quantum_enhancements(card) {
  const out = [];
  if (_quantum_busy || !ACTIVE_MODS.length || !G.jokers || !card || !card.config || !card.base || !card.base.suit) return out;
  _quantum_busy = true;
  try {
    // (SMODS asks every joker-type area: mod consumables too — AutumnCircus' enhancement potions)
    for (const j of G.consumeables ? G.jokers.cards.concat(G.consumeables.cards) : G.jokers.cards) {
      const c = j.config.center;
      if (!c.mod || !c.calculate || j.debuff) continue;
      if (!c.quantum_enhancements) continue;
      const r = c.calculate(c, j, { check_enhancement: true, other_card: card, no_blueprint: true });
      if (r && typeof r === 'object') {
        for (const [k, v] of Object.entries(r)) if (v === true && P_CENTERS[k] && P_CENTERS[k].set === 'Enhanced' && k !== card.config.center.key && !out.includes(k)) out.push(k);
      }
    }
  } finally { _quantum_busy = false; }
  return out;
}

/**
 * SMODS.calculate_context evaluation of a MOD card's return in a vanilla context whose return
 * the base game ignores (setting_blind, pre_discard, using_consumeable, first_hand_drawn, playing_card_added,
 * remove_playing_cards, buying_card, selling_card, selling_self, open_booster, skipping_booster, skip_blind,
 * reroll_shop, ending_shop): SMODS shows those returns like any other. message, level_up
 * (`level_up_hand` or 1 level), then dollars / func / extra. A no-op for base-game cards.
 */
export function mod_context_effect(card, eff, context) {
  if (!eff || typeof eff !== 'object' || !card || !(card.config.center.mod || eff._mod)) return; // (eff._mod: a mod joker's return copied by Blueprint / Brainstorm)
  if (eff.message) card_eval_status_text(eff.message_card || card, 'extra', null, null, null, eff);
  if (eff.level_up) {
    const h = eff.level_up_hand || (context && context.scoring_name);
    if (h && G.GAME.hands[h]) level_up_hand(eff.card || card, h, null, eff.level_up === true ? 1 : eff.level_up);
  }
  mod_effect_tail(card, eff, { dollars: true });
}

/**
 * Steamodded's calculate_effect extras for a MOD card's return value, in the places where
 * vanilla only shows the text: `func()` runs, `extra` shows its own message and runs its
 * func (recursively), and `dollars` pays out where the vanilla pass ignores it. A no-op for
 * base-game cards, so vanilla scoring is untouched.
 */
export function mod_effect_tail(card, eff, opts = {}) {
  if (!eff || typeof eff !== 'object' || !card || !(card.config.center.mod || eff._mod)) return; // (eff._mod: a mod joker's return copied by Blueprint / Brainstorm)
  if (opts.dollars && eff.dollars) { ease_dollars(eff.dollars); card_eval_status_text(eff.card || card, 'dollars', eff.dollars); }
  if (typeof eff.func === 'function') eff.func();
  let x = eff.extra, guard = 0;
  while (x && typeof x === 'object' && guard++ < 10) {
    if (x.message) card_eval_status_text(x.message_card || x.focus || card, 'extra', null, null, null, x);
    if (x.dollars) { ease_dollars(x.dollars); card_eval_status_text(x.message_card || card, 'dollars', x.dollars); }
    if (typeof x.func === 'function') x.func();
    x = x.extra;
  }
}
/**
 * The quantum half of SMODS.has_enhancement(card, key): true when an enabled mod grants `card` the
 * extra enhancement `key` (its own enhancement is the caller's vanilla check). Always false with no
 * mods on, so vanilla code paths stay exactly the base game's.
 */
export function has_quantum_enhancement(card, key) {
  return ACTIVE_MODS.length > 0 && quantum_enhancements(card).includes(key);
}

/** The enhancements a "random Enhancement" pick may roll (Familiar / Grim / Incantation, a mod's random
 *  enhance): P_CENTER_POOLS.Enhanced less any center whose in_pool says no. A mod's special enhancement
 *  (Pokermon's Flower and Hazard, `in_pool() { return false }`) comes only from its own source — Familiar
 *  made Flower face cards that nobody could explain. Vanilla centers have no in_pool: unchanged rolls. */
export function enhancement_pool() {
  return (P_CENTER_POOLS.Enhanced || []).filter((v) => !(v.in_pool && !v.in_pool(v, { type: 'Enhanced' })));
}
/** SMODS.poll_object_allow_duplicates (only poll_object's Booster pools set it): pools ignore used_jokers. */
let poll_allow_dup = false;
export function set_poll_allow_duplicates(v) { poll_allow_dup = !!v; }
export function get_current_pool(_type, _rarity, _legendary, _append) {
  if (SET_ALIASES[_type]) _type = resolve_set(_type); // (Pokermon 3.9.1's poke_energy / poke_item)
  const _pool = [];
  let _starting_pool, _pool_key = '', _pool_size = 0;
  if (_type === 'Joker') {
    let rarity = _rarity ?? pseudorandom('rarity' + G.GAME.round_resets.ante + (_append || ''));
    // SMODS.poll_rarity when an active mod rarity can be rolled (weight > 0: AutumnCircus' Homestuck rarities):
    // Common 0.7 / Uncommon 0.25 / Rare 0.05 / Legendary 0 + the mod rarities, normalised, in that order.
    let polled;
    if (_rarity == null && !_legendary && ACTIVE_MODS.length) polled = poll_joker_rarity(rarity);
    // Steamodded: a rarity KEY (mod rarity such as 'poke_safari') picks that pool directly.
    if (polled !== undefined) rarity = polled;
    else if (typeof rarity === 'string') rarity = _legendary ? 4 : rarity;
    else rarity = (_legendary && 4) || (rarity > 0.95 && 3) || (rarity > 0.7 && 2) || 1;
    _starting_pool = P_JOKER_RARITY_POOLS[rarity] || [];
    _pool_key = 'Joker' + rarity + ((!_legendary && _append) || '');
  } else if (CONSUMABLE_TYPES[_type] && CONSUMABLE_TYPES[_type].rarities && ACTIVE_MODS.length) {
    // SMODS.ConsumableType with rarities (AutumnMoodMechanics' Oddities): roll a rarity (SMODS.poll_rarity) and
    // draw from that rarity's pool; `_legendary` asks for the top rarity (`legendary_rarity`).
    const T = CONSUMABLE_TYPES[_type];
    let rarity;
    if (_legendary && T.legendary_rarity !== undefined) { rarity = T.legendary_rarity; _pool_key = T.legendary_pool_key || (_type + rarity); }
    else { rarity = _rarity ?? poll_type_rarity(T, 'rarity' + _type + G.GAME.round_resets.ante + (_append || '')); _pool_key = _type + rarity; }
    _starting_pool = (P_CENTER_POOLS[_type] || []).filter((v) => v.rarity === rarity);
    _pool_key = _pool_key + (_append || '');
  } else {
    _starting_pool = P_CENTER_POOLS[_type];
    _pool_key = _type + (_append || '');
  }
  // (a custom deck may allow duplicates: Deck Creator's allow_duplicate_jokers)
  const showman = poll_allow_dup || find_joker('Showman').length > 0 || (ACTIVE_MODS.length > 0 && callHook('pool_duplicates', _type).includes(true));
  for (const v of _starting_pool) {
    let add = false;
    if (_type === 'Enhanced') add = true;
    // (SMODS: the Edition pool — only SMODS.poll_object asks for it — holds the shop editions)
    else if (_type === 'Edition') add = !!(v.mod ? v.in_shop : ['e_foil', 'e_holo', 'e_polychrome', 'e_negative'].includes(v.key));
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
        for (const vv of G.playing_cards) if (vv.config.center.key === v.enhancement_gate || has_quantum_enhancement(vv, v.enhancement_gate)) add = true;
      } else add = true;
      if (v.name === 'Black Hole' || v.name === 'The Soul' || v.hidden) {
        // (a custom deck may let The Soul / Black Hole into ordinary pools: Deck Creator's allow_soul / allow_black_hole)
        add = ACTIVE_MODS.length > 0 && (v.name === 'Black Hole' || v.name === 'The Soul') && callHook('pool_hidden', v, _type).includes(true);
      }
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
    else if (_type === 'Edition') _pool.push('e_foil');
    else if (CONSUMABLE_TYPES[_type] && CONSUMABLE_TYPES[_type].default) _pool.push(CONSUMABLE_TYPES[_type].default);
    else _pool.push(reduceHook('empty_pool_default', 'j_joker', _type));
  }
  return [_pool, _pool_key + (!_legendary ? G.GAME.round_resets.ante : '')];
}

/**
 * The SMODS joker rarity poll with weighted mod rarities (undefined = none active and no rarity mod set: the vanilla
 * thresholds). Each weight is times G.GAME[<rarity key>_mod] (SMODS.poll_rarity: `common_mod`, `rare_mod`, ...,
 * `<mod rarity key>_mod`; More Fluff 1.9.9999's Gem Alert makes Rares X6.7 as common with rare_mod).
 */
const VANILLA_RARITY_MOD = { 1: 'common_mod', 2: 'uncommon_mod', 3: 'rare_mod', 4: 'legendary_mod' };
const rarity_mod = (key) => { const m = G.GAME[VANILLA_RARITY_MOD[key] || String(key).toLowerCase() + '_mod']; return m === undefined || m === null ? 1 : m; };
function poll_joker_rarity(poll) {
  const mods = Object.values(RARITIES).filter((r) => r.mod && centerActive(r) && ((r.get_weight ? r.get_weight(r) : r.weight) || 0) > 0);
  if (!mods.length && [1, 2, 3, 4].every((k) => rarity_mod(k) === 1)) return undefined;
  const avail = [{ key: 1, weight: 0.7 }, { key: 2, weight: 0.25 }, { key: 3, weight: 0.05 }, { key: 4, weight: 0 },
    ...mods.map((r) => ({ key: r.key, weight: r.get_weight ? r.get_weight(r) : r.weight }))];
  for (const r of avail) r.weight = r.weight * rarity_mod(r.key);
  const total = avail.reduce((n, r) => n + r.weight, 0);
  let wi = 0;
  for (const r of avail) { wi += r.weight / total; if (poll < wi) return r.key; }
  return 1;
}

/**
 * SMODS.poll_rarity(_pool_key, _rand_key) over a consumable type's `rarities` [{key, weight}]: weights are
 * normalised (each times G.GAME[<key>_mod] or 1) and the first rarity whose running total passes the roll wins.
 */
export function poll_type_rarity(T, rand_key) {
  const poll = pseudorandom(pseudoseed(rand_key || ('rarity' + G.GAME.round_resets.ante)));
  const avail = T.rarities.map((r) => ({ key: r.key, weight: r.weight * (G.GAME[String(r.key).toLowerCase() + '_mod'] || 1) }));
  const total = avail.reduce((n, r) => n + r.weight, 0);
  let wi = 0;
  for (const r of avail) { wi += r.weight / total; if (poll < wi) return r.key; }
  return null;
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
  // A mod may replace the whole poll (Milatro's Rigged Wheel): an edition table, or null for none.
  if (ACTIVE_MODS.length) { const h = firstHook('poll_edition', _key, _mod, _no_neg, _guaranteed); if (h !== undefined) return h; }
  // Steamodded object_weights: the edition is SMODS.poll_object's (its key -> the edition table)
  if (object_weights()) {
    const _options = (_key === 'wheel_of_fortune' || _key === 'aura') ? ['e_negative', 'e_polychrome', 'e_holo', 'e_foil'] : undefined;
    const k = poll_object({ type: 'Edition', seed: _key, guaranteed: _guaranteed, pool: _options, no_negative: _no_neg, mod: _mod });
    return k && k !== 'e_base' ? { [k.slice(2)]: true } : null;
  }
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
  if (SET_ALIASES[_type]) _type = resolve_set(_type); // (Pokermon 3.9.1's poke_energy / poke_item)
  // A mod may change what is made before anything rolls (AutumnCircus' Collector's Deck: every consumable is an Oddity).
  if (ACTIVE_MODS.length) { const o = firstHook('create_card_type', _type, forced_key, area, key_append); if (o) { _type = o[0]; forced_key = o[1]; } }
  let center = P_CENTERS.b_red;
  const showman = find_joker('Showman').length > 0;
  // A mod may force a soul-like key first (a Lua create_card wrap: Reverie's Reverie spectral), which
  // skips the soul rolls below, as forced_key does in the Lua.
  if (ACTIVE_MODS.length && !forced_key && soulable && !G.GAME.banned_keys.c_soul) {
    const k = firstHook('create_card_key', _type, area, key_append);
    if (k) forced_key = k;
  }
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
  // Steamodded object_weights: the key comes from SMODS.poll_object (weighted, modify_weights)
  if (!forced_key && object_weights()) forced_key = poll_object({ type: _type, guaranteed: true, rarities: legendary ? ['Legendary'] : (_rarity !== undefined && _rarity !== null && _rarity !== false) ? [_rarity] : undefined, append: key_append });
  if (forced_key && !G.GAME.banned_keys[forced_key]) {
    center = P_CENTERS[forced_key];
    _type = center.set !== 'Default' ? center.set : _type;
  } else {
    // A mod may raise the rarity roll first (Bunco's Doorhanger: no Commons).
    if (ACTIVE_MODS.length) _rarity = reduceHook('create_card_rarity', _rarity, _type, area, key_append);
    const [_pool, _pool_key] = get_current_pool(_type, _rarity, legendary, key_append);
    let [c] = pseudorandom_element(_pool, pseudoseed(_pool_key));
    let it = 1;
    while (c === 'UNAVAILABLE') { it++; [c] = pseudorandom_element(_pool, pseudoseed(_pool_key + '_resample' + it)); }
    center = P_CENTERS[c];
  }
  const front = (_type === 'Base' || _type === 'Enhanced') ? (SEAM_STATE.create_front || pseudorandom_element(P_CARDS_LIST(), pseudoseed('front' + (key_append || '') + G.GAME.round_resets.ante))[0]) : undefined;
  const card = new Card(front, center, { discover: area === G.jokers || area === G.consumeables });
  if (_type === 'Joker') {
    // (Bunco: a joker with one of its stickers never gets Eternal here — block_eternal)
    const eternal_ok = () => !(ACTIVE_MODS.length && callHook('block_eternal', card).includes(true));
    if (G.GAME.modifiers.all_eternal && eternal_ok()) card.set_eternal(true);
    if (area === G.shop_jokers || area === G.pack_cards) {
      // Mod shop stickers roll first (Bunco's Cyan / Pink / Magenta stakes).
      if (ACTIVE_MODS.length) callHook('shop_joker_stickers', card, area);
      const poll = pseudorandom((area === G.pack_cards ? 'packetper' : 'etperpoll') + G.GAME.round_resets.ante);
      if (G.GAME.modifiers.enable_eternals_in_shop && poll > 0.7) { if (eternal_ok()) card.set_eternal(true); }
      else if (G.GAME.modifiers.enable_perishables_in_shop && poll > 0.4 && poll <= 0.7) card.set_perishable(true);
      if (G.GAME.modifiers.enable_rentals_in_shop && pseudorandom((area === G.pack_cards ? 'packssjr' : 'ssjr') + G.GAME.round_resets.ante) > 0.7) card.set_rental(true);
    }
    // SMODS: a card that already has an edition (set by its center's set_ability, e.g. Pokermon's Shell) keeps it.
    if (!card.edition) card.set_edition(poll_edition('edi' + (key_append || '') + G.GAME.round_resets.ante), true, true);
  }
  callHook('create_card', card, _type, area, key_append);
  return card;
}
/** G.P_CARDS without the synthetic `empty` entry, as an object keyed like Lua. */
let _pcards;
export function P_CARDS_LIST() {
  if (!_pcards) { _pcards = {}; for (const [k, v] of Object.entries(P_CARDS)) if (k !== 'empty' && !v.mod) _pcards[k] = v; }
  // Mod suits (SMODS pool.toml): their cards join the pick only while the suit's in_pool allows it.
  if (ACTIVE_MODS.length) {
    const extra = activeModSuits().filter((s) => !s.in_pool || s.in_pool(s, {}));
    if (extra.length) {
      const out = { ..._pcards };
      for (const [k, v] of Object.entries(P_CARDS)) if (v.mod && extra.some((s) => s.key === v.suit)) out[k] = v;
      return out;
    }
  }
  return _pcards;
}
/** The registry changed P_CARDS (mod suits on / off). */
export function reset_p_cards_list() { _pcards = null; }

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
  // Lua: set_edition(other.edition or {}, nil, true) — {} (not nil) when there is none.
  if (!strip_edition) new_card.set_edition(other.edition ? { [other.edition.type]: true } : {}, null, true);
  new_card.set_seal(other.seal, true);
  if (other.params) { new_card.params = { ...other.params, playing_card }; }
  new_card.debuff = other.debuff;
  new_card.pinned = other.pinned;
  if (playing_card) new_card.playing_card = playing_card;
  if (ACTIVE_MODS.length) callHook('copy_card', new_card, other);
  return new_card;
}

export function calculate_reroll_cost(skip_increment) {
  const cr = G.GAME.current_round;
  if (cr.free_rerolls < 0) cr.free_rerolls = 0;
  if (cr.free_rerolls > 0) cr.reroll_cost = 0;
  else {
    cr.reroll_cost_increase = cr.reroll_cost_increase || 0;
    if (!skip_increment) cr.reroll_cost_increase += 1;
    cr.reroll_cost = (G.GAME.round_resets.temp_reroll_cost ?? G.GAME.round_resets.reroll_cost) + cr.reroll_cost_increase;
  }
  // Mods adjusting the result (a Lua calculate_reroll_cost wrap: Reverie's Cine shops).
  if (ACTIVE_MODS.length) cr.reroll_cost = reduceHook('reroll_cost', cr.reroll_cost);
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
    if (ACTIVE_MODS.length) callHook('new_boss_choice'); // (MoreFluff's Superboss re-picks Small/Big/Boss)
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
  if (object_weights()) { // (Steamodded object_weights: SMODS.poll_object over SMODS.create_blind_pool)
    const b = poll_object({ type: 'Blind', blind_type: 'boss', seed: 'boss' });
    G.GAME.bosses_used[b] = (G.GAME.bosses_used[b] || 0) + 1;
    return b;
  }
  const eligible = {};
  const a1 = Math.max(1, ante);
  for (const [k, v] of Object.entries(P_BLINDS)) {
    if (!v.boss) continue;
    if (v.mod && (!centerActive(v) || (v.in_pool && !v.in_pool(v)))) continue;
    let ok = false;
    if (!v.boss.showdown && v.boss.min <= a1 && (a1 % G.GAME.win_ante !== 0 || ante < 2)) ok = true;
    else if (v.boss.showdown && ante % G.GAME.win_ante === 0 && ante >= 2) ok = true;
    // Mods may change which antes draw showdown bosses (Nacho's Elite stake).
    if (ACTIVE_MODS.length) { const o = firstHook('boss_eligible', ok, v, ante); if (o !== undefined) ok = !!o; }
    if (ok) eligible[k] = true;
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
  // A mod may pick the voucher itself (BETMMA: voucher rarity + weighted fusions, voucher packs' pools).
  if (ACTIVE_MODS.length) { const k = firstHook('next_voucher_key', _from_tag); if (k !== undefined) return k; }
  if (object_weights()) return poll_object({ type: 'Voucher' });
  let [_pool, _pool_key] = get_current_pool('Voucher');
  if (_from_tag) _pool_key = 'Voucher_fromtag';
  let [center] = pseudorandom_element(_pool, pseudoseed(_pool_key));
  let it = 1;
  while (center === 'UNAVAILABLE') { it++; [center] = pseudorandom_element(_pool, pseudoseed(_pool_key + '_resample' + it)); }
  return center;
}
export function get_next_tag_key(append) {
  if (G.FORCE_TAG) return G.FORCE_TAG;
  if (object_weights()) return poll_object({ type: 'Tag', append });
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
  if (object_weights()) { // (Steamodded object_weights: SMODS.poll_object over the Booster pool, `kind` filtered)
    const k = poll_object({
      type: 'Booster', seed: (_key || 'pack_generic') + G.GAME.round_resets.ante,
      filter: _type ? (pool) => {
        let all_unavailable = true;
        for (const v of pool) { if (!P_CENTERS[v.key] || P_CENTERS[v.key].kind !== _type) v.key = 'UNAVAILABLE'; else all_unavailable = false; }
        if (all_unavailable) pool.push({ key: 'p_buffoon_normal_1', type: 'Booster' });
        return pool;
      } : undefined,
    });
    const pc = P_CENTERS[k];
    return ACTIVE_MODS.length ? reduceHook('get_pack', pc, _key, _type) : pc;
  }
  let cume = 0, it = 0, center;
  // Lua `v.weight or 1` (a weight of 0 stays 0); mod packs may also refuse via in_pool.
  const ok = (v) => !G.GAME.banned_keys[v.key] && !(v.mod && v.in_pool && !v.in_pool(v, { type: 'Booster' }));
  // (SMODS: a mod pack's get_weight() — Bunco's Arcade Machine makes Virtual Packs 4X likelier)
  const wt = (v) => ((v.mod && v.get_weight) ? v.get_weight(v) : (v.weight ?? 1));
  for (const v of P_CENTER_POOLS.Booster) if ((!_type || _type === v.kind) && ok(v)) cume += wt(v);
  const poll = pseudorandom(pseudoseed((_key || 'pack_generic') + G.GAME.round_resets.ante)) * cume;
  for (const v of P_CENTER_POOLS.Booster) {
    if (ok(v)) {
      if (!_type || _type === v.kind) it += wt(v);
      if (it >= poll && it - wt(v) <= poll) { center = v; break; }
    }
  }
  // Mods may swap the pack (a Lua get_pack wrap: Reverie's Cine shops keep their pack kinds).
  return ACTIVE_MODS.length ? reduceHook('get_pack', center, _key, _type) : center;
}

export function get_blind_amount(ante) {
  const amount = base_blind_amount(ante);
  // Mods may change every blind's requirement (BETMMA's Collector: -4% per voucher redeemed).
  return ACTIVE_MODS.length ? reduceHook('blind_amount', amount, ante) : amount;
}
function base_blind_amount(ante) {
  const k = 0.75;
  const tables = {
    1: [300, 800, 2000, 5000, 11000, 20000, 35000, 50000],
    2: [300, 900, 2600, 8000, 20000, 36000, 60000, 100000],
    3: [300, 1000, 3200, 9000, 25000, 60000, 110000, 200000],
  };
  // Steamodded (stake.toml): any other scaling (MoreFluff's Superboss: +3) uses SMODS.get_blind_amount.
  const sc = G.GAME.modifiers.scaling;
  if (sc && !tables[sc]) return smods_blind_amount(ante, sc);
  const amounts = tables[G.GAME.modifiers.scaling || 1] || tables[1];
  if (ante < 1) return 100;
  if (ante <= 8) return amounts[ante - 1];
  const a = amounts[7], b = 1.6, c = ante - 8, d = 1 + 0.2 * (ante - 8);
  let amount = Math.floor(a * Math.pow(b + Math.pow(k * c, d), c));
  if (!isFinite(amount)) return big_blind_amount(amount, a, b, k * c, c, d);
  amount = amount - amount % Math.pow(10, Math.floor(Math.log10(amount) - 1));
  return amount;
}
/**
 * An endless-ante requirement past the double range: the same formula a * (b + kc^d)^c in Decimals
 * (big-number scoring, every run), kept to 2 significant digits; past 9.99e999 it's Infinity (naneinf).
 */
function big_blind_amount(inf, a, b, kc, c, d) {
  if (!B.bigOn() || inf !== inf) return inf;
  const amount = B.floor(B.mul(a, B.pow(B.add(b, B.pow(kc, d)), c)));
  if (!B.isBig(amount)) return isFinite(amount) ? amount - amount % Math.pow(10, Math.floor(Math.log10(amount) - 1)) : amount;
  return new B.Decimal(Math.floor(amount.m * 10) / 10, amount.e);
}
/** SMODS.get_blind_amount(ante) (src/utils.lua) for a scaling outside 1..3. */
function smods_blind_amount(ante, scale) {
  const amounts = [
    300, 700 + 100 * scale, 1400 + 600 * scale, 2100 + 2900 * scale, 15000 + 5000 * scale * Math.log(scale),
    12000 + 8000 * (scale + 1) * (0.4 * scale), 10000 + 25000 * (scale + 1) * Math.pow(scale / 4, 2),
    50000 * Math.pow(scale + 1, 2) * Math.pow(scale / 7, 2),
  ];
  if (ante < 1) return 100;
  if (ante <= 8) { const v = amounts[ante - 1]; return v - v % Math.pow(10, Math.floor(Math.log10(v) - 1)); }
  const a = amounts[7], b = amounts[7] / amounts[6], c = ante - 8, d = 1 + 0.2 * (ante - 8);
  let amount = Math.floor(a * Math.pow(b + Math.pow(b * 0.75 * c, d), c));
  if (!isFinite(amount)) return big_blind_amount(amount, a, b, b * 0.75 * c, c, d);
  amount = amount - amount % Math.pow(10, Math.floor(Math.log10(amount) - 1));
  return amount;
}

export function number_format(num) {
  if (num === undefined || num === null) return '0';
  if (B.isBig(num)) return B.formatBig(num); // (big-number scoring: "1.234e450")
  if (!isFinite(num)) return num > 0 ? 'naneinf' : '-naneinf';
  if (Math.abs(num) >= 1e11) {
    const e = Math.floor(Math.log10(Math.abs(num)));
    return (num / Math.pow(10, e)).toFixed(3) + 'e' + e;
  }
  return Math.floor(num).toLocaleString('en-US');
}

export function mod_chips(c) {
  if (ACTIVE_MODS.length) c = reduceHook('mod_chips', c); // (BETMMA's Round Up; before the vanilla cap, like the Lua wrap)
  return G.GAME.modifiers.chips_dollar_cap ? B.min(c, Math.max(G.GAME.dollars, 0)) : c;
}
export function mod_mult(m) { return ACTIVE_MODS.length ? reduceHook('mod_mult', m) : m; }

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
    else if (card.config.center.set === 'Planet') G.GAME.consumeable_usage_total.planet = (G.GAME.consumeable_usage_total.planet || 0) + 1;
    else if (card.config.center.set === 'Spectral') G.GAME.consumeable_usage_total.spectral = (G.GAME.consumeable_usage_total.spectral || 0) + 1;
    // Steamodded (center.toml "tracking custom consumable usage"): every other set counts under its lower-cased name
    // (Pokermon's Item -> `item`: Rellor / Rabsca). Base-game consumables are only the three sets above.
    else if (card.config.center.set) { const k = card.config.center.set.toLowerCase(); G.GAME.consumeable_usage_total[k] = (G.GAME.consumeable_usage_total[k] || 0) + 1; }
    if (card.config.center.set === 'Tarot' || card.config.center.set === 'Planet') G.GAME.consumeable_usage_total.tarot_planet = (G.GAME.consumeable_usage_total.tarot_planet || 0) + 1;
    G.GAME.consumeable_usage_total.all = (G.GAME.consumeable_usage_total.all || 0) + 1;
  }
}
export function set_hand_usage(hand) {
  const u = G.GAME.hand_usage;
  u[hand] = u[hand] || { count: 0, order: hand };
  u[hand].count += 1;
}
