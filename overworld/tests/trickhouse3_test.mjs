// trickhouse3_test.mjs — scripted tile edits honour symbolic TRUE/FALSE.
//
// Playtest (instinctloretest0918, 2026-09-30), Trick House puzzle 3: stepping
// on the (8,2) button made all four buttons impassable, the player bumped at
// (8,3), and no route reached the scroll. The decomp scripts write
// `setmetatile ... impassable: 'FALSE'` (502 ops across the maps; 455 more say
// 'TRUE'), and world.setMetatile read it by truthiness: the STRING "FALSE" is
// truthy, so every FALSE op walled its tile off (buttons, open doors). The
// engine now parses script booleans (scriptBool): TRUE/1 block, FALSE/0 open,
// null keeps the tile's collision.
//
// Replayed with real key input: the button press, every door and button tile
// against the script that set it, stepping back onto the button, the route to
// the scroll, reading it, the Trick Master's HARD STONE, and the save push
// (defeated trainers intact).
//
//   node overworld/tests/trickhouse3_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9174;
const STATE = { username: 'trick', friendCode: 'TRICK0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'mudkip', name: 'MUDKIP', level: 40, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's258.png', num: 258,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// mock backend: the real ow-save/ow-load shape, so the save sync can be checked
let lastPush = null;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') { lastPush = b.ow; return res.end(JSON.stringify({ ok: true })); }
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	const warns = [], allWarn = []; page.on('console', m => { if (/setmetatile|not a boolean/.test(m.text())) warns.push(m.text()); if (m.type() === 'warning' || m.type() === 'error') allWarn.push(m.text().slice(0, 200)); });
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_SYS_POKEMON_GET: true },
			vars: { VAR_TRICK_HOUSE_LEVEL: 2, VAR_TRICK_HOUSE_PUZZLE_3_STATE: 0 } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		// the port's own Trick House progress (ow_venues.js): puzzles 1 and 2 cleared
		localStorage.setItem('magepunk_trickhouse_v1', JSON.stringify({ stage: 2, scroll: false }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route110_TrickHousePuzzle3&x=8&y=3`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === 'Route110_TrickHousePuzzle3')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);

	// the three puzzle trainers count as beaten, the way trainers.js records it
	const defeated = await page.evaluate(() => {
		const tr = window.__ow.trainers;
		for (const t of tr.list) tr.defeated.add(tr.keyOf(t));
		const keys = [...tr.defeated, 'MAP_ROUTE_110:SOMEONE_EARLIER'];
		localStorage.setItem('magepunk_defeated_v1', JSON.stringify(keys));
		for (const k of keys) tr.defeated.add(k);
		return keys;
	});
	A(defeated.length >= 4, 'setup: the puzzle trainers (and an earlier one) are recorded as beaten', JSON.stringify(defeated));

	// ===== the parser and setMetatile, directly =====
	const unit = await page.evaluate(async () => {
		const E = await import('./engine.js');
		const w = window.__ow.world, row = w.current.layout.map;
		const x = 0, y = 0, prev = row[y][x], MASK = 0x0C00, id = prev & 0x3FF;
		const out = {
			parse: [E.scriptBool('TRUE'), E.scriptBool('FALSE'), E.scriptBool(' false '), E.scriptBool(1), E.scriptBool(0), E.scriptBool(true), E.scriptBool(false), E.scriptBool(null), E.scriptBool(undefined)],
		};
		w.setMetatile(x, y, id, 'FALSE'); out.falseOpen = (row[y][x] & MASK) === 0;
		w.setMetatile(x, y, id, 'TRUE'); out.trueBlocks = (row[y][x] & MASK) === MASK;
		w.setMetatile(x, y, id, null); out.nullKeepsBlocked = (row[y][x] & MASK) === MASK;
		w.setMetatile(x, y, id, 0); out.zeroOpen = (row[y][x] & MASK) === 0;
		w.setMetatile(x, y, id, undefined); out.undefinedKeepsOpen = (row[y][x] & MASK) === 0;
		w.setMetatile(x, y, id, 1); out.oneBlocks = (row[y][x] & MASK) === MASK;
		row[y][x] = prev;
		return out;
	});
	A(JSON.stringify(unit.parse) === JSON.stringify([true, false, false, true, false, true, false, null, null]), 'scriptBool: TRUE/1/true block, FALSE/0/false open, null/undefined = not given', JSON.stringify(unit.parse));
	A(unit.falseOpen && unit.zeroOpen, 'setMetatile: FALSE and 0 CLEAR the collision bits');
	A(unit.trueBlocks && unit.oneBlocks, 'setMetatile: TRUE and 1 set them');
	A(unit.nullKeepsBlocked && unit.undefinedKeepsOpen, 'setMetatile: null/undefined keep whatever collision the tile had');

	// ===== the puzzle, with real key input =====
	const BUTTONS = [[4, 14], [3, 11], [12, 5], [8, 2]];
	const pos = () => page.evaluate(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty, out: window.__ow.player.moveOutcome }));
	const idle = () => page.evaluate(() => { const ow = window.__ow; return !ow.player.moving && !ow.cutscene.blocking && !ow.dialog.blocking; });
	const settle = async () => { for (let i = 0; i < 60; i++) { if (await idle()) return; await page.evaluate(() => { if (window.__ow.dialog.blocking) window.__ow.dialog.key('z'); }); await sleep(100); } };
	// hold until the step STARTS (or is refused), then let it finish: a fixed 260ms
	// hold on a slow run released before the step began and read (8,3) mid-walk
	const step = async dir => {
		const from = await pos();
		await page.keyboard.down(dir);
		for (let i = 0; i < 40; i++) { await sleep(25); const p = await pos(); if (p.x !== from.x || p.y !== from.y || p.out === 'bump' || await page.evaluate(() => window.__ow.player.moving)) break; }
		await page.keyboard.up(dir);
		for (let i = 0; i < 80 && await page.evaluate(() => window.__ow.player.moving); i++) await sleep(25);
		await sleep(150); await settle();
	};
	// every tile a door/button script edits must carry the collision THAT script
	// asked for, whenever the tile currently shows that script's metatile
	const audit = () => page.evaluate(async () => {
		const [{ metatileId }, E, scripts] = await Promise.all([import('./metatile_labels.js'), import('./engine.js'), fetch('data/scripts/Route110_TrickHousePuzzle3.json').then(r => r.json())]);
		const row = window.__ow.world.current.layout.map, name = window.__ow.world.current.name;
		const bad = [];
		let checked = 0;
		for (const [label, ops] of Object.entries(scripts)) {
			if (!Array.isArray(ops)) continue;
			for (const op of ops) {
				if (op.op !== 'setmetatile') continue;
				const id = metatileId(op.tile, name), cur = row[op.y][op.x];
				if ((cur & 0x3FF) !== id) continue;
				checked++;
				const want = E.scriptBool(op.impassable);
				if (want !== null && ((cur & 0x0C00) !== 0) !== want) bad.push(`${label.replace(/^.*EventScript_/, '')} (${op.x},${op.y}) ${op.tile} wants ${op.impassable}`);
			}
		}
		return { checked, bad };
	});
	const a0 = await audit();
	A(a0.checked >= 8 && a0.bad.length === 0, 'on entry, every door and button tile carries the collision its script set', JSON.stringify(a0));
	const before = await page.evaluate(b => b.map(([x, y]) => window.__ow.world.isPassable(x, y)), BUTTONS);
	A(before.every(Boolean), 'before any press, all four buttons are passable', JSON.stringify(before));
	A((await pos()).y === 3, 'setup: standing at (8,3) below the (8,2) button', JSON.stringify(await pos()));
	await step('ArrowUp');
	const p1 = await pos();
	const vars = await page.evaluate(() => ({ t4: window.__ow.Story.getVar('VAR_TEMP_4'), t8: window.__ow.Story.getVar('VAR_TEMP_8') }));
	A(p1.x === 8 && p1.y === 2 && vars.t4 === 1 && vars.t8 === 4, 'walking up onto the (8,2) button presses it (its coord event ran)', JSON.stringify({ p1, vars }));
	const after = await page.evaluate(b => b.map(([x, y]) => window.__ow.world.isPassable(x, y)), BUTTONS);
	A(after.every(Boolean), 'after the press, all four buttons are STILL passable (they became walls)', JSON.stringify(after));
	const a1 = await audit();
	A(a1.checked >= 8 && a1.bad.length === 0, 'every door and button tile carries the collision its script set (FALSE = open)', JSON.stringify(a1));
	await step('ArrowDown');
	await step('ArrowUp');
	const p2 = await pos();
	A(p2.x === 8 && p2.y === 2 && p2.out !== 'bump', 'stepping down and back up onto the pressed button works (it used to bump at (8,3))', JSON.stringify(p2));

	// the scroll: its reachable neighbour (1,14), by the game's own passability
	const route = await page.evaluate(() => {
		const w = window.__ow.world, p = window.__ow.player, lay = w.current.layout;
		const seen = new Set([p.tx + ',' + p.ty]), q = [[p.tx, p.ty]];
		while (q.length) {
			const [x, y] = q.shift();
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
				if (nx < 0 || ny < 0 || nx >= lay.width || ny >= lay.height || seen.has(k) || !w.isPassable(nx, ny)) continue;
				seen.add(k); q.push([nx, ny]);
			}
		}
		return { scroll: seen.has('1,14'), buttons: [[4, 14], [3, 11], [12, 5]].map(([x, y]) => seen.has(x + ',' + y)) };
	});
	A(route.scroll, 'with the button pressed, a route leads from the button to the scroll (1,14)', JSON.stringify(route));
	// read the scroll the way a player does: stand at (1,14), face it, press Z
	await page.evaluate(() => { const ow = window.__ow; ow.player.tx = 1; ow.player.ty = 14; ow.player.x = 16; ow.player.y = 14 * 16; ow.player.facing = 'left'; });
	await page.evaluate(() => window.__ow.interact());
	await sleep(300); await settle();
	const th1 = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_trickhouse_v1')));
	A(th1.scroll === true, 'reading the sign finds the TRICK HOUSE SCROLL', JSON.stringify(th1));

	// the Trick Master's reward, in the End room
	await page.evaluate(() => window.__ow.moveToMap('Route110_TrickHouseEnd', 4, 6)); await sleep(1500); await settle();
	const stones0 = await page.evaluate(() => window.__ow.Bag.count('hardstone'));
	const tm = await page.evaluate(() => { const ow = window.__ow; ow.player.tx = 4; ow.player.ty = 6; ow.player.x = 4 * 16; ow.player.y = 6 * 16; ow.player.facing = 'up';
		const pre = { map: ow.world.current.name, mapId: ow.world.current.map.id, dlg: ow.dialog.blocking, cut: ow.cutscene.blocking, moving: ow.player.moving, npcs: ow.npcs.list.map(n => [n.ev?.graphics_id, n.tx, n.ty]) };
		ow.interact(); return { pre, dlg: ow.dialog.blocking ? JSON.stringify(ow.dialog.pages).slice(0, 200) : null, cut: ow.cutscene.blocking }; });
	await sleep(300);
	for (let i = 0; i < 80 && !(await idle()); i++) { await page.evaluate(() => { const ow = window.__ow; if (ow.dialog.blocking) ow.dialog.key('z'); }); await sleep(120); }
	const reward = await page.evaluate(() => ({ stones: window.__ow.Bag.count('hardstone'), th: JSON.parse(localStorage.getItem('magepunk_trickhouse_v1')) }));
	A(reward.stones === stones0 + 1 && reward.th.stage === 3 && reward.th.scroll === false, 'the Trick Master hands over the HARD STONE and the house moves on to puzzle 4', JSON.stringify({ stones0, ...reward }));
	A(!/NUGGET/.test(tm.dlg || '') && await page.evaluate(() => window.__ow.Bag.count('nugget')) === 0, 'Z on the Trick Master talks to HIM, not the NUGGET hidden under his tile', JSON.stringify(tm.dlg));

	// the save: pushed to the server, defeated trainers intact
	await page.evaluate(() => window.__ow.pushOwForTest());
	await sleep(800);
	const localDefeated = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_defeated_v1') || '[]'));
	const pushedDefeated = lastPush ? JSON.parse(lastPush.magepunk_defeated_v1 || '[]') : null;
	A(defeated.every(k => localDefeated.includes(k)), 'every previously defeated trainer key is still in the save', JSON.stringify(defeated.filter(k => !localDefeated.includes(k))));
	A(pushedDefeated && defeated.every(k => pushedDefeated.includes(k)) && lastPush.magepunk_bag_v1 && /hardstone/.test(lastPush.magepunk_bag_v1), 'the server push carries them, and the HARD STONE', JSON.stringify({ pushed: !!lastPush }));
	A(!warns.some(w => /not a boolean|unknown tile/.test(w)), 'no setmetatile warnings', JSON.stringify(warns.slice(0, 3)));
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
