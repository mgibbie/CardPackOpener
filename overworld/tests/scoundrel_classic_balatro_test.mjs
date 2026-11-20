// scoundrel_classic_balatro_test.mjs — the page around the original love.js Scoundrel (/scoundrel/classic/, reached
// from Scoundrel's menu, "Classic version") in the site's Balatro kit (owner, 2026-11-19: every UI a visitor can reach
// in the Balatro style, with button press sounds). The game inside the canvas is the original; its page chrome was
// the love.js template (Arial, a sky-blue page, a grey browser button). Desktop (1600x900) + phone (390x844):
//   - the page takes the kit: balatro.css, body.bal-page, the title + footer in m6x11 (loaded), on the kit's FLAT
//     --bal-bg (the canvas below is redrawn every frame: no fixed felt);
//   - Go Fullscreen is a kit blue button on its darker lip, and a "← Scoundrel" Back link (kit orange) leads back;
//   - nothing plays before a gesture; Go Fullscreen presses with Balatro's button sound, Back with its cancel sound;
//   - the game still loads (its loading screen finishes and the canvas shows) and the footer fits a phone.
//   node overworld/tests/scoundrel_classic_balatro_test.mjs      (screenshots: SHOTS=<dir>)
// Covers scoundrel/classic/index.html.
import fs from 'fs';
import path from 'path';
import { makeAsserter, startServer, launch, waitFor, sleep, TOK, rgb, VIEWPORTS } from './bc_balatro_lib.mjs';

const R = makeAsserter(), A = R.A;
const SHOTS = process.env.SHOTS || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const { server, port } = await startServer();
const browser = await launch();
const SPY = () => {
	window.__au = { starts: [], ctx: 0 };
	const AC = window.AudioContext;
	if (AC) {
		window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__au.ctx++; } };
		const st = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts.push(this.buffer ? this.buffer.length : -1); return st.apply(this, a); };
	}
	try { localStorage.setItem('micatro_sfx', '1'); } catch { }
	// (a press under test stays on the page; fullscreen is refused headless)
	if (window.navigation) navigation.addEventListener('navigate', (e) => { if (e.cancelable && !e.hashChange) e.preventDefault(); });
};
try {
	for (const vp of ['desktop', 'phone']) {
		const tag = vp;
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(VIEWPORTS[vp]);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument(SPY);
		await page.goto(`http://localhost:${port}/scoundrel/classic/`, { waitUntil: 'load', timeout: 60000 });
		const loaded = await waitFor(() => page.evaluate(() => window.Module && Module.remainingDependencies === 0 && document.getElementById('loadingCanvas').style.display === 'none'), 45000);
		const cv = await page.evaluate(() => { const c = document.getElementById('canvas'); return getComputedStyle(c).visibility; });
		A(loaded && cv === 'visible', `${tag}: the classic game still loads and its canvas shows`, cv);
		await page.evaluate(() => document.fonts.ready.then(() => true));
		await sleep(300);
		const L = await page.evaluate(() => {
			const cs = (s) => getComputedStyle(document.querySelector(s));
			const b = cs('body'), fs = cs('footer button'), back = document.querySelector('footer a.bal-back');
			return { link: !!document.querySelector('link[href="/site/ui/balatro.css"]'), balPage: document.body.classList.contains('bal-page'),
				h1: cs('h1').fontFamily, foot: cs('footer').fontFamily, loadedFont: document.fonts.check('20px m6x11'),
				bg: [b.backgroundColor, b.backgroundImage], full: [fs.backgroundColor, fs.boxShadow, fs.fontFamily],
				back: back ? [getComputedStyle(back).backgroundColor, back.getAttribute('href')] : null,
				sw: [Math.round(document.querySelector('footer p').getBoundingClientRect().right), document.documentElement.clientWidth] };
		});
		A(L.link && L.balPage, `${tag}: links the kit and its body is .bal-page`);
		A(/m6x11/.test(L.h1) && /m6x11/.test(L.foot) && L.loadedFont, `${tag}: the title and footer are in m6x11 (loaded)`, JSON.stringify([L.h1, L.foot]));
		A(L.bg[0] === rgb(TOK.bg) && L.bg[1] === 'none', `${tag}: the page is the kit's flat --bal-bg (no sky-blue template, no fixed felt under the canvas)`, JSON.stringify(L.bg));
		A(L.full[0] === rgb(TOK.blue) && L.full[1].includes(rgb(TOK['blue-d'])) && /m6x11/.test(L.full[2]), `${tag}: Go Fullscreen is a kit blue button on its lip`, JSON.stringify(L.full));
		A(L.back && L.back[0] === rgb(TOK.orange) && L.back[1] === '/scoundrel/', `${tag}: "← Scoundrel" is the kit's orange Back, to the Scoundrel menu`, JSON.stringify(L.back));
		if (vp === 'phone') A(L.sw[0] <= L.sw[1] + 1, `${tag}: the footer's buttons fit the screen`, JSON.stringify(L.sw));
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `scoundrel_classic_${vp}.png`) });
		const s0 = await page.evaluate(() => window.__au);
		// (the love.js game makes its own AudioContext as it boots: what matters is that no sound starts)
		A(s0.starts.length === 0, `${tag}: nothing plays before a gesture`, JSON.stringify(s0));
		await page.keyboard.down('Shift'); await page.keyboard.up('Shift'); await sleep(700);
		// (Back first: Go Fullscreen may really go full screen and cover the page)
		for (const [sel, what] of [['footer a.bal-back', 'cancel'], ['footer button', 'button']]) {
			const n0 = await page.evaluate(() => window.__au.starts.length);
			const p = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
			if (VIEWPORTS[vp].hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
			A(await waitFor(() => page.evaluate((n) => window.__au.starts.length > n, n0), 3000), `${tag}: pressing ${sel} plays Balatro's ${what} sound`);
			await sleep(150);
		}
		A(!errors.length, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'threw ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
