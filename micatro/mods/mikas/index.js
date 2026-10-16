/**
 * Mika's Mod Collection 0.13.3 (Mikadoe; Steamodded 0.9.5 old API + Lovely 0.4), rebuilt natively
 * for Micatro. Source: `mods off/MikasBalatro-main/MikasModCollection.lua` (+ lovely.toml, assets/).
 *
 *   60 jokers, 7 decks, 2 Tarots (Ace / Page of Pentacles), 1 Spectral (Incense) — everything the
 *   mod's config (lines 11-96) turns on. The 9 tarots flagged "In Development, do not enable"
 *   (King of Cups, Common, Uncommon, Chips, Mult, Money, Support, Card Chips, Card Mult) are not
 *   part of the mod and are not ported. The website files and j_mmc_statistic.png (no joker) too.
 *   Keys keep the mod's own prefix (`j_mmc_<slug>`, `c_mmc_<slug>`); ability names keep the
 *   "MMC " prefix (Eye Chart strips it, find_joker('MMC Dagonet') etc. rely on it).
 *
 * The mod's config table is the option group: one toggle per joker / deck / consumable (keys as
 * in the Lua), all defaulting to the mod's own defaults (all on). A toggled-off item leaves the
 * pools (and a deck the New Run picker), like the Lua never registering it.
 *
 * Old-API mapping: SMODS.end_calculate_context(context) = joker_main; Card.update -> center.update
 * (the engine runs it before every calculate and after every money change); the evaluate_play wrap
 * (mmc_scored_chips) -> the `hand_scored` hook; Back.apply_to_run wrap -> deck apply(); the
 * add_to_deck / remove_from_deck / set_cost / set_edition / get_end_of_round_effect wraps -> hooks;
 * lovely.toml's bonus_mult -> the engine's ability.perma_mult + the `describe` hook.
 * Card references the Lua kept in ability.extra (Printer, Finishing Blow, Scoring Test) are kept
 * as sort_ids here (an ability is deep-copied by copy_card; a Card inside would recurse).
 *
 * INTENDED-DESIGN FIXES (each tested in micatro/tests/mods/mikas_test.mjs):
 *  1. blueprint_compat = false jokers without a `not context.blueprint` guard (Fisherman, Eye Chart,
 *     Finishing Blow, Printer, Commander, Harp Seal, Stockpiler, One Of Us, Shackles, Pack A Punch,
 *     Seal Steal, Scoring Test, Plus One, Cicero, Dagonet) were still copied by Blueprint/Brainstorm
 *     (vanilla Blueprint copies any joker; only the guard stops it): they now ignore copies.
 *  2. Harp Seal paid a Gold Seal card's bonus twice (ease_dollars(3) AND `dollars = 3`, which
 *     evaluate_play pays again: +$6, tripling the seal) — "Doubles the effect": +$3.
 *  3. Grudgeful Joker's total_chips was never reset, so after round 1 the "excess" was every chip
 *     ever scored (always the 25% cap) — it resets each round like Show-Off / Sniper.
 *  4. Dagonet's blacklist was an array indexed by name (`blacklist[name] == nil` is always true),
 *     so it doubled Credit Card / Juggler / Turtle Bean / Drunkard / Troubadour / Merry Andy and
 *     broke their add/remove bookkeeping — the six are skipped as listed.
 *  5. Student Loans, back in the black, gave back only 1 discard however many it had taken
 *     (ease_discard(1)) — it returns all of them.
 *  6. Finishing Blow kept the scored cards of EVERY High Card hand of the round (card_refs only
 *     cleared at round end) and enhanced them all — only the finishing hand's cards are enhanced.
 *  7. Scoring Test recorded the hand at joker_main, which a debuffed hand skips, then destroyed the
 *     PREVIOUS hand's cards (wherever they were) — it records debuffed hands too.
 *  8. Fishing License returned `Xmult` for Glass cards (evaluate_play reads `x_mult` per card), so
 *     Glass did nothing — it copies the X2.
 *  9. The Commander checked `card.ability.seal` (always nil; seals live in card.seal), so it
 *     replaced existing seals — like the edition/enhancement it only adds one when there is none.
 * 10. Glue: a second Half Joker / Incomplete Joker granted Glue's +2 slots again (and removing one
 *     of two took them away while the other remained) — +2 slots while both are owned, once.
 * 11. Perma-mult (Mountain Climber): the lovely override of Card:get_chip_mult returned
 *     mult + perma_mult before the debuff and Lucky checks, so debuffed cards still scored Mult
 *     and Lucky cards always paid their +20 — the engine's perma_mult adds to the vanilla rules
 *     (shown as "+N extra Mult"; a Mult Card shows its total as the lovely patch does).
 */
import { registerMod, MOD_LOC } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS, LOC, localize, card_eval_status_text, play_sound, emit,
  pseudorandom, pseudoseed, pseudorandom_element, ease_dollars, ease_discard, ease_hands_played,
  level_up_hand, create_card, create_playing_card, copy_card, poll_edition, find_joker, add_joker,
  eval_card, number_format, P_CARDS_LIST, P_CENTER_POOLS,
} from '../../js/engine/core.js';
import { juice_card_until } from '../../js/engine/jokers.js';
import { JOKERS, CONSUMABLES, layout } from './layout.js';

export const MOD_ID = 'mikas';
const PRE = 'mmc';
const ATLAS = 'mikas';
const LAYOUT = layout();

// ------------------------------------------------------------------ helpers
const ex = (card) => card.ability.extra;
const lv = (key, v) => localize({ type: 'variable', key, vars: [v] });
const say = (card, message, colour, more) => card_eval_status_text(card, 'extra', null, null, null, { message, colour, ...(more || {}) });
/** SMODS.end_calculate_context(context): the joker_main pass (Micatro names it). */
const endCtx = (ctx) => !!ctx.joker_main;
/** `context.end_of_round and not context.individual and not context.repetition` */
const eor = (ctx) => !!ctx.end_of_round && !ctx.individual && !ctx.repetition;
const afterJ = (ctx) => !!ctx.after && ctx.cardarea === G.jokers;
const dissolve = (card) => G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.start_dissolve(); });
const hasStraight = (ctx) => !!(ctx.poker_hands && ctx.poker_hands.Straight && ctx.poker_hands.Straight.length);
const prob = () => (G.GAME && G.GAME.probabilities ? G.GAME.probabilities.normal : 1);
const byId = (id) => (G.play && G.play.cards.find((c) => c.sort_id === id)) || (G.playing_cards || []).find((c) => c.sort_id === id);

const is_even = (c) => { const id = c.get_id(); return id <= 10 && id % 2 === 0; };
const is_odd = (c) => { const id = c.get_id(); return (id % 2 !== 0 && id < 10) || id === 14; };
const is_fibo = (c) => [2, 3, 5, 8, 14].includes(c.get_id());
const is_prime = (c) => [2, 3, 5, 7, 14].includes(c.get_id());
const is_face = (c) => [11, 12, 13].includes(c.get_id());

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'é', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
const upper = (l) => (l === 'é' ? l : l.toUpperCase()); // Lua string.upper is byte-wise: 'é' stays
const ENHANCEMENTS = () => ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky'].map((k) => P_CENTERS[k]);
const SEALS = ['Gold', 'Red', 'Blue', 'Purple'];

function create_tarot(joker, seed) {
  if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
    G.GAME.consumeable_buffer += 1;
    G.E_MANAGER.add_event(() => {
      const card = create_card('Tarot', G.consumeables, null, null, null, null, null, seed);
      card.add_to_deck();
      G.consumeables.emplace(card);
      G.GAME.consumeable_buffer = 0;
    });
    say(joker, localize('k_plus_tarot'), 'PURPLE');
  } else say(joker, localize('k_no_space_ex'));
}

function create_planet(joker, seed, edition, other_joker) {
  const neg = !!(edition && edition.negative);
  if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit || neg) {
    if (!neg) G.GAME.consumeable_buffer += 1;
    G.E_MANAGER.add_event(() => {
      if (G.GAME.last_hand_played) {
        let _planet = 0;
        for (const v of P_CENTERS_POOL('Planet')) if (v.config.hand_type === G.GAME.last_hand_played) _planet = v.key;
        const card = create_card('Planet', G.consumeables, null, null, null, null, _planet || undefined, seed);
        if (edition) card.set_edition(edition, true);
        card.add_to_deck();
        G.consumeables.emplace(card);
        if (!neg) G.GAME.consumeable_buffer = 0;
        if (other_joker) other_joker.juice_up();
      }
    });
    say(joker, localize('k_plus_planet'), 'Planet');
  } else say(joker, localize('k_no_space_ex'));
}
const P_CENTERS_POOL = (set) => P_CENTER_POOLS[set] || [];

/** The Lua blind-requirement cut (Grudgeful / Historical): never below 0. */
function lower_blind(amount) {
  G.GAME.blind.chips = Math.max(G.GAME.blind.chips - amount, 0);
  G.GAME.blind.chip_text = number_format(G.GAME.blind.chips);
  emit('blind', { action: 'chips', key: G.GAME.blind.config && G.GAME.blind.config.blind && G.GAME.blind.config.blind.key, chips: G.GAME.blind.chips, chip_text: G.GAME.blind.chip_text });
  emit('blind_juice', {});
}

// ------------------------------------------------------------- Dagonet
const ATTRIBUTES = {};
for (const k of ['mult', 'mult_mod', 'chips', 'chip_mod', 'Xmult', 'Xmult_mod', 'x_mult', 't_mult', 't_chips', 's_mult', 'dollars',
  'hand_add', 'discard_sub', 'odds', 'faces', 'max', 'min', 'every', 'increase', 'd_size', 'h_mod', 'h_plays', 'discards', 'req',
  'percentage', 'base', 'extra']) {
  // (the Lua's prev_key spellings, incl. its "prev_chips_mod_dagonet" for chip_mod)
  ATTRIBUTES[k] = { key: k + '_dagonet', prev_key: k === 'chip_mod' ? 'prev_chips_mod_dagonet' : 'prev_' + k + '_dagonet', min: (k === 'Xmult' || k === 'x_mult') ? 1 : 0 };
}
// Fix 4: a name-keyed set (the Lua's array never matched).
const DAGONET_BLACKLIST = new Set(['Credit Card', 'Juggler', 'Turtle Bean', 'Drunkard', 'Troubadour', 'Merry Andy']);

/** increase_attributes(k, v, place, multiplier), line for line. */
function increase_attributes(k, v, place, multiplier) {
  const attr = ATTRIBUTES[k];
  if (!attr || typeof v === 'string') return;
  if (v !== null && typeof v === 'object') {
    if (place.extra && typeof place.extra === 'object') for (const [k2, v2] of Object.entries(place.extra)) increase_attributes(k2, v2, place.extra, multiplier);
  } else if (typeof v === 'number' && v > attr.min) {
    if (place[attr.prev_key] === undefined) place[attr.prev_key] = multiplier;
    if (place[attr.key] === undefined) {
      place[attr.key] = v;
    } else if (!(v / multiplier === place[attr.key] && place[attr.prev_key] === multiplier)) {
      if (!(v / multiplier === place[attr.key] || v / place[attr.prev_key] === place[attr.key])) {
        if (v / multiplier !== place[attr.key] && place[attr.prev_key] === multiplier) {
          place[attr.key] = place[attr.key] + (v / multiplier - place[attr.key]) * multiplier;
        } else {
          place[attr.key] = place[attr.key] + (v / place[attr.prev_key] - place[attr.key]) * place[attr.prev_key];
        }
      }
    }
    place[k] = place[attr.key] * multiplier;
    place[attr.prev_key] = multiplier;
  }
}

// ------------------------------------------------------------- Cicero
const CICERO_BLACKLIST = new Set(['Misprint']);
const CICERO_WHITELIST = new Set(['Mr. Bones', 'MMC Printer']);
function cicero_support(card) {
  const key = card.config.center.key;
  const d = (LOC.descriptions.Joker && LOC.descriptions.Joker[key]) || (MOD_LOC.descriptions.Joker && MOD_LOC.descriptions.Joker[key]);
  if (!d || !Array.isArray(d.text)) return CICERO_WHITELIST.has(card.ability.name);
  let support = true;
  for (const v of d.text) { const l = v.toLowerCase(); support = support && !(l.includes('mult') || l.includes('chips') || l.includes('retrigger')); }
  return (support && !CICERO_BLACKLIST.has(card.ability.name)) || CICERO_WHITELIST.has(card.ability.name);
}
/** The set_edition wrap: an un-added joker getting no edition / a non-negative one goes Negative. */
function cicero_applies(card) {
  return !!(G.jokers && card.ability && card.ability.set === 'Joker' && !card.added_to_deck && find_joker('MMC Cicero').length && cicero_support(card));
}

// --------------------------------------------------------------- Glue (fix 10)
const owned = (name, plus, minus) => G.jokers.cards.concat(plus ? [plus] : []).some((c) => c !== minus && c.added_to_deck && c.ability.name === name);
function glue_refresh(glue, plus, minus) {
  const e = ex(glue);
  e.half = owned('Half Joker', plus, minus);
  e.incomplete = owned('MMC Incomplete Joker', plus, minus);
  const want = e.half && e.incomplete;
  if (want && !e.triggered) { e.triggered = true; G.jokers.config.card_limit += e.j_slots; }
  else if (!want && e.triggered) { e.triggered = false; G.jokers.config.card_limit -= e.j_slots; }
}

// --------------------------------------------------------------- jokers
// Each: [loc {name, text}, center fields, behaviour {calculate, loc_vars, update, add, remove, set_ability}]
const J = {};
const def = (slug, name, loc, cfg, beh = {}) => { J[slug] = { name, loc, ...cfg, beh }; };
const grassy = '{C:inactive}Art by {C:green,E:1,S:1.1}Grassy';

def('prime_time', 'MMC Prime Time', { name: 'Prime Time', text: ['Each played {C:attention}2{},', '{C:attention}3{}, {C:attention}5{}, {C:attention}7{} or {C:attention}Ace{}, gives', '{X:mult,C:white}X#1#{} Mult when scored', grassy] },
  { config: { extra: { Xmult: 1.2 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).Xmult],
    calculate(card, ctx) {
      if (ctx.individual && ctx.cardarea === G.play && is_prime(ctx.other_card)) return { message: lv('a_xmult', ex(card).Xmult), x_mult: ex(card).Xmult, card };
    },
  });

def('straight_nate', 'MMC Straight Nate', { name: 'Straight Nate', text: ['{X:mult,C:white} X#1# {} Mult if played hand', 'contains a {C:attention}Straight{} and you have', 'both {C:attention}Odd Todd{} and {C:attention}Even Steven{}', 'Gives {C:dark_edition}+#2#{} Joker slot'] },
  { config: { extra: { Xmult: 4, j_slots: 1 } }, rarity: 3, cost: 7, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).Xmult, ex(c).j_slots],
    calculate(card, ctx) {
      if (endCtx(ctx) && ctx.poker_hands && hasStraight(ctx)) {
        const todd = G.jokers.cards.some((v) => v.ability.name === 'Odd Todd');
        const steven = G.jokers.cards.some((v) => v.ability.name === 'Even Steven');
        if (todd && steven) return { message: lv('a_xmult', ex(card).Xmult), Xmult_mod: ex(card).Xmult };
      }
    },
    add(card) { G.jokers.config.card_limit += ex(card).j_slots; },
    remove(card) { G.jokers.config.card_limit -= ex(card).j_slots; },
  });

def('fisherman', 'MMC The Fisherman', { name: 'The Fisherman', text: ['{C:attention}+#2#{} hand size per discard', '{C:attention}-#2#{} hand size per hand played', 'Resets every round', '{C:inactive}(Currently {C:attention}+#1#{C:inactive} hand size)'] },
  { config: { extra: { current_h_size: 0, h_mod: 1 } }, rarity: 2, cost: 6, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_h_size, ex(c).h_mod],
    calculate(card, ctx) {
      const e = ex(card);
      if (endCtx(ctx) && e.current_h_size > 0) {
        e.current_h_size = Math.max(0, e.current_h_size - e.h_mod);
        G.hand.change_size(-e.h_mod);
        say(card, localize('k_mmc_hand_down'));
      }
      if (ctx.pre_discard) {
        e.current_h_size += e.h_mod;
        G.hand.change_size(e.h_mod);
        say(card, localize('k_mmc_hand_up'));
      }
      if (eor(ctx) && e.current_h_size !== 0) {
        G.hand.change_size(-e.current_h_size);
        e.current_h_size = 0;
        say(card, localize('k_reset'));
      }
    },
    remove(card) {
      const e = ex(card);
      if (e.current_h_size !== 0) { G.hand.change_size(-e.current_h_size); e.current_h_size = 0; }
    },
  });

def('impatient', 'MMC Impatient Joker', { name: 'Impatient Joker', text: ['{C:mult}+#2#{} Mult per card discarded', 'Resets every round', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)'] },
  { config: { extra: { mult_mod: 3, current_mult: 0 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_mult, ex(c).mult_mod],
    calculate(card, ctx) {
      const e = ex(card);
      if (endCtx(ctx) && e.current_mult > 0) return { message: lv('a_mult', e.current_mult), mult_mod: e.current_mult, card };
      if (ctx.discard && !ctx.blueprint) {
        e.current_mult += e.mult_mod;
        return { message: lv('a_mult', e.mult_mod), colour: 'RED', card };
      }
      if (eor(ctx) && !ctx.blueprint && e.current_mult !== 0) { e.current_mult = 0; say(card, localize('k_reset')); }
    },
  });

def('cultist', 'MMC Cultist', { name: 'Cultist', text: ['{X:mult,C:white}X#2#{} Mult per hand played', 'Resets every round', '{C:inactive}(Currently {X:mult,C:white}X#1#{C:inactive} Mult)', grassy] },
  { config: { extra: { current_Xmult: 1, Xmult_mod: 1, old: 0 } }, rarity: 3, cost: 8, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_Xmult, ex(c).Xmult_mod],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.before && !ctx.blueprint) { e.old = e.current_Xmult; e.current_Xmult += e.Xmult_mod; }
      if (endCtx(ctx) && e.old > 1) return { message: lv('a_xmult', e.old), Xmult_mod: e.old, card };
      if (eor(ctx) && !ctx.blueprint && e.current_Xmult !== 1) { e.current_Xmult = 1; say(card, localize('k_reset')); }
    },
  });

const sealCount = () => (G.playing_cards || []).filter((v) => v.seal).length;
def('seal_collector', 'MMC Seal Collector', { name: 'Seal Collector', text: ['Gains {C:chips}+#2#{} Chips for', 'every card with a {C:attention}seal', '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)'] },
  { config: { extra: { current_chips: 25, chip_mod: 25 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    // (display: the value Card.update keeps current every frame in the Lua)
    loc_vars: (c) => [c.fake ? ex(c).current_chips : sealCount() * ex(c).chip_mod, ex(c).chip_mod],
    update(card) { ex(card).current_chips = sealCount() * ex(card).chip_mod; },
    calculate(card, ctx) {
      if (endCtx(ctx)) return { message: lv('a_chips', ex(card).current_chips), chip_mod: ex(card).current_chips, card };
    },
  });

def('camper', 'MMC Camper', { name: 'Camper', text: ['Every discarded {C:attention}card{}', 'permanently gains', '{C:chips}+#1#{} Chips'] },
  { config: { extra: { chip_mod: 4 } }, rarity: 2, cost: 5, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).chip_mod],
    calculate(card, ctx) {
      if (ctx.discard) {
        ctx.other_card.ability.perma_bonus = (ctx.other_card.ability.perma_bonus || 0) + ex(card).chip_mod;
        return { message: localize('k_upgrade_ex'), colour: 'CHIPS', card };
      }
    },
  });

def('scratch_card', 'MMC Scratch Card', { name: 'Scratch Card', text: ['Gain {C:money}$#1#{}, {C:money}$#2#{}, {C:money}$#3#{}, {C:money}$#4#{},', '{C:money}$#5#{} when 1, 2, 3, 4 or 5', '{C:attention}7 cards{} are scored,', 'respectively', grassy] },
  { config: { extra: { base: 1, dollars: 0, seven_tally: 0 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => { const b = ex(c).base; return [b, b * 3, b * 10, b * 25, b * 50]; },
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.get_id() === 7 && !ctx.blueprint) e.seven_tally += 1;
      if (endCtx(ctx)) {
        if (e.seven_tally === 1) e.dollars = e.base;
        else if (e.seven_tally === 2) e.dollars = e.base * 3;
        else if (e.seven_tally === 3) e.dollars = e.base * 10;
        else if (e.seven_tally === 4) e.dollars = e.base * 25;
        else if (e.seven_tally >= 5) e.dollars = e.base * 50;
        if (e.seven_tally >= 1) {
          ease_dollars(e.dollars);
          // (the Lua's `dollars` key is display-only in joker_main; paid once, above)
          return { message: localize('$') + e.dollars, colour: 'MONEY' };
        }
      }
      if (ctx.after && !ctx.blueprint && ctx.cardarea === G.jokers) { e.dollars = 0; e.seven_tally = 0; }
    },
  });

def('delayed', 'MMC Delayed Joker', { name: 'Delayed Joker', text: ['Gives {C:mult}+#1#{} Mult, {C:chips}+#2#{}', 'Chips and {X:mult,C:white}X#3#{} Mult on', 'the {C:attention}#5#th{} action', '{C:inactive}(Current action: {C:attention}#4#{C:inactive} )'] },
  { config: { extra: { mult: 20, chips: 100, Xmult: 1.5, every: 4, action_tally: 1 } }, rarity: 2, cost: 7, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).mult, ex(c).chips, ex(c).Xmult, ex(c).action_tally, ex(c).every],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.before && !ctx.blueprint) e.action_tally += 1;
      if (endCtx(ctx)) {
        if (e.action_tally === e.every + 1) return { mult_mod: e.mult, chip_mod: e.chips, Xmult_mod: e.Xmult, message: localize('k_mmc_bonus'), card };
        else if (!ctx.blueprint) return { message: localize('k_mmc_charging'), colour: 'JOKER_GREY', card };
      }
      if (afterJ(ctx) && !ctx.blueprint && e.action_tally === e.every + 1) e.action_tally = 1;
      if (ctx.pre_discard && !ctx.blueprint && !ctx.hook) {
        e.action_tally = (e.action_tally % e.every) + 1;
        if (e.action_tally === 1) say(card, localize('k_reset'));
        else say(card, localize('k_mmc_charging'), 'JOKER_GREY');
      }
    },
  });

def('showoff', 'MMC The Show-Off', { name: 'The Show-Off', text: ['Gains {X:mult,C:white}X#2#{} Mult when', 'a blind is finished with', '{C:attention}X#3#{} the chip requirement', '{C:inactive}(Currently {X:mult,C:white}X#1#{C:inactive} Mult)'] },
  { config: { extra: { current_Xmult: 1, Xmult_mod: 0.25, req: 2, total_chips: 0 } }, rarity: 3, cost: 8, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_Xmult, ex(c).Xmult_mod, ex(c).req],
    calculate(card, ctx) {
      const e = ex(card);
      if (endCtx(ctx) && e.current_Xmult > 1) return { message: lv('a_xmult', e.current_Xmult), Xmult_mod: e.current_Xmult, card };
      if (ctx.mmc_scored_chips !== undefined && !ctx.blueprint) e.total_chips += ctx.mmc_scored_chips;
      if (eor(ctx) && !ctx.blueprint) {
        if (e.total_chips > e.req * G.GAME.blind.chips) { e.current_Xmult += e.Xmult_mod; say(card, localize('k_upgrade_ex'), 'RED'); }
        e.total_chips = 0;
      }
    },
  });

def('sniper', 'MMC The Sniper', { name: 'The Sniper', text: ['Gains {X:mult,C:white}X#2#{} Mult when a', 'blind is finished within {C:attention}#3#%{} of', 'the {C:attention}exact{} chip requirement', '{C:inactive}(Currently {X:mult,C:white}X#1#{C:inactive} Mult)', grassy] },
  { config: { extra: { current_Xmult: 1, Xmult_mod: 2, percentage: 10, total_chips: 0 } }, rarity: 3, cost: 10, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_Xmult, ex(c).Xmult_mod, ex(c).percentage],
    calculate(card, ctx) {
      const e = ex(card);
      if (endCtx(ctx) && e.current_Xmult > 1) return { message: lv('a_xmult', e.current_Xmult), Xmult_mod: e.current_Xmult, card };
      if (ctx.mmc_scored_chips !== undefined && !ctx.blueprint) e.total_chips += ctx.mmc_scored_chips;
      if (eor(ctx) && !ctx.blueprint) {
        if (e.total_chips <= G.GAME.blind.chips * (1 + e.percentage / 100)) { e.current_Xmult += e.Xmult_mod; say(card, localize('k_upgrade_ex'), 'RED'); }
        e.total_chips = 0;
      }
    },
  });

def('blackjack', 'MMC Blackjack Joker', { name: 'Blackjack Joker', text: ['Gives {X:mult,C:white}X#1#{} Mult when', 'the ranks of all played', 'cards is {C:attention}exactly #2#', 'Gives {X:mult,C:white}X#3#{} Mult less for', 'every point below #2#'] },
  { config: { extra: { Xmult: 3, rank_tally: [0], updated_rank_tally: [], req: 21, Xmult_mod: 0.5 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).Xmult, ex(c).req, ex(c).Xmult_mod],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.before && !ctx.blueprint) {
        for (const v of ctx.full_hand) {
          const id = v.get_id();
          if (id <= 10) e.rank_tally = e.rank_tally.map((t) => t + id);
          else if (id < 14) e.rank_tally = e.rank_tally.map((t) => t + 10);
          else {
            // Aces count 1 or 11: every running total forks
            for (let k = 0; k < e.rank_tally.length; k++) { const t = e.rank_tally[k]; e.rank_tally[k] = t + 11; e.updated_rank_tally.push(t + 1); }
            for (const t of e.updated_rank_tally) e.rank_tally.push(t);
            e.updated_rank_tally = [];
          }
        }
      }
      if (endCtx(ctx)) {
        let Xmult = 1;
        for (const v of e.rank_tally) {
          const diff = e.req - v;
          const nx = e.Xmult - diff * e.Xmult_mod;
          if (diff >= 0 && nx > Xmult) Xmult = nx;
        }
        if (Xmult > 1) return { message: lv('a_xmult', Xmult), Xmult_mod: Xmult, card };
      }
      if (afterJ(ctx) && !ctx.blueprint) e.rank_tally = [0];
    },
  });

const jokerNameCount = () => (G.jokers ? G.jokers.cards.filter((v) => v.ability.name.includes('Joker')).length : 0);
def('batman', 'MMC Batman', { name: 'Batman', text: ['Gains {C:mult}+#2#{} Mult for', 'every {C:attention}non-lethal{} hand played', 'Mult gain increases for every', 'Joker with {C:attention}"Joker"{} in the name', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)'] },
  { config: { extra: { current_mult: 1, mult_mod: 1, total_chips: 0, base: 1 } }, rarity: 3, cost: 8, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_mult, c.fake ? ex(c).mult_mod : ex(c).base + jokerNameCount()],
    update(card) { ex(card).mult_mod = ex(card).base + jokerNameCount(); },
    calculate(card, ctx) {
      const e = ex(card);
      if (endCtx(ctx)) return { message: lv('a_mult', e.current_mult), mult_mod: e.current_mult };
      if (ctx.mmc_scored_chips !== undefined && !ctx.blueprint) {
        e.total_chips += ctx.mmc_scored_chips;
        if (e.total_chips < G.GAME.blind.chips) e.current_mult += e.mult_mod;
      }
      if (eor(ctx) && !ctx.blueprint) e.total_chips = 0;
    },
  });

def('bomb', 'MMC Bomb', { name: 'Bomb', text: ['Gains {C:mult}+#2#{} Mult per round', 'self destructs after {C:attention}#3#{} rounds', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult)', grassy] },
  { config: { extra: { current_mult: 15, mult_mod: 15, _every: 3 } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: false }, {
    loc_vars: (c) => [ex(c).current_mult, ex(c).mult_mod, ex(c)._every],
    calculate(card, ctx) {
      const e = ex(card);
      if (endCtx(ctx)) return { message: lv('a_mult', e.current_mult), mult_mod: e.current_mult, card };
      if (eor(ctx) && !ctx.blueprint) {
        e._every -= 1;
        if (e._every <= 0) dissolve(card);
        else { e.current_mult += e.mult_mod; say(card, localize('k_mmc_tick'), 'RED'); }
      }
    },
  });

def('eye_chart', 'MMC Eye Chart', { name: 'Eye Chart', text: ['Gives {C:chips}+#1#{} Chips for every', 'letter {C:attention}"#2#"{} in your Jokers', 'Letter changes when this', 'Joker appears in the shop', grassy] },
  { config: { extra: { chips: 20, letter: 'A' } }, rarity: 1, cost: 4, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).chips, ex(c).letter],
    calculate(card, ctx) {
      if (ctx.other_joker && ctx.other_joker.ability.set === 'Joker') {
        let name = ctx.other_joker.ability.name.toLowerCase();
        if (name.startsWith('mmc')) name = name.slice(3); // remove_prefix(name, "mmc")
        const letter = String(ex(card).letter).toLowerCase();
        const tally = name.split(letter).length - 1;
        if (tally > 0) {
          const oj = ctx.other_joker;
          G.E_MANAGER.add_event(() => oj.juice_up());
          return { message: lv('a_chips', ex(card).chips * tally), chip_mod: ex(card).chips * tally };
        }
      }
    },
  });

def('grudgeful', 'MMC Grudgeful Joker', { name: 'Grudgeful Joker', text: ['Lowers blind requirement', 'with {C:attention}excess Chips{} from', 'last round. Caps at {C:attention}#2#%', "of current blind's Chips", '{C:inactive}(Currently {C:chips}+#1#{C:inactive} Chips)'] },
  { config: { extra: { current_chips: 0, total_chips: 0, old_chips: 0, percentage: 25 } }, rarity: 3, cost: 9, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_chips, ex(c).percentage],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.mmc_scored_chips !== undefined && !ctx.blueprint) e.total_chips += ctx.mmc_scored_chips;
      if (endCtx(ctx) && e.current_chips > 0) {
        say(card, lv('a_chips', e.current_chips), 'CHIPS');
        lower_blind(e.current_chips);
      }
      if (afterJ(ctx) && !ctx.blueprint) e.current_chips = 0;
      if (eor(ctx) && !ctx.blueprint) {
        if (e.total_chips >= G.GAME.blind.chips) {
          e.current_chips = Math.ceil(Math.min(G.GAME.blind.chips * e.percentage / 100, e.total_chips - G.GAME.blind.chips));
          say(card, lv('a_chips', e.current_chips), 'CHIPS');
        }
        e.total_chips = 0; // fix 3: "excess Chips from last round"
      }
    },
  });

def('finishing_blow', 'MMC Finishing Blow', { name: 'Finishing Blow', text: ['If a blind is finished', 'with a {C:attention}High Card{}, randomly', '{C:attention}Enhance{} scored cards'] },
  { config: { extra: { high_card: false, card_refs: [] } }, rarity: 2, cost: 6, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).enhancement],
    calculate(card, ctx) {
      const e = ex(card);
      // fix 6: each hand starts over, so only the finishing hand's cards count
      if (ctx.before) { e.high_card = false; e.card_refs = []; }
      if (ctx.cardarea === G.play && ctx.individual && !ctx.repetition) {
        if (ctx.scoring_name === 'High Card') {
          if (ctx.other_card.ability.effect === 'Base') { e.high_card = true; e.card_refs.push(ctx.other_card.sort_id); }
        } else e.high_card = false;
      }
      if (eor(ctx)) {
        if (e.high_card) {
          for (const id of e.card_refs) {
            const v = byId(id);
            if (!v) continue;
            v.set_ability(pseudorandom_element(ENHANCEMENTS(), pseudoseed('finishing_blow'))[0], null, true);
            say(card, localize('k_upgrade_ex'));
          }
        }
        e.card_refs = [];
      }
    },
  });

def('aurora_borealis', 'MMC Aurora Borealis', { name: 'Aurora Borealis', text: ['{C:attention}Blue Seals{} give an', 'extra {C:dark_edition}negative {C:planet}Planet{} card', grassy] },
  { config: {}, rarity: 1, cost: 6, blueprint_compat: false, eternal_compat: true }, { loc_vars: () => [] });

def('historical', 'MMC Historical Joker', { name: 'Historical Joker', text: ['If scored cards have the same', '{C:attention}ranks{} and {C:attention}order{} as previous', 'hand, reduce blind requirement', 'by previous hands {C:chips}Chips{}. Caps at', "{C:attention}#1#%{} of current blind's Chips", grassy] },
  { config: { extra: { prev_cards: [], current_cards: [], current_chips: 0, percentage: 25 } }, rarity: 3, cost: 9, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).percentage],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.before && !ctx.blueprint) for (const v of ctx.full_hand) e.current_cards.push(v.base.id);
      if (ctx.mmc_scored_chips !== undefined && !ctx.blueprint) {
        e.current_chips = Math.ceil(Math.min(G.GAME.blind.chips * e.percentage / 100, ctx.mmc_scored_chips));
      }
      if (endCtx(ctx) && e.prev_cards.join('') === e.current_cards.join('')) { // tables_equal: table.concat(a) == table.concat(b)
        say(card, lv('a_chips', e.current_chips), 'CHIPS');
        lower_blind(e.current_chips);
      }
      if (afterJ(ctx) && !ctx.blueprint) { e.prev_cards = e.current_cards.slice(); e.current_cards = []; }
    },
  });

def('suit_alley', 'MMC Suit Alley', { name: 'Suit Alley', text: ['{C:diamonds}Diamond{} and {C:clubs}Club{} cards', 'gain {C:chips}+#1#{} Chips when scored', '{C:hearts}Heart{} and {C:spades}Spade{} cards', 'gain {C:mult}+#2#{} Mult when scored'] },
  { config: { extra: { mult: 3, chips: 12 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).chips, ex(c).mult],
    calculate(card, ctx) {
      if (ctx.cardarea === G.play && ctx.individual && !ctx.repetition) {
        const oc = ctx.other_card;
        const chips = (oc.is_suit('Diamonds') || oc.is_suit('Clubs')) ? ex(card).chips : 0;
        const mult = (oc.is_suit('Hearts') || oc.is_suit('Spades')) ? ex(card).mult : 0;
        if (mult > 0 && chips > 0) return { chips, mult, card };
        if (chips > 0) return { chips, card };
        if (mult > 0) return { mult, card };
      }
    },
  });

def('printer', 'MMC The Printer', { name: 'The Printer', text: ['If hand scores more than', "blind's Chips, {C:attention}duplicate{}", 'played cards'] },
  { config: { extra: { hand: [] } }, rarity: 3, cost: 9, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.before) for (const v of ctx.full_hand) e.hand.push(v.sort_id);
      if (ctx.mmc_scored_chips !== undefined) {
        if (ctx.mmc_scored_chips >= G.GAME.blind.chips) {
          for (const id of e.hand) {
            const v = byId(id);
            if (!v) continue;
            G.playing_card = (G.playing_card || 0) + 1; // (the Lua reused the last number)
            const _card = copy_card(v, null, null, G.playing_card);
            _card.add_to_deck();
            G.deck.config.card_limit += 1;
            G.playing_cards.push(_card);
            G.deck.emplace(_card);
            G.E_MANAGER.add_event(() => _card.start_materialize());
            say(card, localize('k_copied_ex'), 'CHIPS', { card, playing_cards_created: [true] });
          }
        }
        e.hand = [];
      }
    },
  });

def('training_wheels', 'MMC Training Wheels', { name: 'Training Wheels', text: ['{X:mult,C:white}X#1#{} Mult, gains {X:mult,C:white}X#2#{}', 'Mult per {C:attention}#4# cards{} scored', '{C:inactive}Currently {C:attention}#3# {C:inactive}cards scored', grassy] },
  { config: { extra: { current_Xmult: 1, Xmult_mod: 0.1, card_count: 0, req: 10 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_Xmult, ex(c).Xmult_mod, ex(c).card_count, ex(c).req],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.individual && ctx.cardarea === G.play && !ctx.blueprint) {
        e.card_count += 1;
        if (e.card_count >= 10) { // (the Lua's literal 10, not `req`)
          e.card_count = 0;
          e.current_Xmult += e.Xmult_mod;
          say(card, lv('a_xmult', e.current_Xmult), 'MULT');
        }
      }
      if (endCtx(ctx) && e.current_Xmult > 1) return { message: lv('a_xmult', e.current_Xmult), Xmult_mod: e.current_Xmult, card };
    },
  });

def('horseshoe', 'MMC Horseshoe', { name: 'Horseshoe', text: ['Retrigger all', 'scored {C:attention}Lucky{} cards', grassy] },
  { config: { extra: 1 }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (ctx.repetition && ctx.cardarea === G.play && ctx.other_card.ability.effect === 'Lucky Card') return { message: localize('k_again_ex'), repetitions: card.ability.extra, card };
    },
  });

def('incomplete', 'MMC Incomplete Joker', { name: 'Incomplete Joker', text: ['{C:chips}+#1#{} Chips if played', 'hand contains', '{C:attention}#2#{} or fewer cards'] },
  { config: { extra: { chips: 100, req: 3 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).chips, ex(c).req],
    calculate(card, ctx) {
      if (endCtx(ctx) && ctx.full_hand && ctx.full_hand.length <= ex(card).req) return { message: lv('a_chips', ex(card).chips), chip_mod: ex(card).chips };
    },
  });

def('abbey_road', 'MMC Abbey Road', { name: 'Abbey Road', text: ['If at least {C:attention}#2#{} poker hands', 'have been played the same', 'amount of times, give {X:mult,C:white}X#1#{} Mult', grassy] },
  { config: { extra: { Xmult: 4, req: 5, hand_equal_count: {}, should_trigger: false } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).Xmult, ex(c).req],
    calculate(card, ctx) {
      const e = ex(card);
      if (afterJ(ctx) && !ctx.blueprint) {
        e.should_trigger = false;
        e.hand_equal_count = {};
        for (const v of G.handlist) {
          const p = G.GAME.hands[v].played;
          if (p > 0) e.hand_equal_count[p] = (e.hand_equal_count[p] || 0) + 1;
        }
        for (const v of Object.values(e.hand_equal_count)) if (v >= e.req) e.should_trigger = true;
      }
      if (endCtx(ctx) && e.should_trigger) return { message: lv('a_xmult', e.Xmult), Xmult_mod: e.Xmult, card };
    },
  });

def('fishing_license', 'MMC Fishing License', { name: 'Fishing License', text: ['{C:attention}Copies{} effects of all', 'scored {C:attention}Enhanced{} cards', grassy] },
  { config: {}, rarity: 3, cost: 8, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (ctx.individual && ctx.cardarea === G.play) {
        const oc = ctx.other_card, eff = oc.ability.effect;
        if (eff === 'Bonus Card' || eff === 'Stone Card') return { message: lv('a_chips', oc.ability.bonus), chips: oc.ability.bonus, card };
        if (eff === 'Mult Card') return { message: lv('a_mult', oc.ability.mult), mult: oc.ability.mult, card };
        // fix 8: `x_mult` (the Lua's `Xmult` key is not read per card)
        if (eff === 'Glass Card') return { message: lv('a_xmult', oc.ability.x_mult), x_mult: oc.ability.x_mult, card };
        if (eff === 'Lucky Card') {
          if (pseudorandom('lucky_money') < prob() / 15) {
            ease_dollars(oc.ability.p_dollars);
            say(card, localize('$') + oc.ability.p_dollars, 'MONEY', { dollars: oc.ability.p_dollars });
          }
          if (pseudorandom('lucky_mult') < prob() / 5) return { message: lv('a_mult', oc.ability.mult), mult: oc.ability.mult, card };
        }
      }
    },
  });

def('gold_bar', 'MMC Gold Bar', { name: 'Gold Bar', text: ['Earn {C:money}$#1#{} for every', '{C:attention}Gold Seal{} and {C:attention}Gold card{}', 'at end of round', grassy] },
  { config: { extra: { dollars: 2 } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).dollars],
    calculate(card, ctx) {
      if (eor(ctx)) {
        let tally = 0;
        for (const v of G.playing_cards) { if (v.ability.name === 'Gold Card') tally++; if (v.seal === 'Gold') tally++; }
        if (tally > 0) {
          ease_dollars(tally * ex(card).dollars);
          return { message: localize('$') + tally * ex(card).dollars, colour: 'MONEY' };
        }
      }
    },
  });

def('rigged', 'MMC Rigged Joker', { name: 'Rigged Joker', text: ['Once per hand, add {C:attention}+#1#{} to all', 'listed {C:green,E:1,S:1.1}probabilities{} whenever a', '{C:attention}Lucky{} card does not trigger', 'Resets every round'] },
  { config: { extra: { probability: 0, increase: 1, has_triggered: false } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).increase],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.ability.effect === 'Lucky Card' && !ctx.blueprint) {
        if (!ctx.other_card.lucky_trigger && !e.has_triggered) e.has_triggered = true;
      }
      if (endCtx(ctx)) {
        if (e.has_triggered) {
          say(card, localize('k_mmc_luck'), 'GREEN');
          e.probability += e.increase;
          for (const k of Object.keys(G.GAME.probabilities)) G.GAME.probabilities[k] += e.increase;
        }
        e.has_triggered = false;
      }
      if (eor(ctx) && e.probability > 0) {
        for (const k of Object.keys(G.GAME.probabilities)) G.GAME.probabilities[k] -= e.probability;
        e.probability = 0;
        say(card, localize('k_reset'));
      }
    },
    remove(card) {
      const e = ex(card);
      if (e.probability > 0) {
        for (const k of Object.keys(G.GAME.probabilities)) G.GAME.probabilities[k] -= e.probability;
        e.probability = 0;
      }
    },
  });

def('commander', 'MMC The Commander', { name: 'The Commander', text: ['If {C:attention}first hand{} of round', 'has only {C:attention}#1#{} card, give it a', 'random {C:attention}Enhancement{}, {C:attention}Seal', 'and {C:attention}Edition'] },
  { config: { extra: { req: 1 } }, rarity: 3, cost: 9, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).req],
    calculate(card, ctx) {
      if (ctx.first_hand_drawn) juice_card_until(card, () => G.GAME.current_round.hands_played === 0, true);
      if (G.GAME.current_round.hands_played === 0 && ctx.before && ctx.full_hand.length === ex(card).req) {
        for (const pc of ctx.full_hand) {
          G.E_MANAGER.add_event(() => {
            pc.juice_up();
            if (!pc.seal) pc.set_seal(pseudorandom_element(SEALS, pseudoseed('commander'))[0], null, true); // fix 9
            if (!pc.edition) pc.set_edition(poll_edition('commander', null, true, true));
          });
          if (pc.ability.effect === 'Base') pc.set_ability(pseudorandom_element(ENHANCEMENTS(), pseudoseed('commander'))[0], null, true);
          say(card, localize('k_upgrade_ex'));
        }
      }
    },
  });

def('blue_moon', 'MMC Blue Moon', { name: 'Blue Moon', text: ['If {C:attention}#1# Lucky cards{} trigger', 'in one hand, create a', 'random {C:dark_edition}negative{} Joker', grassy] },
  { config: { extra: { req: 3, lucky_tally: 0 } }, rarity: 2, cost: 8, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).req],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.individual && ctx.cardarea === G.play && !ctx.blueprint) for (const v of ctx.full_hand) if (v.lucky_trigger) e.lucky_tally += 1;
      if (endCtx(ctx)) {
        if (e.lucky_tally >= e.req) {
          G.E_MANAGER.add_event(() => {
            const nc = create_card('Joker', G.jokers, null, null, null, null, null, 'blue_moon');
            nc.set_edition({ negative: true });
            nc.add_to_deck();
            G.jokers.emplace(nc);
            nc.start_materialize();
          });
          return { message: localize('k_plus_joker'), colour: 'BLUE' };
        }
        return { message: localize('k_nope_ex'), colour: 'Tarot' };
      }
      if (afterJ(ctx) && !ctx.blueprint) e.lucky_tally = 0;
    },
  });

def('dagonet', 'MMC Dagonet', { name: 'Dagonet', text: ['{C:attention}Doubles{} all base values', 'on other Jokers', '{C:inactive}(If possible)'] },
  { config: { extra: { _mult: 2, _base: 2, triggered: false } }, rarity: 4, cost: 20, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (!ctx.repetition || ctx.individual) {
        const e = ex(card);
        let other_trigger = false;
        e.triggered = false;
        e._mult = e._base;
        for (const v of find_joker('MMC Dagonet')) {
          if (v !== card) { if (v.ability.extra.triggered) other_trigger = true; e._mult *= 2; }
        }
        if (!other_trigger) {
          e.triggered = true;
          for (const v of G.jokers.cards) {
            if (v === card || DAGONET_BLACKLIST.has(v.ability.name)) continue;
            for (const [k2, v2] of Object.entries(v.ability)) increase_attributes(k2, v2, v.ability, e._mult);
          }
        }
      }
    },
    remove(card) {
      for (const v of G.jokers.cards) {
        if (v === card) continue;
        if (v.ability.name === 'MMC Dagonet' && v.ability.extra._mult !== 2) v.ability.extra._mult /= 2;
        for (const [k2, v2] of Object.entries(v.ability)) increase_attributes(k2, v2, v.ability, ex(card)._mult / 2);
      }
    },
  });

def('glue', 'MMC Glue', { name: 'Glue', text: ['If you have both {C:attention}Half', 'and {C:attention}Incomplete Joker{}, give', '{C:dark_edition}+#2#{} Joker slots and {X:mult,C:white}X#1#{} Mult', grassy] },
  { config: { extra: { Xmult: 5, j_slots: 2, half: false, incomplete: false, triggered: false } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).Xmult, ex(c).j_slots],
    calculate(card, ctx) {
      if (endCtx(ctx) && ex(card).half && ex(card).incomplete) return { message: lv('a_xmult', ex(card).Xmult), Xmult_mod: ex(card).Xmult };
    },
    add(card) { glue_refresh(card); },
    remove(card) {
      const e = ex(card);
      if (e.triggered) { e.triggered = false; G.jokers.config.card_limit -= e.j_slots; }
    },
  });

def('harp_seal', 'MMC Harp Seal', { name: 'Harp Seal', text: ['{C:attention}Doubles{} the effect', 'of all {C:attention}Seals', grassy] },
  { config: {}, rarity: 2, cost: 6, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      const oc = ctx.other_card;
      // fix 2: the extra $3 is paid once (by evaluate_play, from `dollars`)
      if (ctx.individual && ctx.cardarea === G.play && !ctx.repetition && oc.seal === 'Gold' && !oc.debuff) return { message: localize('$') + 3, dollars: 3, colour: 'MONEY', card };
      if (ctx.repetition && ctx.cardarea === G.play && oc.seal === 'Red' && !oc.debuff) return { message: localize('k_again_ex'), repetitions: 1, card };
      if (ctx.repetition && ctx.cardarea === G.hand && oc.seal === 'Red' && !oc.debuff &&
          ((ctx.card_effects[0] && Object.keys(ctx.card_effects[0]).length) || ctx.card_effects.length > 1)) return { message: localize('k_again_ex'), repetitions: 1, card };
      if (ctx.discard && oc.seal === 'Purple' && !oc.debuff) create_tarot(card, 'harp_seal');
    },
  });

def('football_card', 'MMC Football Card', { name: 'Football Card', text: ['{C:blue}Common{} Jokers', 'each give {C:chips}+#1#{} Chips'] },
  { config: { extra: { chips: 50 } }, rarity: 2, cost: 7, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).chips],
    calculate(card, ctx) {
      if (ctx.other_joker && ctx.other_joker !== card && ctx.other_joker.config.center.rarity === 1) {
        const oj = ctx.other_joker;
        G.E_MANAGER.add_event(() => oj.juice_up());
        return { message: lv('a_chips', ex(card).chips), chip_mod: ex(card).chips };
      }
    },
  });

function special_values(e) {
  let m = 0, c = 0, x = 1;
  for (const v of G.playing_cards || []) {
    if (v.seal) m += e.mult_mod;
    if (v.ability.set === 'Enhanced') c += e.chip_mod;
    if (v.edition) x += e.Xmult_mod;
  }
  return [m, c, x];
}
def('special_edition', 'MMC Special Edition Joker', { name: 'Special Edition Joker', text: ['Gains {C:mult}+#2#{} Mult per {C:attention}Seal{}, {C:chips}+#4#{}', 'Chips per {C:attention}Enhancement{} and {X:mult,C:white}X#6#{} Mult', 'per {C:attention}Edition{} for every card in deck', '{C:inactive}(Currently {C:mult}+#1#{C:inactive} Mult, {C:chips}+#3#{C:inactive}, Chips and {X:mult,C:white}X#5#{C:inactive} Mult)'] },
  { config: { extra: { current_mult: 0, mult_mod: 2, current_chips: 0, chip_mod: 10, current_Xmult: 1, Xmult_mod: 0.1, base: 0 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => {
      const e = ex(c);
      const [m, ch, x] = c.fake ? [e.current_mult, e.current_chips, e.current_Xmult] : special_values(e);
      return [m, e.mult_mod, ch, e.chip_mod, x, e.Xmult_mod];
    },
    update(card) { const e = ex(card); [e.current_mult, e.current_chips, e.current_Xmult] = special_values(e); },
    calculate(card, ctx) {
      const e = ex(card);
      if (endCtx(ctx) && (e.current_mult > 0 || e.current_chips > 0 || e.current_Xmult > 1)) {
        return { mult_mod: e.current_mult, chip_mod: e.current_chips, Xmult_mod: e.current_Xmult, message: localize('k_mmc_bonus'), card };
      }
    },
  });

def('stockpiler', 'MMC The Stockpiler', { name: 'The Stockpiler', text: ['{C:attention}+#2#{} hand size for every #4#', 'cards in deck above {C:attention}#3#{}', 'Caps at the current Ante', '{C:inactive}(Currently {C:attention}+#1#{C:inactive} hand size)'] },
  { config: { extra: { current_h_size: 0, h_mod: 1, base: 52, every: 4 } }, rarity: 1, cost: 4, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_h_size, ex(c).h_mod, ex(c).base, ex(c).every],
    calculate(card, ctx) {
      if (!ctx.repetition || ctx.individual) {
        const e = ex(card);
        const extra_cards = G.playing_cards.length - e.base;
        if (extra_cards > 0) {
          const bonus = Math.min(Math.floor(extra_cards / e.every) * e.h_mod, G.GAME.round_resets.ante);
          if (bonus !== e.current_h_size) { G.hand.change_size(bonus - e.current_h_size); e.current_h_size = bonus; }
        } else if (e.current_h_size > 0) {
          G.hand.change_size(-e.current_h_size);
          e.current_h_size = 0;
        }
      }
    },
    remove(card) { G.hand.change_size(-ex(card).current_h_size); },
  });

def('student_loans', 'MMC Student Loans', { name: 'Student Loans', text: ['Go up to {C:red}-$#1#{} in debt', 'Gives -#4# {C:red}discard{}', 'for every {C:red}-$#2#{} in debt', '{C:inactive}(Currently {C:attention}#3#{C:inactive} discards)'] },
  { config: { extra: { negative_bal: 100, every: 25, discards: 0, discard_sub: 1 } }, rarity: 2, cost: 4, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).negative_bal, ex(c).every, ex(c).discards, ex(c).discard_sub],
    update(card) {
      if (!card.added_to_deck) return;
      const e = ex(card);
      const bal = G.GAME.dollars;
      if (bal < 0) {
        let debuffs = Math.floor(bal / e.every) * e.discard_sub;
        if (debuffs !== e.discards) {
          debuffs -= e.discards;
          ease_discard(debuffs);
          G.GAME.round_resets.discards += debuffs;
          e.discards += debuffs;
        }
      } else if (e.discards !== 0) {
        // fix 5: give back every discard taken (the Lua: always 1)
        ease_discard(-e.discards);
        G.GAME.round_resets.discards -= e.discards;
        e.discards = 0;
      }
    },
    add(card) { G.GAME.bankrupt_at -= ex(card).negative_bal; },
    remove(card) {
      const e = ex(card);
      G.GAME.bankrupt_at += e.negative_bal;
      ease_discard(-e.discards);
      G.GAME.round_resets.discards -= e.discards;
    },
  });

function broke_update(card, valueKey, modKey, vkey) {
  const e = ex(card);
  const bal = G.GAME.dollars;
  let nv = 0;
  if (bal < 0) nv = -1 * Math.ceil(bal / e.every) * e[modKey];
  if (e[valueKey] !== nv && (bal < 0 || e[valueKey] !== 0)) {
    e[valueKey] = nv;
    G.E_MANAGER.add_event(() => { if (card.added_to_deck) say(card, lv(vkey, e[valueKey]), vkey === 'a_mult' ? 'MULT' : 'CHIPS'); });
  }
}
def('broke', 'MMC Broke Joker', { name: 'Broke Joker', text: ['Gains {C:mult}+#1#{} Mult', 'per {C:red}-$#3#', '{C:inactive}(Currently {C:mult}#2#{C:inactive} Mult)'] },
  { config: { extra: { current_mult: 0, mult_mod: 1, every: 2 } }, rarity: 1, cost: 2, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).mult_mod, ex(c).current_mult, ex(c).every],
    update(card) { broke_update(card, 'current_mult', 'mult_mod', 'a_mult'); },
    calculate(card, ctx) {
      if (endCtx(ctx) && ex(card).current_mult > 0) return { message: lv('a_mult', ex(card).current_mult), mult_mod: ex(card).current_mult, card };
    },
  });
def('go_for_broke', 'MMC Go For Broke', { name: 'Go For Broke', text: ['Gains {C:chips}+#1#{} Chips', 'per {C:red}-$#3#', '{C:inactive}(Currently {C:chips}#2#{C:inactive} Chips)'] },
  { config: { extra: { current_chips: 0, every: 1, chip_mod: 4 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).chip_mod, ex(c).current_chips, ex(c).every],
    update(card) { broke_update(card, 'current_chips', 'chip_mod', 'a_chips'); },
    calculate(card, ctx) {
      if (endCtx(ctx) && ex(card).current_chips > 0) return { message: lv('a_chips', ex(card).current_chips), chip_mod: ex(card).current_chips, card };
    },
  });

def('street_fighter', 'MMC Street Fighter', { name: 'Street Fighter', text: ['Gives {X:mult,C:white}X#1#{} Mult', 'when balance is', 'at or below {C:red}-$#2#'] },
  { config: { extra: { Xmult: 4, req: 20 } }, rarity: 2, cost: 7, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).Xmult, ex(c).req],
    calculate(card, ctx) {
      if (endCtx(ctx) && G.GAME.dollars <= -1 * ex(card).req) return { message: lv('a_xmult', ex(card).Xmult), Xmult_mod: ex(card).Xmult };
    },
  });

const visibleHands = (except) => Object.keys(G.GAME.hands).filter((k) => G.GAME.hands[k].visible && k !== except);
def('checklist', 'MMC Checklist', { name: 'Checklist', text: ['Playing {C:attention}#1#{} upgrades', 'it by #2# level,', 'poker hand changes', 'at end of round'] },
  { config: { extra: { poker_hand: 'High Card', increase: 1 } }, rarity: 2, cost: 7, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [localize(ex(c).poker_hand, 'poker_hands'), ex(c).increase],
    set_ability(card) {
      if (!G.GAME || !G.GAME.hands || !card.ability.extra) return;
      const hands = visibleHands();
      const old = card.ability.extra.poker_hand;
      card.ability.extra.poker_hand = undefined;
      let guard = 0;
      while (!card.ability.extra.poker_hand && guard++ < 100) {
        card.ability.extra.poker_hand = pseudorandom_element(hands, pseudoseed('checklist'))[0];
        if (card.ability.extra.poker_hand === old) card.ability.extra.poker_hand = undefined;
      }
      if (!card.ability.extra.poker_hand) card.ability.extra.poker_hand = old;
    },
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.before && ctx.scoring_name === e.poker_hand) {
        say(card, localize('k_upgrade_ex'));
        level_up_hand(card, ctx.scoring_name, false, e.increase);
      }
      if (eor(ctx) && !ctx.blueprint) {
        e.poker_hand = pseudorandom_element(visibleHands(e.poker_hand), pseudoseed('checklist'))[0];
        return { message: localize('k_reset') };
      }
    },
  });

def('one_of_us', 'MMC One Of Us', { name: 'One Of Us', text: ['If played hand', 'contains {C:attention}#1# Enhanced cards,', 'give a random Joker', 'a random {C:attention}Edition'] },
  { config: { extra: { req: 5 } }, rarity: 2, cost: 6, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).req],
    calculate(card, ctx) {
      if (endCtx(ctx) && ctx.full_hand) {
        const enhanced = ctx.full_hand.filter((v) => v.ability.set === 'Enhanced').length;
        if (enhanced >= ex(card).req) {
          const editionless = G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !v.edition);
          if (editionless.length) {
            const joker = pseudorandom_element(editionless, pseudoseed('one_of_us'))[0];
            const edition = poll_edition('one_of_us', null, false, true);
            G.E_MANAGER.add_event(() => { joker.juice_up(); joker.set_edition(edition, true); });
            return { message: localize('k_upgrade_ex'), colour: 'Tarot' };
          }
        }
      }
    },
  });

def('investor', 'MMC The Investor', { name: 'The Investor', text: ['Gives {C:money}$#1#{} at end of', 'round. {C:green}#3# in #2#{} chance to', 'give {C:red}-$#1#{} instead'] },
  { config: { extra: { dollars: 5, odds: 4 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).dollars, ex(c).odds, '' + prob()],
    calculate(card, ctx) {
      if (eor(ctx)) {
        let dollars = ex(card).dollars;
        if (pseudorandom('investor') < prob() / ex(card).odds) dollars = -dollars;
        ease_dollars(dollars);
        return { message: localize('$') + dollars, colour: 'MONEY' };
      }
    },
  });

def('mountain_climber', 'MMC Mountain Climber', { name: 'Mountain Climber', text: ['Every played {C:attention}card{}', 'permanently gains', '{C:mult}+#1#{} Mult when scored'] },
  { config: { extra: { mult: 1 } }, rarity: 2, cost: 7, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).mult],
    calculate(card, ctx) {
      if (ctx.individual && ctx.cardarea === G.play) {
        ctx.other_card.ability.perma_mult = (ctx.other_card.ability.perma_mult || 0) + ex(card).mult;
        say(card, localize('k_upgrade_ex'), 'MULT');
      }
    },
  });

def('shackles', 'MMC Shackles', { name: 'Shackles', text: ['{C:blue}+#1#{} hand, {C:red}+#2#{} discard,', '{C:attention}+#3#{} hand size. Destroyed', 'if you play more than', '{C:attention}#4#{} cards in one hand'] },
  { config: { extra: { _hand_add: 1, _h_size: 1, _discards: 1, req: 4 } }, rarity: 1, cost: 5, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c)._hand_add, ex(c)._discards, ex(c)._h_size, ex(c).req],
    calculate(card, ctx) {
      if (endCtx(ctx) && ctx.full_hand && ctx.full_hand.length > ex(card).req) dissolve(card);
    },
    add(card) {
      const e = ex(card);
      ease_hands_played(e._hand_add);
      G.GAME.round_resets.hands += e._hand_add;
      ease_discard(e._discards);
      G.GAME.round_resets.discards += e._discards;
      G.hand.change_size(e._h_size);
    },
    remove(card) {
      const e = ex(card);
      ease_hands_played(-e._hand_add);
      G.GAME.round_resets.hands -= e._hand_add;
      ease_discard(-e._discards);
      G.GAME.round_resets.discards -= e._discards;
      G.hand.change_size(-e._h_size);
    },
  });

function bogo_extra(self, set, seed) {
  G.E_MANAGER.add_event(() => {
    if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
      if (set !== 'Planet') play_sound('timpani');
      const c = create_card(set, G.consumeables, null, null, null, null, null, seed);
      c.add_to_deck();
      G.consumeables.emplace(c);
      say(self, localize(set === 'Tarot' ? 'k_plus_tarot' : set === 'Spectral' ? 'k_plus_spectral' : 'k_plus_planet'), set);
    } else say(self, localize('k_no_space_ex'));
  });
}
def('buy_one_get_one', 'MMC Buy One Get One', { name: 'Buy One Get One', text: ['{C:green}#2# in #1#{} chance to', 'get a random {C:attention}extra card{}', "of whatever you're buying", '{C:inactive}(Must have room)'] },
  { config: { extra: { odds: 4 } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).odds, '' + prob()],
    calculate(card, ctx) {
      if (!ctx.buying_card) return;
      if (pseudorandom('buy_one_get_one') < prob() / ex(card).odds) {
        const set = ctx.card.ability.set;
        if (set === 'Joker') {
          G.E_MANAGER.add_event(() => {
            if (G.jokers.cards.length < G.jokers.config.card_limit) {
              const c = create_card('Joker', G.jokers, null, null, null, null, null, 'buy_one_get_one');
              c.add_to_deck();
              G.jokers.emplace(c);
              c.start_materialize();
              say(card, localize('k_plus_joker'), 'BLUE');
            } else say(card, localize('k_no_space_ex'));
          });
        } else if (set === 'Tarot' || set === 'Spectral' || set === 'Planet') {
          bogo_extra(card, set, 'buy_one_get_one');
        } else if (set === 'Default') {
          G.E_MANAGER.add_event(() => {
            const _card = create_playing_card({ front: pseudorandom_element(P_CARDS_LIST(), pseudoseed('buy_one_get_one'))[0], center: P_CENTERS.c_base }, G.deck);
            _card.add_to_deck();
            G.deck.config.card_limit += 1;
            say(card, localize('k_mmc_plus_card'), 'BLUE');
          });
        }
      } else say(card, localize('k_nope_ex'), 'Tarot');
    },
  });

def('pack_a_punch', 'MMC Pack A Punch', { name: 'Pack A Punch', text: ['When {C:attention}Blind{} is selected,', 'lose {C:money}$#1#{} and give the', '{C:attention}left-most{} Joker', 'a random {C:attention}Edition', '{C:inactive}(Will replace current edition)'] },
  { config: { extra: { dollars: 20 } }, rarity: 3, cost: 10, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).dollars],
    calculate(card, ctx) {
      if (ctx.setting_blind && !card.getting_sliced) {
        const joker = G.jokers.cards[0];
        if (joker) {
          ease_dollars(-ex(card).dollars);
          const edition = poll_edition('pack_a_punch', null, false, true);
          G.E_MANAGER.add_event(() => {
            joker.juice_up();
            if (joker.edition && joker.edition.negative) G.jokers.config.card_limit -= 1;
            joker.set_edition(edition, true);
            say(card, localize('k_upgrade_ex'));
            if (G.jokers.config.card_limit < G.jokers.cards.length) dissolve(card);
          });
          return { message: localize('k_upgrade_ex'), colour: 'Tarot' };
        }
      }
    },
  });

def('seal_steal', 'MMC Seal Steal', { name: 'Seal Steal', text: ['Played {C:purple}Purple{} and', '{C:blue}Blue{} Seals trigger', 'when {C:attention}scored'] },
  { config: {}, rarity: 1, cost: 5, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (!(ctx.individual && ctx.cardarea === G.play)) return;
      const oc = ctx.other_card;
      if (oc.seal === 'Purple' && !oc.debuff) {
        const harp = find_joker('MMC Harp Seal')[0];
        create_tarot(card, 'seal_steal');
        if (harp) { say(harp, localize('k_again_ex')); create_tarot(card, 'seal_steal'); }
      } else if (oc.seal === 'Blue' && !oc.debuff) {
        let harp, aurora;
        for (const v of G.jokers.cards) {
          if (v.ability.name === 'MMC Harp Seal') harp = v;
          else if (v.ability.name === 'MMC Aurora Borealis') aurora = v;
        }
        create_planet(card, 'seal_steal');
        if (aurora) create_planet(aurora, 'seal_steal', { negative: true }, card);
        if (harp) {
          say(harp, localize('k_again_ex'));
          create_planet(card, 'seal_steal');
          if (aurora) create_planet(aurora, 'seal_steal', { negative: true }, card);
        }
      }
    },
  });

def('tax_collector', 'MMC Tax Collector', { name: 'Tax Collector', text: ['Gives {C:green}$#1#{}, {C:red}$#2#{} or {C:legendary}$#3#', 'per Joker with the', 'respective {C:attention}rarity', 'at end of round'] },
  { config: { extra: { dollars: 1 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).dollars, ex(c).dollars * 2, ex(c).dollars * 4],
    calculate(card, ctx) {
      if (!eor(ctx)) return;
      for (const v of G.jokers.cards) {
        const r = v.config.center.rarity;
        if (v !== card && typeof r === 'number' && r > 1) {
          G.E_MANAGER.add_event(() => {
            let dollars = ex(card).dollars * (r - 1);
            if (r === 4) dollars += 1;
            ease_dollars(dollars, true);
            card_eval_status_text(v, 'extra', null, null, null, { message: localize('$') + dollars, dollars, colour: 'MONEY', instant: true });
            v.juice_up(); card.juice_up();
          });
        }
      }
    },
  });

def('glass_cannon', 'MMC Glass Cannon', { name: 'Glass Cannon', text: ['{C:attention}Retrigger{} all {C:attention}Glass', '{C:attention}Cards{}, but they are', '{C:red}guaranteed{} to break'] },
  { config: { extra: { repetitions: 1, trash_list: [] } }, rarity: 2, cost: 7, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (ctx.repetition && ctx.cardarea === G.play && ctx.other_card.ability.effect === 'Glass Card') return { message: localize('k_again_ex'), repetitions: ex(card).repetitions, card };
      if (ctx.individual && ctx.cardarea === G.play && !ctx.repetition && ctx.other_card.ability.effect === 'Glass Card') ctx.other_card.mmc_played = true;
      if (endCtx(ctx) && ctx.full_hand) {
        for (const v of ctx.full_hand) {
          if (v.mmc_played) {
            G.E_MANAGER.add_event(() => {
              if (v.removed) return;
              card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_mmc_destroy'), colour: 'RED', instant: true });
              v.shatter();
            });
          }
        }
      }
      // (the Lua's end-of-round trash_list sweep only re-dissolved already-removed cards: nothing to do)
    },
  });

def('scoring_test', 'MMC Scoring Test', { name: 'Scoring Test', text: ['If played hand', 'scores less than {C:attention}#1#%', 'of blind requirement', '{C:red}destroy{} it'] },
  { config: { extra: { percentage: 1, played_hand: [], trash_list: [] } }, rarity: 2, cost: 6, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).percentage],
    calculate(card, ctx) {
      const e = ex(card);
      // fix 7: a debuffed hand (no joker_main) is recorded too
      if ((endCtx(ctx) || ctx.debuffed_hand) && ctx.full_hand) e.played_hand = ctx.full_hand.map((v) => v.sort_id);
      if (ctx.mmc_scored_chips !== undefined) {
        if (ctx.mmc_scored_chips < G.GAME.blind.chips * e.percentage / 100) {
          for (const id of e.played_hand) {
            const v = byId(id);
            if (!v) continue;
            G.E_MANAGER.add_event(() => {
              if (v.removed) return;
              card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_mmc_destroy'), colour: 'RED', instant: true });
              v.start_dissolve();
            });
          }
        }
        e.played_hand = [];
      }
    },
  });

def('cicero', 'MMC Cicero', { name: 'Cicero', text: ['Jokers that do not', 'give {C:mult}Mult{}, {C:chips}Chips{} or', '{C:attention}retriggers{} will be', '{C:dark_edition}negative{} in the shop'] },
  { config: {}, rarity: 4, cost: 20, blueprint_compat: false, eternal_compat: true }, { loc_vars: () => [] });

def('dawn', 'MMC Dawn', { name: 'Dawn', text: ['Retrigger all played', 'cards in {C:attention}first', '{C:attention}hand{} of round'] },
  { config: { extra: { repetitions: 1 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (ctx.repetition && ctx.cardarea === G.play && ctx.other_card && G.GAME.current_round.hands_played === 0) return { message: localize('k_again_ex'), repetitions: ex(card).repetitions, card };
    },
  });

def('savings', 'MMC Savings', { name: 'Savings', text: ['{C:mult}+#1#{} Mult per round', 'Resets when', 'buying a {C:attention}card', '{C:inactive}(Currently {C:mult}+#2#{C:inactive} Mult)'] },
  { config: { extra: { mult_mod: 5, current_mult: 0 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).mult_mod, ex(c).current_mult],
    calculate(card, ctx) {
      const e = ex(card);
      if (ctx.buying_card && !ctx.blueprint && e.current_mult !== 0) { e.current_mult = 0; say(card, localize('k_reset')); }
      if (endCtx(ctx) && e.current_mult > 0) return { message: lv('a_mult', e.current_mult), mult_mod: e.current_mult, card };
      if (eor(ctx) && !ctx.blueprint) {
        e.current_mult += e.mult_mod;
        return { message: lv('a_mult', e.mult_mod), colour: 'RED', card };
      }
    },
  });

def('monopolist', 'MMC Monopolist', { name: 'Monopolist', text: ['{X:mult,C:white}X#1#{} Mult, gains', '{X:mult,C:white}X#2#{} Mult at {C:money}$#3#{},', 'requirement doubles', 'when met'] },
  { config: { extra: { current_Xmult: 1, _Xmult_mod: 0.5, _req: 10, _base: 10 } }, rarity: 3, cost: 10, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).current_Xmult, ex(c)._Xmult_mod, ex(c)._req],
    // Card.update runs every frame in the Lua: one step per frame until it settles. Here it runs
    // on every money change / calculate, so it takes all the steps the frames would have taken.
    update(card) {
      const e = ex(card);
      for (let guard = 0; guard < 64; guard++) {
        const bal = G.GAME.dollars;
        if (bal >= e._req) {
          e.current_Xmult += e._Xmult_mod;
          e._req *= 2;
        } else if (e._req !== e._base && bal < e._req / 2) {
          e.current_Xmult -= e._Xmult_mod;
          e._req /= 2;
        } else break;
        const x = e.current_Xmult;
        G.E_MANAGER.add_event(() => { if (card.added_to_deck) say(card, lv('a_xmult', x), 'MULT'); });
      }
    },
    calculate(card, ctx) {
      if (endCtx(ctx) && ex(card).current_Xmult > 1) return { message: lv('a_xmult', ex(card).current_Xmult), Xmult_mod: ex(card).current_Xmult, card };
    },
  });

def('nebula', 'MMC Nebula', { name: 'Nebula', text: ['Adds all {C:attention}poker', '{C:attention}hand{} levels above', '#1# to {C:mult}Mult'] },
  { config: { extra: { req: 1 } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).req],
    calculate(card, ctx) {
      if (endCtx(ctx)) {
        let tally = 0;
        for (const v of G.handlist) { const h = G.GAME.hands[v]; if (h.visible && h.level > ex(card).req) tally += h.level - ex(card).req; }
        if (tally > 0) return { message: lv('a_mult', tally), mult_mod: tally, card };
      }
    },
  });

def('cheapskate', 'MMC Cheapskate', { name: 'Cheapskate', text: ['If a {C:attention}Booster Pack', 'is skipped, earn', "half of it's {C:money}cost"] },
  { config: { extra: { cost: 0 } }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (ctx.open_booster) ex(card).cost = Math.floor(ctx.card.cost / 2);
      if (ctx.skipping_booster) {
        ease_dollars(ex(card).cost);
        say(card, localize('$') + ex(card).cost, 'MONEY', { dollars: ex(card).cost });
      }
    },
  });

def('psychic', 'MMC Psychic Joker', { name: 'Psychic Joker', text: ['{C:chips}+#1#{} Chips, destroyed', 'if you play less', 'than {C:attention}#2#{} cards', 'in one hand'] },
  { config: { extra: { chips: 150, req: 5 } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).chips, ex(c).req],
    calculate(card, ctx) {
      if (endCtx(ctx) && ctx.full_hand) {
        if (ctx.full_hand.length < ex(card).req) dissolve(card);
        else return { message: lv('a_chips', ex(card).chips), chip_mod: ex(card).chips };
      }
    },
  });

def('cheat', 'MMC Cheat', { name: 'Cheat', text: ['Retrigger all cards', 'if played hand', 'contains a {C:attention}Straight{}'] },
  { config: { extra: { repetitions: 1 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true }, {
    loc_vars: () => [],
    calculate(card, ctx) {
      if (ctx.repetition && ctx.cardarea === G.play && ctx.other_card && hasStraight(ctx)) return { message: localize('k_again_ex'), repetitions: ex(card).repetitions, card };
    },
  });

const RANK_CHAR = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
def('plus_one', 'MMC Plus One', { name: 'Plus One', text: ['Increases rank', 'of scored cards by', '{C:attention}#1#{} on the {C:attention}first', '{C:attention}hand{} of round'] },
  { config: { extra: { increase: 1 } }, rarity: 3, cost: 8, blueprint_compat: false, eternal_compat: true }, {
    loc_vars: (c) => [ex(c).increase],
    calculate(card, ctx) {
      if (ctx.individual && ctx.cardarea === G.play && G.GAME.current_round.hands_played === 0) {
        const pc = ctx.other_card;
        G.E_MANAGER.add_event(() => {
          const suit_prefix = pc.base.suit.substring(0, 1) + '_';
          const r = pc.base.id === 14 ? 2 : Math.min(pc.base.id + 1, 14);
          pc.set_base(P_CARDS[suit_prefix + (r < 10 ? String(r) : RANK_CHAR[r])]);
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), instant: true });
        });
      }
    },
  });

// ------------------------------------------------------------- consumables
const C = {
  ace_of_pentacles: {
    set: 'Tarot', name: 'MMC Ace Of Pentacles', cost: 4, config: { extra: { odds: 4 } },
    loc: { name: 'Ace Of Pentacles', text: ['{C:red}#2# in #1#{} chance', 'to set money to', '{C:money}$0{}, otherwise', '{C:attention}double{} your money', grassy] },
    loc_vars: (c) => [ex(c).odds, '' + prob()],
    can_use: () => true,
    use(card) {
      if (pseudorandom('ace_of_pentacles') < prob() / ex(card).odds) {
        G.E_MANAGER.add_event(() => {
          emit('attention', { text: localize('k_nope_ex') });
          play_sound('tarot2', 1, 0.4);
          card.juice_up();
          ease_dollars(-G.GAME.dollars);
        });
      } else ease_dollars(G.GAME.dollars);
    },
  },
  page_of_pentacles: {
    set: 'Tarot', name: 'MMC Page Of Pentacles', cost: 1, config: {},
    loc: { name: 'Page Of Pentacles', text: ['Multiply', 'money by {C:red}-1', grassy] },
    loc_vars: () => [],
    can_use: () => true,
    use() { if (G.GAME.dollars !== 0) ease_dollars(-G.GAME.dollars * 2); },
  },
  incense: {
    set: 'Spectral', name: 'MMC Incense', cost: 4, config: { extra: { dollars: 50, j_slots: 1, increase: 25 } },
    loc: { name: 'Incense', text: ['Add {C:dark_edition}Negative{} to', 'a random {C:attention}Joker{},', '{C:red}-$#1#{}, ignores', 'spending limit', grassy] },
    loc_vars: (c) => [(G.GAME && G.GAME.mmc_incense_cost) || ex(c).dollars, ex(c).j_slots],
    can_use: () => G.jokers.cards.some((v) => v.ability.set === 'Joker' && !v.edition),
    use(card) {
      G.GAME.mmc_incense_cost = G.GAME.mmc_incense_cost || ex(card).dollars;
      const editionless = G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !v.edition);
      if (editionless.length) {
        G.E_MANAGER.add_event(() => {
          const joker = pseudorandom_element(editionless, pseudoseed('incense'))[0];
          ease_dollars(-G.GAME.mmc_incense_cost);
          card.juice_up();
          joker.set_edition({ negative: true }, true);
          G.GAME.mmc_incense_cost += ex(card).increase;
        });
      }
    },
  },
};

// -------------------------------------------------------------------- decks
/** Back.apply_to_run wrap: strip the deck to a rank set and add the matching joker. */
const stripDeck = (keep, joker, size, gold) => () => {
  G.E_MANAGER.add_event(() => {
    for (let i = G.playing_cards.length - 1; i >= 0; i--) {
      const c = G.playing_cards[i];
      if (!keep(c)) c.start_dissolve();
      else if (gold) c.set_ability(P_CENTERS.m_gold);
    }
    add_joker(joker, null, true, false);
    G.GAME.starting_deck_size = size;
  });
};
const D = {
  evenStevenDeck: {
    slug: 'even_steven', name: "Even Steven's Deck", config: { mmc_only_evens: true }, back: 0,
    loc: { name: "Even Steven's Deck", text: ['Start run with only', '{C:attention}even cards{} and', 'the {C:attention}Even Steven{} joker'] },
    apply: stripDeck(is_even, 'j_even_steven', 20),
  },
  oddToddDeck: {
    slug: 'odd_todd', name: "Odd Todd's Deck", config: { mmc_only_odds: true }, back: 0,
    loc: { name: "Odd Todd's Deck", text: ['Start run with only', '{C:attention}odd cards{} and', 'the {C:attention}Odd Todd{} joker'] },
    apply: stripDeck(is_odd, 'j_odd_todd', 20),
  },
  fibonacciDeck: {
    slug: 'fibonacci', name: 'Fibonacci Deck', config: { mmc_only_fibo: true }, back: 0,
    loc: { name: 'Fibonacci Deck', text: ['Start run with only', '{C:attention}Fibonacci cards{} and', 'the {C:attention}Fibonacci{} joker'] },
    apply: stripDeck(is_fibo, 'j_fibonacci', 20),
  },
  primeDeck: {
    slug: 'prime', name: 'Prime Deck', config: { mmc_only_prime: true }, back: 0,
    loc: { name: 'Prime Deck', text: ['Start run with', 'only {C:attention}prime cards{} and', 'the {C:attention}Prime Time{} joker'] },
    apply: stripDeck(is_prime, 'j_mmc_prime_time', 20),
  },
  midasDeck: {
    slug: 'midas', name: "Midas's Deck", config: { mmc_gold: true }, back: 1,
    loc: { name: "Midas's Deck", text: ['Start run with only', '{C:attention}Gold Face cards{} and', 'the {C:attention}Midas Mask{} joker'] },
    apply: stripDeck(is_face, 'j_midas_mask', 12, true),
  },
  jokersForHireDeck: {
    slug: 'jokers_for_hire', name: 'Jokers for Hire', config: { mmc_for_hire: true }, back: 1,
    loc: { name: '"Jokers for Hire" Deck', text: ['All Jokers give {C:dark_edition}+1{}', 'Joker slot. Price of', '{C:attention}Jokers{} and {C:attention}Buffoon Packs', '{C:red}increases{} per Joker'] },
    apply() {
      G.E_MANAGER.add_event(() => {
        G.jokers.config.card_limit = 1;
        G.GAME.starting_params.mmc_for_hire = true;
        G.GAME.mmc_for_hire_counter = 1; // (the Lua's module-level for_hire_counter, kept per run)
      });
    },
  },
  perfectPrecisionDeck: {
    slug: 'perfect_precision', name: 'Perfect Precision', config: { mmc_precision: true, ante_scaling: 1.5, discards: 1, hands: 1, hand_size: 1 }, back: 0,
    loc: { name: 'Perfect Precision Deck', text: ['+1 {C:blue}hands{}, {C:red}discards{} and', '{C:attention}hand size{}. Start with', 'a {C:dark_edition}negative {C:attention}The Sniper{}', 'Joker. Ante scales {C:attention}X1.5{}', 'as fast'] },
    apply() { G.E_MANAGER.add_event(() => add_joker('j_mmc_sniper', 'negative', true, false)); },
  },
};

// ------------------------------------------------------------ registration
const centers = [];
const loc = { descriptions: { Joker: {}, Tarot: {}, Spectral: {}, Back: {}, Other: {} }, misc: { dictionary: {} } };
const options = {};
const OPT_LABEL = {};
const PORTED = [];

for (const [opt, slug] of JOKERS) {
  const j = J[slug];
  if (!j) throw new Error('mikas: joker ' + slug + ' has no definition');
  const key = 'j_' + PRE + '_' + slug;
  const b = j.beh;
  const L = LAYOUT.jokers[slug];
  const c = {
    key, set: 'Joker', name: j.name, rarity: j.rarity, cost: j.cost,
    blueprint_compat: j.blueprint_compat, eternal_compat: j.eternal_compat,
    perishable_compat: false, // (SMODS 0.9.5's Joker:new had no perishable_compat)
    config: JSON.parse(JSON.stringify(j.config)),
    atlas: ATLAS, pos: { ...L.pos }, mod_option: opt,
    loc_vars: (center, iq, card) => ({ vars: b.loc_vars ? b.loc_vars(card) : [] }),
  };
  if (L.soul_pos) c.soul_pos = { ...L.soul_pos };
  if (b.calculate) {
    c.calculate = (center, card, ctx) => {
      // fix 1: a joker the mod marks blueprint-incompatible ignores Blueprint / Brainstorm copies
      if (ctx.blueprint && !center.blueprint_compat) return undefined;
      return b.calculate(card, ctx);
    };
  }
  if (b.update) c.update = (center, card) => b.update(card);
  if (b.add) c.add_to_deck = (center, card) => b.add(card);
  if (b.remove) c.remove_from_deck = (center, card) => b.remove(card);
  if (b.set_ability) c.set_ability = (center, card) => b.set_ability(card);
  centers.push(c);
  loc.descriptions.Joker[key] = j.loc;
  options[opt] = { default: true, label: 'Joker: ' + j.loc.name };
  PORTED.push(key);
}
for (const [opt, slug] of CONSUMABLES) {
  const d = C[slug];
  const key = 'c_' + PRE + '_' + slug;
  centers.push({
    key, set: d.set, name: d.name, cost: d.cost, consumeable: true, config: JSON.parse(JSON.stringify(d.config)),
    atlas: ATLAS, pos: { ...LAYOUT.consumables[slug].pos }, mod_option: opt,
    loc_vars: (center, iq, card) => ({ vars: d.loc_vars(card) }),
    can_use: (center, card) => d.can_use(card),
    use: (center, card, area, copier) => d.use(card, area, copier),
  });
  loc.descriptions[d.set][key] = d.loc;
  options[opt] = { default: true, label: d.set + ': ' + d.loc.name };
  PORTED.push(key);
}
for (const [opt, d] of Object.entries(D)) {
  const key = 'b_' + PRE + '_' + d.slug;
  centers.push({
    key, set: 'Back', name: d.name, config: { ...d.config }, atlas: ATLAS, pos: { ...LAYOUT.backs[d.back] }, mod_option: opt,
    loc_vars: () => ({ vars: [] }),
    apply: (center, back) => d.apply(center, back),
  });
  loc.descriptions.Back[key] = d.loc;
  options[opt] = { default: true, label: 'Deck: ' + d.loc.name };
  PORTED.push(key);
}
loc.descriptions.Other.card_extra_mult = { name: 'card_extra_mult', text: ['{C:mult}+#1#{} extra Mult'] };
Object.assign(loc.misc.dictionary, {
  k_mmc_charging: 'Charging...', k_mmc_bonus: 'Bonus!', k_mmc_hand_up: '+ Hand Size!', k_mmc_hand_down: '- Hand Size!',
  k_mmc_tick: 'Tick...', k_mmc_plus_card: 'Card!', k_mmc_luck: '+ Luck!', k_mmc_destroy: 'Destroy!',
});

// -------------------------------------------------------------------- hooks
const fill = (lines, vars) => lines.map((l) => l.replace(/#(\d+)#/g, (m, n) => (vars[n - 1] !== undefined ? String(vars[n - 1]) : m)));
const hooks = {
  /** The evaluate_play wrap: every Mika's joker sees {after, mmc_scored_chips = hand_chips * mult}. */
  hand_scored(hand_chips, mult) {
    for (const j of G.jokers.cards.slice()) {
      if (j.config.center.mod !== MOD_ID) continue; // (base jokers ignore the context; others' could misread a bare `after`)
      const eff = eval_card(j, { card: G.consumeables, after: true, mmc_scored_chips: hand_chips * mult });
      if (eff.jokers) card_eval_status_text(j, 'jokers', null, 0.3, null, eff.jokers);
    }
  },
  /** Card:add_to_deck wrap: Jokers for Hire slots, Glue's partners (fix 10). */
  add_to_deck(card) {
    if (card.ability.set !== 'Joker') return;
    if (G.GAME.starting_params.mmc_for_hire) {
      G.jokers.config.card_limit += 1;
      G.GAME.mmc_for_hire_counter = (G.GAME.mmc_for_hire_counter || 1) + 1;
    }
    if (card.ability.name === 'Half Joker' || card.ability.name === 'MMC Incomplete Joker') {
      for (const v of G.jokers.cards) if (v.ability.name === 'MMC Glue' && v.added_to_deck) glue_refresh(v, card);
    }
  },
  remove_from_deck(card) {
    if (card.ability.set !== 'Joker') return;
    if (G.GAME.starting_params.mmc_for_hire) {
      G.jokers.config.card_limit -= 1;
      G.GAME.mmc_for_hire_counter = (G.GAME.mmc_for_hire_counter || 1) - 1;
    }
    if (card.ability.name === 'Half Joker' || card.ability.name === 'MMC Incomplete Joker') {
      for (const v of G.jokers.cards) if (v !== card && v.ability.name === 'MMC Glue' && v.added_to_deck) glue_refresh(v, null, card);
    }
  },
  /** Card.set_cost wrap: Eye Chart's letter re-rolls while unowned; Jokers for Hire prices. */
  set_cost(card) {
    if (card.ability.name === 'MMC Eye Chart' && !card.added_to_deck && card.ability.extra) {
      card.ability.extra.letter = upper(pseudorandom_element(LETTERS, pseudoseed('eye_chart'))[0]);
    }
    if (G.GAME.starting_params && G.GAME.starting_params.mmc_for_hire &&
        (card.ability.set === 'Joker' || String(card.ability.name || '').includes('Buffoon'))) {
      card.cost = card.cost * (G.GAME.mmc_for_hire_counter || 1);
      if (card.ability.name === 'Riff-raff') card.cost = 1000000000; // "No fun allowed"
    }
  },
  /** Card.set_edition wrap (Cicero): no edition / a non-negative one on an un-owned joker -> Negative. */
  edition_nil(card) { if (cicero_applies(card)) card.set_edition({ negative: true }); },
  set_edition(card, ek) {
    if (ek === 'e_negative' || !cicero_applies(card)) return undefined;
    card.set_edition({ negative: true });
    return false;
  },
  /** Card.get_end_of_round_effect wrap: a held Blue Seal + Aurora Borealis / Harp Seal. */
  end_of_round_effect(card) {
    if (card.seal !== 'Blue' || card.debuff) return;
    for (const v of G.jokers.cards) {
      if (v.ability.name === 'MMC Aurora Borealis') {
        create_planet(v, 'aurora_borealis', { negative: true });
        for (const v2 of G.jokers.cards) if (v2.ability.name === 'MMC Harp Seal') create_planet(v, 'aurora_borealis', { negative: true }, v2);
      }
      if (v.ability.name === 'MMC Harp Seal') create_planet(v, 'harp_seal');
    }
  },
  /** lovely.toml: a playing card's bonus Mult (ability.mult + perma_mult) in its description. */
  describe(card, desc) {
    const a = card.ability;
    if (!desc || !a || card.debuff || !Array.isArray(desc.lines) || (a.set !== 'Default' && a.set !== 'Enhanced')) return;
    const perma = a.perma_mult || 0;
    const extra = MOD_LOC.descriptions.Other.card_extra_mult.text;
    if (a.effect === 'Mult Card') {
      if (!perma) return;
      const t = LOC.descriptions.Enhanced.m_mult.text;
      const from = fill(t, [card.config.center.config.mult]), to = fill(t, [a.mult + perma]);
      const i = desc.lines.indexOf(from[0]);
      if (i >= 0) desc.lines[i] = to[0];
    } else if (perma > 0 || (a.effect !== 'Lucky Card' && a.mult > 0)) {
      // (Lucky Card: its +20 stays a 1 in 5 roll — fix 11 — so only the permanent part is "extra")
      const n = a.effect === 'Lucky Card' ? perma : a.mult + perma;
      desc.lines.push(...fill(extra, [n]));
    }
  },
};

export const MIKAS = registerMod({
  id: MOD_ID,
  name: "Mika's Mod Collection",
  prefix: PRE,
  version: '0.13.3',
  by: 'Mikadoe (rebuilt for Micatro)',
  badge_colour: '#FD5DA8',
  description: '60 jokers, 7 decks, and new Tarot/Spectral cards; playing cards can gain permanent Mult.',
  options,
  content: {
    centers,
    atlases: { [ATLAS]: { src: '/micatro/mods/mikas/assets/2x/mikas.png', px: 71, py: 95 } },
    loc,
  },
  hooks,
});

export const STATUS = {
  PORTED,
  FIXES: [
    'blueprint-incompatible jokers ignore Blueprint/Brainstorm', 'Harp Seal gold seal +$3 once', 'Grudgeful resets each round',
    'Dagonet blacklist applies', 'Student Loans returns all discards', 'Finishing Blow: finishing hand only',
    'Scoring Test records debuffed hands', 'Fishing License copies Glass X2', 'Commander keeps existing seals',
    'Glue +2 slots once', 'perma-mult respects debuff / Lucky roll',
  ],
};
