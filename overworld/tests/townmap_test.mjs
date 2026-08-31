// townmap_test.mjs — Hoenn finally has a map.
//
// Kanto, JohKanto and Johto all had real region art behind the Town Map.
// flydata.js had `hoenn: null` and markerPx returned null for it, so the
// LARGEST region in the game — 16 fly destinations — drew as a bare grid of
// dots while the other three got a map.
//
// The art is assembled from pokeemerald by tools/build_hoenn_townmap.py. An
// earlier attempt gave up on the grounds that Emerald's tilemap "references
// ~982 tiles into a 240-tile sheet"; the data says the highest tile index is
// 231 against exactly 240 tiles. What actually defeats a naive assembly is the
// palette: the sheet is 8bpp with its OWN colours, not 4bpp indices into
// region_map.pal, and applying the .pal produces a solid black image.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/townmap_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8906;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'treecko', name: 'LEAD', level: 30, gender: 'M', friend: 70, types: ['Grass'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 90, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 90, curHP: 90,
	exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's252.png', num: 252,
}];

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	// ---------- the art itself ----------
	const png = path.join(ROOT, 'overworld/data/townmap/hoenn.png');
	A(fs.existsSync(png), 'the Hoenn region art exists');
	if (fs.existsSync(png)) {
		const b = fs.readFileSync(png);
		const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
		A(w === 240 && h === 160, 'and is a 240x160 region image, same shape as Kanto', `${w}x${h}`);
		// a solid-black assembly is the failure mode this art hit first; a real map
		// has to carry a spread of colours
		A(b.length > 4000, 'and is not the near-empty file a black assembly produces', String(b.length));
	}

	// ---------- engine ----------
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
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
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1100, height: 760 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		const missing = [];
		page.on('response', r => { if (r.status() === 404) missing.push(r.url().split('/').pop()); });
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'HOENN');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.world?.current)), 30000);
		A(ready, 'Hoenn boots');
		if (!ready) throw new Error('boot failed');

		const data = await page.evaluate(() => {
			const ow = window.__ow;
			const dests = ow.Fly.FLY.hoenn;
			return {
				img: ow.Fly.IMG.hoenn,
				total: dests.length,
				placed: dests.filter(t => ow.Fly.markerPx('hoenn', t.map)).length,
				sample: ow.Fly.markerPx('hoenn', 'MAP_SOOTOPOLIS_CITY'),
				kantoStillWorks: ow.Fly.markerPx('kanto', 'MAP_PALLET_TOWN'),
			};
		});
		A(data.img && data.img.file === 'townmap/hoenn.png', 'the region points at its art — it used to be null', JSON.stringify(data.img));
		A(data.placed === data.total,
			'every Hoenn fly destination has a marker pixel', `${data.placed}/${data.total}`);
		A(Array.isArray(data.sample) && data.sample.length === 2, 'the coordinates are real pairs', JSON.stringify(data.sample));
		A(Array.isArray(data.kantoStillWorks), 'and Kanto still resolves (control)', JSON.stringify(data.kantoStillWorks));

		// markers must sit ON the image, not off its edge
		const inBounds = await page.evaluate(() => {
			const ow = window.__ow, img = ow.Fly.IMG.hoenn;
			return ow.Fly.FLY.hoenn.every(t => {
				const p = ow.Fly.markerPx('hoenn', t.map);
				return p && p[0] >= 0 && p[0] < img.w && p[1] >= 0 && p[1] < img.h;
			});
		});
		A(inBounds, 'and all of them land inside the 240x160 image');

		// open it for real and confirm the art actually loaded
		const opened = await page.evaluate(async () => {
			const ow = window.__ow;
			for (const t of ow.Fly.FLY.hoenn) ow.markFlyPoint(t.map);
			ow.openTownMap();
			await new Promise(r => setTimeout(r, 900));
			return { open: ow.townMap.open };
		});
		A(opened.open, 'the TOWN MAP opens on Hoenn');
		A(!missing.some(u => /hoenn\.png/.test(u)), 'and the art is served, not 404', missing.slice(0, 3).join(','));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
