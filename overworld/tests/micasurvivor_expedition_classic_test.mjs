// micasurvivor_expedition_classic_test.mjs — MicaSurvivor DLC D3: Expedition · Classic, playable
// (micasurvivor/js/expedition/classic.js; Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.8-2.10 / 5.3 and the D3 row).
// A static server, headless Chrome, a fixed guest profile. One browser at a time (and it always exits).
//   1. the menu: Expedition · Classic is playable (no "Coming soon", not aria-disabled) and a click starts a run on Viridian
//      Forest; Survival and League still say "Coming soon" and start nothing; the content version is 2
//   2. the plan is pure and seeded: plan(seed, map, zone) twice is identical, draws no Math.random, another seed gives
//      another plan; each of zones 1-3 holds all 8 event kinds (alphas, swarm, stampede, flock, rock slide, elite wave,
//      totem, summoner) in time order, later zones earlier; the guardian is one of the zone's 3; the shrine has Mew
//      and no events; the altar sits on flat, walkable, reachable ground, the same from a rebuild
//   3. the live timeline (fast-forwarded with G.Game.debugStep): every event fires once, in the plan's order, at its time,
//      and spawns what it says (alpha / elite / totem / summoner marked, stampede and flock running straight, rock slide
//      telegraphs); the trickle grows a card a minute; at 10:00 the final swarm starts (cap up, new enemies x4 HP)
//   4. the guardian: standing in the altar circle 3 s wakes it (walking away drains the charge); its HP follows the DPS
//      rule (a measured DPS -> max(curve, DPS x target x 0.5)); past its target time it is exhausted (takenK, and a real
//      hit takes that much more); when it falls the portal opens on the altar and pulls in the pickups
//   5. the portal: standing in it takes you to zone 2 (new zone, new plan, clock reset, the split recorded)
//   6. a full run won: zones 1-3 and the shrine; Mew on the pedestal; the victory banner, then the run-over screen
//      "Expedition complete!" with the 4 splits; the Expedition save keeps the win, the best clear and the splits (a second
//      win shows the deltas); the base save is unchanged; no Spanish on the screen
//   7. viewers stay in sync: the `x` block v3 carries `c` on live snapshots, host frames and the replay; a fresh page as
//      co-op guest (a host frame through G.Net), live spectator and replay viewer rebuilds the same zone, the same altar,
//      and shows the same phase / charge / portal / special enemies; the shrine (zone 4) rebuilds too; a dv-1 snapshot
//      (no c) still loads
//   8. the phone (landscape 844x390, touch): the zone line and the arrow fit and the HUD overlaps nothing
//   9. screenshots (SHOTS=<dir>): each timeline event, the altar, the guardian, the portal, the shrine and the victory
//      screen, at desktop and phone size
//   node overworld/tests/micasurvivor_expedition_classic_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D3" count was taken.)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const MROOT = process.env.MICASURVIVOR_ROOT ? path.resolve(process.env.MICASURVIVOR_ROOT) : ROOT;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8851;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
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

// ---------------------------------------------------------------- the page side (before any page script)
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null, net: [], draws: 0 };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	// a counting Math.random (the plan must draw none)
	const real = Math.random;
	Math.random = () => { H.draws++; return real(); };
	// G.Net's message handlers, captured as js/net/coop.js registers its own (so a test can deliver a host frame)
	const G0 = window.G = window.G || {};
	let net = null;
	Object.defineProperty(G0, 'Net', { configurable: true, enumerable: true, get() { return net; }, set(v) {
		net = v;
		if (v && typeof v.on === 'function') { const on = v.on; v.on = function (fn) { H.net.push(fn); return on.call(this, fn); }; }
	} });
	H.deliver = (from, msg) => { for (const fn of H.net) fn(from, msg); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dclassic3');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	/** a sturdy test player: hurts are counted, not taken; no level-up screens (TEST ONLY) */
	H.sturdy = () => {
		const pl = G.Game.player;
		H.hurts = 0;
		pl.hurt = function () { H.hurts++; };
		pl.gainXp = () => 0;
		return pl;
	};
	/** step n times of dt (default 1/30), fn(i) after each (false stops) */
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { H.unblock(); G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i + 1; } return n; };
	/** a picked-up item with both slots full opens the item choice (the game waits): keep what you have */
	H.unblock = () => {
		// (D8: a downed alpha faints where it fell, and standing by it throws a Friend Ball; with the team full, the "swap whom?"
		//  choice holds the run like the item choice: keep the team, as this suite keeps its items)
		if (G.ExpEco && G.ExpEco.pick && G.ExpEco.pick.kind === 'friend') { G.ExpEco.closePick(); return; }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
	};
	/** D11: the base save before / after, without what an Expedition run pays (coins, the ledger, coinsEarned): {same, paid, keys} */
	H.baseDiff = (t0, t1) => {
		const strip = t => { const o = JSON.parse(t); const c = [o.coins, (o.stats && o.stats.coinsEarned) || 0]; delete o.coins; delete o.updated; delete o.led; if (o.stats) delete o.stats.coinsEarned; return [o, c]; };
		const [a, ca] = strip(t0), [b, cb] = strip(t1), keys = [...new Set(Object.keys(a).concat(Object.keys(b)))].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
		return { same: !keys.length && cb[0] - ca[0] === cb[1] - ca[1], paid: cb[0] - ca[0], earned: cb[1] - ca[1], keys, diff: keys.map(k => k + ': ' + JSON.stringify(a[k]).slice(0, 200) + ' -> ' + JSON.stringify(b[k]).slice(0, 200)) };
	};
	H.TS = () => G.World.TS;
	H.altarXY = () => G.ExpClassic.siteXY(G.ExpClassic.sitesOf(G.World.zone).altar);
	H.toAltar = () => { const pl = G.Game.player, [x, y] = H.altarXY(); pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; G.World.collide(pl); G.Camera.x = pl.x; G.Camera.y = pl.y; };
	H.away = () => { const pl = G.Game.player; pl.x = 0; pl.y = 0; pl.zMask = null; G.World.collide(pl); };
	/** kill everything but the boss (keeps a long fast-forward light) */
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.dead) { e.dead = true; e.fade = 0; } };
	/** wake the zone's boss (stand in the circle), then beat it with direct hits (as a strong player would) */
	H.beatBoss = () => {
		H.thin();
		H.step(300, 1 / 30, () => { if (G.ExpClassic.run.boss) return false; H.toAltar(); });
		const b = G.ExpClassic.run.boss;
		if (!b) return { error: 'no boss', ph: G.ExpClassic.run.ph };
		const out = { dex: b.dex, hp: b.maxHp, ph: G.ExpClassic.run.ph };
		let n = 0;
		while (!b.dead && n < 4000) { b.hurt(b.maxHp / 40); H.step(1); n++; if (n % 60 === 0) H.thin(); }
		H.step(3);
		out.down = b.dead; out.steps = n; out.phAfter = G.ExpClassic.run.ph;
		return out;
	};
	H.through = () => H.step(90, 1 / 30, () => { if (G.ExpClassic.run.ph === 0) return false; H.toAltar(); });
};

// ---------------------------------------------------------------- the browser
const T0 = Date.now();
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

	async function bootPage(view) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(view || { width: 1280, height: 720, deviceScaleFactor: 1 });
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
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };
	/** start Classic through the real flow and freeze the real frames */
	const startClassic = page => E(page, async () => {
		const ok = await G.Flow.play('exp-classic');
		window.__t.freeze();
		return { ok, state: G.Game.state, mode: G.Game.mode, zone: G.World.zone && G.World.zone.zone, map: G.World.zone && G.World.zone.map, classic: !!(G.ExpClassic && G.ExpClassic.on), dv: G.Modes.run.dv };
	});
	const shoot = async (page, name, ms = 450) => {
		if (!SHOTS) return null;
		await page.evaluate(() => window.__t.thaw());
		await sleep(ms);
		fs.mkdirSync(SHOTS, { recursive: true });
		const f = path.join(SHOTS, name);
		await page.screenshot({ path: f });
		await page.evaluate(() => window.__t.freeze());
		console.log('     screenshot: ' + f);
		return f;
	};
	/** for screenshots: the camera on (x, y), the game paused (the next frame draws it, nothing moves) */
	const frameOn = (page, x, y) => E(page, (x, y) => { G.Camera.x = x; G.Camera.y = y; G.Game.player.x = x; G.Game.player.y = y + 60; }, x, y);

	// ======================== 1. the menu
	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	await page.click('#scr-menu [data-go=modes]');
	A(await waitFor(() => d0.visible('scr-modes'), 3000), 'the menu opens "Choose a mode"');
	await sleep(250);
	const ui = await E(page, () => ({
		h: document.getElementById('modes-exp-h').innerText,
		cards: [...document.querySelectorAll('#modes-exp [data-exp]')].map(b => ({ id: b.dataset.exp, soon: b.classList.contains('soon'), aria: b.getAttribute('aria-disabled'), txt: b.innerText.replace(/\s+/g, ' ').trim() })),
		on: G.Expedition.MODES.filter(G.Expedition.enabled), dv: G.Expedition.DV,
	}));
	const cl = (ui.cards || []).find(c => c.id === 'exp-classic') || {}, rest = (ui.cards || []).filter(c => c.id === 'exp-league');
	A(JSON.stringify(ui.on) === '["exp-classic","exp-survival","exp-league"]' && ui.dv === 17, 'the registry: Classic, Survival (D11) and League (D13) enabled; the content version is 12 (D3 started bumping it; D4: 3; D5: 4; D6: 5; D7: 6; D8: 7; D9: 8; D10: 9; D11: 10; D12: 11; D13: 12)', JSON.stringify(ui));
	A(!cl.soon && cl.aria !== 'true' && !/Coming soon/.test(cl.txt) && /^Expedition · Classic .*Viridian Forest/.test(cl.txt), 'Classic is playable: no "Coming soon", not aria-disabled, says Viridian Forest (in English)', JSON.stringify(cl));
	A(rest.length === 1 && rest.every(c => !c.soon && c.aria !== 'true' && !/Coming soon/.test(c.txt) && /245 members/.test(c.txt)), 'League is playable since D13 (no "Coming soon"): "Your League: 245 members ..."', JSON.stringify(rest));
	A(ui.h === 'Expedition', 'the group heading is "Expedition" (no "coming soon" now one is playable)', ui.h);
	await page.click('#modes-exp [data-exp=exp-league]');
	A(await waitFor(() => E(page, () => !!(G.ExpMeta && G.ExpMeta.shown && G.ExpMeta.ui.league)), 6000) && await E(page, () => G.Game.state === 'ui'), 'clicking League opens League mode (the League\'s own screen: D13) and starts no run');
	await E(page, () => G.ExpMeta.close());
	await sleep(150);
	await page.click('#modes-exp [data-exp=exp-classic]');
	A(await waitFor(() => E(page, () => G.Game.state === 'playing' && !!G.ExpClassic && G.ExpClassic.on), 8000), 'clicking Classic starts an Expedition Classic run (the code lazy-loads)');
	const st0 = await E(page, () => { window.__t.freeze(); const S = G.ExpClassic.run; return { mode: G.Game.mode, dv: G.Modes.run.dv, map: S.map, zone: S.zone, ph: S.ph, z: G.World.zone && G.World.zone.zone, biome: G.World.biome, events: S.plan.events.length }; });
	A(st0.mode === 'exp-classic' && st0.dv === 17 && st0.map === 'viridian' && st0.zone === 1 && st0.z === 1 && st0.ph === 0 && st0.events >= 13, 'the run: Viridian Forest, zone 1, the altar waiting, a zone timeline of 13+ events', JSON.stringify(st0));

	// ======================== 2. the plan
	const pl2 = await E(page, () => {
		const C = G.ExpClassic, H = window.__t, d0 = H.draws;
		const a = [1, 2, 3, 4].map(z => C.plan(12345, 'viridian', z)), b = [1, 2, 3, 4].map(z => C.plan(12345, 'viridian', z));
		const draws = H.draws - d0;
		const c = C.plan(54321, 'viridian', 1);
		const kinds = a.slice(0, 3).map(p => [...new Set(p.events.map(e => e.kind))].sort());
		const sorted = a.every(p => p.events.every((e, i) => !i || p.events[i - 1].at <= e.at));
		const firstAlpha = a.slice(0, 3).map(p => p.events.find(e => e.kind === 'alpha').at);
		const guard = a.slice(0, 3).map((p, i) => C.MAPS.viridian.guardians[i].includes(p.guardian));
		// the altar: same from a rebuild, flat 5x5 floor, walkable and reachable from the spawn (the game's own masks)
		const z = G.World.zone, s1 = C.sitesOf(z).altar, z2 = C.build(z.seed, z.map, z.zone);
		const s2 = C.sitesOf(z2).altar;
		const reach = (() => { const st = new Set(['0,0']), q = [[0, 0]], m = (x, y) => G.World.maskAt(x, y);
			for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (st.has(k) || !(m(x + dx, y + dy) & m(x, y))) continue; st.add(k); q.push([x + dx, y + dy]); } }
			return st.has(s1[0] + ',' + s1[1]); })();
		const shrine = C.build(z.seed, 'viridian', 4), ss = C.sitesOf(shrine);
		return { same: JSON.stringify(a) === JSON.stringify(b), draws, differs: JSON.stringify(c.events) !== JSON.stringify(a[0].events) || c.guardian !== a[0].guardian,
			kinds, sorted, firstAlpha, guard, legend: a[3].legend, shrineEvents: a[3].events.length, cards: a[0].cards.length,
			altar: s1, altar2: s2, flat: z.height(s1[0], s1[1]) === z.height(s1[0] + 2, s1[1] - 2) && !z.rampDir(s1[0], s1[1]) && z.terr(s1[0], s1[1]) === 0, reach,
			dist: Math.round(Math.hypot(s1[0], s1[1])), shrineHash: shrine.hash === C.build(z.seed, 'viridian', 4).hash, shrineSite: ss && ss.shrine, sample: a[0].events.map(e => e.at + ':' + e.kind).join(' ') };
	});
	console.log('     zone 1 timeline: ' + pl2.sample);
	A(pl2.same && pl2.draws === 0, 'plan(seed, map, zone) is pure: the same twice, and it draws no Math.random', JSON.stringify({ same: pl2.same, draws: pl2.draws }));
	A(pl2.differs, 'another seed gives another plan');
	const ALL = 'alpha,elite,flock,rockslide,stampede,summoner,swarm,totem';
	A(pl2.kinds && pl2.kinds.every(k => k.join(',') === ALL) && pl2.sorted, 'each of zones 1-3 has all 8 kinds (alpha, swarm, stampede, flock, rock slide, elite wave, totem, summoner), in time order', JSON.stringify(pl2.kinds));
	A(pl2.firstAlpha && pl2.firstAlpha[0] === 150 && pl2.firstAlpha[1] === 130 && pl2.firstAlpha[2] === 110, 'later zones arrive earlier (the first alpha at 150 / 130 / 110 s)', JSON.stringify(pl2.firstAlpha));
	A(pl2.guard && pl2.guard.every(Boolean) && pl2.legend === 151 && pl2.shrineEvents === 0, "each zone's guardian is one of its 3; the shrine holds Mew and no timeline", JSON.stringify(pl2));
	A(JSON.stringify(pl2.altar) === JSON.stringify(pl2.altar2) && pl2.flat && pl2.reach && pl2.dist >= 26 && pl2.dist <= 48, `the altar: the same from a rebuild, on flat floor, reachable from the spawn, ${pl2.dist} tiles out`, JSON.stringify(pl2));
	A(pl2.shrineHash && pl2.shrineSite, 'the shrine zone (4) rebuilds byte-identically and has its pedestal');

	// ======================== 3. the live timeline (fast-forward)
	const tl = await E(page, () => {
		const H = window.__t, C = G.ExpClassic, S = C.run;
		H.sturdy(); H.away();
		const out = { seen: [], cards: [], stampede: null, flock: null, rocks: 0, marked: {} };
		const plan = S.plan.events.map(e => e.at + ':' + e.kind);
		let lastN = 0;
		H.step(Math.round(640 / 0.1), 0.1, () => {
			const zt = G.Game.st.time - S.zs;
			if (S.n !== lastN) {
				for (let i = lastN; i < S.n; i++) {
					const ev = S.log[i];
					out.seen.push(ev.at + ':' + ev.kind + '@' + ev.zt + '+' + ev.spawned);
					if (ev.kind === 'stampede' && !out.stampede) { const r = G.EnemyMgr.all().filter(e => e.xrun && !e.flying); out.stampede = { n: r.length, dirs: new Set(r.map(e => Math.round(Math.atan2(e.xrun.dy, e.xrun.dx) * 100))).size }; }
					if (ev.kind === 'flock' && !out.flock) { const r = G.EnemyMgr.all().filter(e => e.xrun && e.flying); out.flock = { n: r.length }; }
					if (ev.kind === 'rockslide') out.rocks = Math.max(out.rocks, G.Hazards.all.filter(h => h.type === 'rock').length);
				}
				for (const e of G.EnemyMgr.all()) if (e.xk) out.marked[e.xk] = (out.marked[e.xk] || 0) + 1;
				lastN = S.n;
			}
			if (Math.abs(zt - 30) < 0.05 || Math.abs(zt - 200) < 0.05) out.cards.push(new Set(G.EnemyMgr.all().map(e => e.dex)).size);
			if (zt > 300 && zt < 300.1) H.thin();
			const maxId = () => G.EnemyMgr.all().reduce((m, e) => Math.max(m, e.id), 0);
			if (zt > 586 && zt < 586.1) { H.thin(); out.id0 = maxId(); }
			if (zt > 588 && zt < 588.1) out.pre = maxId() - out.id0;
			if (zt > 602 && zt < 602.1) { H.thin(); out.id1 = maxId(); }
			if (zt > 604 && zt < 604.1) out.post = maxId() - out.id1;
		});
		out.plan = plan;
		out.fs = S.fs;
		out.n = S.n; out.total = S.plan.events.length;
		// the final swarm: new enemies x4 HP per minute past 10:00
		const t = G.Game.st.time, zt = t - S.zs;
		const late = G.EnemyMgr.all().filter(e => !e.dead && !e.xk && e.dex).slice(-5).map(e => e.maxHp);
		out.zt = Math.round(zt);
		out.count = G.EnemyMgr.count;
		out.late = late;
		out.hurts = H.hurts;
		return out;
	});
	const seenKinds = (tl.seen || []).map(s => s.split('@')[0]);
	A(tl.n === tl.total && JSON.stringify(seenKinds) === JSON.stringify(tl.plan), `every timeline event fired once, in the plan's order (${tl.n} of ${tl.total})`, JSON.stringify({ seen: tl.seen, plan: tl.plan }));
	A((tl.seen || []).every(s => { const [a, rest] = s.split('@'); const at = +a.split(':')[0], zt = +rest.split('+')[0]; return zt >= at && zt < at + 0.5; }), 'each at its time (within one step)', (tl.seen || []).join(' '));
	A((tl.seen || []).every(s => +s.split('+')[1] > 0), 'each spawned what it says (enemies, or the rock slide telegraphs)', (tl.seen || []).join(' '));
	A(tl.stampede && tl.stampede.n >= 8 && tl.stampede.dirs === 1 && tl.flock && tl.flock.n >= 6 && tl.rocks >= 10, 'a stampede herd charges one way, a flock flies straight across, a rock slide telegraphs its boulders', JSON.stringify({ st: tl.stampede, fl: tl.flock, rocks: tl.rocks }));
	A(tl.marked && tl.marked.alpha >= 1 && tl.marked.elite >= 3 && tl.marked.totem >= 1 && tl.marked.summoner >= 1, 'alphas, elites, totems and summoners are marked (their aura, their prize)', JSON.stringify(tl.marked));
	A(tl.cards && tl.cards.length === 2 && tl.cards[1] > tl.cards[0], 'the trickle grows: more species at 3:20 than at 0:30', JSON.stringify(tl.cards));
	A(tl.fs === true && tl.post > tl.pre * 3, `at 10:00 the final swarm starts: ${tl.post} spawns in 2 s against ${tl.pre} just before (x6, up to the raised cap)`, JSON.stringify({ fs: tl.fs, pre: tl.pre, post: tl.post, count: tl.count }));
	const fsHp = await E(page, () => {
		const H = window.__t, C = G.ExpClassic, S = C.run, t = G.Game.st.time;
		const mk = () => { const pl = G.Game.player; const n0 = G.EnemyMgr.count; G.ExpClassic.debugZoneTime(G.Game.st.time - S.zs); return n0; };
		void mk;
		// two enemies of the same species and tier, one a minute later in the final swarm: x4 HP
		const dex = S.plan.cards[0];
		H.thin(); H.step(1);
		const before = G.EnemyMgr.count;
		C.debugZoneTime(600); const a = spawnOne(dex); C.debugZoneTime(660); const b = spawnOne(dex);
		C.debugZoneTime(640);
		function spawnOne(d) { const n0 = G.EnemyMgr.all().length; S.acc = 1.2; C.update(0, [G.Game.player], G.Game.st.time); const e = G.EnemyMgr.all().slice(n0).find(x => x.dex === d) || G.EnemyMgr.all()[G.EnemyMgr.all().length - 1]; return e && e.maxHp / e.def.hp; }
		return { a, b, ratio: b / a, before, t };
	});
	A(fsHp.ratio > 3.6 && fsHp.ratio < 4.4, `a new enemy a minute into the final swarm has x4 the HP (x${fsHp.ratio && fsHp.ratio.toFixed(2)})`, JSON.stringify(fsHp));

	// ======================== 4. the guardian: altar, DPS rule, exhaustion, portal
	const gd = await E(page, () => {
		const H = window.__t, C = G.ExpClassic, S = C.run;
		H.thin(); C.debugZoneTime(200); S.fs = false;
		const out = {};
		// the altar charges while you stand in it and drains when you leave
		H.toAltar(); H.step(45);
		out.half = Math.round(S.charge * 100);
		H.away(); H.step(30);
		out.drained = Math.round(S.charge * 100);
		// a measured DPS: 600 damage a second for 30 s
		S.dps.length = 0;
		for (let i = 0; i < 31; i++) { G.DmgLog.as('other', () => G.DmgLog.note(600, false)); H.step(30); }
		out.dps = Math.round(C.dps());
		H.toAltar();
		H.step(Math.ceil(C.K.ALTAR_T * 30) + 6);
		const b = S.boss, rec = S.bosses[S.bosses.length - 1];
		out.ph = S.ph; out.boss = b && { dex: b.dex, hp: b.maxHp, xk: b.xk, boss: b.boss }; out.rec = rec;
		const want = C.bossHp({ zone: 1, dps: rec ? rec.dps : 0, t: rec ? rec.at : 0 });
		out.want = want;
		// exhaustion: none before the target, then x(1 + 0.15 per s)
		b.xborn = G.Game.st.time - 30; H.step(2); out.k30 = b.takenK || 1;
		b.xborn = G.Game.st.time - 50; H.step(2); out.k50 = +(b.takenK || 1).toFixed(2);
		const hp0 = b.hp; b.hurt(100); out.took = hp0 - b.hp;
		out.pure = [C.exhaustion(20, 40), C.exhaustion(50, 40), C.exhaustion(500, 40)];
		// the HP rule: low DPS -> the curve; high DPS -> DPS x target x 0.5 (x1.15 per tier)
		out.rule = [C.bossHp({ zone: 1, dps: 0 }), C.bossHp({ zone: 1, dps: 2000 }), C.bossHp({ zone: 2, dps: 2000 }), C.bossHp({ zone: 3, dps: 2000, tier: 1 }), C.bossHp({ zone: 4, dps: 2000, legend: true })];
		// beat it: the portal opens on the altar, pickups pulled in
		G.Pickups.drop('coin', b.x + 400, b.y + 300, 1);
		let n = 0;
		while (!b.dead && n < 3000) { b.hurt(b.maxHp / 30); H.step(1); n++; }
		H.step(3);
		out.down = b.dead; out.phAfter = S.ph; out.pulled = G.Pickups.all().filter(p => p.pulled).length;
		return out;
	});
	A(gd.half > 40 && gd.half < 60 && gd.drained < gd.half && gd.ph === 1, `the altar: 1.5 s in the circle charges it halfway (${gd.half}%), leaving drains it (${gd.drained}%), 3 s wakes the guardian`, JSON.stringify(gd));
	A(gd.boss && gd.boss.boss && gd.boss.xk === 'guardian' && gd.rec && gd.rec.dps > 550 && gd.want.fromDps > gd.want.curve && Math.abs(gd.boss.hp - gd.want.hp) <= 40 && Math.abs(gd.boss.hp - gd.rec.dps * 40 * 0.5) <= 40,
		`its HP follows the DPS rule: measured ${gd.rec && gd.rec.dps}/s at the wake -> max(curve ${gd.want && gd.want.curve}, ${gd.rec && gd.rec.dps} x 40 s x 0.5) = ${gd.boss && gd.boss.hp}`, JSON.stringify({ boss: gd.boss, want: gd.want, rec: gd.rec }));
	A(gd.rule && gd.rule[0].hp === gd.rule[0].curve && gd.rule[1].hp === 40000 && gd.rule[2].hp === 50000 && gd.rule[3].hp === Math.round(2000 * 60 * 0.5 * 1.15) && gd.rule[4].hp === 60000,
		'bossHp(): no DPS -> the curve; 2000 DPS -> 40 000 / 50 000 (zones 1 / 2), 69 000 (zone 3, Hard: x1.15), the legendary 60 000', JSON.stringify(gd.rule));
	A(gd.k30 === 1 && Math.abs(gd.k50 - 2.5) < 0.05 && Math.abs(gd.took - 100 * gd.k50) <= 2 && gd.pure[0] === 1 && gd.pure[1] === 2.5 && gd.pure[2] === 8,
		`exhaustion: none at 30 s, x${gd.k50} at 50 s (target 40), a 100 hit takes ${gd.took}; capped at x8`, JSON.stringify(gd));
	A(gd.down && gd.phAfter === 2 && gd.pulled >= 1, 'when it falls the portal opens on the altar and pulls in the pickups', JSON.stringify(gd));

	// ======================== 5. the portal -> zone 2
	const pt = await E(page, () => {
		const H = window.__t, C = G.ExpClassic, S = C.run, t = G.Game.st.time, h1 = G.World.zone.hash;
		H.toAltar(); H.step(40);
		return { zone: S.zone, z: G.World.zone.zone, newZone: G.World.zone.hash !== h1, zs: Math.round(S.zs - t), ph: S.ph, split: S.splits[0] != null, player: [Math.round(G.Game.player.x), Math.round(G.Game.player.y)], enemies: G.EnemyMgr.all().filter(e => !e.dead).length, plan: S.plan.zone };
	});
	A(pt.zone === 2 && pt.z === 2 && pt.newZone && pt.ph === 0 && pt.split && pt.plan === 2 && Math.abs(pt.player[0]) < 50 && Math.abs(pt.player[1]) < 50,
		'standing in the portal takes you to zone 2: a new zone and plan, the altar waiting, back at the spawn, the split recorded', JSON.stringify(pt));

	// ======================== 7a. viewers: the x block v3 (host side)
	const xs = await E(page, async () => {
		const H = window.__t, C = G.ExpClassic, S = C.run;
		C.debugZoneTime(140); H.step(20);   // (zone 2's first alpha is at 130 s)
		H.toAltar(); H.step(40);            // (charging)
		const snap = JSON.parse(JSON.stringify(G.Spectate.snap()));
		let hf = null;
		const m = { uid: 'u2', name: 'alice', connected: true, pl: G.Game.player };
		hf = G.Hooks.reduce('net.frame', { k: 'f' }, m).x;
		return { x: snap.x, hf, seed: G.World.seed, zone: S.zone, hash: G.World.zone.hash, charge: S.charge, n: S.n, ph: S.ph, specials: [...S.specials.values()].map(s => [s.e.id, s.kind]), snap };
	});
	A(xs.x && xs.x.xv === 10 && xs.x.c && xs.x.c.p === 0 && xs.x.c.q > 0 && xs.x.c.n === xs.n && Array.isArray(xs.x.c.k) && xs.x.c.k.length >= 2,
		'a live snapshot carries the x block (v4 since D4) with `c` (phase, altar charge, events fired, the special enemies)', JSON.stringify(xs.x));
	A(xs.hf && xs.hf.xv === 10 && xs.hf.c && JSON.stringify(xs.hf.c) === JSON.stringify(xs.x.c), 'a co-op host frame carries the same `c`', JSON.stringify(xs.hf));

	// ======================== 6. a full run won
	const win = await E(page, async () => {
		const H = window.__t, C = G.ExpClassic, S = C.run;
		const s0 = JSON.stringify(G.DB.save);
		H.away(); H.thin();
		const z2 = H.beatBoss(); H.through();
		const z3 = H.beatBoss(); H.through();
		const shrine = { zone: S.zone, z: G.World.zone.zone, ph: S.ph, enemies: G.EnemyMgr.all().filter(e => !e.dead).length, w: G.World.zone.w };
		const mew = H.beatBoss();
		const won = { ph: S.ph, won: S.won, splits: S.splits.map(Math.round) };
		H.step(Math.ceil(C.K.WIN_T * 30) + 10);
		await new Promise(r => setTimeout(r, 300));
		const over = document.getElementById('scr-over'), ttl = document.getElementById('over-title').innerText;
		return { z2, z3, shrine, mew, won, state: G.Game.state, overShown: !over.classList.contains('hidden'), ttl, text: over.innerText,
			splitsRows: over.querySelectorAll('.over-splits tr').length, wins: G.ExpSave.get('wins.viridian.normal'), clear: G.ExpSave.get('clear.viridian.normal'),
			sp: [1, 2, 3, 4].map(z => G.ExpSave.get('split.viridian.normal.z' + z)), baseSame: window.__t.baseDiff(s0, JSON.stringify(G.DB.save)) };
	});
	A(win.z2 && win.z2.down && win.z3 && win.z3.down && win.shrine.zone === 4 && win.shrine.z === 4 && win.shrine.ph === 0 && win.shrine.w === 44,
		"zones 2 and 3: each guardian beaten and each portal taken; zone 3's portal leads to the shrine (zone 4)", JSON.stringify({ z2: win.z2, z3: win.z3, shrine: win.shrine }));
	A(win.mew && win.mew.dex === 151 && win.mew.down && win.won.won && win.won.splits.length === 4, 'on the pedestal Mew appears; beating it wins the map (4 splits)', JSON.stringify({ mew: win.mew, won: win.won }));
	A(win.state === 'over' && win.overShown && /^EXPEDITION COMPLETE!$/.test(win.ttl) && win.splitsRows === 4 && /Viridian Forest · Normal/.test(win.text) && /Map complete!/.test(win.text) && /Splits/i.test(win.text),
		'the victory screen: "EXPEDITION COMPLETE!", Viridian Forest · Normal, Map complete!, the 4 zone splits', JSON.stringify({ ttl: win.ttl, rows: win.splitsRows, text: (win.text || '').slice(0, 300) }));
	A(win.wins === 1 && win.clear > 0 && win.sp.every(v => v > 0), 'the Expedition save keeps the win, the best clear and each zone\'s best split', JSON.stringify({ wins: win.wins, clear: win.clear, sp: win.sp }));
	A(win.baseSame && win.baseSame.same && win.baseSame.paid > 0, 'the base save is unchanged by the whole run but its Pokémonedas (D11: the run pays the base coins, counted as earned): +' + (win.baseSame && win.baseSame.paid), JSON.stringify(win.baseSame));
	const spOver = await E(page, () => {
		const out = [];
		const tw = document.createTreeWalker(document.getElementById('scr-over'), NodeFilter.SHOW_TEXT);
		let n;
		while ((n = tw.nextNode())) { const t = n.nodeValue.trim().replace(/Poké|Flabébé/g, 'Poke'); if (/[áéíóúñ¿¡]|\b(Zona|Tiempos|Santuario|Bosque|Mapa|completad)/i.test(t)) out.push(t); }   // (D13: Flabébé is its English name too)
		return out;
	});
	A(Array.isArray(spOver) && !spOver.length, 'no Spanish on the victory screen', JSON.stringify(spOver));
	// a second win: the splits show the deltas against the first
	const again = await E(page, async () => {
		document.getElementById('btn-again').click();
		await new Promise(r => setTimeout(r, 300));
		window.__t.thaw();
		await G.Flow.play('exp-classic');
		window.__t.freeze();
		const H = window.__t, S = G.ExpClassic.run;
		H.sturdy();
		for (let z = 1; z <= 3; z++) { H.beatBoss(); H.through(); }
		H.beatBoss();
		H.step(Math.ceil(G.ExpClassic.K.WIN_T * 30) + 10);
		await new Promise(r => setTimeout(r, 300));
		const rows = [...document.querySelectorAll('#scr-over .over-splits tr')].map(tr => tr.innerText.replace(/\s+/g, ' '));
		return { rows, wins: G.ExpSave.get('wins.viridian.normal'), zone: S.zone };
	});
	A(again.wins === 2 && again.rows && again.rows.length === 4 && again.rows.every(r => /[+−]\d+:\d\d$/.test(r)), 'a second win: the splits show + / − against the best', JSON.stringify(again));
	await E(page, () => { document.getElementById('btn-again').click(); });

	// ======================== 7b. a replay of a Classic run keeps `c`; a fresh page as guest / spectator / replay viewer
	const rec = await E(page, async () => {
		await new Promise(r => setTimeout(r, 300));
		window.__t.thaw();
		await G.Flow.play('exp-classic');
		window.__t.freeze();
		const H = window.__t, C = G.ExpClassic, S = C.run;
		H.sturdy();
		C.debugZoneTime(155); H.step(60);   // (zone 1's alpha at 150 s)
		H.toAltar(); H.step(Math.ceil(C.K.ALTAR_T * 30) + 6);   // the guardian wakes
		H.step(45);
		const mid = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const b = S.boss; while (!b.dead) { b.hurt(b.maxHp / 20); H.step(1); }
		H.away(); H.step(40);   // the portal open (you stand away from it)
		const open = JSON.parse(JSON.stringify(G.Spectate.snap()));
		G.Game.quit();
		await new Promise(r => setTimeout(r, 200));
		const e = G.Replay.last;
		await e.ready;
		// (D11: `c` moved to a replay frame field of its own: count its phase changes through the replay reader)
		const rd = await G.Replay.open(e.code), phs = [];
		for (let i = 0; i < rd.length; i++) { const s = rd.at(i), q = s.x && s.x.c ? s.x.c.p : null; if (q != null && q !== phs[phs.length - 1]) phs.push(q); }
		return { seed: G.World.seed, mid, open, code: e.code, cInFrames: phs.length, phs, hash: mid.x && mid.x.th, sites: C.sitesOf(G.World.zone) && C.sitesOf(G.World.zone).altar };
	});
	A(rec.mid && rec.mid.x && rec.mid.x.c && rec.mid.x.c.p === 1 && rec.mid.x.c.b && rec.open.x.c.p === 2 && rec.cInFrames >= 2, `the run's replay keeps \`c\` (D11: its own frame field; ${rec.cInFrames} phases: ${(rec.phs || []).join(' > ')})`, JSON.stringify({ mid: rec.mid && rec.mid.x, open: rec.open && rec.open.x, n: rec.cInFrames }));
	await d0.ctx.close();

	// a fresh page: as co-op guest, spectator, replay viewer
	{
		const d = await bootPage();
		const g = await E(d.page, async (rec) => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const H = window.__t, out = { loadedBefore: G.Expedition.loaded };
			// a co-op guest: a base run of its own on the host's seed, the host frame through G.Net's handler (js/net/coop.js)
			G.Flow.play('normal');
			H.freeze();
			G.World.reset(rec.seed);
			const pl = G.Game.player;
			const cb = new Proxy({}, { get: (t, k) => k === 'team' ? () => ({}) : () => {} });
			G.Coop.begin({ seed: rec.seed, host: 'alice', members: [{ uid: 'alice', name: 'alice', dex: 4 }, { uid: G.Net.uid, name: 'me', dex: 4 }] }, pl, cb);
			const frame = { k: 'f', t: 1, lv: 1, xp: 0, xn: 10, ki: 0, bo: 0, co: 0, tk: [0, 0], p: { alice: [0, 0, 0, 0, 100, 100, 0, '', 1, 78, 0, 1, 0, 0, 0] }, e: [], ev: [], ho: [], x: rec.open.x };
			H.deliver('alice', frame);
			for (let i = 0; i < 100 && !(G.Exp && G.World.zone && G.World.zone.hash === rec.open.x.th); i++) await wait(50);
			H.deliver('alice', Object.assign({}, frame, { t: 2 }));
			const C = G.ExpClassic;
			out.guest = { hash: G.World.zone && G.World.zone.hash, altar: C && C.sitesOf(G.World.zone) && C.sitesOf(G.World.zone).altar, cur: C && C.cur() && { ph: C.cur().ph, zone: C.cur().zone } };
			G.Coop.end();
			G.Game.quit();
			await wait(200);
			// a live spectator: the mid-fight snapshot through the live view
			G.MicaAccount.name = () => 'viewer';
			G.Spectate.watch = (u, h) => { h.snapshot(rec.mid, {}); };
			G.WatchUI.watchLive('host');
			for (let i = 0; i < 60 && !(G.World.zone && G.World.zone.hash === rec.mid.x.th); i++) await wait(50);
			await wait(300);
			const c = C.cur();
			out.spec = { state: G.Game.state, hash: G.World.zone && G.World.zone.hash, cur: c && { ph: c.ph, charge: c.charge, ex: c.bossEx }, hud: C.hudLine(G.WatchUI.player, G.Game.st) };
			G.WatchUI.leave();
			// a dv-1 / x v2 snapshot (no c) still loads its zone and shows no timeline
			const old = Object.assign({}, rec.mid, { dv: 1, x: Object.assign({}, rec.mid.x, { xv: 2 }) });
			delete old.x.c;
			G.Exp.viewAir(old, null, null);
			out.old = { view: C.view, ok: G.Expedition.replayOk(1) };
			// the replay viewer: seek to the guardian fight and to the open portal
			const rd = await G.Replay.open(rec.code);
			let fight = -1, portal = -1;
			for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.c && s.x.c.p === 1 && fight < 0) fight = i; if (s.x && s.x.c && s.x.c.p === 2 && portal < 0) portal = i; }
			G.WatchUI.playReplay(rd, {});
			for (let i = 0; i < 100 && !(G.World.zone && G.World.zone.hash === rec.hash); i++) { G.WatchUI.seek(rd.times[0]); await wait(50); }
			G.WatchUI.togglePlay();
			G.WatchUI.seek(rd.times[fight]); await wait(100);
			const atFight = C.cur() && C.cur().ph;
			G.WatchUI.seek(rd.times[portal]); await wait(100);
			out.replay = { fight, portal, atFight, ph: C.cur() && C.cur().ph, hash: G.World.zone && G.World.zone.hash };
			G.WatchUI.leave();
			return out;
		}, rec);
		A(g.loadedBefore === false && g.guest && g.guest.hash === rec.hash && JSON.stringify(g.guest.altar) === JSON.stringify(rec.sites) && g.guest.cur && g.guest.cur.ph === 2,
			'a co-op guest (a fresh page; a host frame through G.Net) rebuilds the same zone and altar from the seed and shows the portal open', JSON.stringify(g.guest || g));
		A(g.spec && g.spec.hash === rec.hash && g.spec.cur && g.spec.cur.ph === 1 && /ZONE 1\/3/.test(g.spec.hud || '') && /GUARDIAN/.test(g.spec.hud || ''),
			'a live spectator sees the same zone, the guardian fight and the zone line', JSON.stringify(g.spec));
		A(g.old && g.old.view === null && g.old.ok === true, 'a dv-1 / x v2 snapshot (no `c`) still plays: no timeline shown, nothing breaks', JSON.stringify(g.old));
		A(g.replay && g.replay.fight >= 0 && g.replay.portal > g.replay.fight && g.replay.atFight === 1 && g.replay.ph === 2 && g.replay.hash === rec.hash,
			'a replay viewer seeks to the guardian fight, then the open portal, on the same zone', JSON.stringify(g.replay));
		await d.ctx.close();
	}

	// ======================== 8 + 9. the phone, and the screenshots (desktop and phone)
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		const st = await startClassic(d.page);
		A(st.ok === true && st.classic && st.zone === 1, `${tag}: Classic starts`, JSON.stringify(st));
		const lay = await E(d.page, async () => {
			const H = window.__t, C = G.ExpClassic;
			H.sturdy();
			H.thaw();
			await new Promise(r => setTimeout(r, 700));
			const k = G.HUD.k, R = G.HUD.rects().map(o => ({ name: o.name, x: o.x * k, y: o.y * k, w: o.w * k, h: o.h * k }));
			H.freeze();
			return { R, W: innerWidth, Hh: innerHeight, touch: G.Touch.active, line: C.hudLine(G.Game.player, G.Game.st) };
		});
		const R = lay.R || [], ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, hits = [];
		for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (ov(R[i], R[j]) && !['minimap'].includes(R[i].name)) hits.push(R[i].name + ' x ' + R[j].name);
		const clock = R.find(o => o.name === 'clock');
		A(clock && clock.x >= 0 && clock.x + clock.w <= lay.W && !hits.length && /^ZONE 1\/3\s+·\s+FINAL SWARM IN \d+:\d\d\s+·\s+ALTAR \d+ m\s+·\s+₽ \d+$/.test(lay.line), `${tag}: the zone line ("${lay.line}") fits and nothing on the HUD overlaps`, JSON.stringify({ hits, clock, W: lay.W }));
		if (tag === 'phone') A(lay.touch, 'phone: touch controls are on');
		if (SHOTS) {
			// the altar (charging), then each timeline event of zone 1, the guardian, the portal, the shrine, the victory
			await E(d.page, () => { const H = window.__t; H.toAltar(); H.step(40); const pl = G.Game.player; pl.y += 70; G.Camera.y = pl.y - 40; });
			await shoot(d.page, `classic_altar_${tag}.png`);
			const kinds = await E(d.page, () => G.ExpClassic.run.plan.events.map(e => e.kind));
			const done = new Set();
			for (let i = 0; i < kinds.length; i++) {
				if (done.has(kinds[i])) continue;
				done.add(kinds[i]);
				await E(d.page, i => {
					const H = window.__t, C = G.ExpClassic, S = C.run, ev = S.plan.events[i];
					H.away(); H.thin(); G.Hazards.clear();
					S.n = i; C.debugZoneTime(ev.at - 0.05);
					H.step(ev.kind === 'stampede' || ev.kind === 'flock' ? 30 : ev.kind === 'rockslide' ? 18 : ev.kind === 'swarm' ? 40 : 4);
					// frame the event's enemies
					const mine = G.EnemyMgr.all().filter(e => !e.dead && (e.xk || e.xrun));
					const f = mine.length ? mine[0] : null;
					const pl = G.Game.player;
					// (for the picture: the alpha / totem / summoner / elites walk up close; the herds and the flock are left to run)
					if (['alpha', 'totem', 'summoner', 'elite'].includes(ev.kind)) mine.filter(e => e.xk).forEach((e, j) => { e.x = pl.x + 140 * Math.cos(j * 0.9 - 0.6); e.y = pl.y - 30 + 90 * Math.sin(j * 0.9 - 0.6); e.zMask = null; e.xmove = null; });
					if (f && (ev.kind === 'stampede' || ev.kind === 'flock')) { G.Camera.x = (f.x + pl.x) / 2; G.Camera.y = (f.y + pl.y) / 2; } else { G.Camera.x = pl.x; G.Camera.y = pl.y; }
				}, i);
				await shoot(d.page, `classic_event_${kinds[i]}_${tag}.png`, 350);
			}
			await E(d.page, () => { const H = window.__t, C = G.ExpClassic, S = C.run; H.thin(); G.Hazards.clear(); S.n = S.plan.events.length; C.debugZoneTime(300); H.toAltar(); H.step(Math.ceil(C.K.ALTAR_T * 30) + 50); const b = S.boss; G.Camera.x = (b.x + G.Game.player.x) / 2; G.Camera.y = (b.y + G.Game.player.y) / 2; });
			await shoot(d.page, `classic_guardian_${tag}.png`);
			await E(d.page, () => { const H = window.__t, S = G.ExpClassic.run, b = S.boss; while (!b.dead) { b.hurt(b.maxHp / 20); H.step(1); } H.away(); H.step(30); H.thin(); const [x, y] = H.altarXY(); const pl = G.Game.player; pl.x = x + 100; pl.y = y + 50; pl.zMask = null; G.Camera.x = x + 40; G.Camera.y = y; });
			await shoot(d.page, `classic_portal_${tag}.png`);
			await E(d.page, () => { const H = window.__t; H.through(); H.beatBoss(); H.through(); H.beatBoss(); H.through(); const [x, y] = H.altarXY(); const pl = G.Game.player; pl.x = x; pl.y = y + 120; pl.zMask = null; G.Camera.x = x; G.Camera.y = y - 10; });
			await shoot(d.page, `classic_shrine_${tag}.png`, 1100);
			await E(d.page, () => { const H = window.__t; const r = H.beatBoss(); H.step(Math.ceil(G.ExpClassic.K.WIN_T * 30) + 10); return r; });
			await sleep(300);
			await shoot(d.page, `classic_victory_${tag}.png`, 200);
		}
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
