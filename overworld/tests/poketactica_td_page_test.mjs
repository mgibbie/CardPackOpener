// poketactica_td_page_test.mjs — TOWER DEFENSE on the page (owner, 2026-11-23): the board, the bar (wave, lives, energy,
// slots), placing a figurine on a free tile, a tower's orders, pause (every menu pauses) and speed, calling a wave,
// towers firing at enemies walking the road, the end of a run; by keyboard, controller and touch, on a desktop and a phone.
//   node overworld/tests/poketactica_td_page_test.mjs [--shots=<dir>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8967;
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

	// ---------- keyboard + controller, desktop
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.start('td-loop', 'pagetest'), 'a run opens on Meadow Loop');
		let v = await t.v();
		const bar = await t.E(() => document.getElementById('pt-td').textContent.replace(/\s+/g, ' '));
		A(v.screen === 'td' && /Next: wave 1/.test(bar) && /♥ 20/.test(bar) && /0\/3 towers/.test(bar), 'the bar: the next wave, 20 lives, 0 of 3 towers', bar);
		A(await t.E(() => getComputedStyle(document.getElementById('b-exec')).display === 'none' && getComputedStyle(document.getElementById('hud-top')).display === 'none'), 'the battle\'s own HUD (Execute, the turn) is out of the way');
		// Z on the free tile under the cursor: the squad to place (and the game pauses)
		await t.key('KeyZ', 400);
		let m = await t.menu();
		const tick0 = (await t.v()).tick;
		A(!m.hidden && /Place here/.test(m.title) && m.items.some((x) => /Pikachu/.test(x) && /Lv 40/.test(x)) && m.items.length === 5, 'Z on a free tile: the squad to place there (4 figurines and Cancel)', m);
		await sleep(600);
		A((await t.v()).tick === tick0, 'a menu pauses the game');
		await t.key('KeyZ', 400);
		v = await t.v();
		A(v.towers.length === 1 && v.towers[0].sp === 'pikachu' && v.towers[0].x === v.cursor.x && v.towers[0].y === v.cursor.y && !v.menu, 'Z: Pikachu stands on that tile', v.towers);
		const say = await t.E(() => document.getElementById('hint').textContent.replace(/\s+/g, ' '));
		A(/Pikachu Lv 40/.test(say) && /SP \d+\/\d+/.test(say) && /Thunderbolt \d+\.\ds/.test(say) && /Quick Attack \d+\.\ds/.test(say) && /its orders/.test(say), 'with the cursor on a tower the hint says who it is: level, SP, and how often each move fires', say);
		// the road is refused
		await t.E(() => { const T = window.__poketactica, p = T.td.T.S.paths[0][3]; T.P.cursor = { x: p[0], y: p[1] }; });
		await t.key('KeyZ', 300);
		A((await t.menu()).hidden && /road/i.test(await t.E(() => document.getElementById('toast').textContent)), 'Z on the road: refused, and it says why');
		// the arrows move the cursor; place two more
		await t.E(() => { const T = window.__poketactica; T.P.cursor = { x: 5, y: 2 }; });
		await t.key('ArrowRight', 150);
		const moved = (await t.v()).cursor;
		A(moved.x !== 5 || moved.y !== 2, 'the arrows move the cursor', moved);
		await t.E(() => { const T = window.__poketactica; T.P.cursor = { x: 9, y: 2 }; });
		await t.key('KeyZ', 300); await t.menuTo(/Charizard/);
		await t.E(() => { const T = window.__poketactica; T.P.cursor = { x: 6, y: 6 }; });
		await t.key('KeyZ', 300); await t.menuTo(/Machamp/);
		v = await t.v();
		A(v.towers.length === 3, 'three towers stand (every starting slot)', v.towers);
		await t.E(() => { const T = window.__poketactica; T.P.cursor = { x: 3, y: 2 }; });
		await t.key('KeyZ', 300);
		A((await t.menu()).hidden && /slot/i.test(await t.E(() => document.getElementById('toast').textContent)), 'no slot left: the fourth is refused, and it says why');
		// V: the wave comes; towers fire; enemies fall
		await t.key('KeyV', 300);
		v = await t.v();
		A(v.phase === 'wave' && v.wave === 1, 'V: wave 1 comes', v);
		await t.key('KeyC', 150); await t.key('KeyC', 150);
		A((await t.v()).speed === 3, 'C: speed 1× → 2× → 3×');
		await sleep(5000);
		v = await t.v();
		A(v.kills > 0 && v.tick > 150, 'towers fire at the enemies on the road: some fall', { kills: v.kills, tick: v.tick, enemies: v.enemies });
		await t.shot('td-desktop');
		// a tower's orders
		await t.E(() => { const T = window.__poketactica, tw = T.td.T.S.towers.find((x) => x.fig === 1); T.P.cursor = { x: tw.x, y: tw.y }; });
		await t.key('KeyZ', 400);
		m = await t.menu();
		A(/Charizard/.test(m.title) && m.items.some((x) => /^Target: First/.test(x)) && m.items.some((x) => /Flamethrower/.test(x) && /SP \d+ · PP \d+/.test(x)) && m.items.some((x) => /Protect/.test(x) && /no effect here/.test(x)) && m.items.some((x) => /^Recall/.test(x)), 'Z on a tower: its target rule, its moves (SP, PP, cooldown; Protect: no effect here), Recall', m);
		const hl = await t.E(() => (window.__poketactica.P.hl.aim || []).length);
		A(hl > 3, 'its reach is shown on the board', hl);
		await t.key('KeyZ', 300);
		A((await t.v()).towers.find((x) => x.sp === 'charizard').rule === 'last', 'Z on Target: the next rule (Last)');
		A(await t.menuTo(/Flamethrower/), 'Z on a move');
		A((await t.v()).towers.find((x) => x.sp === 'charizard').off.flamethrower === 1, '…switches it off');
		await t.key('KeyX', 300);
		A((await t.menu()).hidden, 'X closes the orders');
		// Enter: the field menu pauses; a controller's Start too; Retire ends the run
		await t.key('Enter', 300);
		m = await t.menu();
		const tk = (await t.v()).tick;
		await sleep(500);
		A(/Paused/.test(m.title) && m.items.some((x) => /^Resume/.test(x)) && m.items.some((x) => /^Retire/.test(x)) && (await t.v()).tick === tk, 'Enter: paused, the field menu (Resume, Speed, the next wave, a slot, How to play, Retire)', m);
		await t.pad(1);
		A((await t.menu()).hidden, 'the controller\'s B closes it');
		await t.pad(9);
		A(!(await t.menu()).hidden, 'the controller\'s Start opens it');
		A(await t.menuTo(/^Retire/), 'Retire');
		A(/Retire\?/.test((await t.menu()).title) && await t.menuTo(/^Retire/), '…asks first');
		await sleep(400);
		const res = await t.E(() => ({ shown: !document.getElementById('result').hidden, title: document.getElementById('r-title').textContent, body: document.getElementById('r-body').textContent.replace(/\s+/g, ' ') }));
		A(res.shown && /Retired/.test(res.title) && /Wave \d+ cleared on Meadow Loop/.test(res.body), 'the run ends: its results', res);
		await t.key('KeyX', 600);
		A(await t.E(() => window.__poketactica.hub.H.screen === 'home' && document.getElementById('pt-td').hidden && !document.body.classList.contains('pt-tding')), 'X: back to the camp, the bar gone');
		A(!t.errors.length, 'no page errors (desktop)', t.errors.slice(0, 3));
	}
	// ---------- the base falls
	{
		const t = await open({ width: 1280, height: 800 });
		await t.start('td-loop', 'falltest');
		await t.E(() => { const T = window.__poketactica, S = T.td.T.S; S.lives = 1; T.td.order({ t: 'call' }); T.td.T.speed = 3; });
		const t0 = Date.now(); let v;
		while (Date.now() - t0 < 60000) { v = await t.v(); if (v.over) break; await sleep(500); }
		const res = await t.E(() => ({ shown: !document.getElementById('result').hidden, title: document.getElementById('r-title').textContent }));
		A(v.over === 'lost' && res.shown && /base fell/i.test(res.title), 'an enemy reaches the base with one life left: the base falls, the results show', [v.over, res]);
	}
	// ---------- the first run is coached
	{
		const t = await open({ width: 1280, height: 800 });
		await t.E(() => localStorage.removeItem('magepunk_poketactica_tdcoach_v1'));
		A(await t.start('td-loop', 'coachtest'), '(a first run)');
		const coach = () => t.E(() => { const e = document.getElementById('td-coach'); return e ? e.textContent.replace(/\s+/g, ' ') : null; });
		let c = await coach();
		A(/1\/5/.test(c) && /beside the road/.test(c) && /Skip/.test(c), 'the first run on a device is coached: step 1 of 5, place a figurine', c);
		await t.key('KeyZ', 400); await t.key('KeyZ', 500);
		c = await coach();
		A(/2\/5/.test(c) && /red tiles/.test(c), 'place one and it moves on: fill the slots, and what the red tiles mean', c);
		await t.E(() => { const T = window.__poketactica; T.td.T.S.wave = 2; });
		await sleep(400);
		c = await coach();
		A(/4\/5/.test(c) && /orders/.test(c), 'by the second wave it is on to a tower\'s orders', c);
		await t.key('KeyZ', 400); await t.key('KeyX', 400);
		c = await coach();
		A(/5\/5/.test(c) && /Nobody is lost here/.test(c), 'open a tower\'s orders and it is the last step: speed, and that nobody is lost here', c);
		await t.key('KeyC', 400);
		A((await coach()) === null && await t.E(() => localStorage.getItem('magepunk_poketactica_tdcoach_v1') === 'done'), 'speed it up: the coach is done, and does not come back');
		await t.E(() => { localStorage.removeItem('magepunk_poketactica_tdcoach_v1'); window.__poketactica.td.close(); });
		A(await t.start('td-loop', 'coachtest2') && /1\/5/.test(await coach()), '(coached again on a fresh device)');
		await t.E(() => document.querySelector('#pt-td [data-act="coach-skip"]').click());
		A((await coach()) === null && await t.E(() => localStorage.getItem('magepunk_poketactica_tdcoach_v1') === 'done'), 'Skip puts it away for good');
		A(!t.errors.length, 'no page errors (the coach)', t.errors.slice(0, 3));
	}
	// ---------- touch, a phone
	{
		const t = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await t.start('td-twin', 'touchtest');
		await sleep(500);
		const tapTile = async (x, y) => { const p = await t.E((x, y) => window.__poketactica.screenOf(x, y), x, y); await t.page.touchscreen.tap(p[0], p[1]); await sleep(450); };
		const tapEl = async (sel, re) => { const r = await t.E((sel, src) => { const re = src ? new RegExp(src) : null; const el = [...document.querySelectorAll(sel)].find((b) => !re || re.test(b.textContent)); if (!el) return null; const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel, re ? re.source : null); if (r) { await t.page.touchscreen.tap(r[0], r[1]); await sleep(450); } return r; };
		A(!(await t.E(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no sideways scroll on a phone');
		await tapTile(3, 3);
		let m = await t.menu();
		A(!m.hidden && /Place here/.test(m.title), 'a tap on a free tile: the squad to place', m);
		A(await tapEl('#menu-items .bal-btn', /Blastoise/), 'a tap on Blastoise');
		let v = await t.v();
		A(v.towers.length === 1 && v.towers[0].sp === 'blastoise' && v.towers[0].x === 3 && v.towers[0].y === 3, 'Blastoise stands on the tapped tile', v.towers);
		await tapTile(3, 3);
		A(/Blastoise/.test((await t.menu()).title), 'a tap on the tower: its orders');
		await tapTile(8, 9);
		A((await t.menu()).hidden, 'a tap on the board closes them');
		A(await tapEl('#pt-td [data-act="wave"]'), 'the Wave! button');
		A((await t.v()).phase === 'wave', 'the wave comes');
		A(await tapEl('#pt-td [data-act="speed"]'), 'the speed button');
		A((await t.v()).speed === 2, '2×');
		A(await tapEl('#pt-td [data-act="pause"]'), 'the pause button');
		const tk = (await t.v()).tick; await sleep(500);
		A((await t.v()).paused && (await t.v()).tick === tk && /Resume/.test(await t.E(() => document.getElementById('pt-td').textContent)), 'paused (the button says Resume)');
		await tapEl('#pt-td [data-act="pause"]'); await sleep(1500);
		A((await t.v()).tick > tk, 'and on again');
		// THE ROAD's BOONS (plan item T4; rules 24): while an offer waits there is a Boon button; it opens the three; one is taken
		{
			A(await t.E(() => !document.querySelector('#pt-td [data-act="boon"]')), 'no Boon button while nothing is offered');
			const e0 = await t.E(() => { const S = window.__poketactica.td.T.S; S.boons = ['energy', 'quick', 'lives']; return S.energy; });
			await sleep(500);
			A(await tapEl('#pt-td [data-act="boon"]'), 'an offer waits: the Boon button is there, and is tapped');
			const bm = await t.menu();
			A(!bm.hidden && /pick a boon/.test(bm.title) && bm.items.length === 4 && /^Spare Parts 15 energy, now\./.test(bm.items[0]) && /^Drill Moves come back 4% sooner/.test(bm.items[1]) && /^Patch Up/.test(bm.items[2]) && /^Decide later/.test(bm.items[3]), 'it opens the three boons, each saying what it does, and Decide later', bm);
			A(await tapEl('#menu-items .bal-btn', 'Spare Parts'), 'a tap on Spare Parts');
			await sleep(400);
			const after = await t.E(() => { const T = window.__poketactica, v = T.td.view(); return { energy: v.energy, boons: v.boons, log: v.boonLog, btn: !!document.querySelector('#pt-td [data-act="boon"]'), menu: document.getElementById('menu').hidden }; });
			A(after.energy >= e0 + 15 && after.boons === null && after.log.join() === 'energy' && !after.btn && after.menu, 'taken: 15 energy, the offer and its button are gone', [e0, after]);
		}
		await t.shot('td-phone');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
