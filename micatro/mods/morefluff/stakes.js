// More Fluff 1.9.9999 — its 6 stakes and 3 stickers (src/stakes.lua), each above the last, starting above Gold:
//   Pink         the second Booster Pack of every shop is a Standard Pack (get_pack wrap)
//   Steel        shop jokers may be Heavy (30%): each Heavy joker you hold lets you discard 1 fewer card at once
//   Zodiac       start with Magic Trick (Illusion if you already have it)
//   Hot          shop jokers may be Potato (30%): while you hold a Potato joker, only Potato jokers can be sold
//                (Eternal and Potato never go together)
//   Ultramarine  shop / pack consumables may be Suspended (40%): using one exiles it for 2 rounds instead, then it
//                tries to use itself on random hand cards (exile.js)
//   Final        "Your fate is sealed": Superboss is forced at the win ante (superboss.js), and the blinds there
//                are a flat 3,333,333 (get_blind_amount when scaling is 6)
// The stickers roll like Steamodded's (SMODS.Sticker should_apply: needs_enable_flag, rate, the key
// '<packssj|shopssj><key><ante>'), on jokers (Heavy / Potato) and consumables (Suspended) made for the shop or a pack.
// PORT NOTE: Pink's Standard Pack is picked with math.random(1, 4) (unseeded) in the Lua: the engine's seeded
// math_random here.
import { G, P_CENTERS, Card, pseudorandom, math_random, localize } from '../../js/engine/core.js';
import { DATA } from './util.js';
import LOC from './loc.js';

const stake = (key, modifiers) => {
  const s = DATA.stakes.find((x) => x.key === key);
  const { key: _k, fns, prefix_config, ...rest } = JSON.parse(JSON.stringify(s));
  return {
    ...rest, key: 'stake_mf_' + key, set: 'Stake', name: (LOC.descriptions.Stake['stake_mf_' + key] || {}).name || key,
    applied_stakes: (rest.applied_stakes || []).map((a) => (a === 'gold' ? 'gold' : 'mf_' + a)),
    above_stake: rest.above_stake === 'gold' ? 'gold' : 'mf_' + rest.above_stake,
    colour: key === 'final' ? '#FE5F55' : rest.colour, // (G.C.RED)
    modifiers,
  };
};
export const stakes = [
  stake('pink', () => { G.GAME.modifiers.mf_force_standard_pack = true; }),
  stake('steel', () => { G.GAME.modifiers.enable_mf_heavy = true; }),
  stake('zodiac', () => {
    G.E_MANAGER.add_event(() => {
      const v = G.GAME.used_vouchers.v_magic_trick ? 'v_illusion' : 'v_magic_trick';
      G.GAME.used_vouchers[v] = true;
      G.GAME.starting_voucher_count = (G.GAME.starting_voucher_count || 0) + 1;
      G.E_MANAGER.add_event(() => { Card.apply_to_run(null, P_CENTERS[v]); });
    });
  }),
  stake('hot', () => { G.GAME.modifiers.enable_mf_potato = true; }),
  stake('ultramarine', () => { G.GAME.modifiers.enable_mf_suspend_sticker = true; }),
  stake('final', () => { G.GAME.modifiers.mf_final_stake = true; }),
];

// ---------------------------------------------------------------- stickers
const STICKER_KEYS = ['mf_heavy', 'mf_potato', 'mf_suspend_sticker'];
export const stickers = STICKER_KEYS.map((k) => {
  const d = DATA.stickers.find((s) => 'mf_' + s.key === k);
  return { key: k, badge_colour: d.badge_colour, atlas: 'mf_stake_stickers', pos: d.pos, rate: d.rate, label: LOC.misc.labels[k] };
});
const sticker = (k) => stickers.find((s) => s.key === k);
/** SMODS.Sticker:should_apply — the roll for one sticker on a card made for the shop / a pack. */
const roll = (key, area) => pseudorandom((area === G.pack_cards ? 'packssj' : 'shopssj') + key + G.GAME.round_resets.ante) > 1 - sticker(key).rate;
const heavy_count = () => (G.jokers ? G.jokers.cards.filter((j) => j.ability.mf_heavy && !j.debuff).length : 0);

export const hooks = {
  /** Pink Stake: the second pack of a shop (one already rolled) is a Standard Pack. */
  get_pack(center) {
    if (G.GAME.modifiers.mf_force_standard_pack && Object.keys(G.GAME.current_round.used_packs || {}).length === 1) return P_CENTERS['p_standard_normal_' + math_random(1, 4)];
    return center;
  },
  /** Final Stake: blinds at scaling 6 (Superboss on top of Gold's 3) are 3,333,333 chips. */
  blind_amount(amount) { return G.GAME.modifiers.scaling === 6 && G.GAME.modifiers.mf_final_stake ? 3333333 : amount; },
  /** The stickers' rolls (SMODS create_card: after the vanilla eternal / perishable / rental ones). */
  create_card(card, _type, area) {
    if (!(area === G.shop_jokers || (G.pack_cards && area === G.pack_cards))) return;
    if (card.ability.set === 'Joker') {
      if (G.GAME.modifiers.enable_mf_heavy && roll('mf_heavy', area)) card.ability.mf_heavy = true;
      if (G.GAME.modifiers.enable_mf_potato && roll('mf_potato', area) && !card.ability.eternal) card.ability.mf_potato = true;
    } else if (card.ability.consumeable && card.ability.set !== 'SuperbossToken' && G.GAME.modifiers.enable_mf_suspend_sticker && roll('mf_suspend_sticker', area)) {
      card.ability.mf_suspend_sticker = true;
    }
  },
  /** Heavy: one fewer card per discard for each Heavy joker held (SMODS.change_discard_limit(-1) in add_to_deck). */
  selection_limit(n, kind) { return kind === 'discard' ? Math.max(0, n - heavy_count()) : n; },
  /** Potato: while a Potato joker is held, only Potato jokers can be sold. */
  can_sell(card) {
    if (!G.jokers || card.area !== G.jokers || card.ability.mf_potato) return undefined;
    return G.jokers.cards.some((j) => j.ability.mf_potato) ? false : undefined;
  },
  /** Eternal wipes Potato (the Card:set_eternal / Stickers.eternal.apply wraps). */
  update() { if (G.jokers) for (const j of G.jokers.cards) if (j.ability.eternal && j.ability.mf_potato) j.ability.mf_potato = undefined; },
  describe(card, desc) {
    for (const k of STICKER_KEYS) {
      if (!(card.ability && card.ability[k])) continue;
      const s = sticker(k), d = LOC.descriptions.Other[k];
      desc.badges = [...(desc.badges || []), { key: k, label: s.label, colour: s.badge_colour }];
      if (d) desc.info = [...(desc.info || []), { key: k, name: d.name, lines: d.text }];
    }
  },
  view_card(card, v) {
    const st = STICKER_KEYS.filter((k) => card.ability && card.ability[k]).map((k) => ({ atlas: 'mf_stake_stickers', pos: sticker(k).pos }));
    if (st.length) v.mod_stickers = [...(v.mod_stickers || []), ...st];
  },
};
export const centers = [];
export { localize };
