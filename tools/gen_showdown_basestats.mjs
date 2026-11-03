// gen_showdown_basestats.mjs — snapshot Pokémon Showdown's base stats for the
// overworld's species check (overworld/tests/species_basestats_test.mjs).
//
// The Showdown source lives outside the repo (the owner's Reference folder), so
// CI can't read it: this writes the numbers the test needs into a committed
// fixture, { showdownId: { num, bs: [hp, atk, def, spa, spd, spe] } } for every
// entry with a real dex number (no CAP / Missingno).
//
// --fix also corrects overworld/data/species_battle.json from the snapshot (any
// species/form whose stats differ, except the test's EXCEPTIONS), backing the
// file up first to the OS temp folder (never into overworld/data, which deploys
// whole). overworld/data is gitignored: deploy it afterwards
//   npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true
//
//   node tools/gen_showdown_basestats.mjs [--src <pokemon-showdown>/data/pokedex.ts] [--fix]
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
// default: <some ancestor>/Magepunk66/Reference/... (the main checkout's sibling; a worktree is deeper)
const findRef = () => { for (let d = ROOT; ; d = path.dirname(d)) { const f = path.join(d, 'Magepunk66/Reference/pokemon-showdown-master/data/pokedex.ts'); if (fs.existsSync(f)) return f; if (path.dirname(d) === d) return f; } };
const SRC = opt('--src', findRef());
const OUT = path.join(ROOT, 'overworld/tests/fixtures/showdown_basestats.json');
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

if (fs.existsSync(SRC)) {
	// pokedex.ts is one object literal; strip the TS type annotation and evaluate it
	const ts = fs.readFileSync(SRC, 'utf8');
	const body = ts.slice(ts.indexOf('= {') + 2).replace(/;\s*$/, '');
	const P = new Function(`return (${body});`)();
	const out = {};
	for (const id of Object.keys(P).sort()) {
		const e = P[id];
		if (!(e.num > 0) || !e.baseStats) continue;
		out[id] = { num: e.num, bs: STATS.map(k => e.baseStats[k]) };
	}
	fs.writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"') + '\n');
	console.log(`wrote ${Object.keys(out).length} entries -> ${path.relative(ROOT, OUT)}`);
} else {
	console.log(`no Showdown source at ${SRC}; using the committed snapshot`);
}

if (args.includes('--fix')) {
	const { showdownIdFor, EXCEPTIONS } = await import('../overworld/tests/species_basestats_map.mjs');
	const REF = JSON.parse(fs.readFileSync(OUT, 'utf8'));
	const file = path.join(ROOT, 'overworld/data/species_battle.json');
	const S = JSON.parse(fs.readFileSync(file, 'utf8'));
	const fixed = [];
	for (const [id, sp] of Object.entries(S)) {
		if (id.startsWith('_') || !(sp.num > 0) || EXCEPTIONS[id]) continue;
		const r = REF[showdownIdFor(id)];
		if (!r) continue;
		const diff = STATS.filter((k, i) => sp.baseStats[k] !== r.bs[i]);
		if (!diff.length) continue;
		fixed.push(`${id}: ${diff.map(k => `${k} ${sp.baseStats[k]}->${r.bs[STATS.indexOf(k)]}`).join(', ')}`);
		for (const k of diff) sp.baseStats[k] = r.bs[STATS.indexOf(k)];
	}
	if (fixed.length) {
		const bak = path.join(os.tmpdir(), `species_battle.pre_basestats.${Date.now()}.json`);
		fs.copyFileSync(file, bak);
		fs.writeFileSync(file, JSON.stringify(S));
		console.log(`backup: ${bak}`);
	}
	console.log(fixed.length ? 'fixed:\n  ' + fixed.join('\n  ') : 'nothing to fix');
}
