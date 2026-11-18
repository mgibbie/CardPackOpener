// pocketenhanced_draft_test.mjs — Draft (owner's second improvement list, 2026-11-18, "yes to all": "Draft and Sealed.
// Open a few packs on the spot, build a 20-card deck from only those cards, then play a short run"). draft.js, main.js.
//   1. the rules: 8 packs of a regular booster (no special packs); every booster's pool builds a legal deck, for me and
//      for each computer player; the same seed opens the same packs; a deck may hold no more of a card than the packs
//   2. the run: three results, paid once by the wins (50/150/300/600); a stored run read back, anything else is none
//   3. the page: Draft costs 200 ★ (too few: it says so); Enter opens the packs; Finish this deck builds from them;
//      three matches (won, lost, won), "Next draft match" between; "Draft over: 2 wins of 3: +300 ★" with the stars;
//      the drafted cards did not join the collection
//   node overworld/tests/pocketenhanced_draft_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import * as DR from '../../pocketenhanced/js/draft.js';
import { card } from '../../pocketenhanced/js/data/cards.js';
import { SPECIAL_PACKS } from '../../pocketenhanced/js/collection.js';

const R = makeAsserter(), A = R.A;
// ===== 1 =====
A(DR.DRAFT_BOOSTERS.length > 20 && !DR.DRAFT_BOOSTERS.some(b => SPECIAL_PACKS[b.id]), 'draft boosters: the regular ones, no special pack');
{
	const bad = [];
	for (const b of DR.DRAFT_BOOSTERS) for (let s = 0; s < 3; s++) {
		const run = DR.newRun(b.id, 'x' + s), d = DR.poolDeck(run.pool), o = DR.opponent(run, s);
		if (run.pool.length !== 40 || DR.draftDeckError(run.pool, d.deck, d.energy) || DR.draftDeckError(DR.openPool(b.id, run.seed + ':cpu' + s), o.deck, o.energy)) bad.push(b.id + s);
	}
	A(!bad.length, 'every booster: 8 packs (40 cards) build a legal deck, mine and each computer player\'s', bad);
	const r1 = DR.newRun('C', 'same'), r2 = DR.newRun('C', 'same');
	A(r1.pool.join() === r2.pool.join() && DR.opponent(r1, 1).deck.join() === DR.opponent(r2, 1).deck.join(), 'the same seed: the same packs and the same opponents');
	const one = r1.pool.find(id => DR.poolCount(r1.pool, id) === 1), d = DR.poolDeck(r1.pool);
	const two = d.deck.filter(x => x !== one).slice(0, 18).concat([one, one]);
	A(!!one && /your packs hold 1/.test(DR.draftDeckError(r1.pool, two, d.energy) || ''), 'two of a card the packs hold once: refused', DR.draftDeckError(r1.pool, two, d.energy));
}
// ===== 2 =====
{
	let run = DR.newRun('P', 'pay'), paid = 0;
	for (const res of ['won', 'lost', 'won']) { const r = DR.recordResult(run, res); run = r.run; paid += r.pay; }
	A(paid === 300 && run.paid === 300 && DR.over(run), 'won, lost, won: 300 stars, paid when the third ends');
	A(DR.recordResult(run, 'won').pay === 0, 'a result after the end pays nothing');
	A(DR.readRun(JSON.parse(JSON.stringify(run))).results.join() === 'won,lost,won' && DR.readRun({ v: 9 }) === null && DR.readRun(null) === null && DR.readRun({ v: 1, booster: 'nope', pool: [] }) === null, 'a stored run reads back; anything else is none');
}
// ===== 3. the page =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/?seed=draftpg`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e && !e.disabled) { e.click(); return true; } return false; }, k);
	const stars = () => page.evaluate(() => window.__pocket.stars());
	// too few stars: spend them all first
	const all = await stars(); await page.evaluate(async n => { const S = await import('/site/stars.js'); S.spend(n); }, all);
	await click('draft'); await sleep(300);
	A(await page.evaluate(() => document.querySelector('[data-k="denter"]').disabled && /Not enough stars/.test(document.querySelector('.modal:last-child').textContent)), 'too few stars: Enter is off, and it says why');
	await page.evaluate(() => window.__pocket.earnStars(1000)); await page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } });
	const col0 = await page.evaluate(async () => JSON.stringify((await import('/pocketenhanced/js/save.js')).collection().prints));
	await click('draft'); await sleep(300);
	const s0 = await stars();
	await click('denter'); await sleep(400);
	A((await stars()) === s0 - 200 && await page.evaluate(() => document.querySelectorAll('.pe-draftpool .pf, .pe-draftpool > *').length >= 40), 'Enter: 200 stars, and the 8 packs (40 cards) are shown', { s0, s1: await stars() });
	await click('dbuild'); await sleep(300);
	await click('dfinish'); await sleep(300);
	A(await page.evaluate(() => /20 \/ 20 cards · ready/.test(document.querySelector('.pe-db .mine').textContent)), 'Finish this deck: 20 cards from the packs, ready');
	const playTo = async win => page.evaluate(async win => {
		const P = window.__pocket; P.fast && P.fast(true);
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		for (let n = 0; n < 3000 && !P.state().over; n++) { const S = P.state();
			if (S.phase === 'main' && S.turn >= 3) { await P.act({ t: 'concede', seat: win ? 1 : 0 }); continue; }
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); }
		return P.state().over && P.state().over.winner; }, win);
	await click('dplay'); await sleep(600);
	A(await page.evaluate(() => window.__pocket.recipe().config.draft === 0 && /Draft rival/.test(window.__pocket.recipe().config.players[1].name)), 'match 1 of 3 against a computer player who drafted');
	const results = [];
	for (const [i, win] of [[0, true], [1, false], [2, true]]) {
		results.push(await playTo(win));
		await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
		const note = await page.evaluate(() => (document.querySelector('.pe-draftnote') || {}).textContent || '');
		if (i < 2) { A(/so far/.test(note) && await page.evaluate(() => !!document.querySelector('[data-k="draftnext"]')), `after match ${i + 1}: the run so far, and "Next draft match"`, note); await click('draftnext'); await sleep(600); }
		else {
			const s2 = await stars();
			A(/Draft over: 2 wins of 3: \+300 ★/.test(note), '"Draft over: 2 wins of 3: +300 ★"', note);
			A(s2 >= s0 - 200 + 300, 'and the 300 stars are in the wallet', { s0, s2 });
		}
	}
	A(results.join() === '0,1,0', '(won, lost, won)', results);
	const col1 = await page.evaluate(async () => JSON.stringify((await import('/pocketenhanced/js/save.js')).collection().prints));
	A(col0.length > 20 && col0 === col1, 'the drafted cards did not join the collection (it is as it was)', col0.length);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
