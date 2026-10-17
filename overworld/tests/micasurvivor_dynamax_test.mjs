// micasurvivor_dynamax_test.mjs — MicaSurvivor M5 batch 5: Dynamax and Dynamax raid dens from the Godot
// Android port by JayElDragon (poke-survivor: dynamax.gd, main.gd 183-189 / 383-385 / 1226-1281 /
// 4216 / 4263 / 5867-5870 / 5903-5936 / 5990-5996 / 6037-6051 / 6189-6221, HUD draw_dyn 8430-8503,
// pad.gd, menu.gd 3167), driven headlessly while logged in to a stubbed Magepunk account (the row
// micasurvivor:<user> with the server's compare-and-set):
//   - data: the port's numbers (60 s, level 20, x1.3, +30 % HP, 1.5 s pulses, radii 280 / 420 x1.9,
//     240 s cooldown, the STATUS table, dens 5 % / 30 s / from 120 s, boss 2400 + 8t, x1.5) and the
//     English strings (lang_en.json)
//   - the unlock: a real den clear (arena won) sets stats.dens + stats.dynamax, reaches the account;
//     a 409 merge and merge() both ways keep it (max of each stat: the unlock never goes back)
//   - in a run: locked before any den, the level-20 gate, 60 s duration, every stat x1.3 (damage,
//     speed, cooldowns /1.3, +23.08 % damage reduction) and max HP +30 %, all reverting exactly
//     (HP in proportion), Mario-style size steps up to x1.6 and back, pulse cadence / radii / damage
//     through G.Combat.land / the type status, the 240 s cooldown and the den recharge, falling ends
//     it, blocked in the Tower mode flag and the Judgment (allowed in arenas, as in the port)
//   - dens: 5 % per rift check after 120 s over many real G.Rift.update checks (never before 120 s,
//     never in Rift Time Attack), 30 s open, the den boss (a normal Pokémon of the current tier,
//     HP 2400 + 8t, XP 380 + t, drawn x1.5 with the red aura, its Max Move), the rewards (12 XP orbs,
//     2 items, 2 tickets, 120 coins, a heal), not a legendary / rift win / bond
//   - input: the C key, the HUD MAX button (a real click), the pad's dynamax action (View / Back by
//     default on every layout), the in-run extras (left trigger, X / Square), remap with
//     swap-on-conflict, an old saved map gaining dynamax, the glyph prompt; the Dynamax card on the
//     missions screen (English, reachable with the pad)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): Dynamaxed player with aura + pulse, the DYNAMAX banner, a den
// with its crater + light pillar, the den boss in its arena, the HUD MAX button, the missions card.
// Covers micasurvivor/js/systems/dynamax.js, js/systems/rift.js, js/systems/zmoves.js, js/game.js,
// js/ui/hud.js, js/core/pad.js, js/entities/player.js, js/entities/enemy.js, js/systems/progress.js,
// js/ui/goals-ui.js, js/core/db.js, js/data/lang-en.js, index.html, css/style.css.
//   node overworld/tests/micasurvivor_dynamax_test.mjs
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
const PORT = 8836;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// the port's STATUS table (dynamax.gd line 17): [cc, poison, slow]
const STATUS = { fire: ['', 0, 0], water: ['', 0, 0.4], electric: ['para', 0, 0], ice: ['freeze', 0, 0], poison: ['', 1, 0], psychic: ['conf', 0, 0], ghost: ['sleep', 0, 0], fairy: ['conf', 0, 0], bug: ['', 0, 0.35], grass: ['', 1, 0], ground: ['', 0, 0.3] };

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
	localStorage.setItem('magepunk_mp_token_v1', 'dynamax-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'dyntester' }));
};

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name, clip) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); } };
	const E = (fn, ...a) => page.evaluate(fn, ...a);
	const press = async (b) => { await E(b => __btn(b, true), b); await sleep(90); await E(b => __btn(b, false), b); await sleep(110); };
	const navTo = async (sel) => {
		for (let i = 0; i < 60; i++) {
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

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.Dynamax), 30000), 'boots logged in (Magepunk account); G.Dynamax loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await E(() => { const s = G.DB.save; G.DB.grant(4, 'starter'); s.partner = 4; s.partnerShiny = false; G.DB.commit(true); });

	// ================= 1. data =================
	{
		const r = await E(() => {
			const D = G.Dynamax;
			return {
				k: [D.DUR, D.MIN_LEVEL, D.GROW, D.STAT_K, D.HP_BONUS, D.DMG_K, D.TAKEN, D.PULSE, D.FIRST_PULSE, D.PULSE_R, D.BIG_R, D.BIG_K, D.COOLDOWN],
				den: [D.DEN_RATE, D.DEN_TTL, D.DEN_FROM, D.DEN_SCALE, D.DEN_MAXMOVE, D.DEN_REWARD.orbs, D.DEN_REWARD.items, D.DEN_REWARD.tickets, D.DEN_REWARD.coins * D.DEN_REWARD.coinValue, D.DEN_REWARD.heal],
				status: D.STATUS, modes: [D.BLOCKED_MODES, D.NO_DEN_MODES],
				ui: ['¡Dynamax listo!', '¡Has desbloqueado el Dynamax! Botón MAX, tecla C o gatillo izquierdo (desde el nivel 20)', '¡Guarida superada! Caramelo Dynamax: puedes usar el Dynamax otra vez',
					'¡SE HA ABIERTO UNA GUARIDA DYNAMAX!', 'Sigue la flecha roja: dentro te espera un Pokémon gigante', 'GUARIDA · 12 m · 30 s', 'GUARIDA · 1:40', '¡Rattata Dynamax te desafía!',
					'Has entrado en la guarida…', 'Vence una guarida Dynamax: 0/1', 'Guaridas Dynamax vencidas: 3', 'Desbloqueado', 'Nv. 20', 'Aquí no',
					'Cada 4 minutos (desde el nivel 20): tu Pokémon se vuelve gigante 60 s con +30% a todos sus atributos y lanza ondas Max de su tipo. Cada guarida Dynamax vencida lo recarga al instante.'].map(s => [s, G.I18n.t(s)]),
			};
		});
		A(JSON.stringify(r.k) === JSON.stringify([60, 20, 1.6, 1.3, 0.3, 1.3, 0.2308, 1.5, 0.6, 280, 420, 1.9, 240]), 'the port\'s numbers: 60 s, level 20, x1.6, x1.3, +30 % HP, x1.3 damage, 23.08 % less taken, pulses every 1.5 s (first at 0.6 s), radii 280 / 420 x1.9, 240 s cooldown', JSON.stringify(r.k));
		A(JSON.stringify(r.den) === JSON.stringify([0.05, 30, 120, 1.5, 0.28, 12, 2, 2, 120, 1]), 'dens: 5 % per check, open 30 s, from 120 s, boss x1.5, Max Move 28 %; reward 12 XP orbs, 2 items, 2 tickets, 120 coins, a heal', JSON.stringify(r.den));
		A(JSON.stringify(r.status) === JSON.stringify(STATUS), 'the pulse status per type is the port\'s STATUS table', JSON.stringify(r.status));
		A(JSON.stringify(r.modes) === '[["tower"],["rifts"]]', 'no Dynamax in the Tower (mode flag); no dens in Rift Time Attack (mode flag)');
		const bad = r.ui.filter(([es, en]) => es === en && !/^Nv\./.test(es) || /[¡¿ñáéíóú]/i.test(en.replace(/Poké/g, '')));
		A(bad.length === 0, 'every new string has English (lang_en.json wording)', JSON.stringify(bad));
		const ui = Object.fromEntries(r.ui);
		A(ui['GUARIDA · 12 m · 30 s'] === 'DEN · 12 m · 30 s' && ui['¡Rattata Dynamax te desafía!'] === 'Dynamax Rattata challenges you!' && ui['Nv. 20'] === 'Lv. 20' && /^DEN · 1:40$/.test(ui['GUARIDA · 1:40']), 'patterns fill their holes (DEN · 12 m · 30 s, Dynamax Rattata challenges you!)', JSON.stringify(ui));
	}

	// ================= 2. the run =================
	await page.click('#scr-menu [data-go=play]');
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'run starts');
	await sleep(400);
	await E(() => {
		const pl = G.Game.player;
		pl.xpMul = 0;
		G.Game.togglePause(); G.UI.hide('scr-pause');
		G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields();
		window.T = {
			mk(dex, dx, dy, o = {}) {
				const pl = G.Game.player;
				const def = { dex, name: 'T' + dex, hp: o.hp || 1e7, spd: o.spd || 0.001, dmg: o.dmg || 5, xp: 0, behavior: 'chaser' };
				const e = new G.Enemy(def, pl.x + dx, pl.y + dy, { hp: 1, spd: 1, dmg: 1 }, !!o.boss);
				e.flying = true;
				G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
				return e;
			},
			reset() { G.Dynamax.reset(); G.ZMoves.reset(); G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.FX.clear(); G.Hazards.clear(); G.EnemyMgr.rebuildGrid(); },
			// gates read G.Game.state === 'playing': flip the paused run for the check
			can() { G.Game.togglePause(); const ok = G.Dynamax.can(G.Game.player); G.Game.togglePause(); G.UI.hide('scr-pause'); return ok; },
			start() { G.Game.togglePause(); const ok = G.Dynamax.tryStart(G.Game.player); G.Game.togglePause(); G.UI.hide('scr-pause'); return ok; },
			step(sec, dt = 1 / 60) { const pl = G.Game.player; for (let t = 0; t < sec - 1e-9; t += dt) { G.Dynamax.update(dt, pl); G.FX.update(dt); } },
		};
	});

	// ---------- a. locked before any den; the level-20 gate
	{
		const r = await E(() => {
			const pl = G.Game.player, D = G.Dynamax, s = G.DB.save;
			T.reset(); pl.level = 30;
			const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
			const r = { unl: D.unlocked(), can: T.can(), btn: !!D.drawButton(cv.getContext('2d'), 1280, 720, pl), dens: s.stats.dens || 0 };
			return r;
		});
		A(!r.unl && !r.can && !r.btn && r.dens === 0, 'a new save: Dynamax locked, not usable, no HUD button', JSON.stringify(r));
	}

	// ---------- b. the unlock: a real den clear, then the account + merge
	{
		const r = await E(() => {
			const pl = G.Game.player, s = G.DB.save;
			T.reset();
			G.Game.debugTime(300);
			const legends0 = JSON.stringify(s.legends || {}), rw0 = s.stats.riftWins || 0, bonds0 = pl.bonds;
			G.Rift.debugDen(19);                      // Rattata
			const a = G.Rift.arena, boss = G.EnemyMgr.get(a.bossId);
			const out = { den: a.den, isDen: G.Rift.den, hp: boss.maxHp, xp: boss.xp, dyna: boss.def.dyna, legend: boss.legend, flagged: boss.den, name: boss.name };
			// the plain boss of the same Pokémon (no den) for the size comparison
			const plain = new G.Enemy({ dex: 19, name: 'x', hp: 10, spd: 50, dmg: 1, xp: 0, behavior: 'charger' }, 0, 0, { hp: 1, spd: 1, dmg: 1 }, true);
			out.scale = boss.scale / plain.scale; out.animScale = boss.anim.scale / plain.anim.scale; out.bodyH = boss.bodyH / plain.bodyH; out.r = boss.r / plain.r;
			// it is drawn with the red aura
			const o = G.Dynamax.drawAura; let aura = 0; G.Dynamax.drawAura = function (...x) { aura++; return o.apply(this, x); };
			const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400; boss.draw(cv.getContext('2d'));
			G.Dynamax.drawAura = o; out.aura = aura;
			// defeat it: the arena is won on the next tick
			const pickups0 = G.Pickups.all().length;
			boss.hp = 0; boss.die(); G.Progress.kill(boss);
			G.Rift.update(1 / 60, pl, 300);
			const kinds = {};
			let coins = 0, xp = 0, pulled = 0;
			for (const p of G.Pickups.all().slice(pickups0)) { kinds[p.kind] = (kinds[p.kind] || 0) + 1; if (p.kind === 'coin') coins += p.value; if (p.kind === 'xpBig') xp += p.value; if (p.pulled) pulled++; }
			out.kinds = kinds; out.coins = coins; out.xpTotal = xp; out.pulled = pulled; out.n = G.Pickups.all().length - pickups0;
			out.phase = G.Rift.arena && G.Rift.arena.phase;
			out.dens = s.stats.dens; out.dynFlag = s.stats.dynamax; out.unl = G.Dynamax.unlocked();
			out.banner = G.I18n.t((G.Spawner.banner() || {}).text || '');
			out.legendsSame = JSON.stringify(s.legends || {}) === legends0; out.rw = (s.stats.riftWins || 0) - rw0; out.bonds = pl.bonds - bonds0;
			// back to the map after the 5 s
			G.Rift.update(5.1, pl, 300);
			out.back = !G.Rift.inArena;
			return out;
		});
		A(r.den && r.isDen && r.flagged && r.dyna && r.legend, 'G.Rift.debugDen: an arena flagged den with a giant boss (def.dyna)', JSON.stringify(r));
		A(r.hp === 2400 + 8 * 300 && r.xp === 380 + 300, `den boss HP = 2400 + 8t (${r.hp} at 300 s), XP = 380 + t (${r.xp})`, JSON.stringify(r));
		A(near(r.scale, 1.5) && near(r.animScale, 1.5) && near(r.bodyH, 1.5) && near(r.r, 1), 'drawn 1.5x (sprite and height; the hit radius stays, as the port only scales the sprite)', JSON.stringify(r));
		A(r.aura >= 1, 'drawn with the red Dynamax aura');
		A(r.phase === 'won' && r.kinds.xpBig === 12 && r.kinds.item === 2 && r.kinds.ticket === 2 && r.kinds.coin === 12 && r.coins === 120 && r.kinds.heal === 1 && r.n === 29 && r.pulled === 29,
			'the reward: 12 big XP orbs, 2 items, 2 tickets, 120 coins (12 x 10), a heal, all pulled to you, nothing else', JSON.stringify(r.kinds) + ' coins ' + r.coins + ' n ' + r.n);
		A(r.xpTotal >= 380 + 300 && r.xpTotal < 380 + 300 + 12, `the 12 orbs carry 380 + t XP (${r.xpTotal})`);
		A(r.dens === 1 && r.dynFlag === 1 && r.unl, 'the first den clear unlocks Dynamax (stats.dens = 1, stats.dynamax = 1)', JSON.stringify(r));
		A(r.banner === 'You unlocked Dynamax! MAX button, C key or left trigger (from level 20)', 'the first time says "You unlocked Dynamax! MAX button, C key or left trigger (from level 20)"', r.banner);
		A(r.legendsSame && r.rw === 0 && r.bonds === 0, 'a den is not a legendary, a rift win or a bond (main.gd _den_down / 4499)', JSON.stringify(r));
		A(r.back, 'and 5 s later you are back on the map');
		await E(() => G.DB.commit(true));
		A(await waitFor(() => ROW.save && ROW.save.stats && ROW.save.stats.dens === 1 && ROW.save.stats.dynamax === 1, 8000), 'the unlock reaches the account row (stats.dens, stats.dynamax)', JSON.stringify(ROW.save && ROW.save.stats && { dens: ROW.save.stats.dens, dyn: ROW.save.stats.dynamax }));
		// another device, newer save, never cleared a den: the 409 merge keeps ours
		const other = JSON.parse(JSON.stringify(ROW.save));
		other.stats.dens = 0; delete other.stats.dynamax; other.updated = Date.now() + 5000;
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => ({ dens: G.DB.save.stats.dens, flag: G.DB.save.stats.dynamax, unl: G.Dynamax.unlocked() }));
		A(ROW.rev > rev0 && m.dens === 1 && m.flag === 1 && m.unl && ROW.save.stats.dens === 1, 'a 409 from a newer save without the unlock merges it back in (max of each stat: true wins)', JSON.stringify(m));
		const u = await E(() => {
			const base = () => JSON.parse(JSON.stringify(G.DB.save));
			const a = base(), b = base();
			a.updated = 2000; b.updated = 1000;
			a.stats.dens = 0; delete a.stats.dynamax; b.stats.dens = 3; b.stats.dynamax = 1;
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			return { r1: [r1.stats.dens, r1.stats.dynamax, G.Dynamax.unlocked(r1)], r2: [r2.stats.dens, r2.stats.dynamax, G.Dynamax.unlocked(r2)], none: G.Dynamax.unlocked(a) };
		});
		A(JSON.stringify(u.r1) === '[3,1,true]' && JSON.stringify(u.r2) === '[3,1,true]' && !u.none, 'merge() both ways: dens = the max (3), the flag stays, unlocked', JSON.stringify(u));
	}

	// ---------- c. the level-20 gate; start: every stat x1.3, max HP +30 %; 60 s; exact revert
	{
		const r = await E(() => {
			const pl = G.Game.player, D = G.Dynamax;
			T.reset();
			pl.level = 19;
			const out = { c19: T.can() };
			pl.level = 20;
			out.c20 = T.can();
			pl.maxHp = 200; pl.hp = 100;
			const before = { atk: pl.atk, spd: pl.spd, cd: pl.cdMul, red: pl.reduction, maxHp: pl.maxHp, hp: pl.hp };
			out.started = T.start();
			const on = { atk: pl.atk, spd: pl.spd, cd: pl.cdMul, red: pl.reduction, maxHp: pl.maxHp, hp: pl.hp };
			out.k = { atk: on.atk / before.atk, spd: on.spd / before.spd, cd: before.cd / on.cd, red: on.red - before.red, maxHp: on.maxHp - before.maxHp, hp: on.hp - before.hp };
			out.flash = D.flash; out.active = D.active; out.used = D.used;
			// a level-up card while giant (cooldown card): must survive the revert exactly
			pl.cdMul *= 0.92;
			const want = before.cd * 0.92;
			T.step(59.9);
			out.at599 = D.active;
			pl.hp = 130;                               // half of 260
			T.step(0.15);
			out.after = { active: D.active, atk: pl.atk, spd: pl.spd, cd: pl.cdMul, red: pl.reduction, maxHp: pl.maxHp, hp: pl.hp, dyn: pl.dyn };
			out.before = before; out.wantCd = want;
			out.cd = D.cd; out.usedAfter = D.used;
			return out;
		});
		A(!r.c19 && r.c20, 'level 19: no Dynamax; level 20: ready', JSON.stringify(r));
		A(r.started && r.active && r.used && r.flash < 0.05, 'it starts (the DYNAMAX banner begins)', JSON.stringify(r));
		A(near(r.k.atk, 1.3) && near(r.k.spd, 1.3) && near(r.k.cd, 1.3) && near(r.k.red, 0.2308) && r.k.maxHp === 60 && r.k.hp === 60,
			'damage x1.3, speed x1.3, cooldowns /1.3, +23.08 % damage reduction, max HP +30 % (200 -> 260, current HP +60)', JSON.stringify(r.k));
		A(r.at599 && !r.after.active && !r.after.dyn, 'it lasts 60 s (on at 59.9 s, over at 60.05 s)', JSON.stringify(r));
		A(r.after.atk === r.before.atk && r.after.spd === r.before.spd && r.after.red === r.before.red && r.after.maxHp === 200 && near(r.after.cd, r.wantCd, 1e-12),
			'at the end every stat reverts exactly (a cooldown card taken meanwhile is kept); max HP back to 200', JSON.stringify([r.before, r.after]));
		A(r.after.hp === 100, 'HP keeps its proportion (130 / 260 -> 100 / 200)', JSON.stringify(r.after));
		A(r.cd > 239.9 && r.cd <= 240 && r.usedAfter, 'the 240 s cooldown starts when it ends (counting only after it)', JSON.stringify(r));
	}

	// ---------- d. size: Mario-style steps up to x1.6, then back
	{
		const r = await E(() => {
			const pl = G.Game.player, D = G.Dynamax;
			T.reset(); pl.level = 25;
			const at = s => D.scaleAt(s).map(v => +v.toFixed(4));
			const keys = [0.14, 0.24, 0.40, 0.50, 0.72, 0.90, 2].map(at);
			let mx = 0, dips = 0, prev = 1;
			for (let t = 0; t <= 1; t += 0.005) { const s = D.scaleAt(t)[0]; mx = Math.max(mx, s); if (s < prev - 1e-6) dips++; prev = s; }
			T.start();
			T.step(0.3);
			const mid = pl.dynScale && pl.dynScale.slice();
			T.step(1);
			const end = pl.dynScale && pl.dynScale.slice();
			G.Dynamax.stop(pl);
			T.step(0.2);
			const shrinking = pl.dynScale && pl.dynScale.slice();
			T.step(0.2);
			return { keys, mx, dips, mid, end, shrinking, after: pl.dynScale };
		});
		A(JSON.stringify(r.keys) === JSON.stringify([[1.22, 1], [1.04, 1.04], [1.42, 1.3], [1.16, 1.2], [1.792, 1.792], [1.6, 1.6], [1.6, 1.6]]), 'the port\'s steps: 1.22x1.0, 1.04, 1.42x1.3, 1.16x1.2, 1.792 (overshoot), 1.6', JSON.stringify(r.keys));
		A(near(r.mx, 1.792, 1e-3) && r.dips > 10, 'it grows, shrinks a little and grows again (Super Mario Bros DS mushroom)', JSON.stringify([r.mx, r.dips]));
		A(r.mid && r.mid[0] > 1 && JSON.stringify(r.end) === '[1.6,1.6]', 'the sprite really is drawn at that scale and ends at 1.6x', JSON.stringify(r));
		A(r.shrinking && r.shrinking[0] < 1.6 && r.shrinking[0] > 1 && r.after === null, 'at the end it shrinks back to normal in 0.35 s', JSON.stringify(r));
	}

	// ---------- e. pulses: cadence, radii, damage, status
	{
		const r = await E(() => {
			const pl = G.Game.player, D = G.Dynamax;
			T.reset(); pl.level = 25; pl.dex = 4; pl.critChance = 0; pl.atkMul = 1;
			const eIn = T.mk(19, 250, 0), eMid = T.mk(19, -350, 0), eOut = T.mk(19, 0, 500);
			T.start();
			const out = { n0: D.pulses };
			T.step(0.55); out.n059 = D.pulses;
			const hp = () => [eIn.hp, eMid.hp, eOut.hp];
			const h0 = hp();
			T.step(0.1); out.n06 = D.pulses;
			const h1 = hp();
			out.p1 = [h0[0] - h1[0], h0[1] - h1[1], h0[2] - h1[2]];
			const k = G.Types.mult('fire', eIn.types) * G.Weather.mult('fire') * (pl.abFx ? G.Abilities.outK(pl, eIn, 'fire', 'zmove') : 1) * G.Items.outK(pl, eIn, 'fire');
			out.want1 = (30 + 8 * 25) * pl.atk * k;
			T.step(1.5); out.n2 = D.pulses;
			const h2 = hp();
			T.step(1.5); out.n3 = D.pulses;
			const h3 = hp();
			out.p3 = [h2[0] - h3[0], h2[1] - h3[1], h2[2] - h3[2]];
			out.want3 = out.want1 * 1.9;
			T.step(60 - 0.65 - 3 + 0.05); out.total = D.pulses; out.activeEnd = D.active;
			T.reset();
			// status per type (one pulse each, a fresh enemy at 150)
			const st = {};
			for (const type of Object.keys(D.STATUS)) {
				T.reset();
				const mon = G.DEX.find(p => p.types.length === 1 && p.types[0] === type);
				pl.dex = mon.dex;
				const e = T.mk(19, 150, 0);
				T.start(); T.step(0.61);
				st[type] = { type: D.type, frozen: e.frozenT > 0, para: e.paraT > 0, sleep: e.sleepT > 0, conf: e.confT > 0, poison: e.poison > 0, slow: e.slow > 0, hit: e.hp < e.maxHp };
			}
			T.reset(); pl.dex = 4;
			return { ...out, st };
		});
		A(r.n0 === 0 && r.n059 === 0 && r.n06 === 1 && r.n2 === 2 && r.n3 === 3, 'none at 0.55 s, the first Max pulse at 0.6 s, then one every 1.5 s', JSON.stringify(r));
		A(r.total === 40 && !r.activeEnd, '40 pulses in the 60 s (0.6, 2.1, ... 59.1)', JSON.stringify(r));
		A(r.p1[0] > 0 && r.p1[1] === 0 && r.p1[2] === 0, 'a normal pulse reaches 280 (the foe at 250, not 350 or 500)', JSON.stringify(r.p1));
		A(r.p3[0] > 0 && r.p3[1] > 0 && r.p3[2] === 0, 'every 3rd pulse reaches 420 (250 and 350, not 500)', JSON.stringify(r.p3));
		A(Math.abs(r.p1[0] - r.want1) <= 1.5, `pulse damage = (30 + 8 x level) x attack (x1.3 while giant) through G.Combat.land = ${r.want1.toFixed(1)} (got ${r.p1[0]})`, JSON.stringify(r));
		A(Math.abs(r.p3[0] - r.want3) <= 2.5 && Math.abs(r.p3[1] - r.want3) <= 2.5, `the big pulse does x1.9 (${r.want3.toFixed(1)}; got ${r.p3[0]}, ${r.p3[1]})`, JSON.stringify(r.p3));
		const S = r.st;
		A(S.electric.para && S.ice.frozen && S.ghost.sleep && S.psychic.conf && S.fairy.conf, 'electric paralyses, ice freezes, ghost puts to sleep, psychic and fairy confuse', JSON.stringify(S));
		A(S.poison.poison && S.grass.poison && S.water.slow && S.bug.slow && S.ground.slow && S.fire.hit && !S.fire.para && !S.fire.slow, 'poison and grass poison; water, bug and ground slow; fire just hits', JSON.stringify(S));
		A(Object.entries(S).every(([t, v]) => v.type === t && v.hit), 'the pulse type is the active Pokémon\'s first type');
	}

	// ---------- f. cooldown 240 s, the den recharge, falling ends it
	{
		const r = await E(() => {
			const pl = G.Game.player, D = G.Dynamax;
			T.reset(); pl.level = 25;
			T.start(); T.step(60.05);
			const out = { cd0: D.cd, can0: T.can() };
			T.step(239);
			out.used239 = D.used; out.can239 = T.can();
			T.step(1.1);
			out.used240 = D.used; out.cd240 = D.cd; out.can240 = T.can();
			// a den clear recharges it at once
			T.start(); T.step(60.05);
			out.cdB = D.cd;
			const dens0 = G.DB.save.stats.dens;
			const first = D.denDown(pl.x, pl.y, false);
			out.afterDen = { used: D.used, cd: D.cd, can: T.can(), dens: G.DB.save.stats.dens - dens0, first, banner: G.I18n.t((G.Spawner.banner() || {}).text || '') };
			// falling ends it
			T.reset();
			T.start(); T.step(1);
			pl.dead = true; T.step(1 / 60);
			out.dead = { active: D.active, dyn: pl.dyn, cd: D.cd };
			pl.dead = false; pl.hp = pl.maxHp;
			// the team-mode hook: stop() ends it at once
			T.reset(); T.start(); T.step(2);
			G.Dynamax.stop(pl);
			out.swap = { active: D.active, dyn: pl.dyn };
			T.reset();
			return out;
		});
		A(r.cd0 > 239.9 && r.cd0 <= 240 && !r.can0 && r.used239 && !r.can239, 'cooling down 240 s (still not usable at 239 s)', JSON.stringify(r));
		A(!r.used240 && r.cd240 === 0 && r.can240, 'ready again after 240 s', JSON.stringify(r));
		A(r.cdB > 239.9 && !r.afterDen.used && r.afterDen.cd === 0 && r.afterDen.can && r.afterDen.dens === 1 && !r.afterDen.first, 'a den clear recharges it instantly (Dynamax Candy) and counts the den', JSON.stringify(r.afterDen));
		A(r.afterDen.banner === 'Den cleared! Dynamax Candy: you can use Dynamax again', 'later dens say "Den cleared! Dynamax Candy: you can use Dynamax again"', r.afterDen.banner);
		A(!r.dead.active && !r.dead.dyn && r.dead.cd === 240, 'falling ends it (and the cooldown starts)', JSON.stringify(r.dead));
		A(!r.swap.active && !r.swap.dyn, 'G.Dynamax.stop(pl) — the team-mode swap hook (batch 7) — ends it');
	}

	// ---------- g. blocked: the Tower mode flag and the Judgment; allowed in arenas (as in the port)
	{
		const r = await E(() => {
			const pl = G.Game.player, D = G.Dynamax;
			T.reset(); pl.level = 25;
			const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
			const draw = () => !!D.drawButton(cv.getContext('2d'), 1280, 720, pl);
			const out = { base: T.can(), btn: draw() };
			G.Game.mode = 'tower';
			out.tower = [T.can(), T.start(), draw()];
			G.Game.mode = 'normal';
			const swap = (obj, key, val, fn) => { const d = Object.getOwnPropertyDescriptor(obj, key); Object.defineProperty(obj, key, { configurable: true, get: () => val }); try { return fn(); } finally { Object.defineProperty(obj, key, d); } };
			out.judg = swap(G.Judgment, 'active', true, () => [T.can(), T.start(), D.blocked(), draw()]);
			out.arena = swap(G.Rift, 'inArena', true, () => [T.can(), D.blocked()]);
			out.zcine = (() => { const d = Object.getOwnPropertyDescriptor(G.ZMoves, 'cine'); Object.defineProperty(G.ZMoves, 'cine', { configurable: true, get: () => true }); try { return T.can(); } finally { Object.defineProperty(G.ZMoves, 'cine', d); } })();
			out.after = T.can();
			T.reset();
			return out;
		});
		A(r.base && r.btn, 'normally usable, the HUD button is drawn');
		A(!r.tower[0] && !r.tower[1] && !r.tower[2], 'G.Game.mode = "tower" (batch 8): no Dynamax and no button', JSON.stringify(r.tower));
		A(!r.judg[0] && !r.judg[1] && r.judg[2] && r.judg[3], 'in the Judgment of Arceus: not usable (the button shows greyed, "Not here")', JSON.stringify(r.judg));
		A(r.arena[0] && !r.arena[1], 'in a rift / den arena: usable (main.gd _dyn_can does not block arenas, unlike the Z-move)', JSON.stringify(r.arena));
		A(!r.zcine && r.after, 'not during a Z-move cinematic; fine again afterwards', JSON.stringify(r));
	}

	// ---------- h. den odds: 5 % of rift checks after 120 s, never before, never in Rift Time Attack
	{
		const r = await E(() => {
			const D = G.Dynamax, pl = G.Game.player;
			let hits = 0; const N = 200000;
			for (let i = 0; i < N; i++) if (D.denRoll(150)) hits++;
			let early = 0; for (let i = 0; i < 20000; i++) if (D.denRoll(119.99)) early++;
			G.Game.mode = 'rifts'; let rifts = 0; for (let i = 0; i < 20000; i++) if (D.denRoll(600)) rifts++; G.Game.mode = 'normal';
			// the real rift check: G.Rift.update with the 30 s timer elapsed
			const run = (time, n) => {
				let dens = 0, rifts = 0, checks = 0;
				for (let i = 0; i < n; i++) {
					G.Rift.reset();
					G.Rift.update(30.01, pl, time);
					checks++;
					const rf = G.Rift.rift;
					if (rf && rf.den) dens++; else if (rf) rifts++;
				}
				G.Rift.reset();
				return { dens, rifts, checks };
			};
			G.EnemyMgr.clear(); G.EnemyMgr.rebuildGrid();
			const late = run(200, 6000), before = run(110, 3000);
			G.Game.mode = 'rifts'; const ta = run(200, 3000); G.Game.mode = 'normal';
			// a den opened by the check: 30 s and red
			let den = null;
			for (let i = 0; i < 500 && !den; i++) { G.Rift.reset(); G.Rift.update(30.01, pl, 200); if (G.Rift.rift && G.Rift.rift.den) den = { ttl: G.Rift.rift.ttl, isDen: G.Rift.den }; }
			G.Rift.reset();
			return { rate: hits / N, early, rifts, late, before, ta, den };
		});
		A(r.rate > 0.0475 && r.rate < 0.0525, `denRoll: 5 % after 120 s (${(r.rate * 100).toFixed(2)} % of 200000)`);
		A(r.early === 0 && r.rifts === 0, 'never before 120 s; never in Rift Time Attack (mode "rifts")', JSON.stringify([r.early, r.rifts]));
		const lr = r.late.dens / r.late.checks;
		A(lr > 0.04 && lr < 0.06 && r.late.rifts > 0, `real G.Rift.update checks at 200 s open a den ${(lr * 100).toFixed(2)} % of the time (and rifts otherwise)`, JSON.stringify(r.late));
		A(r.before.dens === 0 && r.before.rifts > 0 && r.ta.dens === 0, 'real checks at 110 s: rifts but no dens; in Rift Time Attack: no dens', JSON.stringify([r.before, r.ta]));
		A(r.den && r.den.ttl === 30 && r.den.isDen, 'a den stays open 30 s', JSON.stringify(r.den));
	}

	// ---------- i. the den boss: a normal Pokémon of the current tier; its Max Move
	{
		const r = await E(() => {
			const pl = G.Game.player, D = G.Dynamax;
			T.reset();
			const tierOf = t => { let ti = 0; G.Enemies.TIERS.forEach((tr, i) => { if (t >= tr.from) ti = i; }); return G.Enemies.TIERS[ti]; };
			let ok = 0, n = 0, legend = 0;
			for (const t of [130, 300, 450, 700]) {
				const tier = tierOf(t);
				for (let i = 0; i < 60; i++) { const m = D.denMon(t); n++; if (m.bst >= tier.bst[0] && m.bst <= tier.bst[1] && m.rarity < 5) ok++; if (m.leg) legend++; }
			}
			// the Max Move: two rings of explosions (1 + 6 + 9 zones)
			G.Game.debugTime(400);
			G.Rift.debugDen(19);
			const boss = G.EnemyMgr.get(G.Rift.arena.bossId);
			G.Hazards.clear();
			boss.bossInit();
			const rnd = Math.random; Math.random = () => 0.01;
			try { boss.ai.cd = 0; boss.ai.mode = 'close'; boss.bossMove(1 / 60, pl, 200, 0, 0, 50); } finally { Math.random = rnd; }
			const cast = boss.ai.cast && boss.ai.cast.id;
			let drawn = 0; const add0 = G.Hazards.add; // count the zones by casting again with a spy
			G.Hazards.add = h => { drawn++; return add0(h); };
			boss.ai.cast = null; Math.random = () => 0.01;
			try { boss.ai.cd = 0; boss.bossMove(1 / 60, pl, 200, 0, 0, 50); } finally { Math.random = rnd; G.Hazards.add = add0; }
			// a plain boss never uses it
			const plain = T.mk(19, 300, 0, { boss: true }); plain.bossInit();
			let plainMax = 0;
			for (let i = 0; i < 200; i++) { plain.ai.cast = null; plain.ai.cd = 0; plain.bossMove(1 / 60, pl, 200, 0, 0, 50); if (plain.ai.cast && plain.ai.cast.id === 'maxmove') plainMax++; }
			G.Rift.update(1 / 60, pl, 400);   // (keep the arena consistent)
			boss.hp = 0; boss.die(); G.Rift.update(1 / 60, pl, 400); G.Rift.update(5.1, pl, 400);
			T.reset();
			return { ok, n, legend, cast, drawn, plainMax };
		});
		A(r.ok === r.n && r.legend === 0, `den bosses are normal Pokémon of the current tier (${r.ok}/${r.n} in the tier's BST band, no legendaries)`, JSON.stringify(r));
		A(r.cast === 'maxmove' && r.drawn === 16, 'the den boss uses its Max Move: 1 + 6 + 9 warned explosion zones (main.gd 4263)', JSON.stringify(r));
		A(r.plainMax === 0, 'ordinary bosses never use it');
	}

	// ---------- j. input: C key, the HUD button (real click), pad action + extras, remap, migration, glyph
	{
		const goPlay = () => E(() => { T.reset(); const pl = G.Game.player; pl.level = 25; pl.dex = 4; if (G.Game.state !== 'playing') { G.Game.togglePause(); G.UI.hideAll(); } });
		await goPlay();
		await page.keyboard.press('c');
		await sleep(60);
		A(await E(() => G.Dynamax.active), 'the C key starts it');
		await sleep(900);
		await E(() => { for (const [dx, dy] of [[140, 40], [-120, 90], [60, -150], [-200, -60], [220, 120], [-60, 200]]) T.mk(19, dx, dy, { hp: 1e7 }); });
		await sleep(1300);
		await shot('dynamax_player_banner.png');
		await sleep(1600);
		await shot('dynamax_player_pulse.png');
		await goPlay();
		await sleep(150);
		const rect = await E(() => { const c = document.getElementById('game'); return G.Dynamax.buttonRect(c.clientWidth, c.clientHeight); });
		await shot('hud_max_button.png', { x: Math.max(0, rect.x - 140), y: Math.max(0, rect.y - 40), width: 240, height: 300 });
		await page.mouse.click(rect.x + rect.s / 2, rect.y + rect.s / 2);
		await sleep(80);
		A(await E(() => G.Dynamax.active), 'clicking / tapping the HUD MAX button starts it (G.Touch button)', JSON.stringify(rect));
		await goPlay();
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(8);
		A(await E(() => G.Dynamax.active), 'the pad\'s dynamax action (View / Back / − by default) starts it');
		const gl = await E(() => new Promise(res => { const o = G.Pad.drawGlyph, seen = []; G.Pad.drawGlyph = function (ctx, k, ...a) { seen.push(k); return o.call(this, ctx, k, ...a); }; G.Dynamax.reset(); requestAnimationFrame(() => requestAnimationFrame(() => { G.Pad.drawGlyph = o; res({ seen, mode: G.Pad.mode }); })); }));
		A(gl.mode === 'pad' && gl.seen.includes('dynamax'), 'in pad mode the HUD MAX button shows the dynamax button glyph', JSON.stringify(gl));
		await shot('hud_max_button_pad.png', { x: Math.max(0, rect.x - 140), y: Math.max(0, rect.y - 40), width: 240, height: 300 });
		await goPlay();
		await press(6);
		A(await E(() => G.Dynamax.active), 'the left trigger (unbound) also fires it in a run (main.gd _dyn_poll)');
		await goPlay();
		await press(2);
		A(await E(() => G.Dynamax.active), 'X / Square / Y (left face: the ban button since batch 6, which only bans on the card screen) also fires it in a run (main.gd 676)');
		await goPlay();
		const notMenu = await E(() => { const t = G.Pad.map(); return t; });
		A(notMenu.dynamax === 8 && notMenu.zmove === 10, 'the map now has dynamax = 8 next to zmove = 10', JSON.stringify(notMenu));
		const m = await E(() => { G.Pad.setBtn('dynamax', 3); return G.Pad.map(); });
		A(m.dynamax === 3 && m.reroll === 8, 'remap with swap-on-conflict: dynamax takes Y / top, reroll takes View', JSON.stringify(m));
		await goPlay();
		await press(3);
		A(await E(() => G.Dynamax.active && !G.ZMoves.busy), 'the remapped button fires Dynamax (not the Z-move)');
		const html = await E(() => G.Pad.settingsHTML());
		A(/data-bind="dynamax"/.test(html) && /Dynamax/.test(html), 'Settings > Controls lists a "Dynamax" row to remap');
		const mig = await E(() => {
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 3, zmove: 10 });
			const a = G.Pad.map();
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 8, zmove: 10 });
			const b = G.Pad.map();
			G.Pad.reset('nintendo');
			return { a, b, d: G.Pad.map(), x: G.Pad.defaults('xbox'), p: G.Pad.defaults('playstation') };
		});
		A(mig.a.dynamax === 8 && mig.a.zmove === 10 && mig.a.reroll === 3, 'a map saved before batch 5 keeps its buttons and gains dynamax = View', JSON.stringify(mig.a));
		A(mig.b.reroll === 8 && mig.b.dynamax === 2, 'if that map already used View, dynamax takes the first free button', JSON.stringify(mig.b));
		A(mig.d.dynamax === 8 && mig.x.dynamax === 8 && mig.p.dynamax === 8, 'defaults: View / Back on every layout (pad.gd JOY_BUTTON_BACK)', JSON.stringify([mig.d, mig.x, mig.p]));
		await E(() => { window.__pads[0] = null; T.reset(); });
	}

	// ---------- k. screenshots: a den in the overworld (crater + pillar), the den boss in its arena
	{
		await E(() => {
			T.reset();
			const pl = G.Game.player;
			if (G.Game.state !== 'playing') { G.Game.togglePause(); G.UI.hideAll(); }
			G.Rift.reset();
			let tries = 0;
			while (!(G.Rift.rift && G.Rift.rift.den) && tries++ < 2000) { G.Rift.reset(); G.Rift.update(30.01, pl, 200); }
			// bring it on screen, a little above the player
			const rf = G.Rift.rift; rf.x = pl.x + 90; rf.y = pl.y - 40; rf.ttl = 30; rf.t = 0.5;
			pl.xpMul = 0;
		});
		await sleep(900);
		await shot('den_overworld.png');
		const notice = await E(() => !!(G.Rift.rift && G.Rift.rift.den));
		A(notice, 'a den shown in the world (crater + pillar)');
		// enter it by walking in
		await E(() => { const pl = G.Game.player, rf = G.Rift.rift; pl.x = rf.x; pl.y = rf.y - 10; });
		A(await waitFor(() => E(() => G.Rift.inArena && G.Rift.den), 4000), 'walking into the den enters its arena (G.Rift.den)');
		await E(() => { const b = G.EnemyMgr.get(G.Rift.arena.bossId); const pl = G.Game.player; b.x = pl.x + 40; b.y = pl.y - 90; b.ai = null; b.spd = 0.001; pl.invuln = 999; window.__slots = pl.slots; pl.slots = []; });   // (no attacks: the boss is not flashing white in the shot)
		await sleep(1600);
		await shot('den_boss_arena.png');
		const lbl = await E(() => G.I18n.t('GUARIDA · ' + G.U.mmss(G.Rift.timeLeft)));
		A(/^DEN · \d:\d\d$/.test(lbl), 'the arena timer reads "DEN · m:ss"', lbl);
		await E(() => { G.Game.player.slots = window.__slots; const b = G.EnemyMgr.get(G.Rift.arena.bossId); b.hp = 0; b.die(); G.Progress.kill(b); });
		A(await waitFor(() => E(() => G.Rift.arena && G.Rift.arena.phase === 'won'), 3000), 'beating the den boss wins the den');
		await E(() => { G.Game.player.invuln = 0; });
		await waitFor(() => E(() => !G.Rift.inArena), 9000);
	}

	// ---------- l. the missions screen: the Dynamax card (English, reachable with the pad)
	{
		await E(() => G.Game.quit());
		await waitFor(() => visible('scr-over'), 6000);
		await E(() => document.getElementById('btn-again').click());
		A(await waitFor(() => visible('scr-menu'), 6000), 'back at the menu');
		await E(() => document.querySelector('#scr-menu [data-go=goals]').click());
		A(await waitFor(() => visible('scr-goals'), 5000), 'missions screen');
		await E(() => document.querySelector('#goals-tabs [data-tab=zcr]').click());
		await sleep(300);
		const c = await E(() => { const el = document.querySelector('#goals-body .ach.dyn'); return el ? { txt: el.innerText, ok: el.classList.contains('ok') } : null; });
		A(c && c.ok && /Dynamax/.test(c.txt) && /Unlocked/.test(c.txt) && /Every 4 minutes \(from level 20\): your Pokémon turns giant for 60 s/.test(c.txt) && /Dynamax dens cleared: \d+/.test(c.txt), 'the Z-Crystals tab has a Dynamax card: unlocked, its rules and dens cleared (English)', JSON.stringify(c));
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(13); await sleep(200);
		const reach = await E(() => !!document.querySelector('.pad-focus'));
		A(reach, 'the missions screen is focus-navigable with the pad (ring shown)');
		await E(() => { const el = document.querySelector('#goals-body .ach.dyn'); if (el) el.scrollIntoView({ block: 'center' }); });
		await sleep(200);
		await shot('missions_dynamax_card.png');
		await E(() => { window.__pads[0] = null; });
	}

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
