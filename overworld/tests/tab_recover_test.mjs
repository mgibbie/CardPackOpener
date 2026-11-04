// tab_recover_test.mjs — a tab paused by the one-tab lock recovers.
//
// 2026-10-03, Instinct: their tools briefly opened a second overworld page,
// which paused the main one (#648's one-tab lock). When that page closed, the
// main one stayed paused, and pressing Z at the notice did nothing, so a
// queued save repair could not be applied.
//   1. the newer tab closes -> the tab it paused takes over by itself
//   2. the ACTIVE tab merely reloads -> the paused tab stays paused (no ping-pong)
//   3. Z at the paused notice takes over (the other tab pauses)
//
//   node overworld/tests/tab_recover_test.mjs
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
const PORT = 9220;
const STATE = { username: 'tabrec', friendCode: 'TABR01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 9, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 30, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, maxHP: 30, curHP: 30, exp: 600, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 }];
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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const seed = async p => p.evaluateOnNewDocument((st, party) => {
		if (localStorage.getItem('magepunk_party_v1')) return;
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const open = async () => {
		const p = await ctx.newPage(); await seed(p);
		await p.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 200 && !(await p.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100);
		await sleep(600);
		await p.evaluate(() => { window.__mark = 1; });   // gone after a reload
		return p;
	};
	const paused = p => p.evaluate(() => !!document.getElementById('tab-paused')).catch(() => null);
	const reloaded = p => p.evaluate(() => window.__mark !== 1).catch(() => null);
	const waitBoot = async p => { for (let i = 0; i < 200 && !(await p.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100); await sleep(500); };

	// ===== 1. the newer tab closes -> the paused one takes over =====
	let a = await open();
	let b = await open();
	await sleep(400);
	A(await paused(a) === true && await paused(b) === false, 'setup: opening a second tab pauses the first');
	await b.close();
	for (let i = 0; i < 60 && !(await reloaded(a)); i++) await sleep(100);
	await waitBoot(a);
	A(await reloaded(a) === true && await paused(a) === false, '1. when the newer tab closes, the paused tab reloads and plays (no manual step)');

	// ===== 2. the ACTIVE tab reloads -> the paused one stays paused =====
	b = await open();
	await sleep(400);
	A(await paused(a) === true, 'setup: a new tab pauses it again');
	await a.evaluate(() => { window.__mark = 1; });
	await b.reload({ waitUntil: 'domcontentloaded' });
	await waitBoot(b);
	await sleep(3500);   // longer than the probe (1.5 s + 0.8 s)
	A(await paused(b) === false && await paused(a) === true && await reloaded(a) === false, '2. the active tab reloading does NOT make the paused tab take over (no ping-pong)', JSON.stringify({ bPaused: await paused(b), aPaused: await paused(a), aReloaded: await reloaded(a) }));

	// ===== 3. Z at the paused notice takes over =====
	await a.bringToFront();
	await a.keyboard.press('z');
	for (let i = 0; i < 60 && !(await reloaded(a)); i++) await sleep(100);
	await waitBoot(a);
	await sleep(400);
	A(await reloaded(a) === true && await paused(a) === false && await paused(b) === true, '3. Z at the notice takes over: this tab plays, the other pauses');
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
