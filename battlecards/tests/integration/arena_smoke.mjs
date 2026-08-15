// arena_smoke.mjs — headless smoke test for the new Arena (draft) run mode.
//
// Boots index.html?arena=1, drives the pick overlays (hero -> power -> 30-card
// draft) by clicking through them, and asserts the run reaches a real battle with
// the drafted ~30-card deck, that the run persisted, and that nothing crashed.
//
// Standalone (needs headless Chrome + puppeteer-core); NOT in run-all.mjs.
//   node battlecards/tests/integration/arena_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8875;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const STATE = { username: 'arena', friendCode: 'ARENAA', decks: [], collection: {}, packs: 0, stats: { runs: 0, wins: 0 } };

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(150); }
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) { /* drain */ } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
		await page.evaluateOnNewDocument((st) => { try { localStorage.setItem('magepunk_mp_token_v1', 'arena-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.removeItem('magepunk_arena_v1'); } catch {} }, STATE);
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?arena=1`, { waitUntil: 'domcontentloaded' });

		A(!/\/login/.test(page.url()), 'boot did not bounce to /login', page.url());

		// the draft flow opens overlays; drive them by clicking the first actionable
		// button (hero -> [class] -> power -> 30x Pick) until a real battle state exists
		const battleReady = () => page.evaluate(() => {
			const g = window.__game; const s = g && g.state;
			return !!(s && Array.isArray(s.players) && s.players.length === 2 && !s.over
				&& (s.players[0].hand.length + s.players[0].deck.length) > 0);
		});
		const overlayFirstButton = () => page.evaluate(() => {
			const ov = document.querySelector('#dungeon-overlay');
			if (!ov || getComputedStyle(ov).display === 'none') return false;
			const b = ov.querySelector('button');
			if (!b) return false;
			b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			b.click();
			return true;
		});
		// first, wait for the hero-pick overlay to appear
		const gotOverlay = await waitFor(() => page.evaluate(() => { const ov = document.querySelector('#dungeon-overlay'); return ov && getComputedStyle(ov).display !== 'none' && !!ov.querySelector('button'); }), 20000);
		A(gotOverlay, 'the draft/pick overlay opened');

		// click through up to ~40 overlay steps (hero + power + 30 picks + slack)
		let clicks = 0;
		for (let i = 0; i < 45; i++) {
			if (await battleReady()) break;
			if (await overlayFirstButton()) clicks++;
			await sleep(120);
		}
		const ready = await battleReady();
		A(ready, `driving the draft reached a live battle (${clicks} overlay clicks)`);

		if (ready) {
			const info = await page.evaluate(() => {
				const s = window.__game.state;
				return {
					pDeck: s.players[0].deck.length, pHand: s.players[0].hand.length,
					eDeck: s.players[1].deck.length, eHand: s.players[1].hand.length,
				};
			});
			// drafted 30 -> after the opening draw, deck+hand should total ~30
			A(info.pDeck + info.pHand >= 25 && info.pDeck + info.pHand <= 32,
				'the player is on their drafted ~30-card deck', JSON.stringify(info));
			A(info.eDeck + info.eHand >= 20, 'the AI opponent has a full auto-drafted deck', JSON.stringify(info));

			const run = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('magepunk_arena_v1')); } catch { return null; } });
			A(run && run.active === true && Array.isArray(run.deck) && run.deck.length === 30 && run.wins === 0 && run.losses === 0,
				'the arena run persisted (active, 30-card deck, 0/0)', JSON.stringify(run && { active: run.active, deck: run.deck?.length, wins: run.wins, losses: run.losses }));
		}

		A(errors.filter(e => !/Failed to load resource/i.test(e)).length === 0, 'no uncaught client errors during the draft + boot', errors.slice(0, 4).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message); console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
