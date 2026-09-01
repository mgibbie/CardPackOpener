// survey_dungeons.mjs — find, for every dungeon in the world, the deepest tile a
// player can actually stand on.
//
// This exists to place 87 legendaries without creating 87 pieces of unreachable
// content. A legendary sits on a TILE and triggers when you step on it, so the
// tile has to be genuinely walkable from an entrance — the middle of a cave is
// usually solid rock, and eyeballing a coordinate off a layout is how you ship a
// legendary nobody can reach.
//
// So: flood-fill from the map's own warps (a warp is reachable by definition)
// using the engine's real `isPassable`, skip `isSurfable` tiles (you cannot walk
// onto water), and keep the tile FARTHEST from any entrance. That tile is both
// provably reachable and satisfyingly deep.
//
// Runs against the real engine for the same reason the tileset work did: water is
// a tileset ATTRIBUTE, not something the map JSON knows.
//
// Writes tools/data/dungeon_tiles.json.
//   node tools/survey_dungeons.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8917;
const BASE = `http://localhost:${PORT}`;
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); } return false; };

// A dungeon is somewhere you explore, not somewhere you shop. Names, because the
// map JSON has no "is this a dungeon" field and map_type lumps every interior
// together as MAP_TYPE_INDOOR.
const DUNGEON = /CAVE|TUNNEL|TOWER|ISLAND|MT_|MOUNT|FOREST|RUINS|CHAMBER|SHRINE|DEN|PILLAR|WELL|SEAFOAM|VICTORY|POWER_PLANT|MANSION|HIDEOUT|LIGHTHOUSE|WHIRL|DEPTHS|GROTTO|SEWER|SAFARI|PATH/;
const NOT = /HOUSE|MART|POKECENTER|CENTER|SHOP|CLUB|LAB|SCHOOL|OFFICE|HOTEL|CAFE|GATE|STATION|DOJO|BEDROOM|LIVING|ENTRANCE|EXIT|CORRIDOR|ELEVATOR/;

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dung-')), 'u.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
	let browser;
	try {
		if (!await waitFor(() => fetch(BASE + '/overworld/pokechess.html').then(r => r.ok), 20000)) throw new Error('server');
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.goto(`${BASE}/overworld/pokechess.html`, { waitUntil: 'domcontentloaded' });
		await page.evaluate(async () => {
			const eng = await import('./engine.js');
			const w = new eng.World(); await w.init(); window.__w = w;
		});

		const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
		const ids = [];
		for (const [r, list] of Object.entries(regions)) {
			if (r === 'HOENN2' || r === 'OTHER') continue;      // unwired clone / uncategorised
			for (const m of list) if (DUNGEON.test(m.id) && !NOT.test(m.id)) ids.push({ id: m.id, region: r });
		}
		console.log(`${ids.length} candidate dungeon maps`);

		const out = {};
		const CHUNK = 10;
		for (let i = 0; i < ids.length; i += CHUNK) {
			const batch = ids.slice(i, i + CHUNK);
			const res = await page.evaluate(async (batch) => {
				const w = window.__w, out = {};
				for (const { id, region } of batch) {
					const file = w.fileFor(id);
					if (!file) { out[id] = { error: 'no file' }; continue; }
					try {
						const b = await w.loadBundle(file);
						// drive the engine's own passability against this map only
						w.current = b; w.connections = {};
						w.warps = (b.map.warp_events || []).map(x => ({ ...x, x: +x.x, y: +x.y }));
						const W = b.layout.width, H = b.layout.height;
						const starts = w.warps.filter(x => x.x >= 0 && x.x < W && x.y >= 0 && x.y < H);
						if (!starts.length) { out[id] = { region, error: 'no warps to enter by' }; continue; }
						// BFS over walkable land from every entrance at once
						const dist = new Int32Array(W * H).fill(-1);
						const q = [];
						for (const s of starts) { const k = s.y * W + s.x; if (dist[k] < 0) { dist[k] = 0; q.push([s.x, s.y]); } }
						let head = 0, best = null, bestD = -1, reach = 0;
						while (head < q.length) {
							const [x, y] = q[head++];
							const d = dist[y * W + x];
							reach++;
							if (d > bestD && !w.isSurfable(x, y)) { bestD = d; best = [x, y]; }
							for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
								const nx = x + dx, ny = y + dy;
								if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
								const k = ny * W + nx;
								if (dist[k] >= 0) continue;
								// walkable = passable and NOT water (you cannot step onto water)
								if (!w.isPassable(nx, ny) || w.isSurfable(nx, ny)) continue;
								dist[k] = d + 1; q.push([nx, ny]);
							}
						}
						out[id] = best
							? { region, file, x: best[0], y: best[1], depth: bestD, reach, w: W, h: H, warps: starts.length }
							: { region, error: 'nothing walkable from the entrances' };
					} catch (e) { out[id] = { region, error: String(e.message || e).slice(0, 70) }; }
				}
				return out;
			}, batch);
			Object.assign(out, res);
			if ((i / CHUNK) % 5 === 0) console.log(`  ${Object.keys(out).length}/${ids.length}`);
		}

		fs.writeFileSync(path.join(ROOT, 'tools/data/dungeon_tiles.json'), JSON.stringify(out, null, '\t'));
		const ok = Object.entries(out).filter(([, v]) => !v.error);
		const errs = Object.entries(out).filter(([, v]) => v.error);
		console.log(`\nusable dungeons: ${ok.length}   unusable: ${errs.length}`);
		const why = {};
		for (const [, v] of errs) why[v.error] = (why[v.error] || 0) + 1;
		for (const [k, n] of Object.entries(why)) console.log(`   ${String(n).padStart(4)}  ${k}`);
		const deep = ok.filter(([, v]) => v.depth >= 12 && v.reach >= 60);
		console.log(`deep enough to hide a legendary in (depth>=12, reach>=60): ${deep.length}`);
		const byRegion = {};
		for (const [, v] of deep) byRegion[v.region] = (byRegion[v.region] || 0) + 1;
		console.log('   by region: ' + Object.entries(byRegion).map(([r, n]) => `${r} ${n}`).join(', '));
		console.log('\ndeepest ten:');
		for (const [id, v] of deep.sort((a, b) => b[1].depth - a[1].depth).slice(0, 10)) {
			console.log(`   ${id.replace('MAP_', '').padEnd(38)} depth ${String(v.depth).padStart(4)}  reach ${String(v.reach).padStart(5)}  @${v.x},${v.y}`);
		}
		console.log('\nwrote tools/data/dungeon_tiles.json');
	} catch (e) {
		console.error('FAILED:', e.message);
		process.exitCode = 1;
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.kill();
	}
})();
