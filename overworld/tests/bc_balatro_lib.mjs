// bc_balatro_lib.mjs — the shared harness of the Battlecards Balatro-style UI suites (bc_balatro_*_test.mjs).
// A static server (with /api/mp stubbed and, from a git worktree, gitignored assets read from the main checkout),
// a Chrome, and checkPage(spec): open one Battlecards page at a desktop or phone size and check that it
//   - loads with no page errors;
//   - uses the site UI kit (site/ui/balatro.css on the page, <body class="bal-page">, the m6x11 font loaded and
//     computed on the body and on its buttons, the felt behind it);
//   - draws its panels and its main buttons in the kit's token colours (read from balatro.css itself);
//   - its main buttons press with a sound: a real click (after a first gesture, as the browsers require) starts a
//     WebAudio buffer of Micatro's button.ogg (or cancel.ogg for Back / Close, paper1.ogg for a tab) — spied at
//     AudioBufferSourceNode.start and identified by the decoded buffer's length;
//   - optionally writes a screenshot (SHOTS=<dir>).
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../');
const MAIN_ROOT = path.basename(path.dirname(ROOT)) === '.worktrees' ? path.resolve(ROOT, '../..') : null;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
export function makeAsserter() {
	const r = { pass: 0, fail: 0 };
	r.A = (c, m, extra) => { if (c) { r.pass++; console.log('ok  - ' + m); } else { r.fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
	return r;
}

// the kit's tokens, read from the file (the source of truth the colour checks compare against)
const KIT = (() => { try { return fs.readFileSync(path.join(ROOT, 'site/ui/balatro.css'), 'utf8'); } catch { return ''; } })();
export const TOK = {}; for (const m of KIT.matchAll(/--bal-([a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)) TOK[m[1]] = m[2].toLowerCase();
export const rgb = (hex) => { const h = (hex || '#000000').slice(1); const n = (i) => parseInt(h.slice(i, i + 2), 16); return `rgb(${n(0)}, ${n(2)}, ${n(4)})`; };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
// onApi(body) may answer an /api/mp action (return an object); else {ok:true}
export async function startServer({ onApi } = {}) {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
			const out = (onApi && onApi(body)) || { ok: true };
			res.writeHead(200, { 'content-type': 'application/json' });
			return res.end(JSON.stringify(out));
		}
		if (u.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		const send = (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
		fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
	});
	await new Promise(r => server.listen(0, r));
	return { server, port: server.address().port };
}
export async function launch() {
	const puppeteer = (await import('puppeteer-core')).default;
	const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
	return puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
}
export const VIEWPORTS = { desktop: { width: 1600, height: 900 }, phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };

// before any page script: count buffer sources started (with the buffer's length), and let a press that would
// leave the page stay on it (the suites test the sound, not the navigation)
const SPY = () => {
	window.__au = { starts: [], ctx: 0 };
	const AC = window.AudioContext;
	if (AC) {
		window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__au.ctx++; } };
		const st = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts.push(this.buffer ? this.buffer.length : -1); return st.apply(this, a); };
	}
	// (the Navigation API: a link or a location.href = ... is cancelled while a press is under test)
	if (window.navigation) navigation.addEventListener('navigate', (e) => { if (window.__holdLinks && e.cancelable && !e.hashChange) { window.__heldNav = e.destination.url; e.preventDefault(); } });
};

/** The length of each kit sound as this browser decodes it (to tell which one a start played). */
async function soundLengths(page) {
	return page.evaluate(async () => {
		const ac = new (window.AudioContext || window.webkitAudioContext)();
		const out = {};
		for (const n of ['button', 'cancel', 'paper1', 'highlight1']) {
			try { const b = await (await fetch('/micatro/assets/sounds/' + n + '.ogg')).arrayBuffer(); out[n] = (await ac.decodeAudioData(b)).length; } catch { out[n] = null; }
		}
		ac.close();
		return out;
	});
}

/**
 * checkPage(browser, port, A, spec)
 *   spec.name, spec.url, spec.vp ('desktop' | 'phone'), spec.storage {key: value}, spec.ready (page fn -> bool),
 *   spec.panels: [[selector, token]]   an element whose computed background is that token (e.g. 'panel'),
 *   spec.colors: [[selector, token]]   a button whose computed background is that token ('blue', 'orange'...),
 *   spec.presses: [{sel, sound, before}]   click it (before(page) first, if given) and expect that sound,
 *   spec.after(page)   extra checks; returns nothing.
 */
export async function checkPage(browser, port, A, spec) {
	const tag = `${spec.name} (${spec.vp})`;
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(VIEWPORTS[spec.vp]);
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	page.on('dialog', d => d.dismiss().catch(() => {}));
	await page.evaluateOnNewDocument(SPY);
	await page.evaluateOnNewDocument((st) => { for (const [k, v] of Object.entries(st || {})) localStorage.setItem(k, v); }, spec.storage || {});
	const r = await page.goto(`http://localhost:${port}${spec.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => { errors.push('goto: ' + e.message); return null; });
	A(r && r.ok(), `${tag}: the page is served`);
	const ready = await waitFor(() => page.evaluate(spec.ready || (() => document.readyState === 'complete')), 30000);
	A(ready, `${tag}: the page is ready`);
	await page.evaluate(() => document.fonts && document.fonts.ready);
	await sleep(400);

	// --- the kit is on the page
	const kit = await page.evaluate(() => {
		const cs = getComputedStyle(document.body);
		const btns = [...document.querySelectorAll('button')].filter(b => b.getClientRects().length && !b.closest('#mp-topbar, #mp-chat, .mp-chat'));
		return {
			link: !!document.querySelector('link[href$="/site/ui/balatro.css"]'),
			balPage: document.body.classList.contains('bal-page'),
			font: cs.fontFamily, loaded: document.fonts.check('20px m6x11'),
			bg: cs.backgroundImage + ' ' + cs.backgroundColor,
			btnFonts: btns.map(b => getComputedStyle(b).fontFamily),
		};
	});
	A(kit.link && kit.balPage, `${tag}: links site/ui/balatro.css and its body is .bal-page`, JSON.stringify({ link: kit.link, balPage: kit.balPage }));
	A(/m6x11/.test(kit.font) && kit.loaded, `${tag}: the body's font is the Balatro font (m6x11), loaded`, kit.font);
	A(kit.btnFonts.length > 0 && kit.btnFonts.every(f => /m6x11/.test(f)), `${tag}: every visible button is set in m6x11 (${kit.btnFonts.length})`, kit.btnFonts.filter(f => !/m6x11/.test(f)).slice(0, 3).join(' | '));
	A(kit.bg.includes(rgb(TOK['felt-1'])) || kit.bg.includes(rgb(TOK.bg)), `${tag}: the background is the kit's felt`, kit.bg.slice(0, 120));

	// --- colours from the tokens
	for (const [sel, tok] of [...(spec.panels || []), ...(spec.colors || [])]) {
		const bg = await page.evaluate((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : null; }, sel);
		A(bg === rgb(TOK[tok]), `${tag}: ${sel} is drawn in --bal-${tok}`, `${bg} vs ${rgb(TOK[tok])}`);
	}

	// --- presses make sounds (a first gesture unlocks audio, as for a player)
	if (spec.presses && spec.presses.length) {
		await page.evaluate(() => { window.__holdLinks = true; });
		await page.mouse.click(2, VIEWPORTS[spec.vp].height - 2);
		await sleep(300);
		const LEN = await soundLengths(page);
		const want = { press: 'button', back: 'cancel', tab: 'paper1', select: 'highlight1' };
		for (const p of spec.presses) {
			if (p.before) await p.before(page);
			await sleep(60);
			const n0 = await page.evaluate(() => window.__au.starts.length);
			const there = await page.$(p.sel);
			if (!there) { A(false, `${tag}: ${p.sel} is on the page to press`); continue; }
			await there.evaluate(el => el.scrollIntoView({ block: 'center' }));
			await page.click(p.sel).catch(e => errors.push('click ' + p.sel + ': ' + e.message));
			const got = await waitFor(() => page.evaluate((n) => window.__au.starts.length > n, n0), 4000);
			const played = await page.evaluate((n) => window.__au.starts.slice(n), n0);
			const expect = LEN[want[p.sound || 'press']];
			A(got && played.includes(expect), `${tag}: pressing ${p.sel} plays Micatro's ${want[p.sound || 'press']}.ogg`, JSON.stringify({ played, expect }));
			if (p.after) await p.after(page);
			await sleep(80);
		}
	}
	if (spec.after) await spec.after(page, tag);
	if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, `${spec.name}_${spec.vp}.png`) }).catch(() => {}); }
	A(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
	await ctx.close();
	return page;
}
