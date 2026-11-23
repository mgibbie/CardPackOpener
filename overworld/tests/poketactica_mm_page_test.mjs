// poketactica_mm_page_test.mjs — MYSTERY MAZE on the page (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 7): the board
// drawn from what is explored, the bar (floor, belly, purse, bag, party), the minimap, stepping (two arrows: a diagonal),
// turning on the spot, the Attack, the moves menu and aiming, the bag, the field menu, the stairs, a figurine lost for
// good, giving up; by keyboard, controller and touch, on a desktop and a phone. And the camp's screens (stage 8): the
// dungeon list, the party, packing from the storage and stars to carry, and what a cleared dungeon pays.
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
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* storage */ }
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
		// V: the bag
		await t.key('KeyV', 300);
		A((await t.menu()).hidden, 'V with an empty bag opens nothing');
		await t.E(() => { const S = window.__poketactica.mm.M.S; S.bag.push({ id: 'apple' }, { id: 'ironthorn', n: 3 }); S.belly = 500; });
		await t.key('KeyV', 400);
		m = await t.menu();
		A(/Bag 2\/20/.test(m.title) && m.items.some((x) => /Apple/.test(x)) && m.items.some((x) => /Iron Thorn x3/.test(x)), 'V: the bag', m);
		await t.menuTo(/Apple/);
		m = await t.menu();
		A(/Apple/.test(m.title) && /Fills the belly/.test(m.title) && m.items.some((x) => /^Eat/.test(x)) && m.items.some((x) => /^Throw/.test(x)), 'an item: what it does, and Eat / Throw', m);
		await t.menuTo(/^Eat/);
		a = await t.v();
		A(a.belly === 999 && a.bag === 1 && /🍎 100/.test(await t.bar()), 'eating the Apple fills the belly', a.belly);
		// Enter: the field menu
		await t.key('Enter', 400);
		m = await t.menu();
		A(/Whisper Woods · B1F/.test(m.title) && m.items.some((x) => /Wait a turn/.test(x)) && m.items.some((x) => /Tactics/.test(x)) && m.items.some((x) => /Give up/.test(x)), 'Enter: the menu (wait, tactics, give up)', m);
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
		A(/Give up\?/.test(m.title), 'Give up asks first', m);
		await t.key('KeyZ', 600);
		const res = await t.E(() => ({ hidden: document.getElementById('result').hidden, title: document.getElementById('r-title').textContent, body: document.getElementById('r-body').textContent }));
		A(!res.hidden && res.title === 'Gave up' && /Whisper Woods/.test(res.body) && /B2F/.test(res.body) && /lost/.test(res.body) && /Gone for good: Pikachu/.test(res.body), 'the result: gave up on B2F, everything found lost, Pikachu named', res);
		await t.shot('mm-desktop-result');
		await t.key('KeyZ', 700);
		A(await t.E(() => window.__poketactica.P.screen === 'camp' && document.getElementById('pt-mm').hidden && !document.body.classList.contains('pt-mming')), 'Z: back to the camp, the maze\'s bar put away');
		A(!t.errors.length, 'no page errors (desktop)', t.errors.slice(0, 3));
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
		A((await t.E(() => window.__poketactica.hub.H.screen)) === 'mm-pack' && ls.some((x) => /Stars to carry/.test(x) && /0 ★/.test(x)) && ls.some((x) => /Oran Berry/.test(x) && /have 2/.test(x)) && ls.some((x) => /Iron Thorn/.test(x)), 'the pack screen: stars to carry and what the storage holds', ls);
		await to(/Stars to carry/); await t.key('KeyZ', 250);
		await to(/Oran Berry/); await t.key('KeyZ', 250); await t.key('KeyZ', 250); await t.key('KeyZ', 250);
		await to(/Iron Thorn/, 'ArrowUp'); await t.key('KeyZ', 250); await t.key('KeyZ', 250);
		await to(/Apple/, 'ArrowUp'); await t.key('KeyZ', 250); await t.key('KeyC', 250);
		ls = await labels();
		A(ls.some((x) => /Stars to carry/.test(x) && /100 ★/.test(x)) && ls.some((x) => /Oran Berry/.test(x) && /taking 2/.test(x)) && ls.some((x) => /Iron Thorn/.test(x) && /taking 2/.test(x)) && ls.some((x) => /Apple/.test(x) && !/taking/.test(x)) && ls.some((x) => /Enter!/.test(x) && /4\/20 items · 100 ★/.test(x)), 'Z takes one (never more than you have), C puts one back; the stars step up', ls);
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
		A(!res.hidden && res.title === 'Dungeon cleared!' && /\+310 ★ banked/.test(res.body) && /first clear: 150 ★/.test(res.body) && /Into storage/.test(res.body) && /Sitrus Berry/.test(res.body) && /New record/.test(res.body), 'the result: cleared, 310 stars banked (the purse of 160 and the first-clear 150), what went into storage', res.body);
		A(res.wallet === res.w0 + 210 && res.mm.clear['whisper-woods'] === 1 && res.mm.best['whisper-woods'] === 5 && JSON.stringify(res.store) === JSON.stringify({ apple: 1, oran: 2, ironthorn: 2, sitrus: 1 }) && res.lv === 5000, 'the wallet, the record, the storage and the leader\'s EXP all show it', [res.wallet - res.w0, res.store, res.lv]);
		await t.key('KeyZ', 600);
		await t.E(() => window.__poketactica.hub.mmDungeons());
		ls = await labels();
		A(ls.some((x) => /Whisper Woods/.test(x) && /cleared/.test(x)) && ls.some((x) => /Pebble Hollow/.test(x) && !/🔒/.test(x)) && ls.some((x) => /Storage 6\/200/.test(x)), 'back in the camp: Whisper Woods is cleared and Pebble Hollow is open', ls.slice(0, 4));
		await t.E(() => window.__poketactica.hub.mmStorage());
		ls = await labels();
		A((await t.E(() => window.__poketactica.hub.H.screen)) === 'mm-storage' && ls.some((x) => /Oran Berry/.test(x) && /×2/.test(x)) && ls.some((x) => /Sitrus Berry/.test(x)), 'the storage screen lists it', ls);
		await t.shot('mm-storage');
		A(!t.errors.length, 'no page errors (the camp)', t.errors.slice(0, 3));
	}

	// ---------- touch, on a phone
	{
		const t = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		A(await t.start('phonetest'), 'a run opens on a phone');
		await t.plaza();
		await sleep(400);
		const tapTile = async (x, y, ms = 500) => { const p = await t.E((x, y) => window.__poketactica.screenOf(x, y), x, y); await t.page.touchscreen.tap(p[0], p[1]); await sleep(ms); };
		const tapEl = async (sel) => { const r = await t.E((sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.left, b.right]; }, sel); if (!r) return false; await t.page.touchscreen.tap(r[0], r[1]); await sleep(450); return r; };
		const box = await t.E(() => { const b = document.getElementById('pt-mm').getBoundingClientRect(); return [b.left, b.right, b.top, b.bottom, innerWidth, innerHeight]; });
		A(box[0] >= 0 && box[1] <= box[4] + 1 && box[3] <= box[5] + 1 && box[2] > box[5] * 0.45, 'the bar fits the phone, in the lower half', box);
		let v = await t.v();
		await tapTile(v.x + 1, v.y);
		let w = await t.v();
		A(w.x === v.x + 1 && w.y === v.y && w.turns === v.turns + 1, 'a tap on the next tile: a step', [v.x, w.x]);
		await tapTile(w.x - 3, w.y + 3, 1600);
		let far = await t.v();
		A(far.x === w.x - 3 && far.y === w.y + 3 && far.turns === w.turns + 3, 'a tap further off: it walks there, a turn a step', [far.x - w.x, far.y - w.y, far.turns - w.turns]);
		const t0 = far.turns;
		A(await tapEl('#pt-mm [data-act="wait"]') && (await t.v()).turns === t0 + 1, 'the Wait button');
		await tapEl('#pt-mm [data-act="moves"]');
		A(!(await t.menu()).hidden && /Pikachu/.test((await t.menu()).title), 'the Moves button');
		await tapTile(far.x, far.y - 2);
		A((await t.menu()).hidden, 'a tap on the board closes a menu');
		await tapEl('#pt-mm [data-act="attack"]');
		A((await t.v()).turns === t0 + 2, 'the Attack button');
		await tapTile(far.x, far.y);
		A(/Wait a turn/.test((await t.menu()).items.join('|')), 'a tap on yourself: the menu');
		await t.shot('mm-phone');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
