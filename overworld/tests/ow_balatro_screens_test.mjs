// ow_balatro_screens_test.mjs — the rest of the overworld's UI wears the site's Balatro-style kit: the page itself
// (site/ui/balatro.css, the kit's flat background, the m6x11 font, the info bar, the touch buttons as kit buttons), and the screens
// drawn outside ow_menus.js — GAME CORNER, VOLTORB FLIP, SLOTS, UNOWN DEX, POKeBLOCK CASE, MAIL, REPLAYS, the TRADE
// window, the "N watching" badge and the live-follow viewer's banner.
//
//   - each screen draws with no page error, from the kit's colours (the panel #3a4b4f / its darker shades) and the
//     m6x11 font, and none of its old hard-coded colours remain;
//   - the page loads balatro.css, the body is .bal-page on the kit's flat --bal-bg, #bar is in the kit font, A is the kit's blue and
//     B the kit's orange, standing on their darker lips;
//   - PARTY (Backspace) and BAG (b) now open with a sound, as START always did; the keys still open them.
//
// Screenshots: set OW_SHOTS=<dir> to write one PNG per screen there (before/after comparisons).
//
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/ow_balatro_screens_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { startServer as libServer, openOverworld, canvasToClient } from './ow_controls_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9463;
const SHOTS = process.env.OW_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'bs', friendCode: 'BSBSBS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }
const PARTY = [{ speciesId: 'pikachu', name: 'PIKACHU', level: 20, gender: 'M', ability: 'static', types: ['Electric'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 34, spa: 40, spd: 40, spe: 60 }, maxHP: 60, curHP: 60, exp: 8000, num: 25, sprite: 's800.png', moves: [{ id: 'thundershock', name: 'ThunderShock', pp: 12, maxPp: 30 }] }];
// the old hard-coded colours of these screens (lower case, as the paint spy records them)
const OLD = ['rgba(10,8,18,0.82)', '#1f2938', '#2e3d52', '#333355', '#4a4a80', '#20223a', 'rgba(40,70,110,0.95)', 'rgba(22,36,60,0.85)', 'rgba(72,120,196,0.9)', 'rgba(30,40,60,0.85)', '#7cfc7c', '#ffd25f', '#8892a8', 'rgba(20,30,50,0.82)', 'rgba(10,8,24,0.78)', '#f8f8f8', '#506078'];

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, matches: [], list: [] })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	for (let i = 0; ; i++) {   // another session may hold the port for a moment: wait, never change it
		try { await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }); break; }
		catch (e) { if (i > 20) throw e; await sleep(3000); }
	}
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
	const errors = [];
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1600, height: 900 });
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'bs');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			window.__played = [];
			// the kit's sounds (site/ui/sfx.js) are WebAudio buffer plays: count them
			window.__kitPlays = 0;
			const absStart = AudioBufferSourceNode.prototype.start;
			AudioBufferSourceNode.prototype.start = function (...a) { window.__kitPlays++; try { return absStart.apply(this, a); } catch { } };
			HTMLMediaElement.prototype.play = function () { try { window.__played.push(String(this.src).split('/').pop().replace(/\.ogg.*$/, '')); } catch { } return Promise.resolve(); };
			window.__paint = { fill: new Set(), stroke: new Set(), font: new Set(), on: false };
			const P = CanvasRenderingContext2D.prototype;
			for (const [prop, key] of [['fillStyle', 'fill'], ['strokeStyle', 'stroke'], ['font', 'font']]) {
				const d = Object.getOwnPropertyDescriptor(P, prop);
				Object.defineProperty(P, prop, { configurable: true, get() { return d.get.call(this); }, set(v) { if (window.__paint.on && typeof v === 'string') window.__paint[key].add(v.toLowerCase()); d.set.call(this, v); } });
			}
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.menuTap && window.__ow.party?.length === 1 && !window.__ow.dialog.blocking)), 40000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');
		await sleep(800);
		if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

		// ---- the page: kit stylesheet, felt body, kit font + colours on the DOM chrome ----
		const dom = await page.evaluate(() => {
			const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : null; };
			document.body.classList.add('touch');   // (show the touch buttons to read their style)
			const out = {
				css: !!document.querySelector('link[rel=stylesheet][href*="site/ui/balatro.css"]'),
				balPage: document.body.classList.contains('bal-page'),
				bodyBg: cs('body', 'backgroundImage'), bodyColor: cs('body', 'backgroundColor'),
				barFont: cs('#bar', 'fontFamily'),
				aBg: cs('#t-a', 'backgroundColor'), aLip: cs('#t-a', 'boxShadow'), aFont: cs('#t-a', 'fontFamily'),
				bBg: cs('#t-b', 'backgroundColor'), upBg: cs('#t-up', 'backgroundColor'),
			};
			document.body.classList.remove('touch');
			return out;
		});
		A(dom.css && dom.balPage, 'page: loads site/ui/balatro.css and the body is .bal-page', dom);
		// the kit's FLAT background (not the fixed felt gradient: under a canvas redrawn every frame it repaints the page)
		A(dom.bodyBg === 'none' && dom.bodyColor === 'rgb(45, 61, 64)', 'page: the kit flat --bal-bg behind the frame, no fixed gradient', dom);
		A(/m6x11/.test(dom.barFont || ''), 'page: the info bar is in the kit font', dom.barFont);
		A(dom.aBg === 'rgb(0, 157, 255)' && /rgb\(0, 118, 194\)/.test(dom.aLip || '') && /m6x11/.test(dom.aFont || ''), 'touch A: the kit blue on its darker lip, kit font', dom);
		A(dom.bBg === 'rgb(253, 162, 0)', 'touch B: the kit orange (back)', dom.bBg);
		A(dom.upBg === 'rgb(95, 115, 119)', 'touch d-pad: the kit grey', dom.upBg);

		// ---- the bar's "home" link is a kit button and presses with the kit's sound (it was silent) ----
		{
			const home = await page.evaluate(() => {
				const a = document.getElementById('bar-home');
				if (!a) return null;
				a.addEventListener('click', e => e.preventDefault());   // (stay on the page)
				const cs = getComputedStyle(a);
				return { cls: a.className, bg: cs.backgroundColor, font: cs.fontFamily, href: a.getAttribute('href') };
			});
			A(home && /bal-btn/.test(home.cls) && home.bg === 'rgb(253, 162, 0)' && /m6x11/.test(home.font) && home.href === '../', 'bar: "home" is a kit button (orange, back) and still goes home', home);
			await page.click('#bar-home');
			const played = await waitFor(() => page.evaluate(() => window.__kitPlays > 0), 4000);
			A(played, 'bar: pressing "home" plays the kit press sound');
		}

		// ---- the canvas screens drawn outside ow_menus.js ----
		const SCREENS = [
			['gamecorner', `const m = await import('/overworld/ow_gamecorner.js'); m.gcMenu.open = true; m.gcMenu.mode = 'hub'; m.gcMenu.idx = 0;`, `const m = await import('/overworld/ow_gamecorner.js'); m.gcMenu.open = false;`],
			['voltorbflip', `const m = await import('/overworld/ow_gamecorner.js'), V = await import('/overworld/voltorbflip.js'); m.vfMenu.game = V.newGame(1); m.vfMenu.game.board[0].flipped = true; m.vfMenu.game.board[1].flipped = true; m.vfMenu.cur = 12; m.vfMenu.open = true;`, `const m = await import('/overworld/ow_gamecorner.js'); m.vfMenu.open = false; m.vfMenu.game = null;`],
			['slots', `const m = await import('/overworld/ow_minigames.js'); m.slotsMenu.open = true; m.slotsMenu.game = null;`, `const m = await import('/overworld/ow_minigames.js'); m.slotsMenu.open = false;`],
			['unowndex', `const m = await import('/overworld/ow_venues.js'); m.unownDex.open = true;`, `const m = await import('/overworld/ow_venues.js'); m.unownDex.open = false;`],
			['pokeblockcase', `const m = await import('/overworld/pokeblock_case.js'); m.openPokeblockCase('field');`, `const m = await import('/overworld/ow_menukeys.js'); for (let i = 0; i < 4 && m.CANVAS_MENUS().pbCase.open; i++) m.pressKey('x');`],
			['mail', `const m = await import('/overworld/ow_screens.js'); m.mailMenu.open = true; m.mailMenu.rows = []; m.mailMenu.loading = false;`, `const m = await import('/overworld/ow_screens.js'); m.mailMenu.open = false;`],
			['replays', `const m = await import('/overworld/ow_battletape.js'); m.openReplays();`, `const m = await import('/overworld/ow_battletape.js'); m.replayMenu.open = false;`],
			['trade', `const m = await import('/overworld/ow_menustate.js'); Object.assign(m.trade, { open: true, them: 'RIVAL', mine: { money: 500, items: [{ id: 'potion', count: 2 }] }, theirs: { stars: 30 }, myAccept: true, theirAccept: false, done: false, scene: 0, goAt: 0, rows: [{ label: 'POTION', owned: 3, kind: 'item' }, { label: 'LOCK IN', kind: 'accept' }, { label: 'CANCEL TRADE', kind: 'cancel' }], idx: 0, cat: 0, status: 'Make your offer.' });`, `const m = await import('/overworld/ow_menustate.js'); m.trade.open = false;`],
		];
		for (const [name, open, close] of SCREENS) {
			const r = await page.evaluate(async (open) => {
				window.__paint.fill.clear(); window.__paint.stroke.clear(); window.__paint.font.clear();
				await (new Function('return (async () => {' + open + '})()'))();
				await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
				window.__paint.on = true;
				await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
				window.__paint.on = false;
				return { fill: [...window.__paint.fill], stroke: [...window.__paint.stroke], font: [...window.__paint.font], ui: window.__ow.menuUi.length };
			}, open);
			if (SHOTS) { const el = await page.$('#screen'); await el.screenshot({ path: path.join(SHOTS, `ow_${name}.png`) }); }
			A(r.ui > 0, `${name}: drew its tap boxes (${r.ui})`);
			A(r.fill.includes('#3a4b4f'), `${name}: painted on the kit's panel colour`, r.fill.slice(0, 12));
			A(r.font.length > 0 && r.font.every(f => /m6x11/.test(f)), `${name}: every font is m6x11`, r.font.filter(f => !/m6x11/.test(f)));
			const old = OLD.filter(c => r.fill.includes(c) || r.stroke.includes(c));
			A(!old.length, `${name}: none of its old colours remain`, old);
			await page.evaluate(async (close) => { await (new Function('return (async () => {' + close + '})()'))(); }, close);
		}

		// ---- the "N watching" badge and the touch objective strip (the HUD over the map) ----
		const badge = await page.evaluate(async () => {
			const F = await import('/overworld/ow_frontier.js'), core = await import('/overworld/ow_core.js');
			window.__paint.fill.clear(); window.__paint.font.clear(); window.__paint.on = true;
			F.drawWatchingBadge(core.screen.width, Math.min(core.screen.height, Math.round(core.screen.width / 1.5)), 3);
			window.__paint.on = false;
			return { fill: [...window.__paint.fill], font: [...window.__paint.font] };
		});
		A(badge.fill.includes('#1f2a2c') && !badge.fill.includes('rgba(20,30,50,0.82)') && badge.font.every(f => /m6x11/.test(f)), 'watching badge: the kit\'s dark chip, m6x11', badge);

		// ---- sounds: PARTY and BAG open audibly now (START always did); the keys still open them ----
		await page.evaluate(() => { window.__played.length = 0; });
		await page.keyboard.press('Backspace'); await sleep(250);
		const party = await page.evaluate(() => ({ open: window.__ow.partyMenu.open, played: window.__played.slice() }));
		A(party.open && party.played.includes('ui_open'), 'Backspace opens PARTY with the open sound', party);
		await page.keyboard.press('x'); await sleep(200);
		await page.evaluate(async () => { window.__played.length = 0; (await import('/overworld/ow_menukeys.js')).pressKey('b'); });
		await sleep(200);
		const bag = await page.evaluate(() => ({ open: window.__ow.bagMenu.open, played: window.__played.slice() }));
		A(bag.open && bag.played.includes('ui_open'), 'the BAG opens with the open sound', bag);
		await page.keyboard.press('x'); await sleep(200);
		A(!(await page.evaluate(() => window.__ow.bagMenu.open || window.__ow.partyMenu.open)), 'X closes them again');

		A(errors.length === 0, 'no uncaught page errors', errors[0]);
		await page.close();

		// ---- a phone (390 x 844, touch): the kit's .bal-page must not change the tall view's layout. Its min-height
		// kept the body from shrinking, so the page was centred 27px up under the topbar and CLOSE could not be tapped.
		{
			const lib = await libServer({});
			const t = await openOverworld(browser, lib.port, { touch: true, viewport: { width: 390, height: 844 } });
			await t.page.evaluate(() => { window.__ow.startMenu.open = false; window.__ow.optionsMenu.open = true; });
			await sleep(400);
			const b = await t.page.evaluate(() => window.__ow.menuUi.find(b => b.id === 'close'));
			const p = b && await canvasToClient(t.page, b.x + b.w / 2, b.y + b.h / 2);
			const hit = p && await t.page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e && e.id; }, p.x, p.y);
			const top = await t.page.evaluate(() => document.body.getBoundingClientRect().top);
			A(top === 0 && hit === 'screen', 'phone: the page is not pushed up under the topbar; a tap on CLOSE lands on the canvas', { top, hit });
			if (SHOTS) await t.page.screenshot({ path: path.join(SHOTS, 'ow_phone_options.png') });
			await t.page.evaluate(() => { window.__ow.optionsMenu.open = false; });
			await sleep(300);
			if (SHOTS) await t.page.screenshot({ path: path.join(SHOTS, 'ow_phone_touch.png') });
			await t.page.close(); lib.server.close();
		}
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
