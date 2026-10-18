// micasurvivor_encyclopedia_test.mjs — MicaSurvivor M5 batch 11: the in-game encyclopedia ("Léxico"), from the Godot
// Android port by JayElDragon (poke-survivor: menu.gd 1465 the main-menu entry, 3047-3194 the Lexicon: Items / Moves /
// Status / Abilities / "Z-Moves & Dynamax", each card with icon, name, a status line and the description; LEX_STATUS),
// driven headlessly while logged in to a stubbed Magepunk account:
//   - data: the port's five tabs first (then the plan's Pokémon, Modes, Floor Tower), its 7 status texts, every item,
//     move, ability, Z-move, the Dynamax entry left pending by batch 5, the raid dens, every Pokémon, the 8 modes with your
//     records (Tower / Rush included, as batch 8 asked), the 6 modifiers, adaptive difficulty, the Tower's relics, rest
//     cards, 15 risk + 4 legendary pacts and its boss log
//   - reachable from the main menu by mouse, touch and pad; Esc / Back / pad B close an entry, then leave
//   - every entry of every tab opens (all Pokémon of all 9 generations included), and by pad and by touch on each tab
//   - unlock tracking against the save: items found ("✔ Found" / "Not found yet", the "Items: n / 26 found" count), moves
//     evolved, Z-moves unlocked (or "Defeat 250 X-type Pokémon: n/250"), Dynamax ("Unlocked" / "Clear a Dynamax den: 0/1"),
//     Pokémon owned (sprite) or not (silhouette), the mode records, Tower relics and boss log
//   - no Spanish on any tab or entry in English
// Screenshots (MICASURVIVOR_SHOTS=<dir>): several pages and entries at 1280x720 and 844x390.
// Covers micasurvivor/js/ui/lexicon-ui.js, js/ui/menu.js, js/ui/ui.js, js/game.js, js/core/pad.js, js/data/lang-en.js,
// css/style.css, index.html.
//   node overworld/tests/micasurvivor_encyclopedia_test.mjs
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
const PORT = 9581;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);   // debugging: ONLY=3,7 runs those sections
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// menu.gd LEX_STATUS (3056-3063), the port's text
const PORT_STATUS = [
	['freeze', 'Congelado', 'El enemigo no se mueve ni ataca y recibe un 25% más de daño. Los jefes lo resisten.'],
	['para', 'Paralizado', 'El enemigo va mucho más lento y recibe más daño eléctrico. Los jefes lo resisten.'],
	['sleep', 'Dormido', 'El enemigo no actúa, recibe un 30% más de daño y se despierta con el primer golpe. Darkrai es inmune.'],
	['conf', 'Confundido', 'El enemigo se mueve sin rumbo y ataca a otros enemigos. Los jefes lo resisten.'],
	['burn', 'Quemado', 'Daño continuo y el enemigo hace menos daño.'],
	['poison', 'Envenenado', 'Daño continuo según su vida máxima (menos contra jefes).'],
	['slow', 'Ralentizado', 'El enemigo se mueve más despacio durante un rato.'],
];

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
	localStorage.setItem('magepunk_mp_token_v1', 'lexicon-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'lexicontester' }));
};

// Spanish on an English screen (Pokémon names stripped first): accents / ¡¿ñ or common Spanish words
const SPANISH = /[¡¿ñáíóú]|\b(de|del|las|los|con|para|el|la|una?|que|y|tipo|enemigo|daño|jefes?|vida|movimientos?|objetos?|estados?|habilidad(es)?|encontrado|aún|evoluciona|desbloqueado|guaridas?|grietas?|partidas|mejor|récord|piso|reliquias?|pactos?|registro|tienes|rareza|recarga|duración|modificadores|dificultad|sí)\b/i;

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
	const shot = async (name) => { await E(() => { document.querySelectorAll('#ach-pop, .toast').forEach(e => { e.style.display = 'none'; }); }); await sleep(300); if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const press = async (b) => { await E(b => __btn(b, true), b); await sleep(90); await E(b => __btn(b, false), b); await sleep(110); };
	const navTo = async (sel) => {
		for (let i = 0; i < 120; i++) {
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
	const tapEl = async (sel) => { const b = await E(sel => { const el = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (b) { await sleep(80); await page.touchscreen.tap(b.x, b.y); } return !!b; };
	const touchOn = on => cdp.send('Emulation.setTouchEmulationEnabled', { enabled: on, maxTouchPoints: 5 });
	const view = (w, h) => page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
	const padOn = async () => { await E(() => { window.__pads[0] = window.__mkPad(0, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'); }); await sleep(250); await press(13); };
	const padOff = async () => { await E(() => { window.__pads[0] = null; }); await sleep(200); };
	const A_BTN = 1, B_BTN = 0;   // the Nintendo layout (the default): A = right face = confirm, B = bottom = back
	const spanishIn = (txt) => E((txt, src) => {
		txt = txt.replace(/Pok[ée]mon/g, 'Pokemon');
		for (const p of G.DEX) if (/[^\x00-\x7f]/.test(p.name) && txt.includes(p.name)) txt = txt.split(p.name).join('#');
		return txt.match(new RegExp(src, 'gi')) || [];
	}, txt, SPANISH.source);
	const tabTo = (k) => E(k => { document.querySelector(`#lex-tabs .tab[data-tab="${k}"]`).click(); }, k);

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.LexiconUI), 30000), 'boots logged in; G.LexiconUI loaded', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-test'), 10000);
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	// a save with some progress to track
	await E(() => {
		const s = G.DB.save;
		s.owned = { 4: { at: 1000, from: 'starter' }, 1: { at: 2000, from: 'gacha' }, 25: { at: 3000, from: 'gacha' }, 152: { at: 4000, from: 'gacha' } }; s.partner = 4;
		s.itemsFound = { leftovers: 1700000000000, rockyhelmet: 1700000000000, lightball: 1700000000000 };
		s.evoMoves = { ember: 1 };
		Object.assign(s.stats, { dens: 0, tk_fire: 260, tk_water: 40, rushBest: 9, rushRuns: 4, riftsBest: 5, bestTime: 900, bestLevel: 22, runs: 12, dailyPlays: 3, dailyBestMin: 7, mb_horde: 6, arceus: 0, towerRuns: 2 });
		s.tower = { claimed: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1 }, best: 11, log: [{ f: 10, s: 52, p: 31 }, { f: 11, s: 40, p: 12 }] };
		G.DB.commit(true);
	});

	// ================= 1. data =================
	if (!ONLY.length || ONLY.includes('1')) {
		const r = await E(() => {
			const L = G.LexiconUI, n = k => L.entries(k).length;
			let pk = 0; const g0 = L.gen; for (let g = 1; g <= 9; g++) { L.gen = g; pk += n('p'); } L.gen = g0;
			return {
				tabs: L.TABS.map(t => t[0]), labels: L.TABS.map(t => t[1]), status: L.STATUS,
				i: n('i'), m: n('m'), s: n('s'), a: n('a'), z: L.entries('z').map(e => e.key), p: pk, md: L.entries('md').map(e => e.key), t: L.entries('t').map(e => e.key),
				want: { i: G.Items.LIST.length, m: G.Moves.ALL.length, a: G.Abilities.list().length, p: G.DEX.filter(p => G.SPRITE_META[p.dex]).length },
				menu: !!document.querySelector('#scr-menu [data-go=lexicon]'),
			};
		});
		A(JSON.stringify(r.labels.slice(0, 5)) === '["Objetos","Movimientos","Estados","Habilidades","Z y Dynamax"]' && JSON.stringify(r.tabs) === '["i","m","s","a","z","p","md","t"]',
			'the port\'s five tabs first (Items, Moves, Status, Abilities, Z-Moves & Dynamax; menu.gd 3075), then Pokémon, Modes and the Floor Tower', JSON.stringify(r.labels));
		A(JSON.stringify(r.status) === JSON.stringify(PORT_STATUS), 'the 7 status effects with the port\'s text (menu.gd LEX_STATUS)');
		A(r.i === r.want.i && r.i === 26 && r.m === r.want.m && r.s === 7 && r.a === r.want.a && r.p === r.want.p, `every item (26), move (${r.m}), status (7), ability (${r.a}) and Pokémon (${r.p})`, JSON.stringify(r));
		A(r.z.length === 20 && r.z[0] === 'z:dynamax' && r.z[1] === 'z:dens' && r.z[2] === 'z:normal', 'Z-Moves & Dynamax: the Dynamax entry (pending since batch 5), the raid dens and the 18 Z-moves', JSON.stringify(r.z.slice(0, 4)));
		A(r.md.length === 16 && r.md.slice(0, 9).join() === 'md:normal,md:daily,md:rush,md:party,md:coop,md:tower,md:rifts,md:type,md:team' && r.md.includes('md:mod_nohealing') && r.md[15] === 'md:adaptive',
			'Modes: the 9 modes (Co-op from batch 12a), the 6 modifiers and adaptive difficulty', JSON.stringify(r.md));
		A(r.t.length === 24 && r.t[0] === 't:relics' && r.t.includes('t:rest_shield') && r.t.includes('t:frenzy') && r.t.includes('t:l_time') && r.t[23] === 't:log',
			'Floor Tower: relics, the 3 rest cards, the 15 risk pacts, the 4 legendary pacts and the boss log', JSON.stringify(r.t));
		A(r.menu, 'the main menu has a "Lexicon" entry (menu.gd 1465)');
	}

	// ================= 2. reachable: mouse, touch, pad =================
	if (!ONLY.length || ONLY.includes('2')) {
		await page.click('#scr-menu [data-go=lexicon]');
		A(await waitFor(() => visible('scr-lexicon'), 3000), 'a click on Lexicon opens it');
		const t = await E(() => ({ tabs: [...document.querySelectorAll('#lex-tabs .tab')].map(x => x.textContent), h: document.querySelector('.lex-h').textContent, title: document.querySelector('#scr-lexicon h2').textContent }));
		A(t.title === 'Lexicon' && JSON.stringify(t.tabs) === '["Items","Moves","Status","Abilities","Z-Moves & Dynamax","Pokémon","Modes","Floor Tower"]' && t.h === 'Items: 3 / 26 found',
			'in English: "Lexicon", the tab names of the port\'s lang_en.json, "Items: 3 / 26 found"', JSON.stringify(t));
		await E(() => document.querySelector('#scr-lexicon [data-back]').click());
		A(await waitFor(() => visible('scr-menu'), 3000), '"Back" returns to the menu');
		await touchOn(true);
		await tapEl('#scr-menu [data-go=lexicon]');
		A(await waitFor(() => visible('scr-lexicon'), 3000), 'a tap on Lexicon opens it (touch)');
		await E(() => G.MenuUI.open()); await sleep(200);
		await touchOn(false);
		await padOn();
		A(await navTo('#scr-menu [data-go=lexicon]'), 'the pad reaches Lexicon on the menu');
		await press(A_BTN);
		A(await waitFor(() => visible('scr-lexicon'), 3000), 'pad A opens it');
		await press(B_BTN);
		A(await waitFor(() => visible('scr-menu'), 3000), 'pad B leaves it');
		await padOff();
		// Esc: closes an open entry first, then leaves
		await E(() => { G.LexiconUI.open('i'); }); await sleep(150);
		await E(() => document.querySelector('#lex-body .lex-card').click()); await sleep(150);
		await page.keyboard.press('Escape'); await sleep(250);
		const e1 = await E(() => ({ pop: G.LexiconUI.entryOpen(), lex: G.UI.isOpen('scr-lexicon') }));
		await page.keyboard.press('Escape'); await sleep(250);
		A(!e1.pop && e1.lex && await visible('scr-menu'), 'Esc closes an open entry first, then leaves for the menu', JSON.stringify(e1));
	}

	// ================= 3. every entry of every tab opens; no Spanish on any of them =================
	if (!ONLY.length || ONLY.includes('3')) {
		await E(() => G.LexiconUI.open('i')); await sleep(200);
		const res = {}; let spanish = [];
		for (const k of ['i', 'm', 's', 'a', 'z', 'p', 'md', 't']) {
			await tabTo(k); await sleep(150);
			const gens = k === 'p' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [0];
			for (const g of gens) {
				if (g) { await E(g => document.querySelector(`#lex-body .lex-gens [data-gen="${g}"]`).click(), g); await sleep(250); }
				const r = await E(async () => {
					const tick = () => new Promise(res => setTimeout(res, 0));   // (the English translation runs on DOM mutations)
					const cards = [...document.querySelectorAll('#lex-body .lex-card')], out = { n: cards.length, opened: 0, bad: [], text: '' };
					const want = new Set(G.LexiconUI.entries().map(e => e.key));
					for (const c of cards) {
						c.click();
						await tick();
						const pop = document.getElementById('lexpop-body'), shown = !document.getElementById('scr-lexpop').classList.contains('hidden');
						const h = pop.querySelector('h2') && pop.querySelector('h2').textContent.trim();
						if (shown && pop.dataset.key === c.dataset.lex && h && want.has(c.dataset.lex)) out.opened++; else out.bad.push(c.dataset.lex);
						out.text += pop.innerText + '\n';
						document.getElementById('lexpop-close').click();
					}
					out.want = want.size;
					out.text += document.getElementById('lex-body').innerText;
					return out;
				});
				res[k + (g || '')] = r;
				spanish = spanish.concat((await spanishIn(r.text)).map(w => k + (g || '') + ':' + w));
			}
		}
		const all = Object.values(res).reduce((a, r) => a + r.opened, 0), cards = Object.values(res).reduce((a, r) => a + r.n, 0), wants = Object.values(res).reduce((a, r) => a + r.want, 0);
		const bad = Object.entries(res).filter(([, r]) => r.opened !== r.n || r.n !== r.want);
		A(bad.length === 0 && all === cards && cards === wants && cards > 1100, `every entry of every tab opens (${all} entries: items, moves, status, abilities, Z & Dynamax, all Pokémon of the 9 generations, modes, Tower)`, JSON.stringify(bad.map(([k, r]) => [k, r.n, r.opened, r.want, r.bad.slice(0, 3)])));
		A(spanish.length === 0, 'no Spanish on any tab or entry (English)', JSON.stringify([...new Set(spanish)].slice(0, 12)));
	}

	// ================= 4. by pad and by touch, on each tab =================
	if (!ONLY.length || ONLY.includes('4')) {
		await E(() => G.LexiconUI.open('i')); await sleep(200);
		await padOn();
		const padRes = [];
		for (const k of ['i', 'm', 's', 'a', 'z', 'p', 'md', 't']) {
			const okTab = await navTo(`#lex-tabs .tab[data-tab="${k}"]`);
			await press(A_BTN); await sleep(200);
			const on = await E(k => G.LexiconUI.tab === k, k);
			// the second card of the tab (the first sits right under the tabs)
			const key = await E(() => { const c = document.querySelectorAll('#lex-body .lex-card')[1]; return c && c.dataset.lex; });
			const okCard = await navTo(`#lex-body .lex-card[data-lex="${key}"]`);
			await press(A_BTN); await sleep(250);
			const opened = await E(() => G.LexiconUI.entryOpen() && document.getElementById('lexpop-body').dataset.key);
			await press(B_BTN); await sleep(250);
			const closed = await E(() => !G.LexiconUI.entryOpen() && G.UI.isOpen('scr-lexicon'));
			padRes.push([k, okTab, on, okCard, opened === key, closed]);
		}
		await padOff();
		A(padRes.every(r => r.slice(1).every(Boolean)), 'by pad on each of the 8 tabs: reach the tab, A switches to it, reach an entry, A opens it, B closes it', JSON.stringify(padRes));
		await touchOn(true);
		const tapRes = [];
		for (const k of ['i', 'm', 's', 'a', 'z', 'p', 'md', 't']) {
			await tapEl(`#lex-tabs .tab[data-tab="${k}"]`); await sleep(200);
			const on = await E(k => G.LexiconUI.tab === k, k);
			const key = await E(() => { const c = document.querySelectorAll('#lex-body .lex-card'); return c[c.length - 1].dataset.lex; });
			await tapEl(`#lex-body .lex-card[data-lex="${key}"]`); await sleep(250);
			const opened = await E(() => G.LexiconUI.entryOpen() && document.getElementById('lexpop-body').dataset.key);
			await tapEl('#lexpop-close'); await sleep(200);
			tapRes.push([k, on, opened === key, !(await E(() => G.LexiconUI.entryOpen()))]);
		}
		A(tapRes.every(r => r.slice(1).every(Boolean)), 'by touch on each of the 8 tabs: tap the tab, tap its last entry (scrolled to), it opens, "Close" closes it', JSON.stringify(tapRes));
		// a tap outside the box closes it too
		await tapEl('#lex-body .lex-card'); await sleep(200);
		await page.touchscreen.tap(6, 6); await sleep(200);
		A(!(await E(() => G.LexiconUI.entryOpen())), 'a tap outside the entry closes it');
		await touchOn(false);
	}

	// ================= 5. unlock tracking against the save =================
	if (!ONLY.length || ONLY.includes('5')) {
		const get = (k, key) => E(([k, key]) => { const e = G.LexiconUI.entries(k).find(x => x.key === key); const t = (v, sep) => String(v || '').split(sep).map(x => G.I18n.t(x)).join(sep);   // (as the page shows it: one text node per part / line)
			return e ? { sub: t(e.sub, ' · '), dim: !!e.dim, facts: (e.facts || []).map(([a, b]) => [G.I18n.t(a), t(b, ' · ')]), desc: t(e.desc, String.fromCharCode(10)), sprite: e.sprite } : null; }, [k, key]);
		const it1 = await get('i', 'i:leftovers'), it2 = await get('i', 'i:choiceband');
		A(it1.sub === '✔ Found' && !it1.dim && it1.facts.length === 1 && it2.sub === 'Not found yet' && it2.dim, 'items: "✔ Found" (with the date) / "Not found yet" (dimmed) from save.itemsFound (menu.gd 3138-3143)', JSON.stringify([it1, it2]));
		const mv = await get('m', 'm:ember'), mv2 = await get('m', 'm:water-gun');
		A(/Evolved/.test(mv.sub) && mv.facts.some(f => f[0] === 'Ever evolved' && f[1] === 'Yes') && !/Evolved/.test(mv2.sub) && /Evolves into: Scald/.test(mv2.desc), 'moves: "Evolves into: …" (menu.gd 3157-3160) and whether you ever evolved it (save.evoMoves)', JSON.stringify([mv, mv2]));
		const zf = await get('z', 'z:fire'), zw = await get('z', 'z:water'), dy = await get('z', 'z:dynamax');
		A(/Unlocked/.test(zf.sub) && !zf.dim && /Defeat 250 Water-type Pokémon: 40\/250/.test(zw.sub) && zw.dim, 'Z-moves: unlocked with 250 Fire-type defeats; "Defeat 250 Water-type Pokémon: 40/250" (menu.gd 3176-3179)', JSON.stringify([zf.sub, zw.sub]));
		A(dy.sub === 'Clear a Dynamax den: 0/1' && dy.dim && /every 4 minutes|Every 4 minutes/i.test(dy.desc), 'Dynamax: "Clear a Dynamax den: 0/1" while locked (menu.gd 3167-3171)', JSON.stringify(dy));
		await E(() => { G.DB.save.stats.dens = 2; });
		const dy2 = await get('z', 'z:dynamax'), dn = await get('z', 'z:dens');
		A(dy2.sub === 'Unlocked' && !dy2.dim && dy2.facts.some(f => f[0] === 'Dynamax dens cleared' && f[1] === '2') && /Dynamax dens cleared: 2/.test(dn.sub), 'after clearing dens: "Unlocked", 2 dens cleared', JSON.stringify([dy2, dn.sub]));
		const pOwn = await E(() => { G.LexiconUI.gen = 1; const l = G.LexiconUI.entries('p'); return [l.find(e => e.key === 'p:25'), l.find(e => e.key === 'p:150')].map(e => ({ sil: e.sprite.sil, dim: !!e.dim, sub: e.sub.split(' · ').map(x => G.I18n.t(x)).join(' · ') })); });
		A(!pOwn[0].sil && /You have it/.test(pOwn[0].sub) && pOwn[1].sil && pOwn[1].dim, 'Pokémon: yours with their sprite ("✔ You have it"), the others as a silhouette', JSON.stringify(pOwn));
		const tw = await get('md', 'md:tower'), ru = await get('md', 'md:rush'), nm = await get('md', 'md:normal'), dl = await get('md', 'md:daily');
		const f = (e, k) => (e.facts.find(x => x[0] === k) || [])[1];
		A(f(tw, 'Best floor') === '11 / 30' && f(tw, 'Relics') === '2 / 6' && f(tw, 'Arceus defeated') === 'No' && f(ru, 'Boss record') === '9' && f(nm, 'Best time') === '15:00' && f(dl, 'Played') === '3',
			'modes: your records from the save (Tower best floor 11 / 30, relics 2 / 6, Arceus no; Boss Rush 9; best time 15:00; Daily played 3)', JSON.stringify([tw.facts, ru.facts]));
		const rl = await get('t', 't:relics'), lg = await get('t', 't:log');
		A(rl.sub === '2 / 6' && lg.facts.length === 2 && lg.facts[0][0] === 'Floor 11' && lg.facts[0][1] === '40 s, -12%', 'Tower: relics 2 / 6 and the boss log (latest first: floor 11, 40 s, -12%) — shown outside the fail screen now', JSON.stringify([rl.sub, lg.facts]));
		const ad = await get('md', 'md:adaptive');
		A(['On', 'Off'].includes(ad.sub) && /starts easy/.test(ad.desc), 'adaptive difficulty: its state and what it does', JSON.stringify(ad));
	}

	// ================= 6. screenshots =================
	if (SHOTS && (!ONLY.length || ONLY.includes('6'))) {
		const pages = async (tag) => {
			await E(() => { G.UI.hideAll(); G.LexiconUI.open('i'); }); await sleep(300);
			for (const [k, key] of [['i', 'i:leftovers'], ['m', 'm:ember'], ['s', 's:sleep'], ['a', null], ['z', 'z:dynamax'], ['p', 'p:25'], ['md', 'md:tower'], ['t', 't:log']]) {
				await tabTo(k); await sleep(350);
				await shot(`m5b11_${tag}_lexicon_${k}.png`);
				if (key) { await E(key => G.LexiconUI.openEntry(key), key); await sleep(350); await shot(`m5b11_${tag}_lexicon_${k}_entry.png`); await E(() => G.LexiconUI.closeEntry()); }
			}
		};
		await pages('desktop');
		await view(844, 390); await touchOn(true); await sleep(400);
		await pages('phone');
		await E(() => { G.UI.hideAll(); G.MenuUI.open(); }); await sleep(300); await shot('m5b11_phone_menu.png');
		await view(1280, 720); await touchOn(false); await sleep(300);
		await E(() => { G.UI.hideAll(); G.MenuUI.open(); }); await sleep(300); await shot('m5b11_desktop_menu.png');
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
