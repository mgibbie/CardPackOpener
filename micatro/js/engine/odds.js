// Odds for people (no engine state: the UI imports it too). A listed probability [numerator, denominator] after every
// mod_probability / Oops! All 6s / fix_probability pass (core.js probability_vars) reads 'never' (0), 'always' (the numerator
// reaches the denominator) or reduced ('2 in 4' -> '1 in 2').
const r3 = (n) => Math.round(n * 1000) / 1000;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

export function odds_text(n, d) {
  if (!(n > 0)) return 'never';
  if (n >= d) return 'always';
  const g = Number.isInteger(n) && Number.isInteger(d) ? gcd(n, d) : 1;
  return r3(n / g) + ' in ' + r3(d / g);
}

/**
 * A Glass card's description lines from its live numbers [Xmult, numerator, denominator] (describe.js enh_live_vars) and the loc
 * text ("X#1# Mult", "#2# in #3# chance to", "destroy card"); `sub(line, vars)` fills a line. Always / never replace the odds lines
 * (Pokermon's two Noibats, Regice's Ice Body).
 */
export function glass_text(loc_lines, vars, sub) {
  const [x, n, d] = vars;
  const t = odds_text(n, d);
  if (t === 'always' || t === 'never') return [sub(loc_lines[0], [x]), t === 'always' ? '{C:green}Always{} breaks' : '{C:inactive}Never breaks'];
  const [nn, dd] = t.split(' in ');
  return loc_lines.map((l) => sub(l, [x, nn, dd]));
}
