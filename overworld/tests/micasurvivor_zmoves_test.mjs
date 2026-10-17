// micasurvivor_zmoves_test.mjs — MicaSurvivor M5 batch 4: the Z-moves of the Godot Android port by
// JayElDragon (poke-survivor: zmove.gd, main.gd 171-182 / 1226-1322 / 8504-8594, save_data.gd
// 250-266 / 479-551, progress.gd 233-289, menu.gd), driven headlessly while logged in to a stubbed
// Magepunk account (the row micasurvivor:<user> with the server's compare-and-set):
//   - data: 18 Z-moves (one per type) with the port's names / descriptions in English, the generated
//     24x16 crystal icons, 18 Z-crystal missions worth 500 coins
//   - the three unlock routes: 250 defeated of a type (stats.tk_<type>, a real kill), the type's
//     Z-crystal mission (real G.Progress.checkAch, coins once), and the gacha crystal (3 % of x10 pulls
//     over many rolls, only types still locked, never on x1, none when all are unlocked; the real
//     pull and the gacha screen)
//   - the Z-crystal missions tab, the gacha crystal grid, the Pokédex Z line, and the dual-type
//     choice picked with a synthetic gamepad (focus navigation)
//   - the save: unlocks + per-Pokémon choice reach the account; a 409 from another device merges
//     them (union of unlocks, newest choice wins per Pokémon); merge() both ways; sanitize()
//   - in a run: the level-15 gate, locked types, the Z type follows the ACTIVE Pokémon (read at use
//     time: the port's bug), blocked in the Tower mode flag / a rift arena / the Judgment, the 2.2 s
//     cinematic freezing the world, invulnerability throughout (lava too), the 240 s cooldown that
//     only counts after the move ends, damage = (100 + 24 x level) x attack through the normal hit,
//     the 28 % boss cap (and a low boss can still fall), all 18 plans run without errors, deal damage
//     and do their own thing (freeze, paralysis, sleep, confusion, poison, dash, dive, heal...)
//   - input: the Z key, the HUD button (a real click on the canvas), the pad's zmove action (L3 by
//     default), remap with swap-on-conflict, an old saved map gaining zmove, the in-run extras (Y,
//     right trigger), the glyph prompt on the HUD button
// Screenshots (MICASURVIVOR_SHOTS=<dir>): four Z-moves mid-move, the cinematic banner, the HUD button
// on cooldown, the Pokédex Z choice, the Z-crystal missions, the gacha crystal.
// Covers micasurvivor/js/systems/zmoves.js, js/game.js, js/ui/hud.js, js/core/pad.js, js/core/db.js,
// js/mica/account.js, js/systems/gacha.js, js/ui/gacha-ui.js, js/ui/menu.js, js/ui/goals-ui.js,
// js/systems/progress.js, js/world/world.js, js/ui/icons.js, js/entities/player.js,
// js/entities/enemy.js, js/data/lang-en.js, index.html, css/style.css.
//   node overworld/tests/micasurvivor_zmoves_test.mjs
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
const PORT = 8831;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// the port's numbers
const ORDER = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const DUR = { normal: 2.9, fire: 4.2, water: 3.6, electric: 3.6, grass: 3.6, ice: 3.8, fighting: 3.2, poison: 4.2, ground: 3.4, flying: 2.8, psychic: 3.6, bug: 3.9, rock: 4.0, ghost: 3.8, dragon: 3.8, dark: 3.6, steel: 3.0, fairy: 3.6 };
const EN = { normal: 'Starlight Dash', fire: 'Pyrotechnic Holocaust', water: 'Abyssal Hydro Vortex', electric: 'Gigavolt Storm', grass: 'Cataclysmic Bloom', ice: 'Absolute Zero', fighting: 'Total Crush', poison: 'Acid Deluge', ground: 'Tectonic Fury', flying: 'Supersonic Dive', psychic: 'Shattered Mind', bug: 'Devastating Plague', rock: 'Continental Avalanche', ghost: 'Eternal Nightmare', dragon: 'Draconic Cataclysm', dark: 'Abyssal Eclipse', steel: 'Metal Drill', fairy: 'Dreamy Flash' };
const ZMIS = [['normal', 'totalKills', 1500], ['fire', 'bestMin', 8], ['water', 'runs', 15], ['electric', 'bestLevel', 25], ['grass', 'chests', 25], ['ice', 'pulls', 30], ['fighting', 'bossesTotal', 10], ['poison', 'evolutions', 10], ['ground', 'own', 30], ['flying', 'dailyPlays', 5], ['psychic', 'itemsFound', 10], ['bug', 'rushBest', 4], ['rock', 'towerBest', 8], ['ghost', 'riftWins', 5], ['dragon', 'bestMin', 12], ['dark', 'legends', 3], ['steel', 'typeBestMin', 8], ['fairy', 'teamBestMin', 8]];

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
	localStorage.setItem('magepunk_mp_token_v1', 'zmoves-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'ztester' }));
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
				if (f === t) return 'here';
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
	const B = { cancel: 0, confirm: 1, X: 2, Y: 3, RT: 7, L3: 10 };   // Nintendo default (site standard)

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.ZMoves), 30000), 'boots logged in (Magepunk account); G.ZMoves loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	// Charmander as partner (fire); Charizard (fire/flying) and Geodude (rock/ground) owned too
	await E(() => { const s = G.DB.save; for (const d of [4, 6, 74]) G.DB.grant(d, 'starter'); s.partner = 4; s.partnerShiny = false; G.DB.commit(true); });

	// ================= 1. data =================
	{
		const r = await E(() => {
			const Z = G.ZMoves;
			return {
				order: Z.ORDER, k: [Z.NEED, Z.COOLDOWN, Z.MIN_LEVEL, Z.CINE_T, Z.BOSS_CAP, Z.CRYSTAL_P, Z.ZMIS_COINS],
				en: Object.fromEntries(Z.ORDER.map(t => [t, G.I18n.t(Z.DEF[t].name)])),
				descEn: Z.ORDER.map(t => [Z.DEF[t].desc, G.I18n.t(Z.DEF[t].desc)]),
				mis: Z.ZMIS.map(m => [m.type, m.stat, m.goal]), misEn: Z.ZMIS.map(m => [m.desc, G.I18n.t(m.desc)]),
				icons: Z.ORDER.map(t => { const c = G.Icons.canvas('zc:' + t); return c.width + 'x' + c.height; }),
				iconUrl: /^data:image\/svg/.test(G.Icons.url('zc:fire')),
				ui: ['MOVIMIENTO Z', 'Movimiento Z', '¡Movimiento Z listo!', 'Aquí no', 'Cristal Z', 'Cristales Z', 'Movimiento Z desbloqueado', 'Movimiento Z: bloqueado (derrota 250 Pokémon de su tipo)', '¡Cristal Z encontrado! Desbloqueas: Cero Absoluto', '¡Cristal Z: Carrera Estelar!', 'Cristales Z: 3 / 18', 'Movimiento Z desbloqueado · +500 monedas', 'Derrotados de tipo Fuego: 12 / 250', 'Nv. 15'].map(s => [s, G.I18n.t(s)]),
			};
		});
		A(JSON.stringify(r.order) === JSON.stringify(ORDER), '18 Z-moves, one per type, in the port\'s order');
		A(JSON.stringify(r.k) === JSON.stringify([250, 240, 15, 2.2, 0.28, 0.03, 500]), 'the port\'s numbers: 250 kills, 240 s cooldown, level 15, 2.2 s cinematic, 28 % boss cap, 3 % crystal, 500 coins', JSON.stringify(r.k));
		A(JSON.stringify(r.en) === JSON.stringify(EN), 'the port\'s English names (lang_en.json)', JSON.stringify(r.en));
		const badD = r.descEn.concat(r.misEn).filter(([es, en]) => es === en || /[¡¿ñáéíóú]/i.test(en.replace(/Poké/g, '')));
		A(badD.length === 0, 'every description and mission text has English', JSON.stringify(badD));
		A(JSON.stringify(r.mis) === JSON.stringify(ZMIS), '18 Z-crystal missions with the port\'s stats and goals (progress.gd ZMIS)', JSON.stringify(r.mis));
		A(r.icons.every(s => s === '24x16') && r.iconUrl, 'a generated 24x16 crystal icon per type (icons.gd _zcrystal_img), also as an SVG url', JSON.stringify(r.icons));
		const badU = r.ui.filter(([es, en]) => es === en || /[¡¿ñáéíóú]/i.test(en.replace(/Poké/g, '')));
		A(badU.length === 0, 'the new UI strings have English', JSON.stringify(r.ui));
		A(r.ui.find(x => x[0] === 'Derrotados de tipo Fuego: 12 / 250')[1] === 'Fire-type defeated: 12 / 250' && r.ui.find(x => x[0] === 'Nv. 15')[1] === 'Lv. 15', 'patterns translate their holes (Fire-type, Lv. 15)', JSON.stringify(r.ui));
	}

	// ================= 2. unlock routes =================
	{
		// a. 250 defeated of a type (a real kill through G.Progress.kill)
		const a = await E(() => {
			const s = G.DB.save, Z = G.ZMoves;
			s.stats.tk_fire = 248;
			const r = { u248: Z.unlocked('fire') };
			s.stats.tk_fire = 249;
			r.u249 = Z.unlocked('fire');
			G.Progress.kill({ types: ['fire'], boss: false, dex: 4 });
			r.k = s.stats.tk_fire; r.u250 = Z.unlocked('fire'); r.list = Z.unlockedList();
			r.typeFor4 = Z.typeFor(4);
			return r;
		});
		A(!a.u248 && !a.u249 && a.k === 250 && a.u250, 'fire unlocks at the 250th fire-type kill (249: still locked)', JSON.stringify(a));
		A(a.typeFor4 === 'fire' && JSON.stringify(a.list) === '["fire"]', 'Charmander\'s Z is now Pyrotechnic Holocaust (nothing else unlocked)', JSON.stringify(a));

		// b. the Z-crystal mission (real checkAch -> zcheck): 15 runs -> water, 25 chests -> grass
		const b = await E(() => {
			const s = G.DB.save, Z = G.ZMoves;
			const c0 = s.coins;
			s.stats.runs = 14;
			G.Progress.checkAch();
			const r = { w14: Z.unlocked('water'), c14: s.coins - c0 };
			s.stats.runs = 15;
			const c1 = s.coins;
			G.Progress.checkAch();
			r.w15 = Z.unlocked('water'); r.zmis = !!(s.zmis && s.zmis.zc_water); r.zcr = s.stats.zcr_water; r.coins = s.coins - c1;
			const c2 = s.coins;
			G.Progress.checkAch();
			r.again = s.coins - c2;
			s.stats.chests = 0;
			for (let i = 0; i < 24; i++) G.Progress.countChest();
			G.Progress.checkAch();
			r.g24 = Z.unlocked('grass');
			G.Progress.countChest();
			G.Progress.checkAch();
			r.g25 = Z.unlocked('grass'); r.chests = s.stats.chests;
			r.doneW = Z.zdone(Z.ZMIS.find(m => m.type === 'water'));
			return r;
		});
		A(!b.w14 && b.c14 === 0, '14 runs: water still locked, no coins');
		A(b.w15 && b.zmis && b.zcr === 1 && b.coins === 500, 'the 15th run completes the water mission: its crystal (stats.zcr_water) + 500 coins', JSON.stringify(b));
		A(b.again === 0 && b.doneW, 'a completed mission pays once');
		A(!b.g24 && b.g25 && b.chests === 25, 'chests are counted (stats.chests) and the 25th unlocks grass', JSON.stringify(b));
		A(await waitFor(() => E(() => { const el = document.getElementById('ach-pop'); return !!el && /Z-Crystal: (Abyssal Hydro Vortex|Cataclysmic Bloom)!/.test(el.textContent); }), 8000), 'a "Z-Crystal: …!" notice pops up (in English)');

		// c. the gacha crystal: 3 % of x10 pulls, only types still locked
		const c = await E(() => {
			const Z = G.ZMoves, base = JSON.parse(JSON.stringify(G.DB.save));
			const N = 30000, seen = {};
			let got = 0, wrong = 0, one = 0;
			for (let i = 0; i < N; i++) {
				const t = Z.rollCrystal(base, 10);
				if (!t) continue;
				got++;
				seen[t] = (seen[t] || 0) + 1;
				if (['fire', 'water', 'grass'].includes(t)) wrong++;
				delete base.stats['zcr_' + t];     // back to locked for the next roll
			}
			for (let i = 0; i < 3000; i++) if (Z.rollCrystal(base, 1)) one++;
			const all = JSON.parse(JSON.stringify(base));
			for (const t of Z.ORDER) all.stats['zcr_' + t] = 1;
			let none = 0;
			for (let i = 0; i < 3000; i++) if (Z.rollCrystal(all, 10)) none++;
			// the real pull: the crystal rides on the result (the roll forced on)
			const orig = Z.rollCrystal;
			Z.rollCrystal = (s, n) => orig(s, n, () => 0.001);
			const pc = JSON.parse(JSON.stringify(base)); pc.tickets.t1 = 20;
			const r10 = G.Gacha.pull(pc, 10, 1, 't1'), r1 = G.Gacha.pull(pc, 1, 1, 't1');
			Z.rollCrystal = orig;
			return { rate: got / N, wrong, types: Object.keys(seen).sort(), one, none, r10: r10 && r10.zCrystal, r10ok: !!(r10 && pc.stats['zcr_' + r10.zCrystal]), r1: r1 && r1.zCrystal };
		});
		A(c.rate > 0.026 && c.rate < 0.034, `x10 pulls give a Z-crystal ~3 % of the time (${(c.rate * 100).toFixed(2)} % over 30000)`);
		A(c.wrong === 0 && c.types.length === 15, 'only for types still locked (never fire / water / grass; all 15 locked ones come up)', JSON.stringify(c.types));
		A(c.one === 0 && c.none === 0, 'never on a x1 pull, and none once every type is unlocked', JSON.stringify([c.one, c.none]));
		A(c.r10 === 'normal' && c.r10ok && c.r1 === '', 'the real G.Gacha.pull: a x10 pull carries the crystal (first locked: normal) and saves it; a x1 pull none', JSON.stringify(c));
	}

	// ================= 3. gacha screen + Z-crystal missions tab =================
	{
		await E(() => { G.DB.save.tickets.t1 = 10; document.querySelector('#scr-menu [data-go=gacha]').click(); });
		A(await waitFor(() => visible('scr-gacha'), 5000), 'gacha screen');
		const g = await E(() => ({ n: document.querySelectorAll('#gacha-rates .zc-grid span').length, on: document.querySelectorAll('#gacha-rates .zc-grid span.on').length, txt: document.getElementById('gacha-rates').innerText }));
		A(g.n === 18 && g.on === 3 && /Z-Crystal\s+3% · ×10/.test(g.txt) && /Each ×10 pull can give a Z-Crystal/.test(g.txt), 'the gacha shows the crystal rate and the 18 crystals (3 unlocked lit)', JSON.stringify(g));
		// a x10 pull through the real screen, the crystal forced on
		await E(() => { const Z = G.ZMoves, o = Z.rollCrystal; window.__zr = o; Z.rollCrystal = (s, n) => o(s, n, () => 0.001); });
		await page.click('#pull-10');
		A(await waitFor(() => visible('pull-close'), 20000), 'the x10 pull plays out');
		const f = await E(() => { const el = document.querySelector('#pull-results .zc-found'); return el ? { zc: el.dataset.zc, txt: el.innerText } : null; });
		A(f && f.zc === 'normal' && /Z-Crystal found! You unlock: Starlight Dash/.test(f.txt) && await E(() => G.ZMoves.unlocked('normal')), 'the result says "Z-Crystal found! You unlock: Starlight Dash" and normal is unlocked', JSON.stringify(f));
		await shot('gacha_crystal.png');
		await E(() => { G.ZMoves.rollCrystal = window.__zr; document.getElementById('pull-close').click(); });
		await sleep(200);
		await E(() => { document.querySelector('#scr-gacha [data-back]').click(); });
		await waitFor(() => visible('scr-menu'), 5000);

		await E(() => document.querySelector('#scr-menu [data-go=goals]').click());
		A(await waitFor(() => visible('scr-goals'), 5000), 'missions screen');
		await E(() => document.querySelector('#goals-tabs [data-tab=zcr]').click());
		await sleep(300);
		const m = await E(() => ({
			n: document.querySelectorAll('#goals-body .ach.zc').length, ok: [...document.querySelectorAll('#goals-body .ach.zc.ok')].map(e => e.dataset.zc),
			un: [...document.querySelectorAll('#goals-body .ach.zc.unlocked')].map(e => e.dataset.zc), txt: document.getElementById('goals-body').innerText,
			tab: document.querySelector('#goals-tabs [data-tab=zcr]').innerText,
		}));
		A(m.tab === 'Z-Crystals' && m.n === 18 && /Z-Crystals: 3 \/ 18/.test(m.txt), 'a "Z-Crystals" tab with the 18 missions (3 done: water, grass and the gacha crystal)', JSON.stringify({ tab: m.tab, n: m.n, ok: m.ok }));
		A(JSON.stringify(m.ok.sort()) === '["grass","normal","water"]', 'done cards: water, grass (missions) and normal (gacha crystal)', JSON.stringify(m.ok));
		A(m.un.includes('fire') && /Play 15 runs\./.test(m.txt) && /Open 25 chests\./.test(m.txt) && /Unlocked!/.test(m.txt) && /Fire-type defeated|Z-Move unlocked/.test(m.txt), 'fire shows as unlocked (by kills); English texts and progress', m.txt.slice(0, 300));
		await shot('zcrystal_missions.png');
		await E(() => document.querySelector('#scr-goals [data-back]').click());
		await waitFor(() => visible('scr-menu'), 5000);
		const zm = await E(() => G.DB.save.zmis);
		A(zm && zm.zc_water && zm.zc_grass && !zm.zc_normal && await E(() => G.ZMoves.zdone(G.ZMoves.ZMIS[0])), 'save.zmis has the completed missions; the gacha crystal counts its mission as done without paying it (as in the port)', JSON.stringify(zm));
	}

	// ================= 4. Pokédex: the Z line and the dual-type choice (with the pad) =================
	{
		await E(() => { G.DB.save.stats.zcr_flying = 1; document.querySelector('#scr-menu [data-go=dex]').click(); });
		A(await waitFor(() => visible('scr-dex'), 5000), 'Pokédex');
		const cell = async (no) => { await E(no => { const c = [...document.querySelectorAll('#dex-grid .cell')].find(c => c.querySelector('.no').textContent === no); c.click(); }, no); await sleep(250); };
		await cell('004');
		const mono = await E(() => ({ line: (document.querySelector('#dex-detail .z-line') || {}).innerText, pick: document.querySelectorAll('#dex-detail [data-zpick]').length }));
		A(/Z-Move:\s+Pyrotechnic Holocaust/.test(mono.line) && mono.pick === 0, 'Charmander (fire): "Z-Move: Pyrotechnic Holocaust", no choice', JSON.stringify(mono));
		await cell('074');
		const lock = await E(() => { const l = document.querySelector('#dex-detail .z-line'); return l ? { off: l.classList.contains('off'), txt: l.innerText } : null; });
		A(lock && lock.off && /Z-Move: locked \(defeat 250 Pokémon of its type\)/.test(lock.txt), 'Geodude (rock/ground, both locked): "Z-Move: locked (defeat 250 Pokémon of its type)"', JSON.stringify(lock));
		await cell('006');
		const dual = await E(() => ({ btns: [...document.querySelectorAll('#dex-detail [data-zpick]')].map(b => [b.dataset.zpick, b.classList.contains('on'), b.innerText.trim(), b.tagName]), cur: G.ZMoves.typeFor(6) }));
		A(dual.btns.length === 2 && dual.btns[0][0] === 'fire' && dual.btns[0][1] && dual.btns[1][0] === 'flying' && /Supersonic Dive/.test(dual.btns[1][2]) && dual.cur === 'fire' && dual.btns.every(b => b[3] === 'BUTTON'),
			'Charizard (fire + flying unlocked): two buttons, the first type chosen by default', JSON.stringify(dual));
		// the pad drives the choice
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await press(13); await sleep(200);
		A(await navTo('[data-zpick=flying]'), 'the D-pad reaches the "Supersonic Dive" button (focus navigation)');
		await press(B.confirm);
		await sleep(300);
		const picked = await E(() => ({ cur: G.ZMoves.typeFor(6), pz: G.DB.save.pz && G.DB.save.pz[6], on: (document.querySelector('#dex-detail [data-zpick].on') || {}).dataset?.zpick, line: (document.querySelector('#dex-detail .z-line') || {}).innerText, focus: (document.querySelector('.pad-focus') || {}).dataset?.zpick }));
		A(picked.cur === 'flying' && picked.pz && picked.pz.type === 'flying' && picked.pz.at > 0 && picked.on === 'flying' && /Supersonic Dive/.test(picked.line) && picked.focus === 'flying', 'confirm picks it: Charizard\'s Z is Supersonic Dive (save.pz[6] = {type, at})', JSON.stringify(picked));
		await E(() => { for (let n = document.querySelector('#dex-detail [data-zpick]'); n; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) { n.scrollTop = 1e5; break; } });
		await sleep(1800);   // (the toast fades)
		await shot('dex_zchoice.png');
		await E(() => { window.__pads[0] = null; document.querySelector('#scr-dex [data-back]').click(); });
		await waitFor(() => visible('scr-menu'), 5000);
	}

	// ================= 5. the save: account push, a 409 merge, merge() and sanitize() =================
	{
		await E(() => G.DB.commit(true));
		A(await waitFor(() => ROW.rev > 0 && ROW.save && ROW.save.zmis && ROW.save.zmis.zc_water && ROW.save.pz && ROW.save.pz['6'] && ROW.save.pz['6'].type === 'flying', 8000) || (ROW.save && ROW.save.pz && ROW.save.pz['6'] && ROW.save.pz['6'].type === 'flying'), 'the unlocks (zmis, zcr) and the choice (pz) reach the account row', JSON.stringify(ROW.save && { zmis: ROW.save.zmis, pz: ROW.save.pz }));
		// another device wrote meanwhile: an ice crystal, 300 bug kills, an OLDER choice for Charizard and a newer one for Geodude
		const other = JSON.parse(JSON.stringify(ROW.save));
		other.stats.zcr_ice = 1; other.stats.tk_bug = 300; other.zmis.zc_ice = Date.now();
		other.pz['6'] = { type: 'fire', at: 1000 };
		other.pz['74'] = { type: 'rock', at: Date.now() + 5000 };
		other.updated = Date.now() + 5000;      // and its save is the newer one
		ROW.save = other; ROW.rev += 1;
		const rev0 = ROW.rev;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); });
		await waitFor(() => ROW.rev > rev0, 8000);
		const m = await E(() => { const s = G.DB.save, Z = G.ZMoves; return { ice: Z.unlocked('ice'), bug: Z.unlocked('bug'), zmisIce: !!s.zmis.zc_ice, water: Z.unlocked('water'), pz6: s.pz[6] && s.pz[6].type, pz74: s.pz[74] && s.pz[74].type, t6: Z.typeFor(6) }; });
		A(ROW.rev > rev0 && m.ice && m.bug && m.zmisIce && m.water, 'a 409 from another device merges the unlocks: its ice crystal and 300 bug kills join ours (nothing lost)', JSON.stringify(m));
		A(m.pz6 === 'flying' && m.t6 === 'flying' && m.pz74 === 'rock', 'per Pokémon the newest choice wins (Charizard: ours, newer; Geodude: theirs) although their save is newer', JSON.stringify(m));
		A(ROW.save.pz['6'].type === 'flying' && ROW.save.stats.zcr_ice === 1 && ROW.save.zmis.zc_ice, 'the merged save is written back to the account');
		const u = await E(() => {
			const base = () => JSON.parse(JSON.stringify(G.DB.save));
			const a = base(), b = base();
			a.updated = 2000; b.updated = 1000;
			a.zmis = { zc_fire: 5 }; b.zmis = { zc_dark: 7 };
			a.stats.zcr_steel = 1; delete a.stats.zcr_fairy; b.stats.zcr_fairy = 1; delete b.stats.zcr_steel;
			a.pz = { 6: { type: 'fire', at: 10 }, 7: { type: 'water', at: 50 } };
			b.pz = { 6: { type: 'flying', at: 20 }, 8: { type: 'water', at: 1 } };
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			const pick = r => ({ zmis: Object.keys(r.zmis).sort(), steel: r.stats.zcr_steel, fairy: r.stats.zcr_fairy, pz: Object.fromEntries(Object.entries(r.pz).filter(([d]) => ['6', '7', '8'].includes(d)).map(([d, c]) => [d, c.type])) });
			// sanitize: junk choices / mission keys go
			const j = base();
			j.pz = { 6: { type: 'fire', at: 3 }, 7: { type: 'banana' }, 99999: { type: 'fire' }, 25: 'electric' };
			j.zmis = { zc_ice: 1, 'bad key': 2 };
			G.DB.sanitize(j); const sj = j;
			return { r1: pick(r1), r2: pick(r2), sj: sj && { pz: sj.pz, zmis: sj.zmis } };
		});
		A(JSON.stringify(u.r1) === JSON.stringify(u.r2), 'merge() gives the same result both ways', JSON.stringify([u.r1, u.r2]));
		A(u.r1.zmis.includes('zc_fire') && u.r1.zmis.includes('zc_dark') && u.r1.steel === 1 && u.r1.fairy === 1, 'merge(): union of missions and crystals', JSON.stringify(u.r1));
		A(u.r1.pz['6'] === 'flying' && u.r1.pz['7'] === 'water' && u.r1.pz['8'] === 'water', 'merge(): per Pokémon the choice with the latest time wins (the older save\'s newer pick included)', JSON.stringify(u.r1.pz));
		A(JSON.stringify(u.sj.pz) === '{"6":{"type":"fire","at":3}}' && JSON.stringify(u.sj.zmis) === '{"zc_ice":1}', 'sanitize(): bad types, unknown Pokémon, non-objects and bad mission keys are dropped', JSON.stringify(u.sj));
		// back to a clean state for the run: fire (kills), water + grass (missions), normal (gacha), flying (crystal), ice + bug (merged)
		await E(() => { G.DB.save.pz[6] = { type: 'flying', at: Date.now() }; G.DB.commit(true); });
	}

	// ================= 6. the run =================
	await page.click('#scr-menu [data-go=play]');
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'run starts');
	await sleep(400);
	await E(() => {
		const pl = G.Game.player;
		pl.xpMul = 0;                  // no level-up cards in the middle of the test
		G.Game.togglePause(); G.UI.hide('scr-pause');
		G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields();
		window.T = {
			mk(dex, dx, dy, o = {}) {
				const pl = G.Game.player;
				const def = { dex, name: 'T' + dex, hp: o.hp || 1e7, spd: o.spd || 30, dmg: o.dmg || 5, xp: 0, behavior: 'chaser' };
				const e = new G.Enemy(def, pl.x + dx, pl.y + dy, { hp: 1, spd: 1, dmg: 1 }, !!o.boss);
				e.flying = true;
				G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
				return e;
			},
			ring(n, dex = 19, r0 = 90, r1 = 380, o = {}) { const l = []; for (let i = 0; i < n; i++) { const a = i / n * 6.2832, r = r0 + (r1 - r0) * (i % 4) / 3; l.push(T.mk(dex, Math.cos(a) * r, Math.sin(a) * r * 0.8, o)); } return l; },
			reset() { G.ZMoves.reset(); G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.FX.clear(); G.EnemyMgr.rebuildGrid(); },
			// start a Z from the paused run (the checks want 'playing'), then step it by hand
			start() { G.Game.togglePause(); const ok = G.ZMoves.tryStart(G.Game.player); G.Game.togglePause(); G.UI.hide('scr-pause'); return ok; },
			can() { G.Game.togglePause(); const ok = G.ZMoves.can(G.Game.player); G.Game.togglePause(); G.UI.hide('scr-pause'); return ok; },
			step(sec, dt = 1 / 60, world = true) {
				const pl = G.Game.player;
				for (let t = 0; t < sec - 1e-9; t += dt) {
					if (G.ZMoves.cine) G.ZMoves.cineTick(dt, pl);
					else {
						if (world) { G.EnemyMgr.update(dt, [pl]); G.EnemyMgr.rebuildGrid(); }
						G.ZMoves.update(dt, pl); G.ZMoves.updateWorld(dt);
					}
					G.FX.update(dt);
				}
			},
		};
	});
	A(await E(() => G.Game.state) === 'paused', 'run paused for stepping');

	// ---------- a. the level-15 gate, locked types, the type follows the ACTIVE Pokémon
	{
		const r = await E(() => {
			const pl = G.Game.player, Z = G.ZMoves;
			T.reset();
			pl.level = 14;
			const r = { c14: T.can(), t: Z.activeType(pl) };
			pl.level = 15;
			r.c15 = T.can();
			pl.dex = 74;                       // Geodude: rock / ground, both locked
			r.lockT = Z.activeType(pl); r.lockC = T.can();
			pl.dex = 6;                        // Charizard: fire + flying, flying chosen in the Pokédex
			r.t6 = Z.activeType(pl);
			pl.dex = 7;                        // Squirtle: water (mission)
			r.t7 = Z.activeType(pl);
			r.started = T.start(); r.type = Z.type; r.state = Z.state;
			T.reset();
			pl.dex = 4;
			return r;
		});
		A(!r.c14 && r.c15 && r.t === 'fire', 'level 14: no Z; level 15: ready (Charmander -> fire)', JSON.stringify(r));
		A(r.lockT === '' && !r.lockC, 'a Pokémon with no unlocked type has no Z', JSON.stringify(r));
		A(r.t6 === 'flying' && r.t7 === 'water' && r.started && r.type === 'water' && r.state === 'cine', 'the Z type follows the ACTIVE Pokémon at use time (Charizard -> its choice flying, Squirtle -> water; the started Z is water)', JSON.stringify(r));
	}

	// ---------- b. blocked: the Tower mode flag, a rift arena, the Judgment
	{
		const r = await E(() => {
			const pl = G.Game.player, Z = G.ZMoves;
			T.reset(); pl.level = 20;
			const out = { base: T.can() };
			const draw = () => { const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; return Z.drawButton(cv.getContext('2d'), 1280, 720, pl); };
			out.btn = !!draw();
			G.Game.mode = 'tower';
			out.tower = T.can(); out.towerStart = T.start(); out.towerBtn = !!draw();
			G.Game.mode = 'normal';
			const swap = (obj, key, val, fn) => { const d = Object.getOwnPropertyDescriptor(obj, key); Object.defineProperty(obj, key, { configurable: true, get: () => val }); try { return fn(); } finally { Object.defineProperty(obj, key, d); } };
			out.rift = swap(G.Rift, 'inArena', true, () => [T.can(), T.start(), Z.blocked(), !!draw()]);
			out.judg = swap(G.Judgment, 'active', true, () => [T.can(), T.start(), Z.blocked()]);
			out.after = T.can() && !G.Rift.inArena && !G.Judgment.active && G.Game.mode === 'normal';
			return out;
		});
		A(r.base && r.btn, 'normally: usable, the HUD button is drawn');
		A(!r.tower && !r.towerStart && !r.towerBtn, 'G.Game.mode = "tower" (batch 8): no Z and no button', JSON.stringify(r));
		A(!r.rift[0] && !r.rift[1] && r.rift[2] && r.rift[3], 'in a rift arena: not usable (the button shows greyed, "Not here")', JSON.stringify(r.rift));
		A(!r.judg[0] && !r.judg[1] && r.judg[2], 'in the Judgment of Arceus: not usable', JSON.stringify(r.judg));
		A(r.after, 'back to normal afterwards');
	}

	// ---------- c. the timeline in real time: Z key, cinematic freeze, invulnerability, cooldown after the end
	{
		await E(() => { T.reset(); const pl = G.Game.player; pl.level = 20; pl.dex = 4; pl.hp = pl.maxHp; T.ring(10); G.Game.togglePause(); G.UI.hideAll(); });
		await page.keyboard.press('z');
		await sleep(50);
		const c0 = await E(() => ({ st: G.ZMoves.state, time: G.Game.st.time, type: G.ZMoves.type, used: G.ZMoves.used }));
		A(c0.st === 'cine' && c0.type === 'fire' && c0.used, 'the Z key starts it: the cinematic (fire)', JSON.stringify(c0));
		await sleep(700);
		await shot('zmove_cinematic.png');
		const c1 = await E(() => { const pl = G.Game.player, hp = pl.hp; pl.invuln = 0; pl.hurt(99999); return { st: G.ZMoves.state, time: G.Game.st.time, hp0: hp, hp1: pl.hp, dead: pl.dead }; });
		A(c1.st === 'cine' && near(c1.time, c0.time, 0.05), `the world (and the run clock) is frozen during the cinematic (${c0.time.toFixed(2)} -> ${c1.time.toFixed(2)})`, JSON.stringify(c1));
		A(c1.hp1 === c1.hp0 && !c1.dead, 'invulnerable during the cinematic (a 99999 hit with invuln forced to 0 does nothing)', JSON.stringify(c1));
		A(await waitFor(() => E(() => G.ZMoves.state === 'fx'), 3000), 'after 2.2 s the move itself starts');
		const f1 = await E(() => { const pl = G.Game.player, hp = pl.hp; pl.invuln = 0; pl.hurt(99999); pl.invuln = 0; pl.hurt(50, 'water', true); return { hp0: hp, hp1: pl.hp, cd: G.ZMoves.cd, time: G.Game.st.time }; });
		A(f1.hp1 === f1.hp0 && f1.cd === 0, 'invulnerable during the move too (also to "pure" damage and with invuln reset, like lava); no cooldown yet', JSON.stringify(f1));
		await sleep(400);
		A(await E(t => G.Game.st.time > t, f1.time), 'the world runs during the move');
		A(await waitFor(() => E(() => G.ZMoves.state === ''), 6000), 'the move ends');
		const e1 = await E(() => ({ cd: G.ZMoves.cd, used: G.ZMoves.used, can: G.ZMoves.can(G.Game.player), hidden: G.Game.player.zHidden }));
		A(e1.used && e1.cd > 239 && e1.cd <= 240 && !e1.can && !e1.hidden, `the 240 s cooldown starts when the move ends (${e1.cd.toFixed(2)} s)`, JSON.stringify(e1));
		await sleep(1000);
		const e2 = await E(() => G.ZMoves.cd);
		A(e2 < e1.cd - 0.7 && e2 > e1.cd - 1.5, `it counts down in play (${e1.cd.toFixed(2)} -> ${e2.toFixed(2)})`);
		await shot('hud_zbutton_cooldown.png');
		await E(() => { G.Game.togglePause(); G.UI.hide('scr-pause'); });
		const e3 = await E(() => { const c = G.ZMoves.cd; G.ZMoves.update(c - 0.5, G.Game.player); const r = { mid: G.ZMoves.used }; G.ZMoves.update(1, G.Game.player); r.end = G.ZMoves.used; r.cd = G.ZMoves.cd; r.can = T.can(); return r; });
		A(e3.mid && !e3.end && e3.cd === 0 && e3.can, 'when it runs out the Z is ready again', JSON.stringify(e3));
	}

	// ---------- d. damage: (100 + 24 x level) x attack, through the normal hit
	{
		const r = await E(() => {
			const pl = G.Game.player, Z = G.ZMoves;
			T.reset(); pl.level = 23; pl.dex = 4; pl.critChance = 0; pl.atkMul = 1.7;
			pl.dex = 25;                                     // Pikachu: electric (unlocked below)
			G.DB.save.stats.zcr_electric = 1;
			const e = T.mk(19, 140, 0);                      // Rattata (normal): electric is neutral
			T.start(); T.step(2.2 + 1 / 60, 1 / 60, false);
			const fx = Z.fx;
			const want = (100 + 24 * 23) * pl.atk;
			const hp0 = e.hp;
			T.step(0.3, 1 / 60, false);                      // the first chain hits at 0.2 s
			const k = G.Types.mult('electric', e.types) * G.Weather.mult('electric') * (pl.abFx ? G.Abilities.outK(pl, e, 'electric', 'zmove') : 1) * G.Items.outK(pl, e, 'electric');
			const r = { dmg: fx.dmg, want, lost: hp0 - e.hp, expect: Math.round(fx.dmg * 1.1 * k), para: e.paraT > 0, k };
			T.reset(); pl.dex = 4; pl.atkMul = 1;
			return r;
		});
		A(near(r.dmg, r.want, 1e-6), `base damage = (100 + 24 x 23) x attack = ${r.want.toFixed(1)}`, JSON.stringify(r));
		A(Math.abs(r.lost - r.expect) <= 1, `a real hit goes through G.Combat.land: the first Gigavolt Storm bolt does base x 1.1 x type/ability/items = ${r.expect} (got ${r.lost})`, JSON.stringify(r));
		A(r.para, 'and paralyses (the port\'s cc "para" at 100 %)');
	}

	// ---------- e. the 28 % boss cap
	{
		const r = await E(() => {
			const pl = G.Game.player, Z = G.ZMoves;
			T.reset(); pl.level = 60; pl.dex = 4; pl.atkMul = 5000;     // every hit far beyond the cap
			const boss = T.mk(150, 160, 0, { hp: 200000, boss: true });
			for (const e of T.ring(6)) e.hp = e.maxHp = 50;
			T.start(); T.step(2.2 + 4.4, 1 / 60, false);
			const out = { lost: boss.maxHp - boss.hp, max: boss.maxHp, alive: !boss.dead, done: Z.state === '' };
			T.reset();
			const low = T.mk(150, 160, 0, { hp: 200000, boss: true });
			low.hp = Math.round(low.maxHp * 0.1);                       // 10 % left < 28 %: the Z may finish it
			T.start(); T.step(2.2 + 4.4, 1 / 60, false);
			out.lowDead = low.dead || low.hp <= 0;
			T.reset(); pl.atkMul = 1;
			return out;
		});
		A(r.done && r.alive && r.lost <= r.max * 0.28 + 1 && r.lost >= r.max * 0.279, `a Z takes at most 28 % of a boss's max HP (${r.lost} of ${r.max} = ${(r.lost / r.max * 100).toFixed(2)} %) even with huge attack`, JSON.stringify(r));
		A(r.lowDead, 'a boss with less than 28 % left can still fall to it');
	}

	// ---------- f. all 18 plans: run without errors, deal damage, do their own thing
	{
		const res = await E((ORDER) => {
			const pl = G.Game.player, Z = G.ZMoves, s = G.DB.save;
			for (const t of ORDER) s.stats['zcr_' + t] = 1;
			const out = {};
			for (const type of ORDER) {
				T.reset();
				const mon = G.DEX.find(p => p.types.length === 1 && p.types[0] === type) || G.DEX.find(p => p.types[0] === type);
				pl.dex = mon.dex; s.pz[mon.dex] = { type, at: Date.now() };
				pl.level = 30; pl.atkMul = 1; pl.critChance = 0; pl.hp = pl.maxHp * 0.5;
				const x0 = pl.x, y0 = pl.y, hp0 = pl.hp;
				const foes = T.ring(14);
				const d0 = foes.reduce((a, e) => a + Math.hypot(e.x - x0, e.y - y0), 0) / foes.length;
				const sig = { frozen: 0, para: 0, sleep: 0, conf: 0, poison: 0, hidden: false, wisps: 0, moved: 0, slow: 0 };
				let err = null, t = 0;
				try {
					if (!T.start()) { out[type] = { err: 'did not start' }; continue; }
					T.step(2.2 + 1 / 120);
					while (Z.state === 'fx' && t < 8) {
						T.step(1 / 60); t += 1 / 60;
						for (const e of foes) {
							if (e.frozenT > 0) sig.frozen++; if (e.paraT > 0) sig.para++; if (e.sleepT > 0) sig.sleep++; if (e.confT > 0) sig.conf++;
							if (e.poison > 0) sig.poison++; if (e.slow > 0) sig.slow++;
						}
						if (pl.zHidden) sig.hidden = true;
						sig.wisps = Math.max(sig.wisps, Z.wisps);
						sig.moved = Math.max(sig.moved, Math.hypot(pl.x - x0, pl.y - y0));
					}
				} catch (e) { err = String(e && e.stack || e).slice(0, 300); }
				const dealt = foes.reduce((a, e) => a + (e.maxHp - Math.max(0, e.hp)), 0);
				const d1 = foes.reduce((a, e) => a + Math.hypot(e.x - x0, e.y - y0), 0) / foes.length;
				out[type] = { err, t: +(t + 1 / 60).toFixed(3), dealt: Math.round(dealt), hit: foes.filter(e => e.hp < e.maxHp).length, sig, healed: Math.round(pl.hp - hp0), pull: Math.round(d0 - d1), cd: Z.cd, hidden: pl.zHidden };
			}
			T.reset(); pl.dex = 4; pl.hp = pl.maxHp;
			return out;
		}, ORDER);
		for (const type of ORDER) {
			const r = res[type] || { err: 'missing' };
			A(!r.err && r.dealt > 0 && r.hit >= 1 && Math.abs(r.t - DUR[type]) < 0.08 && r.cd === 240 && !r.hidden,
				`${type}: ${EN[type]} runs ${DUR[type]} s without errors and hits ${r.hit}/14 for ${r.dealt}`, JSON.stringify(r));
		}
		const R = res;
		A(R.ice.sig.frozen > 0 && R.electric.sig.para > 0 && R.fairy.sig.sleep > 0 && R.psychic.sig.conf > 0, 'ice freezes, electric paralyses, fairy puts to sleep, psychic confuses', JSON.stringify([R.ice.sig, R.electric.sig, R.fairy.sig, R.psychic.sig]));
		A(R.poison.sig.poison > 0 && R.bug.sig.poison > 0 && R.ground.sig.slow > 0 && R.grass.sig.slow > 0 && R.dark.sig.slow > 0, 'poison pools and the bug swarm poison; ground cracks, grass roots and the dark ring slow', JSON.stringify([R.poison.sig, R.bug.sig, R.ground.sig, R.grass.sig, R.dark.sig]));
		A(R.flying.sig.hidden && R.flying.sig.moved > 30 && R.normal.sig.moved > 200 && R.steel.sig.moved > 200 && R.fighting.sig.moved > 30, 'flying vanishes and dives; normal and steel dash across; fighting leaps on its target', JSON.stringify([R.flying.sig, R.normal.sig.moved, R.steel.sig.moved, R.fighting.sig.moved]));
		A(R.fire.sig.wisps >= 20, `fire: a crown of will-o'-wisps (${R.fire.sig.wisps} at once, drawn in code)`);
		A(R.grass.healed > 0 && R.ghost.healed > 0 && R.fairy.healed > 0, 'grass, ghost and fairy heal you', JSON.stringify([R.grass.healed, R.ghost.healed, R.fairy.healed]));
		A(R.water.pull > 0 && R.dark.pull > 0, 'the water vortex and the dark ring drag enemies inward', JSON.stringify([R.water.pull, R.dark.pull]));
	}

	// ---------- g. input: the HUD button (a real click), the pad's zmove action, remap, migration, extras, glyph
	{
		const goPlay = () => E(() => { T.reset(); const pl = G.Game.player; pl.level = 20; pl.dex = 4; if (G.Game.state !== 'playing') { G.Game.togglePause(); G.UI.hideAll(); } });
		await goPlay();
		await sleep(150);
		const rect = await E(() => { const c = document.getElementById('game'); const r = G.ZMoves.buttonRect(c.clientWidth, c.clientHeight); return r; });
		await page.mouse.click(rect.x + rect.s / 2, rect.y + rect.s / 2);
		await sleep(80);
		A(await E(() => G.ZMoves.state === 'cine'), 'clicking / tapping the HUD Z button starts it (G.Touch button)', JSON.stringify(rect));
		await goPlay();
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await sleep(2200);       // (signed-in check refresh)
		await press(B.L3);
		A(await E(() => G.ZMoves.state === 'cine'), 'the pad\'s zmove action (L3 by default) starts it');
		// the glyph prompt on the HUD button in pad mode
		const gl = await E(() => new Promise(res => { const o = G.Pad.drawGlyph, seen = []; G.Pad.drawGlyph = function (ctx, k, ...a) { seen.push(k); return o.call(this, ctx, k, ...a); }; G.ZMoves.reset(); requestAnimationFrame(() => requestAnimationFrame(() => { G.Pad.drawGlyph = o; res({ seen, mode: G.Pad.mode }); })); }));
		A(gl.mode === 'pad' && gl.seen.includes('zmove'), 'in pad mode the HUD button shows the zmove button glyph', JSON.stringify(gl));
		await shot('hud_zbutton_pad.png');
		await goPlay();
		await press(B.RT);
		A(await E(() => G.ZMoves.state === 'cine'), 'the right trigger (unbound) also fires it in a run (main.gd _z_poll)');
		await goPlay();
		await press(B.Y);
		A(await E(() => G.ZMoves.state === 'cine'), 'Y / top face (reroll\'s button, which only rerolls on the card screen) also fires it in a run, as in the port');
		// remap with swap-on-conflict
		const m = await E(() => { G.Pad.setBtn('zmove', 2); return G.Pad.map(); });
		A(m.zmove === 2 && Object.values(m).filter(v => v === 2).length === 1 && m.prev === 4, 'remap: zmove -> X (left face)', JSON.stringify(m));
		const m2 = await E(() => { G.Pad.setBtn('reroll', 2); return G.Pad.map(); });
		A(m2.reroll === 2 && m2.zmove === 3, 'swap-on-conflict: reroll takes X, zmove takes reroll\'s old button (Y)', JSON.stringify(m2));
		await goPlay();
		await E(() => { G.Pad.setBtn('zmove', 6); });     // ZL
		await sleep(150);
		await press(6);
		A(await E(() => G.ZMoves.state === 'cine'), 'the remapped button (ZL) fires it');
		const html = await E(() => G.Pad.settingsHTML());
		A(/data-bind="zmove"/.test(html) && /Movimiento Z|Z-Move/.test(html), 'Settings > Controls lists a "Z-Move" row to remap');
		const mig = await E(() => {
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 3 });
			const a = G.Pad.map();
			G.Settings.set('padMap', { prev: 4, next: 5, pause: 9, confirm: 1, cancel: 0, reroll: 10 });
			const b = G.Pad.map();
			G.Pad.reset('nintendo');
			return { a, b, d: G.Pad.map(), x: G.Pad.defaults('xbox'), p: G.Pad.defaults('playstation') };
		});
		A(mig.a.zmove === 10 && mig.a.reroll === 3 && mig.a.prev === 4, 'a map saved before batch 4 keeps its buttons and gains zmove = L3', JSON.stringify(mig.a));
		A(mig.b.reroll === 10 && mig.b.zmove === 2, 'if that map already used L3, zmove takes the first free button', JSON.stringify(mig.b));
		A(mig.d.zmove === 10 && mig.x.zmove === 10 && mig.p.zmove === 10, 'defaults: L3 on every layout (pad.gd JOY_BUTTON_LEFT_STICK)', JSON.stringify([mig.d, mig.x, mig.p]));
		await E(() => { window.__pads[0] = null; });
	}

	// ---------- h. screenshots: four Z-moves mid-move
	for (const type of ['fire', 'water', 'electric', 'dark']) {
		await E((type) => {
			T.reset();
			const pl = G.Game.player, s = G.DB.save;
			const mon = G.DEX.find(p => p.types.length === 1 && p.types[0] === type);
			pl.dex = mon.dex; s.pz[mon.dex] = { type, at: Date.now() }; pl.level = 30;
			T.ring(16, 19, 100, 420);
			if (G.Game.state !== 'playing') { G.Game.togglePause(); G.UI.hideAll(); }
			G.ZMoves.tryStart(pl);
		}, type);
		await waitFor(() => E(() => G.ZMoves.state === 'fx'), 4000);
		await sleep(type === 'fire' ? 1300 : type === 'dark' ? 1500 : 700);
		await shot(`zmove_${type}.png`);
	}
	await E(() => { T.reset(); G.Game.player.dex = 4; });

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
