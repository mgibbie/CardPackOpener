// gen_johkanto_scripts.mjs — give JohKanto the scripts it never had.
//
// All 135 JohKanto maps shipped with ZERO script files, so 283 NPC and coord
// events were completely inert: the region was walkable but nobody in it said
// anything, not even a wrong line. Johto got its scripts from
// Magepunk66/tools/transpile_crystal.py; Crystal's Kanto half never did.
//
// The wiring problem is naming. The engine loads scripts by MAP FILE STEM
// (loadMapScripts in main.js), so JohKantoCeruleanCity needs
// data/scripts/JohKantoCeruleanCity.json — but the transpiler emits by Crystal
// map name, CeruleanCity.json, which is ALREADY TAKEN by FireRed's Kanto (a
// different game's labels entirely). So this copies each Crystal file to the
// JohKanto stem instead of writing it in place, and never touches an existing
// file it did not create.
//
// Requires the pokecrystal checkout and the Magepunk66 transpiler.
//
//   node tools/gen_johkanto_scripts.mjs            (dry run)
//   node tools/gen_johkanto_scripts.mjs --write
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const WRITE = process.argv.includes('--write');
const MP66 = path.resolve('../Magepunk66');
const MAPS_ASM = path.join(MP66, 'Reference/pokecrystal/maps');
const TRANSPILER = path.join(MP66, 'tools/transpile_crystal.py');
const DATA = path.resolve('overworld/data');

for (const p of [MAPS_ASM, TRANSPILER]) {
	if (!fs.existsSync(p)) { console.error('missing: ' + p); process.exit(1); }
}

// 1. transpile the whole Crystal map set into a scratch dir
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jkscripts-'));
console.log('transpiling pokecrystal maps ->', tmp);
execFileSync('python', [TRANSPILER, MAPS_ASM, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });

// 2. map each JohKanto map file to its Crystal source by the map's `name`
const mapFiles = fs.readdirSync(path.join(DATA, 'maps')).filter(f => /^JohKanto.*_map\.json$/.test(f));
let scripts = 0, strings = 0, noSource = [], skipped = 0;
for (const f of mapFiles) {
	const stem = f.replace(/_map\.json$/, '');
	const doc = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', f), 'utf8'));
	const crystal = doc.name;
	const src = path.join(tmp, 'scripts', `${crystal}.json`);
	if (!fs.existsSync(src)) { noSource.push(`${stem} (wanted ${crystal}.json)`); continue; }
	const dst = path.join(DATA, 'scripts', `${stem}.json`);
	if (fs.existsSync(dst)) { skipped++; continue; }   // never clobber
	if (WRITE) fs.copyFileSync(src, dst);
	scripts++;
	const sSrc = path.join(tmp, 'strings', `${crystal}.json`);
	const sDst = path.join(DATA, 'strings', `${stem}.json`);
	if (fs.existsSync(sSrc) && !fs.existsSync(sDst)) { if (WRITE) fs.copyFileSync(sSrc, sDst); strings++; }
}

// 3. how much of the region this actually wakes up
let events = 0, resolved = 0;
for (const f of mapFiles) {
	const stem = f.replace(/_map\.json$/, '');
	const doc = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', f), 'utf8'));
	const src = path.join(tmp, 'scripts', `${doc.name}.json`);
	const labels = fs.existsSync(src) ? new Set(Object.keys(JSON.parse(fs.readFileSync(src, 'utf8')))) : new Set();
	for (const list of [doc.object_events, doc.bg_events, doc.coord_events]) {
		for (const ev of (list || [])) {
			if (!ev.script || ev.script === '0x0') continue;
			events++;
			if (labels.has(ev.script)) resolved++;
		}
	}
	void stem;
}

console.log(`\nJohKanto maps:        ${mapFiles.length}`);
console.log(`script files written: ${scripts}  (skipped ${skipped} that already existed)`);
console.log(`string files written: ${strings}`);
console.log(`scripted events:      ${events}, of which ${resolved} now resolve to a real label`);
if (noSource.length) console.log(`no Crystal source:    ${noSource.length} — ${noSource.slice(0, 5).join(', ')}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(WRITE ? '\nwritten.' : '\n(dry run — pass --write)');
