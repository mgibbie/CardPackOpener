// Pages — a base-game rule of Micatro (not Balatro): after the player selects ANY Blind, before the round starts, a
// Pages screen offers 3 random Pages and the player must take one (no Back, no Skip). A Page is
//
//   target  (Spades / Clubs / Hearts / Diamonds / odd ranks / even ranks / face cards / Aces)
//   effect  what each SCORED target card does (every scoring trigger, retriggers included)
//   pct     the Blind's required score, -10% ... +30%, applied when the round starts
//   prize   granted when the Blind is beaten ($, a Booster Pack opened after the cash-out, or one consumable)
//
// The prize scales with the Page's difficulty (PRIZE_TIERS). The effect lasts for that round only.
//
// Versioned: Pages exist from ENGINE_CONTENT_REV 2 (PAGES_REV). A run recorded on an older rev never sees them, so old
// saves and replays re-simulate exactly (engine/session.js passes the recipe's rev to newRun; newRun with no rev is the
// legacy rules — what the engine unit tests use). A run can turn them off with the Joker Toggle mod's "Pages" switch,
// and a challenge (a curated rule set, the daily one included) plays without them.
//
// Pages v2 (engine rules rev 3, PAGES_V2_REV): more targets, effects, required-score modifiers, prizes (a Legendary tier) and
// a Round rule on 30% of Pages. A run recorded on rev 2 keeps the v1 tables byte for byte (generatePages / PRIZE_TIERS
// below are frozen; a v2 Page carries `v: 2` and only it reaches the v2 code), so Pages-v1 saves and replays re-simulate
// exactly (fuzz_pages_v1_test.mjs pins them).
//
// Randomness: everything a Page rolls has its own seed keys ('pages' + ante + blind for the offer, 'page_tarot' for the
// 1 in 4 Tarot, 'pag' as the created cards' key_append), so a Pages run's other streams (shop, packs, bosses) are the
// same as they would be without them, and a seed always offers the same Pages.

import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, P_TAGS, Card, emit, card_eval_status_text, ease_dollars, create_card, localize, pseudoseed, seeded,
  probability_roll, mod_chips, mod_mult, calculate_reroll_cost, level_up_hand, enhancement_pool, create_playing_card, P_CARDS_LIST,
  pseudorandom_element, mod_context_effect,
} from './core.js';
import * as B from './bignum.js';
import { opt, centerActive, activeConsumableTypes, contentDisabled } from '../mods/registry.js';
import { Tag, add_tag } from './tag.js';
import { playing_card_joker_effects } from './consumables.js';

/** The engine rules rev Pages arrive with (mods/pins.js ENGINE_CONTENT_REV). */
export const PAGES_REV = 2;
/** The engine rules rev Pages v2 arrive with: a run recorded on PAGES_REV keeps the v1 tables. */
export const PAGES_V2_REV = 3;

// ------------------------------------------------------------------ the parts of a Page
const oddId = (id) => (id >= 0 && id <= 10 && id % 2 === 1) || id === 14; // (Odd Todd: the Ace is odd)
const evenId = (id) => id >= 0 && id <= 10 && id % 2 === 0;               // (Even Steven)
/** Targets: which scored cards the Page acts on. Stone / no-suit / no-rank cards match no suit / rank. */
export const PAGE_TARGETS = {
  Spades: { name: 'Spades', test: (c) => c.is_suit('Spades') },
  Clubs: { name: 'Clubs', test: (c) => c.is_suit('Clubs') },
  Hearts: { name: 'Hearts', test: (c) => c.is_suit('Hearts') },
  Diamonds: { name: 'Diamonds', test: (c) => c.is_suit('Diamonds') },
  odd: { name: 'Odd cards (A, 3, 5, 7, 9)', test: (c) => oddId(c.get_id()) },
  even: { name: 'Even cards (2, 4, 6, 8, 10)', test: (c) => evenId(c.get_id()) },
  face: { name: 'Face cards', test: (c) => c.is_face() },
  ace: { name: 'Aces', test: (c) => c.get_id() === 14 },
};
export const TARGET_KEYS = Object.keys(PAGE_TARGETS);
/** Effects, per scoring trigger of a target card. `down`: a downside (it raises the Page's difficulty). */
export const PAGE_EFFECTS = {
  chips: { text: 'give {C:chips}+15{} Chips when scored' },
  perma_chips: { text: 'permanently gain {C:chips}+15{} Chips when scored' },
  mult: { text: 'give {C:mult}+1{} Mult when scored' },
  perma_mult: { text: 'permanently gain {C:mult}+1{} Mult when scored' },
  minus_mult: { text: 'give {C:mult}-1{} Mult when scored', down: true },
  gain_dollar: { text: 'give {C:money}$1{} when scored' },
  lose_dollar: { text: 'cost {C:money}$1{} when scored', down: true },
  tarot: { text: 'have a {C:green}#1# in 4{} chance to create a {C:tarot}Tarot{} card when scored {C:inactive}(must have room)' },
  planet: { text: 'have a {C:green}#1# in 4{} chance to create a {C:planet}Planet{} card when scored {C:inactive}(must have room)' },
  lucky_discard: { text: 'have a {C:green}#1# in 4{} chance to become {C:attention}Lucky{} cards when discarded {C:inactive}(unenhanced cards only)', discard: 'm_lucky' },
  bonus_discard: { text: 'have a {C:green}#1# in 4{} chance to become {C:attention}Bonus{} cards when discarded {C:inactive}(unenhanced cards only)', discard: 'm_bonus' },
};
export const EFFECT_KEYS = Object.keys(PAGE_EFFECTS);
/** The required-score modifiers (percent of the Blind's requirement). */
export const PAGE_PCTS = [-10, -5, 0, 5, 10, 15, 20, 25, 30];
/** A downside effect counts as this many more percent of difficulty. */
export const DOWNSIDE_BONUS = 30;

/**
 * The prize tiers: a Page's difficulty = its required-score percent + DOWNSIDE_BONUS for a downside effect; the first tier
 * whose `max` it doesn't exceed draws the prize, uniformly from that tier's list. Item / Oddity prizes exist only while a
 * mod providing that consumable type is on (Pokermon's Item, AutumnMood's Oddity). (Documented in the design wiki.)
 */
export const PRIZE_TIERS = [
  { tier: 1, name: 'Easy', max: -5, prizes: [{ kind: 'money', amount: 1 }, { kind: 'card', set: 'Tarot' }] },
  { tier: 2, name: 'Fair', max: 15, prizes: [{ kind: 'money', amount: 2 }, { kind: 'money', amount: 3 }, { kind: 'card', set: 'Tarot' }, { kind: 'card', set: 'Item' }, { kind: 'card', set: 'Oddity' }] },
  { tier: 3, name: 'Hard', max: 25, prizes: [{ kind: 'money', amount: 4 }, { kind: 'shop', perk: 'rerolls' }, { kind: 'pack', key: 'p_arcana_normal_1' }, { kind: 'pack', key: 'p_celestial_normal_1' }, { kind: 'pack', key: 'p_standard_normal_1' }, { kind: 'pack', key: 'p_buffoon_normal_1' }, { kind: 'card', set: 'Item' }, { kind: 'card', set: 'Oddity' }] },
  { tier: 4, name: 'Brutal', max: Infinity, prizes: [{ kind: 'money', amount: 5 }, { kind: 'pack', key: 'p_arcana_jumbo_1' }, { kind: 'pack', key: 'p_celestial_mega_1' }, { kind: 'pack', key: 'p_standard_mega_1' }, { kind: 'pack', key: 'p_buffoon_jumbo_1' }, { kind: 'pack', key: 'p_spectral_normal_1' }, { kind: 'card', set: 'Spectral' },
    { kind: 'shop', perk: 'half_off' }, { kind: 'shop', perk: 'rerolls' }, { kind: 'shop', perk: 'negative' }] },
];
export const difficultyOf = (effect, pct) => pct + (PAGE_EFFECTS[effect] && PAGE_EFFECTS[effect].down ? DOWNSIDE_BONUS : 0);
export const tierOf = (difficulty) => PRIZE_TIERS.find((t) => difficulty <= t.max) || PRIZE_TIERS[PRIZE_TIERS.length - 1];

// ------------------------------------------------------------------ on / off
/**
 * Do Pages play in this run? Decided once, by newRun: the run's engine rules rev (`engineRev`, the recipe's — omitted:
 * the legacy rules), not a challenge, and the Joker Toggle mod's "Pages" switch not off. -> sets G.GAME.pages_on.
 */
export function decidePages(engineRev, challenge) {
  G.GAME.pages_on = Number.isInteger(engineRev) && engineRev >= PAGES_REV && !challenge && opt('jokertoggle', 'pages') !== false;
  // (v2 tables from rev 3; only set then, so a rev-2 run's game object is exactly what it was)
  if (G.GAME.pages_on && engineRev >= PAGES_V2_REV) G.GAME.pages_v2 = true;
  return G.GAME.pages_on;
}

// ------------------------------------------------------------------ the offer
/** A consumable set a prize may name now (base sets always; a mod's only while that mod's type is active). */
function setAvailable(set) {
  if (set === 'Tarot' || set === 'Spectral') return true;
  return activeConsumableTypes().some((t) => t.key === set);
}
/** The consumables a prize may name: in the set's pool, not banned / hidden / switched off. */
function prizePool(set) {
  return (P_CENTER_POOLS[set] || []).filter((v) => v && v.key && !v.hidden && !G.GAME.banned_keys[v.key] && centerActive(v) && v.key !== 'c_soul' && v.key !== 'c_black_hole');
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

/** The 3 Pages for this blind (seeded: 'pages' + ante + blind): distinct target + effect pairs. */
export function generatePages(which) {
  if (G.GAME.pages_v2) return generatePagesV2(which);
  const r = seeded(pseudoseed('pages' + G.GAME.round_resets.ante + which));
  const out = [], seen = new Set();
  for (let guard = 0; out.length < 3 && guard < 50; guard++) {
    const target = pick(r, TARGET_KEYS), effect = pick(r, EFFECT_KEYS), pct = pick(r, PAGE_PCTS);
    if (seen.has(target + '|' + effect)) continue;
    seen.add(target + '|' + effect);
    const difficulty = difficultyOf(effect, pct), tier = tierOf(difficulty);
    out.push({ target, effect, pct, difficulty, tier: tier.tier, prize: rollPrize(r, tier) });
  }
  return out;
}
function rollPrize(r, tier) {
  const options = tier.prizes.filter((p) => p.kind !== 'card' || (setAvailable(p.set) && prizePool(p.set).length));
  const p = pick(r, options.length ? options : [{ kind: 'money', amount: tier.tier }]);
  if (p.kind === 'card') return { kind: 'card', set: p.set, key: pick(r, prizePool(p.set)).key };
  return { ...p };
}

// ------------------------------------------------------------------ Pages v2 (engine rules rev 3)
const RANK_NAMES = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
/**
 * The v2 targets. `test(c, p, ctx, bypass)`: `ctx.scoring_hand` for the positional ones; `bypass` reads a debuffed card's own
 * suit (the "debuffed this round" effect asks about cards the Page itself debuffs). `one`: a single card ("The first scored
 * card gives"): the effect's verb goes singular.
 */
const id = (c) => c.get_id();
const live = (ctx) => ((ctx && ctx.scoring_hand) || []).filter((x) => !x.debuff);
export const PAGE_TARGETS_V2 = {
  red: { name: 'Red cards (Hearts, Diamonds)', test: (c, p, x, b) => c.is_suit('Hearts', b) || c.is_suit('Diamonds', b) },
  black: { name: 'Black cards (Spades, Clubs)', test: (c, p, x, b) => c.is_suit('Spades', b) || c.is_suit('Clubs', b) },
  low: { name: 'Low cards (2-5)', test: (c) => id(c) >= 2 && id(c) <= 5 },
  high: { name: 'High cards (10, J, Q, K, A)', test: (c) => id(c) >= 10 && id(c) <= 14 },
  numbered: { name: 'Numbered cards (2-10)', test: (c) => id(c) >= 2 && id(c) <= 10 },
  enhanced: { name: 'Enhanced cards', test: (c) => c.config.center.key !== 'c_base' },
  unenhanced: { name: 'Unenhanced cards', test: (c) => c.config.center.key === 'c_base' },
  sealed: { name: 'Cards with a seal', test: (c) => !!c.seal },
  // (position in the scoring hand; a debuffed card doesn't score, so it is skipped: the first / last card that scores)
  first: { name: 'The first scored card', one: true, positional: true, test: (c, p, x) => live(x)[0] === c },
  last: { name: 'The last scored card', one: true, positional: true, test: (c, p, x) => { const l = live(x); return l.length > 0 && l[l.length - 1] === c; } },
  // (one rank drawn from the deck when the Page is made, like The Idol; stored on the Page as `rank`)
  rank: { name: 'The round\'s rank', test: (c, p) => !!p && id(c) === p.rank },
};
const ALL_TARGETS = { ...PAGE_TARGETS, ...PAGE_TARGETS_V2 };
export const TARGET_KEYS_V2 = [...TARGET_KEYS, ...Object.keys(PAGE_TARGETS_V2)];
/** Does Page `p` act on card `c`? (v1 and v2 targets alike) */
export function pageTargets(p, c, ctx, bypass) {
  const t = p && ALL_TARGETS[p.target];
  if (!t) return false;
  // (a debuffed card has no suit / face for the usual tests: the "debuffed this round" effect asks about the card itself)
  if (bypass && BYPASS[p.target]) return BYPASS[p.target](c);
  return !!t.test(c, p, ctx, bypass);
}
const BYPASS = {
  Spades: (c) => c.is_suit('Spades', true), Clubs: (c) => c.is_suit('Clubs', true), Hearts: (c) => c.is_suit('Hearts', true),
  Diamonds: (c) => c.is_suit('Diamonds', true), face: (c) => c.is_face(true),
};
/**
 * The v2 effects. `down`: a downside (it adds DOWNSIDE_BONUS difficulty; "debuffed this round" is worse: `weight` 45).
 * `odds`: its 1 in N (Oops! All 6s raises them; the text shows the live numerator).
 */
export const PAGE_EFFECTS_V2 = {
  xmult: { text: 'give {X:mult,C:white}X1.1{} Mult when scored' },
  five_mult: { text: 'give {C:mult}+3{} Mult when scored in a {C:attention}5-card{} hand' },
  retrigger: { text: 'have a {C:green}#1# in 4{} chance to retrigger', odds: 4 },
  gain_seal: { text: 'have a {C:green}#1# in 10{} chance to gain a random {C:attention}seal{} when scored {C:inactive}(cards without one)', odds: 10 },
  become: { text: 'have a {C:green}#1# in 10{} chance to become {C:attention}#2#{} when scored {C:inactive}(unenhanced cards only)', odds: 10 },
  level_up: { text: 'have a {C:green}#1# in 8{} chance to {C:attention}level up{} the played poker hand when scored', odds: 8 },
  spectral: { text: 'have a {C:green}#1# in 20{} chance to create a {C:spectral}Spectral{} card when scored {C:inactive}(must have room)', odds: 20 },
  minus_chips: { text: 'give {C:chips}-10{} Chips when scored', down: true },
  xmult_down: { text: 'give {X:mult,C:white}X0.9{} Mult when scored', down: true },
  destroy: { text: 'have a {C:green}#1# in 8{} chance to be {C:red}destroyed{} after scoring', down: true, odds: 8 },
  debuffed: { text: 'are {C:red}debuffed{} this round', down: true, weight: 45 },
};
const ALL_EFFECTS = { ...PAGE_EFFECTS, ...PAGE_EFFECTS_V2 };
export const EFFECT_KEYS_V2 = [...EFFECT_KEYS, ...Object.keys(PAGE_EFFECTS_V2)];
/** What a "become ..." Page can name (its `enh`). */
export const BECOME_ENH = ['m_glass', 'm_steel', 'm_gold'];
const BASE_SEALS = ['Red', 'Blue', 'Gold', 'Purple'];
/** The difficulty an effect adds (0 unless it is a downside). */
export const effectWeight = (effect) => { const e = ALL_EFFECTS[effect]; return e && e.down ? (e.weight || DOWNSIDE_BONUS) : 0; };
/** Round rules (RULE_CHANCE of v2 Pages have one): round-wide, for that round only. `d`: the difficulty it adds (< 0: easier). */
export const ROUND_RULES = {
  minus_hand: { text: '{C:red}-1{} hand this round', d: 15 },
  plus_discard: { text: '{C:green}+1{} discard this round', d: -10 },
  minus_hand_size: { text: '{C:red}-1{} hand size this round', d: 15 },
  no_discards: { text: '{C:red}No discards{} this round', d: 25 },
  double_first: { text: 'The first hand\'s score counts {C:green}double', d: -15 },
};
export const RULE_KEYS = Object.keys(ROUND_RULES);
/** The share of v2 Pages with a Round rule (owner, 2026-11-07: exactly a 30% roll per Page). */
export const RULE_CHANCE = 0.3;
/** v2 required-score modifiers: v1's, plus -15 / -20 (only with a downside or a harder rule) and +40 / +50 (Legendary). */
export const LOW_PCTS = [-15, -20];
export const LEGENDARY_PCTS = [40, 50];
export const PAGE_PCTS_V2 = [...LOW_PCTS, ...PAGE_PCTS, ...LEGENDARY_PCTS];
/** The share of v2 Pages rolled with +40% / +50% (Legendary), and with -15% / -20% (when the Page allows them). */
export const LEGENDARY_CHANCE = 0.05;
export const LOW_CHANCE = 0.08;
/** v2 difficulty = required-score percent + the effect's downside weight + the Round rule's. */
export const difficultyOfV2 = (effect, pct, rule) => pct + effectWeight(effect) + (rule && ROUND_RULES[rule] ? ROUND_RULES[rule].d : 0);
/** May a Page pair this target + effect (+ rule)? Never one that could not do anything, nor one that would gut the deck. */
export function comboOk(target, effect, rule) {
  const t = ALL_TARGETS[target], e = ALL_EFFECTS[effect];
  if (!t || !e) return false;
  if (t.positional && (e.discard || effect === 'debuffed')) return false; // (no position outside a scored hand)
  if (target === 'enhanced' && (e.discard || effect === 'become')) return false; // (those act on unenhanced cards only)
  if (target === 'sealed' && effect === 'gain_seal') return false;
  if (effect === 'debuffed' && (target === 'unenhanced' || target === 'numbered')) return false; // (most of a deck: unwinnable)
  if (rule === 'no_discards' && e.discard) return false;
  return true;
}
/**
 * v2 prize tiers: v1's lists plus the new prizes. The tier comes from the difficulty as in v1 (Easy <= -5, Fair <= 15,
 * Hard <= 25, Brutal above), except that a +40% / +50% Page is always Legendary (tier 5), with Legendary-only prizes.
 */
export const PRIZE_TIERS_V2 = [
  { tier: 1, name: 'Easy', max: -5, prizes: PRIZE_TIERS[0].prizes },
  { tier: 2, name: 'Fair', max: 15, prizes: [...PRIZE_TIERS[1].prizes, { kind: 'tag' }, { kind: 'level_most' }, { kind: 'joker', rarity: 1 }, { kind: 'enhanced_card' }] },
  { tier: 3, name: 'Hard', max: 25, prizes: [...PRIZE_TIERS[2].prizes, { kind: 'hand_size' }, { kind: 'joker', rarity: 2 }, { kind: 'remove_card' }, { kind: 'interest' }, { kind: 'poke' }] },
  { tier: 4, name: 'Brutal', max: Infinity, prizes: [...PRIZE_TIERS[3].prizes, { kind: 'joker', rarity: 3 }, { kind: 'joker_edition' }] },
  { tier: 5, name: 'Legendary', max: Infinity, prizes: [{ kind: 'joker', rarity: 4 }, { kind: 'joker_slot' }] },
];
export const tierOfV2 = (difficulty, pct) => (LEGENDARY_PCTS.includes(pct) ? PRIZE_TIERS_V2[4] : PRIZE_TIERS_V2.slice(0, 4).find((t) => difficulty <= t.max));
/** The Tags a Tag prize may name (granted like a skip's). */
export const PRIZE_TAGS = ['tag_double', 'tag_investment', 'tag_juggle', 'tag_coupon', 'tag_d_six', 'tag_top_up'];
const JOKER_RARITY = { 1: { name: 'Common', roll: 0 }, 2: { name: 'Uncommon', roll: 0.9 }, 3: { name: 'Rare', roll: 0.99 }, 4: { name: 'Legendary', legendary: true } };
const EDITIONS = ['foil', 'holo', 'polychrome'];
const tagOk = (k) => P_TAGS[k] && !contentDisabled(P_TAGS[k]) && !(G.GAME.banned_keys && G.GAME.banned_keys[k]);
const pokeOn = () => !!(P_CENTERS.c_poke_pokeball && centerActive(P_CENTERS.c_poke_pokeball)) && setAvailable('Energy') && prizePool('Energy').length > 0;
/** A "round's rank" Page's rank (seeded with the offer): a random card of the deck that has a rank, as The Idol picks. */
function rollRank(r) {
  const ranked = (G.playing_cards || []).filter((c) => id(c) >= 2 && id(c) <= 14).sort((a, b) => a.sort_id - b.sort_id);
  return ranked.length ? id(ranked[Math.floor(r() * ranked.length)]) : null;
}
/** The 3 v2 Pages for this blind (seeded as v1: 'pages' + ante + blind): distinct target + effect pairs. */
function generatePagesV2(which) {
  const r = seeded(pseudoseed('pages' + G.GAME.round_resets.ante + which));
  const out = [], seen = new Set();
  const enhs = BECOME_ENH.filter((k) => P_CENTERS[k] && !contentDisabled(P_CENTERS[k]));
  for (let guard = 0; out.length < 3 && guard < 80; guard++) {
    const target = pick(r, TARGET_KEYS_V2), effect = pick(r, EFFECT_KEYS_V2);
    if (!comboOk(target, effect) || seen.has(target + '|' + effect)) continue;
    const page = { v: 2, target, effect };
    if (target === 'rank') { page.rank = rollRank(r); if (page.rank == null) continue; }
    if (effect === 'become') { if (!enhs.length) continue; page.enh = pick(r, enhs); }
    seen.add(target + '|' + effect);
    // the Round rule: exactly a RULE_CHANCE roll per Page
    const hasRule = r() < RULE_CHANCE;
    const down = !!ALL_EFFECTS[effect].down;
    const band = r();
    let pct, rules = RULE_KEYS.filter((k) => comboOk(target, effect, k));
    const harder = rules.filter((k) => ROUND_RULES[k].d > 0);
    if (band < LEGENDARY_CHANCE) { pct = pick(r, LEGENDARY_PCTS); rules = harder; } // (Legendary: never with an easier rule)
    else if (band < LEGENDARY_CHANCE + LOW_CHANCE && (down || hasRule)) { pct = pick(r, LOW_PCTS); if (!down) rules = harder; } // (only with a downside or a harder rule)
    else pct = pick(r, PAGE_PCTS);
    if (hasRule) page.rule = pick(r, rules);
    page.pct = pct;
    page.difficulty = difficultyOfV2(effect, pct, page.rule);
    const tier = tierOfV2(page.difficulty, pct);
    page.tier = tier.tier;
    page.prize = rollPrizeV2(r, tier);
    out.push(page);
  }
  return out;
}
function rollPrizeV2(r, tier) {
  const options = tier.prizes.filter((p) => (p.kind !== 'card' || (setAvailable(p.set) && prizePool(p.set).length)) && (p.kind !== 'poke' || pokeOn()) &&
    (p.kind !== 'tag' || PRIZE_TAGS.some(tagOk)));
  const p = pick(r, options.length ? options : [{ kind: 'money', amount: tier.tier }]);
  if (p.kind === 'card') return { kind: 'card', set: p.set, key: pick(r, prizePool(p.set)).key };
  if (p.kind === 'tag') return { kind: 'tag', key: pick(r, PRIZE_TAGS.filter(tagOk)) };
  // (Pokermon on: a Poke Ball Item, or a random Energy card — then a named consumable like any card prize)
  if (p.kind === 'poke') return r() < 0.5 && setAvailable('Item') ? { kind: 'card', set: 'Item', key: 'c_poke_pokeball' } : { kind: 'card', set: 'Energy', key: pick(r, prizePool('Energy')).key };
  return { ...p };
}

// ------------------------------------------------------------------ the round
/** The Page's required-score modifier on the Blind just set (run.js new_round, right after Blind:set_blind). */
export function applyPageChips() {
  const p = G.GAME.page, b = G.GAME.blind;
  if (!p || !p.pct || !b || !b.chips) return;
  b.chips = B.floor(B.div(B.mul(b.chips, 100 + p.pct), 100));
  b.chip_text = String(b.chips);
  emit('blind', { action: 'chips', key: b.config.blind && b.config.blind.key, name: b.name, chips: b.chips, page: true });
}

/**
 * One scoring trigger of a played card (run.js evaluate_play, after the jokers' per-card effects): the Page acts if the
 * card is its target. `ctx`: {scoring_hand, text} (v2's positional targets / level up). -> [hand_chips, mult]
 */
export function pageIndividual(sc, hand_chips, mult, ctx) {
  const p = G.GAME.page;
  if (!p || !pageTargets(p, sc, ctx)) return [hand_chips, mult];
  switch (p.effect) {
    case 'chips':
      hand_chips = mod_chips(B.add(hand_chips, 15)); card_eval_status_text(sc, 'chips', 15); emit('hand_text', { chips: hand_chips });
      break;
    case 'mult':
      mult = mod_mult(B.add(mult, 1)); card_eval_status_text(sc, 'mult', 1); emit('hand_text', { mult });
      break;
    case 'minus_mult':
      // (never below 1 Mult: a Page's downside thins a hand, it doesn't zero it)
      if (B.gt(mult, 1)) { mult = mod_mult(B.max(B.sub(mult, 1), 1)); card_eval_status_text(sc, 'extra', null, null, null, { message: '-1 Mult', mult_mod: -1, colour: 'MULT' }); emit('hand_text', { mult }); }
      break;
    case 'perma_chips': // (Hiker's way: banked on the card, counted from its next scoring)
      sc.ability.perma_bonus = (sc.ability.perma_bonus || 0) + 15;
      card_eval_status_text(sc, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'CHIPS' });
      break;
    case 'perma_mult':
      sc.ability.perma_mult = (sc.ability.perma_mult || 0) + 1;
      card_eval_status_text(sc, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
      break;
    case 'gain_dollar':
      ease_dollars(1); card_eval_status_text(sc, 'dollars', 1);
      break;
    case 'lose_dollar':
      // (normal money rules: only as far into debt as the run allows — Credit Card's bankrupt_at)
      if (G.GAME.dollars + (G.GAME.dollar_buffer || 0) - 1 >= G.GAME.bankrupt_at) {
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) - 1;
        ease_dollars(-1); card_eval_status_text(sc, 'dollars', -1);
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
      }
      break;
    case 'tarot': case 'planet': {
      const set = p.effect === 'tarot' ? 'Tarot' : 'Planet';
      // (8 Ball / Space Joker's way: needs room, counting cards already on their way; Oops! All 6s raises the odds)
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit && probability_roll(sc, 'page_' + p.effect, 1, 4, 'page_' + p.effect)) {
        G.GAME.consumeable_buffer += 1;
        card_eval_status_text(sc, 'extra', null, null, null, { message: localize(set === 'Tarot' ? 'k_plus_tarot' : 'k_plus_planet'), colour: set.toUpperCase() });
        G.E_MANAGER.add_event(() => {
          const card = create_card(set, G.consumeables, null, null, null, null, null, 'pag');
          card.add_to_deck();
          G.consumeables.emplace(card);
          G.GAME.consumeable_buffer = 0;
        });
      }
      break;
    }
    // ---- v2 (only a v2 Page names these)
    case 'xmult': case 'xmult_down': {
      const x = p.effect === 'xmult' ? 1.1 : 0.9;
      mult = mod_mult(B.mul(mult, x)); card_eval_status_text(sc, 'x_mult', x); emit('hand_text', { mult });
      break;
    }
    case 'five_mult':
      if (G.play.cards.length === 5) { mult = mod_mult(B.add(mult, 3)); card_eval_status_text(sc, 'mult', 3); emit('hand_text', { mult }); }
      break;
    case 'minus_chips':
      // (never below 0 Chips)
      if (B.gt(hand_chips, 0)) {
        hand_chips = mod_chips(B.max(B.sub(hand_chips, 10), 0));
        card_eval_status_text(sc, 'extra', null, null, null, { message: '-10', chip_mod: -10, colour: 'CHIPS' }); emit('hand_text', { chips: hand_chips });
      }
      break;
    case 'gain_seal':
      // (a card that already has a seal keeps it; the roll is only made for one without)
      if (!sc.seal && probability_roll(sc, 'page_gain_seal', 1, 10, 'page_gain_seal')) {
        const [seal] = pseudorandom_element(BASE_SEALS, pseudoseed('page_seal_type'));
        sc.set_seal(seal, true);
        card_eval_status_text(sc, 'extra', null, null, null, { message: seal + ' Seal!', colour: 'ATTENTION' });
        emit('card_changed', { card: sc.sort_id });
      }
      break;
    case 'become':
      // (unenhanced cards only, as the v1 Lucky / Bonus Pages: an enhanced card keeps its own; the new one counts from its next trigger)
      if (sc.config.center.key === 'c_base' && P_CENTERS[p.enh] && probability_roll(sc, 'page_become', 1, 10, 'page_become')) {
        sc.set_ability(P_CENTERS[p.enh], null, true);
        card_eval_status_text(sc, 'extra', null, null, null, { message: centerName(p.enh) + '!', colour: 'ATTENTION' });
        emit('card_changed', { card: sc.sort_id });
      }
      break;
    case 'level_up':
      if (ctx && ctx.text && G.GAME.hands[ctx.text] && probability_roll(sc, 'page_level_up', 1, 8, 'page_level_up')) {
        card_eval_status_text(sc, 'extra', null, null, null, { message: localize('k_level_up_ex'), colour: 'ATTENTION' });
        level_up_hand(sc, ctx.text);
      }
      break;
    case 'spectral':
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit && probability_roll(sc, 'page_spectral', 1, 20, 'page_spectral')) {
        G.GAME.consumeable_buffer += 1;
        card_eval_status_text(sc, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'SPECTRAL' });
        G.E_MANAGER.add_event(() => {
          const card = create_card('Spectral', G.consumeables, null, null, null, null, null, 'pag');
          card.add_to_deck();
          G.consumeables.emplace(card);
          G.GAME.consumeable_buffer = 0;
        });
      }
      break;
    default:
  }
  return [hand_chips, mult];
}

/** A played card's repetitions (run.js score_card_effects, after the seal's and the jokers'): a "retrigger" Page's 1 in 4. */
export function pageRepetitions(sc, reps, ctx) {
  const p = G.GAME.page;
  if (!p || p.effect !== 'retrigger' || !pageTargets(p, sc, ctx)) return;
  if (probability_roll(sc, 'page_retrigger', 1, 4, 'page_retrigger')) reps.push({ seals: { message: localize('k_again_ex'), repetitions: 1, card: sc } });
}
/** After the hand scored (run.js's destroy pass): a "destroyed" Page's 1 in 8 for each scored target card (not a debuffed one). */
export function pageDestroys(sc, ctx) {
  const p = G.GAME.page;
  if (!p || p.effect !== 'destroy' || sc.debuff || !pageTargets(p, sc, ctx)) return false;
  return probability_roll(sc, 'page_destroy', 1, 8, 'page_destroy');
}
/** Blind:debuff_card (blind.js): a "debuffed this round" Page debuffs its target playing cards while it lasts. */
export function pageDebuffs(card) {
  const p = G.GAME.page;
  return !!(p && p.effect === 'debuffed' && card.playing_card && card.area !== G.jokers && pageTargets(p, card, null, true));
}
/**
 * The round starts (run.js new_round, after the Page's required score): the Round rule's hands / discards / hand size, and
 * a "+1 hand size next round" prize waiting from the last cash-out. Hand size goes through round_resets.temp_handsize (the
 * Juggle Tag's way), so it comes back when the round ends.
 */
export function pageRoundStart() {
  const p = G.GAME.page, cr = G.GAME.current_round, rr = G.GAME.round_resets;
  let hs = 0;
  if (G.GAME.page_next_hs) { hs += G.GAME.page_next_hs; G.GAME.page_next_hs = undefined; }
  const rule = p && p.rule;
  if (rule === 'minus_hand') cr.hands_left = Math.max(1, cr.hands_left - 1);
  else if (rule === 'plus_discard') cr.discards_left += 1;
  else if (rule === 'no_discards') cr.discards_left = 0; // (as The Water)
  else if (rule === 'minus_hand_size') hs -= 1;
  if (hs) { G.hand.change_size(hs); rr.temp_handsize = (rr.temp_handsize || 0) + hs; }
  if (rule) emit('page_rule', { rule });
}
/** What a hand adds to the round score (run.js evaluate_play): "the first hand's score counts double". */
export function pageScoreAdded(added) {
  const p = G.GAME.page;
  if (!p || p.rule !== 'double_first' || G.GAME.current_round.hands_played !== 0) return added;
  emit('attention', { text: 'Page: X2 score' });
  return B.mul(added, 2);
}

/**
 * A card the PLAYER discards (run.js discard_cards_from_highlighted; not The Hook's): a "become Lucky / Bonus" Page rolls
 * 1 in 4 (Oops! All 6s raises it) for each discarded target card that has no enhancement yet (an enhanced card keeps its own).
 */
export function pageDiscard(c) {
  const p = G.GAME.page;
  const enh = p && PAGE_EFFECTS[p.effect] && PAGE_EFFECTS[p.effect].discard;
  if (!enh || !P_CENTERS[enh] || !pageTargets(p, c)) return;
  if (c.config.center.key !== 'c_base') return;
  if (!probability_roll(c, 'page_' + p.effect, 1, 4, 'page_' + p.effect)) return;
  c.set_ability(P_CENTERS[enh], null, true);
  card_eval_status_text(c, 'extra', null, null, null, { message: enh === 'm_lucky' ? 'Lucky!' : 'Bonus!', colour: enh === 'm_lucky' ? 'GREEN' : 'CHIPS' });
  emit('card_changed', { card: c.sort_id });
}

/**
 * The cash-out (run.js evaluate_round): a beaten Blind pays the Page's prize — money as its own row, a consumable now
 * (no room: its shop price instead), a pack opened as the shop opens. The Page ends with the round either way.
 * -> the row's dollars (0 when none).
 */
export function pagePrizeRow(row, beaten) {
  const p = G.GAME.page;
  G.GAME.page = null;
  if (!p || !beaten) return 0;
  const z = p.prize || {};
  if (z.kind === 'money') { row({ name: 'page', dollars: z.amount, bonus: true, page: pageLabel(p), prize: prizeText(z) }); return z.amount; }
  if (z.kind === 'pack' && P_CENTERS[z.key]) {
    G.GAME.page_pack = z.key;
    row({ name: 'page', dollars: 0, bonus: true, page: pageLabel(p), prize: prizeText(z) });
    return 0;
  }
  if (z.kind === 'shop') {
    (G.GAME.page_shop = G.GAME.page_shop || []).push(z.perk);
    row({ name: 'page', dollars: 0, bonus: true, page: pageLabel(p), prize: prizeText(z) });
    return 0;
  }
  if (z.kind === 'card' && P_CENTERS[z.key]) {
    if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      const card = create_card(z.set, G.consumeables, null, null, null, null, z.key, 'pag');
      card.add_to_deck();
      G.consumeables.emplace(card);
      emit('materialize', { card: card.sort_id });
      row({ name: 'page', dollars: 0, bonus: true, page: pageLabel(p), prize: prizeText(z) });
      return 0;
    }
    const worth = Math.max(1, P_CENTERS[z.key].cost || 3);
    row({ name: 'page', dollars: worth, bonus: true, page: pageLabel(p), prize: prizeText(z) + ' (no room)' });
    return worth;
  }
  if (p.v === 2) return prizeRowV2(p, z, row);
  return 0;
}
/** The v2 prizes at the cash-out. -> the row's dollars. */
function prizeRowV2(p, z, row) {
  const out = (dollars, extra) => { row({ name: 'page', dollars, bonus: true, page: pageLabel(p), prize: prizeText(z) + (extra || '') }); return dollars; };
  switch (z.kind) {
    case 'tag': {
      // (granted like a skip's Tag: added, then the Tags' immediate effects — Top-up's Jokers, Economy's money)
      if (!tagOk(z.key)) return out(0, ' (not available)');
      add_tag(new Tag(z.key, false, 'Small'));
      G.E_MANAGER.add_event(() => { for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' }); });
      return out(0);
    }
    case 'level_most': {
      const hand = mostPlayedHand();
      if (hand) level_up_hand(null, hand);
      return out(0, hand ? ' (' + localize(hand, 'poker_hands') + ')' : '');
    }
    case 'joker': {
      const R = JOKER_RARITY[z.rarity] || JOKER_RARITY[1];
      const card = create_card('Joker', G.jokers, !!R.legendary, R.legendary ? null : R.roll, null, null, null, 'pag');
      if (G.jokers.cards.length + (G.GAME.joker_buffer || 0) < G.jokers.config.card_limit) {
        card.add_to_deck();
        G.jokers.emplace(card);
        emit('materialize', { card: card.sort_id });
        return out(0, ' (' + centerName(card.config.center.key) + ')');
      }
      // (no room: what it would sell for)
      card.set_cost();
      return out(Math.max(1, card.sell_cost || 1), ' (no room: ' + centerName(card.config.center.key) + ')');
    }
    case 'enhanced_card': {
      const [front] = pseudorandom_element(P_CARDS_LIST(), pseudoseed('page_card_fr'));
      const [center] = pseudorandom_element(enhancement_pool().filter((v) => !contentDisabled(v)), pseudoseed('page_card_enh'));
      const card = create_playing_card({ front, center: center || P_CENTERS.m_bonus }, G.deck);
      card.add_to_deck();
      G.deck.config.card_limit = G.deck.config.card_limit + 1;
      playing_card_joker_effects([card]);
      emit('materialize', { card: card.sort_id });
      return out(0, ' (' + centerName(card.config.center.key) + ')');
    }
    case 'hand_size': G.GAME.page_next_hs = (G.GAME.page_next_hs || 0) + 1; return out(0);
    case 'remove_card': G.GAME.page_remove = (G.GAME.page_remove || 0) + 1; return out(0);
    case 'interest': G.GAME.page_interest = (G.GAME.page_interest || 0) + 5; return out(0);
    case 'joker_edition': {
      // (the leftmost Joker without an edition; none: $5)
      const j = G.jokers.cards.find((c) => c.ability.set === 'Joker' && !c.edition);
      if (!j) return out(5, ' (no Joker without an edition)');
      const [ed] = pseudorandom_element(EDITIONS, pseudoseed('page_edition'));
      j.set_edition({ [ed]: true }, true);
      emit('card_changed', { card: j.sort_id });
      return out(0, ' (' + centerName(j.config.center.key) + ')');
    }
    case 'joker_slot':
      G.jokers.config.card_limit += 1;
      return out(0);
    default: return 0;
  }
}
/** Your most played poker hand (Telescope's rule: ties go to the stronger hand). */
function mostPlayedHand() {
  const keys = Object.keys(G.GAME.hands).sort((a, b) => (G.GAME.hands[a].order || 99) - (G.GAME.hands[b].order || 99));
  let best = null, n = 0;
  for (const k of keys) if ((G.GAME.hands[k].played || 0) > n) { n = G.GAME.hands[k].played; best = k; }
  return best;
}

// ------------------------------------------------------------------ the "remove a card" prize (state PAGE_REMOVE)
/** cash_out: a "remove a card" prize waits -> the Pages remove screen comes before the shop (`then`: where it goes after). */
export function pageRemovePending() { return (G.GAME.page_remove || 0) > 0 && (G.playing_cards || []).length > 1; }
/** The player's pick (act page_remove {id}): the card is destroyed (the destroy contexts fire), one prize used. -> ok */
export function pageRemoveCard(card) {
  G.GAME.page_remove = Math.max(0, (G.GAME.page_remove || 0) - 1) || undefined;
  if (card.ability.name === 'Glass Card') card.shatter(); else card.start_dissolve();
  for (const j of G.jokers.cards.slice()) mod_context_effect(j, j.calculate_joker({ remove_playing_cards: true, removed: [card] }));
  return true;
}

// The next-shop prizes (G.GAME.page_shop: perks waiting for a shop; a mod that skips the shop — Bunco's The Miser — keeps them
// for the one after). run.js update_shop calls shopOpening before stocking and shopStocked after; toggle_shop calls shopClosing.
/** Before the new shop is stocked: Half off (every price, set_cost) and 3 free rerolls (on top of Chaos the Clown's). */
export function shopOpening() {
  const perks = G.GAME.page_shop;
  if (!perks || !perks.length) return;
  G.GAME.page_shop = null;
  G.GAME.page_shop_now = perks.slice();
  if (perks.includes('half_off')) G.GAME.page_half_off = true;
  const n = perks.filter((k) => k === 'rerolls').length * 3;
  if (n) {
    G.GAME.current_round.free_rerolls = (G.GAME.current_round.free_rerolls || 0) + n;
    calculate_reroll_cost(true);
  }
}
/** Once the shop is stocked: the guaranteed Negative Joker (seeded 'page_neg' + ante), then re-price under Half off. */
export function shopStocked() {
  const now = G.GAME.page_shop_now;
  if (!now) return;
  G.GAME.page_shop_now = null;
  if (now.includes('negative')) {
    const isNeg = (c) => !!(c.edition && c.edition.negative);
    let jokers = G.shop_jokers.cards.filter((c) => c.ability.set === 'Joker');
    if (!jokers.some(isNeg)) {
      const r = seeded(pseudoseed('page_neg' + G.GAME.round_resets.ante));
      if (!jokers.length && G.shop_jokers.cards.length) {
        // (no Joker in the slots: the first slot becomes one)
        const old = G.shop_jokers.cards[0];
        G.shop_jokers.remove_card(old);
        old.start_dissolve();
        const j = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'pag');
        G.shop_jokers.emplace(j, 'front');
        jokers = [j];
      }
      const j = jokers.length ? jokers[Math.floor(r() * jokers.length)] : null;
      if (j) { j.set_edition({ negative: true }, true); j.set_cost(); emit('card_changed', { card: j.sort_id }); }
    }
  }
  if (G.GAME.page_half_off) for (const a of [G.shop_jokers, G.shop_vouchers, G.shop_booster]) for (const c of a.cards) c.set_cost();
}
/** Leaving the shop: Half off ends (prices of what's left in your rows stay as bought, like Clearance Sale). */
export function shopClosing() {
  if (G.GAME.page_half_off) G.GAME.page_half_off = undefined;
}

/** As the shop opens (or the blind choice, when a mod skips the shop): the prize pack, free, like a tag's. */
export function openPagePack(use_card) {
  const key = G.GAME.page_pack;
  if (!key || !P_CENTERS[key]) return false;
  G.GAME.page_pack = null;
  const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
  card.cost = 0;
  card.from_tag = true;
  use_card(card);
  emit('materialize', { card: card.sort_id });
  return true;
}

// ------------------------------------------------------------------ text
const SHOP_PERKS = { half_off: 'Everything in the next shop is half off', rerolls: '3 free rerolls in the next shop', negative: 'A Negative Joker in the next shop' };
const SET_NAMES = { Tarot: 'Tarot', Spectral: 'Spectral', Item: 'Item', Oddity: 'Oddity' };
const centerName = (key) => {
  const c = P_CENTERS[key];
  const n = c ? localize({ type: 'name_text', set: c.set, key }) : null;
  return (n && n !== key ? n : null) || (c && c.name) || key;
};
const PRIZE_TEXT_V2 = {
  level_most: 'Level up your most played poker hand',
  enhanced_card: 'A random enhanced card added to your deck',
  hand_size: '+1 hand size next round',
  remove_card: 'Remove a card of your choice from your deck',
  interest: 'Interest cap +$5 at the next cash-out',
  joker_edition: 'Foil, Holographic or Polychrome on your leftmost Joker',
  joker_slot: '+1 Joker slot for the rest of the run',
};
const tagName = (key) => {
  const t = P_TAGS[key];
  const n = t ? localize({ type: 'name_text', set: 'Tag', key }) : null;
  return (n && n !== key ? n : null) || (t && t.name) || key;
};
export function prizeText(z) {
  if (!z) return '';
  if (z.kind === 'money') return '$' + z.amount;
  if (z.kind === 'pack') return 'a ' + centerName(z.key);
  if (z.kind === 'card') return `${centerName(z.key)} (${SET_NAMES[z.set] || z.set} card)`;
  if (z.kind === 'shop') return SHOP_PERKS[z.perk] || z.perk;
  if (z.kind === 'tag') return 'a ' + tagName(z.key);
  if (z.kind === 'joker') return `a random ${(JOKER_RARITY[z.rarity] || JOKER_RARITY[1]).name} Joker`;
  return PRIZE_TEXT_V2[z.kind] || '';
}
const pctText = (pct) => (pct > 0 ? '+' : pct < 0 ? '-' : '±') + Math.abs(pct) + '%';
export const pageLabel = (p) => (p.target === 'rank' && RANK_NAMES[p.rank] ? RANK_NAMES[p.rank] : ALL_TARGETS[p.target] ? ALL_TARGETS[p.target].name : p.target);
/** A single-card target's verb: "give" -> "gives" ("The first scored card gives +15 Chips"). */
const VERB_ONE = [['permanently gain ', 'permanently gains '], ['give ', 'gives '], ['have ', 'has '], ['cost ', 'costs '], ['are ', 'is ']];
const singular = (t) => { for (const [a, b] of VERB_ONE) if (t.startsWith(a)) return b + t.slice(a.length); return t; };
/** A v2 prize's line ("(must have room ...)" notes in grey). */
function prizeLineV2(z) {
  const t = prizeText(z);
  if (z.kind === 'tag') return `{C:attention}${t}`;
  if (z.kind === 'joker') return `{C:attention}${t}{} {C:inactive}(must have room, else its sell value)`;
  if (z.kind === 'remove_card') return `{C:attention}${t}{} {C:inactive}(after the cash-out)`;
  if (z.kind === 'joker_edition') return `{C:attention}${t}{} {C:inactive}(without one; none: $5)`;
  if (z.kind === 'level_most' || z.kind === 'enhanced_card' || z.kind === 'hand_size' || z.kind === 'interest' || z.kind === 'joker_slot') return `{C:attention}${t}`;
  return null;
}
/**
 * A Page in plain words for the screen / banner (Balatro markup: {C:...}): name + lines.
 * "Diamonds give $1 when scored / Required score +20% / Prize: a Jumbo Arcana Pack (after the cash-out)" (+ a v2 Page's
 * Round rule as a 4th line: "Round rule: -1 hand this round").
 */
export function describePage(p) {
  const tiers = p.v === 2 ? PRIZE_TIERS_V2 : PRIZE_TIERS;
  const tier = tiers.find((t) => t.tier === p.tier) || (p.v === 2 ? tierOfV2(p.difficulty, p.pct) : tierOf(p.difficulty));
  const odds = String((G.GAME && G.GAME.probabilities && G.GAME.probabilities.normal) || 1);
  const E = p.v === 2 ? ALL_EFFECTS : PAGE_EFFECTS;
  let eff = (E[p.effect] ? E[p.effect].text : p.effect).replace('#1#', odds);
  if (p.effect === 'become') eff = eff.replace('#2#', centerName(p.enh));
  const T = ALL_TARGETS[p.target];
  if (p.v === 2 && T && T.one) eff = singular(eff);
  const z = p.prize || {};
  const prize = z.kind === 'shop' ? `{C:attention}${prizeText(z)}{}${z.perk === 'half_off' ? ' {C:inactive}(not rerolls)' : ''}`
    : z.kind === 'pack' ? `${prizeText(z)} {C:inactive}(opened after the cash-out)`
    : z.kind === 'card' ? `${prizeText(z)} {C:inactive}(must have room, else $${Math.max(1, (P_CENTERS[z.key] && P_CENTERS[z.key].cost) || 3)})`
    : (p.v === 2 && prizeLineV2(z)) || `{C:money}${prizeText(z)}`;
  const who = p.v === 2 && p.target === 'rank' ? `{C:attention}${pageLabel(p)}{} {C:inactive}(this Page's rank){}` : `{C:attention}${pageLabel(p)}{}`;
  const lines = [`${who} ${eff}`, `Required score {C:${p.pct > 0 ? 'red' : p.pct < 0 ? 'green' : 'inactive'}}${pctText(p.pct)}`, `Prize: ${prize}`];
  if (p.v === 2 && p.rule && ROUND_RULES[p.rule]) lines.push(`Round rule: ${ROUND_RULES[p.rule].text}`);
  return { name: `${tier.name} Page`, tier: tier.tier, lines };
}
/** The view of a Page (view.js): its parts + its text. */
export function pageView(p) {
  if (!p) return null;
  const v = { target: p.target, effect: p.effect, pct: p.pct, tier: p.tier, difficulty: p.difficulty, prize: { ...p.prize }, down: !!(PAGE_EFFECTS[p.effect] && PAGE_EFFECTS[p.effect].down), desc: describePage(p) };
  if (p.v === 2) Object.assign(v, { v: 2, down: !!(ALL_EFFECTS[p.effect] && ALL_EFFECTS[p.effect].down), ...(p.rule ? { rule: p.rule } : {}), ...(p.rank ? { rank: p.rank } : {}), ...(p.enh ? { enh: p.enh } : {}) });
  return v;
}
