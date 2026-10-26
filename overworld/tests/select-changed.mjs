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
// a change here can reach any suite: run everything. An entry may carry
// `quick(changedLines)`: when EVERY changed line passes it (and there is at least
// one), the change cannot reach the shared boot path, so the file is selected by
// name like any other (plus the smoke set) instead of forcing FULL. No diff at all
// (an unreadable or untracked file) is always FULL.
// (main.js is not here: after the split it is ~950 lines of wiring, and its
// edits are matched by name like any other module's)
// (the gate's own files are not here: a quick run exercises them directly,
// and a helper like owsource.mjs selects the suites that import it)
// a whole <script src="/site/x.js"></script> tag (+ an optional trailing <!-- note -->): a shared site helper, not the game's boot
const SITE_HELPER_TAG = /^\s*<script\b[^>]*\bsrc=["']\/site\/[\w.-]+\.js["'][^>]*>\s*<\/script>\s*(<!--.*-->\s*)?$/i;
const commentOrBlank = l => /^\s*$/.test(l) || (/^\s*(\/\/|\/\*|\*)/.test(l) && !/\*\/\s*\S/.test(l));
export const CORE = [
	// the shared singletons every overworld module imports: only a comment edit is quick
	{ re: /^overworld\/ow_core\.js$/, quick: commentOrBlank },
	// the shared state object: its fields are documentation (main.js assigns them), so
	// adding/removing a `name: undefined,  // note` field is quick, and the field name selects
	{ re: /^overworld\/ow_state\.js$/, quick: l => commentOrBlank(l) || /^\s*[A-Za-z_$][\w$]*:\s*undefined,?\s*(\/\/.*)?$/.test(l) },
	// the overworld page: FULL only when its boot changes — a <script> tag that is not a
	// /site/ helper (main.js IS the game), an import map or a modulepreload. CSS, markup
	// and /site/ helper tags select by name + the overworld lane's smoke.
	{ re: /^overworld\/index\.html$/, quick: l => !/importmap|modulepreload/i.test(l) && (!/<\/?script\b/i.test(l) || SITE_HELPER_TAG.test(l)) },
	// dependencies: FULL when a version spec changes ("pkg": "^1.2.3"); a script line is quick
	{ re: /^package\.json$/, quick: l => !/"[@\w./-]+"\s*:\s*"[\^~<>=]*\s*\d/.test(l) },
	{ re: /^package-lock\.json$/ },
];
// the changed (+/-) lines of a unified diff, without the file headers
export const changedLines = diff => diff.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)( |$)/.test(l)).map(l => l.slice(1).replace(/\r$/, ''));
// is this changed core file one that forces FULL? (see CORE's `quick`)
export function forcesFull(entry, diff) {
	if (!entry.quick) return true;
	const lines = changedLines(diff || '');
	return !lines.length || !lines.every(entry.quick);
}
// PER-GAME LANES. Each game (or sub-game) owns a folder and a set of suites. A change
// under a lane's paths adds that lane's own smoke suites (on top of the global SMOKE and
// the by-name selection), so a game's core loop is always exercised by its own changes.
// `run-all.mjs --lane <name>` runs a whole lane. A new game appends one row: its paths,
// a suite-name pattern, and 1-3 cheap suites that boot it.
// (overworld is the default lane: suites no other lane claims)
export const LANES = [
	{ name: 'micatro', paths: /^micatro\//, suites: /^micatro_|^(designwiki|magepunknews)_micatro/, smoke: ['micatro_ui_test.mjs', 'micatro_server_test.mjs'] },
	{ name: 'micasurvivor', paths: /^micasurvivor\//, suites: /micasurvivor/, smoke: ['micasurvivor_boot_test.mjs'] },
	{ name: 'designwiki', paths: /^designwiki\//, suites: /^designwiki_/, smoke: [] },
	// (Battlecards' engine has its own node suite, battlecards/tests/run-all.mjs, with its own CI job;
	// its pages are exercised by the suites that load battlecards/index.html, see selectSuites)
	{ name: 'overworld', paths: /^overworld\//, suites: null, smoke: [] },   // null: every suite the other lanes don't claim; SMOKE is its smoke
];
export const laneOfSuite = s => (LANES.find(l => l.suites && l.suites.test(s)) || LANES.find(l => !l.suites)).name;
export const laneOfPath = f => (LANES.find(l => l.paths.test(f)) || {}).name || null;
// suites a PATH always selects, whatever its diff names. MicaSurvivor DLC D0a: the "base unchanged" golden runs
// (micasurvivor_dlc_base_unchanged_test.mjs) guard every base mode, so any micasurvivor/** change runs them, and so
// does a server change whose diff (its lines or its hunk headers) touches the MicaSurvivor / msurv actions. DLC D0b adds
// the same runs with the Expedition code force-loaded and the Expedition plumbing test.
export const BY_PATH = [
	{ re: /^micasurvivor\//, suites: ['micasurvivor_dlc_base_unchanged_test.mjs', 'micasurvivor_expedition_forceload_test.mjs', 'micasurvivor_expedition_plumbing_test.mjs'], why: 'MicaSurvivor changed: the DLC base-unchanged golden runs (also with the Expedition code loaded) and the Expedition plumbing' },
	// (DLC D2: the Expedition's own code, and the base files it hooks into, select its terrain and movement suites)
	{ re: /^micasurvivor\/js\/(expedition\/|world\/world\.js|entities\/player\.js|systems\/combat\.js|core\/pad\.js|ui\/hud\.js|ui\/watch-ui\.js|net\/coop\.js|mica\/replay\.js)/, suites: ['micasurvivor_expedition_terrain_test.mjs', 'micasurvivor_expedition_movement_test.mjs'], why: 'the Expedition code (or a base file it hooks into) changed: its terrain layers and movement verbs' },
	// (DLC D3: Expedition · Classic, and the base files it hooks into, select its suite)
	{ re: /^micasurvivor\/js\/(expedition\/|systems\/expedition\.js|systems\/spawner\.js|entities\/enemy\.js|game\.js|ui\/hud\.js|ui\/run-ui\.js|ui\/modes-ui\.js|ui\/watch-ui\.js|net\/coop\.js|mica\/replay\.js|mica\/spectate\.js)/, suites: ['micasurvivor_expedition_classic_test.mjs'], why: 'the Expedition code (or a base file it hooks into) changed: Expedition · Classic (zones, timeline, guardian, portal, shrine, victory, viewers)' },
	{ re: /^(server|functions)\//, diff: /micasurvivor|msurv/i, suites: ['micasurvivor_dlc_base_unchanged_test.mjs', 'micasurvivor_expedition_plumbing_test.mjs', 'micasurvivor_server_test.mjs'], why: 'the MicaSurvivor server actions changed: the DLC base-unchanged golden runs, the Expedition plumbing and the server actions' },
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
		if (/\.(html|css)$/.test(file)) for (const m of body.matchAll(/(?:[#.]|\b(?:id|class)=["'])([A-Za-z][\w-]{2,})/g)) t.add(m[1]);   // page ids/classes (#t-start, class="tbtn")
		for (const m of body.matchAll(/(?:function\s*\*?\s*|const\s+|let\s+|var\s+|class\s+)([A-Za-z_$][\w$]{3,})/g)) t.add(m[1]);
		for (const m of body.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]{3,})\s*\([^)]*\)\s*\{/g)) t.add(m[1]);           // method shorthand
		for (const m of body.matchAll(/register\(\s*'([\w-]{4,})'/g)) t.add(m[1]);                                         // effect handlers
		for (const m of body.matchAll(/action === '([\w-]{4,})'/g)) t.add(m[1]);                                         // server actions
		for (const m of body.matchAll(/^\s*([A-Za-z_$][\w$]{3,}):\s*undefined\b/g)) t.add(m[1]);                          // a declared state field (ow_state.js)
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
	const battlecards = relevant.some(f => /^(battlecards|server)\//.test(f));
	// a core file forces FULL unless its whole diff is one its CORE entry calls quick
	const quickCore = [];
	for (const f of relevant) {
		const entry = CORE.find(c => c.re.test(f));
		if (!entry) continue;
		if (forcesFull(entry, getDiff(f))) return { full: true, why: `core file changed: ${f}`, suites: new Map(allSuites.map(s => [s, ['full gate']])), changed: files, battlecards };
		quickCore.push(f);
	}
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
		for (const r of BY_PATH) if (r.re.test(f) && (!r.diff || r.diff.test(getDiff(f)))) for (const s of r.suites) pick(s, r.why);
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
	// each lane a change touches adds that lane's own smoke suites
	const lanes = [...new Set(relevant.map(laneOfPath).filter(Boolean))];
	for (const name of lanes) for (const s of LANES.find(l => l.name === name).smoke) pick(s, `${name} lane smoke`);
	for (const s of SMOKE) pick(s, 'smoke');
	return { full: false, why: null, suites, changed: files, battlecards, broad: [...broad], lanes, quickCore };
}

// `node overworld/tests/select-changed.mjs` prints the selection
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const r = selectSuites({ base: process.argv[2] });
	console.log(`changed: ${r.changed.length} file(s)`);
	if (r.full) console.log(`FULL gate: ${r.why}`);
	else if (r.quickCore.length) console.log(`(core file(s) with a quick-safe diff, selected by name: ${r.quickCore.join(', ')})`);
	else for (const [s, why] of r.suites) console.log(`  ${s}  <- ${why.slice(0, 3).join('; ')}${why.length > 3 ? ` (+${why.length - 3})` : ''}`);
	if (r.broad && r.broad.length) console.log(`  (too common to select on: ${r.broad.join(', ')})`);
	console.log(`${r.suites.size} suite(s)${r.battlecards ? ' + the battlecards suite' : ''}`);
}
