// gen_designwiki_pokermon_jokers.mjs — the design wiki's "Pokermon jokers not in the game yet" section
// (designwiki/#/pokermon-jokers): every canonical Pokemon (dex 1-1025) with no joker in Pokermon, Nacho's Pokermon Dip
// or Sonfive's Pokermon+, each with the joker it would be by upstream's conventions (Pokermon type, stage, evolution
// line, rarity / cost guess) and its card art: upstream Pokermon 3.9.1's own card wherever its sprite table draws the species
// (art.source 'upstream'), else a composed one ('composed'; compose_missing_pokermon_jokers.mjs). The ability is left empty: the owner designs it on the wiki (the
// owner-only "Submit design" box files into D1 `owner_todo:jokers`; "do the joker design list" in CLAUDE.md).
//
//   node tools/micatro/gen_designwiki_pokermon_jokers.mjs [--no-art]
//   writes designwiki/data/pokermon_jokers.json, and (unless --no-art) the card art into designwiki/sprites/pokermon_jokers/
//   (live, /designwiki/sprites/* is served by the magepunk-sprites Pages project: deploy the art with the DEPLOY command
//   below, which the JSON also records — that project's production branch is cloudflare-migration, not main).
// Re-run it after a Pokermon / Nacho / Pokermon+ upgrade adds jokers: designwiki_pokermon_jokers_test fails while the
// committed list differs from the mods.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeMissing, MODS, MOD_NAMES, TYPE_TO_PTYPE, STAGE_LABEL, RARITY_LABEL, GENS, ROOT } from './pokermon_missing_jokers.mjs';

export const OUT_JSON = path.join(ROOT, 'designwiki/data/pokermon_jokers.json');
export const ART_DIR = 'sprites/pokermon_jokers/';
export const DEPLOY = 'npx wrangler pages deploy designwiki/sprites --project-name=magepunk-sprites --branch=cloudflare-migration --commit-dirty=true';

/** The wiki data (and, with `art`, the card art written into `out`: default designwiki/sprites/pokermon_jokers/). */
export async function buildData({ art = true, out } = {}) {
  const M = await computeMissing();
  let made = new Map(); // dex -> {source, recipe}
  if (art) {
    const { composeAll } = await import('./compose_missing_pokermon_jokers.mjs');
    const { res } = await composeAll(out ? { out } : {});
    made = new Map(res.map((r) => [r.dex, { source: r.source, recipe: r.recipe }]));
  } else if (fs.existsSync(OUT_JSON)) {
    for (const s of JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')).species || []) if (s.art) made.set(s.dex, { source: s.art.source || null, recipe: s.art.recipe });
  }
  const fileOf = (dex, shiny) => ART_DIR + String(dex).padStart(4, '0') + (shiny ? '_shiny' : '') + '.png';
  const only = (m) => [...M.coverage[m]].filter((d) => MODS.every((o) => o === m || !M.coverage[o].has(d))).length;
  return {
    generated: 'tools/micatro/gen_designwiki_pokermon_jokers.mjs',
    deploy: DEPLOY,
    counts: {
      dex: 1025, covered: M.covered.size, missing: M.missing.length,
      byMod: Object.fromEntries(MODS.map((m) => [m, { name: MOD_NAMES[m], species: M.coverage[m].size, only: only(m) }])),
      byGen: Object.fromEntries(GENS.map((g, i) => [i + 1, M.missing.filter((s) => s.gen === i + 1).length])),
      art: Object.fromEntries(['upstream', 'composed'].map((src) => [src, M.missing.filter((s) => (made.get(s.dex) || {}).source === src).length])),
      artByGen: Object.fromEntries(GENS.map((g, i) => [i + 1, Object.fromEntries(['upstream', 'composed'].map((src) => [src,
        M.missing.filter((s) => s.gen === i + 1 && (made.get(s.dex) || {}).source === src).length]))])),
    },
    conventions: {
      typeToPtype: TYPE_TO_PTYPE,
      flying: 'Flying-primary species take their second type (pure Flying: Colorless)',
      stages: STAGE_LABEL,
      rarities: RARITY_LABEL,
      rarityByStage: M.rarityTable,
    },
    species: M.missing.map((s) => ({
      dex: s.dex, key: s.key, name: s.name, gen: s.gen, types: s.types, ptype: s.ptype, stage: s.stage, stageLabel: s.stageLabel,
      rarity: s.rarity, rarityLabel: s.rarityLabel, cost: s.cost, line: s.line,
      art: { source: (made.get(s.dex) || {}).source || null, normal: fileOf(s.dex, false), shiny: fileOf(s.dex, true), recipe: (made.get(s.dex) || {}).recipe || null },
    })),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const d = await buildData({ art: !process.argv.includes('--no-art') });
  fs.writeFileSync(OUT_JSON, JSON.stringify(d) + '\n');
  const c = d.counts;
  console.log(`${OUT_JSON}: ${c.missing} missing of ${c.dex} (covered ${c.covered}: ` + MODS.map((m) => `${m} ${c.byMod[m].species}`).join(', ') + ')');
  console.log(`art: ${c.art.upstream} upstream, ${c.art.composed} composed; by gen ` + Object.entries(c.artByGen).map(([g, v]) => `${g}: ${v.upstream}/${v.composed}`).join(', '));
  console.log('art deploy: ' + DEPLOY);
}
