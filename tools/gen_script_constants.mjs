// gen_script_constants.mjs — the named constants the ported branches compare against.
//
// A transpiled branch keeps the decomp's SYMBOL as its value:
//     {"cond":{"var":"VAR_FACING","cmp":"eq","value":"DIR_EAST"}}
// and resolveValue only knew TRUE/FALSE/YES/NO and the battle outcomes. Everything
// else fell through to a string, so `cmp(2, 'eq', 'DIR_EAST')` is `2 === 'DIR_EAST'`
// — false forever. 1,671 comparisons across 265 distinct symbols could never be
// true, so every one of those branches took the same path whatever the state.
//
// This lifts the real values out of the decomps: `#define NAME <n>` from
// pokefirered/pokeemerald include/constants/, and pokecrystal's `const` blocks
// (which number sequentially from a `const_def`).
//
// FACING IS DELIBERATELY NOT TAKEN FROM THE DECOMPS. They disagree — Crystal's
// UP is 1 and Emerald's DIR_SOUTH is also 1 — so no single number can serve both,
// and VAR_FACING is written by THIS engine, not by either decomp. Since those
// eight symbols are only ever compared against VAR_FACING (verified: 380 of 383
// uses, and the other 3 are strays against VAR_RESULT), the encoding just has to
// be self-consistent. main.js writes the same one.
//
//   node tools/gen_script_constants.mjs           (report)
//   node tools/gen_script_constants.mjs --write   (write overworld/script_constants.js)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = path.resolve('../Magepunk66/Reference');
const D = path.resolve('overworld/data');

// ---------- which symbols do our branches actually compare against? ----------
const BUILTIN = new Set(['TRUE', 'FALSE', 'YES', 'NO']);
const wanted = new Map();   // symbol -> uses
for (const f of fs.readdirSync(path.join(D, 'scripts'))) {
	if (!f.endsWith('.json') || f === '_index.json') continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'scripts', f), 'utf8'));
	for (const body of Object.values(j)) {
		if (!Array.isArray(body)) continue;
		for (const s of body) {
			if (s?.op !== 'branch' || s.cond?.var == null) continue;
			const v = s.cond.value;
			if (typeof v !== 'string' || BUILTIN.has(v) || /^B_OUTCOME_/.test(v) || /^VAR_/.test(v) || !isNaN(Number(v))) continue;
			wanted.set(v, (wanted.get(v) || 0) + 1);
		}
	}
}
console.log(`symbols our branches compare against: ${wanted.size}  (${[...wanted.values()].reduce((a, b) => a + b, 0)} comparisons)`);

// ---------- harvest every constant the decomps define ----------
const found = new Map();      // symbol -> Map(value -> [sources])
const note = (name, val, src) => {
	if (!Number.isFinite(val)) return;
	if (!found.has(name)) found.set(name, new Map());
	const m = found.get(name);
	if (!m.has(val)) m.set(val, []);
	m.get(val).push(src);
};

// C headers
for (const dec of ['pokefirered', 'pokeemerald']) {
	const inc = path.join(REF, dec, 'include');
	if (!fs.existsSync(inc)) continue;
	const walk = dir => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) { walk(p); continue; }
			if (!e.name.endsWith('.h')) continue;
			for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
				const m = /^\s*#define\s+([A-Z_][A-Z0-9_]*)\s+\(?\s*(-?(?:0[xX][0-9a-fA-F]+|\d+))\s*\)?\s*(?:\/\/.*)?$/.exec(line);
				if (m) note(m[1], Number(m[2]), dec);
			}
		}
	};
	walk(inc);
}

// pokecrystal: `const_def` starts a run, each `const NAME` takes the next value
{
	const cdir = path.join(REF, 'pokecrystal/constants');
	if (fs.existsSync(cdir)) for (const f of fs.readdirSync(cdir)) {
		if (!f.endsWith('.asm')) continue;
		let i = 0;
		for (const line of fs.readFileSync(path.join(cdir, f), 'utf8').split('\n')) {
			const d = /^\s*const_def\s*(-?\d+)?/.exec(line);
			if (d) { i = d[1] ? Number(d[1]) : 0; continue; }
			const c = /^\s*const\s+([A-Z_][A-Z0-9_]*)/.exec(line);
			if (c) { note(c[1], i, 'pokecrystal'); i++; continue; }
			const e = /^\s*(?:DEF\s+)?([A-Z_][A-Z0-9_]*)\s+EQU\s+(-?(?:\$[0-9a-fA-F]+|\d+))\s*$/.exec(line);
			if (e) note(e[1], Number(String(e[2]).replace('$', '0x')), 'pokecrystal');
		}
	}
}
console.log(`constants harvested from the decomps: ${found.size}`);

// ---------- resolve, and be loud about disagreement ----------
// VAR_FACING is ours; see the header. Canonical, self-consistent, and main.js
// writes the same encoding.
const FACING = { DIR_SOUTH: 1, DOWN: 1, DIR_NORTH: 2, UP: 2, DIR_WEST: 3, LEFT: 3, DIR_EAST: 4, RIGHT: 4 };

const out = {}, conflicts = [], unresolved = [];
for (const [sym, uses] of [...wanted].sort((a, b) => b[1] - a[1])) {
	if (FACING[sym] != null) { out[sym] = FACING[sym]; continue; }
	// simple arithmetic the decomp writes inline, e.g. (NUM_X - 1)
	const expr = /^\(\s*([A-Z_][A-Z0-9_]*)\s*([-+])\s*(\d+)\s*\)$/.exec(sym);
	if (expr) {
		const base = found.get(expr[1]);
		if (base && base.size === 1) {
			const b = [...base.keys()][0];
			out[sym] = expr[2] === '-' ? b - Number(expr[3]) : b + Number(expr[3]);
			continue;
		}
	}
	const m = found.get(sym);
	if (!m) { unresolved.push(`${sym} (${uses})`); continue; }
	if (m.size > 1) { conflicts.push(`${sym}: ${[...m].map(([v, s]) => `${v} in ${[...new Set(s)].join('/')}`).join(', ')}`); continue; }
	out[sym] = [...m.keys()][0];
}
console.log(`\nresolved: ${Object.keys(out).length}`);
console.log(`conflicting across decomps (left unresolved on purpose): ${conflicts.length}`);
for (const c of conflicts.slice(0, 10)) console.log(`    ${c}`);
console.log(`not defined anywhere in the decomps: ${unresolved.length}`);
for (const u of unresolved.slice(0, 10)) console.log(`    ${u}`);

const covered = [...wanted].filter(([s]) => out[s] != null).reduce((a, [, n]) => a + n, 0);
const totalUses = [...wanted.values()].reduce((a, b) => a + b, 0);
console.log(`\ncomparisons that can now be true: ${covered} of ${totalUses}`);

if (WRITE) {
	const rows = Object.entries(out).sort((a, b) => a[0].localeCompare(b[0]))
		.map(([k, v]) => `\t${/^[A-Z_][A-Z0-9_]*$/.test(k) ? k : JSON.stringify(k)}: ${v},`).join('\n');
	fs.writeFileSync(path.resolve('overworld/script_constants.js'),
`// script_constants.js — GENERATED by tools/gen_script_constants.mjs. Re-run it
// rather than editing by hand.
//
// A transpiled branch keeps the decomp's SYMBOL as its value:
//     {"cond":{"var":"VAR_FACING","cmp":"eq","value":"DIR_EAST"}}
// and resolveValue knew only TRUE/FALSE/YES/NO and the battle outcomes, so every
// other symbol stayed a string and \`cmp(2, 'eq', 'DIR_EAST')\` compared a number
// to text — false forever. ${totalUses} comparisons across ${wanted.size} symbols could never be
// true, so those branches always took the same path whatever the game state.
//
// Values come from the decomps: #define in pokefirered/pokeemerald include/, and
// pokecrystal's sequential \`const\` blocks. Symbols the decomps DISAGREE on are
// deliberately left out rather than guessed.
//
// FACING IS THE ONE EXCEPTION and is set here, not harvested: the decomps clash
// (Crystal's UP is 1, Emerald's DIR_SOUTH is also 1) and VAR_FACING is written by
// this engine, not by either of them. Those eight symbols are only ever compared
// against VAR_FACING, so the encoding only has to agree with main.js — which
// writes this same one.

export const SCRIPT_CONSTANTS = {
${rows}
};
`);
	console.log('\nwrote overworld/script_constants.js');
} else {
	console.log('\n(dry run — pass --write)');
}
