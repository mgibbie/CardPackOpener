// async_resume_test.mjs — a long correspondence (async) match must resume the EXACT
// mid-turn point after a close, not just the start of your turn.
//
// Async matches are server-authoritative and only publish at TURN END, so the server
// only ever holds your turn's STARTING board. The client now also keeps a LOCAL mid-turn
// snapshot; on reopen useLocalAsyncTurn() restores it (same match + same unsubmitted turn)
// and resumePendingChoices() re-opens any scry/Discover it was frozen on.
//
// The harness stubs the relay: async-get returns a real engine snapshot (the turn START),
// and we assert that after injecting a mid-turn scry + closing, the reopen restores the
// mid-turn board (scry present) rather than the pristine server turn-start.
//   node battlecards/tests/integration/async_resume_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8925;
const MATCH_ID = 'M1';
const ASNAP_KEY = 'magepunk_async_snap_v1:' + MATCH_ID;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }
const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', decks: [], collection: {}, stats: { chars: {} } };

// build a REAL "start of my turn" snapshot with the engine (my seat = 0)
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards', 'cards.json'), 'utf8'));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
const st = E.createGame(byId, seededRng(42), Array.from({ length: 30 }, () => 'chillwind_yeti'), 2, [{ id: 'mage', name: 'mgibbie', power: null }, { id: 'mage', name: 'rival', power: null }]);
st.classPicks = [{ id: 'mage', name: 'mgibbie' }, { id: 'mage', name: 'rival' }];
E.resetDeckAndHand(st, 1, Array.from({ length: 30 }, () => 'bloodfen_raptor'));
E.drawCards(st, 1, 4);
st.current = 0; st.turnNumber = 3; // mid-match, my turn just began
const SERVER_SNAP = JSON.parse(JSON.stringify(E.toSnapshot(st)));
const MATCH = { id: MATCH_ID, players: ['mgibbie', 'rival'], status: 'active', snap: SERVER_SNAP, decks: [], lines: [], winner: null };

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			if (msg.action === 'async-get') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ match: MATCH, you: 0 })); return; }
			if (msg.action === 'async-move') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, match: MATCH })); return; }
			res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return;
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
		await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'mgibbie'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_username', 'mgibbie'); }, STATE);
		const URL = `http://localhost:${PORT}/battlecards/index.html?async=${MATCH_ID}`;

		// ── boot the correspondence match; it's my turn (from the server turn-start snapshot) ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		const live = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over && g.state.current === g.HUMAN); }), 30000);
		A(live, 'the async match loaded on my turn', errs.slice(0, 3));
		if (!live) throw new Error('async match did not load');
		const start = await page.evaluate(() => ({ turn: window.__game.state.turnNumber, scry: window.__game.state.scryQueue.length }));
		A(start.turn === 3 && start.scry === 0, 'loaded the server turn-start (turn 3, no pending choice)', start);

		// ── act mid-turn: a scry is now pending; close the tab ──
		await page.evaluate(() => { const s = window.__game.state, H = window.__game.HUMAN; s.scryQueue.push({ chooser: H, deckOwner: H, ids: [s.players[H].deck[0] || Object.keys(s.cardsById)[0]] }); });
		await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); // saves the LOCAL mid-turn snapshot
		await sleep(400);
		const savedLocal = await page.evaluate(k => { try { const o = JSON.parse(localStorage.getItem(k)); return !!(o && o.snap && o.snap.scryQueue.length > 0 && o.turnNumber === 3); } catch { return false; } }, ASNAP_KEY);
		A(savedLocal, 'the mid-turn (with the pending scry) was saved locally');

		// ── reopen: the server still only has the turn-start; the local mid-turn must win ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		const back = await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players)); }), 30000);
		A(back, 'the match came back after reopen');
		const after = await page.evaluate(() => ({ turn: window.__game.state.turnNumber, scry: window.__game.state.scryQueue.length, modal: (() => { const m = document.getElementById('scry-modal'); return !!m && getComputedStyle(m).display !== 'none'; })() }));
		A(after.turn === 3, 'resumed the same turn');
		A(after.scry > 0, 'the in-progress turn was restored (pending scry present, not the pristine server start)', after);
		A(after.modal, 'the SCRY modal re-opened after the mid-turn resume (no soft-lock)');

		// and it resolves cleanly
		await page.evaluate(() => { const b = [...document.querySelectorAll('#scry-modal button')].find(x => x.textContent.trim().toLowerCase().includes('done')); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
		A(await waitFor(() => page.evaluate(() => window.__game.state.scryQueue.length === 0), 8000), 'the resumed async scry resolves cleanly');

		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
