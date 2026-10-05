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
import { pathToFileURL } from 'url';

const WRITE = process.argv.includes('--write');
// the decomps live in Magepunk66/Reference beside the repo; walk up so this also
// works from a worktree (.claude/worktrees/x) — or point MAGEPUNK66 at it
const REF = (() => {
	if (process.env.MAGEPUNK66) return path.join(process.env.MAGEPUNK66, 'Reference');
	for (let d = path.resolve('..'); ; d = path.dirname(d)) {
		const r = path.join(d, 'Magepunk66', 'Reference');
		if (fs.existsSync(r)) return r;
		if (path.dirname(d) === d) return path.resolve('../Magepunk66/Reference');
	}
})();
const D = path.resolve('overworld/data');

// ---------- which symbols do our branches actually compare against? ----------
const BUILTIN = new Set(['TRUE', 'FALSE', 'YES', 'NO']);
const OPERAND_OPS = new Set(['setvar', 'addvar', 'subvar', 'random', 'give', 'giveitem', 'checkitem', 'removeitem', 'checkitemspace', 'checkmoney', 'removemoney', 'addmoney']);
// not `item`: Crystal names items without a prefix (`giveitem ANTIDOTE`), and an item
// stays a NAME — a computed item number is named back through ITEM_NUMBERS instead
const OPERAND_FIELDS = ['value', 'max', 'count', 'amount'];
// Operand symbols that NAME something (a species, an item, a map, a move...) stay
// symbolic: the engine reads those as names (givemon, buffers, specials), so
// turning them into numbers would break more than it fixes. Only counts, offsets
// and limits — NUM_*, FIRST_*, LAST_*, *_PRICE ... — are resolved for operands.
const NAME_PREFIX = /^(SPECIES|ITEM|MOVE|LOCALID|MAP|FLAG|VAR|TRAINER|OBJ_EVENT|SE|MUS|METATILE|DECOR|EVENT|ENGINE|TYPE|ABILITY|NATURE|STR|STD|TEXT|SPECIAL|SPRITE|BG|WEATHER|SONG|FANFARE|MULTI|EGG|BERRY_TREE|HOLE|CONTEST|LILYCOVE|DAY)_/;
const COUNT_LIKE = /^(NUM|FIRST|LAST|MAX|MIN)_|_(COUNT|SIZE|MEMBERS)$|_BERRIES(_SKIPPED)?$|_INDEX$/;
const wanted = new Map();          // symbol -> uses (branch comparisons — resolved exactly as before)
const wantedOperand = new Map();   // symbol -> uses (counts/limits used as op operands)
for (const f of fs.readdirSync(path.join(D, 'scripts'))) {
	if (!f.endsWith('.json') || f === '_index.json') continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'scripts', f), 'utf8'));
	for (const body of Object.values(j)) {
		if (!Array.isArray(body)) continue;
		for (const s of body) {
			const sym = v => typeof v === 'string' && !BUILTIN.has(v) && !/^B_OUTCOME_/.test(v) && !/^(VAR_|FLAG_)/.test(v) && isNaN(Number(v)) && /^[A-Z(][A-Z0-9_ ()+-]*$/.test(v);
			if (s?.op === 'branch' && s.cond?.var != null && sym(s.cond.value)) wanted.set(s.cond.value, (wanted.get(s.cond.value) || 0) + 1);
			// the operands of value ops: Route 114's berry man does
			// `random NUM_ROUTE_114_MAN_BERRIES` / `addvar VAR_RESULT, FIRST_BERRY_INDEX`;
			// an unknown operand stayed a string, so `random` gave 0 and `give` handed
			// over nothing — "The BAG is full" (2026-10-05)
			if (OPERAND_OPS.has(s?.op)) for (const f of OPERAND_FIELDS) {
				const v = s[f];
				// counts/offsets/limits only — an ENUM (SEAGALLOP_*, INGAME_TRADE_*, SCROLL_MULTI_*)
				// may be read back by name by an engine special (ow_story compares
				// VAR_0x8004 against 'SPECIAL_BATTLE_STEVEN'), so those stay symbolic
				if (sym(v) && !NAME_PREFIX.test(v) && COUNT_LIKE.test(v)) wantedOperand.set(v, (wantedOperand.get(v) || 0) + 1);
			}
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
const exprs = new Map();   // symbol -> [[expression, decomp]]
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
				if (m) { note(m[1], Number(m[2]), dec); continue; }
				// FIRST_BERRY_INDEX ITEM_CHERI_BERRY, NUM_X (LAST_X - FIRST_X + 1): kept as
				// expressions and evaluated once every plain number is known
				const e = /^\s*#define\s+([A-Z_][A-Z0-9_]*)\s+([A-Z0-9_ ()+-]*[A-Z_][A-Z0-9_ ()+-]*?)\s*(?:\/\/.*)?$/.exec(line);
				if (e && !/\(\s*[a-z]/.test(line)) (exprs.get(e[1]) || exprs.set(e[1], []).get(e[1])).push([e[2], dec]);
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
// evaluate the symbolic #defines: identifiers -> known single values, then a tiny
// + - ( ) parser (never eval). Repeat until nothing new resolves (chains of aliases).
const valueOf = n => { const m = found.get(n); return m && m.size === 1 ? [...m.keys()][0] : undefined; };
function arith(src) {
	const t = src.match(/\d+|[-+()]/g) || []; let i = 0;
	const prim = () => { const x = t[i++]; if (x === '(') { const v = sum(); i++; return v; } if (x === '-') return -prim(); return Number(x); };
	const sum = () => { let v = prim(); while (t[i] === '+' || t[i] === '-') { const o = t[i++]; const r = prim(); v = o === '+' ? v + r : v - r; } return v; };
	const v = sum(); return i === t.length && Number.isFinite(v) ? v : undefined;
}
for (let pass = 0; pass < 12; pass++) {
	let added = 0;
	for (const [name, list] of exprs) {
		if (found.has(name)) continue;
		for (const [ex, dec] of list) {
			let ok = true;
			const num = ex.replace(/[A-Z_][A-Z0-9_]*/g, id => { const v = valueOf(id); if (v === undefined) ok = false; return String(v); });
			if (!ok || /[^0-9 ()+-]/.test(num)) continue;
			const v = arith(num);
			if (v !== undefined) { note(name, v, dec + ' (expr)'); added++; }
		}
	}
	if (!added) break;
}
console.log(`constants harvested from the decomps: ${found.size}`);
// a symbol's values from PLAIN numeric #defines only (no evaluated expressions) —
// what branch comparisons have always been resolved from
const plainOf = sym => {
	const m = found.get(sym); if (!m) return null;
	const p = new Map([...m].map(([v, s]) => [v, s.filter(x => !/\(expr\)/.test(x))]).filter(([, s]) => s.length));
	return p.size ? p : null;
};
// every item number the decomps agree on, so a COMPUTED item (a random berry,
// FIRST_BERRY_INDEX + n) can be named back by events.js itemId. A SEPARATE table:
// resolveValue never turns an ITEM_ symbol into a number because of it.
const ITEM_NUMBERS = {};
// (placeholder names for unused slots — ITEM_094, ITEM_NONE, ITEM_UNUSED_* — are
// skipped: they share numbers with real items, and 148 must name the RAZZ BERRY)
for (const [n] of found) if (/^ITEM_/.test(n) && !/^ITEM_(\d+|NONE|UNUSED\w*|0\w*)$/.test(n)) { const p = plainOf(n); if (p && p.size === 1) ITEM_NUMBERS[n] = [...p.keys()][0]; }

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
	const m = plainOf(sym);   // branches: plain #defines only, exactly as before
	if (!m) { unresolved.push(`${sym} (${uses})`); continue; }
	if (m.size > 1) { conflicts.push(`${sym}: ${[...m].map(([v, s]) => `${v} in ${[...new Set(s)].join('/')}`).join(', ')}`); continue; }
	out[sym] = [...m.keys()][0];
}
// operands (counts/limits): plain OR evaluated (NUM_X (LAST_X - FIRST_X + 1))
const operandAdded = [], operandUnresolved = [];
for (const [sym, uses] of [...wantedOperand].sort((a, b) => b[1] - a[1])) {
	if (out[sym] !== undefined) continue;
	const m = found.get(sym);
	if (!m || m.size !== 1) { operandUnresolved.push(`${sym} (${uses}${m ? ', conflicting' : ''})`); continue; }
	out[sym] = [...m.keys()][0]; operandAdded.push(sym);
}
console.log(`\noperand symbols (counts/limits in setvar/addvar/random/give...): ${wantedOperand.size}; resolved ${operandAdded.length}; unresolved ${operandUnresolved.length}`);
for (const u of operandUnresolved.slice(0, 12)) console.log(`    ${u}`);
console.log(`\nresolved: ${Object.keys(out).length}`);
console.log(`conflicting across decomps (left unresolved on purpose): ${conflicts.length}`);
for (const c of conflicts.slice(0, 10)) console.log(`    ${c}`);
console.log(`not defined anywhere in the decomps: ${unresolved.length}`);
for (const u of unresolved.slice(0, 10)) console.log(`    ${u}`);

const covered = [...wanted].filter(([s]) => out[s] != null).reduce((a, [, n]) => a + n, 0);
const totalUses = [...wanted.values()].reduce((a, b) => a + b, 0);
console.log(`\ncomparisons that can now be true: ${covered} of ${totalUses}`);

// the table already shipped (incl. its few hand-set entries) is kept: a value may
// be ADDED here, never silently changed or dropped
{
	const prev = (await import(pathToFileURL(path.resolve('overworld/script_constants.js')).href)).SCRIPT_CONSTANTS;
	const changed = [];
	for (const [k, v] of Object.entries(prev)) { if (out[k] === undefined) out[k] = v; else if (out[k] !== v) { changed.push(`${k}: ${v} -> ${out[k]}`); out[k] = v; } }
	if (changed.length) console.log(`kept ${changed.length} existing value(s) that the decomps now compute differently:`, changed.slice(0, 8));
}

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

// Item numbers from the decomps (FRLG/Emerald agree on them), ONLY for naming a
// COMPUTED item back — Route 114's berry man gives FIRST_BERRY_INDEX + a random
// offset, a bare number. resolveValue does not use this table, so an ITEM_ symbol
// in a script is never turned into a number by it.
export const ITEM_NUMBERS = {
${Object.entries(ITEM_NUMBERS).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k, v]) => `\t${k}: ${v},`).join('\n')}
};
`);
	console.log('\nwrote overworld/script_constants.js');
} else {
	console.log('\n(dry run — pass --write)');
}
