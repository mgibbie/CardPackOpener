// Big-number scoring — Micatro's native stand-in for Talisman / InfiniteScore.
//
// Balatro's score is a Lua double: past ~1.8e308 it becomes inf and the HUD shows "naneinf".
// Micatro goes further in EVERY run (owner decision, 2026-10-16: built into the base game, not a
// mod feature): a value that would overflow a double becomes a Decimal (mantissa m in [1,10) +
// integer exponent e, the break_infinity.js design), so chips, mult, hand scores, the round score
// and blind requirements can reach 9.99e999. At 1e1000 (MAX_EXP) a value becomes Infinity, which
// is Micatro's "naneinf".
//
// The representation is HYBRID: a value stays a plain JS number for as long as it fits (so every
// result below the overflow line is bit-for-bit what plain arithmetic gives — runs that never
// overflow replay exactly as before), and is a Decimal only when |x| >= 1e308. Decimals are
// canonical: an op whose result drops back under 1e308 returns a number again.
//
// The helpers (add/sub/mul/div/pow/floor/gt/gte/lt/beats/min/max) accept number | Decimal:
//   * number op number  -> the native result, except a finite+finite overflow, which is redone
//                          in Decimal;
//   * anything with a Decimal -> Decimal math (deterministic: plain double ops on m/e).
// A Decimal's valueOf() is +-Infinity, so mod code that still does plain arithmetic on one
// degrades to Balatro's inf instead of throwing. JSON form (toJSON / from): the string
// "<m>e<e>", e.g. "1.2345678901234567e450" (<= ~30 chars).

const CUT = 308; // a Decimal's exponent is >= CUT; anything smaller is a number
/** Values at or above 10^MAX_EXP are Infinity ("naneinf"): the scale tops out at 9.99e999. */
export const MAX_EXP = 1000;

export class Decimal {
  constructor(m, e) { this.m = m; this.e = e; }
  valueOf() { return this.m > 0 ? Infinity : this.m < 0 ? -Infinity : 0; }
  toJSON() { return this.m + 'e' + this.e; }
  toString() { return formatBig(this); }
}

/** Big numbers are part of the base game: always on (up to 9.99e999, see MAX_EXP). */
export const bigOn = () => true;
export const isBig = (x) => x instanceof Decimal;

const pow10 = (e) => (e > 300 || e < -300 ? Math.pow(10, e / 2) * Math.pow(10, e - e / 2) : Math.pow(10, e));

/** m * 10^e -> canonical number | Decimal. */
function norm(m, e) {
  if (m !== m || e !== e) return NaN;
  if (m === 0) return 0;
  if (!isFinite(m) || !isFinite(e)) return e === -Infinity ? 0 : (m > 0 ? Infinity : -Infinity);
  const a = Math.abs(m);
  if (a >= 10 || a < 1) {
    const s = Math.floor(Math.log10(a));
    m = m / pow10(s); e = e + s;
    if (Math.abs(m) >= 10) { m /= 10; e += 1; } else if (Math.abs(m) < 1) { m *= 10; e -= 1; }
  }
  if (e < CUT) return e < -400 ? 0 : Number(m + 'e' + e);
  if (e >= MAX_EXP) return m > 0 ? Infinity : -Infinity; // past 9.99e999: naneinf
  return new Decimal(m, e);
}

/** number (finite) | Decimal -> a Decimal-shaped {m, e} (not canonical). */
function toD(x) {
  if (x instanceof Decimal) return x;
  if (x === 0) return new Decimal(0, 0);
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = x / pow10(e);
  if (Math.abs(m) >= 10) { m /= 10; e += 1; } else if (Math.abs(m) < 1) { m *= 10; e -= 1; }
  return new Decimal(m, e);
}

const finiteOrBig = (x) => (x instanceof Decimal) || (typeof x === 'number' && isFinite(x));

function dAdd(a, b) {
  let A = toD(a), B = toD(b);
  if (A.m === 0) return norm(B.m, B.e);
  if (B.m === 0) return norm(A.m, A.e);
  if (A.e < B.e) [A, B] = [B, A];
  const d = A.e - B.e;
  if (d > 17) return norm(A.m, A.e);
  return norm(A.m + B.m / Math.pow(10, d), A.e);
}
function dMul(a, b) { const A = toD(a), B = toD(b); return norm(A.m * B.m, A.e + B.e); }
function dDiv(a, b) { const A = toD(a), B = toD(b); return B.m === 0 ? (+a) / 0 : norm(A.m / B.m, A.e - B.e); }
function dPow(a, p) {
  const A = toD(a);
  if (A.m === 0) return p > 0 ? 0 : p === 0 ? 1 : Infinity;
  let sign = 1;
  if (A.m < 0) { if (!Number.isInteger(p)) return NaN; if (p % 2) sign = -1; }
  const lg = p * (Math.log10(Math.abs(A.m)) + A.e);
  if (!isFinite(lg)) return lg > 0 ? sign * Infinity : 0;
  const e = Math.floor(lg);
  return norm(sign * Math.pow(10, lg - e), e);
}

// overflow of two finite numbers -> redo it big
const promote = (r, a, b) => r === r && !isFinite(r) && isFinite(a) && isFinite(b) && bigOn();

export function add(a, b) {
  if (typeof a === 'number' && typeof b === 'number') { const r = a + b; return promote(r, a, b) ? dAdd(a, b) : r; }
  return finiteOrBig(a) && finiteOrBig(b) ? dAdd(a, b) : (+a) + (+b);
}
export function neg(a) { return a instanceof Decimal ? new Decimal(-a.m, a.e) : -a; }
export function sub(a, b) {
  if (typeof a === 'number' && typeof b === 'number') { const r = a - b; return promote(r, a, b) ? dAdd(a, -b) : r; }
  return finiteOrBig(a) && finiteOrBig(b) ? dAdd(a, neg(b)) : (+a) - (+b);
}
export function mul(a, b) {
  if (typeof a === 'number' && typeof b === 'number') { const r = a * b; return promote(r, a, b) ? dMul(a, b) : r; }
  return finiteOrBig(a) && finiteOrBig(b) ? dMul(a, b) : (+a) * (+b);
}
export function div(a, b) {
  if (typeof a === 'number' && typeof b === 'number') { const r = a / b; return promote(r, a, b) && b !== 0 ? dDiv(a, b) : r; }
  return finiteOrBig(a) && finiteOrBig(b) ? dDiv(a, b) : (+a) / (+b);
}
/** a ^ p (Talisman's ^chips / ^mult). A Decimal exponent counts as +-inf. */
export function pow(a, p) {
  p = +p;
  if (typeof a === 'number') {
    const r = Math.pow(a, p);
    return promote(r, a, p) && (a > 0 || Number.isInteger(p)) ? dPow(a, p) : r;
  }
  return a instanceof Decimal && isFinite(p) ? dPow(a, p) : Math.pow(+a, p);
}
export function floor(a) { return a instanceof Decimal ? a : Math.floor(a); }
export function ceil(a) { return a instanceof Decimal ? a : Math.ceil(a); }

/** -1 / 0 / 1, NaN when either side is NaN. */
export function cmp(a, b) {
  if (!(a instanceof Decimal) && !(b instanceof Decimal)) { a = +a; b = +b; return a < b ? -1 : a > b ? 1 : a === b ? 0 : NaN; }
  // an infinite / NaN number against a Decimal: +-Infinity lies beyond every Decimal
  if (!(a instanceof Decimal)) { a = +a; if (a !== a) return NaN; if (!isFinite(a)) return a > 0 ? 1 : -1; }
  if (!(b instanceof Decimal)) { b = +b; if (b !== b) return NaN; if (!isFinite(b)) return b > 0 ? -1 : 1; }
  const A = toD(a), B = toD(b);
  const sa = Math.sign(A.m), sb = Math.sign(B.m);
  if (sa !== sb) return sa > sb ? 1 : -1;
  if (sa === 0) return 0;
  if (A.e !== B.e) return (A.e > B.e ? 1 : -1) * sa;
  return A.m === B.m ? 0 : A.m > B.m ? 1 : -1;
}
// Comparisons keep native semantics for numbers (NaN compares false).
export const gt = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a > b : cmp(a, b) > 0);
export const gte = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a >= b : cmp(a, b) >= 0);
export const lt = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a < b : cmp(a, b) < 0);
export const lte = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a <= b : cmp(a, b) <= 0);
/** Balatro's `G.GAME.chips - G.GAME.blind.chips >= 0` (exactly that for numbers: inf - inf is NaN). */
export const beats = (chips, need) => (typeof chips === 'number' && typeof need === 'number' ? chips - need >= 0 : cmp(chips, need) >= 0);
export const min = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.min(a, b) : (cmp(a, b) <= 0 ? a : b));
export const max = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.max(a, b) : (cmp(a, b) >= 0 ? a : b));

/** A plain number (+-Infinity past the double range). */
export const toNumber = (x) => (x instanceof Decimal ? x.valueOf() : typeof x === 'string' ? (+from(x)) : +x);
/** JSON form: Decimals as their "<m>e<e>" string, everything else unchanged. */
export const toJSONValue = (x) => (x instanceof Decimal ? x.toJSON() : x);
/** Parse a value back: number | Decimal | "<m>e<e>" string (e may itself be "1e+43") -> number | Decimal. */
export function from(x) {
  if (x instanceof Decimal || typeof x === 'number') return x;
  if (typeof x !== 'string') return x == null ? 0 : +x;
  const s = x.trim();
  const i = s.search(/e/i);
  if (i < 0) return Number(s);
  const m = Number(s.slice(0, i)), e = Number(s.slice(i + 1));
  if (s.slice(0, i) === '' || m !== m || e !== e) return NaN;
  if (!isFinite(e)) return m === 0 ? 0 : e > 0 ? m * Infinity : 0;
  if (Number.isInteger(e) || Math.abs(e) > 1e15) return norm(m, Math.floor(e));
  return Number(s);
}
/** Does this value (number | Decimal | string) look like a number the board should format? */
export const isNumeric = (x) => typeof x === 'number' || x instanceof Decimal || (typeof x === 'string' && /^\s*-?\d+(\.\d+)?(e[+-]?[\d.]+(e\+?\d+)?)?\s*$/i.test(x));

/** Balatro-style text for a Decimal: "1.234e450" (a huge exponent shortens too: "1.000e1.234e43"). */
export function formatBig(d) {
  let r = Math.round(Math.abs(d.m) * 1000) / 1000, e = d.e;
  if (r >= 10) { r /= 10; e += 1; }
  const es = Math.abs(e) < 1e11 ? String(e) : (() => { const k = Math.floor(Math.log10(Math.abs(e))); return (e / Math.pow(10, k)).toFixed(3) + 'e' + k; })();
  return (d.m < 0 ? '-' : '') + r.toFixed(3) + 'e' + es;
}
