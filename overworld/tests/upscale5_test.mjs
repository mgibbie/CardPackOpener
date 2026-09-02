// upscale5_test.mjs — Upscale Batch 5: the postgame deserves players.
//
// This session built the postgame CONTENT (16 badges, Mt Silver, 87 placed
// legendaries); this batch builds the layer that tells the player it exists and
// pays them for finishing it:
//
//   * every objective surface went SILENT after the home crown — postgameObjective
//     now narrates the arc (Magnet Train → 8 old-Kanto gyms → RED → the hunt,
//     with a live rumor naming an uncaught legend's lair)
//   * the quest log gains the OLD KANTO rows; the trainer card gains a JohKanto
//     pip row and a LEGENDS n/N counter
//   * dex milestones ran out at 300 of 1,751 — extended to the DEX CROWN at full
//   * RED paid a flag and silence — now $100k, candies, and RED'S CAP
//   * catching every legendary pays the LEGEND CHARM (checked in
//     dexMilestoneCheck, which every catch path already funnels through)
//   * the league Centers gained a PREMIUM clerk (rare candies, mints, capsules)
//     once the JOHTO crown opens the postgame — the missing money sink. STATIC
//     stock on purpose: dailies were explicitly skipped (user call).
//   * the MAIL badge populates at boot instead of only after opening the mailbox
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/upscale5_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- static ----------
{
	const dex = fs.readFileSync(path.join(ROOT, 'overworld/pokedex.js'), 'utf8');
	A(/\[1751, 'dexcrown'/.test(dex), 'the milestone ladder reaches the full dex (1751 → DEX CROWN)');
	const bag = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
	for (const id of ['dexcrown', 'legendcharm', 'redscap']) A(bag.includes(id + ':'), `${id} exists as an item`);
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/setInterval\(refreshMail, 120000\)/.test(main), 'the MAIL badge refreshes without opening the mailbox');
	A(/dailies system was\s+\/\/ deliberately skipped|deliberately skipped/.test(main), 'the premium stock records WHY it is static (dailies were skipped by user call)');
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
	const PORT = 8942;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 80, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 220, atk: 160, def: 160, spa: 160, spd: 160, spe: 160 }, maxHP: 220, curHP: 220,
		exp: 512000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.removeItem('magepunk_story');
			localStorage.removeItem('magepunk_badges_v1');
			localStorage.removeItem('magepunk_bag_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// ---------- the guidance arc, stage by stage ----------
		const arc = await page.evaluate(async () => {
			const ow = window.__ow;
			const B = await import('./badges.js');
			const out = {};
			// pre-crown: no postgame line
			out.before = ow.postgameObjective ? ow.postgameObjective() : '(not exposed)';
			// crown JOHTO -> the Magnet Train line
			for (const id of ['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising']) B.earn('JOHTO', id);
			B.crown('JOHTO');
			out.afterCrown = ow.postgameObjective();
			// three old-Kanto badges -> the count moves
			for (const id of ['boulder', 'cascade', 'thunder']) B.earn('JOHKANTO', id);
			out.mid = ow.postgameObjective();
			// all eight -> RED
			for (const id of ['rainbow', 'soul', 'marsh', 'volcano', 'earth']) B.earn('JOHKANTO', id);
			out.allBadges = ow.postgameObjective();
			// beat RED -> the hunt, with a live rumor
			ow.Story.setFlag('beat_red');
			out.afterRed = ow.postgameObjective();
			out.log = ow.postgameLog().map(r => `${r.state}:${r.label}`);
			return out;
		});
		A(arc.before === null, 'no postgame line before the JOHTO crown', JSON.stringify(arc.before));
		A(/MAGNET TRAIN.*8 of its GYMS/i.test(arc.afterCrown), 'the crown points at the old KANTO (8 gyms left)', arc.afterCrown);
		A(/5 of its GYMS/i.test(arc.mid), '...and counts down as badges land', arc.mid);
		A(/RED waits at the summit/i.test(arc.allBadges), 'all 16 badges point at RED', arc.allBadges);
		A(/legendary POKeMON still hide/.test(arc.afterRed) && /Rumor places .+ in .+/.test(arc.afterRed),
			'after RED the hunt takes over, with a rumor naming a real lair', arc.afterRed);
		A(arc.log.some(r => /done:MISTY — CERULEAN CITY/.test(r)) && arc.log.some(r => /done:RED — MT SILVER/.test(r))
			&& arc.log.some(r => /LEGENDS — \d+\/\d+/.test(r)),
			'the quest log carries the OLD KANTO rows, RED, and the legend count', JSON.stringify(arc.log.slice(0, 4)));

		// ---------- the premium counter ----------
		const shop = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('IndigoPlateauPokecenter1F');
			const here = ow.shopStockNow ? ow.shopStockNow() : [];
			const clerk = ow.services.kindAt(6, 1) || ow.services.kindAt(6, 2);
			await ow.moveToMap('NewBarkTown');
			const away = ow.shopStockNow();
			return { premiumHere: here.includes('rarecandy') && here.includes('abilitycapsule'),
				clerk, premiumAway: away.includes('rarecandy'), baseLen: away.length };
		});
		A(shop.clerk === 'shop', 'the Indigo Plateau Center has a clerk at the premium counter', JSON.stringify(shop));
		A(shop.premiumHere, '...selling RARE CANDIES and ABILITY CAPSULES there', JSON.stringify(shop));
		A(!shop.premiumAway, '...and nowhere else', JSON.stringify(shop));

		// ---------- RED's capstone (source-verified: the award path runs inside
		// the badge-award flow, which a harness can't cleanly trigger) ----------
		{
			const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
			A(/Bag\.earn\(100000\);\s*\n\s*Bag\.addItem\('rarecandy', 10\);\s*\n\s*Bag\.addItem\('redscap', 1\)/.test(main),
				"RED's win pays $100k + 10 candies + RED'S CAP");
			A(/all_legends_caught/.test(main) && /legendcharm/.test(main),
				'catching every legendary pays the LEGEND CHARM, checked where every catch already funnels');
		}

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
