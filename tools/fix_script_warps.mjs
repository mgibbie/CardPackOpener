// fix_script_warps.mjs — restore the coordinates the transpile dropped from
// scripted warps.
//
// Both transpilers lowered a warp to {map, warp: <first numeric arg>}. But the
// decomp macro takes up to three args (pokeemerald asm/macros/event.inc,
// formatwarp): ONE arg is a warp-door index, TWO are an (x, y) coordinate, THREE
// are door + coordinate. So every two-argument warp became "door x" with y lost:
// `warp MAP_ROUTE104, 13, 51` shipped as door 13 on a map with 8 doors, and
// warpTo() quietly fell back to door 0. Crystal's `warp` and `warpfacing` ALWAYS
// take coordinates, so every Crystal scripted warp was affected.
//
// This is a POST-PASS over the emitted JSON, not a re-transpile: the script files
// carry hand repairs, and re-emitting them would be a merge. For each JSON warp
// op it finds the decomp warp with the same destination and the same first arg,
// and — only when that match is unambiguous — writes x/y onto the op. Anything
// ambiguous or unmatched is reported and left alone.
//
//   node tools/fix_script_warps.mjs          (dry run: report only)
//   node tools/fix_script_warps.mjs --write
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = 'C:/Users/guide/Desktop/Magepunk66/Reference';
const D = 'overworld/data/scripts';

// map stem -> decomp source text, across all three decomps
const sources = {};
const add = (stem, file) => { try { sources[stem] = (sources[stem] || '') + '\n' + fs.readFileSync(file, 'utf8'); } catch {} };
for (const g of ['pokeemerald', 'pokefirered']) {
	const dir = `${REF}/${g}/data/maps`;
	for (const m of fs.readdirSync(dir)) add(m, `${dir}/${m}/scripts.inc`);
}
for (const f of fs.readdirSync(`${REF}/pokecrystal/maps`)) if (f.endsWith('.asm')) add(f.replace(/\.asm$/, ''), `${REF}/pokecrystal/maps/${f}`);

const num = s => /^-?\d+$/.test(String(s).trim()) ? parseInt(s, 10) : null;
// every warp line in a source, as { dest, args: [numbers] }
function warpsIn(src) {
	const out = [];
	for (const line of src.split('\n')) {
		const m = line.match(/^\s*(warp|warpsilent|warpdoor|warphole|warpteleport|warpwhitefade|warpmossdeepgym|warpfacing)\s+(.+?)\s*(@.*|;.*)?$/);
		if (!m) continue;
		let parts = m[2].split(',').map(s => s.trim()).filter(Boolean);
		if (m[1] === 'warpfacing') parts = parts.slice(1);          // Crystal: facing, map, x, y
		// numbers, or VAR_ names (Petalburg's gym warps via VAR_0x8008/9 — the x
		// and y of the room you picked); anything else symbolic is left alone
		const dest = parts[0], args = parts.slice(1).map(a => num(a) ?? (/^VAR_/.test(a) ? a : null));
		if (args.some(a => a == null)) continue;
		out.push({ dest, args, crystal: !/^MAP_/.test(dest) });
	}
	return out;
}
const bare = s => String(s || '').replace(/^MAP_/, '');

let fixed = 0, already = 0, doorOnly = 0, ambiguous = 0, unmatched = 0;
const report = [];
for (const f of fs.readdirSync(D)) {
	if (!f.endsWith('.json')) continue;
	const stem = f.replace(/\.json$/, '');
	const src = sources[stem] || sources[stem.replace(/^(Hoenn2|JohKanto)_/, '')];
	let prog;
	try { prog = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch { continue; }
	let changed = false;
	for (const [label, ops] of Object.entries(prog)) {
		if (!Array.isArray(ops)) continue;
		for (const op of ops) {
			if (!op || op.op !== 'warp' || typeof op.map !== 'string') continue;
			// Crystal `warpfacing DIR, MAP, x, y` was lowered with the DIRECTION in
			// `map` and the real map in `warp`; events.js recovers it and lands on
			// door 0. Normalise it to a plain coordinate warp.
			const facing = /^(UP|DOWN|LEFT|RIGHT)$/.test(op.map) && typeof op.warp === 'string';
			if (facing) {
				const wf = src ? warpsIn(src).filter(w => bare(w.dest) === bare(op.warp)) : [];
				const sh = new Set(wf.map(w => JSON.stringify(w.args)));
				if (wf.length && sh.size === 1) { op.map = op.warp; op.x = wf[0].args[0]; op.y = wf[0].args[1]; op.warp = 0; op.coord = true; changed = true; fixed++; }
				else { unmatched++; report.push(`warpfacing ${stem}  ${label} -> ${op.warp}  ${[...sh].join(' | ')}`); }
				continue;
			}
			if (op.x != null && op.y != null) { already++; continue; }
			if (!src) { unmatched++; report.push(`no source  ${stem}  ${label} -> ${op.map} ${op.warp}`); continue; }
			// JohKanto/Hoenn2 copies rename the destination with a region prefix
			const want = bare(op.map).replace(/^(HOENN2|JOHKANTO)_/, '');
			const cands = warpsIn(src).filter(w => bare(w.dest) === want && w.args[0] === op.warp);
			const shapes = new Set(cands.map(w => JSON.stringify(w.args)));
			if (!cands.length) { unmatched++; report.push(`unmatched  ${stem}  ${label} -> ${op.map} ${op.warp}`); continue; }
			if (shapes.size > 1) { ambiguous++; report.push(`ambiguous  ${stem}  ${label} -> ${op.map} ${op.warp}  ${[...shapes].join(' | ')}`); continue; }
			const w = cands[0];
			// Crystal: always (x, y). FR/E: 2 args = coords, 3 = door + coords, 1 = door.
			if (w.crystal || w.args.length === 2) {
				op.x = w.args[0]; op.y = w.args[1]; op.coord = true; changed = true; fixed++;
			} else if (w.args.length === 3) {
				op.x = w.args[1]; op.y = w.args[2]; changed = true; fixed++;   // door wins when it exists
			} else doorOnly++;
		}
	}
	if (changed && WRITE) fs.writeFileSync(path.join(D, f), JSON.stringify(prog));
}
console.log(`coords restored: ${fixed}   already had coords: ${already}   door-only (correct as is): ${doorOnly}`);
console.log(`ambiguous (left alone): ${ambiguous}   unmatched (left alone): ${unmatched}`);
if (process.argv.includes('--list')) for (const r of report) console.log('  ' + r);
if (!WRITE) console.log('\n(dry run — pass --write to apply)');
