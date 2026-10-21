/**
 * Nacho's Pokermon Dip — the mod-level functions, natively. 1.7.9 (src/functions/mod.lua, pokedraw.lua): the mod's set_debuff
 * rules (Mega Gallade; Tsareena with every joker Grass; 9s with Mega Altaria) and common_ranks_tooltip (Oranguru).
 * 1.6.4 (src/functions/nacho_functions.lua + nacho_utils.lua), kept for the LEGACY definitions (pokemon/legacy/): deck_rank_evo
 * (Bagon line), calc_most_played_hand (Gallade), and Altaria's 9s rule. 1.7.9 dropped the rest: the Mega Gallade highlight rule
 * (1.7.9's Mega Gallade is a rework), the Oranguru Standard-pack card (1.7.9's Oranguru uses modify_booster_card) and
 * calc_boss_trigger (1.7.9's Turtonator arms on debuffs). Names are the Lua names.
 */
import { G, can_evolve, poke_evolve, find_card, find_joker, any, has_no_rank, RANKS, RANK_ID, is_type } from '../pokermon/api.js';
import { isActive } from '../../js/mods/registry.js';
import { NACHO_ID } from './defs.js';

const on = () => isActive(NACHO_ID);

/**
 * Deck Rank Evo: evolve at end of round once `percentage` of the full deck (or `flat` cards) has
 * nominal >= rank.
 * Intended-design fix: the Lua's flat path compares an undefined global `_count` (a Lua error
 * "attempt to compare nil with number" the first time a flat threshold is reached); the author
 * meant the count it just took, exactly like Pokermon's deck_enhance_evo / deck_seal_evo.
 */
export function deck_rank_evo(self, card, context, forced_key, rank, percentage, flat) {
  if (can_evolve(self, card, context, forced_key)) {
    let high_count = 0;
    for (const v of G.playing_cards) if (v.base.nominal >= rank) high_count = high_count + 1;
    if (percentage && (high_count / G.playing_cards.length >= percentage)) return { message: poke_evolve(card, forced_key) };
    else if (flat && (high_count >= flat)) return { message: poke_evolve(card, forced_key) };
  }
  return undefined;
}

/** calc_most_played_hand: the visible hand played most (ties -> the later one in G.handlist). */
export function calc_most_played_hand() {
  let _hand, _tally = 0;
  for (const v of G.handlist) {
    if (G.GAME.hands[v].visible && G.GAME.hands[v].played >= _tally) { _hand = v; _tally = G.GAME.hands[v].played; }
  }
  return _hand;
}

/** SMODS.current_mod.set_debuff (1.7.9 mod.lua): Mega Gallade, Tsareena (every joker Grass) and every 9 with Mega Altaria
 *  can't be debuffed; (legacy) every 9 with Nacho's 1.6.4 Altaria. */
export function set_debuff(card) {
  if (!on()) return undefined;
  if (card.ability.name === 'mega_gallade') return 'prevent_debuff';
  if (card.ability.name === 'tsareena' && G.jokers && G.jokers.cards.length && G.jokers.cards.every((j) => is_type(j, 'Grass'))) return 'prevent_debuff';
  if (card.base && card.base.id !== undefined && card.get_id() === 9) {
    if (any(find_card('j_poke_mega_altaria'))) return 'prevent_debuff';
    // (legacy: Nacho's 1.6.4 Altaria only — find_joker('altaria') also matched Pokermon's own Altaria, which has no such rule)
    if (find_joker('altaria').some((c) => c.config.center.key === 'j_nacho_altaria')) return 'prevent_debuff';
  }
  return undefined;
}

/** Count_ranks (from Ortalab): [{rank, count}] most common first. */
export function Count_ranks() {
  const ranks = {};
  for (const pcard of G.playing_cards) if (!has_no_rank(pcard)) ranks[pcard.base.value] = (ranks[pcard.base.value] || 0) + 1;
  const out = Object.entries(ranks).map(([rank, count]) => ({ rank, count }));
  out.sort((a, b) => b.count - a.count);
  return out;
}

const CARD_KEY = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
/** The most common rank(s) in the full deck (ties all kept), in rank order 2..Ace (Lua: pairs(SMODS.Ranks)). */
export function common_ranks() {
  const _ranks = [];
  let _tally = 0;
  for (const r of RANKS) {
    let count = 0;
    for (const v of G.playing_cards) if (v.get_id() === RANK_ID[r] && !has_no_rank(v)) count = count + 1;
    if (count > _tally) { _ranks.length = 0; _ranks.push(r); _tally = count; }
    else if (count === _tally) _ranks.push(r);
  }
  return _ranks;
}

/** common_ranks_tooltip (Oranguru's info box): the common ranks, high to low, in up to 3 lines. */
export function common_ranks_tooltip(self, info_queue) {
  let _ranks = G.playing_cards ? common_ranks() : [];
  _ranks = _ranks.slice().sort((a, b) => RANK_ID[b] - RANK_ID[a]);
  if (_ranks.length > 3) _ranks = _ranks.map((r) => (CARD_KEY[r] === 'T' ? '10' : CARD_KEY[r]));
  const lists = [];
  const n = _ranks.length;
  const per = Math.ceil(n / 4);
  if (per === 1) lists.push(_ranks.join(', '));
  else if (per === 2) { lists.push(_ranks.slice(0, Math.ceil(n / 2)).join(', ')); lists.push(_ranks.slice(Math.ceil(n / 2)).join(', ')); }
  else if (per >= 3) {
    lists.push(_ranks.slice(0, Math.ceil(n / 3)).join(', '));
    lists.push(_ranks.slice(Math.ceil(n / 3), Math.ceil(n * 2 / 3)).join(', '));
    lists.push(_ranks.slice(Math.ceil(n * 2 / 3)).join(', '));
  }
  if (lists.length > 0) info_queue.push({ set: 'Other', key: 'rank_lists_' + lists.length, vars: lists });
}

/** SMODS `context.main_eval`: set for the joker-area evaluations (Micatro: cardarea = G.jokers). */
export const main_eval = (context) => !!(context.main_eval || context.cardarea === G.jokers);
