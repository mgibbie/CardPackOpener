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
 * Monotype (owner rule 2026-10-18, revised) — checked ONLY when a blind starts (new_round), never when a joker
 * is gained: buying a wrong-type or non-Pokémon joker is fine if it's gone (sold, used up) before the next blind.
 *   * Each joker's type is the one it had WHEN GAINED (Pokermon's get_type then: a Tera sticker, else ptype),
 *     stored on the card as ability.rb_type ('Fire' ..., 'none' for no type, 'any' for a wildcard Tera like
 *     Nacho's Stellar). Evolving into another type (Ursaring -> Ursaluna) and later Tera changes never change it.
 *   * The type LOCKS at the first blind start with at least one (typed) joker in the row; every joker there must
 *     share it. At every later blind start every joker must have the locked type. A joker with no type in the
 *     row at a blind start breaks it ("started a round with Joker (no type)"); so does another type ("started a
 *     round with Charmander (Fire) in a Water run").
 *   * A shop with an off-type joker in the row shows a warning once (event run_badge_warn).
 *   * Zero jokers at every blind start: no lock, so no Monotype win.
 *
 * Once the run is won the badges are frozen (Endless can't lose them). Seeded and challenge runs are
 * tracked but not eligible (like the win stickers: Balatro's win_game gives them none), so the HUD hides them.
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
    card.ability.rb_type = t; // (the type it had when gained: what the Monotype checks read; saved with the card)
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
/** The first joker in the row that would break Monotype at a blind start now (null: none would). -> {card, t, lock} */
function off_type() {
  const s = st();
  let lock = s.type;
  for (const c of row_jokers()) {
    const t = rb_type(c);
    if (t === 'any') continue;
    if (t === 'none') return { card: c, t, lock };
    if (!lock) { lock = t; continue; }
    if (t !== lock) return { card: c, t, lock };
  }
  return null;
}
function mono_check(s) {
  if (!s.mono) return;
  const bad = off_type();
  if (bad) {
    const name = joker_name(bad.card);
    brk(s, 'mono', bad.t === 'none' ? `started a round with ${name} (no type)` : `started a round with ${name} (${bad.t}) in a ${bad.lock} run`);
    return;
  }
  // the first blind start with a typed joker locks the type
  if (!s.type) { const c = row_jokers().find((x) => rb_type(x) !== 'any'); if (c) s.type = rb_type(c); }
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
