// maplayout_test.mjs — the decomps' `setmaplayoutindex`, restored.
//
// 2026-10-07, Instinct's bug report: Route 131's Sky Pillar entrance (36,6) sat
// on an island no water reached. Route131_EventScript_SetLayout is
// `setmaplayoutindex LAYOUT_ROUTE131_SKY_PILLAR` in pokeemerald; the transpile
// kept only its `return`, so the route always loaded its plain layout. The same
// command switches 21 other labels' maps (Sky Pillar's clean floors, Shoal Cave's
// tides, Seafoam's stopped currents, Mirage Island).
//   1. data: tools/gen_maplayout.mjs restored every one, and each layout exists
//   2. the real game: Route 131 loads the Sky Pillar layout and the sea reaches
//      the entrance; Sky Pillar 1F is clean before Rayquaza wakes, cracked after
//
//   node overworld/tests/maplayout_test.mjs
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
const PORT = 9250;
const STATE = { username: 'maplayout', friendCode: 'MLAY01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'wailmer', name: 'LEAD', level: 50, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 150, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 150, curHP: 150,
	exp: 125000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], sprite: 's320.png', num: 320,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. data =====
let overlay = null;
try { overlay = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'maplayout_data.json'), 'utf8')); } catch (e) {}
{
	const ops = [];
	for (const labels of Object.values(overlay?.patches || {})) for (const list of Object.values(labels)) for (const o of list) if (o.op === 'setmaplayout') ops.push(o.layout);
	const missing = [...new Set(ops)].filter(id => !fs.existsSync(path.join(DATA, 'layouts', id + '.json')));
	A(ops.length >= 22, '1. every setmaplayoutindex of pokeemerald + pokefirered is restored (with the Hoenn2_ copies)', String(ops.length));
	A(missing.length === 0, '1. every layout they name ships in overworld/data/layouts', missing.join(', '));
	const r131 = overlay?.patches?.Route131?.Route131_EventScript_SetLayout;
	A(JSON.stringify(r131) === JSON.stringify([{ op: 'setmaplayout', layout: 'LAYOUT_ROUTE131_SKY_PILLAR' }, { op: 'return' }]),
		"1. Route131_EventScript_SetLayout is the decomp's setmaplayoutindex + return", JSON.stringify(r131));
}

// ===== 2. the real game =====
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
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: { VAR_SOOTOPOLIS_CITY_STATE: 3, VAR_SKY_PILLAR_STATE: 0 } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
	};
	// what the current map loaded as, and (on Route 131) whether the sea reaches the door
	const probe = () => page.evaluate(() => {
		const w = window.__ow.world, lay = w.current.layout;
		const seen = new Set(['36,30']), q = [[36, 30]];
		if (w.current.name === 'Route131') {
			while (q.length) {
				const [x, y] = q.pop();
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
					if (nx < 0 || ny < 0 || nx >= lay.width || ny >= lay.height || seen.has(k) || !w.isPassable(nx, ny)) continue;
					seen.add(k); q.push([nx, ny]);
				}
			}
		}
		return { map: w.current.name, layout: lay.id, door: seen.has('36,6') };
	});

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route131&x=36&y=30`, { waitUntil: 'domcontentloaded' });
	await boot('Route131');
	let p = await probe();
	A(p.layout === 'LAYOUT_ROUTE131_SKY_PILLAR', '2. Route 131 loads with the Sky Pillar layout (its ON_TRANSITION setmaplayoutindex)', JSON.stringify(p));
	A(p.door, '2. surfing from the south sea (36,30) reaches the Sky Pillar entrance (36,6)', JSON.stringify(p));

	await page.evaluate(() => window.__ow.moveToMap('SkyPillar_1F'));
	for (let i = 0; i < 60 && (await probe()).map !== 'SkyPillar_1F'; i++) await sleep(100);
	await sleep(800);
	p = await probe();
	A(p.layout === 'LAYOUT_SKY_PILLAR_1F_CLEAN', '2. Sky Pillar 1F before Rayquaza wakes (VAR_SKY_PILLAR_STATE < 2): the clean floor', JSON.stringify(p));
	await page.evaluate(() => { window.__ow.Story.setVar('VAR_SKY_PILLAR_STATE', 2); return window.__ow.moveToMap('Route131'); });
	for (let i = 0; i < 60 && (await probe()).map !== 'Route131'; i++) await sleep(100);
	await page.evaluate(() => window.__ow.moveToMap('SkyPillar_1F'));
	for (let i = 0; i < 60 && (await probe()).map !== 'SkyPillar_1F'; i++) await sleep(100);
	await sleep(800);
	p = await probe();
	A(p.layout === 'LAYOUT_SKY_PILLAR_1F', '2. ...and its cracked floor again once it has (the swap never sticks to the cached map)', JSON.stringify(p));
	A(errors.length === 0, '2. no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
