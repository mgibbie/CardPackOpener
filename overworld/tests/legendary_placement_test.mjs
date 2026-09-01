// legendary_placement_test.mjs — the 87 legendaries that had no home anywhere now
// sit at the bottom of 87 dungeons, and every one of those tiles is reachable.
//
// This is the assertion that matters. A legendary is anchored to a TILE and fires
// when you step onto it, so a coordinate picked off a layout by eye is a legendary
// nobody can ever reach — content that exists and cannot be found, which is this
// codebase's signature failure. The placements come from a flood fill over the
// engine's own `isPassable` starting at each map's warps; this re-walks that flood
// in the browser and proves every tile is still connected to an entrance.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/legendary_placement_test.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8918;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); } return false; };

const { POSTGAME_LEGENDS, legendsCaught } = await import('../legendaries_postgame.js');
const bat = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));
const mainSrc = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
const ids = Object.keys(POSTGAME_LEGENDS);

// ---------- the table itself ----------
A(ids.length === 87, `${ids.length} legendaries are placed`, String(ids.length));
A(ids.every(m => /^MAP_[A-Z0-9_]+$/.test(m)), 'every key is a map id');
const species = ids.map(m => POSTGAME_LEGENDS[m].species);
A(new Set(species).size === species.length, 'no species is placed twice');
A(species.every(s => bat[s]), 'every species exists in the game', species.filter(s => !bat[s]).join(','));
const flags = ids.map(m => POSTGAME_LEGENDS[m].flag);
A(new Set(flags).size === flags.length, 'every flag is distinct, so a save gets one of each');

// one dungeon, one legendary — and never one the hand-placed table already claims
const handAt = mainSrc.indexOf('const HAND_PLACED_LEGENDS');
const handBody = mainSrc.slice(handAt, mainSrc.indexOf('\n};', handAt));
const handMaps = new Set([...handBody.matchAll(/(MAP_[A-Z0-9_]+):/g)].map(m => m[1]));
const clash = ids.filter(m => handMaps.has(m));
A(clash.length === 0, 'no dungeon is double-booked with the hand-placed legendaries', clash.join(','));

// ---------- gating ----------
A(ids.every(m => typeof POSTGAME_LEGENDS[m].requires === 'function'), 'every one is gated behind a requirement');
const bst = s => Object.values(bat[s].baseStats || {}).reduce((a, b) => a + b, 0);
const chained = ids.filter(m => /legendsCaught/.test(String(POSTGAME_LEGENDS[m].requires)));
A(chained.length >= 8, `${chained.length} of the strongest also need other legendaries caught first`, String(chained.length));
A(chained.every(m => bst(POSTGAME_LEGENDS[m].species) >= 680), 'and those are exactly the BST 680+ ones');
A(legendsCaught() === 0, 'a fresh save has caught none of them');
// with no badges at all, nothing may be available
const openNow = ids.filter(m => { try { return POSTGAME_LEGENDS[m].requires(); } catch { return false; } });
A(openNow.length === 0, 'none of them is reachable before the region is beaten', `${openNow.length} open`);

// ---------- levels and presentation ----------
const lvls = ids.map(m => POSTGAME_LEGENDS[m].level);
A(Math.min(...lvls) >= 60 && Math.max(...lvls) <= 80, 'levels sit in the postgame band', `${Math.min(...lvls)}-${Math.max(...lvls)}`);
A(ids.every(m => (POSTGAME_LEGENDS[m].intro || '').length > 20), 'every one has an intro line');
A(ids.every(m => POSTGAME_LEGENDS[m].dex === bat[POSTGAME_LEGENDS[m].species].num), 'dex numbers match the species');

// 28 of them are gen-9 with no overworld art; main.js falls back to the battle
// sprite so the tile is never an invisible trigger
const noOw = species.filter(s => !fs.existsSync(path.join(D, 'pokemon_ow', s + '.png')));
A(noOw.every(s => fs.existsSync(path.join(D, 'pokemon', bat[s].sprite || ''))),
	`the ${noOw.length} without overworld art all have a battle sprite to fall back on`,
	noOw.filter(s => !fs.existsSync(path.join(D, 'pokemon', bat[s].sprite || ''))).join(','));
A(/pokemon_ow\/\$\{id\}\.png`\)[\s\S]{0,400}?data\/pokemon\/\$\{sp\}/.test(mainSrc),
	'and main.js actually wires that fallback');

// ---------- THE ONE THAT MATTERS: every tile is reachable ----------
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'legend-')), 'u.sqlite');
const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
let browser;
try {
	A(await waitFor(() => fetch(BASE + '/overworld/pokechess.html').then(r => r.ok), 20000), 'dev server is up');
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.goto(`${BASE}/overworld/pokechess.html`, { waitUntil: 'domcontentloaded' });
	await page.evaluate(async () => {
		const eng = await import('./engine.js');
		const w = new eng.World(); await w.init(); window.__w = w;
	});

	const spots = ids.map(m => ({ map: m, x: POSTGAME_LEGENDS[m].x, y: POSTGAME_LEGENDS[m].y, species: POSTGAME_LEGENDS[m].species }));
	const bad = [];
	const CHUNK = 10;
	for (let i = 0; i < spots.length; i += CHUNK) {
		const res = await page.evaluate(async (batch) => {
			const w = window.__w, out = [];
			for (const s of batch) {
				const file = w.fileFor(s.map);
				if (!file) { out.push({ ...s, why: 'no map file' }); continue; }
				try {
					const b = await w.loadBundle(file);
					w.current = b; w.connections = {};
					w.warps = (b.map.warp_events || []).map(x => ({ ...x, x: +x.x, y: +x.y }));
					const W = b.layout.width, H = b.layout.height;
					if (s.x < 0 || s.y < 0 || s.x >= W || s.y >= H) { out.push({ ...s, why: `outside the map (${W}x${H})` }); continue; }
					if (!w.isPassable(s.x, s.y)) { out.push({ ...s, why: 'tile is solid' }); continue; }
					if (w.isSurfable(s.x, s.y)) { out.push({ ...s, why: 'tile is water' }); continue; }
					// walk from the entrances and see whether we get there
					const seen = new Uint8Array(W * H);
					const q = [];
					for (const wp of w.warps) if (wp.x >= 0 && wp.y >= 0 && wp.x < W && wp.y < H && !seen[wp.y * W + wp.x]) { seen[wp.y * W + wp.x] = 1; q.push([wp.x, wp.y]); }
					let head = 0, found = false;
					while (head < q.length && !found) {
						const [x, y] = q[head++];
						if (x === s.x && y === s.y) { found = true; break; }
						for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
							const nx = x + dx, ny = y + dy;
							if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
							const k = ny * W + nx;
							if (seen[k]) continue;
							if (!w.isPassable(nx, ny) || w.isSurfable(nx, ny)) continue;
							seen[k] = 1; q.push([nx, ny]);
						}
					}
					if (!found) out.push({ ...s, why: 'not reachable on foot from any entrance' });
				} catch (e) { out.push({ ...s, why: String(e.message || e).slice(0, 60) }); }
			}
			return out;
		}, spots.slice(i, i + CHUNK));
		bad.push(...res);
	}
	A(bad.length === 0, 'all 87 tiles are walkable and connected to an entrance',
		bad.slice(0, 5).map(b => `${b.species}@${b.map.replace('MAP_', '')}: ${b.why}`).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.kill();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
