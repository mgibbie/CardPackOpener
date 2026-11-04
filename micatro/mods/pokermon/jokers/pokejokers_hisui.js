// The owner's regional forms, batch C: the Hisuian and Paldean forms ("yes", 2026-11-03; Pokermon regional batch C, contentRev HISUI_REV;
// PORTING.md "Regional batch C"; DESIGN_GUIDE.txt 2.1 "REGIONAL FORMS"). Micatro's own designs; upstream Pokermon 3.9.1 draws every one of
// them (its Gen 1 / 2 / 5 / 6 / 7 sheets) but registers none: nothing to deploy. Types from the card art (owner rule,
// tools/micatro/pokermon_art_type.mjs).
//
// Three shapes:
//   - OWN LINES, their own pool entries and families beside the originals (Common $5 -> Safari $8; a level_evo): Hisuian Growlithe ->
//     Arcanine, Hisuian Voltorb -> Electrode; Paldean Wooper -> Clodsire (its own family [paldean_wooper, clodsire] beside the Wooper line,
//     so neither Wooper keeps the other out of the shop; Kanto Wooper's Dark-Energy route to Clodsire stays); Paldean Tauros (Rare $7,
//     single stage, its breed rolled when obtained). Hisuian Sneasel -> Sneasler is Nacho's (mods/nacho/pokemon/0903_sneasler.js).
//   - BRANCH EVOLUTIONS by an Energy used on the earlier stage (the Galarian pattern, systems/energy.js energy_evo_target; energize first,
//     then evolve; refused while debuffed or with an Everstone; the normal evolutions are unchanged): Quilava -> Hisuian Typhlosion
//     (Psychic), Dewott -> Hisuian Samurott (Dark), Dartrix -> Hisuian Decidueye (Fighting), and from the BASIC of our 2-stage lines
//     Petilil -> Hisuian Lilligant (Fighting), Rufflet -> Hisuian Braviary (Psychic), Bergmite -> Hisuian Avalugg (Earth). Gated by
//     rulesRev (HISUI_REV, `rev` on each poke_energy_evo; the six join their families on that rev: HISUI_FAMILY_REV), so runs recorded
//     before it replay as recorded. The three starter finals keep their line's fixed perk (+1 discard / +1 hand / +1 hand size), as their
//     Stage 1 has it.
// Every regional joker shows a region pill ("Hisuian", "Paldean") before its type pill (systems/types.js region_badge, read from the key).
// After its original line in Pokédex order. A regional form takes its base species' generation (pokermon_gen_filter_test).
import {
  G, P_CENTERS, card_eval_status_text, localize, pseudorandom, pseudoseed, defineJokers, type_tooltip, level_evo,
  has_enhancement, ease_discard, ease_hands_played, get_probability_vars, HISUI_REV,
} from '../api.js';
import { clodsire_poison, hazards_in_deck, razor_shell, protean_set } from './pokejokers_designs.js';
import { family } from '../systems/evolution.js';

const FILE = 'micatro/pokejokers_hisui';
const sprite = (sheet, x, y) => ({ atlas: 'AtlasJokersBasic' + sheet, pos: { x, y } });
const r3 = (x) => Math.round(x * 1000) / 1000;
const r9 = (x) => Math.round(x * 1e9) / 1e9;
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
const scored = (context) => !!(context.individual && context.cardarea === G.play && !context.end_of_round && !context.other_card.debuff);
const held = (context) => !!(context.individual && context.cardarea === G.hand && !context.end_of_round && !context.other_card.debuff);
const foreseen = (context) => !!(context.individual && G.scry_view && context.cardarea === G.scry_view && !context.end_of_round && !context.other_card.debuff);
const unbroken = (c) => !c.destroyed && !c.shattered && !c.removed;
const cr = () => (G.GAME && G.GAME.current_round) || {};
/** The round's FIRST hand (Pachirisu's spark_on: current_round.hands_played is still the pre-hand count while a hand scores). */
const first_hand = () => !!(G.GAME && G.GAME.facing_blind && cr().hands_played === 0);
const boss_now = () => !!(G.GAME && G.GAME.facing_blind && G.GAME.blind && G.GAME.blind.boss);
/** The first card of the scoring hand that scores (a debuffed one doesn't). */
const first_scored = (context) => (context.scoring_hand || []).find((c) => !c.debuff);
/** Hisuian Decidueye, Triple Arrows: the first `arrows` cards of the scoring hand, by position (Razor Shell's rule: a debuffed one there
 *  gets nothing and the next card isn't promoted). */
const among_first = (context, n) => { const i = (context.scoring_hand || []).indexOf(context.other_card); return i >= 0 && i < n; };
const seeds_in_deck = () => (G.playing_cards || []).filter((c) => unbroken(c) && has_enhancement(c, 'm_poke_seed')).length;

// Fixed perks (never energized): the starters' +1 discard / +1 hand / +1 hand size, Paldean Tauros's breed perk.
const discards = {
  add_to_deck(self, card) { G.GAME.round_resets.discards += card.ability.extra.d_size; ease_discard(card.ability.extra.d_size); },
  remove_from_deck(self, card) { G.GAME.round_resets.discards -= card.ability.extra.d_size; ease_discard(-card.ability.extra.d_size); },
};
const add_hands = (card, n, from_debuff) => { G.GAME.round_resets.hands += n; if (!from_debuff) ease_hands_played(n); };
const remove_hands = (card, n) => {
  G.GAME.round_resets.hands -= n;
  const to_decrease = Math.min(cr().hands_left - 1, n);
  if (to_decrease > 0) ease_hands_played(-to_decrease);
};
const hands = {
  add_to_deck(self, card, from_debuff) { add_hands(card, card.ability.extra.hands, from_debuff); },
  remove_from_deck(self, card) { remove_hands(card, card.ability.extra.hands); },
};
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
const scry = {
  add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
  remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
};
const both = (a, b) => ({
  add_to_deck(self, card, from_debuff) { a.add_to_deck(self, card, from_debuff); b.add_to_deck(self, card, from_debuff); },
  remove_from_deck(self, card, from_debuff) { a.remove_from_deck(self, card, from_debuff); b.remove_from_deck(self, card, from_debuff); },
});

// ------------------------------------------------------------ Paldean Tauros's breeds
/** Paldean Tauros's breed: rolled when it is OBTAINED (add_to_deck, if none yet: Toxtricity's moment, so a shop / collection card never
 *  moves the seeded stream), 1 in 3 each on the run's seeded 'paldean_tauros_breed'; kept on card.ability (poke_tauros_breed), so it
 *  rides through copies. Its TYPE follows the breed (protean_set: is_type / Energy / Kecleon follow; a Tera sticker still overrides) and so
 *  does its card (systems/anim.js GEN9_FORM_SPRITES). Not Monotype-exempt: the breed is fixed once rolled. Unobtained: the Combat card. */
export const TAUROS_BREEDS = {
  combat: { name: 'Combat Breed', ptype: 'Fighting' },
  blaze: { name: 'Blaze Breed', ptype: 'Fire' },
  aqua: { name: 'Aqua Breed', ptype: 'Water' },
};
const BREED_ORDER = ['combat', 'blaze', 'aqua'];
export const tauros_breed = (card) => (TAUROS_BREEDS[card.ability.poke_tauros_breed] ? card.ability.poke_tauros_breed : null);
function breed_roll(card) {
  if (!tauros_breed(card)) card.ability.poke_tauros_breed = BREED_ORDER[Math.min(2, Math.floor(pseudorandom(pseudoseed('paldean_tauros_breed')) * 3))];
  protean_set(card, TAUROS_BREEDS[tauros_breed(card)].ptype);
}
/** The breed's scored-card rule: Combat face cards (is_face: Pareidolia counts), Blaze Hearts, Aqua Clubs (is_suit: a Wild card counts). */
function breed_scores(card, c) {
  const b = tauros_breed(card);
  if (b === 'combat') return c.is_face();
  if (b === 'blaze') return c.is_suit('Hearts');
  if (b === 'aqua') return c.is_suit('Clubs');
  return false;
}

// ------------------------------------------------------------ shared bodies
/** Hisuian Lilligant, Victory Dance: X1 + Xmult_mod per hand played this round, THIS
 *  hand included (the round's first hand X1.1; resets each round: nothing is banked). */
const dance_x = (card) => r9(1 + card.ability.extra.Xmult_mod * ((cr().hands_played || 0) + 1));
/** Hisuian Electrode, Chloroblast: X1 + Xmult_mod per Seed card in your full deck (any card counting as one; destroyed cards don't). */
const chloro_x = (card) => r9(1 + card.ability.extra.Xmult_mod * seeds_in_deck());
/** Paldean Wooper, Poison Point: +mult Mult per Hazard card in the full deck. */
const wooper_mult = (card) => r3(card.ability.extra.mult * hazards_in_deck());

defineJokers({
  // Hisuian Growlithe (Earth; Common $5): +40 Chips, doubled on the round's first hand (`chips` +30%: 52 / 64 / 76). 5 rounds.
  hisuian_growlithe: {
    name: 'hisuian_growlithe', poke_sprite391: sprite('Gen01', 14, 5),
    config: { extra: { chips: 40, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 1, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['chips', 'hands', 'round_evo'], poke_after: 'arcanine',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips * 2), ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) { const c = r3(card.ability.extra.chips * (first_hand() ? 2 : 1)); return { message: a_chips(c), colour: 'CHIPS', chip_mod: c }; }
      return level_evo(self, card, context, 'j_poke_hisuian_arcanine');
    },
  },
  // Hisuian Arcanine (Safari $8), Head Smash: X2.5 on the round's first hand (`Xmult` +20%: 3 / 3.5 / 4); the first scored card of that hand
  // is destroyed after scoring (Steamodded's destroy_card; not a Blueprint's: it copies the X only).
  hisuian_arcanine: {
    name: 'hisuian_arcanine', poke_sprite391: sprite('Gen01', 0, 6),
    config: { extra: { Xmult: 2.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 1, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['xmult', 'hands', 'destroy_card'], poke_after: 'hisuian_growlithe',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [r3(card.ability.extra.Xmult), G.GAME && G.GAME.facing_blind && !first_hand() ? 'Used this round' : 'Active!'] };
    },
    calculate(self, card, context) {
      if (context.joker_main && first_hand()) return { message: a_xmult(r3(card.ability.extra.Xmult)), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      if (context.destroy_card && context.cardarea === G.play && !context.blueprint && first_hand() && context.destroy_card === first_scored(context)) {
        return { remove: true };
      }
      return undefined;
    },
  },
  // Hisuian Voltorb (Grass; Common $5): each scored Seed card gives +6 Mult (`mult` +40%: 8.4 / 10.8 / 13.2). 4 rounds.
  hisuian_voltorb: {
    name: 'hisuian_voltorb', poke_sprite391: sprite('Gen01', 2, 6),
    config: { extra: { mult: 6, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 1, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['mult', 'enhancements', 'round_evo'], poke_after: 'electrode',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_seed); const ex = card.ability.extra; return { vars: [r3(ex.mult), ex.rounds] }; },
    calculate(self, card, context) {
      if (scored(context) && has_enhancement(context.other_card, 'm_poke_seed')) return { mult: card.ability.extra.mult, card };
      return level_evo(self, card, context, 'j_poke_hisuian_electrode');
    },
  },
  // Hisuian Electrode (Safari $8), Chloroblast: X1 + X0.15 per Seed card in your full deck (`Xmult_mod` +20%: 0.18 / 0.21 / 0.24).
  hisuian_electrode: {
    name: 'hisuian_electrode', poke_sprite391: sprite('Gen01', 4, 6),
    config: { extra: { Xmult_mod: 0.15 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 1, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['xmult', 'enhancements', 'full_deck'], poke_after: 'hisuian_voltorb',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_seed);
      return { vars: [r3(card.ability.extra.Xmult_mod), seeds_in_deck(), r3(chloro_x(card))] };
    },
    calculate(self, card, context) {
      if (context.joker_main) { const x = chloro_x(card); if (x > 1) return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Paldean Tauros (Rare $7, single stage; Combat Fighting / Blaze Fire / Aqua Water: the breed rolled when obtained): scored cards of the
  // breed's kind give X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38) — Combat face cards; Blaze Hearts and +1 discard; Aqua Clubs and +1 hand
  // (the perks fixed). Distinct from Tauros (Herd), the Kanto Tauros's shop spawn.
  paldean_tauros: {
    name: 'paldean_tauros', poke_sprite391: sprite('Gen01', 6, 6),
    config: { extra: { Xmult_multi: 1.2, d_size: 1, hands: 1 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Fighting', gen: 1, blueprint_compat: true, poke_region: 'paldean',
    attributes: ['xmult', 'face', 'suit', 'hearts', 'clubs', 'discard', 'hands'], poke_after: 'taurosh',
    poke_view_form(self, card) { return tauros_breed(card) || 'combat'; },
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const b = tauros_breed(card);
      return { vars: [r3(card.ability.extra.Xmult_multi), b ? TAUROS_BREEDS[b].name : 'rolled when obtained'] };
    },
    calculate(self, card, context) {
      if (scored(context) && breed_scores(card, context.other_card)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    add_to_deck(self, card, from_debuff) {
      breed_roll(card);
      const b = tauros_breed(card), ex = card.ability.extra;
      if (b === 'blaze') { G.GAME.round_resets.discards += ex.d_size; ease_discard(ex.d_size); }
      if (b === 'aqua') add_hands(card, ex.hands, from_debuff);
    },
    remove_from_deck(self, card) {
      const b = tauros_breed(card), ex = card.ability.extra;
      if (b === 'blaze') { G.GAME.round_resets.discards -= ex.d_size; ease_discard(-ex.d_size); }
      if (b === 'aqua') remove_hands(card, ex.hands);
    },
  },
  // Hisuian Typhlosion (Psychic; Typhlosion's slot, Safari $10; a Psychic Energy used on Quilava), Frisk: +2 Foresight; each Foreseen Heart
  // gives X1.25 (the Foreseen cards are scored like held cards: Uxie's moment; `Xmult_multi` +5%: 1.3125 / 1.375 / 1.4375). +1 discard
  // (the Cyndaquil line's, fixed).
  hisuian_typhlosion: {
    name: 'hisuian_typhlosion', poke_sprite391: sprite('Gen02', 0, 5),
    config: { extra: { d_size: 1, scry: 2, Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Psychic', gen: 2, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['starter', 'discard', 'foresight', 'xmult', 'suit', 'hearts'], poke_after: 'typhlosion',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push({ set: 'Other', key: 'scry_cards' });
      const ex = card.ability.extra; return { vars: [ex.d_size, ex.scry, r3(ex.Xmult_multi)] };
    },
    calculate(self, card, context) {
      if (foreseen(context) && context.other_card.is_suit('Hearts')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...both(discards, scry),
  },
  // Hisuian Samurott (Dark; Samurott's slot, Safari $10; a Dark Energy used on Dewott), Ceaseless Edge: the first 3 scored cards retrigger
  // (Razor Shell, fixed); each Hazard card held in hand gives X1.2 (`Xmult_multi` +5%: 1.26 / 1.32 / 1.38). +1 hand (the Oshawott line's).
  hisuian_samurott: {
    name: 'hisuian_samurott', poke_sprite391: sprite('Gen05', 8, 8),
    config: { extra: { hands: 1, strikes: 3, retriggers: 1, Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Dark', gen: 5, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['starter', 'hands', 'retrigger', 'position', 'xmult', 'enhancements'], poke_after: 'samurott',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra; return { vars: [ex.hands, ex.strikes, r3(ex.Xmult_multi)] };
    },
    calculate(self, card, context) {
      const r = razor_shell(card, context);
      if (r) return r;
      if (held(context) && has_enhancement(context.other_card, 'm_poke_hazard')) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...hands,
  },
  // Hisuian Lilligant (Fighting; Lilligant's slot, Safari $8; a Fighting Energy used on Petilil), Victory Dance: X1 + X0.1 per hand played
  // this round, this hand included (the round's first hand X1.1; resets each round; `Xmult_mod` +20%: 0.12 / 0.14 / 0.16).
  hisuian_lilligant: {
    name: 'hisuian_lilligant', poke_sprite391: sprite('Gen05', 10, 8),
    config: { extra: { Xmult_mod: 0.1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fighting', gen: 5, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['xmult', 'hands'], poke_after: 'lilligant',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, n = G.GAME && G.GAME.facing_blind ? (cr().hands_played || 0) + 1 : 1;
      return { vars: [r3(ex.Xmult_mod), r3(1 + ex.Xmult_mod * n)] };
    },
    calculate(self, card, context) {
      if (context.joker_main) { const x = dance_x(card); return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x }; }
      return undefined;
    },
  },
  // Hisuian Braviary (Psychic; Braviary's slot, Safari $8; a Psychic Energy used on Rufflet), Esper Wing: X1.5 (`Xmult` +20%: 1.8 / 2.1 /
  // 2.4), X2.5 during Boss Blinds (`Xmult2` +20%: 3 / 3.5 / 4).
  hisuian_braviary: {
    name: 'hisuian_braviary', poke_sprite391: sprite('Gen05', 4, 9),
    config: { extra: { Xmult: 1.5, Xmult2: 2.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Psychic', gen: 5, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['xmult', 'boss_blind'], poke_after: 'braviary',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [r3(ex.Xmult), r3(ex.Xmult2)] }; },
    calculate(self, card, context) {
      if (!context.joker_main) return undefined;
      const x = boss_now() ? card.ability.extra.Xmult2 : card.ability.extra.Xmult;
      return { message: a_xmult(r3(x)), colour: 'XMULT', Xmult_mod: x };
    },
  },
  // Hisuian Avalugg (Earth; Avalugg's slot, Safari $8; an Earth Energy used on Bergmite), Mountain Gale: +200 Chips (`chips` +30%: 260 / 320 /
  // 380); each Stone card held in hand gives +20 Chips (`chips2` +30%: 26 / 32 / 38; Mime / a Red Seal repeat it).
  hisuian_avalugg: {
    name: 'hisuian_avalugg', poke_sprite391: sprite('Gen06', 6, 12),
    config: { extra: { chips: 200, chips2: 20 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 6, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['chips', 'enhancements', 'stone'], poke_after: 'avalugg',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [r3(ex.chips), r3(ex.chips2)] }; },
    calculate(self, card, context) {
      if (held(context) && has_enhancement(context.other_card, 'm_stone')) return { h_chips: card.ability.extra.chips2, card };
      if (context.joker_main) return { message: a_chips(r3(card.ability.extra.chips)), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      return undefined;
    },
  },
  // Hisuian Decidueye (Fighting; Decidueye's slot, Safari $10; a Fighting Energy used on Dartrix), Triple Arrows: the first 3 scored cards
  // each give X1.2 (each time they score: a retrigger repeats it; `Xmult_multi` +5%: 1.26 / 1.32 / 1.38). +1 hand size (the Rowlet line's).
  hisuian_decidueye: {
    name: 'hisuian_decidueye', poke_sprite391: sprite('Gen07', 6, 5),
    config: { extra: { h_size: 1, arrows: 3, Xmult_multi: 1.2 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Fighting', gen: 7, blueprint_compat: true, poke_region: 'hisuian',
    attributes: ['starter', 'hand_size', 'position', 'xmult'], poke_after: 'decidueye',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ex.arrows, r3(ex.Xmult_multi)] }; },
    calculate(self, card, context) {
      if (scored(context) && among_first(context, card.ability.extra.arrows)) return { x_mult: card.ability.extra.Xmult_multi, card };
      return undefined;
    },
    ...hand_size,
  },
  // Paldean Wooper (Dark; Wooper's slot, Common $5), Poison Point: each card you discard (unenhanced only) has a 1 in 6 chance to become a
  // Hazard card (Clodsire's roll on its own seed 'paldean_wooper_poison'; Oops! raises it; odds fixed); +2 Mult per Hazard card in your
  // full deck (`mult` +40%: 2.8 / 3.6 / 4.4). Evolves into Clodsire after 5 rounds.
  paldean_wooper: {
    name: 'paldean_wooper', poke_sprite391: sprite('Gen02', 6, 5),
    config: { extra: { num: 1, dem: 6, mult: 2, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 2, blueprint_compat: true, poke_region: 'paldean',
    attributes: ['mult', 'discard', 'enhancements', 'modify_card', 'full_deck', 'chance', 'round_evo'], poke_after: 'quagsire',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_poke_hazard);
      const ex = card.ability.extra, [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'paldean_wooper_poison');
      return { vars: [num, dem, r3(ex.mult), hazards_in_deck(), wooper_mult(card), ex.rounds] };
    },
    calculate(self, card, context) {
      clodsire_poison(card, context, 'paldean_wooper_poison');
      if (context.joker_main) { const m = wooper_mult(card); if (m > 0) return { message: a_mult(m), colour: 'MULT', mult_mod: m }; }
      return level_evo(self, card, context, 'j_poke_clodsire');
    },
  },
}, FILE);

/** Their lines (systems/evolution.js set_family): the own lines are new families; the six branches join their lines (after the line's own
 *  final), seen from HISUI_REV on (HISUI_FAMILY_REV -> FAMILY_MEMBER_REV). Paldean Wooper's line is a SECOND family holding Clodsire
 *  (HISUI_EXTRA_FAMILIES, pushed as is: Clodsire's first family stays the Wooper line's, so its previous evolution is still Wooper). */
export const HISUI_FAMILIES = [
  ['hisuian_growlithe', 'hisuian_arcanine'],
  ['hisuian_voltorb', 'hisuian_electrode'],
  ['cyndaquil', 'quilava', 'typhlosion', 'hisuian_typhlosion'],
  ['oshawott', 'dewott', 'samurott', 'hisuian_samurott'],
  ['petilil', 'lilligant', 'hisuian_lilligant'],
  ['rufflet', 'braviary', 'hisuian_braviary'],
  ['bergmite', 'avalugg', 'hisuian_avalugg'],
  ['rowlet', 'dartrix', 'decidueye', 'hisuian_decidueye'],
];
export const HISUI_EXTRA_FAMILIES = [['paldean_wooper', 'clodsire']];
export function install_hisui_families(set_family) {
  for (const f of HISUI_FAMILIES) set_family(f);
  for (const f of HISUI_EXTRA_FAMILIES) family.push(f.slice());
}
export const HISUI_FAMILY_REV = {
  hisuian_typhlosion: HISUI_REV, hisuian_samurott: HISUI_REV, hisuian_lilligant: HISUI_REV, hisuian_braviary: HISUI_REV, hisuian_avalugg: HISUI_REV,
  hisuian_decidueye: HISUI_REV,
};

// ------------------------------------------------------------ text (Pokermon loc style; #n# filled by loc_vars)
const EVOLVES_ROUNDS = (n) => '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#' + n + '#{C:inactive,s:0.8} rounds)';
const BR = '{br:2}ERROR - CONTACT STEAK';
const box = (parts) => parts.flatMap((p, i) => (Array.isArray(p) ? (i ? [BR, ...p] : p) : [p]));
export const HISUI_LOC = {
  Joker: {
    j_poke_hisuian_growlithe: { name: 'Hisuian Growlithe', text: [
      '{C:chips}+#1#{} Chips', 'Doubled on the round\'s', 'first hand {C:inactive}({C:chips}+#2#{C:inactive})', EVOLVES_ROUNDS(3)] },
    j_poke_hisuian_arcanine: { name: 'Hisuian Arcanine', text: [
      '{C:attention}Head Smash:{} {X:mult,C:white} X#1# {} Mult', 'on the round\'s first hand;', 'the first scored card of', 'that hand is {C:red}destroyed{}', '{C:inactive}(#2#)'] },
    j_poke_hisuian_voltorb: { name: 'Hisuian Voltorb', text: ['Each scored {C:attention}Seed{} card', 'gives {C:mult}+#1#{} Mult', EVOLVES_ROUNDS(2)] },
    j_poke_hisuian_electrode: { name: 'Hisuian Electrode', text: [
      '{C:attention}Chloroblast:{} {X:mult,C:white} X1 {} Mult, plus', '{X:mult,C:white} X#1# {} for each {C:attention}Seed{}', 'card in your full deck', '{C:inactive}(Currently #2#: {X:mult,C:white} X#3# {C:inactive} Mult)'] },
    j_poke_paldean_tauros: { name: 'Paldean Tauros', text: box([
      ['{C:inactive}(Breed: #2#)'],
      ['{C:attention}Combat:{} scored face', 'cards give {X:mult,C:white} X#1# {} Mult'],
      ['{C:attention}Blaze:{} {C:red}+1{} discard; scored', '{C:hearts}Hearts{} give {X:mult,C:white} X#1# {} Mult'],
      ['{C:attention}Aqua:{} {C:blue}+1{} hand; scored', '{C:clubs}Clubs{} give {X:mult,C:white} X#1# {} Mult']]) },
    j_poke_hisuian_typhlosion: { name: 'Hisuian Typhlosion', text: box([
      ['{C:red}+#1#{} discard', '{C:attention}+#2#{} Foresight'],
      ['{C:attention}Frisk:{} each {C:attention}Foreseen{}', '{C:hearts}Heart{} gives {X:mult,C:white} X#3# {} Mult']]) },
    j_poke_hisuian_samurott: { name: 'Hisuian Samurott', text: box([
      ['{C:blue}+#1#{} hand'],
      ['{C:attention}Ceaseless Edge:{} the first', '{C:attention}#2#{} scored cards retrigger;', 'each {C:attention}Hazard{} card held in', 'hand gives {X:mult,C:white} X#3# {} Mult']]) },
    j_poke_hisuian_lilligant: { name: 'Hisuian Lilligant', text: [
      '{C:attention}Victory Dance:{} gains', '{X:mult,C:white} X#1# {} Mult for each hand', 'played this round,', 'this hand included', '{C:inactive}(This hand: {X:mult,C:white} X#2# {C:inactive} Mult)'] },
    j_poke_hisuian_braviary: { name: 'Hisuian Braviary', text: [
      '{C:attention}Esper Wing:{} {X:mult,C:white} X#1# {} Mult,', '{X:mult,C:white} X#2# {} Mult during', '{C:attention}Boss Blinds{}'] },
    j_poke_hisuian_avalugg: { name: 'Hisuian Avalugg', text: [
      '{C:attention}Mountain Gale:{} {C:chips}+#1#{} Chips', 'Each {C:attention}Stone{} card held', 'in hand gives {C:chips}+#2#{} Chips'] },
    j_poke_hisuian_decidueye: { name: 'Hisuian Decidueye', text: box([
      ['{C:attention}+#1#{} hand size'],
      ['{C:attention}Triple Arrows:{} the first', '{C:attention}#2#{} scored cards each', 'give {X:mult,C:white} X#3# {} Mult']]) },
    j_poke_paldean_wooper: { name: 'Paldean Wooper', text: [
      '{C:attention}Poison Point:{} each card', 'you discard has a {C:green}#1# in #2#{}', 'chance to become a {C:attention}Hazard{}', '{C:inactive}(unenhanced cards only)',
      '{C:mult}+#3#{} Mult for each {C:attention}Hazard{}', 'card in your full deck', '{C:inactive}(Currently {C:mult}+#5#{C:inactive} Mult)', EVOLVES_ROUNDS(6)] },
  },
};
/** The branch forms' box, APPENDED to the earlier stage's own text (index.js, as GALAR_UPSTREAM_TEXT). */
const FORM_TO = (t, into) => [BR, '{C:attention}Hisuian form:{} a', '{X:poke_' + t.toLowerCase() + ',C:white}' + t + '{} Energy used on it', 'evolves it into {C:attention}' + into + '{}'];
export const HISUI_UPSTREAM_TEXT = {
  j_poke_quilava: FORM_TO('Psychic', 'Hisuian Typhlosion'),
  j_poke_dewott: FORM_TO('Dark', 'Hisuian Samurott'),
  j_poke_petilil: FORM_TO('Fighting', 'Hisuian Lilligant'),
  j_poke_rufflet: FORM_TO('Psychic', 'Hisuian Braviary'),
  j_poke_bergmite: FORM_TO('Earth', 'Hisuian Avalugg'),
  j_poke_dartrix: FORM_TO('Fighting', 'Hisuian Decidueye'),
};
