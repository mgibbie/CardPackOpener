// micatro_tooltip_test.mjs — a selected card's tooltip must never cover its own buttons.
// A tester (iPhone, portrait) tapped a joker: Sell/Dex drop UNDER the card in portrait, and the
// tooltip was placed right under the card too, hiding both buttons. Covers micatro/js/ui/board.js
// (placeTip) for jokers + consumables in portrait and landscape.
//   node overworld/tests/micatro_tooltip_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const SHOTS = process.env.MICATRO_SHOTS || null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8763;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

try {
	for (const [label, vp] of [['phone portrait', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
		const page = await browser.newPage();
		// the cards have come to rest: every sprite at its layout target (cardsprite.js frame() eases T toward tgt, and the board
		// caps a frame's dt at 50 ms, so on a slow CI runner a card still slides in long after a fixed sleep — a tap there
		// hit the card next to it, or the button of one sliding past)
		const settle = () => waitFor(() => page.evaluate(() => {
			for (const sp of window.__micatro.board.sprites.values()) {
				if (sp.leaving) continue;
				const T = sp.T, g = sp.tgt;
				if (sp.dragging || sp.juice || sp.flipAnim || Math.abs(T.x - g.x) > 0.5 || Math.abs(T.y - g.y) > 0.5 || Math.abs(T.r - g.r) > 0.005 || Math.abs(T.s - g.s) > 0.005) return false;
			}
			return true;
		}), 20000);
		await page.setViewport(vp);
		await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
		await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
		await page.evaluate(async () => { await window.__micatro.newRun({ seed: 'TIPBTN', back: 'b_red' }); });
		await page.evaluate(async () => {
			const C = await import('/micatro/js/engine/core.js');
			C.add_joker('j_blueprint'); C.add_joker('j_joker');
			C.add_joker('j_ticket', 'foil', false, true); // (three info boxes: Gold Card, Foil, Eternal)
			C.add_joker('c_mercury'); // a consumable too
			C.G.E_MANAGER.flush();
			await window.__micatro.act({ type: 'select_blind' });
		});
		await page.waitForFunction(() => window.__micatro.idle(), { timeout: 20000 });
		await new Promise(r => setTimeout(r, 600));
		for (const area of ['jokers', 'consumeables']) {
			const id = await page.evaluate(async (area) => { const C = await import('/micatro/js/engine/core.js'); const c = C.G[area].cards[0]; return c && c.sort_id; }, area);
			const sel = `.card[data-id="${id}"]`;
			await page.waitForSelector(sel, { timeout: 5000 });
			await settle();
			if (vp.hasTouch) await page.tap(sel); else await page.click(sel);
			await new Promise(r => setTimeout(r, 500));
			const r = await page.evaluate((sel) => {
				const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
				const tip = document.querySelector('.tip'), btns = document.querySelector(`${sel} .card-btns`);
				return { tip: tip && tip.style.display !== 'none' ? rect(tip) : null, btns: rect(btns), card: rect(document.querySelector(sel)), vh: innerHeight, vw: innerWidth };
			}, sel);
			A(r.tip && r.btns, `${label} ${area}: tapping the card shows its tooltip and its buttons`, JSON.stringify(r));
			A(!overlap(r.tip, r.btns), `${label} ${area}: the tooltip doesn't cover the Sell/Use buttons`, JSON.stringify(r));
			A(r.tip && r.tip.top >= 0 && r.tip.bottom <= r.vh + 1, `${label} ${area}: the tooltip stays on screen`, JSON.stringify(r));
			if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `tooltip_${area}_${label.replace(/ /g, '_')}.png`) });
			// deselect
			await page.evaluate(() => document.querySelector('.stage, #stage, body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
			await new Promise(r => setTimeout(r, 200));
		}
		// A card with three info boxes (Golden Ticket, Foil, Eternal): on a phone the card's box + three ran off the
		// right edge (Pokermon's hazard jokers, 2026-10-26); the boxes wrap onto another row instead. Desktop: one row.
		{
			const id = await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); return C.G.jokers.cards[2].sort_id; });
			const sel = `.card[data-id="${id}"]`;
			await settle();
			if (vp.hasTouch) await page.tap(sel); else await page.click(sel);
			await new Promise(r => setTimeout(r, 500));
			const r = await page.evaluate(() => {
				const tip = document.querySelector('.tip');
				const boxes = tip && tip.style.display !== 'none' ? [...tip.children].map((e) => e.getBoundingClientRect()) : [];
				return { n: boxes.length, right: Math.max(...boxes.map((b) => b.right)), left: Math.min(...boxes.map((b) => b.left)), rows: new Set(boxes.map((b) => Math.round(b.top))).size, vw: innerWidth };
			});
			A(r.n === 4 && r.left >= -1 && r.right <= r.vw + 1, `${label}: a tooltip with three info boxes stays inside the screen`, JSON.stringify(r));
			if (!vp.hasTouch) A(r.rows === 1, `${label}: ... on one row where it fits`, JSON.stringify(r));
			if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `tooltip_wide_${label.replace(/ /g, '_')}.png`) });
		}
		await page.close();
	}
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
