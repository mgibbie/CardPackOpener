// Bunco — shared helpers for the content modules (jokers_*, systems, consumables, packs, blinds, tags,
// vouchers, decks, editions, enhancements, stickers, reworks). Micatro equivalents of the Steamodded /
// Balatro utilities and of Bunco.lua's own top-level helpers (forced_message, link_cards, enable_exotics...).
import { isActive, opt } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS, Card, card_eval_status_text, emit, play_sound, localize, pseudorandom_element, juice_card,
} from '../../js/engine/core.js';
import DATA from './data.js';

export const MOD_ID = 'bunco';
export const ART = '/micatro/mods/bunco/assets/2x/';
export const SND = '/micatro/mods/bunco/assets/sounds/';
export const on = () => isActive(MOD_ID);
/** A Bunco mod option (gameplay_reworks, jokerlike_consumable_editions, fixed_sprites, fixed_badges). */
export const option = (k) => opt(MOD_ID, k);
/** Bunco.lua's `huge_number` (its math.huge stand-in). */
export const HUGE = 9999;
/**
 * Bunco.lua seeds many rolls with `..G.SEED` (pseudorandom('fiendish'..G.SEED)). In Balatro G.SEED is
 * os.time() at launch — not the run seed — so those rolls weren't reproducible; the evident intent is the
 * run's seed, and Micatro must be deterministic: G.GAME.pseudorandom.seed.
 */
export const SEED = () => G.GAME.pseudorandom.seed;
export { DATA, localize };

// ------------------------------------------------------------------ cards
/** SMODS.find_card(key, count_debuffed): owned jokers / consumables with this key. */
export const find = (key, count_debuffed) => {
  const out = [];
  for (const a of [G.jokers, G.consumeables]) if (a) for (const c of a.cards) if (c.config.center.key === key && (count_debuffed || !c.debuff)) out.push(c);
  return out;
};
export const has = (key) => find(key).length > 0;
/** #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit */
export const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;
/** card_eval_status_text(card, 'extra', nil, nil, nil, {message, colour}) */
export const say = (card, message, colour) => card_eval_status_text(card, 'extra', null, null, null, { message, colour });
/** G.E_MANAGER:add_event(Event{func}) (Bunco.lua's `event`). */
export const event = (fn) => G.E_MANAGER.add_event(fn);
/** Bunco.lua forced_message(message, card, color, delay, juice): a queued popup. */
export function forced_message(message, card, colour, _delay, juice) {
  event(() => { if (juice) juice_card(juice); card_eval_status_text(card, 'extra', null, null, null, { message, colour, instant: true }); });
}
export const big_juice = (card) => juice_card(card);
/** SMODS.has_enhancement(card, key) */
export const has_enh = (card, key) => card.config.center.key === key;
/**
 * SMODS.has_no_rank / has_no_suit / has_any_suit (the fork's rankless / suitless guards, 5.4.8b): a Stone Card or an
 * enhancement flagged no_rank / no_suit (another mod's, e.g. Pokermon 3.9.1's Ludicolo); a non-debuffed Wild Card.
 */
export const has_no_rank = (card) => card.ability.effect === 'Stone Card' || !!card.config.center.no_rank;
export const has_no_suit = (card) => card.ability.effect === 'Stone Card' || !!card.config.center.no_suit;
export const has_any_suit = (card) => (card.ability.name === 'Wild Card' || card.config.center.any_suit === true) && !card.debuff;
/** The joker's 1-based position in G.jokers (nil = not there). */
export const joker_pos = (card) => { const i = G.jokers.cards.indexOf(card); return i >= 0 ? i + 1 : undefined; };
/** A Card for a center key (G.P_CARDS.empty front). */
export const center_card = (key, params) => new Card(P_CARDS.empty, P_CENTERS[key], params || {});

// ------------------------------------------------------------- exotic suits
/** BUNCOMOD.funcs.exotic_in_pool */
export const exotic_in_pool = () => !!(G.GAME && G.GAME.Exotic);
/** enable_exotics() / disable_exotics() — the Exotic System toggle (G.GAME.Exotic). */
export function enable_exotics() { if (G.GAME) G.GAME.Exotic = true; }
export function disable_exotics() { if (G.GAME) G.GAME.Exotic = false; }
export const FLEURONS = 'bunc_Fleurons';
export const HALBERDS = 'bunc_Halberds';
export const EXOTIC_SUITS = [FLEURONS, HALBERDS];
export const is_exotic_suit = (s) => s === FLEURONS || s === HALBERDS;
/** SMODS.Suit.obj_buffer after Bunco's reorder (Bunco.lua ~5875): Halberds, Fleurons, then the base four. */
export const SUIT_BUFFER = [HALBERDS, FLEURONS, 'Diamonds', 'Clubs', 'Hearts', 'Spades'];
/** pseudorandom_element(SMODS.Suits): obj_list(reversed) with each suit's in_pool (exotics only once enabled). */
export const suit_pool = () => SUIT_BUFFER.slice().reverse().filter((s) => !is_exotic_suit(s) || exotic_in_pool());
/** SMODS.Rank.obj_buffer (2 ... Ace) as {key, card_key}. */
export const RANK_LIST = [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'], ['10', 'T'], ['Jack', 'J'], ['Queen', 'Q'], ['King', 'K'], ['Ace', 'A']].map(([key, card_key]) => ({ key, card_key }));
export const SUIT_CODE = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D', [FLEURONS]: 'bunc_FLEURON', [HALBERDS]: 'bunc_HALBERD' };
export const RANK_CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
/** pseudorandom_element(SMODS.Suits, seed).key */
export const random_suit = (seed) => pseudorandom_element(suit_pool(), seed)[0];
/** pseudorandom_element(SMODS.Ranks, seed).key */
export const random_rank = (seed) => pseudorandom_element(RANK_LIST, seed)[0].key;
/** SMODS.change_base(card, suit, rank) — suit / rank keys; nil keeps the card's own. */
export function change_base(card, suit, rank) {
  const s = SUIT_CODE[suit || card.base.suit], r = RANK_CODE[rank || card.base.value];
  if (!s || !r || !P_CARDS[s + '_' + r]) return false;
  card.set_base(P_CARDS[s + '_' + r]);
  return true;
}
/** G.P_CARDS key for a suit + rank ('bunc_Fleurons', 'Ace' -> 'bunc_FLEURON_A'). */
export const card_key = (suit, rank) => SUIT_CODE[suit] + '_' + RANK_CODE[rank];

// ------------------------------------------------------------- linked cards
/**
 * link_cards(cards, source, ignore_groups) (Bunco.lua ~4867): a new group id for these cards (a card already
 * in a group keeps it when ignore_groups).
 */
export function link_cards(cards, source, ignore_groups) {
  G.GAME.last_card_group = (G.GAME.last_card_group || 0) + 1;
  for (const card of cards) {
    if (!ignore_groups || !card.ability.group) card.ability.group = { id: G.GAME.last_card_group, source: source || 'unknown' };
  }
  emit('bunc_linked', { cards: cards.map((c) => c.sort_id), group: G.GAME.last_card_group });
}
/** The cards of `area` in the same linked group as `card` (incl. itself), area order. */
export const group_of = (card, area) => (card.ability.group ? (area || card.area).cards.filter((c) => c.ability.group && c.ability.group.id === card.ability.group.id) : [card]);

// ------------------------------------------------------------- event bus
// Bunco's lovely patches call specific jokers from engine functions (Trigger Finger from Card:highlight,
// Games Collector from the linked draw, ...). The module that owns the engine seam emits; the joker
// modules listen — so the content files stay independent.
const BUS = {};
export function onB(name, fn) { (BUS[name] = BUS[name] || []).push(fn); }
export function emitB(name, ...args) { let r; for (const f of BUS[name] || []) { const x = f(...args); if (x !== undefined && r === undefined) r = x; } return r; }

// ------------------------------------------------------------- content
/**
 * A joker center: the mod's static data (data.js: name, atlas cell, rarity, cost, config, compat flags)
 * plus its behaviour (calculate / loc_vars / add_to_deck / ...). `slug` is the key part (j_bunc_<slug>).
 */
export function joker(slug, def = {}) {
  const s = DATA.jokers['j_bunc_' + slug];
  if (!s) throw new Error('bunco: no data for joker ' + slug);
  const o = JSON.parse(JSON.stringify(s));
  delete o.fns; delete o.unlock_condition; delete o.discovered;
  // SMODS.Joker's default perishable_compat is true; Bunco 5.1 left it nil (= the default), so every Bunco joker can be
  // Perishable (5.4.8b says so explicitly). data.js has no field: the default is applied here (port fix, pin rev 1).
  if (o.perishable_compat === undefined) o.perishable_compat = true;
  return { ...o, set: 'Joker', unlocked: true, discovered: true, ...def };
}
/** The data.js entry for any content key (c_bunc_..., v_bunc_..., ...), minus the functions list. */
export function data_of(group, key) {
  const s = DATA[group] && DATA[group][key];
  if (!s) throw new Error('bunco: no data for ' + group + ' ' + key);
  const o = JSON.parse(JSON.stringify(s));
  delete o.fns; delete o.unlock_condition; delete o.discovered; delete o.locked_loc_vars;
  return o;
}
export { play_sound };
