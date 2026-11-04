// givers_test.mjs — key-item givers honour the badge their dialogue promises.
//
// Playtest 2026-09-25: Whitney beaten (Johto 3: Zephyr, Hive, Plain), but the
// Goldenrod florist still said "Come back once you've beaten WHITNEY", so there was
// no SQUIRTBOTTLE and Sudowoodo blocked Route 36. Her prereq was { badge: 3 },
// checked against globalTier() (the shared corridor tier), which that save's
// Hoenn 3 / Kanto 2 badges read as 2. Steven's DEVON SCOPE had the same mismatch.
// Givers now name the gym: { gymBadge: ['JOHTO', 'plain'] } / ['HOENN', 'balance'].
// Corridor gates keep the global tier (by design).
//
//   node overworld/tests/givers_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9129;
const STATE = { username: 'givers', friendCode: 'GIVER0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 };
const B = ids => Object.fromEntries(ids.map(i => [i, true]));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const run = async (badges, region, fn) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, badges, region, lead) => {
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', 'givers-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_rival', 'SILVER');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges, champion: {} }));
			localStorage.setItem('magepunk_repel_v1', '99999');
		}, STATE, badges, region, LEAD);
		const boot = async (map, x, y) => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
			for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
			await sleep(1800);
		};
		// talk to the giver through interact(), facing it, and read what it said
		const talk = async (gx, gy) => {
			const r = await page.evaluate(async (gx, gy) => {
				const W = window.__ow, p = W.player;
				p.tx = gx; p.ty = gy + 1; p.px = gx * 16; p.py = (gy + 1) * 16; p.facing = 'up'; p.moving = false;
				W.interact();
				await new Promise(r => setTimeout(r, 400));
				const said = JSON.stringify(W.dialog.pages || '');
				for (let i = 0; i < 30 && W.dialog.blocking; i++) { W.dialog.revealed = 1e9; W.dialog.key('z'); await new Promise(r => setTimeout(r, 80)); }
				return said;
			}, gx, gy);
			return r;
		};
		const bag = id => page.evaluate(id => window.__ow.Bag.count(id), id);
		const flag = f => page.evaluate(f => !!window.__ow.Story.getFlag(f), f);
		try { await fn({ page, boot, talk, bag, flag, errors }); } finally { await ctx.close(); }
	};

	// the reporter's save: Johto 3 incl. PLAIN, Hoenn 3, Kanto 2 -> globalTier 2
	await run({ JOHTO: B(['zephyr', 'hive', 'plain']), HOENN: B(['stone', 'knuckle', 'dynamo']), KANTO: B(['boulder', 'cascade']) }, 'KANTO', async t => {
		await t.boot('GoldenrodFlowerShop', 2, 5);
		const tier = await t.page.evaluate(async () => (await import('/overworld/quest.js')).globalTier());
		A(tier === 2, 'setup: the reporter\'s uneven badges read as global tier 2', String(tier));
		const said = await t.talk(2, 4);
		A(await t.bag('squirtbottle') === 1 && await t.flag('gave_squirtbottle'), 'with the PLAIN BADGE the florist hands over the SQUIRTBOTTLE (despite global tier 2)', said);
		const again = await t.talk(2, 4);
		A(await t.bag('squirtbottle') === 1 && !/beaten WHITNEY/.test(again), 'talking again grants nothing more', again);
		await t.boot('GoldenrodFlowerShop', 2, 5);   // reload
		A(await t.bag('squirtbottle') === 1 && await t.flag('gave_squirtbottle'), 'the SQUIRTBOTTLE and the one-shot flag survive a reload');
		// Route 36: the Sudowoodo blocker's own condition (the item) is now met
		await t.boot('Route36', 34, 9);
		const sudo = await t.page.evaluate(() => { const b = window.__ow.blockers; return { blocks: b.blocks(35, 9), up: (b.list || []).some(x => x.id === 'j_sudowoodo') }; });
		A(!sudo.blocks, 'with the SQUIRTBOTTLE the Route 36 Sudowoodo no longer bars the tile', JSON.stringify(sudo));
		A(t.errors.length === 0, 'no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
	});

	// before Whitney: lots of badges elsewhere, but not the PLAIN BADGE
	await run({ JOHTO: B(['zephyr', 'hive']), KANTO: B(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']), HOENN: B(['stone', 'knuckle', 'dynamo', 'heat']) }, 'JOHTO', async t => {
		await t.boot('GoldenrodFlowerShop', 2, 5);
		const said = await t.talk(2, 4);
		A(await t.bag('squirtbottle') === 0 && /WHITNEY/.test(said), 'before WHITNEY the florist waits, however many other badges you hold', said);
	});

	// Hoenn: Steven's DEVON SCOPE follows NORMAN's BALANCE BADGE the same way
	await run({ HOENN: B(['stone', 'knuckle', 'dynamo', 'heat', 'balance']), KANTO: B(['boulder']), JOHTO: B(['zephyr']) }, 'HOENN', async t => {
		await t.boot('Route120', 13, 16);
		await t.talk(13, 15);
		A(await t.bag('devonscope') === 1, 'with the BALANCE BADGE Steven hands over the DEVON SCOPE (despite global tier 1)');
	});
	await run({ HOENN: B(['stone', 'knuckle', 'dynamo', 'heat']), KANTO: B(['boulder', 'cascade', 'thunder', 'rainbow', 'soul']), JOHTO: B(['zephyr', 'hive', 'plain', 'fog', 'storm']) }, 'HOENN', async t => {
		await t.boot('Route120', 13, 16);
		await t.talk(13, 15);
		A(await t.bag('devonscope') === 0, 'without the BALANCE BADGE he doesn\'t (even at global tier 4)');
	});
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
