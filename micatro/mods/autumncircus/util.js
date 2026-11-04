// Þe Autumn Circus — shared helpers for the content modules (systems.js, jokers_*.js, oddities.js,
// consumables.js): the mod's static data (data.js, generated), center builders, TheAutumnCircus.func and the
// Steamodded utilities the Lua calls, as small Micatro equivalents. AMM's API is re-exported as AMM.
import { isActive, MOD_LOC } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS, P_SEALS, P_CENTER_POOLS, Card, enhancement_pool, emit, play_sound, card_eval_status_text, localize, juice_card,
  pseudorandom, pseudoseed, pseudorandom_element, create_card, create_playing_card, probability_roll, probability_vars,
  quantum_enhancements,
} from '../../js/engine/core.js';
import { draw_from_deck_to_hand } from '../../js/engine/run.js';
import { playing_card_joker_effects } from '../../js/engine/jokers.js';
import * as AMM from '../autumnmood/api.js';
import DATA from './data.js';

export const MOD_ID = 'autumncircus';
export const ART = '/micatro/mods/autumncircus/assets/2x/';
export const on = () => isActive(MOD_ID);
export { AMM, DATA };

// ------------------------------------------------------------------ data
/** Micatro ids for the mod ids TAC names in `dependencies` (only shipped partners are kept). */
export const PARTNER = { MoreFluff: 'morefluff', Pokermon: 'pokermon' };
/**
 * A mod object's static data (data.js) by buffer kind and key, deep-copied, minus the "__fn" markers.
 * Its `dependencies` become Micatro ids; an object needing a mod Micatro doesn't ship returns null
 * (Homelatro excepted: owner decision 2026-10-16 — the Homestuck jokers are included, see jokers_b.js).
 */
export function data(kind, key) {
  const o = (DATA.kinds[kind] || []).find((x) => x.key === key);
  if (!o) throw new Error('autumncircus: no data for ' + kind + ' ' + key);
  const c = JSON.parse(JSON.stringify(o));
  for (const k of Object.keys(c)) if (c[k] === '__fn' || k.startsWith('__')) delete c[k];
  if (c.dependencies) {
    const deps = [];
    for (const d of c.dependencies) {
      if (d === 'homelatro') continue;
      if (!PARTNER[d]) return null;
      deps.push(PARTNER[d]);
    }
    c.dependencies = deps.length ? deps : undefined;
    if (!c.dependencies) delete c.dependencies;
  }
  return c;
}
const ATLAS = (a) => (a ? 'thac_' + a : undefined);
/**
 * A joker center: data.js's static fields (pos, rarity, cost, config, compat flags, soul_pos, pools flags)
 * plus its behaviour. Keys are SMODS's: j_thac_<key>; its name is the key (SMODS default).
 */
export function joker(key, def = {}) {
  const s = data('Jokers', key);
  if (!s) return null;
  const full = 'j_thac_' + key;
  const placeholder_art = s.atlas !== 'Emojiokers' && s.pos && s.pos.x === 0 && s.pos.y === 0;
  return { ...s, key: full, name: full, set: 'Joker', atlas: ATLAS(s.atlas), unlocked: true, discovered: true, placeholder_art, ...def };
}
/** A consumable center (Tarot / Planet / Spectral / Oddity / Rotarot / Colour): c_thac_<key>. */
export function consumable(key, def = {}) {
  const s = data('Consumables', key);
  if (!s) return null;
  const full = 'c_thac_' + key;
  return { ...s, key: full, name: full, consumeable: true, atlas: ATLAS(s.atlas), unlocked: true, discovered: true, ...def };
}
/** Any other buffered object's data with the atlas renamed (stamps, aspects, vouchers, decks, ...). */
export function object(kind, key) { const s = data(kind, key); if (s && s.atlas) s.atlas = ATLAS(s.atlas); return s; }

// ------------------------------------------------------------- SMODS utils
/** SMODS.find_card(key, count_debuffed): owned jokers / consumables with this center key. */
export const find = (key, count_debuffed) => {
  const out = [];
  for (const a of [G.jokers, G.consumeables]) if (a) for (const c of a.cards) if (c.config.center.key === key && (count_debuffed || !c.debuff)) out.push(c);
  return out;
};
export const has = (key) => find(key).length > 0;
/** #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit */
export const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;
export const joker_room = () => G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit;
/** card_eval_status_text(card, 'extra', nil, nil, nil, {message, colour}) */
export const say = (card, message, colour) => card_eval_status_text(card, 'extra', null, null, null, { message, colour });
export const has_enhancement = AMM.has_enhancement;
export const has_no_suit = AMM.has_no_suit;
export const has_no_rank = AMM.has_no_rank;
export const has_any_suit = AMM.has_any_suit;
export { probability_roll, probability_vars };
/** SMODS.pseudorandom_probability(trigger_obj, seed, num, den) */
export const chance = (obj, seed, num, den) => probability_roll(obj, seed, num, den, seed);
/** SMODS.get_probability_vars(obj, num, den) -> [num, den] */
export const prob_vars = (obj, num, den, id) => probability_vars(obj, num, den, id);
/**
 * SMODS.scale_card(card, {ref_table, ref_value, scalar_value, scalar_table?, operation?, message_key?,
 * message_colour?, no_message?}): ref += scalar (or -, or X), then "Upgrade!" (or the message key's text).
 */
export function scale_card(card, args) {
  const ref = args.ref_table || card.ability.extra;
  const sc = args.scalar_table || ref;
  const initial = ref[args.ref_value];
  let scalar = sc[args.scalar_value];
  const op = args.operation || '+';
  if (op === '-' && scalar < 0) scalar = -scalar;
  if (typeof op === 'function') op(ref, args.ref_value, initial, scalar);
  else if (op === 'X') ref[args.ref_value] = initial * scalar;
  else if (op === '-') ref[args.ref_value] = initial - scalar;
  else ref[args.ref_value] = initial + scalar;
  if (!args.no_message) {
    const msg = args.scaling_message || {
      message: args.message_key ? localize({ type: 'variable', key: args.message_key, vars: [args.message_key === 'a_xmult' ? ref[args.ref_value] : scalar] }) : localize('k_upgrade_ex'),
      colour: args.message_colour || 'FILTER',
    };
    card_eval_status_text(card, 'extra', null, null, null, msg);
  }
}
const SUIT_CODE = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };
const RANK_CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
/** SMODS.change_base(card, suit, rank) — rank/suit keys ('Ace', 'Spades'); nil keeps the card's own. */
export function change_base(card, suit, rank) {
  const f = AMM.front_of(suit || card.base.suit, rank || card.base.value);
  if (!f) return false;
  card.set_base(f);
  return true;
}
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
export const SUITS4 = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
/**
 * SMODS.poll_seal({key, mod, guaranteed, type_key}): weighted over the Seal pool (weight 5 each unless a seal
 * sets its own), rolled only when guaranteed or the key's chance hits.
 */
export function poll_seal(args = {}) {
  const key = args.key || 'stdseal';
  const mod = args.mod || 1;
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  const hit = pseudorandom(pseudoseed(key + G.GAME.round_resets.ante)) > 1 - 0.02 * mod;
  if (!(hit || args.guaranteed)) return null;
  const options = (P_CENTER_POOLS.Seal || []).filter((s) => !(s.in_pool && !s.in_pool(s)));
  let total = 0;
  const avail = options.map((s) => { const w = (P_SEALS[s.key] && P_SEALS[s.key].weight) || 5; total += w; return { key: s.key, weight: w }; });
  const poll = pseudorandom(pseudoseed(type_key));
  let wi = 0;
  for (const v of avail) { wi += v.weight; if (poll > 1 - wi / total) return v.key; }
  return null;
}
/**
 * SMODS.create_card / add_card {set, key, area, edition, enhancement, seal, rank, suit, key_append, legendary,
 * rarity, skip_materialize, soulable, no_edition}: playing cards ('Base' / 'Enhanced' / 'Playing Card') go
 * through AMM.add_playing_card; others through create_card. add = true adds it (add_to_deck + emplace).
 */
export function smods_card(t, add) {
  if (t.set === 'Base' || t.set === 'Enhanced' || t.set === 'Playing Card' || (!t.set && !t.key && (t.rank || t.suit))) {
    const area = t.area || G.hand;
    const struc = { key: t.enhancement || (t.set === 'Enhanced' ? undefined : t.key), set: t.set === 'Enhanced' ? 'Enhanced' : 'Base', rank: t.rank, suit: t.suit, seal: t.seal, edition: t.edition };
    return AMM.add_playing_card(struc, area, t.key_append || 'add_card');
  }
  const set = t.set || (t.key && P_CENTERS[t.key] && P_CENTERS[t.key].set);
  const area = t.area || (t.key && P_CENTERS[t.key] && P_CENTERS[t.key].consumeable ? G.consumeables : (set === 'Joker' ? G.jokers : G.consumeables));
  const card = create_card(set, area, t.legendary, t.rarity, t.skip_materialize, t.soulable, t.key, t.key_append);
  if (t.edition) card.set_edition(t.edition, true);
  if (t.seal) card.set_seal(t.seal, true);
  if (t.stickers) for (const s of t.stickers) card.ability[s] = true;
  if (add) { card.add_to_deck(); area.emplace(card); }
  return card;
}

// --------------------------------------------------------- TheAutumnCircus.func
/** func.pseudorandom_unlocked_hand(ignore, seed): a random visible hand not in `ignore` (returns its name). */
export function pseudorandom_unlocked_hand(ignore, seed) {
  ignore = ignore == null ? [] : (Array.isArray(ignore) ? ignore : [ignore]);
  seed = seed || 'comet_planet';
  for (let guard = 0; guard < 1000; guard++) {
    const [h] = pseudorandom_element(G.handlist, pseudoseed(seed));
    if (G.GAME.hands[h].visible && !ignore.includes(h)) return h;
  }
  return 'High Card';
}
/** func.context_strict_standard_hands(context): the played hand is one of the 9 "standard hands". */
export function context_strict_standard_hands(context) {
  return !!context.scoring_hand && ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'].includes(context.scoring_name);
}
/** func.get_card_suits(card, bypass_debuff): every suit the card counts as. */
export function get_card_suits(card, bypass_debuff) { return AMM.suit_buffer().filter((s) => card.is_suit(s, bypass_debuff)); }
/** func.favorite_hand(): the most played hand (ties: the first in hand-list order, like Telescope). */
export function favorite_hand() {
  let chosen = 'High Card', highest = 0;
  for (const v of G.handlist || []) if (G.GAME.hands[v] && G.GAME.hands[v].played > highest) { chosen = v; highest = G.GAME.hands[v].played; }
  return chosen;
}
/** func.pseudorandom_enhancement(): a random Enhanced center (seed 'universe_tarot'). */
export function pseudorandom_enhancement() { return pseudorandom_element(enhancement_pool(), pseudoseed('universe_tarot'))[0]; }
/**
 * func.force_draw_cards(cards): draw `cards` more cards into a hand that already has 2+ (hand size raised for
 * the draw only; discards_used parked at 666 so first_hand_drawn can't fire again).
 */
export function force_draw_cards(cards) {
  if (G.hand.cards.length > 1) {
    const remember = G.hand.config.card_limit, remember2 = G.GAME.current_round.discards_used;
    G.hand.config.card_limit = G.hand.cards.length + cards;
    G.GAME.current_round.discards_used = 666;
    draw_from_deck_to_hand(cards);
    G.hand.config.card_limit = remember;
    G.E_MANAGER.add_event(() => { G.GAME.current_round.discards_used = remember2; });
  }
}
/**
 * TheAutumnCircus.placeholder_jokers: the LooksLikeTheJokers.lua jokers whose sprite cell is (0,0) (the
 * placeholder art; Rotated Cartowomancer's 113px cell counts too, as in the Lua), in registration order.
 * FIX (intended design): the Lua lists them before checking `dependencies`, so a joker needing a mod that isn't
 * installed was in the list and Placeholder Joker could turn into a center that doesn't exist (a crash); only
 * jokers loaded for this run are listed.
 */
export function placeholder_jokers() {
  return Object.values(P_CENTERS).filter((c) => c.mod === MOD_ID && c.set === 'Joker' && c.placeholder_art && isActiveCenter(c)).sort((a, b) => a.order - b.order).map((c) => c.key);
}
const isActiveCenter = (c) => (P_CENTER_POOLS.Joker || []).includes(c);
/** A localized TAC string (misc.dictionary / v_dictionary). */
export const loc = (key, vars) => (vars ? localize({ type: 'variable', key, vars }) : localize(key));
export {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, emit, play_sound, card_eval_status_text, localize, juice_card,
  pseudorandom, pseudoseed, pseudorandom_element, create_card, create_playing_card, playing_card_joker_effects, quantum_enhancements, MOD_LOC,
};
