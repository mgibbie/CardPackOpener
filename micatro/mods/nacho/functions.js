/**
 * Nacho's Pokermon Dip — src/functions/nacho_functions.lua + nacho_utils.lua, natively:
 * deck_rank_evo, the Mega Gallade highlight rule (CardArea.parse_highlighted override), the
 * Oranguru Standard-pack card (SMODS.Booster take_ownership 'Standard'), the mod's set_debuff
 * rules, Count_ranks, calc_most_played_hand, calc_boss_trigger (Turtonator) and
 * common_ranks_tooltip (Oranguru). Names are the Lua names.
 */
import {
  G, P_CARDS, pseudorandom, pseudoseed, pseudorandom_element, poll_edition, create_card,
  can_evolve, poke_evolve, find_card, find_joker, any, has_no_rank, RANKS, RANK_ID, get_poker_hand_info,
} from '../pokermon/api.js';
import { P_SEALS, get_current_pool } from '../../js/engine/core.js';
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

/**
 * Mega Gallade (CardArea.parse_highlighted override): highlighted cards are judged undebuffed,
 * every hand card's debuff is recalculated, and if the selection makes your most played hand
 * while Mega Gallade is owned, the highlighted cards stay undebuffed (so they score).
 * Runs on every selection change (registry hook hand_highlighted).
 */
export function parse_highlighted() {
  if (!on() || !G.hand || !G.GAME.blind) return;
  for (const c of G.hand.highlighted) if (c.debuff) c.set_debuff(false);
  const { text } = get_poker_hand_info(G.hand.highlighted);
  for (const c of G.hand.cards) G.GAME.blind.debuff_card(c); // SMODS.recalc_debuff
  if (text === calc_most_played_hand() && any(find_card('j_nacho_mega_gallade'))) {
    for (const c of G.hand.highlighted) if (c.debuff) c.set_debuff(false);
  }
}

/** SMODS.current_mod.set_debuff: Mega Gallade and (with Altaria) every 9 can't be debuffed. */
export function set_debuff(card) {
  if (!on()) return undefined;
  if (card.ability.name === 'mega_gallade') return 'prevent_debuff';
  // (Nacho's Altaria only: find_joker('altaria') also matched Pokermon's own Altaria, which has no such rule — add-on dedupe.)
  if (card.base && card.base.id !== undefined && card.get_id() === 9 && find_joker('altaria').some((c) => c.config.center.key === 'j_nacho_altaria')) return 'prevent_debuff';
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

/** SMODS.poll_seal({mod}) — the weighted seal roll (2% base x mod), over the current Seal pool. */
function poll_seal(args = {}) {
  let key = args.key || 'stdseal';
  const mod = args.mod || 1;
  const options = get_current_pool('Seal')[0];
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  key = key + G.GAME.round_resets.ante;
  const avail = [];
  let total_weight = 0;
  for (const v of options) {
    if (v === 'UNAVAILABLE') continue;
    const o = typeof v === 'string' ? { key: v, weight: (P_SEALS[v] && P_SEALS[v].weight) ?? 5 } : { key: v.key, weight: v.weight ?? 5 };
    if (o.weight > 0) { avail.push(o); total_weight += o.weight; }
  }
  total_weight = total_weight + (total_weight / 2 * 98);
  let type_weight = 0;
  for (const v of avail) type_weight += v.weight;
  if (pseudorandom(pseudoseed(key)) > 1 - (type_weight * mod / total_weight)) {
    const seal_type_poll = pseudorandom(pseudoseed(type_key));
    let weight_i = 0;
    for (const v of avail) { weight_i += v.weight; if (seal_type_poll > 1 - (weight_i / type_weight)) return v.key; }
  }
  return undefined;
}

/**
 * The Standard booster's create_card while Oranguru is owned (take_ownership_by_kind 'Standard'):
 * a card of one of your most common ranks, random suit. (Without Oranguru the take_ownership
 * just re-states SMODS's own Standard card, so Micatro keeps the base pack roll.)
 * Registry hook pack_card(booster, i) -> Card.
 */
export function standard_pack_card(booster) {
  if (!on() || !booster.ability.name.includes('Standard') || !any(find_card('j_nacho_oranguru'))) return undefined;
  const ante = G.GAME.round_resets.ante;
  const _edition = poll_edition('standard_edition' + ante, 2, true);
  const _seal = poll_seal({ mod: 10 });
  const _ranks = common_ranks().map((r) => CARD_KEY[r]);
  const _rank = pseudorandom_element(_ranks, pseudoseed('staranks' + ante))[0]
    || pseudorandom_element(Object.values(CARD_KEY), pseudoseed('staranks' + ante))[0];
  const _suit = pseudorandom_element({ Clubs: 'C', Diamonds: 'D', Hearts: 'H', Spades: 'S' }, pseudoseed('stasuits' + ante))[0];
  const set = pseudorandom(pseudoseed('stdset' + ante)) > 0.6 ? 'Enhanced' : 'Base';
  const card = create_card(set, G.pack_cards, null, null, true, true);
  card.set_base(P_CARDS[_suit + '_' + _rank]);
  if (_edition) card.set_edition(_edition);
  if (_seal) card.set_seal(_seal);
  return card;
}

/**
 * calc_boss_trigger(context) (Turtonator): true when the current Boss Blind's ability fires.
 * Stateful through G.GAME.blind.nametracker / serpentcheck, like the Lua.
 */
export function calc_boss_trigger(context) {
  const B = G.GAME.blind;
  if (context.blind && context.blind.boss && !B.nametracker) B.nametracker = context.blind.name;
  if (context.setting_blind && context.blind && context.blind.boss) {
    const boss_name = context.blind.name;
    // These boss blinds trigger only at the start
    if (['The Wall', 'The Water', 'The Manacle', 'The Needle', 'Amber Acorn', 'Violet Vessel'].includes(boss_name) && !B.disabled) return true;
  }
  if (B.nametracker) {
    const boss_name = B.nametracker;
    if (context.debuffed_hand || context.joker_main) {
      // The Window, Head, Club, Goad, Plant, Pillar, Flint, Eye, Mouth, Psychic, Arm, Ox, Verdant Leaf
      if (B.triggered) { B.nametracker = undefined; return true; }
    } else if (context.first_hand_drawn && boss_name === 'The House') {
      B.nametracker = undefined;
      return true;
    } else if ((context.press_play || context.pre_discard) && boss_name === 'The Serpent' && G.hand.highlighted.length > 3) {
      B.serpentcheck = true;
    } else if (context.press_play) {
      // The Hook, The Tooth, Crimson Heart, Cerulean Bell, Chartreuse Chamber (cgoose; Pokermon 3.9.1: bl_poke_iridescent_hacker)
      let jokdebuff = false;
      for (const j of G.jokers.cards) if (j.debuff) { jokdebuff = true; break; }
      let forcedselection = false;
      for (const v of G.hand.highlighted) {
        // (pokermon_forced_selection: Nacho's blind.lua patch tags the Bell's card — the vanilla
        // forced_selection is already cleared when the hand is played.)
        if (v.ability.forced_selection || v.ability.pokermon_forced_selection) { v.ability.pokermon_forced_selection = undefined; forcedselection = true; }
      }
      if ((boss_name === 'The Hook' && (G.hand.cards.length - G.hand.highlighted.length) > 0)
        || boss_name === 'The Tooth'
        || ((boss_name === 'Crimson Heart' || boss_name === 'bl_poke_cgoose' || boss_name === 'cgoose' || boss_name === 'bl_poke_iridescent_hacker') && jokdebuff)
        || (boss_name === 'Cerulean Bell' && forcedselection)) {
        B.nametracker = undefined;
        return true;
      }
    } else if (context.hand_drawn) {
      // The Serpent (cont.), The Wheel, The Mark, The Fish
      let facedown = false;
      for (const v of context.hand_drawn) if (v.facing === 'back') facedown = true;
      if ((boss_name === 'The Serpent' && B.serpentcheck) || ((boss_name === 'The Wheel' || boss_name === 'The Mark' || boss_name === 'The Fish') && facedown)) {
        if (B.serpentcheck) B.serpentcheck = undefined;
        B.nametracker = undefined;
        return true;
      }
    } else if (context.end_of_round) {
      B.nametracker = undefined;
    }
  }
  return undefined;
}

/** SMODS `context.main_eval`: set for the joker-area evaluations (Micatro: cardarea = G.jokers). */
export const main_eval = (context) => !!(context.main_eval || context.cardarea === G.jokers);
