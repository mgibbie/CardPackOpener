// run_save_warning_test.mjs — a run save's warning means what it says.
//
// bug:1793106175884-instinctgauntlet (2026-10-27, Multiverse): one heartbeat's reply
// came back garbled (mpmode's call() maps an unparseable body, e.g. a 5xx HTML error
// page, to {error:'bad response'}). The heartbeat path is not retried by runWrite, so
// that reply reached onRunWriteReply's refusal branch and the player read
// "The server would not save your run: bad response" — while the very next heartbeat
// saved the run (server rev matched local). A transient failure is a CONNECTION
// problem, resent on the next heartbeat; it must not read as a refusal, and a warning
// must not outlive the problem. It must also never be silent (owner rule: a run save
// never fails silently).
//
// Flow: a real ?middleearth=1 fight against a stub /api/mp whose run-save we steer:
//   1. fails ONCE (garbled 502), then succeeds   -> no warning at all
//   2. fails persistently (garbled 502 / dropped connection / 503 busy)
//        -> a "trouble reaching the server" warning (never "would not save"),
//      then succeeds                              -> "saved on the server again"
//   3. a genuine refusal (413 run too large)      -> "would not save your run: run too large"
//   4. a stale refusal (server holds a newer rev) -> "continued somewhere else"
//
//   node overworld/tests/run_save_warning_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['/opt/chrome/chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9279;
const KEY = 'magepunk_middleearth_v1';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }

const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', gold: 3000, dust: 0, packs: 0, collection: {}, decks: [], stats: null };
const storedRuns = {};
// run-save steering: 'ok' | 'fail-once' | 'fail' | 'too-large' | 'stale'
let saveMode = 'ok';
const saves = [];   // { mode, outcome } per run-save the stub answered
let failCycle = 0;

async function clickInOverlay(page, textIncludes, ms = 20000) {
	return waitFor(() => page.evaluate(t => {
		const box = document.querySelector('#dungeon-overlay'); if (!box || getComputedStyle(box).display === 'none') return false;
		const b = [...box.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().includes(t.toLowerCase()));
		if (!b) return false; b.click(); return true;
	}, textIncludes), ms);
}
const liveFight = page => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); });

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			const ok = (o, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
			const garbled = () => { res.writeHead(502, { 'content-type': 'text/html' }); res.end('<html><body>502 Bad Gateway</body></html>'); };
			if (msg.action === 'run-save') {
				const mode = saveMode;
				const failNow = () => {
					// a transient failure, three shapes: a garbled 5xx page, a dropped connection, a 503 "busy"
					const k = failCycle++ % 3;
					saves.push({ mode, outcome: ['garbled', 'dropped', 'busy'][k] });
					if (k === 0) return garbled();
					if (k === 1) return req.socket.destroy();
					return ok({ error: 'busy, retry' }, 503);
				};
				if (mode === 'fail-once') { saveMode = 'ok'; failCycle = 0; return failNow(); }
				if (mode === 'fail') return failNow();
				if (mode === 'too-large') { saves.push({ mode, outcome: 'too-large' }); return ok({ error: 'run too large' }, 413); }
				if (mode === 'stale') { saves.push({ mode, outcome: 'stale' }); return ok({ ok: false, stale: true, ended: false, rev: 99999999 }); }
				storedRuns[msg.key] = { run: msg.run, updated_at: Date.now() };
				saves.push({ mode, outcome: 'ok' });
				return ok({ ok: true });
			}
			if (msg.action === 'run-load') return ok({ ok: true, runs: storedRuns });
			if (msg.action === 'run-clear') { delete storedRuns[msg.key]; return ok({ ok: true }); }
			if (msg.action === 'challenges') return ok({ challenges: [] });
			if (msg.action === 'friends') return ok({ friends: [], friendCode: 'MGIBBIE' });
			if (msg.action === 'chat-get') return ok({ messages: [] });
			return ok({ ok: true, state: STATE, runs: storedRuns, friends: [], challenges: [], match: null, presence: null });
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		const errs = [];
		page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
			// every text the banner ever shows, in order
			window.__banners = [];
			const hook = () => {
				const b = document.getElementById('banner'); if (!b) return setTimeout(hook, 50);
				new MutationObserver(() => { const t = b.textContent; if (t && window.__banners[window.__banners.length - 1] !== t) window.__banners.push(t); })
					.observe(b, { childList: true, characterData: true, subtree: true });
			};
			document.addEventListener('DOMContentLoaded', hook);
		}, STATE);
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?middleearth=1`, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, 'Play this hero'), 'hero pick appears — chose a hero');
		if (await clickInOverlay(page, 'No anomaly', 6000)) console.log('note: skipped the weekly anomaly');
		await waitFor(() => page.evaluate(() => { const b = [...document.querySelectorAll('#scry-modal button')].find(x => /keep hand/i.test(x.textContent)); if (b && b.offsetParent) { b.click(); return true; } return false; }), 6000);
		A(await waitFor(() => liveFight(page), 30000), 'the fight is live', errs.slice(0, 2));

		// the heartbeat only sends CHANGED metadata: nudge the local run so the next tick sends
		let nudge = 0;
		const touchRun = () => page.evaluate((k, n) => { const r = JSON.parse(localStorage.getItem(k)); r.__nudge = n; localStorage.setItem(k, JSON.stringify(r)); }, KEY, ++nudge);
		const bannersSince = i => page.evaluate(i => window.__banners.slice(i), i);
		const bannerCount = () => page.evaluate(() => window.__banners.length);
		const okSaves = () => saves.filter(s => s.outcome === 'ok').length;
		const warnRe = /⚠/;

		// ── 0: a baseline heartbeat lands ──
		await touchRun();
		A(await waitFor(() => okSaves() > 0, 15000), 'baseline: a heartbeat saves the run', saves);

		// ── 1: ONE transient failure, then success: no warning at all ──
		let b0 = await bannerCount(), s0 = saves.length;
		saveMode = 'fail-once'; failCycle = 0;
		await touchRun();
		A(await waitFor(() => saves.length > s0 && saves[s0].outcome === 'garbled', 15000), '1: the next heartbeat gets a garbled 502', saves.slice(s0));
		A(await waitFor(() => saves.slice(s0 + 1).some(s => s.outcome === 'ok'), 15000), '1: ...and the following heartbeat resends and saves it', saves.slice(s0));
		await sleep(1000);
		let seen = await bannersSince(b0);
		A(!seen.some(t => /would not save/i.test(t)), '1: no "The server would not save your run" for a transient blip', seen);
		A(!seen.some(t => warnRe.test(t)), '1: no lasting warning of any kind after the retry succeeded', seen);

		// ── 2: persistent transient failure: warned (as a connection problem), then retracted ──
		b0 = await bannerCount(); s0 = saves.length;
		saveMode = 'fail'; failCycle = 0;
		await touchRun();
		A(await waitFor(async () => (await bannersSince(b0)).some(t => warnRe.test(t)), 40000), '2: a persistent failure IS warned (never silent)', { saves: saves.slice(s0), banners: await bannersSince(b0) });
		seen = await bannersSince(b0);
		A(seen.some(t => /trouble reaching the server/i.test(t)), '2: ...as a connection problem that is still being retried', seen);
		A(!seen.some(t => /would not save/i.test(t)), '2: ...not as a refusal ("would not save")', seen);
		A(saves.slice(s0).filter(s => s.outcome !== 'ok').length >= 3, '2: ...only after several heartbeats in a row failed', saves.slice(s0));
		const b1 = await bannerCount();
		saveMode = 'ok';
		A(await waitFor(async () => (await bannersSince(b1)).some(t => /saved on the server again/i.test(t)), 15000), '2: the first save that lands retracts it ("saved on the server again")', await bannersSince(b1));
		A(storedRuns[KEY] && storedRuns[KEY].run.__nudge === nudge, '2: ...and the server holds the latest metadata', storedRuns[KEY] && storedRuns[KEY].run.__nudge);

		// ── 3: a genuine refusal still says so ──
		b0 = await bannerCount();
		saveMode = 'too-large';
		await touchRun();
		A(await waitFor(async () => (await bannersSince(b0)).some(t => /would not save your run: run too large/i.test(t)), 15000), '3: a genuine refusal (413 run too large) warns "would not save"', await bannersSince(b0));
		saveMode = 'ok';
		const b2 = await bannerCount();
		A(await waitFor(async () => (await bannersSince(b2)).some(t => /saved on the server again/i.test(t)), 15000), '3: ...and a later successful save says the run is saved again', await bannersSince(b2));

		// ── 4: a stale refusal (newer revision elsewhere) still says so ──
		b0 = await bannerCount();
		saveMode = 'stale';
		await touchRun();
		A(await waitFor(async () => (await bannersSince(b0)).some(t => /continued somewhere else/i.test(t)), 15000), '4: a stale refusal warns "continued somewhere else"', await bannersSince(b0));
		saveMode = 'ok';

		A(errs.length === 0, 'no page errors', errs.slice(0, 3));
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
