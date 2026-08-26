// progression_test.mjs — headless integration test for the badge/gym/League
// progression spine, driven through the REAL main.js wiring (not badges.js in
// isolation — badges_test.mjs covers that). Boots overworld/index.html like
// boot_smoke, then exercises the exposed helpers on window.__ow:
//   • a Gym Leader victory awards that region's badge (+ a toast dialog)
//   • the Elite Four/Champion refuse to battle below 8 badges, open at 8
//   • an HM field move is badge-gated out of battle, then allowed
//   • beating the Champion crowns you (Hall of Fame)
//   • the trainer card renders with badges without throwing
//
// Standalone (needs headless Chrome + puppeteer-core + local overworld/ data);
// NOT in run-all.mjs.   node overworld/tests/progression_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8874;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'prog', friendCode: 'PROGGY', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const KANTO_GYMS = [
	'PewterCity_Gym_EventScript_Brock', 'CeruleanCity_Gym_EventScript_Misty',
	'VermilionCity_Gym_EventScript_LtSurge', 'CeladonCity_Gym_EventScript_Erika',
	'FuchsiaCity_Gym_EventScript_Koga', 'SaffronCity_Gym_EventScript_Sabrina',
	'CinnabarIsland_Gym_EventScript_Blaine', 'ViridianCity_Gym_EventScript_Giovanni',
];
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); } return false; }

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) { /* drain */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
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
				localStorage.setItem('magepunk_mp_token_v1', 'prog-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_region', 'KANTO');
				localStorage.removeItem('magepunk_badges_v1'); // start with no badges
				// a real party (skips the starter picker; the trainer card needs party.length)
				localStorage.setItem('magepunk_party_v1', JSON.stringify([{
					speciesId: 'bulbasaur', name: 'BULBASAUR', nickname: null, level: 5, gender: 'M',
					ability: 'Overgrow', types: ['Grass', 'Poison'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
					stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20, exp: 125,
					moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], num: 1, sprite: 'bulbasaur.png',
				}]));
			} catch {}
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });

		const booted = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.Badges && window.__ow.onTrainerDefeated)), 30000);
		A(booted, 'the overworld booted with the progression helpers exposed');

		// helpers injected into the page
		await page.evaluate(() => {
			window._dtext = () => { const p = window.__ow?.dialog?.pages; return p ? p.flat().join(' ') : null; };
			window._close = () => { const d = window.__ow.dialog; let n = 0; while (d.blocking && n++ < 20) d.key('x'); };
		});

		// 1) fresh account: 0 Kanto badges, not champion
		A(await page.evaluate(() => window.__ow.Badges.count('KANTO')) === 0, 'fresh account holds 0 Kanto badges');

		// 2) beating Brock awards the Boulder Badge with a toast
		const brock = await page.evaluate((s) => {
			window.__ow.onTrainerDefeated(s);
			const t = window._dtext(); const c = window.__ow.Badges.count('KANTO');
			window._close();
			return { t, c };
		}, KANTO_GYMS[0]);
		A(brock.c === 1, 'beating Brock -> 1 Kanto badge', brock.c);
		A(/Boulder Badge/.test(brock.t || ''), 'a "You earned the Boulder Badge!" toast opened', JSON.stringify(brock.t));

		// 3) the League refuses to battle below 8 badges
		const gateLow = await page.evaluate(() => window.__ow.leagueGateMessage('PokemonLeague_LoreleisRoom_EventScript_Battle'));
		A(typeof gateLow === 'string' && /8 badges/.test(gateLow), 'Elite Four gated shut with 1 badge', JSON.stringify(gateLow));
		A(await page.evaluate(() => window.__ow.leagueGateMessage('SomeRoute_EventScript_Youngster')) === null, 'ordinary trainers are not League-gated');

		// 4) an HM field move is badge-gated out of battle (SURF needs 5 Kanto badges)
		const surfLow = await page.evaluate(() => {
			window._close();
			window.__ow.useFieldMove('surf', (window.__ow.party || [])[0] || null);
			const t = window._dtext(); const surfing = window.__ow.player.surfing;
			window._close();
			return { t, surfing };
		});
		A(/prevents using SURF/.test(surfLow.t || ''), 'SURF is blocked out of battle at 1 badge', JSON.stringify(surfLow.t));
		A(surfLow.surfing === false, 'the blocked SURF did not put the player on the water');

		// 5) earn the remaining Kanto badges -> 8, League opens
		const eight = await page.evaluate((gyms) => {
			for (const g of gyms) { window.__ow.onTrainerDefeated(g); window._close(); }
			return window.__ow.Badges.count('KANTO');
		}, KANTO_GYMS);
		A(eight === 8, 'all 8 Kanto Gym Leaders beaten -> 8 badges', eight);
		A(await page.evaluate(() => window.__ow.leagueGateMessage('PokemonLeague_LoreleisRoom_EventScript_Battle')) === null, 'Elite Four gate opens at 8 badges');

		// 6) with 8 badges SURF clears the badge gate (it now fails only on the tile, not the rule)
		const surfHi = await page.evaluate(() => {
			window._close();
			window.__ow.useFieldMove('surf', (window.__ow.party || [])[0] || null);
			const t = window._dtext(); window._close(); return t;
		});
		A(!/prevents using SURF/.test(surfHi || ''), 'SURF no longer badge-blocked at 8 badges', JSON.stringify(surfHi));

		// 7) beating the Champion crowns the player (Hall of Fame)
		const champ = await page.evaluate(() => {
			window.__ow.onTrainerDefeated('PokemonLeague_ChampionsRoom_EventScript_BattleCharmander');
			const t = window._dtext(); window._close();
			return { t, isChamp: window.__ow.Badges.isChampion('KANTO') };
		});
		A(champ.isChamp === true, 'beating the Champion sets champion status');
		A(/CHAMPION/.test(champ.t || ''), 'a Champion/Hall-of-Fame message opened', JSON.stringify(champ.t));

		// 8) the trainer card renders with badges without throwing
		const cardOk = await page.evaluate(() => {
			try { window.__ow.drawTrainerCard(240, 160); return 'ok'; } catch (e) { return 'throw: ' + e.message; }
		});
		A(cardOk === 'ok', 'the trainer card renders with the badge case + champion mark', cardOk);

		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
