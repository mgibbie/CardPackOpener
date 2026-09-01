// crystal_story_test.mjs — Gen-2 Kanto's story can actually run.
//
// FOUR bugs, stacked, and between them the region could not be finished:
//
// 1. OBJECT VISIBILITY. npcs.js/trainers.js hid an object that had an event flag
//    AT ALL, whichever way the flag pointed. Crystal masks only while the flag is
//    SET (CheckObjectFlag). So every story NPC in the Crystal regions was deleted
//    permanently — MISTY and her three gym swimmers, BLUE and his gym guide among
//    them. Two Gen-2 Kanto badges were therefore UNOBTAINABLE, count('JOHKANTO')
//    could only ever reach 6, and RED — gated on 8 — was unreachable, which
//    silently sealed the whole Mt Silver league.
//
// 2. NO COORD_EVENTS. All 135 JohKanto maps shipped with zero, though the decomp
//    declares 10 across 7 maps. Extraction only ever walked Johto's list.
//
// 3. NO SCENES. setscene/setmapscene are dropped by the transpiler — 163 ops
//    across 85 maps — and the interpreter had no scene op, so nothing could arm.
//    Misty's date and the Power Plant guard's call both sit at scene 1.
//
// 4. VAR_BADGES was written by NOTHING, so the restored Victory Road gate would
//    have turned every player back forever.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/crystal_story_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const { SCENE_SET } = await import('../crystal_scenes.js');
const { INIT_EVENTS } = await import('../crystal_init_events.js');
const readMap = f => JSON.parse(fs.readFileSync(path.join(D, 'maps', f + '_map.json'), 'utf8'));
const readScript = f => JSON.parse(fs.readFileSync(path.join(D, 'scripts', f + '.json'), 'utf8'));

// ---------- 2. the coord_events came back ----------
{
	let jk = 0;
	for (const m of JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8')).JOHKANTO) {
		const p = path.join(D, 'maps', m.name + '_map.json');
		if (fs.existsSync(p)) jk += (JSON.parse(fs.readFileSync(p, 'utf8')).coord_events || []).length;
	}
	A(jk >= 6, `Gen-2 Kanto has ${jk} coord_events (it had zero)`, String(jk));
	const r25 = readMap('JohKantoRoute25').coord_events;
	A(r25.length === 2 && r25.every(e => e.var === 'VAR_SCENE_Route25' && e.var_value === '1'),
		"Misty's date is two trigger tiles gated on Route 25 scene 1", JSON.stringify(r25));
	// Johto must be untouched — the generator refuses to write unless it first
	// reproduces all 36 of Johto's existing tables exactly.
	const nb = readMap('NewBarkTown').coord_events;
	A(nb.length === 2 && nb[0].var === 'VAR_SCENE_NewBarkTown', "and Johto's own tables are unchanged", JSON.stringify(nb.length));
	// the bicycle gates are deliberately NOT restored — see SKIP in the generator
	A((readMap('JohKantoRoute16Gate').coord_events || []).length === 0,
		'the Cycling Road bicycle gate stays out, because the BICYCLE cannot be obtained');
}

// ---------- 3. the scene table ----------
{
	A(Object.keys(SCENE_SET).length > 100, `${Object.keys(SCENE_SET).length} labels can move a scene`);
	const mgr = SCENE_SET['PowerPlantManager'] || [];
	A(mgr.some(([v, n]) => v === 'VAR_SCENE_CeruleanGym' && n === 1),
		'the POWER PLANT manager arms the Cerulean Gym grunt scene', JSON.stringify(mgr));
	const grunt = SCENE_SET['CeruleanGymGruntRunsOutScript'] || [];
	A(grunt.some(([v, n]) => v === 'VAR_SCENE_Route25' && n === 1),
		"...and the fleeing grunt arms MISTY'S DATE on Route 25", JSON.stringify(grunt));
	// the date turns ITSELF off, so it needs no PLOT_ONESHOT entry
	A((SCENE_SET['Route25MistyDate1Script'] || []).some(([v, n]) => v === 'VAR_SCENE_Route25' && n === 0),
		'the date self-advances its own scene, so it plays once without a one-shot list');
	A((SCENE_SET['_VictoryRoadGateBadgeCheckScript.AllEightBadges'] || []).some(([v, n]) => v === 'VAR_SCENE_VictoryRoadGate' && n === 1),
		'and passing the badge check disarms the Victory Road gate, so it stops re-nagging');
	// every label in the table must exist in some transpiled script
	const known = new Set();
	for (const f of fs.readdirSync(path.join(D, 'scripts'))) for (const k of Object.keys(readScript(f.replace('.json', '')))) known.add(k);
	const miss = Object.keys(SCENE_SET).filter(k => !known.has(k));
	A(miss.length <= 3, `${Object.keys(SCENE_SET).length - miss.length} of them name a real script label`, miss.join(','));
}

// ---------- 1. the init state ----------
{
	A(INIT_EVENTS.length > 100, `${INIT_EVENTS.length} events are set on a new Crystal save`);
	for (const [f, want] of [['EVENT_TRAINERS_IN_CERULEAN_GYM', true], ['EVENT_VIRIDIAN_GYM_BLUE', true],
		['EVENT_ROUTE_25_MISTY_BOYFRIEND', true], ['EVENT_CERULEAN_GYM_ROCKET', true],
		['EVENT_BLUE_IN_CINNABAR', false], ['EVENT_VERMILION_CITY_SNORLAX', false]]) {
		A(INIT_EVENTS.includes(f) === want,
			`${f} starts ${want ? 'SET (hidden)' : 'clear (VISIBLE)'}`);
	}
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8931;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 70, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 250, atk: 180, def: 180, spa: 180, spd: 180, spe: 180 }, maxHP: 250, curHP: 250,
		exp: 343000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.removeItem('magepunk_story');
			localStorage.removeItem('magepunk_plot_fired');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// Drive a cutscene to COMPLETION. Stepping the interpreter alone is not
		// enough: a `msg` op parks on the dialog waiting for a button, so the script
		// stalls before whatever clearflag/setflag comes after it — which is exactly
		// the part the story turns on. Skip the typewriter and press Z each frame.
		await page.evaluate(() => {
			window.__drive = (label) => {
				const ow = window.__ow;
				ow.cutscene.stop();
				ow.dialog.pages = null;
				ow.runScriptLabel(label);
				// update(dt), NOT step() — there is no step, and `step?.()` silently
				// no-ops, so the loop spins doing nothing and the script never reaches
				// the clearflag that the whole beat turns on.
				for (let i = 0; i < 4000 && ow.cutscene.blocking; i++) {
					ow.cutscene.update(1 / 60);
					if (ow.dialog.blocking) { ow.dialog.revealed = 1e9; ow.dialog.key('z'); }
				}
				return !ow.cutscene.blocking;
			};
		});

		// the seed ran
		A(await page.evaluate(() => window.__ow.Story.getFlag('EVENT_TRAINERS_IN_CERULEAN_GYM')),
			"a fresh save has MISTY away from her gym, as Crystal's own init script leaves her");

		// --- the EARTH BADGE chain: Blue at Cinnabar -> Blue in the Viridian Gym ---
		const blue = await page.evaluate(async () => {
			const ow = window.__ow;
			const count = async (map) => {
				await ow.moveToMap(map);
				await ow.trainers.loadForMap();
				await ow.npcs.loadForMap();
				return { trainers: ow.trainers.list.length, npcs: ow.npcs.list.length,
					scripts: ow.trainers.list.map(t => t.ev?.script).concat(ow.npcs.list.map(n => n.ev?.script)) };
			};
			const gymBefore = await count('JohKantoViridianGym');
			const cinnabar = await count('JohKantoCinnabarIsland');
			const sawBlue = cinnabar.scripts.includes('CinnabarIslandBlue');
			window.__drive('CinnabarIslandBlue');
			const cleared = !ow.Story.getFlag('EVENT_VIRIDIAN_GYM_BLUE');
			const gymAfter = await count('JohKantoViridianGym');
			return { gymBefore, sawBlue, cleared, gymAfter };
		});
		A(blue.gymBefore.trainers === 0, 'the Viridian Gym starts empty — BLUE is not in it yet', JSON.stringify(blue.gymBefore));
		A(blue.sawBlue, 'BLUE is visible at Cinnabar Island on a fresh save (his flag is not in the init list)');
		A(blue.cleared, '...talking to him clears EVENT_VIRIDIAN_GYM_BLUE');
		A(blue.gymAfter.scripts.includes('ViridianGymBlueScript'),
			'...and BLUE now stands in the Viridian Gym, so the EARTH BADGE is obtainable at last',
			JSON.stringify(blue.gymAfter));

		// --- the CASCADE BADGE chain: manager -> grunt -> date -> Misty returns ---
		const misty = await page.evaluate(async () => {
			const ow = window.__ow;
			const at = async (map) => {
				await ow.moveToMap(map);
				await ow.trainers.loadForMap();
				await ow.npcs.loadForMap();
				return ow.trainers.list.map(t => t.ev?.script).concat(ow.npcs.list.map(n => n.ev?.script));
			};
			const run = window.__drive;
			const gymEmpty = await at('JohKantoCeruleanGym');
			// 1. the Power Plant manager
			await ow.moveToMap('JohKantoPowerPlant');
			run('PowerPlantManager');
			const gymScene = ow.Story.getVar('VAR_SCENE_CeruleanGym');
			const gruntShown = !ow.Story.getFlag('EVENT_CERULEAN_GYM_ROCKET');
			const gymWithGrunt = await at('JohKantoCeruleanGym');
			// 2. the grunt runs out (its onFrame scene is now armed)
			run('CeruleanGymGruntRunsOutScript');
			const dateScene = ow.Story.getVar('VAR_SCENE_Route25');
			// 3. the date itself, via its restored coord_event
			const r25 = await at('JohKantoRoute25');
			run('Route25MistyDate1Script');
			const mistyBack = !ow.Story.getFlag('EVENT_TRAINERS_IN_CERULEAN_GYM');
			const gymFull = await at('JohKantoCeruleanGym');
			return { gymEmpty, gymScene, gruntShown, gymWithGrunt, dateScene, r25, mistyBack, gymFull };
		});
		A(!misty.gymEmpty.includes('CeruleanGymMistyScript'), 'the Cerulean Gym starts empty — Misty is out', JSON.stringify(misty.gymEmpty));
		A(misty.gymScene === 1, 'the POWER PLANT manager arms the Cerulean Gym scene (setmapscene, recovered)', String(misty.gymScene));
		A(misty.gruntShown, '...and reveals the ROCKET grunt in the gym');
		A(misty.gymWithGrunt.includes('ObjectEvent') || misty.gymWithGrunt.length > misty.gymEmpty.length,
			'...who now actually spawns there', JSON.stringify(misty.gymWithGrunt));
		A(misty.dateScene === 1, "the fleeing grunt arms MISTY'S DATE on Route 25", String(misty.dateScene));
		A(misty.r25.includes('ObjectEvent'), '...and Misty + her date now stand on the Cerulean Cape', JSON.stringify(misty.r25));
		A(misty.mistyBack, 'playing the date clears EVENT_TRAINERS_IN_CERULEAN_GYM');
		A(misty.gymFull.includes('CeruleanGymMistyScript'),
			'...and MISTY is back in her gym, so the CASCADE BADGE is obtainable at last', JSON.stringify(misty.gymFull));

		// --- the capstone: with both leaders reachable, JohKanto can hit 8 and RED opens ---
		// `trainers.spawnFlagged` gates RED and the four Mt Silver elites on
		// count('JOHKANTO') >= 8. Misty and Blue were unspawnable, so that count was
		// capped at SIX and the whole league built in PR #178 sat behind a door that
		// could not open. Assert the door, not just the two leaders.
		const red = await page.evaluate(async () => {
			const ow = window.__ow;
			const B = await import('./badges.js');
			const at = async (map) => {
				await ow.moveToMap(map);
				await ow.trainers.loadForMap();
				return ow.trainers.list.map(t => t.ev?.script);
			};
			const before = await at('SilverCaveRoom3');
			for (const id of ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']) B.earn('JOHKANTO', id);
			B.crown('JOHTO');
			const after = await at('SilverCaveRoom3');
			return { before, jk: B.count('JOHKANTO'), after };
		});
		A(!red.before.includes('Red'), 'RED is not on Mt Silver before the eight Gen-2 Kanto badges', JSON.stringify(red.before));
		A(red.jk === 8, "...JohKanto's badge count can reach 8 now that both leaders spawn", String(red.jk));
		A(red.after.includes('Red'), '...and RED appears, so the Mt Silver league is reachable at all', JSON.stringify(red.after));

		// --- VAR_BADGES: the Victory Road gate must not seal ---
		const vr = await page.evaluate(async () => {
			const ow = window.__ow;
			const B = await import('./badges.js');
			const before = ow.Story.getVar('VAR_BADGES');
			for (const id of ['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising']) B.earn('JOHTO', id);
			ow.syncStoryVars();
			return { before, after: ow.Story.getVar('VAR_BADGES'), count: B.count('JOHTO') };
		});
		A(vr.before === 0 && vr.after === 8 && vr.count === 8,
			'VAR_BADGES tracks the real Johto badge count, so the Victory Road gate opens instead of sealing',
			JSON.stringify(vr));

		// --- item balls must not double-render now that flagged objects can appear ---
		const balls = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoRoute2');
			await ow.npcs.loadForMap();
			ow.items.loadForMap();
			return { npcBalls: ow.npcs.list.filter(n => /POKE_BALL/.test(n.ev?.graphics_id || '')).length,
				itemBalls: ow.items.balls.length };
		});
		A(balls.npcBalls === 0 && balls.itemBalls > 0,
			'Crystal item balls are drawn once, by items.js — not twice as fake NPCs', JSON.stringify(balls));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
