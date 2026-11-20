// bc_balatro_theme_test.mjs — the Battlecards hub pages have ONE look, the Balatro kit's (owner, 2026-11-19: "redo every
// UI ... into the balatro style"). The old ◐ Theme toggle and its light palette (battlecards/theme.css, data-theme on
// <html>, saved in localStorage as mp-theme) are retired, and theme.css's colour names are the kit's tokens:
//   - start.html, boards.html and replays.html, desktop (1600x900) + phone (390x844), for a player who once picked the
//     LIGHT theme (mp-theme = 'light' still in their storage):
//     - the kit is on the page (balatro.css, body.bal-page, m6x11 loaded, the felt), and a press plays a kit sound;
//     - nothing stamps data-theme on <html>, there is no ◐ Theme button, and the page's colour names (--panel, --text,
//       --gold...) are the kit's tokens even at :root, where the light theme used to set white panels;
//     - no visible box is drawn in a light (near-white) panel or in the old navy palette;
//   - theme.css itself has no light theme and none of the old navy colours left.
//   node overworld/tests/bc_balatro_theme_test.mjs      (screenshots: SHOTS=<dir>)
// Covers battlecards/theme.css, battlecards/start.html, battlecards/boards.html, battlecards/replays.html, battlecards/bal-skin.css.
import fs from 'fs';
import path from 'path';
import { ROOT, makeAsserter, startServer, launch, checkPage, TOK, rgb } from './bc_balatro_lib.mjs';

const R = makeAsserter(), A = R.A;
const OLD = ['#0c1122', '#141a35', '#1a2140', '#212a52', '#2e3a63', '#e8eaf6', '#9aa3c8', '#ffcf6b', '#6ea8ff', '#a688ff', '#6bd6a0', '#ff8a8a',
	'#eef0fa', '#f6f7fc', '#f3f5ff', '#dde1f2', '#1b2038', '#5a6288'];

// theme.css on disk
const css = fs.readFileSync(path.join(ROOT, 'battlecards/theme.css'), 'utf8');
A(!/\[data-theme/.test(css), 'theme.css: no theme selector left (no light theme)');
A(OLD.every((h) => !css.toLowerCase().includes(h)), 'theme.css: none of the old navy / light palette colours left', OLD.filter((h) => css.toLowerCase().includes(h)).join(' '));
A(/--panel:\s*var\(--bal-panel\)/.test(css) && /--text:\s*var\(--bal-text\)/.test(css), "theme.css: its colour names are the kit's tokens");

const { server, port } = await startServer({ onApi: (b) => (b.action === 'state' ? { state: { username: 'tester', collection: {}, decks: [] } } : null) });
const browser = await launch();
const pages = [
	{ name: 'theme_start', url: '/battlecards/start.html', presses: [{ sel: 'a.primary', sound: 'press' }] },
	{ name: 'theme_boards', url: '/battlecards/boards.html', presses: [{ sel: 'a.back', sound: 'back' }] },
	{ name: 'theme_replays', url: '/battlecards/replays.html', presses: [{ sel: 'a.back', sound: 'back' }] },
];
try {
	for (const P of pages) for (const vp of ['desktop', 'phone']) {
		await checkPage(browser, port, A, {
			...P, vp,
			storage: { 'mp-theme': 'light', mp_onboarded_v1: '1', micatro_sfx: '1' },
			after: async (page, tag) => {
				const r = await page.evaluate((OLD) => {
					const root = getComputedStyle(document.documentElement);
					const hex = (c) => { const m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); if (!m || (m[4] !== undefined && +m[4] < 0.5)) return null; return '#' + [m[1], m[2], m[3]].map((x) => (+x | 0).toString(16).padStart(2, '0')).join(''); };
					const light = [], old = [];
					for (const e of document.querySelectorAll('body *')) {
						const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2 || e.closest('svg, canvas, img')) continue;
						const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') continue;
						const h = hex(s.backgroundColor);
						if (h) { const n = parseInt(h.slice(1), 16), L = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; if (L > 0.85 && b.width * b.height > 6000) light.push(e.tagName + '.' + e.className + ' ' + h); }
						for (const c of [h, e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ? hex(s.color) : null]) if (c && OLD.includes(c)) old.push(e.tagName + '.' + e.className + ' ' + c);
					}
					return { theme: document.documentElement.getAttribute('data-theme'), toggle: !!document.getElementById('theme-toggle') || !!document.querySelector('.theme-toggle'),
						panel: root.getPropertyValue('--panel').trim().toLowerCase(), text: root.getPropertyValue('--text').trim().toLowerCase(), gold: root.getPropertyValue('--gold').trim().toLowerCase(),
						light: light.slice(0, 4), old: old.slice(0, 4) };
				}, OLD);
				A(r.theme === null, `${tag}: a saved light theme stamps nothing on <html>`, r.theme);
				A(!r.toggle, `${tag}: no ◐ Theme button`);
				A(r.panel === TOK.panel && r.text === '#fff' && r.gold === TOK.gold, `${tag}: :root's --panel / --text / --gold are the kit's tokens`, JSON.stringify([r.panel, r.text, r.gold]));
				A(!r.light.length, `${tag}: no light panel on the page`, r.light.join(' | '));
				A(!r.old.length, `${tag}: nothing drawn in the old navy palette`, r.old.join(' | '));
			},
		});
	}
} catch (e) {
	A(false, 'threw ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`
${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
