// site_ui_shell_test.mjs — the Balatro look on the parts every page shares and on the site's own front pages
// (owner, 2026-11-19: "redo every UI in the entire game into the balatro style ... do include button press type sound
// effects"), in a real browser, desktop (1600x900) + phone (390x844):
//   PAGES   home, login, profile, watch: load with no errors; take the kit (site/ui/balatro.css: body.bal-page, the
//           m6x11 font loaded and used, the felt background, a panel and the main button in the kit's token colours);
//           their main button presses with Balatro's button sound (spied at AudioBufferSourceNode.start, after a gesture)
//           and nothing plays before a gesture; their old behaviour holds (home's owner / player tiles, login's
//           Log in <-> Create account flip, profile's stats + Log out, watch's empty state).
//   OVERLAYS the top bar (logged out: Log in; logged in: the bell, the profile chip; compact: the floating buttons),
//           the inbox (panel, tabs red when chosen, a tab press = the tab sound), the Games switcher (opens with a
//           sound, Close = back), the on-screen keyboard (grey keys, green OK, a key types and sounds), the chat (the
//           pill is a grey kit button and sounds), the bets chip + panel (gold chip, the dialog box, an outcome picks
//           and sounds), the profile popup (dialog box, blue Add friend that sounds).
// The server is a stub (/api/mp answers the few actions these pages ask). SHOTS=<dir> writes a PNG of every page and
// overlay at both sizes.
//   node overworld/tests/site_ui_shell_test.mjs
// Covers site/topbar.js, site/switcher.js, site/osk.js, site/bets.js, site/pagesounds.js, battlecards/chat.js,
// battlecards/profile.js, index.html, login/index.html, profile/index.html, watch/index.html.
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
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }

// ---------- a stub of the few server answers these pages ask for ----------
const ME = 'tester';
const NOW = Date.now();
const STATE = { username: ME, friendCode: 'ABCD1234', collection: { c1: 2, c2: 1 }, decks: [], packsOpened: 3, wins: 4, created: NOW - 86400000 * 40 };
const API = {
	state: () => ({ state: STATE }),
	friends: () => ({ friends: [{ username: 'pal', online: true, status: 'micatro:Ante 3' }, { username: 'quiet', online: false }], friendCode: 'ABCD1234' }),
	challenges: () => ({ challenges: [] }),
	'chat-get': () => ({ messages: [] }),
	'pack-timer': () => ({ packInbox: 2, packCap: 120, nextPackMs: 3600000, featuredClaimed: true }),
	quests: () => ({ quests: [{ id: 'q1', label: 'Win 3 games', progress: 1, target: 3, reward: 1 }, { id: 'q2', label: 'Open a pack', progress: 1, target: 1, reward: 1 }], resetsInMs: 3600000, streak: { count: 3, claimedToday: false, nextReward: 1 } }),
	'golive-get': () => ({ all: false, friends: [] }),
	presence: () => ({ presence: {} }),
	pubprofile: () => ({ profile: { username: 'pal', online: true, status: 'micatro:x', wins: 7, runs: 12, packsOpened: 30, uniqueCards: 400, deckCount: 3, created: NOW - 86400000 * 90, isFriend: false, isYou: false } }),
	'live-friends': () => ({ live: [] }),
	'add-friend': () => ({ added: true }),
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) {
		let body = ''; for await (const c of req) body += c;
		let a = {}; try { a = JSON.parse(body || '{}'); } catch { /* beacon */ }
		const fn = API[a.action];
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify(fn ? fn(a) : {}));
	}
	const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
	const send = (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000,
	args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

// the kit's tokens, read from the kit itself
const KIT = (() => { try { return fs.readFileSync(path.join(ROOT, 'site/ui/balatro.css'), 'utf8'); } catch { return ''; } })();
const TOK = {}; for (const m of KIT.matchAll(/--bal-([a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)) TOK[m[1]] = m[2].toLowerCase();
const rgb = (hex) => { if (!hex) return 'rgb(?)'; const h = hex.slice(1); const n = (i) => parseInt(h.slice(i, i + 2), 16); return `rgb(${n(0)}, ${n(2)}, ${n(4)})`; };
A(TOK.blue === '#009dff' && TOK.panel === '#3a4b4f', 'the kit (site/ui/balatro.css) is there, with its tokens');

// WebAudio spy (before any page script) + optional login
const SPY = (login) => {
	window.__au = { ctx: 0, starts: 0 };
	const AC = window.AudioContext;
	if (AC) {
		window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__au.ctx++; } };
		const st = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts++; return st.apply(this, a); };
	}
	try {
		localStorage.setItem('micatro_sfx', '1');
		if (login) { localStorage.setItem('magepunk_mp_token_v1', login.token); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(login.state)); }
	} catch { /* none */ }
	// a link press must not leave the page under test
	addEventListener('click', (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (a && !a.hasAttribute('data-mp-switcher')) e.preventDefault(); });
};
const LOGIN = { token: ME + '.9999999999.' + 'a'.repeat(64), state: STATE };
const VPS = [['desktop', { width: 1600, height: 900 }], ['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];

async function open(pathname, vp, login) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource|net::ERR/i.test(m.text())) errors.push('console: ' + m.text()); });
	await page.evaluateOnNewDocument(SPY, login || null);
	const r = await page.goto(`http://localhost:${PORT}${pathname}`, { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
	await sleep(500);
	return { ctx, page, errors, ok: r && r.ok() };
}
const press = async (page, vp, sel) => {
	const p = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
	if (!p) return false;
	if (vp.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
	return true;
};
// a first gesture somewhere harmless unlocks audio (the kit's rule), then wait for the first sounds to be decoded
const unlock = async (page) => { await page.keyboard.down('Shift'); await page.keyboard.up('Shift'); await sleep(700); };
const starts = (page) => page.evaluate(() => window.__au.starts);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
// the kit's look on a page: body.bal-page, m6x11 loaded and used, the felt; `panel` / `btn` in their tokens
async function kitLook(page, { panel, btn, btnTok }) {
	return page.evaluate((panel, btn) => {
		const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
		const b = getComputedStyle(document.body);
		return {
			balPage: document.body.classList.contains('bal-page'),
			font: b.fontFamily, fontLoaded: document.fonts.check('20px m6x11') && [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'm6x11' && f.status === 'loaded'),
			bg: b.backgroundColor, bgImg: b.backgroundImage,
			panel: panel ? (cs(panel) ? [cs(panel).backgroundColor, cs(panel).boxShadow] : null) : ['-', '-'],
			btn: btn && cs(btn) ? [cs(btn).backgroundColor, cs(btn).fontFamily] : null,
		};
	}, panel, btn);
}
function checkLook(tag, L, btnTok) {
	A(L.balPage && /m6x11/.test(L.font) && L.fontLoaded, `${tag}: the page takes the kit (body.bal-page, the m6x11 font loaded and used)`, JSON.stringify([L.balPage, L.font, L.fontLoaded]));
	A(L.bg === rgb(TOK.bg) && /radial-gradient/.test(L.bgImg) && L.bgImg.includes(rgb(TOK['felt-1'])), `${tag}: the green felt background (--bal-bg, --bal-felt-*)`, L.bg + ' ' + L.bgImg.slice(0, 80));
	A(L.panel && (L.panel[0] === '-' || (L.panel[0] === rgb(TOK.panel) && L.panel[1].includes(rgb(TOK['panel-dd'])))), `${tag}: its panels are --bal-panel on the dark --bal-panel-dd lip`, JSON.stringify(L.panel));
	A(L.btn && L.btn[0] === rgb(TOK[btnTok]) && /m6x11/.test(L.btn[1]), `${tag}: its main button is a --bal-${btnTok} kit button in m6x11`, JSON.stringify(L.btn));
}

const PAGES = [
	{ name: 'home', path: '/', panel: '.tile:not([hidden])', btn: '.featured .cta', btnTok: 'blue', pressSel: '.tile[href="micatro/"]',
		behave: async (page, login) => {
			const r = await page.evaluate(() => ({ coll: !document.getElementById('tile-collection').hidden, todo: !document.getElementById('tile-todo').hidden, tiles: document.querySelectorAll('.tile:not([hidden])').length, nav: !!window.__focusnav }));
			return login ? (r.coll && !r.todo && r.tiles >= 10) : (!r.coll && !r.todo && r.tiles >= 10);
		}, behaveMsg: 'the tiles still show by who you are (Collection signed in only, owner tools hidden)' },
	{ name: 'login', path: '/login/', panel: '.panel', btn: '#go', btnTok: 'blue', pressSel: '#flip', guestOnly: true,
		behave: async (page) => page.evaluate(() => { const a = document.getElementById('go').textContent; document.getElementById('flip').click(); const b = document.getElementById('go').textContent; document.getElementById('flip').click(); return a === 'Log in' && b === 'Create account'; }),
		behaveMsg: 'Log in <-> Create account still flips' },
	{ name: 'profile', path: '/profile/', panel: '.stat', btn: '#logout', btnTok: 'red', pressSel: '#acct-email-save', loginOnly: true,
		behave: async (page) => waitFor(() => page.evaluate(() => document.getElementById('who').textContent === 'tester' && document.querySelectorAll('.stat').length >= 4 && document.querySelectorAll('.ach').length > 3), 6000),
		behaveMsg: 'your stats and achievements still load' },
	{ name: 'watch', path: '/watch/', panel: null, btn: '#tv-open', btnTok: 'purple', pressSel: '#tv-leave',
		behave: async (page) => waitFor(() => page.evaluate(() => !!document.querySelector('main h1')), 4000), behaveMsg: 'the hub still renders' },
];

try {
	for (const P of PAGES) {
		for (const [vpName, vp] of VPS) {
			for (const login of [null, LOGIN]) {
				if ((P.guestOnly && login) || (P.loginOnly && !login)) continue;
				const tag = `${P.name} ${vpName} ${login ? 'signed in' : 'guest'}`;
				const t = await open(P.path, vp, login);
				A(t.ok, `${tag}: served`);
				if (P.name === 'profile') await waitFor(() => t.page.evaluate(() => document.querySelectorAll('.stat').length > 0), 6000);
				await shot(t.page, `${P.name}_${vpName}${login ? '_in' : ''}`);
				checkLook(tag, await kitLook(t.page, P), P.btnTok);
				A(await P.behave(t.page, login), `${tag}: ${P.behaveMsg}`);
				const sw = await t.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.clientWidth]);
				A(sw[0] <= sw[2] + 1 && sw[1] <= vp.width + 1, `${tag}: nothing pushes the page wider than the screen (no sideways scroll)`, JSON.stringify(sw));
				// sounds: nothing before a gesture; then the main button presses with Balatro's button sound
				const s0 = await t.page.evaluate(() => ({ ...window.__au }));
				A(s0.ctx === 0 && s0.starts === 0, `${tag}: nothing plays before a user gesture`, JSON.stringify(s0));
				await unlock(t.page);
				const before = await starts(t.page);
				await press(t.page, vp, P.btn === '#logout' ? '.tb-mini' : P.btn);   // (Log out would leave: the compact bar's ⚙️ instead, then the page's own press)
				if (P.btn === '#logout') { await sleep(300); await t.page.keyboard.press('Escape'); await t.page.evaluate(() => window.__mpSwitcher && window.__mpSwitcher.close()); }
				const mid = await waitFor(async () => (await starts(t.page)) > before, 3000);
				A(mid, `${tag}: pressing ${P.btn === '#logout' ? 'a bar button' : 'the main button'} plays a sound`);
				await sleep(600);   // (let the first press settle: a slow CI runner may still be decoding)
				const b2 = await starts(t.page);
				const ok2 = await press(t.page, vp, P.pressSel);
				const heard = await waitFor(async () => (await starts(t.page)) > b2, 6000);
				A(ok2 && heard, `${tag}: pressing ${P.pressSel} plays a sound`, JSON.stringify({ ok2, b2, now: await starts(t.page), au: await t.page.evaluate(() => window.__au), hit: await t.page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h && (h.tagName + '.' + h.className); }, P.pressSel) }));
				A(!t.errors.length, `${tag}: no errors`, t.errors.join(' | '));
				await t.ctx.close();
			}
		}
	}

	// ------------------------------------------------------------------ the shared overlays
	for (const [vpName, vp] of VPS) {
		// the full bar, logged out (home)
		{
			const t = await open('/', vp, null);
			const L = await t.page.evaluate(() => { const c = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; }; return { login: c('#mp-topbar .tb-login') && [c('#mp-topbar .tb-login').backgroundColor, c('#mp-topbar .tb-login').fontFamily, c('#mp-topbar .tb-login').boxShadow], brand: c('#mp-topbar .tb-brand') && c('#mp-topbar .tb-brand').fontFamily }; });
			// the kit's sounds load a guest-local copy of site/audioswap.js on every page (through the top bar): it must not
			// take window.AudioSwap from the game's own copy (the owner's Audio Swap page and MicaSurvivor talk through it)
			if (vpName === 'desktop') {
				const g = await t.page.evaluate(async () => { const plain = await import('/site/audioswap.js'); await import('/site/audioswap.js?guest=local&probe=1'); return window.AudioSwap.setLocal === plain.setLocal; });
				A(g, 'the guest-local copy of audioswap.js the kit loads leaves window.AudioSwap to the game copy');
			}
			A(L.login && L.login[0] === rgb(TOK.blue) && /m6x11/.test(L.login[1]) && L.login[2].includes(rgb(TOK['blue-d'])) && /m6x11/.test(L.brand), `top bar ${vpName} guest: Log in is a blue kit button on its lip, the bar in m6x11`, JSON.stringify(L));
			await t.ctx.close();
		}
		// the full bar + the inbox, signed in (home)
		{
			const t = await open('/', vp, LOGIN);
			await waitFor(() => t.page.evaluate(() => !!document.getElementById('tb-bell')), 4000);
			const L = await t.page.evaluate(() => { const c = (s) => getComputedStyle(document.querySelector(s)); return { bell: [c('#tb-bell').backgroundColor, c('#tb-bell').boxShadow], chip: c('#mp-topbar .tb-chip').backgroundColor }; });
			A(L.bell[0] === rgb(TOK.grey) && L.bell[1].includes(rgb(TOK['grey-d'])) && L.chip === rgb(TOK.grey), `top bar ${vpName} signed in: the bell and the profile chip are grey kit buttons`, JSON.stringify(L));
			await unlock(t.page);
			let s = await starts(t.page);
			await press(t.page, vp, '#tb-bell');
			A(await waitFor(() => t.page.evaluate(() => document.getElementById('mp-inbox')?.classList.contains('open')), 3000), `inbox ${vpName}: the bell opens the inbox`);
			A(await waitFor(async () => (await starts(t.page)) > s, 3000), `inbox ${vpName}: the bell presses with a sound`);
			await sleep(400);
			const I = await t.page.evaluate(() => { const c = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; }; return { panel: [c('#mp-inbox').backgroundColor, c('#mp-inbox').boxShadow, c('#mp-inbox').fontFamily], on: c('#mp-inbox .ib-tab[aria-selected="true"]').backgroundColor, off: c('#mp-inbox .ib-tab[aria-selected="false"]').backgroundColor, close: c('#ib-close').backgroundColor }; });
			A(I.panel[0] === rgb(TOK.panel) && I.panel[1].includes(rgb(TOK['outline-light'])) && /m6x11/.test(I.panel[2]), `inbox ${vpName}: the kit's panel with the light outline, in m6x11`, JSON.stringify(I.panel));
			A(I.on === rgb(TOK.red) && I.off === rgb(TOK['tab-off']) && I.close === rgb(TOK.orange), `inbox ${vpName}: the chosen tab red, the others dark red, Close the orange Back`, JSON.stringify(I));
			s = await starts(t.page);
			await press(t.page, vp, '#mp-inbox .ib-tab[data-view="friends"]');
			A(await waitFor(() => t.page.evaluate(() => document.querySelector('#mp-inbox .ib-tab[data-view="friends"]').getAttribute('aria-selected') === 'true' && !!document.querySelector('#mp-inbox .row')), 3000), `inbox ${vpName}: Friends opens and lists your friends (behaviour kept)`);
			A(await waitFor(async () => (await starts(t.page)) > s, 3000), `inbox ${vpName}: a tab press sounds`);
			const R = await t.page.evaluate(() => { const c = (s) => getComputedStyle(document.querySelector(s)); return { row: c('#mp-inbox .row').backgroundColor, mini: [c('#mp-inbox button.mini').backgroundColor, c('#mp-inbox button.mini').boxShadow] }; });
			A(R.row === rgb(TOK['panel-d']) && R.mini[1].includes('0px 4px 0px'), `inbox ${vpName}: friend rows are panel rows, their buttons kit buttons on a lip`, JSON.stringify(R));
			await press(t.page, vp, '#mp-inbox .ib-tab[data-view="quests"]');
			await sleep(300);
			await shot(t.page, `inbox_${vpName}`);
			s = await starts(t.page);
			await press(t.page, vp, '#ib-close');
			A(await waitFor(() => t.page.evaluate(() => !document.getElementById('mp-inbox').classList.contains('open')), 3000) && await waitFor(async () => (await starts(t.page)) > s, 3000), `inbox ${vpName}: Close closes it, with the back sound`);
			// the Games switcher (keyboard opens it on desktop; the ⚙️ on the phone)
			s = await starts(t.page);
			if (vp.hasTouch) { await t.page.evaluate(() => window.__mpSwitcher.open()); } else await t.page.keyboard.press('Backquote');
			A(await waitFor(() => t.page.evaluate(() => !!document.getElementById('mpsw')), 2000), `switcher ${vpName}: opens`);
			A(await waitFor(async () => (await starts(t.page)) > s, 3000), `switcher ${vpName}: opening it plays its sound`);
			const W = await t.page.evaluate(() => { const c = (s) => getComputedStyle(document.querySelector(s)); return { panel: c('#mpsw .mpsw-panel').backgroundColor, here: c('#mpsw [data-entry="home"]').backgroundColor, game: c('#mpsw [data-entry="micatro"]').backgroundColor }; });
			A(W.panel === rgb(TOK.panel) && W.here === rgb(TOK.orange) && W.game === rgb(TOK.grey), `switcher ${vpName}: the kit's panel, the page you are on orange, a game grey`, JSON.stringify(W));
			await shot(t.page, `switcher_${vpName}`);
			s = await starts(t.page);
			await press(t.page, vp, '#mpsw [data-entry="close"]');
			A(await waitFor(() => t.page.evaluate(() => !document.getElementById('mpsw')), 2000) && await waitFor(async () => (await starts(t.page)) > s, 3000), `switcher ${vpName}: Close closes it, with a sound`);
			A(!t.errors.length, `top bar / inbox / switcher ${vpName}: no errors`, t.errors.join(' | '));
			await t.ctx.close();
		}
		// the compact bar (profile), the on-screen keyboard, the chat, the bets, the profile popup
		{
			const t = await open('/profile/', vp, LOGIN);
			await waitFor(() => t.page.evaluate(() => !!document.querySelector('#mp-topbar .tb-mini')), 4000);
			const C = await t.page.evaluate(() => { const c = getComputedStyle(document.querySelector('#mp-topbar .tb-mini')); return [c.backgroundColor, c.boxShadow]; });
			A(C[0] === rgb(TOK.grey) && C[1].includes(rgb(TOK['grey-d'])), `compact bar ${vpName}: the floating buttons are grey kit buttons`, JSON.stringify(C));
			await unlock(t.page);
			// on-screen keyboard
			await t.page.evaluate(() => { window.__osk = null; import('/site/osk.js').then((m) => { window.__oskP = m.askText({ title: 'Name?', maxLength: 10 }).then((v) => { window.__osk = v; }); }); });
			await waitFor(() => t.page.evaluate(() => !!document.querySelector('#osk button[data-k="Q"]')), 3000);
			const K = await t.page.evaluate(() => { const c = (s) => getComputedStyle(document.querySelector(s)); return { key: [c('#osk button[data-k="Q"]').backgroundColor, c('#osk button[data-k="Q"]').boxShadow, c('#osk button[data-k="Q"]').fontFamily], ok: c('#osk button[data-k="OK"]').backgroundColor, box: c('#osk .osk-box').backgroundColor }; });
			A(K.key[0] === rgb(TOK.grey) && K.key[1].includes(rgb(TOK['grey-d'])) && /m6x11/.test(K.key[2]) && K.ok === rgb(TOK.green) && K.box === rgb(TOK.panel), `keyboard ${vpName}: grey kit keys in m6x11, a green OK, on the kit's panel`, JSON.stringify(K));
			await shot(t.page, `osk_${vpName}`);
			let s = await starts(t.page);
			await press(t.page, vp, '#osk button[data-k="Q"]');
			A(await waitFor(async () => (await starts(t.page)) > s, 3000), `keyboard ${vpName}: a key press sounds`);
			await press(t.page, vp, '#osk button[data-k="OK"]');
			A(await waitFor(() => t.page.evaluate(() => window.__osk === 'q'), 2000), `keyboard ${vpName}: the key typed and OK answered (behaviour kept)`, await t.page.evaluate(() => window.__osk));
			// chat
			await t.page.evaluate(() => import('/battlecards/chat.js').then((m) => m.mount({ room: 'u:tester' })));
			await waitFor(() => t.page.evaluate(() => !!document.querySelector('#mp-chat .mc-min')), 3000);
			const M = await t.page.evaluate(() => { const c = getComputedStyle(document.querySelector('#mp-chat .mc-min')); return [c.backgroundColor, c.boxShadow, c.fontFamily]; });
			A(M[0] === rgb(TOK.grey) && M[1].includes(rgb(TOK['grey-d'])) && /m6x11/.test(M[2]), `chat ${vpName}: the chat pill is a grey kit button in m6x11`, JSON.stringify(M));
			s = await starts(t.page);
			await press(t.page, vp, '#mp-chat .mc-min');
			A(await waitFor(() => t.page.evaluate(() => !document.getElementById('mp-chat').classList.contains('min')), 2000), `chat ${vpName}: the pill still opens the chat`);
			A(await waitFor(async () => (await starts(t.page)) > s, 3000), `chat ${vpName}: the pill press sounds`);
			await shot(t.page, `chat_${vpName}`);
			await t.page.evaluate(() => import('/battlecards/chat.js').then((m) => m.unmount()));
			// bets
			await t.page.evaluate(() => import('/site/bets.js').then((m) => {
				const now = Date.now();
				const market = { id: 'm1', kind: 'run', game: 'micatro', pool: 15, bettors: 2, open: true, can: true, closesAt: now + 60000, now, outcomes: [{ k: 'win', label: 'Clears the run', pool: 10 }, { k: 'lose', label: 'Loses', pool: 5 }] };
				m.watch({ game: 'micatro', runner: 'pal', call: async (a) => (a === 'bet-get' ? { markets: [market] } : { stars: 100 }) });
			}));
			await waitFor(() => t.page.evaluate(() => !!document.getElementById('bets-chip') && document.getElementById('bets-chip').style.display !== 'none'), 3000);
			const B = await t.page.evaluate(() => { const c = getComputedStyle(document.getElementById('bets-chip')); return [c.backgroundColor, c.fontFamily]; });
			A((B[0] === rgb(TOK.gold) || B[0] === rgb(TOK.attn)) && /m6x11/.test(B[1]), `bets ${vpName}: the chip is a gold kit button in m6x11`, JSON.stringify(B));
			s = await starts(t.page);
			await press(t.page, vp, '#bets-chip');
			A(await waitFor(() => t.page.evaluate(() => !!document.getElementById('bets-panel')), 2000) && await waitFor(async () => (await starts(t.page)) > s, 3000), `bets ${vpName}: the chip opens the panel, with a sound`);
			const BP = await t.page.evaluate(() => { const c = (s) => getComputedStyle(document.querySelector(s)); return { panel: [c('#bets-panel').backgroundColor, c('#bets-panel').boxShadow], x: c('#bets-panel .bm-x').backgroundColor }; });
			A(BP.panel[0] === rgb(TOK.panel) && BP.panel[1].includes(rgb(TOK['outline-light'])) && BP.x === rgb(TOK.orange), `bets ${vpName}: the panel is the kit's dialog box, close the orange Back`, JSON.stringify(BP));
			s = await starts(t.page);
			await press(t.page, vp, '#bets-panel .bm-o[data-k="win"]');
			A(await waitFor(() => t.page.evaluate(() => !!document.querySelector('#bets-panel .bm-o.sel[data-k="win"]')), 2000), `bets ${vpName}: an outcome still picks`);
			A(await waitFor(async () => (await starts(t.page)) > s, 3000), `bets ${vpName}: picking an outcome sounds`);
			await shot(t.page, `bets_${vpName}`);
			await t.page.evaluate(() => import('/site/bets.js').then((m) => m.unwatch()));
			// profile popup
			await t.page.evaluate(() => import('/battlecards/profile.js').then((m) => m.openProfile('pal')));
			await waitFor(() => t.page.evaluate(() => !!document.querySelector('#mp-profile .mpp-add')), 3000);
			const PP = await t.page.evaluate(() => { const c = (s) => getComputedStyle(document.querySelector(s)); return { card: [c('#mp-profile .mpp-card').backgroundColor, c('#mp-profile .mpp-card').fontFamily], add: c('#mp-profile .mpp-add').backgroundColor, x: c('#mp-profile .mpp-x').backgroundColor }; });
			A(PP.card[0] === rgb(TOK.panel) && /m6x11/.test(PP.card[1]) && PP.add === rgb(TOK.blue) && PP.x === rgb(TOK.orange), `profile popup ${vpName}: the kit's dialog box, Add friend blue, close orange`, JSON.stringify(PP));
			await shot(t.page, `profilepopup_${vpName}`);
			s = await starts(t.page);
			await press(t.page, vp, '#mp-profile .mpp-add');
			A(await waitFor(() => t.page.evaluate(() => /Friend added/.test(document.querySelector('#mp-profile .mpp-add').textContent)), 3000), `profile popup ${vpName}: Add friend still adds`);
			A(await waitFor(async () => (await starts(t.page)) > s, 3000), `profile popup ${vpName}: Add friend presses with a sound`);
			A(!t.errors.length, `overlays ${vpName}: no errors`, t.errors.join(' | '));
			await t.ctx.close();
		}
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
