// ow_controls_lib.mjs — the shared harness for the overworld controls suites
// (controls sweep B6): a static server (with /api/mp stubbed and, from a git
// worktree, the gitignored overworld/data read from the main checkout), a Chrome,
// and open() that boots the overworld at Pallet Town with a seeded save.
//   ow_keyboard_scheme_test.mjs   keyboard only
//   ow_touch_controls_test.mjs    touch, portrait and landscape
//   (the controller side is ow_gamepad_test.mjs)
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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
// onApi(body) may answer an /api/mp action itself (return an object), else the stub answers
export async function startServer({ onApi } = {}) {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
			const mine = onApi && onApi(body);
			if (mine) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(mine)); }
			res.writeHead(200, { 'content-type': 'application/json' });
			return res.end(JSON.stringify({ ok: true, state: null, friends: [], challenges: [], trades: [], match: null, presence: null, gifts: [], messages: [], rows: [], decks: [], ow: null }));
		}
		// leaving for another game: an empty page (the suites only check what was saved first)
		if ((/^\/(battlecards|micatro|micasurvivor|pairofpears)\//.test(u) && /(\/|\.html)$/.test(u)) || u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>away</title>'); }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		const send = (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
		fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
	});
	await new Promise(r => server.listen(0, r));
	return { server, port: server.address().port };
}

export async function launch() {
	const puppeteer = (await import('puppeteer-core')).default;
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
		'/opt/chrome/chrome',
	].find(p => fs.existsSync(p));
	return puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
}

export const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, heldItem: 'leftovers', sprite: 's131.png', num: 131,
	moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'icebeam', name: 'Ice Beam', pp: 10, maxPp: 10 }, { id: 'bodyslam', name: 'Body Slam', pp: 15, maxPp: 15 }] };

// boot the overworld (guest: a token whose account never loads), Pallet Town
export async function openOverworld(browser, port, { viewport = { width: 1280, height: 720 }, touch = false, pad = false, url = '/overworld/index.html?map=PalletTown&x=10&y=12' } = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ ...viewport, ...(touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((lead, pad) => {
		if (pad) {
			const p = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard',
				buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [p]; window.__pad = p;
		}
		if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'nouser-token');
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, LEAD, pad);
	await page.goto(`http://localhost:${port}${url}`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data && window.__mpSwitcher)), 45000);
	await sleep(1200);
	// close whatever greets a fresh save (a dialog) without touching the game's state
	for (let i = 0; i < 10 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.evaluate(() => window.__ow.dialog.key('x')); await sleep(80); }
	const st = () => page.evaluate(() => {
		const W = window.__ow, g = W.gateReport();
		return { x: W.player.tx, y: W.player.ty, map: W.world.current.name, start: W.startMenu.open, startIdx: W.startMenu.idx, bag: W.bagMenu.open, party: W.partyMenu.open,
			held: g.heldKeys, run: g.runHeld, blocked: g.menuBlocking, biking: !!W.player.biking, dialog: W.dialog.blocking, switcher: !!window.__mpSwitcher?.isOpen() };
	});
	return { ctx, page, errors, st };
}

// a canvas-pixel point -> the page's client coordinates (the canvas is CSS-scaled)
export function canvasToClient(page, x, y) {
	return page.evaluate((x, y) => {
		const c = document.getElementById('screen'), r = c.getBoundingClientRect();
		return { x: r.left + x * r.width / c.width, y: r.top + y * r.height / c.height };
	}, x, y);
}
