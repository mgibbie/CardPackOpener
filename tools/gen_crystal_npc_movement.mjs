// gen_crystal_npc_movement.mjs — restore authentic NPC movement on Crystal maps.
//
// The Crystal map transpile flattened EVERY object_event's movement to
// MOVEMENT_TYPE_WANDER_AROUND. Stationary scene actors (Route 30's battling
// kids and their POKeMON, gym greeters, shopkeepers) became range-0 "wanderers"
// that spin their facing at random, pacers stopped pacing, and free wanderers
// drift into one-tile chokepoints and read as a glitch wall — the "path blocked
// in Johto" report.
//
// This walks every *_map.json carrying the `_crystal_tileset` marker (Johto +
// JohKanto + Crystal one-offs), re-reads the map's pokecrystal source .asm
// (matched via the json's `name` field, which keeps the original camel name),
// and rewrites each object's movement_type/ranges from the real
// SPRITEMOVEDATA_*, mapped onto the pokeemerald-style types npcs.js already
// understands. Objects are matched by index AND verified by (x, y); any
// mismatch is reported and left untouched. Idempotent.
//
//   node tools/gen_crystal_npc_movement.mjs [path-to-pokecrystal/maps]
import fs from 'fs';
import path from 'path';

const MAPS_DIR = 'overworld/data/maps';
const REF = process.argv[2] || 'C:/Users/guide/Desktop/Magepunk66/Reference/pokecrystal/maps';

// SPRITEMOVEDATA_* -> { type, wander } (wander kinds take their radius from the
// two args that follow; npcs.js reads tiles-from-home as movement_range - 1)
const MOVE_MAP = {
	STANDING_DOWN: 'MOVEMENT_TYPE_FACE_DOWN',
	STANDING_UP: 'MOVEMENT_TYPE_FACE_UP',
	STANDING_LEFT: 'MOVEMENT_TYPE_FACE_LEFT',
	STANDING_RIGHT: 'MOVEMENT_TYPE_FACE_RIGHT',
	STILL: 'MOVEMENT_TYPE_FACE_DOWN',
	STRENGTH_BOULDER: 'MOVEMENT_TYPE_FACE_DOWN',
	SMASHABLE_ROCK: 'MOVEMENT_TYPE_FACE_DOWN',
	SUDOWOODO: 'MOVEMENT_TYPE_FACE_DOWN',
	BIGDOLL: 'MOVEMENT_TYPE_FACE_DOWN',
	BIGDOLLSYM: 'MOVEMENT_TYPE_FACE_DOWN',
	SPINRANDOM_SLOW: 'MOVEMENT_TYPE_LOOK_AROUND',
	SPINRANDOM_FAST: 'MOVEMENT_TYPE_LOOK_AROUND',
	SPINCLOCKWISE: 'MOVEMENT_TYPE_LOOK_AROUND',
	SPINCOUNTERCLOCKWISE: 'MOVEMENT_TYPE_LOOK_AROUND',
	WALK_LEFT_RIGHT: 'MOVEMENT_TYPE_WANDER_LEFT_AND_RIGHT',
	WALK_UP_DOWN: 'MOVEMENT_TYPE_WANDER_UP_AND_DOWN',
	WANDER: 'MOVEMENT_TYPE_WANDER_AROUND',
	SWIM_WANDER: 'MOVEMENT_TYPE_WANDER_AROUND',
	POKEMON: 'MOVEMENT_TYPE_WANDER_AROUND', // house pokemon bumble within their radius
};
const isWander = t => t.includes('WANDER');

function parseAsmObjects(asmPath) {
	const src = fs.readFileSync(asmPath, 'utf8');
	const out = [];
	for (const line of src.split(/\r?\n/)) {
		const m = line.match(/^\s*object_event\s+(-?\d+),\s*(-?\d+),\s*(SPRITE_\w+),\s*(SPRITEMOVEDATA_\w+),\s*(\d+),\s*(\d+),/);
		if (m) out.push({ x: +m[1], y: +m[2], sprite: m[3], move: m[4].replace('SPRITEMOVEDATA_', ''), rx: +m[5], ry: +m[6] });
	}
	return out;
}

let files = 0, patched = 0, skippedNoAsm = 0, mismatches = 0, unknownMoves = new Set();
for (const f of fs.readdirSync(MAPS_DIR).filter(f => f.endsWith('_map.json')).sort()) {
	const p = path.join(MAPS_DIR, f);
	const map = JSON.parse(fs.readFileSync(p, 'utf8'));
	if (!map._crystal_tileset || !map.object_events?.length) continue;
	const stem = map.name || f.replace(/_map\.json$/, '').replace(/^JohKanto/, '').replace(/^Crystal/, '');
	const asmPath = path.join(REF, stem + '.asm');
	if (!fs.existsSync(asmPath)) { skippedNoAsm++; console.log(`  no asm for ${f} (tried ${stem}.asm)`); continue; }
	const asm = parseAsmObjects(asmPath);
	if (asm.length !== map.object_events.length) {
		console.log(`  COUNT MISMATCH ${f}: json ${map.object_events.length} vs asm ${asm.length} — matching by index where (x,y) agrees`);
	}
	let touched = 0;
	map.object_events.forEach((ev, i) => {
		const a = asm[i];
		if (!a || +ev.x !== a.x || +ev.y !== a.y) { mismatches++; return; }
		const type = MOVE_MAP[a.move];
		if (!type) { unknownMoves.add(a.move); return; }
		ev.movement_type = type;
		// npcs.js: tiles-from-home = (movement_range || 1) - 1
		ev.movement_range_x = isWander(type) ? a.rx + 1 : 0;
		ev.movement_range_y = isWander(type) ? a.ry + 1 : 0;
		touched++;
	});
	if (touched) { fs.writeFileSync(p, JSON.stringify(map, null, 1)); patched += touched; files++; }
}
console.log(`\npatched ${patched} objects across ${files} Crystal maps` +
	`${mismatches ? `, ${mismatches} index/coord mismatches left untouched` : ''}` +
	`${skippedNoAsm ? `, ${skippedNoAsm} maps with no source asm` : ''}`);
if (unknownMoves.size) console.log('unknown movedata (left as-is):', [...unknownMoves].join(', '));
