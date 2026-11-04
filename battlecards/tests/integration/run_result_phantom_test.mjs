// run_result_phantom_test.mjs — a fight's result is recorded ONCE, never again from
// a stale finished state (Muse, 2026-10-07: Final Fantasy Lorequest "a failed fight
// load commits a phantom loss" — the record ran a loss ahead of the fights played).
//
// After a loss the mode goes straight to "NEXT: <enemy> / Fight!" (postGame and the
// pending result are both cleared), but `state` is still the finished fight until
// the next one boots. Fight! reloads the page, and the pagehide save
// (saveRunSnapshot -> recordRunResult) saw state.over on a run with no pending
// result and stamped the OLD loss onto the NEXT fight; the boot then settled it as
// a second loss and showed "NEXT ... Fight!" again — no fight ever loaded.
//
// Flow: a real ?finalfantasy=1 fight at 0W/0L, lose (E.concede), let the mode apply
// the defeat, then click Fight!. The next fight must boot live with the record at
// 0W/1L (local + server), no pending result.
//   node battlecards/tests/integration/run_result_phantom_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9321;
const KEY = 'magepunk_finalfantasy_v1';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }

const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', gold: 3000, dust: 0, packs: 0, collection: {}, decks: [], stats: { runs: 0, wins: 0, chars: {} } };
const storedRuns = {};   // the server's run doc, as the real one keeps it (snapshot included when sent)

async function clickInOverlay(page, sel, textIncludes, ms = 20000) {
	return waitFor(() => page.evaluate((sel, t) => {
		const box = document.querySelector(sel); if (!box || getComputedStyle(box).display === 'none') return false;
		const btns = [...box.querySelectorAll('button')];
		const b = t ? btns.find(x => x.textContent.trim().toLowerCase().includes(t.toLowerCase())) : btns[0];
		if (!b) return false; b.click(); return true;
	}, sel, textIncludes || null), ms);
}
const overlayText = page => page.evaluate(() => { const b = document.querySelector('#dungeon-overlay'); return b && getComputedStyle(b).display !== 'none' ? b.textContent : ''; });

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			const ok = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
			if (msg.action === 'run-save') { storedRuns[msg.key] = { run: msg.run, updated_at: Date.now() }; return ok({ ok: true }); }
			if (msg.action === 'run-load') return ok({ ok: true, runs: storedRuns });
			if (msg.action === 'run-clear') { delete storedRuns[msg.key]; return ok({ ok: true }); }
			return ok({ ok: true, state: STATE, runs: storedRuns, friends: [], challenges: [], match: null, presence: null });
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
		const errs = [];
		page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
		}, STATE);
		const URL = `http://localhost:${PORT}/battlecards/index.html?finalfantasy=1`;

		// ── a live Final Fantasy fight at 0W/0L ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, '#dungeon-overlay', 'Play this hero'), 'hero pick appears — chose a hero');
		if (await clickInOverlay(page, '#dungeon-overlay', 'No anomaly', 6000)) console.log('note: skipped the weekly anomaly');
		if (await clickInOverlay(page, '#scry-modal', 'Keep hand', 6000)) console.log('note: kept the opening hand');
		const live = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 30000);
		A(live, 'the Final Fantasy fight is live', errs.slice(0, 2));
		if (!live) throw new Error('never reached a live fight');

		// ── lose, and let the mode apply the defeat (-> "NEXT: ... Fight!") ──
		await page.evaluate(() => { const g = window.__game; g.E.concede(g.state, g.HUMAN); g.pump(); });
		const next = await waitFor(async () => /NEXT:/.test(await overlayText(page)), 30000);
		const after1 = await page.evaluate(k => { const r = JSON.parse(localStorage.getItem(k) || '{}'); return { w: r.wins || 0, l: r.losses || 0, pending: !!r.pendingResult, post: !!r.postGame }; }, KEY);
		A(next && after1.l === 1 && after1.w === 0 && !after1.pending, 'setup: the loss is applied once (0W/1L) and the mode offers the NEXT fight', { next, after1, text: await overlayText(page) });

		// ── Fight! (a reload: pagehide saves with the finished fight still in memory) ──
		A(await clickInOverlay(page, '#dungeon-overlay', 'Fight!'), 'clicked Fight!');
		await sleep(400);
		await page.waitForFunction(() => document.readyState !== 'loading', { timeout: 15000 }).catch(() => {});
		if (await clickInOverlay(page, '#dungeon-overlay', 'Continue the run', 6000)) console.log('note: clicked Continue the run');
		if (await clickInOverlay(page, '#scry-modal', 'Keep hand', 6000)) console.log('note: kept the opening hand');
		const live2 = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 30000);
		const rec = await page.evaluate(k => { const r = JSON.parse(localStorage.getItem(k) || '{}'); return { w: r.wins || 0, l: r.losses || 0, pending: !!r.pendingResult }; }, KEY);
		A(live2, 'the NEXT fight boots live (it used to settle a phantom loss and show "NEXT ... Fight!" again)', { text: await overlayText(page) });
		A(rec.l === 1 && rec.w === 0 && !rec.pending, 'the record is still 0W/1L — one loss for the one fight played', rec);
		await sleep(5500);   // the 5 s heartbeat
		const srv = storedRuns[KEY]?.run;
		A(srv && (srv.losses || 0) === 1 && !srv.pendingResult, 'the server copy agrees: 1 loss, nothing pending', srv && { w: srv.wins, l: srv.losses, pending: srv.pendingResult });
		A(errs.length === 0, 'no page errors', errs.slice(0, 3));
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
