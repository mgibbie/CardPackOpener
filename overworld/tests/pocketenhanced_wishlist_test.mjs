// pocketenhanced_wishlist_test.mjs — the wishlist (owner's third improvement list, 2026-11-18, "yes to all": "Mark cards
// you want. They're highlighted when they show up in a pack or a friend's trade window, and the deck helper uses them as
// hints"). pocketenhanced/js/main.js wishList/wished/toggleWish.
//   1. a card's actions in the collection: "Add to your wishlist"; then it is marked ♥ in the collection, and the
//      Wishlist filter shows it alone; "take it off" removes it
//   2. a pack: a wished card that comes out is picked out (♥) and named ("On your wishlist: …")
//   3. a trade offer: a wished card in it is marked ♥
//   4. the deck builder: a wished card not owned that fits the deck's Energy: "On your wishlist and would fit: …"
//   node overworld/tests/pocketenhanced_wishlist_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import * as C from '../../pocketenhanced/js/collection.js';
import { card, CARDS } from '../../pocketenhanced/js/data/cards.js';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/?seed=wish1`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e) { e.click(); return true; } return false; }, k);
	const clickText = re => page.evaluate(src => { const re = new RegExp(src); const e = [...document.querySelectorAll('.modal:last-child button')].find(b => re.test(b.textContent)); if (e) { e.click(); return true; } return false; }, re.source);
	// a card a new player does not own: a Fire Pokémon of Genetic Apex outside the starter decks
	const target = CARDS.find(c => c.set === 'A1' && c.kind === 'pokemon' && c.cardType === 'Fire' && !C.owned(C.newCollection(), c.id));
	// ===== 1 =====
	await click('collection'); await sleep(400);
	await click('c' + target.id); await sleep(300);
	A(await clickText(/Add to your wishlist/), 'a card in the collection: "Add to your wishlist"'); await sleep(300);
	const mark = await page.evaluate(id => { const e = document.querySelector(`[data-k="c${id}"]`); return { cls: e && e.classList.contains('wish'), heart: !!(e && e.querySelector('.pe-wish')) }; }, target.id);
	A(mark.cls && mark.heart, 'then it is marked ♥ in the collection', mark);
	await click('swish'); await sleep(300);
	const only = await page.evaluate(() => [...document.querySelectorAll('.pe-col [data-k^="c"]')].map(e => e.dataset.k));
	A(only.length === 1 && only[0] === 'c' + target.id, 'the ♥ Wishlist filter: that card alone', only);
	await click('c' + target.id); await sleep(300);
	A(await clickText(/On your wishlist/), '"On your wishlist (take it off)"'); await sleep(300);
	A(await page.evaluate(() => !document.querySelector('.pe-col [data-k^="c"]')), 'taken off: the filter is empty');
	await page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } });
	// ===== 2. a pack: wish for what the next Charizard pack holds (?seed= makes it the same pack) =====
	const pull = await page.evaluate(async () => { const SV = await import('/pocketenhanced/js/save.js'); return SV.collection().opened || 0; });
	const rand = (() => { let a = 0; for (const ch of 'wish1:' + pull) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
	const ids = C.rollPack('C', rand), want = C.printInfo(ids[4]).card;
	await page.evaluate(w => { const p = JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')); p.wish = [w]; localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify(p)); }, want);
	await page.evaluate(() => window.__pocket.earnStars(300));
	await click('packs'); await sleep(400);
	await page.evaluate(() => document.querySelector('.modal:last-child [data-k="packC"]').click());
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.modal:last-child .pe-sealed')), 5000), '(a Charizard pack, sealed)');
	// open it (Space, as the keyboard does) and turn every card over (Space each)
	await page.keyboard.press('Space'); await sleep(900);
	await waitFor(() => page.evaluate(() => document.querySelectorAll('.pe-pull').length >= 5), 5000);
	for (let i = 0; i < 8 && await page.evaluate(() => !!document.querySelector('.pe-pull.down')); i++) { await page.keyboard.press('Space'); await sleep(260); }
	const shown = await page.evaluate(() => ({ wish: [...document.querySelectorAll('.pe-pull.wish')].map(e => e.getAttribute('aria-label')), toast: document.querySelector('.pe-banner').textContent }));
	A(shown.wish.length >= 1 && shown.wish.some(l => /on your wishlist/.test(l)), 'a pack: the wished card is picked out ♥ as it turns over', { shown, want: card(want).name });
	// ===== 3. a trade offer =====
	{ const lines = await page.evaluate(p => window.__pocket.offerText({ pk: { prints: { [p]: 1, 'A1-001': 1 } } }), ids[4]);
		A(lines.length === 2 && lines.filter(l => /pe-wish/.test(l)).length === 1 && /pe-wish/.test(lines.find(l => l.includes(card(want).name)) || ''), 'a trade offer: the wished card marked ♥, the other not', lines); }
	// ===== 4. the deck builder =====
	await page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } });
	await page.evaluate(id => { const p = JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')); p.wish = [id]; localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify(p)); }, target.id);
	await click('decks'); await sleep(400);
	await page.evaluate(() => { const b = document.querySelector('[data-k="eFire"]') || [...document.querySelectorAll('.pe-db .mine .pe-seg button')].find(x => /Fire/.test(x.innerHTML)); if (b && !b.classList.contains('on')) b.click(); }); await sleep(300);
	const hint = await page.evaluate(() => (document.querySelector('.pe-wishfit') || {}).textContent || '');
	A(hint.includes('On your wishlist and would fit: ' + target.name), `the deck builder (Fire Energy): "On your wishlist and would fit: ${target.name}"`, hint);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
