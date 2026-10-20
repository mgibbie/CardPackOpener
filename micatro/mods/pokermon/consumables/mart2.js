// Pokermon 3.2.1 — consumables/mart2.lua: the 19 Items (evolution stones, Link Cable, the
// reusable held items Leftovers / Leek / Thick Club, Tera Orb, Metal Coat, Dragon Scale, King's
// Rock, Up-Grade, Dubious Disc, Twisted Spoon). Line-for-line; card flips (juice_flip) and the
// held items' floating-sprite swap are cosmetic.
import {
  G, P_CENTERS, P_CARDS_LIST, localize, attention_text, play_sound, level_up_hand, update_hand_text,
  pseudorandom, pseudorandom_element, pseudoseed, create_playing_card, playing_card_joker_effects, get_poker_hand_info,
  create_card, copy_card, poll_edition, card_eval_status_text, delay, find_joker,
  defineConsumables, set_spoon_item, is_evo_item_for, evo_item_use_total, highlighted_evo_item,
  pseudorandom_probability, get_probability_vars, poke_unhighlight_cards, poke_remove_card,
  poke_vary_rank, poke_total_chips, poke_add_card, change_base, juice_flip, juice_flip_hand,
  apply_type_sticker, type_sticker_applied, is_type, energy_increase, POKETYPES, any,
  object_weights, poll_enhancement_weighted,
} from '../api.js';
import { get_current_pool } from '../../../js/engine/core.js';

const FILE = 'consumables/mart2.lua';
const joker_target_ok = (self) => G.jokers.highlighted && G.jokers.highlighted.length === 1 && is_evo_item_for(self, G.jokers.highlighted[0]);
const PACKS = () => [G.STATES.MOD_PACK, G.STATES.MOD_PACK_HAND, G.STATES.TAROT_PACK, G.STATES.SPECTRAL_PACK, G.STATES.PLANET_PACK, G.STATES.STANDARD_PACK];
/** Hand index stands in for screen x (Lua compares card.T.x). */
const hand_x = (c) => G.hand.cards.indexOf(c);
const rightmost_of = (cards) => { let r = cards[0]; for (const c of cards) if (hand_x(c) > hand_x(r)) r = c; return r; };
/** Held items (Leftovers, Leek, Thick Club): not usable from a pack when the slots are full, nor in the shop. */
function held_item_blocked(card) {
  if (PACKS().includes(G.STATE) && G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit && card.area === G.pack_cards) return true;
  return card.area === G.shop_jokers;
}
const nope = (card) => G.E_MANAGER.add_event(() => { attention_text(localize('k_nope_ex')); play_sound('tarot2', 1, 0.4); card.juice_up(0.3, 0.5); });

/**
 * SMODS.poll_enhancement({options, guaranteed, key, mod, type_key}) — weighted enhancement roll
 * (weight 5 each by default, a 40% base rate unless guaranteed). -> center key or undefined.
 */
function poll_enhancement(args = {}) {
  // (Pokermon 3.9.1 turns Steamodded's object_weights on: SMODS.poll_enhancement is then SMODS.poll_object over the Enhanced set. Batch 17.)
  if (object_weights()) return poll_enhancement_weighted(args);
  let key = args.key || 'std_enhance';
  const mod = args.mod || 1;
  const options = args.options || get_current_pool('Enhanced')[0];
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  key = key + G.GAME.round_resets.ante;
  const avail = [];
  let total_weight = 0;
  for (const v of options) {
    if (v === 'UNAVAILABLE') continue;
    const o = typeof v === 'string' ? { key: v, weight: P_CENTERS[v].weight ?? 5 } : { key: v.key, weight: v.weight };
    if (o.weight > 0) { avail.push(o); total_weight += o.weight; }
  }
  total_weight = total_weight + (total_weight / 40 * 60);
  let type_weight = 0;
  for (const v of avail) type_weight += v.weight;
  const enhance_poll = pseudorandom(pseudoseed(key));
  if (enhance_poll > 1 - (type_weight * mod / total_weight) || args.guaranteed) {
    const enhance_type_poll = pseudorandom(pseudoseed(type_key));
    let weight_i = 0;
    for (const v of avail) {
      weight_i += v.weight;
      if (enhance_type_poll > 1 - (weight_i / type_weight)) return v.key;
    }
  }
  return undefined;
}

/** Tera Orb art cell per type (its set_sprites). */
const TERA_SPRITES = {
  grass: { x: 2, y: 9 }, fire: { x: 0, y: 9 }, water: { x: 2, y: 10 }, lightning: { x: 4, y: 9 }, psychic: { x: 8, y: 9 }, fighting: { x: 8, y: 8 },
  colorless: { x: 0, y: 10 }, dark: { x: 0, y: 8 }, metal: { x: 6, y: 9 }, fairy: { x: 6, y: 8 }, dragon: { x: 2, y: 8 }, earth: { x: 4, y: 8 },
};

defineConsumables({
  // Moon Stone: 1 in 2 to level up the highlighted hand's poker hand; evolves (e.g. Nidorina).
  moonstone: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'eitem' });
      let handtext = localize('poke_none');
      if (G.hand && G.hand.highlighted && G.hand.highlighted.length > 0) {
        handtext = localize(get_poker_hand_info(G.hand.highlighted).text, 'poker_hands') || localize('poke_none');
        if (G.hand.highlighted.some((v) => v.facing === 'back')) handtext = '????';
      }
      const [num, dem] = get_probability_vars(center, self.config.num, self.config.dem, 'moonstone');
      return { vars: [handtext, num, dem] };
    },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length >= self.config.min_highlighted);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted.length >= self.config.min_highlighted) {
        if (pseudorandom_probability(card, 'moonstone', self.config.num, self.config.dem, 'moonstone')) {
          const { text, disp_text } = get_poker_hand_info(G.hand.highlighted);
          level_up_hand(card, text);
          if (PACKS().includes(G.STATE)) update_hand_text({ nopulse: true, delay: 0.3 }, { mult: 0, chips: 0, level: '', handname: '' });
          else update_hand_text({ delay: 0.3 }, { handname: disp_text, level: G.GAME.hands[text].level, mult: G.GAME.hands[text].mult, chips: G.GAME.hands[text].chips });
        } else {
          G.E_MANAGER.add_event(() => { attention_text(localize('k_nope_ex')); play_sound('tarot2', 1, 0.4); card.juice_up(0.3, 0.5); });
        }
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },
  // Thunder Stone: destroy 1 selected card, add 2 Gold cards of its rank (hand + deck); evolves Pikachu.
  thunderstone: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); return { vars: [self.config.max_highlighted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 1);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 1) {
        const selected = G.hand.highlighted[0];
        const poss_cards = Object.values(P_CARDS_LIST()).filter((v) => v.value === selected.base.value);
        const cards_added = [];
        for (let i = 1; i <= 2; i++) {
          const to = i === 1 ? G.hand : G.deck;
          cards_added.push(create_playing_card({ front: pseudorandom_element(poss_cards, pseudoseed('thunderstone'))[0], center: P_CENTERS.m_gold }, to));
        }
        playing_card_joker_effects(cards_added);
        poke_remove_card(selected, card);
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Sun Stone: 1-2 selected cards become Wild with a random rank.
  sunstone: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); info_queue.push(P_CENTERS.m_wild); return { vars: [self.config.max_highlighted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length >= self.config.min_highlighted && G.hand.highlighted.length <= self.config.max_highlighted);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length >= self.config.min_highlighted) {
        juice_flip(card);
        for (const c of G.hand.highlighted) {
          c.set_ability(P_CENTERS.m_wild, null, true);
          poke_vary_rank(c, null, 'sunstone');
        }
        juice_flip(card, true);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Water Stone: 1 card becomes Bonus; a Bonus card instead gains its total chips (max 50) permanently.
  waterstone: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); info_queue.push(P_CENTERS.m_bonus); return { vars: [self.config.max_highlighted, self.config.max_chips] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 1);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 1) {
        const conv_card = G.hand.highlighted[0];
        juice_flip(card);
        if (conv_card.ability.name === 'Bonus') {
          const bonus = Math.min(self.config.max_chips, poke_total_chips(conv_card));
          conv_card.ability.perma_bonus = (conv_card.ability.perma_bonus || 0) + bonus;
        } else {
          conv_card.set_ability(P_CENTERS.m_bonus, null, true);
        }
        juice_flip(card, true);
        delay(0.5);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Fire Stone: exactly 4 selected cards become Mult cards, then one of them is destroyed.
  firestone: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); info_queue.push(P_CENTERS.m_mult); return { vars: [self.config.max_highlighted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 4);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 4) {
        juice_flip(card);
        for (const c of G.hand.highlighted) c.set_ability(P_CENTERS.m_mult, null, true);
        juice_flip(card, true);
        const [target] = pseudorandom_element(G.hand.highlighted, pseudoseed('firestone'));
        poke_remove_card(target, card);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Leaf Stone: each card in hand has a 1 in 3 chance to become Lucky.
  leafstone: {
    loc_vars(self, info_queue, center) {
      info_queue.push(P_CENTERS.m_lucky);
      info_queue.push({ set: 'Other', key: 'eitem' });
      const [num, dem] = get_probability_vars(center, self.config.num, self.config.dem, 'leafstone');
      return { vars: [num, dem] };
    },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.cards && G.hand.cards.length > 0);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.cards && G.hand.cards.length > 0) {
        juice_flip_hand(card);
        for (const c of G.hand.cards) {
          if (pseudorandom_probability(card, 'leafstone', self.config.num, self.config.dem, 'leafstone')) c.set_ability(P_CENTERS.m_lucky, null, true);
        }
        juice_flip_hand(card, true);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Link Cable: of 2 selected cards, the left goes up a rank and the right goes down a rank.
  linkcable: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); return { vars: [self.config.max_highlighted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 2);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 2) {
        const rightmost = rightmost_of(G.hand.highlighted);
        juice_flip(card);
        for (const c of G.hand.highlighted) {
          if (c !== rightmost) poke_vary_rank(c, false);
          else poke_vary_rank(c, true);
        }
        juice_flip(card, true);
        delay(0.5);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Leftovers (reusable, once per round): +$2 sell value on the selected / leftmost joker.
  leftovers: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'endless' }); return { vars: [self.config.extra.joker_highlighted, self.config.extra.money_mod] }; },
    can_use(self, card) {
      if (held_item_blocked(card)) return false;
      if (!(G.jokers && G.jokers.cards)) return false;
      if (G.jokers.cards.length === 0) return false;
      return card.ability.extra.usable;
    },
    use(self, card) {
      const target = !G.jokers.highlighted || G.jokers.highlighted.length !== 1 ? G.jokers.cards[0] : G.jokers.highlighted[0];
      target.ability.extra_value = target.ability.extra_value + card.ability.extra.money_mod;
      target.set_cost();
      G.E_MANAGER.add_event(() => card_eval_status_text(target, 'extra', null, null, null, { message: localize('k_val_up') }));
      card.ability.extra.usable = false;
    },
    calculate(self, card, context) {
      if (context.end_of_round && !card.ability.extra.usable) {
        card.ability.extra.usable = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return undefined;
    },
    keep_on_use() { return true; },
    in_pool() { return true; },
  },

  // Leek (reusable, once per round): 1 in 2 to give itself Foil / Holo / Polychrome until end of round.
  leek: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'endless' });
      const card = center || self;
      if (!card.edition || !card.edition.foil) info_queue.push(P_CENTERS.e_foil);
      if (!card.edition || !card.edition.holo) info_queue.push(P_CENTERS.e_holo);
      if (!card.edition || !card.edition.polychrome) info_queue.push(P_CENTERS.e_polychrome);
      const ex = (card.ability && card.ability.extra) || self.config.extra;
      const [num, dem] = get_probability_vars(center, ex.num, ex.dem, 'leek');
      return { vars: [num, dem] };
    },
    can_use(self, card) {
      if (held_item_blocked(card)) return false;
      return card.ability.extra.usable;
    },
    use(self, card) {
      if (pseudorandom_probability(card, 'leek', card.ability.extra.num, card.ability.extra.dem, 'leek')) {
        const edition = poll_edition('wheel_of_fortune', null, true, true);
        card.set_edition(edition, true);
      } else {
        nope(card);
      }
      card.ability.extra.usable = false;
    },
    calculate(self, card, context) {
      if (context.end_of_round && card.edition) card.set_edition(null, true);
      if (context.end_of_round && !card.ability.extra.usable) {
        card.ability.extra.usable = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return undefined;
    },
    keep_on_use() { return true; },
    in_pool() { return false; },
  },

  // Thick Club (reusable, once per round): +10 permanent chips on 1 selected card.
  thickclub: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'endless' }); return { vars: [self.config.max_highlighted, self.config.bonus] }; },
    can_use(self, card) {
      if (card.area === G.shop_jokers) return false;
      if (G.hand.highlighted && G.hand.highlighted.length !== 1) return false;
      if (held_item_blocked(card)) return false;
      return card.ability.extra.usable;
    },
    use(self, card) {
      const conv_card = G.hand.highlighted[0];
      const current_bonus = conv_card.ability.perma_bonus || 0;
      juice_flip(card);
      conv_card.ability.perma_bonus = current_bonus + self.config.bonus;
      juice_flip(card, true);
      delay(0.5);
      poke_unhighlight_cards();
      card.ability.extra.usable = false;
    },
    calculate(self, card, context) {
      if (context.end_of_round && !card.ability.extra.usable) {
        card.ability.extra.usable = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return undefined;
    },
    keep_on_use() { return true; },
    in_pool() { return true; },
  },

  // Tera Orb: Tera the selected / leftmost joker to the orb's type (Energize it first if it already
  // is that type). The orb rolls a new type every hand played.
  teraorb: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'energize' });
      const info = (center && center.ability && center.ability.extra) || self.config.extra;
      const colour = info.change_to_type.toLowerCase();
      info_queue.push({ set: 'Other', key: 'typechanger', vars: [info.change_to_type], colours: [colour] });
      return { vars: [info.change_to_type], colours: [colour, info.change_to_type !== 'Lightning' ? 'WHITE' : 'BLACK'] };
    },
    can_use() { return G.jokers.cards.length > 0; },
    use(self, card) {
      set_spoon_item(card);
      let choice;
      if (G.jokers.highlighted && G.jokers.highlighted.length === 1) choice = G.jokers.highlighted[0];
      else if (G.jokers.cards && G.jokers.cards.length > 0) choice = G.jokers.cards[0];
      else return;
      if (is_type(choice, card.ability.extra.change_to_type)) {
        if (choice.config && choice.config.center.stage && !type_sticker_applied(choice)) energy_increase(choice, choice.ability.extra.ptype);
        else if (type_sticker_applied(choice)) energy_increase(choice, type_sticker_applied(choice));
      }
      apply_type_sticker(choice, card.ability.extra.change_to_type);
      card_eval_status_text(choice, 'extra', null, null, null, { message: localize('poke_tera_ex'), colour: 'Spectral' });
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const change_list = POKETYPES.filter((t) => t !== card.ability.extra.change_to_type);
        card.ability.extra.change_to_type = pseudorandom_element(change_list, pseudoseed('tera'))[0];
        card_eval_status_text(card, 'extra', null, null, null, { message: card.ability.extra.change_to_type, colour: card.ability.extra.change_to_type.toLowerCase() });
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.change_to_type = pseudorandom_element(POKETYPES, pseudoseed('tera'))[0];
    },
    /** set_sprites: the art follows the orb's current type. */
    get_pos(self, card) {
      const t = card && card.ability && card.ability.extra && card.ability.extra.change_to_type;
      return (t && TERA_SPRITES[t.toLowerCase()]) || self.pos;
    },
    in_pool() { return true; },
  },

  // Metal Coat: Metal Tera on the selected / leftmost joker, plus a Steel copy of the selected card.
  // (No can_use in the Lua: the vanilla max_highlighted = 1 rule applies.)
  metalcoat: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'typechanger', vars: ['Metal'], colours: ['metal'] }); return { vars: [self.config.max_highlighted] }; },
    use(self, card) {
      set_spoon_item(card);
      let choice;
      if (G.jokers.highlighted && G.jokers.highlighted.length === 1) choice = G.jokers.highlighted[0];
      else if (G.jokers && G.jokers.cards && G.jokers.cards.length > 0) choice = G.jokers.cards[0];
      if (choice) {
        apply_type_sticker(choice, 'Metal');
        card_eval_status_text(choice, 'extra', null, null, null, { message: localize('poke_metal_ex'), colour: 'metal' });
      }
      const copy = copy_card(G.hand.highlighted[0], null, null, G.playing_card);
      copy.set_ability(P_CENTERS.m_steel, null, true);
      poke_add_card(copy, card);
      poke_unhighlight_cards();
    },
    in_pool() { return true; },
  },

  // Dragon Scale: Dragon Tera on the selected / leftmost joker, then up to 3 random Items / Energies.
  dragonscale: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'typechanger', vars: ['Dragon'], colours: ['dragon'] }); },
    can_use() { return G.jokers.cards.length > 0; },
    use(self, card) {
      set_spoon_item(card);
      const choice = G.jokers.highlighted && G.jokers.highlighted.length === 1 ? G.jokers.highlighted[0] : G.jokers.cards[0];
      apply_type_sticker(choice, 'Dragon');
      // Intended-design fix: the Lua passes the text positionally ({localize(...), colour = ...}),
      // so the status popup had no message.
      card_eval_status_text(choice, 'extra', null, null, null, { message: localize('poke_dragon_ex'), colour: 'dragon' });
      for (let i = 1; i <= 3; i++) {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          // (3.9.1, batch 17: with Safety First's poke_no_energy always an Item, and no roll)
          const card_type = (G.GAME.modifiers.poke_no_energy || pseudorandom(pseudoseed('dragonscale')) > 0.50) ? 'Item' : 'Energy';
          const _card = create_card(card_type, G.consumeables, null, null, null, null, null);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
        }
      }
    },
    in_pool() { return true; },
  },

  // King's Rock: 1 selected card becomes a King.
  kingsrock: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); info_queue.push({ set: 'Other', key: 'playing_card_to_evolve' }); return { vars: [self.config.max_highlighted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 1);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 1) {
        const conv_card = G.hand.highlighted[0];
        juice_flip(card);
        G.E_MANAGER.add_event(() => { change_base(conv_card, null, 'King'); });
        delay(0.5);
        juice_flip(card, true);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Up-Grade: 1-2 selected cards all get the same random enhancement.
  upgrade: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); info_queue.push({ set: 'Other', key: 'playing_card_to_evolve' }); return { vars: [self.config.max_highlighted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length >= self.config.min_highlighted && G.hand.highlighted.length <= self.config.max_highlighted);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted.length >= self.config.min_highlighted) {
        // (3.9.1 03_mart_items.lua: the Seed card joined the options, batch 10)
        const enhancement = poll_enhancement({ options: ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_gold', 'm_lucky', 'm_poke_seed'], guaranteed: true });
        juice_flip(card);
        for (const c of G.hand.highlighted) c.set_ability(P_CENTERS[enhancement], null, true);
        juice_flip(card, true);
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return !any(find_joker('porygon2')); },
  },

  // Dubious Disc: every card in hand gets a random enhancement.
  dubious_disc: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.cards && G.hand.cards.length > 0);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.cards && G.hand.cards.length > 0) {
        juice_flip_hand(card);
        for (const c of G.hand.cards) {
          const enhancement = poll_enhancement({ guaranteed: true });
          c.set_ability(P_CENTERS[enhancement], null, true); // (the Lua passes the key: SMODS set_ability accepts it)
        }
        juice_flip_hand(card, true);
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return any(find_joker('porygon2')); },
  },

  // Ice Stone: 1-2 selected cards become Glass, each with a 1 in 4 chance to shatter.
  icestone: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'eitem' });
      info_queue.push(P_CENTERS.m_glass);
      const [num, dem] = get_probability_vars(center, self.config.num, self.config.dem, 'icestone');
      return { vars: [self.config.max_highlighted, num, dem] };
    },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length >= self.config.min_highlighted && G.hand.highlighted.length <= self.config.max_highlighted);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted.length >= self.config.min_highlighted) {
        juice_flip(card);
        for (const c of G.hand.highlighted) c.set_ability(P_CENTERS.m_glass, null, true);
        juice_flip(card, true);
        for (const c of G.hand.highlighted.slice()) {
          if (pseudorandom_probability(card, 'icestone', self.config.num, self.config.dem, 'icestone')) poke_remove_card(c, card);
        }
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Shiny Stone: 1 selected card gets Foil / Holo / Polychrome and loses its enhancement.
  shinystone: {
    loc_vars(self, info_queue) {
      info_queue.push(P_CENTERS.e_foil); info_queue.push(P_CENTERS.e_holo); info_queue.push(P_CENTERS.e_polychrome);
      info_queue.push({ set: 'Other', key: 'eitem' });
      return { vars: [self.config.max_highlighted, self.config.drain_amt] };
    },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 1);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted.length === 1) {
        G.E_MANAGER.add_event(() => {
          const edition = poll_edition('aura', null, true, true);
          const shiny_card = G.hand.highlighted[0];
          shiny_card.set_edition(edition, true);
          shiny_card.set_ability(P_CENTERS.c_base, null, true);
          card.juice_up(0.3, 0.5);
        });
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },

  // Twisted Spoon: creates the last Item / Energy used this run (not itself or the reusables).
  twisted_spoon: {
    loc_vars(self, info_queue) {
      const spoon_c = G.GAME && G.GAME.last_poke_item ? P_CENTERS[G.GAME.last_poke_item] : undefined;
      const last = spoon_c ? localize({ type: 'name_text', key: spoon_c.key, set: spoon_c.set }) : localize('k_none');
      if (spoon_c && spoon_c.name !== 'twisted_spoon') info_queue.push(spoon_c);
      return { vars: [last] };
    },
    can_use(self, card) {
      const last = G.GAME.last_poke_item;
      return !!((G.consumeables.cards.length < G.consumeables.config.card_limit || card.area === G.consumeables) && last &&
        last !== 'c_poke_twisted_spoon' && last !== 'c_poke_leftovers' && last !== 'c_poke_leek' && last !== 'c_poke_thickclub');
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      const used_item = copier || card;
      const last = G.GAME.last_poke_item;
      G.E_MANAGER.add_event(() => {
        if (G.consumeables.config.card_limit > G.consumeables.cards.length) {
          play_sound('timpani');
          const _card = create_card('Item', G.consumeables, null, null, null, null, last, 'spoon');
          _card.add_to_deck();
          G.consumeables.emplace(_card);
          used_item.juice_up(0.3, 0.5);
        }
      });
      delay(0.6);
    },
    in_pool() { return true; },
  },
}, FILE);
