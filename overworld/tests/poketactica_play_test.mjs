// poketactica_play_test.mjs — Poketactica's playability batch 2 on the real page (owner, 2026-11-21: "All plus show exp
// gain/leveling up for each unit after combat. Outside of battle I need to be able to switch moves from total learned
// moves into the 4 active move slots"):
//   - the moves screen: four slots filled from every learned move (slot then move, move then slot, swaps, C / ✕ empties,
//     never the last), from Squad and from the team screen (C), by keys and by touch; older saves get the moves they passed
//   - the forecast while aiming (hit %, damage range, KO), the enemy range (a foe under the cursor; the 👁 toggle)
//   - a queued attack taken back, the Execute list reordered (through the menus)
//   - a battle saved on this device and resumed after a reload; giving up drops it
//   - the enemy phase: a press speeds it up, a summary after it, the move effects and the shake
//   - the first map's tutorial, step by step (and Skip)
//   - the results: each figurine's EXP bar, LEVEL UP, the moves it learned with a "Set moves" button; arrows + Z on them
// Needs headless Chrome/Edge + overworld/data + micasurvivor/assets.
//   node overworld/tests/poketactica_play_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8947;
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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

const pool = (ids) => ids.map((id) => ({ id, lv: 1, xp: 0 }));
// a level-30 Charmander whose pool has more than four moves; two level-25 helpers. c1-1 cleared (no tutorial) unless asked.
const COL = (o = {}) => JSON.stringify({ v: 1, starters: true, cleared: o.cleared ?? ['c1-1'], figs: {
	'char-a': { v: 1, id: 'char-a', species: 'charmander', level: 30, exp: Math.floor(0.8 * 30 ** 3), ability: null, shiny: false, pool: pool(o.charPool || ['scratch', 'growl', 'ember', 'smokescreen', 'dragonbreath', 'firefang']), equipped: o.charEq || ['scratch', 'growl', 'ember', 'smokescreen'] },
	'mach-b': { v: 1, id: 'mach-b', species: 'machamp', level: 25, exp: Math.floor(0.8 * 25 ** 3), ability: null, shiny: false, pool: pool(['karatechop', 'lowkick', 'leer']), equipped: ['karatechop', 'lowkick'] },
	'pika-c': { v: 1, id: 'pika-c', species: 'pikachu', level: 25, exp: Math.floor(0.8 * 25 ** 3), ability: null, shiny: false, pool: pool(['thundershock', 'quickattack', 'growl']), equipped: ['thundershock', 'quickattack'] },
} });
async function open(vp, figs, extra = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.evaluateOnNewDocument((figs, extra) => {
		try {
			localStorage.setItem('micatro_sfx', '0');
			if (figs && !sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); }
		} catch { /* ignore */ }
	}, figs, extra);
	const go = async () => {
		await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
		await sleep(700);
	};
	await go();
	const t = { ctx, page, errors, reload: go };
	t.key = async (k, ms = 150) => { await page.keyboard.press(k); await sleep(ms); };
	t.idle = () => page.evaluate(() => new Promise((r) => { const s = Date.now(); const k = () => (!window.__poketactica.P.busy || Date.now() - s > 30000 ? r() : setTimeout(k, 60)); k(); }));
	t.E = (fn, ...a) => page.evaluate(fn, ...a);
	t.figs = () => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs);
	t.menu = () => page.evaluate(() => { const P = window.__poketactica.P; return P.menu ? P.menu.items.map((i) => i.label.replace(/<[^>]+>/g, '').trim()) : null; });
	/** the command window's item starting with `label`: focus it with the arrows, then Z */
	t.pick = async (label) => {
		const items = await t.menu(); const i = items ? items.findIndex((l) => l.startsWith(label)) : -1;
		if (i < 0) throw new Error('no menu item ' + label + ' in ' + JSON.stringify(items));
		const cur = await page.evaluate(() => window.__poketactica.P.menu.i);
		for (let k = cur; k < i; k++) await t.key('ArrowDown', 60);
		for (let k = cur; k > i; k--) await t.key('ArrowUp', 60);
		await t.key('KeyZ', 250);
	};
	return t;
}
const hubScreen = (p) => p.evaluate(() => window.__poketactica.P.screen === 'camp' && window.__poketactica.hub.H.screen);
const focusLabel = (p) => p.evaluate(() => window.__poketactica.hub.focusLabel());
const centre = (p, sel, i = 0) => p.evaluate((s, i) => { const el = document.querySelectorAll(s)[i]; if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel, i);
/** (in a battle) walk our unit `uid` next to a foe with real Move actions (ending turns until one is in reach: the foes come
 *  closer), so the battle's recipe stays exact (resume re-runs it); -> the foe's tile */
async function walkToFoe(t, uid) {
	for (let turn = 0; turn < 6; turn++) {
		const r = await t.E((uid) => {
			const T = window.__poketactica, P = T.P, S = P.S, B = T.B, u = B.unit(S, uid);
			const H = (x, y) => S.map.height[y * S.map.w + x];
			const next = (x, y) => { for (const e of B.onMap(S, 'e')) if (Math.abs(e.x - x) + Math.abs(e.y - y) === 1 && Math.abs((H(x, y) || 0) - (H(e.x, e.y) || 0)) <= 1) return e; return null; };
			const here = next(u.x, u.y); if (here) return [here.x, here.y];
			if (u.moved || u.acted) return 'end';
			for (const tl of B.moveTiles(S, u).values()) { const e = next(tl.x, tl.y); if (e && T.act({ t: 'move', uid, x: tl.x, y: tl.y }).ok) return [e.x, e.y]; }
			return 'end';
		}, uid);
		await t.idle();
		if (Array.isArray(r)) { await t.E(() => { const T = window.__poketactica; T.cursorTo(T.P.cursor.x, T.P.cursor.y); }); return r; }
		await t.E(() => window.__poketactica.act({ t: 'end' })); await t.idle();
	}
	return null;
}
/** (in a battle) put our unit `uid` on a free tile next to a foe, facing it, as if it had walked there; -> the foe's tile */
const nextToFoe = (t, uid) => t.E((uid) => {
	const T = window.__poketactica, P = T.P, S = P.S, B = T.B, u = B.unit(S, uid);
	for (const e of B.onMap(S, 'e')) for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
		const x = e.x + dx, y = e.y + dy;
		if (x < 0 || y < 0 || x >= S.map.w || y >= S.map.h || S.map.height[y * S.map.w + x] == null || B.unitAt(S, x, y) || (S.symbols || []).some((g) => g.x === x && g.y === y)) continue;
		if (Math.abs((S.map.height[y * S.map.w + x] || 0) - (S.map.height[e.y * S.map.w + e.x] || 0)) > 1) continue;
		u.x = x; u.y = y; u.moved = true; u.origin = null; T.cursorTo(x, y); return [e.x, e.y, e.uid];
	}
	return null;
}, uid);

try {
	// ---------- older saves: the moves a figurine has passed join its pool (a backup of the old copy first)
	{
		const t = await open({ width: 1280, height: 760 }, COL({ charPool: ['scratch', 'growl'], charEq: ['scratch', 'growl'] }));
		const f = (await t.figs())['char-a'];
		const bak = await t.E(() => localStorage.getItem('magepunk_poketactica_figs_v1_bak_learn1'));
		A(f.pool.length > 4 && f.pool.some((p) => p.id === 'ember') && f.pool[0].id === 'scratch' && JSON.stringify(f.equipped) === '["scratch","growl"]', 'an older save: the moves its figurines passed join their pools (the equipped ones kept)', f.pool.map((p) => p.id));
		A(bak && JSON.parse(bak).figs['char-a'].pool.length === 2, 'the save as it was is kept as a backup first (_bak_learn1)');
		await t.reload();
		A(await t.E(() => JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1_bak_learn1')).figs['char-a'].pool.length) === 2, 'the backup is never overwritten by a later load');
		A(t.errors.length === 0, 'no page errors (older save)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ---------- the moves screen: four slots, from every learned move (keyboard)
	{
		const t = await open({ width: 1280, height: 760 }, COL());
		const p = t.page;
		const eq = async () => (await t.figs())['char-a'].equipped;
		// Squad -> Charmander (the strongest: first) -> its moves
		const home = await t.E(() => window.__poketactica.hub.labels());
		for (let i = 0; i < home.findIndex((l) => /Squad/.test(l)); i++) await t.key('ArrowDown', 80);
		await t.key('KeyZ', 250); await t.key('KeyZ', 300);
		A(await hubScreen(p) === 'moves' && /Charmander/.test(await t.E(() => document.querySelector('#hub h2').textContent)), 'Squad → Z on a figurine: its moves');
		const slots = await t.E(() => [...document.querySelectorAll('#hub .ph-slot')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
		A(slots.length === 4 && /Scratch/.test(slots[0]) && /Smokescreen/.test(slots[3]), 'four slots, in order, with the equipped moves', slots);
		A(/Slot 1|1/.test(await focusLabel(p)) && /Scratch/.test(await focusLabel(p)), 'the focus starts on slot 1');
		A(await t.E(() => /Learned · (\d+)/.test(document.getElementById('hub').textContent) && +/Learned · (\d+)/.exec(document.getElementById('hub').textContent)[1] === JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs['char-a'].pool.length && /Still to learn/.test(document.getElementById('hub').textContent) && [...document.querySelectorAll('#hub .ph-row.is-disabled')].length > 0), 'then every learned move, then the ones still to come (locked)');
		// slot, then move: Z on slot 1, Z on a move not in a slot -> it goes into slot 1
		await t.key('KeyZ', 250);
		A(/Choose a move for slot 1/.test(await t.E(() => document.getElementById('ph-movesay').textContent)) && /Dragon Breath/.test(await focusLabel(p)), 'Z on slot 1: "choose a move for slot 1", the focus on the first free move', await focusLabel(p));
		await t.key('KeyZ', 300);
		let e = await eq();
		A(e[0] === 'dragonbreath' && e.length === 4 && e.slice(1).join() === 'growl,ember,smokescreen', 'Z on it: Dragon Breath goes into slot 1 (Scratch back in the list)', e);
		// move, then slot: four are full, so Z on a free move asks for the slot; → to slot 2, Z
		const rows = await t.E(() => window.__poketactica.hub.labels());
		const fang = rows.findIndex((l) => /Fire Fang/.test(l));
		await t.E((i) => { const el = document.querySelector(`#hub [data-nav="${i}"]`); el.click(); }, fang);   // (focus + press: a click, as a mouse)
		await sleep(250);
		A(/Choose the slot for Fire Fang/.test(await t.E(() => document.getElementById('ph-movesay').textContent)) && /^1/.test(await focusLabel(p)), 'all four full: Z on Fire Fang asks which slot (the focus on slot 1)', await focusLabel(p));
		await t.key('ArrowRight', 120); await t.key('KeyZ', 300);
		e = await eq();
		A(e[1] === 'firefang' && e[0] === 'dragonbreath' && e.length === 4, '→ to slot 2, Z: Fire Fang replaces Growl there', e);
		// a move already in a slot swaps places: slot 4, then Ember (in slot 3)
		await t.key('ArrowDown', 120); await t.key('ArrowRight', 120);
		A(/^4/.test(await focusLabel(p)), 'the arrows walk the slots (a 2 x 2 grid)', await focusLabel(p));
		await t.key('KeyZ', 250);
		const emb = (await t.E(() => window.__poketactica.hub.labels())).findIndex((l) => /Ember/.test(l) && /slot 3/.test(l));
		await t.E((i) => document.querySelector(`#hub [data-nav="${i}"]`).click(), emb); await sleep(300);
		e = await eq();
		A(e[3] === 'ember' && e[2] === 'smokescreen', 'slot 4, then Ember (in slot 3): they swap places', e);
		// X cancels a half-made choice; C empties the focused slot; the last move can't be taken off
		await t.key('KeyZ', 200); await t.key('KeyX', 250);
		A(await hubScreen(p) === 'moves' && /Choose a slot/.test(await t.E(() => document.getElementById('ph-movesay').textContent)), 'X cancels a half-made choice (still on the moves screen)');
		await t.key('KeyC', 300);
		e = await eq();
		A(e.length === 3, 'C empties the focused slot', e);
		await t.key('KeyC', 250); await t.key('KeyC', 250);
		e = await eq();
		A(e.length === 1, 'C again, twice: one move left', e);
		await t.key('KeyC', 250);
		A((await eq()).length === 1, "the last move can't be taken off");
		// a free slot takes a learned move at once
		const sc = (await t.E(() => window.__poketactica.hub.labels())).findIndex((l) => /Scratch/.test(l) && !/slot/.test(l));
		await t.E((i) => document.querySelector(`#hub [data-nav="${i}"]`).click(), sc); await sleep(300);
		e = await eq();
		A(e.length === 2 && e[1] === 'scratch', 'with a free slot, Z on a learned move puts it there at once', e);
		await t.key('KeyX', 250);
		A(await hubScreen(p) === 'squad', 'X goes back to Squad');
		await t.key('KeyX', 250);
		// the team screen: C on a card opens its moves; X comes back to the team
		await t.E(() => { const h = window.__poketactica.hub, i = h.labels().findIndex((l) => /Training/.test(l)); document.querySelector('#hub [data-nav="' + i + '"]').click(); }); await sleep(250);
		A(await hubScreen(p) === 'team', 'Training → the team screen');
		await t.key('ArrowDown', 120); await t.key('KeyC', 300);
		A(await hubScreen(p) === 'moves', 'the team screen: C on a figurine opens its moves');
		await t.key('KeyX', 250);
		A(await hubScreen(p) === 'team', '... and X comes back to the team screen');
		A(t.errors.length === 0, 'no page errors (moves screen)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- the moves screen by touch: tap a slot, tap a move; the ✕ empties a slot
	{
		const t = await open({ width: 390, height: 844, isMobile: true, hasTouch: true }, COL());
		const p = t.page, tap = async (xy, ms = 400) => { await p.touchscreen.tap(xy[0], xy[1]); await sleep(ms); };
		await tap(await centre(p, '#hub [data-nav]', (await t.E(() => window.__poketactica.hub.labels())).findIndex((l) => /Squad/.test(l))));
		await tap(await centre(p, '#hub .ph-card', 0));
		A(await hubScreen(p) === 'moves', 'touch: Squad → a figurine → its moves');
		A(await t.E(() => { const r = document.querySelector('#hub .ph-slots').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), 'touch: the four slots are on screen (portrait)');
		await tap(await centre(p, '#hub .ph-slot', 2));
		const db = (await t.E(() => window.__poketactica.hub.labels())).findIndex((l) => /Dragon Breath/.test(l));
		await p.evaluate((i) => document.querySelector(`#hub [data-nav="${i}"]`).scrollIntoView({ block: 'center' }), db); await sleep(150);
		await tap(await centre(p, `#hub [data-nav="${db}"]`));
		A((await t.figs())['char-a'].equipped[2] === 'dragonbreath', 'touch: tap slot 3, tap Dragon Breath: it goes into slot 3', (await t.figs())['char-a'].equipped);
		await p.evaluate(() => document.querySelector('#hub .ph-slots').scrollIntoView({ block: 'center' })); await sleep(150);
		await tap(await centre(p, '#hub .ph-slot-x', 0));
		A((await t.figs())['char-a'].equipped.length === 3, 'touch: the ✕ on a slot empties it', (await t.figs())['char-a'].equipped);
		A(t.errors.length === 0, 'no page errors (moves by touch)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ---------- a battle: the forecast, the enemy range, cancel, the Execute list, the save and resume
	{
		const t = await open({ width: 1280, height: 760 }, COL());
		const p = t.page;
		await t.key('KeyZ', 900);   // Continue: Combo Field (c1-2)
		A(await t.E(() => window.__poketactica.P.screen === 'battle' && document.getElementById('coach').hidden), 'Continue plays the next map (no tutorial: the first map is cleared)');
		await t.E(() => { const T = window.__poketactica; T.act({ t: 'deploy', uid: 'p0' }); }); await t.idle();
		await t.E(() => { const T = window.__poketactica; T.act({ t: 'move', uid: 'p0', x: T.P.S.map.base.x + (T.P.S.map.base.x > 0 ? -1 : 1), y: T.P.S.map.base.y }); }); await t.idle();
		await t.E(() => { const T = window.__poketactica; T.act({ t: 'deploy', uid: 'p1' }); }); await t.idle();
		// the enemy range: the cursor on a foe shows where it can go and strike
		const foe = await t.E(() => { const T = window.__poketactica, e = T.B.onMap(T.P.S, 'e')[0]; T.cursorTo(e.x, e.y); return { uid: e.uid, emove: (T.P.hl.emove || []).length, eatk: (T.P.hl.eatk || []).length, want: T.B.threat(T.P.S, e, T.P.data).attack.length }; });
		A(foe.emove > 0 && foe.eatk === foe.want && foe.want > 0, 'the cursor on a foe: its move range and every tile it can strike (engine threat())', foe);
		await t.E(() => { const T = window.__poketactica, P = T.P; T.cursorTo(P.S.map.base.x, P.S.map.base.y); });
		A(await t.E(() => !(window.__poketactica.P.hl.eatk || []).length), 'off the foe, its range goes');
		await t.E(() => document.getElementById('b-danger').click()); await sleep(150);
		const dz = await t.E(() => { const T = window.__poketactica, P = T.P; return { on: P.dangerOn, pressed: document.getElementById('b-danger').getAttribute('aria-pressed'), n: (P.danger || []).length }; });
		A(dz.on && dz.pressed === 'true' && dz.n > 0, 'the 👁 button: every foe\'s reach, shown until pressed again', dz);
		await t.key('Enter', 200);
		A((await t.menu()).some((l) => /^Enemy range\s*on/.test(l)), 'the field menu has Enemy range (on) too, for keys and pads', await t.menu());
		await t.pick('Enemy range');
		A(await t.E(() => !window.__poketactica.P.dangerOn), 'Enemy range in the field menu turns it off');
		await t.key('KeyX', 200);
		// the forecast: p0 next to a foe, Attack, a move: the box shows the hit chance and the damage
		const at = await walkToFoe(t, 'p0');
		await t.E(() => { const T = window.__poketactica, u = T.B.unit(T.P.S, 'p0'); T.cursorTo(u.x, u.y); });
		A(!!at, 'p0 stands next to a foe', at);
		await t.key('KeyZ', 250); await t.pick('Attack'); await t.key('KeyZ', 250);
		await t.E((a) => window.__poketactica.cursorTo(a[0], a[1]), at);
		const fc = await t.E((a) => { const T = window.__poketactica, P = T.P, el = document.getElementById('fc'); const f = T.B.forecast(P.S, T.B.unit(P.S, 'p0'), P.aimMove, a[0], a[1], P.data); const r = el.getBoundingClientRect(); return { shown: !el.hidden, text: el.textContent.replace(/\s+/g, ' '), f, mode: P.mode, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; }, at);
		const t0 = fc.f && fc.f.targets[0];
		A(fc.mode === 'aim' && fc.shown && fc.inView && t0 && fc.text.includes(t0.hit + '%') && fc.text.includes(t0.min === t0.max ? String(t0.min) : t0.min + '–' + t0.max), 'aiming at a foe: the forecast box shows its hit chance and damage range (the engine\'s numbers)', fc);
		await t.key('KeyZ', 250);
		A(await t.E(() => document.getElementById('fc').hidden && window.__poketactica.P.S.queue.length === 1), 'Z queues the attack; the forecast goes');
		// cancel it from the unit's commands: PP back
		const pp0 = await t.E(() => { const u = window.__poketactica.B.unit(window.__poketactica.P.S, 'p0'); return u.pp[u.fig.equipped[0]]; });
		await t.E(() => { const T = window.__poketactica, u = T.B.unit(T.P.S, 'p0'); T.cursorTo(u.x, u.y); });
		await t.key('KeyZ', 250);
		A((await t.menu()).some((l) => l.startsWith('Cancel attack')), "a unit that has queued: its commands offer Cancel attack", await t.menu());
		await t.pick('Cancel attack');
		const cx = await t.E(() => { const T = window.__poketactica, u = T.B.unit(T.P.S, 'p0'); return { q: T.P.S.queue.length, acted: u.acted, pp: u.pp[u.fig.equipped[0]] }; });
		A(cx.q === 0 && !cx.acted && cx.pp === pp0 + 1, 'Cancel attack: the queue empties, its PP comes back, it can act again', cx);
		// the Execute list: two queued, reordered from the field menu
		await t.key('KeyX', 200);
		await t.E(() => { const T = window.__poketactica, P = T.P, S = P.S, B = T.B; const u0 = B.unit(S, 'p0'), u1 = B.unit(S, 'p1');
			const fo = B.onMap(S, 'e'); const aimAt = (u) => { for (const mid of u.fig.equipped) { const m = B.moveOf(u, mid, P.data); if (!m) continue; for (const [x, y] of B.aimTiles(S, u, m)) if (B.unitAt(S, x, y) && B.unitAt(S, x, y).side === 'e') return { mid, x, y }; } return null; };
			const a0 = aimAt(u0); if (a0) T.act({ t: 'attack', uid: 'p0', move: a0.mid, x: a0.x, y: a0.y });
			return a0; });
		await t.idle();   // (an action is refused while the last one still plays)
		await walkToFoe(t, 'p1');
		const two = await t.E(() => { const T = window.__poketactica, P = T.P, S = P.S, B = T.B, u1 = B.unit(S, 'p1');
			for (const mid of u1.fig.equipped) { const m = B.moveOf(u1, mid, P.data); if (!m) continue; for (const [x, y] of B.aimTiles(S, u1, m)) { const v = B.unitAt(S, x, y); if (v && v.side === 'e' && T.act({ t: 'attack', uid: 'p1', move: mid, x, y }).ok) return S.queue.map((q) => q.uid); } }
			return S.queue.map((q) => q.uid); });
		A(two.length === 2 && two[0] === 'p0', 'two attacks queued (p0 first)', two);
		await t.idle();
		await t.E(() => { const T = window.__poketactica; T.cursorTo(T.P.S.map.base.x, T.P.S.map.base.y); });
		await t.key('Enter', 200);
		A((await t.menu())[1] && (await t.menu())[1].startsWith('Execute list'), 'the field menu: Execute list, under Execute', await t.menu());
		await t.pick('Execute list');
		A((await t.menu()).length === 2 && /^1\./.test((await t.menu())[0]), 'the Execute list: the queued attacks, numbered in order', await t.menu());
		await t.key('ArrowDown', 100); await t.key('KeyZ', 200);
		await t.pick('Earlier');
		A((await t.E(() => window.__poketactica.P.S.queue.map((q) => q.uid))).join() === 'p1,p0' && /^1\./.test((await t.menu())[0]), 'Earlier: the second attack now runs first', await t.E(() => window.__poketactica.P.S.queue.map((q) => q.uid)));
		await t.key('KeyX', 200); await t.key('KeyX', 200);
		// the save: reload mid-battle -> the camp offers Resume -> the same board
		const before = await t.E(() => { const T = window.__poketactica; return { view: JSON.stringify(T.B.view(T.P.S)), n: T.P.actions.length, saved: !!localStorage.getItem('magepunk_poketactica_battle_v1') }; });
		const turnNow = await t.E(() => window.__poketactica.P.S.turn);
		A(before.saved, 'the battle in progress is saved on this device after every action');
		A(await t.E(() => window.mpLeaveGuard().state) === 'safe', 'leaving is safe: it is saved (no "it won\'t count" prompt)');
		await t.reload();
		const home = await t.E(() => window.__poketactica.hub.labels());
		A(await hubScreen(p) === 'home' && new RegExp('Resume battle.*Combo Field.*Turn ' + turnNow).test(home[0]) && /Resume/.test(await focusLabel(p)), 'after a reload the camp offers Resume battle (the map, the turn), focused', home[0]);
		await t.key('KeyZ', 900);
		const after = await t.E(() => { const T = window.__poketactica; return { view: JSON.stringify(T.B.view(T.P.S)), n: T.P.actions.length, screen: T.P.screen }; });
		A(after.screen === 'battle' && after.view === before.view && after.n === before.n, 'Resume: the same board, every action kept (the queue in its order too)', [before.n, after.n]);
		// the enemy phase: a press speeds it up; a summary after it; the move effects and the shake
		await t.E(() => { window.__fxSeen = 0; window.__shake = 0; const P = window.__poketactica.P; const push = P.fx.push.bind(P.fx); P.fx.push = (...a) => { window.__fxSeen += a.length; return push(...a); }; const k = () => { window.__shake = Math.max(window.__shake, P.shake); requestAnimationFrame(k); }; k(); });
		const turn0 = await t.E(() => window.__poketactica.P.S.turn);
		await t.key('Enter', 200); await t.pick('End turn');
		const busy = await t.E(() => window.__poketactica.P.busy);
		await t.key('KeyZ', 80);
		const skip = await t.E(() => window.__poketactica.P.skip);
		await t.idle(); await sleep(200);
		const end = await t.E(() => ({ turn: window.__poketactica.P.S.turn, log: !document.getElementById('log').hidden, text: document.getElementById('log').textContent, fx: window.__fxSeen, shake: window.__shake, skip: window.__poketactica.P.skip }));
		A(busy && skip && !end.skip, 'while it plays, Z speeds the rest up (and the speed-up ends with it)', [busy, skip, end.skip]);
		A(end.turn === turn0 + 1 && end.log && /Enemy phase/.test(end.text) && end.text.length > 20, 'after the enemy phase: its summary, in words', end.text.slice(0, 200));
		A(end.fx >= 2 && end.shake > 0.05, 'attacks draw their move effects, and hits shake the board', end);
		await t.key('KeyX', 200);
		A(await t.E(() => document.getElementById('log').hidden), 'X closes the summary');
		await t.key('Enter', 200); await t.pick('Battle log');
		A(await t.E(() => !document.getElementById('log').hidden && /Battle log/.test(document.getElementById('log').textContent) && document.querySelectorAll('#log li').length >= 3), 'the field menu\'s Battle log: what happened so far');
		await t.key('KeyX', 200);
		// fast enemy phases: the setting is kept
		await t.key('Enter', 200); await t.pick('Enemy phase');
		A(await t.E(() => window.__poketactica.P.fast && localStorage.getItem('magepunk_poketactica_fast_v1') === '1'), 'Enemy phase: fast (kept on this device)');
		await t.key('KeyX', 200);
		// give up: the save goes
		await t.key('Enter', 200); await t.pick('Give up'); await t.pick('Give up');
		A(await hubScreen(p) === 'home' && await t.E(() => !localStorage.getItem('magepunk_poketactica_battle_v1') && !/Resume/.test(window.__poketactica.hub.labels()[0])), 'Give up: back to camp, nothing to resume');
		A(t.errors.length === 0, 'no page errors (battle)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ---------- the results: each figurine's EXP, LEVEL UP, new moves with "Set moves"
	{
		const t = await open({ width: 1280, height: 760 }, COL());
		const p = t.page;
		await t.key('KeyZ', 900);
		await t.E(() => { const T = window.__poketactica; T.act({ t: 'deploy', uid: 'p0' }); }); await t.idle();
		const lv0 = (await t.figs())['char-a'].level;
		// won, with EXP owed to Charmander (p0) and some move XP for its first move; Machamp (p1) earned nothing
		await t.E(() => { const T = window.__poketactica, S = T.P.S; S.over = 'won'; S.phase = 'won'; S.exp = { p0: 30000 }; S.xp = { ['p0:' + T.B.unit(S, 'p0').fig.equipped[0]]: 400 }; T.cursorTo(S.map.base.x, S.map.base.y); });
		await sleep(600);
		const r = await t.E(() => ({ shown: !document.getElementById('result').hidden, rows: [...document.querySelectorAll('#result .pt-ru')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), bars: [...document.querySelectorAll('#result .pt-ru-bar .bal-bar-fill')].map((e) => e.dataset.to), set: document.querySelectorAll('#result .pt-setmoves').length, focus: (document.querySelector('#result .is-focus') || {}).textContent }));
		A(r.shown && r.rows.length === 3, 'the results: a row for each figurine that went in (3)', r.rows);
		const ch = r.rows.find((x) => /Charmander/.test(x)), mc = r.rows.find((x) => /Machamp/.test(x));
		A(ch && new RegExp('Lv ' + lv0 + ' → \\d+').test(ch) && /LEVEL UP!/.test(ch) && /\+\d+ EXP/.test(ch), 'Charmander: Lv before → after, LEVEL UP!, the EXP it gained', ch);
		A(mc && /no EXP/.test(mc) && !/LEVEL UP/.test(mc), 'Machamp: no EXP, no level up', mc);
		A(r.bars.length === 3 && r.bars.every((b) => +b >= 0 && +b <= 100), 'each row has its EXP bar (where it ends, 0-100%)', r.bars);
		A(/New move/.test(ch) && r.set === 1, 'a figurine that learned a move: "New move: …" and a Set moves button', ch);
		A(/Next/.test(r.focus || ''), 'the focus starts on Next (Z plays on)', r.focus);
		await sleep(1400);
		A(await t.E(() => { const el = document.querySelector('#result .pt-ru-up .pt-ru-bar .bal-bar-fill'); return el && Math.abs(parseFloat(el.style.width) - parseFloat(el.dataset.to)) < 0.5; }), 'the levelled bar fills to the top, then round again to where it ends');
		// the arrows reach Set moves; Z opens Charmander's move slots; X goes to the camp
		await t.key('ArrowUp', 150);
		A(/Set moves/.test(await t.E(() => document.querySelector('#result .is-focus').textContent)), '↑ moves the focus to Set moves');
		await t.key('KeyZ', 400);
		A(await hubScreen(p) === 'moves' && /Charmander/.test(await t.E(() => document.querySelector('#hub h2').textContent)), "Z on Set moves: Charmander's move slots");
		await t.key('KeyX', 300);
		A(await hubScreen(p) === 'home', 'X from there goes to the camp');
		A(t.errors.length === 0, 'no page errors (results)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}

	// ---------- the first map's tutorial: one step at a time; Skip
	{
		const t = await open({ width: 1280, height: 760 }, COL({ cleared: [] }));
		await t.key('KeyZ', 900);
		const step = () => t.E(() => ({ shown: !document.getElementById('coach').hidden, n: document.getElementById('coach-n').textContent, text: document.getElementById('coach-text').textContent }));
		let c = await step();
		A(c.shown && c.n === '1 / 5' && /base/.test(c.text), 'First Steps: the tutorial, step 1 / 5 (deploy)', c);
		await t.E(() => window.__poketactica.act({ t: 'deploy', uid: 'p0' })); await t.idle();
		c = await step(); A(c.n === '2 / 5' && /Move/.test(c.text), 'deployed: step 2 (move)', c);
		await nextToFoe(t, 'p0');
		await t.E(() => window.__poketactica.cursorTo(window.__poketactica.P.cursor.x, window.__poketactica.P.cursor.y));
		c = await step(); A(c.n === '3 / 5' && /Attack/.test(c.text), 'moved: step 3 (attack, with the forecast)', c);
		await t.E(() => { const T = window.__poketactica, P = T.P, S = P.S, B = T.B, u = B.unit(S, 'p0'); for (const mid of u.fig.equipped) { const m = B.moveOf(u, mid, P.data); if (!m) continue; for (const [x, y] of B.aimTiles(S, u, m)) { const v = B.unitAt(S, x, y); if (v && v.side === 'e') { T.act({ t: 'attack', uid: 'p0', move: mid, x, y }); return; } } } });
		await t.idle(); await sleep(100);
		c = await step(); A(c.n === '4 / 5' && /Execute/.test(c.text), 'queued: step 4 (Execute)', c);
		await t.idle(); await t.key('KeyV', 300); await t.idle();
		c = await step(); A(c.n === '5 / 5' && /End turn/.test(c.text), 'executed: step 5 (End turn)', c);
		await t.E(() => window.__poketactica.act({ t: 'end' })); await t.idle(); await sleep(150);
		c = await step(); A(c.shown && c.n === '✓' && await t.E(() => localStorage.getItem('magepunk_poketactica_coach_v1') === 'done'), 'a whole turn: the tutorial says well done, and is not shown again', c);
		await t.ctx.close();
		const t2 = await open({ width: 1280, height: 760 }, COL({ cleared: [] }));
		await t2.key('KeyZ', 900);
		await t2.E(() => document.getElementById('coach-skip').click()); await sleep(200);
		A(await t2.E(() => document.getElementById('coach').hidden && localStorage.getItem('magepunk_poketactica_coach_v1') === 'done' && !document.getElementById('tip').hidden), 'Skip: the tutorial goes (for good), the map tip shows instead');
		A(t.errors.length === 0 && t2.errors.length === 0, 'no page errors (tutorial)', [...t.errors, ...t2.errors].slice(0, 3).join(' | '));
		await t2.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
