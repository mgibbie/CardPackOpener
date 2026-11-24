// poketactica_book_test.mjs — the FIGURINE BOOK (owner, 2026-11-22: "a Pokédex-style list of which species you own, which
// you've seen, and where each one can be found"): book.js on the real data, then the camp's book screen by keyboard,
// controller and touch, on a desktop and a phone.
//   node overworld/tests/poketactica_book_test.mjs [--shots=<dir>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as Bk from '../../poketactica/js/book.js';
import { FIGURINE_BALLS } from '../ow_figurine.js';
import { FIGURINE_BALLS as BALLS2 } from '../../poketactica/js/figballs.js';
import { MAPS } from '../../poketactica/js/campaign.js';
import { STARTERS } from '../../poketactica/js/figcol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8963;
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').split('=')[1] || null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

// ---------------------------------------------------------------- book.js
const data = { species: J('overworld/data/species_battle.json'), extra: J('overworld/data/species_extra.json') };
const enc = J('overworld/data/encounters.json'), regions = J('overworld/map_regions.json');
const wild = Bk.wildIndex(enc, regions);
const dex = Bk.dexList(data);
A(dex.length === Bk.DEX_MAX && dex[0].id === 'bulbasaur' && dex[24].id === 'pikachu' && dex.at(-1).num === 1025 && dex.every((d, i) => d.num === i + 1), 'the book: the National Dex, 1 to 1025, one entry each (its plain form)', [dex.length, dex[0], dex.at(-1)]);
A(Bk.GENS.reduce((n, [a, b]) => n + b - a + 1, 0) === Bk.DEX_MAX && Bk.genOf(151) === 1 && Bk.genOf(152) === 2 && Bk.genOf(1025) === 9, 'nine generations cover it');
A(FIGURINE_BALLS === BALLS2, 'the overworld\'s figurine balls are the book\'s table (one table)');
// owned (a form counts for its number), met (a cleared story map's foes)
{
	const fig = (id, species, level, shiny) => ({ id, species, level, shiny });
	const col = { figs: { a: fig('a', 'pikachu', 12), b: fig('b', 'pikachu', 30, true), c: fig('c', 'charmander', 5) }, cleared: ['c1-1'] };
	const alola = Object.keys(data.species).find((k) => k !== 'raichu' && data.species[k].num === 26);
	if (alola) col.figs.d = fig('d', alola, 7);
	const st = Bk.bookState(col, data);
	A(st.owned.get(25).n === 2 && st.owned.get(25).best === 30 && st.owned.get(25).shiny && st.owned.get(4).n === 1, 'owned: how many, the best level, a shiny', [...st.owned]);
	A(!alola || (st.owned.get(26) && st.owned.get(26).n === 1), 'a form counts for its Dex number', alola);
	const c11 = MAPS.find((m) => m.id === 'c1-1');
	A(c11.foes.every((f) => st.met.has(data.species[f.sp].num)) && !st.met.has(150), 'met: the foes of the story maps you have cleared');
	A(st.count === st.owned.size, 'the count is the Dex numbers owned');
}
// where to find
{
	const ways = (id) => Bk.whereToFind(id, data, wild);
	const k = (id) => ways(id).map((w) => w.k);
	A(STARTERS.every((sp) => k(sp)[0] === 'starter'), 'every starter: its pick and the Shop, first');
	A(k('caterpie').includes('ball') && /Route 2/.test(ways('caterpie').find((w) => w.k === 'ball').text), 'a figurine ball names its route', ways('caterpie'));
	A(k('caterpie').includes('wild') && /Viridian Forest/.test(ways('caterpie').find((w) => w.k === 'wild').text), 'the overworld\'s wild places (from its encounters)', ways('caterpie'));
	A(/Lv 2/.test(ways('rattata').find((w) => w.k === 'wild').text.split(';')[0]), 'the earliest place first (the lowest level)', ways('rattata').find((w) => w.k === 'wild').text.slice(0, 120));
	A(/\d+ more places/.test(ways('rattata').find((w) => w.k === 'wild').text), 'a long list is cut, and the rest counted');
	A(k('onix').includes('reward') && k('onix').includes('story'), 'a story map\'s reward and its foes', ways('onix'));
	A(k('charizard').includes('evolve') && /Charmeleon at Lv 36/.test(ways('charizard').find((w) => w.k === 'evolve').text), 'evolving: from which, at what level', ways('charizard'));
	A(ways('espeon').some((w) => /Eevee/.test(w.text)) && ways('vaporeon').some((w) => /Eevee with a Water Paint/i.test(w.text)), 'friendship and stone evolutions', [ways('espeon'), ways('vaporeon')]);
	A(k('rattata').includes('training'), 'Training Grounds\' wild Pokémon');
	A(/floors 1-/.test(ways('pidgey').find((w) => w.k === 'dungeon').text) && /boss from floor/.test(ways('mewtwo').find((w) => w.k === 'dungeon').text), 'the Dungeon: weak ones early, legendaries as bosses from floor 30', [ways('pidgey'), ways('mewtwo')]);
	A(Bk.dungeonFloors(data.species.mewtwo, 150).from >= 30, 'no legendary before floor 30');
	A(dex.every((d) => ways(d.id).length > 0), 'every Pokémon in the book says something about where to find it', dex.filter((d) => !ways(d.id).length).map((d) => d.id));
	A(![...wild.values()].some((l) => l.some((p) => p.region === 'HOENN2')), 'HOENN2 (gleep\'s region) is never listed');
	const noOw = Bk.whereToFind('caterpie', data, null);
	A(noOw.every((w) => w.k !== 'wild') && noOw.some((w) => w.k === 'ball'), 'before the overworld\'s places load: the rest shows');
	A(Bk.prettyMap('RockTunnel_B1F') === 'Rock Tunnel B1F' && Bk.prettyMap('MAP_SINNOH_ROUTE212_SOUTH') === 'Route 212 South' && Bk.prettyMap('MAP_ROUTE_26') === 'Route 26', 'place names read as names', [Bk.prettyMap('RockTunnel_B1F'), Bk.prettyMap('MAP_SINNOH_ROUTE212_SOUTH')]);
	const sinnoh = wild.get('sneasel').find((p) => p.region === 'SINNOH');
	A(sinnoh && !/^Sinnoh/.test(sinnoh.map), 'no region twice ("Sinnoh · Route 216", not "Sinnoh · Sinnoh Route 216")', sinnoh);
}

// ---------------------------------------------------------------- the page
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const FIGS = JSON.stringify({ v: 1, starters: true, cleared: ['c1-1'], figs: Object.fromEntries([['pikachu', 12], ['pikachu', 30], ['charmander', 5], ['onix', 14]].map(([sp, lv], i) => [sp + '-bk' + i, { v: 1, id: sp + '-bk' + i, species: sp, level: lv, exp: 0, ability: null, shiny: i === 1, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'] }])) });
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument((figs) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* */ }
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
			window.__owFakePads = [pad]; window.__pad = pad;
		}, FIGS);
		await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now(); while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
		await sleep(600);
		const t = { page, errors };
		t.key = async (k, ms = 160) => { await page.keyboard.press(k); await sleep(ms); };
		t.pad = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(160); };
		t.E = (fn, ...a) => page.evaluate(fn, ...a);
		t.H = () => t.E(() => { const h = window.__poketactica.hub.H; return { screen: h.screen, tab: h.bookTab, focus: h.focus, wild: !!h.wild }; });
		t.focus = () => t.E(() => window.__poketactica.hub.focusLabel());
		t.detail = () => t.E(() => (document.querySelector('#hub .ph-detail') || {}).textContent || '');
		t.keyTo = async (re) => { for (let i = 0; i < 24; i++) { const f = await t.focus(); if (f && re.test(f)) { await t.key('KeyZ', 400); return true; } await t.key(i < 12 ? 'ArrowDown' : 'ArrowUp', 70); } return false; };
		t.shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
		return t;
	};
	// ---------- keyboard + controller, desktop
	{
		const t = await open({ width: 1280, height: 800 });
		const home = await t.E(() => window.__poketactica.hub.labels());
		A(home.some((l) => /Figurine book/.test(l) && /3 \/ 1025 owned/.test(l)), 'the camp: Figurine book, 3 / 1025 owned (two Pikachu count once)', home);
		A(await t.keyTo(/Figurine book/), 'Z on Figurine book');
		let h = await t.H();
		A(h.screen === 'book' && h.tab === 0, 'the book opens on Gen 1', h);
		const cards = await t.E(() => [...document.querySelectorAll('#hub .ph-card')].map((c) => ({ cls: c.className, t: c.textContent.replace(/\s+/g, ' ').trim() })));
		A(cards.length === 151 && /#0001/.test(cards[0].t) && /Bulbasaur/.test(cards[0].t), 'Gen 1: 151 entries, numbered, named', cards.slice(0, 2));
		const pika = cards[24], char = cards[3], rat = cards[18], mew = cards[149];
		A(/ph-book-owned/.test(pika.cls) && /×2/.test(pika.t) && /★/.test(pika.t) && /Lv 30/.test(pika.t), 'Pikachu: owned, ×2, shiny, its best level', pika);
		A(/ph-book-owned/.test(char.cls) && /ph-book-met/.test(rat.cls) && /ph-book-none/.test(mew.cls), 'owned in colour, met (a cleared map\'s foe) greyed, not yet a silhouette', [char.cls, rat.cls, mew.cls]);
		await t.E(() => window.__poketactica.hub.H.wild ? 0 : new Promise((r) => { const i = setInterval(() => { if (window.__poketactica.hub.H.wild) { clearInterval(i); r(); } }, 100); setTimeout(r, 15000); }));
		h = await t.H();
		A(h.wild, 'the overworld\'s wild places loaded (fetched when the book opened)');
		// the arrows walk the grid; the panel says where to find the focused one
		for (let i = 0; i < 9; i++) await t.key('ArrowRight', 60);
		const f1 = await t.focus();
		A(f1 && !/Bulbasaur/.test(f1), 'the arrows move along the grid', f1);
		await t.E(() => { const el = [...document.querySelectorAll('#hub .ph-card')].find((c) => /Caterpie/.test(c.textContent)); el.click(); });
		await sleep(300);
		const det = await t.detail();
		A(/Where to find it/.test(det) && /figurine ball on Route 2/.test(det) && /Viridian Forest/.test(det) && /Combo Field/.test(det), 'Caterpie: its figurine ball, wild places, the story map', det.slice(0, 300));
		A(await t.E(() => window.__poketactica.hub.H.screen) === 'book', 'a not-owned one stays in the book (Z says where to look)');
		await t.shot('book-desktop');
		// Q / E change generation; a controller's shoulder buttons too
		await t.key('KeyE', 300);
		h = await t.H();
		const g2 = await t.E(() => document.querySelectorAll('#hub .ph-card').length);
		A(h.tab === 1 && g2 === 100, 'E: Gen 2 (100 entries)', [h, g2]);
		await t.key('KeyQ', 300); await t.key('KeyQ', 300);
		A((await t.H()).tab === 8, 'Q from Gen 1 wraps to Gen 9', await t.H());
		await t.pad(5);
		A((await t.H()).tab === 0, 'the controller\'s R: the next tab (Gen 1)', await t.H());
		// Z on an owned one: to the squad, on that figurine
		await t.E(() => { const el = [...document.querySelectorAll('#hub .ph-card')].find((c) => /Pikachu/.test(c.textContent)); el.click(); });
		await sleep(400);
		const sq = await t.E(() => ({ screen: window.__poketactica.hub.H.screen, f: window.__poketactica.hub.focusLabel() }));
		A(sq.screen === 'squad' && /Pikachu/.test(sq.f), 'Z (a click) on an owned one: the squad, on it', sq);
		await t.key('KeyX', 300);
		A(await t.E(() => window.__poketactica.hub.H.screen) === 'home', 'X: back (squad -> camp)');
		await t.pad(1);
		A(!t.errors.length, 'no page errors (desktop)', t.errors.slice(0, 3));
	}
	// ---------- touch, a phone
	{
		const t = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await t.E(() => window.__poketactica.hub.book());
		await sleep(500);
		const tap = async (sel) => { const r = await t.E((sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel); if (r) { await t.page.touchscreen.tap(r[0], r[1]); await sleep(450); } return r; };
		A(await tap('#hub .ph-booktabs .bal-tab:nth-child(4)'), 'a tab is on screen to tap');
		A((await t.H()).tab === 3, 'a tap on Gen 4 opens it', await t.H());
		const over = await t.E(() => document.documentElement.scrollWidth > innerWidth + 1);
		A(!over, 'no sideways scroll on a phone');
		const tabSeen = await t.E(() => { const row = document.querySelector('#hub .ph-booktabs'), on = row.querySelector('.is-on'); const a = row.getBoundingClientRect(), b = on.getBoundingClientRect(); return b.left >= a.left - 1 && b.right <= a.right + 1; });
		A(tabSeen, 'the open generation tab is in view (the tab row scrolls inside itself)');
		await tap('#hub .ph-card:nth-child(1)');
		const det = await t.detail();
		A(/Turtwig/.test(det) && /starter/i.test(det), 'a tap on Turtwig: its details, a starter', det.slice(0, 200));
		await t.shot('book-phone');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
