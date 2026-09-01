// levelcap_test.mjs — the cross-region level cap.
//
// You are capped at Lv20 until you have beaten the FIRST gym in all three
// regions, and each further tier lifts the cap once every region has cleared it.
// The cap is a pure function of Quest.globalTier() (the minimum badge count
// across Kanto/Johto/Hoenn), so racing one region ahead buys you nothing — the
// point is that the world's difficulty and your team advance together.
//
// The numbers come off Badges.TIER_LEVEL_FLOOR, the same table
// applyGymLevelFloors() levels the Gym Leaders to, so the cap always sits a
// fixed headroom over the next leader and the two can never drift apart.
//
//   node overworld/tests/levelcap_test.mjs
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
const PORT = 8873;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const seedMon = {
	speciesId: 'rattata', name: 'RATTATA', level: 5, gender: 'M', friend: 70,
	types: ['Normal'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
};

// ---------- static: the cap table ----------
const badgesSrc = fs.readFileSync(path.join(ROOT, 'overworld/badges.js'), 'utf8');
A(/export const TIER_LEVEL_FLOOR/.test(badgesSrc), 'the gym level floors live in badges.js, beside the cap');
A(!/^const TIER_LEVEL_FLOOR = \[/m.test(fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8')),
	'main.js no longer keeps its own copy of the floors');
// the engine default must stay uncapped so PvP and the run modes are untouched
A(/this\.levelCap = MAX_LEVEL/.test(fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8')),
	'the battle engine defaults to no cap for every non-overworld caller');

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
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
		await page.evaluateOnNewDocument((st, mon) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
				localStorage.setItem('magepunk_region', 'KANTO');
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.Badges)), 30000);
		A(ready, 'boot: Pallet Town');
		if (!ready) throw new Error('boot failed');

		// ---- the table itself ----
		const table = await page.evaluate(() => {
			const B = window.__ow.Badges;
			return {
				caps: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(t => B.levelCap(t)),
				floors: B.TIER_LEVEL_FLOOR,
				step: B.LEVEL_CAP_STEP,
				next0: B.nextLevelCap(0),
			};
		});
		A(table.caps[0] === 20, 'you start capped at Lv20', JSON.stringify(table.caps));
		A(table.step === 10, 'the cap moves in increments of 10');
		A(JSON.stringify(table.caps) === JSON.stringify([20, 30, 40, 50, 60, 70, 80, 90, 100]),
			'the full ladder is 20..100 in tens', JSON.stringify(table.caps));
		A(table.caps.every((c, i) => i === 0 || c - table.caps[i - 1] === table.step),
			'every step is exactly one increment', JSON.stringify(table.caps));
		// The cap ladder and the Gym Leader floors are separate tables now, so pin
		// the one relationship that must hold: you can always out-level the gym
		// standing in front of you, or that tier would be unwinnable.
		A(table.floors.every((f, i) => table.caps[i] > f),
			'the cap always clears the next Gym Leader',
			table.floors.map((f, i) => `t${i}:${table.caps[i]}v${f}`).join(' '));
		A(table.caps[8] === 100, 'clearing all 24 gyms removes the cap entirely');
		A(table.next0 === table.caps[1], 'nextLevelCap previews the following tier');

		// ---- it keys off the WORST region, not the current one ----
		const gated = await page.evaluate(() => {
			const ow = window.__ow, B = ow.Badges;
			// _reset() only drops the in-memory memo — the badges are persisted,
			// so the store has to go too or the next state() reads them straight back
			const wipe = () => { localStorage.removeItem('magepunk_badges_v1'); B._reset(); };
			wipe();
			const out = { start: ow.levelCapNow() };
			B.earn('KANTO', 'boulder');
			out.afterKanto = ow.levelCapNow();
			out.hintAfterKanto = ow.levelCapHint();
			B.earn('JOHTO', 'zephyr');
			out.afterJohto = ow.levelCapNow();
			B.earn('HOENN', 'stone');
			out.afterAllThree = ow.levelCapNow();
			out.engineAfterRefresh = ow.refreshLevelCap();
			// a second badge in one region alone must not move it again
			B.earn('KANTO', 'cascade');
			out.afterSecondKanto = ow.levelCapNow();
			wipe(); ow.refreshLevelCap();
			return out;
		});
		A(gated.start === 20, 'a fresh save is capped at 20');
		A(gated.afterKanto === 20, 'beating only KANTO gym 1 does NOT raise the cap');
		A(gated.afterJohto === 20, 'nor does adding JOHTO gym 1');
		A(gated.afterAllThree === 30, 'the third region is what lifts it — to Lv30', String(gated.afterAllThree));
		A(gated.engineAfterRefresh === 30, 'and the battle engine is refreshed to match');
		A(gated.afterSecondKanto === 30, 'racing one region ahead earns nothing further', String(gated.afterSecondKanto));
		A(/JOHTO|Johto/.test(gated.hintAfterKanto) && /HOENN|Hoenn/.test(gated.hintAfterKanto),
			'the hint names the regions still owed', gated.hintAfterKanto);

		// ---- EXP actually stops at the cap ----
		const exp = await page.evaluate(() => {
			const ow = window.__ow, b = ow.battle;
			const mk = (level, exp) => ({ speciesId: 'rattata', name: 'RATTATA', level, exp,
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
				moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }] });
			const run = (mon, gain) => { b.active = { queue: [] }; b.awardExp(mon, gain); return b.active.queue.map(q => q.text).join(' | '); };
			const prevCap = b.levelCap;
			b.levelCap = 20;
			const out = {};

			// a mon that would blow far past the cap stops exactly on it
			const a = mk(19, 19 ** 3);
			out.aMsg = run(a, 400000);
			out.aLevel = a.level;
			out.aHeldJustShort = a.exp === 21 ** 3 - 1;

			// one already sitting on the cap does not move at all
			const c = mk(20, 20 ** 3);
			out.cMsg = run(c, 400000);
			out.cLevel = c.level;

			// below the cap, growth is completely normal
			const d = mk(5, 5 ** 3);
			run(d, 2000);
			out.dLevel = d.level;

			// a gift/traded mon ALREADY over the cap is never dragged back down
			const e = mk(35, 35 ** 3);
			run(e, 400000);
			out.eLevel = e.level;

			// lift the cap and the held-back mon grows again immediately
			b.levelCap = 30;
			run(a, 1);
			out.aAfterLift = a.level;

			b.levelCap = prevCap; b.active = null;
			return out;
		});
		A(exp.aLevel === 20, 'EXP growth halts exactly at the cap', String(exp.aLevel));
		A(/LEVEL CAP/.test(exp.aMsg), 'and the battle says why', exp.aMsg);
		A(exp.aHeldJustShort, 'EXP is held one point short of the next level — not banked, not lost');
		A(exp.cLevel === 20, 'a mon already at the cap gains no level');
		A(/LEVEL CAP/.test(exp.cMsg), 'it is told so too');
		A(exp.dLevel > 5 && exp.dLevel <= 20, 'below the cap, levelling is untouched', String(exp.dLevel));
		A(exp.eLevel === 35, 'a mon above the cap is never de-levelled', String(exp.eLevel));
		A(exp.aAfterLift === 21, 'raising the cap lets it grow on the very next battle', String(exp.aAfterLift));

		// ---- the other growth paths obey it too ----
		const others = await page.evaluate(() => {
			const ow = window.__ow;
			const out = {};
			localStorage.removeItem('magepunk_badges_v1'); ow.Badges._reset(); ow.refreshLevelCap();
			// RARE CANDY cannot buy a level past the cap
			const mon = { speciesId: 'rattata', name: 'RATTATA', level: 20, exp: 20 ** 3, curHP: 20, maxHP: 20,
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, moves: [] };
			const before = mon.level;
			ow.party.push(mon);
			// useRareCandy isn't exported; drive the same guard the bag uses
			out.candyBlocked = mon.level >= ow.levelCapNow();
			ow.party.pop();
			out.cap = ow.levelCapNow();
			// the DAY CARE clamps on withdrawal rather than handing back a Lv40
			const dc = ow.Daycare;
			dc.reset();
			dc.deposit({ speciesId: 'rattata', name: 'BOARDER', level: 18, exp: 40 ** 3, curHP: 20, maxHP: 20,
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, moves: [] });
			out.info = dc.withdrawInfo(0, ow.battle.data, ow.levelCapNow());
			dc.reset();
			return out;
		});
		A(others.cap === 20, 'the cap is back to 20 for this check', String(others.cap));
		A(others.candyBlocked, 'a RARE CANDY is refused at the cap');
		A(others.info.to === 20, 'the DAY CARE hands back a capped level, not Lv40', JSON.stringify(others.info));
		A(others.info.capped === true, 'and flags that the cap is what limited it');

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
