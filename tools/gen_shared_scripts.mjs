// gen_shared_scripts.mjs — the script bodies FireRed and Emerald keep OUTSIDE
// their map files, which nothing here has ever read.
//
// transpile_scripts.py only walks data/maps/<Map>/scripts.inc. Both decomps also
// keep bodies in data/scripts/*.inc (96 files) and data/event_scripts.s (the
// Common_EventScript_* family) — and some maps' objects point at labels defined
// in ANOTHER map's file (every Silph Co floor shares one door script; Trainer
// Tower's floors share one owner; the Dotted Hole's basements share 1F's).
//
// The engine loads exactly one map's script file, so all of that resolved to
// nothing and the object was mute. This is the FireRed/Emerald analogue of
// Crystal's dropped `jumpstd`, which crystal_stds.js fixed the same way.
//
// 831 events across the port resolve to no body. This targets the ones that are
// LIVE CONTENT: 399 after setting aside the Hoenn2 editing clone and the families
// this port reimplements natively or does not support at all.
//
// DELIBERATELY EXCLUDED, and why:
//   cable club / union room / trade center / record corner — no link play here,
//     and their scripts drive a connection flow that does not exist. A mute
//     attendant is better than one who opens a menu into nothing.
//   Battle Frontier, Battle Tent, Trainer Tower, Battle Pike, Battle Pyramid —
//     reimplemented natively (frontier.js, factoryspec.js), and main.js already
//     suppresses these labels by name in plotBlocked.
//   secret bases, contest halls, the Berry Blender, roulette — not modelled.
// This is the same judgement crystal_stds.js made about Strength boulders: a body
// that fights the system that already owns the object is worse than no body.
//
//   node tools/gen_shared_scripts.mjs           (report)
//   node tools/gen_shared_scripts.mjs --write   (write overworld/data/shared_scripts.json)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const MP66 = path.resolve('../Magepunk66');
const TR = path.join(MP66, 'tools/transpile_scripts.py');
const D = path.resolve('overworld/data');
const DECOMPS = ['pokefirered', 'pokeemerald'];

if (!fs.existsSync(TR)) { console.error('missing: ' + TR); process.exit(1); }

// Matched against LABELS, which are CamelCase — the decomp's file names are
// snake_case, so every alternative has to allow the separator to be absent or
// the filter silently passes everything (BattlePikeRoom does not contain
// "battle_pike"). Jump targets are filtered too, in pull(): a label that survives
// the filter can still `goto` straight into one of these families.
const SKIP = /cable_?club|union_?room|trade_?center|record_?corner|battle_?pike|battle_?pyramid|battle_?tower|battle_?dome|battle_?factory|battle_?arena|battle_?palace|battle_?tent|trainer_?tower|secret_?base|contest|berry_?blender|roulette|link_?contest|mystery_?(gift|event)/i;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-'));

// ---------- 1. the shared sources, and every map's own file ----------
const pool = new Map();   // label -> ops   (first definition wins)
const text = new Map();   // text label -> string
for (const dec of DECOMPS) {
	const data = path.join(MP66, 'Reference', dec, 'data');
	if (!fs.existsSync(data)) { console.log(`(no ${dec} checkout)`); continue; }

	const sharedOut = path.join(tmp, dec + '-shared.json');
	const strOut = path.join(tmp, dec + '-strings.json');
	execFileSync('python', [path.resolve('tools/shared_transpile.py'), data, sharedOut, strOut], { stdio: ['ignore', 'inherit', 'inherit'] });
	for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(sharedOut, 'utf8')))) if (!pool.has(k)) pool.set(k, v);
	for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(strOut, 'utf8')))) if (!text.has(k)) text.set(k, v);

	// per-map files too: that is where the cross-map labels live
	const mapsOut = path.join(tmp, dec + '-maps');
	execFileSync('python', [TR, path.join(data, 'maps'), mapsOut], { stdio: ['ignore', 'ignore', 'inherit'] });
	for (const f of fs.readdirSync(path.join(mapsOut, 'scripts'))) {
		if (!f.endsWith('.json') || f === '_index.json') continue;
		for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(mapsOut, 'scripts', f), 'utf8')))) {
			if (k !== '__map__' && !pool.has(k)) pool.set(k, v);
		}
	}
	const strDir = path.join(mapsOut, 'strings');
	if (fs.existsSync(strDir)) for (const f of fs.readdirSync(strDir)) {
		for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(strDir, f), 'utf8')))) if (!text.has(k)) text.set(k, v);
	}
}
console.log(`\ndecomp label pool (shared files + every map's own): ${pool.size}`);

// ---------- 2. what our maps reference and cannot resolve ----------
const ev = fs.readFileSync(path.resolve('overworld/events.js'), 'utf8');
const commonStubs = new Set([...ev.matchAll(/^\t([A-Za-z0-9_]+):\s*\[/gm)].map(m => m[1]));
const { STD_OF } = await import('file:///' + path.resolve('overworld/crystal_stds.js').replace(/\\/g, '/'));
const crystalStd = new Set(Object.keys(STD_OF));
// objects other systems own by graphics id / type (items.js, trainers.js)
const itemsClaims = g => g.includes('BREAKABLE_ROCK') || g.includes('ROCK_SMASH') || /_ROCK$/.test(g)
	|| g.includes('CUTTABLE_TREE') || g.includes('CUT_TREE') || g.includes('BOULDER')
	|| g.includes('ITEM_BALL') || g.includes('POKE_BALL') || g.includes('BERRY_TREE') || g.includes('FRUIT_TREE');
const trainerClaims = o => (o.type === 'object' || o.type == null)
	&& (o.trainer_type === 'TRAINER_TYPE_NORMAL' || o.trainer_type === 'TRAINER_TYPE_SEE_ALL_DIRECTIONS');

const wanted = new Map();   // label -> maps that reference it
for (const f of fs.readdirSync(path.join(D, 'maps'))) {
	if (!f.endsWith('_map.json')) continue;
	const stem = f.replace('_map.json', '');
	const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
	const sp = path.join(D, 'scripts', stem + '.json');
	const own = fs.existsSync(sp) ? new Set(Object.keys(JSON.parse(fs.readFileSync(sp, 'utf8')))) : new Set();
	for (const o of [...(j.object_events || []), ...(j.bg_events || []), ...(j.coord_events || [])]) {
		const s = o.script;
		if (!s || s === '0x0' || s === '0' || s === 'ObjectEvent') continue;
		if (itemsClaims(String(o.graphics_id || '')) || trainerClaims(o)) continue;
		if (own.has(s) || commonStubs.has(s) || crystalStd.has(s)) continue;
		if (!wanted.has(s)) wanted.set(s, []);
		wanted.get(s).push(stem);
	}
}
console.log(`labels our maps reference and cannot resolve: ${wanted.size}`);

// ---------- 3. emit, pulling in whatever those bodies jump to ----------
const out = {};
let skipped = 0, missing = 0;
const pull = (label, depth) => {
	if (depth > 12 || out[label] || !pool.has(label) || SKIP.test(label)) return;
	out[label] = pool.get(label);
	for (const step of pool.get(label)) {
		const t = step && (step.label || (step.cond && step.labelTrue));
		if (typeof t === 'string') pull(t, depth + 1);
	}
};
for (const [label, maps] of wanted) {
	if (SKIP.test(label)) { skipped++; continue; }
	if (!pool.has(label)) { missing++; continue; }
	pull(label, 0);
}
console.log(`  skipped (natively reimplemented / unsupported): ${skipped}`);
console.log(`  not in either decomp (Crystal labels, movement data): ${missing}`);
console.log(`  emitted, including bodies they jump to: ${Object.keys(out).length}`);

// what this actually wakes up, by region
const regions = JSON.parse(fs.readFileSync(path.resolve('overworld/map_regions.json'), 'utf8'));
const regionOf = {};
for (const [r, list] of Object.entries(regions)) for (const m of list) regionOf[m.name] = r;
const byRegion = {};
for (const [label, maps] of wanted) {
	if (!out[label]) continue;
	for (const m of maps) { const r = regionOf[m] || '-'; byRegion[r] = (byRegion[r] || 0) + 1; }
}
console.log('\nobjects this gives a voice, by region: ' + Object.entries(byRegion).map(([k, v]) => `${k} ${v}`).join(', '));

// ---------- the strings those bodies speak ----------
// A `msg` whose text label resolves nowhere falls through to printing THE LABEL,
// so an unstringed body is worse than no body: the NPC recites "gText_Foo".
const strings = {};
let msgs = 0, unstringed = [];
for (const ops of Object.values(out)) {
	for (const s of ops) {
		if (s?.op !== 'msg' || typeof s.text !== 'string') continue;
		msgs++;
		if (text.has(s.text)) strings[s.text] = text.get(s.text);
		else if (!/^\{|^[A-Z][a-z]/.test(s.text)) unstringed.push(s.text);
	}
}
console.log(`\nmsg ops in the emitted bodies: ${msgs}`);
console.log(`  strings found:      ${Object.keys(strings).length}`);
console.log(`  text label with NO string (would be spoken raw): ${unstringed.length}`);
if (unstringed.length) console.log('    ' + [...new Set(unstringed)].slice(0, 10).join(', '));

if (WRITE) {
	fs.writeFileSync(path.join(D, 'shared_scripts.json'), JSON.stringify({ scripts: out, strings }));
	console.log(`\nwrote overworld/data/shared_scripts.json (${Object.keys(out).length} labels, ${Object.keys(strings).length} strings)`);
	console.log('owdata is gitignored, deploy with:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
} else {
	console.log('\n(dry run — pass --write)');
}
