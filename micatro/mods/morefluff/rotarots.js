// More Fluff 1.9.9999 — the "45 Degree Rotated Tarot" consumable type (src/rotarots.lua): 22 cards, 8 packs, the
// Rotarot Tag, and (new) the Rotarot Merchant / Tycoon vouchers. The Fool remembers the last Rotarot / Colour card
// used (misc.lua's G.FUNCS.use_card wrap: G.GAME.last_rot_tarot_colour, set an event after the use, never for a
// hidden card). The Soul! (c_mf_rot_soul, a hidden Spectral that makes a "rot" legendary) comes with those jokers.
// ART: 1.9.9999 draws upright 71x95 sprites turned 45 degrees in the engine (mf_rotate_by); Micatro has no turned
// sprites, so the cards and packs keep the 1.5.6 pre-turned sheets of the same art (mf_rotarots 107px /
// mf_rotarotpacks 106px: the cells are re-indexed from 1.9.9999's 10-wide grid to the old 8-wide one).
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, enhancement_pool, create_card, create_playing_card, copy_card, localize, play_sound, attention_text,
  pseudorandom_element, pseudoseed, pseudoshuffle, probability_vars, probability_roll, ease_dollars, emit,
} from '../../js/engine/core.js';
import { use_card } from '../../js/engine/run.js';
import { DATA, RANKS, change_base, modded_begin, modded_end, center_card } from './util.js';
import { unpleasant } from './jokers_b.js';

/** A 1.9.9999 rotarot cell (10 per row) -> its cell in the 1.5.6 pre-turned sheet (8 per row). */
const old_cell = (p) => { const i = p.y * 10 + p.x; return { x: i % 8, y: Math.floor(i / 8) }; };

/** lovely/rot_fool.toml: any Rotarot or Colour card used becomes the 45° Fool's target. */
export function track_last(card) {
  const key = card.config.center_key;
  G.E_MANAGER.add_event(() => G.E_MANAGER.add_event(() => { G.GAME.last_rot_tarot_colour = key; }));
}
const name_text = (set, key) => localize({ type: 'name_text', set, key });
const H = () => G.hand.highlighted;
const can_hl = (card) => H().length >= 1 && H().length <= card.ability.max_highlighted;
const room_or_held = (card) => G.consumeables.cards.length < G.consumeables.config.card_limit || card.area === G.consumeables;

/** The vanilla Tarot enhance flow (Card:use_consumeable's mod_conv branch) for a mod_conv Rotarot. */
function convert(card, used) {
  G.E_MANAGER.add_event(() => { play_sound('tarot1'); used.juice_up(0.3, 0.5); });
  const hl = H();
  for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { hl[i].flip(); play_sound('card1'); });
  for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { hl[i].set_ability(P_CENTERS[card.ability.consumeable.mod_conv]); });
  for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { hl[i].flip(); play_sound('tarot2', 1, 0.6); });
  G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
}

const rot = (key, def) => {
  const s = DATA.consumables.find((c) => c.key === key);
  return {
    key: 'c_mf_' + key, set: 'Rotarot', name: s.name, consumeable: true, cost: s.cost, pos: old_cell(s.pos), atlas: 'mf_rotarots',
    config: JSON.parse(JSON.stringify(s.config || {})), ...def,
    use(self, card, area, copier) { track_last(card); def.use(self, card, area, copier); },
  };
};
const conv = (key) => rot(key, {
  can_use: (s, card) => can_hl(card),
  loc_vars: (s, iq, card) => { iq.push({ key: s.config.mod_conv, set: 'Enhanced' }); return { vars: [(card && card.ability && card.ability.max_highlighted) ?? s.config.max_highlighted, name_text('Enhanced', s.config.mod_conv)] }; },
  use: (s, card, area, copier) => convert(card, copier || card),
});
const create_n = (key, set, seed) => rot(key, {
  can_use: (s, card) => room_or_held(card),
  loc_vars: (s, iq, card) => ({ vars: [card.ability ? card.ability.val : s.config.val] }),
  use(s, card, area, copier) {
    const used = copier || card;
    const n = Math.min(card.ability.val, G.consumeables.config.card_limit - G.consumeables.cards.length);
    for (let i = 0; i < n; i++) {
      G.E_MANAGER.add_event(() => {
        if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
          play_sound('timpani');
          const c = create_card(set, G.consumeables, null, null, null, null, null, seed);
          c.add_to_deck();
          G.consumeables.emplace(c);
          used.juice_up(0.3, 0.5);
        }
      });
    }
  },
});
/** do_suit_shit: val new Enhanced cards of the suit (random rank / non-Stone enhancement). */
function suit_cards(card, copier) {
  const used = copier || card;
  // FIX (intended design): the Lua tested G.STATE, which is always PLAY_TAROT once G.FUNCS.use_card runs,
  // so its "outside a round -> into the deck" branch (BLIND_SELECT / ROUND_EVAL) never fired and the
  // cards landed in the (absent) hand. The state the card was used FROM decides here.
  const st = G.TAROT_INTERRUPT ?? G.STATE;
  const target_area = (st === G.STATES.BLIND_SELECT || st === G.STATES.ROUND_EVAL) ? G.deck : G.hand;
  G.E_MANAGER.add_event(() => {
    play_sound('tarot1');
    used.juice_up(0.3, 0.5);
    const cards = [];
    for (let i = 1; i <= card.ability.val; i++) {
      const [_rank] = pseudorandom_element(['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'], pseudoseed('suitarot'));
      const _suit = card.ability.suit;
      const cen_pool = enhancement_pool().filter((v) => v.key !== 'm_stone' && !v.overrides_base_rank);
      const [center] = pseudorandom_element(cen_pool, pseudoseed('suitarot'));
      cards.push(create_playing_card({ front: P_CARDS[_suit + '_' + _rank], center }, target_area));
    }
    for (const j of G.jokers.cards) j.calculate_joker({ playing_card_added: true, cards }); // playing_card_joker_effects
  });
}
const suit = (key) => rot(key, {
  can_use: () => G.hand.cards.length >= 1, // (1.9.9999: needs a hand)
  loc_vars: (s, iq, card) => ({ vars: [card.ability ? card.ability.val : s.config.val] }),
  use: (s, card, area, copier) => suit_cards(card, copier),
});
/** Hanged Man / Brown: destroy up to `n` random hand cards (shuffle seed 'brown', as the Lua). */
export function destroy_random_hand(n, used) {
  const temp_hand = G.hand.cards.slice().sort((a, b) => (a.playing_card || 0) - (b.playing_card || 0));
  pseudoshuffle(temp_hand, pseudoseed('brown'));
  const destroyed = temp_hand.slice(0, Math.min(temp_hand.length, n));
  G.E_MANAGER.add_event(() => { play_sound('tarot1'); used.juice_up(0.3, 0.5); });
  G.E_MANAGER.add_event(() => {
    for (let i = destroyed.length - 1; i >= 0; i--) {
      const c = destroyed[i];
      if (c.ability.name === 'Glass Card') c.shatter(); else c.start_dissolve();
      c.remove_from_deck();
    }
  });
  for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed: destroyed });
  return destroyed;
}

export const centers = [
  rot('rot_fool', {
    can_use: (s, card) => !!(room_or_held(card) && G.GAME.last_rot_tarot_colour && G.GAME.last_rot_tarot_colour !== 'c_mf_rot_fool'),
    loc_vars(s, iq) {
      const fc = G.GAME && G.GAME.last_rot_tarot_colour ? P_CENTERS[G.GAME.last_rot_tarot_colour] : null;
      const last = fc ? name_text(fc.set, fc.key) : localize('k_none');
      const bad = !fc || fc.name === 'rot_Fool';
      if (!bad) iq.push({ key: fc.key, set: fc.set });
      return { vars: [last], main_end: [(bad ? '{C:red}' : '{C:green}') + ' ' + last + ' {}'] };
    },
    use(s, card, area, copier) {
      const used = copier || card;
      const last = G.GAME.last_rot_tarot_colour;
      if (last && last !== 'c_mf_rot_fool') {
        G.E_MANAGER.add_event(() => {
          if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
            play_sound('timpani');
            const c = create_card('Rot_Tarot_Colour', G.consumeables, null, null, null, null, last, 'fool');
            c.add_to_deck();
            G.consumeables.emplace(c);
            used.juice_up(0.3, 0.5);
          }
        });
      }
    },
  }),
  conv('rot_magician'),
  create_n('rot_high_priestess', 'Colour', 'pri'),
  conv('rot_empress'),
  create_n('rot_emperor', 'Rotarot', 'emp'),
  conv('rot_heirophant'),
  conv('rot_lovers'),
  conv('rot_chariot'),
  conv('rot_justice'),
  rot('rot_hermit', {
    can_use: () => true,
    loc_vars: (s, iq, card) => ({ vars: [card.ability ? card.ability.val : s.config.val] }),
    use(s, card) {
      // math.fmod keeps the dividend's sign, like JS %: up to the next multiple of 25.
      let give = card.ability.val - (G.GAME.dollars % card.ability.val);
      if (give === card.ability.val) give = 0;
      ease_dollars(give);
    },
  }),
  rot('rot_wheel', {
    can_use: () => G.jokers.cards.some((v) => v.ability.set === 'Joker' && !v.edition),
    loc_vars(s, iq, card) {
      const [n, d] = probability_vars(card, 1, (card.ability && card.ability.chance) ?? s.config.chance, 'rot_wheel');
      return { vars: [n, d] };
    },
    use(s, card, area, copier) {
      const used = copier || card;
      const eligible = G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !v.edition);
      if (probability_roll(card, 'rot_wheel', 1, card.ability.chance, 'rot_wheel')) {
        G.E_MANAGER.add_event(() => {
          const [target] = pseudorandom_element(eligible, pseudoseed('evil_wheel_roll'));
          const pool = P_CENTER_POOLS.Edition.filter((e) => e.key !== 'e_base').map((e) => e.key);
          const [ed] = pseudorandom_element(pool, pseudoseed('evil_wheel_roll'));
          if (target) target.set_edition(ed, true);
          used.juice_up(0.3, 0.5);
        });
      } else {
        G.E_MANAGER.add_event(() => { attention_text(localize('k_nope_ex')); emit('nope', { card: used.sort_id }); play_sound('tarot2', 1, 0.4); used.juice_up(0.3, 0.5); });
      }
    },
  }),
  rot('rot_strength', {
    can_use: (s, card) => can_hl(card),
    loc_vars: (s, iq, card) => ({ vars: [(card.ability && card.ability.max_highlighted) ?? s.config.max_highlighted] }),
    use(s, card, area, copier) {
      const used = copier || card;
      G.E_MANAGER.add_event(() => { play_sound('tarot1'); used.juice_up(0.3, 0.5); });
      const hl = H();
      for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { hl[i].flip(); play_sound('card1'); });
      for (let i = 0; i < hl.length; i++) {
        G.E_MANAGER.add_event(() => { const [r] = pseudorandom_element(RANKS, pseudoseed('rot_strength')); change_base(hl[i], null, r.key); });
      }
      for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { hl[i].flip(); play_sound('tarot2', 1, 0.6); });
      G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
    },
  }),
  rot('rot_hanged_man', {
    can_use: () => G.hand.cards.length >= 1,
    loc_vars: (s, iq, card) => ({ vars: [card.ability ? card.ability.val : s.config.val] }),
    use: (s, card) => { destroy_random_hand(card.ability.val, card); },
  }),
  rot('rot_death', {
    can_use: (s, card) => can_hl(card),
    loc_vars: (s, iq, card) => ({ vars: [(card.ability && card.ability.max_highlighted) ?? s.config.max_highlighted] }),
    use(s, card, area, copier) {
      const used = copier || card;
      G.E_MANAGER.add_event(() => { play_sound('tarot1'); used.juice_up(0.3, 0.5); });
      const hl = H().slice();
      for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { hl[i].flip(); });
      const [model] = pseudorandom_element(hl, pseudoseed('rot_death'));
      for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { if (hl[i] !== model) copy_card(model, hl[i]); });
      for (let i = 0; i < hl.length; i++) G.E_MANAGER.add_event(() => { hl[i].flip(); });
      G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
    },
  }),
  rot('rot_temperance', {
    can_use: () => G.jokers.cards.length >= 1 || G.consumeables.cards.length >= 1,
    loc_vars: (s, iq, card) => ({ vars: [card.ability ? card.ability.val : s.config.val] }),
    use(s, card, area, copier) {
      const used = copier || card;
      for (const v of [...G.jokers.cards, ...G.consumeables.cards]) {
        G.E_MANAGER.add_event(() => {
          v.ability.extra_value = (v.ability.extra_value || 0) + card.ability.val;
          v.set_cost();
          v.juice_up(0.3, 0.5); used.juice_up(0.3, 0.5);
          play_sound('timpani');
        });
      }
    },
  }),
  conv('rot_devil'),
  conv('rot_tower'),
  suit('rot_star'),
  suit('rot_moon'),
  suit('rot_sun'),
  rot('rot_judgement', {
    can_use: () => G.jokers.cards.length < G.jokers.config.card_limit,
    loc_vars: () => ({ vars: [] }),
    use(s, card, area, copier) {
      const used = copier || card;
      modded_begin(); // (SMODS.add_card's filter: jokers with an original_mod only)
      G.E_MANAGER.add_event(() => {
        const n = create_card('Joker', G.jokers, null, null, null, null, null, undefined);
        n.add_to_deck();
        G.jokers.emplace(n);
        used.juice_up(0.3, 0.5);
        G.GAME.joker_buffer = 0;
        modded_end();
      });
    },
  }),
  suit('rot_world'),
];

// ---------------------------------------------------------------- packs + tag
const PACK = (key) => {
  const s = DATA.boosters.find((b) => b.key === key);
  return {
    key: 'p_mf_' + key, set: 'Booster', name: s.key, kind: 'Rotarot', draw_hand: true, cost: s.cost, weight: s.weight,
    pos: { x: s.pos.x, y: s.pos.y - 2 }, atlas: 'mf_rotarotpacks', config: JSON.parse(JSON.stringify(s.config)), group_key: 'k_rotarot_pack',
    loc_vars: (self, iq, card) => ({ vars: [self.config.choose, (card && card.ability && card.ability.extra) ?? self.config.extra] }),
    // Rotarot Merchant / Tycoon (context.modify_weights): each multiplies the Rotarot packs' weight by 3.
    get_weight: (self) => self.weight * merchant_mult(),
    create_card: () => ({ set: 'Rotarot', area: G.pack_cards, skip_materialize: true, soulable: true, key_append: 'mf_rotarot' }),
  };
};
for (const k of ['rotarot_normal_1', 'rotarot_normal_2', 'rotarot_normal_3', 'rotarot_normal_4', 'rotarot_jumbo_1', 'rotarot_jumbo_2', 'rotarot_mega_1', 'rotarot_mega_2']) centers.push(PACK(k));

/** A free pack from a tag (the tags' `new_blind_choice`: Card(..., G.P_CENTERS[key]); cost 0; use_card). */
export function open_free_pack(key) {
  const card = center_card(key, { bypass_discovery_center: true, bypass_discovery_ui: true });
  card.cost = 0;
  card.from_tag = true;
  use_card(card);
  emit('materialize', { card: card.sort_id });
}
export const tags = [{
  key: 'tag_mf_rotarot', name: 'tag_mf_rotarot', set: 'Tag', atlas: 'mf_tags', pos: { x: 1, y: 0 }, config: {},
  loc_vars: () => ({ vars: [] }),
  apply(self, tag, context) {
    if (context.type === 'new_blind_choice') {
      tag.yep('+', 'Rotarot', () => { open_free_pack('p_mf_rotarot_mega_1'); return true; });
      tag.triggered = true;
      return true;
    }
  },
}];

// ---------------------------------------------------------------- Rotarot Merchant / Tycoon (1.9.9999)
const merchants = () => ['v_mf_rotarot_merchant', 'v_mf_rotarot_tycoon'].filter((k) => G.GAME && G.GAME.used_vouchers && G.GAME.used_vouchers[k]);
const merchant_mult = () => merchants().reduce((m, k) => m * P_CENTERS[k].config.extra.odds_mult, 1);
const voucher = (key) => {
  const s = DATA.vouchers.find((v) => v.key === key);
  return {
    key: 'v_mf_' + key, set: 'Voucher', name: 'v_mf_' + key, cost: 10, available: true, pos: s.pos, atlas: 'mf_vouchers',
    config: JSON.parse(JSON.stringify(s.config)), requires: s.requires,
  };
};
centers.push(
  { ...voucher('rotarot_merchant'), loc_vars: (self) => ({ vars: [self.config.extra.odds_mult] }) },
  { ...voucher('rotarot_tycoon'), loc_vars: (self) => ({ vars: [self.config.extra.odds_mult * P_CENTERS.v_mf_rotarot_merchant.config.extra.odds_mult] }) },
);

export const consumable_types = [{ key: 'Rotarot', name: '45 Degree Rotated Tarot', shop_rate: 2, default: 'c_mf_rot_strength', primary_colour: '#8e73d9', secondary_colour: '#8e73d9' }];
export const hooks = {
  /** Rotarot Merchant / Tycoon (context.open_booster): an opened Rotarot pack holds 1 more card each. Then
   *  unpleasantcard.toml: with an Unpleasant Card every pack holds 1 card, choose 1 (it patches Card:open itself). */
  pack_size(n, card) {
    if (card && card.config.center.kind === 'Rotarot') n += merchants().length;
    return unpleasant() ? 1 : n;
  },
  pack_choices: (n) => (unpleasant() ? 1 : n),
};
