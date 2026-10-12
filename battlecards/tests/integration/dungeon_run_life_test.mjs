// dungeon_run_life_test.mjs (2026-10-12, Instinct: bug:1791801038728)
//
// Every run fight starts both sides at the same life: 10 on round 1, +5 per round
// (setRunLife, c72e31ed). The dungeon/heist/tombs boots ALSO set life + maxLife from
// an older 15 + 5*(level-1) formula first, so setRunLife undercut current life and
// left maxLife high: level 2 started both heroes at 15 life with a 20 max, while the
// level preview advertised 20. Now runLifeFor() is the one source: the fight starts
// at full health (life = maxLife) and the previews show the same number.
//   node battlecards/tests/integration/dungeon_run_life_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9391;
const RUN_KEY = 'magepunk_dungeon_v1';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }

const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', gold: 3000, dust: 0, packs: 0, collection: {}, decks: [], stats: { runs: 0, wins: 0, chars: {} } };
// The server deliberately stores runs WITHOUT the snapshot — this models the hard
// tab-close where the async/keepalive final push never lands, so the server stays
// behind while localStorage holds the exact board. keepLocalRun must then win.
const storedRuns = {};

async function clickInOverlay(page, sel, textIncludes, ms = 20000) {
	// NB: position:fixed overlays have offsetParent === null, so gate on computed display only
	return waitFor(() => page.evaluate((sel, t) => {
		const box = document.querySelector(sel); if (!box || getComputedStyle(box).display === 'none') return false;
		const btns = [...box.querySelectorAll('button')];
		const b = t ? btns.find(x => x.textContent.trim().toLowerCase().includes(t.toLowerCase())) : btns[0];
		if (!b) return false; b.click(); return true;
	}, sel, textIncludes || null), ms);
}
async function overlayHidden(page, sel) {
	return waitFor(() => page.evaluate(sel => { const b = document.querySelector(sel); return !b || getComputedStyle(b).display === 'none'; }, sel), 15000);
}
(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			if (msg.action === 'run-save') {
				const r = { ...(msg.run || {}) }; delete r.snapshot; delete r.snapshotAt; // server never gets the snapshot
				storedRuns[msg.key] = { run: r };
				res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return;
			}
			if (msg.action === 'run-load') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, runs: storedRuns })); return; }
			if (msg.action === 'run-clear') { delete storedRuns[msg.key]; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, runs: storedRuns, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		let page = await browser.newPage();
		await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
		const errs = [];
		page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
		}, STATE);
		const URL = `http://localhost:${PORT}/battlecards/index.html?dungeon=1`;
		const lives = () => page.evaluate(() => { const g = window.__game, s = g.state; return s.players.map(p => ({ life: p.life, max: p.maxLife })); });
		const live = () => waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 20000);

		// ── level 1: a fresh run ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, '#dungeon-overlay', null), 'class pick appears');
		A(await clickInOverlay(page, '#dungeon-overlay', 'No anomaly'), 'anomaly pick appears');
		if (await clickInOverlay(page, '#scry-modal', 'Keep hand', 8000)) await overlayHidden(page, '#scry-modal');
		A(await live(), 'the level-1 fight is live', errs.slice(0, 2));
		const l1 = await lives();
		A(l1.every(p => p.life === 10 && p.max === 10), 'level 1: both heroes start at 10/10 (full health, at parity)', l1);

		// ── level 2: the same run, one level deeper, booted fresh (no snapshot). The live
		//    fight re-saves every frame, so close it first and seed the edited run into a
		//    NEW page before the game script runs. ──
		const run2 = await page.evaluate(k => { const r = JSON.parse(localStorage.getItem(k)); r.level = 2; delete r.snapshot; delete r.snapshotAt; delete r.pendingResult; return r; }, RUN_KEY);
		await page.close();
		page = await browser.newPage();
		await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
		page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
		storedRuns[RUN_KEY] = { run: run2 };
		await page.evaluateOnNewDocument((st, k, r) => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
			if (!sessionStorage.getItem('seeded2')) { sessionStorage.setItem('seeded2', '1'); localStorage.setItem(k, JSON.stringify(r)); }
		}, STATE, RUN_KEY, run2);
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, '#dungeon-overlay', 'Continue'), 'the run offers Continue');
		if (await clickInOverlay(page, '#scry-modal', 'Keep hand', 8000)) await overlayHidden(page, '#scry-modal');
		A(await live(), 'the level-2 fight is live', errs.slice(0, 2));
		const l2 = await lives();
		A(l2.every(p => p.life === 15 && p.max === 15), 'level 2: both heroes start at 15/15 — not 15 life with a 20 max (the report)', l2);

		// ── the level previews show the life the fight starts at ──
		const game = fs.readFileSync(path.join(ROOT, 'battlecards/game.js'), 'utf8');
		const previews = game.match(/Next: \$\{boss\.name\} \(\$\{[^}]+\} HP\)/g) || [];
		A(previews.length === 3 && previews.every(p => p.includes('runLifeFor(nextLevel)')), 'the dungeon/heist/tombs previews read runLifeFor, the boot source', previews);
		A(!/15 \+ \((run\.)?level - 1\) \* 5/.test(game), 'no boot keeps the old 15+5 formula');
		A(errs.length === 0, 'no page errors', errs.slice(0, 3));
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`
${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
