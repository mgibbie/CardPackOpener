// villain_native_sync_test.mjs — a campaign villain win leaves the world as the
// original game's win would.
//
// 2026-10-03, Instinct: winning the campaign Silph Co. battle (quest.js
// VILLAIN_BEATS) pointed the objective at Sabrina, but the Rocket guard still
// blocked Saffron Gym: completeVillainBeat set only its own doneFlag, never the
// native SilphCo_11F_EventScript_BattleGiovanni effects (FLAG_HIDE_SAFFRON_ROCKETS,
// the Silph rockets, the 11F scene). They had to clear Silph again the native way.
//   1. the campaign Silph win sets the native flags + scene, and Saffron's gym
//      guard (46,13) is gone from the map
//   2. another region's beat (Aqua Hideout) applies its native flags too
//   3. the reverse: a native win first counts as the campaign beat done (no
//      second Giovanni), and records its doneFlag
//
//   node overworld/tests/villain_native_sync_test.mjs
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
const PORT = 9221;
const STATE = { username: 'villsync', friendCode: 'VILS01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 46, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 140, atk: 90, def: 80, spa: 75, spd: 75, spe: 110 }, maxHP: 140, curHP: 140, exp: 97000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
const BADGES = { badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true }, HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, balance: true } }, champion: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end('{"ok":true}');
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
async function boot(map, extraFlags = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, badges, extra) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...extra }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, BADGES, extraFlags);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1000);
	return { page, ctx, errors };
}
const flags = (page, list) => page.evaluate(async l => { const S = await import('./events.js'); return Object.fromEntries(l.map(f => [f, !!S.getFlag(f)])); }, list);
const varOf = (page, v) => page.evaluate(async v => (await import('./events.js')).getVar(v), v);
const drive = page => page.evaluate(async () => { const O = window.__ow; const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); for (let i = 0; i < 80 && (O.dialog.blocking || O.cutscene.blocking); i++) { press('z'); await new Promise(r => setTimeout(r, 40)); } });

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1. the campaign Silph win =====
	{
		const { page, ctx, errors } = await boot('SaffronCity');
		const guardBefore = await page.evaluate(() => [...window.__ow.npcs.list, ...window.__ow.trainers.list].some(n => n.tx === 46 && n.ty === 13));
		A(guardBefore, 'setup: before Silph, the Rocket guard stands at Saffron Gym (46,13)');
		await page.evaluate(async () => { const Q = await import('./quest.js'); const S = await import('./ow_story.js'); S.completeVillainBeat('KANTO', Q.VILLAIN_BEATS.KANTO.find(b => b.id === 'silph')); });
		await drive(page);
		const f = await flags(page, ['villain_kanto_silph', 'FLAG_HIDE_SAFFRON_ROCKETS', 'FLAG_HIDE_SILPH_ROCKETS', 'FLAG_HIDE_SAFFRON_CIVILIANS']);
		A(f.villain_kanto_silph && f.FLAG_HIDE_SAFFRON_ROCKETS && f.FLAG_HIDE_SILPH_ROCKETS && !f.FLAG_HIDE_SAFFRON_CIVILIANS, '1. the campaign Silph win sets the native flags (Saffron + Silph rockets hidden, civilians back)', JSON.stringify(f));
		A(+(await varOf(page, 'VAR_MAP_SCENE_SILPH_CO_11F')) === 1, '1. ...and Silph 11F\'s scene', String(await varOf(page, 'VAR_MAP_SCENE_SILPH_CO_11F')));
		await page.evaluate(() => window.__ow.moveToMap('SaffronCity', 46, 15));
		await sleep(1200);
		const guardAfter = await page.evaluate(() => [...window.__ow.npcs.list, ...window.__ow.trainers.list].some(n => n.tx === 46 && n.ty === 13));
		A(!guardAfter, '1. ...so Saffron Gym\'s Rocket guard is gone and Sabrina is reachable');
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 2. another region: the Aqua Hideout =====
	{
		const { page, ctx } = await boot('LilycoveCity');
		await page.evaluate(async () => { const Q = await import('./quest.js'); const S = await import('./ow_story.js'); S.completeVillainBeat('HOENN', Q.VILLAIN_BEATS.HOENN.find(b => b.id === 'aqua_hideout')); });
		await drive(page);
		const f = await flags(page, ['villain_hoenn_hideout', 'FLAG_TEAM_AQUA_ESCAPED_IN_SUBMARINE', 'FLAG_HIDE_LILYCOVE_CITY_AQUA_GRUNTS', 'FLAG_HIDE_AQUA_HIDEOUT_B2F_SUBMARINE_SHADOW']);
		A(Object.values(f).every(Boolean), '2. the campaign Aqua Hideout win applies the native submarine-escape flags', JSON.stringify(f));
		await ctx.close();
	}

	// ===== 3. the reverse: the native win first =====
	{
		const { page, ctx } = await boot('SaffronCity', { FLAG_HIDE_SAFFRON_ROCKETS: true });
		const r = await page.evaluate(async () => { const Q = await import('./quest.js'); const S = await import('./events.js'); return { beat: !!Q.beatAt('KANTO', 'SilphCo_11F'), done: !!S.getFlag('villain_kanto_silph') }; });
		A(!r.beat && r.done, '3. a native Silph win counts: no campaign Giovanni at 11F, and the beat is recorded done', JSON.stringify(r));
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
