// run_result_commit_test.mjs — a finished run fight's RESULT commits even when you
// leave before the post-fight beat (Remy, 2026-10-07: a Final Fantasy run frozen
// at 2W/2L; "Continue the run" reloaded the same lost fight forever).
//
// The engine ends the fight at once, but the run's victory/defeat used to run
// only after the event playback reached gameOver plus a 1200 ms beat. Leaving
// inside that window kept the PRE-DEATH snapshot, and the seeded RNG replayed
// the loss identically on every Continue. Now the result is recorded on the run
// (snapshot dropped) the moment the fight is over, and the boot settles it.
//
// Flow: boot a real ?finalfantasy=1 run into a live fight, set the record to
// 2W/2L, lose (E.concede = 0 life, the standard elimination check), and reload
// IMMEDIATELY. Then: the server copy carries the result and no snapshot;
// Continue shows "3 LOSSES - GAME OVER" (not the fight) and the run is cleared.
//   node battlecards/tests/integration/run_result_commit_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9266;
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

		// ── a live Final Fantasy fight ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, '#dungeon-overlay', 'Play this hero'), 'hero pick appears — chose a hero');
		if (await clickInOverlay(page, '#dungeon-overlay', 'No anomaly', 6000)) console.log('note: skipped the weekly anomaly');
		if (await clickInOverlay(page, '#scry-modal', 'Keep hand', 6000)) console.log('note: kept the opening hand');
		const live = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 30000);
		A(live, 'the Final Fantasy fight is live', errs.slice(0, 2));
		if (!live) throw new Error('never reached a live fight');
		// the run stands at 2W/2L with a mid-fight snapshot (one more loss ends it)
		await waitFor(() => page.evaluate(k => !!JSON.parse(localStorage.getItem(k) || '{}').snapshot, KEY), 15000);
		await page.evaluate(k => { const r = JSON.parse(localStorage.getItem(k)); r.wins = 2; r.losses = 2; localStorage.setItem(k, JSON.stringify(r)); }, KEY);
		// the server copy catches up through the 5 s heartbeat (snapshot stripped there)
		const srvAt2 = await waitFor(() => storedRuns[KEY]?.run?.losses === 2, 12000);
		const localSnap = await page.evaluate(k => { const r = JSON.parse(localStorage.getItem(k) || '{}'); return { losses: r.losses, snap: !!r.snapshot }; }, KEY);
		A(srvAt2 && localSnap.losses === 2 && localSnap.snap, 'setup: the run stands at 2W/2L (server + local), local holds a mid-fight snapshot', { srvAt2, localSnap });

		// ── lose, and leave AT ONCE (before the post-fight beat) ──
		await page.evaluate(() => { const g = window.__game; g.E.concede(g.state, g.HUMAN); g.pump(); });
		const overNow = await page.evaluate(() => !!window.__game.state.over);
		A(overNow, 'the fight is over (0 life)');
		await page.goto(URL, { waitUntil: 'domcontentloaded' });   // pagehide fires on the way out
		await sleep(300);
		const srv = storedRuns[KEY]?.run;
		A(!srv || (srv.pendingResult && srv.pendingResult.won === false && !srv.snapshot), 'the server copy carries the LOSS and no fight snapshot (or is already cleared)', srv && { pendingResult: srv.pendingResult, snap: !!srv.snapshot, losses: srv.losses });

		// ── reopen: Continue settles the loss instead of reloading the fight ──
		const offered = await clickInOverlay(page, '#dungeon-overlay', 'Continue the run', 15000);
		console.log('note: Continue offered on reopen:', offered);
		const settled = await waitFor(async () => /3 LOSSES - GAME OVER/.test(await overlayText(page)), 15000);
		const fightBack = await page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); });
		A(settled, 'reopening ends the run: "3 LOSSES - GAME OVER"', await overlayText(page));
		A(!fightBack, '...and the lost fight does NOT come back live');
		await sleep(500);
		const localAfter = await page.evaluate(k => localStorage.getItem(k), KEY);
		A(localAfter == null && !storedRuns[KEY], 'the run is cleared locally and on the server (the lobby stops offering Continue)', { local: localAfter && localAfter.slice(0, 80), server: !!storedRuns[KEY] });
		A(errs.length === 0, 'no page errors', errs.slice(0, 3));
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
