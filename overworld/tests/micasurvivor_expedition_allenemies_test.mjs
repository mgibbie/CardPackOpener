// micasurvivor_expedition_allenemies_test.mjs — MicaSurvivor DLC D20: all 1,025 Pokémon as enemies (owner 2026-10-26: "increase
// coverage to the full 1025 for both enemies and playable characters in both regular and expedition mode").
//   0. Expedition (Node, the real js/expedition/classic.js + survival.js in a sandbox): the union of G.ExpClassic.plan's outputs
//      (cards, wanderers, events, guardians, shrine legendaries) and Survival's segments over many seeds covers all 1,025 species;
//      the wanderers are off the map's types (or below zone 1's band); zone 3 has a rarity-5 elite pack; roaming legendaries; the
//      cards, guardian and D3 timeline of a plan are what they were before D20 (the new draws come from their own stream)
//   1. base (Node, the real js/data/enemies.js): every species is a base enemy somewhere (the tiers' candidates, the boss slots,
//      the legendaries of the rift / judgment / tower); Wishiwashi (#746, BST 175) is a first-tier candidate and joins its Water
//      hordes (it never could: below the lowest tier, only in the unused "beach" biome; the regression checks fail reverted)
//   2. FIRE (the browser): an Expedition Classic zone's trickle spawns wanderers as a minority share; a roaming legendary spawns
//      as a special and leaves after its time; zone 3's rarity-5 elites spawn; a base Water horde spawns a Wishiwashi
//   node overworld/tests/micasurvivor_expedition_allenemies_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves micasurvivor/
//  from another tree: how the "fails before D20" count is taken.)
import http from 'http';
import fs from 'fs';
import vm from 'vm';
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
const PORT = 8874;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
const SEEDS = 1500;

// ======================== 0 / 1. the sandbox: the game's own files
const ctx = { G: {}, console, Math, performance: { now: () => 0 } };
ctx.window = ctx;
vm.createContext(ctx);
ctx.G.I18n = { add() {}, t: s => s, f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); }, lang: 'en' };
ctx.G.Modes = { onlyType: () => null, is: () => false, run: {} };
let loadOk = true;
try {
	for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/data/enemies.js', 'js/expedition/terrain.js', 'js/expedition/classic.js', 'js/expedition/survival.js'])
		vm.runInContext(fs.readFileSync(path.join(MROOT, 'micasurvivor', f), 'utf8'), ctx, { filename: f });
} catch (e) { loadOk = false; console.log(e); }
const G = ctx.G, C = G.ExpClassic, SV = G.ExpSurv, EN = G.Enemies;
A(loadOk && C && SV && EN && G.DEX && G.DEX.length === 1025, 'the game\'s Pokédex, enemies.js, classic.js and survival.js load in a sandbox (1,025 species)');
const ALL = G.DEX.map(p => p.dex), BY = {};
for (const p of G.DEX) BY[p.dex] = p;
if (C && SV) {
	const seen = new Set(), wanderSeen = new Set(), bad = [];
	let r5zone3 = 0, roams = 0, wanderN = 0, cardsN = 0;
	for (let s = 1; s <= SEEDS; s++) for (const map of C.MAP_IDS) {
		const M = C.MAPS[map];
		for (let z = 1; z <= 4; z++) {
			const p = C.plan(s * 7919, map, z, 'normal');
			for (const d of p.cards) seen.add(d);
			seen.add(p.guardian); seen.add(p.legend);
			cardsN += p.cards.length;
			for (const d of p.wander || []) {
				seen.add(d); wanderSeen.add(d); wanderN++;
				const zi = Math.min(3, z) - 1;
				if (BY[d].types.some(t => M.types.includes(t)) && BY[d].bst >= M.bands[zi][0]) bad.push(map + z + ':' + d);
			}
			for (const e of p.events) { for (const d of e.dex) seen.add(d); if (e.kind === 'roam') roams++; if (e.rare && z === 3) r5zone3++; }
		}
		if (s <= 200) for (let g = 0; g < 10; g++) for (const e of SV.segPlan(s * 7919, map, g, 'normal')) for (const d of e.dex) seen.add(d);
		if (s <= 200) for (let n = 1; n <= 9; n++) seen.add(SV.milestone(n, map, s * 7919).dex);
	}
	for (const L of Object.values(SV.K.LEGENDS)) for (const d of L) seen.add(d);
	seen.add(SV.K.MEWTWO);
	const missing = ALL.filter(d => !seen.has(d));
	A(!missing.length, `Expedition: the union of the plans over ${SEEDS} seeds x 3 maps x 4 zones (+ Survival's segments and milestones) covers all 1,025 species`, JSON.stringify({ missing: missing.slice(0, 40), n: missing.length }));
	A(!bad.length && wanderSeen.size > 200, `the wanderers are off the map's types (or below zone 1's band, e.g. Wishiwashi): ${wanderSeen.size} species`, bad.slice(0, 10).join());
	A(wanderSeen.has(746) && G.DEX.filter(p => !p.leg && p.rarity >= 5).every(p => seen.has(p.dex)) && G.DEX.filter(p => p.leg).every(p => seen.has(p.dex)) && r5zone3 === SEEDS * 3 && roams > SEEDS,
		'Wishiwashi wanders zone 1; every rarity-5 species is a zone-3 elite (one pack a zone-3 plan), every legendary roams somewhere (' + roams + ' roams)', JSON.stringify({ r5zone3, roams }));
	// the map keeps its identity: per zone, WANDER_N wanderers vs the cards, and only K.WANDER of the trickle
	A(C.K.WANDER > 0 && C.K.WANDER <= 0.15 && wanderN / (SEEDS * 9) === C.K.WANDER_N, `a minority: ${C.K.WANDER_N} wanderers a zone, ${Math.round(C.K.WANDER * 100)} % of the trickle (the zone's cards: ${(cardsN / SEEDS / 12).toFixed(1)} a zone)`);
	// the D3 plan is unchanged: cards, guardian, the timeline's D3 events in order (D20's are extra, from their own stream)
	const p = C.plan(12345, 'viridian', 2, 'normal');
	const d3 = p.events.filter(e => e.kind !== 'roam' && !e.rare);
	A(p.cards.length >= 10 && d3.length >= 13 && d3.every((e, i) => i === 0 || e.at >= d3[i - 1].at) && JSON.stringify(C.plan(12345, 'viridian', 2, 'normal')) === JSON.stringify(p),
		'a plan is still pure (same seed, same plan) and its D3 timeline keeps its order', JSON.stringify(p.events.map(e => e.kind)));
}

// ======================== 1. base: every species a base enemy; Wishiwashi
if (EN) {
	const cand = new Set();
	for (const tier of EN.TIERS) for (const p of EN.candidates(tier)) cand.add(p.dex);
	const boss = new Set(G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex] && (p.bst >= 580 || EN.BOSS_SLOTS.some(s => p.bst >= s.bst[0] && p.bst <= s.bst[1]))).map(p => p.dex));
	const legs = new Set(G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]).map(p => p.dex));   // (the rift, the judgment, the tower: G.DEX.filter(p => p.leg ...))
	const missing = ALL.filter(d => !cand.has(d) && !boss.has(d) && !legs.has(d));
	A(!missing.length, 'base: every species is an enemy somewhere (a tier\'s candidates, a boss slot, the legendaries of the rift / judgment / tower)', JSON.stringify(missing));
	A(EN.candidates(EN.TIERS[0]).some(p => p.dex === 746), 'base: Wishiwashi (#746, BST 175) is a first-tier candidate (it was below the lowest tier, 180: it never spawned)');
	// (a "fan" enemy: the first tier's cast takes plain ones only, so it comes in the first tier's Water hordes, events.js, as the
	//  other low-BST fans do)
	let rolls = 0, inHorde = 0;
	const r0 = Math.random; let a = 99;
	ctx.Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	for (; rolls < 2000; rolls++) if (EN.hordeDefs('water', 0).some(d => d.dex === 746)) inHorde++;
	ctx.Math.random = r0;
	A(EN.hordeTypes(0).includes('water') && inHorde > 20, `base: Wishiwashi joins the first tier's Water hordes (${inHorde} of ${rolls})`);
}

// ======================== 2. FIRE (the browser)
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
		localStorage.setItem('micasurvivor_dev', 'dall20');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify({
			v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500, owned: { 1: { at: 1, from: 'starter' } }, shiny: {}, partner: 1, partnerShiny: false, starter: 1,
			personality: { trait: 'brave', scores: {} }, upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
			evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {} }));
	} catch (e) { /* */ }
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = function () {}; pl.gainXp = () => 0; return pl; };
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.closePick(true); return; }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
	};
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { H.unblock(); G.Game.debugStep(1, dt); } };
	H.spawned = [];
	H.log = () => { if (H.logging) return; H.logging = true; const add = G.EnemyMgr.add.bind(G.EnemyMgr); G.EnemyMgr.add = function (e) { if (e && !e.remote) H.spawned.push({ dex: e.dex, xk: e.xk || null, id: e.id }); return add(e); }; };
	H.cull = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.dead && !e.xk) { e.dead = true; e.fade = 0; } };
};
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
	await waitFor(() => visible('scr-menu'), 15000);
	const E = async (fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };
	await E(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });

	// the trickle: wanderers as a minority share
	const w = await E(async () => {
		const H = window.__t, ok = await G.Flow.play('exp-classic');
		H.freeze(); H.sturdy(); H.log();
		const R = G.ExpClassic.run, wander = R.plan.wander.slice(), cards = R.plan.cards.slice();
		R.plan.events = R.plan.events.filter(e => e.at > 1e9);   // (the trickle alone)
		for (let i = 0; i < 300 * 15; i++) { H.step(1, 1 / 15); if (i % 15 === 0) H.cull(); }
		const tr = H.spawned.filter(s => !s.xk), nW = tr.filter(s => wander.includes(s.dex) && !cards.includes(s.dex)).length;
		return { ok, dv: G.Modes.run.dv, n: tr.length, nW, wander, share: tr.length ? nW / tr.length : 0, kinds: [...new Set(tr.map(s => s.dex))].length };
	});
	A(w.ok && w.dv === 19 && w.n > 100 && w.nW > 0 && w.share < 0.25 && w.wander.length === 6, `a Classic zone's trickle (300 s): ${w.nW} of ${w.n} spawns are its 6 wanderers (${Math.round((w.share || 0) * 100)} %: a minority), dv 19`, JSON.stringify(w));
	// a roaming legendary: a special, and it leaves after its time
	const r = await E(() => {
		const H = window.__t, C = G.ExpClassic, R = C.run, n0 = H.spawned.length;
		C.fireEvent({ at: 0, kind: 'roam', n: 1, dex: [243], seed: 7 }, [G.Game.player]);
		const s = H.spawned.slice(n0).find(x => x.xk === 'roam'), e = s && G.EnemyMgr.get(s.id);
		const banner = (G.Spawner.banner() || {}).text, x = C.xblockC();
		const born = { dex: e && e.dex, scale: e && e.scale, hp: e && e.maxHp, k: x && x.k };
		H.step(30 * (C.K.ROAM.life + 2));
		return { born, banner, gone: !G.EnemyMgr.get(s && s.id) || G.EnemyMgr.get(s.id).dead, left: (G.Spawner.banner() || {}).text };
	});
	A(r.born && r.born.dex === 243 && r.born.scale === 1.4 && /A legendary Raikou roams the zone!/.test(r.banner || '') && r.born.k && r.born.k.includes(7) && r.gone,
		'a roaming legendary (Raikou): "A legendary Raikou roams the zone!", a special in the `c` block (code 7), gone after ' + 'its time', JSON.stringify(r));
	// zone 3's rarity-5 elites, from the plan
	const e3 = await E(() => {
		const H = window.__t, C = G.ExpClassic, seed = G.World.seed | 0, p3 = C.plan(seed, 'viridian', 3, 'normal'), ev = p3.events.find(e => e.rare);
		const n0 = H.spawned.length;
		C.fireEvent(ev, [G.Game.player]);
		const s = H.spawned.slice(n0).filter(x => x.xk === 'elite').map(x => x.dex);
		const r5 = C.rare5();
		G.Game.quit();
		return { ev: ev && ev.dex, s, ok: s.length > 0 && s.every(d => r5.includes(d)) };
	});
	A(e3.ok && e3.s.length >= 2, 'zone 3\'s rarity-5 elite pack spawns (' + (e3.s || []).map(d => '#' + d).join(', ') + ')', JSON.stringify(e3));
	// base: a Water horde with Wishiwashi spawns it
	const b = await E(async () => {
		const H = window.__t, wait = ms => new Promise(r => setTimeout(r, ms));
		H.thaw(); await wait(300);
		if (G.UI.isOpen('scr-over')) G.UI.show('scr-menu', true);
		G.Flow.goMenu(); await wait(200);
		const ok = await G.Flow.play('normal');
		H.freeze(); H.sturdy();
		H.log();
		const ht = G.Enemies.hordeTypes;
		G.Enemies.hordeTypes = () => ['water'];   // (the horde's type; its four Pokémon are the game's own draw)
		let tries = 0;
		while (tries++ < 400) { G.Events.debugStart('horde'); const b = G.Events.bag(); if (b && b.some(d => d.dex === 746)) break; }
		G.Enemies.hordeTypes = ht;
		const inHorde = !!(G.Events.bag() || []).some(d => d.dex === 746), n0 = H.spawned.length;
		for (let i = 0; i < 40 * 15 && !H.spawned.slice(n0).some(s => s.dex === 746); i++) { H.step(1, 1 / 15); if (i % 15 === 0) H.cull(); }
		const got = H.spawned.slice(n0).filter(s => s.dex === 746).length;
		const mode = G.Game.mode;
		G.Game.quit();
		return { ok, mode, tries, inHorde, got };
	});
	A(b.mode === 'normal' && b.inHorde && b.got > 0, 'base: a Normal run\'s Water horde with Wishiwashi spawns Wishiwashi', JSON.stringify(b));
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
