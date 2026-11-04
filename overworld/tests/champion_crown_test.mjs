// champion_crown_test.mjs — beating a Champion through the decomp's own League
// script is recorded: crowned once, the HALL OF FAME closes the run, home after.
//
// 2026-10-12, Instinct (bug:1791831848398 + bug:1791832365874): after #679 made the
// FRLG League walk-ins fire, the Champion's room ON_FRAME script starts Gary's
// battle with NO talker, so onTrainerDefeated(undefined) recorded nothing — not
// KANTO champion, no Hall of Fame, the NEXT line still said VICTORY ROAD, and a
// reload left the player in the Hall of Fame with Gary waiting to fight again.
//   1. the decomp path: walk-in -> Gary -> win -> crowned KANTO (once)
//   2. Oak walks you to the HALL OF FAME; `special EnterHallOfFame` closes the run:
//      the team recorded, home to PALLET, FLAG_SYS_GAME_CLEAR reads true in Kanto
//      (and NOT in Hoenn — the flag name is shared), NEXT moves past the League
//   3. a save from before the fix (FLAG_DEFEATED_CHAMP, never crowned, standing in
//      the Hall of Fame) heals on load without a fight: crowned, recorded, home
//
//   node overworld/tests/champion_crown_test.mjs
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
const PORT = 9440;
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

	// ===== 1-2. the decomp path =====
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PokemonLeague_ChampionsRoom&x=6&y=19`, { waitUntil: 'domcontentloaded' });
	await boot('PokemonLeague_ChampionsRoom');
	let started = false;
	for (let i = 0; i < 120 && !started; i++) {
		const s = await W(() => ({ b: !!window.__ow.battle.active, d: !!window.__ow.dialog.blocking }));
		started = s.b; if (!started) { if (s.d) await page.keyboard.press('z'); await sleep(120); }
	}
	A(started, "1. the Champion's room walk-in starts the CHAMPION's battle", JSON.stringify(await pos()));
	const ts = await W(() => { const t = window.__ow.world.current.ts || {}; return { primary: !!t.primary, secondary: !!t.secondary }; });
	A(ts.primary && ts.secondary, "1. the Champion's room's tilesheets load (Instinct saw it black: the slow-tilesheet bug, #679)", JSON.stringify(ts));
	await W(() => window.__ow.battle.finish('victory'));
	// read the crown while still in the Champion's room: the win itself records it,
	// not the HALL OF FAME's catch-all
	let crowned = null;
	for (let i = 0; i < 60; i++) {
		const c = await W(() => ({ champ: window.__ow.Badges.isChampion('KANTO'), map: window.__ow.world.current.name, b: !!window.__ow.battle.active }));
		if (c.champ || !c.b) { crowned = c; if (c.champ) break; }
		await sleep(100);
	}
	A(crowned && crowned.champ && crowned.map === 'PokemonLeague_ChampionsRoom', '1. the win crowns you KANTO CHAMPION in the CHAMPION ROOM (a map-script battle has no talker)', JSON.stringify(crowned));
	// Oak walks you to the Hall of Fame; its special closes the run and sends you home
	let home = false;
	for (let i = 0; i < 300 && !home; i++) {
		const p = await pos();
		home = p.map === 'PalletTown';
		if (!home) { if (p.dlg) await page.keyboard.press('z'); await sleep(150); }
	}
	A(home, '2. ...Oak, the HALL OF FAME, then home to PALLET TOWN', JSON.stringify(await pos()));
	await sleep(600);
	const after = await W(() => ({
		hof: JSON.parse(localStorage.getItem('magepunk_hof') || '[]').filter(h => h.region === 'KANTO').length,
		clear: window.__ow.Story.getFlag('FLAG_SYS_GAME_CLEAR'),
		stored: window.__ow.Story.getStoredFlag('FLAG_SYS_GAME_CLEAR'),
		next: document.getElementById('objective')?.textContent || '',
		scene: window.__ow.Story.getVar('VAR_MAP_SCENE_POKEMON_LEAGUE'),
	}));
	A(after.hof === 1, '2. the team is recorded in the HALL OF FAME exactly once', JSON.stringify(after));
	A(after.clear === true && after.stored === false, '2. FLAG_SYS_GAME_CLEAR reads true in KANTO, from the crown (not stored — the name is shared with HOENN)', JSON.stringify(after));
	A(!/VICTORY ROAD/.test(after.next), '2. the NEXT line has moved past the League', after.next);
	A(after.scene === 0, '2. the League run is reset for a rematch (scene 0)', JSON.stringify(after));
	const hoennClear = await W(async () => { await window.__ow.moveToMap('LittlerootTown'); await new Promise(r => setTimeout(r, 1500)); return window.__ow.Story.getFlag('FLAG_SYS_GAME_CLEAR'); });
	A(hoennClear === false, '2. ...and false in HOENN, whose League is still unbeaten', String(hoennClear));

	// ===== 3. a pre-fix save heals on load =====
	await W(() => {
		const st = JSON.parse(localStorage.getItem('magepunk_story'));
		st.flags.FLAG_DEFEATED_CHAMP = true; localStorage.setItem('magepunk_story', JSON.stringify(st));
		const b = JSON.parse(localStorage.getItem('magepunk_badges_v1')); b.champion = {}; localStorage.setItem('magepunk_badges_v1', JSON.stringify(b));
		localStorage.setItem('magepunk_hof', '[]');
		localStorage.setItem('magepunk_pos_v1', JSON.stringify({ map: 'PokemonLeague_HallOfFame', x: 5, y: 5, back: null, dyn: null }));
		localStorage.removeItem('magepunk_battle_v1');
	});
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	let healed = false;
	for (let i = 0; i < 150 && !healed; i++) { healed = (await pos().catch(() => ({}))).map === 'PalletTown'; if (!healed) await sleep(150); }
	const h = await W(() => ({ champ: window.__ow.Badges.isChampion('KANTO'), hof: JSON.parse(localStorage.getItem('magepunk_hof') || '[]').length, battle: !!window.__ow.battle.active }));
	A(h.champ && h.hof === 1, '3. a save that beat GARY but was never crowned is crowned + recorded on load', JSON.stringify(h));
	A(healed && !h.battle, '3. ...and walked out of the HALL OF FAME to PALLET TOWN, with no fight replayed', JSON.stringify(await pos()));

	// ===== 4. HOENN: WALLACE's script walks on to its own HALL OF FAME (special GameClear) =====
	await W(() => {
		const b = JSON.parse(localStorage.getItem('magepunk_badges_v1'));
		b.badges.HOENN = { stone: true, knuckle: true, dynamo: true, heat: true, balance: true, feather: true, mind: true, rain: true };
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(b));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_pos_v1', JSON.stringify({ map: 'EverGrandeCity_ChampionsRoom', x: 6, y: 8, back: null, dyn: null }));
		localStorage.removeItem('magepunk_battle_v1');
	});
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	await boot('EverGrandeCity_ChampionsRoom');
	await W(() => window.__ow.runScriptLabel('EverGrandeCity_ChampionsRoom_EventScript_Wallace'));
	let wb = false;
	for (let i = 0; i < 80 && !wb; i++) { const s = await W(() => ({ b: !!window.__ow.battle.active, d: !!window.__ow.dialog.blocking })); wb = s.b; if (!wb) { if (s.d) await page.keyboard.press('z'); await sleep(120); } }
	A(wb, "4. WALLACE's battle starts", JSON.stringify(await pos()));
	await W(() => window.__ow.battle.finish('victory'));
	let hoennHome = false, sawHof = false;
	for (let i = 0; i < 300 && !hoennHome; i++) {
		const p = await pos();
		if (p.map === 'EverGrandeCity_HallOfFame') sawHof = true;
		hoennHome = p.map === 'LittlerootTown';
		if (!hoennHome) { if (p.dlg) await page.keyboard.press('z'); await sleep(150); }
	}
	const hh = await W(() => ({ champ: window.__ow.Badges.isChampion('HOENN'), hof: JSON.parse(localStorage.getItem('magepunk_hof') || '[]').filter(h => h.region === 'HOENN').length }));
	A(hh.champ && hh.hof === 1, '4. WALLACE beaten: HOENN crowned and recorded once', JSON.stringify(hh));
	A(sawHof && hoennHome, '4. ...through the HALL OF FAME, then home to LITTLEROOT', JSON.stringify({ sawHof, at: await pos() }));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
