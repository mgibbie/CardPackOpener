// poketactica_mm_page_test.mjs — MYSTERY MAZE on the page (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 7): the board
// drawn from what is explored, the bar (floor, belly, purse, bag, party), the minimap, stepping (two arrows: a diagonal),
// turning on the spot, the Attack, the moves menu and aiming, the bag, the field menu, the stairs, a figurine lost for
// good, giving up; by keyboard, controller and touch, on a desktop and a phone. And the camp's screens (stage 8): the
// dungeon list, the party, packing from the storage and stars to carry, and what a cleared dungeon pays. And (stage 9)
// the camp's Mystery Maze entry, a run resumed after a reload, a replay watched, a friend's live run followed.
//   node overworld/tests/poketactica_mm_page_test.mjs [--shots=<dir>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8969;
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').split('=')[1] || null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const mk = (sp, lv, moves) => ({ v: 1, id: sp + '-mmp', species: sp, level: lv, exp: 0, ability: null, shiny: false, pool: moves.map((id) => ({ id, lv: 1, xp: 0 })), equipped: moves });
const FIGS = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries([mk('pikachu', 40, ['thunderbolt', 'quickattack']), mk('squirtle', 40, ['watergun']), mk('machamp', 40, ['karatechop'])].map((f) => [f.id, f])) });
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument((figs) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_mmcoach_v1', 'done'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* storage */ }
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
			window.__owFakePads = [pad]; window.__pad = pad;
		}, FIGS);
		await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now(); while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
		await sleep(500);
		const t = { page, errors };
		t.key = async (k, ms = 260) => { await page.keyboard.press(k); await sleep(ms); };
		t.pad = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(260); };
		t.E = (fn, ...a) => page.evaluate(fn, ...a);
		t.start = (seed, ids = ['pikachu-mmp', 'squirtle-mmp', 'machamp-mmp']) => t.E((seed, ids) => { const T = window.__poketactica; return T.startMm('whisper-woods', ids.map((id) => T.P.col.figs[id]), { seed }); }, seed, ids);
		/** The run as the test reads it. */
		t.v = () => t.E(() => { const T = window.__poketactica, M = T.mm.M, S = M.S, L = S.units.find((u) => u.uid === S.leader); return { screen: T.P.screen, mode: T.P.mode, floor: S.floorNo, turns: S.turns, x: L.x, y: L.y, dir: L.dir, hp: L.hp, leader: S.leader, belly: S.belly, bag: S.bag.length, over: S.over, party: S.units.filter((u) => u.side === 'p').length, acts: M.acts.length, aim: !!M.aim, turn: M.turn, menu: !!T.P.menu, cursor: T.P.cursor, tiles: T.P.S.map.height.filter((h) => h != null).length, walls: T.P.S.map.height.filter((h) => h === 1).length }; });
		/** A clear square round the leader with nothing wild, no items and no traps, so each key's effect is the only thing that happens. */
		t.plaza = () => t.E(() => { const T = window.__poketactica, M = T.mm.M, S = M.S, L = S.units.find((u) => u.uid === S.leader), W = S.F.w; L.x = Math.max(6, Math.min(W - 7, L.x)); L.y = Math.max(6, Math.min(S.F.h - 7, L.y));
			for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const i = (L.y + dy) * W + L.x + dx; S.F.terrain[i] = 1; S.F.room[i] = 77; S.seen[i] = 1; }
			let k = 0; for (const u of S.units) if (u.side === 'p' && u !== L) { k++; u.x = L.x - 3; u.y = L.y - 4 + k; u.tactic = 'wait'; }
			for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1);
			S.items.length = 0; S.traps.length = 0; S.dungeon = { ...S.dungeon, floors: S.dungeon.floors.map((f) => ({ ...f, wild: [] })) };
			S.B.map = { w: W, h: S.F.h, height: S.F.terrain.map((x) => ((x & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
			M.seenN = -1; T.mm.act({ t: 'face', d: L.dir }); });
		t.menu = () => t.E(() => ({ title: document.getElementById('menu-title').textContent, items: [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), hidden: document.getElementById('menu').hidden }));
		t.menuTo = async (re) => { for (let i = 0; i < 20; i++) { const f = await t.E(() => { const b = document.querySelector('#menu-items .is-focus'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : ''; }); if (re.test(f)) { await t.key('KeyZ', 350); return true; } await t.key('ArrowDown', 90); } return false; };
		t.bar = () => t.E(() => document.getElementById('pt-mm').textContent.replace(/\s+/g, ' '));
		t.shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
		return t;
	};

	// ---------- keyboard + controller, desktop
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.start('pagetest'), 'a run opens in Whisper Woods');
		let v = await t.v();
		const bar = await t.bar();
		A(v.screen === 'mm' && /Whisper Woods · B1F/.test(bar) && /🍎 100/.test(bar) && /🎒 0\/20/.test(bar) && /Pikachu/.test(bar) && /Squirtle/.test(bar) && /Machamp/.test(bar), 'the bar: the dungeon and floor, the belly, the bag, the party\'s HP', bar);
		A(v.tiles > 20 && v.tiles < 900 && v.walls > 8, 'the board is what has been explored: the start room\'s floor with its walls standing, the rest not there', [v.tiles, v.walls]);
		A(await t.E(() => { const c = document.getElementById('mm-map'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 40; }), 'the minimap is drawn');
		A(await t.E(() => getComputedStyle(document.getElementById('b-exec')).display === 'none' && getComputedStyle(document.getElementById('hud-top')).display === 'none'), 'the battle\'s own HUD is out of the way');
		await t.plaza();
		v = await t.v();
		// an arrow: one step
		await t.key('ArrowUp', 400);
		let w = await t.v();
		A(w.turns === v.turns + 1 && Math.abs(w.x - v.x) + Math.abs(w.y - v.y) === 1 && w.cursor.x === w.x && w.cursor.y === w.y, 'an arrow: one step that way, a turn, the cursor and camera with the leader', [v.x, v.y, w.x, w.y]);
		// two arrows together: the diagonal between
		await t.page.keyboard.down('ArrowUp'); await t.page.keyboard.down('ArrowRight'); await sleep(30); await t.page.keyboard.up('ArrowUp'); await t.page.keyboard.up('ArrowRight'); await sleep(450);
		let d = await t.v();
		A(d.turns === w.turns + 1 && Math.abs(d.x - w.x) === 1 && Math.abs(d.y - w.y) === 1 && d.dir % 2 === 1, 'two arrows together: one diagonal step', [w.x, w.y, d.x, d.y, d.dir]);
		// X then a direction: turn on the spot
		await t.key('KeyX', 250);
		A((await t.v()).turn && /Press a direction to turn/.test(await t.E(() => document.getElementById('hint').textContent)), 'X: turn mode, and the hint says so');
		await t.key('ArrowDown', 400);
		let f = await t.v();
		A(f.x === d.x && f.y === d.y && f.turns === d.turns && f.dir !== d.dir && !f.turn, 'then a direction turns the leader without a step or a turn', [d.dir, f.dir]);
		// Z: the Attack
		await t.key('KeyZ', 400);
		A((await t.v()).turns === f.turns + 1, 'Z: the plain Attack (a turn, even at nothing)');
		// C: moves, and aiming
		await t.key('KeyC', 400);
		let m = await t.menu();
		A(!m.hidden && /Pikachu/.test(m.title) && m.items.some((x) => /Thunderbolt/.test(x) && /PP/.test(x) && /SP/.test(x)) && m.items.some((x) => /^Attack/.test(x)), 'C: the moves, with PP and SP, and the Attack', m);
		await t.menuTo(/Thunderbolt/);
		let a = await t.v();
		A(a.aim && a.mode === 'mm-aim' && /Thunderbolt/.test(await t.E(() => document.getElementById('hint').textContent)) && (a.cursor.x !== a.x || a.cursor.y !== a.y), 'picking a move aims it: its reach is lit and the cursor is on a tile to aim at', a.cursor);
		const c0 = a.cursor;
		await t.key('ArrowLeft', 300);
		const c1 = (await t.v()).cursor;
		await t.key('KeyX', 300);
		a = await t.v();
		A((c1.x !== c0.x || c1.y !== c0.y) && !a.aim && a.turns === f.turns + 1, 'arrows move the aim; X backs out and nothing was used');
		await t.key('KeyC', 400); await t.menuTo(/Thunderbolt/); await t.key('KeyZ', 500);
		a = await t.v();
		A(!a.aim && a.turns === f.turns + 2 && /used Thunderbolt/.test(await t.bar()), 'Z uses it: a turn, and the bar says what happened');
		// C > Change moves: a move the leader knows but does not have on goes in place of one it has (MM_RULES_REV 13)
		{
			const before = await t.E(() => { const S = window.__poketactica.mm.M.S, L = S.units.find((u) => u.uid === S.leader); if (!L.fig.pool.some((p) => p.id === 'surf')) L.fig = { ...L.fig, pool: [...L.fig.pool, { id: 'surf', lv: 1, xp: 0 }] }; return { eq: L.fig.equipped.slice(), turns: S.turns }; });
			await t.key('KeyC', 400);
			m = await t.menu();
			A(m.items.some((x) => /^Change moves/.test(x)), 'the moves menu offers "Change moves" when someone knows a move it does not have on', m.items);
			await t.menuTo(/^Change moves/);
			m = await t.menu();
			if (!m.items.some((x) => /^Take off/.test(x))) { await t.menuTo(/Pikachu/); m = await t.menu(); }
			A(m.items.filter((x) => /^Take off/.test(x)).length === before.eq.length, 'it lists the moves it has on, to take one off', m.items);
			await t.menuTo(/^Take off (?!Thunderbolt)/);
			m = await t.menu();
			A(m.items.some((x) => /^Surf/.test(x)) && /In place of/.test(m.title), 'then the moves it knows and does not have on', m);
			await t.menuTo(/^Surf/);
			const after = await t.E(() => { const S = window.__poketactica.mm.M.S, L = S.units.find((u) => u.uid === S.leader); return { eq: L.fig.equipped.slice(), turns: S.turns, pp: L.pp.surf }; });
			A(after.eq.includes('surf') && after.eq.includes('thunderbolt') && after.eq.length === before.eq.length && after.turns === before.turns + 1 && after.pp > 0 && /now has Surf in place of/.test(await t.bar()), 'picking one puts it on: a turn, and the bar says so', after);
		}
		// V: the bag
		await t.key('KeyV', 300);
		A((await t.menu()).hidden, 'V with an empty bag opens nothing');
		await t.E(() => { const S = window.__poketactica.mm.M.S; S.bag.push({ id: 'apple' }, { id: 'ironthorn', n: 3 }); S.belly = 500; });
		await t.key('KeyV', 400);
		m = await t.menu();
		A(/Bag 2\/20/.test(m.title) && m.items.some((x) => /Apple/.test(x)) && m.items.some((x) => /Iron Tack x3/.test(x)), 'V: the bag', m);
		await t.menuTo(/Apple/);
		m = await t.menu();
		A(/Apple/.test(m.title) && /Fills the belly/.test(m.title) && m.items.some((x) => /^Use/.test(x)) && m.items.some((x) => /^Throw/.test(x)), 'an item: what it does, and Use / Throw (a figurine uses its wax: it does not eat)', m);
		await t.menuTo(/^Use/);
		a = await t.v();
		A(a.belly === 999 && a.bag === 1 && /🍎 100/.test(await t.bar()), 'eating the Apple fills the belly', a.belly);
		// Enter: the field menu
		await t.key('Enter', 400);
		m = await t.menu();
		A(/Whisper Woods · B1F/.test(m.title) && m.items.some((x) => /Wait a turn/.test(x)) && m.items.some((x) => /^Rest/.test(x)) && m.items.some((x) => /Tactics/.test(x)) && m.items.some((x) => /Give up/.test(x)), 'Enter: the menu (wait, rest, tactics, give up)', m);
		const tw = (await t.v()).turns;
		await t.menuTo(/Wait a turn/);
		A((await t.v()).turns === tw + 1, 'Wait a turn');
		// the controller
		const p0 = await t.v();
		await t.pad(12);
		const p1 = await t.v();
		A(p1.turns === p0.turns + 1 && (p1.x !== p0.x || p1.y !== p0.y), 'the controller\'s d-pad steps');
		await t.pad(9);
		A(!(await t.menu()).hidden, 'Start opens the menu');
		await t.pad(1);
		A((await t.menu()).hidden, 'B closes it');
		// the controller's LEFT STICK: a true 8-way stick (owner, 2026-11-23), the way it points on screen
		await t.plaza();
		const push = async (x, y, ms) => { await t.E((x, y) => { window.__pad.axes = [x, y, 0, 0]; window.__pad.timestamp++; }, x, y); await sleep(ms); await t.E(() => { window.__pad.axes = [0, 0, 0, 0]; window.__pad.timestamp++; }); await sleep(350); };
		const ways = await t.E(() => { const m = window.__poketactica.mm; return { up: m.stickVec(6), right: m.stickVec(0), upRight: m.stickVec(7) }; });
		let s0 = await t.v();
		await push(0, -1, 150);
		let s1 = await t.v();
		A(s1.turns === s0.turns + 1 && s1.x - s0.x === ways.up[0] && s1.y - s0.y === ways.up[1] && Math.abs(ways.up[0]) + Math.abs(ways.up[1]) === 2, 'the stick pushed up: ONE step, straight up the screen (a diagonal of the grid), not the arrow key\'s step as well', [s1.turns - s0.turns, s1.x - s0.x, s1.y - s0.y]);
		await push(0.7, -0.7, 150);
		let s2 = await t.v();
		A(s2.turns === s1.turns + 1 && s2.x - s1.x === ways.upRight[0] && s2.y - s1.y === ways.upRight[1], 'pushed up-right: the step between', [s2.x - s1.x, s2.y - s1.y]);
		await push(0.3, 0.2, 200);
		A((await t.v()).turns === s2.turns, 'a light touch on the stick does nothing');
		await push(-1, 0, 900);
		const s3 = await t.v();
		A(s3.turns - s2.turns >= 3 && s3.turns - s2.turns <= 7, 'held over, it keeps stepping; let go, it stops', s3.turns - s2.turns);
		const rest = s3.turns; await sleep(500);
		A((await t.v()).turns === rest, '(stopped)');
		await t.key('KeyX', 200);
		await push(1, 0, 150);
		const s4 = await t.v();
		A(s4.turns === s3.turns && s4.x === s3.x && s4.y === s3.y && s4.dir !== s3.dir && !s4.turn, 'X, then the stick: it turns on the spot');
		await t.pad(12);
		const s5 = await t.v();
		A(s5.turns === s4.turns + 1 && Math.abs(s5.x - s4.x) + Math.abs(s5.y - s4.y) === 1, 'the d-pad is still the four arrows');
		// the stairs
		await t.E(() => { const T = window.__poketactica, S = T.mm.M.S, L = S.units.find((u) => u.uid === S.leader); S.F.stairs = [L.x, L.y]; T.mm.act({ t: 'face', d: L.dir }); });
		A(/Stairs/.test(await t.E(() => document.querySelector('#pt-mm [data-act="attack"]').textContent)) && /The stairs/.test(await t.E(() => document.getElementById('hint').textContent)), 'on the stairs the Z button and the hint say so');
		await t.key('KeyZ', 400);
		m = await t.menu();
		A(/The stairs/.test(m.title) && /Go down/.test(m.items[0]), 'Z on the stairs asks first', m);
		await t.key('KeyZ', 900);
		v = await t.v();
		A(v.floor === 2 && /B2F/.test(await t.bar()) && v.tiles > 20 && v.party === 3, 'down to B2F: a new floor is drawn, the party with you', [v.floor, v.tiles]);
		// a figurine lost for good
		await t.plaza();
		A(await t.E(() => !!window.__poketactica.P.col.figs['pikachu-mmp']), '(Pikachu is in the collection)');
		await t.E(() => { const S = window.__poketactica.mm.M.S, L = S.units.find((u) => u.uid === S.leader); S.belly = 0; L.hp = 1; });
		await t.key('Enter', 400); await t.menuTo(/Wait a turn/); await sleep(500);
		v = await t.v();
		A(v.party === 2 && v.leader !== 'p0' && !v.over && await t.E(() => { const c = window.__poketactica.P.col; return !c.figs['pikachu-mmp'] && (c.fallen || []).some((x) => x.fig && x.fig.id === 'pikachu-mmp'); }) && /Pikachu is gone for good/.test(await t.bar()), 'the leader starves: Pikachu is gone from the collection at once (and on the memorial), the next partner leads', [v.party, v.leader]);
		// giving up
		await t.E(() => { window.__poketactica.mm.M.S.belly = 1000; });
		await t.key('Enter', 400); await t.menuTo(/Give up/);
		m = await t.menu();
		A(/Give up\?/.test(m.title) && /Keep going/.test(m.items[0]) && /^Give up/.test(m.items[1]), 'Give up asks first, with Keep going under the cursor', m);
		await t.menuTo(/^Give up/); await sleep(300);
		const res = await t.E(() => ({ hidden: document.getElementById('result').hidden, title: document.getElementById('r-title').textContent, body: document.getElementById('r-body').textContent }));
		A(!res.hidden && res.title === 'Gave up' && /Whisper Woods/.test(res.body) && /B2F/.test(res.body) && /lost/.test(res.body) && /Gone for good: Pikachu/.test(res.body), 'the result: gave up on B2F, everything found lost, Pikachu named', res);
		await t.shot('mm-desktop-result');
		await t.key('KeyZ', 700);
		A(await t.E(() => window.__poketactica.P.screen === 'camp' && document.getElementById('pt-mm').hidden && !document.body.classList.contains('pt-mming')), 'Z: back to the camp, the maze\'s bar put away');
		A(!t.errors.length, 'no page errors (desktop)', t.errors.slice(0, 3));
	}

	// ---------- the owner's list of 2026-11-24: resting, the shop's warning, what Give up costs, what cannot be thrown, what is on a figurine
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.E(() => { const T = window.__poketactica; return T.startMm('whisper-woods', ['pikachu-mmp', 'squirtle-mmp'].map((id) => T.P.col.figs[id]), { seed: 'polish', stars: 100, bag: [{ id: 'escapeorb' }, { id: 'elixir' }, { id: 'sleepseed' }, { id: 'apple' }] }); }), 'a run with a packed bag and 100 stars');
		const X = (fn, ...a) => t.E(fn, ...a);
		const msgs = () => X(() => window.__poketactica.mm.M.msgs.slice());
		// what can be thrown: a marble or an oil thrown is only lost, so Throw is not offered for them
		const itemMenu = async (re) => { await t.key('KeyV', 300); await t.menuTo(re); await sleep(150); const m = await t.menu(); await t.key('KeyX', 200); await t.key('KeyX', 200); return m; };
		let m = await itemMenu(/Escape Marble/);
		A(m.items.some((x) => /^Use/.test(x)) && !m.items.some((x) => /^Throw/.test(x)), 'an Escape Marble: Use, and no Throw', m.items);
		m = await itemMenu(/Joint Oil/);
		A(m.items.some((x) => /^Use/.test(x)) && !m.items.some((x) => /^Throw/.test(x)), 'Joint Oil: Use, and no Throw', m.items);
		m = await itemMenu(/Sleep Pellet/);
		A(m.items.some((x) => /^Use/.test(x)) && m.items.some((x) => /^Throw/.test(x)) && /Whoever uses it/.test(m.title), 'a Sleep Pellet: Use or Throw; its note says "uses", not "eats"', m);
		// Give up: what was carried in is lost too, and it says how much
		await t.key('Enter', 400); await t.menuTo(/^Give up/); await sleep(200);
		m = await t.menu();
		A(/what you carried in \(100 ★, 4 items\)/.test(m.title) && /Keep going/.test(m.items[0]), 'Give up says what was carried in is lost too (100 ★, 4 items)', m);
		await t.key('KeyZ', 300);   // (Keep going)
		// Rest: turns pass by themselves until everyone is healed
		await X(() => { const S = window.__poketactica.mm.M.S; for (const u of S.units) if (u.side !== 'p') { u.x = -99; u.hp = 0; } const L = S.units.find((u) => u.uid === S.leader); L.hp = Math.max(1, L.maxHP - 3); });
		const r0 = await t.v();
		await t.key('Enter', 400); await t.menuTo(/^Rest/);
		await t.page.waitForFunction(() => !window.__poketactica.mm.M.rest, { timeout: 60000, polling: 100 }).catch(() => {});
		const r1 = await t.v();
		A(r1.turns > r0.turns + 1 && r1.hp > r0.hp && (await msgs()).some((x) => /Rested: everyone is at full HP/.test(x)), 'Rest: turns pass by themselves until everyone is healed', [r0.turns, r1.turns, r0.hp, r1.hp, await msgs()]);
		await t.key('Enter', 400); await t.menuTo(/^Rest/); await sleep(200);
		A(!(await X(() => !!window.__poketactica.mm.M.rest)), 'at full HP there is nothing to rest for');
		// ... and any press stops it
		await X(() => { const S = window.__poketactica.mm.M.S, L = S.units.find((u) => u.uid === S.leader); L.hp = 1; });
		await t.key('Enter', 400); await t.menuTo(/^Rest/); await sleep(120);
		{ const rs = await X(() => ({ rest: !!window.__poketactica.mm.M.rest, hint: document.getElementById('hint').textContent, msgs: window.__poketactica.mm.M.msgs.slice(), menu: !document.getElementById('menu').hidden })); A(rs.rest && /Resting/.test(rs.hint), 'resting: the hint says so', rs); }
		await t.key('KeyX', 300);
		A(!(await X(() => !!window.__poketactica.mm.M.rest)) && (await msgs()).some((x) => /You stop resting/.test(x)), 'any press stops the rest');
		// what is on a figurine shows on its chip: confusion, speed, a sealed move
		await X(() => { const T = window.__poketactica, S = T.mm.M.S, L = S.units.find((u) => u.uid === S.leader); L.confused = 5; L.haste = 4; L.sealed = Object.keys(L.pp)[0]; T.mm.M.view = null; });
		await t.key('Enter', 300); await t.key('KeyX', 300);
		const chip = await X(() => document.querySelector('#mm-party .pt-mm-chip.is-lead').textContent.replace(/\s+/g, ' '));
		A(/CONF/.test(chip) && /FAST/.test(chip) && /SEAL/.test(chip), 'the leader\'s chip says CONF, FAST and SEAL', chip);
		await X(() => { const S = window.__poketactica.mm.M.S, L = S.units.find((u) => u.uid === S.leader); L.confused = 0; L.haste = 0; L.sealed = null; });
		// the shop: owing, a step off the carpet asks first
		const shop = await X(() => {
			const T = window.__poketactica, S = T.mm.M.S, F = S.F, L = S.units.find((u) => u.uid === S.leader), SHOP = 0x20;
			// (make the leader's tile carpet and owe 30: the page's own check reads the same bits the rules do)
			F.terrain[L.y * F.w + L.x] |= SHOP; S.owed = 30;
			const D = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
			return { x: L.x, y: L.y, turns: S.turns };
		});
		// walk each of the four arrow ways until one opens the question (a wall just turns)
		let asked = null;
		for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) { await t.key(k, 350); const q = await t.menu(); if (!q.hidden) { asked = q; break; } }
		const mid = await t.v();
		A(asked && /Leave the shop without paying\? You owe 30 ★/.test(asked.title) && /^Stay/.test(asked.items[0]) && /^Leave without paying/.test(asked.items[1]) && mid.x === shop.x && mid.y === shop.y, 'owing, a step off the carpet asks first (Stay under the cursor), and nothing has moved', [asked, shop, mid]);
		await t.key('KeyZ', 300);
		const stay = await t.v();
		A(stay.x === shop.x && stay.y === shop.y && !(await X(() => window.__poketactica.mm.M.S.thief)), 'Stay: still on the carpet, no thief');
		A(/leaving the carpet unpaid is theft/.test(await X(() => document.getElementById('hint').textContent)), 'the hint warns too');
		await X(() => { const S = window.__poketactica.mm.M.S; S.owed = 0; });
		A(!t.errors.length, 'no page errors (the list)', t.errors.slice(0, 3));
		await t.page.close();
	}

	// ---------- the camp: a dungeon, a party, a pack; then what clearing it pays
	{
		const t = await open({ width: 1280, height: 800 });
		const labels = () => t.E(() => window.__poketactica.hub.labels());
		const focus = () => t.E(() => window.__poketactica.hub.focusLabel());
		const to = async (re, key = 'ArrowDown') => { for (let i = 0; i < 30; i++) { if (re.test(await focus() || '')) return true; await t.key(key, 80); } return false; };
		// a storage with a few things in it, and stars in the wallet
		await t.E(async () => { const T = window.__poketactica, F = await import('/poketactica/js/figcol.js'), St = await import('/site/stars.js'); let c = T.P.col; c = F.mmStoreAdd(c, 'apple', 'a001'); c = F.mmStoreAdd(c, 'oran', 'o001'); c = F.mmStoreAdd(c, 'oran', 'o002'); c = F.mmStoreAdd(c, 'ironthorn', 'i001'); c = F.mmStoreAdd(c, 'ironthorn', 'i002'); T.saveCol(c); St.earn(400); window.__stars0 = St.stars(); });
		await t.E(() => { const T = window.__poketactica; T.hub.mmDungeons(); });
		let ls = await labels();
		A(ls.some((x) => /Whisper Woods/.test(x) && /5F/.test(x) && /New/.test(x)) && ls.some((x) => /Pebble Hollow/.test(x) && /🔒/.test(x)) && ls.some((x) => /The Abyss/.test(x) && /endless/.test(x)) && ls.some((x) => /Sprout Trial/.test(x) && /Lv 5/.test(x)) && ls.some((x) => /Storage 5\/200/.test(x)), 'the dungeon list: Whisper Woods open and new, the rest locked; the storage count', ls);
		A(/deadly/.test(await t.E(() => document.getElementById('hub').textContent)), 'it says plainly that a fainted figurine is gone for good');
		await to(/Pebble Hollow/); await t.key('KeyZ', 300);
		A(/Clear Whisper Woods first/.test(await t.E(() => document.getElementById('toast').textContent)) && (await t.E(() => window.__poketactica.hub.H.screen)) === 'mm', 'a locked dungeon says what opens it');
		await to(/Whisper Woods/, 'ArrowUp'); await t.key('KeyZ', 400);
		ls = await labels();
		A((await t.E(() => window.__poketactica.hub.H.screen)) === 'mm-party' && ls.some((x) => /Next: pack/.test(x)) && ls.some((x) => /Pikachu/.test(x)), 'the party screen', ls.slice(0, 5));
		// the party in the order picked: Squirtle first
		await t.E(() => { const T = window.__poketactica; T.hub.H.mmParty = ['squirtle-mmp', 'pikachu-mmp']; T.hub.mmParty('whisper-woods'); });
		ls = await labels();
		A(ls.some((x) => /★/.test(x) && /Squirtle/.test(x)) && ls.some((x) => /^2/.test(x) && /Pikachu/.test(x)), 'the first picked leads (★), the next is 2', ls.slice(0, 5));
		await to(/Next: pack/, 'ArrowUp'); await t.key('KeyZ', 400);
		ls = await labels();
		A((await t.E(() => window.__poketactica.hub.H.screen)) === 'mm-pack' && ls.some((x) => /Stars to carry/.test(x) && /0 ★/.test(x)) && ls.some((x) => /Oran Bead/.test(x) && /have 2/.test(x)) && ls.some((x) => /Iron Tack/.test(x)), 'the pack screen: stars to carry and what the storage holds', ls);
		await to(/Stars to carry/); await t.key('KeyZ', 250);
		await to(/Oran Bead/); await t.key('KeyZ', 250); await t.key('KeyZ', 250); await t.key('KeyZ', 250);
		await to(/Iron Tack/, 'ArrowUp'); await t.key('KeyZ', 250); await t.key('KeyZ', 250);
		await to(/Apple/); await t.key('KeyZ', 250); await t.key('KeyC', 250);
		A(await t.E(() => document.querySelectorAll('#hub .ph-row [data-clear]').length === 2), 'each packed item has a ✕ to put one back (a phone has no C key)');
		ls = await labels();
		A(ls.some((x) => /Stars to carry/.test(x) && /100 ★/.test(x)) && ls.some((x) => /Oran Bead/.test(x) && /taking 2/.test(x)) && ls.some((x) => /Iron Tack/.test(x) && /taking 2/.test(x)) && ls.some((x) => /Apple/.test(x) && !/taking/.test(x)) && ls.some((x) => /Enter!/.test(x) && /4\/20 items · 100 ★/.test(x)), 'Z takes one (never more than you have), C puts one back; the stars step up', ls);
		await to(/Enter!/, 'ArrowUp'); await t.key('KeyZ', 900);
		let v = await t.v();
		const packed = await t.E(async () => { const T = window.__poketactica, F = await import('/poketactica/js/figcol.js'), St = await import('/site/stars.js'), S = T.mm.M.S; return { bag: S.bag, stars: S.stars, wallet: St.stars(), w0: window.__stars0, store: F.mmStoreCount(T.P.col), lead: S.units[0].species }; });
		A(v.screen === 'mm' && packed.lead === 'squirtle' && JSON.stringify(packed.bag) === JSON.stringify([{ id: 'oran' }, { id: 'oran' }, { id: 'ironthorn', n: 2 }]) && packed.stars === 100 && packed.wallet === packed.w0 - 100 && JSON.stringify(packed.store) === JSON.stringify({ apple: 1 }), 'into the dungeon: Squirtle leads; the packed items have left the storage and the stars the wallet', packed);
		// clear it: on the last floor, nothing left standing, up the stairs
		await t.E(() => { const T = window.__poketactica, M = T.mm.M, S = M.S; S.floorNo = 5; S.stars += 60; S.bag.push({ id: 'sitrus' }); for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1); const L = S.units.find((u) => u.uid === S.leader); S.F.stairs = [L.x, L.y]; S.exp[S.leader] = 5000; T.mm.act({ t: 'face', d: L.dir }); });
		await t.key('KeyZ', 400);
		A(/Take the stairs out/.test((await t.menu()).items[0]), 'on the last floor the stairs lead out');
		await t.key('KeyZ', 900);
		const res = await t.E(async () => { const T = window.__poketactica, F = await import('/poketactica/js/figcol.js'), St = await import('/site/stars.js'); return { hidden: document.getElementById('result').hidden, title: document.getElementById('r-title').textContent, body: document.getElementById('r-body').textContent.replace(/\s+/g, ' '), wallet: St.stars(), w0: window.__stars0, mm: T.P.col.mm, store: F.mmStoreCount(T.P.col), lv: T.P.col.figs['squirtle-mmp'].exp }; });
		A(!res.hidden && res.title === 'Dungeon cleared!' && /\+310 ★ banked/.test(res.body) && /first clear: 150 ★/.test(res.body) && /Into storage/.test(res.body) && /Sitrus Bead/.test(res.body) && /New record/.test(res.body), 'the result: cleared, 310 stars banked (the purse of 160 and the first-clear 150), what went into storage', res.body);
		A(res.wallet === res.w0 + 210 && res.mm.clear['whisper-woods'] === 1 && res.mm.best['whisper-woods'] === 5 && JSON.stringify(res.store) === JSON.stringify({ apple: 1, oran: 2, ironthorn: 2, sitrus: 1 }) && res.lv === 5000, 'the wallet, the record, the storage and the leader\'s EXP all show it', [res.wallet - res.w0, res.store, res.lv]);
		await t.key('KeyZ', 600);
		await t.E(() => window.__poketactica.hub.mmDungeons());
		ls = await labels();
		A(ls.some((x) => /Whisper Woods/.test(x) && /cleared/.test(x)) && ls.some((x) => /Pebble Hollow/.test(x) && !/🔒/.test(x)) && ls.some((x) => /Storage 6\/200/.test(x)), 'back in the camp: Whisper Woods is cleared and Pebble Hollow is open', ls.slice(0, 4));
		await t.E(() => window.__poketactica.hub.mmStorage());
		ls = await labels();
		A((await t.E(() => window.__poketactica.hub.H.screen)) === 'mm-storage' && ls.some((x) => /Oran Bead/.test(x) && /×2/.test(x)) && ls.some((x) => /Sitrus Bead/.test(x)), 'the storage screen lists it', ls);
		await t.shot('mm-storage');
		A(!t.errors.length, 'no page errors (the camp)', t.errors.slice(0, 3));
	}

	// ---------- the camp's entry; a reload resumes; a replay; a friend's live run
	{
		const t = await open({ width: 1280, height: 800 });
		const labels = () => t.E(() => window.__poketactica.hub.labels());
		const focus = () => t.E(() => window.__poketactica.hub.focusLabel());
		const to = async (re, key = 'ArrowDown') => { for (let i = 0; i < 40; i++) { if (re.test(await focus() || '')) return true; await t.key(key, 80); } return false; };
		const wait = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await t.E(fn).catch(() => false)) return true; await sleep(200); } return false; };
		let ls = await labels();
		A(ls.some((x) => /Mystery Maze/.test(x) && /never the same twice/.test(x)) && !ls.some((x) => /Resume Mystery Maze/.test(x)), 'the camp has Mystery Maze on its menu', ls);
		A(await to(/Mystery Maze/) && (await t.key('KeyZ', 400), (await t.E(() => window.__poketactica.hub.H.screen)) === 'mm'), 'Z on it: the dungeons');
		await t.E(() => window.__poketactica.hub.help('Mystery Maze'));
		A(/Everything moves when you move/.test(await t.E(() => document.getElementById('hub').textContent)) && /gone for good/.test(await t.E(() => document.getElementById('hub').textContent)), 'How to play has a Mystery Maze page, and it says a fainted figurine is gone');
		// a run, some real actions, then the page is reloaded
		A(await t.start('resumetest'), '(a run)');
		await t.E(() => { const T = window.__poketactica; for (let k = 0; k < 4; k++) T.mm.act({ t: 'pass' }); T.mm.act({ t: 'face', d: 3 }); for (let d = 0; d < 8; d++) T.mm.act({ t: 'step', d }); T.mm.act({ t: 'attack' }); });
		const before = await t.E(() => { const T = window.__poketactica, v = T.mm.view(), L = v.units.find((u) => u.uid === v.leader); return { hash: T.mm.hash(), acts: T.mm.M.acts.length, turns: v.turns, x: L.x, y: L.y, saved: JSON.parse(localStorage.getItem('magepunk_poketactica_mm_v1') || 'null') }; });
		A(before.acts >= 7 && before.saved && before.saved.recipe.kind === 'mm' && before.saved.recipe.n === before.acts && before.saved.recipe.dungeon === 'whisper-woods', 'the run is saved on the device after every action, as its recipe', before.saved && before.saved.recipe.n);
		await t.page.reload({ waitUntil: 'domcontentloaded' });
		await wait(() => !!(window.__poketactica && window.__poketactica.ready));
		await sleep(500);
		ls = await labels();
		A(ls.some((x) => /Resume Mystery Maze/.test(x) && /Whisper Woods · B1F/.test(x)), 'after a reload the camp offers to resume it', ls.slice(0, 3));
		await t.E(() => window.__poketactica.hub.mmDungeons());
		ls = await labels();
		await to(/Whisper Woods/); await t.key('KeyZ', 300);
		A(ls.some((x) => /^⏸ Resume/.test(x)) && /run in progress/.test(await t.E(() => document.getElementById('toast').textContent)) && (await t.E(() => window.__poketactica.hub.H.screen)) === 'mm', 'and no other dungeon can be entered meanwhile (what the run carries is out of the storage)');
		await t.E(() => window.__poketactica.hub.home());
		A(await to(/Resume Mystery Maze/, 'ArrowUp') && (await t.key('KeyZ', 900), true), '(resume)');
		const after = await t.E(() => { const T = window.__poketactica, v = T.mm.view(), L = v.units.find((u) => u.uid === v.leader); return { screen: T.P.screen, hash: T.mm.hash(), acts: T.mm.M.acts.length, turns: v.turns, x: L.x, y: L.y, mode: T.mm.M.mode }; });
		A(after.screen === 'mm' && after.mode === 'play' && after.hash === before.hash && after.acts === before.acts && after.turns === before.turns && after.x === before.x && after.y === before.y, 'resumed: the very same run, at the same spot and turn', [before.hash, after.hash]);
		await t.key('Enter', 400); await t.menuTo(/Wait a turn/);
		A((await t.v()).turns === before.turns + 1 && (await t.v()).acts === before.acts + 1, 'and it plays on');
		// its replay
		const rec = await t.E(() => { const T = window.__poketactica; for (let k = 0; k < 20; k++) T.mm.act({ t: 'pass' }); T.mm.act({ t: 'quit' }); return T.mm.recipe(); });
		A(rec.over && rec.over.quit && rec.n === before.acts + 22 && await t.E(() => localStorage.getItem('magepunk_poketactica_mm_v1') === null) && !(await t.E(() => document.getElementById('result').hidden)), 'given up: the result shows, the saved run is cleared', rec.n);
		await t.key('KeyZ', 600);
		ls = await labels();
		A(!ls.some((x) => /Resume Mystery Maze/.test(x)), 'back in the camp, nothing to resume');
		await t.E((rec) => { const T = window.__poketactica; T.hub.close(); T.mm.watch(rec); }, rec);
		let w = await t.E(() => { const M = window.__poketactica.mm.M; return { mode: M.mode, k: M.drv.k, paused: M.paused, bar: document.getElementById('pt-mm').textContent.replace(/\s+/g, ' ') }; });
		A(w.mode === 'watch' && /Pause/.test(w.bar) && new RegExp('/' + rec.n).test(w.bar) && !/Moves/.test(w.bar), 'a replay: the bar is the viewer\'s (play / pause, floors, speed, a link), not the player\'s', w.bar);
		await sleep(1500);
		const k1 = await t.E(() => window.__poketactica.mm.M.drv.k);
		await t.E(() => window.__poketactica.mm.onWatchAction('confirm'));
		const k2 = await t.E(() => window.__poketactica.mm.M.drv.k); await sleep(700);
		const k3 = await t.E(() => window.__poketactica.mm.M.drv.k);
		A(k1 >= 3 && k1 < rec.n && k3 === k2 && await t.E(() => window.__poketactica.mm.M.paused), 'it plays by itself (about 5 actions a second), and Z pauses it', [k1, k2, k3]);
		await t.E(() => { const m = window.__poketactica.mm; m.onWatchAction('secondary'); m.onWatchAction('secondary'); m.onWatchAction('secondary'); m.onWatchAction('confirm'); });
		A(await wait(() => window.__poketactica.mm.M.ended, 15000) && await t.E(() => { const M = window.__poketactica.mm.M; return M.speed === 8 && M.drv.k === M.rec.n && !!M.S.over; }), 'C speeds it up to 8×; it runs to the end of the run');
		await t.E(() => window.__poketactica.mm.onWatchAction('cancel'));
		A(await t.E(() => { const M = window.__poketactica.mm.M; return M.drv.k === 0 && M.paused && !M.ended; }), 'X: back to the start, paused');
		A(await t.E(() => { const T = window.__poketactica; const n = T.mm.M.drv.k; T.mm.act({ t: 'pass' }); return T.mm.M.drv.k === n && T.mm.M.acts.length === 0; }), 'a viewer cannot play it');
		// a friend's live run: drawn from their view alone
		const view = await t.E(() => window.__poketactica.mm.view());
		await t.E((view) => { const T = window.__poketactica; T.mm.close(); T.mm.follow({ mm: 1, view, msgs: ['Picked up 12 stars.'], over: null }, 'Watching bob'); }, view);
		let f = await t.E(() => { const T = window.__poketactica, M = T.mm.M; return { mode: M.mode, tiles: T.P.S.map.height.filter((h) => h != null).length, units: Object.keys(T.P.disp.units).length, bar: document.getElementById('pt-mm').textContent.replace(/\s+/g, ' '), hasSeed: 'seed' in M.S || 'rng' in M.S }; });
		A(f.mode === 'follow' && f.tiles > 20 && f.units >= 3 && /Watching bob/.test(f.bar) && /Picked up 12 stars/.test(f.bar) && /Whisper Woods · B1F/.test(f.bar) && !f.hasSeed, 'following a friend: their explored ground, their party, their bar and messages; no seed anywhere', f);
		const moved = JSON.parse(JSON.stringify(view));
		let who = null;
		for (const u of moved.units) { const i = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].find(([dx, dy]) => moved.tiles[(u.y + dy) * moved.w + u.x + dx] >= 1 && !moved.units.some((o) => o.x === u.x + dx && o.y === u.y + dy)); if (i) { u.x += i[0]; u.y += i[1]; who = u.uid; break; } }
		moved.turns++;
		await t.E((moved) => window.__poketactica.mm.follow({ mm: 1, view: moved, msgs: [], over: null }, 'Watching bob'), moved);
		A(await t.E((id) => { const M = window.__poketactica.mm.M; return !!M.tw[id] && M.S.turns === M.view.turns; }, who), 'their next step glides');
		await t.key('ArrowUp', 200); await t.key('KeyZ', 200);
		A((await t.E(() => window.__poketactica.mm.M.S.turns)) === moved.turns && (await t.menu()).hidden, 'a spectator\'s keys change nothing');
		A(!t.errors.length, 'no page errors (resume, replay, live)', t.errors.slice(0, 3));
	}

	// ---------- the first run is coached; the board says what lies on it
	{
		const t = await open({ width: 1280, height: 800 });
		await t.E(() => localStorage.removeItem('magepunk_poketactica_mmcoach_v1'));
		A(await t.start('coachtest'), '(a first run)');
		const coach = () => t.E(() => { const e = document.getElementById('mm-coach'); return e ? e.textContent.replace(/\s+/g, ' ') : null; });
		let c = await coach();
		A(/1\/5/.test(c) && /arrows/.test(c) && /Nothing else moves until you do/.test(c) && /Skip/.test(c), 'the first run on a device is coached: step 1 of 5, how to move', c);
		await t.plaza();
		for (const k of ['ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown']) await t.key(k, 300);
		c = await coach();
		A(/2\/5/.test(c) && /walk into it/.test(c), 'walk four steps and it moves on to fighting', c);
		await t.E(() => { const T = window.__poketactica, S = T.mm.M.S; S.kills = 1; S.bag.push({ id: 'apple' }); T.mm.act({ t: 'pass' }); T.mm.act({ t: 'pass' }); });
		c = await coach();
		A(/5\/5/.test(c) && /stairs/.test(c), 'each step is ticked off by doing it: after a knockout, an item and a rest, it is the stairs', c);
		await t.E(() => { const T = window.__poketactica, S = T.mm.M.S, L = S.units.find((u) => u.uid === S.leader); S.F.stairs = [L.x, L.y]; T.mm.act({ t: 'stairs' }); });
		c = await coach();
		A(/gone for good/.test(c) && await t.E(() => localStorage.getItem('magepunk_poketactica_mmcoach_v1') === 'done'), 'down the stairs: the coach signs off with the one rule that matters, and does not come back', c);
		await t.E(() => window.__poketactica.mm.act({ t: 'pass' }));
		A((await coach()) === null, 'it is gone on the next action');
		// what lies on the board is written on it
		await t.plaza();
		const marks = await t.E(() => { const T = window.__poketactica, S = T.mm.M.S, L = S.units.find((u) => u.uid === S.leader);
			S.F.stairs = [L.x + 2, L.y]; S.items.push({ x: L.x + 2, y: L.y + 1, id: 'apple' }, { x: L.x + 2, y: L.y - 1, id: 'stars', n: 9 }, { x: L.x - 1, y: L.y + 2, id: 'oran', shop: true, price: 30 }); S.traps.push({ x: L.x + 1, y: L.y + 2, kind: 'spike', seen: true }, { x: L.x, y: L.y + 2, kind: 'mud', seen: false });
			T.mm.act({ t: 'face', d: L.dir }); return T.P.marks.map((m) => [m.text, m.sub || '', m.color]); });
		const has = (text, sub) => marks.some((m) => m[0] === text && m[1] === sub);
		A(has('▼', 'stairs') && has('◆', '') && has('★', '') && has('◆', '30★') && has('✖', 'trap') && marks.length === 5, 'the stairs, an item, a pile of stars, a shop\'s price and a shown trap are each marked on their tile (a hidden trap is not)', marks);
		// (read when the camera has settled on the leader: straight after the action the label is still sliding with the board)
		const readDrawn = () => t.E(() => { const T = window.__poketactica, S = T.mm.M.S, st = S.F.stairs, p = T.screenOf(st[0], st[1]); const c = document.querySelectorAll('canvas'); let hit = 0;
			for (const cv of c) { const g = cv.getContext && cv.getContext('2d', { willReadFrequently: true }); if (!g) continue; const k = cv.width / innerWidth; const d = g.getImageData(Math.max(0, Math.round((p[0] - 24) * k)), Math.max(0, Math.round((p[1] - 70) * k)), Math.round(48 * k), Math.round(90 * k)).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 190 && d[i + 2] < 110 && d[i + 3] > 200) hit++; }
			return hit; });
		let drawn = 0;
		for (let i = 0; i < 12 && drawn <= 20; i++) { await sleep(300); drawn = await readDrawn(); }
		A(drawn > 20, 'and the gold ▼ is really drawn over the stairs', drawn);
		await t.shot('mm-marks');
		A(!t.errors.length, 'no page errors (the coach, the marks)', t.errors.slice(0, 3));
	}

	// ---------- touch, on a phone
	{
		const t = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		// the first run on a device is coached, in a phone's words
		await t.E(() => localStorage.removeItem('magepunk_poketactica_mmcoach_v1'));
		A(await t.start('phonecoach') && /1\/5/.test(await t.E(() => document.getElementById('mm-coach').textContent)) && /joystick/.test(await t.E(() => document.getElementById('mm-coach').textContent)), 'the first run is coached, and on a phone it says joystick');
		await t.E(() => document.querySelector('#pt-mm [data-act="coach-skip"]').click());
		A(await t.E(() => !document.getElementById('mm-coach') && localStorage.getItem('magepunk_poketactica_mmcoach_v1') === 'done'), 'Skip puts it away for good');
		await t.E(() => window.__poketactica.mm.close());
		A(await t.start('phonetest'), 'a run opens on a phone');
		await t.plaza();
		await sleep(400);
		// ---- the bar folds to one line (owner, 2026-11-23: "minimizable/collapsable to reduce how cluttered the screen is")
		{
			const box = () => t.E(() => { const b = document.getElementById('pt-mm').getBoundingClientRect(), mini = document.getElementById('mm-map').getBoundingClientRect(), menu = document.getElementById('mm-menu').getBoundingClientRect(); return { h: Math.round(b.height), w: Math.round(b.width), bottom: Math.round(b.bottom), mini: Math.round(mini.top), menu: Math.round(menu.top), text: document.getElementById('pt-mm').textContent.replace(/\s+/g, ' '), small: !!document.querySelector('#pt-mm .pt-mm-small'), party: !!document.getElementById('mm-party'), msg: !!document.getElementById('mm-msg') }; });
			const full = await box();
			A(!full.small && full.party && full.msg && /Whisper Woods/.test(full.text), '(the whole bar to begin with)', full);
			const fold = async () => { const r = await t.E(() => { const b = document.querySelector('#pt-mm [data-act="fold"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width, b.height]; }); await t.page.touchscreen.tap(r[0], r[1]); await sleep(300); return r; };
			const btn = await fold();
			const small = await box();
			await t.shot('mm-phone-folded');
			A(btn[2] >= 30 && btn[3] >= 28, 'the fold button is big enough for a thumb', btn);
			A(small.small && !small.party && !small.msg && small.h <= 60 && small.h < full.h / 2 && small.w < full.w, `one tap folds the bar to one line (${full.h}px tall to ${small.h}px)`, small);
			A(/B\dF/.test(small.text) && /🍎 \d+/.test(small.text) && /\d+\/\d+/.test(small.text) && !/Whisper Woods/.test(small.text), 'folded, it still shows the floor, the belly and the leader\'s HP', small.text);
			A(small.mini < full.mini && small.menu < full.menu && small.mini >= small.bottom, 'and the minimap and the buttons move up into the room it gave back', [full.mini, small.mini, small.bottom]);
			await t.E(() => { const T = window.__poketactica, S = T.mm.M.S, mate = S.units.find((u) => u.side === 'p' && u.uid !== S.leader); mate.hp = 1; T.mm.act({ t: 'face', d: 2 }); });
			A(await t.E(() => /♥ 1/.test((document.getElementById('mm-hurt') || {}).textContent || '')), 'folded, a partner at half HP or less is still flagged');
			await t.E(() => { const T = window.__poketactica, S = T.mm.M.S; for (const u of S.units) if (u.side === 'p') u.hp = u.maxHP; T.mm.act({ t: 'face', d: 2 }); });
			A(await t.E(() => localStorage.getItem('magepunk_poketactica_mmbar_v1') === 'small'), 'the choice is remembered on this device');
			await t.E(() => window.__poketactica.mm.close());
			A(await t.start('phonetest') && (await box()).small, 'the next run opens with the bar still folded');
			await fold();
			A(!(await box()).small && await t.E(() => localStorage.getItem('magepunk_poketactica_mmbar_v1') === 'full'), 'a tap on it unfolds it again');
			await t.plaza();
			await sleep(300);
		}
		const tapTile = async (x, y, ms = 500) => { const p = await t.E((x, y) => window.__poketactica.screenOf(x, y), x, y); await t.page.touchscreen.tap(p[0], p[1]); await sleep(ms); };
		const tapEl = async (sel) => { const r = await t.E((sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.left, b.right]; }, sel); if (!r) return false; await t.page.touchscreen.tap(r[0], r[1]); await sleep(450); return r; };
		// ---- the overworld's pad, with a joystick for 8 directions (owner, 2026-11-23)
		const pad = await t.E(() => { const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, shown: getComputedStyle(e).display !== 'none' && !e.closest('[hidden]') }; };
			return { stick: r('mm-stick'), a: r('mm-a'), b: r('mm-b'), menu: r('mm-menu'), moves: r('mm-moves'), bag: r('mm-bag'), wait: r('mm-wait'), bar: r('pt-mm'), map: r('mm-map'), W: innerWidth, H: innerHeight, barButtons: document.querySelectorAll('#pt-mm [data-act]').length }; });
		const inView = (r) => r && r.shown && r.x >= 0 && r.y >= 0 && r.x + r.w <= pad.W + 1 && r.y + r.h <= pad.H + 1;
		A(['stick', 'a', 'b', 'menu', 'moves', 'bag', 'wait'].every((k) => inView(pad[k])), 'on a touch screen: a joystick, A and B, and MENU / MOVES / BAG / WAIT, all on screen', pad);
		A(pad.stick.x < pad.W * 0.25 && pad.stick.y > pad.H * 0.7 && pad.stick.w >= 130 && pad.a.x > pad.W * 0.7 && pad.a.y > pad.H * 0.7 && pad.b.x > pad.W * 0.5 && pad.b.y > pad.a.y && pad.menu.x > pad.W * 0.7 && pad.menu.y < pad.H * 0.4 && pad.moves.y > pad.menu.y && pad.bag.y > pad.moves.y, 'laid out as the overworld\'s: the stick bottom left, A and B bottom right, the menu buttons top right');
		A(inView(pad.bar) && pad.bar.y + pad.bar.h < pad.H * 0.3 && pad.barButtons === 1 && pad.map.y > pad.bar.y + pad.bar.h - 2 && pad.map.x + pad.map.w < pad.menu.x, 'the bar is at the top with no action buttons of its own (only its fold); the minimap sits under it, clear of the buttons', [pad.bar, pad.map]);
		const overlap = (p1, p2) => p1.x < p2.x + p2.w && p2.x < p1.x + p1.w && p1.y < p2.y + p2.h && p2.y < p1.y + p1.h;
		const all = ['stick', 'a', 'b', 'menu', 'moves', 'bag', 'wait', 'bar', 'map'];
		A(all.every((k, i) => all.slice(i + 1).every((j) => !overlap(pad[k], pad[j]))), 'nothing lies on top of anything else');
		const cam = await t.E(() => ['b-left', 'b-right'].map((id) => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, shown: getComputedStyle(e).display !== 'none' }; }));
		A(cam.every((c) => c.shown && c.w > 20 && !overlap(c, pad.stick) && !overlap(c, pad.map) && c.y < pad.H * 0.5), 'the camera turn buttons are moved up, out of the way of the joystick', cam);
		// the stick: pointer events on it, as a thumb makes them
		const stick = (dx, dy, kind = 'pointerdown') => t.E((dx, dy, kind) => { const e = document.getElementById('mm-stick'), b = e.getBoundingClientRect(); (kind === 'pointerdown' ? e : window).dispatchEvent(new PointerEvent(kind, { pointerId: 7, clientX: b.left + b.width / 2 + dx, clientY: b.top + b.height / 2 + dy, bubbles: true, cancelable: true, pointerType: 'touch' })); }, dx, dy, kind);
		const flick = async (dx, dy, ms = 120) => { await stick(dx, dy); await sleep(ms); await stick(dx, dy, 'pointerup'); await sleep(350); };
		const onScreen = (v) => t.E((x, y) => window.__poketactica.screenOf(x, y), v.x, v.y);
		const press = async (id, ms = 400) => { await t.E((id) => document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true, cancelable: true, pointerType: 'touch' })), id); await sleep(ms); };
		const release = (id) => t.E((id) => document.getElementById(id).dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true, pointerType: 'touch' })), id);
		let v = await t.v();
		await flick(0, -55);
		let w = await t.v();
		const vec = await t.E(() => { const m = window.__poketactica.mm; return { up: m.stickVec(6), right: m.stickVec(0), upRight: m.stickVec(7), down: m.stickVec(2), left: m.stickVec(4) }; });
		A(w.turns === v.turns + 1 && w.x - v.x === vec.up[0] && w.y - v.y === vec.up[1] && Math.abs(vec.up[0]) === 1 && Math.abs(vec.up[1]) === 1, 'the stick pushed UP: one step straight up the screen (a diagonal on the board, which is seen corner-on)', [w.x - v.x, w.y - v.y, vec.up]);
		// (straight up the screen: with the camera still, the tile it reached is drawn right above the one it left)
		const geo = await t.E((v, w) => { const T = window.__poketactica; const a = T.screenOf(v.x, v.y), b = T.screenOf(w.x, w.y); return [b[0] - a[0], b[1] - a[1]]; }, v, w);
		A(Math.abs(geo[0]) < 3 && geo[1] < -8, 'that tile is drawn right above the one it left', geo);
		v = w;
		await flick(55, 0);
		w = await t.v();
		const geoR = await t.E((v, w) => { const T = window.__poketactica; const a = T.screenOf(v.x, v.y), b = T.screenOf(w.x, w.y); return [b[0] - a[0], b[1] - a[1]]; }, v, w);
		A(w.turns === v.turns + 1 && geoR[0] > 8 && Math.abs(geoR[1]) < 3, 'pushed RIGHT: one step straight right on screen', geoR);
		v = w;
		await flick(40, -40);
		w = await t.v();
		A(w.turns === v.turns + 1 && Math.abs(w.x - v.x) + Math.abs(w.y - v.y) === 1 && w.x - v.x === vec.upRight[0] && w.y - v.y === vec.upRight[1], 'pushed UP-RIGHT: the step between them (one tile along the board\'s grid)', [w.x - v.x, w.y - v.y]);
		const all8 = await t.E(() => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => window.__poketactica.mm.stickVec(k).join(',')));
		A(new Set(all8).size === 8 && all8.every((x) => x !== '0,0'), 'the stick\'s 8 ways are the 8 steps, each once', all8);
		// a nudge inside the dead centre does nothing; holding it keeps walking; letting go stops
		v = await t.v();
		await flick(6, -5);
		A((await t.v()).turns === v.turns, 'a nudge at the centre does nothing');
		await stick(-55, 0); await sleep(1000); await stick(-55, 0, 'pointerup'); await sleep(350);
		w = await t.v();
		const after = w.turns; await sleep(600);
		A(w.turns - v.turns >= 3 && w.turns - v.turns <= 8 && (await t.v()).turns === after, 'held, it keeps stepping; let go, it stops', w.turns - v.turns);
		// sliding the thumb round changes the way without lifting
		v = await t.v();
		await stick(0, 55); await sleep(120); await stick(55, 0, 'pointermove'); await sleep(150); await stick(55, 0, 'pointerup'); await sleep(350);
		w = await t.v();
		A(w.turns === v.turns + 2, 'sliding the thumb to another side steps that way without lifting', w.turns - v.turns);
		// B held: the stick only turns
		v = await t.v();
		await press('mm-b', 200);
		A(/Turning/.test(await t.E(() => document.getElementById('hint').textContent)), 'B held: the hint says the stick now turns');
		await flick(0, 55);
		await release('mm-b'); await sleep(200);
		w = await t.v();
		A(w.turns === v.turns && w.x === v.x && w.y === v.y && w.dir !== v.dir, 'with B held the stick turns the leader and no turn passes', [v.dir, w.dir]);
		// A, WAIT
		await press('mm-a');
		A((await t.v()).turns === w.turns + 1, 'A: the Attack');
		await press('mm-wait');
		A((await t.v()).turns === w.turns + 2, 'WAIT');
		// MOVES: the stick moves the choice, A picks, then it aims, B backs out
		await press('mm-moves');
		let m = await t.menu();
		const f0 = await t.E(() => document.querySelector('#menu-items .is-focus').textContent);
		await flick(0, 55);
		const f1 = await t.E(() => document.querySelector('#menu-items .is-focus').textContent);
		A(!m.hidden && /Pikachu/.test(m.title) && f0 !== f1 && (await t.E(() => document.getElementById('mm-a').textContent)) === 'OK' && !(await t.E(() => document.getElementById('pt-mm').hidden)), 'MOVES: the menu; the stick moves the choice; A reads OK; the bar stays up', [f0, f1]);
		await flick(0, -55);
		await press('mm-a');
		let aim = await t.v();
		A(aim.aim && (await t.E(() => document.getElementById('mm-a').textContent)) === 'USE' && /stick: aim/.test(await t.E(() => document.getElementById('hint').textContent)), 'A picks the move: now it aims, and A reads USE');
		const c0 = aim.cursor;
		await flick(-55, 0);
		const c1 = (await t.v()).cursor;
		await press('mm-b');
		aim = await t.v();
		A((c1.x !== c0.x || c1.y !== c0.y) && !aim.aim && aim.turns === w.turns + 2, 'the stick moves the aim; B backs out and nothing was used');
		// MENU, BAG
		await press('mm-menu');
		A(/Wait a turn/.test((await t.menu()).items.join('|')), 'MENU: the field menu');
		await press('mm-b');
		A((await t.menu()).hidden, 'B closes a menu');
		await t.E(() => { window.__poketactica.mm.M.S.bag.push({ id: 'apple' }); });
		await press('mm-bag');
		A(/Bag 1\/20/.test((await t.menu()).title), 'BAG: the bag');
		await press('mm-menu');
		A((await t.menu()).hidden, 'MENU again closes whatever is open');
		// on the stairs A says so
		await t.E(() => { const T = window.__poketactica, S = T.mm.M.S, L = S.units.find((u) => u.uid === S.leader); T.__st = S.F.stairs; S.F.stairs = [L.x, L.y]; T.mm.act({ t: 'face', d: L.dir }); });
		A((await t.E(() => document.getElementById('mm-a').textContent)) === 'STAIRS', 'on the stairs A reads STAIRS');
		await t.E(() => { const T = window.__poketactica, S = T.mm.M.S, L = S.units.find((u) => u.uid === S.leader); S.F.stairs = [L.x + 4, L.y]; T.mm.act({ t: 'face', d: L.dir }); });
		// tapping the board still works
		await t.plaza(); await sleep(300);
		v = await t.v();
		await tapTile(v.x + 1, v.y);
		w = await t.v();
		A(w.x === v.x + 1 && w.y === v.y && w.turns === v.turns + 1, 'a tap on the board still steps there', [v.x, w.x]);
		// a replay has no pad
		const rec = await t.E(() => { const T = window.__poketactica; T.mm.act({ t: 'quit' }); return T.mm.recipe(); });
		A(await t.E(() => document.getElementById('mm-pad').hidden && !document.body.classList.contains('pt-mm-touch')), 'when the run is over the pad is put away');
		await t.E((rec) => { const T = window.__poketactica; document.getElementById('result').hidden = true; T.mm.watch(rec); }, rec);
		A(await t.E(() => document.getElementById('mm-pad').hidden && !!document.querySelector('#pt-mm [data-act="w-play"]')), 'a replay shows the viewer\'s buttons, not the pad');
		await t.E(() => { const T = window.__poketactica; T.mm.close(); });
		A(await t.start('phonetest2'), '(a new run for the picture)');
		await sleep(600);
		await t.shot('mm-phone');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
