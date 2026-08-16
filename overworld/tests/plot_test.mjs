// plot_test.mjs — headless test that the deeper plot cutscenes are selectively ON.
// Verifies (through the real main.js wiring):
//   • STORY_SEED no longer rests the SAFE scene vars (Hoenn 7, Johto 9) but still
//     rests the UNSAFE ones (warps / player-shoves / key-item / legendary hides);
//   • a SAFE coord scene actually fires when you step on its trigger tile;
//   • an UNSAFE scene stays suppressed (its var is rested past the trigger value);
//   • the PLOT_ONESHOT guard: a re-firing scene's two trigger tiles share one key,
//     so once the beat plays it never replays.
//
// Standalone (needs headless Chrome + puppeteer-core + local overworld/ data);
// NOT in run-all.mjs.   node overworld/tests/plot_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8877;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'plot', friendCode: 'PLOTTT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) { /* drain */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
		await page.evaluateOnNewDocument((st) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'plot-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_region', 'HOENN');
				localStorage.removeItem('magepunk_plot_fired'); // start with no plot beats fired
				localStorage.setItem('magepunk_party_v1', JSON.stringify([{
					speciesId: 'bulbasaur', name: 'BULBASAUR', nickname: null, level: 12, gender: 'M',
					ability: 'Overgrow', types: ['Grass', 'Poison'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
					stats: { hp: 34, atk: 18, def: 18, spa: 22, spd: 20, spe: 18 }, maxHP: 34, curHP: 34, exp: 1728,
					moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], num: 1, sprite: 'bulbasaur.png',
				}]));
			} catch {}
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=OldaleTown`, { waitUntil: 'domcontentloaded' });

		const booted = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.STORY_SEED && window.__ow.checkCoordTrigger && window.__ow.Story)), 30000);
		A(booted, 'booted with the plot helpers exposed');

		await page.evaluate(() => {
			window._seed = (r) => { window.__ow.Story.resetStory(); window.__ow.seedStoryState(r); };
			window._close = () => { const d = window.__ow.dialog; let n = 0; while (d.blocking && n++ < 40) d.key('x'); if (window.__ow.cutscene.blocking) window.__ow.cutscene.stop(); };
			// load a map, force the gating var, stand on the tile, fire the coord check
			window._fireAt = async (mapFile, v, val, tx, ty) => {
				await window.__ow.moveToMap(mapFile);
				if (v) window.__ow.Story.setVar(v, val);
				window._close();
				window.__ow.player.setTile(tx, ty);
				const fired = window.__ow.checkCoordTrigger();
				return { fired, blocking: window.__ow.cutscene.blocking || window.__ow.dialog.blocking };
			};
		});

		// 1) HOENN seed: the 7 safe vars are NOT rested; the 6 dangerous ones are
		const hoenn = await page.evaluate(() => {
			window._seed('HOENN'); const S = window.__ow.Story;
			return {
				enabled: ['VAR_ROUTE110_STATE', 'VAR_ROUTE118_STATE', 'VAR_ROUTE119_STATE', 'VAR_ROUTE121_STATE', 'VAR_PETALBURG_WOODS_STATE', 'VAR_SCOTT_PETALBURG_ENCOUNTER', 'VAR_VICTORY_ROAD_1F_STATE'].map(v => S.hasVar(v)),
				seafloor: S.getVar('VAR_SEAFLOOR_CAVERN_STATE'), skypillar: S.getVar('VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE'),
				oldale: S.getVar('VAR_OLDALE_TOWN_STATE'), petalburg: S.getVar('VAR_PETALBURG_CITY_STATE'),
			};
		});
		A(hoenn.enabled.every(x => x === false), 'HOENN: the 7 safe scene vars are no longer rested (enabled)', JSON.stringify(hoenn.enabled));
		A(hoenn.seafloor === 1 && hoenn.skypillar === 1 && hoenn.oldale === 1 && hoenn.petalburg === 1, 'HOENN: the dangerous scenes stay rested (Seafloor/SkyPillar/Oldale/Petalburg = 1)', JSON.stringify(hoenn));

		// 2) JOHTO seed: safe vars unset, dangerous ones rested
		const johto = await page.evaluate(() => {
			window._seed('JOHTO'); const S = window.__ow.Story;
			return {
				enabled: ['VAR_SCENE_VictoryRoad', 'VAR_SCENE_TeamRocketBaseB1F', 'VAR_SCENE_TeamRocketBaseB2F', 'VAR_SCENE_BurnedTowerB1F', 'VAR_SCENE_PlayersHouse1F', 'VAR_SCENE_Route27', 'VAR_SCENE_GoldenrodUndergroundSwitchRoomEntrances', 'VAR_SCENE_MountMoonSquare', 'VAR_SCENE_IndigoPlateauPokecenter1F'].map(v => S.hasVar(v)),
				newbark: S.getVar('VAR_SCENE_NewBarkTown'), port: S.getVar('VAR_SCENE_OlivinePort'), radio: S.getVar('VAR_SCENE_RadioTower5F'),
			};
		});
		A(johto.enabled.every(x => x === false), 'JOHTO: the 9 safe scene vars are no longer rested (enabled)', JSON.stringify(johto.enabled));
		A(johto.newbark === 1 && johto.port === 1 && johto.radio === 2, 'JOHTO: dangerous scenes stay rested (NewBark/OlivinePort/Radio)', JSON.stringify(johto));

		// 3) a SAFE Hoenn scene FIRES: Route 118 Steven trigger at (44,11), var 0
		const safe = await page.evaluate(() => window._fireAt('Route118', 'VAR_ROUTE118_STATE', 0, 44, 11));
		A(safe.fired === true && safe.blocking, 'a SAFE scene fires when you step on its trigger tile (Route 118 Steven)', JSON.stringify(safe));

		// 4) an UNSAFE Hoenn scene stays SUPPRESSED: Oldale block at (0,10), var rested to 1
		await page.evaluate(() => window._close());
		const unsafe = await page.evaluate(() => window._fireAt('OldaleTown', 'VAR_OLDALE_TOWN_STATE', 1, 0, 10));
		A(unsafe.fired === false && !unsafe.blocking, 'an UNSAFE scene stays suppressed (Oldale block, var rested)', JSON.stringify(unsafe));

		// 5) PLOT_ONESHOT shared-group guard: Route 27's two trigger tiles share a key,
		//    so the second tile does NOT re-fire after the first plays
		await page.evaluate(() => window._close());
		const oneShot = await page.evaluate(async () => {
			await window.__ow.moveToMap('Route27');
			window.__ow.Story.setVar('VAR_SCENE_Route27', 0);
			window._close();
			window.__ow.player.setTile(18, 10);                 // FirstStepIntoKantoLeftScene
			const first = window.__ow.checkCoordTrigger();
			window._close();
			window.__ow.player.setTile(19, 10);                 // ...RightScene (same 'jo_route27' key)
			const second = window.__ow.checkCoordTrigger();
			return { first, second, fired: [...window.__ow.firedPlot] };
		});
		A(oneShot.first === true, 'the one-shot scene fires the first time (Route 27)', JSON.stringify(oneShot));
		A(oneShot.second === false, 'the shared trigger tile does NOT re-fire the beat (one-shot group)', JSON.stringify(oneShot));
		A(oneShot.fired.includes('jo_route27'), 'the fired beat is recorded (persisted one-shot)', JSON.stringify(oneShot.fired));

		// 6) a pre-fired beat is suppressed on ANY of its tiles (Victory Road rival)
		const preFired = await page.evaluate(async () => {
			const map = window.__ow.PLOT_ONESHOT;
			const sameKey = map.VictoryRoadRivalLeft && map.VictoryRoadRivalLeft === map.VictoryRoadRivalRight;
			window.__ow.markPlotFired('jo_victoryroad_rival');
			await window.__ow.moveToMap('VictoryRoad');
			window.__ow.Story.setVar('VAR_SCENE_VictoryRoad', 0);
			window._close();
			window.__ow.player.setTile(13, 8);                  // RivalRight tile
			const fired = window.__ow.checkCoordTrigger();
			return { sameKey, fired, blocking: window.__ow.cutscene.blocking };
		});
		A(preFired.sameKey, 'both Victory Road rival tiles map to one one-shot key');
		A(preFired.fired === false && !preFired.blocking, 'a pre-fired rival beat stays suppressed on its other tile', JSON.stringify(preFired));

		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
