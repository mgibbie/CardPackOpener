// skypillar_phases_test.mjs — one phase-correct RAYQUAZA at the SKY PILLAR summit,
// the native awakening by real controls, and Sootopolis calmed by it.
//
// bug:1794338908364 (2026-11-10, Instinct): on the native route (Steven -> Cave of
// Origin -> Wallace opens the pillar, VAR_SOOTOPOLIS_CITY_STATE 4) the summit drew
// TWO Rayquaza: the decomp's SLEEPING one at (14,7), inert and blocking, and the
// port's static catch at (14,6). The cry scene at (14,9) never ran, because the
// story seed rests VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE at 1 — so Sootopolis could never
// be calmed and its gym door stayed locked. pokeemerald SkyPillar_Top: the sleeping
// RAYQUAZA until the cry scene (city 5, pillar 1, it flies to Sootopolis); the still
// one at (14,6) only once Sootopolis is calm (pillar >= 2).
//   1. the tester's state: ONE (sleeping) Rayquaza, no catch; same after a reload
//   2. walking up (real keys) to (14,9) wakes it: it is gone, city 5 / pillar 1,
//      and the summit is empty (also after a reload)
//   3. Sootopolis: the native Rayquaza scene calms the city (pillar >= 2, KYOGRE and
//      GROUDON gone); Maxie + Archie leave, the gym door opens, Wallace's HM
//   4. back at the summit: ONE (catchable) Rayquaza, (14,7) walkable; same after a
//      reload; RUN keeps it, and re-entering the map shows still one
//   5. caught -> none; fainted -> none (re-entry too)
//   6. a save that caught it while the two overlapped (the tester's, if they catch
//      now) still gets Sootopolis calmed
//   7. the director route: its summit beat leaves no cry scene to replay at (14,9)
//   (8, the same rule for the other placed legendaries: legend_one_body_test.mjs)
//
//   node overworld/tests/skypillar_phases_test.mjs
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
const PORT = 9791;
const STATE = { username: 'skyphase', friendCode: 'SKYP01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, num, moves) => ({
	speciesId, name, level: 100, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
	stats: { hp: 400, atk: 300, def: 300, spa: 300, spd: 300, spe: 400 }, maxHP: 400, curHP: 400,
	exp: 1000000, moves: moves.map(id => ({ id, name: id.toUpperCase(), pp: 30, maxPp: 30 })), sprite: `s${num}.png`, num,
});
const PARTY = [mon('mewtwo', 'MEWTWO', 150, ['psychic', 'surf']), mon('wailord', 'WAILORD', 321, ['surf'])];
const ALL = ids => Object.fromEntries(ids.map(id => [id, true]));
const BADGES7 = { badges: { HOENN: ALL(['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind']) }, champion: {} };
const CHAMPS = {
	badges: {
		HOENN: ALL(['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain']),
		KANTO: ALL(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']),
		JOHTO: ALL(['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising']),
	},
	champion: { HOENN: true, KANTO: true, JOHTO: true },
};
// instinctgauntlet's story at the summit (D1 ow:instinctgauntlet, 2026-11-10): the
// native route through Sootopolis, no director (villain_hoenn_climax unset), the
// seed's cry var still resting at 1
const TESTER = {
	flags: { FLAG_VISITED_SOOTOPOLIS_CITY: true, FLAG_STEVEN_GUIDES_TO_CAVE_OF_ORIGIN: true, FLAG_WALLACE_GOES_TO_SKY_PILLAR: true,
		FLAG_HIDE_CAVE_OF_ORIGIN_B1F_WALLACE: true, FLAG_LANDMARK_SKY_PILLAR: true, FLAG_SYS_WEATHER_CTRL: true, FLAG_HIDE_SKY_PILLAR_WALLACE: true,
		FLAG_HIDE_SOOTOPOLIS_CITY_RAYQUAZA: true },
	vars: { VAR_SOOTOPOLIS_CITY_STATE: 4, VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE: 1, VAR_SEAFLOOR_CAVERN_STATE: 1 },
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
const waitMapLoaded = async (page, map) => {
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m && !window.__ow.loading), map).catch(() => false)); i++) await sleep(100);
	await sleep(900);
};
async function boot({ map, x, y, region = 'hoenn', party = PARTY, flags = {}, vars = {}, badges = BADGES7 }) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, region, flags, vars, badges) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 20, rainbowwing: 1, silverwing: 1 }));
		localStorage.setItem('magepunk_repel_v1', '99999');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, newgame_flags_seeded: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE, party, region, flags, vars, badges);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	await waitMapLoaded(page, map);
	await settle(page);
	return { page, ctx, errors };
}
// reload the page on the save as it stands, where the player stands
async function reload(page) {
	const p = await pos(page);
	const map = p.map;
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${p.map}&x=${p.x}&y=${p.y}`, { waitUntil: 'domcontentloaded' });
	await waitMapLoaded(page, map);
	await settle(page);
}
// close every dialog / let every cutscene finish
const settle = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 20000) {
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && !O.battle.blocking && f.alpha < 0.001 && f.target < 0.001 && !O.player.moving && !O.loading) { if (++calm >= 12) return 'idle'; } else calm = 0;
		// the catch's "Give a nickname?" — X declines (Z opens the keyboard)
		if (d) press(/nickname/i.test(JSON.stringify(O.dialog.pages || O.dialog.text || '')) ? 'x' : 'z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, facing: window.__ow.player.facing }));
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
// one real step: hold the key until the tile changes (or a turn/bump), then let go
async function step(page, dir) {
	const before = await pos(page);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		const p = await pos(page);
		if (p.x !== before.x || p.y !== before.y || p.map !== before.map) break;
		if (i > 4 && p.facing === dir) break;
		await sleep(15);
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 60 && await page.evaluate(() => window.__ow.player.moving || !!window.__ow.loading); i++) await sleep(20);
	await sleep(60);
	return settle(page);
}
// walk with real keys along the shortest passable path to (tx,ty); stops early if a
// scene or battle takes over. Returns the last settle state.
async function walkTo(page, tx, ty) {
	for (let guard = 0; guard < 60; guard++) {
		const p = await pos(page);
		if (p.x === tx && p.y === ty) return 'idle';
		const dir = await page.evaluate((tx, ty) => {
			const O = window.__ow, P = O.player, W = O.world;
			const ok = (x, y) => (x === tx && y === ty) || (W.isPassable(x, y) && !O.npcs.npcBlocks?.(x, y, P.elev) && !O.legendariesHere().some(e => e.x === x && e.y === y));
			const D = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
			const seen = new Map([[P.tx + ',' + P.ty, null]]); const q = [[P.tx, P.ty]];
			while (q.length) {
				const [x, y] = q.shift();
				if (x === tx && y === ty) break;
				for (const [d, dx, dy] of D) { const k = (x + dx) + ',' + (y + dy); if (seen.has(k) || !ok(x + dx, y + dy)) continue; seen.set(k, [x, y, d]); q.push([x + dx, y + dy]); }
			}
			let k = tx + ',' + ty; if (!seen.has(k)) return null;
			let first = null;
			while (seen.get(k)) { const [px, py, d] = seen.get(k); first = d; k = px + ',' + py; }
			return first;
		}, tx, ty);
		if (!dir) return 'nopath';
		const r = await step(page, dir);
		if (r !== 'idle') return r;
	}
	return 'guard';
}
const summit = page => page.evaluate(() => {
	const O = window.__ow, st = JSON.parse(localStorage.getItem('magepunk_story') || '{}');
	const npcs = O.npcs.list.filter(n => !n.hidden && /RAYQUAZA/.test(n.ev?.graphics_id || '')).map(n => `${n.ev.graphics_id}@${n.tx},${n.ty}`);
	const legends = O.legendariesHere().filter(e => e.species === 'rayquaza').map(e => `rayquaza@${e.x},${e.y}`);
	return { npcs, legends, count: npcs.length + legends.length, v: st.vars || {}, f: st.flags || {},
		block147: O.player.blocked ? O.player.blocked(14, 7) : !O.world.isPassable(14, 7) };
});
const view = s => JSON.stringify({ npcs: s.npcs, legends: s.legends, city: s.v.VAR_SOOTOPOLIS_CITY_STATE, pillar: s.v.VAR_SKY_PILLAR_STATE, cry: s.v.VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE, aw: s.v.VAR_HOENN_AWAKENING });
// in battle: advance messages until the command menu (or the end)
const toMenu = (page, ms = 20000) => page.evaluate(async ms => {
	const O = window.__ow, t0 = Date.now();
	while (Date.now() - t0 < ms) {
		const a = O.battle.active;
		if (!a) return 'over';
		if (a.phase === 'menu') return 'menu';
		if (a.phase === 'msg') O.battle.key('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout:' + O.battle.active?.phase;
}, ms);
const afterBattle = async page => { for (let i = 0; i < 150 && await page.evaluate(() => window.__ow.battle.blocking || !!window.__ow.battle.active); i++) { await page.evaluate(() => { const a = window.__ow.battle.active; if (a && a.phase === 'msg') window.__ow.battle.key('z'); }); await sleep(60); } await settle(page); };
// from the summit, walk up to (14,7) and face (14,6): the RAYQUAZA battle
async function engage(page) {
	const r = await walkTo(page, 14, 7);
	if (r === 'battle') return r;
	await step(page, 'up');
	let st = await settle(page);
	if (st !== 'battle') { await page.keyboard.press('z'); await sleep(300); st = await settle(page); }
	const foe = await page.evaluate(() => window.__ow.battle.active ? window.__ow.battle.active.foe.speciesId : null);
	return foe === 'rayquaza' ? 'rayquaza' : 'none:' + st;
}
// leave the summit by its stairs (16,14) to 5F, and come back up
async function leaveAndReturn(page) {
	await walkTo(page, 16, 14);
	for (let i = 0; i < 50 && (await pos(page)).map === 'SkyPillar_Top'; i++) await sleep(100);
	await waitMapLoaded(page, 'SkyPillar_5F'); await settle(page);
	const out = (await pos(page)).map;
	await page.evaluate(() => window.__ow.moveToMap('SkyPillar_Top', 16, 13));
	await waitMapLoaded(page, 'SkyPillar_Top'); await settle(page);
	return out;
}
const CALM = { VAR_SOOTOPOLIS_CITY_STATE: 5, VAR_SKY_PILLAR_STATE: 3, VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE: 1 };

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1-3: the tester's state -> awakening -> Sootopolis =====
	{
		const { page, ctx, errors } = await boot({ map: 'SkyPillar_Top', x: 16, y: 13, ...TESTER });
		let s = await summit(page);
		A(s.count === 1 && s.npcs.length === 1 && /GFX_RAYQUAZA@14,7/.test(s.npcs[0]) && s.legends.length === 0,
			'1. the tester\'s state: ONE Rayquaza, the sleeping one at (14,7), no catch beside it', view(s));
		A(s.v.VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE === 0, '1. ...and its cry scene at (14,9) is armed', view(s));
		await reload(page);
		s = await summit(page);
		A(s.count === 1 && s.npcs.length === 1 && s.legends.length === 0, '1. reload: still the one sleeping Rayquaza', view(s));

		const w = await walkTo(page, 14, 9);
		await settle(page);
		s = await summit(page);
		A(w !== 'nopath' && s.v.VAR_SOOTOPOLIS_CITY_STATE === 5 && s.v.VAR_SKY_PILLAR_STATE === 1 && s.v.VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE === 1,
			'2. walking up to (14,9) wakes RAYQUAZA: city 5, pillar 1 (SkyPillar_Top_EventScript_AwakenRayquaza)', view(s) + ' ' + w);
		A(s.count === 0 && s.f.FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA === true, '2. ...it flew off: no Rayquaza at the summit', view(s));
		await reload(page);
		s = await summit(page);
		A(s.count === 0, '2. reload: the summit is still empty while it is at Sootopolis', view(s));
		await walkTo(page, 14, 9); await walkTo(page, 14, 10); await walkTo(page, 14, 9);
		s = await summit(page);
		A(s.v.VAR_SOOTOPOLIS_CITY_STATE === 5 && s.v.VAR_SKY_PILLAR_STATE === 1, '2. (14,9) again replays nothing', view(s));

		// Sootopolis, by the Pokemon Center door (where the native scene expects you)
		await page.evaluate(() => window.__ow.moveToMap('SootopolisCity', 43, 32));
		await waitMapLoaded(page, 'SootopolisCity');
		await settle(page); await sleep(500); await settle(page);
		const soot = await page.evaluate(() => {
			const O = window.__ow, st = JSON.parse(localStorage.getItem('magepunk_story') || '{}');
			return { v: st.vars, f: st.flags, mons: O.npcs.list.filter(n => !n.hidden && /KYOGRE|GROUDON|RAYQUAZA/.test(n.ev?.graphics_id || '')).map(n => n.ev.graphics_id) };
		});
		A((soot.v.VAR_SKY_PILLAR_STATE || 0) >= 2 && !soot.f.FLAG_SYS_WEATHER_CTRL && !soot.f.FLAG_LEGENDARIES_IN_SOOTOPOLIS,
			'3. Sootopolis: RAYQUAZA\'s scene calms the city (pillar >= 2, weather cleared)', JSON.stringify({ pillar: soot.v.VAR_SKY_PILLAR_STATE, w: soot.f.FLAG_SYS_WEATHER_CTRL }));
		A(soot.mons.length === 0, '3. ...KYOGRE and GROUDON are gone from the city', JSON.stringify(soot.mons));
		await reload(page);
		const soot2 = await page.evaluate(() => window.__ow.npcs.list.filter(n => !n.hidden && /KYOGRE|GROUDON|RAYQUAZA/.test(n.ev?.graphics_id || '')).length);
		A(soot2 === 0, '3. reload: still no KYOGRE / GROUDON in the city', String(soot2));
		const aw = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story')).vars.VAR_HOENN_AWAKENING);
		A(aw === 6, '3. ...and the crisis counts as resolved on the next map load (VAR_HOENN_AWAKENING 6)', String(aw));
		// Maxie + Archie, then Wallace (sootopolis_resolution_test's walk)
		const faceNpc = script => page.evaluate(script => {
			const O = window.__ow, n = O.npcs.list.find(n => n.ev && n.ev.script === script && !n.hidden);
			if (!n) return null;
			for (const [dx, dy, f] of [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']]) {
				const x = n.tx + dx, y = n.ty + dy;
				if (!O.world.isPassable(x, y) || O.npcs.list.some(m => m !== n && !m.hidden && m.tx === x && m.ty === y)) continue;
				const P = O.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f;
				return [x, y, f];
			}
			return null;
		}, script);
		for (const who of ['Maxie', 'Archie']) {
			const at = await faceNpc('SootopolisCity_EventScript_' + who);
			A(!!at, `3. ${who} stands outside the gym`, JSON.stringify(at));
			await page.keyboard.press('z'); await sleep(200); await settle(page);
		}
		await sleep(1500); await settle(page);
		const gym = await page.evaluate(() => ({ leave: !!JSON.parse(localStorage.getItem('magepunk_story')).flags.FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE, open: window.__ow.world.isPassable(31, 32) }));
		A(gym.leave && gym.open, '3. Maxie and Archie leave, and the gym door (31,32) opens', JSON.stringify(gym));
		await faceNpc('SootopolisCity_EventScript_Wallace');
		await page.keyboard.press('z'); await sleep(200); await settle(page);
		const hm = await page.evaluate(() => !!JSON.parse(localStorage.getItem('magepunk_story')).flags.FLAG_RECEIVED_HM_WATERFALL);
		A(hm, '3. Wallace hands over HM WATERFALL: the Sootopolis story completes');

		// ===== 4. back at the summit: the catchable one =====
		await page.evaluate(() => window.__ow.moveToMap('SkyPillar_Top', 16, 13));
		await waitMapLoaded(page, 'SkyPillar_Top'); await settle(page);
		s = await summit(page);
		A(s.count === 1 && s.legends[0] === 'rayquaza@14,6' && s.npcs.length === 0, '4. back at the summit: ONE Rayquaza, the catch at (14,6)', view(s));
		A(!s.block147, '4. ...and (14,7) in front of it is walkable', view(s));
		await reload(page);
		s = await summit(page);
		A(s.count === 1 && s.legends.length === 1, '4. reload: still exactly one', view(s));
		const e = await engage(page);
		A(e === 'rayquaza', '4. facing it from (14,7) starts the RAYQUAZA battle', e);
		await toMenu(page);
		await page.evaluate(() => { const B = window.__ow.battle; B.active.menuIdx = 3; B.key('z'); });   // RUN
		await afterBattle(page);
		s = await summit(page);
		A(s.count === 1 && s.legends.length === 1 && !s.f.legend_caught_rayquaza, '4. RUN: it stays, still one', view(s));
		const out = await leaveAndReturn(page);
		s = await summit(page);
		A(out === 'SkyPillar_5F' && s.count === 1 && s.legends.length === 1, '4. down the stairs and back up: still one', view(s) + ' ' + out);
		A(errors.length === 0, '1-4. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 5. caught / fainted =====
	for (const how of ['caught', 'fainted']) {
		const { page, ctx } = await boot({ map: 'SkyPillar_Top', x: 16, y: 13, flags: { FLAG_WALLACE_GOES_TO_SKY_PILLAR: true, FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA: true }, vars: CALM });
		const e = await engage(page);
		await toMenu(page);
		if (how === 'caught') {
			await page.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0; window.__ow.battle.useItem('pokeball'); });
		} else {
			await page.evaluate(() => { const B = window.__ow.battle; B.active.foe.curHP = 1; B.active.menuIdx = 0; B.key('z'); });
			await sleep(200);
			await page.evaluate(() => { const B = window.__ow.battle; if (B.active) { B.active.moveIdx = 0; B.key('z'); } });
		}
		await toMenu(page);
		await page.evaluate(() => { if (window.__rnd) Math.random = window.__rnd; });
		await afterBattle(page);
		let s = await summit(page);
		A(e === 'rayquaza' && s.f.legend_caught_rayquaza === true && s.count === 0, `5. ${how}: no Rayquaza left at the summit`, view(s) + ' ' + e);
		await leaveAndReturn(page);
		s = await summit(page);
		A(s.count === 0, `5. ${how}: none after re-entering either`, view(s));
		await reload(page);
		s = await summit(page);
		A(s.count === 0, `5. ${how}: none after a reload`, view(s));
		await ctx.close();
	}

	// ===== 6. caught while the two overlapped (pre-fix) =====
	{
		const { page, ctx, errors } = await boot({ map: 'SkyPillar_Top', x: 16, y: 13, flags: { ...TESTER.flags, legend_caught_rayquaza: true }, vars: TESTER.vars });
		await leaveAndReturn(page);
		let s = await summit(page);
		A(s.count === 0 && s.v.VAR_SOOTOPOLIS_CITY_STATE === 5 && s.v.VAR_SKY_PILLAR_STATE === 1,
			'6. caught before the awakening: none at the summit, and the wake-up counts (city 5, pillar 1)', view(s));
		await page.evaluate(() => window.__ow.moveToMap('SootopolisCity', 43, 32));
		await waitMapLoaded(page, 'SootopolisCity'); await settle(page); await sleep(500); await settle(page);
		const v = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story')).vars);
		A((v.VAR_SKY_PILLAR_STATE || 0) >= 2, '6. ...and Sootopolis is still calmed', JSON.stringify(v.VAR_SKY_PILLAR_STATE));
		A(errors.length === 0, '6. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 7. the director route =====
	{
		const { page, ctx } = await boot({ map: 'SkyPillar_5F', x: 1, y: 1, flags: { villain_hoenn_climax: true }, vars: { VAR_HOENN_AWAKENING: 4, VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE: 1 } });
		await page.evaluate(() => window.__ow.moveToMap('SkyPillar_Top', 16, 13));
		await waitMapLoaded(page, 'SkyPillar_Top'); await settle(page);
		let s = await summit(page);
		A(s.v.VAR_HOENN_AWAKENING === 5 && s.count === 0, '7. director: its summit beat takes the sleeping Rayquaza, no catch yet', view(s));
		await walkTo(page, 14, 9);
		s = await summit(page);
		A(s.v.VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE === 1 && !s.v.VAR_SKY_PILLAR_STATE && s.count === 0, '7. ...and (14,9) has no second awakening to play', view(s));
		await ctx.close();
	}

} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
