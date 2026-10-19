/**
 * Nuzlocke + Monotype run badges (a Micatro addition for Pokermon runs; no Lua original).
 * They are tracked automatically for every Pokermon run and EARNED by winning (beating the ante-8 boss)
 * while still intact. The state lives in G.GAME.run_badges, so it is part of the run itself: a save is a
 * recipe that replays to the same state, and replays / spectators get it in the view (view.run_badges).
 *
 * Nuzlocke — broken by
 *   * SELLING a joker (the player's 'sell' action: Card:sell_card). Destroyed jokers (Nightmare, a joker
 *     eating another, perishable expiry, fainting) never break it.
 *   * gaining a 2nd NEW joker in one "shop window". A window runs from one blind's start (new_round,
 *     i.e. pressing Select) to the next blind's start, so it holds that blind, its cash-out, the shop after it
 *     and its packs, and any tags/skips on the next blind select. The first window is run start -> the first
 *     blind. A joker gained DURING a blind (Riff-raff on setting_blind, Judgement used mid-round) is that
 *     blind's window's one.
 *   * gaining a joker WITHOUT a Pokémon type (a base-game joker, a non-Pokémon mod joker, a type outside
 *     Pokermon's 12), by any means ("gained a non-Pokémon joker (Joker)").
 * Gaining a NEW joker = a Joker-set card entering G.jokers for the first time, however it got there: bought,
 * picked from a pack, made by a tag (Top-up, Buffoon pack), or created by a card (Poké/Great/Ultra/Master
 * Ball, Judgement, Wraith, Riff-raff, The Soul) or copied as a new card (Ankh, Invisible Joker). Evolution,
 * Ditto's transformation and Tera / type changes are the SAME card (Pokermon's poke_evolve swaps the center
 * in place), so they are not new jokers. Starting jokers (a custom deck's) don't use the first window's one.
 *
 * Monotype (owner rule 2026-10-18, revised 2026-10-19) — checked ONLY when a blind starts (new_round), never when
 * a joker is gained: buying a wrong-type or non-Pokémon joker is fine if it's gone (sold, used up) before the next blind.
 *   * Each joker's GAINED type is the one it had when gained (Pokermon's get_type then: a Tera sticker, else
 *     ptype), stored on the card as ability.rb_type ('Fire' ..., 'none' for no type, 'any' for a wildcard Tera
 *     like Nacho's Stellar). Evolution and later Tera changes never change it. A COPY (Ankh, Invisible Joker:
 *     copy_card, which copies the ability table, Tera sticker included) inherits its source's gained type: it is
 *     the same Pokémon for Monotype (it is still a new joker for the Nuzlocke).
 *   * A joker MATCHES a type when its gained type OR its current type (get_type now: a Tera sticker, else ptype)
 *     is that type; a wildcard Tera (gained or current) matches every type. So evolving into another type is
 *     safe (the gained type), and Tera-ing a joker to the run’s type makes it count (the current type).
 *   * The type LOCKS at the first blind start with at least one (typed) joker in the row: the first type that
 *     EVERY joker there matches, trying each joker's gained type left to right, then each one's current type
 *     left to right (so a gained type wins a tie). At every later blind start every joker must match the locked
 *     type. A joker with no type either way breaks it ("started a round with Joker (no type)"); so does one
 *     matching neither way ("started a round with Charmander (Fire) in a Water run"; "(Dark/Fire)" when its
 *     gained and current types differ). With no shared type at the first lock, the reason names the first joker
 *     that misses the first candidate type.
 *   * A shop with an off-type joker in the row shows a warning once (event run_badge_warn).
 *   * Zero jokers at every blind start: no lock, so no Monotype win.
 *
 * Once the run is won the badges are frozen (Endless can't lose them). Seeded and challenge runs are
 * tracked but not eligible (like the win stickers: Balatro's win_game gives them none), so the HUD hides them.
 * (Seeded = the player TYPED the seed. A resumed / replayed run keeps its recipe's `seeded` flag — engine/session.js
 * recipeSeeded — never "it has a seed": every recipe has one.)
 */
import { G, LOC, emit } from '../../../js/engine/core.js';
import { MOD_LOC } from '../../../js/mods/registry.js';
import { get_type, wildcard_type, POKETYPES, TYPE_COLOURS } from './types.js';

const st = () => (G.GAME && G.GAME.run_badges) || null;

function joker_name(card) {
  const k = card.config && card.config.center && card.config.center.key;
  const d = (MOD_LOC.descriptions.Joker && MOD_LOC.descriptions.Joker[k]) || (LOC && LOC.descriptions && LOC.descriptions.Joker && LOC.descriptions.Joker[k]);
  const n = (d && d.name) || (card.ability && card.ability.name) || k || 'a joker';
  return String(n).replace(/\{[^}]*\}/g, '');
}

function brk(s, badge, reason) {
  if (!s[badge]) return;
  s[badge] = false;
  s[badge + '_reason'] = reason;
  emit('run_badge', { badge, reason });
}

export const runbadge_hooks = {
  init_game_object(GAME) {
    GAME.run_badges = { nuz: true, mono: true, type: null, nuz_reason: '', mono_reason: '', window: 0, window_gains: 0, gains: 0, ready: false, warned_window: -1 };
  },
  /** The first blind select of the run: everything gained before it is a starting joker. */
  blind_on_deck() { const s = st(); if (s) s.ready = true; },
  /** A blind starts: a new shop window, and the Monotype check of the joker row. */
  new_round() {
    const s = st();
    if (!s) return;
    s.window += 1; s.window_gains = 0;
    if (!G.GAME.won) mono_check(s);
  },
  /** The shop opened: warn (once per shop) when an off-type joker would break Monotype at the next blind. */
  shop_start() { mono_warn(); },
  emplace(area, card) {
    const s = st();
    if (!s || area !== G.jokers || !card || !card.ability || card.ability.set !== 'Joker' || card.rb_seen) return;
    card.rb_seen = true; // (a card property, not ability: evolution / copy_card never carry it)
    if (G.GAME.won) return;
    s.gains += 1;
    const name = joker_name(card);
    if (s.ready) {
      s.window_gains += 1;
      if (s.window_gains > 1) brk(s, 'nuz', `2nd new joker this shop (${name})`);
    }
    const t = gained_type(card);
    // (the type it had when gained: what the Monotype checks read; saved with the card. A copy_card copy arrives with
    //  its source's ability, rb_type included: it keeps that, the source's gained type — owner rule 2026-10-19)
    if (!card.ability.rb_type) card.ability.rb_type = t;
    // (owner rule 2026-10-18: gaining a joker without a Pokémon type breaks the Nuzlocke at once)
    if (t === 'none') brk(s, 'nuz', `gained a non-Pokémon joker (${name})`);
    if (G.STATE === G.STATES.SHOP || (G.STATES && [G.STATES.BUFFOON_PACK, G.STATES.MOD_PACK, G.STATES.MOD_PACK_HAND, G.STATES.TAROT_PACK, G.STATES.SPECTRAL_PACK, G.STATES.STANDARD_PACK, G.STATES.PLANET_PACK].includes(G.STATE))) mono_warn();
  },
  sell_card(card) {
    const s = st();
    if (!s || G.GAME.won || !card || !card.ability || card.ability.set !== 'Joker' || card.area !== G.jokers) return;
    brk(s, 'nuz', 'sold ' + joker_name(card));
  },
};

/** A card's type right now, as the tracker records it: a Pokermon type, 'any' (a wildcard Tera) or 'none'. */
function gained_type(card) {
  if (wildcard_type(card)) return 'any';
  const t = get_type(card);
  return t && POKETYPES.includes(t) ? t : 'none';
}
/** The type a joker counts as: the one stored when it was gained (a joker that predates the tracker: now). */
const rb_type = (card) => (card.ability && card.ability.rb_type) || gained_type(card);
const row_jokers = () => (G.jokers ? G.jokers.cards.filter((c) => c.ability && c.ability.set === 'Joker') : []);
/** Does a joker match type t at a blind start? Its gained OR its current type (a wildcard either way: any type). */
const matches = (c, t) => { const g = rb_type(c), n = gained_type(c); return g === 'any' || n === 'any' || g === t || n === t; };
/** The types a joker shows in a break reason: 'Fire', 'Dark/Fire' (gained/current) or 'none'. */
function type_label(c) {
  const ts = [rb_type(c), gained_type(c)].filter((x, i, a) => x !== 'none' && x !== 'any' && a.indexOf(x) === i);
  return ts.length ? ts.join('/') : 'none';
}
/** The Monotype verdict for the row now -> {lock, bad: {card, t} | null}. lock: the locked type, or (before the
 *  first lock) the type the row would lock (null: no typed joker). */
function mono_state() {
  const s = st(), row = row_jokers();
  let lock = s.type;
  if (!lock) {
    const cands = [];
    for (const c of row) { const x = rb_type(c); if (POKETYPES.includes(x) && !cands.includes(x)) cands.push(x); }
    for (const c of row) { const x = gained_type(c); if (POKETYPES.includes(x) && !cands.includes(x)) cands.push(x); }
    lock = cands.find((t) => row.every((c) => matches(c, t))) || cands[0] || null;
  }
  for (const c of row) {
    if (!matches(c, lock)) return { lock, bad: { card: c, t: type_label(c) } }; // (no lock: only a wildcard matches)
  }
  return { lock, bad: null };
}
/** The first joker in the row that would break Monotype at a blind start now (null: none would). -> {card, t, lock} */
function off_type() { const m = mono_state(); return m.bad ? { ...m.bad, lock: m.lock } : null; }
function mono_check(s) {
  if (!s.mono) return;
  const m = mono_state();
  if (m.bad) {
    const name = joker_name(m.bad.card);
    brk(s, 'mono', m.bad.t === 'none' ? `started a round with ${name} (no type)` : `started a round with ${name} (${m.bad.t}) in a ${m.lock} run`);
    return;
  }
  // the first blind start with a typed joker locks the type
  if (!s.type && m.lock) s.type = m.lock;
}
function mono_warn() {
  const s = st();
  if (!s || !s.mono || G.GAME.won || s.warned_window === s.window || !off_type()) return;
  s.warned_window = s.window;
  emit('run_badge_warn', { badge: 'mono', text: 'Sell off-type jokers before the next round to keep Monotype' });
}

/** view.run_badges: what the HUD, the win screen and the record read. */
export function runbadge_view() {
  const s = st();
  if (!s) return undefined;
  const eligible = !G.GAME.seeded && !G.GAME.challenge;
  const won = !!G.GAME.won;
  const v = {
    eligible, nuz: !!s.nuz, mono: !!s.mono, type: s.type || null,
    colour: s.type ? TYPE_COLOURS[s.type.toLowerCase()] : null,
    nuz_reason: s.nuz_reason || '', mono_reason: s.mono_reason || '', window_gains: s.window_gains, gains: s.gains,
    mono_at_risk: !!(s.mono && !won && off_type()), // (an off-type joker in the row: Monotype breaks at the next blind)
    stake: G.GAME.stake, won,
  };
  // (earned: the badges this win gives — Monotype needs a locked type)
  if (won && eligible) v.earned = { nuz: !!s.nuz, mono: s.mono && s.type ? s.type : null };
  return v;
}
