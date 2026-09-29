// select_changed_test.mjs — the QUICK gate's suite selection (select-changed.mjs).
// Pure: synthetic changed files, diffs and suite sources; no browser, no git.
//
//   node overworld/tests/select_changed_test.mjs
import { selectSuites, tokensOf, changedCardIds, SMOKE } from './select-changed.mjs';

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
// core files fall back to the full gate
{
	const r = run(['overworld/ow_core.js']);
	A(r.full && r.suites.size === Object.keys(SUITES).length && /ow_core/.test(r.why), 'a core file runs the FULL gate');
	const r2 = run(['package.json']);
	A(r2.full, 'package.json runs the FULL gate');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
