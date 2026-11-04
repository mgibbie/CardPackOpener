// bugreports_1026b_ow_test.mjs — tester bug reports of 2026-10-26 (second set), overworld.
//
//   bug:1793024785335 (remytest, BLOCKER; re-file of 1792723600759)  Route 107 (4,10):
//     "turns but never steps", every gate clear. Movement sampled heldKeys ONCE PER
//     TICK, so a key pressed and released between two ticks never reached the
//     player at all: no turn, no step, no refusal. Zero-length taps (an automated
//     tester's key press, a JS-dispatched key, a quick thumb on the d-pad) were
//     nearly all lost at 60fps and all of them in a slow cloud browser. The taps
//     toward the sand vanished; the ones that landed faced the sea (east and north
//     of (4,10) are deep water, correctly refused without SURF). A tap is now
//     latched and delivered on the next tick (ow_input.js latchTap, ow_loop.js).
//   bug:1793045962446 (remytest, re-file after the latch shipped) "all 4 neighbouring tiles read isPassable=true;
//     20 Right taps + 12 toward a passable tile, zero steps". Not reproduced on the live build by any input path
//     (CDP press, 60 ms hold, JS-dispatched keydown/keyup, d-pad tap/click, 20x CPU throttle): Right and Up are deep
//     water, refused without SURF; Left and Down step. isPassable is collision only (water is "passable" to a surfer),
//     which is what the four trues measured. gateReport() now carries `around`: the real verdict for each side.
//   bug:1793029837579 (+ follow-up 1793029906253, instinctgauntlet)  the phone's
//     objective strip drew the whole long sentence on ONE line with fillText's
//     maxWidth, squeezing it into an unreadable sliver that ran under MENU. It now
//     word-wraps at a legible size (>= 12 CSS px), stays left of MENU/PARTY/BAG,
//     shows 3 lines with a "more" marker and expands on a tap. Desktop (the DOM
//     bar) is untouched.
//
//   node overworld/tests/bugreports_1026b_ow_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9276;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: { username: 'bug1026b', friendCode: 'B1026', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
// `save`: whole localStorage entries to seed (a real save's key/value map)
async function open(map, x, y, { flags = {}, badges = { badges: {}, champion: {} }, region = 'KANTO', save = null, mobile = false } = {}) {
	const page = await browser.newPage();
	if (mobile) await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
	else await page.setViewport({ width: 1280, height: 720 });
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	await page.evaluateOnNewDocument((flags, badges, region, save) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'bug1026b', friendCode: 'B1026', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		if (save) { for (const [k, v] of Object.entries(save)) localStorage.setItem(k, v); return; }
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars: {} }));
	}, flags, badges, region, save);
	const q = map ? `?map=${map}&x=${x}&y=${y}` : '';
	await page.goto(`http://localhost:${PORT}/overworld/index.html${q}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world?.current && (!m || window.__ow.world.current.name === m) && !window.__ow.S?.loading), map).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	if (!save) await page.evaluate(async () => { const B = await import('./battle.js'), S = (await import('./ow_state.js')).S; S.party = [B.buildMon('ivysaur', 19, window.__ow.battle.data)]; });
	return page;
}
const where = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
const press = (page, k) => page.evaluate(k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);
const tapLatch = page => page.evaluate(async () => (await import('./ow_state.js')).S.tapDir ?? null);
const settle = async page => { for (let i = 0; i < 40 && await page.evaluate(() => window.__ow.player.moving); i++) await sleep(25); await sleep(150); };

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });

	// ===== Route 107 (4,10): taps that never reach a tick (bug:1793024785335) =====
	{
		// the shape of the reporter's save on that tile (Hoenn, no SURF user, two badges)
		const save = {
			magepunk_region: 'hoenn', magepunk_starter: 'bulbasaur', magepunk_rival: 'GARY',
			magepunk_pos_v1: JSON.stringify({ map: 'Route107', x: 4, y: 10, back: null, dyn: null }),
			magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_ADVENTURE_STARTED: true }, vars: {} }),
			magepunk_party_v1: JSON.stringify([{ speciesId: 'pidgeotto', name: 'PIDGEOTTO', level: 33, gender: 'M', friend: 255, types: ['Normal', 'Flying'], ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, stats: { hp: 99, atk: 60, def: 60, spa: 60, spd: 60, spe: 80 }, maxHP: 99, curHP: 99, exp: 30000, moves: [{ id: 'gust', name: 'Gust', pp: 35, maxPp: 35 }], sprite: 's17.png', num: 17 }]),
			magepunk_badges_v1: JSON.stringify({ badges: { HOENN: { stone: true, knuckle: true } }, champion: {} }),
		};
		const page = await open(null, 0, 0, { save });
		const at = await where(page);
		A(at.map === 'Route107' && at.x === 4 && at.y === 10, '[1793024785335] the save resumes on Route107 (4,10)', JSON.stringify(at));
		// the reporter's probe: isPassable on all four sides reads true, yet two of them are sea
		const probe = await page.evaluate(() => { const O = window.__ow, w = O.world, p = O.player; return { passable: [[1, 0], [0, -1], [-1, 0], [0, 1]].map(([dx, dy]) => w.isPassable(p.tx + dx, p.ty + dy)), around: O.gateReport().around }; });
		A(probe.passable.every(Boolean) && probe.around && /SURF/.test(probe.around.right) && /SURF/.test(probe.around.up) && probe.around.left === 'open' && probe.around.down === 'open',
			'[1793045962446] isPassable reads true on all four sides, and gateReport().around names the truth: east + north deep water (needs SURF), west + south open', JSON.stringify(probe));
		// keydown + keyup in ONE task: no tick can ever see the key held
		const jsTap = k => page.evaluate(k => { dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); }, k);
		for (let i = 0; i < 3; i++) { await jsTap('ArrowLeft'); await sleep(80); await settle(page); }
		const l = await where(page);
		A(l.x === 1 && l.y === 10, '[1793024785335] three instant taps WEST walk three tiles onto the sand (4 -> 1), not zero', JSON.stringify(l));
		// a CDP key press with no hold, the way an automated tester sends one
		for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowDown'); await sleep(80); await settle(page); }
		const d = await where(page);
		A(d.x === 1 && d.y === 12, '...and two zero-length key presses SOUTH walk two tiles (10 -> 12)', JSON.stringify(d));
		// a quick thumb on the touch d-pad (down + up before a frame)
		await page.evaluate(() => {
			document.getElementById('t-right').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, bubbles: true, cancelable: true }));
			dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, bubbles: true }));
		});
		await sleep(80); await settle(page);
		const r = await where(page);
		A(r.x === 2 && r.y === 12, '...and a d-pad tap shorter than a frame steps EAST once', JSON.stringify(r));
		await sleep(300);
		const r2 = await where(page);
		A(r2.x === 2 && r2.y === 12 && await tapLatch(page) === null, '...exactly once (nothing left latched to replay)', JSON.stringify(r2));
		// the sea is still the sea: a walker is refused at deep water, facing it
		await page.evaluate(() => window.__ow.player.setTile(4, 10));
		await jsTap('ArrowRight'); await sleep(120); await settle(page);
		const sea = await page.evaluate(() => ({ x: window.__ow.player.tx, f: window.__ow.player.facing, o: window.__ow.player.moveOutcome, ref: window.__ow.gateReport().ahead.refusal }));
		A(sea.x === 4 && sea.f === 'right' && sea.o === 'bump' && /SURF/.test(sea.ref || ''), '...while a tap EAST (open sea, no SURF) turns and is refused as water, as on the GBA', JSON.stringify(sea));
		// a tap latched while a dialog owns the screen is dropped, never replayed as a
		// stale step once the dialog closes
		await page.evaluate(() => window.__ow.dialog.open('A sign.'));
		await sleep(100);
		await page.evaluate(async () => { (await import('./ow_state.js')).S.tapDir = 'left'; });
		await sleep(200);
		for (let i = 0; i < 20 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await press(page, 'z'); await sleep(80); }
		await sleep(400);
		const st = await where(page);
		A(st.x === 4 && st.y === 10, '...and a tap latched under an open dialog does not step after it closes', JSON.stringify(st));
		// holding still walks
		await page.keyboard.down('ArrowLeft'); await sleep(500); await page.keyboard.up('ArrowLeft'); await settle(page);
		const h = await where(page);
		A(h.x < 4 && h.y === 10, '...and a HELD key still walks', JSON.stringify(h));
		await page.close();
	}

	// ===== the phone objective strip (bug:1793029837579 + 1793029906253) =====
	const LONG = 'NEXT: Collect all three 2nd-badge SHARDS, any order: MISTY in CERULEAN CITY, or PORTAL to BUGSY (AZALEA TOWN) / BRAWLY (DEWFORD TOWN).';
	const shardBadges = { badges: { KANTO: { boulder: true }, JOHTO: { zephyr: true }, HOENN: { stone: true } }, champion: {} };
	{
		const page = await open('MtMoon_1F', 20, 27, { mobile: true, badges: shardBadges });
		for (let i = 0; i < 40 && !(await page.evaluate(() => /SHARDS/.test(document.getElementById('objective').textContent))); i++) await sleep(100);
		await sleep(300);
		const m = await page.evaluate(() => {
			const O = window.__ow, c = document.getElementById('screen'), cr = c.getBoundingClientRect();
			const b = document.getElementById('t-start').getBoundingClientRect();
			return { touch: document.body.classList.contains('touch'), obj: document.getElementById('objective').textContent, rect: O.touchHud.rect || null,
				truncated: O.touchHud.truncated, cssScale: cr.width / c.width, btnLeft: (b.left - cr.left) * (c.width / cr.width), cssLeft: cr.left, cssTop: cr.top, SW: c.width };
		});
		A(m.touch && m.obj === LONG, '[1793029837579] at 390x844 (touch) the three-shard objective is the one on screen', JSON.stringify({ touch: m.touch, obj: m.obj }));
		A(!!m.rect && m.rect.lines >= 3, '...and it is WRAPPED over several lines, not squeezed onto one', JSON.stringify(m.rect));
		A(!!m.rect && m.rect.fs * m.cssScale >= 12, '...at a legible size (>= 12 CSS px on the phone)', m.rect ? (m.rect.fs * m.cssScale).toFixed(1) : 'no strip rect');
		A(!!m.rect && m.rect.x + m.rect.w <= m.btnLeft, '...and the strip stops short of the MENU / PARTY / BAG buttons', JSON.stringify({ right: m.rect && m.rect.x + m.rect.w, btnLeft: m.btnLeft }));
		// every line fits its box at natural width (no maxWidth squeeze), and nothing is lost
		const fit = m.rect ? await page.evaluate(async SW => {
			const L = await import('./ow_loop.js'), O = window.__ow, r = O.touchHud.rect;
			const cv = document.createElement('canvas').getContext('2d'); cv.font = r.fs + 'px system-ui, sans-serif';
			const lines = L.wrapHudText(t => cv.measureText(t).width, O.touchHud.objective, r.maxW - 2 * Math.round(SW * 0.02));
			return { n: lines.length, widest: Math.max(...lines.map(l => cv.measureText(l).width)), room: r.maxW, joined: lines.join(' ') === O.touchHud.objective };
		}, m.SW) : {};
		A(fit.widest <= fit.room && fit.joined, '...each wrapped line fits at natural width and together they are the whole sentence', JSON.stringify(fit));
		A(m.truncated === true, '...collapsed, it is cut at 3 lines with a "more" marker', String(m.truncated));
		// tap the strip: the whole objective; tap again: folded back
		const tapAt = { x: m.cssLeft + (m.rect ? (m.rect.x + 30) * m.cssScale : 20), y: m.cssTop + (m.rect ? (m.rect.y + 15) * m.cssScale : 20) };
		await page.touchscreen.tap(tapAt.x, tapAt.y); await sleep(300);
		const e1 = await page.evaluate(() => ({ e: window.__ow.touchHud.expanded, lines: window.__ow.touchHud.rect?.lines }));
		await page.touchscreen.tap(tapAt.x, tapAt.y); await sleep(300);
		const e2 = await page.evaluate(() => ({ e: window.__ow.touchHud.expanded, lines: window.__ow.touchHud.rect?.lines }));
		A(e1.e === true && e1.lines > (m.rect?.lines || 0) && e2.e === false, '...a tap on it shows the whole objective, a second tap folds it back', JSON.stringify({ e1, e2 }));
		const pos = await where(page);
		A(pos.x === 20 && pos.y === 27, '...and tapping the strip moves nobody', JSON.stringify(pos));
		const short = await page.evaluate(async () => {
			const L = await import('./ow_loop.js');
			if (!L.wrapHudText) return null;
			const cv = document.createElement('canvas').getContext('2d'); cv.font = '36px system-ui, sans-serif';
			return L.wrapHudText(t => cv.measureText(t).width, 'NEXT: Rest.', 700).length;
		});
		A(short === 1, '...while a short objective stays on one line', String(short));
		await page.close();
	}
	{
		// desktop keeps the DOM bar; the canvas strip never draws
		const page = await open('MtMoon_1F', 20, 27, { badges: shardBadges });
		for (let i = 0; i < 40 && !(await page.evaluate(() => /SHARDS/.test(document.getElementById('objective').textContent))); i++) await sleep(100);
		const d = await page.evaluate(() => ({ touch: document.body.classList.contains('touch'), rect: window.__ow.touchHud.rect ?? null, bar: getComputedStyle(document.getElementById('objective')).display, obj: document.getElementById('objective').textContent }));
		A(!d.touch && d.rect == null && d.bar !== 'none' && /2nd-badge SHARDS/.test(d.obj), '...and on desktop the objective stays in the DOM bar, unchanged (no canvas strip)', JSON.stringify(d));
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
