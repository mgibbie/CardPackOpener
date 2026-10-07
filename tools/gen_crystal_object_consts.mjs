// gen_crystal_object_consts.mjs — pokecrystal's object constants, per map, in order.
//
// A Crystal script names an object by a constant from the map's `object_const_def`
// block (`appear GOLDENRODCITY_MOVETUTOR`). That constant is an INDEX — the order of
// the map's `object_event` lines. npcById resolves most of them by normalising the
// name against the converted local_id (GOLDENRODCITY_POKEFAN_M1 ~
// GoldenrodCity_SPRITE_POKEFAN_M), but a constant named for its ROLE matches no
// sprite: GOLDENRODCITY_MOVETUTOR is a POKEFAN_M, so `appear` never found him and
// the Goldenrod move tutor could not appear. This writes the true index list;
// npcById falls back to it when the name match fails.
//
// Output: overworld/crystal_object_consts.json { <asm map name>: [CONST, ...] }
//   node tools/gen_crystal_object_consts.mjs
import fs from 'fs';
import path from 'path';

const MP66 = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66');
		if (fs.existsSync(path.join(p, 'Reference', 'pokecrystal', 'maps'))) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66 not found above ' + path.resolve('.'));
	}
})();
const MAPS = path.join(MP66, 'Reference', 'pokecrystal', 'maps');
const out = {};
let n = 0;
for (const f of fs.readdirSync(MAPS).filter(f => f.endsWith('.asm')).sort()) {
	const lines = fs.readFileSync(path.join(MAPS, f), 'utf8').split(/\r?\n/);
	const i = lines.findIndex(l => /^\s*object_const_def\b/.test(l));
	if (i < 0) continue;
	const consts = [];
	for (let k = i + 1; k < lines.length; k++) {
		const m = /^\s*const\s+(\w+)/.exec(lines[k]);
		if (m) { consts.push(m[1]); continue; }
		if (/^\s*(;.*)?$/.test(lines[k])) continue;   // blank / comment lines inside the block
		break;
	}
	if (consts.length) { out[f.replace(/\.asm$/, '')] = consts; n += consts.length; }
}
fs.writeFileSync(path.join('overworld', 'crystal_object_consts.json'), JSON.stringify(out));
console.log(`${n} object constants on ${Object.keys(out).length} maps -> overworld/crystal_object_consts.json`);
