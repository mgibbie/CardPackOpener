// controllers_guest_test.mjs — a GUEST's controller works in every game, exactly
// like a signed-in player's. The owner dropped the old "controllers only work when
// signed in" rule on 2026-10-18 (Plans/CONTROLLER_SUPPORT_PLAN.md, owner decisions).
//
// A synthetic standard-mapping pad rides in window.__owFakePads through the real
// site/gamepad.js poller (headless Chrome has no controllers); nothing is signed in:
//   - the overworld: the stick walks the player and Start opens the start menu.
//     (The overworld itself bounces a browser with no token at all to /login, so its
//     only reachable guest state is a token whose account never loads.)
//   - Micatro (no token): the pad shows the reticle and opens New Run from the menu.
//   - Battlecards' deck builder (no token): padnav moves the focus ring.
//   - PokéChess (no token): the View button leaves back to the overworld.
// MicaSurvivor's own gate is handled in its own PR and is not covered here.
//
//   node overworld/tests/controllers_guest_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
// run from a git worktree, the gitignored overworld/data is read from the main checkout
const MAIN_ROOT = path.basename(path.dirname(ROOT)) === '.worktrees' ? path.resolve(ROOT, '../..') : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9161;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		// no account behind any token: everyone here is signed out
		return res.end(JSON.stringify({ ok: true, state: null, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], decks: [], ow: null }));
	}
	const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
	const send = (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
		res.end(d);
	};
	fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

// Standard mapping by POSITION; Nintendo layout: RIGHT face = confirm, BOTTOM = cancel.
const BTN = { bottom: 0, right: 1, left: 2, top: 3, select: 8, start: 9, up: 12, down: 13, leftD: 14, rightD: 15 };
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, heldItem: 'leftovers', sprite: 's131.png', num: 131,
	moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'icebeam', name: 'Ice Beam', pp: 10, maxPp: 10 }] };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	// a fresh signed-out browser with one fake pad; `overworldToken` seeds the overworld's
	// account-less token (see the header), nothing else is ever signed in
	const open = async (url, { overworldToken = false, seed = null, viewport = { width: 1280, height: 720 } } = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(viewport);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((owTok, seedJson) => {
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard',
				buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			try {
				localStorage.removeItem('magepunk_mp_state_v1');
				if (owTok) localStorage.setItem('magepunk_mp_token_v1', 'guest-nouser-token');
				else localStorage.removeItem('magepunk_mp_token_v1');
				for (const [k, v] of Object.entries(JSON.parse(seedJson || '{}'))) localStorage.setItem(k, v);
			} catch { }
		}, overworldToken, seed ? JSON.stringify(seed) : null);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const hold = (b, on) => page.evaluate((b, on) => { window.__pad.buttons[b] = { pressed: on, value: on ? 1 : 0 }; }, b, on);
		const tap = async b => { await hold(b, true); await sleep(80); await hold(b, false); await sleep(140); };
		const stick = (x, y) => page.evaluate((x, y) => { window.__pad.axes[0] = x; window.__pad.axes[1] = y; }, x, y);
		return { ctx, page, errors, hold, tap, stick };
	};

	// ===== the overworld =====
	{
		const t = await open('/overworld/index.html?map=PalletTown&x=10&y=12', { overworldToken: true, seed: {
			magepunk_region: 'KANTO',
			magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
			magepunk_party_v1: JSON.stringify([LEAD]),
			magepunk_repel_v1: '99999',
		} });
		await waitFor(() => t.page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)), 40000);
		await sleep(1500);
		const st = () => t.page.evaluate(() => ({ x: window.__ow.player.tx, start: !!window.__ow.startMenu.open, hud: document.getElementById('hud')?.textContent || '' }));
		A(await t.page.evaluate(() => !!window.__ow.gamepad && window.__ow.gamepad.connected()), 'overworld (guest): the controller layer runs and sees the pad');
		const s0 = await st();
		await t.stick(1, 0); await sleep(700); await t.stick(0, 0); await sleep(500);
		const s1 = await st();
		A(s1.x > s0.x, 'overworld (guest): the stick walks the player', `${s0.x} -> ${s1.x}`);
		await t.tap(BTN.start); await sleep(250);
		const s2 = await st();
		A(s2.start && !/sign in to play with a controller/i.test(s2.hud), 'overworld (guest): Start opens the start menu, and nothing says to sign in', JSON.stringify(s2));
		await t.ctx.close();
	}

	// ===== Micatro =====
	{
		const t = await open('/micatro/', { viewport: { width: 1600, height: 900 }, seed: { micatro_speed: '4', micatro_sfx: '0', micatro_music: '0' } });
		await waitFor(() => t.page.evaluate(() => !!(window.__micatro && window.__micatro.ready && window.__micatroPad)), 30000);
		await sleep(400);
		await t.tap(BTN.rightD);   // the first press only shows the reticle
		A(await t.page.evaluate(() => document.querySelector('.pad-reticle')?.style.display !== 'none'), 'Micatro (guest): the first press shows the focus reticle');
		const f0 = await t.page.evaluate(() => { const f = window.__micatroPad.focus; return f ? String(f.cls || f.card) : null; });
		await t.tap(BTN.right);   // confirm (the RIGHT face) on the menu's Play button
		const opened = await waitFor(() => t.page.evaluate(() => !!document.querySelector('.new-run')), 3000);
		const st = await t.page.evaluate(() => ({ toast: document.querySelector('.toast')?.textContent || '', hints: document.getElementById('pad-hints')?.textContent || '' }));
		A(opened, 'Micatro (guest): confirm on the menu opens the New Run screen', JSON.stringify({ focus: f0 }));
		A(!/log in to use a controller/i.test(st.toast + st.hints), 'Micatro (guest): nothing says "Log in to use a controller"', JSON.stringify(st));
		await t.ctx.close();
	}

	// ===== Battlecards (padnav on the deck builder) =====
	{
		const t = await open('/battlecards/deck.html');
		await sleep(3000);
		A(await t.page.evaluate(() => !!window.__padnav), 'Battlecards (guest): the controller navigator runs');
		const focus = () => t.page.evaluate(() => { const f = window.__padnav?.focused; return f ? { tag: f.tagName, id: f.id, text: (f.textContent || '').trim().slice(0, 30), ring: f.classList.contains('padnav-focus') } : null; });
		await t.tap(BTN.down);
		const f0 = await focus();
		await t.tap(BTN.down); await t.tap(BTN.rightD);
		const f1 = await focus();
		A(!!f0 && !!f1 && f1.ring && JSON.stringify(f0) !== JSON.stringify(f1), 'Battlecards (guest): the d-pad moves the focus ring', JSON.stringify({ f0, f1 }));
		await t.ctx.close();
	}

	// ===== PokéChess =====
	{
		const t = await open('/overworld/pokechess.html');
		await sleep(2500);
		await t.hold(BTN.select, true);   // View = leave, back to the overworld
		await sleep(1500);
		A(!/pokechess/.test(t.page.url()), 'PokéChess (guest): View leaves back to the overworld', t.page.url());
		await t.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
