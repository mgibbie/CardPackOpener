// Pokermon+ 1.2.0 — src/stakes/lilac_stake.lua + src/stickers/weakened_sticker.lua + src/stickers/heatran_sticker.lua:
//   Lilac Stake (above Gold, applies Gold): G.GAME.modifiers.enable_sonfive_weakened (1.0.3: enable_weakened_in_shop).
//   Weakened sticker (an SMODS.Sticker, rate 0.3, needs the Lilac flag, default_compat false): a shop / pack joker rolls
//     pseudorandom('shopssj' | 'packssj' .. 'sonfive_weakened' .. ante) > 0.7 (SMODS.Sticker.should_apply) when it is
//     compatible — the joker or any of its family is energizable (functions.js weakened_compat: reset_game_globals'
//     sonfive_weakened_compat). Applying it takes 1 Energy and 1 Energy limit away (pokermon.energy.modify(-1) +
//     e_limit_up - 1). 1.0.3 de-energized by 2 and re-weakened the evolved joker (a poke_backend_evolve patch): 1.2.0
//     dropped that patch, because the negative energy_count and e_limit_up are carried through the evolution and
//     re-applied by Pokermon's own evolving energize.
//   Forged sticker (sonfive_heatran): rate 0, never rolled; Heatran puts it on the cards it forges.
// Not ported: the Saffron stake (1.2.0 ships it with an empty list) and the lovely patch that puts Pokermon's Elite stake
// above Lilac (Pokermon precedence: base Pokermon's Elite stays as Pokermon defines it — PORTING.md "Pokermon+ 1.2.0").
import { G, pseudorandom } from '../../pokermon/api.js';
import { deenergize_one, weakened_compat, MOD_ID } from './functions.js';
import { isActive } from '../../../js/mods/registry.js';

export const WEAKENED = 'sonfive_weakened';
export const FORGED = 'sonfive_heatran';

/** SMODS.Stickers.sonfive_weakened:apply(card, true). */
export function apply_weakened(card, val = true) {
  card.ability[WEAKENED] = val;
  if (val && card.ability.extra && typeof card.ability.extra === 'object') deenergize_one(card);
}

/** create_card hook (SMODS sticker.toml, after the card is made): the Lilac stake's Weakened shop / pack jokers. */
export function weakened_in_shop(card, _type, area) {
  if (!isActive(MOD_ID) || _type !== 'Joker' || !G.GAME.modifiers.enable_sonfive_weakened) return;
  if (area !== G.shop_jokers && area !== G.pack_cards) return;
  if (!weakened_compat(card.config.center)) return;
  const roll = pseudorandom((area === G.pack_cards ? 'packssj' : 'shopssj') + WEAKENED + G.GAME.round_resets.ante);
  if (roll > 1 - 0.3) apply_weakened(card, true);
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
  modifiers() { G.GAME.modifiers.enable_sonfive_weakened = true; },
};

export const weakened_sticker = { key: WEAKENED, badge_colour: '#c497c4', order: 5, atlas: 'sonfive_stickers', pos: { x: 0, y: 0 }, label: 'Weakened' };
export const forged_sticker = { key: FORGED, badge_colour: '#400000', order: 6, atlas: 'sonfive_stickers', pos: { x: 1, y: 0 }, label: 'Forged', no_collection: true };
