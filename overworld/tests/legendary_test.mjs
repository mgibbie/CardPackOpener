// legendary_test.mjs — the Legendary Hunt. Part 1 (pure node): every added
// legendary's species + overworld sprite exist. Part 2 (headless, real main.js):
// LEGENDARY_ENCOUNTERS gains the birds/Mewtwo/Ho-Oh/Lugia; a gated legendary
// (Mewtwo/Ho-Oh/Lugia) is absent until its requirement is met (Champion / the
// wing) and appears once it is; an ungated bird is always present; and becoming
// JOHTO Champion grants the Silver/Rainbow Wing.
//
// Standalone (Part 2 needs headless Chrome + puppeteer-core + local data); NOT in
// run-all.   node overworld/tests/legendary_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8881;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'leg', friendCode: 'LEGEND', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

// ---------- Part 1: pure-node data checks ----------
{
	const sp = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
	const keys = new Set((Array.isArray(sp) ? sp.map(s => s.id || s.speciesId || s.name) : Object.keys(sp)).map(k => String(k).toLowerCase()));
	const ow = new Set(fs.readdirSync(path.join(ROOT, 'overworld/data/pokemon_ow')).map(f => f.replace('.png', '')));
	for (const s of ['articuno', 'zapdos', 'moltres', 'mewtwo', 'hooh', 'lugia']) {
		A(keys.has(s), `species "${s}" resolves in battle data`);
		A(ow.has(s), `overworld sprite for "${s}" exists (visible legendary)`);
	}
}

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
			localStorage.setItem('magepunk_mp_token_v1', 'leg-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.removeItem('magepunk_badges_v1'); localStorage.removeItem('magepunk_bag_v1'); localStorage.removeItem('magepunk_story');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charizard', name: 'CHARIZARD', level: 80, gender: 'M', ability: 'Blaze', types: ['Fire', 'Flying'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 250, atk: 160, def: 150, spa: 180, spd: 160, spe: 170 }, maxHP: 250, curHP: 250, exp: 512000, moves: [{ id: 'flamethrower', name: 'Flamethrower', pp: 15, maxPp: 15 }], num: 6, sprite: 's6.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=CeruleanCave_B1F`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.legendaryHere && window.__ow.LEGENDARY_ENCOUNTERS)), 30000);

	// the table gained the new legendaries
	const table = await page.evaluate(() => {
		const t = window.__ow.LEGENDARY_ENCOUNTERS;
		return { articuno: t.MAP_SEAFOAM_ISLANDS_B4F?.species, mewtwo: t.MAP_CERULEAN_CAVE_B1F?.species, hooh: t.MAP_TIN_TOWER_ROOF?.species, lugia: t.MAP_WHIRL_ISLAND_LUGIA_CHAMBER?.species, count: Object.keys(t).length };
	});
	A(table.count >= 9, 'LEGENDARY_ENCOUNTERS now covers 9+ legendaries', JSON.stringify(table.count));
	A(table.mewtwo === 'mewtwo' && table.hooh === 'hooh' && table.lugia === 'lugia' && table.articuno === 'articuno', 'the new legendary rows are present', JSON.stringify(table));

	// Mewtwo is gated on being KANTO Champion
	A(await page.evaluate(() => window.__ow.legendaryHere() === null), 'MEWTWO is absent in Cerulean Cave before you are Champion');
	A(await page.evaluate(() => { window.__ow.Badges.crown('KANTO'); return window.__ow.legendaryHere()?.species; }) === 'mewtwo', 'MEWTWO appears once you are the KANTO Champion');

	// Ho-Oh needs the Rainbow Wing
	await page.evaluate(() => window.__ow.moveToMap('TinTowerRoof'));
	await waitFor(() => page.evaluate(() => /TinTowerRoof/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.legendaryHere() === null), 'HO-OH is absent without the RAINBOW WING');
	A(await page.evaluate(() => { window.__ow.Bag.addItem('rainbowwing'); return window.__ow.legendaryHere()?.species; }) === 'hooh', 'HO-OH answers once you hold the RAINBOW WING');

	// an ungated bird is simply there
	await page.evaluate(() => window.__ow.moveToMap('SeafoamIslands_B4F'));
	await waitFor(() => page.evaluate(() => /SeafoamIslands_B4F/.test(window.__ow.world.current?.name || '')), 8000);
	A(await page.evaluate(() => window.__ow.legendaryHere()?.species) === 'articuno', 'ARTICUNO is catchable in its lair (ungated)');

	// becoming JOHTO Champion grants the wings (test with Silver Wing, never added manually)
	const grant = await page.evaluate(() => {
		const before = window.__ow.Bag.count('silverwing');
		window.__ow.onTrainerDefeated('LancesRoomLanceScript'); // JOHTO champion
		const d = window.__ow.dialog; let n = 0; while (d.blocking && n++ < 20) d.key('x');
		return { before, after: window.__ow.Bag.count('silverwing'), rainbow: window.__ow.Bag.count('rainbowwing') };
	});
	A(grant.before === 0 && grant.after > 0, 'becoming JOHTO Champion grants the SILVER WING', JSON.stringify(grant));
	A(grant.rainbow > 0, 'becoming JOHTO Champion also grants the RAINBOW WING');

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
