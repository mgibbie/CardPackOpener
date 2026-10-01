// silphco_tileset_test.mjs — maps on FireRed's gTileset_SilphCo draw their floor.
//
// Production (instinctloretest0918, 2026-10-01 3:12pm): Rocket Hideout B1F/B4F and
// its elevator drew a BLACK map under the sprites; movement worked. The engine
// asked for silph_co_tiles.png, which 404s — there is no such sheet. The decomp's
// gTileset_SilphCo has its own metatiles but BORROWS Condominiums' tile graphics
// and palettes (headers.h: "// Shared by SilphCo"). engine.js now maps the graphics
// (and palettes) to Condominiums while the metatiles keep their own name.
//   1. every SilphCo-tileset map loads BOTH tilesets and its bottom layer is
//      actually drawn: mostly opaque, many colours, not a black/empty sheet
//   2. the graphics come from the Condominiums sheet; the metatiles stay SilphCo's
//   3. S.S. Anne (the earlier SSAnne -> ss_anne name fix) still draws
//   4. a tilesheet that fails to load is REPORTED (console.error), never silent
//
//   node overworld/tests/silphco_tileset_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9187;
const STATE = { username: 'silph', friendCode: 'SILPH1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the maps whose layouts use gTileset_SilphCo, straight from the data
const LAYOUTS = path.join(ROOT, 'overworld/data/layouts'), MAPS = path.join(ROOT, 'overworld/data/maps');
const silphLayouts = new Set(fs.readdirSync(LAYOUTS).filter(f => fs.readFileSync(path.join(LAYOUTS, f), 'utf8').includes('"gTileset_SilphCo"')).map(f => f.replace(/\.json$/, '')));
const silphMaps = fs.readdirSync(MAPS).filter(f => !/^Hoenn2_|^JohKanto/.test(f)).map(f => [f.replace(/_map\.json$/, ''), JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8')).layout]).filter(([, l]) => silphLayouts.has(l)).map(([m]) => m);

let block404 = false;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	if (block404 && /condominiums_tiles\.png$/.test(u)) { res.writeHead(404); res.end('nf'); return; }
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	A(silphMaps.length >= 8, `setup: ${silphMaps.length} maps use gTileset_SilphCo`, silphMaps.join(', '));
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [], consoleErr = [];
	page.on('pageerror', e => errors.push(String(e.message)));
	page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
	await page.evaluateOnNewDocument(st => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=CeladonCity`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current)).catch(() => false)); i++) await sleep(100);
	await sleep(1000);

	// load a map, then measure its bottom layer
	const measure = map => page.evaluate(async map => {
		const O = window.__ow;
		await O.moveToMap(map);
		const cur = O.world.current;
		const cv = cur.canvases && (cur.canvases.bottom || cur.canvases[0]);
		const ts = cur.ts || {};
		const r = { map: cur.name, primary: !!ts.primary, secondary: !!ts.secondary, secondaryTiles: cur.layout.secondary_tileset };
		if (!cv) return { ...r, err: 'no canvas' };
		const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
		let opaque = 0, black = 0; const colours = new Set();
		for (let i = 0; i < d.length; i += 4) {
			if (d[i + 3] > 200) { opaque++; if (d[i] < 12 && d[i + 1] < 12 && d[i + 2] < 12) black++; colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); }
		}
		const n = d.length / 4;
		return { ...r, opaque: +(opaque / n).toFixed(3), black: +(black / Math.max(1, opaque)).toFixed(3), colours: colours.size };
	}, map);

	for (const m of silphMaps) {
		const r = await measure(m);
		A(r.map === m && r.primary && r.secondary, `[${m}] both tilesets load (the SilphCo secondary was null)`, JSON.stringify(r));
		A(r.opaque > 0.8 && r.black < 0.5 && r.colours > 8, `[${m}] its floor is drawn: ${Math.round(r.opaque * 100)}% opaque, ${r.colours} colours, ${Math.round(r.black * 100)}% black`, JSON.stringify(r));
	}
	// 2. the right files
	const urls = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(n => /tilesets\//.test(n)).map(n => n.split('/').pop()));
	A(urls.includes('condominiums_tiles.png') && !urls.includes('silph_co_tiles.png'), 'the graphics come from condominiums_tiles.png (no request for the non-existent silph_co sheet)', JSON.stringify(urls.filter(u => /condo|silph/.test(u))));
	A(urls.includes('secondary_silph_co_metatiles.json'), '...while the metatiles stay SilphCo\'s own', JSON.stringify(urls.filter(u => /silph/.test(u))));
	// 3. S.S. Anne
	for (const m of ['SSAnne_1F_Corridor', 'SSAnne_Exterior']) {
		if (!fs.existsSync(path.join(MAPS, m + '_map.json'))) continue;
		const r = await measure(m);
		A(r.secondary && r.opaque > 0.5 && r.colours > 8, `[${m}] S.S. Anne still draws (its separate name fix)`, JSON.stringify(r));
	}
	// 4. a sheet that fails to load is reported
	block404 = true;
	const p2 = await browser.newPage();
	const errs2 = []; p2.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
	await p2.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_region', 'KANTO'); localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} })); }, STATE);
	await p2.goto(`http://localhost:${PORT}/overworld/index.html?map=RocketHideout_B1F`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 200 && !errs2.some(e => /tilesheet missing/.test(e)); i++) await sleep(100);
	A(errs2.some(e => /\[tileset\] tilesheet missing: .*condominiums_tiles\.png .*secondary gTileset_SilphCo/.test(e)), 'a tilesheet that fails to load is reported by name (not a silent black map)', JSON.stringify(errs2.slice(0, 3)));
	await p2.close();

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
