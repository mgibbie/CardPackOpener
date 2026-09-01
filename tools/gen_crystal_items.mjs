// gen_crystal_items.mjs — JohKanto and Johto had NO overworld items at all.
//
// Not "few". Zero item balls and zero hidden items across 373 maps, while Kanto
// has 178 and 182 and Hoenn 222 and 113. Two separate causes, both invisible:
//
//   ITEM BALLS exist in the map data — 180 of them — but items.js looks for a
//   graphics_id containing `ITEM_BALL` and Crystal's is `OBJ_EVENT_GFX_POKE_BALL`,
//   so loadForMap walked straight past every one. Their script form differs too:
//   FireRed writes `<Map>_EventScript_Item<Name>`, Crystal writes `<Map><Name>`
//   ("RockTunnel1FElixer"), which the ball parser cannot read either. That half is
//   fixed in items.js; no data changes.
//
//   HIDDEN ITEMS were dropped in transpile outright. Our Crystal maps carry 628
//   bg_events and every one is a sign — the 85 `BGEVENT_ITEM` entries never made
//   it. This tool puts them back, reading the coordinates from pokecrystal's own
//   `bg_event x, y, BGEVENT_ITEM, <Label>` lines and the item from the
//   `<Label>: hiddenitem <ITEM>` they point at.
//
// Emitted as `type: 'hidden_item'` with an `ITEM_*` constant, which is the shape
// items.js already parses for Kanto and Hoenn — so nothing new has to understand
// them.
//
//   node tools/gen_crystal_items.mjs           (report)
//   node tools/gen_crystal_items.mjs --write   (apply)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const CRY = path.resolve('../Magepunk66/Reference/pokecrystal/maps');
const D = path.resolve('overworld/data');
const regions = JSON.parse(fs.readFileSync(path.resolve('overworld/map_regions.json'), 'utf8'));

// ---------- read the decomp ----------
// label -> ITEM_ constant, and per map the BGEVENT_ITEM coordinates
const hidden = new Map();          // crystal map stem -> [{x,y,item}]
let declared = 0, unlabelled = [];
for (const f of fs.readdirSync(CRY).filter(x => x.endsWith('.asm'))) {
	const src = fs.readFileSync(path.join(CRY, f), 'utf8');
	if (!/BGEVENT_ITEM/.test(src)) continue;
	// `Route12HiddenElixer:` followed by `hiddenitem ELIXER, EVENT_...`
	const items = new Map();
	for (const m of src.matchAll(/^([A-Za-z0-9_]+):\s*\n\s*hiddenitem\s+([A-Z0-9_]+)/gm)) items.set(m[1], m[2]);
	const rows = [];
	for (const m of src.matchAll(/bg_event\s+(\d+),\s*(\d+),\s*BGEVENT_ITEM,\s*([A-Za-z0-9_]+)/g)) {
		declared++;
		const item = items.get(m[3]);
		if (!item) { unlabelled.push(`${f}:${m[3]}`); continue; }
		rows.push({ x: +m[1], y: +m[2], item: `ITEM_${item}` });
	}
	if (rows.length) hidden.set(f.replace('.asm', ''), rows);
}
console.log(`pokecrystal declares ${declared} hidden items across ${hidden.size} maps`);
if (unlabelled.length) console.log(`  ${unlabelled.length} point at a label with no hiddenitem: ${unlabelled.slice(0, 3).join(', ')}`);

// ---------- match them to our maps ----------
// A Crystal map appears in our data under its own stem (Johto) and, where the
// region was cloned, under a JohKanto-prefixed one. Both get the items: they are
// different places that happen to share a source.
//
// Matched by PROVENANCE, never by name. Crystal's Route12/CeruleanCity/VermilionCity
// and FireRed's share a stem, and Kanto already has its own 182 hidden items from
// FireRed — a name match put 19 Crystal items into Kanto maps that are not Crystal
// maps at all. `_crystal_tileset` is the only honest test, and this is the third
// time this collision has bitten in this codebase.
const isCrystalMap = stem => {
	const p = path.join(D, 'maps', `${stem}_map.json`);
	if (!fs.existsSync(p)) return false;
	try { return !!JSON.parse(fs.readFileSync(p, 'utf8'))._crystal_tileset; } catch { return false; }
};
const targets = new Map();         // our map file stem -> rows
for (const [stem, rows] of hidden) {
	for (const cand of [stem, 'JohKanto' + stem]) {
		if (isCrystalMap(cand)) targets.set(cand, rows);
	}
}
const regionOf = {};
for (const [r, list] of Object.entries(regions)) for (const m of list) regionOf[m.name] = r;

let added = 0, already = 0, skipped = 0;
const byRegion = {};
for (const [stem, rows] of targets) {
	const p = path.join(D, 'maps', `${stem}_map.json`);
	const map = JSON.parse(fs.readFileSync(p, 'utf8'));
	map.bg_events = map.bg_events || [];
	let n = 0;
	for (const r of rows) {
		if (map.bg_events.some(b => b.type === 'hidden_item' && +b.x === r.x && +b.y === r.y)) { already++; continue; }
		// a hidden item under a sign would be unreachable through interact()
		if (map.bg_events.some(b => +b.x === r.x && +b.y === r.y)) { skipped++; continue; }
		map.bg_events.push({ type: 'hidden_item', x: r.x, y: r.y, elevation: 3, item: r.item, flag: '0', quantity: 1, underfoot: false });
		n++; added++;
	}
	if (n) byRegion[regionOf[stem] || '?'] = (byRegion[regionOf[stem] || '?'] || 0) + n;
	if (WRITE && n) fs.writeFileSync(p, JSON.stringify(map));
}

console.log(`\nour maps that share those sources: ${targets.size}`);
console.log(`hidden items added:   ${added}`);
console.log(`  already present:    ${already}`);
console.log(`  a sign is already on that tile (skipped): ${skipped}`);
console.log('by region: ' + (Object.entries(byRegion).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'));

if (WRITE) {
	console.log('\nWRITTEN to the Crystal map JSONs');
	console.log('owdata is gitignored — deploy with:');
	console.log('  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
} else {
	console.log('\n(dry run — pass --write to apply)');
}
