// new_game_hide_flags_test.mjs — FRLG/Emerald's new-game hide flags are seeded.
//
// 2026-10-10, Instinct (bug:1791613010215, BLOCKER): on Indigo Plateau the
// credits-only PROF. OAK and rival (script 0x0) stood on (11,6), the League's
// only door, so an 8-badge save could not reach the Elite Four. pokefirered's
// NewGameInitData runs EventScript_ResetAllMapFlags, which SETS
// FLAG_HIDE_CREDITS_OAK / _RIVAL (and 47 more; Emerald 158); this port never ran
// it. seedNewGameFlags (ow_story.js, list from tools/gen_new_game_flags.mjs)
// applies the flags no decomp script ever clears, to every save (the rest are
// cleared by opening scenes this port skips — Oak's/Birch's lab).
//   1. data: both regions' lists, the credits pair among Kanto's never-cleared
//   2. Instinct's state (existing save, flags clear) at IndigoPlateau_Exterior
//      (11,7): the credits pair are hidden, (11,6) is free, walking up enters
//      IndigoPlateau_PokemonCenter_1F; a story-cleared flag is left alone
//   3. a fresh game gets the never-cleared list, and the lab professor stays
//
//   node overworld/tests/new_game_hide_flags_test.mjs
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
const PORT = 9380;
const STATE = { username: 'indigo', friendCode: 'INDIGO', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 160, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 160, curHP: 160,
	exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const KANTO_BADGES = { badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true } }, champion: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. data =====
const STORY_CLEARED = 'FLAG_HIDE_OAK_IN_HIS_LAB';
let NEW_GAME_FLAGS = { KANTO: { all: [], neverCleared: [] }, HOENN: { all: [], neverCleared: [] } };
try { ({ NEW_GAME_FLAGS } = await import('../new_game_flags.js')); } catch (e) { A(false, '1. overworld/new_game_flags.js exists', e.message); }
A(NEW_GAME_FLAGS.KANTO.all.length >= 40 && NEW_GAME_FLAGS.HOENN.all.length >= 150, "1. both decomps' ResetAllMapFlags lists are extracted",
	`${NEW_GAME_FLAGS.KANTO.all.length}/${NEW_GAME_FLAGS.HOENN.all.length}`);
A(['FLAG_HIDE_CREDITS_OAK', 'FLAG_HIDE_CREDITS_RIVAL'].every(f => NEW_GAME_FLAGS.KANTO.neverCleared.includes(f)),
	'1. the credits OAK/rival are never cleared by any script (safe on existing saves)');
A(NEW_GAME_FLAGS.KANTO.all.includes(STORY_CLEARED) && !NEW_GAME_FLAGS.KANTO.neverCleared.includes(STORY_CLEARED),
	`1. ${STORY_CLEARED} is in the list but cleared by story (new games only)`);

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
	const boot = async (seed, url, map) => {
		const page = await browser.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(seed, STATE, PARTY, KANTO_BADGES);
		await page.goto(`http://localhost:${PORT}/overworld/index.html${url}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
		return { page, errors };
	};
	const flags = (page, list) => page.evaluate(l => {
		const st = JSON.parse(localStorage.getItem('magepunk_story') || '{}');
		return Object.fromEntries(l.map(f => [f, !!(st.flags || {})[f]]));
	}, list);

	// ===== 2. Instinct: an existing 8-badge Kanto save, the flags never set =====
	{
		const { page, errors } = await boot((st, party, badges) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, crystal_events_seeded: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, '?map=IndigoPlateau_Exterior&x=11&y=7', 'IndigoPlateau_Exterior');
		const f = await flags(page, ['FLAG_HIDE_CREDITS_OAK', 'FLAG_HIDE_CREDITS_RIVAL', STORY_CLEARED]);
		A(f.FLAG_HIDE_CREDITS_OAK && f.FLAG_HIDE_CREDITS_RIVAL, '2. an existing save gets the credits OAK/rival hidden on load', JSON.stringify(f));
		A(!f[STORY_CLEARED], `2. ...but a story-cleared flag (${STORY_CLEARED}) is left alone on an existing save`, JSON.stringify(f));
		const onDoor = await page.evaluate(() => window.__ow.npcs.list.filter(n => n.tx === 11 && n.ty === 6 && !n.hidden).length);
		A(onDoor === 0, '2. nobody stands on the League door (11,6)', String(onDoor));
		await page.keyboard.down('ArrowUp'); await sleep(350); await page.keyboard.up('ArrowUp');
		let map = null;
		for (let i = 0; i < 60; i++) { map = await page.evaluate(() => window.__ow.world.current && window.__ow.world.current.name); if (map === 'IndigoPlateau_PokemonCenter_1F') break; await sleep(100); }
		A(map === 'IndigoPlateau_PokemonCenter_1F', '2. walking up from (11,7) enters the League (IndigoPlateau_PokemonCenter_1F)', map);
		// a scene's `addobject` still brings the hidden actor on (TrySpawnObjectEvent
		// ignores the flag): back outside, show the credits OAK through a cutscene
		await page.evaluate(() => window.__ow.moveToMap('IndigoPlateau_Exterior', 11, 8));
		for (let i = 0; i < 60 && (await page.evaluate(() => window.__ow.world.current.name)) !== 'IndigoPlateau_Exterior'; i++) await sleep(100);
		await sleep(800);
		const spawned = await page.evaluate(async () => {
			const O = window.__ow;
			O.startCutscene([{ op: 'showobj', who: 'LOCALID_CREDITS_PROF_OAK' }, { op: 'setflag', flag: 'test_after_show' }]);
			for (let i = 0; i < 40 && !O.Story.getFlag('test_after_show'); i++) await new Promise(r => setTimeout(r, 50));
			const n = O.npcById('LOCALID_CREDITS_PROF_OAK');
			return { resumed: !!O.Story.getFlag('test_after_show'), at: n ? [n.tx, n.ty] : null, flag: !!O.Story.getFlag('FLAG_HIDE_CREDITS_OAK') };
		});
		A(spawned.resumed && spawned.at && spawned.at[0] === 11 && spawned.at[1] === 6 && spawned.flag,
			'2. a scene `addobject` spawns the hidden credits OAK (flag stays set) and the script carries on', JSON.stringify(spawned));
		A(errors.length === 0, '2. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}

	// ===== 3. a fresh game: the whole list =====
	{
		const { page } = await boot((st) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, '?map=PalletTown&x=10&y=10', 'PalletTown');
		const nc = [...NEW_GAME_FLAGS.KANTO.neverCleared, ...NEW_GAME_FLAGS.HOENN.neverCleared];
		const f = await flags(page, [...nc, STORY_CLEARED]);
		const missing = nc.filter(x => !f[x]);
		A(nc.length > 0 && missing.length === 0, `3. a fresh game starts with all ${nc.length} never-cleared hide flags set`, missing.slice(0, 5).join(' '));
		A(!f[STORY_CLEARED], `3. ...and not ${STORY_CLEARED}: the port skips the scene that clears it, so Oak stays in his lab`);
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
