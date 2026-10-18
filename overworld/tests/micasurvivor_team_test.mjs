// micasurvivor_team_test.mjs — MicaSurvivor M5 batch 7: Team mode, from the Godot Android port by
// JayElDragon (poke-survivor: save_data.gd 21 / 189-203 team_list, menu.gd 1640-1657 / 2158-2174,
// main.gd 265-269 / 436-438 / 498 / 642 / 667-668 / 704-705 / 806-807 / 844-846 / 1055 / 1425-1428 /
// 1733-1804 / 1885-1902 / 8359-8396 / 8815-8863, pad.gd 17 / 42, progress.gd 129-131 / 253 / 316 / 330),
// driven headlessly while logged in to a stubbed Magepunk account (the row micasurvivor:<user> with the
// server's compare-and-set):
//   - data: the port's numbers (3 Pokémon, unlocked with 2, 3 s between swaps, 1 s / 1.5 s invulnerable,
//     0.5 flash, the bench recovers 1.2 % of its base HP a second), the pad's `swap` action (R3 on every
//     layout), the 3 team achievements, the 2 team missions, the Fairy Z-crystal mission, English
//   - who is on the team (team_list): the picked ones you own (no repeats, up to 3), else the partner,
//     then the first Pokémon you got; locked below 2 Pokémon
//   - the mode screen: the Team card and "Choose team (up to 3)" by mouse, touch and pad; the picker shows
//     only your Pokémon, starts from scratch, toggles, closes itself at 3 ("Team ready!"); English only
//   - swapping: Tab, the pad's swap, a click on a HUD card, a tap on the swap button; 3 s cooldown,
//     blocked on the level-up cards; HP per member (kept on the bench, capped at the max), max-HP gains
//     shared, species / types / speed / attack / ability / sprite swap, level / XP / moves / items shared,
//     the bench's recovery, No healing restarting from the new HP, Dynamax ends on a swap
//   - fainting: Second Chance first, then the next one comes in at once (1.5 s invulnerable, ignoring the
//     cooldown), the run ends when nobody is left; the result, coins (with a modifier), stats teamRuns /
//     teamBestMin, the achievements and missions (only team runs count)
//   - persistence: the account push, a 409 merge from a newer save without the records, merge() both ways
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the team select, a team run's HUD (desktop and phone width), a
// swap mid-animation, the faint auto-swap, the result.
// Covers micasurvivor/js/systems/team.js, js/systems/modes.js, js/ui/modes-ui.js, js/game.js,
// js/entities/player.js, js/ui/hud.js, js/core/pad.js, js/systems/abilities.js, js/systems/dynamax.js,
// js/data/achievements.js, js/data/missions.js, js/systems/progress.js, js/core/db.js, js/ui/icons.js,
// js/data/lang-en.js, index.html, css/style.css.
//   node overworld/tests/micasurvivor_team_test.mjs
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
const PORT = 8839;
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
	localStorage.setItem('magepunk_mp_token_v1', 'team-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'teamtester' }));
	// every string the canvas really draws (after the English translation), to look for Spanish
	window.__drawn = new Set();
	addEventListener('DOMContentLoaded', () => {
		const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
		P.fillText = function (s, ...a) { if (typeof s === 'string' && window.G && G.I18n && window.__rec) window.__drawn.add(G.I18n.t(s)); return orig.call(this, s, ...a); };
	});
};

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|tipo|equipo|modo|monedas|partida|elige|elegir|cambiar|hasta|toca|tuyos|adelante|listo|necesitas|consigue|sin|vida|banca|cae|entra)\b/i;

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const cdp = await page.target().createCDPSession();
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
	const spanishOn = sel => E((sel, src) => {
		const el = document.querySelector(sel);
		if (!el) return { txt: '', bad: ['missing ' + sel] };
		let txt = el.innerText.replace(/Pok[ée]mon/g, 'Pokemon');
		for (const p of G.DEX) if (/[^\x00-\x7f]/.test(p.name) && txt.includes(p.name)) txt = txt.split(p.name).join('#');
		const re = new RegExp(src, 'gi');
		return { txt: txt.slice(0, 600), bad: txt.match(re) || [] };
	}, sel, SPANISH.source);
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
	const openModes = async () => { await E(() => G.ModesUI.open()); return waitFor(() => visible('scr-modes'), 4000); };
	const tapEl = async (sel) => { const b = await E(sel => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (b) await page.touchscreen.tap(b.x, b.y); return !!b; };
	const touchOn = on => cdp.send('Emulation.setTouchEmulationEnabled', { enabled: on, maxTouchPoints: 5 });
	// the run keeps running between page.evaluate calls: nothing may hurt us or level us up meanwhile
	const safe = () => E(() => { const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl.xpMul = 0; } G.EnemyMgr.clear(); });

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.Team && !!G.ModesUI), 30000), 'boots logged in (Magepunk account); G.Team loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	// four Pokémon got in this order: Charmander (partner), Bulbasaur, Squirtle, Pikachu
	await E(() => {
		const s = G.DB.save;
		s.owned = { 4: { at: 1000, from: 'starter' }, 1: { at: 2000, from: 'gacha' }, 7: { at: 3000, from: 'gacha' }, 25: { at: 4000, from: 'gacha' } };
		s.partner = 4; s.partnerShiny = false; s.modes = {};
		G.DB.commit(true);
	});

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const T = G.Team;
			const strings = ['Modo Equipo', 'Lleva hasta 3 Pokémon y cámbialos en plena partida (botón táctil de la derecha, tocando su ficha, R3 o Tab). Si uno cae, entra el siguiente; los de banca se recuperan. Equipo: Squirtle, Bulbasaur',
				'Elegir equipo (hasta 3)', 'Toca hasta 3 Pokémon tuyos para el equipo', 'Equipo: 2 / 3', '¡Equipo listo!', 'Necesitas al menos 2 Pokémon para formar un equipo.',
				'Consigue otro Pokémon primero', 'Cambiar Pokémon (Modo Equipo)', '¡Adelante, Squirtle!', 'Aguanta 5 minutos en Modo Equipo', 'K.O.', 'cambiar de Pokémon',
				'WASD moverse · 1-4 / Q / E o clic en un ataque para cambiarlo · Tab cambiar de Pokémon · Esc pausa',
				'Arrastra el dedo para moverte · toca un ataque para cambiarlo · toca una ficha para cambiar de Pokémon',
				...['team1', 'team10', 'team20'].flatMap(id => { const a = G.AchDefs.BY[id]; return a ? [a.name, a.desc, a.title || ''].filter(Boolean) : ['missing ' + id]; })];
			const md = G.MissionDefs.BY;
			return {
				k: { max: T.MAX, min: T.MIN_OWNED, cd: T.CD, inv: T.INV, invAuto: T.INV_AUTO, flash: T.FLASH, regen: T.REGEN, ring: T.RING, say: T.SAY },
				list: G.Modes.LIST, name: G.I18n.t(G.Modes.NAME.team), icon: G.Modes.ICON.team, iconOk: /^<img/.test(G.Icons.html('m_team', 20)),
				pad: [G.Pad.defaults('nintendo').swap, G.Pad.defaults('xbox').swap, G.Pad.defaults('playstation').swap], acts: G.Pad.ACTIONS,
				ach: ['team1', 'team10', 'team20'].map(id => { const a = G.AchDefs.BY[id]; return a && [a.id, a.cat, a.tier, a.goal, a.reward, a.title || '']; }),
				mis: [md.mTeam && [md.mTeam.goals, md.mTeam.reward, md.mTeam.mode, G.MissionDefs.daily.includes(md.mTeam)], md.wTeam && [md.wTeam.goals, md.wTeam.reward, md.wTeam.mode, G.MissionDefs.weekly.includes(md.wTeam)]],
				fairy: G.ZMoves.ZMIS.find(z => z.type === 'fairy'),
				en: strings.map(s => [s, G.I18n.t(s)]),
			};
		});
		A(JSON.stringify(r.k) === JSON.stringify({ max: 3, min: 2, cd: 3, inv: 1, invAuto: 1.5, flash: 0.5, regen: 0.012, ring: { r0: 8, r1: 150, color: '#ffd23f', dur: 0.5 }, say: 1.6 }),
			'the port\'s numbers: up to 3, unlocked with 2, 3 s between swaps, 1 s (1.5 s after a faint) invulnerable, 0.5 flash, the bench recovers 1.2 %/s, the gold ring 8 -> 150 in 0.5 s', JSON.stringify(r.k));
		A(r.list.includes('team') && r.name === 'Team Mode' && r.icon === 'm_team' && r.iconOk, 'a "Team Mode" mode with its own icon (icons.gd m_team)', JSON.stringify([r.list, r.name]));
		A(JSON.stringify(r.pad) === '[11,11,11]' && r.acts.join() === 'prev,next,pause,confirm,cancel,reroll,ban,swap,zmove,dynamax', 'the pad action `swap` defaults to R3 / RS on every layout (pad.gd JOY_BUTTON_RIGHT_STICK), in the port\'s action order', JSON.stringify(r));
		A(JSON.stringify(r.ach) === JSON.stringify([['team1', 'modos', 1, 1, { coins: 150, t1: 2 }, ''], ['team10', 'modos', 2, 10, { coins: 1500, t10: 1 }, ''], ['team20', 'modos', 3, 20, { coins: 3500, t1: 2, t10: 2 }, 'Líder de equipo']]),
			'the 3 team achievements from progress.gd 129-131 (goals 1 run / 10 / 20 minutes, the port\'s rewards and the "Team leader" title)', JSON.stringify(r.ach));
		A(JSON.stringify(r.mis) === JSON.stringify([[[5, 8], { t1: 3, coins: 300 }, 'max', true], [[10, 15], { t1: 3, t10: 1, coins: 1200 }, 'max', true]]),
			'the team missions from progress.gd 316 / 330: daily 5 / 8 minutes, weekly 10 / 15 minutes, with the port\'s rewards', JSON.stringify(r.mis));
		A(r.fairy && r.fairy.stat === 'teamBestMin' && r.fairy.goal === 8, 'the Fairy Z-crystal mission reads teamBestMin (8 minutes in Team Mode)', JSON.stringify(r.fairy));
		const bad = r.en.filter(([es, en]) => es === en || SPANISH.test(en.replace(/Pok[ée]mon/g, '')));
		A(bad.length === 0, `every new string has English (the port's lang_en.json wording; ${r.en.length} checked)`, JSON.stringify(bad));
		const en = Object.fromEntries(r.en);
		A(en['¡Adelante, Squirtle!'] === 'Go, Squirtle!' && en['Equipo: 2 / 3'] === 'Team: 2 / 3' && /Team: Squirtle, Bulbasaur$/.test(en[r.en[1][0]]), 'patterns fill their holes (Go, Squirtle! · Team: 2 / 3 · Team: Squirtle, Bulbasaur)', JSON.stringify([en['¡Adelante, Squirtle!'], en['Equipo: 2 / 3']]));
	}

	// ================= 2. who is on the team (save_data.gd team_list) =================
	if (!ONLY.length || ONLY.includes('2')) {
		const r = await E(() => {
			const T = G.Team, s = G.DB.save, out = {};
			s.modes.team = []; out.none = T.list();
			s.modes.team = [7]; out.one = T.list();
			s.modes.team = [7, 7, 999, 150, 25, 1, 4]; G.Modes.prefs(); out.cleaned = s.modes.team.slice(); out.dirty = T.list();
			s.modes.team = []; s.partner = 25; out.partner = T.list(); s.partner = 4;
			const bk = s.owned;
			s.owned = { 4: { at: 1000 }, 7: { at: 3000 } }; s.modes.team = []; out.two = T.list(); out.twoOk = T.unlocked();
			s.owned = { 4: { at: 1000 } }; out.oneOk = T.unlocked(); out.solo = T.list();
			s.owned = bk; s.modes.team = [];
			out.plan = G.Modes.plan('team');
			s.owned = { 4: { at: 1000 } }; out.planLocked = G.Modes.plan('team').mode; s.owned = bk;
			return out;
		});
		A(JSON.stringify(r.none) === '[4,1,7]', 'nothing picked: the partner, then the first Pokémon you got (Bulbasaur, Squirtle), up to 3', JSON.stringify(r.none));
		A(JSON.stringify(r.one) === '[7,4,1]', 'one picked (Squirtle): it leads, the rest is filled in the order you got them', JSON.stringify(r.one));
		A(JSON.stringify(r.cleaned) === '[7,25,1]' && JSON.stringify(r.dirty) === '[7,25,1]', 'duplicates, unknown and unowned Pokémon are dropped and only 3 are kept', JSON.stringify(r));
		A(JSON.stringify(r.partner) === '[25,4,1]', 'with nothing picked the partner leads (Pikachu)', JSON.stringify(r.partner));
		A(JSON.stringify(r.two) === '[4,7]' && r.twoOk && !r.oneOk && JSON.stringify(r.solo) === '[4]', 'with 2 Pokémon a team of 2 (unlocked); with 1, locked', JSON.stringify(r));
		A(r.plan.mode === 'team' && r.plan.dex === 4 && JSON.stringify(r.plan.team) === '[4,1,7]' && r.planLocked === 'normal', 'the run plan: mode team, the leader plays first; locked falls back to a normal run', JSON.stringify(r.plan));
		// locked: the card says so and does not start
		await E(() => { window.__bk = G.DB.save.owned; G.DB.save.owned = { 4: { at: 1000 } }; });
		await openModes();
		await sleep(200);
		const lk = await E(() => ({ card: document.querySelector('#modes-list [data-mode=team]').innerText, pick: !!document.getElementById('modes-team-pick') }));
		await E(() => document.querySelector('#modes-list [data-mode=team]').click());
		await sleep(250);
		const lk2 = await E(() => ({ st: G.Game.state, toast: (document.querySelector('.toast') || {}).textContent || '' }));
		A(/You need at least 2 Pokémon to form a team\./.test(lk.card) && !lk.pick && lk2.st === 'ui' && lk2.toast === 'Get another Pokémon first',
			'below 2 Pokémon the card says "You need at least 2 Pokémon to form a team.", has no picker and a click only says "Get another Pokémon first"', JSON.stringify([lk, lk2]));
		await E(() => { G.DB.save.owned = window.__bk; document.querySelector('#scr-modes [data-back]').click(); });
		await waitFor(() => visible('scr-menu'), 3000);
	}

	// ================= 3. the team select: mouse, touch, pad =================
	if (!ONLY.length || ONLY.includes('3')) {
		await page.click('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 4000), 'the menu\'s Game modes opens "Choose a mode" (mouse)');
		await sleep(300);
		const c = await E(() => ({ cards: [...document.querySelectorAll('#modes-list [data-mode]')].map(b => b.dataset.mode), card: document.querySelector('#modes-list [data-mode=team]').innerText, btn: (document.getElementById('modes-team-pick') || {}).innerText }));
		A(c.cards.includes('team') && /Team Mode/.test(c.card) && /Bring up to 3 Pokémon and swap them mid-run/.test(c.card) && /Team: Charmander, Bulbasaur, Squirtle/.test(c.card) && /Choose team \(up to 3\)/.test(c.btn || ''),
			'the Team Mode card, in the port\'s words, names the team (Charmander, Bulbasaur, Squirtle) next to "Choose team (up to 3)"', JSON.stringify(c));
		await E(() => { G.Modes.prefs().team = [1]; });
		await page.click('#modes-team-pick');
		A(await waitFor(() => visible('modes-team'), 3000) && !(await visible('modes-main')), '"Choose team (up to 3)" opens the picker');
		await sleep(300);
		const g = await E(() => ({ cells: [...document.querySelectorAll('#team-grid .cell')].map(c => +c.dataset.dex), picked: G.Team.picked(), count: document.getElementById('team-count').innerText,
			back: document.querySelector('#scr-modes [data-back]').classList.contains('hidden'), toast: (document.querySelector('.toast') || {}).textContent || '' }));
		A(JSON.stringify(g.cells) === '[1,4,7,25]' && g.picked.length === 0 && g.count === 'Team: 0 / 3' && g.back && g.toast === 'Tap up to 3 of your Pokémon for the team',
			'it lists only your Pokémon, starts from scratch (the old pick is cleared), says "Tap up to 3 of your Pokémon for the team" and "Team: 0 / 3"', JSON.stringify(g));
		const sp = await spanishOn('#scr-modes');
		A(sp.bad.length === 0, 'the picker shows no Spanish in English mode', JSON.stringify(sp));
		await page.click('#team-grid .cell[data-dex="25"]');
		await sleep(150);
		const t1 = await E(() => ({ picked: G.Team.picked(), count: document.getElementById('team-count').innerText, on: document.querySelector('#team-grid .cell[data-dex="25"]').classList.contains('on'), no: (document.querySelector('#team-grid .cell[data-dex="25"] .team-no') || {}).textContent }));
		A(JSON.stringify(t1.picked) === '[25]' && t1.count === 'Team: 1 / 3' && t1.on && t1.no === '1', 'a click adds a Pokémon (numbered 1, "Team: 1 / 3")', JSON.stringify(t1));
		await page.click('#team-grid .cell[data-dex="7"]');
		await sleep(150);
		await shot('team_select.png');
		await page.click('#team-grid .cell[data-dex="25"]');
		await sleep(150);
		const t2 = await E(() => G.Team.picked());
		A(JSON.stringify(t2) === '[7]', 'clicking a picked one again takes it out', JSON.stringify(t2));
		await page.click('#team-grid .cell[data-dex="1"]');
		await sleep(150);
		await page.click('#team-grid .cell[data-dex="4"]');
		await sleep(250);
		const t3 = await E(() => ({ picked: G.Team.picked(), main: !document.getElementById('modes-main').classList.contains('hidden'), toast: (document.querySelector('.toast') || {}).textContent, card: document.querySelector('#modes-list [data-mode=team]').innerText, saved: JSON.stringify(G.DB.save.modes.team) }));
		A(JSON.stringify(t3.picked) === '[7,1,4]' && t3.main && t3.toast === 'Team ready!' && /Team: Squirtle, Bulbasaur, Charmander/.test(t3.card) && t3.saved === '[7,1,4]',
			'the third pick closes the picker ("Team ready!"); the card shows Squirtle, Bulbasaur, Charmander (saved in save.modes.team)', JSON.stringify(t3));
		await shot('team_modes_screen.png');
		const sp2 = await spanishOn('#scr-modes');
		A(sp2.bad.length === 0, 'the modes screen with the Team card shows no Spanish in English mode', JSON.stringify(sp2));
		await E(() => document.querySelector('#scr-modes [data-back]').click());
		await waitFor(() => visible('scr-menu'), 3000);

		// touch (a phone-sized window with touch emulation)
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await touchOn(true);
		await sleep(500);
		await tapEl('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 3000), 'a tap opens "Choose a mode" on a phone');
		await sleep(300);
		await tapEl('#modes-team-pick');
		A(await waitFor(() => visible('modes-team'), 3000), 'a tap on "Choose team" opens the picker');
		await sleep(300);
		await tapEl('#team-grid .cell[data-dex="7"]');
		await sleep(150);
		const tt = await E(() => G.Team.picked());
		const fit = await E(() => {
			const over = [...document.querySelectorAll('#modes-team .cell, #modes-team .gen-tab, #modes-team button, #modes-team p')].filter(el => { const b = el.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).length;
			return { over, scroll: document.documentElement.scrollWidth <= innerWidth + 1 };
		});
		A(JSON.stringify(tt) === '[7]' && fit.over === 0 && fit.scroll, 'a tap picks a Pokémon; nothing in the picker overflows at 844x390', JSON.stringify([tt, fit]));
		await shot('team_select_phone.png');
		await tapEl('#team-back');
		await sleep(250);
		const tb = await E(() => ({ main: !document.getElementById('modes-main').classList.contains('hidden'), card: document.querySelector('#modes-list [data-mode=team]').innerText }));
		A(tb.main && /Team: Squirtle, Charmander, Bulbasaur/.test(tb.card), '"Back" with one pick: the rest is filled in (Squirtle, Charmander, Bulbasaur)', JSON.stringify(tb));
		await E(() => document.querySelector('#scr-modes [data-back]').click());
		await touchOn(false);
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(500);

		// pad
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(13); await sleep(150);
		A(await navTo('#scr-menu [data-go=modes]'), 'the D-pad reaches "Game modes"');
		await press(1);
		A(await waitFor(() => visible('scr-modes'), 3000), 'confirm opens the modes screen');
		await sleep(300);
		A(await navTo('#modes-team-pick'), 'the D-pad reaches "Choose team (up to 3)"');
		await press(1);
		A(await waitFor(() => visible('modes-team'), 2000), 'confirm opens the picker');
		await sleep(250);
		A(await navTo('#team-grid .cell[data-dex="25"]'), 'the D-pad reaches a Pokémon in the picker');
		await press(1);
		await sleep(150);
		A(await navTo('#team-grid .cell[data-dex="1"]'), 'and another one');
		await press(1);
		await sleep(150);
		const pp = await E(() => G.Team.picked());
		A(JSON.stringify(pp) === '[25,1]', 'confirm picks them (Pikachu, Bulbasaur)', JSON.stringify(pp));
		await press(0);   // Nintendo: bottom face = back
		A(await waitFor(() => E(() => document.getElementById('modes-team').classList.contains('hidden') && !document.getElementById('modes-main').classList.contains('hidden')), 2000) && await visible('scr-modes'), 'cancel closes the picker back to the list');
		await press(0);
		A(await waitFor(() => visible('scr-menu'), 2000), 'cancel again returns to the menu');
		await E(() => { window.__pads[0] = null; });
		await sleep(300);
		// the team for the runs below
		await E(() => { G.Team.pickStart(); G.Team.toggle(7); G.Team.toggle(1); G.Team.toggle(4); });
	}

	// ================= 4. a team run: swapping =================
	if (!ONLY.length || ONLY.includes('4')) {
		await E(() => { const s = G.DB.save; G.DB.upgradesOf(7).hp = 2; G.Modes.prefs().mods = []; s.stats.dens = 1; s.stats.dynamax = 1; G.DB.commit(); if (!G.Team.picked().length) { G.Team.toggle(7); G.Team.toggle(1); G.Team.toggle(4); } });
		await openModes();
		await E(() => document.querySelector('#modes-list [data-mode=team]').click());
		A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'a click on the Team Mode card starts the run');
		await safe();
		const r0 = await E(() => {
			const pl = G.Game.player, T = G.Team;
			return { mode: G.Game.mode, on: T.on, dex: pl.dex, members: T.members.map(m => [m.dex, m.base, m.hp]), want: [7, 1, 4].map(d => G.DEX_BY[d].hp + 16), maxHp: pl.maxHp, cur: T.cur, title: G.Modes.title(), ab: pl.ability, ab7: G.Abilities.of(7) };
		});
		A(r0.mode === 'team' && r0.on && r0.dex === 7 && r0.cur === 0, 'Team Mode: Squirtle (the first picked) starts', JSON.stringify(r0));
		A(JSON.stringify(r0.members.map(m => m[1])) === JSON.stringify(r0.want) && r0.members.every(m => m[2] === m[1]) && r0.maxHp === r0.want[0],
			'each member has its own HP: its species\' base + the leader\'s Vitality upgrade (+16), all full', JSON.stringify(r0));
		await E(() => { window.__rec = true; });
		await sleep(900);
		await shot('team_run_hud.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(700);
		await shot('team_run_hud_phone.png');
		const fitHud = await E(() => {
			const w = innerWidth, h = innerHeight, rs = G.Team.chipRects(), b = G.Team.buttonRect(w, h), z = G.ZMoves.buttonRect(w, h), d = G.Dynamax.buttonRect(w, h);
			const hit = (a, c) => a.x < c.x + c.s && a.x + (a.w || a.s) > c.x && a.y < c.y + c.s && a.y + (a.h || a.s) > c.y;
			return { inside: rs.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h) && b.x >= 0 && b.y >= 0 && b.x + b.s <= w && b.y + b.s <= h,
				clash: hit(b, z) || hit(b, d) || rs.some(r => hit(r, z) || hit(r, d) || hit(r, b)) };
		});
		A(fitHud.inside && !fitHud.clash, 'phone width (844x390): the team cards and the swap button fit and touch neither the Z nor the MAX button', JSON.stringify(fitHud));
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(400);

		// Tab: the first swap and what carries over
		const r1 = await E(() => {
			const pl = G.Game.player, T = G.Team;
			pl.invuln = 0;
			pl.level = 7; pl.xp = 12; pl.equip('bigorb', 1);
			pl.addMaxHp(20);                 // a max-HP card: shared by the team
			pl.hp = 33;
			const before = { moves: pl.moves, level: pl.level, xp: pl.xp, item: pl.item, slots: pl.slots.length, atkMul: pl.atkMul, revives: pl.revives };
			const k = new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true, cancelable: true });
			dispatchEvent(k);
			return { before, prevented: k.defaultPrevented, base0: T.members[0].base };
		});
		await sleep(120);
		const r2 = await E(() => {
			const pl = G.Game.player, T = G.Team, m1 = G.DEX_BY[1];
			const out = { cur: T.cur, dex: pl.dex, name: pl.mon.name, types: pl.mon.types, spd: pl.baseSpd, atk: pl.baseAtk, wantSpd: m1.spd, wantAtk: m1.atk, ability: pl.ability, want: G.Abilities.of(1),
				animDex: pl.anim.dex, r: pl.r, wantR: G.Sprites.bodyRadius(1), cd: T.cd, inv: pl.invuln, flash: pl.flash, bonus: T.bonus, maxHp: pl.maxHp, hp: pl.hp, base1: T.members[1].base, saved0: T.members[0].hp,
				level: pl.level, xp: pl.xp, item: pl.item, slots: pl.slots.length, banner: G.I18n.t((G.Spawner.banner() || {}).text || '') };
			pl.invuln = 1e9;
			return out;
		});
		A(r1.prevented && r2.cur === 1 && r2.dex === 1 && r2.animDex === 1 && near(r2.r, r2.wantR), 'Tab swaps to the next member (Bulbasaur): body and sprite change (main.gd 642 / rebody)', JSON.stringify(r2));
		A(JSON.stringify(r2.types) === '["grass","poison"]' && r2.spd === r2.wantSpd && r2.atk === r2.wantAtk && r2.ability === r2.want, 'types, speed, attack and the passive ability are the new one\'s', JSON.stringify(r2));
		A(r2.cd > 2.8 && r2.cd <= 3 && r2.inv > 0.8 && r2.inv <= 1 && r2.flash > 0.3 && r2.flash <= 0.5, '3 s until the next swap, 1 s invulnerable and a 0.5 flash', JSON.stringify(r2));
		A(near(r2.saved0, 33, 0.5) && r2.bonus === 20 && r2.maxHp === r2.base1 + 20 && r2.hp === r2.base1, 'the old one keeps its 33 HP on the bench; the +20 max HP is the team\'s: Bulbasaur has base + 20 max HP and enters with the HP it had (its base)', JSON.stringify(r2));
		A(r2.level === 7 && r2.xp === 12 && r2.item === 'bigorb' && r2.slots === r1.before.slots, 'level, experience, moves and the held item are the team\'s', JSON.stringify(r2));
		A(r2.banner === 'Go, Bulbasaur!', 'the banner says "Go, Bulbasaur!" (in English)', r2.banner);
		await E(() => G.Game.togglePause());
		await sleep(30);
		await E(() => G.Game.togglePause());
		await E(() => { G.UI.hide('scr-pause'); });
		await sleep(80);
		await shot('team_swap_anim.png');

		const r3 = await E(() => {
			const pl = G.Game.player, T = G.Team, out = {};
			pl.invuln = 0;
			out.early = T.request(pl);                 // still cooling down
			out.cur1 = T.cur;
			// the bench recovers 1.2 % of its base a second (capped at the base)
			T.members[0].hp = 33; T.members[2].hp = T.members[2].base - 1;
			T.tick(3);
			out.m0 = T.members[0].hp; out.want0 = 33 + T.members[0].base * 0.012 * 3; out.m2 = T.members[2].hp; out.base2 = T.members[2].base; out.cdAfter = T.cd;
			// back to Squirtle by its card index: it comes in with what it had
			out.back = T.request(pl, 0);
			out.hpBack = pl.hp; out.maxBack = pl.maxHp; out.base0 = T.members[0].base; out.dexBack = pl.dex;
			// the bonus survives a round trip
			out.bonus = T.bonus;
			pl.invuln = 1e9;
			return out;
		});
		A(!r3.early && r3.cur1 === 1, 'a second swap during the 3 s cooldown does nothing', JSON.stringify(r3));
		A(near(r3.m0, r3.want0, 1e-9) && r3.m2 === r3.base2 && r3.cdAfter === 0, 'on the bench HP comes back at 1.2 % of the base per second, never above the base', JSON.stringify(r3));
		A(r3.back && r3.dexBack === 7 && near(r3.hpBack, r3.want0, 1e-9) && r3.maxBack === r3.base0 + 20 && r3.bonus === 20, 'swapping back (to a chosen card) brings Squirtle in with the HP it had (plus its bench recovery) and base + 20 max HP', JSON.stringify(r3));
		// blocked on the level-up cards
		await E(() => { G.Team.tick(5); G.Game.debugLevelUp(); });
		await waitFor(() => visible('scr-levelup'), 5000);
		const lv = await E(() => { const r = G.Team.request(G.Game.player); return { r, cur: G.Team.cur, st: G.Game.state }; });
		A(!lv.r && lv.cur === 0 && lv.st === 'levelup', 'no swapping while the level-up cards are open', JSON.stringify(lv));
		await E(() => document.querySelector('#cards .card').click());
		await waitFor(() => E(() => G.Game.state === 'playing'), 3000);
		await safe();

		// ================= 5. Dynamax ends on a swap =================
		const d = await E(() => {
			const pl = G.Game.player, T = G.Team, out = {};
			pl.level = 25; G.Dynamax.reset(); T.tick(5);
			out.started = G.Dynamax.tryStart(pl) !== false && G.Dynamax.active;
			out.dynMax = pl.maxHp; out.preBonus = T.bonus; out.base0 = T.members[0].base;
			pl.hp = pl.maxHp;
			out.swapped = T.request(pl);
			out.active = G.Dynamax.active; out.dyn = !!pl.dyn; out.cd = G.Dynamax.cd;
			out.bonus = T.bonus; out.maxHp = pl.maxHp; out.base1 = T.members[1].base; out.saved0 = T.members[0].hp;
			pl.invuln = 1e9;
			return out;
		});
		A(d.started && d.swapped && !d.active && !d.dyn && d.cd === 240, 'Dynamax ends on a swap (G.Dynamax.stop: its 240 s cooldown starts)', JSON.stringify(d));
		A(d.bonus === 20 && d.maxHp === d.base1 + 20 && d.saved0 === d.base0 + 20, 'the Dynamax HP bonus is removed first: the team keeps only its own +20 and the old one\'s HP is back in proportion', JSON.stringify(d));

		// ================= 6. the HUD card (click), the swap button, the pad, the canvas text =================
		await E(() => { G.Team.tick(5); });
		const chip = await E(() => { const r = G.Team.chipRects()[2]; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
		await page.mouse.click(chip.x, chip.y);
		await sleep(150);
		const hc = await E(() => ({ cur: G.Team.cur, dex: G.Game.player.dex }));
		A(hc.cur === 2 && hc.dex === 4, 'a click on a HUD card swaps to that member (Charmander, main.gd TeamUi)', JSON.stringify(hc));
		await E(() => G.Team.tick(5));
		const btn = await E(() => { const b = G.Team.buttonRect(innerWidth, innerHeight); return { x: b.x + b.s / 2, y: b.y + b.s / 2 }; });
		await page.mouse.click(btn.x, btn.y);
		await sleep(150);
		const hb = await E(() => ({ cur: G.Team.cur, dex: G.Game.player.dex }));
		A(hb.cur === 0 && hb.dex === 7, 'a click on the round swap button goes to the next one standing (Squirtle)', JSON.stringify(hb));
		await E(() => G.Team.tick(5));
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(15); await sleep(120);
		await E(() => G.Team.tick(5));
		await press(11);   // R3 = swap
		const hp = await E(() => ({ cur: G.Team.cur, dex: G.Game.player.dex, map: G.Pad.map().swap }));
		A(hp.cur === 1 && hp.dex === 1 && hp.map === 11, 'the pad\'s swap action (R3 by default) swaps', JSON.stringify(hp));
		await sleep(400);
		const glyph = await E(() => G.Pad.mode);
		A(glyph === 'pad', 'in pad mode the HUD shows the swap button\'s glyph (pad mode on)', glyph);
		await shot('team_run_pad.png');
		const mig = await E(() => {
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 3, ban: 2, zmove: 10, dynamax: 8 });
			const a = G.Pad.map();
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 3, ban: 2, zmove: 11, dynamax: 8 });
			const b = G.Pad.map();
			G.Pad.reset('nintendo');
			const sw = (() => { G.Pad.setBtn('swap', 10); return G.Pad.map(); })();
			const html = G.Pad.settingsHTML();
			G.Pad.reset('nintendo');
			return { a, b, sw, row: /data-bind="swap"/.test(html) && /Cambiar Pokémon \(Modo Equipo\)/.test(html) };
		});
		A(mig.a.swap === 11 && mig.a.zmove === 10 && mig.b.zmove === 11 && mig.b.swap === 6, 'a map saved before batch 7 gains swap = R3 (or the first free button if R3 is taken)', JSON.stringify(mig));
		A(mig.sw.swap === 10 && mig.sw.zmove === 11 && mig.row, 'remap with swap-on-conflict (swap -> L3, the Z-move takes R3); Settings > Controls has a "Switch Pokémon (Team Mode)" row', JSON.stringify(mig.sw));
		await E(() => { window.__pads[0] = null; });
		await sleep(300);
		// touch: a tap on the swap button at phone width
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await touchOn(true);
		await sleep(500);
		await E(() => G.Team.tick(5));
		const tbtn = await E(() => { const b = G.Team.buttonRect(innerWidth, innerHeight); return { x: b.x + b.s / 2, y: b.y + b.s / 2 }; });
		await page.touchscreen.tap(tbtn.x, tbtn.y);
		await sleep(200);
		const ht = await E(() => ({ cur: G.Team.cur, dex: G.Game.player.dex, touch: G.Touch.active }));
		A(ht.cur === 2 && ht.dex === 4 && ht.touch, 'a tap on the swap button swaps on a phone (to Charmander)', JSON.stringify(ht));
		await sleep(500);
		await shot('team_run_hud_phone_touch.png');
		await touchOn(false);
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(400);
		const drawn = await E((src) => {
			window.__rec = false;
			const re = new RegExp(src, 'i'), all = [...window.__drawn];
			const names = G.DEX.map(p => p.name);
			const team = all.filter(s => /Go, |KO$|Tab|switch Pokémon|\d+\/\d+$/.test(s) || names.includes(s));
			const bad = all.filter(s => re.test(s.replace(/Pok[ée]mon/g, '')) && !names.includes(s));
			return { team: team.slice(0, 20), go: all.some(s => /^Go, /.test(s)), tab: all.some(s => /Tab switch Pokémon/.test(s)), tap: all.some(s => /tap a card to switch Pokémon/.test(s)), bad: bad.slice(0, 10), n: all.length };
		}, SPANISH.source);
		A(drawn.go && drawn.tab && drawn.tap && drawn.bad.length === 0,
			`no Spanish in the team run's canvas (cards, "Go, …!", the hints "Tab switch Pokémon" / "tap a card to switch Pokémon"; ${drawn.n} strings drawn)`, JSON.stringify(drawn));
		await E(() => { G.Game.togglePause(); G.UI.hide('scr-pause'); G.Game.quit(); });
		await toMenu();
	}

	// ================= 7. fainting: Second Chance, the auto-swap, the end =================
	if (!ONLY.length || ONLY.includes('7')) {
		await E(() => {
			const s = G.DB.save;
			G.Modes.prefs().mods = ['horde', 'nohealing'];
			G.DB.upgradesOf(7).revive = 1;
			window.__runs0 = s.stats.teamRuns || 0;
		});
		await E(() => {
			const s = G.DB.save;
			G.Progress.event('kill', { types: [], boss: false, legend: 0 });   // (makes sure today's missions exist)
			s.missions.daily[0] = { id: 'mTeam', goal: 5, param: null, prog: 0, claimed: false, told: false };
			s.missions.weekly[0] = { id: 'wTeam', goal: 10, param: null, prog: 0, claimed: false, told: false };
			G.Progress.event('runEnd', { time: 900, level: 10, coins: 0, types: ['water'], group: false, mode: 'normal', nmods: 0 });
			window.__misNormal = [s.missions.daily[0].prog, s.missions.weekly[0].prog];
		});
		await openModes();
		await E(() => document.querySelector('#modes-list [data-mode=team]').click());
		A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'a team run with modifiers (Horde + No healing)');
		await safe();
		const nh = await E(() => {
			const pl = G.Game.player, T = G.Team, out = { mods: G.Modes.mods, revives: pl.revives };
			pl.invuln = 0;
			pl.hp = 20; G.Modes.healTick(pl);
			T.request(pl);                         // Bulbasaur enters at full HP
			G.Modes.healTick(pl);                  // No healing must not clamp it to Squirtle's 20
			out.hp = pl.hp; out.max = pl.maxHp;
			pl.heal(50); G.Modes.healTick(pl); out.healed = pl.hp;
			pl.hp = 40; G.Modes.healTick(pl); pl.heal(30); G.Modes.healTick(pl); out.after = pl.hp;
			pl.invuln = 1e9;
			return out;
		});
		A(JSON.stringify(nh.mods) === '["horde","nohealing"]' && nh.hp === nh.max && nh.after === 40, 'modifiers apply to team runs; with No healing the swapped-in Pokémon keeps its own HP (the clamp restarts from it) and still cannot heal', JSON.stringify(nh));
		const f = await E(() => {
			const pl = G.Game.player, T = G.Team, out = {};
			T.tick(5);
			out.cur0 = T.cur;
			// a lethal hit: the Second Chance heart goes first (main.gd 1885-1897)
			pl.invuln = 0; pl.hurt(1e9);
			out.sc = { cur: T.cur, revives: pl.revives, hp: pl.hp, max: pl.maxHp, dead: pl.dead };
			pl.invuln = 1e9;
			return out;
		});
		A(f.sc.cur === f.cur0 && f.sc.revives === 0 && f.sc.hp === f.sc.max && !f.sc.dead, 'a lethal hit spends the Second Chance heart first (same Pokémon, full HP)', JSON.stringify(f));
		await sleep(1600);   // (let the Second Chance text fade before the next shot)
		await safe();
		const a = await E(() => {
			const pl = G.Game.player, T = G.Team, out = {};
			T.tick(5);
			// swap once so the cooldown is running, then faint: the next one comes in anyway
			const was = T.cur; T.request(pl); out.cdBefore = T.cd; out.from = T.cur;
			pl.invuln = 0; pl.hurt(1e9);
			out.cur = T.cur; out.dead = pl.dead; out.inv = pl.invuln; out.hp = pl.hp; out.max = pl.maxHp; out.ko = T.members[out.from].hp; out.dex = pl.dex;
			out.view = T.view(pl).map(v => [v.name, v.dead, v.cur]);
			out.was = was;
			pl.invuln = 1e9;
			return out;
		});
		A(a.cdBefore > 2.5 && a.cur !== a.from && !a.dead && a.inv >= 1.4 && a.ko === 0 && a.hp > 0, 'when the one playing faints the next one comes in at once (no cooldown wait), 1.5 s invulnerable; the fallen one is KO', JSON.stringify(a));
		await E(() => { G.Game.player.invuln = 1e9; });
		await sleep(250);
		await shot('team_faint_autoswap.png');
		const end = await E(() => {
			const pl = G.Game.player, T = G.Team;
			G.Game.debugTime(612);
			// knock out everyone left
			for (let i = 0; i < 4 && !pl.dead; i++) { pl.invuln = 0; pl.hurt(1e9); }
			const time = G.Game.st.time;
			const parts = Math.floor(time / 5) + Math.floor(pl.kills * 0.25) + pl.bosses * 80 + pl.coins;
			const s = G.DB.save;
			window.__pre = { ach: Object.keys(s.ach || {}), zmis: Object.keys(s.zmis || {}) };
			return { dead: pl.dead, alive: T.members.filter(m => m.hp > 0).length, parts, coinMul: pl.coinMul, coins: s.coins, runs: s.stats.teamRuns || 0 };
		});
		A(end.dead && end.alive === 0, 'with nobody left standing the run is over', JSON.stringify(end));
		A(await waitFor(() => visible('scr-over'), 8000), 'the result screen');
		await sleep(700);
		const o = await E(() => { const s = G.DB.save; return { mode: (document.querySelector('#scr-over .over-mode') || {}).innerText, runs: s.stats.teamRuns, best: s.stats.teamBestMin, mn1: s.stats.mn1, mbh: s.stats.mb_horde, coins: s.coins, ach: s.ach,
			mis: [s.missions.daily[0].prog, s.missions.weekly[0].prog], normal: window.__misNormal, runs0: window.__runs0 }; });
		A(/Team Mode/.test(o.mode || ''), 'the result says "Team Mode"', o.mode);
		A(o.runs === o.runs0 + 1 && o.best === 10 && o.mn1 === 10 && o.mbh === 10, 'stats: teamRuns +1, teamBestMin 10; the modifier records count team runs (main.gd 844-854)', JSON.stringify(o));
		const b = await bonus();
		A(o.ach.team1 && o.ach.team10 && !o.ach.team20 && o.coins - end.coins === Math.round(end.parts * 1.5 * end.coinMul) + b,
			'coins x1.5 (1 + 2 modifiers x 0.25, no extra for the mode); "Better together" and "Perfect relay" unlock at 10 minutes, "Team leader" (20) does not', JSON.stringify([o.coins - end.coins, end.parts, b, Object.keys(o.ach).filter(k => /^team/.test(k))]));
		A(JSON.stringify(o.normal) === '[0,0]' && JSON.stringify(o.mis) === '[10,10]', 'the team missions only count team runs (a 15-minute normal run left them at 0; this one: 10 minutes)', JSON.stringify(o));
		const spo = await spanishOn('#scr-over');
		A(spo.bad.length === 0, 'the result shows no Spanish in English mode', JSON.stringify(spo));
		await shot('team_over.png');
		await toMenu();
		await E(() => { G.Modes.prefs().mods = []; });
	}

	// ================= 8. persistence: account push, 409 merge, merge() =================
	if (!ONLY.length || ONLY.includes('8')) {
		const runs = await E(() => { G.DB.commit(true); return G.DB.save.stats.teamRuns; });
		A(runs >= 1 && await waitFor(() => ROW.save && ROW.save.stats && ROW.save.stats.teamRuns === runs && ROW.save.stats.teamBestMin === 10 && ROW.save.modes && JSON.stringify(ROW.save.modes.team) === '[7,1,4]', 8000),
			'the records and the team reach the account row (teamRuns, teamBestMin, modes.team)', JSON.stringify(ROW.save && { s: ROW.save.stats.teamRuns, m: ROW.save.modes }));
		const other = JSON.parse(JSON.stringify(ROW.save));
		delete other.stats.teamRuns; delete other.stats.teamBestMin; other.modes = { mods: [], type: 'fire', party: 25, team: [25, 4] };
		other.updated = Date.now() + 5000;
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => { const s = G.DB.save; return { runs: s.stats.teamRuns, best: s.stats.teamBestMin, team: s.modes.team, list: G.Team.list() }; });
		A(ROW.rev > rev0 && m.runs === runs && m.best === 10 && ROW.save.stats.teamBestMin === 10, 'a 409 from a newer save without the records merges them back (max per stat)', JSON.stringify(m));
		A(JSON.stringify(m.team) === '[25,4]' && JSON.stringify(m.list) === '[25,4,1]', 'the picked team follows the newer save (Pikachu, Charmander; filled with Bulbasaur)', JSON.stringify(m));
		const u = await E(() => {
			const base = () => JSON.parse(JSON.stringify(G.DB.save));
			const a = base(), b = base();
			a.updated = 2000; b.updated = 1000;
			a.stats.teamRuns = 3; b.stats.teamRuns = 9; a.stats.teamBestMin = 14; b.stats.teamBestMin = 6;
			a.modes.team = [7]; b.modes.team = [1, 4];
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			const bad = base(); bad.modes.team = [7, '7', 'x', 9999, -1, 4, 1, 25];
			const fixed = G.DB.merge(bad, null); G.DB.sanitize ? G.DB.sanitize(fixed) : G.Modes.sanitize(fixed);
			return { r1: [r1.stats.teamRuns, r1.stats.teamBestMin, r1.modes.team], r2: [r2.stats.teamRuns, r2.stats.teamBestMin, r2.modes.team], fixed: fixed.modes.team };
		});
		A(JSON.stringify(u.r1) === JSON.stringify(u.r2) && JSON.stringify(u.r1) === '[9,14,[7]]', 'merge() both ways: the max of each record, the newer save\'s team', JSON.stringify(u));
		A(JSON.stringify(u.fixed) === '[7,4,1]', 'a hand-edited team is cleaned (repeats, junk and unowned dropped, 3 at most)', JSON.stringify(u.fixed));
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
