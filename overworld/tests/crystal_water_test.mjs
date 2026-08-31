// crystal_water_test.mjs — Johto and JohKanto have water again.
//
// The bug: all 61 Crystal-derived tilesets were converted with no water
// behavior. `crystal_native_build.py`'s BEHAVIOR table maps TALL_GRASS and the
// four HOP_* ledges and nothing else, so across 373 maps there was not one
// surfable tile. Surf did nothing, `castRod` refused to cast (it gates on
// `world.isSurfable`), all 61 water encounter tables were unreachable, and sea
// routes were walkable floor — Route 20 was 885 passable tiles of ocean.
//
// These assertions are deliberately about TILES, not tables. A wild table that
// cannot fire looks identical to a healthy one from the data side; the only
// thing that distinguishes them is whether the map has a tile the roll can
// trigger on. That is the class of bug this whole area keeps producing, so the
// test asserts the tiles.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/crystal_water_test.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
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
const PORT = 8915;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); } return false; };

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'water-')), 'u.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	let browser;
	try {
		A(await waitFor(() => fetch(BASE + '/overworld/pokechess.html').then(r => r.ok), 20000), 'dev server is up');
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.goto(`${BASE}/overworld/pokechess.html`, { waitUntil: 'domcontentloaded' });
		await page.evaluate(async () => {
			const eng = await import('./engine.js');
			const w = new eng.World(); await w.init();
			window.__w = w; window.__eng = eng;
		});

		// count behaviors on a set of maps, through the real tileset loader
		const scan = ids => page.evaluate(async (ids) => {
			const w = window.__w, out = {};
			const MM = 0x3FF, BM = 0x1FF;
			const attrOf = (ts, id) => {
				const i = id & MM;
				if (i >= ts.primaryMetatileCount) return ts.secondary?.attributes?.[i - ts.primaryMetatileCount] ?? 0;
				return ts.primary?.attributes?.[i] ?? 0;
			};
			for (const id of ids) {
				const f = w.fileFor(id);
				if (!f) { out[id] = null; continue; }
				const b = await w.loadBundle(f);
				let surf = 0, grass = 0, walk = 0;
				for (let y = 0; y < b.layout.height; y++) for (let x = 0; x < b.layout.width; x++) {
					const v = b.layout.map[y]?.[x] ?? 0; if (!v) continue;
					const bh = attrOf(b.ts, v & MM) & BM;
					if (bh >= 0x10 && bh <= 0x1B) surf++;
					else if (bh === 0x02) grass++;
					else if ((v & 0x0C00) === 0) walk++;
				}
				out[id] = { surf, grass, walk };
			}
			return out;
		}, ids);

		// ---- the regression: sea routes are water, not pavement ----
		const sea = await scan(['MAP_JOHKANTO_ROUTE_19', 'MAP_JOHKANTO_ROUTE_20', 'MAP_JOHKANTO_ROUTE_21']);
		for (const [id, v] of Object.entries(sea)) {
			A(v && v.surf > 200, `${id.replace('MAP_JOHKANTO_', '')} is open water`, JSON.stringify(v));
			A(v && v.surf > v.walk, `  ...and more water than walkable floor`, JSON.stringify(v));
		}

		// ---- every water table must sit on a map that has water ----
		const enc = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/encounters.json'), 'utf8'));
		const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
		const crystalWater = [...regions.JOHTO, ...regions.JOHKANTO].map(m => m.id).filter(id => enc[id]?.water);
		A(crystalWater.length >= 55, `Johto+JohKanto ship ${crystalWater.length} water tables`, String(crystalWater.length));
		const wet = await scan(crystalWater);
		const dead = Object.entries(wet).filter(([, v]) => !v || v.surf === 0).map(([id]) => id);
		A(dead.length === 0, 'every one of them is on a map with surfable tiles',
			dead.length ? `${dead.length} dead: ${dead.slice(0, 4).join(', ')}` : '');

		// ---- fishing needs the same tiles, so assert its exact gate ----
		const fishable = await page.evaluate(async () => {
			const w = window.__w;
			await w.load(w.fileFor('MAP_JOHKANTO_VERMILION_CITY'));
			let adjacent = 0;
			const lay = w.current.layout;
			for (let y = 1; y < lay.height - 1 && adjacent < 1; y++) {
				for (let x = 1; x < lay.width - 1; x++) {
					// castRod: stand on land, face water
					if (w.isSurfable(x, y)) continue;
					if (w.isSurfable(x + 1, y) || w.isSurfable(x, y + 1)) { adjacent++; break; }
				}
			}
			return adjacent > 0;
		});
		A(fishable, 'there is a tile you can stand on and face water from (castRod\'s gate)');

		// ---- grass must not have regressed: it was the one thing the converter got right
		const grassy = await scan(['MAP_JOHKANTO_ROUTE_2', 'MAP_ROUTE29', 'MAP_ROUTE30']);
		const anyGrass = Object.values(grassy).filter(v => v && v.grass > 0).length;
		A(anyGrass >= 1, 'Crystal grass survived the behavior rewrite', JSON.stringify(grassy));

		// ---- Kanto/Hoenn are FireRed/Emerald tilesets and must be untouched ----
		const gen3 = await scan(['MAP_ROUTE20', 'MAP_ROUTE101']);
		A(gen3.MAP_ROUTE20 && gen3.MAP_ROUTE20.surf > 500, 'Kanto Route20 still open water', JSON.stringify(gen3.MAP_ROUTE20));
		A(gen3.MAP_ROUTE101 && gen3.MAP_ROUTE101.grass > 50, 'Hoenn Route101 still grassy', JSON.stringify(gen3.MAP_ROUTE101));

		// ---- MB_LONG_GRASS (0x03) counts as grass ----
		// Routes 119 and 120 are waist-high grass, which is an encounter tile in
		// Emerald but was not one here: the engine only knew 0x02, so `hasTallGrass`
		// said "no grass" and the grassless cave rule fired encounters on all ~2650
		// walkable tiles of the two routes instead of the 1201 grass tiles.
		const longGrass = await page.evaluate(async () => {
			const w = window.__w, out = {};
			for (const id of ['MAP_ROUTE119', 'MAP_ROUTE120']) {
				await w.load(w.fileFor(id));
				let grass = 0;
				for (let y = 0; y < w.current.layout.height; y++)
					for (let x = 0; x < w.current.layout.width; x++) if (w.isTallGrass(x, y)) grass++;
				out[id] = { grass, hasGrass: w.hasTallGrass() };
			}
			return out;
		});
		for (const [id, v] of Object.entries(longGrass)) {
			A(v.grass > 100 && v.hasGrass === true,
				`${id.replace('MAP_', '')}: long grass reads as grass, so encounters stay in it`, JSON.stringify(v));
		}

		// ---- the rescue: a save parked on what is now ocean must not be frozen ----
		const rescued = await page.evaluate(async () => {
			const w = window.__w, eng = window.__eng;
			await w.load(w.fileFor('MAP_JOHKANTO_ROUTE_20'));
			const p = new eng.Player();
			p.world = w; p.surfing = false;
			// find an open-water tile, the kind an old save could have walked onto
			let spot = null;
			for (let y = 0; y < w.current.layout.height && !spot; y++)
				for (let x = 0; x < w.current.layout.width; x++)
					if (w.isSurfable(x, y)) { spot = [x, y]; break; }
			if (!spot) return { spot: null };
			p.setTile(spot[0], spot[1]);
			return { spot, surfing: p.surfing };
		});
		A(rescued.spot && rescued.surfing === true,
			'setTile on water turns surfing on, so a pre-fix save is not stranded mid-ocean',
			JSON.stringify(rescued));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
