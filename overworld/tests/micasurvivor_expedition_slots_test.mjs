// micasurvivor_expedition_slots_test.mjs — MicaSurvivor DLC D15: the slot machine (owner decision #7: "yes, PLAY MONEY ONLY":
// in-run ₽, never real money) and Survival's respawn of used interactables (study 2.7). micasurvivor/js/expedition/economy.js
// (K.SLOT_*, spin / reels / payout, K.RESPAWN / respawn, the `o` block's `y`). Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.7 and the
// D15 update. A static server, headless Chrome, a fixed guest profile. One browser at a time (and it always exits).
//   1. pure: the reels' table and what each result pays; the odds (a bad roll ~5 %, the ₽ returns well under the stakes: a
//      play-money sink); one machine a zone on every map, placed after every D7 interactable (their places and indices kept)
//   2. a Classic run, through the real stand-in: a spin costs 10 + 5 x zone of the RUN's ₽ (the base save's Pokémonedas never
//      move); a bad roll springs a Voltorb ambush; a pair pays 2 spins back; three Poké Balls open an item pick; three Nuggets
//      the jackpot; three Voltorb are Electrodes and break the machine; too poor: "You need N ₽ more"; step away and back to
//      spin again; the zone map's legend; the `o` block's `y` and a fresh viewer page's reels
//   3. Survival: a used rock comes back after 2:00, a Poké Ball after 3:00, the broken slot machine after 3:00, an Unown altar
//      after 4:00 (not a second sooner); a viewer sees it fresh again; Classic never respawns
//   4. screenshots (SHOTS=<dir>): the machine, a spin, an ambush
//   node overworld/tests/micasurvivor_expedition_slots_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D15" count was taken.)
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
const PORT = 8873;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 777,
	owned: { 4: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 25, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {},
};
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dslots15');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; pl.gainXp = () => 0; return pl; };
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i + 1; } return n; };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.dead) { e.dead = true; e.fade = 0; } };
	H.calm = () => { const C = G.ExpClassic.run, S = G.ExpSurv && G.ExpSurv.run; if (C) C.acc = -1e6; if (S) { S.seg = Math.floor(G.Game.st.time / 300); S.segEv = []; S.segN = 0; S.nextMig = Math.max(S.nextMig, G.Game.st.time + 9999); } };
	H.obj = kind => { const lay = G.ExpEco.layoutOf(G.World.zone); return lay.objs.find(o => o.kind === kind); };
	H.objs = kind => G.ExpEco.layoutOf(G.World.zone).objs.filter(o => o.kind === kind);
	H.go = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; G.World.collide(pl); G.Camera.x = pl.x; G.Camera.y = pl.y; };
	H.away = () => { const pl = G.Game.player; H.go(0, 0); };
	H.zt = () => G.Game.st.time - G.ExpClassic.run.zs;
	/** walk onto object o and stand until fn() (or n steps) */
	H.standOn = (o, n = 60) => { H.go(o.x, o.y); return H.step(n); };
	/** make the next spin of machine i roll result `want` ('bad' | 'boom' | 'pair' | 'triple:<sym>' | 'none'): advance the run's draw counter */
	H.rig = (i, want) => {
		const E = G.ExpEco, S = E.run;
		for (let k = 0; k < 200000; k++) {
			const r = E.peekSpin(i), p = E.payout(r), tag = p.kind === 'triple' ? 'triple:' + E.K.SLOT_SYM[p.sym] : p.kind;
			if (tag === want) return r;
			S.draws++;
		}
		return null;
	};
};

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
	const start = (page, mode) => E(page, async mode => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		if (G.Game.state !== 'ui') { if (G.Game.state !== 'over') G.Game.quit(); await wait(300); G.Flow.goMenu(); await wait(200); }
		const ok = await G.Flow.play(mode);
		window.__t.freeze(); window.__t.sturdy(); window.__t.thin(); window.__t.calm();
		return { ok, mode: G.Modes.run.mode, dv: G.Modes.run.dv, zone: G.World.zone && G.World.zone.zone };
	}, mode);

	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const ld = await E(page, async () => { const ok = await G.Expedition.load(); await G.ExpSave.open(); return { ok, dv: G.Expedition.DV, cdv: G.Exp.dv, xv: G.Exp.XV, slots: typeof G.ExpEco.payout }; });
	A(ld.ok === true && ld.dv === 17 && ld.cdv === 17 && ld.xv === 10 && ld.slots === 'function', 'the Expedition code loads: content version 17 (D18), the x block still v10', JSON.stringify(ld));

	// ======================== 1. pure
	const pu = await E(page, () => {
		const X = G.ExpEco, K = X.K, P = r => X.payout(r).kind + ':' + X.payout(r).sym;
		const cases = { bad: P([6, 6, 0]), boom: P([6, 6, 6]), great: P([2, 2, 2]), pair: P([1, 1, 3]), pair2: P([1, 6, 1]), none: P([0, 1, 2]), one: P([6, 0, 1]) };
		const rng = G.DLC.rng(12345), n = 60000, tally = { bad: 0, boom: 0, triple: 0, pair: 0, none: 0 }, sym = {};
		let back = 0;
		for (let k = 0; k < n; k++) { const p = X.payout(X.reels(rng)); tally[p.kind]++; if (p.kind === 'pair') back += K.SLOT_PAIR; if (p.kind === 'triple') { const s = K.SLOT_SYM[p.sym]; sym[s] = (sym[s] || 0) + 1; if (s === 'nugget') back += K.SLOT_JACKPOT; } }
		const f = {}; for (const k in tally) f[k] = +(tally[k] / n).toFixed(4);
		const out = { cases, f, sym, ev: +(back / n).toFixed(3), cost: [1, 2, 3].map(X.slotCost), w: K.SLOT_W, s: K.SLOT_SYM };
		// one machine a zone on each map, last in the layout (D7's interactables keep their places)
		out.lay = [];
		for (const map of ['viridian', 'mtmoon', 'cerulean']) for (const seed of [1234, 777]) for (let z = 1; z <= 3; z++) {
			const zn = G.ExpTerrain.generate({ seed, map, zone: z }), lay = X.layoutOf(zn), sl = lay.objs.filter(o => o.kind === 'slots');
			out.lay.push([map, z, sl.length, sl.length ? sl[0].i === lay.objs.length - 1 : false, lay.objs.length]);
		}
		return out;
	});
	A(JSON.stringify(pu.cases) === '{"bad":"bad:6","boom":"boom:6","great":"triple:2","pair":"pair:1","pair2":"pair:1","none":"none:-1","one":"none:-1"}', 'what a spin pays: two Voltorb a bad roll, three a broken machine, three of a kind a prize, two of a kind a pair, else nothing', JSON.stringify(pu.cases));
	A(pu.f.bad > 0.02 && pu.f.bad < 0.08 && pu.f.boom < 0.003 && pu.f.triple > 0.01 && pu.f.pair > 0.3 && pu.ev < 1 && JSON.stringify(pu.cost) === '[15,20,25]',
		`the odds (60,000 seeded spins): bad roll ${(pu.f.bad * 100).toFixed(1)} %, a prize ${(pu.f.triple * 100).toFixed(1)} %, a pair ${(pu.f.pair * 100).toFixed(1)} %; the ₽ back is ${pu.ev} of a stake (a play-money sink); a spin costs 15 / 20 / 25 ₽ in zones 1-3`, JSON.stringify(pu));
	A(pu.lay.every(l => l[2] === 1 && l[3] && l[4] === 43), 'one slot machine a zone on every map, placed after every D7 interactable (the last of 43)', JSON.stringify(pu.lay));

	// ======================== 2. a Classic run: spins through the stand-in
	const st = await start(page, 'exp-classic');
	A(st.ok && st.mode === 'exp-classic' && st.dv === 17 && st.zone === 1, 'Classic starts (zone 1, dv 14)', JSON.stringify(st));
	const s1 = await E(page, () => {
		const H = window.__t, X = G.ExpEco, pl = G.Game.player, o = H.obj('slots'), cost = X.slotCost(1), base0 = G.DB.save.coins;
		pl.coins = 500;
		const out = { i: o.i, cost };
		// a bad roll: a Voltorb ambush (3 + 1 x zone)
		H.rig(o.i, 'bad');
		const n0 = G.EnemyMgr.all().filter(e => !e.dead && e.dex === 100).length;
		H.standOn(o, 40);
		out.bad = { coins: pl.coins, spins: X.run.log.spins, volt: G.EnemyMgr.all().filter(e => !e.dead && e.dex === 100).length - n0, banner: (G.Spawner.banner() || {}).text, y: X.oBlock().y };
		H.thin();
		// standing still: no second spin
		H.step(60);
		out.still = X.run.log.spins;
		// a pair: two spins back
		H.away(); H.step(3); H.rig(o.i, 'pair'); const c1 = pl.coins; H.standOn(o, 40);
		out.pair = { d: pl.coins - c1, banner: (G.Spawner.banner() || {}).text };
		// three Nuggets: the jackpot (15 spins)
		H.away(); H.step(3); H.rig(o.i, 'triple:nugget'); const c2 = pl.coins; H.standOn(o, 40);
		out.jack = { d: pl.coins - c2, banner: (G.Spawner.banner() || {}).text };
		// three Poké Balls: an item pick (1 of 3)
		H.away(); H.step(3); H.rig(o.i, 'triple:poke'); H.standOn(o, 30);
		out.pick = X.pick ? { kind: X.pick.kind, n: X.pick.ids.length, title: X.pick.title } : null;
		const bag0 = Object.values(pl.xi || {}).reduce((a, b) => a + b, 0);
		if (X.pick) { X.pick.at = 0; X.choose(0); }
		out.took = Object.values(pl.xi || {}).reduce((a, b) => a + b, 0) - bag0;
		// nothing
		H.away(); H.step(3); H.rig(o.i, 'none'); const c3 = pl.coins; H.standOn(o, 40);
		out.none = { d: pl.coins - c3, banner: (G.Spawner.banner() || {}).text };
		// too poor
		H.away(); H.step(3); pl.coins = 3; const sp0 = X.run.log.spins; H.standOn(o, 40);
		out.poor = { coins: pl.coins, spins: X.run.log.spins - sp0, banner: (G.Spawner.banner() || {}).text };
		// three Voltorb: Electrodes, the machine breaks
		H.away(); H.step(3); pl.coins = 500; H.rig(o.i, 'boom'); const e0 = G.EnemyMgr.all().filter(e => !e.dead && e.dex === 101).length; H.standOn(o, 40);
		out.boom = { st: X.zone.st[o.i], elec: G.EnemyMgr.all().filter(e => !e.dead && e.dex === 101).length - e0, banner: (G.Spawner.banner() || {}).text };
		H.thin();
		H.away(); H.step(3); const sp1 = X.run.log.spins; H.standOn(o, 40);
		out.broken = X.run.log.spins - sp1;
		out.base = [base0, G.DB.save.coins];
		out.log = Object.assign({}, X.run.log);
		return out;
	});
	A(s1.bad && s1.bad.coins === 500 - s1.cost && s1.bad.spins === 1 && s1.bad.volt === 4 && /Bad roll! Voltorb!/.test(s1.bad.banner || '') && Array.isArray(s1.bad.y) && s1.bad.y[0] === s1.i && s1.bad.y[1] === 1,
		'standing at the machine spins it: 15 ₽ of the run\'s; a bad roll (two Voltorb) springs 4 Voltorb (3 + zone); the `o` block\'s `y` carries the spin', JSON.stringify(s1.bad));
	A(s1.still === 1, 'standing still doesn\'t spin again (step away and back)', s1.still);
	A(s1.pair.d === -s1.cost + 2 * s1.cost && /A pair: \+30/.test(s1.pair.banner || ''), 'a pair: two spins back (+30 ₽ for a 15 ₽ spin)', JSON.stringify(s1.pair));
	A(s1.jack.d === -s1.cost + 15 * s1.cost && /Jackpot! \+225/.test(s1.jack.banner || ''), 'three Nuggets: the jackpot, 15 spins (+225 ₽)', JSON.stringify(s1.jack));
	A(s1.pick && s1.pick.kind === 'ball' && s1.pick.n === 3 && s1.pick.title === 'Tragaperras' && s1.took === 1, 'three Poké Balls: an item pick (1 of 3), the item taken', JSON.stringify({ pick: s1.pick, took: s1.took }));
	A(s1.none.d === -s1.cost && /No win/.test(s1.none.banner || ''), 'no match: the stake is gone ("No win")', JSON.stringify(s1.none));
	A(s1.poor.coins === 3 && s1.poor.spins === 0 && /You need 12 ₽ more/.test(s1.poor.banner || ''), 'too poor: "You need 12 ₽ more" and no spin', JSON.stringify(s1.poor));
	A(s1.boom.st === 1 && s1.boom.elec === 6 && /Three Voltorb! The machine blows up/.test(s1.boom.banner || '') && s1.broken === 0, 'three Voltorb: 6 Electrode (4 + 2 x zone) and the machine breaks (no more spins)', JSON.stringify({ boom: s1.boom, broken: s1.broken }));
	A(s1.base[0] === s1.base[1], 'PLAY MONEY ONLY: every spin is the run\'s ₽; the base save\'s Pokémonedas never moved (' + s1.base[0] + ')', JSON.stringify(s1.base));
	await shoot(page, 'slots-machine.png');
	// the zone map's legend, the tip, a fresh viewer page's reels
	const mp = await E(page, () => { const X = G.ExpEco; X.openMap(); const rows = X.mapInfo && X.mapInfo.rows; const legend = (document.getElementById('xmap-legend') || {}).innerText; X.closeMap(); return { rows, legend, tips: X.tips, o: X.oBlock(), seed: G.World.seed, x: G.Exp.xblock() }; });
	A(mp.rows && mp.rows.includes('slots') && /Slot machine/.test(mp.legend || '') && mp.tips.includes('slots'), 'the zone map\'s legend lists the slot machine; its one-time tip was shown', JSON.stringify({ rows: mp.rows, tips: mp.tips }));
	const d1 = await bootPage();
	const vw = await E(d1.page, async (o, seed, x) => {
		await G.Expedition.load();
		G.World.reset(seed); G.Exp.applyX(seed, x);
		G.ExpEco.applyO(o);
		const lay = G.ExpEco.layoutOf(G.World.zone), sl = lay.objs.find(q => q.kind === 'slots');
		return { s: G.ExpEco.slotOf(sl.i), st: G.ExpEco.cur().st[sl.i] };
	}, mp.o, mp.seed, mp.x);
	A(vw.s && vw.s.n === 6 && vw.s.r.length === 3 && vw.s.win === 2 && vw.st === 1, 'a fresh viewer page: the machine\'s last spin (its reels, 6 spins, the ambush) and its broken state from the `o` block', JSON.stringify(vw));
	await d1.ctx.close();
	// Classic never respawns
	const cl = await E(page, () => { const H = window.__t, X = G.ExpEco, o = H.obj('rock'); H.standOn(o, 5); const u = X.zone.st[o.i]; G.Game.debugTime(G.Game.st.time + 400); H.calm(); H.away(); H.step(3); return { u, after: X.zone.st[o.i], resp: X.run.log.respawns }; });
	A(cl.u === 1 && cl.after === 1 && cl.resp === 0, 'Classic: a used gold rock stays used (no respawns outside Survival)', JSON.stringify(cl));

	// ======================== 3. Survival's respawns
	const sv = await start(page, 'exp-survival');
	A(sv.ok && sv.mode === 'exp-survival', 'Survival starts', JSON.stringify(sv));
	const rs = await E(page, () => {
		const H = window.__t, X = G.ExpEco, pl = G.Game.player, out = {};
		pl.coins = 999;
		const rock = H.obj('rock'), ball = H.obj('ball'), slot = H.obj('slots'), un = H.obj('unown1');
		H.standOn(rock, 4); out.rock0 = X.zone.st[rock.i];
		H.away(); H.step(2); H.standOn(ball, 30); if (X.pick) X.closePick(); out.ball0 = X.zone.st[ball.i];
		H.away(); H.step(2); H.rig(slot.i, 'boom'); H.standOn(slot, 40); out.slot0 = X.zone.st[slot.i];
		H.thin();
		// the Unown altar: charge it full (8 s), take the blessing
		H.go(un.x, un.y); H.step(30 * 9); if (X.pick) X.closePick(); out.un0 = X.zone.st[un.i];
		H.away();
		const t0 = H.zt(), at = k => { G.Game.debugTime(G.ExpClassic.run.zs + t0 + k); H.calm(); H.thin(); H.step(2); };
		const used = { rock: X.zone.usedAt[rock.i], ball: X.zone.usedAt[ball.i], slot: X.zone.usedAt[slot.i], un: X.zone.usedAt[un.i] };
		out.used = used;
		const st = () => [X.zone.st[rock.i], X.zone.st[ball.i], X.zone.st[slot.i], X.zone.st[un.i]];
		// (each is due its time after its own use: the first use is the rock's, so the clock runs from it)
		const due = k => Math.ceil(used.rock + k - t0);
		at(due(119)); out.t119 = st();
		at(due(121)); out.t121 = st();
		out.o121 = X.oBlock().s.filter((v, i) => i % 3 === 0);
		at(Math.ceil(used.slot + 181 - t0)); out.t181 = st();
		at(Math.ceil(used.un + 239 - t0)); out.t239 = st();
		at(Math.ceil(used.un + 241 - t0)); out.t241 = st();
		out.resp = X.run.log.respawns; out.idx = { rock: rock.i, ball: ball.i, slot: slot.i, un: un.i };
		// a respawned rock pays again
		const c0 = pl.coins; H.standOn(rock, 4); out.again = { st: X.zone.st[rock.i], d: pl.coins - c0 };
		return out;
	});
	A(rs.rock0 === 1 && rs.ball0 === 1 && rs.slot0 === 1 && rs.un0 === 1, 'Survival: a gold rock, a Poké Ball, the slot machine (three Voltorb) and an Unown altar used', JSON.stringify(rs));
	A(JSON.stringify(rs.t119) === '[1,1,1,1]' && rs.t121[0] === 0 && rs.t121[1] === 1 && !rs.o121.includes(rs.idx.rock), 'the rock comes back after 2:00 (not at 1:59), fresh in the `o` block too; the ball not yet', JSON.stringify(rs));
	A(rs.t181[1] === 0 && rs.t181[2] === 0 && rs.t181[3] === 1 && JSON.stringify(rs.t239.slice(3)) === '[1]' && rs.t241[3] === 0 && rs.resp === 4, 'the Poké Ball and the slot machine after 3:00, the Unown altar after 4:00 (not at 3:59)', JSON.stringify(rs));
	A(rs.again.st === 1 && rs.again.d > 0, 'a respawned rock pays its ₽ again', JSON.stringify(rs.again));
	const end = await E(page, async () => { window.__t.thaw(); G.Game.quit(); await new Promise(r => setTimeout(r, 300)); return { spins: G.ExpSave.get('eco.spins'), resp: G.ExpSave.get('eco.respawns'), amb: G.ExpSave.get('eco.ambush') }; });
	A(end.spins >= 7 && end.resp >= 4 && end.amb >= 2, 'the Expedition save counts the spins, ambushes and respawns (eco.spins / eco.ambush / eco.respawns)', JSON.stringify(end));
	await d0.ctx.close();
} catch (e) {
	fail++;
	console.log('FAIL: the test crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
const errs = errors.filter(e => !/favicon|ResizeObserver/.test(e));
A(!errs.length, 'no page errors', errs.slice(0, 5).join('\n'));
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
process.exit(fail ? 1 : 0);
