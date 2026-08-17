// dive_test.mjs — Sootopolis is now reachable (its dropped dive-in is restored in
// divelinks.js). Drives the real game: DIVE (emerge) in Underwater_SootopolisCity
// surfaces into the Sootopolis lake on a valid SURFABLE tile, the gym is present,
// and DIVE again dives back down onto a walkable seabed tile — so Hoenn's 8th gym
// (Wallace) can be reached and the region completed.
//
// Standalone (needs headless Chrome + puppeteer-core + local data); NOT in run-all.
//   node overworld/tests/dive_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8879;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'dive', friendCode: 'DIVEEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'dive-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'mudkip', name: 'MUDKIP', nickname: null, level: 40, gender: 'M', ability: 'Torrent', types: ['Water'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 110, atk: 80, def: 70, spa: 70, spd: 70, spe: 60 }, maxHP: 110, curHP: 110, exp: 64000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'dive', name: 'Dive', pp: 10, maxPp: 10 }], num: 258, sprite: 'mudkip.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Underwater_SootopolisCity`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.HM_FIELD && window.__ow.world?.current?.name)), 30000);
	A(booted, 'booted into Underwater_SootopolisCity');
	A(await page.evaluate(() => window.__ow.world.current.name) === 'Underwater_SootopolisCity', 'start map is the Sootopolis underwater room');

	// EMERGE: DIVE in the underwater room surfaces into Sootopolis
	await page.evaluate(() => window.__ow.HM_FIELD.dive.use());
	const surfaced = await waitFor(() => page.evaluate(() => window.__ow.world.current.name === 'SootopolisCity'), 8000);
	A(surfaced, 'using DIVE (emerge) surfaces into SootopolisCity');
	const land = await page.evaluate(() => {
		const w = window.__ow.world, p = window.__ow.player;
		return { map: w.current.name, tx: p.tx, ty: p.ty, surfing: p.surfing, onWater: w.isSurfable(p.tx, p.ty), passable: w.isPassable(p.tx, p.ty) };
	});
	A(land.onWater === true, 'the player emerges onto a valid SURFABLE lake tile', JSON.stringify(land));
	A(land.surfing === true, 'the player is surfing after emerging', JSON.stringify(land));

	// the gym is present in Sootopolis (so it can actually be entered/beaten)
	const gym = await page.evaluate(() => (window.__ow.world.warps || []).some(w => /SOOTOPOLIS_CITY_GYM/.test(w.dest_map)));
	A(gym, 'SootopolisCity has a warp into its GYM (Hoenn gym 8 is enterable)');

	// DIVE back down: from the lake, DIVE returns to the underwater room on land
	await page.evaluate(() => window.__ow.HM_FIELD.dive.use());
	const dived = await waitFor(() => page.evaluate(() => window.__ow.world.current.name === 'Underwater_SootopolisCity'), 8000);
	A(dived, 'DIVE from the Sootopolis lake returns to the underwater room');
	const back = await page.evaluate(() => { const w = window.__ow.world, p = window.__ow.player; return { surfing: p.surfing, passable: w.isPassable(p.tx, p.ty) }; });
	A(back.surfing === false && back.passable === true, 'you land on walkable seabed (not stuck)', JSON.stringify(back));

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
	console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
