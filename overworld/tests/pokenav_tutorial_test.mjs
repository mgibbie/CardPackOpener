// pokenav_tutorial_test.mjs — Rustboro's MATCH CALL tutorial lets the player go
// (bug:1793307311120, 2026-10-29, Instinct).
//
// After Mr. Stone's LETTER and POKeNAV, the Devon scientist adds MATCH CALL
// (RustboroCity_EventScript_ScientistAddMatchCall, the map's ON_FRAME at
// VAR_RUSTBORO_CITY_STATE 6) and then runs MatchCallTutorial: `special
// ScriptMenu_CreateStartMenuForPokenavTutorial`, and every VAR_RESULT but the
// POKeNAV row (3) loops to "Please select the POKeNAV." The special was not ported,
// VAR_RESULT kept a stale value, and the prompt came back forever with the scene
// holding every key — the story could not go on.
//   - the scene runs to its end: the scientist leaves, VAR_RUSTBORO_CITY_STATE = 7
//   - "Please select the POKeNAV" is never shown, whatever VAR_RESULT held before
//
//   node overworld/tests/pokenav_tutorial_test.mjs
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
const PORT = 9813;
const STATE = { username: 'pnavtut', friendCode: 'PNAV01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 20, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, maxHP: 60, curHP: 60, exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 }];
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
	// VAR_RESULT 1: what a finished script typically leaves behind (a won battle,
	// a YES) — the stale value the tutorial read
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { HOENN: { stone: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_RECEIVED_POKENAV: true },
			vars: { VAR_RUSTBORO_CITY_STATE: 6, VAR_RESULT: 1 } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=RustboroCity&x=12&y=16`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data && window.__ow.world.current?.name === 'RustboroCity' && !window.__ow.gateReport().loading).catch(() => false)); i++) await sleep(100);
	await sleep(800);
	// drive the scene: answer every dialog page, note each text, until it lets go
	const seen = [];
	let started = false, done = false;
	for (let i = 0; i < 400; i++) {
		const s = await page.evaluate(() => ({ cut: window.__ow.cutscene.blocking, dlg: window.__ow.dialog.blocking,
			text: JSON.stringify(window.__ow.dialog.pages || ''), state: window.__ow.Story.getVar('VAR_RUSTBORO_CITY_STATE') }));
		if (s.cut) started = true;
		if (s.dlg) { if (seen[seen.length - 1] !== s.text) seen.push(s.text); await page.keyboard.press('z'); }
		if (started && !s.cut && !s.dlg) { done = true; break; }
		if (seen.filter(t => /select the POK/i.test(t)).length > 3) break;   // the loop
		await sleep(120);
	}
	const st = await page.evaluate(() => ({ state: window.__ow.Story.getVar('VAR_RUSTBORO_CITY_STATE'), added: window.__ow.Story.getFlag('FLAG_ADDED_MATCH_CALL_TO_POKENAV'),
		hidden: window.__ow.Story.getFlag('FLAG_HIDE_RUSTBORO_CITY_SCIENTIST'), cut: window.__ow.cutscene.blocking }));
	A(started, 'the MATCH CALL scene starts on arrival (VAR_RUSTBORO_CITY_STATE 6)', JSON.stringify(st));
	A(done && !st.cut, 'the scene runs to its end and releases the player', JSON.stringify({ st, last: seen.slice(-3) }));
	A(!seen.some(t => /select the POK/i.test(t)), 'it never asks "Please select the POKeNAV" (the POKeNAV row is chosen)', JSON.stringify(seen.filter(t => /select/i.test(t)).slice(0, 2)));
	A(st.state === 7 && st.added && st.hidden, 'the scientist leaves: VAR_RUSTBORO_CITY_STATE 7, MATCH CALL added, his object hidden', JSON.stringify(st));
	// and the player can walk afterwards
	const y0 = await page.evaluate(() => window.__ow.player.ty);
	await page.keyboard.down('ArrowDown'); await sleep(350); await page.keyboard.up('ArrowDown'); await sleep(500);
	A(await page.evaluate(() => window.__ow.player.ty) !== y0, 'the player can move again');
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
