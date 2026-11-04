// run_result_commit_test.mjs — a played fight's result reaches the server, and a run
// the server has ENDED is never replayed from a stale local copy.
//
// Remy (bug:1792196873794-remygl, 2026-10-03..16): in Final Fantasy Lorequest a lost
// fight intermittently "never committed" — the lobby still offered "Continue the run"
// at the old record, and Continue reloaded the SAME fight. Worst case: Cloud's fight-5
// loss vs Seymour Flux replayed 27 times, every replay identical (its uploaded tapes all
// start "Resumed your paused Final Fantasy fight." at turn 19), zero commits; conceding
// ended it at once. Their tapes also show the browser LOSING localStorage writes (the
// local gold total reverts between slots: 62800 -> 62700, then +25 -> 62725 on every
// zombie replay). So: the loss DID end the run on the server (run-clear leaves
// `{ended: runId}`), the browser then lost the writes that removed its local copy, and
//   * boot (hydrateRunsFromServer) skipped the server's `ended` entry and kept the
//     stale local copy -> "Continue the run" -> the fight replays from its snapshot;
//   * every save of that ended run is refused ({ok:false, stale:true}) and the client
//     swallowed the refusal (`.catch(() => {})` on a reply that never throws), so the
//     replay could never commit, forever. Conceding "worked" because it only removes
//     the local copy.
// Also: the result push and the end-of-run clear were single fire-and-forget calls —
// one lost request (a 429, a timeout) and the heartbeat's dedupe never resent it.
//
//   1. server (real handler over sqlite): a refused save says WHY — `ended` for a
//      finished run, the stored `rev` when a newer revision is on the server
//   2. runsync.serverEndedRun: only the SAME run's ended marker condemns a local copy
//   3. browser, Final Fantasy: a stale local copy of an ended run is put away at boot
//      (hero select, not "Continue the run"), stashed rather than deleted
//   4. browser: a mid-fight save refused as `ended` stops the zombie fight with a notice
//   5. browser: a PLAYED loss's result and the run's end are retried through 429s
//      until the server takes them
//
//   node overworld/tests/run_result_commit_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const KEY = 'magepunk_finalfantasy_v1';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ===== 1. server: a refused save says why =====
try {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = {
		prepare(sql) {
			const stmt = sqlite.prepare(sql); const bound = [];
			const api = {
				bind(...a) { bound.length = 0; bound.push(...a); return api; },
				async first() { return stmt.get(...bound) ?? null; },
				async run() { return stmt.run(...bound); },
				async all() { return { results: stmt.all(...bound) }; },
			};
			return api;
		},
	};
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-commit-')), 'mp.bundle.mjs');
	buildSync({
		entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
		banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
	});
	const { default: handler } = await import('file://' + bundle.replace(/\\/g, '/'));
	const call = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.2.' + (1 + Math.floor(Math.random() * 200)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
			body: JSON.stringify({ action, ...body }),
		});
		return (await handler(req, { MP_DB })).json();
	};
	const run = (runId, rev, extra = {}) => ({ active: true, characterId: 'Cloud', wins: 2, losses: 2, runId, rev, enemy: { name: 'Seymour Flux' }, ...extra });
	const token = (await call('register', { username: 'zombie', password: 'zombie-password-1' })).token;
	A(!!token, '1. a test account registers');
	// the real fight: paused at turn 19 (full push), played on, lost, the run ended
	await call('run-save', { key: KEY, run: run('rCloud', 40, { snapshot: { turnNumber: 19 } }) }, token);
	await call('run-save', { key: KEY, run: run('rCloud', 55) }, token);
	await call('run-save', { key: KEY, run: run('rCloud', 56, { pendingResult: { won: false } }) }, token);
	await call('run-clear', { key: KEY, runId: 'rCloud' }, token);
	// a zombie replay (the browser lost its local removal) saves its stale copy
	const z = await call('run-save', { key: KEY, run: run('rCloud', 41, { pendingResult: { won: false } }) }, token);
	A(z.ok === false && z.stale === true && z.ended === true, '1. a save of an ENDED run is refused AND says the run ended', JSON.stringify(z));
	// a newer revision on the server: refused, with the stored revision
	await call('run-save', { key: KEY, run: run('rTerra', 30) }, token);
	const old = await call('run-save', { key: KEY, run: run('rTerra', 12) }, token);
	A(old.ok === false && old.stale === true && !old.ended && old.rev === 30, '1. an older revision is refused with the server\'s revision', JSON.stringify(old));
	const fine = await call('run-save', { key: KEY, run: run('rTerra', 31) }, token);
	A(fine.ok === true, '1. a newer revision still saves', JSON.stringify(fine));
} catch (e) {
	A(false, '1. server harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 2. runsync.serverEndedRun =====
{
	const RS = await import('file://' + path.join(ROOT, 'battlecards/runsync.js').replace(/\\/g, '/'));
	const f = RS.serverEndedRun;
	A(typeof f === 'function', '2. runsync exports serverEndedRun');
	if (typeof f === 'function') {
		const local = { active: true, runId: 'rCloud', wins: 2, losses: 2, snapshot: { turnNumber: 19 } };
		A(f(local, { ended: 'rCloud', updated_at: 1 }) === true, '2. the server ended THIS run -> the local copy is a zombie');
		A(f(local, { ended: 'rOther', updated_at: 1 }) === false, '2. another run\'s marker never touches a newer local run');
		A(f(local, { run: { runId: 'rCloud' }, updated_at: 1 }) === false, '2. a live server copy is not an end');
		A(f({ active: true, wins: 1 }, { ended: 'rCloud' }) === false, '2. a legacy local run (no runId) is left alone');
		A(f(null, { ended: 'rCloud' }) === false && f(local, null) === false, '2. nothing to compare -> no verdict');
	}
}

// ===== 3-5. the game page (Final Fantasy) against a scripted /api/mp =====
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9171;
const STATE = { username: 'zombie', friendCode: 'ZMBIE0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
// the scripted server: `api.handle(action, body)` -> [status, reply]; every call is logged
const api = { log: [], handle: null };
const defaultHandle = (action) => {
	if (action === 'run-load') return [200, { runs: {} }];
	if (action === 'run-save' || action === 'run-clear') return [200, { ok: true }];
	return [200, { ok: true, state: STATE }];
};
const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let body = {}; try { body = JSON.parse(raw); } catch (e) { /* ignore */ }
			const [status, reply] = (api.handle && api.handle(body.action, body)) || defaultHandle(body.action, body);
			api.log.push({ action: body.action, body, status, reply, at: Date.now() });
			res.writeHead(status, { 'content-type': 'application/json' });
			res.end(typeof reply === 'string' ? reply : JSON.stringify(reply));
			return;
		}
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

let browser;
const URL = `http://localhost:${PORT}/battlecards/index.html?finalfantasy=1`;
async function newPage(seed) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, seedRun, key) => {
		if (sessionStorage.getItem('__seeded')) return;   // seed once per context; reloads keep what the page wrote
		sessionStorage.setItem('__seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'zombie');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		if (seedRun) localStorage.setItem(key, JSON.stringify(seedRun));
	}, STATE, seed || null, KEY);
	return { ctx, page, errors };
}
const overlay = page => page.evaluate(() => {
	const o = document.getElementById('dungeon-overlay');
	if (!o || getComputedStyle(o).display === 'none') return null;
	return { title: (o.querySelector('h1')?.textContent || '').trim(), text: o.textContent.replace(/\s+/g, ' ').slice(0, 300), buttons: [...o.querySelectorAll('button')].map(b => b.textContent.trim()) };
}).catch(() => null);
const inFight = page => page.evaluate(() => { const s = window.__game?.state; return !!(s && s.players && s.players.length === 2 && !s.over); }).catch(() => false);
const localRun = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const clickButton = (page, re) => page.evaluate(src => {
	const o = document.getElementById('dungeon-overlay'); if (!o || getComputedStyle(o).display === 'none') return false;
	const b = [...o.querySelectorAll('button')].find(x => new RegExp(src, 'i').test(x.textContent.trim())); if (b) { b.click(); return true; } return false;
}, re.source).catch(() => false);
async function waitFor(fn, ms = 20000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; }
// start a brand-new run (hero select -> any anomaly pick) and reach the first fight
async function startRun(page) {
	for (let i = 0; i < 50; i++) {
		if (await inFight(page)) return true;
		await clickButton(page, /^(Play this hero|Continue|Fight|Choose|Pick|Start|No anomaly|Skip)/);
		await page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); if (o && getComputedStyle(o).display !== 'none') { const b = [...o.querySelectorAll('button')].find(x => !/replay|copy|watch|abandon|quit|leaderboard|roster/i.test(x.textContent)); if (b) b.click(); } }).catch(() => {});
		await sleep(600);
	}
	return inFight(page);
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// a real Final Fantasy run, paused mid-fight: the copy a zombie browser keeps
	let zombie = null;
	{
		const { ctx, page } = await newPage();
		api.handle = null;
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await startRun(page), '3. setup: a Final Fantasy run starts and reaches a fight');
		zombie = await waitFor(async () => { const r = await localRun(page); return r && r.runId && r.snapshot ? r : null; }, 15000);
		A(!!zombie, '3. setup: the run carries a runId and a mid-fight snapshot', JSON.stringify(zombie && { runId: zombie.runId, snap: !!zombie.snapshot }));
		await ctx.close();
	}
	if (zombie) {
		zombie.wins = 2; zombie.losses = 2;   // Cloud at fight 5, 2W/2L

		// ===== 3. boot: the server ended this run -> no "Continue the run" =====
		{
			api.log = [];
			const { ctx, page, errors } = await newPage(zombie);
			api.handle = (action) => action === 'run-load' ? [200, { runs: { [KEY]: { ended: zombie.runId, updated_at: Date.now() } } }] : null;
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			const o = await waitFor(async () => { const x = await overlay(page); return x && x.title ? x : null; }, 30000);
			A(o && !/RUN IN PROGRESS/i.test(o.title) && !o.buttons.some(b => /^Continue the run/i.test(b)), '3. a stale local copy of an ENDED run is not offered as "Continue the run"', JSON.stringify(o && { title: o.title, buttons: o.buttons }));
			A(o && /CHOOSE YOUR HERO/i.test(o.title), '3. ...the player picks a new hero instead', JSON.stringify(o && o.title));
			const left = await page.evaluate(k => ({ run: localStorage.getItem(k), stash: JSON.parse(localStorage.getItem(k + '__conflict_v1') || 'null'), ended: JSON.parse(localStorage.getItem('magepunk_ended_runs_v1') || '[]') }), KEY);
			A(!left.run || !JSON.parse(left.run).active || JSON.parse(left.run).runId !== zombie.runId, '3. the zombie copy is no longer the live run');
			A(left.stash && left.stash.run && left.stash.run.runId === zombie.runId, '3. ...it is stashed (recoverable), never deleted outright', JSON.stringify(left.stash && left.stash.reason));
			A(left.ended.includes(zombie.runId), '3. ...and this device remembers the run ended');
			A(!api.log.some(c => c.action === 'run-save' && c.body.run && c.body.run.runId === zombie.runId), '3. the zombie run is never pushed back to the server');
			A(errors.length === 0, '3. no uncaught page error', JSON.stringify(errors.slice(0, 2)));
			await ctx.close();
		}

		// ===== 4. mid-fight: a save refused as ended stops the zombie fight =====
		{
			api.log = [];
			const { ctx, page, errors } = await newPage(zombie);
			// boot could not reach the server (so the stale local copy boots), then every save is refused as ended
			api.handle = (action, body) => {
				if (action === 'run-load') return [503, 'upstream error'];
				if (action === 'run-save' && body.run && body.run.runId === zombie.runId) return [200, { ok: false, stale: true, ended: true, rev: null }];
				return null;
			};
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			await waitFor(() => clickButton(page, /^Continue the run/), 30000);
			A(await waitFor(() => inFight(page), 20000), '4. the stale copy boots its fight (the server could not be reached at boot)');
			const o = await waitFor(async () => { const x = await overlay(page); return x && /ALREADY ENDED/i.test(x.title) ? x : null; }, 15000);
			A(!!o, '4. the first save refused as "ended" stops the fight with a visible notice', JSON.stringify(await overlay(page)));
			A(o && o.buttons.some(b => /New Run/i.test(b)), '4. ...offering a new run');
			const after = await localRun(page);
			A(!after || after.runId !== zombie.runId, '4. ...and the zombie copy is put away', JSON.stringify(after && after.runId));
			A(errors.length === 0, '4. no uncaught page error', JSON.stringify(errors.slice(0, 2)));
			await ctx.close();
		}
	}

	// ===== 5. a PLAYED loss: its result and the run's end are retried until they land =====
	{
		api.log = []; api.handle = null;
		const { ctx, page, errors } = await newPage();
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await startRun(page), '5. a fresh run reaches its first fight');
		const r0 = await waitFor(async () => { const r = await localRun(page); return r && r.runId ? r : null; }, 10000);
		// the third loss is coming: make this the run's last fight
		await page.evaluate(k => { const r = JSON.parse(localStorage.getItem(k)); r.losses = 2; localStorage.setItem(k, JSON.stringify(r)); }, KEY);
		// the server is briefly overloaded: the result push and the end-of-run clear each meet 429s first
		let resultTries = 0, clearTries = 0;
		api.handle = (action, body) => {
			if (action === 'run-save' && body.run && body.run.pendingResult) return ++resultTries <= 2 ? [429, { error: 'slow down' }] : [200, { ok: true }];
			if (action === 'run-clear') return ++clearTries <= 1 ? [429, { error: 'slow down' }] : [200, { ok: true }];
			return null;
		};
		// lose it by PLAYING it out (the engine ends the game), not via the Concede button
		await page.evaluate(() => { const g = window.__game; g.E.concede(g.state, g.HUMAN); g.pump(); });
		const landed = await waitFor(() => api.log.find(c => c.action === 'run-save' && c.body.run && c.body.run.pendingResult && c.status === 200), 20000);
		A(!!landed, `5. the lost fight's RESULT reaches the server despite two 429s (${resultTries} tries)`, JSON.stringify(api.log.filter(c => c.action === 'run-save').map(c => [c.status, !!(c.body.run && c.body.run.pendingResult)])));
		A(landed && landed.body.run.pendingResult.won === false && landed.body.run.runId === r0.runId, '5. ...as this run\'s loss');
		const cleared = await waitFor(() => api.log.find(c => c.action === 'run-clear' && c.status === 200), 20000);
		A(cleared && cleared.body.runId === r0.runId, `5. the run's END reaches the server despite a 429 (${clearTries} tries)`, JSON.stringify(api.log.filter(c => c.action === 'run-clear').map(c => [c.status, c.body.runId])));
		const o = await overlay(page);
		A(o && /3 LOSSES/i.test(o.title), '5. the player sees the run end', JSON.stringify(o && o.title));
		A(errors.length === 0, '5. no uncaught page error', JSON.stringify(errors.slice(0, 2)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'browser harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
