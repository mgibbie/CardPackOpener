// pocketenhanced_guide_test.mjs — the guide to the newer modes (owner's third improvement list, 2026-11-18, "yes to all":
// "a first-time hint for Draft, events, tournaments, set rewards and emblems, like the first-match tutorial"). main.js
// GUIDE / withGuide / markNew.
//   1. a new player's main menu tags Draft, Weekly event and Set rewards NEW
//   2. opening Draft shows what it is above the screen, with "Got it"; the screen works under it
//   3. "Got it": the hint goes, stays gone when Draft is opened again (and after a reload), and Draft's NEW tag goes
//      while the others stay
//   4. the binder has its hint too (the tournament screen's is the same wrapper: pocketenhanced_tournament_e2e still passes)
//   node overworld/tests/pocketenhanced_guide_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	const boot = async () => { await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' }); await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500); };
	await boot();
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e) { e.click(); return true; } return false; }, k);
	const tags = () => page.evaluate(() => Object.fromEntries(['draft', 'event', 'setrewards'].map(k => [k, !!document.querySelector(`[data-k="${k}"] .pe-newtag`)])));
	const backAll = () => page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } });
	// ===== 1 =====
	const t0 = await tags();
	A(t0.draft && t0.event && t0.setrewards, 'a new player: Draft, Weekly event and Set rewards tagged NEW', t0);
	// ===== 2 =====
	await click('draft'); await sleep(300);
	const g = await page.evaluate(() => ({ hint: (document.querySelector('.modal:last-child .pe-guide') || {}).textContent || '', ok: !!document.querySelector('.modal:last-child [data-k="guideok"]'), screen: !!document.querySelector('.modal:last-child [data-k="denter"]') }));
	A(/Draft/.test(g.hint) && /open 8 packs/.test(g.hint) && g.ok && g.screen, 'Draft: what it is, above the screen, with "Got it"; the screen is there under it', g);
	// ===== 3 =====
	await click('guideok'); await sleep(200);
	A(await page.evaluate(() => !document.querySelector('.modal:last-child .pe-guide')), '"Got it": the hint goes');
	await backAll(); await sleep(300);
	await click('draft'); await sleep(300);
	A(await page.evaluate(() => !document.querySelector('.modal:last-child .pe-guide')), 'opened again: no hint');
	await backAll(); await sleep(200);
	await boot();
	const t1 = await tags();
	A(!t1.draft && t1.event && t1.setrewards, "after a reload: Draft's NEW tag gone, the others still there", t1);
	// ===== 4 =====
	await click('collection'); await sleep(300); await click('binder'); await sleep(300);
	A(await page.evaluate(() => /Binder/.test((document.querySelector('.modal:last-child .pe-guide') || {}).textContent || '')), 'the binder has its hint');
	await backAll(); await sleep(200);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
