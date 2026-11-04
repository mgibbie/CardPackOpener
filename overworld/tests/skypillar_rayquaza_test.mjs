// skypillar_rayquaza_test.mjs — RAYQUAZA at the top of the SKY PILLAR can be reached.
//
// bug:1792549657877 (2026-10-21, Instinct): the sleeping RAYQUAZA object at (14,7)
// stood on the only square into the (14,6) pocket where the catch is, so Rayquaza
// could never be battled. pokeemerald: SkyPillar_Top_EventScript_AwakenRayquaza
// (the cry scene) ends `removeobject LOCALID_RAYQUAZA_SLEEPING`, which sets
// FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA; once Sootopolis is calmed (VAR_SKY_PILLAR_STATE
// >= 2) the still RAYQUAZA at (14,6) is what you face and battle from (14,7). The
// port keeps the cry scene dormant (VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE = 1) and plays
// its own director beat (VAR_HOENN_AWAKENING 4 -> 5), and neither hid the object.
//   1. a resolved save (VAR_HOENN_AWAKENING 6, the tester's state): no sleeping
//      RAYQUAZA, (14,7) walkable, and facing (14,6) + Z starts the RAYQUAZA battle
//   2. the director's summit beat (4 -> 5) takes the sleeping object with it
//   3. before that beat it is still there (the scene shows it)
//
//   node overworld/tests/skypillar_rayquaza_test.mjs
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
const PORT = 9772;
const STATE = { username: 'skypillar', friendCode: 'SKY001', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, num, moves) => ({
	speciesId, name, level: 50, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 180, atk: 90, def: 85, spa: 80, spd: 80, spe: 90 }, maxHP: 180, curHP: 180,
	exp: 125000, moves: moves.map(id => ({ id, name: id.toUpperCase(), pp: 15, maxPp: 15 })), sprite: `s${num}.png`, num,
});
const FIELD = ['cut', 'rocksmash', 'flash', 'dig'];
const WAILORD = mon('wailord', 'WAILORD', 321, FIELD);
const RELICANTH = mon('relicanth', 'RELICANTH', 369, ['rocksmash']);
const MIDDLE = mon('pelipper', 'PELIPPER', 279, ['surf']);
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
async function boot({ map, x, y, region = 'hoenn', party = [WAILORD, MIDDLE, RELICANTH], flags = {}, vars = {} }) {
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
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, party, region, flags, vars, BADGES);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	return { page, ctx, errors };
}
// close every dialog / let every cutscene finish
const settle = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 12000) {
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001 && !O.player.moving) { if (++calm >= 10) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, facing: window.__ow.player.facing }));
// one real step (or a bump/turn): hold the key until the tile changes or the
// player turned to face that way, then let go and wait for the step to land
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
const flag = (page, f) => page.evaluate(f => window.__ow.Story.getFlag(f), f);
const passable = (page, x, y) => page.evaluate((x, y) => window.__ow.world.isPassable(x, y), x, y);
const useMove = (page, id) => page.evaluate(id => { const O = window.__ow; O.useFieldMove(id, O.party ? O.party[0] : null); return O.dialog.blocking ? (O.dialog.text || O.dialog.lines?.join?.('\n') || 'dialog') : ''; }, id);
async function waitMap(page, name) {
	for (let i = 0; i < 80 && (await pos(page)).map !== name; i++) await sleep(100);
	await sleep(400); await settle(page);
	return (await pos(page)).map === name;
}


const sleeping = page => page.evaluate(() => window.__ow.npcs.list.some(n => n.ev && n.ev.flag === 'FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA'));
const RESOLVED = { VAR_HOENN_AWAKENING: 6, VAR_SKY_PILLAR_STATE: 3, VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE: 1, VAR_SOOTOPOLIS_CITY_STATE: 6 };
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	{
		const { page, ctx, errors } = await boot({ map: 'SkyPillar_Top', x: 14, y: 8, flags: { villain_hoenn_climax: true, FLAG_DEFEATED_GROUDON: true }, vars: RESOLVED });
		A(!(await sleeping(page)), '1. resolved save: the sleeping RAYQUAZA is gone from (14,7)');
		A(await flag(page, 'FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA'), '1. ...its hide flag is set (AwakenRayquaza: removeobject)');
		await step(page, 'up');
		const p = await pos(page);
		A(p.x === 14 && p.y === 7, '1. the player can step onto (14,7)', JSON.stringify(p));
		await step(page, 'up');   // face (14,6) (or step onto it: both start the encounter)
		let started = await page.evaluate(() => !!window.__ow.battle.active || window.__ow.dialog.blocking);
		if (!started) { await page.keyboard.press('z'); await sleep(300); }
		// the legend's intro line, then the battle
		for (let i = 0; i < 60 && !(await page.evaluate(() => !!window.__ow.battle.active)); i++) {
			if (await page.evaluate(() => window.__ow.dialog.blocking)) await page.keyboard.press('z');
			await sleep(100);
		}
		const foe = await page.evaluate(() => window.__ow.battle.active ? window.__ow.battle.active.foe.speciesId : null);
		A(foe === 'rayquaza', '1. ...and RAYQUAZA can be battled', JSON.stringify({ foe, at: await pos(page) }));
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	{
		const { page, ctx, errors } = await boot({ map: 'SkyPillar_5F', x: 1, y: 1, flags: { villain_hoenn_climax: true }, vars: { VAR_HOENN_AWAKENING: 4, VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE: 1 } });
		await page.evaluate(() => window.__ow.moveToMap('SkyPillar_Top', 14, 8));
		await waitMap(page, 'SkyPillar_Top');
		A(await page.evaluate(() => window.__ow.awState()) === 5, '2. the director summit beat advanced VAR_HOENN_AWAKENING to 5', String(await page.evaluate(() => window.__ow.awState())));
		A(!(await sleeping(page)), '2. ...and the sleeping RAYQUAZA left with it');
		A(await flag(page, 'FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA'), '2. ...for good (FLAG_HIDE_SKY_PILLAR_TOP_RAYQUAZA)');
		A(errors.length === 0, '2. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	{
		const { page, ctx } = await boot({ map: 'SkyPillar_Top', x: 14, y: 8, vars: { VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE: 1 } });
		A(await sleeping(page), '3. before the awakening reaches the summit, the sleeping RAYQUAZA is there');
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
