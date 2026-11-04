// micatro_stickers_account_test.mjs — Micatro's per-joker win (stake) stickers are saved on the Magepunk
// account (server/mp.mjs micatro-stickers-get / -put; micatro/js/ui/stickers.js + net.js), end to end:
// the REAL handler (bundled like the dev server) over an in-memory sqlite D1 stand-in behind a static
// server, headless Chrome with SEPARATE browser contexts (contexts sharing one profile would share
// localStorage) standing in for separate devices:
//   1. migration: stickers already in this browser's localStorage (the old flat {key: level} form) move to
//      the account on sign-in as {key: {win: level}} (and stay in the browser)
//   2. second device: a fresh browser, same account, empty storage, sees them on its jokers
//   3. race: device A wins at Gold (a real engine win) while device B still holds Red; after sync both
//      show Gold, and a later Red win on B never lowers it
//      (+ a Pokermon category win — {categories: ['win', 'nuz']} — syncs, and B then shows the Aipom sticker)
//   4. server failure: with the API failing (500), a win keeps its sticker locally (also across a reload)
//      and is retried until it lands
//   5. guest -> sign-in: a guest's stickers move into the first account that signs in on that browser
//   6. switching accounts: another account on that browser inherits nothing (and the server row stays clean)
//   7. revoked: the admin's `revoked` on the row ({b_plasma: {cats: true, at}}, {j_half: ['nuz']}) makes a device
//      holding those stickers drop them on load and never push them back (the row stays without them; the
//      others are untouched); a NEW win of the revoked key after `at` sticks (re-earn rule), and a stale
//      device still holding the old, higher level drops it and takes the re-earned one
//   node overworld/tests/micatro_stickers_account_test.mjs
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
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9533;
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
const serverWins = (u) => (row('micatro_stickers:' + u) || {}).wins || {};
const W = (u, k, cat = 'win') => ((serverWins(u)[k]) || {})[cat];
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-stka-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	return (await handler(req, { MP_DB })).json();
};

// the sticker actions can be made to fail (500) to test the offline path; every sticker call is logged
let failStickers = false;
const stickerCalls = [];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let action = ''; try { action = JSON.parse(raw).action || ''; } catch { }
		if (/^micatro-stickers-/.test(action)) {
			let body = {}; try { body = JSON.parse(raw); } catch { }
			stickerCalls.push({ action, failed: failStickers, auth: !!req.headers.authorization, wins: body.wins || null, earned: body.earned || null });
			if (failStickers) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'boom' })); return; }
		}
		const ip = '10.8.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const tokens = {};
for (const n of ['stka', 'stkcarol', 'stkdave', 'stkrev']) tokens[n] = (await call('register', { username: n, password: 'stickers-e2e-pass' })).token;
A(tokens.stka && tokens.stkcarol && tokens.stkdave, 'three real accounts registered');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state;

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

	/** A "device": its own browser context (own localStorage). */
	const device = async (name) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push(name + ' pageerr: ' + e.message));
		await page.goto(`http://localhost:${PORT}/micatro/nothing.txt`); // the origin, so localStorage can be set before the game boots
		await page.evaluate(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
		return { ctx, page, errors, name };
	};
	/** Sign the device in as `who` (or out, null), optionally seeding storage, then (re)load the game. */
	const boot = async (d, who, seed = {}) => {
		const st = who ? await stateOf(who) : null;
		await d.page.evaluate((tok, st, seed) => {
			if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			else { localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); }
			localStorage.removeItem('micatro_run_v1');
			for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
		}, who ? tokens[who] : null, st, seed);
		await d.page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		return waitFor(() => d.page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000);
	};
	const S = (d, fn, ...args) => d.page.evaluate(async (src, args) => { const M = await import('/micatro/js/ui/stickers.js'); return new Function('M', 'args', 'return (' + src + ')(M, ...args)')(M, args); }, fn.toString(), args);
	const sticker = (d, k) => S(d, (M, k) => M.winSticker(k, true), k);
	const local = (d, u) => d.page.evaluate((u) => JSON.parse(localStorage.getItem('micatro_joker_wins_v1:' + u) || '{}'), u);
	const settled = (d, ms = 15000) => waitFor(() => S(d, (M) => { const s = M.stickerSyncState && M.stickerSyncState(); return !!(s && s.synced && !s.dirty && !s.inflight); }), ms);
	const idle = (d) => waitFor(() => d.page.evaluate(() => window.__micatro.idle()), 30000);
	/** A real run won through the engine (the last ante's three blinds), so main.js records the win. */
	const winRun = async (d, opts) => {
		await d.page.evaluate((o) => window.__micatro.newRun(o), opts);
		await waitFor(() => d.page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 40000);
		await d.page.evaluate(async (keys) => {
			const { G, add_joker } = await import('/micatro/js/engine/core.js');
			for (const k of keys) add_joker(k);
			G.E_MANAGER.flush();
			G.GAME.round_resets.ante = G.GAME.win_ante;
		}, opts.jokers || []);
		const act = async (a) => { await idle(d); const r = await d.page.evaluate((a) => window.__micatro.act(a), a); await idle(d); return r; };
		for (let b = 0; b < 3; b++) {
			await act({ type: 'select_blind' });
			const ids = await d.page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.chips = G.GAME.blind.chips; return [G.hand.cards[0].sort_id]; });
			await act({ type: 'highlight', ids });
			await act({ type: 'play' });
			if (b < 2) { await act({ type: 'cash_out' }); await act({ type: 'next_round' }); }
		}
		await idle(d);
		return d.page.evaluate(() => window.__micatro.events.filter((e) => e.type === 'win').slice(-1)[0] || null);
	};

	// ===== 1. migration: stickers already in this browser move to the account =====
	const devA = await device('A');
	A(await boot(devA, 'stka', { 'micatro_joker_wins_v1:stka': { j_joker: 2, j_greedy_joker: 1 } }), 'device A: game ready (signed in, with stickers from before they were saved on the account)');
	const migrated = await waitFor(() => W('stka', 'j_joker') === 2 && W('stka', 'j_greedy_joker') === 1, 15000);
	A(migrated, 'signing in pushes the browser\'s existing stickers to the account', JSON.stringify(row('micatro_stickers:stka')));
	{ const l = (await local(devA, 'stka')).j_joker; A((l === 2 || l?.win === 2) && (await S(devA, (M) => M.winRecord('j_joker'))).win === 2, 'and the browser keeps its copy (local data is never deleted)', JSON.stringify(l)); }

	// ===== 2. a second device, same account, empty storage =====
	const devB = await device('B');
	A(await boot(devB, 'stka'), 'device B: game ready (same account, empty localStorage)');
	A(await settled(devB), 'device B synced with the account');
	A(await sticker(devB, 'j_joker') === 'Red' && await sticker(devB, 'j_greedy_joker') === 'White', 'device B sees the account\'s stickers', JSON.stringify([await sticker(devB, 'j_joker'), await sticker(devB, 'j_greedy_joker')]));
	await devB.page.evaluate(() => window.__micatro.newRun({ stake: 1 }));
	await idle(devB);
	await devB.page.evaluate(async () => { const { G, add_joker } = await import('/micatro/js/engine/core.js'); add_joker('j_joker'); G.E_MANAGER.flush(); });
	await devB.page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle(devB);
	const tipB = await devB.page.evaluate(() => { const b = window.__micatro.board; for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s.d.center === 'j_joker') b.showCardTip(s, true); } return b.tip ? b.tip.textContent : ''; });
	A(/Red Sticker/.test(tipB), 'its Joker on the table wears the Red sticker (tooltip)', tipB.slice(0, 120));
	A((await local(devB, 'stka')).j_joker?.win === 2, 'device B caches them locally (offline copy)');

	// ===== 3. race: A wins at Gold (a real win) while B still holds Red =====
	const ev = await winRun(devA, { stake: 8, jokers: ['j_joker', 'j_lusty_joker'] });
	A(ev && ev.stake === 8 && ev.jokers.includes('j_joker'), 'device A wins a real run at Gold Stake', JSON.stringify(ev));
	A(await waitFor(() => W('stka', 'j_joker') === 8 && W('stka', 'j_lusty_joker') === 8, 15000), 'the Gold win reaches the account', JSON.stringify(serverWins('stka')));
	A(await sticker(devB, 'j_joker') === 'Red', 'device B (not reloaded) still holds Red');
	// B now wins at Red with the Joker (and a new joker): its push carries j_joker:2, the server keeps Gold
	const nB = await S(devB, (M) => M.recordWin({ jokers: ['j_joker', 'j_half'], stake: 2 }));
	A(nB === 1, 'device B records a Red win (only the new joker rises locally)', nB);
	A(await waitFor(() => W('stka', 'j_half') === 2, 15000) && await settled(devB), 'device B\'s Red win reaches the account');
	A(W('stka', 'j_joker') === 8, 'a later Red win on B never lowers the Gold on the account', JSON.stringify(serverWins('stka')));
	A(await sticker(devB, 'j_joker') === 'Gold' && await sticker(devB, 'j_lusty_joker') === 'Gold', 'device B picks up Gold from the merged reply', JSON.stringify([await sticker(devB, 'j_joker'), await sticker(devB, 'j_lusty_joker')]));
	A(await boot(devA, 'stka') && await settled(devA), 'device A reloads and syncs');
	A(await sticker(devA, 'j_joker') === 'Gold' && await sticker(devA, 'j_half') === 'Red', 'both devices now agree (A has Gold + B\'s Red win)', JSON.stringify([await sticker(devA, 'j_joker'), await sticker(devA, 'j_half')]));
	// a Pokermon category win (the Nuzlocke detection is another module's: it passes `categories`) syncs too
	A(await S(devA, (M) => M.recordWin({ jokers: ['j_joker'], stake: 1, categories: ['win', 'nuz'] })) === 1, 'device A records a White-stake Nuzlocke win');
	A(await waitFor(() => W('stka', 'j_joker', 'nuz') === 1 && W('stka', 'j_joker') === 8, 15000), 'the account keeps {win: Gold, nuz: White} for the Joker', JSON.stringify(serverWins('stka').j_joker));
	A(await boot(devB, 'stka') && await settled(devB), 'device B reloads and syncs');
	const infoB = await S(devB, (M) => M.winStickerInfo('j_joker', true));
	A(infoB && infoB.category === 'nuz' && infoB.special && infoB.special.pokemon === 'Aipom' && infoB.stake === 'White' && infoB.level === 1,
		'device B now shows the Aipom (Nuzlocke) sticker, ringed White — a special beats the Gold plain sticker', JSON.stringify(infoB));
	await devA.ctx.close();

	// ===== 4. server failure: keep the local sticker, retry =====
	failStickers = true;
	const c0 = stickerCalls.length;
	await S(devB, (M) => M.recordWin({ jokers: ['j_banner'], stake: 5 }));
	await waitFor(() => stickerCalls.slice(c0).filter((c) => c.failed).length >= 2, 15000);
	A(stickerCalls.slice(c0).filter((c) => c.failed && c.action === 'micatro-stickers-put').length >= 2, 'a failing server (500) is retried', JSON.stringify(stickerCalls.slice(c0)));
	A(await sticker(devB, 'j_banner') === 'Blue' && (await local(devB, 'stka')).j_banner?.win === 5 && !serverWins('stka').j_banner, 'the sticker is kept locally while the account is unreachable');
	A(await boot(devB, 'stka'), 'device B reloads while the server is still failing');
	A(await sticker(devB, 'j_banner') === 'Blue', 'the unsent sticker survives the reload (local cache)');
	failStickers = false;
	A(await waitFor(() => W('stka', 'j_banner') === 5, 25000), 'once the server is back the retry lands it on the account', JSON.stringify(serverWins('stka')));
	A(W('stka', 'j_joker') === 8, '...without lowering anything');
	await devB.ctx.close();

	// ===== 5. guest -> sign-in =====
	const devG = await device('G');
	A(await boot(devG, null), 'device G: game ready as a guest');
	const cG = stickerCalls.length;
	await S(devG, (M) => M.recordWin({ jokers: ['j_scholar', 'j_joker'], stake: 3 }));
	await sleep(2500);
	A((await local(devG, 'guest')).j_scholar?.win === 3, 'a guest\'s win is stored in this browser');
	A(stickerCalls.slice(cG).length === 0, 'a guest never calls the account API', JSON.stringify(stickerCalls.slice(cG)));
	A(await boot(devG, 'stkcarol') && await settled(devG), 'the guest signs in as carol');
	A(await waitFor(() => W('stkcarol', 'j_scholar') === 3 && W('stkcarol', 'j_joker') === 3, 15000), 'the guest\'s stickers are carried into carol\'s account', JSON.stringify(serverWins('stkcarol')));
	A(await sticker(devG, 'j_scholar') === 'Green', 'carol sees them');
	A((await local(devG, 'guest')).j_scholar?.win === 3, 'the guest record itself is kept');

	// ===== 6. switching accounts =====
	A(await boot(devG, 'stkdave') && await settled(devG), 'the same browser signs in as dave');
	A(!(await sticker(devG, 'j_scholar')) && !(await sticker(devG, 'j_joker')), 'dave inherits none of carol\'s (or the guest\'s) stickers', JSON.stringify([await sticker(devG, 'j_scholar'), await sticker(devG, 'j_joker')]));
	A(Object.keys(await local(devG, 'stkdave')).length === 0 && Object.keys(serverWins('stkdave')).length === 0, 'dave\'s local cache and account row stay empty');
	await S(devG, (M) => M.recordWin({ jokers: ['j_mime'], stake: 4 }));
	A(await waitFor(() => W('stkdave', 'j_mime') === 4, 15000) && await settled(devG), 'dave\'s own win lands on dave\'s account');
	A(!serverWins('stkcarol').j_mime && !serverWins('stka').j_mime, '...and nobody else\'s');
	A(await boot(devG, 'stkcarol') && await settled(devG), 'back to carol');
	A(await sticker(devG, 'j_scholar') === 'Green' && !(await sticker(devG, 'j_mime')), 'carol has hers and not dave\'s');
	const errs = [...devG.errors];
	await devG.ctx.close();

	// ===== 7. revoked stickers (an admin edit of the row) =====
	const revAt = Date.now() - 60_000;
	sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 0)').run('micatro_stickers:stkrev', JSON.stringify({
		v: 2, wins: { j_joker: { win: 3 } }, rev: 1, updatedAt: revAt,
		revoked: { b_plasma: { cats: true, at: revAt }, j_half: ['nuz'] },
	}));
	const devR = await device('R');
	const cR = stickerCalls.length;
	A(await boot(devR, 'stkrev', { 'micatro_joker_wins_v1:stkrev': { b_plasma: { win: 4, poke: 2 }, j_half: { win: 2, nuz: 5 }, j_joker: { win: 3 }, j_mime: { win: 6 } } }) && await settled(devR),
		'device R: signed in holding b_plasma (revoked) + j_half nuz (category revoked) locally; synced');
	A(!(await sticker(devR, 'b_plasma')) && !(await local(devR, 'stkrev')).b_plasma, 'the revoked key is dropped on load (record and local cache)', JSON.stringify(await local(devR, 'stkrev')));
	A(JSON.stringify(await S(devR, (M) => M.winRecord('j_half'))) === '{"win":2}' && JSON.stringify((await local(devR, 'stkrev')).j_half) === '{"win":2}', 'a category revocation drops only that category (j_half keeps win)', JSON.stringify((await local(devR, 'stkrev')).j_half));
	A(await waitFor(() => W('stkrev', 'j_mime') === 6 && W('stkrev', 'j_half') === 2, 15000), 'the other stickers still move to the account', JSON.stringify(serverWins('stkrev')));
	const putsR = stickerCalls.slice(cR).filter((c) => c.action === 'micatro-stickers-put');
	A(putsR.length >= 1 && putsR.every((c) => c.wins && !c.wins.b_plasma && !(c.wins.j_half && c.wins.j_half.nuz)), 'no put ever carried the revoked sticker back', JSON.stringify(putsR.map((c) => c.wins)));
	{
		const r = row('micatro_stickers:stkrev');
		A(!r.wins.b_plasma && !r.wins.j_half.nuz && r.wins.j_joker.win === 3 && JSON.stringify(r.revoked) === JSON.stringify({ b_plasma: { cats: true, at: revAt }, j_half: ['nuz'] }),
			'the row stays without it, others untouched, and `revoked` is kept verbatim', JSON.stringify(r));
	}
	A(await boot(devR, 'stkrev') && await settled(devR) && !(await sticker(devR, 'b_plasma')) && !serverWins('stkrev').b_plasma, 'a reload does not bring it back');
	// re-earn: a NEW win of b_plasma after the revocation sticks
	A(await S(devR, (M) => M.recordWin({ jokers: ['b_plasma'], stake: 2 })) === 1, 'device R wins again with b_plasma (Red) after the revocation');
	A(await waitFor(() => W('stkrev', 'b_plasma') === 2, 15000) && await settled(devR), 'the re-earned sticker reaches the account', JSON.stringify(serverWins('stkrev')));
	A(row('micatro_stickers:stkrev').earned?.b_plasma?.win > revAt && row('micatro_stickers:stkrev').revoked?.b_plasma, 'the row records when it was re-earned (and still holds the revocation)', JSON.stringify(row('micatro_stickers:stkrev')));
	A(await boot(devR, 'stkrev') && await settled(devR) && await sticker(devR, 'b_plasma') === 'Red', 'after a reload device R still shows it');
	const rErrs = [...devR.errors];
	await devR.ctx.close();
	// a stale device still holding the OLD (higher) level drops it and takes the re-earned one
	const devS = await device('S');
	const cS = stickerCalls.length;
	A(await boot(devS, 'stkrev', { 'micatro_joker_wins_v1:stkrev': { b_plasma: { win: 8 } } }) && await settled(devS), 'device S: signed in holding the old Gold b_plasma');
	A(await sticker(devS, 'b_plasma') === 'Red' && W('stkrev', 'b_plasma') === 2, 'it drops the old Gold and shows the re-earned Red (the account keeps Red)', JSON.stringify([await sticker(devS, 'b_plasma'), serverWins('stkrev').b_plasma]));
	A(stickerCalls.slice(cS).filter((c) => c.action === 'micatro-stickers-put').every((c) => !(c.wins && c.wins.b_plasma && c.wins.b_plasma.win === 8)), 'and never pushed the Gold back');
	rErrs.push(...devS.errors);
	await devS.ctx.close();
	A(errs.length === 0 && rErrs.length === 0 && devA.errors.length === 0 && devB.errors.length === 0, 'no page errors', [...devA.errors, ...devB.errors, ...errs, ...rErrs].join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
