// house_poster_test.mjs — the player's-room POSTER (pokecrystal decorations).
//
// PlayersHouse2F's poster is a `bg_event 6, 0, BGEVENT_IFSET, PlayersHousePosterScript`
// — readable only while EVENT_PLAYERS_ROOM_POSTER is set, which the room's TILES
// callback (ToggleMaptileDecorations) does whenever a poster hangs — and reading it
// runs `describedecoration DECODESC_POSTER`. The decoration system wasn't ported,
// so #658 skipped the sign and denied both room callbacks: no poster, no bed, and
// nothing to read on the wall. overworld/decorations.js brings back the slice:
//   1. entering the room hangs InitDecorations' default TOWN MAP poster (and the
//      FEATHERY BED) and sets EVENT_PLAYERS_ROOM_POSTER
//   2. facing the poster shows the decomp line "It's the TOWN MAP."
//   3. ...then opens the TOWN MAP to look at (no flying from a poster)
//
//   node overworld/tests/house_poster_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9237;
const STATE = { username: 'hposter', friendCode: 'HPST01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 40, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 120, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
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
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const MAP = 'PlayersHouse2F';
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${MAP}&x=6&y=1`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await W(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'PlayersHouse2F')).catch(() => false)); i++) await sleep(100);
	await sleep(1500);

	// ===== 1. the room hangs the default poster =====
	const room = await page.evaluate(async () => {
		const E = await import('./events.js');
		const g = window.__ow.world.current.layout.map;
		return { flag: E.getFlag('EVENT_PLAYERS_ROOM_POSTER'), poster: [g[0][6], g[0][7], g[1][6], g[1][7]], bed: [g[4][0], g[4][1], g[5][0], g[5][1]] };
	});
	const deco = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_decorations.json'), 'utf8'));
	A(room.flag === true, '1. entering the room sets EVENT_PLAYERS_ROOM_POSTER (a poster hangs)');
	A(room.poster.join() === (deco.decos.DECO_TOWN_MAP?.cells || []).join(), '1. the TOWN MAP poster block is on the wall at (6,0)', JSON.stringify(room.poster));
	A(room.bed.join() === (deco.decos.DECO_FEATHERY_BED?.cells || []).join(), '1. ...and the FEATHERY BED at (0,4)', JSON.stringify(room.bed));
	if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

	// ===== 2. read it =====
	await page.evaluate(async () => {
		(await import('./ow_state.js')).S.lastScriptLabel = null;
		const P = window.__ow.player; P.tx = 6; P.ty = 1; P.x = 96; P.y = 16; P.facing = 'up';
	});
	await page.keyboard.press('z');
	await sleep(500);
	const said = await W(() => JSON.stringify(window.__ow.dialog.pages || null));
	const label = await page.evaluate(async () => (await import('./ow_state.js')).S.lastScriptLabel);
	A(/It's the TOWN MAP\./.test(said || ''), '2. facing the poster shows "It\'s the TOWN MAP."', said);
	A(label === 'PlayersHousePosterScript.Script', '2. ...from the decomp poster script', String(label));

	// ===== 3. then the TOWN MAP, to look at =====
	for (let i = 0; i < 4 && (await W(() => window.__ow.dialog.blocking)); i++) { await page.keyboard.press('z'); await sleep(200); }
	const tm = await page.evaluate(async () => { const { townMap } = await import('./ow_menustate.js'); return { open: townMap.open, viewOnly: !!townMap.viewOnly }; });
	A(tm.open && tm.viewOnly, '3. the TOWN MAP poster opens the map afterwards (look only)', JSON.stringify(tm));
	await page.keyboard.press('z'); await sleep(300);
	const after = await page.evaluate(async () => { const { townMap } = await import('./ow_menustate.js'); return { open: townMap.open, map: window.__ow.world.current?.name, dlg: window.__ow.dialog.blocking }; });
	A(!after.open && after.map === MAP && !after.dlg, '3. ...and Z just closes it — no flying from a poster', JSON.stringify(after));
	A(!errors.length, 'no page errors', errors.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: test threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
