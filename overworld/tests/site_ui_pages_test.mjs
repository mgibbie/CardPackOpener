// site_ui_pages_test.mjs — the Balatro look on the rest of the site's own pages (owner, 2026-11-19: "redo every UI ...
// into the balatro style ... include button press type sound effects"), in a real browser, desktop (1600x900) + phone
// (390x844): Inventory, Collection, Monsters, Magepunk News, Report a Bug, and the owner tools (Design To-Do, Bug Report
// Review, Fakemon, Audio Swap, usage stats, the error log). Each page:
//   - loads with no errors and nothing pushes it wider than a phone's screen;
//   - takes the kit (site/ui/balatro.css): body.bal-page, the m6x11 font loaded and used, the felt background, its
//     main button a kit button (one of the kit's colours, on its darker lip, in m6x11);
//   - presses with Balatro's button sound (spied at AudioBufferSourceNode.start) and nothing plays before a gesture;
//   - keeps its behaviour (each page's check below: what it shows, the button still does its job).
// The server is a stub (/api/mp answers the few actions these pages ask). SHOTS=<dir> writes a PNG of every page.
//   node overworld/tests/site_ui_pages_test.mjs
// Covers inventory/, collection/, monsters/, magepunknews/, bugs/, todo/, bugreview/, fakemon/, audioswap/, stats.html,
// errors.html.
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
const NOW = Date.now();
const stateOf = (u) => ({ username: u, friendCode: 'ABCD1234', collection: {}, dust: 120, decks: [], packs: 1, created: NOW - 86400000 * 40 });
let who = 'tester';
const API = {
	state: () => ({ state: stateOf(who) }),
	friends: () => ({ friends: [{ username: 'pal', online: true }] }),
	challenges: () => ({ challenges: [] }),
	'chat-get': () => ({ messages: [] }),
	quests: () => ({ quests: [] }),
	'trade-lobby': () => ({ asks: [], friends: [{ username: 'pal', online: true }] }),
	'bug-list': () => ({ bugs: [{ ts: NOW - 60000, user: 'tester', title: 'A door does not open', severity: 'bug', area: 'overworld', text: 'Walked into the door.' }] }),
	'owner-todo-get': () => ({ notes: [{ ts: NOW - 60000, cardId: 'c1', cardName: 'Fire Imp', text: '+1 attack' }] }),
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

const KIT = (() => { try { return fs.readFileSync(path.join(ROOT, 'site/ui/balatro.css'), 'utf8'); } catch { return ''; } })();
const TOK = {}; for (const m of KIT.matchAll(/--bal-([a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)) TOK[m[1]] = m[2].toLowerCase();
const rgb = (hex) => { if (!hex) return 'rgb(?)'; const h = hex.slice(1); const n = (i) => parseInt(h.slice(i, i + 2), 16); return `rgb(${n(0)}, ${n(2)}, ${n(4)})`; };
A(TOK.blue === '#009dff' && TOK.panel === '#3a4b4f', 'the kit (site/ui/balatro.css) is there, with its tokens');
const BUTTON_COLOURS = ['grey', 'blue', 'red', 'green', 'orange', 'purple', 'gold', 'tab-off'];

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
		if (login) { localStorage.setItem('magepunk_mp_token_v1', login + '.9999999999.' + 'a'.repeat(64)); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: login })); }
	} catch { /* none */ }
	addEventListener('click', (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (a && !a.hasAttribute('data-mp-switcher')) e.preventDefault(); });
	// (a page's own confirm() / prompt(): answer no, never block)
	window.confirm = () => false; window.prompt = () => null;
};
const VPS = [['desktop', { width: 1600, height: 900 }], ['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];

// login: who is signed in (null = a guest); ready: what shows once the page has drawn; btn: its main button;
// behave: its behaviour still holds (after `btn` was pressed)
const PAGES = [
	{ name: 'inventory', path: '/inventory/', login: 'tester', ready: '#open-trade', btn: '#open-trade',
		behave: (p) => waitFor(() => p.evaluate(() => !!document.querySelector('#trade:not([hidden]) .tw')), 4000), behaveMsg: 'Trade with a friend still opens the trade window' },
	{ name: 'collection', path: '/collection/', login: 'tester', ready: '#dust-row:not([hidden])', btn: null, chip: '.dust-chip',
		behave: (p) => waitFor(() => p.evaluate(() => document.getElementById('dust-amt').textContent === '120' && document.getElementById('who').textContent === 'tester'), 6000), behaveMsg: 'your dust and name still show' },
	{ name: 'monsters', path: '/monsters/', login: null, ready: 'a.back', btn: 'a.back',
		behave: (p) => p.evaluate(() => !!document.querySelector('#content')), behaveMsg: 'the page still renders' },
	{ name: 'news', path: '/magepunknews/', login: null, ready: '.cta.primary', btn: '.filters button[data-f="patch"]',
		behave: (p) => waitFor(() => p.evaluate(() => document.querySelector('.filters button[data-f="patch"]').classList.contains('on')), 3000), behaveMsg: 'a filter still picks (it turns on)' },
	{ name: 'bugs', path: '/bugs/', login: 'tester', ready: '#send', btn: '#send',
		behave: (p) => p.evaluate(() => !!document.getElementById('title') && !!document.getElementById('area')), behaveMsg: 'the report form is still there' },
	{ name: 'todo', path: '/todo/', login: 'mgibbie', ready: '#refresh', btn: '#refresh',
		behave: (p) => p.evaluate(() => !!document.getElementById('composer')), behaveMsg: 'the owner sees the to-do list and its composer' },
	{ name: 'bugreview', path: '/bugreview/', login: 'mgibbie', ready: '#refresh', btn: '#refresh',
		behave: (p) => p.evaluate(() => !!document.getElementById('list')), behaveMsg: 'the owner sees the review list' },
	{ name: 'fakemon', path: '/fakemon/', login: 'mgibbie', ready: '#list .item', btn: '#revert', pressSel: '#list .item:nth-child(2)',
		behave: (p) => waitFor(() => p.evaluate(() => document.querySelector('#list .item:nth-child(2)').classList.contains('on')), 3000), behaveMsg: 'picking a fakemon still selects it' },
	{ name: 'audioswap', path: '/audioswap/', login: 'mgibbie', ready: '#tabs button', btn: '#tabs button.on', pressSel: '#tabs button:not(.on)',
		behave: (p) => p.evaluate(() => !!document.getElementById('save') && !!document.getElementById('tabs')), behaveMsg: 'the owner sees the Audio Swap tool' },
	{ name: 'stats', path: '/stats.html', login: 'mgibbie', ready: '#refresh', btn: '#refresh',
		behave: (p) => p.evaluate(() => !!document.getElementById('days')), behaveMsg: 'the usage page still has its window picker' },
	{ name: 'errors', path: '/errors.html', login: 'mgibbie', ready: '#refresh', btn: '#refresh',
		behave: (p) => p.evaluate(() => !!document.getElementById('days')), behaveMsg: 'the error log still has its window picker' },
];

const press = async (page, vp, sel) => {
	const p = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
	if (!p) return false;
	if (vp.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
	return true;
};
const starts = (page) => page.evaluate(() => window.__au.starts);

try {
	for (const P of PAGES) {
		for (const [vpName, vp] of VPS) {
			const tag = `${P.name} ${vpName}`;
			who = P.login || 'tester';
			const ctx = await browser.createBrowserContext();
			const page = await ctx.newPage();
			await page.setViewport(vp);
			const errors = [];
			page.on('pageerror', (e) => errors.push(e.message));
			page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource|net::ERR/i.test(m.text())) errors.push('console: ' + m.text()); });
			await page.evaluateOnNewDocument(SPY, P.login);
			const r = await page.goto(`http://localhost:${PORT}${P.path}`, { waitUntil: 'load' });
			A(r && r.ok(), `${tag}: served`);
			A(await waitFor(() => page.evaluate((s) => !!document.querySelector(s), P.ready), 8000), `${tag}: draws (${P.ready})`);
			await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
			await sleep(400);
			if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${P.name}_${vpName}.png`) });
			const L = await page.evaluate((sel) => {
				const b = getComputedStyle(document.body), e = sel && document.querySelector(sel), c = e ? getComputedStyle(e) : null;
				return { balPage: document.body.classList.contains('bal-page'), font: b.fontFamily, fontLoaded: document.fonts.check('20px m6x11') && [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'm6x11' && f.status === 'loaded'),
					bg: b.backgroundColor, bgImg: b.backgroundImage, btn: c ? [c.backgroundColor, c.boxShadow, c.fontFamily] : null,
					sw: [document.documentElement.scrollWidth, document.documentElement.clientWidth] };
			}, P.btn || P.chip);
			A(L.balPage && /m6x11/.test(L.font) && L.fontLoaded, `${tag}: takes the kit (body.bal-page, the m6x11 font loaded and used)`, JSON.stringify([L.balPage, L.font, L.fontLoaded]));
			A(L.bg === rgb(TOK.bg) && /radial-gradient/.test(L.bgImg) && L.bgImg.includes(rgb(TOK['felt-1'])), `${tag}: the green felt background`, L.bg + ' ' + L.bgImg.slice(0, 60));
			if (P.btn) {
				const tokOk = L.btn && BUTTON_COLOURS.some((k) => L.btn[0] === rgb(TOK[k]) && L.btn[1].includes(rgb(TOK[k === 'tab-off' ? 'tab-off-d' : k + '-d'])));
				A(tokOk && /m6x11/.test(L.btn[2]), `${tag}: its main button (${P.btn}) is a kit button (a kit colour on its darker lip, m6x11)`, JSON.stringify(L.btn));
			} else A(L.btn && L.btn[0] === rgb(TOK.panel) && /m6x11/.test(L.btn[2]), `${tag}: its ${P.chip} is a kit panel in m6x11`, JSON.stringify(L.btn));
			if (vp.hasTouch) A(L.sw[0] <= L.sw[1] + 1, `${tag}: nothing pushes the page wider than the screen`, JSON.stringify(L.sw));
			const s0 = await page.evaluate(() => ({ ...window.__au }));
			A(s0.ctx === 0 && s0.starts === 0, `${tag}: nothing plays before a user gesture`, JSON.stringify(s0));
			await page.keyboard.down('Shift'); await page.keyboard.up('Shift'); await sleep(700);
			const before = await starts(page);
			const ps = P.pressSel || P.btn || 'a[href]';
			await press(page, vp, ps);
			A(await waitFor(async () => (await starts(page)) > before, 3000), `${tag}: pressing ${ps} plays Balatro's button sound`);
			A(await P.behave(page), `${tag}: ${P.behaveMsg}`);
			A(!errors.length, `${tag}: no errors`, errors.join(' | '));
			await ctx.close();
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
