// kanto_e4_flyout_test.mjs — flying out of the Kanto ELITE FOUR mid-run no longer shuts you out of it.
//
// Tester reports (instinctgauntlet, 2026-11-11, twice: bug:1794383567603, bug:1794388520355): after beating LORELEI and
// BRUNO (then AGATHA), they used Town Map > Fly > Indigo Plateau from inside the League to heal, and came back through
// the POKeMON CENTER's door. They landed on LORELEI's entry warp (6,12) with her entry sealed at (6,11) and no walk-in:
// the run was still "started" (VAR_MAP_SCENE_POKEMON_LEAGUE != 0), and the walk-in only plays at scene 0. FireRed never
// meets this (Fly does not work indoors); a whiteout and the Hall of Fame reset the run, flying out did not.
// The fix: arriving in the League's lobby (the Indigo Plateau POKeMON CENTER) ends any Kanto run in progress.
//   1. real keys: into LORELEI's room, walked in; a win; on into BRUNO's room; a second win
//   2. Fly to Indigo Plateau from BRUNO's room: outside, the run is still as it was (flying alone changes nothing)
//   3. walk into the POKeMON CENTER: the run is over (scene 0, LORELEI and BRUNO to beat again)
//   4. through the door again: walked in to (6,7) as on a first visit, and LORELEI's battle is there to be fought
//   5. HOENN's League flags are not touched by KANTO's lobby
//
//   node overworld/tests/kanto_e4_flyout_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9436;
const STATE = { username: 'e4fly', friendCode: 'E4FLY0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 70, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 220, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 220, curHP: 220,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const pos = () => W(() => ({ map: window.__ow.world.current && window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, cut: !!window.__ow.cutscene.blocking, dlg: !!window.__ow.dialog.blocking }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const settle = async (ms = 8000) => { const t0 = Date.now(); let p; while (Date.now() - t0 < ms) { p = await pos(); if (p.dlg) await page.keyboard.press('z'); else if (!p.cut) { await sleep(400); p = await pos(); if (!p.cut && !p.dlg) return p; } await sleep(120); } return pos(); };
	const waitMap = async (m, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await pos()).map === m) return true; await sleep(100); } return false; };
	const walk = async (k, ms = 260) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(450); };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=IndigoPlateau_PokemonCenter_1F&x=4&y=2`, { waitUntil: 'domcontentloaded' });
	await boot('IndigoPlateau_PokemonCenter_1F');
	const run = () => W(() => ({ scene: window.__ow.Story.getVar('VAR_MAP_SCENE_POKEMON_LEAGUE'), lorelei: !!window.__ow.Story.getFlag('FLAG_DEFEATED_LORELEI'), bruno: !!window.__ow.Story.getFlag('FLAG_DEFEATED_BRUNO'), sidney: !!window.__ow.Story.getFlag('FLAG_DEFEATED_ELITE_4_SIDNEY') }));
	// 1. a run: LORELEI and BRUNO beaten
	await W(() => { window.__ow.Story.setFlag('FLAG_DEFEATED_ELITE_4_SIDNEY'); });   // (a HOENN run's win, to see it is left alone)
	await W(() => { window.__ow.player.facing = 'up'; });
	await walk('ArrowUp');
	A(await waitMap('PokemonLeague_LoreleisRoom'), "1. the League door leads into LORELEI's room", JSON.stringify(await pos()));
	let p = await settle();
	A(p.x === 6 && p.y === 7 && (await run()).scene === 1, '1. walked in to (6,7); the run is started (scene 1)', JSON.stringify([p, await run()]));
	await W(() => window.__ow.runScriptLabel('PokemonLeague_LoreleisRoom_EventScript_DefeatedLorelei'));
	await settle();
	await W(() => { const P = window.__ow.player; P.tx = 6; P.ty = 3; P.x = 96; P.y = 48; P.facing = 'up'; });
	await walk('ArrowUp');
	A(await waitMap('PokemonLeague_BrunosRoom'), "1. LORELEI beaten: on into BRUNO's room", JSON.stringify(await pos()));
	await settle();
	await W(() => window.__ow.runScriptLabel('PokemonLeague_BrunosRoom_EventScript_DefeatedBruno'));
	await settle();
	const mid = await run();
	A(mid.lorelei && mid.bruno && mid.scene >= 1, '1. LORELEI and BRUNO are beaten, mid-run', JSON.stringify(mid));

	// 2. Fly to Indigo Plateau from inside
	const ext = await W(() => { const o = window.__ow, f = o.world.fileFor ? null : null; return Object.keys(o.world.index || {}).filter((k) => /IndigoPlateau_Exterior/.test(k))[0] || 'MAP_INDIGO_PLATEAU_EXTERIOR'; });
	await W((id) => window.__ow.flyTo(id, 11, 7), 'MAP_INDIGO_PLATEAU_EXTERIOR');
	const out = await waitMap('IndigoPlateau_Exterior', 15000);
	await settle(3000);
	const afterFly = await run();
	A(out, '2. Fly from BRUNO\'s room lands outside, on Indigo Plateau', JSON.stringify([ext, await pos()]));
	A(afterFly.lorelei && afterFly.bruno && afterFly.scene === mid.scene, '2. flying out alone changes nothing of the run', JSON.stringify(afterFly));

	// 3. into the POKeMON CENTER: the run is over
	const door = await W(() => { const m = window.__ow.world.current.map, w = (m.warp_events || []).find((q) => /INDIGO_PLATEAU_POKEMON_CENTER_1F/.test(q.dest_map)); return w ? { x: w.x, y: w.y } : null; });
	await W((d) => { const P = window.__ow.player; P.tx = d.x; P.ty = d.y + 1; P.x = d.x * 16; P.y = (d.y + 1) * 16; P.facing = 'up'; }, door);
	await walk('ArrowUp');
	A(!!door && await waitMap('IndigoPlateau_PokemonCenter_1F'), '3. walk into the POKeMON CENTER', JSON.stringify([door, await pos()]));
	await settle(4000);
	const lobby = await run();
	A(lobby.scene === 0 && !lobby.lorelei && !lobby.bruno, '3. in the lobby the run is over: scene 0, LORELEI and BRUNO to beat again', JSON.stringify(lobby));
	A(lobby.sidney, '5. a HOENN League win is not touched by KANTO\'s lobby', JSON.stringify(lobby));

	// 4. through the door again: a first visit's walk-in, not the sealed entry
	await W(() => { const P = window.__ow.player; P.tx = 4; P.ty = 2; P.x = 64; P.y = 32; P.facing = 'up'; });
	await walk('ArrowUp');
	A(await waitMap('PokemonLeague_LoreleisRoom'), "4. the League door leads into LORELEI's room again", JSON.stringify(await pos()));
	p = await settle();
	A(p.map === 'PokemonLeague_LoreleisRoom' && p.x === 6 && p.y === 7, '4. you are walked in to (6,7), not left on the entry warp (6,12) behind the seal', JSON.stringify(p));
	A((await run()).scene === 1 && !(await run()).lorelei, '4. a new run is started, and LORELEI is there to be fought', JSON.stringify(await run()));
	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
