/**
 * Nacho's Pokermon Dip 1.7.9 — its helper namespaces (src/functions/*.lua: PkmnDip.utils / con / calc / eff, the
 * deck_rank_evo / edition_evo conditions, PkmnDip.RNG_protect), natively. Names follow the Lua (PkmnDip.calc.get_mult ->
 * calc.get_mult), so a port diffs against the Lua by eye. Pokermon's own helpers come from ../pokermon/api.js.
 *
 * Deviations (all Micatro shape, no rule change):
 *   - PkmnDip.defer is G.E_MANAGER.add_event (Micatro's queue is flushed after every action; the Lua's delays are cosmetic).
 *   - joker_as_card (Dhelmise): the temporary held card is a real playing card in G.hand for that one hand (it scores as
 *     a held card), hidden from the view (`dip_hidden`), never part of the deck count, and gone when the hand ends. Its
 *     rank: the Lua hooks get_id to a random negative number (no rank ever matches); ours is a fixed -1000.
 *   - The energy modify (Galarian Meowth / Perrserker: pokermon.energy.modify with an amount, negative to take it back)
 *     follows 3.9.1's energize formula for a Pokémon's table `extra` (data + base x value x amount, rounded once); other
 *     cards (a Tera'd base joker) take Pokermon's energize `amount` times (its own formula for those).
 */
import {
  G, P_CENTERS, P_CARDS, localize, card_eval_status_text, play_sound, pseudorandom_element, pseudoseed,
  calculate_context, end_consumeable, draw_card, smods_copy_card, add_card, smods_create_card, poke_convert_cards_to,
  has_enhancement, has_no_rank, has_any_suit, is_type, POKETYPES, get_depleted, can_evolve, poke_evolve,
  energy_values, energy_matches, energize, round_energy_value, set_frac, get_total_energy,
} from '../pokermon/api.js';
import { get_lowest_evo } from '../pokermon/jokers/zotherjokers.js';
import { get_flush } from '../../js/engine/run.js';

// ------------------------------------------------------------------ utils (b_list_utils.lua)
export const utils = {
  contains: (t, e) => Object.values(t || {}).includes(e),
  filter: (list, f) => Object.values(list || {}).filter((v) => f(v)),
  any: (list, f) => Object.values(list || {}).some((v) => f(v)),
  all: (list, f) => Object.values(list || {}).every((v) => f(v)),
  count_unique(list, map) {
    const seen = new Set();
    for (let v of Object.values(list || {})) { if (map) v = map(v); if (v !== undefined && v !== null && v !== false) seen.add(v); }
    return seen.size;
  },
};

/** G.GAME.blind.in_blind: Micatro's G.GAME.facing_blind (set when a blind is selected, cleared at its round evaluation). */
export const in_blind = () => !!G.GAME.facing_blind;

/** PkmnDip.defer(func, args): a queued event (Micatro's E_MANAGER runs them in order after the current step). */
export const defer = (fn) => G.E_MANAGER.add_event(fn);
/**
 * PkmnDip.defer from a press_play handler. Steamodded fires press_play after Blind:press_play, when the played cards' moves are
 * already queued, so the Lua's deferred work sees them in G.play. Micatro fires it just before queueing those moves (Pokermon's
 * Zangoose relies on that order): one event later lands after them, and still before the hand is evaluated.
 */
export const defer_after_play = (fn) => G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(fn));

/** PkmnDip.RNG_protect(func): run it, then put the pseudorandom state back (Frigibax's line: foil polls can't move RNG). */
export function RNG_protect(fn) {
  const state = JSON.parse(JSON.stringify(G.GAME.pseudorandom));
  try { fn(); } finally { G.GAME.pseudorandom = state; }
}

// ------------------------------------------------------------------ con (conditions.lua)
const ENH = ['glass', 'steel', 'wild', 'gold', 'lucky', 'bonus'];
const EDI = ['foil', 'holo', 'polychrome', 'negative'];
export const con = {
  /** a repetition context in which the card did something (`next(context.card_effects[1]) or #context.card_effects > 1`). A
   *  played card's repetition pass has no card_effects in Micatro (a played card always scores): it counts as having one. */
  has_repeat_effect: (context) => !!(context.repetition && (!context.card_effects
    || (context.card_effects[0] && Object.keys(context.card_effects[0]).length) || context.card_effects.length > 1)),
  played_or_held: (context) => context.cardarea === G.hand || context.cardarea === G.play,
  /** a booster of this kind ('Standard') is open (SMODS_BOOSTER_OPENED + SMODS.OPENED_BOOSTER's name; Micatro: the pack
   *  states + G.GAME.pack_center) */
  in_booster: (name) => {
    const S = G.STATES;
    if (![S.TAROT_PACK, S.PLANET_PACK, S.SPECTRAL_PACK, S.STANDARD_PACK, S.BUFFOON_PACK, S.MOD_PACK, S.MOD_PACK_HAND].includes(G.STATE)) return false;
    const c = G.GAME.pack_center && P_CENTERS[G.GAME.pack_center];
    return !!(c && String(c.name || '').includes(name));
  },
  is_base: (card) => card.config.center === P_CENTERS.c_base,
  is_shiny: (card) => !!(card.edition && card.edition.poke_shiny),
};
for (const e of ENH) con['is_' + e] = (card) => has_enhancement(card, 'm_' + e);
for (const e of EDI) con['is_' + e] = (card) => !!(card.edition && card.edition[e]);
for (const t of POKETYPES) {
  con['is_' + t.toLowerCase()] = (card) => is_type(card, t);
  con['all_' + t.toLowerCase()] = () => G.jokers.cards.every((j) => is_type(j, t));
}

// ------------------------------------------------------------------ calc (calculation.lua)
const RANK_KEYS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_IDS = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, Jack: 11, Queen: 12, King: 13, Ace: 14 };
const SHORT = { 10: '10', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
export const calc = {
  /** the ranks none of which is left in the deck (pokermon.get_depleted per SMODS rank) */
  get_depleted() {
    const out = [];
    for (const r of RANK_KEYS) if (get_depleted((c) => c.get_id() === RANK_IDS[r])) out.push(r);
    return out;
  },
  /** [{rank, count}] of the full deck, most common first (ties: rank order, the Lua's table.sort is unstable) */
  count_ranks() {
    const ranks = {};
    for (const p of G.playing_cards) if (!has_no_rank(p)) ranks[p.base.value] = (ranks[p.base.value] || 0) + 1;
    const out = RANK_KEYS.filter((r) => ranks[r]).map((rank) => ({ rank, count: ranks[rank] }));
    out.sort((a, b) => b.count - a.count);
    return out;
  },
  /** the most common rank(s) of the full deck, as {key, id, shorthand} */
  get_common_ranks() {
    const by = calc.count_ranks();
    if (!by.length) return [];
    return by.filter((r) => r.count === by[0].count).map((r) => ({ key: r.rank, id: RANK_IDS[r.rank], shorthand: SHORT[r.rank] || r.rank }));
  },
  get_suit: (card) => (has_any_suit(card) ? undefined : card.base.suit),
  /** the Mult a card would give (Card:get_chip_mult + get_chip_h_mult) */
  get_mult: (card) => (card.get_chip_mult ? card.get_chip_mult() : 0) + (card.get_chip_h_mult ? card.get_chip_h_mult() : 0),
  get_key: (card, name) => 'j_' + (card.config.center.poke_custom_prefix || 'poke') + '_' + (name || card.config.center.name),
  daycare_compatible(card) {
    const c = card.config.center;
    const lowest = P_CENTERS[calc.get_key(card, get_lowest_evo(card))];
    return !!c.stage && !['Other', 'Baby', 'Legendary'].includes(c.stage) && !!lowest && lowest.stage !== 'Legendary';
  },
  /** the two parts of a Full House: [three, two] (cards), or their ranks ('id' / 'nominal') */
  get_full_house(cards, by) {
    const count = {};
    for (const c of cards) count[c.get_id()] = (count[c.get_id()] || []).concat([c]);
    const groups = Object.values(count);
    const major = groups.find((g) => g.length >= 3) || [];
    const minor = groups.find((g) => g !== major && g.length >= 2) || [];
    if (!major.length || !minor.length) return by ? [0, 0] : [major, minor];
    if (by === 'id') return [major[0].get_id(), minor[0].get_id()];
    if (by === 'nominal') return [major[0].base.nominal, minor[0].base.nominal];
    return [major, minor];
  },
  /** the suit of the hand's Flush ('Any' for all Wild cards), or undefined */
  get_flush_suit(cards) {
    const flush = get_flush(cards)[0];
    if (!flush) return undefined;
    if (flush.every((c) => con.is_wild(c))) return 'Any';
    for (const c of flush) { const s = calc.get_suit(c); if (s) return s; }
    return undefined;
  },
  /** the first `n` cards of the area passing f (1 -> the card itself) */
  find_playing_card(f, area, n) {
    const found = [];
    for (const v of area || G.deck.cards) { if (f(v)) { found.push(v); if (n && found.length >= n) break; } }
    return found.length === 1 ? found[0] : found;
  },
};

// ------------------------------------------------------------------ Pokermon 3.9.1 helpers our Pokermon keeps local
/** pokermon.get_ancient_amount(hand, id, append_to_card): how many cards of rank `id` (stored as extra.ancient_count). */
export function get_ancient_amount(hand, id, append_to_card) {
  let count = 0;
  for (const c of hand || []) if (c.get_id() === id) count = count + 1;
  if (append_to_card) append_to_card.ability.extra.ancient_count = count;
  return count;
}
/** SMODS.in_scoring(card, scoring_hand) */
export const in_scoring = (card, scoring_hand) => (scoring_hand || []).includes(card);

// ------------------------------------------------------------------ evolution conditions
/** pokermon.edition_evo (Frigibax line): evolve at end of round once `flat` cards (or `percentage` of the deck) have it. */
export function edition_evo(self, card, context, forced_key, edition, percentage, flat) {
  if (!can_evolve(self, card, context, forced_key)) return undefined;
  const count = G.playing_cards.filter((c) => con['is_' + edition](c)).length;
  if ((percentage && count / G.playing_cards.length >= percentage) || (flat && count >= flat)) return { message: poke_evolve(card, forced_key) };
  return undefined;
}

// ------------------------------------------------------------------ eff (effects.lua)
/** PkmnDip.eff.faint: debuffed for the rest of the round (Pokermon's fainted rule). */
export function faint(card, undebuff, immediate) {
  const f = () => { card.juice_up(); card.ability.fainted = undebuff ? undefined : G.GAME.round; card.set_debuff(); };
  if (immediate) f(); else defer(f);
}

/** PkmnDip.eff.mod_booster: +amount choices in the open pack (0 left: the pack closes). */
export function mod_booster(amount) {
  const before = G.GAME.pack_choices || 0;
  G.GAME.pack_choices = before + amount;
  // (a pack already closing — ending_booster runs inside end_consumeable, with 0 choices left — isn't closed twice)
  if (G.GAME.pack_choices <= 0 && before > 0) end_consumeable();
}

/** PkmnDip.eff.copy_playing_card: a copy into the deck (converted by `modify`), "Copied!" on message_card. */
export function copy_playing_card(card, modify, to_hand, message_card) {
  defer(() => {
    const copy = smods_copy_card(card, { area: G.deck });
    if (modify) poke_convert_cards_to(copy, modify, true, true);
    if (to_hand) draw_card(G.deck, G.hand, null, null, null, copy);
    calculate_context({ playing_card_added: true, cards: [copy] });
  });
  card_eval_status_text(message_card || card, 'extra', null, null, null, { message: localize('k_copied_ex') });
}

/** PkmnDip.eff.create_joker(args, pre_call, post_call): with a free slot (or Negative), a joker in an event. */
export function create_joker(args, pre_call, post_call) {
  if (typeof args === 'string') args = { key: args };
  if (!args.set) args.set = 'Joker';
  if (G.jokers.cards.length + G.GAME.joker_buffer <= G.jokers.config.card_limit || args.edition === 'e_negative') {
    G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
    defer(() => {
      G.GAME.joker_buffer = 0;
      if (pre_call) pre_call(args);
      const c = add_card(args);
      if (post_call) post_call(c);
    });
  }
}

/** PkmnDip.eff.breed(card, adj): a Mystery Egg of a random adjacent parent's lowest form, if both are Daycare-compatible. */
export function breed(card, adj, pre_call, post_call) {
  if (!adj.length || !adj.every((j) => calc.daycare_compatible(j))) return;
  const parent = pseudorandom_element(adj, pseudoseed('daycare'))[0];
  const lowest = get_lowest_evo(parent);
  if (lowest && typeof lowest === 'string') {
    create_joker({ key: 'j_poke_mystery_egg' }, pre_call, (egg) => {
      egg.ability.extra.key = calc.get_key(parent, lowest);
      if (post_call) post_call(egg);
    });
  }
}

/**
 * PkmnDip.slots_reserved: joker slots a vanished card keeps (Palafin, until its Hero comes back at end of round). The Lua counts
 * them in CardArea:count_property('extra_slots_used'); Micatro takes them off G.jokers' card_limit while reserved (the same
 * room for buying / creating), and gives them back on release. Per run (G.GAME).
 */
export const reserved = () => (G.GAME.nacho_slots_reserved = G.GAME.nacho_slots_reserved || {});
export function reserve_joker_slot() {
  const r = reserved();
  r.jokers = (r.jokers || 0) + 1;
  G.jokers.config.card_limit = G.jokers.config.card_limit - 1;
}
export function release_reserved_slots(area) {
  const r = reserved();
  for (const k of Object.keys(r)) {
    if (area && k !== area) continue;
    if (k === 'jokers') G.jokers.config.card_limit = G.jokers.config.card_limit + (r[k] || 0);
    delete r[k];
  }
}

/** PkmnDip.eff.vanish_joker: the card leaves (no sell, no destroy effects) and its slot stays reserved. */
export function vanish_joker(card) {
  defer(() => {
    play_sound('tarot1');
    card.juice_up(0.3, 0.4);
    card.remove();
    reserve_joker_slot();
  });
}

/**
 * PkmnDip.eff.joker_as_card(card, {area, enhancement, edition}) (Dhelmise): a temporary playing card scoring FOR the joker —
 * here a hidden held card in G.hand for this hand only (see the header). -> the card.
 */
export function joker_as_card(card, args = {}) {
  const area = args.area || G.play;
  const ed = args.edition && (args.edition.key || (args.edition.type ? 'e_' + args.edition.type : undefined));
  const t = smods_create_card({ set: 'Base', area, enhancement: args.enhancement, edition: ed });
  t.dip_scoring_for = card;
  t.dip_hidden = true;
  t.get_id = () => -1000;
  area.emplace(t);
  defer(() => { if (t.area) t.area.remove_card(t); t.removed = true; });
  return t;
}

/**
 * pokermon.energy.modify(card, etype, amount, silent) (3.9.1), for Galarian Meowth / Perrserker's +N / -N Energy: the energy
 * counts move by `amount` (a mismatched Colorless counts as colorless Energy), then the values scale by amount (see header).
 */
export function modify_energy(card, etype, amount = 1, silent) {
  const ex = card.ability.extra;
  const table = ex !== null && typeof ex === 'object';
  const holder = table ? ex : card.ability;
  if (energy_matches(card, etype, false)) holder.energy_count = (holder.energy_count || 0) + amount;
  else if (etype === 'Colorless') holder.c_energy_count = (holder.c_energy_count || 0) + amount;
  else return;
  if (table) {
    const base = (card.config.center.config && card.config.center.config.extra) || {};
    const c_penalty = etype === 'Colorless' && !is_type(card, 'Colorless') && !(G.GAME.modifiers && G.GAME.modifiers.poke_disable_colorless_penalty) ? 2 : 1;
    for (const name of Object.keys(energy_values)) {
      const data = ex[name];
      if (typeof data !== 'number' || typeof base[name] !== 'number') continue;
      const previous_mod = (name === 'mult_mod' || name === 'chip_mod') ? ex[name] : undefined;
      ex[name] = data + (base[name] * energy_values[name] / c_penalty) * (ex.escale || 1) * amount;
      const updated = ex[name];
      const [rounded, frac] = round_energy_value(ex[name], name);
      ex[name] = rounded;
      if (frac !== undefined) set_frac(card, frac, name, rounded > 0, previous_mod ? updated / previous_mod : undefined);
    }
  } else {
    // (a base-game joker: Pokermon's energize, `amount` times; a negative amount undoes the same steps)
    const before = JSON.parse(JSON.stringify(card.ability));
    energize(card, etype, false, true);
    if (amount !== 1) {
      for (const [k, v] of Object.entries(card.ability)) {
        if (typeof v === 'number' && typeof before[k] === 'number' && k !== 'energy_count' && k !== 'c_energy_count') card.ability[k] = before[k] + (v - before[k]) * amount;
      }
      if (typeof card.ability.extra === 'number' && typeof before.extra === 'number') card.ability.extra = before.extra + (card.ability.extra - before.extra) * amount;
    }
  }
  if (!silent) card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_energized_ex'), colour: 'pink' });
}

/** pokermon.energy.is_energizable (3.9.1): the card has an Energy-scaled value. */
export function is_energizable(card) {
  const ex = card.ability.extra;
  if (ex !== null && typeof ex === 'object') return Object.keys(energy_values).some((n) => typeof ex[n] === 'number');
  if (typeof ex === 'number') return true;
  return Object.keys(energy_values).some((k) => typeof card.ability[k] === 'number' && card.ability[k] > 0)
    || (card.ability.mult > 0 || card.ability.t_mult > 0 || card.ability.t_chips > 0 || card.ability.x_mult > 1);
}

export { get_total_energy };
