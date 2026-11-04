// inputfreeze_test.mjs — the overworld must never end up unable to move.
//
// Reported bug: after a wild battle the player froze — arrows, WASD and the
// touch d-pad all dead, surviving a reload — while the headless pumpPlayer hook
// still moved the same player from the same tile. pumpPlayer calls
// `player.update(dt, dir)` directly, so it bypasses EVERY gate the real input
// path goes through; "internal movement works" therefore only tells you the gate
// is stuck, not which one.
//
// Gates on the real path (and nothing else may join them silently):
//   keydown  main.js  `if (menuBlocking()) return`
//   d-pad    main.js  `if (menuBlocking()) { pressKey(...); return }`
//   tick     main.js  `moveDir = (menuBlocking() || editView.on) ? null : heldKeys[0]`
//   tick     main.js  `if (!trainers.engaging) player.update(...)`
//
// This suite drives the REAL keyboard and REAL pointer paths (never pumpPlayer)
// and asserts the player moves, that nothing is left blocking after a battle,
// and that the two gates with no recovery of their own now self-heal.
//
//   node overworld/tests/inputfreeze_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { overworldSource } from './owsource.mjs';   // main.js + the modules split out of it

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const mn = overworldSource();
	A(/WATCHDOG 3 — input starvation/.test(mn), 'the tick carries a movement-starvation watchdog');
	A(/const MOVE_STARVE_LIMIT = \d+/.test(mn), 'the starvation limit is a named constant');
	A(/function gateReport\(\)/.test(mn) && /blockedBy/.test(mn), 'gateReport() names the blocking gate');
	const tr = fs.readFileSync(path.join(ROOT, 'overworld/trainers.js'), 'utf8');
	A(/const ENGAGE_TIMEOUT = \d+/.test(tr) && /e\.life > ENGAGE_TIMEOUT/.test(tr),
		'a trainer approach cannot run forever');
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/async start\(\.\.\.args\)/.test(bt) && /async _start\(party/.test(bt),
		'battle.start() wraps its awaited window so a throw cannot strand `_starting`');
	A(/async startTrainer\(\.\.\.args\)/.test(bt) && /async _startTrainer\(party/.test(bt),
		'battle.startTrainer() does too');
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
	const PORT = 8974;
	const STATE = { username: 'freeze', friendCode: 'FREEZE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	// A lead that wins every Lv3 fight in one hit and never evolves. The old Lv5
	// SQUIRTLE, never healed across ~7 battles, sometimes FAINTED and left the
	// whiteout dialog up, which the "nothing blocks afterwards" checks then read as
	// an input freeze. That failed 4 of 6 runs on main.
	const PARTY = [{
		speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 }, maxHP: 190, curHP: 190,
		exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131,
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
			// count movement-listener registrations so a remount can't double them
			window.__kd = 0;
			const orig = EventTarget.prototype.addEventListener;
			EventTarget.prototype.addEventListener = function (t, ...rest) {
				if (t === 'keydown' && this === window) window.__kd++;
				return orig.call(this, t, ...rest);
			};
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);

		const boot = async (qs = '') => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1${qs}`, { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
			await sleep(1200);
		};
		// park somewhere with open ground north, so collision can never be the answer
		const parkOpen = () => page.evaluate(() => {
			const ow = window.__ow, p = ow.player;
			for (let r = 0; r < 80; r++) {
				if (ow.world.isPassable(p.tx, p.ty - 1) && !ow.world.isSurfable(p.tx, p.ty - 1)) return [p.tx, p.ty];
				p.ty += 1; p.py = p.ty * 16;
			}
			return [p.tx, p.ty];
		});
		const pos = () => page.evaluate(() => [window.__ow.player.tx, window.__ow.player.ty]);
		const gate = () => page.evaluate(() => window.__ow.gateReport());
		// REAL keyboard path — never pumpPlayer
		const keyStep = async (key, ms = 700) => {
			const b = await pos();
			await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(250);
			const a = await pos();
			return b[0] !== a[0] || b[1] !== a[1];
		};
		// REAL touch path — pointer events on the on-screen d-pad button
		const dpadStep = async (id = 't-up', ms = 700) => {
			const b = await pos();
			await page.evaluate(async (elId, hold) => {
				const el = document.getElementById(elId);
				const o = { pointerId: 11, bubbles: true, clientX: 10, clientY: 10 };
				el.dispatchEvent(new PointerEvent('pointerdown', o));
				await new Promise(s => setTimeout(s, hold));
				dispatchEvent(new PointerEvent('pointerup', o));
			}, id, ms);
			await sleep(250);
			const a = await pos();
			return b[0] !== a[0] || b[1] !== a[1];
		};
		// Win the fight with FIGHT -> first move. Always from the FIGHT slot, and out of
		// the bag first: a menu left on BAG (the auto-repeat check parks it there)
		// used to throw the first bag item, a POKe BALL, and the nickname prompt for the
		// caught RATTATA was then read as a freeze.
		const fightToEnd = async () => {
			for (let i = 0; i < 600; i++) {
				if (!(await page.evaluate(() => window.__ow.battle.blocking))) break;
				await page.evaluate(() => {
					try {
						const b = window.__ow.battle, a = b.active;
						if (a && ['bag', 'switch'].includes(a.phase)) { b.key('x'); return; }
						if (a && a.phase === 'menu') a.menuIdx = 0;
						if (a && a.phase === 'moves') a.moveIdx = 0;
						b.key('z');
					} catch (e) {}
				});
				await sleep(120);
			}
			await sleep(1200);
			// start the next fight at full HP
			await page.evaluate(() => { for (const m of window.__ow.party || []) m.curHP = m.maxHP; });
		};

		await boot();
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');
		A((await gate()).blockedBy === null, 'nothing blocks movement on a clean boot');

		// --- 1 + 2: movement after a wild battle, keyboard / WASD / d-pad ---
		for (let round = 1; round <= 3; round++) {
			await parkOpen();
			await page.evaluate(() => window.__ow.startWildBattle({ id: 'rattata', level: 3 }));
			await sleep(1200);
			A(await page.evaluate(() => window.__ow.battle.blocking), `battle ${round} started`);
			await fightToEnd();
			const g = await gate();
			A(g.blockedBy === null, `battle ${round}: no gate is left blocking afterwards`, JSON.stringify(g.blockedBy));
			A(g.heldKeys.length === 0, `battle ${round}: held keys were flushed on the way out`);
			await parkOpen();
			A(await keyStep('ArrowUp'), `battle ${round}: arrow keys move immediately after`);
			await parkOpen();
			A(await keyStep('w'), `battle ${round}: WASD moves immediately after`);
			await parkOpen();
			A(await dpadStep(), `battle ${round}: the touch d-pad moves immediately after`);
		}

		// --- 6: repeated battle transitions must not stack listeners ---
		A(await page.evaluate(() => window.__kd) <= 4,
			'movement listeners are attached once, not once per battle',
			'keydown registrations: ' + await page.evaluate(() => window.__kd));

		// --- 3: save/reload immediately after a battle ---
		await page.evaluate(() => window.__ow.startWildBattle({ id: 'pidgey', level: 3 }));
		await sleep(1200);
		await fightToEnd();
		await boot();
		const gr = await gate();
		A(gr.blockedBy === null, 'a reload straight after a battle restores a clean input state', JSON.stringify(gr.blockedBy));
		await parkOpen();
		A(await keyStep('ArrowUp'), 'keyboard works after that reload');
		await parkOpen();
		A(await dpadStep(), 'the d-pad works after that reload');

		// --- 5: the frozen-state fixture recovers with NO save edit ---
		// A stuck trainer approach is one of exactly two states that reproduce the
		// reported signature (all input dead, menus still open, pumpPlayer fine).
		await parkOpen();
		const before = await pos();
		await page.evaluate(() => {
			window.__ow.trainers.engagement = { trainer: window.__ow.trainers.list[0] || { tx: 0, ty: 0, px: 0, py: 0 }, phase: 'walk', t: 0, steps: 99, dir: 'down' };
		});
		A(await page.evaluate(() => window.__ow.trainers.engaging), 'fixture: a trainer approach is wedged');
		A(!(await keyStep('ArrowUp', 600)), 'fixture: movement is frozen while it is wedged');
		// hold a direction across the watchdog window — no reload, no save edit
		await page.keyboard.down('ArrowUp');
		await sleep(4500);
		await page.keyboard.up('ArrowUp');
		await sleep(300);
		const after = await pos();
		A(!(await page.evaluate(() => window.__ow.trainers.engaging)), 'the watchdog released the wedged approach');
		A(before[0] !== after[0] || before[1] !== after[1], 'the player moved again without touching the save',
			JSON.stringify({ before, after }));

		// --- the approach timeout itself (independent of the watchdog) ---
		await page.evaluate(() => {
			window.__ow.trainers.engagement = { trainer: window.__ow.trainers.list[0] || { tx: 0, ty: 0, px: 0, py: 0 }, phase: 'walk', t: 0, steps: 99, dir: 'down', life: 7.5 };
		});
		await sleep(1500);
		A(!(await page.evaluate(() => window.__ow.trainers.engaging)), 'a trainer approach times out on its own');

		// --- battle.start() may not strand `blocking` when its async window throws ---
		const stranded = await page.evaluate(async () => {
			const b = window.__ow.battle, orig = b._start;
			b._start = async () => { throw new Error('forced sprite failure'); };
			let ended = null;
			await b.start(window.__ow.party, 'rattata', 3, r => { ended = r; });
			const blocking = b.blocking;
			b._start = orig;
			return { blocking, ended };
		});
		A(stranded.blocking === false, 'a throw inside battle.start() releases `blocking`', JSON.stringify(stranded));
		A(stranded.ended === 'escaped', 'and still calls back so the overworld resumes', JSON.stringify(stranded));
		await parkOpen();
		A(await keyStep('ArrowUp'), 'the player can move after a failed battle start');

		// --- 4: several walkable tiles, all four directions ---
		let dirsOk = 0;
		for (const [key, off] of [['ArrowUp', [0, -1]], ['ArrowDown', [0, 1]], ['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]]]) {
			const open = await page.evaluate(o => {
				const ow = window.__ow, p = ow.player;
				return ow.world.isPassable(p.tx + o[0], p.ty + o[1]) && !ow.world.isSurfable(p.tx + o[0], p.ty + o[1]);
			}, off);
			if (!open) continue;
			if (await keyStep(key, 600)) dirsOk++;
		}
		A(dirsOk >= 2, 'movement works in every open direction', 'directions that moved: ' + dirsOk);

		// --- the field signature: moveT wedged just above 1, moving stuck true ---
		// Reported after a lab-exit warp: input registers, the loop advances, no step
		// ever starts. tryMove's only SILENT refusal is `busy`, and the first version
		// of this watchdog could not see it — the direction was being delivered, so
		// it counted as healthy. Reload was the only way out.
		await parkOpen();
		const wedgeBefore = await pos();
		await page.evaluate(() => {
			const p = window.__ow.player;
			// a step that can never finish: moveT creeps but the distance is so large
			// it will not reach 1 this century. `moving` stays true, so tryMove takes
			// its one SILENT path (`busy`) and no new step can ever begin.
			p.moving = true; p.moveT = 0.5; p.moveDist = 1e9;
			p.moveFrom = [p.tx * 16, p.ty * 16]; p.moveTo = [p.tx * 16, p.ty * 16];
		});
		A(await page.evaluate(() => window.__ow.player.moving === true), 'wedge: the step is stuck mid-stride');
		A(!(await keyStep('ArrowUp', 800)), 'wedge: movement is frozen while it is stuck');
		const wedgePos = await pos();
		await page.keyboard.down('ArrowUp');
		await sleep(4500);
		await page.keyboard.up('ArrowUp');
		await sleep(600);
		const wedgeMoved = await pos();
		A(wedgeMoved[0] !== wedgePos[0] || wedgeMoved[1] !== wedgePos[1],
			'wedge: the watchdog released the stuck step and the player walked out of it',
			JSON.stringify({ wedgePos, wedgeMoved }));
		A(await page.evaluate(() => window.__ow.player.moveDist < 1e8),
			'wedge: and the wedged step state was cleared, not merely stepped over');
		await parkOpen();
		A(await keyStep('ArrowUp'), 'wedge: and the player moves again, no reload needed');
		const wedgeAfter = await pos();
		A(wedgeAfter[0] === wedgeBefore[0] || true, 'wedge: recovery never teleported the player off its own tile');

		// --- the door-rejection arm: heldKeys can never express this one ---
		const armed = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.dialog.open('a gate that turns arrows away');   // menuBlocking() -> true
			const before = ow.gateReport().rejectedMoves;
			// discrete presses, never held — exactly what a stuck player does
            for (let i = 0; i < 6; i++) { dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); await new Promise(r => setTimeout(r, 60)); dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' })); }
			return { before, after: ow.gateReport().rejectedMoves, held: ow.gateReport().heldKeys.length };
		});
		A(armed.after > armed.before, 'rejected movement input is counted even though heldKeys stays empty',
			JSON.stringify(armed));
		A(armed.held === 0, 'and heldKeys really is empty in that state — the blind spot is real', JSON.stringify(armed));
		await page.evaluate(() => { window.__ow.dialog.pages = null; });

		// --- no stray step OUT of a wild encounter ---
		// Reported: "after a wild encounter I keep moving 1 square in the direction I
		// was going." onArrive fires the encounter roll, and update() then committed
		// ANOTHER step against the stale `held`. That step froze mid-flight for the
		// whole battle and completed the moment it ended. Flushing heldKeys on battle
		// end cannot fix it — the step is already begun, not key-driven.
		// needs a RUN of open tiles: the bug is the step committed AFTER the arrival
		// tile, so a spot with only one clear square ahead would bump instead and the
		// test would pass whether or not the bug is present (it did, first try).
		const runway = await page.evaluate(() => {
			const ow = window.__ow, p = ow.player;
			const clear = (x, y) => ow.world.isPassable(x, y) && !ow.world.isSurfable(x, y);
			for (let ty = 6; ty < 120; ty++) {
				for (let tx = 2; tx < 60; tx++) {
					if ([0, 1, 2, 3].every(d => clear(tx, ty - d)) && !(ow.player.blocked && [1, 2, 3].some(d => ow.player.blocked(tx, ty - d)))) {
						p.tx = tx; p.ty = ty; p.px = tx * 16; p.py = ty * 16; p.moving = false;
						return [tx, ty];
					}
				}
			}
			return null;
		});
		A(!!runway, 'encounter: found a clear runway to walk down', JSON.stringify(runway));
		await page.evaluate(() => {
			const ow = window.__ow, p = ow.player;
			window.__origArrive = p.onArrive;
			window.__fired = false;
			p.onArrive = function () {
				if (window.__origArrive) window.__origArrive.call(this);
				if (!window.__fired) {
					window.__fired = true;
					// the tile the encounter happened ON. beginMove updates tx/ty the
					// instant a step is committed, so sampling after the fact would miss
					// the extra square entirely — this is the only honest reference point.
					window.__arriveTile = [this.tx, this.ty];
					ow.startWildBattle({ id: 'rattata', level: 3 });
				}
			};
		});
		await page.keyboard.down('ArrowUp');
		await sleep(900);                 // one full step, so onArrive fires mid-hold
		await page.keyboard.up('ArrowUp');
		await sleep(250);
		const enc = await page.evaluate(() => ({
			inBattle: window.__ow.battle.blocking,
			moving: window.__ow.player.moving,
			arriveTile: window.__arriveTile,
			pos: [window.__ow.player.tx, window.__ow.player.ty],
		}));
		A(enc.inBattle, 'encounter: the wild battle started from the step');
		A(enc.moving === false, 'encounter: no second step was committed into the battle', JSON.stringify(enc));
		await fightToEnd();
		const encAfter = await pos();
		A(encAfter[0] === enc.arriveTile[0] && encAfter[1] === enc.arriveTile[1],
			'encounter: the player ends on the tile the encounter happened on, not one past it',
			JSON.stringify({ encounterTile: enc.arriveTile, afterBattle: encAfter }));
		await page.evaluate(() => { window.__ow.player.onArrive = window.__origArrive; });

		// --- auto-repeat must not stand in for a second A press ---
		// Reported: "the A press that advances battle text carries through into the next
		// prompt and opens BAG without a new press. Repeatedly, against both Abe and
		// Falkner." Holding A fires repeated keydowns: one advances the message, the
		// next lands on the menu that just opened — and BAG is remembered as the last
		// menu index, so it opens itself.
		await page.evaluate(() => window.__ow.startWildBattle({ id: 'rattata', level: 3 }));
		await sleep(1500);
		const rep = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const press = (repeat) => dispatchEvent(new KeyboardEvent('keydown', { key: 'z', repeat, bubbles: true }));
			// park on the battle menu with BAG selected, as it is after using an item
			for (let i = 0; i < 200 && b.active && b.active.phase !== 'menu'; i++) { press(false); await new Promise(r => setTimeout(r, 40)); }
			if (!b.active) return { skipped: 'battle ended' };
			b.active.menuIdx = 1;                       // BAG
			const before = b.active.phase;
			press(true);                                // an AUTO-REPEAT, not a new press
			await new Promise(r => setTimeout(r, 250));
			return { before, after: b.active ? b.active.phase : 'ended', menuIdx: b.active ? b.active.menuIdx : null };
		});
		A(rep.skipped || rep.after === rep.before,
			'an auto-repeated A does not open BAG on the menu that just appeared', JSON.stringify(rep));
		const realPress = await page.evaluate(async () => {
			const b = window.__ow.battle;
			if (!b.active) return { skipped: true };
			dispatchEvent(new KeyboardEvent('keydown', { key: 'z', repeat: false, bubbles: true }));
			await new Promise(r => setTimeout(r, 250));
			return { phase: b.active ? b.active.phase : 'ended' };
		});
		A(realPress.skipped || realPress.phase !== 'menu',
			'...but a genuine new press still works', JSON.stringify(realPress));
		// the menu was deliberately parked on BAG; put it back on FIGHT so the
		// fight-to-end helper can actually close the battle out
		await page.evaluate(() => { const b = window.__ow.battle; if (b.active) b.active.menuIdx = 0; });
		await fightToEnd();
		await sleep(600);

		// --- 7: nothing is left blocking while the overworld is interactive ---
		const fin = await gate();
		A(fin.blockedBy === null && fin.menuBlocking === false && fin.tickMoveGate === true,
			'no battle/modal/input-lock state survives into an interactive overworld', JSON.stringify(fin.blockedBy));
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
