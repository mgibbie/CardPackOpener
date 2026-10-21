// View model: a plain-JSON picture of the run that the renderer draws from.
// The local player renders toView() of the live engine; a spectator renders
// the same object received over the network — so both see the same screen.

import { G, P_BLINDS, P_TAGS, P_CENTERS, P_SEALS, get_blind_amount, setEventCardView } from './core.js';
import { STATE_NAMES, HANDLIST, legal, get_poker_hand_info } from './run.js';
import { describe, describeBlind, describeTag } from './describe.js';
import { callHook, MOD_LOC } from '../mods/registry.js';
import { mul, toJSONValue as J } from './bignum.js';

export const VIEW_VERSION = 1;

export function cardView(c, withDesc) {
  const v = {
    id: c.sort_id,
    center: c.config.center.key,
    set: c.ability.set,
    name: c.ability.name,
  };
  if (c.config.card && c.config.card.key) v.front = c.config.card.key;
  // A mod suit's card (Bunco's Fleurons / Halberds): its art cell, plus rank/suit for the text (spectators lack P_CARDS).
  if (c.config.card && c.config.card.atlas) {
    v.front_atlas = c.config.card.atlas; v.front_pos = c.config.card.pos; v.front_value = c.config.card.value; v.front_suit = c.config.card.suit;
    v.front_suit_name = (MOD_LOC.misc.suits_plural && MOD_LOC.misc.suits_plural[c.config.card.suit]) || c.config.card.suit;
  }
  const ctr = c.config.center;
  if (ctr.mod) {
    v.mod = ctr.mod;
    // Mod art: atlas name + cell (+ optional soul layer / animation frame / per-card override).
    v.atlas = (ctr.get_atlas && ctr.get_atlas(ctr, c)) || ctr.atlas;
    v.pos = (ctr.get_pos && ctr.get_pos(ctr, c)) || ctr.pos;
    if (ctr.soul_pos) v.soul_pos = ctr.soul_pos;
    if (ctr.soul_atlas) v.soul_atlas = ctr.soul_atlas; // (a soul on its own atlas: Nacho 1.7.9's Terapagos-Stellar)
  }
  if (c.edition && c.edition.type) v.edition = c.edition.type;
  if (c.seal) {
    v.seal = c.seal;
    const ps = P_SEALS[c.seal];
    if (ps && ps.mod) { v.seal_atlas = ps.atlas; v.seal_pos = ps.pos; }
  }
  if (c.debuff) v.debuff = true;
  if (c.facing === 'back') v.facing = 'back';
  if (c.highlighted) v.hl = true;
  if (c.ability.eternal) v.eternal = true;
  if (c.ability.perishable) { v.perishable = true; v.perish_tally = c.ability.perish_tally; }
  if (c.ability.rental) v.rental = true;
  if (c.pinned) v.pinned = true;
  if (c.area && (c.area.config.type === 'shop')) v.cost = c.cost;
  if (c.area && (c.area === G.jokers || c.area === G.consumeables)) v.sell = c.sell_cost;
  if (c.ability.set === 'Booster') v.cost = c.cost;
  if (withDesc) {
    try { v.desc = describe(c); } catch (e) { v.desc = { name: c.ability.name, lines: [] }; }
  }
  // A pack card an active mod lets you save to the consumable slots (the 'reserve' action) offers Save
  // beside Use: Pokermon's Pocket packs and its Mega Stone (lovely.toml reserve_and_use). Pokermon never
  // flagged it, so its Save button was missing; mods that label it themselves still do so in view_card.
  if (c.area && c.area === G.pack_cards && c.ability.consumeable && callHook('can_reserve', c).includes(true)) v.reserve = true;
  // A playing card with a mod's enhancement (Pokermon's Flower / Hazard, MoreFluff's, Bunco's, ...): its name and
  // text for the card's tooltip (ui/markup.js describePlaying knows only the base enhancements, so a Flower Queen
  // explained nothing but "+10 chips"), and whether it replaces the rank and suit (SMODS replace_base_card).
  if (ctr.mod && c.ability.set === 'Enhanced' && c.base && c.base.suit) {
    try { const d = describe(c); v.enh = { name: d.name, lines: d.lines || [] }; } catch (e) { v.enh = { name: c.ability.name, lines: [] }; }
    if (ctr.replace_base_card) v.enh.replace = true;
  }
  callHook('view_card', c, v);
  return v;
}

// The view a card event carries (core.js emit): described where its area's view is (toView below).
const DESC_AREAS = () => [G.jokers, G.consumeables, G.shop_jokers, G.shop_vouchers, G.shop_booster, G.pack_cards];
setEventCardView((c) => cardView(c, !!c.area && DESC_AREAS().includes(c.area)));

const areaView = (a, withDesc) => (a ? a.cards.map((c) => cardView(c, withDesc)) : []);

export function toView() {
  const GM = G.GAME;
  const rr = GM.round_resets;
  const b = GM.blind;
  const scaling = GM.starting_params.ante_scaling;
  const amt = get_blind_amount(rr.ante);
  const choices = {};
  for (const k of ['Small', 'Big', 'Boss']) {
    const key = rr.blind_choices[k];
    if (!key || !P_BLINDS[key]) continue;
    const pb = P_BLINDS[key];
    choices[k] = {
      key, name: pb.name, state: rr.blind_states[k], chips: J(mul(mul(amt, pb.mult), scaling)),
      dollars: GM.modifiers.no_blind_reward && GM.modifiers.no_blind_reward[k] ? 0 : pb.dollars,
      tag: k !== 'Boss' && rr.blind_tags ? rr.blind_tags[k] : undefined,
      tagDesc: k !== 'Boss' && rr.blind_tags && rr.blind_tags[k] ? safe(() => describeTag({ key: rr.blind_tags[k] })) : undefined,
      colour: pb.boss_colour, pos: pb.pos,
      // (a mod blind's chip is on its mod's own atlas: Pokermon's boss sheet, Bunco's ...)
      atlas: pb.mod && pb.atlas ? pb.atlas : undefined,
      desc: safe(() => bigDesc(describeBlind(key))),
    };
    // (a mod blind's `name` is its key, as Steamodded's: what the board shows is its loc name)
    if (pb.mod && choices[k].desc && choices[k].desc.name) choices[k].label = choices[k].desc.name;
  }
  const view = {
    v: VIEW_VERSION,
    seed: GM.pseudorandom.seed,
    back: GM.selected_back_key,
    stake: GM.stake,
    state: STATE_NAMES[G.STATE],
    ante: rr.ante,
    round: GM.round,
    win_ante: GM.win_ante,
    dollars: GM.dollars,
    chips: J(GM.chips),
    hands_left: GM.current_round.hands_left,
    discards_left: GM.current_round.discards_left,
    hand_limit: G.hand.config.card_limit,
    joker_limit: G.jokers.config.card_limit,
    consumeable_limit: G.consumeables.config.card_limit,
    seq: G.ui_seq || 0,
    preview: preview(),
    blind: b && b.config && b.config.blind && b.name ? {
      key: b.config.blind.key, name: b.name, chips: J(b.chips), dollars: b.dollars, boss: !!b.boss,
      disabled: !!b.disabled, colour: b.config.blind.boss_colour, pos: b.config.blind.pos,
      atlas: b.config.blind.mod && b.config.blind.atlas ? b.config.blind.atlas : undefined,
      desc: safe(() => bigDesc(describeBlind(b.config.blind.key, b))),
    } : bigBlind(GM.round_eval && GM.round_eval.blind) || null,
    blind_on_deck: GM.blind_on_deck,
    choices,
    boss_rerolled: !!rr.boss_rerolled,
    hands: HANDLIST.map((name) => {
      const h = GM.hands[name];
      return { name, level: h.level, chips: h.chips, mult: h.mult, played: h.played, visible: !!h.visible };
    }),
    areas: {
      hand: areaView(G.hand),
      play: areaView(G.play),
      jokers: areaView(G.jokers, true),
      consumeables: areaView(G.consumeables, true),
      shop_jokers: areaView(G.shop_jokers, true),
      shop_vouchers: areaView(G.shop_vouchers, true),
      shop_booster: areaView(G.shop_booster, true),
      pack_cards: areaView(G.pack_cards, true),
    },
    deck_count: G.deck.cards.length,
    discard_count: G.discard.cards.length,
    deck_total: G.playing_cards.length,
    // Full deck list (sorted, not in draw order) for the deck viewer.
    deck_list: G.playing_cards.map((c) => [c.config.card.key, c.config.center.key, c.edition ? c.edition.type : 0, c.seal || 0, c.area === G.deck ? 1 : 0, c.debuff ? 1 : 0]),
    tags: GM.tags.map((t) => ({ key: t.key, id: t.ID, desc: safe(() => describeTag(t)) })),
    vouchers: Object.keys(GM.used_vouchers).filter((k) => GM.used_vouchers[k]),
    round_eval: GM.round_eval ? (GM.round_eval.blind && typeof GM.round_eval.blind.chips === 'object' ? { ...GM.round_eval, blind: bigBlind(GM.round_eval.blind) } : GM.round_eval) : null,
    reroll_cost: GM.current_round.reroll_cost,
    pack_choices: GM.pack_choices || 0,
    pack_kind: packKind(),
    legal: legal(),
    over: !!GM.over,
    won: !!GM.won,
    endless: !!GM.endless,
    stats: { ...GM.stats, best_hand: J(GM.stats.best_hand) },
    mods: GM.mods || [],
    interest_cap: GM.interest_cap,
  };
  // Mods add their own fields / areas (Pokermon: view.areas.scry).
  callHook('view', view, cardView);
  return view;
}

/** Hand name + base chips×mult of the selected cards (shown to spectators too). */
function preview() {
  if (G.STATE !== G.STATES.SELECTING_HAND || !G.hand.highlighted.length) return null;
  const info = get_poker_hand_info(G.hand.highlighted);
  if (!info || info.text === 'NULL') return null;
  const h = G.GAME.hands[info.text];
  const facedown = G.hand.highlighted.some((c) => c.facing === 'back');
  if (facedown) return { name: '????', level: '?', chips: '?', mult: '?' };
  const blocked = !!G.GAME.blind.debuff_hand(G.hand.highlighted, info.poker_hands, info.text, true);
  return { name: info.loc_disp_text || info.disp_text, hand: info.text, level: h.level, chips: h.chips, mult: h.mult, blocked };
}

function packKind() {
  const S = G.STATES;
  return ({ [S.TAROT_PACK]: 'Arcana', [S.PLANET_PACK]: 'Celestial', [S.SPECTRAL_PACK]: 'Spectral', [S.STANDARD_PACK]: 'Standard', [S.BUFFOON_PACK]: 'Buffoon' })[G.STATE] ||
    ((G.STATE === S.MOD_PACK || G.STATE === S.MOD_PACK_HAND) ? (G.GAME.pack_kind || 'Mod') : null);
}

// Big-number scoring: a Decimal travels as its JSON string ("1.234e450") — the local board and a
// spectator then draw the same view. (Plain numbers pass through, so vanilla views are unchanged.)
function bigDesc(d) { if (d && typeof d.chips === 'object' && d.chips) d.chips = J(d.chips); return d; }
function bigBlind(b) { return b && typeof b.chips === 'object' && b.chips ? { ...b, chips: J(b.chips) } : b; }

function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

export { P_CENTERS, P_TAGS };
