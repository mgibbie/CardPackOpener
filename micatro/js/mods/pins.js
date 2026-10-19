// Mod version pins — which version of each mod (and of the engine's rules) a run was played on.
//
// A saved run and a replay are both a RECIPE that re-simulates from its actions (engine/session.js), so a
// change to a mod's behaviour silently changes every old run that is resumed or watched. The recipe now
// records, at the start of the run:
//
//   recipe.modVersions = {modId: pin}   one per ACTIVE mod (requirements included)
//   recipe.engineRev   = ENGINE_CONTENT_REV
//
// A pin is the mod's registered `version`, plus `+r<contentRev>` when the mod declares a `contentRev`
// (registerMod({version, contentRev})). `contentRev` is OUR counter: bump it whenever we change how the
// mod plays — a port fix that changes behaviour, a house rule (Pokermon's Deino "contains", Energy /
// Transformation targeting, Nuzlocke / Monotype) — even when the upstream version is the same.
// ENGINE_CONTENT_REV is the same counter for base-game behaviour (engine/*.js, data/balatro_data.js).
//
// A recipe recorded before pins existed is read as LEGACY_MOD_VERSIONS / LEGACY_ENGINE_REV — the versions
// shipped on PIN_DATE — and that assumption is written into it (`pinAssumed`). Never edit the legacy table.
//
// Before a resume or a replay, pinDiff(recipe) lists what changed: the resume asks (Continue anyway /
// Abandon run) and the replay viewer warns up front ("Recorded with Pokermon 3.2.1; current 3.9.1").
import { MODS } from './registry.js';

/** Base-game behaviour counter. Bump it when an engine change makes old runs play out differently. */
export const ENGINE_CONTENT_REV = 1;
/** The day pins landed: a recipe without pins is assumed to be from these versions. */
export const PIN_DATE = '2026-10-19';
export const LEGACY_ENGINE_REV = 1;
/** Every shipped mod's pin on PIN_DATE. FROZEN — never edit (old recipes are read against it). */
export const LEGACY_MOD_VERSIONS = Object.freeze({
  pokermon: '3.2.1+r1', nacho: '1.6.4', pokermonplus: '1.0.3-251101e', riskofjesters: '1.0.0', sylviesilly: '0.11',
  milatro: '1.1.0', mikas: '0.13.3', olympus: '1.0', inscrybed: '1.0', tagteam: '1.0', smirkeo: '1.0', altavista: '1.0',
  omertadeck: '1.0', morefluff: '1.5.6', betmma: '3.0.2.3', bunco: '5.1', reverie: '1.0 (old-API)', autumnmood: '0.0.0f',
  autumncircus: '0.0.0f',
});

/** A mod's version + contentRev -> its pin ('3.2.1', '3.2.1+r1'). */
export function pinOf(version, contentRev) {
  const v = String(version == null || version === '' ? '0' : version).slice(0, 32);
  const r = Number.isInteger(contentRev) && contentRev > 0 ? contentRev : 0;
  return r ? `${v}+r${r}` : v;
}
/** A pin -> {version, rev}. */
export function parsePin(pin) {
  const m = /^(.*)\+r(\d+)$/.exec(String(pin == null ? '' : pin));
  return m ? { version: m[1], rev: +m[2] } : { version: String(pin == null ? '' : pin), rev: 0 };
}
/** A pin for people: '3.2.1', '3.2.1 (rev 2)'. */
export function pinLabel(pin) {
  if (pin == null) return 'unknown version';
  const p = parsePin(pin);
  return p.rev ? `${p.version} (rev ${p.rev})` : p.version;
}
/** The current pin of a registered mod (null when it isn't registered). */
export function modPin(id) {
  const m = MODS[id];
  return m ? pinOf(m.version, m.contentRev) : null;
}
/** {id: pin} for these (registered) mod ids. */
export function currentPins(ids) {
  const out = {};
  for (const id of ids || []) { const p = modPin(id); if (p != null) out[id] = p; }
  return out;
}
/** Stamp a new recipe with the current pins. */
export function stampRecipe(recipe) {
  recipe.modVersions = currentPins(recipe.mods || []);
  recipe.engineRev = ENGINE_CONTENT_REV;
  return recipe;
}
/** Does this recipe carry its own pins? (else it predates them) */
export const hasPins = (recipe) => !!(recipe && recipe.modVersions && typeof recipe.modVersions === 'object' && !Array.isArray(recipe.modVersions));
/**
 * The pins a recipe was recorded with: its own, or — a recipe from before pins — the legacy table
 * (assumed: true). {modVersions, engineRev, assumed}.
 */
export function recordedPins(recipe) {
  if (hasPins(recipe)) {
    return { modVersions: { ...recipe.modVersions }, engineRev: Number.isInteger(recipe.engineRev) ? recipe.engineRev : LEGACY_ENGINE_REV, assumed: !!recipe.pinAssumed };
  }
  const mv = {};
  for (const id of (recipe && recipe.mods) || []) if (LEGACY_MOD_VERSIONS[id]) mv[id] = LEGACY_MOD_VERSIONS[id];
  return { modVersions: mv, engineRev: Number.isInteger(recipe && recipe.engineRev) ? recipe.engineRev : LEGACY_ENGINE_REV, assumed: true };
}
/** Write the legacy assumption into a recipe that has no pins (so it travels with the save / replay). Returns true if it did. */
export function recordLegacyAssumption(recipe) {
  if (!recipe || hasPins(recipe)) return false;
  const p = recordedPins(recipe);
  recipe.modVersions = p.modVersions;
  recipe.engineRev = p.engineRev;
  recipe.pinAssumed = 'legacy:' + PIN_DATE;
  return true;
}
const modName = (id) => (MODS[id] && MODS[id].name) || String(id);
/**
 * What differs between the recipe's pins and what is loaded now:
 * [{id, name, recorded, current}] (id 'engine' for the engine). Empty = it plays exactly as recorded.
 * A mod the site no longer ships (not registered) is reported with current: null.
 */
export function pinDiff(recipe) {
  const rec = recordedPins(recipe);
  const out = [];
  if (rec.engineRev !== ENGINE_CONTENT_REV) out.push({ id: 'engine', name: 'Micatro', recorded: 'rev ' + rec.engineRev, current: 'rev ' + ENGINE_CONTENT_REV, engine: true });
  const ids = [...new Set([...((recipe && recipe.mods) || []), ...Object.keys(rec.modVersions)])];
  for (const id of ids) {
    const was = rec.modVersions[id] ?? null, now = modPin(id);
    if (was === now) continue;
    if (was == null && now != null && !rec.assumed) continue; // (a mod pulled in later by a requirement: no record to compare)
    out.push({ id, name: modName(id), recorded: was, current: now });
  }
  return out;
}
/** 'Pokermon 3.2.1 → 3.9.1' for each changed mod, joined. */
export function diffText(diff, sep = '; ') {
  return (diff || []).map((d) => d.engine ? `${d.name} engine ${d.recorded} → ${d.current}` : `${d.name} ${pinLabel(d.recorded)} → ${d.current == null ? 'not available' : pinLabel(d.current)}`).join(sep);
}
/** The replay banner: 'Recorded with Pokermon 3.2.1; current 3.9.1. Playback may differ.' */
export function replayWarning(diff) {
  if (!diff || !diff.length) return '';
  const lab = (d, which) => (d.engine ? `${d.name} engine ${d[which]}` : `${d.name} ${d[which] == null ? (which === 'current' ? '(not available)' : '(unknown version)') : pinLabel(d[which])}`);
  // one change: 'Recorded with Pokermon 3.2.1; current 3.9.1.' — several: each side names its mods
  const cur = diff.length === 1 && !diff[0].engine ? (diff[0].current == null ? 'not available' : pinLabel(diff[0].current)) : diff.map((d) => lab(d, 'current')).join(', ');
  return `Recorded with ${diff.map((d) => lab(d, 'recorded')).join(', ')}; current ${cur}. Playback may differ.`;
}
/**
 * "Continue anyway" on a resumed run: the run is rebuilt on the CURRENT rules, so from now on its recipe is
 * pinned to them; the old pins are kept in `repinned` (with the move count at which it switched).
 */
export function repin(recipe, at) {
  const rec = recordedPins(recipe);
  const hist = Array.isArray(recipe.repinned) ? recipe.repinned.slice(-7) : [];
  hist.push({ at: at | 0, from: rec.modVersions, engineRev: rec.engineRev, ...(rec.assumed ? { assumed: true } : {}), when: Date.now() });
  recipe.repinned = hist;
  recipe.modVersions = currentPins(recipe.mods || []);
  recipe.engineRev = ENGINE_CONTENT_REV;
  delete recipe.pinAssumed;
  return recipe;
}
