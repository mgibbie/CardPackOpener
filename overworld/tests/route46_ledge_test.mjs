// route46_ledge_test.mjs — Route 46's trainer terraces are reachable by its ledges.
//
// 2026-10-03, Instinct's report: "Route46 ledges block access to the trainer
// terraces" — from the north terrace (7,10), pressing Down bumped the "apparent
// ledge" at (7,11). In Crystal that tile is a plain WALL (pokecrystal Route46.blk
// + johto_collision.asm); the real way down is the HOP_DOWN row at x=12-15, y=10,
// then the HOP_LEFT ledges at (9,12)/(9,13). Crystal ledges are hopped while
// STANDING on them (the engine's stand-on hop) — a reachability model that only
// counts hops INTO a ledge tile finds the terraces sealed, but the game doesn't.
// This drives the real engine along that route, and guards Crystal ledges in
// general: every ledge quadrant pokecrystal defines carries its hop behavior here.
//   1. Route46: north terrace -> down-ledge row -> left ledge -> Erin/Ted's terrace
//   2. ledges are one-way: you can't climb back up
//   3. (7,11) stays a wall, as in Crystal
//   4. another Johto map's down-ledge hops (Route29)
//
//   node overworld/tests/route46_ledge_test.mjs
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
const PORT = 9215;
const STATE = { username: 'route46', friendCode: 'RT4601', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'pidgeot', name: 'PIDGEOT', level: 46, gender: 'M', friend: 70, types: ['Normal', 'Flying'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 140, atk: 90, def: 85, spa: 80, spd: 80, spe: 110 }, maxHP: 140, curHP: 140,
	exp: 90000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18,
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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
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
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const pos = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const place = (x, y) => W((x, y) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.moving = false; }, x, y);
	// one engine step in a direction (the same tryMove the keys drive), then wait for it to land
	const step = async dir => {
		const out = await W(d => { const P = window.__ow.player; P.tryMove(d); return P.moveOutcome; }, dir);
		for (let i = 0; i < 40 && await W(() => window.__ow.player.moving); i++) await sleep(50);
		await sleep(60);
		return out;
	};

	// ===== Route46 =====
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route46&x=12&y=9`, { waitUntil: 'domcontentloaded' });
	await boot('Route46');
	// keep the walk about movement: the terrace trainers would stop us for battles
	await W(() => { window.__ow.trainers.list = []; });

	// 3. the tile Instinct tried is a wall in Crystal too
	await place(7, 10);
	const bump = await step('down');
	A(bump === 'bump' && JSON.stringify(await pos()) === JSON.stringify({ map: 'Route46', x: 7, y: 10 }), '3. (7,11) below the north terrace is a wall (as in pokecrystal), not a ledge', JSON.stringify({ bump, at: await pos() }));

	// 1. the real route: the down-ledge row at x=12..15
	await place(12, 9);
	const onLedge = await step('down');
	A(onLedge === 'step' || onLedge === 'move' || (await pos()).y === 10, '1. step onto the ledge row at (12,10)', JSON.stringify({ onLedge, at: await pos() }));
	const hop1 = await step('down');
	let at = await pos();
	A(hop1 === 'hop' && at.x === 12 && at.y === 12, '1. ...and hop down off it to (12,12)', JSON.stringify({ hop1, at }));
	// 2. one-way
	const back = await step('up');
	A(back === 'bump' && (await pos()).y === 12, '2. the ledge is one-way: Up from (12,12) bumps', JSON.stringify({ back, at: await pos() }));
	// on to the left ledge and the trainers' terrace
	await step('left'); await step('left');
	await step('left');   // onto (9,12), the HOP_LEFT ledge
	const hop2 = await step('left');
	at = await pos();
	A(hop2 === 'hop' && at.x === 7 && at.y === 12, '1. the left ledge at (9,12) hops down to (7,12)', JSON.stringify({ hop2, at }));
	// next to Erin (2,13) and Ted (4,14)
	await step('left'); await step('left'); await step('left'); await step('left');
	at = await pos();
	A(at.x === 3 && at.y === 12, '1. ...onto the terrace beside Picnicker Erin (2,13) and Camper Ted (4,14)', JSON.stringify(at));

	// ===== 4. a down-ledge on another Johto map =====
	await W(async () => { await window.__ow.moveToMap('Route29', 10, 10); });
	await boot('Route29');
	await W(() => { window.__ow.trainers.list = []; window.__ow.npcs.list = []; });
	const spot = await W(() => {
		const w = window.__ow.world, L = w.current.layout;
		for (let y = 1; y < L.height - 2; y++) for (let x = 0; x < L.width; x++)
			if (w.isLedge(x, y, 'down') && w.isPassable(x, y - 1) && w.isPassable(x, y + 2) && !w.isLedge(x, y - 1, 'down')) return { x, y };
		return null;
	});
	A(!!spot, '4. Route29 has a down-ledge', JSON.stringify(spot));
	if (spot) {
		await place(spot.x, spot.y - 1);
		let o = await step('down');
		if (o !== 'hop') o = await step('down');   // Crystal: step onto it, then hop
		at = await pos();
		A(o === 'hop' && at.x === spot.x && at.y > spot.y, `4. Route29's ledge at (${spot.x},${spot.y}) hops down past it`, JSON.stringify({ o, at, spot }));
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
