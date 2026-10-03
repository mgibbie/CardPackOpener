// defeats_rebase_test.mjs — a trainer win never writes back an older record.
//
// 2026-10-03, Instinct: beating Norman took the save's trainer victories from
// 724 to 629 — exactly the first 628 + Norman. trainers.js read
// magepunk_defeated_v1 ONCE at startup and wrote its whole in-memory set back
// on every win, so when storage changed underneath it (a hydrate that adopted
// the server's newer save while the reload latch held, a second tab), the next
// win overwrote the newer record. Every change now re-reads storage first.
//   1. storage grows under a running game (as a hydrate would), then a win:
//      every stored victory is kept, plus the new one
//   2. a second tab records a win: this tab follows it (storage event) and
//      its own next win keeps both
//   3. a VS Seeker re-arm rebases too: it clears only this map's trainers
//
//   node overworld/tests/defeats_rebase_test.mjs
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
const PORT = 9217;
const STATE = { username: 'defeats', friendCode: 'DEFT01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 42, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 130, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 130, curHP: 130, exp: 74000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
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

// the "old" record the page boots with, and the NEWER one storage gets later
const OLD = Array.from({ length: 5 }, (_, i) => `MAP_OLD:Trainer${i}`);
const NEWER = [...OLD, 'MAP_ROUTE_27:Route27_SPRITE_YOUNGSTER@58,13', 'MAP_PETALBURG_CITY_GYM:PetalburgCity_Gym_EventScript_Randall', 'MAP_ROCKET_HIDEOUT_B4F:LOCALID_HIDEOUT_GIOVANNI'];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, old) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		if (localStorage.getItem('magepunk_defeated_v1')) return;   // the 2nd tab shares this origin's storage
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		localStorage.setItem('magepunk_defeated_v1', JSON.stringify(old));
	}, STATE, PARTY, OLD);
	const boot = async (p, map) => {
		await p.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await p.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === m && window.__ow.trainers.list.length), map).catch(() => false)); i++) await sleep(100);
		await sleep(800);
	};
	await boot(page, 'Route3');
	const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('magepunk_defeated_v1') || '[]'));
	A((await page.evaluate(() => window.__ow.trainers.defeated.size)) === OLD.length, 'setup: the game booted with the old 5-victory record');

	// ===== 1. storage grows underneath (a hydrate that didn't reload), then a win =====
	await page.evaluate(n => localStorage.setItem('magepunk_defeated_v1', JSON.stringify(n)), NEWER);
	const won = await page.evaluate(() => { const T = window.__ow.trainers, t = T.list.find(x => !T.isDefeated(x)); T.markDefeated(t); return T.keyOf(t); });
	let s = await stored(page);
	A(NEWER.every(k => s.includes(k)) && s.includes(won) && s.length === NEWER.length + 1,
		'1. a win after the record grew keeps EVERY stored victory and adds its own (8 + 1)', JSON.stringify({ n: s.length, lost: NEWER.filter(k => !s.includes(k)) }));

	// ===== 2. a second tab wins; this tab follows, and its next win keeps both =====
	const page2 = await ctx.newPage();
	await boot(page2, 'Route3');
	const won2 = await page2.evaluate(() => { const T = window.__ow.trainers, t = T.list.filter(x => !T.isDefeated(x))[0]; T.markDefeated(t); return T.keyOf(t); });
	await sleep(300);
	A(await page.evaluate(k => window.__ow.trainers.defeated.has(k), won2), '2. the first tab sees the second tab\'s win (storage event)');
	const won3 = await page.evaluate(() => { const T = window.__ow.trainers, t = T.list.find(x => !T.isDefeated(x)); T.markDefeated(t); return T.keyOf(t); });
	s = await stored(page);
	A(s.includes(won) && s.includes(won2) && s.includes(won3) && NEWER.every(k => s.includes(k)), '2. ...and its next win keeps the other tab\'s win and everything before', JSON.stringify({ n: s.length }));
	await page2.close();

	// ===== 3. VS Seeker re-arm rebases: only this map's trainers clear =====
	await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('magepunk_defeated_v1')); a.push('MAP_ELSEWHERE:LateWin'); localStorage.setItem('magepunk_defeated_v1', JSON.stringify(a)); });
	const n = await page.evaluate(() => window.__ow.trainers.rearmMap(1));
	s = await stored(page);
	A(n >= 1 && s.includes('MAP_ELSEWHERE:LateWin') && NEWER.every(k => s.includes(k)) && !s.includes(won), '3. a VS Seeker re-arm clears this map\'s wins only, keeping a win stored meanwhile', JSON.stringify({ n, has: s.includes('MAP_ELSEWHERE:LateWin') }));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
