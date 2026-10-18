// micasurvivor_progress_test.mjs — MicaSurvivor M5 batch 11: the rest of the achievements, missions and titles, the run
// damage breakdown, the trainer card (the encyclopedia has its own test, micasurvivor_encyclopedia_test.mjs), from the Godot
// Android port by JayElDragon (poke-survivor: progress.gd 9-151 / 291-334 / 447-639, main.gd 351-355 / 758-858 / 2481 /
// 4484-4492 / 5168, menu.gd 1801-1890 / 3503-3740 / 3772-3826, save_data.gd 84-86 / 588), driven headlessly while logged in
// to a stubbed Magepunk account (the row micasurvivor:<user> with the server's compare-and-set):
//   - data: the port's full achievement list (its 82 + 54 per-type + one per legendary) — the 58 we lacked (boss10 / 250 /
//     500 / 1000 and the 54 "Por tipo" ones) with the port's goals, tiers, rewards and titles, the "Por tipo" category in
//     its place, all 17 daily and 13 weekly missions in the port's order with its goals / rewards, English for every new
//     string, rewards only coins / tickets / titles
//   - every new achievement fires from the real stat (a real kill through G.Progress.kill: by type, both types of a
//     dual-type Pokémon, bosses), never one short of the goal, and pays exactly its reward
//   - missions: the port's rotation (3 daily / 2 weekly, FNV-1a + mulberry32 seeded by period + account, _pick_set order;
//     the reroll avoids today's), and each new mission counts only its own mode (a real run of each mode, ended by the game)
//   - titles: the full list (Missions → Titles), equip / unequip by mouse, touch and pad, shown on the profile, the
//     menu and the trainer card, kept in the account row, after a reload, and merged on a 409 (the later choice wins;
//     the max of each stat)
//   - damage attribution: a controlled run where known hits from 2 moves, an item (Rocky Helmet), a Z-move, Dynamax and a
//     burn sum to what the enemies really lost, kills go to the finishing source, and the run-over table's percentages
//     add up to 100
//   - the trainer card: its contents against the save (name, title, 9 cells, the mode records), by mouse / touch / pad
//   - no Spanish on the English screens (missions, every achievement category, titles, profile, trainer card, run over)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): achievements (Por tipo / Combate), missions, titles, the damage breakdown at the
// end of a run and the trainer card at 1280x720 and 844x390.
// Covers micasurvivor/js/data/achievements.js, js/data/missions.js, js/systems/progress.js, js/systems/dmglog.js,
// js/systems/combat.js, js/entities/enemy.js, js/systems/zmoves.js, js/systems/dynamax.js, js/systems/status.js,
// js/net/coop.js, js/game.js, js/core/db.js, js/ui/goals-ui.js, js/ui/run-ui.js, js/ui/menu.js, js/data/lang-en.js,
// css/style.css, index.html.
//   node overworld/tests/micasurvivor_progress_test.mjs
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
const PORT = 9571;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);   // debugging: ONLY=3,7 runs those sections
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// ---- the port's lists (progress.gd), copied here so the test checks the game against the port, not against itself ----
const PORT_TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const PORT_NEW = [   // progress.gd 72-76 / 83-88: id, cat, tier, goal, reward, title
	['boss10', 'combate', 1, 10, { t1: 3 }, ''],
	['boss250', 'combate', 3, 250, { t10: 3 }, ''],
	['boss500', 'combate', 3, 500, { t10: 5 }, 'Verdugo de jefes'],
	['boss1000', 'combate', 3, 1000, { t10: 10 }, 'Rey de los jefes'],
	...PORT_TYPES.flatMap(t => [
		['tk250_' + t, 'tipos', 1, 250, { coins: 300, t1: 2 }, ''],
		['tk1000_' + t, 'tipos', 2, 1000, { coins: 1000, t1: 3, t10: 1 }, ''],
		['tk5000_' + t, 'tipos', 3, 5000, { coins: 3000, t10: 3 }, ''],
	]),
];
const PORT_DAILY = [   // progress.gd 301-319: id, goals, reward
	['kill', [300, 500, 800], { t1: 2, coins: 150 }], ['killType', [30, 50, 80], { t1: 2, coins: 200 }], ['survive', [5, 7, 9], { t1: 3, coins: 200 }],
	['level', [8, 12, 15], { t1: 2, coins: 200 }], ['boss', [1, 2], { t1: 3, coins: 250 }], ['chest', [1, 2], { t1: 2, coins: 200 }],
	['coins', [100, 200, 300], { t1: 2, coins: 150 }], ['playType', [3], { t1: 3, coins: 200 }], ['item', [1], { t1: 2, coins: 150 }],
	['evolve', [1], { t1: 3, coins: 250 }], ['mDaily', [1], { t1: 3, coins: 250 }], ['mRush', [2, 4], { t1: 3, coins: 300 }],
	['mMods', [4, 6], { t1: 3, coins: 300 }], ['mType', [4, 6], { t1: 3, coins: 300 }], ['mTeam', [5, 8], { t1: 3, coins: 300 }],
	['mTower', [2, 3], { t1: 3, coins: 350 }], ['mRifts', [2, 3], { t1: 3, coins: 350 }],
];
const PORT_WEEKLY = [   // progress.gd 320-334
	['wkill', [4000, 6000], { t10: 1, coins: 800 }], ['wrift', [1, 2], { t10: 1, coins: 1000 }], ['wboss', [4, 6], { t10: 1, coins: 900 }],
	['wsurvive', [12, 15], { t10: 1, coins: 1000 }], ['wevolve', [3, 5], { t10: 1, coins: 900 }], ['wdaily', [8, 12], { t10: 1, coins: 800 }],
	['wDailyCh', [3, 5], { t1: 3, t10: 1, coins: 1000 }], ['wRush', [6, 9], { t1: 3, t10: 1, coins: 1100 }], ['wType', [8, 12], { t1: 3, t10: 1, coins: 1100 }],
	['wTeam', [10, 15], { t1: 3, t10: 1, coins: 1200 }], ['wTower', [6, 9], { t1: 4, t10: 1, coins: 1300 }], ['wRifts', [5, 7], { t1: 4, t10: 1, coins: 1300 }],
	['wMods', [6, 8], { t1: 3, t10: 1, coins: 1200 }],
];
const NEW_MISSIONS = ['mDaily', 'mMods', 'mType', 'mRifts', 'wDailyCh', 'wType', 'wRifts', 'wMods'];
// the port's rotation (progress.gd _rng_state / _rand / _make / _pick_set), reimplemented for the check
function portRng(seed) {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) { h = (h ^ seed.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
	return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0; t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function portPick(defs, n, r, avoid = []) {
	const pool = defs.filter(d => !avoid.includes(d[0])), out = [];
	while (out.length < n && pool.length) {
		const d = pool.splice(Math.floor(r() * pool.length), 1)[0];
		const goal = d[1][Math.floor(r() * d[1].length)];
		const param = d[0] === 'killType' || d[0] === 'playType' ? PORT_TYPES[Math.floor(r() * PORT_TYPES.length)] : null;
		out.push({ id: d[0], goal, param });
	}
	return out;
}

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
	localStorage.setItem('magepunk_mp_token_v1', 'progress-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'progresstester' }));
};

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|y|jefes|tipo|misiones?|logros?|derrota|aguanta|juega|gana|grietas?|título|usar|bloqueado|partidas|cofres|tiempo|jugado|daño|movimiento|derrotados|otros|objetos|habilidades|estados|compañero|equipo|récords?|piso|reliquias|sin|tarjeta|entrenador)\b/i;

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
	const shot = async (name) => { await E(() => { document.querySelectorAll('#ach-pop, .toast').forEach(e => { e.style.display = 'none'; }); }); await sleep(250); if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const press = async (b) => { await E(b => __btn(b, true), b); await sleep(90); await E(b => __btn(b, false), b); await sleep(110); };
	const navTo = async (sel) => {
		for (let i = 0; i < 90; i++) {
			const d = await E(sel => {
				const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
				if (!f || !t) return 'missing';
				if (f === t || f.contains(t) || t.contains(f)) return 'here';
				const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
				const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
				return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 13 : 12) : (dx > 0 ? 15 : 14);
			}, sel);
			if (d === 'here') return true;
			if (d === 'missing') { if (process.env.DEBUG) console.log('navTo missing', sel, await E(() => { const f = document.querySelector('.pad-focus'); return f ? f.outerHTML.slice(0, 120) : 'no focus'; })); return false; }
			await press(d);
		}
		return false;
	};
	const spanishOn = sel => E((sel, src) => {
		const el = document.querySelector(sel);
		if (!el) return { txt: '', bad: ['missing ' + sel] };
		let txt = el.innerText.replace(/Pok[ée]mon/g, 'Pokemon').replace(/Pok[ée]dollars?|Pok[ée]monedas/g, '');
		for (const p of G.DEX) if (/[^\x00-\x7f]/.test(p.name) && txt.includes(p.name)) txt = txt.split(p.name).join('#');
		const re = new RegExp(src, 'gi');
		return { txt: txt.slice(0, 800), bad: txt.match(re) || [] };
	}, sel, SPANISH.source);
	const tapEl = async (sel) => { const b = await E(sel => { const el = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (b) { await sleep(80); await page.touchscreen.tap(b.x, b.y); } return !!b; };
	const touchOn = on => cdp.send('Emulation.setTouchEmulationEnabled', { enabled: on, maxTouchPoints: 5 });
	const view = (w, h) => page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
	const toMenu = () => E(() => { G.UI.hideAll(); document.getElementById('scr-tcard').classList.add('hidden'); G.MenuUI.open(); });
	const padOn = async () => { await E(() => { window.__pads[0] = window.__mkPad(0, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'); }); await sleep(250); await press(13); };
	const padOff = async () => { await E(() => { window.__pads[0] = null; }); await sleep(200); };
	const boot = async () => {
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.DmgLog && !!G.TrainerCard), 30000);
		await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
		return ok;
	};

	// ---------- boot (logged in) -> personality test -> menu
	A(await boot(), 'boots logged in (Magepunk account); G.DmgLog + G.TrainerCard loaded', errors.slice(0, 3).join(' | '));
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await E(() => { const s = G.DB.save; s.owned = { 4: { at: 1000, from: 'starter' }, 1: { at: 2000, from: 'gacha' }, 7: { at: 3000, from: 'gacha' } }; s.partner = 4; s.modes = {}; G.DB.commit(true); });

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const L = G.AchDefs.LIST, D = G.MissionDefs;
			const strings = [];
			for (const a of L.filter(a => a.cat === 'tipos' || /^boss(10|250|500|1000)$/.test(a.id))) strings.push(a.name, a.desc, a.title || '');
			strings.push('Por tipo');
			for (const id of ['mDaily', 'mMods', 'mType', 'mRifts', 'wDailyCh', 'wType', 'wRifts', 'wMods']) for (const g of D.BY[id].goals) strings.push(G.Progress.text({ id, goal: g, param: null }));
			return {
				ach: L.map(a => ({ id: a.id, cat: a.cat, tier: a.tier, goal: a.goal, reward: a.reward, title: a.title || '', dex: a.dex || 0, name: a.name, desc: a.desc })),
				cats: G.AchDefs.CATS.map(c => c[0]), catTipos: (G.AchDefs.CATS.find(c => c[0] === 'tipos') || [])[1],
				legs: G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]).length,
				daily: D.daily.map(d => [d.id, d.goals, d.reward]), weekly: D.weekly.map(d => [d.id, d.goals, d.reward]),
				en: strings.filter(Boolean).map(s => [s, G.I18n.t(s)]),
				scripts: ['js/systems/dmglog.js', 'js/ui/lexicon-ui.js'].map(s => !!document.querySelector(`script[src="${s}"]`)),
			};
		});
		const by = Object.fromEntries(r.ach.map(a => [a.id, a]));
		const miss = PORT_NEW.filter(([id, cat, tier, goal, reward, title]) => { const a = by[id]; return !a || a.cat !== cat || a.tier !== tier || a.goal !== goal || JSON.stringify(a.reward) !== JSON.stringify(reward) || a.title !== title; });
		A(miss.length === 0, `the ${PORT_NEW.length} achievements we lacked, with the port's category, tier, goal, reward and title (progress.gd 72-76 / 83-88)`, JSON.stringify(miss.slice(0, 3).map(m => [m, by[m[0]]])));
		const statics = r.ach.filter(a => !a.dex && a.cat !== 'tipos').length;
		A(statics === 82 && r.ach.filter(a => a.cat === 'tipos').length === 54 && r.ach.filter(a => a.dex).length === r.legs && r.ach.length === 82 + 54 + r.legs,
			`the port's full list: 82 + 54 per type + one per legendary (${r.legs}) = ${82 + 54 + r.legs}`, JSON.stringify({ statics, total: r.ach.length }));
		const order = r.ach.filter(a => a.cat === 'combate').map(a => a.id);
		A(JSON.stringify(order.filter(id => /^boss/.test(id))) === '["boss1","boss25","boss10","boss100","boss250","boss500","boss1000"]', 'the boss achievements in the port\'s order (boss1, 25, 10, 100, 250, 500, 1000)', JSON.stringify(order));
		const tk = r.ach.filter(a => a.cat === 'tipos');
		A(JSON.stringify(tk.map(a => a.id)) === JSON.stringify(PORT_TYPES.flatMap(t => ['tk250_' + t, 'tk1000_' + t, 'tk5000_' + t])) && tk[0].name === 'Rastreador de tipo Normal' && tk[4].desc === 'Derrota a 1.000 Pokémon de tipo Fuego.' && tk[53].name === 'Maestro de tipo Hada',
			'the 54 per-type ones in the port\'s type order, with its names ("Rastreador / Cazador / Maestro de tipo X") and texts', JSON.stringify(tk.slice(0, 5).map(a => [a.id, a.name, a.desc])));
		A(JSON.stringify(r.cats) === '["coleccion","supervivencia","combate","tipos","grietas","legendarios","modos","otros"]' && r.catTipos === 'Por tipo', 'the "Por tipo" category in the port\'s place (after Combat; progress.gd 9-10)', JSON.stringify(r.cats));
		A(r.ach.every(a => Object.keys(a.reward).every(k => ['coins', 't1', 't10'].includes(k))), 'every reward is earned in play: coins and gacha tickets only (titles come with the achievement)');
		A(JSON.stringify(r.daily) === JSON.stringify(PORT_DAILY), `all ${PORT_DAILY.length} daily missions in the port's order with its goals and rewards (progress.gd 301-319)`, JSON.stringify(r.daily.map(d => d[0])));
		A(JSON.stringify(r.weekly) === JSON.stringify(PORT_WEEKLY), `all ${PORT_WEEKLY.length} weekly missions in the port's order with its goals and rewards (progress.gd 320-334)`, JSON.stringify(r.weekly.map(d => d[0])));
		const bad = r.en.filter(([es, en]) => es === en || SPANISH.test(en.replace(/Pok[ée]mon/g, '')));
		A(bad.length === 0, `every new achievement / mission string has English (${r.en.length} checked; lang_en.json wording)`, JSON.stringify(bad.slice(0, 5)));
		const en = Object.fromEntries(r.en);
		A(en['Rastreador de tipo Fuego'] === 'Fire-type tracker' && en['Derrota a 1.000 Pokémon de tipo Hada.'] === 'Defeat 1,000 Fairy-type Pokémon.' && en['Rey de los jefes'] === 'King of bosses' && en['Juega el Desafío diario'] === 'Play the Daily Challenge' && en['Aguanta 6 minutos con 3 o más modificadores'] === 'Survive 6 minutes with 3 or more modifiers',
			'English as the port\'s lang_en.json ("Fire-type tracker", "Defeat 1,000 Fairy-type Pokémon.", "King of bosses", "Play the Daily Challenge")', JSON.stringify([en['Rastreador de tipo Fuego'], en['Derrota a 1.000 Pokémon de tipo Hada.']]));
		A(r.scripts.every(Boolean), 'index.html loads js/systems/dmglog.js and js/ui/lexicon-ui.js');
	}

	// ================= 2. every new achievement fires from the real stat, then pays its reward =================
	if (!ONLY.length || ONLY.includes('2')) {
		const r = await E((NEW) => {
			const s = G.DB.save, out = [];
			const all = G.AchDefs.LIST.map(a => a.id);
			const wallet = () => ({ coins: s.coins, t1: s.tickets.t1, t10: s.tickets.t10 });
			const kill = (types, boss) => G.Progress.kill({ types, boss, legend: false, dex: 19 });
			for (const [id, , , goal, reward] of NEW) {
				// only this one is still to get (so nothing else pays meanwhile)
				s.ach = {}; for (const k of all) if (k !== id) s.ach[k] = 1;
				s.zmis = {}; for (const zm of G.ZMoves.ZMIS) s.zmis[zm.id] = 1;   // (the Z-crystal missions pay too: all done already)
				const tk = id.startsWith('tk') ? id.split('_')[1] : null;
				const stat = tk ? 'tk_' + tk : 'bossesTotal';
				s.stats[stat] = goal - 2;
				// one short: a real kill (a dual type for the per-type ones: it counts for both), not yet
				if (tk) kill([tk, tk === 'fire' ? 'water' : 'fire'], false); else kill(['normal'], true);
				G.Progress.checkAch();
				const early = !!s.ach[id], v1 = s.stats[stat];
				const w0 = wallet();
				if (tk) kill([tk], false); else kill(['normal'], true);
				G.Progress.checkAch();
				const w1 = wallet();
				out.push({ id, early, v1, v2: s.stats[stat], got: !!s.ach[id], paid: { coins: w1.coins - w0.coins, t1: w1.t1 - w0.t1, t10: w1.t10 - w0.t10 },
					want: { coins: reward.coins || 0, t1: reward.t1 || 0, t10: reward.t10 || 0 } });
			}
			s.ach = {};
			return out;
		}, PORT_NEW);
		const bad = r.filter(x => x.early || !x.got || x.v2 !== x.v1 + 1 || JSON.stringify(x.paid) !== JSON.stringify(x.want));
		A(r.length === 58 && bad.length === 0, 'all 58: one short of the goal (after a real kill) nothing; the next real kill (G.Progress.kill: a boss, or a Pokémon of that type) unlocks it and pays exactly the port\'s reward', JSON.stringify(bad.slice(0, 3)));
		const dual = await E(() => { const s = G.DB.save; s.stats.tk_fire = 10; s.stats.tk_flying = 20; G.Progress.kill({ types: ['fire', 'flying'], boss: false, legend: false, dex: 6 }); return [s.stats.tk_fire, s.stats.tk_flying]; });
		A(dual[0] === 11 && dual[1] === 21, 'a dual-type Pokémon counts for both types (progress.gd 83: "los de doble tipo cuentan para los dos")', JSON.stringify(dual));
		const judg = await E(() => { const s = G.DB.save; const b = s.stats.bossesTotal; const d = Object.getOwnPropertyDescriptor(G.Judgment, 'active'); Object.defineProperty(G.Judgment, 'active', { configurable: true, get: () => true }); const bd = G.Judgment.bossDown; G.Judgment.bossDown = () => {}; try { G.Progress.kill({ types: ['normal'], boss: true, legend: true, dex: 150 }); } finally { Object.defineProperty(G.Judgment, 'active', d); G.Judgment.bossDown = bd; } return s.stats.bossesTotal - b; });
		A(judg === 0, 'Arceus\'s Judgment legendaries don\'t count as bosses for the boss achievements (as before)', String(judg));
		// the title of boss500 / boss1000 becomes available
		const t = await E(() => { const s = G.DB.save; s.ach = { boss500: Date.now() }; return G.Progress.titles(); });
		A(JSON.stringify(t) === '["Verdugo de jefes"]', 'the boss500 title ("Verdugo de jefes") is yours once the achievement is', JSON.stringify(t));
		// toast and English on the achievements screen: the "Por tipo" category
		await E(() => { const s = G.DB.save; s.ach = {}; for (const k of Object.keys(s.stats)) if (k.startsWith('tk_')) s.stats[k] = 0; s.stats.tk_fire = 260; s.stats.bossesTotal = 12; G.Progress.checkAch(); G.GoalsUI.open('ach'); });
		await sleep(300);
		await E(() => { const c = [...document.querySelectorAll('#goals-body .chip')].find(b => /By type|Por tipo/.test(b.textContent)); c.click(); });
		await sleep(250);
		const ui = await E(() => ({ chip: [...document.querySelectorAll('#goals-body .chip')].map(b => b.textContent), cards: document.querySelectorAll('#goals-body .ach').length, ok: document.querySelectorAll('#goals-body .ach.ok').length,
			first: document.querySelector('#goals-body .ach') && document.querySelector('#goals-body .ach').innerText }));
		A(ui.chip.some(c => /^By type 1\/54$/.test(c)) && ui.cards === 54 && ui.ok === 1 && /Fire-type tracker/.test(ui.cards ? (await E(() => document.getElementById('goals-body').innerText)) : ''),
			'Missions → Achievements → "By type 1/54": the 54 cards, Fire-type tracker unlocked', JSON.stringify(ui));
		const sp = await spanishOn('#scr-goals .box');
		A(sp.bad.length === 0, 'no Spanish on the "By type" achievements (English)', JSON.stringify(sp.bad.slice(0, 6)) + ' ' + sp.txt.slice(0, 200));
		for (const cat of ['coleccion', 'supervivencia', 'combate', 'grietas', 'legendarios', 'modos', 'otros']) {
			await E(c => { const i = G.AchDefs.CATS.findIndex(x => x[0] === c); document.querySelectorAll('#goals-body .chip')[i].click(); }, cat);
			await sleep(120);
			const s2 = await spanishOn('#scr-goals .box');
			A(s2.bad.length === 0, `no Spanish on the "${cat}" achievements`, JSON.stringify(s2.bad.slice(0, 6)) + ' ' + s2.txt.slice(0, 200));
		}
		await E(() => { const i = G.AchDefs.CATS.findIndex(x => x[0] === 'combate'); document.querySelectorAll('#goals-body .chip')[i].click(); });
		await sleep(200);
		const cb = await E(() => document.getElementById('goals-body').innerText);
		A(/Boss hunter apprentice/.test(cb) && /King of bosses/.test(cb) && /Title: Boss executioner/.test(cb) && /Defeat 1,000 bosses\./.test(cb), 'Combat lists the four new boss achievements with their titles (Boss executioner, King of bosses)', cb.slice(0, 300));
		if (SHOTS) {
			await shot('m5b11_desktop_ach_combat.png');
			await E(() => { const c = [...document.querySelectorAll('#goals-body .chip')].find(b => /By type/.test(b.textContent)); c.click(); });
			await sleep(250); await shot('m5b11_desktop_ach_bytype.png');
		}
		await toMenu();
	}

	// ================= 3. missions: the port's rotation =================
	if (!ONLY.length || ONLY.includes('3')) {
		const r = await E(() => {
			const out = [], s = G.DB.save, P = G.Ranking.periodIds;
			const dates = [new Date(2026, 9, 18, 12), new Date(2026, 9, 19, 12), new Date(2026, 11, 31, 23), new Date(2027, 2, 1, 9), new Date(2027, 6, 4, 18)];
			for (const created of [1700000000000, 1765432109876]) {
				for (const dt of dates) {
					s.created = created; s.missions = {};
					G.Ranking.periodIds = () => P(dt);
					try { G.Progress.ensure(s); } finally { G.Ranking.periodIds = P; }
					const ids = P(dt);
					out.push({ key: ids.d + String(created), wkey: ids.w + String(created), daily: s.missions.daily.map(m => ({ id: m.id, goal: m.goal, param: m.param })), weekly: s.missions.weekly.map(m => ({ id: m.id, goal: m.goal, param: m.param })) });
				}
			}
			return out;
		});
		let okN = 0; const bad = [];
		for (const x of r) {
			const wd = portPick(PORT_DAILY, 3, portRng(x.key)), ww = portPick(PORT_WEEKLY, 2, portRng(x.wkey));
			if (JSON.stringify(wd) === JSON.stringify(x.daily) && JSON.stringify(ww) === JSON.stringify(x.weekly)) okN++; else bad.push({ x, wd, ww });
		}
		A(okN === r.length && r.every(x => x.daily.length === 3 && x.weekly.length === 2 && new Set(x.daily.map(m => m.id)).size === 3),
			`the port's rotation: 3 daily + 2 weekly, seeded by period + account (FNV-1a + mulberry32), picked in the port's list order (_pick_set / _make) — ${r.length} days / accounts match a reimplementation of progress.gd`, JSON.stringify(bad.slice(0, 1)));
		const seen = new Set(); for (const x of r) for (const m of [...x.daily, ...x.weekly]) seen.add(m.id);
		const rr = await E(() => {
			const s = G.DB.save; s.missions = {}; G.Progress.ensure(s);
			const before = s.missions.daily.map(m => m.id);
			const ok = G.Progress.reroll(1), after = s.missions.daily.map(m => m.id), again = G.Progress.reroll(0);
			return { before, after, ok, again, rerolled: s.missions.rerolled };
		});
		A(rr.ok && !rr.again && rr.rerolled && rr.after[0] === rr.before[0] && rr.after[2] === rr.before[2] && !rr.before.includes(rr.after[1]), 'one reroll a day, for a mission not already in today\'s list (progress.gd reroll)', JSON.stringify(rr));
		// over many days every mission comes up, including the 8 new ones
		const many = await E(() => {
			const s = G.DB.save, P = G.Ranking.periodIds, ids = new Set();
			for (let i = 0; i < 400; i++) {
				const dt = new Date(2026, 0, 1 + i, 12); s.missions = {};
				G.Ranking.periodIds = () => P(dt);
				try { G.Progress.ensure(s); } finally { G.Ranking.periodIds = P; }
				for (const m of [...s.missions.daily, ...s.missions.weekly]) ids.add(m.id);
			}
			return [...ids];
		});
		A(NEW_MISSIONS.every(id => many.includes(id)) && many.length === 30, 'over 400 days all 30 missions come up, the 8 new ones included', JSON.stringify(many.filter(id => NEW_MISSIONS.includes(id))));
	}

	// ================= 4. each new mission counts only its own mode =================
	if (!ONLY.length || ONLY.includes('4')) {
		// the event data of every mode, as game.js sends it (progress.gd _advance "req": mode equality, mods1 / mods3)
		const r = await E((NEW) => {
			const s = G.DB.save, out = {};
			const runs = [
				['normal', 0], ['normal', 1], ['normal', 3], ['daily', 0], ['rush', 0], ['rush', 2], ['tower', 0], ['rifts', 0], ['rifts', 1], ['type', 0], ['type', 3], ['team', 0],
			];
			for (const id of NEW) {
				const weekly = id.startsWith('w');
				out[id] = [];
				for (const [mode, nmods] of runs) {
					s.missions = { day: G.Ranking.periodIds().d, week: G.Ranking.periodIds().w, rerolled: false, daily: [], weekly: [] };
					s.missions[weekly ? 'weekly' : 'daily'] = [{ id, goal: 99, param: null, prog: 0, claimed: false, told: false }];
					G.Progress.event('runEnd', { time: 9 * 60 + 10, level: 10, coins: 50, types: ['fire'], group: false, mode, nmods, bosses: 7, floor: 4, rifts: 6 });
					out[id].push([mode, nmods, s.missions[weekly ? 'weekly' : 'daily'][0].prog]);
				}
			}
			return out;
		}, NEW_MISSIONS);
		const want = {   // the progress each run gives (9 min, 7 bosses, floor 4, 6 rifts), or 0
			mDaily: m => (m[0] === 'daily' ? 1 : 0), wDailyCh: m => (m[0] === 'daily' ? 1 : 0),
			mMods: m => (m[1] >= 1 ? 9 : 0), wMods: m => (m[1] >= 3 ? 9 : 0),
			mType: m => (m[0] === 'type' ? 9 : 0), wType: m => (m[0] === 'type' ? 9 : 0),
			mRifts: m => (m[0] === 'rifts' ? 6 : 0), wRifts: m => (m[0] === 'rifts' ? 6 : 0),
		};
		for (const id of NEW_MISSIONS) {
			const wrong = r[id].filter(m => m[2] !== want[id](m));
			A(wrong.length === 0, `${id} counts only its own runs (${id.includes('Mods') ? 'modifiers ≥ ' + (id === 'wMods' ? 3 : 1) : 'mode ' + id.replace(/^[mw]/, '').replace('DailyCh', 'Daily').toLowerCase()}) and the port's value`, JSON.stringify(r[id]));
		}
		// end to end: real runs of each mode, ended by the game (game.js endRun -> runEnd with mode / nmods / rifts)
		const runMode = async (mode, prep, t) => {
			await E(([mode, NEW]) => {
				const s = G.DB.save;
				s.modes = mode === 'normal3' ? { mods: ['fast', 'tank', 'hard'] } : { team: [4, 1, 7], type: 'water' };
				s.missions = { day: G.Ranking.periodIds().d, week: G.Ranking.periodIds().w, rerolled: false,
					daily: NEW.filter(id => id[0] === 'm').map(id => ({ id, goal: 99, param: null, prog: 0, claimed: false, told: false })),
					weekly: NEW.filter(id => id[0] === 'w').map(id => ({ id, goal: 99, param: null, prog: 0, claimed: false, told: false })) };
				G.Game.startRun(null, mode === 'normal3' ? 'normal' : mode);
				const pl = G.Game.player; pl.invuln = 1e9; G.EnemyMgr.clear(); G.Spawner.update = () => {}; G.Events.update = () => {};
			}, [mode, NEW_MISSIONS]);
			await sleep(200);
			return E(([prep, t]) => {
				if (prep === 'rifts') { G.Modes.riftWon(); G.Modes.riftWon(); G.Modes.riftWon(); }
				if (G.Game.state === 'playing') { G.Game.togglePause(); G.UI.hide('scr-pause'); }
				G.Game.debugTime(t);
				G.Game.quit();
				const s = G.DB.save, o = {};
				for (const m of [...s.missions.daily, ...s.missions.weekly]) o[m.id] = m.prog;
				return { o, mode: G.Game.mode };
			}, [prep, t]);
		};
		const res = {};
		for (const [m, prep, t] of [['daily', '', 130], ['rifts', 'rifts', 200], ['type', '', 380], ['normal3', '', 430], ['normal', '', 400]]) {
			res[m] = (await runMode(m, prep, t)).o;
			await E(() => { G.UI.hideAll(); G.MenuUI.open(); });
			await sleep(150);
		}
		A(res.daily.mDaily === 1 && res.daily.wDailyCh === 1 && res.daily.mMods === 0 && res.daily.mRifts === 0 && res.daily.mType === 0, 'a real Daily Challenge run: Play the Daily Challenge done, Play N Daily Challenges +1, nothing else (the Daily\'s rule doesn\'t count as a modifier)', JSON.stringify(res.daily));
		A(res.rifts.mRifts === 3 && res.rifts.wRifts === 3 && res.rifts.mDaily === 0 && res.rifts.mType === 0, 'a real Rift Time Attack with 3 rifts won: the rift missions at 3 (game.js now sends rifts; progress.gd "val": "rifts")', JSON.stringify(res.rifts));
		A(res.type.mType === 6 && res.type.wType === 6 && res.type.mRifts === 0 && res.type.mMods === 0, 'a real Survival by Type run of 6:20: the type missions at 6 minutes', JSON.stringify(res.type));
		A(res.normal3.mMods === 7 && res.normal3.wMods === 7 && res.normal3.mType === 0 && res.normal.mMods === 0 && res.normal.wMods === 0, 'a real run with 3 modifiers (7:10) counts for both modifier missions; one without modifiers for neither', JSON.stringify([res.normal3, res.normal]));
		// claiming pays the port's reward and counts as a mission done
		const cl = await E(() => {
			const s = G.DB.save; s.ach = {}; for (const a of G.AchDefs.LIST) s.ach[a.id] = 1;
			const m = { id: 'mRifts', goal: 3, param: null, prog: 3, claimed: false, told: true };
			s.missions.daily = [m];
			const c0 = s.coins, t0 = s.tickets.t1, d0 = s.stats.missionsDone;
			const ok = G.Progress.claim(m, false);
			return { ok, coins: s.coins - c0, t1: s.tickets.t1 - t0, done: s.stats.missionsDone - d0 };
		});
		A(cl.ok && cl.coins === 350 && cl.t1 === 3 && cl.done === 1, 'claiming "Win 3 rifts in the Rift Time Attack" pays the port\'s 350 coins + 3 tickets and counts a mission done', JSON.stringify(cl));
		// the missions screen in English
		await E(() => {
			const s = G.DB.save;
			s.missions = { day: G.Ranking.periodIds().d, week: G.Ranking.periodIds().w, rerolled: false,
				daily: [{ id: 'mDaily', goal: 1, param: null, prog: 1, claimed: false, told: true }, { id: 'mMods', goal: 6, param: null, prog: 2, claimed: false, told: false }, { id: 'mRifts', goal: 3, param: null, prog: 0, claimed: false, told: false }],
				weekly: [{ id: 'wMods', goal: 8, param: null, prog: 3, claimed: false, told: false }, { id: 'wRifts', goal: 7, param: null, prog: 7, claimed: true, told: true }] };
			G.GoalsUI.open('missions');
		});
		await sleep(300);
		const mt = await E(() => document.getElementById('goals-body').innerText);
		A(/Play the Daily Challenge/.test(mt) && /Survive 6 minutes with any modifier active/.test(mt) && /Win 3 rifts in the Rift Time Attack/.test(mt) && /Survive 8 minutes with 3 or more modifiers/.test(mt) && /Win 7 rifts in a single Rift Time Attack/.test(mt),
			'the missions screen shows the new missions in English', mt.slice(0, 400));
		const sp = await spanishOn('#scr-goals .box');
		A(sp.bad.length === 0, 'no Spanish on the missions screen', JSON.stringify(sp.bad.slice(0, 6)));
		if (SHOTS) await shot('m5b11_desktop_missions.png');
		await toMenu();
	}

	// ================= 5. titles: list, equip, show, persist, merge =================
	if (!ONLY.length || ONLY.includes('5')) {
		await E(() => { const s = G.DB.save; s.ach = { boss500: 1000, boss1000: 2000, own50: 3000, shiny1: 4000 }; s.profile = { favs: [{ dex: 1, shiny: false }], title: '' }; G.DB.commit(true); G.GoalsUI.open('titles'); });
		await sleep(300);
		const t0 = await E(() => ({
			rows: [...document.querySelectorAll('#goals-body .title-row')].map(r => [r.dataset.title, r.classList.contains('ok'), r.querySelector('button').textContent, r.querySelector('button').disabled]),
			cur: document.querySelector('#goals-body .title-cur').innerText, all: G.Progress.titleList().map(t => t.title),
		}));
		const wantTitles = await E(() => G.AchDefs.LIST.filter(a => a.title).map(a => a.title));
		A(t0.rows.length === wantTitles.length && JSON.stringify(t0.all) === JSON.stringify(wantTitles) && wantTitles.includes('Verdugo de jefes') && wantTitles.includes('Rey de los jefes'),
			`Missions → Titles: all ${wantTitles.length} titles of the port (one per achievement that gives one, + Boss executioner and King of bosses)`, JSON.stringify(t0.rows.length));
		const row = n => t0.rows.find(r => r[0] === n);
		A(row('Verdugo de jefes')[1] && row('Verdugo de jefes')[2] === 'Use' && !row('Verdugo de jefes')[3] && row('Leyenda')[2] === 'Locked' && row('Leyenda')[3] && /Title in use: none/.test(t0.cur),
			'yours: "Use"; the others: "Locked" (disabled); "Title in use: none" (menu.gd _goals_titles)', JSON.stringify([row('Verdugo de jefes'), row('Leyenda'), t0.cur]));
		// mouse
		await page.click('#goals-body .title-row[data-title="Verdugo de jefes"] button');
		await sleep(250);
		const t1 = await E(() => ({ title: G.DB.save.profile.title, at: G.DB.save.profile.titleAt, cur: document.querySelector('#goals-body .title-cur').innerText,
			btn: document.querySelector('#goals-body .title-row[data-title="Verdugo de jefes"] button').textContent }));
		A(t1.title === 'Verdugo de jefes' && t1.at > 0 && /Title in use: Boss executioner/.test(t1.cur) && t1.btn === 'In use', 'a click on "Use" equips it (saved with the time it was chosen), "In use"', JSON.stringify(t1));
		const bogus = await E(() => G.Progress.setTitle('Leyenda'));
		A(!bogus && await E(() => G.DB.save.profile.title) === 'Verdugo de jefes', 'a title you haven\'t earned can\'t be equipped');
		// touch: King of bosses
		await touchOn(true);
		await tapEl('#goals-body .title-row[data-title="Rey de los jefes"] button');
		await sleep(300);
		A(await E(() => G.DB.save.profile.title) === 'Rey de los jefes', 'a tap on "Use" equips another (touch)');
		await touchOn(false);
		// pad: "No title", then Collector
		await padOn();
		A(await navTo('#title-none'), 'the pad reaches "No title"');
		await press(1); await sleep(250);   // (Nintendo layout, the default: A = right face = confirm)
		A(await E(() => G.DB.save.profile.title) === '', 'pad A on "No title" unequips it');
		A(await navTo('#goals-body .title-row[data-title="Coleccionista"] button'), 'the pad reaches the Collector title\'s "Use"');
		await press(1); await sleep(250);
		A(await E(() => G.DB.save.profile.title) === 'Coleccionista', 'pad A equips it');
		await padOff();
		const spT = await spanishOn('#scr-goals .box');
		A(spT.bad.length === 0, 'no Spanish on the titles screen', JSON.stringify(spT.bad.slice(0, 6)) + ' ' + spT.txt.slice(0, 200));
		if (SHOTS) await shot('m5b11_desktop_titles.png');
		// where it shows: the profile tab (select), the menu, the trainer card, the public profile
		await E(() => G.GoalsUI.open('profile'));
		await sleep(250);
		const pf = await E(() => { const sel = document.querySelector('#goals-body select'); return { val: sel.value, opts: [...sel.options].map(o => o.value) }; });
		A(pf.val === 'Coleccionista' && pf.opts.length === 5, 'Profile: the title select shows it, with your 4 titles + "(no title)"', JSON.stringify(pf));
		await E(() => { const sel = document.querySelector('#goals-body select'); sel.value = 'Brillante'; sel.dispatchEvent(new Event('change')); });
		A(await E(() => G.DB.save.profile.title) === 'Brillante', 'choosing one in the Profile select equips it too');
		await toMenu();
		await sleep(200);
		const mn = await E(() => document.getElementById('menu-title') && document.getElementById('menu-title').innerText);
		A(mn === 'Shiny' || mn === 'Brilliant' || (mn && !/Brillante/.test(mn)), 'the main menu shows it under your Pokémon (menu.gd 1691-1693), in English', String(mn));
		const pub = await E(() => G.Social.profileData().title);
		A(pub === 'Brillante', 'the public profile carries it (as before)');
		// persistence: in the account row, after a reload
		await E(() => G.DB.commit(true));
		await waitFor(() => ROW.save && ROW.save.profile && ROW.save.profile.title === 'Brillante', 5000);
		A(ROW.save && ROW.save.profile.title === 'Brillante' && ROW.save.profile.titleAt > 0, 'saved to the account row (micasurvivor:<user>) with titleAt', JSON.stringify(ROW.save && ROW.save.profile));
		await boot();
		await waitFor(() => visible('scr-menu'), 10000);
		A(await E(() => G.DB.save.profile.title) === 'Brillante', 'after a reload: still equipped');
		// merge: another device chose a title later -> on the 409 the later choice wins; stats are the max of each
		const before = await E(() => ({ at: G.DB.save.profile.titleAt }));
		const other = JSON.parse(JSON.stringify(ROW.save));
		other.profile.title = 'Verdugo de jefes'; other.profile.titleAt = before.at + 60000;
		other.stats.tk_fire = 4321; other.stats.totalTime = 99999; other.stats.bossesTotal = 3;
		other.updated = 1;   // older by its "updated" stamp: the title must still win by titleAt
		ROW.rev++; ROW.save = other;
		await E(() => { const s = G.DB.save; s.stats.bossesTotal = 777; s.stats.tk_fire = 10; G.DB.commit(true); });
		await waitFor(() => E(() => G.DB.save.profile.title === 'Verdugo de jefes'), 8000);
		const mg = await E(() => ({ title: G.DB.save.profile.title, tk: G.DB.save.stats.tk_fire, tt: G.DB.save.stats.totalTime, b: G.DB.save.stats.bossesTotal }));
		A(mg.title === 'Verdugo de jefes' && mg.tk === 4321 && mg.tt === 99999 && mg.b === 777, 'a 409 merges: the title chosen later on the other device wins (profile.titleAt), each stat the max (tk_fire, totalTime, bossesTotal)', JSON.stringify(mg));
		await waitFor(() => ROW.save.stats.bossesTotal === 777, 5000);
		A(ROW.save.profile.title === 'Verdugo de jefes' && ROW.save.stats.bossesTotal === 777 && ROW.save.stats.tk_fire === 4321, 'and the merged save goes back to the row');
		// the reverse: this device chose later -> its title stays
		const m2 = await E(() => {
			const a = JSON.parse(JSON.stringify(G.DB.save)), b = JSON.parse(JSON.stringify(G.DB.save));
			a.profile.title = 'Coleccionista'; a.profile.titleAt = 5000; a.updated = 9e12;
			b.profile.title = 'Brillante'; b.profile.titleAt = 6000; b.updated = 1;
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			a.profile.titleAt = 7000;
			const r3 = G.DB.merge(a, b);
			return [r1.profile.title, r2.profile.title, r3.profile.title, JSON.stringify(G.DB.merge(r1, b).profile) === JSON.stringify(r1.profile)];
		});
		A(m2[0] === 'Brillante' && m2[1] === 'Brillante' && m2[2] === 'Coleccionista' && m2[3], 'merge: the later choice wins either way round, and merging again changes nothing (idempotent)', JSON.stringify(m2));
	}

	// ================= 6. damage attribution =================
	if (!ONLY.length || ONLY.includes('6')) {
		await toMenu();
		const r = await E(() => {
			const s = G.DB.save; s.partner = 4; s.modes = {};
			G.Game.startRun(null, 'normal');
			G.UI.hideAll();
			const pl = G.Game.player; pl.invuln = 1e9; pl.critChance = 0; G.EnemyMgr.clear(); G.Spawner.update = () => {}; G.Events.update = () => {};
			G.Weather.update = () => {};
			// two moves: Ember (the starter, a projectile) and Scratch-like melee: give a second one
			const m2 = G.Moves.instance('tackle', 1); pl.moves.push(m2);
			const m1 = pl.moves[0];
			const free = G.World.isFree; G.World.isFree = () => true;
			const foe = (dx, hp = 1e6) => { const e = G.Spawner.spawnOne(pl, 60); e.x = pl.x + dx; e.y = pl.y; e.update = () => {}; e.hp = e.maxHp = hp; e.shield = 0; e.types = ['normal']; return e; };
			const lost = {};
			const track = (k, e, fn) => { const h0 = e.hp; fn(); lost[k] = (lost[k] || 0) + (h0 - Math.max(0, e.hp)); };
			const e1 = foe(300), e2 = foe(-300), e3 = foe(0, 1e6);
			G.World.isFree = free;
			// move 1: its projectile (as combat.js fires it: payload carries mid)
			const proj = { dmg: 40, color: '#f80', mtype: m1.type, mkind: m1.kind, mid: m1.id, burn: 0, poison: 0, slow: 0, cc: '', ccp: 0 };
			for (let i = 0; i < 3; i++) track('move:' + m1.id, e1, () => G.Combat.land(e1, 40, '#f80', 1, 0, 0, proj, false, pl));
			// move 2: the melee move itself
			for (let i = 0; i < 2; i++) track('move:' + m2.id, e1, () => G.Combat.land(e1, 55, '#fff', 1, 0, 0, m2, false, pl));
			// an item: Rocky Helmet, through the real contact in combat.js resolve
			pl.item = 'rockyhelmet';
			e3.x = pl.x + 4; e3.y = pl.y; e3.touchCd = 0; e3.behavior = 'chase'; G.EnemyMgr.rebuildGrid();
			const helm = pl.hasItem('rockyhelmet');
			track('item', e3, () => G.Combat.resolve(0.016, pl, performance.now() / 1000));
			e3.x = pl.x + 2000;
			// a Z-move hit (zmoves.js zhit) and a Dynamax wave (the same hit, tagged)
			const z = G.ZMoves.area(pl, 'fire', pl.x, pl.y, 100);
			track('z', e2, () => z.zhit(e2, 120, 1, 0));
			const dz = G.ZMoves.area(pl, 'fire', pl.x, pl.y, 100); dz.dsrc = 'dyna';
			track('dyna', e2, () => dz.zhit(e2, 70, 1, 0));
			// a burn tick (enemy.js update: status)
			const e4 = foe(500); e4.update = G.Enemies && Object.getPrototypeOf(e4).update;
			e4.burn = 3; e4.burnT = 3; e4.burnTick = 0;
			track('status', e4, () => Object.getPrototypeOf(e4).update.call(e4, 0.016, pl));
			// a kill: move 1 finishes a weak one
			const weak = (() => { G.World.isFree = () => true; const e = foe(200, 5); G.World.isFree = free; return e; })();
			track('move:' + m1.id, weak, () => G.Combat.land(weak, 40, '#f80', 1, 0, 0, proj, false, pl));
			const sum = G.DmgLog.summary(pl.moves);
			return { lost, rows: sum.rows, total: sum.total, kills: sum.kills, raw: G.DmgLog.raw, helm, weakDead: weak.dead, m1: m1.id, m2: m2.id };
		});
		const row = k => r.rows.find(x => x.key === k) || {};
		const close = (a, b) => Math.abs(Math.round(a) - b) <= 1;
		A(r.helm && Object.keys(r.lost).length === 6, 'a controlled run: 2 moves, Rocky Helmet, a Z-move, Dynamax and a burn all hit', JSON.stringify(Object.keys(r.lost)));
		A(close(r.lost['move:' + r.m1], row('move:' + r.m1).dmg) && close(r.lost['move:' + r.m2], row('move:' + r.m2).dmg) && close(r.lost.item, row('item').dmg) && close(r.lost.z, row('z').dmg) && close(r.lost.dyna, row('dyna').dmg) && close(r.lost.status, row('status').dmg),
			'each source\'s row is exactly the HP its hits took (move 1, move 2, Items, Z-Move, Dynamax, Status effects)', JSON.stringify({ lost: r.lost, rows: r.rows.map(x => [x.key, x.dmg]) }));
		const tot = Object.values(r.lost).reduce((a, b) => a + b, 0);
		A(close(tot, r.total) && r.rows.reduce((a, x) => a + x.pct, 0) === 100, `the total is the sum (${Math.round(tot)}) and the percentages add up to 100`, JSON.stringify(r.rows.map(x => [x.key, x.pct])));
		A(r.weakDead && row('move:' + r.m1).kills === 1 && r.kills === 1, 'the kill goes to the move that finished it (main.gd run_kills_by)', JSON.stringify(r.rows.map(x => [x.key, x.kills])));
		A(r.rows[0].key.startsWith('move:') && r.rows[1].key.startsWith('move:') && r.rows[0].dmg >= r.rows[1].dmg && JSON.stringify(r.rows.slice(2).map(x => x.key)) === '["z","dyna","item","status"]',
			'rows: your moves first, most damage first (menu.gd 1809), then Z-Move, Dynamax, Items, Status effects', JSON.stringify(r.rows.map(x => x.key)));
		// a move you no longer have (team swap / partner) goes to "Partner / team"; the remote copies (co-op) too
		const al = await E(() => { const pl = G.Game.player; G.DmgLog.as('move:razor-leaf', () => G.DmgLog.note(50, true)); G.DmgLog.as('ally', () => G.DmgLog.note(25, false)); const s = G.DmgLog.summary(pl.moves); const a = s.rows.find(x => x.key === 'ally'); return { a, pct: s.rows.reduce((t, x) => t + x.pct, 0) }; });
		A(al.a && al.a.dmg === 75 && al.a.kills === 1 && al.pct === 100, 'damage of moves you no longer carry and of co-op mates goes to "Partner / team" (main.gd 768-777)', JSON.stringify(al));
		// rounding: three equal sources still add to 100
		const rd = await E(() => { G.DmgLog.reset(); for (const k of ['item', 'ability', 'status']) G.DmgLog.as(k, () => G.DmgLog.note(10, false)); return G.DmgLog.summary([]).rows.map(x => x.pct); });
		A(JSON.stringify(rd) === '[34,33,33]', 'percentages by largest remainder: three equal thirds show 34 / 33 / 33 (always 100)', JSON.stringify(rd));
		// the run-over screen: a real end of run, with fresh known hits
		const ov = await E(() => {
			G.DmgLog.reset();
			const pl = G.Game.player, m1 = pl.moves[0], m2 = pl.moves[1];
			G.DmgLog.as('move:' + m1.id, () => G.DmgLog.note(12000, true)); G.DmgLog.as('move:' + m2.id, () => G.DmgLog.note(3000, false));
			G.DmgLog.as('item', () => G.DmgLog.note(500, false)); G.DmgLog.as('z', () => G.DmgLog.note(4500, true));
			if (G.Game.state === 'playing') { G.Game.togglePause(); G.UI.hide('scr-pause'); }
			G.Game.debugTime(400);
			G.Game.quit();
			return { m1: m1.id, m2: m2.id };
		});
		await waitFor(() => visible('scr-over'), 5000);
		const tb = await E(() => [...document.querySelectorAll('#over-dmg tbody tr')].map(tr => ({ key: tr.dataset.key, cells: [...tr.children].map(td => td.innerText.trim()) })));
		const hd = await E(() => [...document.querySelectorAll('#over-dmg thead th')].map(th => th.textContent.trim()));
		const pcts = tb.map(x => +((x.cells[1].match(/\((\d+)%\)/) || [])[1]));
		A(tb.length === 4 && tb[0].key === 'move:' + ov.m1 && /12\.0k \(60%\)/.test(tb[0].cells[1]) && tb[0].cells[2] === '1' && /3000 \(15%\)/.test(tb[1].cells[1]) && tb[2].key === 'z' && /4500 \(23%\)/.test(tb[2].cells[1]) && tb[2].cells[2] === '1' && tb[3].key === 'item' && /500 \(2%\)/.test(tb[3].cells[1]),
			'the run-over screen: "Damage and defeats per move" with move, damage (12.0k as the port\'s _fmt_n) and its %, defeated (menu.gd 1801-1890)', JSON.stringify(tb));
		A(pcts.reduce((a, b) => a + b, 0) === 100 && JSON.stringify(hd) === '["Move","Damage","Defeated"]', 'its percentages add up to 100; headers in English', JSON.stringify([pcts, hd]));
		const tt = await E(() => document.getElementById('over-dmg').textContent);
		A(/Z-Move/.test(tt) && /Items/.test(tt) && /Damage and defeats per move/.test(tt), 'the extra rows are named (Z-Move, Items)', tt);
		const spO = await spanishOn('#scr-over .box');
		A(spO.bad.length === 0, 'no Spanish on the run-over screen', JSON.stringify(spO.bad.slice(0, 6)) + ' ' + spO.txt.slice(0, 300));
		if (SHOTS) await shot('m5b11_desktop_runover_damage.png');
		const ttAfter = await E(() => G.DB.save.stats.totalTime);
		A(ttAfter >= 400, 'the run adds its time to the time played (stats.totalTime; save_data.gd 588)', String(ttAfter));
		await E(() => document.getElementById('btn-again').click());
		await waitFor(() => visible('scr-menu'), 6000);
	}

	// ================= 7. the trainer card =================
	if (!ONLY.length || ONLY.includes('7')) {
		await E(() => {
			const s = G.DB.save;
			Object.assign(s.stats, { runs: 42, bestTime: 1234, bestLevel: 31, totalKills: 54321, bossesTotal: 77, chests: 19, totalTime: 3 * 3600 + 25 * 60 + 9,
				dailyPlays: 5, dailyBestMin: 12, rushBest: 7, riftsBest: 4, typeBestMin: 11, teamBestMin: 9, judgeTime: 75 });
			s.tower = { claimed: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, best: 5, log: [{ f: 5, s: 41, p: 22 }] };
			s.typeDone = { fire: 1, water: 1 };
			s.ach = { boss500: 1, own1: 1, own10: 1 }; s.profile = { favs: [{ dex: 1, shiny: false }, { dex: 7, shiny: false }], title: 'Verdugo de jefes', titleAt: Date.now() };
			G.GoalsUI.open('profile');
		});
		await sleep(300);
		await page.click('#btn-tcard');
		await sleep(400);
		const d = await E(() => ({ open: G.TrainerCard.isOpen(), data: G.TrainerCard.data(),
			name: document.querySelector('.tcard-name').innerText, title: document.querySelector('.tcard-title').innerText,
			cells: [...document.querySelectorAll('.tcard-cells > div')].map(c => [c.querySelector('span').innerText, c.querySelector('b').innerText]),
			modes: [...document.querySelectorAll('.tcard-modes > div')].map(c => [c.querySelector('span').innerText, c.querySelector('b').innerText]),
			mons: document.querySelectorAll('#tcard-mons canvas').length, user: G.DB.user, total: G.DEX.length, achN: G.AchDefs.LIST.length, achHave: Object.keys(G.DB.save.ach).length,
			text: document.getElementById('tcard-body').innerText }));
		A(d.open && d.name === d.user && d.name === 'progresstester' && d.title === 'Boss executioner' && d.mons === 3, 'Profile → "View my trainer card": your name (the display name), your title, your Pokémon + 2 favourites (menu.gd _show_card)', JSON.stringify([d.name, d.title, d.mons]));
		const want = [['Runs', '42'], ['Best time', '20:34'], ['Best level', '31'], ['Defeated', '54,321'], ['Bosses', '77'], ['Chests', '19'], ['Pokémon', '3 / ' + d.total], ['Achievements', d.achHave + ' / ' + d.achN], ['Time played', '3h 25m']];
		const cellsOk = d.cells.length === 9 && want.every(([k, v], i) => d.cells[i][0] === k && (v instanceof RegExp ? v.test(d.cells[i][1]) : d.cells[i][1] === v));
		A(cellsOk, 'the port\'s 9 cells against the save: Runs 42, Best time 20:34, Best level 31, Defeated 54,321, Bosses 77, Chests 19, Pokémon 3 / all, Achievements 3 / all, Time played 3h 25m', JSON.stringify(d.cells));
		const md = Object.fromEntries(d.modes);
		A(d.modes.length === 7 && /^5 · 12 min$/.test(md['Daily Challenge']) && /^7 bosses$/.test(md['Boss Rush']) && /^Floor 5 · 1\/6 relics$/.test(md['Floor Tower']) && /^4 rifts$/.test(md['Rift Time Attack']) && /^2\/18 types · 11 min$/.test(md['Survival by Type']) && md['Team Mode'] === '9 min' && md['Against Arceus'] === '1:15',
			'"Records by mode" against the save (Daily, Boss Rush 7, Tower floor 5 + relics, Rifts 4, Type 2/18, Team 9 min, Arceus 1:15)', JSON.stringify(d.modes));
		A(!/@|token|rev|uid|email|password/i.test(d.text) && !(await E(() => !!document.querySelector('#scr-tcard a[download], #scr-tcard [data-share], #scr-tcard input'))), 'nothing but the display name from the account; no share / export (the port\'s card has none)');
		const spC = await spanishOn('#scr-tcard .box');
		A(spC.bad.length === 0, 'no Spanish on the trainer card', JSON.stringify(spC.bad.slice(0, 6)) + ' ' + spC.txt.slice(0, 300));
		if (SHOTS) await shot('m5b11_desktop_trainercard.png');
		await page.click('#tcard-close'); await sleep(200);
		A(!(await E(() => G.TrainerCard.isOpen())), '"Close" closes it');
		// touch
		await touchOn(true);
		await tapEl('#btn-tcard'); await sleep(300);
		A(await E(() => G.TrainerCard.isOpen()), 'a tap opens it (touch)');
		await tapEl('#tcard-close'); await sleep(250);
		await touchOn(false);
		// pad
		await padOn();
		A(await navTo('#btn-tcard'), 'the pad reaches "View my trainer card"');
		await press(1); await sleep(300);
		A(await E(() => G.TrainerCard.isOpen()), 'pad A opens it');
		await press(0); await sleep(300);
		A(!(await E(() => G.TrainerCard.isOpen())) && await visible('scr-goals'), 'pad B closes it, back on the profile');
		await padOff();
		// Esc closes it too
		await E(() => G.TrainerCard.show()); await sleep(150);
		await page.keyboard.press('Escape'); await sleep(250);
		A(!(await E(() => G.TrainerCard.isOpen())) && await visible('scr-goals'), 'Esc closes it (and stays on the profile)');
		const spP = await spanishOn('#scr-goals .box');
		A(spP.bad.length === 0, 'no Spanish on the profile tab', JSON.stringify(spP.bad.slice(0, 6)));
		await toMenu();
	}

	// ================= 8. screenshots (phone) =================
	if (SHOTS && (!ONLY.length || ONLY.includes('8'))) {
		await view(844, 390); await touchOn(true); await sleep(400);
		await E(() => { const s = G.DB.save; s.ach = { boss500: 1, boss10: 1, tk250_fire: 1, own50: 1 }; s.stats.tk_fire = 400; G.GoalsUI.open('ach'); });
		await sleep(300);
		await E(() => { const c = [...document.querySelectorAll('#goals-body .chip')].find(b => /By type/.test(b.textContent)); c.click(); });
		await sleep(300); await shot('m5b11_phone_ach_bytype.png');
		await E(() => G.GoalsUI.open('missions')); await sleep(300); await shot('m5b11_phone_missions.png');
		await E(() => G.GoalsUI.open('titles')); await sleep(300); await shot('m5b11_phone_titles.png');
		await E(() => { G.GoalsUI.open('profile'); G.TrainerCard.show(); }); await sleep(400); await shot('m5b11_phone_trainercard.png');
		await E(() => G.TrainerCard.close());
		// a run-over with many rows (scrolls)
		await E(() => {
			G.UI.hideAll(); G.Game.startRun(null, 'normal'); G.UI.hideAll();
			const pl = G.Game.player; pl.invuln = 1e9; G.EnemyMgr.clear(); G.Spawner.update = () => {};
			pl.moves.push(G.Moves.instance('tackle', 3), G.Moves.instance('razor-leaf', 2));
			G.DmgLog.reset();
			const ks = ['move:' + pl.moves[0].id, 'move:tackle', 'move:razor-leaf', 'z', 'dyna', 'item', 'ability', 'status', 'ally', 'other'];
			ks.forEach((k, i) => G.DmgLog.as(k, () => G.DmgLog.note(20000 / (i + 1), i % 3 === 0)));
			G.Game.togglePause(); G.UI.hide('scr-pause'); G.Game.debugTime(612); G.Game.quit();
		});
		await waitFor(() => visible('scr-over'), 5000);
		await sleep(300); await shot('m5b11_phone_runover_damage.png');
		await E(() => document.getElementById('btn-again').click()); await sleep(300);
		await view(1280, 720);
		await E(() => {
			G.UI.hideAll(); G.Game.startRun(null, 'normal'); G.UI.hideAll();
			const pl = G.Game.player; pl.invuln = 1e9; G.EnemyMgr.clear(); G.Spawner.update = () => {};
			pl.moves.push(G.Moves.instance('tackle', 3), G.Moves.instance('razor-leaf', 2));
			G.DmgLog.reset();
			const ks = ['move:' + pl.moves[0].id, 'move:tackle', 'move:razor-leaf', 'z', 'dyna', 'item', 'ability', 'status', 'ally', 'other'];
			ks.forEach((k, i) => G.DmgLog.as(k, () => G.DmgLog.note(20000 / (i + 1), i % 3 === 0)));
			G.Game.togglePause(); G.UI.hide('scr-pause'); G.Game.debugTime(612); G.Game.quit();
		});
		await waitFor(() => visible('scr-over'), 5000);
		await sleep(300); await shot('m5b11_desktop_runover_damage_many.png');
		await E(() => document.getElementById('btn-again').click()); await sleep(300);
		await touchOn(false);
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
