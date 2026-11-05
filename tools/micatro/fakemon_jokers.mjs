// The overworld's ROM-hack species use unique negative numbers, not National Dex IDs.
// Keep them separate from canonical coverage and use the same card composer as the wiki.
import fs from 'fs';
import path from 'path';
import { ROOT, MODS, ptypeOf, STAGE_LABEL, RARITY_LABEL } from './pokermon_missing_jokers.mjs';

export function listFakemon(M, data = path.join(ROOT, 'overworld/data')) {
  const battle = JSON.parse(fs.readFileSync(path.join(data, 'species_battle.json')));
  const extra = JSON.parse(fs.readFileSync(path.join(data, 'species_extra.json')));
  const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/fakemon_sprites.json')));
  const entries = Object.entries(battle).filter(([, s]) => Number.isInteger(s.num) && s.num < 0);
  const byKey = new Map(entries), parents = new Map(), children = new Map();
  for (const [key] of entries) for (const e of extra[key]?.evos || []) if (byKey.has(e.target)) {
    if (!parents.has(e.target)) parents.set(e.target, key);
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(e.target);
  }
  const covered = new Set(M.jokers.filter(j => MODS.includes(j.mod)).map(j => String(j.name).toLowerCase().replace(/_/g, '')));
  return entries.filter(([key]) => !covered.has(key.replace(/_/g, ''))).map(([key, s]) => {
    let root = key; const seen = new Set();
    while (parents.has(root) && !seen.has(root)) { seen.add(root); root = parents.get(root); }
    const line = [], depth = new Map();
    const walk = (k, d) => { if (depth.has(k)) return; depth.set(k, d); line.push(k); for (const c of children.get(k) || []) walk(c, d + 1); };
    walk(root, 0);
    const stage = ['Basic', 'One', 'Two'][Math.min(2, depth.get(key) || 0)];
    const lineDepth = Math.min(3, Math.max(...depth.values()) + 1);
    const guess = M.rarityTable[stage + '/' + lineDepth] || { rarity: '2', cost: null };
    const rarity = /^\d+$/.test(guess.rarity) ? +guess.rarity : guess.rarity;
    return { dex: s.num, key, name: s.name, gen: 0, types: s.types || [], ptype: ptypeOf(s.types), type_source: 'mapping',
      stage, stageLabel: STAGE_LABEL[stage], rarity, rarityLabel: RARITY_LABEL[rarity] || String(rarity), cost: guess.cost,
      source: sources[key]?.src || 'ransei', sprite: s.sprite,
      line: line.map(k => ({ dex: byKey.get(k).num, name: byKey.get(k).name, joker: null })) };
  }).sort((a, b) => b.dex - a.dex);
}
