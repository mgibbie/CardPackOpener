// portals_test.mjs — inter-region PORTAL pads (portals.js) in the live engine. Covers:
//   1) PLACEMENT — every one of the 24 shared-region gym towns gets exactly one pad, on a
//      walkable, warp-free tile (anchored beside the Pokemon Center).
//   2) DESTS     — each pad offers the two OTHER regions' same-tier gym towns.
//   3) TRAVEL    — using a pad flips the current region, flies you to the dest town's
//      PC-front landing (beside its own pad), and registers the Fly point.
// Headless Chrome + a mock /api/mp.  node overworld/tests/portals_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8895;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 120)); } return false; }

const STATE = { username: 'pt', friendCode: 'PORT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: {}, friends: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c; // drain
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null }));
		return;
	}
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PARTY = [{ speciesId: 'venusaur', name: 'VENUSAUR', level: 60, gender: 'M', ability: 'Overgrow', types: ['Grass', 'Poison'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 200, atk: 160, def: 160, spa: 180, spd: 180, spe: 150 }, maxHP: 200, curHP: 200, exp: 300000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], num: 3, sprite: 's3.png' }];

// the 24 shared-region gym towns (townMap file stems), in tier order per region
const TOWNS = {
	KANTO: ['PewterCity', 'CeruleanCity', 'VermilionCity', 'CeladonCity', 'FuchsiaCity', 'SaffronCity', 'CinnabarIsland', 'ViridianCity'],
	JOHTO: ['VioletCity', 'AzaleaTown', 'GoldenrodCity', 'EcruteakCity', 'CianwoodCity', 'OlivineCity', 'MahoganyTown', 'BlackthornCity'],
	HOENN: ['RustboroCity', 'DewfordTown', 'MauvilleCity', 'LavaridgeTown', 'PetalburgCity', 'FortreeCity', 'MossdeepCity', 'SootopolisCity'],
};

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st, party) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'pt-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			for (const k of ['magepunk_badges_v1', 'magepunk_flypoints']) localStorage.removeItem(k);
		} catch { }
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PewterCity`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.portals && window.__ow.moveToMap)), 30000);

	// 1 + 2: PLACEMENT + DESTS across all 24 gym towns
	const report = await page.evaluate(async (TOWNS) => {
		const ow = window.__ow, out = [];
		for (const region of Object.keys(TOWNS)) {
			for (let tier = 0; tier < TOWNS[region].length; tier++) {
				const file = TOWNS[region][tier];
				await ow.moveToMap(file);
				await new Promise(r => setTimeout(r, 30));
				const list = ow.portals.list;
				const p = list[0];
				const passable = p ? ow.world.isPassable(p.tx, p.ty) : false;
				const onWarp = p ? (ow.world.current.map.warp_events || []).some(w => +w.x === p.tx && +w.y === p.ty) : false;
				out.push({
					file, region, tier, count: list.length,
					id: ow.world.current.map.id,
					passable, onWarp,
					dests: p ? p.dests.map(d => d.mapId) : [],
					destRegions: p ? p.dests.map(d => d.region) : [],
				});
			}
		}
		return out;
	}, TOWNS);

	const placed = report.filter(r => r.count === 1);
	A(placed.length === 24, `all 24 gym towns get exactly one portal pad`, `placed ${placed.length}/24: ${report.filter(r => r.count !== 1).map(r => r.file + '=' + r.count).join(',')}`);
	A(report.every(r => r.passable && !r.onWarp), 'every pad sits on a walkable, warp-free tile', report.filter(r => !(r.passable && !r.onWarp)).map(r => r.file).join(','));
	A(report.every(r => r.dests.length === 2), 'every pad offers two destinations', report.filter(r => r.dests.length !== 2).map(r => r.file).join(','));
	A(report.every(r => !r.destRegions.includes(r.region) && new Set(r.destRegions).size === 2), 'the two destinations are the OTHER two regions', report.filter(r => r.destRegions.includes(r.region)).map(r => r.file).join(','));
	// same-tier check: Pewter (K,t0) -> Violet + Rustboro
	const pewter = report.find(r => r.file === 'PewterCity');
	A(pewter && pewter.dests.includes('MAP_VIOLET_CITY') && pewter.dests.includes('MAP_RUSTBORO_CITY'), 'Pewter (gym 1) links to the other regions gym-1 towns (Violet, Rustboro)', JSON.stringify(pewter && pewter.dests));
	// tier is preserved: Mossdeep (H, t6) -> Cinnabar (K,t6) + Mahogany (J,t6)
	const moss = report.find(r => r.file === 'MossdeepCity');
	A(moss && moss.dests.includes('MAP_CINNABAR_ISLAND') && moss.dests.includes('MAP_MAHOGANY_TOWN'), 'Mossdeep (gym 7) links to the other regions gym-7 towns (Cinnabar, Mahogany)', JSON.stringify(moss && moss.dests));

	// 3: TRAVEL round-trip — Pewter -> Violet, region flips, landing beside the arrival pad, Fly registered
	const travel = await page.evaluate(async () => {
		const ow = window.__ow;
		await ow.moveToMap('PewterCity');
		await new Promise(r => setTimeout(r, 40));
		const dest = ow.portals.list[0].dests.find(d => d.mapId === 'MAP_VIOLET_CITY');
		ow.travelPortal(dest); // sets region + flyTo + dialog
		return dest;
	});
	const arrived = await waitFor(() => page.evaluate(() => window.__ow.world.current.name === 'VioletCity'), 8000);
	A(arrived, 'using the Pewter portal flies you to VioletCity');
	const after = await page.evaluate(() => {
		const ow = window.__ow;
		const p = ow.portals.list[0];
		const near = p ? (Math.abs(ow.player.tx - p.tx) + Math.abs(ow.player.ty - p.ty)) : 999;
		return {
			region: localStorage.getItem('magepunk_region'),
			hasPad: !!p,
			near,
			flyReg: ow.hasFlyPoint('MAP_VIOLET_CITY'),
			tier: ow.Quest_globalTier(),
		};
	});
	A(after.region === 'johto', 'the current region flips to JOHTO on arrival', after.region);
	A(after.hasPad, 'the destination town has its own portal pad');
	A(after.near <= 6, 'you land near the arrival pad (by the Pokemon Center)', 'manhattan=' + after.near);
	A(after.flyReg, 'the destination town is registered as a Fly point');

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
