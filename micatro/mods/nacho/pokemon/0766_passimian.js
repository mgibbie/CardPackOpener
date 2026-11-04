// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0766_passimian.lua: Passimian ("Receiver").
// Passimian takes on the ability of the next joker (a Pokémon or any other) you sell or that is destroyed. The received center
// is remembered as `ability.received_key` (the Lua's ability.received_card; Micatro abilities stay plain data).
// 1.7.9 rework: no ban list (anything but another Passimian); it is Blueprint-compatible, and passes a copy on only when the
// received joker is; it keeps the received joker's scaled values, Energy and Tera type (pokermon.get_values_to_keep /
// apply_kept_values) and takes ITS EDITION (1.6.4 gave +1 joker slot for one); add_to_deck / remove_from_deck /
// calc_dollar_bonus / calc_scaling are the received card's. Only a joker with a `stage` (a Pokémon, or Pokermon's "Other"
// jokers) is received: a base-game joker is not (1.6.4 received anything off a ban list and ran base jokers by name).
// Its cooperation with Pokermon is wired in ../systems.js: evolutions are RECEIVED instead (EVOLVE_INTERCEPTS), Energy scales
// the received card's base values (ENERGIZE_BASE), find_card finds it under the received key (FIND_CARD_EXTRA), the Megastone
// frees itself (MEGASTONE_RESET) and Pokermon's remove() announces the destruction (BEFORE_REMOVE -> joker_type_destroyed).
import {
  G, P_CENTERS, localize, card_eval_status_text, copy_table, copy_scaled_values, energize, defineNacho, type_tooltip,
  type_sticker_applied, apply_type_sticker, get_type,
} from '../api.js';

const FILE = 'src/pokemon/0766_passimian.lua';

/** The center Passimian holds (Lua: card.ability.received_card), or undefined. */
export const received = (card) => (card && card.ability && card.ability.received_key ? P_CENTERS[card.ability.received_key] : undefined);
const isTable = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const cp = (v) => (v !== null && typeof v === 'object' ? copy_table(v) : v);

/** (1.6.4 wrote the received card's blueprint_compat onto the shared center; 1.7.9 doesn't. Kept as the run-start reset.) */
export function reset_passimian_center() {
  if (P_CENTERS.j_nacho_passimian) P_CENTERS.j_nacho_passimian.blueprint_compat = true;
}

/** pokermon.get_values_to_keep(card) (3.9.1): the scaled values + the names Pokermon carries, and the custom ones. */
function get_values_to_keep(card, center) {
  const values = copy_scaled_values(card);
  const ex = card.ability.extra;
  if (isTable(ex)) {
    for (const k of ['targets', 'rank', 'id', 'form', 'cards_scored', 'cards_drawn', 'energy_count', 'c_energy_count', 'e_limit_up']) values[k] = cp(ex[k]);
    if (type_sticker_applied(card)) values.ptype = ex.ptype;
  }
  let custom;
  if (center && center.poke_custom_values_to_keep && isTable(ex)) {
    custom = {};
    for (const k of center.poke_custom_values_to_keep) custom[k] = cp(ex[k]);
  }
  return [values, custom];
}
/** pokermon.apply_kept_values(card, new_center, values, custom_values) (3.9.1). */
function apply_kept_values(card, new_center, values, custom) {
  const ex = card.ability.extra;
  if (isTable(ex) && values) {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null) continue;
      if ((ex[k] !== undefined && ex[k] !== null && ex[k] !== false) || k === 'energy_count' || k === 'c_energy_count' || k === 'e_limit_up') {
        if (typeof ex[k] !== 'number' || (typeof v === 'number' && v > ex[k]) || k === 'form') ex[k] = v;
      }
    }
    if (values.form !== undefined && values.form !== null && typeof new_center.set_ability === 'function') new_center.set_ability(new_center, card);
    if (ex.energy_count || ex.c_energy_count) energize(card, null, true, true);
  }
  if (custom && isTable(ex)) for (const [k, v] of Object.entries(custom)) ex[k] = v;
}

/**
 * receive_card(self, card, to_key, context): Passimian becomes `to_key`'s ability — the sold / destroyed card's (context.card)
 * kept values carried over, or, when the held ability "evolves" (no context), its own.
 */
export function receive_card(self, card, to_key, context) {
  const _r = to_key && P_CENTERS[to_key];
  if (!_r || !_r.stage) return;
  const target = (card.ability.received_key && card) || (context && context.card);
  if (!target) return;
  const old_center = (target === card && received(card)) || target.config.center;
  let [values_to_keep, custom] = get_values_to_keep(target, null);
  if (old_center.poke_custom_values_to_keep && isTable(target.ability.extra)) {
    custom = custom || {};
    for (const v of old_center.poke_custom_values_to_keep) custom[v] = cp(target.ability.extra[v]);
  }
  for (const [k, v] of Object.entries(_r.config || {})) card.ability[k] = cp(v);
  card.ability.received_key = _r.key;
  apply_kept_values(card, _r, values_to_keep, custom);
  if (type_sticker_applied(target)) apply_type_sticker(card, get_type(target));
  if (_r.add_to_deck) _r.add_to_deck(_r, card, false);
  const edition = context && context.card && context.card.edition;
  if (edition) card.set_edition(edition.key || ('e_' + edition.type));
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_receiver_ex'), colour: edition ? 'DARK_EDITION' : undefined });
}

const delegate = (fn) => function (self, card, ...args) {
  const r = received(card);
  return r && typeof r[fn] === 'function' ? r[fn](r, card, ...args) : undefined;
};

defineNacho({
  // Passimian 766
  passimian: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const r = received(card);
      if (!r) return { vars: [] };
      // generate_ui: the received card's description (+ a "Received Card" box).
      let vars = [], key = r.key;
      if (typeof r.loc_vars === 'function') { const o = r.loc_vars(r, [], card); if (o && o.vars) vars = o.vars; if (o && o.key) key = o.key; }
      info_queue.push({ set: 'Other', key: 'received_card', vars: [localize({ type: 'name_text', set: 'Joker', key: r.key })] });
      return { key, set: 'Joker', vars };
    },
    calculate(self, card, context) {
      const r = received(card);
      if (!r && !context.blueprint) {
        if ((context.selling_card && !context.selling_self) || context.joker_type_destroyed) {
          const c = context.card;
          if (c && c.area === G.jokers && c.config.center_key !== self.key && c.config.center.key !== self.key) receive_card(self, card, c.config.center.key, context);
        }
        return undefined;
      }
      if (r && typeof r.calculate === 'function' && (r.blueprint_compat || !context.blueprint)) return r.calculate(r, card, context);
      return undefined;
    },
    add_to_deck: delegate('add_to_deck'),
    remove_from_deck: delegate('remove_from_deck'),
    calc_dollar_bonus: delegate('calc_dollar_bonus'),
    calc_scaling: delegate('calc_scaling'),
  },
}, FILE);
