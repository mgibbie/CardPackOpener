// poketactica_maze_page_test.mjs — Tower Defense, MAZE BUILDER on the page, stage 4 (owner, 2026-11-24;
// Plans/POKETACTICA_MAZE_BUILDER_PLAN.md): the Road / Maze Builder choice in the hub; the bar (gold, the way's length,
// the hand of block cards); choosing a card, turning it, the ghost and its TWO-STEP drop (put it, then lay it); taking a
// block back; a figurine on a block for gold; calling the wave; the reward pick. By keyboard, controller and touch, on
// a desktop and a phone.
//   node overworld/tests/poketactica_maze_page_test.mjs [--shots=<dir>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8973;
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
const mk = (sp, lv, moves) => ({ v: 1, id: sp + '-tdp', species: sp, level: lv, exp: 0, ability: null, shiny: false, pool: moves.map((id) => ({ id, lv: 1, xp: 0 })), equipped: moves });
const FIGS = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries([mk('pikachu', 40, ['thunderbolt', 'quickattack']), mk('charizard', 40, ['flamethrower', 'protect']), mk('machamp', 40, ['karatechop']), mk('blastoise', 40, ['surf'])].map((f) => [f.id, f])) });
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument((figs) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_tdcoach_v1', 'done'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* */ }
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
			window.__owFakePads = [pad]; window.__pad = pad;
		}, FIGS);
		await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now(); while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
		await sleep(500);
		const t = { page, errors };
		t.key = async (k, ms = 200) => { await page.keyboard.press(k); await sleep(ms); };
		t.pad = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(160); };
		t.E = (fn, ...a) => page.evaluate(fn, ...a);
		t.start = (map, seed) => t.E((map, seed) => { const T = window.__poketactica; T.hub.close(); return T.td.open(map, ['pikachu-tdp', 'charizard-tdp', 'machamp-tdp', 'blastoise-tdp'].map((id) => T.P.col.figs[id]), { seed }); }, map, seed);
		t.v = () => t.E(() => { const T = window.__poketactica, v = T.td.view(); return { tick: v.tick, wave: v.wave, phase: v.phase, lives: v.lives, energy: v.energy, slots: v.slots, towers: v.towers.map((x) => ({ uid: x.uid, sp: x.species, x: x.x, y: x.y, rule: x.rule, off: x.off })), enemies: v.enemies.length, kills: v.kills, over: v.over, paused: T.td.T.paused, speed: T.td.T.speed, menu: !!T.P.menu, screen: T.P.screen, cursor: { ...T.P.cursor } }; });
		t.menu = () => t.E(() => ({ title: document.getElementById('menu-title').textContent, items: [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), hidden: document.getElementById('menu').hidden }));
		t.menuTo = async (re) => { for (let i = 0; i < 20; i++) { const f = await t.E(() => { const b = document.querySelector('#menu-items .is-focus'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : ''; }); if (re.test(f)) { await t.key('KeyZ', 300); return true; } await t.key('ArrowDown', 70); } return false; };
		t.shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
		return t;
	};


	const mz = (t) => t.E(() => { const T = window.__poketactica, v = T.td.view(), X = T.td.T; return { mode: v.mode, gold: v.gold, hand: v.hand.map((c) => c.id), blocks: v.blocks.map((b) => ({ id: b.id, cells: b.cells, locked: b.locked })), way: v.ways.map((p) => p.length - 1), pick: v.pick ? v.pick.pick : 0, card: X.card, turns: X.turns, pin: X.pin, phase: v.phase, wave: v.wave, cleared: v.cleared, towers: v.towers.length, lives: v.lives, over: v.over, cursor: T.P.cursor, extra: (T.P.hl.extra || []).length }; });
	const bar = (t) => t.E(() => ({ gold: (document.getElementById('td-gold') || {}).textContent || '', way: (document.getElementById('td-way') || {}).textContent || '', energy: !!document.getElementById('td-energy'), cards: document.querySelectorAll('#td-hand .pt-mz-card').length, on: document.querySelectorAll('#td-hand .pt-mz-card[aria-pressed="true"]').length, text: document.getElementById('pt-td').textContent.replace(/\s+/g, ' '), hint: document.getElementById('hint').textContent.replace(/\s+/g, ' ') }));
	const cur = (t, x, y) => t.E((x, y) => { const T = window.__poketactica; T.P.cursor = { x, y }; T.td.T.pin = null; }, x, y);
	// a spot where any shape may lie whichever way it is turned: clear of the gate, the base, the rocks and the board's edge
	const SPOT = [5, 0];

	// ---------- the hub: Road or Maze Builder
	{
		const t = await open({ width: 1280, height: 800 });
		const hub = () => t.E(() => ({ title: (document.querySelector('.ph-head .bal-h2') || {}).textContent || '', rows: [...document.querySelectorAll('.ph-list .ph-row')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()) }));
		const click = (re) => t.E((src) => { const re = new RegExp(src); const b = [...document.querySelectorAll('.bal-btn')].find((x) => re.test(x.textContent)); if (b) b.click(); return !!b; }, re.source);
		A(await click(/Tower Defense/), 'the hub has Tower Defense'); await sleep(400);
		let h = await hub();
		A(h.rows.length === 2 && /Road/.test(h.rows[0]) && /Maze Builder/.test(h.rows[1]), 'Tower Defense asks: Road or Maze Builder', h);
		await t.key('ArrowDown'); await t.key('KeyZ', 500);
		h = await hub();
		A(h.title === 'Maze Builder' && h.rows.length === 3 && /Open Field/.test(h.rows[0]) && /Pincer.*2 gates/.test(h.rows[1]), 'Maze Builder lists its three maps', h);
		await t.key('KeyX', 400);
		A((await hub()).rows.length === 2, 'X: back to the choice');
		await t.key('ArrowUp'); await t.key('KeyZ', 500);
		h = await hub();
		A(h.title === 'Road' && h.rows.length === 3 && /Meadow Loop/.test(h.rows[0]), 'Road lists the road maps', h);
		A(!t.errors.length, 'no page errors (hub)', t.errors.slice(0, 3));
		await t.page.close();
	}

	// ---------- keyboard, then controller, desktop
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.start('mz-field', 'mazepage'), 'a run opens on Open Field');
		let v = await mz(t), b = await bar(t);
		A(v.mode === 'maze' && v.gold === 60 && v.hand.length === 5 && v.way[0] === 11 && v.phase === 'wait', 'a Maze Builder run: 60 gold, 5 cards, the way 11 steps', v);
		A(/60/.test(b.gold) && /Way 11/.test(b.way) && !b.energy && b.cards === 5 && b.on === 0 && /when you call it/.test(b.text), 'the bar: gold (no energy), the way\'s length, the hand, and no clock', b);
		A(v.extra >= 11, 'the way is drawn on the board', v.extra);
		await sleep(2500);
		A((await mz(t)).phase === 'wait' && (await mz(t)).wave === 0, 'nothing starts by itself');
		// V chooses a card; the ghost follows the cursor
		await cur(t, ...SPOT);
		await t.key('KeyV');
		v = await mz(t); b = await bar(t);
		A(v.card === v.hand[0] && b.on === 1 && /Z: put it here/.test(b.hint) && /Way 11/.test(b.hint), 'V: the first card is chosen; the hint says what it would do to the way', b.hint);
		await t.key('KeyC');
		A((await mz(t)).turns === 1, 'C turns it');
		await t.key('KeyC'); await t.key('KeyC'); await t.key('KeyC');
		A((await mz(t)).turns === 0, 'four turns: as it was');
		// the two-step drop
		await t.key('KeyZ');
		v = await mz(t);
		A(v.blocks.length === 0 && v.pin && v.pin.x === SPOT[0] && /Z again: lay it/.test((await bar(t)).hint), 'Z puts the ghost: nothing is laid yet', v.pin);
		await t.key('KeyX');
		A((await mz(t)).pin === null && (await mz(t)).card, 'X lets go of the ghost (the card is still chosen)');
		await t.key('KeyZ'); await t.key('KeyZ', 500);
		v = await mz(t);
		A(v.blocks.length === 1 && v.hand.length === 4 && v.card === null && !v.blocks[0].locked, 'Z, Z: the block is laid, its card played', v);
		// a block where it may not go: on the gate
		await t.E(() => { window.__poketactica.td.T.S.hand.push({ id: 'tOne', shape: 'one' }); });
		const choose = async (id) => { for (let i = 0; i < 14 && (await mz(t)).card !== id; i++) await t.key('KeyV', 120); };
		await cur(t, 0, 4); await choose('tOne'); await t.key('KeyZ', 400);
		v = await mz(t);
		A(v.pin === null && v.blocks.length === 1 && /gate/i.test((await bar(t)).hint), 'on the gate the ghost is red and Z does nothing', (await bar(t)).hint);
		await t.key('KeyX');
		A((await mz(t)).card === null, 'X puts the card away');
		// take it back
		const c0 = v.blocks[0].cells[0];
		await cur(t, c0[0], c0[1]); await t.key('KeyX', 500);
		v = await mz(t);
		A(v.blocks.length === 0 && v.hand.length === 6, 'X on a block laid this round takes it back', v);
		// across the way, so the way bends: a wall from the top, the first card stood wherever it fits
		await t.E(() => { const T = window.__poketactica, S = T.td.T.S; S.hand.push({ id: 'tI', shape: 'I' }, { id: 'tI2', shape: 'I' }); });
		await cur(t, 4, 1);
		await choose('tI');
		await t.key('KeyC'); await t.key('KeyZ');
		A(/Way 11 → 13/.test((await bar(t)).hint), 'the hint: Way 11 → 13', (await bar(t)).hint);
		await t.key('KeyZ', 500);
		v = await mz(t);
		A(v.blocks.length === 1 && v.way[0] === 13 && /Way 13/.test((await bar(t)).way), 'laid: the way is 13 now', v.way);
		// a figurine on the block, for gold
		await cur(t, 4, 3); await t.key('KeyZ', 400);
		let m = await t.menu();
		A(!m.hidden && /Place here · 20/.test(m.title) && m.items.some((x) => /Pikachu/.test(x)) && m.items.some((x) => /Take this block back/.test(x)), 'Z on a block: the squad (20 gold), or take the block back', m);
		A(await t.menuTo(/Pikachu/), 'Pikachu');
		v = await mz(t);
		A(v.towers === 1 && v.gold === 40 && /40/.test((await bar(t)).gold), 'Pikachu stands on the block: 20 gold spent', v);
		await cur(t, 6, 6); await t.key('KeyZ', 400);
		A((await t.menu()).hidden && (await mz(t)).towers === 1, 'Z on bare ground places nothing');
		await t.shot('maze-build');

		// (buttons as site/gamepad.js maps them in the owner's layout: 1 confirm, 0 cancel, 2 the V button, 3 the C button, 9 Start)
		// ---- the controller: Y the next card, X turns, A puts and lays, B back, Start the field menu
		await cur(t, 8, 1);
		await t.pad(2);
		v = await mz(t);
		A(v.card === v.hand[0], 'pad Y: the first card');
		await t.pad(3);
		A((await mz(t)).turns === 1, 'pad X turns it');
		await t.pad(1);
		A(!!(await mz(t)).pin && (await mz(t)).blocks.length === 1, 'pad A puts the ghost');
		await t.pad(0);
		A((await mz(t)).pin === null, 'pad B lets go');
		await t.pad(1); await t.pad(1); await sleep(300);
		A((await mz(t)).blocks.length === 2, 'pad A, A lays it');
		await t.pad(9); await sleep(300);
		m = await t.menu();
		A(!m.hidden && /Building/.test(m.title) && /Call wave 1/.test(m.items[0]) && m.items.some((x) => /Draw a card/.test(x)), 'Start: the field menu, the wave first', m);
		await t.pad(1); await sleep(600);
		v = await mz(t);
		A(v.phase === 'wave' || v.wave === 1, 'A: wave 1 is called', v);
		A(v.blocks.every((b) => b.locked) && (await bar(t)).cards === 0, 'the blocks are locked, and the hand is put away for the wave');
		// through the wave, fast
		await t.E(() => { window.__poketactica.td.T.speed = 3; });
		const t0 = Date.now(); while (Date.now() - t0 < 120000) { v = await mz(t); if (v.cleared >= 1 || v.over) break; await sleep(500); }
		A(v.cleared === 1 && !v.over, 'wave 1 is cleared', v);
		await sleep(500);
		m = await t.menu(); v = await mz(t);
		A(!m.hidden && /Wave 1 cleared · pick a reward/.test(m.title) && m.items.length === 4 && v.pick === 1 && v.gold > 40, 'the rewards are offered (3, and "decide later"), and the wave paid gold', m);
		await t.shot('maze-reward');
		await t.key('KeyX', 400);
		A((await t.menu()).hidden && /Reward/.test((await bar(t)).text), 'put off: the bar keeps a Reward button');
		await t.key('Enter', 400); await t.key('KeyZ', 500);
		m = await t.menu();
		A(/pick a reward/.test(m.title) && (await mz(t)).phase === 'wait', 'the next wave waits: calling it asks for the pick again', m);
		const cardsAt = m.items.findIndex((x) => /Two plain blocks/.test(x)), h0 = (await mz(t)).hand.length, g0 = (await mz(t)).gold;
		if (cardsAt >= 0) {
			for (let i = 0; i < cardsAt; i++) await t.key('ArrowDown', 80);
			await t.key('KeyZ', 400); A(/first block/.test((await t.menu()).title), 'two plain blocks: the first shape'); await t.key('KeyZ', 400); A(/second block/.test((await t.menu()).title), 'the second'); await t.key('KeyZ', 500);
			A((await mz(t)).hand.length === h0 + 2, 'both are in the hand');
		} else { await t.key('KeyZ', 500); v = await mz(t); A(v.hand.length === h0 + 1 || v.gold > g0 || v.lives === 20, 'the first reward is taken', v); }
		v = await mz(t);
		A(v.pick === 0 && (await t.menu()).hidden && !/Reward/.test((await bar(t)).text), 'picked: the menu closes and the button is gone');
		// a locked block: Lift
		await cur(t, 4, 1); await t.key('KeyX', 300);
		A((await mz(t)).blocks.length === 2, 'X does not take back a locked block');
		await cur(t, 4, 2); await t.key('KeyZ', 400);
		m = await t.menu();
		A(m.items.some((x) => /Lift this block.*15/.test(x)), 'Z on it offers Lift (15 gold)', m);
		await t.key('KeyX', 300);
		A(!t.errors.length, 'no page errors (desktop)', t.errors.slice(0, 3));
		await t.page.close();
	}

	// ---------- touch, a phone
	{
		const t = await open({ width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
		await t.start('mz-pincer', 'mazetouch');
		await sleep(600);
		const tapTile = async (x, y) => { const p = await t.E((x, y) => window.__poketactica.screenOf(x, y), x, y); await t.page.touchscreen.tap(p[0], p[1]); await sleep(450); };
		const tapEl = async (sel, re) => { const r = await t.E((sel, src) => { const re = src ? new RegExp(src) : null; const el = [...document.querySelectorAll(sel)].find((b) => !re || re.test(b.textContent)); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel, re ? re.source : null); if (r) { await t.page.touchscreen.tap(r[0], r[1]); await sleep(450); } return !!r; };
		let v = await mz(t);
		A(v.mode === 'maze' && v.way.length === 2 && v.way[0] === 6 && v.way[1] === 6, 'Pincer: two gates, a way each', v.way);
		const box = await t.E(() => { const r = document.getElementById('pt-td').getBoundingClientRect(); return [r.left, r.right, r.bottom, innerWidth]; });
		A(box[0] >= 0 && box[1] <= box[3] + 1, 'the bar and the hand fit a phone\'s width', box);
		A(await tapEl('#td-hand .pt-mz-card'), 'a tap on a card');
		v = await mz(t);
		A(v.card === v.hand[0] && (await bar(t)).on === 1 && /Turn/.test((await bar(t)).text), 'it is chosen: Turn, Put it and Discard appear');
		A(await tapEl('#td-hand [data-act="turn"]') && (await mz(t)).turns === 1, 'the Turn button turns it');
		await tapTile(9, 8);
		v = await mz(t);
		A(v.pin && v.pin.x === 9 && v.pin.y === 8 && v.blocks.length === 0 && /Lay it/.test((await bar(t)).text), 'a tap on a tile puts the ghost there: nothing is laid, the button says Lay it', v.pin);
		await tapTile(2, 8);
		v = await mz(t);
		A(v.pin && v.pin.x === 2 && v.blocks.length === 0, 'a tap elsewhere moves the ghost');
		A(await tapEl('#td-hand [data-act="lay"]'), 'the Lay it button');
		v = await mz(t);
		A(v.blocks.length === 1 && v.hand.length === 4 && v.card === null, 'the block is laid');
		await tapEl('#td-hand .pt-mz-card'); await tapTile(9, 1); await tapTile(9, 1);
		A((await mz(t)).blocks.length === 2, 'or: tap the same tile again to lay it');
		const g0 = (await mz(t)).gold;
		await tapEl('#td-hand .pt-mz-card'); A(await tapEl('#td-hand [data-act="discard"]') && (await mz(t)).gold === g0 + 2 && (await mz(t)).hand.length === 2, 'Discard: 2 gold for the card');
		A(await tapEl('#td-hand [data-act="draw"]') && (await mz(t)).gold === g0 + 2 - 5 && (await mz(t)).hand.length === 3, 'Draw: a card for 5 gold');
		const c = (await mz(t)).blocks[0].cells[0];
		await tapTile(c[0], c[1]);
		let m = await t.menu();
		A(!m.hidden && /Place here/.test(m.title), 'a tap on a block: the squad', m);
		A(await tapEl('#menu-items .bal-btn', /Blastoise/) && (await mz(t)).towers === 1, 'Blastoise stands on it');
		A(await tapEl('#pt-td [data-act="wave"]'), 'the Wave! button');
		await sleep(800);
		v = await mz(t);
		A(v.wave === 1 && v.blocks.every((b) => b.locked), 'wave 1 is called; the blocks lock', v);
		await t.shot('maze-phone');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
