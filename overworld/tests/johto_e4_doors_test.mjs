// johto_e4_doors_test.mjs — Crystal's ELITE FOUR: a win opens the north door AT ONCE.
//
// Playtest 2026-10-13 (Instinct, 4 reports): walking into WILL's sight started the
// port's PLAIN trainer battle (main.js onEngage kept every League member off the
// authored path), which recorded a generic win but never set EVENT_BEAT_ELITE_4_WILL
// / EVENT_WILLS_ROOM_EXIT_OPEN — talking to him replayed the whole fight. And when
// the authored script did run, its `changeblock 4, 2, $16` was not restored (only the
// room CALLBACK's copy was), so the door opened only after a reload. Same for KOGA,
// BRUNO and KAREN.
//   For each room: walk up into the member's sight (real keys) -> the authored
//   battle -> win -> the beat + exit events are set, the door is OPEN NOW (no
//   reload) -> walking north reaches the next room.
//
//   node overworld/tests/johto_e4_doors_test.mjs
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
const PORT = 9450;
const STATE = { username: 'jo_e4', friendCode: 'JOE4DR', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true, rising: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: { VAR_SCENE_WillsRoom: 1, VAR_SCENE_KogasRoom: 1, VAR_SCENE_BrunosRoom: 1, VAR_SCENE_KarensRoom: 1 } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const pos = () => W(() => ({ map: window.__ow.world.current && window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, cut: !!window.__ow.cutscene.blocking, dlg: !!window.__ow.dialog.blocking, b: !!(window.__ow.battle && window.__ow.battle.active) }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const waitMap = async (m, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await pos()).map === m) return true; await sleep(100); } return false; };
	const walk = async (k, ms = 260) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(450); };
	// press through dialog until a battle is up (returns true) or everything is calm
	const toBattle = async () => { for (let i = 0; i < 120; i++) { const p = await pos(); if (p.b) return true; if (p.dlg) await page.keyboard.press('z'); else if (!p.cut && i > 20) return false; await sleep(120); } return false; };
	const settle = async () => { for (let i = 0, calm = 0; i < 150; i++) { const p = await pos(); if (p.dlg) await page.keyboard.press('z'); if (!p.dlg && !p.cut && !p.b) { if (++calm > 8) return p; } else calm = 0; await sleep(120); } return pos(); };
	const ROOMS = [
		['WillsRoom', 'WILL', 'KogasRoom'], ['KogasRoom', 'KOGA', 'BrunosRoom'],
		['BrunosRoom', 'BRUNO', 'KarensRoom'], ['KarensRoom', 'KAREN', 'LancesRoom'],
	];
	for (const [room, who, next] of ROOMS) {
		const key = room.replace(/Room$/, '').replace(/s$/, '').toUpperCase();   // WILL, KOGA, BRUNO, KAREN
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${room}&x=5&y=9`, { waitUntil: 'domcontentloaded' });
		await boot(room);
		await W(() => { window.__ow.player.facing = 'up'; });
		await walk('ArrowUp');                    // (5,9) -> (5,8): one tile in front of the member at (5,7)
		const fought = await toBattle();
		A(fought, `${who}: stepping in front of him/her starts the battle`, JSON.stringify(await pos()));
		await W(() => window.__ow.battle.finish('victory'));
		const after = await settle();
		const st = await W(k => ({ beat: !!window.__ow.Story.getFlag('EVENT_BEAT_ELITE_4_' + k), exit: !!window.__ow.Story.getFlag(`EVENT_${k}S_ROOM_EXIT_OPEN`),
			door: window.__ow.world.isPassable(5, 2) && window.__ow.world.isPassable(4, 2) }), key);
		A(st.beat && st.exit, `${who}: the authored win sets EVENT_BEAT_ELITE_4_${key} + the EXIT_OPEN event`, JSON.stringify(st));
		A(st.door, `${who}: the north door is open AT ONCE (no reload)`, JSON.stringify({ st, after }));
		await W(() => { const P = window.__ow.player; P.tx = 5; P.ty = 3; P.x = 80; P.y = 48; P.facing = 'up'; });
		await walk('ArrowUp');
		A(await waitMap(next), `${who}: walking north leads on to ${next}`, JSON.stringify(await pos()));
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
