// The owner's Mega batch D (2026-11-03, "yes"; contentRev MEGA_D_REV; PORTING.md "Mega batch D"; DESIGN_GUIDE.txt 2.8): the 18 classic X/Y and
// ORAS Megas Pokermon never made a joker for, plus Mega Salamence hooked up (Nacho 1.6.4's legacy Mega Salamence hung off its retired
// Salamence, out of every pool: unreachable). Micatro's own designs; upstream Pokermon 3.9.1 draws every one of them, with a floating soul,
// on its Gen 3 / Gen 4 / Gen 6 sheets (tools/micatro/specs/pokermon_391_sprite_table.json), so there is nothing to deploy. Types from the
// card art (owner rule; every cell's type icon is its base species' type).
//
// The Mega rules are Pokermon's (systems/items.js): rarity poke_mega (never in a pool), stage Mega, $12. Only a Mega Stone (once a round;
// using it again reverts, as losing the stone does) or a Mega Berry Juice (for good) reaches one, from its base joker's `megas`. The 19
// bases are upstream / owner jokers: their `megas` (attach_classic_megas, a getter) exists only on MEGA_D_REV and later, so a run recorded
// before it re-plays exactly (a Mega Stone there still picks the joker it picked). The Megas also join their families from MEGA_D_REV on
// (FAMILY_MEMBER_REV).
//
// Banks travel both ways (CARRY): a bank both forms use goes across as it is (Garchomp's Bite Mult, the Eon duo's and Rayquaza's X); a bank
// only one form uses rides along on the other in `poke_kept` and comes back when it reverts (Aggron's eaten X, Banette's Mult, Mega Banette's
// own X). Energy carries (energy_count) and is re-applied to the new form's base. Each Mega's main number takes Energy at the standard share;
// hands, discards, Joker slots, debt, money and the guarantee are fixed. Gen = the base species' (pokermon_gen_filter_test).
import {
  G, P_CENTERS, localize, card_eval_status_text, defineJokers, type_tooltip, has_enhancement, get_depleted, get_enhancements, scale_card,
  ease_discard, ease_hands_played, get_poke_target_card_ranks, detailed,
  EVOLVE_INTERCEPTS, POST_EVOLVE, FAMILY_MEMBER_REV, set_family, poke_get_family_list,
} from '../api.js';
import { rulesRev } from '../../../js/mods/pins.js';
import { gold_held, diamond_storm } from './pokejokers_designs.js';

/** The rules rev the 19 Megas arrive on (index.js contentRev). */
export const MEGA_D_REV = 84;
export const mega_d_on = () => rulesRev('pokermon') >= MEGA_D_REV;

const FILE = 'micatro/pokejokers_megas';
const sprite = (sheet, x, y, soul) => ({ atlas: 'AtlasJokersBasic' + sheet, pos: { x, y }, soul_pos: { x: soul[0], y: soul[1] } });
const r3 = (x) => Math.round(x * 1000) / 1000;
const r9 = (x) => Math.round(x * 1e9) / 1e9;
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
/** A scored card (the play area's individual pass; a debuffed card scores nothing). */
const scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card && !context.other_card.debuff);
const NATURE = [{ id: 14, value: 'Ace' }, { id: 13, value: 'King' }, { id: 12, value: 'Queen' }];
const is_nature = (card, other) => (card.ability.extra.targets || []).some((t) => other.get_id() === t.id);
/** A Mega made outright (Transformation, the collection) rolls its own Nature, as the Treecko line does; an evolved one keeps its base's. */
const nature_targets = (seed) => function set_ability(self, card, initial) {
  if (initial) card.ability.extra.targets = get_poke_target_card_ranks(seed, 3, card.ability.extra.targets);
};
const nature_vars = (card) => (card.ability.extra.targets || NATURE).map((t) => localize(t.value || 'Ace', 'ranks'));
/** $ paid during scoring (G.GAME.dollar_buffer holds it until the queue runs, as Pokermon's other scoring payouts). */
const pay = (n) => { G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + n; G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); return n; };

const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
const discards = {
  add_to_deck(self, card) { G.GAME.round_resets.discards += card.ability.extra.d_size; ease_discard(card.ability.extra.d_size); },
  remove_from_deck(self, card) { G.GAME.round_resets.discards -= card.ability.extra.d_size; ease_discard(-card.ability.extra.d_size); },
};
/** +hands each round (the Squirtle line's pair; taking them back never leaves fewer than 1 hand this round). */
const hands = {
  add_to_deck(self, card, from_debuff) { G.GAME.round_resets.hands += card.ability.extra.hands; if (!from_debuff) ease_hands_played(card.ability.extra.hands); },
  remove_from_deck(self, card) {
    G.GAME.round_resets.hands -= card.ability.extra.hands;
    const n = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (n > 0) ease_hands_played(-n);
  },
};
const both = (a, b) => ({
  add_to_deck(self, card, from_debuff) { a.add_to_deck(self, card, from_debuff); b.add_to_deck(self, card, from_debuff); },
  remove_from_deck(self, card, from_debuff) { a.remove_from_deck(self, card, from_debuff); b.remove_from_deck(self, card, from_debuff); },
});
const MEGA = { rarity: 'poke_mega', cost: 12, stage: 'Mega', blueprint_compat: true };

// ------------------------------------------------------------ the bases, their banks
/** base name -> {gen, shared: [[base field, Mega field]] crossing as is, base_own / mega_own: banks only that form uses (kept in poke_kept)}. */
export const CARRY = {
  sceptile: { base_own: ['money_earned'] },
  blaziken: {},
  swampert: {},
  mawile: {},
  aggron: { base_own: ['Xmult', 'eaten'] },
  medicham: {},
  manectric: {},
  banette: { base_own: ['mult'], mega_own: ['banette_Xmult'] },
  absol: {},
  sableye: { shared: [['Xmult', 'deplete_Xmult'], ['enhancements', 'enhancements']] },
  sharpedo: {},
  glalie: {},
  salamence: {},
  metagross: {},
  latias: { shared: [['eon_Xmult', 'eon_Xmult']] },
  latios: { shared: [['eon_Xmult', 'eon_Xmult']] },
  rayquaza: { shared: [['ascent_Xmult', 'ascent_Xmult']] },
  garchomp: { shared: [['bite_mult', 'bite_mult']] },
  diancie: {},
};
const copy = (v) => (v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
/** The CARRY entry when `from` -> `to` is a base <-> its Mega (either way), with the direction. */
function pair_of(from, to) {
  for (const [base, spec] of Object.entries(CARRY)) {
    const b = 'j_poke_' + base, m = 'j_poke_mega_' + base;
    if (from === b && to === m) return { spec, to_mega: true };
    if (from === m && to === b) return { spec, to_mega: false };
  }
  return null;
}
const STASH = new Map();
// Before the swap: remember the old form's ability.extra (the swap rebuilds it from the new center's config).
EVOLVE_INTERCEPTS.push({ backend(card, to_key) { if (pair_of(card.config.center.key, to_key)) STASH.set(card, copy(card.ability.extra)); return false; } });
// After it (kept values restored, Energy re-applied): the banks cross over exactly.
POST_EVOLVE.push((card, from, to) => {
  const p = pair_of(from, to), old = STASH.get(card);
  STASH.delete(card);
  if (!p || !old) return;
  const ex = card.ability.extra, { spec, to_mega } = p;
  for (const [bf, mf] of spec.shared || []) {
    const v = old[to_mega ? bf : mf];
    if (v !== undefined) ex[to_mega ? mf : bf] = copy(v);
  }
  const leaving = (to_mega ? spec.base_own : spec.mega_own) || [], arriving = (to_mega ? spec.mega_own : spec.base_own) || [];
  const kept = {};
  for (const f of leaving) if (old[f] !== undefined) kept[f] = copy(old[f]);
  if (Object.keys(kept).length) ex.poke_kept = kept; else delete ex.poke_kept;
  if (old.poke_kept) for (const f of arriving) if (old.poke_kept[f] !== undefined) ex[f] = copy(old.poke_kept[f]);
});
/** A bank the other form left on this card (shown on its text). */
const kept = (card, f, dflt) => (card.ability.extra.poke_kept && card.ability.extra.poke_kept[f] !== undefined ? card.ability.extra.poke_kept[f] : dflt);

/** index.js, once the centers exist: each base's `megas` (a getter: only from MEGA_D_REV on), its Mega tooltip, and the Megas' families. */
export function attach_classic_megas(centers) {
  const byKey = new Map(centers.map((c) => [c.key, c]));
  for (const base of Object.keys(CARRY)) {
    const c = byKey.get('j_poke_' + base), mega = 'mega_' + base;
    if (!c || !byKey.get('j_poke_' + mega)) throw new Error(`pokermon: Mega batch D needs '${base}' and '${mega}'`);
    Object.defineProperty(c, 'megas', { get: () => (mega_d_on() ? [mega] : undefined), enumerable: true, configurable: true });
    const lv = c.loc_vars;
    c.loc_vars = function (self, info_queue, card) {
      const r = lv ? lv.call(this, self, info_queue, card) : undefined;
      if (mega_d_on() && detailed() && Array.isArray(info_queue) && !info_queue.some((q) => q && q.key === 'mega_poke')) info_queue.push({ set: 'Other', key: 'mega_poke' });
      return r;
    };
    const fam = poke_get_family_list(base);
    set_family(fam.length ? [...fam.filter((y) => (typeof y === 'string' ? y : y.key) !== mega), mega] : [base, mega]);
    FAMILY_MEMBER_REV.set(mega, MEGA_D_REV);
  }
}

// ------------------------------------------------------------ shared bodies
/** Mega Garchomp, Sand Force: X1 + X(Xmult_mod) per undebuffed Gold card held in hand. */
const sand_force_x = (card) => r3(1 + card.ability.extra.Xmult_mod * gold_held());
/** Mega Glalie: the debt now (current negative dollars; nothing while at or above $0). */
const debt_now = () => Math.max(0, -Number((G.GAME && G.GAME.dollars) || 0));
const refrigerate_x = (card) => r9(1 + card.ability.extra.Xmult_mod * debt_now());
/** Mega Latias / Latios: a Tarot / a Planet used banks the full gain, the other kind half (Soul Dew, alone, as their base forms since r59). */
function mega_eon(card, context, own) {
  const ex = card.ability.extra;
  if (context.using_consumeable && !context.blueprint && context.consumeable) {
    const set = context.consumeable.ability.set, other = own === 'Tarot' ? 'Planet' : 'Tarot';
    const gain = set === own ? ex.Xmult_mod : set === other ? r9(ex.Xmult_mod / 2) : 0;
    if (gain > 0) {
      ex.eon_Xmult = r3(ex.eon_Xmult + gain);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
    }
    return undefined;
  }
  if (context.joker_main && ex.eon_Xmult > 1) return { message: a_xmult(r3(ex.eon_Xmult)), colour: 'XMULT', Xmult_mod: ex.eon_Xmult };
  return undefined;
}
/** Mega Rayquaza, Dragon Ascent: the played hand contains a Straight or a Flush (a Straight Flush once). */
const ascends = (context) => !!context.poker_hands && ((context.poker_hands.Straight || []).length > 0 || (context.poker_hands.Flush || []).length > 0);
const steel_stone_gold = (c) => has_enhancement(c, 'm_steel') || has_enhancement(c, 'm_stone') || has_enhancement(c, 'm_gold');
const straights = () => (G.GAME.hands.Straight ? G.GAME.hands.Straight.played : 0);

defineJokers({
  // Mega Sceptile 254-1 (Grass, Gen 3): +1 hand size (the Grass starter perk, fixed); each scored Nature card earns $3 (`nature_money`, fixed)
  // and gives X1.25 (`Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). Its Nature is Sceptile's.
  mega_sceptile: {
    name: 'mega_sceptile', poke_sprite391: sprite('Gen03', 0, 4, [1, 4]),
    config: { extra: { h_size: 1, nature_money: 3, Xmult_multi: 1.25, targets: NATURE } },
    ...MEGA, ptype: 'Grass', gen: 3, poke_after: 'sceptile',
    attributes: ['starter', 'hand_size', 'nature', 'rank', 'economy', 'xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.nature_money, r3(ex.Xmult_multi), ...nature_vars(card)] }; },
    calculate(self, card, context) {
      if (scored(context) && is_nature(card, context.other_card)) return { dollars: pay(card.ability.extra.nature_money), x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...hand_size,
    set_ability: nature_targets('mega_sceptile'),
  },
  // Mega Blaziken 257-1 (Fire), Speed Boost: +1 discard (the Fire starter perk, fixed); each scored Nature card gives X1.5 (`Xmult_multi` +5%).
  mega_blaziken: {
    name: 'mega_blaziken', poke_sprite391: sprite('Gen03', 2, 4, [3, 4]),
    config: { extra: { d_size: 1, Xmult_multi: 1.5, targets: NATURE } },
    ...MEGA, ptype: 'Fire', gen: 3, poke_after: 'blaziken',
    attributes: ['starter', 'discard', 'nature', 'rank', 'xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_multi), ...nature_vars(card)] }; },
    calculate(self, card, context) {
      if (scored(context) && is_nature(card, context.other_card)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...discards,
    set_ability: nature_targets('mega_blaziken'),
  },
  // Mega Swampert 260-1 (Water), Swift Swim: +2 hands (instead of Swampert's +1; fixed); each scored Nature card +100 Chips (`chip_mod`, as
  // Swampert's +60: +20% -> 120 / 140 / 160).
  mega_swampert: {
    name: 'mega_swampert', poke_sprite391: sprite('Gen03', 4, 4, [5, 4]),
    config: { extra: { hands: 2, chip_mod: 100, targets: NATURE } },
    ...MEGA, ptype: 'Water', gen: 3, poke_after: 'swampert',
    attributes: ['starter', 'hands', 'nature', 'rank', 'chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.chip_mod), ...nature_vars(card)] }; },
    calculate(self, card, context) {
      if (scored(context) && is_nature(card, context.other_card)) return { chips: card.ability.extra.chip_mod, card };
      return undefined;
    },
    ...hands,
    set_ability: nature_targets('mega_swampert'),
  },
  // Mega Sableye 302-1 (Dark): +X0.5 (`Xmult_mod` +20%: 0.6 / 0.7 / 0.8) each time a unique enhancement is depleted (its last card drawn from
  // the deck), and it NEVER resets; the bank `deplete_Xmult` (no energy field) starts from Sableye's X this round, with the enhancements it
  // already counted (CARRY). Not Blueprint (it scales); Blueprint copies the X.
  mega_sableye: {
    name: 'mega_sableye', poke_sprite391: sprite('Gen03', 8, 4, [9, 4]),
    config: { extra: { deplete_Xmult: 1, Xmult_mod: 0.5, enhancements: {} } },
    ...MEGA, ptype: 'Dark', gen: 3, poke_after: 'sableye',
    attributes: ['xmult', 'scaling', 'enhancements'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push({ set: 'Other', key: 'deplete' }); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_mod), r3(ex.deplete_Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main && ex.deplete_Xmult > 1) return { message: a_xmult(r3(ex.deplete_Xmult)), colour: 'XMULT', Xmult_mod: ex.deplete_Xmult };
      if (context.hand_drawn && !context.blueprint) {
        ex.enhancements = ex.enhancements || {};
        for (const drawn of context.hand_drawn) {
          if (drawn.config.center === P_CENTERS.c_base) continue;
          for (const x of get_enhancements(drawn)) {
            if (!ex.enhancements[x] && get_depleted((deck_card) => has_enhancement(deck_card, x))) {
              ex.enhancements[x] = true;
              scale_card(card, { ref_value: 'deplete_Xmult', scalar_value: 'Xmult_mod', message_colour: 'XMULT' });
            }
          }
        }
      }
      return undefined;
    },
  },
  // Mega Mawile 303-1 (Metal), Huge Power: each scored Steel card gives X2 (`Xmult_multi` +5%: 2.1 / 2.2 / 2.3).
  mega_mawile: {
    name: 'mega_mawile', poke_sprite391: sprite('Gen03', 10, 4, [11, 4]),
    config: { extra: { Xmult_multi: 2 } },
    ...MEGA, ptype: 'Metal', gen: 3, poke_after: 'mawile',
    attributes: ['xmult', 'enhancements', 'steel'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); if (detailed()) info_queue.push(P_CENTERS.m_steel); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (scored(context) && has_enhancement(context.other_card, 'm_steel')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Mega Aggron 306-1 (Metal), Filter: each scored Steel, Stone or Gold card gives X1.5 (`Xmult_multi` +5%) and is NOT destroyed (Aggron eats
  // them). Aggron's banked X rides along (poke_kept, CARRY) and is Aggron's again when it reverts.
  mega_aggron: {
    name: 'mega_aggron', poke_sprite391: sprite('Gen03', 0, 5, [1, 5]),
    config: { extra: { Xmult_multi: 1.5 } },
    ...MEGA, ptype: 'Metal', gen: 3, poke_after: 'aggron',
    attributes: ['xmult', 'enhancements', 'steel', 'stone', 'gold'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) { info_queue.push(P_CENTERS.m_steel); info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_gold); }
      return { vars: [r3(card.ability.extra.Xmult_multi), r3(kept(card, 'Xmult', 1))] };
    },
    calculate(self, card, context) {
      if (scored(context) && steel_stone_gold(context.other_card)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Mega Medicham 308-1 (Fighting), Pure Power: X4 (`Xmult` +20%: 4.8 / 5.6 / 6.4) with 0 discards remaining.
  mega_medicham: {
    name: 'mega_medicham', poke_sprite391: sprite('Gen03', 2, 5, [3, 5]),
    config: { extra: { Xmult: 4, d_remaining: 0 } },
    ...MEGA, ptype: 'Fighting', gen: 3, poke_after: 'medicham',
    attributes: ['xmult', 'discard'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), ex.d_remaining] }; },
    calculate(self, card, context) {
      if (context.joker_main && G.GAME.current_round.discards_left === card.ability.extra.d_remaining) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Mega Manectric 310-1 (Lightning): EVERY scored Gold card earns $4 (`gold_money`, fixed: the spec's money) and comes back to hand after
  // scoring (Manectric's stay_flipped return, for all of them, not only the first). No number takes Energy: Energy-inert by design.
  mega_manectric: {
    name: 'mega_manectric', poke_sprite391: sprite('Gen03', 4, 5, [5, 5]),
    config: { extra: { gold_money: 4 } },
    ...MEGA, ptype: 'Lightning', gen: 3, poke_after: 'manectric',
    attributes: ['economy', 'enhancements', 'gold'],
    poke_no_energy_field: true,
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); if (detailed()) info_queue.push(P_CENTERS.m_gold); return { vars: [card.ability.extra.gold_money] }; },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        for (const c of context.scoring_hand || []) if (has_enhancement(c, 'm_gold') && !c.debuff) c.poke_mega_manectric_return = true;
      }
      if (scored(context) && has_enhancement(context.other_card, 'm_gold')) return { dollars: pay(card.ability.extra.gold_money), card };
      if (context.stay_flipped && context.from_area === G.play && context.other_card && context.other_card.poke_mega_manectric_return) {
        context.other_card.poke_mega_manectric_return = undefined;
        return { modify: { to_area: G.hand } };
      }
      return undefined;
    },
  },
  // Mega Sharpedo 319-1 (Water), Strong Jaw: X4 (`Xmult` +20%) if the poker hand was already played this round. It never destroys a Joker
  // (Sharpedo's Blind-select slice is gone while it is Mega).
  mega_sharpedo: {
    name: 'mega_sharpedo', poke_sprite391: sprite('Gen03', 10, 5, [11, 5]),
    config: { extra: { Xmult: 4 } },
    ...MEGA, ptype: 'Water', gen: 3, poke_after: 'sharpedo',
    attributes: ['xmult', 'hand_type'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.joker_main && G.GAME.hands[context.scoring_name] && G.GAME.hands[context.scoring_name].played_this_round > 1) {
        return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
  // Mega Banette 354-1 (Psychic): +2 Joker slots (`card_limit`, fixed; instead of Banette's +1 slot / -1 hand). Each Joker sold (any time;
  // not this one) permanently adds X0.25 (`Xmult_mod` +20%: 0.3 / 0.35 / 0.4) to `banette_Xmult` (the bank, no energy field), KEPT on the
  // card when it reverts (poke_kept) and back when it Mega Evolves again; Banette's +Mult bank rides along the same way.
  mega_banette: {
    name: 'mega_banette', poke_sprite391: sprite('Gen03', 6, 5, [7, 5]),
    config: { extra: { card_limit: 2, banette_Xmult: 1, Xmult_mod: 0.25 } },
    ...MEGA, ptype: 'Psychic', gen: 3, poke_after: 'banette',
    attributes: ['joker slots', 'xmult', 'scaling', 'on_sell'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.card_limit, r3(ex.Xmult_mod), r3(ex.banette_Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.selling_card && context.card && context.card !== card && context.card.ability.set === 'Joker' && !context.blueprint) {
        scale_card(card, { ref_value: 'banette_Xmult', scalar_value: 'Xmult_mod', message_colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.banette_Xmult > 1) return { message: a_xmult(r3(ex.banette_Xmult)), colour: 'XMULT', Xmult_mod: ex.banette_Xmult };
      return undefined;
    },
    add_to_deck(self, card) { G.jokers.config.card_limit += card.ability.extra.card_limit; },
    remove_from_deck(self, card) { G.jokers.config.card_limit -= card.ability.extra.card_limit; },
  },
  // Mega Absol 359-1 (Dark), Magic Bounce: X1.5 (`Xmult` +20%: 1.8 / 2.1 / 2.4); every listed probability is GUARANTEED while it is held (the
  // fix_probability pass sets the numerator to the denominator: 1 in 6 -> 6 in 6), the inverse of Absol's 0.
  mega_absol: {
    name: 'mega_absol', poke_sprite391: sprite('Gen03', 8, 5, [9, 5]),
    config: { extra: { Xmult: 1.5 } },
    ...MEGA, ptype: 'Dark', gen: 3, poke_after: 'absol',
    attributes: ['xmult', 'mod_chance'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.fix_probability && !context.blueprint) return { numerator: context.denominator };
      if (context.joker_main) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Mega Glalie 362-1 (Water), Refrigerate: go up to -$50 in debt (`debt`, fixed; instead of Glalie's -$20) and X1 + X0.1 (`Xmult_mod` +20%:
  // 0.12 / 0.14 / 0.16) per $1 of debt right now. It does NOT set your money back to $0 at end of round (Glalie does): the debt is real until
  // you pay it off or revert it.
  mega_glalie: {
    name: 'mega_glalie', poke_sprite391: sprite('Gen03', 4, 6, [5, 6]),
    config: { extra: { debt: 50, Xmult_mod: 0.1 } },
    ...MEGA, ptype: 'Water', gen: 3, poke_after: 'glalie',
    attributes: ['economy', 'xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.debt, r3(ex.Xmult_mod), r3(refrigerate_x(card))] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const x = refrigerate_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
    add_to_deck(self, card) { G.GAME.bankrupt_at -= card.ability.extra.debt; },
    remove_from_deck(self, card) { G.GAME.bankrupt_at += card.ability.extra.debt; },
  },
  // Mega Salamence 373-1 (Dragon), Aerilate: +10 Mult (`mult_mod` +20%: 12 / 14 / 16) for each Straight played this run (Salamence's +5).
  // Pokermon's Salamence lists it (Nacho 1.6.4's legacy Mega Salamence, unreachable, is now a duplicate of this one: precedence).
  mega_salamence: {
    name: 'mega_salamence', poke_sprite391: sprite('Gen03', 8, 6, [9, 6]),
    config: { extra: { mult_mod: 10 } },
    ...MEGA, ptype: 'Dragon', gen: 3, poke_after: 'salamence',
    attributes: ['mult', 'hand_type', 'straight'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(straights() * ex.mult_mod)] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const m = r9(straights() * card.ability.extra.mult_mod); if (m > 0) return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m }; }
      return undefined;
    },
  },
  // Mega Metagross 376-1 (Metal), Tough Claws: if the poker hand is a Four of a Kind, each played (scored) card gives X2 (`Xmult_multi` +5%).
  mega_metagross: {
    name: 'mega_metagross', poke_sprite391: sprite('Gen03', 6, 6, [7, 6]),
    config: { extra: { Xmult_multi: 2 } },
    ...MEGA, ptype: 'Metal', gen: 3, poke_after: 'metagross',
    attributes: ['xmult', 'hand_type'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (scored(context) && context.scoring_name === 'Four of a Kind') return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  // Mega Latias 380-1 / Mega Latios 381-1 (Psychic): Latias's / Latios's bank (`eon_Xmult`, CARRY) grows X0.3 a Tarot / a Planet (`Xmult_mod`
  // +20%: 0.36 / 0.42 / 0.48) and half that for the other kind (Soul Dew, alone). Upstream's sprite table points Mega Latios's soul at {3,7}
  // (Primal Groudon's); its own soul is {1,7}, beside its card.
  mega_latias: {
    name: 'mega_latias', poke_sprite391: sprite('Gen03', 10, 6, [11, 6]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.3 } },
    ...MEGA, ptype: 'Psychic', gen: 3, poke_after: 'latias',
    attributes: ['xmult', 'scaling', 'tarot', 'planet'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), r3(ex.Xmult_mod / 2)] }; },
    calculate(self, card, context) { return mega_eon(card, context, 'Tarot'); },
  },
  mega_latios: {
    name: 'mega_latios', poke_sprite391: sprite('Gen03', 0, 7, [1, 7]),
    config: { extra: { eon_Xmult: 1, Xmult_mod: 0.3 } },
    ...MEGA, ptype: 'Psychic', gen: 3, poke_after: 'latios',
    attributes: ['xmult', 'scaling', 'tarot', 'planet'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.eon_Xmult), r3(ex.Xmult_mod), r3(ex.Xmult_mod / 2)] }; },
    calculate(self, card, context) { return mega_eon(card, context, 'Planet'); },
  },
  // Mega Rayquaza 384-1 (Dragon), Delta Stream: +2 hands and +2 discards each round (fixed) and Kyogre and Groudon never clash (it is Delta
  // Stream's own Pokémon: pokejokers_designs.js delta_calm); Dragon Ascent: Rayquaza's bank (`ascent_Xmult`, CARRY) grows X0.4 (`Xmult_mod`
  // +20%: 0.48 / 0.56 / 0.64) for each played hand containing a Straight or a Flush.
  mega_rayquaza: {
    name: 'mega_rayquaza', poke_sprite391: sprite('Gen03', 6, 7, [7, 7]),
    config: { extra: { ascent_Xmult: 1, Xmult_mod: 0.4, hands: 2, d_size: 2 } },
    ...MEGA, ptype: 'Dragon', gen: 3, poke_after: 'rayquaza',
    attributes: ['xmult', 'scaling', 'hand_type', 'hands', 'discard'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.ascent_Xmult), r3(ex.Xmult_mod), ex.hands, ex.d_size] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.before && context.cardarea === G.jokers && !context.blueprint && ascends(context)) {
        ex.ascent_Xmult = r3(ex.ascent_Xmult + ex.Xmult_mod);
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Dragon Ascent!', colour: 'XMULT' });
        return undefined;
      }
      if (context.joker_main && ex.ascent_Xmult > 1) return { message: a_xmult(r3(ex.ascent_Xmult)), colour: 'XMULT', Xmult_mod: ex.ascent_Xmult };
      return undefined;
    },
    ...both(hands, discards),
  },
  // Mega Garchomp 445-1 (Dragon, Gen 4), Sand Force: X1 + X1 (`Xmult_mod` +20%: 1.2 / 1.4 / 1.6) per Gold card held in hand, and Garchomp's
  // Bite bank (`bite_mult`, CARRY) still gives its +Mult.
  mega_garchomp: {
    name: 'mega_garchomp', poke_sprite391: sprite('Gen04', 2, 7, [3, 7]),
    config: { extra: { bite_mult: 0, Xmult_mod: 1 } },
    ...MEGA, ptype: 'Dragon', gen: 4, poke_after: 'garchomp',
    attributes: ['mult', 'xmult', 'enhancements', 'gold'],
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); if (detailed()) info_queue.push(P_CENTERS.m_gold);
      const ex = card.ability.extra;
      return { vars: [r3(ex.bite_mult), r3(ex.Xmult_mod), gold_held(), sand_force_x(card)] };
    },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const ex = card.ability.extra, x = sand_force_x(card), r = {};
      if (ex.bite_mult > 0) r.mult_mod = ex.bite_mult;
      if (x > 1) r.Xmult_mod = x;
      if (!Object.keys(r).length) return undefined;
      r.message = r.Xmult_mod ? a_xmult(x) : a_mult(r3(r.mult_mod));
      r.colour = r.Xmult_mod ? 'XMULT' : 'MULT';
      return r;
    },
  },
  // Mega Diancie 719-1 (Fairy, Gen 6): each scored Diamond earns $2 (`diamond_money`, fixed) and gives X1.5 (`Xmult_multi` +5%: 1.575 / 1.65 /
  // 1.725); it keeps Diancie's Diamond Storm conversion (a random non-Diamond deck card becomes a Diamond when a Blind is selected).
  mega_diancie: {
    name: 'mega_diancie', poke_sprite391: sprite('Gen06', 0, 12, [1, 12]),
    config: { extra: { Xmult_multi: 1.5, diamond_money: 2 } },
    ...MEGA, ptype: 'Fairy', gen: 6, poke_after: 'diancie',
    attributes: ['xmult', 'money', 'suit', 'diamonds', 'playing_card'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.diamond_money, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (diamond_storm(card, context)) return undefined;
      if (scored(context) && context.other_card.is_suit('Diamonds')) return { dollars: pay(card.ability.extra.diamond_money), x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
}, FILE);

// ------------------------------------------------------------ text (Pokermon loc style; #n# filled by loc_vars)
const BR = '{br:2}ERROR - CONTACT STEAK';
const NAT = (a, b, c) => '{C:attention}Nature: {C:inactive}({C:attention}#' + a + '#, #' + b + '#, #' + c + '#{C:inactive}){}';
export const MEGA_D_LOC = {
  Joker: {
    j_poke_mega_sceptile: { name: 'Mega Sceptile', text: [
      '{C:attention}+#1#{} hand size, ' + NAT(4, 5, 6), 'Each scored {C:attention}Nature{} card', 'earns {C:money}$#2#{} and gives', '{X:mult,C:white} X#3# {} Mult'] },
    j_poke_mega_blaziken: { name: 'Mega Blaziken', text: [
      '{C:mult}+#1#{} discard, ' + NAT(3, 4, 5), '{C:attention}Speed Boost:{} each scored', '{C:attention}Nature{} card gives {X:mult,C:white} X#2# {} Mult'] },
    j_poke_mega_swampert: { name: 'Mega Swampert', text: [
      '{C:chips}+#1#{} hands, ' + NAT(3, 4, 5), '{C:attention}Swift Swim:{} each scored', '{C:attention}Nature{} card gives {C:chips}+#2#{} Chips'] },
    j_poke_mega_sableye: { name: 'Mega Sableye', text: [
      'Gains {X:mult,C:white} X#1# {} Mult when you', '{C:attention}deplete{} a {C:attention}unique enhancement{},', 'never resets', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)'] },
    j_poke_mega_mawile: { name: 'Mega Mawile', text: [
      '{C:attention}Huge Power:{} each scored', '{C:attention}Steel{} card gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_mega_aggron: { name: 'Mega Aggron', text: [
      '{C:attention}Filter:{} each scored {C:attention}Steel{},', '{C:attention}Stone{} or {C:attention}Gold{} card gives', '{X:mult,C:white} X#1# {} Mult and is not destroyed',
      '{C:inactive,s:0.8}(Aggron\'s {X:mult,C:white,s:0.8} X#2# {C:inactive,s:0.8} is kept for when it reverts)'] },
    j_poke_mega_medicham: { name: 'Mega Medicham', text: [
      '{C:attention}Pure Power:{} {X:mult,C:white} X#1# {} Mult', 'when {C:attention}#2#{} discards remaining'] },
    j_poke_mega_manectric: { name: 'Mega Manectric', text: [
      'Every scored {C:attention}Gold{} card', 'earns {C:money}$#1#{} and is returned', 'to hand after scoring'] },
    j_poke_mega_sharpedo: { name: 'Mega Sharpedo', text: [
      '{C:attention}Strong Jaw:{} {X:mult,C:white} X#1# {} Mult if', 'played {C:attention}poker hand{} has', 'already been played this round'] },
    j_poke_mega_banette: { name: 'Mega Banette', text: [
      '{C:attention}+#1#{} Joker slots', BR, 'Permanently gains {X:mult,C:white} X#2# {} Mult', 'each time a Joker is sold', '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)',
      '{C:inactive,s:0.8}(Kept on the card when it reverts)'] },
    j_poke_mega_absol: { name: 'Mega Absol', text: [
      '{C:attention}Magic Bounce:{} {X:red,C:white}X#1#{} Mult', 'All {C:attention}listed{} {C:green,E:1,S:1.1}probabilities{}', 'are {C:attention}guaranteed{}',
      '{C:inactive}(ex: {C:green}1 in 6{C:inactive} -> {C:green}6 in 6{C:inactive})'] },
    j_poke_mega_glalie: { name: 'Mega Glalie', text: [
      'Go up to {C:mult}-$#1#{} in debt', BR, '{C:attention}Refrigerate:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each {C:money}$1{} of debt',
      '{C:inactive}(Currently {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_mega_salamence: { name: 'Mega Salamence', text: [
      '{C:attention}Aerilate:{} {C:mult}+#1#{} Mult for each', '{C:attention}Straight{} played this run', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)'] },
    j_poke_mega_metagross: { name: 'Mega Metagross', text: [
      '{C:attention}Tough Claws:{} if {C:attention}poker hand{}', 'is a {C:attention}Four of a Kind{}, each', 'played card gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_mega_latias: { name: 'Mega Latias', text: [
      '{C:attention}Mist Ball:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:tarot}Tarot{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)',
      BR, '{C:attention}Soul Dew:{} also gains', '{X:mult,C:white} X#3# {} Mult each time', 'you use a {C:planet}Planet{} card'] },
    j_poke_mega_latios: { name: 'Mega Latios', text: [
      '{C:attention}Luster Purge:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:planet}Planet{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)',
      BR, '{C:attention}Soul Dew:{} also gains', '{X:mult,C:white} X#3# {} Mult each time', 'you use a {C:tarot}Tarot{} card'] },
    j_poke_mega_rayquaza: { name: 'Mega Rayquaza', text: [
      '{C:attention}Delta Stream:{} {C:chips}+#3#{} hands and', '{C:red}+#4#{} discards each round', '{C:inactive,s:0.8}(Also calms Kyogre and Groudon:', '{C:inactive,s:0.8}no Primal Clash)',
      BR, '{C:attention}Dragon Ascent:{} gains {X:mult,C:white} X#2# {} Mult', 'when a played hand contains', 'a {C:attention}Straight{} or a {C:attention}Flush{}', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'] },
    j_poke_mega_garchomp: { name: 'Mega Garchomp', text: [
      '{C:mult}+#1#{} Mult {C:inactive}(banked by Bite)', BR, '{C:attention}Sand Force:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each {C:attention}Gold{} card',
      'held in hand', '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'] },
    j_poke_mega_diancie: { name: 'Mega Diancie', text: [
      '{C:attention}Diamond Storm:{} each scored', '{C:diamonds}Diamond{} earns {C:money}$#1#{} and', 'gives {X:mult,C:white} X#2# {} Mult',
      BR, 'When a {C:attention}Blind{} is selected,', 'a random non-{C:diamonds}Diamond{} card', 'in your deck becomes', 'a {C:diamonds}Diamond{}'] },
  },
};
