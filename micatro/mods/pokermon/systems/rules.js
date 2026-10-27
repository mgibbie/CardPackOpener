/**
 * Pokermon's changes to base-game rules — the lovely.toml patches and pokermon.lua
 * overrides, rebuilt as engine hook implementations (see registry HOOKS):
 *
 *   find_joker_alias  Pansear/Simisear = Four Fingers, Panpour/Simipour = Pareidolia,
 *                     Pansage/Simisage = Shortcut, Smeargle = Smeared Joker
 *                     (lovely "Shortcut Pareidolia Four Fingers effects", pokermon.lua:442-463)
 *   straight_min /    Aipom (or Ambipom on a 3-card hand): 3-card straights and flushes; Surskit / Masquerain:
 *                     straights with duplicate ranks (3.9.1)
 *   flush_min         (pokermon.lua PokerHandPart _straight / get_flush)
 *   splash            Magikarp / Feebas / Luvdisc: every played card scores (applies_splash)
 *   is_face           Probopass: Stone Cards are face cards
 *   set_debuff        debufffunctions.lua: fainted Baby Pokémon stay debuffed for the rest of
 *                     the round; Gholdengo can't be debuffed, Tangrowth protects Wild Cards,
 *                     Tentacruel protects 10s; the owner's designs: Kubfu / Urshifu can't be debuffed,
 *                     Single Strike Urshifu protects every playing card (Unseen Fist)
 *   set_cost          Minun ($1 off Jokers, Boosters, consumables), Chimecho (free Vouchers), Rotom / Rotom Dex booster discounts, Gothita line planet discounts,
 *                     sell value at least $1, Unown sells for $0
 *   create_card       decks' forced seal on playing cards (Obituary / Revenant decks) and
 *                     random Tera type on jokers (Luminous deck: G.GAME.modifiers.apply_type)
 *   evaluate_round    Double Rainbow Energy's interest lockout ends (reset_no_interest)
 *   reset_game_globals  per-round Bulbasaur rank, Espeon card, Gligar suit, Sneasel rank, Bramblin rank, Wingull rank, Skitty type,
 *                     Bronzor card
 *   pack_size         extra_pocket_picks (+N cards in every pack)
 *   can_reserve       Pocket packs / G.GAME.poke_save_all / Megastone: pack cards can be saved
 *   calculate         the Poli suit (after every scored hand, 3.9.1); Garbodor's per-ante discard counter
 *                     (post_discard)
 * plus faint_baby_poke / volatile_active (Baby and volatile Pokémon position rules).
 */
import { G, P_CENTERS, find_joker, card_eval_status_text, localize, pseudorandom_element, pseudoseed } from '../../../js/engine/core.js';
import { find_card, any, has_no_rank, has_no_suit, applies_splash, poke_change_poli_suit, poke_change_beat, poke_add_hazards, has_enhancement, get_upgraded_pack_center } from './utils.js';
import { apply_type_sticker, type_sticker_applied, get_type, is_type } from './types.js';
import { get_poker_hand_info } from '../../../js/engine/run.js';
import { add_card } from './utils.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { energy_increase, matching_energy } from './energy.js';

// ------------------------------------------------------------ aliases
const ALIASES = {
  'Four Fingers': ['pansear', 'simisear'],
  Pareidolia: ['panpour', 'simipour'],
  Shortcut: ['pansage', 'simisage'],
  // (3.2.1's Smeargle-as-Smeared-Joker is gone in 3.9.1: Smeargle only copies its sketched joker.)
};
export function find_joker_alias(name, non_debuff) {
  const names = ALIASES[name];
  if (!names) return undefined;
  const out = [];
  for (const area of [G.jokers, G.consumeables]) {
    if (!area) continue;
    for (const v of area.cards) if (names.includes(v.ability.name) && (non_debuff || !v.debuff)) out.push(v);
  }
  return out;
}

// ---------------------------------------------------- poker hand parts
const aipom = (hand) => any(find_card('j_poke_aipom')) || (hand.length === 3 && any(find_card('j_poke_ambipom')));
/** get_X_same(num, hand) count: ranks (positive ids) held by exactly `num` cards of the hand. */
function x_same(num, hand) {
  const by_id = {};
  for (const c of hand) { const id = c.get_id(); if (id > 0) by_id[id] = (by_id[id] || 0) + 1; }
  return Object.values(by_id).filter((n) => n === num).length;
}
/**
 * pokeutils.lua's `_straight` PokerHandPart (3.9.1): Aipom (or Ambipom on a 3-card hand) -> 3; Surskit / Masquerain
 * (3.9.1, sub-batch 11) lower it by every duplicate (a pair -1, three -2, four -3, five -4), never below 2; then
 * min(that, SMODS.four_fingers) — `n` is the engine's 5, or 4 with Four Fingers.
 */
export const straight_min = (n, hand) => {
  const surskit = any(find_card('j_poke_surskit')) || any(find_card('j_poke_masquerain'));
  if (!surskit) return aipom(hand) ? 3 : undefined;
  let min = aipom(hand) ? 3 : 5;
  min = min - x_same(2, hand) - x_same(3, hand) * 2 - x_same(4, hand) * 3 - x_same(5, hand) * 4;
  min = Math.max(2, min);
  return Math.min(min, n);
};
export const flush_min = (n, hand) => (aipom(hand) ? Math.min(n, 3) : undefined);
export const splash = () => (applies_splash() ? true : undefined);
export function is_face(card, base) {
  if (!base && any(find_card('j_poke_probopass')) && card.ability.name === 'Stone Card') return true;
  return undefined;
}

// --------------------------------------------------------------- debuffs
/** debufffunctions.lua (SMODS mod.set_debuff): true / 'prevent_debuff' / no opinion. */
export function set_debuff(card) {
  if (card && card.ability && card.ability.fainted === G.GAME.round) {
    const S = G.STATES;
    return (G.STATE === S.SELECTING_HAND || G.STATE === S.HAND_PLAYED || G.STATE === S.DRAW_TO_HAND) ? true : undefined;
  }
  if (card.ability.name === 'gholdengo') return 'prevent_debuff';
  // (the owner's designs, jokers/pokejokers_designs.js: Inner Focus / Unseen Fist)
  if (card.ability.name === 'kubfu' || card.ability.name === 'urshifu_single' || card.ability.name === 'urshifu_rapid') return 'prevent_debuff';
  if ((card.ability.set === 'Default' || card.ability.set === 'Enhanced') && find_joker('urshifu_single').length) return 'prevent_debuff';
  if (card.ability.name === 'Wild Card' && find_joker('tangrowth').length) return 'prevent_debuff';
  if (card.get_id() === 10 && find_joker('tentacruel').length) return 'prevent_debuff';
  return undefined;
}

/** A Baby Pokémon faints (debuffed for the round) unless every joker to its right is a Baby. */
export function faint_baby_poke(self, card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint && context.joker_main) {
    let alive = true;
    let self_pos = 0, adult_pos = 0;
    const rightmost_stage = G.jokers.cards[G.jokers.cards.length - 1].config.center.stage;
    if (!rightmost_stage || rightmost_stage !== 'Baby') alive = false;
    if (alive) {
      for (let i = 0; i < G.jokers.cards.length; i++) {
        const stage = G.jokers.cards[i].config.center.stage;
        if (G.jokers.cards[i] === card) self_pos = i + 1;
        if (!stage || stage !== 'Baby') adult_pos = i + 1;
      }
      if (adult_pos > self_pos) alive = false;
    }
    if (!alive) {
      G.E_MANAGER.add_event(() => { card.ability.fainted = G.GAME.round; card.set_debuff(); });
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_faint_ex'), colour: 'MULT' });
    }
  }
}

/** Volatile jokers only work at the far left ('left') / far right ('right') of the normal jokers. */
export function volatile_active(self, card, direction) {
  let active = true;
  let first_pos = null, self_pos = 0, normal_pos = 0;
  for (let i = 0; i < G.jokers.cards.length; i++) {
    const volatile = G.jokers.cards[i].config.center.volatile;
    if (G.jokers.cards[i] === card) self_pos = i + 1;
    if (!volatile) { normal_pos = i + 1; if (!first_pos) first_pos = i + 1; }
  }
  if (direction === 'left' && first_pos && first_pos < self_pos) active = false;
  if (direction === 'right' && normal_pos > self_pos) active = false;
  return active;
}

/**
 * poker_hand_cards: 3.9.1's G.FUNCS.get_poker_hand_info wrap (pokermon.lua) — the cards Zangoose added to a played hand
 * (poke_zangoose_card) don't change the poker hand; its modify_scoring_hand answer makes them score.
 */
export const poker_hand_cards = (cards) => (cards.some((c) => c.poke_zangoose_card) ? cards.filter((c) => !c.poke_zangoose_card) : undefined);

// ------------------------------------------------------------------ costs
export function set_cost(card) {
  const a = card.ability;
  const couponed = card.area && a.couponed && (card.area === G.shop_jokers || card.area === G.shop_booster);
  let changed = false;
  if (!couponed && !a.rental) {
    // Pokermon 3.9.1 (lovely poke_utils.toml): every Joker, Booster and consumable costs $1 less per Minun.
    if (a.set === 'Joker' || a.set === 'Booster' || a.consumeable) {
      const m = find_joker('minun').length;
      if (m) { card.cost = Math.max(0, card.cost - m); changed = true; }
    }
    if (a.set === 'Booster') {
      const r = find_joker('rotom').length;
      const rd = find_joker('rotomdex').length;
      if (r || rd) { card.cost = Math.max(0, card.cost - r); card.cost = Math.max(0, card.cost - (G.GAME.rotom_discount || 0) * rd); changed = true; }
    }
    // Pokermon 3.9.1 (the same patch): Vouchers are free with Chimecho.
    if (a.set === 'Voucher' && find_joker('chimecho').length) { card.cost = 0; changed = true; }
    if (a.set === 'Planet' || (a.set === 'Booster' && String(a.name).includes('Celestial'))) {
      const g1 = find_joker('gothita').length, g2 = find_joker('gothorita').length, g3 = find_joker('gothitelle').length;
      if (g1) { card.cost = Math.max(0, card.cost - 2 * g1); changed = true; }
      if (g2) { card.cost = Math.max(0, card.cost - 3 * g2); changed = true; }
      if (g3) { card.cost = 0; changed = true; }
    }
  }
  if (changed) card.sell_cost = Math.max(1, Math.floor(card.cost / 2)) + (a.extra_value || 0);
  // lovely "Drain functionality"
  if (card.sell_cost < 1) card.sell_cost = 1;
  if (a.name === 'unown') card.sell_cost = 0;
}

// ---------------------------------------------------------- created cards
export function create_card(card, _type) {
  if (card.base && card.base.suit && G.GAME.modifiers.poke_force_seal) card.set_seal(G.GAME.modifiers.poke_force_seal);
  if (_type === 'Joker' && G.GAME.modifiers.apply_type) {
    apply_type_sticker(card);
    energy_increase(card, type_sticker_applied(card));
  }
}

// --------------------------------------------------------------- cash-out
// (Jirachi Banker's cash-out: Pokermon 3.9.1 dropped the lovely "Jirachi Double Payout" patch; the joker's own
// modify_final_cashout context now multiplies the payout, jokers/pokejokers_13.js.)
export function evaluate_round() {
  if (G.GAME.modifiers.reset_no_interest) G.GAME.modifiers.no_interest = undefined;
  // The Mystery Dungeon challenge on the Vending deck's effect (3.9.1 pokermon.lua: poke_vending, batch 17): a Voucher Tag after
  // each odd Ante's Boss, as the Vending deck's own cash-out (backs/backs1.js).
  if (G.GAME.modifiers.poke_vending && G.GAME.last_blind && G.GAME.last_blind.boss && ((G.GAME.round_resets.ante - 1) % 2 === 1)) {
    G.E_MANAGER.add_event(() => { add_tag(new Tag('tag_voucher')); });
  }
  // 3.9.1 "Enhance bonus" (lovely gameplay_functions.toml, the Debris deck / sleeve): $N per playing card with the
  // modifier's enhancement in the full deck. (Lua puts the row after the discards row; ours comes last - same total.)
  const m = G.GAME.modifiers;
  if (m.poke_money_per_enhancement) {
    let tally = 0;
    for (const c of G.playing_cards) if (has_enhancement(c, m.poke_enhance_bonus)) tally = tally + 1;
    if (tally > 0) return { name: `${tally} ${m.poke_enhance_bonus_text || localize('poke_hazards_in_deck')}`, dollars: tally * m.poke_money_per_enhancement, disp: tally, bonus: true, poke_enhance_bonus: m.poke_enhance_bonus };
  }
  return undefined;
}

// --------------------------------------------------------- per-round resets
export function reset_bulba_rank() {
  G.GAME.current_round.bulb1card = { rank: 'Ace' };
  const valid = G.playing_cards.filter((v) => v.ability.effect !== 'Stone Card' && !has_no_rank(v));
  if (valid[0]) {
    const [c] = pseudorandom_element(valid, pseudoseed('bulb' + G.GAME.round_resets.ante));
    G.GAME.current_round.bulb1card.rank = c.base.value;
    G.GAME.current_round.bulb1card.id = c.base.id;
  }
}
export function reset_espeon_card() {
  const cr = G.GAME.current_round;
  cr.espeon_rank = 'Ace'; cr.espeon_id = 14; cr.espeon_suit = 'Spades';
  const valid = G.playing_cards.filter((v) => !has_no_suit(v) && !has_no_rank(v));
  const [c] = pseudorandom_element(valid, pseudoseed('espeon' + G.GAME.round_resets.ante));
  if (c) { cr.espeon_rank = c.base.value; cr.espeon_id = c.base.id; cr.espeon_suit = c.base.suit; }
}
export function reset_gligar_suit() {
  const suits = ['Spades', 'Hearts', 'Clubs', 'Diamonds'].filter((v) => v !== G.GAME.current_round.gligar_suit);
  G.GAME.current_round.gligar_suit = pseudorandom_element(suits, pseudoseed('gligar' + G.GAME.round_resets.ante))[0];
}
export function reset_sneasel_rank() {
  G.GAME.current_round.sneaselcard = { rank: 'Ace' };
  const valid = G.playing_cards.filter((v) => v.ability.effect !== 'Stone Card');
  if (valid[0]) {
    const [c] = pseudorandom_element(valid, pseudoseed('sneasel' + G.GAME.round_resets.ante));
    G.GAME.current_round.sneaselcard.rank = c.base.value;
    G.GAME.current_round.sneaselcard.id = c.base.id;
  }
}
/** Pokermon 3.9.1 pokermon.reset_rank(name) (pokefunctions.lua): a random ranked deck card's rank, seed name..ante. */
export function reset_rank(name) {
  G.GAME.current_round[name] = { rank: 'Ace' };
  const valid = G.playing_cards.filter((v) => !has_no_rank(v));
  if (valid[0]) {
    const [c] = pseudorandom_element(valid, pseudoseed(name + G.GAME.round_resets.ante));
    G.GAME.current_round[name].rank = c.base.value;
    G.GAME.current_round[name].id = c.base.id;
  }
}
/** Pokermon 3.9.1 pokermon.reset_type(name, exclude_names): the type of a random typed joker (not the excluded ones). */
export function reset_type(name, exclude_names) {
  G.GAME.current_round[name] = 'Grass';
  const valid_types = [];
  for (const v of (G.jokers ? G.jokers.cards : [])) {
    if (exclude_names.includes(v.ability.name)) continue;
    const t = get_type(v);
    if (t) valid_types.push(t);
  }
  if (valid_types.length > 0) G.GAME.current_round[name] = pseudorandom_element(valid_types, pseudoseed(name + G.GAME.round_resets.ante))[0];
}
/**
 * Pokermon 3.9.1's get_pack wrap (pokeutils.lua, Drampa; new-jokers sub-batch 15): with a Drampa, a shop pack is Jumbo or
 * better (with a Mega Drampa, Mega: batch 16). (The engine's first-shop Buffoon pack is returned before the get_pack hook.)
 */
export function get_pack(center, _key) {
  if (_key !== 'shop_pack' || !center) return undefined;
  if (any(find_card('j_poke_mega_drampa'))) return get_upgraded_pack_center(center, 'mega') || center;
  if (any(find_card('j_poke_drampa'))) return get_upgraded_pack_center(center, 'jumbo') || center;
  return undefined;
}
/** SMODS.current_mod.reset_game_globals (pokermon.lua). */
export function reset_game_globals(run_start) {
  // Safety First (3.9.1 pokermon.lua reset_game_globals, batch 17): no Energy cards in the shop
  if (run_start && G.GAME.modifiers.poke_no_energy) G.GAME.energy_rate = 0;
  reset_bulba_rank();
  reset_espeon_card();
  reset_gligar_suit();
  reset_sneasel_rank();
  // (sub-batch 15) Bramblin / Brambleghast's rank (3.9.1 resets it before Wingull's; each has its own seed).
  reset_rank('bramblincard');
  // Pokermon 3.9.1 (sub-batch 11): Wingull / Pelipper's rank, Skitty's (and Delcatty's) type of the round.
  reset_rank('wingullcard');
  reset_type('cattype', ['skitty', 'delcatty']);
  // (sub-batch 14) Bronzor / Bronzong's card of the round.
  reset_bronzo_card();
}

/**
 * pokermon.reset_bronzo_card (3.9.1 pokefunctions.lua): the rank and suit of a random playing card that has both (seed
 * 'bronzo' .. ante); Ace of Spades without one.
 */
export function reset_bronzo_card() {
  const cr = G.GAME.current_round;
  cr.bronzo_rank = 'Ace';
  cr.bronzo_id = 14;
  cr.bronzo_suit = 'Spades';
  const valid = (G.playing_cards || []).filter((c) => !has_no_suit(c) && !has_no_rank(c));
  if (!valid.length) return;
  const [bronzo_card] = pseudorandom_element(valid, pseudoseed('bronzo' + G.GAME.round_resets.ante));
  if (bronzo_card) {
    cr.bronzo_rank = bronzo_card.base.value;
    cr.bronzo_id = bronzo_card.base.id;
    cr.bronzo_suit = bronzo_card.base.suit;
  }
}

// ------------------------------------------------------------------ packs
// (3.2.1's lovely "Xatu Make All Planets Appear" — a Celestial pack held every Planet with Xatu out — is gone in
// 3.9.1: Xatu now makes the last hand's Planet when a Celestial pack opens, pokejokers_06.js.)
export function pack_size(n, card) {
  if (G.GAME.extra_pocket_picks && G.GAME.extra_pocket_picks > 0) return n + G.GAME.extra_pocket_picks;
  return undefined;
}

export function can_reserve(card) {
  const pack = P_CENTERS[G.GAME.pack_center];
  const label = pack ? String(pack.name || '') : '';
  if (label.includes('Pocket')) return true;
  if (G.GAME.poke_save_all && !label.includes('Wish')) return true;
  if (card.ability.name === 'megastone') return true;
  // (3.9.1 pokermon.can_save_consumable: or card.config.center.saveable -- the Meteorite, sub-batch 14)
  if (card.config.center.saveable) return true;
  return undefined;
}

// --------------------------------------------------------- mod contexts
/** Mod-level calculate: the Poli suit; Garbodor's discards-this-ante counter (lovely "Garbodor functionality"). */
/** The Obituary Sleeve's alt: a Negative Energy matching this card's type (none for a typeless card). */
export function obituary_energy(card) {
  const key = matching_energy(card, true);
  if (key) add_card({ key, edition: 'e_negative' });
}

export function calculate(context) {
  // Pokermon 3.9.1 (pokermon.lua SMODS.current_mod.calculate): the Poliwag line's suit cycles after every scored hand,
  // with or without a Poli joker (the engine passes `after` here: js/engine/smods.js mod_calculate).
  // Upstream main (after 3.9.1, sub-batch 15b): the Lotad line's beat (2 / 4 cards) swaps there too (pokermon.change_beat).
  if (context.after) { poke_change_poli_suit(); poke_change_beat(); }
  // Leafeon (3.9.1): count Lucky cards that successfully triggered this round (run-wide, Leafeon or not); reset at the
  // end of the round. (The engine passes `individual` / `end_of_round` here too: smods.js MOD_VANILLA_CONTEXTS.)
  if (context.individual && context.cardarea === G.play && context.other_card && context.other_card.lucky_trigger) {
    G.GAME.poke_lucky_triggers = (G.GAME.poke_lucky_triggers || 0) + 1;
  }
  if (context.end_of_round && context.main_eval) G.GAME.poke_lucky_triggers = 0;
  // The Hazard layer (3.9.1): when the first hand of a round is drawn, min(max, level) Hazard cards join the hand
  // (the engine passes first_hand_drawn here after the jokers and the blind: smods.js MOD_VANILLA_CONTEXTS).
  if (context.first_hand_drawn && G.GAME.poke_hazard_level && G.GAME.poke_hazard_level > 0) {
    const hazards = Math.min(G.GAME.poke_hazard_max ?? 3, G.GAME.poke_hazard_level);
    G.E_MANAGER.add_event(() => { poke_add_hazards(undefined, hazards, G.hand); });
  }
  if (context.post_discard) {
    // The Lua bumps the counter where discards_used goes up and zeroes it when the ante changes.
    if (G.GAME.poke_ante_of_discards !== G.GAME.round_resets.ante) { G.GAME.poke_ante_discards_used = 0; G.GAME.poke_ante_of_discards = G.GAME.round_resets.ante; }
    G.GAME.poke_ante_discards_used = (G.GAME.poke_ante_discards_used || 0) + 1;
  }
  // object_weights (3.9.1, batch 17): Jirachi's negative_edition_rate on the Edition poll's weights — pokermon.lua's e_negative /
  // e_polychrome get_weight overrides (+3 per step to Negative, the same off Polychrome down to its base 3). (3.9.1's
  // pokermon.modify_pool — weight 0 for what pokermon.remove_from_pool rules out — is pools.js pool_filter, which already
  // keeps those out of get_current_pool, the pool every poll_object draws from: the same picks.)
  if (context.modify_weights && context.pool) {
    const r = (G.GAME.negative_edition_rate || 1) - 1;
    if (r) {
      const neg = context.pool.e_negative, poly = context.pool.e_polychrome;
      if (neg) neg.weight = neg.weight + r * 3;
      if (poly) poly.weight = Math.max(3, poly.weight - r * 3);
    }
  }
  // The Obituary Sleeve's alt (3.9.1 sleeve.lua, batch 17): a destroyed joker makes a Negative Energy of its type (selling: index.js).
  if (G.GAME.modifiers.poke_obituary_alt && context.joker_type_destroyed && context.card) obituary_energy(context.card);
  // The challenges' rules (3.9.1 pokermon.lua, batch 17):
  // Imposter Syndrome: every non-Colorless joker is debuffed.
  if (G.GAME.modifiers.poke_noncolorless && context.debuff_card && context.debuff_card.area === G.jokers && !is_type(context.debuff_card, 'Colorless')) {
    return { debuff: true };
  }
  // Imposter Syndrome: a Ditto for every Boss Blind beaten (with room).
  if (G.GAME.modifiers.poke_add_ditto && context.end_of_round && context.game_over === false && context.main_eval && context.beat_boss) {
    if ((G.jokers.cards.length + G.GAME.joker_buffer) < G.jokers.config.card_limit) {
      G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
      G.E_MANAGER.add_event(() => {
        G.GAME.joker_buffer = 0;
        add_card({ set: 'Joker', key: 'j_poke_ditto', no_edition: true });
      });
    }
  }
  // Mean Look: a hand that the Foreseen cards (the scry view) also make is debuffed — "Must play an Unforeseen hand".
  if (context.debuff_hand && G.GAME.modifiers.poke_unforeseen_hand) {
    const ph = get_poker_hand_info(G.scry_view ? G.scry_view.cards : []).poker_hands;
    if (ph[context.scoring_name] && ph[context.scoring_name].length) {
      return { debuff: true, debuff_text: localize({ type: 'variable', key: 'poke_unforeseen_debuff', vars: [context.scoring_name] }) };
    }
  }
  return undefined;
}
