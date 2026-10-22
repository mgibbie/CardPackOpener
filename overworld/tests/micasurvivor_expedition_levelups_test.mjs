// micasurvivor_expedition_levelups_test.mjs — MicaSurvivor DLC D5: level-ups and items (rarity-rolled cards, move levels to 8
// with archetype rolls, the 8 new archetypes, 21 vitamins + slots, Refresh / Skip / Banish, 60 stacking items, the XP curve).
// micasurvivor/js/expedition/levelups.js + items.js + moves.js; Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.1, 2.3, 2.5, 2.6, D5.
// A static server, headless Chrome, a fixed guest profile. One browser at a time (and it always exits).
//   0. the server keeps the D5 counters in the Expedition save (two devices: max), with no server change
//   1. rarity: the study's weights, luck lifting the higher tiers, power gating Rare / Epic / Legendary; 40,000 seeded rolls
//      match the odds; live deals at Lv 1 have no Rare+, at Lv 40 they do; a card's frame and chip show its rarity
//   2. a move levels 1 -> 8 through the real level-up screen: +8 % a level, 2 rolls (3 at Epic+) from its archetype's list,
//      the card says what it gives; no card for it after 8
//   3. each new archetype (lob, homing, barrage, smite, vortex, wave, spin, weather) fires and hurts in its own way, through
//      the combat.run seam too; a co-op partner's cast (ghost) shows it and deals nothing
//   4. vitamins: 3 slots (no 4th new one offered), level 10 max, each stat lands (Protein on physical moves only, HP Up,
//      Iron), the rarity multiplier; a vitamin card on the real screen, its overworld icon
//   5. Refresh 2 / Skip 2 (+10 x zone, the X key, the button) / Banish 1 (a new move or vitamin never comes back; not an upgrade)
//   6. items: caps (the 4th Life Orb isn't taken, and never rolled), same-stat bonuses ADD (Life Orb x3 + Master Ball = +115 %,
//      not x2.75), type boosters; a pickup through the real item.take seam; procs: Max Revive, Zinc's shield, Electirizer
//   7. the XP curve: 2 x (8 + 5.5 L + L^1.8) on the real player; a spawn-limited Classic run's XP (the probe's numbers)
//      reaches Lv 55 in zone 3 (the base curve: 46); a Dratini run levelled by real XP evolves to Dragonite at 55
//   8. determinism and viewers: no Math.random in a deal or a drop; the same draw deals the same cards; the `x` block v5 `u`
//      on snapshots, host and guest frames; a fresh page as co-op guest, live spectator and replay viewer shows the bag;
//      a v4 block (no `u`) still loads; dv 4 (a dv-3 replay plays with no notice); the run-over line and save counters
//   9. base modes untouched in the same page: a Normal run after the Expedition code loaded gets base items, cards and curve
//  10. the phone (844 x 390, touch): the level-up screen (3 cards, Refresh / Skip / Ban), the bag strip and the pause panel fit
//  11. screenshots (SHOTS=<dir>): a level-up choice, a rarity spread (all 5), the item / vitamin UI, desktop and phone
//   node overworld/tests/micasurvivor_expedition_levelups_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D5" count was taken.)
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
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8857;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
// The XP of a spawn-limited Expedition Classic run (Viridian Forest, Bulbasaur, a player who kills everything that spawns,
// 8:00 per zone, then the guardian and the portal), measured with the D4 code (scratch probe, 2026-10-21): the cumulative
// XP at the end of zones 1 / 2 / 3. The run's XP comes from its enemies, which D5 doesn't change; D5 changes the curve.
const PROBE = { z1: 8073, z2: 39380, z3: 113979, minutes: 24.4 };

// ======================== 0. the server keeps the D5 counters (two devices: the max of each)
{
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-lv-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
		banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ip = 0;
	const call = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.1.' + (1 + ip++), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return { status: res.status, body: await res.json() };
	};
	const tok = (await call('register', { username: 'levelupstester', password: 'msurv-levelups-pass-1' })).body.token;
	const devA = { v: 1, counters: { 'lv.cards': 40, 'lv.rar.3': 4, 'lv.vitmax': 6, 'lv.items': 9 }, sets: {} };
	const devB = { v: 1, counters: { 'lv.cards': 25, 'lv.rar.5': 1, 'lv.vitmax': 10, 'lv.move8': 2 }, sets: {} };
	await call('micasurvivor-exp-save-put', { save: devA, rev: 0 }, tok);
	const p2 = await call('micasurvivor-exp-save-put', { save: devB, rev: 0 }, tok);
	if (p2.status === 409) await call('micasurvivor-exp-save-put', { save: devB, rev: p2.body.rev }, tok);
	const c = ((await call('micasurvivor-exp-save-get', {}, tok)).body.save || {}).counters || {};
	A(p2.status === 409 && c['lv.cards'] === 40 && c['lv.rar.3'] === 4 && c['lv.rar.5'] === 1 && c['lv.vitmax'] === 10 && c['lv.move8'] === 2 && c['lv.items'] === 9,
		'the server takes the D5 counters (lv.cards, lv.rar.N, lv.vitmax, lv.move8, lv.items) with no server change, and two devices merge by max', JSON.stringify(c));
}

// ======================== the browser
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
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
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {},
};
const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null, net: [] };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	const G0 = window.G = window.G || {};
	let net = null;
	Object.defineProperty(G0, 'Net', { configurable: true, enumerable: true, get() { return net; }, set(v) {
		net = v;
		if (v && typeof v.on === 'function') { const on = v.on; v.on = function (fn) { H.net.push(fn); return on.call(this, fn); }; }
	} });
	H.deliver = (from, msg) => { for (const fn of H.net) fn(from, msg); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dlevel5');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	/** a sturdy test player: hurts are counted, not taken; XP pickups give nothing (the test levels by hand) */
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; pl.gainXp = () => 0; return pl; };
	H.unsturdy = () => { const pl = G.Game.player; delete pl.hurt; delete pl.gainXp; return pl; };
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { H.unblock(); G.Game.debugStep(1, dt); } };
	H.unblock = () => { if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); } };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.dead) { e.dead = true; e.fade = 0; } };
	H.cards = () => [...document.querySelectorAll('#cards .card')].map(el => ({ title: el.querySelector('.nm').innerText, ds: el.querySelector('.ds').innerText, rar: +(el.dataset.rar || 0), cls: el.className }));
	/** open the next level's screen; pick(cards, offers) -> index to click (default 0); -> {cards, offers} */
	H.level = pick => {
		G.Game.debugLevelUp();
		for (let i = 0; i < 3 && !G.UI.isOpen('scr-levelup'); i++) H.step(1);
		const offers = (G.RunUI.offers || []).slice(), cards = H.cards();
		const i = pick ? pick(cards, offers) : 0;
		const els = [...document.querySelectorAll('#cards .card')];
		if (els[i]) els[i].click();
		H.step(1);
		return { cards, offers: offers.map(o => ({ type: o.type, key: o.key, rar: o.rar, rolls: o.rolls || null, title: o.title })) };
	};
	/** a still target dummy (a Pidgey with lots of HP that doesn't walk) */
	H.dummy = (x, y, hp = 5000) => {
		const e = new G.Enemy({ dex: 16, name: 'Pidgey', behavior: 'chaser', hp: 1, spd: 0, dmg: 0, xp: 0 }, x, y, { hp, dmg: 0, spd: 0 });
		e.touchCd = 99;
		G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
		return e;
	};
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage(view, ctx0) {
		const ctx = ctx0 || await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(view || { width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, SAVE);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
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
	/** start Classic with whatever is picked, freeze the frames, a sturdy player */
	const startClassic = page => E(page, async () => {
		if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await new Promise(r => setTimeout(r, 300)); }
		window.__t.thaw();
		const ok = await G.Flow.play('exp-classic');
		window.__t.freeze();
		window.__t.sturdy();
		return { ok, state: G.Game.state, mode: G.Game.mode, dex: G.Game.player.dex, dv: G.Modes.run.dv, lv: !!(G.ExpLevel && G.ExpLevel.run) };
	});

	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const r0 = await startClassic(page);
	A(r0.ok && r0.mode === 'exp-classic' && r0.dex === 1 && r0.dv === 5 && r0.lv, 'Classic starts as Bulbasaur with the D5 level-ups on; the content version is 5 (D6)', JSON.stringify(r0));

	// ======================== 1. rarity: weights, luck, gating, odds, live deals, the frames
	const rr = await E(page, () => {
		const L = G.ExpLevel, I = G.ExpItems, r4 = a => a.map(x => +x.toFixed(4));
		const out = {
			mul: I.RAR_MUL, names: I.RAR_NAME,
			lv1: r4(L.weights({ level: 1, luck: 0, zone: 1 })), top: r4(L.weights({ level: 30, luck: 0, zone: 1 })),
			luck: r4(L.weights({ level: 40, luck: 100, zone: 1 }).map((w, i) => w / L.K.RAR_W[i])),
			mid: r4(L.weights({ level: 6.5, luck: 0, zone: 1 })), pw: L.power({ level: 1, luck: 16, zone: 2 }),
			z3: r4(L.weights({ level: 2, luck: 0, zone: 3 }))
		};
		// 40,000 rolls from a seeded stream against the odds at power 30
		const o = { level: 30, luck: 0, zone: 1 }, odds = L.odds(o), n = [0, 0, 0, 0, 0], rng = G.DLC.rng(12345);
		for (let i = 0; i < 40000; i++) n[L.rollRarity(rng, o)]++;
		out.freq = n.map(x => x / 40000); out.odds = odds;
		out.dev = Math.max(...n.map((x, i) => Math.abs(x / 40000 - odds[i])));
		const ol = { level: 30, luck: 150, zone: 1 }, nl = [0, 0, 0, 0, 0], rng2 = G.DLC.rng(999);
		for (let i = 0; i < 40000; i++) nl[L.rollRarity(rng2, ol)]++;
		out.luckRare = (nl[2] + nl[3] + nl[4]) / 40000; out.noLuckRare = (n[2] + n[3] + n[4]) / 40000;
		// live deals: Lv 1 vs Lv 40 (the player's own level is the power here)
		const pl = G.Game.player, lv0 = pl.level, tiers = lv => { pl.level = lv; const t = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 80; i++) for (const c of L.offer(pl)) t[c.rar || 0]++; return t; };
		out.dealLv1 = tiers(1); out.dealLv40 = tiers(40);
		pl.level = lv0;
		return out;
	});
	A(JSON.stringify(rr.mul) === '[1,1.2,1.45,1.75,2.1]' && JSON.stringify(rr.top) === '[70,24,5,0.9,0.12]',
		'5 rarities x1 / 1.2 / 1.45 / 1.75 / 2.1; with enough power the weights are the study\'s 70 / 24 / 5 / 0.9 / 0.12', JSON.stringify(rr));
	A(JSON.stringify(rr.lv1) === '[70,24,0,0,0]' && JSON.stringify(rr.mid) === '[70,24,2.5,0,0]' && rr.pw === 15 && rr.z3[4] > 0 && rr.z3[3] === 0.9,
		'power gates the higher tiers: at Lv 1 no Rare / Epic / Legendary; Rare is half in at power 6.5 (3 -> 10); power = level + luck / 8 + 12 (zone - 1) (Lv 1, luck 16, zone 2: 15); zone 3 opens Epic fully at Lv 2', JSON.stringify({ lv1: rr.lv1, mid: rr.mid, pw: rr.pw, z3: rr.z3 }));
	A(JSON.stringify(rr.luck) === '[1,1.5,4,8,16]', 'luck 100 lifts Uncommon x1.5, Rare x(1+1)^2 = 4, Epic x8, Legendary x16 (study 2.5)', JSON.stringify(rr.luck));
	A(rr.dev < 0.006 && rr.luckRare > rr.noLuckRare * 2, `40,000 seeded rolls match the odds (largest gap ${(rr.dev * 100).toFixed(2)} pts); luck 150 more than doubles Rare+ (${(rr.noLuckRare * 100).toFixed(1)}% -> ${(rr.luckRare * 100).toFixed(1)}%)`, JSON.stringify({ f: rr.freq, o: rr.odds }));
	A(rr.dealLv1 && rr.dealLv1[3] + rr.dealLv1[4] + rr.dealLv1[5] === 0 && rr.dealLv1[1] > 0 && rr.dealLv40[3] + rr.dealLv40[4] + rr.dealLv40[5] > 0 && rr.dealLv40[0] === 0,
		'live deals: every card has a rarity; 80 deals at Lv 1 have no Rare+, 80 at Lv 40 do', JSON.stringify({ lv1: rr.dealLv1, lv40: rr.dealLv40 }));

	// ======================== 2. a move levels 1 -> 8 through the real screen
	const mv = await E(page, () => {
		const H = window.__t, pl = G.Game.player, Mv = G.ExpMoves, out = { screens: [] };
		const vw = () => pl.moves.find(m => m.id === 'vine-whip');
		let g = 0;
		while ((vw().xlv || 1) < 8 && g++ < 120) {
			H.thin();
			const s = H.level((cards, offers) => { const j = offers.findIndex(o => o.key === 'up:vine-whip'); return j >= 0 ? j : Math.max(0, offers.findIndex(o => o.type !== 'new' && o.type !== 'up')); });
			const o = s.offers.find(x => x.key === 'up:vine-whip');
			if (o) out.screens.push({ rar: o.rar, rolls: o.rolls, ds: (s.cards[s.offers.indexOf(o)] || {}).ds, tag: (s.cards[s.offers.indexOf(o)] || {}).title });
		}
		const m = vw(), b = m.x.b;
		out.lv = m.xlv; out.log = m.x.log; out.r = m.x.r; out.list = Mv.rollsFor(m);
		const I = G.ExpItems, typeK = 1 + I.total(pl, 'type.grass'), clsK = 1 + I.total(pl, 'phys');
		out.want = b.dmg * (m.xk || 1) * (1 + 0.08 * 7) * (1 + m.x.r.dmg) * typeK * clsK; out.dmg = m.dmg;
		out.cdWant = b.cd * Math.max(0.35, 1 - m.x.r.cd); out.cd = m.cd;
		out.after = G.ExpLevel.candidates(pl).some(c => c.key === 'up:vine-whip');
		out.level = pl.level;
		return out;
	});
	const scr = mv.screens || [];
	A(mv.lv === 8 && mv.log && mv.log.length === 7, `Vine Whip levels 1 -> 8 through the real level-up screen (7 picks, by Lv ${mv.level})`, JSON.stringify({ lv: mv.lv, n: mv.log && mv.log.length }));
	A(scr.length >= 7 && scr.every(s => s.rolls && s.rolls.length === (s.rar >= 4 ? 3 : 2) && s.rolls.every(r => mv.list.includes(r[0]))),
		'each level\'s card carries 2 rolls (3 at Epic+) from Vine Whip\'s archetype list (' + (mv.list || []).join(', ') + ')', JSON.stringify(scr.map(s => [s.rar, s.rolls])));
	const KV = { dmg: 0.22, crit: 0.05, area: 0.15, speed: 0.15, dur: 0.2, status: 0.25 }, MUL = [1, 1.2, 1.45, 1.75, 2.1];
	A(scr.every(s => s.rolls.every(([k, v]) => k === 'count' ? v === (s.rar >= 4 ? 2 : 1) : k === 'cd' ? Math.abs(v - Math.min(0.25, 0.08 * MUL[s.rar - 1])) < 1e-4 : Math.abs(v - KV[k] * MUL[s.rar - 1]) < 1e-4)),
		'roll sizes follow the study, scaled by rarity: damage +22 % m, cooldown -min(25 %, 8 % m), area / speed +15 % m, crit +5 % m...', JSON.stringify(scr.map(s => [s.rar, s.rolls])));
	A(scr.every(s => /\+8% damage/.test(s.ds) && /Lv \d → \d/.test(s.tag)), 'the card says it: "Lv 3 → 4", "+8% damage · +26% damage · ..."', JSON.stringify(scr.slice(0, 2)));
	A(Math.abs(mv.dmg - mv.want) < 1e-6 && Math.abs(mv.cd - mv.cdWant) < 1e-9 && mv.after === false,
		`its damage is first level x class x (1 + 8 % x 7) x (1 + rolled damage) x the run's stats (${mv.dmg && mv.dmg.toFixed(2)}); its cooldown the rolled one; no card for it at Lv 8`, JSON.stringify({ dmg: mv.dmg, want: mv.want, cd: mv.cd, cdWant: mv.cdWant, after: mv.after }));

	// ======================== 3. the 8 new archetypes
	const ar = await E(page, () => {
		const H = window.__t, pl = G.Game.player, Mv = G.ExpMoves, out = {};
		const saved = { moves: pl.moves, slots: pl.slots, active: pl.active };
		pl.moves = []; pl.slots = []; pl.active = 0;
		G.Weather.clear();
		const one = { lob: 'mud-bomb', homing: 'swift', barrage: 'bullet-seed', smite: 'thunder', vortex: 'whirlpool', wave: 'surf', spin: 'rapid-spin', weather: 'rain-dance' };
		for (const [kind, id] of Object.entries(one)) {
			H.thin(); H.step(2); G.Projectiles.clear(); Mv.clear();
			const m = Mv.instance(id); Mv.base(m); Mv.refresh(pl, m);
			const ring = [[60, 0], [0, 60], [-60, 0], [0, -60], [150, 40], [210, 0]].map(([dx, dy]) => H.dummy(pl.x + dx, pl.y + dy));
			pl.target = ring[0]; pl.aim = 0;
			const hp = () => ring.map(e => Math.round(e.maxHp - e.hp));
			const d0 = ring.map(e => Math.round(G.U.dist(e.x, e.y, pl.x, pl.y)));
			const spawn0 = G.Projectiles.spawn; let shots = 0;
			G.Projectiles.spawn = function (o) { shots++; return spawn0.apply(this, arguments); };
			Mv.run(pl, m, false);
			const proj0 = shots, homing0 = G.Projectiles.all().filter(p => p.owner === pl && p.homing > 0).length;
			const hpNow = hp();
			H.step(9);   // 0.3 s
			const hp03 = hp(), proj03 = shots;
			G.Projectiles.spawn = spawn0;
			H.step(45);  // 1.8 s
			out[kind] = { id, now: hpNow, at03: hp03, end: hp(), proj0, homing0, proj03, d0, d1: ring.map(e => Math.round(G.U.dist(e.x, e.y, pl.x, pl.y))), wx: G.Weather.current && G.Weather.current.kind };
			for (const e of ring) { e.dead = true; e.fade = 0; }
		}
		// through the real combat path: Rapid Spin in a slot, its cooldown -> the combat.run seam
		H.thin(); H.step(2);
		const m = Mv.learn(pl, 'rapid-spin'); Mv.base(m); Mv.refresh(pl, m);
		const e = H.dummy(pl.x + 40, pl.y);
		H.step(40);
		out.combat = { hit: Math.round(e.maxHp - e.hp), slots: pl.slots.length };
		e.dead = true;
		// a co-op partner's cast (ghost): shown, no damage (this player's own moves out of the way)
		pl.moves = []; pl.slots = []; Mv.clear();
		const e2 = H.dummy(pl.x + 40, pl.y + 10), pup = new G.Player(G.DEX_BY[7], {}, false); pup.remote = true; pup.x = pl.x; pup.y = pl.y;
		let threw = null; try { G.Combat.ghostCast(pup, 'surf', 1, 0); G.Combat.ghostCast(pup, 'rapid-spin', 1, 0); } catch (err) { threw = String(err); }
		H.step(30);
		out.ghost = { hit: Math.round(e2.maxHp - e2.hp), threw, fx: Mv.effects.length };
		e2.dead = true;
		pl.moves = saved.moves; pl.slots = saved.slots; pl.active = saved.active;
		G.Weather.clear();
		out.kinds = Mv.KINDS; out.nMoves = Object.keys(Mv.MOVES).length; out.byKind = Mv.KINDS.map(k => Object.values(Mv.MOVES).filter(x => x.kind === k).length);
		return out;
	});
	const sum = a => (a || []).reduce((x, y) => x + y, 0);
	A(ar.kinds && ar.kinds.join() === 'lob,homing,barrage,smite,vortex,wave,spin,weather' && ar.nMoves === 18 && ar.byKind.every(n => n >= 2),
		'8 new archetypes (lob, homing, barrage, smite, vortex, wave, spin, weather), 18 moves (2+ each)', JSON.stringify({ k: ar.kinds, n: ar.nMoves, b: ar.byKind }));
	A(ar.lob && sum(ar.lob.at03) === 0 && sum(ar.lob.end) > 0, 'lob: the bomb flies (nothing at 0.3 s), then bursts where it lands', JSON.stringify(ar.lob));
	A(ar.homing && ar.homing.homing0 === 2 && sum(ar.homing.end) > 0, 'homing: 2 seeking shots that hit', JSON.stringify(ar.homing));
	A(ar.barrage && ar.barrage.proj0 === 1 && ar.barrage.proj03 === 4 && sum(ar.barrage.end) > 0, 'barrage: 4 quick shots one after another (1 at once, the other 3 within 0.3 s), they hit', JSON.stringify(ar.barrage));
	A(ar.smite && sum(ar.smite.now) === 0 && ar.smite.end.filter(x => x > 0).length >= 2, 'smite: a telegraphed strike falls on 2 foes', JSON.stringify(ar.smite));
	A(ar.vortex && sum(ar.vortex.end) > 0 && ar.vortex.d1[4] < ar.vortex.d0[4] - 40 && sum(ar.vortex.now) === 0, 'vortex: a whirl at the target pulls the others in (the foe 155 px out is dragged to it) and ticks damage', JSON.stringify(ar.vortex));
	A(ar.wave && ar.wave.end[5] > 0 && sum(ar.wave.now) === 0, 'wave: a ring spreads from you and reaches the far foe (210 px)', JSON.stringify(ar.wave));
	A(ar.spin && ar.spin.now.slice(0, 4).every(x => x > 0) && ar.spin.now[5] === 0, 'spin: hits everything around you at once (and not the far foe)', JSON.stringify(ar.spin));
	A(ar.weather && ar.weather.wx === 'rain' && sum(ar.weather.end) === 0, 'weather: Rain Dance makes it rain (no damage)', JSON.stringify(ar.weather));
	A(ar.combat && ar.combat.hit > 0, 'in a slot, the game\'s own combat fires it (the combat.run seam)', JSON.stringify(ar.combat));
	A(ar.ghost && !ar.ghost.threw && ar.ghost.hit === 0, 'a co-op partner\'s cast of an Expedition move (combat.ghost) is shown and deals nothing here', JSON.stringify(ar.ghost));

	// ======================== 4. vitamins and slots
	const vt = await E(page, () => {
		const pl = G.Game.player, I = G.ExpItems, L = G.ExpLevel, out = {};
		pl.xv.length = 0; I.apply(pl);   // (start with no vitamins, whatever the earlier levels picked)
		const rl = pl.moves.find(m => m.id === 'razor-leaf'), vw = pl.moves.find(m => m.id === 'vine-whip');
		const sp = pl.moves.find(m => G.ExpLeague.classOf(m.id) === 'spec' && m.dmg);
		const d0 = { rl: rl.dmg, sp: sp && sp.dmg, hp: pl.maxHp, red: pl.dmgReduce };
		I.takeVitamin(pl, 'protein', 0); I.takeVitamin(pl, 'hpup', 0); I.takeVitamin(pl, 'iron', 0);
		out.slots = pl.xv.map(x => x.id);
		out.fourth = I.takeVitamin(pl, 'carbos', 0);
		out.cands = L.candidates(pl).filter(c => c.key.startsWith('vit:')).map(c => c.key);
		out.k = { rl: rl.dmg / d0.rl, sp: sp ? sp.dmg / d0.sp : null, hp: pl.maxHp - d0.hp, red: +(pl.dmgReduce - d0.red).toFixed(4), spId: sp && sp.id };
		for (let i = 0; i < 12; i++) I.takeVitamin(pl, 'protein', 0);
		out.pLv = I.vitOf(pl, 'protein').lvl; out.pV = I.vitOf(pl, 'protein').v;
		out.pCard = L.candidates(pl).some(c => c.key === 'vit:protein');
		const hp1 = pl.maxHp; I.takeVitamin(pl, 'hpup', 4); out.legHp = pl.maxHp - hp1;
		out.n = I.VITAMINS.length; out.stats = new Set(I.VITAMINS.map(v => v.stat)).size;
		out.icons = I.VITAMINS.map(v => v.icon);
		return out;
	});
	A(vt.n === 21 && vt.stats === 21, '21 vitamins, each its own stat (Protein, Calcium, Iron, Zinc, Carbos, HP Up, PP Up, Ether, Dire Hit, X Speed, X Defense, ... Cursed Incense)', JSON.stringify(vt));
	A(JSON.stringify(vt.slots) === '["protein","hpup","iron"]' && vt.fourth === null && vt.cands && vt.cands.every(k => ['vit:protein', 'vit:hpup', 'vit:iron'].includes(k)),
		'3 vitamin slots: a 4th new vitamin is refused and never offered (only the 3 you have can level)', JSON.stringify({ s: vt.slots, c: vt.cands }));
	A(vt.k && Math.abs(vt.k.rl - 1.1) < 1e-6 && (vt.k.sp === null || Math.abs(vt.k.sp - 1) < 1e-9) && vt.k.hp === 18 && vt.k.red === 0.05,
		'each stat lands: Protein +10 % on physical moves (Razor Leaf) and not on special ones (' + (vt.k && vt.k.spId) + '), HP Up +18 max HP, Iron +5 armor = 5 % less damage', JSON.stringify(vt.k));
	A(vt.pLv === 10 && Math.abs(vt.pV - 1.0) < 1e-6 && vt.pCard === false && vt.legHp === 38, 'a vitamin stops at Lv 10 (Protein: +100 %, no more cards); a Legendary card gives x2.1 (HP Up +38)', JSON.stringify(vt));
	// a vitamin card on the real screen, with its overworld icon
	const vc = await E(page, async () => {
		const H = window.__t, pl = G.Game.player, I = G.ExpItems;
		pl.xv.length = 0; I.apply(pl);
		let got = null, g = 0;
		while (!got && g++ < 40) { H.thin(); const s = H.level((cards, offers) => { const j = offers.findIndex(o => o.key.startsWith('vit:')); if (j >= 0) got = s0(cards[j]); return Math.max(0, j); }); }
		function s0(c) { return c; }
		const img = document.querySelector('#cards .card .ico-item');
		return { got, xv: pl.xv.map(x => [x.id, x.lvl]) };
	});
	A(vc.got && /Vitamin/.test(vc.got.title) && vc.xv && vc.xv.length === 1, 'a "New · Vitamin" card on the real screen, picked: the vitamin is in slot 1', JSON.stringify(vc));
	const ic = await E(page, async () => {
		const I = G.ExpItems, urls = I.VITAMINS.map(v => I.icon(v.icon)).concat(I.ITEMS.map(i => I.icon(i.icon)));
		const ok = await Promise.all(urls.map(u => new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalWidth > 0); im.onerror = () => r(false); im.src = u; })));
		return { n: urls.length, bad: urls.filter((u, i) => !ok[i]) };
	});
	A(ic.n === 81 && ic.bad && ic.bad.length === 0, 'every vitamin and item icon is an existing overworld item picture (/overworld/item_icons, 81 loads, no new art)', JSON.stringify(ic));

	// ======================== 5. Refresh / Skip / Banish
	const tl = await E(page, async () => {
		const H = window.__t, pl = G.Game.player, L = G.ExpLevel, out = {};
		const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
		H.thin();
		G.Game.debugLevelUp(); H.step(2);
		await new Promise(r => setTimeout(r, 0));
		out.start = { rr: document.getElementById('lvl-rr-n').innerText, rrVis: vis('lvl-reroll'), skip: (document.getElementById('lvl-skip') || {}).innerText, skipVis: vis('lvl-skip'), ban: document.getElementById('lvl-ban-n').innerText, banVis: vis('lvl-ban') };
		const k0 = G.RunUI.offers.map(o => o.key + o.rar).join();
		document.getElementById('lvl-reroll').click();
		const k1 = G.RunUI.offers.map(o => o.key + o.rar).join();
		// Banish: on a level-up card it is refused; on a new move / new vitamin it removes it for the run
		if (!G.RunUI.offers.some(o => o.xban)) document.getElementById('lvl-reroll').click();
		document.getElementById('lvl-ban').click();
		const ups = G.RunUI.offers.map((o, i) => [o, i]).filter(([o]) => o.type === 'up');
		out.banUp = ups.length ? G.RunUI.ban(ups[0][1]) : false;
		const nb = G.RunUI.offers.findIndex(o => o.xban);
		let target = nb >= 0 ? G.RunUI.offers[nb].xban : null;
		if (nb >= 0) G.RunUI.ban(nb);
		out.ban = { target, set: [...(pl.banned || [])], left: pl.bansLeft };
		if (pl.rerolls < 2) document.getElementById('lvl-reroll').click();
		await new Promise(r => setTimeout(r, 0));
		out.reroll = { changed: k0 !== k1, left: pl.rerolls, hidden: !vis('lvl-reroll') };
		// Skip: the button
		const c0 = pl.coins, skBefore = L.skipsLeft();
		document.getElementById('lvl-skip').click();
		H.step(1);
		out.skip1 = { closed: !G.UI.isOpen('scr-levelup'), coins: pl.coins - c0, left: L.skipsLeft(), before: skBefore, zone: L.zone() };
		// Skip: the X key, next level
		G.Game.debugLevelUp(); H.step(2);
		await new Promise(r => setTimeout(r, 0));
		document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x', bubbles: true }));
		H.step(1);
		out.skip2 = { closed: !G.UI.isOpen('scr-levelup'), left: L.skipsLeft() };
		// no Skip left: the button stays hidden, X does nothing
		G.Game.debugLevelUp(); H.step(2);
		await new Promise(r => setTimeout(r, 0));
		out.skip3 = { vis: vis('lvl-skip'), took: L.skip() };
		[...document.querySelectorAll('#cards .card')][0].click(); H.step(1);
		// the banished one never comes back
		let seen = 0;
		if (target) for (let i = 0; i < 150; i++) for (const c of L.offer(pl)) if (c.xban === target) seen++;
		out.seen = seen;
		return out;
	});
	A(tl.start && tl.start.rr === '2' && tl.start.rrVis && /Skip \(2\)/.test(tl.start.skip) && tl.start.skipVis && tl.start.ban === '1' && tl.start.banVis,
		'the level-up screen: Refresh (2), Skip (2), Ban (1)', JSON.stringify(tl.start));
	A(tl.reroll && tl.reroll.changed && tl.reroll.left === 2 && tl.reroll.hidden, 'Refresh deals new cards; after 2 the button is gone', JSON.stringify(tl.reroll));
	A(tl.ban && tl.banUp === false && tl.ban.target && tl.ban.set.includes(tl.ban.target) && tl.ban.left === 0 && tl.seen === 0,
		`Banish: refused on a level-up card; on a new ${tl.ban && /^v:/.test(tl.ban.target) ? 'vitamin' : 'move'} (${tl.ban && tl.ban.target}) it is gone for the run (0 of 450 later cards)`, JSON.stringify({ ban: tl.ban, up: tl.banUp, seen: tl.seen }));
	A(tl.skip1 && tl.skip1.closed && tl.skip1.coins === 10 * tl.skip1.zone && tl.skip1.left === 1 && tl.skip2 && tl.skip2.closed && tl.skip2.left === 0 && tl.skip3 && !tl.skip3.vis && tl.skip3.took === false,
		'Skip: the button (no card, +10 x zone Pokémonedas of the run), then the X key; with none left it is hidden and does nothing', JSON.stringify({ a: tl.skip1, b: tl.skip2, c: tl.skip3 }));

	// ======================== 6. items: caps, additive stacking, boosters, pickups, procs
	const it = await E(page, () => {
		const H = window.__t, pl = G.Game.player, I = G.ExpItems, out = {};
		const am0 = pl.atkMul / (pl.xap.atkMul || 1), hp0 = pl.maxHp, bare = pl.maxHp - (pl.xap.hpFlat || 0) - (pl.xap.hpPctAmt || 0);
		out.counts = [0, 1, 2, 3, 4].map(r => I.ITEMS.filter(i => i.rar === r).length); out.n = I.ITEMS.length; out.boost = I.BOOST.length;
		out.takes = [1, 2, 3, 4].map(() => I.takeItem(pl, 'lifeorb'));
		let lo = 0; const rng = G.DLC.rng(77); for (let i = 0; i < 3000; i++) if (I.rollItem(pl, rng) === 'lifeorb') lo++;
		out.lifeorbRolled = lo;
		I.takeItem(pl, 'masterball');
		out.atk = +(pl.atkMul / am0).toFixed(4);
		out.hpLoss = hp0 - pl.maxHp; out.hpWant = Math.round(bare * 0.3);
		const vw = pl.moves.find(m => m.id === 'vine-whip'), v0 = vw.dmg;
		I.takeItem(pl, 'miracleseed'); I.takeItem(pl, 'miracleseed'); I.takeItem(pl, 'silkscarf');
		out.grass = +(vw.dmg / v0).toFixed(4);
		// the real pickup path: a dropped item rolls an Expedition item (item.roll) and is taken at once (item.take)
		const v = G.Items.roll(); out.rolled = v;
		const st0 = JSON.stringify(pl.xi);
		G.Pickups.drop('item', pl.x, pl.y, v);
		const p = G.Pickups.all().find(o => o.kind === 'item' && o.value === v);
		G.Game.debugCollect(p);
		out.took = JSON.stringify(pl.xi) !== st0; out.state = G.Game.state; out.baseItem = pl.item;
		// procs: Max Revive (a real KO), Zinc's shield, Electirizer
		H.unsturdy();
		I.takeItem(pl, 'maxrevive');
		H.thin(); H.step(1);
		pl.invuln = 0; pl.hurt(99999, null, true); out.revived = { dead: pl.dead, hp: Math.round(pl.hp), want: Math.round(pl.maxHp * 0.6) };
		I.takeVitamin(pl, 'zinc', 0); pl.xproc.shieldT = 99; H.step(1);
		const hpS = pl.hp, sh = I.total(pl, 'shield'); pl.invuln = 0; pl.hurt(8, null, true); out.shield = { absorbed: pl.hp === hpS, left: pl.xproc.shield, want: sh - 8, sh };
		H.sturdy();
		H.thin(); H.step(2);
		I.takeItem(pl, 'electirizer');
		const keep = { moves: pl.moves, slots: pl.slots };   // (the player's own moves would hit the dummies too)
		pl.moves = []; pl.slots = [];
		pl.xproc.t.p_bolt = 0;
		const ds = [H.dummy(pl.x + 80, pl.y), H.dummy(pl.x - 80, pl.y), H.dummy(pl.x, pl.y + 80), H.dummy(pl.x, pl.y - 300)];
		H.step(90);
		out.bolt = ds.map(e => Math.round(e.maxHp - e.hp));
		for (const e of ds) e.dead = true;
		pl.moves = keep.moves; pl.slots = keep.slots;
		out.texts = ['lifeorb', 'focusband', 'charcoal', 'reliccrown'].map(id => I.itemText(id));
		return out;
	});
	A(it.n === 60 && it.boost === 18 && JSON.stringify(it.counts) === '[28,12,10,6,4]', '60 items: 18 type boosters + 10 common, 12 uncommon, 10 rare, 6 epic, 4 legendary', JSON.stringify(it));
	A(JSON.stringify(it.takes) === '[1,2,3,0]' && it.lifeorbRolled === 0, 'caps: Life Orb stacks to 3; a 4th is refused, and a capped item is never rolled (0 of 3,000)', JSON.stringify({ t: it.takes, r: it.lifeorbRolled }));
	A(it.atk === 2.15 && Math.abs(it.hpLoss - it.hpWant) <= 1, 'same-stat bonuses ADD: Life Orb x3 + Master Ball = +115 % damage (x2.15, not 1.3^3 x 1.25 = x2.75); 3 x -10 % max HP = -30 %', JSON.stringify({ atk: it.atk, hp: [it.hpLoss, it.hpWant] }));
	A(it.grass === 1.6, 'type boosters: 2 Miracle Seeds = +60 % on Grass moves (Vine Whip); a Silk Scarf (Normal) adds only its +3 % to everything... which goes to the attack, not the move', JSON.stringify(it.grass));
	A(/^x:/.test(it.rolled || '') && it.took && it.state === 'playing' && !it.baseItem, 'a dropped item is an Expedition one (item.roll, seeded) and is taken at once, no choice screen, never a base item', JSON.stringify({ r: it.rolled, took: it.took, st: it.state }));
	A(it.revived && !it.revived.dead && Math.abs(it.revived.hp - it.revived.want) <= 1 && it.shield && it.shield.absorbed && it.shield.left === it.shield.want && it.shield.sh >= 12,
		'procs: Max Revive brings you back at 60 % from a real KO; Zinc\'s shield (12) absorbs an 8-damage hit', JSON.stringify({ r: it.revived, s: it.shield }));
	A(it.bolt && it.bolt.slice(0, 3).every(x => x > 0) && it.bolt[3] === 0, 'Electirizer: every 2.5 s a bolt on the 3 nearest foes (not the far one)', JSON.stringify(it.bolt));
	A(it.texts && /\+30% damage/.test(it.texts[0]) && /-10% max HP/.test(it.texts[0]) && /1 HP/.test(it.texts[1]) && /Fire-type/.test(it.texts[2]) && /Stops time/.test(it.texts[3]), 'item texts (English)', JSON.stringify(it.texts));

	// ======================== 7. the XP curve
	const xp = await E(page, (PROBE) => {
		const L = G.ExpLevel, pl = G.Game.player, out = {};
		const need = L => Math.round(2 * (8 + 5.5 * L + Math.pow(L, 1.8)));
		out.curve = [1, 10, 30, 54].map(l => [G.Player.xpNeed(l), need(l)]);
		const base = l => Math.floor((8 + l * 6 + Math.pow(l, 1.75) * 1.6) * 4);
		const lvAt = (xp, f) => { let l = 1; while (xp >= f(l)) { xp -= f(l); l++; } return l; };
		out.exp = [PROBE.z1, PROBE.z2, PROBE.z3].map(x => lvAt(x, need));
		out.base = [PROBE.z1, PROBE.z2, PROBE.z3].map(x => lvAt(x, base));
		let c = 0; for (let l = 1; l < 55; l++) c += need(l); out.cum55 = c;
		// the League's late evolutions (Dragonite / Tyranitar at 55, Salamence at 50)
		const D = G.ExpLeague.D; out.late = Math.max(...D.members.map(m => Math.max(0, ...Object.values(m.evo).flat().map(x => x[1]))));
		return out;
	}, PROBE);
	A(xp.curve && xp.curve.every(([a, b]) => a === b), 'the Expedition XP curve on the real player: 2 x (8 + 5.5 L + L^1.8) (Lv 1: 29, Lv 10: 230, Lv 30: 928, Lv 54: 2236)', JSON.stringify(xp.curve));
	A(xp.exp && xp.exp[2] >= 60 && xp.exp[1] >= 40 && xp.base[2] <= 47 && xp.cum55 <= PROBE.z3 * 0.62 && xp.late === 55,
		`pacing: a spawn-limited Classic run's XP (${PROBE.z1} / ${PROBE.z2} / ${PROBE.z3} at the end of zones 1-3, ${PROBE.minutes} min) reaches Lv ${xp.exp && xp.exp.join(' / ')} (the base curve: ${xp.base && xp.base.join(' / ')}); Lv 55, the League's latest evolution, needs ${xp.cum55} = ${xp.cum55 && Math.round(xp.cum55 / PROBE.z3 * 100)} % of it`, JSON.stringify(xp));
	await E(page, () => G.Game.quit());
	await sleep(300);

	// a Dratini run (met through its challenge in this profile) levelled by REAL XP evolves to Dragonite at 55
	const dr = await E(page, async () => {
		await G.Expedition.load(); await G.ExpSave.open();
		const S = G.ExpSave; S.bump('wins.viridian.normal', 2); S.best('lg.lv', 40); G.ExpLeague.checkChallenges(); S.commit();
		const set = G.ExpLeague.setPick(147);
		return { set, play: G.ExpLeague.playable(147) };
	});
	const r2 = await startClassic(page);
	const dl = await E(page, (cum) => {
		const H = window.__t, pl = G.Game.player, out = { start: pl.dex };
		const n = G.Player.prototype.gainXp.call(pl, cum / pl.xpMul);
		out.n = n; out.level = pl.level;
		G.Game.grantLevels(n, false);
		let g = 0;
		while (G.Game.pendingLevels > 0 || G.UI.isOpen('scr-levelup')) { if (g++ > 200) break; H.thin(); H.step(1); const c = document.querySelector('#cards .card'); if (c && G.UI.isOpen('scr-levelup')) { c.click(); H.step(1); } }
		out.dex = pl.dex; out.row = G.ExpLeague.row();
		return out;
	}, xp.cum55 || 69169);
	A(dr.set && r2.ok && r2.dex === 147 && dl.n === 54 && dl.level === 55 && dl.dex === 149 && dl.row && dl.row[4] === 2,
		'a Dratini run given exactly that XP through the real gainXp reaches Lv 55 and evolves through Dragonair (30) to Dragonite (55)', JSON.stringify({ dr, r2, dl }));
	await E(page, () => { G.ExpLeague.setPick(1); G.Game.quit(); });
	await sleep(300);

	// ======================== 8. determinism and viewers
	const r3 = await startClassic(page);
	const dt = await E(page, () => {
		const H = window.__t, pl = G.Game.player, L = G.ExpLevel, I = G.ExpItems, out = {};
		H.thin();
		for (let i = 0; i < 6; i++) H.level();
		I.takeItem(pl, 'leftovers'); I.takeItem(pl, 'leftovers'); I.takeItem(pl, 'charcoal'); I.takeVitamin(pl, 'carbos', 2);
		// no Math.random in a deal or a drop
		const real = Math.random; let calls = 0;
		Math.random = function () { calls++; return real(); };
		const S = L.run, d0 = S.draw, i0 = S.items;
		const a = []; for (let i = 0; i < 30; i++) a.push(L.offer(pl).map(c => [c.key, c.rar, c.rolls || null]));
		const ia = []; for (let i = 0; i < 30; i++) ia.push(L.itemRoll(pl));
		Math.random = real;
		out.calls = calls;
		S.draw = d0; S.items = i0;
		const b = []; for (let i = 0; i < 30; i++) b.push(L.offer(pl).map(c => [c.key, c.rar, c.rolls || null]));
		const ib = []; for (let i = 0; i < 30; i++) ib.push(L.itemRoll(pl));
		out.same = JSON.stringify(a) === JSON.stringify(b); out.sameItems = JSON.stringify(ia) === JSON.stringify(ib);
		out.distinct = new Set(a.map(x => JSON.stringify(x))).size;
		// the x block v5
		const snap = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const m = { uid: 'bob', name: 'bob', connected: true, pl: G.Game.player };
		const had = Object.getOwnPropertyDescriptor(G.Net, 'uid');
		Object.defineProperty(G.Net, 'uid', { configurable: true, get: () => 'alice' });
		const hf = G.Hooks.reduce('net.frame', { k: 'f' }, m).x, gf = G.Hooks.reduce('net.frame', { k: 'f' }, null).x;
		if (had) Object.defineProperty(G.Net, 'uid', had); else delete G.Net.uid;
		out.snap = snap; out.hf = hf && hf.u; out.gf = gf && gf.u; out.xi = Object.assign({}, pl.xi); out.seed = G.World.seed;
		return out;
	});
	A(dt.calls === 0, 'no Math.random in 30 deals and 30 item drops (seeded G.DLC.rng streams)', dt.calls);
	A(dt.same && dt.sameItems && dt.distinct > 20, 'the same run + draw deals the same cards (keys, rarities, rolls) and drops the same items; successive deals differ', JSON.stringify({ s: dt.same, i: dt.sameItems, d: dt.distinct }));
	const u = dt.snap && dt.snap.x && dt.snap.x.u;
	A(dt.snap && dt.snap.x.xv === 6 && u && u.p && u.p.i.leftovers === 2 && u.p.i.charcoal === 1 && JSON.stringify(u.p.v) === '[["carbos",1]]' && Array.isArray(u.p.t) && u.p.t.length === 3,
		'a live snapshot: x v5 with `u` {p: {v: vitamins, i: items, m: move levels, t: tools}}', JSON.stringify(u));
	A(dt.hf && dt.hf.q && dt.hf.q.alice && dt.hf.q.alice.i.leftovers === 2 && dt.gf && dt.gf.p && dt.gf.p.i.charcoal === 1,
		'a co-op host frame carries the host\'s bag by uid; a guest\'s own frame carries its own', JSON.stringify({ hf: dt.hf, gf: dt.gf }));
	// the run ends: the line, the counters
	const ov = await E(page, async () => {
		const pl = G.Game.player; pl.xi.amuletcoin = 1;
		G.Game.quit(); await new Promise(r => setTimeout(r, 300));
		const S = G.ExpSave, e = G.Replay.last; if (e && e.ready) await e.ready;
		return { text: (document.getElementById('scr-over') || {}).innerText, cards: S.get('lv.cards'), vit: S.get('lv.vitmax'), stacks: S.get('lv.stacks'), code: e && e.code };
	});
	A(/Items: 4 · Vitamins: Carbos 1/.test(ov.text || '') && ov.cards >= 6 && ov.vit >= 1 && ov.stacks >= 4, 'the run-over screen: "Items: 4 · Vitamins: Carbos 1"; the Expedition save counts the cards, best vitamin, stacks', JSON.stringify({ t: (ov.text || '').slice(0, 300), c: ov.cards, v: ov.vit, s: ov.stacks }));
	A(!!ov.code, 'the run\'s replay is kept');

	// ======================== 9. base modes untouched in the same page (Expedition code loaded)
	const bs = await E(page, async () => {
		const H = window.__t;
		H.thaw(); await G.Flow.play('normal'); H.freeze();
		const pl = G.Game.player; H.sturdy();
		const out = { loaded: G.Expedition.loaded, mode: G.Game.mode };
		out.item = G.Items.roll(); out.baseItem = !!G.Items.BY[out.item];
		out.need = [G.Player.xpNeed(1), G.Player.xpNeed(10)]; out.baseNeed = [G.Player.xpFor(1), G.Player.xpFor(10)];
		G.Game.debugLevelUp(); H.step(2);
		out.cards = [...document.querySelectorAll('#cards .card')].map(el => el.className);
		out.skip = (document.getElementById('lvl-skip') || { classList: { contains: () => true } }).classList.contains('hidden');
		out.bag = (document.getElementById('xbag') || { classList: { contains: () => true } }).classList.contains('hidden');
		out.maxMoves = pl.maxMoves; out.xv = !!pl.xv;
		[...document.querySelectorAll('#cards .card')][0].click(); H.step(1);
		G.Game.quit(); await new Promise(r => setTimeout(r, 200));
		return out;
	});
	A(bs.loaded && bs.mode === 'normal' && bs.baseItem && JSON.stringify(bs.need) === JSON.stringify(bs.baseNeed) && bs.cards.length === 3 && bs.cards.every(c => !/rar/.test(c)) && bs.skip && bs.bag && bs.maxMoves === 4 && !bs.xv,
		'a Normal run in the same page (Expedition code loaded): base items, the base XP curve, base cards (no rarity, no Skip), no bag, 4 slots', JSON.stringify(bs));

	// fresh pages: a co-op guest, a live spectator, a replay viewer
	const d3 = await bootPage();
	const vw = await E(d3.page, async (rec) => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const H = window.__t, out = { loadedBefore: G.Expedition.loaded };
		G.Flow.play('normal');
		H.freeze();
		G.World.reset(rec.seed);
		const pl = G.Game.player;
		const cb = new Proxy({}, { get: (t, k) => k === 'team' ? () => ({}) : () => {} });
		G.Coop.begin({ seed: rec.seed, host: 'alice', members: [{ uid: 'alice', name: 'alice', dex: 1 }, { uid: G.Net.uid, name: 'me', dex: 25 }] }, pl, cb);
		const row = { v: [['carbos', 3]], i: { leftovers: 2, masterball: 1 }, m: { 'vine-whip': 5 }, e: ['surf'], t: [1, 2, 0] };
		const x = Object.assign({}, rec.snap.x, { a: { q: {} }, l: { q: { alice: [1, 2, 4, 0, 1] } }, u: { q: { alice: row } } });
		const frame = { k: 'f', t: 1, lv: 1, xp: 0, xn: 10, ki: 0, bo: 0, co: 0, tk: [0, 0], p: { alice: [0, 0, 0, 0, 100, 100, 0, '', 1, 78, 0, 1, 0, 0, 0] }, e: [], ev: [], ho: [], x };
		H.deliver('alice', frame);
		for (let i = 0; i < 100 && !(G.Exp && G.World.zone && G.ExpLevel); i++) await wait(50);
		H.deliver('alice', Object.assign({}, frame, { t: 2 }));
		const alice = G.Coop.mates.find(m => m.uid === 'alice');
		out.guest = { xu: alice && alice.pl.xu, moves: alice && alice.pl.moves.map(m => m.id) };
		G.Coop.end(); G.Game.quit(); await wait(200);
		// a live spectator
		G.MicaAccount.name = () => 'viewer';
		G.Spectate.watch = (u, h) => { h.snapshot(rec.snap, {}); };
		G.WatchUI.watchLive('host');
		for (let i = 0; i < 60 && !(G.WatchUI.player && G.World.zone); i++) await wait(50);
		await wait(300);
		const bag = document.getElementById('xbag');
		out.spec = { xu: G.WatchUI.player && G.WatchUI.player.xu, shown: !!bag && !bag.classList.contains('hidden'), icons: bag ? bag.querySelectorAll('#xbag-items img').length : 0, vit: bag ? bag.querySelectorAll('#xbag-vit img').length : 0 };
		G.WatchUI.leave(); await wait(200);
		// a v4 block (no `u`) still loads: no bag
		const old = Object.assign({}, rec.snap, { dv: 3, x: Object.assign({}, rec.snap.x, { xv: 4 }) });
		delete old.x.u;
		const pup = new G.Player(G.DEX_BY[1], {}, false); pup.remote = true;
		G.Exp.viewAir(old, pup, null);
		out.old = { xu: pup.xu, ok: G.Expedition.replayOk(3), notice: G.Expedition.viewNotice('exp-classic', 3), dv: G.Expedition.DV };
		// the replay viewer
		const rd = await G.Replay.open(rec.code);
		let withU = 0; for (let i = 0; i < rd.length; i++) { const s = rd.at(i); if (s.x && s.x.u && s.x.u.p) withU++; }
		G.WatchUI.playReplay(rd, {});
		for (let i = 0; i < 60 && !G.WatchUI.player; i++) await wait(50);
		G.WatchUI.togglePlay();
		G.WatchUI.seek(rd.times[rd.length - 1]); await wait(300);
		out.replay = { frames: rd.length, withU, xu: G.WatchUI.player && G.WatchUI.player.xu, icons: document.querySelectorAll('#xbag-items img').length };
		G.WatchUI.leave();
		return out;
	}, { seed: dt.seed, snap: dt.snap, code: ov.code });
	A(vw.loadedBefore === false && vw.guest && vw.guest.xu && vw.guest.xu.i.masterball === 1 && vw.guest.moves.includes('surf'),
		'a co-op guest (a fresh page; a host frame through G.Net) shows the host\'s bag and adds her Expedition move (Surf) to her puppet', JSON.stringify(vw.guest || vw));
	A(vw.spec && vw.spec.shown && vw.spec.icons === 2 && vw.spec.vit === 1 && vw.spec.xu.i.leftovers === 2, 'a live spectator sees the bag strip: 1 vitamin, 2 items (Leftovers ×2, Charcoal)', JSON.stringify(vw.spec));
	A(vw.old && vw.old.xu === null && vw.old.ok && !vw.old.notice && vw.old.dv === 5, 'a dv-3 / x v4 snapshot (no `u`) still loads with no notice: no bag; this build is dv 5 (D6)', JSON.stringify(vw.old));
	A(vw.replay && vw.replay.withU > 0 && vw.replay.xu && vw.replay.xu.i.leftovers === 2 && vw.replay.icons >= 2, 'a replay viewer: the recording carries `u` and seeking shows the bag', JSON.stringify(vw.replay));
	await d3.ctx.close();

	// ======================== 10 + 11. the phone (and desktop) layouts, the screenshots
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = await bootPage(view);
		const st = await startClassic(d.page);
		A(st.ok && st.lv, `${tag}: Classic starts`, JSON.stringify(st));
		// a few levels and items so the bag has something in it
		await E(d.page, () => {
			const H = window.__t, pl = G.Game.player, I = G.ExpItems;
			for (let i = 0; i < 5; i++) { H.thin(); H.level(); }
			for (const id of ['leftovers', 'leftovers', 'charcoal', 'quickclaw', 'focusband', 'electirizer', 'masterball']) I.takeItem(pl, id);
			for (const [id, ti] of [['protein', 2], ['protein', 0], ['zinc', 1], ['luckypunch', 0]]) I.takeVitamin(pl, id, ti);
			pl.level = 24; H.step(10);
		});
		const lay = await E(d.page, async () => {
			const H = window.__t;
			G.Game.debugLevelUp(); H.step(2);
			await new Promise(r => setTimeout(r, 0));   // (the Skip button follows the deal a microtask later)
			const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
			const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; };
			return { W: innerWidth, Hh: innerHeight, sw: document.scrollingElement.scrollWidth, cards: [...document.querySelectorAll('#cards .card')].map(r), rar: [...document.querySelectorAll('#cards .card')].map(el => +(el.dataset.rar || 0)),
				btns: ['lvl-reroll', 'lvl-skip', 'lvl-ban'].map(id => vis(id) ? r(document.getElementById(id)) : null), touch: G.Touch.active };
		});
		const inV = b => b && b.x >= -1 && b.r <= lay.W + 1 && b.y >= -1 && b.b <= lay.Hh + 1;
		A(lay.cards.length === 3 && lay.cards.every(inV) && lay.btns.every(inV) && lay.sw <= lay.W + 1 && lay.rar.every(x => x >= 1),
			`${tag}: the level-up screen fits (${lay.W}x${lay.Hh}): 3 rarity cards, Refresh / Skip / Ban inside, no sideways scroll`, JSON.stringify(lay));
		if (tag === 'phone') A(lay.touch, 'phone: touch controls are on');
		if (SHOTS) await shoot(d.page, `levelup_choice_${tag}.png`, 400);
		// a rarity spread: one card of each rarity on the real screen (the real level's card picked first)
		await E(d.page, () => { [...document.querySelectorAll('#cards .card')][0].click(); window.__t.step(2); });
		await E(d.page, () => {
			const pl = G.Game.player, L = G.ExpLevel, rng = G.DLC.rng(5);
			const c = L.candidates(pl), pick = [c.find(x => x.kind === 'move'), c.find(x => x.key.startsWith('new:')) || c[1], c.find(x => x.kind === 'vit'), c.filter(x => x.kind === 'move')[1] || c[2], c.filter(x => x.kind === 'vit')[1] || c[3]];
			const cards = pick.map((x, i) => x.make(i, rng));
			G.RunUI.showLevelUp(pl.level, cards, card => { card.apply(pl); }, false);
		});
		const sp = await E(d.page, () => ({ rar: [...document.querySelectorAll('#cards .card')].map(el => +(el.dataset.rar || 0)), chips: [...document.querySelectorAll('#cards .rar-chip')].map(e => e.innerText),
			fits: [...document.querySelectorAll('#cards .card')].every(el => { const b = el.getBoundingClientRect(); return b.x >= -1 && b.right <= innerWidth + 1; }) }));
		A(JSON.stringify(sp.rar) === '[1,2,3,4,5]' && JSON.stringify(sp.chips.map(s => s.toUpperCase())) === '["COMMON","UNCOMMON","RARE","EPIC","LEGENDARY"]' && sp.fits,
			`${tag}: a rarity spread, one card of each tier, each framed and named (Common ... Legendary)`, JSON.stringify(sp));
		if (SHOTS) await shoot(d.page, `levelup_rarity_spread_${tag}.png`, 400);
		await E(d.page, () => { [...document.querySelectorAll('#cards .card')][0].click(); window.__t.step(2); });
		// the bag: the HUD strip and the pause panel
		const bag = await E(d.page, () => {
			const H = window.__t; H.step(10);
			const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
			const strip = document.getElementById('xbag');
			const out = { W: innerWidth, Hh: innerHeight, strip: r(strip), shown: !strip.classList.contains('hidden'), vit: strip.querySelectorAll('#xbag-vit img').length, items: strip.querySelectorAll('#xbag-items img').length, stacks: [...strip.querySelectorAll('#xbag-items b')].map(b => b.innerText) };
			G.Game.togglePause();
			return out;
		});
		await sleep(150);
		const pz = await E(d.page, () => {
			const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
			const p = document.getElementById('pause-xbag');
			return { W: innerWidth, Hh: innerHeight, box: r(p), shown: p && !p.classList.contains('hidden'), text: p && p.innerText, scroll: p && p.scrollHeight > p.clientHeight, resume: r(document.getElementById('btn-resume')),
				pbox: r(document.querySelector('#scr-pause .box')) };
		});
		A(bag.shown && bag.vit === 3 && bag.items === 6 && bag.stacks.includes('2') && bag.strip && bag.strip.x >= 0 && bag.strip.r <= bag.W && bag.strip.b <= bag.Hh,
			`${tag}: the bag strip shows 3 vitamins and 6 items (Leftovers ×2) inside the screen`, JSON.stringify(bag));
		A(pz.shown && /Vitamins \(3\/3\)/i.test(pz.text) && /Protein\s+Lv 2\/10/.test(pz.text) && /Leftovers\s+×2 \/ 5/.test(pz.text) && /Refresh \d · Skip \d · Banish \d/.test(pz.text) && pz.box && pz.box.x >= 0 && pz.box.r <= pz.W && pz.box.y >= 0 && pz.box.b <= pz.Hh && pz.pbox && pz.pbox.r <= pz.box.x + 1 && pz.resume && pz.resume.r <= pz.box.x,
			`${tag}: the pause screen lists the vitamins (3/3, levels, totals), the items (stacks / caps), the moves and the tools, and fits${pz.scroll ? ' (it scrolls)' : ''}`, JSON.stringify(pz));
		if (SHOTS) await shoot(d.page, `bag_pause_${tag}.png`, 300);
		await E(d.page, () => G.Game.togglePause());
		if (SHOTS) await shoot(d.page, `bag_strip_${tag}.png`, 500);
		await d.ctx.close();
	}

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
