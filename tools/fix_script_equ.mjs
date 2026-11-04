// fix_script_equ.mjs — resolve the decomp's per-map `.equ` / `.set` aliases the
// transpile left as literal names.
//
// pokefirered/pokeemerald map scripts open with aliases like
//     .equ SWITCH1_ID,         VAR_0x8004
//     .equ FOUND_FIRST_SWITCH, FLAG_TEMP_1
// and then use the alias everywhere. The transpile copied the alias NAME into
// the JSON, so `copyvar VAR_TEMP_0, SWITCH1_ID` read a var literally called
// "SWITCH1_ID" (always 0) and `call_if_set FOUND_FIRST_SWITCH` tested a flag
// nobody sets. The Vermilion gym trash cans could never be solved because of it,
// and the junk it wrote into VAR_TEMP_0 then leaked into other maps.
//
// Post-pass over the emitted JSON (the files carry hand repairs). Every string
// field whose WHOLE value is an alias defined in that map's own source is
// replaced by its target. Nothing else is touched.
//
//   node tools/fix_script_equ.mjs            (dry run)
//   node tools/fix_script_equ.mjs --write
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = 'C:/Users/guide/Desktop/Magepunk66/Reference';
const D = 'overworld/data/scripts';

const aliasesFor = {};
for (const g of ['pokeemerald', 'pokefirered']) {
	const dir = `${REF}/${g}/data/maps`;
	for (const m of fs.readdirSync(dir)) {
		let src; try { src = fs.readFileSync(`${dir}/${m}/scripts.inc`, 'utf8'); } catch { continue; }
		const a = {};
		for (const mm of src.matchAll(/^\s*\.(?:equ|set)\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/gm)) a[mm[1]] = mm[2];
		// chase alias-of-alias
		for (const k of Object.keys(a)) { let v = a[k], n = 0; while (a[v] && n++ < 5) v = a[v]; a[k] = v; }
		if (Object.keys(a).length) aliasesFor[m] = a;
	}
}

let files = 0, fields = 0;
const perAlias = {};
const walk = (node, a) => {
	let n = 0;
	if (Array.isArray(node)) { for (const x of node) n += walk(x, a); return n; }
	if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node)) {
			// op names and message labels are never aliases
			if (typeof v === 'string' && k !== 'op' && k !== 'text' && k !== 'label' && a[v]) {
				perAlias[v] = (perAlias[v] || 0) + 1; node[k] = a[v]; n++;
			} else if (v && typeof v === 'object') n += walk(v, a);
		}
	}
	return n;
};
for (const f of fs.readdirSync(D)) {
	if (!f.endsWith('.json')) continue;
	const stem = f.replace(/\.json$/, '');
	const a = aliasesFor[stem] || aliasesFor[stem.replace(/^Hoenn2_/, '')];
	if (!a) continue;
	let prog; try { prog = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch { continue; }
	const n = walk(prog, a);
	if (n) { files++; fields += n; if (WRITE) fs.writeFileSync(path.join(D, f), JSON.stringify(prog)); }
}
console.log(`aliases resolved: ${fields} fields in ${files} script files`);
const top = Object.entries(perAlias).sort((x, y) => y[1] - x[1]).slice(0, 15);
for (const [k, v] of top) console.log(`  ${String(v).padStart(4)}  ${k}`);
if (!WRITE) console.log('\n(dry run — pass --write to apply)');
