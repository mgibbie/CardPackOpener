// achievements_test.mjs — the overworld → account achievements bridge. Covers:
//   1) overworldSummary() reflects real local progress (badges/champ/symbols/legends/…)
//   2) the Dex-CAUGHT vs merely-defeated legendary distinction (only catches count)
//   3) syncOverworldAchievements() pushes an 'overworld-sync' to the relay (and boot does too),
//      and is a no-op when logged out
//   4) the Profile page renders the new RPG tiles (unlocked/locked) from stats.overworld,
//      and hides them entirely when the player has never booted the game
// Headless Chrome + a mock /api/mp.  node overworld/tests/achievements_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8894;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 120)); } return false; }

// mutable account state the mock hands back; tests set STATE.stats.overworld for the profile phase
const STATE = { username: 'ach', friendCode: 'ACHV', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: [] };
let calls = []; // every /api/mp call the browser makes (action + body)

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		calls.push({ action: body.action, body });
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null }));
		return;
	}
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PARTY = [{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

	// ---------- Phase 1: overworld, logged in ----------
	{
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
		await page.evaluateOnNewDocument((st, party) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'ach-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_region', 'HOENN');
				localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
				// clean progression baseline
				for (const k of ['magepunk_badges_v1', 'magepunk_frontier_symbols', 'magepunk_bp', 'magepunk_frontier_best', 'magepunk_dex_v1']) localStorage.removeItem(k);
			} catch { }
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.overworldSummary && window.__ow.syncOverworldAchievements)), 30000);

		// boot backfilled the account (a logged-in boot fires one overworld-sync)
		A(await waitFor(() => calls.some(c => c.action === 'overworld-sync'), 6000), 'a logged-in boot fires an overworld-sync (backfill)');
		const bootCall = calls.find(c => c.action === 'overworld-sync');
		A(bootCall && bootCall.body.ow && bootCall.body.ow.badges && bootCall.body.ow.champ, 'the sync payload carries the summary shape (badges/champ/…)', JSON.stringify(bootCall && bootCall.body.ow));

		// fresh baseline: zeros everywhere
		const base = await page.evaluate(() => window.__ow.overworldSummary());
		A(base.badges.KANTO === 0 && base.badges.JOHTO === 0 && base.badges.HOENN === 0, 'fresh summary: no badges', JSON.stringify(base.badges));
		A(base.champ.KANTO === false && base.champ.HOENN === false, 'fresh summary: not a champion of any region');
		A(Object.keys(base.symbols).length === 0 && base.legends.length === 0 && base.beatRed === false, 'fresh summary: no symbols, legends, or RED win');

		// earn a full circuit + a crown + a symbol; summary reflects it
		const after = await page.evaluate(() => {
			for (const b of window.__ow.Badges.list('KANTO')) window.__ow.Badges.earn('KANTO', b.id);
			window.__ow.Badges.crown('KANTO');
			window.__ow.Frontier.earnSymbol('tower', 'silver');
			window.__ow.Frontier.earnSymbol('dome', 'gold');
			return window.__ow.overworldSummary();
		});
		A(after.badges.KANTO === 8, 'after earning every Kanto gym, badges.KANTO === 8', String(after.badges.KANTO));
		A(after.champ.KANTO === true, 'after crowning, champ.KANTO === true');
		A(Object.keys(after.symbols).length === 2 && after.symbols.dome === 'gold', 'symbols reflect earned Frontier symbols', JSON.stringify(after.symbols));

		// the Dex-CAUGHT vs merely-defeated distinction: the flag alone must NOT count a legendary
		const legFlagOnly = await page.evaluate(() => {
			window.__ow.Story.setFlag('legend_caught_articuno'); // set on a *defeat* too — must not qualify
			return window.__ow.overworldSummary().legends;
		});
		A(!legFlagOnly.includes('articuno'), 'a defeated (flag-only) legendary does NOT count toward the sets', JSON.stringify(legFlagOnly));
		const legCaught = await page.evaluate(() => {
			window.__ow.Dex.markCaught('articuno'); // a real catch
			return window.__ow.overworldSummary().legends;
		});
		A(legCaught.includes('articuno'), 'a Dex-CAUGHT legendary counts toward the sets');

		// a milestone hook path: calling the sync pushes the *current* summary
		calls = [];
		await page.evaluate(() => window.__ow.syncOverworldAchievements());
		A(await waitFor(() => calls.some(c => c.action === 'overworld-sync'), 4000), 'syncOverworldAchievements() posts overworld-sync');
		const sync = calls.find(c => c.action === 'overworld-sync');
		A(sync && sync.body.ow.badges.KANTO === 8 && sync.body.ow.champ.KANTO === true, 'the pushed summary matches current progress', JSON.stringify(sync && sync.body.ow.badges));

		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, 'no uncaught client errors (overworld phase)', fatal.slice(0, 4).join(' | '));
		await page.close();
	}

	// ---------- Phase 2: overworld is login-gated → a logged-out visitor never reaches
	// the sync at all (it bounces to /login). This is the real-world "no tracking when
	// logged out" guarantee: the account-scoped sync is unreachable without an account.
	{
		calls = [];
		const page = await browser.newPage();
		await page.evaluateOnNewDocument((party) => {
			try {
				for (const k of ['magepunk_mp_token_v1', 'magepunk_mp_state_v1']) localStorage.removeItem(k); // no login
				localStorage.setItem('magepunk_region', 'HOENN');
				localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			} catch { }
		}, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
		const bounced = await waitFor(() => page.evaluate(() => location.pathname.startsWith('/login')), 15000);
		A(bounced, 'a logged-out visitor is redirected to /login (never reaches the overworld or the sync)', await page.evaluate(() => location.pathname));
		A(calls.filter(c => c.action === 'overworld-sync').length === 0, 'no overworld-sync is ever posted without a login', JSON.stringify(calls.map(c => c.action)));
		await page.close();
	}

	// ---------- Phase 3: profile renders the RPG tiles from stats.overworld ----------
	{
		STATE.stats = {
			runs: 0, wins: 0,
			overworld: {
				badges: { KANTO: 8, JOHTO: 8, HOENN: 3, JOHKANTO: 8 },
				champ: { KANTO: true, JOHTO: true },
				symbols: { tower: 'gold', dome: 'silver' },
				legends: ['articuno', 'zapdos', 'moltres', 'rayquaza'],
				villains: ['villain_kanto_hideout', 'villain_kanto_silph', 'villain_hoenn_climax'],
				beatRed: true, awakening: true, dexCaught: 60,
			},
		};
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st) => {
			try { localStorage.setItem('magepunk_mp_token_v1', 'ach-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { }
		}, STATE);
		await page.goto(`http://localhost:${PORT}/profile/index.html`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!document.querySelector('.ach-grid .ach')), 15000);
		const tiles = await page.evaluate(() => [...document.querySelectorAll('.ach-grid .ach')].map(a => ({ nm: a.querySelector('.nm')?.textContent, done: a.classList.contains('done') })));
		const byName = nm => tiles.find(t => t.nm === nm);
		A(!!byName('Legendary Master'), 'the RPG tiles render on the profile when stats.overworld is present');
		A(byName('Kanto Gym Circuit')?.done === true, 'Kanto Gym Circuit unlocked (8/8)');
		A(byName('Indigo Conqueror')?.done === true, 'Indigo Conqueror unlocked (JOHTO 8 + JOHKANTO 8 = 16)');
		A(byName('Legendary Birds')?.done === true, 'Legendary Birds unlocked (3 birds caught)');
		A(byName('Rival at the Summit')?.done === true, 'Rival at the Summit unlocked (RED beaten)');
		A(byName('Poké Collector')?.done === true, 'Poké Collector unlocked (dex 60 ≥ 50)');
		A(byName('Grand Champion')?.done === false, 'Grand Champion still locked (2 of 3 regions)');
		A(byName('Weather Trio')?.done === false, 'Weather Trio still locked (only 1 of 3 caught)');
		A(byName('Frontier Conqueror')?.done === false, 'Frontier Conqueror still locked (2 of 7 symbols)');
		A(byName('Seasoned Trainer')?.done === false, 'Seasoned Trainer still locked (dex 60 < 150)');
		A(errors.filter(e => !/Failed to load resource/i.test(e)).length === 0, 'no uncaught client errors (profile phase)', errors.slice(0, 3).join(' | '));
		await page.close();
	}

	// ---------- Phase 4: no overworld progress → RPG tiles hidden entirely ----------
	{
		STATE.stats = { runs: 0, wins: 0 }; // no overworld key
		const page = await browser.newPage();
		await page.evaluateOnNewDocument((st) => {
			try { localStorage.setItem('magepunk_mp_token_v1', 'ach-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { }
		}, STATE);
		await page.goto(`http://localhost:${PORT}/profile/index.html`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!document.querySelector('.ach-grid .ach')), 15000);
		const names = await page.evaluate(() => [...document.querySelectorAll('.ach-grid .ach .nm')].map(n => n.textContent));
		A(!names.includes('Legendary Master') && !names.includes('Kanto Gym Circuit'), 'a player who never booted the RPG sees no overworld tiles', JSON.stringify(names.length));
		A(names.length > 0, 'the card-game achievements still render for everyone');
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
