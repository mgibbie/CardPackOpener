// expshare_test.mjs — tester question: "Do you have exp share?"
//
// The answer was no. EXP is awarded per-ACTIVE POKeMON (grantExp pays a.me, or
// both actives in a double) — there is no party-wide exp — and the EXP. SHARE
// item shipped with an empty `held: {}` payload, so holding it did nothing.
// Same for LUCKY EGG, whose expBoost field nothing read.
//
// Both now work, and both stay under the level cap.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/expshare_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8895;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 10, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 40, atk: 25, def: 25, spa: 25, spd: 25, spe: 25 }, maxHP: 40, curHP: 40,
	exp: 1000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19), mon('pidgey', 'BENCH', 's16.png', 16)];

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
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
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.party?.length >= 2)), 30000);
		A(ready, 'boot with a lead and a benched POKeMON');
		if (!ready) throw new Error('boot failed');

		A(await page.evaluate(() => window.__ow.Bag.ITEMS.expshare?.held?.expShare === true),
			'EXP. SHARE carries a payload the engine reads');

		// run one KO and report what each party member gained
		await page.evaluate(() => {
			window.__ko = async (benchItem, leadItem, cap) => {
				const b = window.__ow.battle;
				const party = window.__ow.party;
				party[0].heldItem = leadItem || null;
				party[1].heldItem = benchItem || null;
				for (const m of party) { m.level = 10; m.exp = 1000; m.curHP = m.maxHP; }
				b.start(party, 'pikachu', 5, () => {});
				const t0 = Date.now();
				while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
				const a = b.active;
				if (cap != null) b.levelCap = cap;
				const before = party.map(m => m.exp);
				a.foe.curHP = 0;
				b.checkFaints();
				for (let i = 0; i < 400 && b.active && b.active.phase !== 'done'; i++) {
					const x = b.active;
					x.foeShownHP = x.foe.curHP; x.meShownHP = x.me.curHP; x.msgT = 99;
					b.update(0.05);
				}
				const gained = party.map((m, i) => m.exp - before[i]);
				const levels = party.map(m => m.level);
				b.active = null;
				return { gained, levels };
			};
		});

		// ---- without the item: the bench gets nothing (the old behaviour) ----
		const none = await page.evaluate(() => window.__ko(null, null, 100));
		A(none.gained[0] > 0, 'the POKeMON that fought gains EXP', JSON.stringify(none.gained));
		A(none.gained[1] === 0, 'and a benched POKeMON gains NOTHING without EXP. SHARE',
			JSON.stringify(none.gained));

		// ---- with EXP. SHARE the bench earns half, and the fighter is not docked ----
		const shared = await page.evaluate(() => window.__ko('expshare', null, 100));
		A(shared.gained[0] === none.gained[0],
			'EXP. SHARE does not reduce the fighter\'s own EXP', `${none.gained[0]} -> ${shared.gained[0]}`);
		A(shared.gained[1] > 0, 'the benched holder now gains EXP', JSON.stringify(shared.gained));
		A(Math.abs(shared.gained[1] - Math.round(shared.gained[0] / 2)) <= 1,
			'and it is half the fighter\'s share', `${shared.gained[1]} vs half of ${shared.gained[0]}`);

		// ---- LUCKY EGG multiplies its own holder's share ----
		const egg = await page.evaluate(() => window.__ko(null, 'luckyegg', 100));
		A(egg.gained[0] > none.gained[0], 'LUCKY EGG increases its holder\'s EXP',
			`${none.gained[0]} -> ${egg.gained[0]}`);
		A(Math.abs(egg.gained[0] - Math.round(none.gained[0] * 1.5)) <= 2,
			'by the 1.5x its data claims', `${egg.gained[0]} vs 1.5 * ${none.gained[0]}`);

		// ---- the level cap still holds for a shared-exp mon ----
		const capped = await page.evaluate(() => window.__ko('expshare', null, 10));
		A(capped.levels[1] <= 10, 'a benched holder cannot pass the level cap either',
			JSON.stringify(capped.levels));
		A(capped.levels[0] <= 10, 'nor can the fighter', JSON.stringify(capped.levels));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
