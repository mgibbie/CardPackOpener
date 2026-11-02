// refusedlog.js — a quiet log of the actions the engine REFUSED, for testing.
//
// The run recipe only records actions that succeeded, so a refused attempt (and its toast, "Can't use that right
// now") left no trace: a tester's "the Tarot forces the listed amount" could not be checked against what they
// actually tried. Every refusal the controller (ui/main.js onAction) sees is described here and sent, batched, to the
// account: POST /api/mp {action:'micatro-refused', entries:[...]} -> the row refused:<user>:<YYYYMMDD> (server/mp.mjs).
//
// It must never affect the game: describeRefusal only READS the engine (no RNG, no state change, no view rebuild),
// the recipe / replays are untouched, nothing is shown, and every failure is swallowed. Signed out: nothing is kept.
// Plain module (no DOM, no imports) so the node suites can drive it: micatro/tests/refusedlog_test.mjs.

export const REFUSED_FLUSH_MS = 30_000;   // at most one send per 30 s (plus one on page hide)
export const REFUSED_MIN_DELAY_MS = 2_000; // a burst of refusals goes in one send
export const REFUSED_DAY_CAP = 200;        // entries per UTC day from this browser (the server keeps the last 200 too)
export const REFUSED_BATCH_MAX = 50;       // entries per send (the server's cap); more pending than this are dropped
export const REFUSED_COALESCE_MS = 5_000;  // the same refusal again within this long bumps `n` instead of a new entry
const STORE_KEY = 'micatro_refused_sent_v1';

// the engine areas a refused card can be in (G[name].cards)
const AREAS = ['consumeables', 'pack_cards', 'jokers', 'hand', 'shop_jokers', 'shop_vouchers', 'shop_booster', 'deck', 'discard'];

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : undefined; };
const str = (v, n) => (v == null ? undefined : String(v).slice(0, n));

/**
 * Describe one refusal. `a` the action, `r` the engine's result ({ok:false, error}), `G` the engine's globals (read
 * only), ctx: {runId, view (the last view drawn), ver (the rules the run plays on), now}. Never throws.
 */
export function describeRefusal(a, r, G, ctx = {}) {
  ctx = ctx || {};
  const e = { ts: ctx.now != null ? ctx.now : Date.now() };
  try {
    a = a || {};
    e.action = str(a.type, 40) || '?';
    e.reason = str((r && r.error) || 'refused', 120);
    if (ctx.runId) e.runId = str(ctx.runId, 64);
    const view = ctx.view || null;
    if (view && view.state) e.state = str(view.state, 32);
    const GAME = G && G.GAME;
    if (G && G.STATE != null) e.stateId = num(G.STATE);
    if (GAME) {
      e.ante = num(GAME.round_resets && GAME.round_resets.ante);
      e.round = num(GAME.round);
      e.dollars = num(GAME.dollars);
    }
    const hl = G && G.hand && G.hand.highlighted;
    if (hl) e.hl = hl.length;
    if (Array.isArray(a.targets)) e.targets = a.targets.length;
    if (a.use) e.use = true;
    if (a.id != null) {
      e.id = num(a.id);
      // the card's key + area: from the view (what the player saw), else from the engine
      for (const [area, list] of Object.entries((view && view.areas) || {})) {
        const c = Array.isArray(list) ? list.find((x) => x && x.id === a.id) : null;
        if (c) { e.card = str(c.center, 64); e.area = str(area, 32); break; }
      }
      const c = findCard(G, a.id);
      if (c) {
        if (!e.card && c.config && c.config.center) e.card = str(c.config.center.key, 64);
        if (!e.area) e.area = c._areaName;
        const cons = c.card && c.card.ability && c.card.ability.consumeable;
        if (cons && typeof cons === 'object') {
          if (cons.max_highlighted != null) e.max = num(cons.max_highlighted);
          if (cons.min_highlighted != null) e.min = num(cons.min_highlighted);
          if (cons.mod_num != null) e.modNum = num(cons.mod_num);
        }
      }
    }
    if (ctx.ver) e.ver = str(ctx.ver, 200);
  } catch (err) { /* a half-filled entry is still worth keeping */ }
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return e;
}

/** The engine card with this sort_id (+ its area's name), read only. */
function findCard(G, id) {
  if (!G || id == null) return null;
  for (const name of AREAS) {
    const area = G[name];
    const cards = area && area.cards;
    if (!Array.isArray(cards)) continue;
    for (const c of cards) if (c && c.sort_id === id) return { card: c, config: c.config, _areaName: name };
  }
  return null;
}

/** The rules a run plays on, as one short string: "e<engineRev> mod@pin,...". */
export function rulesOf(recipe) {
  try {
    if (!recipe) return '';
    const mods = recipe.modVersions && typeof recipe.modVersions === 'object' ? Object.entries(recipe.modVersions).map(([k, v]) => k + '@' + v) : (recipe.mods || []);
    return ('e' + (recipe.engineRev != null ? recipe.engineRev : '?') + (mods.length ? ' ' + mods.join(',') : '')).slice(0, 200);
  } catch (e) { return ''; }
}

const utcDay = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

/**
 * The batching recorder. send(entries, {keepalive}) -> Promise (the network call; its failures are swallowed).
 * enabled() -> whether to keep anything (signed in). storage: a localStorage-like object (optional; the day's count
 * survives a reload). Timers are injectable for the tests.
 */
export function createRefusedLog({ send, enabled = () => true, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, storage = null,
  flushMs = REFUSED_FLUSH_MS, minDelayMs = REFUSED_MIN_DELAY_MS, dayCap = REFUSED_DAY_CAP, batchMax = REFUSED_BATCH_MAX, coalesceMs = REFUSED_COALESCE_MS } = {}) {
  let pending = [], timer = null, lastSent = -Infinity, lastAt = -Infinity; // lastAt: when the last pending entry was last seen
  let day = null, count = 0; // entries taken today (this browser)
  const loadCount = (d) => {
    if (day === d) return;
    day = d; count = 0;
    try { const s = storage && JSON.parse(storage.getItem(STORE_KEY) || 'null'); if (s && s.day === d && Number.isFinite(s.n)) count = s.n; } catch (e) {}
  };
  const saveCount = () => { try { if (storage) storage.setItem(STORE_KEY, JSON.stringify({ day, n: count })); } catch (e) {} };
  const same = (x, y) => x.action === y.action && x.card === y.card && x.reason === y.reason && x.state === y.state && x.runId === y.runId && x.hl === y.hl;

  function schedule() {
    if (timer != null || !pending.length) return;
    const wait = Math.max(minDelayMs, lastSent + flushMs - now());
    timer = setTimer(() => { timer = null; flush(); }, wait);
  }
  /** Send what is pending. keepalive: the page is going away (sent now, whatever the throttle). */
  async function flush({ keepalive = false } = {}) {
    if (timer != null) { try { clearTimer(timer); } catch (e) {} timer = null; }
    if (!pending.length) return false;
    let ok = false;
    try { ok = !!enabled(); } catch (e) {}
    const batch = pending.splice(0, batchMax);
    if (!ok) { pending = []; return false; }
    lastSent = now();
    try { await send(batch, { keepalive }); } catch (e) { /* quiet: a lost batch is only a lost log */ }
    if (pending.length) schedule();
    return true;
  }
  return {
    /** Keep one refusal (an entry from describeRefusal). -> whether it was kept (new or coalesced). */
    record(entry) {
      try {
        if (!entry || !enabled()) return false;
        const t = now();
        loadCount(utcDay(t));
        const last = pending[pending.length - 1];
        if (last && same(last, entry) && t - lastAt <= coalesceMs) { last.n = (last.n || 1) + 1; lastAt = t; return true; }
        if (count >= dayCap || pending.length >= batchMax) return false;
        count++; saveCount();
        pending.push(entry); lastAt = t;
        schedule();
        return true;
      } catch (e) { return false; }
    },
    flush,
    get pending() { return pending.slice(); },
    get countToday() { return count; },
  };
}
