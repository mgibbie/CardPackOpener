// Balatro description markup -> HTML.  "{C:mult}+4{} Mult", "{X:mult,C:white} X2 {}",
// "{s:0.8}", "{C:attention,T:tag_double}..." ({T:}/{E:}/{V:} are accepted and ignored).
import { CENTERS, LOC, CARDS, MODREG, modType, cssColour, modFont } from './assets.js';
import { isBig, from as bigFrom, formatBig } from '../engine/bignum.js';

export const COL = {
  mult: '#fe5f55', chips: '#009dff', money: '#f3b958', attention: '#ff9a00', filter: '#ff9a00',
  blue: '#009dff', red: '#fe5f55', green: '#4bc292', tarot: '#a782d1', planet: '#13afce',
  spectral: '#4584fa', legendary: '#b26cbb', enhanced: '#8389dd', purple: '#8867a5', important: '#ff9a00',
  inactive: '#8a8a8a', white: '#ffffff', grey: '#5f7377', light_black: '#4f6367', black: '#374244',
  gold: '#eac058', yellow: '#ffff00', orange: '#fda200', edition: '#4ca893', voucher: '#cb724c',
  booster: '#646eb7', joker_grey: '#bfc7d5', eternal: '#c75985', perishable: '#4f5da1', rental: '#b18f43',
  hearts: '#f03464', diamonds: '#f06b3f', spades: '#403995', clubs: '#235955', default: '#4f6367',
  chance: '#4bc292', pale_green: '#56a887', dark_edition: '#5a4fcf', secondary_set: '#4f6367',
};

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** One markup line -> HTML. */
export function markup(line, colours) {
  if (line == null) return '';
  if (Array.isArray(line)) return line.map((l) => markup(l, colours)).join(' ');
  if (typeof line === 'object') return markup(line.text || '', colours);
  const s = String(line);
  let out = '', i = 0, open = false;
  while (i < s.length) {
    const b = s.indexOf('{', i);
    if (b < 0) { out += esc(s.slice(i)); break; }
    out += esc(s.slice(i, b));
    const e = s.indexOf('}', b);
    if (e < 0) { out += esc(s.slice(b)); break; }
    const spec = s.slice(b + 1, e).trim();
    if (open) { out += '</span>'; open = false; }
    if (spec) {
      const st = [];
      let cls = '';
      for (const part of spec.split(',')) {
        const [k, v0] = part.split(':');
        const v = (v0 || '').trim().toLowerCase();
        if (k === 'C') { if (v === 'dark_edition') cls += ' dark-ed'; else st.push('color:' + (COL[v] || typeColour(v) || '#4f6367')); }
        else if (k === 'X') { st.push('background:' + (COL[v] || '#fe5f55')); cls += ' xbox'; }
        else if (k === 'V') { const c = colours && colours[(parseInt(v, 10) || 1) - 1]; const css = cssCol(c); if (css) st.push('color:' + css); }
        else if (k === 's') { const n = parseFloat(v); if (n) st.push("font-size:" + Math.round(Math.min(1.6, n) * 100) + "%"); }
        else if (k === 'f') { const ff = modFont((v0 || '').trim()); if (ff) st.push("font-family:'" + ff + "',m6x11,sans-serif"); } // (a mod font: AutumnCircus' Noto Emoji)
      }
      out += `<span class="mk${cls}" style="${st.join(';')}">`;
      open = true;
    }
    i = e + 1;
  }
  if (open) out += '</span>';
  return out;
}

/** {C:<mod consumable type>} — the type's colour (Reverie's {C:cine}, More Fluff's Colour cards). */
function typeColour(v) {
  const t = modType(v);
  return t ? (cssColour(t.secondary_colour) || cssColour(t.primary_colour)) : null;
}

function cssCol(c) {
  if (!c) return null;
  if (Array.isArray(c)) return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] == null ? 1 : c[3]})`;
  const k = String(c).toLowerCase();
  return COL[k] || (/^#/.test(k) ? k : null);
}

/** Balatro's number_format: commas, scientific past 1e11. */
export function fmt(n) {
  if (n == null || n === '') return '0';
  // big-number scoring: a Decimal, or its JSON string from a spectated view ("1.234e450")
  if (typeof n === 'string' && /e/i.test(n)) n = bigFrom(n);
  if (isBig(n)) return formatBig(n);
  if (typeof n !== 'number') n = Number(n);
  if (!isFinite(n)) return n > 0 ? 'naneinf' : '-naneinf';
  if (Math.abs(n) >= 1e11) {
    const e = Math.floor(Math.log10(Math.abs(n)));
    return (n / Math.pow(10, e)).toFixed(3) + 'e' + e;
  }
  const r = Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : Math.round(n * 100) / 100;
  return r.toLocaleString('en-US');
}

const sub = (lines, vars) => (lines || []).map((l) => String(l).replace(/#(\d+)#/g, (m, i) => (vars[i - 1] != null ? vars[i - 1] : m)));
const RANK_NAME = { '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10', Jack: 'Jack', Queen: 'Queen', King: 'King', Ace: 'Ace' };
const NOMINAL = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, Jack: 10, Queen: 10, King: 10, Ace: 11 };

/** Tooltip model for a playing card (the view carries no describe() for hand cards). */
export function describePlaying(cv) {
  // (a mod suit's card carries its own rank / suit: spectators may not have the mod's P_CARDS)
  const front = cv.front_value ? { value: cv.front_value, suit: cv.front_suit_name || cv.front_suit } : (CARDS[cv.front] || {});
  const center = CENTERS[cv.center] || {};
  const D = LOC.descriptions;
  const enh = cv.enh; // a mod enhancement (engine/view.js cardView)
  const noBase = center.name === 'Stone Card' || !!(enh && enh.replace);
  const name = cv.facing === 'back' ? '???' : (enh && enh.replace ? enh.name : center.name === 'Stone Card' ? 'Stone Card' : `${RANK_NAME[front.value] || front.value} of ${front.suit}`);
  const lines = [];
  const badges = [];
  if (cv.facing === 'back') return { name, lines: ['{C:inactive}Face down'], badges };
  if (!noBase) lines.push(`{C:chips}+${NOMINAL[front.value] || 0}{} chips`);
  const cfg = center.config || {};
  const extra = (title, l) => { lines.push(''); lines.push(`{C:attention}${title}`); lines.push(...l); };
  switch (cv.center) {
    case 'm_bonus': extra('Bonus Card', [`{C:chips}+${cfg.bonus || 30}{} extra chips`]); break;
    case 'm_mult': extra('Mult Card', sub(D.Enhanced.m_mult.text, [cfg.mult || 4])); break;
    case 'm_glass': extra('Glass Card', sub(D.Enhanced.m_glass.text, [cfg.Xmult || 2, 1, cfg.extra || 4])); break;
    case 'm_steel': extra('Steel Card', sub(D.Enhanced.m_steel.text, [cfg.h_x_mult || 1.5])); break;
    case 'm_stone': lines.push(...sub(D.Enhanced.m_stone.text, [cfg.bonus || 50])); break;
    case 'm_gold': extra('Gold Card', sub(D.Enhanced.m_gold.text, [cfg.h_dollars || 3])); break;
    case 'm_lucky': extra('Lucky Card', sub(D.Enhanced.m_lucky.text, [1, cfg.mult || 20, 5, cfg.p_dollars || 20, 15])); break;
    case 'm_wild': extra('Wild Card', D.Enhanced.m_wild.text); break;
    default: break;
  }
  if (enh) { if (enh.replace) lines.push(...enh.lines); else extra(enh.name, enh.lines); }
  if (cv.edition) {
    const ed = { foil: ['Foil', '{C:chips}+50{} chips'], holo: ['Holographic', '{C:mult}+10{} Mult'], polychrome: ['Polychrome', '{X:mult,C:white} X1.5 {} Mult'], negative: ['Negative', ''] }[cv.edition];
    if (ed) { extra(ed[0], ed[1] ? [ed[1]] : []); badges.push(ed[0]); }
  }
  if (cv.seal) {
    // (a mod seal — Pokermon's Pink / Silver — has its text in the mod's loc, Other.<key>_seal like SMODS, and its badge colour)
    const k = cv.seal.toLowerCase() + '_seal';
    const MO = (MODREG.loc.descriptions || {}).Other || {};
    const s = D.Other[k] || MO[k];
    const ms = !D.Other[k] && MODREG.seal(cv.seal);
    if (s) { extra(s.name, s.text); badges.push(ms && ms.badge_colour ? { key: k, label: s.name, colour: ms.badge_colour } : s.name); }
  }
  // lines a mod adds to a playing card's tooltip (view_card mod_lines: Bunco's linked group, mod editions)
  if (cv.mod_lines && cv.mod_lines.length) { lines.push(''); lines.push(...cv.mod_lines); }
  if (cv.debuff) { lines.push(''); lines.push('{C:red}Debuffed'); }
  return { name, lines, badges };
}

/** Fallback when describe.js isn't available: localized text, #n# unfilled. */
export function describeCenterFallback(key) {
  const c = CENTERS[key];
  if (!c) return { name: key, lines: [] };
  const d = LOC.descriptions[c.set] && LOC.descriptions[c.set][key];
  return { name: (d && d.name) || c.name, lines: (d && d.text) || [], badges: [] };
}

export const BADGE_COL = {
  common: '#009dff', uncommon: '#4bc292', rare: '#fe5f55', legendary: '#b26cbb',
  tarot: '#a782d1', planet: '#13afce', 'dwarf planet': '#13afce', spectral: '#4584fa', voucher: '#fd682b',
  booster: '#646eb7', 'booster pack': '#646eb7', joker: '#708b91',
  foil: '#4ca893', holographic: '#4ca893', polychrome: '#4ca893', negative: '#4ca893', edition: '#4ca893',
  eternal: '#c75985', perishable: '#4f5da1', rental: '#b18f43', pinned: '#ff9a00',
  'gold seal': '#eac058', 'red seal': '#fe5f55', 'blue seal': '#009dff', 'purple seal': '#8867a5',
  gold_seal: '#eac058', red_seal: '#fe5f55', blue_seal: '#009dff', purple_seal: '#8867a5', pluto_planet: '#13afce', pinned_left: '#ff9a00', debuffed: '#fe5f55',
  enhanced: '#8389dd', 'playing card': '#9bb6bd', base: '#9bb6bd', tag: '#4f6367',
};
