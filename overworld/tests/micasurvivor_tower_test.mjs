// micasurvivor_tower_test.mjs — MicaSurvivor M5 batch 8: the Floor Tower, from the Godot Android port by
// JayElDragon (poke-survivor: main.gd 117-139 / 203-261 / 451-466 / 808-815 / 842-843 / 1035-1067 / 1143-1158 /
// 1348-1381 / 1834-1848 / 3154-3164 / 3189-3192 / 3286-3611 / 4174-4183 / 4493-4498 / 4706 / 5260 / 5371 /
// 8711-8720, save_data.gd 206-213, menu.gd 1601-1625, progress.gd 136-142 / 248 / 317 / 331), driven
// headlessly while logged in to a stubbed Magepunk account (the row micasurvivor:<user> with the server's
// compare-and-set):
//   - data: the port's numbers (30 floors, the boss at 50 s, x1.15 / x1.12 / x1.12 / x1.2, the adaptive caps,
//     6 pacts, 1 % legendary, rest 40 % / 25 % / 35 % shield, relics +6 HP / +2 %), the 15 risk cards and the 4
//     legendary ones with their exact effects, the 7 Tower achievements, the 2 missions, the Rock Z-crystal
//     mission, icons, English for every new string
//   - floors: each floor's fixed boss (legendary every 5, Eternatus 25, Arceus 30 with two bosses' HP), HP /
//     damage formulas, rewards, the difficulty time, the enemy cap, enemy scaling (normal / boss, adaptive)
//   - the mode screen: the Tower card (best floor, relics), "Starting floor" checkpoints by mouse, touch and pad
//   - a run: Z-move and Dynamax blocked, relics, XP x0.65, the floor clock and the HUD line, the boss at 50 s,
//     escorts, the floor clear (reward, claimed, towerBest, enemies cleared), the rest picker and the pact picker
//     by mouse, keys and pad (confirm / cancel = No risks), the shield, every pact and legendary effect FIRED,
//     the 6-pact cap, bonds at floors 10 / 20, Arceus's last breath, the clear screen, the fail screen
//   - checkpoints: unlocking, resuming from one (a free level-up per skipped floor), saved and merged (the
//     higher floor wins); persistence: the account push, a 409 merge, merge() both ways, sanitize()
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the mode entries, a Tower floor, the rest picker, the pact picker,
// the legendary (relic) card, the checkpoint button, the clear and fail screens, at desktop and phone width.
// Covers micasurvivor/js/systems/tower.js, js/ui/tower-ui.js, js/systems/modes.js, js/ui/modes-ui.js,
// js/game.js, js/systems/spawner.js, js/entities/enemy.js, js/entities/player.js, js/ui/hud.js, js/ui/run-ui.js,
// js/core/pad.js, js/core/db.js, js/systems/zmoves.js, js/systems/dynamax.js, js/data/achievements.js,
// js/data/missions.js, js/data/enemies.js, js/ui/icons.js, js/ui/ui.js, js/data/lang-en.js, index.html, css/style.css.
//   node overworld/tests/micasurvivor_tower_test.mjs
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
const PORT = 8832;
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
	localStorage.setItem('magepunk_mp_token_v1', 'tower-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'towertester' }));
	// every string the canvas really draws (after the English translation), to look for Spanish
	window.__drawn = new Set();
	addEventListener('DOMContentLoaded', () => {
		const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
		P.fillText = function (s, ...a) { if (window.G && G.I18n && window.__rec) window.__drawn.add(typeof s === 'string' ? G.I18n.t(s) : String(s)); return orig.call(this, s, ...a); };
	});
};

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|piso|pisos|torre|jefe|jefes|pacto|pactos|reliquia|reliquias|descanso|escudo|riesgo|riesgos|monedas|partida|elige|vida|superado|inicial|mejor|sin|cura|daño)\b/i;

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
	const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
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
	const toMenu = async () => {
		await waitFor(() => visible('scr-over'), 8000);
		await E(() => document.getElementById('btn-again').click());
		return waitFor(() => visible('scr-menu'), 8000);
	};
	const openModes = async () => { await E(() => G.ModesUI.open()); return waitFor(() => visible('scr-modes'), 4000); };
	const tapEl = async (sel) => { const b = await E(sel => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (b) await page.touchscreen.tap(b.x, b.y); return !!b; };
	const touchOn = on => cdp.send('Emulation.setTouchEmulationEnabled', { enabled: on, maxTouchPoints: 5 });
	// the run keeps running between page.evaluate calls: nothing may hurt us or level us up meanwhile
	const safe = () => E(() => { const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl._xm = pl._xm || pl.xpMul; pl.xpMul = 0; } G.EnemyMgr.clear(); });
	const startTower = async (how = 'click') => {
		await openModes();
		await sleep(150);
		if (how === 'click') await E(() => document.querySelector('#modes-list [data-mode=tower]').click());
		const ok = await waitFor(() => E(() => G.Game.state === 'playing' && G.Game.mode === 'tower'), 15000);
		await safe();
		await sleep(400);   // (the Tower's first frame: the checkpoint levels and "Floor N")
		return ok;
	};
	// kill the floor's boss: let the clock run out, then knock it down (the floor clears on the next frame)
	const killBoss = () => E(() => {
		const T = G.Tower;
		if (!T.boss) { T.debugT(T.BOSS_AT - 0.01); }
		return true;
	});

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.Tower && !!G.TowerUI), 30000), 'boots logged in (Magepunk account); G.Tower loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await E(() => {
		const s = G.DB.save;
		s.owned = { 4: { at: 1000, from: 'starter' }, 1: { at: 2000, from: 'gacha' } };
		s.partner = 4; s.partnerShiny = false; s.modes = {};
		s.stats.dens = 1; s.stats.dynamax = 1; s.stats.tk_fire = 300;   // Dynamax and the Fire Z-move unlocked (to show the Tower blocks them)
		G.DB.commit(true);
		// every banner, in English (a later one, e.g. the new floor's biome, may replace it on screen)
		window.__says = [];
		const say = G.Spawner.say;
		G.Spawner.say = (t, ...a) => { window.__says.push(G.I18n.t(t)); return say(t, ...a); };
	});
	const says = () => E(() => window.__says.slice());

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const T = G.Tower, md = G.MissionDefs.BY;
			const strings = [
				'Torre de pisos', '30 pisos, cada uno con un jefe fijo. Cada piso da un premio la primera vez y cada 5 pisos ganas una reliquia permanente (+6 de vida y +2% de ataque dentro de la Torre). Entre pisos eliges descanso y pactos de riesgo. Mejor piso: 7 · Reliquias: 1 / 6.',
				'Piso inicial: 11', 'Piso 3', 'Piso 3 / 30', 'Piso 7: Gyarados', 'Jefe en 12s', '¡Jefe!', 'Pactos: 2', 'Sed de victoria +1.5%', 'Escudo',
				'¡Piso 4 superado!', '¡Piso 4 superado! +280 monedas', '¡Piso 5 superado! +320 monedas · ¡Reliquia de la Torre!', '¡Piso 10 superado! Obtienes un vínculo de ataque',
				'¡Arceus lo da todo!', 'Torre: piso 3', 'Jefes (piso: tiempo, vida perdida) 3: 20 s, -15% | 4: 31 s, -2%', '¡TORRE COMPLETA!', 'Pisos superados: 30',
				'Elige cómo descansar', 'Piso 4 superado', 'Recuperas el 40% de tu vida.', 'Recuperas el 22% de tu vida.', 'Un pacto: gran poder, a cambio de un coste', 'Cartas de riesgo', 'Pacto sellado: Frenesí', '+PS',
				...T.REST_CARDS.flatMap(c => [c.title, c.tag, c.desc || '']).filter(Boolean), T.SKIP.title, T.SKIP.tag, T.SKIP.desc, 'Riesgo', 'Legendaria',
				...T.RISKS.concat(T.LEGENDS).flatMap(c => [c.name, c.desc]),
				...['tower5', 'tower10', 'tower15', 'tower20', 'tower30', 'towerArceus', 'towerRuns10'].flatMap(id => { const a = G.AchDefs.BY[id]; return a ? [a.name, a.desc, a.title || ''].filter(Boolean) : ['missing ' + id]; }),
				md.mTower ? md.mTower.text(3) : 'missing mTower', md.wTower ? md.wTower.text(9) : 'missing wTower'];
			return {
				k: { floors: T.FLOORS, bossAt: T.BOSS_AT, k: T.K, adapt: T.ADAPT, max: T.MAX_RISKS, legend: T.LEGEND_CHANCE, offer: T.OFFER, rest: T.REST, relic: T.RELIC, relicsMax: T.RELICS_MAX, bonds: T.BOND_FLOORS, last: T.LAST, reap: T.REAP, surge: T.SURGE },
				risks: T.RISKS.map(r => [r.id, r.fx]), legends: T.LEGENDS.map(r => [r.id, r.fx]),
				icons: T.RISKS.concat(T.LEGENDS).map(r => r.icon).concat(T.REST_CARDS.map(c => c.icon), [T.SKIP.icon, 'm_tower']).filter(i => !/^<img/.test(G.Icons.html(i, 16))),
				list: G.Modes.LIST, name: G.I18n.t(G.Modes.NAME.tower), icon: G.Modes.ICON.tower,
				ach: ['tower5', 'tower10', 'tower15', 'tower20', 'tower30', 'towerArceus', 'towerRuns10'].map(id => { const a = G.AchDefs.BY[id]; return a && [a.id, a.tier, a.goal, a.reward, a.title || '', a.value({ stats: { towerBest: 29, arceus: 1, towerRuns: 10 } })]; }),
				mis: [md.mTower && [md.mTower.goals, md.mTower.reward, md.mTower.mode, G.MissionDefs.daily.includes(md.mTower)], md.wTower && [md.wTower.goals, md.wTower.reward, md.wTower.mode, G.MissionDefs.weekly.includes(md.wTower)]],
				rock: G.ZMoves.ZMIS.find(z => z.type === 'rock'),
				en: strings.map(s => [s, G.I18n.t(s)]),
			};
		});
		A(JSON.stringify(r.k) === JSON.stringify({ floors: 30, bossAt: 50, k: { hp: 1.15, dmg: 1.12, spawn: 1.12, bossHp: 1.2, xp: 0.65 }, adapt: { hp: 0.01, hpP: 0.004, dmg: 0.004, dmgP: 0.002, maxHp: 1, maxDmg: 0.4, maxBoss: 1.5, every: 2 },
			max: 6, legend: 0.01, offer: 3, rest: { heal: 0.4, healLate: 0.25, lateAfter: 21, shield: 0.35 }, relic: { hp: 6, atk: 0.02, every: 5 }, relicsMax: 6, bonds: [10, 20], last: { at: 0.25, spd: 1.1, n: 14 }, reap: 0.003,
			surge: { first: 40, afterClear: 30, from: 10, base: 46, step: 1.5, min: 16, n: 8, chaosFrom: 20 } }),
			'the port\'s numbers: 30 floors, the boss at 50 s, x1.15 HP / x1.12 dmg / x1.12 spawns / x1.2 boss HP / x0.65 XP, the adaptive caps, 6 pacts, 1 % legendary, rest 40 % (25 % from 22) / 35 % shield, relics +6 HP +2 %', JSON.stringify(r.k));
		A(JSON.stringify(r.risks) === JSON.stringify([['frenzy', { cd: 0.8, taken: 1.2 }], ['glass', { atk: 1.2, maxhp: 0.85 }], ['swift', { spd: 1.2, espd: 1.1 }], ['blood', { killheal: 2, bossdmg: 1.2 }],
			['scholar', { xp: 1.5, ehp: 1.2 }], ['stone', { taken: 0.75, spd: 0.85 }], ['contract', { coins: 1.5, bossHp: 1.25 }], ['fast', { atk: 1.15, healmul: 0.55 }], ['swarm', { atk: 1.12, xp: 1.2, spawn: 1.3 }],
			['quick', { cd: 0.7, atk: 0.9 }], ['heavy', { atk: 1.22, cd: 1.2 }], ['overclock', { cd: 0.75, maxhp: 0.9 }], ['metronome', { cd: 0.8, spawn: 1.15 }], ['slowburn', { cd: 1.15, taken: 0.75, regen: 1 }],
			['berserk', { cd: 0.85, atk: 1.1, taken: 1.1 }]]), 'the 15 risk cards of main.gd 223-239 with their exact effects', JSON.stringify(r.risks));
		A(JSON.stringify(r.legends) === JSON.stringify([['l_time', { cd: 0.3 }], ['l_bag', { carry: 1 }], ['l_reap', { reap: 1 }], ['l_armor', { def: 0.6 }]]), 'the 4 legendary cards of main.gd 242-247', JSON.stringify(r.legends));
		A(r.icons.length === 0, 'every card has its port icon (icons.gd EXTRA r_* / contract / m_tower)', JSON.stringify(r.icons));
		A(r.list.includes('tower') && r.name === 'Floor Tower' && r.icon === 'm_tower', 'a "Floor Tower" mode with its icon', JSON.stringify([r.list, r.name]));
		A(JSON.stringify(r.ach) === JSON.stringify([['tower5', 1, 5, { coins: 800, t1: 3, t10: 1 }, '', 29], ['tower10', 2, 10, { coins: 2000, t1: 4, t10: 2 }, '', 29], ['tower15', 3, 15, { coins: 4000, t1: 5, t10: 3 }, '', 29],
			['tower20', 3, 20, { coins: 7000, t1: 6, t10: 4 }, 'Escalador', 29], ['tower30', 3, 29, { coins: 15000, t1: 10, t10: 8 }, 'Dueño de la Torre', 29], ['towerArceus', 3, 1, { coins: 30000, t1: 15, t10: 15 }, 'Vencedor de Arceus', 1],
			['towerRuns10', 2, 10, { coins: 1200, t10: 1 }, '', 10]]), 'the 7 Tower achievements of progress.gd 136-142 (towerBest 5 / 10 / 15 / 20 / 29, arceus, towerRuns), the port\'s rewards and titles', JSON.stringify(r.ach));
		A(JSON.stringify(r.mis) === JSON.stringify([[[2, 3], { t1: 3, coins: 350 }, 'max', true], [[6, 9], { t1: 4, t10: 1, coins: 1300 }, 'max', true]]), 'the Tower missions of progress.gd 317 / 331 (floors cleared: daily 2 / 3, weekly 6 / 9)', JSON.stringify(r.mis));
		A(r.rock && r.rock.stat === 'towerBest' && r.rock.goal === 8, 'the Rock Z-crystal mission reads towerBest (clear floor 8)', JSON.stringify(r.rock));
		const bad = r.en.filter(([es, en]) => es === en || SPANISH.test(en.replace(/Pok[ée]mon/g, '').replace(/Gyarados|Arceus/g, '')));
		A(bad.length === 0, `every new string has English (the port's lang_en.json wording; ${r.en.length} checked)`, JSON.stringify(bad));
		const en = Object.fromEntries(r.en);
		A(en['Piso inicial: 11'] === 'Starting floor: 11' && en['Piso 7: Gyarados'] === 'Floor 7: Gyarados' && en['¡Piso 5 superado! +320 monedas · ¡Reliquia de la Torre!'] === 'Floor 5 cleared! +320 coins · Tower relic!' && en['Pacto sellado: Frenesí'] === 'Pact sealed: Frenzy',
			'patterns fill their holes (Starting floor: 11 · Floor 7: Gyarados · Floor 5 cleared! +320 coins · Tower relic! · Pact sealed: Frenzy)', JSON.stringify([en['Piso inicial: 11'], en['Piso 7: Gyarados']]));
	}

	// ================= 2. floors: bosses, scaling, rewards =================
	if (!ONLY.length || ONLY.includes('2')) {
		const r = await E(() => {
			const T = G.Tower, out = { bad: [] };
			const want = f => {
				let hp = 900 * Math.pow(1.2, Math.min(f, 15) - 1) * Math.pow(1.07, Math.max(0, f - 15));
				const dm = Math.min(120, 26 + 4.5 * f);
				hp *= 1.8 + 3.2 * Math.min(1, Math.max(0, (f - 5) / 25));
				return { hp, dm };
			};
			for (let f = 1; f <= 30; f++) {
				const d = T.def(f, 10), w = want(f);
				let hp = w.hp;
				if (f === 30) hp = (hp + T.def(25).hp / 1.35) * 1.25;
				const p = G.DEX_BY[d.dex];
				const lo = Math.min(640, 380 + f * 11);
				const okPool = f === 25 || f === 30 || (f % 5 === 0 ? p.leg : !p.leg && p.bst >= lo && p.bst <= lo + 110);
				if (d.hp !== Math.round(hp * 1.35) || d.dmg !== Math.round(w.dm * 1.2) || d.shotDmg !== Math.round(w.dm * 0.55) || !okPool || T.def(f, 10).dex !== d.dex || !G.SPRITE_META[d.dex] || d.xp !== G.Player.xpFor(10) * 1.25 || d.final !== (f === 30))
					out.bad.push([f, d.dex, d.hp, Math.round(hp * 1.35), okPool]);
			}
			out.d25 = T.def(25).dex; out.d30 = T.def(30).dex; out.hp1 = T.def(1).hp; out.hp30 = T.def(30).hp; out.hp29 = T.def(29).hp;
			out.legs = [5, 10, 15, 20].map(f => G.DEX_BY[T.def(f).dex].leg);
			out.rewards = [1, 4, 5, 10, 29, 30].map(f => T.reward(f));
			out.repeat = [1, 30].map(T.repeatCoins);
			return out;
		});
		A(r.bad.length === 0, 'every floor 1-30: HP 900 x 1.2^(min(f,15)-1) x 1.07^(f-15) x (1.8 + 3.2 clamp((f-5)/25)) x 1.35, damage min(120, 26 + 4.5f) x 1.2, shot x0.55, XP = your level\'s x1.25, the BST window (380 + 11f, +110) and the same boss every time', JSON.stringify(r.bad.slice(0, 4)));
		A(r.d25 === 890 && r.d30 === 493 && r.legs.every(Boolean), 'legendary bosses on floors 5 / 10 / 15 / 20, Eternatus on 25 and Arceus on 30', JSON.stringify(r));
		A(r.hp1 === Math.round(900 * 1.8 * 1.35) && r.hp30 > r.hp29 * 1.5, 'floor 1 boss: 2187 HP; Arceus carries two bosses\' HP (+25 %)', JSON.stringify([r.hp1, r.hp29, r.hp30]));
		A(JSON.stringify(r.rewards) === JSON.stringify([{ coins: 160, t1: 1 }, { coins: 280, t1: 1 }, { coins: 320, t1: 2, t10: 1 }, { coins: 520, t1: 3, t10: 2 }, { coins: 1280, t1: 6 }, { coins: 1320, t1: 7, t10: 6 }]) && JSON.stringify(r.repeat) === '[50,340]',
			'first-clear rewards 120 + 40f coins, 1 + f/5 tickets, f/5 x10 tickets every 5 floors; a repeat clear 40 + 10f coins', JSON.stringify(r));
	}

	// ================= 3. the mode screen: card, checkpoints (mouse, touch, pad) =================
	if (!ONLY.length || ONLY.includes('3')) {
		await page.click('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 4000), 'the menu\'s Game modes opens "Choose a mode"');
		await sleep(300);
		const c = await E(() => ({ cards: [...document.querySelectorAll('#modes-list [data-mode]')].map(b => b.dataset.mode), card: document.querySelector('#modes-list [data-mode=tower]').innerText, start: !!document.getElementById('modes-tower-start') }));
		A(c.cards.join() === 'normal,daily,rush,party,coop,tower,rifts,type,team' && /Floor Tower/.test(c.card) && /30 floors, each with a fixed boss/.test(c.card) && /Best floor: 0 · Relics: 0 \/ 6\./.test(c.card) && !c.start,
			'the Tower card in the port\'s menu order (after Party), in its words, best floor 0 and relics 0 / 6; no "Starting floor" without a checkpoint', JSON.stringify(c));
		const sp = await spanishOn('#scr-modes');
		A(sp.bad.length === 0, 'the modes screen shows no Spanish in English mode', JSON.stringify(sp));
		await shot('tower_modes_entry.png');
		// unlock checkpoints 6 and 11 (floors 5 and 10 cleared once), plus a cleared floor 7
		await E(() => { const s = G.DB.save; s.tower = { claimed: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 10: 10 }, best: 10, log: [] }; G.DB.commit(); G.ModesUI.render(); });
		await sleep(200);
		const c2 = await E(() => ({ card: document.querySelector('#modes-list [data-mode=tower]').innerText, btn: (document.getElementById('modes-tower-start') || {}).innerText, cps: G.Tower.checkpoints(), relics: G.Tower.relics() }));
		A(JSON.stringify(c2.cps) === '[1,6,11]' && c2.relics === 2 && /Best floor: 10 · Relics: 2 \/ 6\./.test(c2.card) && /Starting floor: 1/.test(c2.btn || ''),
			'floors 5 and 10 cleared: checkpoints 1 / 6 / 11, 2 relics, and the "Starting floor: 1" button', JSON.stringify(c2));
		await page.click('#modes-tower-start');
		await sleep(150);
		const c3 = await E(() => ({ btn: document.getElementById('modes-tower-start').innerText, saved: G.DB.save.modes.towerStart }));
		A(/Starting floor: 6/.test(c3.btn) && c3.saved === 6, 'a click cycles to floor 6 (saved in save.modes.towerStart)', JSON.stringify(c3));
		await shot('tower_checkpoint_button.png');
		// touch (phone width)
		await E(() => document.querySelector('#scr-modes [data-back]').click());
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await touchOn(true);
		await sleep(500);
		await tapEl('#scr-menu [data-go=modes]');
		await waitFor(() => visible('scr-modes'), 3000);
		await sleep(300);
		await tapEl('#modes-tower-start');
		await sleep(200);
		const tt = await E(() => ({ saved: G.DB.save.modes.towerStart, over: [...document.querySelectorAll('#modes-list .mode-card, #modes-list .mode-sub')].filter(el => { const b = el.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).length, scroll: document.documentElement.scrollWidth <= innerWidth + 1 }));
		A(tt.saved === 11 && tt.over === 0 && tt.scroll, 'a tap cycles to 11 on a phone; nothing on the modes screen overflows at 844x390', JSON.stringify(tt));
		await E(() => document.querySelector('#modes-list [data-mode=tower]').scrollIntoView({ block: 'center' }));
		await sleep(150);
		await shot('tower_modes_entry_phone.png');
		await E(() => document.querySelector('#scr-modes [data-back]').click());
		await touchOn(false);
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(400);
		// pad
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(13); await sleep(150);
		A(await navTo('#scr-menu [data-go=modes]'), 'the D-pad reaches "Game modes"');
		await press(1);
		A(await waitFor(() => visible('scr-modes'), 3000), 'confirm opens the modes screen');
		await sleep(300);
		A(await navTo('#modes-tower-start'), 'the D-pad reaches "Starting floor"');
		await press(1);
		await sleep(200);
		const pp = await E(() => G.DB.save.modes.towerStart);
		A(pp === 1, 'confirm cycles it (11 -> back to 1)', pp);
		A(await navTo('#modes-list [data-mode=tower]'), 'the D-pad reaches the Tower card');
		await press(0);
		A(await waitFor(() => visible('scr-menu'), 2000), 'cancel returns to the menu');
		await E(() => { window.__pads[0] = null; });
		await sleep(300);
	}

	// ================= 4. a Tower run: blocks, relics, the floor, the boss, the clear =================
	if (!ONLY.length || ONLY.includes('4')) {
		await E(() => { const s = G.DB.save; s.tower = { claimed: { 5: 5, 10: 10 }, best: 10, log: [] }; G.Modes.prefs().towerStart = 1; G.Modes.prefs().mods = []; G.DB.commit(); });
		A(await startTower(), 'a click on the Tower card starts a Tower run');
		const r0 = await E(() => {
			const pl = G.Game.player, T = G.Tower, mon = G.DEX_BY[pl.dex];
			pl.level = 25;
			return { mode: G.Game.mode, on: T.on, floor: T.floor, relics: T.relicN, maxHp: pl.maxHp, base: mon.hp + (G.Upgrades.perks(G.DB.upgradesOf(pl.dex)).hp || 0), atkMul: pl.atkMul, xpMul: pl._xm,
				z: G.ZMoves.blocked(), zTry: G.ZMoves.tryStart(pl), dyn: G.Dynamax.blocked(), dynTry: G.Dynamax.tryStart(pl), zType: G.ZMoves.activeType ? G.ZMoves.activeType(pl) : 'fire', zBtn: G.ZMoves.can(pl), dynBtn: G.Dynamax.can(pl) };
		});
		A(r0.mode === 'tower' && r0.on && r0.floor === 1, 'mode "tower", floor 1', JSON.stringify(r0));
		A(r0.relics === 2 && r0.maxHp === r0.base + 12 && near(r0.atkMul, 1.04, 1e-9) && near(r0.xpMul, 0.65, 1e-9), '2 relics: +12 max HP and x1.04 attack; experience x0.65 (main.gd 462-465 / 5260)', JSON.stringify(r0));
		A(r0.z && r0.zTry === false && r0.dyn && r0.dynTry === false && !r0.zBtn && !r0.dynBtn, 'Z-move and Dynamax are blocked in the Tower at level 25 with both unlocked (main.gd 1243 / 1267)', JSON.stringify(r0));
		// the floor clock and the HUD line
		await E(() => { window.__rec = true; G.Tower.debugT(37.2); });
		await sleep(400);
		const h = await E(() => ({ line: G.Tower.hudLine(), t: G.Tower.t, boss: !!G.Tower.boss }));
		A(/^Floor 1 \/ 30  ·  Boss in 1[23]s$/.test(h.line) && !h.boss, 'the HUD line under the clock: "Floor 1 / 30 · Boss in 13s" (main.gd 8711-8716)', JSON.stringify(h));
		await shot('tower_floor.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(500);
		await shot('tower_floor_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		// the boss at 50 s
		await E(() => { G.Tower.debugT(49.99); G.Game.player.invuln = 1e9; });
		await waitFor(() => E(() => !!G.Tower.boss), 3000);
		const b = await E(() => {
			const T = G.Tower, e = T.boss, d = T.def(1, G.Game.player.level);
			return { dex: e.dex, want: d.dex, hp: e.maxHp, def: d.hp, sc: 1 + 15 / 600, k: T.K.bossHp * Math.min(T.adaptHp, T.ADAPT.maxBoss), adapt: T.adaptHp, line: T.hudLine(), banner: G.I18n.t((G.Spawner.banner() || {}).text || ''), name: G.I18n.t(d.name) };
		});
		A(b.dex === b.want && near(b.hp, Math.round(Math.round(b.def * b.sc) * b.k), 1.5), 'at 50 s the floor\'s fixed boss appears, created at t = 15 x floor and x1.2 x adaptive boss HP (main.gd 3362-3368 / 3160)', JSON.stringify(b));
		A(/  ·  Boss!$/.test(b.line) && b.banner === 'Floor 1: ' + b.name, 'the HUD says "Boss!" and the banner "Floor 1: <boss>"', JSON.stringify(b));
		await shot('tower_boss.png');
		// knock it down: the floor clear
		const pre = await E(() => { const s = G.DB.save; G.Game.player.hp = G.Game.player.maxHp * 0.5; return { coins: s.coins, t1: s.tickets.t1, t10: s.tickets.t10, best: s.stats.towerBest || 0, ach: Object.keys(s.ach || {}) }; });
		await E(ach => { window.__preAch = ach; for (let i = 0; i < 6; i++) G.Spawner.spawnOne(G.Game.player, G.Tower.dt()); G.Tower.boss.hurt(1e9); }, pre.ach);
		A(await waitFor(() => visible('scr-tower'), 4000), 'the boss falls: the floor is cleared and the rest screen opens');
		const cl = await E(() => {
			const s = G.DB.save, T = G.Tower;
			const nw = Object.keys(s.ach || {}).filter(k => !window.__preAch.includes(k)).map(k => (G.AchDefs.BY[k] || {}).reward || {});
			return { bonusC: nw.reduce((n, r) => n + (r.coins || 0), 0), bonusT: nw.reduce((n, r) => n + (r.t1 || 0), 0), bosses: G.Game.player.bosses, bossKills: s.stats.bossesTotal || 0, coins: s.coins, t1: s.tickets.t1, claimed: Object.keys(s.tower.claimed), best: s.tower.best, stat: s.stats.towerBest, floor: T.floor, clears: T.clears, alive: G.EnemyMgr.count, state: G.Game.state, phase: T.phase,
				cards: [...document.querySelectorAll('#tower-cards .card')].map(c => c.dataset.id), title: document.getElementById('tower-title').innerText, sub: document.getElementById('tower-sub').innerText,
				log: s.tower.log.length, banner: G.I18n.t((G.Spawner.banner() || {}).text || '') };
		});
		A(cl.coins - pre.coins - cl.bonusC === 160 && cl.t1 - pre.t1 - cl.bonusT === 1 && cl.claimed.includes('1') && cl.stat === 1 && cl.best === 10, 'first clear of floor 1: +160 coins, +1 ticket (besides any achievement the boss kill unlocks), floor 1 claimed, stats.towerBest 1; the record keeps best floor 10', JSON.stringify([cl, pre]));
		A(cl.bosses === 1 && cl.bossKills >= 1, 'the floor boss counts as a boss defeated (run, stats, missions) before the floor is cleaned up', JSON.stringify(cl));
		A(cl.floor === 2 && cl.clears === 1 && cl.alive === 0 && cl.state === 'choice' && cl.phase === 1 && cl.log === 1, 'next floor 2, the floor\'s enemies are cleared, the game waits for the rest pick, the boss log is kept', JSON.stringify(cl));
		A(JSON.stringify(cl.cards) === '["heal","up","shield"]' && cl.title === 'Choose how to rest' && cl.sub === 'Floor 1 cleared', 'the rest picker: Rest / Training / Shield, "Choose how to rest", "Floor 1 cleared"', JSON.stringify(cl));
		const spr = await spanishOn('#scr-tower');
		A(spr.bad.length === 0, 'the rest picker shows no Spanish in English mode', JSON.stringify(spr));
		await shot('tower_rest_picker.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(300);
		const fit = await E(() => { const box = document.querySelector('#scr-tower .box').getBoundingClientRect(); const cards = [...document.querySelectorAll('#tower-cards .card')].map(c => c.getBoundingClientRect()); return { inside: cards.every(c => c.left >= 0 && c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1 && c.top >= 0), box: [box.top, box.bottom, innerHeight] }; });
		A(fit.inside, 'phone width (844x390): the three rest cards fit on screen', JSON.stringify(fit));
		await shot('tower_rest_picker_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		// pick Rest by keyboard (1): +40 % HP
		const hp0 = await E(() => G.Game.player.hp);
		await page.keyboard.press('Digit1');
		await sleep(250);
		const rs = await E(() => ({ hp: G.Game.player.hp, max: G.Game.player.maxHp, phase: G.Tower.phase, kind: G.TowerUI.kind, open: G.TowerUI.open, cards: [...document.querySelectorAll('#tower-cards .card')].map(c => c.dataset.id), title: document.getElementById('tower-title').innerText, sub: document.getElementById('tower-sub').innerText }));
		A(near(rs.hp, Math.min(rs.max, hp0 + rs.max * 0.4), 0.01), 'key 1 picks Rest: +40 % of max HP (floor <= 21)', JSON.stringify([hp0, rs]));
		A(rs.phase === 2 && rs.kind === 'risk' && rs.cards.length === 4 && rs.cards[3] === 'skip' && rs.title === 'A pact: great power, at a cost' && rs.sub === 'Risk cards',
			'then the pact picker: 3 risk cards and "No risks", "A pact: great power, at a cost"', JSON.stringify(rs));
		const spk = await spanishOn('#scr-tower');
		A(spk.bad.length === 0, 'the pact picker shows no Spanish in English mode', JSON.stringify(spk));
		await shot('tower_pact_picker.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(300);
		const fit2 = await E(() => { const cards = [...document.querySelectorAll('#tower-cards .card')].map(c => c.getBoundingClientRect()); const sc = document.getElementById('scr-tower'); return { inside: cards.every(c => c.left >= 0 && c.right <= innerWidth + 1), reach: sc.scrollHeight <= sc.clientHeight + 2 || getComputedStyle(sc).overflowY !== 'hidden' }; });
		A(fit2.inside && fit2.reach, 'phone width: the four pact cards fit across and can all be reached', JSON.stringify(fit2));
		await shot('tower_pact_picker_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		// the pad: cancel = "No risks"
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(15); await sleep(500);
		const foc = await E(() => { const f = document.querySelector('.pad-focus'); return f ? f.closest('#tower-cards') ? f.dataset.id : 'out:' + f.id : null; });
		A(foc && !/^out/.test(foc), 'the pad\'s focus lands on a pact card', foc);
		await press(5); await sleep(200);   // RB: the next card
		const foc2 = await E(() => { const f = document.querySelector('.pad-focus'); return f && f.dataset.id; });
		A(foc2 && foc2 !== foc, 'RB walks to the next card (as on the level-up cards)', JSON.stringify([foc, foc2]));
		await E(() => { window.__says = []; });
		await press(0);   // Nintendo: bottom face = back
		await sleep(300);
		const sk = await E(() => ({ open: G.UI.isOpen('scr-tower'), risks: G.Tower.risks, phase: G.Tower.phase, state: G.Game.state, floor: G.Tower.floor, says: window.__says.slice(), biome: G.World.biomeName(), want: G.Tiles.BIOMES[1].name }));
		A(!sk.open && sk.risks.length === 0 && sk.phase === 0 && sk.state === 'playing' && sk.says[0] === 'Floor 2', 'cancel picks "No risks": no pact, the run goes on ("Floor 2")', JSON.stringify(sk));
		A(sk.biome === sk.want && sk.says.some(t => /^— .+ —$/.test(t)), 'each floor has its own biome (floor 2: the second; main.gd 4706)', JSON.stringify(sk));
		await safe();
		// floor 2: Training by pad confirm, then a pact by confirm
		await killBoss();
		await waitFor(() => E(() => !!G.Tower.boss), 3000);
		await E(() => { G.Tower.boss.hurt(1e9); });
		await waitFor(() => visible('scr-tower'), 4000);
		await sleep(500);
		A(await navTo('#tower-cards .card[data-id="up"]'), 'the D-pad reaches "Training"');
		const pl0 = await E(() => G.Game.pendingLevels);
		await press(1);
		await sleep(300);
		const tr = await E(() => ({ pending: G.Game.pendingLevels, kind: G.TowerUI.kind }));
		A(tr.pending === pl0 + 1 && tr.kind === 'risk', 'confirm picks Training: one extra level-up card waits (main.gd 3549)', JSON.stringify([pl0, tr]));
		const pick = await E(() => [...document.querySelectorAll('#tower-cards .card')].map(c => c.dataset.id)[0]);
		await navTo(`#tower-cards .card[data-id="${pick}"]`);
		await E(() => { window.__says = []; });
		await press(1);
		await sleep(300);
		const pk = await E(() => ({ risks: G.Tower.risks, says: window.__says.slice(), name: G.I18n.t(G.Tower.BY[G.Tower.risks[0]] ? G.Tower.BY[G.Tower.risks[0]].name : '') }));
		A(pk.risks.length === 1 && pk.risks[0] === pick && pk.says[0] === 'Pact sealed: ' + pk.name && pk.says[1] === 'Floor 3', 'confirm on a risk card seals that pact ("Pact sealed: …", then "Floor 3")', JSON.stringify(pk));
		await E(() => { window.__pads[0] = null; });
		await sleep(300);
		// the level-up card from Training comes after the rest
		await waitFor(() => visible('scr-levelup'), 4000);
		await E(() => { const c = document.querySelector('#cards .card'); if (c) c.click(); });
		await waitFor(() => E(() => G.Game.state === 'playing'), 3000);
		await safe();
		await E(() => G.Game.quit());
		await toMenu();
	}

	// ================= 5. every pact and legendary card, fired =================
	if (!ONLY.length || ONLY.includes('5')) {
		await E(() => { G.Modes.prefs().towerStart = 1; G.DB.commit(); });
		await startTower();
		const r = await E(() => {
			const T = G.Tower, pl = G.Game.player, out = {};
			const mkEnemy = (boss) => { const d = boss ? T.def(1) : G.Enemies.cast[0].list[0]; const e = new G.Enemy(d, pl.x + 3000, pl.y, { hp: 1000, spd: 1, dmg: 1 }, boss);  /* (big numbers: rounding to whole HP stays tiny) */ const hp0 = e.maxHp, spd0 = e.spd, dmg0 = e.dmg; T.enemyAdded(e); return { hp: e.maxHp / hp0, spd: e.spd / spd0, dmg: e.dmg / dmg0 }; };
			const hit = () => { pl.invuln = 0; const h = pl.hp = pl.maxHp; pl.hurt(5); const d = h - pl.hp; pl.invuln = 1e9; pl.hp = pl.maxHp; return d; };
			const snap = () => ({ atk: pl.atkMul, spd: pl.spdMul, cd: pl.cdMul, xp: pl.xpMul, red: pl.dmgReduce, regen: pl.regenFlat, maxHp: pl.maxHp, hp: pl.hp, slots: pl.itemSlots(),
				taken: hit(), en: mkEnemy(false), boss: mkEnemy(true), rate: T.rate(), coins: T.rk('coins'), heal: T.healK(), kh: T.rkAdd('killheal') });
			pl.xpMul = 1;
			const ratio = (a, b) => Math.round(b / a * 1e6) / 1e6;
			for (const c of T.RISKS.concat(T.LEGENDS)) {
				if (c.id === 'l_bag') continue;   // (below, through the real picker)
				const a = snap();
				pl.hp = pl.maxHp * 0.6;
				const frac = pl.hp / pl.maxHp;
				T.apply(pl, c.id);
				const fracAfter = pl.hp / pl.maxHp;
				const b = snap();
				out[c.id] = { atk: ratio(a.atk, b.atk), spd: ratio(a.spd, b.spd), cd: ratio(a.cd, b.cd), xp: ratio(a.xp, b.xp), def: Math.round((b.red - a.red) * 1e6) / 1e6, regen: Math.round((b.regen - a.regen) * 1e6) / 1e6,
					maxhp: ratio(a.maxHp, b.maxHp), frac: [Math.round(frac * 1000) / 1000, Math.round(fracAfter * 1000) / 1000], taken: ratio(a.taken, b.taken),
					ehp: ratio(a.en.hp, b.en.hp), espd: ratio(a.en.spd, b.en.spd), bossHp: ratio(a.boss.hp, b.boss.hp), bossdmg: ratio(a.boss.dmg, b.boss.dmg) / ratio(a.en.dmg, b.en.dmg), bossspd: ratio(a.boss.spd, b.boss.spd),
					spawn: ratio(a.rate, b.rate), coins: ratio(a.coins, b.coins), heal: ratio(a.heal, b.heal), killheal: b.kh - a.kh };
				if (c.id === 'berserk') { const mr = Math.random; Math.random = () => 0.5; out.cap = { count: T.riskCount(), cards: T.riskCards().map(x => x.id) }; Math.random = mr; }
			}
			return out;
		});
		const one = v => near(v, 1, 1e-6);
		const expect = (id, fx) => {
			const o = r[id]; if (!o) return false;
			const keys = { atk: 'atk', spd: 'spd', cd: 'cd', xp: 'xp', maxhp: 'maxhp', taken: 'taken', ehp: 'ehp', espd: 'espd', bossHp: 'bossHp', bossdmg: 'bossdmg', spawn: 'spawn', coins: 'coins', healmul: 'heal' };
			for (const [k, f] of Object.entries(keys)) {
				const want = fx[k] != null ? fx[k] : 1;
				let got = o[f];
				if (k === 'espd' && fx.espd) { if (!near(o.espd, fx.espd, 1e-6) || !near(o.bossspd, 1 + (fx.espd - 1) * 0.5, 1e-3)) return false; continue; }
				if (k === 'taken' && fx.def) continue;   // (more defense also means less damage: checked as def)
				if (!near(got, want, k === 'maxhp' ? 0.01 : 1e-4)) return false;   // (max HP is rounded)
			}
			if (!near(o.def, fx.def || 0, 1e-6) || !near(o.regen, fx.regen || 0, 1e-6) || !near(o.killheal, fx.killheal || 0, 1e-6)) return false;
			if (fx.maxhp && Math.abs(o.frac[0] - o.frac[1]) > 0.01) return false;
			return true;
		};
		const T = await E(() => G.Tower.RISKS.concat(G.Tower.LEGENDS).map(c => [c.id, c.fx]));
		for (const [id, fx] of T) {
			if (id === 'l_bag' || id === 'l_reap' || id === 'blood') continue;
			A(expect(id, fx), `pact "${id}" measurably does exactly ${JSON.stringify(fx)} (player stats, a real hit, new enemies and bosses, the spawn rate, coins, heals)`, JSON.stringify(r[id]));
		}
		A(expect('blood', { killheal: 2, bossdmg: 1.2 }) && expect('l_reap', {}), 'Blood pact (bosses x1.2 damage, +2 killheal) and Thirst for victory are set up (their kills are fired below)', JSON.stringify([r.blood, r.l_reap]));
		A(r.cap && r.cap.count === 15 && r.cap.cards.length === 0, 'with 6 or more pacts no more risk cards are offered (main.gd 3507; here all 15 sealed by hand)', JSON.stringify(r.cap));
		// the kill-driven ones: Blood pact heals 2 HP a kill, Thirst for victory +0.30 % damage a kill
		const k = await E(() => {
			const pl = G.Game.player, T = G.Tower;
			pl.hp = 20; const atk0 = pl.atkMul, t0 = performance.now();
			const e = G.Spawner.spawnOne(pl, T.dt()); e.hurt(1e9);
			const e2 = G.Spawner.spawnOne(pl, T.dt()); e2.hurt(1e9);
			return new Promise(res => setTimeout(() => res({ hp: pl.hp, regen: pl.regen * (performance.now() - t0) / 1000, reap: T.reap, atk: pl.atkMul / atk0, line: T.hudLine() }), 300));
		});
		A(k.hp >= 24 - 0.01 && k.hp <= 24 + k.regen + 0.01 && k.reap === 2 && near(k.atk, (1 + 0.006) / 1, 1e-9) && /Thirst for victory \+0\.6%/.test(k.line), 'two kills: +2 HP each (Blood pact), damage x1.006 and "Thirst for victory +0.6%" on the HUD (main.gd 4493-4498)', JSON.stringify(k));
		// heals with Fasting: a berry heals 30 % x 0.55
		const hb = await E(() => { const pl = G.Game.player; pl.hp = 10; G.Game.debugCollect({ kind: 'heal', value: 0 }); return { got: pl.hp - 10, want: pl.maxHp * 0.3 * 0.55, rest: G.Tower.restHeal() }; });
		A(near(hb.got, hb.want, 0.01) && near(hb.rest, 0.4 * 0.55, 1e-9), 'Fasting: a berry heals 30 % x 0.55 and the rest 40 % x 0.55 (main.gd 5371 / 3482)', JSON.stringify(hb));
		await E(() => G.Game.quit());
		await toMenu();
		// the shield, the coins pact and Double baggage through real clears (floor 1 already cleared once)
		await E(() => { const t = G.Tower.rec(); t.claimed[1] = t.claimed[1] || 1; G.DB.commit(); });
		await startTower();
		await E(() => { G.Tower.apply(G.Game.player, 'contract'); });
		const pre = await E(() => G.DB.save.coins);
		await killBoss();
		await waitFor(() => E(() => !!G.Tower.boss), 3000);
		const bossHp = await E(() => ({ hp: G.Tower.boss.maxHp, def: G.Tower.def(1, G.Game.player.level).hp, k: G.Tower.K.bossHp * Math.min(G.Tower.adaptHp, 1.5) * 1.25 }));
		A(near(bossHp.hp, Math.round(Math.round(bossHp.def * (1 + 15 / 600)) * bossHp.k), 1.5), 'Boss contract: the boss has x1.25 HP', JSON.stringify(bossHp));
		await E(() => G.Tower.boss.hurt(1e9));
		await waitFor(() => visible('scr-tower'), 4000);
		const cc = await E(() => G.DB.save.coins);
		A(cc - pre === 75, 'Boss contract: +50 % coins per floor (a repeat clear of floor 1: (40 + 10) x 1.5 = 75)', JSON.stringify([cc - pre]));
		await E(() => document.querySelector('#tower-cards .card[data-id="shield"]').click());
		await sleep(200);
		const sh = await E(() => ({ shield: G.Tower.shield, want: G.Game.player.maxHp * 0.35 }));
		A(near(sh.shield, sh.want, 1e-6), 'Shield: a shield of 35 % of max HP', JSON.stringify(sh));
		// a legendary (relic) card: forced, Double baggage
		await E(() => { G.TowerUI.hide(); G.Tower.debugLegend('l_bag'); G.Tower.riskOpen(); });
		await sleep(250);
		const lg = await E(() => ({ cards: [...document.querySelectorAll('#tower-cards .card')].map(c => [c.dataset.id, c.classList.contains('legend')]), txt: document.querySelector('#tower-cards .card.legend') && document.querySelector('#tower-cards .card.legend').innerText }));
		A(lg.cards.some(([id, l]) => id === 'l_bag' && l) && lg.cards.length === 4 && /Double baggage/.test(lg.txt) && /Legendary/.test(lg.txt) && /No cost\./.test(lg.txt), 'a golden legendary card replaces one of the three ("Double baggage", "Legendary", "No cost.")', JSON.stringify(lg));
		await shot('tower_relic_card.png');
		await E(() => document.querySelector('#tower-cards .card[data-id="l_bag"]').click());
		await sleep(300);
		const bag = await E(() => ({ slots: G.Game.player.itemSlots(), item: G.Game.player.item || G.Game.player.item2, choice: G.UI.isOpen('scr-item'), risks: G.Tower.risks }));
		A(bag.slots === 2 && (bag.item || bag.choice) && bag.risks.includes('l_bag'), 'Double baggage: 2 item slots and an item right away (main.gd 3569-3572 / 5755)', JSON.stringify(bag));
		// the shield absorbs the next floor's hits
		await E(() => { if (G.UI.isOpen('scr-item')) document.querySelector('#item-cards .card').click(); });
		await waitFor(() => E(() => G.Game.state === 'playing'), 3000);
		const ab = await E(() => { const pl = G.Game.player, T = G.Tower; const s0 = T.shield; pl.invuln = 0; pl.hp = pl.maxHp; pl.hurt(10); const r = { s0, s1: T.shield, hp: pl.hp, max: pl.maxHp }; pl.invuln = 1e9; return r; });
		A(ab.s1 < ab.s0 && ab.hp === ab.max, 'the shield takes the hit instead of your HP (main.gd 1837-1845)', JSON.stringify(ab));
		await E(() => G.Game.quit());
		await toMenu();
	}

	// ================= 6. floors 10 / 20: bonds; escorts; floor 30: Arceus, the clear screen =================
	if (!ONLY.length || ONLY.includes('6')) {
		await startTower();
		const bd = await E(() => { const T = G.Tower; T.debugFloor(10); return G.Game.player.bonds; });
		await killBoss();
		await waitFor(() => E(() => !!G.Tower.boss), 3000);
		await E(() => G.Tower.boss.hurt(1e9));
		await waitFor(() => visible('scr-tower'), 4000);
		const b10 = await E(() => ({ bonds: G.Game.player.bonds, floor: G.Tower.floor, banner: window.__says[window.__says.length - 1] }));
		A(b10.bonds === bd + 1 && b10.floor === 11 && b10.banner === 'Floor 10 cleared! You get an attack bond', 'clearing floor 10 gives an attack bond (main.gd 3465-3470)', JSON.stringify(b10));
		await E(() => { document.querySelector('#tower-cards .card[data-id="heal"]').click(); });
		await sleep(150);
		await E(() => { if (G.UI.isOpen('scr-tower')) document.getElementById('tower-skip').click(); G.Game.player.bonds = 0; });
		await waitFor(() => E(() => G.Game.state === 'playing'), 3000);
		await safe();
		// floor 11: the boss brings 3 escorts
		const esc = await E(() => { G.EnemyMgr.clear(); G.Tower.debugT(49.99); return true; });
		await waitFor(() => E(() => !!G.Tower.boss), 3000);
		const ec = await E(() => G.EnemyMgr.all().filter(e => !e.boss).length);
		A(ec >= 3, 'from floor 11 the boss arrives with escorts (3 + (f-10)/2: 3 on floor 11)', ec);
		await E(() => G.Game.quit());
		await toMenu();
		// floor 30: Arceus, last breath, the clear
		await E(() => { const s = G.DB.save; window.__pre = { ach: Object.keys(s.ach || {}), arceus: s.stats.arceus || 0, coins: s.coins }; });
		await startTower();
		await E(() => { G.Tower.debugFloor(30); });
		await killBoss();
		await waitFor(() => E(() => !!G.Tower.boss), 3000);
		await E(() => { const e = G.Tower.boss; e.hp = e.maxHp * 0.45; });   // (its fury at 50 % first, as every boss)
		await sleep(400);
		const ar = await E(() => { const e = G.Tower.boss; const spd = e.spd; const n0 = G.EnemyMgr.count; window.__says = []; e.hp = e.maxHp * 0.24; return new Promise(res => setTimeout(() => res({ dex: e.dex, final: !!e.def.final, last: !!e.lastBreath, spd: e.spd / spd, n: G.EnemyMgr.count - n0, banner: window.__says[window.__says.length - 1] }), 300)); });
		A(ar.dex === 493 && ar.final && ar.last && near(ar.spd, 1.1, 1e-6) && ar.n >= 10 && ar.banner === 'Arceus is giving it everything!', 'floor 30: Arceus; below 25 % HP its last breath (x1.1 speed, a wave of up to 14, "Arceus is giving it everything!")', JSON.stringify(ar));
		await shot('tower_arceus.png');
		await E(() => G.Tower.boss.hurt(1e9));
		A(await waitFor(() => visible('scr-over'), 6000), 'beating Arceus ends the run');
		await sleep(600);
		const win = await E(() => { const s = G.DB.save; return { title: document.getElementById('over-title').innerText, mode: (document.querySelector('#scr-over .over-mode') || {}).innerText, arceus: s.stats.arceus, ach: Object.keys(s.ach).filter(k => /^tower/.test(k)), best: s.tower.best, stat: s.stats.towerBest, runs: s.stats.towerRuns }; });
		A(win.title === 'TOWER COMPLETE!' && /Floors cleared: 1/.test(win.mode) && /Tower: floor 30/.test(win.mode), 'the clear screen: "TOWER COMPLETE!", "Floors cleared: 1", "Tower: floor 30" (main.gd _tower_win)', JSON.stringify(win));
		A(win.arceus === 1 && win.best === 30 && win.stat === 30 && ['tower5', 'tower10', 'tower15', 'tower20', 'tower30', 'towerArceus'].every(id => win.ach.includes(id)), 'stats.arceus 1 and towerBest 30: the six floor achievements unlock (Master of the Tower, Arceus Conqueror)', JSON.stringify(win));
		const spo = await spanishOn('#scr-over');
		A(spo.bad.length === 0, 'the clear screen shows no Spanish in English mode', JSON.stringify(spo));
		await shot('tower_clear_screen.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(400);
		await shot('tower_clear_screen_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		await toMenu();
	}

	// ================= 7. checkpoints: resume, the fail screen, missions, the Rock Z-crystal =================
	if (!ONLY.length || ONLY.includes('7')) {
		await E(() => {
			const s = G.DB.save;
			s.tower = { claimed: { 5: 5, 10: 10 }, best: 7, log: [] }; s.stats.towerBest = 7; delete s.zmis.zc_rock; s.stats.zcr_rock = 0;
			G.Modes.prefs().towerStart = 11; G.Modes.prefs().mods = ['tank'];
			G.Progress.event('kill', { types: [], boss: false, legend: 0 });
			s.missions.daily[0] = { id: 'mTower', goal: 2, param: null, prog: 0, claimed: false, told: false };
			s.missions.weekly[0] = { id: 'wTower', goal: 6, param: null, prog: 0, claimed: false, told: false };
			G.Progress.event('runEnd', { time: 900, level: 10, coins: 0, types: ['fire'], group: false, mode: 'normal', nmods: 0, bosses: 5, floor: 9 });
			window.__mis0 = [s.missions.daily[0].prog, s.missions.weekly[0].prog];
			window.__runs0 = s.stats.towerRuns || 0;
			G.DB.commit();
		});
		await E(() => { window.__rec = true; });
		await startTower();
		const cp = await E(() => ({ floor: G.Tower.floor, start: G.Tower.start, mods: G.Modes.mods }));
		await E(() => { G.Game.player.xpMul = 0; });
		await waitFor(() => visible('scr-levelup'), 5000);
		const lv = await E(() => ({ level: G.Game.player.level, pending: G.Game.pendingLevels, banner: window.__says.includes('Floor 11') ? 'Floor 11' : window.__says.join('|'), biome: G.World.biomeName() }));
		A(cp.floor === 11 && cp.start === 11 && JSON.stringify(cp.mods) === '["tank"]', 'resuming from the checkpoint: the run starts on floor 11 (with the chosen modifier)', JSON.stringify(cp));
		A(lv.level === 11 && lv.pending === 9 && lv.banner === 'Floor 11', 'a free level-up per skipped floor: level 11, ten cards (one open, 9 waiting), "Floor 11" (main.gd 3338-3344)', JSON.stringify(lv));
		for (let i = 0; i < 12 && await visible('scr-levelup'); i++) { await E(() => { const c = document.querySelector('#cards .card'); if (c) c.click(); }); await sleep(120); }
		await waitFor(() => E(() => G.Game.state === 'playing'), 4000);
		await safe();
		// enemies on floor 11 with the tank modifier: x1.6 then the Tower's x1.15 x adaptive
		const en = await E(() => { const T = G.Tower, pl = G.Game.player; const e = G.Spawner.spawnOne(pl, T.dt()); const def = e.def; return { hp: e.maxHp, base: Math.round(def.hp * G.Enemies.scale(T.dt()).hp * (3.3 + Math.min(1.7, T.dt() / 210))), k: 1.6 * 1.15 * T.adaptHp, dt: T.dt(), wantDt: 20 + 10 * 42 + 1 * 14 + T.t, cap: T.cap() }; });
		A(near(en.dt, en.wantDt, 1e-6) && en.cap === 64, 'difficulty time on floor 11: 20 + 42 x 10 + 14 x 1 + floor time; the enemy cap 64 (+2 a floor from 21)', JSON.stringify(en));
		A(Math.abs(en.hp - Math.round(Math.round(en.base * 1.6) * 1.15 * (en.k / 1.6 / 1.15))) <= 2, 'an enemy on floor 11: the run\'s scale, then the modifier (x1.6), then the Tower x1.15 x adaptive HP (main.gd 3146-3159)', JSON.stringify(en));
		// clear floors 11 and 12, then fall on 13
		for (let f = 0; f < 2; f++) {
			await killBoss();
			await waitFor(() => E(() => !!G.Tower.boss), 3000);
			await E(() => G.Tower.boss.hurt(1e9));
			await waitFor(() => visible('scr-tower'), 4000);
			await E(() => document.querySelector('#tower-cards .card[data-id="heal"]').click());
			await sleep(150);
			await E(() => { if (G.UI.isOpen('scr-tower')) document.getElementById('tower-skip').click(); });
			await waitFor(() => E(() => G.Game.state === 'playing'), 3000);
			await safe();
		}
		const mid = await E(() => { const s = G.DB.save; return { best: s.stats.towerBest, rock: !!s.zmis.zc_rock, cps: G.Tower.checkpoints(), floor: G.Tower.floor }; });
		A(mid.best === 12 && mid.rock && mid.floor === 13, 'floors 11 and 12 cleared: towerBest 12, and the Rock Z-crystal mission (clear floor 8) pays', JSON.stringify(mid));
		await E(() => { const pl = G.Game.player; G.Game.debugTime(400); pl.invuln = 0; pl.revives = 0; pl.hurt(1e9); });
		A(await waitFor(() => visible('scr-over'), 6000), 'falling on floor 13 ends the run');
		await sleep(600);
		const o = await E(() => { const s = G.DB.save; return { title: document.getElementById('over-title').innerText, mode: (document.querySelector('#scr-over .over-mode') || {}).innerText, runs: s.stats.towerRuns, mis: [s.missions.daily[0].prog, s.missions.weekly[0].prog], mis0: window.__mis0, runs0: window.__runs0 }; });
		A(o.title === 'You fell…' && /Tower: floor 13/.test(o.mode) && /Bosses \(floor: time, health lost\) 11: \d+ s, -\d+% \| 12: \d+ s, -\d+%/.test(o.mode), 'the fail screen: "You fell…", "Tower: floor 13" and the last bosses (floor: time, health lost)', JSON.stringify(o));
		A(o.runs === o.runs0 + 1 && JSON.stringify(o.mis0) === '[0,0]' && JSON.stringify(o.mis) === '[2,2]', 'towerRuns +1; the Tower missions count floors cleared in Tower runs only (a normal run left them at 0; this one: 2)', JSON.stringify(o));
		const spo = await spanishOn('#scr-over');
		A(spo.bad.length === 0, 'the fail screen shows no Spanish in English mode', JSON.stringify(spo));
		await shot('tower_fail_screen.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(400);
		await shot('tower_fail_screen_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		await toMenu();
		const drawn = await E((src) => {
			window.__rec = false;
			const re = new RegExp(src, 'i'), all = [...window.__drawn], names = G.DEX.map(p => p.name);
			const bad = all.filter(s => re.test(s.replace(/Pok[ée]mon/g, '')) && !names.includes(s) && !names.some(n => s.includes(n) && re.test(n)));
			return { floor: all.some(s => /^Floor \d+ \/ 30/.test(s)), bad: bad.slice(0, 10), n: all.length };
		}, SPANISH.source);
		A(drawn.floor && drawn.bad.length === 0, `no Spanish in the Tower's canvas (the HUD line, banners; ${drawn.n} strings drawn)`, JSON.stringify(drawn));
		await E(() => { G.Modes.prefs().mods = []; });
	}

	// ================= 8. persistence: account push, 409 merge, merge(), sanitize() =================
	if (!ONLY.length || ONLY.includes('8')) {
		const cur = await E(() => { const s = G.DB.save; G.Modes.prefs().towerStart = 6; G.DB.commit(true); return { claimed: Object.keys(s.tower.claimed).sort((a, b) => a - b), best: s.stats.towerBest }; });
		A(await waitFor(() => ROW.save && ROW.save.tower && Object.keys(ROW.save.tower.claimed).length === cur.claimed.length && ROW.save.modes && ROW.save.modes.towerStart === 6 && ROW.save.stats.towerBest === cur.best, 8000),
			'the Tower record reaches the account row (claimed floors, towerStart, towerBest)', JSON.stringify(ROW.save && { t: ROW.save.tower, m: ROW.save.modes }));
		// another device: a newer save that never saw these floors but cleared floor 15 and chose checkpoint 11
		const other = JSON.parse(JSON.stringify(ROW.save));
		other.tower = { claimed: { 15: 15, 1: 1 }, best: 15, log: [{ f: 15, s: 9, p: 1, lv: 30, ahp: 1.5 }] };
		delete other.stats.towerBest; other.modes.towerStart = 16; other.stats.towerRuns = 99;
		other.updated = Date.now() + 5000;
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => { const s = G.DB.save; return { claimed: Object.keys(s.tower.claimed).map(Number).sort((a, b) => a - b), best: s.tower.best, stat: s.stats.towerBest, runs: s.stats.towerRuns, start: s.modes.towerStart, cps: G.Tower.checkpoints(), sf: G.Tower.startFloor(), log: s.tower.log.length }; });
		A(ROW.rev > rev0 && m.claimed.includes(15) && m.claimed.includes(11) && m.claimed.includes(5) && m.best === 15 && m.stat === cur.best && m.runs === 99, 'a 409 from a newer save: claimed floors are a union (11, 12, 15...), the best floor and the stats the max', JSON.stringify(m));
		A(m.start === 16 && JSON.stringify(m.cps) === '[1,6,11,16]' && m.sf === 16, 'the checkpoint conflict keeps the higher floor (16, valid: floor 15 is cleared)', JSON.stringify(m));
		const u = await E(() => {
			const base = () => JSON.parse(JSON.stringify(G.DB.save));
			const a = base(), b = base();
			a.updated = 2000; b.updated = 1000;
			a.tower = { claimed: { 5: 500, 6: 600 }, best: 6, log: [{ f: 6 }] }; b.tower = { claimed: { 5: 400, 20: 2000 }, best: 20, log: [{ f: 20 }, { f: 19 }] };
			a.modes.towerStart = 6; b.modes.towerStart = 21;
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			const pick = r => [r.tower.claimed, r.tower.best, r.tower.log.length, r.modes.towerStart];
			const bad = base(); bad.tower = { claimed: { 0: 1, 5: 'x', 31: 1, 'abc': 1, 10: -5 }, best: 999, log: [1, 'x', { f: 3 }] }; bad.modes.towerStart = 26;
			const fixed = G.DB.merge(bad, null); G.DB.sanitize(fixed);
			const junk = base(); junk.tower = 'nope'; G.DB.sanitize(junk);
			return { r1: pick(r1), r2: pick(r2), fixed: [fixed.tower.claimed, fixed.tower.best, fixed.tower.log, fixed.modes.towerStart], junk: junk.tower };
		});
		A(JSON.stringify(u.r1) === JSON.stringify([{ 5: 400, 6: 600, 20: 2000 }, 20, 1, 21]) && JSON.stringify(u.r1.slice(0, 2)) === JSON.stringify(u.r2.slice(0, 2)) && u.r2[3] === 21,
			'merge() both ways: claimed floors a union (the earliest date), the best floor, the newer save\'s log, the higher checkpoint', JSON.stringify(u));
		A(JSON.stringify(u.fixed) === JSON.stringify([{ 5: 1, 10: 1 }, 30, [{ f: 3 }], 1]) && JSON.stringify(u.junk) === JSON.stringify({ claimed: {}, best: 0, log: [] }),
			'a hand-edited Tower record is cleaned (floors 1-30 only, best capped at 30, the log objects only, an invalid checkpoint falls back to floor 1)', JSON.stringify(u));
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
