// tester_1013_field_test.mjs — four playtest reports from 2026-10-12/13 (Instinct).
//
//   1. bug:1791843845630  PARTY menu: clicking SURF in a POKeMON's action list did
//      nothing (the keyboard worked). Taps hit the FIRST menu button under the
//      pointer, and the POKeMON rows (drawn first) sit under the action list, so
//      every SURF/CUT/FLY tap went to the row. Topmost now wins (main.js).
//   2. bug:1791844434837  The Pokemon Center PC at (10,1) in Pacifidlog / Slateport did
//      nothing. FRLG/Emerald open storage from the metatile (MB_PC 0x83); the port
//      only had a fixed (12,2) zone (ow_input.js).
//   3. bug:1791845952494  DIVE at Sootopolis froze the diver: Underwater_SootopolisCity's
//      floor is MB_DEEP_WATER, the port called it water, and the landing picked the one
//      non-water cell — a warp — where every direction bumped. Underwater, every open
//      cell is swimmable (engine.js isSurfable).
//   4. bug:1791856358753  Victory Road 1F's trainers stand UNDER the bridge (elevation 3)
//      and walled the bridge deck above them (elevation 4); they were also drawn
//      under the top layer from the deck. Objects now interact only at compatible
//      elevations, and draw priority follows elevation (engine.js elevCompatible /
//      drawsAboveTop).
//
//   node overworld/tests/tester_1013_field_test.mjs
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
const PORT = 9460;
const STATE = { username: 'field1013', friendCode: 'FLD113', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'blastoise', name: 'BLASTOISE', level: 60, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 90, def: 100, spa: 90, spd: 100, spe: 80 }, maxHP: 200, curHP: 200,
	exp: 216000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'dive', name: 'Dive', pp: 10, maxPp: 10 }],
	sprite: 's9.png', num: 9,
}];
const ALL_HOENN = { stone: true, knuckle: true, dynamo: true, heat: true, balance: true, feather: true, mind: true, rain: true };
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
	await page.evaluateOnNewDocument((st, party, badges) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { HOENN: badges }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		localStorage.setItem('magepunk_repel_v1', '999');   // no wild battles mid-walk (a Lv60 lead repels Victory Road)
	}, STATE, PARTY, ALL_HOENN);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const go = async (map, x, y, facing) => {
		await W(async (m, x, y) => { await window.__ow.moveToMap(m, x, y); }, map, x, y);
		for (let i = 0; i < 60 && (await W(() => window.__ow.world.current.name)) !== map; i++) await sleep(100);
		await sleep(500);
		await W((x, y, f) => { const P = window.__ow.player; P.setTile(x, y); P.facing = f; }, x, y, facing);
	};
	const pos = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, surfing: window.__ow.player.surfing, elev: window.__ow.player.elev }));
	const closeDialogs = async () => { for (let i = 0; i < 20 && await W(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(80); } };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PacifidlogTown&x=19&y=22`, { waitUntil: 'domcontentloaded' });
	await boot('PacifidlogTown');

	// ===== 1. a mouse click on SURF in the party menu =====
	await W(() => { const P = window.__ow.player; P.setTile(19, 22); P.facing = 'right'; P.surfing = false; });
	const facingWater = await W(() => window.__ow.world.isSurfable(20, 22));
	A(facingWater, '1. setup: (20,22) east of the Pacifidlog platform is water', String(facingWater));
	await W(async () => {
		const MK = await import('./ow_menukeys.js');
		window.__ow.partyMenu.open = true; window.__ow.partyMenu.idx = 0;
		MK.pressKey('z');   // the POKeMON's action list
	});
	await sleep(300);   // a frame or two: the action list's buttons are laid out by the draw
	const btn = await W(() => {
		const b = (window.__ow.menuUi || []).find(b => /^pact:/.test(b.id) && /SURF/.test(b.label || ''));
		if (!b) return null;
		const sc = document.getElementById('screen'), r = sc.getBoundingClientRect();
		return { id: b.id, x: r.left + (b.x + b.w / 2) * (r.width / sc.width), y: r.top + (b.y + b.h / 2) * (r.height / sc.height) };
	});
	A(!!btn, '1. the party action list offers SURF', JSON.stringify(btn));
	if (btn) await page.mouse.click(btn.x, btn.y);
	await sleep(400);
	await closeDialogs();
	await sleep(600);
	const afterSurf = await pos();
	A(afterSurf.surfing === true && (afterSurf.x === 20 || afterSurf.map === 'Route131'), '1. clicking SURF surfs out onto the water (not swallowed by the POKeMON row under the list)', JSON.stringify(afterSurf));

	// ===== 2. the Pokemon Center PC machine =====
	for (const center of ['PacifidlogTown_PokemonCenter_1F', 'SlateportCity_PokemonCenter_1F']) {
		await go(center, 10, 2, 'up');
		await W(() => { window.__ow.pcMenu.open = false; });
		const beh = await W(() => window.__ow.world.behaviorAt(10, 1));
		A(beh === 0x83, `2. ${center}: (10,1) is the PC metatile (MB_PC)`, beh.toString(16));
		await W(() => window.__ow.interact());
		await sleep(300);
		const pcOpen = await W(() => window.__ow.pcMenu.open);
		A(pcOpen === true, `2. ${center}: facing the PC from (10,2) and pressing Z opens storage`, String(pcOpen));
		await W(() => { window.__ow.pcMenu.open = false; });
	}

	// ===== 3. DIVE at Sootopolis =====
	await go('SootopolisCity', 29, 53, 'down');
	await W(() => { window.__ow.player.surfing = true; });
	await W(async () => { await window.__ow.diveTo('dive'); });
	for (let i = 0; i < 60 && (await W(() => window.__ow.world.current.name)) !== 'Underwater_SootopolisCity'; i++) await sleep(100);
	await sleep(500);
	const under = await pos();
	A(under.map === 'Underwater_SootopolisCity' && !(under.y === 8 && (under.x === 9 || under.x === 10)), '3. the dive lands in Underwater Sootopolis, not on its warp tile', JSON.stringify(under));
	const moved = [];
	// from the (9,6) landing: up, right, left all open floor (deep water); one step each
	for (const [dir, key] of [['up', 'ArrowUp'], ['right', 'ArrowRight'], ['left', 'ArrowLeft'], ['left', 'ArrowLeft']]) {
		const a = await pos();
		await page.keyboard.down(key); await sleep(120); await page.keyboard.up(key); await sleep(450);
		const b = await pos();
		moved.push(dir + ':' + (b.map === 'Underwater_SootopolisCity' && (a.x !== b.x || a.y !== b.y)));
	}
	A(moved.every(m => m.endsWith('true')), '3. the diver swims (moves) underwater in every direction tried', moved.join(' '));
	// reach the (9,8) warp: down to Underwater Route 126
	await W(() => { window.__ow.player.setTile(9, 7); window.__ow.player.facing = 'down'; });
	await page.keyboard.down('ArrowDown'); await sleep(260); await page.keyboard.up('ArrowDown');
	for (let i = 0; i < 60 && (await W(() => window.__ow.world.current.name)) === 'Underwater_SootopolisCity'; i++) await sleep(100);
	await sleep(400);
	const r126 = await pos();
	A(r126.map === 'Underwater_Route126', '3. swimming onto the (9,8) warp reaches Underwater Route 126', JSON.stringify(r126));

	// ===== 4. Victory Road 1F: over the trainers under the bridge =====
	await go('VictoryRoad_1F', 27, 17, 'right');
	const vr0 = await pos();
	A(vr0.elev === 4, '4. on the bridge deck the player is at elevation 4', JSON.stringify(vr0));
	const fought = await W(() => { window.__ow.trainers.engagement = null; return null; });
	for (let i = 0; i < 9; i++) {
		await page.keyboard.down('ArrowRight'); await sleep(260); await page.keyboard.up('ArrowRight'); await sleep(250);
		if (await W(() => window.__ow.battle.blocking || !!window.__ow.trainers.engagement)) break;
	}
	const vr1 = await pos();
	const engaged = await W(() => !!(window.__ow.battle.blocking || window.__ow.trainers.engagement));
	A(vr1.x >= 34 && !engaged, '4. walking the bridge passes OVER Katelynn (29,17) and Quincy (32,17) below it — no wall, no sight battle', JSON.stringify({ ...vr1, engaged }));
	const prio = await W(async () => { const E = await import('./engine.js'); return [E.drawsAboveTop(4), E.drawsAboveTop(3), E.elevCompatible(4, 3), E.elevCompatible(15, 3)]; });
	A(prio[0] === true && prio[1] === false && prio[2] === false && prio[3] === true, '4. GBA elevation rules: 4 draws over the top layer, 3 under it; 4 vs 3 never meet; 15 meets anything', JSON.stringify(prio));
	// under the bridge (elevation 3, the N-S corridor) Katelynn is right there and does block
	await go('VictoryRoad_1F', 29, 19, 'up');
	await W(() => { window.__ow.player.elev = 3; });
	const blockedBelow = await W(() => window.__ow.player.blocked(29, 18) || window.__ow.player.blocked(29, 17));
	A(blockedBelow, '4. from under the bridge the trainers are still there (same elevation)', String(blockedBelow));

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
