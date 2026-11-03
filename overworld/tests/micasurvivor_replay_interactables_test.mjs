// micasurvivor_replay_interactables_test.mjs — every interactable / pickup a run uses plays back the same in its replay
// (owner bug 2026-11-02: "I capture a power up and it vanishes correctly in the live game but not on the replay").
// micasurvivor/js/mica/replay.js (the pickup table, field 5; the x block's `o` field 9; Dive's block in field 11),
// js/ui/watch-ui.js (playback), js/expedition/economy.js / dive.js (the viewer's copy of the host's state).
// A static server, headless Chrome, a guest profile; the replays are watched in the SAME page that recorded them (as the
// run-over screen's "Watch the replay" does) and also on a fresh page.
//   1. base pickups (XP, big XP, heal, magnet, coin, tickets, a held item, a bomb): each one collected is gone from the tape
//      on the next frame and never comes back: decoded, across segment boundaries (short segments forced), with the frames
//      merged (halve), and in the viewer (G.Pickups while the replay plays / seeks)
//   2. Expedition Classic: a rock, a free ball, a paid ball, a berry, Meowth: fresh before its use, used after, in the
//      replay viewer of the same page (whose own run ended on that zone) and on a fresh page; seeking back shows it fresh
//   3. Dive: the landmark, the lost Pokémon, a plug (a secret pocket) and its chest: the same, seeking back and forth
//   4. base world props (altars, springs, locked chests, traps, chests, rocks, grass): tape, halved, viewer, live
//   5. far away (gap fix): a live viewer joining late / following the partner sees every prop broken / altar used anywhere;
//      a spring / locked chest left part-used far from the recorder keeps its state in the replay and live; the live list's
//      size after thousands of breaks (and its budget past that)
//   node overworld/tests/micasurvivor_replay_interactables_test.mjs        (ONLY=1,3 runs those sections)
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
const PORT = 8873;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const on = k => !ONLY.length || ONLY.includes(String(k));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 1200) : '')); } };
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
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 1, partnerShiny: false, starter: 1, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {},
};
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'drpint');
		localStorage.setItem('micasurvivor_lang', 'en');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = function () {}; pl.invuln = 1e9; return pl; };
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.pick.at = -1e9; try { if (['friend', 'shop', 'hypno'].includes(G.ExpEco.pick.kind)) G.ExpEco.closePick(); else G.ExpEco.choose(0); } catch (e) { /* */ } }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
		if (G.Game.state === 'levelup') { dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit1', key: '1', bubbles: true })); }
	};
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { H.unblock(); if (G.Game.state === 'over' || G.Game.state === 'ui') return i; G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i + 1; } return n; };
	H.go = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; pl.airZ = 0; pl._px = null; pl.vx = 0; pl.vy = 0; G.Camera.x = x; G.Camera.y = y; };
	H.wipe = () => { for (const e of G.EnemyMgr.all()) { e.remote = true; } G.EnemyMgr.clear(); };
	H.TS = () => G.World.TS;
	H.wpos = p => { const z = G.World.zone; return [(p[0] + z.x0) * H.TS() + H.TS() / 2, (p[1] + z.y0) * H.TS() + H.TS() / 2]; };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.xk && !e.dead) { e.dead = true; e.fade = 0; } };
	/** the run time (tenths of a second, as a snapshot's t) */
	H.t = () => Math.round(G.Game.st.time * 10);
	/** collected pickups: [id, kind, t] (wrapping G.Pickups.update's onCollect) */
	H.got = [];
	H.watchPickups = () => {
		if (G.Pickups.__w) return;
		const u = G.Pickups.update;
		G.Pickups.update = function (dt, pls, oc) { return u.call(this, dt, pls, (p, w) => { if (G.Game.state !== 'watch') H.got.push([p.id, p.kind, H.t()]); return oc(p, w); }); };
		G.Pickups.__w = true;
	};
	/** the replay of the run just ended: every segment's Reader */
	H.readers = async () => { const e = G.Replay.last; if (e && e.ready) await e.ready; const out = []; for (const c of e.segs) out.push(await G.Replay.open(c)); return out; };
	/** every frame of a list of readers: [{t, seg, i, s}] */
	H.frames = rds => { const out = []; rds.forEach((rd, k) => { for (let i = 0; i < rd.length; i++) out.push({ t: rd.at(i).t, seg: k, i, s: rd.at(i) }); }); return out; };
	/** a list of readers with every frame merged two by two (as a segment over the cap is) */
	H.halved = async () => {
		const e = G.Replay.last, out = [];
		for (const c of e.segs) {
			const d = JSON.parse(await G.Replay.unpack(c));
			d.f = G.Replay.halve(d.f.map(f => JSON.stringify(f)), d.h.ew, d.h.kw).map(s => JSON.parse(s));
			out.push(G.Replay.reader(d));
		}
		return out;
	};
	/** play the last replay in this page's viewer and seek to time t (seconds of run time) */
	H.watchAt = async t => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		if (G.Game.state !== 'watch' || !G.WatchUI.session) {
			await G.WatchUI.playLocal(H.entry || G.Replay.last, () => {});
			for (let i = 0; i < 100 && !G.WatchUI.player; i++) await wait(30);
			if (G.WatchUI.playing) G.WatchUI.togglePlay();
		}
		G.WatchUI.seek(t);
		for (let i = 0; i < 100 && G.WatchUI.loading != null; i++) await wait(30);
		G.WatchUI.seek(t);
		await wait(0);
		G.WatchUI.seek(t);
		return G.WatchUI.frame;
	};
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
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
		const E = async (fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 600) }; } };
		return { ctx, page, menu, visible, E };
	}

	// ======================== 1. base pickups
	if (on(1)) {
		const d = await bootPage();
		A(d.menu, 'boots to the menu as a guest');
		const run = await d.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			G.Replay.K.SEG_SECS = 10;   // (short segments: the uses straddle segment boundaries)
			H.thaw(); await G.Flow.play('normal'); H.freeze(); H.sturdy(); H.watchPickups();
			const pl = G.Game.player, out = { drops: [] };
			pl.magnet = 1;   // (nothing flies to you on its own: each one is collected when you step on it)
			const KINDS = ['xp', 'xpBig', 'heal', 'magnet', 'coin', 'ticket', 'ticket10', 'item', 'bomb', 'xp', 'coin', 'item', 'heal'];
			for (let round = 0; round < 6; round++) {
				H.step(45);
				G.EnemyMgr.clear();
				const x0 = pl.x, y0 = pl.y;
				// a ring of pickups round you, 60-300 units away (inside the snapshot's 520)
				const ids = [];
				KINDS.forEach((k, j) => {
					const a = j / KINDS.length * 6.2832, r = 60 + (j % 4) * 70;
					const before = new Set(G.Pickups.all().map(p => p.id));
					G.Pickups.drop(k, x0 + Math.cos(a) * r, y0 + Math.sin(a) * r, k === 'item' ? (round % 2 ? 'leftovers' : 'quickclaw') : k === 'coin' ? 3 : k.startsWith('xp') ? 2 : 0);
					const o = G.Pickups.all().find(p => !before.has(p.id));
					if (o) { o.vx = 0; o.vy = 0; ids.push(o); out.drops.push([o.id, o.kind, H.t()]); }
				});
				H.step(20);   // (in the tape for a while)
				// walk onto each in turn, a few frames apart (some within one sampling interval of the next)
				for (const o of ids) {
					if (!G.Pickups.all().includes(o)) continue;
					H.go(o.x, o.y); H.step(o.id % 3 === 0 ? 2 : 9);
				}
				H.go(x0, y0); H.step(40);
			}
			out.t = H.t();
			G.Game.quit(); await wait(300);
			out.got = H.got.slice();
			return out;
		});
		A(run.got && run.got.length >= 50, `the run collects ${run.got && run.got.length} pickups of every kind`, JSON.stringify(run).slice(0, 400));
		const check = await d.E(async () => {
			const H = window.__t;
			const res = {};
			const verify = (frames, label) => {
				const bad = [];
				for (const [id, kind, t] of H.got) {
					// gone on the first frame recorded after it was collected, and on every later one
					const later = frames.filter(f => f.s.t > t);
					const back = later.find(f => f.s.pk.some(k => k[0] === id));
					if (back) bad.push({ id, kind, t, back: back.s.t, seg: back.seg, i: back.i });
				}
				res[label] = { frames: frames.length, bad: bad.slice(0, 6), nBad: bad.length };
			};
			const rds = await H.readers();
			res.segs = rds.length;
			verify(H.frames(rds), 'tape');
			verify(H.frames(await H.halved()), 'halved');
			// the viewer, this page: G.Pickups after a seek to just after each collection, forwards and back
			const bad = [];
			const ts = H.got.map(g => g[2]);
			for (const k of [...ts.keys()].filter(k => k % 4 === 0)) {
				const [id, kind, t] = H.got[k];
				const fr = await H.watchAt(t / 10 + 0.6);
				if (G.Pickups.all().some(p => p.id === id)) bad.push({ id, kind, t, at: fr && fr.t });
			}
			// played forwards (not seeking), over a stretch
			G.WatchUI.seek(1);
			if (!G.WatchUI.playing) G.WatchUI.togglePlay();
			const seenAfter = [];
			for (let i = 0; i < 1500; i++) {
				G.Game.debugStep(1, 1 / 30);
				const now = G.WatchUI.T * 10;
				for (const [id, kind, t] of H.got) if (now > t + 6 && G.Pickups.all().some(p => p.id === id)) seenAfter.push({ id, kind, t, now: Math.round(now) });
			}
			res.viewer = { bad: bad.slice(0, 6), nBad: bad.length, play: seenAfter.slice(0, 6), nPlay: seenAfter.length };
			G.WatchUI.leave();
			return res;
		});
		A(check.tape && check.segs >= 3 && check.tape.nBad === 0, `the tape (${check.segs} segments): every collected pickup is gone on the next frame and never reappears`, JSON.stringify(check.tape));
		A(check.halved && check.halved.nBad === 0, 'the same with every frame merged two by two (halve)', JSON.stringify(check.halved));
		A(check.viewer && check.viewer.nBad === 0 && check.viewer.nPlay === 0, 'the viewer: a collected pickup is not drawn after it was collected (seeking, and playing forwards)', JSON.stringify(check.viewer));
		await d.ctx.close();
	}

	// ======================== 4. base world props: altars (the "power-ups"), springs, locked chests, traps, chests, rocks, grass
	if (on(4)) {
		const d = await bootPage();
		const rec = await d.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			G.Replay.K.SEG_SECS = 12;
			H.thaw(); await G.Flow.play('normal'); H.freeze(); H.sturdy();
			const pl = G.Game.player, out = { uses: [] };
			const W = G.World, key = p => p.tx + ',' + p.ty;
			const around = W.propsAround(0, 0, 5000).map(p => [Math.hypot(p.x, p.y), p]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
			// (away from the start, where your own moves may break things before the script gets there)
			const pickT = (type, n) => around.filter(p => p.type === type && Math.hypot(p.x, p.y) > 700).slice(0, n);
			const use = (name, p, fn) => {
				if (!W.propsAround(p.x, p.y, 40).includes(p) || p.used) return;   // (already broken / used on the way: not this script's)
				const t0 = H.t(); fn(); const t1 = H.t();
				const gone = !W.propsAround(p.x, p.y, 40).includes(p);
				out.uses.push({ name, type: p.type, k: key(p), x: p.x, y: p.y, t0, t1, used: p.used, gone });
				G.EnemyMgr.clear(); H.step(40);
			};
			H.step(30);
			for (const p of pickT('altar', 3)) use('altar', p, () => H.step(30, 1 / 30, () => { H.go(p.x, p.y + 4); if (p.used) return false; }));
			for (const p of pickT('bigchest', 1)) use('bigchest', p, () => H.step(150, 1 / 30, () => { H.go(p.x, p.y + 20); if (!W.propsAround(p.x, p.y, 40).includes(p)) return false; }));
			for (const p of pickT('trap', 2)) use('trap', p, () => { H.go(p.x, p.y - 8); H.step(3); });
			for (const t of ['chest', 'rock', 'grass']) for (const p of pickT(t, 3)) use(t, p, () => { H.go(p.x + 30, p.y); H.step(2); W.damageProp(p, 9999); H.step(2); });
			// a live snapshot (what a friend watching sees): the props broken near you
			const last = out.uses[out.uses.length - 1], lp = G.Spectate.pubSnap({ ev: [], kd: [], w: 0 }).wa;
			out.live = { last: last.k, x: last.x, y: last.y, has: !!lp && G.World.unpackProps(lp.B).has(last.k) };
			out.snapL = JSON.parse(JSON.stringify(G.Spectate.pubSnap({ ev: [], kd: [], w: 0 })));
			H.step(40);
			G.Game.quit(); await wait(300);
			return out;
		});
		const kinds = new Set((rec.uses || []).map(u => u.type));
		A(rec.uses && ['altar', 'bigchest', 'trap', 'chest', 'rock', 'grass'].every(k => kinds.has(k)) && rec.uses.every(u => u.type === 'altar' ? u.used : u.gone),
			`a Normal run uses ${rec.uses && rec.uses.filter(u => u.type === 'altar').length} altars (the 25-second powers), opens a locked chest, sets off traps and breaks chests, rocks and grass`, JSON.stringify(rec).slice(0, 900));
		A(rec.live && rec.live.has, 'a live snapshot carries the props broken (wa), so a friend watching sees them gone', JSON.stringify(rec.live));
		// a live viewer (this page, fed that snapshot): the prop is gone on its screen too
		const lv = await d.E(async (snap, L) => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const name = G.MicaAccount.name, watch = G.Spectate.watch;
			G.MicaAccount.name = () => 'viewer';
			G.Spectate.watch = (u, h) => { h.snapshot(snap, {}); h.snapshot(Object.assign({}, snap, { t: snap.t + 5 }), {}); };
			G.WatchUI.watchLive('host');
			for (let i = 0; i < 40 && !G.WatchUI.player; i++) await wait(30);
			const p = G.World.propsAround(L.x, L.y, 40).find(q => q.tx + ',' + q.ty === L.last);
			G.WatchUI.leave(); G.MicaAccount.name = name; G.Spectate.watch = watch;
			return { player: !!G.WatchUI.player || true, gone: !p };
		}, rec.snapL, rec.live);
		A(lv && lv.gone, '...and a live viewer fed it draws that prop gone', JSON.stringify(lv));
		const chk = await d.E(async uses => {
			const H = window.__t, out = {};
			const tapeCheck = (frames) => {
				const bad = [];
				for (const u of uses) {
					const set = f => f.s.wp ? (u.type === 'altar' ? f.s.wp.u : f.s.wp.b) : null;
					for (const f of frames) {
						const st = set(f);
						const has = !!(st && st.has(u.k));
						if (f.s.t < u.t0 && has) { bad.push({ u: u.name, k: u.k, t: f.s.t, why: 'early' }); break; }
						if (f.s.t > u.t1 + 5 && !has) { bad.push({ u: u.name, k: u.k, t: f.s.t, seg: f.seg, i: f.i, why: st ? 'missing' : 'no wp' }); break; }
					}
				}
				return { n: frames.length, bad: bad.slice(0, 6), nBad: bad.length };
			};
			const rds = await H.readers();
			out.segs = rds.length;
			out.tape = tapeCheck(H.frames(rds));
			out.halved = tapeCheck(H.frames(await H.halved()));
			// the viewer: before / after / back
			const rows = [];
			for (const u of uses) {
				const row = { u: u.name, k: u.k };
				for (const [w, t] of [['before', u.t0 / 10 - 1], ['after', u.t1 / 10 + 1.2], ['back', u.t0 / 10 - 1]]) {
					await H.watchAt(t);
					const p = G.World.propsAround(u.x, u.y, 40).find(q => q.tx + ',' + q.ty === u.k);
					row[w] = u.type === 'altar' ? !!(p && p.used) : !p;   // (true = used / gone)
				}
				rows.push(row);
			}
			out.view = rows;
			G.WatchUI.leave();
			return out;
		}, rec.uses);
		A(chk.tape && chk.segs >= 2 && chk.tape.nBad === 0, `the tape (${chk.segs} segments): each altar is used, and each chest / rock / grass / trap broken, from its use on (never before), in every segment after`, JSON.stringify(chk.tape));
		A(chk.halved && chk.halved.nBad === 0, '...the same with every frame merged two by two (halve)', JSON.stringify(chk.halved));
		const vb = (chk.view || []).filter(r => r.before || !r.after || r.back);
		A(chk.view && chk.view.length === rec.uses.length && !vb.length, 'the replay viewer: an altar lights until it is used and stays used; a broken prop is there before and gone after; seeking back brings it back', JSON.stringify(vb.length ? vb : chk.view).slice(0, 900));
		await d.ctx.close();
	}

	// ======================== 5. far from the camera (gap fix): every prop broken / altar used anywhere reaches a live viewer
	// who joins late or follows another player; a spring drained / a locked chest started far from the recorder keeps its
	// state in the replay and the live view; the size of the live list after a long run with thousands of breaks
	if (on(5)) {
		const d = await bootPage();
		const rec = await d.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			G.Replay.K.SEG_SECS = 600;
			G.LocalCoop.setPlayers(2, []);
			H.thaw(); await G.Flow.play('normal'); H.freeze(); H.sturdy();
			const M = G.LocalCoop.rows[0];
			M.pl.hurt = () => {}; M.pl.invuln = 1e9;
			const pl = G.Game.player, W = G.World, key = p => p.tx + ',' + p.ty, out = { far: [], spots: [] };
			const brk = p => { W.damageProp(p, 9999); };
			H.step(20);
			// far-away breaks: 4 spots 3000-6000 units out, 3 props each (and an altar used out there)
			for (const [sx, sy] of [[3000, 0], [0, -4200], [-5200, 1800], [2600, 5400]]) {
				H.go(sx, sy); H.step(2);
				const ps = W.propsAround(sx, sy, 600).filter(p => p.destructible && ['chest', 'rock', 'grass'].includes(p.type)).slice(0, 3);
				for (const p of ps) { brk(p); out.far.push({ k: key(p), x: p.x, y: p.y, type: p.type }); }
				out.spots.push([sx, sy]);
				G.EnemyMgr.clear(); G.Pickups.clear(); H.step(4);
			}
			const alt = W.propsAround(-3000, -3000, 2500).filter(p => p.type === 'altar' && !p.used).sort((a, b) => Math.hypot(a.x + 3000, a.y + 3000) - Math.hypot(b.x + 3000, b.y + 3000))[0];
			if (alt) { H.step(40, 1 / 30, () => { H.go(alt.x, alt.y + 4); if (alt.used) return false; }); out.altar = { k: key(alt), x: alt.x, y: alt.y, used: alt.used }; }
			// a spring drained to about half, far out, then left (it refills only while you are near it)
			const sp = W.propsAround(4000, -4000, 3000).filter(p => p.type === 'spring').sort((a, b) => Math.hypot(a.x - 4000, a.y + 4000) - Math.hypot(b.x - 4000, b.y + 4000))[0];
			if (sp) { H.step(400, 1 / 30, () => { H.go(sp.x, sp.y - 6); pl.hp = 1; if (sp.charge < 0.55) return false; }); out.spring = { k: key(sp), x: sp.x, y: sp.y, c: Math.round(sp.charge * 100) }; }
			// a locked chest stood next to for a second, then left (its progress stays where it was)
			const bc = W.propsAround(-4000, 4000, 3000).filter(p => p.type === 'bigchest').sort((a, b) => Math.hypot(a.x + 4000, a.y - 4000) - Math.hypot(b.x + 4000, b.y - 4000))[0];
			// (the prop as the world holds it now: a chunk forgotten while searching is built again, with a new object)
			const live = p => p && W.propsAround(p.x, p.y, 40).find(q => key(q) === key(p));
			if (bc) { H.go(bc.x, bc.y + 20); const b2 = live(bc); H.step(36, 1 / 30, () => { H.go(bc.x, bc.y + 20); }); out.chest = { k: key(bc), x: bc.x, y: bc.y, o: Math.round(b2.open / G.Interact.CHEST_TIME * 100), b2 }; }
			// home, far from all of it; then the partner far out on its own, breaking props there
			H.go(0, 0); H.step(30);
			out.homeT = H.t();
			if (out.spring) out.spring.now = Math.round(sp.charge * 100);
			if (out.chest) { out.chest.now = Math.round(out.chest.b2.open / G.Interact.CHEST_TIME * 100); delete out.chest.b2; }
			const mx = -7000, my = -6000;
			M.pl.x = mx; M.pl.y = my;
			const mps = W.propsAround(mx, my, 500).filter(p => p.destructible && ['chest', 'rock', 'grass'].includes(p.type)).slice(0, 3);
			for (const p of mps) brk(p);
			out.mate = { x: mx, y: my, ks: mps.map(key), xy: mps.map(p => [p.x, p.y]) };
			G.Pickups.clear();
			out.snap = JSON.parse(JSON.stringify(G.Spectate.pubSnap({ ev: [], kd: [], w: 1000 })));
			out.snapLen = JSON.stringify(out.snap).length;
			out.waLen = out.snap.wa ? JSON.stringify(out.snap.wa).length : 0;
			out.endT = H.t();
			H.step(20);
			G.Game.quit(); await wait(300);
			return out;
		});
		A(rec.far && rec.far.length >= 9 && rec.altar && rec.altar.used && rec.spring && rec.chest && rec.mate && rec.mate.ks.length >= 2,
			`a 2-player run breaks ${rec.far && rec.far.length} props at 4 spots 3000-6000 units out, uses an altar out there, drains a spring to ${rec.spring && rec.spring.c}% and starts a locked chest (${rec.chest && rec.chest.o}%), then goes home; the partner breaks ${rec.mate && rec.mate.ks.length} more far off`, JSON.stringify(rec).slice(0, 900));
		A(rec.spring && rec.spring.now === rec.spring.c && rec.chest && rec.chest.now === rec.chest.o && rec.chest.o > 10, 'far away, the spring stays drained and the chest stays part-open (the run\'s own state)', JSON.stringify([rec.spring, rec.chest]));
		// a live viewer who joins now (fed only this snapshot) and looks where the run has been; then follows the partner
		const lv = await d.E(async r => {
			const wait = ms => new Promise(res => setTimeout(res, ms));
			const name = G.MicaAccount.name, watch = G.Spectate.watch, snap = r.snap;
			G.MicaAccount.name = () => 'viewer';
			G.Spectate.watch = (u, h) => { h.snapshot(snap, {}); h.snapshot(Object.assign({}, snap, { t: snap.t + 5, w: snap.w + 1000 }), {}); };
			G.WatchUI.watchLive('host');
			for (let i = 0; i < 40 && !G.WatchUI.player; i++) await wait(30);
			const at = (x, y, k) => G.World.propsAround(x, y, 60).find(q => q.tx + ',' + q.ty === k);
			const out = {};
			out.farBack = r.far.filter(f => at(f.x, f.y, f.k)).map(f => f.k);
			const ap = r.altar && at(r.altar.x, r.altar.y, r.altar.k);
			out.altar = ap ? !!ap.used : 'gone';
			const s = r.spring && at(r.spring.x, r.spring.y, r.spring.k), c = r.chest && at(r.chest.x, r.chest.y, r.chest.k);
			out.spring = s ? Math.round(s.charge * 100) : null;
			out.chest = c ? Math.round(c.open / G.Interact.CHEST_TIME * 100) : null;
			// following the partner: its view, where it broke props on its own
			out.follow = G.WatchUI.setFollow(1);
			out.cam = [Math.round(G.WatchUI.player.x), Math.round(G.WatchUI.player.y)];
			out.mateBack = r.mate.ks.filter((k, i) => at(r.mate.xy[i][0], r.mate.xy[i][1], k));
			G.WatchUI.leave(); G.MicaAccount.name = name; G.Spectate.watch = watch;
			return out;
		}, rec);
		A(lv.farBack && lv.farBack.length === 0 && lv.altar === true, `a live viewer who joins late sees every prop broken far away gone (${rec.far.length}) and the far altar used`, JSON.stringify(lv));
		A(lv.spring != null && Math.abs(lv.spring - rec.spring.c) <= 1 && lv.chest != null && Math.abs(lv.chest - rec.chest.o) <= 1, '...and the far spring drained / the far locked chest part-open as the run left them', JSON.stringify([lv.spring, lv.chest, rec.spring, rec.chest]));
		A(lv.follow === 1 && Math.hypot(lv.cam[0] - rec.mate.x, lv.cam[1] - rec.mate.y) < 200 && lv.mateBack && lv.mateBack.length === 0, '...following the partner (far from player 1), the props it broke there are gone too', JSON.stringify(lv));
		// the replay: the far spring / chest keep their state at the end (the recorder is ~5000 units away)
		const rp = await d.E(async r => {
			const H = window.__t;
			await H.watchAt(r.endT / 10 + 0.4);
			const at = (x, y, k) => G.World.propsAround(x, y, 60).find(q => q.tx + ',' + q.ty === k);
			const s = at(r.spring.x, r.spring.y, r.spring.k), c = at(r.chest.x, r.chest.y, r.chest.k);
			const out = { spring: s ? Math.round(s.charge * 100) : null, chest: c ? Math.round(c.open / G.Interact.CHEST_TIME * 100) : null };
			// (the tape's cost: field 15 only on change; the far ones frozen, never re-sent)
			const e = G.Replay.last; let bytes = 0, withS = 0, n = 0;
			for (const c of e.segs) {
				const fr = JSON.parse(await G.Replay.unpack(c)).f, rd = await G.Replay.open(c);
				fr.forEach((f, i) => { n++; if (f[15]) { bytes += JSON.stringify(f[15]).length; if ((f[15].s || f[15].d) && rd.at(i).t > r.homeT) withS++; } });
			}
			out.tape = { frames: n, w15: bytes, specFrames: withS };
			await H.watchAt(1);   // (back to the start: both at rest)
			const s0 = at(r.spring.x, r.spring.y, r.spring.k), c0 = at(r.chest.x, r.chest.y, r.chest.k);
			out.start = [s0 ? Math.round(s0.charge * 100) : null, c0 ? Math.round(c0.open * 100) : null];
			G.WatchUI.leave();
			return out;
		}, rec);
		A(rp.spring != null && Math.abs(rp.spring - rec.spring.c) <= 1 && rp.chest != null && Math.abs(rp.chest - rec.chest.o) <= 1 && rp.start[0] === 100 && rp.start[1] === 0,
			'the replay, the recorder far away: the spring is drained and the locked chest part-open as the run left them (at rest at the start)', JSON.stringify([rp, rec.spring, rec.chest]));
		A(rp.tape && rp.tape.w15 < 4000 && rp.tape.specFrames === 0, `...for ${rp.tape && rp.tape.w15} bytes of field 15 over ${rp.tape && rp.tape.frames} frames (the far spring / chest, frozen, never sent again once you are home)`, JSON.stringify(rp.tape));
		// the size of the live list after a long run: thousands of props broken over a wide area (and the budget past it)
		const sz = await d.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			H.thaw(); await G.Flow.play('normal'); H.freeze(); H.sturdy();
			const W = G.World, CW = W.CW, out = { rows: [] };
			const run = (n0, n1) => {
				for (let cy = n0; cy < n1; cy++) for (let cx = n0; cx < n1; cx++) {
					for (const p of W.propsAround(cx * CW + CW / 2, cy * CW + CW / 2, CW / 2 - 1)) if (p.destructible) W.breakAt(p.tx, p.ty);
					G.Pickups.clear(); G.FX.clear();
				}
				const s = G.Spectate.pubSnap({ ev: [], kd: [], w: 1 });
				return { chunks: (n1 - n0) ** 2, broken: W.propLog().b.length, wa: s.wa ? JSON.stringify(s.wa).length : 0, part: !!(s.wa && s.wa.p), snap: JSON.stringify(s).length };
			};
			out.rows.push(run(-6, 6));    // 144 chunks (a 6 x 6 km square)
			out.rows.push(run(-14, 14));  // 784 chunks: past the budget
			const s = G.Spectate.pubSnap({ ev: [], kd: [], w: 1 }), here = G.World.unpackProps(s.wa.B), pl = G.Game.player;
			out.nearOk = [...here].filter(k => { const [tx, ty] = k.split(',').map(Number); return Math.abs(tx * W.TS - pl.x) < 400 && Math.abs(ty * W.TS - pl.y) < 400; }).length > 0;   // (the chunks round you are in, though broken first)
			G.Game.quit(); await wait(300);
			return out;
		});
		console.log('      live list size: ' + sz.rows.map(r => `${r.broken} props broken over ${r.chunks} chunks -> wa ${r.wa} chars${r.part ? ' (partial: round the players + the most recent)' : ''}, snapshot ${r.snap}`).join('; '));
		A(sz.rows[0].broken > 1500 && !sz.rows[0].part && sz.rows[0].wa < 9200 && sz.rows[0].snap < 23000, `${sz.rows[0].broken} props broken over ${sz.rows[0].chunks} chunks: all of them in ${sz.rows[0].wa} characters, the snapshot ${sz.rows[0].snap} (cap 23 000)`, JSON.stringify(sz));
		A(sz.rows[1].part && sz.rows[1].wa < 9200 && sz.rows[1].snap < 23000 && sz.nearOk, `${sz.rows[1].broken} over ${sz.rows[1].chunks} chunks: past the budget, the most recent + the chunks round the players in ${sz.rows[1].wa} (partial), never over the cap`, JSON.stringify(sz));
		await d.ctx.close();
	}

	// ======================== 2. Expedition Classic: the zone's interactables
	if (on(2)) {
		const d = await bootPage();
		const rec = await d.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			H.thaw();
			const ok0 = await G.Expedition.load().catch(e => String(e));
			if (ok0 !== true) return { error: 'load ' + ok0 };
			await G.ExpSave.open();
			G.Replay.K.SEG_SECS = 15;
			await G.Flow.play('exp-classic'); H.freeze(); H.sturdy(); H.wipe();
			const Ec = G.ExpEco, pl = G.Game.player, lay = Ec.layoutOf(G.World.zone), uses = [];
			const objs = k => lay.objs.filter(o => o.kind === k);
			const st = o => Ec.zone.st[o.i];
			const stand = (o, sec, dy = 0) => { H.go(o.x, o.y + dy); H.step(Math.ceil(sec * 30)); };
			const away = () => { H.go(0, 0); H.step(30); H.wipe(); };
			const use = (name, o, fn) => { const t = H.t(); fn(); uses.push({ name, i: o.i, t0: t, t1: H.t(), st: st(o) }); away(); H.step(45); };
			H.step(60);
			use('rock', objs('rock')[0], () => stand(objs('rock')[0], 0.2));
			use('freeball', objs('freeball')[0], () => stand(objs('freeball')[0], 0.8));
			pl.coins = 200;
			use('ball', objs('ball')[0], () => stand(objs('ball')[0], 0.8));
			use('berry', objs('berry')[0], () => { pl.hp = Math.round(pl.maxHp * 0.3); stand(objs('berry')[0], 0.2); });
			use('rock2', objs('rock')[1], () => stand(objs('rock')[1], 0.2));
			use('cursedball', objs('cursedball')[0], () => stand(objs('cursedball')[0], 0.8));
			H.wipe();
			use('freeball2', objs('freeball')[1], () => stand(objs('freeball')[1], 0.8));
			// Meowth: in on his schedule; walk up, buy one, leave
			const v0 = lay.visits[0];
			G.ExpClassic.debugZoneTime(v0.at + 0.5); H.step(45);
			const sp = lay.objs[Ec.zone.spot], m0 = { spot: Ec.zone.spot, sold: Ec.zone.sold }, tm = H.t();
			pl.coins = 2000; H.go(sp.x, sp.y + 10);
			for (let i = 0; i < 30 && !(Ec.pick && Ec.pick.kind === 'shop'); i++) G.Game.debugStep(1, 1 / 30);
			if (Ec.pick && Ec.pick.kind === 'shop') { Ec.pick.at = -1e9; Ec.choose(0); Ec.closePick(); }
			const meowth = { spot: m0.spot, i: m0.spot, sold0: m0.sold, sold: Ec.zone.sold, t0: tm, t1: H.t() };
			away(); H.step(60);
			const t = H.t();
			G.Game.quit(); await wait(300);
			return { uses, meowth, t, n: lay.objs.length, seed: G.World.seed };
		});
		A(rec.uses && rec.uses.every(u => u.st === 1) && rec.meowth && rec.meowth.sold0 === 0 && rec.meowth.sold === 1, 'the run uses a rock, free / paid / cursed Poké Balls and a berry (each USED live) and buys from Meowth', JSON.stringify(rec));
		const probe = async (E, segs) => E(async (uses, m, segs) => {
			const H = window.__t, out = [];
			if (segs) H.entry = { segs };   // (a fresh page: the tape as the other page kept it)
			for (const u of uses) {
				const row = { name: u.name };
				for (const [k, t] of [['before', u.t0 / 10 - 1.2], ['after', u.t1 / 10 + 1.2]]) {
					await H.watchAt(t);
					const c = G.ExpEco.cur();
					row[k] = c ? c.st[u.i] : 'none';
					row[k + 'Host'] = c ? c.host : null;
				}
				out.push(row);
			}
			// Meowth's stall: in, nothing sold yet; then the item he sold
			const mw = {};
			for (const [k, t] of [['before', m.t0 / 10 - 0.6], ['after', m.t1 / 10 + 1.2], ['back', m.t0 / 10 - 0.6]]) {
				await H.watchAt(t);
				const c = G.ExpEco.cur();
				mw[k] = c ? { spot: c.spot, sold: c.sold, host: c.host } : null;
			}
			out.push({ name: 'meowth', ...mw });
			// back to the start: everything fresh again
			await H.watchAt(0.5);
			const c = G.ExpEco.cur();
			const start = c ? uses.map(u => c.st[u.i]) : null;
			G.WatchUI.leave();
			return { rows: out, start };
		}, rec.uses, rec.meowth, segs || null);
		const okv = v => v && v.rows && v.rows.filter(r => r.name !== 'meowth').every(r => r.before === 0 && r.after === 1 && !r.beforeHost && !r.afterHost) && v.start.every(s => s === 0);
		const okm = v => { const m = v && v.rows && v.rows.find(r => r.name === 'meowth'); return !!m && m.before && m.before.spot === rec.meowth.spot && m.before.sold === 0 && m.after && m.after.sold === 1 && m.back && m.back.sold === 0 && !m.after.host; };
		const same = await probe(d.E);
		A(okv(same), 'the same page\'s replay viewer (its own run just ended on that zone): each fresh before its use, used after it, fresh again seeking back', JSON.stringify(same));
		A(okm(same), '...Meowth: in his stall with nothing sold, then the item he sold; unsold again seeking back', JSON.stringify(same.rows && same.rows.find(r => r.name === 'meowth')));
		const segs = await d.E(() => G.Replay.last.segs);
		await d.ctx.close();
		const f = await bootPage();
		await f.E(() => G.Expedition.load());
		const fresh = await probe(f.E, segs);
		A(okv(fresh) && okm(fresh), 'a fresh page playing the same tape: the same', JSON.stringify(fresh).slice(0, 600));
		await f.ctx.close();
	}

	// ======================== 3. Dive: the landmark, the lost Pokémon, a plug and its chest
	if (on(3)) {
		const d = await bootPage();
		const rec = await d.E(async () => {
			const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
			H.thaw();
			const ok0 = await G.Expedition.load().catch(e => String(e));
			if (ok0 !== true) return { error: 'load ' + ok0 };
			await G.ExpSave.open();
			G.Replay.K.SEG_SECS = 15;
			G.Expedition.diveRoute('forest'); G.Expedition.diveStart(1);
			await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
			const S = G.ExpDive.run, pl = G.Game.player, out = { uses: [] };
			const put = (x, y) => H.go(x, y);
			const toStairs = () => { const [x, y] = H.wpos(G.World.zone.dive.stairs); put(x, y); };
			const down = () => {
				const f0 = S.floor;
				H.thin(); if (S.boss && !S.boss.dead) { S.boss.hurt(S.boss.maxHp * 2); H.step(2); }
				toStairs(); H.step(40, 1 / 30, () => { if (G.ExpDive.run.floor !== f0) return false; toStairs(); });
				H.step(30);
			};
			let lm = null, lost = null, plug = null;
			for (let k = 0; k < 14 && !(lm && lost && plug); k++) {
				const L = G.World.zone.dive;
				H.thin(); H.step(30);
				if (!lm && L.landmark && !S.lmUsed) {
					const t0 = H.t(), [x, y] = H.wpos(L.landmark.at);
					H.step(60, 1 / 30, () => { put(x, y); if (S.lmUsed) return false; });
					lm = { floor: S.floor, t0, t1: H.t(), used: S.lmUsed, kind: L.landmark.kind };
					H.step(45);
				}
				if (!lost && S.lost && !S.lost.follow) {
					const t0 = H.t();
					H.step(10, 1 / 30, () => { put(S.lost.x, S.lost.y); if (S.lost.follow) return false; });
					lost = { floor: S.floor, t0, t1: H.t(), follow: S.lost.follow };
					H.step(45);
				}
				if (!plug && (L.plugs || []).length) {
					const pg = L.plugs[0], z = G.World.zone, mon0 = pl.mon;
					const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [pg.at[0] + dx, pg.at[1] + dy]).find(([tx, ty]) => G.World.maskAt(tx + z.x0, ty + z.y0) > 0);
					const [x, y] = H.wpos(side || pg.at), t0 = H.t();
					pl.mon = Object.assign({}, mon0, { types: pg.kind === 'boulder' ? ['fighting'] : ['fire'] });
					H.step(60, 1 / 30, () => { put(x, y); if (pg.open) return false; });
					pl.mon = mon0;
					plug = { floor: S.floor, t0, t1: H.t(), open: pg.open, at: pg.at.slice() };
					H.step(45);
				}
				down();
			}
			H.step(30);
			out.lm = lm; out.lost = lost; out.plug = plug; out.floor = S.floor;
			G.Game.quit(); await wait(300);
			return out;
		});
		A(rec.lm && rec.lm.used && rec.lost && rec.lost.follow && rec.plug && rec.plug.open, `a Dive run (to floor ${rec.floor}) uses a landmark (${rec.lm && rec.lm.kind}, floor ${rec.lm && rec.lm.floor}), finds a lost Pokémon (floor ${rec.lost && rec.lost.floor}) and opens a plug (floor ${rec.plug && rec.plug.floor})`, JSON.stringify(rec));
		const probe = E => E(async r => {
			const H = window.__t, out = {};
			const closed = at => G.World.zone && G.World.zone.dive ? G.World.maskAt(at[0] + G.World.zone.x0, at[1] + G.World.zone.y0) === 0 : null;
			for (const [k, u, fn] of [['lm', r.lm, v => v && v.lmUsed], ['lost', r.lost, v => v && v.lost && v.lost.follow], ['plug', r.plug, () => closed(r.plug.at) === false]]) {
				const row = {};
				for (const [w, t] of [['before', u.t0 / 10 - 1.2], ['after', u.t1 / 10 + 1.2], ['back', u.t0 / 10 - 1.2]]) {
					const fr = await H.watchAt(t);
					const v = G.ExpDive.cur ? G.ExpDive.cur() : G.ExpDive.view;   // (what the painter draws)
					row[w] = { on: !!fn(v), floor: G.World.zone && G.World.zone.zone, host: !!(G.ExpDive.run), ft: fr && fr.t };
				}
				out[k] = row;
			}
			G.WatchUI.leave();
			return out;
		}, rec);
		const same = await probe(d.E);
		const okRow = (r, f) => r && !r.before.on && r.after.on && !r.back.on && r.before.floor === f && r.after.floor === f && !r.after.host;
		A(same.lm && okRow(same.lm, rec.lm.floor), 'the same page\'s replay: the landmark is unused before its use, used after, unused again seeking back', JSON.stringify(same.lm));
		A(same.lost && okRow(same.lost, rec.lost.floor), '...the lost Pokémon follows you only from when you reached it', JSON.stringify(same.lost));
		A(same.plug && okRow(same.plug, rec.plug.floor), '...the plug is shut before it was opened, open after, shut again seeking back', JSON.stringify(same.plug));
		await d.ctx.close();
	}
} catch (e) {
	fail++; console.log('FAIL: the suite threw: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
const errs = errors.filter(e => !/AudioContext|play\(\) failed|NotAllowedError/.test(e));
A(!errs.length, 'no page errors', errs.slice(0, 5).join('\n'));
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
