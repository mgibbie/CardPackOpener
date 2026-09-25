// gympuzzles_test.mjs — the evening's playtest batch, end to end:
//   * Mauville gym floor switches move the barriers (were gated on a leaked
//     VAR_TEMP_0, and the specials behind them were no-ops)
//   * Vermilion gym trash cans hold two adjacent switches (special unported,
//     `.equ` aliases read as literal var names)
//   * Wally no longer stands on the only tile south of the Mauville gym door
//     (hideobj persisted only EVENT_* flags; removeobject sets the object's own)
//   * temp vars and stray alias keys do not leak between maps
//   * a restored coordinate warp lands where the decomp says
// Everything runs through real map loads, coord triggers and interact().
//
//   node overworld/tests/gympuzzles_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- the data repairs landed ----------
{
	const S = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/scripts', f + '.json'), 'utf8'));
	const vg = JSON.stringify(S('VermilionCity_Gym'));
	A(!/SWITCH1_ID|TRASH_CAN_ID|FOUND_FIRST_SWITCH/.test(vg), 'Vermilion gym: no `.equ` alias left as a literal name');
	const house = S('Route104_MrBrineysHouse').Route104_MrBrineysHouse_EventScript_SailToDewford.find(o => o.op === 'warp');
	A(house && house.x === 13 && house.y === 51 && house.coord, 'Briney house warp carries its real coordinate (13,51)', JSON.stringify(house));
	const kurt = S('SlowpokeWellB1F')['TrainerGruntM1.Script'].find(o => o.op === 'warp');
	A(kurt && kurt.x != null && kurt.y != null, 'Crystal warps (always x,y) got their y back', JSON.stringify(kurt));
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
	const PORT = 9105;
	const STATE = { username: 'gympz', friendCode: 'GYMPZ0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let b = {}; try { b = JSON.parse(raw); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
			if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
			return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'gym-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			// the reporter's state: junk in VAR_TEMP_0 plus stray alias keys, and
			// Wally beaten under the old hide rule (his hide flags never written)
			if (!localStorage.getItem('magepunk_story'))
				localStorage.setItem('magepunk_story', JSON.stringify({
					flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_DEFEATED_WALLY_MAUVILLE: true },
					vars: { VAR_TEMP_0: 'SWITCH1_ID', VAR_TEMP_1: 'SWITCH2_ID', SWITCH1_ID: 'SWITCH1_ID', TRASH_CAN_ID: 5 } }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'mudkip', name: 'MUDKIP', level: 60, gender: 'M', friend: 70, types: ['Water'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 200, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 200, curHP: 200,
				exp: 200000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's258.png', num: 258,
			}]));
		}, STATE);

		const boot = async (map, x, y) => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}` + (x != null ? `&x=${x}&y=${y}` : ''), { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
			await sleep(1500);
		};
		const settle = async (ms = 15000) => {
			const t = Date.now();
			while (Date.now() - t < ms) {
				const st = await page.evaluate(() => ({ d: !!window.__ow.dialog.blocking, c: !!window.__ow.cutscene.blocking }));
				if (!st.d && !st.c) return;
				await page.evaluate(() => { try { window.__ow.dialog.key('z'); } catch (e) {} });
				await sleep(60);
			}
		};
		// BFS over what the ENGINE says is walkable, to any tile next to `to`
		const reach = (from, to) => page.evaluate((from, to) => {
			const W = window.__ow, lay = W.world.current.layout, seen = new Set([from.join()]), q = [from];
			const ok = (x, y) => x >= 0 && y >= 0 && x < lay.width && y < lay.height && W.world.isPassable(x, y) && !W.world.isSurfable(x, y);
			while (q.length) {
				const [x, y] = q.shift();
				if (Math.abs(x - to[0]) + Math.abs(y - to[1]) === 1) return true;
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
					if (!seen.has(k) && ok(nx, ny)) { seen.add(k); q.push([nx, ny]); }
				}
			}
			return false;
		}, from, to);
		const grid = () => page.evaluate(() => window.__ow.world.current.layout.map.slice(5, 17).map(r => r.slice(0, 9).map(v => v & 0x3FF).join(',')).join('|'));

		// ===== Wally: the one-time save repair =====
		await boot('MauvilleCity', 8, 4);
		const wally = await page.evaluate(() => ({
			f1: !!window.__ow.Story.getFlag('FLAG_HIDE_MAUVILLE_CITY_WALLY'),
			f2: !!window.__ow.Story.getFlag('FLAG_HIDE_MAUVILLE_CITY_WALLYS_UNCLE'),
			present: (window.__ow.npcs?.list || []).some(n => /WALLY/.test(n.ev.local_id || '') && !n.hidden),
		}));
		A(wally.f1 && wally.f2, 'a save with Wally beaten gets his hide flags back', JSON.stringify(wally));
		A(!wally.present, 'and Wally no longer stands outside the gym door', JSON.stringify(wally));

		// ===== temp vars do not leak =====
		const temps = await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('magepunk_story')).vars; return { t0: v.VAR_TEMP_0, t1: v.VAR_TEMP_1, s1: v.SWITCH1_ID, s2: v.TRASH_CAN_ID }; });
		A(temps.t0 === undefined && temps.t1 === undefined, 'VAR_TEMP_* is cleared on map load', JSON.stringify(temps));
		A(temps.s1 === undefined && temps.s2 === undefined, 'and stray alias keys are swept', JSON.stringify(temps));

		// ===== restored coordinate warp lands exactly =====
		await page.evaluate(() => window.__ow.cutscene.run({ W: [{ op: 'warp', map: 'MAP_ROUTE104', warp: 13, x: 13, y: 51, coord: true }] }, 'W', window.__ow.cutsceneCtxForTest(), () => {}));
		await sleep(3000);
		const landed = await page.evaluate(() => ({ map: window.__ow.world.current.name, at: [window.__ow.player.tx, window.__ow.player.ty] }));
		A(landed.map === 'Route104' && landed.at[0] === 13 && landed.at[1] === 51,
			'`warp MAP_ROUTE104, 13, 51` lands at (13,51), not at door 0', JSON.stringify(landed));

		// ===== hideobj sets an Emerald object's FLAG_HIDE_* (the root of the Wally bug) =====
		// Route 104's Mr Briney is a loaded Emerald object carrying a FLAG_HIDE_* flag
		const brineyBefore = await page.evaluate(() => {
			const W = window.__ow; W.Story.clearFlag('FLAG_HIDE_ROUTE_104_MR_BRINEY');
			return (W.npcs?.list || []).some(n => n.ev.local_id === 'LOCALID_ROUTE104_BRINEY');
		});
		A(brineyBefore, 'setup: an Emerald object with a FLAG_HIDE_* flag is on the map');
		await page.evaluate(() => { const W = window.__ow; W.cutscene.run({ T: [{ op: 'hideobj', who: 'LOCALID_ROUTE104_BRINEY' }, { op: 'end' }] }, 'T', W.cutsceneCtxForTest(), () => {}); });
		A(await page.evaluate(() => !!window.__ow.Story.getFlag('FLAG_HIDE_ROUTE_104_MR_BRINEY')),
			'hideobj on an Emerald object sets its FLAG_HIDE_* flag, as removeobject does');

		// ===== Mauville gym: switches move the barriers and open a path =====
		await boot('MauvilleCity_Gym', 5, 19);
		const wattson = [5, 2];
		const start = await page.evaluate(() => [window.__ow.player.tx, window.__ow.player.ty]);
		A(!(await reach(start, wattson)), 'setup: Wattson starts walled off', JSON.stringify(start));
		const before = await grid();
		let opened = null, firstState = null, firstChanged = null;
		for (const [i, [sx, sy]] of [[0, 15], [4, 12], [3, 9], [8, 9]].entries()) {
			// step onto the switch from below, as a player does; coord triggers fire on arrival
			await page.evaluate((x, y) => { const p = window.__ow.player; p.tx = x; p.ty = y + 1; p.px = x * 16; p.py = (y + 1) * 16; p.facing = 'up'; p.moving = false; }, sx, sy);
			await page.evaluate(() => { try { window.__ow.pumpPlayer('up', 0.5); } catch (e) {} });
			await sleep(700); await settle();
			if (i === 0) {
				firstState = await page.evaluate(() => window.__ow.Story.getVar('VAR_MAUVILLE_GYM_STATE'));
				firstChanged = (await grid()) !== before;
			}
			const here = await page.evaluate(() => [window.__ow.player.tx, window.__ow.player.ty]);
			if (opened == null && await reach(here, wattson)) opened = i + 1;
		}
		A(firstState !== 0, 'stepping on a switch fires its trigger (was gated on leaked VAR_TEMP_0)', 'state=' + firstState);
		A(firstChanged, 'and the barriers actually change');
		A(opened != null, 'the switches open a walkable path to Wattson', 'opened after switch ' + opened);

		// ===== Vermilion gym: two adjacent switches in the cans =====
		await boot('VermilionCity_Gym', 5, 17);
		const cans = await page.evaluate(() => ({ a: window.__ow.Story.getVar('VAR_0x8004'), b: window.__ow.Story.getVar('VAR_0x8005') }));
		const d = Math.abs(cans.a - cans.b);
		A(cans.a >= 1 && cans.a <= 15 && (d === 1 || d === 5), 'the trash cans are dealt two adjacent switches', JSON.stringify(cans));
		const canXY = n => [1 + 2 * ((n - 1) % 5), 10 + 2 * Math.floor((n - 1) / 5)];
		const pressCan = async n => {
			const [x, y] = canXY(n);
			await page.evaluate((x, y) => { const W = window.__ow, p = W.player; p.tx = x; p.ty = y + 1; p.px = x * 16; p.py = (y + 1) * 16; p.facing = 'up'; p.moving = false; W.interact(); }, x, y);
			await sleep(300); await settle();
		};
		await pressCan(cans.a);
		A(await page.evaluate(() => !!window.__ow.Story.getFlag('FLAG_TEMP_1')), 'the first switch is found in its can');
		// the beams block Surge before the switches (a real wall, not just a flag)
		const surge = [5, 2];
		A(!(await reach([5, 17], surge)), 'setup: Lt. Surge starts behind the beams');
		await pressCan(cans.b);
		A(await page.evaluate(() => !!window.__ow.Story.getFlag('FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES')), 'and the second one sets the both-found flag');
		// The flag alone proved nothing: every scripted setmetatile named its tile
		// ("METATILE_VermilionGym_Floor"), the engine ANDed the string to 0, and the
		// "opened" beams became impassable void (playtest 2026-09-25).
		const beam = await page.evaluate(() => ({ mid: window.__ow.world.isPassable(5, 6), low: window.__ow.world.isPassable(5, 7), tile: window.__ow.world.current.layout.map[6][5] & 0x3FF }));
		A(beam.mid && beam.low && beam.tile !== 0, 'the beam tiles really become walkable floor (not metatile 0)', JSON.stringify(beam));
		A(await reach([5, 17], surge), 'and there is now a walkable path to Lt. Surge');
		// the tester's state: both switches found on an earlier visit, Surge unbeaten.
		// On re-entry the gym's ON_LOAD re-opens the beams from the flag.
		await boot('VermilionCity_Gym', 5, 17);
		const back = await page.evaluate(() => ({ flag: !!window.__ow.Story.getFlag('FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES'), mid: window.__ow.world.isPassable(5, 6), low: window.__ow.world.isPassable(5, 7) }));
		A(back.flag && back.mid && back.low, 'returning with both switches already found, the beams are open on load', JSON.stringify(back));
		A(await reach([5, 17], surge), '...and Lt. Surge is reachable (the reported save state)');
		A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
