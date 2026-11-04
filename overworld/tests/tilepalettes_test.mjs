// tilepalettes_test.mjs — tiles take the SHARED BG palettes (primary 0..5, secondary 6..12).
//
// Playtest 2026-09-25: Route 115's northern terrain was opaque black. Fallarbor
// metatiles draw PRIMARY tiles with palette 11; the sheets were coloured with their
// own tileset's palettes only, and General's palette 11 is all zeros. The GBA loads
// palettes 6..12 from the secondary (FRLG: 7..12), so those bands are now repainted
// per primary/secondary pair from tools/gen_tile_palettes.py's colour indices.
//
//   node overworld/tests/tilepalettes_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9131;
const STATE = { username: 'tilepal', friendCode: 'TILEPL', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, lead) => {
		if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'tilepal-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, STATE, LEAD);
	const boot = async (map, x, y) => {
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 200 && !(await page.evaluate(() => !!window.__ow?.world?.current?.canvases?.bottom).catch(() => false)); i++) await sleep(200);
		await sleep(1200);
	};
	// per metatile: how many of its 256 bottom-canvas pixels are opaque black
	const blackIn = (cells) => page.evaluate(cells => {
		const cv = window.__ow.world.current.canvases.bottom, g = cv.getContext('2d');
		return cells.map(([x, y]) => {
			const d = g.getImageData(x * 16, y * 16, 16, 16).data; let n = 0;
			for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && !d[i] && !d[i + 1] && !d[i + 2]) n++;
			return n;
		});
	}, cells);

	await boot('Route115', 27, 52);
	A((await page.evaluate(() => window.__ow.world.current.name)) === 'Route115', 'setup: on Route 115');
	const north = await blackIn([[27, 37], [27, 39], [27, 45]]);
	A(north.every(n => n < 256), 'the reported northern terrain (27,37/39/45) is no longer solid black', JSON.stringify(north));
	A(north.every(n => n < 64), '...and is mostly coloured (under a quarter black)', JSON.stringify(north));
	A((await blackIn([[27, 50]]))[0] < 64, 'the southern terrain (27,50) still renders');

	// exact colours: the repainted sheets carry the OTHER tileset's palettes in its bands
	const exact = await page.evaluate(async () => {
		const ts = window.__ow.world.current.ts;
		const [p, s] = await Promise.all(['emerald_general', 'emerald_fallarbor'].map(n => fetch(`data/tilesets/${n}_pal.json`).then(r => r.json())));
		const px = (img, x, y) => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(img, x, y, 1, 1, 0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data]; };
		const idxAt = (pal, i) => { const b = atob(pal.idx).charCodeAt(i >> 1); return i & 1 ? b & 15 : b >> 4; };
		const hex = c => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
		const probe = (img, own, other, band) => {
			for (let i = 0; i < own.w * own.h; i++) {
				const v = idxAt(own, i);
				if (v && other.pals[band][v] !== own.pals[band][v]) {
					return { got: hex(px(img, i % own.w, band * own.h + Math.floor(i / own.w))), want: other.pals[band][v] };
				}
			}
			return null;
		};
		return {
			primary11: probe(ts.primary.img, p, s, 11),    // primary tile, secondary palette
			secondary4: probe(ts.secondary.img, s, p, 4),  // secondary tile, primary palette
			primary0: (() => { for (let i = 0; i < p.w * p.h; i += 37) { const v = idxAt(p, i); if (v) return { got: hex(px(ts.primary.img, i % p.w, Math.floor(i / p.w))), want: p.pals[0][v] }; } })(),
		};
	});
	A(exact.primary11 && exact.primary11.got === exact.primary11.want, 'a General tile in band 11 wears FALLARBOR\'s palette 11', JSON.stringify(exact.primary11));
	A(exact.secondary4 && exact.secondary4.got === exact.secondary4.want, 'a Fallarbor tile in band 4 wears GENERAL\'s palette 4', JSON.stringify(exact.secondary4));
	A(exact.primary0 && exact.primary0.got === exact.primary0.want, 'a General tile in band 0 keeps its own palette', JSON.stringify(exact.primary0));

	// FRLG splits at 7: a Kanto map still loads and a Crystal-sourced sheet (no palette file) is untouched
	await boot('PalletTown', 5, 8);
	A((await page.evaluate(() => window.__ow.world.current.name)) === 'PalletTown', 'a FRLG map (Pallet Town) still loads');
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
