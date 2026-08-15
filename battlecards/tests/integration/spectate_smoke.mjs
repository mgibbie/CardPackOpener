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
	const csPayload = { snapshot, mode: 'dungeon', label: 'Fight 1/8', room: 'u:friendx' };
	// mutable: starts with watchers:0 (this fresh spectator not counted yet), then gains named watchers on a new seq
	let csState = { seq: 1, watchers: 0, watcherNames: [] };
	const chatPosts = []; // every chat-post the client makes
	const chatRooms = {}; // room -> [messages], so posts echo back on chat-get and render

	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let b = ''; req.on('data', d => b += d); req.on('end', () => {
				let body = {}; try { body = JSON.parse(b); } catch {}
				let out = { ok: true };
				if (body.action === 'cardstate') out = { ...csPayload, ...csState, ts: Date.now() };
				else if (body.action === 'chat-get') out = { messages: (chatRooms[body.room] || []).filter(m => m.ts > (body.since || 0)), now: Date.now() };
				else if (body.action === 'chat-post') { chatPosts.push(body); (chatRooms[body.room] = chatRooms[body.room] || []).push({ from: 'watcher', text: body.text || '', emote: body.emote || null, ts: Date.now() }); out = { ok: true }; }
				else if (body.action === 'pubprofile') out = { profile: { username: body.username, online: true, status: 'card:dungeon', region: 'Fight 2/8', created: 1700000000000, wins: 12, runs: 5, packsOpened: 30, uniqueCards: 88, deckCount: 3, isFriend: false, isYou: false } };
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
		A(rendered, 'the spectator boots and renders the friend\'s 2-player board');

		// (a) even before the runner counts this fresh spectator (watchers:0), they see "1 watching" (themselves)
		const watcherBadge = await waitFor(() => page.evaluate(() => { const w = document.querySelector('#watchers'); return !!(w && w.style.display !== 'none' && /1 watching/.test(w.textContent)); }), 8000);
		A(watcherBadge, 'the spectator sees the watcher count (≥1, themselves) even before the runner counts them', await page.evaluate(() => { const w = document.querySelector('#watchers'); return w ? `text=${w.textContent}` : 'no #watchers'; }));
		// (b) once the runner publishes named watchers, the spectator sees WHO is watching ('me' shown as "you")
		csState = { seq: 2, watchers: 2, watcherNames: ['coolfriend', 'me'] };
		const seesNames = await waitFor(() => page.evaluate(() => { const t = document.querySelector('#watchers')?.textContent || ''; return /2 watching/.test(t) && /coolfriend/.test(t) && /you/.test(t); }), 8000);
		A(seesNames, 'the spectator sees WHO is watching by name (self shown as "you")', await page.evaluate(() => document.querySelector('#watchers')?.textContent));
		// (c) clicking a watcher name opens their profile popup
		await page.click('#watchers .mpp-link'); // the first name (coolfriend)
		const profileShown = await waitFor(() => page.evaluate(() => { const el = document.querySelector('#mp-profile'); return !!(el && /coolfriend/i.test(el.textContent) && /wins/i.test(el.textContent) && el.querySelector('.mpp-add')); }), 5000);
		A(profileShown, 'clicking a watcher name opens their profile popup (name + stats + Add friend)');
		await page.evaluate(() => document.querySelector('#mp-profile')?.remove()); // close so it doesn't block later clicks

		// spectator chat: interactive (input + emote buttons), but emotes are PRIVATE and text goes to the spec room
		const chat = await waitFor(() => page.evaluate(() => !!document.querySelector('#mp-chat')), 8000);
		A(chat, 'the chat panel mounted for the spectator');
		const chatControls = await page.evaluate(() => ({ input: !!document.querySelector('#mp-chat .mc-input'), emotes: document.querySelectorAll('#mp-chat .mc-em').length }));
		A(chatControls.input && chatControls.emotes > 0, 'the spectator chat has an input + emote buttons', JSON.stringify(chatControls));
		// an emote is SHARED among spectators: it posts to the spectator-only room and renders 👁-tagged
		await page.click('#mp-chat .mc-em');
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('#mp-chat .mc-row.spec.emote').length >= 1), 5000), 'clicking an emote shows a shared spectator emote (👁-tagged)');
		A(chatPosts.some(p => p.room === 'spec:friendx' && p.emote), 'the emote posts to the spectator-only room (other spectators see it)', JSON.stringify(chatPosts.map(p => ({ r: p.room, e: p.emote, t: p.text }))));
		// typing also posts to the SPECTATOR-only room, never the players' room
		await page.type('#mp-chat .mc-input', 'hi other watchers');
		await page.keyboard.press('Enter');
		await sleep(300);
		A(chatPosts.some(p => p.room === 'spec:friendx' && p.text === 'hi other watchers'), 'spectator text posts to the spectator-only room', JSON.stringify(chatPosts));
		A(!chatPosts.some(p => p.room === 'u:friendx'), 'nothing the spectator sends goes to the players\' room', JSON.stringify(chatPosts));
		// chat author names are clickable → profile (the "players' name" path)
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('#mp-chat .mc-who[data-user]')), 4000), 'chat author names are clickable (data-user → profile)');

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

		// spectator cap: a "full" cardstate response shows the waiting overlay (server enforces the real cap)
		csState = { seq: 9, watchers: 10, watcherNames: [], full: true, max: 10 };
		A(await waitFor(() => page.evaluate(() => { const el = document.querySelector('#spec-full'); return !!(el && /full/i.test(el.textContent) && /10/.test(el.textContent)); }), 5000), 'a full game shows the "spectator slots full" waiting overlay');

		A(errors.filter(e => !/Failed to load resource|Script error|WebGL|GL_|texture|CORS/i.test(e)).length === 0, 'no uncaught client errors while spectating', errors.slice(0, 4).join(' | '));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
