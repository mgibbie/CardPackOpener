// boot_smoke.mjs — headless boot smoke test for the overworld web game.
//
// The overworld had NO live boot coverage (unlike the battlecards relay harness),
// so a bad import or a broken module could reach production silently. This serves
// the repo statically with a permissive /api/mp stub, seeds a login token + a
// cached account (so requireLogin passes and freshState is skipped — no real
// backend needed), boots overworld/index.html in headless Chrome, and asserts:
//   1. it does NOT bounce to /login (the token gate is satisfied),
//   2. the world engine booted and a real map layout loaded (window.__ow),
//   3. the game-loop player-step hook runs without throwing,
//   4. no uncaught client errors across the whole boot.
// It exercises every overworld module the boot pulls in (bag/party/main/... and
// the new safestore routing) end-to-end.
//
// Standalone (needs headless Chrome + puppeteer-core, and the LOCAL overworld/
// data assets — that dir is .gitignored + offloaded, so this is a dev-machine
// check, like battlecards' relay_harness); NOT in run-all.mjs.
//   node overworld/tests/boot_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');           // repo root
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8873;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

// a cached account so requireLogin passes and MP.cachedState() short-circuits
// the freshState() server call; the loops (heartbeat/friends/challenges) hit the
// permissive stub below and never 401 (which would log us out mid-boot)
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) { /* drain */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			// one permissive shape that satisfies every boot-time call's field read
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
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
		// seed the login token + cached account BEFORE any page script runs
		await page.evaluateOnNewDocument((st) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch {}
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });

		// 1) the token gate let us in (a bounce would land us on /login)
		A(!/\/login/.test(page.url()), 'boot did not bounce to /login (token gate satisfied)', page.url());

		// 2) the engine booted and a real map layout loaded
		const booted = await waitFor(() => page.evaluate(() => {
			const ow = window.__ow;
			return !!(ow && ow.world && ow.world.current && ow.world.current.layout && ow.world.current.layout.width > 0 && ow.player);
		}), 30000);
		A(booted, 'the overworld booted: __ow + a loaded map layout + player');

		const info = await page.evaluate(() => {
			const ow = window.__ow;
			return ow ? { map: ow.world.current.name, w: ow.world.current.layout.width, h: ow.world.current.layout.height, tx: ow.player.tx, ty: ow.player.ty } : null;
		});
		A(info && info.map && info.w > 0 && info.h > 0, 'a real map layout is loaded (dimensions > 0)', JSON.stringify(info));

		// 3) the game loop runs — drive the player a step via the test hook (exercises
		//    update / collision / render); tolerant of walls (assert no throw, not distance)
		const moved = await page.evaluate(async () => {
			if (!window.__ow || !window.__ow.pumpPlayer) return 'no-hook';
			try { return await window.__ow.pumpPlayer('down', false, 700); } catch (e) { return 'throw: ' + e.message; }
		});
		A(typeof moved === 'number' && moved >= 0, 'the player-step hook ran without throwing', 'result=' + JSON.stringify(moved));

		// 4) nothing crashed across the boot (missing optional sprites are benign)
		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, 'no uncaught client errors during boot', fatal.slice(0, 4).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
