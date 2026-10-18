// micasurvivor_localcoop_test.mjs — MicaSurvivor M5 batch 12a: Co-op Mode, the local partner, from the Godot Android
// port by JayElDragon (poke-survivor: menu.gd 1584-1600 / 2109 / 2151-2156, main.gd 162-167 / 195-202 / 439 / 523-524 /
// 815-817 / 838-841 / 985-989 / 1062 / 1243 / 1267 / 1623-1731 / 1807-1811 / 1917 / 1939-2007 / 8653-8661, progress.gd
// 105-106 / 155), driven headlessly while logged in to a stubbed Magepunk account (the row micasurvivor:<user> with the
// server's compare-and-set) and with two synthetic gamepads:
//   - data: the port's numbers (speed 118, follow 150 / engage 120 / seek 240 / flee 190, leash 520 -> 70, ×0.8 damage,
//     ×1.15 cooldown, move level 1 + level / 6 up to 6, -20 % coins, 20 s to revive...), the move per type, English
//   - who the partner is (coop_dex -> save.coopDex): the pick (yours only), the fallback (the team's first that is not
//     you, else Eevee / Pikachu), sanitize, merge() by the newest pick
//   - the mode screen: the Co-op card in the port's place and words, "Choose partner" by mouse, touch and pad; the account
//     push and a 409 merge
//   - an AI run: following, standing still, engaging, the leash teleport, the shots (its move, ×0.8 of YOUR attack,
//     your size, ×1.15 cooldown, the level), the hits going to "Partner / team", hidden in a rift arena, the minimap dot
//   - player 2: the second pad's left stick (0.22 deadzone, not rescaled, speed 118), P2 has no buttons and never takes
//     player 1's menus, disconnect -> AI and connect -> P2 (with toasts). The test user is signed in (as in the other pad
//     tests), so it passes with or without the site's controller sign-in gate.
//   - fainting: Second Chance first, then spectating (the partner takes your hits ×0.8 with its type, 0.45 s apart, no
//     Z-move / Dynamax), revived after 20 s at half HP, the run ends when the partner falls
//   - the run end: -20 % coins measured on the real result, coopRuns / groupRuns (60 s) and "In good company", the
//     "Partner / team" row of the breakdown, "Co-op Mode" on the result; no Spanish anywhere in English mode
// Screenshots (MICASURVIVOR_SHOTS=<dir>): the mode card, the partner pick, an AI run (desktop and 844x390), a P2 run,
// spectating, the run-over breakdown.
// Covers micasurvivor/js/systems/localcoop.js, js/systems/modes.js, js/ui/modes-ui.js, js/game.js, js/entities/player.js,
// js/systems/combat.js, js/systems/zmoves.js, js/systems/dynamax.js, js/core/pad.js, js/core/db.js, js/ui/hud.js,
// js/ui/minimap.js, js/ui/icons.js, js/ui/lexicon-ui.js, js/data/lang-en.js, index.html.
//   node overworld/tests/micasurvivor_localcoop_test.mjs
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
const PORT = 9591;
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

// two synthetic gamepads (the Gamepad API) + a Magepunk login, before any page script runs
const BEFORE = () => {
	window.__pads = [];
	window.__mkPad = (i, id) => ({
		index: i, id, connected: true, mapping: 'standard', timestamp: 0,
		buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
		axes: [0, 0, 0, 0],
		vibrationActuator: { playEffect() { return Promise.resolve('complete'); } },
	});
	window.__btn = (b, on, p = 0) => { const pad = window.__pads[p]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
	window.__axes = (p, x, y) => { const pad = window.__pads[p]; if (pad) { pad.axes[0] = x; pad.axes[1] = y; } };
	Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
	localStorage.setItem('magepunk_mp_token_v1', 'coop-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'cooptester' }));
	// every string the canvas really draws (after the English translation), to look for Spanish
	window.__drawn = new Set();
	window.__toasts = [];
	addEventListener('DOMContentLoaded', () => {
		const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
		P.fillText = function (s, ...a) { if (typeof s === 'string' && window.G && G.I18n && window.__rec) window.__drawn.add(G.I18n.t(s)); return orig.call(this, s, ...a); };
		new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); })
			.observe(document.body, { childList: true, subtree: true, characterData: true });
	});
};

// Spanish left on an English screen: accents / ¡¿ñ or common Spanish words (Pokémon names stripped first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|tipo|modo|monedas|partida|elige|elegir|toca|compañero|segundo|mando|jugador|ataca|solo|mejoras|vida|caído|espectando|revivirás|cooperativo|inicia|sesión)\b/i;

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
	const press = async (b, p = 0) => { await E((b, p) => __btn(b, true, p), b, p); await sleep(90); await E((b, p) => __btn(b, false, p), b, p); await sleep(110); };
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
	const lastToast = () => E(() => (document.querySelector('.toast') || {}).textContent || '');
	// the run keeps going between page.evaluate calls: nothing may hurt us, level us up or spawn meanwhile
	const calm = () => E(() => {
		const pl = G.Game.player; if (pl) { pl.invuln = 1e9; pl.xpMul = 0; }
		G.EnemyMgr.clear();
		if (!window.__calm) {
			window.__calm = { sp: G.Spawner.update, rf: G.Rift.update, ev: G.Events.update, jd: G.Judgment.update };
			G.Spawner.update = () => {}; G.Rift.update = () => {}; G.Events.update = () => {}; G.Judgment.update = () => {};
		}
	});
	const uncalm = () => E(() => { const c = window.__calm; if (c) { G.Spawner.update = c.sp; G.Rift.update = c.rf; G.Events.update = c.ev; G.Judgment.update = c.jd; window.__calm = null; } });
	const startCoop = async () => {
		await openModes();
		await E(() => document.querySelector('#modes-list [data-mode=coop]').click());
		return waitFor(() => E(() => G.Game.state === 'playing' && G.LocalCoop.on), 15000);
	};

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.LocalCoop && !!G.ModesUI), 30000), 'boots logged in (Magepunk account); G.LocalCoop loaded', errors.slice(0, 3).join(' | '));
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
		s.partner = 4; s.partnerShiny = false; s.modes = {}; delete s.coopDex; delete s.coopAt;
		G.DB.commit(true);
	});

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const C = G.LocalCoop;
			const strings = ['Modo Cooperativo', 'Elegir compañero', 'Compañero: Pikachu', 'Toca el Pokémon que será tu compañero',
				'Un segundo Pokémon te acompaña y ataca solo. Si conectas un segundo mando, el jugador 2 lo mueve con su stick izquierdo. Comparte tus mejoras. -20% de monedas. Compañero: Squirtle',
				'Un segundo Pokémon te acompaña y ataca solo. Si conectas un segundo mando, el jugador 2 lo mueve con su stick izquierdo. Comparte tus mejoras. -20% de monedas.',
				'¡Has caído! Mira a tu compañero', 'Espectando: revivirás en 12 s', 'Vida de tu compañero',
				'¡Tu compañero te ha revivido!', 'Jugador 2: mando conectado', 'Jugador 2: mando desconectado, la IA lleva a tu compañero', 'Squirtle · IA', 'Squirtle · J2', 'J2', 'MODO COOPERATIVO'];
			return {
				k: C.K, color: C.COLOR, coopColor: G.Coop.COLORS[1],
				list: G.Modes.LIST, name: G.I18n.t(G.Modes.NAME.coop), icon: G.Modes.ICON.coop, iconOk: /^<img/.test(G.Icons.html('m_coop', 20)), coins: G.Modes.COINS.coop,
				moves: [4, 1, 7, 25, 133, 92, 74, 63, 66, 129].map(d => C.moveFor(d, 1).id),
				lv: [1, 5, 6, 11, 12, 30, 36, 99].map(l => C.levelFor({ level: l })),
				en: strings.map(s => [s, G.I18n.t(s)]),
			};
		});
		const k = r.k;
		A(k.speed === 118 && k.follow === 150 && k.engage === 120 && k.seek === 240 && k.flee === 190 && k.steer === 5 && k.leash === 520 && k.tpR === 70 && k.dz === 0.22 && k.reach === 520,
			'the port\'s movement numbers: speed 118, follow past 150, engage within 120 an enemy within 240, flee 190 when spectating, steer ×5/s, leash 520 -> 70, 0.22 deadzone, 520 aim reach', JSON.stringify(k));
		A(k.dmg === 0.8 && k.cd === 1.15 && k.lvEvery === 6 && k.lvMax === 6 && k.coins === 0.8 && r.coins === 0.8 && k.groupMin === 60,
			'the port\'s combat numbers: ×0.8 damage, ×1.15 cooldown, move level 1 + level / 6 up to 6, -20 % coins, a group run from 60 s', JSON.stringify(k));
		A(k.reviveT === 20 && k.downK === 0.8 && k.downInv === 0.45 && k.reviveHp === 0.5 && k.reviveInv === 2.5 && k.reviveR === 220 && k.reviveKnock === 450 && k.fallback === 133 && k.fallback2 === 25,
			'the port\'s spectating numbers: revived after 20 s at half HP (2.5 s invulnerable, enemies within 220 knocked 450), the partner takes ×0.8, 0.45 s apart; fallback Eevee / Pikachu', JSON.stringify(k));
		A(JSON.stringify(r.list) === '["normal","daily","rush","party","coop","tower","rifts","type","team"]' && r.name === 'Co-op Mode' && r.icon === 'm_coop' && r.iconOk && r.color === r.coopColor,
			'a "Co-op Mode" mode right after Party, as on the port\'s mode screen, with its own icon (icons.gd m_coop) and the online co-op\'s second colour', JSON.stringify([r.list, r.name, r.color]));
		A(JSON.stringify(r.moves) === '["ember","ember","water-gun","thunder-shock","ember","shadow-ball","rock-throw","confusion","aura-sphere","water-gun"]',
			'its move (main.gd _partner_move_for): the first projectile of its main type, else a Normal one, else Ember (Charmander, Bulbasaur, Squirtle, Pikachu, Eevee, Gastly, Geodude, Abra, Machop, Magikarp)', JSON.stringify(r.moves));
		A(JSON.stringify(r.lv) === '[1,1,2,2,3,6,6,6]', 'its move level is 1 + your level / 6, at most 6 (levels 1, 5, 6, 11, 12, 30, 36, 99)', JSON.stringify(r.lv));
		const bad = r.en.filter(([es, en]) => es === en || SPANISH.test(en.replace(/Pok[ée]mon/g, '')));
		A(bad.length === 0, `every new string has English (${r.en.length} checked)`, JSON.stringify(bad));
		const en = Object.fromEntries(r.en);
		A(en['Compañero: Pikachu'] === 'Partner: Pikachu' && en['Espectando: revivirás en 12 s'] === 'Spectating: you revive in 12 s' && en['Squirtle · IA'] === 'Squirtle · AI' && en['Squirtle · J2'] === 'Squirtle · P2' && /Partner: Squirtle$/.test(en[r.en[4][0]]),
			'patterns fill their holes (Partner: Pikachu · Spectating: you revive in 12 s · Squirtle · AI / P2)', JSON.stringify([en['Compañero: Pikachu'], en['Squirtle · IA']]));
	}

	// ================= 2. who the partner is (coop_dex) =================
	if (!ONLY.length || ONLY.includes('2')) {
		const r = await E(() => {
			const C = G.LocalCoop, s = G.DB.save, out = {};
			out.none = C.dex();                                     // team list [4, 1, 7]: the first that is not you
			const bk = s.owned;
			s.owned = { 4: { at: 1000 } }; out.alone = C.dex();       // only you: Eevee
			s.partner = 133; s.owned = { 133: { at: 1000 } }; out.eevee = C.dex(); s.partner = 4; s.owned = bk;
			out.unowned = C.pick(150); out.junk = C.pick('x');
			out.pick = C.pick(7); out.dex = C.dex(); out.at = s.coopAt > 0; out.saved = s.coopDex;
			// sanitize
			const a = JSON.parse(JSON.stringify(s)); a.coopDex = 'abc'; a.coopAt = 5; G.DB.sanitize(a);
			const b = JSON.parse(JSON.stringify(s)); b.coopDex = '25'; b.coopAt = -3; G.DB.sanitize(b);
			const c = JSON.parse(JSON.stringify(s)); c.coopDex = 99999; G.DB.sanitize(c);
			out.san = [a.coopDex === undefined && a.coopAt === undefined, b.coopDex === 25 && b.coopAt === 0, c.coopDex === undefined];
			// merge(): the newest pick wins, whichever save is newer
			const x = JSON.parse(JSON.stringify(s)), y = JSON.parse(JSON.stringify(s));
			x.updated = 5000; y.updated = 1000; x.coopDex = 1; x.coopAt = 100; y.coopDex = 25; y.coopAt = 900;
			const m1 = G.DB.merge(x, y), m2 = G.DB.merge(y, x);
			const z = JSON.parse(JSON.stringify(s)); delete z.coopDex; delete z.coopAt; z.updated = 9000;   // a newer save from a device without the pick
			const m3 = G.DB.merge(z, y);
			out.merge = [m1.coopDex, m1.coopAt, m2.coopDex, m2.coopAt, m3.coopDex];
			return out;
		});
		A(r.none === 1 && r.alone === 133 && r.eevee === 25, 'no pick: the team\'s first that is not you (Bulbasaur); alone, Eevee; playing Eevee, Pikachu (main.gd coop_dex)', JSON.stringify(r));
		A(!r.unowned && !r.junk && r.pick && r.dex === 7 && r.saved === 7 && r.at, 'a pick must be one of yours (Mewtwo and junk refused); Squirtle is saved as save.coopDex with its time', JSON.stringify(r));
		A(r.san.every(Boolean), 'a hand-edited pick is cleaned (junk dropped, "25" -> 25, an unknown Pokémon dropped)', JSON.stringify(r.san));
		A(JSON.stringify(r.merge) === '[25,900,25,900,25]', 'merge() both ways keeps the newest pick (coopAt), also against a newer save that has none', JSON.stringify(r.merge));
		await E(() => { const s = G.DB.save; delete s.coopDex; delete s.coopAt; G.DB.commit(true); });
	}

	// ================= 3. the mode screen: the card and "Choose partner" by mouse, touch, pad =================
	if (!ONLY.length || ONLY.includes('3')) {
		await page.click('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 4000), 'the menu\'s Game modes opens "Choose a mode" (mouse)');
		await sleep(300);
		const c = await E(() => ({ cards: [...document.querySelectorAll('#modes-list [data-mode]')].map(b => b.dataset.mode), card: document.querySelector('#modes-list [data-mode=coop]').innerText, btn: (document.getElementById('modes-coop-pick') || {}).innerText }));
		A(JSON.stringify(c.cards) === '["normal","daily","rush","party","coop","tower","rifts","type","team"]' && /Co-op Mode/.test(c.card) && /A second Pokémon comes along and attacks on its own\. Plug in a second controller and player 2 moves it with the left stick\. It shares your upgrades\. -20% coins\. Partner: Bulbasaur/.test(c.card)
			&& !/Log in/i.test(c.card) && /Choose partner/.test(c.btn || ''),
			'the Co-op Mode card after Party, in the port\'s words, names the partner (Bulbasaur, the fallback) next to "Choose partner" (no sign-in line)', JSON.stringify(c));
		await shot('coop_mode_card.png');
		await E(() => document.getElementById('modes-coop-pick').scrollIntoView({ block: 'center' }));
		await sleep(150);
		await shot('coop_mode_card_scrolled.png');
		await page.click('#modes-coop-pick');
		A(await waitFor(() => visible('modes-coop'), 3000) && !(await visible('modes-main')), '"Choose partner" opens the picker');
		await sleep(300);
		const g = await E(() => ({ cells: [...document.querySelectorAll('#coop-grid .cell')].map(c => +c.dataset.dex), on: [...document.querySelectorAll('#coop-grid .cell.on')].map(c => +c.dataset.dex), toast: (document.querySelector('.toast') || {}).textContent || '',
			back: document.querySelector('#scr-modes [data-back]').classList.contains('hidden'), tabs: [...document.querySelectorAll('#coop-gens .gen-tab')].map(t => t.innerText) }));
		A(JSON.stringify(g.cells) === '[1,4,7,25]' && JSON.stringify(g.on) === '[1]' && g.toast === 'Tap the Pokémon that will be your partner' && g.back && JSON.stringify(g.tabs) === '["Kanto"]',
			'it lists only your Pokémon (one generation tab), marks the current partner and says "Tap the Pokémon that will be your partner" (menu.gd 1597 / 2109)', JSON.stringify(g));
		await shot('coop_partner_pick.png');
		const sp = await spanishOn('#scr-modes');
		A(sp.bad.length === 0, 'the picker shows no Spanish in English mode', JSON.stringify(sp));
		await page.click('#coop-grid .cell[data-dex="25"]');
		await sleep(250);
		const t1 = await E(() => ({ dex: G.DB.save.coopDex, main: !document.getElementById('modes-main').classList.contains('hidden'), toast: (document.querySelector('.toast') || {}).textContent, card: document.querySelector('#modes-list [data-mode=coop]').innerText }));
		A(t1.dex === 25 && t1.main && t1.toast === 'Partner: Pikachu' && /Partner: Pikachu/.test(t1.card), 'a click picks Pikachu ("Partner: Pikachu"), back to the list, the card names it', JSON.stringify(t1));
		const sp2 = await spanishOn('#scr-modes');
		A(sp2.bad.length === 0, 'the modes screen with the Co-op card shows no Spanish in English mode', JSON.stringify(sp2));
		// Esc closes the picker back to the list
		await page.click('#modes-coop-pick'); await sleep(200);
		await page.keyboard.press('Escape'); await sleep(200);
		A(!(await visible('modes-coop')) && await visible('modes-main') && await visible('scr-modes'), 'Esc closes the picker back to the list');
		await E(() => document.querySelector('#scr-modes [data-back]').click());
		await waitFor(() => visible('scr-menu'), 3000);

		// touch (a phone-sized window with touch emulation)
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await touchOn(true);
		await sleep(500);
		await tapEl('#scr-menu [data-go=modes]');
		A(await waitFor(() => visible('scr-modes'), 3000), 'a tap opens "Choose a mode" on a phone');
		await sleep(300);
		await tapEl('#modes-coop-pick');
		A(await waitFor(() => visible('modes-coop'), 3000), 'a tap on "Choose partner" opens the picker');
		await sleep(300);
		const fit = await E(() => {
			const over = [...document.querySelectorAll('#modes-coop .cell, #modes-coop .gen-tab, #modes-coop button, #modes-coop p')].filter(el => { const b = el.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).length;
			return { over, scroll: document.documentElement.scrollWidth <= innerWidth + 1 };
		});
		await shot('coop_partner_pick_phone.png');
		await tapEl('#coop-grid .cell[data-dex="7"]');
		await sleep(250);
		const tt = await E(() => ({ dex: G.DB.save.coopDex, main: !document.getElementById('modes-main').classList.contains('hidden') }));
		A(tt.dex === 7 && tt.main && fit.over === 0 && fit.scroll, 'a tap picks Squirtle and goes back; nothing in the picker overflows at 844x390', JSON.stringify([tt, fit]));
		const cardFit = await E(() => { const el = document.querySelector('#modes-list [data-mode=coop]'); el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return b.right <= innerWidth + 1 && b.left >= -1 && el.scrollWidth <= el.clientWidth + 1; });
		await sleep(150);
		await shot('coop_mode_card_phone.png');
		A(cardFit, 'the Co-op card fits at 844x390', String(cardFit));
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
		A(await navTo('#modes-coop-pick'), 'the D-pad reaches "Choose partner"');
		await press(1);
		A(await waitFor(() => visible('modes-coop'), 2000), 'confirm opens the picker');
		await sleep(250);
		A(await navTo('#coop-grid .cell[data-dex="1"]'), 'the D-pad reaches Bulbasaur in the picker');
		await press(1);
		await sleep(250);
		const pp = await E(() => ({ dex: G.DB.save.coopDex, main: !document.getElementById('modes-main').classList.contains('hidden') }));
		A(pp.dex === 1 && pp.main, 'confirm picks it (Bulbasaur) and goes back to the list', JSON.stringify(pp));
		A(await navTo('#modes-coop-pick'), 'the D-pad reaches "Choose partner" again');
		await press(1);
		await waitFor(() => visible('modes-coop'), 2000);
		await sleep(250);
		await press(0);   // Nintendo: bottom face = back
		A(await waitFor(() => E(() => document.getElementById('modes-coop').classList.contains('hidden') && !document.getElementById('modes-main').classList.contains('hidden')), 2000) && await visible('scr-modes'), 'cancel closes the picker back to the list');
		await press(0);
		A(await waitFor(() => visible('scr-menu'), 2000), 'cancel again returns to the menu');
		await E(() => { window.__pads[0] = null; });
		await sleep(300);

		// the account row and a 409 merge (a newer save from another device with an older pick)
		await E(() => { G.LocalCoop.pick(7); G.DB.commit(true); });
		A(await waitFor(() => ROW.save && ROW.save.coopDex === 7 && ROW.save.coopAt > 0, 8000), 'the pick reaches the account row (coopDex 7, coopAt)', JSON.stringify(ROW.save && [ROW.save.coopDex, ROW.save.coopAt]));
		const other = JSON.parse(JSON.stringify(ROW.save));
		other.coopDex = 25; other.coopAt = ROW.save.coopAt - 60000; other.updated = Date.now() + 5000;
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => ({ dex: G.DB.save.coopDex, d: G.LocalCoop.dex() }));
		A(ROW.rev > rev0 && m.dex === 7 && m.d === 7 && ROW.save.coopDex === 7, 'a 409 from a newer save with an OLDER pick keeps Squirtle (the newest pick wins)', JSON.stringify(m));
	}

	// ================= 4. an AI run: following, the leash, the shots, shared upgrades =================
	if (!ONLY.length || ONLY.includes('4')) {
		await E(() => { G.LocalCoop.pick(7); G.Modes.prefs().mods = []; G.DB.commit(); });
		A(await startCoop(), 'a click on the Co-op card starts the run');
		await calm();
		const r0 = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player, o = C.mate;
			return { mode: G.Game.mode, on: C.on, dex: o && o.dex, ctrl: C.ctrl, move: C.move && C.move.id, lvl: C.move && C.move.lvl, d: o && Math.hypot(o.x - pl.x, o.y - pl.y),
				title: G.Modes.title(), draw: C.drawables(pl).length, pdex: pl.dex, online: G.Coop.active };
		});
		A(r0.mode === 'coop' && r0.on && r0.dex === 7 && r0.ctrl === 'ai' && r0.move === 'water-gun' && r0.lvl === 1 && r0.pdex === 4 && !r0.online,
			'Co-op Mode: you play Charmander, Squirtle comes along (AI, no second pad) with Water Gun level 1; the online co-op stays off', JSON.stringify(r0));
		A(r0.d > 40 && r0.d < 90 && r0.draw === 1, 'it starts next to you (the port: +60, +20) and is drawn in the world', JSON.stringify(r0));
		await E(() => { window.__rec = true; });
		await sleep(700);
		await shot('coop_ai_run.png');
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
		await sleep(700);
		await shot('coop_ai_run_phone.png');
		const fitHud = await E(() => {
			const rs = G.HUD.rects(), c = rs.find(r => r.name === 'coop');
			const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
			const W = innerWidth / G.HUD.k, H = innerHeight / G.HUD.k;
			return { c, inside: !!c && c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H, clash: c ? rs.filter(r => r !== c && r.name !== 'hint' && hit(c, r)).map(r => r.name) : ['none'] };
		});
		A(fitHud.inside && fitHud.clash.length === 0, 'phone width (844x390): the partner chip fits and overlaps nothing on the HUD', JSON.stringify(fitHud));
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await sleep(400);
		await calm();

		// movement, driven frame by frame (main.gd _update_partner)
		const mv = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player, o = C.mate, out = {};
			const run = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) C.update(dt, pl); };
			const place = (dx, dy) => { o.x = pl.x + dx; o.y = pl.y + dy; };
			const free = (x, y) => G.World.isFree(x, y, 20);
			// find a clear stretch to the right of the player
			out.free = free(pl.x + 300, pl.y) && free(pl.x + 150, pl.y) && free(pl.x + 100, pl.y);
			G.EnemyMgr.clear();
			place(300, 0); run(1); const d0 = o.x - pl.x; run(59); out.follow = d0 - (o.x - pl.x);
			place(100, 0); run(120); const s0 = o.x; run(60); out.still = Math.abs(o.x - s0);
			// engage: you within 120, an enemy within 240 of it -> it walks to the enemy at half speed
			const def = { dex: 19, name: 'T19', hp: 1e7, spd: 0.001, dmg: 1, xp: 0, behavior: 'chaser' };
			place(100, 0); run(120);
			const e = new G.Enemy(def, o.x + 200, o.y, { hp: 1, spd: 1, dmg: 1 }); e.flying = true; e.spd = 0; G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
			const g0 = o.x; let mx = 0; for (let i = 0; i < 60; i++) { run(1); mx = Math.max(mx, Math.hypot(...C.dir)); } out.engage = o.x - g0; out.dirMax = mx; out.stopAt = o.x - pl.x; out.dirEnd = Math.hypot(...C.dir);
			G.EnemyMgr.clear();
			// the leash: past 520 it shows up 70 from you with a blue ring
			const tp0 = C.teleports; place(900, 0); run(1); out.tp = C.teleports - tp0; out.tpD = Math.hypot(o.x - pl.x, o.y - pl.y);
			place(500, 0); const tp1 = C.teleports; run(1); out.noTp = C.teleports - tp1;
			// a rift arena hides it (and it waits)
			const desc = Object.getOwnPropertyDescriptor(G.Rift, 'inArena');
			Object.defineProperty(G.Rift, 'inArena', { configurable: true, get: () => true });
			place(300, 0); const a0 = o.x; run(30); out.arena = { moved: o.x !== a0, drawn: C.drawables(pl).length, vis: C.visible(pl) };
			Object.defineProperty(G.Rift, 'inArena', desc);
			place(80, 0);
			return out;
		});
		A(mv.follow > 85 && mv.follow <= 118 / 60 * 59 + 1, 'past 150 from you it walks to you (steering eases in; at most 118/s)', JSON.stringify(mv));
		A(mv.still < 2, 'close to you with no enemy around it stays put', JSON.stringify(mv));
		A(mv.engage > 15 && mv.engage <= 59.5 && mv.dirMax > 0.4 && mv.dirMax <= 0.5 + 1e-9 && mv.stopAt > 120 && mv.stopAt < 140 && mv.dirEnd < 0.2,
			'with you within 120 and an enemy within 240 it closes in at half speed (dir up to 0.5), and stops once it is 120 from you', JSON.stringify(mv));
		A(mv.tp === 1 && mv.tpD <= 75 + 1e-6 && mv.noTp === 0, 'past 520 from you it reappears 70 from you (the leash); at 500 it does not', JSON.stringify(mv));
		A(!mv.arena.moved && mv.arena.drawn === 0 && !mv.arena.vis, 'in a rift arena the partner is hidden and waits (main.gd 1668-1670)', JSON.stringify(mv.arena));

		// the shots: its move, ×0.8 of your attack, your size, ×1.15 cooldown, the level
		const sh = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player, o = C.mate, out = {};
			const def = { dex: 19, name: 'T19', hp: 1e7, spd: 0.001, dmg: 1, xp: 0, behavior: 'chaser' };
			G.EnemyMgr.clear(); G.Projectiles.clear();
			const e = new G.Enemy(def, o.x + 120, o.y, { hp: 1, spd: 1, dmg: 1 }); e.flying = true; e.spd = 0; G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
			const mine = () => G.Projectiles.all().filter(p => p.fromMate);
			const shoot = () => { G.Projectiles.clear(); C.update(1 / 60, pl); for (let i = 0; i < 400 && !mine().length; i++) C.update(1 / 60, pl); return mine()[0]; };
			let p = shoot();
			const m = C.move;
			out.first = p && { dmg: p.dmg, want: m.dmg * pl.atk * 0.8, r: p.r, size: m.size * pl.sizeK(), owner: p.owner === pl, src: G.DmgLog.keyOf(p), mid: p.mid, ang: Math.abs(Math.atan2(p.vy, p.vx)) };
			out.cd = C.cd; out.cdWant = m.cd * 1.15 - 0; out.cdMul = pl.cdMul;
			// shared upgrades: your attack ×2, the Big Orb (size ×1.3)
			pl.atkMul *= 2; pl.equip('bigorb', 1);
			p = shoot();
			out.shared = p && { dmg: p.dmg, want: m.dmg * pl.atk * 0.8, r: p.r, size: m.size * pl.sizeK(), k: pl.sizeK() };
			pl.atkMul /= 2; pl.equip(null, 1);
			// your cooldown upgrades are not its: the cooldown stays ×1.15
			pl.cdMul = 0.5; p = shoot(); out.cd2 = C.cd; pl.cdMul = out.cdMul;
			// the level: 1 + your level / 6
			pl.level = 12; C.update(1 / 60, pl); out.lv12 = C.move.lvl; out.lv12dmg = C.move.dmg;
			pl.level = 99; C.update(1 / 60, pl); out.lv99 = C.move.lvl;
			pl.level = 1; C.update(1 / 60, pl);
			out.wantLv12 = G.Moves.instance('water-gun', 3).dmg;
			return out;
		});
		A(sh.first && near(sh.first.dmg, sh.first.want, 1e-9) && near(sh.first.r, sh.first.size, 1e-9) && sh.first.owner && sh.first.src === 'ally' && sh.first.mid === 'water-gun' && sh.first.ang < 0.2,
			'it shoots its own Water Gun at the nearest enemy: damage = the move × YOUR attack × 0.8, as yours (your crits, items), counted as "Partner / team"', JSON.stringify(sh.first));
		A(near(sh.cd, sh.cdWant - 1 / 60, 0.02) || near(sh.cd, sh.cdWant, 0.02), 'its cooldown is the move\'s ×1.15', JSON.stringify([sh.cd, sh.cdWant]));
		A(sh.shared && near(sh.shared.dmg, sh.shared.want, 1e-9) && near(sh.shared.dmg, sh.first.dmg * 2, 1e-6) && near(sh.shared.r, sh.first.r * 1.3, 1e-6),
			'"It shares your upgrades": your attack ×2 doubles its shots and the Big Orb makes them ×1.3 bigger', JSON.stringify(sh.shared));
		A(near(sh.cd2, sh.cd, 0.02), 'your cooldown upgrades are not its (still ×1.15, main.gd 1721)', JSON.stringify([sh.cd2, sh.cd]));
		A(sh.lv12 === 3 && near(sh.lv12dmg, sh.wantLv12, 1e-9) && sh.lv99 === 5, 'at your level 12 its move is level 3; at 99 it stops at the top level of the move (5 for projectiles; the port asks for 6, past its 4-step ladder)', JSON.stringify(sh));

		// real hits in the running game go to "Partner / team" (your own move is held back)
		const hit0 = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player, o = C.mate;
			G.DmgLog.reset(); G.EnemyMgr.clear(); G.Projectiles.clear();
			for (const m of pl.moves) m.t = 1e9;
			o.x = pl.x + 80; o.y = pl.y;
			const def = { dex: 19, name: 'T19', hp: 1e7, spd: 0.001, dmg: 1, xp: 0, behavior: 'chaser' };
			const e = new G.Enemy(def, o.x + 110, o.y, { hp: 1, spd: 1, dmg: 1 }); e.flying = true; e.spd = 0; G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
			window.__e = e;
			return e.hp;
		});
		await sleep(2500);
		const hit = await E(h0 => { const e = window.__e, raw = G.DmgLog.raw; for (const m of G.Game.player.moves) m.t = 0.5; return { lost: h0 - e.hp, ally: raw.dmg.ally || 0, mine: Object.keys(raw.dmg).filter(k => k.startsWith('move:')) }; }, hit0);
		A(hit.lost > 0 && near(hit.ally, hit.lost, 0.01) && hit.mine.length === 0, 'in the running game its Water Gun hits the enemy and all that damage is "Partner / team"', JSON.stringify(hit));
		// the minimap dot (its colour), and the canvas text
		const mm = await E(() => ({ dots: G.Minimap.drawn.filter(d => d.kind === 'mate').length, shown: G.Minimap.shown ? G.Minimap.shown() : true }));
		A(mm.dots === 1, 'the minimap shows the partner as a dot', JSON.stringify(mm));
		await E(() => { G.Game.togglePause(); });
		await sleep(250);
		const pz = await spanishOn('#scr-pause');
		A(pz.bad.length === 0 && /Co-op Mode/i.test(pz.txt), 'the pause screen says "Co-op Mode" and shows no Spanish', JSON.stringify(pz));
		await E(() => { G.Game.togglePause(); });
		await sleep(150);
	}

	// ================= 5. player 2: the second pad =================
	if (!ONLY.length || ONLY.includes('5')) {
		if (!(await E(() => G.Game.state === 'playing' && G.LocalCoop.on))) await startCoop();
		await calm();
		// player 1 picks up pad 0
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(400);
		await press(15, 0);
		await sleep(300);
		const p1 = await E(() => ({ active: G.Pad.active, ctrl: G.LocalCoop.ctrl }));
		A(p1.active && p1.ctrl === 'ai', 'one pad: it is player 1\'s and the partner stays with the AI', JSON.stringify(p1));
		await E(() => { window.__toasts.length = 0; window.__pads[1] = window.__mkPad(1, 'Synthetic Second Controller (STANDARD GAMEPAD)'); });
		await sleep(300);
		const p2 = await E(() => ({ ctrl: G.LocalCoop.ctrl, idx: G.LocalCoop.padIdx, tag: G.LocalCoop.mate.tag, toasts: window.__toasts.slice() }));
		A(p2.ctrl === 'p2' && p2.idx === 1 && p2.tag === 'J2' && p2.toasts.includes('Player 2: controller connected'), 'a second pad: player 2 takes the partner ("Player 2: controller connected", tagged P2)', JSON.stringify(p2));
		const st = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player, o = C.mate, out = {};
			const run = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) C.update(dt, pl); };
			G.EnemyMgr.clear();
			o.x = pl.x + 60; o.y = pl.y;
			__axes(1, 1, 0); let x0 = o.x; run(30); out.full = o.x - x0;
			__axes(1, 0.5, 0); x0 = o.x; run(30); out.half = o.x - x0;
			__axes(1, 0.2, 0.05); x0 = o.x; const y0 = o.y; run(30); out.dead = Math.hypot(o.x - x0, o.y - y0);
			__axes(1, 0, 0.9); const y1 = o.y; run(30); out.down = o.y - y1;
			__axes(1, 0, 0); o.x = pl.x + 60; o.y = pl.y; x0 = o.x; run(30); out.idle = Math.abs(o.x - x0);
			out.p1axis = G.Pad.axis();   // pad 1's stick never moves player 1
			__axes(1, 1, 0); out.p1axis2 = G.Pad.axis(); __axes(1, 0, 0);
			return out;
		});
		A(near(st.full, 59, 0.6) && near(st.half, 29.5, 0.6) && st.dead < 0.01 && near(st.down, 53.1, 0.6) && st.idle < 0.01,
			'player 2\'s left stick moves it at 118 × the stick (not rescaled), nothing under the 0.22 deadzone, and with the stick at rest it stands still (no AI)', JSON.stringify(st));
		A(st.p1axis === null && st.p1axis2 === null, 'player 2\'s stick never moves player 1', JSON.stringify(st));
		await E(() => { G.LocalCoop.mate.x = G.Game.player.x + 70; __axes(1, 0.6, -0.3); });
		await sleep(500);
		await E(() => { __axes(1, 0, 0); });
		await shot('coop_p2_run.png');
		// player 2 has no buttons: pause / confirm on pad 1 do nothing
		await press(9, 1); await sleep(150);
		const nb = await E(() => ({ st: G.Game.state, active: G.Pad.active }));
		A(nb.st === 'playing', 'player 2\'s Pause does nothing (player 2 has no buttons, as in the port)', JSON.stringify(nb));
		// player 1 still drives the menus: pause with pad 0; pad 1 can't move the focus or press anything
		await press(9, 0); await sleep(250);
		const pm = await E(() => ({ st: G.Game.state, pause: G.UI.isOpen('scr-pause'), focus: (document.querySelector('.pad-focus') || {}).id || '' }));
		await press(13, 1); await press(1, 1); await press(0, 1); await sleep(200);
		const pm2 = await E(() => ({ st: G.Game.state, pause: G.UI.isOpen('scr-pause'), focus: (document.querySelector('.pad-focus') || {}).id || '' }));
		A(pm.st === 'paused' && pm.pause && pm2.st === 'paused' && pm2.pause && pm2.focus === pm.focus, 'player 1 pauses; player 2\'s D-pad, confirm and cancel leave the pause menu alone', JSON.stringify([pm, pm2]));
		await press(1, 0); await sleep(250);
		A(await E(() => G.Game.state === 'playing'), 'player 1\'s confirm resumes');
		// disconnect -> AI, connect -> P2
		await E(() => { window.__toasts.length = 0; window.__pads[1] = null; });
		await sleep(300);
		const dc = await E(() => ({ ctrl: G.LocalCoop.ctrl, tag: G.LocalCoop.mate.tag, toasts: window.__toasts.slice() }));
		A(dc.ctrl === 'ai' && dc.tag === '' && dc.toasts.includes('Player 2: controller disconnected, the AI takes over your partner'), 'player 2\'s pad unplugged: the AI takes over (and says so)', JSON.stringify(dc));
		const ai = await E(() => { const C = G.LocalCoop, pl = G.Game.player, o = C.mate; o.x = pl.x + 300; o.y = pl.y; const d0 = o.x - pl.x; for (let i = 0; i < 60; i++) C.update(1 / 60, pl); return d0 - (o.x - pl.x); });
		A(ai > 60, 'and the AI walks it back to you', String(ai));
		await E(() => { window.__toasts.length = 0; window.__pads[1] = window.__mkPad(1, 'Synthetic Second Controller (STANDARD GAMEPAD)'); });
		await sleep(300);
		const rc = await E(() => ({ ctrl: G.LocalCoop.ctrl, toasts: window.__toasts.slice() }));
		A(rc.ctrl === 'p2' && rc.toasts.includes('Player 2: controller connected'), 'plugged back in: player 2 takes it again', JSON.stringify(rc));
		// player 1's pad unplugged: one pad left, so the partner goes back to the AI; plug pad 0 in idle: player 2 is pad 1 again,
		// and pad 1's buttons never make it player 1's
		await E(() => { window.__pads[0] = null; });
		await sleep(400);
		const one = await E(() => ({ ctrl: G.LocalCoop.ctrl, active: G.Pad.active }));
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(300);
		await press(1, 1); await press(15, 1); await sleep(200);
		const steal = await E(() => ({ ctrl: G.LocalCoop.ctrl, idx: G.LocalCoop.padIdx, active: G.Pad.active }));
		await press(15, 0); await sleep(250);
		const back = await E(() => ({ ctrl: G.LocalCoop.ctrl, idx: G.LocalCoop.padIdx, active: G.Pad.active }));
		A(one.ctrl === 'ai' && !one.active && steal.ctrl === 'p2' && steal.idx === 1 && !steal.active && back.active && back.idx === 1,
			'player 1\'s pad unplugged leaves one pad (AI); with two again player 2\'s presses never take player 1\'s seat, pad 0\'s press does', JSON.stringify([one, steal, back]));
		await E(() => { window.__pads[0] = null; window.__pads[1] = null; G.Game.togglePause(); G.UI.hide('scr-pause'); G.Game.quit(); });
		await toMenu();
	}

	// ================= 6. fainting: Second Chance, spectating, the revive =================
	if (!ONLY.length || ONLY.includes('6')) {
		A(await startCoop(), 'a new co-op run');
		await calm();
		const f = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player, o = C.mate, out = {};
			G.Weather.reset && G.Weather.reset();
			o.x = pl.x + 80; o.y = pl.y;
			pl.revives = 1; pl.invuln = 0; pl.hurt(1e9);
			out.sc = { down: C.down, revives: pl.revives, hp: pl.hp, max: pl.maxHp, dead: pl.dead };
			pl.maxHp = 1000; pl.hp = 1000;   // (a big max HP: the partner gets it, so the hits below can't knock it out)
			pl.invuln = 0; pl.level = 30; pl.hurt(1e9);
			out.down = { down: C.down, cd: pl.coopDown, dead: pl.dead, hp: pl.hp, mateHp: C.mateHp, mateMax: C.mateMax, max: pl.maxHp, at: pl.x === o.x && pl.y === o.y, z: G.ZMoves.can(pl), dyn: G.Dynamax.can(pl), drawn: C.drawables(pl).length };
			const h0 = C.mateHp;
			pl.hurt(50); out.h1 = h0 - C.mateHp;
			pl.hurt(50); out.h2 = h0 - C.mateHp;          // 0.45 s apart
			C.downTick(0.5, pl);
			const h1 = C.mateHp; pl.hurt(50, 'grass'); out.typed = h1 - C.mateHp; out.grassK = G.Types.mult('grass', o.mon.types) * G.Weather.mult('grass') * 50 * 0.8;
			C.downTick(0.5, pl);
			const h2 = C.mateHp; pl.hurt(30, null, true); out.pure = h2 - C.mateHp;
			out.left = C.downLeft;
			window.__downMate = C.mateHp;
			return out;
		});
		A(f.sc.down === false && f.sc.revives === 0 && f.sc.hp === f.sc.max && !f.sc.dead, 'a lethal hit spends the Second Chance heart first', JSON.stringify(f.sc));
		A(f.down.down && f.down.cd && !f.down.dead && f.down.hp === 0 && f.down.mateHp === f.down.max && f.down.mateMax === f.down.max && f.down.at && f.down.drawn === 1,
			'the next one does not end the run: you spectate (hidden, your body goes with the partner, who gets your max HP)', JSON.stringify(f.down));
		A(f.down.z === false && f.down.dyn === false, 'no Z-move and no Dynamax while spectating (main.gd 1243 / 1267)', JSON.stringify(f.down));
		A(near(f.h1, 40, 1e-9) && near(f.h2, 40, 1e-9) && near(f.typed, f.grassK, 1e-6) && f.typed > 40 && near(f.pure, 30, 1e-9) && f.left > 18.9,
			'your hits go to the partner ×0.8 (a 50 hit takes 40), 0.45 s apart, with its type (Grass is super effective on Squirtle) and pure damage as is', JSON.stringify(f));
		await sleep(300);
		await E(() => { window.__rec = true; });
		await sleep(400);
		await shot('coop_spectating.png');
		const hd = await E(() => {
			const rs = G.HUD.rects(), d = rs.find(r => r.name === 'down');
			const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
			return { d: !!d, clash: d ? rs.filter(r => r !== d && r.name !== 'hint' && hit(d, r)).map(r => r.name) : [] };
		});
		A(hd.d && hd.clash.length === 0, 'the spectating box ("Spectating: you revive in N s", your partner\'s HP) overlaps nothing on the HUD', JSON.stringify(hd));
		const rv = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player, o = C.mate, out = {};
			// enemies near the partner get pushed away on the revive
			const def = { dex: 19, name: 'T19', hp: 1e7, spd: 0.001, dmg: 1, xp: 0, behavior: 'chaser' };
			const e = new G.Enemy(def, o.x - 50 + 30, o.y + 10, { hp: 1, spd: 1, dmg: 1 }); e.flying = true; G.EnemyMgr.add(e);
			C.downTick(20, pl);
			out.r = { down: C.down, cd: pl.coopDown, hp: pl.hp, half: pl.maxHp * 0.5, inv: pl.invuln, kx: Math.hypot(e.kx, e.ky), d: Math.hypot(pl.x - o.x, pl.y - o.y) };
			G.EnemyMgr.clear();
			pl.invuln = 1e9;
			return out;
		});
		A(!rv.r.down && !rv.r.cd && near(rv.r.hp, rv.r.half, 1e-9) && rv.r.inv === 2.5 && near(rv.r.kx, 450, 1e-6) && rv.r.d < 80,
			'after 20 s your partner revives you next to it with half your HP, 2.5 s invulnerable, enemies within 220 knocked back 450', JSON.stringify(rv));
	}

	// ================= 7. the run end: -20 % coins, stats, the breakdown, the partner falling =================
	if (!ONLY.length || ONLY.includes('7')) {
		if (!(await E(() => G.Game.state === 'playing' && G.LocalCoop.on))) await startCoop();
		await calm();
		await E(() => {
			const s = G.DB.save;
			window.__st0 = { coop: s.stats.coopRuns || 0, group: s.stats.groupRuns || 0, ach: !!(s.ach || {}).group1 };
			// some partner damage for the breakdown (and some of yours)
			G.DmgLog.as('ally', () => G.DmgLog.note(300, true));
			G.DmgLog.as('move:' + G.Game.player.moves[0].id, () => G.DmgLog.note(700, true));
		});
		const end = await E(() => {
			const C = G.LocalCoop, pl = G.Game.player;
			G.Game.debugTime(75);
			pl.coins = 40; pl.kills = 12;
			pl.revives = 0; pl.invuln = 0; pl.hurt(1e9);           // down
			const was = C.down;
			C.downTick(0.5, pl); pl.hurt(1e9);                     // the partner falls: the run is over
			const time = G.Game.st.time;
			const parts = Math.floor(time / 5) + Math.floor(pl.kills * 0.25) + pl.bosses * 80 + pl.coins;
			const s = G.DB.save;
			window.__pre = { ach: Object.keys(s.ach || {}), zmis: Object.keys(s.zmis || {}) };
			return { was, dead: pl.dead, down: C.down, parts, coinMul: pl.coinMul, coins: s.coins, time };
		});
		A(end.was && end.dead && !end.down, 'when the partner falls while you spectate, the run ends (main.gd _hurt_partner -> _player_final_death)', JSON.stringify(end));
		A(await waitFor(() => visible('scr-over'), 8000), 'the result screen');
		await sleep(700);
		const o = await E(() => {
			const s = G.DB.save;
			const rows = [...document.querySelectorAll('#over-dmg tr')].map(r => r.innerText.replace(/\s+/g, ' ').trim());
			return { mode: (document.querySelector('#scr-over .over-mode') || {}).innerText, coins: s.coins, st: { coop: s.stats.coopRuns, group: s.stats.groupRuns }, ach: !!s.ach.group1, st0: window.__st0, rows,
				breakdown: (document.querySelector('#scr-over') || {}).innerText.match(/×0\.80[^·\n]*/) };
		});
		A(/Co-op Mode/.test(o.mode || ''), 'the result says "Co-op Mode"', o.mode);
		const b = await bonus();
		A(o.coins - end.coins === Math.round(end.parts * 0.8 * end.coinMul) + b && o.breakdown, '-20 % coins on the real result: (time + defeats + bosses + picked up) × 0.8 × your Fortune (main.gd 816)', JSON.stringify([o.coins - end.coins, end.parts, end.coinMul, b, o.breakdown]));
		A(o.st.coop === o.st0.coop + 1 && o.st.group === o.st0.group + 1 && o.ach, 'stats: coopRuns +1 and, at 75 s, groupRuns +1, which unlocks "In good company" (progress.gd 105, group1)', JSON.stringify(o));
		A(o.rows.some(r => /^Partner \/ team 300 \(30%\) 1$/.test(r)), 'the run-over breakdown has the "Partner / team" row with its damage, share and defeats', JSON.stringify(o.rows));
		const spo = await spanishOn('#scr-over');
		A(spo.bad.length === 0, 'the result shows no Spanish in English mode', JSON.stringify(spo));
		await E(() => { const el = document.getElementById('over-dmg'); if (el) el.scrollIntoView({ block: 'center' }); });
		await sleep(200);
		await shot('coop_over_breakdown.png');
		await toMenu();
		// a short run (under 60 s) counts as a co-op run but not a group run
		await uncalm();
		await startCoop();
		await E(() => { window.__st1 = { coop: G.DB.save.stats.coopRuns, group: G.DB.save.stats.groupRuns }; G.Game.quit(); });
		await waitFor(() => visible('scr-over'), 8000);
		const sh = await E(() => ({ coop: G.DB.save.stats.coopRuns, group: G.DB.save.stats.groupRuns, st1: window.__st1, on: G.LocalCoop.on, mate: !!G.LocalCoop.mate }));
		A(sh.coop === sh.st1.coop + 1 && sh.group === sh.st1.group && !sh.on && !sh.mate, 'a run under 60 s: coopRuns +1, groupRuns unchanged; the partner is gone after the run', JSON.stringify(sh));
		await toMenu();
		// a normal run has no partner
		await openModes();
		await E(() => document.querySelector('#modes-list [data-mode=normal]').click());
		await waitFor(() => E(() => G.Game.state === 'playing'), 15000);
		const nr = await E(() => ({ on: G.LocalCoop.on, mode: G.Game.mode }));
		A(!nr.on && nr.mode === 'normal', 'a normal run has no partner', JSON.stringify(nr));
		await E(() => G.Game.quit());
		await toMenu();
	}

	// ================= 8. no Spanish on the canvas; the Lexicon =================
	if (!ONLY.length || ONLY.includes('8')) {
		const drawn = await E((src) => {
			window.__rec = false;
			const re = new RegExp(src, 'i'), all = [...window.__drawn];
			const names = G.DEX.map(p => p.name);
			const bad = all.filter(s => re.test(s.replace(/Pok[ée]mon/g, '')) && !names.includes(s));
			return { ai: all.some(s => / · AI$/.test(s)), p2: all.some(s => s === 'P2'), spect: all.some(s => /^Spectating: you revive in \d+ s$/.test(s)), hp: all.includes('Your partner\'s HP'), mode: all.includes('CO-OP MODE'), bad: bad.slice(0, 10), n: all.length };
		}, SPANISH.source);
		A(drawn.ai && drawn.p2 && drawn.spect && drawn.hp && drawn.mode && drawn.bad.length === 0,
			`no Spanish in the co-op run's canvas (the "· AI" chip, the P2 tag, "Spectating: you revive in N s", "Your partner's HP", "CO-OP MODE"; ${drawn.n} strings drawn)`, JSON.stringify(drawn));
		const lx = await E(() => { const e = G.LexiconUI.entries('md').find(x => x.key === 'md:coop'); return e && { title: G.I18n.t(e.title), desc: G.I18n.t(e.desc), facts: e.facts.map(f => [G.I18n.t(f[0]), G.I18n.t(String(f[1]))]) }; });
		A(lx && lx.title === 'Co-op Mode' && /^A second Pokémon comes along/.test(lx.desc) && lx.facts[0][0] === 'Runs' && lx.facts[1][0] === 'Partner', 'the Lexicon\'s Modes tab has Co-op Mode with your runs and partner, in English', JSON.stringify(lx));
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
