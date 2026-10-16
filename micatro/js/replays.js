// replays.js — Micatro run replays: the local list of finished runs, the packed share format, and
// the replay's display meta. A replay is ALWAYS a whole run (start to game over / win / the end of
// Endless), never a single round: it is the run's recipe {v, seed, back, stake, mods, modOptions,
// customDeck?, actions, started} (engine/session.js), which the viewer re-simulates.
//
//   localStorage `micatro_replays_v1` = [{id, serverId?, recipe, meta, when}]  (newest first, <= 10)
//   share code  = 'G1.' + base64url(gzip(JSON(recipe)))  ('R1.' raw fallback) — the same format as
//                 battlecards/codec.js packString, so the server validates both alike
//   server rows = `mreplay:<8 hex>` = {code, meta, by, when}  (micatro-replay-put / -get, 30-day GC)
//
// Nothing here may break the game or the live run save: every storage call is wrapped, and a full
// storage evicts the oldest replays (never the live run, `micatro_run_v1`).
import { viewChecksum } from './engine/session.js';

export const STORE_KEY = 'micatro_replays_v1';
export const LOCAL_MAX = 10;
const STORE_MAX_CHARS = 1_500_000;    // keep the list well under a 5 MB origin quota
export const ACTIONS_MAX = 20_000;    // the server's cap (MICATRO_REPLAY_ACTIONS)
export const PACKED_MAX = 300_000;    // the server's cap (MICATRO_REPLAY_MAX)

// ------------------------------------------------------------------ packing
const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
async function stream(bytes, mode) {
  const cs = mode === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}
export async function pack(str) {
  const bytes = new TextEncoder().encode(str);
  if (typeof CompressionStream !== 'undefined') {
    try { return 'G1.' + b64url(await stream(bytes, 'gzip')); } catch (e) { /* fall through */ }
  }
  return 'R1.' + b64url(bytes);
}
export async function unpack(code) {
  try {
    code = String(code || '').trim();
    if (code.startsWith('G1.')) return new TextDecoder().decode(await stream(fromB64url(code.slice(3)), 'gunzip'));
    if (code.startsWith('R1.')) return new TextDecoder().decode(fromB64url(code.slice(3)));
  } catch (e) { /* malformed */ }
  return null;
}

/** A plausible run recipe (what the viewer can re-simulate). */
export function validRecipe(r) {
  return !!r && typeof r === 'object' && typeof r.v === 'number' && typeof r.seed === 'string' && r.seed.length > 0 &&
    Array.isArray(r.actions) && r.actions.length <= ACTIONS_MAX && r.actions.every((a) => a && typeof a === 'object' && typeof a.type === 'string');
}
export const packRecipe = (recipe) => pack(JSON.stringify(recipe));
export async function unpackRecipe(code) {
  const s = await unpack(code);
  if (!s) return null;
  try { const r = JSON.parse(s); return validRecipe(r) ? r : null; } catch (e) { return null; }
}

// ------------------------------------------------------------------ meta
/** The run's best hand as JSON (a Decimal travels as its "1.234e450" text; Infinity is naneinf). */
export function scoreOf(view) {
  let x = view && view.stats ? view.stats.best_hand : 0;
  if (x && typeof x === 'object' && typeof x.toJSON === 'function') x = x.toJSON();
  if (typeof x === 'number') return Number.isFinite(x) ? Math.max(0, x) : (x > 0 ? 'naneinf' : 0);
  return typeof x === 'string' ? x : 0;
}
/** Display meta for a finished run's replay (also what the viewer checks the re-simulation against). */
export function buildMeta(recipe, view, { username = null, engineVersion = recipe && recipe.v } = {}) {
  const v = view || {};
  return {
    score: scoreOf(v), handName: (v.stats && v.stats.best_hand_name) || '',
    ante: v.ante | 0, round: v.round | 0, won: !!v.won, endless: !!v.endless,
    back: (recipe && recipe.back) || v.back || '', stake: recipe && recipe.stake != null ? recipe.stake : v.stake,
    mods: (recipe && recipe.mods) || [], customDeck: recipe && recipe.customDeck ? String(recipe.customDeck.name || 'Custom Deck') : '',
    seed: (recipe && recipe.seed) || v.seed || '',
    actions: recipe && recipe.actions ? recipe.actions.length : 0,
    finalSeq: v.seq | 0, checksum: viewChecksum(v),
    engineVersion: engineVersion | 0,
    username: username || null,
    started: (recipe && recipe.started) || 0,
  };
}

/** A run's local replay id: stable for the whole run, so a win's replay is extended (not duplicated)
 *  when the player continues into Endless. */
export function localId(recipe) {
  const t = Math.max(0, Math.floor(+(recipe && recipe.started) || 0)).toString(36);
  let h = 0;
  for (const ch of String((recipe && recipe.seed) || '')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return 'L' + t + h.toString(36);
}

// ------------------------------------------------------------------ local list
function read() {
  try {
    const a = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(a) ? a.filter((e) => e && typeof e.id === 'string' && e.recipe && e.meta) : [];
  } catch (e) { return []; }
}
/** Write the list; on a quota error (or when it is too big) drop the oldest until it fits. */
function write(list) {
  list = list.slice(0, LOCAL_MAX);
  while (list.length) {
    let s;
    try { s = JSON.stringify(list); } catch (e) { return false; }
    if (s.length <= STORE_MAX_CHARS || list.length === 1) {
      try { localStorage.setItem(STORE_KEY, s); return true; } catch (e) { /* quota: evict below */ }
    }
    if (list.length === 1) break;
    list = list.slice(0, -1);
  }
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  return false;
}
export const list = () => read();
export const get = (id) => read().find((e) => e.id === id) || null;
/** Save (or extend) a finished run's replay. Returns the entry, or null if storage refused it. */
export function save(recipe, meta) {
  try {
    if (!validRecipe(recipe)) return null;
    const id = localId(recipe);
    const all = read();
    const prev = all.find((e) => e.id === id);
    const entry = { id, serverId: prev ? prev.serverId || null : null, recipe: JSON.parse(JSON.stringify(recipe)), meta, when: Date.now() };
    const ok = write([entry, ...all.filter((e) => e.id !== id)]);
    return ok && read().some((e) => e.id === id) ? entry : null;
  } catch (e) { return null; }
}
export function setServerId(id, serverId) {
  try {
    const all = read();
    const e = all.find((x) => x.id === id);
    if (!e) return false;
    e.serverId = serverId;
    return write(all);
  } catch (e) { return false; }
}
export function remove(id) {
  try { return write(read().filter((e) => e.id !== id)); } catch (e) { return false; }
}

/** Where a replay is watched: a server id, or a local one. */
export const watchUrl = (id, { local = false } = {}) => '/micatro/?replay=' + (local ? 'local:' : '') + encodeURIComponent(id);
export const shareUrl = (serverId, origin = (typeof location !== 'undefined' ? location.origin : '')) => origin + '/mr/' + serverId;
export const SERVER_ID = /^[a-f0-9]{8,20}$/;
