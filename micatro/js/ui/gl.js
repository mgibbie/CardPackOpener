// WebGL ports of Balatro's shaders (resources/shaders/*.fs):
//  * background.fs — the swirling paint background (full-screen quad)
//  * foil / holo / polychrome / negative / negative_shine / debuff + the shared
//    dissolve_mask — run on ONE shared offscreen canvas that renders a card's
//    composed face; the card sprite then copies the result with drawImage.
// Everything degrades gracefully: no WebGL -> CSS gradient + plain cards.
// Mod editions may bring their own pass: the edition center's `shader_fs` (a main() over the shared
// prelude below — tex0, time, fx, texture_details, HSL/RGB, dissolve_mask), compiled on first use;
// it replaces the card's plain pass (BETMMA's Phantom / Tentacle), or with `shader_overlay` is drawn over it (AutumnCircus' Gilded).
import { MODREG } from './assets.js';

const VS = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }`;

const BG_FS = `precision highp float;
uniform float time; uniform float spin_time; uniform vec4 colour_1; uniform vec4 colour_2; uniform vec4 colour_3;
uniform float contrast; uniform float spin_amount; uniform vec2 res;
#define PIXEL_SIZE_FAC 700.
#define SPIN_EASE 0.5
void main(){
  vec2 screen_coords = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  float pixel_size = length(res)/PIXEL_SIZE_FAC;
  vec2 uv = (floor(screen_coords*(1./pixel_size))*pixel_size - 0.5*res)/length(res) - vec2(0.12, 0.);
  float uv_len = length(uv);
  float speed = (spin_time*SPIN_EASE*0.2) + 302.2;
  float new_pixel_angle = (atan(uv.y, uv.x)) + speed - SPIN_EASE*20.*(1.*spin_amount*uv_len + (1. - 1.*spin_amount));
  vec2 mid = (res/length(res))/2.;
  uv = (vec2((uv_len * cos(new_pixel_angle) + mid.x), (uv_len * sin(new_pixel_angle) + mid.y)) - mid);
  uv *= 30.;
  speed = time*(2.);
  vec2 uv2 = vec2(uv.x+uv.y);
  for(int i=0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv  += 0.5*vec2(cos(5.1123314 + 0.353*uv2.y + speed*0.131121),sin(uv2.x - 0.113*speed));
    uv  -= 1.0*cos(uv.x + uv.y) - 1.0*sin(uv.x*0.711 - uv.y);
  }
  float contrast_mod = (0.25*contrast + 0.5*spin_amount + 1.2);
  float paint_res = min(2., max(0.,length(uv)*(0.035)*contrast_mod));
  float c1p = max(0.,1. - contrast_mod*abs(1.-paint_res));
  float c2p = max(0.,1. - contrast_mod*abs(paint_res));
  float c3p = 1. - min(1., c1p + c2p);
  vec4 ret_col = (0.3/contrast)*colour_1 + (1. - 0.3/contrast)*(colour_1*c1p + colour_2*c2p + vec4(c3p*colour_3.rgb, c3p*colour_1.a));
  gl_FragColor = vec4(ret_col.rgb, 1.0);
}`;

// ---- card effect shaders (shared prelude = Balatro's dissolve_mask + HSL helpers)
const PRE = `precision highp float;
varying vec2 vUv; uniform sampler2D tex0; uniform float dissolve; uniform float time;
uniform vec4 texture_details; uniform vec4 burn_colour_1; uniform vec4 burn_colour_2; uniform vec2 fx;
vec4 dissolve_mask(vec4 tex, vec2 texture_coords, vec2 uv){
  if (dissolve < 0.001) return tex;
  float adjusted_dissolve = (dissolve*dissolve*(3.-2.*dissolve))*1.02 - 0.01;
  float t = time * 10.0 + 2003.;
  vec2 floored_uv = (floor((uv*texture_details.ba)))/max(texture_details.b, texture_details.a);
  vec2 uv_scaled_centered = (floored_uv - 0.5) * 2.3 * max(texture_details.b, texture_details.a);
  vec2 field_part1 = uv_scaled_centered + 50.*vec2(sin(-t / 143.6340), cos(-t / 99.4324));
  vec2 field_part2 = uv_scaled_centered + 50.*vec2(cos( t / 53.1532),  cos( t / 61.4532));
  vec2 field_part3 = uv_scaled_centered + 50.*vec2(sin(-t / 87.53218), sin(-t / 49.0000));
  float field = (1.+ (cos(length(field_part1) / 19.483) + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73) +
      cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92) ))/2.;
  vec2 borders = vec2(0.2, 0.8);
  float res = (.5 + .5* cos( (adjusted_dissolve) / 82.612 + ( field + -.5 ) *3.14))
    - (floored_uv.x > borders.y ? (floored_uv.x - borders.y)*(5. + 5.*dissolve) : 0.)*(dissolve)
    - (floored_uv.y > borders.y ? (floored_uv.y - borders.y)*(5. + 5.*dissolve) : 0.)*(dissolve)
    - (floored_uv.x < borders.x ? (borders.x - floored_uv.x)*(5. + 5.*dissolve) : 0.)*(dissolve)
    - (floored_uv.y < borders.x ? (borders.x - floored_uv.y)*(5. + 5.*dissolve) : 0.)*(dissolve);
  if (tex.a > 0.01 && burn_colour_1.a > 0.01 && res < adjusted_dissolve + 0.8*(0.5-abs(adjusted_dissolve-0.5)) && res > adjusted_dissolve) {
    if (res < adjusted_dissolve + 0.5*(0.5-abs(adjusted_dissolve-0.5)) && res > adjusted_dissolve) tex.rgba = burn_colour_1.rgba;
    else if (burn_colour_2.a > 0.01) tex.rgba = burn_colour_2.rgba;
  }
  return vec4(tex.xyz, res > adjusted_dissolve ? tex.a : .0);
}
float hue(float s, float t, float h){ float hs = mod(h, 1.)*6.; if (hs < 1.) return (t-s) * hs + s; if (hs < 3.) return t; if (hs < 4.) return (t-s) * (4.-hs) + s; return s; }
vec4 RGB(vec4 c){ if (c.y < 0.0001) return vec4(vec3(c.z), c.a); float t = (c.z < .5) ? c.y*c.z + c.z : -c.y*c.z + (c.y+c.z); float s = 2.0 * c.z - t; return vec4(hue(s,t,c.x + 1./3.), hue(s,t,c.x), hue(s,t,c.x - 1./3.), c.w); }
vec4 HSL(vec4 c){ float low = min(c.r, min(c.g, c.b)); float high = max(c.r, max(c.g, c.b)); float delta = high - low; float sum = high+low;
  vec4 hsl = vec4(.0, .0, .5 * sum, c.a); if (delta == .0) return hsl; hsl.y = (hsl.z < .5) ? delta / sum : delta / (2.0 - sum);
  if (high == c.r) hsl.x = (c.g - c.b) / delta; else if (high == c.g) hsl.x = (c.b - c.r) / delta + 2.0; else hsl.x = (c.r - c.g) / delta + 4.0;
  hsl.x = mod(hsl.x / 6., 1.); return hsl; }
`;

const FX = {
  plain: `void main(){ vec4 tex = texture2D(tex0, vUv); gl_FragColor = dissolve_mask(tex, vUv, vUv); }`,
  foil: `void main(){
    vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv; vec2 foil = fx;
    vec2 adjusted_uv = uv - vec2(0.5, 0.5); adjusted_uv.x = adjusted_uv.x*texture_details.b/texture_details.a;
    float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b)); float delta = min(high, max(0.5, 1. - low));
    float fac = max(min(2.*sin((length(90.*adjusted_uv) + foil.r*2.) + 3.*(1.+0.8*cos(length(113.1121*adjusted_uv) - foil.r*3.121))) - 1. - max(5.-length(90.*adjusted_uv), 0.), 1.), 0.);
    vec2 rotater = vec2(cos(foil.r*0.1221), sin(foil.r*0.3512));
    float angle = dot(rotater, adjusted_uv)/(length(rotater)*length(adjusted_uv));
    float fac2 = max(min(5.*cos(foil.g*0.3 + angle*3.14*(2.2+0.9*sin(foil.r*1.65 + 0.2*foil.g))) - 4. - max(2.-length(20.*adjusted_uv), 0.), 1.), 0.);
    float fac3 = 0.3*max(min(2.*sin(foil.r*5. + uv.x*3. + 3.*(1.+0.5*cos(foil.r*7.))) - 1., 1.), -1.);
    float fac4 = 0.3*max(min(2.*sin(foil.r*6.66 + uv.y*3.8 + 3.*(1.+0.5*cos(foil.r*3.414))) - 1., 1.), -1.);
    float maxfac = max(max(fac, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.2*(fac+fac2+fac3+fac4), 0.);
    tex.r = tex.r-delta + delta*maxfac*0.3; tex.g = tex.g-delta + delta*maxfac*0.3; tex.b = tex.b + delta*maxfac*1.9;
    tex.a = min(tex.a, 0.3*tex.a + 0.9*min(0.5, maxfac*0.1));
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
  holo: `void main(){
    vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv; vec2 holo = fx;
    vec4 hsl = HSL(0.5*tex + 0.5*vec4(0.,0.,1.,tex.a));
    float t = holo.y*7.221 + time;
    vec2 floored_uv = (floor((uv*texture_details.ba)))/texture_details.ba;
    vec2 uv_scaled_centered = (floored_uv - 0.5) * 250.;
    vec2 field_part1 = uv_scaled_centered + 50.*vec2(sin(-t / 143.6340), cos(-t / 99.4324));
    vec2 field_part2 = uv_scaled_centered + 50.*vec2(cos( t / 53.1532),  cos( t / 61.4532));
    vec2 field_part3 = uv_scaled_centered + 50.*vec2(sin(-t / 87.53218), sin(-t / 49.0000));
    float field = (1.+ (cos(length(field_part1) / 19.483) + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73) + cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92) ))/2.;
    float res = (.5 + .5* cos( (holo.x) * 2.612 + ( field + -.5 ) *3.14));
    float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b));
    float delta = 0.2+0.3*(high- low) + 0.1*high;
    float gridsize = 0.79;
    float fac = 0.5*max(max(max(0., 7.*abs(cos(uv.x*gridsize*20.))-6.),max(0., 7.*cos(uv.y*gridsize*45. + uv.x*gridsize*20.)-6.)), max(0., 7.*cos(uv.y*gridsize*45. - uv.x*gridsize*20.)-6.));
    hsl.x = hsl.x + res + fac; hsl.y = hsl.y*1.3; hsl.z = hsl.z*0.6+0.4;
    tex = (1.-delta)*tex + delta*RGB(hsl)*vec4(0.9,0.8,1.2,tex.a);
    if (tex.a < 0.7) tex.a = tex.a/3.;
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
  polychrome: `void main(){
    vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv; vec2 polychrome = fx;
    float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b)); float delta = high - low;
    float saturation_fac = 1. - max(0., 0.05*(1.1-delta));
    vec4 hsl = HSL(vec4(tex.r*saturation_fac, tex.g*saturation_fac, tex.b, tex.a));
    float t = polychrome.y*2.221 + time;
    vec2 floored_uv = (floor((uv*texture_details.ba)))/texture_details.ba;
    vec2 uv_scaled_centered = (floored_uv - 0.5) * 50.;
    vec2 field_part1 = uv_scaled_centered + 50.*vec2(sin(-t / 143.6340), cos(-t / 99.4324));
    vec2 field_part2 = uv_scaled_centered + 50.*vec2(cos( t / 53.1532),  cos( t / 61.4532));
    vec2 field_part3 = uv_scaled_centered + 50.*vec2(sin(-t / 87.53218), sin(-t / 49.0000));
    float field = (1.+ (cos(length(field_part1) / 19.483) + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73) + cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92) ))/2.;
    float res = (.5 + .5* cos( (polychrome.x) * 2.612 + ( field + -.5 ) *3.14));
    hsl.x = hsl.x+ res + polychrome.y*0.04; hsl.y = min(0.6,hsl.y+0.5);
    tex.rgb = RGB(hsl).rgb;
    if (tex.a < 0.7) tex.a = tex.a/3.;
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
  negative: `void main(){
    vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv;
    vec4 SAT = HSL(tex); SAT.b = (1.-SAT.b); SAT.r = -SAT.r+0.2;
    tex = RGB(SAT) + 0.8*vec4(79./255., 99./255.,103./255.,0.);
    if (tex.a < 0.7) tex.a = tex.a/3.;
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
  negative_shine: `void main(){
    vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv; vec2 negative_shine = fx;
    float low = min(tex.r, min(tex.g, tex.b)); float high = max(tex.r, max(tex.g, tex.b)); float delta = high-low -0.1;
    float fac = 0.8 + 0.9*sin(11.*uv.x+4.32*uv.y + negative_shine.r*12. + cos(negative_shine.r*5.3 + uv.y*4.2 - uv.x*4.));
    float fac2 = 0.5 + 0.5*sin(8.*uv.x+2.32*uv.y + negative_shine.r*5. - cos(negative_shine.r*2.3 + uv.x*8.2));
    float fac3 = 0.5 + 0.5*sin(10.*uv.x+5.32*uv.y + negative_shine.r*6.111 + sin(negative_shine.r*5.3 + uv.y*3.2));
    float fac4 = 0.5 + 0.5*sin(3.*uv.x+2.32*uv.y + negative_shine.r*8.111 + sin(negative_shine.r*1.3 + uv.y*11.2));
    float fac5 = sin(0.9*16.*uv.x+5.32*uv.y + negative_shine.r*12. + cos(negative_shine.r*5.3 + uv.y*4.2 - uv.x*4.));
    float maxfac = 0.7*max(max(fac, max(fac2, max(fac3,0.0))) + (fac+fac2+fac3*fac4), 0.);
    tex.rgb = tex.rgb*0.5 + vec3(0.4, 0.4, 0.8);
    tex.r = tex.r-delta + delta*maxfac*(0.7 + fac5*0.27) - 0.1;
    tex.g = tex.g-delta + delta*maxfac*(0.7 - fac5*0.27) - 0.1;
    tex.b = tex.b-delta + delta*maxfac*0.7 - 0.1;
    tex.a = tex.a*(0.5*max(min(1., max(0.,0.3*max(low*0.2, delta)+ min(max(maxfac*0.1,0.), 0.4)) ), 0.) + 0.15*maxfac*(0.1+delta));
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
  debuff: `void main(){
    vec4 tex = texture2D(tex0, vUv); vec2 uv = vUv;
    vec4 SAT = HSL(tex*0.8 + 0.2*vec4(1., 0., 0., tex.a)); SAT.g = 0.5;
    float width = 0.1; bool test = false;
    if ((uv.x+uv.y > 1. - width && uv.x+uv.y < 1. + width) || ((1.-uv.x)+uv.y > 1. - width && (1.-uv.x)+uv.y < 1. + width)) {
      test = true; SAT.r = 1.; SAT.g = 0.7; SAT.b = 0.8*SAT.b;
    } else { SAT.g = SAT.g*0.5; SAT.b = SAT.b*0.7; }
    tex = RGB(SAT); if (!test) tex.a = tex.a*0.3;
    gl_FragColor = dissolve_mask(tex, vUv, uv); }`,
};

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
function quad(gl) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

// ----------------------------------------------------------------- background
const hex = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1]; };
export const C = {
  BLACK: hex('374244'), RED: hex('FE5F55'), BLUE: hex('009dff'), GREEN: hex('4BC292'), PURPLE: hex('8867a5'),
  FILTER: hex('ff9a00'), GOLD: hex('eac058'), SMALL: hex('50846e'), WON: hex('4f6367'), SPECTRAL: hex('4584fa'),
  PLANET: hex('13afce'), ORANGE: hex('fda200'), JOKER_GREY: hex('bfc7d5'), WHITE: [1, 1, 1, 1],
};
export { hex };
const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));
const lighten = (c, p) => [c[0] * (1 - p) + p, c[1] * (1 - p) + p, c[2] * (1 - p) + p, c[3]];
const darken = (c, p) => [c[0] * (1 - p), c[1] * (1 - p), c[2] * (1 - p), c[3]];

/** Balatro's ease_background_colour(_blind) targets for a view state. */
export function backgroundFor(state, blind, won, pack) {
  const args = (o) => o;
  if (state === 'MOD_PACK' || state === 'MOD_PACK_HAND') {
    // a mod pack in its type's colours (Energy, Item, ...), else a neutral slate
    const c = pack && colourArr(pack.colour);
    if (c) { const sp = colourArr(pack.special); return args({ new_colour: c, special_colour: sp || darken(C.BLACK, 0.2), contrast: 2 }); }
    return args({ new_colour: mix(C.WON, C.BLACK, 0.4), special_colour: darken(C.BLACK, 0.2), contrast: 1.6 });
  }
  if (state === 'TAROT_PACK') return args({ new_colour: C.PURPLE, special_colour: darken(C.BLACK, 0.2), contrast: 1.5 });
  if (state === 'SPECTRAL_PACK') return args({ new_colour: C.SPECTRAL, special_colour: darken(C.BLACK, 0.2), contrast: 2 });
  if (state === 'STANDARD_PACK') return args({ new_colour: darken(C.BLACK, 0.2), special_colour: C.RED, contrast: 3 });
  if (state === 'BUFFOON_PACK') return args({ new_colour: C.FILTER, special_colour: C.BLACK, contrast: 2 });
  if (state === 'PLANET_PACK') return args({ new_colour: C.BLACK, contrast: 3 });
  if (won) return args({ new_colour: C.WON, contrast: 1 });
  if (!blind || !blind.boss || state === 'SHOP' || state === 'BLIND_SELECT' || state === 'MENU') {
    if (state === 'MENU') return { new_colour: C.RED, special_colour: C.BLUE, tertiary_colour: darken(C.BLACK, 0.4), contrast: 1.4 };
    return args({ new_colour: C.SMALL, contrast: 1 });
  }
  if (blind.showdown) return { new_colour: C.BLUE, special_colour: C.RED, tertiary_colour: darken(C.BLACK, 0.4), contrast: 3 };
  const boss = blind.colour ? hex(blind.colour) : C.BLACK;
  return { new_colour: lighten(mix(boss, C.BLACK, 0.3), 0.1), special_colour: boss, contrast: 2 };
}
/** '#rrggbb' / 'rrggbb' / [r,g,b,a] (0..1) -> [r,g,b,1], or null. */
function colourArr(c) {
  if (!c) return null;
  if (Array.isArray(c)) return [c[0], c[1], c[2], 1];
  const s = String(c).trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return hex(s.slice(0, 6));
  if (/^[0-9a-f]{3}$/i.test(s)) return hex(s.split('').map((x) => x + x).join(''));
  return null;
}
function bgTargets(a) {
  if (a.special_colour && a.tertiary_colour) return { L: a.new_colour, C: a.special_colour, D: a.tertiary_colour, contrast: a.contrast };
  const L = a.new_colour.map((v, i) => (i < 3 ? v * 1.3 : 1));
  const D = a.new_colour.map((v, i) => (i < 3 ? v * (a.special_colour ? 0.4 : 0.7) : 1));
  const Cc = a.special_colour ? a.special_colour : a.new_colour.map((v, i) => (i < 3 ? v * 0.9 : 1));
  return { L, C: Cc, D, contrast: a.contrast || 1 };
}

export class Background {
  constructor(canvas) {
    this.canvas = canvas;
    this.cur = bgTargets(backgroundFor('MENU'));
    this.tgt = this.cur;
    this.spin = 0; this.spinTarget = 0; this.spinTime = 0;
    this.ok = false;
    try {
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      if (!gl) throw new Error('no webgl');
      this.gl = gl;
      this.prog = compile(gl, VS, BG_FS);
      quad(gl);
      this.ok = true;
    } catch (e) {
      document.body.classList.add('no-webgl');
    }
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    // half-res is invisible here: the shader floors to ~700 "paint pixels" anyway
    const s = Math.min(0.6, 1100 / Math.max(innerWidth, innerHeight));
    this.canvas.width = Math.max(64, Math.round(innerWidth * s));
    this.canvas.height = Math.max(64, Math.round(innerHeight * s));
  }
  set(args) { this.tgt = bgTargets(args); }
  /** spin pulse (Balatro: G.ARGS.spin.real on blind select / hand scored) */
  pulse(amount = 0.6) { this.spinTarget = amount; clearTimeout(this._pt); this._pt = setTimeout(() => { this.spinTarget = 0; }, 900); }
  draw(t, dt) {
    const k = Math.min(1, dt * 3.2);
    const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
    this.cur = { L: lerp(this.cur.L, this.tgt.L), C: lerp(this.cur.C, this.tgt.C), D: lerp(this.cur.D, this.tgt.D), contrast: this.cur.contrast + (this.tgt.contrast - this.cur.contrast) * k };
    this.spin += (this.spinTarget - this.spin) * Math.min(1, dt * 2);
    this.spinTime += dt * this.spin * 6;
    if (!this.ok) {
      const css = (c) => `rgb(${c.slice(0, 3).map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
      if ((this._cssTick = (this._cssTick || 0) + 1) % 20 === 0) document.body.style.background = `radial-gradient(circle at 45% 50%, ${css(this.cur.L)} 0%, ${css(this.cur.C)} 45%, ${css(this.cur.D)} 100%)`;
      return;
    }
    const gl = this.gl, { p, u } = this.prog;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p);
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.spin_time, this.spinTime);
    gl.uniform4fv(u.colour_1, this.cur.C);
    gl.uniform4fv(u.colour_2, this.cur.L);
    gl.uniform4fv(u.colour_3, this.cur.D);
    gl.uniform1f(u.contrast, this.cur.contrast);
    gl.uniform1f(u.spin_amount, this.spin);
    gl.uniform2f(u.res, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// ------------------------------------------------------------ card effects
export class CardFX {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.ok = false;
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const gl = c.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('no webgl');
      this.canvas = c; this.gl = gl;
      this.progs = {};
      for (const [k, src] of Object.entries(FX)) this.progs[k] = compile(gl, VS, PRE + src);
      quad(gl);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.tex = new WeakMap();
      this.ok = true;
    } catch (e) { this.ok = false; }
  }
  texFor(src) {
    const gl = this.gl;
    let rec = this.tex.get(src);
    if (!rec) {
      rec = { t: gl.createTexture(), ver: -1 };
      gl.bindTexture(gl.TEXTURE_2D, rec.t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.tex.set(src, rec);
    }
    gl.bindTexture(gl.TEXTURE_2D, rec.t);
    if (rec.ver !== src._ver) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      rec.ver = src._ver;
    }
    return rec.t;
  }
  /** A mod edition's own pass ('mod:<type>'), compiled from its center's shader_fs; null = none / failed. */
  modPass(ed) {
    const k = 'mod:' + ed;
    if (!(k in this.progs)) {
      const c = MODREG.center('e_' + ed);
      this.progs[k] = null;
      if (c && c.shader_fs) {
        try { this.progs[k] = compile(this.gl, VS, PRE + c.shader_fs); } catch (e) { console.warn('micatro: mod edition shader failed: ' + ed, e); }
      }
    }
    return this.progs[k] ? k : null;
  }
  /**
   * Render `src` (a composed card face canvas, w×h) through Balatro's edition
   * passes into `dst` (2D canvas same size). opts: {edition, debuff, dissolve, t, fx}
   */
  render(src, dst, opts) {
    const ctx = dst.getContext('2d');
    if (!this.ok) {
      ctx.clearRect(0, 0, dst.width, dst.height);
      ctx.globalAlpha = 1 - (opts.dissolve || 0);
      ctx.drawImage(src, 0, 0);
      ctx.globalAlpha = 1;
      return;
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.texFor(src);
    const ed = opts.edition;
    const passes = [];
    if (ed === 'holo') passes.push('plain', 'holo');
    else if (ed === 'polychrome') passes.push('polychrome');
    else if (ed === 'negative') passes.push('negative', 'negative_shine');
    else if (ed === 'foil') passes.push('plain', 'foil');
    else if (ed && this.modPass(ed) && MODREG.center('e_' + ed) && MODREG.center('e_' + ed).shader_overlay) passes.push('plain', this.modPass(ed)); // (an SMODS edition drawn over the card: AutumnCircus' Gilded)
    else passes.push((ed && this.modPass(ed)) || 'plain');
    if (opts.debuff) passes.push('debuff');
    for (const k of passes) {
      const { p, u } = this.progs[k];
      gl.useProgram(p);
      gl.uniform1i(u.tex0, 0);
      gl.uniform1f(u.dissolve, opts.dissolve || 0);
      gl.uniform1f(u.time, opts.t || 0);
      if (u.texture_details) gl.uniform4f(u.texture_details, 0, 0, 71, 95);
      if (u.burn_colour_1) gl.uniform4fv(u.burn_colour_1, opts.burn1 || C.BLACK);
      if (u.burn_colour_2) gl.uniform4fv(u.burn_colour_2, opts.burn2 || C.ORANGE);
      if (u.fx) gl.uniform2f(u.fx, opts.fx ? opts.fx[0] : 0, opts.fx ? opts.fx[1] : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.drawImage(this.canvas, 0, 0);
  }
}
