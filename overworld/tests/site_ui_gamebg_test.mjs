// site_ui_gamebg_test.mjs — no game page puts the kit's FIXED felt under a canvas it redraws every frame.
// The kit's .bal-page background is a radial gradient with background-attachment: fixed. Under a canvas that redraws
// each frame, a fixed gradient makes Chrome repaint the page behind it every frame (MicaSurvivor found it, #1392), so
// the game pages sit on the kit's flat --bal-bg instead and draw any felt inside their own canvas. This suite loads
// every game page that draws a per-frame canvas (Overworld, PokéChess, Battlecards' board + pack opening, MicaSurvivor
// 2D + 3D), desktop (1600x900) + phone (390x844), and checks:
//   - its canvas is there (the page is the game, not a loading error);
//   - the page is still a kit page (m6x11 is the body font) on the flat --bal-bg: no fixed gradient on <html> or <body>,
//     and no element covering the screen behind the canvas has one either.
//   node overworld/tests/site_ui_gamebg_test.mjs
// Covers overworld/index.html, overworld/pokechess.html, battlecards/index.html, battlecards/packs.html,
// micasurvivor/index.html (micasurvivor/css/bal.css), micasurvivor/m3d/index.html.
import fs from 'fs';
import path from 'path';
import { ROOT, makeAsserter, startServer, launch, waitFor, sleep, TOK, rgb, VIEWPORTS } from './bc_balatro_lib.mjs';

const R = makeAsserter(), A = R.A;
const KIT = fs.readFileSync(path.join(ROOT, 'site/ui/balatro.css'), 'utf8');
A(/\.bal-page\s*\{[^}]*\)\s*fixed;/.test(KIT), "the kit's .bal-page felt is a fixed gradient (the thing game pages must not sit on)");

const PAGES = [
	['overworld', '/overworld/index.html?map=PalletTown&x=10&y=12'],
	['pokechess', '/overworld/pokechess.html'],
	['battlecards board', '/battlecards/index.html'],
	['battlecards packs', '/battlecards/packs.html'],
	['micasurvivor', '/micasurvivor/'],
	['micasurvivor 3D', '/micasurvivor/m3d/'],
	['poketactica', '/poketactica/'],
];
const STATE = { username: 'tester', friendCode: 'ABCD1234', collection: {}, decks: [], packs: 1, dust: 0 };
const { server, port } = await startServer({ onApi: (b) => (b.action === 'state' ? { state: STATE } : null) });
const browser = await launch();
try {
	for (const [name, url] of PAGES) for (const vp of ['desktop', 'phone']) {
		const tag = `${name} (${vp})`;
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(VIEWPORTS[vp]);
		await page.evaluateOnNewDocument((st) => { try { localStorage.setItem('magepunk_mp_token_v1', 'tester.9999999999.' + 'a'.repeat(64)); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('mp_onboarded_v1', '1'); } catch { } }, STATE);
		await page.goto(`http://localhost:${port}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
		const canvas = await waitFor(() => page.evaluate(() => [...document.querySelectorAll('canvas')].some((c) => { const r = c.getBoundingClientRect(); return r.width > 100 && r.height > 100; })), 30000);
		A(canvas, `${tag}: its game canvas is on the page`);
		await sleep(800);
		const r = await page.evaluate(() => {
			const fixedGrad = (el) => { const s = getComputedStyle(el); return /gradient/.test(s.backgroundImage) && /fixed/.test(s.backgroundAttachment); };
			// anything else painting a fixed gradient across most of the screen (a wrapper behind the canvas)
			const big = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width * b.height > innerWidth * innerHeight * 0.5 && fixedGrad(e); }).map((e) => e.tagName + (e.id ? '#' + e.id : ''));
			const b = getComputedStyle(document.body);
			return { html: fixedGrad(document.documentElement), body: fixedGrad(document.body), big, bg: b.backgroundColor, img: b.backgroundImage.slice(0, 50), font: b.fontFamily, balPage: document.body.classList.contains('bal-page') };
		});
		A(!r.html && !r.body && !r.big.length, `${tag}: no fixed felt gradient behind the per-frame canvas`, JSON.stringify(r));
		A(r.bg === rgb(TOK.bg) || r.img === 'none', `${tag}: the page behind it is the flat --bal-bg (or nothing)`, JSON.stringify([r.bg, r.img]));
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
