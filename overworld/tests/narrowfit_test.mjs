// narrowfit_test.mjs — the game canvas (and the OPTIONS panel) fits a narrow window.
//
// fitCanvas floors the integer scale at 2x, so at 1x pixel density any window
// narrower than ~490 CSS px got a canvas WIDER than itself: the whole screen —
// the OPTIONS panel most visibly, "ONS" / "EXT SPEED" — was cut off at both
// sides, with a horizontal scrollbar. Phones at 2x/3x fit already. Now the 2x
// backing store is shown no wider than the window.
//   1. at several sizes/densities the canvas sits inside the window, no page overflow
//   2. the OPTIONS panel's CLOSE button is on screen
//   3. clicking CLOSE where it is DRAWN closes OPTIONS (input follows the shown size)
//   4. a wide desktop window is unchanged (integer-scaled, not shrunk)
//
//   node overworld/tests/narrowfit_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9198;
const STATE = { username: 'narrow', friendCode: 'NARROW', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(raw.includes('ow-load') ? '{"ow":null}' : JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] })); }
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const errors = [];
	for (const [w, h, dpr, mobile, label] of [[390, 844, 1, false, 'narrow desktop window, 1x'], [360, 740, 1, true, 'small phone, 1x'], [390, 844, 2, true, 'phone, 2x'], [1280, 800, 1, false, 'wide desktop']]) {
		const p = await browser.newPage();
		p.on('pageerror', e => errors.push(label + ': ' + e.message));
		await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
		await p.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'pikachu', name: 'PIKA', level: 5, types: ['Electric'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20, exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's25.png', num: 25 }]));
		}, STATE);
		await p.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await p.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
		await p.evaluate(async () => { const M = await import('./ow_menustate.js'); M.optionsMenu.open = true; M.optionsMenu.mode = 'main'; });
		await sleep(400);
		const m = await p.evaluate(async () => {
			const c = document.getElementById('screen'), r = c.getBoundingClientRect();
			const S = (await import('./ow_state.js')).S;
			const close = (S.menuUi || []).find(b => b.id === 'close');
			const k = r.width / c.width;
			return { left: r.left, right: r.right, width: c.clientWidth, inner: innerWidth, scrollW: document.documentElement.scrollWidth, cw: c.width,
				close: close && { x: r.left + (close.x + close.w / 2) * k, y: r.top + (close.y + close.h / 2) * (r.height / c.height) } };
		});
		A(m.left >= -0.5 && m.right <= m.inner + 0.5 && m.scrollW <= m.inner, `[${label}] the canvas fits the window (no cut-off, no sideways scroll)`, JSON.stringify(m));
		A(m.close && m.close.x > 0 && m.close.x < m.inner, `[${label}] the OPTIONS CLOSE button is on screen`, JSON.stringify(m.close));
		if (label === 'wide desktop') A(Math.abs(m.width * dpr - m.cw) < 1, '[wide desktop] the canvas is shown at its integer scale (not shrunk)', JSON.stringify(m));
		if (m.close) {
			await p.mouse.click(m.close.x, m.close.y);
			await sleep(300);
			A(!(await p.evaluate(async () => (await import('./ow_menustate.js')).optionsMenu.open)), `[${label}] clicking CLOSE where it is drawn closes OPTIONS`);
		}
		await p.close();
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
