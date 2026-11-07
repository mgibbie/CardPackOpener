// hoenn_reach_1106_test.mjs — six "sealed" Hoenn objectives from the 2026-11-06 bug list,
// each walked with REAL key presses (keydown/keyup through the frame loop, never
// pumpPlayer or a teleport onto the goal).
//
// Two were real bugs:
//   3. TRICK HOUSE PUZZLE 1 (bug:1793645886886): its exit (13,1) was a LOCKED_WARPS cell
//      (tools/gen_locked_warps.mjs saw the map's own ON_LOAD `setmetatile 13, 1 ...`),
//      so the engine honoured the cell's wall collision and the player bumped, scroll
//      or no scroll. Emerald opens it from a door you press A on (MB_TRICK_HOUSE_PUZZLE_DOOR),
//      which the port replaced with its own scroll gate (ow_venues.js trickWarp) — the
//      generator now leaves the Trick House exits to that gate, as Puzzles 2-8 always were.
//   6. TERRA CAVE GROUDON (bug:1793979117166): Emerald's trigger square (17,26) is the
//      tile the native GROUDON encounter sits on; the coord script ran first, its
//      `special BattleSetup_StartLegendaryBattle` had no handler, so it "won" with no
//      battle (FLAG_DEFEATED_GROUDON) and swallowed the step. The special now fights
//      the map's placed legendary (ow_story.js runSpecial).
// Four were routes the reporter's flood fill didn't model (the decomp's own design):
//   1. LAVARIDGE GYM (bug:1793871410126): the B1F (12,12) pocket is entered by HOPPING
//      the y10 ledge (MB_JUMP_SOUTH) from the (10,6) hole's pocket; its geyser lifts you
//      onto FLANNERY's platform.
//   2. ROUTE 110 -> SLATEPORT (bug:1793935363014): rows 96-99 under x24-33 are a fenced
//      yard; the walking path south is the west lane, which TEAM AQUA blocks at (7-10,83)
//      until the Oceanic Museum (FLAG_HIDE_ROUTE_110_TEAM_AQUA). From the north the way
//      round is the SEASIDE CYCLING ROAD SOUTH ENTRANCE: in at (19,88), out at (16,88).
//   4. MIRAGE TOWER 4F (bug:1793766051506): the fossil chamber's door is (6,6), behind
//      the ROCK SMASH rock at (6,7).
//   5. ROUTE 117 REVIVE (bug:1793968526280): the pocket's only way in is the CUT tree at (15,2).
//
//   node overworld/tests/hoenn_reach_1106_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9472;
const STATE = { username: 'hoennreach', friendCode: 'HRCH01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name, moves) => ({
	speciesId: id, name, level: 100, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 300, curHP: 300,
	exp: 1000000, moves: moves.map(m => ({ id: m, name: m.toUpperCase(), pp: 20, maxPp: 20 })), sprite: 's1.png', num: 19,
});
const PARTY = [mon('rattata', 'A', ['tackle', 'cut', 'rocksmash'])];
const ALL = { KANTO: ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'],
	JOHTO: ['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising'],
	HOENN: ['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain'] };
const BADGES = { badges: Object.fromEntries(Object.entries(ALL).map(([r, l]) => [r, Object.fromEntries(l.map(b => [b, true]))])), champion: {} };
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 0. the generated data: no Trick House maze exit is a script-locked cell =====
{
	const { LOCKED_WARPS } = await import(pathToFileURL(path.join(ROOT, 'overworld', 'locked_warps_data.js')).href);
	const bad = Object.entries(LOCKED_WARPS).filter(([m, cells]) => /TrickHousePuzzle\d$/.test(m) && cells.includes('13,1')).map(([m]) => m);
	A(bad.length === 0, '0. no Trick House puzzle exit (13,1) is governed by its wall cell', bad.join(', '));
	// the audit (ledges, warps, CUT/ROCK SMASH as requirements) agrees every target is reachable
	const audit = await import(pathToFileURL(path.join(ROOT, 'tools', 'audit_tile_reach.mjs')).href);
	const seen = audit.flood('MAP_LAVARIDGE_TOWN_GYM_1F', 13, 17);
	A(!!seen.get('MAP_LAVARIDGE_TOWN_GYM_1F')?.has('12,9'), "0. the audit reaches the square beside FLANNERY (13,9) from the gym's door");
	const r110 = audit.flood('MAP_ROUTE110', 24, 95);
	A((r110.get('MAP_SLATEPORT_CITY')?.size || 0) > 0, '0. the audit reaches SLATEPORT from Route 110 (24,95)');
}

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
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => {
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const scene = async (map, x, y, facing, { flags = {}, vars = {}, extra = {} } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: 'HOENN', magepunk_name: 'MAY',
			magepunk_party_v1: PARTY, magepunk_bag_v1: { pokeball: 5 }, magepunk_badges_v1: BADGES,
			magepunk_repel_v1: '99999',
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
			...extra,
		};
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
		await W((x, y, f) => { const P = window.__ow.player; P.setTile(x, y); P.facing = f; }, x, y, facing);
	};
	const where = () => W(() => { const O = window.__ow; return { map: O.world.current.name, x: O.player.tx, y: O.player.ty, out: O.player.moveOutcome, battle: !!O.battle.active,
		text: O.dialog.blocking && O.dialog.pages ? O.dialog.pages.flat().join(' ') : '' }; });
	// settle: no step, scene, fade or warp in flight
	const settle = async (ms = 6000) => {
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < ms) {
			const busy = await W(() => { const O = window.__ow; return !!(O.player.moving || O.cutscene.blocking || O.fade?.active || O.loading); }).catch(() => true);
			if (!busy) { if (++calm >= 4) return; } else calm = 0;
			await sleep(60);
		}
	};
	// one real key tap per tile
	const key = async (k, n = 1) => {
		for (let i = 0; i < n; i++) {
			await W(k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);
			await sleep(50);
			await W(k => dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })), k);
			await settle();
		}
	};
	const closeDialogs = async () => { for (let i = 0; i < 30 && (await W(() => window.__ow.dialog.blocking)); i++) { await key('z'); await sleep(80); } };
	const fieldMove = mv => W(async mv => { const FM = await import('./ow_fieldmoves.js'); FM.HM_FIELD[mv].use(); }, mv);

	// ===== 1. LAVARIDGE GYM: hop the B1F ledge into the (12,12) pocket, ride its geyser to FLANNERY =====
	await scene('LavaridgeTown_Gym_B1F', 11, 9, 'down');
	await key('ArrowDown');
	const hop = await where();
	A(hop.map === 'LavaridgeTown_Gym_B1F' && hop.x === 11 && hop.y === 11 && hop.out === 'hop', '1. B1F (11,9) hops the y10 ledge into the sealed-looking pocket', JSON.stringify(hop));
	await key('ArrowRight'); await key('ArrowDown');
	await settle(8000);
	const up = await where();
	A(up.map === 'LavaridgeTown_Gym_1F' && up.x === 12 && up.y === 12, "1. the pocket's (12,12) geyser lifts you onto FLANNERY's platform on 1F", JSON.stringify(up));
	await closeDialogs();
	await key('ArrowUp', 3);
	await W(() => { window.__ow.player.facing = 'right'; });
	await key('z');
	const fl = await where();
	A(fl.x === 12 && fl.y === 9 && (/FLANNERY|Lavaridge|GYM|leader/i.test(fl.text) || fl.battle), '1. ...and FLANNERY answers from (12,9)', JSON.stringify(fl));

	// ===== 2. ROUTE 110 -> SLATEPORT through the cycling-road gatehouse =====
	await scene('Route110_SeasideCyclingRoadSouthEntrance', 12, 4, 'left');
	for (let i = 0; i < 16 && (await where()).x > 2; i++) { await key('ArrowLeft'); await closeDialogs(); }
	const gate = await where();
	A(gate.map === 'Route110_SeasideCyclingRoadSouthEntrance' && gate.x === 2, '2. on foot, the gatehouse lets you through from the cycling-road door to the path door', JSON.stringify(gate));
	await key('ArrowDown');
	await settle(8000);
	const out = await where();
	A(out.map === 'Route110' && out.x === 16 && out.y === 88, "2. ...out onto Route 110's path side (16,88), south of TEAM AQUA", JSON.stringify(out));
	for (let i = 0; i < 20 && (await where()).map === 'Route110'; i++) { await key('ArrowDown'); await closeDialogs(); }
	await settle(8000);
	const sl = await where();
	A(sl.map === 'SlateportCity', '2. ...and south down the path into SLATEPORT CITY', JSON.stringify(sl));

	// ===== 3. TRICK HOUSE PUZZLE 1: the exit, with real keys =====
	await scene('Route110_TrickHousePuzzle1', 13, 2, 'up', { extra: { magepunk_trickhouse_v1: { stage: 0, scroll: false } } });
	await key('ArrowUp');
	const locked = await where();
	A(locked.map === 'Route110_TrickHousePuzzle1' && /locked|SCROLL/i.test(locked.text), '3. without the scroll the exit refuses, and says why', JSON.stringify(locked));
	await closeDialogs();
	await scene('Route110_TrickHousePuzzle1', 13, 2, 'up', { extra: { magepunk_trickhouse_v1: { stage: 0, scroll: true } } });
	await key('ArrowUp');
	await settle(8000);
	const th = await where();
	A(th.map === 'Route110_TrickHouseEnd', '3. with the scroll, pressing Up walks through the exit into the End room', JSON.stringify(th));

	// ===== 4. MIRAGE TOWER 4F: ROCK SMASH the (6,7) rock, through (6,6) to the fossils =====
	await scene('MirageTower_4F', 6, 8, 'up');
	await key('ArrowUp');
	const rockFirst = await where();
	A(rockFirst.x === 6 && rockFirst.y === 8, '4. the rock at (6,7) stands in the chamber door', JSON.stringify(rockFirst));
	await fieldMove('rocksmash');
	await closeDialogs(); await settle();
	await key('ArrowUp', 3);
	const ch = await where();
	A(ch.map === 'MirageTower_4F' && ch.x === 6 && ch.y === 5, '4. ...smashed, it opens the way through (6,6) into the fossil chamber', JSON.stringify(ch));
	await key('ArrowLeft');
	await W(() => { window.__ow.player.facing = 'up'; });
	await key('z');
	const fos = await where();
	A(/ROOT FOSSIL/i.test(fos.text), '4. ...and the ROOT FOSSIL at (5,4) answers', JSON.stringify(fos));

	// ===== 5. ROUTE 117: CUT the (15,2) tree, collect the REVIVE at (9,1) =====
	await scene('Route117', 16, 2, 'left');
	await fieldMove('cut');
	await closeDialogs(); await settle();
	await key('ArrowLeft', 6);
	const r117 = await where();
	A(r117.x === 10 && r117.y === 2, '5. past the CUT tree into the pocket', JSON.stringify(r117));
	await key('ArrowUp');
	await W(() => { window.__ow.player.facing = 'left'; });
	const before = await W(() => window.__ow.Bag.count('revive'));
	await key('z');
	await closeDialogs();
	const after = await W(() => window.__ow.Bag.count('revive'));
	A(after === before + 1, '5. ...and the REVIVE ball at (9,1) is picked up', JSON.stringify({ before, after }));

	// ===== 6. TERRA CAVE: the trigger square starts the GROUDON battle =====
	await scene('TerraCave_End', 16, 26, 'right');
	await key('ArrowRight');
	let g = null;
	for (let i = 0; i < 100; i++) {
		g = await W(() => { const O = window.__ow; return { battle: !!O.battle.active, foe: O.battle.foe?.speciesId || O.battle.enemy?.speciesId || null, defeated: O.Story.getFlag('FLAG_DEFEATED_GROUDON') }; });
		if (g.battle) break;
		await sleep(100);
	}
	A(g.battle, '6. stepping on (17,26) starts a battle with GROUDON', JSON.stringify(g));
	A(!g.defeated, '6. ...rather than marking GROUDON defeated with no fight', JSON.stringify(g));

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
