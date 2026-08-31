// survey_johkanto.mjs — measure every JohKanto map's capacity to HOST a wild
// encounter table, using the real engine rather than a reimplementation.
//
// Encounters.roll's rule (encounters.js:57-67):
//   surfing + surfable tile      -> water table
//   standing on tall grass       -> land table
//   map has NO tall grass at all -> land table fires on the floor (gen-3 cave rule)
//   otherwise                    -> nothing
//
// So a land table is live on a grassy route OR on a grassless cave, and DEAD on a
// map that has a little grass you never walk on. That distinction is invisible in
// the map JSON — it comes out of the tileset's metatile ATTRIBUTES, which are
// parsed from binary alongside PNG tile counts. Getting it wrong offline would
// produce tables that never fire, which is this codebase's signature failure, so
// this runs in the browser against tilesets the real loader assembled.
//
// loadBundle (not load) on purpose: it fetches map+layout+tilesets and skips
// renderSection, whose canvases run to 44 MB for one sea route.
//
// Writes tools/data/johkanto_survey.json.
//   node tools/survey_johkanto.mjs [--region=JOHKANTO]
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REGION = (process.argv.find(a => a.startsWith('--region=')) || '--region=JOHKANTO').split('=')[1];
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8913;
const BASE = `http://localhost:${PORT}`;

const waitFor = async (fn, ms) => {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
};

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'survey-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	let browser;
	try {
		if (!await waitFor(() => fetch(BASE + '/overworld/index.html').then(r => r.ok), 20000)) throw new Error('dev server never came up');
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		page.on('console', m => { if (m.type() === 'error') console.log('  [page]', m.text().slice(0, 120)); });
		// pokechess.html, not index.html: it lives under /overworld/ so engine.js's
		// relative `data/...` base still resolves, but it does not kick off the RPG's
		// ~18-request boot (which needs a save, a region and a starter before it ever
		// reaches `window.__ow`). The engine is imported directly instead.
		await page.goto(`${BASE}/overworld/pokechess.html`, { waitUntil: 'domcontentloaded' });
		const ready = await page.evaluate(async () => {
			const eng = await import('./engine.js');
			const w = new eng.World();
			await w.init();
			window.__survey = w;
			return Object.keys(w.index || {}).length;
		});
		console.log(`engine up, map index has ${ready} entries`);
		if (!ready) throw new Error('map index empty');

		const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
		const ids = regions[REGION].map(m => m.id);
		console.log(`${REGION}: ${ids.length} maps`);

		const out = {};
		const CHUNK = 12;                       // keep each evaluate() well under protocolTimeout
		for (let i = 0; i < ids.length; i += CHUNK) {
			const batch = ids.slice(i, i + CHUNK);
			const res = await page.evaluate(async (batch) => {
				const w = window.__survey;
				// same masks the engine uses (engine.js:25,34) — applied to tileset
				// attribute tables the REAL loader built, so PNG-derived tile counts
				// and the primary/secondary split are already correct here
				const METATILE_MASK = 0x3FF, BEHAVIOR_MASK = 0x1FF, MB_TALL_GRASS = 0x02, MB_LONG_GRASS = 0x03;
				const attrOf = (ts, id) => {
					const i = id & METATILE_MASK;
					if (i >= ts.primaryMetatileCount) {
						const si = i - ts.primaryMetatileCount;
						return ts.secondary?.attributes?.[si] ?? 0;
					}
					return ts.primary?.attributes?.[i] ?? 0;
				};
				const out = {};
				for (const id of batch) {
					const file = w.fileFor(id);
					if (!file) { out[id] = { error: 'no file' }; continue; }
					try {
						const b = await w.loadBundle(file);
						const lay = b.layout;
						let grass = 0, lgrass = 0, surf = 0, walk = 0;
						for (let y = 0; y < lay.height; y++) {
							for (let x = 0; x < lay.width; x++) {
								const v = lay.map[y]?.[x] ?? 0;
								if (v === 0) continue;
								const bh = attrOf(b.ts, v & METATILE_MASK) & BEHAVIOR_MASK;
								if (bh === MB_TALL_GRASS) grass++;
								else if (bh === MB_LONG_GRASS) lgrass++;
								else if (bh >= 0x10 && bh <= 0x1B) surf++;
								else if ((v & 0x0C00) === 0) walk++;
							}
						}
						out[id] = {
							file, w: lay.width, h: lay.height, grass, lgrass, surf, walk,
							type: b.map.map_type || '?',
							conns: (b.map.connections || []).length,
							warps: (b.map.warp_events || []).length,
						};
					} catch (e) { out[id] = { error: String(e.message || e).slice(0, 80) }; }
				}
				return out;
			}, batch);
			Object.assign(out, res);
			console.log(`  ${Object.keys(out).length}/${ids.length}`);
		}

		fs.mkdirSync(path.join(ROOT, 'tools/data'), { recursive: true });
		const dest = path.join(ROOT, `tools/data/${REGION.toLowerCase()}_survey.json`);
		fs.writeFileSync(dest, JSON.stringify(out, null, '\t'));

		// summary: which maps can host a LIVE land table, and which a water table
		const enc = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/encounters.json'), 'utf8'));
		const rows = Object.entries(out).filter(([, v]) => !v.error);
		const liveLand = rows.filter(([, v]) => v.grass > 0 || (v.grass === 0 && v.walk > 0));
		const deadIfTabled = rows.filter(([, v]) => v.grass === 0 && v.walk === 0);
		const outdoorish = rows.filter(([id, v]) => v.grass > 0 && !enc[id]);
		const caveish = rows.filter(([id, v]) => v.grass === 0 && v.walk > 40 && v.type !== 'MAP_TYPE_INDOOR' && !enc[id]);
		const water = rows.filter(([id, v]) => v.surf > 20 && !enc[id]?.water);
		console.log(`\nsurveyed ${rows.length} maps (${Object.values(out).filter(v => v.error).length} errors)`);
		console.log(`  already have a table:            ${rows.filter(([id]) => enc[id]).length}`);
		console.log(`  could host a live LAND table:    ${liveLand.length}`);
		console.log(`    - grassy, no table yet:        ${outdoorish.length}`);
		console.log(`    - grassless outdoor/cave, none:${caveish.length}`);
		console.log(`  could host a WATER table:        ${water.length}`);
		console.log(`  a table here would be DEAD:      ${deadIfTabled.length}`);
		console.log(`\nwrote ${path.relative(ROOT, dest)}`);
	} catch (e) {
		console.error('FAILED:', e.message);
		process.exitCode = 1;
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.kill();
	}
})();
