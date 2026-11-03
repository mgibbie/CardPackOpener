// micasurvivor_dive_visuals_test.mjs — MicaSurvivor Dive visuals DV1 + DV2: the floor art painter (micasurvivor/js/expedition/
// dive-art.js; Plans/MICASURVIVOR_DIVE_VISUALS_PLAN.md). A static server, headless Chrome, a fixed guest profile.
//   1. deterministic: two pages bake byte-identical pixels for the same floor (seed, route, floor), with no Math.random
//   2. visual only: the floors' zone hashes are today's for 50 floors (the fixture), and a bake changes nothing in the layout
//   3. the 8 routes look distinct (their mean colours apart; the crater, canyon and ruins are not violet), every route bakes
//      every pixel opaque, its masks agree with the grid (a wall tile inside a wall paints as wall, a floor tile as floor),
//      it has south faces; golden pixel hashes for 3 floors per route (the fixture); the bake time and memory are logged
//      the minimap paints each route in its own colours too
//   4. in a Dive run the world draws the baked floor (G.World.drawGround's Dive branch), nothing is fetched from
//      /overworld/data/tilesets, and a page whose /overworld/data/ 404s still paints with no page errors
//   SHOTS=<dir> also saves dv2_<route>_1.png (floor 1) and dv2_<route>_2.png (floor 26) of the 8 routes.
//   node overworld/tests/micasurvivor_dive_visuals_test.mjs [--record]    (--record rewrites the fixture's golden pixels)
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites.)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8953;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const RECORD = process.argv.includes('--record');
const FIX = path.join(HERE, 'fixtures', 'micasurvivor_dive_visuals.json');
const ROUTES = ['forest', 'canyon', 'crater', 'reef', 'grotto', 'marsh', 'ruins', 'fungal'];
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const HARD = setTimeout(() => { console.log('FAIL: hard timeout (8 min)'); process.exit(1); }, 8 * 60_000);

const fetched = [];
let block404 = false;
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	if (u.startsWith('/overworld/data/')) { fetched.push(u); if (block404) { res.writeHead(404); res.end('nf'); return; } }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});

const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 4: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	pupg: { 4: { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 } },
};
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null, rnd: 0 };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	const rnd = Math.random;
	Math.random = function () { H.rnd++; return rnd(); };   // (counted: a bake must draw none)
	try {
		localStorage.setItem('micasurvivor_dev', 'ddive2');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
};

const fixture = fs.existsSync(FIX) ? JSON.parse(fs.readFileSync(FIX, 'utf8')) : {};
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage() {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, SAVE);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
		await page.evaluate(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		const loaded = await page.evaluate(() => G.Expedition.load().then(() => !!G.DiveArt, e => String(e)));
		return { ctx, page, menu, loaded };
	}
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };

	const a = await bootPage(), b = await bootPage();
	A(a.menu && b.menu && a.loaded === true && b.loaded === true, 'two pages boot and load the Expedition code with G.DiveArt', JSON.stringify([a.loaded, b.loaded]));

	// ======================== 1. deterministic
	const FLOORS = [];
	for (const r of ROUTES) for (const [seed, floor] of [[1, 1], [777, 7], [123456789, 25]]) FLOORS.push([r, seed, floor]);
	const bake = (page, list) => E(page, list => {
		const r0 = window.__t.rnd, out = {};
		for (const [route, seed, floor] of list) {
			const L = G.DiveGen.layout({ seed, route, floor }), art = G.DiveArt.build(L);
			out[route + '/' + seed + '/' + floor] = { hash: G.DiveArt.hashOf(art), ms: art.ms, bytes: art.bytes, w: art.w, h: art.h };
		}
		return { out, rnd: window.__t.rnd - r0 };
	}, list);
	const ba = await bake(a.page, FLOORS), bb = await bake(b.page, FLOORS), ba2 = await bake(a.page, FLOORS.slice(0, 4));
	const diff = Object.keys(ba.out || {}).filter(k => !bb.out || bb.out[k].hash !== ba.out[k].hash);
	A(ba.out && Object.keys(ba.out).length === FLOORS.length && !diff.length, `two pages bake byte-identical pixels for the same floor (${FLOORS.length} floors, 8 routes x 3)`, diff.join(' ') || JSON.stringify(ba).slice(0, 300));
	A(ba2.out && Object.keys(ba2.out).every(k => ba2.out[k].hash === ba.out[k].hash), 'baking a floor again gives the same pixels', JSON.stringify(ba2).slice(0, 300));
	A(ba.rnd === 0 && bb.rnd === 0, 'a bake draws no Math.random', `${ba.rnd} / ${bb.rnd}`);
	const other = await E(a.page, () => { const L = G.DiveGen.layout({ seed: 1, route: 'forest', floor: 2 }); return G.DiveArt.hashOf(G.DiveArt.build(L)); });
	A(ba.out && other !== ba.out['forest/1/1'].hash, 'another floor paints differently', other);

	// ======================== 2. visual only
	const hs = await E(a.page, () => {
		const out = {}, routes = G.DiveGen.ROUTE_IDS.filter(r => r !== 'origin');
		let changed = 0;
		for (let k = 0; k < 50; k++) {
			const route = routes[k % routes.length], seed = 1000 + k * 7919, floor = 1 + (k * 3) % 30;
			const z = G.ExpClassic.build(seed, 'dive:' + route, floor), h0 = z.hash, kind = Array.from(z.dive.kind), k2 = Array.from(z.kind);
			G.DiveArt.build(z.dive);
			if (Array.from(z.dive.kind).join() !== kind.join() || Array.from(z.kind).join() !== k2.join() || G.ExpTerrain.custom({ seed, map: z.map, zone: z.zone, w: z.w, h: z.h, x0: z.x0, y0: z.y0, kind: z.kind, prop: z.prop }).hash !== h0) changed++;
			out[route + '/' + seed + '/' + floor] = h0;
		}
		return { out, changed };
	});
	if (RECORD || !fixture.floorHashes) fixture.floorHashes = hs.out;
	const hdiff = Object.keys(fixture.floorHashes || {}).filter(k => !hs.out || hs.out[k] !== fixture.floorHashes[k]);
	A(hs.out && Object.keys(hs.out).length === 50 && !hdiff.length, 'the floors\' zone hashes are today\'s (50 floors: the fixture)', hdiff.slice(0, 5).join(' '));
	A(hs.changed === 0, 'a bake changes nothing in the layout or the zone (kind grids, hash)', hs.changed);

	// ======================== 3. the routes
	const looks = await E(a.page, ROUTES => {
		const out = {};
		for (const route of ROUTES) {
			const L = G.DiveGen.layout({ seed: 4242, route, floor: 3 }), art = G.DiveArt.build(L, { keepMask: true }), M = art.mask;
			const d = art.canvas.getContext('2d').getImageData(0, 0, art.w, art.h).data;
			let r = 0, g = 0, b = 0, opaque = 0;
			const hist = new Map();
			for (let i = 0; i < d.length; i += 4) {
				r += d[i]; g += d[i + 1]; b += d[i + 2]; if (d[i + 3] === 255) opaque++;
				const q = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5); hist.set(q, (hist.get(q) || 0) + 1);
			}
			const n = d.length / 4, dom = [...hist.entries()].sort((x, y) => y[1] - x[1])[0][0];
			// the masks against the grid: a tile walled on 8 sides paints wall at its centre; a floor tile open on 8 sides paints open
			const TP = G.DiveArt.TP, MG = G.DiveArt.MG, W = art.w;
			let bad = 0, checked = 0;
			for (let y = 1; y < L.h - 1; y++) for (let x = 1; x < L.w - 1; x++) {
				let same = true;
				const k = L.kind[y * L.w + x] === 1 ? 1 : 0;
				for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((L.kind[(y + dy) * L.w + x + dx] === 1 ? 1 : 0) !== k) same = false;
				if (!same || (L.plugs || []).some(p => [p.at, p.at2].some(q => q && Math.abs(q[0] - x) <= 1 && Math.abs(q[1] - y) <= 1))) continue;
				checked++;
				const m = M[((y + MG) * TP + 8) * W + (x + MG) * TP + 8];
				if ((m === 1) !== (k === 1)) bad++;
			}
			out[route] = { mean: [r / n, g / n, b / n].map(Math.round), dom: [(dom >> 6) * 32 + 16, ((dom >> 3) & 7) * 32 + 16, (dom & 7) * 32 + 16], opaque: opaque === n, bad, checked, faces: art.counts.face, ms: art.ms, bytes: art.bytes };
		}
		return out;
	}, ROUTES);
	const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
	const close = [];
	for (let i = 0; i < ROUTES.length; i++) for (let j = i + 1; j < ROUTES.length; j++) { const p = looks[ROUTES[i]], q = looks[ROUTES[j]]; if (p && q && dist(p.mean, q.mean) < 18) close.push(ROUTES[i] + '~' + ROUTES[j] + ' ' + Math.round(dist(p.mean, q.mean))); }
	A(looks && !looks.error && !close.length, 'the 8 routes look distinct: every pair\'s mean colour >= 18 apart', close.join(', ') || JSON.stringify(Object.fromEntries(Object.entries(looks).map(([k, v]) => [k, v.mean]))));
	const violet = c => c[2] > c[1] + 12 && c[0] > c[1] + 4;   // (blue and red over green: mauve / violet)
	A(looks.crater && !violet(looks.crater.mean) && !violet(looks.canyon.mean) && !violet(looks.ruins.mean) && looks.crater.mean[0] >= looks.crater.mean[2]
		&& looks.canyon.mean[0] > looks.canyon.mean[2] + 40 && looks.forest.mean[1] > looks.forest.mean[0] && looks.reef.mean[2] > looks.reef.mean[0] && looks.grotto.mean[2] > 150,
	'each route in its own colour: the crater warm (not violet), the canyon orange, the woods green, the reef and the grotto blue', JSON.stringify(Object.fromEntries(Object.entries(looks).map(([k, v]) => [k, v.mean]))));
	A(ROUTES.every(r => looks[r] && looks[r].opaque), 'every route bakes every pixel opaque');
	A(ROUTES.every(r => looks[r] && looks[r].bad === 0 && looks[r].checked > 200), 'the masks follow the grid: no wall tile painted as ground, no floor tile as wall (inner tiles)', JSON.stringify(Object.fromEntries(ROUTES.map(r => [r, looks[r] && [looks[r].bad, looks[r].checked]]))));
	A(ROUTES.every(r => looks[r] && looks[r].faces > 2000), 'every route paints south faces', JSON.stringify(Object.fromEntries(ROUTES.map(r => [r, looks[r] && looks[r].faces]))));
	// golden pixels (3 floors a route); --record rewrites them after a deliberate change of the look
	const gold = Object.fromEntries(Object.entries(ba.out || {}).map(([k, v]) => [k, v.hash]));
	if (RECORD || !fixture.golden) fixture.golden = gold;
	const gdiff = Object.keys(fixture.golden || {}).filter(k => gold[k] !== fixture.golden[k]);
	A(Object.keys(gold).length === FLOORS.length && !gdiff.length, `golden pixels: 3 floors a route match the fixture (${FLOORS.length})`, gdiff.slice(0, 6).join(' ') + (gdiff.length ? '  (a deliberate change of the look: --record)' : ''));
	const msAll = Object.values(ba.out || {}).map(v => v.ms), mean = msAll.reduce((x, y) => x + y, 0) / Math.max(1, msAll.length), mx = Math.max(...msAll);
	const mem = ba.out && Object.values(ba.out)[0];
	console.log(`     bake: mean ${mean.toFixed(1)} ms, max ${mx.toFixed(1)} ms over ${msAll.length} floors; ${mem && mem.w} x ${mem && mem.h} px, ${(mem && mem.bytes / 1048576).toFixed(2)} MB a floor (canvas + pattern)`);
	A(mean < 1200 && mem && mem.bytes < 3.2 * 1048576, `the bake is a one-off per floor: mean ${mean.toFixed(0)} ms (budget 1200 ms headless), ${(mem && mem.bytes / 1048576).toFixed(2)} MB`);

	// the minimap shows each route in its own colours (dive-gen.js zone() -> G.DiveArt.mini): the crater warm, not Mt. Moon's violet
	const mm = await E(a.page, ROUTES => {
		const out = {};
		for (const route of ROUTES) {
			const z = G.ExpClassic.build(31337, 'dive:' + route, 2), L = z.dive;
			let wall = null, floor = null;
			for (let y = 1; y < L.h - 1 && !(wall && floor); y++) for (let x = 1; x < L.w - 1; x++) {
				const k = L.kind[y * L.w + x], tx = x + z.x0, ty = y + z.y0;
				if (k === 1 && !wall) wall = z.mini([128, 128, 128], tx, ty).map(Math.round);
				if (k === 0 && !floor && L.kind[(y + 1) * L.w + x] === 0) floor = z.mini([128, 128, 128], tx, ty).map(Math.round);
			}
			out[route] = { wall, floor };
		}
		return out;
	}, ROUTES);
	A(mm.crater && !violet(mm.crater.wall) && !violet(mm.crater.floor) && !violet(mm.canyon.floor) && !violet(mm.ruins.floor) && mm.forest.floor[1] > mm.forest.floor[0] && mm.canyon.floor[0] > mm.canyon.floor[2] + 40,
		'the minimap paints each route in its own colours (the crater, canyon and ruins not violet)', JSON.stringify(mm));

	// ======================== 4. in a run
	fetched.length = 0;
	const run = await E(a.page, async () => {
		const H = window.__t;
		G.Expedition.diveRoute('forest'); G.Expedition.diveStart(1);
		await G.Flow.play('exp-dive');
		const b0 = G.DiveArt.stats.bakes;
		H.thaw();
		await new Promise(r => setTimeout(r, 700));
		H.freeze();
		const z = G.World.zone, z2 = G.ExpClassic.build(G.World.seed, z.map, z.zone);
		return { dive: !!(z && z.dive), baked: G.DiveArt.stats.bakes - b0, cached: G.DiveArt.cached, hash: z.hash === z2.hash, last: G.DiveArt.stats.last };
	});
	A(run.dive && run.baked >= 1 && run.cached >= 1 && run.hash, 'a Dive run: the world draws the baked floor (one bake on the floor\'s first frame), the zone hash as built', JSON.stringify(run));
	A(!fetched.some(u => u.startsWith('/overworld/data/tilesets/')), 'the painter needs no tileset: nothing fetched from /overworld/data/tilesets', fetched.filter(u => /tilesets/.test(u)).slice(0, 3).join(' '));
	console.log(`     in-game bake: ${run.last && run.last.ms} ms (parts ${run.last && JSON.stringify(run.last.parts)})`);

	// the base modes never reach it: no zone, no Dive art
	const base = await E(a.page, () => { G.Game.quit && G.Game.quit(); return { zone: G.World.zone && G.World.zone.dive ? 'dive' : null }; });
	A(!base.error, 'quitting the run leaves the page well', JSON.stringify(base));

	// a page whose /overworld/data/ 404s still paints (no assets needed), with no page errors
	block404 = true;
	const e0 = errors.length;
	const c = await bootPage();
	const off = await E(c.page, async () => {
		const H = window.__t;
		G.Expedition.diveRoute('crater'); G.Expedition.diveStart(1);
		await G.Flow.play('exp-dive');
		H.thaw(); await new Promise(r => setTimeout(r, 600)); H.freeze();
		return { baked: G.DiveArt.stats.bakes, route: G.DiveArt.stats.last && G.DiveArt.stats.last.route };
	});
	block404 = false;
	A(off.baked >= 1 && off.route === 'crater' && errors.length === e0, 'with /overworld/data/ 404ing the floor still paints, no page errors', JSON.stringify(off) + ' ' + errors.slice(e0).join(' | '));
	await c.ctx.close();

	// ======================== screenshots (SHOTS=<dir>): floor 1 and floor 26 of each route
	if (SHOTS) {
		fs.mkdirSync(SHOTS, { recursive: true });
		for (const route of ROUTES) for (const [n, floor] of [[1, 1], [2, 26]]) {
			const d = await bootPage();
			const ok = await E(d.page, async (route, floor) => {
				const H = window.__t;
				if (floor > 1) G.ExpSave.best('dive.' + route + '.stage', floor);
				G.Expedition.diveRoute(route); G.Expedition.diveStart(floor);
				await G.Flow.play('exp-dive');
				const pl = G.Game.player; pl.gainXp = () => 0; pl.hurt = () => {};
				H.thaw();
				return G.ExpDive.run && G.ExpDive.run.floor;
			}, route, floor);
			await sleep(1500);
			const file = path.join(SHOTS, `dv2_${route}_${n}.png`);
			await d.page.screenshot({ path: file });
			console.log(`     screenshot: ${file} (floor ${ok})`);
			await d.ctx.close();
		}
	}
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
	await a.ctx.close(); await b.ctx.close();
} catch (e) {
	A(false, 'the test ran to the end', e && e.stack);
} finally {
	if (browser) await browser.close();
	server.close();
	clearTimeout(HARD);
}
if (RECORD || (!fs.existsSync(FIX) && fixture.golden && fixture.floorHashes)) { fs.mkdirSync(path.dirname(FIX), { recursive: true }); fs.writeFileSync(FIX, JSON.stringify(fixture, null, '\t') + '\n'); console.log('     wrote ' + FIX); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
