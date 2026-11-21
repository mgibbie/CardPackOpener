// poketactica_page_test.mjs — Poketactica's page (stage 4): it boots on MicaSurvivor 3D's renderer with the Balatro HUD,
// and the whole game plays by keyboard, by controller and by touch (the house rules: Plans/NEW_GAME_RULES.md). The arrow
// keys move the cursor the way they point ON SCREEN (Disgaea's diamond: up = up-right), also after the camera turns; the
// whole board fits a phone upright and on its side; no page errors.
// Needs headless Chrome/Edge + overworld/data + micasurvivor/assets (the PMD sheets).
//   node overworld/tests/poketactica_page_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8933;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const BTN = { cancel: 0, confirm: 1, up: 12, down: 13, left: 14, right: 15 };

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

// a saved collection: three level-10 figurines (so a run starts at the team screen, not the starter pick)
const FIGS3 = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries(['pikachu', 'machamp', 'charmander'].map((sp, i) => [sp + '-seed' + i, { v: 1, id: sp + '-seed' + i, species: sp, level: 10, exp: 0, ability: null, shiny: false, pool: [{ id: sp === 'pikachu' ? 'thundershock' : sp === 'machamp' ? 'karatechop' : 'ember', lv: 1, xp: 0 }], equipped: [sp === 'pikachu' ? 'thundershock' : sp === 'machamp' ? 'karatechop' : 'ember'] }])) });
async function open(vp, figs = null) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.evaluateOnNewDocument((figs) => {
		try { localStorage.setItem('micatro_sfx', '0'); if (figs && !sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* ignore */ }
		const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
		window.__owFakePads = [pad]; window.__pad = pad;
	}, figs);
	await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
	await sleep(800);
	const t = { ctx, page, errors };
	t.key = async (k, ms = 140) => { await page.keyboard.press(k); await sleep(ms); };
	t.idle = () => page.evaluate(() => new Promise((r) => { const s = Date.now(); const k = () => (!window.__poketactica.P.busy || Date.now() - s > 20000 ? r() : setTimeout(k, 80)); k(); }));
	t.st = () => page.evaluate(() => { const P = window.__poketactica.P, S = P.S; return { base: { ...S.map.base }, phase: S.phase, turn: S.turn, mode: P.mode, cursor: { ...P.cursor }, units: S.units.map((u) => ({ uid: u.uid, side: u.side, x: u.x, y: u.y, hp: u.hp, moved: u.moved, acted: u.acted })), queue: S.queue.length, menu: P.menu ? P.menu.items.map((i) => i.label.replace(/<[^>]+>/g, '')) : null }; });
	t.tap = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(200); };
	return t;
}

try {
	// ---------- keyboard: deploy, move, attack, execute, end phase
	{
		const t = await open({ width: 1280, height: 760 });
		const p = t.page;
		A(await p.evaluate(() => window.__poketactica.ready && !!document.querySelector('#c')), 'the page boots (renderer, data, the battle)');
		A(await p.evaluate(() => getComputedStyle(document.getElementById('boot')).display === 'none'), 'the loading screen goes away');
		const sprites = await p.evaluate(() => new Promise((r) => setTimeout(() => r((window.__poketactica.P.drawn || []).length), 1500)));
		A(sprites >= 4, 'the wild Pokémon are drawn as sprites', sprites);
		// REGRESSION: the sprites' shader keeps its own fog (MicaSurvivor's 26-78 m); this camera is 60 m away, so left alone every
		// sprite came out 65% sky-blue. The page moves it off the board with render.js setFog.
		const fogNear = await p.evaluate(() => { for (const s of window.__poketactica.sheets.values()) if (s) return s.batch.material.uniforms.uFogNear.value; return null; });
		A(fogNear > 200, "the sprites are not fogged (their shader's fog starts beyond the board)", fogNear);
		// (stage 5) a new player first picks three starters, by keyboard, then starts a battle with them
		A(await p.evaluate(() => window.__poketactica.P.screen === 'camp' && /three starters/.test(document.getElementById('menu').dataset.title || '')), 'a new player is asked to pick three starters');
		await t.key('ArrowDown'); await t.key('KeyZ'); await t.key('ArrowDown'); await t.key('KeyZ'); await t.key('ArrowDown'); await t.key('KeyZ');
		await t.key('ArrowDown'); await t.key('KeyZ');   // a fourth is refused while three are picked
		const picked = await p.evaluate(() => window.__poketactica.P.pick.slice());
		A(picked.length === 3, 'three are picked (a fourth is refused)', picked);
		for (let i = 0; i < 4; i++) await t.key('ArrowUp');
		await t.key('KeyZ', 150);
		// REGRESSION: the kit's toast is drawn only with is-show; without it every toast stayed at opacity 0
		const toastSeen = await p.evaluate(() => { const el = document.getElementById('toast'); return !el.hidden && +getComputedStyle(el).opacity > 0.5 && /first figurines/.test(el.textContent); });
		A(toastSeen, 'a toast can be seen ("Your first figurines!")');
		await sleep(250);
		const col = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs).map((f) => f.species + ':' + f.level));
		A(col.length === 3 && col.every((x) => x.endsWith(':5')), 'they join the collection at level 5, kept on the device', col);
		A(await p.evaluate(() => /Your team/.test(document.getElementById('menu').dataset.title || '')), 'then the team screen');
		await t.key('KeyZ', 600);
		let s = await t.st();
		A(s.units.filter((u) => u.side === 'p').length === 3, 'Start battle: the three starters are the team', s.units.map((u) => u.uid));
		const base0 = await p.evaluate(() => ({ ...window.__poketactica.P.S.map.base, name: window.__poketactica.P.S.map.name }));
		A(base0.name === 'First Steps', 'a new player starts on the first campaign map', base0.name);
		A(s.cursor.x === base0.x && s.cursor.y === base0.y, 'the cursor starts on the base tile');
		const tip = await p.evaluate(() => { const el = document.getElementById('tip'); const r = el.getBoundingClientRect(); return { shown: !el.hidden, text: el.textContent, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 }; });
		A(tip.shown && /First Steps/.test(tip.text) && /Execute/.test(tip.text) && tip.inView, 'the map tip shows as it starts, on screen', tip);
		// the arrows point the way they move on screen (Disgaea's diamond): up = up-right, right = down-right
		const scr = (x, y) => p.evaluate((x, y) => window.__poketactica.screenOf(x, y), x, y);
		const dirOK = async (k, wantDx, wantDy) => { const a = await t.st(); const s0 = await scr(a.cursor.x, a.cursor.y); await t.key(k); const b = await t.st(); const s1 = await scr(b.cursor.x, b.cursor.y); return Math.sign(s1[0] - s0[0]) === wantDx && Math.sign(s1[1] - s0[1]) === wantDy; };
		await t.key('ArrowLeft'); await t.key('ArrowDown');   // (off the board's edge first)
		A(await p.evaluate(() => document.getElementById('tip').hidden), 'a key closes the tip');
		A(await dirOK('ArrowUp', 1, -1) && await dirOK('ArrowRight', 1, 1) && await dirOK('ArrowDown', -1, 1) && await dirOK('ArrowLeft', -1, -1), 'the arrows move the cursor the way they point on screen');
		await t.key('KeyE', 300);
		A(await dirOK('ArrowUp', 1, -1) && await dirOK('ArrowRight', 1, 1), '... and still do after E turns the camera');
		await t.key('KeyQ', 300);
		await p.evaluate(() => { const P = window.__poketactica.P; P.cursor = { ...P.S.map.base }; });
		await t.key('KeyZ', 400); await t.idle();
		s = await t.st();
		const p0 = s.units.find((u) => u.uid === 'p0');
		A(p0.x === base0.x && p0.y === base0.y, 'Z on the empty base deploys a figurine');
		await t.key('KeyZ');
		s = await t.st();
		A(s.mode === 'unit' && s.menu && s.menu.includes('Move') && s.menu.includes('Attack'), 'Z on it opens its menu', JSON.stringify(s.menu));
		await t.key('KeyZ');   // Move
		const before = (await t.st()).cursor;
		// walk the cursor to a reachable tile and confirm
		const goal = await p.evaluate(() => { const P = window.__poketactica.P; const t = P.hl.move.filter(([x, y]) => x !== 1 || y !== 8)[0]; return t; });
		await p.evaluate((g) => { window.__poketactica.P.cursor = { x: g[0], y: g[1] }; }, goal);
		await t.key('KeyZ', 300); await t.idle();
		s = await t.st();
		const moved = s.units.find((u) => u.uid === 'p0');
		A(moved.x === goal[0] && moved.y === goal[1] && moved.moved, 'Move, then Z on a highlighted tile moves it', JSON.stringify([before, goal, moved]));
		await t.key('KeyX', 200); await t.key('KeyX', 200);
		// End the phase by keyboard: Enter -> End phase
		await t.key('Enter');
		s = await t.st();
		A(s.menu && s.menu.includes('End phase'), 'Enter opens the phase menu', JSON.stringify(s.menu));
		await t.key('ArrowDown'); await t.key('KeyZ', 400); await t.idle();
		s = await t.st();
		A(s.turn === 2 && s.phase === 'player', 'End phase plays the enemy phase; it is turn 2', JSON.stringify([s.turn, s.phase]));
		// the battle's results reach the collection: end it as won with EXP owed to the first figurine, open the results
		const before5 = await p.evaluate(() => { const P = window.__poketactica.P; const id = P.teamMap.p0; return JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs[id].level; });
		await p.evaluate(() => { const S = window.__poketactica.P.S; S.over = 'won'; S.phase = 'won'; S.exp = { p0: 90000 }; });
		await t.key('KeyZ', 500);
		const after5 = await p.evaluate(() => { const P = window.__poketactica.P; const id = P.teamMap.p0; return { lv: JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs[id].level, shown: !document.getElementById('result').hidden, text: document.getElementById('r-body').innerText }; });
		A(after5.shown && after5.lv > before5 && /Lv \d+ → \d+/.test(after5.text), "a finished battle's EXP grows the figurine in the saved collection, and the results say so", JSON.stringify([before5, after5.lv]));
		A(/First clear of First Steps/.test(after5.text), 'the first clear of a campaign map says so on the results', after5.text);
		const saved5 = await p.evaluate(() => JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).cleared || []);
		A(saved5.includes('c1-1'), 'the cleared map is kept in the saved collection', saved5);
		await t.key('KeyZ', 400);
		A(await p.evaluate(() => window.__poketactica.P.screen === 'camp'), 'Z on the results goes back to camp');
		A(await p.evaluate(() => /Start: Combo Field/.test(document.querySelector('#menu [data-i="0"]').textContent)), 'camp now offers the next map');
		// the map list, by keyboard: the next map open, the one after shut; X goes back; Training Grounds can be picked
		await t.key('ArrowDown'); await t.key('KeyZ', 300);
		const ml = await p.evaluate(() => ({ title: document.getElementById('menu').dataset.title, b: [...document.querySelectorAll('#menu button')].map((b) => [b.textContent, b.disabled]) }));
		A(/Choose a map/.test(ml.title) && ml.b.length === 11 && /First Steps/.test(ml.b[0][0]) && ml.b[0][0].startsWith('✓') && !ml.b[1][1] && ml.b[2][1], 'the map list: the cleared map ticked, the next open, the one after shut', ml);
		await t.key('KeyX', 300);
		A(await p.evaluate(() => /Your team/.test(document.getElementById('menu').dataset.title || '')), 'X goes back to the team screen');
		await t.key('ArrowDown'); await t.key('KeyZ', 300); await t.key('ArrowUp'); await t.key('ArrowUp'); await t.key('KeyZ', 300);   // (the list opens on the chosen map, the second; up twice wraps to the last: Training Grounds)
		A(await p.evaluate(() => /Start: Training Grounds/.test(document.querySelector('#menu [data-i="0"]').textContent)), 'Training Grounds can be picked from the list');
		await t.key('KeyZ', 600);
		A(await p.evaluate(() => window.__poketactica.P.S.map.name === 'Training Grounds'), '... and plays');
		A(t.errors.length === 0, 'no page errors (keyboard run)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- controller only
	{
		const t = await open({ width: 1280, height: 760 }, FIGS3);
		A(await t.page.evaluate(() => /Your team/.test(document.getElementById('menu').dataset.title || '')), 'controller: a player with figurines starts at the team screen');
		await t.tap(BTN.confirm); await sleep(600);
		A((await t.st()).units.filter((u) => u.side === 'p').length === 3, 'controller: A starts the battle with the saved team');
		await t.tap(BTN.confirm); await t.idle();
		let s = await t.st();
		A(s.units.find((u) => u.uid === 'p0').x === s.base.x, 'controller: A on the base deploys');
		await t.tap(BTN.confirm);
		s = await t.st();
		A(s.mode === 'unit', 'controller: A opens the unit menu');
		await t.tap(BTN.down);
		A((await t.page.evaluate(() => window.__poketactica.P.menu.i)) === 1, 'controller: the d-pad moves through the menu');
		await t.tap(BTN.cancel);
		s = await t.st();
		A(s.mode === 'idle' && !s.menu, 'controller: B backs out');
		const c0 = s.cursor; await t.tap(BTN.up); s = await t.st();
		A(s.cursor.x !== c0.x || s.cursor.y !== c0.y, 'controller: the d-pad moves the cursor');
		A(t.errors.length === 0, 'no page errors (controller run)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- touch, both orientations: tap the base twice to deploy; the whole board fits
	for (const [name, vp] of [['portrait', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['landscape', { width: 844, height: 390, isMobile: true, hasTouch: true }]]) {
		const t = await open(vp, FIGS3);
		const p = t.page;
		const sb = await p.evaluate(() => { const b = document.querySelector('#menu [data-i="0"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
		await p.touchscreen.tap(sb[0], sb[1]); await sleep(700);
		A((await t.st()).units.filter((u) => u.side === 'p').length === 3, `${name}: tapping Start battle starts it`);
		const fits = await p.evaluate(() => { const S = window.__poketactica.P.S; let ok = true; for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) { if (S.map.height[y * S.map.w + x] == null) continue; const [sx, sy] = window.__poketactica.screenOf(x, y); if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) ok = false; } return ok; });
		A(fits, `${name}: the whole board is on screen`);
		const [bx, by] = await p.evaluate(() => { const b = window.__poketactica.P.S.map.base; return window.__poketactica.screenOf(b.x, b.y); });
		await p.touchscreen.tap(bx, by); await sleep(250); await p.touchscreen.tap(bx, by); await sleep(500);
		await t.idle();
		const s = await t.st();
		A(s.units.find((u) => u.uid === 'p0').x === s.base.x, `${name}: tapping the base tile twice deploys`);
		const btn = await p.evaluate(() => { const b = document.getElementById('b-end').getBoundingClientRect(); return b.width > 0 && b.bottom <= innerHeight && b.right <= innerWidth; });
		A(btn, `${name}: the End phase button is on screen`);
		A(t.errors.length === 0, `no page errors (${name})`, t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
