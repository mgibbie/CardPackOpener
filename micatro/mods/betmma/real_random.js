// BETMMA — Real Random (fusion of Crystal Ball + Omnicard): Lucky Cards get 3 random abilities from a
// weighted table (Betmma_Vouchers.lua real_random_data); a card stores them on a copy of its center
// (`config.center.real_random_abilities`, mirrored in `ability.real_random_abilities`), like the Lua.
// Over-retriggered cards (Mirror / retrigger_next past 50 retriggers) scale their values instead.
import { G, copy_table, pseudorandom, pseudoseed, get_next_tag_key, LOC } from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { used, vcfg, randomly_redeem_voucher, randomly_create_joker, pseudorandom_element_weighted, get_weight } from './common.js';
import { LOC_REAL_RANDOM } from './loc.js';

export const REAL_RANDOM_COLLAPSE_AMOUNT = 10;

/** The joker / consumable / voucher / tag abilities (calc_function) run when the card is main-scored. */
function calc_function_template(card, key, func) {
  let loc_vars = real_random_loc_def(card.config.center, key);
  const dynamic_chance = loc_vars === undefined;
  const ability = card.config.center.real_random_abilities.values[key];
  const r = card.ability.over_retriggered_ratio;
  const over_retriggered = r && r > 1 ? r : 1;
  if (ability.num < REAL_RANDOM_COLLAPSE_AMOUNT) {
    for (let i = 0; i < ability.num; i++) {
      if (dynamic_chance) loc_vars = real_random_loc_def(card.config.center, key, ability.values[i]);
      if (!loc_vars) continue;
      if (pseudorandom(key) < G.GAME.probabilities.normal / loc_vars[1]) {
        card.lucky_trigger = true;
        func(card, loc_vars[0] * over_retriggered);
      }
    }
  } else {
    const ret = Math.floor(get_real_random_ability_average(card.config.center, key) * over_retriggered);
    if (ret > 0) { card.lucky_trigger = true; func(card, ret); }
  }
}
const play_right_of = (card) => {
  const index = G.play.cards.indexOf(card);
  return index >= 0 && index < G.play.cards.length - 1 ? G.play.cards[index + 1] : null;
};

// real_random_data (key order = the Lua table's)
export const REAL_RANDOM_DATA = {
  chip: { chance_range: [1, 15], base_value_function: (c) => 25 * Math.ceil(Math.pow(c, 1.2)) },
  mult: { chance_range: [1, 15], base_value_function: (c) => 4 * Math.ceil(Math.pow(c, 1.2)) },
  x_mult: { chance_range: [4, 30], base_value_function: (c) => Math.ceil(Math.pow(c, 1.2)) / 10 + 1 },
  dollars: { chance_range: [10, 50], base_value_function: (c) => Math.ceil(Math.pow(c, 1.2)) },
  joker_slot: {
    weight: 0.15, chance_range: [777, 777], base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'joker_slot', (c, times) => {
      G.E_MANAGER.add_event(() => { if (G.jokers) G.jokers.config.card_limit = G.jokers.config.card_limit + times; });
    }),
  },
  consumable_slot: {
    weight: 0.15, chance_range: [177, 177], base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'consumable_slot', (c, times) => {
      G.E_MANAGER.add_event(() => { if (G.consumeables) G.consumeables.config.card_limit = G.consumeables.config.card_limit + times; });
    }),
  },
  random_voucher: {
    weight: 0.15, chance_range: [77, 77], base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'random_voucher', (c, times) => { for (let i = 1; i <= times; i++) randomly_redeem_voucher(); }),
  },
  random_negative_joker: {
    weight: 0.15, chance_range: [77, 77], base_value_function: () => 1,
    // FIX 5: the Lua loops `for i=1,times do randomly_create_joker(times, ...)`, creating times² jokers when
    // an ability collapses (10+ of a kind) or is over-retriggered; the text promises one per trigger.
    calc_function: (card) => calc_function_template(card, 'random_negative_joker', (c, times) => random_negative_jokers(times)),
  },
  new_ability: {
    weight: 0.15,
    chance_function: (center) => Math.max(Math.pow(center.real_random_abilities.num - 1, 2), 8),
    base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'new_ability', (c, times) => real_random_add_abilities_to_card(c, times)),
  },
  double_probability: {
    weight: 0.1,
    chance_function: () => Math.ceil(4.938 * Math.pow(G.GAME.probabilities.normal + 0.5, 2)),
    base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'double_probability', (c, times) => {
      for (const k of Object.keys(G.GAME.probabilities)) G.GAME.probabilities[k] = G.GAME.probabilities[k] * Math.pow(2, times);
    }),
  },
  random_tag: {
    weight: 0.25,
    chance_function: () => 7 * Math.pow(4, Math.max(G.GAME.tags.length - 3, 0)),
    base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'random_tag', (c, times) => {
      const key = get_next_tag_key();
      // (port note: the Lua adds one Tag object `times` times; separate tags behave the same and keep
      // the tag list free of duplicates)
      G.E_MANAGER.add_event(() => { for (let i = 1; i <= times; i++) add_tag(new Tag(key, false, 'Small')); });
    }),
  },
  retrigger_next: {
    weight: 0.1, chance_range: [3, 25], base_value_function: (c) => Math.max(Math.ceil(Math.log(c)) - 1, 1),
    calc_function: (card) => calc_function_template(card, 'retrigger_next', (c, times) => {
      const right = play_right_of(c);
      if (right) right.ability.temp_repetition = (right.ability.temp_repetition || 0) + times;
    }),
  },
  hand_size: {
    weight: 0.15,
    chance_function: () => Math.ceil(2.5 * Math.pow(Math.max(G.hand.config.card_limit, 8) - 4, 2.5)),
    base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'hand_size', (c, times) => G.hand.change_size(times)),
  },
  transfer_ability: {
    weight: 0.05, chance_range: [77, 77], base_value_function: () => 1,
    calc_function: (card) => calc_function_template(card, 'transfer_ability', (c, times) => {
      const right = play_right_of(c);
      if (right) real_random_add_abilities_to_card(right, times);
    }),
  },
};
const KEYS = Object.keys(REAL_RANDOM_DATA);
export function random_negative_jokers(times) {
  randomly_create_joker(times, 'random_negative_joker', null, { edition: { negative: true } });
}

/** log_random(lower, upper): a log-uniform chance. */
function log_random(lower, upper) {
  const u = pseudorandom('real_random');
  return lower * Math.exp(u * Math.log(upper / lower));
}
/** real_random_loc_def(center, key, loc_vars) -> [value, chance] (or the stored loc_vars). */
export function real_random_loc_def(center, key, loc_vars) {
  const d = REAL_RANDOM_DATA[key];
  if (d.chance_range) {
    if (d.chance_range[0] === d.chance_range[1]) return [d.base_value_function(d.chance_range[0]), d.chance_range[0]];
    return loc_vars;
  }
  const chance = d.chance_function(center);
  return [d.base_value_function(chance), Math.ceil(chance)];
}
export function real_random_get_random_ability() {
  const entries = KEYS.map((k) => [k, REAL_RANDOM_DATA[k]]);
  const [, key] = pseudorandom_element_weighted(entries, pseudoseed('real_random'), get_weight);
  const d = REAL_RANDOM_DATA[key];
  const ability = { key };
  if (d.chance_range && d.chance_range[0] !== d.chance_range[1]) {
    const chance = log_random(d.chance_range[0], d.chance_range[1]);
    ability.loc_vars = [d.base_value_function(chance), Math.ceil(chance)];
  }
  return ability;
}
export function real_random_empty_abilities_table() {
  const ret = { num: 0, values: {} };
  for (const k of KEYS) ret.values[k] = { num: 0, values: [] };
  return ret;
}
function real_random_add_ability_to_card(card, ability) {
  const abilities = card.config.center.real_random_abilities || real_random_empty_abilities_table();
  abilities.num = abilities.num + 1;
  const target = abilities.values[ability.key];
  target.num = target.num + 1;
  if (ability.loc_vars && target.num < REAL_RANDOM_COLLAPSE_AMOUNT) target.values.push(ability.loc_vars);
}
export function real_random_add_abilities_to_card(v, times) {
  v.config.center = copy_table(v.config.center);
  if (!v.config.center.real_random_abilities) v.config.center.real_random_abilities = real_random_empty_abilities_table();
  const n = times ?? vcfg('real_random').extra.ability;
  for (let i = 1; i <= n; i++) real_random_add_ability_to_card(v, real_random_get_random_ability());
  v.ability.real_random_abilities = v.config.center.real_random_abilities;
}
export function real_random_merge_two_abilities(abilitiesA, abilitiesB) {
  if (!abilitiesB) return abilitiesA;
  if (!abilitiesA) abilitiesA = real_random_empty_abilities_table();
  for (const [key, v] of Object.entries(abilitiesB.values)) {
    abilitiesA.num = abilitiesA.num + v.num;
    abilitiesA.values[key].num = abilitiesA.values[key].num + v.num;
    if (v.num <= REAL_RANDOM_COLLAPSE_AMOUNT && v.values.length > 0) abilitiesA.values[key].values.push(...v.values);
  }
  return abilitiesA;
}
function get_real_random_ability_average(center, key) {
  const d = REAL_RANDOM_DATA[key];
  if (!d) return 0;
  let chance;
  if (d.chance_range) { const [lower, upper] = d.chance_range; chance = lower * Math.exp(0.5 * Math.log(upper / lower)); }
  else chance = d.chance_function(center);
  if (key === 'x_mult') return Math.exp(Math.log(d.base_value_function(chance)) * Math.min(1, G.GAME.probabilities.normal / chance));
  return d.base_value_function(chance) * Math.min(1, G.GAME.probabilities.normal / chance);
}

// ----------------------------------------------------------------- the card getters (Card wraps)
const active = (card) => used('real_random') && !card.debuff && card.config.center.real_random_abilities;
const ratio = (card) => (card.ability.over_retriggered_ratio && card.ability.over_retriggered_ratio > 1 ? card.ability.over_retriggered_ratio : 0);
/** Sum (or product) of one ability kind's triggered values; marks the card's lucky trigger. */
function roll_kind(card, key, ret, combine) {
  const ab = card.config.center.real_random_abilities.values[key];
  if (ab.num < REAL_RANDOM_COLLAPSE_AMOUNT) {
    for (const v of ab.values) {
      const lv = real_random_loc_def(card.config.center, key, v);
      if (pseudorandom('lucky_' + key) < G.GAME.probabilities.normal / lv[1]) {
        card.lucky_trigger = true;
        if (card._betmma_rr) card._betmma_rr.trig = true;
        ret = combine(ret, lv[0]);
      }
    }
  } else {
    card.lucky_trigger = true;
    if (card._betmma_rr) card._betmma_rr.trig = true;
    const avg = get_real_random_ability_average(card.config.center, key);
    ret = key === 'x_mult' ? ret * Math.pow(avg, ab.num) : ret + avg * ab.num;
  }
  return ret;
}
/** FIX 4 helper: the Lucky Card's own (hidden) rolls don't count as its lucky trigger under Real Random. */
const own_lucky = (card) => card.ability.effect === 'Lucky Card';
const clear_vanilla_trigger = (card) => { card.lucky_trigger = card._betmma_rr && card._betmma_rr.trig ? true : undefined; };

export function chip_bonus(ret, card) {
  card._betmma_rr = { trig: false }; // (the first getter eval_card calls for a played card)
  if (active(card)) ret = roll_kind(card, 'chip', ret, (a, b) => a + b);
  const r = ratio(card);
  if (r) ret = ret * r;
  return ret;
}
export function chip_mult(ret, card) {
  if (active(card)) {
    if (own_lucky(card)) { ret = 0; clear_vanilla_trigger(card); } // "to override the original lucky card mult"
    ret = roll_kind(card, 'mult', ret, (a, b) => a + b);
  }
  const r = ratio(card);
  if (r) ret = ret * r;
  return ret;
}
export function chip_x_mult(ret, card) {
  if (active(card)) {
    if (!ret) ret = 1;
    ret = roll_kind(card, 'x_mult', ret, (a, b) => a * b);
    if (ret === 1) ret = 0;
  }
  const r = ratio(card);
  if (r) ret = Math.pow(ret, r);
  return ret;
}
export function p_dollars(ret, card) {
  let ret_ref = ret;
  if (active(card)) {
    if (own_lucky(card)) {
      // FIX 4 (intended design): the Lua zeroes the Lucky Card's own Mult under Real Random but forgot its
      // 1 in 15 $20, which kept paying although the card's text now lists only its random abilities.
      const vanilla_money = ret - (card.seal === 'Gold' ? 3 : 0);
      if (vanilla_money > 0) { ret -= vanilla_money; ret_ref = ret; G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) - vanilla_money; }
      clear_vanilla_trigger(card);
    }
    ret = roll_kind(card, 'dollars', ret, (a, b) => a + b);
  }
  const r = ratio(card);
  if (r) ret = ret * r;
  if (ret_ref > 0) G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + ret - ret_ref;
  return ret;
}
/** eval_card (main scoring of a played card): the other abilities. */
export function main_scoring(card) {
  if (!active(card)) return;
  for (const k of KEYS) if (REAL_RANDOM_DATA[k].calc_function) REAL_RANDOM_DATA[k].calc_function(card);
}

// ----------------------------------------------------------------- description (generate_card_ui wrap)
const LUCKY_TEMPLATES = ((LOC.descriptions.Enhanced && LOC.descriptions.Enhanced.m_lucky && LOC.descriptions.Enhanced.m_lucky.text) || [])
  .map((t) => new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#\d+#/g, '.*?') + '$'));
const fmt = (v) => (typeof v === 'number' ? String(Number(v.toPrecision(14))) : String(v));
const fill = (lines, vars) => lines.map((l) => l.replace(/#(\d+)#/g, (m, n) => (vars[n - 1] !== undefined ? fmt(vars[n - 1]) : m)));
const rr_lines = (key, vars) => fill((LOC_REAL_RANDOM['betmma_real_random_' + key] || { text: [] }).text, vars);
export function describe(card, desc) {
  if (!used('real_random') || !desc || !Array.isArray(desc.lines)) return;
  const center = card.config.center;
  if (!(card.ability.effect === 'Lucky Card' || center.real_random_abilities)) return;
  if (card.ability.effect === 'Lucky Card') desc.lines = desc.lines.filter((l) => !LUCKY_TEMPLATES.some((re) => re.test(l)));
  const abilities = center.real_random_abilities;
  if (!abilities) return;
  const normal = G.GAME.probabilities.normal;
  for (const [key, v] of Object.entries(abilities.values)) {
    if (v.values.length === 0 && v.num > 0) {
      const lv = real_random_loc_def(center, key) || [];
      desc.lines.push(...rr_lines(key, [normal, ...lv]));
      if (v.num > 1) desc.lines.push(...fill(LOC_REAL_RANDOM.betmma_multiples.text, [v.num]));
    } else if (v.num > 0) {
      for (let i = 0; i < Math.min(2 + (v.num === 3 ? 1 : 0), v.num); i++) {
        const lv = real_random_loc_def(center, key, v.values[i]) || [];
        desc.lines.push(...rr_lines(key, [normal, ...lv]));
      }
      if (v.num > 3) desc.lines.push(...fill(LOC_REAL_RANDOM.betmma_ellipsis.text, [v.num - 2]));
    }
  }
}
