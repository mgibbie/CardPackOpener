// select_changed_test.mjs — the QUICK gate's suite selection (select-changed.mjs).
// Pure: synthetic changed files, diffs and suite sources; no browser, no git.
//
//   node overworld/tests/select_changed_test.mjs
import { selectSuites, tokensOf, changedCardIds, SMOKE, LANES, laneOfSuite, laneOfPath } from './select-changed.mjs';
import { assignShards, parseShard, timingsFromLogs, DEFAULT_SECS } from './gate-shard.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// a tiny suite universe: the smoke set plus a few that name specific things
const SUITES = {
	'saveimport_test.mjs': "window.__ow.importSave(doc); 'ow-save'",
	'owsync_test.mjs': "pushOwForTest(); action 'ow-save'",
	'boardhand_test.mjs': "page.goto('/battlecards/index.html?players=2')",
	'duels_tribes_x_test.mjs': "byId.duels_brewster_the_brutal.tribe",
	'helper_user_test.mjs': "import { overworldSource } from './owsource.mjs'",
	'unrelated_test.mjs': "nothing to see here",
	'micasurvivor_dlc_base_unchanged_test.mjs': "golden runs of the base modes",
	'touchpad_css_test.mjs': "document.querySelector('#t-start')",
	'fluteui_test.mjs': "S.fluteState",
	'micatro_ui_test.mjs': "page.goto('/micatro/')",
	'micatro_server_test.mjs': "micatro-save",
	'micatro_engine_test.mjs': "every mod",
	'micasurvivor_boot_test.mjs': "boots",
	...Object.fromEntries(SMOKE.map(s => [s, "localStorage.setItem('magepunk_mp_token_v1', 't')"])),
};
const base = {
	suiteFiles: Object.keys(SUITES).sort(),
	suiteSource: f => SUITES[f] || '',
};
const run = (files, diffs = {}, contents = {}) => selectSuites({ ...base, files, diffFor: f => diffs[f] || '', contentFor: (f, w) => (contents[f] || {})[w] || '' });
const picked = r => [...r.suites.keys()];
const nonSmoke = r => picked(r).filter(s => !SMOKE.includes(s));

// the smoke set always runs; an unrelated doc change selects nothing else
{
	const r = run(['README.md', 'Plans/X.md']);
	A(!r.full && SMOKE.every(s => r.suites.has(s)) && nonSmoke(r).length === 0, 'docs only: just the smoke set', JSON.stringify(nonSmoke(r)));
}
// a changed suite runs itself; a changed helper runs its importers
{
	const r = run(['overworld/tests/owsync_test.mjs', 'overworld/tests/owsource.mjs']);
	A(r.suites.has('owsync_test.mjs'), 'a changed suite is selected');
	A(r.suites.has('helper_user_test.mjs') && !r.suites.has('unrelated_test.mjs'), 'a changed test helper selects the suites importing it');
}
// names on changed lines select the suites that mention them; comments do not
{
	const diff = [
		'@@ -1,3 +1,4 @@ export async function importSave(input, opts = {}) {',
		"+	if (action === 'ow-save') {",
		'+	// a comment mentioning boardhand and nothing else',
	].join('\n');
	const r = run(['overworld/ow_saves.js'], { 'overworld/ow_saves.js': diff });
	A(r.suites.has('saveimport_test.mjs') && r.suites.has('owsync_test.mjs'), 'a hunk\'s function and a server action select the suites naming them', JSON.stringify(nonSmoke(r)));
	A(!r.suites.has('boardhand_test.mjs') && !r.suites.has('unrelated_test.mjs'), 'comment text selects nothing');
}
// generic words never select
{
	const t = tokensOf(['@@ -1 +1 @@ function start(', '+const game = 1;', '+let side = 2;'].join('\n'), 'battlecards/game.js');
	A(!t.has('start') && !t.has('game') && !t.has('side'), 'short generic names are not tokens', JSON.stringify([...t]));
}
// a name a third of all suites mention is too common to select on
{
	const r = run(['overworld/ow_x.js'], { 'overworld/ow_x.js': "+	safeSaveStr('magepunk_mp_token_v1', t);" });
	A(nonSmoke(r).length === 0 && r.broad.includes('magepunk_mp_token_v1'), 'a name every suite seeds is reported as too common, not used', JSON.stringify({ broad: r.broad, extra: nonSmoke(r) }));
}
// cards.json: only the cards that actually changed
{
	const old = JSON.stringify({ cards: [{ id: 'duels_brewster_the_brutal', attack: 7 }, { id: 'other_card', attack: 1 }] });
	const neu = JSON.stringify({ cards: [{ id: 'duels_brewster_the_brutal', attack: 7, tribe: 'Beast' }, { id: 'other_card', attack: 1 }] });
	const ids = changedCardIds(old, neu);
	A(ids.size === 1 && ids.has('duels_brewster_the_brutal'), 'cards.json (one minified line) is compared card by card', JSON.stringify([...ids]));
	const r = run(['battlecards/cards.json'], {}, { 'battlecards/cards.json': { old, new: neu } });
	A(r.suites.has('duels_tribes_x_test.mjs') && r.battlecards, 'a changed card selects the suites naming it, and the Battlecards suite runs');
	A(r.suites.has('boardhand_test.mjs'), 'a Battlecards change selects the suites that load Battlecards');
	A(!r.suites.has('unrelated_test.mjs'), '...and nothing unrelated');
}
// MicaSurvivor DLC D0a: any micasurvivor/** source change, or a server change touching the msurv / micasurvivor
// actions, runs the base-unchanged golden test (whatever names the diff touches)
{
	const G = 'micasurvivor_dlc_base_unchanged_test.mjs';
	const r = run(['micasurvivor/js/systems/spawner.js'], { 'micasurvivor/js/systems/spawner.js': '+	x = 1;' });
	A(r.suites.has(G) && /MicaSurvivor/.test(r.suites.get(G)[0]), 'a micasurvivor/** change selects the DLC base-unchanged golden test', JSON.stringify(nonSmoke(r)));
	const r2 = run(['server/mp.mjs'], { 'server/mp.mjs': "@@ -2309,1 +2309,1 @@ export async function handle(\n+		if (action === 'msurv-lobby-create') { rs = body.rs;" });
	A(r2.suites.has(G), 'a server change touching an msurv action selects it');
	const r3 = run(['functions/api/mp.mjs'], { 'functions/api/mp.mjs': "@@ -10 +10 @@\n+	if (action === 'micasurvivor-save-put') {" });
	A(r3.suites.has(G), '...and so does one touching a micasurvivor-* action');
	const r4 = run(['server/mp.mjs'], { 'server/mp.mjs': "@@ -1 +1 @@\n+	if (action === 'ow-save') {" });
	A(!r4.suites.has(G), 'a server change elsewhere does not');
	const r5 = run(['micasurvivor/README.md', 'overworld/ow_x.js'], { 'overworld/ow_x.js': '+	y = 2;' });
	A(!r5.suites.has(G), 'nor does the MicaSurvivor README or an overworld change');
}
// core files fall back to the full gate
{
	const r = run(['overworld/ow_core.js']);
	A(r.full && r.suites.size === Object.keys(SUITES).length && /ow_core/.test(r.why), 'a core file runs the FULL gate');
	const r2 = run(['package.json']);
	A(r2.full, 'package.json runs the FULL gate');
}

// ---- the FULL trigger, narrowed (2026-10-26). Each case: the diff a real edit makes.
const hunk = (...lines) => ['@@ -1,1 +1,1 @@', ...lines].join('\n');
const quick = (file, diff) => run([file], { [file]: diff });
// overworld/index.html: only its boot (a non-/site/ <script>, an import map, a modulepreload) is FULL
{
	const css = quick('overworld/index.html', hunk('-		#t-start { right: 12px; top: 58px; }', '+		#t-start { right: 14px; top: 58px; }'));
	A(!css.full && css.suites.has('touchpad_css_test.mjs') && SMOKE.every(x => css.suites.has(x)), 'index.html CSS edit: QUICK, selects the suite naming #t-start + smoke (was FULL)', JSON.stringify({ full: css.full, why: css.why }));
	const tag = quick('overworld/index.html', hunk('+	<script type="module" src="/site/zoomfix.js"></script> <!-- iPhone: no stuck zoom -->'));
	A(!tag.full, 'index.html: adding a /site/ helper <script> tag is QUICK (was FULL)', tag.why);
	const markup = quick('overworld/index.html', hunk('+	<div class="tbtn" id="t-bag">BAG</div>'));
	A(!markup.full, 'index.html: a markup line is QUICK');
	const boot = quick('overworld/index.html', hunk('-	<script type="module" src="main.js"></script>', '+	<script type="module" src="main.js?v=2"></script>'));
	A(boot.full && /index\.html/.test(boot.why), 'index.html: the main.js boot tag is FULL', JSON.stringify(boot.why));
	const inline = quick('overworld/index.html', hunk('+	<script>window.__boot = 1;</script>'));
	A(inline.full, 'index.html: an inline <script> is FULL');
	const imap = quick('overworld/index.html', hunk('+	<script type="importmap">{"imports":{}}</script>'));
	A(imap.full, 'index.html: an import map is FULL');
	const pre = quick('overworld/index.html', hunk('+	<link rel="modulepreload" href="ow_core.js">'));
	A(pre.full, 'index.html: a modulepreload is FULL');
	const mixed = quick('overworld/index.html', hunk('+	#t-a { width: 70px; }', '+	<script type="module" src="ow_boot.js"></script>'));
	A(mixed.full, 'index.html: one boot line among CSS edits is still FULL');
	A(run(['overworld/index.html']).full, 'index.html with no readable diff is FULL (conservative)');
}
// ow_core.js: a comment edit is QUICK, any code is FULL
{
	const c = quick('overworld/ow_core.js', hunk('-// the display canvas', '+// the display canvas (scaled up)'));
	A(!c.full && SMOKE.every(x => c.suites.has(x)), 'ow_core.js comment-only edit: QUICK (smoke)', c.why);
	const code = quick('overworld/ow_core.js', hunk('+export const radio = new Radio();'));
	A(code.full && /ow_core/.test(code.why), 'ow_core.js code edit: FULL');
	A(quick('overworld/ow_core.js', hunk('+/* x */ export const y = 1;')).full, 'ow_core.js: code after a block comment on the same line is FULL');
}
// ow_state.js: declaring a field is QUICK and the field name selects; anything else is FULL
{
	const fld = quick('overworld/ow_state.js', hunk('+	fluteState: undefined,        // the glass-workshop flute in use'));
	A(!fld.full && fld.suites.has('fluteui_test.mjs'), 'ow_state.js new field: QUICK, selects the suite naming it', JSON.stringify({ why: fld.why, picked: nonSmoke(fld) }));
	A(quick('overworld/ow_state.js', hunk('+	fluteState: null,')).full, 'ow_state.js: a field with a real initial value is FULL');
	A(quick('overworld/ow_state.js', hunk('+export const T = {};')).full, 'ow_state.js: new code is FULL');
}
// package.json: a dependency version is FULL, an npm script is QUICK
{
	A(quick('package.json', hunk('-    "puppeteer-core": "^25.3.0"', '+    "puppeteer-core": "^26.0.0"')).full, 'package.json dependency bump: FULL');
	A(!quick('package.json', hunk('+    "deploy-x": "node tools/x.mjs && npx wrangler pages deploy .x --branch main",')).full, 'package.json npm-script edit: QUICK (was FULL)');
	A(run(['package-lock.json']).full, 'package-lock.json: FULL');
}
// lanes: a game's change adds its own smoke; every suite has exactly one lane
{
	const r = quick('micatro/js/ui.js', hunk('+	x = 1;'));
	A(!r.full && r.suites.has('micatro_ui_test.mjs') && r.suites.has('micatro_server_test.mjs') && r.lanes.includes('micatro'), 'a micatro/** change runs the micatro lane smoke', JSON.stringify(r.lanes));
	A(!r.suites.has('micasurvivor_boot_test.mjs'), "...not another lane's smoke");
	const r2 = quick('micasurvivor/js/game.js', hunk('+	y = 2;'));
	A(r2.suites.has('micasurvivor_boot_test.mjs') && !r2.suites.has('micatro_ui_test.mjs'), 'a micasurvivor/** change runs the micasurvivor lane smoke');
	A(laneOfSuite('micatro_engine_test.mjs') === 'micatro' && laneOfSuite('designwiki_micatro_test.mjs') === 'micatro' && laneOfSuite('micasurvivor_tower_test.mjs') === 'micasurvivor'
		&& laneOfSuite('designwiki_sync_test.mjs') === 'designwiki' && laneOfSuite('doubles_test.mjs') === 'overworld', 'suites map to their lane (overworld is the default)');
	A(laneOfPath('overworld/pokechess/engine.js') === 'overworld' && laneOfPath('server/mp.mjs') === null, 'paths map to a lane (server/ is shared: no lane)');
	A(LANES.every(l => l.smoke.every(x => laneOfSuite(x) === l.name)), "each lane's smoke suites belong to that lane");
}
// sharding: every suite in exactly one shard, deterministic, balanced on the committed timings
{
	const t = { 'a.mjs': 260, 'b.mjs': 100, 'c.mjs': 90, 'd.mjs': 80, 'e.mjs': 10 };
	const all = ['e.mjs', 'd.mjs', 'c.mjs', 'b.mjs', 'a.mjs', 'new_test.mjs'];
	const s3 = assignShards(all, 3, t);
	const flat = s3.flatMap(b => b.suites);
	A(flat.length === all.length && new Set(flat).size === all.length, 'every suite lands in exactly one shard');
	A(JSON.stringify(assignShards([...all].reverse(), 3, t)) === JSON.stringify(s3), 'the split does not depend on the input order');
	A(s3[0].suites[0] === 'a.mjs' && s3[0].suites.length === 1 && Math.max(...s3.map(b => b.secs)) === 260, 'the longest suite gets a shard to itself; no shard exceeds it', JSON.stringify(s3));
	A(s3.some(b => b.suites.includes('new_test.mjs')) && s3.reduce((a, b) => a + b.secs, 0) === 540 + DEFAULT_SECS, 'a suite with no timing counts DEFAULT_SECS');
	A(assignShards(['x.mjs'], 4, {}).filter(b => !b.suites.length).length === 3, 'more shards than suites: the extras are empty (they pass)');
	let threw = 0; for (const bad of ['0/4', '5/4', '2', 'a/b']) try { parseShard(bad); } catch (e) { threw++; }
	A(threw === 4 && parseShard('3/16').i === 3 && parseShard('3/16').n === 16, '--shard i/n is validated');
	const tl = timingsFromLogs(['ok    a_test.mjs (12s): 3 passed\nFAIL  b_test.mjs (40s): 1 failed', 'ok    a_test.mjs (15s): 3 passed']);
	A(tl['a_test.mjs'] === 15 && !('b_test.mjs' in tl), 'timings come from passing runs, the later log winning');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
