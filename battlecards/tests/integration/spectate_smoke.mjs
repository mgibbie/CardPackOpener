// spectate_smoke.mjs — boots index.html?spectate=<friend> against a stubbed
// /api/mp that serves one cardstate snapshot, and verifies the spectator
// experience: the board renders read-only, the chat has NO input/emote controls
// (spectators are read-only), and the "Flip view" button switches which player
// you watch from (HUMAN).
//
// Standalone (needs headless Chrome + the WebGL swiftshader flags). NOT in run-all.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const BC = path.resolve(HERE, '../..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8881;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(200); } return false; }

(async () => {
	// build one real 2-player snapshot the stub will serve as the friend's board
	const E = await import('../../engine/index.js');
	const cardsData = JSON.parse(readFileSync(path.join(BC, 'cards.json')));
	const cardsById = {}; for (const c of cardsData.cards) cardsById[c.id] = c;
	const gs = E.createGame(cardsById, E.seededRng(31337), null, 2, null);
	const snapshot = JSON.parse(JSON.stringify(E.toSnapshot(gs)));
	const csPayload = { snapshot, mode: 'dungeon', label: 'Fight 1/8', room: 'u:friendx', seq: 1, ts: Date.now(), watchers: 1 };

	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let b = ''; req.on('data', d => b += d); req.on('end', () => {
				let body = {}; try { body = JSON.parse(b); } catch {}
				let out = { ok: true };
				if (body.action === 'cardstate') out = { ...csPayload, ts: Date.now() };
				else if (body.action === 'chat-get') out = { messages: [], now: Date.now() };
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
		await page.evaluateOnNewDocument(tok => localStorage.setItem('magepunk_mp_token_v1', tok), 'spectate-token');
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?spectate=friendx&mp=1`, { waitUntil: 'domcontentloaded' });

		const rendered = await waitFor(() => page.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players && window.__game.state.players.length === 2)), 30000);
		A(rendered, 'the spectator boots and renders the friend\'s 2-player board');

		// read-only chat: the panel exists but has NO input and NO emote buttons
		const chat = await waitFor(() => page.evaluate(() => !!document.querySelector('#mp-chat')), 8000);
		A(chat, 'the chat panel mounted for the spectator');
		const chatControls = await page.evaluate(() => ({ input: !!document.querySelector('#mp-chat .mc-input'), emotes: document.querySelectorAll('#mp-chat .mc-em').length }));
		A(chatControls.input === false && chatControls.emotes === 0, 'the spectator chat is READ-ONLY (no input box, no emote buttons)', JSON.stringify(chatControls));

		// view switch: the button flips which player HUMAN sits at the bottom
		const hasBtn = await page.evaluate(() => !!document.querySelector('#spec-view'));
		A(hasBtn, 'the "Flip view" button is present');
		const before = await page.evaluate(() => window.__game.HUMAN);
		await page.click('#spec-view');
		await sleep(250);
		const after = await page.evaluate(() => window.__game.HUMAN);
		A(before === 0 && after === 1, 'clicking Flip view switches the watched player (HUMAN 0 → 1)', `${before} → ${after}`);
		await page.click('#spec-view');
		await sleep(250);
		A(await page.evaluate(() => window.__game.HUMAN) === 0, 'flipping again cycles back to player 0');

		A(errors.filter(e => !/Failed to load resource|Script error|WebGL|GL_|texture|CORS/i.test(e)).length === 0, 'no uncaught client errors while spectating', errors.slice(0, 4).join(' | '));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
