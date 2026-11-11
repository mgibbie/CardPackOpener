// switcher_games_lib.mjs — shared driver for the switcher_games_*_test.mjs suites
// (controls sweep B2): from EVERY game page, keyboard-only and a fake controller
// open the Games switcher, reach Home and launch another game; a phone also opens
// it with a tap on the page's ⚙️. One suite per viewport (desktop, phone portrait,
// phone landscape) so the gate's shards run them side by side.
//
// Not a suite itself (no _test suffix): the three suites import runViewport().
import fs from 'fs';
import path from 'path';
import http from 'http';
import os from 'os';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN_ROOT = path.basename(path.dirname(ROOT)) === '.worktrees' ? path.resolve(ROOT, '../..') : null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
	'.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.gif': 'image/gif' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

export const VIEWPORTS = {
	desktop: { width: 1280, height: 720 },
	portrait: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
	landscape: { width: 844, height: 390, isMobile: true, hasTouch: true, isLandscape: true, deviceScaleFactor: 1 },
};
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, heldItem: 'leftovers', sprite: 's131.png', num: 131,
	moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'icebeam', name: 'Ice Beam', pp: 10, maxPp: 10 }] };
const OW_SEED = { magepunk_mp_token_v1: 'guest-nouser-token', magepunk_region: 'KANTO',
	magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
	magepunk_party_v1: JSON.stringify([LEAD]), magepunk_repel_v1: '99999' };

// every game page: where it lives, when it has booted, and its ⚙️ for a tap
export const PAGES = [
	{ id: 'home', url: '/', ready: () => true },
	{ id: 'overworld', url: '/overworld/index.html?map=PalletTown&x=10&y=12', seed: OW_SEED, ready: () => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data), settle: 1200 },
	{ id: 'factory', url: '/overworld/index.html?factory=1', seed: { magepunk_mp_token_v1: 'guest-nouser-token' }, ready: () => !!(window.__ow?.world?.current?.layout), settle: 1500 },
	{ id: 'pokechess', url: '/overworld/pokechess.html', ready: () => !!document.querySelector('canvas'), settle: 600 },
	{ id: 'battlecards', url: '/battlecards/start.html', seed: { mp_onboarded_v1: '1' }, ready: () => true, settle: 600 },   // (the first-visit tour dismissed)
	{ id: 'micatro', url: '/micatro/', seed: { micatro_speed: '4', micatro_sfx: '0', micatro_music: '0' }, ready: () => !!(window.__micatro && window.__micatro.ready), settle: 400 },
	{ id: 'micasurvivor', url: '/micasurvivor/', ready: () => document.getElementById('boot')?.classList.contains('hidden'), settle: 600 },
	{ id: 'pairofpears', url: '/pairofpears/', ready: () => true, settle: 600 },
	{ id: 'scoundrel', url: '/scoundrel/', ready: () => true, settle: 600 },
];
const HREF = { home: '/', battlecards: '/battlecards/start.html', overworld: '/overworld/' };

// Standard mapping by POSITION; Nintendo layout: RIGHT face = confirm, BOTTOM = cancel.
const BTN = { bottom: 0, right: 1, select: 8, start: 9, up: 12, down: 13, left: 14, rightD: 15 };

export async function runViewport(vpName, { shots } = {}) {
	const vp = VIEWPORTS[vpName];
	let pass = 0, fail = 0;
	const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
	const SHOTS = shots || process.env.SHOTS || os.tmpdir();

	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			return res.end(JSON.stringify({ ok: true, state: null, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], decks: [], ow: null }));
		}
		if (u.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
		const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
		const send = (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		};
		fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
	});
	await new Promise(r => server.listen(0, r));
	const PORT = server.address().port;
	const puppeteer = (await import('puppeteer-core')).default;
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

	const open = async spec => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(seedJson => {
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard',
				buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			try { for (const [k, v] of Object.entries(JSON.parse(seedJson || '{}'))) localStorage.setItem(k, v); } catch { }
		}, JSON.stringify(spec.seed || {}));
		const t = { ctx, page, errors };
		t.goto = async url => {
			await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		};
		t.boot = async s => {
			const ok = await waitFor(() => page.evaluate(s.ready), 45000) && await waitFor(() => page.evaluate(() => !!window.__mpSwitcher), 15000);
			await sleep(s.settle || 300);
			return ok;
		};
		// (a press that launches a game navigates mid-tap: its release then has no page to land on, and
		// the old page's context is gone — CI 2026-11-10, "Execution context was destroyed" after
		// "pad: back on Home" in all three viewports. The new page starts with every button up.)
		t.hold = (b, on) => page.evaluate((b, on) => { window.__pad.buttons[b] = { pressed: on, value: on ? 1 : 0 }; }, b, on).catch(e => { if (!/context was destroyed|navigation|Target closed/i.test(e.message)) throw e; });
		t.tap = async b => { await t.hold(b, true); await sleep(80); await t.hold(b, false); await sleep(130); };
		t.combo = async () => { await t.hold(BTN.start, true); await sleep(60); await t.hold(BTN.select, true); await sleep(140); await t.hold(BTN.start, false); await t.hold(BTN.select, false); await sleep(160); };
		t.press = async k => { await page.keyboard.press(k); await sleep(70); };
		t.isOpen = () => page.evaluate(() => !!document.getElementById('mpsw'));
		t.focused = () => page.evaluate(() => window.__mpSwitcher?.nav?.focused?.dataset.entry || null);
		t.path = () => { const u = new URL(page.url()); return u.pathname + u.search; };
		// pick the focused entry; a "Leave?" question (a game that warns) is answered Leave
		t.pickAndGo = async (confirmKey, rightKey) => {
			const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
			await confirmKey();
			await sleep(250);
			if (await page.evaluate(() => !!document.querySelector('#mpsw .mpsw-confirm')).catch(() => false)) { await rightKey(); await confirmKey(); }
			await nav;
			await sleep(200);
		};
		return t;
	};

	try {
		for (const spec of PAGES) {
			const tag = `[${vpName}] ${spec.id}:`;
			// ---------- keyboard only (and touch on a phone) ----------
			{
				const t = await open(spec);
				await t.goto(spec.url);
				A(await t.boot(spec), `${tag} boots with the switcher loaded`, t.errors.slice(0, 3).join(' | '));
				const before = t.path();
				if (spec.id === 'scoundrel') A(await t.page.evaluate(() => !document.querySelector('a[href*="/scoundrel/classic"], a[href^="classic/"]')), `${tag} Scoundrel classic (legacy) is not linked`);
				A(await t.page.evaluate(() => !window.__mpSwitcher.ENTRIES.some(e => /classic/.test(e.href))), `${tag} the switcher doesn't list Scoundrel classic`);
				if (vp.hasTouch) {
					// the page's ⚙️ (the top bar's, or the game's own [data-mp-switcher] button)
					const cog = await t.page.evaluate(() => {
						const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
						// (a ⚙️ below the fold — PokéChess's bar on a landscape phone — is one scroll away)
						const first = document.querySelector('[data-mp-switcher]');
						if (first && !vis(first)) first.scrollIntoView({ block: 'center' });
						const all = [...document.querySelectorAll('[data-mp-switcher]')].filter(vis);
						const top = all.find(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit && (hit === el || el.contains(hit)); });
						if (!top) return null;
						const r = top.getBoundingClientRect();
						return [r.x + r.width / 2, r.y + r.height / 2];
					});
					A(!!cog, `${tag} a ⚙️ is on screen and tappable`);
					if (cog) {
						await t.page.touchscreen.tap(cog[0], cog[1]); await sleep(250);
						A(await t.isOpen(), `${tag} tapping ⚙️ opens the switcher (not a jump home)`);
						A(t.path() === before, `${tag} ...and stays on the page`, t.path());
						await t.page.screenshot({ path: path.join(SHOTS, `switcher_${vpName}_${spec.id}.png`) }).catch(() => {});
						const x = await t.page.evaluate(() => { const r = document.querySelector('#mpsw [data-entry="close"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
						await t.page.touchscreen.tap(x[0], x[1]); await sleep(200);
						A(!(await t.isOpen()), `${tag} tapping ✕ closes it`);
					}
				}
				// hold Esc opens; the page is untouched
				await t.page.keyboard.down('Escape'); await sleep(850); await t.page.keyboard.up('Escape'); await sleep(100);
				A(await t.isOpen(), `${tag} holding Esc opens the switcher`);
				await t.press('Escape');
				A(!(await t.isOpen()) && t.path() === before, `${tag} Esc closes it, still on the page`, t.path());
				// ` -> Home (from Home: D to Battlecards) -> Z
				await t.press('Backquote');
				A(await t.isOpen() && await t.focused() === 'home', `${tag} \` opens it, focus on Home`);
				if (!vp.hasTouch) await t.page.screenshot({ path: path.join(SHOTS, `switcher_${vpName}_${spec.id}.png`) }).catch(() => {});
				const target = spec.id === 'home' ? 'battlecards' : 'home';
				if (target !== 'home') { await t.press('KeyD'); A(await t.focused() === target, `${tag} D moves to ${target}`, await t.focused()); }
				await t.pickAndGo(() => t.press('KeyZ'), () => t.press('KeyD'));
				A(new URL(t.page.url()).pathname === HREF[target], `${tag} keyboard only: Z goes to ${target}`, t.page.url());
				await t.ctx.close();
			}
			// ---------- the controller only ----------
			{
				const t = await open(spec);
				await t.goto(spec.url);
				await t.boot(spec);
				await t.combo();
				A(await t.isOpen() && await t.focused() === 'home', `${tag} pad: Start + Select open it, focus on Home`);
				await t.tap(BTN.rightD);
				const moved = await t.focused();
				A(moved && moved !== 'home', `${tag} pad: the d-pad moves`, moved);
				let target = 'home';
				if (spec.id === 'home') target = moved;   // from Home: launch the game we moved to
				else { await t.tap(BTN.left); A(await t.focused() === 'home', `${tag} pad: back on Home`); }
				const want = (await t.page.evaluate(id => (window.__mpSwitcher.ENTRIES.find(e => e.id === id) || {}).href, target)) || '/';
				await t.pickAndGo(() => t.tap(BTN.right), () => t.tap(BTN.rightD));
				const got = new URL(t.page.url());
				A(got.pathname + (want.includes('?') ? got.search : '') === want, `${tag} pad: A goes to ${target}`, t.page.url());
				A(t.errors.filter(e => !/WebGL|AudioContext|play\(\)|NotAllowedError/i.test(e)).length === 0, `${tag} no page errors`, t.errors.slice(0, 3).join(' | '));
				await t.ctx.close();
			}
		}
	} finally {
		await browser.close();
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	return fail;
}
