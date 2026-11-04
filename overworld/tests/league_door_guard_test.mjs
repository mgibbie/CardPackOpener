// league_door_guard_test.mjs — the INDIGO PLATEAU door guard lets a challenger
// with 8 badges through to the ELITE FOUR.
//
// 2026-10-12, Instinct (still blocked after #674): inside the Indigo Plateau
// POKeMON CENTER the door guard stood on (4,2), in front of LORELEI's door (4,1),
// and said nothing. pokefirered's ON_TRANSITION moves her there only in the
// POSTGAME (IsNationalPokedexEnabled && !FLAG_SYS_CAN_LINK_WITH_RS: "LORELEI is
// absent"); she normally stands aside at (5,3). The port answered
// IsNationalPokedexEnabled = 1 for every game. Now it reads the national dex state
// (`special EnableNationalPokedex`, or being this region's champion).
//   1. 8 badges, not champion: the guard stands aside at (5,3); walking up from
//      (4,4) reaches POKEMON LEAGUE LORELEI's room
//   2. Kanto champion (postgame, Sevii not finished): the decomp's closure applies,
//      the guard blocks (4,2)
//
//   node overworld/tests/league_door_guard_test.mjs
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
const PORT = 9400;
const STATE = { username: 'indigo', friendCode: 'INDIGO', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
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

async function run(champ) {
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, champ) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_HIDE_CREDITS_OAK: true, FLAG_HIDE_CREDITS_RIVAL: true }, vars: {} }));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true } }, champion: champ ? { KANTO: true } : {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, champ);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
	};
	const guard = () => page.evaluate(() => { const g = (window.__ow.npcs.list || []).find(n => /DoorGuard/.test(n.ev?.script || '')); return g ? [g.tx, g.ty] : null; });
	const walk = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(500); };
	const mapName = () => page.evaluate(() => window.__ow.world.current && window.__ow.world.current.name);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=IndigoPlateau_PokemonCenter_1F&x=4&y=4`, { waitUntil: 'domcontentloaded' });
	await boot('IndigoPlateau_PokemonCenter_1F');
	const g = await guard();
	A(champ ? (g && g[0] === 4 && g[1] === 2) : (g && g[0] === 5 && g[1] === 3),
		champ ? '2. a Kanto champion meets the postgame closure: the guard blocks (4,2)' : '1. with 8 badges (not champion) the door guard stands aside at (5,3)', JSON.stringify(g));
	if (!champ) {
		for (let i = 0; i < 4 && (await mapName()) !== 'PokemonLeague_LoreleisRoom'; i++) await walk('ArrowUp');
		for (let i = 0; i < 40 && (await mapName()) !== 'PokemonLeague_LoreleisRoom'; i++) await sleep(100);
		A((await mapName()) === 'PokemonLeague_LoreleisRoom', "1. ...and walking up through the door reaches LORELEI's room", await mapName());
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
}
}
await run(false);
await run(true);
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
