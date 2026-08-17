// frontier_test.mjs — the BATTLE FRONTIER (Battle Tower MVP): opponent generation,
// BP currency, and that taking the challenge actually starts a battle. Headless.
//   node overworld/tests/frontier_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8891;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'ft', friendCode: 'FRONT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
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
			localStorage.setItem('magepunk_mp_token_v1', 'ft-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.removeItem('magepunk_badges_v1'); localStorage.removeItem('magepunk_bp'); localStorage.removeItem('magepunk_frontier_best');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.Frontier && window.__ow.startFrontierChallenge && window.__ow.battle)), 30000);
	await page.evaluate(() => window.__ow.Badges.crown('HOENN'));

	// opponent generation: a full team of distinct, battle-ready mons at the level
	const gen = await page.evaluate(() => {
		const t = window.__ow.Frontier.genTeam(window.__ow.battle.data, 50, 3);
		return { n: t.length, allValid: t.every(m => m && m.stats && (m.moves || []).length > 0 && m.level === 50), distinct: new Set(t.map(m => m.speciesId)).size };
	});
	A(gen.n === 3 && gen.allValid, 'genTeam builds a full team of battle-ready mons at the requested level', JSON.stringify(gen));
	A(gen.distinct === 3, 'the generated opponents are distinct species');

	// BP currency: earn, spend, and refuse an over-spend
	const bp = await page.evaluate(() => {
		const F = window.__ow.Frontier;
		const start = F.getBP(); F.addBP(5); const after = F.getBP();
		const ok = F.spendBP(3); const left = F.getBP();
		const bad = F.spendBP(999); const still = F.getBP();
		return { start, after, ok, left, bad, still };
	});
	A(bp.after === bp.start + 5 && bp.ok === true && bp.left === bp.after - 3, 'BP is earned and spent correctly');
	A(bp.bad === false && bp.still === bp.left, 'an over-spend of BP is refused');

	// FRONTIER BRAINS — a boss per facility, at streak milestones, with symbols
	const brains = await page.evaluate(() => {
		const F = window.__ow.Frontier;
		return {
			count: Object.keys(F.BRAINS).length,
			silver: F.brainTier(7), gold: F.brainTier(21), none: F.brainTier(5),
			named: F.BRAINS.pyramid?.name === 'BRANDON' && F.BRAINS.tower?.name === 'ANABEL',
			sym: (() => { F.earnSymbol('tower', 'silver'); const a = window.__ow.Frontier.getSymbols().tower; F.earnSymbol('tower', 'gold'); const b = window.__ow.Frontier.getSymbols().tower; F.earnSymbol('tower', 'silver'); const c = window.__ow.Frontier.getSymbols().tower; return { a, b, c }; })(),
		};
	});
	A(brains.count === 7 && brains.named, 'each facility has a named FRONTIER BRAIN');
	A(brains.silver === 'silver' && brains.gold === 'gold' && brains.none === null, 'the Brain challenges at streak 7 (silver) and 21 (gold)');
	A(brains.sym.a === 'silver' && brains.sym.b === 'gold' && brains.sym.c === 'gold', 'symbols are recorded and GOLD outranks SILVER (never downgrades)');

	// the trainer card renders the FRONTIER SYMBOLS row without error (tower is GOLD now)
	await page.evaluate(() => { window.__ow.trainerCard.open = true; });
	await new Promise(r => setTimeout(r, 400));
	A(await page.evaluate(() => window.__ow.trainerCard.open), 'the trainer card opens and renders the symbols row');
	await page.evaluate(() => { window.__ow.trainerCard.open = false; });

	// BP EXCHANGE (shop) — every item is real; buying spends BP and adds it
	const shop = await page.evaluate(() => {
		const F = window.__ow.Frontier;
		const allValid = F.BP_SHOP.every(it => !!window.__ow.Bag.ITEMS[it.id]);
		F.addBP(500); // plenty
		window.__ow.openBpShop(null);
		const opened = window.__ow.bpShopMenu.open;
		const it = F.BP_SHOP[0], bp0 = F.getBP(), bag0 = window.__ow.Bag.count(it.id);
		window.__ow.bpShopKey('z');                 // buy item 0
		const bought = { spent: bp0 - F.getBP(), gained: window.__ow.Bag.count(it.id) - bag0, cost: it.cost };
		// drain BP, then a purchase must be refused
		F.spendBP(F.getBP());
		const bp1 = F.getBP(), bag1 = window.__ow.Bag.count(it.id);
		window.__ow.bpShopKey('z');
		const refused = F.getBP() === bp1 && window.__ow.Bag.count(it.id) === bag1;
		window.__ow.bpShopKey('x');                 // close
		return { allValid, opened, bought, refused, closed: !window.__ow.bpShopMenu.open };
	});
	A(shop.allValid, 'every BP EXCHANGE item is a real bag item');
	A(shop.opened, 'the BP EXCHANGE menu opens');
	A(shop.bought.spent === shop.bought.cost && shop.bought.gained === 1, 'buying spends the BP cost and adds the item to the bag', JSON.stringify(shop.bought));
	A(shop.refused, 'a purchase with insufficient BP is refused');
	A(shop.closed, 'the BP EXCHANGE closes on X');

	// all SEVEN facilities are configured
	A(await page.evaluate(() => Object.keys(window.__ow.Frontier.FACILITIES).length) === 7, 'all seven Battle Frontier facilities are configured');
	A(await page.evaluate(() => {
		const F = window.__ow.Frontier.FACILITIES;
		return F.factory.rental === true && F.palace.heal === false && F.dome.rounds === 5 && F.arena.rounds === 3 && F.pyramid.bpWin === 2 && F.pike.rooms === true;
	}), 'each facility has its distinguishing rule (Factory rentals, Palace/Pyramid endurance, Dome/Arena fixed rounds, Pike rooms)');

	// every facility STARTS and sets its config (reset active between, no battle needed)
	const starts = await page.evaluate(() => {
		const out = {};
		for (const id of ['tower', 'dome', 'factory', 'palace', 'arena', 'pike', 'pyramid']) {
			window.__ow.frontier.active = false;             // clear any prior run
			window.__ow.startFacility(id);
			out[id] = window.__ow.frontier.active && window.__ow.frontier.cfg?.name === window.__ow.Frontier.FACILITIES[id].name;
		}
		window.__ow.frontier.active = false;
		return out;
	});
	A(Object.values(starts).every(Boolean), 'every facility challenge starts with the right config', JSON.stringify(starts));

	// the FACTORY runs on a RENTAL team (generated), not your own party — and still
	// enters a real battle (the riskiest wiring)
	await page.evaluate(async () => { await window.__ow.moveToMap('BattleFrontier_BattleFactoryLobby'); });
	await waitFor(() => page.evaluate(() => /BattleFactoryLobby/.test(window.__ow.world.current?.name || '')), 8000);

	// the BP EXCHANGE counter in the lobby opens the shop (clerk at (3,11), face from above)
	const counter = await page.evaluate(async () => {
		window.__ow.frontier.active = false;
		const p = window.__ow.player; p.setTile(3, 10); p.facing = 'down'; p.moving = false;
		window.__ow.interact();
		const d = window.__ow.dialog;
		for (let i = 0; i < 12; i++) { if (window.__ow.bpShopMenu.open) break; if (d.blocking) d.key('z'); await new Promise(r => setTimeout(r, 40)); }
		const open = window.__ow.bpShopMenu.open;
		window.__ow.bpShopKey('x');
		return { open };
	});
	A(counter.open, 'the BP EXCHANGE counter in a Frontier lobby opens the shop');

	const factory = await page.evaluate(async () => {
		window.__ow.frontier.active = false;
		window.__ow.startFacility('factory');
		const rentalIsGenerated = window.__ow.frontier.runParty !== window.__ow.party;
		const d = window.__ow.dialog;
		for (let i = 0; i < 40; i++) { if (window.__ow.battle.blocking) break; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 60)); }
		return { rentalIsGenerated, inBattle: window.__ow.battle.blocking };
	});
	A(factory.rentalIsGenerated, 'the BATTLE FACTORY uses a generated RENTAL team, not your own party');
	A(factory.inBattle, 'the BATTLE FACTORY still starts a real battle with the rentals', JSON.stringify(factory));

	// ---- standalone Battle Factory mini-game (?factory=1 from the home page) ----
	// a FRESH visitor with no save should drop straight into a Factory run, and it
	// must NOT write over any overworld save (party/position).
	const page2 = await browser.newPage();
	const err2 = [];
	page2.on('pageerror', e => err2.push('pageerr: ' + e.message));
	page2.on('console', m => { if (m.type() === 'error') err2.push('console: ' + m.text().slice(0, 160)); });
	await page2.evaluateOnNewDocument((st) => {
		try {
			localStorage.clear();
			// the harness needs the MP scaffolding the other tests use (local data serving
			// stalls the fresh-visitor path otherwise) — but crucially NO party, so we
			// exercise the standalone provisioning.
			localStorage.setItem('magepunk_mp_token_v1', 'ft2-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
		} catch { }
	}, STATE);
	await page2.goto(`http://localhost:${PORT}/overworld/index.html?factory=1`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page2.evaluate(() => !!(window.__ow && window.__ow.startFacility && window.__ow.world.current)), 30000);
	const inLobby = await waitFor(() => page2.evaluate(() => /BattleFactoryLobby/.test(window.__ow.world.current?.name || '')), 10000);
	A(inLobby, 'the ?factory=1 mini-game boots straight into the BATTLE FACTORY lobby');
	A(await page2.evaluate(() => (window.__ow.party || []).length > 0), 'a throwaway rental-ready party is provisioned (no save needed)');
	const solo = await page2.evaluate(async () => {
		const d = window.__ow.dialog;
		for (let i = 0; i < 80; i++) { if (window.__ow.battle.blocking) break; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 60)); }
		return { inBattle: window.__ow.battle.blocking, savedParty: localStorage.getItem('magepunk_party_v1') };
	});
	A(solo.inBattle, 'the mini-game auto-starts a Factory battle for a fresh visitor', JSON.stringify({ inBattle: solo.inBattle }));
	A(solo.savedParty === null, 'the mini-game never writes an overworld party save');
	await page2.close();

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e)).concat(err2.filter(e => !/Failed to load resource/i.test(e)));
	A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
