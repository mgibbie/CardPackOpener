// poketactica_items_test.mjs — the owner's batch of 2026-11-21 on the real page: the camp SHOP (stars for held items,
// evolution items, Rare Candy, figurines), a figurine's HELD item (on, swapped, off), EVOLUTION (by level and by a stone;
// "Not now" keeps it), Rare Candy, held items in battle (the unit panel; a Choice lock greys the other moves), the results'
// "Can evolve", and the cries (only with sound on). Keyboard and touch.
// Needs headless Chrome/Edge + overworld/data + micasurvivor/assets.
//   node overworld/tests/poketactica_items_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8948;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const pool = (ids) => ids.map((id) => ({ id, lv: 1, xp: 0 }));
const exp = (lv) => Math.floor(0.8 * lv ** 3);
const COL = (o = {}) => JSON.stringify({ v: 1, starters: true, cleared: ['c1-1'], ...(o.items ? { items: o.items } : {}), figs: {
	'char-a': { v: 1, id: 'char-a', species: 'charmander', level: 30, exp: exp(30), ability: 'blaze', shiny: false, pool: pool(['scratch', 'growl', 'ember', 'smokescreen']), equipped: ['scratch', 'ember'], ...(o.charHeld ? { held: o.charHeld } : {}) },
	'mach-b': { v: 1, id: 'mach-b', species: 'machamp', level: 25, exp: exp(25), ability: null, shiny: false, pool: pool(['karatechop', 'lowkick', 'leer']), equipped: ['karatechop', 'lowkick'], ...(o.machHeld ? { held: o.machHeld } : {}) },
	'eevee-c': { v: 1, id: 'eevee-c', species: 'eevee', level: 12, exp: exp(12), ability: null, shiny: false, pool: pool(['tackle', 'tailwhip']), equipped: ['tackle', 'tailwhip'] },
} });
const WALLET = (n) => JSON.stringify({ e: { testdev01: n }, s: {} });
async function open(vp, figs, extra = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [], cries = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('request', (r) => { if (/\/sounds\/cries\//.test(r.url())) cries.push(r.url().split('/').pop()); });
	await page.evaluateOnNewDocument((figs, extra) => {
		try {
			if (!sessionStorage.getItem('seeded')) { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_figs_v1', figs); for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); }
		} catch { /* ignore */ }
	}, figs, extra);
	await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
	await sleep(700);
	const t = { ctx, page, errors, cries };
	t.key = async (k, ms = 150) => { await page.keyboard.press(k); await sleep(ms); };
	t.idle = () => page.evaluate(() => new Promise((r) => { const s = Date.now(); const k = () => (!window.__poketactica.P.busy || Date.now() - s > 30000 ? r() : setTimeout(k, 60)); k(); }));
	t.E = (fn, ...a) => page.evaluate(fn, ...a);
	t.col = () => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')));
	t.wallet = () => page.evaluate(() => window.__poketactica.wallet());
	t.screen = () => page.evaluate(() => window.__poketactica.P.screen === 'camp' && window.__poketactica.hub.H.screen);
	t.labels = () => page.evaluate(() => window.__poketactica.hub.labels());
	t.focus = () => page.evaluate(() => window.__poketactica.hub.focusLabel());
	/** press the camp button whose label matches `re` (a click: what a tap does) */
	t.tap = async (re, ms = 300) => {
		const i = (await t.labels()).findIndex((l) => re.test(l));
		if (i < 0) throw new Error('no button ' + re + ' in ' + JSON.stringify(await t.labels()));
		await page.evaluate((i) => document.querySelectorAll('#hub [data-nav]')[i].click(), i); await sleep(ms);
	};
	/** move the focus with the arrows to the button matching `re`, then Z (the keyboard way) */
	t.zTo = async (re, ms = 300) => {
		for (let n = 0; n < 40 && !re.test(await t.focus() || ''); n++) await t.key('ArrowDown', 50);
		if (!re.test(await t.focus() || '')) throw new Error('could not focus ' + re + '; focus ' + await t.focus());
		await t.key('KeyZ', ms);
	};
	t.menu = () => page.evaluate(() => { const P = window.__poketactica.P; return P.menu ? P.menu.items.map((i) => ({ label: i.label.replace(/<[^>]+>/g, '').trim(), off: i.off })) : null; });
	return t;
}
/** (in a battle) put our unit `uid` on a free tile next to a foe, as if it had walked there; -> the foe's tile */
const nextToFoe = (t, uid) => t.E((uid) => {
	const T = window.__poketactica, S = T.P.S, B = T.B, u = B.unit(S, uid);
	for (const e of B.onMap(S, 'e')) for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
		const x = e.x + dx, y = e.y + dy;
		if (x < 0 || y < 0 || x >= S.map.w || y >= S.map.h || S.map.height[y * S.map.w + x] == null || B.unitAt(S, x, y) || (S.symbols || []).some((g) => g.x === x && g.y === y)) continue;
		if (x === S.map.base.x && y === S.map.base.y) continue;
		if (Math.abs((S.map.height[y * S.map.w + x] || 0) - (S.map.height[e.y * S.map.w + e.x] || 0)) > 1) continue;
		u.x = x; u.y = y; u.moved = true; u.origin = null; return [e.x, e.y];
	}
	return null;
}, uid);
const count = (col, id) => Object.values(col.items || {}).filter((x) => x === id).length;

try {
	// ---------- the shop, by keyboard: buy a held item; not enough stars; tabs with Q / E; a figurine
	{
		const t = await open({ width: 1280, height: 760 }, COL(), { magepunk_stars_v1: WALLET(500) });
		A(/Shop/.test((await t.labels()).join(' ')), 'the camp has a Shop');
		await t.zTo(/Shop/);
		A(await t.screen() === 'shop' && /Leftovers/.test(await t.focus()), 'Shop: the Held items tab, the focus on its first item (Leftovers)', await t.focus());
		await t.key('KeyZ', 300);
		let col = await t.col();
		A(count(col, 'leftovers') === 1 && await t.wallet() === 380, 'Z buys it: one Leftovers in the bag, 120 ★ spent', [count(col, 'leftovers'), await t.wallet()]);
		await t.key('KeyE', 250);
		A(/Fire Stone/.test((await t.labels()).join(' ')) && await t.E(() => document.querySelector('#hub .bal-tab.is-on').textContent) === 'Evolution', 'E: the Evolution tab');
		await t.tap(/^Fire Stone/);
		col = await t.col();
		A(count(col, 'firestone') === 1 && await t.wallet() === 320, 'a tap buys a Fire Stone (60 ★)');
		await t.key('KeyE', 250);
		await t.tap(/^Rare Candy/); await t.tap(/^Rare Candy/);
		A(count(await t.col(), 'rarecandy') === 2 && await t.wallet() === 270, 'two Rare Candies (25 ★ each)');
		await t.key('KeyE', 250);
		const before = Object.keys((await t.col()).figs).length;
		const labels = await t.labels();
		A(labels.some((l) => /Bulbasaur/.test(l)) && labels.some((l) => /200★/.test(l)), 'the Figurines tab: the starters at 200 ★');
		await t.tap(/Bulbasaur/);
		col = await t.col();
		const nf = Object.values(col.figs).find((f) => f.from === 'shop');
		A(Object.keys(col.figs).length === before + 1 && nf && nf.species === 'bulbasaur' && nf.level === 5 && await t.wallet() === 70, 'buying one: a new Lv 5 Bulbasaur figurine, 200 ★ spent', nf);
		await t.tap(/Charmander/);
		A(Object.keys((await t.col()).figs).length === before + 1 && await t.wallet() === 70 && /Not enough stars/.test(await t.E(() => document.body.textContent)), 'not enough stars: nothing is bought, and it says why', [Object.keys((await t.col()).figs).length, before, await t.wallet(), await t.E(() => document.getElementById('toast').textContent)]);
		await t.key('KeyQ', 200); await t.key('KeyQ', 200); await t.key('KeyQ', 200);
		const off = await t.E(() => [...document.querySelectorAll('#hub .ph-row')].filter((b) => /Choice Band/.test(b.textContent)).map((b) => b.classList.contains('is-disabled'))[0]);
		A(off === true, 'an item that costs more than the wallet is greyed out');
		await t.key('KeyX', 300);
		A(await t.screen() === 'home', 'X: back to the camp');
		A(t.errors.length === 0, 'no page errors (shop)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ---------- a held item: on, swapped, off (keyboard and touch); evolution with "Not now", then Evolve!; a stone; Rare Candy
	{
		const items = { 'leftovers-aaaa1': 'leftovers', 'charcoal-bbbb2': 'charcoal', 'firestone-cccc3': 'firestone', 'rarecandy-dddd4': 'rarecandy' };
		const t = await open({ width: 1280, height: 760 }, COL({ items }));
		A(/can evolve/.test((await t.labels()).find((l) => /Squad/.test(l)) || ''), 'the Squad button says a figurine can evolve');
		await t.zTo(/Squad/);
		A(/✨/.test(await t.E(() => document.querySelector('#hub .ph-card').textContent)), 'Squad: the Charmander (Lv 30) has the ✨ badge');
		await t.key('KeyZ', 300);
		A(await t.screen() === 'moves' && (await t.labels()).some((l) => /No held item/.test(l)) && (await t.labels()).some((l) => /Evolve!/.test(l)) && (await t.labels()).some((l) => /Rare Candy/.test(l)), 'its screen: held item, Evolve! and Rare Candy on top of the move slots', await t.labels());
		A(/Scratch/.test(await t.focus()), 'the focus still starts on slot 1');
		// held: Leftovers on (keyboard)
		await t.key('ArrowUp', 120); for (let n = 0; n < 4 && !/held item/i.test(await t.focus()); n++) await t.key('ArrowLeft', 80);
		await t.key('KeyZ', 300);
		A(await t.screen() === 'held' && (await t.labels()).some((l) => /Leftovers/.test(l)) && (await t.labels()).some((l) => /Charcoal/.test(l)), 'Z on it: the held item screen lists your held items', await t.labels());
		await t.zTo(/^Leftovers/);
		let col = await t.col();
		A(col.figs['char-a'].held === 'leftovers' && !count(col, 'leftovers') && await t.screen() === 'moves' && (await t.labels()).some((l) => /Leftovers/.test(l)), 'Leftovers on: the Charmander holds it, it leaves the bag');
		// swap to Charcoal (touch)
		await t.tap(/Leftovers/);
		await t.tap(/^Charcoal/);
		col = await t.col();
		A(col.figs['char-a'].held === 'charcoal' && count(col, 'leftovers') === 1 && !count(col, 'charcoal'), 'swapped to Charcoal by touch: the Leftovers goes back in the bag');
		await t.tap(/Charcoal/); await t.tap(/Take off/);
		col = await t.col();
		A(!col.figs['char-a'].held && count(col, 'charcoal') === 1, 'taken off: back in the bag');
		await t.tap(/^Charcoal/);
		// Rare Candy
		await t.tap(/Rare Candy/);
		col = await t.col();
		A(col.figs['char-a'].level === 31 && !count(col, 'rarecandy'), 'Rare Candy: Lv 30 → 31, used up');
		// evolution: Not now, then Evolve!
		await t.tap(/Evolve!/);
		A(await t.screen() === 'evolve' && /Charmeleon/.test(await t.focus()), 'Evolve!: its evolutions, the ready one focused');
		await t.key('KeyZ', 300);
		A(await t.screen() === 'evolve-ask' && /Evolve\?/.test(await t.E(() => document.querySelector('#hub h2').textContent)), 'Z: "Evolve?" with the stats before and after');
		await t.zTo(/Not now/);
		A((await t.col()).figs['char-a'].species === 'charmander' && await t.screen() === 'evolve', '"Not now": it stays a Charmander');
		await t.key('KeyZ', 300); await t.zTo(/Evolve!/, 400);
		col = await t.col();
		const ch = col.figs['char-a'];
		A(ch.species === 'charmeleon' && ch.level === 31 && ch.held === 'charcoal' && ch.evo === 1 && JSON.stringify(ch.equipped) === '["scratch","ember"]', 'Evolve!: a Charmeleon, same level, item and moves', ch);
		A(/Charmeleon/.test(await t.E(() => document.querySelector('#hub h2').textContent)), 'back on its screen, now Charmeleon');
		// a stone: Eevee -> Flareon (touch)
		await t.key('KeyX', 300);
		await t.E(() => { const cards = [...document.querySelectorAll('#hub .ph-card')]; cards.find((c) => /Eevee/.test(c.textContent)).click(); }); await sleep(300);
		await t.tap(/Evolution|Evolve!/);
		const lab = await t.labels();
		A(lab.some((l) => /Flareon.*ready/.test(l)) && lab.some((l) => /Vaporeon/.test(l) && !/ready/.test(l)), 'Eevee: the Fire Stone opens Flareon; Vaporeon waits for its stone', lab);
		await t.tap(/Flareon/); await t.tap(/Evolve!/, 400);
		col = await t.col();
		A(col.figs['eevee-c'].species === 'flareon' && !count(col, 'firestone'), 'Flareon: the Fire Stone is used up');
		A(t.errors.length === 0, 'no page errors (items, evolution)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ---------- in battle: the held item on the unit panel; a Choice lock greys the other moves; the results' "Can evolve"; cries
	{
		const t = await open({ width: 1280, height: 760 }, COL({ charHeld: 'leftovers', machHeld: 'choiceband' }), { micatro_sfx: '1' });
		await t.E(() => { const h = window.__poketactica.hub; h.team({ kind: 'training' }); }); await sleep(300);
		await t.tap(/Sortie/, 1500);
		await t.E(() => { const T = window.__poketactica; T.act({ t: 'deploy', uid: 'p0' }); }); await t.idle();
		await t.E(() => { const T = window.__poketactica, u = T.B.unit(T.P.S, 'p0'); T.cursorTo(u.x, u.y); }); await sleep(300);
		A(/Leftovers/.test(await t.E(() => document.getElementById('u-sp').textContent)), 'the unit panel shows the held item');
		// Machamp: locked into Karate Chop
		const foeAt = await nextToFoe(t, 'p0');
		await t.E(() => { const T = window.__poketactica; T.act({ t: 'deploy', uid: 'p1' }); }); await t.idle();
		await t.E(() => { const T = window.__poketactica, u = T.B.unit(T.P.S, 'p1'); u.choiceLock = 'karatechop'; T.cursorTo(u.x, u.y); }); await sleep(250);
		await t.key('KeyZ', 300);
		const m = await t.menu(); const atk = m && m.findIndex((x) => /^Attack/.test(x.label));
		for (let i = 0; i < atk; i++) await t.key('ArrowDown', 60);
		await t.key('KeyZ', 300);
		const moves = await t.menu();
		A(moves && moves.find((x) => /Karate Chop/.test(x.label)) && !moves.find((x) => /Karate Chop/.test(x.label)).off && /Locked into Karate Chop/.test(String((moves.find((x) => /Low Kick/.test(x.label)) || {}).off)), 'Choice Band: the other move is greyed ("Locked into Karate Chop")', [m, moves]);
		await t.key('KeyX', 200); await t.key('KeyX', 200); await t.key('KeyX', 200);
		// an attack plays a cry (sound on)
		await t.E((a) => { const T = window.__poketactica; window._r2 = T.act({ t: 'attack', uid: 'p0', move: 'scratch', x: a[0], y: a[1] }); }, foeAt); await t.idle(); await t.E(() => window.__poketactica.act({ t: 'execute' })); await t.idle(); await sleep(300);
		A(t.cries.some((c) => /charmander\.ogg/.test(c)), 'an attack plays the attacker\'s cry (sound on)', [t.cries, await t.E(() => ({ r: window._r2, skip: window.__poketactica.P.skip, log: window.__poketactica.P.S.log.slice(-5).map((e) => e.t) }))]);
		// the results: Charmander (Lv 30) can evolve
		await t.E(() => { const T = window.__poketactica, S = T.P.S; S.over = 'won'; S.phase = 'won'; S.exp = { p0: 10 }; T.cursorTo(S.map.base.x, S.map.base.y); }); await sleep(2200);
		A(await t.E(() => [...document.querySelectorAll('#result .pt-ru')].some((r) => /Charmander/.test(r.textContent) && r.querySelector('.pt-ru-evo'))), 'the results: "Can evolve" on the Charmander');
		A(t.errors.length === 0, 'no page errors (battle)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	{   // sound off: no cries are even fetched
		const t = await open({ width: 1280, height: 760 }, COL());
		await t.E(() => window.__poketactica.hub.team({ kind: 'training' })); await sleep(300);
		await t.tap(/Sortie/, 1500);
		await t.E(() => window.__poketactica.act({ t: 'deploy', uid: 'p0' })); await t.idle();
		const at = await nextToFoe(t, 'p0');
		await t.E((a) => { const T = window.__poketactica; window._r = T.act({ t: 'attack', uid: 'p0', move: 'scratch', x: a[0], y: a[1] }); }, at); await t.idle(); await t.E(() => window.__poketactica.act({ t: 'execute' })); await t.idle(); await sleep(300);
		A(await t.E(() => window._r.ok && window.__poketactica.P.S.log.some((e) => e.t === 'use')), 'the attack played (sound off)');
		A(t.cries.length === 0, 'sound off: no cry is played (or fetched)', t.cries);
		await t.ctx.close();
	}
} catch (e) { fail++; console.log('FAIL: crashed ' + (e && e.stack || e)); } finally { await browser.close(); server.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
