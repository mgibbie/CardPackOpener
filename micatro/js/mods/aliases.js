// Mod key aliases — keep card keys loadable across mod upgrades (Plans/MICATRO_MODS_PLAN.md, "Mod version pins").
//
// When a mod upgrade renames or deletes a key (a joker, blind, tag, deck, stake ...), everything that STORED
// the old key must still load: saved runs and replays (their recipe names a back / stake / sleeve / a custom
// deck's items), the win stickers (`micatro_stickers:<user>`, keyed by joker / deck key) and custom decks
// (`micatrodecks:<user>`). Nothing stored is ever rewritten: the old key is resolved when it is READ.
//
//   renamed: {oldKey: newKey}  the old key means the new one (chains are followed)
//   removed: [keys]            the card is gone: its stickers / records stay stored, and lists show it
//                              greyed out as a "retired card" — it never crashes
//   names:   {key: 'Name'}     (optional) a display name for a removed key (it has no loc entry any more)
//
// An alias only takes effect once the old key is NOT registered any more (resolveKey's `known` check), so a
// rename can be seeded here before the upgrade that performs it lands — it stays dormant until then.
//
// This file has no imports (the win stickers use it on screens where no engine or mod has loaded). A mod
// may also declare `aliases: {renamed, removed, names}` in registerMod; registry.js merges them in here.

/** The per-mod alias tables. Upgrade batches add to these (one entry per renamed / removed key). */
export const MOD_ALIASES = {
  // Pokermon 3.9.1 renamed the Chartreuse Chamber blind (Plans/MICATRO_MODS_UPGRADES.md). Dormant until the
  // 3.9.1 data batch registers bl_poke_iridescent_hacker and drops bl_poke_cgoose.
  pokermon: { renamed: { bl_poke_cgoose: 'bl_poke_iridescent_hacker' }, removed: [], names: {} },
  // More Fluff 1.9.9999: 12 jokers retire upstream and 2 are deleted — filled in by that port.
  morefluff: { renamed: {}, removed: [], names: {} },
};

const KEY_RE = /^[A-Za-z0-9_]{1,64}$/;
let RENAMED = Object.create(null);   // old -> new (all mods)
let REMOVED = new Map();             // key -> mod id
let NAMES = Object.create(null);
let INVERSE = Object.create(null);   // new -> [old, ...] (direct and transitive)

function rebuild() {
  RENAMED = Object.create(null); REMOVED = new Map(); NAMES = Object.create(null); INVERSE = Object.create(null);
  for (const [mod, t] of Object.entries(MOD_ALIASES)) {
    if (!t) continue;
    for (const [o, n] of Object.entries(t.renamed || {})) if (KEY_RE.test(o) && KEY_RE.test(n) && o !== n) RENAMED[o] = n;
    for (const k of t.removed || []) if (KEY_RE.test(k)) REMOVED.set(k, mod);
    for (const [k, v] of Object.entries(t.names || {})) if (KEY_RE.test(k) && typeof v === 'string') NAMES[k] = v;
  }
  for (const o of Object.keys(RENAMED)) {
    const end = follow(o);
    if (end !== o) (INVERSE[end] || (INVERSE[end] = [])).push(o);
  }
}
/** The end of an old key's rename chain (no `known` check). */
function follow(key) {
  let k = key;
  for (let i = 0; i < 8 && RENAMED[k] && RENAMED[k] !== key; i++) k = RENAMED[k];
  return k;
}

/** Add (merge) a mod's aliases: {renamed, removed, names}. registerMod calls this for `mod.aliases`. */
export function addAliases(modId, t) {
  if (!modId || !t || typeof t !== 'object') return;
  const cur = MOD_ALIASES[modId] || (MOD_ALIASES[modId] = { renamed: {}, removed: [], names: {} });
  Object.assign(cur.renamed || (cur.renamed = {}), t.renamed || {});
  cur.removed = [...new Set([...(cur.removed || []), ...(Array.isArray(t.removed) ? t.removed : [])])];
  Object.assign(cur.names || (cur.names = {}), t.names || {});
  rebuild();
}

/**
 * A stored key -> the key to use now. A key that is still `known` (registered) is itself; an unknown
 * renamed key follows its rename chain. `known(key)` defaults to "unknown" (always follow).
 */
export function resolveKey(key, known) {
  if (typeof key !== 'string' || !RENAMED[key]) return key;
  if (known && known(key)) return key;
  return follow(key);
}
/** Was this key renamed (whatever `known` says)? */
export const isRenamed = (key) => typeof key === 'string' && !!RENAMED[key];
/** A removed ("retired") card key: it stays stored and listed, greyed out. With `known`, a key still registered is not retired. */
export function isRetired(key, known) {
  if (typeof key !== 'string' || !REMOVED.has(key)) return false;
  return !(known && known(key));
}
/** The old keys that now mean `key` (their stored stickers / records count for it). */
export const aliasesOf = (key) => (typeof key === 'string' && INVERSE[key] ? INVERSE[key].slice() : []);
/** A retired key's display name (its alias table's `names`, else the key made readable). */
export function retiredName(key) {
  if (NAMES[key]) return NAMES[key];
  return String(key || '').replace(/^[a-z]+_/, '').split('_').filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
/** Every retired key (+ its mod). */
export const retiredKeys = () => [...REMOVED.keys()];

// test hook (like pad.js's __owFakePads): extra alias tables injected before boot — {modId: {renamed, removed, names}}
try {
  const extra = typeof globalThis !== 'undefined' && globalThis.__micatroExtraAliases;
  if (extra && typeof extra === 'object') for (const [m, t] of Object.entries(extra)) { const c = MOD_ALIASES[m] || (MOD_ALIASES[m] = { renamed: {}, removed: [], names: {} }); Object.assign(c.renamed, t.renamed || {}); c.removed = [...new Set([...(c.removed || []), ...(t.removed || [])])]; Object.assign(c.names, t.names || {}); }
} catch (e) { /* ignore */ }
rebuild();
