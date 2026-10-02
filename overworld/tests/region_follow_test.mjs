// region_follow_test.mjs — the saved region follows the map you're on.
//
// 2026-10-02: Instinct took a PORTAL to Hoenn (which sets magepunk_region), then
// FLEW to Ecruteak — and the save still said Hoenn, so the objective line and
// the trainer card described the wrong region. Every map load now syncs it to
// the map's player region, the way a portal does.
//   1. booting a save that says Hoenn, standing in Ecruteak -> Johto
//   2. flying from Johto to a FireRed Kanto town -> Kanto
//   3. Crystal's Kanto (JohKanto) is not a player region: a Johto save stays Johto
//   4. a save with no region yet (before the new-game pick) is not given one
//
//   node overworld/tests/region_follow_test.mjs
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
const PORT = 9208;
const STATE = { username: 'regionfollow', friendCode: 'RFOL01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'pidgeot', name: 'PIDGEOT', level: 42, gender: 'M', friend: 70, types: ['Normal', 'Flying'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 130, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 130, curHP: 130,
	exp: 74000, moves: [{ id: 'fly', name: 'Fly', pp: 15, maxPp: 15 }], sprite: 's18.png', num: 18,
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
async function boot(map, region) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, region) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		if (region) localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, region);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	return { page, ctx, errors };
}
const state = page => page.evaluate(async () => {
	const P = await import('./ow_progression.js');
	return { saved: localStorage.getItem('magepunk_region'), player: P.playerRegion(), map: window.__ow.world.current.name };
});

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// 1. the Instinct case: resumed in Ecruteak with a Hoenn region
	{
		const { page, ctx, errors } = await boot('EcruteakPokecenter1F', 'hoenn');
		const s = await state(page);
		A(s.saved === 'johto' && s.player === 'JOHTO', '1. a save that says Hoenn, loaded in Ecruteak, is now in Johto', JSON.stringify(s));

		// 2. fly from Johto to FireRed Kanto
		await page.evaluate(async () => { const T = await import('./ow_transitions.js'); await T.flyTo('MAP_PEWTER_CITY', 15, 10); });
		await sleep(800);
		const s2 = await state(page);
		A(s2.map === 'PewterCity' && s2.saved === 'kanto' && s2.player === 'KANTO', '2. flying to Pewter City puts you in Kanto', JSON.stringify(s2));

		// ...and back to Johto
		await page.evaluate(async () => { const T = await import('./ow_transitions.js'); await T.flyTo('MAP_VIOLET_CITY', 10, 10); });
		await sleep(800);
		const s3 = await state(page);
		A(s3.saved === 'johto', '2. ...and flying to Violet City puts you back in Johto', JSON.stringify(s3));
		A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// 3. JohKanto is not a player region
	{
		const { page, ctx } = await boot('JohKantoCeladonCity', 'johto');
		const s = await state(page);
		A(s.saved === 'johto', '3. a Johto save in Crystal\'s Kanto (JohKanto) stays Johto', JSON.stringify(s));
		await ctx.close();
	}

	// 4. no region yet: none is invented
	{
		const { page, ctx } = await boot('PalletTown', null);
		const s = await state(page);
		A(!s.saved, '4. a save with no region yet is not given one by the sync', JSON.stringify(s));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
