// legend_one_body_test.mjs — a placed legendary is ONE POKeMON on its map.
//
// bug:1794338908364 (2026-11-10, Instinct) showed two RAYQUAZA at the Sky Pillar
// summit: the map's own object and the port's static catch beside it. The same held
// wherever the decomp's object sits a few tiles from the catch square: Marine Cave's
// KYOGRE and Terra Cave's GROUDON in the rock, Navel Rock's HO-OH, Tin Tower's three
// beasts behind their wall — two of each, and the object stayed after a catch. While
// the catch is available it is the legendary's one body; once caught, none.
// (The Sky Pillar's story phases: skypillar_phases_test.mjs.)
//
//   node overworld/tests/legend_one_body_test.mjs
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
const PORT = 9792;
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
		if (d) press('z');
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

	// the placed legendaries whose map carries its own object of them
	const CASES = [
		{ map: 'MarineCave_End', region: 'hoenn', species: 'kyogre', re: /KYOGRE/ },
		{ map: 'TerraCave_End', region: 'hoenn', species: 'groudon', re: /GROUDON/ },
		{ map: 'NavelRock_Top', region: 'kanto', species: 'hooh', re: /HO_?OH/ },
		{ map: 'TinTower1F', region: 'johto', species: 'suicune', re: /SUICUNE/, flags: { EVENT_RELEASED_THE_BEASTS: true } },
		{ map: 'TinTower1F', region: 'johto', species: 'raikou', re: /RAIKOU/, flags: { EVENT_RELEASED_THE_BEASTS: true } },
		{ map: 'SeafoamIslands_B4F', region: 'kanto', species: 'articuno', re: /ARTICUNO/ },
		{ map: 'SkyPillar_Top', region: 'hoenn', species: 'rayquaza', re: /RAYQUAZA/, flags: { FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA: true }, vars: CALM },
	];
	for (const c of CASES) for (const caught of [false, true]) {
		const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/maps', c.map + '_map.json'), 'utf8'));
		const w = m.warp_events[0];
		const { page, ctx } = await boot({ map: c.map, x: w.x, y: w.y, region: c.region, badges: CHAMPS,
			flags: { ...(c.flags || {}), ...(caught ? { ['legend_caught_' + c.species]: true } : {}) }, vars: c.vars || {} });
		const r = await page.evaluate((sp, src) => {
			const O = window.__ow, re = new RegExp(src);
			return { npcs: O.npcs.list.filter(n => !n.hidden && re.test(n.ev?.graphics_id || '') && !/TRIANGLE/.test(n.ev.graphics_id)).map(n => `${n.ev.graphics_id}@${n.tx},${n.ty}`),
				legends: O.legendariesHere().filter(e => e.species === sp).map(e => `${e.species}@${e.x},${e.y}`) };
		}, c.species, c.re.source);
		const n = r.npcs.length + r.legends.length;
		A(caught ? n === 0 : (n === 1 && r.legends.length === 1), `${c.map} ${c.species} ${caught ? 'caught: none left' : 'catchable: exactly one'}`, JSON.stringify(r));
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
