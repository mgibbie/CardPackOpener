// AutumnMoodMechanics — api/Oddity.lua: the Oddity consumable type (no cards of its own: other mods add them,
// each with a rarity 1-4 — Common 65 / Uncommon 30 / Rare 5 / Legendary 0), 8 Oddity packs and 2 tags.
// An Oddity pack's cards are SELECTED into the consumable slots (SMODS select_card = 'consumeables'), not used.
import { G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, create_card, emit, math_random } from '../../js/engine/core.js';
import { use_card } from '../../js/engine/run.js';

export const ODDITY = {
  config: { base_shop_rate: 3, base_common_rate: 65, base_uncommon_rate: 30, base_rare_rate: 5, base_legendary_rate: 0 },
};
const pool = () => P_CENTER_POOLS.Oddity || [];
const legendary_pool = () => pool().filter((c) => c.rarity === 4);

export const consumable_types = [{
  key: 'Oddity', name: 'Oddity', shop_rate: ODDITY.config.base_shop_rate,
  // (SMODS: the first Oddity registered is the type's default — the empty-pool fallback)
  get default() { const p = pool(); return p.length ? p[0].key : undefined; },
  primary_colour: '#826390', secondary_colour: '#826390',
  rarities: [
    { key: 1, weight: ODDITY.config.base_common_rate }, { key: 2, weight: ODDITY.config.base_uncommon_rate },
    { key: 3, weight: ODDITY.config.base_rare_rate }, { key: 4, weight: ODDITY.config.base_legendary_rate },
  ],
  // FIX (intended design): AMM's get_current_pool patch sends a legendary Oddity roll to rarity_pools[-4], which
  // doesn't exist (a leftover from negative rarities) — the Heirloom Tag's "Legendary Oddity" crashed. It means
  // the Legendary (4) pool; the pool key stays the Lua's "Oddity-4".
  legendary_rarity: 4, legendary_pool_key: 'Oddity-4',
}];

const PACK_TEXT = 'oddity';
const pack = (key, pos, extra, choose, cost, order, weight) => ({
  key: 'p_amm_' + key, set: 'Booster', name: key.startsWith('oddity_normal') ? 'Oddity Pack' : key.startsWith('oddity_jumbo') ? 'Jumbo Oddity Pack' : 'Mega Oddity Pack',
  kind: 'Oddity', atlas: 'amm_Oddity', pos, config: { extra, choose }, cost, order, weight, draw_hand: false,
  select_card: 'consumeables', group_key: 'k_amm_oddity_pack', pack_text: PACK_TEXT,
  in_pool: () => pool().length > 0,
  loc_vars: (self, iq, card) => ({ vars: [(card && card.ability && card.ability.choose) ?? self.config.choose, (card && card.ability && card.ability.extra) ?? self.config.extra] }),
  // SMODS.create_card{set = 'Oddity', area = G.pack_cards, skip_materialize = true, key_append = 'odd'}
  create_card: () => create_card('Oddity', G.pack_cards, null, null, true, null, null, 'odd'),
});
export const centers = [
  pack('oddity_normal_1', { x: 1, y: 0 }, 3, 1, 4, 1, 1),
  pack('oddity_normal_2', { x: 2, y: 0 }, 3, 1, 4, 2, 1),
  pack('oddity_normal_3', { x: 3, y: 0 }, 3, 1, 4, 3, 1),
  pack('oddity_normal_4', { x: 4, y: 0 }, 3, 1, 4, 4, 1),
  pack('oddity_jumbo_1', { x: 1, y: 1 }, 5, 1, 6, 5, 1),
  pack('oddity_jumbo_2', { x: 2, y: 1 }, 5, 1, 6, 6, 1),
  pack('oddity_mega_1', { x: 3, y: 1 }, 5, 2, 8, 7, 0.25),
  pack('oddity_mega_2', { x: 4, y: 1 }, 5, 2, 8, 8, 0.25),
];

/** A free pack opened from a tag (Card(... G.P_CENTERS[key]); cost 0; from_tag; G.FUNCS.use_card). */
export function open_free_pack(key) {
  const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
  card.cost = 0;
  card.from_tag = true;
  use_card(card);
  emit('materialize', { card: card.sort_id });
}

export const tags = [
  {
    key: 'tag_amm_oddity', name: 'Oddity Tag', set: 'Tag', atlas: 'amm_modicon', pos: { x: 0, y: 0 }, config: { type: 'new_blind_choice' },
    in_pool: () => pool().length > 0,
    loc_vars: () => ({ vars: [] }),
    apply(self, tag, context) {
      if (context.type === 'new_blind_choice') {
        // (the Lua's unseeded math.random(1,2) is Micatro's deterministic math_random)
        tag.yep('+', 'Oddity', () => { open_free_pack('p_amm_oddity_mega_' + math_random(1, 2)); return true; });
        tag.triggered = true;
        return true;
      }
    },
  },
  {
    key: 'tag_amm_heirloom', name: 'Heirloom Tag', set: 'Tag', atlas: 'amm_modicon', pos: { x: 1, y: 0 }, config: { type: 'immediate', spawn_oddities: 1 },
    in_pool: () => legendary_pool().length > 0,
    loc_vars: () => ({ vars: [] }),
    apply(self, tag, context) {
      if (context.type === 'immediate') {
        tag.yep('+', 'PURPLE', () => {
          for (let i = 1; i <= tag.config.spawn_oddities; i++) {
            if (G.consumeables && G.consumeables.cards.length < G.consumeables.config.card_limit) {
              const card = create_card('Oddity', G.consumeables, true, null, null, null, null, 'heirloomtag');
              card.add_to_deck();
              G.consumeables.emplace(card);
            }
          }
          return true;
        });
        tag.triggered = true;
        return true;
      }
    },
  },
];

/** The Oddity rarity badge (set_card_type_badge): Common / Uncommon / Rare / Legendary in the rarity colours. */
export const RARITY_BADGE = [null, ['common', 'Common', '#009dff'], ['uncommon', 'Uncommon', '#4BC292'], ['rare', 'Rare', '#fe5f55'], ['legendary', 'Legendary', '#b26cbb']];
