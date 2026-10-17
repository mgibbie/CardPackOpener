
// micasurvivor_modes_test.mjs — MicaSurvivor M5 batch 6: the quick modes, the 6 run modifiers and the
// in-run level-up card ban, from the Godot Android port by JayElDragon (poke-survivor: menu.gd
// 1496-1675, save_data.gd 16-22 / 556-572, main.gd 262 / 339-357 / 426-449 / 782-860 / 966-983 /
// 1063 / 1861 / 2859-2998 / 3146-3152 / 3261 / 5862-5871 / 6266 / 7484-7670 / 8701-8705,
// main_e16.gd 197, pad.gd, progress.gd 107-134), driven headlessly while logged in to a stubbed
// Magepunk account (the row micasurvivor:<user> with the server's compare-and-set):
//   - data: the port's numbers (480 s, rift checks 20 / 8 / 6 s, none in the last 40 s, coins x1.25 /
//     +0.25 per modifier / +0.5 type / +0.25 rifts, modifier factors 1.4 / 1.15 / 1.8 / 1.6 / 1.5 / 0.5,
//     10 minutes per type) and the daily formulas (seed YYYYMMDD, Pokémon (sd*7919+13) % pool,
//     rule (sd*31+7) % 6), every new string in English
//   - the mode-select screen: reached by mouse (menu), touch (a phone tap) and pad (D-pad + confirm,
//     cancel back); toggling modifiers, changing the type, the party Pokémon picker; English only
//   - Daily Challenge: seeded determinism (world, cast, bosses, starting moves, Pokémon, rule; another
//     date differs), its own best keyed by date, the stats, x1.25 coins ignoring chosen modifiers
//   - Party: any Pokémon (unowned too), cannot die, saves nothing (coins, stats, kills per type,
//     tickets, shinies, missions, achievements)
//   - Rift Time Attack: first check at 20 s, a rift every 8 s check (6 s after a fight), always opens,
//     blocked by a live boss, none in the last 40 s, never a den; the count of wins; the countdown HUD;
//     time's up at 8:00 (but only outside an arena), the record and the +0.25 coins
//   - Type Survival: enemies, bosses and dens of that type only, 10 minutes marks the type, +0.5 coins
//   - modifiers: enemy speed / HP / damage through EnemyMgr.add (bosses x1.15 speed, once only across
//     an arena stash), the spawner's horde factor, Frail halving max HP, No healing (heal, regen, a max-HP
//     card), the mn1..mn6 / mb_<mod> stats, the mode achievements
//   - the ban: Veto level = bans per run, free (no reroll spent); B key, the button (click) and the
//     pad's `ban` action; only new-move cards; a banned move never offered again in the run; hidden at
//     0; in a run the ban button fires Dynamax (as reroll fires the Z-move); remap + migration
//   - persistence: the account push, a 409 merge from a newer save without the records, merge() both ways
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the modes screen, the party picker, the phone layout, a run in
// each mode, the level-up ban, the Time's up result, the daily result.
// Covers micasurvivor/js/systems/modes.js, js/ui/modes-ui.js, js/game.js, js/systems/rift.js,
// js/data/enemies.js, js/systems/spawner.js, js/entities/enemy.js, js/entities/player.js, js/ui/hud.js,
// js/ui/run-ui.js, js/core/pad.js, js/core/db.js, js/systems/progress.js, js/data/achievements.js,
// js/systems/dynamax.js, js/ui/menu.js, js/ui/icons.js, js/world/world.js, js/data/lang-en.js,
// index.html, css/style.css.
//   node overworld/tests/micasurvivor_modes_test.mjs
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
const PORT = 8838;
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
	localStorage.setItem('magepunk_mp_token_v1', 'modes-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'modetester' }));
};

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|tipo|grietas|modo|monedas|partida|elige|vetar|cambiar|hoy|récord|aún|jefes|sin|curación|vida|enemigos)\b/i;

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name, clip) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); } };
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
	// the visible text of a screen, with Pokémon names taken out, and whatever still looks Spanish
	const spanishOn = sel => E((sel, src) => {
		const el = document.querySelector(sel);
		if (!el) return { txt: '', bad: ['missing ' + sel] };
		let txt = el.innerText.replace(/Pok[ée]mon/g, 'Pokemon');
		for (const p of G.DEX) if (/[^\x00-\x7f]/.test(p.name) && txt.includes(p.name)) txt = txt.split(p.name).join('#');
		const re = new RegExp(src, 'gi');
		return { txt: txt.slice(0, 600), bad: txt.match(re) || [] };
	}, sel, SPANISH.source);
	// end the current run (paused first so nothing moves), returning what the coins should be
	const endRun = (t) => E(t => {
		const pl = G.Game.player;
		if (G.Game.state === 'playing') { G.Game.togglePause(); G.UI.hide('scr-pause'); }
		if (t != null) G.Game.debugTime(t);
		const time = G.Game.st.time;
		const parts = Math.floor(time / 5) + Math.floor(pl.kills * 0.25) + pl.bosses * 80 + pl.coins;
		const s = G.DB.save;
		window.__pre = { ach: Object.keys(s.ach || {}), zmis: Object.keys(s.zmis || {}) };
		const before = { coins: s.coins, runs: s.stats.runs, coinMul: pl.coinMul, parts, time };
		G.Game.quit();
		return before;
	}, t);
	// coins paid meanwhile by achievements and Z-crystal missions that the run unlocked
	const bonus = () => E(() => {
		const s = G.DB.save, pre = window.__pre;
		const a = Object.keys(s.ach || {}).filter(k => !pre.ach.includes(k)), z = Object.keys(s.zmis || {}).filter(k => !pre.zmis.includes(k));
		return a.reduce((n, k) => n + (((G.AchDefs.BY[k] || {}).reward || {}).coins || 0), 0) + z.length * G.ZMoves.ZMIS_COINS;
	});
	const toMenu = async () => {
		await waitFor(() => visible('scr-over'), 8000);
		await E(() => document.getElementById('btn-again').click());
		return waitFor(() => visible('scr-menu'), 8000);
	};
	const startMode = async (mode) => {
		await E(m => G.ModesUI.open(), mode);
		await waitFor(() => visible('scr-modes'), 4000);
		await E(m => document.querySelector(`#modes-list [data-mode=${m}]`).click(), mode);
		return waitFor(() => E(() => G.Game.state === 'playing'), 15000);
	};
	const pauseRun = () => E(() => { if (G.Game.state === 'playing') { G.Game.togglePause(); G.UI.hide('scr-pause'); } });

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.Modes && !!G.ModesUI), 30000), 'boots logged in (Magepunk account); G.Modes and G.ModesUI loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await E(() => { const s = G.DB.save; G.DB.grant(4, 'starter'); s.partner = 4; s.partnerShiny = false; G.DB.commit(true); });

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const M = G.Modes;
			const sd = 20261017;
			const pool = G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex]).map(p => p.dex);
			const strings = ['Modos de juego', 'Desafío diario y más', 'Elige un modo', 'Partida normal', 'La experiencia de siempre, igual que el juego original.',
				'Desafío diario', 'Hoy: Pikachu con la regla «Horda» (misma para todos). +25% de monedas.', 'Tu mejor tiempo de hoy: 3:12', 'Aún no lo has jugado hoy.',
				'Modo Fiesta', 'Cualquier Pokémon, no puedes morir y no se guarda progreso. Pokémon: Snorlax', 'Elegir Pokémon de la fiesta', 'Toca un Pokémon para la fiesta',
				'Contrarreloj de grietas', '8 minutos: las grietas se abren sin parar. Gana todas las peleas que puedas. +25% de monedas. Récord: 4 grietas.',
				'Supervivencia por tipo', 'Solo aparecen Pokémon de tipo Fuego (y sus jefes). +50% de monedas.', 'Tipos superados: 2 / 18', 'Cambiar tipo: Agua',
				'Modificadores (todos los modos menos Diario y Fiesta): +25% de monedas por cada uno activo',
				...M.MOD_IDS.flatMap(id => [M.MOD[id].name, M.MOD[id].desc]),
				'¡Tiempo!', 'Grietas ganadas', 'Grietas ganadas: 3', '¡Mejor marca de hoy!', '¡Récord!', 'Contrarreloj de grietas: 3', 'Supervivencia: Fuego',
				'No se guarda progreso', 'Modo Fiesta: no se guarda progreso', 'Vetar carta', 'Elige un movimiento nuevo para vetarlo', 'Atrás',
				...G.AchDefs.LIST.filter(a => a.cat === 'modos').flatMap(a => [a.name, a.desc, a.title || ''].filter(Boolean))];
			return {
				rifts: M.RIFTS, coins: M.COINS, k: M.K, mods: M.MOD_IDS, types: M.TYPES.length, typeMin: M.TYPE_DONE_MIN, list: M.LIST, party: M.PARTY_DEX,
				seed: M.dailySeed(new Date(2026, 9, 17)), seedJan: M.dailySeed(new Date(2027, 0, 5)),
				dex: M.dailyDex(sd), want: pool[(sd * 7919 + 13) % pool.length], noLeg: pool.every(d => !G.DEX_BY[d].leg),
				mod: M.dailyMod(sd), wantMod: M.MOD_IDS[(sd * 31 + 7) % 6],
				en: strings.map(s => [s, G.I18n.t(s)]),
				ach: G.AchDefs.LIST.filter(a => a.cat === 'modos').map(a => [a.id, a.goal, a.reward]), cats: G.AchDefs.CATS.map(c => c[0]),
			};
		});
		A(JSON.stringify(r.rifts) === JSON.stringify({ limit: 480, first: 20, every: 8, after: 6, last: 40 }), 'Rift Time Attack: 480 s, checks at 20 s then every 8 s (6 s after a fight), none in the last 40 s (main.gd 262 / 449 / 5862-5866 / 6266)', JSON.stringify(r.rifts));
		A(JSON.stringify(r.coins) === JSON.stringify({ daily: 1.25, perMod: 0.25, type: 0.5, rifts: 0.25 }), 'coins: Daily x1.25, +0.25 per modifier, +0.5 Type Survival, +0.25 Rift Time Attack (main.gd 799-822)', JSON.stringify(r.coins));
		A(JSON.stringify(r.k) === JSON.stringify({ fast: 1.4, fastBoss: 1.15, horde: 1.8, tank: 1.6, hard: 1.5, frail: 0.5 }) && JSON.stringify(r.mods) === '["fast","horde","tank","hard","frail","nohealing"]',
			'the 6 modifiers in the port\'s order with its factors (fast 1.4 / bosses 1.15, horde 1.8, tank 1.6, hard 1.5, frail 0.5)', JSON.stringify([r.k, r.mods]));
		A(r.types === 18 && r.typeMin === 10 && r.party === 25 && JSON.stringify(r.list) === '["normal","daily","party","rifts","type"]', '18 types, 10 minutes marks a type, party Pokémon defaults to Pikachu (25), the batch-6 modes');
		A(r.seed === 20261017 && r.seedJan === 20270105, 'the daily seed is the date as YYYYMMDD (save_data.gd daily_seed)', JSON.stringify([r.seed, r.seedJan]));
		A(r.dex === r.want && r.noLeg && r.mod === r.wantMod, `the daily Pokémon = pool[(sd*7919+13) % n] (non-legendary) and the rule = MOD_IDS[(sd*31+7) % 6] (${r.dex}, ${r.mod})`, JSON.stringify(r));
		const bad = r.en.filter(([es, en]) => es === en && !/^(Horda|No)$/.test(es) || SPANISH.test(en.replace(/Pok[ée]mon/g, '')));
		A(bad.length === 0, `every new string has English (lang_en.json wording; ${r.en.length} checked)`, JSON.stringify(bad));
		const en = Object.fromEntries(r.en);
		A(en['Hoy: Pikachu con la regla «Horda» (misma para todos). +25% de monedas.'] === 'Today: Pikachu with the rule “Horde” (same for everyone). +25% coins.' && en['Supervivencia: Fuego'] === 'Survival: Fire' && en['Grietas ganadas: 3'] === 'Rifts won: 3',
			'patterns fill their holes (Today: Pikachu with the rule “Horde”…, Survival: Fire, Rifts won: 3)', JSON.stringify([en['Hoy: Pikachu con la regla «Horda» (misma para todos). +25% de monedas.'], en['Supervivencia: Fuego']]));
		A(r.ach.length === 20 && r.cats.includes('modos') && JSON.stringify(r.ach.find(a => a[0] === 'daily1')) === '["daily1",1,{"coins":150,"t1":2}]' && JSON.stringify(r.ach.find(a => a[0] === 'typeAll')) === '["typeAll",18,{"coins":8000,"t1":5,"t10":5}]',
			'20 "Game modes" achievements from progress.gd (daily, modifiers, type, rifts) with the port\'s goals and rewards', JSON.stringify(r.ach.slice(0, 3)));
	}

	// ================= 2. the modes screen: mouse =================
	if (!ONLY.length || ONLY.includes('2')) {
		A(await E(() => !!document.querySelector('#scr-menu [data-go=modes]')), 'the menu has a "Game modes" entry');
		await page.click('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 4000), 'clicking it opens the mode-select screen');
		await sleep(400);
		const r = await E(() => ({
			title: document.getElementById('modes-title').innerText,
			cards: [...document.querySelectorAll('#modes-list [data-mode]')].map(b => b.dataset.mode),
			mods: [...document.querySelectorAll('#modes-mods [data-mod]')].map(b => b.dataset.mod),
			daily: document.querySelector('#modes-list [data-mode=daily]').innerText,
			dailyDex: G.DEX_BY[G.Modes.dailyDex(G.Modes.dailySeed())].name, rule: G.I18n.t(G.Modes.MOD[G.Modes.dailyMod(G.Modes.dailySeed())].name),
		}));
		A(r.title === 'Choose a mode' && JSON.stringify(r.cards) === '["normal","daily","party","rifts","type"]' && r.mods.length === 6, 'one card per mode (Normal, Daily, Party, Rift Time Attack, Survival by Type) and 6 modifier switches', JSON.stringify(r));
		A(r.daily.includes(r.dailyDex) && r.daily.includes('“' + r.rule + '”') && /You haven't played it today\./.test(r.daily), "the Daily card names today's Pokémon and rule, and \"You haven't played it today.\"", r.daily);
		const sp = await spanishOn('#scr-modes');
		A(sp.bad.length === 0, 'the modes screen shows no Spanish in English mode', JSON.stringify(sp));
		await shot('modes_screen.png');
		// a modifier switch, the type button, both saved
		await page.click('#modes-mods [data-mod=horde]');
		await sleep(150);
		const t0 = await E(() => G.Modes.prefs().type);
		await page.click('#modes-type');
		await sleep(150);
		const m = await E(() => ({ mods: G.Modes.prefs().mods.slice(), on: document.querySelector('[data-mod=horde]').classList.contains('on'), sw: document.querySelector('[data-mod=horde] .mod-sw').innerText,
			type: G.Modes.prefs().type, btn: document.getElementById('modes-type').innerText, card: document.querySelector('[data-mode=type]').innerText, saved: JSON.stringify(G.DB.save.modes) }));
		A(JSON.stringify(m.mods) === '["horde"]' && m.on && m.sw === 'Yes', 'clicking a modifier turns it on (saved in save.modes.mods; the switch reads "Yes")', JSON.stringify(m));
		A(t0 === 'fire' && m.type === 'water' && /Change type: Water/.test(m.btn) && /Only Water-type Pokémon appear/.test(m.card), '"Change type" cycles in the port\'s order (Fire -> Water) and the card follows', JSON.stringify(m));
		// the party picker: any Pokémon, unowned too
		await page.click('#modes-party-pick');
		A(await waitFor(() => visible('modes-party'), 3000) && !(await visible('modes-main')), '"Choose the party Pokémon" opens the picker');
		const g = await E(() => ({ cells: document.querySelectorAll('#party-grid .cell').length, gen1: G.DEX.filter(p => p.gen === 1 && G.SPRITE_META[p.dex]).length, names: [...document.querySelectorAll('#party-grid .cell b')].slice(0, 3).map(b => b.innerText), owned143: !!G.DB.save.owned[143] }));
		A(await E(() => document.querySelector('#scr-modes [data-back]').classList.contains('hidden')), 'the picker has a single way back (the list’s "Back" hides)');
		A(g.cells === g.gen1 && g.names.every(n => n && n !== '???') && !g.owned143, 'the picker lists every Pokémon of the generation with its name (owned or not)', JSON.stringify(g));
		await shot('modes_party_picker.png');
		await page.click('#party-grid .cell[data-dex="143"]');
		await sleep(200);
		const pk = await E(() => ({ party: G.Modes.prefs().party, back: !document.getElementById('modes-main').classList.contains('hidden'), card: document.querySelector('[data-mode=party]').innerText }));
		A(pk.party === 143 && pk.back && /Pokémon: Snorlax/.test(pk.card), 'tapping one picks it (Snorlax, not owned) and goes back to the list', JSON.stringify(pk));
		await E(() => { G.Modes.toggleMod('horde'); G.Modes.prefs().type = 'water'; });
		await page.click('#scr-modes [data-back]');
		A(await waitFor(() => visible('scr-menu'), 3000), '"Back" returns to the menu');
	}

	// ================= 3. the modes screen: pad =================
	if (!ONLY.length || ONLY.includes('3')) {
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(13); await sleep(150);
		const fdesc = () => E(() => { const f = document.querySelector('.pad-focus'); return f ? f.outerHTML.slice(0, 90) : 'none'; });
		A(await navTo('#scr-menu [data-go=modes]'), 'the D-pad reaches "Game modes" on the menu', await fdesc());
		await press(1);   // Nintendo: right face confirms
		A(await waitFor(() => visible('scr-modes'), 3000), 'confirm opens the modes screen');
		await sleep(300);
		const home = await E(() => { const f = document.querySelector('.pad-focus'); return f && f.dataset.mode; });
		A(home === 'normal', 'the focus starts on "Normal run"', home);
		A(await navTo('#modes-mods [data-mod=tank]'), 'the D-pad reaches a modifier switch');
		await press(1);
		A(await waitFor(() => E(() => G.Modes.prefs().mods.includes('tank')), 2000), 'confirm toggles it (Tough on)');
		await press(1);
		A(await waitFor(() => E(() => !G.Modes.prefs().mods.includes('tank')), 2000), 'and off again (the focus stays on the switch after the re-render)');
		A(await navTo('#modes-party-pick'), 'the D-pad reaches "Choose the party Pokémon"', await fdesc());
		await press(1);
		A(await waitFor(() => visible('modes-party'), 2000), 'confirm opens the picker');
		await press(0);   // Nintendo: bottom face = back
		A(await waitFor(() => E(() => !document.getElementById('modes-main').classList.contains('hidden') && document.getElementById('modes-party').classList.contains('hidden')), 2000) && await visible('scr-modes'), 'cancel closes the picker back to the list (not the menu)');
		await press(0);
		A(await waitFor(() => visible('scr-menu'), 2000), 'cancel again returns to the menu');
		await E(() => { window.__pads[0] = null; });
		await sleep(300);
	}

	// ================= 4. the modes screen: touch (phone) =================
	if (!ONLY.length || ONLY.includes('4')) {
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
		await sleep(600);
		const tapEl = async (sel) => { const b = await E(sel => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (b) await page.touchscreen.tap(b.x, b.y); return !!b; };
		await tapEl('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 3000), 'a tap on "Game modes" opens the screen on a phone');
		await sleep(400);
		await shot('modes_screen_phone.png');
		const fit = await E(() => {
			const box = document.querySelector('#scr-modes .box'), r = box.getBoundingClientRect();
			const over = [...document.querySelectorAll('#scr-modes .mode-card, #scr-modes .mod-tog')].filter(el => { const b = el.getBoundingClientRect(); return b.right > innerWidth + 1 || b.left < -1 || el.scrollWidth > el.clientWidth + 2; }).length;
			return { w: r.width, vw: innerWidth, over, scroll: document.documentElement.scrollWidth <= innerWidth + 1 };
		});
		A(fit.over === 0 && fit.scroll, 'nothing is cut off or overflows sideways at 844x390', JSON.stringify(fit));
		await tapEl('#modes-mods [data-mod=fast]');
		A(await waitFor(() => E(() => G.Modes.prefs().mods.includes('fast')), 2000), 'a tap toggles a modifier');
		await tapEl('#modes-mods [data-mod=fast]');
		await E(() => document.querySelector('#scr-modes [data-back]').click());
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(500);
	}

	// ================= 5. Daily Challenge =================
	if (!ONLY.length || ONLY.includes('5')) {
		// a chosen modifier must not leak into the daily (it brings its own rule)
		await E(() => { G.Modes.prefs().mods = ['tank']; G.DB.save.daily = { date: 20200101, best: 999 }; });
		const snap = () => E(() => {
			const pl = G.Game.player;
			return { dex: pl.dex, world: G.World.seed, mods: G.Modes.mods, mode: G.Game.mode, cast: G.Enemies.cast.map(t => t.list.map(d => d.dex + ':' + d.behavior)).join(','),
				bosses: G.Enemies.BOSSES.map(b => b.dex).join(','), moves: pl.moves.map(m => m.id).join(','), owned: !!G.DB.save.owned[pl.dex] };
		});
		A(await startMode('daily'), 'a click on the Daily Challenge card starts the run');
		await pauseRun();
		const a = await snap();
		const want = await E(() => { const sd = G.Modes.dailySeed(); return { dex: G.Modes.dailyDex(sd), mod: G.Modes.dailyMod(sd) }; });
		A(a.dex === want.dex && JSON.stringify(a.mods) === JSON.stringify([want.mod]) && a.mode === 'daily', `you play today's Pokémon (${a.dex}, owned: ${a.owned}) with today's rule only (${a.mods}; the chosen "Tough" is ignored)`, JSON.stringify(a));
		await E(() => { G.Game.togglePause(); });
		await sleep(1200);
		await shot('run_daily.png');
		const c1 = await endRun(200);
		const o1 = await E(() => ({ daily: G.DB.save.daily, plays: G.DB.save.stats.dailyPlays, bm: G.DB.save.stats.dailyBestMin, coins: G.DB.save.coins, mode: document.querySelector('#scr-over .over-mode') && document.querySelector('#scr-over .over-mode').innerText,
			mn1: G.DB.save.stats.mn1 || 0, mbt: G.DB.save.stats.mb_tank || 0, ach: !!(G.DB.save.ach && G.DB.save.ach.daily1) }));
		const today = await E(() => G.Modes.dailySeed());
		A(o1.daily.date === today && o1.daily.best === 200, 'the daily best is keyed by today\'s date: an older date\'s record is replaced (best 200 s)', JSON.stringify(o1.daily));
		A(o1.plays === 1 && o1.bm === 3 && o1.mn1 === 0 && o1.mbt === 0, 'stats: dailyPlays 1, dailyBestMin 3; the modifier stats do not count the daily (main.gd 850)', JSON.stringify(o1));
		const b1 = await bonus();
		const exp1 = Math.round(c1.parts * (1.25 * c1.coinMul)) + b1;   // + the "Today's challenge" achievement (150)
		A(o1.coins - c1.coins === exp1 && o1.ach && b1 >= 150, `coins x1.25 (${o1.coins - c1.coins - b1} for ${c1.parts} base x ${c1.coinMul}) and the Daily achievement pays 150`, JSON.stringify([o1.coins - c1.coins, exp1, b1]));
		A(/Daily Challenge · Best score of the day!/.test(o1.mode || ''), 'the result says "Daily Challenge · Best score of the day!"', o1.mode);
		await sleep(900);
		const spo = await spanishOn('#scr-over');
		A(spo.bad.length === 0, 'the daily result shows no Spanish in English mode', JSON.stringify(spo));
		await shot('over_daily.png');
		A(await toMenu(), 'back to the menu');
		// determinism: the same day gives the same run
		await startMode('daily');
		await pauseRun();
		const b = await snap();
		A(a.world === b.world && a.cast === b.cast && a.bosses === b.bosses && a.moves === b.moves && a.dex === b.dex, 'a second daily today: the same world seed, enemy cast, bosses, Pokémon and starting moves (seeded)', JSON.stringify([a.world, b.world, a.bosses, b.bosses]));
		const other = await E(() => { const s2 = 20261018; return G.Modes.seeded(s2, () => { const r = G.Enemies.rollRun(); return { cast: r.cast.map(t => t.list.map(d => d.dex + ':' + d.behavior)).join(','), bosses: r.bosses.map(b => b.dex).join(',') }; }); });
		A(other.cast !== a.cast || other.bosses !== a.bosses, 'another date seeds a different run');
		const c2 = await endRun(100);
		const o2 = await E(() => ({ daily: G.DB.save.daily, plays: G.DB.save.stats.dailyPlays, mode: document.querySelector('#scr-over .over-mode').innerText }));
		A(o2.daily.best === 200 && o2.plays === 2 && !/Best score/.test(o2.mode), 'a worse daily keeps the best of the day (200) and still counts a play', JSON.stringify(o2));
		await toMenu();
		await E(() => G.ModesUI.open());
		await sleep(250);
		const card = await E(() => document.querySelector('[data-mode=daily]').innerText);
		A(/Your best time today: 3:20/.test(card), 'the Daily card now shows "Your best time today: 3:20"', card);
		await E(() => { document.querySelector('#scr-modes [data-back]').click(); G.Modes.prefs().mods = []; });
	}

	// ================= 6. Party =================
	if (!ONLY.length || ONLY.includes('6')) {
		const before = await E(() => { const s = G.DB.save; return { coins: s.coins, runs: s.stats.runs, kills: s.stats.totalKills, t1: s.tickets.t1, tk: JSON.stringify(Object.entries(s.stats).filter(([k]) => k.startsWith('tk_'))), owned: Object.keys(s.owned).length, shiny: Object.keys(s.shiny || {}).length, ach: Object.keys(s.ach || {}).length, missions: JSON.stringify(s.missions) }; });
		A(await startMode('party'), 'Party Mode starts');
		await pauseRun();
		const r = await E(() => {
			const pl = G.Game.player, s = G.DB.save;
			const out = { dex: pl.dex, owned: !!s.owned[pl.dex], off: G.Progress.off, mode: G.Game.mode };
			pl.invuln = 0; pl.hurt(1e9); out.hp = pl.hp; out.dead = pl.dead;
			pl.invuln = 0; pl.hurt(1e9); out.hp2 = pl.hp; out.dead2 = pl.dead;
			// a kill, a ticket, a shiny: none of it is saved
			G.Progress.kill({ types: ['fire'], boss: true, dex: 4 });
			G.Game.debugCollect({ kind: 'ticket', value: 1, x: pl.x, y: pl.y });
			G.onShinyCaught({ dex: 7, name: 'Squirtle' });
			out.t1 = s.tickets.t1; out.shiny = Object.keys(s.shiny || {}).length; out.tk = s.stats.tk_fire || 0; out.bosses = s.stats.bossesTotal || 0;
			return out;
		});
		A(r.dex === 143 && !r.owned && r.mode === 'party' && r.off, 'you play the chosen party Pokémon (Snorlax, not owned); progress is off', JSON.stringify(r));
		A(r.hp === 1 && !r.dead && r.hp2 === 1 && !r.dead2, 'you cannot die: a lethal hit leaves 1 HP, twice (main.gd 1861)', JSON.stringify(r));
		A(r.t1 === before.t1 && r.shiny === before.shiny, 'a picked-up ticket and a caught shiny are not saved');
		await E(() => { G.Game.togglePause(); });
		await sleep(1000);
		await shot('run_party.png');
		await endRun(400);
		const after = await E(() => { const s = G.DB.save; return { coins: s.coins, runs: s.stats.runs, kills: s.stats.totalKills, t1: s.tickets.t1, tk: JSON.stringify(Object.entries(s.stats).filter(([k]) => k.startsWith('tk_'))), owned: Object.keys(s.owned).length, shiny: Object.keys(s.shiny || {}).length, ach: Object.keys(s.ach || {}).length, missions: JSON.stringify(s.missions), off: G.Progress.off,
			over: document.getElementById('over-stats').innerText, title: document.getElementById('over-title').innerText }; });
		A(after.coins === before.coins && after.runs === before.runs && after.kills === before.kills && after.t1 === before.t1 && after.tk === before.tk && after.owned === before.owned && after.shiny === before.shiny && after.ach === before.ach && after.missions === before.missions,
			'nothing is saved: coins, runs, kills, kills per type, tickets, Pokémon, shinies, achievements, missions', JSON.stringify([before, after]).slice(0, 400));
		A(!after.off && /Party Mode · No progress is saved/.test(after.over), 'the result says "Party Mode · No progress is saved"; progress is back on after', after.over.slice(0, 200));
		await toMenu();
	}

	// ================= 7. Rift Time Attack =================
	if (!ONLY.length || ONLY.includes('7')) {
		A(await startMode('rifts'), 'Rift Time Attack starts');
		await pauseRun();
		const r = await E(() => {
			const pl = G.Game.player, R = G.Rift;
			pl.invuln = 1e9; pl.xpMul = 0;   // (no level-up cards in the way)
			G.EnemyMgr.clear();
			R.reset();
			const out = { mode: G.Game.mode, check0: R.checkT };
			R.update(19.9, pl, 19.9); out.at199 = !!R.rift;
			R.update(0.2, pl, 20.1); out.at201 = !!R.rift && !R.rift.den;
			// win it: enter and beat the legendary
			R.enterRequest();
			out.arena = R.inArena;
			const boss = G.EnemyMgr.get(R.arena.bossId);
			boss.hp = 0; boss.die(); G.Progress.kill(boss);
			R.update(1 / 60, pl, 40);
			out.won = R.arena && R.arena.phase === 'won'; out.wins = G.Modes.riftsWon;
			R.update(5.1, pl, 45);
			out.back = !R.inArena; out.after = R.checkT;
			R.update(5.9, pl, 51); out.at59 = !!R.rift;
			R.update(0.2, pl, 51.2); out.at61 = !!R.rift;
			// a live boss blocks the check
			R.reset();
			const bdef = { dex: 19, name: 'B', hp: 1e7, spd: 0.001, dmg: 1, xp: 0, behavior: 'chase' };
			const b = new G.Enemy(bdef, pl.x + 600, pl.y, { hp: 1, spd: 1, dmg: 1 }, true); G.EnemyMgr.add(b);
			R.update(20.1, pl, 100); out.withBoss = !!R.rift;
			G.EnemyMgr.clear();
			// never a den, always a rift (2000 checks after 120 s)
			let rifts = 0, dens = 0;
			for (let i = 0; i < 2000; i++) { R.reset(); R.update(20.01, pl, 300); if (R.rift) { if (R.rift.den) dens++; else rifts++; } }
			out.rifts = rifts; out.dens = dens;
			// none in the last 40 s
			R.reset(); let late = 0;
			for (let t = 441; t < 480; t += 8) { R.update(8.01, pl, t); if (R.rift) late++; }
			out.late = late;
			R.reset();
			return out;
		});
		A(r.mode === 'rifts' && r.check0 === 20 && !r.at199 && r.at201, 'the first rift check is at 20 s (before the normal 75 s start) and it opens one', JSON.stringify(r));
		A(r.arena && r.won && r.wins === 1, 'winning the rift fight counts 1 (G.Modes.riftsWon)', JSON.stringify(r));
		A(r.back && r.after === 6 && !r.at59 && r.at61, 'after the fight the next check comes in 6 s and opens another (main.gd 6266)', JSON.stringify(r));
		A(!r.withBoss, 'a live boss blocks the check');
		A(r.rifts >= 1990 && r.dens === 0, `every check opens a rift (chance 1; ${r.rifts}/2000, a few find no free spot) and never a Dynamax den (2000 checks after 120 s)`, JSON.stringify(r));
		A(r.late === 0, 'no new rift in the last 40 s (440-480 s)', JSON.stringify(r));
		// the HUD counts down, red in the last 30 s, with the rifts won below
		const hud = await E(() => {
			const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ctx = cv.getContext('2d');
			const seen = []; const ft = ctx.fillText.bind(ctx); ctx.fillText = (t, ...a) => { seen.push([String(t), ctx.fillStyle]); return ft(t, ...a); };
			G.HUD.draw(ctx, 1280, 720, G.Game.player, { time: 455 });
			const seen2 = []; ctx.fillText = (t, ...a) => { seen2.push([String(t), ctx.fillStyle]); return ft(t, ...a); };
			G.HUD.draw(ctx, 1280, 720, G.Game.player, { time: 100 });
			return { red: seen.find(x => x[0] === '0:25'), white: seen2.find(x => x[0] === '6:20'), won: seen.find(x => /^Grietas ganadas: 1$/.test(x[0])), en: G.I18n.t('Grietas ganadas: 1') };
		});
		A(hud.red && hud.red[1] === '#ff6b7a' && hud.white && hud.won && hud.en === 'Rifts won: 1', 'the clock counts down from 8:00 (6:20 at 100 s; 0:25 in red at 455 s) with "Rifts won: 1" below', JSON.stringify(hud));
		await E(() => { G.Game.togglePause(); });
		await sleep(1200);
		await shot('run_rifts.png');
		// at 8:00 inside an arena: the fight goes on; the run ends when you are back
		await pauseRun();
		await E(() => { G.EnemyMgr.clear(); G.Rift.enterRequest(); G.Game.debugTime(481); G.Game.player.invuln = 1e9; G.Game.togglePause(); });
		await sleep(900);
		const mid = await E(() => ({ state: G.Game.state, arena: G.Rift.inArena, up: G.Modes.timeUp }));
		A(mid.state === 'playing' && mid.arena && !mid.up, 'past 8:00 inside an arena the fight goes on (main.gd 966: arena == null)', JSON.stringify(mid));
		const c0 = await E(() => ({ coins: G.DB.save.coins, best: G.DB.save.stats.riftsBest || 0 }));
		await E(() => { const b = G.EnemyMgr.get(G.Rift.arena.bossId); b.hp = 0; b.die(); G.Progress.kill(b); });
		// (any card / item / bond choice the legend's reward brings is taken, as a player would)
		const clearChoices = () => E(() => { for (const sel of ['#cards .card', '#item-cards .card', '#bond-cards .card']) { const el = document.querySelector(sel); if (el && !el.closest('.hidden')) el.click(); } return !document.getElementById('scr-over').classList.contains('hidden'); });
		A(await waitFor(clearChoices, 20000), 'back from the arena: time is up and the run ends', JSON.stringify(await E(() => ({ st: G.Game.state, t: G.Game.st.time, arena: G.Rift.arena && G.Rift.arena.phase, up: G.Modes.timeUp, mode: G.Modes.mode }))));
		const o = await E(() => ({ title: document.getElementById('over-title').innerText, stats: document.getElementById('over-stats').innerText, s: G.DB.save.stats, coins: G.DB.save.coins, timeUp: G.Modes.timeUp }));
		A(o.title === "Time's up!" && /Rifts won\s*2/i.test(o.stats) && /Rift Time Attack: 2 · New record!/.test(o.stats), 'the result: "Time\'s up!", Rifts won 2, "Rift Time Attack: 2 · New record!"', o.title + ' | ' + o.stats.slice(0, 300));
		A(o.s.riftsBest === 2 && o.s.riftsRuns === 1 && c0.best === 0, 'the record (stats.riftsBest = 2) and stats.riftsRuns = 1', JSON.stringify([o.s.riftsBest, o.s.riftsRuns]));
		A(/with the mode/.test(o.stats), 'the coin breakdown shows the mode multiplier (+0.25)', o.stats.slice(0, 400));
		await sleep(900);
		const spo = await spanishOn('#scr-over');
		A(spo.bad.length === 0, 'the "Time’s up" result shows no Spanish in English mode', JSON.stringify(spo));
		await shot('over_rifts_timeup.png');
		await toMenu();
	}

	// ================= 8. Survival by Type =================
	if (!ONLY.length || ONLY.includes('8')) {
		await E(() => { G.Modes.prefs().type = 'water'; G.Modes.prefs().mods = []; });
		A(await startMode('type'), 'Survival by Type (Water) starts');
		await pauseRun();
		const r = await E(() => {
			const E2 = G.Enemies, water = p => (G.DEX_BY[p] || {}).types.includes('water');
			const castDex = E2.cast.flatMap(t => t.list.map(d => d.dex));
			const cand = E2.TIERS.map(t => E2.candidates(t).every(p => p.types.includes('water')));
			const dens = []; for (let i = 0; i < 30; i++) { const m = G.Dynamax.denMon(60 + i * 20); dens.push(!!m && m.types.includes('water')); }
			return { mode: G.Game.mode, cast: castDex.every(water), n: castDex.length, bosses: E2.BOSSES.map(b => b.dex).every(water), nb: E2.BOSSES.length, cand, dens: dens.every(Boolean) };
		});
		A(r.mode === 'type' && r.cast && r.n >= 30 && r.cand.every(Boolean), `every enemy of the run's cast is Water-type (${r.n}) and so is every tier's candidate list (main.gd _candidates)`, JSON.stringify(r));
		A(r.bosses && r.nb === 5, 'the 5 bosses are Water-type (main.gd 2986-2998)', JSON.stringify(r));
		A(r.dens, 'raid dens hold a Water-type Pokémon too');
		const tag = await E(() => {
			const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ctx = cv.getContext('2d');
			const seen = []; const ft = ctx.fillText.bind(ctx); ctx.fillText = (t, ...a) => { seen.push(String(t)); return ft(t, ...a); };
			G.HUD.draw(ctx, 1280, 720, G.Game.player, { time: 30 });
			const t = seen.find(x => /SUPERVIVENCIA POR TIPO/.test(x));
			return { t, en: t && G.I18n.t(t) };
		});
		A(tag.t === 'SUPERVIVENCIA POR TIPO · AGUA' && tag.en === 'SURVIVAL BY TYPE · WATER', 'the HUD names the mode at the top right ("SURVIVAL BY TYPE · WATER")', JSON.stringify(tag));
		await E(() => { G.Game.player.invuln = 1e9; G.Game.togglePause(); });
		await sleep(4500);
		await shot('run_type.png');
		const c = await endRun(600);
		const o = await E(() => ({ done: G.DB.save.typeDone, s: G.DB.save.stats, coins: G.DB.save.coins, over: document.getElementById('over-stats').innerText, ach: G.DB.save.ach }));
		A(o.done && o.done.water && o.s.typeRuns === 1 && o.s.typeBestMin === 10, '10 minutes marks Water as beaten (save.typeDone), typeRuns 1, typeBestMin 10', JSON.stringify([o.done, o.s.typeRuns, o.s.typeBestMin]));
		const ach = await bonus();
		A(o.coins - c.coins - ach === Math.round(c.parts * (c.coinMul + 0.5)) && o.ach.type1 && o.ach.type10, 'coins: base x (your multiplier + 0.5); the type achievements (5 and 10 minutes) pay out', JSON.stringify([o.coins - c.coins, c.parts, c.coinMul]));
		A(/Survival: Water/.test(o.over), 'the result says "Survival: Water"', o.over.slice(0, 200));
		await toMenu();
		const u = await E(() => {
			const s = JSON.parse(JSON.stringify(G.DB.save));
			G.Modes.begin({ mode: 'type', type: 'ice' }); G.Modes.finish(599, s);
			const at599 = !!(s.typeDone && s.typeDone.ice);
			G.Modes.begin({ mode: 'type', type: 'ice' }); G.Modes.finish(600, s);
			G.Modes.begin({ mode: 'normal' });
			return { at599, at600: !!s.typeDone.ice, count: G.Modes.typeDoneCount(s) };
		});
		A(!u.at599 && u.at600 && u.count === 2, '9:59 does not mark the type, 10:00 does (typeVar counts them)', JSON.stringify(u));
	}

	// ================= 9. the 6 modifiers =================
	if (!ONLY.length || ONLY.includes('9')) {
		await E(() => { G.Modes.prefs().mods = ['fast', 'horde', 'tank', 'hard', 'frail', 'nohealing']; });
		A(await startMode('normal'), 'a Normal run with all 6 modifiers');
		await pauseRun();
		const r = await E(() => {
			const pl = G.Game.player, M = G.Modes;
			const perks = G.Upgrades.perks(G.DB.upgradesOf(pl.dex));
			const out = { mods: M.mods, maxHp: pl.maxHp, want: Math.round((pl.mon.hp + (perks.hp || 0)) * 0.5) };
			const def = { dex: 19, name: 'x', hp: 100, spd: 50, dmg: 10, xp: 1, behavior: 'chase' };
			const mk = boss => { const e = new G.Enemy(def, pl.x + 900, pl.y, { hp: 1, spd: 1, dmg: 1 }, boss); const base = { hp: e.maxHp, spd: e.spd, dmg: e.dmg }; G.EnemyMgr.add(e); return { base, e }; };
			const n = mk(false), b = mk(true);
			out.k = { hp: n.e.maxHp / n.base.hp, cur: n.e.hp / n.base.hp, spd: n.e.spd / n.base.spd, dmg: n.e.dmg / n.base.dmg, bspd: b.e.spd / b.base.spd, bhp: b.e.maxHp / b.base.hp };
			// the arena stash puts them back through add(): applied once only
			G.EnemyMgr.stash(); G.EnemyMgr.restore();
			out.again = n.e.maxHp / n.base.hp;
			// the spawner reads the horde factor
			out.spawnK = M.spawnK();
			const k0 = M.spawnK; G.EnemyMgr.clear();
			M.spawnK = () => 1000; G.Spawner.update(0.01, pl, 10); const many = G.EnemyMgr.count;
			G.EnemyMgr.clear(); M.spawnK = () => 1; G.Spawner.update(0.01, pl, 10); const few = G.EnemyMgr.count;
			M.spawnK = k0; G.EnemyMgr.clear();
			out.many = many; out.few = few;
			// No healing: a heal and regen do nothing, a max-HP card's HP stays
			pl.hp = 40; M.healTick(pl);
			pl.heal(30); M.healTick(pl); out.heal = pl.hp;
			pl.addMaxHp(20); M.healTick(pl); out.card = pl.hp;
			pl.regenFlat = 50; pl.invuln = 1e9;
			return out;
		});
		A(JSON.stringify(r.mods) === '["fast","horde","tank","hard","frail","nohealing"]', 'all 6 are on for the run', JSON.stringify(r.mods));
		A(r.maxHp === r.want, `Fragile: max HP halved at the start (${r.maxHp})`, JSON.stringify(r));
		A(near(r.k.hp, 1.6, 0.01) && near(r.k.cur, 1.6, 0.01) && near(r.k.spd, 1.4) && near(r.k.dmg, 1.5) && near(r.k.bspd, 1.15) && near(r.k.bhp, 1.6, 0.01), 'Tough x1.6 HP, Fast x1.4 speed (bosses x1.15), Heavy hitters x1.5 damage, through EnemyMgr.add', JSON.stringify(r.k));
		A(near(r.again, 1.6, 0.01), 'an arena stash / restore does not apply them twice', String(r.again));
		A(r.spawnK === 1.8 && r.many > 0 && r.few === 0, 'Horde: the spawner multiplies the spawn rate by G.Modes.spawnK() (1.8)', JSON.stringify(r));
		A(r.heal === 40 && r.card === 60, 'No healing: a heal is undone, a max-HP card still adds its HP (40 -> 40, then +20 -> 60)', JSON.stringify(r));
		await E(() => { G.Game.togglePause(); });
		await sleep(1500);
		const reg = await E(() => G.Game.player.hp);
		A(reg <= 60, 'No healing: 50 HP/s of regeneration for 1.5 s adds nothing', String(reg));
		await shot('run_modifiers.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });   // (a phone-sized window; switching isMobile would reload the page)
		await sleep(900);
		await shot('run_modifiers_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(500);
		const c = await endRun(360);
		const o = await E(() => { const s = G.DB.save.stats; return { mn: [1, 2, 3, 4, 5, 6].map(k => s['mn' + k]), mb: G.Modes.MOD_IDS.map(id => s['mb_' + id]), coins: G.DB.save.coins, ach: G.DB.save.ach }; });
		A(JSON.stringify(o.mn) === '[6,6,6,6,6,6]' && JSON.stringify(o.mb) === '[6,6,6,6,6,6]', 'stats mn1..mn6 and mb_<mod> = 6 minutes (main.gd 850-854)', JSON.stringify(o));
		const ach = await bonus();
		A(o.ach.mod1 && o.ach.modAll && !o.ach.mod3 && !o.ach.mod4 && o.coins - c.coins - ach === Math.round(c.parts * 2.5 * c.coinMul), 'coins x2.5 (1 + 6 x 0.25); "With a twist" (5 min, 1) and "Masochist" (5 min, all 6) unlock at 6 minutes, "Double trouble" (8) and "Without a net" (10) do not', JSON.stringify([o.coins - c.coins, c.parts, Object.keys(o.ach).filter(k => /^mod/.test(k))]));
		await toMenu();
		await E(() => { G.Modes.prefs().mods = []; });
	}

	// ================= 10. the level-up card ban =================
	if (!ONLY.length || ONLY.includes('10')) {
		await E(() => { const s = G.DB.save; G.DB.upgradesOf(4).ban = 2; s.pban = s.pban || {}; s.pban[4] = []; s.stats.dens = 1; s.stats.dynamax = 1; G.DB.commit(); });
		A(await startMode('normal'), 'a run with the Veto upgrade at level 2');
		await E(() => {
			const pl = G.Game.player; pl.invuln = 1e9; pl.xpMul = 0;
			// (test side: keep re-dealing with the real offer until one card is a new move)
			const real = G.LevelUp.offer; window.__realOffer = real;
			G.LevelUp.offer = (p, n) => { let o; for (let i = 0; i < 200; i++) { o = real(p, n); if (o.some(c => c.type === 'new')) break; } return o; };
			G.Game.debugLevelUp();
		});
		A(await waitFor(() => visible('scr-levelup'), 5000), 'the level-up cards open');
		await sleep(500);
		const b0 = await E(() => ({ bans: G.Game.player.bansLeft, btn: document.getElementById('lvl-ban').innerText, shown: !document.getElementById('lvl-ban').classList.contains('hidden'), rr: G.Game.player.rerolls || 0 }));
		A(b0.bans === 2 && b0.shown && /^Ban \(2\)/.test(b0.btn), 'Veto level 2 = 2 bans this run; the "Ban (2) · B" button is shown', JSON.stringify(b0));
		await page.keyboard.press('b');
		await sleep(150);
		const m = await E(() => ({ on: G.RunUI.banMode, hint: !document.getElementById('lvl-banhint').classList.contains('hidden'), hintTxt: document.getElementById('lvl-banhint').innerText, reroll: document.getElementById('lvl-reroll').classList.contains('hidden'), btnOn: document.getElementById('lvl-ban').classList.contains('on') }));
		A(m.on && m.hint && m.hintTxt === 'Pick a new move to ban it' && m.reroll && m.btnOn, 'the B key turns ban mode on: "Pick a new move to ban it", the reroll button hides', JSON.stringify(m));
		await shot('levelup_ban.png');
		const sp = await spanishOn('#scr-levelup');
		A(sp.bad.length === 0, 'the level-up screen with the ban shows no Spanish in English mode', JSON.stringify(sp));
		// a stat / upgrade card cannot be banned
		const non = await E(() => { const cards = [...document.querySelectorAll('#cards .card')]; const i = cards.findIndex(c => c.classList.contains('no-ban')); if (i < 0) return null; cards[i].click(); return { i, still: G.UI.isOpen('scr-levelup'), bans: G.Game.player.bansLeft, on: G.RunUI.banMode }; });
		A(!non || (non.still && non.bans === 2 && non.on), 'tapping a card that is not a new move does nothing (only new moves can be banned)', JSON.stringify(non));
		const ban = await E(() => {
			const pl = G.Game.player, cards = [...document.querySelectorAll('#cards .card')];
			const i = cards.findIndex(c => !c.classList.contains('no-ban'));
			const title = cards[i].querySelector('.nm').childNodes[0].textContent.trim();
			const before = new Set(pl.banned);
			cards[i].click();
			const id = [...pl.banned].find(x => !before.has(x));
			let again = 0;
			for (let k = 0; k < 600; k++) if (window.__realOffer(pl).some(c => c.key === 'new:' + id)) again++;
			const now = [...document.querySelectorAll('#cards .card .nm')].map(n => n.textContent);
			return { id, title, bans: pl.bansLeft, rr: pl.rerolls || 0, open: G.UI.isOpen('scr-levelup'), mode: G.RunUI.banMode, again, n: now.length, btn: document.getElementById('lvl-ban').innerText, name: G.I18n.t(G.Moves.BY_ID[id].name) };
		});
		A(ban.id && ban.bans === 1 && ban.rr === b0.rr && ban.open && !ban.mode && ban.n === 3 && /^Ban \(1\)/.test(ban.btn), `tapping a new move bans it (${ban.name}): 1 ban left, no reroll spent, 3 fresh cards dealt`, JSON.stringify(ban));
		A(ban.again === 0, 'the banned move is never offered again in the run (600 offers)', JSON.stringify(ban));
		// the pad: the ban action, then confirm a new-move card
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2300);
		await press(15); await sleep(150);
		await press(2);   // X / Square / Y = ban
		const pm = await E(() => G.RunUI.banMode);
		A(pm, 'the pad\'s ban action (X / Square / Y by default) turns ban mode on');
		A(await navTo('#cards .card:not(.no-ban)'), 'the D-pad reaches a new-move card');
		await press(1);
		const pb = await E(() => ({ bans: G.Game.player.bansLeft, banned: G.Game.player.banned.size, hidden: document.getElementById('lvl-ban').classList.contains('hidden') }));
		A(pb.bans === 0 && pb.banned === 2 && pb.hidden, 'confirm bans it: 0 left, the Ban button hides', JSON.stringify(pb));
		await press(2);
		A(!(await E(() => G.RunUI.banMode)), 'with no bans left the ban action does nothing');
		await press(1);   // pick a card normally
		A(await waitFor(() => E(() => G.Game.state === 'playing' && !G.UI.isOpen('scr-levelup')), 3000), 'confirm then picks a card as usual');
		// in a run (no cards) the ban button fires Dynamax, as reroll fires the Z-move
		await E(() => { const pl = G.Game.player; pl.level = 25; G.Dynamax.reset(); G.ZMoves.reset(); });
		await sleep(200);
		await press(2);
		A(await waitFor(() => E(() => G.Dynamax.active), 1500), 'in a run (no cards open) the ban button fires Dynamax (main.gd: X = Dynamax unless the cards are open)', JSON.stringify(await E(() => ({ st: G.Game.state, can: G.Dynamax.can(G.Game.player), scope: G.Pad.topScope() && G.Pad.topScope().id, mode: G.Pad.mode, lv: G.Game.player.level, unl: G.Dynamax.unlocked() }))));
		const map = await E(() => ({ m: G.Pad.map(), d: [G.Pad.defaults('nintendo').ban, G.Pad.defaults('xbox').ban, G.Pad.defaults('playstation').ban], html: G.Pad.settingsHTML(), act: G.Pad.ACTIONS }));
		A(map.m.ban === 2 && JSON.stringify(map.d) === '[2,2,2]' && map.act.includes('ban') && /data-bind="ban"/.test(map.html), 'the pad action `ban` (default X / Square / Y on every layout) has a row in Settings > Controls', JSON.stringify(map.m));
		const mig = await E(() => {
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 3, zmove: 10, dynamax: 8 });
			const a = G.Pad.map();
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 2, zmove: 10, dynamax: 8 });
			const b = G.Pad.map();
			const sw = (() => { G.Pad.reset('nintendo'); G.Pad.setBtn('ban', 3); return G.Pad.map(); })();
			G.Pad.reset('nintendo');
			return { a, b, sw };
		});
		A(mig.a.ban === 2 && mig.a.dynamax === 8 && mig.b.reroll === 2 && mig.b.ban === 3, 'a map saved before batch 6 gains ban = X (or the first free button if X is taken)', JSON.stringify(mig));
		A(mig.sw.ban === 3 && mig.sw.reroll === 2, 'remap with swap-on-conflict: ban -> Y, reroll takes X', JSON.stringify(mig.sw));
		await E(() => { window.__pads[0] = null; G.Dynamax.reset(); G.LevelUp.offer = window.__realOffer; });
		await endRun();
		await toMenu();
		// Veto 0: no button, the B key does nothing
		await E(() => { G.DB.upgradesOf(4).ban = 0; });
		await startMode('normal');
		await E(() => { G.Game.player.invuln = 1e9; G.Game.debugLevelUp(); });
		await waitFor(() => visible('scr-levelup'), 5000);
		await sleep(450);
		await page.keyboard.press('b');
		await sleep(120);
		const z = await E(() => ({ bans: G.Game.player.bansLeft, hidden: document.getElementById('lvl-ban').classList.contains('hidden'), on: G.RunUI.banMode }));
		A(z.bans === 0 && z.hidden && !z.on, 'without the Veto upgrade: no Ban button and B does nothing', JSON.stringify(z));
		await E(() => document.querySelector('#cards .card').click());
		await endRun();
		await toMenu();
	}

	// ================= 11. persistence: account push, 409 merge, merge() =================
	if (!ONLY.length || ONLY.includes('11')) {
		await E(() => G.DB.commit(true));
		A(await waitFor(() => ROW.save && ROW.save.daily && ROW.save.stats.riftsBest === 2 && ROW.save.typeDone && ROW.save.typeDone.water && ROW.save.stats.dailyPlays === 2, 8000), 'the records reach the account row (daily, riftsBest, typeDone, dailyPlays)', JSON.stringify(ROW.save && { d: ROW.save.daily, r: ROW.save.stats.riftsBest }));
		// another device, newer, never played any mode: the 409 merge keeps ours
		const other = JSON.parse(JSON.stringify(ROW.save));
		delete other.daily; delete other.typeDone; other.modes = { mods: ['hard'], type: 'ghost', party: 25 };
		for (const k of Object.keys(other.stats)) if (/^(daily|rifts|type|mn\d|mb_)/.test(k)) delete other.stats[k];
		other.updated = Date.now() + 5000;
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => { const s = G.DB.save; return { daily: s.daily, typeDone: Object.keys(s.typeDone || {}), rb: s.stats.riftsBest, dp: s.stats.dailyPlays, mn6: s.stats.mn6, modes: s.modes }; });
		const today = await E(() => G.Modes.dailySeed());
		A(ROW.rev > rev0 && m.daily && m.daily.date === today && m.daily.best === 200 && m.typeDone.includes('water') && m.rb === 2 && m.dp === 2 && m.mn6 === 6 && ROW.save.stats.riftsBest === 2,
			'a 409 from a newer save without the records merges them back (max per stat, the daily, typeDone)', JSON.stringify(m));
		A(m.modes && m.modes.type === 'ghost' && JSON.stringify(m.modes.mods) === '["hard"]', 'the menu choices (modifiers, type) follow the newer save', JSON.stringify(m.modes));
		const u = await E(() => {
			const base = () => JSON.parse(JSON.stringify(G.DB.save));
			const a = base(), b = base();
			a.updated = 2000; b.updated = 1000;
			a.daily = { date: 20261017, best: 100 }; b.daily = { date: 20261017, best: 300 };
			a.typeDone = { fire: 1 }; b.typeDone = { ice: 1 };
			a.stats.riftsBest = 1; b.stats.riftsBest = 5; a.stats.dailyPlays = 9; b.stats.dailyPlays = 3;
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			const c = base(), d = base(); c.updated = 1000; d.updated = 2000;
			c.daily = { date: 20261018, best: 50 }; d.daily = { date: 20261017, best: 900 };
			const r3 = G.DB.merge(c, d), r4 = G.DB.merge(d, c);
			const bad = base(); bad.daily = { date: 'x', best: -3 }; bad.typeDone = { nope: 1, fire: 'a' }; bad.modes = { mods: ['fast', 'zzz', 'fast'], type: 'cheese', party: 99999 };
			const fixed = G.DB.merge(bad, null);
			G.DB.sanitize ? G.DB.sanitize(fixed) : G.Modes.sanitize(fixed);
			return { r1: [r1.daily, Object.keys(r1.typeDone).sort(), r1.stats.riftsBest, r1.stats.dailyPlays], r2: [r2.daily, Object.keys(r2.typeDone).sort(), r2.stats.riftsBest, r2.stats.dailyPlays], r3: r3.daily, r4: r4.daily,
				fixed: { daily: fixed.daily, typeDone: fixed.typeDone, modes: fixed.modes } };
		});
		A(JSON.stringify(u.r1) === JSON.stringify(u.r2) && JSON.stringify(u.r1) === '[{"date":20261017,"best":300},["fire","ice"],5,9]', 'merge() both ways: same day = the best (300), types beaten = union, max per stat', JSON.stringify(u));
		A(JSON.stringify(u.r3) === '{"date":20261018,"best":50}' && JSON.stringify(u.r4) === '{"date":20261018,"best":50}', 'merge() both ways: a newer date wins over an older day\'s better time (keyed by date)', JSON.stringify([u.r3, u.r4]));
		A(!u.fixed.daily && JSON.stringify(u.fixed.typeDone) === '{"fire":1}' && JSON.stringify(u.fixed.modes) === '{"mods":["fast"],"type":"fire","party":25}', 'a hand-edited save is cleaned (bad daily dropped, unknown types / modifiers removed, party back to Pikachu)', JSON.stringify(u.fixed));
	}

	// ================= 12. the mode achievements are on the missions screen =================
	if (!ONLY.length || ONLY.includes('12')) {
		await E(() => document.querySelector('#scr-menu [data-go=goals]').click());
		await waitFor(() => visible('scr-goals'), 5000);
		const ok = await E(() => {
			const tab = [...document.querySelectorAll('#goals-tabs [data-tab]')].find(t => /ach/.test(t.dataset.tab)); if (tab) tab.click();
			return true;
		});
		await sleep(300);
		const chip = await E(() => { const c = [...document.querySelectorAll('#scr-goals .chip')].find(b => /Game modes/.test(b.innerText)); if (c) c.click(); return !!c; });
		await sleep(300);
		const txt = await E(() => document.getElementById('scr-goals').innerText);
		A(ok && chip && /Today's challenge/.test(txt) && /Masochist/.test(txt) && /Rift corridor/.test(txt), 'Missions > Achievements has a "Game modes" category with the mode achievements (English)', txt.slice(0, 300));
		await shot('goals_modes.png');
		await E(() => document.querySelector('#scr-goals [data-back]') && document.querySelector('#scr-goals [data-back]').click());
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
