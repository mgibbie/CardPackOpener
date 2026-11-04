// friendship_tm_test.mjs — Crystal's friendship checks actually check friendship.
//
// 2026-10-03 (Instinct): the Route 27 Sandstorm house woman refused TM37 with a
// friendship-255 lead. pokecrystal runs `special GetFirstPokemonHappiness` then
// `ifgreater 150 - 1, .Loyal`; the transpile dropped the ifgreater (it only kept
// ifequal/ifnotequal after a readvar) and the engine had no such special, so the
// script fell straight into `.Disloyal` for everyone. tools/gen_crystal_
// scriptvar.mjs restores the dropped comparisons (overworld/crystal_scriptvar.js).
//   1. friendship 255: she gives TM37 SANDSTORM and sets EVENT_GOT_TM37_SANDSTORM
//   2. friendship 30: she refuses, nothing given
//   3. the Goldenrod Happiness Rater (same dropped ifgreater ladder) tells a
//      friendship-255 POKeMON it "looks really happy", not that it looks mean
//
//   node overworld/tests/friendship_tm_test.mjs
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
const PORT = 9216;
const STATE = { username: 'friendtm', friendCode: 'FRTM01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const lead = friend => [{
	speciesId: 'pidgeot', name: 'PIDGEOT', level: 46, gender: 'M', friend, types: ['Normal', 'Flying'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 140, atk: 90, def: 85, spa: 80, spd: 80, spe: 110 }, maxHP: 140, curHP: 140,
	exp: 97336, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18,
}];
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
// talk to the NPC at (nx,ny) from the tile below, Z through every page; returns what was said
async function talk(map, nx, ny, friend) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, lead(friend));
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${nx}&y=${ny + 1}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1000);
	await page.evaluate((x, y) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = 'up'; }, nx, ny + 1);
	await page.keyboard.press('z');
	const said = await page.evaluate(async () => {
		const O = window.__ow, out = [];
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			if (d) { out.push(JSON.stringify(O.dialog.pages || '')); press('z'); calm = 0; }
			else if (!c) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return [...new Set(out)].join(' | ');
	});
	const st = await page.evaluate(async () => {
		const E = await import('./events.js');
		return { got: E.getFlag('EVENT_GOT_TM37_SANDSTORM'), bag: localStorage.getItem('magepunk_bag_v1') || '' };
	});
	await ctx.close();
	return { said, ...st, errors };
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// 1. the report: friendship 255
	{
		const r = await talk('Route27SandstormHouse', 2, 4, 255);
		A(r.got === true, '1. friendship 255: EVENT_GOT_TM37_SANDSTORM is set', JSON.stringify({ got: r.got, said: r.said.slice(0, 300) }));
		A(/sandstorm|tm37/i.test(r.bag), '1. ...and TM37 SANDSTORM is in the bag', r.bag.slice(0, 300));
		A(!/come to trust you/i.test(r.said), '1. ...with no "if it doesn\'t come to trust you" refusal', r.said.slice(0, 300));
		A(r.errors.length === 0, '1. no page errors', JSON.stringify(r.errors.slice(0, 3)));
	}
	// 2. friendship 30: refused
	{
		const r = await talk('Route27SandstormHouse', 2, 4, 30);
		A(r.got !== true && !/sandstorm|tm37/i.test(r.bag), '2. friendship 30: no TM, no flag', JSON.stringify({ got: r.got, bag: r.bag.slice(0, 200) }));
		A(/trust/i.test(r.said), '2. ...she says it needs to trust you more', r.said.slice(0, 300));
	}
	// 3. the Happiness Rater's ladder
	{
		const r = await talk('GoldenrodHappinessRater', 2, 4, 255);
		A(/really happy|looks really/i.test(r.said) && !/looks mean/i.test(r.said), '3. the Happiness Rater: friendship 255 "looks really happy", not mean', r.said.slice(0, 400));
		const low = await talk('GoldenrodHappinessRater', 2, 4, 10);
		A(/mean/i.test(low.said), '3. ...and friendship 10 still "looks mean"', low.said.slice(0, 300));
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
