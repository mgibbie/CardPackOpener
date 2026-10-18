// micasurvivor_bossrush_test.mjs — MicaSurvivor M5 batch 8: Boss Rush, from the Godot Android port by
// JayElDragon (poke-survivor: main.gd 339-343 / 441-445 / 577 / 795-798 / 847-849 / 1007 / 2914 / 2931-2955 /
// 3249-3251 / 3598-3611 / 4705 / 5288-5320 / 5863, menu.gd 1571-1572, progress.gd 113-117 / 247 / 313 / 328),
// driven headlessly while logged in to a stubbed Magepunk account (the row micasurvivor:<user> with the
// server's compare-and-set):
//   - data: the port's numbers (first boss at 5 s, 8 s between bosses, the "Get ready" warning in the last 4 s,
//     a biome every 150 s, a legendary every third boss, HP 1400 x 1.27^i x 1.35, damage min(150, 34 + 5i) x 1.2,
//     the BST window 490 + 14i), the 5 Rush achievements, the 2 missions, the Bug Z-crystal mission, English
//   - the boss order: which pool each boss comes from (legendary every third, the BST window, the fallback) and
//     its scaling (created at t = 60 x i)
//   - the mode screen: the Boss Rush card with its record, by mouse, touch and pad
//   - a run: only bosses (no waves, surges, events, rifts or Judgment), the warning, the first boss at 5 s, what
//     it drops between fights (heal, magnet), the next one 8 s after, scaling, a random starting biome rotating
//     every 150 s, modifiers (Tough: boss HP x1.6), Z-move / Dynamax allowed (only the Tower blocks them)
//   - the end: falling ends the run; the record, rushRuns, "Record!", coins with the modifier, the achievements,
//     the missions (only Rush runs count), the Bug Z-crystal; persistence (account push, a 409 merge by max)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the Rush card, a boss fight, the rest between bosses, the result, at
// desktop and phone width.
// Covers micasurvivor/js/systems/bossrush.js, js/systems/modes.js, js/ui/modes-ui.js, js/game.js,
// js/systems/spawner.js, js/entities/enemy.js, js/data/enemies.js, js/data/achievements.js, js/data/missions.js,
// js/systems/zmoves.js, js/core/db.js, js/ui/icons.js, js/data/lang-en.js, index.html.
//   node overworld/tests/micasurvivor_bossrush_test.mjs
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
const PORT = 8833;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

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
	localStorage.setItem('magepunk_mp_token_v1', 'rush-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'rushtester' }));
	window.__drawn = new Set();
	addEventListener('DOMContentLoaded', () => {
		const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
		P.fillText = function (s, ...a) { if (window.G && G.I18n && window.__rec) window.__drawn.add(typeof s === 'string' ? G.I18n.t(s) : String(s)); return orig.call(this, s, ...a); };
	});
};

const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|jefe|jefes|rush de|récord|monedas|partida|prepárate|solo|uno|tras|otro|cada|vez|más|fuertes|sin|vida)\b/i;

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
	const safe = () => E(() => { const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl.xpMul = 0; } });
	const says = () => E(() => window.__says.slice());

	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.BossRush), 30000), 'boots logged in (Magepunk account); G.BossRush loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	await E(() => {
		const s = G.DB.save;
		s.owned = { 4: { at: 1000, from: 'starter' } }; s.partner = 4; s.partnerShiny = false; s.modes = {};
		s.stats.dens = 1; s.stats.tk_fire = 300;
		G.DB.commit(true);
		window.__says = [];
		const say = G.Spawner.say;
		G.Spawner.say = (t, ...a) => { window.__says.push(G.I18n.t(t)); return say(t, ...a); };
	});

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const R = G.BossRush, md = G.MissionDefs.BY;
			const strings = ['Rush de Jefes', 'Solo jefes y legendarios, uno tras otro, cada vez más fuertes. Récord: 4 jefes.', '¡Rush de Jefes! Prepárate…', 'Jefe 3: Mewtwo', 'Rush de Jefes: 4 jefes',
				...['rush3', 'rush6', 'rush10', 'rush15', 'rushRuns25'].flatMap(id => { const a = G.AchDefs.BY[id]; return a ? [a.name, a.desc, a.title || ''].filter(Boolean) : ['missing ' + id]; }),
				md.mRush ? md.mRush.text(4) : 'missing mRush', md.wRush ? md.wRush.text(9) : 'missing wRush', G.ZMoves.ZMIS.find(z => z.type === 'bug').desc];
			return {
				k: { first: R.FIRST, rest: R.REST, warn: R.WARN, biome: R.BIOME_EVERY, leg: R.LEG_EVERY, hp: R.HP, dmg: R.DMG, bst: R.BST, t: R.T_PER, xp: R.XP_K, shot: R.SHOT },
				list: G.Modes.LIST, name: G.I18n.t(G.Modes.NAME.rush), icon: G.Modes.ICON.rush, iconOk: /^<img/.test(G.Icons.html('m_rush', 20)),
				ach: ['rush3', 'rush6', 'rush10', 'rush15', 'rushRuns25'].map(id => { const a = G.AchDefs.BY[id]; return a && [a.id, a.tier, a.goal, a.reward, a.title || '', a.value({ stats: { rushBest: 15, rushRuns: 25 } })]; }),
				mis: [md.mRush && [md.mRush.goals, md.mRush.reward, md.mRush.mode, G.MissionDefs.daily.includes(md.mRush)], md.wRush && [md.wRush.goals, md.wRush.reward, md.wRush.mode, G.MissionDefs.weekly.includes(md.wRush)]],
				bug: G.ZMoves.ZMIS.find(z => z.type === 'bug'),
				en: strings.map(s => [s, G.I18n.t(s)]),
			};
		});
		A(JSON.stringify(r.k) === JSON.stringify({ first: 5, rest: 8, warn: 4, biome: 150, leg: 3, hp: { base: 1400, grow: 1.27, k: 1.35 }, dmg: { base: 34, step: 5, max: 150, k: 1.2, shot: 0.55 }, bst: { lo: 490, step: 14, max: 640, span: 110, fallback: 480 }, t: 60, xp: 1.25, shot: { cd: 1.1, range: 260 } }),
			'the port\'s numbers: first boss at 5 s, 8 s between, warned in the last 4 s, a biome every 150 s, a legendary every third, HP 1400 x 1.27^i x 1.35, damage min(150, 34 + 5i) x 1.2, BST 490 + 14i (+110)', JSON.stringify(r.k));
		A(r.list.includes('rush') && r.name === 'Boss Rush' && r.icon === 'm_rush' && r.iconOk, 'a "Boss Rush" mode with its port icon (icons.gd m_rush)', JSON.stringify([r.list, r.name]));
		A(JSON.stringify(r.ach) === JSON.stringify([['rush3', 1, 3, { coins: 400, t1: 3 }, '', 15], ['rush6', 2, 6, { coins: 1200, t10: 1 }, '', 15], ['rush10', 3, 10, { coins: 3000, t1: 2, t10: 2 }, '', 15],
			['rush15', 3, 15, { coins: 6000, t1: 3, t10: 4 }, 'Rey del Rush', 15], ['rushRuns25', 2, 25, { coins: 1500, t10: 1 }, '', 25]]), 'the 5 Rush achievements of progress.gd 113-117 (rushBest 3 / 6 / 10 / 15, rushRuns 25) with the port\'s rewards and the "Rush King" title', JSON.stringify(r.ach));
		A(JSON.stringify(r.mis) === JSON.stringify([[[2, 4], { t1: 3, coins: 300 }, 'max', true], [[6, 9], { t1: 3, t10: 1, coins: 1100 }, 'max', true]]), 'the Rush missions of progress.gd 313 / 328 (bosses in a run: daily 2 / 4, weekly 6 / 9)', JSON.stringify(r.mis));
		A(r.bug && r.bug.stat === 'rushBest' && r.bug.goal === 4, 'the Bug Z-crystal mission reads rushBest (4 bosses)', JSON.stringify(r.bug));
		const bad = r.en.filter(([es, en]) => es === en || SPANISH.test(en.replace(/Pok[ée]mon|Mewtwo/g, '')));
		A(bad.length === 0, `every new string has English (the port's wording; ${r.en.length} checked)`, JSON.stringify(bad));
		const en = Object.fromEntries(r.en);
		A(en['Jefe 3: Mewtwo'] === 'Boss 3: Mewtwo' && en['Rush de Jefes: 4 jefes'] === 'Boss Rush: 4 bosses', 'patterns fill their holes (Boss 3: Mewtwo, Boss Rush: 4 bosses)', JSON.stringify(en));
	}

	// ================= 2. the boss order and scaling =================
	if (!ONLY.length || ONLY.includes('2')) {
		const r = await E(() => {
			const R = G.BossRush, out = { bad: [], legs: [] };
			for (let i = 0; i < 24; i++) {
				const seen = new Set();
				for (let k = 0; k < 40; k++) {
					const d = R.def(i, 12), p = G.DEX_BY[d.dex];
					seen.add(d.dex);
					const leg = i % 3 === 2, lo = Math.min(640, 490 + 14 * i);
					const inPool = leg ? p.leg : !p.leg && ((p.bst >= lo && p.bst <= lo + 110) || (!G.DEX.some(q => !q.leg && G.SPRITE_META[q.dex] && q.bst >= lo && q.bst <= lo + 110) && p.bst >= 480));
					const hp = Math.round(1400 * Math.pow(1.27, i) * 1.35), dm = Math.min(150, 34 + 5 * i);
					if (!inPool || !G.SPRITE_META[d.dex] || d.hp !== hp || d.dmg !== Math.round(dm * 1.2) || d.shotDmg !== Math.round(dm * 0.55) || d.xp !== G.Player.xpFor(12) * 1.25 || d.leg !== leg || d.rush !== i + 1) out.bad.push([i, d.dex, d.hp, hp, inPool]);
				}
				if (i % 3 === 2) out.legs.push(seen.size);
			}
			out.hp = [0, 1, 10].map(i => R.def(i).hp);
			out.dmg = [0, 10, 30].map(i => R.def(i).dmg);
			return out;
		});
		A(r.bad.length === 0, 'bosses 1-24 (40 draws each): a legendary on every third (3rd, 6th, 9th...), else a non-legendary from BST 490 + 14i to +110 (capped at 640); HP, damage, shots and XP as the port', JSON.stringify(r.bad.slice(0, 4)));
		A(JSON.stringify(r.hp) === JSON.stringify([1890, Math.round(1400 * 1.27 * 1.35), Math.round(1400 * Math.pow(1.27, 10) * 1.35)]) && JSON.stringify(r.dmg) === '[41,101,180]' && r.legs.every(n => n > 1),
			'HP 1890 / 2400 / ~20640 for bosses 1 / 2 / 11; damage 41 / 101 / 180 (capped at 150 x 1.2); the legendaries vary between runs', JSON.stringify(r));
	}

	// ================= 3. the mode screen =================
	if (!ONLY.length || ONLY.includes('3')) {
		await page.click('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 4000), '"Choose a mode" opens');
		await sleep(300);
		const c = await E(() => ({ cards: [...document.querySelectorAll('#modes-list [data-mode]')].map(b => b.dataset.mode), card: document.querySelector('#modes-list [data-mode=rush]').innerText }));
		A(c.cards.indexOf('rush') === 2 && /Boss Rush/.test(c.card) && /Only bosses and legendaries, one after another, each stronger than the last\. Record: 0 bosses\./.test(c.card), 'the Boss Rush card, after the Daily as in the port, in its words with the record (0 bosses)', JSON.stringify(c));
		await E(() => { G.DB.save.stats.rushBest = 4; G.ModesUI.render(); });
		await sleep(150);
		const c2 = await E(() => document.querySelector('#modes-list [data-mode=rush]').innerText);
		A(/Record: 4 bosses\./.test(c2), 'the record follows stats.rushBest', c2);
		await E(() => { G.DB.save.stats.rushBest = 0; G.ModesUI.render(); });
		const sp = await spanishOn('#scr-modes');
		A(sp.bad.length === 0, 'no Spanish on the modes screen', JSON.stringify(sp));
		await shot('rush_modes_entry.png');
		await E(() => document.querySelector('#scr-modes [data-back]').click());
		// pad: reach the Rush card and start it
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);
		await press(13); await sleep(150);
		A(await navTo('#scr-menu [data-go=modes]'), 'the D-pad reaches "Game modes"');
		await press(1);
		await waitFor(() => visible('scr-modes'), 3000);
		await sleep(300);
		A(await navTo('#modes-list [data-mode=rush]'), 'the D-pad reaches the Boss Rush card');
		await press(1);
		A(await waitFor(() => E(() => G.Game.state === 'playing' && G.Game.mode === 'rush'), 15000), 'confirm starts a Boss Rush');
		await E(() => { window.__pads[0] = null; G.Game.quit(); });
		await toMenu();
		// touch at phone width
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await touchOn(true);
		await sleep(500);
		await tapEl('#scr-menu [data-go=modes]');
		await waitFor(() => visible('scr-modes'), 3000);
		await sleep(300);
		await E(() => document.querySelector('#modes-list [data-mode=rush]').scrollIntoView({ block: 'center' }));
		await sleep(150);
		await shot('rush_modes_entry_phone.png');
		await tapEl('#modes-list [data-mode=rush]');
		A(await waitFor(() => E(() => G.Game.state === 'playing' && G.Game.mode === 'rush'), 15000), 'a tap starts a Boss Rush on a phone');
		await E(() => G.Game.quit());
		await toMenu();
		await touchOn(false);
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(400);
	}

	// ================= 4. a run =================
	if (!ONLY.length || ONLY.includes('4')) {
		await E(() => { G.Modes.prefs().mods = ['tank']; G.DB.commit(); window.__says = []; window.__rec = true; });
		await openModes();
		await E(() => document.querySelector('#modes-list [data-mode=rush]').click());
		A(await waitFor(() => E(() => G.Game.state === 'playing' && G.Game.mode === 'rush'), 15000), 'a click on the card starts the Boss Rush (with the Tough modifier)');
		await safe();
		const r0 = await E(() => ({ on: G.BossRush.on, rest: G.BossRush.rest, off: G.BossRush.biomeOff, biome: G.World.biomeName(), want: G.Tiles.BIOMES[G.BossRush.biomeOff % G.Tiles.BIOMES.length].name, n: G.EnemyMgr.count, mods: G.Modes.mods }));
		A(r0.on && r0.rest > 4 && r0.rest <= 5 && r0.biome === r0.want && r0.n === 0 && JSON.stringify(r0.mods) === '["tank"]', 'the Rush starts with nobody around, 5 s before the first boss, in a random biome (main.gd 441-445 / 577)', JSON.stringify(r0));
		await sleep(1800);
		const w = await E(() => ({ says: window.__says.slice(), n: G.EnemyMgr.count, rest: G.BossRush.rest }));
		A(w.says.includes('Boss Rush! Get ready…') && w.n === 0, '"Boss Rush! Get ready…" in the last 4 s; no waves at all', JSON.stringify(w));
		await waitFor(() => E(() => G.EnemyMgr.bossAlive()), 8000);
		const b1 = await E(() => {
			const e = G.EnemyMgr.all().find(x => x.boss), pl = G.Game.player;
			return { n: G.EnemyMgr.count, dex: e.dex, hp: e.maxHp, def: e.def.hp, rush: e.def.rush, i: G.BossRush.i, say: window.__says[window.__says.length - 1], name: G.I18n.t(e.def.name), z: G.ZMoves.blocked(), dyn: G.Dynamax.blocked() };
		});
		A(b1.n === 1 && b1.rush === 1 && b1.i === 1 && b1.say === 'Boss 1: ' + b1.name, 'the first boss comes alone: "Boss 1: <name>"', JSON.stringify(b1));
		A(b1.hp === Math.round(b1.def * 1.6), 'its HP: the def\'s (created at t = 0) x1.6 for Tough (modifiers apply to the Rush)', JSON.stringify(b1));
		A(!b1.z && !b1.dyn, 'the Z-move and Dynamax are allowed in the Rush (only the Tower blocks them)', JSON.stringify(b1));
		await sleep(600);
		await shot('rush_fight.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(500);
		await shot('rush_fight_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		// knock it down: what it leaves for the rest
		await E(() => { const e = G.EnemyMgr.all().find(x => x.boss); G.Game.player.x = e.x + 400; e.hurt(1e9); });
		await sleep(400);
		const k1 = await E(() => ({ bosses: G.Game.player.bosses, rest: G.BossRush.rest, kinds: G.Pickups.all().map(p => p.kind), n: G.EnemyMgr.count }));
		A(k1.bosses === 1 && k1.rest > 7 && k1.rest <= 8 && k1.n === 0, 'boss 1 down: 8 s until the next one, nothing else spawns', JSON.stringify(k1));
		A(k1.kinds.includes('heal') && k1.kinds.includes('magnet') && k1.kinds.includes('item') && k1.kinds.includes('coin'), 'between fights it leaves a heal berry and a magnet (main.gd 5313-5314), coins and an item', JSON.stringify(k1.kinds));
		await shot('rush_between_fights.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(500);
		await shot('rush_between_fights_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		// no rifts / Judgment / events even late in the run; the biome every 150 s
		const late = await E(() => { G.Game.debugTime(1850); G.BossRush.debugRest(30); return { checkT: G.Rift.checkT }; });
		await sleep(1500);
		const late2 = await E(() => ({ checkT: G.Rift.checkT, rift: !!G.Rift.rift, judge: G.Judgment.active, ev: G.Events.current, biome: G.World.biomeName(), want: G.Tiles.BIOMES[(Math.floor(G.Game.st.time / 150) + G.BossRush.biomeOff) % G.Tiles.BIOMES.length].name }));
		A(late2.checkT === late.checkT && !late2.rift && !late2.judge && !late2.ev, 'past minute 30: no rift checks, no Judgment of Arceus, no events (main.gd 1007 / 3249 / 5863)', JSON.stringify([late, late2]));
		A(late2.biome === late2.want, 'the biome changes every 150 s from the random start (main.gd 4705)', JSON.stringify(late2));
		// boss 2 at t = 60: scale x1.1
		await E(() => G.BossRush.debugRest(0.01));
		await waitFor(() => E(() => G.EnemyMgr.bossAlive()), 4000);
		const b2 = await E(() => { const e = G.EnemyMgr.all().find(x => x.boss); return { hp: e.maxHp, def: e.def.hp, rush: e.def.rush, dmg: e.dmg, ddef: e.def.dmg }; });
		A(b2.rush === 2 && b2.hp === Math.round(Math.round(b2.def * 1.1) * 1.6) && near(b2.dmg, b2.ddef * 1.1, 1e-6), 'boss 2 is created as at second 60: HP and damage x(1 + 60/600) = x1.1 (then Tough)', JSON.stringify(b2));
		await E(() => { const e = G.EnemyMgr.all().find(x => x.boss); e.hurt(1e9); });
		await sleep(300);
		await E(() => G.BossRush.debugRest(0.01));
		await waitFor(() => E(() => G.EnemyMgr.bossAlive()), 4000);
		const b3 = await E(() => { const e = G.EnemyMgr.all().find(x => x.boss); return { leg: !!G.DEX_BY[e.dex].leg, rush: e.def.rush }; });
		A(b3.rush === 3 && b3.leg, 'boss 3 is a legendary', JSON.stringify(b3));
		await E(() => { const e = G.EnemyMgr.all().find(x => x.boss); e.hurt(1e9); });
		await sleep(300);
		await E(() => G.BossRush.debugRest(0.01));
		await waitFor(() => E(() => G.EnemyMgr.bossAlive()), 4000);
		await E(() => { const e = G.EnemyMgr.all().find(x => x.boss); e.hurt(1e9); });
		await sleep(300);
		// the end: missions and records
		await E(() => {
			const s = G.DB.save;
			G.Progress.event('kill', { types: [], boss: false, legend: 0 });
			s.missions.daily[0] = { id: 'mRush', goal: 4, param: null, prog: 0, claimed: false, told: false };
			s.missions.weekly[0] = { id: 'wRush', goal: 6, param: null, prog: 0, claimed: false, told: false };
			G.Progress.event('runEnd', { time: 900, level: 10, coins: 0, types: ['fire'], group: false, mode: 'normal', nmods: 0, bosses: 9, floor: 0 });
			window.__mis0 = [s.missions.daily[0].prog, s.missions.weekly[0].prog];
			window.__pre = { coins: s.coins, ach: Object.keys(s.ach || {}), zmis: Object.keys(s.zmis || {}), runs: s.stats.rushRuns || 0 };
			const pl = G.Game.player;
			window.__parts = Math.floor(G.Game.st.time / 5) + Math.floor(pl.kills * 0.25) + pl.bosses * 80 + pl.coins;
			window.__mul = 1.25 * pl.coinMul;
			pl.invuln = 0; pl.revives = 0; pl.hurt(1e9);
		});
		A(await waitFor(() => visible('scr-over'), 6000), 'falling ends the Boss Rush (its only ending)');
		await sleep(600);
		const o = await E(() => {
			const s = G.DB.save, pre = window.__pre;
			const ach = Object.keys(s.ach).filter(k => !pre.ach.includes(k)), z = Object.keys(s.zmis).filter(k => !pre.zmis.includes(k));
			const bonus = ach.reduce((n, k) => n + (((G.AchDefs.BY[k] || {}).reward || {}).coins || 0), 0) + z.length * G.ZMoves.ZMIS_COINS;
			return { title: document.getElementById('over-title').innerText, mode: (document.querySelector('#scr-over .over-mode') || {}).innerText, best: s.stats.rushBest, runs: s.stats.rushRuns, runs0: pre.runs,
				coins: s.coins - pre.coins, want: Math.round(window.__parts * window.__mul) + bonus, ach, z, mis: [s.missions.daily[0].prog, s.missions.weekly[0].prog], mis0: window.__mis0 };
		});
		A(o.title === 'You fell…' && /Boss Rush: 4 bosses/.test(o.mode) && /New record!/.test(o.mode), 'the result: "Boss Rush: 4 bosses · New record!"', JSON.stringify(o));
		A(o.best === 4 && o.runs === o.runs0 + 1, 'stats.rushBest 4, rushRuns +1', JSON.stringify(o));
		A(o.ach.includes('rush3') && !o.ach.includes('rush6') && o.z.includes('zc_bug'), '"Boss warm-up" (3 bosses) unlocks and the Bug Z-crystal mission (4 bosses) pays', JSON.stringify(o));
		A(o.coins === o.want, 'coins x1.25 for the Tough modifier (no extra for the mode), plus the achievement and Z-crystal rewards', JSON.stringify(o));
		A(JSON.stringify(o.mis0) === '[0,0]' && JSON.stringify(o.mis) === '[4,4]', 'the Rush missions count bosses of Rush runs only (a normal run with 9 bosses left them at 0)', JSON.stringify(o));
		const spo = await spanishOn('#scr-over');
		A(spo.bad.length === 0, 'the result shows no Spanish in English mode', JSON.stringify(spo));
		await shot('rush_over.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(400);
		await shot('rush_over_phone.png');
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(300);
		await toMenu();
		const drawn = await E((src) => {
			window.__rec = false;
			const re = new RegExp(src, 'i'), all = [...window.__drawn], names = G.DEX.map(p => p.name);
			const bad = all.filter(s => re.test(s.replace(/Pok[ée]mon/g, '')) && !names.some(n => s.includes(n)));
			return { boss: all.some(s => /^Boss \d+: /.test(s)), bad: bad.slice(0, 10), n: all.length };
		}, SPANISH.source);
		A(drawn.boss && drawn.bad.length === 0, `no Spanish in the Rush's canvas (banners; ${drawn.n} strings drawn)`, JSON.stringify(drawn));
		// a second, worse run keeps the record
		await E(() => { G.Modes.prefs().mods = []; });
		await openModes();
		await E(() => document.querySelector('#modes-list [data-mode=rush]').click());
		await waitFor(() => E(() => G.Game.state === 'playing' && G.Game.mode === 'rush'), 15000);
		await E(() => { const pl = G.Game.player; pl.invuln = 0; pl.revives = 0; pl.hurt(1e9); });
		await waitFor(() => visible('scr-over'), 6000);
		await sleep(400);
		const o2 = await E(() => ({ mode: (document.querySelector('#scr-over .over-mode') || {}).innerText, best: G.DB.save.stats.rushBest }));
		A(/Boss Rush: 0 bosses/.test(o2.mode) && !/New record!/.test(o2.mode) && o2.best === 4, 'a worse run: "Boss Rush: 0 bosses", no "New record!", the record stays 4', JSON.stringify(o2));
		await toMenu();
	}

	// ================= 5. persistence =================
	if (!ONLY.length || ONLY.includes('5')) {
		const cur = await E(() => { G.DB.commit(true); return { best: G.DB.save.stats.rushBest || 0, runs: G.DB.save.stats.rushRuns || 0 }; });
		A(await waitFor(() => ROW.save && ROW.save.stats && (ROW.save.stats.rushBest || 0) === cur.best && (ROW.save.stats.rushRuns || 0) === cur.runs, 8000), 'the Rush records reach the account row', JSON.stringify(cur));
		const other = JSON.parse(JSON.stringify(ROW.save));
		delete other.stats.rushBest; other.stats.rushRuns = 40;
		other.updated = Date.now() + 5000;
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => ({ best: G.DB.save.stats.rushBest, runs: G.DB.save.stats.rushRuns }));
		A(ROW.rev > rev0 && m.best === cur.best && m.runs === 40 && ROW.save.stats.rushBest === cur.best, 'a 409 from a newer save without the record merges it back (max per stat: rushBest kept, rushRuns 40)', JSON.stringify(m));
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
