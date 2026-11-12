// pokemon_tower_ghost_gate_test.mjs — POKeMON TOWER 6F: the MAROWAK ghost cannot be walked round.
//
// Tester report (remytest, 2026-11-11, bug:1794459459865): without the SILPH SCOPE the ghost turns you back, as it
// should ("Be gone... Intruders..."), but stepping from the trigger at (12,16) straight onto the stairs at (11,16) went
// up to 7F all the same, and MR. FUJI was rescued with the ghost never laid to rest.
//   1. no SILPH SCOPE: both trigger tiles show the ghost's words, start no battle and turn you back
//   2. the walk-round: every way onto the stairs is tried with real keys (down from above, left from the side, and
//      keys held and mashed through the ghost's words): you never reach 7F while the ghost is there
//   3. the ghost laid to rest (the scene var the win sets): the stairs take you up to 7F
//
//   node overworld/tests/pokemon_tower_ghost_gate_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9438;
const STATE = { username: 'towerg', friendCode: 'TOWERG', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 70, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 220, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 220, curHP: 220,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
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
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const pos = () => W(() => ({ map: window.__ow.world.current && window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, cut: !!window.__ow.cutscene.blocking, dlg: !!window.__ow.dialog.blocking }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const settle = async (ms = 8000) => { const t0 = Date.now(); let p; while (Date.now() - t0 < ms) { p = await pos(); if (p.dlg) await page.keyboard.press('z'); else if (!p.cut) { await sleep(400); p = await pos(); if (!p.cut && !p.dlg) return p; } await sleep(120); } return pos(); };
	const waitMap = async (m, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await pos()).map === m) return true; await sleep(100); } return false; };
	const walk = async (k, ms = 260) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(450); };

	const at = async (x, y, facing = 'down') => { await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, facing); await sleep(150); };
	const scene = () => W(() => window.__ow.Story.getVar('VAR_MAP_SCENE_POKEMON_TOWER_6F'));
	const mash = async (keys, ms) => { const t0 = Date.now(); let i = 0; while (Date.now() - t0 < ms) { const k = keys[i++ % keys.length]; await page.keyboard.down(k); await sleep(70); await page.keyboard.up(k); await sleep(25); } };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PokemonTower_6F&x=12&y=14`, { waitUntil: 'domcontentloaded' });
	await boot('PokemonTower_6F');
	const start = await W(() => ({ scope: window.__ow.Bag ? window.__ow.Bag.count('silphscope') : 0, scene: window.__ow.Story.getVar('VAR_MAP_SCENE_POKEMON_TOWER_6F') }));
	A(start.scope === 0 && !start.scene, '0. no SILPH SCOPE, and the ghost has not been laid to rest', JSON.stringify(start));

	// 1. each trigger: the words, no battle, turned back
	for (const [fx, fy, key, tx, ty] of [[12, 15, 'ArrowDown', 12, 16], [11, 14, 'ArrowDown', 11, 15]]) {
		await at(fx, fy, 'down');
		await walk(key);
		const said = await W(() => !!window.__ow.dialog.blocking || !!window.__ow.cutscene.blocking);
		const p = await settle(6000);
		const fought = await W(() => !!(window.__ow.battle && window.__ow.battle.active));
		A(said && !fought && p.map === 'PokemonTower_6F' && !(p.x === tx && p.y === ty) && !(p.x === 11 && p.y === 16), `1. the trigger at (${tx},${ty}): the ghost's words, no battle, and you are turned back`, JSON.stringify(p));
	}

	// 2. the walk-round
	const tries = [
		['down onto the stairs from the trigger above, keys mashed through the words', async () => { await at(11, 14, 'down'); await mash(['ArrowDown', 'z'], 4500); }],
		['left onto the stairs from the trigger beside, keys mashed through the words', async () => { await at(12, 15, 'down'); await walk('ArrowDown'); await mash(['ArrowLeft', 'z'], 4500); }],
		['left held through the words', async () => { await at(12, 15, 'down'); await walk('ArrowDown'); await page.keyboard.down('ArrowLeft'); await mash(['z'], 3500); await page.keyboard.up('ArrowLeft'); }],
		['down held through the words', async () => { await at(11, 14, 'down'); await page.keyboard.down('ArrowDown'); await mash(['z'], 3500); await page.keyboard.up('ArrowDown'); }],
		['set down on the trigger beside the stairs, then left', async () => { await at(12, 16, 'left'); await mash(['ArrowLeft', 'z'], 3000); }],
		['set down on the trigger above the stairs, then down', async () => { await at(11, 15, 'down'); await mash(['ArrowDown', 'z'], 3000); }],
	];
	for (const [what, go] of tries) {
		await go();
		const p = await settle(6000);
		const m = (await pos()).map;
		A(m === 'PokemonTower_6F' && !(await scene()), `2. ${what}: still on 6F, the ghost still there`, JSON.stringify(p));
		if (m !== 'PokemonTower_6F') { await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PokemonTower_6F&x=12&y=14`, { waitUntil: 'domcontentloaded' }); await boot('PokemonTower_6F'); }
	}

	// 3. the ghost laid to rest: the stairs work
	await W(() => window.__ow.Story.setVar('VAR_MAP_SCENE_POKEMON_TOWER_6F', 1));
	await at(11, 15, 'down');
	await walk('ArrowDown');
	A(await waitMap('PokemonTower_7F', 12000), '3. with the ghost laid to rest, the stairs take you up to 7F', JSON.stringify(await pos()));
	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
