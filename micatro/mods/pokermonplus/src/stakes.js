// Pokermon+ — src/stakes/lilac_stake.lua + src/stickers/weakened_sticker.lua, and the lovely
// patches that make them work:
//   Lilac Stake (above Gold, applies Gold): G.GAME.modifiers.enable_weakened_in_shop.
//   create_card (common_events.lua): a shop / pack joker whose extra has `mult` or `chips` is
//     Weakened 30% of the time (pseudorandom('weakened' .. ante) > 0.7).
//   Weakened sticker: ability.sonfive_weakened; applying it de-energizes the joker by 2
//     (energy_shift(card, -2, ptype, false, silent, increment)); after an evolution the new base
//     values are weakened again (patch before `if new_card.soul_pos` in poke_backend_evolve —
//     Pokermon's POST_EVOLVE extension point).
import { G, pseudorandom } from '../../pokermon/api.js';
import { energy_shift, MOD_ID } from './functions.js';
import { isActive } from '../../../js/mods/registry.js';

export const WEAKENED = 'sonfive_weakened';

/** SMODS.Stickers.sonfive_weakened:apply(card, true). */
export function apply_weakened(card, val = true) {
  card.ability[WEAKENED] = val;
  if (val && card.ability.extra && typeof card.ability.extra === 'object') energy_shift(card, -2, card.ability.extra.ptype, false, true, true);
}

/** create_card hook: Lilac stake's Weakened shop / pack jokers. */
export function weakened_in_shop(card, _type, area) {
  if (_type !== 'Joker' || !G.GAME.modifiers.enable_weakened_in_shop) return;
  if (area !== G.shop_jokers && area !== G.pack_cards) return;
  const ex = card.ability && card.ability.extra;
  const has_energy = !!(ex && typeof ex === 'object' && (ex.mult !== undefined || ex.chips !== undefined));
  if (has_energy && pseudorandom('weakened' + G.GAME.round_resets.ante) > 0.7) apply_weakened(card, true);
}

/** Pokermon POST_EVOLVE: re-weaken the evolved joker's fresh base values. */
export function weakened_after_evolve(card) {
  if (!isActive(MOD_ID) || !card.ability[WEAKENED]) return;
  const ex = card.ability.extra;
  if (ex && typeof ex === 'object') energy_shift(card, -2, ex.ptype, false, true, false);
}

export const lilac_stake = {
  key: 'stake_sonfive_lilac_stake',
  name: 'Lilac Stake',
  set: 'Stake',
  applied_stakes: ['gold'],
  above_stake: 'gold',
  colour: '#E8CCE8',
  atlas: 'sonfive_stakes',
  pos: { x: 0, y: 0 },
  sticker_atlas: 'sonfive_stake_stickers',
  sticker_pos: { x: 0, y: 0 },
  modifiers() { G.GAME.modifiers.enable_weakened_in_shop = true; },
};

export const weakened_sticker = { key: WEAKENED, badge_colour: '#c497c4', order: 5, atlas: 'sonfive_stickers', pos: { x: 0, y: 0 }, label: 'Weakened' };
