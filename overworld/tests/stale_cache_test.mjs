// stale_cache_test.mjs — no module writes back a stale cached copy of the save.
//
// 2026-10-03, Instinct: in one session the save lost 96 trainer wins (#647)
// AND the Johto Mineral badge. Modules cache their record when the game starts
// and write the whole cached copy back on the next change; when storage changed
// underneath them — a hydrate that adopted the server's newer save while the
// old one-shot reload latch skipped the reload, or a second tab — the next write
// put the old copy back.
//   a) badges: a badge that landed in storage after boot survives earning another
//   b) collected items: same, for markCollected
//   c) hydrate: a server save AHEAD of this device reloads the page even when the
//      latch is already set; a server that is ahead on EVERY load stops after 2
//      reloads (the loop guard), re-reading in place instead
//   d) two tabs: the older tab pauses (notice + no writes); the newer one plays
//
//   node overworld/tests/stale_cache_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9218;
const STATE = { username: 'stalecache', friendCode: 'STAL01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = JSON.stringify([{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 42, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 130, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 130, curHP: 130, exp: 74000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }]);
const BADGES = (extra = {}) => JSON.stringify({ badges: { JOHTO: { zephyr: true, hive: true, ...extra }, HOENN: { stone: true } }, champion: {} });
const base = (rev, money, badges) => ({
	magepunk_region: 'kanto', magepunk_party_v1: PARTY, magepunk_money: String(money), magepunk_ow_rev: String(rev), magepunk_playtime: '5000',
	magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
	magepunk_pos_v1: JSON.stringify({ map: 'PalletTown', x: 10, y: 10, back: null }), magepunk_badges_v1: badges,
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the mock server: MODE 'none' = no server save; 'ahead' = one save ahead of the
// device; 'always' = a save that is ahead again on every load (the loop case)
let MODE = 'none', loads = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') {
			loads++;
			if (MODE === 'ahead') return res.end(JSON.stringify({ ow: { ow: base(500, 4242, BADGES({ mineral: true })), updated_at: Date.now() } }));
			if (MODE === 'always') return res.end(JSON.stringify({ ow: { ow: base(1000 + loads * 10, 1000 + loads, BADGES({ mineral: true })), updated_at: Date.now() } }));
			return res.end(JSON.stringify({ ow: null }));
		}
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
// a fresh context seeded with a local save at rev 100; `latch` presets the old one-shot latch
async function open(ctx, { latch = false } = {}) {
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, local, latch) => {
		sessionStorage.setItem('navs', String((+sessionStorage.getItem('navs') || 0) + 1));   // counts this tab's loads
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		if (latch) sessionStorage.setItem('mp_ow_hydrated', '1');
		if (localStorage.getItem('magepunk_ow_rev')) return;   // a 2nd tab shares this origin's save
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
	}, STATE, base(100, 500, BADGES()), latch);
	return { page, errors };
}
const boot = async page => {
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100);
	await sleep(1500);
	for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100);   // after any hydrate reload
	await sleep(800);
};

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== a + b: one tab, storage changes underneath =====
	{
		MODE = 'none';
		const ctx = await browser.createBrowserContext();
		const { page, errors } = await open(ctx);
		await boot(page);
		// a) badges
		await page.evaluate(async () => { const B = await import('./badges.js'); B.count('JOHTO'); });   // the cache is warm
		await page.evaluate(() => { const b = JSON.parse(localStorage.getItem('magepunk_badges_v1')); b.badges.JOHTO.mineral = true; localStorage.setItem('magepunk_badges_v1', JSON.stringify(b)); });
		await page.evaluate(async () => { const B = await import('./badges.js'); B.earn('HOENN', 'knuckle'); });
		const bd = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_badges_v1')).badges);
		A(bd.JOHTO.mineral === true && bd.HOENN.knuckle === true, 'a) earning a badge keeps a badge that landed in storage after boot (Mineral survives Knuckle)', JSON.stringify(bd));
		// b) collected items
		await page.evaluate(() => window.__ow.items.markCollected('FLAG_TEST_FIRST'));
		await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('magepunk_collected_v1')); c.push('FLAG_TEST_UNDERNEATH'); localStorage.setItem('magepunk_collected_v1', JSON.stringify(c)); });
		await page.evaluate(() => window.__ow.items.markCollected('FLAG_TEST_SECOND'));
		const col = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_collected_v1')));
		A(['FLAG_TEST_FIRST', 'FLAG_TEST_UNDERNEATH', 'FLAG_TEST_SECOND'].every(k => col.includes(k)), 'b) picking up an item keeps one recorded underneath it', JSON.stringify(col));
		A(errors.length === 0, 'a/b) no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== c: hydrate with the latch already set =====
	{
		MODE = 'ahead'; loads = 0;
		const ctx = await browser.createBrowserContext();
		const { page, errors } = await open(ctx, { latch: true });
		await boot(page);
		const st = await page.evaluate(async () => { const B = await import('./badges.js'); const Bag = await import('./bag.js');
			return { navs: +sessionStorage.getItem('navs'), money: Bag.getMoney(), mineral: B.has('JOHTO', 'mineral'), rev: localStorage.getItem('magepunk_ow_rev') }; });
		A(st.navs >= 2, 'c) a server save ahead of the device reloads the page even with the latch already set', JSON.stringify(st));
		A(st.money === 4242 && st.mineral === true, 'c) ...so what is in memory afterwards is the server\'s save (money, Mineral badge)', JSON.stringify(st));
		A(errors.length === 0, 'c) no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();

		MODE = 'always'; loads = 0;
		const ctx2 = await browser.createBrowserContext();
		const t2 = await open(ctx2);
		await boot(t2.page);
		await sleep(2500);
		const st2 = await t2.page.evaluate(() => ({ navs: +sessionStorage.getItem('navs'), log: JSON.parse(sessionStorage.getItem('magepunk_owsync_log') || '[]').filter(e => /hydrate\.(reload|inplace)/.test(e.event)).map(e => e.event) }));
		A(st2.navs === 3 && st2.log.includes('hydrate.inplace'), 'c) a server that is ahead on EVERY load stops after 2 reloads (3 loads), then re-reads in place', JSON.stringify(st2));
		await ctx2.close();
	}

	// ===== d: two tabs =====
	{
		MODE = 'none';
		const ctx = await browser.createBrowserContext();
		const a = await open(ctx);
		await boot(a.page);
		A(!(await a.page.evaluate(() => !!document.getElementById('tab-paused'))), 'd) one tab alone is never paused');
		const b = await open(ctx);
		await boot(b.page);
		await sleep(400);
		A(await a.page.evaluate(() => /open in another tab/.test(document.getElementById('tab-paused')?.textContent || '')), 'd) opening a second tab pauses the first, with the notice');
		await a.page.evaluate(() => window.__ow.items.markCollected('FLAG_FROM_OLD_TAB'));
		const pushed = await a.page.evaluate(() => window.__ow.pushOwForTest());
		await b.page.evaluate(() => window.__ow.items.markCollected('FLAG_FROM_NEW_TAB'));
		const col = await b.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_collected_v1') || '[]'));
		A(!col.includes('FLAG_FROM_OLD_TAB') && pushed === false, 'd) the paused tab writes nothing (no save, no push)', JSON.stringify({ col, pushed }));
		A(col.includes('FLAG_FROM_NEW_TAB') && !(await b.page.evaluate(() => !!document.getElementById('tab-paused'))), 'd) the newer tab plays and saves normally', JSON.stringify(col));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
