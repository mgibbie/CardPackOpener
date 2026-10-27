// micasurvivor_expedition_survivalcurve_test.mjs — MicaSurvivor: Survival's own, slower levelling curve (owner 2026-10-27:
// "survival does need its own slower levelling curve"). G.ExpSurv.K.CURVE / need (micasurvivor/js/expedition/survival.js), read by
// the Expedition's curve (levelups.js need, the xp.need seam); content version 20. README "The Survival curve",
// Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md "Survival curve". FIRED: real runs are started and fed real XP (pl.gainXp, the
// game's own level-up loop over G.Player.xpNeed), and real tapes are recorded and read back.
//   1. the numbers: CURVE {DV 20, FROM 40, SCALE, POW}, G.Expedition.DV 20
//   2. Survival (dv 20): the same XP takes it to a LOWER level than Classic; each level's XP = the Expedition's x (1 + ((L - 40) /
//      SCALE)^POW); Lv 1-40 exactly as before
//   3. Classic and League are unchanged: the Expedition's curve 2 x (8 + 5.5 L + L^1.8), pinned by the formula, not by the code
//   4. base is unchanged: a Normal run's xpNeed is the base curve (Player.xpFor x the adaptive factor), with the Expedition loaded
//   5. an OLD run (dv 19: a run started by an older build, its tape) keeps the shared curve: the same XP, Classic's level; its tape
//      (header dv 19) carries the old curve's xpNext, a dv-20 tape the new one
//   node overworld/tests/micasurvivor_expedition_survivalcurve_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before" count was taken.)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const MROOT = process.env.MICASURVIVOR_ROOT ? path.resolve(process.env.MICASURVIVOR_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8758;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
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
const BEFORE = () => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dsurvcurve');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify({
			v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500, owned: { 1: { at: 1, from: 'starter' } }, shiny: {}, partner: 1, partnerShiny: false, starter: 1,
			personality: { trait: 'brave', scores: {} }, upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
			evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {} }));
	} catch (e) { /* */ }
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.closePick(true); return; }
		if (G.Game.state !== 'playing' && G.Game.state !== 'over') { const c = document.querySelector('.scr:not(.hidden) .card'); if (c) c.click(); else { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit1', key: '1', bubbles: true })); } }
	};
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { H.unblock(); G.Game.debugStep(1, dt); } };
	const wait = ms => new Promise(r => setTimeout(r, ms));
	H.menu = async () => { H.thaw(); await wait(300); if (G.UI.isOpen('scr-over')) G.UI.show('scr-menu', true); G.Flow.goMenu(); await wait(200); };
	// the Expedition's own curve, from the study's formula (NOT the code): 2 x (8 + 5.5 L + L^1.8)
	H.exp = L => Math.round(2 * (8 + 5.5 * L + Math.pow(L, 1.8)));
	/** start `mode` (dv: the run's content version, as an older build's run carries it; null = this build's), let it run 1 s, then
	 *  feed the player `xp` real XP through the game's own level-up loop -> what the run shows */
	H.run = async (mode, dv, xp) => {
		const plan0 = G.Modes.plan;
		if (dv != null) G.Modes.plan = m => Object.assign(plan0(m), { dv });
		try { await G.Flow.play(mode); } finally { G.Modes.plan = plan0; }
		H.freeze();
		const pl = G.Game.player;
		pl.hurt = function () {}; pl.invuln = 1e9;
		H.step(30);
		pl.level = 1; pl.xp = 0; pl.xpNext = G.Player.xpNeed(1);
		const ups = pl.gainXp(xp / (pl.xpMul || 1));
		const needs = {}; for (const L of [1, 10, 30, 40, 41, 60, 100, 150, 200, 300]) needs[L] = G.Player.xpNeed(L);
		return { mode: G.Modes.run.mode, dv: G.Modes.dv, on: !!(G.ExpSurv && G.ExpSurv.curveOn()), level: pl.level, ups, xpNext: pl.xpNext, needs };
	};
	/** play on (the recorder samples), quit -> the tape's header dv and its last frame's [level, xp, xpNext] */
	H.tape = async () => {
		H.step(90);
		const lv = G.Game.player.level;
		G.Game.quit();
		await wait(200);
		const e = G.Replay.last;
		if (!e) return { error: 'no tape' };
		await e.ready;
		const rd = await G.Replay.open(e.code);
		if (!rd) return { error: 'tape does not open' };
		const s = rd.at(rd.length - 1);
		const dv = rd.h ? rd.h.dv : undefined;
		return { dv, lv: s && s.lv, level: lv, ok: G.Expedition.replayOk(dv) };
	};
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	const bctx = await browser.createBrowserContext();
	const page = await bctx.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|404|409|429)/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
	if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-menu'), 15000), 'boots to the menu (a guest)');
	const E = async (fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };

	// ======================== 1. the numbers
	const n = await E(async () => {
		G.Audio.sfx = () => {}; G.Audio.music = () => {};
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { error: String(ok) };
		await G.ExpSave.open();
		return { DV: G.Expedition.DV, curve: G.ExpSurv.K.CURVE && Object.assign({}, G.ExpSurv.K.CURVE), k40: G.ExpSurv.curveK && G.ExpSurv.curveK(40), k100: G.ExpSurv.curveK && G.ExpSurv.curveK(100) };
	});
	const CV = n.curve || {};
	A(n.DV === 20 && CV.DV === 20 && CV.FROM === 40 && CV.SCALE > 0 && CV.POW > 0 && n.k40 === 1 && n.k100 > 1.5,
		`the numbers: G.Expedition.DV 20; Survival's curve from content version 20, slower above Lv 40 (x${n.k100 && n.k100.toFixed(2)} at Lv 100)`, JSON.stringify(n));
	const kOf = L => (L > CV.FROM ? 1 + Math.pow((L - CV.FROM) / CV.SCALE, CV.POW) : 1);

	// total XP of Lv 1 -> 150 on the Expedition's curve (study formula)
	const exp = L => Math.round(2 * (8 + 5.5 * L + Math.pow(L, 1.8)));
	let XP = 0; for (let L = 1; L < 150; L++) XP += exp(L);
	XP += 1;

	// ======================== 2. Survival (dv 20)
	const sv = await E(async xp => { const H = window.__t, r = await H.run('exp-survival', null, xp); r.tape = await H.tape(); await H.menu(); return r; }, XP);
	const svNeedsOk = sv.needs && Object.entries(sv.needs).every(([L, v]) => v === Math.round(exp(+L) * kOf(+L)));
	A(sv.mode === 'exp-survival' && sv.dv === 20 && sv.on === true, 'a new Survival run is content version 20 and levels on the Survival curve', JSON.stringify(sv));
	A(svNeedsOk && sv.needs[10] === exp(10) && sv.needs[40] === exp(40) && sv.needs[41] > exp(41) && sv.needs[200] > exp(200) * 2,
		`Survival's XP a level = the Expedition's x (1 + ((L - 40) / ${CV.SCALE})^${CV.POW}): Lv 1-40 as before (Lv 30: ${sv.needs && sv.needs[30]}), Lv 100 ${sv.needs && sv.needs[100]} (Classic ${exp(100)}), Lv 200 ${sv.needs && sv.needs[200]} (${exp(200)})`, JSON.stringify(sv.needs));
	A(sv.level > 40 && sv.level < 150 && sv.xpNext === Math.round(exp(sv.level) * kOf(sv.level)),
		`FIRED: the XP of Lv 150 on Classic's curve (${XP}) takes a Survival run to Lv ${sv.level} (the game's own level-up loop), its next level ${sv.xpNext} XP`, JSON.stringify(sv));

	// ======================== 3. Classic and League unchanged
	const cl = await E(async xp => { const H = window.__t, r = await H.run('exp-classic', null, xp); G.Game.quit(); await H.menu(); return r; }, XP);
	const clNeedsOk = cl.needs && Object.entries(cl.needs).every(([L, v]) => v === exp(+L));
	A(cl.mode === 'exp-classic' && cl.dv === 20 && cl.on === false && clNeedsOk && cl.level === 150 && cl.xpNext === exp(150),
		`Classic is unchanged: the Expedition's curve 2 x (8 + 5.5 L + L^1.8) at every level, the same XP -> Lv ${cl.level} (150)`, JSON.stringify(cl));
	const lg = await E(async () => { const pl0 = G.Modes.plan; let r; try { G.Modes.begin(Object.assign(pl0('exp-classic'), { mode: 'exp-league' })); r = { on: G.ExpSurv.curveOn(), n100: G.ExpLevel.need(100) }; } finally { G.Modes.begin({ mode: 'normal' }); } return r; });
	A(lg && lg.on === false && lg.n100 === exp(100), 'League (mode exp-league) is not on the Survival curve', JSON.stringify(lg));

	// ======================== 4. base unchanged
	const bs = await E(async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
		G.Flow.play('normal'); await wait(100);
		H.freeze();
		const out = { mode: G.Modes.run.mode, on: G.ExpSurv.curveOn(), loaded: G.Expedition.loaded, needs: {}, base: {} };
		for (const L of [1, 10, 41, 100, 200]) { out.needs[L] = G.Player.xpNeed(L); out.base[L] = G.Player.xpFor(L) * (G.Adaptive ? G.Adaptive.xpK() : 1); }
		G.Game.quit(); await H.menu();
		return out;
	});
	A(bs.mode === 'normal' && bs.on === false && bs.loaded === true && bs.needs && Object.keys(bs.base).every(L => bs.needs[L] === bs.base[L]),
		'a base Normal run (the Expedition loaded) keeps the base curve: xpNeed = Player.xpFor x the adaptive factor', JSON.stringify(bs));

	// ======================== 5. an old run / tape (dv 19) keeps the shared curve
	const od = await E(async xp => { const H = window.__t, r = await H.run('exp-survival', 19, xp); r.tape = await H.tape(); await H.menu(); return r; }, XP);
	const odNeedsOk = od.needs && Object.entries(od.needs).every(([L, v]) => v === exp(+L));
	A(od.mode === 'exp-survival' && od.dv === 19 && od.on === false && odNeedsOk && od.level === 150,
		`a dv-19 Survival run (an older build's) keeps the shared curve: the same XP -> Lv ${od.level} (Classic's), not Lv ${sv.level}`, JSON.stringify(od));
	const ot = od.tape || {}, nt = sv.tape || {};
	A(ot.dv === 19 && ot.ok === true && ot.lv && ot.lv[0] === ot.level && ot.lv[2] === exp(ot.level),
		`its tape (header dv 19) replays the old curve: Lv ${ot.lv && ot.lv[0]}, ${ot.lv && ot.lv[2]} XP to the next (the shared curve's)`, JSON.stringify(ot));
	A(nt.dv === 20 && nt.ok === true && nt.lv && nt.lv[0] === nt.level && nt.lv[2] === Math.round(exp(nt.level) * kOf(nt.level)) && nt.lv[2] !== exp(nt.level),
		`a dv-20 Survival tape carries the Survival curve: Lv ${nt.lv && nt.lv[0]}, ${nt.lv && nt.lv[2]} XP to the next (Classic's: ${nt.level ? exp(nt.level) : '?'})`, JSON.stringify(nt));
	await bctx.close();
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
