// The owner's new Pokermon jokers (2026-10-27): the 25 species of Desktop/Pokermon_Joker_Design_Guide.txt section 5, "25 DESIGN
// RECOMMENDATIONS" — species no mod (Pokermon / Nacho / Pokermon+) had a joker for (the design wiki's "not in the game yet" list).
// They are Micatro's own designs, not upstream Pokermon code: there is no Lua file behind this one, so every joker is defined in
// FULL here (static data + behaviour, like Repel / Jirachi's forms) and index.js registers it after the joker named by `poke_after`
// (Pokédex order). Text: DESIGN_LOC (merged into Pokermon's Joker descriptions); families: DESIGN_FAMILIES.
// Art: upstream's own. Pokermon 3.9.1's pokespriteload.lua already has a finished card for all 25 species (no joker uses them
// upstream) on the vendored 3.9.1 sheets, with Shiny twins and the Legendaries' floating souls — so, by the owner's art rule
// (a composed card only where upstream has none), each joker takes its 3.9.1 cell (`poke_sprite391`, read like data391.js
// sprites). PORTING.md "The owner's 25 new jokers".
//
// Lines: Shinx -> Luxio -> Luxray (Foresight money), Honedge -> Doublade -> Aegislash (held Steel; Stance Change), Spheal ->
// Sealeo -> Walrein (Rollout), Grookey -> Thwackey -> Rillaboom (the beat; Grass starter), Kubfu -> Urshifu (Single / Rapid Strike,
// chosen by its training), Tandemaus -> Maushold (Population Bomb), Darumaka -> Darmanitan (Hustle / Zen Mode), Scraggy -> Scrafty
// (Moxie), Mudbray -> Mudsdale (Stamina / Mud Spit); and Xerneas, Spiritomb, Tatsugiri on their own.
// Then the owner's wiki designs (CLAUDE.md "do the joker design list"): Sprigatito -> Floragato -> Meowscarada (Lucky cards grow like
// Hiker's; then held Lucky cards act as Steel; Grass starter; contentRev 20) — upstream 3.9.1 draws them too (Natdex 10 / 12 / 14, 60).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, ease_hands_played,
  create_card, copy_card, playing_card_joker_effects, defineJokers, type_tooltip, level_evo, scaling_evo, item_evo,
  ease_poke_dollars, has_enhancement, has_no_rank, get_probability_vars, pseudorandom_probability, scale_card,
  find_pokemon_type, is_type, apply_type_sticker, remove_type_stickers, type_sticker_applied,
} from '../api.js';

const FILE = 'micatro/pokejokers_designs';
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });
/** The main end_of_round pass (not a held card's, not a repetition), as can_evolve reads it. */
const round_end = (context) => !!(context.end_of_round && !context.individual && !context.repetition);
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
/** A card on Pokermon 3.9.1's sheets (pokespriteload.lua PokemonSprites: the Natdex sheet, or a Gen sheet for `gen_atlas`). */
const sprite = (sheet, x, y, soul) => ({ atlas: 'AtlasJokersBasic' + sheet, pos: { x, y }, ...(soul ? { soul_pos: { x: soul[0], y: soul[1] } } : {}) });

// ------------------------------------------------------------ shared bodies
const scry = {
  add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
  remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
};
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
/** The Squirtle line's +hands pair (pokejokers_01). */
const hands = {
  add_to_deck(self, card, from_debuff) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + card.ability.extra.hands;
    if (!from_debuff) ease_hands_played(card.ability.extra.hands);
  },
  remove_from_deck(self, card) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands - card.ability.extra.hands;
    const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (to_decrease > 0) ease_hands_played(-to_decrease);
  },
};
const scry_tip = (info_queue) => info_queue.push({ set: 'Other', key: 'scry_cards' });

/** Shinx line: a played card that shares a rank with a Foreseen card (G.scry_view, the top of the deck) pays and scores. */
const foreseen = (c) => !has_no_rank(c) && !!(G.scry_view && G.scry_view.cards && G.scry_view.cards.some((s) => !has_no_rank(s) && s.get_id() === c.get_id()));
function lux_calc(card, context, seed) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && foreseen(context.other_card)) {
    const ex = card.ability.extra;
    const dollars = ease_poke_dollars(card, seed, ex.money, true);
    // (Electrike: dollar_buffer holds money still being paid out, for jokers that read the total)
    G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + dollars;
    const r = { dollars, card, func() { G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); } };
    if (ex.mult) r.mult = ex.mult;
    if (ex.Xmult_multi) r.x_mult = ex.Xmult_multi;
    return r;
  }
  return undefined;
}

/** Honedge / Doublade: +mult_mod Mult per Steel card held when a hand is played. */
const held_steel = () => G.hand.cards.filter((c) => has_enhancement(c, 'm_steel'));
function blade_scale(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    const n = held_steel().length;
    if (n > 0) scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', scalar_factor: n, message_colour: 'MULT' });
  }
  if (context.joker_main && card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
  return undefined;
}
/** A held card's repetition only counts when it did something (Ferrothorn's card_effects guard). */
const held_effective = (context) => !!(context.card_effects && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length) || context.card_effects.length > 1));

/** Spheal line, Rollout: a streak (0..max) of the same poker hand in a row this round; Chips = chips x 2^streak. */
function rollout(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    ex.streak = ex.last_hand === context.scoring_name ? Math.min(ex.max_streak, ex.streak + 1) : 0;
    ex.last_hand = context.scoring_name;
  }
  if (round_end(context) && !context.blueprint) { ex.streak = 0; ex.last_hand = undefined; }
  return undefined;
}
const rollout_chips = (ex) => ex.chips * Math.pow(2, ex.streak || 0);
function rollout_main(card, context) {
  if (!context.joker_main) return undefined;
  const ex = card.ability.extra, chips = rollout_chips(ex);
  if (ex.Xmult && ex.streak >= ex.max_streak) return { message: 'Sheer Cold!', colour: 'XMULT', chip_mod: chips, Xmult_mod: ex.Xmult };
  return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
}

/** Grookey line, the beat: every `every`-th card scored this round is retriggered (the round's count; the hand's beats in beat_idx). */
function beat_calc(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint) {
    ex.beat_idx = [];
    for (let i = 0; i < context.scoring_hand.length; i++) {
      ex.beat = ex.beat + 1;
      if (ex.beat % ex.every === 0) { ex.beat_idx.push(i); ex.beats = ex.beats + 1; }
    }
  }
  const on_beat = (c) => !!(context.scoring_hand && ex.beat_idx && ex.beat_idx.includes(context.scoring_hand.indexOf(c)));
  if (context.repetition && context.cardarea === G.play && !context.other_card.debuff && on_beat(context.other_card)) {
    return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
  }
  // Rillaboom's Drum Beating: a card on the beat gives +mult each time it scores
  if (ex.mult && context.individual && context.cardarea === G.play && !context.end_of_round && on_beat(context.other_card)) return { mult: ex.mult, card };
  if (context.after && context.cardarea === G.jokers && !context.blueprint) ex.beat_idx = [];
  if (round_end(context) && !context.blueprint) ex.beat = 0;
  return undefined;
}

/** Sprigatito / Floragato (Hiker for Lucky cards): a scored card whose Lucky effect triggered permanently gains +mult_mod Mult and
 *  +$dollars when scored (Steamodded's perma_mult / perma_p_dollars; the value at the time, kept by the card). Blueprint copies it, as Hiker. */
function lucky_grow(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && context.other_card.lucky_trigger) {
    const a = context.other_card.ability, ex = card.ability.extra;
    a.perma_mult = (a.perma_mult || 0) + ex.mult_mod;
    a.perma_p_dollars = (a.perma_p_dollars || 0) + ex.dollars;
    return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card };
  }
  return undefined;
}

/** Kubfu / Urshifu, training: X Mult grows on a hand of exactly 1 or exactly 5 scoring cards (Kubfu counts each school). */
function training(card, context) {
  const ex = card.ability.extra;
  if (context.before && context.cardarea === G.jokers && !context.blueprint && context.scoring_hand) {
    const n = context.scoring_hand.length;
    if (n === 1 || n === 5) {
      if (ex.single !== undefined) { if (n === 1) ex.single = ex.single + 1; else ex.rapid = ex.rapid + 1; ex.last = n === 1 ? 'single' : 'rapid'; }
      scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_key: 'a_xmult', message_colour: 'XMULT' });
    }
  }
  if (context.joker_main && ex.Xmult > 1) return { message: a_xmult(ex.Xmult), colour: 'XMULT', Xmult_mod: ex.Xmult };
  return undefined;
}
const urshifu_tips = (info_queue) => info_queue.push({ set: 'Other', key: 'poke_design_unseen_fist' });

/** Tandemaus / Maushold: a scored card sharing its rank with another scored card gives +mult. */
function pair_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.end_of_round && !has_no_rank(context.other_card)) {
    const id = context.other_card.get_id();
    if (context.scoring_hand.some((c) => c !== context.other_card && !has_no_rank(c) && c.get_id() === id)) return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}

/** Scraggy / Scrafty, Moxie: grows at end of round when the Blind fell to the round's first hand. */
function moxie(card, context, step) {
  if (round_end(context) && !context.blueprint && !context.game_over && G.GAME.current_round.hands_played === 1) {
    scale_card(card, { ref_value: 'mult', scalar_table: { moxie: step() }, scalar_value: 'moxie', message_colour: 'MULT' });
  }
  return undefined;
}

/** Mudbray / Mudsdale, Stamina: +chip_mod Chips for each hand that isn't the round's first. */
function stamina(card, context) {
  if (context.before && context.cardarea === G.jokers && !context.blueprint && G.GAME.current_round.hands_played > 0) {
    scale_card(card, { ref_value: 'chips', scalar_value: 'chip_mod', message_colour: 'CHIPS' });
  }
  if (context.joker_main && card.ability.extra.chips > 0) return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
  return undefined;
}

/** Darmanitan's Zen Mode type: a Psychic Tera sticker until end of round, then the type it had (its own, or a Tera it wore). */
function zen_on(self, card) {
  const ex = card.ability.extra;
  ex.zen_prev = type_sticker_applied(card) || false;
  apply_type_sticker(card, 'Psychic');
  ex.zen = true;
  ex.form = 'zen';
}
function zen_off(self, card) {
  const ex = card.ability.extra;
  if (ex.zen_prev) apply_type_sticker(card, ex.zen_prev);
  else { remove_type_stickers(card); ex.ptype = self.config.extra.ptype; }
  ex.zen = false;
  ex.zen_prev = undefined;
  ex.form = undefined;
}

/** Spiritomb: create The Soul once, at the goal, when a consumable slot is free. */
function spirit_soul(card) {
  const ex = card.ability.extra;
  if (ex.created || ex.spirits < ex.goal) return;
  if (G.consumeables.cards.length + (G.GAME.consumeable_buffer || 0) >= G.consumeables.config.card_limit) return;
  ex.created = true;
  G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const soul = create_card('Spectral', G.consumeables, null, null, null, null, 'c_soul');
    soul.add_to_deck();
    G.consumeables.emplace(soul);
    G.GAME.consumeable_buffer = 0;
  });
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
}
const spirit_x = (ex) => 1 + ex.spirits * ex.Xmult_mod;

/** Tatsugiri: the leftmost Water Joker (never Tatsugiri itself) in the joker row. */
const commanded = (card) => G.jokers.cards.find((c) => c !== card && is_type(c, 'Water'));
const TATSU_FORMS = ['curly', 'droopy', 'stretchy'];

defineJokers({
  // ---------------------------------------------------------------- LINE A: Shinx -> Luxio -> Luxray (Lightning, Gen 4)
  // Shinx 403: +1 Foresight; a played card sharing a rank with a Foreseen card earns $1 when scored. Evolves in 4 rounds.
  shinx: {
    name: 'shinx', poke_sprite391: sprite('Natdex', 24, 26),
    config: { extra: { scry: 1, money: 1, rounds: 4 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'economy', 'round_evo'], poke_after: 'kricketune',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.money, ex.rounds] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'shinx') || level_evo(self, card, context, 'j_poke_luxio'); },
    ...scry,
  },
  // Luxio 404: +2 Foresight; matching cards give +6 Mult and earn $1. Evolves in 5 rounds.
  luxio: {
    name: 'luxio', poke_sprite391: sprite('Natdex', 26, 26),
    config: { extra: { scry: 2, mult: 6, money: 1, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'mult', 'economy', 'round_evo'], poke_after: 'shinx',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.mult, ex.money, ex.rounds] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'luxio') || level_evo(self, card, context, 'j_poke_luxray'); },
    ...scry,
  },
  // Luxray 405: +3 Foresight; matching cards give X1.4 Mult and earn $1.
  luxray: {
    name: 'luxray', poke_sprite391: sprite('Natdex', 28, 26),
    config: { extra: { scry: 3, Xmult_multi: 1.4, money: 1 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Lightning', gen: 4, blueprint_compat: true,
    attributes: ['foresight', 'xmult', 'economy'], poke_after: 'luxio',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); scry_tip(info_queue); const ex = card.ability.extra; return { vars: [ex.scry, ex.Xmult_multi, ex.money] }; },
    calculate(self, card, context) { return lux_calc(card, context, 'luxray'); },
    ...scry,
  },

  // ---------------------------------------------------------------- LINE B: Honedge -> Doublade -> Aegislash (Metal, Gen 6)
  // Honedge 679: gains +1 Mult per Steel card held when a hand is played; evolves at +20 Mult.
  honedge: {
    name: 'honedge', poke_sprite391: sprite('Natdex', 6, 45),
    config: { evo_rqmt: 20, extra: { mult: 0, mult_mod: 1 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'enhancements', 'scaling_evo'], poke_after: 'pyroar',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_steel); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.mult, self.config.evo_rqmt] }; },
    calculate(self, card, context) { return blade_scale(card, context) || scaling_evo(self, card, context, 'j_poke_doublade', card.ability.extra.mult, self.config.evo_rqmt); },
  },
  // Doublade 680: +2 Mult per held Steel card; the first 2 Steel cards held are retriggered. Evolves with a Dusk Stone.
  doublade: {
    name: 'doublade', poke_sprite391: sprite('Natdex', 8, 45),
    config: { extra: { mult: 0, mult_mod: 2, steel_retriggers: 2, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Metal', gen: 6, blueprint_compat: true, item_req: 'duskstone',
    attributes: ['mult', 'scaling', 'enhancements', 'retrigger', 'item_evo'], poke_after: 'honedge',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult_mod, ex.steel_retriggers, ex.mult] };
    },
    calculate(self, card, context) {
      const r = blade_scale(card, context);
      if (r) return r;
      // the first `steel_retriggers` Steel cards held (that score: not debuffed), left to right
      if (context.repetition && context.cardarea === G.hand && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        const first = held_steel().filter((c) => !c.debuff).slice(0, card.ability.extra.steel_retriggers);
        if (first.includes(context.other_card)) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return item_evo(self, card, context, 'j_poke_aegislash');
    },
  },
  // Aegislash 681: +20 Mult (kept from Doublade); Stance Change — Blade Forme X2.5 Mult, Shield Forme retriggers every held Steel
  // card. A played hand switches to Blade, a discard to Shield; each round starts in Shield.
  aegislash: {
    name: 'aegislash', poke_sprite391: sprite('Gen06', 6, 8),
    config: { extra: { mult: 20, Xmult: 2.5, retriggers: 1, form: 'shield' } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Metal', gen: 6, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'enhancements', 'retrigger', 'discard'], poke_after: 'doublade',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      const ex = card.ability.extra;
      return { vars: [ex.mult, ex.Xmult, ex.form === 'blade' ? 'Blade' : 'Shield'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) {
        if (ex.form === 'blade') return { message: a_xmult(ex.Xmult), colour: 'XMULT', mult_mod: ex.mult, Xmult_mod: ex.Xmult };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      if (context.repetition && context.cardarea === G.hand && ex.form !== 'blade' && held_effective(context) && has_enhancement(context.other_card, 'm_steel')) {
        return { message: localize('k_again_ex'), repetitions: ex.retriggers, card };
      }
      if (context.after && context.cardarea === G.jokers && !context.blueprint && ex.form !== 'blade') {
        ex.form = 'blade';
        return { message: 'Blade Forme', colour: 'XMULT' };
      }
      if (context.pre_discard && !context.blueprint && ex.form !== 'shield') {
        ex.form = 'shield';
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Shield Forme', colour: 'FILTER' });
      }
      if (round_end(context) && !context.blueprint) ex.form = 'shield';
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE C: Spheal -> Sealeo -> Walrein (Water, Gen 3)
  // Spheal 363: Rollout +10 Chips, doubled for each consecutive hand of the same poker hand (max 4 doublings). Evolves in 5 rounds.
  spheal: {
    name: 'spheal', poke_sprite391: sprite('Natdex', 4, 24),
    config: { extra: { chips: 10, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 2, cost: 6, stage: 'Basic', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hand_type', 'reset', 'round_evo'], poke_after: 'glalie',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chips, ex.max_streak, rollout_chips(ex), ex.rounds] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_sealeo'); },
  },
  // Sealeo 364: +1 hand; Rollout +20 Chips. Evolves in 5 rounds.
  sealeo: {
    name: 'sealeo', poke_sprite391: sprite('Natdex', 6, 24),
    config: { extra: { hands: 1, chips: 20, streak: 0, max_streak: 4, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'hands', 'hand_type', 'reset', 'round_evo'], poke_after: 'spheal',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.rounds, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context) || level_evo(self, card, context, 'j_poke_walrein'); },
    ...hands,
  },
  // Walrein 365: +1 hand; Rollout +40 Chips; Sheer Cold X3 Mult while Rollout is at full power.
  walrein: {
    name: 'walrein', poke_sprite391: sprite('Natdex', 8, 24),
    config: { extra: { hands: 1, chips: 40, streak: 0, max_streak: 4, Xmult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Water', gen: 3, blueprint_compat: true,
    attributes: ['chips', 'xmult', 'hands', 'hand_type', 'reset'], poke_after: 'sealeo',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.hands, ex.chips, ex.max_streak, ex.Xmult, rollout_chips(ex)] }; },
    calculate(self, card, context) { rollout(card, context); return rollout_main(card, context); },
    ...hands,
  },

  // ---------------------------------------------------------------- LINE D: Grookey -> Thwackey -> Rillaboom (Grass starter, Gen 8)
  // Grookey 810: +1 hand size; every 4th card scored this round is retriggered. Evolves after 12 beats.
  grookey: {
    name: 'grookey', poke_sprite391: sprite('Natdex', 28, 53),
    config: { evo_rqmt: 12, extra: { h_size: 1, every: 4, beat: 0, beats: 0, retriggers: 1 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 8, blueprint_compat: true, starter: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'trigger_evo'], poke_after: 'mega_drampa',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), ex.beat % ex.every, Math.max(0, self.config.evo_rqmt - ex.beats), ex.every] }; },
    calculate(self, card, context) { return beat_calc(card, context) || scaling_evo(self, card, context, 'j_poke_thwackey', card.ability.extra.beats, self.config.evo_rqmt); },
    ...hand_size,
  },
  // Thwackey 811: +1 hand size; every 3rd card scored this round is retriggered. Evolves after 16 beats.
  thwackey: {
    name: 'thwackey', poke_sprite391: sprite('Natdex', 0, 54),
    config: { evo_rqmt: 16, extra: { h_size: 1, every: 3, beat: 0, beats: 0, retriggers: 1 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'trigger_evo'], poke_after: 'grookey',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), Math.max(0, self.config.evo_rqmt - ex.beats)] }; },
    calculate(self, card, context) { return beat_calc(card, context) || scaling_evo(self, card, context, 'j_poke_rillaboom', card.ability.extra.beats, self.config.evo_rqmt); },
    ...hand_size,
  },
  // Rillaboom 812: +1 hand size; every 2nd card scored this round is retriggered; Drum Beating: those cards give +3 Mult.
  rillaboom: {
    name: 'rillaboom', poke_sprite391: sprite('Natdex', 2, 54),
    config: { extra: { h_size: 1, every: 2, beat: 0, beats: 0, retriggers: 1, mult: 3 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 8, blueprint_compat: true,
    attributes: ['starter', 'hand_size', 'retrigger', 'mult'], poke_after: 'thwackey',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.h_size, ordinal(ex.every), ex.mult] }; },
    calculate(self, card, context) { return beat_calc(card, context); },
    ...hand_size,
  },

  // ---------------------------------------------------------------- LINE E: Kubfu -> Urshifu (Fighting Legendary, Gen 8)
  // Kubfu 891: can't be debuffed (systems/rules.js set_debuff); gains X0.1 Mult on a hand of exactly 1 or 5 scoring cards. After 10
  // trainings it evolves into the school it trained more: 1-card hands Single Strike, 5-card hands Rapid Strike (a tie: the school
  // of its last training).
  kubfu: {
    name: 'kubfu', poke_sprite391: sprite('Natdex', 10, 59, [11, 59]),
    config: { evo_rqmt: 10, extra: { Xmult: 1, Xmult_mod: 0.1, single: 0, rapid: 0 } },
    rarity: 4, cost: 10, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'debuff', 'scaling_evo'], poke_after: 'dreepy_dart',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_mod, ex.Xmult, self.config.evo_rqmt, ex.single, ex.rapid] };
    },
    calculate(self, card, context) {
      const r = training(card, context);
      if (r) return r;
      const ex = card.ability.extra;
      const school = ex.single > ex.rapid ? 'single' : ex.rapid > ex.single ? 'rapid' : (ex.last || 'single');
      return scaling_evo(self, card, context, 'j_poke_urshifu_' + school, ex.single + ex.rapid, self.config.evo_rqmt);
    },
  },
  // Urshifu (Single Strike Style) 892: X Mult (kept from Kubfu; keeps training); Unseen Fist: playing cards can't be debuffed
  // (rules.js); Wicked Blow: a 1-card hand's card also gives this Joker's X Mult when scored. Only through Kubfu (never in a pool).
  urshifu_single: {
    name: 'urshifu_single', poke_sprite391: sprite('Gen08', 2, 10, [3, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'scaling', 'debuff'], poke_after: 'kubfu',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); urshifu_tips(info_queue); const ex = card.ability.extra; return { vars: [ex.Xmult, ex.Xmult_mod] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.end_of_round && context.full_hand && context.full_hand.length === 1 && card.ability.extra.Xmult > 1) {
        return { x_mult: card.ability.extra.Xmult, card };
      }
      return training(card, context);
    },
    in_pool() { return false; },
  },
  // Urshifu (Rapid Strike Style) 892: X Mult (kept from Kubfu; keeps training); Surging Strikes: the first 3 scored cards are
  // retriggered. Only through Kubfu.
  urshifu_rapid: {
    name: 'urshifu_rapid', poke_sprite391: sprite('Gen08', 4, 10, [5, 10]),
    config: { extra: { Xmult: 2, Xmult_mod: 0.1, retriggers: 1, strikes: 3 } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fighting', gen: 8, blueprint_compat: true, custom_pool_func: true,
    attributes: ['xmult', 'scaling', 'retrigger', 'debuff'], poke_after: 'urshifu_single',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.Xmult, ex.Xmult_mod, ex.strikes] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.scoring_hand.indexOf(context.other_card) >= 0
        && context.scoring_hand.indexOf(context.other_card) < card.ability.extra.strikes) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return training(card, context);
    },
    in_pool() { return false; },
  },

  // ---------------------------------------------------------------- Xerneas 716 (Fairy Legendary, Gen 6)
  // Geomancy: after the round's first hand, played cards give X1.25 Mult when scored. The first playing card destroyed each round
  // comes back as a copy: to the hand during a Blind (outside one — the shop — into the deck).
  xerneas: {
    name: 'xerneas', poke_sprite391: sprite('Gen06', 8, 10, [9, 10]),
    config: { extra: { Xmult_multi: 1.25, revived: false } },
    rarity: 4, cost: 20, stage: 'Legendary', ptype: 'Fairy', gen: 6, blueprint_compat: true,
    attributes: ['xmult', 'destroy_card', 'playing_card'], poke_after: 'gourgeist',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const charged = !!(G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played > 0);
      return { vars: [card.ability.extra.Xmult_multi, charged ? 'Active!' : 'Charging...'] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.individual && context.cardarea === G.play && !context.end_of_round && G.GAME.current_round.hands_played > 0) {
        return { x_mult: ex.Xmult_multi, card };
      }
      if (context.remove_playing_cards && !context.blueprint && !ex.revived && context.removed && context.removed.length) {
        ex.revived = true;
        const src = context.removed[0];
        const to_hand = !!G.GAME.facing_blind;
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const id = G.playing_card;
        G.E_MANAGER.add_event(() => {
          const copy = copy_card(src, null, null, id);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          (to_hand ? G.hand : G.deck).emplace(copy);
          copy.start_materialize();
          playing_card_joker_effects([copy]);
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_copied_ex'), colour: 'pink' });
      }
      if (round_end(context) && !context.blueprint) ex.revived = false;
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F: Tandemaus -> Maushold (Colorless, Gen 9)
  // Tandemaus 924: scored cards that share a rank with another scored card give +3 Mult. Evolves in 5 rounds.
  tandemaus: {
    name: 'tandemaus', poke_sprite391: sprite('Natdex', 16, 61),
    config: { extra: { mult: 3, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Colorless', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'rank', 'round_evo'], poke_after: 'spidops',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.rounds] }; },
    calculate(self, card, context) { return pair_mult(card, context) || level_evo(self, card, context, 'j_poke_maushold'); },
  },
  // Maushold 925: as Tandemaus; Population Bomb: the first scored card is retriggered, then 1 in 2 for each more retrigger, up to 4
  // (Family of Four). 1 in 100 is the Family of Three (rolled on creation): up to 3, and each retrigger earns $1.
  maushold: {
    name: 'maushold', poke_sprite391: sprite('Gen09', 6, 0),
    config: { extra: { mult: 3, num: 1, dem: 2, max: 4, max_three: 3, money: 1, form: 'four' } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Colorless', gen: 9, blueprint_compat: true,
    attributes: ['mult', 'rank', 'retrigger', 'chance', 'economy'], poke_after: 'tandemaus',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'maushold');
      const three = ex.form === 'three';
      return { vars: [ex.mult, num, dem, three ? ex.max_three : ex.max, ex.money], key: three ? 'j_poke_maushold_three' : undefined };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom('maushold_family') < 0.01 ? 'three' : 'four';
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.repetition && context.cardarea === G.play && context.scoring_hand && context.other_card === context.scoring_hand[0] && !context.other_card.debuff) {
        const max = ex.form === 'three' ? ex.max_three : ex.max;
        let reps = 1;
        while (reps < max && pseudorandom_probability(card, 'maushold', ex.num, ex.dem, 'maushold')) reps++;
        if (ex.form === 'three') {
          const earned = ease_poke_dollars(card, 'maushold', ex.money * reps);
          card_eval_status_text(card, 'dollars', earned);
        }
        return { message: localize('k_again_ex'), repetitions: reps, card };
      }
      return pair_mult(card, context);
    },
  },

  // ---------------------------------------------------------------- LINE G: Darumaka -> Darmanitan (Fire, Gen 5)
  // Darumaka 554: +15 Mult; Hustle: 1 in 4 to give nothing (probability jokers make it miss MORE). Evolves in 4 rounds.
  darumaka: {
    name: 'darumaka', poke_sprite391: sprite('Natdex', 26, 36),
    config: { extra: { mult: 15, num: 1, dem: 4, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'chance', 'round_evo'], poke_after: 'excadrill',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      const [num, dem] = get_probability_vars(card, ex.num, ex.dem, 'darumaka');
      return { vars: [ex.mult, num, dem, ex.rounds] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        const ex = card.ability.extra;
        if (pseudorandom_probability(card, 'darumaka', ex.num, ex.dem, 'darumaka')) return { message: localize('k_nope_ex'), colour: 'GREEN' };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      return level_evo(self, card, context, 'j_poke_darmanitan');
    },
  },
  // Darmanitan 555: +30 Mult; Zen Mode: on the round's final hand, X3 Mult instead, and Psychic (a Tera sticker) until end of round.
  darmanitan: {
    name: 'darmanitan', poke_sprite391: sprite('Gen05', 10, 0),
    config: { extra: { mult: 30, Xmult: 3 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Fire', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'types', 'hands'], poke_after: 'darumaka',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.Xmult] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.before && context.cardarea === G.jokers && !context.blueprint && G.GAME.current_round.hands_left === 0 && !ex.zen) {
        zen_on(self, card);
        card_eval_status_text(card, 'extra', null, null, null, { message: 'Zen Mode!', colour: 'Planet' });
      }
      if (context.joker_main) {
        if (G.GAME.current_round.hands_left === 0) return { message: a_xmult(ex.Xmult), colour: 'XMULT', Xmult_mod: ex.Xmult };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      if (round_end(context) && !context.blueprint && ex.zen) zen_off(self, card);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE H: Scraggy -> Scrafty (Dark, Gen 5)
  // Scraggy 559: +4 Mult; Moxie: +3 Mult when a Blind is defeated with the round's first hand. Evolves in 4 rounds.
  scraggy: {
    name: 'scraggy', poke_sprite391: sprite('Natdex', 6, 37),
    config: { extra: { mult: 4, mult_mod: 3, rounds: 4 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'scaling', 'round_evo'], poke_after: 'darmanitan',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult, ex.mult_mod, ex.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
      moxie(card, context, () => card.ability.extra.mult_mod);
      return level_evo(self, card, context, 'j_poke_scrafty');
    },
  },
  // Scrafty 560: Moxie +3 Mult, +1 more per other Dark Joker; X1.5 Mult on the round's first hand.
  scrafty: {
    name: 'scrafty', poke_sprite391: sprite('Natdex', 8, 37),
    config: { extra: { mult: 4, mult_mod: 3, mult_scaling_mod: 1, Xmult: 1.5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Dark', gen: 5, blueprint_compat: true,
    attributes: ['mult', 'xmult', 'scaling'], poke_after: 'scraggy',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.mult_scaling_mod, ex.Xmult, ex.mult] }; },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main) {
        if (G.GAME.current_round.hands_played === 0) return { message: a_xmult(ex.Xmult), colour: 'XMULT', mult_mod: ex.mult, Xmult_mod: ex.Xmult };
        if (ex.mult > 0) return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      moxie(card, context, () => ex.mult_mod + ex.mult_scaling_mod * find_pokemon_type('Dark', card).length);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Spiritomb 442 (Psychic: Ghost/Dark, Gen 4)
  // A spirit per playing card destroyed and per Joker sold; X0.02 Mult per spirit; at 108 spirits, The Soul (once; must have room).
  spiritomb: {
    name: 'spiritomb', poke_sprite391: sprite('Natdex', 12, 29),
    config: { extra: { spirits: 0, goal: 108, Xmult_mod: 0.02, created: false } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Psychic', gen: 4, blueprint_compat: true,
    attributes: ['xmult', 'scaling', 'destroy_card', 'on_sell', 'spectral'], poke_after: 'happiny',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Spectral', key: 'c_soul' });
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_mod, ex.spirits, ex.goal, spirit_x(ex)] };
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.joker_main && spirit_x(ex) > 1) return { message: a_xmult(spirit_x(ex)), colour: 'XMULT', Xmult_mod: spirit_x(ex) };
      let gained = 0;
      if (context.remove_playing_cards && !context.blueprint && context.removed) gained = context.removed.length;
      if (context.selling_card && !context.blueprint && context.card !== card && context.card.ability.set === 'Joker') gained = 1;
      if (gained > 0) {
        ex.spirits = ex.spirits + gained;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
      }
      if ((gained > 0 || round_end(context)) && !context.blueprint) spirit_soul(card);
      return undefined;
    },
  },

  // ---------------------------------------------------------------- Tatsugiri 978 (Dragon, Gen 9)
  // Nature (rolled on creation): Curly, Droopy or Stretchy. Commander: the leftmost Water Joker gives X1.75 Mult / +100 Chips /
  // +20 Mult. Tatsugiri itself gives nothing.
  tatsugiri: {
    name: 'tatsugiri', poke_sprite391: sprite('Gen09', 0, 3),
    config: { extra: { Xmult_multi: 1.75, chips: 100, mult: 20 } },
    rarity: 3, cost: 7, stage: 'Basic', ptype: 'Dragon', gen: 9, blueprint_compat: true,
    attributes: ['xmult', 'chips', 'mult', 'joker', 'types', 'nature', 'position'], poke_after: 'houndstone',
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.Xmult_multi, ex.chips, ex.mult], key: TATSU_FORMS.includes(ex.form) ? 'j_poke_tatsugiri_' + ex.form : undefined };
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.form = pseudorandom_element(TATSU_FORMS, pseudoseed('tatsugiri'))[0];
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      if (context.other_joker && TATSU_FORMS.includes(ex.form) && context.other_joker === commanded(card)) {
        const target = context.other_joker;
        G.E_MANAGER.add_event(() => { target.juice_up(0.5, 0.5); });
        if (ex.form === 'curly') return { message: a_xmult(ex.Xmult_multi), colour: 'XMULT', Xmult_mod: ex.Xmult_multi };
        if (ex.form === 'droopy') return { message: a_chips(ex.chips), colour: 'CHIPS', chip_mod: ex.chips };
        return { message: a_mult(ex.mult), colour: 'MULT', mult_mod: ex.mult };
      }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE F2: Sprigatito -> Floragato -> Meowscarada (Grass starter, Gen 9)
  // The owner's design (2026-10-27, after the 25): Hiker for Lucky cards. Sprigatito 906: when a Lucky card triggers (its 1 in 5 Mult
  // or 1 in 15 money), that card permanently gains +1 Mult and +$1 when scored (perma_mult / perma_p_dollars, Hiker's perma_bonus
  // route), every time it scores after. 5 rounds. The Mult step is `mult_mod` (Energy: +20% of its base each), the money step
  // `dollars` (in no energy_values: fixed); a card keeps what it was given — later Energy doesn't re-grow it (Houndour's perma_mult).
  sprigatito: {
    name: 'sprigatito', poke_sprite391: sprite('Natdex', 10, 60),
    config: { extra: { mult_mod: 1, dollars: 1, rounds: 5 } },
    rarity: 2, cost: 5, stage: 'Basic', ptype: 'Grass', gen: 9, blueprint_compat: true, starter: true,
    attributes: ['starter', 'mult', 'economy', 'enhancements', 'modify_card', 'round_evo'], poke_after: 'ursaluna',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.dollars, ex.rounds] }; },
    calculate(self, card, context) { return lucky_grow(card, context) || level_evo(self, card, context, 'j_poke_floragato'); },
  },
  // Floragato 907: the same, +2 Mult and +$2 per Lucky trigger. 5 rounds.
  floragato: {
    name: 'floragato', poke_sprite391: sprite('Natdex', 12, 60),
    config: { extra: { mult_mod: 2, dollars: 2, rounds: 5 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'mult', 'economy', 'enhancements', 'modify_card', 'round_evo'], poke_after: 'sprigatito',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); const ex = card.ability.extra; return { vars: [ex.mult_mod, ex.dollars, ex.rounds] }; },
    calculate(self, card, context) { return lucky_grow(card, context) || level_evo(self, card, context, 'j_poke_meowscarada'); },
  },
  // Meowscarada 908: no more growth (the cards keep theirs); Lucky cards held in hand give X1.25 Mult, like Steel cards: the joker's
  // per-card X (`Xmult_multi`: Energy +5% of its base each — X1.3125 / X1.375 / X1.4375). Not counted as Steel (Steel Joker,
  // has_enhancement): only the held X Mult.
  meowscarada: {
    name: 'meowscarada', poke_sprite391: sprite('Natdex', 14, 60),
    config: { extra: { Xmult_multi: 1.25 } },
    rarity: 'poke_safari', cost: 10, stage: 'Two', ptype: 'Grass', gen: 9, blueprint_compat: true,
    attributes: ['starter', 'xmult', 'enhancements'], poke_after: 'floragato',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_lucky); return { vars: [card.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      // (a held Lucky card, as Steel's held X Mult — Baron's shape: retriggered by Mime / a Red Seal like Steel; nothing while debuffed)
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && has_enhancement(context.other_card, 'm_lucky')) {
        if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
        return { x_mult: card.ability.extra.Xmult_multi, card };
      }
      return undefined;
    },
  },

  // ---------------------------------------------------------------- LINE I: Mudbray -> Mudsdale (Earth, Gen 7)
  // Mudbray 749: +20 Chips; Stamina: +6 Chips for each hand that isn't the round's first. Evolves in 5 rounds.
  mudbray: {
    name: 'mudbray', poke_sprite391: sprite('Natdex', 26, 49),
    config: { extra: { chips: 20, chip_mod: 6, rounds: 5 } },
    rarity: 1, cost: 5, stage: 'Basic', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'round_evo'], poke_after: 'lycanroc_dusk',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); const ex = card.ability.extra; return { vars: [ex.chips, ex.chip_mod, ex.rounds] }; },
    calculate(self, card, context) { return stamina(card, context) || level_evo(self, card, context, 'j_poke_mudsdale'); },
  },
  // Mudsdale 750: Stamina +10 Chips; Mud Spit: the first unscored card of each played hand becomes a Stone card.
  mudsdale: {
    name: 'mudsdale', poke_sprite391: sprite('Natdex', 28, 49),
    config: { extra: { chips: 20, chip_mod: 10 } },
    rarity: 'poke_safari', cost: 8, stage: 'One', ptype: 'Earth', gen: 7, blueprint_compat: true,
    attributes: ['chips', 'scaling', 'modify_card', 'enhancements'], poke_after: 'mudbray',
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); info_queue.push(P_CENTERS.m_stone); const ex = card.ability.extra; return { vars: [ex.chip_mod, ex.chips] }; },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint && context.full_hand) {
        const target = context.full_hand.find((c) => !context.scoring_hand.includes(c));
        if (target) {
          target.set_ability(P_CENTERS.m_stone, null, true);
          G.E_MANAGER.add_event(() => { target.juice_up(); });
          card_eval_status_text(card, 'extra', null, null, null, { message: 'Mud Spit!', colour: 'CHIPS' });
        }
      }
      return stamina(card, context);
    },
  },
}, FILE);

/** The families (functions/pokefamily.lua style): index.js adds them with set_family. */
export const DESIGN_FAMILIES = [
  ['shinx', 'luxio', 'luxray'],
  ['honedge', 'doublade', 'aegislash'],
  ['spheal', 'sealeo', 'walrein'],
  ['grookey', 'thwackey', 'rillaboom'],
  ['kubfu', 'urshifu_single', 'urshifu_rapid'],
  ['tandemaus', 'maushold'],
  ['darumaka', 'darmanitan'],
  ['scraggy', 'scrafty'],
  ['mudbray', 'mudsdale'],
  ['sprigatito', 'floragato', 'meowscarada'],
];

/** Their text (Pokermon loc style: #n# filled by loc_vars), from the design guide; index.js merges it into descriptions.Joker. */
const EVOLVES_ROUNDS = (n) => '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#' + n + '#{C:inactive,s:0.8} rounds)';
const ROLLOUT = (c, m) => ['{C:attention}Rollout:{} {C:chips}+#' + c + '#{} Chips, doubled', 'for each consecutive hand of', 'the same poker hand {C:inactive}(max #' + m + '# doublings)'];
const PAIR = ['Played cards that share a rank', 'with another scored card give', '{C:mult}+#1#{} Mult when scored'];
const TRAIN = (x) => ['Gains {X:mult,C:white} X#' + x + '# {} Mult when a hand', 'with exactly {C:attention}1{} or exactly {C:attention}5{}', 'scoring cards is played', '{C:inactive}(Can\'t be debuffed)'];
const LUCKY_GROW = ['When a {C:attention}Lucky{} card triggers,', 'it permanently gains {C:mult}+#1#{} Mult', 'and {C:money}$#2#{} when scored', EVOLVES_ROUNDS(3)];
const COMMANDER = ['{C:attention}Commander:{} the leftmost', '{X:poke_water,C:white}Water{} Joker gives'];
export const DESIGN_LOC = {
  Joker: {
    j_poke_shinx: { name: 'Shinx', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card', 'earn {C:money}$#2#{} when scored', EVOLVES_ROUNDS(3)] },
    j_poke_luxio: { name: 'Luxio', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card give', '{C:mult}+#2#{} Mult and earn {C:money}$#3#{} when scored', EVOLVES_ROUNDS(4)] },
    j_poke_luxray: { name: 'Luxray', text: ['{C:purple}+#1# Foresight', 'Played cards that share a rank', 'with a {C:attention}Foreseen{} card give', '{X:mult,C:white} X#2# {} Mult and earn {C:money}$#3#{}', 'when scored'] },
    j_poke_honedge: { name: 'Honedge', text: ['Gains {C:mult}+#1#{} Mult for each', '{C:attention}Steel{} card held in hand', 'when a hand is played', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves at {C:mult,s:0.8}+#2#{C:inactive,s:0.8} / +#3# Mult)'] },
    j_poke_doublade: { name: 'Doublade', text: [
      ['Gains {C:mult}+#1#{} Mult for each', '{C:attention}Steel{} card held in hand', 'when a hand is played'],
      ['Retrigger the first {C:attention}#2#{}', '{C:attention}Steel{} cards held in hand', '{C:inactive}(Currently {C:mult}+#3#{C:inactive} Mult)', '{C:inactive,s:0.8}(Evolves with a {C:attention,s:0.8}Dusk Stone{C:inactive,s:0.8})'],
    ] },
    j_poke_aegislash: { name: 'Aegislash', text: [
      ['{C:mult}+#1#{} Mult {C:inactive}(kept from Doublade)', '{C:attention}Stance Change:{}', '{C:attention}Blade Forme:{} {X:mult,C:white} X#2# {} Mult', '{C:attention}Shield Forme:{} retrigger all', '{C:attention}Steel{} cards held in hand'],
      ['Playing a hand switches to Blade Forme,', 'discarding switches to Shield Forme', '{C:inactive}(Starts each round in Shield Forme)', '{C:inactive}(Currently {C:attention}#3#{C:inactive} Forme)'],
    ] },
    j_poke_spheal: { name: 'Spheal', text: [...ROLLOUT(1, 2), '{C:inactive}(Resets when the hand changes', '{C:inactive}and at end of round)', '{C:inactive}(Currently {C:chips}+#3#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_sealeo: { name: 'Sealeo', text: ['{C:chips}+#1#{} hand', ...ROLLOUT(2, 3), '{C:inactive}(Currently {C:chips}+#5#{C:inactive} Chips)', EVOLVES_ROUNDS(4)] },
    j_poke_walrein: { name: 'Walrein', text: [
      ['{C:chips}+#1#{} hand', ...ROLLOUT(2, 3), '{C:inactive}(Currently {C:chips}+#5#{C:inactive} Chips)'],
      ['{C:attention}Sheer Cold:{} {X:mult,C:white} X#4# {} Mult while', 'Rollout is at full power'],
    ] },
    j_poke_grookey: { name: 'Grookey', text: ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered', '{C:inactive}(Beat {C:attention}#3#{C:inactive}/#5#)', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#4#{C:inactive,s:0.8} beats)'] },
    j_poke_thwackey: { name: 'Thwackey', text: ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered', '{C:inactive,s:0.8}(Evolves after {C:attention,s:0.8}#3#{C:inactive,s:0.8} beats)'] },
    j_poke_rillaboom: { name: 'Rillaboom', text: [
      ['{C:attention}+#1#{} hand size', 'Every {C:attention}#2#{} card scored this', 'round is retriggered'],
      ['{C:attention}Drum Beating:{} retriggered cards', 'give {C:mult}+#3#{} Mult'],
    ] },
    j_poke_kubfu: { name: 'Kubfu', text: ['This Joker can\'t be debuffed', 'Gains {X:mult,C:white} X#1# {} Mult when a hand', 'with exactly {C:attention}1{} or exactly {C:attention}5{}', 'scoring cards is played', '{C:inactive}(Currently {X:mult,C:white} X#2# {C:inactive} Mult)',
      '{C:inactive,s:0.8}(Evolves after #3# trainings:', '{C:inactive,s:0.8}more 1-card hands: Single Strike,', '{C:inactive,s:0.8}more 5-card hands: Rapid Strike)', '{C:inactive,s:0.8}(Single {C:attention,s:0.8}#4#{C:inactive,s:0.8} / Rapid {C:attention,s:0.8}#5#{C:inactive,s:0.8})'] },
    j_poke_urshifu_single: { name: 'Urshifu', text: [
      ['{C:attention}Single Strike Style', '{X:mult,C:white} X#1# {} Mult {C:inactive}(kept from Kubfu)', '{C:attention}Unseen Fist:{} playing cards', 'can\'t be debuffed'],
      ['{C:attention}Wicked Blow:{} if played hand is', 'exactly {C:attention}1{} card, it also gives this', 'Joker\'s {X:mult,C:white}X{} Mult when scored'],
      TRAIN(2),
    ] },
    j_poke_urshifu_rapid: { name: 'Urshifu', text: [
      ['{C:attention}Rapid Strike Style', '{X:mult,C:white} X#1# {} Mult {C:inactive}(kept from Kubfu)', '{C:attention}Surging Strikes:{} retrigger', 'the first {C:attention}#3#{} scored cards'],
      TRAIN(2),
    ] },
    j_poke_xerneas: { name: 'Xerneas', text: [
      ['{C:attention}Geomancy:{} after the first hand', 'of each round, played cards give', '{X:mult,C:white} X#1# {} Mult when scored', '{C:inactive}(#2#)'],
      ['The first playing card destroyed', 'each round returns to your hand', 'as a copy'],
    ] },
    j_poke_tandemaus: { name: 'Tandemaus', text: [...PAIR, '{C:inactive}(The pair never separates)', EVOLVES_ROUNDS(2)] },
    j_poke_maushold: { name: 'Maushold', text: [PAIR,
      ['{C:attention}Population Bomb:{} retrigger the', 'first scored card, then {C:green}#2# in #3#{}', 'chance to retrigger it again,', 'up to {C:attention}#4#{} times {C:inactive}(Family of Four)']] },
    j_poke_maushold_three: { name: 'Maushold', text: [PAIR,
      ['{C:attention}Population Bomb:{} retrigger the', 'first scored card, then {C:green}#2# in #3#{}', 'chance to retrigger it again,', 'up to {C:attention}#4#{} times; each retrigger', 'earns {C:money}$#5#{} {C:inactive}(Family of Three)']] },
    j_poke_darumaka: { name: 'Darumaka', text: ['{C:mult}+#1#{} Mult', '{C:attention}Hustle:{} {C:green}#2# in #3#{} chance', 'to give nothing', EVOLVES_ROUNDS(4)] },
    j_poke_darmanitan: { name: 'Darmanitan', text: [['{C:mult}+#1#{} Mult'],
      ['{C:attention}Zen Mode:{} on the final hand of', 'the round, gives {X:mult,C:white} X#2# {} Mult instead', 'and becomes {X:poke_psychic,C:white}Psychic{} until', 'end of round']] },
    j_poke_scraggy: { name: 'Scraggy', text: ['{C:mult}+#1#{} Mult', '{C:attention}Moxie:{} gains {C:mult}+#2#{} Mult when a', 'Blind is defeated with the', 'first hand of the round', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)', EVOLVES_ROUNDS(3)] },
    j_poke_scrafty: { name: 'Scrafty', text: [
      ['{C:attention}Moxie:{} gains {C:mult}+#1#{} Mult, plus {C:mult}+#2#{}', 'for each other {X:poke_dark,C:white}Dark{} Joker, when a', 'Blind is defeated with the first', 'hand of the round'],
      ['{X:mult,C:white} X#3# {} Mult on the first', 'hand of each round', '{C:inactive}(Currently {C:mult}+#4#{C:inactive} Mult)'],
    ] },
    j_poke_spiritomb: { name: 'Spiritomb', text: [
      ['Gains {C:attention}1{} spirit when a playing', 'card is destroyed or a Joker is sold', '{X:mult,C:white} X#1# {} Mult per spirit', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#3# spirits, {X:mult,C:white} X#4# {C:inactive})'],
      ['At {C:attention}#3#{} spirits, create {C:spectral}The Soul{}', '{C:inactive}(Once; must have room)'],
    ] },
    j_poke_tatsugiri: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Curly, Droopy or Stretchy', ...COMMANDER, '{C:inactive}Curly:{} {X:mult,C:white} X#1# {} Mult', '{C:inactive}Droopy:{} {C:chips}+#2#{} Chips', '{C:inactive}Stretchy:{} {C:mult}+#3#{} Mult'] },
    j_poke_tatsugiri_curly: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Curly', ...COMMANDER, '{X:mult,C:white} X#1# {} Mult'] },
    j_poke_tatsugiri_droopy: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Droopy', ...COMMANDER, '{C:chips}+#2#{} Chips'] },
    j_poke_tatsugiri_stretchy: { name: 'Tatsugiri', text: ['{C:attention}Nature:{} Stretchy', ...COMMANDER, '{C:mult}+#3#{} Mult'] },
    j_poke_sprigatito: { name: 'Sprigatito', text: LUCKY_GROW },
    j_poke_floragato: { name: 'Floragato', text: LUCKY_GROW },
    j_poke_meowscarada: { name: 'Meowscarada', text: ['{C:attention}Lucky{} cards held in hand', 'each give {X:mult,C:white} X#1# {} Mult', '{C:inactive}(Like {C:attention}Steel{C:inactive} cards, but not', '{C:inactive}counted as Steel)'] },
    j_poke_mudbray: { name: 'Mudbray', text: ['{C:chips}+#1#{} Chips', '{C:attention}Stamina:{} gains {C:chips}+#2#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round', '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)', EVOLVES_ROUNDS(3)] },
    j_poke_mudsdale: { name: 'Mudsdale', text: [
      ['{C:attention}Stamina:{} gains {C:chips}+#1#{} Chips when', 'you play a hand that isn\'t the', 'first hand of the round'],
      ['{C:attention}Mud Spit:{} the first unscored', 'card in each played hand', 'becomes a {C:attention}Stone{} card', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'],
    ] },
  },
  Other: {
    poke_design_unseen_fist: { name: 'Unseen Fist', text: ['While you have this Joker,', 'no playing card is {C:attention}debuffed{}', '{C:inactive}(Boss Blind suits, faces...)'] },
  },
};

// Text boxes: a list of line lists is several boxes, written as SMODS's box break ({br:2} + filler, as Pokermon's en-us.lua) between them.
const BR = '{br:2}ERROR - CONTACT STEAK';
for (const set of Object.values(DESIGN_LOC)) {
  for (const e of Object.values(set)) if (e.text.some(Array.isArray)) e.text = e.text.flatMap((p, i) => (Array.isArray(p) ? (i ? [BR, ...p] : p) : [p]));
}
