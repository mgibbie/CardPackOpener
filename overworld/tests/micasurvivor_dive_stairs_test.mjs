// micasurvivor_dive_stairs_test.mjs — Dive: you can always tell where the stairs are (D0, Plans/MICASURVIVOR_3D_PLAN.md).
// The owner: "it is very frustrating to look for the stairs and not be able to find them". They WERE on the minimap, on
// every floor — as a 6 px gold square, the same gold as the three gold rocks a floor has, Meowth and your own ring,
// usually pinned to the rim with every other far-off mark; the zone map (M) didn't show them at all.
// In headless Chrome, a real Dive run:
//   * the minimap marks the stairs with their own mark (a 16 px orange disc with steps; red when sealed), drawn after
//     every other mark, with a pointer on the rim when they are off the minimap
//   * nothing else on the map uses that orange; gold rocks and Meowth keep their gold
//   * the zone map (M) draws the stairs at their tile, explored or not, and its legend lists them
//   * the HUD: no pointer for the first 25 s of a floor (that time is for exploring), then an arrow on the screen's
//     edge aimed at the stairs with the distance; gone once the stairs are on screen; never while they are sealed;
//     at once when the floor's alpha falls; and the next floor starts clean
//   node overworld/tests/micasurvivor_dive_stairs_test.mjs      (SHOTS=<dir> for screenshots)
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
const PORT = 8961;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
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
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	// G.Net's message handlers, captured as js/net/coop.js registers its own (so a test can deliver a host frame)
	H.net = [];
	const G0 = window.G = window.G || {};
	let net = null;
	Object.defineProperty(G0, 'Net', { configurable: true, enumerable: true, get() { return net; }, set(v) {
		net = v;
		if (v && typeof v.on === 'function') { const on = v.on; v.on = function (fn) { H.net.push(fn); return on.call(this, fn); }; }
	} });
	H.deliver = (from, msg) => { for (const fn of H.net) fn(from, msg); };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'ddive2');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; pl.gainXp = () => 0; return pl; };
	H.healBoss = () => { const b = G.ExpDive.run && G.ExpDive.run.boss; if (b && !b.dead) b.hp = b.maxHp; };   // (...and the alpha must outlive the wait)
	H.heal = () => { const pl = G.Game.player; if (pl && !pl.dead) pl.hp = pl.maxHp; };   // (this suite waits beside an alpha)
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { try { G.ExpEco.closePick(); } catch (e) { /* */ } }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
	};
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { H.unblock(); if (G.Game.state === 'over' || G.Game.state === 'ui') return i; G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i + 1; } return n; };
	H.TS = () => G.World.TS;
	H.wpos = p => { const z = G.World.zone; return [(p[0] + z.x0) * H.TS() + H.TS() / 2, (p[1] + z.y0) * H.TS() + H.TS() / 2]; };
	H.put = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; G.Camera.x = x; G.Camera.y = y; };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.xk && !e.dead) { e.dead = true; e.fade = 0; } };
	H.toStairs = () => { const L = G.World.zone.dive, [x, y] = H.wpos(L.stairs); H.put(x, y); };
	/** down to floor f: thin, beat any alpha / guardian, the stairs */
	H.downTo = f => {
		let n = 0;
		while (G.ExpDive.run && G.ExpDive.run.floor < f && n++ < 400) {
			{ const pl = G.Game.player; if (pl && !pl.dead) pl.hp = pl.maxHp; }   // (the way down is plumbing here, not a fight: D1 made the foes hit hard)
			H.thin();
			const S = G.ExpDive.run;
			if (S.boss && !S.boss.dead) { S.boss.hurt(S.boss.maxHp * 2); H.step(2); }
			const f0 = S.floor;
			H.toStairs(); H.step(24, 1 / 30, () => { if (G.ExpDive.run.floor !== f0) return false; H.toStairs(); });
		}
		return G.ExpDive.run && G.ExpDive.run.floor;
	};
};

const T0 = Date.now();
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
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
		return { ctx, page, menu, visible };
	}
	const shoot = async (page, name, ms = 500) => {
		if (!SHOTS) return;
		await page.evaluate(() => window.__t.thaw());
		await sleep(ms);
		fs.mkdirSync(SHOTS, { recursive: true });
		await page.screenshot({ path: path.join(SHOTS, name) });
		await page.evaluate(() => window.__t.freeze());
		console.log('     screenshot: ' + path.join(SHOTS, name));
	};
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };

	// ======================== a Dive run, floor 1
	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	await page.evaluate(() => G.ModesUI.open());
	await waitFor(() => d0.visible('scr-modes'), 3000);
	await sleep(250);
	await page.click('#modes-exp [data-exp=exp-dive]');
	A(await waitFor(() => E(page, () => G.Game.state === 'playing' && G.ExpDive && !!G.ExpDive.run), 15000), 'a click starts a Dive run');
	// one drawn frame with everything settled, then read what the minimap recorded
	const frame = async (ms = 260) => { await page.evaluate(() => window.__t.thaw()); await sleep(ms); await page.evaluate(() => window.__t.freeze()); };
	const mini = () => E(page, () => {
		const d = G.Minimap.drawn, st = d.filter(m => /^stairs/.test(m.kind)), i = d.findIndex(m => /^stairs(-sealed)?$/.test(m.kind));
		return { kinds: [...new Set(d.map(m => m.kind))], stairs: st, last: d.length ? d[d.length - 1].kind : null, afterStairs: d.slice(i + 1).map(m => m.kind), xAfter: d.slice(i + 1).some(m => /^x-/.test(m.kind)), n: d.length };
	});

	await E(page, () => { window.__t.freeze(); window.__t.sturdy(); window.__t.thin(); });
	await frame();
	let m = await mini();
	const where = await E(page, () => {
		const L = G.World.zone.dive, [sx, sy] = window.__t.wpos(L.stairs), pl = G.Game.player, TS = window.__t.TS();
		const rawPt = G.Minimap.pt(sx, sy, pl), q = G.Minimap.edge(rawPt);   // (the floor is random: is the stairs' point outside the minimap's shape?)
		return { tiles: Math.hypot(sx - pl.x, sy - pl.y) / TS, sees: G.Camera.sees(sx, sy, 0), sealed: !!G.ExpDive.run.sealed, floor: G.ExpDive.run.floor, off: Math.hypot(rawPt.x - q.x, rawPt.y - q.y) > 0.5 };
	});
	A(where.floor === 1 && !where.sealed && where.tiles > 6 && !where.sees, 'floor 1: the stairs are away from the spawn and off screen (the hunt this fixes)', JSON.stringify(where));
	A(m.stairs.filter(s => s.kind === 'stairs').length === 1, 'the minimap marks the stairs with their OWN kind of mark (not the gold square the rocks use)', JSON.stringify(m.kinds));
	A(m.stairs.some(s => s.kind === 'stairs-arrow') === where.off, `the stairs are ${where.off ? 'beyond the minimap: the mark is on its rim with a pointer showing the way' : 'within the minimap this floor: the mark is in place, no rim pointer'}`, JSON.stringify([where.tiles, where.off, m.stairs.map(s => s.kind)]));
	A(!m.xAfter, 'the stairs are drawn after the economy\'s marks (rocks, chests, Meowth), so nothing covers them', JSON.stringify(m.afterStairs));

	// ---- the mark itself: its colour is nothing else's, and it is bigger than the old 6 px square
	const icon = await E(page, () => {
		const c = document.createElement('canvas'); c.width = c.height = 40;
		const g = c.getContext('2d');
		G.ExpDive.stairsIcon(g, 20, 20, 1, false, 0);
		const px = g.getImageData(0, 0, 40, 40).data; let n = 0, orange = 0, minX = 40, maxX = 0;
		for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const i = (y * 40 + x) * 4; if (px[i + 3] > 40) { n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); if (px[i] > 230 && px[i + 1] > 110 && px[i + 1] < 170 && px[i + 2] < 80) orange++; } }
		g.clearRect(0, 0, 40, 40); G.ExpDive.stairsIcon(g, 20, 20, 1, true, 0);
		const p2 = g.getImageData(0, 0, 40, 40).data; let red = 0;
		for (let i = 0; i < p2.length; i += 4) if (p2[i + 3] > 40 && p2[i] > 230 && p2[i + 1] < 110 && p2[i + 2] > 80 && p2[i + 2] < 130) red++;
		return { wide: maxX - minX + 1, orange, red, col: G.ExpDive.STAIRS_COL };
	});
	A(icon.wide >= 15 && icon.orange > 30, 'the mark is a 16 px disc in its own orange (the old one was a 6 px gold square)', JSON.stringify(icon));
	A(icon.red > 30, 'sealed stairs (an alpha / guardian is alive) show the same mark in red', JSON.stringify(icon));
	const clash = await E(page, () => {
		const src = [...document.scripts].map(s => s.src).filter(s => /expedition\/economy\.js/.test(s))[0];
		return fetch(src).then(r => r.text()).then(t => ({ rock: /rock: '#e8b93a'/.test(t), meowth: /meowth: '#ffd23f'/.test(t), usesOrange: t.includes(G.ExpDive.STAIRS_COL) }));
	});
	A(clash && clash.rock && clash.meowth && !clash.usesOrange, 'gold rocks and Meowth keep their gold; nothing in the economy uses the stairs\' orange', JSON.stringify(clash));

	// ---- the zone map (M): the stairs are on it, explored or not, and in the legend
	const map = await E(page, () => {
		const z = G.World.zone, L = z.dive, PX = 4;
		const ok = G.ExpEco.openMap();
		const info = G.ExpEco.mapInfo, cv = document.querySelector('#xmap-cv'), g = cv.getContext('2d');
		const x = L.stairs[0] * PX + PX / 2, y = L.stairs[1] * PX + PX / 2;
		const d = g.getImageData(Math.round(x) - 12, Math.round(y) - 12, 24, 24).data; let orange = 0;
		for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 110 && d[i + 1] < 170 && d[i + 2] < 80) orange++;
		const row = document.querySelector('#xmap-legend .xl-row[data-kind=stairs]');
		const out = { ok, rows: info && info.rows, orange, legend: row ? row.innerText.replace(/\s+/g, ' ').trim() : null, explored: info && info.pct };
		G.ExpEco.closeMap();
		return out;
	});
	A(map.ok && map.rows && map.rows.includes('stairs') && map.orange > 40, 'the zone map (M) draws the stairs at their tile, though that part of the floor is unexplored', JSON.stringify(map));
	A(map.legend === 'Stairs', 'the map\'s legend lists them: "Stairs"', JSON.stringify(map.legend));

	// ---- the HUD pointer: not at first, then after K.STAIRS_HINT_T seconds on the floor
	await frame();
	const h0 = await E(page, () => ({ hint: G.ExpDive.stairsHint(G.Game.player), at: G.ExpDive.hintAt, T: G.ExpDive.K.STAIRS_HINT_T, onFloor: G.ExpDive.run.now - G.ExpDive.run.ft }));
	A(h0.T === 25 && h0.onFloor < 25 && h0.hint === null && h0.at === null, 'a fresh floor shows no pointer: the first 25 s are for exploring', JSON.stringify(h0));
	await E(page, () => { const H = window.__t; for (let i = 0; i < 26 * 30; i++) { H.thin(); H.unblock(); H.heal(); H.healBoss(); G.Game.debugStep(1, 1 / 30); } });
	await frame();
	const h1 = await E(page, () => {
		const L = G.World.zone.dive, [sx, sy] = window.__t.wpos(L.stairs), pl = G.Game.player, k = G.HUD.k || 1;
		return { hint: G.ExpDive.stairsHint(pl), at: G.ExpDive.hintAt, want: Math.atan2(sy - pl.y, sx - pl.x), w: innerWidth / k, h: innerHeight / k, onFloor: G.ExpDive.run.now - G.ExpDive.run.ft, state: G.Game.state };
	});
	A(h1.hint && Math.abs(h1.hint.a - h1.want) < 1e-6 && h1.hint.tiles > 6, 'after 25 s on the floor the pointer comes up, aimed at the stairs, with the distance in tiles', JSON.stringify(h1));
	A(h1.at && h1.at.x > 40 && h1.at.x < h1.w - 40 && h1.at.y > 60 && h1.at.y < h1.h - 40, '...drawn inside the screen\'s edge, clear of the HUD\'s top rows', JSON.stringify([h1.at, h1.w, h1.h]));
	await shoot(page, 'dive_stairs_hint.png');

	// ---- walk to the stairs: the pointer goes when they are on screen; on the minimap the mark is no longer on the rim
	await E(page, () => { const H = window.__t, L = G.World.zone.dive, [sx, sy] = H.wpos(L.stairs); H.put(sx - 3 * H.TS(), sy); });
	await frame();
	const near = await E(page, () => ({ hint: G.ExpDive.stairsHint(G.Game.player), at: G.ExpDive.hintAt }));
	m = await mini();
	A(near.hint === null && near.at === null, 'with the stairs on screen the pointer is gone', JSON.stringify(near));
	A(m.stairs.filter(s => s.kind === 'stairs').length === 1 && !m.stairs.some(s => s.kind === 'stairs-arrow'), '...and the minimap shows the mark in place, no rim pointer', JSON.stringify(m.stairs.map(s => s.kind)));
	await shoot(page, 'dive_stairs_near.png');

	// ---- floor 5: the alpha seals the stairs — red mark, no pointer; beat it — open mark, pointer at once
	const f5 = await E(page, () => { const H = window.__t; const f = H.downTo(5); H.thin(); return { f, sealed: !!G.ExpDive.run.sealed, boss: !!G.ExpDive.run.boss }; });
	await frame();
	m = await mini();
	const s5 = await E(page, () => { const H = window.__t; for (let i = 0; i < 26 * 30; i++) { H.thin(); H.unblock(); H.heal(); H.healBoss(); G.Game.debugStep(1, 1 / 30); } return { hint: G.ExpDive.stairsHint(G.Game.player), sealed: !!G.ExpDive.run.sealed, map: (() => { G.ExpEco.openMap(); const r = G.ExpEco.mapInfo.rows; G.ExpEco.closeMap(); return r; })() }; });
	A(f5.f === 5 && f5.sealed && f5.boss, 'floor 5: an alpha seals the stairs', JSON.stringify(f5));
	A(m.stairs.some(s => s.kind === 'stairs-sealed') && !m.stairs.some(s => s.kind === 'stairs'), 'the minimap shows the sealed mark', JSON.stringify(m.stairs.map(s => s.kind)));
	A(s5.sealed && s5.hint === null && s5.map.includes('stairs-sealed'), 'sealed stairs get no HUD pointer, however long you wait; the zone map lists "Stairs (sealed)"', JSON.stringify(s5));
	const open5 = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, L = G.World.zone.dive, [sx, sy] = H.wpos(L.stairs), [px, py] = H.wpos(L.spawn);
		for (let i = 0; i < 40 && S.boss && S.sealed; i++) { H.heal(); if (!S.boss.dead) S.boss.hurt(S.boss.maxHp * 2); H.step(2); }
		H.put(px, py);   // back at the spawn: the stairs are off screen again
		S.ft = S.now;    // "just arrived": only the boss falling can raise the pointer now
		return { sealed: !!S.sealed, fell: !!S.bossFell, hint: G.ExpDive.stairsHint(G.Game.player), sees: G.Camera.sees(sx, sy, 0), state: G.Game.state, dead: !!G.Game.player.dead };
	});
	A(!open5.sealed && open5.fell && !open5.sees && open5.hint, 'the alpha falls: the stairs open and the pointer shows at once, without the wait', JSON.stringify(open5));
	// the next floor starts clean
	const f6 = await E(page, () => { const H = window.__t; const f = H.downTo(6); return { f, fell: !!G.ExpDive.run.bossFell, hint: G.ExpDive.stairsHint(G.Game.player) }; });
	A(f6.f === 6 && !f6.fell && f6.hint === null, 'the next floor starts clean: no pointer until its own 25 s', JSON.stringify(f6));
	await d0.ctx.close();

	const pageErrs = errors.filter(e => !/AudioContext|play\(\) failed|NotAllowedError/.test(e));
	A(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
