// dungeon_resume_test.mjs — END-TO-END proof that a dungeon run resumes the EXACT
// mid-fight board after a hard tab-close, even when the server never received the
// snapshot (the real-world failure keepLocalRun() targets).
//
// Flow: boot a real dungeon, pick class + no-anomaly, keep the opening hand
// (capture INITIAL turn-1 board), play two full turn cycles (capture BEFORE),
// fire pagehide so the server gets a snapshot-LESS metadata push (simulating the
// hard close where the keepalive push is stripped), reload, click Continue, then
// assert the resumed board == BEFORE (exact restore) and != INITIAL (not turn 1).
//   node battlecards/tests/integration/dungeon_resume_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8921;
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

const capture = `(() => {
	const g = window.__game, s = g.state, H = g.HUMAN;
	const uids = z => (z || []).map(c => c.uid);
	return {
		turn: s.turnNumber ?? null, current: s.current, over: !!s.over,
		myHand: uids(s.players[H].hand), myBoard: uids(s.players[H].board),
		oppBoard: uids(s.players[1 - H].board),
		myLife: s.players[H].life, myMana: s.players[H].mana ? s.players[H].mana.cur : null,
		myDeck: [...(s.players[H].deck || [])], deckLen: (s.players[H].deck || []).length,
	};
})()`;

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
async function myTurnReady(page) {
	// #end-turn is position:fixed (offsetParent is null), so gate on disabled + turn only
	return waitFor(() => page.evaluate(() => {
		const g = window.__game; const et = document.getElementById('end-turn');
		return !!(g && g.state && !g.state.over && g.state.current === g.HUMAN && et && !et.disabled);
	}), 30000);
}
async function endMyTurn(page) {
	if (!await myTurnReady(page)) return false;
	await page.evaluate(() => document.getElementById('end-turn').click());
	// AI takes over, then control returns to me (a full cycle — turn-semantics agnostic)
	await waitFor(() => page.evaluate(() => { const g = window.__game; return g.state && (g.state.current !== g.HUMAN || g.state.over); }), 15000);
	await waitFor(() => page.evaluate(() => { const g = window.__game; return g.state && (g.state.current === g.HUMAN || g.state.over); }), 30000);
	return true;
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
		const page = await browser.newPage();
		await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
		const errs = [];
		page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
		}, STATE);
		const URL = `http://localhost:${PORT}/battlecards/index.html?dungeon=1`;

		// ── first boot: drive the run into a live fight ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, '#dungeon-overlay', null), 'class pick appears — chose a class');
		A(await clickInOverlay(page, '#dungeon-overlay', 'No anomaly'), 'anomaly pick appears — chose standard run');
		// dungeon may or may not offer a mulligan — dismiss it if it shows, else the fight starts directly
		if (await clickInOverlay(page, '#scry-modal', 'Keep hand', 8000)) { await overlayHidden(page, '#scry-modal'); console.log('note: kept the opening hand'); }
		else console.log('note: no mulligan overlay — fight starts directly');
		const inFight = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 20000);
		A(inFight, 'the dungeon fight is live', errs.slice(0, 2));
		if (!inFight) throw new Error('never reached a live fight');

		await myTurnReady(page); // settle to my first turn
		const initial = await page.evaluate(capture); // opening board
		A(await endMyTurn(page), 'played through a full turn cycle');
		const before = await page.evaluate(capture);
		A(!before.over, 'still mid-fight after advancing turns');
		A(JSON.stringify(before) !== JSON.stringify(initial), 'the board actually advanced past the opening deal', { initialTurn: initial.turn, beforeTurn: before.turn });

		// local snapshot must exist (written synchronously every settled frame)
		const localHasSnap = await page.evaluate(k => { try { return !!(JSON.parse(localStorage.getItem(k) || '{}').snapshot); } catch { return false; } }, RUN_KEY);
		A(localHasSnap, 'localStorage holds a mid-fight snapshot');

		// ── simulate the hard close: pagehide fires the final push; the server strips
		//    the snapshot (models the push that never fully lands), leaving it behind ──
		await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
		await sleep(600); // let the async run-save reach the stub
		A(!!storedRuns[RUN_KEY] && !storedRuns[RUN_KEY].run.snapshot, 'the server copy is snapshot-less (behind, as after a hard close)', storedRuns[RUN_KEY] && Object.keys(storedRuns[RUN_KEY].run));

		// ── reopen the page (localStorage persists; the server would clobber it pre-fix) ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, '#dungeon-overlay', 'Continue'), 'reopen offers "Continue level N" (run detected)');
		const resumed = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players)); }), 20000);
		A(resumed, 'the fight came back after reopen');
		const after = await page.evaluate(capture);

		// ── the guarantees ──
		A(JSON.stringify(after) === JSON.stringify(before), 'RESUMED BOARD == pre-close board (exact restore)', { before, after });
		A(JSON.stringify(after) !== JSON.stringify(initial), 'resume did NOT drop to the turn-1 opening deal', { initialTurn: initial.turn, afterTurn: after.turn });
		A(after.turn === before.turn, 'turn number preserved', { before: before.turn, after: after.turn });
		A(after.myHand.join(',') === before.myHand.join(','), 'your hand (cards + uids) preserved');
		A(after.myDeck.join(',') === before.myDeck.join(','), 'your deck order preserved');

		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
