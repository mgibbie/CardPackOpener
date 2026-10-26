// micasurvivor_allmoves_test.mjs — MicaSurvivor DLC D16 (owner 2026-10-26): "in both modes i do not want to have to switch
// between moves. all of my moves should be firing at the same time on their own cooldowns" (+ the owner's approved defaults
// and his 2026-10-26 change to decision #7: a bond still FUSES moves into one slot, freeing a slot for another move).
// Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md "2026-10-26 owner request" and "D16 built"; micasurvivor/README.md "DLC D16".
// The real server handler over sqlite (no browser), then headless Chrome, a fixed guest profile, one browser at a time:
//   S1. a base co-op lobby carries its ruleset (rules 2): a guest of other rules is refused (409, both ways), a bad value
//       400, an Expedition lobby goes by its dv as before; the start carries the rules
//   S2. the boards split by ruleset: a base score with rules 2 -> runboard:micasurvivor:r2 (exact key), without -> the legacy
//       board; an Expedition score of dv >= 15 -> runboard:micasurvivor_expedition:r2:<map>:<diff>[:time|:survival] and the
//       season msurvseason:<n>:r2:<map>:<diff>; an older dv -> the legacy keys; reads {rules: 2} vs none (Legacy)
//   B1. base: every one of 4 moves FIRES on its own cooldown (casts counted on a dummy ring); an old puppet (af false) fires
//       only its active slot
//   B2. keys 1-4 / numpad / Q / E / Tab switch nothing (active stays 0, all still fire); setActive is a no-op; the HUD has no
//       tap-to-switch buttons (an old tape's HUD keeps them)
//   B3. the Choice Band: +40 % on the slot-1 move's hits, -20 % on the others (fired through G.Combat.land); no atk bonus
//   B4. a bond fuses 2 moves into ONE slot; the freed slot is offered by the level-up and filled; then all 5 moves fire
//   B5. melee: -25 % damage taken for 1.5 s after a melee move fires, not before, not after
//   B6. co-op frames: field 15 lists every orbit move; an old frame (one move) and a new one both read; a puppet shows the
//       orbs of all its orbit moves
//   B7. a live snapshot carries af (and sg, the fused slots); a new tape's header h.af = 1; the new tape plays with every
//       move ghosted; an OLD tape (no af) plays with its one active move, as recorded
//   E1. Expedition: 4 move slots (no extra slots), the kit fills them; no new-move cards, a rare swap card instead; a swap
//       takes the old move's slot; all 4 kit moves fire; the all-fire factor is the Expedition's; dv 15
//   E2. the Lab's move slot is retired: no effect in a run, can't be bought, not listed; its price is refunded ONCE (backups
//       of both saves first); two devices that refund while apart, merged, end with the refund paid once (reconcile); a
//       rollback takes this device's refund back and it is never paid again
//   node overworld/tests/micasurvivor_allmoves_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites.)
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
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8894;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();

// ======================== S. the server (the real handler over sqlite)
{
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const sqls = [];
	const MP_DB = { prepare(sql) { sqls.push(sql); const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
	const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
	const keys = p => sqlite.prepare('SELECT key FROM mp_store ORDER BY key').all().map(r => r.key).filter(k => k.startsWith(p));
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-allmoves-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
		banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const raw = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.86.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return { status: res.status, body: await res.json() };
	};
	const T = {};
	for (const n of ['hosta', 'guestb', 'guestc']) T[n] = (await raw('register', { username: n, password: 'msurv-allmoves-pass-1' })).body.token;
	for (const n of ['guestb', 'guestc']) await raw('add-friend', { username: 'hosta' }, T[n]);
	// ---- S1. lobbies
	const bad = await raw('msurv-lobby-create', { dex: 4, rules: 7 }, T.hosta);
	A(bad.status === 400 && /rules/.test(bad.body.error), 'a base lobby with an unknown ruleset is refused (400)', JSON.stringify(bad));
	const L2 = await raw('msurv-lobby-create', { dex: 4, rules: 2 }, T.hosta);
	const id2 = L2.body.lobby && L2.body.lobby.id;
	A(L2.status === 200 && L2.body.lobby.rules === 2 && row('msurvlobby:' + id2).rules === 2 && L2.body.lobby.dv == null, 'a new client\'s base lobby carries its ruleset (rules 2)', JSON.stringify(L2.body));
	const jOld = await raw('msurv-lobby-join', { id: id2, dex: 1 }, T.guestb);
	A(jOld.status === 409 && /out of date/.test(jOld.body.error) && !/host/.test(jOld.body.error) && row('msurvlobby:' + id2).members.length === 1, 'an OLD client (no rules) can\'t join a new base lobby: 409 "your game is out of date"', JSON.stringify(jOld));
	const jNew = await raw('msurv-lobby-join', { id: id2, dex: 1, rules: 2 }, T.guestb);
	A(jNew.status === 200 && jNew.body.lobby.members.length === 2 && jNew.body.lobby.rules === 2, 'a new client joins it', JSON.stringify(jNew.body));
	await raw('msurv-lobby-update', { id: id2, ready: true }, T.guestb);
	const st = await raw('msurv-lobby-update', { id: id2, start: { seed: 5 } }, T.hosta);
	A(st.status === 200 && st.body.lobby.start && st.body.lobby.start.rules === 2 && st.body.lobby.start.dv == null, 'its start carries the rules (a guest checks them: G.Flow.startCoop)', JSON.stringify(st.body.lobby && st.body.lobby.start));
	await raw('msurv-lobby-leave', { id: id2 }, T.hosta);
	const L1 = await raw('msurv-lobby-create', { dex: 4 }, T.hosta);
	const id1 = L1.body.lobby && L1.body.lobby.id;
	A(L1.status === 200 && L1.body.lobby.rules == null && !('rules' in row('msurvlobby:' + id1)), 'an OLD client\'s base lobby has no rules field (as before)', JSON.stringify(L1.body));
	const jN1 = await raw('msurv-lobby-join', { id: id1, dex: 1, rules: 2 }, T.guestc);
	A(jN1.status === 409 && /host.*out of date/.test(jN1.body.error) && jN1.body.rules === 1, 'a NEW client can\'t join an old host\'s base lobby: 409 "the host is ... out of date"', JSON.stringify(jN1));
	const jO1 = await raw('msurv-lobby-join', { id: id1, dex: 1 }, T.guestc);
	A(jO1.status === 200, 'two old clients still play together (no rules on either side)', JSON.stringify(jO1.body));
	await raw('msurv-lobby-leave', { id: id1 }, T.hosta);
	const LX = await raw('msurv-lobby-create', { dex: 4, mode: 'exp-classic', dv: 15, rules: 2 }, T.hosta);
	const jX = await raw('msurv-lobby-join', { id: LX.body.lobby.id, dex: 1, dv: 15 }, T.guestb);
	const jX2 = await raw('msurv-lobby-join', { id: LX.body.lobby.id, dex: 1, dv: 14, rules: 2 }, T.guestc);
	A(LX.status === 200 && LX.body.lobby.rules == null && jX.status === 200 && jX2.status === 409, 'an Expedition lobby goes by its content version (dv) as before, not by rules', JSON.stringify([LX.body.lobby, jX.status, jX2.status]));
	await raw('msurv-lobby-leave', { id: LX.body.lobby.id }, T.hosta);
	// ---- S2. the boards
	const s2 = await raw('run-score', { mode: 'micasurvivor', time: 600, kills: 900, level: 30, dex: 4, rules: 2 }, T.hosta);
	const s1 = await raw('run-score', { mode: 'micasurvivor', time: 300, kills: 400, level: 20, dex: 4 }, T.guestb);
	const sb = await raw('run-score', { mode: 'micasurvivor', time: 300, kills: 400, level: 20, dex: 4, rules: 3 }, T.guestb);
	const b2 = (row('runboard:micasurvivor:r2') || []).map(e => e.name), b1 = (row('runboard:micasurvivor') || []).map(e => e.name);
	A(s2.status === 200 && s1.status === 200 && sb.status === 400 && JSON.stringify(b2) === '["hosta"]' && JSON.stringify(b1) === '["guestb"]',
		'a base score of the new rules goes to runboard:micasurvivor:r2; an old client\'s (no rules) to the legacy runboard:micasurvivor; an unknown ruleset 400', JSON.stringify({ b2, b1, sb }));
	const rN = await raw('run-leaderboard', { mode: 'micasurvivor', rules: 2 }, T.hosta), rL = await raw('run-leaderboard', { mode: 'micasurvivor' }, T.hosta);
	A(JSON.stringify(rN.body.top.map(e => e.name)) === '["hosta"]' && rN.body.you && rN.body.you.time === 600 && JSON.stringify(rL.body.top.map(e => e.name)) === '["guestb"]' && rL.body.you === null,
		'reads: {rules: 2} -> the new board (your best there); none -> the Legacy board', JSON.stringify([rN.body, rL.body]));
	const cScore = (p, tier = 0) => Math.floor((2 * p.kills + 3 * p.time + p.dmg / 200 + 1500 * (p.zone - 1) + 800 * p.bosses + (p.won ? 6000 : 0) + 400 * p.catches) * (1 + 0.5 * tier));
	const sScore = (p, tier = 0) => Math.floor((2 * p.kills + 4 * p.time + p.dmg / 200 + 800 * p.bosses + 2000 * p.legends + 400 * p.catches) * (1 + 0.5 * tier));
	const cp = { kills: 2600, time: 1380, dmg: 900000, zone: 4, bosses: 4, won: true, catches: 1 }, sp = { kills: 1900, time: 1000, dmg: 600000, bosses: 3, legends: 1, catches: 0 };
	const e15 = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 15, map: 'viridian', diff: 'normal', level: 30, dex: 1, ...cp, score: cScore(cp) }, T.hosta);
	const e14 = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 14, map: 'viridian', diff: 'normal', level: 30, dex: 1, ...cp, score: cScore(cp) }, T.guestb);
	const v15 = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-survival', dv: 15, map: 'viridian', diff: 'normal', level: 30, dex: 1, ...sp, score: sScore(sp) }, T.hosta);
	const v14 = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-survival', dv: 14, map: 'viridian', diff: 'normal', level: 30, dex: 1, ...sp, score: sScore(sp) }, T.guestb);
	const names = k => (row(k) || []).map(e => e.name).join(',');
	const seasonNew = keys('msurvseason:').filter(k => /:r2:viridian:normal$/.test(k)), seasonOld = keys('msurvseason:').filter(k => /^msurvseason:\d+:viridian:normal$/.test(k));
	A(e15.status === 200 && e14.status === 200 && v15.status === 200 && v14.status === 200 && e15.body.board === 'micasurvivor_expedition:r2:viridian:normal' && e14.body.board === 'micasurvivor_expedition:viridian:normal'
		&& names('runboard:micasurvivor_expedition:r2:viridian:normal') === 'hosta' && names('runboard:micasurvivor_expedition:viridian:normal') === 'guestb'
		&& names('runboard:micasurvivor_expedition:r2:viridian:normal:time') === 'hosta' && names('runboard:micasurvivor_expedition:viridian:normal:time') === 'guestb'
		&& names('runboard:micasurvivor_expedition:r2:viridian:normal:survival') === 'hosta' && names('runboard:micasurvivor_expedition:viridian:normal:survival') === 'guestb'
		&& seasonNew.length === 1 && names(seasonNew[0]) === 'hosta' && seasonOld.length === 1 && names(seasonOld[0]) === 'guestb',
		'Expedition: a dv-15 run ranks on the new boards (...:r2:<map>:<diff>, :time, :survival, the season ...:r2:<map>:<diff>); a dv-14 run on the legacy ones', JSON.stringify({ e15: e15.body.board, e14: e14.body.board, keys: keys('runboard:micasurvivor_expedition').concat(keys('msurvseason:')) }));
	const rd = async (body, who) => (await raw('run-leaderboard', Object.assign({ mode: 'micasurvivor_expedition', map: 'viridian', diff: 'normal' }, body), T[who])).body;
	const xr = [await rd({ rules: 2 }, 'hosta'), await rd({}, 'hosta'), await rd({ rules: 2, board: 'time' }, 'hosta'), await rd({ board: 'survival' }, 'hosta'), await rd({ rules: 2, board: 'survival' }, 'hosta')];
	A(xr[0].top.map(e => e.name).join() === 'hosta' && xr[0].you && xr[1].top.map(e => e.name).join() === 'guestb' && !xr[1].you && xr[2].top.map(e => e.name).join() === 'hosta' && xr[3].top.map(e => e.name).join() === 'guestb' && xr[4].top.map(e => e.name).join() === 'hosta',
		'Expedition reads: {rules: 2} -> the new boards (score, time, survival), none -> Legacy', JSON.stringify(xr.map(x => x.top && x.top.map(e => e.name))));
	A(!sqls.some(q => /LIKE/i.test(q) && /runboard|msurvseason/.test(q)) && sqls.filter(q => /LIKE/i.test(q)).length === 0, 'every board read / write is an exact key (no LIKE in any statement of these actions)', sqls.filter(q => /LIKE/i.test(q)).slice(0, 3).join(' | '));
}

// ======================== the browser
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'gacha' }, 4: { at: 1, from: 'starter' }, 7: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {},
};
const BEFORE = (o) => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', o.dev);
		localStorage.setItem('micasurvivorexp_dev.guest', o.xdev);
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.save));
		if (o.xsave && !localStorage.getItem('micasurvivorexp_save.guest')) localStorage.setItem('micasurvivorexp_save.guest', JSON.stringify(o.xsave));
	} catch (e) { /* the test reports a boot failure */ }
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) G.Game.debugStep(1, dt); };
	H.key = code => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); G.Game.debugStep(1, 1 / 30); dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); G.Game.debugStep(1, 1 / 30); };
	/** a sturdy player: hurts are counted, not taken; no XP (no level-up screen) */
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = function () {}; pl.gainXp = () => 0; return pl; };
	H.wipe = () => { for (const e of G.EnemyMgr.all()) e.remote = true; G.EnemyMgr.clear(); G.Projectiles.clearOrbs(); if (G.Combat.clearFields) G.Combat.clearFields(); };
	const DUMMY = [7, 1, 4, 10, 74, 63];
	/** 12 still dummies with ~infinite HP round the player; the spawner off while H.calm is set */
	H.dummies = () => {
		H.wipe();
		const pl = G.Game.player;
		for (let i = 0; i < 12; i++) {
			const a = i / 12 * 6.2832, r = 70 + (i % 3) * 60;
			const e = new G.Enemy({ dex: DUMMY[i % DUMMY.length], hp: 1e9, spd: 0, dmg: 0, xp: 0, behavior: 'chase' }, pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r, { hp: 1, spd: 0, dmg: 0 });
			e.spd = 0; e.dmg = 0; H.addReal(e);
		}
	};
	H.calm = () => {
		if (!H.addReal) { H.addReal = G.EnemyMgr.add.bind(G.EnemyMgr); G.EnemyMgr.add = function (e) { return H.calmOn ? null : H.addReal(e); }; }
		H.calmOn = true;
	};
	/** count the casts of every move (by id) over `secs`, the player held still */
	H.casts = (secs) => {
		const pl = G.Game.player, n = {};
		const orig = pl.cast;
		pl.cast = function (m) { if (m && m.id) n[m.id] = (n[m.id] || 0) + 1; return orig.call(this, m); };
		const x0 = pl.x, y0 = pl.y;
		for (let i = 0; i < Math.round(secs * 30); i++) { pl.x = x0; pl.y = y0; for (const e of G.EnemyMgr.all()) { e.kx = 0; e.ky = 0; } G.Game.debugStep(1, 1 / 30); }
		pl.cast = orig;
		return n;
	};
	/** n moves of the partner's pool of distinct kinds (no buff, no orbit: a buff / orbit casts differently) */
	H.giveMoves = (n) => {
		const pl = G.Game.player, kinds = new Set(pl.moves.map(m => m.kind));
		for (const id of G.Moves.poolFor(pl.mon)) {
			if (pl.slots.length >= n) break;
			const k = G.Moves.BY_ID[id].kind;
			if (pl.hasMove(id) || k === 'buff' || k === 'orbit' || kinds.has(k)) continue;
			if (pl.addMove(id)) kinds.add(k);
		}
		for (const id of G.Moves.poolFor(pl.mon)) {   // (a pool with fewer kinds: any attack)
			if (pl.slots.length >= n) break;
			const k = G.Moves.BY_ID[id].kind;
			if (!pl.hasMove(id) && k !== 'buff' && k !== 'orbit') pl.addMove(id);
		}
		return pl.slots.map(g => g.map(m => m.id));
	};
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage(o = {}) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, Object.assign({ dev: 'dallmv01', xdev: 'allmv1', save: SAVE }, o));
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
		await page.evaluate(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		return { ctx, page, menu };
	}
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };

	// ======================== B. base
	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const b1 = await E(page, () => {
		const H = window.__t;
		G.Flow.play('normal');
		H.freeze(); H.sturdy(); H.calm();
		const pl = G.Game.player;
		const slots = H.giveMoves(4);
		H.dummies();
		const n = H.casts(8);
		const cds = pl.moves.map(m => [m.id, m.cd * pl.cdMul]);
		// an OLD puppet's rule (af false): only the active slot fires
		pl.af = false; pl.active = 2;
		for (const g of pl.slots) for (const m of g) m.t = 0;
		const old = H.casts(4);
		pl.af = true; pl.active = 0;
		return { state: G.Game.state, af: pl.af, k: pl.afDmg, AF: G.Combat.AF, slots, n, cds, old, slot2: pl.slots[2][0].id };
	});
	const nMoves = b1.slots ? b1.slots.length : 0;
	A(b1.state === 'playing' && nMoves === 4 && b1.af === true && b1.k === b1.AF.DMG, 'a base Normal run: 4 move slots, all-fire on (pl.af), the base move-damage factor (G.Combat.AF.DMG)', JSON.stringify(b1));
	const fired = b1.cds ? b1.cds.filter(([id, cd]) => (b1.n[id] || 0) >= Math.max(2, Math.floor(8 / Math.max(cd, 0.05) * 0.4))) : [];
	A(fired.length === 4, 'EVERY move fires on its own cooldown (8 s on a dummy ring: each cast at least 40 % of 8 s / its cooldown, at least twice)', JSON.stringify({ n: b1.n, cds: b1.cds }));
	A(b1.old && Object.keys(b1.old).length === 1 && b1.old[b1.slot2] > 0, 'an old tape\'s puppet (af false) fires only its active slot, as before', JSON.stringify(b1.old));
	// B2: keys and pad do not switch
	const b2 = await E(page, () => {
		const H = window.__t, pl = G.Game.player, seen = [];
		for (const k of ['Digit2', 'Digit3', 'Digit4', 'Numpad2', 'KeyQ', 'KeyE', 'Tab']) { H.key(k); seen.push(pl.active + ':' + G.Game.state); }
		pl.setActive(3); pl.cycle(1);
		seen.push('set:' + pl.active);
		const n = H.casts(6);
		// the HUD: no tap-to-switch buttons for an all-fire player; an old tape's puppet keeps them
		const c = document.createElement('canvas').getContext('2d');
		const count = () => { G.HUD.draw(c, 1280, 720, pl, G.Game.st); return G.Touch.buttonList().length; };
		const withAll = count(); pl.af = false; const withOld = count(); pl.af = true;
		return { seen, n, withAll, withOld };
	});
	A(b2.seen && b2.seen.every(s => /^(0:playing|set:0)$/.test(s)), 'keys 1-4 / numpad / Q / E / Tab (and setActive / cycle) switch nothing: the active slot stays 0, the run plays on', JSON.stringify(b2.seen));
	A(b2.n && Object.keys(b2.n).length === 4, '...and all 4 moves keep firing', JSON.stringify(b2.n));
	A(b2.withOld - b2.withAll === nMoves, `the HUD has no tap-to-switch buttons in an all-fire run (${b2.withAll} buttons vs ${b2.withOld} for an old tape's look)`, JSON.stringify(b2));
	// B3: the Choice Band
	const b3 = await E(page, () => {
		const H = window.__t, pl = G.Game.player;
		H.wipe();
		const e = new G.Enemy({ dex: 7, hp: 1e9, spd: 0, dmg: 0, xp: 0, behavior: 'chase' }, pl.x + 400, pl.y, { hp: 1, spd: 0, dmg: 0 }); H.addReal(e);
		const crit = pl.critChance; pl.critChance = 0;
		const hit = id => { const before = e.hp; G.Combat.land(e, 100, '#fff', 1, 0, 0, { mid: id, mtype: 'normal', mkind: 'projectile' }, false, pl); return Math.round((before - e.hp) * 1000) / 1000; };
		const ids = pl.slots.map(g => g[0].id), atk0 = pl.atkMul;
		const plain = ids.map(hit);
		pl.equip('choiceband', 1);
		const band = ids.map(hit), atk1 = pl.atkMul, item = hit(null);
		pl.equip(null, 1);
		pl.critChance = crit;
		return { plain, band, atk0, atk1, item, k: G.Combat.afK(pl, { mid: ids[0] }), desc: G.Items.BY.choiceband.desc };
	});
	const ratio = b3.plain ? b3.band.map((v, i) => Math.round(v / b3.plain[i] * 1000) / 1000) : [];
	A(ratio[0] === 1.4 && ratio.slice(1).every(r => r === 0.8) && b3.atk1 === b3.atk0, 'the Choice Band: +40 % on the slot-1 move\'s hits, -20 % on the others (G.Combat.land), and no stat bonus any more', JSON.stringify({ ratio, b3 }));
	A(/hueco 1/.test(b3.desc || ''), 'its text says so', b3.desc);
	// B4: a bond fuses, the freed slot is offered and filled, and all 5 fire
	const b4 = await E(page, () => {
		const H = window.__t, pl = G.Game.player;
		const a = pl.slots[1][0], b = pl.slots[2][0];
		pl.bonds = 1;
		const g = pl.fuse([a, b]);
		const after = { slots: pl.slots.length, moves: pl.moves.length, group: g.map(m => m.id), active: pl.active, bonds: pl.bonds };
		const cards = G.LevelUp.offer(pl, 40);
		const nw = cards.filter(c => c.type === 'new'), atk = nw.find(c => !['buff', 'orbit'].includes(G.Moves.BY_ID[c.key.slice(4)].kind));
		if (atk) atk.apply(pl);
		const filled = { slots: pl.slots.length, moves: pl.moves.length, sizes: pl.slots.map(s => s.length) };
		const cards2 = G.LevelUp.offer(pl, 40).filter(c => c.type === 'new').length;
		H.dummies();
		const n = H.casts(8);
		const snap = G.Spectate.snap();
		return { after, offered: nw.length, filled, cards2, n, ids: pl.moves.filter(m => m.kind !== 'orbit' && m.kind !== 'buff').map(m => m.id), snap: { af: snap.af, sg: snap.sg, mv: snap.mv.map(m => m[0]), slots: pl.slots.flat().map(m => m.id) } };
	});
	A(b4.after && b4.after.slots === 3 && b4.after.moves === 4 && b4.after.group.length === 2 && b4.after.active === 0 && b4.after.bonds === 0, 'a bond fuses two moves into ONE slot (4 moves in 3 slots)', JSON.stringify(b4.after));
	A(b4.offered > 0 && b4.filled.slots === 4 && b4.filled.moves === 5 && b4.cards2 === 0, 'the freed slot: the level-up offers new moves again, one fills it (5 moves in 4 slots), and then no more (4 SLOTS is the cap)', JSON.stringify(b4));
	A(b4.ids && b4.ids.length === 5 && b4.ids.every(id => b4.n[id] > 0), 'all 5 moves fire (the fused slot\'s two too, each on its own cooldown)', JSON.stringify({ ids: b4.ids, n: b4.n }));
	A(b4.snap && b4.snap.af === 1 && JSON.stringify(b4.snap.sg) === JSON.stringify(b4.filled.sizes) && JSON.stringify(b4.snap.mv) === JSON.stringify(b4.snap.slots), 'a live snapshot carries af = 1 and the fused slots (sg), its moves in slot order', JSON.stringify(b4.snap));
	// B5: melee
	const b5 = await E(page, () => {
		const H = window.__t, pl = G.Game.player;
		H.wipe();
		delete pl.hurt;   // the real hurt (the prototype's)
		const melee = Object.values(G.Moves.BY_ID).find(d => d.kind === 'melee');
		const hit = () => { pl.invuln = 0; pl.hp = pl.maxHp; const h0 = pl.hp; pl.hurt(40); return Math.round((h0 - pl.hp) * 100) / 100; };
		pl.meleeT = 0;
		const d0 = hit();
		pl.cast(G.Moves.instance(melee.id, 1));
		const t = pl.meleeT, d1 = hit();
		H.step(Math.round(30 * 1.6));
		const d2 = hit();
		H.sturdy();
		return { d0, d1, d2, t, id: melee.id };
	});
	A(b5.t === 1.5 && Math.abs(b5.d1 / b5.d0 - 0.75) < 0.02 && Math.abs(b5.d2 - b5.d0) < 0.01, 'melee: -25 % damage taken for 1.5 s after a melee move fires; not before, not after', JSON.stringify(b5));
	// B6: co-op frames
	const b6 = await E(page, () => {
		const pl = G.Game.player;
		const orbits = Object.values(G.Moves.BY_ID).filter(d => d.kind === 'orbit').slice(0, 2).map(d => d.id);
		const hadSlots = pl.slots, hadMoves = pl.moves;
		pl.moves = orbits.map(id => G.Moves.instance(id, 2)); pl.slots = pl.moves.map(m => [m]);
		const row = G.Coop.stateOf(pl);
		pl.moves = hadMoves; pl.slots = hadSlots;
		const p = new G.Player(G.DEX_BY[7], {}, false); p.remote = true;
		p.net = Object.assign(G.Coop.readState(row.slice(0, 15)), { t: performance.now() });
		p.netUpdate(1 / 30);
		const old = p.moves.map(m => m.id + ':' + m.lvl);
		p.net = Object.assign(G.Coop.readState(row), { t: performance.now() });
		p.netUpdate(1 / 30);
		const now = p.moves.map(m => m.id + ':' + m.lvl);
		G.Combat.ghostOrbit(p, 1 / 30, performance.now() / 1000);
		const orbs = [...new Set(G.Projectiles.all().filter(o => o.orb && o.owner === p).map(o => o.mid))];
		G.Projectiles.clearOrbs(p);
		return { len: row.length, f15: row[15], f7: row[7], old, now, orbs, orbits };
	});
	A(b6.len === 16 && JSON.stringify(b6.f15) === JSON.stringify(b6.orbits.map(id => [id, 2])) && b6.f7 === b6.orbits[0], 'a co-op frame\'s field 15 lists EVERY orbit move; fields 7-8 keep one for an old reader', JSON.stringify(b6));
	A(JSON.stringify(b6.old) === JSON.stringify([b6.orbits[0] + ':2']) && JSON.stringify(b6.now) === JSON.stringify(b6.orbits.map(id => id + ':2')) && b6.orbs.length === 2,
		'an OLD frame (15 fields, one move) still reads; a new one gives the puppet both orbit moves, and both show their orbs', JSON.stringify(b6));
	// B7: tapes: a new one, and an old one (no af) made from it
	const b7 = await E(page, async () => {
		const H = window.__t, pl = G.Game.player;
		G.Game.quit();
		const e = G.Replay.last;
		if (!e) return { error: 'no replay' };
		await e.ready;
		const text = await G.Replay.unpack(e.code), data = JSON.parse(text);
		const newH = data.h.af, slowAf = data.f.some(f => f[3] && f[3].af === 1);
		// the old tape: the same, without af / sg anywhere (what a tape recorded before D16 holds)
		const o = JSON.parse(text); delete o.h.af;
		for (const f of o.f) if (f[3] && typeof f[3] === 'object') { delete f[3].af; delete f[3].sg; }
		const oldCode = await G.Replay.pack(JSON.stringify(o));
		const play = async (code) => {
			const rd = await G.Replay.open(code);
			if (!rd) return { error: 'does not open' };
			const n = {};
			const gc = G.Combat.ghostCast;
			G.Combat.ghostCast = function (p, id, ...a) { n[id] = (n[id] || 0) + 1; return gc.call(this, p, id, ...a); };
			G.WatchUI.playReplay(rd, {});
			let steps = 0;
			while (G.WatchUI.playing && steps < 30 * 40) { G.Game.debugStep(1, 1 / 30); steps++; }
			const p = G.Game.player;
			const out = { af: p && p.af, active: p && p.active, slots: p && p.slots.map(g => g.length), n, frames: rd.length, finished: !G.WatchUI.playing };
			G.Combat.ghostCast = gc;
			G.WatchUI.leave && G.WatchUI.leave();
			return out;
		};
		const nw = await play(e.code);
		const old = await play(oldCode);
		// the moves an old viewer may show: each frame's ACTIVE slot (ac) as recorded (B1 kept slot 3 active a while, af off)
		const act = new Set();
		let cur = null;
		for (const f of data.f) { if (f[3] && typeof f[3] === 'object') cur = f[3]; if (cur && cur.mv && cur.mv.length) act.add(cur.mv[Math.min(cur.ac | 0, cur.mv.length - 1)][0]); }
		return { newH, slowAf, nw, old, act: [...act] };
	});
	A(b7.newH === 1 && b7.slowAf, 'a new tape: its header carries h.af = 1 and its frames af', JSON.stringify(b7));
	A(b7.nw && b7.nw.af === true && Object.keys(b7.nw.n).length >= 3 && JSON.stringify(b7.nw.slots) === JSON.stringify(b4.filled.sizes), 'the new tape plays with every move ghosted and the fused slot grouped', JSON.stringify(b7.nw));
	A(b7.old && b7.old.af === false && Object.keys(b7.old.n).length >= 1 && Object.keys(b7.old.n).every(id => b7.act.includes(id)) && b7.act.length < Object.keys(b7.nw.n).length && b7.old.slots.every(s => s === 1),
		'an OLD tape (no af) plays with its one active move, as it was recorded (only the moves its frames had active)', JSON.stringify(b7));
	await d0.ctx.close();

	// ======================== E. Expedition
	const XS = { v: 1, counters: { 'lab.moveslot': 1, 'lab.skip': 1 }, sets: { 'cur.spend': ['lab.moveslot.0:allmv1', 'lab.skip.0:allmv1'] } };
	const dx = await bootPage({ xsave: XS });
	const px = dx.page;
	const e1 = await E(px, async () => {
		const H = window.__t;
		H.thaw();
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { error: String(ok) };
		await G.ExpSave.open();
		await G.Flow.play('exp-classic');
		H.freeze(); H.sturdy(); H.calm(); H.wipe();
		const pl = G.Game.player, L = G.ExpLeague, X = G.ExpLevel;
		const start = { max: pl.maxMoves, k: pl.afDmg, slots: pl.slots.length, dv: G.Expedition.DV, cdv: G.Exp.dv };
		pl.level = 8; L.process(pl);
		const kit = pl.slots.map(g => g[0].id);
		// a swap: the lowest-level move goes; the new one takes its slot
		G.ExpMoves.levelUp(pl, pl.moves[0], []); G.ExpMoves.levelUp(pl, pl.moves[1], []); G.ExpMoves.levelUp(pl, pl.moves[3], []);
		const cands = X.candidates(pl);
		const news = cands.filter(c => /^new:/.test(c.key)).length, swaps = cands.filter(c => /^swap:/.test(c.key));
		const swapW = Math.round(swaps.reduce((a, c) => a + c.w, 0) * 1000) / 1000;
		const lowId = pl.moves[2].id, lowSlot = pl.slotOf(lowId);
		const card = swaps[0].make(0, () => 0.5);
		card.apply(pl);
		const after = { slots: pl.slots.map(g => g[0].id), has: pl.hasMove(lowId), at: pl.slotOf(card.key.slice(5)), type: card.type };
		H.dummies();
		const n = H.casts(8);
		return { start, kit, news, swaps: swaps.length, swapW, W: X.K.W.swap, lowId, lowSlot, after, n, ids: pl.moves.filter(m => m.kind !== 'orbit' && m.kind !== 'buff' && m.kind !== 'weather').map(m => m.id) };
	});
	A(e1.start && e1.start.max === 4 && e1.start.dv === 17 && e1.start.cdv === 17 && e1.start.k === (await E(px, () => G.Combat.AF.DMG_EXP)), 'Expedition Classic: 4 move slots (no extra slots, no Lab slot), its own all-fire factor; dv 15', JSON.stringify(e1));
	A(e1.kit && e1.kit.length === 4 && e1.news === 0 && e1.swaps > 0 && Math.abs(e1.swapW - e1.W) < 0.01, 'the kit fills the 4 slots by Lv 7; no new-move cards then, only rare swap cards (their whole weight K.W.swap)', JSON.stringify(e1));
	A(e1.after && e1.after.type === 'swap' && !e1.after.has && e1.after.at === e1.lowSlot && e1.after.slots.length === 4, 'a swap card forgets the lowest-level move and the new one takes its slot', JSON.stringify(e1));
	A(e1.ids && e1.ids.length >= 3 && e1.ids.every(id => e1.n[id] > 0), 'every Expedition move fires on its own cooldown', JSON.stringify({ ids: e1.ids, n: e1.n }));
	// E2: the Lab's move slot retired and refunded
	const e2 = await E(px, () => {
		const M = G.ExpMeta, row = M.rowNow([]), eff = M.effects(row);
		const owed = M.refundsOwed(), c0 = G.DB.save.coins;
		G.Game.quit();   // (a run's end refunds, before it pays: meta.js record; this run is too short to pay anything)
		const buy = M.buyLab('moveslot');
		const c1 = G.DB.save.coins;
		const paid = (G.ExpSave.data.counters['rf.paid'] || 0);
		const again = M.refundRetired();
		const bk = Object.keys(localStorage).filter(k => /^micasurvivor_backup\.guest\.exp-refund\./.test(k) || /^micasurvivorexp_backup\.guest\.refund\./.test(k));
		const preBase = bk.find(k => /^micasurvivor_backup/.test(k)), pre = preBase ? JSON.parse(localStorage.getItem(preBase)) : null;
		return { lab: eff.lab.moveslot, skip: eff.lab.skip, buy, owed, c0, c1, paid, again, bk, preCoins: pre && pre.coins, earn: G.ExpSave.list('cur.earn') };
	});
	A(e2.lab === 0 && e2.skip === 1 && e2.buy && e2.buy.error === 'retired', 'the Lab\'s move slot is retired: no effect in a run whatever level the save holds (Skip still works), and it can\'t be bought', JSON.stringify(e2));
	A(JSON.stringify(e2.owed) === '["rf.lab.moveslot.0"]' && e2.paid === 4500 && e2.c1 - e2.c0 >= 4500 && e2.c1 - e2.c0 < 4500 + 1000 && e2.again === 0 && e2.earn.includes('rf.lab.moveslot.0:allmv1'),
		'its price comes back ONCE (4,500 Pokémonedas = the 1,500 x 3 it cost; the run end paid it, with its achievement), recorded as rf.lab.moveslot.0:<device>; a second call pays nothing', JSON.stringify(e2));
	A(e2.bk && e2.bk.length === 2 && e2.preCoins === e2.c0, 'both saves were backed up before the refund wrote (micasurvivor_backup.guest.exp-refund.* with the coins before, micasurvivorexp_backup.guest.refund.*)', JSON.stringify(e2.bk));
	const e2b = await E(px, () => {
		const M = G.ExpMeta;
		M.open(() => {}, 'lab');
		const listed = !!document.querySelector('[data-lab="moveslot"]'), note = (document.getElementById('xm-retired') || {}).textContent || '';
		M.close(true);
		return { listed, note };
	});
	A(e2b.listed === false && /Move slot|Hueco de movimiento/.test(e2b.note), 'League HQ\'s Lab no longer lists it, and says it was retired and refunded', JSON.stringify(e2b));
	await dx.ctx.close();
	// two devices refund while apart, then merge: paid once
	const devA = await bootPage({ dev: 'daaaa001', xdev: 'aaaa01', xsave: XS });
	const devB = await bootPage({ dev: 'dbbbb002', xdev: 'bbbb02', xsave: XS });
	const open = page => E(page, async () => { const ok = await G.Expedition.load().catch(e => String(e)); if (ok !== true) return { error: ok }; await G.ExpSave.open(); const paid = G.ExpMeta.refundRetired(); return { paid, coins: G.DB.save.coins, base: JSON.parse(JSON.stringify(G.DB.save)), exp: JSON.parse(JSON.stringify(G.ExpSave.data)) }; });
	const ra = await open(devA.page), rb = await open(devB.page);
	A(ra.paid === 4500 && rb.paid === 4500, 'two devices apart both pay the refund (4,500 each)', JSON.stringify([ra.paid, rb.paid]));
	const merge = (page, other) => E(page, (o) => {
		const s = G.DB.save, m = G.DB.merge(JSON.parse(JSON.stringify(s)), o.base);
		for (const k of Object.keys(s)) delete s[k];
		Object.assign(s, m);
		const x = G.ExpSave.merge(G.ExpSave.data, o.exp), d = G.ExpSave.data;
		d.counters = x.counters; d.sets = x.sets;
		const moved = G.ExpMeta.reconcile(), paid = G.ExpMeta.refundRetired();
		return { moved, paid, coins: G.DB.save.coins, base: JSON.parse(JSON.stringify(G.DB.save)), exp: JSON.parse(JSON.stringify(G.ExpSave.data)) };
	}, other);
	// (each device's boot also earned its own coins before the refund, e.g. the daily login: both count, once each)
	const want = ra.coins + rb.coins - SAVE.coins - 4500;
	const mb = await merge(devB.page, ra);
	A(mb.moved === -4500 && mb.paid === 0 && mb.coins === want, 'device B merges A\'s save: the second refund is clawed back once (reconcile), the balance holds ONE refund of 4,500: paid once per account', JSON.stringify({ moved: mb.moved, paid: mb.paid, coins: mb.coins }));
	const ma = await merge(devA.page, mb);
	A(ma.moved === 0 && ma.paid === 0 && ma.coins === want, 'device A then merges B\'s: nothing moves, the same balance', JSON.stringify({ moved: ma.moved, paid: ma.paid, coins: ma.coins }));
	const mb2 = await merge(devB.page, ma);
	A(mb2.moved === 0 && mb2.paid === 0 && mb2.coins === want, 'and merging again changes nothing (idempotent)', JSON.stringify({ moved: mb2.moved, coins: mb2.coins }));
	const rbk = await E(devA.page, () => { const took = G.ExpMeta.rollbackRefunds(); const c = G.DB.save.coins; const again = G.ExpMeta.refundRetired(); const twice = G.ExpMeta.rollbackRefunds(); return { took, c, again, twice, coins: G.DB.save.coins }; });
	A(rbk.took === 4500 && rbk.c === want - 4500 && rbk.again === 0 && rbk.twice === 0, 'a rollback takes this device\'s refund back and it is never paid again', JSON.stringify(rbk));
	await devA.ctx.close(); await devB.ctx.close();

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
