// controls_b7_test.mjs — controls sweep B7: Scoundrel, Pair of Pears and PokéChess played three
// ways, each with no mouse at all: the keyboard only (arrows / WASD, Z X C V, Enter, Backspace),
// a fake controller only, and touch on a phone (390x844 portrait and 844x390 landscape).
// Also: typing in a text field moves nothing, and the Games switcher still opens from each game.
//
// Regressions pinned here (each fails on the old code):
//   - Scoundrel: W fought with the weapon (it is "up" now; Z is the Weapon, C bare-handed, V run)
//   - PokéChess: Shift / Caps Lock + W didn't move the cursor (keys were matched by e.key)
//   - PokéChess: a tap of Esc left the game (Esc is back now; Backspace / Select leave)
//   - PokéChess: Start + Select (the Games switcher) left the game on the Select press
//
//   node overworld/tests/controls_b7_test.mjs      (screenshots: SHOTS=<dir>)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as E from '../../scoundrel/js/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(80); } return false; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true,"state":null}'); return; }
	const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
	// where a game leads (the overworld, home) is a stub: only the URL matters
	if (f === '/overworld/index.html' || f === '/index.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>stub</title>stub'); return; }
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const DESK = { width: 1280, height: 800, deviceScaleFactor: 1 };
const PORTRAIT = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// Standard mapping by POSITION; the Nintendo layout (the default): RIGHT = confirm, BOTTOM = cancel,
// LEFT = context (Y), TOP = secondary (X)
const BTN = { cancel: 0, confirm: 1, context: 2, secondary: 3, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

async function open(url, vp, { seed = {} } = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.evaluateOnNewDocument((seedJson) => {
		try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); for (const [k, v] of Object.entries(JSON.parse(seedJson))) localStorage.setItem(k, v); } catch { /* ignore */ }
		const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
		window.__owFakePads = [pad]; window.__pad = pad;
		// no mouse in a keyboard / controller run: count any that reaches the page
		window.__mouse = 0;
		for (const t of ['mousedown', 'mouseup', 'click', 'pointerdown']) addEventListener(t, (e) => { if (e.isTrusted && e.pointerType !== 'touch' && !(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) window.__mouse++; }, true);
	}, JSON.stringify(seed));
	await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
	const t = { ctx, page, errors };
	t.key = async (k, ms = 90) => { await page.keyboard.press(k); await sleep(ms); };
	t.hold = (b, on) => page.evaluate((b, on) => { window.__pad.buttons[b] = { pressed: on, value: on ? 1 : 0, touched: on }; window.__pad.timestamp++; }, b, on);
	t.tap = async (b) => { await t.hold(b, true); await sleep(90); await t.hold(b, false); await sleep(140); };
	t.touch = async (sel) => { const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel); if (!r) return false; await page.touchscreen.tap(r[0], r[1]); await sleep(150); return true; };
	t.mouse = () => page.evaluate(() => window.__mouse);
	t.shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
	t.switcher = async (how) => {
		if (how === 'key') { await t.key('Backquote', 200); }
		else { await t.hold(BTN.start, true); await sleep(60); await t.hold(BTN.select, true); await sleep(160); await t.hold(BTN.start, false); await t.hold(BTN.select, false); await sleep(200); }
		const open = await page.evaluate(() => !!(window.__mpSwitcher && window.__mpSwitcher.isOpen()));
		if (open) { await t.key('Escape', 200); }
		return open;
	};
	// a text field: typing the scheme's keys into it moves nothing
	t.typeInField = async () => {
		await page.evaluate(() => { const i = document.createElement('input'); i.id = '__typing'; i.style.cssText = 'position:fixed;left:0;top:0;z-index:99999'; document.body.appendChild(i); i.focus(); });
		await page.keyboard.type('wasdzxcvqe 1234 bnor');
		await page.keyboard.press('Enter'); await page.keyboard.press('Backspace'); await page.keyboard.press('Escape');
		await sleep(250);
		const v = await page.evaluate(() => document.getElementById('__typing').value);
		await page.evaluate(() => document.getElementById('__typing').remove());
		return v;
	};
	return t;
}

// steer the ring toward `sel`: each step presses the direction the target lies in (the way a
// player looks at the screen and presses toward what they want)
async function steer(t, game, sel, press) {
	for (let i = 0; i < 16; i++) {
		const d = await t.page.evaluate((game, sel) => {
			const f = window[game].focus(), tg = document.querySelector(sel);
			if (!tg) return 'none';
			if (f === tg) return 'here';
			if (!f) return 'down';
			const a = f.getBoundingClientRect(), b = tg.getBoundingClientRect();
			const dx = (b.x + b.width / 2) - (a.x + a.width / 2), dy = (b.y + b.height / 2) - (a.y + a.height / 2);
			return Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right');
		}, game, sel);
		if (d === 'here') return true;
		if (d === 'none') return false;
		await press(d);
	}
	return false;
}
const KEYDIR = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };

// =========================================================== Scoundrel
const SC_SEED = 'seed3';
const SC_RECIPE = '10br2w';   // (the start of the cleared run in scoundrel_engine_test: 1, 0 -> a fight choice)
async function scoundrel(t) {
	await waitFor(() => t.page.evaluate(() => window.__scoundrel && window.__scoundrel.ready), 20000);
	await sleep(300);
	return {
		view: () => t.page.evaluate(() => window.__scoundrel.view()),
		n: () => t.page.evaluate(() => (window.__scoundrel.view() || { n: -1 }).n),
		idle: () => waitFor(() => t.page.evaluate(() => window.__scoundrel.idle()), 8000),
		focus: () => t.page.evaluate(() => { const f = window.__scoundrel.focus(); return f ? (f.classList.contains('card') ? 'card:' + f.dataset.id : f.className) : null; }),
		modal: () => t.page.evaluate(() => { const m = [...document.querySelectorAll('.modal-layer .modal')].pop(); return m ? m.className : ''; }),
	};
}
// walk the ring through `dirs` (in order) until it sits on `want` (a class token)
async function ringTo(t, focus, want, dirs, step) {
	if (dirs.length < 12) dirs = [...dirs, ...dirs.slice().reverse().map((d) => d), ...dirs];
	for (let i = 0; i < dirs.length; i++) {
		const f = await focus();
		if (f && f.split(/\s+/).includes(want)) return true;
		await step(dirs[i % dirs.length]);
	}
	return ((await focus()) || '').split(/\s+/).includes(want);
}

// ---- keyboard only ----
{
	const t = await open('/scoundrel/', DESK);
	const s = await scoundrel(t);
	await t.key('KeyS');
	A(!!(await s.focus()), 'Scoundrel keyboard: the first key shows the focus ring on the menu', await s.focus());
	A(await ringTo(t, s.focus, 'b-howto', ['KeyD', 'KeyD', 'KeyD', 'KeyD', 'KeyA', 'KeyA', 'KeyA', 'KeyA', 'KeyA'], (k) => t.key(k)), 'Scoundrel keyboard: D / A walk the menu to How to play', await s.focus());
	await t.key('KeyZ');
	A(/sc-modal/.test(await s.modal()) && await t.page.evaluate(() => /Z pick \(in a fight: Weapon\)/.test(document.querySelector('.sc-howto').textContent) && !/W weapon/.test(document.querySelector('.sc-howto').textContent)), 'Scoundrel keyboard: Z opens How to play, which lists the new keys (no "W weapon")');
	await t.key('KeyX');
	A(/menu-modal/.test(await s.modal()), 'Scoundrel keyboard: X closes it, back on the menu');
	A(await ringTo(t, s.focus, 'b-new', ['KeyA', 'KeyA', 'KeyA', 'KeyA', 'KeyA', 'KeyD', 'KeyD', 'KeyD', 'KeyD', 'KeyD'], (k) => t.key(k)), 'Scoundrel keyboard: back to New Run');
	await t.key('Enter');   // Enter picks in a menu
	A(await waitFor(async () => (await s.view()) && (await s.view()).room.length === 4, 5000), 'Scoundrel keyboard: Enter starts a new run');
	await t.ctx.close();
}
{
	const t = await open(`/scoundrel/?seed=${SC_SEED}`, DESK);
	const s = await scoundrel(t);
	await s.idle();
	// pick a card with the ring: S shows it on a card, Z plays it ('1' = card index 1)
	await t.key('KeyS');
	let f = await s.focus();
	A(/^card:/.test(f || ''), 'Scoundrel keyboard: the ring starts on a room card', f);
	const v0 = await s.view();
	const target = v0.room[1].id;
	await ringTo(t, s.focus, 'card:' + target, ['KeyD', 'KeyD', 'KeyD', 'KeyA', 'KeyA', 'KeyA'], (k) => t.key(k));
	A((await s.focus()) === 'card:' + target, 'Scoundrel keyboard: D / A move the ring over the cards', await s.focus());
	await t.key('KeyZ', 300);
	A(await waitFor(async () => (await s.n()) === 1, 3000), 'Scoundrel keyboard: Z plays the focused card');
	await s.idle();
	await t.key('Digit1', 300);
	await s.idle();
	let v = await s.view();
	A(v.state === 'fight_choice', 'Scoundrel keyboard: a fight choice is open', v.state);
	A(await t.page.evaluate(() => /Weapon/.test(document.getElementById('pad-hints').textContent) && /Unarmed/.test(document.getElementById('pad-hints').textContent) && />C<\/span>Unarmed/.test(document.getElementById('pad-hints').innerHTML)), 'Scoundrel keyboard: the hint bar shows Z Weapon / C Unarmed (keyboard labels)', await t.page.evaluate(() => document.getElementById('pad-hints').textContent));
	// REGRESSION: W used to fight with the weapon; it is "up" now (it moves the ring)
	const n2 = await s.n();
	await t.key('KeyW', 300);
	A((await s.n()) === n2 && (await s.view()).state === 'fight_choice', 'Scoundrel keyboard: W no longer fights with the weapon (WASD moves)');
	await t.key('KeyC', 300);   // bare-handed (the recipe's 'b')
	A(await waitFor(async () => (await s.n()) === 3, 3000) && (await s.view()).hp === E.replay(SC_SEED, SC_RECIPE.slice(0, 3)).hp, 'Scoundrel keyboard: C fights bare-handed');
	await s.idle();
	await t.key('KeyV', 300);   // run (the recipe's 'r')
	A(await waitFor(async () => (await s.n()) === 4, 3000), 'Scoundrel keyboard: V runs from the room');
	await s.idle();
	await t.key('Digit3', 300);
	await s.idle();
	A((await s.view()).state === 'fight_choice', 'Scoundrel keyboard: another fight choice');
	await t.key('KeyZ', 300);   // the weapon (the recipe's 'w')
	A(await waitFor(async () => (await s.n()) === 6, 3000) && (await s.view()).hp === E.replay(SC_SEED, SC_RECIPE).hp, 'Scoundrel keyboard: Z fights with the weapon', JSON.stringify({ hp: (await s.view()).hp, want: E.replay(SC_SEED, SC_RECIPE).hp }));
	await s.idle();
	// Options: the ring reaches the HUD's Options button; Esc / X back out
	A(await steer(t, '__scoundrel', '.b-menu', (d) => t.key(KEYDIR[d])), 'Scoundrel keyboard: the ring reaches Options', await s.focus());
	await t.key('KeyZ');
	A(/sc-modal/.test(await s.modal()) && await t.page.evaluate(() => !!document.querySelector('.modal-layer .b-sfx')), 'Scoundrel keyboard: Z opens Options');
	await t.key('Escape', 300);
	A(!(await s.modal()), 'Scoundrel keyboard: a tap of Esc closes it');
	const before = await s.n();
	A((await t.typeInField()) === 'wasdzxcvqe 1234 bno' && (await s.n()) === before, 'Scoundrel: typing in a text field moves nothing');
	A(await t.switcher('key'), 'Scoundrel keyboard: ` opens the Games switcher');
	A((await s.n()) === before && (await t.mouse()) === 0, 'Scoundrel keyboard: ...the run is untouched, and no mouse event was ever used');
	await t.shot('scoundrel_keyboard');
	A(!t.errors.length, 'Scoundrel keyboard: no page errors', t.errors.slice(0, 3).join(' | '));
	await t.ctx.close();
}
// ---- the controller only ----
{
	const t = await open('/scoundrel/', DESK);
	const s = await scoundrel(t);
	await t.tap(BTN.down);
	A(await ringTo(t, s.focus, 'b-new', [BTN.left, BTN.left, BTN.left, BTN.left, BTN.left, BTN.right, BTN.right, BTN.right, BTN.right], (b) => t.tap(b)), 'Scoundrel pad: the d-pad reaches New Run');
	await t.tap(BTN.confirm);
	A(await waitFor(async () => (await s.view()) && (await s.view()).room.length === 4, 5000), 'Scoundrel pad: A starts a run');
	await t.ctx.close();
}
{
	const t = await open(`/scoundrel/?seed=${SC_SEED}`, DESK);
	const s = await scoundrel(t);
	await s.idle();
	await t.tap(BTN.down);
	const v0 = await s.view();
	await ringTo(t, s.focus, 'card:' + v0.room[1].id, [BTN.right, BTN.right, BTN.right, BTN.left, BTN.left, BTN.left], (b) => t.tap(b));
	await t.tap(BTN.confirm); await s.idle();
	const ok1 = (await s.n()) === 1 && (await s.view()).room.length === 3;
	A(ok1, 'Scoundrel pad: A plays the focused card', JSON.stringify({ n: await s.n(), f: await s.focus() }));
	if (ok1 && (await s.view()).actions === '1') {
		await t.page.evaluate(() => window.__scoundrel.act('0')); await s.idle();
		A((await s.view()).state === 'fight_choice', 'Scoundrel pad: a fight choice');
		await t.tap(BTN.secondary);   // X (top): bare-handed
		A(await waitFor(async () => (await s.n()) === 3, 3000), 'Scoundrel pad: the X button fights bare-handed');
		await s.idle();
		await t.tap(BTN.context);     // Y (left): Run!
		A(await waitFor(async () => (await s.n()) === 4, 3000), 'Scoundrel pad: Y runs');
	}
	await s.idle();
	await t.tap(BTN.start);
	A(/sc-modal/.test(await s.modal()) && await t.page.evaluate(() => !!document.querySelector('.modal-layer .b-sfx')), 'Scoundrel pad: Start opens Options');
	await t.tap(BTN.cancel);
	A(!(await s.modal()), 'Scoundrel pad: B closes it');
	A(await t.switcher('pad'), 'Scoundrel pad: Start + Select open the Games switcher');
	A(!(await s.modal()) && (await s.n()) >= 1, 'Scoundrel pad: ...without Start opening Options under it');
	A((await t.mouse()) === 0, 'Scoundrel pad: no mouse event was used');
	A(!t.errors.length, 'Scoundrel pad: no page errors', t.errors.slice(0, 3).join(' | '));
	await t.ctx.close();
}
// ---- touch, both orientations ----
for (const [name, vp] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
	const t = await open('/scoundrel/', vp);
	const s = await scoundrel(t);
	A(await t.touch('.menu-modal .b-new'), `Scoundrel ${name}: New Run is on screen`);
	A(await waitFor(async () => (await s.view()) && (await s.view()).room.length === 4, 5000), `Scoundrel ${name}: a tap starts a run`);
	await s.idle();
	const id = (await s.view()).room[0].id;
	await t.touch(`.cards-layer .card[data-id="${id}"]`);
	A(await waitFor(async () => (await s.n()) >= 1, 3000), `Scoundrel ${name}: a tap plays a card`);
	await s.idle();
	const fits = await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.cards-layer .card, .sc-controls .btn')].every((e) => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1); }));
	A(fits, `Scoundrel ${name}: the cards and the Run! button fit the screen`);
	if ((await s.view()).state === 'fight_choice') { await t.touch('.b-unarmed'); await s.idle(); }
	const canRun = (await s.view()).canRun;
	if (canRun) { const n = await s.n(); await t.touch('.b-run'); A(await waitFor(async () => (await s.n()) === n + 1, 3000), `Scoundrel ${name}: tapping Run! runs`); }
	await t.shot('scoundrel_' + name);
	await t.ctx.close();
}

// =========================================================== Pair of Pears
async function pears(t) {
	await waitFor(() => t.page.evaluate(() => window.__pears && window.__pears.ready), 20000);
	await sleep(300);
	return {
		view: () => t.page.evaluate(() => window.__pears.view()),
		idle: () => waitFor(() => t.page.evaluate(() => window.__pears.idle()), 8000),
		focus: () => t.page.evaluate(() => { const f = window.__pears.focus(); return f ? (f.classList.contains('card') ? 'card:' + f.dataset.id : f.className.split(/\s+/).map((c) => (f.dataset.i != null ? c + ':' + f.dataset.i : c)).join(' ')) : null; }),
		modal: () => t.page.evaluate(() => { const m = [...document.querySelectorAll('.modal-layer .modal')].pop(); return m ? m.className : ''; }),
		cards: () => t.page.evaluate(() => window.__pears.engine._cards()),
	};
}
// clear level 1 through the engine (setup only), then the shop is the screen under test
async function pearsToShop(t, p) {
	for (let g = 0; g < 8 && (await p.view()).phase === 'play'; g++) {
		await waitFor(async () => !(await p.view()).busy, 3000);
		const cs = (await p.cards()).filter((c) => !c.faceUp && !c.matched);
		const a = cs.find((c) => c.fruit !== 'pear') || cs[0], b = cs.find((c) => c !== a && c.fruit === a.fruit);
		await t.page.evaluate((a, b) => { window.__pears.act('reveal', a); window.__pears.act('reveal', b); }, a.id, b.id);
		await sleep(250);
	}
	await waitFor(async () => (await p.view()).phase === 'clear', 4000);
	await sleep(500);
}
// ---- keyboard only ----
{
	const t = await open('/pairofpears/', DESK);
	const p = await pears(t);
	await t.key('KeyS');
	A(!!(await p.focus()), 'Pears keyboard: the first key shows the ring on the menu', await p.focus());
	A(await ringTo(t, p.focus, 'b-new', ['KeyA', 'KeyA', 'KeyA', 'KeyA', 'KeyA', 'KeyD', 'KeyD', 'KeyD', 'KeyD', 'KeyD'], (k) => t.key(k)), 'Pears keyboard: the ring reaches New Run');
	await t.key('KeyZ');
	A(await waitFor(async () => (await p.view()) && (await p.view()).cards.length === 6, 5000), 'Pears keyboard: Z starts a run');
	await p.idle();
	await t.key('KeyD');
	const f1 = await p.focus();
	A(/^card:/.test(f1 || ''), 'Pears keyboard: D puts the ring on a card', f1);
	await t.key('KeyZ', 300);
	A(await waitFor(async () => (await p.view()).cards.find((c) => 'card:' + c.id === f1).up, 3000), 'Pears keyboard: Z flips it');
	await waitFor(async () => !(await p.view()).busy, 3000);
	await t.key('KeyS'); await t.key('KeyD');
	const f2 = await p.focus();
	await t.key('Space', 300);
	A(await waitFor(async () => { const v = await p.view(); const c = v.cards.find((x) => 'card:' + x.id === f2); return !!c && (c.up || c.m) || v.pairs + v.mismatches >= 1; }, 3000), 'Pears keyboard: Space flips too');
	await pearsToShop(t, p);
	A((await p.view()).phase === 'clear', 'Pears keyboard: (level 1 cleared)');
	await t.key('KeyV', 600);
	A(await waitFor(async () => (await p.view()).phase === 'shop', 3000), 'Pears keyboard: V continues to the shop');
	await sleep(700);
	// buy a charm with the ring, pick it up from its slot, sell it with C
	const v = await p.view();
	const ci = v.offers.findIndex((o) => o && o.kind === 'charm' && o.cost <= v.berries);
	if (ci >= 0) {
		A(await ringTo(t, p.focus, 'b-buy:' + ci, ['KeyW', 'KeyD', 'KeyD', 'KeyD', 'KeyA', 'KeyA', 'KeyA', 'KeyS'], (k) => t.key(k)), 'Pears keyboard: the ring reaches a Buy button', await p.focus());
		await t.key('KeyZ', 300);
		A(await waitFor(async () => !!(await p.view()).charms[0], 3000), 'Pears keyboard: Z buys the charm');
		A(await ringTo(t, p.focus, 'pp-slot:0', ['KeyW', 'KeyW', 'KeyA', 'KeyA', 'KeyD'], (k) => t.key(k)), 'Pears keyboard: the ring reaches the charm slot', await p.focus());
		await t.key('KeyZ', 300);
		A(await waitFor(async () => !!(await p.view()).held, 2000), 'Pears keyboard: Z picks the charm up');
		const b0 = (await p.view()).berries;
		await t.key('KeyC', 300);
		A(await waitFor(async () => { const x = await p.view(); return !x.held && !x.charms.some(Boolean) && x.berries > b0; }, 3000), 'Pears keyboard: C sells the held charm');
	} else A(false, 'Pears keyboard: an affordable charm is on offer', JSON.stringify(v.offers));
	await t.key('KeyO', 300);
	A(/pp-modal/.test(await p.modal()), 'Pears keyboard: O opens Options');
	await t.key('KeyX', 300);
	A(!(await p.modal()), 'Pears keyboard: X closes it');
	await t.key('KeyV', 600);
	A(await waitFor(async () => (await p.view()).level === 2, 3000), 'Pears keyboard: V goes to the next level');
	const before = JSON.stringify((await p.view()).cards);
	A((await t.typeInField()) === 'wasdzxcvqe 1234 bno' && JSON.stringify((await p.view()).cards) === before && !(await p.modal()), 'Pears: typing in a text field moves nothing');
	A(await t.switcher('key'), 'Pears keyboard: ` opens the Games switcher');
	A((await t.mouse()) === 0, 'Pears keyboard: no mouse event was used');
	await t.shot('pears_keyboard');
	A(!t.errors.length, 'Pears keyboard: no page errors', t.errors.slice(0, 3).join(' | '));
	await t.ctx.close();
}
// ---- the controller only ----
{
	const t = await open('/pairofpears/', DESK);
	const p = await pears(t);
	await t.tap(BTN.down);
	A(await ringTo(t, p.focus, 'b-new', [BTN.left, BTN.left, BTN.left, BTN.left, BTN.left, BTN.right, BTN.right, BTN.right, BTN.right], (b) => t.tap(b)), 'Pears pad: the d-pad reaches New Run');
	await t.tap(BTN.confirm);
	A(await waitFor(async () => (await p.view()) && (await p.view()).cards.length === 6, 5000), 'Pears pad: A starts a run');
	await p.idle();
	await t.tap(BTN.right);
	const f1 = await p.focus();
	await t.tap(BTN.confirm);
	A(await waitFor(async () => { const c = (await p.view()).cards.find((x) => 'card:' + x.id === f1); return c && (c.up || c.m); }, 3000), 'Pears pad: A flips the focused card', f1);
	await pearsToShop(t, p);
	await t.tap(BTN.context);
	A(await waitFor(async () => (await p.view()).phase === 'shop', 3000), 'Pears pad: Y continues to the shop');
	await sleep(700);
	await t.page.evaluate(() => { const v = window.__pears.view(); const i = v.offers.findIndex((o) => o && o.kind === 'charm' && o.cost <= v.berries); if (i >= 0) window.__pears.act('buy', i); window.__pears.act('pick', 0); });
	await sleep(200);
	if ((await p.view()).held) {
		await t.tap(BTN.secondary);
		A(await waitFor(async () => !(await p.view()).held && !(await p.view()).charms.some(Boolean), 3000), 'Pears pad: the X button sells the held charm');
	} else A(false, 'Pears pad: (a charm to sell)');
	await t.tap(BTN.start);
	A(/pp-modal/.test(await p.modal()), 'Pears pad: Start opens Options');
	await t.tap(BTN.cancel);
	A(!(await p.modal()), 'Pears pad: B closes it');
	A(await t.switcher('pad'), 'Pears pad: Start + Select open the Games switcher');
	A((await t.mouse()) === 0, 'Pears pad: no mouse event was used');
	A(!t.errors.length, 'Pears pad: no page errors', t.errors.slice(0, 3).join(' | '));
	await t.ctx.close();
}
// ---- touch, both orientations ----
for (const [name, vp] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
	const t = await open('/pairofpears/', vp);
	const p = await pears(t);
	A(await t.touch('.menu-modal .b-new'), `Pears ${name}: New Run is on screen`);
	A(await waitFor(async () => (await p.view()) && (await p.view()).cards.length === 6, 5000), `Pears ${name}: a tap starts a run`);
	await p.idle();
	const id = (await p.view()).cards[0].id;
	for (let i = 0; i < 3 && !(await p.view()).cards.find((c) => c.id === id).up; i++) { await t.touch(`.cards-layer .card[data-id="${id}"]`); await sleep(300); }
	A((await p.view()).cards.find((c) => c.id === id).up, `Pears ${name}: a tap flips a card`);
	const fits = await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.cards-layer .card')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; }));
	A(fits, `Pears ${name}: every card fits the screen`);
	A(await t.touch('.pp-hud .b-options') && /pp-modal/.test(await p.modal()), `Pears ${name}: Options is a tap away`);
	await t.shot('pears_' + name);
	await t.ctx.close();
}

// =========================================================== PokéChess
const CHESS = '/overworld/pokechess.html';
async function chess(t) {
	await waitFor(() => t.page.evaluate(() => window.__pokechess && window.__pokechess.phase === 'player'), 45000);
	await sleep(300);
	return {
		st: () => t.page.evaluate(() => ({ phase: window.__pokechess.phase, cur: window.__pokechess.cursor, sel: window.__pokechess.sel, turn: window.__pokechess.board.turn })),
	};
}
// ---- keyboard only ----
{
	const t = await open(CHESS, DESK);
	const c = await chess(t);
	let s = await c.st();
	A(s.cur.join() === '2,4', 'PokéChess keyboard: the cursor starts on d2', s.cur.join());
	await t.key('KeyD'); await t.key('KeyA');
	await t.page.keyboard.down('Shift'); await t.key('KeyW'); await t.page.keyboard.up('Shift');   // REGRESSION: Shift+W didn't move
	s = await c.st();
	A(s.cur.join() === '3,4', 'PokéChess keyboard: D / A / Shift+W move the cursor (Shift never changes a key)', s.cur.join());
	await t.key('KeyS');
	await t.key('KeyZ');
	s = await c.st();
	A(s.sel && s.sel.join() === '2,4', 'PokéChess keyboard: Z picks the pawn', JSON.stringify(s.sel));
	await t.key('KeyX');
	A(!(await c.st()).sel, 'PokéChess keyboard: X lets go of it');
	await t.key('Enter');
	A((await c.st()).sel, 'PokéChess keyboard: Enter picks too');
	await t.key('Escape', 300);   // REGRESSION: a tap of Esc used to leave the game
	s = await c.st();
	A(!s.sel && new URL(t.page.url()).pathname === CHESS, 'PokéChess keyboard: a tap of Esc is "back" (lets go), and stays in the game', t.page.url());
	await t.key('KeyZ'); await t.key('ArrowUp'); await t.key('KeyW'); await t.key('KeyZ', 300);
	s = await c.st();
	A(s.turn !== 'w' || s.phase !== 'player', 'PokéChess keyboard: Z, up, up, Z plays d2-d4', JSON.stringify(s));
	A(await t.page.evaluate(() => /Backspace/.test(document.querySelector('.hint').textContent)), 'PokéChess: the page hint lists the keys');
	await waitFor(async () => (await c.st()).phase === 'player', 15000);
	const cur = (await c.st()).cur.join();
	A((await t.typeInField()) === 'wasdzxcvqe 1234 bno' && (await c.st()).cur.join() === cur && new URL(t.page.url()).pathname === CHESS, 'PokéChess: typing in a text field moves nothing (Backspace there doesn\'t leave)');
	A(await t.switcher('key'), 'PokéChess keyboard: ` opens the Games switcher');
	const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
	await t.key('Backspace');
	await nav;
	A(new URL(t.page.url()).pathname === '/overworld/', 'PokéChess keyboard: Backspace (Select) leaves to the overworld', t.page.url());
	A((await t.mouse()) === 0, 'PokéChess keyboard: no mouse event was used');
	await t.ctx.close();
}
// ---- the controller only ----
{
	const t = await open(CHESS, DESK);
	const c = await chess(t);
	await t.tap(BTN.up); await t.tap(BTN.right); await t.tap(BTN.left); await t.tap(BTN.down);
	let s = await c.st();
	A(s.cur.join() === '2,4', 'PokéChess pad: the d-pad moves the cursor (up, right, left, down)', s.cur.join());
	await t.tap(BTN.confirm);
	A((await c.st()).sel, 'PokéChess pad: A picks the pawn');
	await t.tap(BTN.cancel);
	A(!(await c.st()).sel, 'PokéChess pad: B lets go');
	await t.tap(BTN.start);
	A((await c.st()).sel, 'PokéChess pad: Start (alone) picks too');
	await t.tap(BTN.cancel);
	// REGRESSION: Start + Select (the Games switcher) used to leave on the Select press
	await t.hold(BTN.start, true); await sleep(60); await t.hold(BTN.select, true); await sleep(200);
	const open1 = await t.page.evaluate(() => window.__mpSwitcher.isOpen());
	await t.hold(BTN.start, false); await t.hold(BTN.select, false); await sleep(600);
	A(open1 && new URL(t.page.url()).pathname === CHESS, 'PokéChess pad: Start + Select open the Games switcher and the game stays', t.page.url());
	A(!(await c.st()).sel, '...and Start didn\'t pick anything under it');
	await t.tap(BTN.cancel);   // close the switcher
	A(!(await t.page.evaluate(() => window.__mpSwitcher.isOpen())), 'PokéChess pad: B closes the switcher');
	// Select first, then Start: still the switcher, still no leave
	await t.hold(BTN.select, true); await sleep(60); await t.hold(BTN.start, true); await sleep(200);
	const open2 = await t.page.evaluate(() => window.__mpSwitcher.isOpen());
	await t.hold(BTN.select, false); await t.hold(BTN.start, false); await sleep(600);
	A(open2 && new URL(t.page.url()).pathname === CHESS, 'PokéChess pad: Select + Start (Select first) open it too, no leave', t.page.url());
	await t.tap(BTN.cancel);
	const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
	await t.tap(BTN.select);
	await nav;
	A(new URL(t.page.url()).pathname === '/overworld/', 'PokéChess pad: Select alone leaves to the overworld', t.page.url());
	A((await t.mouse()) === 0, 'PokéChess pad: no mouse event was used');
	await t.ctx.close();
}
// ---- touch, both orientations ----
for (const [name, vp] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
	const t = await open(CHESS, vp);
	const c = await chess(t);
	const tapCell = async (r, col) => {
		const xy = await t.page.evaluate((r, col) => { const cv = document.getElementById('board'); let b = cv.getBoundingClientRect(); const k = b.width / cv.width; const y0 = b.y + (24 + (8 - r) * 72 + 36) * k; scrollBy(0, y0 - innerHeight / 2); b = cv.getBoundingClientRect(); return [b.x + (24 + (col - 1) * 72 + 36) * k, b.y + (24 + (8 - r) * 72 + 36) * k]; }, r, col);
		await t.page.touchscreen.tap(xy[0], xy[1]); await sleep(200);
	};
	await tapCell(2, 5);
	A(((await c.st()).sel || []).join() === '2,5', `PokéChess ${name}: tapping a pawn picks it`);
	await tapCell(4, 5);
	const s = await c.st();
	A(s.turn !== 'w' || s.phase !== 'player', `PokéChess ${name}: tapping its square plays e2-e4`, JSON.stringify(s));
	A(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `PokéChess ${name}: no horizontal scroll`);
	await t.shot('pokechess_' + name);
	await t.ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
