// micasurvivor_replay_v2_test.mjs — MicaSurvivor U4: unified replays, format v2 (Plans/MICASURVIVOR_UNIFIED_PLAN.md "U4";
// micasurvivor/js/mica/replay.js, js/ui/watch-ui.js, server/mp.mjs micasurvivor-replay-put / -get / -keep). Headless Chrome
// against the REAL server handler (bundled, over an in-memory sqlite D1), fast-forwarded with G.Game.debugStep:
//   1. a 45-minute base run (Normal, signed in): one tape per SESSION cut into 5-minute SEGMENTS, each packed under the
//      1.2 MB cap and each starting with a keyframe (the closing frame of one = the opening frame of the next); they upload
//      in the background as the run goes (msurvsess:<id> + msurvseg:<id>:<n>); Share keeps the session; the viewer seeks
//      across segments (by segment, then checkpoint: fast) and plays a public link that fetches segments on demand
//   2. a deep Dive (60 floors): a segment per 10 floors; every floor 1-60 is in the tape and plays back
//   3. a 4-player session (you + 3 local partners): every player's row and casts are recorded; the viewer follows any of
//      them (setFollow / F key / LB-RB), draws every player's casts as ghosts and names the partners
//   4. online co-op (alice hosts, bob joins over WebRTC): the HOST's tape has bob's row and his casts; bob's own tape stays
//      local (a guest never uploads in the background)
//   5. the session cap: past it the tape ends with an explicit marker and the viewer says "The replay ends here"
//   6. v1 tapes still play (the golden fixture's, and a v1 entry kept in the browser)
//   node overworld/tests/micasurvivor_replay_v2_test.mjs      (ONLY=1,3 runs those sections)
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9663;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const on = k => !ONLY.length || ONLY.includes(String(k));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }
const T0 = Date.now();
const CAP = 1200000;

// ---------- the real server over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE)/i.test(sql) && Number(r.changes) > 0) writes.push(String(bound[0])); return r; }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const keys = p => sqlite.prepare('SELECT key FROM mp_store WHERE key LIKE ?').all(p + '%').map(r => r.key);
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-rv2-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.81.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {}, states = {};
for (const n of ['alice', 'bob']) { const r = (await raw('register', { username: n, password: 'msurv-rv2-pass-1' })).body; tokens[n] = r.token; states[n] = r.state || (await raw('state', {}, r.token)).body.state; }
await raw('add-friend', { username: 'alice' }, tokens.bob);
await raw('add-friend', { username: 'bob' }, tokens.alice);
for (const n of ['alice', 'bob']) states[n] = (await raw('state', {}, tokens[n])).body.state || states[n];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
let ipS = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let body = ''; for await (const c of req) body += c;
		// (each request its own IP: the per-IP public-read limit is not what this suite measures)
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.82.' + (1 + (ipS >> 8 & 0xff)) + '.' + (1 + (ipS++ & 0xff)), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = name => ({
	v: 3, name, created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'starter' }, 4: { at: 1, from: 'gacha' }, 7: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' }, 133: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	pupg: { 4: { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 } }, stats: {},
});

const BEFORE = (o) => {
	const H = window.__t = { frozen: false, pending: null };
	try {
		localStorage.setItem('micasurvivor_dev', JSON.stringify('rv2' + (o.user || 'view').slice(0, 4)));
		localStorage.setItem('micasurvivor_lang', 'en');
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			if (o.user && o.token) {
				localStorage.setItem('magepunk_mp_token_v1', o.token);
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
				localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
				localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));
			} else {
				localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
				localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
				localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.save));
			}
		}
	} catch (e) { /* the test reports a boot failure */ }
	window.__msurvNet = Object.assign({ ice: [], lostMs: 15000, directMs: 8000, invMs: 1200, friendsMs: 1500 }, o.net || {});
	// real animation frames off while the test steps the game (debugStep); on again for a live co-op run
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
	H.key = c => { key('keydown', c); key('keyup', c); };
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = () => {}; pl.invuln = 1e9; return pl; };
	let f = 0;
	/** one step: level-ups / choices answered like a player, a strong player's KOs (a few a second round you) */
	H.tick = (dt, noKo) => {
		f++;
		const st = G.Game.state;
		if (st === 'levelup') H.key('Digit1');
		if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.pick.at = 0; if (['friend', 'shop', 'hypno'].includes(G.ExpEco.pick.kind)) G.ExpEco.closePick(); else G.ExpEco.choose(0); }
		if (st === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
		G.Game.debugStep(1, dt);
		if (!noKo && f % Math.round(1 / dt / 3) === 0) {
			const pl = G.Game.player; if (!pl) return;
			const near = G.EnemyMgr.all().filter(e => !e.dead && !e.boss && Math.hypot(e.x - pl.x, e.y - pl.y) < 320);
			if (near.length) { const e = near[f % near.length]; e.hurt(e.maxHp * 20, '#fff'); }
		}
	};
	// Dive (micasurvivor_dive_test's helpers)
	H.wpos = p => { const z = G.World.zone, TS = G.World.TS; return [(p[0] + z.x0) * TS + TS / 2, (p[1] + z.y0) * TS + TS / 2]; };
	H.put = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; G.Camera.x = x; G.Camera.y = y; };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.xk && !e.dead) { e.dead = true; e.fade = 0; } };
	H.toStairs = () => { const L = G.World.zone.dive, [x, y] = H.wpos(L.stairs); H.put(x, y); };
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { try { G.ExpEco.closePick(); } catch (e) { /* */ } }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
		if (G.Game.state === 'levelup') H.key('Digit1');
	};
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { H.unblock(); if (G.Game.state === 'over' || G.Game.state === 'ui') return i; G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i + 1; } return n; };
	H.downTo = fl => {
		let n = 0;
		while (G.ExpDive.run && G.ExpDive.run.floor < fl && n++ < 2000) {
			H.thin();
			const S = G.ExpDive.run;
			if (S.boss && !S.boss.dead) { S.boss.hurt(S.boss.maxHp * 2); H.step(2); }
			const f0 = S.floor;
			// (a few seconds on each floor, so it is in the tape: then the stairs)
			H.step(90, 1 / 30);
			H.thin(); if (S.boss && !S.boss.dead) { S.boss.hurt(S.boss.maxHp * 2); H.step(2); }
			H.toStairs(); H.step(30, 1 / 30, () => { if (G.ExpDive.run.floor !== f0) return false; H.toStairs(); });
		}
		return G.ExpDive.run && G.ExpDive.run.floor;
	};
	/** every frame of every segment of an entry, decoded: fn(snapshot, segment index, frame index, reader) */
	H.scan = async (entry, fn, follow) => {
		const out = [];
		for (let k = 0; k < entry.segs.length; k++) {
			const rd = await G.Replay.open(entry.segs[k]);
			if (!rd) { out.push(null); continue; }
			out.push(rd);
			for (let i = 0; i < rd.length; i++) fn(rd.at(i, follow), k, i, rd);
		}
		return out;
	};
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 1800000,
		args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--mute-audio'] });
	async function bootPage(o, query = '') {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, o);
		const who = o.user || 'viewer';
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|403|404|409|429)/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/${query}`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = query ? true : await waitFor(() => visible('scr-menu'), 15000);
		await page.evaluate(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		const E = async (fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 600) }; } };
		return { ctx, page, menu, visible, E, who };
	}

	// ======================== 1. a 45-minute base run, signed in: segments, background upload, seeking, the public link
	let shareId = null;
	if (on(1)) {
		const al = await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') });
		A(al.menu, 'alice boots signed in to the menu', errors.slice(-3).join(' | '));
		const run = await al.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			await G.Flow.play('normal'); H.freeze(); H.sturdy();
			const dt = 1 / 20, t0 = performance.now(), seen = [];
			let guard = 0;
			while (G.Game.state !== 'over' && G.Game.st.time < 2700 && guard++ < 80000) {
				H.tick(dt);
				if (G.Game.player && G.Game.player.hurt.name !== 'hurt') H.sturdy();
				const z = G.Replay.size;
				if (z && seen[seen.length - 1] !== z.segs) seen.push(z.segs);
				if (guard % 4000 === 0) await wait(30);   // (the background packing and uploads run)
			}
			const mid = G.Replay.size;
			const out = { t: Math.round(G.Game.st.time), state: G.Game.state, kills: G.Game.player.kills, mid, seen: seen.slice(0, 20), ms: Math.round(performance.now() - t0) };
			G.Game.quit(); await wait(300);
			const e = G.Replay.last;
			await e.ready; if (e.upload) await e.upload;
			out.rid = e.rid; out.n = e.segs.length; out.sizes = e.segs.map(c => c.length); out.idx = e.idx; out.meta = e.meta; out.id = e.id; out.bg = e.bg; out.code = e.code;
			out.raw = e.raw;
			// each segment: a self-contained tape {v:2}; its first frame a keyframe equal to the previous one's last frame
			const rds = [];
			for (const c of e.segs) rds.push(await G.Replay.open(c));
			const key = s => JSON.stringify([s.t, s.p, s.lv, s.k, s.bo, s.co, s.mv, s.e.map(x => x.slice(0, 7)).sort((a, b) => a[0] - b[0]), s.pk.slice().sort((a, b) => a[0] - b[0])]);
			out.open = rds.map(r => !!r && r.v === 2 && r.h.seg != null);
			out.joins = rds.slice(1).map((r, k) => key(rds[k].at(rds[k].length - 1)) === key(r.at(0)));
			out.hdr = rds.map(r => r && [r.h.v, r.h.seg, r.h.sid === e.rid, (r.h.players || []).length, !!r.h.end]);
			out.dur = rds.map(r => r && [r.t0, r.duration]);
			// the first frame of a later segment decodes alone (absolute values: no previous state)
			const raw = JSON.parse(await G.Replay.unpack(e.segs[Math.min(3, e.segs.length - 1)]));
			out.kf = { dt: raw.f[0][0], hasP: Array.isArray(raw.f[0][1]) && raw.f[0][1].length === 7 && raw.f[0][1][5] > 0, hasS: !!raw.f[0][3] };
			return out;
		});
		console.log(`     45-min base run: ${run.t} s simulated, ${run.kills} KOs, ${run.n} segments ${JSON.stringify(run.sizes)} packed chars (raw ${run.raw}), ${run.meta && run.meta.frames} frames (sim ${run.ms} ms)`);
		A(run.t >= 2700 && run.n >= 9 && run.n <= 11, 'a 45-minute Normal run records 9-10 segments (one per 5 minutes of run time)', JSON.stringify({ t: run.t, n: run.n, seen: run.seen, err: run.error }));
		A(run.sizes && run.sizes.every(n => n > 0 && n < CAP), 'every segment packs under the 1.2 MB cap (MSURV_REPLAY_MAX)', JSON.stringify(run.sizes));
		A(run.open && run.open.every(Boolean) && run.hdr.every((h, k) => h[0] === 2 && h[1] === k && h[2] && h[3] === 1 && h[4] === (k === run.n - 1)), 'each segment is a v2 tape of its own: header {v:2, sid, seg, players}; only the last carries the summary', JSON.stringify(run.hdr));
		A(run.joins && run.joins.length === run.n - 1 && run.joins.every(Boolean), 'consecutive segments meet exactly: the closing frame of one is the opening KEYFRAME of the next', JSON.stringify(run.joins));
		A(run.kf && run.kf.dt > 1000 && run.kf.hasP && run.kf.hasS, 'a later segment\'s first frame is absolute (run time, position, slow state): it decodes with no earlier segment', JSON.stringify(run.kf));
		A(run.idx && run.idx.every((x, k) => x.seg === k && x.t1 > x.t0 && (k === 0 || Math.abs(x.t0 - run.idx[k - 1].t1) < 0.01) && x.t1 - x.t0 <= 301), 'the segment index: [{seg, t0, t1, n, bytes}], ~300 s each, back to back', JSON.stringify(run.idx && run.idx.map(x => [x.seg, x.t0, x.t1])));
		// the background upload: the session row and every segment on the server (the host is signed in)
		const sessKey = 'msurvsess:' + run.id;
		const sess = run.id && row(sessKey);
		A(!!sess && sess.by === 'alice' && sess.done && sess.idx.length === run.n && run.idx.every((x, k) => row('msurvseg:' + run.id + ':' + k) && sess.idx[k].n === x.n),
			'the segments uploaded in the background as the run went: msurvsess:<id> (the index, done) + msurvseg:<id>:<n> for each', JSON.stringify(sess && { idx: sess.idx.length, done: sess.done, keys: keys('msurvseg:' + run.id).length }));
		const lst = row('msurvreplays:alice');
		A(lst && lst.ids.some(e => e.id === run.id && e.v === 2 && e.bg), 'her replay list holds the session as ONE entry, marked background (not shared yet)', JSON.stringify(lst));
		A(sess && sess.meta && sess.meta.segs === run.n && sess.meta.frames === run.meta.frames && sess.meta.time >= 2700 && sess.end && sess.end.time >= 2700, 'the session row\'s meta and summary: segments, frames, time', JSON.stringify(sess && { meta: sess.meta, end: sess.end }));
		// Share: the session is kept (no new upload)
		const w0 = writes.length;
		const sh = await al.E(rid => G.Replay.share(rid), run.rid);
		shareId = sh.id;
		A(sh.ok && sh.id === run.id && /\/msr\/[a-f0-9]{8}$/.test(sh.link), 'Share on an uploaded session: its link at once (/msr/<id>)', JSON.stringify(sh));
		A(!row('msurvreplays:alice').ids.find(e => e.id === run.id).bg && writes.slice(w0).every(k => k === 'msurvreplays:alice' || k.startsWith('rl:')), '...it is kept (no longer "background"), with no segment uploaded again', JSON.stringify(writes.slice(w0)));
		// the local copy: kept within the budget (an uploaded session too big for it keeps its id)
		const loc = await al.E(() => G.Replay.local().map(e => ({ rid: e.rid, id: e.id, segs: e.segs ? e.segs.length : 0, remote: !!e.remote, size: JSON.stringify(e).length })));
		A(loc[0] && loc[0].rid === run.rid && loc[0].id === run.id && loc[0].size < 1300000, 'the copy in her browser stays within the budget (whole, or its id + index when it is uploaded)', JSON.stringify(loc));
		// playback: seeking across segments (by segment, then the nearest checkpoint; never a rescan from the start)
		const pb = await al.E(async () => {
			const H = window.__t, e = G.Replay.last;
			await G.WatchUI.playLocal(e, () => {});
			const S = G.WatchUI.session, out = { segs: S.segs.length, dur: Math.round(S.duration), seeks: [] };
			for (const t of [2600, 30, 1510, 905, 2699, 299.9, 300.1, 1200]) {
				const t0 = performance.now();
				G.WatchUI.seek(t);
				const ms = performance.now() - t0;
				const fr = G.WatchUI.frame;
				out.seeks.push({ t, seg: G.WatchUI.segment, want: S.segAt(t), ft: fr ? fr.t / 10 : null, ms: Math.round(ms * 10) / 10, pl: !!G.WatchUI.player });
			}
			// play on across a segment boundary
			G.WatchUI.seek(S.segs[1].t0 - 3);
			const s0 = G.WatchUI.segment;
			for (let i = 0; i < 300; i++) G.Game.debugStep(1, 1 / 30);
			out.cross = { from: s0, to: G.WatchUI.segment, T: G.WatchUI.T, playing: G.WatchUI.playing, p: !!G.WatchUI.player };
			G.WatchUI.leave();
			return out;
		});
		A(pb.segs === run.n && pb.dur >= 2700, 'the local session plays: every segment, the run\'s length', JSON.stringify(pb).slice(0, 300));
		A(pb.seeks && pb.seeks.every(s => s.seg === s.want && s.ft != null && s.ft <= s.t + 0.01 && s.t - s.ft < 1.01 && s.pl), 'seeking forwards and back across segments lands on the right segment and the frame at that time', JSON.stringify(pb.seeks));
		A(pb.seeks && Math.max(...pb.seeks.map(s => s.ms)) < 120, 'each seek is fast (the segment, then its nearest checkpoint)', JSON.stringify(pb.seeks.map(s => s.ms)));
		A(pb.cross && pb.cross.from === 0 && pb.cross.to === 1 && pb.cross.playing && pb.cross.p, 'playing on crosses into the next segment without a stop', JSON.stringify(pb.cross));
		await al.ctx.close();
		// the public link: a fresh page with no account loads the index, then the segments it needs
		const carl = await bootPage({ save: SAVE('carl') }, '?replay=' + shareId);
		const ok = await waitFor(() => carl.E(() => G.WatchUI.mode === 'replay' && !!G.WatchUI.session && !!G.WatchUI.player), 20000);
		const pub = await carl.E(async () => {
			const S = G.WatchUI.session, out = { segs: S.segs.length, loaded0: S.loaded, by: S.h.by };
			G.WatchUI.seek(2000);
			for (let i = 0; i < 100 && G.WatchUI.loading != null; i++) await new Promise(r => setTimeout(r, 60));
			out.at2000 = { seg: G.WatchUI.segment, t: G.WatchUI.frame && G.WatchUI.frame.t / 10, loaded: S.loaded, segLoads: G.WatchUI.stats.segLoads };
			return out;
		});
		A(ok && pub.segs === run.n && pub.loaded0 <= 2 && pub.by === 'alice', 'the shared link opens with no account: the session index, only the first segment(s) fetched', JSON.stringify(pub));
		A(pub.at2000 && pub.at2000.seg === Math.floor(2000 / 300) && Math.abs(pub.at2000.t - 2000) < 1.1 && pub.at2000.loaded <= 4, 'a seek far ahead fetches that segment on demand and shows the frame there', JSON.stringify(pub.at2000));
		await carl.ctx.close();
	}

	// ======================== 2. a deep Dive: 60 floors, a segment per 10, every floor in the tape
	if (on(2)) {
		const dv = await bootPage({ save: SAVE('Trainer') });
		const dive = await dv.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
			const t0 = performance.now();
			const reached = H.downTo(60);
			H.step(60, 1 / 30);
			const out = { reached, t: Math.round(G.Game.st.time), ms: 0 };
			G.Game.quit(); await wait(300);
			const e = G.Replay.last; await e.ready;
			out.ms = Math.round(performance.now() - t0);
			out.n = e.segs.length; out.sizes = e.segs.map(c => c.length); out.frames = e.meta.frames;
			const floors = new Set(), perSeg = [];
			await H.scan(e, (s, k) => { const z = s.x && s.x.z; if (z) { floors.add(z); (perSeg[k] = perSeg[k] || new Set()).add(z); } });
			out.floors = [...floors].sort((a, b) => a - b);
			out.perSeg = perSeg.map(x => x ? [Math.min(...x), Math.max(...x)] : null);
			// playback: seek to floor 47's time and see floor 47 rebuilt
			const S = await G.Replay.openEntry(e);
			let t47 = null;
			for (let k = 0; k < S.segs.length && t47 == null; k++) { const rd = S.get(k); for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.z === 47) { t47 = rd.times[i] + 0.2; break; } } }
			G.WatchUI.playReplay(S, {});
			G.WatchUI.togglePlay();
			G.WatchUI.seek(t47);
			for (let i = 0; i < 80 && !(G.World.zone && G.World.zone.zone === 47); i++) await wait(100);
			out.view47 = { t47, zone: G.World.zone && G.World.zone.zone, map: G.World.zone && G.World.zone.map, seg: G.WatchUI.segment };
			G.WatchUI.leave();
			return out;
		});
		console.log(`     deep Dive: floor ${dive.reached} in ${dive.t} s of run, ${dive.n} segments ${JSON.stringify(dive.sizes)} packed chars, ${dive.frames} frames (sim ${dive.ms} ms)`);
		A(dive.reached >= 60, 'the Dive reaches floor 60 (fast-forwarded: thin, beat the alphas / guardians, the stairs)', JSON.stringify(dive).slice(0, 300));
		A(dive.n >= 6 && dive.perSeg && dive.perSeg.every((r, k) => r && r[1] - r[0] <= 10), 'a segment per 10 floors (each segment spans at most one floor group, plus the floor that opened the next)', JSON.stringify(dive.perSeg));
		A(dive.floors && dive.floors.length >= 60 && [...Array(60).keys()].every(i => dive.floors.includes(i + 1)), 'every floor 1-60 is in the tape', JSON.stringify(dive.floors));
		A(dive.sizes && dive.sizes.every(n => n < CAP), 'every Dive segment packs under the cap', JSON.stringify(dive.sizes));
		A(dive.view47 && dive.view47.zone === 47 && /^dive:/.test(dive.view47.map || ''), 'the viewer seeks to floor 47 and rebuilds that floor', JSON.stringify(dive.view47));
		await dv.ctx.close();
	}

	// ======================== 3. a 4-player session: you + 3 local partners; follow anyone
	if (on(3)) {
		const lc = await bootPage({ save: SAVE('Trainer') });
		const four = await lc.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			G.LocalCoop.setPlayers(4, []);
			await G.Flow.play('normal'); H.freeze(); H.sturdy();
			const ran = G.LocalCoop.ran;
			for (const M of G.LocalCoop.rows) { M.pl.hurt = () => {}; M.pl.invuln = 1e9; }
			// every real cast, counted on the players themselves (Player.cast with a move id; the orb pulse has none)
			const real = [0, 0, 0, 0];
			[G.Game.player, ...G.LocalCoop.rows.map(M => M.pl)].forEach((p, k) => { const o = p.cast; p.cast = function (m) { if (m && m.id) real[k]++; return o.call(this, m); }; });
			// (no KOs from the test here: every partner, a melee one too, gets to fight)
			for (let i = 0; i < 20 * 75; i++) H.tick(1 / 20, true);
			const live = { players: G.Replay.size && G.Replay.size.players };
			G.Game.quit(); await wait(300);
			const e = G.Replay.last; await e.ready;
			const d = JSON.parse(await G.Replay.unpack(e.segs[0]));
			const castsBy = [0, 0, 0, 0], rowsBy = [0, 0, 0, 0];
			let frames = 0;
			for (const f of d.f) {
				frames++;
				for (const c of f[14] || []) castsBy[c[0]]++;
			}
			const rd = await G.Replay.open(e.segs[0]);
			for (let i = 0; i < rd.length; i++) { const s = rd.at(i); for (const m of s.mt || []) rowsBy[m[11]]++; }
			// (a player whose moves all circle it (orbits) or buff it casts nothing: those are drawn from its move list)
			const sl = rd.at(rd.length - 1, 0), kinds = [sl.mv, ...[1, 2, 3].map(k => rd.at(rd.length - 1, k).mv)].map(mv => (mv || []).map(m => (G.Moves.BY_ID[m[0]] || {}).kind));
			const castless = kinds.map(l => l.length > 0 && l.every(k => k === 'orbit' || k === 'buff'));
			return { ran, live, players: d.h.players, castsBy, rowsBy, frames, size: e.segs[0].length, np: e.meta.np, kinds, castless, real };
		});
		console.log(`     4 players: ${four.error || ""} ${four.frames} frames, casts by player ${JSON.stringify(four.castsBy)}, packed ${four.size} chars`);
		A(four.ran === 4 && four.players && four.players.length === 4 && four.np === 4, 'a 4-player local session: the header lists every player (you + 3 partners)', JSON.stringify(four.players));
		A(four.players && four.players[0].k === 'me' && four.players.slice(1).every((p, i) => p.k === 'l' && /J[234]$/.test(p.name) && p.dex > 0), '...with their names, species and kinds', JSON.stringify(four.players));
		A(four.rowsBy && [1, 2, 3].every(k => four.rowsBy[k] >= four.frames - 1), 'every frame has every partner\'s row (field 12)', JSON.stringify([four.rowsBy, four.frames]));
		A(four.castsBy && JSON.stringify(four.castsBy) === JSON.stringify(four.real) && four.castsBy.filter(n => n > 20).length >= 3,
			'every player\'s casts are recorded, each one (field 14: the move, its level, the aim)', JSON.stringify([four.castsBy, four.real, four.kinds]));
		// the viewer: follow anyone
		const view = await lc.E(async () => {
			const H = window.__t, e = G.Replay.last, out = {};
			await G.WatchUI.playLocal(e, () => {});
			const S = G.WatchUI.session;
			G.WatchUI.seek(30);
			const a0 = { dex: G.WatchUI.player.dex, x: Math.round(G.WatchUI.player.x), mates: G.WatchUI.drawables().length - 1, tags: G.WatchUI.drawables().slice(1).map(p => p.tag), btn: (document.getElementById('wc-follow') || {}).textContent };
			G.WatchUI.setFollow(2);
			const fr = G.WatchUI.frame;
			const a2 = { follow: G.WatchUI.follow, dex: G.WatchUI.player.dex, want: S.players[2].dex, pi: fr.pi, mates: G.WatchUI.drawables().length - 1, me0: (fr.mt || []).some(m => m[11] === 0), btn: (document.getElementById('wc-follow') || {}).textContent };
			// the playback draws every player's casts as ghosts
			const c0 = G.WatchUI.stats.casts;
			for (let i = 0; i < 90; i++) G.Game.debugStep(1, 1 / 30);
			a2.casts = G.WatchUI.stats.casts - c0;
			// F: the next player; LB / RB on a pad do the same (js/core/pad.js)
			H.key('KeyF'); G.Game.debugStep(1, 1 / 30);
			out.afterF = G.WatchUI.follow;
			H.key('Digit1'); G.Game.debugStep(1, 1 / 30);
			out.after1 = G.WatchUI.follow;
			out.a0 = a0; out.a2 = a2;
			G.WatchUI.leave();
			return out;
		});
		A(view.a0 && view.a0.mates === 3 && view.a0.tags.every(t => /J[234]$/.test(t || '')) && /Following: /.test(view.a0.btn || ''), 'the viewer shows you and the 3 partners, named; the "Following: <name>" switch is offered', JSON.stringify(view.a0));
		A(view.a2 && view.a2.follow === 2 && view.a2.pi === 2 && view.a2.dex === view.a2.want && view.a2.mates === 3 && view.a2.me0 && /J3/.test(view.a2.btn), 'follow player 3: its Pokémon becomes the one followed (camera, HUD); you become a partner row', JSON.stringify(view.a2));
		A(view.a2 && view.a2.casts > 10, 'every player\'s recorded casts are drawn as ghosts while it plays', JSON.stringify(view.a2));
		A(view.afterF === 3 && view.after1 === 0, 'F switches to the next player, 1-4 to that one', JSON.stringify(view));
		await lc.ctx.close();
	}

	// ======================== 5. the session cap: the tape ends with a marker, the viewer says so
	if (on(5)) {
		const cp = await bootPage({ save: SAVE('Trainer') });
		const cap = await cp.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms)), K = G.Replay.K, keep = [K.SESSION_SEGS, K.SEG_SECS];
			K.SESSION_SEGS = 3; K.SEG_SECS = 20;
			await G.Flow.play('normal'); H.freeze(); H.sturdy();
			for (let i = 0; i < 20 * 90; i++) H.tick(1 / 20);
			const t = G.Game.st.time;
			G.Game.quit(); await wait(300);
			K.SESSION_SEGS = keep[0]; K.SEG_SECS = keep[1];
			const e = G.Replay.last; await e.ready;
			const last = JSON.parse(await G.Replay.unpack(e.segs[e.segs.length - 1]));
			const out = { t: Math.round(t), n: e.segs.length, end: last.h.end, lastT: e.idx[e.idx.length - 1].t1 };
			await G.WatchUI.playLocal(e, () => {});
			G.WatchUI.seek(G.WatchUI.session.duration - 0.5);
			for (let i = 0; i < 60; i++) G.Game.debugStep(1, 1 / 30);
			await wait(100);
			out.card = (document.getElementById('scr-watch-end') || {}).innerText || '';
			out.limit = !!document.getElementById('watch-limit');
			G.WatchUI.leave();
			return out;
		});
		A(cap.n === 3 && cap.end && cap.end.lim === 1 && cap.lastT < cap.t - 5 && cap.end.time >= 85, 'past the session cap the tape stops, and its last segment says so (end.lim) with the run\'s summary', JSON.stringify(cap));
		A(cap.limit && /The replay ends here \(the session limit\)/.test(cap.card), 'the viewer\'s end card: "The replay ends here (the session limit)."', cap.card && cap.card.slice(0, 200));
		await cp.ctx.close();
	}

	// ======================== 6. v1 tapes still play
	if (on(6)) {
		const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'micasurvivor_golden', 'replay.json'), 'utf8'));
		const v1 = await bootPage({ save: SAVE('Trainer') });
		const r = await v1.E(async (code) => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			H.freeze();
			const rd = await G.Replay.open(code), out = { v: rd && rd.h.v, frames: rd && rd.length };
			G.WatchUI.playReplay(rd, {});
			let n = 0;
			while (G.WatchUI.playing && n++ < 20000) G.Game.debugStep(1, 1 / 20);
			out.done = G.WatchUI.done; out.T = Math.round(G.WatchUI.T); out.dur = Math.round(rd.duration); out.pl = !!G.WatchUI.player;
			out.follow = !!document.getElementById('wc-follow');
			G.WatchUI.leave();
			// a v1 entry kept in this browser from before U4 plays from the replays list too
			localStorage.setItem(G.Replay.STORE_KEY, JSON.stringify([{ rid: 'aaaa0000bbbb', when: 1, meta: { dex: 4, time: 100 }, code, id: null }]));
			const ok = await G.WatchUI.playLocal(G.Replay.local()[0], () => {});
			out.local = ok && G.WatchUI.mode === 'replay' && G.WatchUI.session.segs.length === 1;
			G.WatchUI.leave();
			return out;
		}, fx.code);
		A(r.v === 1 && r.frames === fx.frames && r.done && r.T === r.dur && r.pl && !r.follow, 'the golden v1 tape plays to its end in the v2 player (one segment, no follow switch)', JSON.stringify(r));
		A(r.local, 'a v1 tape kept in the browser (from before U4) plays from the replays list', JSON.stringify(r));
		await v1.ctx.close();
	}

	// ======================== 4. online co-op: the host's tape has the guest's row and casts
	if (on(4)) {
		const host = await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') });
		const guest = await bootPage({ user: 'bob', token: tokens.bob, state: states.bob, save: SAVE('bob') });
		const prep = p => p.E(async () => { const ok = await G.Expedition.load().catch(e => String(e)); if (ok !== true) return { ok: false, err: ok }; await G.ExpSave.open(); return { ok: true }; });
		await prep(host); await prep(guest);
		const inRun = (p, mode) => p.E(mode => G.Game.state === 'playing' && G.Modes.run.mode === mode && !!G.Game.player, mode);
		const mode = 'exp-classic';
		const mk = await host.E(async (mode) => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			G.ModesUI.open(); await wait(200);
			document.querySelector('[data-xcoop="' + mode + '"]').click();
			for (let i = 0; i < 60 && !(G.Social.room && G.UI.isOpen('scr-lobby')); i++) await wait(100);
			return G.Social.room ? { id: G.Social.room.id } : null;
		}, mode);
		let both = false;
		if (mk) {
			await guest.E(async (id) => { await G.Social.joinRoom(id); G.LobbyUI.open(); await new Promise(r => setTimeout(r, 400)); }, mk.id);
			await waitFor(() => host.E(() => G.Social.room && G.Social.room.members.length === 2), 8000);
			await waitFor(() => host.E(g => G.Net.mode(g) === 'direct', 'bob'), 30000);
			await guest.E(async () => { const me = G.Social.room && G.Social.room.members.find(m => m.uid === G.Social.uid); if (me && !me.ready) await G.Social.setReady(true); });
			await waitFor(() => host.E(() => G.Social.room.members.every(m => m.ready) && !document.getElementById('lobby-start').disabled), 10000);
			await host.E(() => document.getElementById('lobby-start').click());
			both = await waitFor(async () => await inRun(host, mode) && await inRun(guest, mode), 30000);
		}
		A(both, 'alice hosts an online co-op run, bob joins (WebRTC on localhost)', JSON.stringify(mk));
		if (both) {
			// (a real-time run: both clients play for ~14 s, segments every 4 s so the background upload shows)
			await guest.E(() => { const pl = G.Game.player; pl.hurt = () => {}; pl.invuln = 1e9; G.Replay.K.SEG_SECS = 4; });
			await host.E(() => { const pl = G.Game.player; pl.hurt = () => {}; pl.invuln = 1e9; G.Replay.K.SEG_SECS = 4; });
			await sleep(14000);
			const gs = await guest.E(() => { const sz = G.Replay.size; return sz && { host: sz.host, upOn: sz.upOn, segs: sz.segs, players: sz.players }; });
			const hs = await host.E(async () => {
				const live = G.Replay.size;
				G.Game.quit(); await new Promise(r => setTimeout(r, 400));
				const e = G.Replay.last; await e.ready; if (e.upload) await e.upload;
				G.Replay.K.SEG_SECS = 300;
				const casts = [0, 0]; let rows = 0, frames = 0, players = null;
				for (const c of e.segs) {
					const d = JSON.parse(await G.Replay.unpack(c));
					players = d.h.players;
					for (const f of d.f) { for (const x of f[14] || []) casts[x[0]] = (casts[x[0]] || 0) + 1; }
					const rd = await G.Replay.open(c);
					for (let i = 0; i < rd.length; i++) { frames++; if ((rd.at(i).mt || []).some(m => m[11] === 1)) rows++; }
				}
				return { players, casts, rows, frames, segs: e.segs.length, id: e.id, live: live && { host: live.host, upOn: live.upOn } };
			});
			await guest.E(async () => { G.Replay.K.SEG_SECS = 300; for (let i = 0; i < 30 && G.Game.state !== 'over'; i++) await new Promise(r => setTimeout(r, 100)); const e = G.Replay.last; if (e) await e.ready; });
			await sleep(500);
			const sessBy = who => keys('msurvsess:').map(row).filter(x => x && x.by === who);
			A(hs.players && hs.players.length === 2 && hs.players[1].k === 'o' && hs.players[1].name === 'bob', "the host's tape lists both players: alice (her own) and bob (online)", JSON.stringify(hs.players));
			A(hs.rows >= hs.frames * 0.6 && hs.casts[1] > 0 && hs.casts[0] > 0, "it records bob's row (from his co-op frames) and his casts (his ghosts), as well as alice's", JSON.stringify(hs));
			A(hs.live && hs.live.host && hs.live.upOn && hs.segs >= 2 && sessBy('alice').some(x => x.idx.length === hs.segs && x.players.length === 2), 'the host uploads the session in the background (both players in its index row)', JSON.stringify([hs.live, hs.segs, sessBy('alice').map(x => [x.idx.length, x.players.length])]));
			A(gs && gs.host === false && gs.upOn === false && gs.segs >= 1 && gs.players >= 2 && !sessBy('bob').length, 'bob (a guest) records his own tape here, with both players, but never uploads it', JSON.stringify([gs, sessBy('bob').length]));
		}
		await host.ctx.close(); await guest.ctx.close();
	}

	const pageErrs = errors.filter(e => !/AudioContext|play\(\) failed|NotAllowedError|WebRTC|RTCPeer|ICE/i.test(e));
	A(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
