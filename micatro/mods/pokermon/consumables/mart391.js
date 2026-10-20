// Pokermon 3.9.1 — the Items batch 10 adds (3.2.1's data.js has neither, so each definition carries its whole static data;
// index.js builds them after data.js's consumables):
//   consumables/03_mart_items.lua  Miracle Seed: 1 selected card becomes a Seed card.
//   consumables/04_mart_rare.lua   Heavy-Duty Boots (reusable held item): until the end of the round every Hazard card
//                                  probability is 0 (fix_probability, identifier 'hazard'); once per round.
// Spawning: 3.9.1 gives the "Soul items" (Leftovers 3, Heavy-Duty Boots 2, ...) object weights in the Item pool
// (optional_features.object_weights). Our port keeps 3.2.1's soul path for them (object_weights is not on: PORTING.md batch
// 5), so the Boots are a hidden Item like Leftovers, at 2/3 of Leftovers' soul_rate (its 3.9.1 weight 2 vs Leftovers' 3),
// and only while the Hazard layer is up (3.9.1 in_pool). Its floating sprite hiding while used is cosmetic.
import {
  G, P_CENTERS, localize, card_eval_status_text, defineConsumables, set_spoon_item, juice_flip, poke_unhighlight_cards,
} from '../api.js';

const PACKS = () => [G.STATES.MOD_PACK, G.STATES.MOD_PACK_HAND, G.STATES.TAROT_PACK, G.STATES.SPECTRAL_PACK, G.STATES.PLANET_PACK, G.STATES.STANDARD_PACK];

defineConsumables({
  miracleseed: {
    key: 'miracleseed',
    set: 'Item',
    atlas: 'AtlasConsumablesBasic',
    pos: { x: 2, y: 7 },
    artist: ['Emma', 'Catzzadilla'],
    cost: 4,
    config: { max_highlighted: 1, min_highlighted: 1 },
    unlocked: true,
    discovered: true,
    loc_vars(self, info_queue) { info_queue.push(P_CENTERS.m_poke_seed); return { vars: [self.config.max_highlighted] }; },
    use(self, card) {
      set_spoon_item(card);
      juice_flip(card);
      for (const c of G.hand.highlighted) c.set_ability(P_CENTERS.m_poke_seed, null, true);
      juice_flip(card, true);
      poke_unhighlight_cards();
    },
    in_pool() { return true; },
  },
}, 'consumables/03_mart_items.lua');

defineConsumables({
  heavyboots: {
    key: 'heavyboots',
    set: 'Item',
    helditem: true,
    atlas: 'AtlasConsumablesBasic',
    pos: { x: 3, y: 7 },
    soul_pos: { x: 4, y: 7 },
    artist: [{ name: 'Emma', layer: 'soul' }, { name: 'Catzzadilla', layer: 'center' }],
    cost: 4,
    config: { extra: { usable: true, hazard_off: false } },
    unlocked: true,
    discovered: true,
    // (the soul path, as Leftovers: see the header)
    hidden: true,
    soul_set: 'Item',
    soul_rate: 0.025 * 2 / 3,
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'endless' }); return { vars: [] }; },
    can_use(self, card) {
      if (PACKS().includes(G.STATE) && G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit && card.area === G.pack_cards) return false;
      return card.ability.extra.usable;
    },
    use(self, card) {
      card.ability.extra.usable = false;
      card.ability.extra.hazard_off = true;
    },
    calculate(self, card, context) {
      if (context.fix_probability && card.ability.extra.hazard_off && context.identifier === 'hazard') return { numerator: 0 };
      if (context.end_of_round && !card.ability.extra.usable) {
        card.ability.extra.usable = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
        // (queued: the held Hazard cards roll their end-of-round destroy first)
        G.E_MANAGER.add_event(() => { card.ability.extra.hazard_off = false; });
      }
      return undefined;
    },
    keep_on_use() { return true; },
    in_pool() { return !!(G.GAME.poke_hazard_level && G.GAME.poke_hazard_level > 0); },
  },
}, 'consumables/04_mart_rare.lua');
