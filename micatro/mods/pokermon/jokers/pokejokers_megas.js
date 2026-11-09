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
  G, P_CENTERS, localize, card_eval_status_text, defineJokers, type_tooltip, has_enhancement, get_depleted, get_enhancements, scale_card, create_card,
  ease_discard, ease_hands_played, ease_poke_dollars, poke_create_treasure, find_pokemon_type, get_poke_target_card_ranks, detailed, copy_card, playing_card_joker_effects, all_cards, is_type, pseudorandom, pseudorandom_probability, pseudorandom_element, pseudoseed,
  EVOLVE_INTERCEPTS, POST_EVOLVE, FAMILY_MEMBER_REV, set_family, family,
} from '../api.js';
import { rulesRev } from '../../../js/mods/pins.js';
import * as BN from '../../../js/engine/bignum.js';
import { attach_mega } from '../systems/precedence.js';
import { forge_scored_card } from '../../pokermonplus/src/pokemon/485_heatran_line.js';
import { faint } from '../../nacho/dip.js';
import { gold_held, diamond_storm, poison_point, flame_charge, flame_streak, flame_main, discards_scry, mystical_fire, skrelp_poison, hazard_held_x, toxic_debris, recoil, moxie, zygarde_give, protean_pick, protean_set, ninja_others } from './pokejokers_designs.js';

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
  absol: { z: true },
  sableye: { shared: [['Xmult', 'deplete_Xmult'], ['enhancements', 'enhancements']] },
  sharpedo: {},
  glalie: {},
  salamence: {},
  metagross: {},
  latias: { shared: [['eon_Xmult', 'eon_Xmult']] },
  latios: { shared: [['eon_Xmult', 'eon_Xmult']] },
  rayquaza: { shared: [['ascent_Xmult', 'ascent_Xmult']] },
  garchomp: { z: true, shared: [['bite_mult', 'bite_mult']] },
  diancie: {},
  barbaracle: { rev: 87 },
  hawlucha: { rev: 89 },
  falinks: { rev: 90 },
  eelektross: { rev: 91 },
  chandelure: { rev: 91 },
  scolipede: { rev: 92 },
  chesnaught: { rev: 93 },
  froslass: { rev: 94 },
  floette: { rev: 95, base_own: ['rounds'], shared: [['form', 'form']] },
  emboar: { rev: 96, shared: [['streak', 'streak'], ['streak_round', 'streak_round'], ['last_hand', 'last_hand']] },
  excadrill: { rev: 97 },
  delphox: { rev: 98, shared: [['fire_Xmult', 'fire_Xmult']] },
  dragalge: { rev: 99 },
  scrafty: { rev: 100, shared: [['mult', 'mult']] },
  malamar: { rev: 101 },
  pyroar: { rev: 102 },
  zygarde: { rev: 103, shared: [['cells', 'cells']] },
  greninja: { rev: 104, shared: [['ptype', 'ptype']] },
  glimmora: { rev: 108, shared: [['debris_hand', 'debris_hand'], ['debris_count', 'debris_count']] },
  crabominable: { rev: 108 },
  scovillain: { rev: 108 },
  chimecho: { rev: 108, shared: [['glass_restored', 'glass_restored']] },
  staraptor: { rev: 108 },
  tatsugiri: { rev: 108, shared: [['form', 'form']] },
  meowstic: { rev: 108, shared: [['form', 'form']], mega_own: ['male_Xmult', 'replaced_round'] },
  magearna: { rev: 109, mega_own: ['soul_Xmult', 'form'] },
  zeraora: { rev: 109 },
  golurk: { rev: 109 },
};
const copy = (v) => (v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
/** The CARRY entry when `from` -> `to` is a base <-> its Mega (either way), with the direction. */
function pair_of(from, to) {
  for (const [base, spec] of Object.entries(CARRY)) {
    const b = 'j_poke_' + base, m = 'j_poke_mega_' + base;
    if (from === b && (to === m || (spec.z && to === m + '_z'))) return { spec, to_mega: true };
    if ((from === m || (spec.z && from === m + '_z')) && to === b) return { spec, to_mega: false };
  }
  return null;
}
const STASH = new Map();
const GOLISOPOD_STASH = new Map();
EVOLVE_INTERCEPTS.push({ backend(card, to) {
  const from = card.config.center.key;
  if ((from === 'j_nacho_golisopod' && to === 'j_poke_mega_golisopod') || (from === 'j_poke_mega_golisopod' && to === 'j_nacho_golisopod')) GOLISOPOD_STASH.set(card, copy(card.ability.extra));
  return false;
} });
POST_EVOLVE.push((card, from, to) => {
  const old = GOLISOPOD_STASH.get(card);
  GOLISOPOD_STASH.delete(card);
  if (!old || !['j_nacho_golisopod', 'j_poke_mega_golisopod'].includes(to)) return;
  const ex = card.ability.extra;
  const bonus = old.golisopod_bonus ?? (old.raised ? old.h_size || 1 : 0);
  ex.golisopod_bonus = bonus;
  ex.raised = bonus > 0;
  ex.ante_debuffed = old.ante_debuffed;
  if (card.added_to_deck && !card.debuff && bonus) G.hand.change_size(bonus);
});
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
  if (to === 'j_poke_zygarde' && card.added_to_deck && !card.debuff) zygarde_give(card);
});
/** A bank the other form left on this card (shown on its text). */
const kept = (card, f, dflt) => (card.ability.extra.poke_kept && card.ability.extra.poke_kept[f] !== undefined ? card.ability.extra.poke_kept[f] : dflt);

/** index.js, once the centers exist: each base's `megas` (a getter: only from MEGA_D_REV on), its Mega tooltip, and the Megas' families. */
export function attach_classic_megas(centers) {
  attach_mega('j_sonfive_heatran', 'j_poke_mega_heatran', () => rulesRev('pokermon') >= 109);
  attach_mega('j_nacho_golisopod', 'j_poke_mega_golisopod', () => rulesRev('pokermon') >= 109);
  const byKey = new Map(centers.map((c) => [c.key, c]));
  for (const [base, spec] of Object.entries(CARRY)) {
    const c = byKey.get('j_poke_' + base), mega = 'mega_' + base;
    if (!c || !byKey.get('j_poke_' + mega)) throw new Error(`pokermon: Mega batch D needs '${base}' and '${mega}'`);
    const available = () => rulesRev('pokermon') >= (spec.rev || MEGA_D_REV);
    Object.defineProperty(c, 'megas', { get: () => (available() ? (spec.z && rulesRev('pokermon') >= 109 ? [mega, mega + '_z'] : [mega]) : undefined), enumerable: true, configurable: true });
    if (spec.z) c.getMega = (self, card) => {
      const row = G.jokers?.cards || [], index = row.indexOf(card);
      if (index === 0) return self.megas[0];
      if (index === row.length - 1) return self.megas[1];
      return pseudorandom_element(self.megas, pseudoseed('megastone_' + self.name))[0];
    };
    const lv = c.loc_vars;
    c.loc_vars = function (self, info_queue, card) {
      const r = lv ? lv.call(this, self, info_queue, card) : undefined;
      if (available() && detailed() && Array.isArray(info_queue) && !info_queue.some((q) => q && q.key === 'mega_poke')) info_queue.push({ set: 'Other', key: 'mega_poke' });
      return r;
    };
    // Read the unfiltered family: at registration time the current mod pin may not yet be active.
    // A filtered view would drop an earlier Mega when two branches share a family (Glalie / Froslass).
    const fam = family.find((f) => f.some((y) => (typeof y === 'string' ? y : y.key) === base)) || [];
    set_family(fam.length ? [...fam.filter((y) => (typeof y === 'string' ? y : y.key) !== mega), mega] : [base, mega]);
    FAMILY_MEMBER_REV.set(mega, spec.rev || MEGA_D_REV);
    if (spec.z) { set_family([...family.find(f => f.some(y => (typeof y === 'string' ? y : y.key) === base)), mega + '_z']); FAMILY_MEMBER_REV.set(mega + '_z', 109); }
  }
  const lucario = byKey.get('j_poke_lucario');
  if (lucario) {
    const previous = lucario.megas;
    Object.defineProperty(lucario, 'megas', { get: () => rulesRev('pokermon') >= 109 ? ['mega_lucario', 'mega_lucario_z'] : previous, enumerable: true, configurable: true });
    lucario.getMega = (self, card) => {
      const row = G.jokers?.cards || [], index = row.indexOf(card);
      if (index === 0) return self.megas[0];
      if (index === row.length - 1) return self.megas[1];
      return pseudorandom_element(self.megas, pseudoseed('megastone_' + self.name))[0];
    };
    const fam = family.find(f => f.some(y => (typeof y === 'string' ? y : y.key) === 'lucario')) || ['lucario', 'mega_lucario'];
    set_family([...fam, 'mega_lucario_z']);
    FAMILY_MEMBER_REV.set('mega_lucario_z', 109);
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
  mega_golisopod: {
    name: 'mega_golisopod', poke_sprite391: sprite('Gen07', 0, 6, [1, 6]),
    config: { extra: { Xmult: 4, golisopod_bonus: 0, h_size: 1 } },
    ...MEGA, ptype: 'Grass', gen: 7, poke_after: 'magearna', poke_mega_base: 'j_nacho_golisopod', eternal_compat: false,
    attributes: ['xmult', 'hand_size', 'faint'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), ex.golisopod_bonus] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra, main = context.main_eval || context.cardarea === G.jokers;
      if (context.before && main && !context.blueprint && G.GAME.current_round.hands_played >= 2) { ex.ante_debuffed = true; faint(card, false, true); }
      if (context.joker_main) return { Xmult: ex.Xmult };
      if (context.end_of_round && main && !context.individual && !context.repetition && !context.blueprint && !context.retrigger_joker && context.beat_boss) {
        if (!ex.ante_debuffed) { ex.golisopod_bonus++; ex.raised = true; G.hand.change_size(1); }
        ex.ante_debuffed = undefined;
      }
    },
    add_to_deck(self, card, from_debuff) { if (from_debuff && card.ability.extra.golisopod_bonus) G.hand.change_size(card.ability.extra.golisopod_bonus); },
    remove_from_deck(self, card) {
      const ex = card.ability.extra;
      if (ex.golisopod_bonus) G.hand.change_size(-ex.golisopod_bonus);
      if (ex.ante_debuffed) { ex.golisopod_bonus = 0; ex.raised = undefined; }
    },
  },
  mega_heatran: {
    name: 'mega_heatran', poke_sprite391: sprite('Gen04', 0, 8, [1, 8]),
    config: { extra: { chips: 15, mult: 2 } },
    ...MEGA, ptype: 'Fire', gen: 4, poke_after: 'froslass', poke_mega_base: 'j_sonfive_heatran', blueprint_compat: false,
    attributes: ['enhancements', 'modify_card', 'chips', 'mult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.chips, card.ability.extra.mult] }; },
    calculate(self, card, context) {
      if (!scored(context) || context.blueprint || context.retrigger_joker || !context.scoring_hand) return;
      const c = context.other_card, ex = card.ability.extra;
      if (!forge_scored_card(c)) return;
      const hand = G.GAME.hands_played;
      if (ex.forged_hand !== hand) {
        ex.forged_hand = hand;
        c.ability.perma_bonus = (c.ability.perma_bonus || 0) + ex.chips;
        c.ability.perma_mult = (c.ability.perma_mult || 0) + ex.mult;
      }
    },
  },
  mega_lucario_z: {
    name: 'mega_lucario_z', poke_sprite391: sprite('Gen04', 8, 7, [9, 7]),
    config: { extra: { Xmult_multi: 1.75 } },
    ...MEGA, ptype: 'Fighting', gen: 4, poke_after: 'mega_lucario',
    attributes: ['xmult', 'edition', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      const c = context.other_card;
      if (!c || c.debuff || !c.edition || context.cardarea !== G.hand || context.end_of_round) return;
      if (context.individual) return { x_mult: card.ability.extra.Xmult_multi, card };
      if (context.repetition) {
        const editions = new Set((G.hand?.cards || []).filter(v => !v.debuff && v.edition).map(v => v.edition.key || Object.keys(v.edition).find(k => v.edition[k] === true)));
        if (editions.size >= 2) return { message: localize('k_again_ex'), repetitions: 1, card };
      }
    },
  },
  mega_absol_z: {
    name: 'mega_absol_z', poke_sprite391: sprite('Gen03', 2, 8, [3, 8]),
    config: { extra: { Xmult: 2 } },
    ...MEGA, ptype: 'Dark', gen: 3, poke_after: 'absol',
    attributes: ['xmult', 'mod_chance'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult)] }; },
    calculate(self, card, context) {
      if (context.fix_probability && !context.blueprint) return { numerator: (G.GAME.current_round.hands_played || 0) === 0 ? 0 : context.denominator };
      if (context.joker_main) return { Xmult_mod: card.ability.extra.Xmult, card };
    },
  },
  mega_garchomp_z: {
    name: 'mega_garchomp_z', poke_sprite391: sprite('Gen04', 6, 7, [7, 7]),
    config: { extra: { bite_mult: 0, Xmult_multi: 1.75, mult: 5 } },
    ...MEGA, ptype: 'Dragon', gen: 4, poke_after: 'garchomp',
    attributes: ['mult', 'xmult', 'enhancements', 'gold'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.mult, r3(ex.bite_mult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra, c = context.other_card;
      if (context.joker_main && ex.bite_mult) return { mult_mod: ex.bite_mult, card };
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && c && !c.debuff && has_enhancement(c, 'm_gold')) return { x_mult: ex.Xmult_multi, mult: gold_held() >= 3 ? ex.mult : 0, card };
    },
  },
  mega_golurk: {
    name: 'mega_golurk', poke_sprite391: sprite('Gen05', 6, 10, [7, 10]),
    config: { extra: { Xmult_multi: 1.75, num: 1, dem: 4 } },
    ...MEGA, ptype: 'Psychic', gen: 5, poke_after: 'golurk',
    attributes: ['xmult', 'hazard', 'probability', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), ex.num, ex.dem] }; },
    calculate(self, card, context) {
      const c = context.other_card;
      if (!c || c.debuff || context.cardarea !== G.hand || context.end_of_round) return;
      const hazard = has_enhancement(c, 'm_poke_hazard');
      if (context.repetition && hazard) return { message: localize('k_again_ex'), repetitions: 1, card };
      if (context.individual && (hazard || pseudorandom_probability(card, 'mega_golurk', card.ability.extra.num, card.ability.extra.dem, 'mega_golurk'))) return { x_mult: card.ability.extra.Xmult_multi, card };
    },
  },
  mega_magearna: {
    name: 'mega_magearna', poke_sprite391: sprite('Gen07', 4, 6, [5, 6]),
    config: { extra: { Xmult_multi: 1.75, soul_Xmult: 1, soul_gain: 0.1 } },
    ...MEGA, ptype: 'Metal', gen: 7, poke_after: 'magearna',
    attributes: ['xmult', 'scaling', 'enhancements'],
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom(pseudoseed('mega_magearna_form')) < 0.5 ? 'original' : 'standard'; },
    poke_view_form(self, card) { return card.ability.extra.form; },
    poke_form_art: { original: { atlas: 'poke_mega_variants', pos: { x: 4, y: 0 }, soul_pos: { x: 5, y: 0 } } },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.Xmult_multi), r3(ex.soul_gain), r3(ex.soul_Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (scored(context) && has_enhancement(context.other_card, 'm_steel')) return { x_mult: ex.Xmult_multi, card };
      if (context.after && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker && (context.scoring_hand || []).filter(c => !c.debuff && has_enhancement(c, 'm_steel')).length >= 2) ex.soul_Xmult = r3(ex.soul_Xmult + ex.soul_gain);
      if (context.joker_main && ex.soul_Xmult > 1) return { Xmult_mod: ex.soul_Xmult, card };
    },
  },
  mega_zeraora: {
    name: 'mega_zeraora', poke_sprite391: sprite('Gen07', 8, 6, [9, 6]),
    config: { extra: { Xmult_multi: 1.35, dollars: 2 } },
    ...MEGA, ptype: 'Lightning', gen: 7, poke_after: 'zeraora',
    attributes: ['xmult', 'money', 'face', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.dollars, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      const c = context.other_card, sh = context.scoring_hand;
      if (!c || c.debuff || context.cardarea !== G.play || !c.is_face()) return;
      if (scored(context)) return { x_mult: card.ability.extra.Xmult_multi, dollars: pay(card.ability.extra.dollars), card };
      if (context.repetition && sh?.filter(v => !v.debuff && v.is_face()).length >= 3 && sh.find(v => !v.debuff && v.is_face()) === c) return { message: localize('k_again_ex'), repetitions: 1, card };
    },
  },
  mega_meowstic: {
    name: 'mega_meowstic', poke_sprite391: sprite('Gen06', 6, 13, [7, 13]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.5, male_Xmult: 1, male_gain: 0.15 } },
    ...MEGA, ptype: 'Psychic', gen: 6, poke_after: 'meowstic',
    attributes: ['xmult', 'scaling', 'tarot', 'generation'],
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom(pseudoseed('mega_meowstic_gender')) < 0.5 ? 'female' : 'male'; },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.form === 'female' ? '♀' : ex.form === 'male' ? '♂' : '?', r3(ex.Xmult), r3(ex.Xmult_mod), r3(ex.male_Xmult), r3(ex.male_gain)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      const makeTarot = () => {
        if (!G.consumeables || G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return false;
        G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
        G.E_MANAGER.add_event(() => { const c = create_card('Tarot', G.consumeables, null, null, null, null, undefined, 'mega_meowstic'); c.add_to_deck(); G.consumeables.emplace(c); G.GAME.consumeable_buffer--; });
        return true;
      };
      if (context.using_consumeable && context.consumeable?.ability.set === 'Tarot' && !context.blueprint && !context.retrigger_joker) {
        if (ex.form === 'male') ex.male_Xmult = r3(ex.male_Xmult + ex.male_gain);
        else if (ex.form === 'female' && ex.replaced_round !== G.GAME.round) {
          G.E_MANAGER.add_event(() => { if (ex.replaced_round !== G.GAME.round && makeTarot()) ex.replaced_round = G.GAME.round; });
        }
      }
      if (ex.form === 'male' && context.end_of_round && context.main_eval && !context.game_over && !context.blueprint && !context.retrigger_joker) makeTarot();
      if (context.joker_main) {
        const x = ex.form === 'male' ? ex.male_Xmult : ex.Xmult + ex.Xmult_mod * (G.consumeables?.cards || []).filter(c => c.ability.set === 'Tarot').length;
        return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
      }
    },
  },
  mega_tatsugiri: {
    name: 'mega_tatsugiri', poke_sprite391: sprite('Gen09', 2, 7, [3, 7]),
    config: { extra: { Xmult_multi: 2.25, chips: 180, mult: 35 } },
    ...MEGA, ptype: 'Dragon', gen: 9, poke_after: 'tatsugiri',
    attributes: ['xmult', 'chips', 'mult', 'joker', 'types', 'nature', 'position', 'retrigger'],
    set_ability(self, card, initial) { if (initial) card.ability.extra.form = pseudorandom_element(['curly', 'droopy', 'stretchy'], pseudoseed('mega_tatsugiri'))[0]; },
    poke_view_form(self, card) { return card.ability.extra.form; },
    poke_form_art: {
      droopy: { atlas: 'poke_mega_variants', pos: { x: 0, y: 0 }, soul_pos: { x: 1, y: 0 } },
      stretchy: { atlas: 'poke_mega_variants', pos: { x: 2, y: 0 }, soul_pos: { x: 3, y: 0 } },
    },
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.Xmult_multi, ex.chips, ex.mult, ex.form || 'unknown'] }; },
    calculate(self, card, context) {
      const target = (G.jokers?.cards || []).find(j => j !== card && is_type(j, 'Water'));
      if (context.retrigger_joker_check && !context.blueprint && context.other_card === target && target?.config.center.key === 'j_poke_dondozo') return { repetitions: 1, card };
      if (!context.retrigger_joker_check && context.other_joker && context.other_joker === target) {
        const ex = card.ability.extra;
        if (ex.form === 'curly') return { Xmult_mod: ex.Xmult_multi, card };
        if (ex.form === 'droopy') return { chip_mod: ex.chips, card };
        if (ex.form === 'stretchy') return { mult_mod: ex.mult, card };
      }
    },
  },
  mega_staraptor: {
    name: 'mega_staraptor', poke_sprite391: sprite('Gen04', 4, 7, [5, 7]),
    config: { extra: { Xmult_mod: 0.75, recoil: 1, refund: 3 } },
    ...MEGA, ptype: 'Fighting', gen: 4, poke_after: 'staraptor',
    attributes: ['xmult', 'types', 'money'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra, n = (G.jokers?.cards || []).filter(j => !j.debuff && is_type(j, 'Colorless')).length; return { vars: [r3(ex.Xmult_mod), ex.recoil, ex.refund, n, r3(1 + ex.Xmult_mod * n)] }; },
    calculate(self, card, context) {
      recoil(card, context);
      if (context.after && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) G.E_MANAGER.add_event(() => {
        if (G.GAME.facing_blind && G.GAME.blind && BN.beats(G.GAME.chips, G.GAME.blind.chips)) ease_poke_dollars(card, 'mega_staraptor', card.ability.extra.refund);
      });
      if (context.joker_main) { const n = (G.jokers?.cards || []).filter(j => !j.debuff && is_type(j, 'Colorless')).length, x = r3(1 + card.ability.extra.Xmult_mod * n); return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x }; }
    },
  },
  mega_chimecho: {
    name: 'mega_chimecho', poke_sprite391: sprite('Gen03', 0, 8, [1, 8]),
    config: { extra: { glass_limit: 4, glass_restored: 0, chips: 10 } },
    ...MEGA, ptype: 'Psychic', gen: 3, poke_after: 'chimecho', blueprint_compat: false,
    attributes: ['economy', 'enhancements', 'modify_card', 'chips'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_glass); const ex = card.ability.extra; return { vars: [ex.glass_limit, ex.chips, Math.max(0, ex.glass_limit - ex.glass_restored)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.remove_playing_cards && !context.blueprint && !context.retrigger_joker) for (const v of context.removed) {
        if (!(has_enhancement(v, 'm_glass') || v.glass_trigger) || ex.glass_restored >= ex.glass_limit) continue;
        const area = context.poke_removed_at_end ? G.deck : G.hand;
        G.E_MANAGER.add_event(() => {
          const c = copy_card(v, null, null, G.playing_card); c.ability.perma_bonus = (c.ability.perma_bonus || 0) + ex.chips;
          c.add_to_deck(); G.deck.config.card_limit++; G.playing_cards.push(c); area.emplace(c); c.start_materialize(); playing_card_joker_effects([c]);
        });
        ex.glass_restored++;
      }
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) ex.glass_restored = 0;
    },
    add_to_deck() { G.E_MANAGER.add_event(() => { for (const c of all_cards()) if (c.set_cost) c.set_cost(); }); },
    remove_from_deck() { G.E_MANAGER.add_event(() => { for (const c of all_cards()) if (c.set_cost) c.set_cost(); }); },
  },
  mega_crabominable: {
    name: 'mega_crabominable', poke_sprite391: sprite('Gen07', 10, 5, [11, 5]),
    config: { extra: { mult_mod: 2, mult_mod2: 6, dollars: 3 } },
    ...MEGA, ptype: 'Water', gen: 7, poke_after: 'crabominable', blueprint_compat: false,
    attributes: ['mult', 'scaling', 'modify_card', 'money'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(ex.mult_mod2), ex.dollars] }; },
    calculate(self, card, context) {
      if (!scored(context) || context.blueprint || context.retrigger_joker || !context.scoring_hand) return;
      const ex = card.ability.extra, target = context.other_card, hand = G.GAME.hands_played;
      if (ex.punch_hand !== hand) { ex.punch_hand = hand; ex.punch_cards = []; }
      if (ex.punch_cards.includes(target.sort_id)) return;
      ex.punch_cards.push(target.sort_id);
      const first = target === context.scoring_hand[0];
      target.ability.perma_mult = r3((target.ability.perma_mult || 0) + (first ? ex.mult_mod2 : ex.mult_mod));
      if (first && target.is_face()) ease_poke_dollars(card, 'mega_crabominable', ex.dollars);
      return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
    },
  },
  mega_scovillain: {
    name: 'mega_scovillain', poke_sprite391: sprite('Gen09', 8, 6, [9, 6]),
    config: { extra: { chips: 40, Xmult_multi: 1.5, d_size: 2 } },
    ...MEGA, ptype: 'Fire', gen: 9, poke_after: 'scovillain',
    attributes: ['chips', 'xmult', 'suit', 'discard', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.chips), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      const c = context.other_card, sh = context.scoring_hand;
      if (!c || c.debuff || context.cardarea !== G.play || !c.is_suit('Hearts')) return;
      if (scored(context)) return { chips: card.ability.extra.chips, x_mult: card.ability.extra.Xmult_multi, card };
      if (context.repetition && sh?.some(v => !v.debuff && v.is_suit('Hearts')) && sh.some(v => !v.debuff && v.is_suit('Clubs'))) return { message: localize('k_again_ex'), repetitions: 1, card };
    },
    ...discards,
  },
  mega_glimmora: {
    name: 'mega_glimmora', poke_sprite391: sprite('Gen09', 0, 7, [1, 7]),
    config: { extra: { Xmult_multi: 1.35, debris_cap: 4 } },
    ...MEGA, ptype: 'Earth', gen: 9, poke_after: 'glimmora',
    attributes: ['xmult', 'enhancements', 'modify_card', 'full_deck', 'hand'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone, P_CENTERS.m_poke_hazard); return { vars: [r3(card.ability.extra.Xmult_multi), card.ability.extra.debris_cap] }; },
    calculate(self, card, context) { toxic_debris(card, context); return hazard_held_x(card, context); },
  },
  mega_greninja: {
    name: 'mega_greninja', poke_sprite391: sprite('Gen06', 0, 13, [1, 13]),
    config: { extra: { hands: 1, Xmult: 2, Xmult_mod: 1 } },
    ...MEGA, ptype: 'Water', gen: 6, poke_after: 'greninja', poke_mono_exempt: true,
    attributes: ['starter', 'hands', 'xmult', 'types', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, r3(ex.Xmult), r3(ex.Xmult_mod), ninja_others(card)] }; },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blueprint && !card.getting_sliced) {
        const t = protean_pick(card); if (t) protean_set(card, t);
      }
      if (context.joker_main) { const x = r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * ninja_others(card)); return { Xmult_mod: x, message: a_xmult(x), colour: 'XMULT' }; }
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand[0] === context.other_card) {
        const n = Math.min(3, ninja_others(card)); if (n > 0) return { message: localize('k_again_ex'), repetitions: n, card };
      }
      return undefined;
    },
    ...hands,
  },
  mega_zygarde: {
    name: 'mega_zygarde', poke_sprite391: sprite('Gen06', 4, 14, [5, 14]),
    config: { extra: { h_size: 1, Xmult: 6, cells: 100 } },
    ...MEGA, ptype: 'Dragon', gen: 6, poke_after: 'zygarde',
    attributes: ['xmult', 'hand_size', 'economy'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.h_size, r3(card.ability.extra.Xmult), Math.min(10, Math.floor((card.ability.extra.cells || 0) / 10))] }; },
    calculate(self, card, context) {
      if (context.joker_main) return { Xmult_mod: card.ability.extra.Xmult, message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT' };
      if (context.setting_blind && !context.blueprint && !context.retrigger_joker) { const n = Math.min(10, Math.floor((card.ability.extra.cells || 0) / 10)); if (n) ease_poke_dollars(card, 'mega_zygarde', n); }
      return undefined;
    },
    ...hand_size,
  },
  mega_pyroar: {
    name: 'mega_pyroar', poke_sprite391: sprite('Gen06', 2, 13, [3, 13]),
    config: { extra: { chips: 180, Xmult: 2, Xmult2: 3 } },
    ...MEGA, ptype: 'Fire', gen: 6, poke_after: 'pyroar',
    attributes: ['chips', 'xmult', 'energy', 'flush', 'rank'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult), r3(ex.Xmult2)] }; },
    calculate(self, card, context) {
      if (!context.joker_main || !context.poker_hands || !(context.poker_hands.Flush || []).length) return undefined;
      const sh = context.scoring_hand || [], king = sh.some((c) => !c.debuff && c.get_id() === 13), queen = sh.some((c) => !c.debuff && c.get_id() === 12);
      const result = { chip_mod: card.ability.extra.chips };
      if (king || queen) {
        result.Xmult_mod = king && queen ? card.ability.extra.Xmult2 : card.ability.extra.Xmult;
        if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) < G.consumeables.config.card_limit) {
          G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
          G.E_MANAGER.add_event(() => { const e = create_card('Energy', G.consumeables, null, null, null, null, null, 'sup'); e.add_to_deck(); G.consumeables.emplace(e); G.GAME.consumeable_buffer -= 1; });
        }
      }
      return result;
    },
  },
  mega_malamar: {
    name: 'mega_malamar', poke_sprite391: sprite('Gen06', 8, 13, [9, 13]),
    config: { extra: { Xmult_multi: 1.5 } },
    ...MEGA, ptype: 'Dark', gen: 6, poke_after: 'malamar',
    attributes: ['xmult', 'rank', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      const c = context.other_card, sh = context.scoring_hand;
      if (!c || c.debuff || context.cardarea !== G.play || c.config.center.replace_base_card || c.config.center.no_rank) return undefined;
      const rank = c.get_id();
      if (scored(context) && rank >= 2 && rank <= 5) return { x_mult: card.ability.extra.Xmult_multi, card };
      if (context.repetition && (rank === 2 || rank === 5) && sh && sh.some((v) => !v.debuff && !v.config.center.replace_base_card && !v.config.center.no_rank && v.get_id() === 2) && sh.some((v) => !v.debuff && !v.config.center.replace_base_card && !v.config.center.no_rank && v.get_id() === 5))
        return { message: localize('k_again_ex'), repetitions: 1, card };
      return undefined;
    },
  },
  mega_scrafty: {
    name: 'mega_scrafty', poke_sprite391: sprite('Gen05', 0, 10, [1, 10]),
    config: { extra: { mult: 4, mult_mod: 3, mult_scaling_mod: 1, Xmult: 2.5 } },
    ...MEGA, ptype: 'Dark', gen: 5, poke_after: 'scrafty',
    attributes: ['mult', 'xmult', 'scaling'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.Xmult), r3(ex.mult_mod), r3(ex.mult_scaling_mod)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) return G.GAME.current_round.hands_played === 0
        ? { mult_mod: ex.mult, Xmult_mod: ex.Xmult, message: a_xmult(ex.Xmult), colour: 'XMULT' }
        : { mult_mod: ex.mult, message: a_mult(ex.mult), colour: 'MULT' };
      moxie(card, context, () => 2 * (ex.mult_mod + ex.mult_scaling_mod * find_pokemon_type('Dark', card).length));
      return undefined;
    },
  },
  mega_dragalge: {
    name: 'mega_dragalge', poke_sprite391: sprite('Gen06', 0, 14, [1, 14]),
    config: { extra: { Xmult_multi: 1.5 } },
    ...MEGA, ptype: 'Dark', gen: 6, poke_after: 'dragalge',
    attributes: ['hazards', 'modify_card', 'xmult'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard); return { vars: [r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) { skrelp_poison(card, context); skrelp_poison(card, context); return hazard_held_x(card, context); },
  },
  mega_delphox: {
    name: 'mega_delphox', poke_sprite391: sprite('Gen06', 10, 12, [11, 12]),
    config: { extra: { d_size: 1, scry: 2, Xmult_mod: 0.4, fire_Xmult: 1 } },
    ...MEGA, ptype: 'Fire', gen: 6, poke_after: 'delphox',
    attributes: ['starter', 'discard', 'foresight', 'xmult', 'scaling', 'tarot'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, r3(ex.Xmult_mod), r3(ex.fire_Xmult)] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.using_consumeable && context.consumeable && context.consumeable.ability.set === 'Tarot' && !context.blueprint && !context.retrigger_joker &&
          ex.planet_round !== G.GAME.round && G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) < G.consumeables.config.card_limit) {
        ex.planet_round = G.GAME.round;
        G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
        G.E_MANAGER.add_event(() => { const p = create_card('Planet', G.consumeables, null, null, null, null, undefined, 'mega_delphox'); p.add_to_deck(); G.consumeables.emplace(p); G.GAME.consumeable_buffer -= 1; });
      }
      return mystical_fire(card, context);
    },
    ...discards_scry,
  },
  mega_excadrill: {
    name: 'mega_excadrill', poke_sprite391: sprite('Gen05', 8, 9, [9, 9]),
    config: { extra: { mult_mod: 4 } },
    ...MEGA, ptype: 'Earth', gen: 5, poke_after: 'excadrill',
    attributes: ['mult', 'stone', 'destroy_card', 'economy'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push({ set: 'Other', key: 'exdril_treasure' }); return { vars: [r3(card.ability.extra.mult_mod)] }; },
    calculate(self, card, context) {
      if (context.joker_main && context.scoring_hand) {
        const m = Math.max(0, 52 - (G.playing_cards || []).length) * card.ability.extra.mult_mod;
        if (m > 0) return { message: a_mult(r3(m)), colour: 'MULT', mult_mod: m };
      }
      if (context.destroying_card && !context.blueprint && has_enhancement(context.destroying_card, 'm_stone')) {
        poke_create_treasure(card, 'excadril', true);
        ease_poke_dollars(card, 'mega_excadrill', 2);
        return true;
      }
      return undefined;
    },
  },
  mega_emboar: {
    name: 'mega_emboar', poke_sprite391: sprite('Gen05', 6, 9, [7, 9]),
    config: { extra: { d_size: 2, Xmult_mod: 0.5, streak: 0 } },
    ...MEGA, ptype: 'Fire', gen: 5, poke_after: 'emboar',
    attributes: ['starter', 'discard', 'xmult', 'hand_type', 'reset', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.d_size, r3(ex.Xmult_mod), flame_streak(ex)] }; },
    calculate(self, card, context) {
      flame_charge(card, context);
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card === context.scoring_hand[0] && flame_streak(card.ability.extra) >= 3)
        return { message: localize('k_again_ex'), repetitions: 1, card };
      return flame_main(card, context);
    },
    ...discards,
  },
  mega_floette: {
    name: 'mega_floette', poke_sprite391: sprite('Gen06', 4, 13, [5, 13]),
    config: { extra: { retriggers: 2, Xmult_multi: 1.5 } },
    ...MEGA, ptype: 'Fairy', gen: 6, poke_after: 'floette',
    attributes: ['retrigger', 'xmult', 'rank', 'face', 'economy'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.retriggers, r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      const c = context.other_card;
      if (c && !c.debuff && c.get_id() === 12 && context.cardarea === G.play) {
        if (context.repetition) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        if (scored(context)) return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      if (context.joker_main && context.scoring_hand && context.scoring_hand.filter((v) => !v.debuff && v.get_id() === 12).length >= 2)
        return { dollars: pay(3), card };
      return undefined;
    },
  },
  mega_froslass: {
    name: 'mega_froslass', poke_sprite391: sprite('Gen04', 10, 7, [11, 7]),
    config: { extra: { debt: 30, Xmult: 2, Xmult2: 3 } },
    ...MEGA, ptype: 'Water', gen: 4, poke_after: 'froslass',
    attributes: ['economy', 'xmult', 'item', 'generation'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.debt, r3(ex.Xmult), r3(ex.Xmult2)] }; },
    calculate(self, card, context) {
      if (!context.joker_main || G.GAME.dollars >= 0) return undefined;
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        const item = create_card('Item', G.consumeables, null, null, null, null, null);
        item.add_to_deck(); G.consumeables.emplace(item);
      }
      const x = G.GAME.dollars <= -15 ? card.ability.extra.Xmult2 : card.ability.extra.Xmult;
      return { Xmult_mod: x, message: a_xmult(x), colour: 'XMULT' };
    },
    add_to_deck(self, card) { G.GAME.bankrupt_at -= card.ability.extra.debt; },
    remove_from_deck(self, card) { G.GAME.bankrupt_at += card.ability.extra.debt; },
  },
  mega_chesnaught: {
    name: 'mega_chesnaught', poke_sprite391: sprite('Gen06', 8, 12, [9, 12]),
    config: { extra: { h_size: 1, chips: 300, Xmult: 2.5 } },
    ...MEGA, ptype: 'Grass', gen: 6, poke_after: 'chesnaught',
    attributes: ['starter', 'hand_size', 'chips', 'xmult', 'hands', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, r3(ex.chips), r3(ex.Xmult)] }; },
    calculate(self, card, context) {
      const active = G.GAME.current_round.hands_left + 1 >= 2;
      if (context.joker_main) return active
        ? { chip_mod: card.ability.extra.chips, Xmult_mod: card.ability.extra.Xmult, message: 'Spiky Shield!', colour: 'XMULT' }
        : { chip_mod: card.ability.extra.chips, message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS' };
      const sh = context.scoring_hand;
      if (active && context.repetition && context.cardarea === G.play && sh && sh.length && context.other_card === sh[sh.length - 1])
        return { message: localize('k_again_ex'), repetitions: 1, card };
      return undefined;
    },
    ...hand_size,
  },
  mega_scolipede: {
    name: 'mega_scolipede', poke_sprite391: sprite('Gen05', 10, 9, [11, 9]),
    config: { extra: { chip_loss: 3, mult_mod: 10, toxic: true } },
    ...MEGA, ptype: 'Dark', gen: 5, poke_after: 'scolipede',
    attributes: ['mult', 'discard', 'modify_card', 'enhancements'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.mult_mod), card.ability.extra.chip_loss] }; },
    calculate(self, card, context) { return poison_point(card, context); },
  },
  mega_eelektross: {
    name: 'mega_eelektross', poke_sprite391: sprite('Gen05', 2, 10, [3, 10]),
    config: { extra: { Xmult: 1.5, Xmult_mod: 0.25 } },
    ...MEGA, ptype: 'Lightning', gen: 5, poke_after: 'eelektross',
    attributes: ['xmult', 'enhancements', 'full_deck', 'retrigger'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        const n = (G.playing_cards || []).filter((c) => has_enhancement(c, 'm_steel')).length;
        const x = r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * n);
        return { message: a_xmult(x), colour: 'XMULT', Xmult_mod: x };
      }
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card &&
          context.scoring_hand.find((c) => !c.debuff && has_enhancement(c, 'm_steel')) === context.other_card)
        return { message: localize('k_again_ex'), repetitions: 1, card };
      return undefined;
    },
  },
  mega_chandelure: {
    name: 'mega_chandelure', poke_sprite391: sprite('Gen05', 4, 10, [5, 10]),
    config: { extra: { Xmult_multi: 1.6 } },
    ...MEGA, ptype: 'Fire', gen: 5, poke_after: 'chandelure',
    attributes: ['mult', 'xmult', 'economy'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [r3(card.ability.extra.Xmult_multi), card.sell_cost, card.sell_cost * 2] }; },
    calculate(self, card, context) {
      if (context.joker_main && card.sell_cost > 0) return { message: a_mult(card.sell_cost * 2), colour: 'MULT', mult_mod: card.sell_cost * 2 };
      if (context.other_joker && context.other_joker.sell_cost < 2) return { message: a_xmult(card.ability.extra.Xmult_multi), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
      return undefined;
    },
  },
  mega_falinks: {
    name: 'mega_falinks', poke_sprite391: sprite('Gen08', 0, 14, [1, 14]),
    config: { extra: { mult: 12, Xmult: 2, Xmult_mod: 0.2 } },
    ...MEGA, ptype: 'Fighting', gen: 8, poke_after: 'falinks',
    attributes: ['mult', 'xmult', 'suits'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult), r3(ex.Xmult), r3(ex.Xmult_mod)] }; },
    calculate(self, card, context) {
      if (scored(context)) return { mult: card.ability.extra.mult, card };
      const sh = context.scoring_hand;
      if (context.joker_main && sh && sh.length && ['Hearts', 'Diamonds', 'Clubs', 'Spades'].some((suit) => sh.every((c) => c.is_suit(suit, true)))) {
        const x = r3(card.ability.extra.Xmult + card.ability.extra.Xmult_mod * sh.length);
        return { Xmult_mod: x, message: a_xmult(x), colour: 'XMULT' };
      }
      return undefined;
    },
  },
  mega_hawlucha: {
    name: 'mega_hawlucha', poke_sprite391: sprite('Gen06', 2, 14, [3, 14]),
    config: { extra: { retriggers: 2, Xmult_multi: 1.25 } },
    ...MEGA, ptype: 'Fighting', gen: 6, poke_after: 'hawlucha',
    attributes: ['retrigger', 'xmult', 'suit'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.retriggers, r3(card.ability.extra.Xmult_multi)] }; },
    calculate(self, card, context) {
      const sh = context.scoring_hand, c = context.other_card;
      if (!sh || !sh.length || !c || (c !== sh[0] && c !== sh[sh.length - 1])) return undefined;
      if (context.repetition && context.cardarea === G.play) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      if (scored(context) && ['Hearts', 'Diamonds', 'Clubs', 'Spades'].some((suit) => sh[0].is_suit(suit) && sh[sh.length - 1].is_suit(suit)))
        return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
  mega_barbaracle: {
    name: 'mega_barbaracle', poke_sprite391: sprite('Gen06', 10, 13, [11, 13]),
    config: { extra: { chips: 40, Xmult_multi: 1.75 } },
    ...MEGA, ptype: 'Fighting', gen: 6, poke_after: 'barbaracle',
    attributes: ['chips', 'xmult', 'rank'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      const other = context.other_card;
      if (context.repetition && context.cardarea === G.play && other && !other.debuff && other.get_id() === 7 &&
          (context.scoring_hand || []).filter((c) => !c.debuff && c.get_id() === 7).length >= 2)
        return { message: 'Again!', repetitions: 1, card };
      if (scored(context) && other.get_id() === 7) return { chips: card.ability.extra.chips, x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
  },
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
  // Mega Salamence 373-1 (Dragon), Aerilate: +10 Mult per Straight; r106 keeps Salamence's temporary hand size at blind select.
  // Pokermon's Salamence lists it (Nacho 1.6.4's legacy Mega Salamence, unreachable, is now a duplicate of this one: precedence).
  mega_salamence: {
    name: 'mega_salamence', poke_sprite391: sprite('Gen03', 8, 6, [9, 6]),
    config: { extra: { mult_mod: 10, divisor: 5 } },
    ...MEGA, ptype: 'Dragon', gen: 3, poke_after: 'salamence',
    attributes: ['mult', 'hand_type', 'straight', 'hand_size'],
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.mult_mod), r3(straights() * ex.mult_mod), ex.divisor || 5] }; },
    calculate(self, card, context) {
      if (rulesRev('pokermon') >= 106 && context.setting_blind) {
        const n = Math.floor(straights() / (card.ability.extra.divisor || 5));
        if (n > 0) {
          card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [n] }) });
          G.hand.change_size(n);
          G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + n;
        }
      }
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
  // Mega Rayquaza 384-1 (Dragon), Delta Stream: +2 hands and +2 discards each round (fixed); before contentRev 111 it also kept Kyogre and
  // Groudon from clashing (pokejokers_designs.js delta_calm; from r111 there is no clash: SIMPLE_TRIO_REV); Dragon Ascent: Rayquaza's bank
  // (`ascent_Xmult`, CARRY) grows X0.4 (`Xmult_mod` +20%: 0.48 / 0.56 / 0.64) for each played hand containing a Straight or a Flush.
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
    j_poke_mega_golisopod: { name: 'Mega Golisopod', text: [
      '{X:mult,C:white} X#1# {} Mult; faints before the', 'third hand of a round', 'Beat a Boss Blind without fainting this', 'ante to gain {C:attention}+1 hand size{}; lose', 'these gains if it later faints', '{C:inactive}(Currently +#2# hand size)'] },
    j_poke_mega_heatran: { name: 'Mega Heatran', text: [
      '{C:attention}Forge{} scored cards, converting', 'their modifiers into permanent effects', 'The first card forged each hand gains', '{C:chips}+#1#{} permanent Chips and {C:mult}+#2#{} Mult'] },
    j_poke_mega_lucario_z: { name: 'Mega Lucario Z', text: [
      'Each held card with an {C:attention}Edition{}', 'gives {X:mult,C:white} X#1# {} Mult', 'If at least 2 different Editions are', 'held, retrigger those cards once'] },
    j_poke_mega_absol_z: { name: 'Mega Absol Z', text: [
      '{X:mult,C:white} X#1# {} Mult', 'Listed probabilities are zero on the', 'first hand of each round, then guaranteed'] },
    j_poke_mega_garchomp_z: { name: 'Mega Garchomp Z', text: [
      '{C:mult}+#3#{} Mult; held {C:attention}Gold{} cards each', 'give {X:mult,C:white} X#1# {} Mult', 'With 3 or more held Gold cards,', 'each also gives {C:mult}+#2#{} Mult'] },
    j_poke_mega_golurk: { name: 'Mega Golurk', text: [
      'Held {C:attention}Hazard{} cards give {X:mult,C:white} X#1# {} Mult', 'and are retriggered once', 'Other held cards have a {C:green}#2# in #3#{}', 'chance to give {X:mult,C:white} X#1# {} Mult'] },
    j_poke_mega_magearna: { name: 'Mega Magearna', text: [
      'Scored {C:attention}Steel{} cards give {X:mult,C:white} X#1# {} Mult', 'After scoring at least 2 Steel cards,', 'gain {X:mult,C:white} X#2# {} Mult {C:inactive}(Currently X#3#)'] },
    j_poke_mega_zeraora: { name: 'Mega Zeraora', text: [
      'Scored {C:attention}face{} cards earn {C:money}$#1#{}', 'and give {X:mult,C:white} X#2# {} Mult', 'If 3 or more face cards score,', 'retrigger the first scored face card'] },
    j_poke_mega_meowstic: { name: 'Mega Meowstic', text: [
      '{C:attention}Gender: #1#{}', '♂: create a Tarot at end of round;', 'gain {X:mult,C:white} X#5# {} per Tarot used {C:inactive}(X#4#)', '♀: {X:mult,C:white} X#2# {} plus {X:mult,C:white} X#3# {} per Tarot held;', 'once per round, replace a Tarot used', '{C:inactive}(Must have room)'] },
    j_poke_mega_tatsugiri: { name: 'Mega Tatsugiri', text: [
      '{C:attention}Nature: #4#{}; the leftmost', '{X:poke_water,C:white}Water{} Joker gives:', 'Curly: {X:mult,C:white} X#1# {} Mult, Droopy: {C:chips}+#2#{} Chips,', 'Stretchy: {C:mult}+#3#{} Mult', 'If it is {C:attention}Dondozo{}, retrigger it'] },
    j_poke_mega_staraptor: { name: 'Mega Staraptor', text: [
      '{X:mult,C:white} X1 {} Mult plus {X:mult,C:white} X#1# {} for each', '{X:poke_colorless,C:white}Colorless{} Joker {C:inactive}(#4#: X#5#)', 'Lose {C:money}$#2#{} each hand; earn {C:money}$#3#{}', 'if that hand defeats the Blind'] },
    j_poke_mega_chimecho: { name: 'Mega Chimecho', text: [
      '{C:attention}Vouchers{} in the shop are {C:money}free{}', 'The first {C:attention}#1# Glass cards{} destroyed', 'each round return as copies and', 'permanently gain {C:chips}+#2#{} Chips', '{C:inactive}(#3# remaining this round)'] },
    j_poke_mega_crabominable: { name: 'Mega Crabominable', text: [
      'Scored cards permanently gain', '{C:mult}+#1#{} Mult; the first gains {C:mult}+#2#{} instead', 'If the first is a face card, earn {C:money}$#3#{}', '{C:inactive}(Once per card each hand)'] },
    j_poke_mega_scovillain: { name: 'Mega Scovillain', text: [
      '{C:red}+#1#{} discards each round', 'Scored {C:hearts}Hearts{} give {C:chips}+#2#{} Chips', 'and {X:mult,C:white} X#3# {} Mult; retrigger them', 'if a {C:hearts}Heart{} and a {C:clubs}Club{} score'] },
    j_poke_mega_glimmora: { name: 'Mega Glimmora', text: [
      'Scored {C:attention}Stone{} cards turn a', 'random deck card into a {C:attention}Hazard{},', 'up to {C:attention}#2#{} per hand', 'Each {C:attention}Hazard{} held in hand', 'gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_mega_greninja: { name: 'Mega Greninja', text: [
      '{C:chips}+#1#{} hand; adopts the team\'s type', '{X:mult,C:white} X#2# {} Mult plus {X:mult,C:white} X#3# {} per other', 'Joker of its current type {C:inactive}(#4#){}', 'Retrigger the first scored card once', 'per matching Joker {C:inactive}(max 3)'] },
    j_poke_mega_zygarde: { name: 'Mega Zygarde', text: [
      '{C:attention}+#1#{} hand size, {X:mult,C:white} X#2# {} Mult', 'When a Blind is selected, earn', '{C:money}$1{} per 10 Cells {C:inactive}(currently $#3#)', '{C:inactive}(Requires Complete Forme)'] },
    j_poke_mega_pyroar: { name: 'Mega Pyroar', text: [
      'A {C:attention}Flush{} gives {C:chips}+#1#{} Chips', 'With a {C:attention}King{} or {C:attention}Queen{},', 'create an Energy {C:inactive}(must have room){}', 'and give {X:mult,C:white} X#2# {} Mult; with both, {X:mult,C:white} X#3# {} instead'] },
    j_poke_mega_malamar: { name: 'Mega Malamar', text: [
      'Flips every card\'s rank Chips', '{C:inactive}(2 ↔ Ace, 3 ↔ King, etc.)', 'Scored {C:attention}2–5{} give {X:mult,C:white} X#1# {} Mult', 'If a {C:attention}2{} and a {C:attention}5{} score,', 'retrigger each scored 2 and 5'] },
    j_poke_mega_scrafty: { name: 'Mega Scrafty', text: [
      '{C:mult}+#1#{} Mult, and {X:mult,C:white} X#2# {} Mult', 'on the first hand each round', 'Moxie: defeating a Blind on the', 'first hand gains twice {C:mult}+#3#{} Mult', '{C:inactive}(+#4# per other Dark Joker)'] },
    j_poke_mega_dragalge: { name: 'Mega Dragalge', text: [
      'When a Blind is selected, turn', '{C:attention}2{} deck cards into {C:attention}Hazards{}', 'Each Hazard held in hand', 'gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_mega_delphox: { name: 'Mega Delphox', text: [
      '{C:red}+#1#{} discard, {C:purple}+#2#{} Foresight', 'Gains {X:mult,C:white} X#3# {} Mult per Tarot used', '{C:inactive}(Currently X#4#){}', 'Once per round, using a Tarot creates', 'a {C:planet}Planet{} {C:inactive}(must have room)'] },
    j_poke_mega_excadrill: { name: 'Mega Excadrill', text: [
      '{C:mult}+#1#{} Mult per card your deck', 'has fewer than {C:attention}52{} cards', 'Played {C:attention}Stone{} cards are destroyed', 'for treasure and earn {C:money}$2{}'] },
    j_poke_mega_emboar: { name: 'Mega Emboar', text: [
      '{C:red}+#1#{} discards', '{X:mult,C:white} X1 {} Mult plus {X:mult,C:white} X#2# {} per', 'consecutive hand of the same type', '{C:inactive}(Currently #3#){}', 'At 3 or more, retrigger the first scored card'] },
    j_poke_mega_floette: { name: 'Mega Floette', text: [
      'Scored {C:attention}Queens{} retrigger {C:attention}#1#{} times', 'and give {X:mult,C:white} X#2# {} Mult', 'If {C:attention}2 or more Queens{} score,', 'earn {C:money}$3{} once per hand'] },
    j_poke_mega_froslass: { name: 'Mega Froslass', text: [
      'Go up to {C:money}-$#1#{} in debt', 'Each hand played in debt creates', 'an {C:attention}Item{} {C:inactive}(must have room){} and gives', '{X:mult,C:white} X#2# {} Mult, or {X:mult,C:white} X#3# {} at {C:money}-$15{} or less'] },
    j_poke_mega_chesnaught: { name: 'Mega Chesnaught', text: [
      '{C:attention}+#1#{} hand size, {C:chips}+#2#{} Chips', 'With {C:attention}2 or more hands left{}', '{C:inactive}(including this hand){}: {X:mult,C:white} X#3# {} Mult', 'and retrigger the last scored card'] },
    j_poke_mega_scolipede: { name: 'Mega Scolipede', text: [
      'Discarded cards permanently gain', '{C:mult}+#1#{} Mult and lose {C:chips}#2#{} Chips', '{C:inactive}(Chips cannot fall below 0)', 'Unenhanced discards become {C:mult}Mult{} cards'] },
    j_poke_mega_eelektross: { name: 'Mega Eelektross', text: [
      '{X:mult,C:white} X#1# {} Mult, plus {X:mult,C:white} X#2# {}', 'per {C:attention}Steel{} card in your full deck', 'Retrigger the first scored Steel card'] },
    j_poke_mega_chandelure: { name: 'Mega Chandelure', text: [
      'Adds {C:attention}twice{} its sell value to Mult', '{C:inactive}(Currently +#3# Mult)', 'Each Joker worth less than {C:money}$2{}', 'gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_mega_falinks: { name: 'Mega Falinks', text: [
      'Each scored card gives {C:mult}+#1#{} Mult', 'If all scored cards share a suit,', 'give {X:mult,C:white} X#2# {} Mult plus', '{X:mult,C:white} X#3# {} per scored card'] },
    j_poke_mega_hawlucha: { name: 'Mega Hawlucha', text: [
      'Retrigger the {C:attention}first{} and {C:attention}last{}', 'scored cards {C:attention}#1#{} times',
      'If they share a suit, each gives', '{X:mult,C:white} X#2# {} Mult when scored', '{C:inactive}(A lone card counts once)'] },
    j_poke_mega_barbaracle: { name: 'Mega Barbaracle', text: [
      'Each scored {C:attention}7{} gives {C:chips}+#1#{} Chips', 'and {X:mult,C:white} X#2# {} Mult', 'If {C:attention}2 or more 7s{} score,', 'retrigger each scored 7 once'] },
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
      '{C:attention}Aerilate:{} {C:mult}+#1#{} Mult for each', '{C:attention}Straight{} played this run', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)',
      BR, 'At Blind select, {C:attention}+1 hand size{}', 'this round per {C:attention}#3# Straights{} played'] },
    j_poke_mega_metagross: { name: 'Mega Metagross', text: [
      '{C:attention}Tough Claws:{} if {C:attention}poker hand{}', 'is a {C:attention}Four of a Kind{}, each', 'played card gives {X:mult,C:white} X#1# {} Mult'] },
    j_poke_mega_latias: { name: 'Mega Latias', text: [
      '{C:attention}Mist Ball:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:tarot}Tarot{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)',
      BR, '{C:attention}Soul Dew:{} also gains', '{X:mult,C:white} X#3# {} Mult each time', 'you use a {C:planet}Planet{} card'] },
    j_poke_mega_latios: { name: 'Mega Latios', text: [
      '{C:attention}Luster Purge:{} gains {X:mult,C:white} X#2# {} Mult', 'each time you use a {C:planet}Planet{} card', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)',
      BR, '{C:attention}Soul Dew:{} also gains', '{X:mult,C:white} X#3# {} Mult each time', 'you use a {C:tarot}Tarot{} card'] },
    j_poke_mega_rayquaza: { name: 'Mega Rayquaza', text: [
      // (contentRev 111: plain text, no Kyogre / Groudon)
      '{C:chips}+#3#{} hands and {C:red}+#4#{} discards', 'each round', 'Gains {X:mult,C:white} X#2# {} Mult per', '{C:attention}Straight{} or {C:attention}Flush{}', '{C:inactive}(Currently {X:mult,C:white} X#1# {C:inactive} Mult)'] },
    j_poke_mega_garchomp: { name: 'Mega Garchomp', text: [
      '{C:mult}+#1#{} Mult {C:inactive}(banked by Bite)', BR, '{C:attention}Sand Force:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#2# {} for each {C:attention}Gold{} card',
      'held in hand', '{C:inactive}(Currently {C:attention}#3#{C:inactive}: {X:mult,C:white} X#4# {C:inactive} Mult)'] },
    j_poke_mega_diancie: { name: 'Mega Diancie', text: [
      '{C:attention}Diamond Storm:{} each scored', '{C:diamonds}Diamond{} earns {C:money}$#1#{} and', 'gives {X:mult,C:white} X#2# {} Mult',
      BR, 'When a {C:attention}Blind{} is selected,', 'a random non-{C:diamonds}Diamond{} card', 'in your deck becomes', 'a {C:diamonds}Diamond{}'] },
  },
};
