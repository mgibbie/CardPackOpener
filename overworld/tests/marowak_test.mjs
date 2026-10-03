// marowak_test.mjs — the SILPH SCOPE clears Pokémon Tower 6F.
//
// 2026-10-03 (Instinct): with the Scope in the bag, stepping onto the 6F trigger
// only said "Be gone... Intruders..." and pushed you back up; no battle, and
// Mr. Fuji's stairs stayed shut. `special StartMarowakBattle` was unimplemented,
// so the script read a stale VAR_RESULT. FireRed's battle_setup.c: with the Scope,
// a battle vs MAROWAK Lv30 that can't be caught; VAR_RESULT = FALSE only on a
// WIN (the spirit is calmed, VAR_MAP_SCENE_POKEMON_TOWER_6F = 1).
//   1. with the Scope, the trigger starts a battle vs MAROWAK Lv30, uncatchable
//   2. winning calms the spirit: scene = 1, and the stairs take you to 7F
//   3. without the Scope: no battle, pushed back (VAR_RESULT TRUE, not stale)
//
//   node overworld/tests/marowak_test.mjs
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
const PORT = 9214;
const STATE = { username: 'marowak', friendCode: 'MARO01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'pidgeot', name: 'PIDGEOT', level: 46, gender: 'M', friend: 70, types: ['Normal', 'Flying'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 140, atk: 90, def: 85, spa: 80, spd: 80, spe: 110 }, maxHP: 140, curHP: 140,
	exp: 97336, moves: [{ id: 'wingattack', name: 'Wing Attack', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18,
}];
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
async function boot(bag) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, bag) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'kanto');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: { VAR_RESULT: 1 } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, bag);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PokemonTower_6F&x=11&y=14`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === 'PokemonTower_6F')).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	return { page, ctx, errors };
}
// press Z through dialog until a battle runs, or everything is still
const drive = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 15000) {
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
const walk = async (page, k) => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(500); };
const scene = page => page.evaluate(async () => (await import('./events.js')).getVar('VAR_MAP_SCENE_POKEMON_TOWER_6F'));

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// 1 + 2. with the SILPH SCOPE
	{
		const { page, ctx, errors } = await boot({ silphscope: 1, pokeball: 5 });
		await walk(page, 'ArrowDown');           // onto the trigger (11,15)
		const r = await drive(page);
		const foe = await page.evaluate(() => { const a = window.__ow.battle.active; return a ? { sp: a.foe.speciesId, lv: a.foe.level, noCatch: !!a.noCatch } : null; });
		A(r === 'battle' && foe && foe.sp === 'marowak' && foe.lv === 30, '1. with the Scope, the trigger starts a battle vs MAROWAK Lv30', JSON.stringify({ r, foe }));
		A(foe && foe.noCatch, '1. ...which can\'t be caught (the ghost dodges balls)', JSON.stringify(foe));
		// win it
		await page.evaluate(() => window.__ow.battle.finish('victory'));
		for (let i = 0; i < 60 && await page.evaluate(() => !!window.__ow.battle.active); i++) await sleep(100);
		await drive(page);
		A(await scene(page) === 1, '2. winning calms the spirit: VAR_MAP_SCENE_POKEMON_TOWER_6F = 1', String(await scene(page)));
		const at = await pos(page);
		A(at.x === 11 && at.y === 15, '2. ...and you are NOT pushed back up', JSON.stringify(at));
		await walk(page, 'ArrowDown');           // onto the 7F stairs (11,16)
		for (let i = 0; i < 40 && (await pos(page)).map !== 'PokemonTower_7F'; i++) await sleep(100);
		A((await pos(page)).map === 'PokemonTower_7F', '2. the stairs take you up to 7F (Mr. Fuji)', JSON.stringify(await pos(page)));
		A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// 3. without the Scope: no battle, pushed back, even with a stale VAR_RESULT of 0
	{
		const { page, ctx } = await boot({ pokeball: 5 });
		await page.evaluate(async () => (await import('./events.js')).setVar('VAR_RESULT', 0));   // stale FALSE must not open the stairs
		await walk(page, 'ArrowDown');
		const r = await drive(page);
		const at = await pos(page);
		A(r !== 'battle' && at.y === 14 && await scene(page) !== 1, '3. without the Scope: no battle, pushed back up, stairs stay shut', JSON.stringify({ r, at, scene: await scene(page) }));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
