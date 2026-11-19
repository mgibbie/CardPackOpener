// pocketenhanced_pity_test.mjs — pack odds and the pity counter (owner's fourth improvement list, 2026-11-19: "Show each
// pack's odds, and guarantee a high-rarity card after a set number of packs without one").
// pocketenhanced/js/collection.js PITY, packOdds, openPack (col.dry), merge3; main.js oddsMenu / pityText.
//   1. 19 five-card packs in a row without a ★ card: the 20th always holds one (every seed tried)
//   2. a pack with a ★ card sets the count back to 0; a pack without one adds 1; Deluxe and one-card packs do not count
//   3. the count is kept with the collection (cleaned, capped), joined across devices (packs opened on both add up; a
//      ★ card on either side starts it again), and a changed count is a changed collection (so it syncs)
//   4. the odds: each card's table adds up to 100; a ★ card in about 16% of Charizard packs, more in a booster with
//      shiny cards
//   5. the page: Open packs says how far the pity is; "Pack odds" shows the tables; the 20th pack holds a ★ card and
//      says so, and the count starts again
//   node overworld/tests/pocketenhanced_pity_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
const C = await import('../../pocketenhanced/js/collection.js');

const R = makeAsserter(), A = R.A;
const seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const star = ids => ids.some(id => ['1S', '2S', '3S', '1H', '2H', 'CR'].includes((C.printInfo(id) || {}).rarity));
const base = () => ({ ...C.newCollection(), packs: 200 });
const PITY = C.PITY || 20;

// ===== 1 =====
{
	let misses = 0, pityOn = 0;
	for (let s = 1; s <= 200; s++) { const r = C.openPack({ ...base(), dry: PITY - 1 }, 'C', seeded(s)); if (!star(r.pulls.map(p => p.id))) misses++; if (r.pity) pityOn++; }
	A(C.PITY === 20 && misses === 0 && pityOn === 200, `after ${PITY - 1} packs without a ★ card, the next always holds one (200 seeds)`, { PITY: C.PITY, misses, pityOn });
	let plain = 0; for (let s = 1; s <= 200; s++) if (star(C.openPack({ ...base(), dry: 3 }, 'C', seeded(s)).pulls.map(p => p.id))) plain++;
	A(plain > 15 && plain < 60, 'before that, packs keep their usual odds (about 1 in 6 holds a ★ card)', plain);
}
// ===== 2 =====
{
	let col = base(), sawReset = false, sawAdd = false;
	for (let s = 1; s <= 60; s++) { const was = col.dry || 0, r = C.openPack(col, 'C', seeded(s * 7)); col = r.col; const now = col.dry || 0; if (star(r.pulls.map(p => p.id))) { if (now !== 0) { sawReset = 'bad'; break; } sawReset = sawReset || true; } else { if (now !== Math.min(PITY - 1, was + 1)) { sawAdd = 'bad'; break; } sawAdd = true; } }
	A(sawReset === true && sawAdd === true, 'a ★ card sets the count to 0; a pack without one adds 1', { sawReset, sawAdd });
	const own = { ...base(), dry: 7, own: { Q: 2, 7: 2 } };
	const q = C.openPack(own, 'Q', seeded(3)), p7 = C.openPack(own, '7', seeded(3));
	A((q.col.dry === 7 || (q.col.dry || 0) === 0 && star(q.pulls.map(p => p.id))) && p7.col.dry === 7 && !C.countsPity('Q') && !C.countsPity('7') && C.countsPity('C'), 'a Deluxe or a one-card pack does not add to the count', { q: q.col.dry, p7: p7.col.dry });
}
// ===== 3 =====
{
	const k = C.cleanCollection({ ...base(), dry: 12 }), big = C.cleanCollection({ ...base(), dry: 500 }), junk = C.cleanCollection({ ...base(), dry: 'x' });
	A(k.dry === 12 && big.dry === PITY - 1 && !('dry' in junk) && !('dry' in C.cleanCollection(base())), 'kept with the collection, capped, junk dropped', { k: k.dry, big: big.dry });
	const b = { ...base(), dry: 5 };
	A(C.merge3(b, { ...b, dry: 8 }, { ...b, dry: 7 }).dry === 10, 'two devices: the packs each opened add up (5 + 3 + 2)');
	A(C.merge3(b, { ...b, dry: 1 }, { ...b, dry: 9 }).dry === 5, 'a ★ card here (5 → 0, then 1): the count goes on from here, plus the 4 opened there');
	A(C.merge3(b, { ...b, dry: 8 }, { ...b }).dry === 8 && (C.merge3(b, { ...b, dry: 0 }, { ...b }).dry || 0) === 0, 'only one side moved: its count');
	A(!C.sameCollection({ ...b, dry: 3 }, { ...b, dry: 4 }) && C.sameCollection({ ...b, dry: 3 }, { ...b, dry: 3 }), 'a changed count is a changed collection (so it is sent to the account)');
}
// ===== 4 =====
{
	const o = C.packOdds && C.packOdds('C'), sh = C.packOdds && C.packOdds('S'), dx = C.packOdds && C.packOdds('Q'), one = C.packOdds && C.packOdds('7');
	A(o && o.slots.length === 5 && o.slots.every(x => Math.abs(Object.values(x).reduce((a, b) => a + b, 0) - 100) < 0.01) && o.star > 15 && o.star < 18 && o.pity && o.rare === 0.05, 'Charizard packs: five tables of 100%, a ★ card in about 16%, rare packs 1 in 2,000', o && { star: o.star, rare: o.rare });
	A(sh && sh.star > o.star && dx && dx.slots.length === 4 && !dx.pity && one && one.any, 'a shiny booster has more; a Deluxe pack its own four slots; a one-card pack says so', sh && { sh: sh.star });
}
// ===== 5. the page =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(c => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('magepunk_pocket_collection_v1', JSON.stringify(c)); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true, guided: { tour: 1, draft: 1, event: 1, setrewards: 1, binder: 1, emblems: 1 } })); }, { ...C.newCollection(), dry: PITY - 2 });
	await page.goto(`http://localhost:${port}/pocketenhanced/?seed=pity3`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e && !e.disabled) { e.click(); return true; } return false; }, k);
	await page.evaluate(() => window.__pocket.menu()); await sleep(300); await click('packs'); await sleep(500);
	const said = await page.evaluate(() => (document.querySelector('.pe-pity') || {}).textContent || '');
	A(/certain within 2 packs/.test(said) && /18 of 19/.test(said), 'Open packs: "a ★ card or better is certain within 2 packs (18 of 19 opened without one)"', said);
	A(await click('odds'), '"Pack odds"'); await sleep(300);
	const odds = await page.evaluate(() => { const m = [...document.querySelectorAll('.pe-odds')].pop(); return m ? { sets: m.querySelectorAll('.pe-oddsset').length, text: m.textContent } : null; });
	A(odds && odds.sets >= 4 && /Charizard, Mewtwo, Pikachu/.test(odds.text) && /1 in 2,000/.test(odds.text) && /One card a pack/.test(odds.text) && /Deluxe/.test(odds.text) && /counts toward the pity/.test(odds.text), 'the odds: each kind of pack, card by card, the ★ chance, the rare pack, the one-card packs', odds && { sets: odds.sets, t: odds.text.slice(0, 200) });
	// open packs until one holds a ★ card; the 2nd pack at the latest
	const openC = async () => {
		await page.evaluate(() => window.__pocket.menu()); await sleep(300); await click('packs'); await sleep(400);
		await click('packC'); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal:last-child .pe-sealed')), 5000); await click('open'); await sleep(1200);
		return page.evaluate(() => ({ dry: window.__pocket.collection().dry || 0, toast: (document.querySelector('.pe-banner') || {}).textContent || '' }));
	};
	const first = await openC();
	let last = first;
	if (first.dry === PITY - 1) last = await openC();
	console.log('  (first pack: count ' + first.dry + '; second: ' + last.dry + ', "' + last.toast + '")');
	A(last.dry === 0 && (first.dry === 0 || /19 packs without a ★ card: this one holds one/.test(last.toast)), 'the pity pack holds a ★ card, says so, and the count starts again', { first, last });
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
