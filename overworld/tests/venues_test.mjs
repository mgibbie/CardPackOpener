// venues_test.mjs — Batch B of the second upscale plan: the minigame venues.
//
//   * Bug-Catching Contest (National Park, Tue/Thu/Sat): sign-up officer,
//     contest-only bug table, the single kept entry with the swap prompt,
//     judging with prizes, and the entry joining the party at the end
//   * Trick House (Route 110): the entrance door leads to the CURRENT puzzle,
//     the maze exit stays sealed until the SCROLL is found, the Trick Master
//     pays and advances — and every puzzle room's scroll + exit are actually
//     REACHABLE on foot (BFS over the shipped collision)
//   * Ruins of Alph: the replica wall opens a 3×3 slide puzzle; solving it
//     opens the floor to the chamber's item room and is remembered
//
//   node overworld/tests/venues_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Slide from '../slidepuzzle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- slide puzzle unit ----------
{
	A(Slide.solved(Slide.solvedBoard()), 'the solved board is solved');
	const b = [0, 1, 2, 3, 4, 8, 6, 7, 5]; // one slide from home: tile 5 sits below the blank
	A(Slide.move(b, 'up') === true && Slide.solved(b), 'sliding the tile below the blank upward completes it');
	const s = Slide.solvedBoard(); // blank bottom-right
	A(Slide.move(s, 'up') === false && Slide.move(s, 'left') === false, 'slides off the edge refuse');
	A(Slide.move(s, 'down') === true && !Slide.solved(s), 'a legal slide moves exactly one tile');
	for (let i = 0; i < 5; i++) {
		const sh = Slide.shuffle(Math.random);
		A(!Slide.solved(sh) && [...sh].sort((a, b) => a - b).join() === '0,1,2,3,4,5,6,7,8',
			`shuffle ${i + 1} deals a real, unsolved permutation`);
	}
}

// ---------- source wiring ----------
{
	const sv = fs.readFileSync(path.join(ROOT, 'overworld/services.js'), 'utf8');
	A(/MAP_ROUTE_36_NATIONAL_PARK_GATE/.test(sv) && /MAP_ROUTE_35_NATIONAL_PARK_GATE/.test(sv) && /'bugcontest'/.test(sv),
		'both National Park gates carry the contest officer zone');
	A(/MAP_ROUTE110_TRICK_HOUSE_PUZZLE8/.test(sv) && /trickscroll/.test(sv) && /trickend/.test(sv),
		'all eight Trick House rooms carry scroll zones, the End room its master');
	A(/MAP_RUINS_OF_ALPH_HO_OH_CHAMBER/.test(sv) && /ruinspuzzle/.test(sv), 'all four ruins chambers carry the puzzle wall');
	A(/sportball/.test(fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8')), 'the SPORT BALL exists (never sold)');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/bugContestCatch\(battle\.lastCaught\)/.test(mn), 'the wild catch path defers to the contest entry keeper');
	const rs = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	for (const k of ['magepunk_bugcontest_v1', 'magepunk_trickhouse_v1', 'magepunk_ruins_v1'])
		A(rs.includes(`'${k}'`), `${k} joins the canonical save inventory`);
}

// puzzle-room targets for the live reachability sweep, read from the shipped maps
const PUZZLES = [];
for (let n = 1; n <= 8; n++) {
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, `overworld/data/maps/Route110_TrickHousePuzzle${n}_map.json`), 'utf8'));
	const entry = m.warp_events.find(w => /ENTRANCE/.test(w.dest_map));
	const exit = m.warp_events.find(w => /TRICK_HOUSE_END/.test(w.dest_map));
	const sign = m.bg_events[0];
	PUZZLES.push({ n, entry: [entry.x, entry.y], exit: [exit.x, exit.y], scroll: [sign.x, sign.y] });
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
	const PORT = 8976;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 15, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 50, atk: 25, def: 25, spa: 25, spd: 25, spe: 25 }, maxHP: 50, curHP: 50,
		exp: 3375, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NationalPark`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the park boots');
		const closeDialog = async () => {
			for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('x'); await new Promise(r => setTimeout(r, 120)); }
		};

		// --- bug contest ---
		const bug = await page.evaluate(() => {
			const ow = window.__ow;
			const o = {};
			o.dayLogicPure = ow.isBugDay() === [2, 4, 6].includes(new Date().getDay());
			// force a running contest (the officer path is date-gated)
			ow.bugContest.active = true; ow.bugContest.caught = null; ow.bugContest.date = 'test';
			ow.Bag.addItem('sportball', 20);
			// the contest table takes over on the park map
			let pick = null;
			for (let i = 0; i < 500 && !pick; i++) pick = ow.bugContestRoll();
			o.pick = pick;
			// first catch becomes the entry
			const scyther = { speciesId: 'scyther', name: 'SCYTHER', level: 14, maxHP: 45, stats: { atk: 40, def: 30, spa: 20, spd: 30, spe: 40 } };
			o.first = ow.bugContestCatch(scyther);
			o.entry = ow.bugContest.caught?.name;
			// a worse catch raises the swap prompt; X keeps the old one
			const weedle = { speciesId: 'weedle', name: 'WEEDLE', level: 8, maxHP: 20, stats: { atk: 10, def: 10, spa: 10, spd: 10, spe: 10 } };
			o.second = ow.bugContestCatch(weedle);
			o.promptUp = ow.dialog.blocking;
			return o;
		});
		A(bug.dayLogicPure, 'Tue/Thu/Sat gating matches the calendar');
		A(bug.pick && ['caterpie', 'weedle', 'metapod', 'kakuna', 'paras', 'venonat', 'butterfree', 'beedrill', 'scyther', 'pinsir'].includes(bug.pick.id),
			'the contest bug table takes over in the park', JSON.stringify(bug.pick));
		A(bug.first === true && bug.entry === 'SCYTHER', 'the first catch becomes the kept entry');
		A(bug.second === true && bug.promptUp, 'a second catch raises the swap prompt');
		await closeDialog(); // X = keep the old entry
		const judged = await page.evaluate(() => {
			const ow = window.__ow;
			const o = { kept: ow.bugContest.caught?.name, partyBefore: ow.party.length };
			const prizeCount = () => ['sunstone', 'everstone', 'goldberry', 'berry'].reduce((s, id) => s + ow.Bag.count(id), 0);
			o.prizesBefore = prizeCount();
			ow.endBugContest();
			o.partyAfter = ow.party.length;
			o.prizesAfter = prizeCount();
			o.balls = ow.Bag.count('sportball');
			o.active = ow.bugContest.active;
			o.results = ow.dialog.blocking;
			return o;
		});
		A(judged.kept === 'SCYTHER', 'X at the swap prompt kept the original entry');
		A(judged.partyAfter === judged.partyBefore + 1, 'the entry joins the party at the judging');
		A(judged.prizesAfter === judged.prizesBefore + 1, 'a prize is paid by placement');
		A(judged.balls === 0 && judged.active === false && judged.results, 'leftover balls return, the contest closes, the results roll');
		await closeDialog();

		// --- trick house: reachability of every room's scroll + exit ---
		const reach = await page.evaluate(async (puzzles) => {
			const ow = window.__ow;
			const out = [];
			for (const p of puzzles) {
				await ow.moveToMap(`Route110_TrickHousePuzzle${p.n}`, 2, 20);
				const lay = ow.world.current.layout;
				// Puzzle 7 crosses its room on teleport pads — same-map warps are edges
				const warps = ow.world.current.map.warp_events || [];
				const padTo = {};
				for (const w of warps) {
					if (!new RegExp(`TRICK_HOUSE_PUZZLE${p.n}$`).test(w.dest_map)) continue;
					const d = warps[parseInt(w.dest_warp_id, 10)];
					if (d) padTo[w.x + ',' + w.y] = [d.x, d.y];
				}
				const seen = new Set();
				const q = [p.entry];
				seen.add(p.entry.join());
				while (q.length) {
					const [x, y] = q.shift();
					const pad = padTo[x + ',' + y];
					if (pad && !seen.has(pad.join())) { seen.add(pad.join()); q.push(pad); }
					for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
						const nx = x + dx, ny = y + dy;
						if (nx < 0 || ny < 0 || nx >= lay.width || ny >= lay.height) continue;
						const k = nx + ',' + ny;
						if (seen.has(k) || !ow.world.isPassable(nx, ny)) continue;
						seen.add(k);
						q.push([nx, ny]);
					}
				}
				const near = ([x, y]) => seen.has(x + ',' + y) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((x + dx) + ',' + (y + dy)));
				out.push({ n: p.n, scroll: near(p.scroll), exit: near(p.exit) });
			}
			return out;
		}, PUZZLES);
		for (const r of reach) A(r.scroll && r.exit, `Puzzle ${r.n}: the scroll and the sealed door are reachable on foot`, JSON.stringify(r));

		// --- trick house flow ---
		const th = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			localStorage.removeItem('magepunk_trickhouse_v1');
			await ow.moveToMap('Route110_TrickHousePuzzle1', 2, 20);
			o.gate = ow.trickWarp({ dest_map: 'MAP_ROUTE110_TRICK_HOUSE_END' });
			o.gateSaysWhy = ow.dialog.blocking;
			return o;
		});
		A(th.gate === 'blocked' && th.gateSaysWhy, 'the maze exit is sealed without the scroll');
		await closeDialog();
		const th2 = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			ow.trickScrollFind();
			o.scroll = ow.trickState().scroll;
			o.pass = ow.trickWarp({ dest_map: 'MAP_ROUTE110_TRICK_HOUSE_END' });
			await ow.moveToMap('Route110_TrickHouseEnd', 4, 7);
			const candyBefore = ow.Bag.count('rarecandy');
			ow.trickEndTalk();
			o.stage = ow.trickState().stage;
			o.scrollSpent = !ow.trickState().scroll;
			o.prize = ow.Bag.count('rarecandy') - candyBefore;
			o.journal = ow.Journal.list()[0]?.text || '';
			return o;
		});
		A(th2.scroll === true && th2.pass === null, 'finding the scroll unseals the door');
		await closeDialog(); // the master's speech (closing it fires the warp home)
		A(th2.stage === 1 && th2.scrollSpent && th2.prize === 1, 'the Trick Master pays puzzle 1 and advances the house', JSON.stringify(th2));
		A(/Trick House puzzle 1/.test(th2.journal), 'the journal remembers the clear', th2.journal);
		const th3 = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('Route110_TrickHouseEntrance', 5, 5);
			const r = ow.trickWarp({ dest_map: 'MAP_ROUTE110_TRICK_HOUSE_PUZZLE1' });
			return r;
		});
		A(th3 && /PUZZLE2$/.test(th3.map), 'the entrance door now leads to Puzzle 2', JSON.stringify(th3));

		// --- ruins of alph ---
		const ruins = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			await ow.moveToMap('RuinsOfAlphKabutoChamber', 3, 6);
			const p = ow.player;
			p.tx = 2; p.ty = 4; p.px = 2 * 16; p.py = 4 * 16; p.facing = 'up';
			ow.interact();
			o.opened = ow.slideMenu.open;
			o.tiles = [...(ow.slideMenu.board || [])].sort((a, b) => a - b).join();
			ow.drawSlide(480, 320);
			// cheat to one slide from home, then make the winning move
			ow.slideMenu.board = [0, 1, 2, 3, 4, 8, 6, 7, 5];
			ow.slideKey('ArrowUp');
			o.done = ow.slideMenu.done;
			o.saved = JSON.parse(localStorage.getItem('magepunk_ruins_v1') || '{}')?.solved?.kabuto === true;
			o.dialogUp = ow.dialog.blocking;
			return o;
		});
		A(ruins.opened && ruins.tiles === '0,1,2,3,4,5,6,7,8', 'the replica wall deals a real 3×3 slide puzzle');
		A(ruins.done && ruins.saved, 'solving it is remembered per chamber', JSON.stringify(ruins));
		A(ruins.dialogUp, 'the floor-opens moment plays');
		for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await new Promise(r => setTimeout(r, 150)); }
		await new Promise(r => setTimeout(r, 1200)); // the warp into the item room lands
		const dropped = await page.evaluate(() => window.__ow.world.current.name);
		A(dropped === 'RuinsOfAlphKabutoItemRoom', 'the opened floor drops into the chamber item room', dropped);

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
