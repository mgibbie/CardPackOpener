// blockers_ingame_test.mjs — headless in-game check that authentic blockers actually
// block and then clear when their condition is met (the strand-safety graph is proven
// separately by blockers_test.mjs; this verifies the live wiring). Headless Chrome.
//   node overworld/tests/blockers_ingame_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8887;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'blk', friendCode: 'BLOCK', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
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
			localStorage.setItem('magepunk_mp_token_v1', 'blk-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.removeItem('magepunk_badges_v1'); localStorage.removeItem('magepunk_bag_v1'); localStorage.removeItem('magepunk_story');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'pikachu', name: 'PIKACHU', level: 50, gender: 'M', ability: 'Static', types: ['Electric'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 120, atk: 80, def: 60, spa: 90, spd: 80, spe: 120 }, maxHP: 120, curHP: 120, exp: 125000, moves: [{ id: 'thunderbolt', name: 'Thunderbolt', pp: 15, maxPp: 15 }], num: 25, sprite: 's25.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route3`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.blockers && window.__ow.world.current)), 30000);

	// on Route 3 with 0 badges, the GYM GUIDE blocks the west entry tiles
	await page.evaluate(async () => { await window.__ow.moveToMap('Route3'); });
	await waitFor(() => page.evaluate(() => /Route3/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.blockers.blocks(0, 11)), 'Route 3 guard blocks the west entry at 0 badges');
	A(await page.evaluate(() => window.__ow.blockers.kindAt(0, 11)?.id) === 'k_route3', 'the blocker there is the ROUTE 3 gym-guide');
	A(await page.evaluate(() => /BOULDER BADGE/.test(window.__ow.blockers.messageAt(0, 11) || '')), 'bumping it mentions the BOULDER BADGE');

	// earn the Boulder Badge -> reload the map -> the guard is gone, the road is open
	await page.evaluate(() => { window.__ow.Badges.earn('KANTO', 'boulder'); });
	await page.evaluate(async () => { window.__ow.blockers.loadForMap(); });
	A(await page.evaluate(() => !window.__ow.blockers.blocks(0, 11)), 'the guard steps aside once you hold the BOULDER BADGE');

	// a giver grants its key item once (Fuji -> POKe FLUTE, after the Rocket Hideout beat)
	await page.evaluate(async () => { await window.__ow.moveToMap('LavenderTown_VolunteerPokemonHouse'); });
	await waitFor(() => page.evaluate(() => /Volunteer/i.test(window.__ow.world.current?.name || '')), 8000);
	const before = await page.evaluate(() => window.__ow.Bag.count('pokeflute'));
	// prereq unmet -> no grant yet
	const preMsg = await page.evaluate(() => window.__ow.blockers.grantAt(3, 3));
	A(before === 0 && await page.evaluate(() => window.__ow.Bag.count('pokeflute')) === 0, 'FUJI withholds the FLUTE until TEAM ROCKET is dealt with');
	// meet the prereq -> grant exactly once
	const after = await page.evaluate(() => {
		window.__ow.Story.setFlag('villain_kanto_hideout');
		window.__ow.blockers.grantAt(3, 3);            // first grant
		const n1 = window.__ow.Bag.count('pokeflute');
		window.__ow.blockers.grantAt(3, 3);            // second call must not double-grant
		return { n1, n2: window.__ow.Bag.count('pokeflute') };
	});
	A(after.n1 === 1 && after.n2 === 1, 'FUJI grants the POKe FLUTE exactly once', JSON.stringify(after));

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
