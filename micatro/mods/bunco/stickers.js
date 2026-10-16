// Bunco — stickers and stakes (Bunco.lua ~8321-8451 + lovely "Scattering / Hindered / Reactive Sticker",
// "Eternal Sticker compat", "Cyan / Pink / Magenta Stake"):
//   Scattering  when the joker is removed (sold or destroyed), a random adjacent non-Eternal joker is destroyed
//   Hindered    selling it pays out but the joker stays (and works) until the end of the round, then it goes
//   Reactive    debuffed unless a blind was skipped this ante
// The three are mutually exclusive and never on an Eternal joker (and a stickered shop joker skips the
// Eternal roll). Stakes: Cyan (orange + Scattering jokers in the shop), Pink (+ Hindered), Magenta (+ Reactive);
// Bunco's Gold-stake takeover makes Gold apply Magenta, so Gold (and above) has all three.
import { G, math_random, pseudorandom, localize } from '../../js/engine/core.js';
import { data_of } from './util.js';
import LOC from './loc.js';

export const STICKER_KEYS = ['bunc_scattering', 'bunc_hindered', 'bunc_reactive'];
const has_sticker = (card) => !!(card.ability.bunc_scattering || card.ability.bunc_hindered || card.ability.bunc_reactive);
/** SMODS.Stickers[key]:apply(card, val) */
export function apply_sticker(key, card, val) {
  const a = card.ability;
  if (key === 'bunc_scattering') { if (a.eternal || a.bunc_hindered || a.bunc_reactive) return; a.bunc_scattering = val; }
  if (key === 'bunc_hindered') { if (a.eternal || a.bunc_scattering || a.bunc_reactive) return; a.bunc_hindered = val; a.bunc_hindered_sold = false; }
  if (key === 'bunc_reactive') {
    if (a.eternal || a.bunc_scattering || a.bunc_hindered) return;
    a.bunc_reactive = val;
    if (G.GAME && G.GAME.blind) G.GAME.blind.debuff_card(card);
  }
}
const skipped_this_ante = () => Object.values(G.GAME.round_resets.blind_states).some((v) => v === 'Skipped');

export const stickers = STICKER_KEYS.map((k) => {
  const d = data_of('stickers', k);
  return { key: k, badge_colour: d.badge_colour, atlas: d.atlas, pos: d.pos, order: d.order, label: LOC.misc.labels[k], apply: (card, val) => apply_sticker(k, card, val) };
});

const stake = (k, modifiers) => ({ ...data_of('stakes', k), set: 'Stake', name: LOC.descriptions.Stake[k].name, modifiers });
export const stakes = [
  stake('stake_bunc_cyan', () => { G.GAME.modifiers.enable_scattering_in_shop = true; }),
  stake('stake_bunc_pink', () => { G.GAME.modifiers.enable_hindered_in_shop = true; }),
  stake('stake_bunc_magenta', () => { G.GAME.modifiers.enable_reactive_in_shop = true; }),
];

export const hooks = {
  // SMODS.Stake:take_ownership('gold', {applied_stakes = {'bunc_magenta'}}): Gold (8) and up apply Magenta's chain.
  start_run() {
    if (G.GAME.stake >= 8) {
      G.GAME.modifiers.enable_scattering_in_shop = true;
      G.GAME.modifiers.enable_hindered_in_shop = true;
      G.GAME.modifiers.enable_reactive_in_shop = true;
    }
  },
  // Magenta / Pink / Cyan Stake polls (lovely order: the last-applied patch runs first).
  shop_joker_stickers(card) {
    const ante = G.GAME.round_resets.ante;
    if (G.GAME.modifiers.enable_reactive_in_shop && pseudorandom('reactive' + ante) > 0.7) apply_sticker('bunc_reactive', card, true);
    if (G.GAME.modifiers.enable_hindered_in_shop && pseudorandom('hindered' + ante) > 0.7) apply_sticker('bunc_hindered', card, true);
    if (G.GAME.modifiers.enable_scattering_in_shop && pseudorandom('scattering' + ante) > 0.7) apply_sticker('bunc_scattering', card, true);
  },
  block_eternal: (card) => (has_sticker(card) ? true : undefined),
  // ---- Scattering
  card_removed(card) {
    if (!(G.jokers && card.ability.bunc_scattering && card.area === G.jokers)) return;
    const i = G.jokers.cards.indexOf(card);
    if (i < 0) return;
    const s = [];
    if (G.jokers.cards[i - 1] && !G.jokers.cards[i - 1].ability.eternal) s.push(G.jokers.cards[i - 1]);
    if (G.jokers.cards[i + 1] && !G.jokers.cards[i + 1].ability.eternal) s.push(G.jokers.cards[i + 1]);
    card.bunc_scattered = s;
  },
  card_removed_after(card) {
    const s = card.bunc_scattered;
    if (!s) return;
    card.bunc_scattered = undefined;
    if (G.jokers && G.jokers.cards.length > 0 && s.length > 0) {
      const random_card = s[math_random(s.length) - 1]; // (Lua math.random — the engine's seeded stand-in)
      if (random_card && !random_card.removed) random_card.start_dissolve();
    }
  },
  // ---- Hindered
  sell_card_keep(card) {
    if (!card.ability.bunc_hindered) return undefined;
    if (card.area) card.area.remove_from_highlighted(card, true);
    card.ability.bunc_hindered_sold = true;
    card.sell_cost = 0;
    return true;
  },
  can_sell: (card) => (card.ability.bunc_hindered_sold ? false : undefined),
  end_round() {
    // (the sticker's calculate, end_of_round: Card:calculate_hindered)
    for (const j of G.jokers.cards.slice()) if (j.ability.bunc_hindered && j.ability.bunc_hindered_sold) j.start_dissolve();
  },
  // ---- Reactive
  set_debuff(card) {
    if (G.jokers && G.jokers.cards.includes(card) && card.ability.bunc_reactive && !skipped_this_ante()) return true;
    return undefined;
  },
  update() {
    if (G.jokers && G.GAME.blind) for (const j of G.jokers.cards) if (j.ability.bunc_reactive) G.GAME.blind.debuff_card(j);
  },
  // ---- badges / art
  describe(card, desc) {
    for (const k of STICKER_KEYS) {
      if (card.ability && card.ability[k]) {
        const s = stickers.find((x) => x.key === k);
        desc.badges = [...(desc.badges || []), { key: k, label: s.label, colour: s.badge_colour }];
        const d = LOC.descriptions.Other[k];
        desc.info = [...(desc.info || []), { key: k, name: d.name, lines: d.text }];
      }
    }
  },
  view_card(card, v) {
    const st = STICKER_KEYS.filter((k) => card.ability && card.ability[k]).map((k) => { const s = stickers.find((x) => x.key === k); return { atlas: s.atlas, pos: s.pos }; });
    if (st.length) v.mod_stickers = st;
    if (card.ability && card.ability.bunc_hindered_sold) v.hindered_sold = true;
  },
};
export const centers = [];
export { localize };
