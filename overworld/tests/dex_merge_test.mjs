// dex_merge_test.mjs — a save sync never shrinks the Pokédex.
//
// 2026-10-01: Instinct reloaded on a device whose local save was at the SAME
// revision as the server's but with a staler dex. The tie-break keeps the local
// copy, so its dex went up whole and 10 seen species vanished from the server
// (Pidgeot, caught only on that device, came along). Seen/caught, the Unown
// letters and milestone claims are sets: whichever copy wins, it now takes the
// union of both.
//   1. same-revision divergence: local kept, dex = union (storage, server, and
//      the in-memory Pokédex)
//   2. server ahead: server adopted, this device's extra catch merged in and
//      pushed — with no "moved on somewhere else" conflict after the reload
//   3. local ahead: local kept, the server's extra seen merged in
//
//   node overworld/tests/dex_merge_test.mjs
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
const PORT = 9202;
const STATE = { username: 'dexmerge', friendCode: 'DEXM1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

let DB = null;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: DB }));
		if (b.action === 'ow-save') { DB = { ow: b.ow, updated_at: Date.now() }; return res.end('{"ok":true}'); }
		if (b.action === 'repair-get') return res.end('{"repair":null}');
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const PARTY = JSON.stringify([{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 40, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, stats: { hp: 120, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }]);
const game = (rev, money, dex, unown) => ({
	magepunk_region: 'KANTO', magepunk_party_v1: PARTY, magepunk_money: String(money), magepunk_ow_rev: String(rev), magepunk_playtime: '5000',
	magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
	magepunk_pos_v1: JSON.stringify({ map: 'PalletTown', x: 10, y: 10, back: null }),
	magepunk_dex_v1: JSON.stringify(dex), ...(unown ? { magepunk_unown_v1: JSON.stringify(unown) } : {}),
});
const sorted = a => [...a].sort().join(',');

let browser;
async function scenario(local, remote) {
	DB = { ow: remote, updated_at: Date.now() };
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, loc) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		for (const [k, v] of Object.entries(loc)) localStorage.setItem(k, v);
	}, STATE, local);
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100);
	await sleep(2500);   // the hydrate push (and any reload) settles
	const out = await page.evaluate(async () => {
		const D = await import('./pokedex.js');
		const ls = JSON.parse(localStorage.getItem('magepunk_dex_v1'));
		return { ls, mem: D.counts(), memPidgeot: D.isCaught('pidgeot'), memGrimer: D.isSeen('grimer'), unown: JSON.parse(localStorage.getItem('magepunk_unown_v1') || '[]'),
			money: localStorage.getItem('magepunk_money'), hud: document.getElementById('hud')?.textContent || '',
			log: JSON.parse(sessionStorage.getItem('magepunk_owsync_log') || '[]').map(e => e.event + ':' + (e.reason || e.action || '')).filter(s => /hydrate\.(decision|dex)/.test(s)) };
	});
	out.errors = errors;
	await ctx.close();
	return out;
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1. same revision, diverged (the Instinct case) =====
	{
		const local = game(500, 111, { seen: ['pidgey', 'pidgeot', 'rattata'], caught: ['pidgey', 'pidgeot'] }, ['A']);
		const remote = game(500, 222, { seen: ['pidgey', 'rattata', 'grimer', 'muk', 'doduo'], caught: ['pidgey'] }, ['A', 'B']);
		const r = await scenario(local, remote);
		const srv = JSON.parse(DB.ow.magepunk_dex_v1);
		A(r.money === '111', '1. same-revision divergence still keeps this device\'s copy', r.money);
		A(sorted(r.ls.seen) === sorted(['pidgey', 'pidgeot', 'rattata', 'grimer', 'muk', 'doduo']) && sorted(r.ls.caught) === sorted(['pidgey', 'pidgeot']), '1. ...but the dex is the union: the server\'s 3 extra seen survive, and Pidgeot stays caught', JSON.stringify(r.ls));
		A(sorted(srv.seen) === sorted(r.ls.seen) && sorted(srv.caught) === sorted(r.ls.caught) && +DB.ow.magepunk_ow_rev > 500, '1. ...and the merged dex is what gets pushed (past rev 500)', JSON.stringify({ srv, rev: DB.ow.magepunk_ow_rev }));
		A(r.mem.seen === 6 && r.memGrimer && r.memPidgeot, '1. the in-memory Pokédex was re-read (it can\'t save its stale self back)', JSON.stringify(r.mem));
		A(sorted(r.unown) === 'A,B' && sorted(JSON.parse(DB.ow.magepunk_unown_v1)) === 'A,B', '1. Unown letters merge too', JSON.stringify(r.unown));
		A(r.errors.length === 0, '1. no page errors', JSON.stringify(r.errors.slice(0, 3)));
	}

	// ===== 2. server ahead; this device caught something the server lacks =====
	{
		const local = game(300, 111, { seen: ['pidgey', 'pidgeot'], caught: ['pidgey', 'pidgeot'] });
		const remote = game(305, 333, { seen: ['pidgey', 'grimer'], caught: ['pidgey'] });
		const r = await scenario(local, remote);
		const srv = JSON.parse(DB.ow.magepunk_dex_v1);
		A(r.money === '333', '2. a newer server save is adopted', r.money);
		A(sorted(r.ls.caught) === 'pidgeot,pidgey' && sorted(r.ls.seen) === 'grimer,pidgeot,pidgey', '2. ...with this device\'s extra catch merged in', JSON.stringify(r.ls));
		A(sorted(srv.caught) === 'pidgeot,pidgey' && +DB.ow.magepunk_ow_rev > 305, '2. ...and pushed up', JSON.stringify({ srv, rev: DB.ow.magepunk_ow_rev }));
		A(r.log.some(s => /dex merged/.test(s)) && !/moved on somewhere else/.test(r.hud) && !r.log.some(s => /differing bodies/.test(s)), '2. no false "moved on somewhere else" conflict after the reload', JSON.stringify({ hud: r.hud, log: r.log }));
		A(r.errors.length === 0, '2. no page errors', JSON.stringify(r.errors.slice(0, 3)));
	}

	// ===== 3. local ahead; the server saw something this device didn't =====
	{
		const local = game(700, 111, { seen: ['pidgey'], caught: ['pidgey'] });
		const remote = game(650, 444, { seen: ['pidgey', 'grimer'], caught: ['pidgey'] });
		const r = await scenario(local, remote);
		const srv = JSON.parse(DB.ow.magepunk_dex_v1);
		A(r.money === '111', '3. a newer local save is kept', r.money);
		A(r.ls.seen.includes('grimer') && srv.seen.includes('grimer'), '3. ...with the server\'s extra seen merged in, locally and on the server', JSON.stringify({ ls: r.ls, srv }));
		A(r.errors.length === 0, '3. no page errors', JSON.stringify(r.errors.slice(0, 3)));
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
