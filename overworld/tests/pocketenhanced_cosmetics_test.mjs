// pocketenhanced_cosmetics_test.mjs — sleeves, mats and coins bought with stars (owner's fourth improvement list,
// 2026-11-19: "Looks you buy with stars. It gives stars something to spend on besides packs").
// pocketenhanced/js/cosmetics.js; solo.js `cos` (clean, merge, boughtTwice); main.js looksMenu / applyLook / runCoins.
//   1. the catalogue: a free one of each kind, always owned and worn by default; prices in whole packs of stars; a
//      choice not owned is not worn
//   2. bought looks are kept with the solo progress: cleaned, joined across devices, a change syncs, and one bought on two
//      devices at once is paid back
//   3. the page: Sleeves, mats & coins; buying the Ember sleeve spends 300 stars, keeps it, and wears it; without the
//      stars nothing is spent
//   4. in a match: my card backs wear my sleeve (the other side's do not), the table is my mat, and a coin is my coin;
//      all still worn after a reload
//   node overworld/tests/pocketenhanced_cosmetics_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
const CO = await import('../../pocketenhanced/js/cosmetics.js').catch(() => null);
const SO = await import('../../pocketenhanced/js/solo.js');

const R = makeAsserter(), A = R.A;
// ===== 1 =====
A(!!CO, 'cosmetics.js exists');
if (CO) {
	A(CO.KINDS.every(k => CO.LOOKS.filter(l => l.kind === k && l.free).length === 1) && CO.LOOKS.filter(l => !l.free).every(l => CO.priceOf(l.id) > 0 && CO.priceOf(l.id) % 100 === 0) && CO.LOOKS.filter(l => !l.free).length >= 12, 'a free one of each kind; every other look costs whole packs of stars');
	const w0 = CO.worn(null, null), w1 = CO.worn({ cos: {} }, { sleeve: 'sl-ember', mat: 'mat-nope', coin: 'sl-ember' }), w2 = CO.worn({ cos: { 'sl-ember': 1 } }, { sleeve: 'sl-ember' });
	A(w0.sleeve.id === 'sl-classic' && w0.mat.id === 'mat-pocket' && w0.coin.id === 'coin-star' && w1.sleeve.id === 'sl-classic' && w1.mat.id === 'mat-pocket' && w1.coin.id === 'coin-star' && w2.sleeve.id === 'sl-ember', 'worn: the free ones by default; a look not owned (or of another kind) is not worn; one owned is', { w1, w2: w2.sleeve.id });
}
// ===== 2 =====
{
	const p = SO.cleanProgress({ ...SO.newProgress(), cos: { 'sl-ember': 1, 'mat-beach': 1, '<x>': 1, 'nope': 1 } });
	A(p.cos && Object.keys(p.cos).sort().join() === 'mat-beach,sl-ember', 'bought looks are kept with the progress (only real ones)', p.cos);
	const m = SO.mergeProgress({ ...SO.newProgress(), cos: { 'sl-ember': 1 } }, { ...SO.newProgress(), cos: { 'coin-ball': 1 } });
	A(m.cos && Object.keys(m.cos).sort().join() === 'coin-ball,sl-ember', 'two devices: every look bought on either', m.cos);
	A(!SO.sameProgress(SO.newProgress(), { ...SO.newProgress(), cos: { 'sl-ember': 1 } }), 'a look bought is a change (so it is sent to the account)');
	const base = SO.newProgress(), mine = { ...base, cos: { 'sl-ember': 1, 'coin-ball': 1 } }, theirs = { ...base, cos: { 'sl-ember': 1 } };
	A(SO.boughtTwice && SO.boughtTwice(base, mine, theirs) === 300 && SO.boughtTwice(null, mine, theirs) === 0 && SO.boughtTwice(mine, mine, theirs) === 0, 'bought on two devices at once: its price paid back (only what both bought since they last agreed)');
}
// ===== 3, 4. the page =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true, guided: { tour: 1, draft: 1, event: 1, setrewards: 1, binder: 1, emblems: 1, looks: 1 } })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e && !e.disabled) { e.click(); return true; } return false; }, k);
	const stars = () => page.evaluate(() => window.__pocket.stars());
	// without the stars: nothing spent
	const poor = await stars();
	await page.evaluate(() => window.__pocket.menu()); await sleep(300);
	A(await click('looks'), 'the main menu: "Sleeves, mats & coins"'); await sleep(400);
	const shop = await page.evaluate(() => ({ n: document.querySelectorAll('.modal:last-child .pe-lk').length, worn: [...document.querySelectorAll('.modal:last-child .pe-lk.on')].map(e => e.dataset.k) }));
	A(shop.n >= 15 && shop.worn.sort().join() === 'lk:coin-star,lk:mat-pocket,lk:sl-classic', 'every look, the free ones worn', shop);
	if (poor < 300) { await click('lk:sl-ember'); await sleep(300); A(await stars() === poor && !(await page.evaluate(() => (JSON.parse(localStorage.getItem('magepunk_pocket_solo_v1') || '{}').cos || {})['sl-ember'])), 'not enough stars: nothing bought, nothing spent'); }
	await page.evaluate(() => window.__pocket.earnStars(2000)); const s0 = await stars();
	await page.evaluate(() => window.__pocket.menu()); await sleep(300); await click('looks'); await sleep(400);
	await click('lk:sl-ember'); await sleep(300);
	const after = await page.evaluate(() => ({ cos: (JSON.parse(localStorage.getItem('magepunk_pocket_solo_v1') || '{}').cos) || {}, look: JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).look || {}, on: [...document.querySelectorAll('.modal:last-child .pe-lk.on')].map(e => e.dataset.k) }));
	A(s0 - await stars() === 300 && after.cos['sl-ember'] && after.look.sleeve === 'sl-ember' && after.on.includes('lk:sl-ember'), 'buying the Ember sleeve: 300 stars spent, it is kept and worn', { after, spent: s0 - await stars() });
	await click('lk:mat-beach'); await sleep(200); await click('lk:coin-ball'); await sleep(200);
	const s1 = await stars();
	await click('lk:sl-classic'); await sleep(200); await click('lk:sl-ember'); await sleep(200);
	A(s0 - s1 === 300 + 500 + 200 && await stars() === s1, 'the Beach mat (500) and the Ball coin (200); changing back and forth between owned sleeves costs nothing', { spent: s0 - s1 });
	// ===== 4. in a match, and after a reload =====
	await page.reload({ waitUntil: 'domcontentloaded' }); await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(400);
	await page.evaluate(() => { const P = window.__pocket; P.start({ players: 2, seed: 'looks1' }); }); await sleep(1200);
	const look = await page.evaluate(() => {
		const bg = e => (e ? getComputedStyle(e).backgroundImage : '');
		return { mine: bg(document.querySelector('.pe-me .cb')), theirs: bg(document.querySelector('.pe-opps .cb, .pe-side:not(.pe-me) .cb')), mat: bg(document.querySelector('.pe-mat')) };
	});
	A(/255, 154, 92/.test(look.mine) && !/255, 154, 92/.test(look.theirs) && look.theirs.length > 0, 'my card backs wear the Ember sleeve; the other side\'s do not', look);
	A(/251, 241, 211/.test(look.mat), 'the table is the Beach mat', look.mat);
	await page.evaluate(() => window.__pocket.testCoin(true)); await sleep(300);
	const coin = await page.evaluate(() => { const c = document.querySelector('.pe-coin .h'); return c ? { sign: c.textContent, bg: getComputedStyle(c).backgroundImage } : null; });
	A(coin && coin.sign === '◉' && /255, 255, 255/.test(coin.bg) && !/242, 194, 48/.test(coin.bg), 'a coin toss shows the Ball coin', coin);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
	await ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
