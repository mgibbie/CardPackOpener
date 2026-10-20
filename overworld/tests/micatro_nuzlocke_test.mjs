// micatro_nuzlocke_test.mjs — Pokermon's Nuzlocke / Monotype run badges in the browser, end to end: the REAL
// account handler (server/mp.mjs, bundled like the dev server) over an in-memory sqlite D1 stand-in behind a
// static server, headless Chrome (separate browser contexts = separate devices):
//   1. the live HUD badges ("Nuzlocke", "Monotype" -> "Monotype: <Type>" once a joker locks it) appear in a
//      Pokermon run and fit portrait 390x664, desktop 1280x800 and landscape 844x390 without overlapping the
//      HUD's controls, the tags, the joker/consumable rows, the controls or the deck
//   2. breaking one: the badge disappears and a toast says why ("Monotype broken: started a round with Squirtle (Water)
//      in a Lightning run" — Monotype is checked when a blind starts; the shop warns first and the pill is marked at risk,
//      "Nuzlocke broken: sold Charmander"); Run Info's Badges tab explains it
//   3. a won run (a real engine win): the win screen shows the badges earned, the achievement unlock toasts
//      show, the leaderboard row carries the tag ({nuz, mono} stored on the board), the run history (Replays)
//      shows them, and the Achievements screen lists the unlocks + the record (Fire beaten)
//   4. the account record syncs to a second browser context; a guest's record merges into an account
//   5. a run without Pokermon shows nothing (no badges, no Badges tab)
//   6. deck stickers: the won run's deck (b_red) gets the Arceus sticker (both) — on the deck pile, in the New Run
//      deck select and in Run Info — and a deck with only a plain win shows the plain stake sticker
//   7. Pikachu (poke): a Pokermon win with both badges broken gives its jokers AND its deck the Pikachu sticker
//      (ranked below Aipom, above the plain sticker); a vanilla win records no poke
// (owner rules 2026-10-18: gaining a non-Pokémon joker breaks the Nuzlocke at once; Monotype only breaks when a round
//  starts with an off-type or non-Pokémon joker in the row)
// Mod art missing from this checkout (a worktree) is served read-only from the main checkout two levels up
// (MICATRO_MAIN overrides), like micatro_pack_hand_items_test.mjs.
// Covers micatro/js/ui/progress.js, micatro/js/ui/board.js (renderRunBadges, runBadgeToast), micatro/js/ui/screens.js
// (achievementsScreen, the win screen / leaderboard / replays badges), micatro/js/ui/main.js, micatro/js/net.js,
// micatro/mods/pokermon/systems/runbadges.js.
//   node overworld/tests/micatro_nuzlocke_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 9547;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-nuz-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	return (await handler(req, { MP_DB })).json();
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.fs': 'text/plain' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.10.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise(r => server.listen(PORT, r));

const tokens = {};
for (const n of ['nuzzy', 'nuzguest']) tokens[n] = (await call('register', { username: n, password: 'nuzlocke-e2e-pass' })).token;
A(tokens.nuzzy && tokens.nuzguest, 'real accounts registered');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state;

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const device = async (name, vp = { width: 1280, height: 800 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ ...vp, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push(name + ' pageerr: ' + e.message));
		await page.goto(`http://localhost:${PORT}/micatro/nothing.txt`);
		await page.evaluate(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
		return { ctx, page, errors, name };
	};
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
	const idle = (d) => waitFor(() => d.page.evaluate(() => window.__micatro.idle()), 30000);
	const act = async (d, a) => { await idle(d); const r = await d.page.evaluate((a) => window.__micatro.act(a), a); await idle(d); return r; };
	const shot = async (d, name) => { if (SHOTS) await d.page.screenshot({ path: path.join(SHOTS, name) }); };
	const pokeRun = async (d) => {
		await d.page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ back: 'b_red', mods: ['pokermon'] }); });
		await waitFor(() => d.page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 40000);
	};
	/** In the shop: put a joker up for sale and buy it through the game (the board gets the events). */
	const buy = async (d, key) => {
		const id = await d.page.evaluate(async (key) => {
			const { G, create_card } = await import('/micatro/js/engine/core.js');
			const c = create_card('Joker', G.shop_jokers, null, null, null, null, key);
			G.shop_jokers.emplace(c); G.GAME.dollars = 1000;
			return c.sort_id;
		}, key);
		return act(d, { type: 'buy', id });
	};
	/** Blind select -> win the blind (forced chips) -> cash out -> the shop. */
	const toShop = async (d) => {
		await act(d, { type: 'select_blind' });
		const ids = await d.page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.chips = G.GAME.blind.chips; return [G.hand.cards[0].sort_id]; });
		await act(d, { type: 'highlight', ids });
		await act(d, { type: 'play' });
		await act(d, { type: 'cash_out' });
	};
	/** Win the current run: the last ante's three blinds with forced chips (jokers added first, outside the shop). */
	const winNow = async (d, jokers = []) => {
		await d.page.evaluate(async (keys) => {
			const { G, add_joker } = await import('/micatro/js/engine/core.js');
			for (const k of keys) add_joker(k);
			G.E_MANAGER.flush();
			G.GAME.round_resets.ante = G.GAME.win_ante;
		}, jokers);
		for (let b = 0; b < 3; b++) {
			await act(d, { type: 'select_blind' });
			const ids = await d.page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.chips = G.GAME.blind.chips; return [G.hand.cards[0].sort_id]; });
			await act(d, { type: 'highlight', ids });
			await act(d, { type: 'play' });
			if (b < 2) { await act(d, { type: 'cash_out' }); await act(d, { type: 'next_round' }); }
		}
		return waitFor(() => d.page.evaluate(() => !!document.querySelector('.go-modal')), 15000);
	};
	const stkRec = (d, k) => d.page.evaluate(async (k) => (await import('/micatro/js/ui/stickers.js')).winRecord(k), k);
	const pills = (d) => d.page.evaluate(() => [...document.querySelectorAll('.hud.has-rb .hud-rbadges .rb-pill')].filter((e) => e.offsetParent).map((e) => e.textContent));
	const rbToast = (d) => d.page.evaluate(() => { const t = document.querySelector('.rb-toast'); return t && t.classList.contains('show') ? t.textContent : ''; });
	/** Overlap check: the badges vs every HUD control / board area that's showing. -> {ok, badges, hits, offscreen} */
	const fit = (d) => d.page.evaluate(() => {
		const R = (e) => e.getBoundingClientRect();
		const bEl = document.querySelector('.hud-rbadges');
		const b = R(bEl);
		const pill = [...bEl.querySelectorAll('.rb-pill')].map(R);
		const hit = (r) => r.width > 0 && r.height > 0 && b.left < r.right - 0.5 && b.right > r.left + 0.5 && b.top < r.bottom - 0.5 && b.bottom > r.top + 0.5;
		const portrait = document.getElementById('stage').classList.contains('portrait');
		const sels = ['.hud-blind', '.hud-score', '.hud-hand', '.hud-stats', '.hs-btns .btn', '.hud-tags .tag-ico', '.area-box', '.controls', '.deck-pile', '.area-lbl'];
		if (portrait) sels.push('.hud');
		const hits = [];
		for (const s of sels) for (const e of document.querySelectorAll(s)) if (e.offsetParent && hit(R(e))) hits.push(s);
		const vw = innerWidth, vh = innerHeight;
		const offscreen = pill.some((p) => p.left < 0 || p.top < 0 || p.right > vw + 0.5 || p.bottom > vh + 0.5);
		const hud = R(document.querySelector('.hud'));
		const insideHud = b.left >= hud.left - 0.5 && b.right <= hud.right + 0.5 && b.top >= hud.top - 0.5 && b.bottom <= hud.bottom + 0.5;
		return { ok: !hits.length && !offscreen && pill.length > 0 && (portrait || insideHud), hits, offscreen, portrait, insideHud, n: pill.length, b: [b.left, b.top, b.width, b.height].map(Math.round) };
	});

	// ===== 1. live badges in a Pokermon run =====
	const dA = await device('A');
	A(await boot(dA, 'nuzzy'), 'device A: signed in, game ready');
	await pokeRun(dA);
	A(JSON.stringify(await pills(dA)) === '["Nuzlocke","Monotype"]', 'a Pokermon run shows "Nuzlocke" and "Monotype" on the HUD', JSON.stringify(await pills(dA)));
	await toShop(dA);
	await buy(dA, 'j_poke_pikachu');
	A(JSON.stringify(await pills(dA)) === '["Nuzlocke","Monotype"]', 'a bought joker locks nothing yet: still "Monotype"', JSON.stringify(await pills(dA)));
	await act(dA, { type: 'next_round' });
	await toShop(dA);
	A(JSON.stringify(await pills(dA)) === '["Nuzlocke","Monotype: Lightning"]', 'the first blind started with Pikachu locks the type: "Monotype: Lightning"', JSON.stringify(await pills(dA)));
	// some tags too, so the portrait row's right side is occupied
	await dA.page.evaluate(async () => {
		const { G } = await import('/micatro/js/engine/core.js'); const { Tag, add_tag } = await import('/micatro/js/engine/tag.js');
		for (const k of ['tag_double', 'tag_economy', 'tag_d_six']) add_tag(new Tag(k));
		window.__micatro.board.update && 0; void G;
	});
	await act(dA, { type: 'reorder', area: 'jokers', ids: await dA.page.evaluate(() => window.__micatro.view().areas.jokers.map((c) => c.id)) }); // (a no-op action: the board redraws the tags)
	for (const [w, h, name] of [[390, 664, 'portrait'], [1280, 800, 'desktop'], [844, 390, 'landscape']]) {
		await dA.page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
		await sleep(500);
		const f = await fit(dA);
		A(f.ok && f.n === 2, `the badges fit ${name} ${w}x${h} without overlapping the HUD controls`, JSON.stringify(f));
		await shot(dA, `live_${name}_${w}x${h}.png`);
	}
	await dA.page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

	// ===== 2. breaking them =====
	await buy(dA, 'j_poke_squirtle');
	A(JSON.stringify(await pills(dA)) === '["Nuzlocke","Monotype: Lightning"]', 'buying a Water joker in a Lightning run breaks nothing yet', JSON.stringify(await pills(dA)));
	A(await rbToast(dA) === 'Sell off-type jokers before the next round to keep Monotype', 'the shop warns (gently) instead', await rbToast(dA));
	A(await dA.page.evaluate(() => !!document.querySelector('.rb-toast.warn') && !!document.querySelector('.rb-pill.rb-mono.rb-risk')), 'the warning toast is the gentle style and the Monotype pill is marked at risk');
	await shot(dA, 'monotype_warning.png');
	await act(dA, { type: 'next_round' });
	await act(dA, { type: 'select_blind' });
	A(JSON.stringify(await pills(dA)) === '["Nuzlocke"]', 'a round started with the Water joker: the Monotype badge disappears', JSON.stringify(await pills(dA)));
	A(await rbToast(dA) === 'Monotype broken: started a round with Squirtle (Water) in a Lightning run', 'a toast says why ("...started a round with Squirtle (Water) in a Lightning run")', await rbToast(dA));
	await shot(dA, 'break_toast_monotype.png');
	const pika = await dA.page.evaluate(() => window.__micatro.view().areas.jokers.find((c) => c.center === 'j_poke_pikachu').id);
	await act(dA, { type: 'sell', id: pika });
	A((await pills(dA)).length === 0 && !(await dA.page.evaluate(() => document.querySelector('.hud').classList.contains('has-rb'))), 'selling a joker: the Nuzlocke badge disappears too');
	A(/^Nuzlocke broken: sold Pikachu$/.test(await rbToast(dA)), 'a toast says why ("Nuzlocke broken: sold Pikachu")', await rbToast(dA));
	await shot(dA, 'break_toast_nuzlocke.png');
	await dA.page.evaluate(() => document.querySelector('.b-runinfo').click());
	await sleep(300);
	await dA.page.evaluate(() => document.querySelector('.b-ri-badges').click());
	await sleep(300);
	const ri = await dA.page.evaluate(() => document.querySelector('.ri-rb') && document.querySelector('.ri-rb').textContent);
	A(/Broken: sold Pikachu/.test(ri || '') && /Broken: started a round with Squirtle \(Water\) in a Lightning run/.test(ri || ''), "Run Info's Badges tab explains both breaks", ri);
	await dA.page.evaluate(() => { const b = document.querySelector('.ri-modal .b-back'); if (b) b.click(); });
	// a non-Pokémon joker: the Nuzlocke breaks on gaining it; the Monotype when a round starts with it
	await pokeRun(dA);
	await toShop(dA);
	await buy(dA, 'j_joker');
	A(JSON.stringify(await pills(dA)) === '["Monotype"]', 'a non-Pokémon joker: the Nuzlocke badge disappears at once', JSON.stringify(await pills(dA)));
	A(await rbToast(dA) === 'Nuzlocke broken: gained a non-Pokémon joker (Joker)\nSell off-type jokers before the next round to keep Monotype', 'the toast gives the break and the Monotype warning (two lines)', JSON.stringify(await rbToast(dA)));
	await shot(dA, 'break_toast_non_pokemon.png');
	await act(dA, { type: 'next_round' });
	await act(dA, { type: 'select_blind' });
	A((await pills(dA)).length === 0 && await rbToast(dA) === 'Monotype broken: started a round with Joker (no type)', 'kept into a round, it breaks the Monotype', await rbToast(dA));

	// ===== 3. a won run =====
	await pokeRun(dA);
	await dA.page.evaluate(async () => {
		const { G, add_joker } = await import('/micatro/js/engine/core.js');
		add_joker('j_poke_charmander'); // (the first window's one joker: Fire)
		G.E_MANAGER.flush();
		G.GAME.round_resets.ante = G.GAME.win_ante;
	});
	for (let b = 0; b < 3; b++) {
		await act(dA, { type: 'select_blind' });
		const ids = await dA.page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.chips = G.GAME.blind.chips; return [G.hand.cards[0].sort_id]; });
		await act(dA, { type: 'highlight', ids });
		await act(dA, { type: 'play' });
		if (b < 2) { await act(dA, { type: 'cash_out' }); await act(dA, { type: 'next_round' }); }
	}
	A(await waitFor(() => dA.page.evaluate(() => !!document.querySelector('.go-modal .go-badges')), 15000), 'the win screen shows a "Badges earned" row');
	const goB = await dA.page.evaluate(() => [...document.querySelectorAll('.go-badges .rb-pill')].map((e) => e.textContent));
	A(JSON.stringify(goB) === '["Nuzlocke","Monotype: Fire"]', 'the win screen lists Nuzlocke + Monotype: Fire', JSON.stringify(goB));
	A(await waitFor(() => dA.page.evaluate(() => !!document.querySelector('.ach-toast')), 8000), 'an achievement unlock toast shows');
	const t1 = await dA.page.evaluate(() => document.querySelector('.ach-toast').textContent);
	A(/Achievement unlocked/.test(t1) && /Nuzlocke/.test(t1), 'the toast names the achievement', t1);
	await shot(dA, 'win_screen_achievement_toast.png');
	const prog = await dA.page.evaluate(() => window.__micatro.progress.getProgress());
	A(prog.nuz === 1 && prog.mono.fire === 1 && prog.both === 1 && prog.ach.first_nuzlocke && prog.ach.first_monotype && prog.ach.nuzlocke_monotype && !prog.ach.nuzlocke_gold && !prog.ach.monotype_all, 'the record: 1 Nuzlocke, Fire beaten, 1 both; 3 achievements (not Gold, not all types)', JSON.stringify(prog));
	A(await waitFor(() => { const r = row('micatro_progress:nuzzy'); return r && r.progress.nuz === 1 && r.progress.mono.fire === 1 && r.progress.ach.nuzlocke_monotype; }, 15000), 'the record is saved on the account (micatro_progress:nuzzy)', JSON.stringify(row('micatro_progress:nuzzy')));
	A(await waitFor(() => { const b = row('runboard:micatro_modded') || []; const e = b.find((x) => x.name === 'nuzzy'); return e && e.badges && e.badges.nuz === true && e.badges.mono === 'fire'; }, 20000), 'the leaderboard row stores the badges {nuz, mono:"fire"}', JSON.stringify(row('runboard:micatro_modded')));
	const stk = await dA.page.evaluate(async () => (await import('/micatro/js/ui/stickers.js')).winRecord('j_poke_charmander'));
	A(stk.win >= 1 && stk.nuz >= 1 && stk.mono >= 1 && stk.both >= 1, 'the win stickers got the categories (win, nuz, mono, both) for the run\'s jokers', JSON.stringify(stk));
	const deckRec = await dA.page.evaluate(async () => (await import('/micatro/js/ui/stickers.js')).winRecord('b_red'));
	A(deckRec.win === 1 && deckRec.poke === 1 && deckRec.nuz === 1 && deckRec.mono === 1 && deckRec.both === 1, 'the deck (b_red) is recorded with the same categories (poke too: a Pokermon win)', JSON.stringify(deckRec));
	A((await stkRec(dA, 'j_poke_charmander')).poke === 1, 'a Pokermon win records poke on its jokers');
	A(await waitFor(() => dA.page.evaluate(() => { const c = document.querySelector('.deck-stack canvas:last-child'); return c && c.dataset.sticker === 'both:White'; }), 5000), 'the deck pile wears the Arceus sticker (White ring)', await dA.page.evaluate(() => document.querySelector('.deck-stack canvas:last-child').dataset.sticker));
	await waitFor(() => dA.page.evaluate(() => !document.querySelector('.ach-toast')), 15000);
	// the leaderboard (from the win screen)
	await dA.page.evaluate(() => [...document.querySelectorAll('.go-acts .btn')].find((b) => /Leader/.test(b.textContent)).click());
	A(await waitFor(() => dA.page.evaluate(() => !!document.querySelector('.lb-row:not(.lb-h) .rb-pill')), 10000), 'the leaderboard row shows the tag');
	const lbT = await dA.page.evaluate(() => [...document.querySelectorAll('.lb-row.me .rb-pill')].map((e) => e.textContent));
	A(JSON.stringify(lbT) === '["Nuz","Fire"]', 'the row tag reads Nuz + Fire', JSON.stringify(lbT));
	await sleep(700);
	await shot(dA, 'leaderboard_row.png');
	await dA.page.evaluate(() => document.querySelector('.lb-modal .b-back').click());
	// the run history + achievements screen (from the main menu)
	await dA.page.evaluate(() => document.querySelector('.go-modal .b-mainmenu').click());
	await sleep(400);
	await dA.page.evaluate(() => document.querySelector('.b-replays').click());
	await sleep(400);
	const rp = await dA.page.evaluate(() => { const r = document.querySelector('.rp-row .rp-badges'); return r ? [...r.querySelectorAll('.rb-pill')].map((e) => e.textContent) : null; });
	A(JSON.stringify(rp) === '["Nuzlocke","Monotype: Fire"]', 'the run history (Replays) shows the badges', JSON.stringify(rp));
	await dA.page.evaluate(() => document.querySelector('.rp-modal .b-back').click());
	await dA.page.evaluate(() => document.querySelector('.b-achievements').click());
	await sleep(400);
	const on = await dA.page.evaluate(() => [...document.querySelectorAll('.ach-row.on')].map((e) => e.dataset.id));
	const all = await dA.page.evaluate(() => document.querySelectorAll('.ach-row').length);
	A(all === 5 && JSON.stringify(on) === '["first_nuzlocke","first_monotype","nuzlocke_monotype"]', 'the Achievements screen lists all 5, with the 3 unlocked', JSON.stringify([all, on]));
	await shot(dA, 'achievements_screen.png');
	await dA.page.evaluate(() => document.querySelector('.b-ach-rec').click());
	await sleep(300);
	const rec = await dA.page.evaluate(() => ({ nuz: document.querySelector('.rec-nuz').textContent, both: document.querySelector('.rec-both').textContent, fire: !document.querySelector('.rec-type[data-type="Fire"]').classList.contains('off'), water: !document.querySelector('.rec-type[data-type="Water"]').classList.contains('off') }));
	A(rec.nuz === '1' && rec.both === '1' && rec.fire && !rec.water, 'the Record tab: 1 Nuzlocke win, 1 both, Fire beaten (Water not)', JSON.stringify(rec));
	await shot(dA, 'record_screen.png');
	await dA.page.evaluate(() => document.querySelector('.ach-modal .b-back').click());
	// deck select: b_red (Arceus) and a deck with only a plain Green win
	await dA.page.evaluate(() => localStorage.setItem('micatro_newrun', JSON.stringify({ back: 'b_red', stake: 1 })));
	await dA.page.evaluate(() => document.querySelector('.b-menu-play').click());
	await sleep(600);
	A((await dA.page.evaluate(() => document.querySelector('.nr-back') && document.querySelector('.nr-back').dataset.sticker)) === 'both:White', 'New Run deck select: the Red Deck shows its Arceus sticker');
	await sleep(400);
	await shot(dA, 'deck_select_arceus.png');
	await dA.page.evaluate(() => { const b = [...document.querySelectorAll('.modal .b-back')].pop(); b.click(); });
	await dA.page.evaluate(async () => { const M = await import('/micatro/js/ui/stickers.js'); M.recordWin({ jokers: ['b_blue'], stake: 3 }); localStorage.setItem('micatro_newrun', JSON.stringify({ back: 'b_blue', stake: 1 })); });
	await dA.page.evaluate(() => document.querySelector('.b-menu-play').click());
	await sleep(600);
	A((await dA.page.evaluate(() => document.querySelector('.nr-back') && document.querySelector('.nr-back').dataset.sticker)) === 'win:Green', 'a deck with a plain Green win shows the plain stake sticker');
	await shot(dA, 'deck_select_plain.png');
	await dA.page.evaluate(() => { const b = [...document.querySelectorAll('.modal .b-back')].pop(); b.click(); });

	// ===== 7. Pikachu: a Pokermon win with both badges broken (a non-Pokémon joker) =====
	await dA.page.evaluate(async () => { await window.__micatro.newRun({ back: 'b_yellow', mods: ['pokermon'] }); });
	await waitFor(() => dA.page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 40000);
	A(await winNow(dA, ['j_poke_squirtle', 'j_joker']), 'a broken Pokermon run won (Yellow Deck)');
	const sq = await stkRec(dA, 'j_poke_squirtle'), yd = await stkRec(dA, 'b_yellow');
	A(JSON.stringify(sq) === '{"win":1,"poke":1}' && JSON.stringify(yd) === '{"win":1,"poke":1}', 'its jokers and deck get win + poke only (no Nuzlocke / Monotype)', JSON.stringify([sq, yd]));
	A(!(await dA.page.evaluate(() => !!document.querySelector('.go-badges'))), 'the win screen lists no badges (both were broken)');
	await dA.page.evaluate(() => document.querySelector('.go-modal .b-endless').click());
	await idle(dA);
	await sleep(800);
	A(await waitFor(() => dA.page.evaluate(() => { const c = document.querySelector('.deck-stack canvas:last-child'); return c && c.dataset.sticker === 'poke:White'; }), 5000), 'the deck pile wears the Pikachu sticker');
	const jk = await dA.page.evaluate(async () => { const M = await import('/micatro/js/ui/stickers.js'); const i = M.winStickerInfo('j_poke_squirtle'); return i && [i.category, i.special && i.special.pokemon, i.colour]; });
	A(jk && jk.join() === 'poke,Pikachu,#ffffff', 'Squirtle shows the White-ringed Pikachu sticker', JSON.stringify(jk));
	await shot(dA, 'pikachu_joker_and_deck.png');
	await dA.page.evaluate(() => localStorage.setItem('micatro_newrun', JSON.stringify({ back: 'b_yellow', stake: 1 })));
	await dA.page.evaluate(() => window.__micatro.board && document.querySelector('.b-options').click());
	await sleep(400);
	await dA.page.evaluate(() => { const b = document.querySelector('.opt-modal .b-mainmenu, .options .b-mainmenu') || [...document.querySelectorAll('.modal .btn')].find((x) => /Main Menu/.test(x.textContent)); if (b) b.click(); });
	await sleep(500);
	await dA.page.evaluate(() => document.querySelector('.b-menu-play').click());
	await sleep(700);
	A((await dA.page.evaluate(() => document.querySelector('.nr-back') && document.querySelector('.nr-back').dataset.sticker)) === 'poke:White', 'deck select: the Yellow Deck shows its Pikachu sticker');
	await shot(dA, 'deck_select_pikachu.png');
	await dA.page.evaluate(() => { const b = [...document.querySelectorAll('.modal .b-back')].pop(); if (b) b.click(); });

	// ===== 4. the record on a second device; a guest's record carried into an account =====
	const dB = await device('B');
	A(await boot(dB, 'nuzzy'), 'device B: same account, empty storage');
	A(await waitFor(() => dB.page.evaluate(() => { const p = window.__micatro.progress && window.__micatro.progress.getProgress(); return p && p.nuz === 1 && p.mono.fire === 1 && !!p.ach.nuzlocke_monotype; }), 15000), 'device B gets the record + achievements from the account');
	// (window.__micatro.ready is set BEFORE the menu draws: boot first waits up to 3 s for the account's run, ui/runsync.js —
	// the record can arrive in that window, so wait for the menu itself, like micatro_runsync_test)
	A(await waitFor(() => dB.page.evaluate(() => !!document.querySelector('.menu-modal .b-achievements')), 15000), 'device B: the main menu is up');
	await dB.page.evaluate(() => document.querySelector('.b-achievements').click());
	await sleep(400);
	A((await dB.page.evaluate(() => document.querySelectorAll('.ach-row.on').length)) === 3, "device B's Achievements screen shows the 3 unlocks");
	const dC = await device('C');
	A(await boot(dC, 'nuzguest', { 'micatro_progress_v1:guest': { v: 1, nuz: 2, nuzStake: 8, both: 0, mono: { water: 1 }, ach: { first_nuzlocke: 1000, nuzlocke_gold: 2000 } } }), 'device C: a guest record in storage, then signed in');
	A(await waitFor(() => { const r = row('micatro_progress:nuzguest'); return r && r.progress.nuz === 2 && r.progress.nuzStake === 8 && r.progress.mono.water === 1 && r.progress.ach.nuzlocke_gold === 2000; }, 15000), "the guest's record merges into the account on sign-in", JSON.stringify(row('micatro_progress:nuzguest')));
	A(await waitFor(() => dC.page.evaluate(() => localStorage.getItem('micatro_progress_v1:guest') === null), 5000), '... and the guest copy is cleared (it now belongs to that account)');

	// ===== 5. no Pokermon: nothing =====
	await dA.page.evaluate(() => window.__micatro.newRun({ back: 'b_red' }));
	await waitFor(() => dA.page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 40000);
	const van = await dA.page.evaluate(() => ({ rb: window.__micatro.view().run_badges, has: document.querySelector('.hud').classList.contains('has-rb'), n: document.querySelectorAll('.hud-rbadges .rb-pill').length }));
	A(van.rb === undefined && !van.has && van.n === 0, 'a run without Pokermon shows no badges', JSON.stringify(van));
	await dA.page.evaluate(() => document.querySelector('.b-runinfo').click());
	await sleep(300);
	A(!(await dA.page.evaluate(() => !!document.querySelector('.b-ri-badges'))), 'and Run Info has no Badges tab');
	A((await dA.page.evaluate(() => { const c = document.querySelector('.ri-deck .ri-back'); return c && c.dataset.sticker; })) === 'both:White', 'Run Info shows the deck with its win sticker');
	await shot(dA, 'runinfo_deck_sticker.png');
	await dA.page.evaluate(() => { const b = document.querySelector('.ri-modal .b-back'); if (b) b.click(); });
	A(await winNow(dA, ['j_greedy_joker']), 'a vanilla run won');
	const gj = await stkRec(dA, 'j_greedy_joker');
	A(gj.win === 1 && !gj.poke, 'a vanilla win records no poke (no Pikachu)', JSON.stringify(gj));
	await shot(dA, 'vanilla_run_no_badges.png');

	for (const d of [dA, dB, dC]) A(!d.errors.length, d.name + ': no page errors', d.errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
