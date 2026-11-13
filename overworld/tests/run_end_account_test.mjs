// run_end_account_test.mjs — a run that ended on one browser is ended on the ACCOUNT (Plans/IMPROVEMENT_PLAN_2026_11.md 2e).
// The end of a run is told to the server (run-clear), and remembered in the browser that ended it. When the message never
// arrived (the tab was closed), only THAT browser kept the finished run away: a fresh sign-in on another browser took it
// back from the server. Now a boot that finds the server still holding a run this browser ended tells the server again.
// The REAL server handler (server/mp.mjs over sqlite) behind a static server, a signed-in account, two browser sessions.
//   * the server holds a Heist run; browser A's list says it ended (the lost clear)
//   * browser A opens Battlecards: the server's entry becomes the `ended` marker, and A does not take the run
//   * a fresh browser B signs in afterwards: it gets no run
//   * a run the browser did NOT end is still handed over (the hand-off between devices is as it was)
//   node overworld/tests/run_end_account_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

// the server's random GC sweep (server/mp.mjs gcRate) stays off: its `gc:last` stamp would land in this suite's write checks
process.env.MP_GC_RATE = '0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9653;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

// ---------- the real handler over sqlite, counting row writes per key prefix ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && Number(r.changes) > 0) writes.push({ k: String(bound[0]), t: Date.now() }); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-run-end-account-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
const actions = [];   // every /api/mp call the pages make: {who, action, t}
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		try { const b = JSON.parse(raw); actions.push({ action: b.action, t: Date.now(), auth: (req.headers.authorization || '').slice(-8) }); } catch { }
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
// (a suite rerun right after the first may find the port still held for a moment: retry for 20 s)
for (let i = 0; ; i++) {
	try { await new Promise((res, rej) => { server.once('error', rej); server.listen(PORT, () => { server.off('error', rej); res(); }); }); break; }
	catch (e) { if (e.code !== 'EADDRINUSE' || i >= 40) throw e; await sleep(500); }
}

const KEY = 'magepunk_heist_v1';
const tok = (await call('register', { username: 'heister', password: 'run-end-account-1' })).token;
const run = (runId, rev) => ({ active: true, runId, rev, wins: 1, losses: 0, updatedAt: Date.now() });
const saved = await call('run-save', { key: KEY, run: run('rA', 3) }, tok);
const onServer = async () => ((await call('run-load', {}, tok)).runs || {})[KEY];
A(!!tok && saved.ok === true && (await onServer()).run.runId === 'rA', 'the server holds Heist run A (the clear that ended it never arrived)', JSON.stringify(saved));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const open = async (ended) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });
		const st = (await call('state', {}, tok)).state;
		await page.evaluateOnNewDocument((tk, st, ended) => { localStorage.setItem('magepunk_mp_token_v1', tk); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); if (ended && !localStorage.getItem('magepunk_ended_runs_v1')) localStorage.setItem('magepunk_ended_runs_v1', JSON.stringify(ended)); }, tok, st, ended);
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?heist=1`, { waitUntil: 'domcontentloaded' });
		return page;
	};
	const loads = () => actions.filter((q) => q.action === 'run-load').length;
	const local = (p) => p.evaluate((k) => localStorage.getItem(k), KEY);

	// ---- browser A: it ended run A, the server never heard
	const n0 = loads();
	const PA = await open(['rA']);
	A(await waitFor(() => loads() > n0, 30000), 'browser A opens Battlecards signed in: its boot asks the server for the runs');
	const marked = await waitFor(async () => { const e = await onServer(); return !!e && e.ended === 'rA' && !e.run; }, 15000);
	A(marked, 'the server still held a run this browser ended: the boot tells it again, and the entry becomes the ended marker', JSON.stringify(await onServer()));
	A(await local(PA) === null, 'browser A does not take the finished run back', String(await local(PA)).slice(0, 120));

	// ---- browser B: a fresh sign-in, with no list of its own
	const n1 = loads();
	const PB = await open(null);
	await waitFor(() => loads() > n1, 30000); await sleep(1500);
	A(await local(PB) === null && !(await onServer()).run, 'a fresh sign-in on another browser gets no run: it ended on the account', JSON.stringify([String(await local(PB)).slice(0, 120), await onServer()]));
	A((await call('run-save', { key: KEY, run: run('rA', 9) }, tok)).stale === true, 'and a late save of the ended run is refused');

	// ---- a run nobody ended is still handed over
	await call('run-save', { key: 'magepunk_tombs_v1', run: run('rT', 2) }, tok);
	const n2 = loads();
	const PC = await open(['rA']);
	await waitFor(() => loads() > n2, 30000);
	const got = await waitFor(() => PC.evaluate(() => { try { return (JSON.parse(localStorage.getItem('magepunk_tombs_v1') || 'null') || {}).runId === 'rT'; } catch (e) { return false; } }), 10000);
	const tombs = ((await call('run-load', {}, tok)).runs || {}).magepunk_tombs_v1;
	A(got && tombs && tombs.run && tombs.run.runId === 'rT' && !tombs.ended, 'a run this browser did not end is handed over as before, and stays on the server', JSON.stringify(tombs));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
