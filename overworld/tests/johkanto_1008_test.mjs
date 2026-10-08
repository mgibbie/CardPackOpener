// johkanto_1008_test.mjs — the 2026-10-08 Johto/Kanto tester reports.
//
//   1. bug:1791421947695 — the RADIO TOWER takeover never began: every Johto gym's
//      <Gym>ActivateRockets (readvar VAR_BADGES; ifequal 7 -> RadioTowerRocketsScript)
//      transpiled to a bare `end`, so the 2F stair guard never stepped aside
//   2. bug:1791408988392 — HIKER ANTHONY (Route 33): beaten, then called for a
//      rematch, talking to him did nothing
//
//   node overworld/tests/johkanto_1008_test.mjs
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
const PORT = 9310;
const STATE = { username: 'jk1008', friendCode: 'JK1008', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name) => ({
	speciesId: id, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
});
const FIVE = ['A', 'B', 'C', 'D', 'E'].map(n => mon('rattata', n));
// Crystal's new-game events, then the Slowpoke Well cleared: KURT's victory scene
// (SlowpokeWellB1F) is what clears EVENT_ILEX_FOREST_FARFETCHD and lets the bird appear
const ILEX = { crystal_events_seeded: true, EVENT_CLEARED_SLOWPOKE_WELL: true };
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
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
	await page.evaluateOnNewDocument(() => {
		// each scene's save is staged in sessionStorage by `scene` below, applied once
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	// a fresh save on `map`, then the player at (x,y) facing `f`
	const scene = async (map, x, y, f, { flags = {}, vars = {}, bag = { pokeball: 5 }, party = FIVE, badges = null } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: 'JOHTO', magepunk_name: 'KRIS',
			magepunk_party_v1: party, magepunk_bag_v1: bag,
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
		};
		if (badges) stage.magepunk_badges_v1 = badges;
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(map);
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f);
	};
	// talk, then answer every message / yes-no with Z until the scene is over;
	// returns every page of text shown
	const talk = () => W(async () => {
		const O = window.__ow, C = await import('./choice.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = [];
		O.interact();
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking, b = O.battle.blocking;
			if (b) return { seen, battle: true };
			if (d && O.dialog.pages) { const p = O.dialog.pages.flat().join(' '); if (seen[seen.length - 1] !== p) seen.push(p); }
			if (C.choiceMenu.open || d) press('z');
			if (!d && !c && !C.choiceMenu.open) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return { seen, battle: false };
	});
	const story = () => W(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}'));

	const npcAt = (x, y) => W((x, y) => { const n = window.__ow.npcs.list.find(n => n.tx === x && n.ty === y); return n ? { hidden: !!n.hidden, script: n.ev && n.ev.script } : null; }, x, y);
	const JOHTO7 = { badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true } }, champion: {} };

	// ===== 1. the Radio Tower takeover =====
	// Instinct's save: seven Johto badges, Pryce beaten, the tower still peaceful
	await scene('RadioTower2F', 1, 2, 'up', { flags: { crystal_events_seeded: true, EVENT_RADIO_TOWER_ROCKET_TAKEOVER: true, EVENT_BEAT_PRYCE: true, ENGINE_GLACIERBADGE: true }, badges: JOHTO7 });
	const s1 = (await story()).flags || {};
	A(s1.ENGINE_ROCKETS_IN_RADIO_TOWER === true && s1.EVENT_RADIO_TOWER_BLACKBELT_BLOCKS_STAIRS === true && !s1.EVENT_RADIO_TOWER_ROCKET_TAKEOVER,
		'1. seven Johto badges start the takeover (RadioTowerRocketsScript)', JSON.stringify({ r: s1.ENGINE_ROCKETS_IN_RADIO_TOWER, g: s1.EVENT_RADIO_TOWER_BLACKBELT_BLOCKS_STAIRS, t: s1.EVENT_RADIO_TOWER_ROCKET_TAKEOVER }));
	const guard = await npcAt(0, 1);
	A(!guard || guard.hidden, '1. ...so the 2F stair guard is gone from (0,1)', JSON.stringify(guard));
	A(!s1.EVENT_GOLDENROD_CITY_ROCKET_TAKEOVER, '1. ...and the Rockets are in Goldenrod (6th badge: GoldenrodRocketsScript)');
	// six badges: Goldenrod's Rockets, not yet the tower
	await scene('RadioTower2F', 1, 2, 'up', { flags: { crystal_events_seeded: true, EVENT_RADIO_TOWER_ROCKET_TAKEOVER: true, EVENT_GOLDENROD_CITY_ROCKET_TAKEOVER: true }, badges: { badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true } }, champion: {} } });
	const s1b = (await story()).flags || {};
	A(!s1b.EVENT_GOLDENROD_CITY_ROCKET_TAKEOVER && !s1b.ENGINE_ROCKETS_IN_RADIO_TOWER && s1b.EVENT_RADIO_TOWER_ROCKET_TAKEOVER === true, '1. six badges: Rockets in Goldenrod, the tower not yet taken', JSON.stringify(s1b));
	// a cleared tower stays cleared
	await scene('RadioTower2F', 1, 2, 'up', { flags: { crystal_events_seeded: true, EVENT_CLEARED_RADIO_TOWER: true, EVENT_RADIO_TOWER_ROCKET_TAKEOVER: true }, badges: JOHTO7 });
	const s1c = (await story()).flags || {};
	A(!s1c.ENGINE_ROCKETS_IN_RADIO_TOWER && s1c.EVENT_RADIO_TOWER_ROCKET_TAKEOVER === true, '1. once the tower is cleared nothing restarts it');

	// ===== 2. HIKER ANTHONY: beaten, called for a rematch, talked to =====
	await scene('Route33', 6, 14, 'up', { flags: { crystal_events_seeded: true, EVENT_BEAT_HIKER_ANTHONY: true, EVENT_ANTHONY_ASKED_FOR_PHONE_NUMBER: true, ENGINE_ANTHONY_READY_FOR_REMATCH: true } });
	await W(() => localStorage.setItem('magepunk_defeated_v1', JSON.stringify(['MAP_ROUTE_33:Route33_SPRITE_POKEFAN_M'])));
	await W(() => window.__ow.trainers.reloadDefeated && window.__ow.trainers.reloadDefeated());
	const an = await talk();
	A(an.battle || an.seen.length > 0, '2. talking to the beaten ANTHONY does something', JSON.stringify(an));
	A(an.battle, '2. ...his rematch starts (ENGINE_ANTHONY_READY_FOR_REMATCH)', JSON.stringify(an));

	// ...and an unbeaten ANTHONY battles when talked to (Muse's other observation)
	await scene('Route33', 6, 14, 'up', { flags: { crystal_events_seeded: true } });
	const an0 = await talk();
	A(an0.battle, '2. talking to an unbeaten ANTHONY starts his battle', JSON.stringify(an0));

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
