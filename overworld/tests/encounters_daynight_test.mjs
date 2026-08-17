// encounters_daynight_test.mjs — code-driven day/night wild encounters + fishing.
// Covers: (1) the slot reweighting shifts the species mix by time of day (nocturnal up at
// night, diurnal up by day); (2) the night LAND overlay injects night-dwellers not on the
// base table after dark, never by day; (3) fishing picks from the rod tier's slot band.
// Headless Chrome + a mock /api/mp.  node overworld/tests/encounters_daynight_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8900;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 120)); } return false; }

const STATE = { username: 'en', friendCode: 'ENCT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: {}, friends: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 10, gender: 'M', ability: 'Keen Eye', types: ['Normal', 'Flying'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 30, atk: 18, def: 18, spa: 15, spd: 15, spe: 20 }, maxHP: 30, curHP: 30, exp: 1000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], num: 16, sprite: 's16.png' }];
const NIGHT_POOL = ['hoothoot', 'zubat', 'oddish', 'venonat', 'murkrow', 'spinarak', 'poochyena', 'gastly'];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st, party) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'en-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		} catch { }
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.encounters && window.__ow.encounters.data)), 30000);

	// 1 + 2: day/night reweighting + night overlay on MAP_ROUTE1 land (pidgey diurnal, rattata nocturnal)
	// Gen-3 (FireRed Kanto) DAY reweighting: Route 1 by day favours the diurnal PIDGEY over the
	// nocturnal RATTATA (the base owdata table, reweighted by time of day). Night is a separate
	// fakemon list (tested below); the reweighting/overlay is the fallback for day/morning and
	// any map without an authentic (Johto) or fakemon (FR/Emerald) night table.
	const dn = await page.evaluate(() => {
		const E = window.__ow.encounters, sp = window.__ow.battle.data.species, N = 1500;
		let pidgey = 0, rattata = 0, fakemon = 0;
		for (let i = 0; i < N; i++) { const r = E.pick('MAP_ROUTE1', 'land', 'day'); if (!r) continue; if (r.id === 'pidgey') pidgey++; if (r.id === 'rattata') rattata++; if ((sp[r.id]?.num || 0) <= 0) fakemon++; }
		return { pidgey, rattata, fakemon };
	});
	A(dn.pidgey > dn.rattata * 2, 'Gen-3 DAY reweighting favours the diurnal PIDGEY over the nocturnal RATTATA on Route 1', JSON.stringify(dn));
	A(dn.fakemon === 0, 'Gen-3 maps never spawn fakemon by DAY (base table only)', String(dn.fakemon));

	// AUTHENTIC Johto per-map day/night tables (from pokecrystal) — Sprout Tower is Rattata
	// by day and Gastly by night; Route 29 gains Hoothoot at night. These override the base
	// table, so the species literally SWAP (not just reweight).
	const johto = await page.evaluate(() => {
		const E = window.__ow.encounters, N = 400;
		const count = (map, phase, id) => { let c = 0; for (let i = 0; i < N; i++) { const r = E.pick(map, 'land', phase); if (r && r.id === id) c++; } return c; };
		return {
			sproutDayGastly: count('MAP_SPROUT_TOWER_2F', 'day', 'gastly'),
			sproutNightGastly: count('MAP_SPROUT_TOWER_2F', 'night', 'gastly'),
			r29DayHoot: count('MAP_ROUTE_29', 'day', 'hoothoot'),
			r29NightHoot: count('MAP_ROUTE_29', 'night', 'hoothoot'),
			// JohKanto (Crystal Gen-2 Kanto) also gets authentic day/night — Route 1 Hoothoot at night
			jkDayHoot: count('MAP_JOHKANTO_ROUTE_1', 'day', 'hoothoot'),
			jkNightHoot: count('MAP_JOHKANTO_ROUTE_1', 'night', 'hoothoot'),
		};
	});
	A(johto.sproutDayGastly === 0 && johto.sproutNightGastly > 150, 'Sprout Tower: authentic table gives RATTATA by day, GASTLY at night', JSON.stringify(johto));
	A(johto.r29DayHoot === 0 && johto.r29NightHoot > 0, 'Route 29: HOOTHOOT appears only at night (authentic per-map night list)', JSON.stringify({ day: johto.r29DayHoot, night: johto.r29NightHoot }));
	A(johto.jkDayHoot === 0 && johto.jkNightHoot > 0, 'JohKanto Route 1: HOOTHOOT appears only at night (Gen-2 Kanto day/night)', JSON.stringify({ day: johto.jkDayHoot, night: johto.jkNightHoot }));

	// the live Clock drives the phase for a normal roll (setHour flips day<->night)
	const clock = await page.evaluate(() => { const C = window.__ow.Clock; C.setHour(22); const n = C.phase(); C.setHour(12); const d = C.phase(); C.clearOverride(); return { n, d }; });
	A(clock.n === 'night' && clock.d === 'day', 'Clock.phase (which roll() reads live) reflects the time of day', JSON.stringify(clock));

	// FR/Emerald NIGHT fakemon list: Route 1 uses its base table (pidgey/rattata) by day, but a
	// fakemon night list after dark (all clean fakemon, num<=0), keyed to the base level range.
	const frem = await page.evaluate(() => {
		const E = window.__ow.encounters, sp = window.__ow.battle.data.species, MAP = 'MAP_ROUTE1', N = 300;
		const run = phase => { const set = new Set(); let fakemon = 0, base = 0, hi = 0; for (let i = 0; i < N; i++) { const r = E.pick(MAP, 'land', phase); if (!r) continue; set.add(r.id); if ((sp[r.id]?.num || 0) <= 0) fakemon++; if (r.id === 'pidgey' || r.id === 'rattata') base++; hi = Math.max(hi, r.level); } return { species: [...set], fakemon, base, hi }; };
		const out = { day: run('day'), night: run('night') };
		out.nightTypes = out.night.species.map(id => sp[id].types);
		return out;
	});
	A(frem.night.fakemon === 300 && frem.night.base === 0, 'FR/Emerald Route 1 at NIGHT uses the fakemon list (all fakemon, no base mons)', JSON.stringify(frem.night.species.slice(0, 8)));
	A(frem.night.hi <= 6, 'the night fakemon are kept to Route 1’s base level range (<=6)', 'maxLevel ' + frem.night.hi);
	A(frem.nightTypes.every(t => t.includes('Normal') || t.includes('Flying')), 'the Route 1 night fakemon are biome-matched to the grassland route (all Normal/Flying)', JSON.stringify(frem.nightTypes));
	// a night fakemon must actually BUILD into a wild battle (guards against a broken species crashing a night encounter)
	const built = await page.evaluate(async () => {
		const ow = window.__ow; const enc = ow.encounters.pick('MAP_ROUTE1', 'land', 'night');
		ow.startWildBattle(enc); await new Promise(r => setTimeout(r, 250));
		return { blocking: ow.battle.blocking, id: enc.id };
	});
	A(built.blocking, 'a night fakemon encounter builds into a real wild battle (buildMon works on it)', built.id);

	// 3: fishing picks from the rod tier's slot band (Old rod -> the low band; a no-fishing map -> null)
	const fishing = await page.evaluate(() => {
		const E = window.__ow.encounters;
		// find a map that HAS a fishing table
		const map = Object.keys(E.data).find(m => E.data[m].fishing && E.data[m].fishing.slots.length === 10);
		const old = new Set(), sup = new Set();
		for (let i = 0; i < 300; i++) { const a = E.fish(map, 1); if (a) old.add(a.id); const b = E.fish(map, 3); if (b) sup.add(b.id); }
		const oldBand = new Set(E.data[map].fishing.slots.slice(0, 2).map(s => s.id));
		const noFish = E.fish('MAP_ROUTE1', 1); // Route 1 has land only, no fishing
		return { map, oldOk: [...old].every(id => oldBand.has(id)), oldCount: old.size, supCount: sup.size, noFish };
	});
	A(fishing.oldOk && fishing.oldCount >= 1, 'the OLD ROD only hooks species from the low slot band', JSON.stringify(fishing));
	A(fishing.supCount > fishing.oldCount, 'the SUPER ROD reaches a wider range of species than the Old Rod', JSON.stringify({ old: fishing.oldCount, sup: fishing.supCount }));
	A(fishing.noFish === null, 'fishing a map with no fishing table returns null (no catch)');

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
