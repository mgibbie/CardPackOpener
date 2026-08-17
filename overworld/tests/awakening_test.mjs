// awakening_test.mjs — the Hoenn legendary-awakening chain. After the Team Aqua
// climax (villain_hoenn_climax), a self-contained director walks the player through
// six beats (Route 128 -> Sootopolis clash -> Wallace -> Sky Pillar -> Rayquaza
// wakes -> Sootopolis calming), advancing its own VAR_HOENN_AWAKENING state and
// drawing KYOGRE/GROUDON (then RAYQUAZA) over Sootopolis on their real decomp tiles.
// The catch stays a real tile-encounter (LEGENDARY_ENCOUNTERS), untouched.
//
// Standalone (headless Chrome + puppeteer-core + local data); NOT in run-all.
//   node overworld/tests/awakening_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8883;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'awk', friendCode: 'AWAKE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

// walk the player onto a map and play whatever awakening beat fires there to the end
async function enter(page, stem) {
	await page.evaluate(async (s) => { await window.__ow.moveToMap(s); }, stem);
	await waitFor(() => page.evaluate((s) => new RegExp(s.replace(/[^A-Za-z0-9_]/g, '')).test((window.__ow.world.current?.name || '')), stem), 8000);
	// flush any cutscene the entry started (say-op beats), pressing advance each frame
	await page.evaluate(async () => {
		const d = window.__ow.dialog, cs = window.__ow.cutscene;
		for (let i = 0; i < 120; i++) { if (!cs.blocking) break; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 25)); }
	});
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'awk-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.removeItem('magepunk_badges_v1'); localStorage.removeItem('magepunk_bag_v1'); localStorage.removeItem('magepunk_story');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'swampert', name: 'SWAMPERT', level: 80, gender: 'M', ability: 'Torrent', types: ['Water', 'Ground'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 260, atk: 170, def: 150, spa: 150, spd: 150, spe: 130 }, maxHP: 260, curHP: 260, exp: 512000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], num: 260, sprite: 's260.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route128`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.checkAwakeningTrigger && window.__ow.AWAKENING_SCENES)), 30000);

	// the director exists and is dormant before the climax
	A(await page.evaluate(() => window.__ow.AWAKENING_SCENES.length) === 6, 'the awakening chain has all six beats');
	A(await page.evaluate(() => window.__ow.awState()) === 0, 'the chain starts at state 0');
	// pre-climax, entering Sootopolis fires nothing (no villain_hoenn_climax yet)
	await enter(page, 'SootopolisCity');
	A(await page.evaluate(() => window.__ow.awState()) === 0 && await page.evaluate(() => !window.__ow.cutscene.blocking), 'no awakening plays before the Team Aqua climax');

	// arm it: the Hoenn villain climax has been reached
	await page.evaluate(() => window.__ow.Story.setFlag('villain_hoenn_climax'));

	// beat 1 — Route 128: Archie/Maxie/Steven
	await enter(page, 'Route128');
	A(await page.evaluate(() => window.__ow.awState()) === 1, 'ROUTE 128 confrontation advances the chain to 1');

	// beat 2 — Sootopolis: KYOGRE x GROUDON clash (and the sprites have real tiles to stand on)
	await enter(page, 'SootopolisCity');
	A(await page.evaluate(() => window.__ow.awState()) === 2, 'the SOOTOPOLIS clash advances the chain to 2');
	const clashObjs = await page.evaluate(() => {
		const g = (window.__ow.world.current.map.object_events || []);
		return { kyogre: g.some(o => /KYOGRE/.test(o.graphics_id || '')), groudon: g.some(o => /GROUDON/.test(o.graphics_id || '')) };
	});
	A(clashObjs.kyogre && clashObjs.groudon, 'KYOGRE and GROUDON have decomp object tiles to be drawn on');

	// beat 3 — Sootopolis: WALLACE points to the Sky Pillar (fires on the next step, same map)
	await page.evaluate(async () => {
		window.__ow.checkAwakeningTrigger();
		const d = window.__ow.dialog, cs = window.__ow.cutscene;
		for (let i = 0; i < 120; i++) { if (!cs.blocking) break; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 25)); }
	});
	A(await page.evaluate(() => window.__ow.awState()) === 3, 'WALLACE’s pointer advances the chain to 3');

	// beat 4 — Sky Pillar Outside: door opened, chain at 4
	await enter(page, 'SkyPillar_Outside');
	A(await page.evaluate(() => window.__ow.awState()) === 4, 'the SKY PILLAR scene advances the chain to 4');
	A(await page.evaluate(() => window.__ow.world.isPassable(14, 4) && window.__ow.world.isPassable(14, 5)), 'the SKY PILLAR door is walkable after WALLACE opens it');

	// beat 5 — Sky Pillar Top: Rayquaza wakes and flies off
	await enter(page, 'SkyPillar_Top');
	A(await page.evaluate(() => window.__ow.awState()) === 5, 'waking RAYQUAZA advances the chain to 5');
	// the catch is untouched: Rayquaza is still a real encounter on its tile
	A(await page.evaluate(() => window.__ow.legendaryHere()?.species) === 'rayquaza', 'RAYQUAZA is still catchable at the summit (encounter decoupled from the plot)');

	// beat 6 — Sootopolis: Rayquaza calms them; the crisis ends and weather clears
	await enter(page, 'SootopolisCity');
	A(await page.evaluate(() => window.__ow.awState()) === 6, 'the calming scene resolves the chain at 6');
	A(await page.evaluate(() => !window.__ow.Story.getFlag('FLAG_SYS_WEATHER_CTRL')), 'the abnormal weather clears once the chain resolves');

	// re-entering a resolved map replays nothing
	await enter(page, 'SootopolisCity');
	A(await page.evaluate(() => window.__ow.awState()) === 6 && await page.evaluate(() => !window.__ow.cutscene.blocking), 'a resolved chain never replays');

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
