// micasurvivor_dive_visuals_test.mjs — MicaSurvivor Dive visuals DV1 + DV2 + DV3 + DV4 + DV5: the floor art painter
// (micasurvivor/js/expedition/dive-art.js; Plans/MICASURVIVOR_DIVE_VISUALS_PLAN.md). A static server, headless Chrome,
// a fixed guest profile.
//   1. deterministic: two pages bake byte-identical pixels for the same floor (seed, route, floor), with no Math.random
//   2. visual only: the floors' zone hashes are today's for 50 floors (the fixture), and a bake changes nothing in the layout
//   3. the 8 routes look distinct (their mean colours apart; the crater, canyon and ruins are not violet), every route bakes
//      every pixel opaque, its masks agree with the grid (a wall tile inside a wall paints as wall, a floor tile as floor),
//      it has south faces; golden pixel hashes for 3 floors per route (the fixture); the bake time and memory are logged
//      the minimap paints each route in its own colours too
//   4. in a Dive run the world draws the baked floor (G.World.drawGround's Dive branch), nothing is fetched from
//      /overworld/data/tilesets, and a page whose /overworld/data/ 404s still paints with no page errors
//   5. the canopy (DV3): the lush routes bake bands + occ (the rock routes none at all), the lip never lands on a wall
//      and both pages bake the same lip; an actor the canopy hides comes back over it as a tinted silhouette (gold for
//      you, pale blue for anyone else), the same actor on open ground draws nothing; in a Dive run both gates in
//      game.drawScene fire every frame, and a Normal run never reaches either
//   6. the light pass (DV4): every route's light map is the plan's colour and alpha (lava .74, swamp .5, shroom .6,
//      sea .38, ice .24, ruins .12; the woods, the desert and the Origin none), in a run it fills the view and cuts a
//      hole for your lamp, fx 0 skips it (and the shafts), calm stops the flicker, and the pass draws no rng: the same
//      time paints the same canvas. The lit routes get sun shafts + motes, the woods no light map at all
//   7. the Dive view + HUD (DV5): a Dive camera is the plan's 640 x 350 at 1280 x 720 (scale 2), it follows at 6/s
//      instead of the classic 9/s, the HUD line keeps its text, and on the phone (844 x 390) the camera refits and
//      every HUD element fits inside the screen, the Dive card, the floor pill and the minimap not overlapping
//   SHOTS=<dir> also saves dv2_<route>_1.png (floor 1) and dv2_<route>_2.png (floor 26) of the 8 routes,
//   dv3_silhouette.png (you behind a wall, under the lip), dv4_light.png (the crater's light map) and
//   dv4_shafts.png (the forest's sun shafts), dv5_hud.png (the Dive HUD) and dv5_phone.png (it at 844 x 390).
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
		await page.evaluate(() => {   // music off (the real fn, kept: it also stops the note scheduler, which draws rng)
			G.Audio.sfx = () => {}; G.Audio._music = G.Audio.music; G.Audio.music = () => {}; G.Audio._music(null);
		});
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
			out[route + '/' + seed + '/' + floor] = { hash: G.DiveArt.hashOf(art), ms: art.ms, bytes: art.bytes, bands: art.bandBytes || 0, w: art.w, h: art.h };
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
	console.log(`     bake: mean ${mean.toFixed(1)} ms, max ${mx.toFixed(1)} ms over ${msAll.length} floors; ${mem && mem.w} x ${mem && mem.h} px, ${(mem && mem.bytes / 1048576).toFixed(2)} MB a floor (canvas + pattern)` + (mem && mem.bands ? `, ${(mem.bands / 1048576).toFixed(2)} MB canopy bands + occ` : ''));
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
		H.hooks = { bands: 0, sil: 0, light: 0, amb: 0 };   // the canopy gates (DV3) and the style pass (DV4), counted
		H._db = G.ExpDive.bands; H._ds = G.ExpDive.drawSilhouettes;
		H._dl = G.ExpDive.drawLight; H._da = G.ExpDive.drawAmbience;
		G.ExpDive.bands = cam => { H.hooks.bands++; return H._db(cam); };
		G.ExpDive.drawSilhouettes = (c, ents) => { H.hooks.sil++; return H._ds(c, ents); };
		G.ExpDive.drawLight = (c, w, h, t) => { H.hooks.light++; return H._dl(c, w, h, t); };
		G.ExpDive.drawAmbience = (c, w, h, t) => { H.hooks.amb++; return H._da(c, w, h, t); };
		H.thaw();
		await new Promise(r => setTimeout(r, 700));
		H.freeze();
		const z = G.World.zone, z2 = G.ExpClassic.build(G.World.seed, z.map, z.zone);
		return { dive: !!(z && z.dive), baked: G.DiveArt.stats.bakes - b0, cached: G.DiveArt.cached, hash: z.hash === z2.hash, last: G.DiveArt.stats.last, hooks: { ...H.hooks } };
	});
	A(run.dive && run.baked >= 1 && run.cached >= 1 && run.hash, 'a Dive run: the world draws the baked floor (one bake on the floor\'s first frame), the zone hash as built', JSON.stringify(run));
	A(!fetched.some(u => u.startsWith('/overworld/data/tilesets/')), 'the painter needs no tileset: nothing fetched from /overworld/data/tilesets', fetched.filter(u => /tilesets/.test(u)).slice(0, 3).join(' '));
	console.log(`     in-game bake: ${run.last && run.last.ms} ms (parts ${run.last && JSON.stringify(run.last.parts)})`);

	// ======================== 5. the canopy: the lip, the occlusion, the silhouette (DV3)
	// (a) the bake data. The lush routes (forest, marsh, fungal) bake bands + occ; the rock routes bake none at all. The
	//     lip never lands on a wall, and every px it covers sits north of the wall edge it hangs from (occ > the px's own
	//     y): only that side's band sorts over an actor standing there. Both pages bake the same lip (hashBands).
	const canopyOf = (page, routes) => E(page, routes => {
		const out = {};
		for (const route of routes) {
			const L = G.DiveGen.layout({ seed: 4242, route, floor: 3 }), art = G.DiveArt.build(L, { keepMask: true });
			const M = art.mask, W = art.w, occ = art.occ;
			let occN = 0, onWall = 0, occl = 0;
			if (occ) for (let i = 0; i < occ.length; i++) if (occ[i]) { occN++; if (M[i] === 1) onWall++; if (occ[i] > ((i / W) | 0)) occl++; }
			out[route] = { strips: art.bands ? art.bands.length : 0, occN, onWall, occl, bytes: art.bandBytes || 0, hash: G.DiveArt.hashBands(art) };
		}
		return out;
	}, routes);
	const LUSH = ['forest', 'marsh', 'fungal'], ROCK = ['canyon', 'crater'], CR = LUSH.concat(ROCK);
	const cA = await canopyOf(a.page, CR), cB = await canopyOf(b.page, CR);
	A(cA && !cA.error && LUSH.every(r => cA[r].strips > 0 && cA[r].occN > 100 && cA[r].occl > 0 && cA[r].bytes > 0),
		'the lush routes bake a canopy: bands + occ, every covered px north of its wall edge (occ > its y)', JSON.stringify(cA));
	A(ROCK.every(r => cA[r] && cA[r].strips === 0 && cA[r].occN === 0 && cA[r].bytes === 0 && cA[r].hash === 'none'),
		'the rock routes bake no canopy at all (no bands, no occ, hashBands "none")', JSON.stringify(cA && ROCK.map(r => [r, cA[r]])));
	A(CR.every(r => cA[r] && cA[r].onWall === 0), 'the lip never lands on a wall (the mask invariant)', JSON.stringify(cA));
	A(CR.every(r => cB && cB[r] && cB[r].hash === cA[r].hash), 'two pages bake the same canopy lip (hashBands)', JSON.stringify(cB));
	A(LUSH.every(r => cA[r].bytes < 2.6 * 1048576),
		`the canopy fits its budget: ${LUSH.map(r => (cA[r].bytes / 1048576).toFixed(2)).join(' / ')} MB a floor (budget 2.6)`);

	// (b) the silhouette: an actor whose feet are on a north lip comes back over the canopy, tinted gold for you and pale
	//     blue for anyone else; the same actor on open ground draws nothing. Offscreen 240 x 240, the world transform.
	const sil = await E(a.page, () => {
		const z = G.World.zone, L = z && z.dive, art = G.DiveArt.forZone(z);
		if (!L || !art || !art.occ || !art.bands || !art.bands.length) return { err: 'no canopy art' };
		const W = art.w, occ = art.occ, TP = G.DiveArt.TP, MG = G.DiveArt.MG;
		const kind = (tx, ty) => (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h ? 1 : L.kind[ty * L.w + tx]);
		let behind = null, open = null;
		for (let ay = 1; ay < art.h - 1 && !(behind && open); ay++) for (let ax = 1; ax < W - 1; ax++) {
			const tx = ((ax / TP) | 0) - MG, ty = ((ay / TP) | 0) - MG;
			if (kind(tx, ty) !== 0) continue;
			const v = occ[ay * W + ax];
			if (!behind && v > ay) behind = [ax, ay];
			if (!open && !v) {   // open ground: two tiles from any wall, and nothing occluding the 48 art px over the feet
				let clear = true;
				for (let dy = -2; dy <= 1 && clear; dy++) for (let dx = -2; dx <= 2; dx++) if (kind(tx + dx, ty + dy) !== 0) { clear = false; break; }
				if (clear) { let hid = false; for (let d = 0; d < 48 && ay - d >= 0 && !hid; d++) hid = occ[(ay - d) * W + ax] > ay; if (!hid) open = [ax, ay]; }
			}
		}
		if (!behind || !open) return { err: 'no spots', behind, open };
		const PX = G.Sprites.PX, pl = G.Game.player, ox = art.ox, oy = art.oy;
		const sx0 = pl.x, sy0 = pl.y;
		const cv = document.createElement('canvas'); cv.width = 240; cv.height = 240;
		const ctx = cv.getContext('2d', { willReadFrequently: true });
		const count = c => {
			const d = ctx.getImageData(0, 0, 240, 240).data; let n = 0;
			for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 16 && Math.abs(d[i] - c[0]) < 24 && Math.abs(d[i + 1] - c[1]) < 24 && Math.abs(d[i + 2] - c[2]) < 24) n++;
			return n;
		};
		const GOLD = [255, 226, 122], BLUE = [191, 230, 255];
		const at = (ents, spot) => {
			for (const e of ents) { e.x = (ox + spot[0]) * PX; e.y = (oy + spot[1]) * PX; }
			ctx.clearRect(0, 0, 240, 240); ctx.save();
			ctx.translate(120 - (ox + spot[0]) * PX, 120 - (oy + spot[1]) * PX);
			G.ExpDive.drawSilhouettes(ctx, ents);
			ctx.restore();
			return { gold: count(GOLD), blue: count(BLUE) };
		};
		const other = { x: 0, y: 0, anim: pl.anim };
		const r = { behind: at([pl], behind), behindOther: at([other], behind), open: at([pl], open), openOther: at([other], open), spots: { behind, open } };
		pl.x = sx0; pl.y = sy0;
		return r;
	});
	A(sil && !sil.err && sil.behind.gold > 50 && sil.behind.blue === 0 && sil.behindOther.blue > 50 && sil.behindOther.gold === 0,
		'an actor the canopy hides comes back over it: gold for you, pale blue for anyone else', JSON.stringify(sil));
	A(sil && !sil.err && sil.open.gold === 0 && sil.open.blue === 0 && sil.openOther.gold === 0 && sil.openOther.blue === 0,
		'the same actor on open ground draws no silhouette at all', JSON.stringify(sil));
	A(run.hooks && run.hooks.bands > 0 && run.hooks.sil > 0,
		'in a Dive run both canopy gates fire every frame: bands pushed into the y-sort, silhouettes drawn', JSON.stringify(run.hooks));

	// (d) the base modes never reach it: quitting the Dive run and playing a Normal one must open neither gate
	const base = await E(a.page, async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
		H.thaw();
		G.Game.quit && G.Game.quit();
		await wait(250);
		G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu();
		await wait(250);
		G.Flow.play('normal');
		H.freeze();                       // the transition's frames are not the run's: snapshot after they settle
		const before = { ...(H.hooks || {}) };
		H.thaw(); await wait(450); H.freeze();
		return { zone: G.World.zone && G.World.zone.dive ? 'dive' : null, mode: G.Game.mode, before, after: { ...(H.hooks || {}) } };
	});
	A(!base.error && base.mode === 'normal' && base.zone === null, 'quitting the run leaves the page well', JSON.stringify(base));
	A(!base.error && base.after.bands === base.before.bands && base.after.sil === base.before.sil,
		'a Normal run never reaches the canopy gates (no bands pushed, no silhouettes drawn)', JSON.stringify(base));

	// ======================== 6. the light map, the biome vignette, the ambience (DV4)
	// (a) per-biome colour and alpha (plan §1): the darkness overlay is lava [44,16,34,.74], swamp .5, shroom .6,
	//     sea .38, ice .24, ruins .12 — and no light map at all in the woods, the desert or the Route of Origin.
	const dim = await E(a.page, () => {
		const out = {};
		for (const r of Object.keys(G.DiveArt.ROUTES)) out[r] = G.DiveArt.ROUTES[r].dim || null;
		return out;
	});
	const ALPHA = { crater: 0.74, marsh: 0.5, fungal: 0.6, reef: 0.38, grotto: 0.24, ruins: 0.12 };
	A(dim && !dim.error && ['forest', 'canyon', 'origin'].every(r => dim[r] === null),
		'no light map in the woods, the desert or the Route of Origin', JSON.stringify(dim));
	A(Object.keys(ALPHA).every(r => dim[r] && Math.abs(dim[r][3] - ALPHA[r]) < 1e-9 && dim[r].slice(0, 3).reduce((s, v) => s + v, 0) < 170),
		'per-biome alpha and colour: lava .74, swamp .5, shroom .6, sea .38, ice .24, ruins .12, each a dark tint', JSON.stringify(dim));

	// (b) in a Dive run on the crater: the light map fills the view with the lava's darkness and cuts a hole for your
	//     lamp; fx 0 skips it; calm stops the flicker; and the pass draws no rng (a replay paints the same frame).
	const crater = await E(a.page, async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
		H.thaw();
		G.Game.quit && G.Game.quit(); await wait(200);
		G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu(); await wait(200);
		G.Settings.set('quality', 'high');
		G.Expedition.diveRoute('crater'); G.Expedition.diveStart(1);
		await G.Flow.play('exp-dive');
		await wait(500);
		H.freeze();
		const r0 = H.rnd, W = G.Camera.cw, Hh = G.Camera.ch;   // the game's own canvas: the holes are cut for it
		const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
		const ctx = cv.getContext('2d', { willReadFrequently: true });
		const white = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, Hh); };
		const darkest = () => { const d = ctx.getImageData(0, 0, W, Hh).data; let m = 766; for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; if (s < m) m = s; } return m; };
		const lhash = () => {
			const lc = G.ExpDive.lightCv;
			if (!lc) return null;
			const d = lc.getContext('2d').getImageData(0, 0, lc.width, lc.height).data;
			let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
			return h >>> 0;
		};
		let style = 0;   // rng drawn inside a style-pass call: the pass draws none (measured per synchronous call)
		const DL = t => { const b = H.rnd, r = G.ExpDive.drawLight(ctx, W, Hh, t); style += H.rnd - b; return r; };
		const LS = t => { const b = H.rnd, r = G.ExpDive.lightSpec(t); style += H.rnd - b; return r; };
		await wait(60);                        // so this call repaints the light canvas with the settled camera
		white();
		const r1 = DL(performance.now() / 1000);
		const min1 = darkest();
		// the painted canvas: the route's colour at its alpha, with your lamp punched through it
		const lc = G.ExpDive.lightCv;
		const d = lc.getContext('2d').getImageData(0, 0, lc.width, lc.height).data;
		let maxA = 0, at = 0;
		for (let i = 3; i < d.length; i += 4) if (d[i] > maxA) { maxA = d[i]; at = i - 3; }
		const cam = G.Camera, pl = G.Game.player;
		const hx = Math.round((pl.x - cam.left() + cam._sx) * cam.scale / 4), hy = Math.round((pl.y - cam.top() + cam._sy) * cam.scale / 4);
		const holeA = d[(Math.min(lc.height - 1, Math.max(0, hy)) * lc.width + Math.min(lc.width - 1, Math.max(0, hx))) * 4 + 3];
		// fx 0: the light map is skipped outright (and never rebuilt); the vignette alone stays
		const h0 = lhash();
		await wait(70);
		G.Settings.set('quality', 'low');
		white();
		const r2 = DL(performance.now() / 1000);
		const min2 = darkest(), h1 = lhash();
		G.Settings.set('quality', 'high');
		// calm stops the flicker: the lava's holes breathe with time, and hold still under calm
		const spec = t => JSON.stringify(LS(t));
		G.Settings.set('calm', false);
		const o1 = spec(1.25), o2 = spec(9.75), n = LS(1.25).holes.length;
		G.Settings.set('calm', true);
		const c1 = spec(1.25), c2 = spec(9.75);
		// replay-stable: two paints a moment apart give the same canvas back (nothing moves under calm) — so repaint
		// under calm first: the baseline has to be a canvas painted with the same settings as the second paint
		DL(performance.now() / 1000);
		const y0 = lhash();
		await wait(70);
		DL(performance.now() / 1000);
		const y1 = lhash();
		G.Settings.set('calm', false);
		return { r1, r2, fill: [d[at], d[at + 1], d[at + 2], maxA], holeA, min1, min2, hSkip: h0 === h1,
			     flick: o1 !== o2, calm: c1 === c2, n, same: y0 === y1, style, rnd: H.rnd - r0,
			     dive: !!(G.World.zone && G.World.zone.dive) };
	});
	A(crater && !crater.error && crater.dive && crater.r1 && crater.r1.light && crater.r1.fill === '44,16,34,0.74' && crater.r1.holes > 0,
		'the light map composites over the scene: the crater\'s fill, holes cut for the lamp and the lava', JSON.stringify(crater && crater.r1));
	A(crater && Math.abs(crater.fill[0] - 44) <= 2 && Math.abs(crater.fill[1] - 16) <= 2 && Math.abs(crater.fill[2] - 34) <= 2 && Math.abs(crater.fill[3] - 189) <= 2,
		'the painted light canvas is the biome colour at the plan\'s alpha (44,16,34 @ 189)', JSON.stringify(crater && crater.fill));
	A(crater && crater.holeA < 40 && crater.fill[3] > 150,
		`your lamp punches through the darkness (hole alpha ${crater && crater.holeA}, the fill ${crater && crater.fill[3]})`, JSON.stringify(crater && crater.fill));
	A(crater && crater.min1 < crater.min2 - 20,
		`the composite lands on the scene: darkest pixel with the light map ${crater && crater.min1} vs fx 0 ${crater && crater.min2}`, JSON.stringify(crater && [crater.min1, crater.min2]));
	A(crater && crater.r2 && crater.r2.light === false && crater.r2.why === 'fx0' && crater.r2.holes === 0 && crater.hSkip,
		'fx 0 skips the light map: no composite, no rebuild of the canvas', JSON.stringify(crater && crater.r2) + ' hSkip=' + crater && crater.hSkip);
	A(crater && crater.flick && crater.calm && crater.n > 5,
		'calm stops the flicker: the lava\'s holes breathe with time and hold still under calm', JSON.stringify(crater && { flick: crater.flick, calm: crater.calm, n: crater.n }));
	A(crater && crater.same && crater.style === 0,
		'the style pass draws no rng and the same time paints the same light canvas (replay-stable)', JSON.stringify(crater && { same: crater.same, style: crater.style, rnd: crater.rnd }));

	// (c) the ambience: the 4 lit routes (forest, canyon, reef, ruins) get sun shafts + motes, fx 0 skips them, calm
	//     holds them still; and the woods have no light map at all (the plain biome vignette).
	const woods = await E(a.page, async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
		H.thaw();
		G.Game.quit && G.Game.quit(); await wait(200);
		G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu(); await wait(200);
		G.Settings.set('quality', 'high');
		G.Expedition.diveRoute('forest'); G.Expedition.diveStart(1);
		await G.Flow.play('exp-dive');
		await wait(400);
		H.freeze();
		const r0 = H.rnd, W = G.Camera.cw, Hh = G.Camera.ch;
		const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
		const ctx = cv.getContext('2d', { willReadFrequently: true });
		const black = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, Hh); };
		const hash = () => { const d = ctx.getImageData(0, 0, W, Hh).data; let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; };
		let style = 0;   // rng drawn inside a style-pass call: the pass draws none (measured per synchronous call)
		const DA = t => { const b = H.rnd, r = G.ExpDive.drawAmbience(ctx, W, Hh, t); style += H.rnd - b; return r; };
		const DL = t => { const b = H.rnd, r = G.ExpDive.drawLight(ctx, W, Hh, t); style += H.rnd - b; return r; };
		black(); const a1 = DA(3); const p1 = hash();
		black(); const a2 = DA(8.5); const p2 = hash();
		G.Settings.set('calm', true);
		black(); DA(3); const q1 = hash();
		black(); DA(8.5); const q2 = hash();
		G.Settings.set('calm', false);
		G.Settings.set('quality', 'low');
		black(); const a3 = DA(3);
		G.Settings.set('quality', 'auto');
		black();
		const lg = DL(performance.now() / 1000);
		return { a1, a2, a3, moves: p1 !== p2, still: q1 === q2, lg, style, rnd: H.rnd - r0,
			     dive: !!(G.World.zone && G.World.zone.dive) };
	});
	A(woods && !woods.error && woods.dive && woods.a1.shafts === 4 && woods.a1.motes === 16,
		'the lit routes get sun shafts and motes (fx high)', JSON.stringify(woods && woods.a1));
	A(woods && woods.a3.shafts === 0 && woods.a3.motes === 0,
		'fx 0 skips the ambience too', JSON.stringify(woods && woods.a3));
	A(woods && woods.moves && woods.still,
		'the ambience drifts with time and holds still under calm', JSON.stringify(woods && { moves: woods.moves, still: woods.still }));
	A(woods && woods.lg && woods.lg.light === false && woods.lg.why === 'nodim',
		'the woods have no light map: the plain biome vignette', JSON.stringify(woods && woods.lg));
	A(woods && woods.style === 0, 'the ambience draws no Math.random', JSON.stringify(woods && { style: woods.style, rnd: woods.rnd }));
	A(run.hooks && run.hooks.light > 0 && run.hooks.amb > 0,
		'in a Dive run the style pass fires every frame (light map + shafts)', JSON.stringify(run.hooks));
	A(base.after && base.after.light === base.before.light && base.after.amb === base.before.amb,
		'a Normal run never reaches the style pass (no light map, no shafts)', JSON.stringify({ before: base.before, after: base.after }));

	// ======================== 7. the Dive view + HUD (DV5)
	// (a) at 1280 x 720 a Dive draws the plan's tight view (display.js DIVE 640 x 350 at the default FOV): the camera
	//     is 640 wide at scale 2, it follows at 6/s instead of the classic 9/s, and the HUD line keeps its text.
	const near = (x, y, e = 0.01) => typeof x === 'number' && Math.abs(x - y) <= e;
	const dv5 = await E(a.page, () => {
		const H = window.__t;
		H.freeze();
		const cam0 = { vw: G.Camera.VIEW_W, mh: G.Camera.MIN_VIEW_H, w: G.Camera.w, h: G.Camera.h, scale: G.Camera.scale, cw: G.Camera.cw, ch: G.Camera.ch };
		// the follow rate: damp 6 in a Dive (not the classic 9)
		const sx = G.Camera.x, sy = G.Camera.y;
		G.Camera.shake = 0; G.Camera.x = 0; G.Camera.y = 0;
		G.Camera.follow(100, 0, 1 / 60);
		const fx = G.Camera.x, d6 = G.U.damp(0, 100, 6, 1 / 60), d9 = G.U.damp(0, 100, 9, 1 / 60);
		G.Camera.x = sx; G.Camera.y = sy;
		// the HUD line: the exact text micasurvivor_dive_test reads at floor 1
		const S = G.ExpDive.run, line = G.ExpDive.hudLine();
		const want = 'FLOOR ' + S.floor + ' · MOSSY WOODS · ' + Math.floor(S.bank) + ' secured · ' + Math.floor(S.stake) + ' at stake';
		return { cam0, dive: G.Display.dive(), DIVE: G.Display.DIVE, fx, d6, d9, line, want, floor: S.floor, bank: S.bank };
	});
	A(dv5 && !dv5.error && dv5.dive && dv5.DIVE && dv5.DIVE.w === 640 && dv5.DIVE.h === 350,
		'a Dive reads DIVE (640 x 350), the classic VIEW untouched', JSON.stringify(dv5 && dv5.DIVE));
	A(dv5 && near(dv5.cam0.vw, 640) && near(dv5.cam0.mh, 350) && near(dv5.cam0.scale, 2, 1e-6) && near(dv5.cam0.w, 640) && near(dv5.cam0.h, 360),
		'the Dive view width: 640 x 350 of world at 1280 x 720 (scale 2, camera 640 x 360)', JSON.stringify(dv5 && dv5.cam0));
	A(dv5 && Math.abs(dv5.fx - dv5.d6) < 1e-9 && Math.abs(dv5.fx - dv5.d9) > 1e-6,
		'a Dive follows at 6/s (damp 6), not the classic 9/s', JSON.stringify(dv5 && { fx: dv5.fx, d6: dv5.d6, d9: dv5.d9 }));
	A(dv5 && dv5.line === dv5.want && (dv5.floor !== 1 || dv5.bank !== 0 || dv5.line === 'FLOOR 1 · MOSSY WOODS · 0 secured · 0 at stake'),
		'the HUD line text is unchanged (micasurvivor_dive_test still passes)', JSON.stringify(dv5 && { line: dv5.line, want: dv5.want }));

	// (b) the phone, 844 x 390: the camera refits to it (the whole 350-tall view fits) and every HUD element fits
	//     inside the screen, with the Dive card, the floor pill and the minimap not overlapping each other.
	await E(a.page, () => { const H = window.__t, pl = G.Game.player; pl.hurt = () => {}; pl.gainXp = () => 0; H.thaw(); });
	await a.page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
	await sleep(700);
	const phone = await E(a.page, () => {
		const H = window.__t;
		H.freeze();
		const k = G.HUD.k, iw = innerWidth, ih = innerHeight;
		const R = G.HUD.rects().map(r => ({ name: r.name, x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }));
		const pick = n => R.find(r => r.name === n) || null;
		const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
		const pairs = [];
		for (const [p, q] of [['hp', 'floor'], ['hp', 'minimap'], ['floor', 'minimap']]) {
			const a1 = pick(p), b1 = pick(q);
			if (a1 && b1 && hit(a1, b1)) pairs.push(p + '~' + q);
		}
		return {
			iw, ih, k, dive: G.Display.dive(),
			cam: { cw: G.Camera.cw, ch: G.Camera.ch, vw: G.Camera.VIEW_W, w: G.Camera.w, h: G.Camera.h, scale: G.Camera.scale },
			names: R.map(r => r.name),
			need: ['hp', 'floor', 'minimap', 'clock', 'moves'].filter(n => !pick(n)),
			off: R.filter(r => r.x < -1 || r.y < -1 || r.x + r.w > iw + 1 || r.y + r.h > ih + 1)
				.map(r => r.name + JSON.stringify([Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)])),
			pairs, mm: !!G.HUD.minimap, line: G.ExpDive.hudLine(),
		};
	});
	A(phone && !phone.error && phone.dive && phone.cam.cw === 844 && phone.cam.ch === 390
		&& near(phone.cam.scale * phone.cam.w, 844) && near(phone.cam.scale * phone.cam.h, 390),
		'on the phone (844 x 390) the camera refits: scale x view = the screen', JSON.stringify(phone && phone.cam));
	A(phone && near(phone.cam.vw, 640) && near(phone.cam.h, 350),
		'the Dive still shows its 350-tall view on the phone (the 640 width is the plan\'s)', JSON.stringify(phone && phone.cam));
	A(phone && !phone.need.length,
		'the phone HUD draws every element (hp, floor, minimap, clock, moves)', JSON.stringify(phone && { need: phone.need, names: phone.names }));
	A(phone && !phone.off.length,
		`everything fits in 844 x 390 (${phone ? phone.off.length : '?'} off)`, JSON.stringify(phone && phone.off));
	A(phone && phone.mm && !phone.pairs.length,
		'the Dive card, the floor pill and the minimap fit together without overlapping', JSON.stringify(phone && { pairs: phone.pairs, mm: phone.mm, names: phone.names }));
	A(phone && /^FLOOR \d+ · [A-Z' ]+ · \d+ secured · \d+ at stake$/.test(phone.line),
		'the HUD line reads the same on the phone', JSON.stringify(phone && phone.line));

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
		// DV3: the canopy lip with you standing behind a wall under it (the tinted silhouette over the overhang)
		const d = await bootPage();
		await E(d.page, async () => {
			const H = window.__t;
			G.Expedition.diveRoute('forest'); G.Expedition.diveStart(1);
			await G.Flow.play('exp-dive');
			const pl = G.Game.player; pl.gainXp = () => 0; pl.hurt = () => {};
			H.thaw();
		});
		await sleep(1500);
		const spot = await E(d.page, () => {
			const z = G.World.zone, L = z && z.dive, art = G.DiveArt.forZone(z);
			if (!L || !art || !art.occ) return null;
			const W = art.w, occ = art.occ, TP = G.DiveArt.TP, MG = G.DiveArt.MG;
			for (let ay = 1; ay < art.h - 1; ay++) for (let ax = 1; ax < W - 1; ax++) {
				const tx = ((ax / TP) | 0) - MG, ty = ((ay / TP) | 0) - MG;
				if (tx < 2 || ty < 2 || tx >= L.w - 2 || ty >= L.h - 2 || L.kind[ty * L.w + tx] !== 0) continue;
				if (occ[ay * W + ax] > ay) {   // a north lip: the canopy hangs over this floor px
					const pl = G.Game.player;
					pl.x = (art.ox + ax) * G.Sprites.PX; pl.y = (art.oy + ay) * G.Sprites.PX;
					pl.__hx = pl.x; pl.__hy = pl.y;
					G.Camera.x = pl.x; G.Camera.y = pl.y;
					// hold him there for the shot: the collision would push him off the lip
					const wc = G.World.collide;
					G.World.collide = function (e) { const r = wc.call(this, e); if (e === pl) { e.x = pl.__hx; e.y = pl.__hy; } return r; };
					return [ax, ay];
				}
			}
			return null;
		});
		await sleep(700);
		const diag = await E(d.page, () => {
			const pl = G.Game.player, art = G.DiveArt.forZone(G.World.zone);
			const PX = G.Sprites.PX, fx = Math.round(pl.x / PX - art.ox), fy = Math.round(pl.y / PX - art.oy);
			const occ = art.occ, W = art.w;
			let hid = false;
			for (let dd = 0; dd <= Math.min(fy, 64) && !hid; dd++) hid = occ[(fy - dd) * W + fx] > fy;
			return { fx, fy, hid, at: occ[fy * W + fx], held: Math.abs(pl.x - pl.__hx) < 0.01 && Math.abs(pl.y - pl.__hy) < 0.01 };
		});
		const sfile = path.join(SHOTS, 'dv3_silhouette.png');
		await d.page.screenshot({ path: sfile });
		console.log(`     screenshot: ${sfile} (the lip at ${spot}; held ${JSON.stringify(diag)})`);
		await d.ctx.close();
		// DV4: the crater's light map (the darkness with your lamp's hole in it) and the forest's sun shafts
		for (const [route, name] of [['crater', 'dv4_light'], ['forest', 'dv4_shafts']]) {
			const e2 = await bootPage();
			await E(e2.page, async (route) => {
				const H = window.__t;
				G.Settings.set('quality', 'high');
				G.Expedition.diveRoute(route); G.Expedition.diveStart(1);
				await G.Flow.play('exp-dive');
				const pl = G.Game.player; pl.gainXp = () => 0; pl.hurt = () => {};
				H.thaw();
			}, route);
			await sleep(1600);
			const f2 = path.join(SHOTS, `${name}.png`);
			await e2.page.screenshot({ path: f2 });
			console.log(`     screenshot: ${f2}`);
			await e2.ctx.close();
		}
		// DV5: the Dive HUD (the white card, the floor pill, the rounded minimap) and the same run on the phone
		const e3 = await bootPage();
		await E(e3.page, async () => {
			const H = window.__t;
			G.Expedition.diveRoute('forest'); G.Expedition.diveStart(1);
			await G.Flow.play('exp-dive');
			const pl = G.Game.player; pl.gainXp = () => 0; pl.hurt = () => {};
			pl.xp = Math.round(pl.xpNext * 0.65);   // a partly filled XP bar
			H.thaw();
		});
		await sleep(6500);   // the run's opening toasts (achievement, shop, tips) out of the way of the pill
		const f3 = path.join(SHOTS, 'dv5_hud.png');
		await e3.page.screenshot({ path: f3 });
		console.log(`     screenshot: ${f3}`);
		await e3.page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(2500);
		const f4 = path.join(SHOTS, 'dv5_phone.png');
		await e3.page.screenshot({ path: f4 });
		console.log(`     screenshot: ${f4}`);
		await e3.ctx.close();
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
