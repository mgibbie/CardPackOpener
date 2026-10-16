// More Fluff — the Colour consumable type (other/colours.lua): 17 base cards that sit in the consumable
// slots and CHARGE: every round a Colour card gains a round (Paint Roller / Paint Can may add more), and each
// `upgrade_rounds` rounds its value `val` goes up; using it does its effect `val` times. Colour cards are
// TAKEN from packs (never used there). 4 Colour packs, Painter's Tag, Paint Roller / Colour Theory vouchers.
// Charging happens once per won round, at the round evaluation (Game:update_round_eval ->
// colour_end_of_round_effects), here the evaluate_round hook.
import {
  G, P_CENTERS, create_card, card_eval_status_text, localize, play_sound, pseudorandom, pseudorandom_element,
  pseudoseed, probability_vars, probability_roll, ease_dollars,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { DATA, find, progressbar } from './util.js';
import { track_last, destroy_random_hand, open_free_pack } from './rotarots.js';

/** trigger_colour_end_of_round(card): one round for this Colour card (+1 per Paint Roller / Paint Can hit). */
export function trigger_colour_end_of_round(card) {
  if (card.ability.mf_halted) return false;
  if (card.ability.set !== 'Colour') return undefined;
  let base_count = 1;
  if (G.GAME.used_vouchers.v_mf_paintroller && probability_roll(P_CENTERS.v_mf_paintroller, 'paintroller', 1, 2, 'paintroller')) base_count += 1;
  for (const jkr of find('j_mf_paintcan')) if (probability_roll(jkr, 'paintcan', 1, jkr.ability.extra.odds, 'paintcan')) base_count += 1;
  for (let j = 0; j < base_count; j++) {
    if (!card.ability.upgrade_rounds) continue;
    card.ability.partial_rounds += 1;
    let upgraded = false;
    while (card.ability.partial_rounds >= card.ability.upgrade_rounds) {
      upgraded = true;
      card.ability.val += 1;
      card.ability.partial_rounds -= card.ability.upgrade_rounds;
      if (card.ability.name === 'col_Yellow') {
        card.ability.extra_value += card.ability.value_per;
        card.set_cost();
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_val_up'), colour: 'MONEY' });
      } else {
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'Colour' });
      }
    }
    if (!upgraded) card_eval_status_text(card, 'extra', null, null, null, { message: card.ability.partial_rounds + '/' + card.ability.upgrade_rounds, colour: 'Colour' });
  }
  return true;
}
export function colour_end_of_round_effects() {
  for (const c of G.consumeables.cards.slice()) trigger_colour_end_of_round(c);
}
/** n_random_colour_rounds(n, seed): Pink — a round each for n random held Colour cards. */
export function n_random_colour_rounds(n, seed) {
  for (let i = 0; i < n; i++) {
    const pool = G.consumeables.cards.filter((v) => v.ability.set === 'Colour');
    if (!pool.length) break;
    const [c] = pseudorandom_element(pool, pseudoseed(seed || 'pink'));
    trigger_colour_end_of_round(c);
  }
}

const colour = (key, def) => {
  const s = DATA.consumables.find((c) => c.key === key && c.set === 'Colour');
  return {
    key: 'c_mf_' + key, set: 'Colour', name: s.name, consumeable: true, cost: s.cost, pos: s.pos, atlas: 'mf_colours',
    hidden: s.hidden || undefined, config: JSON.parse(JSON.stringify(s.config)),
    loc_vars(self, iq, card) {
      const a = card && card.ability && card.ability.upgrade_rounds !== undefined ? card.ability : self.config;
      const [v, m] = progressbar(a.partial_rounds, a.upgrade_rounds);
      if (def.info) def.info(iq);
      return { vars: [a.val, v, m, a.upgrade_rounds, ...(def.extra_vars ? def.extra_vars(a) : [])] };
    },
    // Taken from a pack, never used there (the Lua replaces the pack's Use button with TAKE).
    can_use: (self, card) => card.area !== G.pack_cards && def.can_use(card),
    use(self, card, area, copier) { track_last(card); def.use(card, copier || card); },
  };
};
const repeat_event = (card, fn) => { for (let i = 0; i < card.ability.val; i++) G.E_MANAGER.add_event(fn); };
/** Deep Blue / Seaweed / Red / Orange: `val` random hand cards not of the suit become it. */
const suit_colour = (key, suit, seed) => colour(key, {
  can_use: () => G.hand.cards.length > 1,
  use(card) {
    const blacklist = new Set();
    for (let i = 0; i < card.ability.val; i++) {
      const pool = G.hand.cards.filter((v) => !v.is_suit(suit) && !blacklist.has(v));
      if (!pool.length) break;
      const [c] = pseudorandom_element(pool, pseudoseed(seed));
      blacklist.add(c);
      G.E_MANAGER.add_event(() => { c.flip(); play_sound('card1', 1); });
      G.E_MANAGER.add_event(() => { c.flip(); play_sound('tarot2'); c.change_suit(suit); });
      card.juice_up(0.3, 0.5);
    }
  },
});
const tag_colour = (key, tag_type) => colour(key, {
  can_use: () => true,
  use(card) { repeat_event(card, () => { add_tag(new Tag(tag_type)); play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4); }); },
});
/** White / Blue / Lilac / Peach / Gold / Green: `val` Negative copies of a type (or a forced key). */
const make_colour = (key, set, seed, forced, area) => colour(key, {
  can_use: () => true,
  info: forced === 'j_mf_oopsallfives' ? (iq) => iq.push({ key: forced, set: 'Joker' }) : undefined,
  use(card) {
    repeat_event(card, () => {
      play_sound('timpani');
      const n = create_card(set, G.consumeables, null, null, null, null, forced || null, seed);
      n.add_to_deck();
      n.set_edition({ negative: true }, true);
      (area === 'jokers' ? G.jokers : G.consumeables).emplace(n);
      card.juice_up(0.3, 0.5);
    });
  },
});

export const centers = [
  colour('black', {
    // FIX (intended design): the Lua's can_use tested `v.edition.egative` (a typo, always nil), so Black was
    // usable with only Negative jokers and then did nothing. It needs a joker that isn't Negative yet.
    can_use: () => G.jokers.cards.some((v) => v.ability.set === 'Joker' && (!v.edition || !v.edition.negative)),
    use(card) {
      repeat_event(card, () => {
        const temp = G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !v.edition);
        const backup = G.jokers.cards.filter((v) => v.ability.set === 'Joker' && v.edition && !v.edition.negative);
        const pool = temp.length ? temp : backup;
        if (!pool.length) return;
        const [c] = pseudorandom_element(pool, pseudoseed('black'));
        c.set_edition({ negative: true }, true);
        card.juice_up(0.3, 0.5);
      });
    },
  }),
  suit_colour('deepblue', 'Spades', 'deepblue'),
  tag_colour('crimson', 'tag_rare'),
  suit_colour('seaweed', 'Clubs', 'seaweed'),
  colour('brown', {
    can_use: () => G.hand.cards.length > 1,
    extra_vars: (a) => [a.cash_per],
    use(card) {
      destroy_random_hand(card.ability.val, card);
      ease_dollars(card.ability.cash_per * card.ability.val);
    },
  }),
  tag_colour('grey', 'tag_double'),
  tag_colour('silver', 'tag_polychrome'),
  make_colour('white', 'Colour', 'white'),
  suit_colour('red', 'Hearts', 'red'),
  suit_colour('orange', 'Diamonds', 'orange'),
  colour('yellow', { can_use: () => false, extra_vars: (a) => [a.value_per], use() {} }),
  make_colour('green', null, 'sup', 'j_mf_oopsallfives', 'jokers'),
  make_colour('blue', 'Planet', 'blue'),
  make_colour('lilac', 'Tarot', 'blue'),
  colour('pink', { can_use: () => true, use(card) { n_random_colour_rounds(card.ability.val); } }),
  make_colour('peach', 'Rotarot', 'peach'),
  make_colour('new_gold', null, 'sup', 'c_soul'),
];

// ------------------------------------------------------------- packs / tag / vouchers
const PACK = (key) => {
  const s = DATA.boosters.find((b) => b.key === key);
  return {
    key: 'p_mf_' + key, set: 'Booster', name: s.key, kind: 'Colour', cost: s.cost, weight: s.weight, pos: s.pos, atlas: 'mf_packs',
    config: JSON.parse(JSON.stringify(s.config)),
    loc_vars: (self, iq, card) => ({ vars: [self.config.choose, (card && card.ability && card.ability.extra) ?? self.config.extra] }),
    create_card() {
      const n = create_card('Colour', G.pack_cards, null, null, true, true, null, 'mf_colour');
      const ed_roll = pseudorandom('colour_editionroll');
      if (ed_roll < 0.4 && G.GAME.used_vouchers.v_mf_colourtheory) n.set_edition({ polychrome: true }, true);
      // (0.4 <= roll < 0.766666 + Art Program: a Cryptid-only voucher, not ported)
      return n;
    },
  };
};
for (const k of ['colour_normal_1', 'colour_normal_2', 'colour_jumbo_1', 'colour_mega_1']) centers.push(PACK(k));
centers.push(
  {
    key: 'v_mf_paintroller', set: 'Voucher', name: 'v_mf_paintroller', cost: 10, available: true, pos: { x: 0, y: 0 }, atlas: 'mf_vouchers', config: {},
    loc_vars: (self) => { const [n, d] = probability_vars(self, 1, 2, 'paintroller'); return { vars: [n, d] }; },
  },
  {
    key: 'v_mf_colourtheory', set: 'Voucher', name: 'v_mf_colourtheory', cost: 10, available: true, pos: { x: 1, y: 0 }, atlas: 'mf_vouchers', config: {},
    requires: ['v_mf_paintroller'], loc_vars: () => ({ vars: [] }),
  },
);
export const tags = [{
  key: 'tag_mf_colour', name: 'tag_mf_colour', set: 'Tag', atlas: 'mf_tags', pos: { x: 0, y: 0 }, config: {},
  loc_vars: () => ({ vars: [] }),
  apply(self, tag, context) {
    if (context.type === 'new_blind_choice') {
      tag.yep('+', 'Colour', () => { open_free_pack('p_mf_colour_jumbo_1'); return true; });
      tag.triggered = true;
      return true;
    }
  },
}];
export const consumable_types = [{ key: 'Colour', name: 'Colour', shop_rate: 1, default: 'c_mf_deepblue', primary_colour: '#4f6367', secondary_colour: '#4f6367' }];

export const hooks = {
  /** Game:update_round_eval -> colour_end_of_round_effects (once per won round). */
  evaluate_round() { colour_end_of_round_effects(); return undefined; },
  /** G.FUNCS.reserve_card: a Colour card in a pack is TAKEN into the consumable slots. */
  can_reserve: (card) => (card.ability.set === 'Colour' ? true : undefined),
  view_card(card, v) {
    if (card.area === G.pack_cards && card.ability.set === 'Colour') { v.no_use = true; v.reserve = true; v.reserve_label = localize('b_take'); }
  },
};
