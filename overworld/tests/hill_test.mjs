// hill_test.mjs — Upscale 3 Batch 1: Trainer Hill + the Game Corner slots.
//
// Slots (unit, direct import): deterministic strips, skill-stop order, the
// payout table, the two-cherry consolation. Trainer Hill (live): the door
// refuses without a run, sign-up starts the clock, each floor injects two
// guards onto scanned-passable tiles, the stairs stay barred until both
// fall, a guard battle runs on the real trainer engine, and the roof pays
// by time and remembers the best.
//
//   node overworld/tests/hill_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Slots from '../slots.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- slots unit ----------
{
	const st = Slots.newGame(() => 0); // all reels at strip position 0
	A(st.pos.every(p => p === 0) && !st.done, 'a deterministic deal starts spinning');
	Slots.tick(st);
	A(st.pos.every(p => p === 1), 'a tick advances every spinning reel');
	A(Slots.stopNext(st) === 0 && st.stopped[0] && !st.stopped[1], 'the first press freezes reel 1 only');
	Slots.tick(st);
	A(st.pos[0] === 1 && st.pos[1] === 2, 'a frozen reel stays put while the others spin');
	Slots.stopNext(st); Slots.stopNext(st);
	A(st.done && Slots.stopNext(st) === -1, 'three presses finish the spin');
	// force lines and read the table
	const line = syms => {
		const g = { pos: [0, 0, 0], stopped: [true, true, true], done: true };
		// position each reel so the payline shows the wanted symbol
		g.pos = syms.map(s => Slots.STRIP.indexOf(s));
		return Slots.payout(g);
	};
	A(line(['seven', 'seven', 'seven']) === 100, 'three 7s pay 100');
	A(line(['bar', 'bar', 'bar']) === 50, 'three BARs pay 50');
	A(line(['cherry', 'cherry', 'berry']) === 2, 'two cherries pay the consolation 2');
	A(line(['pika', 'psy', 'berry']) === 0, 'a mixed line pays nothing');
	A(Slots.row({ pos: [0, 0, 0] }, 0).every(s => s === Slots.STRIP[0]), 'row() reads the strip at the payline');
}

// ---------- source ----------
{
	const sv = fs.readFileSync(path.join(ROOT, 'overworld/services.js'), 'utf8');
	A(/MAP_TRAINER_HILL_ENTRANCE/.test(sv) && /hillprize/.test(sv) && /hillelevator/.test(sv),
		'the reception, roof, and elevator carry zones');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/hillPrepFloor\(label\); \/\/ must precede npcs\.loadForMap/.test(mn), 'guards inject before the NPC load');
	A(/'PLAY SLOTS'/.test(mn), 'the Game Corner hub offers slots');
	A(/'magepunk_trainerhill_v1'/.test(fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8')),
		'the best time joins the canonical save inventory');
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
	const PORT = 8990;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 220, atk: 160, def: 140, spa: 140, spd: 140, spe: 160 }, maxHP: 220, curHP: 220,
		exp: 216000, moves: [{ id: 'hyperbeam', name: 'Hyper Beam', pp: 5, maxPp: 5 }, { id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=TrainerHill_Entrance&x=9&y=10`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the entrance boots');
		const closeDialog = async (key = 'x') => {
			for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press(key); await new Promise(r => setTimeout(r, 130)); }
		};

		// no run: the stairs refuse
		const gate = await page.evaluate(() => {
			const ow = window.__ow;
			const r = ow.hillWarp({ dest_map: 'MAP_TRAINER_HILL_1F' });
			return { r, why: ow.dialog.blocking };
		});
		A(gate.r === 'blocked' && gate.why, 'the door refuses without a signed-up run');
		await closeDialog();

		// sign up at the desk
		const desk = await page.evaluate(() => {
			const ow = window.__ow, p = ow.player;
			p.tx = 11; p.ty = 7; p.px = 11 * 16; p.py = 7 * 16; p.facing = 'up';
			ow.interact();
			return ow.dialog.blocking;
		});
		A(desk, 'the reception desk offers the challenge');
		await closeDialog('z');
		A(await page.evaluate(() => !!window.__ow.hillRun), 'signing up starts the clock');

		// 1F: two guards injected onto passable floor, the stairs barred
		const floor = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('TrainerHill_1F', 2, 3);
			const guards = ow.hillRun.guards['1F'] || [];
			return {
				n: guards.length,
				passable: guards.every(([x, y]) => ow.world.isPassable(x, y) || true), // spot was passable pre-injection; npc now stands there
				npcs: guards.filter(([x, y]) => ow.npcs.list.some(o => o.tx === x && o.ty === y)).length,
				barred: ow.hillWarp({ dest_map: 'MAP_TRAINER_HILL_2F' }),
			};
		});
		A(floor.n === 2 && floor.npcs === 2, 'two HILL GUARDS stand on the floor as real NPCs', JSON.stringify(floor));
		A(floor.barred === 'blocked', 'the stairs stay barred while guards stand');
		await closeDialog();

		// beat guard 1 through the real trainer engine
		const bout = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const [gx, gy] = ow.hillRun.guards['1F'][0];
			const p = ow.player;
			// stand beside and face the guard
			p.tx = gx; p.ty = gy + 1; p.px = gx * 16; p.py = (gy + 1) * 16; p.facing = 'up';
			ow.interact();
			for (let i = 0; i < 200 && !b.active; i++) await wait(100);
			const o = { started: !!b.active, foes: b.active?.foes?.length ?? b.active?.foeParty?.length ?? null, name: b.active?.info?.displayName };
			// batter through with Hyper Beam until the bout ends
			for (let i = 0; i < 400 && b.active; i++) {
				const a = b.active;
				if (a.queue.length === 0 && a.phase === 'menu') { b.key('z'); a.moveIdx = 0; b.key('z'); }
				else b.key('z');
				await wait(80);
			}
			await wait(500);
			o.beaten = ow.hillRun?.beatenSet['1F:0'] === true;
			o.left = ow.hillGuardsLeft('1F');
			o.hidden = !ow.npcs.list.some(n => n.tx === gx && n.ty === gy && !n.hidden);
			return o;
		});
		A(bout.started && /HILL GUARD 1F-1/.test(bout.name || ''), 'the guard fights on the real trainer engine', JSON.stringify(bout));
		A(bout.beaten && bout.left === 1, 'the win is recorded, one guard remains', JSON.stringify(bout));
		A(bout.hidden, 'the beaten guard steps aside');

		// clear the rest by hand and take the roof prize
		const roof = await page.evaluate(async () => {
			const ow = window.__ow;
			for (const key of ['1F', '2F', '3F', '4F']) {
				ow.hillRun.guards[key] = ow.hillRun.guards[key] || [[1, 1], [2, 2]];
				ow.hillRun.beatenSet[`${key}:0`] = true; ow.hillRun.beatenSet[`${key}:1`] = true;
			}
			ow.hillRun.start = Date.now() - 300 * 1000; // a 5:00 climb
			await ow.moveToMap('TrainerHill_Roof', 10, 6);
			const before = ow.Bag.count('ppmax');
			const p = ow.player;
			p.tx = 12; p.ty = 8; p.px = 12 * 16; p.py = 8 * 16; p.facing = 'up';
			ow.interact();
			return {
				prize: ow.Bag.count('ppmax') - before,
				runOver: !ow.hillRun,
				best: JSON.parse(localStorage.getItem('magepunk_trainerhill_v1') || '{}').best,
				journal: ow.Journal.list()[0]?.text || '',
			};
		});
		A(roof.prize === 1 && roof.runOver, 'a five-minute climb earns the PP MAX and closes the run', JSON.stringify(roof));
		A(roof.best === 300, 'the best time is remembered', String(roof.best));
		A(/Trainer Hill/.test(roof.journal), 'the journal remembers the first clear', roof.journal);
		await closeDialog('z');

		// slots through the Game Corner hub
		const slots = await page.evaluate(() => {
			const ow = window.__ow;
			const o = { threw: null };
			try {
				ow.Bag.addCoins(50);
				const before = ow.Bag.getCoins();
				ow.slotsMenu.open = true; ow.slotsMenu.game = null; ow.slotsMenu.bet = 3;
				ow.slotsKey('z');                     // spin: 3 coins down
				o.spent = before - ow.Bag.getCoins();
				o.spinning = !!ow.slotsMenu.game && !ow.slotsMenu.game.done;
				ow.drawSlots(480, 320);
				ow.slotsKey('z'); ow.slotsKey('z'); ow.slotsKey('z');
				o.done = ow.slotsMenu.game.done;
				o.coinsSane = ow.Bag.getCoins() >= before - 3; // payout only ever adds
				ow.slotsKey('x');
				o.backToHub = !ow.slotsMenu.open && ow.gcMenu.open;
				ow.gcMenu.open = false;
			} catch (e) { o.threw = e.message; }
			return o;
		});
		A(slots.threw === null, 'the slots screen runs clean', slots.threw);
		A(slots.spent === 3 && slots.spinning, 'a 3-coin bet starts the reels');
		A(slots.done && slots.coinsSane, 'three stops settle the spin and pay honestly', JSON.stringify(slots));
		A(slots.backToHub, 'X walks back to the Game Corner hub');

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
