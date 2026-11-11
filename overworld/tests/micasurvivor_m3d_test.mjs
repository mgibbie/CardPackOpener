// micasurvivor_m3d_test.mjs — MicaSurvivor 3D, P0 (Plans/MICASURVIVOR_3D_PLAN.md): the test room at /micasurvivor/m3d/
// in headless Chrome. (The rules of moving are tested in node: micasurvivor_m3d_sim_test.mjs.)
//   * the page boots: WebGL, the room's terrain, the lead and a crowd of 100 sprites
//   * sprites are batched: one draw call per sprite sheet, so 100 sprites cost about a dozen draw calls, not 100
//   * something is really drawn (the frame has sky, floor and sprite colours in it)
//   * the lead moves by the page's own input path: forward is away from the camera, right is the screen's right,
//     whatever way the camera is turned; a jump leaves the floor and comes back
//   * a still sprite shows a different one of its 8 facing rows as the camera orbits it
//   * the phone layout: the same scene at 390 × 844, with the touch buttons shown
//   * the rules cost a small fraction of a frame; frame times are REPORTED (software GL here: not a phone's numbers)
//   * P1: who you play decides how it moves (?dex=6: Charizard is Fire / Flying — the readout names its traits and it has
//     two air jumps); the camera, left alone, swings round behind the way you run, and any camera input takes it back;
//     ?follow=0 turns that off; the pool is drawn and you can swim in it through the page's own loop
//   * P2: ?gen=<seed> plays a generated level (gen.js; its rules are tested in node: micasurvivor_m3d_gen_test.mjs): it
//     boots and is drawn; the minimap is drawn FROM the level (rim, water, height) with you as an arrow and the exit as
//     a ring; standing in the exit ends the level and loads the next seed in the same biome; the test room is unchanged
//   node overworld/tests/micasurvivor_m3d_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8973;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 700) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const open = async (vp, query = '?n=100') => {
		const page = await browser.newPage();
		await page.setViewport(vp);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/${query}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000);
		return { page, ok };
	};
	const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };
	// the colours in the frame just drawn (read in the same animation frame as the page's own draw)
	const colours = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => {
		const src = document.getElementById('c'), c = document.createElement('canvas'); c.width = 160; c.height = 90;
		const g = c.getContext('2d'); g.drawImage(src, 0, 0, 160, 90);
		const d = g.getImageData(0, 0, 160, 90).data, seen = new Set(); let sky = 0, green = 0;
		for (let i = 0; i < d.length; i += 4) { seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); if (d[i + 2] > 200 && d[i] > 130 && d[i] < 190) sky++; if (d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2] + 25) green++; }
		r({ distinct: seen.size, sky, green, total: d.length / 4 });
	})));

	// ======================== desktop
	const { page, ok } = await open({ width: 1280, height: 720, deviceScaleFactor: 1 });
	A(ok, 'the test room boots (WebGL, the room, the sprites)');
	await sleep(1200);
	const s0 = await page.evaluate(() => { const m = window.__m3d, s = m.stats(); return { stats: s, sheets: [...m.sheets.keys()], crowd: m.crowd.length, species: new Set(m.crowd.map(e => e.dex)).size, k: [m.K.JUMP_V, m.K.RUN, m.K.AIR_CAP], hud: document.getElementById('hud').textContent }; });
	A(s0.crowd === 100 && s0.species >= 6, `a crowd of 100 sprites of ${s0.species} species`, JSON.stringify(s0));
	A(s0.stats.calls > 0 && s0.stats.calls <= s0.sheets.length + 3 && s0.stats.calls < 20, `sprites are batched by sheet: ${s0.stats.calls} draw calls for ${s0.crowd} sprites + the terrain + the shadows (${s0.sheets.length} sheets)`, JSON.stringify(s0.stats));
	A(s0.stats.triangles > 1500, 'the terrain mesh, the sprites and their shadows are in the frame', String(s0.stats.triangles));
	A(/fps/.test(s0.hud) && /100 sprites/.test(s0.hud) && /idle/.test(s0.hud), 'the readout shows the frame rate, the crowd and what the lead is doing', s0.hud);
	const c0 = await colours(page);
	A(c0.distinct > 40 && c0.green > c0.total * 0.08, 'the frame really has a scene in it (floor greens and many colours, not a blank canvas)', JSON.stringify(c0));
	await shot(page, 'm3d_desktop.png');

	// ---- moving: forward is away from the camera, right is the screen's right, whatever way the camera faces
	const move = async (yaw) => page.evaluate(async (yaw) => {
		const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms));
		const go = async (input) => { m.respawn(); m.cam.yaw = yaw; m.setInput(input); await wait(700); const s = { x: m.state.x, z: m.state.z }; m.setInput(null); return s; };
		const fx = Math.sin(yaw), fz = Math.cos(yaw), o = { x: m.room.spawn[0], z: m.room.spawn[2] };
		// what the page's own device path computes for "forward" and "right" at this yaw
		const fwd = await go({ mx: fx, mz: fz }), rgt = await go({ mx: -fz, mz: fx });
		// project the moves on to the screen: forward should go up the screen (away), right should go right
		const cam = m.cam, proj = (p) => { const dx = p.x - o.x, dz = p.z - o.z; return { away: dx * fx + dz * fz, right: dx * -fz + dz * fx, dist: Math.hypot(dx, dz) }; };
		return { fwd: proj(fwd), rgt: proj(rgt) };
	}, yaw);
	for (const yaw of [Math.PI, Math.PI + 0.5]) {   // (two headings with clear floor ahead and to the right of the spawn)
		const mv = await move(yaw);
		A(mv.fwd.away > 2.5 && Math.abs(mv.fwd.right) < 0.5 && mv.rgt.right > 2.5 && Math.abs(mv.rgt.away) < 0.5, `camera turned to ${yaw.toFixed(2)} rad: forward runs away from the camera, right runs to the screen's right`, JSON.stringify(mv));
	}
	// the keyboard goes through the same path
	const kb = await page.evaluate(async () => { const m = window.__m3d; m.respawn(); m.cam.yaw = Math.PI; return { x: m.state.x, z: m.state.z }; });
	await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW');
	const kb1 = await page.evaluate(() => ({ x: window.__m3d.state.x, z: window.__m3d.state.z }));
	A(kb1.z < kb.z - 2 && Math.abs(kb1.x - kb.x) < 0.5, 'W on the keyboard runs away from the camera (north, with the camera looking north)', JSON.stringify([kb, kb1]));
	await page.keyboard.down('Space'); let top = 0;
	for (let i = 0; i < 12; i++) { await sleep(40); top = Math.max(top, await page.evaluate(() => window.__m3d.state.y)); }
	await page.keyboard.up('Space');
	const landed = await waitFor(() => page.evaluate(() => window.__m3d.state.grounded && window.__m3d.state.y === 0), 3000);
	A(top > 1.2 && landed, `Space jumps (it reached ${top.toFixed(2)} m) and you come back to the floor`, String(top));

	// ---- a still sprite shows another facing row as the camera goes round it
	const rows = await page.evaluate(() => { const m = window.__m3d, e = m.crowd[0], out = []; for (let i = 0; i < 8; i++) out.push(m.rowOf(e.facing, i * Math.PI / 4)); return out; });
	A(new Set(rows).size === 8, 'orbiting the camera round a still sprite shows all 8 of its facing rows', rows.join(''));

	// ---- feet on the floor: a sheet's anchor is the middle of the footprint, and the feet / tail are drawn BELOW it.
	// (the owner, on the live page: "my pikachu has its feet/butt sinking through the floor")
	const feet = await page.evaluate(() => {
		const m = window.__m3d, out = [];
		for (const [key, s] of m.sheets) {
			// independently: the lowest opaque pixel of each row, by reading the sheet
			const c = document.createElement('canvas'); c.width = s.img.width; c.height = s.img.height; const g = c.getContext('2d'); g.drawImage(s.img, 0, 0);
			const d = g.getImageData(0, 0, c.width, c.height).data; let worstBelow = 0, sunk = 0;
			for (let r = 0; r < s.meta.r; r++) {
				let low = -1;
				for (let y = s.meta.h - 1; y >= 0 && low < 0; y--) for (let x = 0; x < s.meta.n * s.meta.w; x++) if (d[((r * s.meta.h + y) * c.width + x) * 4 + 3] > 127) { low = y; break; }
				const below = Math.max(0, low + 1 - s.meta.ay);          // px drawn under the anchor
				worstBelow = Math.max(worstBelow, below);
				// the quad as the page builds it: where is that lowest pixel's bottom edge, relative to the feet?
				const q = m.quadOf(key, 0, r), px = (q.rect[3] - q.rect[1]) / s.meta.h, bottomOfLowest = q.rect[3] - (low + 1) * px;
				// never under the floor; and exactly on it when the art went below the anchor (a row whose lowest pixel is above
				// the anchor is a hovering sprite — Gastly — and is left hovering)
				if (bottomOfLowest < -1e-6 || (below > 0 && bottomOfLowest > 1e-6)) sunk++;
			}
			out.push({ key, worstBelow, sunk });
		}
		return out;
	});
	A(feet.length >= 8 && feet.some(f => f.worstBelow >= 3), 'the sheets really do draw below their anchor (some by 3 px or more: feet, tails)', JSON.stringify(feet.map(f => f.key + ':' + f.worstBelow)));
	A(feet.every(f => f.sunk === 0), 'every sprite stands on its lowest pixel: in each of its 8 facings nothing is drawn under the floor (and one that hovers still hovers)', JSON.stringify(feet.filter(f => f.sunk)));

	// ---- cost
	await sleep(1500);
	const p = await page.evaluate(() => window.__m3d.stats());
	A(p.simP95 < 2, `the rules cost a small fraction of a frame (p95 ${p.simP95} ms of 16.7)`, JSON.stringify(p));
	console.log(`     frame times here (software GL, NOT a phone): median ${p.p50} ms, p95 ${p.p95} ms, ${p.calls} draw calls, ${p.triangles} triangles`);
	await page.close();

	// ======================== P1: traits, the follow camera, the pool
	{
		const z = await open({ width: 1280, height: 720, deviceScaleFactor: 1 }, '?n=20&dex=6');
		A(z.ok, '?dex=6 boots (Charizard)');
		await sleep(600);
		const t = await z.page.evaluate(() => { const m = window.__m3d; return { types: m.TYPES, traits: m.TRAITS, airJumps: m.TUNE.AIR_JUMPS, glide: m.TUNE.GLIDE, boost: m.TUNE.SLIDE_BOOST, base: m.K.AIR_JUMPS, hud: document.getElementById('hud').textContent, state: m.state.airJumps }; });
		A(t.types.join() === 'fire,flying' && t.airJumps === 2 && t.glide && t.boost === 3.6 && t.base === 1 && t.state === 2, 'Charizard is Fire / Flying: two air jumps, a glide, a bigger slide kick (the base tuning untouched)', JSON.stringify(t));
		A(/Charizard \(fire \/ flying\)/.test(t.hud) && /traits: fire, flying/.test(t.hud), 'the readout names who you play and its traits', t.hud);
		// the follow camera: run east for a while with no camera input
		const f = await z.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.respawn(); m.cam.yaw = Math.PI; m.cam.manual = 0; m.setInput({ mx: -1, mz: 0 }); await wait(1800); const yaw = m.cam.yaw; m.setInput(null); return { yaw, want: Math.atan2(-1, 0) }; });
		const dy = Math.abs(Math.atan2(Math.sin(f.yaw - Math.PI), Math.cos(f.yaw - Math.PI)));
		A(dy > 0.35, 'left alone, the camera swings round behind the way you are running', JSON.stringify([f, dy]));
		const man = await z.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.respawn(); m.cam.yaw = Math.PI; m.cam.manual = performance.now() + 60000; m.setInput({ mx: -1, mz: 0 }); await wait(900); const yaw = m.cam.yaw; m.setInput(null); return yaw; });
		A(Math.abs(man - Math.PI) < 1e-6, '...and stays where you put it while you are steering it yourself', String(man));
		// the pool, through the page's own loop
		const sw = await z.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.put(41, 17, -1.1); m.cam.yaw = Math.PI / 2; m.cam.manual = performance.now() + 60000; await wait(500); const a = { swimming: m.state.swimming, y: +m.state.y.toFixed(2), hud: document.getElementById('hud').textContent }; return a; });
		A(sw.swimming && Math.abs(sw.y + 1.1) < 0.06 && /swimming/.test(sw.hud), 'put in the pool you float at the surface, and the readout says swimming', JSON.stringify(sw));
		const cw = await colours(z.page);
		A(cw.sky + cw.green > 0 && cw.distinct > 30, 'the pool is drawn (a scene with the water in it)', JSON.stringify(cw));
		await shot(z.page, 'm3d_pool.png');
		await z.page.close();
		const nf = await open({ width: 900, height: 600, deviceScaleFactor: 1 }, '?n=5&follow=0');
		const off = await nf.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.cam.yaw = Math.PI; m.cam.manual = 0; m.setInput({ mx: -1, mz: 0 }); await wait(1500); return { yaw: m.cam.yaw, follow: m.cam.follow }; });
		A(off.follow === false && Math.abs(off.yaw - Math.PI) < 1e-6, '?follow=0: the camera never moves by itself', JSON.stringify(off));
		await nf.page.close();
	}

	// ======================== P2: a generated level (?gen=<seed>)
	{
		const g = await open({ width: 1280, height: 720, deviceScaleFactor: 1 }, '?gen=7&n=60');
		A(g.ok, '?gen=7 boots: a generated level instead of the test room');
		await sleep(900);
		const gi = await g.page.evaluate(() => { const m = window.__m3d, r = m.room, map = document.getElementById('map');
			return { gen: m.gen, biome: m.biome, w: r.w, tiles: r.tiles.length, ok: r.check.ok, spawn: r.spawn, exit: r.exit, at: [m.state.x, m.state.y, m.state.z], crowd: m.crowd.length, calls: m.stats().calls, tris: m.stats().triangles,
				hud: document.getElementById('hud').textContent, map: { shown: getComputedStyle(map).display !== 'none', w: map.width, h: map.height, right: map.getBoundingClientRect().right <= innerWidth, top: map.getBoundingClientRect().top >= 0 } }; });
		A(gi.gen === 7 && gi.biome === 'meadow' && gi.w === 37 && gi.tiles === 25 && gi.ok, 'it is level 7 of the meadow: 5 × 5 tiles, 37 × 37 cells, and it passed its own check', JSON.stringify(gi));
		A(Math.hypot(gi.at[0] - gi.spawn[0], gi.at[2] - gi.spawn[2]) < 0.5 && Math.abs(gi.at[1] - gi.spawn[1]) < 0.05, 'you start on the spawn tile, standing on its floor', JSON.stringify([gi.at, gi.spawn]));
		A(gi.crowd === 60 && gi.calls < 22 && gi.tris > 4000, `the level, its scatter, the exit and 60 sprites in ${gi.calls} draw calls`, JSON.stringify(gi));
		A(/level 7 · meadow · 5 × 5 tiles · exit \d+ m/.test(gi.hud), 'the readout names the level and how far the exit is', gi.hud);
		// the minimap is drawn from the level: sample it against the level's own cells
		A(gi.map.shown && gi.map.w === 37 * 4 && gi.map.h === 37 * 4 && gi.map.right && gi.map.top, 'the minimap is on screen: 4 px a cell', JSON.stringify(gi.map));
		const mm = await g.page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => { const m = window.__m3d, r = m.room, map = document.getElementById('map'), c = map.getContext('2d'), k = 4 / 2;
			const px = (x, y) => [...c.getImageData(x, y, 1, 1).data.slice(0, 3)];
			let water = 0, waterOk = 0, rimOk = 0, rim = 0, lo = null, hi = null;
			for (let cz = 0; cz < r.h; cz++) for (let cx = 0; cx < r.w; cx++) { const i = cz * r.w + cx, p = px(cx * 4 + 1, cz * 4 + 1);
				if (Math.hypot((cx + .5) * 2 - m.state.x, (cz + .5) * 2 - m.state.z) < 8 || Math.hypot((cx + .5) * 2 - r.exit[0], (cz + .5) * 2 - r.exit[2]) < 6 || Math.hypot((cx + .5) * 2 - r.spawn[0], (cz + .5) * 2 - r.spawn[2]) < 3) continue;   // (under the arrow / the ring / the spawn dot)
				if (r.cells[i] >= r.rimH) { rim++; if (p[0] < 40 && p[1] < 50) rimOk++; }
				else if (r.water.has(i)) { water++; if (p[2] > p[0] + 60 && p[2] > 200) waterOk++; }
				else if (!r.slopes.has(i) && !r.mats.has(i)) { if (r.cells[i] === 0) lo = p; if (r.cells[i] === 3) hi = p; } }
			// the arrow: red pixels where you are, and nowhere far from you
			let red = 0, redFar = 0; const d = c.getImageData(0, 0, map.width, map.height).data;
			for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) { const o = (y * map.width + x) * 4; if (d[o] > 230 && d[o + 1] < 90 && d[o + 2] < 90) { red++; if (Math.hypot(x - m.state.x * k, y - m.state.z * k) > 9) redFar++; } }
			// the exit ring: pale yellow pixels 3-8 px from the exit's place
			let ring = 0; for (let a = 0; a < 6.28; a += 0.2) for (let rr = 3; rr <= 8; rr++) { const p = px(Math.round(r.exit[0] * k + Math.cos(a) * rr), Math.round(r.exit[2] * k + Math.sin(a) * rr)); if (p[0] > 230 && p[1] > 220 && p[2] > 120 && p[2] < 200) ring++; }
			res({ water, waterOk, rim, rimOk, lo, hi, red, redFar, ring }); }))));
		A(mm.rim > 100 && mm.rimOk === mm.rim && mm.water > 5 && mm.waterOk === mm.water, `the minimap agrees with the level: every rim cell dark (${mm.rim}), every water cell blue (${mm.water})`, JSON.stringify(mm));
		A(mm.lo && mm.hi && mm.hi[1] > mm.lo[1] + 40, '...and higher floor is drawn lighter', JSON.stringify([mm.lo, mm.hi]));
		A(mm.red > 15 && mm.redFar === 0 && mm.ring > 8, 'you are an arrow on it, and the exit a ring', JSON.stringify(mm));
		const cg = await colours(g.page);
		A(cg.distinct > 40 && cg.green > cg.total * 0.08, 'the level is really drawn', JSON.stringify(cg));
		await shot(g.page, 'm3d_gen.png');
		// the page's own loop walks it: a direction moves you
		const mv = await g.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); const x = m.state.x, z = m.state.z; m.setInput({ mx: 0, mz: -1 }); await wait(500); m.setInput(null); return Math.hypot(m.state.x - x, m.state.z - z); });
		A(mv > 1, 'you can run about in it', String(mv));
		// the exit: standing in the column of light ends the level (held here, so the page stays to be read)
		const ex = await g.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.holdExit = true; const before = m.leaving; m.put(m.room.exit[0] + 6, m.room.exit[2]); await wait(300); const far = m.leaving; m.put(m.room.exit[0] + 0.5, m.room.exit[2]); await wait(400); return { before, far, at: m.leaving, hud: document.getElementById('hud').textContent, url: location.search }; });
		A(!ex.before && !ex.far && ex.at && /exit reached/.test(ex.hud) && /gen=7/.test(ex.url), 'the exit: 6 m away nothing happens; standing in it, the level is over', JSON.stringify(ex));
		await g.page.close();
		// ...and not held: the next seed loads
		const g2 = await open({ width: 900, height: 600, deviceScaleFactor: 1 }, '?gen=7&n=5&biome=peaks');
		await g2.page.evaluate(() => { const m = window.__m3d; m.put(m.room.exit[0], m.room.exit[2]); });
		const nxt = await waitFor(() => g2.page.evaluate(() => /gen=8/.test(location.search) && !!(window.__m3d && window.__m3d.ready) && window.__m3d.gen === 8 && window.__m3d.biome === 'peaks'), 15000);
		A(nxt, 'reaching the exit loads the next level: seed 8, the same biome (peaks)', await g2.page.evaluate(() => location.search));
		const pk = await g2.page.evaluate(() => { const r = window.__m3d.room; return { ok: r.check.ok, top: Math.max(...r.tiles.map(t => t.level)) }; });
		A(pk.ok && pk.top >= 3, 'peaks: a level with four or five height levels, checked', JSON.stringify(pk));
		await sleep(500);
		await shot(g2.page, 'm3d_gen_peaks.png');
		await g2.page.close();
		// the test room is unchanged: no minimap, no level line
		const tr = await open({ width: 900, height: 600, deviceScaleFactor: 1 }, '?n=5');
		const tv = await tr.page.evaluate(() => ({ map: getComputedStyle(document.getElementById('map')).display, gen: window.__m3d.gen, hud: document.getElementById('hud').textContent, w: window.__m3d.room.w }));
		A(tv.map === 'none' && tv.gen === null && !/level/.test(tv.hud) && tv.w === 24, 'without ?gen the test room is as it was: no minimap, no level', JSON.stringify(tv));
		await tr.page.close();
	}

	// ======================== phone
	const ph = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	A(ph.ok, 'phone (390 × 844): the test room boots');
	await sleep(1000);
	const pv = await ph.page.evaluate(() => { const b = document.getElementById('b-jump'), s = document.getElementById('b-slide'), r = b.getBoundingClientRect(), r2 = s.getBoundingClientRect(), m = window.__m3d.stats();
		return { jump: getComputedStyle(b).display !== 'none' && r.right <= innerWidth && r.bottom <= innerHeight, slide: getComputedStyle(s).display !== 'none' && r2.right <= innerWidth, help: getComputedStyle(document.getElementById('help')).display, overflow: document.documentElement.scrollWidth - innerWidth, crowd: m.crowd, dpr: m.dpr, size: m.size }; });
	A(pv.jump && pv.slide && pv.help === 'none' && pv.overflow <= 0, 'the touch buttons (JUMP, SLIDE) are on screen; the keyboard help is hidden; nothing overflows', JSON.stringify(pv));
	A(pv.crowd === 100 && pv.dpr <= 1.5, 'the same 100 sprites; the pixel ratio is capped at 1.5 as in the 2D game', JSON.stringify(pv));
	const jb = await ph.page.evaluate(() => { const r = document.getElementById('b-jump').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
	await ph.page.touchscreen.touchStart(jb.x, jb.y); let ptop = 0;
	for (let i = 0; i < 10; i++) { await sleep(40); ptop = Math.max(ptop, await ph.page.evaluate(() => window.__m3d.state.y)); }
	await ph.page.touchscreen.touchEnd();
	A(ptop > 1, `the JUMP button jumps (it reached ${ptop.toFixed(2)} m)`, String(ptop));
	const c1 = await colours(ph.page);
	A(c1.distinct > 30 && c1.green > c1.total * 0.05, 'the phone frame has the scene in it', JSON.stringify(c1));
	await shot(ph.page, 'm3d_phone.png');
	await ph.page.close();

	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
