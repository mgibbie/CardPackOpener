// micasurvivor_spectate_test.mjs — MicaSurvivor M5 batch 12c: watching a friend live and shareable run replays, end to end.
// The REAL server handler (server/mp.mjs, bundled like the dev server, over an in-memory sqlite D1 stand-in that records
// every row write) behind a static server, and separate browser contexts (contexts share no localStorage):
//   - alice plays a solo run; with nobody watching her client writes nothing but its "in a run" beacon (measured)
//   - bob (her friend) sees her under "Live now" in MicaSurvivor's friends screen (and in `live-friends`, kind
//     micasurvivor), clicks Watch, and his view follows her: position, enemies (species / position / HP), her HP and
//     level, the level-up screen being open; the write cost while watched (measured)
//   - bob's keys and clicks do nothing to alice's run; Esc leaves to the menu
//   - alice's run ends: bob gets the summary card
//   - alice shares the replay from her run summary (the link is copied); carl, with NO account, opens the link and it
//     plays; seeking and the 1× / 2× / 4× speeds work; its size is under the cap
//   - a local co-op run (the partner, its HP, P2 / AI) and an online co-op group (watched through a guest) are watched
//   - the recorder's per-frame cost is measured (< 0.5 ms a frame)
//   - no Spanish anywhere in English mode (DOM and canvas)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the live list, the spectator view (desktop and 844x390), the replay player,
// the share button and the copied link, a co-op group being watched, the local co-op partner, the end card.
// Covers micasurvivor/js/mica/spectate.js, js/mica/replay.js, js/ui/watch-ui.js, js/ui/run-ui.js, js/ui/social-ui.js,
// js/ui/hud.js, js/ui/minimap.js, js/game.js, js/data/lang-en.js, index.html, css/style.css and server/mp.mjs.
//   node overworld/tests/micasurvivor_spectate_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

// the server's random GC sweep (server/mp.mjs gcRate) stays off: its `gc:last` stamp would land in this suite's write checks
process.env.MP_GC_RATE = '0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9635;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

// ---------- the real handler over sqlite, recording row writes (key + time) ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && Number(r.changes) > 0) writes.push({ k: String(bound[0]), t: Date.now() }); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-spec-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
const actions = [];
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		try { const b = JSON.parse(raw); actions.push({ action: b.action, t: Date.now(), auth: (req.headers.authorization || '').slice(-8), bytes: raw.length }); } catch { }
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
for (let i = 0; ; i++) {
	try { await new Promise((res, rej) => { server.once('error', rej); server.listen(PORT, () => { server.off('error', rej); res(); }); }); break; }
	catch (e) { if (e.code !== 'EADDRINUSE' || i >= 40) throw e; await sleep(500); }
}

// ---------- accounts: alice plays; bob and carl are her friends (and each other's); dave is nobody's ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carl', 'dave']) tokens[n] = (await call('register', { username: n, password: 'msurv-spec-pass' })).token;
for (const n of ['bob', 'carl']) await call('add-friend', { username: 'alice' }, tokens[n]);
await call('add-friend', { username: 'carl' }, tokens.bob);
A(Object.values(tokens).every(Boolean), 'four real accounts; bob and carl are alice\'s friends (and each other\'s), dave nobody\'s');

// Spanish left on an English screen (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|viendo|repetición|compartir|enlace|partida|mirando|directo|esperando|jugando|eligiendo|jefe|nivel|caído|ver|tiempo|derrotados|movimientos|volver|menú|sala|amigos|listo|usado|activo|equipo|tus|últimas)\b/i;

const errors = [];
let browser;
const W = (pre, from = 0) => writes.slice(from).filter(w => w.k.startsWith(pre));
try {
	browser = await puppeteer.launch({
		executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--mute-audio'],
	});
	const pages = {};
	const open = async (who, opts = {}) => {
		const ctx = await browser.createBrowserContext();   // its own localStorage
		await ctx.overridePermissions(`http://localhost:${PORT}`, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403)/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		const st = tokens[who] ? (await call('state', {}, tokens[who])).state || { username: who } : null;
		await page.evaluateOnNewDocument((tok, st, net) => {
			if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			localStorage.setItem('micasurvivor_lang', 'en');
			window.__msurvNet = net;
			window.__drawn = new Set(); window.__toasts = [];
			addEventListener('DOMContentLoaded', () => {
				const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
				P.fillText = function (s, ...a) { if (typeof s === 'string' && window.G && G.I18n && window.__rec) window.__drawn.add(G.I18n.t(s)); return orig.call(this, s, ...a); };
				new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); })
					.observe(document.body, { childList: true, subtree: true, characterData: true });
			});
		}, tokens[who] || '', st, Object.assign({ ice: [], specCheckMs: 1500, invMs: 1200, friendsMs: 1500, lostMs: 9000, directMs: 8000 }, opts.net || {}));
		await page.goto(`http://localhost:${PORT}/micasurvivor/${opts.query || ''}`, { waitUntil: 'domcontentloaded' });
		const p = { who, ctx, page, E: (fn, ...a) => page.evaluate(fn, ...a) };
		p.visible = id => p.E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		p.shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
		p.click = sel => p.E(sel => { const el = document.querySelector(sel); if (!el || el.disabled) return false; el.click(); return true; }, sel);
		p.text = sel => p.E(sel => { const el = document.querySelector(sel); return el ? el.innerText : ''; }, sel);
		pages[who] = p;
		return p;
	};
	const boot = async (p) => {
		const ok = await waitFor(() => p.E(() => document.getElementById('boot').classList.contains('hidden') && !!G.Social && !!G.WatchUI), 30000);
		await sleep(200); if (await p.visible('tap-start')) await p.page.click('#tap-start');
		await waitFor(() => p.visible('scr-test'), 10000);
		for (let i = 0; i < 40 && await p.visible('scr-test'); i++) { await p.E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(90); }
		await waitFor(() => p.visible('scr-result'), 8000);
		await p.click('#res-ok');
		return ok && await waitFor(() => p.visible('scr-menu'), 10000);
	};
	const spanish = (p, sel) => p.E((sel, src) => {
		const els = [...document.querySelectorAll(sel)];
		if (!els.length) return ['missing ' + sel];
		let txt = els.map(e => e.innerText).join(' \n ').replace(/Pok[ée]mon/g, 'Pokemon');
		for (const d of G.DEX) if (/[^\x00-\x7f]/.test(d.name) && txt.includes(d.name)) txt = txt.split(d.name).join('#');
		return txt.match(new RegExp(src, 'gi')) || [];
	}, sel, SPANISH.source);
	const canvasSpanish = (p) => p.E((src) => [...window.__drawn].filter(s => new RegExp(src, 'i').test(String(s).replace(/Pok[ée]mon/g, 'Pokemon')) && !G.DEX.some(d => String(s).includes(d.name) && /[^\x00-\x7f]/.test(d.name))), SPANISH.source);
	// a quiet run: nobody spawns, nothing hits you, no XP (the test places its own enemies)
	const calm = (p) => p.E(() => {
		const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl.xpMul = 0; }
		if (!window.__calm) {
			window.__calm = true;
			G.Spawner.update = () => {}; G.Rift.update = () => {}; G.Events.update = () => {}; G.Judgment.update = () => {}; G.Weather.update = () => {};
		}
		for (const e of G.EnemyMgr.all().slice()) if (!e.dead && !e.netTest && !e.remote) { e.hp = 0; e.dead = true; }
	});
	// test enemies that stand still near the player (their HP set by hand)
	const placeEnemies = (p, list) => p.E((list) => {
		const pl = G.Game.player, ids = [];
		for (const [dex, dx, dy, hpk] of list) {
			const d = { dex, name: G.DEX_BY[dex].name, behavior: 'melee', hp: 1e7, spd: 0, dmg: 0, xp: 1 };   // (her attacks barely dent them)
			const e = new G.Enemy(d, pl.x + dx, pl.y + dy, { hp: 1, spd: 1, dmg: 1 }); e.spd = 0; e.netTest = true; e.update = function (dt) { this.anim.update(dt); };
			e.hp = Math.round(e.maxHp * hpk);
			G.EnemyMgr.add(e); ids.push(e.id);
		}
		return ids;
	}, list);

	// ===================== boot =====================
	const alice = await open('alice'), bob = await open('bob');
	A(await boot(alice) && await boot(bob), 'alice and bob boot signed in to the menu', errors.slice(0, 3).join(' | '));
	for (const p of [alice, bob]) await p.E(() => { window.__rec = true; G.Audio && G.Audio.music && G.Audio.music(null); });
	await waitFor(() => alice.E(() => G.Social.started && G.Social.friends.length >= 2), 8000);
	// the replay's entity codec (positions predicted from each entity's last step): random walkers, turns, stops, hits,
	// arrivals, deaths and departures round-trip exactly, frame by frame
	const codec = await alice.E(() => {
		const { table, applyTable } = G.Replay._codec;
		let enc = { m: new Map(), v: new Map() };
		const dec = { m: new Map(), v: new Map() };
		let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		let ents = [], nextId = 1, bad = 0, frames = 0, quiet = 0;
		for (let f = 0; f < 400; f++) {
			if (rnd() < 0.3) ents.push({ id: nextId++, dex: 1 + Math.floor(rnd() * 900), x: Math.floor(rnd() * 400), y: Math.floor(rnd() * 400), vx: Math.floor(rnd() * 9) - 4, vy: Math.floor(rnd() * 9) - 4, hp: 100, max: 50 + Math.floor(rnd() * 500), fl: 0 });
			const kd = [];
			ents = ents.filter(e => { if (rnd() < 0.03) { if (rnd() < 0.5) kd.push(e.id); return false; } return true; });
			for (const e of ents) {
				if (rnd() < 0.1) { e.vx = Math.floor(rnd() * 9) - 4; e.vy = Math.floor(rnd() * 9) - 4; }
				if (rnd() < 0.05) { e.vx = 0; e.vy = 0; }
				e.x += e.vx; e.y += e.vy;
				if (rnd() < 0.1) e.hp = Math.max(1, e.hp - Math.floor(rnd() * 30));
				if (rnd() < 0.02) e.fl ^= 4;
			}
			const rows = ents.map(e => [e.id, e.dex, e.x, e.y, e.hp, e.max, e.fl]).sort((a, b) => a[0] - b[0]);
			const known = new Set(enc.m.keys());   // (a foe that arrives and leaves within one frame was never recorded)
			const r = table(enc, rows, 6, kd);
			enc = r.st;
			const wire = JSON.parse(JSON.stringify(r.out));
			if (!wire) quiet++;
			const got = applyTable(dec, wire, 6);
			const want = JSON.stringify(rows), have = JSON.stringify([...dec.m.values()].sort((a, b) => a[0] - b[0]));
			if (want !== have || JSON.stringify(got.died.sort()) !== JSON.stringify(kd.filter(id => known.has(id)).sort())) bad++;
			frames++;
		}
		return { bad, frames, quiet };
	});
	A(codec.bad === 0 && codec.frames === 400, 'the replay codec round-trips 400 random frames exactly (walkers predicted from their last step; arrivals, turns, hits, deaths, departures)', JSON.stringify(codec));

	// ===================== alice plays, nobody watches: ~0 writes =====================
	const w0 = writes.length, t0 = Date.now();
	await alice.E(() => G.Flow.play('normal'));
	A(await waitFor(() => alice.E(() => G.Game.state === 'playing' && G.Spectate.publishing && G.Replay.recording), 5000), 'alice starts a solo run: the recorder and the live publisher are on');
	await calm(alice);
	const eids = await placeEnemies(alice, [[19, 120, 0, 0.6], [16, -90, 60, 1], [41, 30, -110, 0.35]]);
	await sleep(6500);
	const unw = writes.slice(w0).filter(w => /^msurv(live|state|spec)/.test(w.k));
	const checks = actions.filter(a => a.t >= t0 && a.action === 'publish-micasurvivor').length;
	A(unw.length === 1 && unw[0].k === 'msurvlive:alice' && !W('msurvstate:', w0).length, 'unwatched: one row write in 6.5 s (the "in a run" beacon at the start), no snapshot', JSON.stringify(unw.map(w => w.k)));
	A(checks >= 3 && checks <= 7, 'unwatched: the client only CHECKS for watchers (every ~1.5 s in this test, ~10 s live), sending no snapshot', checks);
	const unwMin = (unw.length / ((Date.now() - t0) / 60000));
	console.log(`   unwatched: ${unw.length} write(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${checks} watcher checks (live: 1 beacon at start + 1 per 5 min = ~0.2/min)`);
	const live = await call('live-friends', {}, tokens.bob);
	const la = (live.live || []).find(x => x.username === 'alice');
	A(la && la.kind === 'micasurvivor' && la.mode === 'micasurvivor' && la.label, '`live-friends` lists alice as kind micasurvivor (from her beacon: an unwatched solo run writes no presence)', JSON.stringify(live));
	const fr = await call('friends', {}, tokens.bob);
	const fa = (fr.friends || []).find(x => x.username === 'alice');
	A(fa && fa.online && fa.status === 'micasurvivor:run', '`friends` shows her online, status micasurvivor:run (the site\'s top bar / overworld lists route it to Watch)', JSON.stringify(fa));

	// ===================== bob: "Live now" -> Watch =====================
	await bob.page.click('#scr-menu [data-go=friends]');
	A(await waitFor(() => bob.visible('scr-friends'), 5000), 'bob opens Friends');
	A(await waitFor(async () => /alice/.test(await bob.text('#fr-live')) && /LIVE/.test(await bob.text('#fr-live')), 8000), 'bob\'s friends screen lists alice under "Live now" with a Watch button', await bob.text('#fr-live'));
	A(/live now/i.test(await bob.text('#fr-live-h')), 'the heading reads "Live now"', await bob.text('#fr-live-h'));
	A((await spanish(bob, '#scr-friends')).length === 0, 'the friends screen has no Spanish', JSON.stringify(await spanish(bob, '#scr-friends')));
	await sleep(300);
	await bob.shot('m5b12c_live_list.png');
	const ww0 = writes.length, wt0 = Date.now();
	await bob.click('#fr-live button[data-watch="alice"]');
	A(await waitFor(() => bob.E(() => G.Game.state === 'watch' && G.WatchUI.mode === 'live'), 4000), 'Watch opens the spectator view (state "watch")');
	A(await waitFor(() => bob.E(() => !!G.WatchUI.player), 9000), 'alice\'s client notices the watcher and publishes: bob sees her run', JSON.stringify(await bob.E(() => [G.WatchUI.status, G.Spectate.stats])));
	A(/Watching alice/.test(await bob.text('#watch-bar')) && /LIVE/.test(await bob.text('#watch-bar')), 'the banner reads "Watching alice · LIVE"', await bob.text('#watch-bar'));
	A(await waitFor(() => alice.E(() => window.__toasts.some(t => /bob is watching you/.test(t))), 4000), 'alice is told "bob is watching you"', JSON.stringify(await alice.E(() => window.__toasts)));
	// she walks; his view follows (snapshots once a second, gliding between them)
	await alice.page.keyboard.down('KeyD'); await sleep(1200); await alice.page.keyboard.up('KeyD');
	const a1 = await alice.E(() => ({ x: Math.round(G.Game.player.x), y: Math.round(G.Game.player.y), hp: Math.ceil(G.Game.player.hp), lv: G.Game.player.level, dex: G.Game.player.dex }));
	const seenA = () => bob.E(() => { const p = G.WatchUI.player; return p ? { x: Math.round(p.x), y: Math.round(p.y), hp: Math.ceil(p.hp), lv: p.level, dex: p.dex } : null; });
	A(await waitFor(async () => { const s = await seenA(); return s && Math.abs(s.x - a1.x) < 6 && Math.abs(s.y - a1.y) < 6; }, 5000), 'bob\'s view follows alice to where she stopped (within 6 px)', JSON.stringify([a1, await seenA()]));
	// mid-glide: between two snapshots the puppet is between them (no teleport)
	await alice.page.keyboard.down('KeyS');
	const glide = [];
	for (let i = 0; i < 24; i++) { glide.push((await seenA()).y); await sleep(110); if (i === 10) await alice.page.keyboard.up('KeyS'); }
	const steps = glide.slice(1).map((y, i) => y - glide[i]);
	A(steps.filter(d => d > 0).length >= 6 && Math.max(...steps) < 80, 'between snapshots the puppet glides (many small steps, no jumps)', JSON.stringify(glide));
	// enemies: species, position, HP
	await alice.E(ids => { const e = G.EnemyMgr.get(ids[0]); e.hp = Math.round(e.maxHp * 0.25); }, eids);
	await alice.E(() => { G.Game.player.hp = 37; });
	await sleep(2600);
	const ae = await alice.E(ids => ids.map(id => { const e = G.EnemyMgr.get(id); return [id, e.dex, Math.round(e.x), Math.round(e.y), Math.round(100 * e.hp / e.maxHp)]; }), eids);
	const be = await bob.E(ids => ids.map(id => { const e = G.EnemyMgr.get(id); return e ? [id, e.dex, Math.round(e.x), Math.round(e.y), Math.round(100 * e.hp / e.maxHp), e.remote] : null; }), eids);
	A(be.every((e, i) => e && e[1] === ae[i][1] && Math.abs(e[2] - ae[i][2]) <= 2 && Math.abs(e[3] - ae[i][3]) <= 2 && Math.abs(e[4] - ae[i][4]) <= 1 && e[5]),
		'bob sees her enemies: the same species, positions and HP (read-only copies)', JSON.stringify([ae, be]));
	const s2 = await seenA();
	A(s2.hp === 37 && s2.dex === a1.dex, 'bob sees her HP (37) and her Pokémon', JSON.stringify(s2));
	A(await bob.E(() => { const f = G.WatchUI.frame; return f && Array.isArray(f.mv) && f.mv.length >= 1 && G.WatchUI.player.moves.length === f.mv.length; }), 'her moves are in the snapshot and on his HUD');
	// a level-up: the screen being open shows on his side, then the new level
	const lv0 = await alice.E(() => G.Game.player.level);
	await alice.E(() => G.Game.debugLevelUp());
	await waitFor(() => alice.visible('scr-levelup'), 4000);
	A(await waitFor(() => bob.E(() => G.WatchUI.frame && G.WatchUI.frame.lu === 1), 5000), 'while she picks a card, bob\'s view knows the level-up screen is open');
	A(await waitFor(() => bob.E(() => [...window.__drawn].includes('Choosing an upgrade…')), 3000), '...and says "Choosing an upgrade…" on his canvas');
	await alice.click('#cards .card');
	A(await waitFor(async () => (await seenA()).lv === lv0 + 1, 5000), 'her new level reaches his view', JSON.stringify([lv0, await seenA()]));
	A(await waitFor(() => bob.E(() => [...window.__drawn].some(s => /Level \d+!/.test(s))), 4000), 'the level-up event shows as a banner ("Level N!")', JSON.stringify(await bob.E(() => [...window.__drawn].slice(-30))));
	await sleep(500);
	await bob.shot('m5b12c_spectator.png');
	await bob.page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
	await sleep(900);
	await bob.shot('m5b12c_spectator_844.png');
	const fit = await bob.E(() => { const b = document.getElementById('watch-bar').getBoundingClientRect(); const t = document.getElementById('watch-leave').getBoundingClientRect(); return { inside: b.left >= 0 && b.right <= innerWidth && b.top >= 0, btn: t.right <= innerWidth, txt: [...document.querySelectorAll('#watch-bar *')].every(e => e.scrollWidth <= e.clientWidth + 2 || e.classList.contains('wb-t')) }; });
	A(fit.inside && fit.btn && fit.txt, 'at 844x390 the banner and its Leave button fit', JSON.stringify(fit));
	await bob.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	// the write cost while watched
	const wt1 = Date.now(), ww1 = writes.length;
	await sleep(6000);
	const sec = (Date.now() - wt1) / 1000;
	const ws = W('msurvstate:alice', ww1).length, wh = W('msurvspec:alice:', ww1).length, wb = W('msurvspecbudget:', ww1).length, wl = W('msurvlive:', ww1).length;
	A(ws >= sec * 0.7 && ws <= sec * 1.25 + 1, 'watched: about one snapshot row write a second', `${ws} in ${sec.toFixed(1)} s`);
	A(wh >= 1 && wh <= sec / 4 + 1, '...the watcher\'s heartbeat at most every 4 s', wh);
	console.log(`   watched: ${ws} snapshot + ${wh} heartbeat + ${wb} budget + ${wl} beacon writes in ${sec.toFixed(1)} s => ~${Math.round(60 * (ws + wh + wb + wl) / sec)} writes/min`);
	const snapBytes = JSON.stringify((row('msurvstate:alice') || {}).snap || {}).length;
	A(snapBytes > 200 && snapBytes < 24000, 'one snapshot is small (under the 24 KB cap)', snapBytes);

	// ===================== bob's input does nothing to alice =====================
	const before = await alice.E(() => ({ x: G.Game.player.x, y: G.Game.player.y, st: G.Game.state, mv: G.Game.player.active }));
	for (const k of ['KeyD', 'KeyW', 'KeyZ', 'KeyC', 'Digit2', 'KeyP', 'Space']) { await bob.page.keyboard.down(k); await sleep(120); await bob.page.keyboard.up(k); }
	await bob.page.mouse.click(640, 360);
	await sleep(1500);
	const after = await alice.E(() => ({ x: G.Game.player.x, y: G.Game.player.y, st: G.Game.state, mv: G.Game.player.active }));
	A(JSON.stringify(before) === JSON.stringify(after), 'bob\'s keys and clicks do not touch alice\'s run', JSON.stringify([before, after]));
	A(await bob.E(() => G.Game.state === 'watch' && G.WatchUI.mode === 'live' && !G.DB.save.stats.runs), '...nor start anything on his side (still watching, no run of his own)');
	A((await spanish(bob, '#watch-bar')).length === 0 && (await canvasSpanish(bob)).length === 0, 'the spectator view has no Spanish (DOM + canvas)', JSON.stringify([await spanish(bob, '#watch-bar'), await canvasSpanish(bob)]));

	// ===================== the recorder's cost =====================
	const rs = await alice.E(() => Object.assign({}, G.Replay.stats, G.Replay.size));
	const perFrame = rs.obsMs / Math.max(1, rs.obsFrames);
	A(perFrame < 0.5, 'the recorder costs well under 0.5 ms a frame', `${perFrame.toFixed(4)} ms/frame avg over ${rs.obsFrames} frames; a sample ${(rs.recMs / Math.max(1, rs.frames)).toFixed(3)} ms avg, ${rs.recMax.toFixed(2)} ms max`);
	console.log(`   recorder: ${perFrame.toFixed(4)} ms/frame (avg, ${rs.obsFrames} frames), a sample every 0.5 s: ${(rs.recMs / Math.max(1, rs.frames)).toFixed(3)} ms avg / ${rs.recMax.toFixed(2)} ms max; ${rs.frames} frames, ${rs.bytes} JSON chars so far`);

	// ===================== the run ends: bob sees the summary =====================
	await alice.E(() => G.Game.endRun(true));
	A(await waitFor(() => alice.visible('scr-over'), 5000), 'alice\'s run ends (the run-over screen)');
	A(await waitFor(() => bob.visible('scr-watch-end'), 8000), 'bob gets the end card');
	const endTxt = await bob.text('#scr-watch-end');
	A(/alice's run has ended/.test(endTxt) && /Level/i.test(endTxt) && /Defeated/i.test(endTxt), 'the card reads "alice\'s run has ended" with her level and kills', endTxt);
	A((await spanish(bob, '#scr-watch-end')).length === 0, 'the end card has no Spanish', JSON.stringify(await spanish(bob, '#scr-watch-end')));
	await sleep(500);
	await bob.shot('m5b12c_watch_end.png');
	A(row('msurvlive:alice') && row('msurvlive:alice').over, 'her beacon says the run is over');
	const lf2 = await call('live-friends', {}, tokens.bob);
	A(!(lf2.live || []).some(x => x.username === 'alice'), '...so she is no longer listed as live');

	// ===================== share the replay; carl (no account) opens it =====================
	A(await waitFor(() => alice.E(() => { const b = document.getElementById('over-share'); return b && !b.disabled; }), 5000), 'the run summary offers "Share replay"');
	A(/Share replay/.test(await alice.text('#over-share-box')) && /Watch replay/.test(await alice.text('#over-share-box')), 'with "Share replay" and "Watch replay" (English)', await alice.text('#over-share-box'));
	await alice.shot('m5b12c_share_button.png');
	const wr0 = writes.length;
	await alice.click('#over-share');
	A(await waitFor(() => alice.E(() => /\/msr\/[a-f0-9]{8}$/.test(document.getElementById('over-link').value)), 8000), 'Share uploads it and shows the short link /msr/<id>', await alice.E(() => document.getElementById('over-link').value));
	const link = await alice.E(() => document.getElementById('over-link').value);
	const clip = await alice.E(() => navigator.clipboard.readText().catch(e => 'ERR ' + e.message));
	A(clip === link, 'the link is copied to the clipboard', clip);
	A(/Link copied/.test(await alice.text('#over-share-box')), '"Link copied!" (English)', await alice.text('#over-share-box'));
	await sleep(300);
	await alice.shot('m5b12c_share_copied.png');
	const rid = link.split('/').pop();
	const stored = row('msurvreplay:' + rid);
	A(stored && stored.by === 'alice' && stored.code.length < 1200000, 'the replay is the row msurvreplay:<id> (by alice), under the 1.2 MB cap', stored ? stored.code.length : null);
	A(W('', wr0).map(w => w.k).sort().join(',') === ['msurvreplay:' + rid, 'msurvreplays:alice'].sort().join(','), 'one upload = 2 row writes (the replay + her replay list)', JSON.stringify(W('', wr0).map(w => w.k)));
	const rdLen = await alice.E(() => G.Replay.last && G.Replay.last.code.length);
	console.log(`   replay: ${stored.meta.frames} frames (${stored.meta.time} s of run), packed ${stored.code.length} chars (${(stored.code.length / Math.max(1, stored.meta.time) * 1800 / 1024).toFixed(0)} KB per 30 min at this density)`);
	A(rdLen === stored.code.length, 'the copy kept in her browser is the uploaded one');
	const rd = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').split(/\r?\n/).map(l => l.trim());
	A(rd.includes('/msr/* /micasurvivor/?replay=:splat 302'), '/msr/<id> redirects (302) to /micasurvivor/?replay=<id>');
	// retrying the same upload returns the same id (no second row)
	const wr1 = writes.length;
	const again = await alice.E(async (rid0) => { const e = G.Replay.local().find(x => x.id === rid0); e.id = null; localStorage.setItem(G.Replay.STORE_KEY, JSON.stringify(G.Replay.local().map(x => x.id === rid0 ? e : Object.assign(x, {})).map(x => (x.rid === e.rid ? Object.assign(x, { id: null }) : x)))); const r = await G.Replay.share(e.rid); return r; }, rid);
	A(again.ok && again.id === rid && !W('msurvreplay:', wr1).length, 'a retried upload returns the first id and stores nothing new', JSON.stringify(again));

	const carl = await open('anon', { query: '?replay=' + rid });
	A(await waitFor(() => carl.E(() => G.WatchUI && G.WatchUI.mode === 'replay' && !!G.WatchUI.reader), 15000), 'carl (no account) opens the link: the replay loads (a public read)', errors.slice(-3).join(' | '));
	A(await carl.E(() => !localStorage.getItem('magepunk_mp_token_v1')), '...he has no Magepunk login');
	A(await waitFor(() => carl.E(() => G.WatchUI.T > 1 && G.WatchUI.playing && !!G.WatchUI.player), 6000), 'it plays (the clock runs, her Pokémon is drawn)');
	A(/Replay of alice/.test(await carl.text('#watch-bar')), 'the banner reads "Replay of alice"', await carl.text('#watch-bar'));
	const dur = await carl.E(() => G.WatchUI.reader.duration);
	// seek to the middle: the view shows that moment (her position at that frame)
	await carl.E(() => { const r = document.getElementById('wc-range'); r.value = 500; r.dispatchEvent(new Event('input')); });
	const mid = await carl.E(() => { const rd = G.WatchUI.reader, T = G.WatchUI.T; let i = 0; while (i + 1 < rd.length && rd.times[i + 1] <= T) i++; const f = rd.at(i); return { T, x: f.p[0], y: f.p[1], px: G.WatchUI.player.x, py: G.WatchUI.player.y }; });
	A(Math.abs(mid.T - dur / 2) < 1 && Math.abs(mid.px - mid.x) < 30 && Math.abs(mid.py - mid.y) < 30, 'seeking to 50% jumps there (the clock and her position at that frame)', JSON.stringify([dur, mid]));
	// speeds: 4x runs about four times as fast as 1x
	const rate = async (sp) => { await carl.E(sp => { [...document.querySelectorAll('#watch-ctrl .wc-sp')].find(b => +b.dataset.sp === sp).click(); }, sp); await carl.E(() => G.WatchUI.seek(1)); const a = await carl.E(() => [G.WatchUI.T, performance.now()]); await sleep(1000); const b = await carl.E(() => [G.WatchUI.T, performance.now()]); return (b[0] - a[0]) / ((b[1] - a[1]) / 1000); };
	const r1 = await rate(1), r4 = await rate(4);
	A(r1 > 0.7 && r1 < 1.3 && r4 > 2.8 && r4 < 4.6, 'the speed buttons work (1× ≈ real time, 4× ≈ four times)', JSON.stringify([r1.toFixed(2), r4.toFixed(2)]));
	A(await carl.E(() => document.querySelector('#watch-ctrl .wc-sp.on').dataset.sp === '4'), 'the 4× button is lit');
	await carl.E(() => G.WatchUI.togglePlay());
	const p1 = await carl.E(() => G.WatchUI.T); await sleep(500); const p2 = await carl.E(() => G.WatchUI.T);
	A(p1 === p2 && !(await carl.E(() => G.WatchUI.playing)), 'pause stops the clock', JSON.stringify([p1, p2]));
	await carl.E(() => { G.WatchUI.setSpeed(1); G.WatchUI.togglePlay(); });
	await carl.E(() => G.WatchUI.seek(G.WatchUI.reader.duration * 0.3));
	await sleep(700);
	await carl.E(() => { window.__rec = true; });
	await sleep(600);
	await carl.shot('m5b12c_replay_player.png');
	A((await spanish(carl, '#watch-bar, #watch-ctrl')).length === 0, 'the replay player has no Spanish', JSON.stringify(await spanish(carl, '#watch-bar, #watch-ctrl')));
	await carl.page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
	await sleep(600);
	await carl.shot('m5b12c_replay_player_844.png');
	const cfit = await carl.E(() => { const c = document.getElementById('watch-ctrl').getBoundingClientRect(), b = document.getElementById('watch-bar').getBoundingClientRect(); return { ctrl: c.left >= 0 && c.right <= innerWidth && c.bottom <= innerHeight, overlap: !(b.bottom <= c.top || b.top >= c.bottom) }; });
	A(cfit.ctrl && !cfit.overlap, 'at 844x390 the controls fit and do not overlap the banner', JSON.stringify(cfit));
	await carl.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	// the end: the run summary card
	await carl.E(() => { G.WatchUI.setSpeed(4); G.WatchUI.seek(G.WatchUI.reader.duration - 0.6); });
	A(await waitFor(() => carl.visible('scr-watch-end'), 5000), 'at its end the replay shows the run-summary card');
	const ce = await carl.text('#scr-watch-end');
	A(/End of the replay/.test(ce) && /Watch again/.test(ce) && /Level/i.test(ce), 'the card: "End of the replay", her level, "Watch again"', ce);
	A((await spanish(carl, '#scr-watch-end')).length === 0 && (await canvasSpanish(carl)).length === 0, 'no Spanish on the card or the canvas', JSON.stringify([await spanish(carl, '#scr-watch-end'), await canvasSpanish(carl)]));
	await carl.shot('m5b12c_replay_end.png');
	await carl.click('#watch-back');
	A(await waitFor(() => carl.E(() => G.Game.state === 'ui' && !G.WatchUI.mode && !/replay=/.test(location.search)), 5000), 'Back leaves the player (the ?replay= is dropped from the address)');
	await carl.ctx.close();

	// a bad id: the friendly message
	const bad = await open('anon2', { query: '?replay=deadbeef' });
	A(await waitFor(() => bad.visible('scr-watch-end'), 10000) && /doesn't exist or has expired/.test(await bad.text('#scr-watch-end')), 'an unknown replay id says it doesn\'t exist or has expired', await bad.text('#scr-watch-end'));
	await bad.ctx.close();

	// alice's local list: the run is under "Your recent runs" with Watch / Share
	await alice.click('#btn-again');
	await waitFor(() => alice.visible('scr-menu'), 6000);
	await alice.page.click('#scr-menu [data-go=friends]');
	A(await waitFor(async () => /Your recent runs/i.test(await alice.text('#fr-replays-h')) && /Lv\./.test(await alice.text('#fr-replays')), 5000), 'alice\'s friends screen lists her recent runs (kept in her browser)', await alice.text('#fr-replays'));
	A((await spanish(alice, '#scr-friends')).length === 0, '...in English', JSON.stringify(await spanish(alice, '#scr-friends')));

	// ===================== dave (not a friend) is refused =====================
	const dave = await open('dave', { query: '?watch=alice' });
	A(await waitFor(() => dave.visible('scr-watch-end'), 12000) && /Only friends can watch/.test(await dave.text('#scr-watch-end')), 'a non-friend opening ?watch=alice is told only friends can watch', await dave.text('#scr-watch-end'));
	await dave.ctx.close();

	// ===================== a local co-op run (the partner, P2 / AI) =====================
	await bob.click('#watch-back');
	await waitFor(() => bob.E(() => G.Game.state === 'ui'), 5000);
	await alice.E(() => G.MenuUI.open());
	await alice.E(() => G.Flow.play('coop'));
	A(await waitFor(() => alice.E(() => G.Game.state === 'playing' && G.LocalCoop.on && !!G.LocalCoop.mate), 5000), 'alice starts a local co-op run (with the AI partner)');
	await calm(alice);
	await alice.E(() => { G.LocalCoop.mate.hp = Math.round(G.LocalCoop.mate.maxHp * 0.5); });
	const run2 = await alice.E(() => G.Spectate.runId);
	A(await waitFor(() => (row('msurvlive:alice') || {}).run === run2 && !row('msurvlive:alice').over, 5000), 'the new run has its own beacon (a new run id)');
	await bob.E(() => G.WatchUI.watchLive('alice', () => G.MenuUI.open()));
	A(await waitFor(() => bob.E(() => !!G.WatchUI.player && G.WatchUI.drawables().length >= 2), 10000), 'bob watches it: alice AND her partner are drawn', JSON.stringify([await bob.E(() => [G.WatchUI.status, G.WatchUI.frame && G.WatchUI.frame.mt, G.WatchUI.frame && G.WatchUI.frame.m]), await alice.E(() => { const s = G.Spectate.snap(); return [s.mt, s.m, G.Spectate.watchers]; }), errors.slice(-4)]));
	const lm = await alice.E(() => ({ x: Math.round(G.LocalCoop.mate.x), y: Math.round(G.LocalCoop.mate.y), dex: G.LocalCoop.mate.dex }));
	await sleep(2500);
	const bm = await bob.E(() => { const m = G.WatchUI.drawables()[1]; return { x: Math.round(m.x), y: Math.round(m.y), dex: m.dex, tag: m.tag, hp: m.hp, max: m.maxHp }; });
	const lm2 = await alice.E(() => ({ x: Math.round(G.LocalCoop.mate.x), y: Math.round(G.LocalCoop.mate.y), hp: G.LocalCoop.mate.hp }));
	A(bm.dex === lm.dex && Math.abs(bm.x - lm2.x) < 60 && Math.abs(bm.y - lm2.y) < 60 && / · AI$/.test(bm.tag), 'the partner: the same Pokémon, where it is, tagged "· AI"', JSON.stringify([lm2, bm]));
	A(Math.abs(bm.hp / bm.max - 0.5) < 0.05, '...with its HP (half)', JSON.stringify(bm));
	A(await waitFor(() => bob.E(() => [...window.__drawn].some(s => / · AI · \d+%$/.test(s))), 3000), 'the partner\'s HP is on his canvas line ("Name · AI · 50%")');
	await sleep(400);
	await bob.shot('m5b12c_watch_localcoop.png');
	await alice.E(() => G.Game.endRun(false));
	await waitFor(() => bob.visible('scr-watch-end'), 8000);
	await bob.click('#watch-back');
	await alice.click('#btn-again');

	// ===================== an online co-op group, watched through a guest =====================
	const carl2 = await open('carl');
	A(await boot(carl2), 'carl boots signed in');
	await waitFor(() => alice.visible('scr-menu'), 6000);
	await waitFor(() => carl2.E(() => G.Social.started && G.Social.friends.length >= 2), 8000);
	await alice.E(async () => { await G.Social.createRoom(); await G.Social.invite('carl'); });
	A(await waitFor(() => carl2.E(() => G.Social.invites.some(i => i.from === 'alice')), 9000), 'alice invites carl to a lobby');
	await carl2.E(() => G.Social.acceptInvite('alice'));
	await waitFor(() => carl2.E(() => !!G.Social.room), 6000);
	A(await waitFor(() => alice.E(() => G.Net.mode('carl') === 'direct'), 25000), 'their data channel opens (WebRTC on localhost)');
	await carl2.E(() => G.Social.setReady(true));
	await waitFor(() => alice.E(() => G.Social.room.members.every(m => m.ready)), 8000);
	await alice.E(() => document.getElementById('lobby-start') ? document.getElementById('lobby-start').click() : null);
	await alice.E(async () => { if (G.Game.state === 'ui') { const r = await G.Social.startRoom(Math.floor(Math.random() * 1e6)); G.Net.broadcast(r.cfg); G.Flow.startCoop(r.cfg); } });
	A(await waitFor(async () => (await Promise.all([alice, carl2].map(p => p.E(() => G.Game.state === 'playing' && G.Coop.active)))).every(Boolean), 15000), 'alice (host) and carl are in one online co-op run');
	await calm(alice); await calm(carl2);
	await bob.E(() => G.WatchUI.watchLive('carl', () => G.MenuUI.open()));
	A(await waitFor(() => bob.E(() => !!G.WatchUI.player && G.WatchUI.drawables().some(p => p.tag === 'alice')), 12000), 'bob watches the group through carl (a guest): carl is the player, alice his partner');
	const cpos = await carl2.E(() => ({ x: Math.round(G.Game.player.x), y: Math.round(G.Game.player.y), ax: Math.round(G.Coop.mate('alice').pl.x), ay: Math.round(G.Coop.mate('alice').pl.y) }));
	await sleep(2500);
	const bpos = await bob.E(() => { const d = G.WatchUI.drawables(); const a = d.find(p => p.tag === 'alice'); return { x: Math.round(d[0].x), y: Math.round(d[0].y), ax: Math.round(a.x), ay: Math.round(a.y) }; });
	A(Math.abs(bpos.x - cpos.x) < 20 && Math.abs(bpos.y - cpos.y) < 20 && Math.abs(bpos.ax - cpos.ax) < 40 && Math.abs(bpos.ay - cpos.ay) < 40, 'he sees both where they are', JSON.stringify([cpos, bpos]));
	const lf3 = await call('live-friends', {}, tokens.bob);
	const lc = (lf3.live || []).find(x => x.username === 'carl'), lal = (lf3.live || []).find(x => x.username === 'alice');
	A(lc && lal && lc.group.includes('alice') && lal.group.includes('carl') && /co-op with/.test(lc.label), 'both members are listed live, each with the group (any member can be watched)', JSON.stringify(lf3.live));
	await sleep(300);
	await bob.shot('m5b12c_watch_coop_group.png');
	await bob.page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
	await sleep(700);
	await bob.shot('m5b12c_watch_coop_group_844.png');
	await bob.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	A((await canvasSpanish(bob)).length === 0, 'still no Spanish on the canvas', JSON.stringify(await canvasSpanish(bob)));
	// Esc leaves to the menu
	await bob.page.keyboard.press('Escape');
	A(await waitFor(() => bob.E(() => G.Game.state === 'ui' && !G.WatchUI.mode && G.UI.isOpen('scr-menu')), 5000), 'Esc leaves the spectator view, back to the menu');
	await alice.E(() => G.Game.quit());

	A(!errors.length, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	A(false, 'crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
