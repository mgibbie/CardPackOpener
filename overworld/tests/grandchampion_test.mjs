// grandchampion_test.mjs — Phase-4 Grand Champion finale. Covers:
//   0) boot catch-up: a save already 3x champion gets the crown + capstone on load,
//   1) grantGrandChampionReward is a one-shot payout,
//   2) the finale fires only when the THIRD region's League falls (onTrainerDefeated guard),
//      and overworldSummary surfaces grandChampion for the achievements sync.
// Headless Chrome + a mock /api/mp.  node overworld/tests/grandchampion_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8899;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 120)); } return false; }

const STATE = { username: 'gc', friendCode: 'GRND', decks: [], collection: {}, packs: 0, packInbox: 0, stats: {}, friends: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PARTY = [{ speciesId: 'dragonite', name: 'DRAGONITE', level: 62, gender: 'M', ability: 'Inner Focus', types: ['Dragon', 'Flying'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 170, spa: 180, spd: 180, spe: 160 }, maxHP: 210, curHP: 210, exp: 500000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], num: 149, sprite: 's149.png' }];
// a save that is already 3x champion (to exercise the boot catch-up)
const BADGES_3X = { badges: {}, champion: { KANTO: true, JOHTO: true, HOENN: true } };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st, party, badges) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'gc-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_name', 'RED');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges)); // already 3x champion
			for (const k of ['magepunk_story', 'magepunk_money', 'magepunk_bag_v1']) localStorage.removeItem(k);
		} catch { }
	}, STATE, PARTY, BADGES_3X);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.grantGrandChampionReward && window.__ow.overworldSummary)), 30000);

	// 0: boot catch-up — the already-3x-champion save was crowned GRAND CHAMPION on load
	const boot = await page.evaluate(() => ({ flag: window.__ow.Story.getFlag('grand_champion'), trophy: window.__ow.Bag.count('goldtrophy'), gc: window.__ow.overworldSummary().grandChampion }));
	A(boot.flag === true, 'boot catch-up: an already-3x-champion save is crowned GRAND CHAMPION on load');
	A(boot.trophy >= 1, 'boot catch-up grants the GOLD TROPHY');
	A(boot.gc === true, 'overworldSummary reports grandChampion (feeds the profile achievement)');

	// 1: grantGrandChampionReward is a one-shot payout
	const grant = await page.evaluate(() => {
		const ow = window.__ow, S = ow.Story, Bag = ow.Bag;
		S.clearFlag('grand_champion');
		const money0 = Bag.getMoney(), trophy0 = Bag.count('goldtrophy');
		const first = ow.grantGrandChampionReward();
		const second = ow.grantGrandChampionReward();
		return { first, second, dmoney: Bag.getMoney() - money0, dtrophy: Bag.count('goldtrophy') - trophy0 };
	});
	A(grant.first === true && grant.second === false, 'the capstone is a one-shot payout');
	A(grant.dmoney >= 50000 && grant.dtrophy >= 1, 'the capstone pays out ($50000 + a GOLD TROPHY)', JSON.stringify(grant));

	// 2: the finale fires only when the THIRD League falls (via onTrainerDefeated's finish guard)
	const finale = await page.evaluate(() => {
		const ow = window.__ow, B = ow.Badges, S = ow.Story;
		localStorage.removeItem('magepunk_badges_v1'); B._reset(); // clean slate (the save was 3x champion)
		S.clearFlag('grand_champion');
		B.crown('KANTO'); // 1 champion
		if (ow.cutscene.blocking) ow.cutscene.stop();
		ow.onTrainerDefeated('LancesRoomLanceScript', { silent: true });   // JOHTO champion -> 2 crowns
		const afterTwo = S.getFlag('grand_champion');
		if (ow.cutscene.blocking) ow.cutscene.stop();
		ow.onTrainerDefeated('EverGrandeCity_ChampionsRoom_EventScript_Wallace', { silent: true }); // HOENN -> 3 crowns
		const afterThree = S.getFlag('grand_champion');
		const champs = ['KANTO', 'JOHTO', 'HOENN'].filter(r => B.isChampion(r)).length;
		return { afterTwo, afterThree, champs };
	});
	A(finale.afterTwo === false, 'the finale does NOT fire with only two regions crowned');
	A(finale.champs === 3 && finale.afterThree === true, 'crowning the third region fires the Grand Champion finale');

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
