// Nuzlocke / Monotype record + Micatro's achievements (the engine side: mods/pokermon/systems/runbadges.js).
// A Pokermon run that is WON while still a Nuzlocke and/or a Monotype adds to this player's record:
//   {v:1, nuz: Nuzlocke wins, nuzStake: the highest stake won as a Nuzlocke, both: Nuzlocke+Monotype wins,
//    mono: {fire: wins, ...} (the 12 Pokermon types, lowercase), ach: {achievement id: first unlock time}}
// and may unlock an achievement (a toast, and the Achievements screen lists them).
//   * Stored per player in localStorage ('micatro_progress_v1:<user>'), try/catch.
//   * Signed in, it is ACCOUNT-SAVED: micatro-progress-get / -put (server/mp.mjs, row micatro_progress:<user>).
//     The server MERGES each put (counts: max; types + achievements: union) so nothing goes backwards; the
//     client merges the same way (mergeProgress). A guest's record is carried into the account on the first
//     signed-in boot (merged), then the guest copy is cleared.
//   * Only the player's own live run records (never a replay or a spectated run); seeded and challenge runs
//     earn nothing (the engine marks them not eligible, like the win stickers).
export const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];
/** Pokermon's type colours (systems/types.js TYPE_COLOURS) — copied so the board/leaderboard can draw them without the mod loaded. */
export const TYPE_COLOURS = {
  grass: '#289830', fire: '#f81020', water: '#38b8f8', lightning: '#f8f800', psychic: '#c135ff', fighting: '#b85838',
  colorless: '#c8c0f8', dark: '#0086a5', metal: '#888080', fairy: '#ff3db6', dragon: '#c8a800', earth: '#e97333',
};
const DARK_TEXT = new Set(['lightning', 'colorless']);
export const GOLD_STAKE = 8;
export const ACHIEVEMENTS = [
  { id: 'first_nuzlocke', name: 'Nuzlocke', desc: 'Win a Pokermon run as a Nuzlocke: never sell a joker, and gain at most one new joker per shop.' },
  { id: 'first_monotype', name: 'Monotype', desc: 'Win a Pokermon run starting every round with jokers of only one Pokémon type.' },
  { id: 'monotype_all', name: 'Type Master', desc: 'Win a Monotype run with every one of the 12 types.' },
  { id: 'nuzlocke_monotype', name: 'Purist', desc: 'Win a run that is a Nuzlocke and a Monotype at once.' },
  { id: 'nuzlocke_gold', name: 'Golden Nuzlocke', desc: 'Win a Nuzlocke at Gold Stake.' },
];

export const emptyProgress = () => ({ v: 1, nuz: 0, nuzStake: 0, both: 0, mono: {}, ach: {} });
const cnt = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
/** a + b, never backwards (the server's mergeMicatroProgress does the same). */
export function mergeProgress(a, b) {
  a = a || {}; b = b || {};
  const out = emptyProgress();
  for (const k of ['nuz', 'nuzStake', 'both']) out[k] = Math.max(cnt(a[k]), cnt(b[k]));
  for (const t of TYPES) { const k = t.toLowerCase(); const n = Math.max(cnt((a.mono || {})[k]), cnt((b.mono || {})[k])); if (n) out.mono[k] = n; }
  const ids = [...new Set([...Object.keys(a.ach || {}), ...Object.keys(b.ach || {})])].filter((id) => /^[a-z0-9_]{1,32}$/.test(id)).sort().slice(0, 64);
  for (const id of ids) {
    const x = cnt((a.ach || {})[id]), y = cnt((b.ach || {})[id]);
    const ts = x && y ? Math.min(x, y) : x || y;
    if (ts) out.ach[id] = ts;
  }
  return out;
}
const same = (a, b) => JSON.stringify(mergeProgress(a, {})) === JSON.stringify(mergeProgress(b, {}));

let user = 'guest';
let net = null;
let progress = emptyProgress();
let syncing = null;
const listeners = new Set();
const KEY = (u) => 'micatro_progress_v1:' + (u || 'guest');
const readLocal = (u) => { try { const p = JSON.parse(localStorage.getItem(KEY(u)) || 'null'); return p && typeof p === 'object' && !Array.isArray(p) ? mergeProgress(p, {}) : null; } catch (e) { return null; } };
const writeLocal = () => { try { localStorage.setItem(KEY(user), JSON.stringify(progress)); } catch (e) { /* private mode: not remembered */ } };
const bump = () => { for (const cb of listeners) { try { cb(progress); } catch (e) { /* ignore */ } } };

export const getProgress = () => progress;
export function onProgress(cb) { listeners.add(cb); return () => listeners.delete(cb); }
/** Monotype types beaten (capitalised), in TYPES order. */
export const typesBeaten = (p = progress) => TYPES.filter((t) => cnt((p.mono || {})[t.toLowerCase()]) > 0);
export const monoWins = (p = progress) => Object.values(p.mono || {}).reduce((a, n) => a + cnt(n), 0);

/** Load this player's record (+ sync with the account when signed in). netApi: {isLoggedIn, fetchProgress, saveProgress}. */
export function initProgress(username, netApi) {
  user = (username && String(username)) || 'guest';
  net = netApi || null;
  progress = readLocal(user) || emptyProgress();
  bump();
  return sync();
}
const signedIn = () => !!(net && net.isLoggedIn && net.isLoggedIn() && user !== 'guest');
/** Pull the account's record, merge in this device's (and a guest's, once), push back if it grew. */
export function sync() {
  if (!signedIn() || !net.fetchProgress) return Promise.resolve(progress);
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const r = await net.fetchProgress();
      if (!r || r.error) return progress;
      const guest = readLocal('guest');
      const merged = mergeProgress(mergeProgress(r.progress, progress), guest);
      const grew = !same(merged, r.progress);
      progress = merged; writeLocal(); bump();
      if (grew && net.saveProgress) {
        const w = await net.saveProgress(progress);
        if (w && w.progress) { progress = mergeProgress(progress, w.progress); writeLocal(); bump(); }
        if (w && w.ok && guest) { try { localStorage.removeItem(KEY('guest')); } catch (e) { /* ignore */ } }
      } else if (guest) { try { localStorage.removeItem(KEY('guest')); } catch (e) { /* ignore */ } }
      return progress;
    } catch (e) { return progress; } finally { syncing = null; }
  })();
  return syncing;
}
function push() {
  if (!signedIn() || !net.saveProgress) return;
  Promise.resolve(net.saveProgress(progress)).then((w) => { if (w && w.progress) { progress = mergeProgress(progress, w.progress); writeLocal(); bump(); } }).catch(() => {});
}

/** The achievement ids this record has earned (whether or not they are unlocked yet). */
function earnedIds(p) {
  const ids = [];
  if (cnt(p.nuz)) ids.push('first_nuzlocke');
  if (monoWins(p)) ids.push('first_monotype');
  if (typesBeaten(p).length === TYPES.length) ids.push('monotype_all');
  if (cnt(p.both)) ids.push('nuzlocke_monotype');
  if (cnt(p.nuzStake) >= GOLD_STAKE) ids.push('nuzlocke_gold');
  return ids;
}
/**
 * A won run's badges (view.run_badges.earned = {nuz, mono: 'Fire' | null}) at this stake -> the record grows.
 * Returns the achievements this win unlocked (for the toast).
 */
export function recordRunWin(earned, stake, now = Date.now()) {
  if (!earned || (!earned.nuz && !earned.mono)) return [];
  const p = mergeProgress(progress, {});
  const mono = earned.mono && TYPES.includes(earned.mono) ? earned.mono.toLowerCase() : null;
  if (earned.nuz) { p.nuz += 1; p.nuzStake = Math.max(p.nuzStake, Math.min(99, Math.max(1, Math.floor(+stake || 1)))); }
  if (mono) p.mono[mono] = cnt(p.mono[mono]) + 1;
  if (earned.nuz && mono) p.both += 1;
  const unlocked = [];
  for (const id of earnedIds(p)) if (!p.ach[id]) { p.ach[id] = now; unlocked.push(ACHIEVEMENTS.find((a) => a.id === id)); }
  progress = p; writeLocal(); bump(); push();
  return unlocked.filter(Boolean);
}
/** The win stickers' categories for this win (ui/stickers.js): ['win', 'poke'? (Pokermon was on), 'nuz'?, 'mono'?, 'both'?]. */
export function winCategories(earned, pokermon = !!earned) {
  const c = ['win'];
  if (pokermon) c.push('poke');
  if (earned && earned.nuz) c.push('nuz');
  if (earned && earned.mono) c.push('mono');
  if (earned && earned.nuz && earned.mono) c.push('both');
  return c;
}

// ------------------------------------------------------------------ drawing helpers
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (t) => { const s = String(t || ''); return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : ''; };
/** One type's pill colours. */
export function typeStyle(type) {
  const k = String(type || '').toLowerCase();
  const bg = TYPE_COLOURS[k] || '#7a8a8d';
  return `background:${bg};color:${DARK_TEXT.has(k) ? '#2a3436' : '#fff'}`;
}
/** Badge pills for {nuz, mono} (mono: a type name in any case, or true = not locked yet). `short`: Nuz / type only. */
export function badgePills(b, { short = false, cls = '' } = {}) {
  if (!b) return '';
  let out = '';
  if (b.nuz) out += `<span class="rb-pill rb-nuz ${cls}" title="Nuzlocke">${short ? 'Nuz' : 'Nuzlocke'}</span>`;
  if (b.mono) {
    const t = typeof b.mono === 'string' ? cap(b.mono) : '';
    out += `<span class="rb-pill rb-mono ${cls}"${t ? ` style="${typeStyle(t)}"` : ''} title="Monotype${t ? ': ' + esc(t) : ''}">${t ? (short ? esc(t) : 'Monotype: ' + esc(t)) : 'Monotype'}</span>`;
  }
  return out;
}
/** Leaderboard / replay wire form: {nuz:true, mono:'fire'} (only what was earned). */
export function wireBadges(earned) {
  if (!earned) return null;
  const b = {};
  if (earned.nuz) b.nuz = true;
  if (earned.mono && TYPES.includes(earned.mono)) b.mono = earned.mono.toLowerCase();
  return b.nuz || b.mono ? b : null;
}

// ------------------------------------------------------------------ the unlock toast
let toastQ = [], toastBusy = false;
/** Show "Achievement unlocked" toasts (one after another) over everything in `stage`. */
export function achievementToast(stage, list) {
  for (const a of list || []) if (a) toastQ.push(a);
  if (toastBusy || !stage) return;
  const next = () => {
    const a = toastQ.shift();
    if (!a) { toastBusy = false; return; }
    toastBusy = true;
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = `<div class="ach-t-l">Achievement unlocked</div><div class="ach-t-n">${esc(a.name)}</div><div class="ach-t-d">${esc(a.desc)}</div>`;
    stage.appendChild(el);
    setTimeout(() => { el.classList.add('out'); }, 3600);
    setTimeout(() => { el.remove(); next(); }, 4000);
  };
  next();
}
