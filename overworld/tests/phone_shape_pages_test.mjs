// phone_shape_pages_test.mjs — every game's first screen at a PHONE BROWSER's shape (Plans/IMPROVEMENT_PLAN_2026_11.md 2f).
//
// The page tests ran phones at 390 x 844, a phone with no browser bars. Safari's bars leave about 390 x 700 (and less with
// the keyboard bar): there the Pair of Pears shop's two rows of tiles lay over each other and its buttons were cut off
// (owner, 2026-11-13, #1166). This opens each game's first screen at 390 x 700 and at 390 x 600 and asks, of every page:
//   * no sideways scroll: nothing is wider than the screen
//   * every button on screen can be pressed: it is inside the screen (or inside something that scrolls), and nothing
//     else lies over its middle
//   * no page errors
// It is the first screen only: a game's deeper screens are its own page test's (pairofpears_ui_test.mjs does its shop).
//   node overworld/tests/phone_shape_pages_test.mjs            (PHONE_SHOTS=<dir> saves a picture of each)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9665, SHOTS = process.env.PHONE_SHOTS || null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// [name, address, what says the first screen is up (a function run in the page)]
const PAGES = [
	['the home page', '/', () => document.querySelectorAll('a[href]').length > 5],
	['Battlecards (start)', '/battlecards/start.html', () => document.querySelectorAll('a, button').length > 2],
	['Battlecards (packs)', '/battlecards/packs.html', () => !!document.getElementById('gold')],
	['Battlecards (deck builder)', '/battlecards/deck.html', () => document.querySelectorAll('button').length > 2],
	['the Overworld (signed out: its login)', '/overworld/index.html', () => !!document.querySelector('canvas, input[type="password"]')],
	['Micatro', '/micatro/', () => document.querySelectorAll('button, .btn').length > 1],
	['MicaSurvivor', '/micasurvivor/', () => typeof window.G === 'object' && !!document.getElementById('boot') && document.getElementById('boot').classList.contains('hidden'), true],   // (true: it is played on its side too: upright it asks you to rotate)
	['MicaSurvivor 3D (the test room)', '/micasurvivor/m3d/?gen=7', () => !!(window.__m3d && window.__m3d.ready), true],
	['Pair of Pears', '/pairofpears/', () => !!document.querySelector('.menu-modal .b-new')],
	['Scoundrel', '/scoundrel/', () => document.querySelectorAll('button, .btn').length > 0],
	['PokéChess', '/overworld/pokechess.html', () => !!document.querySelector('canvas, .board, #board')],
	['the Battle Factory (signed out: its login)', '/overworld/?factory=1', () => !!document.querySelector('canvas, input[type="password"]')],
];
const SHAPES = [[390, 700, 'a phone browser with its bars'], [390, 600, 'the shortest page']];

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'offline (test)' })); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|micatro\/assets|micatro\/mods|overworld\/data|battlecards\/art)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

/** In the page: what is wrong with this screen at this shape. */
const audit = (VW, VH) => {
	// (W, H: the PHONE's screen. A page wider than it makes a phone browser zoom out to fit, and innerWidth then reports the
	//  page's width, not the screen's: so the screen's own size is handed in.)
	const W = VW, H = VH, out = { wide: 0, off: [], covered: [], n: 0 };
	out.wide = Math.max(0, document.documentElement.scrollWidth - W, document.body ? document.body.scrollWidth - W : 0, Math.round(innerWidth) - W);
	const scrolls = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)) return true; } const d = document.scrollingElement; return !!d && d.scrollHeight > H + 2; };
	const label = (el) => (el.id ? '#' + el.id : el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) + ' "' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
	for (const el of document.querySelectorAll('button, a[href], [role="button"], .btn, input, select')) {
		const s = getComputedStyle(el), r = el.getBoundingClientRect();
		if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05 || s.pointerEvents === 'none' || r.width < 4 || r.height < 4 || el.disabled) continue;
		let hid = false; for (let p = el.parentElement; p; p = p.parentElement) { const q = getComputedStyle(p); if (q.display === 'none' || q.visibility === 'hidden' || +q.opacity < 0.05) { hid = true; break; } }
		if (hid) continue;
		out.n++;
		const inside = r.left >= -1 && r.right <= W + 1 && r.top >= -1 && r.bottom <= H + 1;
		// (wholly off the screen is a closed drawer or what a scroll brings: the deck builder's panel waits under the fold.
		//  CUT by the edge with nothing to scroll is the fault: a button you can see half of and cannot reach)
		const onScreen = r.right > 2 && r.left < W - 2 && r.bottom > 2 && r.top < H - 2;
		if (!inside) { if (onScreen && !scrolls(el)) out.off.push(label(el) + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ']'); continue; }
		const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
		if (top && top !== el && !el.contains(top) && !top.contains(el)) {
			const lab = top.closest('label'); if (lab && (lab.contains(el) || lab.htmlFor === el.id)) continue;   // (an input under its own label)
			// (a layer over the WHOLE screen is meant to be over everything: a welcome, "rotate your phone", a menu. Its own
			//  buttons are looked at like any others.)
			let layer = null; for (let p = top; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const q = p.getBoundingClientRect(), ps = getComputedStyle(p).position; if ((ps === 'fixed' || ps === 'absolute') && q.width * q.height >= 0.85 * W * H && !p.contains(el)) { layer = p; break; } }
			if (layer) { out.layers = out.layers || []; const ln = label(layer).split(' "')[0]; if (!out.layers.includes(ln)) out.layers.push(ln); continue; }
			out.covered.push(label(el) + ' under ' + label(top));
		}
	}
	return out;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
try {
	// ---- the instrument itself: it must SEE the faults it is here for (a button cut by the screen's edge, one lying over another)
	{
		const page = await browser.newPage();
		await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><style>html, body { height: 100%; margin: 0; overflow-y: hidden; }</style><body><button id="fine" style="position:absolute;left:20px;top:20px;width:120px;height:40px">fine</button><button id="cut" style="position:absolute;left:20px;top:680px;width:120px;height:60px">cut</button><button id="under" style="position:absolute;left:200px;top:200px;width:120px;height:40px">under</button><div id="over" style="position:absolute;left:190px;top:190px;width:140px;height:60px;background:#333">over</div><button id="away" style="position:absolute;left:20px;top:1200px;width:120px;height:40px">a closed drawer</button><div style="position:absolute;left:0;top:300px;width:900px;height:10px"></div></body>');
		const r = await page.evaluate(audit, 390, 700);
		A(r.wide > 400 && r.off.length === 1 && /#cut/.test(r.off[0]) && r.covered.length === 1 && /#under.*under #over/.test(r.covered[0]), 'the check sees its faults: a page wider than the screen, a button cut by the edge, a button under something else (and not a closed drawer, wholly off the screen)', JSON.stringify(r));
		await page.close();
	}
	for (const [name, url, up, land] of PAGES) {
		for (const [w, h, what] of SHAPES.concat(land ? [[700, 390, 'a phone on its side']] : [])) {
			const ctx = await browser.createBrowserContext(), page = await ctx.newPage(), errors = [];
			page.on('pageerror', e => errors.push(e.message));
			await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
			await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
			const loaded = await page.waitForFunction(up, { timeout: 30000 }).then(() => true).catch(() => false);
			await sleep(1200);
			const r = loaded ? await page.evaluate(audit, w, h) : null;
			if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name.replace(/[^a-z0-9]+/gi, '_')}_${w}x${h}.png`) });
			const tag = `${name}, ${w} x ${h} (${what})`;
			A(loaded, `${tag}: its first screen comes up`);
			if (r) {
				A(r.wide <= 1, `${tag}: no sideways scroll`, 'wider than the screen by ' + r.wide + ' px');
				A(r.off.length === 0, `${tag}: every button is inside the screen or in something that scrolls (${r.n} looked at)`, r.off.join(' ;; '));
				A(r.covered.length === 0, `${tag}: nothing lies over a button's middle${r.layers ? ' (behind a whole-screen layer, by design: ' + r.layers.join(', ') + ')' : ''}`, r.covered.join(' ;; '));
			}
			A(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
			await ctx.close();
		}
	}
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
