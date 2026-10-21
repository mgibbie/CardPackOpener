// Pokermon — the mod's own visuals, as a Micatro mod UI module (micatro/js/ui/modui.js; registered as
// `ui` on the mod). Everything draws from the card's view data (`d.poke`, systems/anim.js view_card), so a
// spectator or a replay sees exactly what the player sees.
//   * Type pill + Energy pips on Pokémon (and Tera) jokers: the type in its colour (pokesprites.lua
//     loc_colour), filled pips for the Energy it holds (Colorless Energy in grey), empty ones up to its limit.
//   * The Pokédex (pokeui.lua create_UIBox_pokedex_jokers): the card's evolution family as cards — opened by
//     right-click / double-click on a Pokémon (the mod's R-cursor / double-click), its "Dex" button, the P key
//     with a joker selected, or Run Info's Pokédex tab (controller).
//   * Shaders (assets/shaders, ported to WebGL): shiny.fs (the Shiny edition's falling stars, drawn over the
//     card), evolution.fs (the glow that swallows the card while it evolves: the poke_evolve event), zorua.fs
//     (Zorua / Zoroark's faint shadow while disguised — pokedraw.lua's zorua_shadow draw step).
//   * Zorua / Zoroark's disguise: in the joker row, while active, drawn as the rightmost Blueprint-compatible
//     joker (its update()); elsewhere as their hidden Pokémon (view_card's illusion).
//   * Animated sprites (pokeanimations.lua AnimatedPokemon): the Unown swarm's 36-frame sheet (+ its soul
//     layer, shiny sheets too) and Bird Energy's; Voltorb / Electrode animate only on their Series A art,
//     which Micatro doesn't ship (the Basic sprite is static), so they stay still as in the mod's default.
//     The swarm draws 3.9.1's one-row strips, tiled (index.js SWARM_STRIPS), cropped to the card.
//   * Unown's form (3.9.1 set_sprites): the letter floats over the plain Unown card as its soul layer.
//   * Kecleon's type (3.9.1 set_sprites): the card of the type it took from the joker to its right (Gen 3 sheet).
import { P_CENTERS } from './api.js';
import { MOD_LOC } from '../../js/mods/registry.js';
import { describeCenter } from '../../js/engine/describe.js';
import { get_family_keys } from './systems/evolution.js';
import { family_display_key } from './systems/precedence.js';
import { TYPE_COLOURS } from './systems/types.js';
import { KECLEON_ATLAS, KECLEON_SPRITES, DEOXYS_SOULS, IMPOSTER_REVEALED } from './systems/anim.js';

const MOD = 'pokermon';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const typeColour = (t) => TYPE_COLOURS[String(t || '').toLowerCase()] || '#4f6367';
const typeLabel = (t) => (MOD_LOC.misc.dictionary && MOD_LOC.misc.dictionary['poke_' + String(t).toLowerCase() + '_badge']) || t;
const DARK_TEXT = new Set(['lightning', 'colorless', 'dragon', 'safari', 'pocket']);
/** A Pokémon joker (Pokermon's own, or an add-on's built on its machinery: centers with a `stage`). */
export const isPokemon = (d) => !!(d && d.center && P_CENTERS[d.center] && P_CENTERS[d.center].stage && (d.set === 'Joker' || P_CENTERS[d.center].set === 'Joker'));
const STAGE = { Baby: 'Baby', Basic: 'Basic', One: 'Stage 1', Two: 'Stage 2', Legendary: 'Legendary', Mega: 'Mega', Other: '' };

// ------------------------------------------------------------- shaders
const SHINY_FS = `#define M_PI 3.1415926535897932384626433832795
float stackoverflow_hash(float value, float index){ return fract(sin(dot(vec2(index/value, value/index), vec2(12.9898,78.233))) * 43758.5453); }
float logisticCurve(float x){ return 1.0 / (1.0 + exp(6.0-8.0*x)) - 0.005; }
float hideFormula(float x){ return 1.0 - pow(max(0.0, sin(M_PI/2.0 * x)), 20.0); }
void main(){
  vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv; vec2 shiny = fx;
  vec2 adjusted_uv = uv - vec2(0.5, 0.5);
  vec4 hsl = HSL(tex);
  hsl.r = 0.14; hsl.g = 1.; hsl.b = 0.7; hsl.a = 0.0;
  float time_val = shiny.g + time + 7777.0;
  vec2 newCenter = vec2(0.0, 0.0);
  for (int ii = 4; ii < 8; ii++) {
    float i = float(ii); float i_val = sqrt(i);
    float iter = fract(time_val / i_val); float hash = floor(time_val / i_val);
    float angle = 2.0 * M_PI * stackoverflow_hash(hash, 1.0); float dist = 0.1 + 0.3 * stackoverflow_hash(hash, 2.0);
    newCenter = vec2(dist * cos(angle), dist * sin(angle));
    adjusted_uv += newCenter;
    float size = sin(iter * M_PI) * (sqrt(i) / 3.0) * (0.05 + 0.2 * stackoverflow_hash(hash, 3.0));
    float star_angle = atan(adjusted_uv.x, adjusted_uv.y) + sin(shiny.r + time + M_PI * stackoverflow_hash(hash, 4.0));
    float star = size * 0.2 / cos(asin(cos(5.0*star_angle))/10.0 + 0.942477796077);
    float star_color = 1.2 - 15. * abs(length(adjusted_uv) - star) - 0.0075 / max(length(adjusted_uv), 1e-4);
    float opacity = hideFormula(iter) * logisticCurve(star_color);
    float prev_opacity = hsl.a;
    hsl.a = opacity + prev_opacity * (1.0 - opacity);
    if (hsl.a > 0.0001) hsl.b = (0.3 * stackoverflow_hash(hash, 9.0) + 0.6) * (opacity / hsl.a) + (hsl.b * prev_opacity / hsl.a);
    adjusted_uv -= newCenter;
  }
  for (int ii = 1; ii < 8; ii++) {
    float i = float(ii); float i_val = sqrt(i);
    float iter = fract(time_val / i_val); float hash = floor(time_val / i_val);
    float angle = 2.0 * M_PI * stackoverflow_hash(hash, 5.0); float dist = 0.1 + 0.3 * stackoverflow_hash(hash, 6.0);
    newCenter = vec2(dist * cos(angle), dist * sin(angle));
    adjusted_uv += newCenter;
    float size = sin(iter * M_PI) * (sqrt(i) / 3.0) * (0.05 + 0.2 * stackoverflow_hash(hash, 7.0));
    float star_angle = atan(adjusted_uv.x, adjusted_uv.y) + sin(shiny.r*10.0 + time + M_PI * stackoverflow_hash(hash, 8.0));
    float star = size * 0.05 / cos(asin(cos(4.0*star_angle))/3.0 + 0.942477796077);
    float star_color = star / max(length(adjusted_uv), 1e-4);
    float opacity = min(1., max(0., hideFormula(iter) * logisticCurve(star_color)));
    float prev_opacity = hsl.a;
    hsl.a = opacity + prev_opacity * (1.0 - opacity);
    if (hsl.a > 0.0001) hsl.b = (opacity / hsl.a) + (hsl.b * prev_opacity * (1.0 - opacity) / hsl.a);
    adjusted_uv -= newCenter;
  }
  vec4 col = RGB(hsl);
  col.a = min(hsl.a, tex.a);
  gl_FragColor = dissolve_mask(col, vUv, uv);
}`;

const EVOLUTION_FS = `uniform vec3 evolution;
void main(){
  vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv;
  vec2 adjusted_uv = uv - vec2(0.5, 0.5);
  adjusted_uv.x = adjusted_uv.x*texture_details.b/texture_details.a;
  float L = max(length(adjusted_uv), 1e-4);
  vec2 rotater = vec2(0., 1.);
  float angle = acos(clamp(dot(rotater, adjusted_uv)/L, -1., 1.));
  float add_mod = abs(0.39269908169 - mod(angle, 0.78539816339));
  float bg_color = evolution.g * 0.1 + 2.*L - (add_mod / 5.) - 0.5*(1.5 - evolution.b);
  bg_color = abs(bg_color - floor(bg_color + 0.5)) + 0.515;
  bg_color = floor(bg_color * 15.) / 15.;
  float mid_hid = 13. * (evolution.b + 0.5) * L - 2./(0.5+evolution.b);
  if (evolution.b > 1.5) mid_hid = min(1., mid_hid) - (evolution.b - 1.75) * 2. - 10. * (evolution.b - 1.5) * L;
  else mid_hid = mid_hid - 0.1/L;
  vec4 hsl_evo = vec4(evolution.g / 3., 0.4, sqrt(min(1., max(0., bg_color))), 1.);
  if (evolution.b > 0.75) {
    float new_b = sin(2.*(evolution.b - 0.75) * 3.14159265359 / 3.)/5.0;
    new_b = new_b * (1.0+sin(angle*3.14159265359 * 5.0 + evolution.g)/30.0+cos(angle*3.14159265359 * 2.0 + evolution.g)/30.0);
    new_b = new_b / L;
    new_b = new_b * new_b * new_b * new_b - 0.2;
    new_b = new_b * min(1., max(0., evolution.b * 2. - 1.5));
    hsl_evo.g = min(1., hsl_evo.g + new_b);
    hsl_evo.b = min(1., hsl_evo.b + new_b);
    mid_hid = min(1., max(0., max(mid_hid, new_b)));
    if (evolution.b > 1.75) mid_hid = mid_hid * min(1., max(0., 4.5 - evolution.b*2.));
  }
  vec4 col = RGB(hsl_evo);
  col.a = clamp(min(tex.a, mid_hid), 0., 1.);
  gl_FragColor = dissolve_mask(col, vUv, uv);
}`;

const ZORUA_FS = `uniform vec2 zorua;
void main(){
  vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv;
  vec2 adjusted_uv = uv - vec2(0.5, 0.5);
  float t = zorua.y*22.221 + time;
  vec2 floored_uv = (floor((uv*texture_details.ba)))/texture_details.ba;
  vec2 uv_scaled_centered = (floored_uv - 0.5);
  vec2 field_part1 = 200.*(uv_scaled_centered + vec2(sin(-t / 143.6340), cos(-t / 99.4324)));
  vec2 field_part2 = 200.*(uv_scaled_centered + vec2(cos( t / 53.1532),  cos( t / 61.4532)));
  vec2 field_part3 = 200.*(uv_scaled_centered + vec2(sin(-t / 87.53218), sin(-t / 49.0000)));
  float field = (1.+ (cos(length(field_part1) / 19.483) + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73) +
      cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92) ))/2.;
  float res = (.5 + .5* cos( (zorua.x) * 2.612 + ( field + -.5 ) *3.14));
  gl_FragColor = dissolve_mask(vec4(0., 0., 0., min(tex.a, res * min(0.3, 0.075/max(length(adjusted_uv), 1e-4)))), vUv, uv);
}`;

// ------------------------------------------------------------- helpers
const ZORUAS = new Set(['j_poke_zorua', 'j_poke_zoroark']);
const isShiny = (d) => d.edition === 'poke_shiny';
/** Blueprint-compatible, 71x95 art (the Lua's `other_joker.children.center.atlas.px == 71`). */
function copyable(o) {
  if (!o || o.debuff || o.facing === 'back') return false;
  const c = P_CENTERS[o.center];
  if (!c || !c.blueprint_compat) return false;
  if (o.mod && o.atlas) { const big = /unown_swarm/.test(o.atlas); return !big; }
  return true;
}
/**
 * Unown's form (3.9.1 pokejokers_07.lua set_sprites, batch 10b): the card is the plain frame ({0,0} of its Gen 2 sheet)
 * and its floating sprite is the form's letter — A..I {1..9,0}, J..S {0..9,1}, T..Z, !, ? {0..8,2}.
 */
const UNOWN_FORMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'ZEx', 'ZQu'];
export function unownSoul(form) {
  const i = UNOWN_FORMS.indexOf(form);
  if (i < 0) return null;
  return { x: (i + 1) % 10, y: Math.floor((i + 1) / 10) };
}
/** A card view with Unown's form as its soul layer (others unchanged). */
const withUnownForm = (o) => {
  const s = o && o.center === 'j_poke_unown' && o.poke && unownSoul(o.poke.form);
  return s ? { ...o, soul_pos: s } : o;
};
function zoruaActive(d) { return !d.debuff && !(d.center === 'j_poke_zorua' && d.poke && d.poke.active === false); }
/** What a disguised Zorua / Zoroark copies in the joker row: the rightmost joker (not itself), or null. */
function zoruaTarget(d, ctx) {
  if (!ZORUAS.has(d.center) || !ctx || ctx.area !== 'jokers' || !zoruaActive(d)) return null;
  const last = ctx.jokers[ctx.jokers.length - 1];
  return last && last.id !== d.id && copyable(last) ? last : null;
}
/** Zorua's own sprite as a GL source (cached per atlas cell; null until its atlas has loaded). */
const spriteCache = new Map();
let drawCell = null;
function spriteCanvas(atlas, pos) {
  const k = atlas + ':' + pos.x + ',' + pos.y;
  if (spriteCache.has(k)) return spriteCache.get(k);
  if (!drawCell || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 142; c.height = 190;
  if (!drawCell(c.getContext('2d'), atlas, pos, 0, 0, 142, 190)) return null;
  c._ver = 1;
  spriteCache.set(k, c);
  return c;
}

// ------------------------------------------------------------- the Pokédex
/** The family keys of a card view (get_family_keys with what the view carries). */
export function familyOf(d) {
  const c = P_CENTERS[d.center];
  if (!c || !c.name) return [];
  const fake = { config: { center: c }, ability: { extra: {} } };
  let keys = [];
  try { keys = get_family_keys(c.name, c.poke_custom_prefix, fake); } catch (e) { keys = [d.center]; }
  const out = [], seen = new Set();
  for (const k of keys) {
    let key = typeof k === 'object' && k ? k.key : k;
    // Add-on dedupe (precedence.js): a replaced add-on duplicate shows as Pokermon's card, and a Mega only an add-on has
    // (Nacho's Mega Gardevoir in Pokermon's Ralts line) as the add-on's. The card you opened it on is always itself.
    if (key !== d.center) key = family_display_key(key);
    if (!key || seen.has(key) || !P_CENTERS[key]) continue;
    seen.add(key);
    out.push(key);
  }
  return out.length ? out : [d.center];
}
function cardOf(key, live) {
  const c = P_CENTERS[key];
  if (live && live.center === key) return { ...live, hl: false };
  return { center: key, mod: c.mod, set: c.set, name: c.name, atlas: c.atlas, pos: c.pos, soul_pos: c.soul_pos };
}
/** The Pokédex modal: the family as cards; pick one to read it. api = {modal, cardCanvas, markup, esc, fmt}. */
export function openPokedex(d, api) {
  const keys = familyOf(d);
  const el = document.createElement('div');
  el.className = 'pokedex';
  const row = document.createElement('div');
  row.className = 'dex-row';
  const info = document.createElement('div');
  info.className = 'dex-info';
  el.append(row, info);
  const show = (key, btn) => {
    for (const b of row.children) b.classList.toggle('on', b === btn);
    let desc = null;
    try { desc = describeCenter(key); } catch (e) { desc = null; }
    const c = P_CENTERS[key] || {};
    const lines = desc && desc.lines ? desc.lines : []; // ({br} filler lines are gaps already: engine/describe.js fill)
    const t = c.ptype ? `<span class="badge poke-type-badge" style="background:${typeColour(c.ptype)};color:${DARK_TEXT.has(String(c.ptype).toLowerCase()) ? '#374244' : '#fff'}">${esc(typeLabel(c.ptype))}</span>` : '';
    const st = STAGE[c.stage] ? `<span class="badge dex-stage">${esc(STAGE[c.stage])}</span>` : '';
    info.innerHTML = `<div class="dex-name">${esc((desc && desc.name) || c.name || key)}</div><div class="dex-badges">${t}${st}</div>` +
      `<div class="tip-body dex-body">${lines.map((l) => (l === '' ? '<div class="tip-gap"></div>' : `<div>${api.markup(l, desc && desc.colours)}</div>`)).join('')}</div>`;
  };
  let firstBtn = null, cur = null;
  keys.forEach((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn dex-card' + (key === d.center ? ' is-you' : '');
    b.dataset.key = key;
    b.appendChild(api.cardCanvas(cardOf(key, d), 'dex-canvas'));
    const c = P_CENTERS[key] || {};
    const nm = document.createElement('div');
    nm.className = 'dex-cname';
    nm.textContent = (MOD_LOC.descriptions.Joker && MOD_LOC.descriptions.Joker[key] && MOD_LOC.descriptions.Joker[key].name) || c.name || key;
    if (c.ptype) nm.style.color = typeColour(c.ptype);
    b.appendChild(nm);
    b.addEventListener('click', () => show(key, b));
    row.appendChild(b);
    if (!firstBtn) firstBtn = b;
    if (key === d.center) cur = b;
  });
  if (keys.length > 4) row.classList.add('many');
  show((cur || firstBtn).dataset.key, cur || firstBtn);
  api.modal(el, { title: 'Pokédex', cls: 'dex-modal' });
  return el;
}

// ------------------------------------------------------------- the mod UI object
export const POKE_UI = {
  install() {
    // the Shiny edition's own pass (lovely.toml: draw_shader('poke_shiny') over the card)
    const sh = P_CENTERS.e_poke_shiny;
    if (sh && !sh.shader_fs) { sh.shader_fs = SHINY_FS; sh.shader_overlay = true; }
  },
  bind(fns) { if (fns && fns.drawModCell) drawCell = fns.drawModCell; },
  face(d, ctx) {
    if (!d || d.facing === 'back') return null;
    const p = d.poke;
    // Zorua outside the joker row: its hidden Pokémon
    if (p && p.illusion && P_CENTERS[p.illusion]) {
      const c = P_CENTERS[p.illusion];
      return { ...d, atlas: c.atlas, pos: c.pos, soul_pos: undefined, win_key: d.center };
    }
    const tgt = zoruaTarget(d, ctx);
    if (tgt) {
      if (tgt.mod) return { ...d, atlas: tgt.atlas, pos: tgt.pos, soul_pos: withUnownForm(tgt).soul_pos, win_key: d.center };
      return { ...d, mod: undefined, atlas: undefined, pos: undefined, soul_pos: undefined, center: tgt.center, poke_disguise: true, win_key: d.center };
    }
    // Kecleon (3.9.1 set_sprites): its card of the type it took (the Gen 3 sheet); Colorless = its own card
    const kp = d.center === 'j_poke_kecleon' && p && KECLEON_SPRITES[p.ptype];
    if (kp) return { ...d, atlas: KECLEON_ATLAS, pos: kp };
    // The Imposter Professor (3.9.1 set_sprites, batch 17): once owned (form 1), the unmasked card, Others {8,1}
    if (d.center === 'j_poke_imposter_professor' && p && p.form === 1) return { ...d, pos: IMPOSTER_REVEALED };
    // Deoxys (3.9.1 set_sprites): the forme the Meteorite gave it floats over its card
    const ds = d.center === 'j_poke_deoxys' && p && DEOXYS_SOULS[p.form];
    if (ds) return { ...d, soul_pos: ds };
    // Unown: its form's letter floats over the card
    const u = withUnownForm(d);
    return u === d ? null : u;
  },
  anim(d) {
    const a = d && d.poke && d.poke.anim;
    if (!a) return null;
    // a soul-only animation on full atlas names (an add-on's: Nacho 1.7.9's Terapagos-Stellar, its 13-frame soul strip)
    if (a.soul_only) return { fps: a.fps, frames: a.frames, fpr: a.frames_per_row, soulOnly: true, soulAtlas: (isShiny(d) && a.shiny_atlas) || a.atlas };
    if (a.atlas) {
      const base = 'poke_' + a.atlas + (isShiny(d) ? '_shiny' : '');
      return { fps: a.fps, frames: a.frames, fpr: a.frames_per_row, atlas: base, soulAtlas: a.soul ? base + '_soul' : null };
    }
    const c = P_CENTERS[d.center];
    return c && c.animated ? { fps: a.fps, frames: a.frames, fpr: a.frames_per_row } : null;
  },
  decorate(d) {
    const p = d && d.poke;
    if (!p || !p.ptype || d.facing === 'back' || (d.set && d.set !== 'Joker')) return null;
    // (Zorua's illusion shows its hidden Pokémon's type, not Dark)
    const ill = p.illusion && P_CENTERS[p.illusion];
    const t = String((ill && ill.ptype) || p.ptype), lo = t.toLowerCase(), col = typeColour(t);
    const e = p.energy || 0, ce = p.c_energy || 0, max = Math.max(p.energy_max || 0, e + ce);
    let pips = '';
    if (e + ce > 0) {
      const shown = Math.min(max, 8);
      for (let i = 0; i < shown; i++) pips += `<i class="pip${i < e ? ' on' : i < e + ce ? ' on c' : ''}"${i < e ? ` style="background:${col}"` : ''}></i>`;
      if (max > 8) pips += `<b class="pip-more">${e + ce}/${max}</b>`;
    }
    const html = `<span class="poke-type${p.tera ? ' tera' : ''}${DARK_TEXT.has(lo) ? ' dark' : ''}" style="background:${col}" title="${esc(typeLabel(t))}${p.tera ? ' Tera' : ''}">${esc(typeLabel(t))}</span>` +
      (pips ? `<span class="poke-pips" title="Energy ${e + ce}/${max}">${pips}</span>` : '');
    return { key: [t, p.tera ? 1 : 0, e, ce, max].join(':'), html };
  },
  fx(d, sprite, now) {
    const out = [];
    const fx0 = now / 28;
    const ev = sprite.pokeEvo;
    if (ev) {
      const k = (now - ev.start) / ev.dur * 3;
      if (k >= 3) sprite.pokeEvo = null;
      else out.push({ key: 'poke_evolution', fs: EVOLUTION_FS, u: { evolution: [fx0, now, Math.max(0, k)] } });
    }
    if (ZORUAS.has(d.center) && zoruaActive(d)) {
      const disguised = sprite.area !== 'jokers' || (sprite.fd && sprite.fd !== d);
      const own = P_CENTERS[d.center];
      if (disguised && own) {
        const src = spriteCanvas(isShiny(d) ? 'poke_AtlasJokersBasicNatdexShiny391' : 'poke_AtlasJokersBasicNatdex391', own.pos); // (Zorua / Zoroark: the 3.9.1 Natdex sheet, index.js to391)
        if (src) out.push({ key: 'poke_zorua', fs: ZORUA_FS, src, u: { zorua: [fx0, now] } });
      }
    }
    return out.length ? out : null;
  },
  onEvent(ev, board) {
    if (ev.type !== 'poke_evolve') return null;
    const s = board.sprites.get(ev.card);
    if (!s) return null;
    s.pokeEvo = { start: board.now, dur: 1.5 / Math.max(1, board.speed || 1) };
    s.juiceUp(0.2, 0.1);
    return 0.75; // (the swap — the card_changed that follows — lands under the full glow)
  },
  cardActions(d) {
    return isPokemon(d) ? [{ label: 'Dex', cls: 'blue dex', title: 'Pokédex: this Pokémon\'s family', run: (api) => openPokedex(d, api) }] : null;
  },
  cardContext(d, api) {
    if (!isPokemon(d)) return null;
    openPokedex(d, api);
    return true;
  },
  runInfoTabs(view) {
    if (!view || !(view.mods || []).includes(MOD)) return null;
    return [{
      key: 'pokedex', label: 'Pokédex',
      render(body, api) {
        const list = ((view.areas && view.areas.jokers) || []).filter(isPokemon);
        if (!list.length) { body.innerHTML = '<div class="muted">No Pokémon on your joker row yet.</div>'; return; }
        const row = document.createElement('div');
        row.className = 'dex-row dex-owned';
        for (const d of list) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'btn dex-card';
          b.appendChild(api.cardCanvas({ ...d, hl: false }, 'dex-canvas'));
          const nm = document.createElement('div'); nm.className = 'dex-cname';
          const c = P_CENTERS[d.center] || {};
          nm.textContent = (MOD_LOC.descriptions.Joker && MOD_LOC.descriptions.Joker[d.center] && MOD_LOC.descriptions.Joker[d.center].name) || c.name || d.center;
          if (c.ptype) nm.style.color = typeColour(c.ptype);
          b.appendChild(nm);
          b.addEventListener('click', () => openPokedex(d, api));
          row.appendChild(b);
        }
        body.appendChild(Object.assign(document.createElement('div'), { className: 'ri-note', innerHTML: 'Pick a Pokémon to see its evolution family.' }));
        body.appendChild(row);
      },
    }];
  },
};
