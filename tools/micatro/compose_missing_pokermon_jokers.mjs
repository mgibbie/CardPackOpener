// compose_missing_pokermon_jokers.mjs — card art for every canonical Pokemon that has no Pokermon joker yet (the design
// wiki's "Pokermon jokers not in the game yet" section).
//
// UPSTREAM FIRST (owner, 2026-10-27: "upgrade all of that to the 'upstream' art in every instance where it is possible"): Pokermon
// 3.9.1's sprite table (functions/pokespriteload.lua PokemonSprites, snapshot tools/micatro/specs/pokermon_391_sprite_table.json
// from gen_pokermon_391_sprite_table.mjs) draws a finished card for many species it has no joker for yet. Where it has one, the
// wiki card IS that card: the cell the game would draw (the same lookup as `poke_sprite391` / data391.js sprites), cropped
// byte-for-byte from the shipped 3.9.1 sheet (micatro/mods/pokermon/assets/2x/Basic Series/<atlas>-391.png, the Shiny from
// <atlas>Shiny-391.png); a card with a floating soul layer (Legendaries, Ultra Beasts, Paradoxes) gets its soul cell composited
// over it (alpha "over", as the game draws it at rest). A multi-cell entry (Vivillon's patterns...) shows its first cell, as
// data391.js does. A species is matched to its entry by name (the key, else the key and entry name with punctuation dropped:
// tapukoko = tapu_koko). Only where upstream has no entry, or its cell is empty on the sheet, is the card COMPOSED, below.
//
// COMPOSED: owner rule: real joker art, never a placeholder — the PROPER
// Pokermon frame for the card plus the Pokemon's battle sprite from the overworld battle system (the file battle.js
// draws), and a Shiny variant. Built on compose_pokermon_joker_art.mjs (same frame reconstruction, name font, sprite
// scale / placement / outline and battle.js shiny filter); this script picks the frame and the background itself.
//
// How a frame is chosen (all on the 3.9.1 Natdex sheet, AtlasJokersBasicNatdex-391.png, and its Shiny twin; cells are
// taken from the jokers the mods actually register there, so a card's type and stage are its registered ptype / stage):
//   * The FRAME (border colour, type icons, stage ball, name banner) is the per-pixel mode of every card with the same
//     Pokermon type AND stage — upstream's frame is a function of exactly those two (Grass + Stage 1 = the teal frame,
//     leaf icons and Great Ball). With fewer than 3 such cards (Lightning Baby), it is that type's Basic frame with the
//     stage's ball carried over from every card of that stage (the pixels 70%+ of them agree on).
//   * The BACKGROUND (the scene inside the art window) is chosen separately, because upstream picks it per Pokemon: the
//     cards are clustered by their art windows (same scene, same dither phase), and the species takes the scene of its
//     nearest evolution relative that has a card, else the scene most used by cards of its own Pokemon type (Flying ->
//     sky, Water -> sea...), and the window is the per-pixel mode of that whole cluster.
//   * LEGENDARY cards (upstream draws the Pokemon on a separate floating layer over an empty rainbow card) take the empty
//     rainbow card — the mode of the Legendary cards with the same mark, L (legendary) or M (mythical) — with the type
//     icons of a Legendary card of the same type, or, for a type that has none yet, the icon pixels of that type's Basic
//     frame (the pixels where Legendary and Basic icons coincide for the types that have both). The name starts after
//     the L / M mark, as upstream's do. The sprite is composited onto that card (the wiki shows one picture).
//   * Long names are set with no letter gap (upstream's banner is 50 px wide); accents are dropped (Flabebe).
//
//   node tools/micatro/compose_missing_pokermon_jokers.mjs [--out designwiki/sprites/pokermon_jokers] [--only 293,294]
//   writes <out>/<dex4>.png and <out>/<dex4>_shiny.png (142 x 190 RGBA: upstream's card, else composed), and prints a summary. Deterministic: the same
//   inputs give byte-identical files (designwiki_pokermon_jokers_test re-composes them and compares).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as C from './compose_pokermon_joker_art.mjs';
import { computeMissing, ROOT, STAGE_LABEL } from './pokermon_missing_jokers.mjs';

export const SHEET = 'Natdex', ATLAS = 'poke_AtlasJokersBasicNatdex391';
export const OUT_DEFAULT = path.join(ROOT, 'designwiki/sprites/pokermon_jokers');
export const SPRITE_TABLE = path.join(ROOT, 'tools/micatro/specs/pokermon_391_sprite_table.json');
/** Opaque pixels a cell needs (of 142 x 190 = 26980; a whole card with its rounded corners is ~25400+) to count as drawn. */
export const MIN_OPAQUE = 20000;
/** Mythical species (Showdown's "Mythical" tag): their Legendary cards carry upstream's M mark instead of the L. */
export const MYTHICAL = new Set([151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]);
const MIN_CLUSTER = 5, SIM = 0.3, BALL_AGREE = 0.7;
// furniture boxes (logical 71 x 95 px, inclusive): the stage balls, and the type icons
const BALL_BOXES = [[2, 2, 16, 17], [58, 81, 68, 91]];
const ICON_BOXES = [[2, 71, 23, 93], [60, 0, 70, 10]];
const inBoxes = (boxes, x, y) => boxes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
const N = C.LW * C.LH;
const ART_PX = [];
for (let p = 0; p < N; p++) if (C.inArt(p % C.LW, (p / C.LW) | 0)) ART_PX.push(p);
// the corners of the art window that the stage ball / type icon overlap (C.inArt leaves them out): only the ball and
// icon pixels there belong to the frame; the rest is scene (furnitureMask decides which)
const CORNER_PX = [];
for (let p = 0; p < N; p++) { const x = p % C.LW, y = (p / C.LW) | 0; if (x >= C.ART.x0 && x <= C.ART.x1 && y >= C.ART.y0 && y <= C.ART.y1 && !C.inArt(x, y)) CORNER_PX.push(p); }

function findDir(rel) {
  const cands = [path.join(ROOT, rel)];
  if (process.env.MICATRO_MAIN) cands.push(path.join(process.env.MICATRO_MAIN, rel));
  const parts = ROOT.split(path.sep), wt = parts.lastIndexOf('.worktrees');
  if (wt > 0) cands.push(path.join(parts.slice(0, wt).join(path.sep), rel));
  return cands.find((d) => fs.existsSync(d)) || cands[0];
}
const mode = (vals) => { const m = new Map(); let best = vals[0], bc = 0; for (const v of vals) { const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } } return [best, bc]; };

/** Frame (+ art window from the same cards) for a set of cells, like compose(): a banner pixel every name covers comes from the frame pool. */
function frameOf(cells, sheet) {
  const first = C.buildFrame(cells, [], []);
  if (!first.stats.unresolved) return first.frame;
  const pool = C.framePool([sheet], first.frame);
  return (pool.length ? C.buildFrame(cells, [], pool) : first).frame;
}

/** Everything the composer needs, built once: the registered cards on the sheet, clusters, frames (lazily). */
export async function loadContext(opts = {}) {
  const M = await computeMissing(opts);
  const assets = opts.assets || findDir('micatro/mods/pokermon/assets/2x/Basic Series');
  const data = opts.data || findDir('overworld/data');
  const sheets = { normal: C.loadSheet(assets, SHEET), shiny: C.loadSheet(assets, SHEET + 'Shiny') };
  const cards = [];
  for (const j of M.jokers) {
    if (j.atlas !== ATLAS || !j.pos || !j.dex) continue;
    let normal, shiny;
    try { normal = C.cellOf(sheets.normal, j.pos.x, j.pos.y); shiny = C.cellOf(sheets.shiny, j.pos.x, j.pos.y); } catch { continue; }
    if (!normal || !shiny) continue;
    const sp = M.species.byDex.get(j.dex);
    cards.push({ key: j.key, name: j.name, dex: j.dex, ptype: j.ptype, stage: j.stage, types: sp ? sp.types : [], cell: { normal, shiny }, at: `${j.pos.x},${j.pos.y}` });
  }
  // ---- background clusters (non-Legendary cards: a Legendary card's window is the empty rainbow) ----
  const scenic = cards.filter((c) => c.stage !== 'Legendary');
  const parent = scenic.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < scenic.length; i++) for (let k = i + 1; k < scenic.length; k++) {
    const a = scenic[i].cell.normal, b = scenic[k].cell.normal;
    let same = 0;
    for (const p of ART_PX) if (a[p] === b[p]) same++;
    if (same >= ART_PX.length * SIM) parent[find(i)] = find(k);
  }
  const clusters = new Map();
  scenic.forEach((c, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(c); c.cluster = r; });
  // ball / icon pixels in the art window's corners: every card of a (type, stage) agrees on them whatever its scene. Judged on
  // the (type, stage) groups whose cards span 3+ scenes, a pixel is furniture when 90%+ of a group agree in most groups.
  const groups = new Map();
  for (const c of scenic) { const g = c.ptype + '/' + c.stage; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  const varied = [...groups.values()].filter((g) => g.length >= 8 && new Set(g.map((c) => c.cluster)).size >= 3);
  const furniture = new Set();
  for (const p of CORNER_PX) {
    let yes = 0;
    for (const g of varied) if (mode(g.map((c) => c.cell.normal[p]))[1] >= g.length * 0.9) yes++;
    if (yes * 2 > varied.length) furniture.add(p);
  }
  const table = opts.table || JSON.parse(fs.readFileSync(SPRITE_TABLE, 'utf8')).sprites;
  const ctx = { M, assets, data, sheets, cards, clusters, furniture, table, cache: new Map() };
  return ctx;
}

const memo = (ctx, key, fn) => { if (!ctx.cache.has(key)) ctx.cache.set(key, fn()); return ctx.cache.get(key); };

/** The non-art frame for (ptype, stage) in one variant: see the header. Returns { frame, how }. */
function plainFrame(ctx, ptype, stage, variant) {
  return memo(ctx, `frame:${ptype}:${stage}:${variant}`, () => {
    const sibs = ctx.cards.filter((c) => c.ptype === ptype && c.stage === stage);
    if (sibs.length >= 3) return { frame: frameOf(sibs.map((c) => c.cell[variant]), ctx.sheets[variant]), how: `${ptype} ${STAGE_LABEL[stage]} frame (mode of ${sibs.length} cards)` };
    // too few cards of this type at this stage: the type's Basic frame + the stage's ball (the pixels most of the stage's cards agree on)
    const base = plainFrame(ctx, ptype, 'Basic', variant).frame.slice();
    const stageCards = ctx.cards.filter((c) => c.stage === stage).map((c) => c.cell[variant]);
    if (stageCards.length < 3) throw new Error(`no ${stage} cards to take the stage ball from`);
    for (let p = 0; p < N; p++) {
      if (!inBoxes(BALL_BOXES, p % C.LW, (p / C.LW) | 0)) continue;
      const [v, c] = mode(stageCards.map((s) => s[p]));
      if (c >= stageCards.length * BALL_AGREE) base[p] = v;
    }
    return { frame: base, how: `${ptype} Basic frame (mode of ${ctx.cards.filter((c) => c.ptype === ptype && c.stage === 'Basic').length} cards) + the ${STAGE_LABEL[stage]} ball of ${stageCards.length} ${STAGE_LABEL[stage]} cards` };
  });
}

/** Left x of the name's first glyph on these cards (17 on ordinary cards; later on a Legendary card, after its mark). */
function nameXOf(cells) {
  const GLYPH = C.GLYPH_RGBA[0] | (C.GLYPH_RGBA[1] << 8) | (C.GLYPH_RGBA[2] << 16) | (C.GLYPH_RGBA[3] << 24);
  const xs = cells.map((s) => {
    let mn = Infinity;
    for (let y = C.NAME.top; y < C.NAME.top + 6; y++) for (let x = C.NAME.zone.x0; x <= C.NAME.zone.x1; x++) if ((s[y * C.LW + x] >>> 0) === (GLYPH >>> 0)) { mn = Math.min(mn, x); break; }
    return mn;
  }).filter(Number.isFinite);
  return xs.length ? mode(xs)[0] : C.NAME.x;
}

/** The empty Legendary card for a species (rainbow window included) and where its name starts. */
function legendaryFrame(ctx, dex, ptype, variant) {
  const myth = MYTHICAL.has(dex);
  return memo(ctx, `legend:${myth}:${ptype}:${variant}`, () => {
    const all = ctx.cards.filter((c) => c.stage === 'Legendary');
    let group = all.filter((c) => MYTHICAL.has(c.dex) === myth);
    if (group.length < 3) group = all;
    const cells = group.map((c) => c.cell[variant]);
    const frame = frameOf(cells, ctx.sheets[variant]).slice();
    // the L / M mark (and its white outline) sits in the name zone left of the name: keep it as every card has it
    const nameX = nameXOf(cells);
    for (let p = 0; p < N; p++) {
      const x = p % C.LW, y = (p / C.LW) | 0;
      if (x < C.NAME.zone.x0 || x >= nameX - 1 || y < C.NAME.zone.y0 || y > C.NAME.zone.y1) continue;
      const [v, c] = mode(cells.map((s) => s[p]));
      if (c >= cells.length * 0.6) frame[p] = v;
    }
    // the type icons: from this type's Legendary cards, else the icon pixels of the type's Basic frame
    const same = ctx.cards.filter((c) => c.stage === 'Legendary' && c.ptype === ptype).map((c) => c.cell[variant]);
    let how;
    if (same.length) {
      for (let p = 0; p < N; p++) if (inBoxes(ICON_BOXES, p % C.LW, (p / C.LW) | 0)) frame[p] = mode(same.map((s) => s[p]))[0];
      how = `${myth ? 'Mythical (M)' : 'Legendary (L)'} card (mode of ${group.length}), ${ptype} icons from ${same.length} ${ptype} Legendary card${same.length > 1 ? 's' : ''}`;
    } else {
      const mask = iconMask(ctx, variant);
      const basic = plainFrame(ctx, ptype, 'Basic', variant).frame;
      for (const p of mask) frame[p] = basic[p];
      how = `${myth ? 'Mythical (M)' : 'Legendary (L)'} card (mode of ${group.length}), ${ptype} icons from the ${ptype} Basic frame`;
    }
    return { frame, nameX, how };
  });
}
/** Icon pixels: where a type's Legendary icons equal its Basic frame's, for at least half the types that have both. */
function iconMask(ctx, variant) {
  return memo(ctx, `iconmask:${variant}`, () => {
    const types = [...new Set(ctx.cards.filter((c) => c.stage === 'Legendary').map((c) => c.ptype))];
    const votes = new Uint8Array(N);
    let n = 0;
    for (const t of types) {
      const leg = ctx.cards.filter((c) => c.stage === 'Legendary' && c.ptype === t).map((c) => c.cell[variant]);
      if (ctx.cards.filter((c) => c.ptype === t && c.stage === 'Basic').length < 3) continue;
      const basic = plainFrame(ctx, t, 'Basic', variant).frame;
      n++;
      for (let p = 0; p < N; p++) if (inBoxes(ICON_BOXES, p % C.LW, (p / C.LW) | 0) && mode(leg.map((s) => s[p]))[0] === basic[p]) votes[p]++;
    }
    const mask = [];
    for (let p = 0; p < N; p++) if (votes[p] * 2 >= n && n) mask.push(p);
    return mask;
  });
}

/** The scene for a species: its nearest carded relative's cluster, else its Pokemon type's favourite. */
export function backgroundFor(ctx, s) {
  const big = [...ctx.clusters.entries()].filter(([, cs]) => cs.length >= MIN_CLUSTER);
  const bigIds = new Set(big.map(([r]) => r));
  const rel = ctx.cards
    .filter((c) => c.cluster !== undefined && bigIds.has(c.cluster) && c.dex !== s.dex && s.line.some((l) => l.dex === c.dex))
    .sort((a, b) => Math.abs(a.dex - s.dex) - Math.abs(b.dex - s.dex) || a.dex - b.dex);
  if (rel.length) return { cluster: rel[0].cluster, why: `the scene of ${rel[0].dex === s.dex ? '' : 'its relative '}${titleOf(rel[0].name)}'s card` };
  let best = null, bs = -1;
  for (const [r, cs] of big) {
    let score = 0;
    for (const c of cs) score += c.types[0] === s.types[0] ? 1 : c.types.some((t) => s.types.includes(t)) ? 0.5 : 0;
    if (score > bs || (score === bs && cs.length > ctx.clusters.get(best).length)) { bs = score; best = r; }
  }
  return { cluster: best, why: `the scene most used by ${s.types[0]}-type cards` };
}
const titleOf = (n) => String(n).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function sceneOf(ctx, cluster, variant) {
  return memo(ctx, `scene:${cluster}:${variant}`, () => C.buildFrame(ctx.clusters.get(cluster).map((c) => c.cell[variant]), [], []).frame);
}

/** The name as the banner font can draw it (accents dropped). */
export const labelOf = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'");
function drawLabel(img, text, x) {
  try { C.drawName(img, text, { x }); }
  catch (e) { if (!/too wide/.test(e.message)) throw e; C.drawName(img, text, { x, gap: 0 }); }
}

/** Compose one species: { normal, shiny } 142 x 190 RGBA buffers + how the card was made. */
export function composeSpecies(ctx, s) {
  const spriteFile = path.join(ctx.data, 'pokemon', s.sprite);
  const spr0 = C.loadSprite(spriteFile, 128);
  const k = C.pickScale(spr0.w, spr0.h);
  const out = { recipe: {} };
  const bg = s.stage === 'Legendary' ? null : backgroundFor(ctx, s);
  for (const variant of ['normal', 'shiny']) {
    let img, nameX = C.NAME.x, how;
    if (s.stage === 'Legendary') {
      const L = legendaryFrame(ctx, s.dex, s.ptype, variant);
      img = L.frame.slice(); nameX = L.nameX; how = L.how;
    } else {
      const F = plainFrame(ctx, s.ptype, s.stage, variant);
      img = F.frame.slice(); how = F.how;
      const scene = sceneOf(ctx, bg.cluster, variant);
      for (const p of ART_PX) img[p] = scene[p];
      for (const p of CORNER_PX) if (!ctx.furniture.has(p)) img[p] = scene[p];
    }
    drawLabel(img, labelOf(s.name), nameX);
    let spr = C.scaleNearest(spr0, k);
    if (variant === 'shiny') spr = { ...spr, rgba: C.hueRotateSaturate(spr.rgba) };
    const before = img.slice();
    C.placeSprite(img, spr, 128, true);
    let painted = 0;
    for (let p = 0; p < N; p++) if (img[p] !== before[p]) painted++;
    out[variant] = C.toPhysical(img);
    out[variant + 'Painted'] = painted; // (logical pixels the sprite changed: the test checks no card is sprite-less)
    if (variant === 'normal') out.recipe = { frame: how, background: bg ? `${bg.why} (mode of ${ctx.clusters.get(bg.cluster).length} cards)` : 'the empty Legendary card (upstream floats the Pokemon over it)', sprite: `${s.sprite} x${k > 0 ? k : '1/' + -k}` };
  }
  return out;
}

// ------------------------------------------------------------ upstream cards
const normName = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
/** The 3.9.1 sprite-table entry for a species ({name, atlas, pos, soul?, multi?}), or null: by key, else by key / name minus punctuation. */
export function upstreamEntry(table, s) {
  let name = table[s.key] ? s.key : null;
  if (!name) {
    const hits = Object.keys(table).filter((n) => normName(n) === normName(s.key));
    if (hits.length === 1) name = hits[0];
  }
  return name ? { name, ...table[name] } : null;
}
/** One 142 x 190 cell of a 3.9.1 sheet, the raw RGBA bytes as shipped. */
export function cropCell(sheet, [cx, cy]) {
  if ((cx + 1) * C.CELL_W > sheet.w || (cy + 1) * C.CELL_H > sheet.h) throw new Error(`cell ${cx},${cy} is outside ${sheet.name}`);
  const out = Buffer.alloc(C.CELL_W * C.CELL_H * 4), row = C.CELL_W * 4;
  for (let y = 0; y < C.CELL_H; y++) { const at = ((cy * C.CELL_H + y) * sheet.w + cx * C.CELL_W) * 4; sheet.rgba.copy(out, y * row, at, at + row); }
  return out;
}
export const opaqueCount = (rgba) => { let n = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) n++; return n; };
/** `top` over `base` (straight alpha, integer maths, deterministic). */
export function overlay(base, top) {
  const out = Buffer.from(base);
  for (let i = 0; i < out.length; i += 4) {
    const ta = top[i + 3];
    if (!ta) continue;
    if (ta === 255) { top.copy(out, i, i, i + 4); continue; }
    const ba = out[i + 3], oa = ta + Math.round(ba * (255 - ta) / 255);
    for (let k = 0; k < 3; k++) out[i + k] = oa ? Math.round((top[i + k] * ta + out[i + k] * ba * (255 - ta) / 255) / oa) : 0;
    out[i + 3] = oa;
  }
  return out;
}
/** A 3.9.1 sheet by its atlas name (AtlasJokersBasicGen06 / ...Shiny). */
const sheetOf = (ctx, atlas) => C.loadSheet(ctx.assets, atlas.replace(/^AtlasJokersBasic/, ''));
/** The upstream card for a species ({ normal, shiny, entry, recipe }), or null when upstream has none (no entry / an empty cell). */
export function upstreamArt(ctx, s) {
  const e = upstreamEntry(ctx.table, s);
  if (!e) return null;
  const out = { entry: e };
  for (const variant of ['normal', 'shiny']) {
    const sheet = sheetOf(ctx, e.atlas + (variant === 'shiny' ? 'Shiny' : ''));
    const base = cropCell(sheet, e.pos);
    if (opaqueCount(base) < MIN_OPAQUE) return null;
    let img = base;
    if (e.soul) {
      const soul = cropCell(sheet, e.soul);
      if (!opaqueCount(soul)) return null;
      img = overlay(base, soul);
    }
    out[variant] = img;
  }
  out.recipe = { upstream: `Pokermon 3.9.1 ${e.atlas}-391.png cell ${e.pos.join(',')}` + (e.soul ? ` + soul ${e.soul.join(',')}` : '')
    + ` (pokespriteload.lua "${e.name}")` + (e.multi ? `; the first of its ${e.multi} cells` : '') };
  return out;
}
/** The wiki card for a species: upstream's where it has one, else composed. { source: 'upstream' | 'composed', normal, shiny, recipe }. */
export function artFor(ctx, s) {
  const up = upstreamArt(ctx, s);
  if (up) return { source: 'upstream', ...up };
  return { source: 'composed', ...composeSpecies(ctx, s) };
}

export const fileOf = (dex, shiny) => String(dex).padStart(4, '0') + (shiny ? '_shiny' : '') + '.png';

/** Write every missing species' card into `out` (upstream's, else composed); returns [{dex, source, recipe}]. */
export async function composeAll({ out = OUT_DEFAULT, only = null, ...opts } = {}) {
  const ctx = await loadContext(opts);
  fs.mkdirSync(out, { recursive: true });
  const res = [];
  for (const s of ctx.M.missing) {
    if (only && !only.has(s.dex)) continue;
    const r = artFor(ctx, s);
    fs.writeFileSync(path.join(out, fileOf(s.dex, false)), C.encode(C.CELL_W, C.CELL_H, r.normal));
    fs.writeFileSync(path.join(out, fileOf(s.dex, true)), C.encode(C.CELL_W, C.CELL_H, r.shiny));
    res.push({ dex: s.dex, source: r.source, recipe: r.recipe });
  }
  // a species that got a joker since the last run: its card goes (only on a full run, and only our own <dex4>[_shiny].png)
  if (!only) {
    const keep = new Set(res.flatMap((r) => [fileOf(r.dex, false), fileOf(r.dex, true)]));
    for (const f of fs.readdirSync(out)) if (/^\d{4}(_shiny)?\.png$/.test(f) && !keep.has(f)) fs.rmSync(path.join(out, f));
  }
  return { ctx, res };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2);
  const arg = (n) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : null; };
  const out = path.resolve(arg('out') || OUT_DEFAULT);
  const only = arg('only') ? new Set(arg('only').split(',').map(Number)) : null;
  const { ctx, res } = await composeAll({ out, only });
  const big = [...ctx.clusters.values()].filter((c) => c.length >= MIN_CLUSTER).length;
  const up = res.filter((r) => r.source === 'upstream').length;
  console.log(`wrote ${res.length} species (${res.length * 2} files) into ${out}: ${up} upstream, ${res.length - up} composed; ${ctx.cards.length} sheet cards, ${ctx.clusters.size} scenes (${big} with ${MIN_CLUSTER}+ cards)`);
}
