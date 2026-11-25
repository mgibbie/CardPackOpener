// poketactica_items_test.mjs — the owner's batch of 2026-11-21 on the real page: the camp SHOP (stars for held items,
// evolution items, Rare Polish, figurines), a figurine's HELD item (on, swapped, off), EVOLUTION (by level and by a stone;
// "Not now" keeps it), Rare Polish, held items in battle (the unit panel; a Choice lock greys the other moves), the results'
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
const COL = (o = {}) => JSON.stringify({ v: 1, starters: true, cleared: ['c1-1'], ...(o.items ? { items: o.items } : {}), ...(o.more || {}), figs: {
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
		A(await t.screen() === 'shop' && /Leftover Clay/.test(await t.focus()), 'Shop: the Held items tab, the focus on its first item (Leftover Clay)', await t.focus());
		await t.key('KeyZ', 300);
		let col = await t.col();
		A(count(col, 'leftovers') === 1 && await t.wallet() === 380, 'Z buys it: one Leftover Clay in the bag, 120 ★ spent', [count(col, 'leftovers'), await t.wallet()]);
		await t.key('KeyE', 250);
		A(/Fire Paint/.test((await t.labels()).join(' ')) && await t.E(() => document.querySelector('#hub .bal-tab.is-on').textContent) === 'Evolution', 'E: the Evolution tab');
		await t.tap(/^Fire Paint/);
		col = await t.col();
		A(count(col, 'firestone') === 1 && await t.wallet() === 320, 'a tap buys a Fire Paint (60 ★)');
		await t.key('KeyE', 250);
		await t.tap(/^Rare Polish/); await t.tap(/^Rare Polish/);
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
		const off = await t.E(() => [...document.querySelectorAll('#hub .ph-row')].filter((b) => /Choice Ribbon/.test(b.textContent)).map((b) => b.classList.contains('is-disabled'))[0]);
		A(off === true, 'an item that costs more than the wallet is greyed out');
		await t.key('KeyX', 300);
		A(await t.screen() === 'home', 'X: back to the camp');
		A(t.errors.length === 0, 'no page errors (shop)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ---------- a held item: on, swapped, off (keyboard and touch); evolution with "Not now", then Evolve!; a stone; Rare Polish
	{
		const items = { 'leftovers-aaaa1': 'leftovers', 'charcoal-bbbb2': 'charcoal', 'firestone-cccc3': 'firestone', 'rarecandy-dddd4': 'rarecandy', 'rarecandy-dddd5': 'rarecandy', 'rarecandy-dddd6': 'rarecandy', 'rarecandy-dddd7': 'rarecandy', 'rarecandy-dddd8': 'rarecandy' };
		const t = await open({ width: 1280, height: 760 }, COL({ items }));
		A(/can evolve/.test((await t.labels()).find((l) => /Squad/.test(l)) || ''), 'the Squad button says a figurine can evolve');
		await t.zTo(/Squad/);
		A(/✨/.test(await t.E(() => document.querySelector('#hub .ph-card').textContent)), 'Squad: the Charmander (Lv 30) has the ✨ badge');
		await t.key('KeyZ', 300);
		A(await t.screen() === 'moves' && (await t.labels()).some((l) => /No held item/.test(l)) && (await t.labels()).some((l) => /Evolve!/.test(l)) && (await t.labels()).some((l) => /Rare Polish/.test(l)), 'its screen: held item, Evolve! and Rare Polish on top of the move slots', await t.labels());
		A(/Scratch/.test(await t.focus()), 'the focus still starts on slot 1');
		// held: Leftover Clay on (keyboard)
		await t.key('ArrowUp', 120); for (let n = 0; n < 12 && !/held item/i.test(await t.focus()); n++) await t.key(n % 4 === 3 ? 'ArrowUp' : 'ArrowLeft', 80);   // (the tools, in one row or two: held item, Evolve!, favourite, Release, Rare Polish)
		await t.key('KeyZ', 300);
		A(await t.screen() === 'held' && (await t.labels()).some((l) => /Leftover Clay/.test(l)) && (await t.labels()).some((l) => /Charcoal/.test(l)), 'Z on it: the held item screen lists your held items', await t.labels());
		await t.zTo(/^Leftover Clay/);
		let col = await t.col();
		A(col.figs['char-a'].held === 'leftovers' && !count(col, 'leftovers') && await t.screen() === 'moves' && (await t.labels()).some((l) => /Leftover Clay/.test(l)), 'Leftover Clay on: the Charmander holds it, it leaves the bag');
		// swap to Charcoal (touch)
		await t.tap(/Leftover Clay/);
		await t.tap(/^Charcoal/);
		col = await t.col();
		A(col.figs['char-a'].held === 'charcoal' && count(col, 'leftovers') === 1 && !count(col, 'charcoal'), 'swapped to Charcoal by touch: the Leftover Clay goes back in the bag');
		await t.tap(/Charcoal/); await t.tap(/Take off/);
		col = await t.col();
		A(!col.figs['char-a'].held && count(col, 'charcoal') === 1, 'taken off: back in the bag');
		await t.tap(/^Charcoal/);
		// Rare Polish
		await t.tap(/Rare Polish/);
		col = await t.col();
		// (its price rises with the level: one more for every ten levels, so Lv 30 takes 4 of the 5)
		A(col.figs['char-a'].level === 31 && count(col, 'rarecandy') === 1, 'Rare Polish: Lv 30 → 31 takes four', [col.figs['char-a'].level, count(col, 'rarecandy')]);
		A((await t.labels()).some((l) => /Rare Polish/.test(l) && /takes 4/.test(l) && /×1/.test(l)), 'the row says what a level takes and what is left', await t.labels());
		await t.tap(/Rare Polish/);
		col = await t.col();
		A(col.figs['char-a'].level === 31 && count(col, 'rarecandy') === 1, 'one Rare Polish is not enough at Lv 31: nothing is used');
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
		A(lab.some((l) => /Flareon.*ready/.test(l)) && lab.some((l) => /Vaporeon/.test(l) && !/ready/.test(l)), 'Eevee: the Fire Paint opens Flareon; Vaporeon waits for its stone', lab);
		await t.tap(/Flareon/); await t.tap(/Evolve!/, 400);
		col = await t.col();
		A(col.figs['eevee-c'].species === 'flareon' && !count(col, 'firestone'), 'Flareon: the Fire Paint is used up');
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
		A(/Leftover Clay/.test(await t.E(() => document.getElementById('u-sp').textContent)), 'the unit panel shows the held item');
		// Machamp: locked into Karate Chop
		const foeAt = await nextToFoe(t, 'p0');
		await t.E(() => { const T = window.__poketactica; T.act({ t: 'deploy', uid: 'p1' }); }); await t.idle();
		await t.E(() => { const T = window.__poketactica, u = T.B.unit(T.P.S, 'p1'); u.choiceLock = 'karatechop'; T.cursorTo(u.x, u.y); }); await sleep(250);
		await t.key('KeyZ', 300);
		const m = await t.menu(); const atk = m && m.findIndex((x) => /^Attack/.test(x.label));
		for (let i = 0; i < atk; i++) await t.key('ArrowDown', 60);
		await t.key('KeyZ', 300);
		const moves = await t.menu();
		A(moves && moves.find((x) => /Karate Chop/.test(x.label)) && !moves.find((x) => /Karate Chop/.test(x.label)).off && /Locked into Karate Chop/.test(String((moves.find((x) => /Low Kick/.test(x.label)) || {}).off)), 'Choice Ribbon: the other move is greyed ("Locked into Karate Chop")', [m, moves]);
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
	// ---------- item LEVELS, SLOTS and PLUSH GEMSTONES in the camp (owner, 2026-11-24; Plans/POKETACTICA_ITEM_WORLD_PLAN.md, stage 2)
	{
		const items = { 'charcoal-aaaa1': 'charcoal', 'charcoal-bbbb2': 'charcoal', 'leftovers-cccc3': 'leftovers', 'stitchingkit-dddd4': 'stitchingkit' };
		const more = { gear: { 'charcoal-aaaa1': { lv: 31, gems: [] } }, gems: { 'gem-g1g1': 'atk:10', 'gem-g2g2': 'atk:15', 'gem-g3g3': 'spe:4', 'gem-g4g4': 'atk:2' } };
		const t = await open({ width: 1280, height: 760 }, COL({ items, more }), { magepunk_stars_v1: WALLET(500) });
		const has = async (re) => (await t.labels()).some((l) => re.test(l.replace(/\s+/g, ' ')));
		const head = () => t.E(() => document.querySelector('#hub .ph-head').textContent.replace(/\s+/g, ' '));
		A(await has(/Items & gemstones.*3 held items.*4 loose gemstones/), 'the camp has Items & gemstones: 3 held items, 4 loose gemstones', await t.labels());
		await t.zTo(/Items & gemstones/);
		A(await t.screen() === 'workshop' && await has(/Charcoal Stick ?Lv 31 ?◆ 0\/5/) && await has(/Charcoal Stick ?◆ 0\/4/) && await has(/Leftover Clay ?◆ 0\/4/) && await has(/Combine gemstones ?1 kit/), 'the list: the level 31 Charcoal Stick is its own row (5 slots), the plain one has 4; a kit to combine with', await t.labels());
		// one item's slots: open, and locked until a level
		await t.zTo(/Charcoal Stick ?Lv 31/);
		let ls = await t.labels();
		A(await t.screen() === 'gear' && /Lv 31 \/ 100/.test(await head()) && /◆ 0\/5/.test(await head()) && ls.filter((l) => /empty/.test(l)).length === 5 && ls.filter((l) => /locked/.test(l)).length === 3 && await has(/locked ?opens at level 50/) && await has(/opens at level 100/), 'its screen: level 31 of 100, five open slots, three locked until levels 50, 75 and 100', ls);
		// a gemstone into slot 1 (keyboard)
		await t.key('KeyZ', 300);
		A(await t.screen() === 'gem-pick' && await has(/Plush Ruby Lv 15 ?\+7\.5% Attack/) && await has(/Plush Ruby Lv 10/) && await has(/Plush Topaz Lv 4 ?\+2% Speed/), 'Z on an empty slot: your loose gemstones, each saying what it gives', await t.labels());
		await t.zTo(/Plush Ruby Lv 15/);
		let col = await t.col();
		A(await t.screen() === 'gear' && col.gear['charcoal-aaaa1'].gems.join() === 'atk:15' && col.gear['charcoal-aaaa1'].lv === 31 && !col.gems['gem-g2g2'] && /◆ 1\/5/.test(await head()) && await has(/Plush Ruby Lv 15 ?\+7\.5% Attack/), 'Z on a gemstone: it is in the slot, and no longer loose', [col.gear, col.gems]);
		// out again by touch (the ✕), in again by touch
		await t.E(() => document.querySelector('#hub [data-clear]').click()); await sleep(300);
		col = await t.col();
		A(!col.gear['charcoal-aaaa1'].gems.length && Object.values(col.gems).filter((g) => g === 'atk:15').length === 1 && /◆ 0\/5/.test(await head()), 'a tap on its ✕ takes it out: loose again (the item keeps its level)', [col.gear, col.gems]);
		await t.tap(/empty/); await t.tap(/Plush Ruby Lv 15/);
		col = await t.col();
		A(col.gear['charcoal-aaaa1'].gems.join() === 'atk:15', 'tapped back in');
		// a locked slot does nothing
		const before = JSON.stringify(await t.col());
		await t.tap(/locked ?opens at level 50/);
		A(await t.screen() === 'gear' && JSON.stringify(await t.col()) === before, 'a locked slot takes nothing');
		// combining: two of one stat, their levels added, a kit used
		await t.key('KeyX', 300);
		A(await t.screen() === 'workshop' && /Charcoal Stick ?Lv 31/.test(await t.focus()), 'X: back to the list, on the same item');
		await t.zTo(/Combine gemstones/);
		A(await t.screen() === 'combine' && await has(/Plush Ruby Lv 10/) && await has(/Plush Ruby Lv 2/) && !(await has(/Plush Topaz/)), 'Combine: the gemstones that have a partner of their stat (the lone Topaz is not offered)', await t.labels());
		await t.zTo(/Plush Ruby Lv 10/);
		A(await has(/Plush Ruby Lv 2 ?→ Plush Ruby Lv 12/) && /Plush Ruby Lv 10 \+/.test(await head()), 'the first picked: the second says what the two will make', await t.labels());
		await t.zTo(/Plush Ruby Lv 2/);
		col = await t.col();
		A(Object.values(col.gems).sort().join() === 'atk:12,spe:4' && !Object.values(col.items).includes('stitchingkit'), 'Z: one Plush Ruby of level 12; the kit is used up', [col.gems, col.items]);
		await t.key('KeyX', 300);
		A(await t.screen() === 'workshop' && await has(/Combine gemstones ?0 kits/), 'back at the list: no kits left');
		// the shop's Gemstones tab
		await t.zTo(/Shop for gemstones/);
		A(await t.screen() === 'shop' && await t.E(() => document.querySelector('#hub .bal-tab.is-on').textContent) === 'Gemstones' && await has(/Plush Emerald Lv 1 ?\+0\.5% HP/) && (await t.labels()).filter((l) => /Plush .* Lv 1/.test(l)).length === 6, 'the Shop\'s Gemstones tab: the six level 1 gemstones', await t.labels());
		await t.tap(/Plush Emerald/);
		col = await t.col();
		A(Object.values(col.gems).includes('hp:1') && await t.wallet() === 440, 'a tap buys a Plush Emerald (60 ★)', [col.gems, await t.wallet()]);
		await t.key('KeyX', 300); await t.key('KeyX', 300);
		// a figurine holds THAT item: its level and its gemstone go with it
		await t.tap(/Squad/); await t.tap(/Charmander/); await t.tap(/No held item/);
		A(await t.screen() === 'held' && await has(/Charcoal Stick ?Lv 31 ?◆ 1\/5/) && await has(/^Charcoal Stick$/), 'a figurine\'s held-item screen tells the levelled Charcoal Stick from the plain one', await t.labels());
		await t.tap(/Charcoal Stick ?Lv 31/);
		col = await t.col();
		A(col.figs['char-a'].held === 'charcoal' && col.figs['char-a'].gear.lv === 31 && col.figs['char-a'].gear.gems.join() === 'atk:15' && !col.items['charcoal-aaaa1'] && col.items['charcoal-bbbb2'] && !(col.gear || {})['charcoal-aaaa1'], 'it holds THAT one: level 31 and the Plush Ruby go onto the figurine; the plain one stays in the bag', [col.figs['char-a'], col.items, col.gear]);
		A(await t.screen() === 'moves' && await has(/Charcoal Stick ?Lv 31 ?◆ 1\/5/), 'its page shows the item\'s level and slots', await t.labels());
		// its gemstones can be changed while held; taking it off keeps everything
		await t.tap(/Charcoal Stick ?Lv 31/); await t.tap(/Its gemstones/);
		A(await t.screen() === 'gear' && /Held by Charmander/.test(await t.E(() => document.querySelector('#hub .ph-sub').textContent)) && /\+7\.5% Attack/.test(await t.E(() => document.querySelector('#hub .ph-sub').textContent)), 'Its gemstones: the same screen, for the item on the figurine');
		await t.key('KeyX', 300); await t.tap(/Take off/);
		col = await t.col();
		const backUid = Object.keys(col.gear || {})[0];
		A(!col.figs['char-a'].held && !col.figs['char-a'].gear && backUid && col.items[backUid] === 'charcoal' && col.gear[backUid].lv === 31 && col.gear[backUid].gems.join() === 'atk:15', 'taken off: back in the bag at level 31 with its Plush Ruby', [col.items, col.gear]);
		A(!t.errors || !t.errors.length, 'no page errors (items & gemstones)', t.errors);
		await t.ctx.close();
	}
	// ---------- the ITEM WORLD, tactics style (owner, 2026-11-24; Plans/POKETACTICA_ITEM_WORLD_PLAN.md, stage 3): into a held item,
	// a battle a floor; the exit banks the dive (the level, the finds); a loss or giving up banks nothing
	{
		const items = { 'charcoal-aaaa1': 'charcoal', 'leftovers-cccc3': 'leftovers' };
		const more = { gear: { 'charcoal-aaaa1': { lv: 8, gems: [] } } };
		const t = await open({ width: 1280, height: 760 }, COL({ items, more }), { magepunk_stars_v1: WALLET(100), magepunk_poketactica_perma_v1: '1' });
		const has = async (re) => (await t.labels()).some((l) => re.test(l.replace(/\s+/g, ' ')));
		const dive = () => t.E(() => JSON.parse(localStorage.getItem('magepunk_poketactica_itemworld_v1') || 'null'));
		const win = (how = 'won') => t.E((how) => { const S = window.__poketactica.P.S; S.over = how; S.phase = how; }, how);
		const result = () => t.E(() => ({ hidden: document.getElementById('result').hidden, text: document.getElementById('r-body').innerText.replace(/\s+/g, ' '), next: (document.querySelector('#result .pt-next') || {}).textContent || '' }));
		const battle = () => t.E(() => { const P = window.__poketactica.P, S = P.S; return { name: P.map && P.map.name, foes: S.units.filter((u) => u.side === 'e').map((u) => u.level), boss: !!(P.map && P.map.boss), perma: !!(P.setup && P.setup.perma), screen: P.screen }; });
		A(await has(/Item World ?go into a held item/), 'the camp has the Item World', await t.labels());
		await t.tap(/Item World/);
		A(await t.screen() === 'itemworld' && await has(/Charcoal Stick ?Lv 8 ?to floor 10/) && await has(/Leftover Clay ?to floor 10/), 'the Item World lists the held items in the bag, each with the exit floor its dive ends on', await t.labels());
		await t.tap(/Charcoal Stick/);
		A(await t.screen() === 'iw-style' && await has(/Battles/) && await has(/Mystery Maze/), 'an item: two ways to dive, battles or a Mystery Maze', await t.labels());
		await t.tap(/Battles/);
		A(/Item World · Charcoal Stick · floor 9/.test(await t.E(() => document.querySelector('#hub .ph-sub').textContent)) && /gone for good/.test(await t.E(() => document.querySelector('#hub .ph-sub').textContent)), 'the team screen names the item and the floor, and says it is deadly');
		await t.tap(/Sortie/, 900);
		let b = await battle(), d = await dive();
		A(b.screen === 'battle' && b.name === 'Charcoal Stick · floor 9' && b.perma && b.foes.length > 0 && b.foes.every((lv) => lv === 19) && !b.boss, 'floor 9 of the Charcoal Stick: a battle, its foes at level 19 (the item\'s price sets it), deadly', b);
		A(d && d.uid === 'charcoal-aaaa1' && d.from === 8 && d.floor === 9 && d.style === 'tactics', 'the dive is kept on this device', d);
		// floor 9 cleared: on to the exit; nothing banked yet
		await win(); await t.key('KeyZ', 600);
		let r = await result(), col = await t.col(); d = await dive();
		A(!r.hidden && /Charcoal Stick · floor 9 cleared!/.test(r.text) && /Kept when you clear the exit on floor 10/.test(r.text) && /Next: floor 10/.test(r.next), 'floor 9 cleared: the result says nothing is kept until the exit; Z goes on to floor 10', r);
		A(col.gear['charcoal-aaaa1'].lv === 8 && !col.gems && d.floor === 10, 'the item is still level 8, no gemstone is in the collection yet; the dive stands on floor 10', [col.gear, col.gems, d]);
		await t.key('KeyZ', 900);
		b = await battle();
		A(b.name === 'Charcoal Stick · floor 10 · Exit' && b.boss && b.foes.includes(26), 'floor 10 is the exit: a boss at level 26', b);
		// the exit cleared: the dive is banked
		await win(); await t.key('KeyZ', 600);
		r = await result(); col = await t.col(); d = await dive();
		A(/Exit!/.test(r.text) && /Charcoal Stick is now level 10 \(was 8\)/.test(r.text) && /Brought out: .*Plush .* Lv \d+.*1 Stitching Kit/.test(r.text) && !r.next, 'the exit cleared: the Charcoal Stick is level 10, and the result lists what came out (a gemstone, a Stitching Kit)', r);
		A(col.gear['charcoal-aaaa1'].lv === 10 && Object.keys(col.gems || {}).length >= 1 && Object.values(col.items).filter((x) => x === 'stitchingkit').length === 1 && d === null, 'banked in the collection: level 10, the gemstones, the kit; the dive is over', [col.gear, col.gems, col.items, d]);
		const gemsNow = Object.keys(col.gems).length;
		await t.key('KeyZ', 700);
		// a lost floor ends the dive with nothing banked
		await t.tap(/Item World/);
		A(await has(/Charcoal Stick ?Lv 10 ?to floor 20/), 'back in the Item World the item is level 10, its next dive to floor 20', await t.labels());
		await t.tap(/Charcoal Stick/); await t.tap(/Battles/); await t.tap(/Sortie/, 900);
		A((await battle()).name === 'Charcoal Stick · floor 11', 'the next dive starts on floor 11');
		await win(); await t.key('KeyZ', 600); await t.key('KeyZ', 900);
		A((await battle()).name === 'Charcoal Stick · floor 12' && (await dive()).floor === 12, 'floor 11 cleared: on floor 12');
		await win('lost'); await t.key('KeyZ', 600);
		r = await result(); col = await t.col();
		A(/The dive into the Charcoal Stick ends on floor 12\. Nothing was banked/.test(r.text) && /as it was \(level 10\)/.test(r.text) && !/Next|Try again/.test(r.next), 'a lost floor: the dive ends, nothing is banked, and there is no "Try again"', r);
		A(col.gear['charcoal-aaaa1'].lv === 10 && Object.keys(col.gems).length === gemsNow && (await dive()) === null, 'the item is still level 10; floor 11\'s finds stayed inside');
		await t.key('KeyZ', 700);
		// giving a floor up: the dive waits; one dive at a time; the item cannot be put on meanwhile; abandoning keeps nothing
		await t.tap(/Item World/); await t.tap(/Charcoal Stick/); await t.tap(/Battles/); await t.tap(/Sortie/, 900);
		await t.key('Enter', 250);
		{ const m = await t.menu(), i = m.findIndex((x) => /^Give up/.test(x.label)); for (let k = 0; k < 12 && !/Give up/.test(await t.E(() => { const P = window.__poketactica.P; return P.menu ? P.menu.items[P.menu.i].label : ''; })); k++) await t.key('ArrowDown', 60); A(i >= 0, 'the field menu has Give up'); }
		await t.key('KeyZ', 250); await t.key('ArrowUp', 80); await t.key('KeyZ', 500);
		A(await t.screen() === 'home' && await has(/Item World ?diving: Charcoal Stick · floor 11/) && (await dive()).floor === 11, 'Give up on a floor: back to camp, the dive waits on that floor', await t.labels());
		A(await has(/Continue.*Item World · Charcoal Stick · floor 11/), 'and the Continue row of the camp goes back into it', await t.labels());
		await t.tap(/Item World ?diving/);
		A(await has(/Continue: Charcoal Stick ?floor 11 of 20/) && await has(/Abandon this dive/), 'the Item World offers to continue it, or to abandon it', await t.labels());
		const before = JSON.stringify(await dive());
		await t.tap(/Leftover Clay/);
		A(await t.screen() === 'itemworld' && JSON.stringify(await dive()) === before, 'one dive at a time: another item cannot be entered meanwhile');
		await t.key('KeyX', 300); await t.tap(/Squad/); await t.tap(/Charmander/); await t.tap(/No held item/); await t.tap(/Charcoal Stick/);
		col = await t.col();
		A(await t.screen() === 'held' && !col.figs['char-a'].held && col.items['charcoal-aaaa1'], 'the item being dived into cannot be put on a figurine meanwhile');
		await t.key('KeyX', 300); await t.key('KeyX', 300); await t.key('KeyX', 300);
		await t.tap(/Item World ?diving/); await t.tap(/Abandon this dive/);
		A(await t.screen() === 'iw-drop' && /Keep diving/.test(await t.focus()), 'Abandon asks first, with Keep diving under the cursor', await t.focus());
		await t.tap(/Abandon it/);
		col = await t.col();
		A((await dive()) === null && await t.screen() === 'itemworld' && col.gear['charcoal-aaaa1'].lv === 10 && !(await has(/Continue:/)), 'abandoned: no dive, the item as it was');
		A(!t.errors || !t.errors.length, 'no page errors (the Item World)', t.errors);
		await t.ctx.close();
	}
	// ---------- the Item World's comfort features in the camp (improvement plan, 2026-11-25): kits in the shop, join all,
	// the slots in one go, and a dive into an item a figurine is holding
	{
		const items = { 'charcoal-aaaa1': 'charcoal', 'stitchingkit-dddd4': 'stitchingkit', 'stitchingkit-dddd5': 'stitchingkit', 'stitchingkit-dddd6': 'stitchingkit' };
		const more = { gear: { 'charcoal-aaaa1': { lv: 31, gems: [] } }, gems: { 'gem-g1g1': 'atk:10', 'gem-g2g2': 'atk:15', 'gem-g3g3': 'spe:4', 'gem-g4g4': 'atk:2', 'gem-g5g5': 'atk:1' } };
		const t = await open({ width: 1280, height: 760 }, COL({ items, more, charHeld: 'choicescarf' }), { magepunk_stars_v1: WALLET(1200) });
		const has = async (re) => (await t.labels()).some((l) => re.test(l.replace(/\s+/g, ' ')));
		const loose = (c) => Object.values(c.gems || {}).sort().join();
		// the shop sells Stitching Kits
		await t.zTo(/Shop/);
		await t.key('KeyE', 250); await t.key('KeyE', 250);
		A(await has(/Rare Polish/) && await has(/Stitching Kit ?own 3 ?500 ★/), 'the Shop\'s "Polish & kits" tab sells a Stitching Kit for 500 stars', await t.labels());
		await t.zTo(/Stitching Kit/);
		let col = await t.col();
		A(count(col, 'stitchingkit') === 4 && await t.wallet() === 700, 'bought: a fourth kit, 500 stars spent', [count(col, 'stitchingkit'), await t.wallet()]);
		await t.zTo(/Stitching Kit/); await t.zTo(/Stitching Kit/);
		A(count(await t.col(), 'stitchingkit') === 5 && await t.wallet() === 200, 'a second; a third is refused with 200 stars left');
		await t.key('KeyX', 300);
		// join all the Plush Rubies
		await t.tap(/Items & gemstones/); await t.zTo(/Combine gemstones/);
		A(await t.screen() === 'combine' && await has(/Join all: Plush Ruby ?4 → Lv 28 · 3 kits/) && !(await has(/Join all: Plush Topaz/)), 'Combine: "Join all: Plush Ruby" says what it makes and what it takes (the lone Topaz has no row)', await t.labels());
		await t.zTo(/Join all: Plush Ruby/);
		col = await t.col();
		A(loose(col) === 'atk:28,spe:4' && count(col, 'stitchingkit') === 2 && await t.screen() === 'combine' && !(await has(/Join all/)), 'one press: a level 28 Plush Ruby, three kits used, nothing left to join', [loose(col), count(col, 'stitchingkit')]);
		await t.key('KeyX', 300);
		// an item's slots in one go
		await t.tap(/Charcoal Stick ?Lv 31/);
		A(await has(/Fill the free slots ?2 of your strongest loose gemstones/) && await has(/Take them all out ?nothing is in it/), 'an item\'s screen: Fill the free slots, Take them all out', await t.labels());
		await t.zTo(/Fill the free slots/);
		col = await t.col();
		A(col.gear['charcoal-aaaa1'].gems.join() === 'atk:28,spe:4' && !Object.keys(col.gems || {}).length && /Fill the free slots/.test(await t.focus()), 'Fill: both loose gemstones are in, the strongest first, and the row keeps the focus', col.gear);
		await t.zTo(/Take them all out/);
		col = await t.col();
		A(!col.gear['charcoal-aaaa1'].gems.length && col.gear['charcoal-aaaa1'].lv === 31 && loose(col) === 'atk:28,spe:4', 'Take them all out: both are loose again', [col.gear, col.gems]);
		await t.key('KeyX', 300); await t.key('KeyX', 300);
		// a dive into the item the Charmander holds
		await t.tap(/Item World/);
		A(await t.screen() === 'itemworld' && await has(/Choice Bandana ?held by Charmander ?to floor 10/) && /from your bag or off a figurine/.test(await t.E(() => document.querySelector('#hub .ph-sub').textContent)), 'the Item World lists the item a figurine is holding too', await t.labels());
		await t.zTo(/Choice Bandana ?held by Charmander/);
		A(await t.screen() === 'iw-style' && (await t.col()).figs['char-a'].held === 'choicescarf', 'how to dive: the item is still on the Charmander');
		await t.zTo(/Battles/);
		col = await t.col();
		const off = Object.keys(col.items).find((k) => col.items[k] === 'choicescarf');
		A(await t.screen() === 'team' && !col.figs['char-a'].held && !!off, 'Battles: it comes off into the bag for the dive', [col.figs['char-a'].held, Object.keys(col.items)]);
		// backed out before the dive started: back on it goes
		await t.key('KeyX', 400);
		col = await t.col();
		A(await t.screen() === 'itemworld' && col.figs['char-a'].held === 'choicescarf' && !Object.values(col.items).includes('choicescarf'), 'backed out before starting: it is back on the Charmander', [await t.screen(), col.figs['char-a'].held]);
		A(!t.errors || !t.errors.length, 'no page errors (the Item World\'s comfort features)', t.errors);
		await t.ctx.close();
	}
	// ---------- SQUAD TOOLS in the camp (improvement plan, 2026-11-25): sort, show, favourites, release
	{
		const base = JSON.parse(COL({ charHeld: 'charcoal' }));
		base.figs['eevee-d'] = { ...base.figs['eevee-c'], id: 'eevee-d', level: 8, exp: exp(8) };
		const t = await open({ width: 1280, height: 760 }, JSON.stringify(base));
		const cards = () => t.E(() => [...document.querySelectorAll('#hub .ph-card')].map((c) => c.querySelector('.ph-card-name').textContent.trim() + ' ' + c.querySelector('.ph-card-lv').textContent.trim() + (c.querySelector('.ph-badge') ? ' [' + c.querySelector('.ph-badge').textContent.trim() + ']' : '')));
		const count = () => t.E(() => document.getElementById('squad-count').textContent.trim());
		await t.tap(/Squad/);
		let ls = await t.labels(), cs = await cards();
		A(await t.screen() === 'squad' && /^Sort ?Level/.test(ls[0]) && /^Show ?All · 4 of 4/.test(ls[1]) && cs.map((c) => c.replace(/ \[.*/, '')).join() === 'Charmander Lv 30,Machamp Lv 25,Eevee Lv 12,Eevee Lv 8' && await count() === '4', 'the Squad: Sort and Show above the figurines; by level to begin with', [ls.slice(0, 2), cs]);
		A(/Charmander/.test(await t.focus()), 'the focus starts on the first figurine, not on the tools');
		// sort
		await t.tap(/^Sort/);
		A(/^Sort ?Name/.test((await t.labels())[0]) && (await cards()).map((c) => c.split(' ')[0]).join() === 'Charmander,Eevee,Eevee,Machamp' && /^Sort/.test(await t.focus()), 'Sort: by name (and the tool keeps the focus)', await cards());
		await t.tap(/^Sort/);
		A(/^Sort ?Type/.test((await t.labels())[0]) && (await cards()).map((c) => c.split(' ')[0]).join() === 'Machamp,Charmander,Eevee,Eevee', 'by type: Fighting, Fire, Normal', await cards());
		await t.tap(/^Sort/); await t.tap(/^Sort/);
		A(/^Sort ?Level/.test((await t.labels())[0]) && await t.E(() => JSON.parse(localStorage.getItem('magepunk_poketactica_squadview_v1')).sort) === 'level', 'newest, then round to level again; this device remembers the sort');
		// show (Q / E from anywhere, or the tool)
		await t.key('KeyE', 250);
		A(/^Show ?Your team/.test((await t.labels())[1]), 'E: your team', (await t.labels())[1]);
		await t.key('KeyE', 250);
		A(/^Show ?Favourites · 0 of 4/.test((await t.labels())[1]) && !(await cards()).length && /No figurine fits "Favourites"/.test(await t.E(() => document.querySelector('#hub .ph-grid').textContent)) && await count() === '0 of 4', 'E again: favourites, and there are none yet (said)');
		await t.key('KeyE', 250); await t.key('KeyE', 250);
		A(/^Show ?Holding an item · 1 of 4/.test((await t.labels())[1]) && (await cards()).map((c) => c.split(' [')[0]).join() === 'Charmander Lv 30', 'holding an item: the Charmander', await cards());
		await t.key('KeyE', 250);
		A(/^Show ?Duplicates · 2 of 4/.test((await t.labels())[1]) && (await cards()).map((c) => c.split(' ')[0]).join() === 'Eevee,Eevee', 'duplicates: the two Eevee', await cards());
		// a favourite: C on a card
		await t.tap(/^Eevee ?Lv 12|Eevee.*Lv 12/); await t.key('KeyX', 300);
		A(await t.screen() === 'squad' && /Eevee/.test(await t.focus()), '(into its screen and back: the Squad again, on that Eevee)', await t.focus());
		await t.key('KeyC', 300);
		let col = await t.col();
		A(col.figs['eevee-c'].fav === true && (await cards())[0] === 'Eevee Lv 12 [♥]' && /Eevee/.test(await t.focus()), 'C: the Lv 12 Eevee is a favourite (a heart on its card)', [col.figs['eevee-c'], await cards()]);
		// release: the favourite is refused, the other is asked about and goes
		await t.key('KeyZ', 300);
		A(await t.screen() === 'moves' && (await t.labels()).some((l) => /^♥ ?Favourite/.test(l)) && (await t.labels()).some((l) => /^Release/.test(l)), 'its screen: Favourite and Release among its tools', (await t.labels()).slice(0, 6));
		await t.tap(/^Release/);
		A(await t.screen() === 'moves' && (await t.col()).figs['eevee-c'], 'Release is shut for a favourite');
		await t.key('KeyX', 300);
		await t.tap(/Eevee.*Lv 8/); await t.tap(/^Release/);
		A(await t.screen() === 'release' && /Release Eevee\?/.test(await t.E(() => document.querySelector('#hub h2').textContent)) && /leaves your collection for good/.test(await t.E(() => document.getElementById('hub').textContent)) && /^Keep it/.test(await t.focus()), 'Release asks first, says it is for good, and the focus is on "Keep it"', await t.labels());
		await t.key('KeyZ', 300);
		A(await t.screen() === 'moves' && (await t.col()).figs['eevee-d'], '"Keep it": nothing happens');
		await t.tap(/^Release/); await t.tap(/^Release Eevee/);
		col = await t.col();
		A(await t.screen() === 'squad' && !col.figs['eevee-d'] && col.gone.includes('eevee-d') && !col.fallen && Object.keys(col.figs).length === 3, 'released: gone for good, and not to the memorial', [Object.keys(col.figs), col.gone]);
		A(/^Show ?Duplicates · 0 of 3/.test((await t.labels())[1]), 'the Squad says so: no duplicates left', (await t.labels())[1]);
		// one that holds an item: the item comes back
		await t.key('KeyQ', 250);
		await t.tap(/Charmander/); await t.tap(/^Release/);
		A(/Its Charcoal Stick comes back to your bag/.test(await t.E(() => document.getElementById('hub').textContent)), 'a figurine holding an item: the question says the item comes back');
		await t.tap(/^Release Charmander/);
		col = await t.col();
		A(!col.figs['char-a'] && Object.values(col.items || {}).includes('charcoal'), 'and it does', [Object.keys(col.figs), col.items]);
		A(!t.errors || !t.errors.length, 'no page errors (squad tools)', t.errors);
		await t.ctx.close();
	}
	// ---------- the PULL CORD in the camp (owner, 2026-11-24: "Escape Rope style item definitely"): sold in the Shop, and used
	// from the Item World's "Abandon this dive" to leave a battle dive with the floors cleared
	{
		const items = { 'charcoal-aaaa1': 'charcoal', 'pullcord-pppp1': 'pullcord' };
		const more = { gear: { 'charcoal-aaaa1': { lv: 12, gems: [] } } };
		const dive = { v: 1, uid: 'charcoal-aaaa1', id: 'charcoal', from: 12, floor: 16, seed: 'iwcordtest', style: 'tactics', found: [{ k: 'gem', gem: 'atk:4' }] };
		const t = await open({ width: 1280, height: 760 }, COL({ items, more }), { magepunk_stars_v1: WALLET(450), magepunk_poketactica_itemworld_v1: JSON.stringify(dive) });
		const has = async (re) => (await t.labels()).some((l) => re.test(l.replace(/\s+/g, ' ')));
		await t.zTo(/Shop/);
		await t.key('KeyE', 250); await t.key('KeyE', 250);
		A(await has(/Pull Cord ?own 1 ?200 ★/) && await has(/Stitching Kit ?500 ★/), 'the Shop sells a Pull Cord for 200 stars, beside the Stitching Kit', await t.labels());
		await t.zTo(/Pull Cord/);
		A(count(await t.col(), 'pullcord') === 2 && await t.wallet() === 250, 'bought: a second Pull Cord');
		await t.key('KeyX', 300);
		await t.tap(/Item World/);
		A(await t.screen() === 'itemworld' && await has(/Continue: Charcoal Stick ?floor 16 of 20/) && await has(/Abandon this dive/), 'the Item World: the dive in progress, on floor 16 of 20', await t.labels());
		await t.tap(/Abandon this dive/);
		A(await t.screen() === 'iw-drop' && await has(/^Use a Pull Cord ?keep the 3 floors cleared · you have 2/) && /^Keep diving/.test(await t.focus()), 'Abandon the dive? Keep diving (focused), Use a Pull Cord, or Abandon it', await t.labels());
		await t.tap(/^Use a Pull Cord/);
		const col = await t.col();
		A(await t.screen() === 'itemworld' && col.gear['charcoal-aaaa1'].lv === 15 && Object.values(col.gems || {}).join() === 'atk:4' && count(col, 'pullcord') === 1 && await t.E(() => localStorage.getItem('magepunk_poketactica_itemworld_v1')) === null, 'the cord pulled: the Charcoal Stick is level 15, the gemstone is out, one cord used, the dive over', [col.gear, col.gems, count(col, 'pullcord')]);
		A(await has(/Charcoal Stick ?Lv 15/) && !(await has(/Continue:/)), 'and the Item World lists it at its new level, ready for another dive', await t.labels());
		{ const rec = await t.E(() => (document.getElementById('iw-records') || {}).textContent || ''); A(/Records/.test(rec) && /highest: Charcoal Stick Lv 15/.test(rec) && /14 levels raised in all/.test(rec) && /strongest gemstone: Plush Ruby Lv 4/.test(rec), 'the Item World shows your records: the highest item, levels raised in all, the strongest gemstone', rec); }
		// a dive with nothing cleared: the cord is offered but shut
		await t.E(() => localStorage.setItem('magepunk_poketactica_itemworld_v1', JSON.stringify({ v: 1, uid: 'charcoal-aaaa1', id: 'charcoal', from: 15, floor: 16, seed: 'iwcordtest2', style: 'tactics', found: [] })));
		await t.key('KeyX', 300); await t.tap(/Item World/); await t.tap(/Abandon this dive/);
		await t.tap(/^Use a Pull Cord/);
		A(await t.screen() === 'iw-drop' && count(await t.col(), 'pullcord') === 1 && (await t.col()).gear['charcoal-aaaa1'].lv === 15 && await has(/^Use a Pull Cord ?keep the 0 floors cleared/), 'no floor cleared yet: the cord is shut, and none is used', await t.labels());
		// in a dive's battle: the field menu's Give up offers the cord too
		{
			await t.E(() => { const T = window.__poketactica; T.hub.close(); T.start({ kind: 'item', dive: { v: 1, uid: 'charcoal-aaaa1', id: 'charcoal', from: 15, floor: 17, seed: 'iwcordtest3', style: 'tactics', found: [{ k: 'gem', gem: 'spe:6' }] } }, [T.P.col.figs['char-a'], T.P.col.figs['mach-b']]); });
			await sleep(800);
			A(await t.E(() => window.__poketactica.P.screen === 'battle' && !!window.__poketactica.P.dive && window.__poketactica.P.dive.floor === 17), 'a battle on floor 17 of the dive');
			await t.key('Enter', 400);
			const clickMenu = (re) => t.E((src) => { const b = [...document.querySelectorAll('#menu-items .bal-btn')].find((x) => new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim())); if (b) b.click(); return !!b; }, re.source);
			await clickMenu(/^Give up/); await sleep(300);
			const rows = await t.E(() => [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
			A(rows.some((x) => /^Use a Pull Cord leave now: keep the 1 floor cleared · you have 1/.test(x)) && rows.some((x) => /^Keep playing/.test(x)), 'Give up: keep playing, give up, or use a Pull Cord (1 floor cleared)', rows);
			await clickMenu(/^Use a Pull Cord/); await sleep(700);
			const c2 = await t.col();
			A(await t.E(() => window.__poketactica.P.screen === 'camp' && !window.__poketactica.P.dive) && c2.gear['charcoal-aaaa1'].lv === 16 && Object.values(c2.gems || {}).sort().join() === 'atk:4,spe:6' && !count(c2, 'pullcord') && await t.E(() => localStorage.getItem('magepunk_poketactica_itemworld_v1')) === null, 'pulled out of the battle: level 16, the gemstone out, the last cord used, back in the camp', [c2.gear, c2.gems, count(c2, 'pullcord')]);
		}
		A(!t.errors || !t.errors.length, 'no page errors (the Pull Cord)', t.errors);
		await t.ctx.close();
	}
	// ---------- a phone: nothing in a list row runs into its neighbour (owner's screenshot, 2026-11-24: on Tower Defense's two-way
	// screen "Road" ran straight into "enemies walk a fixed road" once the row also carried its "best: wave" badge)
	{
		const items = { 'charcoal-aaaa1': 'charcoal', 'weaknesspolicy-bbbb2': 'weaknesspolicy', 'leftovers-cccc3': 'leftovers', 'stitchingkit-dddd4': 'stitchingkit' };
		const more = { td: { 'td-loop': 6, 'mz-field': 12 }, gear: { 'charcoal-aaaa1': { lv: 100, gems: ['atk:100', 'spe:40'] }, 'weaknesspolicy-bbbb2': { lv: 31, gems: [] } }, gems: { 'gem-g1g1': 'atk:10', 'gem-g2g2': 'atk:10', 'gem-g3g3': 'spe:4' } };
		const t = await open({ width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, COL({ items, more, charHeld: 'choicescarf' }), { magepunk_stars_v1: WALLET(500) });
		/** every list row: its parts in the order they are written, none overlapping another on its line, none past the row's edge */
		const rowsOk = () => t.E(() => {
			const bad = [];
			for (const row of document.querySelectorAll('#hub .ph-row')) {
				const R = row.getBoundingClientRect(), kids = [...row.children].filter((k) => k.getBoundingClientRect().width > 0 || k.scrollWidth > 0).map((k) => ({ r: k.getBoundingClientRect(), t: k.textContent.trim().slice(0, 24), sw: k.scrollWidth, cw: k.clientWidth }));
				if (R.right > innerWidth + 1 || R.left < -1) bad.push('row past the screen: ' + row.textContent.trim().slice(0, 30));
				for (const k of kids) { if (k.r.right > R.right + 1 || k.r.left < R.left - 1) bad.push('past its row: ' + k.t); if (k.sw > k.cw + 1) bad.push('text spills out of its box: ' + k.t); }
				for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].r, b = kids[j].r; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push('overlap: "' + kids[i].t + '" and "' + kids[j].t + '"'); }
			}
			return { rows: document.querySelectorAll('#hub .ph-row').length, bad };
		});
		const check = async (what) => { const r = await rowsOk(); A(r.rows > 0 && !r.bad.length, what + ': no part of a row runs into another (' + r.rows + ' rows)', r.bad.slice(0, 4)); };
		await t.tap(/Tower Defense/);
		A(await t.screen() === 'td-modes' && (await t.labels()).some((l) => /Road/.test(l) && /best: wave 6/.test(l)), 'Tower Defense\'s two ways, the Road with its best wave', await t.labels());
		await check('Tower Defense: Road / Maze Builder');
		const gap = await t.E(() => { const row = [...document.querySelectorAll('#hub .ph-row')].find((r) => /Road/.test(r.textContent)), ne = row.querySelector('.ph-row-name'), n = ne.getBoundingClientRect(), s = row.querySelector('small').getBoundingClientRect(); return { gap: Math.round(s.left - (n.left + Math.max(n.width, ne.scrollWidth))), below: s.top >= n.bottom - 1 }; });
		A(gap.below || gap.gap >= 8, '"Road" stands clear of "enemies walk a fixed road": a gap beside it, or the line under it', gap);
		await t.key('KeyX', 300);
		await t.tap(/Shop/); await check('the Shop\'s held items');
		await t.key('KeyE', 250); await t.key('KeyE', 250); await t.key('KeyE', 250); await t.key('KeyE', 250); await check('the Shop\'s gemstones');
		await t.key('KeyX', 300);
		await t.tap(/Items & gemstones/); await check('Items & gemstones (a level 100 item, one held by a figurine)');
		await t.tap(/Charcoal Stick/); await check('an item\'s slots');
		await t.key('KeyX', 300); await t.key('KeyX', 300);
		await t.tap(/Item World/); await check('the Item World');
		A(!t.errors || !t.errors.length, 'no page errors (a phone\'s rows)', t.errors);
		await t.ctx.close();
	}
} catch (e) { fail++; console.log('FAIL: crashed ' + (e && e.stack || e)); } finally { await browser.close(); server.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
