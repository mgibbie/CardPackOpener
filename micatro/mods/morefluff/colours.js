// More Fluff 1.9.9999 — the Colour consumable type (src/colours.lua): 16 Colour cards that sit in the consumable
// slots and CHARGE — every round a Colour card gains a round (Paint Roller / Paint Can may add more) and each
// `upgrade_rounds` rounds its value `val` goes up; using it does its effect `val` times. Colour cards are TAKEN from
// packs (never used there). Gold (c_mf_new_gold) is now a hidden SPECTRAL that charges like a Colour card
// (is_colour) and turns up in Colour packs like The Soul (soul_set = Colour). 4 Colour packs, the Colour Tag
// (Painter's Tag), Paint Roller / Colour Theory vouchers.
//
// 1.9.9999 reworks (from 1.5.6): Deep Blue, Red and Orange no longer change suits — each use gives a random hand
// card +20 Chips / +4 Mult / a retrigger for good (perma_bonus / perma_mult / perma_repetitions); Seaweed gives
// random hand cards a random enhancement; Black needs 5 rounds a level, Deep Blue / Seaweed / Red 2, Orange 4.
// Charging happens once per won round (mod calculate, end_of_round): here the evaluate_round hook.
// PORT NOTE: Deep Blue / Red / Orange pick their card with pseudorandom_element(G.hand.cards, rng_seed) where
// rng_seed is an undefined global (nil: Lua math.random, unseeded); seeded here by the card's key.
import {
  G, P_CENTERS, create_card, card_eval_status_text, localize, play_sound, pseudorandom, pseudorandom_element,
  pseudoseed, pseudoshuffle, probability_vars, probability_roll, ease_dollars,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { DATA, find, progressbar, is_colour, poll_enhancement, destroy_cards } from './util.js';
import { track_last, open_free_pack } from './rotarots.js';

/** trigger_colour_end_of_round(card): one round for this Colour card (+1 per Paint Roller / Paint Can hit). */
export function trigger_colour_end_of_round(card) {
  if (card.ability.mf_halted) return false;
  if (!is_colour(card)) return undefined;
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
    const pool = G.consumeables.cards.filter((v) => is_colour(v));
    if (!pool.length) break;
    const [c] = pseudorandom_element(pool, pseudoseed(seed || 'pink'));
    trigger_colour_end_of_round(c);
  }
}

/** FLUFF.Colour(def): a center from data.js plus the Colour base behaviour (loc_vars / set_ability / can_use / use). */
const colour = (key, def = {}) => {
  const s = DATA.consumables.find((c) => c.key === key && c.is_colour);
  const set = s.set || 'Colour';
  const center = {
    key: 'c_mf_' + key, set, name: s.name, consumeable: true, cost: s.cost, pos: s.pos, atlas: 'mf_colours',
    hidden: s.hidden || undefined, soul_set: s.soul_set, is_colour: true, config: JSON.parse(JSON.stringify(s.config)),
    set_ability(self, card) {
      card.ability.val = card.ability.val || 0;
      card.ability.partial_rounds = card.ability.partial_rounds || 0;
    },
    loc_vars(self, iq, card) {
      const a = card && card.ability && card.ability.upgrade_rounds !== undefined ? card.ability : { ...self.config, val: 0, partial_rounds: 0 };
      const [v, m] = progressbar(a.partial_rounds, a.upgrade_rounds);
      if (def.info) def.info(iq);
      return { vars: [a.val || 0, v, m, a.upgrade_rounds, ...(def.extra_vars ? def.extra_vars(a) : [])] };
    },
    // Taken from a pack, never used there (Colour packs' cards are select_card = consumeables).
    can_use(self, card) {
      if (card.area === G.pack_cards) return false;
      if (def.can_use) return !!def.can_use(card);
      const a = card.ability;
      if (a.suit || a.enhancement) return G.hand.cards.length >= 1;
      return !!(a.tag || a.create_set || a.create_key);
    },
    use(self, card, area, copier) {
      if (!self.hidden) track_last(card);
      if (def.use) { def.use(card, copier || card); return; }
      const a = card.ability;
      if (a.tag) {
        for (let i = 0; i < a.val; i++) G.E_MANAGER.add_event(() => { add_tag(new Tag(a.tag)); play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4); });
      }
      if (a.create_set || a.create_key) {
        // SMODS.add_card{set / key, edition = 'e_negative'} (no key_append; the set's own area)
        for (let i = 0; i < a.val; i++) {
          G.E_MANAGER.add_event(() => {
            play_sound('timpani');
            const n = create_card(a.create_set || null, G.consumeables, null, null, null, null, a.create_key || null, undefined);
            n.set_edition({ negative: true }, true);
            n.add_to_deck();
            (n.ability.set === 'Joker' ? G.jokers : G.consumeables).emplace(n);
            card.juice_up(0.3, 0.5);
          });
        }
      }
      if (def.colour_effect) for (let i = 0; i < a.val; i++) def.colour_effect(card);
    },
  };
  return center;
};
/** Deep Blue / Red / Orange: a random hand card gains a permanent bonus (each use of `val` picks again). */
const perma_colour = (key, stat, per) => colour(key, {
  can_use: () => G.hand.cards.length >= 1,
  extra_vars: per ? (a) => [a[per]] : undefined,
  colour_effect(card) {
    const [c] = pseudorandom_element(G.hand.cards, pseudoseed(key));
    if (!c) return;
    c.ability[stat] = (c.ability[stat] || 0) + (per ? card.ability[per] : 1);
    G.E_MANAGER.add_event(() => { play_sound(stat === 'perma_mult' ? 'multhit1' : stat === 'perma_bonus' ? 'chips1' : 'tarot2', 1, 0.6); c.juice_up(0.3, 0.3); });
  },
});

export const centers = [
  colour('black', {
    // (the 1.5.6 `v.edition.egative` typo is fixed upstream: it needs a joker that isn't Negative yet)
    can_use: () => G.jokers.cards.some((v) => v.ability.set === 'Joker' && (!v.edition || !v.edition.negative)),
    colour_effect(card) {
      G.E_MANAGER.add_event(() => {
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
  perma_colour('deepblue', 'perma_bonus', 'chips_per'),
  colour('crimson'),
  colour('seaweed', {
    can_use: () => G.hand.cards.length >= 1,
    use(card) {
      const blacklist = new Set();
      for (let i = 0; i < card.ability.val; i++) {
        const pool = G.hand.cards.filter((v) => !blacklist.has(v));
        if (!pool.length) break;
        const [c] = pseudorandom_element(pool, pseudoseed('c_mf_seaweed'));
        blacklist.add(c);
        const enh = poll_enhancement({ key: 'mf_seaweed', guaranteed: true, no_replace: true });
        G.E_MANAGER.add_event(() => { c.flip(); play_sound('card1', 1); c.juice_up(0.3, 0.3); });
        G.E_MANAGER.add_event(() => { if (enh) c.set_ability(P_CENTERS[enh]); play_sound('tarot2'); c.flip(); });
        card.juice_up(0.3, 0.5);
      }
    },
  }),
  colour('brown', {
    can_use: () => G.hand.cards.length >= 1,
    extra_vars: (a) => [a.cash_per],
    use(card) {
      const temp = G.hand.cards.slice().sort((a, b) => (a.playing_card || 0) - (b.playing_card || 0));
      pseudoshuffle(temp, pseudoseed('brown'));
      const doomed = temp.slice(0, Math.min(temp.length, card.ability.val));
      G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.juice_up(0.3, 0.5); });
      G.E_MANAGER.add_event(() => { destroy_cards(doomed); });
      ease_dollars(card.ability.cash_per * card.ability.val);
    },
  }),
  colour('grey'),
  colour('silver'),
  colour('white'),
  perma_colour('red', 'perma_mult', 'mult_per'),
  perma_colour('orange', 'perma_repetitions', null),
  colour('yellow', { extra_vars: (a) => [a.value_per] }),
  colour('green', { info: (iq) => iq.push({ key: 'j_mf_oopsallfives', set: 'Joker', vars: [1] }) }),
  colour('blue'),
  colour('lilac'),
  colour('pink', { can_use: () => true, use(card) { n_random_colour_rounds(card.ability.val); } }),
  colour('peach'),
  colour('new_gold', { info: (iq) => iq.push({ key: 'c_soul', set: 'Spectral', vars: [] }) }),
];

// ------------------------------------------------------------- packs / tag / vouchers
const PACK = (key) => {
  const s = DATA.boosters.find((b) => b.key === key);
  return {
    key: 'p_mf_' + key, set: 'Booster', name: s.key, kind: 'Colour', cost: s.cost, weight: s.weight, pos: s.pos, atlas: 'mf_packs',
    config: JSON.parse(JSON.stringify(s.config)), group_key: 'k_colour_pack',
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
  /** mod calculate end_of_round -> colour_end_of_round_effects (once per won round). */
  evaluate_round() { colour_end_of_round_effects(); return undefined; },
  /** Colour cards (and Gold) in a pack are TAKEN into the consumable slots (select_card = consumeables). */
  can_reserve: (card) => (is_colour(card) ? true : undefined),
  view_card(card, v) {
    if (card.area === G.pack_cards && is_colour(card)) { v.no_use = true; v.reserve = true; v.reserve_label = localize('b_take'); }
  },
  /** Steamodded perma_repetitions (Orange): a playing card retriggers that many more times, scored or held. */
  card_repetitions(card, context) {
    const n = card.ability && card.ability.perma_repetitions;
    if (!n || n <= 0 || !(context.cardarea === G.play || context.cardarea === G.hand)) return undefined;
    return { message: localize('k_again_ex'), repetitions: n, card };
  },
};
