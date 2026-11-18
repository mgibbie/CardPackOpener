// pocketenhanced_history_test.mjs — the match history (owner's second improvement list, 2026-11-18, "yes to all": "Match
// history: a list of your last 20 matches with the result, decks and a replay link"). pocketenhanced/js/main.js
// historyRow/historyPick/matchKind, save.js MAX_REPLAYS.
//   1. a won match and a lost one: the history's rows say Win / Loss, who it was against, the score, what kind of match
//      and the deck I played, newest first
//   2. a row opens Watch the replay (which plays it) and Copy replay link
//   3. it keeps the last 20 (was 12); an old entry kept before this change still shows
//   node overworld/tests/pocketenhanced_history_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
		localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true }));
		// an entry kept before this change: no you/won/kind/deck
		localStorage.setItem('magepunk_pocket_replays_v1', JSON.stringify([{ at: 1700000000000, summary: { players: [{ name: 'Red', points: 3 }, { name: 'Blue', points: 1 }], winner: 'Red', turns: 9 }, recipe: { v: 1, config: { seed: 'old', players: [] }, actions: [] } }])); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	// play a match to its end: seat 0 wins (or loses) by the other conceding
	const playTo = async (winner, seed) => page.evaluate(async (w, seed) => {
		const P = window.__pocket; P.fast && P.fast(true); P.start({ players: 2, seed });
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		for (let n = 0; n < 3000 && !P.state().over; n++) { const S = P.state();
			if (S.phase === 'main' && S.turn >= 3) { await P.act({ t: 'concede', seat: 1 - w }); continue; }
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); }
		return P.state().over && P.state().over.winner; }, winner, seed);
	const w1 = await playTo(0, 'hist1'); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	await page.evaluate(() => document.querySelector('.modal [data-k="leave"]').click()); await sleep(400);
	const w2 = await playTo(1, 'hist2'); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	await page.evaluate(() => document.querySelector('.modal [data-k="leave"]').click()); await sleep(400);
	A(w1 === 0 && w2 === 1, '(a won match, then a lost one)', [w1, w2]);
	// ===== 1. the rows =====
	await page.evaluate(() => document.querySelector('[data-k="replays"]').click()); await sleep(400);
	const rows = await page.evaluate(() => ({ title: (document.querySelector('.modal:last-child h2, .modal:last-child .title') || {}).textContent || '', btn: '', rows: [...document.querySelectorAll('.modal:last-child .pe-hist')].map(e => e.textContent) }));
	const deck = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pocket_replays_v1'))[0].summary.deck || '');
	A(rows.rows.length === 3, 'the history: my two matches and the one kept from before', rows.rows);
	A(/^Loss vs /.test(rows.rows[0]) && /^Win vs /.test(rows.rows[1]) && /Match/.test(rows.rows[0]) && !!deck && rows.rows[0].includes(deck), 'newest first: "Loss vs …", then "Win vs …", each with the kind of match and my deck', { rows: rows.rows, deck });
	A(/\d+–\d+/.test(rows.rows[1]), 'with the score (mine first)', rows.rows[1]);
	A(/Red won/.test(rows.rows[2]), 'an entry kept before this change still shows ("Red won")', rows.rows[2]);
	// ===== 2. a row's choices =====
	await page.evaluate(() => document.querySelector('.modal:last-child [data-k="r1"]').click()); await sleep(300);
	const pick = await page.evaluate(() => ({ watch: !!document.querySelector('[data-k="hwatch"]'), link: !!document.querySelector('[data-k="hlink"]') }));
	A(pick.watch && pick.link, 'a row opens "Watch the replay" and "Copy replay link"', pick);
	await page.evaluate(() => document.querySelector('[data-k="hwatch"]').click()); await sleep(500);
	A(await page.evaluate(() => window.__pocket.mode === 'replay' || (typeof window.__pocket.mode === 'function' && window.__pocket.mode() === 'replay')), 'Watch the replay plays it');
	// ===== 3. 20 kept =====
	const kept = await page.evaluate(async () => { const SV = await import('/pocketenhanced/js/save.js'); for (let i = 0; i < 25; i++) SV.addReplay({ seed: 'k' + i, players: [] }, [], { players: [], winner: null }); return SV.listReplays().length; });
	A(kept === 20, 'it keeps the last 20 (was 12)', kept);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
