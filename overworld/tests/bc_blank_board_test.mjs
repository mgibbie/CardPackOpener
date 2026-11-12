// bc_blank_board_test.mjs — a Battlecards page whose board can't draw says so (and reports why).
//
// instinctgauntlet, 2026-11-06 (three times: after a defeat, entering F10, entering F13 of Middle-earth
// runs): Fight! gave the page chrome with a blank board and nothing in the console to go on; a reload of
// the plain URL + "Continue the run" recovered every time, the run intact. The cause could not be pinned
// down from the reports, so the two ways a board goes blank are now visible and reported:
//   1. the game module never starts (a module failed to load or threw while loading): a boot watchdog
//      in index.html reports the early errors and offers a Reload
//      1b. (2026-11-12) what the watchdog's reports showed: each time a module had FAILED TO DOWNLOAD on a
//      connection that was dropping requests. The page now loads itself again by itself, twice at most, and
//      Fight!'s marker survives it; only when that fails too does it stop and offer the Reload
//   2. the browser drops the WebGL context (GPU reset / too many WebGL tabs): the game reports it and
//      tells the player the fight is saved and a reload continues it
//
//   node overworld/tests/bc_blank_board_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9172;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

let breakEngine = false, failNext = 0, pageLoads = 0;   // (failNext: how many more requests for engine.js fail; pageLoads: how often the page itself was asked for)
const errs = [];
const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			try { const j = JSON.parse(body); if (j.action === 'err') errs.push(j); } catch { /* ignore */ }
			res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: { username: 'blankboard', friendCode: 'BLNKBD', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } } })); return;
		}
		if (u === '/battlecards/index.html') pageLoads++;
		if (u === '/battlecards/engine.js' && (breakEngine || failNext > 0)) { if (failNext > 0) failNext--; res.writeHead(503); res.end('busy'); return; }   // a module that fails to load
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const URL_ = `http://localhost:${PORT}/battlecards/index.html?boss=bink_the_burglar`;
	const STATE = { username: 'blankboard', friendCode: 'BLNKBD', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const signIn = page => page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'blankboard'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	const failed = page => page.evaluate(() => { const d = document.getElementById('boot-failed'); return d ? d.textContent : null; });

	// ===== 1. the game module never starts =====
	{
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await signIn(page);
		breakEngine = true; errs.length = 0; pageLoads = 0;
		await page.goto(URL_, { waitUntil: 'load' });
		await sleep(13500);
		const shown = await failed(page);
		A(pageLoads === 3 && await page.evaluate(() => window.__bootRetries === 2 && !document.getElementById('boot-retry')), '1b. a module that keeps failing: the page loads itself again twice, then stops (three loads in all, no loop)', String(pageLoads));
		A(errs.filter(e => /never started/.test(e.msg)).length === 3 && errs.some(e => /\[after 2 automatic reloads\]$/.test(e.msg)) && errs.some(e => /\[reloading\]$/.test(e.msg)), '1b. ...each failure is reported, saying which try it was', JSON.stringify(errs.map(e => e.msg.slice(-60))));
		A(await page.evaluate(() => !window.__game), '1. (setup) with a module failing to load, the game never starts');
		A(shown && /did not finish loading/.test(shown), '1. the page says the game did not load and offers a Reload (not a silent blank board)', shown);
		A(errs.some(e => /never started/.test(e.msg) && e.where === 'index.html boot watchdog'), '1. ...and reports it to the error beacon', JSON.stringify(errs.map(e => e.msg)));
		breakEngine = false;
		// the Reload button starts the count again (a player who presses it gets the automatic tries again)
		A(await page.evaluate(() => { const b = document.querySelector('#boot-failed button'); return !!b && sessionStorage.getItem('bc_boot_retry') === '2'; }), '1b. (the count is kept for this tab until the button is pressed or the game starts)');
		await ctx.close();
	}
	// ===== 1b. one dropped request: the page recovers by itself, and Fight!'s marker with it =====
	{
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await signIn(page);
		await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('t_seeded')) { sessionStorage.setItem('t_seeded', '1'); sessionStorage.setItem('magepunk_fight_go_v1', JSON.stringify({ key: 'k', runId: 'r', at: Date.now() })); } window.__goAtLoad = sessionStorage.getItem('magepunk_fight_go_v1'); });
		failNext = 1; errs.length = 0; pageLoads = 0;
		await page.goto(URL_, { waitUntil: 'load' });
		let live = false, sawNotice = false;
		for (let i = 0; i < 60 && !live; i++) { await sleep(300); sawNotice = sawNotice || await page.evaluate(() => !!document.getElementById('boot-retry')).catch(() => false); live = await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players)).catch(() => false); }
		A(live && pageLoads === 2, '1b. one request for a module dropped: the page loads itself again once and the game starts, with nothing pressed', JSON.stringify({ live, pageLoads }));
		A(sawNotice, '1b. ...while it does, the page says it is loading again (not a silent blank board)');
		A(await page.evaluate(() => !!window.__goAtLoad && !document.getElementById('boot-failed')), "1b. ...Fight!'s marker was still there for the load that worked (the fight opens without the resume prompt), and no failure is shown");
		A(errs.filter(e => /never started/.test(e.msg)).length === 1 && /\[reloading\]$/.test(errs[0].msg), '1b. ...the dropped request is still reported, once', JSON.stringify(errs.map(e => e.msg.slice(-50))));
		await sleep(12500);
		A(await page.evaluate(() => sessionStorage.getItem('bc_boot_retry') === null && !document.getElementById('boot-failed')), '1b. ...and once the game has started the count is cleared (the next drop gets its tries again)');
		await ctx.close();
	}
	// ===== the healthy boot is untouched =====
	{
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await signIn(page);
		const perr = []; page.on('pageerror', e => perr.push(String(e.message)));
		errs.length = 0;
		await page.goto(URL_, { waitUntil: 'load' });
		let live = false;
		for (let i = 0; i < 30 && !live; i++) { await sleep(500); live = await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players)).catch(() => false); }
		A(live, 'a normal boot starts the game');
		await sleep(12500);
		A(!(await failed(page)), '...and the boot watchdog stays quiet');

		// ===== 2. the browser drops the WebGL context =====
		const lost = await page.evaluate(() => {
			const c = document.querySelector('#scene canvas');
			const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
			const ext = gl && gl.getExtension('WEBGL_lose_context');
			if (!ext) return false;
			ext.loseContext();
			window.__restoreGL = () => ext.restoreContext();
			return true;
		});
		A(lost, '2. (setup) the WebGL context can be dropped');
		await sleep(800);
		const ban = await page.evaluate(() => document.getElementById('banner')?.textContent || '');
		A(/graphics stopped/.test(ban) && /reload/i.test(ban), '2. a dropped board tells the player the fight is saved and to reload', ban);
		A(errs.some(e => /webgl context lost/.test(e.msg)), '2. ...and reports it', JSON.stringify(errs.map(e => e.msg)));
		await page.evaluate(() => window.__restoreGL());
		await sleep(800);
		A(/board is back/.test(await page.evaluate(() => document.getElementById('banner')?.textContent || '')), '2. a restored context says the board is back');
		A(perr.length === 0, 'no uncaught page error', JSON.stringify(perr.slice(0, 2)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
