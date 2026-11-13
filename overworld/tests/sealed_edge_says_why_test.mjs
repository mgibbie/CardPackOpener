// sealed_edge_says_why_test.mjs — a map edge the progression gate seals says why.
//
// Tester report (remytest, 2026-11-12, bug:1794522453311, filed as a blocker): walking west off Route 15 towards
// FUCHSIA CITY did nothing. The step was taken back with no word, the game's own gate report said the tile ahead was
// "open, passable, no refusal", and it read as a broken map connection. It is the progression gate: Fuchsia opens at
// gym tier 4 in every region, and the tester was below it. Where a guard stands in the way, the guard says so; this
// edge has none, so nothing did (the one-time portal tutorial aside).
//   1. below the tier: the step off Route 15's west edge is taken back AND the reason is shown, naming the gym tier
//   2. the gate report for that step says "sealed", not "open"
//   3. holding the key into the edge does not repeat the line every step
//   4. at the tier: the same step crosses into Fuchsia City
//   5. an edge with nothing beyond it reads as a map edge in the report
//
//   node overworld/tests/sealed_edge_says_why_test.mjs
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
const PORT = 9446;
const STATE = { username: 'sealedge', friendCode: 'SEDGE1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
// Instinct's badges: 5 in each shared region (Johto 6 makes no difference — the
// tier is the minimum across regions)
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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const open = async (map, x, y, badges) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, badges) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');   // a KANTO starter, walking in Johto (Instinct)
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, badges);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		const W = f => page.evaluate(f);
		const api = {
			page, ctx, errors,
			pos: () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty })),
			place: (x, y, f) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f),
			said: () => W(() => JSON.stringify(window.__ow.dialog.blocking ? window.__ow.dialog.pages : '')),
			closeDialog: async () => { for (let i = 0; i < 10 && await W(() => !!window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(120); } },
			walk: async (k, ms = 260) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(500); },
		};
		return api;
	};
	const T3 = { badges: { JOHTO: { zephyr: true, hive: true, plain: true }, KANTO: { boulder: true, cascade: true, thunder: true }, HOENN: { stone: true, knuckle: true, dynamo: true } }, champion: {} };
	const T4 = { badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true }, KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true }, HOENN: { stone: true, knuckle: true, dynamo: true, heat: true } }, champion: {} };

	// ---- below the tier
	{
		const d = await open('Route15', 1, 11, T3);
		await d.page.evaluate(() => window.__ow.Story.setFlag('tut_portal_seen'));   // (the one-time tutorial is not the subject)
		await d.place(0, 11, 'left');
		const rep = await d.page.evaluate(() => window.__ow.gateReport().ahead);
		A(rep && /^sealed: /.test(rep.refusal || '') && rep.passable === false && rep.edge === 'FuchsiaCity', '2. the gate report for the step off the edge says it is sealed (it said "open, passable")', JSON.stringify(rep));
		await d.walk('ArrowLeft');
		const p = await d.pos(), said = await d.said();
		A(p.map === 'Route15' && p.x === 0 && p.y === 11, '1. below the tier the step west off Route 15 is taken back (you stay on its edge)', JSON.stringify(p));
		A(/sealed/i.test(said) && /GYM 4/.test(said), '1. ...and the reason is shown: the way is sealed until GYM 4 is cleared in the regions behind', said);
		await d.closeDialog();
		// holding the key: no new line straight away
		await d.walk('ArrowLeft', 700);
		const again = await d.said(), p2 = await d.pos();
		A(again === '""' && p2.x === 0, '3. holding the key into the edge straight after does not bring the line up again at once', again);
		await sleep(2600);
		await d.walk('ArrowLeft');
		A(/sealed/i.test(await d.said()), '3. ...a new try a little later says it again');
		await d.closeDialog();
		// an edge with nothing beyond
		const none = await d.page.evaluate(() => { const o = window.__ow, lay = o.world.current.layout, P = o.player; for (let x = 0; x < lay.width; x++) { if (!o.world.connectionAt(x, -1)) { P.tx = x; P.ty = 0; P.facing = 'up'; return o.gateReport().ahead; } } return 'all connected'; });
		A(none === 'all connected' || (none && /map edge/.test(none.refusal || '')), '5. an edge with nothing beyond it reads as a map edge in the report', JSON.stringify(none));
		A(d.errors.length === 0, 'no page errors (below the tier)', d.errors.slice(0, 2).join(' | '));
		await d.ctx.close();
	}
	// ---- at the tier
	{
		const d = await open('Route15', 1, 11, T4);
		await d.place(0, 11, 'left');
		const rep = await d.page.evaluate(() => window.__ow.gateReport().ahead);
		await d.walk('ArrowLeft', 400);
		let p = await d.pos();
		for (let i = 0; i < 40 && p.map !== 'FuchsiaCity'; i++) { await sleep(200); p = await d.pos(); }
		A(p.map === 'FuchsiaCity' && rep && rep.refusal === null && rep.passable === true, '4. at gym tier 4 the same step crosses into FUCHSIA CITY, and the report says the edge is open', JSON.stringify([p, rep]));
		A(!/sealed/i.test(await d.said()), '4. ...with no "sealed" line', await d.said());
		await d.ctx.close();
	}
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
