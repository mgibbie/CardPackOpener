// poketactica_editor_page_test.mjs — the MAP MAKER on the page (owner, 2026-11-22: "Map editor"), by keyboard, controller
// and touch: camp -> Map maker -> New map opens the board editor; Z uses the tool at the cursor, C changes tool, V its
// option, X undoes; a tap on a tile uses the tool there (phone); the menu (Enter) saves, test-plays (a battle on the made
// map, no Bonus Gauge, back to the editor after), and leaves to the Map maker list, where the map is. The board is the new
// terrain renderer (textured ground, props, water). No page errors.
//   node overworld/tests/poketactica_editor_page_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8955;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const FIGS = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries(['pikachu', 'machamp', 'charmander'].map((sp, i) => [sp + '-ed' + i, { v: 1, id: sp + '-ed' + i, species: sp, level: 20, exp: 0, ability: null, shiny: false, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'] }])) });
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument((figs) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* */ }
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
			window.__owFakePads = [pad]; window.__pad = pad;
		}, FIGS);
		await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now(); while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
		await sleep(600);
		const t = { page, errors };
		t.key = async (k, ms = 160) => { await page.keyboard.press(k); await sleep(ms); };
		t.pad = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(160); };
		t.E = (fn, ...a) => page.evaluate(fn, ...a);
		t.focus = () => t.E(() => window.__poketactica.hub.focusLabel());
		t.keyTo = async (re) => { for (let i = 0; i < 24; i++) { const f = await t.focus(); if (f && re.test(f)) { await t.key('KeyZ', 400); return true; } await t.key(i < 12 ? 'ArrowDown' : 'ArrowUp', 70); } return false; };
		t.ed = () => t.E(() => { const T = window.__poketactica, E = T.editor.E; return { screen: T.P.screen, tool: E.tool, rows: E.m.rows, ground: E.m.ground, undo: E.undo.length, cursor: { ...T.P.cursor }, bar: !document.getElementById('pt-edit').hidden }; });
		return t;
	};
	// ---------- keyboard (and a controller press), desktop
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.keyTo(/Map maker/), 'camp: Z on Map maker');
		A(await t.E(() => window.__poketactica.hub.H.screen) === 'maps', 'the Map maker list');
		A(await t.keyTo(/New map/), 'Z on New map');
		let s = await t.ed();
		A(s.screen === 'editor' && s.bar && s.rows.length === 8, 'the board editor opens on a new 8 x 8 map, its tool bar showing');
		A(await t.E(() => !!document.querySelector('#hud-top') && getComputedStyle(document.querySelector('#hud-top')).display === 'none'), "the battle's HUD is put away");
		await t.key('ArrowUp'); await t.key('ArrowUp');
		s = await t.ed();
		const c = s.cursor, before = s.rows[c.y][c.x];
		await t.key('KeyZ', 400);
		s = await t.ed();
		A(s.rows[c.y][c.x] !== before && s.rows[c.y][c.x] === '1', 'Z raises the tile under the cursor', [before, s.rows[c.y][c.x]]);
		A(await t.E((c) => window.__poketactica.P.S.map.height[c.y * window.__poketactica.P.S.map.w + c.x] === 1, c), 'the board is rebuilt from the map at once');
		await t.key('KeyC'); await t.key('KeyC');
		s = await t.ed();
		A(s.tool === 2, 'C: the next tool (Ground)');
		await t.key('KeyV');
		await t.key('ArrowRight'); await t.key('KeyZ', 400);
		s = await t.ed();
		const c2 = s.cursor;
		A(s.ground[c2.y][c2.x] === 't', 'V picks the ground (tall grass), Z paints it', s.ground[c2.y]);
		await t.key('KeyX', 400);
		s = await t.ed();
		A(s.ground[c2.y][c2.x] === '.', 'X undoes it');
		await t.pad(1);   // (the controller's confirm: the same tool, the same tile)
		s = await t.ed();
		A(s.ground[c2.y][c2.x] === 't', 'a controller press uses the tool too');
		// the menu: save, test play, back to the editor
		await t.key('Enter', 300);
		const items = await t.E(() => [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
		A(items.some((l) => /^Test play/.test(l)) && items.some((l) => /^Save/.test(l)) && items.some((l) => /^Share code/.test(l)) && items.some((l) => /^Leave/.test(l)), 'Enter: the editor menu (Test play, Save, Share code, … Leave)', items);
		await t.key('ArrowDown'); await t.key('KeyZ', 400);   // Save
		A(await t.E(() => JSON.parse(localStorage.getItem('magepunk_poketactica_maps_v1') || '[]').length === 1), 'Save keeps it on this device');
		await t.key('Enter', 300); await t.key('KeyZ', 1500);   // Test play (the first item)
		A(await t.E(() => window.__poketactica.P.screen === 'battle' && window.__poketactica.P.map && window.__poketactica.P.map.custom && window.__poketactica.P.S.bonus === null), 'Test play: a battle on the made map (no Bonus Gauge)');
		A(await t.E(() => window.__poketactica.P.S.map.ground && window.__poketactica.P.S.terrain), '...with its living terrain');
		await t.E(() => { const T = window.__poketactica; T.P.S.over = 'lost'; document.getElementById('r-again').click(); });
		await sleep(800);
		A((await t.ed()).screen === 'editor', 'after the test play: back in the editor, on the same map');
		await t.key('Enter', 300);
		for (let i = 0; i < 20; i++) { const f = await t.E(() => { const b = document.querySelector('#menu-items .is-focus'); return b ? b.textContent : ''; }); if (/^Leave/.test(f.trim())) break; await t.key('ArrowDown', 60); }
		await t.key('KeyZ', 500);
		A(await t.E(() => window.__poketactica.hub.H.screen) === 'maps' && (await t.E(() => window.__poketactica.hub.labels())).some((l) => /My map/.test(l)), 'Leave: the Map maker list, the map in it');
		A(!t.errors.length, 'no page errors (desktop)', t.errors.slice(0, 3));
	}
	// ---------- touch, a phone
	{
		const t = await open({ width: 390, height: 844, isMobile: true, hasTouch: true });
		await t.E(() => { const T = window.__poketactica; T.hub.close(); T.editor.open(null); });
		await sleep(500);
		const tap = async (xy) => { await t.page.touchscreen.tap(xy[0], xy[1]); await sleep(450); };
		const tile = await t.E(() => window.__poketactica.screenOf(4, 4));
		await tap(tile);
		let s = await t.ed();
		A(s.rows[4][4] === '1', 'a tap on a tile uses the tool there (Raise)', s.rows[4]);
		const geoBtn = await t.E(() => { const b = [...document.querySelectorAll('#pt-edit [data-tool]')].find((x) => /Geo/.test(x.textContent)); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
		await tap(geoBtn);
		A((await t.ed()).tool === 3, 'a tap on the bar picks the tool (Geo)');
		await tap(await t.E(() => window.__poketactica.screenOf(3, 5)));
		A(await t.E(() => window.__poketactica.editor.E.m.geo[5][3] === 'r'), 'and a tap paints it (red)');
		A(await t.E(() => { const r = document.getElementById('pt-edit').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; }), 'the tool bar fits a phone');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
