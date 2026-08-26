// legibility_test.mjs — Phase-1 cross-region legibility UI. Covers:
//   1) the one-time PORTAL onboarding tutorial (fires once at the first cross-region tier
//      wall, never again; villain seals don't trigger it),
//   2) the Trainer Card / QUEST menu / Town Map render the tier tracker without throwing
//      and reflect a mocked badge state (K=2,J=1,H=1 -> tier 1, JOHTO+HOENN owe it).
// Headless Chrome + a mock /api/mp.  node overworld/tests/legibility_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8896;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 120)); } return false; }

const STATE = { username: 'lg', friendCode: 'LEGI', decks: [], collection: {}, packs: 0, packInbox: 0, stats: {}, friends: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PARTY = [{ speciesId: 'pikachu', name: 'PIKACHU', level: 40, gender: 'M', ability: 'Static', types: ['Electric'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 120, atk: 90, def: 70, spa: 100, spd: 90, spe: 130 }, maxHP: 120, curHP: 120, exp: 100000, moves: [{ id: 'thundershock', name: 'Thunder Shock', pp: 30, maxPp: 30 }], num: 25, sprite: 's25.png' }];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st, party) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'lg-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			for (const k of ['magepunk_badges_v1', 'magepunk_flypoints', 'magepunk_story']) localStorage.removeItem(k);
		} catch { }
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PewterCity`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.maybePortalTutorial && window.__ow.drawTrainerCard)), 30000);

	// 1: the one-time portal onboarding tutorial
	const tut = await page.evaluate(() => {
		const ow = window.__ow;
		const before = ow.Story.getFlag('tut_portal_seen');
		ow.maybePortalTutorial({ need: 1 });                 // a real cross-region tier wall
		const openedFirst = ow.dialog.blocking, flagAfter = ow.Story.getFlag('tut_portal_seen');
		for (let i = 0; i < 6 && ow.dialog.blocking; i++) ow.dialog.key('x');
		ow.maybePortalTutorial({ need: 1 });                 // second wall -> must NOT re-open
		const openedSecond = ow.dialog.blocking;
		for (let i = 0; i < 6 && ow.dialog.blocking; i++) ow.dialog.key('x');
		return { before, openedFirst, flagAfter, openedSecond };
	});
	A(tut.before === false, 'tut_portal_seen starts unset on a fresh save');
	A(tut.openedFirst === true && tut.flagAfter === true, 'the first cross-region wall opens the portal tutorial and sets the flag');
	A(tut.openedSecond === false, 'the tutorial is one-time — it never fires again');

	// a villain seal must NOT trigger the portal tutorial (fresh save, flag reset)
	const vil = await page.evaluate(() => {
		const ow = window.__ow;
		ow.Story.clearFlag('tut_portal_seen');
		ow.maybePortalTutorial({ villain: true, need: 0 });  // villain block, not a tier wall
		const opened = ow.dialog.blocking;
		for (let i = 0; i < 6 && ow.dialog.blocking; i++) ow.dialog.key('x');
		return { opened, flag: ow.Story.getFlag('tut_portal_seen') };
	});
	A(vil.opened === false && vil.flag === false, 'a villain seal does NOT trigger the portal tutorial');

	// 2: the tier tracker renders from a mocked badge state (K=2, J=1, H=1)
	const render = await page.evaluate(() => {
		const ow = window.__ow, B = ow.Badges;
		B._reset();
		B.list('KANTO').slice(0, 2).forEach(b => B.earn('KANTO', b.id));
		B.list('JOHTO').slice(0, 1).forEach(b => B.earn('JOHTO', b.id));
		B.list('HOENN').slice(0, 1).forEach(b => B.earn('HOENN', b.id));
		const tier = ow.Quest.globalTier(), lag = ow.Quest.laggingRegions().slice().sort();
		let threw = null;
		try {
			ow.drawTrainerCard(480, 320);
			ow.drawQuest(480, 320);
			ow.openTownMap();
			for (let ri = 0; ri < 4; ri++) { ow.townMap.region = ri; ow.townMap.idx = 0; ow.drawTownMap(480, 320); } // all region rails
			ow.townMap.region = 0; ow.townMap.idx = 2; ow.drawTownMap(480, 320); // Pewter = a gym town (PORTAL tag)
		} catch (e) { threw = e.message; }
		return { tier, lag, threw };
	});
	A(render.tier === 1, 'globalTier is 1 with K=2 / J=1 / H=1', String(render.tier));
	A(JSON.stringify(render.lag) === JSON.stringify(['HOENN', 'JOHTO']), 'the lagging regions are JOHTO + HOENN', JSON.stringify(render.lag));
	A(render.threw === null, 'Trainer Card, QUEST menu, and Town Map all render the tier tracker without throwing', render.threw);

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
