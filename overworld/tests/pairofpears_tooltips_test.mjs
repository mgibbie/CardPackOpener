// pairofpears_tooltips_test.mjs — Pair of Pears explains its conditions the way Micatro explains its cards:
// a tip panel beside what you point at, with a SIDE BOX (Micatro's info_queue) for every condition the text names.
// A new player couldn't tell what "grant Juicy to a random fruit" or a "Tart Apple" offer did.
// In a real browser, desktop (mouse hover + the keyboard ring) and phone (tap):
//   * a charm on offer that NAMES a condition (Mango: "grant Juicy…") -> its tip + a "Juicy" side box with the rule
//   * a charm that only says "condition" (Pineapple) -> one "Conditions" side box saying what a condition is
//   * a condition on offer ("Tart Apple") -> what Tart does, that every Apple gets it, and the "Conditions" box
//   * an owned charm in its slot (Eggplant: "4 Tart Kiwi cards") -> the "Tart" side box
//   * a deck-boost chip ("Juicy Apple ×2") -> a real tip with the rule, not a bare browser title; it says a second copy
//     adds nothing (the rules read a condition as on / off)
//   * the tip leaves when the pointer does, stays on the table, and a tap on Buy buys (no tip in the way)
//   * the keyboard / controller ring on a Buy button shows that offer's tip
//   node overworld/tests/pairofpears_tooltips_test.mjs      (screenshots: PEARS_SHOTS=<dir>)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8667;
const SHOTS = process.env.PEARS_SHOTS || null;   // screenshots: PEARS_SHOTS=<dir>
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
		await page.evaluateOnNewDocument(() => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch { /* ignore */ } });
		const ready = () => waitFor(() => page.evaluate(() => !!(window.__pears && window.__pears.ready)), 20000);
		const view = () => page.evaluate(() => window.__pears.view());
		const tip = () => page.evaluate(() => (window.__pears.tip ? window.__pears.tip() : undefined));
		const centerOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
		const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `tips_${name}_${n}.png`) }); };
		const tipFits = () => page.evaluate(() => { const b = document.querySelector('.tip').getBoundingClientRect(); return b.width > 0 && b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; });

		// ---- a run parked in the Level Shop with known offers, an owned charm and a deck boost ----
		await page.goto(`http://localhost:${PORT}/pairofpears/`, { waitUntil: 'domcontentloaded' });
		A(await ready(), `${name}: the page boots`);
		await page.evaluate(() => {
			const P = window.__pears.engine, SV = window.__pears.save;
			P.startNewRun();
			const s = P.serialize();
			s.levelClearing = true; s.levelShopOpen = true; s.berries = 40;
			for (const c of s.cards) { c.matched = true; c.faceUp = true; }
			s.shop = { offers: [{ kind: 'charm', id: 'mango', cost: 6 }, { kind: 'condition', fruit: 'apple', cond: 'tart', cost: 15 }, { kind: 'charm', id: 'pineapple', cost: 6 }, { kind: 'sell' }], generatedLevel: s.level, dragging: null };
			s.charm.deckConditions = { apple: { juicy: 2 } };
			s.charm.inventory[0] = { id: 'eggplant', name: 'Eggplant Charm', sellValue: 3 };
			P.reset();
			SV.saveRun(s);
		});
		await page.reload({ waitUntil: 'domcontentloaded' });
		await ready();
		const cont = await centerOf('.b-continue');
		A(!!cont, `${name}: the menu offers Continue`);
		if (vp.hasTouch) await page.touchscreen.tap(cont.x, cont.y); else await page.mouse.click(cont.x, cont.y);
		A(await waitFor(async () => (await view()) && (await view()).phase === 'shop', 5000), `${name}: the run resumes in the Level Shop`);
		await waitFor(() => page.evaluate(() => document.querySelectorAll('.pp-offer').length === 3), 3000);
		await sleep(900);   // (the shop panel rises: Micatro's risein)
		if (!vp.hasTouch) { await page.mouse.move(8, 8, { steps: 3 }); await sleep(150); }   // (the shop rose under the pointer that clicked Continue)
		const v = await view();
		A(v.offers[0].id === 'mango' && v.offers[1].cond === 'tart' && v.offers[2].id === 'pineapple' && v.charms[0].id === 'eggplant', `${name}: the shop holds the test's offers`, JSON.stringify(v.offers));
		A((await tip()) === null, `${name}: no tip is shown until the player asks for one`, JSON.stringify(await tip()));

		if (!vp.hasTouch) {
			const hover = async (sel) => { const r = await centerOf(sel); await page.mouse.move(r.x, r.y, { steps: 4 }); await sleep(120); return tip(); };
			const away = async () => { await page.mouse.move(8, 8, { steps: 3 }); await sleep(120); return tip(); };

			// a charm that names a condition
			let t = await hover('.pp-offer[data-i="0"] .pp-of-name');
			A(t && t.for === 'offer0' && /Mango Charm/.test(t.text) && /Costs 6 berries/.test(t.text), `${name}: hovering the Mango Charm offer shows its tip`, JSON.stringify(t));
			A(t && t.boxes === 1 && /Juicy/.test(t.text) && /triple rewards/.test(t.text), `${name}: ...with a "Juicy" side box that says what Juicy does`, JSON.stringify(t));
			A(await tipFits(), `${name}: the tip is on the table`);
			await shot('charm_offer');
			const look = await page.evaluate(() => { const b = document.querySelector('.tip .tip-info'); const cs = getComputedStyle(b); return { main: !!document.querySelector('.tip .tip-main'), bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, name: !!b.querySelector('.ti-name') }; });
			A(look.main && look.name && look.radius === '14px' && look.bg !== 'rgba(0, 0, 0, 0)', `${name}: it is Micatro's tip panel + info box (micatro.css .tip-main / .tip-info)`, JSON.stringify(look));
			A((await away()) === null, `${name}: the tip leaves with the pointer`);

			// a charm that only says "condition"
			t = await hover('.pp-offer[data-i="2"] .pp-of-name');
			A(t && t.for === 'offer2' && /Pineapple Charm/.test(t.text) && t.boxes === 1 && /Conditions/.test(t.text) && /mark on every card of one fruit/.test(t.text), `${name}: the Pineapple Charm ("a random condition") gets the box that says what a condition is`, JSON.stringify(t));

			// a condition on offer
			t = await hover('.pp-offer[data-i="1"] .pp-of-name');
			A(t && t.for === 'offer1' && /Tart Apple/.test(t.text) && /first 3 pairs/.test(t.text) && /Every Apple in your deck gets it/.test(t.text) && /Costs 15 berries/.test(t.text), `${name}: the Tart Apple offer says what Tart does and who gets it`, JSON.stringify(t));
			A(t && t.boxes === 1 && /mark on every card of one fruit/.test(t.text), `${name}: ...and what a condition is`, JSON.stringify(t));

			// there is no Sell tile (a charm is sold from its own ribbon): the shop is its three offers
			await away();
			A(await page.evaluate(() => !document.querySelector('.pp-sell') && document.querySelectorAll('.pp-offer').length === 3), `${name}: the shop has no Sell tile`);

			// an owned charm that names a condition
			t = await hover('.pp-slot[data-i="0"]');
			A(t && t.for === 'slot0' && /Eggplant Charm/.test(t.text) && t.boxes === 1 && /Tart/.test(t.text) && /first 3 pairs/.test(t.text), `${name}: the owned Eggplant Charm ("4 Tart Kiwi cards") gets a "Tart" side box`, JSON.stringify(t));
			await away();

			// a deck boost
			const chip = await page.evaluate(() => { const c = document.querySelector('.pp-boosts .pp-bt'); return c ? { title: c.getAttribute('title'), label: c.getAttribute('aria-label'), shown: c.getBoundingClientRect().width > 0 } : null; });
			A(chip && chip.shown && chip.title === null && /Juicy Apple: Matching this pair grants triple rewards/.test(chip.label || ''), `${name}: the deck-boost chip carries no bare browser title (a label for screen readers instead)`, JSON.stringify(chip));
			t = await hover('.pp-boosts .pp-bt');
			A(t && /^boost/.test(t.for) && /Juicy Apple ×2/.test(t.text) && /triple rewards/.test(t.text) && /Every Apple in your deck has it\. A second copy adds nothing\./.test(t.text) && !/times over/.test(t.text), `${name}: hovering the Juicy Apple ×2 boost says what it does`, JSON.stringify(t));
			A(await tipFits(), `${name}: the boost tip is on the table`);
			await shot('boost');
			A((await away()) === null, `${name}: ...and leaves with the pointer`);

			// the keyboard ring: on a Buy button, that offer's tip
			await page.keyboard.press('ArrowRight'); await sleep(150);
			t = await tip();
			const ring = await page.evaluate(() => { const f = window.__pears.focus(); return f ? { buy: f.classList.contains('b-buy'), i: f.dataset.i } : null; });
			A(ring && ring.buy && t && t.for === 'offer' + ring.i, `${name}: the keyboard ring on a Buy button shows that offer's tip`, JSON.stringify({ ring, t }));
		} else {
			const tap = async (sel) => { const r = await centerOf(sel); await page.touchscreen.tap(r.x, r.y); await sleep(200); return tip(); };
			let t = await tap('.pp-offer[data-i="0"] .pp-of-name');
			A(t && t.for === 'offer0' && /Mango Charm/.test(t.text) && t.boxes === 1 && /triple rewards/.test(t.text), `${name}: a tap on the Mango Charm offer shows its tip + the "Juicy" side box`, JSON.stringify(t));
			A(await tipFits(), `${name}: the tip fits the phone screen`);
			await shot('charm_offer');
			t = await tap('.pp-offer[data-i="1"] .pp-of-name');
			A(t && t.for === 'offer1' && /Tart Apple/.test(t.text) && /first 3 pairs/.test(t.text), `${name}: a tap on another offer moves the tip there`, JSON.stringify(t));
			A(await tipFits(), `${name}: ...and it still fits`);
			t = await tap('.pp-offer[data-i="1"] .pp-of-name');
			A(t === null, `${name}: a second tap puts the tip away`, JSON.stringify(t));
			// Buy still buys: no tip in the way, and the bought tile's tip is gone
			await tap('.pp-offer[data-i="0"] .pp-of-name');
			const before = (await view()).berries;
			const r = await centerOf('.pp-offer[data-i="0"] .b-buy');
			await page.touchscreen.tap(r.x, r.y);
			A(await waitFor(async () => (await view()).berries === before - 6 && (await view()).charms.some((c) => c && c.id === 'mango'), 3000), `${name}: a tap on Buy buys the charm`, JSON.stringify(await view()));
			A(await waitFor(async () => (await tip()) === null, 2000), `${name}: ...and the sold offer's tip is put away`, JSON.stringify(await tip()));
		}
		A(errors.length === 0, `${name}: no page errors`, errors.slice(0, 3).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
