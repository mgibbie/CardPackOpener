/**
 * Pokermon's changes to base-game rules — the lovely.toml patches and pokermon.lua
 * overrides, rebuilt as engine hook implementations (see registry HOOKS):
 *
 *   find_joker_alias  Pansear/Simisear = Four Fingers, Panpour/Simipour = Pareidolia,
 *                     Pansage/Simisage = Shortcut, Smeargle = Smeared Joker
 *                     (lovely "Shortcut Pareidolia Four Fingers effects", pokermon.lua:442-463)
 *   straight_min /    Aipom (or Ambipom on a 3-card hand): 3-card straights and flushes
 *   flush_min         (pokermon.lua PokerHandPart _straight / get_flush)
 *   splash            Magikarp / Feebas / Luvdisc: every played card scores (applies_splash)
 *   is_face           Probopass: Stone Cards are face cards
 *   set_debuff        debufffunctions.lua: fainted Baby Pokémon stay debuffed for the rest of
 *                     the round; Gholdengo can't be debuffed, Tangrowth protects Wild Cards,
 *                     Tentacruel protects 10s
 *   set_cost          Rotom / Rotom Dex booster discounts, Gothita line planet discounts,
 *                     sell value at least $1, Unown sells for $0
 *   create_card       decks' forced seal on playing cards (Obituary / Revenant decks) and
 *                     random Tera type on jokers (Luminous deck: G.GAME.modifiers.apply_type)
 *   evaluate_round    Jirachi (banker) doubles the cash-out; Double Rainbow Energy's interest
 *                     lockout ends (reset_no_interest)
 *   reset_game_globals  per-round Bulbasaur rank, Espeon card, Gligar suit, Sneasel rank
 *   pack_size         extra_pocket_picks (+N cards in every pack); Xatu: Celestial packs hold
 *                     every Planet
 *   can_reserve       Pocket packs / G.GAME.poke_save_all / Megastone: pack cards can be saved
 *   calculate         Garbodor's per-ante discard counter (post_discard)
 * plus faint_baby_poke / volatile_active (Baby and volatile Pokémon position rules).
 */
import { G, P_CENTER_POOLS, P_CENTERS, find_joker, card_eval_status_text, localize, pseudorandom_element, pseudoseed } from '../../../js/engine/core.js';
import { find_card, any, has_no_rank, has_no_suit, applies_splash } from './utils.js';
import { apply_type_sticker, type_sticker_applied } from './types.js';
import { energy_increase } from './energy.js';

// ------------------------------------------------------------ aliases
const ALIASES = {
  'Four Fingers': ['pansear', 'simisear'],
  Pareidolia: ['panpour', 'simipour'],
  Shortcut: ['pansage', 'simisage'],
  'Smeared Joker': ['smeargle'],
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
export const straight_min = (n, hand) => (aipom(hand) ? 3 : undefined);
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

// ------------------------------------------------------------------ costs
export function set_cost(card) {
  const a = card.ability;
  const couponed = card.area && a.couponed && (card.area === G.shop_jokers || card.area === G.shop_booster);
  let changed = false;
  if (!couponed && !a.rental) {
    if (a.set === 'Booster') {
      const r = find_joker('rotom').length;
      const rd = find_joker('rotomdex').length;
      if (r || rd) { card.cost = Math.max(0, card.cost - r); card.cost = Math.max(0, card.cost - (G.GAME.rotom_discount || 0) * rd); changed = true; }
    }
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
export function evaluate_round(rows) {
  const out = [];
  let dollars = 0;
  for (const r of rows) dollars += r.dollars || 0;
  const jirachis = find_joker('jirachi_banker');
  jirachis.forEach((j, i) => {
    out.push({ name: 'joker_jirachi' + (i + 1), dollars, bonus: true, card: j.sort_id, center: j.config.center.key });
    dollars = dollars + dollars;
  });
  if (G.GAME.modifiers.reset_no_interest) G.GAME.modifiers.no_interest = undefined;
  return out.length ? out : undefined;
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
/** SMODS.current_mod.reset_game_globals (pokermon.lua). */
export function reset_game_globals(run_start) {
  reset_bulba_rank();
  reset_espeon_card();
  reset_gligar_suit();
  reset_sneasel_rank();
}

// ------------------------------------------------------------------ packs
export function pack_size(n, card) {
  if (String(card.ability.name).includes('Celestial') && find_joker('xatu').length) return P_CENTER_POOLS.Planet.length;
  if (G.GAME.extra_pocket_picks && G.GAME.extra_pocket_picks > 0) return n + G.GAME.extra_pocket_picks;
  return undefined;
}

export function can_reserve(card) {
  const pack = P_CENTERS[G.GAME.pack_center];
  const label = pack ? String(pack.name || '') : '';
  if (label.includes('Pocket')) return true;
  if (G.GAME.poke_save_all && !label.includes('Wish')) return true;
  if (card.ability.name === 'megastone') return true;
  return undefined;
}

// --------------------------------------------------------- mod contexts
/** Mod-level calculate: Garbodor's discards-this-ante counter (lovely "Garbodor functionality"). */
export function calculate(context) {
  if (context.post_discard) {
    // The Lua bumps the counter where discards_used goes up and zeroes it when the ante changes.
    if (G.GAME.poke_ante_of_discards !== G.GAME.round_resets.ante) { G.GAME.poke_ante_discards_used = 0; G.GAME.poke_ante_of_discards = G.GAME.round_resets.ante; }
    G.GAME.poke_ante_discards_used = (G.GAME.poke_ante_discards_used || 0) + 1;
  }
  return undefined;
}
