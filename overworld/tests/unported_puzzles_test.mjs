// unported_puzzles_test.mjs — six puzzle / special mechanics whose `special`s the
// port's scripts called with no handler (a sweep of runSpecial's default), each
// checked in the running game:
//
//   1. PETALBURG GYM  PetalburgGymSlideOpenRoomDoors / PetalburgGymUnlockRoomDoors:
//      beating a room's trainer slides its doors open, and the gym's ON_LOAD
//      re-opens every beaten room's doors on re-entry. The doors only ever drew shut
//      (the ON_LOAD never ran: the gym was not in ONLOAD_MAPS).
//   2. ROTATING GATES  RotatingGate_InitPuzzle (Fortree Gym, Trick House 6): the
//      gates did not exist. Now the ON_TRANSITION lays them out, a push turns one,
//      a blocked one stops you, and WINONA is reached by walking the gym with the
//      gates in their original layout (a path the node solver finds, replayed here
//      key by key). The pure rules: rotating_gates_test.mjs.
//   3. MIRAGE ISLAND  IsMirageIslandPresent answered 0. Emerald's rule: up when a
//      party mon's personality (low 16 bits) equals the day's VAR_MIRAGE_RND_H. Then
//      Route 130 gets LAYOUT_ROUTE130_MIRAGE_ISLAND and the LIECHI tree; without it
//      the tree (hidden by its flag) must not stand in the sea. A day passing steps
//      the value (ISO_RANDOMIZE2).
//   4. MIRAGE TOWER  SetMirageTowerVisibility: the tower never appeared (the
//      NO_MIRAGE_TOWER layout every time) yet its door warped from bare sand. Now:
//      visible on a coin flip / after you have been in; take a 4F fossil, land on
//      Route 111, the tower collapses (state 2, the Underpass fossil appears, sand
//      where it stood), and it never comes back (state 3). The Underpass gives the
//      other fossil. A save that chose through the old native stand-in carries over.
//   5. ICEFALL CAVE  SetIcefallCaveCrackedIceMetatiles + the dropped STEP_CB_ICE: thin
//      ice cracks under you, cracked ice breaks and drops you to B1F at the same spot;
//      the ON_LOAD re-cracks what the temp flags remember; re-entering, it is whole.
//   6. SHOAL CAVE  UpdateShoalTideFlag: the tide latches as you walk in from Route
//      125 (the entrance room's high-tide layout) and holds inside. The SHOAL SALT /
//      SHELL spots are FLAG_RECEIVED_SHOAL_*, drawn by the rooms' ON_LOAD; a new day
//      (FLAG_SYS_SHOAL_ITEM) and a word with the SHELL BELL man put them back.
//
//   node overworld/tests/unported_puzzles_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as RG from '../rotating_gates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9774;
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = k => !ONLY.length || ONLY.includes(k);
const STATE = { username: 'puzzles', friendCode: 'PZL001', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, num, moves, extra = {}) => ({
	speciesId, name, level: 60, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 120, def: 110, spa: 100, spd: 100, spe: 110 }, maxHP: 200, curHP: 200,
	exp: 220000, moves: moves.map(id => ({ id, name: id.toUpperCase(), pp: 15, maxPp: 15 })), sprite: `s${num}.png`, num, ...extra,
});
const LEAD = (extra) => mon('swampert', 'SWAMPERT', 260, ['surf', 'strength', 'rocksmash', 'waterfall'], extra);
const ALL = ids => Object.fromEntries(ids.map(id => [id, true]));
const BADGES = {
	badges: {
		HOENN: ALL(['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain']),
		KANTO: ALL(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']),
	},
	champion: { HOENN: true, KANTO: true },
};
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
async function boot({ map, x, y, region = 'hoenn', party = [LEAD()], flags = {}, vars = {}, misc = null, random = null }) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, region, flags, vars, badges, misc, random) => {
		if (random != null) Math.random = () => random;
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		if (misc) localStorage.setItem('magepunk_events_v1', JSON.stringify(misc));
	}, STATE, party, region, flags, vars, BADGES, misc, random);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	return { page, ctx, errors };
}
const settle = (page, key = 'z') => page.evaluate(async key => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 15000) {
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001 && !O.player.moving && !O.loading) { if (++calm >= 10) return 'idle'; } else calm = 0;
		if (d) press(key);
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
}, key);
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, facing: window.__ow.player.facing, outcome: window.__ow.player.moveOutcome }));
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function step(page, dir) {
	const before = await pos(page);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		const p = await pos(page);
		if (p.x !== before.x || p.y !== before.y || p.map !== before.map) break;
		if (i > 4 && p.facing === dir) break;   // a bump: turned, didn't move
		await sleep(15);
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 60 && await page.evaluate(() => window.__ow.player.moving || !!window.__ow.loading); i++) await sleep(20);
	await sleep(60);
	await settle(page);
}
const flag = (page, f) => page.evaluate(f => !!window.__ow.Story.getFlag(f), f);
const tile = (page, x, y) => page.evaluate((x, y) => { const v = window.__ow.world.current.layout.map[y][x]; return { id: v & 0x3FF, solid: (v & 0xC00) !== 0 }; }, x, y);
async function waitMap(page, name, ms = 12000) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms && (await pos(page)).map !== name) await sleep(100);
	await sleep(400); await settle(page);
	return (await pos(page)).map === name;
}
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--mute-audio', '--disable-gpu'] });

	// ---------------- 1. Petalburg Gym ----------------
	if (want('petalburg')) {
		const SLID = 0x21C, SHUT = 0x218;
		{
			// state 6 (all four badges), RANDALL (the Speed Room) beaten
			const { page, ctx, errors } = await boot({ map: 'PetalburgCity_Gym', x: 4, y: 110, vars: { VAR_PETALBURG_GYM_STATE: 6 }, flags: { trainer_beaten_RANDALL: true } });
			const speed = [await tile(page, 1, 78), await tile(page, 1, 79), await tile(page, 7, 78)];
			A(speed[0].id === SLID && speed[1].id === SLID + 8 && speed[2].id === SLID, '1. re-entering: the beaten SPEED ROOM\'s doors are open (ON_LOAD -> PetalburgGymUnlockRoomDoors)', JSON.stringify(speed));
			A(speed.every(t => t.solid), '1. ...and still a door you talk to, not walk through (impassable, as the decomp)');
			const acc = await tile(page, 1, 91);
			A(acc.id === SHUT, '1. MARY not beaten: the ACCURACY ROOM stays shut', JSON.stringify(acc));
			const entrance = await tile(page, 1, 104);
			A(entrance.id === SLID, '1. state 6: the entrance room\'s doors are open', JSON.stringify(entrance));
			// beating PARKER runs his post-battle script: the CONFUSION ROOM door slides
			const slide = await page.evaluate(async () => {
				const O = window.__ow;
				const frames = [];
				O.runScriptLabel('PetalburgCity_Gym_EventScript_SlideOpenConfusionRoomDoors');
				for (let i = 0; i < 40; i++) { frames.push(O.world.current.layout.map[39][7] & 0x3FF); if (!O.cutscene.blocking) break; await new Promise(r => setTimeout(r, 15)); }
				return { frames: [...new Set(frames)], blocking: O.cutscene.blocking, last: O.world.current.layout.map[39][7] & 0x3FF, lower: O.world.current.layout.map[40][7] & 0x3FF };
			});
			A(slide.last === SLID && slide.lower === SLID + 8, '1. beating the room\'s trainer slides its door open', JSON.stringify(slide));
			A(slide.frames.length >= 2, '1. ...frame by frame (the script waits for the slide)', JSON.stringify(slide.frames));
			A(!errors.length, '1. no page errors', errors.join(' | '));
			await ctx.close();
		}
		{
			const { page, ctx } = await boot({ map: 'PetalburgCity_Gym', x: 4, y: 110, vars: { VAR_PETALBURG_GYM_STATE: 7 } });
			const doors = await page.evaluate(() => [[1, 104], [7, 104], [1, 78], [7, 78], [1, 91], [7, 91], [7, 39], [1, 52], [7, 52], [1, 65], [7, 13], [1, 26]]
				.map(([x, y]) => window.__ow.world.current.layout.map[y][x] & 0x3FF));
			A(doors.every(d => d === SLID), '1. NORMAN beaten (state 7): every room\'s doors are open', JSON.stringify(doors.map(d => d.toString(16))));
			await ctx.close();
		}
	}

	// ---------------- 2. Rotating gates ----------------
	if (want('gates')) {
		const name = 'FortreeCity_Gym';
		const m = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', name + '_map.json'), 'utf8'));
		const L = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', m.layout + '.json'), 'utf8'));
		const col = (x, y) => (x < 0 || y < 0 || x >= L.width || y >= L.height) ? 1 : (L.map[y][x] >> 10) & 3;
		const objs = new Set(m.object_events.map(o => o.x + ',' + o.y));
		// node-side solver: BFS over (x, y, orientations), recording the path
		const st = { vars: {}, getVar(v) { return this.vars[v] || 0; }, setVar(v, x) { this.vars[v] = x; } };
		RG.initPuzzle(st, name);
		const snap = () => JSON.stringify(st.vars), load = s => { st.vars = JSON.parse(s); };
		const start = [15, 23], goal = [15, 3];
		const seen = new Map(); const q = [[start[0], start[1], snap()]];
		seen.set(start.join(',') + '|' + snap(), null);
		let end = null;
		const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
		while (q.length && !end) {
			const [x, y, s] = q.shift();
			for (const [dir, [dx, dy]] of Object.entries(D)) {
				const nx = x + dx, ny = y + dy;
				if (col(nx, ny) || objs.has(nx + ',' + ny)) continue;
				load(s);
				if (RG.checkGateCollision(st, name, dir, nx, ny, col, { animate: false })) continue;
				const k = nx + ',' + ny + '|' + snap();
				if (seen.has(k)) continue;
				seen.set(k, { from: x + ',' + y + '|' + s, dir });
				if (nx === goal[0] && ny === goal[1]) { end = k; break; }
				q.push([nx, ny, snap()]);
			}
		}
		const route = [];
		for (let k = end; k && seen.get(k); k = seen.get(k).from) route.unshift(seen.get(k).dir);
		const finalVars = end ? JSON.parse(end.split('|')[1]) : null;
		A(!!end && route.length > 10, `2. the solver finds a way to WINONA through the original gates (${route.length} steps)`);

		const { page, ctx, errors } = await boot({ map: name, x: start[0], y: start[1] });
		// the gym's trainers would stop the walk for battles: beaten (they keep their tiles in the solver)
		await page.evaluate(() => { const O = window.__ow; for (const t of O.trainers.list) if (!/Winona/.test(t.ev?.script || '')) O.trainers.markDefeated(t); });
		const init = await page.evaluate(async () => {
			const RGm = await import('/overworld/rotating_gates.js');
			const O = window.__ow;
			return { o: RGm.FORTREE_GATES.map((_, i) => RGm.getOrientation(O.Story, i)), want: RGm.FORTREE_GATES.map(g => g.orientation) };
		});
		A(JSON.stringify(init.o) === JSON.stringify(init.want), '2. entering the gym lays the gates out as the decomp (RotatingGate_InitPuzzle)', JSON.stringify(init));
		// a gate in the way at the start: find a refused step near the door and try it in the game
		const blockTry = await page.evaluate(async () => {
			const RGm = await import('/overworld/rotating_gates.js');
			const O = window.__ow, W = O.world;
			const col = (x, y) => { const v = W.gridAt(x, y); return v == null ? 1 : (v >> 10) & 3; };
			const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
			const vars0 = JSON.stringify(['VAR_TEMP_0', 'VAR_TEMP_1', 'VAR_TEMP_2', 'VAR_TEMP_3'].map(v => O.Story.getVar(v)));
			// probe without changing anything: a copy of the vars
			for (let y = 1; y < 24; y++) for (let x = 1; x < 19; x++) for (const [dir, [dx, dy]] of Object.entries(D)) {
				if (col(x, y) || col(x + dx, y + dy)) continue;
				const st = { vars: {}, getVar(v) { return this.vars[v] ?? O.Story.getVar(v); }, setVar(v, n) { this.vars[v] = n; } };
				if (RGm.checkGateCollision(st, 'FortreeCity_Gym', dir, x + dx, y + dy, col, { animate: false })) return { x, y, dir, vars0 };
			}
			return null;
		});
		A(!!blockTry, '2. somewhere a gate cannot turn (an arm would sweep a wall)', JSON.stringify(blockTry));
		if (blockTry) {
			await page.evaluate(({ x, y }) => { const p = window.__ow.player; p.setTile(x, y); }, blockTry);
			await step(page, blockTry.dir);
			const p = await pos(page);
			A(p.x === blockTry.x && p.y === blockTry.y && p.outcome === 'gate', '2. ...and walking into it there is refused by the gate', JSON.stringify(p));
			const vars1 = await page.evaluate(() => JSON.stringify(['VAR_TEMP_0', 'VAR_TEMP_1', 'VAR_TEMP_2', 'VAR_TEMP_3'].map(v => window.__ow.Story.getVar(v))));
			A(vars1 === blockTry.vars0, '2. ...without turning it', vars1);
			// back to the door, gates reset as on entry
			await page.evaluate(async () => { const O = window.__ow; await O.moveToMap('FortreeCity_Gym', 15, 23); });
			await settle(page);
			await page.evaluate(() => { const O = window.__ow; for (const t of O.trainers.list) if (!/Winona/.test(t.ev?.script || '')) O.trainers.markDefeated(t); });
		}
		const reset = await page.evaluate(async () => {
			const RGm = await import('/overworld/rotating_gates.js');
			return RGm.FORTREE_GATES.every((g, i) => RGm.getOrientation(window.__ow.Story, i) === g.orientation);
		});
		A(reset, '2. re-entering the gym puts every gate back (temp vars, InitPuzzle)');
		// walk it, key by key
		let ok = true, at = null, turned = 0;
		for (let i = 0; i < route.length; i++) {
			const before = await page.evaluate(() => ['VAR_TEMP_0', 'VAR_TEMP_1', 'VAR_TEMP_2', 'VAR_TEMP_3'].map(v => window.__ow.Story.getVar(v)).join());
			await step(page, route[i]);
			const after = await page.evaluate(() => ['VAR_TEMP_0', 'VAR_TEMP_1', 'VAR_TEMP_2', 'VAR_TEMP_3'].map(v => window.__ow.Story.getVar(v)).join());
			if (after !== before) turned++;
			at = await pos(page);
			if (at.map !== name) { ok = false; break; }
		}
		A(ok && at && at.x === goal[0] && at.y === goal[1], '2. walking that route in the game reaches WINONA\'s square', JSON.stringify(at));
		A(turned > 0, `2. ...turning gates on the way (${turned} pushes)`);
		const fin = await page.evaluate(() => ['VAR_TEMP_0', 'VAR_TEMP_1', 'VAR_TEMP_2', 'VAR_TEMP_3'].map(v => window.__ow.Story.getVar(v)));
		A(finalVars && JSON.stringify(fin) === JSON.stringify(['VAR_TEMP_0', 'VAR_TEMP_1', 'VAR_TEMP_2', 'VAR_TEMP_3'].map(v => finalVars[v] || 0)), '2. ...and the gates end where the solver says', JSON.stringify(fin));
		// the arms are drawn (the decomp's own pictures)
		const drawn = await page.evaluate(async () => {
			const O = window.__ow;
			const imgs = await Promise.all(['t1', 't2', 'l4'].map(n => new Promise(r => { const im = new Image(); im.onload = () => r(im.width); im.onerror = () => r(0); im.src = `/overworld/fx/rotating_gates/${n}.png`; })));
			return imgs;
		});
		A(drawn.every(w => w > 0), '2. the gate pictures ship (fx/rotating_gates)', JSON.stringify(drawn));
		if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'fortree_gates.png') });
		A(!errors.length, '2. no page errors', errors.join(' | '));
		await ctx.close();

		// Trick House Puzzle 6 sets its own up the same way
		const th = await boot({ map: 'Route110_TrickHousePuzzle6', x: 1, y: 20 });
		const thInit = await th.page.evaluate(async () => {
			const RGm = await import('/overworld/rotating_gates.js');
			return RGm.TRICK_HOUSE_GATES.every((g, i) => RGm.getOrientation(window.__ow.Story, i) === g.orientation);
		});
		A(thInit, '2. TRICK HOUSE 6: its ON_TRANSITION lays out its eleven gates');
		await th.ctx.close();
	}

	// ---------------- 3. Mirage Island ----------------
	if (want('island')) {
		const H = 0x4D2A;
		{
			// a party mon whose personality's low half is today's VAR_MIRAGE_RND_H
			const { page, ctx, errors } = await boot({ map: 'Route130', x: 30, y: 20, party: [LEAD({ personality: (0x1234 << 16) | H })], vars: { VAR_DAYS: today(), VAR_MIRAGE_RND_H: H, VAR_MIRAGE_RND_L: 7 } });
			const r = await page.evaluate(() => { const O = window.__ow; return { layout: O.world.current.layout.id, trees: (O.items.liveTrees ? O.items.liveTrees() : O.items.trees).length, solid: O.items.occupied(52, 9) }; });
			A(r.layout === 'LAYOUT_ROUTE130_MIRAGE_ISLAND', '3. the matching personality raises MIRAGE ISLAND on Route 130', JSON.stringify(r));
			A(r.trees === 1 && r.solid, '3. ...with its LIECHI tree standing', JSON.stringify(r));
			const pick = await page.evaluate(() => window.__ow.items.interactAt(52, 9) || '');
			A(/LIECHI/.test(pick), '3. ...and the LIECHI BERRY can be picked', pick);
			A(!errors.length, '3. no page errors', errors.join(' | '));
			await ctx.close();
		}
		{
			const { page, ctx } = await boot({ map: 'Route130', x: 30, y: 20, party: [LEAD({ personality: (0x1234 << 16) | (H ^ 1) })], vars: { VAR_DAYS: today(), VAR_MIRAGE_RND_H: H, VAR_MIRAGE_RND_L: 7 } });
			const r = await page.evaluate(() => { const O = window.__ow; return { layout: O.world.current.layout.id, trees: (O.items.liveTrees ? O.items.liveTrees() : O.items.trees).length, solid: O.items.occupied(52, 9), pick: O.items.interactAt(52, 9) }; });
			A(r.layout === 'LAYOUT_ROUTE130' && r.trees === 0 && !r.solid && !r.pick, '3. no match: open sea, and no tree standing in it', JSON.stringify(r));
			await ctx.close();
		}
		{
			// a day passed: the value steps once (ISO_RANDOMIZE2); a mon with no
			// personality gets one, saved
			const { page, ctx } = await boot({ map: 'Route130', x: 30, y: 20, party: [LEAD()], vars: { VAR_DAYS: today() - 1, VAR_MIRAGE_RND_H: 0x0102, VAR_MIRAGE_RND_L: 0x0304 } });
			const r = await page.evaluate(() => {
				const O = window.__ow, S = O.Story;
				const p = JSON.parse(localStorage.getItem('magepunk_party_v1'))[0];
				return { h: S.getVar('VAR_MIRAGE_RND_H'), l: S.getVar('VAR_MIRAGE_RND_L'), days: S.getVar('VAR_DAYS'), shoal: !!S.getFlag('FLAG_SYS_SHOAL_ITEM'), pers: p.personality };
			});
			const want = (Math.imul(0x01020304, 1103515245) + 12345) >>> 0;
			A(r.h === (want >>> 16) && r.l === (want & 0xFFFF) && r.days === today(), '3. a new day steps the Mirage value once (ISO_RANDOMIZE2)', JSON.stringify(r));
			A(Number.isInteger(r.pers), '3. a mon from before personality values gets one, kept in the save', JSON.stringify(r));
			await ctx.close();
		}
	}

	// ---------------- 4. Mirage Tower ----------------
	if (want('tower')) {
		{
			// forced visible (you have been inside): the tower stands and its door works
			const { page, ctx, errors } = await boot({ map: 'Route111', x: 19, y: 60, flags: { FLAG_FORCE_MIRAGE_TOWER_VISIBLE: true } });
			const r = await page.evaluate(() => ({ vis: !!window.__ow.Story.getFlag('FLAG_MIRAGE_TOWER_VISIBLE'), layout: window.__ow.world.current.layout.id }));
			A(r.vis && r.layout === 'LAYOUT_ROUTE111', '4. the tower stands on Route 111 (SetMirageTowerVisibility)', JSON.stringify(r));
			await step(page, 'up'); await step(page, 'up');
			A(await waitMap(page, 'MirageTower_1F'), '4. ...and its door takes you in', JSON.stringify(await pos(page)));
			A(await flag(page, 'FLAG_FORCE_MIRAGE_TOWER_VISIBLE'), '4. 1F keeps it in view for your way back out');
			A(!errors.length, '4. no page errors', errors.join(' | '));
			await ctx.close();
		}
		{
			// the coin flip: an even Random() hides it, and then the sand is just sand
			const { page, ctx } = await boot({ map: 'Route111', x: 19, y: 60, random: 0.25 });
			const r = await page.evaluate(() => ({ vis: !!window.__ow.Story.getFlag('FLAG_MIRAGE_TOWER_VISIBLE'), layout: window.__ow.world.current.layout.id }));
			A(!r.vis && r.layout === 'LAYOUT_ROUTE111_NO_MIRAGE_TOWER', '4. on an even coin flip it is not there', JSON.stringify(r));
			await step(page, 'up'); await step(page, 'up');
			const p = await pos(page);
			await sleep(800);
			A((await pos(page)).map === 'Route111' && p.y === 58, '4. ...and walking over where its door would be is just walking on sand', JSON.stringify(p));
			await ctx.close();
		}
		{
			const { page, ctx } = await boot({ map: 'Route111', x: 19, y: 60, random: 0.25 + 1 / 65536 });
			A(await flag(page, 'FLAG_MIRAGE_TOWER_VISIBLE'), '4. an odd coin flip shows it');
			await ctx.close();
		}
		{
			// 4F: take the ROOT FOSSIL -> collapse -> Route 111
			const { page, ctx, errors } = await boot({ map: 'MirageTower_4F', x: 5, y: 5, flags: { FLAG_FORCE_MIRAGE_TOWER_VISIBLE: true, FLAG_HIDE_DESERT_UNDERPASS_FOSSIL: true, FLAG_HIDE_ROUTE_111_PLAYER_DESCENT: true } });
			await page.evaluate(() => { const p = window.__ow.player; p.facing = 'up'; });
			await page.evaluate(() => window.__ow.interact());
			const started = await page.evaluate(() => window.__ow.dialog.blocking || window.__ow.cutscene.blocking);
			A(started, '4. 4F: the ROOT FOSSIL answers (its own script)');
			await settle(page, 'z');   // the text, YES, the collapse, the warp, the disintegration scene
			A(await waitMap(page, 'Route111', 20000), '4. taking it brings the ceiling down and puts you on Route 111', JSON.stringify(await pos(page)));
			await settle(page, 'z');
			await sleep(500); await settle(page, 'z');
			const r = await page.evaluate(() => {
				const O = window.__ow, S = O.Story, L = O.world.current.layout.map;
				return {
					root: O.Bag.count('rootfossil'), claw: O.Bag.count('clawfossil'), state: S.getVar('VAR_MIRAGE_TOWER_STATE'),
					chose: !!S.getFlag('FLAG_CHOSE_ROOT_FOSSIL'), underpassHidden: !!S.getFlag('FLAG_HIDE_DESERT_UNDERPASS_FOSSIL'),
					clawHidden: !!S.getFlag('FLAG_HIDE_MIRAGE_TOWER_CLAW_FOSSIL'), sand: [L[55][19] & 0x3FF, L[58][19] & 0x3FF], at: [O.player.tx, O.player.ty],
				};
			});
			A(r.root === 1 && r.claw === 0 && r.chose && r.clawHidden, '4. you have the ROOT FOSSIL; the CLAW is gone with the tower', JSON.stringify(r));
			A(r.state === 2 && !r.underpassHidden, '4. the tower is down (state 2) and the other fossil is in the Desert Underpass', JSON.stringify(r));
			A(r.sand[0] === 0x251 && r.sand[1] === 0x121, '4. sand where the tower stood (SetInvisibleMirageTowerMetatiles)', JSON.stringify(r.sand));
			// come back: it never stands again
			await page.evaluate(async () => { await window.__ow.moveToMap('Route111', 19, 60); });
			await settle(page);
			const back = await page.evaluate(() => ({ state: window.__ow.Story.getVar('VAR_MIRAGE_TOWER_STATE'), vis: !!window.__ow.Story.getFlag('FLAG_MIRAGE_TOWER_VISIBLE'), layout: window.__ow.world.current.layout.id }));
			A(back.state === 3 && !back.vis && back.layout === 'LAYOUT_ROUTE111_NO_MIRAGE_TOWER', '4. back on Route 111: no tower, for good (state 3)', JSON.stringify(back));
			await step(page, 'up'); await step(page, 'up');
			await sleep(600);
			A((await pos(page)).map === 'Route111', '4. ...and no door into it');
			// the Desert Underpass: the CLAW FOSSIL
			await page.evaluate(async () => { const O = window.__ow; await O.moveToMap('DesertUnderpass', 132, 11); O.player.facing = 'up'; });
			await settle(page);
			await page.evaluate(() => window.__ow.interact());
			await settle(page, 'z');
			const up = await page.evaluate(() => ({ claw: window.__ow.Bag.count('clawfossil'), hidden: !!window.__ow.Story.getFlag('FLAG_HIDE_DESERT_UNDERPASS_FOSSIL') }));
			A(up.claw === 1 && up.hidden, '4. the Desert Underpass gives the CLAW FOSSIL, once', JSON.stringify(up));
			A(!errors.length, '4. no page errors', errors.join(' | '));
			await ctx.close();
		}
		{
			// a save that chose through the old native stand-in (miscEvents.mirage)
			const { page, ctx } = await boot({ map: 'Route111', x: 19, y: 60, misc: { mirage: 'claw' }, flags: { FLAG_HIDE_DESERT_UNDERPASS_FOSSIL: true } });
			const r = await page.evaluate(() => {
				const S = window.__ow.Story;
				return { claw: !!S.getFlag('FLAG_CHOSE_CLAW_FOSSIL'), state: S.getVar('VAR_MIRAGE_TOWER_STATE'), underpass: !S.getFlag('FLAG_HIDE_DESERT_UNDERPASS_FOSSIL'), layout: window.__ow.world.current.layout.id };
			});
			A(r.claw && r.state === 3 && r.underpass && r.layout === 'LAYOUT_ROUTE111_NO_MIRAGE_TOWER', '4. an old native choice carries over: tower gone, the ROOT FOSSIL waits in the Underpass', JSON.stringify(r));
			await ctx.close();
		}
	}

	// ---------------- 5. Icefall Cave ----------------
	if (want('ice')) {
		const { page, ctx, errors } = await boot({ map: 'FourIsland_IcefallCave_1F', x: 7, y: 9, region: 'kanto' });
		const thin = await page.evaluate(() => [window.__ow.world.behaviorAt(8, 9), window.__ow.world.behaviorAt(9, 9)]);
		A(thin[0] === 0x26 && thin[1] === 0x26, '5. 1F\'s ice squares are THIN ICE', JSON.stringify(thin));
		await step(page, 'right');
		let p = await pos(page);
		const t1 = await tile(page, 8, 9);
		A(p.x === 8 && p.y === 9 && t1.id === 0x35A, '5. stepping on thin ice cracks it', JSON.stringify({ p, t1 }));
		A(await flag(page, 'FLAG_TEMP_4'), '5. ...remembered in its temp flag (FLAG_TEMP_4 for (8,9))');
		await step(page, 'right');
		p = await pos(page);
		A(p.x === 9 && p.y === 9 && (await tile(page, 9, 9)).id === 0x35A && !(await page.evaluate(() => window.__ow.loading)), '5. the next one cracks too; no fall yet', JSON.stringify(p));
		await step(page, 'left');   // back onto the cracked (8,9): it breaks
		const fell = await waitMap(page, 'FourIsland_IcefallCave_B1F', 6000);
		p = await pos(page);
		A(fell && p.x === 8 && p.y === 9, '5. stepping on cracked ice breaks it: you fall to B1F at the same spot', JSON.stringify(p));
		// coming back up: the ice is whole (temp flags cleared by the warp)
		await page.evaluate(async () => { await window.__ow.moveToMap('FourIsland_IcefallCave_1F', 7, 9); });
		await settle(page);
		const whole = await page.evaluate(() => [8, 9].map(x => window.__ow.world.current.layout.map[9][x] & 0x3FF));
		A(whole.every(v => v === 0x359), '5. back on 1F the ice is whole again', JSON.stringify(whole));
		// the ON_LOAD's special re-cracks what the temp flags hold (a reload without a warp)
		const onload = await page.evaluate(async () => {
			const O = window.__ow;
			const { runSpecial } = await import('/overworld/ow_story.js');
			O.Story.setFlag('FLAG_TEMP_1'); O.Story.setFlag('FLAG_TEMP_9');
			runSpecial('SetIcefallCaveCrackedIceMetatiles');
			const L = O.world.current.layout.map;
			return [L[3][8] & 0x3FF, L[14][8] & 0x3FF, L[5][10] & 0x3FF];
		});
		A(onload[0] === 0x35A && onload[1] === 0x35A && onload[2] === 0x359, '5. SetIcefallCaveCrackedIceMetatiles re-cracks exactly the remembered squares', JSON.stringify(onload));
		A(!errors.length, '5. no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---------------- 6. Shoal Cave ----------------
	if (want('shoal')) {
		{
			const { page, ctx, errors } = await boot({ map: 'Route125', x: 22, y: 20 });
			// in from Route 125 at noon: HIGH tide, latched
			const hi = await page.evaluate(async () => {
				const O = window.__ow;
				O.Clock.setHour(12);
				await O.warpTo('MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', 0);
				await new Promise(r => setTimeout(r, 600));
				return { map: O.world.current.name, flag: !!O.Story.getFlag('FLAG_SYS_SHOAL_TIDE'), layout: O.world.current.layout.id };
			});
			A(hi.map === 'ShoalCave_LowTideEntranceRoom' && hi.flag && hi.layout === 'LAYOUT_SHOAL_CAVE_HIGH_TIDE_ENTRANCE_ROOM', '6. in from Route 125 at 12:00: HIGH tide, the entrance room floods', JSON.stringify(hi));
			// the clock turns while you are inside: the tide holds
			const hold = await page.evaluate(() => { const O = window.__ow; O.Clock.setHour(4); const r = O.shoalWarp({ dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM', dest_warp_id: '0' }); return r; });
			A(hold === 'blocked', '6. ...and it holds while you are inside (the 04:00 clock does not drain it)', JSON.stringify(hold));
			await settle(page, 'x');
			// out and back in at 04:00: LOW
			const lo = await page.evaluate(async () => {
				const O = window.__ow;
				await O.warpTo('MAP_ROUTE125', 0);
				await new Promise(r => setTimeout(r, 500));
				await O.warpTo('MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', 0);
				await new Promise(r => setTimeout(r, 600));
				return { flag: !!O.Story.getFlag('FLAG_SYS_SHOAL_TIDE'), layout: O.world.current.layout.id };
			});
			A(!lo.flag && lo.layout === 'LAYOUT_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', '6. out and back in at 04:00: LOW tide', JSON.stringify(lo));
			A(!errors.length, '6. no page errors', errors.join(' | '));
			await ctx.close();
		}
		{
			// the SALT pile at (31,8): drawn, dug, back after a day + the hermit
			const { page, ctx, errors } = await boot({ map: 'ShoalCave_LowTideInnerRoom', x: 31, y: 9, vars: { VAR_DAYS: today() } });
			await page.evaluate(() => window.__ow.Clock.setHour(4));
			const pile = await tile(page, 31, 8);
			A(pile.id === 0x358 && pile.solid, '6. the SHOAL SALT pile is drawn (the room\'s ON_LOAD), solid until dug', JSON.stringify(pile));
			const dig = await page.evaluate(() => { const O = window.__ow; O.player.facing = 'up'; const b = O.Bag.count('shoalsalt'); O.interact(); return { got: O.Bag.count('shoalsalt') - b, flag: !!O.Story.getFlag('FLAG_RECEIVED_SHOAL_SALT_1') }; });
			await settle(page, 'x');
			const after = await tile(page, 31, 8);
			A(dig.got === 1 && dig.flag && after.id === 0x35A && !after.solid, '6. digging it: a SHOAL SALT, its flag, the pile flattened', JSON.stringify({ dig, after }));
			const redig = await page.evaluate(() => { const O = window.__ow; const b = O.Bag.count('shoalsalt'); O.interact(); return O.Bag.count('shoalsalt') - b; });
			await settle(page, 'x');
			A(redig === 0, '6. the same day, it stays dug');
			// a day later, the hermit puts the items back
			const back = await page.evaluate(async () => {
				const O = window.__ow, S = O.Story;
				S.setVar('VAR_DAYS', S.getVar('VAR_DAYS') - 1);
				await O.moveToMap('ShoalCave_LowTideEntranceRoom', 18, 17);
				await new Promise(r => setTimeout(r, 400));
				const due = !!S.getFlag('FLAG_SYS_SHOAL_ITEM');
				O.player.setTile(18, 17); O.player.facing = 'up';
				O.interact();
				return { due, still: !!S.getFlag('FLAG_RECEIVED_SHOAL_SALT_1'), sys: !!S.getFlag('FLAG_SYS_SHOAL_ITEM') };
			});
			await settle(page, 'x');
			A(back.due, '6. a new day sets FLAG_SYS_SHOAL_ITEM (SetShoalItemFlag)', JSON.stringify(back));
			A(!back.still && !back.sys, '6. ...and talking to the SHELL BELL man puts the items back (ResetShoalItems)', JSON.stringify(back));
			const again = await page.evaluate(async () => {
				const O = window.__ow;
				await O.moveToMap('ShoalCave_LowTideInnerRoom', 31, 9);
				await new Promise(r => setTimeout(r, 400));
				const t = O.world.current.layout.map[8][31] & 0x3FF;
				O.player.setTile(31, 9); O.player.facing = 'up';
				const b = O.Bag.count('shoalsalt'); O.interact();
				return { t, got: O.Bag.count('shoalsalt') - b };
			});
			await settle(page, 'x');
			A(again.t === 0x358 && again.got === 1, '6. the pile is back, and it digs again', JSON.stringify(again));
			A(!errors.length, '6. no page errors', errors.join(' | '));
			await ctx.close();
		}
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
