// seafoam_boulder_test.mjs — a STRENGTH boulder shoved into a hole falls through.
//
// 2026-10-07, Instinct's bug report: on Seafoam Islands 1F the boulder pushed
// onto the hole at (21,8) just sat on it. pokefirered's
// HandleBoulderFallThroughHole drops it (MB_FALL_WARP): the boulder leaves this
// floor (its FLAG_HIDE_... set) and the one waiting below is revealed (the flag
// in the object's trainer_type cleared) — the puzzle that stops B3F/B4F's
// currents. The lower floors also drew every boulder whatever its flag said.
//   node overworld/tests/seafoam_boulder_test.mjs
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
const PORT = 9252;
const STATE = { username: 'seafoam', friendCode: 'SEAFO1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'machoke', name: 'MACHOKE', level: 40, gender: 'M', friend: 70, types: ['Fighting'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 90, def: 60, spa: 40, spd: 50, spe: 50 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'strength', name: 'Strength', pp: 15, maxPp: 15 }], sprite: 's67.png', num: 67,
}];
// Route 20's ON_TRANSITION (ResetSeafoamBouldersForB3F) has run: the 1F boulders
// shown, the ones below hidden until something falls to them
const FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true,
	FLAG_HIDE_SEAFOAM_B1F_BOULDER_1: true, FLAG_HIDE_SEAFOAM_B1F_BOULDER_2: true };
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
	await page.evaluateOnNewDocument((st, party, flags) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ KANTO: [1, 2, 3, 4, 5] }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, FLAGS);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.HM_FIELD && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const boulders = () => W(() => window.__ow.items.fieldObjs.filter(o => o.kind === 'boulder').map(o => [o.tx, o.ty]));
	const flag = f => W(f => window.__ow.Story.getFlag(f), f);
	const place = (x, y, facing) => W((x, y, f) => { const P = window.__ow.player; P.setTile(x, y); P.facing = f; }, x, y, facing);
	const walk = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(450); };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SeafoamIslands_1F&x=22&y=13`, { waitUntil: 'domcontentloaded' });
	await boot('SeafoamIslands_1F');
	A(JSON.stringify(await boulders()) === JSON.stringify([[22, 12], [32, 9]]), 'setup: both 1F boulders are in place', JSON.stringify(await boulders()));
	// STRENGTH from beside the first boulder, then line it up under the hole (21,8)
	await place(22, 13, 'up');
	await W(() => window.__ow.HM_FIELD.strength.use());
	for (let i = 0; i < 10 && await W(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(120); }
	await W(() => { const b = window.__ow.items.fieldObjs.find(o => o.kind === 'boulder' && o.tx === 22 && o.ty === 12); b.tx = 21; b.ty = 9; });
	await place(21, 10, 'up');
	await walk('ArrowUp');
	const after = await boulders();
	A(!after.some(([x, y]) => x === 21 && y === 8), 'pushed onto the hole (21,8), the boulder falls through instead of sitting on it', JSON.stringify(after));
	A(after.length === 1, '1F has one boulder left', JSON.stringify(after));
	A(await flag('FLAG_HIDE_SEAFOAM_1F_BOULDER_1') === true, 'the fallen boulder is gone from 1F for good (FLAG_HIDE_SEAFOAM_1F_BOULDER_1 set)');
	A(await flag('FLAG_HIDE_SEAFOAM_B1F_BOULDER_1') === false, 'and B1F\'s boulder is revealed (its trainer_type flag cleared)');

	await W(() => window.__ow.moveToMap('SeafoamIslands_B1F'));
	for (let i = 0; i < 60 && (await W(() => window.__ow.world.current.name)) !== 'SeafoamIslands_B1F'; i++) await sleep(100);
	await sleep(900);
	const below = await boulders();
	A(JSON.stringify(below) === JSON.stringify([[22, 8]]), 'B1F shows the boulder that fell (22,8) and not the one still hidden (30,8)', JSON.stringify(below));
	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
