// dungeon_resume_choices_test.mjs — closing DURING a scry or Discover choice must recover.
//
// The pending-decision queues (scryQueue / pickQueue / …) live in engine state and are
// serialized by toSnapshot, so they survive a close. But the choice MODAL only opens in
// reaction to an engine event, and fromSnapshot restores events empty — so without help the
// restored queue would sit there with no UI (soft-lock). resumePendingChoices() re-opens it.
//
// This drives a real dungeon fight, injects a genuinely-shaped pending choice, fires pagehide
// with the server left snapshot-less (the hard-close condition), reopens, and asserts the
// modal is back AND the choice still resolves. Covers both scry and Discover.
//   node battlecards/tests/integration/dungeon_resume_choices_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8923;
const RUN_KEY = 'magepunk_dungeon_v1';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }
const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', gold: 3000, packs: 0, collection: {}, decks: [], stats: { runs: 0, wins: 0, chars: {} } };
const storedRuns = {}; // server stores runs WITHOUT the snapshot (models the hard-close push that never lands)

async function clickInOverlay(page, sel, textIncludes, ms = 20000) {
	return waitFor(() => page.evaluate((sel, t) => {
		const box = document.querySelector(sel); if (!box || getComputedStyle(box).display === 'none') return false; // fixed overlays: offsetParent is null, gate on display
		const btns = [...box.querySelectorAll('button')];
		const b = t ? btns.find(x => x.textContent.trim().toLowerCase().includes(t.toLowerCase())) : btns[0];
		if (!b) return false; b.click(); return true;
	}, sel, textIncludes || null), ms);
}
const modalVisible = page => page.evaluate(() => { const m = document.getElementById('scry-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
// scry/Discover cell buttons listen for pointerdown (not click), so dispatch that
const pointerdownButton = (page, sel, text) => page.evaluate((sel, text) => {
	const box = document.querySelector(sel); if (!box) return false;
	const b = [...box.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().includes(text.toLowerCase()));
	if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true;
}, sel, text);

// inject a pending choice, hard-close (pagehide → snapshot saved locally, server stripped), reopen, click Continue
async function closeReopen(page, URL, injectFn) {
	await page.evaluate(injectFn);
	const localHasQueue = await page.evaluate(k => { try { const s = JSON.parse(localStorage.getItem(k)).snapshot; return (s.scryQueue.length + s.pickQueue.length) > 0; } catch { return false; } }, RUN_KEY);
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	await sleep(500);
	// pagehide re-saves the snapshot AFTER injection too; confirm the local snapshot carries the queue
	const carried = localHasQueue || await page.evaluate(k => { try { const s = JSON.parse(localStorage.getItem(k)).snapshot; return (s.scryQueue.length + s.pickQueue.length) > 0; } catch { return false; } }, RUN_KEY);
	await page.goto(URL, { waitUntil: 'domcontentloaded' });
	await clickInOverlay(page, '#dungeon-overlay', 'Continue');
	await waitFor(() => page.evaluate(() => !!(window.__game && window.__game.state)), 20000);
	return carried;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			if (msg.action === 'run-save') { const r = { ...(msg.run || {}) }; delete r.snapshot; delete r.snapshotAt; storedRuns[msg.key] = { run: r }; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }
			if (msg.action === 'run-load') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, runs: storedRuns })); return; }
			if (msg.action === 'run-clear') { delete storedRuns[msg.key]; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }
			res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, runs: storedRuns, friends: [], challenges: [], match: null, presence: null })); return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'mgibbie'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_username', 'mgibbie'); }, STATE);
		const URL = `http://localhost:${PORT}/battlecards/index.html?dungeon=1`;

		// boot into a live fight
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		await clickInOverlay(page, '#dungeon-overlay', null);
		await clickInOverlay(page, '#dungeon-overlay', 'No anomaly');
		if (await clickInOverlay(page, '#scry-modal', 'Keep hand', 8000)) await waitFor(() => page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display === 'none'), 8000);
		const live = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 20000);
		A(live, 'dungeon fight is live');
		await waitFor(() => page.evaluate(() => { const g = window.__game; return g.state.current === g.HUMAN; }), 25000);

		// ── SCRY: freeze on a scry choice, hard-close, reopen ──
		const scryCarried = await closeReopen(page, URL, () => {
			const g = window.__game, s = g.state, H = g.HUMAN;
			const top = s.players[H].deck[0] || Object.keys(s.cardsById)[0];
			s.scryQueue.push({ chooser: H, deckOwner: H, ids: [top] });
		});
		A(scryCarried, 'the scry choice was captured in the local snapshot');
		A(await modalVisible(page), 'after reopen the SCRY modal re-opened (no soft-lock)');
		A(await page.evaluate(() => { const s = window.__game.state; return s.scryQueue.length > 0 && s.scryQueue[0].chooser === window.__game.HUMAN; }), 'the pending scry survived intact');
		await pointerdownButton(page, '#scry-modal', 'Done'); // resolve it (pointerdown, not click)
		A(await waitFor(() => page.evaluate(() => window.__game.state.scryQueue.length === 0), 8000), 'the resumed scry resolves cleanly');

		// ── DISCOVER: freeze on a Discover choice, hard-close, reopen ──
		await waitFor(() => page.evaluate(() => { const g = window.__game; return g.state && !g.state.over && g.state.current === g.HUMAN; }), 20000);
		const discCarried = await closeReopen(page, URL, () => {
			const g = window.__game, s = g.state, H = g.HUMAN;
			const ids = Object.keys(s.cardsById).slice(0, 3);
			s.pickQueue.push({ player: H, ids });
		});
		A(discCarried, 'the Discover choice was captured in the local snapshot');
		A(await modalVisible(page), 'after reopen the DISCOVER modal re-opened (no soft-lock)');
		A(await page.evaluate(() => { const s = window.__game.state; return s.pickQueue.length > 0 && s.pickQueue[0].player === window.__game.HUMAN; }), 'the pending Discover survived intact');
		await pointerdownButton(page, '#scry-modal', 'Take'); // resolve it (pointerdown, not click)
		A(await waitFor(() => page.evaluate(() => window.__game.state.pickQueue.length === 0), 8000), 'the resumed Discover resolves cleanly');

		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
