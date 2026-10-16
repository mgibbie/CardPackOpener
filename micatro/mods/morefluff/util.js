// More Fluff — shared helpers for the content modules (jokers*, colours, rotarots, enhancements,
// superboss, extras). Small Micatro equivalents of the Steamodded / Balatro utilities the Lua uses.
import { isActive } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, P_SEALS, Card, emit, play_sound, card_eval_status_text, localize,
  pseudorandom, pseudoseed, pseudorandom_element, juice_card,
} from '../../js/engine/core.js';
import DATA from './data.js';

export const MOD_ID = 'morefluff';
export const ART = '/micatro/mods/morefluff/assets/2x/';
export const SND = '/micatro/mods/morefluff/assets/sounds/';
export const on = () => isActive(MOD_ID);
export { DATA };

/** SMODS.find_card(key): owned, non-debuffed jokers (and consumables) with this key. */
export const find = (key, count_debuffed) => {
  const out = [];
  for (const a of [G.jokers, G.consumeables]) if (a) for (const c of a.cards) if (c.config.center.key === key && (count_debuffed || !c.debuff)) out.push(c);
  return out;
};
export const has = (key) => find(key).length > 0;
/** #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit */
export const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;
/** A popup on a card (card_eval_status_text(card, 'extra', ..., {message, colour})). */
export const say = (card, message, colour) => card_eval_status_text(card, 'extra', null, null, null, { message, colour });
/** SMODS.has_enhancement(card, key) */
export const has_enh = (card, key) => card.config.center.key === key;
/** SMODS.has_no_rank(card) */
export const has_no_rank = (card) => !!(card.config.center.no_rank || card.ability.effect === 'Stone Card');

/**
 * The "eaten / drank / extinct" removal the Lua queues (play_sound('tarot1'), pinch, then
 * G.jokers:remove_card(card); card:remove()).
 */
export function remove_joker(card) {
  G.E_MANAGER.add_event(() => {
    play_sound('tarot1');
    juice_card(card);
    G.E_MANAGER.add_event(() => {
      emit('dissolve', { card: card.sort_id, reason: 'eaten' });
      if (card.area) card.area.remove_card(card);
      card.remove();
    });
  });
}

/**
 * Non-vanilla joker rolls (Modded packs, Expansion Pack, 45° Judgement). The Lua temp-bans a fixed list
 * of vanilla joker keys (G.GAME.banned_keys[k] = 214389) around create_card; here a counter makes the
 * pool_filter hook (index.js) leave out every BASE-game joker while it is raised — in Micatro "modded"
 * means a joker from any ACTIVE mod. Begin it where the Lua bans and end it where the Lua unbans.
 */
export function modded_begin() { G.GAME.mf_modded_only = (G.GAME.mf_modded_only || 0) + 1; }
export function modded_end() { G.GAME.mf_modded_only = Math.max(0, (G.GAME.mf_modded_only || 0) - 1); }
export function modded_pool_filter(center, _type) {
  if (_type === 'Joker' && G.GAME && G.GAME.mf_modded_only > 0 && center.set === 'Joker' && !center.mod) return false;
  return undefined;
}

/** SMODS.Ranks / SMODS.Suits as tables keyed like Steamodded's (pseudorandom_element sorts the keys). */
export const RANKS = {
  2: { key: '2', card_key: '2' }, 3: { key: '3', card_key: '3' }, 4: { key: '4', card_key: '4' }, 5: { key: '5', card_key: '5' },
  6: { key: '6', card_key: '6' }, 7: { key: '7', card_key: '7' }, 8: { key: '8', card_key: '8' }, 9: { key: '9', card_key: '9' },
  10: { key: '10', card_key: 'T' }, Jack: { key: 'Jack', card_key: 'J' }, Queen: { key: 'Queen', card_key: 'Q' },
  King: { key: 'King', card_key: 'K' }, Ace: { key: 'Ace', card_key: 'A' },
};
export const SUITS_T = { Spades: { key: 'Spades', card_key: 'S' }, Hearts: { key: 'Hearts', card_key: 'H' }, Clubs: { key: 'Clubs', card_key: 'C' }, Diamonds: { key: 'Diamonds', card_key: 'D' } };
const SUIT_CODE = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };
const RANK_CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
/** SMODS.change_base(card, suit, rank) — rank/suit keys ('Ace', 'Spades'); nil keeps the card's own. */
export function change_base(card, suit, rank) {
  const s = SUIT_CODE[suit || card.base.suit], r = RANK_CODE[rank || card.base.value];
  if (!s || !r) return false;
  card.set_base(P_CARDS[s + '_' + r]);
  return true;
}

/**
 * SMODS.poll_seal({key, mod, guaranteed, type_key}): weighted over the Seal pool (weight 5 each unless
 * a seal sets its own), rolled only when guaranteed or the key's chance hits.
 */
export function poll_seal(args = {}) {
  const key = (args.key || 'stdseal');
  const mod = args.mod || 1;
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  const hit = pseudorandom(pseudoseed(key + G.GAME.round_resets.ante)) > 1 - 0.02 * mod;
  if (!(hit || args.guaranteed)) return null;
  const options = P_CENTER_POOLS.Seal.filter((s) => !(s.in_pool && !s.in_pool(s)));
  let total = 0;
  const avail = options.map((s) => { const w = (P_SEALS[s.key] && P_SEALS[s.key].weight) || 5; total += w; return { key: s.key, weight: w }; });
  const poll = pseudorandom(pseudoseed(type_key));
  let wi = 0;
  for (const v of avail) { wi += v.weight; if (poll > 1 - wi / total) return v.key; }
  return null;
}

/**
 * The Lua's progressbar(val, max) for Colour cards / Sapling / Brass Joker: '#' x val, '#' x (max - val)
 * (or val, '/max' past `cap`).
 */
export function progressbar(val, max, cap = 10) {
  if (max > cap) return [val, '/' + max];
  return ['#'.repeat(Math.max(0, val)), '#'.repeat(Math.max(0, max - val))];
}

/** A Card for a center key (G.P_CARDS.empty front) — Lua `Card(..., G.P_CARDS.empty, G.P_CENTERS[key])`. */
export const center_card = (key, params) => new Card(P_CARDS.empty, P_CENTERS[key], params || {});
export { localize };

/**
 * A joker center: the mod's static data (data.js: name, atlas cell, rarity, cost, config, compat flags)
 * plus its behaviour (calculate / loc_vars / add_to_deck / ...). `slug` is the file name (j_mf_<slug>).
 */
export function joker(slug, def = {}) {
  const s = DATA.jokers['j_mf_' + slug];
  if (!s) throw new Error('morefluff: no data for joker ' + slug);
  return { ...JSON.parse(JSON.stringify(s)), set: 'Joker', unlocked: true, discovered: true, ...def };
}
