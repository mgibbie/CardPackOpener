// pocketenhanced_setrewards_test.mjs — set completion rewards (owner's second improvement list, 2026-11-18, "yes to all":
// "Finishing a pack's Pokédex pays stars once, with a reward for each step along the way"). pocketenhanced/js/setrewards.js,
// solo.js SET_MILESTONES/paidTwice, main.js setRewardsMenu.
//   1. a set's Pokédex is its ◆ cards (Genetic Apex: 226); promo sets have none
//   2. milestones 25/50/75/100% pay 1/2/3/5 packs, each once; all four at once pay 11
//   3. paid on two devices at once: the second payment is counted to be taken back (paidTwice), as for deck missions; the
//      paid notes survive a merge of two devices' progress
//   4. the page: owning a quarter of Genetic Apex, the main menu says a reward is waiting; Set rewards shows the set's count
//      and the milestone; Claim pays a pack's stars and marks it ✓; claiming again pays nothing; reaching 50% says so
//   node overworld/tests/pocketenhanced_setrewards_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import { SET_DEX, setState, claimSets, setsDue } from '../../pocketenhanced/js/setrewards.js';
import * as SO from '../../pocketenhanced/js/solo.js';
import * as COLL from '../../pocketenhanced/js/collection.js';

const R = makeAsserter(), A = R.A;
const A1 = SET_DEX.get('A1') || [];
const colWith = n => { const c = COLL.newCollection(); const prints = {}; A1.slice(0, n).forEach(p => { prints[p] = 1; }); return { ...c, prints }; };
// ===== 1 =====
A(A1.length === 226 && ![...SET_DEX.keys()].some(s => s.startsWith('P-')), "Genetic Apex's Pokédex is its 226 ◆ cards; promo sets have none", [A1.length, [...SET_DEX.keys()]]);
// ===== 2 =====
{
	const q = setState(colWith(57), SO.newProgress()).find(s => s.set === 'A1');
	A(q.have === 57 && q.reached.join() === '25' && q.due.join() === '25', '57 of 226 (25.2%): the 25% milestone is due', q);
	const c1 = claimSets(SO.newProgress(), setState(colWith(57), SO.newProgress()));
	A(c1.packs === 1 && c1.progress.paid['s:A1:25'] === 1, 'claiming it pays 1 pack and notes it paid', c1);
	const again = claimSets(c1.progress, setState(colWith(57), c1.progress));
	A(again.packs === 0 && setsDue(setState(colWith(57), c1.progress)) === 0, 'claiming again pays nothing');
	const all = claimSets(SO.newProgress(), setState(colWith(226), SO.newProgress()));
	A(all.packs === 11 && all.claimed.filter(k => k.startsWith('A1:')).length === 4, 'the whole set at once: 25/50/75/100% pay 1+2+3+5 = 11 packs', all.claimed);
	const after = claimSets(c1.progress, setState(colWith(226), c1.progress));
	A(after.packs === 10, 'with 25% already paid, finishing the set pays the other 10', after.packs);
	// ===== 3 =====
	A(SO.paidTwice(SO.newProgress(), c1.progress, c1.progress) === 1, 'the same milestone paid on two devices at once: 1 pack counted to take back');
	A(SO.paidTwice(SO.newProgress(), all.progress, c1.progress) === 1, '(only the milestone both paid)');
	A(SO.paidTwice(SO.newProgress(), all.progress, all.progress) >= 11, 'the whole set paid on two devices at once: its 11 packs counted (100% is 5, not 1)', SO.paidTwice(SO.newProgress(), all.progress, all.progress));
	A(SO.mergeProgress(c1.progress, SO.newProgress()).paid['s:A1:25'] === 1, 'the paid note survives merging two devices');
}
// ===== 4. the page =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const give = n => page.evaluate(ps => window.__pocket.give(Object.fromEntries(ps.map(p => [p, 1]))), A1.slice(0, n));
	// (the starter collection already holds some of Genetic Apex: giving the first 57 makes at least 57)
	await give(57); await sleep(200);
	const toast1 = await page.evaluate(() => document.querySelector('.pe-banner').textContent);
	A(/A set reward is ready/.test(toast1), 'reaching 25%: "A set reward is ready…"', toast1);
	await page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } });
	await page.reload({ waitUntil: 'domcontentloaded' }); await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const btn = await page.evaluate(() => (document.querySelector('[data-k="setrewards"]') || {}).textContent || '');
	A(/Set rewards/.test(btn) && /to claim/.test(btn), 'the main menu: "Set rewards … to claim"', btn);
	await page.evaluate(() => document.querySelector('[data-k="setrewards"]').click()); await sleep(300);
	const row = await page.evaluate(() => (document.querySelector('.pe-setrow[data-set="A1"]') || {}).textContent || '');
	A(/Genetic Apex/.test(row) && /(5[7-9]|[6-9]\d) \/ 226/.test(row) && /25%/.test(row), "Set rewards: Genetic Apex's count out of 226 and its milestones", row);
	const s0 = await page.evaluate(() => window.__pocket.stars());
	await page.evaluate(() => document.querySelector('[data-k="sclaim"]').click()); await sleep(300);
	const s1 = await page.evaluate(() => window.__pocket.stars()), per = await page.evaluate(async () => (await import('/pocketenhanced/js/stars.js').catch(() => ({}))).STARS_PER_PACK || 0);
	const row2 = await page.evaluate(() => ({ row: document.querySelector('.pe-setrow[data-set="A1"]').textContent, claim: !!document.querySelector('[data-k="sclaim"]') }));
	A(s1 > s0 && (!per || s1 - s0 === per) && /✓ 25%/.test(row2.row) && !row2.claim, `Claim pays a pack's stars (+${s1 - s0}), marks 25% ✓, and the button goes`, { s0, s1, per, row2 });
	// reaching 50%
	await give(120); await sleep(200);
	A(/A set reward is ready/.test(await page.evaluate(() => document.querySelector('.pe-banner').textContent)), 'reaching 50%: said again');
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
