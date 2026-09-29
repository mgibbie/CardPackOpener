// select-changed.mjs — which gate suites a change can affect (the QUICK gate).
//
// The full overworld gate is ~170 suites and ~35 minutes serial on a small
// machine. Most changes touch one area, so `run-all.mjs --changed` runs:
//   1. every suite whose own file (or a helper it imports) changed,
//   2. every suite that NAMES something the change touched: an identifier
//      defined or edited in a changed hunk, the enclosing function of a hunk,
//      a quoted action/key string on a changed line, or the changed module's
//      file name,
//   3. a fixed SMOKE set (~1 minute) that boots the game and walks the core
//      loops, whatever changed,
// and falls back to the FULL gate when a change touches shared core files (or
// the selection machinery itself), where "which suites care" is everything.
// The full gate still runs before big batches / overnight; this is the
// per-merge check.
import { execSync } from 'child_process';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../..');

// ~1 minute, broad: boot, saves, reset, battles, progression, menus, warps
export const SMOKE = [
	'boot_smoke.mjs', 'savesafety_test.mjs', 'owreset_test.mjs', 'doubles_test.mjs', 'progression_test.mjs',
	'mobile_test.mjs', 'crossregion_test.mjs', 'townmap_test.mjs', 'trainercard_test.mjs', 'movemechanics_test.mjs',
	'frontier_test.mjs', 'backwarp_test.mjs', 'warpfade_test.mjs', 'qolsweep_test.mjs', 'inputs_test.mjs', 'portals_test.mjs',
];
// a change here can reach any suite: run everything
export const CORE = [
	// (main.js is not here: after the split it is ~950 lines of wiring, and its
	// edits are matched by name like any other module's)
	/^overworld\/ow_core\.js$/, /^overworld\/ow_state\.js$/, /^overworld\/index\.html$/,
	/^package(-lock)?\.json$/,
	// (the gate's own files are not here: a quick run exercises them directly,
	// and a helper like owsource.mjs selects the suites that import it)
];
// never affects a suite
const IGNORE = [/\.(md|txt|png|jpg|jpeg|gif|webp|svg|ico|wav|mp3|ogg)$/i, /^Plans\//, /^wiki\//, /^\.github\//, /^docs?\//];
// identifiers too generic to select on
const STOP = new Set(['function', 'const', 'return', 'export', 'import', 'await', 'async', 'catch', 'finally', 'false', 'true', 'null', 'undefined',
	'this', 'else', 'while', 'break', 'continue', 'typeof', 'length', 'push', 'state', 'player', 'value', 'result', 'error', 'string', 'number',
	'object', 'items', 'index', 'count', 'name', 'type', 'data', 'list', 'keys', 'text', 'self', 'card', 'cards', 'test', 'tests', 'page',
	'window', 'document', 'console', 'localStorage', 'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Promise', 'Date', 'Error',
	'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'getElementById', 'setTimeout', 'clearTimeout',
	'requestAnimationFrame', 'dispatchEvent', 'preventDefault', 'stopPropagation', 'getContext', 'createElement', 'appendChild', 'register']);

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 2 ** 20 });

// the files a change touches: committed since the merge base with main, plus
// uncommitted and untracked source
export function changedFiles(base) {
	const out = new Set();
	const add = s => s.split('\n').map(x => x.trim().replace(/\\/g, '/')).filter(Boolean).forEach(f => out.add(f));
	let mb = null;
	try { mb = git(`merge-base HEAD ${base || 'origin/main'}`).trim(); } catch (e) {}
	if (mb) add(git(`diff --name-only ${mb} HEAD`));
	add(git('diff --name-only HEAD'));
	add(git('ls-files --others --exclude-standard -- "*.js" "*.mjs" "*.html" "*.css" "*.json"'));
	return { files: [...out], mb };
}
// the diff text for one file (committed + uncommitted), or '' for untracked
function diffOf(file, mb) {
	let d = '';
	try { if (mb) d += git(`diff -U0 ${mb} -- "${file}"`); } catch (e) {}
	try { d += git(`diff -U0 HEAD -- "${file}"`); } catch (e) {}
	if (!d && existsSync(join(ROOT, file))) {   // untracked: the whole file is the change
		try { d = readFileSync(join(ROOT, file), 'utf8').split('\n').map(l => '+' + l).join('\n'); } catch (e) {}
	}
	return d;
}
// a name specific enough to select on: camelCase, snake/kebab-case, or long
const specific = s => !STOP.has(s) && (/[a-z][A-Z]/.test(s) || /[_-]/.test(s) || s.length >= 8);
// names the change touches: defined or edited on changed (non-comment) lines,
// hunk contexts, quoted action/key strings on changed lines
export function tokensOf(diff, file) {
	const t = new Set();
	const bn = basename(file).replace(/\.(m?js|json|html|css)$/, '');
	if (specific(bn)) t.add(bn);
	const json = /\.json$/.test(file);
	for (const line of diff.split('\n')) {
		const hunk = line.match(/^@@[^@]*@@\s*(.*)$/);
		if (hunk) { if (!json) for (const m of hunk[1].matchAll(/(?:function\s+|const\s+|let\s+|class\s+|^\s*)([A-Za-z_$][\w$]{3,})\s*(?:\(|=)/g)) t.add(m[1]); continue; }
		if (!/^[+-]/.test(line) || /^(\+\+\+|---)/.test(line)) continue;
		let body = line.slice(1);
		if (/^\s*(\/\/|\*|\/\*)/.test(body)) continue;                // a comment line
		body = body.replace(/\s\/\/ .*$/, '');                        // a trailing comment
		for (const m of body.matchAll(/'(magepunk_[a-z0-9_]+)'/g)) t.add(m[1]);                                          // save keys
		if (json) continue;   // JSON: data, not code (cards.json is handled by id)
		for (const m of body.matchAll(/(?:function\s*\*?\s*|const\s+|let\s+|var\s+|class\s+)([A-Za-z_$][\w$]{3,})/g)) t.add(m[1]);
		for (const m of body.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]{3,})\s*\([^)]*\)\s*\{/g)) t.add(m[1]);           // method shorthand
		for (const m of body.matchAll(/register\(\s*'([\w-]{4,})'/g)) t.add(m[1]);                                         // effect handlers
		for (const m of body.matchAll(/action === '([\w-]{4,})'/g)) t.add(m[1]);                                         // server actions
	}
	for (const s of [...t]) if (!specific(s)) t.delete(s);
	return t;
}
// cards.json is ONE minified line: every edit "changes" every card. Compare the
// two versions card by card and name only the cards that actually differ.
export function changedCardIds(oldText, newText) {
	const byId = txt => { try { return new Map((JSON.parse(txt).cards || []).map(c => [c.id, JSON.stringify(c)])); } catch (e) { return new Map(); } };
	const a = byId(oldText), b = byId(newText), out = new Set();
	for (const [id, v] of b) if (a.get(id) !== v) out.add(id);
	for (const id of a.keys()) if (!b.has(id)) out.add(id);
	return out;
}

// -> { full: bool, why: string|null, suites: Map<file, reasons[]>, changed, battlecards: bool }
export function selectSuites({ base, files: filesIn, diffFor, contentFor, suiteFiles, suiteSource } = {}) {
	const { files, mb } = filesIn ? { files: filesIn, mb: null } : changedFiles(base);
	// (old, new) text of a file: for cards.json's per-card comparison
	const content = contentFor || ((f, which) => {
		try { return which === 'old' ? (mb ? git(`show ${mb}:${f}`) : '') : readFileSync(join(ROOT, f), 'utf8'); } catch (e) { return ''; }
	});
	const allSuites = suiteFiles || [...readdirSync(here).filter(f => f.endsWith('_test.mjs')), 'boot_smoke.mjs', 'quest_reach.mjs'].sort();
	const src = suiteSource || (f => { try { return readFileSync(join(here, f), 'utf8'); } catch (e) { return ''; } });
	const getDiff = diffFor || (f => diffOf(f, mb));
	const suites = new Map(), broad = new Set();
	const pick = (f, why) => { if (!allSuites.includes(f)) return; if (!suites.has(f)) suites.set(f, []); if (!suites.get(f).includes(why)) suites.get(f).push(why); };
	const relevant = files.filter(f => !IGNORE.some(r => r.test(f)) && !/^overworld\/data\//.test(f));
	const core = relevant.find(f => CORE.some(r => r.test(f)));
	const battlecards = relevant.some(f => /^(battlecards|server)\//.test(f));
	if (core) return { full: true, why: `core file changed: ${core}`, suites: new Map(allSuites.map(f => [f, ['full gate']])), changed: files, battlecards };
	const texts = new Map(allSuites.map(f => [f, src(f)]));
	for (const f of relevant) {
		const m = f.match(/^overworld\/tests\/([^/]+\.mjs)$/);
		if (m && allSuites.includes(m[1])) { pick(m[1], 'the suite itself changed'); continue; }
		if (m) {   // a shared test helper: the suites that import it
			// a real import (static or dynamic), not a mention in a comment
			const name = m[1].replace(/\.mjs$/, '').replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
			const imp = new RegExp(`(from\\s*|import\\(\\s*)['"]\\./${name}(\\.mjs)?['"]`);
			for (const [s, t] of texts) if (imp.test(t)) pick(s, `imports ${m[1]}`);
			continue;
		}
		const toks = /(^|\/)cards\.json$/.test(f) ? changedCardIds(content(f, 'old'), content(f, 'new')) : tokensOf(getDiff(f), f);
		for (const tok of toks) {
			const re = new RegExp(`(^|[^\\w$-])${tok.replace(/[$]/g, '\\$')}([^\\w$-]|$)`);
			const hits = [...texts].filter(([, t]) => re.test(t)).map(([s]) => s);
			// a name a third of all suites mention (the login keys every suite
			// seeds, DOM plumbing) says nothing about WHICH suites care: the smoke
			// set covers it, and it is listed so the choice is visible
			if (hits.length > allSuites.length / 3) { broad.add(tok); continue; }
			for (const s of hits) pick(s, `${basename(f)}: ${tok}`);
		}
		// Battlecards pages are exercised by the suites that load them
		if (/^battlecards\//.test(f)) for (const [s, t] of texts) if (/battlecards\/index\.html/.test(t)) pick(s, 'loads Battlecards');
	}
	for (const s of SMOKE) pick(s, 'smoke');
	return { full: false, why: null, suites, changed: files, battlecards, broad: [...broad] };
}

// `node overworld/tests/select-changed.mjs` prints the selection
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const r = selectSuites({ base: process.argv[2] });
	console.log(`changed: ${r.changed.length} file(s)`);
	if (r.full) console.log(`FULL gate: ${r.why}`);
	else for (const [s, why] of r.suites) console.log(`  ${s}  <- ${why.slice(0, 3).join('; ')}${why.length > 3 ? ` (+${why.length - 3})` : ''}`);
	if (r.broad && r.broad.length) console.log(`  (too common to select on: ${r.broad.join(', ')})`);
	console.log(`${r.suites.size} suite(s)${r.battlecards ? ' + the battlecards suite' : ''}`);
}
