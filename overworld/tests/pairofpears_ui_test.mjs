// pairofpears_ui_test.mjs — Pair of Pears (/pairofpears/) in a real browser, desktop + phone: it boots
// straight into the card game on Micatro's UI (micatro.css, the m6x11 font, Micatro's card sprites —
// no love.js, no meadow), plays through the page's own inputs (card clicks / taps, the keyboard, a
// controller), clears a level, buys a charm and sells it by dragging it onto Sell (a tap-then-Sell on
// the phone), resumes on the exact frame after a reload, loads an older save that still carries the
// Love2D build's meadow data, and runs out of Hearts.
//   node overworld/tests/pairofpears_ui_test.mjs      (screenshots: PEARS_SHOTS=<dir>)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const SHOTS = process.env.PEARS_SHOTS || null;
const PORT = 8658;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const VIEWPORTS = [
	['desktop', { width: 1600, height: 900, deviceScaleFactor: 1 }],
	['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
try {
	for (const [name, vp] of VIEWPORTS) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
		await page.evaluateOnNewDocument(() => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch { /* ignore */ }
			// a controller the test can press (site/gamepad.js reads navigator.getGamepads)
			const btn = () => ({ pressed: false, value: 0, touched: false });
			window.__fakePad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
			navigator.getGamepads = () => [window.__fakePad];
		});
		const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}_${n}.png`) }); };
		const ready = () => waitFor(() => page.evaluate(() => !!(window.__pears && window.__pears.ready)), 20000);
		const idle = () => waitFor(() => page.evaluate(() => window.__pears.idle()), 8000);
		const view = () => page.evaluate(() => window.__pears.view());
		const cards = () => page.evaluate(() => window.__pears.engine._cards());   // (test-only: where the fruit is)
		const tapAt = async (r) => { if (vp.hasTouch) await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y); };
		const centerOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
		const clickSel = async (sel) => { await idle(); const r = await centerOf(sel); if (!r) return false; await tapAt(r); return true; };
		// tap a card once it has stopped moving (on a slow CI runner the deal can still be flying: a tap at
		// a moving card's centre lands on its neighbour — a pear instead of the kiwi, then a mismatch); if
		// the tap still missed (nothing turned up), tap again
		const cardUp = (id) => view().then((v) => { const c = v && v.cards.find((x) => x.id === id); return !!c && (c.up || c.m); });
		const upCount = () => view().then((v) => (v ? v.cards.filter((x) => x.up && !x.m).length : 0));
		const stillAt = async (sel) => {
			let prev = await centerOf(sel);
			for (let i = 0; i < 30; i++) { await sleep(120); const r = await centerOf(sel); if (r && prev && Math.abs(r.x - prev.x) < 0.5 && Math.abs(r.y - prev.y) < 0.5) return r; prev = r; }
			return prev;
		};
		const clickCard = async (id) => {
			for (let i = 0; i < 4; i++) {
				await idle();
				const before = await upCount();
				const r = await stillAt(`.cards-layer .card[data-id="${id}"]`);
				if (r) await tapAt(r);
				if (await waitFor(() => cardUp(id), 1500)) return;
				if ((await upCount()) !== before) return;   // something else turned up: don't tap blindly again
			}
		};
		const pad = async (i) => { await page.evaluate((i) => { window.__fakePad.buttons[i].pressed = true; window.__fakePad.buttons[i].value = 1; }, i); await sleep(120); await page.evaluate((i) => { window.__fakePad.buttons[i].pressed = false; window.__fakePad.buttons[i].value = 0; }, i); await sleep(120); };
		const settled = () => waitFor(async () => !(await view()).busy, 3000);

		// ---- boots straight into the card game's menu, on Micatro's look ----
		await page.goto(`http://localhost:${PORT}/pairofpears/`, { waitUntil: 'domcontentloaded' });
		A(await ready(), `${name}: the page boots`);
		const boot = await page.evaluate(() => ({
			menu: !!document.querySelector('.menu-modal .b-new') && /PEARS/.test(document.querySelector('.pp-logo').textContent),
			font: getComputedStyle(document.body).fontFamily,
			micatroCss: [...document.styleSheets].some((s) => /micatro\/css\/micatro\.css/.test(s.href || '')),
			love: !!document.querySelector('script[src*="love"]') || !!window.Module || !!document.querySelector('canvas#canvas'),
			meadow: /meadow|notebook|farmers market|flyswatter/i.test(document.body.innerText) || !!document.querySelector('.pp-field'),
		}));
		A(boot.menu && boot.micatroCss && /m6x11/.test(boot.font), `${name}: the Pair of Pears menu on Micatro's look (micatro.css, the m6x11 font)`, JSON.stringify(boot));
		A(!boot.love && !boot.meadow, `${name}: no love.js and no Meandering Meadow left`, JSON.stringify(boot));
		A(await page.evaluate(() => document.querySelector('.menu-foot .back-link').getAttribute('href') === '/'), `${name}: the menu's back link goes home`);
		await shot('menu');

		// ---- a new run from the menu, by click / tap ----
		A(await clickSel('.menu-modal .b-new'), `${name}: New Run`);
		await waitFor(async () => (await view()) && (await view()).cards.length === 6, 5000);
		await idle();
		let v = await view();
		A(v && v.level === 1 && v.hearts === 3 && v.cards.length === 6 && v.berries === 0, `${name}: level 1: 6 face-down cards, 3 Hearts, 0 Berries`);
		const faces = await page.evaluate(() => [...document.querySelectorAll('.cards-layer .card')].map((e) => ({ id: +e.dataset.id, face: !!e.querySelector('canvas.card-face') })));
		A(faces.length === 6 && faces.every((c) => c.face) && v.cards.every((c) => faces.some((f) => f.id === c.id)), `${name}: the cards are Micatro card sprites (canvas faces)`);
		A(v.cards.every((c) => !c.fruit) && !(await page.evaluate(() => /apple|orange/i.test(document.querySelector('.cards-layer').outerHTML))), `${name}: no face-down card's fruit anywhere in the page`);
		const fit = await page.evaluate(() => {
			const st = document.getElementById('stage').getBoundingClientRect();
			const cs = [...document.querySelectorAll('.cards-layer .card')].map((e) => e.getBoundingClientRect());
			return { st: [st.left, st.right], vw: innerWidth, sw: document.documentElement.scrollWidth, cards: cs.every((r) => r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1) };
		});
		A(fit.st[0] >= -1 && fit.st[1] <= fit.vw + 1 && fit.sw <= fit.vw && fit.cards, `${name}: the table fits the screen, no horizontal scroll`, JSON.stringify(fit));
		A(await page.evaluate(() => document.getElementById('stage').classList.contains(innerWidth < innerHeight ? 'portrait' : 'landscape')), `${name}: ${vp.width < vp.height ? 'portrait (phone)' : 'landscape'} layout`);
		await shot('level1');

		// ---- a match by clicks / taps ----
		let cs = await cards();
		const apples = cs.filter((c) => c.fruit === 'apple');
		await clickCard(apples[0].id); await clickCard(apples[1].id);
		A(await waitFor(async () => (await view()).pairs === 1 && (await view()).berries === 2, 4000), `${name}: two ${vp.hasTouch ? 'taps' : 'clicks'} on the Apples: a pair, +2 Berries`);
		A(await waitFor(() => page.evaluate(() => document.querySelector('.pp-berries').textContent === '2' && document.querySelector('.pp-pairs').textContent === '1/3'), 3000), `${name}: the HUD shows it (Berries 2, pairs 1/3)`);
		A(await waitFor(() => page.evaluate((ids) => ids.every((id) => !document.querySelector(`.cards-layer .card[data-id="${id}"]`)), apples.map((c) => c.id)), 4000), `${name}: the matched pair dissolves off the table`);

		// ---- a mismatch by the keyboard: arrows + Enter ----
		await idle();
		await page.keyboard.press('ArrowRight'); await sleep(80);
		const focusId = async () => page.evaluate(() => { const r = document.querySelector('.pad-reticle'); if (!r || r.style.display === 'none') return null; const rb = r.getBoundingClientRect(); const c = [...document.querySelectorAll('.cards-layer .card')].find((e) => { const b = e.getBoundingClientRect(); return Math.abs(b.left - rb.left - 6) < 4 && Math.abs(b.top - rb.top - 6) < 4; }); return c ? +c.dataset.id : null; });
		let f1 = await focusId();
		A(f1 != null, `${name}: arrow keys put Micatro's focus reticle on a card`);
		await page.keyboard.press('Enter');
		A(await waitFor(async () => (await view()).cards.find((c) => c.id === f1).up, 3000), `${name}: Enter flips the focused card`);
		cs = await cards();
		const fruit1 = cs.find((c) => c.id === f1).fruit;
		// move the reticle to a card of another fruit, then press the controller's confirm (Nintendo layout: the right face button)
		let other = null;
		for (let i = 0; i < 8 && !other; i++) {
			await pad(15); // d-pad right
			const fid = await focusId();
			const c = cs.find((x) => x.id === fid);
			if (c && !c.faceUp && !c.matched && c.fruit !== fruit1) other = c;
			if (!other) { await pad(13); const f2 = await focusId(); const c2 = cs.find((x) => x.id === f2); if (c2 && !c2.faceUp && !c2.matched && c2.fruit !== fruit1) other = c2; }
		}
		A(!!other, `${name}: the controller's d-pad moves the reticle`);
		await pad(1);
		A(await waitFor(async () => (await view()).hearts === 2.5 && (await view()).mismatches === 1, 3000), `${name}: the controller's confirm flips it: a mismatch, -0.5 Hearts`, JSON.stringify((await view())));
		await shot('mismatch');
		A(await settled() && (await view()).cards.filter((c) => c.up && !c.m).length === 0, `${name}: the mismatched cards turn back`);
		A(await page.evaluate(() => /2\.5/.test(document.querySelector('.pp-hv').textContent) && document.querySelectorAll('.pp-hrow .pp-heart.half').length === 1), `${name}: the Hearts panel shows 2.5 (a half heart)`);

		// ---- resume mid-level: reload, Continue, the same frame ----
		const sig = (x) => JSON.stringify({ l: x.level, h: x.hearts, b: x.berries, c: x.cards.map((c) => [c.id, c.up, c.m]) });
		const beforeReload = sig(await view());
		await page.reload({ waitUntil: 'domcontentloaded' });
		await ready();
		A(await page.evaluate(() => /Level 1/.test((document.querySelector('.b-continue') || {}).textContent || '')), `${name}: after a reload the menu offers Continue (Level 1)`);
		await clickSel('.b-continue');
		await waitFor(async () => !!(await view()), 4000); await idle();
		A(sig(await view()) === beforeReload, `${name}: Continue resumes on the exact frame`, sig(await view()) + ' vs ' + beforeReload);

		// ---- clear the level (the Pears last) and go shopping ----
		for (let g = 0; g < 6 && (await view()).phase === 'play'; g++) {
			await settled();
			cs = (await cards()).filter((c) => !c.faceUp && !c.matched);
			const a = cs.find((c) => c.fruit !== 'pear') || cs[0], b = cs.find((c) => c !== a && c.fruit === a.fruit);
			await clickCard(a.id); await clickCard(b.id);
			await waitFor(async () => (await view()).cards.find((c) => c.id === a.id).m, 3000);
		}
		v = await view();
		A(v.phase === 'clear' && v.berries === 6, `${name}: the level is cleared (6 Berries)`, JSON.stringify({ phase: v.phase, berries: v.berries }));
		A(await waitFor(() => page.evaluate(() => { const e = document.querySelector('.pp-clear'); return e && getComputedStyle(e).display !== 'none' && /Complete|Pears/.test(e.textContent); }), 4000), `${name}: the "Level 1 Complete!" panel rises`);
		await sleep(600);
		await shot('clear');
		await clickSel('.b-continue-clear');
		A(await waitFor(async () => (await view()).phase === 'shop', 3000), `${name}: "To the Shop" opens the Level Shop`);
		await waitFor(() => page.evaluate(() => document.querySelectorAll('.pp-offer').length === 4), 3000);
		await sleep(700);   // (the shop panel rises: Micatro's risein)
		if (vp.hasTouch) {
			// (owner, 2026-11-13, iPhone in the browser: its bars leave a page about 1.8 times as tall as wide, and the shop's two
			//  rows of tiles lay over each other: the top row's Buy buttons and every description were cut off)
			const shopFit = () => page.evaluate(() => {
				const R = (e) => e.getBoundingClientRect(), tiles = [...document.querySelectorAll('.pp-offer')], box = R(document.querySelector('.pp-offers')), grid = document.querySelector('.pp-offers'), foot = R(document.querySelector('.b-nextlevel')), panel = R(document.querySelector('.shop-panel'));
				const over = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
				let overlap = 0, cut = 0, thin = 0;
				for (let a = 0; a < tiles.length; a++) for (let b = a + 1; b < tiles.length; b++) if (over(R(tiles[a]), R(tiles[b]))) overlap++;
				for (const t of tiles) { const tr = R(t); for (const c of t.querySelectorAll('.btn, .pp-of-desc, .pp-of-name')) { const r = R(c); if (r.bottom > tr.bottom + 1 || r.top < tr.top - 1 || r.right > tr.right + 1) cut++; } const d = t.querySelector('.pp-of-desc'); if (d && d.textContent.trim() && (R(d).height < 18 || d.scrollHeight > d.clientHeight + 2)) thin++; }
				const scroll = grid.scrollHeight > grid.clientHeight + 2, lastBottom = Math.max(...tiles.map((t) => R(t).bottom));
				return { overlap, cut, thin, scroll, inBox: scroll || lastBottom <= box.bottom + 1, footClear: foot.top >= box.bottom - 1 && foot.bottom <= panel.bottom + 1, portrait: document.getElementById('stage').classList.contains('portrait') };
			});
			for (const [what, h] of [['short phone (a browser with its bars: 390 x 700)', 700], ['the shortest page (390 x 600)', 600], ['a tall phone (390 x 844)', 844]]) {
				await page.setViewport({ ...vp, height: h }); await sleep(500);
				const sf = await shopFit();
				A(sf.portrait && sf.overlap === 0 && sf.cut === 0 && sf.thin === 0 && sf.inBox && sf.footClear, `${name}, ${what}: the four shop tiles do not lie over each other, each shows its whole text and button, and Next Level is clear of them${sf.scroll ? ' (the offers scroll)' : ''}`, JSON.stringify(sf));
				if (h === 700) await shot('shop-short');
			}
			await page.setViewport(vp); await sleep(400);
		}
		v = await view();
		const ci = v.offers.findIndex((o) => o && o.kind === 'charm' && o.cost <= v.berries);
		A(ci >= 0, `${name}: an affordable charm is on offer`, JSON.stringify(v.offers));
		await clickSel(`.pp-offer[data-i="${ci}"] .b-buy`);
		A(await waitFor(async () => (await view()).charms[0] && (await view()).berries === 0, 3000), `${name}: Buy puts the charm in the first slot (-6 Berries)`);
		await shot('shop');
		const charmId = (await view()).charms[0].id;
		if (!vp.hasTouch) {
			// drag it onto Sell with the mouse
			const from = await centerOf('.pp-slot[data-i="0"]'), to = await centerOf('.pp-sell');
			await page.mouse.move(from.x, from.y); await page.mouse.down();
			await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
			A(await page.evaluate(() => getComputedStyle(document.querySelector('.pp-ghost')).display !== 'none'), `${name}: the dragged charm follows the pointer`);
			await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
		} else {
			// tap the charm (it lifts), then tap Sell
			await clickSel('.pp-slot[data-i="0"]');
			A(await waitFor(async () => (await view()).held && (await view()).held.id === charmId, 2000), `${name}: a tap picks the charm up`);
			await shot('shop_held');
			await clickSel('.b-sell');
		}
		A(await waitFor(async () => { const x = await view(); return !x.held && !x.charms.some(Boolean) && x.berries === 3; }, 3000), `${name}: Sell: the charm goes for its sell value (+3 Berries)`, JSON.stringify(await view()));
		await clickSel('.b-nextlevel');
		// (8 = level 2's four pairs; a charm bought in the shop can add cards for good — selling it keeps them — so: at least 8)
		A(await waitFor(async () => (await view()).level === 2 && (await view()).cards.length >= 8, 4000), `${name}: Next Level: level 2 deals its cards (8, plus any a charm added)`, JSON.stringify((await view()).cards.length));
		await idle();
		await shot('level2');

		// ---- Options (Micatro's sound + music toggles) ----
		await clickSel('.pp-hud .b-options');
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .b-music') && !!document.querySelector('.modal .b-sfx')), 2000), `${name}: Options has Micatro's Sound and Music toggles`);
		await shot('options');
		await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].find((b) => /How to play/.test(b.textContent)).click());
		A(await waitFor(() => page.evaluate(() => /Level Shop/.test(document.querySelector('.pp-howto') ? document.querySelector('.pp-howto').textContent : '') && document.querySelectorAll('.pp-conds img').length === 8), 2000), `${name}: How to play explains the rules and the 8 conditions (with their icons)`);
		await sleep(400); await shot('howto');
		await page.keyboard.press('Escape'); await sleep(150);
		await page.keyboard.press('Escape');
		A(await waitFor(() => page.evaluate(() => !document.querySelector('.modal-layer.open')), 2000), `${name}: Esc closes them`);

		// ---- run out of Hearts ----
		for (let g = 0; g < 12 && (await view()).phase === 'play'; g++) {
			await settled();
			cs = (await cards()).filter((c) => !c.faceUp && !c.matched);
			const a = cs.find((c) => c.fruit !== 'pear'), b = cs.find((c) => c.fruit !== a.fruit);
			await page.evaluate((a, b) => { window.__pears.act('reveal', a); window.__pears.act('reveal', b); }, a.id, b.id);
		}
		A(await waitFor(async () => (await view()).phase === 'over', 4000), `${name}: mismatches empty the Hearts: the run is over`);
		A(await waitFor(() => page.evaluate(() => /OUT OF HEARTS/.test(document.body.innerText) && !!document.querySelector('.pp-over-modal .b-again')), 4000), `${name}: the "Out of Hearts" panel, with New Run`);
		await sleep(600);   // (the panel rises: Micatro's risein)
		await shot('over');
		await clickSel('.pp-over-modal .b-tomenu');
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('.menu-modal') && !document.querySelector('.b-continue') && /Best: Level 2/.test(document.body.innerText)), 3000), `${name}: back at the menu: no run to continue, the best level is recorded`);

		// ---- an older save (the Love2D build's meadow data beside a card-game run) still loads ----
		await page.evaluate(() => {
			localStorage.setItem('magepunk_pears_v1', JSON.stringify({ v: 1, meadow: { starCount: 120, berryCount: 9, bugnetUnlocked: true }, run: { level: 3, hearts: 4, berries: 11, cards: [{ id: 1, fruit: 'kiwi' }, { id: 2, fruit: 'kiwi' }, { id: 3, fruit: 'pear', conditions: { special: 1 } }, { id: 4, fruit: 'pear', conditions: { special: 1 } }] } }));
		});
		await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
		A(await page.evaluate(() => /Level 3/.test((document.querySelector('.b-continue') || {}).textContent || '')), `${name}: an old save with meadow data offers its run (Level 3)`);
		await clickSel('.b-continue'); await waitFor(async () => !!(await view()), 3000); await idle();
		await clickCard(1); await clickCard(2);
		A(await waitFor(async () => (await view()).pairs === 1 && (await view()).berries === 13, 3000), `${name}: ...and plays on (a Kiwi pair: 11 -> 13 Berries)`, JSON.stringify(await view()).slice(0, 1500));
		const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pears_v1')));
		A(kept.meadow && kept.meadow.starCount === 120 && kept.meadow.bugnetUnlocked && kept.run.level === 3, `${name}: the meadow data is kept untouched in the save`);
		A(await page.evaluate(() => !!localStorage.getItem('magepunk_pears_prev_v1')), `${name}: the save as found was backed up first (rollback point)`);

		// ---- launched from the overworld's arcade box ----
		await page.goto(`http://localhost:${PORT}/pairofpears/?direct=1`, { waitUntil: 'domcontentloaded' }); await ready();
		A(await page.evaluate(() => { const a = document.querySelector('.menu-foot .back-link'); return a && a.getAttribute('href') === '/overworld/' && /Overworld/.test(a.textContent); }), `${name}: ?direct=1 (the arcade box): the back link returns to the overworld`);
		A(!errors.length, `${name}: no page errors`, errors.slice(0, 4).join(' | '));
		await ctx.close();
	}
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
