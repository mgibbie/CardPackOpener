// mapedit_places_test.mjs — the map editor can now build a REGION, not just
// repaint one.
//
// Hoenn2 exists to be edited into a new region. The editor could only ever write
// LAYOUTS — the painted tile grid — and had zero handling for warps,
// connections or object events (grep mapedit.js: all three returned nothing).
// So you could paint a town and never give it a door, a route and never join it
// to the next one, a house and never put anyone inside. The dev server had no
// endpoint for map JSON at all, only /dev/save-layout.
//
// The save guard matters more than the UI: a malformed map JSON is a boot
// failure, not a cosmetic bug, and a warp pointing at a map that does not exist
// strands the player somewhere with no way out. So /dev/save-map validates every
// destination against map_index.json and refuses the write.
//
// Standalone (needs headless Chrome/Edge + the dev server):
//   node overworld/tests/mapedit_places_test.mjs
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
const PORT = 8910;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());
const saveMap = (stem, content) => fetch(BASE + '/dev/save-map', {
	method: 'POST', body: JSON.stringify({ stem, content }),
});
async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mapedit-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	let browser;
	const MAPS = path.join(ROOT, 'overworld/data/maps');
	const TARGET = 'Hoenn2_LittlerootTown';
	const backup = fs.readFileSync(path.join(MAPS, `${TARGET}_map.json`), 'utf8');
	try {
		A(await waitFor(() => fetch(BASE + '/overworld/index.html').then(r => r.ok), 20000), 'dev server is up');

		const doc = JSON.parse(backup);
		const nWarps = (doc.warp_events || []).length;

		// ---- the guard: a destination that does not exist must be REFUSED ----
		const bad = JSON.parse(backup);
		(bad.warp_events ||= []).push({ x: 5, y: 5, elevation: 0, dest_map: 'MAP_NOT_A_REAL_PLACE', dest_warp_id: '0' });
		const r1 = await saveMap(TARGET, bad);
		A(r1.status === 400, 'a warp to a map that does not exist is refused', String(r1.status));
		A(/unknown map/i.test(await r1.text()), 'and says why');

		const badDir = JSON.parse(backup);
		(badDir.connections ||= []).push({ map: 'MAP_HOENN2_OLDALE_TOWN', offset: 0, direction: 'sideways' });
		A((await saveMap(TARGET, badDir)).status === 400, 'so is a nonsense connection direction');

		const badId = JSON.parse(backup);
		badId.id = 'not_a_map_id';
		A((await saveMap(TARGET, badId)).status === 400, 'and a malformed map id');

		A(fs.readFileSync(path.join(MAPS, `${TARGET}_map.json`), 'utf8') === backup,
			'none of those rejections touched the file on disk');

		// ---- the happy path: a real warp, link and object round-trip ----
		const good = JSON.parse(backup);
		(good.warp_events ||= []).push({ x: 6, y: 6, elevation: 3, dest_map: 'MAP_HOENN2_OLDALE_TOWN', dest_warp_id: '0' });
		(good.connections ||= []).push({ map: 'MAP_HOENN2_ROUTE101', offset: 0, direction: 'up' });
		(good.object_events ||= []).push({
			type: 'object', graphics_id: 'OBJ_EVENT_GFX_YOUNGSTER', x: 7, y: 7, elevation: 3,
			movement_type: 'MOVEMENT_TYPE_FACE_DOWN', movement_range_x: 0, movement_range_y: 0,
			trainer_type: 'TRAINER_TYPE_NONE', trainer_sight_or_berry_tree_id: '0', script: '0x0', flag: '0',
		});
		const r2 = await saveMap(TARGET, good);
		A(r2.ok, 'a valid map saves', String(r2.status));
		const back = JSON.parse(fs.readFileSync(path.join(MAPS, `${TARGET}_map.json`), 'utf8'));
		A(back.warp_events.length === nWarps + 1, 'the warp is on disk', `${nWarps} -> ${back.warp_events.length}`);
		A(back.connections.some(c => c.direction === 'up' && c.map === 'MAP_HOENN2_ROUTE101'), 'so is the edge link');
		A(back.object_events.some(o => o.x === 7 && o.y === 7), 'and the object');

		// ---- the editor itself ----
		const { token } = await api('register', { username: 'mgibbie', password: 'localdev1' });
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 820 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument(t => {
			localStorage.setItem('magepunk_mp_token_v1', t);
			localStorage.setItem('magepunk_region', 'HOENN');
		}, token);
		await page.goto(`${BASE}/overworld/index.html?mapedit=1&map=${TARGET}`, { waitUntil: 'domcontentloaded' });
		const mounted = await waitFor(() => page.evaluate(() => !!document.getElementById('mapedit')), 40000);
		A(mounted, 'the editor mounts');
		if (!mounted) throw new Error('no editor');
		await waitFor(() => page.evaluate(() => !!window.__ow?.world?.current?.map), 20000);

		const ui = await page.evaluate(() => ({
			tools: [...document.querySelectorAll('#mapedit .me-tool')].map(b => b.dataset.tool),
			destList: document.querySelectorAll('#mapedit #me-maplist option').length,
			hasSaveMap: !!document.querySelector('#mapedit #me-savemap'),
			hasPlaces: !!document.querySelector('#mapedit #me-places'),
		}));
		A(ui.tools.includes('warp') && ui.tools.includes('obj'),
			'with Warp and Object tools alongside the paint tools', ui.tools.join(','));
		A(ui.destList > 1000,
			'every map id is offered as a warp target, so you cannot fat-finger one', String(ui.destList));
		A(ui.hasSaveMap && ui.hasPlaces, 'and a Save map button next to Save tiles');

		// the editor is looking at the map we just wrote, warp and all
		const live = await page.evaluate(() => {
			const m = window.__ow.world.current.map;
			return { warps: (m.warp_events || []).length, objs: (m.object_events || []).length };
		});
		A(live.warps === back.warp_events.length,
			'and it loads the saved warps — the editor edits the same object the game reads',
			JSON.stringify(live));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		// always put the map back: this test writes into the real data tree
		try { fs.writeFileSync(path.join(MAPS, `${TARGET}_map.json`), backup); } catch {}
		if (browser) await browser.close().catch(() => {});
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
