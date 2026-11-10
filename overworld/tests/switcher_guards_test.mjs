// switcher_guards_test.mjs — what leaving through the Games switcher costs, per game
// (window.mpLeaveGuard, controls sweep B2):
//   - overworld: walking is safe and saves the position first (savePos); a cutscene
//     BLOCKS the switcher (it won't open, a toast says why)
//   - Battlecards: a quick match isn't saved -> "Leave?" first; Stay keeps you in it
//   - MicaSurvivor: a run can't be saved -> "Leave?" with "run will be lost"; the
//     switcher opening pauses the run; leaving ends it the way "Quit run" does
// (Micatro Multiplayer's forfeit guard is checked in micatro_pvp_e2e_test.mjs, which
// has the real two-player server.)
//
//   node overworld/tests/switcher_guards_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN_ROOT = path.basename(path.dirname(ROOT)) === '.worktrees' ? path.resolve(ROOT, '../..') : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const puppeteer = (await import('puppeteer-core')).default;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, state: null, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], decks: [], ow: null })); }
	const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
	const send = (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, heldItem: 'leftovers', sprite: 's131.png', num: 131,
	moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'icebeam', name: 'Ice Beam', pp: 10, maxPp: 10 }] };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (url, seed = {}, viewport = { width: 1280, height: 720 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(viewport);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(seedJson => {
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			try { for (const [k, v] of Object.entries(JSON.parse(seedJson))) localStorage.setItem(k, v); } catch { }
		}, JSON.stringify(seed));
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const press = async k => { await page.keyboard.press(k); await sleep(80); };
		const isOpen = () => page.evaluate(() => !!document.getElementById('mpsw'));
		return { ctx, page, errors, press, isOpen };
	};

	// ===== the overworld =====
	{
		const t = await open('/overworld/index.html?map=PalletTown&x=10&y=12', {
			magepunk_mp_token_v1: 'guest-nouser-token', magepunk_region: 'KANTO',
			magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
			magepunk_party_v1: JSON.stringify([LEAD]), magepunk_repel_v1: '99999',
		});
		A(await waitFor(() => t.page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data && window.mpLeaveGuard && window.__mpSwitcher)), 45000), 'overworld boots with its leave guard and the switcher');
		await sleep(1200);
		A(await t.page.evaluate(() => window.mpLeaveGuard().state === 'safe'), 'walking around: leaving is safe');
		// walk a few steps (no map change: savePos would not run on its own)
		await t.page.keyboard.down('ArrowRight'); await sleep(900); await t.page.keyboard.up('ArrowRight'); await sleep(500);
		const here = await t.page.evaluate(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty }));
		await t.page.evaluate(() => localStorage.removeItem('magepunk_pos_v1'));
		await t.page.evaluate(() => window.mpLeaveGuard().beforeLeave());
		const saved = await t.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null'));
		A(saved && saved.map === 'PalletTown' && saved.x === here.x && saved.y === here.y, 'leaving saves the position first (map, x, y)', JSON.stringify({ saved, here }));
		// a cutscene: the switcher refuses to open
		await t.page.evaluate(() => { window.__ow.freezeLoop(true); window.__ow.cutscene.cur = { frames: [], program: {}, ctx: {} }; });
		A(await t.page.evaluate(() => window.mpLeaveGuard().state === 'block'), 'a cutscene: the guard says block');
		await t.press('Backquote');
		A(!(await t.isOpen()), '...and ` does not open the switcher');
		A(await t.page.evaluate(() => /cutscene/i.test(document.getElementById('mpsw-toast')?.textContent || '')), '...a toast says why');
		await t.page.evaluate(() => { window.__ow.cutscene.cur = null; window.__ow.freezeLoop(false); });
		await t.press('Backquote');
		A(await t.isOpen(), 'the cutscene over: ` opens it');
		await t.press('KeyX');
		A(t.errors.length === 0, 'overworld: no page errors', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ===== Battlecards: a quick match =====
	{
		// (a signed-in player: the match page wants an account)
		const t = await open('/battlecards/index.html?players=2', { magepunk_mp_token_v1: 'guard-token', magepunk_mp_state_v1: JSON.stringify({ username: 'guard', friendCode: 'GUARD0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }) });
		A(await waitFor(() => t.page.evaluate(() => !!(window.__game && window.__game.state && window.__mpSwitcher)), 45000), 'Battlecards quick match boots');
		await sleep(1500);
		const g = await t.page.evaluate(() => window.mpLeaveGuard());
		A(g.state === 'confirm' && /isn.t saved/.test(g.message), 'a quick match: leaving asks first ("this match isn\'t saved")', JSON.stringify(g));
		await t.press('Backquote');
		await t.press('KeyZ');   // Home
		A(await t.page.evaluate(() => /isn.t saved/.test(document.querySelector('#mpsw .mpsw-confirm')?.textContent || '')), 'picking Home shows the question');
		await t.press('KeyZ');   // Stay
		await t.press('KeyX');
		A(!(await t.isOpen()) && new URL(t.page.url()).pathname === '/battlecards/index.html', 'Stay, then X: still in the match');
		await t.page.evaluate(() => { window.__game.state.over = true; });
		A(await t.page.evaluate(() => window.mpLeaveGuard().state === 'safe'), 'a finished match: leaving is safe');
		await t.ctx.close();
	}

	// ===== MicaSurvivor: a run =====
	{
		const t = await open('/micasurvivor/', {}, { width: 1280, height: 720, deviceScaleFactor: 1 });
		const visible = id => t.page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		A(await waitFor(() => t.page.evaluate(() => document.getElementById('boot').classList.contains('hidden') && !!window.__mpSwitcher), 30000), 'MicaSurvivor boots with the switcher');
		if (await visible('tap-start')) await t.page.click('#tap-start');
		await waitFor(() => visible('scr-login'), 10000);
		A(await t.page.evaluate(() => window.mpLeaveGuard().state === 'safe'), 'menus: leaving is safe');
		await t.page.click('#btn-guest');
		await waitFor(() => visible('scr-test'), 8000);
		for (let i = 0; i < 40 && await visible('scr-test'); i++) { await t.page.evaluate(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(120); }
		await waitFor(() => visible('scr-result'), 8000);
		await t.page.click('#res-ok');
		await waitFor(() => visible('scr-menu'), 10000);
		await sleep(600);
		A(await t.page.evaluate(() => [...document.querySelectorAll('[data-mp-switcher]')].some(b => b.id === 'btn-games' && b.getClientRects().length)), 'the menu bar has a ⚙️ Games button');
		await t.page.click('#scr-menu [data-go=play]');
		await t.page.evaluate(() => { for (const s of ['[data-cat=survival]', '[data-var=normal]', '[data-players=solo]', '#mx-start']) document.querySelector('#scr-play ' + s).click(); });
		A(await waitFor(() => t.page.evaluate(() => G.Game.state === 'playing'), 15000), 'a run starts');
		const g = await t.page.evaluate(() => window.mpLeaveGuard());
		A(g.state === 'confirm' && /run will be lost/i.test(g.message), 'in a run: leaving asks first ("your run will be lost")', JSON.stringify(g));
		await t.press('Backquote');
		A(await t.isOpen() && await t.page.evaluate(() => G.Game.state === 'paused'), 'the switcher opening pauses the run');
		await t.press('KeyX');
		A(await t.page.evaluate(() => [...document.querySelectorAll('#scr-pause [data-mp-switcher]')].some(b => b.getClientRects().length)), 'the pause menu has a ⚙️ Games button');
		await t.page.click('#btn-pause-games'); await sleep(200);
		A(await t.isOpen(), '...which opens the switcher');
		await t.press('KeyZ');   // Home -> the question
		A(await t.page.evaluate(() => /run will be lost/i.test(document.querySelector('#mpsw .mpsw-confirm')?.textContent || '')), 'picking Home asks first');
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
		await t.press('KeyD'); await t.press('KeyZ');   // Leave
		await nav;
		A(new URL(t.page.url()).pathname === '/', 'Leave goes Home');
		A(t.errors.filter(e => !/WebGL|AudioContext|NotAllowed/i.test(e)).length === 0, 'MicaSurvivor: no page errors', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
