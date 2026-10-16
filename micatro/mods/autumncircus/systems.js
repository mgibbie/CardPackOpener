// Þe Autumn Circus — everything but the jokers / Oddities / tarots-planets-spectrals:
//   JokerStamps.lua        10 Stamps (Vampire's and Hiker's are disabled in config.lua, as shipped)
//   HamSpect.lua           12 Aspects (the Homestuck Aspects — owner decision 2026-10-16: included)
//   Enhancable.lua         4 enhancements (Star, Bone, Jewel, Soulbound; Loop / Grass / Dirt are commented out)
//   EditionToMeetYa.lua    the Gilded edition (+ its shader, ported to WebGL; Etched is commented out)
//   TagImIt.lua            Gilded and Chaos Tags
//   BlindToAllButTheVideo  Jera and the Þe Autumn Circus showdown boss
//   StakeMePls.lua         the Culmination stake
//   TransGirlsWhoBooster   the Option Select pack
//   VouchMe.lua            12 vouchers (Overscaling / Hyperscaling need Stacked: skipped)
//   DeckTheBalatro.lua     9 decks (Lavender needs Aikoyori: skipped; Alpha/Beta/Omega/Progenitor, Cyan, Fuchsia,
//                          Orange, Lime, Violet and Pale are commented out)
//   overrides.lua / lovely.toml: Stamp Savvy & the Joker tarot's edition (create_card), Chaos' Stamp ($4 on a
//   round win), Mr. Bones' Stamp & Wheel of Wheel of Fortune (new_round), Sock and Buskin's retrigger, Dusk's
//   probability cap, the Breath Aspect's selection limits, Ceaseless Wheel, the +$2 stamp price (Stamp Coupon),
//   the Collector's Deck (every consumable is an Oddity), Undying Deck / Soulbound (graveyard -> deck after a
//   Boss), round_resets.hands_played.
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import {
  G, P_CENTERS, P_SEALS, P_CENTER_POOLS, card_eval_status_text, localize, pseudorandom, pseudoseed, pseudorandom_element,
  create_card, copy_card, poll_edition, juice_card, play_sound, emit, number_format, math_random, get_current_pool, ease_dollars,
} from '../../js/engine/core.js';
import { smods_effect } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { isActive, CONSUMABLE_TYPES, MOD_LOC } from '../../js/mods/registry.js';
import { describe } from '../../js/engine/describe.js';
import { AMM, object, chance, prob_vars, say, room, has_no_suit, has_no_rank, has_any_suit } from './util.js';

const hex = (h) => (h ? (String(h).startsWith('#') ? String(h) : '#' + h) : undefined);
const used = (k) => !!(G.GAME && G.GAME.used_vouchers && G.GAME.used_vouchers[k]);
const change_play_limit = (mod) => { const sp = G.GAME.starting_params; sp.play_limit = (sp.play_limit ?? 5) + mod; G.hand.config.highlighted_limit = Math.max(sp.discard_limit ?? 5, sp.play_limit, 5); };
const change_discard_limit = (mod) => { const sp = G.GAME.starting_params; sp.discard_limit = (sp.discard_limit ?? 5) + mod; G.hand.config.highlighted_limit = Math.max(sp.discard_limit, sp.play_limit ?? 5, 5); };
export { change_play_limit, change_discard_limit };

// ===================================================================== stamps
const stamp = (key, fns = {}) => {
  const s = object('Stamps', key);
  return {
    key: 'thac_' + key, set: 'Stamp', name: s.name, display_name: s.display_name, text: s.text, pos: s.pos, atlas: s.atlas,
    colour: hex(s.color), badge_colour: hex(s.color), ...fns,
  };
};
const deck_fns = (add, remove) => ({
  apply(card) { if (card.added_to_deck) add(); },
  unapply(card) { if (card.added_to_deck) remove(); },
  deck_add() { add(); },
  deck_remove() { remove(); },
});
export const stamps = [
  stamp('jimbo', deck_fns(() => G.hand.change_size(1), () => G.hand.change_size(-1))),
  stamp('todd', deck_fns(() => change_play_limit(1), () => change_play_limit(-1))),
  stamp('steven', deck_fns(() => change_discard_limit(1), () => change_discard_limit(-1))),
  stamp('chaos'), // ($4 on a round win: hooks.end_round)
  stamp('andy', deck_fns(() => { G.consumeables.config.card_limit += 1; }, () => { G.consumeables.config.card_limit -= 1; })),
  stamp('mr_bones'), // (Blinds 15% weaker: hooks.new_round)
  stamp('sock_and_buskin'), // (retrigger: hooks.joker_retriggers)
  stamp('gros_michel', {
    calculate(self, card, context) {
      if (context.joker_main) return { card, focus: card, mult: 15 };
      if (context.end_of_round && context.cardarea === G.jokers && !context.blueprint) {
        if (chance(card, 'gros_michel_stamp', 1, 40)) {
          return { card, focus: card, message: 'Removed!', colour: 'ORANGE', extra: { func() { card.set_seal(); } } };
        }
        return { card, focus: card, message: 'Safe!', colour: 'ORANGE' };
      }
    },
  }),
  stamp('blueprint', {
    calculate(self, card, context) {
      if (context.reroll_shop && !context.blueprint && card.config.center.set === 'Joker') {
        if (chance(card, 'blueprint_stamp', 1, 10)) {
          const nc = create_card('Joker', G.shop_jokers, null, null, null, null, card.config.center.key);
          G.shop_jokers.emplace(nc);
          nc.set_cost();
          emit('materialize', { card: nc.sort_id });
          return { card, focus: card, message: 'Manufactured!', colour: 'BLUE' };
        }
      }
    },
  }),
  stamp('dusk'), // (probability cap: hooks.probability_vars)
];
const stamp_of = (card) => card.get_seal && card.get_seal();

// ==================================================================== aspects
const aspect = (key, calculate, extra = {}) => {
  const s = object('Aspects', key);
  return {
    key: 'thac_' + key, name: s.name, effect: s.effect, pos: s.pos, atlas: s.atlas, config: s.config || {},
    badge_colour: hex(s.badge_colour), badge_text_colour: hex(s.badge_text_colour), calculate, ...extra,
  };
};
const main_play = (ctx) => ctx.cardarea === G.play && ctx.main_scoring;
export const aspects = [
  aspect('breath', () => undefined), // (selection limits: hooks below)
  aspect('life', (self, card, ctx) => {
    if (main_play(ctx) && chance(card, 'life_aspect', 1, 3)) return { message: '+2 Hands', colour: 'BLUE', func() { G.GAME.current_round.hands_left += 2; emit('hands', { mod: 2, total: G.GAME.current_round.hands_left }); } };
  }),
  aspect('light', (self, card, ctx) => {
    if (main_play(ctx)) {
      return {
        dollars: 5, message: localize('k_val_up'), colour: 'MONEY',
        func() {
          // FIX (intended design): the text gives "each Joker and consumable" +$2 of sell value; the Lua loops
          // over G.jokers only. Consumables gain it too.
          for (const v of [...G.jokers.cards, ...G.consumeables.cards]) {
            v.ability.extra_value = (v.ability.extra_value || 0) + 2;
            v.set_cost();
            juice_card(v);
          }
        },
      };
    }
  }),
  aspect('time', (self, card, ctx) => {
    if (main_play(ctx) || (ctx.discard && ctx.other_card === card)) {
      return { message: '+1 Discard', colour: 'RED', func() { G.GAME.current_round.discards_left += 1; emit('discards', { mod: 1, total: G.GAME.current_round.discards_left }); } };
    }
  }),
  aspect('heart', (self, card, ctx) => { if (main_play(ctx)) return { Xmult: 3 }; }),
  aspect('rage', (self, card, ctx) => { if (main_play(ctx)) return { chips: G.GAME.current_round.hands_played === 0 ? 300 : 60 }; }),
  aspect('blood', (self, card, ctx) => {
    if (!main_play(ctx)) return undefined;
    let suits = 0;
    if (!has_no_suit(card)) {
      for (const v of G.hand.cards) {
        if (has_no_suit(v)) continue;
        if (has_any_suit(card) || has_any_suit(v)) suits++;
        else for (const s of AMM.suit_buffer()) if (card.is_suit(s) && v.is_suit(s)) { suits++; break; }
      }
    }
    let ranks = 0;
    if (!has_no_rank(card)) for (const v of G.hand.cards) if (!has_no_rank(v) && card.base.value === v.base.value) ranks++;
    return { chips: suits * 80, mult: ranks * 25 };
  }),
  aspect('doom', (self, card, ctx) => {
    if (ctx.main_scoring && ctx.cardarea === G.play) {
      return {
        extra: { focus: card, message: localize({ type: 'variable', key: 'a_blind_minus_percent', vars: [25] }) },
        func() { G.E_MANAGER.add_event(() => { AMM.mod_blind(0.75, null, true); }); },
      };
    }
  }),
  // FIX (intended design): Void's check (`context.other_card == card` together with main_scoring) is never true in
  // Steamodded's scoring — the card is scored before other_card is set — so the Aspect never did anything. Its
  // text: "Score this card as if it was played and scored while it is held in hand": a held Void card is scored
  // as a played card (SMODS.score_card with cardarea = G.play) during its held-in-hand scoring.
  aspect('void', (self, card, ctx) => {
    if (ctx.main_scoring && ctx.cardarea === G.hand && card.area === G.hand && G.scoring) G.scoring.score_played(card);
  }),
  aspect('space', (self, card, ctx) => { if (main_play(ctx)) return { Xmult: 1 + (0.5 * G.hand.cards.length) }; }),
  aspect('mind', (self, card, ctx) => {
    if (ctx.cardarea === G.hand && ctx.before) {
      return {
        message: localize('k_upgrade_ex'), colour: 'MULT',
        func() { card.ability.perma_h_x_mult = Math.max(card.ability.perma_h_x_mult || 0, 0) + 0.3; },
      };
    }
  }),
  aspect('hope', (self, card, ctx) => {
    if (ctx.repetition_only) return { repetitions: G.GAME.current_round.hands_left === 0 ? 3 : 1, message: localize('k_again_ex'), card };
  }),
];
AMM.registerAspects('autumncircus', aspects);
const breaths = (list) => list.filter((c) => c.aspect === 'thac_breath').length;

// =============================================================== enhancements
const enh = (key, def) => {
  const s = object('Enhancements', key);
  return { ...s, key: 'm_thac_' + key, set: 'Enhanced', name: 'm_thac_' + key, ...def };
};
export const enhancements = [
  enh('star', {
    loc_vars: (self, iq, card) => ({ vars: [((card && card.ability && card.ability.extra) || self.config.extra).reduction * 100] }),
    calculate(self, card, ctx) {
      if (ctx.main_scoring && ctx.cardarea === G.play) {
        const red = card.ability.extra ? card.ability.extra.reduction : 0.10;
        return {
          extra: { focus: card, message: localize({ type: 'variable', key: 'a_blind_minus_percent', vars: [card.ability.extra ? card.ability.extra.reduction * 100 : 10] }) },
          card,
          func() { G.E_MANAGER.add_event(() => { AMM.mod_blind(1 - red, null, true); }); },
        };
      }
    },
  }),
  enh('bone', {
    loc_vars(self, iq, card) {
      iq.push({ key: 'graveyard', set: 'Other' });
      const m = (card && card.ability && card.ability.extra ? card.ability.extra.mult : 1);
      return { vars: [m, m * AMM.GRAVEYARD.count_cards()] };
    },
    calculate(self, card, ctx) {
      if (ctx.main_scoring && ctx.cardarea === G.play) {
        const n = AMM.GRAVEYARD.count_cards();
        if (n === 0) return undefined;
        return { mult: (card.ability.extra ? card.ability.extra.mult : 1) * n };
      }
    },
  }),
  enh('jewel', {
    no_rank: true, no_suit: true, replace_base_card: true, always_scores: true,
    loc_vars: (self, iq, card) => ({ vars: [card && card.ability && card.ability.extra ? card.ability.extra.money : 5] }),
    calculate(self, card, ctx) {
      if (ctx.main_scoring && ctx.cardarea === G.play) return { p_dollars: card.ability.extra ? card.ability.extra.money : 5 };
    },
  }),
  enh('soulbound', {
    loc_vars(self, iq, card) { iq.push({ key: 'graveyard', set: 'Other' }); return { vars: [((card && card.ability && card.ability.extra) || self.config.extra).xmult] }; },
    remove_from_graveyard(self, card) { card.ability.perma_x_mult = (card.ability.perma_x_mult || 0) + card.ability.extra.xmult; },
  }),
];

// ===================================================================== edition
/** gilded.fs (Lyman's shader), ported to WebGL over gl.js's prelude; drawn OVER the card like an SMODS edition. */
export const GILDED_FS = `void main(){
  vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv;
  vec2 gilded = fx;
  float cyan = 0.; float magenta = 0.; float yellow = 0.;
  float low = min(tex.r, min(tex.r, tex.b));
  float high = max(tex.r, max(tex.g, tex.r));
  float delta = max(high-low, low*0.7);
  float fac = 0.8 + 0.4*sin(9.*uv.x+3.1*uv.y + gilded.r*2. + cos(gilded.r*1.1 + uv.y*0.2 - uv.x*7.7));
  float fac2 = 0.5 + 0.2*sin(1.*uv.x+7.1*uv.y + gilded.r*5. - cos(gilded.r*2. + uv.x*3.4));
  float fac3 = 0.5 + 0.3*sin(3.*uv.x+2.1*uv.y + gilded.r*3. + sin(gilded.r*2.1 + uv.y*4.5));
  float fac4 = 0.5 + 0.1*sin(4.*uv.x+4.1*uv.y + gilded.r*0.23 + sin(gilded.r*6.2 + uv.y*1.));
  float fac5 = sin(0.5*17.*uv.x+4.4*uv.y + gilded.r*12. + cos(gilded.r*2.2 + uv.y*1.2 - uv.x*1.4));
  float maxfac = 0.6*max(max(fac2, max(fac4, max(fac3,0.0))) + (fac+fac2+fac3*fac4), 0.);
  float black = 1. - max(tex.r, max(tex.g, tex.b));
  float grayscale = 0.2126 * tex.r + 0.7152 * tex.g + 0.0722 * tex.b;
  tex.rgb = vec3(grayscale);
  if (black < 1.) {
    cyan = (1. - tex.r - black) / (1. - black);
    magenta = (1. - tex.g - black) / (1. - black);
    yellow = (1. - tex.b - black) / (1. - black);
  }
  if (gilded.g > 0.0 || gilded.g < 0.0) { cyan *= 0.3; magenta *= 0.6; yellow *= 1.4; black *= 0.9; }
  tex.r = (1.2 - cyan) * (1. - black);
  tex.g = (1.2 - magenta) * (1. - black);
  tex.b = (1. - yellow) * (1. - black);
  float brightness_reduction = (0.5 * (uv.y-0.5));
  float bottom_rim = (0.2 * (uv.y-0.5));
  float x_brightness_reduction = (0.5 * (uv.x-0.5));
  tex.rgb *= (1.0 - brightness_reduction);
  tex.rgb *= (1.0 + bottom_rim);
  tex.rgb *= (1.0 - x_brightness_reduction);
  tex.g *= (1.0 - (0.5 * brightness_reduction));
  tex.g *= (1.0 - (0.5 * x_brightness_reduction));
  tex.b *= (1.0 - brightness_reduction);
  tex.b *= (1.0 - x_brightness_reduction);
  tex.rgb = clamp((tex.rgb - 0.5) * 0.8 + 0.5, 0.0, 1.0);
  tex.r *= 1.2; tex.g *= 0.90; tex.b *= 0.8;
  tex.r = tex.r-delta + delta*maxfac*(0.7 + fac5*0.35) - 0.1;
  tex.g = tex.g-delta + delta*maxfac*(0.7 + fac5*0.25) - 0.1;
  tex.b = tex.b-delta + delta*maxfac*(0.5 + fac5*0.20) - 0.1;
  tex.a = tex.a*(0.15*max(min(1., max(0.,0.9*max(low*0.7, delta)+ min(max(maxfac*0.7,0.), 0.01)) ), 0.) + 0.35*maxfac*(0.1+delta));
  gl_FragColor = dissolve_mask(tex, vUv, uv); }`;
const GILDED = object('Editions', 'gilded');
export const editions = [{
  key: 'e_thac_gilded', set: 'Edition', name: 'Gilded', config: GILDED.config, extra_cost: GILDED.extra_cost, weight: GILDED.weight, in_shop: true,
  shader: 'thac_gilded', shader_fs: GILDED_FS, shader_overlay: true, badge_colour: '#4ca893',
  loc_vars(self, iq, card) {
    iq.push({ key: 'thac_shadercredit_lyman', set: 'Other' });
    if (card && !card.fake && card.ability && (card.ability.set === 'Default' || card.ability.set === 'Enhanced')) return { vars: [self.config.extra.gold, 'Add', ' to', 'a random ', 'Joker', ' when scored'] };
    return { vars: [self.config.extra.gold, 'Gain', '', 'at end of round', '', ''] };
  },
}];
const gilded = (card) => !!(card.edition && card.edition.thac_gilded);
/** Gilded on a scored playing card: a random joker gains $3 of sell value (EditionToMeetYa.lua calculate). */
function gilded_scored(card) {
  if (!G.jokers.cards.length) return undefined;
  const [chosen] = pseudorandom_element(G.jokers.cards, pseudoseed('gilded'));
  if (!chosen) return undefined;
  return {
    extra: {
      focus: chosen, message: localize('k_val_up'), colour: 'MONEY',
      func() { G.E_MANAGER.add_event(() => { chosen.ability.extra_value = (chosen.ability.extra_value || 0) + card.edition.extra.gold; chosen.set_cost(); }); },
    },
    card,
  };
}

// ======================================================================== tags
const tagd = (key) => { const s = object('Tags', key); return { ...s, key: 'tag_thac_' + key, set: 'Tag', name: 'tag_thac_' + key }; };
export const tags = [
  {
    ...tagd('gilded'),
    loc_vars: () => ({ vars: [] }),
    apply(self, tag, context) {
      if (context.type === 'store_joker_modify') {
        const c = context.card;
        if (!c.edition && !c.temp_edition && c.ability.set === 'Joker') {
          c.temp_edition = true;
          tag.yep('+', 'DARK_EDITION', () => {
            c.set_edition({ thac_gilded: true }, true);
            c.ability.couponed = true;
            c.set_cost();
            c.temp_edition = undefined;
            return true;
          });
          tag.triggered = true;
        }
        return undefined; // (the Lua returns the undefined global `applied`: the next tag still sees the joker)
      }
    },
  },
  {
    ...tagd('chaos'),
    loc_vars: () => ({ vars: [3] }),
    apply(self, tag, context) {
      if (context.type === 'immediate') {
        tag.yep('+', 'PURPLE', () => {
          const [tagpool] = get_current_pool('Tag');
          const tagset = [];
          for (let i = 0; i < 3; i++) {
            let [t] = pseudorandom_element(tagpool, pseudoseed('chaos_tag'));
            let guard = 0;
            while ((t === 'UNAVAILABLE' || t === 'tag_thac_chaos') && guard++ < 1000) [t] = pseudorandom_element(tagpool, pseudoseed('chaos_tag'));
            tagset.push(t);
          }
          G.E_MANAGER.add_event(() => {
            for (const t of tagset) add_tag(new Tag(t, false, 'Small'));
            play_sound('generic1', 0.9 + math_random() * 0.1, 0.8);
            play_sound('holo1', 1.2 + math_random() * 0.1, 0.4);
            G.E_MANAGER.add_event(() => { for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' }); });
          });
          return true;
        });
        tag.triggered = true;
        return true;
      }
    },
  },
];

// ====================================================================== blinds
const blindd = (key) => { const s = object('Blinds', key); return { ...s, key: 'bl_thac_' + key, name: 'bl_thac_' + key }; };
export const blinds = [
  {
    ...blindd('jera'), boss_colour: '#FDA200', debuff: {}, dollars: 0, mult: 2,
    modify_hand(self, blind, cards, poker_hands, text, mult, hand_chips) {
      if (blind.disabled) return [mult, hand_chips, false];
      for (const card of cards) {
        if (chance(card, 'jera', 1, 4)) {
          blind.triggered = true;
          juice_card(card);
          G.E_MANAGER.add_event(() => {
            G.playing_card = (G.playing_card || 0) + 1;
            const _card = copy_card(card, null, null, G.playing_card);
            _card.add_to_deck();
            G.deck.config.card_limit += 1;
            G.playing_cards.push(_card);
            G.hand.emplace(_card);
            emit('materialize', { card: _card.sort_id });
          });
        }
      }
      return [mult, hand_chips, false];
    },
    loc_vars: () => { const [n, d] = prob_vars(null, 1, 4); return { vars: [n, d] }; },
  },
  {
    ...blindd('thac'), boss_colour: '#f7dc42', debuff: {}, dollars: 8, mult: 3, atlas: 'thac_ShowdownThrowdown', pos: { x: 0, y: 0 },
    // (the Lua's calculate on context.debuff_card: a playing card whose rank is in the graveyard)
    debuff_card(self, blind, card) {
      if (blind.disabled || !card.base || !card.base.value || card.ability.set === 'Joker') return false;
      return AMM.GRAVEYARD.count_rank(card.base.value) > 0;
    },
  },
];

// ======================================================================= stake
const SK = object('Stakes', 'culmination');
export const stakes = [{
  key: 'stake_thac_culmination', name: 'The Culmination', set: 'Stake', applied_stakes: ['gold'], above_stake: 'gold',
  colour: '#fff200', atlas: SK.atlas, pos: SK.pos, sticker_atlas: 'thac_StakeMyCardsPls', sticker_pos: SK.sticker_pos,
  // "enables every gameplay mechanic locked behind a stake": of its list only Inflation exists in Micatro (the
  // rest are Revo's Vault / Cryptid / Entropy / Aikoyori stickers)
  modifiers() {
    G.GAME.modifiers.inflation = true;
    for (const k of ['enable_crv_vamp', 'enable_crv_haunted', 'enable_crv_radioactive', 'enable_crv_absolute', 'enable_crv_continuity', 'enable_crv_overtime',
      'cry_enable_pinned_in_shop', 'enable_banana', 'entr_copper', 'akyrs_spawn_oxidising']) G.GAME.modifiers[k] = true;
  },
}];

// ============================================================ option select pack
const OS = object('Boosters', 'option_select');
/** thac_cardmapping: the 4 base cards + Pokermon's Poké Ball while Pokermon is on (Cryptid / Aikoyori: not in Micatro). */
const cardmap = () => ['c_emperor', 'c_high_priestess', 'c_thac_scry', 'c_judgement', ...(isActive('pokermon') && P_CENTERS.c_poke_pokeball ? ['c_poke_pokeball'] : [])];
const rot = (k) => (isActive('morefluff') && P_CENTERS[k] ? k : null);
/** thac_handlecard(key): a rare upgrade of each mapped card (every roll is made, in order, like the Lua). */
function handlecard(key) {
  const p = () => pseudorandom('thac_option_select');
  if (key === 'c_emperor') {
    if (p() < 0.03) return 'c_thac_quest_bed';
    p(); p(); // (GrabBag's Awaken, Revo's Vault's Superior Emperor)
    if (p() < 0.45 && rot('c_mf_rot_emperor')) return 'c_mf_rot_emperor';
  }
  if (key === 'c_high_priestess') {
    if (p() < 0.025) return 'c_black_hole';
    p(); p(); p(); p(); p(); p(); // (Entropy / Cryptid / AllInJest / Revo's Vault)
    if (p() < 0.45 && rot('c_mf_rot_high_priestess')) return 'c_mf_rot_high_priestess';
  }
  if (key === 'c_thac_scry') { p(); }
  if (key === 'c_judgement') {
    if (p() < 0.025) return 'c_soul';
    for (let i = 0; i < 11; i++) p(); // (Entropy / VISIBILITY / finity / Cryptid / Revo's Vault / vallkarri / pta_saka)
    if (p() < 0.45 && rot('c_mf_rot_judgement')) return 'c_mf_rot_judgement';
  }
  if (key === 'c_poke_pokeball') {
    if (p() < 0.025) return 'c_poke_masterball';
    if (p() < 0.075) return 'c_poke_ultraball';
    if (p() < 0.25) return 'c_poke_greatball';
  }
  return key;
}
export const boosters = [{
  key: 'p_thac_option_select', set: 'Booster', name: 'Option Select', kind: 'Option Select', group_key: 'k_thac_option_select',
  atlas: OS.atlas, pos: OS.pos, cost: OS.cost, weight: OS.weight, draw_hand: true, config: { extra: 4, choose: 1 },
  loc_vars: (self, iq, card) => ({ vars: [(card && card.ability && card.ability.extra) ?? self.config.extra, (card && card.ability && card.ability.choose) ?? self.config.choose] }),
  create_card(self, card, i) {
    const k = handlecard(cardmap()[i - 1]);
    return create_card(P_CENTERS[k].set, G.pack_cards, null, null, null, null, k);
  },
}];
/** load_check: the pack holds every mapped card and lets you choose a quarter of them (rounded up). */
function size_option_select() {
  const n = cardmap().length;
  const c = P_CENTERS.p_thac_option_select;
  c.config.extra = n;
  c.config.choose = Math.max(1, Math.ceil(n / 4));
}

// ==================================================================== vouchers
const vouch = (key, def = {}) => {
  const s = object('Vouchers', key);
  return { ...s, key: 'v_thac_' + key, set: 'Voucher', name: 'v_thac_' + key, cost: s.cost || 10, available: true, requires: s.requires, ...def };
};
const ex = (self, card) => (card && card.ability && card.ability.extra !== undefined ? card.ability.extra : self.config.extra);
export const vouchers = [
  vouch('spectral_merchant', { loc_vars: () => ({ vars: [] }), redeem(self) { G.E_MANAGER.add_event(() => { G.GAME.spectral_rate = 4 * self.config.extra; }); } }),
  vouch('spectral_tycoon', { loc_vars: (self) => ({ vars: [self.config.extra_disp] }), redeem(self) { G.E_MANAGER.add_event(() => { G.GAME.spectral_rate = 4 * self.config.extra; }); } }),
  vouch('stamp_savvy', { loc_vars: () => ({ vars: [] }), redeem() {} }),
  vouch('stamp_coupon', { loc_vars: () => ({ vars: [] }), redeem() {} }),
  vouch('oddity_merchant', { loc_vars: (self) => ({ vars: [self.config.extra_disp] }), redeem(self) { G.E_MANAGER.add_event(() => { G.GAME.oddity_rate = 3 * self.config.extra; }); } }),
  vouch('oddity_tycoon', { loc_vars: (self) => ({ vars: [self.config.extra_disp] }), redeem(self) { G.E_MANAGER.add_event(() => { G.GAME.oddity_rate = 3 * self.config.extra; }); } }),
  vouch('wheel_of_wheel_of_fortune', {
    loc_vars(self, iq, card) { iq.push(P_CENTERS.c_wheel_of_fortune); const [n, d] = prob_vars(card, 1, ex(self, card).odds); return { vars: [n, d] }; },
    redeem() { G.GAME.wheel_of_wheel_of_fortune = true; },
  }),
  vouch('ceaseless_wheel', {
    loc_vars(self, iq, card) { iq.push(P_CENTERS.v_thac_wheel_of_wheel_of_fortune); const [n, d] = prob_vars(card, 1, ex(self, card).odds); return { vars: [n, d] }; },
    redeem() { G.GAME.ceaseless_wheel = true; },
  }),
  vouch('plus_four', { loc_vars: (self, iq, card) => ({ vars: [ex(self, card).mult] }), calc: (self) => ({ mult: self.config.extra.mult }) }),
  vouch('x_four', { loc_vars: (self, iq, card) => ({ vars: [ex(self, card).Xmult] }), calc: (self) => ({ xmult: self.config.extra.Xmult }) }),
  vouch('limit_breaker', {
    loc_vars: (self, iq, card) => ({ vars: [ex(self, card).limit] }),
    redeem(self, card) { const l = ex(self, card).limit; change_play_limit(l); change_discard_limit(l); },
  }),
  vouch('transcendant', {
    loc_vars: (self, iq, card) => ({ vars: [ex(self, card).limit] }),
    redeem(self, card) { const l = ex(self, card).limit; change_play_limit(l); change_discard_limit(l); },
  }),
].filter((v) => !v.dependencies);

/** Wheel of Fortune made by Wheel of Wheel of Fortune / Ceaseless Wheel (Negative: no room needed). */
function make_wheel(negative) {
  if (negative || G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
    play_sound('timpani');
    const card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_wheel_of_fortune');
    if (negative) card.set_edition({ negative: true }, true);
    card.add_to_deck();
    G.consumeables.emplace(card);
  }
}
/**
 * Ceaseless Wheel on a used / sold Wheel of Fortune: 1 in 4 to make another (1 in 4 of those Negative).
 * FIX (intended design): the voucher's text says a NEGATIVE Wheel's chance "is forced to be 1 in 4" — the Lua
 * rolled it with the usual (Oops-boostable) probability, so Oops! All 6s chained Negative Wheels forever. A
 * Negative Wheel rolls a plain 1 in 4. (Its other quirk — the use patch sits in the Wheel / Ectoplasm / Hex
 * branch, so using Ectoplasm or Hex also rolled — is fixed too: only The Wheel of Fortune, as the text says.)
 */
function ceaseless(card) {
  const neg_src = !!(card.edition && card.edition.negative);
  const roll = (seed) => (neg_src ? pseudorandom(seed) < 1 / 4 : chance(card, seed, 1, 4));
  if (roll('ceaseless_wheel')) {
    const negative = roll('ceaseless_wheel');
    if (negative || G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      G.E_MANAGER.add_event(() => make_wheel(negative));
    }
  }
}

// ======================================================================= decks
const deck = (key, def = {}) => {
  const s = object('Decks', key);
  return { ...s, key: 'b_thac_' + key, set: 'Back', name: 'b_thac_' + key, config: s.config || {}, ...def };
};
export const decks = [
  deck('wheel_of_fortune_deck', { loc_vars: () => ({ vars: [] }) }),
  deck('collectors_deck', { apply() { G.GAME.modifiers.consumables_all_oddities = true; } }),
  deck('undying_deck', { apply() { G.GAME.modifiers.thac_undying_deck = true; } }),
  deck('duality'),
  deck('gambling'), // (doubles listed probabilities: hooks.probability_pass)
  deck('purple', { apply() { G.E_MANAGER.add_event(() => { change_play_limit(1); change_discard_limit(1); }); } }),
  deck('teal', { apply() { G.E_MANAGER.add_event(() => { change_play_limit(2); change_discard_limit(2); }); } }),
  deck('pink', { apply() { G.E_MANAGER.add_event(() => { change_play_limit(-1); change_discard_limit(-1); }); } }),
  deck('grey', { apply() {} }),
];

// ======================================================================= hooks
export const hooks = {
  init_game_object(GAME) {
    GAME.round_resets.hands_played = 0; // (lovely: a run-long count of hands played)
    size_option_select();
  },
  play_start() { G.GAME.round_resets.hands_played = (G.GAME.round_resets.hands_played || 0) + 1; },

  // ---- create_card wrap (overrides.lua): the Joker tarot rolls an edition; Stamp Savvy stamps jokers (3 in 10)
  create_card(card, _type, area, key_append) {
    if (_type === 'Tarot' && card.config.center.key === 'c_thac_joker') {
      card.set_edition(poll_edition('edi' + (key_append || '') + G.GAME.round_resets.ante));
    }
    if (_type === 'Joker' && used('v_thac_stamp_savvy') && !card.seal) {
      if (pseudorandom(pseudoseed('joker_seal_odds')) < 3 / 10) {
        const keys = AMM.active_stamps().map((s) => s.key);
        if (keys.length) card.set_seal(pseudorandom_element(keys, pseudoseed('joker_seal'))[0]);
      }
    }
  },
  // ---- the Collector's Deck (lovely create_card): every consumable (Tarot_Planet or a consumable type) is an Oddity
  create_card_type(_type, forced_key) {
    const ctype = _type === 'Tarot' || _type === 'Planet' || _type === 'Spectral' || (CONSUMABLE_TYPES[_type] && isActive(CONSUMABLE_TYPES[_type].mod));
    if (G.GAME.modifiers.consumables_all_oddities && (_type === 'Tarot_Planet' || ctype)) {
      return ['Oddity', null];
    }
    return undefined;
  },
  // ---- the +$2 stamp price (lovely Card:set_cost): `self.cost > 0` is the card's price before this set_cost
  set_cost(card) {
    const prev = card.thac_prev_cost || 0;
    card.thac_prev_cost = card.cost;
    if (card.ability.set === 'Joker' && prev > 0 && card.seal && !used('v_thac_stamp_coupon')) {
      card.extra_cost += 2;
      card.cost = Math.max(1, Math.floor((card.base_cost + card.extra_cost + 0.5) * (100 - G.GAME.discount_percent) / 100));
      if (card.ability.rental) card.cost = 1;
      card.sell_cost = Math.max(1, Math.floor(card.cost / 2)) + (card.ability.extra_value || 0);
      if (card.area && card.ability.couponed && (card.area === G.shop_jokers || card.area === G.shop_booster)) card.cost = 0;
      card.thac_prev_cost = card.cost;
    }
  },
  // ---- new_round wrap: Mr. Bones' Stamps (Blind -15% each), then Wheel of Wheel of Fortune
  new_round() {
    G.E_MANAGER.add_event(() => {
      let score_mult = 1;
      for (const card of G.jokers.cards) if (stamp_of(card) === 'thac_mr_bones') { score_mult *= 0.85; juice_card(card); }
      const b = G.GAME.blind;
      b.chips = BN.floor(BN.mul(b.chips, score_mult));
      b.chip_text = number_format(b.chips);
      emit('blind', { action: 'chips', key: b.config && b.config.blind && b.config.blind.key, chips: b.chips, chip_text: b.chip_text });
      if (G.GAME.wheel_of_wheel_of_fortune === true) {
        if (chance(null, 'wheel_of_wheel', 1, 4)) {
          let negative = false;
          if (G.GAME.ceaseless_wheel === true && chance(null, 'wheel_of_wheel', 1, 4)) negative = true;
          make_wheel(negative);
        }
      }
    });
  },
  // ---- Chaos' Stamp ($4 a round won), graveyard -> deck after a Boss (Soulbound / Undying Deck), Gilded jokers
  end_round() {
    const won = BN.beats(G.GAME.chips, G.GAME.blind.chips);
    if (won) {
      for (const card of G.jokers.cards) if (stamp_of(card) === 'thac_chaos') { ease_dollars(4); card_eval_status_text(card, 'dollars', 4); }
    }
    for (const card of [...G.jokers.cards, ...G.consumeables.cards]) {
      if (gilded(card) && !card.debuff) {
        card.ability.extra_value = (card.ability.extra_value || 0) + card.edition.extra.gold;
        card.set_cost();
        say(card, localize('k_val_up'), 'MONEY');
      }
    }
    if (won && G.GAME.blind.get_type() === 'Boss') {
      // FIX (intended design): the lovely patch reads G.GAME.thac_undying_deck, but the Undying Deck sets
      // G.GAME.modifiers.thac_undying_deck — so the deck never brought anything back. It reads the modifier.
      for (let i = G.graveyard.length - 1; i >= 0; i--) {
        const c = G.graveyard[i];
        if (G.GAME.modifiers.thac_undying_deck || c.config.center.key === 'm_thac_soulbound') AMM.move_from_graveyard(c, G.deck);
      }
    }
  },
  // ---- Sock and Buskin's Stamp: the joker's effects happen once more
  joker_retriggers(n, card, context) {
    if (stamp_of(card) === 'thac_sock_and_buskin') { card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_again_ex'), colour: 'ORANGE' }); return n + 1; }
    return n;
  },
  // ---- Dusk Stamp: on the final hand the joker's listed probabilities have a denominator of at most 1
  probability_vars([num, den], trigger_obj) {
    if (!G.jokers || !trigger_obj || !trigger_obj.config || !trigger_obj.config.center || trigger_obj.config.center.set !== 'Joker' || trigger_obj.bypass_lock) return undefined;
    if (stamp_of(trigger_obj) !== 'thac_dusk') return undefined;
    const S = G.STATES, hl = G.GAME.current_round.hands_left;
    if ((hl === 0 && [S.HAND_PLAYED, S.DRAW_TO_HAND, S.GAME_OVER, S.ROUND_EVAL, S.NEW_ROUND].includes(G.STATE)) || (hl === 1 && G.STATE === S.SELECTING_HAND)) return [num, Math.min(1, den)];
    return undefined;
  },
  // ---- Gambling Deck: doubles every listed probability (its calculate on mod_probability)
  probability_pass([num, den], key) {
    if (key === 'mod_probability' && G.GAME.selected_back_key === 'b_thac_gambling') return [num * 2, den];
    return undefined;
  },
  // ---- Breath Aspect: selected Breath cards don't count against the hand / play / discard / consumable limits
  highlight_limit(limit, area, card) {
    if (area !== G.hand) return undefined;
    return limit + breaths(area.highlighted) + (card && card.aspect === 'thac_breath' ? 1 : 0);
  },
  selection_limit: (n) => n + breaths(G.hand.highlighted),
  consumable_highlight_count: (n) => n - breaths(G.hand.highlighted),
  // ---- +4 / X4: the redeemed vouchers score in joker_main (after the jokers and consumables, like SMODS's G.vouchers)
  modify_scoring([chips, mult], step) {
    if (step !== 'final_scoring_step') return undefined;
    for (const v of vouchers) if (v.calc && used(v.key)) [chips, mult] = smods_effect({ ...v.calc(v), card: null }, G.deck.cards[0] || null, chips, mult);
    return [chips, mult];
  },
  // ---- Gilded on scored playing cards
  eval_card(card, context, ret) {
    if (context.cardarea === G.play && !context.repetition && !card.debuff && gilded(card)) {
      const e = gilded_scored(card);
      if (e) (ret.post_effects = ret.post_effects || []).push(e);
    }
  },
  // ---- a playing card's tooltip (the board's describePlaying only knows the base enhancements / editions)
  view_card(card, v) {
    if (!(card.ability.set === 'Default' || card.ability.set === 'Enhanced') || !card.base || !card.base.suit) return;
    const lines = [];
    if (card.config.center.mod === 'autumncircus') { const d = describe(card); lines.push('{C:attention}' + d.name, ...d.lines); }
    if (gilded(card)) {
      const d = MOD_LOC.descriptions.Edition.e_thac_gilded;
      const vars = editions[0].loc_vars(editions[0], [], card).vars;
      lines.push('{C:dark_edition}' + d.name, ...d.text.map((l) => l.replace(/#(\d+)#/g, (m, i) => String(vars[i - 1] ?? ''))));
    }
    if (lines.length) v.mod_lines = (v.mod_lines || []).concat(lines);
  },
  // ---- Ceaseless Wheel: a used or sold Wheel of Fortune
  used_consumeable(card) { if (G.GAME.ceaseless_wheel && card.ability.name === 'The Wheel of Fortune') ceaseless(card); },
  sell_card(card) { if (G.GAME.ceaseless_wheel && card.config.center.key === 'c_wheel_of_fortune') ceaseless(card); },
};

export const centers = [...enhancements, ...editions, ...boosters, ...vouchers, ...decks];
export const seals = stamps;
