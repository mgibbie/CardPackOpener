// More Fluff — shared helpers for the content modules (jokers*, colours, rotarots, enhancements,
// superboss, extras). Small Micatro equivalents of the Steamodded / Balatro utilities the Lua uses.
import { isActive } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, P_SEALS, Card, emit, play_sound, card_eval_status_text, localize,
  pseudorandom, pseudoseed, pseudorandom_element, juice_card, get_current_pool, create_card,
} from '../../js/engine/core.js';
import DATA from './data.js';
import { scale_card, object_weights, poll_seal_weighted, poll_enhancement_weighted, poll_object } from '../../js/engine/smods.js';
import { KEPT_156, RETIRED_ART, SAPLING_ART, CARTOMANCER_ART } from './legacy.js';

export const MOD_ID = 'morefluff';
/** More Fluff 1.9.9999's sheets: its 1x art staged at 2x nearest-neighbour (upstream dropped its 2x files; the
 *  old 2x files were that same 1x art doubled, so nothing is lost). */
export const ART = '/micatro/mods/morefluff/assets/2x/1.9.9999/';
/** The 1.5.6 sheets: kept for art the rewrite replaced with placeholder sketches (the retired "Old Fluff" jokers). */
export const ART_156 = '/micatro/mods/morefluff/assets/2x/';
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
/** FLUFF.is_colour(card): a Colour card, or a center flagged is_colour (Gold, a Spectral since 1.9.9999). */
export const is_colour = (card) => !!(card && (card.config.center.is_colour || card.ability.set === 'Colour'));
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
  // (1.9.9999 turns Steamodded's object_weights on: SMODS.poll_seal is then SMODS.poll_object over the Seal set)
  if (object_weights()) return poll_seal_weighted({ ...args, options: args.options });
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
 * SMODS.poll_enhancement({key, mod, guaranteed, no_replace, type_key}): weighted over the Enhanced pool (weight 5
 * unless an enhancement sets its own); no_replace leaves out enhancements that replace the base card (Stone,
 * Gemstone). (The same roll as Bunco's port of it.)
 */
export function poll_enhancement(args = {}) {
  // (1.9.9999 turns Steamodded's object_weights on: SMODS.poll_enhancement is then SMODS.poll_object over the Enhanced set)
  if (object_weights()) return poll_enhancement_weighted({ ...args, options: args.options });
  let key = args.key || 'std_enhance';
  const mod = args.mod || 1;
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  key = key + G.GAME.round_resets.ante;
  const avail = [];
  let total = 0;
  for (const v of get_current_pool('Enhanced')[0]) {
    if (v === 'UNAVAILABLE') continue;
    const c = P_CENTERS[v];
    if (args.no_replace && c.replace_base_card) continue;
    const w = c.weight ?? 5;
    if (w > 0) { avail.push({ key: v, weight: w }); total += w; }
  }
  total = total + (total / 40 * 60);
  let type_weight = 0;
  for (const v of avail) { const c = P_CENTERS[v.key]; v.weight = c.get_weight ? c.get_weight(c) : v.weight; type_weight += v.weight; }
  const poll = pseudorandom(pseudoseed(key));
  if (poll > 1 - (type_weight * mod / total) || args.guaranteed) {
    const tpoll = pseudorandom(pseudoseed(type_key));
    let wi = 0;
    for (const v of avail) { wi += v.weight; if (tpoll > 1 - wi / type_weight) return v.key; }
  }
  return null;
}

/**
 * SMODS.destroy_cards(cards): playing cards shatter (Glass) or dissolve and leave the deck, then the jokers hear
 * remove_playing_cards; a joker / consumable is removed (start_dissolve).
 */
export function destroy_cards(cards) {
  const playing = [];
  for (const c of [].concat(cards || [])) {
    if (!c || c.removed) continue;
    if (c.ability.set === 'Default' || c.ability.set === 'Enhanced') {
      playing.push(c);
      if (c.ability.name === 'Glass Card') c.shatter(); else c.start_dissolve();
      c.remove_from_deck();
    } else {
      c.getting_sliced = true;
      c.start_dissolve();
    }
  }
  if (playing.length) for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed: playing });
  return playing;
}

/**
 * The Lua's progressbar(val, max) for Colour cards / Sapling / Brass Joker: '#' x val, '#' x (max - val)
 * (or val, '/max' past `cap`).
 */
export function progressbar(val, max, cap = 10) {
  val = val || 0; max = max || 1;
  if (max > cap) return [val, '/' + max];
  return ['\u{1F7E9}'.repeat(Math.max(0, val)), '\u{1F7E9}'.repeat(Math.max(0, max - val))];
}

/**
 * SMODS.scale_card: the engine's (micatro/js/engine/smods.js) — the scaling_card listener pass included (Triangle's and
 * Doubled Scale's calc_scaling: More Fluff opts in to that context, index.js `smods_seams`). -> [new value, change].
 */
export { scale_card };

/**
 * SMODS.add_card({set, key, rarity, legendary, attributes, area, edition, key_append, skip_materialize}): created, added
 * to the deck and put in its area (the joker row / consumables; no room check, as Steamodded). With `attributes` and no
 * key, the key is SMODS.poll_object's (an attribute pool: Alchemy Joker's "passive" joker).
 */
export function add_card(t) {
  if (!t.key && t.attributes) { t.append = t.key_append; t.key = poll_object(t); }
  const set = t.set || (t.key && P_CENTERS[t.key] && P_CENTERS[t.key].set) || 'Joker';
  const area = t.area || (set === 'Joker' ? G.jokers : G.consumeables);
  const card = create_card(set, area, t.legendary, t.rarity, t.skip_materialize, t.soulable, t.key || undefined, t.key_append);
  if (t.edition) card.set_edition(typeof t.edition === 'string' ? { [t.edition.replace(/^e_/, '')]: true } : t.edition, true, true);
  card.add_to_deck();
  area.emplace(card);
  return card;
}

/** A Card for a center key (G.P_CARDS.empty front) — Lua `Card(..., G.P_CARDS.empty, G.P_CENTERS[key])`. */
export const center_card = (key, params) => new Card(P_CARDS.empty, P_CENTERS[key], params || {});
export { localize };

/**
 * A joker center: the mod's static data (data.js: name, atlas cell, rarity, cost, config, compat flags)
 * plus its behaviour (calculate / loc_vars / add_to_deck / ...). `slug` is the file name (j_mf_<slug>).
 */
export function joker(slug, def = {}) {
  const key = 'j_mf_' + slug;
  const s = DATA.jokers[key];
  if (!s) throw new Error('morefluff: no data for joker ' + slug);
  // (fns: the Lua functions the extractor saw — documentation only; pronouns / demicoloncompat: unused here)
  const { fns, pronouns, demicoloncompat, no_shader_on_modbadge, ...d } = JSON.parse(JSON.stringify(s));
  if (KEPT_156[key]) Object.assign(d, JSON.parse(JSON.stringify(KEPT_156[key].data)));
  if (RETIRED_ART[key]) { d.atlas = 'mf_jokers_156'; d.pos = { ...RETIRED_ART[key] }; }
  if (key === 'j_mf_sapling') { d.atlas = SAPLING_ART.atlas; d.pos = { ...SAPLING_ART.pos }; }
  if (key === 'j_mf_rot_cartomancer') { d.atlas = CARTOMANCER_ART.atlas; d.pos = { ...CARTOMANCER_ART.pos }; d.display_size = { ...CARTOMANCER_ART.display_size }; delete d.mf_rotate_by; }
  if (!d.atlas) delete d.atlas;
  if (!d.name) d.name = key; // (SMODS.Center: name = key when the Lua gives none — the Lettergems; Balatro marks used_jokers by name)
  return { ...d, set: 'Joker', unlocked: true, discovered: true, ...def };
}
