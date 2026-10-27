// micasurvivor_expedition_balance_test.mjs — MicaSurvivor DLC D21: the balance numbers after "every move fires" (D16), pinned and
// FIRED. Measured with tools/micasurvivor/dps_sim.mjs (the DPS on a dummy ring, and --pace: the invulnerable bot's Survival and
// Classic runs); README "DLC D21". Owner decision #10: total DPS ~1.6x the one-active-move game's.
//   1. the numbers: G.Combat.AF (base x0.85, was x0.8; Expedition x1.1), the Expedition's KO pay (1 / 150 a KO, was 1 / 40),
//      Survival's pacing (G.ExpSurv.K.PACE: half the spawns, x1.8 HP and XP)
//   2. the pay: the pacing bot's Normal clear (~8,500 KOs, ~20:20) pays ~1,270-1,365 again (D11's), not ~1,740; a 45-min Survival run
//      (~10,000 KOs) pays about what a one-slot run did (~2,100), not ~1.5x
//   3. FIRE (the browser): a Survival foe has x1.8 HP and XP (Classic's don't change); Survival's trickle spawns half as many; a base
//      run and an Expedition run carry their damage factors
//   node overworld/tests/micasurvivor_expedition_balance_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites.)
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
const PORT = 8875;
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
		localStorage.setItem('micasurvivor_dev', 'dbal21');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify({
			v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500, owned: { 1: { at: 1, from: 'starter' } }, shiny: {}, partner: 1, partnerShiny: false, starter: 1,
			personality: { trait: 'brave', scores: {} }, upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
			evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {} }));
	} catch (e) { /* */ }
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = function () {}; pl.gainXp = () => 0; pl.invuln = 1e9; return pl; };
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.closePick(true); return; }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
	};
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { H.unblock(); G.Game.debugStep(1, dt); } };
	H.cull = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.dead) { e.dead = true; e.fade = 0; } };
	/** the trickle's spawns over secs (the field culled every second, so the cap never binds; the timeline's events off) */
	H.trickle = secs => {
		const R = G.ExpClassic.run, add = G.EnemyMgr.add;
		let n = 0;
		G.EnemyMgr.add = function (e) { if (e && !e.remote && !e.xk && !e.boss) n++; return add.call(this, e); };
		R.plan.events = []; if (G.ExpSurv && G.ExpSurv.run) { G.ExpSurv.run.segEv = []; }
		for (let i = 0; i < Math.round(secs * 15); i++) { H.step(1, 1 / 15); if (i % 15 === 0) H.cull(); }
		G.EnemyMgr.add = add;
		return n;
	};
};
const CLEAR = { kills: 8433, time: 1220, zone: 4, bosses: 4, won: true, catches: 3 };   // (the pacing bot's Normal clear, all-fire: README "DLC D21")
const SURV = { kills: 10000, time: 2740, zone: 3, bosses: 9, legends: 3, won: false, catches: 0, surv: true };   // (a 45-min Survival run with D21's pacing)

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

	// ======================== 1-2. the numbers and the pay
	const n = await E(async (CLEAR, SURV) => {
		G.Audio.sfx = () => {}; G.Audio.music = () => {};
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { error: String(ok) };
		await G.ExpSave.open();
		const M = G.ExpMeta, P = M.K.PAY;
		const old = (p, ko) => M.coinsOf(P.BASE + p.kills * ko + P.ZONE * (p.zone - 1) + P.BOSS * p.bosses + (p.won ? P.WIN : 0) + P.LEGEND * (p.legends || 0) + P.SURV_MIN * (p.surv ? p.time / 60 : 0));
		return { af: G.Combat.AF, ko: P.KO, pace: G.ExpSurv.K.PACE, clear: M.payOf(CLEAR, 'normal').pay, clearOld: old(CLEAR, 1 / 40), surv: M.payOf(SURV, 'normal').pay, survD16: old({ ...SURV, kills: 14000 }, 1 / 40) };
	}, CLEAR, SURV);
	A(n.af && n.af.DMG === 0.85 && n.af.DMG_EXP === 1.1 && n.ko === 1 / 150 && n.pace && n.pace.rate === 0.5 && n.pace.hp === 1.8 && n.pace.xp === 1.8,
		'the tuned numbers: all-fire x0.85 (base) / x1.1 (Expedition), 1 / 150 a KO, Survival\'s pacing (spawns x0.5, HP and XP x1.8)', JSON.stringify(n));
	A(n.clear >= 1270 && n.clear <= 1400 && n.clearOld > 1550, `a Normal clear (the pacing bot's: ${CLEAR.kills} KOs, ${CLEAR.time} s) pays ${n.clear} (D11: ~1,270-1,365), not ${n.clearOld} as at 1 / 40`, JSON.stringify(n));
	A(n.surv >= 2000 && n.surv <= 2400 && n.surv < n.survD16 * 0.8, `a 45-min Survival run (${SURV.kills} KOs) pays ${n.surv}, about a one-slot run's (~2,100); D16's 14,000 KOs at 1 / 40 paid ${n.survD16}`, JSON.stringify(n));

	// ======================== 3. FIRE: Survival's pacing on real spawns
	const s = await E(async () => {
		const H = window.__t, C = G.ExpClassic, S = G.ExpSurv, P = S.K.PACE;
		await G.Flow.play('exp-survival');
		H.freeze(); H.sturdy(); H.step(30);
		const pl = G.Game.player, mk = () => { const e = C.spawnFoe(16, pl.x + 200, pl.y, {}); const o = { hp: e.maxHp, xp: e.xp }; e.dead = true; e.fade = 0; return o; };
		const a = mk();
		const keep = Object.assign({}, P);
		Object.assign(P, { rate: 1, hp: 1, xp: 1 });
		const b = mk();
		// (the trickle grows with the run's time: ABBA windows of 30 s, so the trend cancels)
		const set = on => Object.assign(P, on ? keep : { rate: 1, hp: 1, xp: 1 });
		let n1 = 0, n05 = 0;
		for (const on of [true, false, false, true]) { set(on); const c = H.trickle(30); if (on) n05 += c; else n1 += c; }
		Object.assign(P, keep);
		G.Game.quit();
		return { a, b, n1, n05, mode: G.Modes.run && G.Modes.run.mode };
	});
	A(s.a && s.b && Math.abs(s.a.hp / s.b.hp - 1.8) < 0.03 && Math.abs(s.a.xp / s.b.xp - 1.8) < 0.1, `a Survival foe (a real spawn) has x1.8 HP and XP: ${s.a && s.a.hp} vs ${s.b && s.b.hp} HP, ${s.a && s.a.xp} vs ${s.b && s.b.xp} XP`, JSON.stringify(s));
	A(s.n1 > 40 && s.n05 / s.n1 > 0.35 && s.n05 / s.n1 < 0.65, `Survival's trickle spawns about half as many: ${s.n05} vs ${s.n1} in 60 s each`, JSON.stringify(s));
	const c = await E(async () => {
		const H = window.__t, C = G.ExpClassic, P = G.ExpSurv.K.PACE, wait = ms => new Promise(r => setTimeout(r, ms));
		H.thaw(); await wait(300); if (G.UI.isOpen('scr-over')) G.UI.show('scr-menu', true); G.Flow.goMenu(); await wait(200);
		await G.Flow.play('exp-classic');
		H.freeze(); H.sturdy(); H.step(30);
		const pl = G.Game.player, k = pl.afDmg, mk = () => { const e = C.spawnFoe(16, pl.x + 200, pl.y, {}); const o = { hp: e.maxHp, xp: e.xp }; e.dead = true; e.fade = 0; return o; };
		const a = mk(); const keep = Object.assign({}, P); Object.assign(P, { rate: 1, hp: 1, xp: 1 }); const b = mk(); Object.assign(P, keep);
		G.Game.quit(); H.thaw(); await wait(300); if (G.UI.isOpen('scr-over')) G.UI.show('scr-menu', true); G.Flow.goMenu(); await wait(200);
		G.Flow.play('normal'); await wait(100);
		const kb = G.Game.player && G.Game.player.afDmg, af = G.Game.player && G.Game.player.af;
		G.Game.quit();
		return { a, b, k, kb, af };
	});
	A(c.a && c.b && c.a.hp === c.b.hp && c.a.xp === c.b.xp, 'Classic\'s foes are not paced (Survival only)', JSON.stringify(c));
	A(c.k === 1.1 && c.kb === 0.85 && c.af === true, 'an Expedition run fires every move at x1.1, a base run at x0.85 (the factors the runs carry)', JSON.stringify(c));
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
