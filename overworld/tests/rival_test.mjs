// rival_test.mjs — the recurring cross-region RIVAL (rivals.js). Covers:
//   1) rivalDue() gating — appears only at the CURRENT tier's gym town, after the intro,
//      once per tier (flag), and follows the tier forward across regions,
//   2) the encounter plays a taunt then starts a real battle vs the tier team (species build).
// Headless Chrome + a mock /api/mp.  node overworld/tests/rival_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8897;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 120)); } return false; }

const STATE = { username: 'rv', friendCode: 'RIVL', decks: [], collection: {}, packs: 0, packInbox: 0, stats: {}, friends: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PARTY = [{ speciesId: 'venusaur', name: 'VENUSAUR', level: 55, gender: 'M', ability: 'Overgrow', types: ['Grass', 'Poison'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 190, atk: 150, def: 150, spa: 170, spd: 170, spe: 140 }, maxHP: 190, curHP: 190, exp: 250000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], num: 3, sprite: 's3.png' }];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st, party) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'rv-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_rival', 'GARY');
			localStorage.setItem('magepunk_name', 'ASH');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			for (const k of ['magepunk_badges_v1', 'magepunk_story', 'magepunk_flypoints']) localStorage.removeItem(k);
		} catch { }
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PewterCity`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.rivalDue && window.__ow.startRivalEncounter)), 30000);

	// 1: rivalDue gating
	const g = await page.evaluate(() => {
		const ow = window.__ow, B = ow.Badges, S = ow.Story;
		B._reset(); S.clearFlag('intro_done');
		const beforeIntro = ow.rivalDue('MAP_PEWTER_CITY');
		S.setFlag('intro_done');
		const dueT0 = ow.rivalDue('MAP_PEWTER_CITY');       // tier-0 gym town at globalTier 0
		const notGymTown = ow.rivalDue('MAP_ROUTE_3');      // not a gym town
		const wrongTier = ow.rivalDue('MAP_CERULEAN_CITY'); // tier-1 town, globalTier still 0
		S.setFlag('rival_tier0_done');
		const afterDone = ow.rivalDue('MAP_PEWTER_CITY');   // already fought this tier
		S.clearFlag('rival_tier0_done');
		for (const r of ['KANTO', 'JOHTO', 'HOENN']) B.earn(r, B.list(r)[0].id); // -> tier 1
		const tier = ow.Quest.globalTier();
		const dueT1 = ow.rivalDue('MAP_CERULEAN_CITY');     // now the current tier's town
		const oldTown = ow.rivalDue('MAP_PEWTER_CITY');     // a past-tier town
		return { beforeIntro, dueT0, notGymTown, wrongTier, afterDone, tier, dueT1, oldTown };
	});
	A(g.beforeIntro === null, 'no rival before the intro is done');
	A(g.dueT0 === 0, 'the rival is due at a tier-0 gym town at globalTier 0');
	A(g.notGymTown === null, 'no rival on a non-gym-town map');
	A(g.wrongTier === null, 'no rival at a higher-tier gym town before you reach that tier');
	A(g.afterDone === null, 'the rival is one-shot per tier (its flag gates re-triggers)');
	A(g.tier === 1 && g.dueT1 === 1, 'at globalTier 1 the rival is due at a tier-1 gym town (follows the tier forward)');
	A(g.oldTown === null, 'the rival no longer appears at a past-tier gym town');

	// 2: the encounter plays a taunt, then starts a real battle vs the tier team
	const battled = await page.evaluate(async () => {
		const ow = window.__ow;
		ow.Badges._reset(); ow.Story.setFlag('intro_done'); ow.Story.clearFlag('rival_tier0_done');
		ow.startRivalEncounter(0);
		const d = ow.dialog;
		for (let i = 0; i < 60; i++) { if (ow.battle.blocking) return true; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 40)); }
		return ow.battle.blocking;
	});
	A(battled, 'the rival encounter plays a taunt then starts the battle (tier team builds from real species)');

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
