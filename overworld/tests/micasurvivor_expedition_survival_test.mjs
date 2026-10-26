// micasurvivor_expedition_survival_test.mjs — MicaSurvivor DLC D11: Expedition · Survival. micasurvivor/js/expedition/survival.js
// (G.ExpSurv), its seams in classic.js (the engine: S.surv, the phase, makeBoss, fireEvent), core.js (run.start / run.tick /
// combat.out / run.end, the x block v10 `s` / `v`), meta.js (Survival's tasks and achievements, the run's pay in Pokémonedas),
// tiers.js (the Survival board view), modes-ui.js (the Survival card) and server/mp.mjs (run-score / run-leaderboard
// 'exp-survival'). Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 1 ("Run: Survival"), 2.8, 2.12, 5.3 and the D11 row.
// The REAL server handler (bundled like the dev server, over sqlite) behind a static server, headless Chrome. One browser at a
// time (and it always exits).
//   1. the menu: Survival is playable (League still "Coming soon"); its card starts a run (mode exp-survival, dv 10)
//   2. each system: milestones (a boss every 5:00, its pact; every 3rd a legendary), Mewtwo at 45:00 (fast-forward: it doesn't
//      end the run), phases (12:00 / 24:00), the segment timeline (pure, fires), deep wounds (30:00), Endless Night (45:00),
//      pacts (boons on your stats, team banes on new foes), siege (standing still 20 s from 5:00: damage falls, flocks hunt),
//      migration (11:00: the portal, the next land), hostile terrain (mud, quicksand, brambles, burning; a hop clears it),
//      the local co-op partner's verbs (player 2's pad: A hops, B slides; its AI slides to catch up; its row in the snapshot)
//   3. the end: the score's parts and the server's formula; the Survival board through the real handler, its validation (a
//      wrong score, too many bosses / legendaries, no parts, an old dv), exact keys; the run's pay in Pokémonedas through the
//      base save's ledger; Survival's tasks and achievements (D10)
//   4. the HUD and the phone (844 x 390, touch): the Survival line, the siege banner, the night; the mode select card fits
//   node overworld/tests/micasurvivor_expedition_survival_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree and MP_SERVER=<file> another server: how the "fails before D11" count was taken.
//  SHOTS=<dir> saves the screenshots.)
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const MROOT = process.env.MICASURVIVOR_ROOT ? path.resolve(process.env.MICASURVIVOR_ROOT) : ROOT;
const MP_SERVER = process.env.MP_SERVER ? path.resolve(process.env.MP_SERVER) : path.join(ROOT, 'server/mp.mjs');
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8811;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();

// ======================== the server (the real handler over sqlite)
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const SQL = [];
const MP_DB = { prepare(sql) { SQL.push(sql); const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-surv-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [MP_SERVER], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.71.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {}, states = {};
const reg = async n => { const r = (await raw('register', { username: n, password: 'msurv-surv-pass-1' })).body; tokens[n] = r.token; states[n] = r.state || (await raw('state', {}, r.token)).body.state; };
for (const n of ['alice', 'bob']) await reg(n);
A(Object.values(tokens).every(Boolean), 'test accounts registered');

// ======================== the browser (the static server proxies /api/mp to the same handler)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let body = ''; for await (const c of req) body += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.72.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = name => ({
	v: 3, name, created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'starter' }, 4: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 1, partnerShiny: false, starter: 1, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {},
});
const BEFORE = (o) => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dsurv11');
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', o.token);
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
			localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
			localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));
		}
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; return pl; };
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) G.Game.debugStep(1, dt); };
	H.wipe = () => { for (const e of G.EnemyMgr.all()) { e.remote = true; } G.EnemyMgr.clear(); if (G.ExpCap && G.ExpCap.run) G.ExpCap.run.tg.clear(); if (G.ExpSurv && G.ExpSurv.run) G.ExpSurv.run.bosses.length = 0; if (G.ExpClassic.run) G.ExpClassic.run.boss = null; };
	/** no trickle, no timeline events (Survival's segment plan emptied); milestones and the rest still run */
	H.calm = () => { const C = G.ExpClassic.run, S = G.ExpSurv && G.ExpSurv.run; if (C) C.acc = -1e6; if (S) { S.seg = Math.floor(G.Game.st.time / 300); S.segEv = []; S.segN = 0; } };
	/** jump the run clock to t (and its milestones / migration to that point: no burst of the ones skipped) */
	H.jump = (t, miles) => { G.Game.debugTime(t); const S = G.ExpSurv.run; if (S) { S.miles = miles != null ? miles : Math.floor(t / 300); S.nextMig = Math.max(S.nextMig, t + 1); } H.calm(); };
	H.lose = t => { G.Game.debugTime(t); G.Game.endRun(true); return window.__sum; };
	H.choose = k => { const E = G.ExpEco; if (!E.pick) return false; E.pick.at = 0; return E.choose(k); };
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage(o, view) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(view || { width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, o);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|404|409|429)/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		const t0 = Date.now();
		while (Date.now() - t0 < 30000) { if (await page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')).catch(() => false)) break; await sleep(80); }
		if (await visible('tap-start')) await page.click('#tap-start');
		let menu = false;
		for (let i = 0; i < 150 && !menu; i++) { menu = await visible('scr-menu'); if (!menu) await sleep(100); }
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
	const prep = page => E(page, async () => {
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { ok: false, err: ok };
		await G.ExpSave.open();
		if (!window.__hooked) { window.__hooked = 1; G.Hooks.on('run.end', (out, sum) => { window.__sum = JSON.parse(JSON.stringify(sum)); window.__out = { lines: out.lines.slice() }; return out; }); }
		return { ok: true, surv: !!G.ExpSurv, dv: G.Expedition.DV, xv: G.Exp.XV, cdv: G.Exp.dv };
	});
	/** start Survival (by the mode card's click when asked); freeze the frames; a sturdy player; no foes, no events */
	const startSurv = (page, byClick) => E(page, async (byClick) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		if (G.Game.state === 'playing' || G.Game.state === 'levelup' || G.Game.state === 'choice') { G.Game.quit(); await wait(300); }
		if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await wait(300); }
		if (G.ExpEco && G.ExpEco.pick) G.ExpEco.closePick(true);
		let ok;
		if (byClick) {
			if (!G.UI.isOpen('scr-modes')) { G.ModesUI.open(); await wait(200); }
			document.querySelector('[data-exp="exp-survival"]').click();
			for (let i = 0; i < 60 && G.Game.state !== 'playing'; i++) await wait(100);
			ok = G.Game.state === 'playing';
		} else {
			if (G.UI.isOpen('scr-modes')) G.UI.show('scr-menu', true);
			ok = await G.Flow.play('exp-survival');
		}
		window.__t.freeze();
		window.__t.sturdy();
		window.__t.wipe();
		window.__t.calm();
		return { ok, state: G.Game.state, mode: G.Modes.run.mode, dv: G.Modes.run.dv, map: G.Modes.run.map, diff: G.Modes.run.diff, surv: !!(G.ExpSurv && G.ExpSurv.run), cl: !!(G.ExpClassic.run && G.ExpClassic.run.surv) };
	}, !!byClick);
	const quit = page => E(page, async () => { window.__t.thaw(); if (G.ExpEco && G.ExpEco.pick) G.ExpEco.closePick(true); if (G.Game.state !== 'over') G.Game.quit(); await new Promise(r => setTimeout(r, 300)); if (G.UI.isOpen('scr-over')) G.UI.show('scr-menu', true); });

	const d0 = await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') });
	const { page } = d0;
	A(d0.menu, 'boots to the menu signed in (alice)');

	// ======================== 1. the menu
	const mn = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw(); G.ModesUI.open(); await wait(250);
		const card = id => { const b = document.querySelector('[data-exp="' + id + '"]'); return b ? { soon: b.getAttribute('aria-disabled') === 'true', txt: b.innerText.replace(/\s+/g, ' ').trim() } : null; };
		return { surv: card('exp-survival'), league: card('exp-league'), classic: card('exp-classic'), tier: !!document.getElementById('modes-surv-tier'), coop: !!document.querySelector('[data-xcoop="exp-survival"]'), coopTxt: (document.querySelector('[data-xcoop="exp-survival"]') || {}).innerText, loaded: G.Expedition.loaded, en: G.Expedition.enabled('exp-survival') };
	});
	A(mn.surv && !mn.surv.soon && !/Coming soon/.test(mn.surv.txt) && /Milestones every 5 min/.test(mn.surv.txt) && mn.en, 'the Survival card is playable ("Milestones every 5 min, phases, pacts, ..."), no "Coming soon"', JSON.stringify(mn));
	A(mn.league && !mn.league.soon && !/Coming soon/.test(mn.league.txt), 'League is playable too (D13: no "Coming soon")', JSON.stringify(mn.league));
	A(mn.tier && mn.coop && /With friends: Expedition · Survival/.test(mn.coopTxt || ''), 'Survival\'s group: "Difficulty: Normal · leaderboards" and "With friends: Expedition · Survival"', JSON.stringify(mn));
	await E(page, () => G.UI.show('scr-menu', true));
	const pr = await prep(page);
	A(pr.ok && pr.surv && pr.dv === 12 && pr.cdv === 12 && pr.xv === 10, 'the Expedition code loads with survival.js; the content version is 12 (D13), the x block v10', JSON.stringify(pr));
	if (!pr.ok || !pr.surv) throw new Error('no G.ExpSurv: the rest needs it');
	const st0 = await startSurv(page, true);
	A(st0.ok && st0.mode === 'exp-survival' && st0.dv === 12 && st0.surv && st0.cl && st0.map === 'viridian', 'a click on the Survival card starts a Survival run (exp-survival, dv 12, Viridian Forest, Classic\'s engine with S.surv)', JSON.stringify(st0));

	// ======================== 2. each system
	// pure: the clock's rules and the milestones
	const pure = await E(page, () => {
		const S = G.ExpSurv, seed = G.World.seed;
		const m = n => { const x = S.milestone(n, 'viridian', seed); return [x.n, x.at, x.legend ? 1 : 0, x.mewtwo ? 1 : 0, x.dex]; };
		const a = JSON.stringify(S.segPlan(seed, 'viridian', 3, 'normal')), b = JSON.stringify(S.segPlan(seed, 'viridian', 3, 'normal'));
		let draws = 0; const mr = Math.random; Math.random = () => { draws++; return mr(); };
		S.segPlan(seed, 'viridian', 5, 'hard'); S.milestone(7, 'viridian', seed); S.hazardsOf(G.World.zone);
		Math.random = mr;
		return { phases: [0, 719, 720, 1439, 1440, 9999].map(S.phaseOf), wk: [1799, 1800, 2100, 2400, 5000].map(t => Math.round(S.woundK(t) * 100) / 100),
			night: [2699, 2700, 3000, 3300].map(t => Math.round(S.nightOf(t).hp * 100) / 100), nd: Math.round(S.nightOf(3000).dmg * 100) / 100,
			m: [1, 2, 3, 4, 6, 9, 12].map(m), guard0: G.ExpClassic.MAPS.viridian.guardians[0], seg: S.segPlan(seed, 'viridian', 3, 'normal').map(e => [e.at, e.kind, e.n]), same: a === b, draws,
			score: S.scoreOf({ kills: 1000, time: 1800, dmg: 400000, bosses: 6, legends: 2, catches: 1 }, 'hard') };
	});
	A(JSON.stringify(pure.phases) === '[0,0,1,1,2,2]', 'phases at 12:00 and 24:00 (study)', JSON.stringify(pure.phases));
	A(JSON.stringify(pure.wk) === '[1,1,0.8,0.6,0.2]', 'deep wounds from 30:00: a heal is worth 4 % less a minute, down to x0.2', JSON.stringify(pure.wk));
	A(JSON.stringify(pure.night) === '[1,1,1.6,2.2]' && pure.nd === 1.3, 'Endless Night from 45:00: a new foe +12 % HP and +6 % damage a minute', JSON.stringify([pure.night, pure.nd]));
	const ms = Object.fromEntries(pure.m.map(r => [r[0], r]));
	A(ms[1][1] === 300 && !ms[1][2] && pure.guard0.includes(ms[1][4]) && ms[2][1] === 600 && !ms[2][2] && ms[4] && !ms[4][2],
		'a milestone boss every 5:00 (a phase guardian of the map: ' + ms[1][4] + ')', JSON.stringify(pure.m));
	A(ms[3][2] && ms[3][4] === 151 && ms[6][2] && [144, 145, 146].includes(ms[6][4]) && ms[9][2] && ms[9][3] && ms[9][4] === 150 && ms[9][1] === 2700 && ms[12][2],
		'every 3rd a legendary: 15:00 Mew, 30:00 a bird, 45:00 MEWTWO, then on', JSON.stringify(pure.m));
	A(pure.same && pure.draws === 0 && pure.seg.length >= 5 && pure.seg.every(e => e[0] >= 900 && e[0] < 1200) && pure.seg.some(e => e[1] === 'alpha') && pure.seg.some(e => e[1] === 'rockslide'),
		'each 5:00 segment\'s timeline is pure (seeded, no Math.random): an alpha, a swarm / stampede, a flock, an elite wave, a rock slide (+ totem / summoner)', JSON.stringify(pure.seg));
	A(pure.score === Math.floor((2 * 1000 + 4 * 1800 + 400000 / 200 + 800 * 6 + 2000 * 2 + 400 * 1) * 1.5), 'the Survival score (study 2.12): 2 KOs + 4 s + damage / 200 + 800 bosses + 2,000 legendaries (+ 400 a catch), x1.5 on Hard', pure.score);

	// milestones in a run: a boss at 5:00, its pact
	const mi = await E(page, () => {
		const H = window.__t, S = G.ExpSurv, pl = G.Game.player;
		H.jump(299.9, 0); H.step(6);
		const r = S.run, b = r.bosses[0], e = b && b.e;
		const out = { miles: r.miles, n: r.bosses.length, dex: e && e.dex, xk: e && e.xk, mile: e && e.xmile, hp: e && e.maxHp, banner: G.Spawner.banner ? String(G.Spawner.banner) : '' };
		e.hurt(e.hp * 10, '#fff'); H.step(3);
		out.downs = r.downs; out.left = r.bosses.length;
		H.step(2);
		const P = G.ExpEco.pick;
		out.pick = P ? { kind: P.kind, n: P.cards.length, names: P.cards.map(c => c.nm) } : null;
		out.state = G.Game.state;
		out.atk0 = pl.atkMul; out.hp0 = pl.maxHp;
		return out;
	});
	A(mi.miles === 1 && mi.n === 1 && mi.mile === 1 && mi.xk === 'guardian' && mi.hp > 1000, 'at 5:00 the first milestone boss appears (a guardian of the phase, its HP from your DPS / the curve)', JSON.stringify(mi));
	A(mi.downs === 1 && mi.left === 0 && mi.pick && mi.pick.kind === 'pact' && mi.pick.n === 3 && mi.state === 'choice', 'beaten: "Choose a pact": 3 of the 9 pacts (seeded), the world holds', JSON.stringify(mi));
	await shoot(page, 'survival-pact-desktop.png');
	const pc = await E(page, () => {
		const H = window.__t, S = G.ExpSurv, pl = G.Game.player, IT = G.ExpItems;
		const ids = G.ExpSurv.offerOf(S.run.seed, 1, (s => { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; })('solo'), []);
		const p = S.PACT_BY[ids[0]], before = {}; for (const k of Object.keys(p.boon).concat(Object.keys(p.bane))) before[k] = IT.total(pl, k);
		const team0 = S.foeTeam();
		H.choose(0);
		const after = {}; for (const k of Object.keys(before)) after[k] = IT.total(pl, k);
		return { ids, id: p.id, boon: p.boon, bane: p.bane, team: p.team, before, after, pacts: S.run.pacts.slice(), row: S.row(), state: G.Game.state, team0, team1: S.foeTeam(), pending: !!G.ExpEco.pick };
	});
	const boonOk = Object.entries(pc.boon || {}).every(([k, v]) => Math.abs(pc.after[k] - pc.before[k] - v - ((pc.bane || {})[k] || 0)) < 1e-9);
	const teamOk = Object.entries(pc.team || {}).every(([k, v]) => Math.abs(pc.team1[k] - pc.team0[k] - v) < 1e-9);
	A(pc.pacts && pc.pacts.length === 1 && pc.pacts[0] === pc.id && pc.state === 'playing' && !pc.pending && boonOk && teamOk && pc.row && pc.row[0].length === 1,
		'a pact is sealed: its boon and bane on your stats (items.js total), its team bane on new foes (foeTeam), your row carries it (x block `v`)', JSON.stringify(pc));
	// every pact's numbers, in the run (seal them all directly)
	const allp = await E(page, () => {
		const S = G.ExpSurv, pl = G.Game.player, IT = G.ExpItems, out = [];
		for (const p of S.PACTS) {
			if (S.run.pacts.includes(p.id)) continue;
			const ks = Object.keys(p.boon).concat(Object.keys(p.bane)), b = {}; for (const k of ks) b[k] = IT.total(pl, k);
			const t0 = S.foeTeam();
			S.take(pl, p.id);
			const t1 = S.foeTeam();
			out.push({ id: p.id, ok: ks.every(k => Math.abs(IT.total(pl, k) - b[k] - (p.boon[k] || 0) - (p.bane[k] || 0)) < 1e-9) && Object.keys(p.team).every(k => Math.abs(t1[k] - t0[k] - p.team[k]) < 1e-9) });
		}
		const fk = S.foeK(100);
		return { out, n: S.PACTS.length, fk, team: S.foeTeam() };
	});
	A(allp.n === 9 && allp.out.length === 8 && allp.out.every(x => x.ok) && Math.abs(allp.fk.hp - 1.15) < 1e-9 && Math.abs(allp.fk.dmg - 1.15) < 1e-9 && Math.abs(allp.fk.rate - 1.25) < 1e-9 && Math.abs(allp.fk.elite - 0.06) < 1e-9,
		'all 9 pacts (study: "pacts trade a boon for a bane"): each one\'s boon / bane on your stats, the team banes on a new foe (HP x1.15, damage x1.15, spawns x1.25, elites +6 %)', JSON.stringify(allp));

	// phases, wounds, night
	await startSurv(page);
	const ph = await E(page, () => {
		const H = window.__t, C = G.ExpClassic, S = G.ExpSurv, pl = G.Game.player, out = {};
		out.z0 = C.run.zi; out.c0 = C.run.plan.cards.slice(0, 3);
		H.jump(720, 2); H.step(2); out.z1 = C.run.zi; out.c1 = C.run.plan.cards.slice(0, 3); out.ph1 = S.run.phase;
		H.wipe(); H.jump(1440, 4); H.step(2); out.z2 = C.run.zi; out.ph2 = S.run.phase;
		// a foe of phase 3 vs one of phase 1 (the band and the stats move on)
		const P3 = C.poolOf('viridian', 3), pool3 = new Set(P3.res.concat(P3.others));
		out.inPool = C.run.plan.cards.every(d => pool3.has(d)); out.same3 = JSON.stringify(C.run.plan.cards) === JSON.stringify(C.plan(G.World.seed, 'viridian', 3).cards);
		// deep wounds at 40:00: a heal of 100 gives 60
		H.wipe(); H.jump(2400, 7); H.step(1);
		pl.maxHp = 1000; pl.hp = 500; H.step(1);
		const h0 = pl.hp; pl.heal(100); H.step(1); out.healed = Math.round(pl.hp - h0);
		// Endless Night at 50:00: a new foe x1.6 HP vs the same foe just before 45:00
		H.wipe(); H.jump(2699, 8); const a = C.spawnFoe(10, pl.x + 300, pl.y); const ha = a.maxHp;
		H.jump(3000, 10); const b = C.spawnFoe(10, pl.x + 300, pl.y); out.nightK = Math.round(b.maxHp / ha * 100) / 100;
		out.nightWant = Math.round(S.nightOf(3000).hp * G.Enemies.scale(3000).hp / G.Enemies.scale(2699).hp * 100) / 100;
		H.wipe();
		return out;
	});
	A(ph.z0 === 0 && ph.z1 === 1 && ph.ph1 === 1 && ph.z2 === 2 && ph.ph2 === 2 && JSON.stringify(ph.c0) !== JSON.stringify(ph.c1) && ph.inPool && ph.same3,
		'the phases move the enemies on: at 12:00 the middle band, at 24:00 the final stages (the trickle\'s cards follow)', JSON.stringify(ph));
	A(ph.healed >= 59 && ph.healed <= 61, 'deep wounds at 40:00: a heal of 100 gives 60 (x0.6)', ph.healed);
	A(Math.abs(ph.nightK - ph.nightWant) < 0.08 && ph.nightK > 1.5, 'Endless Night at 50:00: a new foe has x1.6 HP (on top of the clock\'s own growth)', JSON.stringify(ph));
	// the night on screen (and the HUD line)
	const nt = await E(page, async () => {
		const H = window.__t, S = G.ExpSurv;
		H.jump(3000, 10); H.step(1);
		const n0 = S.nightDrawn;
		window.__t.thaw(); await new Promise(r => setTimeout(r, 300)); window.__t.freeze();
		return { drawn: S.nightDrawn - n0, line: G.ExpClassic.hudLine(G.Game.player, G.Game.st) };
	});
	A(nt.drawn > 0 && /SURVIVAL/.test(nt.line) && /PHASE 3/.test(nt.line) && /NIGHT ×1\.6/.test(nt.line), 'the night darkens the screen; the HUD says "SURVIVAL · PHASE 3 · ... · NIGHT ×1.6"', JSON.stringify(nt));
	await shoot(page, 'survival-night-desktop.png');

	// Mewtwo at 45:00 (fast-forward: the 9th milestone; it doesn't end the run)
	await startSurv(page);
	const mw = await E(page, () => {
		const H = window.__t, S = G.ExpSurv, pl = G.Game.player;
		H.jump(2699.9, 8); H.step(6);
		const b = S.run.bosses[0], e = b && b.e;
		const out = { miles: S.run.miles, dex: e && e.dex, xk: e && e.xk, mew: e && e.xmew, target: e && e.xtarget, line: G.ExpClassic.hudLine(pl, G.Game.st) };
		e.hurt(e.hp * 10, '#fff'); H.step(4);
		out.mewtwo = S.run.mewtwo; out.legends = S.run.legends; out.state = G.Game.state; out.over = G.Game.state === 'over';
		window.__t.choose(0); H.step(2);
		out.after = G.Game.state;
		return out;
	});
	A(mw.miles === 9 && mw.dex === 150 && mw.xk === 'legend' && mw.mew === 1 && mw.target === 90, 'fast-forward to 45:00: MEWTWO appears (the 9th milestone, a legendary, a 90 s fight)', JSON.stringify(mw));
	A(mw.mewtwo === 1 && mw.legends === 1 && !mw.over && mw.after === 'playing', 'Mewtwo down: the run goes on (a pact, then playing): "an end-boss that doesn\'t end the run"', JSON.stringify(mw));
	await shoot(page, 'survival-milestone-mewtwo.png');

	// siege: standing still from 5:00
	await startSurv(page);
	const sg = await E(page, () => {
		const H = window.__t, S = G.ExpSurv, pl = G.Game.player, out = {};
		H.jump(200, 0);
		for (let i = 0; i < 25 * 30; i++) H.step(1);   // 25 s still, before 5:00: no siege
		out.before = S.run.siege.on;
		H.jump(400, 1); S.run.siege.ax = pl.x; S.run.siege.ay = pl.y; S.run.siege.t = 0;
		for (let i = 0; i < 21 * 30; i++) H.step(1);
		out.on = S.run.siege.on; out.k = S.run.siege.k; out.row = S.row();
		for (let i = 0; i < 10 * 30; i++) H.step(1);
		out.k2 = Math.round(S.run.siege.k * 100) / 100;
		out.fliers = G.EnemyMgr.all().filter(e => e.xsiege && !e.dead).length;
		out.flying = G.EnemyMgr.all().filter(e => e.xsiege).every(e => e.flying);
		out.factor = G.Hooks.reduce('combat.out', 1, pl, G.EnemyMgr.all()[0] || { x: 0, y: 0 }, null, 10);
		pl.x += 400; pl.zMask = null; pl._px = null; H.step(1);
		out.off = S.run.siege.on;
		for (let i = 0; i < 2 * 30; i++) H.step(1);
		out.k3 = S.run.siege.k;
		H.wipe();
		return out;
	});
	A(!sg.before && sg.on && sg.row[1] > 0, 'siege from 5:00: 20 s within 6 m of one spot starts it (none before 5:00); your row says so', JSON.stringify(sg));
	A(sg.k2 <= 0.31 && sg.fliers >= 5 && sg.flying && sg.factor <= 0.31, 'under siege your damage falls to x0.3 (combat.out) and flocks of fliers hunt you', JSON.stringify(sg));
	A(!sg.off && sg.k3 === 1, 'moving away lifts it; the damage comes back', JSON.stringify(sg));
	await shoot(page, 'survival-siege-desktop.png');

	// migration: the portal at 11:00, the next land
	await startSurv(page);
	const mg = await E(page, () => {
		const H = window.__t, C = G.ExpClassic, S = G.ExpSurv, pl = G.Game.player, out = {};
		H.jump(650, 2); S.run.nextMig = 660; H.step(1); out.closed = C.run.ph;
		G.Game.debugTime(660); H.calm(); H.step(2);
		out.ph = C.run.ph; out.line = C.hudLine(pl, G.Game.st); out.z0 = G.World.zone.zone; out.h0 = G.World.zone.hash;
		const [x, y] = C.siteXY(C.run.sites.altar); pl.x = x; pl.y = y; pl.zMask = null;
		H.step(40);
		out.z1 = G.World.zone.zone; out.h1 = G.World.zone.hash; out.land = S.run.land; out.ph1 = C.run.ph; out.next = S.run.nextMig;
		out.objs = G.ExpEco.layoutOf(G.World.zone).objs.length; out.fresh = !G.ExpEco.zone || G.ExpEco.zone.st.every(s => s === G.ExpEco.FRESH || s === G.ExpEco.READY || s === G.ExpEco.ACTIVE);
		return out;
	});
	A(mg.closed === 0 && mg.ph === 2 && /PORTAL \d+ s/.test(mg.line), 'at 11:00 a migration portal opens ("PORTAL 90 s" on the HUD)', JSON.stringify(mg));
	A(mg.z0 === 1 && mg.z1 === 2 && mg.h1 !== mg.h0 && mg.land === 2 && mg.ph1 === 0 && mg.next >= 660 + 660 && mg.objs > 20 && mg.fresh, 'stepping in moves the run to new lands (zone 2\'s terrain, its fresh interactables); the next portal in 11:00', JSON.stringify(mg));
	await shoot(page, 'survival-migration-desktop.png');
	const mg2 = await E(page, () => { const H = window.__t, C = G.ExpClassic, S = G.ExpSurv; const at = S.run.nextMig; G.Game.debugTime(at); S.run.miles = Math.floor(at / 300); H.wipe(); H.calm(); H.step(2); const open = C.run.ph; G.Game.debugTime(S.run.portalUntil + 1); H.step(2); return { open, closed: C.run.ph, next: S.run.nextMig }; });
	A(mg2.open === 2 && mg2.closed === 0, 'a portal nobody takes closes after 90 s', JSON.stringify(mg2));

	// hostile terrain
	await startSurv(page);
	const hz = await E(page, () => {
		const H = window.__t, S = G.ExpSurv, pl = G.Game.player, z = G.World.zone, out = {};
		const list = S.hazardsOf(z);
		out.n = list.length; out.kinds = [...new Set(list.map(o => o.kind))].sort();
		const again = JSON.stringify(S.hazardsOf(G.ExpTerrain.generate({ seed: G.World.seed, map: z.map, zone: z.zone })));
		out.pure = again === JSON.stringify(list.map(o => o));
		const at = k => list.find(o => o.kind === k);
		const walk = (o, t, dx) => {   // one step of 10 px inside o at run time t -> how far you actually moved
			H.jump(t, Math.floor(t / 300)); pl.air = null;
			pl.x = o.x; pl.y = o.y; pl.zMask = null; pl._px = null; H.step(1);
			S.run.px = pl.x; S.run.py = pl.y; S.run.lastHp = pl.hp; S.run.lastMax = pl.maxHp;
			const x0 = pl.x, y0 = pl.y, hp0 = pl.hp;
			const k0 = (S.hazardAt(x0, y0, G.Game.st.time) || {}).kind, off = Math.round(Math.hypot(x0 - o.x, y0 - o.y));
			pl.x += dx; S.tick(1 / 30, pl);
			return { moved: Math.round(Math.hypot(pl.x - x0, pl.y - y0) * 10) / 10, hurt: Math.round((hp0 - pl.hp) * 100) / 100, k0, off, inv: pl.invuln, t: G.Game.st.time, ph: S.phaseOf(G.Game.st.time) };
		};
		pl.hp = pl.maxHp;
		out.mud = walk(at('mud'), 100, 10);
		out.mudLater = walk(at('brambles'), 100, 10);   // (brambles sleep until phase 2)
		out.qs = walk(at('quicksand'), 800, 10);
		out.br = walk(at('brambles'), 800, 10);
		out.burn = walk(at('burning'), 1500, 0);
		pl.air = { kind: 'hop', t: 0.1, t0: 0, hop0: 0, dur: 0.45, h: 12, l0: 0, top: 1, top0: 0, hops: 1 };
		const o = at('mud'); H.jump(100, 0); pl.x = o.x; pl.y = o.y; pl.zMask = null; pl._px = null; S.run.px = pl.x; S.run.py = pl.y; const x0 = pl.x; pl.x += 10; S.tick(1 / 30, pl); out.hop = Math.round((pl.x - x0) * 10) / 10;
		pl.air = null;
		return out;
	});
	A(hz.n === 16 && JSON.stringify(hz.kinds) === '["brambles","burning","mud","quicksand"]' && hz.pure, 'hostile terrain: 16 patches a land (mud, brambles, quicksand, burning ground), pure from the land\'s grids', JSON.stringify(hz));
	A(hz.mud.moved > 5.5 && hz.mud.moved < 6.5 && hz.mudLater.moved === 10 && hz.qs.moved < 6 && hz.br.hurt > 0 && hz.burn.hurt > 0,
		'mud slows you (x0.6); quicksand slows and pulls; brambles cut you while you move, burning ground burns; each wakes with its phase (brambles not before 12:00)', JSON.stringify(hz));
	A(hz.hop === 10, 'a hop clears it (airborne: no slow)', JSON.stringify(hz));
	await shoot(page, 'survival-hazards-desktop.png');

	// the local co-op partner (js/systems/localcoop.js): with player 2's pad or the "local partner" setting, an Expedition run
	// brings it, and it has the verbs (player 2's A hops, B slides; else its AI slides to catch up); spectators see its row
	const lc0 = await E(page, () => { window.__t.step(2); return { mate: !!(G.LocalCoop.on && G.LocalCoop.mate), board: G.Exp.boardOk({ clean: true, group: false }), coop: G.Exp.boardOk({ clean: true, group: true }) }; });
	await E(page, () => { localStorage.setItem('micasurvivorexp_mate', '1'); });
	await startSurv(page);
	const lc = await E(page, () => {
		const H = window.__t, L = G.LocalCoop, pl = G.Game.player, m = L.mate, out = { on: L.on, mate: !!m, group: !!G.Modes.run.group };
		if (!m) return out;
		H.jump(100, 0);
		const P = G.Pad, p2 = P.p2, ax = P.p2Axis;
		let a = false, b = false;
		P.p2 = () => ({ index: 1, id: 'test pad', buttons: [{ pressed: a, value: a ? 1 : 0 }, { pressed: b, value: b ? 1 : 0 }] });
		P.p2Axis = () => [0.01, 0];
		const goNear = () => { m.x = pl.x + 50; m.y = pl.y + 10; m.air = null; m.slideT = 0; m.slideCd = 0; m.zMask = null; };
		goNear(); H.step(2);
		out.ctrl = L.ctrl;
		const h0 = m.hopN | 0;
		a = true; H.step(1); out.air = !!m.air; out.hop = (m.hopN | 0) - h0;
		const snap = G.Spectate.snap(), q = snap.x && snap.x.a && snap.x.a.q;
		out.snapRow = q ? q[m.mon.name] || null : null;
		H.step(4); a = false; H.step(30);
		goNear(); H.step(2);
		b = true; H.step(1); out.slide = (m.slideT || 0) > 0; b = false; H.step(30);
		// the AI (no pad): far behind you (but inside the leash) it slides to catch up
		P.p2 = p2; P.p2Axis = ax; H.step(2);
		out.ctrlAi = L.ctrl;
		m.x = pl.x + 400; m.y = pl.y; m.air = null; m.slideT = 0; m.slideCd = 0; m.zMask = null;
		let slid = false; for (let i = 0; i < 90 && !slid; i++) { H.step(1); slid = (m.slideT || 0) > 0; }
		out.aiSlide = slid;
		out.board = G.Exp.boardOk({ clean: true, group: false });
		return out;
	});
	await E(page, () => { localStorage.removeItem('micasurvivorexp_mate'); });
	A(!lc0.mate && lc.on && lc.mate && !lc.group, 'the local partner: an Expedition run brings it with the "local partner" setting (none without it, or the pad)', JSON.stringify({ lc0, lc }));
	A(lc.ctrl === 'p2' && lc.hop === 1 && lc.air && lc.slide, 'player 2\'s pad drives the partner\'s verbs: A hops (it takes to the air), B slides', JSON.stringify(lc));
	A(Array.isArray(lc.snapRow) && lc.snapRow[5] >= 1, 'the partner\'s verb row goes in the snapshot (x.a.q by its Pokémon\'s name), so spectators see its hops', JSON.stringify(lc.snapRow));
	A(lc0.board && !lc0.coop && lc.board === false, 'a solo clean run goes to its board; an online co-op run, or one with the local partner, never does', JSON.stringify({ lc0, board: lc.board }));
	A(lc.ctrlAi === 'ai' && lc.aiSlide, 'without a pad its AI slides to catch up when it falls behind', JSON.stringify(lc));
	await quit(page);

	// ======================== 3. the end: score, board (the real handler), pay, tasks, achievements
	await startSurv(page);
	const coins0 = await E(page, () => ({ coins: G.DB.save.coins, led: JSON.parse(JSON.stringify(G.DB.save.led || {})) }));
	const en = await E(page, async () => {
		const H = window.__t, S = G.ExpSurv, C = G.ExpClassic, pl = G.Game.player;
		pl.kills = 1500;
		S.run.downs = 3; S.run.legends = 1; S.run.miles = 4;
		const sum = H.lose(1290);
		await new Promise(r => setTimeout(r, 1200));
		window.__sub = await G.Exp.submitScore(window.__sum);
		return { sub: window.__sub, sum, lines: window.__out.lines, best: G.ExpSave.get('surv.best.viridian.normal'), runs: G.ExpSave.get('surv.runs'), miles: G.ExpSave.get('surv.miles'), ach: G.ExpSave.list('ach'), coins: G.DB.save.coins, led: G.DB.save.led, dev: JSON.parse(localStorage.getItem('micasurvivor_dev')), pay: G.ExpSave.get('pay.coins') };
	});
	const p = en.sum && en.sum.parts;
	A(p && p.bosses === 3 && p.legends === 1 && p.time === 1290 && p.kills === 1500 && en.sum.score === Math.floor(2 * 1500 + 4 * 1290 + p.dmg / 200 + 800 * 3 + 2000 * 1 + 400 * p.catches),
		'the run\'s parts and score: KOs, time, damage, 3 milestone bosses (1 legendary), catches', JSON.stringify(en.sum));
	A(en.lines.some(l => /^Survival · Viridian Forest · Normal$/.test(l)) && en.lines.some(l => /^Survived 21:30/.test(l)) && en.lines.some(l => /Milestone bosses: 3 \(1 legendary\)/.test(l)) && en.lines.some(l => /^Score: /.test(l)),
		'the run-over lines: "Survival · Viridian Forest · Normal", "Survived 21:30", "Milestone bosses: 3 (1 legendary)", the score', JSON.stringify(en.lines));
	A(en.best >= 1290 && en.runs >= 1 && en.miles >= 3, 'the Expedition save: the best time per map + tier (surv.best.viridian.normal), runs, milestones', JSON.stringify(en));
	const payLine = en.lines.find(l => /^Pokémonedas: \+\d+/.test(l)), paid = payLine ? +payLine.match(/\+(\d+)/)[1] : 0;
	const devE = en.led && en.dev && en.led[en.dev] && en.led[en.dev].c;
	const dev0 = coins0.led && coins0.led[en.dev] && coins0.led[en.dev].c || [0, 0];
	A(paid > 0 && en.coins - coins0.coins >= paid && devE && devE[0] - (dev0[0] || 0) === en.coins - coins0.coins,
		'the run pays Pokémonedas (the base save\'s, owner decision #4) through this device\'s ledger entry: +' + paid, JSON.stringify({ payLine, before: coins0.coins, after: en.coins, devE, dev0 }));
	{ const want = Math.round((10 + p.kills / 40 + 25 * (p.zone - 1) + 30 * p.bosses + 60 * p.legends + 15 * p.catches + 4 * p.time / 60) * 3 / 5) * 5;
		A(paid === want && p.zone === 2, 'The Survival pay (D10 units x3): 10 + KOs / 40 + 25 a phase passed + 30 a milestone boss + 60 a legendary + 15 a catch + 4 a minute survived = ' + want + ' for 21:30', JSON.stringify({ paid, want, p })); }
	A(en.ach.includes('surv10') && en.ach.includes('run1'), 'Survival\'s achievements (D10): "Survivor" (10 minutes)', JSON.stringify(en.ach));
	const tk = await E(page, () => { const M = G.ExpMeta; return { has: M.TASKS.some(t => t.id === 'surv') && M.TASKS.some(t => t.id === 'miles'), ach: ['surv10', 'surv30', 'miles10', 'mewtwo', 'pact10'].every(id => M.ACH_BY[id]), m: G.ExpSurv.metrics({ time: 1290 }) }; });
	A(tk.has && tk.ach && Math.abs(tk.m.smins - 21.5) < 1e-9, 'Survival\'s tasks ("Last N minutes in Survival", "Beat N milestone bosses") and 5 achievements (Mewtwo\'s title "Survival Legend")', JSON.stringify(tk));
	// the board (the client submitted it at the run's end; then the handler directly)
	await sleep(300);
	const bd = row('runboard:micasurvivor_expedition:viridian:normal:survival');
	A(Array.isArray(bd) && bd.length === 1 && bd[0].name === 'alice' && bd[0].score === en.sum.score && bd[0].bosses === 3 && bd[0].legends === 1 && !row('msurvseason:' + (Math.floor((Date.now() - Date.UTC(2026, 9, 12)) / 604800000) + 1) + ':viridian:normal'),
		'the run reached its Survival board (runboard:...:viridian:normal:survival), not the Classic or season boards', JSON.stringify(bd));
	const sub = (o, tok = tokens.bob) => raw('run-score', Object.assign({ mode: 'micasurvivor_expedition', expMode: 'exp-survival', dv: 10, map: 'viridian', diff: 'hard', time: 1800, kills: 900, level: 30, dex: 4, dmg: 300000, bosses: 6, legends: 2, catches: 1 }, o), tok);
	const want = Math.floor((2 * 900 + 4 * 1800 + 300000 / 200 + 800 * 6 + 2000 * 2 + 400) * 1.5);
	const i0 = SQL.length;
	const good = await sub({ score: want });
	const bad = await sub({ score: want + 50 });
	const tooMany = await sub({ score: want, bosses: 7 });
	const legends = await sub({ time: 1700, bosses: 5, legends: 2, score: Math.floor((2 * 900 + 4 * 1700 + 300000 / 200 + 800 * 5 + 2000 * 2 + 400) * 1.5) });
	const noParts = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-survival', dv: 10, map: 'viridian', diff: 'hard', time: 1800, kills: 900, score: 100 }, tokens.bob);
	const oldDv = await sub({ score: want, dv: 9 });
	const lb = await raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'viridian', diff: 'hard', board: 'survival' }, tokens.bob);
	const classic = await raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'viridian', diff: 'hard' }, tokens.bob);
	A(good.status === 200 && good.body.ok && good.body.board === 'micasurvivor_expedition:viridian:hard:survival' && good.body.rank === 1, 'the server recomputes the score from its parts (x1.5 Hard) and takes it', JSON.stringify(good.body));
	A(bad.status === 400 && /does not match/.test(bad.body.error) && bad.body.want === want, 'a score that doesn\'t match its parts is refused (400)', JSON.stringify(bad.body));
	A(tooMany.status === 400 && /implausible bosses/.test(tooMany.body.error) && legends.status === 400 && /legendaries/.test(legends.body.error), 'more bosses than milestones (1 per 5:00), or more legendaries than every 3rd, are refused', JSON.stringify([tooMany.body, legends.body]));
	A(noParts.status === 400 && /parts/.test(noParts.body.error) && oldDv.status === 400 && /content version/.test(oldDv.body.error), 'a Survival score without its parts, or from before dv 10, is refused', JSON.stringify([noParts.body, oldDv.body]));
	A(lb.body.board === 'survival' && lb.body.top.length === 1 && lb.body.top[0].name === 'bob' && lb.body.you.rank === 1 && !(classic.body.top || []).length, 'run-leaderboard board "survival" reads it; the Classic board of that map + tier has none of it', JSON.stringify([lb.body, classic.body]));
	const q = SQL.slice(i0).filter(s => /^\s*SELECT/i.test(s));
	A(q.length >= 2 && !q.some(s => /LIKE/i.test(s)), 'Survival\'s board reads and writes exact keys only (no SELECT ... LIKE)', q.slice(0, 3).join(' | '));
	// the board on the panel (Survival's button opens on its tab)
	const tb = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		if (G.UI.isOpen('scr-over')) G.UI.show('scr-menu', true);
		G.ModesUI.open(); await wait(200);
		document.getElementById('modes-surv-tier').click(); await wait(900);
		const el = document.getElementById('modes-xtier');
		return { view: G.ExpTier.ui.view, tabs: [...el.querySelectorAll('[data-view]')].map(b => b.innerText.trim()), on: (el.querySelector('[data-view].on') || {}).innerText, rows: el.querySelectorAll('#xt-list .rk-row').length, first: (el.querySelector('#xt-list .rk-row') || {}).innerText };
	});
	A(tb.view === 'survival' && tb.tabs.includes('Survival') && tb.on === 'Survival' && tb.rows === 1 && /alice/.test(tb.first || '') && /3 milestone bosses/.test(tb.first || ''), 'Survival\'s "Difficulty · leaderboards" opens on the Survival board: alice, 3 milestone bosses', JSON.stringify(tb));
	await shoot(page, 'survival-board-desktop.png');
	await E(page, () => { G.ExpTier.close(); G.UI.show('scr-menu', true); });

	// ======================== 4. the HUD and the phone
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = tag === 'desktop' ? d0 : await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') }, view);
		if (tag === 'phone') await prep(d.page);
		const card = await E(d.page, async () => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			window.__t.thaw(); G.ModesUI.open(); await wait(250);
			const b = document.querySelector('[data-exp="exp-survival"]'); b.scrollIntoView({ block: 'center' }); await wait(150);
			const r = x => { const q = x.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };
			const subs = [...document.querySelectorAll('#modes-surv-tier, [data-xcoop="exp-survival"]')].map(r);
			return { W: innerWidth, H: innerHeight, card: r(b), subs, side: document.documentElement.scrollWidth - innerWidth };
		});
		const inW = b => b && b.x >= -1 && b.x + b.w <= card.W + 1;
		A(inW(card.card) && card.subs.length === 2 && card.subs.every(inW) && card.side <= 0, `${tag}: the Survival card and its two buttons fit (no sideways scroll)`, JSON.stringify(card));
		if (tag === 'phone') await shoot(d.page, 'survival-modes-phone.png');
		await E(d.page, () => G.UI.show('scr-menu', true));
		await startSurv(d.page);
		const hud = await E(d.page, async () => {
			const H = window.__t, S = G.ExpSurv, pl = G.Game.player;
			H.jump(400, 1); S.run.siege.on = true; S.run.siege.k = 0.45; S.run.siege.ax = pl.x; S.run.siege.ay = pl.y; S.run.siege.t = 30;
			window.__t.thaw(); await new Promise(r => setTimeout(r, 400)); window.__t.freeze();
			const marks = G.HUD.rects ? G.HUD.rects() : [];
			const k = G.HUD.k || 1, W = innerWidth, Hh = innerHeight;
			const sr = S.siegeRect, clock = marks.find(m => m.name === 'clock'), moves = marks.find(m => m.name === 'moves');
			return { W, Hh, k, sr, clock, moves, line: G.ExpClassic.hudLine(pl, G.Game.st), touch: G.Touch.active };
		});
		const sr = hud.sr, kk = hud.k;
		const fits = sr && sr.x >= 0 && (sr.x + sr.w) * kk <= hud.W + 1 && sr.y >= 0 && (!hud.moves || (sr.y + sr.h) <= hud.moves.y) && (!hud.clock || sr.y >= hud.clock.y + hud.clock.h - 2);
		A(fits && /SURVIVAL\s+·\s+PHASE 1\s+·\s+BOSS IN \d:\d\d/.test(hud.line), `${tag}${hud.touch ? ' (touch)' : ''}: the Survival line under the clock and the siege banner fit, clear of the clock and the move bar`, JSON.stringify(hud));
		await shoot(d.page, `survival-hud-${tag}.png`);
		if (tag === 'phone') {
			await E(d.page, () => { const H = window.__t; H.jump(299.9, 0); H.step(6); const e = G.ExpSurv.run.bosses[0].e; e.hurt(e.hp * 10, '#fff'); H.step(5); });
			const pk = await E(d.page, () => { const el = document.getElementById('scr-xeco'), r = el.querySelector('.box').getBoundingClientRect(); return { kind: G.ExpEco.pick && G.ExpEco.pick.kind, box: { x: r.left, y: r.top, w: r.width, h: r.height }, W: innerWidth, H: innerHeight, cards: [...el.querySelectorAll('.card')].map(c => { const q = c.getBoundingClientRect(); return { y: q.top, b: q.bottom }; }) }; });
			A(pk.kind === 'pact' && pk.box.x >= 0 && pk.box.x + pk.box.w <= pk.W + 1 && pk.cards.length === 3, 'phone: the pact choice fits the screen (3 cards)', JSON.stringify(pk));
			await shoot(d.page, 'survival-pact-phone.png');
			await quit(d.page);
			await d.ctx.close();
		} else await quit(d.page);
	}
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
