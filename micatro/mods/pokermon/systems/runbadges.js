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
 *     Pokermon's 12), by any means — it breaks Monotype too ("gained a non-Pokémon joker (Joker)").
 * Gaining a NEW joker = a Joker-set card entering G.jokers for the first time, however it got there: bought,
 * picked from a pack, made by a tag (Top-up, Buffoon pack), or created by a card (Poké/Great/Ultra/Master
 * Ball, Judgement, Wraith, Riff-raff, The Soul) or copied as a new card (Ankh, Invisible Joker). Evolution,
 * Ditto's transformation and Tera / type changes are the SAME card (Pokermon's poke_evolve swaps the center
 * in place), so they are not new jokers. Starting jokers (a custom deck's) don't use the first window's one.
 *
 * Monotype — the first joker gained locks the type (Pokermon's get_type at that moment: a Tera sticker,
 * else ptype). Broken by gaining a joker of another type, or one with no type (as above: that breaks both).
 * A wildcard Tera (Nacho's Stellar) matches any type. Later type changes never break it, and neither does an
 * evolution into another type (Ursaring -> Ursaluna): only what you GAIN counts. A Monotype win needs a
 * locked type (>= 1 joker).
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
    GAME.run_badges = { nuz: true, mono: true, type: null, nuz_reason: '', mono_reason: '', window: 0, window_gains: 0, gains: 0, ready: false };
  },
  /** The first blind select of the run: everything gained before it is a starting joker. */
  blind_on_deck() { const s = st(); if (s) s.ready = true; },
  /** A blind starts: a new shop window. */
  new_round() { const s = st(); if (s) { s.window += 1; s.window_gains = 0; } },
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
    if (wildcard_type(card)) return;
    const t = get_type(card);
    if (!t || !POKETYPES.includes(t)) {
      // (owner rule 2026-10-18: a joker without a Pokémon type breaks BOTH)
      const why = `gained a non-Pokémon joker (${name})`;
      brk(s, 'nuz', why);
      brk(s, 'mono', why);
    } else if (!s.type) { if (s.mono) s.type = t; }
    else if (t !== s.type) brk(s, 'mono', `${t} joker in a ${s.type} run`);
  },
  sell_card(card) {
    const s = st();
    if (!s || G.GAME.won || !card || !card.ability || card.ability.set !== 'Joker' || card.area !== G.jokers) return;
    brk(s, 'nuz', 'sold ' + joker_name(card));
  },
};

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
    stake: G.GAME.stake, won,
  };
  // (earned: the badges this win gives — Monotype needs a locked type)
  if (won && eligible) v.earned = { nuz: !!s.nuz, mono: s.mono && s.type ? s.type : null };
  return v;
}
