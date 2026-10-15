// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0766_passimian.lua: Passimian ("Receiver").
// Passimian takes on the ability of the next joker you sell or that is destroyed. The received
// center is remembered as `ability.received_key` (the Lua keeps the center object in
// ability.received_card and saves `received_key`; Micatro abilities must stay plain data).
// Its cooperation with Pokermon is wired through Pokermon's add-on extension points in
// ../systems.js: evolutions are RECEIVED instead (EVOLVE_INTERCEPTS), Energy scales the received
// card's base values (ENERGIZE_BASE), find_card finds it under the received key (FIND_CARD_EXTRA),
// the Megastone frees itself (MEGASTONE_RESET) and Pokermon's remove() announces the destruction
// (BEFORE_REMOVE -> joker_type_destroyed).
import {
  G, P_CENTERS, localize, card_eval_status_text, copy_table, copy_scaled_values, defineNacho, type_tooltip,
} from '../api.js';

const FILE = 'src/pokemon/0766_passimian.lua';

/** The center Passimian holds (Lua: card.ability.received_card), or undefined. */
export const received = (card) => (card && card.ability && card.ability.received_key ? P_CENTERS[card.ability.received_key] : undefined);
const isTable = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const cp = (v) => (v !== null && typeof v === 'object' ? copy_table(v) : v);

/** receive_card overwrites the shared center's blueprint flag (see below); back to the shipped false each run. */
export function reset_passimian_center() {
  if (P_CENTERS.j_nacho_passimian) P_CENTERS.j_nacho_passimian.blueprint_compat = false;
}

/**
 * receive_card(self, card, to_key, context): Passimian becomes `to_key`'s ability — the sold /
 * destroyed card's whole ability is carried over (context.card), or, when the held ability
 * "evolves", its scaled values.
 */
export function receive_card(self, card, to_key, context) {
  if (!to_key || card.area !== G.jokers) return;
  const _r = P_CENTERS[to_key];
  if (!_r) return;
  let values_to_keep = {};
  if (received(card)) values_to_keep = copy_scaled_values(card);
  else if (context && context.card && context.card.ability) for (const [k, v] of Object.entries(context.card.ability)) values_to_keep[k] = cp(v);
  // Set ability to the received card's config
  for (const [k, v] of Object.entries(_r.config || {})) card.ability[k] = cp(v);
  card.ability.received_key = _r.key;
  // Re-add kept values
  for (const [k, v] of Object.entries(values_to_keep)) card.ability[k] = cp(v);
  const ex = card.ability.extra;
  if (isTable(ex)) {
    for (const [k, v] of Object.entries(values_to_keep)) {
      if ((ex[k] !== undefined && ex[k] !== null && ex[k] !== false) || k === 'energy_count' || k === 'c_energy_count') {
        if (typeof ex[k] !== 'number' || (typeof v === 'number' && v > ex[k])) ex[k] = v;
      }
    }
    ex.ptype = 'Fighting';
  }
  // (Intended-design fix: the Lua sets `card.ability.extra.ptype` unconditionally — an error when the
  // received joker's `extra` is a number, e.g. a sold Banner; Passimian then simply keeps no type field.)
  // The Lua writes the received card's blueprint_compat onto the SHARED Passimian center; Micatro
  // does the same and restores it at every run start (reset_passimian_center) so runs stay independent.
  self.blueprint_compat = _r.blueprint_compat === true;
  if (_r.add_to_deck) _r.add_to_deck(_r, card);
  // the funny noises
  const from_ed = context && context.card && context.card.edition;
  if (!(card.edition || from_ed)) {
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_receiver_ex') });
  } else if (from_ed) {
    card.juice_up(1, 0.5);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_receiver_ex'), colour: 'DARK_EDITION' });
    // Intended-design fix: the card text grants the slot only for a NON-Negative edition; the Lua
    // also granted it for a Negative one.
    if (!from_ed.negative) {
      card.ability.received_edition = true;
      G.jokers.config.card_limit = G.jokers.config.card_limit + 1;
    }
  } else {
    card.juice_up(1, 0.5);
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_receiver_ex'), colour: 'DARK_EDITION' });
  }
}

defineNacho({
  // Passimian 766
  passimian: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const r = received(card);
      if (!r) return { vars: [] };
      // generate_ui: the received card's description (+ a "Received Card" box).
      let vars = [];
      if (typeof r.loc_vars === 'function') { const o = r.loc_vars(r, [], card); if (o && o.vars) vars = o.vars; }
      info_queue.push({ set: 'Other', key: 'received_card', vars: [localize({ type: 'name_text', set: 'Joker', key: r.key })] });
      return { key: r.key, set: 'Joker', vars };
    },
    calculate(self, card, context) {
      const r = received(card);
      if (!r) {
        const ban = (k) => (self.banlist || []).includes(k);
        if (context.selling_card && !context.selling_self && !context.blueprint && context.card && !ban(context.card.config.center.key)) {
          if (context.card.area === G.jokers) receive_card(self, card, context.card.config.center.key, context);
        }
        if (context.joker_type_destroyed && !context.blueprint && context.card && !ban(context.card.config.center.key)) {
          receive_card(self, card, context.card.config.center.key, context);
        }
        return undefined;
      }
      if (r.calculate) return r.calculate(r, card, context);
      // A base-game joker: SMODS falls through to Card:calculate_joker's by-NAME logic, and the
      // received ability (name + config) was copied onto Passimian — run that logic for it.
      if (!r.mod) {
        const own = card.config.center;
        card.config.center = r;
        try { return card.calculate_joker(context); } finally { card.config.center = own; }
      }
      return undefined;
    },
    remove_from_deck(self, card, from_debuff) {
      if (card.ability.received_edition && !from_debuff) G.jokers.config.card_limit = G.jokers.config.card_limit - 1;
      const r = received(card);
      if (r && r.remove_from_deck) r.remove_from_deck(r, card);
    },
  },
}, FILE);
