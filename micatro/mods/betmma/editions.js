// BETMMA editions (Betmma_Vouchers/phantom.lua + shaders/*.fs + lovely/shader.toml):
//   Phantom  — +1 Joker slot, 50% chance to trigger (Undying's copies; sold with Reincarnate -> new joker)
//   Tentacle — when Blind is selected, eats the joker to its right and adds its values (Cryptozoology)
// Keys are prefixed (e_betmma_phantom: card.edition.betmma_phantom); the Lua registered them unprefixed.
// The shaders are WebGL ports of phantom.fs / tentacle.fs for the renderer's mod-edition pass
// (`shader_fs`: a main() over gl.js's shared prelude — tex0, time, fx = (fx.x, real time), HSL/RGB,
// dissolve_mask). Like the Lua (shader.toml), the edition pass replaces the card's base layer.
import { G, P_JOKER_RARITY_POOLS, create_card, copy_card, localize, pseudorandom } from '../../js/engine/core.js';
import { used, say, dict, right_of } from './common.js';
import { POSSIBLE_KEYS } from './jokers.js';

const FIELD = `
  vec2 floored_uv = (floor((uv*texture_details.ba)))/texture_details.ba;
  vec2 uv_scaled_centered = (floored_uv - 0.5) * 50.;
  vec2 field_part1 = uv_scaled_centered + 50.*vec2(sin(-t / 143.6340), cos(-t / 99.4324));
  vec2 field_part2 = uv_scaled_centered + 50.*vec2(cos( t / 53.1532),  cos( t / 61.4532));
  vec2 field_part3 = uv_scaled_centered + 50.*vec2(sin(-t / 87.53218), sin(-t / 49.0000));
  float field = (1.+ (cos(length(field_part1) / 19.483) + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73) +
      cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92) ))/2.;`;
const HSL_PRE = `
  vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv;
  float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b)); float delta = high - low;
  float saturation_fac = 1. - max(0., 0.05*(1.1-delta));
  vec4 hsl = HSL(vec4(tex.r*saturation_fac, tex.g*saturation_fac, tex.b, tex.a));`;
export const PHANTOM_FS = `void main(){${HSL_PRE}
  vec2 phantom = fx;
  float t = phantom.y*2.221 + time;${FIELD}
  float alpha_adjustment = (.5 + .3* cos( ((phantom.x) * 2.612 + ( field + -.5 )) *3.14));
  tex.a = clamp(tex.a*alpha_adjustment, 0.0, 1.0);
  tex.rgb = RGB(hsl).rgb;
  gl_FragColor = dissolve_mask(tex, vUv, uv); }`;
export const TENTACLE_FS = `void main(){${HSL_PRE}
  vec2 tentacle = fx; float real_time = fx.y;
  float t = tentacle.y*2.221 + real_time*99. + time*199.;${FIELD}
  vec2 p = vec2(uv.x - 0.5, (uv.y - 0.5)*1.3);
  float r2 = p.y*p.y + p.x*p.x;
  float r = sqrt(r2);
  float angle = atan(p.y, p.x)*3. + sin(real_time) + field*2.5*r;
  float ray = cos(angle);
  float ray4 = ray * ray;
  if (1. - ray4 > 0.001/(r2*r2) - clamp(0.25*(r-0.62), 0., 0.3)) ray4 = ray4/8.;
  float res = (1. - (.4 - clamp(0.03/r2, 0.0, 0.4)) * ray4 * 2.);
  hsl.z = clamp(hsl.z * res, 0.0, 1.0);
  tex.rgb = RGB(hsl).rgb;
  gl_FragColor = dissolve_mask(tex, vUv, uv); }`;

/** Phantom's +1 slot goes where the card lives (SMODS edition card_limit; kept while debuffed, like Negative). */
const slot_area = (card) => (card.ability.consumeable ? G.consumeables : G.jokers);
export function phantom_added(card, from_debuff) {
  if (!(card.edition && card.edition.betmma_phantom) || card.ability.set === 'Default' || card.ability.set === 'Enhanced') return;
  if (from_debuff) card.ability.queue_negative_removal = undefined;
  else slot_area(card).config.card_limit += card.edition.card_limit || 1;
}
export function phantom_removed(card, from_debuff) {
  if (!(card.edition && card.edition.betmma_phantom) || card.ability.set === 'Default' || card.ability.set === 'Enhanced' || !G.jokers) return;
  if (from_debuff) card.ability.queue_negative_removal = true;
  else slot_area(card).config.card_limit -= card.edition.card_limit || 1;
}

export const EDITIONS = [
  {
    key: 'e_betmma_phantom', set: 'Edition', name: 'Phantom', order: 1, config: { card_limit: 1 }, extra_cost: -10, pos: { x: 0, y: 0 },
    shader: 'betmma_phantom', shader_fs: PHANTOM_FS, in_shop: false, weight: 0,
    loc_vars: () => ({ vars: [] }),
    // SMODS set_edition: an edition's card_limit moves with the edition on a card that's in play
    on_apply(card) { if (card.added_to_deck && card.ability.set !== 'Default' && card.ability.set !== 'Enhanced') slot_area(card).config.card_limit += card.edition.card_limit || 1; },
    on_remove(card) { if (card.added_to_deck && card.ability.set !== 'Default' && card.ability.set !== 'Enhanced') slot_area(card).config.card_limit -= 1; },
  },
  {
    key: 'e_betmma_tentacle', set: 'Edition', name: 'Tentacle', order: 2, config: {}, pos: { x: 0, y: 0 },
    shader: 'betmma_tentacle', shader_fs: TENTACLE_FS, in_shop: false, weight: 0,
    loc_vars: () => ({ vars: [] }),
  },
];

/** Phantom (Card:calculate_joker wrap): each calculation has a 50% chance not to happen. */
export const phantom_skips = (card) => !!(card.edition && card.edition.betmma_phantom) && pseudorandom('phantom' + (card.ability.name || '')) < 0.5;

/** Tentacle (Cryptozoology's Card:calculate_joker wrap): on setting_blind, eat the joker to the right. */
export function tentacle(card, context) {
  if (!(card.ability.set === 'Joker' && !card.debuff && card.edition && card.edition.betmma_tentacle && !context.blueprint && context.setting_blind && !card.getting_sliced)) return;
  const sliced = right_of(card);
  if (!sliced || card.getting_sliced || sliced.ability.eternal || sliced.getting_sliced) return;
  sliced.getting_sliced = true;
  G.GAME.joker_buffer = G.GAME.joker_buffer - 1;
  G.E_MANAGER.add_event(() => {
    G.GAME.joker_buffer = 0;
    const s = sliced.ability, a = card.ability;
    const def = (k) => (k === 'x_mult' ? 1 : 0);
    const set = (v) => v !== undefined && v !== null;
    let values = [];
    for (const k of POSSIBLE_KEYS) if (set(s[k]) && typeof s[k] === 'number' && s[k] !== def(k)) values.push(s[k]);
    if (set(s.extra)) {
      if (typeof s.extra === 'object') { for (const k of Object.keys(s.extra)) if (typeof s.extra[k] === 'number') values.push(s.extra[k]); }
      else if (typeof s.extra === 'number' && s.extra !== 0) values.push(s.extra);
    }
    if (!values.length) values = [0];
    let i = 0;
    for (const k of POSSIBLE_KEYS) {
      if (set(a[k]) && typeof a[k] === 'number' && a[k] !== def(k)) { a[k] = a[k] + values[i]; i = (i + 1) % values.length; }
    }
    if (set(a.extra)) {
      if (typeof a.extra === 'object') { for (const k of Object.keys(a.extra)) if (typeof a.extra[k] === 'number') { a.extra[k] = a.extra[k] + values[i]; i = (i + 1) % values.length; } }
      else if (typeof a.extra === 'number') a.extra = a.extra + values[i];
    }
    card.juice_up(0.8, 0.8);
    sliced.start_dissolve();
  });
  say(card, localize('k_upgrade_ex'), 'RED');
}

/** Undying (Card:start_dissolve wrap): a destroyed (not sold) non-Phantom joker comes back as a Phantom copy. */
export function undying(card) {
  if (card.selling || (card.edition && card.edition.betmma_phantom) || card.ability.set !== 'Joker' || !card.added_to_deck || !used('undying')) return;
  const copy = copy_card(card, null, null, null, true);
  say(copy, dict('k_undying'));
  copy.getting_sliced = false;
  copy.set_edition({ betmma_phantom: true });
  copy.add_to_deck();
  G.jokers.emplace(copy);
}

/** Joker of a given rarity (create_card(..., rarity, 0, ..., 'BetmmaAssigningRarity') + the lovely patch). */
export function create_joker_of_rarity(rarity, append) {
  if (rarity === 4) return create_card('Joker', G.jokers, true, null, null, null, null, append);
  if (typeof rarity === 'string') return create_card('Joker', G.jokers, null, rarity, null, null, null, append);
  const roll = rarity === 3 ? 0.96 : rarity === 2 ? 0.8 : 0;
  return create_card('Joker', G.jokers, null, roll, null, null, null, append);
}
/** Reincarnate (Card:sell_card wrap): selling a Phantom joker makes a joker of the same rarity. */
export function reincarnate(card) {
  // FIX 1 (intended design): phantom.lua's sell wrap never checks for the voucher, so every Phantom joker
  // reincarnated when sold, with or without Reincarnate. Only Reincarnate does that.
  if (card.edition && card.edition.betmma_phantom && used('reincarnate')) {
    const rarity = card.config.center.rarity;
    // (never a negative joker_buffer — see FIX 6)
    const jokers_to_create = Math.max(0, Math.min(1, G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer)));
    G.GAME.joker_buffer = G.GAME.joker_buffer + jokers_to_create;
    G.E_MANAGER.add_event(() => {
      if (jokers_to_create === 0) say(card, localize('k_no_room_ex'));
      if (!P_JOKER_RARITY_POOLS[rarity]) return;
      for (let i = 1; i <= jokers_to_create; i++) {
        const c = create_joker_of_rarity(rarity, 'BetmmaAssigningRarity');
        c.add_to_deck();
        G.jokers.emplace(c);
        G.GAME.joker_buffer = 0;
        say(c, dict('k_reincarnate'), 'BLUE');
      }
    });
  }
  card.selling = true;
}
