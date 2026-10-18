// micasurvivor_display_test.mjs — MicaSurvivor M5 batch 10: the minimap, the field-of-view slider and the UI scale, from
// the Godot Android port by JayElDragon (poke-survivor: main.gd 335 / 532 / 546-554 / 3176-3184 / 7798-8120, pause_ui.gd
// 178-216, display.gd, menu.gd 3965-4001, save_data.gd 87 / 126-129), driven headlessly while logged in to a stubbed
// Magepunk account (the row micasurvivor:<user> with the server's compare-and-set):
//   - data: the port's numbers (View 100-200 % step 5 default 165; Screen size 60-140 % step 5 default 100; the minimap's
//     200 px box, 48 tiles, 4 px a tile, sight 14, radar 20, traps 9, foes 12), English for every new string
//   - the minimap's contents, read from what it really drew: you in the centre, an enemy at a known offset mapped to the
//     right spot, one beyond 12 tiles left out, a near boss in place and a far one pinned to the rim in its direction, the
//     rift / den pinned to the rim, chests / altars / traps by the port's radar rules, the fog's explored disc (radius 14);
//     hidden in the rift arena, during the Judgment, on the level-up / pause screens and when down
//   - the toggle (Settings > Graphics): off -> not drawn, saved; on again
//   - the field of view: the slider changes the REAL camera (G.Camera.w / scale) live, 100 % -> 1267 world px wide,
//     200 % -> 634, clamped to 100-200 and to 130 on a phone; Dynamax and the Tower do not change it (like the port)
//   - the UI scale: the real DOM (a settings button, the settings box) and the canvas HUD (its element rects, the touch
//     buttons) scale with it; clamped to what fits (1280x720: 109 %, 1920x1080: 138 %, 844x390: 108 %) and to 85 % with
//     touch; HUD touch areas never smaller than at 100 %, menu controls never under 24 px with touch; nothing overflows
//     (settings, pause, menu, HUD) at the min / max scale on a
//     1280x720 desktop and an 844x390 phone (390x844 portrait shows the rotate prompt)
//   - no overlap: in a busy run (Team mode with its chips, a boss, a rift, weather, modifiers, Z / MAX buttons) the
//     minimap's rect never touches another HUD element's, at desktop / phone size and min / default / max scale, also
//     with the fixed joystick on a phone (the minimap moves to the next free spot)
//   - persistence: device-local (micasurvivor_settings in localStorage, like the port's local settings), after a reload,
//     not in the account save
//   - the pad: the D-pad reaches both sliders and moves them by the port's step of 5 (left / right), also on the pause
//     screen's field-of-view slider
//   - no Spanish on the English screens (settings, pause, the canvas)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): busy runs at 1280x720, 844x390 and 390x844 at min / default / max UI scale and
// min / max field of view, the settings tab and the pause screen.
// Covers micasurvivor/js/core/display.js, js/ui/minimap.js, js/ui/hud.js, js/core/camera.js, js/core/touch.js,
// js/core/pad.js, js/ui/settings-ui.js, js/ui/run-ui.js, js/world/world.js, js/systems/events.js, js/game.js,
// js/data/lang-en.js, css/style.css, index.html.
//   node overworld/tests/micasurvivor_display_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9561;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);   // debugging: ONLY=3,7 runs those sections
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// the account row micasurvivor:<user>, with the server's compare-and-set (server/mp.mjs)
const ROW = { rev: 0, save: null };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = '';
		req.on('data', c => { raw += c; });
		req.on('end', () => {
			let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
			let out = {}, status = 200;
			if (body.action === 'micasurvivor-save-get') out = { rev: ROW.rev, save: ROW.save };
			else if (body.action === 'micasurvivor-save-put') {
				if (body.rev === ROW.rev) { ROW.rev++; ROW.save = JSON.parse(JSON.stringify(body.save)); out = { ok: true, rev: ROW.rev }; }
				else { status = 409; out = { error: 'stale', rev: ROW.rev, save: ROW.save }; }
			}
			res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
		});
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

// the synthetic Gamepad API + a Magepunk login, before any page script runs
const BEFORE = () => {
	window.__pads = [];
	window.__mkPad = (i, id) => ({
		index: i, id, connected: true, mapping: 'standard', timestamp: 0,
		buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
		axes: [0, 0, 0, 0],
		vibrationActuator: { playEffect() { return Promise.resolve('complete'); } },
	});
	window.__btn = (b, on, p = 0) => { const pad = window.__pads[p]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
	Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
	localStorage.setItem('magepunk_mp_token_v1', 'display-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'displaytester' }));
	// every string the canvas really draws (after the English translation), to look for Spanish
	window.__drawn = new Set();
	addEventListener('DOMContentLoaded', () => {
		const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
		P.fillText = function (s, ...a) { if (window.G && G.I18n && window.__rec) window.__drawn.add(typeof s === 'string' ? G.I18n.t(s) : String(s)); return orig.call(this, s, ...a); };
	});
};

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|campo|visión|tamaño|interfaz|pantalla|minimapa|mapa|restablecer|como|mínimo|vista|juego|enemigos|cofres|grieta|sí)\b/i;

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const cdp = await page.target().createCDPSession();
	const E = (fn, ...a) => page.evaluate(fn, ...a);
	const visible = (id) => E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name) => { await E(() => { document.querySelectorAll('#ach-pop, .toast').forEach(e => { e.style.display = 'none'; }); if (G.Game.state !== 'ui') G.Spawner.say('', 0); }); await sleep(200); if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const press = async (b) => { await E(b => __btn(b, true), b); await sleep(90); await E(b => __btn(b, false), b); await sleep(110); };
	const navTo = async (sel) => {
		for (let i = 0; i < 80; i++) {
			const d = await E(sel => {
				const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
				if (!f || !t) return 'missing';
				if (f === t || f.contains(t) || t.contains(f)) return 'here';
				const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
				const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
				if (f.type === 'range' && Math.abs(dy) > 8) return dy > 0 ? 13 : 12;   // (left / right would move the slider)
				return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 13 : 12) : (dx > 0 ? 15 : 14);
			}, sel);
			if (d === 'here') return true;
			if (d === 'missing') { if (process.env.DEBUG) console.log('navTo missing', sel, await E(() => { const f = document.querySelector('.pad-focus'); return f ? f.outerHTML.slice(0, 120) : 'no focus'; })); return false; }
			await press(d);
		}
		if (process.env.DEBUG) console.log('navTo gave up', sel, await E(() => { const f = document.querySelector('.pad-focus'); return f ? f.outerHTML.slice(0, 120) : 'no focus'; }));
		return false;
	};
	const spanishOn = sel => E((sel, src) => {
		const el = document.querySelector(sel);
		if (!el) return { txt: '', bad: ['missing ' + sel] };
		let txt = el.innerText.replace(/Pok[ée]mon/g, 'Pokemon').split('Español').join('');   // (the language picker names itself)
		for (const p of G.DEX) if (/[^\x00-\x7f]/.test(p.name) && txt.includes(p.name)) txt = txt.split(p.name).join('#');
		const re = new RegExp(src, 'gi');
		return { txt: txt.slice(0, 600), bad: txt.match(re) || [] };
	}, sel, SPANISH.source);
	const tapEl = async (sel) => { const b = await E(sel => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (b) await page.touchscreen.tap(b.x, b.y); return !!b; };
	const touchOn = on => cdp.send('Emulation.setTouchEmulationEnabled', { enabled: on, maxTouchPoints: 5 });
	const view = (w, h) => page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
	const frames = (n = 3) => E(n => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
	// helpers inside the page
	const helpers = () => E(() => {
		window.__T = {
			/** a run, playing (the minimap only shows while playing), nothing can hurt or move us */
			start(mode = 'normal') {
				G.Game.startRun(null, mode);
				G.UI.hideAll();
				const pl = G.Game.player; pl.invuln = 1e9; G.EnemyMgr.clear();
				G.Spawner.update = () => {}; G.Events.update = () => {};   // no new enemies / events while we measure
				return G.Game.mode;
			},
			/** a frozen enemy (or boss) at an offset in tiles from the player */
			foe(dx, dy, boss = false) {
				const pl = G.Game.player, free = G.World.isFree; G.World.isFree = () => true;
				try {
					const e = boss ? G.Spawner.spawnBoss(pl, 300, G.Enemies.BOSSES[1]) : G.Spawner.spawnOne(pl, 60);
					e.x = pl.x + dx * 32; e.y = pl.y + dy * 32; e.update = () => {};
					return e;
				} finally { G.World.isFree = free; }
			},
			/** what the minimap drew, relative to its centre, in its own 200-unit box */
			mm() {
				const m = G.HUD.minimap; if (!m) return null;
				const sc = m.s / 200, cx = m.x + 100 * sc, cy = m.y + 100 * sc;
				return { m, sc, items: G.Minimap.drawn.map(d => ({ kind: d.kind, x: (d.x - cx) / sc, y: (d.y - cy) / sc })) };
			},
			/** the HUD's element rects in CSS px */
			rects() { const k = G.HUD.k; return G.HUD.rects().map(r => ({ name: r.name, x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k })); },
			overlaps() {
				const R = this.rects(), m = R.find(r => r.name === 'minimap');
				if (!m) return { m: null, hits: [] };
				const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
				return { m, hits: R.filter(r => r !== m && hit(m, r)).map(r => r.name), off: R.filter(r => r.x < -1 || r.y < -1 || r.x + r.w > innerWidth + 1 || r.y + r.h > innerHeight + 1).map(r => r.name + JSON.stringify([Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)])), names: R.map(r => r.name) };
			},
		};
	});
	// a busy run: Team mode (3 chips + the swap button), Tough + Heavy hitters (the mode tag), rain, a boss, a rift, Z + MAX
	const busy = async () => {
		await E(() => {
			const s = G.DB.save;
			s.owned = { 4: { at: 1000, from: 'starter' }, 1: { at: 2000, from: 'gacha' }, 7: { at: 3000, from: 'gacha' } };
			s.modes = { team: [4, 1, 7], mods: ['tank', 'hard'] }; s.stats.dens = 1; s.stats.tk_fire = 999;
			window.__T.start('team');
			const pl = G.Game.player; pl.level = 25;
			G.Weather.force('rain', 600);
			window.__T.foe(3, -2, true);
			for (let i = 0; i < 6; i++) window.__T.foe(4 + i, (i % 3) - 1);
			G.Rift.debugOpen(); const r = G.Rift.rift; r.x = pl.x + 40 * 32; r.y = pl.y - 6 * 32; r.ttl = 999; r.t = 10;
		});
		await frames(4);
	};

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.Display && !!G.Minimap), 30000), 'boots logged in (Magepunk account); G.Display + G.Minimap loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await E(() => { const s = G.DB.save; s.owned = { 4: { at: 1000, from: 'starter' } }; s.partner = 4; s.modes = {}; G.DB.commit(true); });
	await helpers();

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const strings = ['Campo de visión', 'Acerca o aleja la cámara: con menos se ve más mundo, con más se ve de más cerca.', 'En pantallas pequeñas, como mínimo 130%',
				'Tamaño de la interfaz', 'El tamaño del HUD, los menús y los botones.', 'Pantalla (px) → vista del juego: ', 'Minimapa',
				'El mapa redondo de la izquierda: el terreno que has explorado, los enemigos cercanos, los cofres y altares, los jefes y la grieta.', 'Restablecer'];
			return {
				fov: G.Display.FOV, ui: G.Display.UI, view: G.Display.VIEW, K: G.Minimap.K,
				def: { fov: G.Display.fov(), ui: G.Display.uiSet(), mm: G.Display.minimapOn() },
				en: strings.map(s => [s, G.I18n.t(s)]),
				scripts: ['js/core/display.js', 'js/ui/minimap.js'].map(s => !!document.querySelector(`script[src="${s}"]`)),
				noPad: !G.Pad.ACTIONS.some(a => /map|fov|zoom/i.test(a)),
			};
		});
		A(r.fov.min === 100 && r.fov.max === 200 && r.fov.step === 5 && r.fov.def === 165 && r.def.fov === 165, 'field of view: the port\'s 100-200 %, step 5, default 165 (pause_ui.gd 189-193, save_data.gd 87)', JSON.stringify(r.fov));
		A(r.ui.min === 60 && r.ui.max === 140 && r.ui.step === 5 && r.ui.def === 100 && r.def.ui === 100, 'UI scale: the port\'s Screen size 60-140 %, step 5, default 100 (display.gd MIN_PCT / MAX_PCT, menu.gd 3977-3980)', JSON.stringify(r.ui));
		A(r.view.w === 768 && r.view.h === 420, 'the web\'s view (768 x 420 world px) is the port\'s 165 %', JSON.stringify(r.view));
		const K = r.K;
		A(K.BOX === 200 && K.VIEW === 48 && K.PX === 4 && K.RAD === 96 && K.N === 50 && K.SIGHT === 14 && K.RADAR === 20 && K.TRAP_R === 9 && K.FOE_R === 12 && K.size === 200 && K.y === 92,
			'the minimap: the port\'s 200 px box, 48 tiles across at 4 px, radius 96, sight 14, radar 20, traps 9, foes 12, under the HP at y 92 (main.gd 548, 7805-7815)', JSON.stringify(K));
		A(r.def.mm === true, 'the minimap is on by default');
		const bad = r.en.filter(([es, en]) => es === en || SPANISH.test(en));
		A(bad.length === 0 && r.en[0][1] === 'Field of view' && r.en[5][1] === 'Screen (px) → game view: ' && r.en[6][1] === 'Minimap', 'every new string has English ("Field of view", "Interface size", "Minimap", the port\'s "Screen (px) → game view: ")', JSON.stringify(r.en));
		A(r.scripts.every(Boolean), 'index.html loads js/core/display.js and js/ui/minimap.js');
		A(r.noPad, 'no new pad action (the port has no minimap / zoom button)');
	}

	// ================= 2. the minimap's contents =================
	if (!ONLY.length || ONLY.includes('2')) {
		await E(() => window.__T.start('normal'));
		await frames(3);
		const r = await E(() => {
			const T = window.__T, pl = G.Game.player, out = {};
			out.state = G.Game.state;
			out.explored = G.Minimap.explored;
			let disc = 0; for (let y = -14; y <= 14; y++) for (let x = -14; x <= 14; x++) if (x * x + y * y <= 196) disc++;
			out.disc = disc;
			G.EnemyMgr.clear();
			T.foe(5, 3); T.foe(15, 0); T.foe(-8, 0, true); T.foe(0, -60, true);
			G.Rift.debugOpen(); const rf = G.Rift.rift; rf.x = pl.x + 100 * 32; rf.y = pl.y; rf.ttl = 999;
			return out;
		});
		await frames(3);
		const d = await E(() => window.__T.mm());
		A(r.state === 'playing' && d && d.m.s === 200 && d.m.x === 16, 'a run at 1280x720: the minimap is drawn, 200 px, on the left column', JSON.stringify(d && d.m));
		A(r.explored === r.disc, `the fog: ${r.disc} tiles explored at the start (the disc of radius 14 around you, main.gd _fog_update)`, JSON.stringify(r));
		const by = k => d.items.filter(i => i.kind === k);
		const you = by('you'), en = by('enemy'), boss = by('boss'), rift = by('rift');
		A(you.length === 1 && near(you[0].x, 0, 0.01) && near(you[0].y, 0, 0.01), 'you are in the centre', JSON.stringify(you));
		// an enemy 5 tiles east and 3 south: (5 x 4, 3 x 4) from the centre (main.gd _pt)
		A(en.length === 1 && near(en[0].x, 20, 0.6) && near(en[0].y, 12, 0.6), 'an enemy 5 tiles east and 3 south is drawn 20 / 12 units from the centre; the one 15 tiles away (beyond 12) is not', JSON.stringify(en));
		const nearB = boss.find(b => b.x < 0 && Math.abs(b.y) < 1), farB = boss.find(b => b.y < -40);
		A(boss.length === 2 && nearB && near(nearB.x, -32, 0.6) && farB && near(farB.x, 0, 0.6) && near(farB.y, -(96 - 12), 0.6),
			'bosses always: one 8 tiles west in place (-32), one 60 tiles north pinned to the rim (84 = 96 - 12) straight up', JSON.stringify(boss));
		A(rift.length === 1 && near(rift[0].x, 84, 0.6) && near(rift[0].y, 0, 0.6), 'the rift 100 tiles east is pinned to the rim to the east', JSON.stringify(rift));
		// a den is red ('den')
		await E(() => { G.Rift.rift.den = true; });
		await frames(2);
		const den = await E(() => window.__T.mm().items.filter(i => i.kind === 'den'));
		A(den.length === 1, 'a Dynamax den is drawn as a den (red), not as a rift', JSON.stringify(den));
		await E(() => { G.Rift.rift.den = false; });
		// props: the port's radar rules, on synthetic props through the real draw
		await E(() => {
			const pl = G.Game.player, TS = 32, mk = (type, dx, dy, extra = {}) => Object.assign({ type, x: pl.x + dx * TS, y: pl.y + dy * TS, tx: Math.floor(pl.x / TS) + dx, ty: Math.floor(pl.y / TS) + dy, kind: 0, used: false, hp: 22, charge: 1 }, extra);
			window.__props = G.World.propsAround;
			G.World.propsAround = () => [mk('chest', 10, 0), mk('altar', 0, 18), mk('altar', -21, 3), mk('trap', 0, -8), mk('trap', 0, 10), mk('spring', -6, -6), mk('chest', 6, 0, { used: true }), mk('tree', 2, 2)];
		});
		await frames(2);
		const p = await E(() => { const d = window.__T.mm(); G.World.propsAround = window.__props; return d.items.filter(i => !['you', 'enemy', 'boss', 'rift'].includes(i.kind)); });
		const k = n => p.filter(i => i.kind === n);
		A(k('chest').length === 1 && near(k('chest')[0].x, 40, 0.6) && k('altar').length === 1 && near(k('altar')[0].y, 72, 0.6) && k('trap').length === 1 && near(k('trap')[0].y, -32, 0.6) && k('spring').length === 1 && p.length === 4,
			'props by the port\'s rules: a chest at 10 tiles and an altar at 18 (within the radar of 20) drawn, an altar at 21 tiles not (not explored); a trap at 8 tiles drawn, at 10 not (9); a spring; a used chest and a tree never', JSON.stringify(p));
		// hidden: level-up screen, pause, rift arena, Judgment, down
		const hid = await E(async () => {
			const fr = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
			const out = {};
			G.Game.togglePause(); await fr(); out.pause = !!G.HUD.minimap || G.Minimap.shown(); G.Game.togglePause(); await fr();
			out.back = !!G.HUD.minimap;
			const d = Object.getOwnPropertyDescriptor(G.Rift, 'inArena');
			Object.defineProperty(G.Rift, 'inArena', { configurable: true, get: () => true }); out.arena = G.Minimap.shown(); Object.defineProperty(G.Rift, 'inArena', d);
			const j = Object.getOwnPropertyDescriptor(G.Judgment, 'active');
			Object.defineProperty(G.Judgment, 'active', { configurable: true, get: () => true }); out.judg = G.Minimap.shown(); Object.defineProperty(G.Judgment, 'active', j);
			const pl = G.Game.player; pl.dead = true; out.dead = G.Minimap.shown(); pl.dead = false;
			G.Game.debugLevelUp(); await fr(); await fr(); out.lvState = G.Game.state; out.lvl = G.Minimap.shown() || !!G.HUD.minimap;
			return out;
		});
		A(!hid.pause && hid.back && !hid.arena && !hid.judg && !hid.dead && hid.lvState === 'levelup' && !hid.lvl,
			'hidden on the pause screen, in the rift arena and during the Judgment (main.gd _on), when down, and on the level-up cards', JSON.stringify(hid));
		await E(() => { G.UI.hideAll(); });
	}

	// ================= 3. the toggle =================
	if (!ONLY.length || ONLY.includes('3')) {
		await E(() => { window.__T.start('normal'); G.Game.togglePause(); G.SettingsUI.open('gfx'); });
		await sleep(300);
		const s0 = await E(() => { const b = document.getElementById('set-minimap'), row = document.getElementById('set-minimap-row'); return { btn: b && b.innerText, row: row && row.innerText }; });
		A(s0.btn === 'Yes' && /Minimap/.test(s0.row) && /round map on the left/.test(s0.row), 'Settings > Graphics > Display: "Minimap" Yes', JSON.stringify(s0));
		await page.click('#set-minimap');
		await sleep(200);
		await E(() => { G.SettingsUI.close(); G.Game.togglePause(); });
		await frames(3);
		const s1 = await E(() => ({ on: G.Display.minimapOn(), drawn: !!G.HUD.minimap, saved: JSON.parse(localStorage.getItem('micasurvivor_settings')).minimap, rects: G.HUD.rects().some(r => r.name === 'minimap') }));
		A(!s1.on && !s1.drawn && !s1.rects && s1.saved === false, 'a click turns it off: not drawn in the run, saved in this browser', JSON.stringify(s1));
		await E(() => G.Display.setMinimap(true));
		await frames(3);
		A(await E(() => !!G.HUD.minimap), 'on again: drawn');
	}

	// ================= 4. the field of view =================
	if (!ONLY.length || ONLY.includes('4')) {
		await view(1280, 720); await sleep(300);
		await E(() => window.__T.start('normal'));
		await frames(2);
		const cam = () => E(() => ({ w: G.Camera.w, h: G.Camera.h, scale: G.Camera.scale, fov: G.Display.fov(), eff: G.Display.fovEff(), zoom: G.Display.zoom() }));
		const c165 = await cam();
		A(near(c165.w, 768, 0.01) && c165.fov === 165, 'default 165 %: the camera shows 768 world px across (the web\'s view)', JSON.stringify(c165));
		// the slider, live, during the run (Settings opened from the pause screen)
		await E(() => { G.Game.togglePause(); G.SettingsUI.open('gfx'); });
		await sleep(250);
		await E(() => { const f = document.getElementById('set-fov'); f.value = 100; f.dispatchEvent(new Event('input', { bubbles: true })); });
		const c100 = await cam();
		const lbl = await E(() => document.getElementById('set-fov-val').innerText);
		A(near(c100.w, 768 * 1.65, 0.01) && near(c100.scale, 1280 / (768 * 1.65), 1e-6) && lbl === '100%', '100 %: the camera zooms out live: 1267 world px across (768 x 165 / 100), scale 1.01', JSON.stringify([c100, lbl]));
		await E(() => { const f = document.getElementById('set-fov'); f.value = 200; f.dispatchEvent(new Event('input', { bubbles: true })); });
		const c200 = await cam();
		A(near(c200.w, 768 * 0.825, 0.01) && near(c200.scale, 1280 / (768 * 0.825), 1e-6), '200 %: zoomed in: 634 world px across, scale 2.02 (the port\'s cam.zoom = 2)', JSON.stringify(c200));
		A(c100.scale / c165.scale > 0.6 && near(c200.scale / c100.scale, 2, 1e-6), 'the camera scale is proportional to the field of view (200 % = twice 100 %)', JSON.stringify([c100.scale, c165.scale, c200.scale]));
		// clamped
		const cl = await E(() => { G.Display.setFov(250); const a = G.Display.fov(); G.Display.setFov(40); const b = G.Display.fov(); G.Display.setFov(163); const c = G.Display.fov(); localStorage.setItem('x', 1); return [a, b, c]; });
		A(JSON.stringify(cl) === '[200,100,165]', 'clamped to 100-200 and snapped to steps of 5', JSON.stringify(cl));
		// what the world draws: an enemy 200 world px right of the camera centre lands 200 x scale px right of the screen centre
		const proj = await E(() => { G.Display.setFov(120); const cam = G.Camera; return { scale: cam.scale, w: cam.w, want: 1280 / (768 * 165 / 120) }; });
		A(near(proj.scale, proj.want, 1e-6), '120 %: scale 1280 / (768 x 165 / 120)', JSON.stringify(proj));
		// Dynamax and the Tower do not change the zoom (the port's camera only follows the player)
		await E(() => { G.Display.setFov(165); G.SettingsUI.close(); G.Game.togglePause(); });
		const dyn = await E(async () => {
			const fr = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
			const pl = G.Game.player, w0 = G.Camera.w; G.Dynamax.start(pl); for (let i = 0; i < 6; i++) await fr(); const w1 = G.Camera.w, act = G.Dynamax.active; G.Dynamax.stop && G.Dynamax.stop(pl);
			window.__T.start('tower'); await fr(); const w2 = G.Camera.w;
			return { w0, w1, w2, act };
		});
		A(dyn.act && near(dyn.w1, dyn.w0, 1e-9) && near(dyn.w2, dyn.w0, 1e-9), 'Dynamax and the Tower keep the chosen field of view (the port changes cam.zoom only from the slider)', JSON.stringify(dyn));
		// a phone: never under 130 %
		await view(844, 390); await sleep(400);
		const ph = await E(() => { G.Display.setFov(100); const a = { fov: G.Display.fov(), eff: G.Display.fovEff(), min: G.Display.fovMin(), w: G.Camera.w, h: G.Camera.h, scale: G.Camera.scale };
			G.Display.setFov(165); a.w165 = G.Camera.w; return a; });
		A(ph.fov === 100 && ph.eff === 130 && ph.min === 130 && near(ph.scale, Math.min(844 / (768 * 165 / 130), 390 / (420 * 165 / 130)), 1e-6),
			'844x390 (a phone): 100 % is applied as 130 % (sprites stay readable); the setting itself keeps 100', JSON.stringify(ph));
		await view(1280, 720); await sleep(300);
	}

	// ================= 5. the UI scale =================
	if (!ONLY.length || ONLY.includes('5')) {
		const measure = () => E(() => {
			const b = document.getElementById('set-close').getBoundingClientRect(), box = document.querySelector('#scr-settings .box').getBoundingClientRect();
			const hp = G.HUD.rects().find(r => r.name === 'hp');
			return { k: G.Display.ui(), hudK: G.HUD.k, btnH: b.height, btnW: b.width, boxW: box.width, hpW: hp ? hp.w * G.HUD.k : 0, cls: document.documentElement.classList.contains('ui-scaled'),
				info: (document.getElementById('set-ui-info') || {}).innerText };
		});
		await E(() => { window.__T.start('normal'); });
		await frames(2);
		await E(() => { G.Game.togglePause(); G.SettingsUI.open('gfx'); });
		await sleep(250);
		const m100 = await measure();
		await E(() => { const u = document.getElementById('set-ui'); u.value = 140; u.dispatchEvent(new Event('input', { bubbles: true })); u.dispatchEvent(new Event('change', { bubbles: true })); });
		await sleep(150);
		const m140 = await measure();
		A(near(m140.k, 720 / 661, 1e-6) && m140.cls && near(m140.btnH / m100.btnH, m140.k, 0.02) && near(m140.btnW / m100.btnW, m140.k, 0.02),
			`140 % at 1280x720: applied as ${(m140.k * 100).toFixed(1)} % (the most that keeps the 720 px layout bracket: 720 / 661); a settings button is that much bigger`, JSON.stringify([m100, m140]));
		A(/Screen \(px\) → game view: 1280×720/.test(m140.info) && /→ 1175×661/.test(m140.info), 'the port\'s info line: "Screen (px) → game view: 1280×720 → 1175×661"', m140.info);
		const big = await E(() => [G.Display.uiMax(1920, 1080), G.Display.uiMax(1366, 768), G.Display.uiMax(844, 390), G.Display.uiMax(1280, 520), G.Display.uiMax(600, 350)]);
		A(near(big[0], 1080 / 781, 1e-9) && near(big[1], 768 / 661, 1e-9) && near(big[2], 390 / 360, 1e-9) && near(big[3], 520 / 401, 1e-9) && big[4] === 1, 'the cap by screen: 1920x1080 138 %, 1366x768 116 %, 844x390 108 %, 1280x520 130 %, never below 100 % (600x350)', JSON.stringify(big));
		await E(() => { G.SettingsUI.close(); G.Game.togglePause(); });
		await frames(3);
		const h140 = await measure().catch(() => null) || await E(() => ({ hudK: G.HUD.k, hpW: G.HUD.rects().find(r => r.name === 'hp').w * G.HUD.k }));
		A(near(h140.hudK, 720 / 661, 1e-6) && near(h140.hpW / m100.hpW, 720 / 661, 0.01), 'the canvas HUD scales by the same factor (the HP block is 1.09x wider)', JSON.stringify([m100.hpW, h140.hpW]));
		await E(() => { G.Display.setUi(60); });
		await frames(3);
		await E(() => { G.Game.togglePause(); G.SettingsUI.open('gfx'); });
		await sleep(200);
		const m60 = await measure();
		A(near(m60.k, 0.6, 1e-9) && near(m60.btnH / m100.btnH, 0.6, 0.02) && near(m60.hpW / m100.hpW, 0.6, 0.01), '60 % on a desktop: the menus and the HUD at 0.6x', JSON.stringify(m60));
		// the touch buttons follow the HUD; their touch area never shrinks below the 100 % one
		await E(() => { G.SettingsUI.close(); G.Game.togglePause(); G.Display.setUi(100); });
		await frames(3);
		const b100 = await E(() => G.Touch.buttonList());
		await E(() => G.Display.setUi(60));
		await frames(3);
		const b60 = await E(() => G.Touch.buttonList());
		const okT = b60.length === b100.length && b60.every((b, i) => b.w >= b100[i].w - 0.5 && b.h >= b100[i].h - 0.5) && b60.some((b, i) => b.dx < b100[i].dx - 1);
		A(okT, 'at 60 % the HUD buttons are drawn smaller but their touch areas are at least as big as at 100 %', JSON.stringify([b100.slice(0, 2), b60.slice(0, 2)]));
		// reset
		await E(() => { G.Game.togglePause(); G.SettingsUI.open('gfx'); });
		await sleep(200);
		await page.click('#set-ui-reset');
		await sleep(200);
		const rs = await E(() => ({ set: G.Display.uiSet(), k: G.Display.ui(), cls: document.documentElement.classList.contains('ui-scaled'), val: document.getElementById('set-ui-val').innerText }));
		A(rs.set === 100 && rs.k === 1 && !rs.cls && rs.val === '100%', '"Reset" puts it back to 100 % (menu.gd 3989)', JSON.stringify(rs));
		await E(() => { G.SettingsUI.close(); G.Game.togglePause(); });

		// nothing overflows: settings / pause / menu / HUD at min / max on a 1280x720 desktop and an 844x390 phone
		const fits = () => E(() => {
			const bad = [];
			for (const sel of ['#scr-settings .box', '#scr-pause .box', '#scr-menu']) {
				const el = document.querySelector(sel); if (!el || !el.getClientRects().length || el.closest('.hidden')) continue;
				const r = el.getBoundingClientRect();
				if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) bad.push(sel + JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round)));
			}
			if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('scrollWidth');
			return bad;
		});
		for (const [w, h, touch] of [[1280, 720, false], [844, 390, true]]) {
			await view(w, h); await touchOn(touch); if (touch) await page.touchscreen.tap(w - 4, h / 2); await sleep(400);
			for (const v of [60, 140]) {
				await E(v => G.Display.setUi(v), v);
				await frames(3);
				const hud = await E(() => ({ k: G.HUD.k, ov: window.__T.overlaps() }));
				await E(() => { G.Game.togglePause(); });
				await sleep(150);
				const pauseBad = await fits();
				await E(() => G.SettingsUI.open('gfx')); await sleep(200);
				const setBad = await fits();
				const tgt = await E(() => { const bs = [...document.querySelectorAll('#scr-settings button, #scr-settings input[type=range]')].filter(b => b.getClientRects().length).map(b => b.getBoundingClientRect()); return Math.min(...bs.map(b => Math.max(b.height, 0))); });
				await E(() => { G.SettingsUI.close(); G.Game.togglePause(); });
				const wantK = touch ? (v === 60 ? 0.85 : 390 / 360) : (v === 60 ? 0.6 : 720 / 661);
				A(near(hud.k, wantK, 1e-6) && hud.ov.off.length === 0 && pauseBad.length === 0 && setBad.length === 0 && (!touch || tgt >= 24 - 0.5),
					`${w}x${h} at ${v} % (applied ${(hud.k * 100).toFixed(1)} %): the HUD stays on screen, the pause and settings boxes fit${touch ? ', the smallest settings control is ' + tgt.toFixed(1) + ' px tall' : ''}`,
					JSON.stringify({ k: hud.k, off: hud.ov.off, pauseBad, setBad, tgt }));
			}
		}
		await E(() => G.Display.setUi(100));
		await touchOn(false); await view(1280, 720); await sleep(300);
		// the main menu at the extremes
		await E(() => { G.Game.quit(); });
		await waitFor(() => visible('scr-over'), 6000);
		await E(() => { const b = document.getElementById('btn-again'); if (b) b.click(); });
		await waitFor(() => visible('scr-menu'), 6000);
		const menu = [];
		for (const [w, h] of [[1280, 720], [844, 390]]) {
			await view(w, h); await sleep(300);
			for (const v of [60, 140]) {
				await E(v => G.Display.setUi(v), v); await sleep(200);
				menu.push(await E(() => { const els = [...document.querySelectorAll('#scr-menu button, #topbar button')].filter(b => b.getClientRects().length && !b.closest('.hidden')); const out = els.filter(b => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1; }).map(b => b.id || b.className); return { k: G.Display.ui(), out, sw: document.documentElement.scrollWidth <= innerWidth + 1 }; }));
			}
		}
		A(menu.every(m => m.out.length === 0 && m.sw), 'the main menu and the top bar fit at 60 % and at the max on 1280x720 and 844x390', JSON.stringify(menu));
		await E(() => G.Display.setUi(100));
		await view(1280, 720); await sleep(300);
	}

	// ================= 6. no overlap in a busy run =================
	if (!ONLY.length || ONLY.includes('6')) {
		await busy();
		const res = [];
		for (const [w, h, touch, fixed] of [[1280, 720, false, false], [844, 390, true, false], [844, 390, true, true]]) {
			await view(w, h); await touchOn(touch); if (touch) await page.touchscreen.tap(w - 4, h / 2); await E(f => G.Settings.set('stickMode', f ? 'fixed' : 'float'), fixed); await sleep(400);
			for (const v of [60, 100, 140]) {
				await E(v => G.Display.setUi(v), v);
				await frames(4);
				const o = await E(() => window.__T.overlaps());
				res.push({ w, h, fixed, v, mm: o.m && [Math.round(o.m.x), Math.round(o.m.y), Math.round(o.m.w)], hits: o.hits, off: o.off });
				const must = ['hp', 'clock', 'boss', 'weather', 'mode', 'moves', 'team0', 'team1', 'team2', 'swap', 'zmove', 'dynamax'].concat(touch ? ['pause'] : []).concat(fixed ? ['stick'] : []);
				const missing = must.filter(n => !o.names.includes(n));
				A(o.m && o.hits.length === 0 && o.off.length === 0 && missing.length === 0,
					`busy run (Team chips, boss, rift, rain, modifiers, Z + MAX${touch ? ', pause button' : ''}${fixed ? ', fixed joystick' : ''}) at ${w}x${h}, ${v} %: the minimap (${o.m ? [Math.round(o.m.x), Math.round(o.m.y), Math.round(o.m.w)].join(', ') : '-'}) overlaps nothing and every HUD element is on screen`,
					JSON.stringify({ m: o.m, hits: o.hits, off: o.off, missing }));
			}
		}
		const fixedPhone = res.filter(r => r.fixed && r.v === 100)[0], floatPhone = res.filter(r => !r.fixed && r.w === 844 && r.v === 100)[0];
		A(fixedPhone && floatPhone && (fixedPhone.mm[0] !== floatPhone.mm[0] || fixedPhone.mm[1] !== floatPhone.mm[1] || fixedPhone.mm[2] !== floatPhone.mm[2]),
			'with the fixed joystick on a phone the minimap moves to the next free spot', JSON.stringify([floatPhone, fixedPhone]));
		await E(() => { G.Settings.set('stickMode', 'float'); G.Display.setUi(100); });
		await touchOn(false); await view(1280, 720); await sleep(300);
	}

	// ================= 7. the pad, English, persistence =================
	if (!ONLY.length || ONLY.includes('7')) {
		await E(() => { window.__T.start('normal'); G.Game.togglePause(); G.SettingsUI.open('gfx'); });
		await sleep(300);
		const sp = await spanishOn('#scr-settings');
		A(sp.bad.length === 0, 'Settings > Graphics shows no Spanish in English mode', JSON.stringify(sp));
		const rows = await E(() => ({ fov: document.getElementById('set-fov-row').innerText, ui: document.getElementById('set-ui-row').innerText }));
		A(/Field of view/.test(rows.fov) && /165%/.test(rows.fov) && /Interface size/.test(rows.ui) && /100%/.test(rows.ui) && /Reset/.test(rows.ui), 'the rows read "Field of view 165%" and "Interface size 100%" with "Reset"', JSON.stringify(rows));
		await E(() => { G.SettingsUI.close(); });
		const pz = await spanishOn('#scr-pause');
		const pf = await E(() => ({ row: !!document.getElementById('pause-fov-row'), v: document.getElementById('pause-fov').value, txt: document.getElementById('pause-fov-row').innerText }));
		A(pz.bad.length === 0 && pf.row && /Field of view/.test(pf.txt), 'the pause screen has the field-of-view slider (pause_ui.gd _fov_row), in English', JSON.stringify([pz, pf]));
		// the canvas: no Spanish
		await E(() => { G.Game.togglePause(); window.__drawn.clear(); window.__rec = true; });
		await frames(4);
		const drawnTxt = await E(() => { window.__rec = false; return [...window.__drawn]; });
		const bad = drawnTxt.filter(t => SPANISH.test(t.replace(/Pok[ée]mon/g, '')) && !G.DEX.some(p => t.includes(p.name)));
		A(bad.length === 0 && drawnTxt.includes('N'), 'the canvas (HUD + the minimap\'s "N") draws no Spanish', JSON.stringify(bad));
		// the pad: both sliders by the port's step of 5
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await E(() => { G.Game.togglePause(); G.SettingsUI.open('gfx'); });
		await sleep(400);
		await press(13); await sleep(150);
		A(await navTo('#set-fov'), 'the D-pad reaches the field-of-view slider');
		await press(15); await sleep(120);
		const f1 = await E(() => ({ v: G.Display.fov(), w: G.Camera.w, lbl: document.getElementById('set-fov-val').innerText }));
		await press(14); await press(14); await sleep(120);
		const f2 = await E(() => G.Display.fov());
		A(f1.v === 170 && f1.lbl === '170%' && near(f1.w, 768 * 165 / 170, 0.01) && f2 === 160, 'D-pad right: 170 % (the camera follows), left twice: 160 % (steps of 5)', JSON.stringify([f1, f2]));
		A(await navTo('#set-ui'), 'the D-pad reaches the UI-scale slider');
		await press(15); await sleep(150);
		const u1 = await E(() => ({ v: G.Display.uiSet(), k: G.Display.ui() }));
		await press(14); await sleep(150);
		const u2 = await E(() => G.Display.uiSet());
		A(u1.v === 105 && near(u1.k, 1.05, 1e-9) && u2 === 100, 'D-pad right: 105 % (applied), left: 100 %', JSON.stringify([u1, u2]));
		A(await navTo('#set-minimap'), 'the D-pad reaches the minimap switch');
		await press(1); await sleep(200);
		const mOff = await E(() => G.Display.minimapOn());
		await press(1); await sleep(200);
		A(mOff === false && await E(() => G.Display.minimapOn()), 'confirm toggles the minimap off and on');
		await E(() => G.SettingsUI.close()); await sleep(200);
		// the pause screen's slider
		await press(13); await sleep(150);
		A(await navTo('#pause-fov'), 'on the pause screen the D-pad reaches the field-of-view slider');
		await press(15); await sleep(120);
		const pv = await E(() => ({ fov: G.Display.fov(), val: document.getElementById('pause-fov').value, lbl: document.getElementById('pause-fov-val').innerText, foc: (document.querySelector('.pad-focus') || {}).id }));
		A(pv.fov === 165 && pv.lbl === '165%', 'and moves it (160 -> 165)', JSON.stringify(pv));
		await E(() => { window.__pads[0] = null; });
		await sleep(300);
		// persistence: this browser (like the port's local settings), after a reload; not in the account save
		await E(() => { G.Display.setFov(185); G.Display.setUi(120); G.Display.setMinimap(false); G.DB.commit(true); });
		await sleep(500);
		const ls = await E(() => JSON.parse(localStorage.getItem('micasurvivor_settings')));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && !!G.Display), 30000);
		await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
		await waitFor(() => visible('scr-menu'), 10000);
		await helpers();
		const after = await E(() => ({ fov: G.Display.fov(), ui: G.Display.uiSet(), k: G.Display.ui(), mm: G.Display.minimapOn(), camW: G.Camera.w, cls: document.documentElement.classList.contains('ui-scaled'),
			inSave: ['fov', 'uiScale', 'minimap'].some(k => JSON.stringify(G.DB.save).includes('"' + k + '"')) }));
		const row = JSON.stringify(ROW.save || {});
		A(ls.fov === 185 && ls.uiScale === 120 && ls.minimap === false, 'saved in this browser (micasurvivor_settings: fov 185, uiScale 120, minimap false)', JSON.stringify(ls));
		A(after.fov === 185 && after.ui === 120 && near(after.k, Math.min(1.2, 720 / 661), 1e-9) && after.cls && !after.mm && near(after.camW, 768 * 165 / 185, 0.01), 'after a reload: 185 %, 120 % (applied to the menus), minimap off, the camera at 185 %', JSON.stringify(after));
		A(!after.inSave && !/"fov"|"uiScale"|"minimap"/.test(row), 'device-local: not in the save, not in the account row (display preferences per device, like the port\'s local settings)');
		await E(() => { G.Display.setFov(165); G.Display.setUi(100); G.Display.setMinimap(true); });
	}

	// ================= 8. screenshots =================
	if (SHOTS && (!ONLY.length || ONLY.includes('8'))) {
		await helpers();
		const shotsAt = async (tag, w, h, touch) => {
			await view(w, h); await touchOn(touch); if (touch) await page.touchscreen.tap(w - 4, h / 2); await sleep(500);
			await busy();
			for (const [v, f] of [[100, 165], [60, 165], [140, 165], [100, 100], [100, 200]]) {
				await E(([v, f]) => { G.Display.setUi(v); G.Display.setFov(f); }, [v, f]);
				await frames(6);
				await shot(`m5b10_${tag}_ui${v}_fov${f}.png`);
			}
			await E(() => { G.Display.setUi(100); G.Display.setFov(165); G.Game.togglePause(); });
			await sleep(300); await shot(`m5b10_${tag}_pause.png`);
			for (const v of [60, 100, 140]) {
				await E(v => { G.Display.setUi(v); G.SettingsUI.open('gfx'); document.getElementById('set-fov-row').scrollIntoView({ block: 'center' }); }, v);
				await sleep(350); await shot(`m5b10_${tag}_settings_ui${v}.png`);
				await E(() => G.SettingsUI.close());
			}
			await E(() => { G.Display.setUi(100); G.Game.togglePause(); });
		};
		await shotsAt('desktop', 1280, 720, false);
		await shotsAt('landscape', 844, 390, true);
		// portrait: the rotate prompt
		await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
		await sleep(500); await shot('m5b10_portrait.png');
		await E(() => G.Display.setUi(140)); await sleep(300); await shot('m5b10_portrait_ui140.png');
		await E(() => G.Display.setUi(100));
		await touchOn(false); await view(1280, 720);
	}

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
	console.log(errors.slice(0, 5).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
