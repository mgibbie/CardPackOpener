// micasurvivor_dive_test.mjs — MicaSurvivor Dive V2: Expedition · Dive, playable (micasurvivor/js/expedition/dive.js;
// Plans/MICASURVIVOR_DIVE_MODE_PLAN.md 2.1 / 2.5 / 2.7). A static server, headless Chrome, a fixed guest profile.
//   1. the menu: Expedition · Dive is playable; a click starts a run on its route (dive:forest), floor 1 of G.DiveGen
//   2. floor 1: the player stands on the spawn; the foe groups sleep where they were put and wake when you come near
//   3. the lost Pokémon: reaching it makes it follow you; it is rescued when it leaves the floor with you (V6)
//   4. the stairs: standing on them takes you to floor 2 (a new zone, the old foes gone)
//   5. floor 5: the alpha seals the stairs; its fall secures the loot (the stake banked) and opens them
//   6. floor 10: the Escape Rope circle; standing still in it 3 s ends the run, ESCAPED: the pay is bank + stake, through
//      the shared wallet (the base save's Pokémonedas), the Expedition save has dive.forest.best = 10; a hit cancels it
//   7. a faint: the pay is the bank + a quarter of the stake
//   8. a viewer rebuilds the same floor from the zone block (core.js applyX); another route paints and plans its own
//   9. the species curve: every non-legendary species can come as a foe somewhere; the guardians are legendaries
//   node overworld/tests/micasurvivor_dive_test.mjs
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
const PORT = 8949;
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

	// ======================== 1. the menu
	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	await page.evaluate(() => G.ModesUI.open());
	A(await waitFor(() => d0.visible('scr-modes'), 3000), 'the menu opens "Choose a mode"');
	await sleep(250);
	const card = await E(page, () => { const b = document.querySelector('#modes-exp [data-exp=exp-dive]'); return b && { soon: b.classList.contains('soon'), aria: b.getAttribute('aria-disabled'), txt: b.innerText.replace(/\s+/g, ' ').trim() }; });
	A(card && !card.soon && card.aria !== 'true' && /^Expedition · Dive .*floor by floor/.test(card.txt), 'Expedition · Dive is playable: no "Coming soon", in English', JSON.stringify(card));
	await page.click('#modes-exp [data-exp=exp-dive]');
	A(await waitFor(() => E(page, () => G.Game.state === 'playing' && G.ExpDive && !!G.ExpDive.run), 15000), 'a click starts a Dive run');
	const st = await E(page, () => {
		window.__t.freeze();
		const z = G.World.zone, S = G.ExpDive.run, pl = window.__t.sturdy();
		return { mode: G.Modes.run.mode, map: G.Modes.run.map, dv: G.Modes.run.dv, zmap: z && z.map, floor: z && z.zone, dive: !!(z && z.dive), runFloor: S.floor,
			route: S.route, px: pl.x, py: pl.y, onFloor: G.World.maskAt(Math.floor(pl.x / G.World.TS), Math.floor(pl.y / G.World.TS)) > 0, foes: G.EnemyMgr.all().filter(e => !e.dead).length,
			groups: S.groups.length, lost: !!S.lost, line: G.ExpClassic.hudLine(pl) };
	});
	A(st.mode === 'exp-dive' && st.map === 'dive:forest' && st.zmap === 'dive:forest' && st.floor === 1 && st.dive && st.runFloor === 1 && st.route === 'forest', 'the run: exp-dive on dive:forest, floor 1 of G.DiveGen', JSON.stringify(st));
	A(st.onFloor && st.px === 0 && st.py === 0, 'the player starts on the spawn (the world origin, a floor tile)', JSON.stringify(st));
	A(st.foes >= 4 && st.groups >= 2 && st.lost, `the floor's foe groups (${st.groups}, ${st.foes} foes) and its lost Pokémon`, JSON.stringify(st));
	const onf = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, L = G.World.zone.dive, TS = H.TS();
		const floorAt = ([x, y]) => { const tx = Math.floor(x / TS), ty = Math.floor(y / TS); return G.World.maskAt(tx, ty) > 0 && G.World.zone.terr(tx, ty) === 0; };
		const pts = { stairs: H.wpos(L.stairs), lost: [S.lost.x, S.lost.y] };
		S.groups.forEach((g, i) => { pts['g' + i] = g.at; });
		const bad = Object.entries(pts).filter(([, p]) => !floorAt(p)).map(([k]) => k);
		return { bad, n: Object.keys(pts).length };
	});
	A(onf.bad && onf.bad.length === 0, `the stairs, the lost Pokémon and every group stand on floor tiles in the world (${onf.n})`, JSON.stringify(onf));
	A(/^FLOOR 1 · MOSSY WOODS · 0 secured · 0 at stake$/.test(st.line), 'the HUD line: FLOOR 1 · MOSSY WOODS · 0 secured · 0 at stake', st.line);

	await shoot(page, 'dive_floor1.png');
	// ======================== 2. sleeping groups
	const sl = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, g = S.groups.slice().sort((a, b) => Math.hypot(b.at[0] - G.Game.player.x, b.at[1] - G.Game.player.y) - Math.hypot(a.at[0] - G.Game.player.x, a.at[1] - G.Game.player.y))[0], e0 = g.list[0], x0 = e0.x, y0 = e0.y;   // (the group farthest from you, beyond the wake radius)
		const pl0 = G.Game.player; for (const gg of pl0.slots) for (const m of gg) m.t = 1e9;   // (your moves quiet: a long-reach basic would wake it)
		H.dbg = { far: Math.round(Math.hypot(g.at[0] - G.Game.player.x, g.at[1] - G.Game.player.y) / H.TS()), awake0: g.awake };
		H.step(60);
		H.dbg.hp1 = g.list.map(e => e.hp < e.maxHp); H.dbg.awake1 = g.awake;
		const still = Math.hypot(e0.x - x0, e0.y - y0) < 12 && !g.awake;   // (a few px: the manager nudges overlapping foes apart)
		for (const gg of pl0.slots) for (const m of gg) m.t = 0;
		// a floor tile 4-6 tiles from the group
		const TS = H.TS(), gx = Math.floor(g.at[0] / TS), gy = Math.floor(g.at[1] / TS);
		let spot = null;
		for (let r = 4; r <= 6 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) { const tx = gx + Math.round(Math.cos(a / 16 * 6.2832) * r), ty = gy + Math.round(Math.sin(a / 16 * 6.2832) * r); if (G.World.maskAt(tx, ty) > 0 && G.World.zone.terr(tx, ty) === 0) spot = [tx * TS + TS / 2, ty * TS + TS / 2]; }
		H.put(spot[0], spot[1]); H.step(2);
		const woke = g.awake, d0 = Math.min(...g.list.map(e => Math.hypot(e.x - G.Game.player.x, e.y - G.Game.player.y)));
		H.step(30, 1 / 30, () => { H.put(spot[0], spot[1]); });
		const d1 = Math.min(...g.list.filter(e => !e.dead).map(e => Math.hypot(e.x - G.Game.player.x, e.y - G.Game.player.y)));
		return { still, woke, d0: Math.round(d0), d1: Math.round(d1), xm: g.list.map(e => !!e.xmove), dbg: H.dbg };
	});
	A(sl.still, 'a far group sleeps where it was put (no move in 2 s)', JSON.stringify(sl));
	A(sl.woke && sl.xm.every(x => !x), 'coming close wakes the whole group (its foes act: no sleeper hold)', JSON.stringify(sl));

	// ======================== 3. the lost Pokémon
	const rs = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, s0 = S.stake;
		H.thin(); H.put(S.lost.x, S.lost.y); H.step(2);
		const out = { follow: S.lost.follow, doneAtTouch: S.lost.done };
		// walk off 6 tiles: it comes after you
		const lx = S.lost.x, ly = S.lost.y, TS = H.TS();
		const spots = [[6, 0], [-6, 0], [0, 6], [0, -6]].map(([dx, dy]) => [lx + dx * TS, ly + dy * TS]).filter(([x, y]) => G.World.maskAt(Math.floor(x / TS), Math.floor(y / TS)) > 0 && G.World.zone.terr(Math.floor(x / TS), Math.floor(y / TS)) === 0);
		if (spots[0]) { H.step(30, 1 / 30, () => { H.put(spots[0][0], spots[0][1]); }); out.followed = Math.hypot(S.lost.x - lx, S.lost.y - ly) > 2 * TS; }
		// to the stairs with it: rescued as you leave
		H.thin(); H.toStairs(); S.lost.x = G.Game.player.x + 20; S.lost.y = G.Game.player.y;
		H.step(60, 1 / 30, () => { if (G.ExpDive.run.floor !== 1) return false; H.toStairs(); S.lost.x = G.Game.player.x + 20; S.lost.y = G.Game.player.y; });
		out.lostAt = S.lost && [S.lost.follow, S.lost.done]; out.hold = S.holdT;
		out.rescued = S.rescued.slice(); out.stake = S.stake - s0; out.floor = S.floor;
		// floor 2: leave its lost Pokémon behind (never touched): not rescued
		H.thin(); H.toStairs(); H.step(24, 1 / 30, () => { if (G.ExpDive.run.floor !== 2) return false; H.toStairs(); });
		out.left = S.rescued.length;
		return out;
	});
	A(rs.follow && !rs.doneAtTouch && rs.followed !== false, 'reaching the lost Pokémon: it follows you (not rescued yet)', JSON.stringify(rs));
	A(rs.rescued.length === 1 && rs.stake >= 2 && rs.floor === 2, 'taking the stairs with it rescues it and puts its loot at stake', JSON.stringify(rs));
	A(rs.left === 1, 'a lost Pokémon left behind stays lost', JSON.stringify(rs));

	// ======================== 4. the stairs
	const s2 = await E(page, () => {
		const H = window.__t, h1 = G.World.zone.hash;
		const f0 = G.ExpDive.run.floor;
		H.thin(); H.toStairs(); H.step(24, 1 / 30, () => { if (G.ExpDive.run.floor !== f0) return false; H.toStairs(); });
		const S = G.ExpDive.run, pl = G.Game.player;
		return { f0, floor: S.floor, zone: G.World.zone.zone, newZone: G.World.zone.hash !== h1, px: pl.x, py: pl.y, foes: G.EnemyMgr.all().filter(e => !e.dead && e.xdive != null).length, oldFoes: G.EnemyMgr.all().filter(e => !e.dead && e.xdive == null && !e.xk).length };
	});
	A(s2.floor === s2.f0 + 1 && s2.zone === s2.floor && s2.newZone && s2.px === 0 && s2.py === 0 && s2.foes > 0, 'the stairs take you down a floor (a new zone, at its spawn, its own foes)', JSON.stringify(s2));

	// ======================== 4b. V4: PokéDive's kit (basic + 2 pressed specials), the dodge, every input
	const kit = await E(page, () => {
		const H = window.__t, pl = G.Game.player, S = G.ExpDive.run;
		H.thin();
		const casts = {};
		const cast0 = pl.cast.bind(pl);
		pl.cast = m => { casts[m.id] = (casts[m.id] || 0) + 1; return cast0(m); };
		H.casts = casts;
		// a sturdy foe next to you that never moves
		const any = G.EnemyMgr.all().find(e => !e.boss) || null;
		const def = G.ExpClassic.defOf(19, 0), foe = new G.Enemy(def, pl.x + 40, pl.y, { hp: 1e7, dmg: 0, spd: 0 });
		foe.xmove = () => true; G.EnemyMgr.add(foe); H.foe = foe;
		const roles = pl.slots.map(g => g.map(m => !!m.xman));
		const ids = pl.slots.map(g => g[0] && g[0].id);
		for (const g of pl.slots) for (const m of g) m.t = 0;
		H.step(90);   // 3 s: the basic fires, the specials wait
		const idle = ids.map(id => casts[id] || 0);
		return { slots: pl.slots.length, max: pl.maxMoves, roles, ids, idle, spare: (S.spare || []).length, any: !!any };
	});
	A(kit.slots >= 2 && kit.slots <= 3 && kit.max === 3 && kit.roles[0].every(x => !x) && kit.roles.slice(1).every(r => r.every(x => x)), 'the kit: 3 slots, slot 1 the basic (auto), slots 2-3 specials (pressed)', JSON.stringify(kit));
	A(kit.idle[0] > 0 && kit.idle.slice(1).every(n => n === 0), 'with a foe in reach the basic fires on its own and the specials never do, unpressed', JSON.stringify(kit));
	const presses = await E(page, () => {
		const H = window.__t, pl = G.Game.player, c = H.casts, id1 = pl.slots[1][0].id, id2 = pl.slots[2] ? pl.slots[2][0].id : null, out = {};
		const n = id => c[id] || 0;
		// the keyboard: 1
		let a = n(id1); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1' })); H.step(2); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit1', key: '1' }));
		out.key1 = n(id1) - a;
		// pressed again on its cool-down: nothing (and nothing kept)
		a = n(id1); out.cdLeft = +pl.slots[1][0].t.toFixed(2); G.ExpDive.press(1); H.step(2); out.onCd = n(id1) - a;
		// a press just before the cool-down ends is kept (buffered)
		pl.slots[1][0].t = 0.1; a = n(id1); out.buf = G.ExpDive.press(1); H.step(6); out.buffered = n(id1) - a;
		if (id2) {
			// the mouse: a right click on the game
			pl.slots[2][0].t = 0; a = n(id2);
			const cv = document.getElementById('game'), r = cv.getBoundingClientRect();
			cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 3 }));
			H.step(2); out.rclick = n(id2) - a;
			// the pad: Y = special 2, X = special 1
			pl.slots[2][0].t = 0; a = n(id2); out.padY = G.ExpDive.pad('reroll'); H.step(2); out.padY2 = n(id2) - a;
		}
		pl.slots[1][0].t = 0; a = n(id1); out.padX = G.ExpDive.pad('ban'); H.step(2); out.padX1 = n(id1) - a;
		out.padUlt = ['prev', 'dtrigger', 'ztrigger', 'zmove'].every(x => G.ExpDive.pad(x) === true);
		out.padPause = G.ExpDive.pad('pause') === false;
		// damage: a special's hit x1.25, the basic's x1
		out.kSp = G.ExpDive.out(1, pl, H.foe, { mid: id1 }); out.kBasic = G.ExpDive.out(1, pl, H.foe, { mid: pl.slots[0][0].id });
		return out;
	});
	A(presses.key1 === 1, 'key 1 fires special 1 once', JSON.stringify(presses));
	A(presses.cdLeft > 0.2 && presses.onCd === 0, 'pressed again on its cool-down: nothing', JSON.stringify(presses));
	A(presses.buf === true && presses.buffered === 1, 'a press 0.1 s before the cool-down ends is kept and fires once it is up', JSON.stringify(presses));
	A(presses.rclick === 1 && presses.padY === true && presses.padY2 === 1, 'a right click and the pad\'s Y fire special 2', JSON.stringify(presses));
	A(presses.padX === true && presses.padX1 === 1 && presses.padUlt && presses.padPause, 'the pad: X special 1, LB / LT / RT / L3 the Ultimate, pause left alone', JSON.stringify(presses));
	A(Math.abs(presses.kSp - 1.25) < 1e-9 && presses.kBasic === 1, 'a special hits x1.25, the basic x1', JSON.stringify(presses));
	const dodge = await E(page, () => {
		const H = window.__t, pl = G.Game.player, out = {};
		H.step(40);
		const x0 = pl.x, y0 = pl.y;
		pl.moveAngle = 0;
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); H.step(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
		out.slideT = +pl.slideT.toFixed(3); out.inv = +pl.invuln.toFixed(3); out.air = !!pl.air; out.verb = G.ExpVerbs.row(pl)[1];
		const hp0 = pl.hp; pl.hurt(30, 'normal'); out.tookDuring = hp0 - pl.hp;
		H.step(8);
		out.moved = Math.round(Math.hypot(pl.x - x0, pl.y - y0)); out.cd = +pl.slideCd.toFixed(2);
		// on its cool-down a second press does nothing
		G.ExpDive.pad('confirm'); H.step(1); out.again = pl.slideT > 0;
		H.step(40); G.ExpDive.pad('confirm'); H.step(1); out.padDodge = pl.slideT > 0;
		return out;
	});
	A(dodge.slideT > 0 && dodge.slideT <= 0.2 && dodge.inv >= 0.15 && !dodge.air && dodge.verb === 4, 'Space dodges (no hop): a 0.2 s dash, invulnerable, seen by viewers as the slide verb', JSON.stringify(dodge));
	A(dodge.tookDuring === 0 && dodge.moved > 2 * 32 && dodge.cd > 0.9, 'no damage during the dodge; it covers ~3 tiles; then a 1.2 s cool-down', JSON.stringify(dodge));
	A(!dodge.again && dodge.padDodge, 'on its cool-down it waits; then the pad\'s A dodges', JSON.stringify(dodge));
	await E(page, () => window.__t.thaw());
	await sleep(250);
	const btn = await E(page, () => { window.__t.freeze(); const r = G.ExpDive.rects; return r && { sp1: r.sp1, sp2: r.sp2, dodge: r.dodge }; });
	A(btn && btn.sp1 && btn.sp2 && btn.dodge && btn.sp2.x < btn.sp1.x && btn.dodge.y < btn.sp1.y, 'the HUD draws SPECIAL 1 / 2 and DODGE (left of the Ultimate, DODGE above)', JSON.stringify(btn));
	const tap = await E(page, () => {
		const H = window.__t, pl = G.Game.player, r = G.ExpDive.rects, id1 = pl.slots[1][0].id, a = H.casts[id1] || 0;
		pl.slots[1][0].t = 0;
		const cv = document.getElementById('game');
		cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: r.sp1.x + r.sp1.s / 2, clientY: r.sp1.y + r.sp1.s / 2 }));
		cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'touch' }));
		H.step(2);
		H.foe.dead = true; H.foe.fade = 0;
		return (H.casts[id1] || 0) - a;
	});
	A(tap === 1, 'a finger on SPECIAL 1 fires it', tap);
	await shoot(page, 'dive_buttons.png');
	const dyn = await E(page, () => { const pl = G.Game.player, lv = pl.level; pl.level = 25; const out = { start: G.Dynamax.tryStart(pl), btn: G.Dynamax.drawButton(document.createElement('canvas').getContext('2d'), 1280, 720, pl) }; pl.level = lv; return out; });
	A(dyn.start === false && !dyn.btn, 'no Dynamax in a Dive run (owner: not part of the PokéDive kit; its MAX button overlapped the pause): refused at Lv 25, no button', JSON.stringify(dyn));
	const learn = await E(page, () => {
		const pl = G.Game.player, D = G.ExpDive, before = pl.slots.map(g => g[0].id), lv0 = pl.level;
		const out = { before };
		pl.level = 5; out.lv5 = D.offerLearn(pl);
		pl.level = 4; const cards = D.offerLearn(pl) || [];
		out.n = cards.length; out.types = cards.map(c => c.type); out.titles = cards.map(c => c.title + ' | ' + c.tag);
		out.again = D.offerLearn(pl);
		const sw = cards.find(c => c.type === 'swap');
		if (sw) { sw.apply(pl); G.ExpDive.roles(pl); }
		out.after = pl.slots.map(g => g[0].id); out.roles = pl.slots.map(g => !!g[0].xman); out.learnAt10 = D.LEARN_AT(10) && D.LEARN_AT(16) && D.LEARN_AT(22) && !D.LEARN_AT(7);
		pl.level = lv0;
		return out;
	});
	A(learn.lv5 === null && learn.n >= 2 && learn.types.filter(t => t === 'swap').length === learn.n - 1 && learn.again === null, 'Lv 4: a new special to learn, one card per special it can replace + a keep card (once; not on Lv 5)', JSON.stringify(learn));
	A(learn.after[0] === learn.before[0] && learn.after.slice(1).some((id, i) => id !== learn.before[i + 1]) && JSON.stringify(learn.roles) === JSON.stringify(learn.before.map((x, i) => i > 0)) && learn.learnAt10, 'taking it replaces that special (the basic stays), the new move is a pressed special; again at 10 / 16 / 22', JSON.stringify(learn));


	// ======================== 4c. V5: the combo (PokéDive's "Racha") and the hit-stops
	const combo = await E(page, () => {
		const H = window.__t, pl = G.Game.player, S = G.ExpDive.run, out = {};
		H.thin(); for (const e of G.EnemyMgr.all()) { e.dead = true; e.fade = 0; }
		S.combo = null; H.step(1);
		const xm0 = pl.xpMul / (pl.xcomboK || 1);
		const mk = () => { const e = new G.Enemy(G.ExpClassic.defOf(19, 0), pl.x + 200, pl.y, { hp: 10, dmg: 0, spd: 0.0001 }); e.xmove = () => true; G.EnemyMgr.add(e); return e; };
		const keep = mk(); keep.maxHp = keep.hp = 1e8;   // (one left standing, out of the basic's reach to kill: no floor-clear hit-stop yet)
		H.step(3); S.combo = null;
		const stake0 = S.stake;
		for (let i = 0; i < 10; i++) { const e = mk(); e.hurt(1e6); H.step(1); }
		out.n = S.combo.n; out.xpK = +(pl.xpMul / xm0).toFixed(3); out.milestone = S.stake - stake0;
		out.block = JSON.parse(JSON.stringify(G.ExpDive.dBlock().k || null));
		out.popup = G.I18n.f('Racha x{x}', 10) + '!'; out.meter = G.I18n.f('x{x} RACHA', 10);
		H.step(Math.ceil(3.2 * 30));
		out.broken = S.combo.n; out.xpBack = +(pl.xpMul / xm0).toFixed(3); out.best = S.combo.best;
		// the floor's last foe: a hit-stop (the world holds: the run's clock doesn't move)
		keep.hurt(1e9);
		const t0 = G.Game.st.time; H.step(1); H.step(1);
		out.held = G.Game.st.time - t0 < 0.04 && S.holdT !== undefined;
		H.step(10);
		out.after = G.Game.st.time - t0 > 0.1;
		return out;
	});
	A(combo.n === 10 && Math.abs(combo.xpK - 1.2) < 0.011, 'ten quick KOs: a x10 combo and +20 % XP', JSON.stringify(combo));
	A(combo.milestone >= 0.5 + 10 * 0.12, 'the 10th pays its milestone loot on top of the KOs\'', JSON.stringify(combo));
	const tr = await E(page, () => {
		const keys = { '{x} rescatado': 'A rescued', '{x}, el guardián de la ruta': "A, the route's guardian", 'Nuevo récord en {x}: piso {x}': 'New record on A: floor B', 'Racha x{x}': 'Combo xA',
			'¡{x} te sigue! Llévalo a las escaleras': 'A follows you! Take it to the stairs', '— Piso {x} · {x} —': '— Floor A · B —', 'Inmersión · {x}: piso {x}': 'Dive · A: floor B',
			'Botín asegurado: {x} · en juego: {x}': 'Loot secured: A · at stake: B', 'Mejor racha: {x}': 'Best combo: A', 'Rescatados: {x}': 'Rescued: A' };
		return Object.entries(keys).filter(([k, v]) => G.I18n.f(k, 'A', 'B') !== v).map(([k]) => k + ' -> ' + G.I18n.f(k, 'A', 'B'));
	});
	A(Array.isArray(tr) && tr.length === 0, "every Dive phrase with a hole translates whole (none caught by a shorter pattern)", JSON.stringify(tr));
	A(combo.popup === 'Combo x10!' && combo.meter === 'x10 COMBO', 'the combo pop-up and meter are in English', JSON.stringify(combo));
	A(combo.block && combo.block[0] === 10, 'the combo is in the viewers\' block', JSON.stringify(combo));
	A(combo.broken === 0 && Math.abs(combo.xpBack - 1) < 1e-9 && combo.best >= 10, '3 s without a KO breaks it: the XP back to x1, the best kept', JSON.stringify(combo));
	A(combo.held && combo.after, 'the floor\'s last foe: a short hit-stop (the clock holds, then runs)', JSON.stringify(combo));

	// ======================== 4d. V6: landmarks and the floor's interactables (chests, the Kecleon shop, berries, gold)
	const v6 = await E(page, () => {
		const H = window.__t, pl = G.Game.player, S = G.ExpDive.run, out = {};
		// a landmark: an obelisk under the spawn (the run's state, as the generator would put one)
		S.L.landmark = { kind: 'obelisk', at: S.L.spawn.slice() }; S.lmUsed = false; S.lmT = 0;
		H.thin(); H.put(0, 0); H.step(40);
		out.used = S.lmUsed; out.k = +G.ExpDive.out(1, pl, null, null).toFixed(3); out.block = (G.ExpDive.dBlock().q & 48) === 48;
		S.obeliskT = 0;
		S.L.landmark = { kind: 'shrine', at: S.L.spawn.slice() }; S.lmUsed = false; pl.hp = 1; H.step(40);
		out.healed = Math.abs(pl.hp - (1 + pl.maxHp * 0.5)) < 1.5;   // (D1: half your HP, was all of it; regen ticks a little on top)
		S.L.landmark = null;
		// the interactables of Dive floors (pure from the floor): chests = free balls, a shop on ~1 in 4 plain floors
		const kinds = { freeball: 0, meowth: 0, berry: 0, rock: 0 }, arenaShop = [];
		let chests = 0;
		for (let f = 1; f <= 40; f++) {
			const z = G.ExpClassic.build(4242, 'dive:forest', f), lay = G.ExpEco.layoutOf(z);
			chests += z.dive.chests.length + (z.dive.plugs || []).length;   // (+ the secret pockets' chests)
			for (const o of lay.objs) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
			if ((f % 5 === 0) && lay.objs.some(o => o.kind === 'meowth')) arenaShop.push(f);
			for (const o of lay.objs) if (z.terr(o.tx, o.ty) !== 0) out.offFloor = (out.offFloor || 0) + 1;
		}
		out.kinds = kinds; out.chests = chests; out.arenaShop = arenaShop;
		return out;
	});
	A(v6.used && Math.abs(v6.k - 1.3) < 1e-9 && v6.block, 'an obelisk: stand on it 1 s, +30 % damage (in the viewers\' block too)', JSON.stringify(v6));
	A(v6.healed, 'a shrine heals half your HP (D1)', JSON.stringify(v6));
	A(v6.kinds.freeball === v6.chests && v6.kinds.meowth >= 3 && v6.kinds.meowth <= 20 && v6.kinds.berry > 40 && v6.kinds.rock > 60 && !v6.arenaShop.length && !v6.offFloor,
		'40 floors\' interactables: every chest a free Poké Ball, the Kecleon shop on ~1 in 4 plain floors (never an arena), berries and gold, all on floor tiles', JSON.stringify(v6));

	// ======================== 5. the alpha (floor 5)
	const al = await E(page, () => {
		const H = window.__t;
		H.downTo(5);
		const S = G.ExpDive.run, b = S.boss;
		const out = { floor: S.floor, alpha: !!b && b.xk === 'alpha', sealed: S.sealed, scale: b && b.scale };
		H.thin(); H.toStairs(); H.step(30, 1 / 30, () => { H.toStairs(); });
		out.stillOn5 = S.floor === 5;
		const stake = S.stake, bank = S.bank;
		b.hurt(b.maxHp * 2); H.step(3);
		out.stakeAfter = S.stake; out.secured = S.bank >= bank + stake + 6 && S.stake < 10;   // (the stake + the alpha's own loot banked; a KO or two may land after)
		out.bank = S.bank; out.unsealed = !S.sealed;
		H.toStairs(); H.step(24, 1 / 30, () => { if (S.floor !== 5) return false; H.toStairs(); });
		out.after = S.floor;
		return out;
	});
	if (SHOTS) {
		await E(page, () => { const H = window.__t; H.thin(); H.toStairs(); G.Game.player.y += 60; });
		await shoot(page, 'dive_floor6_stairs.png');
	}
	A(al.floor === 5 && al.alpha && al.sealed && al.scale > 1.4, 'floor 5: an alpha (x1.45) seals the stairs', JSON.stringify(al));
	A(al.stillOn5, 'the sealed stairs don\'t take you down', JSON.stringify(al));
	A(al.secured && al.unsealed && al.after === 6, 'its fall banks the whole stake and opens the stairs (floor 6)', JSON.stringify(al));

	// ======================== 6. the Escape Rope (floor 10)
	const rp = await E(page, () => {
		const H = window.__t;
		H.downTo(10);
		const S = G.ExpDive.run, L = G.World.zone.dive, [rx, ry] = H.wpos(L.spawn);
		const out = { floor: S.floor, rope: L.cadence.rope };
		H.thin();
		const b = S.boss; if (b) { b.hurt(b.maxHp * 2); H.step(2); }
		S.stake += 40;   // something at stake to carry out
		out.bank = S.bank; out.stake = S.stake;
		// a hit cancels it
		H.put(rx, ry); H.step(45);
		const t1 = S.ropeT;
		G.Hooks.call('player.hurt', 5, G.Game.player, 'normal'); H.step(1);
		out.cancel = t1 > 1 && S.ropeT < 0.1;
		out.coins0 = G.DB.save.coins;
		H.put(rx, ry);
		H.step(120);
		out.state = G.Game.state; out.over = G.Game.state !== 'playing'; out.escaped = S.escaped;
		out.pay = G.ExpDive.pay();
		return out;
	});
	A(rp.floor === 10 && rp.rope, 'floor 10 has the rope circle', JSON.stringify(rp));
	A(rp.cancel, 'a hit cancels the rope', JSON.stringify(rp));
	A(rp.escaped && rp.over && rp.pay === Math.floor(rp.bank + rp.stake), 'standing still in it ends the run ESCAPED; the pay is bank + stake', JSON.stringify(rp));
	await sleep(400);
	const end = await E(page, () => ({ coins: G.DB.save.coins, best: G.ExpSave.get('dive.forest.best'), runs: G.ExpSave.get('dive.runs'), esc: G.ExpSave.get('dive.escapes'), txt: (document.getElementById('scr-over') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 600) }));
	A(end.coins > rp.coins0 && end.best === 10 && end.runs === 1 && end.esc === 1, 'the Pokémonedas land in the shared wallet; the Expedition save keeps dive.forest.best = 10, a run, an escape', JSON.stringify(end));
	A(/Dive · Mossy Woods: floor 10/.test(end.txt) && /You escaped/.test(end.txt) && !/Piso|asegurado|Escapaste/.test(end.txt), 'the run-over screen says it in English', end.txt);

	// ======================== 6b. the phone (landscape 844 x 390, touch): the buttons fit, apart, clear of the Ultimate
	{
		const ctx2 = await browser.createBrowserContext();
		const pg = await ctx2.newPage();
		await pg.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await pg.evaluateOnNewDocument(BEFORE, SAVE);
		pg.on('pageerror', e => errors.push('pageerr(phone): ' + e.message));
		await pg.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => pg.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		await pg.evaluate(() => { const t = document.getElementById('tap-start'); if (t && !t.classList.contains('hidden')) t.click(); G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		await sleep(400);
		const ok = await E(pg, async () => { await G.Flow.play('exp-dive'); return G.Game.state; });
		await pg.touchscreen.tap(420, 200);
		await sleep(600);
		const ph = await E(pg, () => {
			const r = G.ExpDive.rects, k = (G.HUD && G.HUD.k) || 1, touch = G.Touch.active, W = innerWidth, H = innerHeight;
			const ub = G.ZMoves.buttonRect(W / k, H / k), u = { x: ub.x * k, y: ub.y * k, s: ub.s * k };
			const all = r ? { sp1: r.sp1, sp2: r.sp2, dodge: r.dodge, ult: u } : {};
			const inside = Object.values(all).every(b => b.x >= 0 && b.y >= 0 && b.x + b.s <= W && b.y + b.s <= H);
			const ks = Object.keys(all), over = [];
			for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = all[ks[i]], b = all[ks[j]]; if (a.x < b.x + b.s && b.x < a.x + a.s && a.y < b.y + b.s && b.y < a.y + a.s) over.push(ks[i] + '/' + ks[j]); }
			return { touch, inside, over, all, W, H };
		});
		A(ok === 'playing' && ph.touch && ph.inside && ph.over.length === 0, 'the phone: SPECIAL 1 / 2, DODGE and the Ultimate on screen, none overlapping', JSON.stringify(ph));
		const ptap = await E(pg, () => { const pl = G.Game.player; for (const g of pl.slots) for (const m of g) m.t = 0; const r = G.ExpDive.rects.dodge; return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; });
		await pg.touchscreen.tap(ptap.x, ptap.y);
		await sleep(80);
		const pd = await E(pg, () => ({ slide: G.Game.player.slideT > 0 || G.Game.player.slideCd > 0 }));
		A(pd.slide, 'a real tap on DODGE dodges', JSON.stringify(pd));
		if (SHOTS) { await sleep(300); fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, 'dive_phone.png') }); console.log('     screenshot: dive_phone.png'); }
		await ctx2.close();
	}

	// ======================== 7. a faint
	const ft = await E(page, async () => {
		const H = window.__t;
		G.Game.toUI && G.Game.toUI();
		await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
		H.downTo(3);
		const S = G.ExpDive.run;
		S.bank = 100; S.stake = 81;
		const coins0 = G.DB.save.coins;
		G.Game.endRun(true);
		return { pay: G.ExpDive.pay(), escaped: S.escaped, coins0 };
	});
	A(ft.pay === Math.floor(100 + 81 / 4) && !ft.escaped, 'a faint pays the bank + a quarter of the stake (100 + 81 -> 120)', JSON.stringify(ft));

	// ======================== 7b. the red ground (PokéDive's telegraphs), on the host
	const tele = await E(page, async () => {
		const H = window.__t, out = {};
		G.Game.toUI && G.Game.toUI();
		await new Promise(r => setTimeout(r, 200));
		await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
		const pl = G.Game.player, S = G.ExpDive.run;
		H.thin(); for (const e of G.EnemyMgr.all()) { e.dead = true; e.fade = 0; }
		pl.hurt = function (d) { if (this.invuln > 0) return; H.hit = (H.hit || 0) + d; this.invuln = 0.45; };
		const brawler = G.DEX.find(p => !p.leg && p.bst < 400 && G.ExpClassic.defOf(p.dex, 0).shotCd == null && G.Enemies.behaviorOf(p) !== 'thief');
		const mk = (dx, xk) => { const e = new G.Enemy(G.ExpClassic.defOf(brawler.dex, 0), pl.x + dx, pl.y, { hp: 1e7, dmg: 4, spd: 0.0001 }); e.dmg = 4; if (xk) e.xk = xk; G.EnemyMgr.add(e); e.xtcd = 0; return e; };
		// a slam you stand in
		const e1 = mk(30);
		H.step(2);
		out.slam = S.tg.length === 1 && S.tg[0].k === 'slam' && !!e1.xtele;
		const x1 = e1.x; H.step(10); out.held = Math.abs(e1.x - x1) < 0.5;
		out.block = JSON.parse(JSON.stringify(G.ExpDive.dBlock()));
		H.hit = 0; for (let i = 0; i < 30 && S.tg.length; i++) H.step(1);
		out.hitStanding = H.hit; out.released = !e1.xtele;
		// a slam you dodge out of (the i-frames at the moment it lands)
		pl.invuln = 0; e1.xtcd = 0; H.step(2);
		const t1 = S.tg[0]; H.hit = 0;
		while (t1 && t1.t < t1.T - 0.1) H.step(1);
		pl.slideCd = 0; G.ExpDive.pad('confirm'); for (let i = 0; i < 6 && S.tg.length; i++) H.step(1);
		out.hitDodging = H.hit;
		e1.dead = true; e1.fade = 0;
		// an alpha out of slam reach charges: a lane, then a dash along it
		H.step(5); S.tg.length = 0;
		const e2 = mk(4 * H.TS(), 'alpha'); e2.xtcd = 0;
		H.step(2);
		const t2 = S.tg.find(t => t.e === e2);
		out.charge = t2 && t2.k; const x2 = e2.x;
		for (let i = 0; i < 60 && S.tg.length; i++) H.step(1);
		out.dashed = Math.round(Math.abs(e2.x - x2));
		e2.dead = true;
		return out;
	});
	A(tele.slam && tele.held, 'a brawler that reaches you winds up a slam (red circle) and holds still', JSON.stringify(tele));
	A(tele.block && tele.block.dv === 1 && tele.block.tg && tele.block.tg.length === 1 && tele.block.tg[0][0] === 1, 'the slam is in the viewers\' block (tg)', JSON.stringify(tele.block));
	A(tele.hitStanding > 0 && tele.released, 'standing in it when it lands: you are hit; then the foe moves again', JSON.stringify(tele));
	A(tele.hitDodging === 0, 'dodging as it lands: no damage (the i-frames)', JSON.stringify(tele));
	A(tele.charge === 'charge' && tele.dashed > 2 * 32, 'an alpha out of reach charges: a red lane, then it dashes along it', JSON.stringify(tele));

	// ======================== 7c. viewers: a replay keeps the block; a fresh page as spectator, replay viewer, co-op guest
	const rec = await E(page, async () => {
		const H = window.__t, S = G.ExpDive.run, pl = G.Game.player;
		H.thin(); H.toStairs(); H.step(24, 1 / 30, () => { if (S.floor !== 1) return false; H.toStairs(); });
		S.stake = 77; S.bank = 33;
		H.thin();
		const e = new G.Enemy(G.ExpClassic.defOf(19, 0), pl.x + 30, pl.y, { hp: 1e7, dmg: 0, spd: 0.0001 }); G.EnemyMgr.add(e); e.xtcd = 0;
		H.step(4);
		const mid = JSON.parse(JSON.stringify(G.Spectate.snap()));
		H.step(30);
		G.Game.quit();
		await new Promise(r => setTimeout(r, 300));
		const last = G.Replay.last; await last.ready;
		const rd = await G.Replay.open(last.code);
		let n2 = 0, tg = 0;
		for (let i = 0; i < rd.length; i++) { const s = rd.at(i), c = s.x && s.x.c; if (c && c.dv && c.f === 2) n2++; if (c && c.tg) tg++; }
		return { seed: G.World.seed, mid, code: last.code, n2, tg, hash: mid.x && mid.x.th, bytes: last.code ? 1 : 0 };
	});
	A(rec.mid && rec.mid.x && rec.mid.x.c && rec.mid.x.c.dv === 1 && rec.mid.x.c.f === 2 && rec.mid.x.m === 'dive:forest' && rec.mid.x.z === 2, 'a live snapshot carries the Dive block (floor 2) and the floor\'s zone block', JSON.stringify(rec.mid && rec.mid.x));
	A(rec.n2 > 0 && rec.tg > 0, `the replay keeps it (${rec.n2} frames on floor 2, ${rec.tg} with red ground)`, JSON.stringify({ n2: rec.n2, tg: rec.tg }));
	{
		const d = await bootPage();
		const g = await E(d.page, async (rec) => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const out = {};
			// a live spectator
			G.MicaAccount.name = () => 'viewer';
			// (the Expedition code loaded first: a cold page's very first snapshot lands while it loads; a live view gets one every ~0.5 s)
			await G.Expedition.load();
			G.Spectate.watch = (u, h) => { h.snapshot(rec.mid, {}); };
			G.WatchUI.watchLive('host');
			for (let i = 0; i < 80 && !(G.World.zone && G.World.zone.hash === rec.hash); i++) await wait(50);
			await wait(300);
			const v = G.ExpDive.view;
			out.spec = { hash: G.World.zone && G.World.zone.hash, floor: v && v.floor, stake: v && v.stake, tg: v && v.tg.length, shown: G.ExpDive.shown(), hud: G.ExpClassic.hudLine(G.WatchUI.player, G.Game.st) };
			G.WatchUI.leave();
			await wait(200);
			// the replay viewer
			const rd = await G.Replay.open(rec.code);
			let at = -1;
			for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.c && s.x.c.dv && s.x.c.f === 2) { at = i; break; } }
			G.WatchUI.playReplay(rd, {});
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.dive); i++) { G.WatchUI.seek(rd.times[0]); await wait(50); }
			G.WatchUI.togglePlay();
			G.WatchUI.seek(rd.times[at]); await wait(200);
			const v2 = G.ExpDive.view;
			out.replay = { at, floor: v2 && v2.floor, zone: G.World.zone && G.World.zone.zone, map: G.World.zone && G.World.zone.map, hud: G.ExpClassic.hudLine(G.WatchUI.player, G.Game.st) };
			G.WatchUI.leave();
			await wait(200);
			// a co-op guest: a host frame through G.Net's handler
			const H = window.__t;
			G.Flow.play('normal'); H.freeze();
			G.World.reset(rec.seed);
			const pl = G.Game.player, cb = new Proxy({}, { get: (t, k) => k === 'team' ? () => ({}) : () => {} });
			G.Coop.begin({ seed: rec.seed, host: 'alice', members: [{ uid: 'alice', name: 'alice', dex: 4 }, { uid: G.Net.uid, name: 'me', dex: 4 }] }, pl, cb);
			const frame = { k: 'f', t: 1, lv: 1, xp: 0, xn: 10, ki: 0, bo: 0, co: 0, tk: [0, 0], p: { alice: [0, 0, 0, 0, 100, 100, 0, '', 1, 78, 0, 1, 0, 0, 0] }, e: [], ev: [], ho: [], x: rec.mid.x };
			H.deliver('alice', frame);
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.hash === rec.hash); i++) await wait(50);
			H.deliver('alice', Object.assign({}, frame, { t: 2 }));
			const v3 = G.ExpDive.view;
			await wait(50);
			const gp = G.Game.player, TS = G.World.TS;
			out.guest = { hash: G.World.zone && G.World.zone.hash, floor: v3 && v3.floor, bank: v3 && v3.bank, px: Math.round(gp.x), py: Math.round(gp.y), onFloor: G.World.maskAt(Math.floor(gp.x / TS), Math.floor(gp.y / TS)) > 0 };
			G.Coop.end(); G.Game.quit();
			return out;
		}, rec);
		A(g.spec && g.spec.hash === rec.hash && g.spec.floor === 2 && g.spec.stake === rec.mid.x.c.s && g.spec.tg >= 1 && g.spec.shown && new RegExp('^FLOOR 2 · MOSSY WOODS · 33 secured · ' + rec.mid.x.c.s + ' at stake').test(g.spec.hud || ''),
			'a live spectator (a fresh page) sees the same floor, the HUD line and the red ground', JSON.stringify(g.spec || g));
		A(g.replay && g.replay.at >= 0 && g.replay.floor === 2 && g.replay.zone === 2 && g.replay.map === 'dive:forest' && /^FLOOR 2/.test(g.replay.hud || ''),
			'a replay viewer seeks to floor 2: the same floor rebuilt, its HUD line', JSON.stringify(g.replay || g));
		A(g.guest && g.guest.hash === rec.hash && g.guest.floor === 2 && g.guest.bank === 33 && Math.abs(g.guest.px) <= 80 && g.guest.py === 0 && g.guest.onFloor, 'a co-op guest rebuilds the floor from a host frame, shows its loot, and stands on its spawn (V8: follows the host down)', JSON.stringify(g.guest || g));
		await d.ctx.close();
	}

	// ======================== 8. viewers and routes
	const vw = await E(page, async () => {
		const seed = 12345, z0 = G.ExpClassic.build(seed, 'dive:reef', 7), z1 = G.ExpClassic.build(seed, 'dive:reef', 7), z2 = G.ExpClassic.build(seed, 'dive:reef', 8);
		G.Expedition.diveRoute('reef');
		const plan = G.Modes.plan('exp-dive');
		G.Expedition.diveRoute('forest');
		return { same: z0.hash === z1.hash, other: z0.hash !== z2.hash, w: z0.w, h: z0.h, plan: plan.map, biome: G.ExpTerrain.biomeOf('dive:reef') === G.ExpTerrain.biomeOf('cerulean'), floorDive: !!z0.dive };
	});
	A(vw.same && vw.other && vw.w === 56 && vw.h === 40 && vw.floorDive, 'a viewer rebuilds the same floor from {seed, dive:<route>, floor} (classic.build -> G.DiveGen)', JSON.stringify(vw));
	A(vw.plan === 'dive:reef' && vw.biome, 'the route pick plans its map (dive:reef) and paints in its look (the sea)', JSON.stringify(vw));

	// ======================== 9. the species
	const sp = await E(page, () => {
		const D = G.ExpDive, seen = new Set();
		for (const r of G.DiveGen.ROUTE_IDS) for (let f = 1; f <= 120; f += 1) for (const [dex] of D.pool(r, f).list) seen.add(dex);
		const nonLeg = G.DEX.filter(p => !p.leg).map(p => p.dex), missing = nonLeg.filter(d => !seen.has(d));
		const legs = Object.values(D.GUARDIANS).flat(), legOk = legs.every(d => G.DEX_BY[d] && G.DEX_BY[d].leg);
		const anyLeg = [...seen].some(d => G.DEX_BY[d].leg);
		return { seen: seen.size, nonLeg: nonLeg.length, missing: missing.slice(0, 10), legOk, guardians: legs.length, anyLeg, t1: D.target(1), t25: D.target(25), t100: Math.round(D.target(100)) };
	});
	A(sp.missing.length === 0 && !sp.anyLeg, `every non-legendary species can come as a foe (${sp.seen} / ${sp.nonLeg}); no legendary ever does`, JSON.stringify(sp));
	A(sp.legOk && sp.guardians === 36, 'the 32 route guardians + Arceus (the Route of Origin) are legendaries', JSON.stringify(sp));
	A(sp.t1 === 272 && sp.t25 === 560 && sp.t100 > 580 && sp.t100 < 620, 'PokéDive\'s depth curve: 272 on floor 1, 560 on 25, toward 620 below', JSON.stringify(sp));

	// ======================== 10. V7: the route and start-floor picker, stages, Seals, the Route of Origin
	{
		const d = await bootPage();
		const pg = d.page;
		await pg.evaluate(() => G.ModesUI.open());
		await waitFor(() => d.visible('scr-modes'), 3000);
		await sleep(250);
		const lbl0 = await E(pg, () => { const b = document.getElementById('modes-dive-pick'); return b && b.innerText.trim(); });
		A(/^Route: Mossy Woods · floor 1$/.test(lbl0 || ''), 'the Dive card has a "Route: Mossy Woods · floor 1" button', lbl0);
		await pg.click('#modes-dive-pick');
		await waitFor(() => d.visible('modes-xdive'), 8000);
		const p0 = await E(pg, () => ({
			cards: [...document.querySelectorAll('#modes-xdive [data-route]')].map(b => ({ r: b.dataset.route, on: b.classList.contains('on'), locked: b.classList.contains('locked') })),
			starts: [...document.querySelectorAll('#modes-xdive [data-start]')].map(b => +b.dataset.start),
			txt: document.getElementById('modes-xdive').innerText.replace(/\s+/g, ' '), main: document.getElementById('modes-main').classList.contains('hidden') }));
		A(p0.cards && p0.cards.length === 9 && p0.cards[0].on && p0.cards[8].r === 'origin' && p0.cards[8].locked && p0.cards.slice(0, 8).every(c => !c.locked) && p0.main,
			'the picker: 8 routes open, the Route of Origin locked, Mossy Woods picked', JSON.stringify(p0.cards));
		A(JSON.stringify(p0.starts) === '[1]' && /Awaken the 8 Seals \(0\/8\)/.test(p0.txt) && !/Ruta|Piso|Sello/.test(p0.txt), 'no stage yet: start on floor 1 only; in English', p0.txt);
		await pg.click('#modes-xdive [data-route=reef]');
		await pg.click('#modes-xdive [data-route=origin]');
		const p1 = await E(pg, () => ({ route: G.Expedition.diveRoute(), on: document.querySelector('#modes-xdive .xd-route.on').dataset.route }));
		A(p1.route === 'reef' && p1.on === 'reef', 'clicking a route picks it; the locked Route of Origin refuses', JSON.stringify(p1));
		// a saved stage (a guardian beaten on floor 25 and on 50)
		await E(pg, () => { G.ExpSave.best('dive.reef.stage', 51); G.ExpSave.best('dive.reef.best', 57); });
		await pg.click('#modes-xdive [data-route=reef]');
		const p2 = await E(pg, () => ({ starts: [...document.querySelectorAll('#modes-xdive [data-start]')].map(b => +b.dataset.start), txt: document.querySelector('#modes-xdive [data-route=reef]').innerText.replace(/\s+/g, ' ') }));
		A(JSON.stringify(p2.starts) === '[1,26,51]' && /Best: floor 57/.test(p2.txt) && /Stage: floor 51/.test(p2.txt), 'stages 26 and 51 saved: start on 1, 26 or 51; the card shows the best and the stage', JSON.stringify(p2));
		await pg.click('#modes-xdive [data-start="26"]');
		await shoot(pg, 'dive_picker.png', 200);
		await E(pg, () => window.__t.thaw());   // (shoot leaves the frames frozen: the menu's keys need them)
		// Esc closes it; the card's button now says the pick
		await pg.keyboard.press('Escape');
		await sleep(200);
		const lbl1 = await E(pg, () => ({ closed: document.getElementById('modes-xdive').classList.contains('hidden'), lbl: document.getElementById('modes-dive-pick').innerText.trim() }));
		A(lbl1.closed && lbl1.lbl === 'Route: Sunken Reef · floor 26', 'Esc closes the picker; the button says "Route: Sunken Reef · floor 26"', JSON.stringify(lbl1));
		// the run starts on floor 26
		await pg.click('#modes-dive-pick');
		await waitFor(() => d.visible('modes-xdive'), 3000);
		await pg.click('#xd-go');
		await waitFor(() => E(pg, () => G.Game.state === 'playing' && G.ExpDive && !!G.ExpDive.run), 15000);
		const r26 = await E(pg, () => { window.__t.freeze(); const S = G.ExpDive.run; return { floor: S.floor, start: S.start, zone: G.World.zone.zone, map: G.World.zone.map, line: G.ExpClassic.hudLine(G.Game.player) }; });
		A(r26.floor === 26 && r26.start === 26 && r26.zone === 26 && r26.map === 'dive:reef' && /^FLOOR 26 · SUNKEN REEF/.test(r26.line), 'the dive starts on floor 26 of the Sunken Reef', JSON.stringify(r26));
		// a stage the save doesn't have is refused (floor 1)
		const bad = await E(pg, () => G.ExpDive.startOf('canyon', 26));
		A(bad === 1, 'a start floor the save hasn\'t reached falls back to floor 1', bad);
		// a guardian beaten awakens the route's Seal: +10 % damage, -10 % damage taken
		const sl = await E(pg, () => {
			const H = window.__t, S = G.ExpDive.run, pl = H.sturdy(), out = { before: G.ExpDive.sealOf('reef') };
			out.k0 = G.ExpDive.out(1, pl, null, null);
			H.downTo(50);
			out.floor = S.floor; out.guardian = S.boss && S.boss.xk; out.dex = S.boss && S.boss.dex;
			S.boss.hurt(S.boss.maxHp * 2); H.step(3);
			out.after = G.ExpDive.sealOf('reef'); out.k1 = +G.ExpDive.out(1, pl, null, null).toFixed(3); out.taken = +G.ExpDive.hurtK(10).toFixed(3); out.stage = S.stage;
			return out;
		});
		A(!sl.before && sl.floor === 50 && sl.guardian === 'guardian' && sl.dex === 249 && sl.after && sl.k1 === 1.1 && sl.taken === 9 && sl.stage === 51,
			'floor 50: Lugia, the reef\'s 2nd guardian; beaten, it awakens the Seal (x1.1 damage, x0.9 taken) and saves stage 51', JSON.stringify(sl));
		// the 8 Seals open the Route of Origin (Arceus)
		const og = await E(pg, () => { for (const r of G.ExpDive.MAIN) G.ExpSave.add('dive.seal', r); return { open: G.ExpDive.routeOpen('origin'), seals: G.ExpDive.seals(), g: G.ExpDive.guardianOf('origin', 25) }; });
		A(og.open && og.seals === 8 && og.g === 493, 'all 8 Seals open the Route of Origin, guarded by Arceus', JSON.stringify(og));
		await d.ctx.close();
	}
	// the picker on a phone (844 x 390): it fits, no sideways scroll, the start button reachable
	{
		const ctx2 = await browser.createBrowserContext();
		const pg = await ctx2.newPage();
		await pg.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await pg.evaluateOnNewDocument(BEFORE, SAVE);
		await pg.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => pg.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		await pg.evaluate(() => { const t = document.getElementById('tap-start'); if (t && !t.classList.contains('hidden')) t.click(); });
		await sleep(300);
		const ph = await E(pg, async () => {
			G.UI.show && G.ModesUI && G.ModesUI.open && G.ModesUI.open();
			await new Promise(r => setTimeout(r, 300));
			const b = document.getElementById('modes-dive-pick'); if (b) b.click();
			for (let i = 0; i < 80 && !(document.getElementById('modes-xdive') && !document.getElementById('modes-xdive').classList.contains('hidden')); i++) await new Promise(r => setTimeout(r, 50));
			const box = document.querySelector('#scr-modes .modes-box'), el = document.getElementById('modes-xdive'), go = document.getElementById('xd-go');
			if (!el) return { none: true };
			go.scrollIntoView({ block: 'nearest' });
			const rg = go.getBoundingClientRect();
			return { side: box.scrollWidth - box.clientWidth, w: innerWidth, goIn: rg.top >= 0 && rg.bottom <= innerHeight && rg.left >= 0 && rg.right <= innerWidth, routes: el.querySelectorAll('[data-route]').length };
		});
		A(ph.routes === 9 && ph.side <= 2 && ph.goIn, 'the phone: the picker fits (no sideways scroll), the start button reachable', JSON.stringify(ph));
		await ctx2.close();
	}

	// ======================== 11. V8: the Weekly Dive, the boards, the co-op rope
	{
		const d = await bootPage();
		const pg = d.page;
		const wk = await E(pg, async () => {
			const H = window.__t, X = G.Expedition, out = {};
			const w = X.diveWeekly(), w2 = X.diveWeekly(Date.now() + 1000), wNext = X.diveWeekly(Date.now() + 7 * 864e5);
			out.w = w; out.same = JSON.stringify(w) === JSON.stringify(w2); out.next = wNext.week === w.week + 1 && wNext.seed !== w.seed;
			const seeds = [], wait = ms => new Promise(r => setTimeout(r, ms));
			/** back to the menu (a run quits to its run-over screen first), then a new run; tags prove it's a new one */
			const fresh = async () => { if (G.Game.state === 'playing') G.Game.quit(); await wait(250); if (G.Game.toUI) G.Game.toUI(); await wait(100); };
			for (let i = 0; i < 2; i++) {
				await fresh();
				X.playWeekly(); await G.Flow.play('exp-dive'); H.freeze();
				const S = G.ExpDive.run;
				out['new' + i] = !S.tag; S.tag = 1;
				seeds.push(G.World.seed);
				out['r' + i] = { route: S.route, floor: S.floor, weekly: S.weekly && S.weekly.week, mod: S.weekly && S.weekly.mod, hash: G.World.zone.hash, mode: G.Modes.run.weekly };
			}
			out.seeds = seeds;
			// a plain dive afterwards is not the weekly
			await fresh();
			G.Expedition.diveRoute('forest'); G.Expedition.diveStart(1);
			await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
			out.plain = { isNew: !G.ExpDive.run.tag, weekly: G.ExpDive.run.weekly, seedDiffers: G.World.seed !== seeds[0] };
			// Glass Cannon: x1.5 dealt and taken (forced for the check)
			const S = G.ExpDive.run, pl = G.Game.player;
			S.weekly = { week: w.week, mod: 'glass' };
			out.glass = [+G.ExpDive.out(1, pl, null, null).toFixed(3), +G.ExpDive.hurtK(10).toFixed(3)];
			S.weekly = null;
			// the rope in co-op: a second player away from the circle holds it back
			H.downTo(10); H.thin();
			const L = G.World.zone.dive, [rx, ry] = H.wpos(L.spawn), mate = { x: rx + 400, y: ry, dead: false };
			H.put(rx, ry);
			for (let i = 0; i < 120; i++) G.ExpDive.update(1 / 30, [pl, mate], 0);
			out.ropeHeld = !S.escaped && S.ropeT === 0;
			mate.x = rx + 4;
			for (let i = 0; i < 120 && !S.escaped; i++) G.ExpDive.update(1 / 30, [pl, mate], 0);
			out.ropeBoth = S.escaped;
			return out;
		});
		A(wk.same && wk.next && wk.w.route && wk.w.mod, 'the Weekly Dive: the same all week (route, modifier, seed), another next week', JSON.stringify(wk.w));
		A(wk.r0 && wk.r0.weekly === wk.w.week && wk.r0.route === wk.w.route && wk.r0.floor === 1 && wk.r0.mod === wk.w.mod && wk.r0.mode === wk.w.week,
			'playing it: this week\'s route and modifier, from floor 1', JSON.stringify(wk.r0));
		A(wk.new0 && wk.new1 && wk.seeds[0] === wk.seeds[1] && wk.r0.hash === wk.r1.hash, 'two weekly runs get the same world seed and the same first floor (the same for everyone)', JSON.stringify({ s: wk.seeds, h: [wk.r0.hash, wk.r1.hash] }));
		A(wk.plain && wk.plain.isNew && wk.plain.weekly === null && wk.plain.seedDiffers, 'a plain dive after it is not the weekly (another seed)', JSON.stringify(wk.plain));
		A(JSON.stringify(wk.glass) === '[1.5,15]', 'Glass Cannon: x1.5 dealt and taken', JSON.stringify(wk.glass));
		A(wk.ropeHeld && wk.ropeBoth, 'co-op: the rope waits while a partner is out of the circle; with both in it, still, you all leave', JSON.stringify(wk));
		// the score to the board, and the picker's board / weekly card
		const sb = await E(pg, async () => {
			const calls = [];
			G.MicaAccount.name = () => 'diver';
			G.MicaAccount.call = async (action, body) => { calls.push([action, body]); return action === 'run-leaderboard'
				? { ok: true, body: { top: [{ name: 'diver', floor: 31 }, { name: 'zed', floor: 12 }], you: { rank: 1, floor: 31 } } } : { ok: true, body: { better: true, rank: 1 } }; };
			const S = G.ExpDive.run;
			S.deepest = 31; S.floor = 31; S.start = 26; S.escaped = false;
			const r = await G.ExpDive.submit({ time: 400, kills: 120, level: 20, dex: 1 });
			const body = calls[0] && calls[0][1];
			return { r, body };
		});
		A(sb.body && sb.body.expMode === 'exp-dive' && sb.body.mode === 'micasurvivor_expedition' && sb.body.route === 'forest' && sb.body.floor === 31 && sb.body.start === 26 && sb.body.time === 400 && !sb.body.weekly,
			'a run\'s score goes to the Dive board: route, deepest floor, start, time', JSON.stringify(sb.body));
		await E(pg, async () => { G.Game.quit(); await new Promise(r => setTimeout(r, 250)); if (G.Game.toUI) G.Game.toUI(); });
		await sleep(400);
		const ui0 = await E(pg, () => { if (G.ModesUI && G.ModesUI.open) G.ModesUI.open(); return { state: G.Game.state, shown: [...document.querySelectorAll('.scr:not(.hidden)')].map(e => e.id) }; });
		const shown = await waitFor(() => d.visible('modes-dive-pick'), 5000);
		A(shown, 'back from the run: the mode screen and the Dive card button', JSON.stringify(ui0));
		await pg.click('#modes-dive-pick');
		await waitFor(() => d.visible('modes-xdive'), 6000);
		await sleep(300);
		const pk = await E(pg, () => ({ weekly: document.querySelector('#modes-xdive .xd-weekly').innerText.replace(/\s+/g, ' '), list: document.getElementById('xd-list').innerText.replace(/\s+/g, ' ') }));
		A(/Weekly Dive/.test(pk.weekly) && /from floor 1/.test(pk.weekly) && /#1 diver floor 31/.test(pk.list) && /You: rank #1, floor 31/.test(pk.list), 'the picker: the Weekly Dive card; the route\'s board (top and your rank)', JSON.stringify(pk));
		await pg.click('#modes-xdive [data-board=weekly]');
		await sleep(200);
		const wq = await E(pg, () => window.__lastBoardBody || null);
		await pg.click('#xd-weekly');
		await waitFor(() => E(pg, () => G.Game.state === 'playing' && G.ExpDive.run), 15000);
		const wp = await E(pg, () => ({ weekly: G.ExpDive.run.weekly && G.ExpDive.run.weekly.week, w: G.Expedition.diveWeekly().week, line: G.ExpClassic.hudLine(G.Game.player) }));
		A(wp.weekly === wp.w, 'the picker\'s "Play the weekly" starts this week\'s Weekly Dive', JSON.stringify(wp));
		await d.ctx.close();
	}

	// ======================== 12. V9: the pay (owner default #8) and the step cost
	{
		const d = await bootPage();
		const bal = await E(d.page, async () => {
			await G.Expedition.load();
			const D = G.ExpDive, k = G.ExpMeta ? G.ExpMeta.K.SCALE : 3, coins = v => Math.round(v * k / 5) * 5;
			// a 15-minute base run, as game.js endRun pays it: time / 5 + KOs / 4 + 80 a boss + the coins picked up (x1 mul)
			const base15 = Math.floor(900 / 5) + Math.floor(3000 * 0.25) + 3 * 80 + 300;
			return { base15, f25: coins(D.expectedPay(25)), f10: coins(D.expectedPay(10)), f50: coins(D.expectedPay(50)), faint25: coins(D.expectedPay(25) * 0.25) };
		});
		A(bal.f25 >= bal.base15 * 0.75 && bal.f25 <= bal.base15 * 1.25, `an escaped floor-25 dive pays about a 15-minute base run (${bal.f25} vs ${bal.base15} Pokémonedas)`, JSON.stringify(bal));
		const tune = await E(d.page, () => { const K = G.ExpDive.K, T = G.ExpDive.TELE; return [K.HP_K, K.DMG_K, K.T_PER_FLOOR, K.TIER_BST, K.ALPHA.hp, K.ALPHA.dmg, K.GUARD.hp, K.GUARD.dmg, T.SLAM_DMG, T.CHARGE_DMG]; });
		A(JSON.stringify(tune) === '[3.3,2.4,13,80,7,1.2,50,1.4,1.35,1.6]', 'the difficulty tuning (D1, tools/micasurvivor/dive_sim.mjs 2026-11-11: fresh ~floor 7, half-upgraded ~15, maxed ~20; was 2.8 / 1.68: ~9 / ~19 / ~20-25) is what ships', JSON.stringify(tune));
		A(bal.f10 < bal.f25 * 0.5 && bal.f50 > bal.f25 * 2, 'deeper pays more than in proportion (floor 10 < half, floor 50 > twice)', JSON.stringify(bal));
		// the step cost on a deep floor, every group awake (a phone is ~4x slower: the 16 ms frame keeps room for drawing)
		const perf = await E(d.page, async () => {
			const H = window.__t;
			G.Expedition.diveRoute('reef'); G.ExpSave.best('dive.reef.stage', 26); G.Expedition.diveStart(26);
			await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
			const S = G.ExpDive.run;
			for (const g of S.groups) for (const e of g.list) { e.xmove = null; e.x = G.Game.player.x + (Math.random() - 0.5) * 500; e.y = G.Game.player.y + (Math.random() - 0.5) * 300; }
			for (const g of S.groups) g.awake = true;
			const n = G.EnemyMgr.all().filter(e => !e.dead).length;
			H.step(30);
			const t0 = performance.now(); H.step(300); const ms = (performance.now() - t0) / 300;
			return { floor: S.floor, foes: n, ms: +ms.toFixed(2) };
		});
		A(perf.floor === 26 && perf.foes >= 30 && perf.ms < 3, `a floor-26 step with every group awake (${perf.foes} foes): ${perf.ms} ms of logic (< 3 ms)`, JSON.stringify(perf));
		await d.ctx.close();
	}

	// ======================== 13. secret pockets (boulders / thickets) and the co-op team pot at the shop
	{
		const d = await bootPage();
		const pk = await E(d.page, async () => {
			const H = window.__t, out = {};
			G.Expedition.diveRoute('forest'); G.Expedition.diveStart(1);
			await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
			const S = G.ExpDive.run, pl = G.Game.player;
			// down to a floor with a pocket
			for (let k = 0; k < 12 && !(G.World.zone.dive.plugs || []).length; k++) H.downTo(S.floor + 1);
			const L = G.World.zone.dive, pg = L.plugs[0], i = 0;
			out.floor = S.floor; out.kind = pg && pg.kind;
			if (!pg) return out;
			const TS = H.TS(), z0w = G.World.zone;
			// the open floor next to the plug (the cave side), where you lean on it
			const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [pg.at[0] + dx, pg.at[1] + dy]).find(([tx, ty]) => G.World.maskAt(tx + z0w.x0, ty + z0w.y0) > 0 && G.ExpDive.run && true);
			const [x, y] = H.wpos(side || pg.at);
			const closed = () => G.World.maskAt(pg.at[0] + G.World.zone.x0, pg.at[1] + G.World.zone.y0) === 0;
			out.closed0 = closed();
			// the chest behind it is one of the floor's free balls
			out.chest = G.ExpEco.layoutOf(G.World.zone).objs.some(o => o.kind === 'freeball' && o.tx === pg.chest[0] + G.World.zone.x0 && o.ty === pg.chest[1] + G.World.zone.y0);
			// the wrong type (Bulbasaur): it stays shut, a tip says what it needs
			H.thin();
			const mon0 = pl.mon;
			pl.mon = Object.assign({}, mon0, { types: ['grass'] });
			H.step(40, 1 / 30, () => { pl.x = x; pl.y = y; });
			out.wrong = closed() && !(S.plugsOpen & 1) && !!S.plugTip;
			// the right type: it opens
			pl.mon = Object.assign({}, mon0, { types: pg.kind === 'boulder' ? ['fighting'] : ['fire'] });
			H.step(30, 1 / 30, () => { pl.x = x; pl.y = y; });
			out.opened = !closed() && (S.plugsOpen & 1) === 1 && pg.open === true;
			const blk = JSON.parse(JSON.stringify(G.ExpDive.dBlock()));
			out.blockPg = blk.pg;
			pl.mon = mon0;
			// a viewer: the floor rebuilt closed, then the host's block opens it
			const z0 = G.World.zone, z2 = G.ExpClassic.build(G.World.seed, z0.map, z0.zone);
			G.World.setZone(z2);
			out.viewerClosed = G.World.maskAt(pg.at[0] + z2.x0, pg.at[1] + z2.y0) === 0;
			G.ExpDive.applyD(blk);
			await new Promise(r => setTimeout(r, 0));
			out.viewerOpen = G.World.maskAt(pg.at[0] + z2.x0, pg.at[1] + z2.y0) > 0;
			G.ExpDive.applyD(null); G.World.setZone(z0);
			return out;
		});
		A(pk.kind && pk.closed0 && pk.chest, `a floor with a secret pocket (floor ${pk.floor}, a ${pk.kind}): shut, a chest behind it`, JSON.stringify(pk));
		A(pk.wrong, 'leaning on it with the wrong type: it stays shut and a tip says what it needs', JSON.stringify(pk));
		A(pk.opened && pk.blockPg === 1, 'the right type (Fighting / Fire): it opens; in the viewers\' block', JSON.stringify(pk));
		A(pk.viewerClosed && pk.viewerOpen, 'a viewer\'s rebuilt floor opens the same plug from the block', JSON.stringify(pk));
		// the team pot: in co-op the host keeps the team's ₽, and a guest's buy at the shop is paid from it
		const pot = await E(d.page, async () => {
			const H = window.__t, S = G.ExpDive.run, pl = G.Game.player, out = {};
			// a shop floor ahead
			let f = S.floor + 1;
			for (; f < S.floor + 30; f++) { if (f % 5 === 0) continue; const lay = G.ExpEco.layoutOf(G.ExpClassic.build(G.World.seed, 'dive:forest', f)); if (lay.objs.some(o => o.kind === 'meowth')) break; }
			H.downTo(f); H.thin(); H.step(10);
			out.floor = S.floor;
			const cb = new Proxy({}, { get: (t, k) => k === 'team' ? () => ({}) : () => {} });
			G.Coop.begin({ seed: G.World.seed, host: G.Net.uid, members: [{ uid: G.Net.uid, name: 'me', dex: 1 }, { uid: 'bob', name: 'bob', dex: 4 }] }, pl, cb);
			out.host = G.Coop.isHost;
			H.step(5);
			const eco = G.ExpEco, lay = eco.layoutOf(G.World.zone), shop = lay.objs.find(o => o.kind === 'meowth');
			// the stock appears once the stall is open (it is, all floor)
			H.put(shop.x, shop.y + 40); H.step(20);
			pl.coins = 1000;
			const m = G.Coop.mate('bob');
			out.mate = !!m;
			if (m) m.connected = true;
			const q0 = m ? m.q.length : 0, c0 = pl.coins;
			out.took = eco.netEvent(['xb', 0, shop.i], 'bob');
			out.paid = c0 - pl.coins; out.sent = m ? m.q.slice(q0).map(e => e[0]) : [];
			G.Coop.end();
			return out;
		});
		A(pot.host && pot.took && pot.paid > 0 && pot.sent.includes('xgi'), `co-op: a guest's buy at the Kecleon / Meowth shop is paid from the team's ₽ (the host's: -${pot.paid}) and the item sent to the guest`, JSON.stringify(pot));
		await d.ctx.close();
	}

	// ======================== 14. starting as a later stage (owner: "how come I can't play expedition as Annihilape")
	{
		const d = await bootPage();
		const fm = await E(d.page, async () => {
			const H = window.__t, LG = () => G.ExpLeague, out = {};
			await G.Expedition.load(); await G.ExpSave.open();
			// Annihilape (979) in the base collection: the Mankey family (56) is playable, and it can start as Annihilape
			G.DB.save.owned[979] = { at: 1, from: 'gacha' };
			out.family = G.FAMILY[979]; out.playable = LG().playable(56);
			out.open = [LG().formOpen(56), LG().formOpen(57), LG().formOpen(979)];
			out.lockedSet = LG().setForm(57); out.rootSet = LG().setForm(56);
			try { localStorage.removeItem('micasurvivorexp_pickform'); } catch (e) { /* */ }
			out.defaultForm = LG().formFor(56);
			out.set = LG().setPick(56) && LG().setForm(979);
			await G.Flow.play('exp-dive'); H.freeze();
			const pl = G.Game.player, R = LG().run;
			out.run = { dex: pl.dex, form: R.form, member: R.member, evo: R.evo, hpFull: pl.hp === pl.maxHp, name: pl.mon && pl.mon.name };
			// a run's evolutions open their forms: Charmeleon reached once -> Charmander's line can start as it
			out.charm0 = LG().formOpen(5);
			G.ExpSave.add('league.form', 5);
			out.charm1 = LG().formOpen(5);
			return out;
		});
		A(fm.family === 56 && fm.playable && JSON.stringify(fm.open) === '[false,false,true]' && fm.lockedSet === false && fm.rootSet === false && fm.defaultForm === 979 && fm.set,
			'Annihilape owned: the Mankey family is playable, but only AS Annihilape (owner: unlocking one does not unlock the family; Mankey and Primeape stay locked)', JSON.stringify(fm));
		A(fm.run && fm.run.dex === 979 && fm.run.form === 979 && fm.run.member === 56 && fm.run.evo === 0 && fm.run.hpFull, 'the run starts AS Annihilape (its body and stats; not counted as an evolution)', JSON.stringify(fm.run));
		A(fm.charm0 === false && fm.charm1 === true, 'a form reached in a run (the league.form set) can start the next one', JSON.stringify(fm));
		// the picker shows "Start as"
		await E(d.page, () => { G.Game.quit(); });
		await sleep(300);
		const pk = await E(d.page, async () => {
			if (G.Game.toUI) G.Game.toUI();
			G.ModesUI.open(); await new Promise(r => setTimeout(r, 200));
			const box = document.getElementById('modes-league') || document.createElement('div');
			G.ExpLeague.renderPicker(box, () => {}, () => {});
			return { chips: [...box.querySelectorAll('[data-form]')].map(c => [+c.dataset.form, c.classList.contains('on'), c.getAttribute('aria-disabled') === 'true']), txt: box.innerText.includes('Start as') };
		});
		A(pk.txt && JSON.stringify(pk.chips) === '[[56,false,true],[57,false,true],[979,true,false]]', 'the League picker: "Start as" Mankey (locked) / Primeape (locked) / Annihilape (picked)', JSON.stringify(pk));
		await d.ctx.close();
	}

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
