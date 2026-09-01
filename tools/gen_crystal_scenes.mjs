// gen_crystal_scenes.mjs — give Crystal's scenes a way to arm.
//
// A "scene" is Crystal's per-map story state: each map declares an ordered list
// of scene_scripts, and its coord_events gate on the map being in scene N. The
// scripts move that state with `setscene` (this map) and `setmapscene` (another
// map) — and THE TRANSPILER EMITS NEITHER. 163 scene ops across 72 maps, all
// dropped. A census of every transpiled script confirms it: 36 distinct ops,
// not one of them a scene op.
//
// So no scene in the game can ever arm or advance. Two consequences:
//   * Anything gated on a scene other than 0 is UNREACHABLE. Misty's date on
//     Route 25 (scene 1) and the Power Plant guard's phone call (scene 1) are
//     the Gen-2 Kanto examples — the whole MACHINE PART questline hangs off them.
//   * Anything gated on scene 0 can never turn itself OFF, which is why Johto
//     needed the hand-maintained PLOT_ONESHOT list to stop beats replaying.
//
// The lowering is exact, because the port already has the right vocabulary: our
// coord_events gate on `VAR_SCENE_<MapName>` and `setvar` is a real op. So
//     setscene SCENE_X            ->  VAR_SCENE_<thisMap>   = <index of SCENE_X>
//     setmapscene MAP_Y, SCENE_X  ->  VAR_SCENE_<name of Y>  = <index of SCENE_X>
// Scene constants are POSITIONAL: the Nth scene_script line is scene N.
//
// Keyed by SCRIPT LABEL, applied when the interpreter enters that label. This is
// precise rather than approximate because the transpiler preserves the decomp's
// sub-labels (1,970 of 19,002) — a `setscene` inside a conditional lives in its
// own `.Branch` label, which is its own entry here, so it only applies when that
// branch is actually taken.
//
// Same shape as crystal_stds.js: a generated side table the engine consults,
// rather than a rewrite of the transpiled data.
//
//   node tools/gen_crystal_scenes.mjs           (report)
//   node tools/gen_crystal_scenes.mjs --write   (write overworld/crystal_scenes.js)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const CRY = path.resolve('../Magepunk66/Reference/pokecrystal/maps');
const D = path.resolve('overworld/data');

if (!fs.existsSync(CRY)) { console.error('missing pokecrystal checkout: ' + CRY); process.exit(1); }

// ---------- MAP_CONST -> our map's `name`, from our OWN data ----------
// Authoritative, and it already knows about the JOHKANTO_ namespacing: our map
// JSONs carry both `id` (MAP_[JOHKANTO_]<CONST>) and `name` (the Crystal camel
// stem the scene var is built from).
const constToName = new Map();
const dupes = [];
for (const f of fs.readdirSync(path.join(D, 'maps'))) {
	if (!f.endsWith('_map.json')) continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
	if (!j._crystal_tileset || !j.id || !j.name) continue;
	const konst = String(j.id).replace(/^MAP_/, '').replace(/^JOHKANTO_/, '');
	if (constToName.has(konst) && constToName.get(konst) !== j.name) dupes.push(konst);
	constToName.set(konst, j.name);
}
if (dupes.length) { console.error('AMBIGUOUS map consts: ' + dupes.join(', ')); process.exit(1); }

// ---------- parse the decomp ----------
const sceneIdx = new Map();   // camel stem -> { SCENE_CONST: index }
const stems = fs.readdirSync(CRY).filter(f => f.endsWith('.asm')).map(f => f.replace(/\.asm$/, ''));
for (const s of stems) {
	const src = fs.readFileSync(path.join(CRY, s + '.asm'), 'utf8');
	// `scene_const` continues the numbering without declaring a script (ElmsLab's
	// AIDE_GIVES_POKE_BALLS is one), so both forms have to be counted in order or
	// every constant after one is off by one.
	const m = /def_scene_scripts\s*\n((?:\s*(?:scene_script|scene_const)[^\n]*\n)+)/.exec(src);
	if (!m) continue;
	const idx = {};
	let i = 0;
	for (const x of m[1].matchAll(/(scene_script\s+[A-Za-z0-9_]+,\s*|scene_const\s+)([A-Z0-9_]+)/g)) idx[x[2]] = i++;
	sceneIdx.set(s, idx);
}

// every scene op, with the label it sits inside
const byLabel = new Map();
let total = 0, unresolved = [];
for (const s of stems) {
	const src = fs.readFileSync(path.join(CRY, s + '.asm'), 'utf8');
	// A label starting with '.' is LOCAL to the preceding global label, and the
	// transpiler stores it as "Parent.Sub" (PowerPlantManager.ReturnedMachinePart).
	// Recording the bare ".Sub" would key the table on a name no script has —
	// and ".AllEightBadges" is the Victory Road gate's own pass branch, so getting
	// this wrong silently drops the entries that matter most.
	let parent = null, label = null;
	for (const line of src.split('\n')) {
		const G = /^([A-Za-z0-9_][A-Za-z0-9_]*):/.exec(line);
		if (G) { parent = label = G[1]; continue; }
		const S = /^(\.[A-Za-z0-9_]+):/.exec(line);
		if (S) { label = parent ? parent + S[1] : null; continue; }
		const a = /^\s*setscene\s+([A-Z0-9_]+)/.exec(line);
		const b = /^\s*setmapscene\s+([A-Z0-9_]+),\s*([A-Z0-9_]+)/.exec(line);
		if (!a && !b) continue;
		total++;
		const targetStem = a ? s : constToName.get(b[1]);
		const scene = a ? a[1] : b[2];
		if (!targetStem) { unresolved.push(`${s}:${label} -> ${b[1]} (no such Crystal map here)`); continue; }
		// A map with no scene list can't hold a scene. The decomp does this to
		// Route 43 and says so in a comment ("Route 43 does not have a scene
		// variable") — a no-op in the original, so a no-op here.
		if (!sceneIdx.has(targetStem)) { unresolved.push(`${s}:${label} -> ${targetStem} (declares no scenes; no-op in vanilla too)`); continue; }
		// scene may be a bare number rather than a constant
		const idx = /^\d+$/.test(scene) ? +scene : sceneIdx.get(targetStem)?.[scene];
		if (idx == null) { unresolved.push(`${s}:${label} -> ${targetStem}/${scene} (scene not declared)`); continue; }
		if (!label) { unresolved.push(`${s}: scene op outside any label`); continue; }
		if (!byLabel.has(label)) byLabel.set(label, []);
		const list = byLabel.get(label);
		const v = 'VAR_SCENE_' + targetStem;
		if (!list.some(e => e[0] === v)) list.push([v, idx]);   // first write in a label wins
	}
}

console.log(`Crystal maps declaring scene_scripts: ${sceneIdx.size}`);
console.log(`scene ops in the decomp:              ${total}`);
console.log(`labels that move a scene:             ${byLabel.size}`);
console.log(`unresolved:                           ${unresolved.length}`);
for (const u of unresolved.slice(0, 12)) console.log('    ' + u);

// the two Gen-2 Kanto beats this was written for
for (const L of ['PowerPlantManager', 'CeruleanGymGruntRunsOutScript']) {
	console.log(`\n  ${L}: ${JSON.stringify(byLabel.get(L) || null)}`);
}

if (WRITE) {
	const rows = [...byLabel].sort((a, b) => a[0].localeCompare(b[0]))
		.map(([l, v]) => `\t${JSON.stringify(l)}: ${JSON.stringify(v)},`).join('\n');
	fs.writeFileSync(path.resolve('overworld/crystal_scenes.js'),
`// crystal_scenes.js — GENERATED by tools/gen_crystal_scenes.mjs. Re-run it rather
// than editing by hand.
//
// Crystal keeps per-map story state in a "scene", and its coord_events gate on it.
// Scripts move that state with \`setscene\` / \`setmapscene\` — and the transpiler
// emits NEITHER, so all ${total} scene ops across ${sceneIdx.size} maps were dropped and no scene in
// the game could ever arm or advance. Misty's date and the Power Plant guard's
// phone call (both scene 1) were unreachable; Johto's scene-0 beats could never
// switch themselves off, which is what PLOT_ONESHOT was working around.
//
// The port already had the vocabulary: coord_events gate on VAR_SCENE_<MapName>.
// So a scene op lowers to a plain var write. Scene constants are POSITIONAL —
// the Nth scene_script line in a map is scene N.
//
// Keyed by the script label the op sits in, applied on entry to that label. That
// is precise, not approximate: the transpiler preserves the decomp's sub-labels,
// so a setscene inside a conditional is keyed to its own \`.Branch\` label and
// only fires when that branch is actually taken.

// script label -> [[scene var, value], ...]
export const SCENE_SET = {
${rows}
};
`);
	console.log('\nwrote overworld/crystal_scenes.js');
} else {
	console.log('\n(dry run — pass --write to emit overworld/crystal_scenes.js)');
}
