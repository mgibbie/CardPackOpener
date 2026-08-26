// live_hub_smoke.mjs — the "Live now" hub on start.html. Boots the page with a
// stubbed live-friends response and verifies the section renders a watchable
// friend (mode + watcher count) and the Watch button deep-links to ?spectate=.
//
// Standalone (needs headless Chrome + puppeteer-core); NOT in run-all.mjs.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8883;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; }

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let b = ''; req.on('data', d => b += d); req.on('end', () => {
				let body = {}; try { body = JSON.parse(b); } catch {}
				let out = { ok: true };
				if (body.action === 'live-friends') out = { live: [{ username: 'coolfriend', kind: 'card', mode: 'dungeon', label: 'Fight 3/8', watchers: 2, full: false }] };
				else if (body.action === 'state') out = { state: { username: 'me', decks: [], collection: {} } };
				else if (body.action === 'friends') out = { friends: [] };
				else if (body.action === 'pubprofile') out = { profile: { username: body.username, online: true, status: 'card:dungeon', wins: 5, runs: 3, packsOpened: 9, uniqueCards: 40, deckCount: 2, isFriend: true, isYou: false } };
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
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
		await page.evaluateOnNewDocument(() => { localStorage.setItem('magepunk_mp_token_v1', 'live-token'); localStorage.setItem('mp_onboarded_v1', '1'); });
		await page.goto(`http://localhost:${PORT}/battlecards/start.html`, { waitUntil: 'domcontentloaded' });

		// the Live Now section appears with the watchable friend
		const shown = await waitFor(() => page.evaluate(() => { const s = document.querySelector('#live-now'); return !!(s && !s.hidden && document.querySelector('#live-list .live-tile')); }), 15000);
		A(shown, 'the "Live now" section renders a watchable friend');
		const tile = await page.evaluate(() => { const t = document.querySelector('#live-list .live-tile'); return t ? { text: t.textContent, hasWatch: !!t.querySelector('.live-watch'), hasName: !!t.querySelector('.live-name[data-user]') } : null; });
		A(tile && /coolfriend/.test(tile.text) && /Dungeon run/i.test(tile.text) && /2.*watching/.test(tile.text), 'the tile shows the friend, game type, and live watcher count', JSON.stringify(tile));
		A(tile && tile.hasWatch && tile.hasName, 'the tile has a Watch button + a clickable name');

		// the Card of the Week renders as a real card FACE (drawCardFace canvas), not split art/stats
		const faceShown = await waitFor(() => page.evaluate(() => !!document.querySelector('#cw-face canvas')), 15000);
		A(faceShown, 'the Card of the Week renders as a full card face (drawCardFace canvas)');

		// clicking Watch deep-links into the spectator view
		await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}), page.click('#live-list .live-watch')]);
		A(/[?&]spectate=coolfriend/.test(page.url()), 'clicking Watch deep-links to index.html?spectate=<friend>', page.url());

		A(errors.filter(e => !/Failed to load resource/i.test(e)).length === 0, 'no uncaught client errors on the hub', errors.slice(0, 4).join(' | '));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
