// micatro_record_stickers_test.mjs — the Achievements screen's Record tab wears win stickers (a tester: "maybe stickers on
// this screen too? Not sure which I'm missing the nuz+mono"): each of the 12 type tiles shows Arceus when that type has a
// Nuzlocke + Monotype win, Ambipom when it only has a Monotype win, a greyed sticker when it has neither — each in the ring
// colour of its best stake — and the three totals wear Aipom / Ambipom / Arceus. End to end over the REAL account handler
// (server/mp.mjs, bundled like the dev server, over an in-memory sqlite D1 stand-in) behind a static server, headless Chrome:
//   1. a record from BEFORE the per-type fields (kgib's live shape, 2026-10-20: 12 Monotype types, 9 Nuzlocke + Monotype
//      wins as a bare total) + that player's saved replays: micatro-progress-get backfills the per-type wins at read time,
//      so the Record shows the 9 Arceus types and the 3 still missing (Fire, Colorless, Dragon) as Ambipom; the stored row
//      only ever grows (the client's normal put max-merges it)
//   2. the same screen fits a phone (390x664 portrait): no tile, sticker or total spills out of the modal or the page
//   3. a fresh account: every tile's sticker is greyed (nothing won)
// Covers micatro/js/ui/screens.js (recordPanel), micatro/js/ui/progress.js (typeRecord, totalLevels),
// micatro/js/ui/stickers.js (specialStickerHTML), micatro/css/micatro.css (.wstk, .rec-*), server/mp.mjs (the backfill).
//   node overworld/tests/micatro_record_stickers_test.mjs   [SHOTS=<dir> saves screenshots]
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9561;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const put = (k, v) => sqlite.prepare('INSERT OR REPLACE INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch())').run(k, JSON.stringify(v));   // (fresh: the GC sweeps old mreplay: rows)
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-rec-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.11.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	return (await handler(req, { MP_DB })).json();
};
const CT = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.fs': 'text/plain' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.12.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': CT[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));   // gitignored art: the main checkout
	});
});
await new Promise(r => server.listen(PORT, r));

const tokens = {};
for (const n of ['recold', 'recnew']) tokens[n] = (await call('register', { username: n, password: 'record-e2e-pass' })).token;
A(tokens.recold && tokens.recnew, 'real accounts registered');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state;

// kgib's live record (micatro_progress:kgib, read 2026-10-20) and the badges of the replays he has saved
const ALL = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'dark', 'metal', 'fairy', 'dragon', 'earth'];
const OLD = { v: 1, nuz: 9, nuzStake: 2, both: 9, mono: Object.fromEntries(ALL.map((t) => [t, 1])), ach: { first_monotype: 1792384680000, first_nuzlocke: 1792423490452, monotype_all: 1792533855556, nuzlocke_monotype: 1792423490452 } };
put('micatro_progress:recold', { rev: 13, progress: OLD, updated_at: 1792533855736 });
const REPLAYS = [
	[2, { mono: 'colorless' }], [1, { nuz: true, mono: 'water' }], [1, { nuz: true, mono: 'grass' }], [2, { nuz: true, mono: 'dark' }],
	[2, { nuz: true, mono: 'earth' }], [2, { nuz: true, mono: 'lightning' }], [2, { mono: 'fairy' }], [2, { nuz: true, mono: 'fairy' }],
	[2, { nuz: true, mono: 'fighting' }], [2, { nuz: true, mono: 'psychic' }], [2, { nuz: true, mono: 'metal' }], [1, null], [2, null],
];
REPLAYS.forEach(([stake, badges], i) => put('mreplay:' + (0xb0000000 + i).toString(16), { code: 'G1.x', meta: { won: true, stake, mods: ['pokermon'], ...(badges ? { badges } : {}) }, by: 'recold', when: 1 }));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const device = async (name, vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ ...vp, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push(name + ' pageerr: ' + e.message));
		await page.goto(`http://localhost:${PORT}/micatro/nothing.txt`);
		await page.evaluate(() => { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
		return { ctx, page, errors, name };
	};
	const boot = async (d, who) => {
		const st = await stateOf(who);
		await d.page.evaluate((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.removeItem('micatro_run_v1'); }, tokens[who], st);
		await d.page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		return waitFor(() => d.page.evaluate(() => !!(window.__micatro && window.__micatro.ready) && !!document.querySelector('.menu-modal .b-achievements')), 40000);
	};
	const openRecord = async (d) => {
		await d.page.evaluate(() => document.querySelector('.b-achievements').click());
		await sleep(300);
		await d.page.evaluate(() => document.querySelector('.b-ach-rec').click());
		return waitFor(() => d.page.evaluate(() => { const im = [...document.querySelectorAll('.rec .wstk img')]; return im.length > 0 && im.every((i) => i.complete && i.naturalWidth > 0); }), 10000);
	};
	const closeRecord = (d) => d.page.evaluate(() => { const b = document.querySelector('.ach-modal .b-back'); if (b) b.click(); });
	const tiles = (d) => d.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.rec-type')].map((e) => { const s = e.querySelector('.wstk'); return [e.dataset.type.toLowerCase(), s ? s.dataset.sticker : null]; })));
	const totals = (d) => d.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.rec-stat')].map((e) => { const s = e.querySelector('.wstk'); return [e.dataset.cat, s ? s.dataset.sticker : null]; })));
	const shot = async (d, name) => { if (SHOTS) await d.page.screenshot({ path: path.join(SHOTS, name) }); };
	/** Everything on the Record inside the modal box and the viewport (no spill, no sideways scroll); stickers inside their tile. */
	const fits = (d) => d.page.evaluate(() => {
		const R = (e) => e.getBoundingClientRect();
		const box = R(document.querySelector('.ach-modal') || document.querySelector('.modal-box'));
		const vw = innerWidth;
		const bad = [];
		const inside = (r, o, s) => { if (r.left < o.left - 0.5 || r.right > o.right + 0.5) bad.push(s + ' ' + [r.left, r.right, o.left, o.right].map(Math.round).join(',')); };
		for (const t of document.querySelectorAll('.rec-type, .rec-stat')) {
			inside(R(t), box, t.className);
			const s = t.querySelector('.wstk');
			if (s) inside(R(s), R(t), 'sticker in ' + (t.dataset.type || t.dataset.cat));
			const n = t.querySelector('.rec-tn');
			if (n && n.scrollWidth > n.clientWidth + 1) bad.push('name clipped ' + t.dataset.type);
		}
		if (box.left < -0.5 || box.right > vw + 0.5) bad.push('modal off screen');
		if (document.documentElement.scrollWidth > vw + 1) bad.push('page scrolls sideways');
		return bad;
	});

	// ===== 1. kgib's record, backfilled from his replays =====
	const dA = await device('desktop', { width: 1280, height: 800 });
	A(await boot(dA, 'recold'), 'desktop: signed in, main menu up');
	A(await waitFor(() => dA.page.evaluate(() => { const p = window.__micatro.progress.getProgress(); return p && p.bothMono && Object.keys(p.bothMono).length === 9; }), 15000), 'the record syncs with its per-type Nuzlocke + Monotype wins (read-time backfill)', JSON.stringify(await dA.page.evaluate(() => window.__micatro.progress.getProgress())));
	A(await openRecord(dA), 'the Record tab opens and its sticker art loads');
	const tA = await tiles(dA);
	const both = ALL.filter((t) => /^both:/.test(tA[t] || '')), mono = ALL.filter((t) => /^mono:/.test(tA[t] || ''));
	A(both.length === 9 && JSON.stringify(mono) === '["fire","colorless","dragon"]', 'the tiles: 9 Arceus (Nuzlocke + Monotype) and Ambipom on the 3 still missing it (Fire, Colorless, Dragon)', JSON.stringify(tA));
	A(tA.water === 'both:White' && tA.grass === 'both:White' && tA.dark === 'both:Red' && tA.fairy === 'both:Red' && tA.colorless === 'mono:Red' && tA.fire === 'mono:White', 'each ring is its best stake (Water/Grass White, Dark/Fairy Red; Colorless Monotype Red; Fire known only by count: White)', JSON.stringify(tA));
	const tot = await totals(dA);
	A(tot.nuz === 'nuz:Red' && tot.mono === 'mono:Red' && tot.both === 'both:Red', 'the totals wear Aipom / Ambipom / Arceus at their best stake', JSON.stringify(tot));
	A(await dA.page.evaluate(() => !document.querySelector('.rec-unplaced')), 'every Nuzlocke + Monotype win found its type (no "could not be matched" note)');
	A(await dA.page.evaluate(() => { const t = document.querySelector('.rec-type[data-type="Fire"] .wstk'); return t && /no Nuzlocke \+ Monotype yet/.test(t.title); }), "a tile's sticker says what it means (title)");
	const fA = await fits(dA);
	A(!fA.length, 'desktop: the Record fits', JSON.stringify(fA));
	await shot(dA, 'record_desktop.png');
	await sleep(1500);
	const r1 = row('micatro_progress:recold');
	A(r1.rev === 13 && JSON.stringify(r1.progress) === JSON.stringify(OLD), 'the backfill is read-time: the stored row is untouched (the next recorded win pushes it, max-merged)', JSON.stringify(r1));
	await closeRecord(dA);

	// ===== 2. a phone =====
	const dP = await device('phone', { width: 390, height: 664 });
	A(await boot(dP, 'recold'), 'phone: signed in, main menu up');
	A(await waitFor(() => dP.page.evaluate(() => Object.keys(window.__micatro.progress.getProgress().bothMono || {}).length === 9), 15000), 'phone: the record syncs (backfilled)', JSON.stringify(await dP.page.evaluate(() => [window.__micatro.progress.getProgress(), Object.keys(localStorage)])));
	A(await openRecord(dP), 'phone: the Record tab opens');
	A(await dP.page.evaluate(() => document.getElementById('stage').classList.contains('portrait')), 'phone: the portrait layout');
	const tP = await tiles(dP);
	A(JSON.stringify(tP) === JSON.stringify(tA), 'phone: the same stickers', JSON.stringify(tP));
	const fP = await fits(dP);
	A(!fP.length, 'phone: no tile, sticker or total spills out (and no sideways scroll)', JSON.stringify(fP));
	await shot(dP, 'record_phone.png');
	await closeRecord(dP);

	// ===== 3. a fresh account =====
	const dN = await device('fresh', { width: 1280, height: 800 });
	A(await boot(dN, 'recnew'), 'fresh account: main menu up');
	A(await openRecord(dN), 'fresh account: the Record tab opens');
	const tN = await tiles(dN), totN = await totals(dN);
	A(ALL.every((t) => tN[t] === 'both:none') && Object.values(totN).every((s) => /:none$/.test(s)), 'nothing won: every sticker is greyed', JSON.stringify([tN, totN]));
	A(await dN.page.evaluate(() => document.querySelectorAll('.rec-type .wstk.wstk-off').length === 12), '... (the greyed style)');
	await shot(dN, 'record_fresh.png');

	for (const d of [dA, dP, dN]) A(!d.errors.length, d.name + ': no page errors', d.errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
