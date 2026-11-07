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
// Randomness: everything a Page rolls has its own seed keys ('pages' + ante + blind for the offer, 'page_tarot' for the
// 1 in 4 Tarot, 'pag' as the created cards' key_append), so a Pages run's other streams (shop, packs, bosses) are the
// same as they would be without them, and a seed always offers the same Pages.

import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, emit, card_eval_status_text, ease_dollars, create_card, localize, pseudoseed, seeded,
  probability_roll, mod_chips, mod_mult, calculate_reroll_cost,
} from './core.js';
import * as B from './bignum.js';
import { opt, centerActive, activeConsumableTypes } from '../mods/registry.js';

/** The engine rules rev Pages arrive with (mods/pins.js ENGINE_CONTENT_REV). */
export const PAGES_REV = 2;

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
 * card is its target. -> [hand_chips, mult]
 */
export function pageIndividual(sc, hand_chips, mult) {
  const p = G.GAME.page;
  if (!p || !PAGE_TARGETS[p.target] || !PAGE_TARGETS[p.target].test(sc)) return [hand_chips, mult];
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
    default:
  }
  return [hand_chips, mult];
}

/**
 * A card the PLAYER discards (run.js discard_cards_from_highlighted; not The Hook's): a "become Lucky / Bonus" Page rolls
 * 1 in 4 (Oops! All 6s raises it) for each discarded target card that has no enhancement yet (an enhanced card keeps its own).
 */
export function pageDiscard(c) {
  const p = G.GAME.page;
  const enh = p && PAGE_EFFECTS[p.effect] && PAGE_EFFECTS[p.effect].discard;
  if (!enh || !P_CENTERS[enh] || !PAGE_TARGETS[p.target].test(c)) return;
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
  return 0;
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
export function prizeText(z) {
  if (!z) return '';
  if (z.kind === 'money') return '$' + z.amount;
  if (z.kind === 'pack') return 'a ' + centerName(z.key);
  if (z.kind === 'card') return `${centerName(z.key)} (${SET_NAMES[z.set] || z.set} card)`;
  if (z.kind === 'shop') return SHOP_PERKS[z.perk] || z.perk;
  return '';
}
const pctText = (pct) => (pct > 0 ? '+' : pct < 0 ? '-' : '±') + Math.abs(pct) + '%';
export const pageLabel = (p) => `${PAGE_TARGETS[p.target] ? PAGE_TARGETS[p.target].name : p.target}`;
/**
 * A Page in plain words for the screen / banner (Balatro markup: {C:...}): name + lines.
 * "Diamonds give $1 when scored / Required score +20% / Prize: a Jumbo Arcana Pack (after the cash-out)".
 */
export function describePage(p) {
  const tier = PRIZE_TIERS.find((t) => t.tier === p.tier) || tierOf(p.difficulty);
  const odds = String((G.GAME && G.GAME.probabilities && G.GAME.probabilities.normal) || 1);
  const eff = (PAGE_EFFECTS[p.effect] ? PAGE_EFFECTS[p.effect].text : p.effect).replace('#1#', odds);
  const z = p.prize || {};
  const prize = z.kind === 'shop' ? `{C:attention}${prizeText(z)}{}${z.perk === 'half_off' ? ' {C:inactive}(not rerolls)' : ''}`
    : z.kind === 'pack' ? `${prizeText(z)} {C:inactive}(opened after the cash-out)`
    : z.kind === 'card' ? `${prizeText(z)} {C:inactive}(must have room, else $${Math.max(1, (P_CENTERS[z.key] && P_CENTERS[z.key].cost) || 3)})`
      : `{C:money}${prizeText(z)}`;
  return {
    name: `${tier.name} Page`, tier: tier.tier,
    lines: [`{C:attention}${pageLabel(p)}{} ${eff}`, `Required score {C:${p.pct > 0 ? 'red' : p.pct < 0 ? 'green' : 'inactive'}}${pctText(p.pct)}`, `Prize: ${prize}`],
  };
}
/** The view of a Page (view.js): its parts + its text. */
export function pageView(p) {
  if (!p) return null;
  return { target: p.target, effect: p.effect, pct: p.pct, tier: p.tier, difficulty: p.difficulty, prize: { ...p.prize }, down: !!(PAGE_EFFECTS[p.effect] && PAGE_EFFECTS[p.effect].down), desc: describePage(p) };
}
