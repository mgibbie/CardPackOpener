// audit_crystal_local_labels.mjs — branches on Crystal maps whose target label
// doesn't exist, and how many of those are pokecrystal's COLON-LESS local labels.
//
// rgbasm accepts a local label with no colon (`.partyfull` alone on its line).
// Magepunk66's transpile_crystal.py only reads `Label:` lines, so a colon-less
// label's commands were folded into the label above it, and every goto / call /
// branch to it names a label the map never gets: events.js runs past it. Here
// each Crystal map's labels are assembled the way ow_transitions.js loads them
// (shared + missing-label scripts, the map's own, crystal_scriptvar_data.json
// over them) and every op's `label` is resolved.
//
//   node tools/audit_crystal_local_labels.mjs           per-map counts
//   node tools/audit_crystal_local_labels.mjs --json    machine-readable (tests)
import fs from 'fs';
import path from 'path';

const D = path.join('overworld', 'data');
const MP66 = (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const p = path.join(d, 'Magepunk66');
		if (fs.existsSync(path.join(p, 'Reference', 'pokecrystal', 'maps'))) return p;
		if (path.dirname(d) === d) throw new Error('Magepunk66 not found above ' + path.resolve('.'));
	}
})();
const CR_MAPS = path.join(MP66, 'Reference', 'pokecrystal', 'maps');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const shared = (() => { try { return read(path.join(D, 'shared_scripts.json')).scripts || {}; } catch (e) { return {}; } })();
const missing = (() => { try { return read(path.join('overworld', 'missing_labels_data.json')).scripts || {}; } catch (e) { return {}; } })();
const tryRead = f => { try { return read(f); } catch (e) { return {}; } };
const patches = tryRead(path.join('overworld', 'crystal_scriptvar_data.json')).patches || {};
// the overlays ow_transitions.js applies after it, in its order
const choice = tryRead(path.join('overworld', 'multichoice_data.json')).patches || {};
const layout = tryRead(path.join('overworld', 'maplayout_data.json')).patches || {};
const phone = tryRead(path.join('overworld', 'phone_data.json')).scriptOverrides || {};

// every colon-less local label of a pokecrystal map, qualified by its global label
export function colonlessLabels(asm) {
	const out = new Set(); let g = null;
	for (const l of asm.split(/\r?\n/)) {
		const m = /^([A-Za-z_][A-Za-z0-9_@]*)::?(\s|;|$)/.exec(l); if (m) { g = m[1]; continue; }
		const b = /^(\.[A-Za-z_][A-Za-z0-9_@]*)\s*(;.*)?$/.exec(l); if (b && g) out.add(g + b[1]);
	}
	return out;
}

const rows = [];
for (const f of fs.readdirSync(path.join(D, 'maps')).filter(f => f.endsWith('_map.json'))) {
	const j = read(path.join(D, 'maps', f));
	if (!j._crystal_tileset || !j.name) continue;
	const stem = f.replace('_map.json', '');
	const sf = path.join(D, 'scripts', stem + '.json');
	if (!fs.existsSync(sf)) continue;
	const asmFile = path.join(CR_MAPS, j.name + '.asm');
	const bare = fs.existsSync(asmFile) ? colonlessLabels(fs.readFileSync(asmFile, 'utf8')) : new Set();
	const own = { ...read(sf), ...(patches[stem] || {}), ...(choice[stem] || {}), ...(layout[stem] || {}), ...(phone[stem] || {}) };
	const labels = { ...shared, ...missing, ...own };
	const dangling = new Set(), colonless = new Set();
	for (const ops of Object.values(own)) {   // the map's own scripts (the shared ones are FireRed's)
		if (!Array.isArray(ops)) continue;
		for (const o of ops) {
			if (!o || typeof o.label !== 'string' || !['goto', 'call', 'branch'].includes(o.op) || labels[o.label]) continue;
			dangling.add(o.label);
			if (bare.has(o.label)) colonless.add(o.label);
		}
	}
	if (dangling.size || bare.size) rows.push({ stem, name: j.name, dangling: [...dangling].sort(), colonless: [...colonless].sort(), bare: bare.size });
}
const tot = k => rows.reduce((n, r) => n + r[k].length, 0);
if (process.argv.includes('--json')) {
	console.log(JSON.stringify({ dangling: tot('dangling'), colonless: tot('colonless'), maps: rows.filter(r => r.dangling.length) }));
} else {
	for (const r of rows.filter(r => r.dangling.length)) console.log(`${r.stem.padEnd(36)} dangling ${String(r.dangling.length).padStart(3)}  (colon-less ${r.colonless.length})  ${r.colonless.join(' ')}`);
	console.log(`\n${tot('dangling')} dangling branch targets on ${rows.filter(r => r.dangling.length).length} Crystal maps; ${tot('colonless')} of them colon-less local labels`);
}
