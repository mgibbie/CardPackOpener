// divewarp_test.mjs — the decomp's `setdivewarp`, restored (tools/gen_divewarps.mjs).
//
// 2026-10-07, two of Instinct's bug reports:
//   * Underwater_SeafloorCavern had no way up: DIVE said "the water isn't deep
//     enough", so Team Aqua's hideout climax (and the Hoenn story after it) was
//     unreachable. pokeemerald surfaces it with ON_RESUME's
//     `setdivewarp MAP_SEAFLOOR_CAVERN_ENTRANCE, 10, 17`.
//   * the Abandoned Ship's hidden floor had no way back out: its corridors'
//     `setdivewarp MAP_ABANDONED_SHIP_UNDERWATER1, 5, 4` was never ported.
// Every room entered by DIVE gets its link from the decomp now (16 setdivewarps),
// including the Sealed Chamber's position-dependent surface.
//   node overworld/tests/divewarp_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const REF = process.env.MAGEPUNK_REF || path.resolve(ROOT, '..', 'Magepunk66', 'Reference');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9251;
const STATE = { username: 'divewarp', friendCode: 'DIVEW1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'mudkip', name: 'MUDKIP', nickname: null, level: 40, gender: 'M', ability: 'Torrent', types: ['Water'], friend: 70,
	ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 110, atk: 80, def: 70, spa: 70, spd: 70, spe: 60 }, maxHP: 110, curHP: 110,
	exp: 64000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'dive', name: 'Dive', pp: 10, maxPp: 10 }], num: 258, sprite: 'mudkip.png',
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. data: every setdivewarp in pokeemerald has its link =====
{
	const { EXTRA_DIVE } = await import('../divelinks.js');
	const root = path.join(REF, 'pokeemerald', 'data', 'maps');
	const want = fs.existsSync(root) ? fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'scripts.inc')) && /setdivewarp/.test(fs.readFileSync(path.join(root, d, 'scripts.inc'), 'utf8'))) : [];
	const miss = want.filter(d => !EXTRA_DIVE[d]);
	A(want.length >= 15 && miss.length === 0, `1. all ${want.length} pokeemerald maps with a setdivewarp have their dive/emerge link`, miss.join(', ') || String(want.length));
	A(EXTRA_DIVE.Underwater_SeafloorCavern?.emerge?.map === 'MAP_SEAFLOOR_CAVERN_ENTRANCE', '1. Underwater_SeafloorCavern surfaces into SeafloorCavern_Entrance', JSON.stringify(EXTRA_DIVE.Underwater_SeafloorCavern));
	A(EXTRA_DIVE.AbandonedShip_HiddenFloorCorridors?.dive?.map === 'MAP_ABANDONED_SHIP_UNDERWATER1', "1. the Abandoned Ship's hidden corridors dive back to Underwater1", JSON.stringify(EXTRA_DIVE.AbandonedShip_HiddenFloorCorridors));
}

// ===== 2. the real game =====
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
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ HOENN: [1, 2, 3, 4, 5, 6, 7] }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const mapName = () => page.evaluate(() => window.__ow.world.current && window.__ow.world.current.name);
	const waitMap = async m => { for (let i = 0; i < 100 && (await mapName()) !== m; i++) await sleep(100); await sleep(500); return (await mapName()) === m; };
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.HM_FIELD && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const stand = (x, y, surfing) => page.evaluate((x, y, s) => { const P = window.__ow.player; P.setTile(x, y); P.surfing = s; window.__ow.dialog.close?.(); }, x, y, surfing);
	const dive = () => page.evaluate(() => { window.__ow.HM_FIELD.dive.use(); const d = window.__ow.dialog; return d.pages ? d.pages.flat().join(' ') : ''; });

	// Seafloor Cavern: surface from the stolen submarine's pool
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Underwater_SeafloorCavern&x=6&y=5`, { waitUntil: 'domcontentloaded' });
	await boot('Underwater_SeafloorCavern');
	await stand(6, 5, false);
	let said = await dive();
	A(await waitMap('SeafloorCavern_Entrance'), '2. DIVE in Underwater_SeafloorCavern surfaces into SeafloorCavern_Entrance (Team Aqua\'s hideout)', said || await mapName());

	// Abandoned Ship: the hidden floor's pool dives back to Underwater1
	await page.evaluate(() => window.__ow.moveToMap('AbandonedShip_HiddenFloorCorridors'));
	await waitMap('AbandonedShip_HiddenFloorCorridors');
	await stand(2, 9, true);
	said = await dive();
	A(await waitMap('AbandonedShip_Underwater1'), "2. DIVE in the hidden floor's pool (2,9) goes back down to AbandonedShip_Underwater1", said || await mapName());

	// Sealed Chamber: surfaces into the chamber only from under it (12,44)
	await page.evaluate(() => window.__ow.moveToMap('Underwater_SealedChamber'));
	await waitMap('Underwater_SealedChamber');
	await stand(12, 44, false);
	await dive();
	A(await waitMap('SealedChamber_OuterRoom'), '2. Underwater_SealedChamber at (12,44) surfaces into SealedChamber_OuterRoom');
	await page.evaluate(() => window.__ow.moveToMap('Underwater_SealedChamber'));
	await waitMap('Underwater_SealedChamber');
	await stand(12, 30, false);
	await dive();
	A(await waitMap('Route134'), '2. ...and anywhere else it surfaces on Route 134 (its ON_DIVE_WARP getplayerxy)');
	A(errors.length === 0, '2. no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
