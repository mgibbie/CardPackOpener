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
 *     Pokermon's 12), by any means the player gains one (below) ("gained a non-Pokémon joker (Joker)"). By its gained
 *     type: an Ankh copy of a Pokémon-made Grass banana is a Grass gain.
 * Gaining a NEW joker = a Joker-set card entering G.jokers for the first time that the PLAYER bought or took:
 * bought, picked from a pack, made by a tag (Top-up, Buffoon pack), created by a consumable (Poké/Great/Ultra/
 * Master Ball, Judgement, Wraith, The Soul) or by a non-Pokémon joker (Riff-raff, Invisible Joker), or copied as
 * a new card that way (Ankh). Evolution, Ditto's transformation and Tera / type changes are the SAME card
 * (Pokermon's poke_evolve swaps the center in place), so they are not new jokers. Starting jokers (a custom
 * deck's) don't use the first window's one.
 *   * A joker MADE BY A POKÉMON JOKER'S OWN EFFECT (owner rule 2026-10-21) is not a gain at all: it neither uses the
 *     window's one nor breaks the Nuzlocke as a non-Pokémon joker. Tropius's Gros Michel / Cavendish, Delibird's Gift
 *     Card, Mew's random joker, Corsola's Water joker, Dragapult's Dreepy Darts, Mewtwo's copy, Nincada's Shedinja,
 *     Audino's Mystery Egg (the list: tests/mods/runbadges_test.mjs "made by a Pokémon"). That includes a Pokémon it
 *     makes (of any type: it still counts for the Monotype by its own type). "A Pokémon's own effect" = the joker is
 *     the ACTING card (js/engine/core.js acting_card): its calculate, dollar bonus, add / remove, the {func}s its
 *     calculate returns and the events any of those queued, including as a Blueprint / Brainstorm copy's target. A
 *     consumable being used and a tag applying are never a joker's effect, even when a Pokémon made or used them; a
 *     non-Pokémon joker (Riff-raff, the Ruins of Alph, Oologist, a Tera'd vanilla joker) is not a Pokémon. Such a
 *     joker carries ability.rb_made_by (its maker's key), saved with it.
 *
 * Monotype (owner rule 2026-10-18, revised 2026-10-19 and 2026-10-21) — checked ONLY when a round BEGINS, never when
 * a joker is gained: buying a wrong-type or non-Pokémon joker is fine if it's gone (sold, used up) before the next round.
 *   * "A round begins" = the round's first hand is dealt (run.js DRAW_TO_HAND, the draw_from_deck_to_hand hook), i.e.
 *     once EVERY blind-select effect has resolved: the jokers' setting_blind loop, blind_calculate, and the events
 *     they queued (the destroys and their removals: pump() flushes the whole queue before the DRAW_TO_HAND state
 *     runs). So a joker destroyed at blind select (Scyther / Scizor / Kleavor / Carvanha / Sharpedo / Rotom Fan /
 *     Ceremonial Dagger slicing the joker to their right, Madness, ...) is gone and can't break it, and a joker
 *     CREATED at blind select (Riff-raff's Commons) is in the row and is checked that same round. (Until
 *     2026-10-21 the check ran in new_round's hook, BEFORE the setting_blind loop: tester Jack's Grass run broke on a
 *     joker his Scyther was about to slice.) Shop-phase jokers are never checked. Once per round (checked_window).
 *   * Each joker's GAINED type is the one it had when gained (Pokermon's get_type then: a Tera sticker, else
 *     ptype), stored on the card as ability.rb_type ('Fire' ..., 'none' for no type, 'any' for a wildcard Tera
 *     like Nacho's Stellar). Evolution and later Tera changes never change it. A COPY (Ankh, Invisible Joker:
 *     copy_card, which copies the ability table, Tera sticker included) inherits its source's gained type: it is
 *     the same Pokémon for Monotype (it is still a new joker for the Nuzlocke, unless a Pokémon's effect made it).
 *   * A joker WITHOUT a type made by a Pokémon joker's own effect (above: Tropius's bananas) is gained as its maker's
 *     type (owner rule 2026-10-21): the run's locked type when the maker matches it, else the maker's gained type. A
 *     Pokémon made that way keeps its own type, and a copy keeps its source's.
 *   * A joker MATCHES a type when its gained type OR its current type (get_type now: a Tera sticker, else ptype)
 *     is that type; a wildcard Tera (gained or current) matches every type. So evolving into another type is
 *     safe (the gained type), and Tera-ing a joker to the run’s type makes it count (the current type).
 *   * The type LOCKS at the first round start with at least one (typed) joker in the row: the first type that
 *     EVERY joker there matches, trying each joker's gained type left to right, then each one's current type
 *     left to right (so a gained type wins a tie). At every later round start every joker must match the locked
 *     type. A joker with no type either way breaks it ("started a round with Joker (no type)"); so does one
 *     matching neither way ("started a round with Charmander (Fire) in a Water run"; "(Dark/Fire)" when its
 *     gained and current types differ). With no shared type at the first lock, the reason names the first joker
 *     that misses the first candidate type.
 *   * A shop with an off-type joker in the row shows a warning once (event run_badge_warn), and the view flags it
 *     (mono_at_risk). Both PREDICT the next check: a joker that a known blind-select slicer will destroy (the
 *     "destroy the joker to the right" jokers above: SLICERS) is left out. Random or conditional blind-select
 *     effects (Madness's random victim, A Billion Lions, Riff-raff's new Commons) are not predicted: the warning may
 *     show for a joker Madness then eats, and a Riff-raff Common of another type gets no warning.
 *   * Zero jokers at every round start: no lock, so no Monotype win.
 *   * A joker whose type comes from the weather (owner rule 2026-10-27: Castform, center.poke_mono_exempt) is left out of every
 *     Monotype check: it never breaks the run, never locks the type and never shows the shop warning, whatever form it is in.
 *     (The Nuzlocke reads it as usual: it is a typed — Colorless — gain.)
 *
 * Once the run is won the badges are frozen (Endless can't lose them). Seeded and challenge runs are
 * tracked but not eligible (like the win stickers: Balatro's win_game gives them none), so the HUD hides them.
 * (Seeded = the player TYPED the seed. A resumed / replayed run keeps its recipe's `seeded` flag — engine/session.js
 * recipeSeeded — never "it has a seed": every recipe has one.)
 */
import { G, LOC, emit, acting_card } from '../../../js/engine/core.js';
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
    GAME.run_badges = { nuz: true, mono: true, type: null, nuz_reason: '', mono_reason: '', window: 0, window_gains: 0, gains: 0, ready: false, warned_window: -1, checked_window: 0 };
  },
  /** The first blind select of the run: everything gained before it is a starting joker. */
  blind_on_deck() { const s = st(); if (s) s.ready = true; },
  /** A blind starts (new_round, before the setting_blind loop): a new shop window. (The Monotype check waits for
   *  the round's first hand: round_begin.) */
  new_round() {
    const s = st();
    if (!s) return;
    s.window += 1; s.window_gains = 0;
  },
  /** The draw_from_deck_to_hand hook: the round's FIRST deal (DRAW_TO_HAND, facing the blind, once per window) is
   *  where the round begins — every blind-select effect and its queued events are done — so Monotype checks the row. */
  round_begin() {
    const s = st();
    if (!s || s.checked_window === s.window || !G.GAME.facing_blind || G.STATE !== G.STATES.DRAW_TO_HAND) return;
    s.checked_window = s.window;
    if (!G.GAME.won) mono_check(s);
  },
  /** The shop opened: warn (once per shop) when an off-type joker would break Monotype at the next round. */
  shop_start() { mono_warn(); },
  /** The joker row was reordered: in the shop, a joker moved out from a slicer's right may now be at risk. */
  reordered() { if (G.STATE === G.STATES.SHOP) mono_warn(); },
  emplace(area, card) {
    const s = st();
    if (!s || area !== G.jokers || !card || !card.ability || card.ability.set !== 'Joker' || card.rb_seen) return;
    card.rb_seen = true; // (a card property, not ability: evolution / copy_card never carry it)
    if (G.GAME.won) return;
    // (owner rule 2026-10-21: a joker MADE by a Pokémon joker's own effect — Tropius's banana — is not the player's gain)
    const by = pokemon_maker(card);
    const t = gained_type(card);
    // (the type it had when gained: what the Monotype checks read; saved with the card. A copy_card copy arrives with
    //  its source's ability, rb_type included: it keeps that, the source's gained type — owner rule 2026-10-19. A
    //  typeless joker a Pokémon made takes its maker's type — owner rule 2026-10-21; a Pokémon it made keeps its own.)
    if (!card.ability.rb_type) card.ability.rb_type = t === 'none' && by ? maker_type(by) : t;
    // (who made it: saved with the card, so a resume / replay shows the same; a copy's inherited one is dropped unless
    //  a Pokémon made the copy too)
    if (by) card.ability.rb_made_by = by.config.center.key;
    else delete card.ability.rb_made_by;
    if (!by) {
      s.gains += 1;
      const name = joker_name(card);
      if (s.ready) {
        s.window_gains += 1;
        if (s.window_gains > 1) brk(s, 'nuz', `2nd new joker this shop (${name})`);
      }
      // (owner rule 2026-10-18: gaining a joker without a Pokémon type breaks the Nuzlocke at once; by its GAINED type,
      //  so a copy of a Pokémon-made banana — Grass — is a typed gain)
      if (card.ability.rb_type === 'none') brk(s, 'nuz', `gained a non-Pokémon joker (${name})`);
    }
    if (G.STATE === G.STATES.SHOP || (G.STATES && [G.STATES.BUFFOON_PACK, G.STATES.MOD_PACK, G.STATES.MOD_PACK_HAND, G.STATES.TAROT_PACK, G.STATES.SPECTRAL_PACK, G.STATES.STANDARD_PACK, G.STATES.PLANET_PACK].includes(G.STATE))) mono_warn();
  },
  sell_card(card) {
    const s = st();
    if (!s || G.GAME.won || !card || !card.ability || card.ability.set !== 'Joker' || card.area !== G.jokers) return;
    brk(s, 'nuz', 'sold ' + joker_name(card));
  },
};

/** The Pokémon joker whose own effect is making `card` now (core.js acting_card: its calculate, its dollar bonus, its
 *  add / remove, and the events those queued), or null: a player action, a consumable, a tag, a non-Pokémon joker (a
 *  Tera'd Riff-raff is still not a Pokémon), or the card itself. */
function pokemon_maker(card) {
  const by = acting_card();
  if (!by || by === card || !by.ability || by.ability.set !== 'Joker' || !by.config || !by.config.center) return null;
  const ex = by.ability.extra && typeof by.ability.extra === 'object' ? by.ability.extra : null;
  if (!by.config.center.ptype && !(ex && ex.ptype)) return null;
  return rb_type(by) === 'none' && gained_type(by) === 'none' ? null : by; // (a Pokémon whose type is outside the 12)
}
/** The type a typeless joker made by Pokémon `by` counts as: the run's locked type when `by` matches it (gained or
 *  current), else the type `by` was gained as (else its current one). */
function maker_type(by) {
  const s = st();
  if (s && s.type && matches(by, s.type)) return s.type;
  const g = rb_type(by);
  return g !== 'none' ? g : gained_type(by);
}
/** A card's type right now, as the tracker records it: a Pokermon type, 'any' (a wildcard Tera) or 'none'. */
function gained_type(card) {
  if (wildcard_type(card)) return 'any';
  const t = get_type(card);
  return t && POKETYPES.includes(t) ? t : 'none';
}
/** The type a joker counts as: the one stored when it was gained (a joker that predates the tracker: now). */
const rb_type = (card) => (card.ability && card.ability.rb_type) || gained_type(card);
const row_jokers = () => (G.jokers ? G.jokers.cards.filter((c) => c.ability && c.ability.set === 'Joker') : []);
/** A joker Monotype leaves out: its type follows the weather (Castform; owner rule 2026-10-27). */
const mono_exempt = (c) => !!(c.config && c.config.center && c.config.center.poke_mono_exempt);
/** Does a joker match type t at a round start? Its gained OR its current type (a wildcard either way: any type). */
const matches = (c, t) => { const g = rb_type(c), n = gained_type(c); return g === 'any' || n === 'any' || g === t || n === t; };
/** The types a joker shows in a break reason: 'Fire', 'Dark/Fire' (gained/current) or 'none'. */
function type_label(c) {
  const ts = [rb_type(c), gained_type(c)].filter((x, i, a) => x !== 'none' && x !== 'any' && a.indexOf(x) === i);
  return ts.length ? ts.join('/') : 'none';
}
/** The jokers that "destroy the joker to the right" when the Blind is selected (setting_blind, not as a Blueprint
 *  copy, not when debuffed or already being sliced; an Eternal or already-sliced neighbour is spared). */
const SLICERS = new Set(['j_ceremonial', 'j_poke_scyther', 'j_poke_scizor', 'j_poke_kleavor', 'j_poke_carvanha', 'j_poke_sharpedo', 'j_poke_rotomfan']);
/** The row as the next round will begin with it, as far as it can be known now: the known slicers' victims are left
 *  out (they slice in row order: a sliced slicer doesn't slice). */
function predicted_row() {
  const cards = G.jokers ? G.jokers.cards : [], sliced = new Set();
  cards.forEach((c, i) => {
    if (sliced.has(c) || c.debuff || c.getting_sliced || !c.config || !c.config.center || !SLICERS.has(c.config.center.key)) return;
    const n = cards[i + 1];
    if (n && !(n.ability && n.ability.eternal) && !sliced.has(n)) sliced.add(n);
  });
  return row_jokers().filter((c) => !sliced.has(c));
}
/** The Monotype verdict for a row (default: the row now) -> {lock, bad: {card, t} | null}. lock: the locked type, or
 *  (before the first lock) the type the row would lock (null: no typed joker). */
function mono_state(row = row_jokers()) {
  const s = st();
  row = row.filter((c) => !mono_exempt(c));
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
/** The first joker that would break Monotype when the next round begins (null: none would) -> {card, t, lock}: the
 *  row now, less the jokers a known slicer will destroy at blind select (predicted_row). */
function off_type() { const m = mono_state(predicted_row()); return m.bad ? { ...m.bad, lock: m.lock } : null; }
function mono_check(s) {
  if (!s.mono) return;
  const m = mono_state();
  if (m.bad) {
    const name = joker_name(m.bad.card);
    brk(s, 'mono', m.bad.t === 'none' ? `started a round with ${name} (no type)` : `started a round with ${name} (${m.bad.t}) in a ${m.lock} run`);
    return;
  }
  // the first round start with a typed joker locks the type
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
    mono_at_risk: !!(s.mono && !won && off_type()), // (an off-type joker in the row: Monotype breaks when the next round begins)
    stake: G.GAME.stake, won,
  };
  // (earned: the badges this win gives — Monotype needs a locked type)
  if (won && eligible) v.earned = { nuz: !!s.nuz, mono: s.mono && s.type ? s.type : null };
  return v;
}
