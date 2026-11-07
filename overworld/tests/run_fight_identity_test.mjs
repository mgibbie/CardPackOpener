// run_fight_identity_test.mjs — a run's mid-fight board belongs to ONE fight, and it survives the
// tab going away (Battlecards, Middle-earth run, in a real browser).
//
// 1. instinctgauntlet, 2026-11-07 (Samwise run rmw5py6mqpfdl85): "Continue the run" restored a
//    fight-1 board vs Shagrat (turn 5) while the run said 0 wins / 2 losses, next foe Tom, Bert &
//    William. The run has ONE snapshot field and every open tab writes its board into it on
//    visibilitychange/pagehide; a tab still holding F1 wrote it back after the run moved on, and
//    each resume re-stamped it fresh. Now a fight boot mints run.fightId, a tab whose fight is no
//    longer the run's current one may not write, and a resume never restores another fight's board
//    (it is stashed at <key>__stale_snapshot_v1 and the current fight boots).
// 2. instinctgauntlet, 2026-11-04: the close-time push of a mid-fight run (~150KB) went as a keepalive
//    request, whose body the browser caps at 64KB: rejected, swallowed, and the other device restarted
//    the fight at turn 1. Now a gzip-packed copy is kept ready and the close sends that.
//
//   node overworld/tests/run_fight_identity_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import zlib from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9171;
const KEY = 'magepunk_middleearth_v1';
const STATE = { username: 'fightid', friendCode: 'FGHTID', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the server: records every run-save it receives (the packed ones unpacked)
const saves = [];
const unpack = code => { const b = Buffer.from(code.slice(3).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); return JSON.parse(code.startsWith('G1.') ? zlib.gunzipSync(b).toString() : b.toString()); };
const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let j = {}; try { j = JSON.parse(body); } catch { /* ignore */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			if (j.action === 'run-save') {
				let run = j.run; try { if (!run && j.packed) run = unpack(j.packed); } catch { run = null; }
				saves.push({ bytes: body.length, packed: !!j.packed, run });
				res.end(JSON.stringify({ ok: true })); return;
			}
			if (j.action === 'run-load') { res.end(JSON.stringify({ runs: {} })); return; }
			res.end(JSON.stringify({ ok: true, state: STATE })); return;
		}
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

// the run, built with the game's own module
const Middleearth = await import(pathToFileURL(path.join(ROOT, 'battlecards/middleearth.js')).href);
const byId = {}; for (const c of JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards/cards.json'), 'utf8')).cards) byId[c.id] = c;
const HERO = 'Samwise', F1 = 'Shagrat', F3 = 'Tom, Bert & William';
const seedRun = { active: true, runId: 'rFightId1', rev: 1, updatedAt: Date.now(), characterId: HERO, cls: Middleearth.classOf(HERO), deck: Middleearth.deckOf(byId, HERO), anomaly: null, wins: 0, losses: 0, enemy: Middleearth.generateEnemy(byId, F1) };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, key, run) => {
		localStorage.setItem('magepunk_mp_token_v1', 'fightid'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem(key, JSON.stringify(run)); }
		// every keepalive request the page makes: its size (the browser refuses bodies over 64KB)
		const f = window.fetch; window.__ka = [];
		window.fetch = function (u, o) { if (o && o.keepalive) window.__ka.push({ bytes: String(o.body || '').length }); return f.apply(this, arguments); };
	}, STATE, KEY, seedRun);
	const run = () => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
	const setRun = r => page.evaluate((k, v) => localStorage.setItem(k, JSON.stringify(v)), KEY, r);
	const inFight = () => page.evaluate(() => { const s = window.__game?.state; return !!(s && s.players && s.players.length === 2 && !s.over); }).catch(() => false);
	const foe = () => page.evaluate(() => window.__game?.state?.classPicks?.[1]?.name || null).catch(() => null);
	const openAndContinue = async (reload) => {
		if (reload) await page.reload({ waitUntil: 'domcontentloaded' });
		else await page.goto(`http://localhost:${PORT}/battlecards/index.html?middleearth=1`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 40; i++) {
			await sleep(500);
			if (await inFight()) return true;
			await page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); if (!o || getComputedStyle(o).display === 'none') return; const b = [...o.querySelectorAll('button')].find(x => /^Continue/i.test(x.textContent.trim())); if (b) b.click(); }).catch(() => {});
		}
		return false;
	};
	const waitFor = async (fn, n = 30) => { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await sleep(300); } return null; };

	// ===== the fight boots and its board is saved, tagged with the fight =====
	A(await openAndContinue(false), 'the run\'s fight 1 boots');
	A(await foe() === F1, `...against ${F1}`, await foe());
	const r1 = await waitFor(async () => { const r = await run(); return r && r.snapshot ? r : null; });
	A(r1 && r1.snapshotFight === r1.fightId && r1.snapshotProgress === 0, 'the board is saved onto the run, tagged with the fight it belongs to', JSON.stringify(r1 && { f: r1.fightId, sf: r1.snapshotFight, sp: r1.snapshotProgress }));
	const f1Board = r1 && r1.snapshot;

	// ===== 1a. a tab whose fight is no longer the run's current one can't write its board =====
	await setRun({ ...r1, fightId: 'fSomeOtherTab', snapshot: { marker: 'the other tab\'s board' }, rev: r1.rev + 5 });
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	await sleep(300);
	const r2 = await run();
	A(r2 && r2.snapshot && r2.snapshot.marker === 'the other tab\'s board', '1. a stale tab does NOT write its old board over the run (pagehide)', JSON.stringify(r2 && r2.snapshot).slice(0, 80));
	A(await page.evaluate(() => /moved on/.test(document.getElementById('banner')?.textContent || '')), '1. ...and says so (reload to continue)');

	// ===== 1b. the reported save: two fights later, the run still holds the F1 board (untagged) =====
	await setRun({ ...r1, losses: 2, enemy: Middleearth.generateEnemy(byId, F3), snapshot: f1Board, fightId: undefined, snapshotFight: undefined, snapshotProgress: undefined, rev: r1.rev + 10 });
	A(await openAndContinue(true), '1. "Continue the run" on the reported save starts a fight');
	A(await foe() === F3, `1. ...the CURRENT fight, against ${F3} — not the stale F1 board against ${F1}`, await foe());
	const stash = await page.evaluate(k => JSON.parse(localStorage.getItem(k + '__stale_snapshot_v1') || 'null'), KEY);
	A(stash && stash.snapshot && stash.snapshot.classPicks?.[1]?.name === F1 && stash.reason === 'other-enemy', '1. the stale board is put aside (recoverable), not silently dropped', JSON.stringify(stash && { reason: stash.reason }));
	const r3 = await waitFor(async () => { const r = await run(); return r && r.snapshot && r.snapshot.classPicks?.[1]?.name === F3 ? r : null; });
	A(r3 && r3.losses === 2 && r3.snapshotFight === r3.fightId, '1. the run keeps its record and now saves the F3 board', JSON.stringify(r3 && { l: r3.losses }));

	// ===== 1c. a frame-exact resume of the current fight is untouched =====
	const turnBefore = r3 && r3.snapshot.turnNumber;
	A(await openAndContinue(true), '1. a reload continues the run');
	A(await foe() === F3 && await page.evaluate(() => window.__game.state.turnNumber) === turnBefore, '1. ...resuming the SAME F3 board (frame-exact)', await foe());

	// ===== 2. the close-time hand-off of a big mid-fight run =====
	const live = await waitFor(async () => { const r = await run(); return r && r.snapshot ? r : null; });
	// a late-fight run: pad it well past the 64KB keepalive cap, as a long fight's board is
	const pad = []; for (let i = 0; i < 1500; i++) pad.push({ uid: 9000 + i, id: 'pad_' + i, note: 'late-fight board entry ' + i + ' ' + (i * 7919 % 1000) });
	await setRun({ ...live, rev: live.rev + 1, _pad: pad });
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));   // writes the board (new rev) and packs it
	const big = await run();
	const bigBytes = JSON.stringify(big).length;
	A(bigBytes > 64 * 1024, `2. the mid-fight run is over the 64KB keepalive cap (${bigBytes}B)`);
	const packed = await waitFor(() => page.evaluate(rev => { const p = window.__game.runHandoff?.packed; return p && p.rev === rev ? p.code.length : 0; }, big.rev), 15);
	A(packed > 0 && packed < 60000, `2. a packed copy of it is kept ready (${packed}B)`);
	saves.length = 0;
	await page.evaluate(() => { window.__ka.length = 0; window.dispatchEvent(new Event('pagehide')); });   // the tab closes
	const got = await waitFor(() => saves.find(s => s.run && s.run.snapshot && s.run.rev === big.rev) || null);
	const ka = await page.evaluate(() => window.__ka.slice());
	A(ka.length > 0 && ka.every(k => k.bytes < 64 * 1024), '2. every keepalive request the close makes fits the browser\'s 64KB cap', JSON.stringify(ka));
	A(got && got.packed && got.run.snapshot.classPicks?.[1]?.name === F3 && got.run.snapshot.turnNumber === big.snapshot.turnNumber, '2. the server receives the run WITH its mid-fight board (a cross-device resume continues the fight)', JSON.stringify(saves.map(s => ({ b: s.bytes, p: s.packed, snap: !!(s.run && s.run.snapshot) }))));
	const log = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_run_push_log_v1') || '[]'));
	A(log.some(e => e.ev === 'packed' && e.bytes > 64 * 1024), '2. the hand-off is logged (event, size, packed)', JSON.stringify(log.slice(-2)));
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
	await ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
