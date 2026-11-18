// pocketenhanced_binder_test.mjs — the binder (owner's third improvement list, 2026-11-18, "yes to all": "Each set as a
// page of card slots, owned ones in their printing and missing ones as silhouettes ... Tapping a missing card goes to
// crafting"). setrewards.js SET_PRINTS, main.js binderMenu / cardActions.
//   1. a set's pages: every printing of it, in the set's own number order, the ◆ Pokédex among them (Genetic Apex: all
//      its printings, 226 of them ◆); promo sets have none
//   2. Collection > Binder: Genetic Apex; an owned printing shows its card (×n), a missing one a numbered silhouette;
//      the count "have / total" and the ◆ count
//   3. tapping a missing slot opens the card with its actions (exchange / make with dust), as the collection does
//   4. another set's page; the set chosen is remembered
//   node overworld/tests/pocketenhanced_binder_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import { SET_PRINTS, SET_DEX } from '../../pocketenhanced/js/setrewards.js';

const R = makeAsserter(), A = R.A;
// ===== 1 =====
{
	const a1 = SET_PRINTS.get('A1') || [], nums = a1.map(p => +p.split('-')[1]);
	A(a1.length > 226 && SET_DEX.get('A1').every(p => a1.includes(p)) && nums.every((n, i) => !i || n > nums[i - 1]), "Genetic Apex's pages: every printing in number order, its 226 ◆ cards among them", { n: a1.length });
	A(![...SET_PRINTS.keys()].some(s => s.startsWith('P-')), 'promo sets have no pages');
}
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e) { e.click(); return true; } return false; }, k);
	// ===== 2 =====
	await page.evaluate(() => window.__pocket.give({ 'A1-001': 2 }));
	A(await click('collection'), '(the collection)'); await sleep(400);
	A(await click('binder'), 'the Collection screen has Binder'); await sleep(400);
	const pg = await page.evaluate(() => {
		const own = document.querySelector('.pe-binder [data-k="bsA1-001"]'), miss = [...document.querySelectorAll('.pe-binder .pe-slot')], head = document.querySelector('.modal:last-child .pe-note').textContent;
		return { own: !!own && !own.classList.contains('pe-slot') && /×\d/.test(own.textContent), miss: miss.length, missText: miss[0] && miss[0].textContent, head, slots: document.querySelectorAll('.pe-binder [data-k^="bs"]').length };
	});
	A(pg.own, 'an owned printing (A1-001) shows its card with ×n', pg);
	A(pg.miss > 0 && /^\d+/.test(pg.missText || '') && pg.slots === (SET_PRINTS.get('A1') || []).length, 'missing ones: numbered silhouettes; a slot for every printing', pg);
	A(/\d+ \/ \d+ printings · ◆ cards \d+ \/ 226/.test(pg.head), 'the counts: printings and ◆ cards', pg.head);
	// ===== 3 =====
	const missId = await page.evaluate(() => document.querySelector('.pe-binder .pe-slot').dataset.k);
	await click(missId); await sleep(400);
	const insp = await page.evaluate(() => { const m = document.querySelector('.modal:last-child'); return m ? m.textContent : ''; });
	A(/Exchange|Not found in packs|Make /.test(insp), 'tapping a missing slot: the card, with how to get it (exchange or make)', insp.slice(0, 200));
	await page.evaluate(() => { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); b && b.click(); }); await sleep(300);
	// ===== 4 =====
	await click('bsetA2'); await sleep(300);
	A(await page.evaluate(() => !!document.querySelector('.pe-binder [data-k^="bsA2-"]') && !document.querySelector('.pe-binder [data-k^="bsA1-"]')), "another set's page (Space-Time Smackdown)");
	A(await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).binderSet === 'A2'), 'the set chosen is remembered');
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
