// replay_smoke.mjs — end-to-end: record a tape (node), inject it into the
// browser's localStorage, boot index.html?replay=<id>, and verify the real 3D
// replay mode loads the tape, renders a frame, and the control bar steps/flips —
// with no uncaught errors (input is gated, playback never mutates a live game).
//
// Standalone (needs headless Chrome + puppeteer-core, and the WebGL swiftshader
// flags game.js needs). NOT in run-all.mjs.
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
const PORT = 8879;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(200); } return false; }

(async () => {
	// --- 1) record a real tape in node (same pipeline as live play) ---
	globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
	const E = await import('../../engine/index.js');
	const Rec = await import('../../replayrec.js');
	const cardsData = JSON.parse(readFileSync(path.join(BC, 'cards.json')));
	const cardsById = {}; for (const c of cardsData.cards) cardsById[c.id] = c;
	const state = E.createGame(cardsById, E.seededRng(24680), null, 2, null);
	Rec.startRecording({ mode: 'solo', heroes: [{ classId: 'mage' }, { classId: 'hunter' }] });
	Rec.capture(state, 'Opening hands');
	for (let i = 0; i < 6 && !state.over; i++) { E.endTurn(state); Rec.capture(state, 'Turn ' + (i + 1)); }
	const id = await Rec.finish({ winner: null, result: 'draw' });
	const storeValue = globalThis.localStorage.getItem('magepunk_replays_v1'); // exact string the browser expects
	const frameCount = Rec.listReplays().find(r => r.id === id).meta.frames;
	const shareCode = Rec.exportCode(id);   // the packed tape a share link serves
	const SHARE_ID = 'abcdef123456';         // fake server share id our /api/mp stub answers for
	A(!!id && !!storeValue && frameCount >= 4, 'recorded a tape in node and serialized the localStorage payload', `${id} / ${frameCount} frames`);

	// --- 2) boot index.html?replay=<id> in a real headless browser ---
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let b = ''; req.on('data', d => b += d); req.on('end', () => {
				let body = {}; try { body = JSON.parse(b); } catch {}
				let out = { ok: true };
				if (body.action === 'replay-get') out = body.id === SHARE_ID ? { code: shareCode } : { error: 'not found' };
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
		// seed the recorded replay + a token BEFORE game.js loads
		await page.evaluateOnNewDocument((store, tok) => {
			localStorage.setItem('magepunk_replays_v1', store);
			localStorage.setItem('magepunk_mp_token_v1', tok);
		}, storeValue, 'smoke-token');
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?replay=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });

		const booted = await waitFor(() => page.evaluate(() => !!window.__replay && window.__replay.total > 0), 30000);
		A(booted, 'index.html?replay= booted into replay mode and loaded the tape');
		const st0 = await page.evaluate(() => ({ total: window.__replay?.total, idx: window.__replay?.idx, hasState: !!(window.__game?.state?.players?.length), bar: !!document.querySelector('#replay-bar') }));
		A(st0.total === frameCount, 'the control bar reports every recorded frame', `${st0.total} vs ${frameCount}`);
		A(st0.hasState, 'a frame rendered into a live state (fromSnapshot → renderer)', JSON.stringify(st0));
		A(st0.bar, 'the replay control bar is present');

		// step forward via the Next button
		await page.click('#rb-next');
		await sleep(200);
		const afterNext = await page.evaluate(() => window.__replay.idx);
		A(afterNext === 1, 'the Next button advances the frame', 'idx=' + afterNext);

		// scrub to the last frame
		await page.evaluate(t => { const s = document.querySelector('#rb-scrub'); s.value = String(t - 1); s.dispatchEvent(new Event('input')); }, frameCount);
		await sleep(200);
		A(await page.evaluate(() => window.__replay.idx === window.__replay.total - 1), 'scrubbing jumps to the chosen frame');

		// flip perspective
		const viewBefore = await page.evaluate(() => window.__replay.view);
		await page.click('#rb-flip');
		await sleep(200);
		A(await page.evaluate(() => window.__replay.view) !== viewBefore, 'the View button flips which side you watch from');

		A(errors.filter(e => !/Failed to load resource|Script error|WebGL|GL_|texture|CORS/i.test(e)).length === 0, 'no uncaught client errors during replay', errors.slice(0, 5).join(' | '));

		// --- 3b) a shared ?rshare= link fetches the tape from the server and plays it ---
		const share = await browser.newPage();
		await share.evaluateOnNewDocument(tok => localStorage.setItem('magepunk_mp_token_v1', tok), 'smoke-token');
		await share.goto(`http://localhost:${PORT}/battlecards/index.html?rshare=${SHARE_ID}`, { waitUntil: 'domcontentloaded' });
		const sharedOk = await waitFor(() => share.evaluate(t => window.__replay && window.__replay.total === t, frameCount), 30000);
		A(sharedOk, 'a ?rshare= link fetches the tape via replay-get and boots playback', 'frames=' + frameCount);

		// --- 3) recording fires during a live game (the other half of the feature) ---
		const rec = await browser.newPage();
		await rec.evaluateOnNewDocument(tok => localStorage.setItem('magepunk_mp_token_v1', tok), 'smoke-token');
		await rec.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
		const recording = await waitFor(() => rec.evaluate(() => !!(window.__game && window.__game.state && window.__game.recording)), 30000);
		A(recording, 'a live game boots and the recorder starts capturing frames (window.__game.recording)');
		// the Watch/Copy buttons render into an overlay (same addReplayButtons used by post-game AND every run overlay)
		const labels = await rec.evaluate(() => window.__game._replayButtonLabels());
		A(Array.isArray(labels) && labels.some(l => /Watch replay/i.test(l)) && labels.some(l => /Copy replay link/i.test(l)), 'the Watch + Copy-link buttons render into a result overlay', JSON.stringify(labels));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
