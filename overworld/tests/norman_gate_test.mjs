// norman_gate_test.mjs — Norman battles once you hold the four badges; badge
// flags mean the badges of the game whose map you are on.
//
// 2026-10-02, Instinct's save: VAR_PETALBURG_GYM_STATE stuck at 3 while holding
// Stone, Knuckle, Dynamo and Heat — the state is 2 on meeting Norman and each of
// those four gym scripts adds 1, so badges won before meeting him never counted
// and he kept saying "one badge" forever. The same save showed FLAG_BADGE05_GET
// (Norman's Balance, to Emerald scripts) set although Balance wasn't held: Kanto's
// Soul badge sets the very same flag name (FireRed and Emerald share
// FLAG_BADGE01..08_GET in one story store), and FLAG_BADGE04_GET (Heat) missing.
//   1. Instinct's save shape: in Petalburg Gym, talking to Norman starts his battle
//   2. on a Hoenn map the badge flags follow the Hoenn badges held (04 yes, 05 no);
//      on a Kanto map they follow the Kanto badges (05 = Soul, yes)
//   3. a save that hasn't met Norman (state 0) is left alone
//
//   node overworld/tests/norman_gate_test.mjs
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
const PORT = 9213;
const STATE = { username: 'normangate', friendCode: 'NGATE1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'pidgeot', name: 'PIDGEOT', level: 43, gender: 'M', friend: 70, types: ['Normal', 'Flying'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 130, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 130, curHP: 130,
	exp: 80000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18,
}];
// Instinct's badges (2026-10-02)
const BADGES = { badges: {
	JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true },
	KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true },
	HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, feather: true },
}, champion: {} };
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

let browser;
async function boot(map, x, y, gymState) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, badges, gymState) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		const flags = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true,
			FLAG_BADGE01_GET: true, FLAG_BADGE02_GET: true, FLAG_BADGE03_GET: true, FLAG_BADGE05_GET: true, FLAG_BADGE06_GET: true };
		localStorage.setItem('magepunk_story', JSON.stringify({ flags, vars: { VAR_PETALBURG_GYM_STATE: gymState } }));
	}, STATE, PARTY, BADGES, gymState);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1500);
	return { page, ctx, errors };
}
const flags = page => page.evaluate(async () => { const S = await import('./events.js'); const o = {}; for (let n = 1; n <= 8; n++) o[n] = S.getFlag(`FLAG_BADGE0${n}_GET`); return { o, state: S.getVar('VAR_PETALBURG_GYM_STATE') }; });

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// 1 + 2. Instinct's save in Petalburg Gym
	{
		const { page, ctx, errors } = await boot('PetalburgCity_Gym', 4, 6, 3);
		const f = await flags(page);
		A(f.state === 6, '1. holding Stone/Knuckle/Dynamo/Heat after meeting Norman: the gym state is 6 (ready to battle)', JSON.stringify(f));
		A(f.o[4] === true && f.o[5] === false && f.o[6] === true, '2. on a Hoenn map: Heat (04) held, Balance (05) NOT, Feather (06) held — from the badges, not the shared flag', JSON.stringify(f.o));
		// find Norman wherever his map script put him, stand below him, talk
		const norman = await page.evaluate(() => {
			const all = [...(window.__ow.npcs.list || []), ...(window.__ow.trainers.list || [])];
			const n = all.find(o => /Norman/.test(o.ev?.script || o.script || ''));
			return n ? { x: n.tx ?? n.x, y: n.ty ?? n.y } : null;
		});
		A(!!norman, 'setup: Norman is in his gym', JSON.stringify(norman));
		if (norman) {
			await page.evaluate(n => { const P = window.__ow.player; P.tx = n.x; P.ty = n.y + 1; P.x = P.tx * 16; P.y = P.ty * 16; P.facing = 'up'; }, norman);
			await page.keyboard.press('z');
			let started = false;
			for (let i = 0; i < 150 && !started; i++) {
				started = await page.evaluate(() => !!window.__ow.battle.active);
				if (!started && await page.evaluate(() => !!window.__ow.dialog.blocking)) await page.keyboard.press('z');
				await sleep(100);
			}
			A(started, '1. talking to Norman starts his gym battle', await page.evaluate(() => JSON.stringify(window.__ow.dialog.pages || '').slice(0, 160)));
		}
		A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// 2. a FireRed Kanto map reads the same flag names as KANTO badges
	{
		const { page, ctx } = await boot('PewterCity', 15, 15, 3);
		const f = await flags(page);
		A(f.o[5] === true && f.o[6] === false, '2. on a Kanto map: 05 = Soul (held), 06 = Marsh (not held)', JSON.stringify(f.o));
		await ctx.close();
	}

	// 3. not met yet: left alone
	{
		const { page, ctx } = await boot('PetalburgCity_Gym', 4, 6, 0);
		const f = await flags(page);
		A(f.state === 0, '3. a save that has not met Norman stays at state 0', JSON.stringify(f));
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
