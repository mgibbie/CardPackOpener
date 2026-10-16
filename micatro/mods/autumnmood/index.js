/**
 * AutumnMoodMechanics 0.0.0f (AutumnMood; Steamodded 1.0), rebuilt natively for Micatro — an engine/library mod.
 * Source: `Desktop/mods off/AutumnMoodMechanics-main` — amm.lua, api/*.lua, lovely/lovely.toml.
 *
 * Content of its own: the Oddity consumable type (no cards — other mods add them), 8 Oddity packs, the Oddity
 * and Heirloom tags. Systems (api.js, exported for other mods — Þe Autumn Circus uses them):
 *   Stamps      a seal-like layer on JOKERS (seals of set 'Stamp' a mod registers in content.seals): apply /
 *               unapply on set_seal, deck_add / deck_remove, calculate (joker_main through the engine's
 *               `joker_seal` seam, end_of_round / setting_blind / reroll_shop / before / after here), badge + art
 *   Aspects     a second seal-like layer on playing cards (registerAspects): calculated in main scoring after the
 *               card's own effects (the engine's `post_effects`), repetitions, before / after / discard /
 *               end_of_round contexts; copied by copy_card; badge + tooltip text + art (Aspect.lua DrawStep)
 *   Graveyard   destroyed playing cards leave a copy in G.graveyard (G.graveyard_area); move_to_graveyard /
 *               move_from_graveyard / remove_from_game; the amm_buried_card context; the read API; a
 *               Graveyard tab in the deck view and "(n)" on the deck when a mod turns on `amm_graveyard`
 *   Bottles     a bottled card is always on top of the deck after a shuffle (the engine's `shuffled` hook)
 *   Suit levels G.GAME.amm_data.suit_levels (+5 Chips / +1 Mult a level, scored by the card's suit); a "Suits"
 *               tab in Run Info when a mod turns on `amm_suit_levels`; the "(Spades lvl.2) +5 X +1" card line
 *   Combining   combine_cards (amm.lua); destroy_random_jokers (priority: debuffed / Perishable / Rental);
 *               mod_blind; card qualities (CardQualities.lua: has / random / create / localize)
 *   Unscored    perma_u_chips / perma_u_mult / perma_u_x_chips / perma_u_x_mult score when the card is played but
 *               doesn't score (the engine's 'unscored' pass; on when a mod declares the `unscored` feature)
 *   Petting     the amm_pet_card context (Petting.lua circles the mouse over a card): the 'amm_pet' action; the
 *               board fires it when the pointer circles 1.75 turns over a card (ui/board.js), like the Lua
 * SMODS parity this needed while AMM is on (no-op for other runs): perma_h_mult / perma_h_x_mult / perma_h_chips /
 * perma_h_x_chips on held cards and perma_x_chips on played cards, perma_repetitions (SMODS card fields the base
 * engine doesn't read), and the Oddity type's rarities (engine: consumable types with `rarities`).
 *
 * Intended-design fixes (each tested in micatro/tests/mods/autumnmood_test.mjs, failing with the fix reverted):
 *  1. Legendary Oddities: the get_current_pool patch used rarity_pools[-4] (nonexistent) — the Heirloom Tag
 *     crashed instead of making a Legendary Oddity. It uses the Legendary (4) pool (oddity.js).
 *  2. combine_cards' new card never got a playing_card number, so a combined card could never reach the
 *     graveyard when destroyed; it's numbered like any card added to the deck.
 *
 * Skipped: api/PlusMult.lua (commented out in the mod — and with it its 2 sounds, which only it registered),
 * the config menu (JoyousSpring / field spells / "no no_collection"), the collection pages (Micatro has no
 * collection screen), the cross-mod lovely files (joyous_crossmod / backwards_compat / graveyard_patches /
 * post.toml: JoyousSpring, SixSuits, AllInJest, pta_saka, Aikoyori, vallkarri, Maximus — none in Micatro) and
 * lovely.toml's patches to mods Micatro doesn't have (Cryptid, Entropy, YGGDRASIL, SpectrumAPI, 0 ERROR,
 * pta_saka, TOGA, Maximus, JoyousSpring, a MoreFluff Cryptid check). Its Pokermon patch (an evolving joker
 * keeps its Stamp) needs nothing: Micatro's Pokermon evolves a joker in place (set_ability), so its seal stays.
 */
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { registerMod, isActive, feature, MOD_LOC } from '../../js/mods/registry.js';
import { G, P_CENTERS, P_SEALS, P_CENTER_POOLS, localize } from '../../js/engine/core.js';
import { smods_effect } from '../../js/engine/run.js';
import LOC from './loc.js';
import * as API from './api.js';
import * as ODD from './oddity.js';

const { MOD_ID, ART } = API;

/** The pack that's open selects its cards into the consumable slots (SMODS select_card = 'consumeables'). */
const selecting_pack = (card) => {
  if (!G.pack_cards || card.area !== G.pack_cards || !G.GAME.pack_center) return false;
  const pc = P_CENTERS[G.GAME.pack_center];
  return !!(pc && pc.select_card === 'consumeables' && card.ability.consumeable);
};
/** A playing card evaluating its aspect in a scoring-time SMODS context (context.cardarea / main_scoring set). */
const aspect_effect = (card, ctx) => (card.aspect && !card.debuff ? API.calculate_aspect(card, ctx) : undefined);
const base_ctx = (ctx) => ({ full_hand: ctx.full_hand, scoring_hand: ctx.scoring_hand, scoring_name: ctx.scoring_name || ctx.poker_hand, poker_hands: ctx.poker_hands });

const hooks = {
  init_game_object(GAME) {
    API.init_suit_levels(GAME);
    // (amm.lua: no Oddities registered -> no Oddities in the shop)
    if (!(P_CENTER_POOLS.Oddity || []).length) GAME.oddity_rate = 0;
    API.init_graveyard();
    API.GY.active = false; // (Game:start_run: the graveyard opens once the run has started)
  },
  start_run() { API.GY.active = true; },

  // ---- suit levels: Card:get_chip_bonus / get_chip_mult wraps
  chip_bonus(ret, card) {
    const sl = !card.debuff && card.base && G.GAME.amm_data && G.GAME.amm_data.suit_levels[card.base.suit];
    return sl && !API.has_no_suit(card) ? ret + sl.chips : ret;
  },
  chip_mult(ret, card) {
    const sl = !card.debuff && card.base && card.ability.set !== 'Joker' && G.GAME.amm_data && G.GAME.amm_data.suit_levels[card.base.suit];
    return sl && !API.has_no_suit(card) ? ret + sl.mult : ret;
  },

  // ---- graveyard / aspects / bottles on card copies and removal
  card_removed(card) { API.on_card_removed(card); },
  copy_card(nc, other) {
    if (other.aspect) API.set_aspect(nc, other.aspect, true);
    nc.bottle = other.bottle;
  },
  shuffled(area) { API.bottle_after_shuffle(area); },

  // ---- seals & stamps: SMODS apply / unapply / deck_add / deck_remove (lovely.toml Card:set_seal / add_to_deck patches)
  set_seal(card, seal, prev) {
    if (prev && prev !== seal) { const o = P_SEALS[prev]; if (o && o.mod && isActive(o.mod) && o.unapply) o.unapply(card); }
    if (seal) { const o = P_SEALS[seal]; if (o && o.mod && isActive(o.mod) && o.apply) o.apply(card); }
  },
  add_to_deck(card) { const o = card.seal && P_SEALS[card.seal]; if (o && o.mod && isActive(o.mod) && o.deck_add) o.deck_add(card); },
  remove_from_deck(card) { const o = card.seal && P_SEALS[card.seal]; if (o && o.mod && isActive(o.mod) && o.deck_remove) o.deck_remove(card); },
  joker_seal: (joker, ctx) => API.calculate_stamp(joker, ctx),
  new_round() { API.stamps_in_context({ setting_blind: true, blind: G.GAME.round_resets.blind }); },
  // (after the reroll restocks: the engine's jokers get reroll_shop two events later, like this)
  reroll_shop() { G.E_MANAGER.add_event(() => { G.E_MANAGER.add_event(() => { API.stamps_in_context({ reroll_shop: true }); }); }); },

  // ---- aspects (and SMODS's held / x_chips perma bonuses) in a played or held card's main scoring
  eval_card(card, context, ret) {
    if (card.debuff || context.repetition) return;
    const a = card.ability;
    if (context.cardarea === G.hand) {
      // SMODS: get_chip_h_mult / h_x_mult / h_bonus / h_x_bonus add the perma_h_* bonuses
      if (a.perma_h_mult) ret.h_mult = (ret.h_mult || 0) + a.perma_h_mult;
      if (a.perma_h_x_mult) ret.x_mult = (ret.x_mult || 1) * (a.perma_h_x_mult + 1);
      if (a.perma_h_chips) ret.h_chips = (ret.h_chips || 0) + a.perma_h_chips;
      if (a.perma_h_x_chips) ret.x_chips = (ret.x_chips || 1) * (a.perma_h_x_chips + 1);
    } else if (context.cardarea === G.play) {
      if (a.perma_x_chips) ret.x_chips = (ret.x_chips || 1) * (a.perma_x_chips + 1);
    }
    const eff = aspect_effect(card, { ...base_ctx(context), cardarea: context.cardarea, main_scoring: true });
    if (eff) (ret.post_effects = ret.post_effects || []).push(eff);
  },
  card_repetitions(card, context) {
    if (card.debuff) return undefined;
    const out = [];
    const eff = aspect_effect(card, { ...context, repetition_only: true });
    if (eff && eff.repetitions) out.push(eff);
    const pr = card.ability.perma_repetitions;
    if (pr && pr > 0) out.push({ card, message: localize('k_again_ex'), repetitions: pr });
    return out.length ? out : undefined;
  },
  unscored_card(card, ctx) {
    const out = [];
    const u = API.unscored_effect(card);
    if (u) out.push(u);
    const eff = aspect_effect(card, ctx);
    if (eff) out.push(eff);
    return out;
  },
  discard_card(card, ctx) {
    // SMODS.calculate_context({discard = true, other_card = card}) reaches every card in hand
    for (const c of G.hand.cards.slice()) {
      const eff = aspect_effect(c, { discard: true, other_card: card, full_hand: (ctx && ctx.full_hand) || G.hand.highlighted, cardarea: G.hand });
      if (eff) smods_effect(eff, c);
    }
  },
  modify_scoring(v, step, ctx) {
    if (step !== 'before_blind') return undefined;
    // (calculate_context({before = true}): the playing cards and the stamps after the jokers)
    API.stamps_in_context({ ...ctx, before: true });
    for (const area of [G.play, G.hand]) {
      for (const c of area.cards.slice()) {
        const cardarea = area === G.play ? (ctx.scoring_hand.includes(c) || !feature('unscored') ? G.play : 'unscored') : G.hand;
        const eff = aspect_effect(c, { ...ctx, before: true, cardarea });
        if (eff) smods_effect(eff, c);
      }
    }
    return undefined;
  },
  hand_scored(chips, mult, ctx) {
    API.stamps_in_context({ ...ctx, after: true });
    for (const area of [G.play, G.hand]) {
      for (const c of area.cards.slice()) {
        const eff = aspect_effect(c, { ...ctx, after: true, cardarea: area });
        if (eff) smods_effect(eff, c);
      }
    }
  },
  end_round() {
    const game_over = !BN.beats(G.GAME.chips, G.GAME.blind.chips);
    API.stamps_in_context({ end_of_round: true, game_over, main_eval: true, beat_boss: !!G.GAME.blind.boss });
    for (const c of G.hand.cards.slice()) {
      const eff = aspect_effect(c, { end_of_round: true, cardarea: G.hand, game_over });
      if (eff) smods_effect(eff, c);
    }
  },

  // ---- Oddity packs: Select (into the consumable slots), not Use
  can_reserve: (card) => (selecting_pack(card) ? true : undefined),
  pack_select: (card) => (selecting_pack(card) ? false : undefined),

  // ---- petting (Petting.lua): {type: 'amm_pet', id, direction: 'clockwise' | 'counter-clockwise', time}
  action(a) {
    if (a.type !== 'amm_pet') return undefined;
    if (!API.can_pet()) return 'cannot pet now';
    const c = (G.areas || []).flatMap((ar) => ar.cards).find((x) => x.sort_id === a.id);
    if (!c) return 'no such card';
    API.pet_card(c, a.direction, Math.max(0, Number(a.time) || 0));
    return true;
  },

  // ---- descriptions, art, run info
  describe(card, desc) {
    const s = card.seal && P_SEALS[card.seal];
    if (s && s.set === 'Stamp' && s.mod && isActive(s.mod)) {
      const key = card.seal.toLowerCase() + '_stamp';
      const label = s.display_name || s.name || card.seal;
      const i = desc.badges.findIndex((b) => b.key === card.seal.toLowerCase() + '_seal');
      const b = { key, label, colour: s.colour };
      if (i >= 0) desc.badges[i] = b; else desc.badges.push(b);
      desc.info = desc.info || [];
      desc.info.push({ key, name: label, lines: s.text || [] });
    }
    const as = card.aspect && API.ASPECTS[card.aspect];
    if (as && isActive(as.mod)) {
      const d = aspect_loc(card.aspect), key = card.aspect.toLowerCase() + '_aspect';
      desc.badges.push({ key, label: d.name, colour: as.badge_colour, text_colour: as.badge_text_colour });
      (desc.info = desc.info || []).push({ key, name: d.name, lines: d.text });
    }
    if (card.bottle) {
      desc.badges.push({ key: 'bottle', label: LOC.misc.labels.bottle });
      (desc.info = desc.info || []).push({ key: 'bottle', name: LOC.descriptions.Other.bottle.name, lines: LOC.descriptions.Other.bottle.text });
    }
    if (card.ability.set === 'Oddity' && card.config.center.rarity) {
      const r = ODD.RARITY_BADGE[card.config.center.rarity];
      if (r) desc.badges.splice(Math.min(1, desc.badges.length), 0, { key: r[0], label: r[1], colour: r[2] });
    }
  },
  view_card(card, v) {
    const stickers = [];
    const s = card.seal && P_SEALS[card.seal];
    if (s && s.set === 'Stamp' && s.mod && isActive(s.mod)) { v.stamp = card.seal; stickers.push({ atlas: s.atlas, pos: s.pos }); }
    if (card.bottle) { v.bottle = true; stickers.push({ atlas: 'amm_bottle', pos: { x: 0, y: 0 } }); }
    const as = card.aspect && API.ASPECTS[card.aspect];
    if (as && isActive(as.mod)) { v.aspect = card.aspect; stickers.push({ atlas: as.atlas, pos: as.pos }); }
    if (stickers.length) v.mod_stickers = (v.mod_stickers || []).concat(stickers);
    // a playing card's tooltip lines (describePlaying): suit level, aspect, bottle, unscored bonuses
    if (card.base && card.base.suit && (card.ability.set === 'Default' || card.ability.set === 'Enhanced')) {
      const lines = card_lines(card);
      if (lines.length) v.mod_lines = (v.mod_lines || []).concat(lines);
    }
    if (selecting_pack(card)) { v.no_use = true; v.reserve = true; v.reserve_label = 'Select'; }
  },
  view(view, cardView) {
    view.amm_petting = true; // (the board turns a mouse circle over a card into the 'amm_pet' action)
    if (feature('amm_suit_levels')) {
      view.mod_runinfo_tabs = (view.mod_runinfo_tabs || []).concat([{ key: 'amm_suits', label: localize('b_suits'), kind: 'levels', rows: API.suit_rows() }]);
    }
    if (feature('amm_graveyard') && G.graveyard) {
      view.mod_deck_tabs = (view.mod_deck_tabs || []).concat([{
        key: 'amm_graveyard', label: localize('b_graveyard'), empty: localize('k_empty_graveyard'),
        list: G.graveyard.map((c) => [c.config.card.key, c.config.center.key, c.edition ? c.edition.type : 0, c.seal || 0, 1, c.debuff ? 1 : 0]),
        cards: G.graveyard.map((c) => cardView(c)),
      }]);
      view.deck_extra = ' (' + G.graveyard.length + ')';
    }
  },
};

/** An aspect's name + text (descriptions.Aspect['<key>_aspect']). */
function aspect_loc(key) {
  const d = (MOD_LOC.descriptions.Aspect || {})[String(key).toLowerCase() + '_aspect'];
  const as = API.ASPECTS[key] || {};
  return { name: (d && d.name) || as.display_name || as.name || key, text: (d && d.text) || [] };
}
/** The tooltip lines AMM adds to a playing card (Card:generate_UIBox_ability_table patches). */
function card_lines(card) {
  const out = [];
  const sl = G.GAME.amm_data && G.GAME.amm_data.suit_levels[card.base.suit];
  if (sl && sl.level > 1 && !API.has_no_suit(card)) {
    out.push(`{s:0.8,C:inactive}({s:0.8,C:${String(card.base.suit).toLowerCase()}}${API.localize_suit(card.base.suit)} {s:0.8,C:attention}lvl.${sl.level}{s:0.8,C:inactive}) {s:0.8,C:white,X:chips}+${sl.chips}{s:0.4} {s:0.8}X{s:0.4} {C:white,X:mult,s:0.8}+${sl.mult}{s:0.8}`);
  }
  const a = card.ability;
  const loc = (k, x) => (LOC.descriptions.Other[k].text || []).map((l) => l.replace('#1#', x));
  if (a.perma_u_chips) out.push(...loc('card_extra_u_chips', (a.perma_u_chips > 0 ? '+' : '') + a.perma_u_chips));
  if (a.perma_u_mult) out.push(...loc('card_extra_u_mult', (a.perma_u_mult > 0 ? '+' : '') + a.perma_u_mult));
  if (a.perma_u_x_chips) out.push(...loc('card_u_x_chips', a.perma_u_x_chips + 1));
  if (a.perma_u_x_mult) out.push(...loc('card_u_x_mult', a.perma_u_x_mult + 1));
  const as = card.aspect && API.ASPECTS[card.aspect];
  if (as && isActive(as.mod)) {
    const d = aspect_loc(card.aspect);
    out.push('', `{C:attention}${d.name}`, ...d.text);
  }
  if (card.bottle) out.push('', `{C:attention}${LOC.descriptions.Other.bottle.name}`, ...LOC.descriptions.Other.bottle.text);
  return out;
};

const centers = ODD.centers;
export const AMM = registerMod({
  id: MOD_ID,
  name: 'AutumnMoodMechanics',
  prefix: 'amm',
  version: '0.0.0f',
  by: 'AutumnMood (rebuilt for Micatro)',
  badge_colour: '#000000',
  description: 'Mechanics library: Oddity cards and packs, joker Stamps, card Aspects, a graveyard for destroyed cards, suit levels.',
  content: {
    centers,
    tags: ODD.tags,
    consumable_types: ODD.consumable_types,
    atlases: {
      amm_Oddity: { src: ART + 'Oddity.png', px: 71, py: 95 },
      amm_modicon: { src: ART + 'OddityTag.png', px: 34, py: 34 },
      amm_bottle: { src: ART + 'bottle.png', px: 71, py: 95 },
    },
    loc: LOC,
  },
  hooks,
});

export const STATUS = {
  boosters: centers.filter((c) => c.set === 'Booster').map((c) => c.key),
  tags: ODD.tags.map((t) => t.key),
  consumable_types: ['Oddity'],
};
export { API };
