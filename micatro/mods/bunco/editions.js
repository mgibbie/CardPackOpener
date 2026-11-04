// Bunco — editions (Bunco.lua ~7643-7695 + lovely "Fluorescent edition", "Edition tags", "Info queue for
// consumables"):
//   Glitter      X1.3 Chips (after a joker's own effects — SMODS post_joker — or after a played card's)
//   Fluorescent  can't be debuffed, can't be flipped face down (in hand / jokers / consumables), and a forced
//                selection (Cerulean Bell, The Gate) can be undone on it
// Both roll in shops (weights 9 / 18, scaled by the edition rate). A consumable's edition doesn't score like a
// joker's (option `jokerlike_consumable_editions`, default off): USING a Foil / Holographic / Polychrome /
// Glitter consumable makes a Chips / Mult / Megamult / Ultrachips Tag instead (that part happens either way, as
// in the lovely patch).
// The shaders are WebGL (GLSL ES 1.0) ports of assets/shaders/glitter.fs and fluorescent.fs for the renderer's
// mod-edition pass (`shader_fs`, over ui/gl.js's prelude: tex0, time, fx = (fx.x, real time), HSL / RGB,
// dissolve_mask; Love's vertex `colour` is white).
import { G, play_sound } from '../../js/engine/core.js';
import { add_tag, Tag } from '../../js/engine/tag.js';
import { data_of, option } from './util.js';

export const GLITTER_FS = `
vec4 mod289v4(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 mod289v3(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289v4(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade3(vec3 t){ return t*t*t*(t*(t*6.0-15.0)+10.0); }
float cnoise(vec3 P){
  vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0); Pi0 = mod289v3(Pi0); Pi1 = mod289v3(Pi1);
  vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x); vec4 iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y);
  vec4 iz0 = vec4(Pi0.z); vec4 iz1 = vec4(Pi1.z);
  vec4 ixy = permute(permute(ix) + iy); vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
  vec4 gx0 = ixy0 * (1.0 / 7.0); vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5; gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0); vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5); gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 * (1.0 / 7.0); vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5; gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1); vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5); gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x); vec3 g100 = vec3(gx0.y,gy0.y,gz0.y); vec3 g010 = vec3(gx0.z,gy0.z,gz0.z); vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x); vec3 g101 = vec3(gx1.y,gy1.y,gz1.y); vec3 g011 = vec3(gx1.z,gy1.z,gz1.z); vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000), dot(g010,g010), dot(g100,g100), dot(g110,g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001), dot(g011,g011), dot(g101,g101), dot(g111,g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x, Pf0.yz)); float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z)); float n001 = dot(g001, vec3(Pf0.xy, Pf1.z)); float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz)); float n111 = dot(g111, Pf1);
  vec3 fade_xyz = fade3(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  return 2.2 * mix(n_yz.x, n_yz.y, fade_xyz.x);
}
vec4 lighten(vec4 a, vec4 b){ return max(a, b); }
void main(){
  vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv; vec4 colour = vec4(1.0);
  float md = fx.x * 2.0;
  vec4 colour_1 = vec4(0.188,0.471,0.875, 1.0); vec4 colour_2 = vec4(0.875,0.188,0.222, 0.8); vec4 colour_3 = vec4(0.416,0.573,0.369, 0.6);
  float noise = cnoise(vec3(uv * 50.0, 3.0 * md)); float antinoise = cnoise(vec3(uv * 30.0, 2.0 * md));
  vec4 grad = mix(colour_1, colour_2, uv.x + uv.y + sin(md) - 1.0);
  grad = mix(grad, colour_3, uv.y - uv.x + cos(md) + 1.0);
  float spark = max(0.0, noise - antinoise - 0.15);
  vec4 sc = HSL(mix(tex, grad, 0.2)); sc.g *= 5.0; sc.b = 0.3; sc = RGB(sc); sc.r *= (sc.r * 0.9);
  sc = lighten(tex, sc * 5.0) / 3.0;
  colour = lighten(mix((colour - 0.4) + (sc * spark), grad, 0.03), grad);
  gl_FragColor = dissolve_mask(tex*colour, vUv, uv); }`;

export const FLUORESCENT_FS = `
float cdist(vec3 a, vec3 b){ return length(clamp(a, 0.0, 1.0) - clamp(b, 0.0, 1.0)); }
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
vec3 saturation(vec3 rgb, float adj){ vec3 W = vec3(0.1125, 0.2154, 0.0221); vec3 intensity = vec3(dot(rgb, W)); return mix(intensity, rgb, adj); }
void main(){
  vec4 tex = texture2D(tex0, vUv); vec3 pixelColor = tex.rgb; vec2 uv = vUv;
  float effect = 0.7 + (0.3 * clamp(cos(sin(uv.y * 8.24 + fx.x * 6.0) + sin(uv.x * 6.12 + fx.x * 2.0) * fx.x * uv.y * 3.15), 0.0, 1.0));
  float totalWeight = 0.0; vec3 blendedColor = vec3(0.0); vec3 sat = saturation(pixelColor, 3.0); float w;
  w = exp(-cdist(pixelColor, vec3(1.,0.,0.)) * 3.0); totalWeight += w; blendedColor += sat * w;
  w = exp(-cdist(pixelColor, vec3(0.,1.,0.)) * 3.0); totalWeight += w; blendedColor += sat * w;
  w = exp(-cdist(pixelColor, vec3(0.,0.,1.)) * 3.0); totalWeight += w; blendedColor += sat * w;
  w = exp(-cdist(pixelColor, vec3(1.,1.,0.)) * 3.0); totalWeight += w; blendedColor += sat * w;
  w = exp(-cdist(pixelColor, vec3(0.,1.,1.)) * 3.0); totalWeight += w; blendedColor += sat * w;
  w = exp(-cdist(pixelColor, vec3(1.,0.,1.)) * 3.0); totalWeight += w; blendedColor += sat * w;
  if (totalWeight > 0.0) blendedColor /= totalWeight;
  float desaturationFactor = smoothstep(0.0, 1.0, totalWeight);
  blendedColor = rgb2hsv(blendedColor); blendedColor.z *= desaturationFactor * blendedColor.y; blendedColor.y = 1.0; blendedColor = hsv2rgb(blendedColor);
  vec3 tintedColor = pixelColor * vec3(0.28, 0.35, 0.49); tintedColor -= (tintedColor * (effect - 1.0)) * 0.15;
  vec3 finalColor = blendedColor * effect + tintedColor;
  gl_FragColor = dissolve_mask(vec4(finalColor.rgb, tex.a * tex.a), vUv, uv); }`;

const ed = (key, def) => ({ ...data_of('editions', key), set: 'Edition', name: key, ...def });
export const centers = [
  ed('e_bunc_glitter', {
    order: 1, extra_cost: 3, shader_fs: GLITTER_FS, // (5.4.8b: +$3 in the shop; 5.1 had none)
    loc_vars: (s) => ({ vars: [s.config.Xchips] }),
    get_weight: (s) => G.GAME.edition_rate * s.weight,
  }),
  ed('e_bunc_fluorescent', {
    order: 2, extra_cost: 1, config: {}, shader_fs: FLUORESCENT_FS, // (5.4.8b: +$1)
    get_weight: (s) => G.GAME.edition_rate * s.weight,
  }),
];

const EDITION_TAG = { foil: 'tag_bunc_chips', holo: 'tag_bunc_mult', polychrome: 'tag_bunc_xmult', bunc_glitter: 'tag_bunc_xchips' };
export const hooks = {
  // playing-card tooltips (the view carries no describe() for hand cards)
  view_card(card, v) {
    if (!card.edition || !(card.ability.set === 'Default' || card.ability.set === 'Enhanced')) return;
    if (card.edition.bunc_glitter) v.mod_lines = [...(v.mod_lines || []), '{C:dark_edition}Glitter', '{X:chips,C:white}X' + card.edition.Xchips + '{} Chips'];
    if (card.edition.bunc_fluorescent) v.mod_lines = [...(v.mod_lines || []), '{C:dark_edition}Fluorescent', 'Cannot be flipped, debuffed', 'or forced to be selected'];
  },
  // Fluorescent edition 3/3: never debuffed.
  set_debuff: (card) => (card.edition && card.edition.bunc_fluorescent ? 'prevent_debuff' : undefined),
  // Edition tags 4/5: consumables' editions don't score like jokers' (unless the option says so).
  consumable_edition_scores: () => (option('jokerlike_consumable_editions') ? undefined : false),
  // Edition tags 3/5: a used consumable with an edition makes its Tag.
  used_consumeable(card, area, copier) {
    const used = copier || card;
    if (!used.edition) return;
    const k = used.edition.foil ? 'foil' : used.edition.holo ? 'holo' : used.edition.polychrome ? 'polychrome' : used.edition.bunc_glitter ? 'bunc_glitter' : null;
    if (k) { add_tag(new Tag(EDITION_TAG[k])); play_sound('generic1'); }
  },
};
