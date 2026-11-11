// ig1111_league_gate_stale_build_test.mjs — two overworld reports from instinctgauntlet
// (2026-11-11), played on their own save (fixtures/instinctgauntlet_1111_ow.json, read
// from D1 ow:instinctgauntlet) with real keys and a fresh page load.
//
// A. bug:1794357919392 — the Route 22 officer refused a player holding all 8 KANTO
//    badges ("Only trainers with all 8 KANTO badges may pass"). The guard waits on the
//    shared gym tier (gym 8 cleared in EVERY region: Hoenn was 7) — the cross-region
//    lockstep is the design — but his line named only Kanto's badges. Now, when his own
//    region is there and another lags, he says what is really required and where.
//    The 8th badge's toast no longer promises the League either.
// B. bug:1794355764652 — "the Rayquaza awakening still doesn't fire" after #1049. The
//    fix was live (deployed 23:42Z) but the tester's tab predated it: two RAYQUAZA and
//    no awakening are the OLD code's summit. On a fresh load their save wakes RAYQUAZA
//    at (14,9). A tab older than the live deploy is now told to reload (build_watch.js).
//
//   node overworld/tests/ig1111_league_gate_stale_build_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9794;
const STATE = { username: 'instinctgauntlet', friendCode: 'IG1111', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const SAVE = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/instinctgauntlet_1111_ow.json'), 'utf8'));
delete SAVE._note;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the real site's code headers: an ETag per file (Pages: a content hash). `bumped`
// files answer a new ETag, as after a deploy that changed them.
const bumped = new Set();
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const ext = path.extname(u);
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[ext] || 'application/octet-stream';
		const h = { 'content-type': t };
		if (ext === '.js') h.etag = '"' + crypto.createHash('md5').update(d).digest('hex') + (bumped.has(u) ? '-new' : '') + '"';
		res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
const waitMapLoaded = async (page, map) => {
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m && !window.__ow.loading), map).catch(() => false)); i++) await sleep(100);
	await sleep(900);
};
// the tester's save, as stored, then a fresh load at (map, x, y)
async function boot(map, x, y, region, patch = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((save, st, region, patch) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		for (const [k, v] of Object.entries({ ...save, ...patch })) localStorage.setItem(k, v);
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_repel_v1', '99999');
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, SAVE, STATE, region, patch);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	await waitMapLoaded(page, map);
	await settle(page);
	return { page, ctx, errors };
}
const settle = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 20000) {
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && !O.battle.blocking && f.alpha < 0.001 && f.target < 0.001 && !O.player.moving && !O.loading) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, facing: window.__ow.player.facing }));
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
// one real step (or a turn / bump): hold the key until the tile or facing changes
async function step(page, dir, { keepDialog = false } = {}) {
	const before = await pos(page);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		const p = await pos(page);
		if (p.x !== before.x || p.y !== before.y || p.map !== before.map) break;
		if (await page.evaluate(() => window.__ow.dialog.blocking)) break;
		if (i > 4 && p.facing === dir) break;
		await sleep(15);
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 60 && await page.evaluate(() => window.__ow.player.moving || !!window.__ow.loading); i++) await sleep(20);
	await sleep(80);
	return keepDialog ? null : settle(page);
}
// the open dialog's text, its pages and lines joined (the box wraps it)
const dialogText = page => page.evaluate(() => { const p = window.__ow.dialog.pages; return p ? p.flat(Infinity).join(' ') : ''; });
async function walkTo(page, tx, ty) {
	for (let guard = 0; guard < 60; guard++) {
		const p = await pos(page);
		if (p.x === tx && p.y === ty) return 'idle';
		const dir = await page.evaluate((tx, ty) => {
			const O = window.__ow, P = O.player, W = O.world;
			const ok = (x, y) => (x === tx && y === ty) || (W.isPassable(x, y) && !O.npcs.npcBlocks?.(x, y, P.elev) && !O.legendariesHere().some(e => e.x === x && e.y === y));
			const D = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
			const seen = new Map([[P.tx + ',' + P.ty, null]]); const q = [[P.tx, P.ty]];
			while (q.length) {
				const [x, y] = q.shift();
				if (x === tx && y === ty) break;
				for (const [d, dx, dy] of D) { const k = (x + dx) + ',' + (y + dy); if (seen.has(k) || !ok(x + dx, y + dy)) continue; seen.set(k, [x, y, d]); q.push([x + dx, y + dy]); }
			}
			let k = tx + ',' + ty; if (!seen.has(k)) return null;
			let first = null;
			while (seen.get(k)) { const [px, py, d] = seen.get(k); first = d; k = px + ',' + py; }
			return first;
		}, tx, ty);
		if (!dir) return 'nopath';
		const r = await step(page, dir);
		if (r !== 'idle') return r;
	}
	return 'guard';
}
const summit = page => page.evaluate(() => {
	const O = window.__ow, st = JSON.parse(localStorage.getItem('magepunk_story') || '{}');
	const npcs = O.npcs.list.filter(n => !n.hidden && /RAYQUAZA/.test(n.ev?.graphics_id || '')).map(n => `${n.ev.graphics_id}@${n.tx},${n.ty}`);
	const legends = O.legendariesHere().filter(e => e.species === 'rayquaza').map(e => `rayquaza@${e.x},${e.y}`);
	return { npcs, legends, count: npcs.length + legends.length, v: st.vars || {} };
});
const view = s => JSON.stringify({ npcs: s.npcs, legends: s.legends, city: s.v.VAR_SOOTOPOLIS_CITY_STATE, pillar: s.v.VAR_SKY_PILLAR_STATE, cry: s.v.VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE });
const badges = st => JSON.parse(st).badges;

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const b = badges(SAVE.magepunk_badges_v1);
	A(Object.keys(b.KANTO).length === 8 && Object.keys(b.JOHTO).length === 8 && Object.keys(b.HOENN).length === 7, 'the fixture is the tester\'s: Kanto 8, Johto 8, Hoenn 7');

	// ===== A. the Route 22 League officer =====
	{
		const { page, ctx, errors } = await boot('Route22', 8, 8, 'kanto');
		A((await step(page, 'up')) === 'idle' && JSON.stringify(await pos(page)) === JSON.stringify({ map: 'Route22', x: 8, y: 7, facing: 'up' }), 'A. walked up to (8,7), facing the officer', JSON.stringify(await pos(page)));
		A(await page.evaluate(() => window.__ow.blockers.blocks(8, 6) && window.__ow.blockers.blocks(9, 6)), 'A. the gate still holds at world tier 7 (the cross-region lockstep is the design)');
		await page.keyboard.press('z');
		await sleep(250);
		let t = await dialogText(page);
		A(/You hold all 8 KANTO badges/.test(t) && /EVERY region has cleared GYM 8/.test(t) && /SOOTOPOLIS/.test(t), 'A. Z at the officer: he says what is really required, and where (Sootopolis)', t);
		A(!/Only trainers with all 8 KANTO badges may pass/.test(t), 'A. ...not the line the tester\'s 8 Kanto badges already satisfy', t);
		A(/^OFFICER: You hold/.test(t), 'A. ...in the officer\'s own voice', t);
		await settle(page);
		await step(page, 'up', { keepDialog: true });
		t = await dialogText(page);
		A(/EVERY region has cleared GYM 8/.test(t) && (await pos(page)).y === 7, 'A. walking into him: the same line, and the way stays shut', t);
		await settle(page);
		// a player short of KANTO's own 8 hears the guard's own line, as before
		await page.evaluate(() => { const B = JSON.parse(localStorage.getItem('magepunk_badges_v1')); delete B.badges.KANTO.earth; localStorage.setItem('magepunk_badges_v1', JSON.stringify(B)); window.__ow.Badges._reset(); window.__ow.blockers.loadForMap(); });
		await page.keyboard.press('z'); await sleep(250);
		t = await dialogText(page);
		A(/Only trainers with all 8 KANTO badges may pass/.test(t), 'A. Kanto 7: the officer\'s own line (it is true)', t);
		await settle(page);
		A(!errors.length, 'A. no page errors', errors.join(' | '));
		await ctx.close();
	}
	// the guard steps aside once gym 8 is cleared everywhere (Hoenn's RAIN badge)
	{
		const B = badges(SAVE.magepunk_badges_v1); B.HOENN.rain = true;
		const { page, ctx } = await boot('Route22', 8, 7, 'kanto', { magepunk_badges_v1: JSON.stringify({ badges: B, champion: {} }) });
		A(await page.evaluate(() => !window.__ow.blockers.blocks(8, 6)), 'A. Hoenn 8 too (tier 8): the officer is gone');
		await ctx.close();
	}
	// every tier guard, every region: the "you hold them, others lag" line only when it is true
	{
		const { page, ctx } = await boot('Route22', 8, 8, 'kanto');
		const rows = await page.evaluate(async () => {
			const Bl = await import('/overworld/blockers.js');
			const out = [];
			for (const [map, list] of Object.entries(Bl.BLOCKERS)) for (const b of list) out.push({ map, id: b.id, region: Bl.blockerRegion(b), tier: JSON.stringify(b.cond).includes('"badge"'), said: Bl.refusal(b), msg: b.msg });
			return out;
		});
		A(rows.every(r => r.region), 'every blocker belongs to a region by its table (k_/j_/h_)', JSON.stringify(rows.filter(r => !r.region).map(r => r.id)));
		// the tester: Kanto 8, Johto 8, Hoenn 7 (tier 7)
		const k = rows.find(r => r.id === 'k_league'), j = rows.find(r => r.id === 'j_league'), h = rows.find(r => r.id === 'h_league');
		A(/You hold all 8 KANTO badges/.test(k.said), 'audit: the Kanto League guard (Route 22) explains the tier', k.said);
		A(/You hold all 8 JOHTO badges/.test(j.said) && /SOOTOPOLIS/.test(j.said), 'audit: the Johto League guard (Route 26) too', j.said);
		A(h.said === h.msg, 'audit: Hoenn\'s League guard keeps its own line (the tester lacks Hoenn\'s 8th: it is true)', h.said);
		A(rows.filter(r => !r.tier).every(r => r.said === r.msg), 'audit: item / flag guards are untouched');
		A(rows.filter(r => r.tier && /^h_/.test(r.id)).every(r => r.said === r.msg || /HOENN/.test(r.said)), 'audit: no guard names another region\'s badges as its own');
		await ctx.close();
	}

	// ===== B. Sky Pillar on a fresh load, then a tab older than the live deploy =====
	{
		const { page, ctx, errors } = await boot('SkyPillar_Top', 16, 13, 'hoenn');
		let s = await summit(page);
		A(s.count === 1 && /GFX_RAYQUAZA@14,7/.test(s.npcs[0] || '') && s.v.VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE === 0,
			'B. the tester\'s save on a fresh load: ONE (sleeping) Rayquaza, the cry scene armed (it recovers by itself)', view(s));
		const r = await walkTo(page, 14, 9);
		s = await summit(page);
		A(r === 'idle' && s.count === 0 && s.v.VAR_SOOTOPOLIS_CITY_STATE === 5 && s.v.VAR_SKY_PILLAR_STATE === 1,
			'B. walking (14,9) with real keys: RAYQUAZA wakes and flies to Sootopolis (city 5, pillar 1)', r + ' ' + view(s));

		const st = await page.evaluate(async () => { const W = window.__ow.buildWatch; if (!W) return null; await W.check(); return { ...W.state }; });
		A(st && st.watched > 50, 'B. the page watches the overworld modules it loaded', JSON.stringify(st));
		A(st && !st.stale && !(await page.evaluate(() => window.__ow.dialog.blocking)), 'B. same deploy: nothing said');
		bumped.add('/overworld/awakening_sync.js');
		const st2 = await page.evaluate(async () => { const W = window.__ow.buildWatch; if (!W) return null; await W.check(); return { ...W.state }; });
		await sleep(300);
		const t = await dialogText(page);
		A(st2 && st2.stale && st2.changed.some(u => /awakening_sync\.js$/.test(u)), 'B. a newer deploy of a module this tab runs is seen', JSON.stringify(st2));
		A(/NEWER VERSION of the game is live/.test(t) && /Reload the page/.test(t), 'B. ...and the player is told to reload', t);
		await settle(page);
		await page.evaluate(async () => { await window.__ow.buildWatch?.check(); });
		await sleep(300);
		A(!(await page.evaluate(() => window.__ow.dialog.blocking)), 'B. told once, not on every check');
		bumped.clear();
		A(!errors.length, 'B. no page errors', errors.join(' | '));
		await ctx.close();
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
