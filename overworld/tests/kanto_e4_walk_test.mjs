// kanto_e4_walk_test.mjs — the Kanto ELITE FOUR can actually be entered and walked.
//
// 2026-10-12, Instinct's blocker (bug:1791822694414): through the Indigo Plateau
// POKeMON CENTER door the player landed on LORELEI's entry warp (6,12) and could not
// move — the two doorway rows above are SOLID in the decomp too; the room's ON_FRAME
// (VAR_MAP_SCENE_POKEMON_LEAGUE == 0) walks you in. checkOnFrame skipped value-0
// entries for any var never written, and nothing writes this one before the first
// room, so the walk-in never fired. (door_reach_kh_test seeded the var to 0 by hand,
// which is why it passed.) Also: both decomps reset the League run on a WHITEOUT
// (EventScript_ResetEliteFour) — the port didn't, so a lost run left the entry shut.
//   1. real keys: PC 1F (4,2) Up -> LORELEI's room, walked in to (6,7) — no seeded var
//   2. a win opens her door -> BRUNO's room, walked in
//   3. a whiteout resets the run (flags cleared, scene var 0) like the decomp
//
//   node overworld/tests/kanto_e4_walk_test.mjs
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
const PORT = 9430;
const STATE = { username: 'e4walk', friendCode: 'E4WALK', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
	A(!(await W(() => window.__ow.Story.hasVar('VAR_MAP_SCENE_POKEMON_LEAGUE'))), '0. a real save has never written the League scene var');
	await W(() => { window.__ow.player.facing = 'up'; });
	await walk('ArrowUp');
	A(await waitMap('PokemonLeague_LoreleisRoom'), "1. the League door leads into LORELEI's room", JSON.stringify(await pos()));
	let p = await settle();
	A(p.map === 'PokemonLeague_LoreleisRoom' && p.x === 6 && p.y === 7, "1. the room's ON_FRAME walks you in from the entry warp (6,12) to (6,7)", JSON.stringify(p));
	A(await W(() => window.__ow.Story.getVar('VAR_MAP_SCENE_POKEMON_LEAGUE')) === 1, '1. ...and marks the run started (scene 1)');

	// 2. a win: the decomp's post-battle label opens her door
	await W(() => window.__ow.runScriptLabel('PokemonLeague_LoreleisRoom_EventScript_DefeatedLorelei'));
	await settle();
	A(await W(() => window.__ow.Story.getFlag('FLAG_DEFEATED_LORELEI')), '2. beating LORELEI sets FLAG_DEFEATED_LORELEI');
	await W(() => { const P = window.__ow.player; P.tx = 6; P.ty = 3; P.x = 96; P.y = 48; P.facing = 'up'; });
	await walk('ArrowUp');
	A(await waitMap('PokemonLeague_BrunosRoom'), "2. her open door leads on to BRUNO's room", JSON.stringify(await pos()));
	p = await settle();
	A(p.map === 'PokemonLeague_BrunosRoom' && p.y <= 7, "2. BRUNO's room walks you in too", JSON.stringify(p));

	// 2b. the rest of the chain: BRUNO -> AGATHA -> LANCE -> the CHAMPION's room
	const chain = [
		['PokemonLeague_BrunosRoom_EventScript_DefeatedBruno', [6, 3], 'PokemonLeague_AgathasRoom'],
		['PokemonLeague_AgathasRoom_EventScript_DefeatedAgatha', [6, 3], 'PokemonLeague_LancesRoom'],
		['PokemonLeague_LancesRoom_EventScript_DefeatedLance', [6, 6], 'PokemonLeague_ChampionsRoom'],
	];
	for (const [win, [x, y], next] of chain) {
		const before = await pos();
		await W(l => window.__ow.runScriptLabel(l), win);
		await settle();
		await W((x, y) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = 'up'; }, x, y);
		await walk('ArrowUp');
		const reached = await waitMap(next);
		const entry = await pos();   // the arrival tile, before the walk-in moves you
		p = await settle();
		A(reached, `2b. ${before.map}: the win opens the door on to ${next}`, JSON.stringify(entry));
		A(p.map === next && (p.y < entry.y || p.x !== entry.x), `2b. ${next}: you are walked in off the entry tile`, JSON.stringify([entry, p]));
	}

	// 3. a whiteout resets the League run, as both decomps do
	await W(() => window.__ow.whiteOut());
	await settle();
	const st = await W(() => ({ v: window.__ow.Story.getVar('VAR_MAP_SCENE_POKEMON_LEAGUE'), f: !!window.__ow.Story.getFlag('FLAG_DEFEATED_LORELEI') }));
	A(st.v === 0 && !st.f, '3. a whiteout resets the run (scene 0, LORELEI undefeated)', JSON.stringify(st));
	// 4. HOENN's ELITE FOUR stays on the port's own flow: SIDNEY's room is open at the bottom
	// (the CHAMPION's walk-in above starts BLUE's battle — drop its resume snapshot)
	await W(() => { if (window.__ow.battle) window.__ow.battle.active = null; localStorage.setItem('magepunk_region', 'HOENN'); localStorage.removeItem('magepunk_battle_v1'); });
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=EverGrandeCity_SidneysRoom&x=6&y=13`, { waitUntil: 'domcontentloaded' });
	await boot('EverGrandeCity_SidneysRoom');
	await settle(3000);
	await W(() => { window.__ow.player.facing = 'up'; });
	await walk('ArrowUp', 900);
	p = await settle(3000);
	A(p.map === 'EverGrandeCity_SidneysRoom' && p.y < 13, "4. HOENN: you can walk up into SIDNEY's room from its entry", JSON.stringify(p));
	// 5. JOHTO's (Crystal) ELITE FOUR: WILL's room entry is open floor
	await W(() => { localStorage.setItem('magepunk_region', 'JOHTO'); });
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=WillsRoom&x=5&y=17`, { waitUntil: 'domcontentloaded' });
	await boot('WillsRoom');
	await settle(3000);
	await W(() => { window.__ow.player.facing = 'up'; });
	await walk('ArrowUp', 900);
	p = await settle(3000);
	A(p.map === 'WillsRoom' && p.y < 17, "5. JOHTO: you can walk up into WILL's room from its entry", JSON.stringify(p));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
