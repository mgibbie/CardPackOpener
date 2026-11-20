// site_ui_kit_test.mjs — the site's Balatro-style UI kit (site/ui/: balatro.css, sfx.js, canvas.js, the style guide
// at /site/ui/), in a real browser, desktop + phone:
//   - the style guide loads with no errors and the m6x11 font loads;
//   - every component renders (non-zero size) in the kit's token colours (Micatro's palette), with its states
//     (pressed sinks, disabled greys, the chosen tab / choice red, the dialog opens);
//   - sounds: nothing plays (no AudioContext even) before a user gesture; a button press then plays Micatro's
//     button.ogg through WebAudio (spied at AudioBufferSourceNode.start), Back plays cancel.ogg, a disabled button
//     is silent, and sound off (Micatro's micatro_sfx setting) is silence;
//   - canvas.js draws a panel / button / bar / tooltip / text into a canvas in the right colours (pixel checks), and
//     its palette is the CSS tokens;
//   - Micatro, Pocket Enhanced, Pair of Pears and Scoundrel import the kit from micatro.css, and their main menus
//     are pixel-identical (>= 99%) with micatro.css as shipped vs. micatro.css with the kit inlined (no @import, the
//     literal colours): factoring the palette into the kit moved nothing.
//   node overworld/tests/site_ui_kit_test.mjs      (screenshots: SHOTS=<dir>)
// Covers site/ui/balatro.css, site/ui/sfx.js, site/ui/canvas.js, site/ui/index.html, micatro/css/micatro.css.
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN_ROOT = path.basename(path.dirname(ROOT)) === '.worktrees' ? path.resolve(ROOT, '../..') : null;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
// gitignored assets (Micatro mod art, overworld data) may live only in the main checkout when run from a worktree
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { for await (const _ of req) { /* drain */ } res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
	const send = (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000,
	args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

// the kit's tokens, read from the file itself (the source of truth the checks compare against)
const KIT = (() => { try { return fs.readFileSync(path.join(ROOT, 'site/ui/balatro.css'), 'utf8'); } catch { return ''; } })();
const TOK = {}; for (const m of KIT.matchAll(/--bal-([a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)) TOK[m[1]] = m[2].toLowerCase();
const rgb = (hex) => { const h = (hex || '#000000').slice(1); const n = (i) => parseInt(h.slice(i, i + 2), 16); return `rgb(${n(0)}, ${n(2)}, ${n(4)})`; };
A(Object.keys(TOK).length >= 30 && TOK.blue === '#009dff' && TOK.panel === '#3a4b4f', 'site/ui/balatro.css defines the palette tokens (Micatro\'s colours)', Object.keys(TOK).length);

// Spy on WebAudio before any page script: count AudioContexts made and buffer sources started, and the .ogg fetched.
const SPY = () => {
	window.__au = { ctx: 0, starts: 0, fetched: [] };
	const AC = window.AudioContext;
	if (AC) {
		window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__au.ctx++; } };
		const st = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts++; return st.apply(this, a); };
	}
	const f = window.fetch;
	window.fetch = function (u, ...a) { const s = String(u && u.url || u); if (/\.ogg/.test(s)) window.__au.fetched.push(s.split('/').pop()); return f.call(this, u, ...a); };
};

try {
	// ------------------------------------------------------------------ the style guide
	for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
		await page.evaluateOnNewDocument(SPY);
		const r = await page.goto(`http://localhost:${PORT}/site/ui/`, { waitUntil: 'domcontentloaded' });
		A(r && r.ok(), `${name}: /site/ui/ (the style guide) is served`, r && r.status());
		const ready = await waitFor(() => page.evaluate(() => !!window.__uikit), 15000) && await page.evaluate(() => window.__uikit.ready).catch(() => false);
		A(ready === true, `${name}: the style guide boots (sfx.js + canvas.js imported, the font loaded for canvas)`);
		await sleep(400);
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `uikit_${name}.png`), fullPage: true });

		const font = await page.evaluate(() => ({
			check: document.fonts.check('16px m6x11'),
			loaded: [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'm6x11' && f.status === 'loaded'),
			body: getComputedStyle(document.body).fontFamily,
			// the pixel font is narrower than the monospace fallback: a span set in it measures differently
			w: (() => { const s = document.createElement('span'); s.textContent = 'WWWWWWWWWW'; s.style.cssText = 'font: 20px m6x11; position: absolute'; document.body.append(s); const a = s.offsetWidth; s.style.fontFamily = 'monospace'; const b = s.offsetWidth; s.remove(); return [a, b]; })(),
		}));
		A(font.check && font.loaded && /m6x11/.test(font.body) && font.w[0] > 0 && font.w[0] !== font.w[1], `${name}: the m6x11 font loads and the page is set in it`, JSON.stringify(font));

		// every component: rendered, in the token colours
		const look = await page.evaluate(() => {
			const q = (s) => document.querySelector(s);
			const cs = (s) => { const e = typeof s === 'string' ? q(s) : s; return e ? getComputedStyle(e) : null; };
			const box = (s) => { const e = q(s); if (!e) return 0; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? 1 : 0; };
			const SEL = ['.bal-page', '.bal-logo', '.bal-h2', '.bal-panel', '.bal-panel.bal-outlined', '.bal-inset', '.bal-well', '.bal-white', '.bal-btn', '.bal-btn.bal-blue', '.bal-btn.bal-red',
				'.bal-btn.bal-green', '.bal-btn.bal-orange', '.bal-btn.bal-purple', '.bal-btn.bal-gold', '.bal-btn.bal-sm', '.bal-btn.bal-lg', '.bal-btn.bal-wide', '.bal-tabs', '.bal-tab.is-on', '.bal-seg',
				'.bal-input', '.bal-select', '.bal-check', '.bal-range', '.bal-field', '.bal-list', '.bal-row', '.bal-row.is-me', '.bal-table', '.bal-tip', '.bal-tip-name', '.bal-tip-body',
				'.bal-badge', '.bal-chip', '.bal-key', '.bal-bar', '.bal-bar-fill', '.bal-banner', '.bal-toast.is-static', '.bal-scroll', '#sg-canvas'];
			const sizes = Object.fromEntries(SEL.map((s) => [s, box(s)]));
			const root = getComputedStyle(document.documentElement);
			return {
				sizes,
				tokens: Object.fromEntries(['blue', 'red', 'panel', 'panel-dd', 'money'].map((k) => [k, root.getPropertyValue('--bal-' + k).trim()])),
				blue: [cs('.bal-btn.bal-blue').backgroundColor, cs('.bal-btn.bal-blue').boxShadow, cs('.bal-btn.bal-blue').color],
				red: cs('#sg-btn-colours .bal-red').backgroundColor, green: cs('#sg-btn-colours .bal-green').backgroundColor, orange: cs('#sg-btn-colours .bal-orange').backgroundColor,
				purple: cs('#sg-btn-colours .bal-purple').backgroundColor, gold: cs('#sg-btn-colours .bal-gold').backgroundColor, grey: cs('#sg-btn-colours [data-c=grey]').backgroundColor,
				pressed: cs('.bal-btn.is-pressed').transform, disabled: [cs('#sg-disabled').backgroundColor, cs('#sg-disabled').color],
				focus: cs('.bal-btn.is-focus').boxShadow,
				panel: [cs('#sec-buttons').backgroundColor, cs('#sec-buttons').boxShadow], inset: cs('#sg-inset').backgroundColor, well: cs('#sg-well').backgroundColor,
				tabOn: cs('.bal-tab.is-on').backgroundColor, tabOff: cs('.bal-tab:not(.is-on)').backgroundColor, segOn: cs('#sg-speed .is-on').backgroundColor,
				input: [cs('.bal-input').backgroundColor, cs('.bal-input').borderTopColor, cs('.bal-input').fontFamily], check: cs('.bal-check:checked').backgroundColor,
				row: cs('.bal-row').backgroundColor, td: cs('.bal-table td').backgroundColor, tipBody: [cs('.bal-tip-body').backgroundColor, cs('.bal-tip-body').color], tip: cs('.bal-tip').backgroundColor,
				badge: cs('.bal-badge.bal-purple').backgroundColor, toast: cs('.bal-toast.is-static').backgroundColor, scroll: cs('.bal-scroll').scrollbarColor,
				bg: cs(document.body).backgroundImage, money: cs('.bal-t-money').color,
				modalHidden: cs('#sg-modal').display,
			};
		});
		const missing = Object.entries(look.sizes).filter(([, v]) => !v).map(([k]) => k);
		A(!missing.length, `${name}: every component renders (non-zero size): ${Object.keys(look.sizes).length} kinds`, missing.join(' '));
		A(look.tokens.blue === TOK.blue && look.tokens.panel === TOK.panel && look.tokens['panel-dd'] === TOK['panel-dd'], `${name}: the :root tokens are live`, JSON.stringify(look.tokens));
		A(look.blue[0] === rgb(TOK.blue) && look.blue[1].includes(rgb(TOK['blue-d'])) && look.blue[2] === 'rgb(255, 255, 255)', `${name}: a blue button is --bal-blue on its darker --bal-blue-d lip, white text`, JSON.stringify(look.blue));
		A(look.red === rgb(TOK.red) && look.green === rgb(TOK.green) && look.orange === rgb(TOK.orange) && look.purple === rgb(TOK.purple) && look.gold === rgb(TOK.gold) && look.grey === rgb(TOK.grey),
			`${name}: red / green / orange / purple / gold / grey buttons in their tokens`, JSON.stringify([look.red, look.green, look.orange, look.purple, look.gold, look.grey]));
		A(/matrix\(1, 0, 0, 1, 0, [1-9]/.test(look.pressed), `${name}: a pressed button sinks onto its lip`, look.pressed);
		A(look.disabled[0] === rgb(TOK.disabled) && look.disabled[1] === rgb(TOK['disabled-text']), `${name}: a disabled button greys out`, JSON.stringify(look.disabled));
		A(/rgb\(255, 255, 255\)/.test(look.focus), `${name}: a focused button has the white ring`, look.focus);
		A(look.panel[0] === rgb(TOK.panel) && look.panel[1].includes(rgb(TOK['panel-dd'])) && look.panel[1].includes(rgb(TOK['panel-line'])), `${name}: a panel is --bal-panel with its dark lip and inner outline`, JSON.stringify(look.panel));
		A(look.inset === rgb(TOK['panel-d']) && look.well === rgb(TOK['panel-dd']) && look.row === rgb(TOK['panel-d']) && look.td === rgb(TOK['panel-d']), `${name}: inset rows, wells, list rows and table cells in the panel shades`);
		A(look.tabOn === rgb(TOK.red) && look.tabOff === rgb(TOK['tab-off']) && look.segOn === rgb(TOK.red), `${name}: the chosen tab / choice is red, the other tabs dark red`, JSON.stringify([look.tabOn, look.tabOff, look.segOn]));
		A(look.input[0] === rgb(TOK['panel-dd']) && look.input[1] === rgb(TOK['outline-light']) && /m6x11/.test(look.input[2]) && look.check === rgb(TOK.red), `${name}: inputs are dark wells with the light outline in m6x11, a ticked box is red`, JSON.stringify(look.input));
		A(look.tip === rgb(TOK.panel) && look.tipBody[0] === 'rgb(255, 255, 255)' && look.tipBody[1] === rgb(TOK['text-dark']), `${name}: a tooltip is the panel over white card text`);
		A(look.badge === rgb(TOK.purple) && look.toast === rgb(TOK.red) && look.money === rgb(TOK.money), `${name}: badges, toasts and the money colour in their tokens`);
		A(/radial-gradient/.test(look.bg) && /rgb\(90, 158, 131\)/.test(look.bg), `${name}: .bal-page has the green felt background`, look.bg);
		A(/rgb/.test(look.scroll || ''), `${name}: .bal-scroll has the themed scrollbar`, look.scroll);

		// the dialog opens and closes (keyboard: Enter on its button, X closes)
		A(look.modalHidden === 'none', `${name}: the dialog starts hidden`);

		// ---- sounds: nothing before a gesture
		const before = await page.evaluate(() => { const r = [window.__uikit.sfx.press(), window.__uikit.sfx.coin(), window.__uikit.sfx.play('button')]; return { r, au: { ...window.__au } }; });
		await sleep(300);
		const before2 = await page.evaluate(() => ({ ...window.__au }));
		A(before.r.every((x) => x === false) && before2.ctx === 0 && before2.starts === 0 && before2.fetched.length === 0, `${name}: before any user gesture nothing plays (no AudioContext, no sound fetched)`, JSON.stringify(before2));

		const tap = async (sel) => {
			const p = await page.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
			if (vp.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
		};
		const starts = () => page.evaluate(() => window.__au.starts);
		await tap('#sg-btn-colours .bal-blue');
		A(await waitFor(() => page.evaluate(() => window.__au.starts >= 1 && window.__au.ctx === 1), 5000), `${name}: pressing a .bal-btn plays a sound through WebAudio`, JSON.stringify(await page.evaluate(() => window.__au)));
		A((await page.evaluate(() => window.__au.fetched)).includes('button.ogg'), `${name}: ... Micatro's button.ogg`);
		let n0 = await starts();
		await sleep(80);
		await tap('.sg-row .bal-back');
		A(await waitFor(async () => (await starts()) > n0, 4000) && (await page.evaluate(() => window.__au.fetched)).includes('cancel.ogg'), `${name}: a Back button plays cancel.ogg`);
		n0 = await starts();
		await page.evaluate(() => document.querySelector('#sg-disabled').click());
		await sleep(300);
		A((await starts()) === n0, `${name}: a disabled button is silent`);
		await tap('#sg-modal-btn');
		A(await waitFor(() => page.evaluate(() => getComputedStyle(document.getElementById('sg-modal')).display === 'flex' && document.querySelector('.bal-modal-box').getBoundingClientRect().height > 0), 3000), `${name}: the dialog opens`);
		await sleep(600);   // (the box rises in: tap Back once it has landed)
		const modal = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.bal-modal-box')); return [c.backgroundColor, c.boxShadow]; });
		A(modal[0] === rgb(TOK.panel) && modal[1].includes(rgb(TOK['outline-light'])), `${name}: the dialog box is the panel with the light outline`, JSON.stringify(modal));
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `uikit_${name}_modal.png`) });
		await tap('#sg-modal-close');
		A(await waitFor(() => page.evaluate(() => document.getElementById('sg-modal').hidden), 3000), `${name}: ... and closes`);

		// a canvas button press sounds too (canvas.js hit + sfx.press)
		n0 = await starts();
		await sleep(80);
		const cp = await page.evaluate(() => { const cv = document.getElementById('sg-canvas'); cv.scrollIntoView({ block: 'center' }); const r = cv.getBoundingClientRect(), b = window.__uikit.btns[1];
			return { x: r.left + (b.x + b.w / 2) * r.width / cv.width, y: r.top + (b.y + b.h / 3) * r.height / cv.height }; });
		if (vp.hasTouch) await page.touchscreen.tap(cp.x, cp.y); else await page.mouse.click(cp.x, cp.y);
		A(await waitFor(async () => (await starts()) > n0, 4000), `${name}: pressing a canvas button plays the press sound`);

		// sound off (Micatro's setting) = silence
		await tap('#sg-sound [data-v="0"]');
		await sleep(150);
		const off = await page.evaluate(() => ({ ls: localStorage.getItem('micatro_sfx'), on: window.__uikit.sfx.enabled() }));
		n0 = await starts();
		await tap('#sg-btn-colours .bal-red');
		await page.evaluate(() => { window.__uikit.sfx.coin(); window.__uikit.sfx.win(); });
		await sleep(500);
		A(off.ls === '0' && off.on === false && (await starts()) === n0, `${name}: sound off (micatro_sfx = 0) is silence`, JSON.stringify(off));
		await page.evaluate(() => window.__uikit.sfx.setEnabled(true));

		// ---- canvas.js: draw into a fresh canvas and read the pixels back
		const px = await page.evaluate(() => {
			const { BC } = window.__uikit;
			const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300;
			const c = cv.getContext('2d');
			const at = (x, y) => { const d = c.getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('') + (d[3] === 255 ? '' : '/' + d[3]); };
			BC.panel(c, 10, 10, 200, 100, 1);              // lip 6, outline 2.5 px
			const panel = { fill: at(110, 60), outline: at(11, 60), lip: at(110, 113), outside: at(110, 140) };
			BC.button(c, { x: 230, y: 10, w: 120, h: 50, label: '', color: 'blue' }, 1);
			const lip = Math.max(3, Math.min(7, 50 * 0.15));
			const btn = { face: at(290, 20), edge: at(290, 10 + 50 - lip / 2) };
			c.clearRect(225, 0, 175, 70);
			BC.button(c, { x: 230, y: 10, w: 120, h: 50, label: '', color: 'red', pressed: true }, 1);
			const pressed = { top: at(290, 12), face: at(290, 25) };
			BC.button(c, { x: 230, y: 80, w: 120, h: 40, label: '', color: 'green', focused: true }, 1);
			const focus = { ring: at(290, 78), face: at(290, 90) };
			BC.button(c, { x: 230, y: 140, w: 120, h: 40, label: '', color: 'green', disabled: true }, 1);
			const dis = at(290, 150);
			BC.bar(c, 10, 140, 200, 16, 0.5, 1, { color: BC.C.green });
			const bar = { full: at(50, 148), empty: at(170, 148) };
			const tr = BC.tooltip(c, 10, 180, 1, { title: 'Hi', body: 'Body text here' });
			const tip = { rect: tr, edge: at(Math.round(tr.x + 1), Math.round(tr.y + tr.h / 2)), body: at(Math.round(tr.x + 8), Math.round(tr.y + tr.h - 9)) };
			const c2 = document.createElement('canvas').getContext('2d'); c2.canvas.width = 120; c2.canvas.height = 40;
			BC.text(c2, 'Hello', 4, 28, 1, { size: 24 });
			const td = c2.getImageData(0, 0, 120, 40).data; let ink = 0, shadow = 0;
			for (let i = 0; i < td.length; i += 4) if (td[i + 3] > 200) { if (td[i] > 240 && td[i + 1] > 240) ink++; else shadow++; }
			c2.font = BC.font(24);
			return { panel, btn, pressed, focus, dis, bar, tip, ink, shadow, fontStr: c2.font, C: BC.C,
				sg: (() => { const s = document.getElementById('sg-canvas'); const d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) k++; return k; })() };
		});
		const near = (a, b, t = 6) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); if (!a || !b || a.includes('/')) return false; const x = p(a), y = p(b); return x.every((v, i) => Math.abs(v - y[i]) <= t); };
		A(near(px.panel.fill, TOK.panel) && near(px.panel.outline, TOK['panel-line'], 14) && near(px.panel.lip, TOK['panel-dd']) && /\/0$/.test(px.panel.outside), `${name}: canvas panel(): panel fill, inner outline, dark lip below`, JSON.stringify(px.panel));
		A(near(px.btn.face, TOK.blue) && near(px.btn.edge, TOK['blue-d']), `${name}: canvas button(): the blue face on its darker bottom edge`, JSON.stringify(px.btn));
		A(/\/0$/.test(px.pressed.top) && near(px.pressed.face, TOK.red), `${name}: canvas button({pressed}): it sinks (the top rows are empty)`, JSON.stringify(px.pressed));
		A(px.focus.ring === '#ffffff' && near(px.focus.face, TOK.green), `${name}: canvas button({focused}): the white focus ring`, JSON.stringify(px.focus));
		A(near(px.dis, TOK.disabled), `${name}: canvas button({disabled}) greys out`, px.dis);
		A(near(px.bar.full, TOK.green) && !near(px.bar.empty, TOK.green), `${name}: canvas bar() fills to its fraction`, JSON.stringify(px.bar));
		A(px.tip.rect.w > 40 && px.tip.rect.h > 30 && near(px.tip.edge, TOK['outline-light'], 20) && px.tip.body === '#ffffff', `${name}: canvas tooltip(): light outline, white body`, JSON.stringify(px.tip));
		A(px.ink > 30 && px.shadow > 10 && /m6x11/.test(px.fontStr), `${name}: canvas text(): white m6x11 text with its drop shadow`, JSON.stringify([px.ink, px.shadow, px.fontStr]));
		A(['blue', 'red', 'green', 'orange', 'purple', 'gold', 'money', 'panel'].every((k) => px.C[k] === TOK[k]) && px.C.panelDD === TOK['panel-dd'] && px.C.outlineLight === TOK['outline-light'],
			`${name}: canvas.js's palette is the CSS tokens`);
		A(px.sg > 10000, `${name}: the style guide's canvas section is drawn`, px.sg);
		A(!errors.length, `${name}: no page errors`, errors.join(' | '));
		await ctx.close();
	}

	// ------------------------------------------------------------------ the four Balatro games: the kit moved nothing
	const mcss = fs.readFileSync(path.join(ROOT, 'micatro/css/micatro.css'), 'utf8');
	A(/@import url\(['"]?\.\.\/\.\.\/site\/ui\/balatro\.css['"]?\)/.test(mcss) && /--blue:\s*var\(--bal-blue\)/.test(mcss), 'micatro.css imports the kit and takes its palette from the kit tokens');
	// "without the kit": the @import dropped and every var(--bal-x) replaced by its literal colour
	const inlined = mcss.replace(/@import url\([^)]*balatro\.css[^)]*\);?/, '').replace(/var\(--bal-([a-z0-9-]+)\)/g, (m, k) => TOK[k] || m);
	const GAMES = [
		['Micatro', '/micatro/', () => !!document.querySelector('.main-menu .b-menu-play')],
		['Pocket Enhanced', '/pocketenhanced/', () => document.fonts.status === 'loaded' && document.querySelectorAll('button').length > 2],
		['Pair of Pears', '/pairofpears/', () => !!document.querySelector('.menu-modal .b-new')],
		['Scoundrel', '/scoundrel/', () => !!document.querySelector('.menu-modal .b-new')],
	];
	const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } #bg, canvas#bg { visibility: hidden !important; }';
	const cmpPage = await browser.newPage();
	await cmpPage.goto(`http://localhost:${PORT}/site/ui/balatro.css`);
	for (const [label, url, menuReady] of GAMES) {
		const shots = [];
		for (const variant of ['shipped', 'inlined']) {
			const ctx = await browser.createBrowserContext();
			const page = await ctx.newPage();
			await page.setViewport({ width: 1280, height: 800 });
			await page.evaluateOnNewDocument(() => {
				try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); } catch { /* ignore */ }
				Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();   // (same deal / same menu art both times)
			});
			await page.setRequestInterception(true);
			page.on('request', (req) => {
				if (variant === 'inlined' && /\/micatro\/css\/micatro\.css/.test(req.url())) return req.respond({ status: 200, contentType: 'text/css', body: inlined });
				return req.continue();
			});
			await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
			const ok = await waitFor(() => page.evaluate(menuReady), 20000);
			await page.addStyleTag({ content: FREEZE });
			await page.evaluate(() => document.fonts.ready);
			await sleep(1500);
			const kitLoaded = await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.styleSheet && /site\/ui\/balatro\.css/.test(r.styleSheet.href || '')); } catch { return false; } }));
			const blue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--blue').trim());
			shots.push({ ok, kitLoaded, blue, png: (await page.screenshot({ encoding: 'base64' })) });
			if (SHOTS) fs.writeFileSync(path.join(SHOTS, `menu_${label.replace(/\W+/g, '_')}_${variant}.png`), Buffer.from(shots.at(-1).png, 'base64'));
			await ctx.close();
		}
		A(shots[0].ok && shots[1].ok, `${label}: the main menu shows (both ways)`);
		A(shots[0].kitLoaded && !shots[1].kitLoaded, `${label}: loads the kit through micatro.css`, JSON.stringify([shots[0].kitLoaded, shots[1].kitLoaded]));
		A(shots[0].blue === TOK.blue && shots[1].blue === TOK.blue, `${label}: Micatro's --blue resolves to the kit's colour`, JSON.stringify([shots[0].blue, shots[1].blue]));
		const same = await cmpPage.evaluate(async (a, b) => {
			const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
			const [x, y] = await Promise.all([load(a), load(b)]);
			const get = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
			const p = get(x), q = get(y); if (p.length !== q.length) return 0;
			let eq = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) <= 8 && Math.abs(p[i + 1] - q[i + 1]) <= 8 && Math.abs(p[i + 2] - q[i + 2]) <= 8) eq++;
			return eq / (p.length / 4);
		}, shots[0].png, shots[1].png);
		A(same >= 0.99, `${label}: the main menu is pixel-identical with the kit vs. without it (${(same * 100).toFixed(2)}% >= 99%)`);
	}
	await cmpPage.close();
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
