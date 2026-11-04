// micasurvivor_adaptive_test.mjs — MicaSurvivor M5 batch 9: adaptive difficulty, biome-themed spawns and the
// enemy support caps, from the Godot Android port by JayElDragon (poke-survivor: main.gd 87-104 / 113 /
// 173-177 / 992 / 1037 / 1162-1223 / 3028-3111 / 3228 / 3262 / 3614-3624 / 3663 / 3876-3881 / 4026-4102 / 6292 /
// 8708-8710, menu.gd 4144, save_data.gd 87), driven headlessly while logged in to a stubbed Magepunk account
// (the row micasurvivor:<user> with the server's compare-and-set):
//   - data: the port's numbers (the adaptive curve, the 45 s suffering window, the biome tables, x1.6 / 2 extras,
//     the support caps), English for every new string
//   - the adaptive formula at several player states (new / 4 runs / mid / maxed), MEASURED on real spawned enemies
//     and bosses (HP xk, damage xk^0.7), the spawn rate (xk), the XP per level (xk^0.8), the horde interval (/k),
//     the 45 s suffering window (-0.05 / +0.03, capped, not during a boss), the 0.03/s glide, off in the rift arena
//     and in every other mode, with the modifiers on top, and the Tower sharing its upgrade counts
//   - the "Challenge: N%" HUD under the clock (its colours, hidden when off / in the Daily / in the Tower)
//   - the setting (Settings > Graphics): mouse, touch and pad, saved to the account, after a reload, a 409 merge
//     (the newer save wins), merge() both ways, sanitize()
//   - the Daily Challenge: adaptive never applies and the seeded run (cast, bosses, moves, biome extras) is the same
//   - biome spawns: the bag's weights, thousands of real spawns per biome (themed share up, extras present), the
//     extras' rules (2, the biome's own list first, never a support, not in the cast, tier 0 plain only), the fallback
//     with no candidates, Survival by Type overriding the biome, the Tower's floor biomes; the biome weather
//   - the support caps through a long simulated run (10 simulated minutes of the real spawner + enemy AI, extra
//     summoners / shielders / healers, kills along the way): <= 20 minions, <= 8 per summoner, 4 per summon, shields
//     30 % for 7 s, <= 5 per cast, 14 s before the same one gets another, healers x0.9 above 4
//   - no Spanish on the English screens
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the Challenge HUD, the setting, two biomes with their themed spawns, at
// desktop and phone width.
// Covers micasurvivor/js/systems/adaptive.js, js/data/enemies.js, js/entities/enemy.js, js/entities/player.js,
// js/systems/spawner.js, js/systems/events.js, js/systems/weather.js, js/systems/tower.js, js/systems/modes.js,
// js/game.js, js/ui/hud.js, js/ui/settings-ui.js, js/core/db.js, js/data/lang-en.js, index.html.
//   node overworld/tests/micasurvivor_adaptive_test.mjs
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
const PORT = 8834;
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
	localStorage.setItem('magepunk_mp_token_v1', 'adaptive-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'adaptivetester' }));
	// every string the canvas really draws (after the English translation) and its colour, to look for Spanish
	window.__drawn = new Map();
	addEventListener('DOMContentLoaded', () => {
		const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
		P.fillText = function (s, ...a) { if (window.G && G.I18n && window.__rec) window.__drawn.set(typeof s === 'string' ? G.I18n.t(s) : String(s), String(this.fillStyle)); return orig.call(this, s, ...a); };
	});
};

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|reto|dificultad|adaptativa|partida|vida|daño|enemigos|hordas|nivel|mejoras|derrotados|monedas|sí|bosque|cueva|volcán)\b/i;

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
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name) => { await E(() => { document.querySelectorAll('#ach-pop, .toast').forEach(e => { e.style.display = 'none'; }); if (G.Game.state !== 'ui') G.Spawner.say('', 0); }); await sleep(150); if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const E = (fn, ...a) => page.evaluate(fn, ...a);
	const press = async (b) => { await E(b => __btn(b, true), b); await sleep(90); await E(b => __btn(b, false), b); await sleep(110); };
	const navTo = async (sel) => {
		for (let i = 0; i < 80; i++) {
			const d = await E(sel => {
				const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
				if (!f || !t) return 'missing';
				if (f === t || f.contains(t) || t.contains(f)) return 'here';
				const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
				const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
				return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 13 : 12) : (dx > 0 ? 15 : 14);
			}, sel);
			if (d === 'here') return true;
			if (d === 'missing') return false;
			await press(d);
		}
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
	const phone = () => page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
	const desktop = () => page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	// helpers inside the page
	const helpers = () => E(() => {
		window.__T = {
			withRandom(v, fn) { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } },
			/** the port's _adapt_target, written out again */
			want(runs, perm, power, adj = 0) {
				const cl = (v, a, b) => Math.max(a, Math.min(b, v)), sm = x => x * x * (3 - 2 * x);
				const pb = sm(cl(perm / 40, 0, 1)), x = sm(cl(power / 70, 0, 1));
				let k = 0.62 + 0.38 * pb + (0.2 + 0.3 * pb) * x;
				if (runs < 8) k *= 0.9 + 0.1 * runs / 8;
				return cl(k + adj, 0.55, 1.5);
			},
			/** spreads `n` levels over the real permanent upgrades (each up to its max) */
			perm(n) { const o = {}; for (const u of G.Upgrades.LIST) { if (n <= 0) break; const v = Math.min(u.max, n); o[u.id] = v; n -= v; } return o; },
			/** a normal (or other) run, paused, with no enemies and nothing that can hurt or level us */
			start(mode = 'normal') {
				G.Game.startRun(null, mode);
				if (G.Game.state === 'playing') G.Game.togglePause();
				G.UI.hideAll();
				const pl = G.Game.player; pl.invuln = 1e9; G.EnemyMgr.clear();
				return G.Game.mode;
			},
			/** one real enemy from the spawner with a fixed draw */
			spawn(t, v = 0.37) { const free = G.World.isFree; G.World.isFree = () => true; try { G.EnemyMgr.clear(); const e = this.withRandom(v, () => G.Spawner.spawnOne(G.Game.player, t)); G.EnemyMgr.clear(); return e; } finally { G.World.isFree = free; } },
		};
	});

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.Adaptive), 30000), 'boots logged in (Magepunk account); G.Adaptive loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await E(() => {
		const s = G.DB.save;
		s.owned = { 4: { at: 1000, from: 'starter' }, 1: { at: 2000, from: 'gacha' } };
		s.partner = 4; s.partnerShiny = false; s.modes = {}; s.pupg = {}; s.stats.runs = 0;
		G.DB.commit(true);
	});
	await helpers();

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const strings = ['Reto: 87%', 'Reto: 100%', 'Dificultad adaptativa', 'En la partida normal, el juego empieza fácil y se pone más difícil según tus mejoras: más vida y daño, más enemigos, hordas más seguidas y más experiencia por nivel.'];
			return {
				K: G.Adaptive.K, types: G.Enemies.BIOME_TYPES, dex: G.Enemies.BIOME_DEX, extra: G.Enemies.BIOME_EXTRA, mul: G.Enemies.BIOME_W_MUL, base: G.Enemies.BASE_BIOMES,
				caps: G.Enemy.SUPPORT_CAPS, support: G.Enemies.SUPPORT, plain: G.Enemies.PLAIN,
				keys: [0, 1, 2, 3, 4, 20, 21, 22, -1].map(b => G.Enemies.biomeKey(b)), n: G.Tiles.BIOMES.length,
				en: strings.map(s => [s, G.I18n.t(s)]),
				script: !!document.querySelector('script[src="js/systems/adaptive.js"]'),
			};
		});
		A(JSON.stringify(r.K) === JSON.stringify({ base: 0.62, perm: 0.38, push: 0.2, pushPerm: 0.3, permFull: 40, powerFull: 70, lvl: 0.5, evo: 3, newRuns: 8, newK: 0.9, min: 0.55, max: 1.5,
			every: 45, hurtHi: 0.5, lowHp: 0.3, hurtLo: 0.08, down: 0.05, up: 0.03, adjMin: -0.2, adjMax: 0.1, glide: 0.03, dmgExp: 0.7, xpExp: 0.8 }),
			'the port\'s adaptive numbers (main.gd 1168-1223): 0.62 + 0.38 perm + (0.2 + 0.3 perm) power, perm / 40, power / 70, x0.9 under 8 runs, 0.55-1.5, every 45 s -0.05 / +0.03 (-0.2..+0.1), 0.03/s, damage ^0.7, XP ^0.8', JSON.stringify(r.K));
		A(JSON.stringify(r.types) === JSON.stringify({ forest: ['bug', 'grass'], cave: ['rock', 'ground'], volcano: ['fire'], beach: ['water', 'ground'], sky: ['flying', 'dragon'] })
			&& JSON.stringify(r.dex.cave) === '[41,42,169,527,528,714,715]' && r.dex.beach.length === 28 && r.extra === 2 && r.mul === 1.6 && r.base.join() === 'forest,cave,volcano',
			'the port\'s biome tables (main.gd 87-104): BIOME_TYPES, BIOME_DEX (the cave bats, 28 coast Pokémon), 2 extras a tier, x1.6', JSON.stringify([r.types, r.extra, r.mul]));
		A(JSON.stringify(r.keys) === JSON.stringify(['forest', 'cave', 'volcano', 'normal', 'fire', 'fairy', 'judgment', 'forest', 'judgment']) && r.n === 22,
			'biome keys (main.gd _biome_key): forest / cave / volcano, then each rift arena\'s type (wrapping)', JSON.stringify(r.keys));
		A(JSON.stringify(r.caps) === JSON.stringify({ healers: 4, healerK: 0.9, shieldK: 0.3, shieldT: 7, shieldLock: 14, shieldMax: 5, shieldCd: 8, shieldR: 160, perCast: 4, perSummoner: 8, minions: 20, capPad: 15 })
			&& r.support.join() === 'healer,shielder,summoner' && r.plain.join() === 'chase,charger,ranged,tank',
			'the port\'s support caps (main.gd 4026-4102): healers x0.9 above 4, shields 30 % / 7 s / 14 s lock / 5 a cast / every 8 s, 4 minions a summon, 8 per summoner, 20 on the map', JSON.stringify(r.caps));
		const bad = r.en.filter(([es, en]) => es === en || SPANISH.test(en));
		A(bad.length === 0 && r.en[0][1] === 'Challenge: 87%' && r.en[2][1] === 'Adaptive difficulty', 'every new string has English (the port\'s lang_en.json: "Challenge: 87%", "Adaptive difficulty", its description)', JSON.stringify(r.en));
		A(r.script, 'index.html loads js/systems/adaptive.js');
	}

	// ================= 2. the adaptive formula, measured on real enemies =================
	if (!ONLY.length || ONLY.includes('2')) {
		const r = await E(() => {
			const T = window.__T, A = G.Adaptive, s = G.DB.save;
			const out = { states: [], bad: [] };
			out.mode = T.start('normal');
			const pl = G.Game.player;
			out.start = { raw: A.raw, on: A.on(), xpNext: pl.xpNext, xp1: G.Player.xpFor(1) };
			// player states: [runs, perm upgrades, stat cards, move levels, evolved, level]
			const STATES = [['new', 0, 0, {}, [1], 0, 1], ['4 runs', 4, 0, { hp: 2 }, [3, 2], 0, 6], ['mid', 12, 20, { hp: 6, atk: 5, spd: 2 }, [5, 4, 3], 1, 15], ['maxed', 40, 60, { hp: 15, atk: 12, cd: 8, def: 6 }, [8, 8, 8, 8], 3, 40]];
			const base = pl.moves[0];
			for (const [name, runs, perm, stats, lvls, evo, level] of STATES) {
				s.stats.runs = runs; s.pupg = { [pl.dex]: T.perm(perm) };
				pl.statsTaken = Object.assign({}, stats); pl.level = level;
				pl.moves = lvls.map((l, i) => Object.assign({}, base, { lvl: l, evolved: i < evo }));
				A.debugSet({ adj: 0 });
				A.update(0, pl, G.Game.st.time);
				const power = Object.values(stats).reduce((a, b) => a + b, 0) + lvls.reduce((a, b) => a + b, 0) + 3 * evo + level * 0.5;
				const want = T.want(runs, A.permUps(pl.dex), power);
				const k = A.k(), pw = A.power(pl);
				// real spawns: the same Pokémon, adaptive on vs off
				const t = 200;
				const on = T.spawn(t); A.setEnabled(false); const off = T.spawn(t); A.setEnabled(true);
				A.update(0, pl, G.Game.st.time);
				const b = G.Enemies.BOSSES[1];
				G.EnemyMgr.clear(); const bon = T.withRandom(0.37, () => G.Spawner.spawnBoss(pl, 300, b)); G.EnemyMgr.clear();
				A.setEnabled(false); const boff = T.withRandom(0.37, () => G.Spawner.spawnBoss(pl, 300, b)); G.EnemyMgr.clear(); A.setEnabled(true); A.update(0, pl, G.Game.st.time);
				// XP for the next level
				pl.xp = 0; pl.xpMul = 1; pl.xpNext = G.Player.xpNeed(pl.level); pl.gainXp(pl.xpNext + 0.001);
				out.states.push({ name, runs, perm: A.permUps(pl.dex), power: pw, wantPower: power, k, want, pct: A.pct(),
					hp: [on.maxHp, off.maxHp], dmg: [on.dmg, off.dmg], same: on.dex === off.dex, boss: [bon.maxHp, boff.maxHp, bon.dmg, boff.dmg],
					xp: [pl.xpNext, G.Player.xpFor(pl.level)], lvl: pl.level });
			}
			// the spawn rate: 25 s of the real spawner at t = 150, on (k of the maxed state) and off
			const count = () => {
				const add = G.EnemyMgr.add, boss = G.EnemyMgr.bossAlive, free = G.World.isFree; let n = 0;
				G.EnemyMgr.add = e => { if (!e.boss) n++; }; G.EnemyMgr.bossAlive = () => false; G.World.isFree = () => true;
				try { G.Spawner.reset(); for (let i = 0; i < 250; i++) G.Spawner.update(0.1, [pl], 150); }
				finally { G.EnemyMgr.add = add; G.EnemyMgr.bossAlive = boss; G.World.isFree = free; }
				return n;
			};
			const kr = A.k();
			const n1 = count(); A.setEnabled(false); const n0 = count(); A.setEnabled(true); A.update(0, pl, G.Game.st.time);
			out.rate = { n1, n0, k: kr, want1: G.Spawner.rate(150) * 25 * kr, want0: G.Spawner.rate(150) * 25 };
			// the horde / golden hour interval: rand(240, 300) / k
			const boss = G.EnemyMgr.bossAlive; G.EnemyMgr.bossAlive = () => false;
			try { G.Events.reset(); G.Events.debugNext(0.0001); T.withRandom(0.5, () => G.Events.update(0.01, [pl], 400)); } finally { G.EnemyMgr.bossAlive = boss; }
			out.ev = { next: G.Events.nextT, k: A.k(), want: 270 / A.k() };
			G.Events.reset(); G.EnemyMgr.clear();
			// modifiers stack on top: Tough (x1.6 HP) and Heavy hitters (x1.5 damage)
			G.Modes.begin({ mode: 'normal', mods: ['tank', 'hard'] });
			const mk = A.k();
			const mon = T.spawn(200); A.setEnabled(false); const moff = T.spawn(200); A.setEnabled(true); A.update(0, pl, G.Game.st.time);
			out.mods = { hp: [mon.maxHp, moff.maxHp], dmg: [mon.dmg, moff.dmg], k: mk, tank: mon.modsDone };
			G.Modes.begin({ mode: 'normal' });
			// the Tower shares the same counts (lote 8's _tower_adapt)
			const prevMode = G.Game.mode;
			out.tower = { tw: G.Tower.adapt(pl), ru: G.Adaptive.runUps(pl), pu: G.Adaptive.permUps(pl.dex) };
			G.Game.mode = prevMode;
			return out;
		});
		A(r.mode === 'normal' && r.start.raw === 1 && r.start.on && r.start.xpNext === r.start.xp1, 'a normal run starts at 100 % (the port\'s adapt_k = 1.0), adaptive on; level 1 needs the plain XP', JSON.stringify(r.start));
		for (const st of r.states) {
			A(near(st.k, st.want, 1e-9) && near(st.power, st.wantPower, 1e-9) && st.pct === Math.round(st.want * 100),
				`${st.name}: power ${st.power} (stat cards + move levels + 3 per evolved + level / 2), ${st.perm} permanent upgrades, ${st.runs} runs -> k = ${st.want.toFixed(4)} (${st.pct} %)`, JSON.stringify(st));
			A(st.same && Math.abs(st.hp[0] - st.hp[1] * st.k) <= 1 && near(st.dmg[0] / st.dmg[1], Math.pow(st.k, 0.7), 1e-9),
				`${st.name}: a real spawned enemy has x${st.k.toFixed(3)} HP (${st.hp[0]} vs ${st.hp[1]}) and x${Math.pow(st.k, 0.7).toFixed(3)} damage (main.gd 3111)`, JSON.stringify(st));
			A(Math.abs(st.boss[0] - st.boss[1] * st.k) <= 1 && near(st.boss[2] / st.boss[3], Math.pow(st.k, 0.7), 1e-9), `${st.name}: a real boss too (main.gd 3228)`, JSON.stringify(st.boss));
			A(near(st.xp[0], st.xp[1] * Math.pow(st.k, 0.8), 1e-6), `${st.name}: level ${st.lvl} needs x${Math.pow(st.k, 0.8).toFixed(3)} XP (main.gd _xp_need)`, JSON.stringify(st.xp));
		}
		const ks = r.states.map(s => s.k);
		A(near(ks[0], 0.62 * 0.9 + 0.2 * 0.9 * (1.5 / 70) ** 2 * (3 - 2 * 1.5 / 70), 1e-9) && ks[3] === 1.5 && ks[0] < ks[1] && ks[1] < ks[2] && ks[2] < ks[3],
			'it starts easy for a new player (~56 %), grows with upgrades and tops out at 150 %', JSON.stringify(ks));
		A(Math.abs(r.rate.n1 - r.rate.want1) <= 1.01 && Math.abs(r.rate.n0 - r.rate.want0) <= 1.01 && r.rate.n1 > r.rate.n0,
			`the real spawner: ${r.rate.n1} enemies in 25 s at 150 % vs ${r.rate.n0} with it off (x k, main.gd 3262)`, JSON.stringify(r.rate));
		A(near(r.ev.next, r.ev.want, 1e-6) && r.ev.k === 1.5, 'the next horde / golden hour comes after rand(240, 300) / k (270 / 1.5 = 180 s; main.gd 3663)', JSON.stringify(r.ev));
		A(r.mods.tank && Math.abs(r.mods.hp[0] - r.mods.hp[1] * r.mods.k) <= 2 && near(r.mods.dmg[0] / r.mods.dmg[1], Math.pow(r.mods.k, 0.7), 1e-9),
			'with the Tough and Heavy hitters modifiers the adaptive factor still applies on top (both multiply)', JSON.stringify(r.mods));
		A(r.tower.tw.ru === r.tower.ru && r.tower.tw.pu === r.tower.pu && r.tower.ru === 32 + 41 && r.tower.pu === 60,
			'the Tower\'s adaptive scaling counts the same upgrades (G.Adaptive.runUps / permUps: stat cards + move levels, no evolution bonus; permanent upgrades)', JSON.stringify(r.tower));

		// the 45 s suffering window, the glide, the arena and the other modes
		const w = await E(() => {
			const A = G.Adaptive, pl = G.Game.player, out = {};
			const t0 = G.Game.st.time;
			const win = (drop, setHp) => { A.debugSet({ next: t0, taken: 0, prevHp: pl.hp }); if (setHp != null) { pl.hp = setHp; A.debugSet({ prevHp: pl.hp }); } pl.hp -= drop; A.update(0, pl, t0); const r = { adj: A.adj, k: A.k(), next: A.next }; pl.hp = pl.maxHp; return r; };
			pl.hp = pl.maxHp;
			A.debugSet({ adj: 0 });
			out.hurt = win(pl.maxHp * 0.6);              // lost 60 %: -0.05
			out.calm = win(pl.maxHp * 0.02);             // lost 2 %: +0.03
			out.mid = win(pl.maxHp * 0.2);               // lost 20 %: unchanged
			out.low = win(0, pl.maxHp * 0.25);           // below 30 % HP: -0.05
			A.debugSet({ adj: 0 }); for (let i = 0; i < 10; i++) win(pl.maxHp * 0.01); out.capUp = A.adj;
			A.debugSet({ adj: 0 }); for (let i = 0; i < 10; i++) win(pl.maxHp * 0.9); out.capDown = A.adj;
			const boss = G.EnemyMgr.bossAlive; G.EnemyMgr.bossAlive = () => true;
			A.debugSet({ adj: 0 }); out.boss = win(pl.maxHp * 0.9);
			G.EnemyMgr.bossAlive = boss;
			out.notYet = (() => { A.debugSet({ adj: 0, next: t0 + 10, taken: 0, prevHp: pl.hp }); pl.hp -= pl.maxHp * 0.6; A.update(0, pl, t0); const r = { adj: A.adj, taken: A.taken }; pl.hp = pl.maxHp; return r; })();
			// maxed player (target 1.5): with -0.2 the target is 1.3
			A.debugSet({ adj: -0.2 }); A.update(0, pl, t0); out.withAdj = A.k();
			A.debugSet({ adj: 0 }); A.update(0, pl, t0);
			// the glide: 0.03 per second towards the target
			G.DB.save.stats.runs = 0; G.DB.save.pupg = {}; pl.statsTaken = {}; pl.level = 1; pl.moves = pl.moves.slice(0, 1).map(m => Object.assign({}, m, { lvl: 1, evolved: false }));
			A.debugSet({ k: 1, adj: 0, next: t0 + 999 });
			A.update(1, pl, t0); out.glide1 = A.raw;
			A.update(2, pl, t0); out.glide3 = A.raw;
			A.update(100, pl, t0); out.glideEnd = A.raw; out.target = A.target(pl);
			// the rift arena: off (and back to 100 %), like the port's arena != null
			const d = Object.getOwnPropertyDescriptor(G.Rift, 'inArena');
			Object.defineProperty(G.Rift, 'inArena', { configurable: true, get: () => true });
			A.update(1, pl, t0); out.arena = { raw: A.raw, k: A.k(), pct: A.pct(), on: A.on(), hp: G.Enemies.scale(100).hp, want: 1 + 100 / 95 };
			Object.defineProperty(G.Rift, 'inArena', d);
			// every other mode: k = 1
			out.modes = {};
			for (const m of ['daily', 'party', 'rifts', 'type', 'team', 'rush', 'tower']) { G.Game.mode = m; A.debugSet({ k: 0.6 }); out.modes[m] = [A.on(), A.k(), A.pct(), G.Enemies.scale(100).hp === 1 + 100 / 95, A.xpK()]; }
			G.Game.mode = 'normal'; A.debugSet({ k: 0.6 });
			out.normal = [A.on(), A.k(), A.pct()];
			// the setting off: k = 1 at once
			A.setEnabled(false); out.off = [A.on(), A.k(), A.pct(), G.DB.save.modes.adaptive]; A.setEnabled(true);
			out.onAgain = [A.on(), G.DB.save.modes.adaptive === undefined];
			return out;
		});
		A(near(w.hurt.adj, -0.05) && near(w.calm.adj, -0.02) && near(w.mid.adj, -0.02) && near(w.low.adj, -0.07) && w.hurt.next === w.calm.next,
			'every 45 s: lost > 50 % of max HP -> -0.05; < 8 % -> +0.03; in between unchanged; under 30 % HP -> -0.05 (main.gd 1198-1210)', JSON.stringify(w));
		A(near(w.capUp, 0.1) && near(w.capDown, -0.2) && near(w.boss.adj, 0) && near(w.notYet.adj, 0) && w.notYet.taken > 0,
			'the adjustment stays within -0.2..+0.1, is skipped while a boss is alive, and only counts at the 45 s mark (damage accumulates meanwhile)', JSON.stringify(w));
		A(near(w.withAdj, 1.3, 1e-9), 'the adjustment shifts the target (maxed: 1.5 - 0.2 = 1.3)', w.withAdj);
		A(near(w.glide1, 0.97, 1e-9) && near(w.glide3, 0.91, 1e-9) && near(w.glideEnd, w.target, 1e-9), 'k glides 0.03 per second towards the target (1 -> 0.97 -> 0.91 -> the target)', JSON.stringify(w));
		A(w.arena.raw === 1 && w.arena.k === 1 && w.arena.pct === 0 && !w.arena.on && near(w.arena.hp, w.arena.want, 1e-12), 'in the rift arena it is off and resets to 100 % (main.gd _adapt_on: arena == null)', JSON.stringify(w.arena));
		A(Object.values(w.modes).every(([on, k, pct, sc, xk]) => !on && k === 1 && pct === 0 && sc && xk === 1) && w.normal[0] && w.normal[1] === 0.6 && w.normal[2] === 60,
			'only the normal run: the Daily, Party, Rift Time Attack, Survival by Type, Team, Boss Rush and Tower get k = 1 (main.gd 1165)', JSON.stringify(w.modes));
		A(!w.off[0] && w.off[1] === 1 && w.off[2] === 0 && w.off[3] === false && w.onAgain[0] && w.onAgain[1], 'the setting off: k = 1 at once (save.modes.adaptive = false); on again removes it', JSON.stringify([w.off, w.onAgain]));
	}

	// ================= 3. the "Challenge: N%" HUD =================
	if (!ONLY.length || ONLY.includes('3')) {
		const hud = async (k) => {
			await E(k => { window.__drawn.clear(); window.__rec = true; if (k != null) G.Adaptive.debugSet({ k }); }, k);
			await sleep(350);
			return E(() => { window.__rec = false; const ch = [...window.__drawn].filter(([t]) => /^Challenge: \d+%$/.test(t)); return { ch, all: [...window.__drawn.keys()], pct: G.Adaptive.pct() }; });
		};
		await E(() => { window.__T.start('normal'); G.UI.hideAll(); });
		const h1 = await hud(0.8), h2 = await hud(1), h3 = await hud(1.2);
		A(h1.ch.length === 1 && h1.ch[0][0] === 'Challenge: 80%' && h1.ch[0][1] === '#8fe39b', 'under the clock: "Challenge: 80%" in green (below 100; main.gd 8708-8710)', JSON.stringify(h1.ch));
		A(h2.ch.length === 1 && h2.ch[0][0] === 'Challenge: 100%' && h2.ch[0][1] === '#ffd23f', '"Challenge: 100%" in gold', JSON.stringify(h2.ch));
		A(h3.ch.length === 1 && h3.ch[0][0] === 'Challenge: 120%' && h3.ch[0][1] === '#ff9a5a', '"Challenge: 120%" in orange (above 100)', JSON.stringify(h3.ch));
		const spanishHud = h1.all.filter(t => SPANISH.test(t.replace(/Pok[ée]mon/g, '')));
		A(spanishHud.length === 0, 'the HUD draws no Spanish in English mode', JSON.stringify(spanishHud));
		await E(() => G.Adaptive.debugSet({ k: 0.87 }));
		await sleep(300);
		await shot('adaptive_hud.png');
		// with a boss alive the boss bar moves below the line
		await E(() => { G.EnemyMgr.clear(); const pl = G.Game.player; const e = G.Spawner.spawnBoss(pl, 200, G.Enemies.BOSSES[0]); e.x = pl.x + 120; e.y = pl.y; e.spd = 0; });
		await sleep(600);
		await shot('adaptive_hud_boss.png');
		await phone();
		await sleep(600);
		await shot('adaptive_hud_phone.png');
		const fit = await E(() => ({ w: innerWidth, sw: document.documentElement.scrollWidth }));
		A(fit.sw <= fit.w + 1, 'phone width (844x390): nothing overflows sideways', JSON.stringify(fit));
		await desktop();
		await sleep(300);
		await E(() => G.EnemyMgr.clear());
		// off -> gone; the Daily and the Tower never show it
		await E(() => G.Adaptive.setEnabled(false));
		const h4 = await hud(null);
		await E(() => G.Adaptive.setEnabled(true));
		await E(() => { window.__T.start('daily'); G.UI.hideAll(); });
		const h5 = await hud(null);
		await E(() => { window.__T.start('tower'); G.UI.hideAll(); });
		const h6 = await hud(null);
		A(h4.ch.length === 0 && h5.ch.length === 0 && h6.ch.length === 0, 'no "Challenge" line with the setting off, in the Daily Challenge or in the Tower', JSON.stringify([h4.ch, h5.ch, h6.ch]));
		await E(() => { window.__T.start('normal'); });
	}

	// ================= 4. the setting: mouse, touch, pad, the account, a reload, a 409 =================
	if (!ONLY.length || ONLY.includes('4')) {
		await E(() => G.Game.quit());
		await waitFor(() => visible('scr-over'), 6000);
		await E(() => { const b = document.getElementById('btn-again'); if (b) b.click(); });
		await waitFor(() => visible('scr-menu'), 6000);
		await E(() => G.SettingsUI.open('gfx'));
		await sleep(300);
		const s0 = await E(() => { const b = document.getElementById('set-adaptive'), row = document.getElementById('set-adaptive-row'); return { btn: b && b.innerText, row: row && row.innerText, on: G.Adaptive.enabled() }; });
		A(s0.btn === 'Yes' && /Adaptive difficulty/.test(s0.row) && /In normal runs, the game starts easy and gets harder as you upgrade/.test(s0.row) && s0.on,
			'Settings > Graphics: "Adaptive difficulty" (the port\'s wording), on by default (save_data.gd 87)', JSON.stringify(s0));
		const sp = await spanishOn('#scr-settings');
		A(sp.bad.length === 0, 'the settings screen shows no Spanish in English mode', JSON.stringify(sp));
		await E(() => document.getElementById('set-adaptive-row').scrollIntoView({ block: 'center' }));
		await sleep(150);
		await shot('adaptive_setting.png');
		await page.click('#set-adaptive');
		await sleep(250);
		const s1 = await E(() => ({ btn: document.getElementById('set-adaptive').innerText, on: G.Adaptive.enabled(), saved: G.DB.save.modes.adaptive }));
		A(s1.btn === 'No' && !s1.on && s1.saved === false, 'a click turns it off (save.modes.adaptive = false)', JSON.stringify(s1));
		await E(() => G.DB.commit(true));   // (a menu choice is pushed with the next save; flush it now)
		A(await waitFor(() => ROW.save && ROW.save.modes && ROW.save.modes.adaptive === false, 8000), 'it reaches the account row', JSON.stringify(ROW.save && ROW.save.modes));
		// touch at phone width
		await E(() => G.SettingsUI.close());
		await phone(); await touchOn(true); await sleep(400);
		await E(() => G.SettingsUI.open('gfx')); await sleep(300);
		await tapEl('#set-adaptive'); await sleep(250);
		const s2 = await E(() => { const r = document.getElementById('set-adaptive-row').getBoundingClientRect(), b = document.getElementById('set-adaptive').getBoundingClientRect(); return { on: G.Adaptive.enabled(), btn: document.getElementById('set-adaptive').innerText, inside: r.left >= 0 && r.right <= innerWidth + 1 && b.right <= innerWidth + 1, sw: document.documentElement.scrollWidth <= innerWidth + 1 }; });
		A(s2.on && s2.btn === 'Yes' && s2.inside && s2.sw, 'a tap turns it back on at phone width; the row fits (844x390)', JSON.stringify(s2));
		await E(() => document.getElementById('set-adaptive-row').scrollIntoView({ block: 'center' }));
		await sleep(150);
		await shot('adaptive_setting_phone.png');
		await E(() => G.SettingsUI.close());
		await touchOn(false); await desktop(); await sleep(400);
		// the pad
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await E(() => G.SettingsUI.open('gfx')); await sleep(400);
		await press(13); await sleep(150);
		const reached = await navTo('#set-adaptive');
		A(reached, 'the D-pad reaches the "Adaptive difficulty" switch');
		await press(1); await sleep(250);
		const s3 = await E(() => G.Adaptive.enabled());
		A(s3 === false, 'confirm on the pad turns it off', s3);
		await E(() => { window.__pads[0] = null; G.SettingsUI.close(); });
		await sleep(300);
		// a reload keeps it (the save and the account row)
		await E(() => G.DB.commit(true));
		await waitFor(() => ROW.save && ROW.save.modes && ROW.save.modes.adaptive === false, 8000);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && !!G.Adaptive), 30000);
		await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
		A(await waitFor(() => visible('scr-menu'), 10000), 'after a reload: the menu');
		await helpers();
		const s4 = await E(() => { G.SettingsUI.open('gfx'); return { on: G.Adaptive.enabled(), btn: document.getElementById('set-adaptive').innerText }; });
		A(!s4.on && s4.btn === 'No', 'after a reload it is still off', JSON.stringify(s4));
		await E(() => G.SettingsUI.close());
		// 409: a newer save from another device turned it back on
		const other = JSON.parse(JSON.stringify(ROW.save));
		delete other.modes.adaptive; other.updated = Date.now() + 5000;
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => ({ on: G.Adaptive.enabled(), modes: G.DB.save.modes }));
		A(ROW.rev > rev0 && m.on && ROW.save.modes.adaptive === undefined, 'a 409 from a newer save that has it on: the newer choice wins (like the other menu choices)', JSON.stringify(m));
		const u = await E(() => {
			const base = () => JSON.parse(JSON.stringify(G.DB.save));
			const a = base(), b = base();
			a.updated = 2000; b.updated = 1000; a.modes.adaptive = false; delete b.modes.adaptive;
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			a.updated = 500; const r3 = G.DB.merge(a, b);
			const noModes = base(); delete noModes.modes; noModes.updated = 3000; const r4 = G.DB.merge(noModes, a);
			const bad = base(); bad.modes.adaptive = 'nope'; G.DB.sanitize(bad);
			const yes = base(); yes.modes.adaptive = true; G.DB.sanitize(yes);
			const no = base(); no.modes.adaptive = false; G.DB.sanitize(no);
			return { r1: r1.modes.adaptive, r2: r2.modes.adaptive, r3: r3.modes.adaptive, r4: r4.modes.adaptive, bad: 'adaptive' in bad.modes, yes: 'adaptive' in yes.modes, no: no.modes.adaptive,
				en: [G.Adaptive.enabled(r1), G.Adaptive.enabled(r3), G.Adaptive.enabled({}), G.Adaptive.enabled(null)] };
		});
		A(u.r1 === false && u.r2 === false && u.r3 === undefined && u.r4 === false, 'merge() both ways: the newer save\'s choice wins; a save with no menu choices takes the other\'s', JSON.stringify(u));
		A(!u.bad && !u.yes && u.no === false && JSON.stringify(u.en) === '[false,true,true,true]', 'sanitize() keeps only "off" (anything else means on); a save without it is on', JSON.stringify(u));
		await E(() => { G.Adaptive.setEnabled(true); G.DB.commit(true); });
	}

	// ================= 5. the Daily Challenge: unaffected =================
	if (!ONLY.length || ONLY.includes('5')) {
		const r = await E(() => {
			const T = window.__T;
			const snap = () => {
				const pl = G.Game.player, E = G.Enemies;
				return {
					mode: G.Game.mode, dex: pl.dex, mods: G.Modes.mods, moves: pl.moves.map(m => m.id),
					cast: E.cast.map(t => t.list.map(d => d.dex + ':' + d.behavior)), bosses: E.BOSSES.map(b => b.dex),
					extras: ['forest', 'cave', 'volcano', 'fire', 'water', 'bug'].map(k => E.TIERS.map((_, ti) => E.bioExtra(ti, k).map(d => d.dex))),
					on: G.Adaptive.on(), k: G.Adaptive.k(), pct: G.Adaptive.pct(), xp: pl.xpNext === G.Player.xpFor(1),
					hp: G.Enemies.scale(300).hp === 1 + 300 / 95, rate: G.Adaptive.rateK(),
				};
			};
			T.start('daily'); G.Adaptive.debugSet({ k: 0.6 }); const a = snap();
			T.start('normal'); const n = snap();
			T.start('daily'); const b = snap();
			return { a, b, n, same: JSON.stringify(a) === JSON.stringify(b) };
		});
		A(r.a.mode === 'daily' && !r.a.on && r.a.k === 1 && r.a.pct === 0 && r.a.xp && r.a.hp && r.a.rate === 1, 'the Daily Challenge never uses adaptive difficulty (the same run for everyone): k = 1, no Challenge %, plain XP and enemy scaling', JSON.stringify(r.a).slice(0, 300));
		A(r.same, 'two Daily starts are identical: Pokémon, rule, moves, enemy cast, bosses and every tier\'s biome extras (their own seed: the day\'s)', JSON.stringify([r.a.cast[0], r.b.cast[0], r.a.extras[1], r.b.extras[1]]));
		A(JSON.stringify(r.n.cast) !== JSON.stringify(r.a.cast) || JSON.stringify(r.n.extras) !== JSON.stringify(r.a.extras), 'a normal run in between rolls its own (unseeded) cast and extras', JSON.stringify(r.n.cast[0]));
	}

	// ================= 6. biome spawns =================
	if (!ONLY.length || ONLY.includes('6')) {
		const r = await E(() => {
			const T = window.__T, E = G.Enemies, out = { biomes: [], bad: [] };
			T.start('normal');
			const pl = G.Game.player;
			const t = 100;
			const plainBag = E.bagAt(t, '');
			for (const b of [0, 1, 2, 4, 9]) {
				G.World.setBiome(b, true);
				const key = E.biomeNow();
				const bag = E.bagAt(t);
				// the bag's weights, recounted: tiers 0 and 1 are live at 100 s (weight 10, x1.6 = 16 for the biome's)
				const counts = new Map(); for (const d of bag) counts.set(d, (counts.get(d) || 0) + 1);
				let wrong = 0, fitW = 0, total = 0, extras = [];
				E.cast.forEach((tier, ti) => {
					if (t < tier.from) return;
					for (const d of tier.list) { const f = E.fitsBiome(G.DEX_BY[d.dex], key); const w = f ? 16 : 10; if (counts.get(d) !== w) wrong++; total += w; if (f) fitW += w; }
					for (const d of E.bioExtra(ti, key)) { if (counts.get(d) !== 16) wrong++; total += 16; fitW += 16; extras.push({ ti, dex: d.dex, beh: d.behavior }); }
				});
				// thousands of real spawns
				const add = G.EnemyMgr.add, free = G.World.isFree; let n = 0, fits = 0, ext = 0;
				const exDex = new Set(extras.map(x => x.dex));
				G.EnemyMgr.add = e => { n++; if (E.fitsBiome(G.DEX_BY[e.dex], key)) fits++; if (exDex.has(e.dex)) ext++; return e; };
				G.World.isFree = () => true;
				try { for (let i = 0; i < 4000; i++) G.Spawner.spawnOne(pl, t); } finally { G.EnemyMgr.add = add; G.World.isFree = free; }
				// the plain share of the same species (no biome): what the biome adds
				let plainFit = 0; for (const d of plainBag) if (E.fitsBiome(G.DEX_BY[d.dex], key)) plainFit++;
				out.biomes.push({ b, key, name: G.World.biomeName(), bagLen: bag.length, total, wrong, share: fitW / total, seen: fits / n, plainShare: plainFit / plainBag.length, extras, ext: ext / n, n });
			}
			// the extras' rules, for every tier and biome key
			const keys = ['forest', 'cave', 'volcano'].concat(G.Tiles.ARENA_TYPES);
			for (let ti = 0; ti < E.TIERS.length; ti++) for (const key of keys) {
				const tier = E.TIERS[ti], ex = E.bioExtra(ti, key), castDex = new Set(E.cast[ti].list.map(d => d.dex));
				const pool = E.candidates(tier).filter(p => !castDex.has(p.dex) && E.fitsBiome(p, key) && !E.SUPPORT.includes(E.behaviorOf(p)) && !(tier.from === 0 && !E.PLAIN.includes(E.behaviorOf(p))));
				const special = pool.filter(p => (E.BIOME_DEX[key] || []).includes(p.dex));
				const exSpecial = ex.filter(d => (E.BIOME_DEX[key] || []).includes(d.dex)).length;
				const okLen = ex.length === Math.min(2, pool.length);
				const okRules = ex.every(d => E.fitsBiome(G.DEX_BY[d.dex], key) && !castDex.has(d.dex) && !E.SUPPORT.includes(d.behavior) && (tier.from > 0 || E.PLAIN.includes(d.behavior)) && pool.some(p => p.dex === d.dex));
				const okSpecial = exSpecial === Math.min(2, special.length);
				const again = JSON.stringify(E.bioExtra(ti, key)) === JSON.stringify(ex);
				if (!okLen || !okRules || !okSpecial || !again) out.bad.push({ ti, key, ex: ex.map(d => d.dex + ':' + d.behavior), pool: pool.length, special: special.length });
			}
			// the bats: in a cave, tier 0's extras take the cave's own Pokémon first when there are any
			const cave0 = E.candidates(E.TIERS[0]).filter(p => E.BIOME_DEX.cave.includes(p.dex)).map(p => [p.dex, E.behaviorOf(p)]);
			out.cave0 = { cands: cave0, ex: E.bioExtra(0, 'cave').map(d => d.dex) };
			// fallback: a biome with no candidates (Judgment's ruins: no type) adds nothing and weighs nothing
			out.none = { ex: E.bioExtra(0, 'judgment').length, len: E.bagAt(t, 'judgment').length, plain: plainBag.length };
			out.empty = keys.map(k => [k, E.bioExtra(0, k).length]).filter(([, n]) => n === 0).map(([k]) => k);
			// preloading: the current and the next biome's extras are fetched ahead
			G.World.setBiome(1, true);
			const up = new Set(E.upcomingDex(t, 60));
			out.pre = [...E.bioExtra(0, 'cave'), ...E.bioExtra(0, 'volcano'), ...E.bioExtra(1, 'cave'), ...E.bioExtra(1, 'volcano')].every(d => up.has(d.dex));
			// the biome weather (main.gd 6292: BIOME_W[min(biome, 2)])
			const roll = b => { const c = {}; for (let i = 0; i < 4000; i++) { const k = G.Weather.pick(b); c[k] = (c[k] || 0) + 1; } return c; };
			out.wx = { b2: roll(2), b5: roll(5), b0: roll(0) };
			G.World.setBiome(0, true);
			return out;
		});
		for (const b of r.biomes) {
			A(b.wrong === 0 && b.bagLen === b.total, `${b.name} (${b.key}): the bag's weights are the port's (the cast's ${b.key} Pokémon x1.6, ${b.extras.length} biome extras x1.6, the rest x1)`, JSON.stringify(b));
			A(Math.abs(b.seen - b.share) < 0.035 && (b.share > b.plainShare || b.share === 0), `${b.name}: over ${b.n} real spawns ${(b.seen * 100).toFixed(1)} % are ${b.key} Pokémon (expected ${(b.share * 100).toFixed(1)} %, ${(b.plainShare * 100).toFixed(1)} % without the biome)`, JSON.stringify(b));
			A(b.extras.length === 0 || b.ext > 0.03, `${b.name}: its extras really spawn (${(b.ext * 100).toFixed(1)} %)`, JSON.stringify(b.extras));
		}
		A(r.biomes[1].key === 'cave' && r.biomes[0].key === 'forest' && r.biomes[3].key === 'fire', 'the biome on screen picks the key (forest, cave, volcano, then the arenas\' types)', JSON.stringify(r.biomes.map(b => b.key)));
		A(r.bad.length === 0, `the extras' rules for every tier x ${3 + 19} biomes: min(2, eligible), the biome's own Pokémon first, fitting the biome, not in the cast, never a support, tier 0 plain only, the same all run (main.gd _bio_extra)`, JSON.stringify(r.bad.slice(0, 4)));
		A(r.cave0.ex.length > 0, 'the cave\'s extras exist in tier 0 (bats or Rock / Ground)', JSON.stringify(r.cave0));
		A(r.none.ex === 0 && r.none.len === r.none.plain, 'fallback: a biome with no candidates (the Judgment ruins) adds no extras and changes no weights', JSON.stringify(r.none));
		A(r.pre, 'the current and next biome\'s extras are preloaded (main.gd 3619-3623)');
		const share = (c, k) => (c[k] || 0) / 4000;
		A(share(r.wx.b5, 'sun') > 0.3 && share(r.wx.b5, 'sand') > 0.3 && !r.wx.b5.rain && !r.wx.b5.snow && share(r.wx.b0, 'rain') > 0.3 && Math.abs(share(r.wx.b5, 'sun') - share(r.wx.b2, 'sun')) < 0.05,
			'the biome weather: an arena biome (5) uses the volcano\'s weights like the port\'s BIOME_W[min(biome, 2)] (it used to wrap to the cave\'s)', JSON.stringify(r.wx));

		// screenshots: two biomes with their themed spawns on screen
		const showBiome = async (b, name) => {
			await E(b => {
				const E = G.Enemies, pl = G.Game.player;
				G.World.setBiome(b, true);
				G.EnemyMgr.clear();
				const key = E.biomeNow(), t = 100;
				const themed = [...E.bioExtra(0, key), ...E.bioExtra(1, key), ...E.cast[0].list.concat(E.cast[1].list).filter(d => E.fitsBiome(G.DEX_BY[d.dex], key))];
				G.Sprites.preload(themed.map(d => d.dex));
				themed.slice(0, 10).forEach((d, i) => {
					const a = i / Math.min(10, themed.length) * Math.PI * 2;
					const e = new G.Enemy(d, pl.x + Math.cos(a) * 150, pl.y + Math.sin(a) * 95, G.Enemies.scale(t));
					e.spd = 0; G.EnemyMgr.add(e);
				});
				window.__themed = themed.map(d => d.name);
			}, b);
			await sleep(1500);
			await shot(name + '.png');
			await phone(); await sleep(700);
			await shot(name + '_phone.png');
			await desktop(); await sleep(300);
			return E(() => window.__themed);
		};
		const cave = await showBiome(1, 'adaptive_biome_cave');
		const vol = await showBiome(2, 'adaptive_biome_volcano');
		A(cave.length > 0 && vol.length > 0, 'screenshots of the cave and the volcano with their themed Pokémon (' + cave.slice(0, 4).join(', ') + ' / ' + vol.slice(0, 4).join(', ') + ')');
		await E(() => { G.EnemyMgr.clear(); G.World.setBiome(0, true); });
	}

	// ================= 7. Survival by Type overrides the biome; the Tower's floor biomes =================
	if (!ONLY.length || ONLY.includes('7')) {
		const r = await E(() => {
			const T = window.__T, E = G.Enemies, out = {};
			G.Modes.prefs().type = 'electric';
			T.start('type');
			G.World.setBiome(1, true);
			const bag = E.bagAt(100);
			out.type = { key: E.biomeNow(), len: bag.length, plain: E.bagAt(100, '').length, allType: bag.every(d => G.DEX_BY[d.dex].types.includes('electric')),
				noExtras: !bag.some(d => !E.cast.some(t => t.list.includes(d))) };
			T.start('tower');
			out.tower = { floor: G.Tower.floor, key: E.biomeNow(), biome: G.World.biome, ex: E.bioExtra(0, 'forest').length };
			const tb = E.bagAt(G.Tower.dt());
			out.tower.extras = tb.filter(d => !E.cast.some(t => t.list.includes(d))).length;
			out.tower.adaptive = [G.Adaptive.on(), G.Adaptive.k()];
			T.start('rush');
			out.rush = [G.Adaptive.on(), G.Adaptive.k()];
			T.start('normal');
			return out;
		});
		A(r.type.key === '' && r.type.allType && r.type.noExtras && r.type.len === r.type.plain, 'Survival by Type: the type wins in a cave biome (no biome key, only Electric Pokémon, no extras, the plain weights; main.gd 3085)', JSON.stringify(r.type));
		A(r.tower.floor === 1 && r.tower.key === 'forest' && r.tower.extras > 0 && !r.tower.adaptive[0] && r.tower.adaptive[1] === 1, 'the Tower: floor 1\'s forest themes its waves (extras in the bag); its own adaptive scaling, not this one', JSON.stringify(r.tower));
		A(!r.rush[0] && r.rush[1] === 1, 'Boss Rush: no adaptive difficulty (bosses only, so no biome spawns either)', JSON.stringify(r.rush));
	}

	// ================= 8. the support caps, through a long simulated run =================
	if (!ONLY.length || ONLY.includes('8')) {
		const r = await E(() => {
			const T = window.__T, E = G.Enemies, C = G.Enemy.SUPPORT_CAPS, out = { viol: [], casts: [], shields: [] };
			T.start('normal');
			const pl = G.Game.player; pl.invuln = 1e9; pl.xpMul = 0;
			const mk = (dex, behavior, x, y, extra = {}) => {
				const p = G.DEX_BY[dex];
				const d = Object.assign({ dex, name: p.name, behavior, hp: 400, spd: 0, dmg: 1, xp: 1 }, extra);
				const e = new G.Enemy(d, x, y, { hp: 1, spd: 1, dmg: 1 }); e.spd = 0; G.EnemyMgr.add(e); return e;
			};
			// healers x0.9 above 4: the same hurt target, healed by one healer with 4 / 5 alive
			G.EnemyMgr.clear();
			const tgt = mk(19, 'chase', pl.x + 300, pl.y);
			const hs = [0, 1, 2, 3, 4].map(i => mk(113, 'healer', pl.x + 300 + i * 4, pl.y + 10, { shotDmg: 1, shotCd: 3.5, range: 230 }));
			G.EnemyMgr.rebuildGrid();
			const heal = n => { hs.forEach((h, i) => { h.dead = i >= n; }); tgt.maxHp = 1000; tgt.hp = 100; hs[0].healAround(); return tgt.hp - 100; };
			const pow = Math.max(1, ...G.Game.everyone().map(p => (p.atk > 0 && p.baseAtk > 0 ? p.atk / p.baseAtk : 1)));
			out.heal = { four: heal(4), five: heal(5), want: 1000 * 0.07 * Math.min(2.5, Math.pow(pow, 0.35)) };
			hs.forEach(h => { h.dead = false; });
			// shields: wrap castShields to count each cast
			const P = G.Enemy.prototype, orig = P.castShields;
			P.castShields = function () {
				const before = new Set(G.EnemyMgr.all().filter(e => e.shieldLock > 0));
				const now = G.Game.st.time + (window.__simT || 0);
				orig.call(this);
				const got = G.EnemyMgr.all().filter(e => e.shieldLock > 0 && !before.has(e));
				out.casts.push(got.length);
				for (const e of got) {
					if (Math.abs(e.shield - e.maxHp * C.shieldK) > 1e-6 || e.shieldT !== C.shieldT || e.shieldLock !== C.shieldLock) out.viol.push(['shield amount', e.shield, e.maxHp]);
					const last = (e.__sh || []).slice(-1)[0];
					if (last != null && now - last < C.shieldLock - 0.11) out.viol.push(['shield again after', now - last]);
					(e.__sh = e.__sh || []).push(now);
				}
			};
			// summons: wrap summon() to check each one (main.gd _summon: none once a summoner has 8 alive or the map 20;
			// otherwise min(4, 20 - minions on the map))
			const origS = P.summon;
			out.summons = 0;
			P.summon = function () {
				const alive = () => this.minions.filter(m => !m.dead && G.EnemyMgr.get(m.id)).length;
				const total = () => G.EnemyMgr.all().filter(q => q.isMinion && !q.dead).length;
				const b0 = alive(), t0 = total(), n0 = G.EnemyMgr.count;
				origS.call(this);
				const add = alive() - b0;
				if (add > 0) out.summons++;
				if ((b0 >= C.perSummoner || t0 >= C.minions || n0 > G.Spawner.CAP + C.capPad) && add > 0) out.viol.push(['summoned past a cap', b0, t0, n0, add]);
				if (add > Math.min(C.perCast, C.minions - t0)) out.viol.push(['summoned too many', b0, t0, add]);
			};
			// the long run: 10 minutes of the real spawner + enemy AI, with extra summoners, shielders and healers
			G.EnemyMgr.clear();
			const summ = [], shl = [];
			for (let i = 0; i < 6; i++) summ.push(mk(31, 'summoner', pl.x + 140 + i * 6, pl.y - 60, { shotDmg: 1, shotCd: 7, range: 230, minion: 29 }));
			for (let i = 0; i < 4; i++) shl.push(mk(213, 'shielder', pl.x - 120 - i * 6, pl.y + 40));
			for (let i = 0; i < 6; i++) mk(113, 'healer', pl.x - 100, pl.y - 80 - i * 6, { shotDmg: 1, shotCd: 3.5, range: 230 });
			for (let i = 0; i < 20; i++) mk(19, 'chase', pl.x - 90 + (i % 5) * 12, pl.y + 30 + Math.floor(i / 5) * 12);
			const free = G.World.isFree; G.World.isFree = () => true;
			let maxMin = 0, maxPer = 0, maxCount = 0, firstPer = null;
			const dt = 0.1;
			try {
				for (let step = 0; step < 6000; step++) {
					window.__simT = step * dt;
					const t = 60 + step * dt;
					G.Spawner.update(dt, [pl], t);
					G.EnemyMgr.update(dt, [pl]);
					pl.x = pl.x; pl.hp = pl.maxHp;
					const all = G.EnemyMgr.all();
					const minions = all.filter(e => e.isMinion && !e.dead).length;
					maxMin = Math.max(maxMin, minions);
					for (const s of all) if (s.behavior === 'summoner' && !s.dead) { const n = s.minions.filter(m => !m.dead && G.EnemyMgr.get(m.id)).length; maxPer = Math.max(maxPer, n); }
					maxCount = Math.max(maxCount, all.length);
					if (minions > C.minions) out.viol.push(['minions', minions, t]);
					if (step === 150) firstPer = summ.map(s => s.minions.length);
					// kills along the way: every 20 s a third of everything but our supports falls
					if (step % 200 === 199) for (const e of all) if (!e.boss && !summ.includes(e) && !shl.includes(e) && e.behavior !== 'healer' && Math.random() < 0.34) e.hurt(1e9);
					if (out.viol.length > 20) break;
				}
			} finally { P.castShields = orig; P.summon = origS; G.World.isFree = free; window.__simT = 0; }
			out.maxMin = maxMin; out.maxPer = maxPer; out.maxCount = maxCount; out.firstPer = firstPer;
			out.maxCast = Math.max(0, ...out.casts); out.nCasts = out.casts.length; out.shielded = G.EnemyMgr.all().filter(e => (e.__sh || []).length > 1).length;
			// one summoner alone: 4 a summon, then 8 at most
			G.EnemyMgr.clear();
			const one = mk(31, 'summoner', pl.x + 150, pl.y, { shotDmg: 1, shotCd: 7, range: 230, minion: 29 });
			one.summon(); out.one1 = one.minions.length;
			one.summon(); out.one2 = one.minions.length;
			one.summon(); out.one3 = one.minions.length;
			out.minionDef = one.minions[0] && [one.minions[0].dex, one.minions[0].isMinion, one.minions[0].behavior];
			// the global cap: 19 minions on the map -> the next summon adds only 1
			G.EnemyMgr.clear();
			const s2 = mk(31, 'summoner', pl.x + 150, pl.y, { shotDmg: 1, shotCd: 7, range: 230, minion: 29 });
			for (let i = 0; i < 19; i++) { const m = mk(29, 'chase', pl.x + 200, pl.y + i); m.isMinion = true; }
			s2.summon(); out.top = [s2.minions.length, G.EnemyMgr.all().filter(e => e.isMinion).length];
			// the enemy cap: over CAP + 15 enemies, no summon at all
			G.EnemyMgr.clear();
			const s3 = mk(31, 'summoner', pl.x + 150, pl.y, { shotDmg: 1, shotCd: 7, range: 230, minion: 29 });
			for (let i = 0; i < G.Spawner.CAP + 15; i++) mk(19, 'chase', pl.x + 300, pl.y + i);
			s3.summon(); out.full = s3.minions.length;
			// shields: 12 neighbours, a cast shields the 5 nearest; a second cast skips them (lock) and takes the next 5
			G.EnemyMgr.clear();
			const sh = mk(213, 'shielder', pl.x, pl.y + 200);
			const nb = []; for (let i = 0; i < 12; i++) nb.push(mk(19, 'chase', pl.x + 10 + i * 9, pl.y + 200));
			G.EnemyMgr.rebuildGrid();
			sh.castShields(); const c1 = G.EnemyMgr.all().filter(e => e.shieldLock > 0);
			for (const e of c1) e.shield = 0;     // the shields broke: the lock still holds
			sh.castShields(); const c2 = G.EnemyMgr.all().filter(e => e.shieldLock > 0);
			out.sh = { first: c1.length, second: c2.length - c1.length, nearest: c1.every(e => e === sh || nb.indexOf(e) < 5 || e === sh), amount: nb[0].shield === 0 && c2.includes(nb[6]) ? nb[6].shield / nb[6].maxHp : null };
			// the lock runs out after 14 s (enemy update)
			for (let i = 0; i < 141; i++) { for (const e of G.EnemyMgr.all()) e.update(0.1, pl); }
			out.sh.lockAfter = nb[0].shieldLock <= 0 && nb[6].shield === 0;
			G.EnemyMgr.clear();
			return out;
		});
		A(near(r.heal.four, r.heal.want, 1e-6) && near(r.heal.five, r.heal.want * 0.9, 1e-6), 'healers: 7 % of max HP (x your attack^0.35) with 4 alive; with 5 alive each heals 10 % less (main.gd 4038-4044)', JSON.stringify(r.heal));
		A(r.viol.length === 0, '10 simulated minutes (the real spawner + enemy AI, 6 extra summoners, 4 shielders, 6 healers, kills every 20 s): no cap broken', JSON.stringify(r.viol.slice(0, 5)));
		A(r.maxMin === 20 && r.maxPer <= 8 + 3 && r.summons > 20, `minions on the map never pass 20 (reached ${r.maxMin}); ${r.summons} summons, none from a summoner with 8 alive (so at most 8 + 3: ${r.maxPer}) or with 20 on the map`, JSON.stringify({ maxMin: r.maxMin, maxPer: r.maxPer, summons: r.summons }));
		A(r.maxCount <= 64 + 15 + 4, 'summoners stop once the map holds more than CAP + 15 enemies (max seen ' + r.maxCount + ')', r.maxCount);
		A(r.nCasts > 20 && r.maxCast <= 5 && r.maxCast >= 1 && r.shielded > 0, `shields: ${r.nCasts} casts, at most 5 shielded each (max ${r.maxCast}), each 30 % of max HP for 7 s, the same Pokémon never again within 14 s`, JSON.stringify({ n: r.nCasts, max: r.maxCast, again: r.shielded }));
		A(r.one1 === 4 && r.one2 === 8 && r.one3 === 8 && r.minionDef && r.minionDef[0] === 29 && r.minionDef[1] === true && r.minionDef[2] === 'chase', 'one summoner: 4 a summon (was 2), 8 alive at most (was 4), its own pack (Nidoqueen -> Nidoran♀), marked as minions', JSON.stringify([r.one1, r.one2, r.one3, r.minionDef]));
		A(JSON.stringify(r.top) === '[1,20]' && r.full === 0, 'with 19 minions on the map the next summon adds only 1 (20 in all); over CAP + 15 enemies none', JSON.stringify([r.top, r.full]));
		A(r.sh.first === 5 && r.sh.second === 5 && r.sh.nearest && near(r.sh.amount, 0.3, 1e-9) && r.sh.lockAfter, 'a cast shields the 5 nearest (was 6) with 30 % of max HP (was 35 %); a second cast skips them even with their shields broken (14 s lock) and takes the next 5; the lock runs out', JSON.stringify(r.sh));
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
