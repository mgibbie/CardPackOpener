// micasurvivor_playflow_test.mjs — MicaSurvivor U1 (Plans/MICASURVIVOR_UNIFIED_PLAN.md): the "Play" flow, one screen
// (#scr-play, js/ui/play-ui.js, css/mx.css) with five steps: Pokémon -> category -> variant -> players -> setup. The REAL
// server handler (server/mp.mjs bundled like the dev server, over sqlite) behind a static server, headless Chrome.
//   1. the menu's Play opens step 1 (not a run); the grid is your collection (owned species only) by generation
//   2. picking a character writes save.partner AND (once the Expedition loads) the League pick (its family's root) + form
//   3. each category shows its variants; each variant reaches Setup; START begins the same run G.Modes.plan(mode) plans
//      (mode, mods, type, dex, map, diff, start, weekly equal); local co-op = 'coop' / the Expedition's local partner
//   4. Setup: carousels (Tower floor, type, map, difficulty, route, start floor), modifiers, sub pickers write the prefs;
//      a locked map / route shows locked and START refuses
//   5. players: unsupported combinations are aria-disabled, say why and start nothing; online (signed in) opens a lobby
//      (base: Normal; Expedition: its mode + map + tier); a guest's Online says "log in"
//   6. Back at every step: the button and Escape (step 1 -> the menu)
//   7. the pad (synthetic Gamepad API): each step focuses the current choice; confirm x6 from the menu replays the
//      setup; the D-pad reaches tiles / arrows; cancel goes back
//   8. phone 844x390 (touch) and 1280x720: every step fits, no horizontal scroll, nothing outside the screen
//   9. English everywhere (no Spanish left), no page errors
//   node overworld/tests/micasurvivor_playflow_test.mjs   (SHOTS=<dir> saves a screenshot of every step)
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored micasurvivor/assets and overworld/data.)
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8963;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-play-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.6.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const reg = await call('register', { username: 'flowtester', password: 'msurv-play-pass-1' });
const TOKEN = reg.body.token, STATE = reg.body.state || (await call('state', {}, TOKEN)).body.state;
A(!!TOKEN, 'a test account is registered');

// a fixed profile: 6 Pokémon (Ivysaur is a 2nd stage: the League form), all upgraded so a run lasts
const OWN = [1, 2, 4, 7, 25, 133];
const SAVE = (name) => ({
	v: 3, name, created: 1, updated: 1, coins: 500,
	owned: Object.fromEntries(OWN.map(d => [d, { at: 1, from: 'gacha' }])),
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, stats: { runs: 3, bestTime: 60, bestLevel: 5, totalKills: 10, coinsEarned: 0 },
	pupg: Object.fromEntries(OWN.map(d => [d, { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 }])),
});
const BEFORE = (o) => {
	window.__pads = [];
	window.__mkPad = (i, id) => ({
		index: i, id, connected: true, mapping: 'standard', timestamp: 0,
		buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
		vibrationActuator: { playEffect() { return Promise.resolve('complete'); } },
	});
	window.__btn = (b, on, p = 0) => { const pad = window.__pads[p]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
	Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
	if (sessionStorage.getItem('seeded')) return;
	sessionStorage.setItem('seeded', '1');
	if (o.guestSave) {
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.guestSave));
	}
	if (o.user) {
		localStorage.setItem('magepunk_mp_token_v1', o.token);
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
		localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
		localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));
	}
};

// Spanish left on an English screen (Pokémon names taken out first)
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|tipo|modo|monedas|partida|elige|hoy|récord|aún|jefes|sin|vida|enemigos|próximamente|expedición|clásico|supervivencia|inmersión|liga|jugadores|preparación|atrás|continuar|empezar|piso|ruta|mapa|dificultad|bloqueado|sala|amigos|compañero|equipo|fiesta|elegir)\b/i;

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	const device = async (o, vp = { width: 1280, height: 720 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ deviceScaleFactor: 1, ...vp });
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|400|401)|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument(BEFORE, o);
		const E = (fn, ...a) => page.evaluate(fn, ...a);
		const visible = (id) => E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		const boot = async () => {
			await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
			await waitFor(() => E(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
			await sleep(300);
			if (await visible('tap-start')) await page.click('#tap-start');
			return waitFor(() => visible('scr-menu'), 15000);
		};
		const press = async (b) => { await E(b => __btn(b, true), b); await sleep(90); await E(b => __btn(b, false), b); await sleep(120); };
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
		const spanish = () => E(src => {
			const el = document.getElementById('scr-play');
			let txt = el.innerText.replace(/Pok[ée]mon/g, 'Pokemon');
			for (const p of G.DEX) if (/[^\x00-\x7f]/.test(p.name) && txt.includes(p.name)) txt = txt.split(p.name).join('#');
			return txt.match(new RegExp(src, 'gi')) || [];
		}, SPANISH.source);
		const toast = () => E(() => { const t = document.querySelector('.toast'); return t && t.style.display !== 'none' ? t.innerText : ''; });
		const hideToast = () => E(() => { const t = document.querySelector('.toast'); if (t) t.style.display = 'none'; });
		const state = () => E(() => G.PlayUI.state);
		// a click on a control of the flow (by selector), as the mouse does; then the re-render settles
		const click = async (sel) => { const ok = await E(sel => { const el = document.querySelector('#scr-play ' + sel); if (!el) return false; el.click(); return true; }, sel); await sleep(60); return ok; };
		const shot = async (name) => { if (!SHOTS) return; await sleep(450); await page.screenshot({ path: path.join(SHOTS, name) }); };
		/** Nothing of the flow outside the screen, no sideways scroll: {ok, why}. */
		const fits = async () => { await sleep(700); return fits0(); };
		const fits0 = () => E(() => {
			const W = innerWidth, H = innerHeight, bad = [];
			if (document.documentElement.scrollWidth > W + 1 || document.body.scrollWidth > W + 1) bad.push('page scrolls sideways ' + document.documentElement.scrollWidth);
			for (const el of document.querySelectorAll('#scr-play .mx-head, #scr-play .mx-body, #scr-play .mx-tile, #scr-play .mx-btn, #scr-play .mx-nr, #scr-play .mx-panel')) {
				if (!el.getClientRects().length) continue;
				const r = el.getBoundingClientRect();
				if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) {
					// (inside a scrolled panel it may be below the fold: fine if its scroller is on screen)
					const sc = el.closest('.mx-opts, .mx-grid, .mx-tiles');
					const sr = sc && sc !== el ? sc.getBoundingClientRect() : null;
					if (!(sr && sr.right <= W + 1 && sr.bottom <= H + 1 && r.left >= -1 && r.right <= W + 1)) bad.push((el.id || el.className) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
				}
			}
			for (const el of document.querySelectorAll('#scr-play .mx-tiles, #scr-play .mx-opts, #scr-play .mx-grid')) if (el.scrollWidth > el.clientWidth + 2) bad.push('sideways scroll in ' + el.className);
			return { ok: !bad.length, why: bad.slice(0, 6).join(' | ') };
		});
		return { ctx, page, E, visible, boot, press, navTo, spanish, toast, hideToast, state, click, shot, fits };
	};
	/** the run that started vs the plan G.Modes.plan(mode) made just before START */
	const KEYS = ['mode', 'mods', 'type', 'dex', 'seed', 'map', 'diff', 'start', 'weekly', 'team'];
	const pickKeys = o => Object.fromEntries(KEYS.map(k => [k, o && o[k] !== undefined ? o[k] : null]));
	const endRun = d => d.E(() => { G.Game.quit(); G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu(); });

	// ================= 1-6. a guest at 1280x720: the whole flow by mouse =================
	{
		const d = await device({ guestSave: SAVE('Trainer') });
		A(await d.boot(), 'a guest boots to the menu (1280x720)');
		await d.E(() => document.querySelector('#scr-menu [data-go=play]').click());
		await sleep(150);
		let s = await d.state();
		A(await d.visible('scr-play') && s.step === 1 && await d.E(() => G.Game.state === 'ui'), 'menu Play opens the flow at step 1 (Pokémon), no run', JSON.stringify(s));
		const mine = await d.E(() => { const o = Object.keys(G.DB.save.owned).map(Number).filter(x => G.DEX_BY[x] && G.SPRITE_META[x]).sort((a, b) => a - b); return { g1: o.filter(x => G.DEX_BY[x].gen === 1), gens: [...new Set(o.map(x => G.DEX_BY[x].gen))].length, n: o.length }; });
		const g1 = await d.E(() => ({ cells: [...document.querySelectorAll('#scr-play .mx-cell')].map(c => +c.dataset.dex), on: +(document.querySelector('#scr-play .mx-cell.on') || {}).dataset?.dex,
			tabs: [...document.querySelectorAll('#scr-play .mx-tab')].map(t => t.innerText.replace(/\s+/g, ' ')), crumbs: document.getElementById('mx-crumbs').innerText.replace(/\s+/g, ' '),
			title: document.getElementById('mx-title').innerText, font: getComputedStyle(document.getElementById('scr-play')).fontFamily, hasCard: !!document.querySelector('#scr-play .card') }));
		A(JSON.stringify(g1.cells) === JSON.stringify(mine.g1) && [1, 2, 4, 7, 25, 133].every(x => g1.cells.includes(x)) && g1.on === 4, 'step 1: the grid is your collection (owned species incl. the free starters, by generation), your partner marked', JSON.stringify([g1, mine]));
		A(g1.tabs.length === mine.gens && /Kanto/.test(g1.tabs[0]) && new RegExp(mine.g1.length + '/151').test(g1.tabs[0]), 'step 1: only generations you own Pokémon from get a tab, with "owned / all"', JSON.stringify(g1.tabs));
		A(await d.E(() => !document.querySelector('#scr-play .mx-cell[data-dex="150"]') && [...document.querySelectorAll('#scr-play .mx-cell')].every(c => G.DB.owns(+c.dataset.dex))), 'step 1: species you do not own are not offered (Mewtwo)');
		A(/Pokémon/.test(g1.crumbs) && /Mode/.test(g1.crumbs) && /Variant/.test(g1.crumbs) && /Players/.test(g1.crumbs) && /Setup/.test(g1.crumbs) && g1.title === 'Choose your Pokémon', 'the breadcrumbs name the 5 steps; the title says what to do (English)', g1.crumbs + ' / ' + g1.title);
		A(/m6x11/.test(g1.font) && !g1.hasCard, 'Micatro\'s m6x11 font; no .card anywhere (the pad treats .card as level-up cards)', g1.font);
		A(await d.E(() => document.fonts.check('20px m6x11')) || await waitFor(() => d.E(() => document.fonts.check('20px m6x11')), 3000), 'the m6x11 font loads (css/fonts/m6x11plus.ttf)');
		A((await d.spanish()).length === 0, 'step 1: no Spanish', (await d.spanish()).join(','));
		let f = await d.fits(); A(f.ok, 'step 1 fits 1280x720', f.why);
		await d.shot('play_1_pokemon_desktop.png');

		// 2. the character: Ivysaur (a 2nd stage) -> save.partner; the League pick is written when the Expedition loads
		await d.click('[data-dex="2"]');
		s = await d.state();
		const p1 = await d.E(() => ({ partner: G.DB.save.partner, loaded: G.Expedition.loaded }));
		A(s.step === 2 && p1.partner === 2 && !p1.loaded, 'picking Ivysaur writes save.partner = 2 and goes to step 2 (the Expedition code is NOT loaded for that)', JSON.stringify([s, p1]));
		A((await d.spanish()).length === 0, 'step 2: no Spanish', (await d.spanish()).join(','));
		f = await d.fits(); A(f.ok, 'step 2 fits 1280x720', f.why);
		await d.shot('play_2_mode_desktop.png');
		const cats = await d.E(() => [...document.querySelectorAll('#scr-play [data-cat]')].map(b => b.dataset.cat + ':' + b.querySelector('.t-name').innerText));
		A(JSON.stringify(cats) === '["survival:Survival","expedition:Expedition","dive:Dive"]', 'step 2: Survival / Expedition / Dive', JSON.stringify(cats));
		// each category -> its variants
		const VARS = { survival: ['normal', 'daily', 'rush', 'party', 'tower', 'rifts', 'type', 'team'], expedition: ['exp-classic', 'exp-survival'], dive: ['dive', 'weekly'] };
		for (const c of ['survival', 'expedition', 'dive']) {
			await d.click(`[data-cat="${c}"]`);
			A(await waitFor(async () => (await d.state()).step === 3, 6000), `category ${c} -> step 3`);
			const vs = await d.E(() => [...document.querySelectorAll('#scr-play [data-var]')].map(b => b.dataset.var));
			A(JSON.stringify(vs) === JSON.stringify(VARS[c]), `${c}: its variants ${VARS[c].join(', ')}`, JSON.stringify(vs));
			A((await d.spanish()).length === 0, `step 3 (${c}): no Spanish`, (await d.spanish()).join(','));
			f = await d.fits(); A(f.ok, `step 3 (${c}) fits 1280x720`, f.why);
			await d.shot(`play_3_${c}_desktop.png`);
			if (c === 'expedition') {
				const lg = await d.E(() => ({ loaded: G.Expedition.loaded, pick: G.ExpLeague.readPick(), form: +localStorage.getItem('micasurvivorexp_pickform'), runForm: G.ExpLeague.formFor(G.ExpLeague.pickFor()), hq: !!document.getElementById('mx-hq') }));
				A(lg.loaded && lg.pick === 1 && lg.form === 2 && lg.runForm === 2, 'the Expedition category loads the Expedition and writes the ONE character choice: League pick Bulbasaur (the family root), form Ivysaur', JSON.stringify(lg));
				A(lg.hq, 'Expedition: the League HQ side door is there');
			}
			await d.click('#mx-back');
			A((await d.state()).step === 2, `Back from ${c}'s variants -> step 2`);
		}
		// picking another character now writes the League pick at once (the Expedition is loaded)
		await d.click('#mx-back');
		await d.click('[data-dex="7"]');
		const lg2 = await d.E(() => ({ partner: G.DB.save.partner, pick: G.ExpLeague.readPick(), form: G.ExpLeague.formFor(G.ExpLeague.pickFor()) }));
		A(lg2.partner === 7 && lg2.pick === 7 && lg2.form === 7, 'a new character with the Expedition loaded: base partner AND League pick / form = Squirtle', JSON.stringify(lg2));

		// 3. every variant reaches Setup; START begins the same run G.Modes.plan(mode) plans
		const startVariant = async (cat, v, players = 'solo', setup) => {
			await d.E(() => { if (!G.UI.isOpen('scr-play')) G.PlayUI.open(); });
			// (from wherever the flow is: Back to step 2)
			for (let i = 0; i < 5 && (await d.state()).step > 2; i++) await d.click('#mx-back');
			if ((await d.state()).step === 1) await d.click('#mx-next');
			await d.click(`[data-cat="${cat}"]`);
			await waitFor(async () => (await d.state()).step === 3, 6000);
			await d.click(`[data-var="${v}"]`);
			await d.click(`[data-players="${players}"]`);
			const st5 = await d.state();
			if (st5.step !== 5) return { err: 'not at setup', st5 };
			if (setup) await setup();
			const want = await d.E(v => { const m = G.PlayUI.plan().mode; if (v === 'weekly') G.Expedition.playWeekly(); return { m, plan: G.Modes.plan(m) }; }, v);
			await d.click('#mx-start');
			const ok = await waitFor(() => d.E(() => G.Game.state === 'playing'), 15000);
			const got = await d.E(() => ({ run: G.Modes.run, coop: !!(G.LocalCoop && G.LocalCoop.on), mate: localStorage.getItem('micasurvivorexp_mate') }));
			await endRun(d);
			await waitFor(() => d.visible('scr-menu'), 5000);
			return { ok, want, got, st5 };
		};
		const EXP = { normal: 'normal', daily: 'daily', rush: 'rush', party: 'party', tower: 'tower', rifts: 'rifts', type: 'type', team: 'team', 'exp-classic': 'exp-classic', 'exp-survival': 'exp-survival', dive: 'exp-dive', weekly: 'exp-dive' };
		for (const [cat, list] of Object.entries(VARS)) for (const v of list) {
			let shotDone = false;
			const r = await startVariant(cat, v, 'solo', async () => {
				A((await d.spanish()).length === 0, `setup (${v}): no Spanish`, (await d.spanish()).join(','));
				const f5 = await d.fits(); A(f5.ok, `setup (${v}) fits 1280x720`, f5.why);
				if (['normal', 'tower', 'party', 'exp-classic', 'dive', 'weekly', 'daily'].includes(v)) { await d.shot(`play_5_${v}_desktop.png`); shotDone = true; }
			});
			void shotDone;
			if (r.err) { A(false, `${v}: reaches Setup`, JSON.stringify(r)); continue; }
			const w = pickKeys(r.want.plan), g = pickKeys(r.got.run);
			A(r.ok && r.want.m === EXP[v] && JSON.stringify(w) === JSON.stringify(g), `${v}: START begins the run G.Modes.plan('${EXP[v]}') plans (mode, mods, type, dex, map, diff, start, weekly)`, JSON.stringify({ w, g }));
			if (v === 'normal') A(g.dex == null && await d.E(() => G.DB.save.partner) === 7, 'normal: plays your partner (save.partner = 7)');
			if (cat !== 'survival') A(g.dex === 7 && r.got.mate === '0', `${v}: the League member is your character; solo writes no local partner`, JSON.stringify(r.got));
		}

		// 4. setup options write the prefs
		// Survival normal: modifiers
		await d.E(() => G.PlayUI.open());
		await d.click('#mx-next'); await d.click('[data-cat="survival"]'); await d.click('[data-var="normal"]'); await d.click('[data-players="solo"]');
		await d.click('[data-mod="fast"]'); await d.click('[data-mod="hard"]');
		let mods = await d.E(() => ({ mods: G.Modes.prefs().mods, on: [...document.querySelectorAll('#scr-play .mx-mod.on')].map(b => b.dataset.mod), pressed: document.querySelector('#scr-play [data-mod=fast]').getAttribute('aria-pressed') }));
		A(JSON.stringify(mods.mods) === '["fast","hard"]' && JSON.stringify(mods.on) === '["fast","hard"]' && mods.pressed === 'true', 'setup: the modifier toggles write save.modes.mods (and show on, aria-pressed)', JSON.stringify(mods));
		let r = await (async () => { const want = await d.E(() => G.Modes.plan('normal')); await d.click('#mx-start'); await waitFor(() => d.E(() => G.Game.state === 'playing'), 15000); const got = await d.E(() => G.Modes.run); await endRun(d); return { want, got }; })();
		A(JSON.stringify(r.got.mods) === '["fast","hard"]' && JSON.stringify(pickKeys(r.want)) === JSON.stringify(pickKeys(r.got)), 'normal with modifiers: the run has them', JSON.stringify(r.got.mods));
		await d.E(() => { G.Modes.toggleMod('fast'); G.Modes.toggleMod('hard'); });
		// Type: the carousel
		await d.E(() => G.PlayUI.open());
		await d.click('#mx-next'); await d.click('[data-cat="survival"]'); await d.click('[data-var="type"]'); await d.click('[data-players="solo"]');
		const t0 = await d.E(() => G.Modes.prefs().type);
		await d.click('[data-car="type"][data-d="1"]'); await d.click('[data-car="type"][data-d="1"]'); await d.click('[data-car="type"][data-d="-1"]');
		const t1 = await d.E(() => ({ type: G.Modes.prefs().type, shown: document.querySelector('#scr-play [data-row=type] .mx-nr-name').innerText, TYPES: G.Modes.TYPES }));
		A(t1.type === t1.TYPES[(t1.TYPES.indexOf(t0) + 1) % t1.TYPES.length] && t1.shown.length > 0, 'setup (Type): the arrows cycle save.modes.type both ways and show it', JSON.stringify([t0, t1.type, t1.shown]));
		// Tower: checkpoints (5 and 10 cleared -> floors 1, 6, 11)
		await d.E(() => { G.DB.save.tower = Object.assign(G.DB.save.tower || {}, { claimed: { 5: 1, 10: 1 } }); });
		const cps = await d.E(() => G.Tower.checkpoints());
		await d.click('#mx-back'); await d.click('#mx-back'); await d.click('[data-var="tower"]'); await d.click('[data-players="solo"]');
		await d.click('[data-car="tower"][data-d="1"]');
		const tw = await d.E(() => ({ start: G.Tower.startFloor(), name: document.querySelector('#scr-play [data-row=tower] .mx-nr-name').innerText }));
		A(cps.length >= 2 && tw.start === cps[1] && tw.name === 'Floor ' + cps[1], 'setup (Tower): the start floor carousel writes save.modes.towerStart', JSON.stringify([cps, tw]));
		await d.click('[data-car="tower"][data-d="-1"]');
		A(await d.E(() => G.Tower.startFloor()) === 1, 'setup (Tower): and back to floor 1');
		// Party: the sub picker (any species)
		await d.click('#mx-back'); await d.click('#mx-back'); await d.click('[data-var="party"]'); await d.click('[data-players="solo"]');
		await d.click('#mx-sub-party');
		const pp = await d.E(() => ({ sub: G.PlayUI.state.sub, n: document.querySelectorAll('#scr-play .mx-cell').length, has150: !!document.querySelector('#scr-play [data-dex="150"]') }));
		A(pp.sub === 'party' && pp.n > 100 && pp.has150, 'setup (Party): "Choose" opens a picker of every species (Mewtwo too)', JSON.stringify(pp));
		await d.shot('play_5_party_picker_desktop.png');
		await d.click('[data-dex="150"]');
		A(await d.E(() => G.Modes.prefs().party === 150 && G.PlayUI.state.sub === null && G.PlayUI.state.step === 5), 'setup (Party): picking Mewtwo writes save.modes.party and returns to Setup');
		// Team: the sub picker (yours, up to 3)
		await d.click('#mx-back'); await d.click('#mx-back'); await d.click('[data-var="team"]'); await d.click('[data-players="solo"]');
		await d.click('#mx-sub-team');
		await d.click('[data-dex="25"]'); await d.click('[data-dex="133"]');
		const tm = await d.E(() => ({ team: G.Modes.prefs().team, sub: G.PlayUI.state.sub, nums: [...document.querySelectorAll('#scr-play .mx-cell .tno')].map(e => e.innerText) }));
		A(JSON.stringify(tm.team) === '[25,133]' && tm.sub === 'team' && tm.nums.join() === '1,2', 'setup (Team): taps add to the team in order (numbered), the picker stays open under 3', JSON.stringify(tm));
		await d.click('[data-dex="1"]');
		A(await d.E(() => JSON.stringify(G.Modes.prefs().team) === '[25,133,1]' && G.PlayUI.state.sub === null), 'setup (Team): the 3rd closes it ("Team ready!")');
		r = await (async () => { const want = await d.E(() => G.Modes.plan('team')); await d.click('#mx-start'); await waitFor(() => d.E(() => G.Game.state === 'playing'), 15000); const got = await d.E(() => G.Modes.run); await endRun(d); return { want, got }; })();
		A(JSON.stringify(r.got.team) === '[25,133,1]' && r.got.dex === 25, 'team: the run takes that team, starting with Pikachu', JSON.stringify(r.got));
		// Expedition Classic: the map + difficulty carousels; a locked map shows locked and START refuses
		await d.E(() => G.PlayUI.open());
		await d.click('#mx-next'); await d.click('[data-cat="expedition"]'); await waitFor(async () => (await d.state()).step === 3, 6000);
		await d.click('[data-var="exp-classic"]'); await d.click('[data-players="solo"]');
		await d.click('[data-car="map"][data-d="1"]');
		const lk = await d.E(() => ({ map: G.PlayUI.state.map, locked: document.querySelector('#scr-play [data-row=map]').classList.contains('locked'), start: document.getElementById('mx-start').getAttribute('aria-disabled'), txt: document.querySelector('#scr-play [data-row=map]').innerText.replace(/\s+/g, ' '), saved: G.ExpTier.pick() }));
		A(lk.map === 'mtmoon' && lk.locked && lk.start === 'true' && /Clear Viridian Forest/.test(lk.txt) && lk.saved.map === 'viridian', 'setup (Classic): Mt. Moon shows locked ("Clear Viridian Forest to open it"), START is aria-disabled, the saved pick stays', JSON.stringify(lk));
		await d.shot('play_5_classic_locked_desktop.png');
		await d.click('#mx-start'); await sleep(200);
		A(await d.E(() => G.Game.state === 'ui') && /Locked/.test(await d.toast()), 'setup (Classic): pressing the disabled START says "Locked" and starts nothing', await d.toast());
		// open Mt. Moon (Viridian won on Normal) and Hard on it -> the carousel reaches it and START plays it
		await d.E(() => { G.ExpSave.best('wins.viridian.normal', 1); G.ExpSave.best('wins.mtmoon.normal', 1); });
		const opened = await d.E(() => ({ mt: G.ExpTier.mapOpen('mtmoon'), hard: G.ExpTier.isOpen('mtmoon', 'hard') }));
		if (opened.mt) {
			await d.click('[data-car="map"][data-d="-1"]'); await d.click('[data-car="map"][data-d="1"]'); await d.click('[data-car="diff"][data-d="1"]');
			const dd = await d.E(() => ({ st: G.PlayUI.state, saved: G.ExpTier.pick(), start: document.getElementById('mx-start').getAttribute('aria-disabled') }));
			A(dd.st.map === 'mtmoon' && dd.st.diff === 'hard' && dd.saved.map === 'mtmoon' && dd.saved.diff === 'hard' && dd.start !== 'true', 'setup (Classic): an open map + tier is written as the Expedition pick (G.ExpTier.setPick)', JSON.stringify(dd));
			r = await (async () => { const want = await d.E(() => G.Modes.plan('exp-classic')); await d.click('#mx-start'); await waitFor(() => d.E(() => G.Game.state === 'playing'), 15000); const got = await d.E(() => G.Modes.run); await endRun(d); return { want, got }; })();
			A(r.got.map === 'mtmoon' && r.got.diff === 'hard' && JSON.stringify(pickKeys(r.want)) === JSON.stringify(pickKeys(r.got)), 'Classic on Mt. Moon / Hard: the run is that map and tier', JSON.stringify(pickKeys(r.got)));
		} else A(false, 'the test could open Mt. Moon through the Expedition save counters', JSON.stringify(opened));
		// Dive: the route carousel (the Route of Origin locked until 8 Seals) + start floors
		await d.E(() => G.PlayUI.open());
		await d.click('#mx-next'); await d.click('[data-cat="dive"]'); await waitFor(async () => (await d.state()).step === 3, 6000);
		await d.click('[data-var="dive"]'); await d.click('[data-players="solo"]');
		await d.click('[data-car="route"][data-d="-1"]');
		const og = await d.E(() => ({ route: G.PlayUI.state.route, locked: document.querySelector('#scr-play [data-row=route]').classList.contains('locked'), start: document.getElementById('mx-start').getAttribute('aria-disabled'), saved: G.Expedition.diveRoute(), txt: document.querySelector('#scr-play [data-row=route]').innerText.replace(/\s+/g, ' ') }));
		A(og.route === 'origin' && og.locked && og.start === 'true' && og.saved !== 'origin' && /Awaken the 8 Seals \(0\/8\)/.test(og.txt), 'setup (Dive): the Route of Origin shows locked (Seals 0/8), START refuses, the saved route stays', JSON.stringify(og));
		await d.click('[data-car="route"][data-d="-1"]');
		const fu = await d.E(() => ({ route: G.PlayUI.state.route, saved: G.Expedition.diveRoute() }));
		A(fu.route === 'fungal' && fu.saved === 'fungal', 'setup (Dive): an open route is written (G.Expedition.diveRoute)', JSON.stringify(fu));
		await d.E(() => { G.ExpSave.best('dive.fungal.stage', 26); });
		await d.click('[data-car="route"][data-d="1"]'); await d.click('[data-car="route"][data-d="-1"]');
		await d.click('[data-car="start"][data-d="1"]');
		const sf = await d.E(() => ({ start: G.Expedition.diveStart(), shown: document.querySelector('#scr-play [data-row=start] .mx-nr-name').innerText }));
		A(sf.start === 26 && sf.shown === 'Floor 26', 'setup (Dive): the start floor carousel offers a saved stage (26) and writes it', JSON.stringify(sf));
		r = await (async () => { const want = await d.E(() => G.Modes.plan('exp-dive')); await d.click('#mx-start'); await waitFor(() => d.E(() => G.Game.state === 'playing'), 15000); const got = await d.E(() => G.Modes.run); await endRun(d); return { want, got }; })();
		A(r.got.map === 'dive:fungal' && r.got.start === 26 && JSON.stringify(pickKeys(r.want)) === JSON.stringify(pickKeys(r.got)), 'Dive: the run is that route from floor 26', JSON.stringify(pickKeys(r.got)));
		await d.E(() => { G.Expedition.diveStart(1); G.Expedition.diveRoute('forest'); });

		// 5. players: local co-op works where it does today; the rest is aria-disabled and starts nothing
		r = await startVariant('survival', 'normal', 'local');
		A(!r.err && r.ok && r.got.run.mode === 'coop' && r.got.coop, 'Survival normal + Local 2 players = the base co-op mode (a partner)', JSON.stringify(r.err ? r : r.got));
		r = await startVariant('expedition', 'exp-classic', 'local');
		A(!r.err && r.ok && r.got.run.mode === 'exp-classic' && r.got.mate === '1' && r.got.coop, 'Expedition Classic + Local: the Expedition\'s local partner comes (micasurvivorexp_mate = 1)', JSON.stringify(r.err ? r : r.got));
		await d.E(() => G.PlayUI.open());
		await d.click('#mx-next'); await d.click('[data-cat="survival"]'); await d.click('[data-var="daily"]');
		const pl = await d.E(() => [...document.querySelectorAll('#scr-play [data-players]')].map(b => ({ k: b.dataset.players, dis: b.getAttribute('aria-disabled'), tag: (b.querySelector('.t-tag') || {}).innerText || '' })));
		A(pl.find(x => x.k === 'solo').dis !== 'true' && pl.filter(x => x.k !== 'solo').every(x => x.dis === 'true'), 'Daily: only Solo; Local / 3-4 / Online are aria-disabled', JSON.stringify(pl));
		A(/Coming soon/.test(pl.find(x => x.k === 'local').tag) && /Coming soon/.test(pl.find(x => x.k === 'local4').tag) && /Coming soon/.test(pl.find(x => x.k === 'online').tag), 'each says why ("Coming soon")', JSON.stringify(pl));
		await d.shot('play_4_players_daily_desktop.png');
		await d.hideToast();
		await d.click('[data-players="local"]'); await sleep(150);
		A((await d.state()).step === 4 && /coming soon/i.test(await d.toast()) && await d.E(() => G.Game.state === 'ui'), 'pressing a disabled combination stays on step 4, says so, starts nothing', await d.toast());
		// a guest's Online on Normal: "Sign in to play with friends"
		await d.click('#mx-back'); await d.click('[data-var="normal"]');
		const on = await d.E(() => { const b = document.querySelector('#scr-play [data-players=online]'); return { dis: b.getAttribute('aria-disabled'), tag: b.querySelector('.t-tag').innerText, local: document.querySelector('#scr-play [data-players=local]').getAttribute('aria-disabled') }; });
		A(on.dis === 'true' && /Sign in to play with friends/.test(on.tag) && on.local !== 'true', 'a guest: Normal offers Local; Online says "Sign in to play with friends"', JSON.stringify(on));
		f = await d.fits(); A(f.ok, 'step 4 fits 1280x720', f.why);
		A((await d.spanish()).length === 0, 'step 4: no Spanish', (await d.spanish()).join(','));
		await d.shot('play_4_players_desktop.png');

		// 6. Back at every step: the button and Escape
		await d.click('[data-players="solo"]');
		A((await d.state()).step === 5, 'at step 5');
		for (let st = 5; st >= 2; st--) {
			await d.page.keyboard.press('Escape'); await sleep(150);
			A((await d.state()).step === st - 1 && await d.visible('scr-play'), `Escape: step ${st} -> ${st - 1}`, JSON.stringify(await d.state()));
		}
		await d.page.keyboard.press('Escape'); await sleep(150);
		A(await d.visible('scr-menu') && !await d.visible('scr-play'), 'Escape on step 1 -> the menu');
		await d.E(() => G.PlayUI.open());
		await d.click('#mx-back'); await sleep(100);
		A(await d.visible('scr-menu'), 'the Back button on step 1 -> the menu');
		A(await d.E(() => !!document.querySelector('#scr-menu [data-go=modes]')), '"Game modes" is still on the menu (League HQ etc.)');
		await d.ctx.close();
	}

	// ================= 5b. signed in: Online opens a lobby =================
	{
		const d = await device({ user: 'flowtester', token: TOKEN, state: STATE, save: SAVE('flowtester') });
		A(await d.boot(), 'a signed-in player boots to the menu');
		await d.E(() => G.PlayUI.open());
		await d.click('#mx-next'); await d.click('[data-cat="survival"]'); await d.click('[data-var="normal"]');
		A(await d.E(() => document.querySelector('#scr-play [data-players=online]').getAttribute('aria-disabled') !== 'true'), 'signed in: Online is offered on Normal');
		await d.click('[data-players="online"]');
		const lbl = await d.E(() => ({ txt: document.getElementById('mx-start').innerText, mods: !!document.querySelector('#scr-play [data-mod]') }));
		A(lbl.txt === 'Create lobby' && !lbl.mods, 'online Normal: START says "Create lobby"; no modifiers (a base lobby plays Normal)', JSON.stringify(lbl));
		await d.shot('play_5_online_desktop.png');
		await d.click('#mx-start');
		A(await waitFor(() => d.visible('scr-lobby'), 8000) && await d.E(() => !!G.Social.room && !G.Social.room.mode && G.Game.state === 'ui'), 'online Normal: START creates a base lobby and opens it (no run yet)');
		await d.E(() => G.Social.leaveRoom()); await sleep(400);
		await d.E(() => { G.UI.hideAll(); G.Flow.goMenu(); G.PlayUI.open(); });
		await d.click('#mx-next'); await d.click('[data-cat="expedition"]'); await waitFor(async () => (await d.state()).step === 3, 6000);
		await d.click('[data-var="exp-classic"]'); await d.click('[data-players="online"]');
		await d.click('#mx-start');
		A(await waitFor(() => d.visible('scr-lobby'), 8000) && await d.E(() => !!G.Social.room && G.Social.room.mode === 'exp-classic'), 'online Classic: START creates an Expedition lobby of that mode (G.ModesUI.openExpCoop)', await d.E(() => JSON.stringify(G.Social.room && { mode: G.Social.room.mode, map: G.Social.room.map, diff: G.Social.room.diff })));
		await d.E(() => G.Social.leaveRoom()); await sleep(400);
		// weekly + online: not yet
		await d.E(() => { G.UI.hideAll(); G.Flow.goMenu(); G.PlayUI.open(); });
		await d.click('#mx-next'); await d.click('[data-cat="dive"]'); await waitFor(async () => (await d.state()).step === 3, 6000); await d.click('[data-var="weekly"]');
		A(await d.E(() => document.querySelector('#scr-play [data-players=online]').getAttribute('aria-disabled') === 'true' && document.querySelector('#scr-play [data-players=local]').getAttribute('aria-disabled') === 'true'), 'Weekly Dive: Local and Online are "coming soon" (U2)');
		await d.ctx.close();
	}

	// ================= 7. the pad =================
	{
		const d = await device({ guestSave: SAVE('Trainer') });
		A(await d.boot(), 'pad device boots');
		await d.E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await waitFor(() => d.E(() => G.Pad && G.Pad.ready), 5000);
		await sleep(400);
		await d.press(13); await sleep(150);
		A(await d.navTo('#scr-menu [data-go=play]'), 'pad: the D-pad reaches Play');
		await d.press(1); await sleep(250);   // (Nintendo layout: the right face button confirms)
		A((await d.state()).step === 1 && await d.visible('scr-play'), 'pad: confirm on Play opens step 1');
		A(await waitFor(() => d.E(() => { const f = document.querySelector('.pad-focus'); return !!f && f.matches('.mx-cell.on') && +f.dataset.dex === G.DB.save.partner; }), 2000), 'pad: step 1 focuses your partner\'s cell');
		await d.shot('play_pad_step1.png');
		await d.press(1); await sleep(200);
		A((await d.state()).step === 2 && await d.E(() => document.querySelector('.pad-focus') && document.querySelector('.pad-focus').dataset.cat === 'survival'), 'pad: confirm -> step 2, focus on the current category (Survival)');
		A(await d.navTo('#scr-play [data-cat=dive]'), 'pad: the D-pad reaches Dive');
		await d.press(1);
		A(await waitFor(async () => (await d.state()).step === 3, 6000) && await d.E(() => G.PlayUI.state.cat === 'dive'), 'pad: confirm on Dive -> its variants');
		await d.press(0); await sleep(200);   // (Nintendo: the bottom face button is cancel)
		A((await d.state()).step === 2, 'pad: cancel goes back a step');
		A(await d.navTo('#scr-play [data-cat=survival]'), 'pad: back to Survival');
		await d.press(1); await sleep(200);
		A(await d.E(() => document.querySelector('.pad-focus') && document.querySelector('.pad-focus').dataset.var === 'normal'), 'pad: step 3 focuses Normal');
		A(await d.navTo('#scr-play [data-var=type]'), 'pad: the D-pad reaches Type Survival');
		await d.press(1); await sleep(200);
		A(await d.E(() => document.querySelector('.pad-focus') && document.querySelector('.pad-focus').dataset.players === 'solo'), 'pad: step 4 focuses Solo');
		A(await d.navTo('#scr-play [data-players=local]'), 'pad: the D-pad reaches a disabled tile (Local on Type)');
		await d.hideToast();
		await d.press(1); await sleep(200);
		A((await d.state()).step === 4 && /coming soon/i.test(await d.toast()), 'pad: confirm on it says "coming soon" and stays', await d.toast());
		A(await d.navTo('#scr-play [data-players=solo]'), 'pad: back to Solo');
		await d.press(1); await sleep(200);
		A(await d.E(() => document.querySelector('.pad-focus') && document.querySelector('.pad-focus').id === 'mx-start'), 'pad: Setup focuses START');
		const ty0 = await d.E(() => G.Modes.prefs().type);
		A(await d.navTo('#scr-play [data-car=type][data-d="1"]'), 'pad: the D-pad reaches the type arrow');
		await d.press(1); await sleep(200);
		const ty1 = await d.E(() => ({ type: G.Modes.prefs().type, focus: document.querySelector('.pad-focus') && document.querySelector('.pad-focus').dataset.car }));
		A(ty1.type !== ty0 && ty1.focus === 'type', 'pad: confirm on › changes the type and keeps the focus on the arrow', JSON.stringify([ty0, ty1]));
		await d.shot('play_pad_setup.png');
		// back to the menu with cancel x5, then confirm x6 replays the last setup (Type Survival, solo)
		for (let i = 0; i < 5; i++) { await d.press(0); await sleep(150); }
		A(await d.visible('scr-menu'), 'pad: cancel from Setup x5 -> the menu');
		await d.navTo('#scr-menu [data-go=play]');
		const typeNow = await d.E(() => G.Modes.prefs().type);
		for (let i = 0; i < 6; i++) { await d.press(1); await sleep(250); }
		A(await waitFor(() => d.E(() => G.Game.state === 'playing'), 15000), 'pad: confirm x6 from the menu replays the last setup and starts the run');
		const run = await d.E(() => G.Modes.run);
		A(run.mode === 'type' && run.type === typeNow, 'pad: ...the same Type Survival run', JSON.stringify(run));
		await d.E(() => { window.__pads[0] = null; });
		await endRun(d);
		await d.ctx.close();
	}

	// ================= 8. phone 844x390 (touch) =================
	{
		const d = await device({ guestSave: SAVE('Trainer') }, { width: 844, height: 390, hasTouch: true, isMobile: true });
		A(await d.boot(), 'phone 844x390 boots');
		const tap = async (sel) => { const el = await d.page.$('#scr-play ' + sel); if (!el) return false; await el.tap(); await sleep(120); return true; };
		await d.E(() => document.querySelector('#scr-menu [data-go=play]').click()); await sleep(200);
		let f = await d.fits(); A(f.ok, 'phone: step 1 fits, no sideways scroll', f.why);
		await d.shot('play_1_pokemon_phone.png');
		A(await tap('[data-dex="25"]') && (await d.state()).step === 2 && await d.E(() => G.DB.save.partner === 25), 'phone: tapping Pikachu picks it -> step 2');
		f = await d.fits(); A(f.ok, 'phone: step 2 fits', f.why);
		await d.shot('play_2_mode_phone.png');
		for (const c of ['survival', 'expedition', 'dive']) {
			await tap(`[data-cat="${c}"]`);
			await waitFor(async () => (await d.state()).step === 3, 6000);
			f = await d.fits(); A(f.ok, `phone: step 3 (${c}) fits`, f.why);
			await d.shot(`play_3_${c}_phone.png`);
			if (c !== 'dive') await tap('#mx-back');
		}
		await tap('[data-var="dive"]');
		f = await d.fits(); A(f.ok, 'phone: step 4 fits', f.why);
		await d.shot('play_4_players_phone.png');
		await tap('[data-players="solo"]');
		f = await d.fits(); A(f.ok, 'phone: step 5 (Dive) fits', f.why);
		await d.shot('play_5_dive_phone.png');
		await tap('#mx-back'); await tap('#mx-back'); await tap('#mx-back');
		await tap('[data-cat="survival"]'); await tap('[data-var="normal"]'); await tap('[data-players="solo"]');
		f = await d.fits(); A(f.ok, 'phone: step 5 (Normal with modifiers) fits', f.why);
		await d.shot('play_5_normal_phone.png');
		A(await tap('#mx-start') && await waitFor(() => d.E(() => G.Game.state === 'playing'), 15000), 'phone: tapping START starts the run');
		await endRun(d);
		await d.ctx.close();
	}
} catch (e) {
	A(false, 'the test ran to the end', e && e.stack);
} finally {
	if (browser) await browser.close();
	server.close();
}
A(errors.length === 0, 'no page errors', errors.slice(0, 8).join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
