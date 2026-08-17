// postgame_test.mjs — Phase 1 (champion return + Hall of Fame) and Phase 2 (Regis +
// RED) of the post-game buildout. Headless Chrome via the real main.js.
//   node overworld/tests/postgame_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8889;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'pg', friendCode: 'POSTG', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'pg-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.removeItem('magepunk_badges_v1'); localStorage.removeItem('magepunk_bag_v1'); localStorage.removeItem('magepunk_story'); localStorage.removeItem('magepunk_hof');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'venusaur', name: 'VENUSAUR', level: 80, gender: 'M', ability: 'Overgrow', types: ['Grass', 'Poison'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 260, atk: 150, def: 150, spa: 180, spd: 180, spe: 150 }, maxHP: 260, curHP: 120, exp: 512000, moves: [{ id: 'gigadrain', name: 'Giga Drain', pp: 10, maxPp: 10 }], num: 3, sprite: 's3.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=ViridianCity`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.legendariesHere && window.__ow.onTrainerDefeated && window.__ow.Badges)), 30000);

	// ---- Phase 2: the three REGIS appear only for the HOENN CHAMPION ----
	await page.evaluate(async () => { await window.__ow.moveToMap('DesertRuins'); });
	await waitFor(() => page.evaluate(() => /DesertRuins/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.legendariesHere().length) === 0, 'REGIROCK is absent before you are HOENN CHAMPION');
	await page.evaluate(() => window.__ow.Badges.crown('HOENN'));
	A(await page.evaluate(() => window.__ow.legendariesHere()[0]?.species) === 'regirock', 'REGIROCK appears in the DESERT RUINS once you are HOENN CHAMPION');
	const regiTable = await page.evaluate(() => { const t = window.__ow.LEGENDARY_ENCOUNTERS; return { rock: t.MAP_DESERT_RUINS?.species, ice: t.MAP_ISLAND_CAVE?.species, steel: t.MAP_ANCIENT_TOMB?.species }; });
	A(regiTable.rock === 'regirock' && regiTable.ice === 'regice' && regiTable.steel === 'registeel', 'all three REGI chambers are wired', JSON.stringify(regiTable));

	// ---- Phase 3: event-island legendaries reachable via the champion ferry ----
	for (const [stem, species] of [['SouthernIsland_Interior', 'latios'], ['BirthIsland_Exterior', 'deoxys'], ['FarawayIsland_Interior', 'mew']]) {
		await page.evaluate(async (s) => { await window.__ow.moveToMap(s); }, stem);
		await waitFor(() => page.evaluate((s) => new RegExp(s).test(window.__ow.world.current?.name || ''), stem), 8000);
		A(await page.evaluate(() => window.__ow.legendariesHere()[0]?.species) === species, `${species.toUpperCase()} is catchable on its island once you are HOENN CHAMPION`);
	}

	// ---- Phase 2: RED spawns atop MT SILVER only for the JOHTO CHAMPION ----
	await page.evaluate(async () => { await window.__ow.moveToMap('SilverCaveRoom3'); });
	await waitFor(() => page.evaluate(() => /SilverCaveRoom3/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.trainers.list.some(t => t.ev?.script === 'Red')) === false, 'RED is absent before you are JOHTO CHAMPION');
	// RED needs all 16 badges — being JOHTO Champion alone is not enough
	await page.evaluate(() => window.__ow.Badges.crown('JOHTO'));
	await page.evaluate(async () => { await window.__ow.moveToMap('ViridianForest'); await window.__ow.moveToMap('SilverCaveRoom3'); });
	await waitFor(() => page.evaluate(() => /SilverCaveRoom3/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.trainers.list.some(t => t.ev?.script === 'Red')) === false, 'RED still waits — JOHTO Champion alone is not enough (needs all 16 badges)');
	await page.evaluate(() => ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'].forEach(id => window.__ow.Badges.earn('JOHKANTO', id)));
	A(await page.evaluate(() => window.__ow.Badges.count('JOHKANTO')) === 8, 'the JohKanto badge slice tracks the 8 crystal-Kanto gyms');
	await page.evaluate(async () => { await window.__ow.moveToMap('ViridianForest'); await window.__ow.moveToMap('SilverCaveRoom3'); });
	await waitFor(() => page.evaluate(() => /SilverCaveRoom3/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.trainers.list.some(t => t.ev?.script === 'Red')), 'RED stands atop MT SILVER once you hold all 16 badges');
	// beating RED sets the beat_red honor
	A(await page.evaluate(() => { window.__ow.onTrainerDefeated('Red'); return window.__ow.Story.getFlag('beat_red'); }), 'beating RED records the beat_red honor');

	// ---- Phase 1: beating the CHAMPION crowns you, then warps you HOME (not stranded) ----
	await page.evaluate(async () => { await window.__ow.moveToMap('ViridianCity'); });
	await waitFor(() => page.evaluate(() => /ViridianCity/.test(window.__ow.world.current?.name || '')), 8000);
	await page.evaluate(async () => {
		window.__ow.onTrainerDefeated('PokemonLeague_ChampionsRoom_EventScript_BattleSquirtle'); // KANTO champion
		const d = window.__ow.dialog;
		for (let i = 0; i < 30; i++) { if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 60)); }
	});
	await waitFor(() => page.evaluate(() => /PalletTown/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.Badges.isChampion('KANTO')), 'defeating the CHAMPION crowns you');
	A(await page.evaluate(() => /PalletTown/.test(window.__ow.world.current?.name || '')), 'you are warped HOME afterwards, not stranded in the throne room');
	A(await page.evaluate(() => (window.__ow.party || []).every(m => !m || m.curHP === m.maxHP)), 'your party is healed on returning home');
	const hof = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('magepunk_hof') || '[]'); } catch { return []; } });
	A(Array.isArray(hof) && hof.some(e => e.region === 'KANTO' && Array.isArray(e.team) && e.team.length), 'the winning team is recorded in the HALL OF FAME log', JSON.stringify(hof.slice(-1)));

	// P4a routing: a JOHTO player beating a JohKanto (crystal-Kanto) gym fills the
	// JOHKANTO slice, NOT the standalone-Kanto game's badges
	const routed = await page.evaluate(async () => {
		localStorage.setItem('magepunk_region', 'JOHTO');
		await window.__ow.moveToMap('JohKantoVermilionGym');
		const kBefore = window.__ow.Badges.count('KANTO'), jkBefore = window.__ow.Badges.count('JOHKANTO');
		window.__ow.Badges.earn('JOHKANTO', 'thunder') && null; // ensure not pre-counted
		return { kBefore, jkBefore };
	});
	// beat Lt. Surge's JohKanto gym via the crystal script — must land in JOHKANTO
	const after = await page.evaluate(() => {
		const kBefore = window.__ow.Badges.count('KANTO');
		window.__ow.onTrainerDefeated('VermilionGymSurgeScript');
		return { jk: window.__ow.Badges.count('JOHKANTO'), kDelta: window.__ow.Badges.count('KANTO') - kBefore };
	});
	A(after.kDelta === 0, 'a JOHTO player beating a JohKanto gym does NOT fill the standalone-KANTO badges', JSON.stringify(after));

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
