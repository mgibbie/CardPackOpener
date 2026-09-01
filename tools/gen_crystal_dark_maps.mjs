// gen_crystal_dark_maps.mjs — FLASH does something in the Crystal regions again.
//
// `HM_FIELD.flash` checks `map.requires_flash`, and ZERO of the 373 Crystal maps
// carry it — the transpile never emitted the flag — so FLASH answered "It's not
// dark enough to need FLASH." everywhere in Gen-2 Kanto and Johto, including
// ROCK TUNNEL, which is the whole reason that region hands you the HM.
//
// Crystal marks a dark map with `PALETTE_DARK` in its header
// (data/maps/maps.asm), not with a flag on the map itself. Thirteen maps: the
// eight Whirl Islands, Silver Cave Room 1, both Dark Cave entrances, and Rock
// Tunnel 1F and B1F.
//
//   node tools/gen_crystal_dark_maps.mjs           (report)
//   node tools/gen_crystal_dark_maps.mjs --write   (apply)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const CRY = path.resolve('../Magepunk66/Reference/pokecrystal/data/maps/maps.asm');
const D = path.resolve('overworld/data');
const regions = JSON.parse(fs.readFileSync(path.resolve('overworld/map_regions.json'), 'utf8'));

const dark = [];
for (const line of fs.readFileSync(CRY, 'utf8').split('\n')) {
	const m = /^\s*map\s+([A-Za-z0-9_]+),.*PALETTE_DARK/.exec(line);
	if (m) dark.push(m[1]);
}
console.log(`pokecrystal marks ${dark.length} maps PALETTE_DARK:`);
console.log('  ' + dark.join(' '));

// Provenance, not name: Crystal's stems collide with FireRed's, and Kanto's own
// dark maps already carry the flag from its own decomp.
const isCrystalMap = stem => {
	const p = path.join(D, 'maps', `${stem}_map.json`);
	if (!fs.existsSync(p)) return false;
	try { return !!JSON.parse(fs.readFileSync(p, 'utf8'))._crystal_tileset; } catch { return false; }
};
const regionOf = {};
for (const [r, list] of Object.entries(regions)) for (const m of list) regionOf[m.name] = r;

let set = 0, already = 0, missing = [];
const byRegion = {};
for (const stem of dark) {
	const targets = [stem, 'JohKanto' + stem].filter(isCrystalMap);
	if (!targets.length) { missing.push(stem); continue; }
	for (const t of targets) {
		const p = path.join(D, 'maps', `${t}_map.json`);
		const map = JSON.parse(fs.readFileSync(p, 'utf8'));
		if (map.requires_flash) { already++; continue; }
		map.requires_flash = true;
		byRegion[regionOf[t] || '?'] = (byRegion[regionOf[t] || '?'] || 0) + 1;
		set++;
		if (WRITE) fs.writeFileSync(p, JSON.stringify(map));
	}
}
console.log(`\nour Crystal maps flagged: ${set}   (already flagged ${already})`);
console.log('by region: ' + (Object.entries(byRegion).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'));
if (missing.length) console.log(`no Crystal map of ours for: ${missing.join(' ')}`);

console.log(WRITE ? '\nWRITTEN — owdata is gitignored, deploy with:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true'
	: '\n(dry run — pass --write to apply)');
