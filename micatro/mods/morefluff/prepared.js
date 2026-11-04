/**
 * More Fluff 1.9.9999 — prepared cards (src/prepared.lua): a joker (or, with Aura Farm, a held Tarot card) may carry a
 * "prepared" consumable. While it is prepared, its USE button (view_card mod_actions -> the 'mf_use_prepared' action)
 * makes a copy of that consumable in play and uses it; that unprepares the card until its own condition prepares it
 * again (jokers set ability.extra.is_prepared). The card's tooltip shows the prepared consumable's text and whether it
 * is prepared (G.UIDEF.card_h_popup: here an info box). After the use, context.mf_used_prepared reaches the jokers.
 *
 *   FLUFF.has_prepared_card(card)   center.prepared_card — or a Tarot in the consumable slots while Aura Farm is held
 *   FLUFF.get_prepared_card(card)   that key (a function of the card, or c_aura for Aura Farm's Tarots)
 *   FLUFF.is_prepared(card)         ability.extra.is_prepared (Aura Farm's Tarots: prepared unless used)
 *
 * The "can it be used now" check runs the prepared consumable's own can_use on a stand-in (the Lua's get_dummy: the
 * center's config as its ability, no area), so a Doom Blade asks for 1-3 selected face cards exactly as the card would.
 * Port note: an Aura Farm Tarot whose ability.extra is a number (The Wheel of Fortune, Temperance, ...) can't hold the
 * Lua's extra.is_prepared (upstream indexes a number there); its prepared state is kept in ability.mf_aura_used instead.
 */
import { G, P_CENTERS, Card, localize, create_card } from '../../js/engine/core.js';
import { use_card, calculate_context } from '../../js/engine/run.js';
import { describeCenter } from '../../js/engine/describe.js';
import { has } from './util.js';
import LOC from './loc.js';

const aura_tarot = (card) => has('j_mf_aura_farm') && card.ability.set === 'Tarot' && card.area === G.consumeables;
const extra_obj = (card) => card.ability.extra && typeof card.ability.extra === 'object';
export function has_prepared_card(card) {
  return !!(card && card.config && card.config.center && (card.config.center.prepared_card || aura_tarot(card)));
}
export function get_prepared_card(card) {
  if (aura_tarot(card)) return 'c_aura';
  const p = card.config.center.prepared_card;
  if (!p) return 'c_death';
  return typeof p === 'function' ? p(card) : p;
}
export function is_prepared(card) {
  if (aura_tarot(card)) return extra_obj(card) ? card.ability.extra.is_prepared !== false : !card.ability.mf_aura_used;
  return !!(extra_obj(card) && card.ability.extra.is_prepared);
}
function unprepare(card) {
  if (extra_obj(card)) card.ability.extra.is_prepared = false;
  else if (card.ability.extra === undefined || card.ability.extra === null) card.ability.extra = { is_prepared: false };
  else card.ability.mf_aura_used = true;
}
/** get_dummy(center): the prepared consumable as it would be, for its can_use / loc_vars. */
function dummy(center, original) {
  const ab = JSON.parse(JSON.stringify(center.config || {}));
  ab.consumeable = JSON.parse(JSON.stringify(center.config || {}));
  if (ab.consumeable.max_highlighted) ab.consumeable.mod_num = Math.min(5, ab.consumeable.max_highlighted);
  ab.name = center.name || center.key; ab.set = center.set; ab.effect = center.effect;
  for (const k of ['t_mult', 't_chips', 'extra_value', 'd_size', 'mult', 'h_size']) ab[k] = ab[k] || 0;
  ab.x_mult = ab.x_mult || ab.Xmult || 1;
  const eligible = (G.jokers ? G.jokers.cards : []).filter((v) => !v.edition);
  return {
    ability: ab, config: { center, center_key: center.key }, original_card: original, area: undefined, edition: undefined,
    eligible_strength_jokers: eligible, eligible_editionless_jokers: eligible, cost: original.cost, sell_cost: original.sell_cost,
  };
}
/** G.FUNCS.mf_can_use_prepared */
export function can_use_prepared(card) {
  if (!has_prepared_card(card) || !is_prepared(card) || card.debuff) return false;
  const center = P_CENTERS[get_prepared_card(card)];
  if (!center) return false;
  try { return !!Card.prototype.can_use_consumeable.call(dummy(center, card)); } catch (e) { return false; }
}
/** G.FUNCS.mf_use_prepared: the copy is made in play and used; the card is unprepared; then context.mf_used_prepared. */
export function use_prepared(card) {
  const key = get_prepared_card(card);
  const copy = create_card(P_CENTERS[key].set, G.play, null, null, null, null, key, undefined);
  copy.add_to_deck();
  G.play.emplace(copy);
  unprepare(card);
  use_card(copy);
  G.E_MANAGER.add_event(() => { calculate_context({ mf_used_prepared: true, card }); });
}

export const hooks = {
  /** The 'mf_use_prepared' action {id}: a joker's or held Tarot's prepared consumable. */
  action(a) {
    if (a.type !== 'mf_use_prepared') return undefined;
    const card = [...G.jokers.cards, ...G.consumeables.cards].find((c) => c.sort_id === a.id);
    if (!card || !has_prepared_card(card)) return 'nothing prepared';
    if (!can_use_prepared(card)) return 'cannot use it now';
    use_prepared(card);
    return true;
  },
  view_card(card, v) {
    if (!(card.area === G.jokers || card.area === G.consumeables) || !has_prepared_card(card) || card.debuff) return;
    const key = get_prepared_card(card);
    const name = (LOC.descriptions.Spectral[key] && LOC.descriptions.Spectral[key].name) || (P_CENTERS[key] && localize({ type: 'name_text', set: P_CENTERS[key].set, key })) || key;
    v.mod_actions = [...(v.mod_actions || []), { label: 'Use ' + String(name).replace(/\{[^}]*\}/g, ''), action: { type: 'mf_use_prepared', id: card.sort_id }, disabled: !can_use_prepared(card), cls: 'purple' }];
  },
  /** card_h_popup: the prepared consumable's text beside the card's, "prepared" / "not prepared". */
  describe(card, desc) {
    if (!card || !card.config || !has_prepared_card(card)) return;
    const key = get_prepared_card(card);
    let sub;
    try { sub = describeCenter(key); } catch (e) { sub = null; }
    if (!sub) return;
    const state = localize(is_prepared(card) ? 'k_prepared' : 'k_not_prepared');
    desc.info = [{ key: 'mf_prepared_' + key, name: sub.name, lines: [...(sub.lines || []), '{C:inactive}(' + state + ')'] }, ...(desc.info || [])];
  },
};
