// poketactica_maze_page_test.mjs — Tower Defense, MAZE BUILDER on the page, stage 4 (owner, 2026-11-24;
// Plans/POKETACTICA_MAZE_BUILDER_PLAN.md): the Road / Maze Builder choice in the hub; the bar (gold, the way's length,
// the hand of block cards); choosing a card, turning it, the ghost and its TWO-STEP drop (put it, then lay it); taking a
// block back; a figurine on a block for gold; calling the wave; the reward pick. By keyboard, controller and touch, on
// a desktop and a phone.
//   node overworld/tests/poketactica_maze_page_test.mjs [--shots=<dir>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8973;
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').split('=')[1] || null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const mk = (sp, lv, moves) => ({ v: 1, id: sp + '-tdp', species: sp, level: lv, exp: 0, ability: null, shiny: false, pool: moves.map((id) => ({ id, lv: 1, xp: 0 })), equipped: moves });
const FIGS = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries([mk('pikachu', 40, ['thunderbolt', 'quickattack']), mk('charizard', 40, ['flamethrower', 'protect']), mk('machamp', 40, ['karatechop']), mk('blastoise', 40, ['surf'])].map((f) => [f.id, f])) });
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument((figs) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_tdcoach_v1', 'done'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* */ }
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
			window.__owFakePads = [pad]; window.__pad = pad;
		}, FIGS);
		await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now(); while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
		await sleep(500);
		const t = { page, errors };
		t.key = async (k, ms = 200) => { await page.keyboard.press(k); await sleep(ms); };
		t.pad = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(160); };
		t.E = (fn, ...a) => page.evaluate(fn, ...a);
		// (rev 15: the SMALL maps, which these checks were written on and old runs still play on; the big ones are checked at the end)
		t.start = (map, seed, rev = 15) => t.E((map, seed, rev) => { const T = window.__poketactica; T.hub.close(); return T.td.open(map, ['pikachu-tdp', 'charizard-tdp', 'machamp-tdp', 'blastoise-tdp'].map((id) => T.P.col.figs[id]), { seed, ...(rev ? { rev } : {}) }); }, map, seed, rev);
		t.v = () => t.E(() => { const T = window.__poketactica, v = T.td.view(); return { tick: v.tick, wave: v.wave, phase: v.phase, lives: v.lives, energy: v.energy, slots: v.slots, towers: v.towers.map((x) => ({ uid: x.uid, sp: x.species, x: x.x, y: x.y, rule: x.rule, off: x.off })), enemies: v.enemies.length, kills: v.kills, over: v.over, paused: T.td.T.paused, speed: T.td.T.speed, menu: !!T.P.menu, screen: T.P.screen, cursor: { ...T.P.cursor } }; });
		t.menu = () => t.E(() => ({ title: document.getElementById('menu-title').textContent, items: [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), hidden: document.getElementById('menu').hidden }));
		t.menuTo = async (re) => { for (let i = 0; i < 20; i++) { const f = await t.E(() => { const b = document.querySelector('#menu-items .is-focus'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : ''; }); if (re.test(f)) { await t.key('KeyZ', 300); return true; } await t.key('ArrowDown', 70); } return false; };
		t.shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
		return t;
	};


	const mz = (t) => t.E(() => { const T = window.__poketactica, v = T.td.view(), X = T.td.T; return { mode: v.mode, gold: v.gold, hand: v.hand.map((c) => c.id), blocks: v.blocks.map((b) => ({ id: b.id, cells: b.cells, locked: b.locked })), way: v.ways.map((p) => p.length - 1), pick: v.pick ? v.pick.pick : 0, card: X.card, turns: X.turns, pin: X.pin, phase: v.phase, wave: v.wave, cleared: v.cleared, towers: v.towers.length, lives: v.lives, over: v.over, cursor: T.P.cursor, extra: (T.P.hl.extra || []).length }; });
	const bar = (t) => t.E(() => ({ gold: (document.getElementById('td-gold') || {}).textContent || '', way: (document.getElementById('td-way') || {}).textContent || '', energy: !!document.getElementById('td-energy'), cards: document.querySelectorAll('#td-hand .pt-mz-card').length, on: document.querySelectorAll('#td-hand .pt-mz-card[aria-pressed="true"]').length, text: (document.getElementById('pt-td').textContent + ' ' + ((document.getElementById('td-hand') || {}).textContent || '')).replace(/\s+/g, ' '), tray: (() => { const el = document.getElementById('td-hand'); if (!el || el.hidden) return null; const c = [...el.querySelectorAll('.pt-mz-card, .pt-mz-pile')].map((x) => x.getBoundingClientRect()); if (!c.length) return null; return { top: Math.round(Math.min(...c.map((x) => x.top))), bottom: Math.round(Math.max(...c.map((x) => x.bottom))), left: Math.round(Math.min(...c.map((x) => x.left))), right: Math.round(Math.max(...c.map((x) => x.right))), cardW: Math.round(el.querySelector('.pt-mz-card') ? el.querySelector('.pt-mz-card').offsetWidth : 0), vw: innerWidth, vh: innerHeight, pile: !!el.querySelector('.pt-mz-pile') }; })(), hint: document.getElementById('hint').textContent.replace(/\s+/g, ' ') }));
	const cur = (t, x, y) => t.E((x, y) => { const T = window.__poketactica; T.P.cursor = { x, y }; T.td.T.pin = null; }, x, y);
	// a spot where any shape may lie whichever way it is turned: clear of the gate, the base, the rocks and the board's edge
	const SPOT = [5, 0];

	// ---------- the hub: Road or Maze Builder
	{
		const t = await open({ width: 1280, height: 800 });
		const hub = () => t.E(() => ({ title: (document.querySelector('.ph-head .bal-h2') || {}).textContent || '', rows: [...document.querySelectorAll('.ph-list .ph-row')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()) }));
		const click = (re) => t.E((src) => { const re = new RegExp(src); const b = [...document.querySelectorAll('.bal-btn')].find((x) => re.test(x.textContent)); if (b) b.click(); return !!b; }, re.source);
		A(await click(/Tower Defense/), 'the hub has Tower Defense'); await sleep(400);
		let h = await hub();
		A(h.rows.length === 2 && /Road/.test(h.rows[0]) && /Maze Builder/.test(h.rows[1]), 'Tower Defense asks: Road or Maze Builder', h);
		await t.key('ArrowDown'); await t.key('KeyZ', 500);
		h = await hub();
		A(h.title === 'Maze Builder' && h.rows.length === 6 && /Open Field/.test(h.rows[0]) && /Pincer.*2 gates/.test(h.rows[1]) && /Drowned Crossing.*A flooded middle/.test(h.rows[3]) && /Twin Keeps.*Two bases/.test(h.rows[4]) && /Wandering Gate.*A moving gate/.test(h.rows[5]), 'Maze Builder lists its six maps, the new ones with their rule', h);
		// SCREENS THAT READ AT A GLANCE (Plans/POKETACTICA_MODES_PLAN.md A1/A2): a map's detail is labelled facts, then its one tip
		{
			const facts = () => t.E(() => ({ head: (document.querySelector('#hub .ph-detail h3') || {}).textContent, labels: [...document.querySelectorAll('#td-facts .ph-fact small')].map((x) => x.textContent), values: [...document.querySelectorAll('#td-facts .ph-fact b')].map((x) => x.textContent), paras: document.querySelectorAll('#hub .ph-detail p').length, sub: document.querySelector('#hub .ph-sub').textContent.replace(/\s+/g, ' ').trim(),
				tags: [...document.querySelectorAll('#hub .ph-list .ph-row')].every((r) => { const g = r.querySelector('.ph-row-tags'); return !!g && g.children.length >= 1; }) }));
			let f = await facts();
			A(f.head === 'Open Field' && f.labels.join('|') === 'Board|Gates|Bases|Best' && f.values.join('|') === '24 × 18|1|1|not played' && f.paras === 1 && f.tags, 'a map is four facts (board, gates, bases, best wave) and one tip; each row\'s badges are one group', f);
			A(f.sub.length < 80 && /safe/.test(f.sub), 'one short line under the title', f.sub);
			for (let i = 0; i < 4; i++) await t.key('ArrowDown', 120);
			f = await facts();
			A(f.head === 'Twin Keeps' && f.values[1] === '1' && f.values[2] === '2', 'Twin Keeps: one gate, two bases, said as facts', f);
			await t.key('ArrowDown', 120);
			f = await facts();
			A(f.head === 'Wandering Gate' && f.labels[1] === 'Gates, one a wave' && f.values[1] === '3', 'Wandering Gate: three gates, one a wave', f);
			for (let i = 0; i < 5; i++) await t.key('ArrowUp', 120);
		}
		// a map, then the HERO (owner, 2026-11-24): Brock free, the others locked until their wave is cleared
		await t.key('KeyZ', 500);
		h = await hub();
		A(h.title === 'Hero' && h.rows.length === 5 && /Brock/.test(h.rows[0]) && !/wave/.test(h.rows[0]) && /Misty.*wave 10/.test(h.rows[1]) && /Lance.*wave 25/.test(h.rows[4]), 'after the map: the five heroes, Brock open, the others locked by wave', h);
		const side = () => t.E(() => (document.querySelector('.ph-detail') || {}).textContent.replace(/\s+/g, ' ') || '');
		A(/Pewter City Gym Leader/.test(await side()) && /Rock Solid/.test(await side()) && /12 block cards/.test(await side()) && /3 × O/.test(await side()) && !!(await t.E(() => { const p = document.querySelector('.ph-detail .pt-hero-pic'); return p && p.tagName === 'IMG' && p.dataset.hero === 'brock' && /^data:image\/svg/.test(p.src) && p.naturalWidth > 0 && p.getBoundingClientRect().height >= 90 && document.querySelectorAll('.ph-row .pt-hero-pic').length === 5; })), 'a hero\'s panel: who they are, their passive, their deck, their portrait (drawn in code, large); each row has one', await side());
		await t.key('ArrowDown', 200);
		A(/Cascade/.test(await side()) && /Opens when you clear wave 10/.test(await side()), 'a locked hero can be read about, and says what opens them', await side());
		await t.key('KeyZ', 400);
		A((await hub()).title === 'Hero', 'but not picked');
		await t.E(() => { const k = 'magepunk_poketactica_figs_v1', c = JSON.parse(localStorage.getItem(k)); c.td = { ...(c.td || {}), 'mz-lake': 10 }; localStorage.setItem(k, JSON.stringify(c)); const T = window.__poketactica; T.P.col.td = c.td; });
		await t.key('KeyX', 400); await t.key('KeyZ', 500);
		h = await hub();
		A(!/wave 10/.test(h.rows[1]) && /Lt\. Surge.*wave 15/.test(h.rows[2]), 'wave 10 cleared on any Maze Builder map: Misty is open', h.rows);
		await t.key('ArrowDown', 200); await t.key('KeyZ', 500);
		A(await t.E(() => window.__poketactica.hub.H.screen === 'td-squad' && /as Misty/.test(document.querySelector('.ph-sub').textContent)), 'Z on Misty: on to the squad, "as Misty"');
		await t.key('KeyX', 400);
		A((await hub()).title === 'Hero', 'X: back to the heroes');
		await t.key('KeyX', 400); await t.key('KeyX', 400);
		A((await hub()).rows.length === 2, 'X: back to the choice');
		await t.key('ArrowUp'); await t.key('KeyZ', 500);
		h = await hub();
		A(h.title === 'Road' && h.rows.length === 3 && /Meadow Loop/.test(h.rows[0]), 'Road lists the road maps', h);
		A(!t.errors.length, 'no page errors (hub)', t.errors.slice(0, 3));
		await t.page.close();
	}

	// ---------- keyboard, then controller, desktop
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.start('mz-field', 'mazepage'), 'a run opens on Open Field');
		let v = await mz(t), b = await bar(t);
		A(v.mode === 'maze' && v.gold === 60 && v.hand.length === 5 && v.way[0] === 11 && v.phase === 'wait', 'a Maze Builder run: 60 gold, 5 cards, the way 11 steps', v);
		A(/60/.test(b.gold) && /Way 11/.test(b.way) && !b.energy && b.cards === 5 && b.on === 0 && /when you call it/.test(b.text), 'the bar: gold (no energy), the way\'s length, the hand, and no clock', b);
		A(b.tray && b.tray.pile && b.tray.top > b.tray.vh * 0.6 && b.tray.bottom <= b.tray.vh + 4 && b.tray.left >= 0 && b.tray.right <= b.tray.vw && b.tray.cardW >= 60, 'the hand is a row of cards along the bottom of the screen, the draw pile beside it', b.tray);
		A(v.extra >= 11, 'the way is drawn on the board', v.extra);
		const coach = () => t.E(() => (document.getElementById('td-coach') || {}).textContent || '');
		A(/^1.5/.test(await coach()) && /no road/i.test(await coach()), 'the first Maze Builder run on a device is coached: step 1 of 5', await coach());
		await sleep(2500);
		A((await mz(t)).phase === 'wait' && (await mz(t)).wave === 0, 'nothing starts by itself');
		// V chooses a card; the ghost follows the cursor
		await cur(t, ...SPOT);
		await t.key('KeyV');
		v = await mz(t); b = await bar(t);
		A(v.card === v.hand[0] && b.on === 1 && /Z: put it here/.test(b.hint) && /Way 11/.test(b.hint), 'V: the first card is chosen; the hint says what it would do to the way', b.hint);
		await t.key('KeyC');
		A((await mz(t)).turns === 1, 'C turns it');
		await t.key('KeyC'); await t.key('KeyC'); await t.key('KeyC');
		A((await mz(t)).turns === 0, 'four turns: as it was');
		// the two-step drop
		await t.key('KeyZ');
		v = await mz(t);
		A(v.blocks.length === 0 && v.pin && v.pin.x === SPOT[0] && /Z again: lay it/.test((await bar(t)).hint), 'Z puts the ghost: nothing is laid yet', v.pin);
		await t.key('KeyX');
		A((await mz(t)).pin === null && (await mz(t)).card, 'X lets go of the ghost (the card is still chosen)');
		await t.key('KeyZ'); await t.key('KeyZ', 500);
		v = await mz(t);
		A(v.blocks.length === 1 && v.hand.length === 4 && v.card === null && !v.blocks[0].locked, 'Z, Z: the block is laid, its card played', v);
		A(/^3.5/.test(await coach()) && /on blocks/.test(await coach()), 'the coach moves on as each thing is done: now step 3 (figurines stand on blocks)', await coach());
		// a block where it may not go: on the gate
		await t.E(() => { window.__poketactica.td.T.S.hand.push({ id: 'tOne', shape: 'one' }); });
		const choose = async (id) => { for (let i = 0; i < 14 && (await mz(t)).card !== id; i++) await t.key('KeyV', 120); };
		await cur(t, 0, 4); await choose('tOne'); await t.key('KeyZ', 400);
		v = await mz(t);
		A(v.pin === null && v.blocks.length === 1 && /gate/i.test((await bar(t)).hint), 'on the gate the ghost is red and Z does nothing', (await bar(t)).hint);
		await t.key('KeyX');
		A((await mz(t)).card === null, 'X puts the card away');
		// take it back
		const c0 = v.blocks[0].cells[0];
		await cur(t, c0[0], c0[1]); await t.key('KeyX', 500);
		v = await mz(t);
		A(v.blocks.length === 0 && v.hand.length === 6, 'X on a block laid this round takes it back', v);
		// across the way, so the way bends: a wall from the top, the first card stood wherever it fits
		await t.E(() => { const T = window.__poketactica, S = T.td.T.S; S.hand.push({ id: 'tI', shape: 'I' }, { id: 'tI2', shape: 'I' }); });
		await cur(t, 4, 1);
		await choose('tI');
		await t.key('KeyC'); await t.key('KeyZ');
		A(/Way 11 → 13/.test((await bar(t)).hint), 'the hint: Way 11 → 13', (await bar(t)).hint);
		await t.key('KeyZ', 500);
		v = await mz(t);
		A(v.blocks.length === 1 && v.way[0] === 13 && /Way 13/.test((await bar(t)).way), 'laid: the way is 13 now', v.way);
		const look = () => t.E(() => { const T = window.__poketactica; return [...new Set(Object.values(T.P.groundOver(T.P.S.map)))].sort().join(); });
		A(await look() === 'blockfree', 'a block laid this round is drawn as a block of its own, in the paler not-yet-locked look', await look());
		// a figurine on the block, for gold
		await cur(t, 4, 3); await t.key('KeyZ', 400);
		let m = await t.menu();
		A(!m.hidden && /Place here · 20/.test(m.title) && m.items.some((x) => /Pikachu/.test(x)) && m.items.some((x) => /Take this block back/.test(x)), 'Z on a block: the squad (20 gold), or take the block back', m);
		A(await t.menuTo(/Pikachu/), 'Pikachu');
		v = await mz(t);
		A(v.towers === 1 && v.gold === 40 && /40/.test((await bar(t)).gold), 'Pikachu stands on the block: 20 gold spent', v);
		await cur(t, 6, 6); await t.key('KeyZ', 400);
		A((await t.menu()).hidden && (await mz(t)).towers === 1, 'Z on bare ground places nothing');
		await t.shot('maze-build');
		// the two waves after the next one, in a line (improvement plan, 2026-11-25: a maze can be built for what is coming)
		{
			const nx = await t.E(() => ({ more: ((document.getElementById('td-next-more') || {}).textContent || '').replace(/\s+/g, ' ').trim(), next: ((document.getElementById('td-next') || {}).textContent || '').replace(/\s+/g, ' ').trim(), kinds: window.__poketactica.td.T.S.rev }));
			A(/^then 2 \d+ foes.* 3 \d+ foes/.test(nx.more) && /^Lv \d+ /.test(nx.next) && nx.kinds >= 14, 'the corner shows wave 1 in full, then waves 2 and 3 in a line', nx);
			const kindWave = await t.E(() => { const T = window.__poketactica, TDm = T.td.T, S = TDm.S; const was = S.wave; let found = null; for (let n = 3; n < 40 && !found; n++) { S.wave = n - 1; TDm.nextKey = null; document.querySelector('#td-br [data-act="pause"]').click(); document.querySelector('#td-br [data-act="pause"]').click(); const el = document.getElementById('td-next'), why = document.getElementById('td-next-why'); if (el && el.querySelector('.pt-kind') && why) found = { n, next: el.textContent.replace(/\s+/g, ' ').trim(), why: why.textContent, cls: el.querySelector('.pt-kind').className }; } S.wave = was; TDm.nextKey = null; document.querySelector('#td-br [data-act="pause"]').click(); document.querySelector('#td-br [data-act="pause"]').click(); return found; });
			A(kindWave && /(Runners|Splitters|Shielded|Healers)/.test(kindWave.next) && /^(Runner|Splitter|Shielded|Healer): /.test(kindWave.why) && /pt-kind-(runner|splitter|shield|healer)/.test(kindWave.cls), 'a wave with a kind names it, in its colour, and says what it does', kindWave);
		}

		// (buttons as site/gamepad.js maps them in the owner's layout: 1 confirm, 0 cancel, 2 the V button, 3 the C button, 9 Start)
		// ---- the controller: Y the next card, X turns, A puts and lays, B back, Start the field menu
		await cur(t, 8, 1);
		await t.pad(2);
		v = await mz(t);
		A(v.card === v.hand[0], 'pad Y: the first card');
		await t.pad(3);
		A((await mz(t)).turns === 1, 'pad X turns it');
		await t.pad(1);
		A(!!(await mz(t)).pin && (await mz(t)).blocks.length === 1, 'pad A puts the ghost');
		await t.pad(0);
		A((await mz(t)).pin === null, 'pad B lets go');
		await t.pad(1); await t.pad(1); await sleep(300);
		A((await mz(t)).blocks.length === 2, 'pad A, A lays it');
		await t.pad(9); await sleep(300);
		m = await t.menu();
		A(!m.hidden && /Building/.test(m.title) && /Call wave 1/.test(m.items[0]) && m.items.some((x) => /Draw a card/.test(x)), 'Start: the field menu, the wave first', m);
		await t.pad(1); await sleep(600);
		v = await mz(t);
		A(v.phase === 'wave' || v.wave === 1, 'A: wave 1 is called', v);
		A(v.blocks.every((b) => b.locked) && (await bar(t)).cards === 0, 'the blocks are locked, and the hand is put away for the wave');
		A(/^block\d(,block\d)*$/.test(await look()), 'and they are drawn locked, each in a stone of its own', await look());
		// through the wave, fast
		await t.E(() => { window.__poketactica.td.T.speed = 3; });
		const t0 = Date.now(); while (Date.now() - t0 < 120000) { v = await mz(t); if (v.cleared >= 1 || v.over) break; await sleep(500); }
		A(v.cleared === 1 && !v.over, 'wave 1 is cleared', v);
		await sleep(500);
		m = await t.menu(); v = await mz(t);
		A(!m.hidden && /Wave 1 cleared · pick a reward/.test(m.title) && m.items.length === 5 && /Change these rewards 10●/.test(m.items[3]) && v.pick === 1 && v.gold > 40, 'the rewards are offered (3, "change these" for 10 gold, and "decide later"), and the wave paid gold', m);
		await t.shot('maze-reward');
		await t.key('KeyX', 400);
		A((await t.menu()).hidden && /Reward/.test((await bar(t)).text), 'put off: the bar keeps a Reward button');
		await t.key('Enter', 400); await t.key('KeyZ', 500);
		m = await t.menu();
		A(/pick a reward/.test(m.title) && (await mz(t)).phase === 'wait', 'the next wave waits: calling it asks for the pick again', m);
		const cardsAt = m.items.findIndex((x) => /Two plain blocks/.test(x)), h0 = (await mz(t)).hand.length, g0 = (await mz(t)).gold;
		if (cardsAt >= 0) {
			for (let i = 0; i < cardsAt; i++) await t.key('ArrowDown', 80);
			await t.key('KeyZ', 400); A(/first block/.test((await t.menu()).title), 'two plain blocks: the first shape'); await t.key('KeyZ', 400); A(/second block/.test((await t.menu()).title), 'the second'); await t.key('KeyZ', 500);
			A((await mz(t)).hand.length === h0 + 2, 'both are in the hand');
		} else { await t.key('KeyZ', 500); v = await mz(t); A(v.hand.length === h0 + 1 || v.gold > g0 || v.lives === 20, 'the first reward is taken', v); }
		v = await mz(t);
		A(v.pick === 0 && (await t.menu()).hidden && !/Reward/.test((await bar(t)).text), 'picked: the menu closes and the button is gone');
		// ---- the field menu's new rows (improvement plan, 2026-11-25): damage tower by tower, every tower's reach, the next wave by itself
		{
			const X = (fn, ...a) => t.E(fn, ...a);
			await X(() => { localStorage.removeItem('magepunk_poketactica_tdreach_v1'); localStorage.removeItem('magepunk_poketactica_mzauto_v1'); });
			await cur(t, 6, 6); await t.key('ArrowRight', 80); await t.key('ArrowLeft', 80);   // (the helper sets the cursor without a redraw)
			{ const d = await X(() => { const T = window.__poketactica, S = T.td.T.S; return { aim: (T.P.hl.aim || []).length, cur: T.P.cursor, towers: S.towers.map((q) => [q.x, q.y]), sel: T.td.T.sel, placed: S.placed }; }); A(d.aim === 0, 'on bare ground, away from the towers: no reach is drawn', d); }
			await t.key('Enter', 400);
			m = await t.menu();
			A(m.items.some((x) => /^Next wave when you call it/.test(x)) && m.items.some((x) => /^Reach shown the tower under the cursor/.test(x)) && m.items.some((x) => /^Damage dealt/.test(x)), 'the field menu: Next wave, Reach shown, Damage dealt', m.items);
			A(await t.menuTo(/^Damage dealt/), 'Damage dealt');
			m = await t.menu();
			A(/Damage dealt · [\d,]+ in all/.test(m.title) && /^Pikachu Lv \d+ · [\d,]+ · 100%/.test(m.items[0]) && /Close/.test(m.items[m.items.length - 1]), 'the panel: each tower, what it dealt and its share', m);
			await t.key('KeyZ', 300);
			A((await t.menu()).hidden, 'Close');
			await t.key('Enter', 400); A(await t.menuTo(/^Reach shown/), 'Reach shown: switched');
			m = await t.menu();
			A(m.items.some((x) => /^Reach shown every tower at once/.test(x)) && await X(() => localStorage.getItem('magepunk_poketactica_tdreach_v1')) === '1', 'it says "every tower at once", and this device remembers', m.items);
			await t.key('KeyX', 300);
			const all = await X(() => { const T = window.__poketactica, S = T.td.T.S; return { aim: (T.P.hl.aim || []).length, cur: T.P.cursor, towers: S.towers.length }; });
			A(all.aim > 0 && all.towers === 1, 'with the cursor still on bare ground, the tower\'s reach is drawn', all);
			await t.key('Enter', 400); await t.menuTo(/^Reach shown/); await t.key('KeyX', 300);
			A(await X(() => (window.__poketactica.P.hl.aim || []).length) === 0 && await X(() => localStorage.getItem('magepunk_poketactica_tdreach_v1')) === null, 'switched back: the one under the cursor only');
		}
		// a locked block: Lift
		await cur(t, 4, 1); await t.key('KeyX', 300);
		A((await mz(t)).blocks.length === 2, 'X does not take back a locked block');
		await cur(t, 4, 2); await t.key('KeyZ', 400);
		m = await t.menu();
		A(m.items.some((x) => /Lift this block.*15/.test(x)), 'Z on it offers Lift (15 gold)', m);
		await t.key('KeyX', 300);
		// ---- the next wave by itself: off by default; on, it is called a few seconds after the last order (never over a choice)
		{
			const st = () => t.E(() => { const T = window.__poketactica, X = T.td.T, el = document.getElementById('td-auto'); return { phase: X.S.phase, wave: X.S.wave, auto: X.auto, autoT: X.autoT || 0, say: el ? el.textContent : '', paused: X.paused, menu: !!T.P.menu, card: X.card }; });
			await t.E(() => { const X = window.__poketactica.td.T; X.paused = false; X.card = null; });
			await sleep(1500);
			let s = await st();
			A(s.phase === 'wait' && s.wave === 1 && /when you call it/.test(s.say) && !s.autoT, 'off (the default): the next wave waits to be called', s);
			await t.key('Enter', 400); A(await t.menuTo(/^Next wave/), 'Next wave: switched');
			m = await t.menu();
			A(m.items.some((x) => /^Next wave by itself, 4s after your last order/.test(x)), 'it says "by itself"', m.items);
			s = await st();
			A(s.phase === 'wait' && !s.autoT, 'while a menu is open the clock does not run', s);
			await t.key('KeyX', 300);
			await sleep(1200);
			s = await st();
			A(s.phase === 'wait' && s.autoT > 0 && /^in [1-4]s$/.test(s.say), 'the menu closed: the HUD counts down', s);
			await t.key('ArrowLeft', 100);
			const moved = await st();
			A(moved.autoT < 0.3, 'moving the cursor starts the count again (you are still building)', moved);
			const t1 = Date.now(); while (Date.now() - t1 < 9000) { s = await st(); if (s.phase === 'wave') break; await sleep(250); }
			A(s.phase === 'wave' && s.wave === 2, 'and wave 2 is called by itself', s);
			await t.E(() => { localStorage.removeItem('magepunk_poketactica_mzauto_v1'); window.__poketactica.td.T.auto = false; window.__poketactica.td.T.paused = true; });
		}
		A(!t.errors.length, 'no page errors (desktop)', t.errors.slice(0, 3));
		await t.page.close();
	}

	// ---------- played as a hero
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.E(() => { const T = window.__poketactica; T.hub.close(); return T.td.open('mz-field', ['pikachu-tdp', 'charizard-tdp'].map((id) => T.P.col.figs[id]), { seed: 'heropage', hero: 'brock' }); }), 'a run opens as Brock');
		const hv = () => t.E(() => { const T = window.__poketactica, v = T.td.view(), el = document.getElementById('td-hero'); return { hero: v.hero, passives: v.passives, perks: v.perks, deck: v.deck, hand: v.hand.map((c) => c.shape), chip: el ? el.textContent.replace(/\s+/g, ' ').trim() : '', pic: el ? (() => { const p = el.querySelector('.pt-hero-pic'); return p.dataset.hero + ':' + p.tagName + ':' + (p.naturalWidth > 0) + ':' + Math.round(p.getBoundingClientRect().width); })() : '', label: T.td.recipe().label, rec: T.td.recipe().hero }; });
		let v = await hv();
		A(v.hero === 'brock' && v.passives.join() === 'rocksolid' && v.deck === 12 && /Brock ?1/.test(v.chip) && /^brock:IMG:true:4\d$/.test(v.pic), 'the HUD shows who the run is played as: Brock\'s portrait, his name, 1 passive', v);
		A(v.rec === 'brock' && /Maze Builder · Open Field · Brock/.test(v.label) && v.hand.every((sh) => ['O', 'I', 'L', 'J', 'T', 'three', 'corner'].includes(sh)), 'the hand is dealt from Brock\'s deck, and the run\'s recipe names him', v);
		await t.E(() => document.getElementById('td-hero').click()); await sleep(300);
		let m = await t.menu();
		A(!m.hidden && /Brock · Pewter City Gym Leader · a deck of 12 cards/.test(m.title) && /Rock Solid/.test(m.items[0]), 'a click on him: his passives and his deck', m);
		await t.shot('maze-hero');
		await t.key('KeyX', 300);
		// ---- a reward that changes the deck (rules 15; improvement plan, 2026-11-25): take a card out, or put a bonus on one
		{
			const dk = () => t.E(() => { const v = window.__poketactica.td.view(); return { n: v.deck, cards: v.deckCards.map((c) => c.shape + (c.bonus ? ':' + c.bonus : '')), pick: v.pick ? v.pick.opts.map((o) => (o ? o.k : null)) : null }; });
			await t.E(() => { const X = window.__poketactica.td.T; X.S.pick = { pick: 2, opts: [{ k: 'trim' }, { k: 'upgrade', bonus: 'tall' }, { k: 'gold', n: 5 }] }; X.nextKey = null; document.querySelector('#td-br [data-act="pause"]').click(); document.querySelector('#td-br [data-act="pause"]').click(); });
			await t.E(() => document.querySelector('#td-br [data-act="reward"]').click()); await sleep(300);
			m = await t.menu();
			A(!m.hidden && /^✂ Take a card out of your deck/.test(m.items[0]) && /^⬆ Tall on a card of your deck/.test(m.items[1]), 'the rewards: take a card out of your deck, or Tall on a card of your deck', m.items);
			A(await t.menuTo(/Take a card out/), 'Take a card out');
			m = await t.menu();
			A(/Take which card out\? · a deck of 12/.test(m.title) && m.items.length === 8 && /^O ?×3/.test(m.items[0]) && /^Back/.test(m.items[7]), 'the deck by kind, each with how many', m);
			await t.key('KeyZ', 400);
			let d = await dk();
			A(d.n === 11 && d.cards.filter((c) => c === 'O').length === 2 && d.pick.join() === ',upgrade,gold', 'an O block leaves the deck: eleven cards, two O blocks', d);
			m = await t.menu();
			A(!m.hidden && /pick a reward/.test(m.title), 'one reward left to take: the menu is back', m.title);
			A(await t.menuTo(/Tall on a card/), 'Tall on a card');
			m = await t.menu();
			A(/Tall on which card\? · a deck of 11/.test(m.title) && /becomes Tall/.test(m.items[0]), 'which card: each plain kind says what it becomes', m);
			await t.key('ArrowDown', 100); await t.key('KeyZ', 400);
			d = await dk();
			A(d.n === 11 && d.cards.filter((c) => /:tall$/.test(c)).length === 1 && d.pick === null && (await t.menu()).hidden, 'one card of the deck is a Tall block now, and the rewards are done', d);
			await t.E(() => document.getElementById('td-hero').click()); await sleep(300);
			m = await t.menu();
			A(/a deck of 11 cards/.test(m.title) && m.items.some((x) => /^Deck .*Tall /.test(x)), 'the hero panel lists the deck as it now is', m);
			await t.key('KeyX', 300);
		}
		// ---- a card DRAGGED onto the board: the ghost follows the pointer, and letting go lays it (improvement plan, 2026-11-25)
		{
			const hand0 = (await mz(t)).hand.length;
			const cardAt = () => t.E(() => { const b = document.querySelector('#td-hand .pt-mz-card').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, id: document.querySelector('#td-hand .pt-mz-card').dataset.id }; });
			const tileAt = (x, y) => t.E((x, y) => { const [sx, sy] = window.__poketactica.screenOf(x, y); return { x: sx, y: sy }; }, x, y);
			// a press and a small wobble is still a tap: the card is chosen, nothing is laid
			let c = await cardAt();
			await t.page.mouse.move(c.x, c.y); await t.page.mouse.down(); await t.page.mouse.move(c.x + 3, c.y - 3); await t.page.mouse.up(); await sleep(250);
			let v2 = await mz(t);
			A(v2.card === c.id && v2.blocks.length === 0, 'a press that barely moves is a tap: the card is chosen', v2);
			await t.key('KeyX', 200);
			// dragged out over the board and let go on a tile it may lie on
			let laid = null;
			for (const [x, y] of [[4, 3], [5, 4], [3, 4], [6, 3], [4, 5]]) {
				c = await cardAt(); const to = await tileAt(x, y);
				await t.page.mouse.move(c.x, c.y); await t.page.mouse.down();
				await t.page.mouse.move(c.x, c.y - 30, { steps: 3 });
				await t.page.mouse.move(to.x, to.y, { steps: 8 }); await sleep(120);
				const mid = await t.E(() => { const T = window.__poketactica; return { dragging: !!T.td.T.dragging, card: T.td.T.card, cur: T.P.cursor, ghost: (T.P.hl.extra || []).length, cls: document.body.classList.contains('pt-mzdrag') }; });
				await t.page.mouse.up(); await sleep(300);
				v2 = await mz(t);
				if (v2.blocks.length === 1) { laid = { x, y, mid, id: c.id }; break; }
			}
			A(laid && laid.mid.dragging && laid.mid.card === laid.id && laid.mid.cls && laid.mid.cur.x === laid.x && laid.mid.cur.y === laid.y, 'while it is dragged the card is chosen and the ghost is under the pointer', laid);
			A(v2.blocks.length === 1 && !v2.blocks[0].locked && v2.hand.length === hand0 - 1 && !v2.hand.includes(laid && laid.id), 'let go on the board: the block is laid, the card has left the hand', v2);
			A(await t.E(() => !document.body.classList.contains('pt-mzdrag') && !window.__poketactica.td.T.dragging), 'and the drag is over');
			// let go back over the hand: nothing is laid
			c = await cardAt();
			await t.page.mouse.move(c.x, c.y); await t.page.mouse.down(); await t.page.mouse.move(c.x, c.y - 60, { steps: 4 }); await t.page.mouse.move(c.x + 20, c.y, { steps: 4 }); await t.page.mouse.up(); await sleep(300);
			v2 = await mz(t);
			A(v2.blocks.length === 1 && v2.hand.length === hand0 - 1, 'dragged out and brought back to the hand: nothing is laid', v2);
			await t.key('KeyX', 200); await t.key('KeyX', 200);
		}
		// the boss wave's offer (put up directly: reaching wave 10 is the node test's job), picked from the field menu
		await t.E(() => { const T = window.__poketactica; T.td.T.S.perks = ['rock', 'heart', 'crane']; T.td.T.S.lives = 15; });
		await t.key('Enter', 400);
		m = await t.menu();
		A(/Pick your passive/.test(m.items[0]), 'with passives on offer the wave waits: the field menu says so', m);
		await t.key('KeyZ', 500);
		m = await t.menu();
		A(/Brock · pick a passive/.test(m.title) && m.items.length === 4 && /Rock Badge.*Rock moves hit 15% harder/.test(m.items[0]) && /Big Heart/.test(m.items[1]) && /Decide later/.test(m.items[3]), 'the three passives, each saying what it does', m);
		await t.key('ArrowDown', 100); await t.key('KeyZ', 500);
		v = await hv();
		A(v.passives.join() === 'rocksolid,heart' && v.perks === null && /Brock ?2/.test(v.chip) && (await t.menu()).hidden && await t.E(() => window.__poketactica.td.view().lives === 18 && /18/.test(document.getElementById('td-lives').textContent)), 'Big Heart is picked: 2 passives on his chip, and 3 lives at once', v);
		// ---- the HUD sits in the screen's corners; the board's middle is the board's
		const corners = () => t.E(() => { const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; }; const w = document.querySelector('#td-br [data-act="wave"]').getBoundingClientRect(), p = document.querySelector('#td-br [data-act="pause"]').getBoundingClientRect(); return { tl: r('td-tl'), tr: r('td-tr'), br: r('td-br'), vw: innerWidth, vh: innerHeight, waveH: w.height, pauseH: p.height, mid: document.elementFromPoint(innerWidth / 2, innerHeight / 2).id, inTl: ['td-hero', 'td-lives', 'td-gold'].every((id) => !!document.querySelector('#td-tl #' + id)), inTr: ['td-wave', 'td-way'].every((id) => !!document.querySelector('#td-tr #' + id)) }; });
		let c = await corners();
		A(c.tl.l < 30 && c.tl.t < 30 && c.tl.r < c.vw / 2 && c.inTl, 'top-left: the hero, the lives and the gold', c);
		A(c.tr.r > c.vw - 90 && c.tr.t < 30 && c.tr.l > c.vw / 2 && c.inTr, 'top-right: the wave and the way (left of the Games button)', c);
		A(c.br.r > c.vw - 30 && c.br.b > c.vh - 30 && c.br.l > c.vw / 2 && c.br.t > c.vh / 2 && c.waveH > c.pauseH * 1.3, 'bottom-right: the clock\'s buttons, and a big Wave! button', c);
		A(c.mid === 'c' || c.mid === 'nums', 'the HUD does not cover the board: a click in the middle lands on it', c.mid);
		// ---- what stands round the board
		const sc = await t.E(() => window.__poketactica.P.scenery);
		A(sc && sc.kind === 'woods' && sc.count > 100, 'Open Field stands in its woods (scenery round the board)', sc);
		// ---- a fight: big damage numbers, a burst on a knockout, coins to the gold counter
		A(await t.E(() => { const T = window.__poketactica; return T.td.open('mz-field', ['pikachu-tdp', 'charizard-tdp'].map((id) => T.P.col.figs[id]), { seed: 'lookpage', hero: 'brock', rev: 15 }); }), 'a new run, to fight a wave');
		const fight = async () => {
			await t.E(() => { const T = window.__poketactica, P = T.P; window.__seen = {}; clearInterval(window.__seenT); window.__seenT = setInterval(() => { for (const f of P.fx) window.__seen[f.k] = 1; for (const p of P.pops) if (p.big) { window.__seen['big' + p.big] = 1; if (p.calm) window.__seen.calm = 1; else window.__seen.lively = 1; } if (document.querySelector('#td-gold.is-bump')) window.__seen.bump = 1; }, 20); });
			const before = await t.E(() => window.__poketactica.td.T.S.cleared), menuUp = !(await t.menu()).hidden;
			if (menuUp) return { seen: [], why: 'a menu is still up', menu: await t.menu() };
			const why = await t.E(() => { const T = window.__poketactica, w = T.td.order({ t: 'call' }); T.td.T.speed = 3; T.td.T.paused = false; return w; });
			if (why) return { seen: [], why };
			await t.page.waitForFunction((before) => { const S = window.__poketactica.td.T.S; return S.over || (S.cleared > before && S.phase === 'wait' && !window.__poketactica.P.fx.length); }, { timeout: 120000, polling: 100 }, before).catch(() => {});
			await sleep(400);
			return t.E(() => ({ seen: Object.keys(window.__seen).sort(), cleared: window.__poketactica.td.T.S.cleared, over: window.__poketactica.td.T.S.over }));
		};
		A(await t.E(() => { const T = window.__poketactica, S = T.td.T.S; if (T.td.order({ t: 'block', card: S.hand[0].id, turns: 0, x: 5, y: 0 })) return false; const b = S.blocks[0]; return !T.td.order({ t: 'place', fig: 0, x: b.cells[0][0], y: b.cells[0][1] }) && !T.td.order({ t: 'place', fig: 1, x: b.cells[1][0], y: b.cells[1][1] }); }), 'a block by the way, both figurines on it');
		let fz = await fight();
		A(fz.cleared === 1 && !fz.over, 'wave 1 is cleared', fz);
		A((fz.seen.includes('big1') || fz.seen.includes('big2')) && fz.seen.includes('lively'), 'hits show big damage numbers', fz.seen);
		A(fz.seen.includes('burst'), 'a knocked-out enemy bursts', fz.seen);
		A(await t.E(() => { const T = window.__poketactica, X = T.td.T; const d = X.S.towers.map((w) => X.dealt[w.uid] || 0); return d.length === 2 && d.some((n) => n > 0); }), 'the damage each figurine dealt is counted');
		if (!(await t.menu()).hidden) await t.key('KeyX', 300);   // (the reward pick: later)
		// (the cursor is put beside a tile and walked onto it: which way an arrow goes on screen depends on the camera, so it is measured)
		const walkTo = async (x, y) => { await t.E(() => { window.__poketactica.P.cursor = { x: 6, y: 5 }; }); await t.key('ArrowRight', 200); const d = await t.E(() => { const c = window.__poketactica.P.cursor; return [c.x - 6, c.y - 5]; }); await t.E((x, y, d) => { window.__poketactica.P.cursor = { x: x - d[0], y: y - d[1] }; }, x, y, d); await t.key('ArrowRight', 250); return t.E(() => window.__poketactica.P.cursor); };
		{ const w = await t.E(() => { const T = window.__poketactica, w = T.td.T.S.towers.slice().sort((a, b) => (T.td.T.dealt[b.uid] || 0) - (T.td.T.dealt[a.uid] || 0))[0]; return [w.x, w.y]; }); await walkTo(w[0], w[1]); }
		A(/dealt [\d,]+/.test(await t.E(() => document.getElementById('hint').textContent)), 'a tower\'s line says what it has dealt', await t.E(() => document.getElementById('hint').textContent));
		A(fz.seen.includes('coins') && fz.seen.includes('bump'), 'the wave\'s gold: coins fly to the counter, and it jumps', fz.seen);
		// ---- the setting that turns them down: the field menu's Effects switch, remembered
		if ((await t.menu()).hidden === false) await t.key('KeyX', 300);   // (the reward pick: later)
		await t.E(() => { const S = window.__poketactica.td.T.S; S.pick = null; S.perks = null; });
		await t.key('Enter', 400);
		m = await t.menu();
		const fxAt = m.items.findIndex((x) => /^Effects/.test(x));
		A(fxAt > 0 && /full: big numbers and bursts/.test(m.items[fxAt]), 'the field menu has an Effects switch, on full', m.items);
		A(await t.E(() => getComputedStyle(document.getElementById('td-br')).visibility === 'hidden'), 'while a menu is up the clock buttons step aside (the menu opens over that corner)');
		for (let i = 0; i < fxAt; i++) await t.key('ArrowDown', 80);
		await t.key('KeyZ', 400);
		m = await t.menu();
		A(/calm: plain numbers, no bursts/.test(m.items[fxAt]) && await t.E(() => localStorage.getItem('magepunk_poketactica_tdfx_v1') === 'calm'), 'Z on it: calm, and remembered on this device', m.items[fxAt]);
		await t.key('KeyX', 300);
		fz = await fight();
		A(fz.cleared === 2 && fz.seen.includes('calm') && !fz.seen.includes('lively') && !fz.seen.includes('burst') && !fz.seen.includes('coins') && !fz.seen.includes('bump'), 'calm: the numbers stand still, nothing bursts, no coins fly', fz);
		await t.E(() => { clearInterval(window.__seenT); localStorage.removeItem('magepunk_poketactica_tdfx_v1'); });
		// ---- Road mode wears the same corners, and its own map's scenery
		A(await t.E(() => { const T = window.__poketactica; return T.td.open('td-ridge', ['pikachu-tdp', 'charizard-tdp'].map((id) => T.P.col.figs[id]), { seed: 'lookroad' }); }), 'a Road run');
		await sleep(300);
		const road = await t.E(() => { const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }; return { tl: r('td-tl'), tr: r('td-tr'), br: r('td-br'), vw: innerWidth, vh: innerHeight, energy: !!document.querySelector('#td-tl #td-energy'), hero: !!document.getElementById('td-hero'), sc: window.__poketactica.P.scenery }; });
		A(road.tl.l < 30 && road.tl.t < 30 && road.tr.r > road.vw - 90 && road.tr.t < 30 && road.br.r > road.vw - 30 && road.br.b > road.vh - 30 && road.energy && !road.hero, 'Road mode: the same corners (energy top-left, no hero)', road);
		A(road.sc && road.sc.kind === 'crags' && road.sc.count > 100, 'Switchback Ridge stands among its crags', road.sc);
		// ---- the owner's list of 2026-11-24
		// the wave to come is said before it comes: who, how many, their level
		const nx = await t.E(() => ({ text: (document.getElementById('td-next') || {}).textContent || '', wave: document.getElementById('td-wave').textContent, inTr: !!document.querySelector('#td-tr #td-next') }));
		A(nx.inTr && /^Lv \d+ \d+ [A-Z]/.test(nx.text) && !/BOSS/.test(nx.wave), 'top-right says who the next wave is: its level, how many of each', nx);
		await t.E(() => { const T = window.__poketactica; T.td.T.S.wave = 9; T.td.T.nextKey = null; document.querySelector('#td-br [data-act="pause"]').click(); });
		await sleep(200);
		const bx = await t.E(() => ({ text: document.getElementById('td-next').textContent, wave: document.getElementById('td-wave').textContent, red: document.getElementById('td-wave').classList.contains('bal-red') }));
		A(/Next: wave 10 · BOSS/.test(bx.wave) && bx.red && /BOSS [A-Z]/.test(bx.text), 'a boss wave is marked before it comes, and names the boss', bx);
		await t.E(() => { const T = window.__poketactica; T.td.T.S.wave = 0; T.td.T.nextKey = null; document.querySelector('#td-br [data-act="pause"]').click(); });
		// the reach a figurine WOULD have, before it is placed
		await walkTo(1, 5);
		const pre = await t.E(() => { const T = window.__poketactica; return { cur: T.P.cursor, aim: (T.P.hl.aim || []).length, hint: document.getElementById('hint').textContent, towers: T.td.T.S.towers.length }; });
		A(pre.towers === 0 && pre.aim > 0 && /place a figurine here/.test(pre.hint) && /what Pikachu would reach/.test(pre.hint), 'on a free tile the red tiles show what the next figurine would reach from there', pre);
		// the speed is remembered for the next run
		await t.E(() => document.querySelector('#td-br [data-act="speed"]').click()); await sleep(150);
		A(await t.E(() => window.__poketactica.td.T.speed === 2 && localStorage.getItem('magepunk_poketactica_tdspeed_v1') === '2'), 'the speed button: 2×, and remembered on this device');
		A(await t.E(() => { const T = window.__poketactica; return T.td.open('mz-field', ['pikachu-tdp', 'charizard-tdp'].map((id) => T.P.col.figs[id]), { seed: 'lookend', hero: 'brock' }) && T.td.T.speed === 2; }), 'the next run starts at 2×');
		await t.E(() => localStorage.removeItem('magepunk_poketactica_tdspeed_v1'));
		// the result says who the run was played as, who it opened and who is next (a fresh device: nobody but Brock was open)
		await t.E(() => { const T = window.__poketactica, X = T.td.T; X.S.cleared = 15; X.dealt = { fake: 0 }; T.td.order({ t: 'retire' }); });
		await t.page.waitForFunction(() => !document.getElementById('result').hidden, { timeout: 20000 }).catch(() => {});
		const rb = await t.E(() => ({ hero: (document.getElementById('r-hero') || {}).textContent || '', body: document.getElementById('r-body').textContent.replace(/\s+/g, ' '), next: (document.getElementById('r-nexthero') || {}).textContent || '' }));
		A(/Played as Brock/.test(rb.hero) && /New hero! Misty/.test(rb.body) && /New hero! Lt\. Surge/.test(rb.body) && !/New hero! Erika/.test(rb.body) && /Erika opens when you clear wave 20/.test(rb.next) && /your best: 15/.test(rb.next), 'the result: played as Brock; wave 15 opened Misty and Lt. Surge; Erika is next at 20', rb);
		// each hero keeps a best wave of their own (improvement plan, 2026-11-25)
		const hb = await t.E(() => JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).td);
		A(hb['hero-brock'] === 15 && hb['mz-field'] === 15 && /Brock's best!/.test(rb.hero), 'Brock\'s own best wave is kept (15), and the result says so', [hb, rb.hero]);
		// ONE RESULTS SCREEN (improvement plan, 2026-11-25): a run's results offer "Again" (Z) as a battle's offer "Next"
		{
			const btns = await t.E(() => [...document.querySelectorAll('#result .bal-modal-acts .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
			A(/^Again: Open Field Z$/.test(btns[0]) && btns.some((b) => /^Back to camp X$/.test(b)) && btns.filter((b) => /^Again/.test(b)).length === 1, 'the results offer "Again: Open Field" (Z) and "Back to camp" (X)', btns);
			await t.key('KeyZ', 700);
			const at = await t.E(() => ({ page: window.__poketactica.P.screen, hub: window.__poketactica.hub.H.screen, hidden: document.getElementById('result').hidden, text: document.getElementById('hub').textContent.replace(/\s+/g, ' ').slice(0, 200) }));
			A(at.page === 'camp' && at.hidden && /^td-(start|hero|squad)$/.test(at.hub) && /Open Field|From wave|Hero/.test(at.text), 'Z: straight to Open Field\'s own way in (its start wave, then the hero)', at);
			await t.key('KeyX', 300);
			A(await t.E(() => !document.querySelector('#result .pt-again')), 'and the button is gone with the results');
		}
		await t.E(() => { document.getElementById('result').hidden = true; const T = window.__poketactica; T.hub.home(); });
		await sleep(400);
		const heroRows = await t.E(async () => { const T = window.__poketactica, click = (re) => { const b = [...document.querySelectorAll('#hub [data-nav]')].find((x) => re.test(x.textContent)); if (b) b.click(); return !!b; }, wait = (ms) => new Promise((r) => setTimeout(r, ms)); const steps = []; for (const re of [/Tower Defense/, /Maze Builder/, /Open Field/]) { steps.push(click(re)); await wait(350); if (T.hub.H.screen === 'td-start') { steps.push(click(/wave 1\b|Wave 1\b|from the start/i)); await wait(350); } } return { steps, screen: T.hub.H.screen, labels: T.hub.labels() }; });
		A(heroRows.screen === 'td-hero' && heroRows.labels.some((l) => /^Brock/.test(l) && /best: wave 15/.test(l)) && heroRows.labels.some((l) => /^Misty/.test(l) && !/best: wave/.test(l)), 'the hero screen: Brock shows his best wave, Misty has none yet', heroRows);
		A(!t.errors.length, 'no page errors (a hero)', t.errors.slice(0, 3));
		await t.page.close();
	}

	// ---------- REGRESSION (2026-11-25): the hint went on saying "Tap a card, then a tile, to bend the way" all through a wave,
	// when there is no hand: it was only written again when the cursor moved
	{
		const t = await open({ width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
		await t.start('mz-field', 'hintstale');
		await sleep(600);
		const before = await t.E(() => document.getElementById('hint').textContent);
		await t.E(() => document.querySelector('#pt-td [data-act="wave"]').click());
		await sleep(1500);
		const h = await t.E(() => ({ hint: document.getElementById('hint').textContent, phase: window.__poketactica.td.view().phase, hand: !document.getElementById('td-hand').hidden }));
		A(/a card/.test(before) && h.phase === 'wave' && !h.hand && !/a card/.test(h.hint), 'once the wave walks, the hint no longer tells you to tap a card', JSON.stringify({ before, ...h }));
		await t.page.close();
	}
	// ---------- touch, a phone
	{
		const t = await open({ width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
		await t.start('mz-pincer', 'mazetouch');
		await sleep(600);
		const tapTile = async (x, y) => { const p = await t.E((x, y) => window.__poketactica.screenOf(x, y), x, y); await t.page.touchscreen.tap(p[0], p[1]); await sleep(450); };
		const tapEl = async (sel, re) => { const r = await t.E((sel, src) => { const re = src ? new RegExp(src) : null; const el = [...document.querySelectorAll(sel)].find((b) => !re || re.test(b.textContent)); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel, re ? re.source : null); if (r) { await t.page.touchscreen.tap(r[0], r[1]); await sleep(450); } return !!r; };
		let v = await mz(t);
		A(v.mode === 'maze' && v.way.length === 2 && v.way[0] === 16 && v.way[1] === 16, 'Pincer: two gates, a way each (16 steps)', v.way);
		const box = await t.E(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; }; return { tl: r('td-tl'), tr: r('td-tr'), br: r('td-br'), hint: r('hint'), vw: innerWidth, vh: innerHeight }; });
		const apart = (a, b) => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t;
		{ const hint = await t.E(() => { const el = document.getElementById('hint'), r = el.getBoundingClientRect(); return { text: el.textContent, l: r.left, r: r.right, vw: innerWidth, clipped: el.scrollWidth > el.clientWidth + 1 }; }); A(/^Tap /.test(hint.text) && !/\bV:|\bZ:/.test(hint.text) && hint.l >= 0 && hint.r <= hint.vw + 1 && !hint.clipped, 'on a phone the hint says what to tap (no key names), in full', hint); }
		A([box.tl, box.tr, box.br].every((r) => r.l >= 0 && r.r <= box.vw + 1 && r.t >= 0 && r.b <= box.vh) && box.tl.t < 20 && box.tl.l < 20 && box.tr.r > box.vw - 20 && box.br.r > box.vw - 20 && box.br.b > box.vh - 30 && apart(box.tl, box.tr) && apart(box.tr, box.hint) && apart(box.tl, box.hint), 'on a phone the HUD\'s corners fit the width and stand clear of each other and of the hint', box);
		{ const tr = (await bar(t)).tray; A(tr && tr.left >= 0 && tr.right <= tr.vw && tr.bottom <= box.br.t + 2 && tr.top > box.tr.b + 200 && tr.cardW >= 40, 'on a phone the hand of cards fits the width, at the bottom: above the clock\'s buttons, well clear of the top corners', [tr, box]); }
		// THE SCREENS PASS (2026-11-25, measured at 390 px): nothing in the HUD under 14 px, the clock's buttons a thumb's size, bigger cards
		{
			const m = await t.E(() => { const px = (el) => parseFloat(getComputedStyle(el).fontSize); const small = [...document.querySelectorAll('#td-tr .bal-muted, #td-tr small, #td-next, #td-next-more, #td-tl .bal-badge')].filter((el) => el.getBoundingClientRect().width > 0 && el.textContent.trim()); return { min: Math.min(...small.map(px)), n: small.length, btn: [...document.querySelectorAll('#td-br .bal-btn')].map((el) => Math.round(el.getBoundingClientRect().height)), cardW: Math.round(document.querySelector('#td-hand .pt-mz-card').getBoundingClientRect().width), name: px(document.querySelector('#td-hand .pt-mz-name')) }; });
			A(m.n >= 3 && m.min >= 14, 'on a phone nothing in the HUD is written under 14 px', JSON.stringify(m));
			A(m.btn.length >= 3 && m.btn.every((h) => h >= 44), 'the clock\'s buttons (Pause, speed, Menu, Wave!) are a thumb\'s size', JSON.stringify(m.btn));
			A(m.cardW >= 46 && m.name >= 11, 'the hand\'s cards are bigger (a hand of 8: 48 px, the name 11 px)', JSON.stringify(m));
		}
		A(await tapEl('#td-hand .pt-mz-card'), 'a tap on a card');
		v = await mz(t);
		A(v.card === v.hand[0] && (await bar(t)).on === 1 && /Turn/.test((await bar(t)).text), 'it is chosen: Turn, Put it and Discard appear');
		A(await tapEl('#td-hand [data-act="turn"]') && (await mz(t)).turns === 1, 'the Turn button turns it');
		await t.shot('maze-phone-build');
		await tapTile(9, 8);
		v = await mz(t);
		A(v.pin && v.pin.x === 9 && v.pin.y === 8 && v.blocks.length === 0 && /Lay it/.test((await bar(t)).text), 'a tap on a tile puts the ghost there: nothing is laid, the button says Lay it', v.pin);
		await tapTile(2, 8);
		v = await mz(t);
		A(v.pin && v.pin.x === 2 && v.blocks.length === 0, 'a tap elsewhere moves the ghost');
		A(await tapEl('#td-hand [data-act="lay"]'), 'the Lay it button');
		v = await mz(t);
		A(v.blocks.length === 1 && v.hand.length === 4 && v.card === null, 'the block is laid');
		await tapEl('#td-hand .pt-mz-card'); await tapTile(9, 1); await tapTile(9, 1);
		A((await mz(t)).blocks.length === 2, 'or: tap the same tile again to lay it');
		const g0 = (await mz(t)).gold;
		await tapEl('#td-hand .pt-mz-card'); A(await tapEl('#td-hand [data-act="discard"]') && (await mz(t)).gold === g0 + 2 && (await mz(t)).hand.length === 2, 'Discard: 2 gold for the card');
		A(await tapEl('#td-hand [data-act="draw"]') && (await mz(t)).gold === g0 + 2 - 5 && (await mz(t)).hand.length === 3, 'Draw: a card for 5 gold');
		const c = (await mz(t)).blocks[0].cells[0];
		await tapTile(c[0], c[1]);
		let m = await t.menu();
		A(!m.hidden && /Place here/.test(m.title), 'a tap on a block: the squad', m);
		A(await tapEl('#menu-items .bal-btn', /Blastoise/) && (await mz(t)).towers === 1, 'Blastoise stands on it');
		A(await tapEl('#pt-td [data-act="wave"]'), 'the Wave! button');
		await sleep(800);
		v = await mz(t);
		A(v.wave === 1 && v.blocks.every((b) => b.locked), 'wave 1 is called; the blocks lock', v);
		await t.shot('maze-phone');
		A(!t.errors.length, 'no page errors (phone)', t.errors.slice(0, 3));
	}
	// ================================================================ THE BIG MAPS (rules 16; owner, 2026-11-25: "make them 4x the size")
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.start('mz-field', 'bigpage', 0), 'today a run opens on the big Open Field');
		let v = await mz(t), b = await bar(t);
		const size = await t.E(() => { const S = window.__poketactica.td.T.S; return { w: S.B.map.w, h: S.B.map.h, rev: S.rev, gate: S.gates[0], base: [S.B.map.base.x, S.B.map.base.y] }; });
		A(size.w === 24 && size.h === 18 && size.gate.join() === '0,8' && size.base.join() === '23,8', 'the board is 24 by 18: four times the ground, the gate and the base on its far edges', size);
		A(v.hand.length === 8 && v.gold === 60 && v.way[0] === 23 && /Way 23/.test(b.way), 'a first hand of 8 cards, and the way 23 steps', v);
		A(b.cards === 8 && b.tray && b.tray.left >= 0 && b.tray.right <= b.tray.vw && b.tray.bottom <= b.tray.vh + 4 && b.tray.cardW >= 60, 'eight cards fit along the bottom of the screen', b.tray);
		// every tile of the board is on the screen
		const fit = await t.E(() => { const T = window.__poketactica, S = T.td.T.S, out = []; for (const [x, y] of [[0, 0], [S.B.map.w - 1, 0], [0, S.B.map.h - 1], [S.B.map.w - 1, S.B.map.h - 1]]) out.push(T.project ? T.project(x, y) : null); return { out, vw: innerWidth, vh: innerHeight }; });
		if (fit.out.every(Boolean)) A(fit.out.every(([sx, sy]) => sx >= 0 && sx <= fit.vw && sy >= 0 && sy <= fit.vh), 'the whole board is on the screen', fit);
		// a block across the way, by the keys
		await cur(t, 6, 8); await t.key('KeyV'); await t.key('KeyZ'); await t.key('KeyZ', 500);
		v = await mz(t);
		A(v.blocks.length === 1 && v.hand.length === 7, 'a block is laid on it by the keys', v);
		await t.shot('maze-big');
		const why = await t.E(() => { const T = window.__poketactica, S = T.td.T.S, bl = S.blocks[0]; const w = T.td.order({ t: 'place', fig: 0, x: bl.cells[0][0], y: bl.cells[0][1] }) || T.td.order({ t: 'call' }); T.td.T.speed = 3; return w; });
		A(!why, 'a figurine on it, and the wave is called', why);
		await t.page.waitForFunction(() => { const S = window.__poketactica.td.T.S; return S.over || (S.cleared >= 1 && S.phase === 'wait'); }, { timeout: 180000, polling: 200 }).catch(() => {});
		v = await mz(t);
		A(v.cleared >= 1 || v.over, 'the wave walks the long way and ends', v);
		if (!v.over) A(v.hand.length >= 8 || (await t.E(() => window.__poketactica.td.view().handMax)) === 8, 'the next deal fills the hand toward 8 (5 cards a wave, a hand of 8)', v.hand.length);
		// a run recorded on the small map still plays on the small map
		const old = await t.E(() => { const T = window.__poketactica; T.td.open('mz-field', [T.P.col.figs['pikachu-tdp']], { seed: 'oldpage', rev: 15 }); const S = T.td.T.S; return { w: S.B.map.w, h: S.B.map.h, hand: S.hand.length, rev: S.rev }; });
		A(old.w === 12 && old.h === 9 && old.hand === 5 && old.rev === 15, 'a run under rules 15 is on the small board, with a hand of 5', old);
		A(!t.errors.length, 'no page errors (big maps)', t.errors.slice(0, 3));
	}
	{
		const t = await open({ width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
		A(await t.start('mz-lake', 'bigphone', 0), 'on a phone: the big Lakeside Ridge (32 by 20)');
		const b = await bar(t), tr = b.tray;
		A(b.cards === 8 && tr && tr.left >= 0 && tr.right <= tr.vw + 1 && tr.cardW >= 36, 'eight cards fit a phone\'s width', tr);
		await t.shot('maze-big-phone');
		A(!t.errors.length, 'no page errors (big maps, phone)', t.errors.slice(0, 3));
	}
	// ================================================================ THE NEW BLOCK KINDS (rules 17): the Beacon, Mud, Caltrops
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.start('mz-field', 'kindspage', 0), 'a run to lay the new kinds in');
		await t.E(() => { const S = window.__poketactica.td.T.S; S.hand = [{ id: 'kM', shape: 'I', bonus: 'mud' }, { id: 'kC', shape: 'three', bonus: 'caltrops' }, { id: 'kB', shape: 'one', bonus: 'beacon' }, { id: 'kP', shape: 'one' }]; window.__poketactica.td.T.seenN = -1; });
		await sleep(300);
		const cards = await t.E(() => [...document.querySelectorAll('#td-hand .pt-mz-card')].map((c) => ({ cls: c.className, text: c.textContent.trim() })));
		A(cards.length === 4 && /pt-mz-b-mud/.test(cards[0].cls) && /Mud/.test(cards[0].text) && /pt-mz-b-caltrops/.test(cards[1].cls) && /Caltrops/.test(cards[1].text) && /pt-mz-b-beacon/.test(cards[2].cls) && /Beacon/.test(cards[2].text), 'the hand shows a Mud, a Caltrops and a Beacon card by name and colour', cards);
		// Mud: chosen, the hint says it lies ON the way and the way does not change
		const way = await t.E(() => window.__poketactica.td.T.S.paths[0].slice(0, 14));
		await cur(t, way[4][0], way[4][1]);
		const choose = async (id) => { for (let i = 0; i < 8 && (await mz(t)).card !== id; i++) await t.key('KeyV', 120); };
		await choose('kM');
		let b = await bar(t);
		A(/Mud/.test(b.hint) && /ON the way/.test(b.hint) && /Way 23 → 23/.test(b.hint), 'Mud chosen over the way: the hint says what it is, and that the way stays 23', b.hint);
		await t.key('KeyZ'); await t.key('KeyZ', 500);
		let v = await mz(t);
		A(v.blocks.length === 1 && v.way[0] === 23 && v.hand.length === 3, 'laid on the way: the way is still 23 steps', v);
		// a block will not go on top of it
		await cur(t, way[4][0], way[4][1]); await choose('kP');
		b = await bar(t);
		A(/lie there/i.test(b.hint), 'a plain block will not go on top of mud', b.hint);
		await t.key('KeyX');
		await cur(t, way[10][0], way[10][1]); await choose('kC'); await t.key('KeyZ'); await t.key('KeyZ', 500);
		await cur(t, 6, 2); await choose('kB'); await t.key('KeyZ'); await t.key('KeyZ', 500);
		await cur(t, 7, 2); await choose('kP'); await t.key('KeyZ'); await t.key('KeyZ', 500);
		v = await mz(t);
		const st = await t.E(() => { const S = window.__poketactica.td.T.S, W = S.B.map.w; return { pads: Object.values(S.pads || {}).sort().join(), aura: S.aura ? S.aura[2 * W + 7] : 0, looks: Object.values(window.__poketactica.P.groundOver()).filter((k) => k === 'mud' || k === 'caltrops' || k === 'beacon').sort().join() }; });
		A(v.blocks.length === 4 && st.pads === 'caltrops,caltrops,caltrops,mud,mud,mud,mud' && st.aura === 15, 'caltrops further down the way, a Beacon off it, a plain block beside the Beacon (+15% there)', st);
		A(st.looks === 'beacon,caltrops,caltrops,caltrops,mud,mud,mud,mud', 'each is drawn as itself on the board', st.looks);
		await t.shot('maze-kinds');
		await t.E(() => { const T = window.__poketactica; T.td.order({ t: 'call' }); });
		for (let i = 0; i < 12; i++) await t.key('ArrowRight', 60); await sleep(600);
		v = await mz(t);
		A(v.wave === 1 && v.blocks.every((x) => x.locked), 'the wave is called over them: they lock like any block', v.wave);
		await t.shot('maze-kinds-wave');
		A(!t.errors.length, 'no page errors (new kinds)', t.errors.slice(0, 3));
	}
	// ================================================================ MORE MAPS (plan item 14): a moving gate, two bases, a flooded middle
	{
		const t = await open({ width: 1280, height: 800 });
		A(await t.start('mz-drift', 'driftpage', 0), 'Wandering Gate opens');
		await sleep(400);
		const g1 = await t.E(() => ({ gate: (document.getElementById('td-gate') || {}).textContent || '', way: (document.getElementById('td-way') || {}).textContent || '', ways: window.__poketactica.td.T.S.paths.length }));
		A(/Gate 1 of 3/.test(g1.gate) && /^Way \d+$/.test(g1.way.trim()) && g1.ways === 3, 'the bar says which gate is next, and that way\'s length alone', g1);
		await t.shot('maze-drift');
		A(await t.start('mz-keeps', 'keepspage', 0), 'Twin Keeps opens');
		await sleep(400);
		const k1 = await t.E(() => { const S = window.__poketactica.td.T.S; return { gate: !!document.getElementById('td-gate'), way: (document.getElementById('td-way') || {}).textContent || '', bases: (S.B.map.bases || []).length, ways: S.paths.length }; });
		A(!k1.gate && /Way \d+ \+ \d+/.test(k1.way) && k1.bases === 2 && k1.ways === 2, 'two bases: a way to each on the bar, no gate badge', k1);
		await t.shot('maze-keeps');
		A(await t.start('mz-ford', 'fordpage', 0), 'Drowned Crossing opens');
		await sleep(400);
		await t.shot('maze-ford');
		A(!t.errors.length, 'no page errors (more maps)', t.errors.slice(0, 3));
	}
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
