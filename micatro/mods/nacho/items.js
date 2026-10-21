/**
 * Nacho's Pokermon Dip 1.7.9 — its non-joker content, behaviour (static data: data179.js; centers built by ./index.js):
 *   src/consumables/apples.lua  Tart / Sweet / Syrupy Apple: Items (Pokermon's poke_item set = our Item), Applin's evolution
 *                               items (in the pool while an Applin-line joker is owned); used on two / one held cards they
 *                               have their own effect (and still evolve the first Applin that takes them).
 *   src/boosters/ancient_pack.lua  the Ancient Pack: 1 of 3 "ancient" (fossil) Pokémon (SMODS.poll_object over the
 *                               attribute pool: Pokermon 3.9.1's fossils and Nacho's Cranidos / Shieldon lines); never in a
 *                               shop (weight 0, in_pool false).
 *   src/tags/tags.lua           the Fossil Tag (the Excavator's): a free Ancient Pack at the next blind choice; never rolled.
 */
import {
  G, P_CENTERS, P_CARDS, Card, emit, pseudoshuffle, pseudoseed, has_enhancement, set_spoon_item, is_evo_item_for,
  highlighted_evo_item, evo_item_use_total, poke_remove_card, poke_convert_cards_to, ease_poke_dollars, poke_get_family_list,
  poll_object, smods_create_card,
} from './api.js';
import { use_card } from '../../js/engine/run.js';

/** Hand index stands in for screen x (the Lua compares card.T.x). */
const hand_x = (c) => G.hand.cards.indexOf(c);
/** The Lua's pick of the two highlighted cards: `target` the left one, `rightmost` the right one. */
function left_right() {
  const h = G.hand.highlighted;
  let target = h[1], rightmost = h[0];
  for (const c of h) { if (hand_x(c) > hand_x(rightmost)) rightmost = c; else target = c; }
  return [target, rightmost];
}
const joker_target_ok = (self) => !!(G.jokers.highlighted && G.jokers.highlighted.length === 1 && is_evo_item_for(self, G.jokers.highlighted[0]));
const apple_in_pool = () => {
  const applemons = poke_get_family_list('applin').map((y) => (typeof y === 'object' ? y.key : y));
  return !!(G.jokers && G.jokers.cards.some((joker) => applemons.includes(joker.config.center.name)));
};
const eitem = (info_queue) => info_queue.push({ set: 'Other', key: 'eitem' });

export const APPLES = {
  // Tart Apple: of two held cards, the left gains +1 perma Mult (+2 if Wild) and the right is destroyed
  tartapple: {
    loc_vars(self, info_queue) { eitem(info_queue); return { vars: [self.config.max_highlighted] }; },
    can_use(self) { return joker_target_ok(self) || !!(G.hand.highlighted && G.hand.highlighted.length === 2); },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 2) {
        const [target, rightmost] = left_right();
        target.ability.perma_mult = (target.ability.perma_mult || 0) + self.config.mult_mod * (has_enhancement(target, 'm_wild') ? 2 : 1);
        poke_remove_card(rightmost, card);
        evo_item_use_total(self, card, area, copier);
      } else highlighted_evo_item(self, card, area, copier);
    },
    in_pool: apple_in_pool,
  },
  // Sweet Apple: of two held cards, the left earns $2 ($4 if Wild) and the right is destroyed
  sweetapple: {
    loc_vars(self, info_queue) { eitem(info_queue); return { vars: [self.config.max_highlighted] }; },
    can_use(self) { return joker_target_ok(self) || !!(G.hand.highlighted && G.hand.highlighted.length === 2); },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 2) {
        const [target, rightmost] = left_right();
        ease_poke_dollars(target, 'sweetapple', self.config.money * (has_enhancement(target, 'm_wild') ? 2 : 1));
        poke_remove_card(rightmost, card);
        evo_item_use_total(self, card, area, copier);
      } else highlighted_evo_item(self, card, area, copier);
    },
    in_pool: apple_in_pool,
  },
  // Syrupy Apple: the selected card and 2 random other held cards become Wild; a random non-Wild held card is destroyed
  syrupyapple: {
    loc_vars(self, info_queue) { eitem(info_queue); return { vars: [self.config.max_highlighted, self.config.converted] }; },
    can_use(self) { return joker_target_ok(self) || !!(G.hand.highlighted && G.hand.highlighted.length === 1); },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 1) {
        const selected = G.hand.highlighted[0];
        poke_convert_cards_to(selected, { mod_conv: 'm_wild' }, true);
        const cards_held = G.hand.cards.filter((v) => v !== selected);
        pseudoshuffle(cards_held, pseudoseed('syrup'));
        for (let i = 0; i < Math.min(cards_held.length, self.config.converted); i++) poke_convert_cards_to(cards_held[i], { mod_conv: 'm_wild' }, true);
        // (the conversions are queued, as in the Lua: the cards about to become Wild still count as non-Wild here)
        const viable = cards_held.filter((v) => !has_enhancement(v, 'm_wild'));
        if (viable.length) {
          pseudoshuffle(viable, pseudoseed('syrup'));
          poke_remove_card(viable[0], card);
        }
        evo_item_use_total(self, card, area, copier);
      } else highlighted_evo_item(self, card, area, copier);
    },
    in_pool: apple_in_pool,
  },
};

export const ANCIENT_PACK = {
  // 1 of 3 cards, each SMODS.poll_object({attributes = {"ancient"}}) — an ancient (fossil) Pokémon, no edition
  create_card(self, card) {
    const key = poll_object({ attributes: ['ancient'] });
    return smods_create_card({ set: 'Joker', key, area: G.pack_cards, no_edition: true, skip_materialize: true });
  },
  loc_vars(self, info_queue, card) { return { vars: [card.config.center.config.choose, card.ability.extra] }; },
  in_pool() { return false; },
};

/** The tag-opened free pack (Charm / Meteor Tag style): cost 0, from_tag. */
function open_free_pack(key) {
  const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
  card.cost = 0;
  card.from_tag = true;
  use_card(card);
  emit('materialize', { card: card.sort_id });
}

export const FOSSIL_TAG = {
  loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'p_nacho_ancient_pack', specific_vars: [1, 3] }); return { vars: [] }; },
  apply(self, tag, context) {
    if (context && context.type === 'new_blind_choice') {
      tag.yep('+', 'Spectral', () => { open_free_pack('p_nacho_ancient_pack'); return true; });
      tag.triggered = true;
      return true;
    }
    return undefined;
  },
  in_pool() { return false; },
};
