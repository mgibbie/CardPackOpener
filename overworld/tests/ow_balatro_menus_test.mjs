// ow_balatro_menus_test.mjs — the overworld's menus wear the site's Balatro-style kit (site/ui/canvas.js via
// overworld/ow_menuskin.js), keep their hit boxes and key paths, and every tap makes a press sound.
//
// What it checks, per screen (START menu, PARTY, SUMMARY, BAG, POKeDEX list / grid / detail, PC, OPTIONS, FLY MAP,
// TRAINER CARD, POKe MART, a CHOOSE menu, the text box):
//   - it draws with no page error;
//   - it is painted from the kit: the panel colour (--bal-panel #3a4b4f) and the m6x11 font are used, the menu's
//     CLOSE is the kit's orange (Balatro's Back), the selected row carries the kit's white focus ring;
//   - the CLOSE box sits where it always did (hit boxes unchanged);
//   - the text box is the kit's dialog (the panel + a white card, dark text), not the GBA cream box.
// Then the taps that act directly (not through pressKey) make a press sound: TAKE, the MART's BUY/SELL tabs, the FLY
// MAP's region tabs, an OPTIONS row; and the keyboard path still opens / moves / closes the START menu with its sounds.
//
// Screenshots: set OW_SHOTS=<dir> to write one PNG per screen there (before/after comparisons).
//
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/ow_balatro_menus_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9461;
const SHOTS = process.env.OW_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'bm', friendCode: 'BMBMBM', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

const MON = (o) => ({ level: 20, gender: 'M', ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 34, spa: 40, spd: 40, spe: 60 }, maxHP: 60, curHP: 60, exp: 8000, ...o });
const PARTY = [
	MON({ speciesId: 'pikachu', name: 'PIKACHU', ability: 'static', types: ['Electric'], num: 25, sprite: 's800.png', heldItem: "potion",
		moves: [{ id: 'thundershock', name: 'ThunderShock', pp: 12, maxPp: 30 }, { id: 'growl', name: 'Growl', pp: 40, maxPp: 40 }, { id: 'quickattack', name: 'Quick Attack', pp: 30, maxPp: 30 }] }),
	MON({ speciesId: 'eevee', name: 'EEVEE', gender: 'F', ability: 'runaway', types: ['Normal'], num: 133, sprite: 's4256.png', curHP: 20, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }] }),
];

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	for (let i = 0; ; i++) {   // another session may hold the port for a moment: wait, never change it
		try { await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }); break; }
		catch (e) { if (i > 20) throw e; await sleep(3000); }
	}
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const errors = [];
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1600, height: 900 });
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'bm');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			// the sound spy: the overworld's sounds are <audio> plays (sound.js) — record each file name
			window.__played = [];
			const play = HTMLMediaElement.prototype.play;
			HTMLMediaElement.prototype.play = function () { try { window.__played.push(String(this.src).split('/').pop().replace(/\.ogg.*$/, '')); } catch { } return Promise.resolve(); };
			void play;
			// the paint spy: every fillStyle / strokeStyle / font set on a 2D context while __rec is on
			window.__paint = { fill: new Set(), stroke: new Set(), font: new Set(), on: false };
			const P = CanvasRenderingContext2D.prototype;
			for (const [prop, key] of [['fillStyle', 'fill'], ['strokeStyle', 'stroke'], ['font', 'font']]) {
				const d = Object.getOwnPropertyDescriptor(P, prop);
				Object.defineProperty(P, prop, { configurable: true, get() { return d.get.call(this); }, set(v) { if (window.__paint.on && typeof v === 'string') window.__paint[key].add(v.toLowerCase()); d.set.call(this, v); } });
			}
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.menuTap && window.__ow.startMenu && window.__ow.party?.length === 2 && !window.__ow.dialog.blocking)), 40000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');
		await sleep(800);
		if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

		// open a screen, record two frames of paint, take its tap boxes
		const SCREENS = [
			['start', 'ow.startMenu.open = true; ow.startMenu.idx = 1;', 'ow.startMenu.open = false;'],
			['party', 'ow.partyMenu.open = true; ow.partyMenu.idx = 0;', 'ow.partyMenu.open = false;'],
			['summary', 'ow.partyMenu.open = true; ow.partyMenu.summary = true; ow.partyMenu.idx = 0;', 'ow.partyMenu.summary = false; ow.partyMenu.open = false;'],
			['bag', 'ow.Bag.addItem("potion", 3); ow.Bag.addItem("antidote", 1); ow.bagMenu.open = true; ow.bagMenu.idx = 0;', 'ow.bagMenu.open = false;'],
			['dex', 'ow.dexMenu.open = true; ow.dexMenu.idx = 0;', 'ow.dexMenu.open = false;'],
			['dexgrid', 'ow.dexMenu.open = true; ow.dexMenu.grid = true;', 'ow.dexMenu.grid = false; ow.dexMenu.open = false;'],
			['dexdetail', 'ow.dexMenu.open = true; ow.dexMenu.detail = true; ow.dexMenu.idx = 0;', 'ow.dexMenu.detail = false; ow.dexMenu.open = false;'],
			['pc', 'ow.pcMenu.open = true; ow.pcMenu.idx = 0; ow.pcMenu.side = 0;', 'ow.pcMenu.open = false;'],
			['options', 'ow.optionsMenu.open = true; ow.optionsMenu.idx = 0; ow.optionsMenu.mode = "main";', 'ow.optionsMenu.open = false;'],
			['flymap', 'ow.openTownMap();', 'ow.townMap.open = false;'],
			['trainercard', 'ow.trainerCard.open = true; ow.trainerCard.page = 0;', 'ow.trainerCard.open = false;'],
			['shop', 'ow.shopMenu.open = true; ow.shopMenu.mode = "buy"; ow.shopMenu.idx = 0;', 'ow.shopMenu.open = false;'],
		];
		const W_OF = () => page.evaluate(() => document.getElementById('screen').width);
		for (const [name, open, close] of SCREENS) {
			const r = await page.evaluate(async (open) => {
				const ow = window.__ow;
				window.__paint.fill.clear(); window.__paint.stroke.clear(); window.__paint.font.clear();
				new Function('ow', open)(ow);
				await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
				window.__paint.on = true;
				await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
				window.__paint.on = false;
				return { fill: [...window.__paint.fill], stroke: [...window.__paint.stroke], font: [...window.__paint.font], ui: ow.menuUi.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })) };
			}, open);
			if (SHOTS) { const el = await page.$('#screen'); await el.screenshot({ path: path.join(SHOTS, `ow_${name}.png`) }); }
			A(r.ui.length > 0, `${name}: drew its tap boxes (${r.ui.length})`);
			A(r.fill.includes('#3a4b4f'), `${name}: painted on the kit's panel colour (--bal-panel)`, r.fill.slice(0, 12));
			A(r.font.some(f => /m6x11/.test(f)), `${name}: uses the m6x11 font`, r.font.slice(0, 4));
			const close0 = r.ui.find(b => b.id === 'close');
			if (close0) {
				const W = await W_OF(), H = Math.min(await page.evaluate(() => document.getElementById('screen').height), Math.round(W / 1.5)), u = H / 480;
				A(Math.abs(close0.x - (W - 106 * u)) < 1 && Math.abs(close0.y - 16 * u) < 1 && Math.abs(close0.w - 90 * u) < 1 && Math.abs(close0.h - 36 * u) < 1, `${name}: CLOSE kept its box`, close0);
				A(r.fill.includes('#fda200'), `${name}: CLOSE is the kit's orange (Back)`);
			}
			if (['start', 'party', 'dex', 'options', 'shop', 'bag'].includes(name)) A(r.fill.includes('#ffffff'), `${name}: the selected row carries the kit's white focus ring`);
			await page.evaluate((close) => new Function('ow', close)(window.__ow), close);
		}
		// no old palette left on those screens: the dark-blue rows and the purple-black dim are gone
		// (checked on the START menu: the most-seen screen)
		const startPaint = await page.evaluate(async () => {
			const ow = window.__ow; window.__paint.fill.clear();
			ow.startMenu.open = true; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
			window.__paint.on = true; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); window.__paint.on = false;
			ow.startMenu.open = false;
			return [...window.__paint.fill];
		});
		A(!startPaint.includes('#1f2938') && !startPaint.includes('rgba(10,8,18,0.82)'), 'START: none of the old battleui menu colours remain', startPaint);

		// the text box: the kit's dialog (a white card on the panel, dark text), not the GBA cream box
		const dlg = await page.evaluate(async () => {
			const ow = window.__ow; window.__paint.fill.clear();
			ow.dialog.open('Hello there! Welcome to the world of POKeMON. This is the text box.');
			await new Promise(r => setTimeout(r, 900));
			window.__paint.on = true; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); window.__paint.on = false;
			return [...window.__paint.fill];
		});
		if (SHOTS) { const el = await page.$('#screen'); await el.screenshot({ path: path.join(SHOTS, 'ow_dialog.png') }); }
		A(dlg.includes('#3a4b4f') && dlg.includes('#ffffff') && dlg.includes('#4f6367'), 'text box: the kit panel + white card + dark text', dlg);
		A(!dlg.includes('#f8f8e0'), 'text box: the GBA cream box is gone');
		await page.evaluate(async () => { for (let i = 0; i < 6 && window.__ow.dialog.blocking; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'z' })); await new Promise(r => setTimeout(r, 120)); } });
		await page.keyboard.press('z'); await sleep(150); await page.keyboard.press('z'); await sleep(150);
		await waitFor(() => page.evaluate(() => !window.__ow.dialog.blocking), 4000);

		// taps that act directly make a press sound (they used to be silent)
		const tapSound = async (label, setup, id, want) => {
			const got = await page.evaluate((setup, id) => {
				const ow = window.__ow;
				new Function('ow', setup)(ow);
				window.__played.length = 0;
				ow.menuTap(id);
				return window.__played.slice();
			}, setup, id);
			A(got.includes(want), `${label}: a tap plays ${want}`, got);
		};
		await tapSound('PARTY TAKE', 'ow.partyMenu.open = true; ow.partyMenu.action = null; ow.party[0].heldItem = "potion";', 'take:0', 'ui_select');
		await page.evaluate(() => { window.__ow.partyMenu.open = false; });
		await tapSound('MART SELL tab', 'ow.shopMenu.open = true; ow.shopMenu.mode = "buy";', 'shopmode:sell', 'ui_move');
		await page.evaluate(() => { window.__ow.shopMenu.open = false; });
		await tapSound('FLY MAP region tab', 'ow.openTownMap();', 'townreg:1', 'ui_move');
		await page.evaluate(() => { window.__ow.townMap.open = false; });
		await tapSound('OPTIONS row', 'ow.optionsMenu.open = true; ow.optionsMenu.mode = "main";', 'opt:0', 'ui_move');
		await page.evaluate(() => { window.__ow.Settings.cycle(window.__ow.OPTION_KEYS[0], -1); window.__ow.optionsMenu.open = false; });
		// a tap that goes through pressKey keeps its sound (CLOSE = cancel)
		await tapSound('START CLOSE (through pressKey)', 'ow.startMenu.open = true; ow.startMenu.idx = 0;', 'close', 'ui_cancel');
		await page.evaluate(() => { window.__ow.startMenu.open = false; });

		// the keyboard path is untouched: Enter opens START, ↓ moves, X closes — each with its sound
		await page.evaluate(() => { window.__played.length = 0; });
		await page.keyboard.press('Enter'); await sleep(200);
		const opened = await page.evaluate(() => window.__ow.startMenu.open);
		await page.keyboard.press('ArrowDown'); await sleep(150);
		const idx = await page.evaluate(() => window.__ow.startMenu.idx);
		await page.keyboard.press('x'); await sleep(200);
		const kb = await page.evaluate(() => ({ open: window.__ow.startMenu.open, played: window.__played.slice() }));
		A(opened && idx === 1 && !kb.open, 'keys: Enter opens START, ↓ moves, X closes', { opened, idx, open: kb.open });
		A(kb.played.includes('ui_open') && kb.played.includes('ui_move') && kb.played.includes('ui_cancel'), 'keys: open / move / cancel sounds', kb.played);

		A(errors.length === 0, 'no uncaught page errors', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
