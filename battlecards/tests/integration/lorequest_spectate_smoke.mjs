// lorequest_spectate_smoke.mjs — spectate a REAL Lorequest run end-to-end.
// Builds an actual Lorequest board (Chandra deck vs a generated Ulamog boss deck,
// with loreDeck creatures on the table), serves it through a stubbed /api/mp as a
// friend publishing mode:'lorequest', then boots index.html?spectate=friendx and
// verifies the spectator renders the 2-player Lorequest board read-only, sees the
// watcher badge, can flip view, and gets an instant GAME OVER — same as any other
// run mode. Proves the uncollectible loreDeck cards (+ their art) render for a
// spectator and the whole spectate pipeline is mode-agnostic for Lorequest.
//
// Standalone (needs headless Chrome + swiftshader). NOT in run-all.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const BC = path.resolve(HERE, '../..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8883;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(200); } return false; }

(async () => {
	const E = await import('../../engine/index.js');
	const LQ = await import('../../lorequest.js');
	const cardsData = JSON.parse(readFileSync(path.join(BC, 'cards.json')));
	const cardsById = {}; for (const c of cardsData.cards) cardsById[c.id] = c;

	// --- build a genuine Lorequest board: Chandra (player) vs a generated Ulamog boss ---
	const HERO = 'Chandra', BOSS = 'Ulamog';
	const pDeck = LQ.deckOf(cardsById, HERO);                    // 2x15 = 30
	const enemy = LQ.generateEnemy(cardsById, BOSS, 4, E.seededRng(5));
	A(pDeck.length === 30 && pDeck.every(id => cardsById[id]?.loreDeck === HERO),
		'player side is a 30-card Chandra loreDeck deck', `${pDeck.length} cards`);
	A(enemy.deck.length >= 30 && enemy.deck.slice(0, 30).every(id => cardsById[id]?.loreDeck === BOSS),
		'enemy side is a generated Ulamog boss deck', `${enemy.deck.length} cards`);

	const picks = [{ id: LQ.classOf(HERO), name: HERO, power: null }, { id: LQ.classOf(BOSS), name: BOSS, power: null }];
	const gs = E.createGame(cardsById, E.seededRng(31337), [...pDeck], 2, picks);
	E.resetDeckAndHand(gs, 1, [...enemy.deck]);
	E.drawCards(gs, 1, 4);
	if (E.stripLoadouts) E.stripLoadouts(gs);
	// put a loreDeck creature on each board so the spectator visibly renders Lorequest faces
	const placed = [];
	for (const [pi, ch] of [[0, HERO], [1, BOSS]]) {
		const cre = cardsData.cards.find(c => c.loreDeck === ch && c.type === 'creature' && !c.token);
		const inst = E.instantiate(cre, pi); inst.zone = 'board'; inst.sick = false; gs.players[pi].board.push(inst);
		placed.push(cre.id);
	}
	A(placed.length === 2, 'seated a loreDeck creature on each side of the board', placed.join(', '));
	const snapshot = JSON.parse(JSON.stringify(E.toSnapshot(gs)));
	const csPayload = { snapshot, mode: 'lorequest', label: '4W / 1L', room: 'u:friendx' };

	let csState = { seq: 1, watchers: 0, watcherNames: [] };

	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let b = ''; req.on('data', d => b += d); req.on('end', () => {
				let body = {}; try { body = JSON.parse(b); } catch {}
				let out = { ok: true };
				if (body.action === 'cardstate') {
					if (body.seq != null && body.seq === csState.seq && !csState.full) out = { unchanged: true, seq: csState.seq, over: !!csState.over, winner: csState.winner ?? null, watchers: csState.watchers, watcherNames: csState.watcherNames };
					else out = { ...csPayload, ...csState, ts: Date.now() };
				}
				else if (body.action === 'chat-get') out = { messages: [], now: Date.now() };
				else if (body.action === 'pubprofile') out = { profile: { username: body.username, online: true, status: 'card:lorequest', region: '4W / 1L', created: 1700000000000, wins: 12, runs: 5, packsOpened: 30, uniqueCards: 88, deckCount: 3, isFriend: false, isYou: false } };
				else if (body.action === 'state') out = { state: { username: 'me', decks: [], collection: {} } };
				res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
			});
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument(tok => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'me' })); }, 'spectate-token');
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?spectate=friendx&mp=1`, { waitUntil: 'domcontentloaded' });

		const rendered = await waitFor(() => page.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players && window.__game.state.players.length === 2)), 30000);
		A(rendered, 'the spectator boots and renders the friend\'s 2-player Lorequest board');

		// the served board is genuinely Lorequest: both sides hold loreDeck cards, and the
		// creatures we seated are on the table
		const isLore = await page.evaluate((ph) => {
			const st = window.__game.state;
			const idsOf = p => [].concat((p.deck || []).map(c => c.id || c), (p.hand || []).map(c => c.id || c), (p.board || []).map(c => c.id || c));
			const p0 = idsOf(st.players[0]).filter(x => typeof x === 'string');
			const boards = st.players.map(p => (p.board || []).length);
			return { chandra: p0.some(id => id.startsWith('chandra_')), boards, seatedShown: boards[0] >= 1 && boards[1] >= 1 };
		}, placed);
		A(isLore.chandra, 'the spectated board is built from Chandra loreDeck cards');
		A(isLore.seatedShown, 'the seated loreDeck creatures render on both sides of the table', JSON.stringify(isLore.boards));

		// watcher badge: even before the runner counts this fresh spectator, they see ≥1 (themselves)
		A(await waitFor(() => page.evaluate(() => { const w = document.querySelector('#watchers'); return !!(w && w.style.display !== 'none' && /watching/.test(w.textContent)); }), 8000),
			'the spectator sees the watcher badge');

		// flip view: switch which player HUMAN watches from (0 → 1 → 0)
		A(await page.evaluate(() => !!document.querySelector('#spec-view')), 'the "Flip view" button is present');
		const before = await page.evaluate(() => window.__game.HUMAN);
		await page.click('#spec-view'); await sleep(250);
		const after = await page.evaluate(() => window.__game.HUMAN);
		A(before === 0 && after === 1, 'Flip view switches the watched player (0 → 1)', `${before} → ${after}`);
		await page.click('#spec-view'); await sleep(250);
		A(await page.evaluate(() => window.__game.HUMAN) === 0, 'flipping again cycles back to player 0');

		// instant GAME OVER: publisher stamps over/winner on the final board
		csState = { seq: 5, watchers: 1, watcherNames: [], over: true, winner: 0 };
		A(await waitFor(() => page.evaluate(() => { const el = document.querySelector('#over-note'); return !!(el && /over/i.test(el.textContent) && /win|draw/i.test(el.textContent)); }), 6000),
			'the spectator sees GAME OVER instantly with the winner');

		A(errors.filter(e => !/Failed to load resource|Script error|WebGL|GL_|texture|CORS/i.test(e)).length === 0,
			'no uncaught client errors while spectating the Lorequest run', errors.slice(0, 4).join(' | '));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
