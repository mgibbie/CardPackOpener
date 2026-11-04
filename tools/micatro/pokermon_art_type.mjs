// pokermon_art_type.mjs — the Pokermon TYPE a card's art shows, read from the pixels of upstream Pokermon 3.9.1's card.
//
// Owner rule (2026-10-28): when a joker's listed type and the type drawn on its card disagree, THE CARD IS RIGHT. Upstream draws
// the type twice on every card: the type icon in the bottom-left corner (leaf, flame, drop, bolt...) and the frame colour. No
// upstream data records a ptype for the species it draws but has no joker for (pokespriteload.lua lists only atlas cells;
// upstream main's pokemon/*.lua has no joker for them either), so the type is read from the art itself.
//
// HOW: template matching on the type icon, trained on the jokers upstream registers (their ptype is upstream's own).
//   * The registered jokers: every Pokermon joker the port registers from upstream's Lua (not the owner's designs, which carry
//     `poke_sprite391` and are what this checks), with one of the 12 POKETYPES, drawn by its 3.9.1 sprite-table cell — 552 cards.
//     Left out, by name (KNOWN_ODD): Sudowoodo's "Tree...?" card (`weird_tree`, upstream draws its Grass disguise but registers
//     it Earth), Unown (a blank swarm card, no icon), MissingNo (ptype 'Bird', not a Pokermon type).
//   * Per type, the per-pixel mode of its cards over the icon corner (logical 71 x 95 px, box ICON_BOX). The MASK is the pixels
//     where every type's cards agree 90%+ (the icon disc itself: the scene behind the corner differs card to card, so it drops
//     out) — about 210 pixels.
//   * A card's type is the template it matches on the most mask pixels; below MIN_SCORE (no icon there) it is null.
// Leave-one-out on the registered cards (each card judged by templates built without it): 552 / 552, the best type winning by
// 0.40+ of the mask every time (validate(); designwiki_pokermon_jokers_test and micatro_pokermon_art_types_test check it).
// The frame colour alone is weaker (Megas and Legendaries share a frame across types), so only the icon decides.
//
//   import { loadArtTyper } from './pokermon_art_type.mjs';
//   const T = await loadArtTyper();  T.typeOfEntry({atlas: 'AtlasJokersBasicNatdex', pos: [12, 22]}) -> {ptype, score, second, margin}
//   node tools/micatro/pokermon_art_type.mjs            prints the validation
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as C from './compose_pokermon_joker_art.mjs';
import { loadModJokers, ROOT } from './pokermon_missing_jokers.mjs';

export const POKETYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];
export const SPRITE_TABLE = path.join(ROOT, 'tools/micatro/specs/pokermon_391_sprite_table.json');
/** The bottom-left type-icon corner, logical px [x0, y0, x1, y1] inclusive. */
export const ICON_BOX = [0, 68, 26, 94];
/** A mask pixel: every type's cards agree on it this often. */
export const AGREE = 0.9;
/** Below this share of the mask matched, the card shows no type icon we know. */
export const MIN_SCORE = 0.6;
/** Colour tolerance per channel for a pixel to match its template. */
export const TOL = 32;
/** Registered jokers whose card does not show their registered type (upstream's own choices, left out of training). */
export const KNOWN_ODD = {
  weird_tree: 'Sudowoodo\'s "Tree...?" card draws its Grass disguise; upstream registers it Earth',
  unown: 'the Unown swarm card is blank (no type icon)',
  missingno: 'ptype "Bird" is not a Pokermon type',
};

function findDir(rel) {
  const cands = [path.join(ROOT, rel)];
  if (process.env.MICATRO_MAIN) cands.push(path.join(process.env.MICATRO_MAIN, rel));
  const parts = ROOT.split(path.sep), wt = parts.lastIndexOf('.worktrees');
  if (wt > 0) cands.push(path.join(parts.slice(0, wt).join(path.sep), rel));
  return cands.find((d) => fs.existsSync(d)) || cands[0];
}
const PX = [];
for (let y = ICON_BOX[1]; y <= ICON_BOX[3]; y++) for (let x = ICON_BOX[0]; x <= ICON_BOX[2]; x++) PX.push(y * C.LW + x);

/** A 3.9.1 cell as a logical card: entry {atlas: 'AtlasJokersBasicNatdex', pos: [x, y] | {x, y}}. The base card (the icon is on it, not on a soul). */
export function cellOfEntry(assets, e) {
  const pos = Array.isArray(e.pos) ? e.pos : [e.pos.x, e.pos.y];
  return C.cellOf(C.loadSheet(assets, String(e.atlas).replace(/^(poke_)?AtlasJokersBasic/, '').replace(/391$/, '')), pos[0], pos[1]);
}

/** Templates from a training set [{ptype, cell}] (minus `self`, for leave-one-out). */
function templatesOf(counts, n, self) {
  const T = {};
  for (const t of POKETYPES) {
    if (!n[t]) continue;
    const N = n[t] - (self && self.ptype === t ? 1 : 0);
    T[t] = PX.map((p, i) => {
      let best = 0, bc = 0;
      for (const [v, c0] of counts[t][i]) { const c = c0 - (self && self.ptype === t && self.cell[p] === v ? 1 : 0); if (c > bc) { bc = c; best = v; } }
      return [best, N ? bc / N : 0];
    });
  }
  const types = Object.keys(T);
  const mask = PX.map((p, i) => types.every((t) => T[t][i][1] >= AGREE));
  return { T, mask, size: mask.filter(Boolean).length };
}
/** Two packed RGBA pixels within TOL on every channel (upstream re-tints some sheets' frames a shade: Trapinch's orange). */
const near = (a, b) => { if (a === b) return true; for (let k = 0; k < 32; k += 8) if (Math.abs(((a >>> k) & 255) - ((b >>> k) & 255)) > TOL) return false; return true; };
function classify(tm, cell) {
  if (!cell) return null;
  const s = Object.entries(tm.T).map(([t, tpl]) => {
    let hit = 0;
    PX.forEach((p, i) => { if (tm.mask[i] && near(cell[p], tpl[i][0])) hit++; });
    return [t, hit / tm.size];
  }).sort((a, b) => b[1] - a[1] || POKETYPES.indexOf(a[0]) - POKETYPES.indexOf(b[0]));
  const [best, second] = s;
  return { ptype: best[1] >= MIN_SCORE ? best[0] : null, score: best[1], second: second[1], runnerUp: second[0], margin: best[1] - second[1] };
}

/** The detector: { typeOfCell(cell), typeOfEntry(entry), training: [{name, ptype, cell}], validate(), mask size }. */
export async function loadArtTyper(opts = {}) {
  const assets = opts.assets || findDir('micatro/mods/pokermon/assets/2x/Basic Series');
  const table = opts.table || JSON.parse(fs.readFileSync(SPRITE_TABLE, 'utf8')).sprites;
  const jokers = opts.jokers || await loadModJokers();
  const training = [];
  for (const j of jokers) {
    if (j.mod !== 'pokermon' || j.design || KNOWN_ODD[j.name] || !POKETYPES.includes(j.ptype)) continue;
    const e = table[j.name];
    if (!e) continue;
    let cell = null;
    try { cell = cellOfEntry(assets, e); } catch { cell = null; }
    if (cell) training.push({ name: j.name, ptype: j.ptype, stage: j.stage, cell, at: `${e.atlas} ${e.pos.join(',')}` });
  }
  const counts = Object.fromEntries(POKETYPES.map((t) => [t, PX.map(() => new Map())]));
  const n = {};
  for (const r of training) {
    n[r.ptype] = (n[r.ptype] || 0) + 1;
    PX.forEach((p, i) => { const m = counts[r.ptype][i]; m.set(r.cell[p], (m.get(r.cell[p]) || 0) + 1); });
  }
  const full = templatesOf(counts, n, null);
  const typeOfCell = (cell) => classify(full, cell);
  return {
    assets, table, training, maskSize: full.size,
    typeOfCell,
    typeOfEntry: (e) => { let cell = null; try { cell = cellOfEntry(assets, e); } catch { cell = null; } return typeOfCell(cell); },
    /** Leave-one-out over the training cards: { ok, total, minMargin, wrong: [{name, ptype, got}] }. */
    validate() {
      let ok = 0, minMargin = Infinity;
      const wrong = [];
      for (const r of training) {
        const got = classify(templatesOf(counts, n, r), r.cell);
        if (got && got.ptype === r.ptype) { ok++; minMargin = Math.min(minMargin, got.margin); } else wrong.push({ name: r.name, ptype: r.ptype, got: got && got.ptype });
      }
      return { ok, total: training.length, minMargin, wrong };
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const T = await loadArtTyper();
  const v = T.validate();
  console.log(`training: ${T.training.length} registered Pokermon jokers; mask ${T.maskSize} px`);
  console.log(`leave-one-out: ${v.ok} / ${v.total} (min margin ${v.minMargin.toFixed(3)})` + (v.wrong.length ? '; wrong: ' + v.wrong.map((w) => `${w.name} ${w.ptype}->${w.got}`).join(', ') : ''));
}
