// micatro_runsync_test.mjs — Micatro's run in progress and completed challenges follow the player between devices
// (server/mp.mjs micatro-run-* / micatro-challenges-*; micatro/js/ui/runsync.js, challengesync.js, main.js, net.js),
// end to end: the REAL handler (bundled like the dev server) over an in-memory sqlite D1 stand-in behind a static
// server, headless Chrome with SEPARATE browser contexts (own localStorage) as two devices on the same account:
//   1. device A plays a few rounds; the run reaches the account
//   2. device B (empty storage) sees "Continue run from another device: Ante · Round", continues it, plays on
//   3. A reloads: its copy is BEHIND, so it is offered B's further-along run (its own copy backed up first)
//   4. a win on B clears the account's run: A no longer offers Continue for it (its copy goes to the backup slot)
//   5. two DIFFERENT runs (A's new run on the account, B's own new one): B's push is refused (never overwrites), and
//      B's Continue asks which to continue; the one not chosen is backed up; A is then asked too
//   6. a challenge completed on A shows on B
//   7. guest carry-over: a guest's run (and challenge ticks) move into a fresh account on the first sign-in; into an
//      account that already has a run, the player is asked instead
// Screenshots (the cross-device Continue and the two-runs prompt, desktop + phone) go to $SHOTS when set.
// Mod art missing from this checkout (a worktree) is served read-only from the main checkout (MICATRO_MAIN).
// The moves come from a Pokermon fixture recorded before the 3.9.1 joker reworks of pokejokers_09-17 (batch 7, 3.9.1+r4):
// 3.9.1 keeps the Rotom forms (and Lucario without an editioned card) out of the pools, so the fixture's opening Poke Ball
// rolls another Basic. The page is served those 9 files as of the batch-6 merge (git show e295b8b7), like
// micatro_resume_win_badges_test.mjs.
//   node overworld/tests/micatro_runsync_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'child_process';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const SHOTS = process.env.SHOTS || '';
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9655;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

// (the fixture's rules: pokejokers_09-17 before their 3.9.1 reworks, from the batch-6 merge commit — see the header)
const PRE_B7 = 'e295b8b7c7aa3fb38b3d65658a54bf92cb125ac8';
const JOKERS_PRE_B7 = {};
for (let i = 9; i <= 17; i++) {
	const p = `micatro/mods/pokermon/jokers/pokejokers_${String(i).padStart(2, '0')}.js`;
	JOKERS_PRE_B7['/' + p] = execFileSync('git', ['show', `${PRE_B7}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
}
// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const runRow = (u) => row('micatro_run:' + u) || {};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-runsync-e2e-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.31.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	return (await handler(req, { MP_DB })).json();
};
// every run / challenge call is logged (+ whether the server wrote)
const apiCalls = [];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.fs': 'text/plain' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let action = '', reqBody = {}; try { reqBody = JSON.parse(raw); action = reqBody.action || ''; } catch { }
		const ip = '10.32.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			const text = await r.text();
			if (/^micatro-(run|challenges)-/.test(action)) { let b = {}; try { b = JSON.parse(text); } catch { } apiCalls.push({ action, status: r.status, error: b.error || null, wrote: !!b.wrote || !!b.changed, auth: !!req.headers.authorization, n: reqBody.recipe && Array.isArray(reqBody.recipe.actions) ? reqBody.recipe.actions.length : reqBody.actions, endless: !!reqBody.endless, outcome: reqBody.outcome }); }
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(text);
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	if (JOKERS_PRE_B7[f]) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(JOKERS_PRE_B7[f]); return; }
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise(r => server.listen(PORT, r));

const tokens = {};
for (const n of ['rsync', 'rsnew']) tokens[n] = (await call('register', { username: n, password: 'runsync-e2e-pass' })).token;
A(tokens.rsync && tokens.rsnew, 'real accounts registered');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'micatro/tests/fixtures/pokermon_grass_monotype_win.json'), 'utf8'));
const FXID = FX.seed + ':' + FX.started;
const SEL = FX.actions.map((a, i) => (a.type === 'select_blind' ? i : -1)).filter((i) => i >= 0); // each round's first move
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

	/** A "device": its own browser context (own localStorage). Only the pages a step needs are open (RAM). */
	const device = async (name) => {
		const ctx = await browser.createBrowserContext();
		const d = { ctx, page: null, errors: [], name };
		await open(d);
		await d.page.goto(`http://localhost:${PORT}/micatro/nothing.txt`); // the origin, so localStorage can be set before the game boots
		await d.page.evaluate(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
		return d;
	};
	const open = async (d) => {
		if (d.page) return;
		d.page = await d.ctx.newPage();
		await d.page.setViewport(DESKTOP);
		d.page.on('pageerror', e => d.errors.push(d.name + ' pageerr: ' + e.message));
	};
	/** Close the device's page (its localStorage stays in the context) — a phone in a pocket. */
	const park = async (d) => { if (d.page) { await d.page.close().catch(() => {}); d.page = null; } };
	/** Sign the device in as `who` (or a guest: null), then (re)load the game to its main menu. The saved run is kept. */
	const boot = async (d, who, { fast = true } = {}) => {
		await open(d);
		if (d.page.url().startsWith('about:')) await d.page.goto(`http://localhost:${PORT}/micatro/nothing.txt`);
		const st = who ? await stateOf(who) : null;
		await d.page.evaluate((tok, st) => {
			if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			else { localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); }
		}, who ? tokens[who] : null, st);
		await d.page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => d.page.evaluate(() => !!(window.__micatro && window.__micatro.ready) && !!document.querySelector('.menu-modal')), 40000);
		// (tests: push quickly instead of every 20-60 s — except where the real debounce is measured)
		if (fast) await d.page.evaluate(async () => (await import('/micatro/js/ui/runsync.js')).setSyncTiming({ minGap: 200, idle: 600 }));
		return ok;
	};
	const idle = (d) => waitFor(() => d.page.evaluate(() => window.__micatro.idle()), 30000);
	const act = async (d, a) => { await idle(d); const r = await d.page.evaluate((a) => { const r = window.__micatro.act(a); return { ok: r.ok, error: r.error }; }, a); await idle(d); return r; };
	/** The tester's real run (replayable): play its actions [from, to) through the board. */
	const playFx = async (d, from, to) => {
		for (let i = from; i < to; i++) { const r = await act(d, FX.actions[i]); if (!r.ok) return { i, r }; }
		return null;
	};
	/** A few replayable moves in a fresh run: select the blind, pick a card, discard it. */
	const fewMoves = async (d) => {
		await act(d, { type: 'select_blind' });
		const ids = await d.page.evaluate(() => [window.__micatro.view().areas.hand[0].id]);
		await act(d, { type: 'highlight', ids });
		await act(d, { type: 'discard' });
	};
	/** Win the run on the table, fast (the last ante's three blinds scored outright — not replayable, not needed after). */
	const winNow = async (d) => {
		await d.page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.round_resets.ante = G.GAME.win_ante; });
		for (let b = 0; b < 3; b++) {
			await act(d, { type: 'select_blind' });
			const ids = await d.page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.chips = G.GAME.blind.chips; return [G.hand.cards[0].sort_id]; });
			await act(d, { type: 'highlight', ids });
			await act(d, { type: 'play' });
			if (await d.page.evaluate(() => !!window.__micatro.view().won)) return; // (the boss of the last ante: stop at the win, not on into Endless)
			await act(d, { type: 'cash_out' }); await act(d, { type: 'next_round' });
		}
	};
	/** The tab is hidden (a phone switching apps): runsync pushes what is unsent. */
	const hide = (d) => d.page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
		Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
	});
	const newRun = async (d, o = {}) => {
		await d.page.evaluate((o) => window.__micatro.newRun(o), o);
		return waitFor(() => d.page.evaluate(() => !!window.__micatro.session && !!window.__micatro.view() && window.__micatro.idle()), 40000);
	};
	const local = (d) => d.page.evaluate(() => { const r = JSON.parse(localStorage.getItem('micatro_run_v1') || 'null'); return r ? { id: r.seed + ':' + (r.started || 0), n: r.actions.length } : null; });
	const backup = (d) => d.page.evaluate(() => { const b = JSON.parse(localStorage.getItem('micatro_run_backup_v1') || 'null'); return b ? { id: b.recipe.seed + ':' + (b.recipe.started || 0), n: b.recipe.actions.length, reason: b.reason } : null; });
	const view = (d) => d.page.evaluate(() => { const v = window.__micatro.view(); return v ? { ante: v.ante, round: v.round, state: v.state, seed: v.seed, dollars: v.dollars, jokers: ((v.areas && v.areas.jokers) || []).map((c) => c.center).join(',') } : null; });
	const cloudNote = (d) => d.page.evaluate(() => { const e = document.querySelector('.menu-cloud'); return e ? e.textContent.replace(/\u00a0/g, ' ') : null; });
	const hasContinue = (d) => d.page.evaluate(() => !!document.querySelector('.b-continue'));
	const synced = (d, u, ms = 20000) => waitFor(async () => { const l = await local(d); const r = runRow(u).run; return l && r && r.id === l.id && r.progress.actions === l.n; }, ms);
	/** The main menu's Continue -> the run choice, a version prompt, or the run on the table. */
	const clickContinue = async (d) => {
		await d.page.evaluate(() => document.querySelector('.b-continue').click());
		await waitFor(() => d.page.evaluate(() => !!document.querySelector('.b-resume-continue, .run-choice') || (!!window.__micatro.session && !!window.__micatro.view())), 60000);
	};
	/** (+ "Continue anyway" if the mods changed since the run was recorded) -> the run is on the table. */
	const onTable = async (d) => {
		if (await d.page.evaluate(() => !!document.querySelector('.b-resume-continue'))) await d.page.evaluate(() => document.querySelector('.b-resume-continue').click());
		return waitFor(() => d.page.evaluate(() => !!window.__micatro.session && !!window.__micatro.view() && window.__micatro.idle() && !document.querySelector('.menu-modal')), 60000);
	};
	const shot = async (d, name) => { if (!SHOTS) return; await sleep(800); await d.page.screenshot({ path: path.join(SHOTS, name) }); };
	const puts = () => apiCalls.filter((c) => c.action === 'micatro-run-put');

	// ===== 1. device A plays a few rounds (the tester's real run, from round 2) =====
	const devA = await device('A');
	await devA.page.evaluate((saved) => localStorage.setItem('micatro_run_v1', JSON.stringify(saved)), { ...FX, actions: FX.actions.slice(0, SEL[1]) });
	A(await boot(devA, 'rsync', { fast: false }), 'device A: game ready, signed in, with a run saved in this browser');
	A(await waitFor(() => runRow('rsync').run && runRow('rsync').run.id === FXID && runRow('rsync').run.progress.actions === SEL[1], 15000), 'the account had no run: this browser\'s run is pushed to it at once', JSON.stringify(runRow('rsync').run && runRow('rsync').run.progress));
	A(await hasContinue(devA) && !(await cloudNote(devA)), 'Continue offers it (this device\'s own run: no "from another device")');
	await clickContinue(devA);
	A(await onTable(devA), 'device A continues it');
	const p0 = puts().length, t0 = Date.now();
	const badA = await playFx(devA, SEL[1], SEL[3]);
	A(!badA, `device A plays two more rounds (${SEL[3] - SEL[1]} moves)`, JSON.stringify(badA));
	const playMs = Date.now() - t0, putsDuring = puts().length - p0;
	console.log(`  (default timing: ${putsDuring} pushes over ${SEL[3] - SEL[1]} moves in ${(playMs / 1000).toFixed(1)} s)`);
	A(putsDuring <= Math.ceil(playMs / 20000) + 1, `the pushes are debounced (${putsDuring} for ${SEL[3] - SEL[1]} moves in ${(playMs / 1000).toFixed(0)} s: at most one per 20 s at round checkpoints)`, putsDuring);
	await hide(devA);
	A(await synced(devA, 'rsync', 10000), 'hiding the tab pushes the rest at once: the account has every move', JSON.stringify([await local(devA), runRow('rsync').run.progress]));
	const vA = await view(devA);
	const pr = runRow('rsync').run.progress;
	A(pr.ante === vA.ante && pr.round === vA.round, 'with its progress (ante / round) for the menu', JSON.stringify([pr, vA]));
	const runA = await local(devA);
	await park(devA);

	// ===== 2. device B: Continue run from another device =====
	const devB = await device('B');
	A(await boot(devB, 'rsync'), 'device B: game ready (same account, empty localStorage)');
	A(await hasContinue(devB), 'device B offers Continue');
	const want = `Continue run from another device: Ante ${vA.ante} · Round ${vA.round}`;
	const noteB = await cloudNote(devB);
	A(noteB && noteB.includes(want), `and says where it came from: "${want}"`, noteB);
	await shot(devB, 'runsync-continue-desktop.png');
	await devB.page.setViewport(PHONE);
	A(await boot(devB, 'rsync') && (await cloudNote(devB) || '').includes(want), 'the same prompt at phone size');
	await shot(devB, 'runsync-continue-phone.png');
	await devB.page.setViewport(DESKTOP);
	A(await boot(devB, 'rsync'), 'device B back at desktop size');
	await clickContinue(devB);
	A(await onTable(devB), 'device B continues it');
	const vB = await view(devB);
	A(JSON.stringify(vB) === JSON.stringify(vA), 'B is exactly where A left off (seed, ante, round, state, money, jokers)', JSON.stringify([vA, vB]));
	A(JSON.stringify(await local(devB)) === JSON.stringify(runA), 'and B now saves it locally too', JSON.stringify(await local(devB)));
	const badB = await playFx(devB, SEL[3], SEL[4]);
	A(!badB, 'B plays on (another round)', JSON.stringify(badB));
	A(await synced(devB, 'rsync'), 'the account follows B', JSON.stringify(runRow('rsync').run && runRow('rsync').run.progress));
	const runB = await local(devB), vB2 = await view(devB);
	A(runB.n > runA.n && runRow('rsync').run.device && runRow('rsync').run.device.id === (await devB.page.evaluate(() => JSON.parse(localStorage.getItem('micatro_device_v1')).id)), 'the stored copy is B\'s (further along, B\'s device)', JSON.stringify(runB));
	await park(devB);

	// ===== 3. A reloads: B's further-along state =====
	A(await boot(devA, 'rsync'), 'device A reloads');
	const want3 = `Continue run from another device: Ante ${vB2.ante} · Round ${vB2.round}`;
	A((await cloudNote(devA) || '').includes(want3), `A (behind) is offered B's further-along run: "${want3}"`, await cloudNote(devA));
	await clickContinue(devA);
	A(await onTable(devA), 'A continues it');
	const vA2 = await view(devA);
	A(JSON.stringify(vA2) === JSON.stringify(vB2) && JSON.stringify(await local(devA)) === JSON.stringify(runB), 'A now has B\'s state (every move)', JSON.stringify([vA2, vB2, await local(devA)]));
	const bkA = await backup(devA);
	A(bkA && bkA.id === runA.id && bkA.n === runA.n && /further along/.test(bkA.reason), 'A\'s own older copy was backed up first', JSON.stringify(bkA));
	await park(devA);

	// ===== 4. a win on B clears the account's run =====
	A(await boot(devB, 'rsync') && !(await cloudNote(devB)), 'device B reloads: its run is the same as the account\'s');
	await clickContinue(devB);
	A(await onTable(devB), 'B continues');
	const mark4 = apiCalls.length;
	await winNow(devB);
	A(await waitFor(() => devB.page.evaluate(() => !!document.querySelector('.go-modal') && window.__micatro.view().won), 20000), 'device B wins the run');
	A(await waitFor(() => runRow('rsync').run === null && (runRow('rsync').ended || []).some((e) => e.id === FXID && e.outcome === 'won'), 15000), 'the win clears the account\'s run (a "won" tombstone left)', JSON.stringify({ run: runRow('rsync').run && runRow('rsync').run.progress, ended: runRow('rsync').ended, calls: apiCalls.slice(mark4) }));
	await devB.page.evaluate(() => document.querySelector('.go-modal .b-mainmenu').click());
	A(await waitFor(() => devB.page.evaluate(() => !!document.querySelector('.menu-modal') && !document.querySelector('.b-continue')), 15000), 'B back at the menu: no Continue');
	await park(devB);
	A(await boot(devA, 'rsync'), 'device A reloads');
	A(!(await hasContinue(devA)), 'A shows no Continue for the won run');
	A(!(await local(devA)), 'A\'s stale copy is no longer its saved run...');
	const bkA2 = await backup(devA);
	A(bkA2 && bkA2.id === FXID && bkA2.n === runB.n && /finished on another device \(won\)/.test(bkA2.reason), '...it was moved to the backup slot, not wiped', JSON.stringify(bkA2));

	// ===== 5. two DIFFERENT runs =====
	A(await boot(devB, 'rsync'), 'device B at the menu (the account has no run)');
	A(await newRun(devA, { stake: 1 }), 'device A starts a new run X');
	await fewMoves(devA);
	A(await synced(devA, 'rsync'), 'run X is on the account');
	const runX = await local(devA);
	A(await newRun(devB, { stake: 2 }), 'device B (which has not seen X) starts its own run Y');
	await fewMoves(devB);
	const runY = await local(devB);
	A(await waitFor(() => devB.page.evaluate(async () => { const s = (await import('/micatro/js/ui/runsync.js')).runSyncState(); return !!(s && s.halted && s.halted.why === 'other'); }), 15000), 'B\'s push is refused: the account holds a different run');
	await sleep(500);
	A(runRow('rsync').run.id === runX.id && runRow('rsync').run.progress.actions === runX.n, 'run X is never overwritten', JSON.stringify(runRow('rsync').run && runRow('rsync').run.id));
	const toastB = await devB.page.evaluate(() => document.querySelector('.toast') ? document.querySelector('.toast').textContent : '');
	A(/different run in progress/.test(toastB), 'B is told (toast) its run stays on this device', toastB);
	A(await boot(devB, 'rsync'), 'device B reloads');
	A(/Two runs in progress/.test(await cloudNote(devB) || ''), 'the menu says there are two runs', await cloudNote(devB));
	await clickContinue(devB);
	A(await waitFor(() => devB.page.evaluate(() => !!document.querySelector('.run-choice .b-run-local') && !!document.querySelector('.run-choice .b-run-account')), 10000), 'Continue asks which run to continue');
	const choiceText = await devB.page.evaluate(() => document.querySelector('.run-choice').textContent.replace(/\u00a0/g, ' '));
	A(/On this device/.test(choiceText) && /From another device \(PC\)/.test(choiceText) && (choiceText.match(/Ante 1 · Round 1/g) || []).length === 2 && /3 moves/.test(choiceText), 'it shows both runs with where they are', choiceText.slice(0, 300));
	await shot(devB, 'runsync-choice-desktop.png');
	await devB.page.setViewport(PHONE);
	A(await boot(devB, 'rsync'), 'device B at phone size');
	await clickContinue(devB);
	A(await waitFor(() => devB.page.evaluate(() => !!document.querySelector('.run-choice .b-run-local')), 10000), 'the choice at phone size');
	await shot(devB, 'runsync-choice-phone.png');
	await devB.page.setViewport(DESKTOP);
	A(await boot(devB, 'rsync'), 'device B back at desktop size');
	A(JSON.stringify(await local(devB)) === JSON.stringify(runY) && runRow('rsync').run.id === runX.id, 'Back / reload changed nothing (both runs as they were)');
	await clickContinue(devB);
	await waitFor(() => devB.page.evaluate(() => !!document.querySelector('.run-choice .b-run-local')), 10000);
	await devB.page.evaluate(() => document.querySelector('.run-choice .b-run-local').click());
	A(await onTable(devB), 'B picks its own run Y');
	A((await view(devB)).seed === runY.id.split(':')[0], 'B is playing Y');
	const bkB = await backup(devB);
	A(bkB && bkB.id === runX.id && bkB.n === runX.n, 'the run not chosen (X) is backed up on B', JSON.stringify(bkB));
	A(await waitFor(() => runRow('rsync').run && runRow('rsync').run.id === runY.id, 15000) && runRow('rsync').ended.some((e) => e.id === runX.id && e.outcome === 'replaced'), 'the account now holds Y (X remembered as replaced, on the player\'s choice)', JSON.stringify(runRow('rsync').ended));
	A(await boot(devA, 'rsync'), 'device A (still holding X) reloads');
	A(/Two runs in progress/.test(await cloudNote(devA) || ''), 'A is asked too (never silently dropped)', await cloudNote(devA));
	await clickContinue(devA);
	await waitFor(() => devA.page.evaluate(() => !!document.querySelector('.run-choice .b-run-account')), 10000);
	await devA.page.evaluate(() => document.querySelector('.run-choice .b-run-account').click());
	A(await onTable(devA), 'A picks the other device\'s run (Y)');
	A((await view(devA)).seed === runY.id.split(':')[0] && (await local(devA)).id === runY.id, 'A is playing Y');
	const bkA3 = await backup(devA);
	A(bkA3 && bkA3.id === runX.id && bkA3.n === runX.n, 'A\'s X is backed up', JSON.stringify(bkA3));

	// ===== 5b. a hold-R restart (keyboard) ends the account's run too, so no other device offers it again =====
	const mark5 = apiCalls.length;
	await devA.page.keyboard.down('r'); await sleep(1400); await devA.page.keyboard.up('r');
	A(await waitFor(async () => (await local(devA)) && (await local(devA)).id !== runY.id, 15000), 'A holds R: a new run starts', JSON.stringify(await local(devA)));
	A(await waitFor(() => (runRow('rsync').ended || []).some((e) => e.id === runY.id && e.outcome === 'abandoned'), 15000), 'the restarted run is ended on the account ("abandoned" tombstone)', JSON.stringify({ run: runRow('rsync').run && runRow('rsync').run.id, ended: runRow('rsync').ended, calls: apiCalls.slice(mark5).map((c) => c.action) }));
	A(!(runRow('rsync').run && runRow('rsync').run.id === runY.id), 'and the account no longer holds it', JSON.stringify(runRow('rsync').run && runRow('rsync').run.id));

	// ===== 6. challenges completed on A show on B =====
	await devA.page.evaluate(async () => { (await import('/micatro/js/ui/screens.js')).markChallengeDone('rsync', 'c_omelette_1'); });
	A(await waitFor(() => (row('micatro_challenges:rsync') || { done: {} }).done.c_omelette_1 > 0, 15000), 'a challenge completed on A reaches the account', JSON.stringify(row('micatro_challenges:rsync')));
	A(await boot(devB, 'rsync'), 'device B reloads');
	A(await waitFor(() => devB.page.evaluate(async () => !!(await import('/micatro/js/ui/challengesync.js')).challengeDone('rsync').c_omelette_1), 15000), 'B has it');
	await devB.page.evaluate(() => document.querySelector('.b-challenges').click());
	A(await waitFor(() => devB.page.evaluate(() => !!document.querySelector('.ch-item[data-ch="c_omelette_1"] .ch-tick')), 20000), 'B\'s Challenges screen ticks it');
	A(!(await devB.page.evaluate(() => !!document.querySelector('.ch-item[data-ch="c_medusa_1"] .ch-tick'))), '(and only it)');
	await devA.ctx.close();
	await devB.ctx.close();

	// ===== 7. guest carry-over =====
	const devG = await device('G');
	A(await boot(devG, null), 'device G: a guest');
	const c0 = apiCalls.length;
	A(await newRun(devG, { stake: 1 }), 'the guest starts a run');
	await fewMoves(devG);
	await devG.page.evaluate(async () => { (await import('/micatro/js/ui/screens.js')).markChallengeDone(null, 'c_city_1'); });
	await sleep(1500);
	const runG = await local(devG);
	A(runG && runG.n > 0, 'the guest\'s run is saved locally', JSON.stringify(runG));
	A(apiCalls.slice(c0).length === 0, 'a guest never calls the account API', JSON.stringify(apiCalls.slice(c0)));
	A(await boot(devG, 'rsnew'), 'the guest signs in to a fresh account');
	A(await waitFor(() => runRow('rsnew').run && runRow('rsnew').run.id === runG.id && runRow('rsnew').run.progress.actions === runG.n, 15000), 'the guest\'s run is carried into the account (it had none)', JSON.stringify(runRow('rsnew').run && runRow('rsnew').run.progress));
	A(await hasContinue(devG) && !(await cloudNote(devG)), 'Continue offers it as this device\'s run');
	A(await waitFor(() => (row('micatro_challenges:rsnew') || { done: {} }).done.c_city_1 > 0, 15000), 'the guest\'s completed challenge is carried too');
	await devG.ctx.close();
	const devH = await device('H');
	A(await boot(devH, null) && await newRun(devH, { stake: 1 }), 'another guest starts a run');
	await fewMoves(devH);
	const runH = await local(devH);
	const before = JSON.stringify(runRow('rsync').run && { id: runRow('rsync').run.id, n: runRow('rsync').run.progress.actions });
	A(await boot(devH, 'rsync'), 'and signs in to an account that already has a run');
	await sleep(1500);
	A(JSON.stringify(runRow('rsync').run && { id: runRow('rsync').run.id, n: runRow('rsync').run.progress.actions }) === before, 'the account\'s run is not overwritten', before);
	A(/Two runs in progress/.test(await cloudNote(devH) || ''), 'the player is asked instead', await cloudNote(devH));
	await clickContinue(devH);
	A(await waitFor(() => devH.page.evaluate(() => !!document.querySelector('.run-choice .b-run-local')), 10000), 'Continue shows the choice');
	A(JSON.stringify(await local(devH)) === JSON.stringify(runH), 'the guest\'s run is still saved locally');
	const errs = [...devH.errors];
	await devH.ctx.close();

	const allPuts = apiCalls.filter((c) => c.action === 'micatro-run-put');
	console.log(`  (run puts: ${allPuts.length} sent, ${allPuts.filter((c) => c.wrote).length} written; clears: ${apiCalls.filter((c) => c.action === 'micatro-run-clear').length})`);
	A(errs.length === 0 && devA.errors.length === 0 && devB.errors.length === 0 && devG.errors.length === 0, 'no page errors', [...devA.errors, ...devB.errors, ...devG.errors, ...errs].join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
