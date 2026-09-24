// whiteout_test.mjs — losing every POKeMON must actually cost something.
//
// Reported: "blacking out doesn't lose money or set you to the last pokemon
// center you went to." Nine battle-end handlers each just called healParty() in
// place, so a defeat healed you for free and left you standing where you fell.
// They now all route through one whiteOut(): heal, lose half your money, and
// wake up at the last centre you healed at.
//
// Facility runs (Trainer Hill, the Frontier) deliberately do NOT black you out —
// a facility loss ends the run, which is what the real games do.
//
//   node overworld/tests/whiteout_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/function whiteOut\(\)/.test(mn), 'there is one shared whiteOut()');
	A(/const WHITEOUT_MONEY_FRACTION = \d+/.test(mn), 'the money penalty is a named constant');
	// every defeat handler must go through it — none may heal in place any more
	const healInPlace = (mn.match(/party healed/g) || []).length;
	A(healInPlace <= 2, 'no battle-end handler heals in place any more (Trainer Hill aside)', 'found ' + healInPlace);
	A((mn.match(/whiteOut\(\)/g) || []).length >= 9, 'every losing battle path routes through it',
		'call sites: ' + ((mn.match(/whiteOut\(\)/g) || []).length - 1));
	A(/sfx\('heal'\); healParty\((?:S\.)?party\); noteHealPoint\(\);/.test(mn), 'the POKeMON CENTER nurse records the heal point');
	A(/Trainer Hill challenge ends/.test(mn), 'a Trainer Hill loss still ends the run instead of blacking out');
	const rs = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	A(/magepunk_healpoint_v1/.test(rs), 'the heal point is part of the canonical save');
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8983;
	const STATE = { username: 'whiteout', friendCode: 'WHITEO', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'squirtle', name: 'SQUIRTLE', level: 5, gender: 'M', friend: 70, types: ['Water'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 20, atk: 11, def: 12, spa: 11, spd: 11, spe: 10 }, maxHP: 20, curHP: 3,
		exp: 135, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1100, height: 800 });
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			// seed money/heal-point ONCE. evaluateOnNewDocument runs on EVERY
			// navigation, so re-seeding here would quietly undo exactly what the
			// reload assertions are checking.
			if (!localStorage.getItem('__seeded')) {
				localStorage.setItem('__seeded', '1');
				localStorage.setItem('magepunk_money', '4000');
				localStorage.removeItem('magepunk_healpoint_v1');
			}
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(1500);
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// --- with no centre visited yet, the fallback is the region's home town ---
		const fallback = await page.evaluate(() => window.__ow.healPoint());
		A(fallback && fallback.map === 'PalletTown', 'a save that has never healed falls back to its home town', JSON.stringify(fallback));

		// --- record a heal point the way the nurse does ---
		await page.evaluate(() => { window.__ow.noteHealPoint(); });
		const hp = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('magepunk_healpoint_v1') || 'null'), at: [window.__ow.player.tx, window.__ow.player.ty] }));
		A(hp.stored && hp.stored.map === 'Route1' && hp.stored.x === hp.at[0] && hp.stored.y === hp.at[1],
			'healing records the exact map and tile, and it persists', JSON.stringify(hp));

		// --- now LOSE a real wild battle ---
		await page.evaluate(() => { const p = window.__ow.player; p.tx = 12; p.ty = 30; p.px = 12 * 16; p.py = 30 * 16; });
		const moneyBefore = await page.evaluate(() => window.__ow.Bag.getMoney());
		A(moneyBefore === 4000, 'starting money is what we set', String(moneyBefore));
		await page.evaluate(() => window.__ow.startWildBattle({ id: 'onix', level: 40 }));
		await sleep(1500);
		A(await page.evaluate(() => window.__ow.battle.blocking), 'a losing battle started');
		for (let i = 0; i < 900; i++) {
			if (!(await page.evaluate(() => window.__ow.battle.blocking))) break;
			await page.evaluate(() => { try { window.__ow.battle.key('z'); } catch (e) {} });
			await sleep(90);
		}
		await sleep(1200);

		const afterLoss = await page.evaluate(() => ({
			money: window.__ow.Bag.getMoney(),
			dialog: window.__ow.dialog.blocking,
			pages: (window.__ow.dialog.pages || []).flat().join(' '),
			lead: (window.__ow.party || [])[0],
		}));
		A(afterLoss.money === 2000, 'losing costs half your money', `before 4000, after ${afterLoss.money}`);
		A(afterLoss.dialog === true, 'the blackout tells you what happened');
		A(/no POKeMON that can fight/i.test(afterLoss.pages), 'the message names the blackout', afterLoss.pages.slice(0, 90));
		A(/dropped \$2,?000/.test(afterLoss.pages), 'and says what it cost', afterLoss.pages.slice(0, 120));
		A(afterLoss.lead && afterLoss.lead.curHP === afterLoss.lead.maxHP, 'the party is healed',
			afterLoss.lead ? `${afterLoss.lead.curHP}/${afterLoss.lead.maxHP}` : 'no lead');

		// --- advance the dialog: you wake up at the heal point ---
		for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) {
			await page.evaluate(() => window.__ow.dialog.key('z'));
			await sleep(200);
		}
		await sleep(2500);
		const woke = await page.evaluate(() => ({ map: window.__ow.world.current.name, pos: [window.__ow.player.tx, window.__ow.player.ty] }));
		const near = Math.max(Math.abs(woke.pos[0] - hp.stored.x), Math.abs(woke.pos[1] - hp.stored.y));
		A(woke.map === 'Route1' && near <= 2,
			'you wake up at the place you last healed (findLanding may nudge a square)',
			JSON.stringify({ woke, healPoint: hp.stored, distance: near }));

		// --- and it all survives a reload (the heal point is real save data) ---
		await page.reload({ waitUntil: 'domcontentloaded' });
		const t1 = Date.now();
		while (Date.now() - t1 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(1200);
		const persisted = await page.evaluate(() => ({ hp: window.__ow.healPoint(), money: window.__ow.Bag.getMoney() }));
		A(persisted.hp && persisted.hp.map === 'Route1' && persisted.hp.x === hp.stored.x,
			'the heal point survives a reload', JSON.stringify(persisted.hp));
		A(persisted.money === 2000, 'and so does the money you lost', String(persisted.money));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message, e.stack);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
