// micatro_pages_test.mjs — Micatro's Pages screen in the browser (engine/pages.js; ui/board.js renderPages / page_picked,
// ui/replayview.js, ui/pad.js, ui/main.js stateKey). After a Blind is selected the Pages screen opens: 3 Pages, no Back,
// no Skip; the round starts once one is taken.
//   1. live, desktop: Select -> the Pages screen (3 Pages + Choose, no Select / Skip / Skip Blind); Esc doesn't leave it;
//      keys 1-3 raise a Page, Enter takes it; the round's Page shows as a badge under the blind with its text on hover / tap
//   2. phone portrait + landscape (touch): the 3 Pages fit the screen side by side, a tap raises, a second tap takes
//   3. controller: the reticle homes on a Page, the d-pad moves, confirm raises / takes, RB takes the raised one
//   4. save / resume mid-Pages: a reload + Continue lands on the same 3 Pages (frame-exact), and the pick works
//   5. the REPLAY viewer: a Blind's select shows the Pages screen with the run's 3 Pages; stepping onto the pick animates it
//      (the chosen Page rises, the others fade) before the round; step back returns to the Pages; a seek and the scrubber
//      land on it; autoplay holds on it (~1.3 s at 1x) before the pick
//   6. a spectator sees the Pages screen read-only, and the pick animate
//   7. Pages v2 (engine rev 3): a Page with a Round rule shows it as a 4th line (desktop + phone portrait / landscape: every
//      line inside its card, the cards on screen), a Legendary Page its own colour, the round's badge the rule; the "remove a
//      card" prize opens the deck after the cash-out (fits desktop + phone), a click raises a card, Remove takes it out, then
//      the shop
// Screenshots: MICATRO_SHOTS=<dir>.
//   node overworld/tests/micatro_pages_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8771;
const SHOTS = process.env.MICATRO_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'pagereader', friendCode: 'MICPG0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const B = { cancel: 0, confirm: 1, context: 2, secondary: 3, L: 4, R: 5, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

// ---- a Pages run made by the engine in node (the replay + spectator fixture)
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
const { playRun } = await import(pathToFileURL(path.join(ROOT, 'micatro/tests/replay_bot.mjs')).href);
const RPm = await import(pathToFileURL(path.join(ROOT, 'micatro/js/replays.js')).href);
const { Session } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/session.js')).href);
// (Pages v2: Pages on 25% of Blinds — the first seed whose bot run opens the Pages screen at least 3 times)
let RUN = null;
for (let i = 0; i < 200 && !RUN; i++) {
	const r = playRun({ seed: 'PAGESRP' + i, back: 'b_red', stake: 1 }, { seed: 9, maxSteps: 300 });
	if (r.recipe.actions.filter(a => a.type === 'pick_page').length >= 3) RUN = r;
}
if (!RUN) throw new Error('no fixture run with 3 Pages screens');
const walk = (() => {
	const st = Session.stepper(RUN.recipe);
	const views = [st.view()], steps = [null];
	while (!st.done) { const r = st.step(); if (!r || !r.ok) break; views.push(st.view()); steps.push(r.events); }
	return { views, steps };
})();
// the moves that land on the Pages screen (index = actions done)
const PAGE_AT = walk.views.map((v, i) => (v.state === 'PAGES' ? i : -1)).filter(i => i >= 0);
if (PAGE_AT.length < 3) throw new Error('the fixture run must select at least 3 blinds: ' + PAGE_AT.length);
if (RUN.recipe.actions[PAGE_AT[0]].type !== 'pick_page') throw new Error('a Pages screen must be followed by its pick');
// Pages v2 fixtures: a seed whose first offer has a Page with a Round rule and a Legendary Page; one with a "remove a card" prize
const firstOffer = (seed) => { const s = new Session(); s.start({ seed }); s.act({ type: 'select_blind' }); return s.view().pages ? s.view().pages.choices : null; };
/** (Pages v2: 25% of Blinds) the first seed `prefix`N whose first Blind opens the Pages screen */
const pagesSeed = (prefix) => { for (let i = 0; i < 400; i++) if (firstOffer(prefix + i)) return prefix + i; throw new Error('no Pages seed ' + prefix); };
const SEEDS = { ui: pagesSeed('PAGESUI'), ph: pagesSeed('PAGESPH'), pad: pagesSeed('PAGESPAD'), res: pagesSeed('PAGESRES') };
let V2SEED = null, RMSEED = null;
for (let i = 0; i < 3000 && !(V2SEED && RMSEED); i++) {
	const ch = firstOffer('PGV2_' + i);
	if (!ch) continue;
	if (!V2SEED && ch.some(p => p.rule && p.tier !== 5) && ch.some(p => p.tier === 5)) V2SEED = { seed: 'PGV2_' + i, rule: ch.findIndex(p => p.rule && p.tier !== 5), leg: ch.findIndex(p => p.tier === 5) };
	const j = ch.findIndex(p => p.prize.kind === 'remove_card' && !p.rule && !['debuffed', 'destroy'].includes(p.effect));
	if (!RMSEED && j >= 0) RMSEED = { seed: 'PGV2_' + i, index: j };
}
if (!V2SEED || !RMSEED) throw new Error('no Pages v2 fixture seed');
const SERVER = { ab000001: { code: await RPm.packRecipe(RUN.recipe), meta: RPm.buildMeta(RUN.recipe, walk.views[walk.views.length - 1], { username: 'bob' }), by: 'bob', when: Date.now() } };
let SPEC = null;

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE };
		const a = body.action;
		if (a === 'micatro-replay-get') { const r = SERVER[body.id]; out = r ? { code: r.code, meta: r.meta, by: r.by, when: r.when } : { error: 'not found' }; }
		else if (a === 'micatro-state') {
			out = !SPEC ? { snapshot: null, seq: 0 } : body.seq === SPEC.seq ? { unchanged: true, seq: SPEC.seq, label: 'Ante 1', watchers: 1, watcherNames: ['pagereader'] }
				: { snapshot: SPEC.snapshot, seq: SPEC.seq, label: 'Ante 1', room: 'u:bob', over: false, won: false, watchers: 1, watcherNames: ['pagereader'] };
		} else if (a === 'micatro-run-get') out = { rev: 0, run: null, ended: [] };
		else if (a === 'chat-get') out = { messages: [] };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

// in the page: the Pages screen as drawn
const LOOK = () => {
	const M = window.__micatro, Bd = M.board;
	const cards = [...document.querySelectorAll('.overlay .page-card')];
	const vis = (sel) => [...document.querySelectorAll(sel)].some(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden');
	const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
	const badge = document.querySelector('.hb-page');
	return {
		state: Bd.view && Bd.view.state, n: cards.length, names: cards.map(c => c.querySelector('.pg-name').textContent),
		text: cards.map(c => c.textContent), sel: cards.findIndex(c => c.classList.contains('sel')),
		picked: cards.findIndex(c => c.classList.contains('picked')), passed: cards.filter(c => c.classList.contains('passed')).length,
		rects: cards.map(r), vw: innerWidth, vh: innerHeight,
		choose: !!document.querySelector('.overlay .b-pick-page'), chooseOn: !!document.querySelector('.overlay .b-pick-page:not(:disabled)'),
		back: vis('.overlay .b-select') || vis('.overlay .b-skip') || vis('.overlay .b-skip-pack') || vis('.overlay .blind-row'),
		hudName: (document.querySelector('.hb-name') || {}).textContent,
		badge: !!(badge && !badge.hidden), badgeText: badge ? badge.textContent : '',
		idle: M.idle(), index: M.replay && M.replay.ready ? M.replay.index : null, t: performance.now(),
	};
};
const look = (page) => page.evaluate((src) => eval('(' + src + ')')(), LOOK.toString());
const startSampling = (page) => page.evaluate((src) => {
	const f = eval('(' + src + ')'); window.__samples = []; window.__sampling = true;
	const tick = () => { if (!window.__sampling) return; try { window.__samples.push(f()); } catch (e) { } requestAnimationFrame(tick); }; tick();
}, LOOK.toString());
const stopSampling = (page) => page.evaluate(() => { window.__sampling = false; return window.__samples; });
const descNames = (v) => v.pages.choices.map(p => p.desc.name);
const noOverlap = (rs) => rs.every((a, i) => rs.every((b, j) => i === j || a.r <= b.l + 1 || b.r <= a.l + 1 || a.b <= b.t + 1 || b.b <= a.t + 1));
const inView = (s) => s.rects.every(r => r.l >= -1 && r.t >= -1 && r.r <= s.vw + 1 && r.b <= s.vh + 1);

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const newPage = async ({ speed = 4, width = 1600, height = 900, touch = false, pad = false } = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width, height, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st, speed, pad) => {
			if (pad) {
				const p = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
				window.__owFakePads = [p];
				let polls = 0;
				Object.defineProperty(p, 'connected', { get() { polls++; return true; }, enumerable: true });
				const until = (f, ms = 10000) => new Promise((r) => { const t0 = performance.now(); const k = () => (f() || performance.now() - t0 > ms ? r() : setTimeout(k, 4)); k(); });
				const set = (b, on) => { p.buttons[b] = on ? { pressed: true, value: 1 } : { pressed: false, value: 0 }; };
				window.__padTap = async (b, hold = 70) => { const t0 = performance.now(); set(b, true); const n = polls; await until(() => polls > n && performance.now() - t0 >= hold); set(b, false); const m = polls; await until(() => polls > m + 1); };
			}
			try {
				if (!sessionStorage.getItem('pg_init')) {
					sessionStorage.setItem('pg_init', '1');
					localStorage.setItem('micatro_speed', String(speed)); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
					localStorage.removeItem('micatro_run_v1');
				}
				localStorage.setItem('magepunk_mp_token_v1', 'pg-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { }
		}, STATE, speed, pad);
		const go = async (url) => {
			await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
			await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		};
		return { ctx, page, errors, go };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const shot = async (page, name) => { if (SHOTS) { await sleep(500); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const V = (page) => page.evaluate(() => window.__micatro.view());
	const onPages = (page) => waitFor(async () => { const s = await look(page); return s.state === 'PAGES' && s.n === 3 && s.idle; }, 20000);
	const newRun = async (page, seed) => { await page.evaluate((seed) => window.__micatro.newRun({ seed, back: 'b_red', stake: 1 }), seed); await idle(page); };

	// ======================================================= 1. live, desktop: keys + mouse
	{
		const { page, errors, go } = await newPage();
		await go('/micatro/');
		await newRun(page, SEEDS.ui);
		A((await V(page)).state === 'BLIND_SELECT', 'live: the run starts on the blind choice');
		await page.evaluate(() => document.querySelector('.overlay .b-select').click());
		A(await onPages(page), 'live: Select opens the Pages screen');
		let s = await look(page);
		const v = await V(page);
		A(s.n === 3 && JSON.stringify(s.names) === JSON.stringify(descNames(v)), 'live: the 3 Pages of the view', JSON.stringify(s.names));
		A(s.text.every((t) => /Required score/.test(t) && /Prize:|No prize/.test(t)), 'live: each Page says its effect, its required score and its prize (or "No prize") in words', s.text[0]);
		A(s.chooseOn && !s.back, 'live: Choose, and no Select / Skip / Skip Blind (no going back)', JSON.stringify({ choose: s.chooseOn, back: s.back }));
		A(s.hudName === 'Choose a Page' && s.sel === 0, 'live: the HUD says "Choose a Page"; the first Page is raised', JSON.stringify(s));
		await shot(page, 'pages_desktop.png');
		// Esc / S do nothing to the screen (Esc opens the options; closing them is back here)
		await page.keyboard.press('s'); await sleep(200);
		await page.keyboard.press('Escape'); await sleep(300);
		await page.keyboard.press('Escape'); await sleep(300);
		s = await look(page);
		A(s.state === 'PAGES' && s.n === 3, 'live: Esc / S leave the player on the Pages screen', JSON.stringify(s.state));
		const r = await page.evaluate(() => [window.__micatro.act({ type: 'skip_blind' }), window.__micatro.act({ type: 'select_blind' })]);
		A(r.every(x => !x.ok), 'live: the engine refuses skip / select on the Pages screen');
		await page.keyboard.press('3'); await sleep(150);
		s = await look(page);
		A(s.sel === 2 && s.state === 'PAGES', 'live: key 3 raises the third Page', JSON.stringify(s.sel));
		await page.keyboard.press('2'); await sleep(150);
		A((await look(page)).sel === 1, 'live: key 2 raises the second');
		const want = (await V(page)).pages.choices[1];
		await startSampling(page);
		await page.keyboard.press('Enter');
		await waitFor(async () => (await V(page)).state === 'SELECTING_HAND', 10000);
		await idle(page); await sleep(200);
		const smp = await stopSampling(page);
		A(smp.some(x => x.picked === 1 && x.passed === 2), 'live: the pick animates (the chosen Page rises, the others fade)');
		const after = await V(page);
		A(after.state === 'SELECTING_HAND' && after.page && JSON.stringify(after.page.desc) === JSON.stringify(want.desc), 'live: Enter takes it — the round starts with that Page', JSON.stringify(after.page && after.page.desc));
		s = await look(page);
		A(s.badge && /Page/.test(s.badgeText) && s.n === 0, 'live: the round shows its Page under the blind', s.badgeText);
		const req = await page.evaluate(() => document.querySelector('.hb-target').textContent);
		A(req.replace(/,/g, '') === String(after.blind.chips), 'live: the blind shows the Page\'s required score', req + ' vs ' + after.blind.chips);
		await page.hover('.hb-page'); await sleep(250);
		const tip = await page.evaluate(() => { const t = document.querySelector('.tip, .tooltip, #tip'); return t && getComputedStyle(t).display !== 'none' ? t.textContent : ''; });
		A(/Required score/.test(tip) && /prize/i.test(tip), 'live: hovering the badge shows the Page\'s text', tip.slice(0, 120));
		await shot(page, 'pages_round_badge.png');
		A(errors.length === 0, 'live: no page errors', errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}

	// ======================================================= 2. phones: portrait + landscape, touch
	for (const vp of [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
		const { page, errors, go } = await newPage({ width: vp.width, height: vp.height, touch: true });
		await go('/micatro/');
		await newRun(page, SEEDS.ph);
		await page.evaluate(() => document.querySelector('.overlay .b-select').click());
		A(await onPages(page), `${vp.name}: the Pages screen`);
		await sleep(600);
		const s = await look(page);
		A(inView(s) && noOverlap(s.rects), `${vp.name}: the 3 Pages fit the screen, side by side`, JSON.stringify(s.rects.map(r => [Math.round(r.l), Math.round(r.t), Math.round(r.r), Math.round(r.b)])) + ` vw ${s.vw}x${s.vh}`);
		const chooseBox = await page.evaluate(() => { const b = document.querySelector('.b-pick-page').getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; });
		A(chooseBox.b <= vp.height + 1 && chooseBox.r <= vp.width + 1 && s.rects.every(r => r.b <= chooseBox.t + 1), `${vp.name}: Choose sits under the Pages, on screen`, JSON.stringify(chooseBox));
		await shot(page, `pages_phone_${vp.name}.png`);
		const c = s.rects[2];
		await page.touchscreen.tap((c.l + c.r) / 2, (c.t + c.b) / 2); await sleep(250);
		A((await look(page)).sel === 2 && (await V(page)).state === 'PAGES', `${vp.name}: a tap raises a Page (not taken yet)`);
		await page.touchscreen.tap((c.l + c.r) / 2, (c.t + c.b) / 2 - 20);
		A(await waitFor(async () => (await V(page)).state === 'SELECTING_HAND', 10000), `${vp.name}: a second tap takes it`);
		await idle(page);
		await shot(page, `pages_phone_${vp.name}_round.png`);
		A(errors.length === 0, `${vp.name}: no page errors`, errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}

	// ======================================================= 3. controller
	{
		const { page, errors, go } = await newPage({ pad: true });
		await go('/micatro/');
		await waitFor(() => page.evaluate(() => !!window.__micatroPad), 10000);
		await newRun(page, SEEDS.pad);
		const tap = async (b) => { await page.evaluate((b) => window.__padTap(b), b); await sleep(160); };
		await tap(B.right); // (the first press only shows the reticle)
		await tap(B.L);     // LB: Select
		A(await onPages(page), 'pad: LB selects the blind -> the Pages screen');
		await tap(B.right); await sleep(200);
		let f = await page.evaluate(() => { const x = window.__micatroPad.focus; return x && x.el ? x.el.dataset.page || x.cls : null; });
		A(f === '0' || f === '1', 'pad: the reticle is on a Page', String(f));
		// walk right to the third Page
		for (let i = 0; i < 4; i++) { f = await page.evaluate(() => { const x = window.__micatroPad.focus; return x && x.el ? x.el.dataset.page : null; }); if (f === '2') break; await tap(B.right); }
		A(f === '2', 'pad: the d-pad moves along the Pages', String(f));
		await tap(B.confirm);
		A((await look(page)).sel === 2 && (await V(page)).state === 'PAGES', 'pad: confirm raises it');
		await tap(B.left);
		await tap(B.cancel);
		A((await V(page)).state === 'PAGES', 'pad: cancel doesn\'t leave the Pages screen');
		const wantPad = (await V(page)).pages.choices[2].desc;
		await tap(B.R);   // RB: Choose
		A(await waitFor(async () => (await V(page)).state === 'SELECTING_HAND', 10000), 'pad: RB takes the raised Page');
		const v = await V(page);
		A(v.page && JSON.stringify(v.page.desc) === JSON.stringify(wantPad), 'pad: the third Page is the round\'s');
		A(errors.length === 0, 'pad: no page errors', errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}

	// ======================================================= 4. save / resume mid-Pages
	{
		const { page, errors, go } = await newPage();
		await go('/micatro/');
		await newRun(page, SEEDS.res);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		A(await onPages(page), 'resume: on the Pages screen');
		const before = (await V(page)).pages;
		await page.keyboard.press('3'); await sleep(100);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready && document.querySelector('.b-continue'))), 30000);
		await page.evaluate(() => document.querySelector('.b-continue').click());
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-resume-continue') || (!!window.__micatro.session && !!window.__micatro.view())), 30000);
		if (await page.evaluate(() => !!document.querySelector('.b-resume-continue'))) await page.evaluate(() => document.querySelector('.b-resume-continue').click());
		A(await onPages(page), 'resume: Continue lands back on the Pages screen');
		const after = (await V(page)).pages;
		A(JSON.stringify(after) === JSON.stringify(before), 'resume: the same 3 Pages (frame-exact)');
		await shot(page, 'pages_resumed.png');
		await page.evaluate(() => document.querySelector('.overlay .b-pick-page').click());
		A(await waitFor(async () => (await V(page)).state === 'SELECTING_HAND', 10000), 'resume: and the pick works');
		A(errors.length === 0, 'resume: no page errors', errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}

	// ======================================================= 5. the replay viewer
	{
		const { page, errors, go } = await newPage({ speed: 1 });
		await go('/micatro/?replay=ab000001&autoplay=0');
		A(await waitFor(() => page.evaluate(() => !!(window.__micatro.replay && window.__micatro.replay.ready)), 60000), 'replay: loads');
		const seek = async (i) => { await page.evaluate((i) => window.__micatro.replay.seekTo(i, { keepPlaying: false }), i); await idle(page); await sleep(200); };
		for (const at of PAGE_AT.slice(0, 3)) {
			const tag = `replay: blind ${PAGE_AT.indexOf(at) + 1} (move ${at})`;
			// step onto the select: the Pages screen with the run's 3 Pages
			await seek(at - 1);
			await page.evaluate(() => window.__micatro.replay.stepForward());
			await idle(page); await sleep(200);
			let s = await look(page);
			A(s.state === 'PAGES' && s.index === at && JSON.stringify(s.names) === JSON.stringify(descNames(walk.views[at])) && JSON.stringify(s.text.map(t => t.length)) !== '[]', `${tag}: stepping onto the select shows the run's 3 Pages`, JSON.stringify(s.names));
			A(!s.chooseOn, `${tag}: read-only (no Choose to press)`);
			if (at === PAGE_AT[0]) await shot(page, 'pages_replay.png');
			// the pick, animated
			const want = RUN.recipe.actions[at].index;
			await startSampling(page);
			await page.evaluate(() => window.__micatro.replay.stepForward());
			await idle(page); await sleep(150);
			const smp = await stopSampling(page);
			A(smp.some(x => x.picked === want && x.passed === 2), `${tag}: stepping onto the pick animates Page ${want + 1}`, JSON.stringify(smp.map(x => x.picked).filter(x => x >= 0).slice(0, 3)));
			s = await look(page);
			A(s.state === 'SELECTING_HAND' && s.badge, `${tag}: then the round, with its Page`, s.state);
			// back
			await page.evaluate(() => window.__micatro.replay.stepBack());
			await idle(page); await sleep(200);
			s = await look(page);
			A(s.state === 'PAGES' && s.index === at && s.n === 3, `${tag}: a step back returns to the Pages screen`, JSON.stringify({ st: s.state, i: s.index }));
			// seek + scrub
			await seek(0); await seek(at);
			s = await look(page);
			A(s.state === 'PAGES' && s.n === 3 && JSON.stringify(s.names) === JSON.stringify(descNames(walk.views[at])), `${tag}: a seek lands on it`);
			await seek(0);
			await page.evaluate((i) => { const r = document.querySelector('.rb-range'); r.value = String(i); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }, at);
			await idle(page); await sleep(250);
			s = await look(page);
			A(s.state === 'PAGES' && s.n === 3 && s.index === at, `${tag}: scrubbing to it shows it`, JSON.stringify({ st: s.state, i: s.index }));
		}
		// autoplay (1x) holds on the Pages screen before the pick
		const at = PAGE_AT[1];
		await seek(at - 1);
		await startSampling(page);
		await page.evaluate(() => window.__micatro.replay.play());
		await waitFor(() => page.evaluate((i) => window.__micatro.replay.index > i, at), 20000);
		await sleep(300);
		await page.evaluate(() => window.__micatro.replay.pause());
		const smp = await stopSampling(page);
		const settled = smp.find(x => x.index === at && x.idle && x.state === 'PAGES' && x.n === 3);
		const left = smp.find(x => x.index > at);
		const dwell = settled && left ? left.t - settled.t : -1;
		A(dwell >= 1000, 'replay: autoplay holds on the Pages screen (~1.3 s at 1x) before the pick', `${Math.round(dwell)} ms`);
		A(smp.some(x => x.picked >= 0), 'replay: autoplay animates the pick');
		A(errors.length === 0, 'replay: no page errors', errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}

	// ======================================================= 6. a spectator
	{
		const at = PAGE_AT[0];
		SPEC = { seq: 1, snapshot: { view: walk.views[at - 1], events: [] } };
		const { page, errors, go } = await newPage({ speed: 1 });
		await go('/micatro/?spectate=bob');
		await waitFor(async () => (await look(page)).state === walk.views[at - 1].state, 20000);
		SPEC = { seq: 2, snapshot: { view: walk.views[at], events: walk.steps[at] } };
		A(await onPages(page), 'spectate: the runner\'s Pages screen');
		const s = await look(page);
		A(JSON.stringify(s.names) === JSON.stringify(descNames(walk.views[at])) && !s.chooseOn, 'spectate: their 3 Pages, read-only', JSON.stringify(s.names));
		await shot(page, 'pages_spectate.png');
		await startSampling(page);
		SPEC = { seq: 3, snapshot: { view: walk.views[at + 1], events: walk.steps[at + 1] } };
		await waitFor(async () => (await look(page)).state === 'SELECTING_HAND', 20000);
		const smp = await stopSampling(page);
		A(smp.some(x => x.picked === RUN.recipe.actions[at].index), 'spectate: the pick animates for the watcher too', JSON.stringify(smp.map(x => x.picked).filter(x => x >= 0).slice(0, 2)));
		A(errors.length === 0, 'spectate: no page errors', errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}

	// ======================================================= 7. Pages v2: Round rules, Legendary, the remove screen
	const LOOK2 = () => {
		const cards = [...document.querySelectorAll('.overlay .page-card')];
		const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
		// a line is readable when it sits inside its card and its text isn't clipped
		const inside = (c) => [...c.children].every(x => { const a = r(x), b = r(c); return a.t >= b.t - 1 && a.b <= b.b + 1 && a.l >= b.l - 1 && a.r <= b.r + 1 && x.scrollHeight <= x.clientHeight + 2 && x.scrollWidth <= x.clientWidth + 2; });
		return { cards: cards.map(c => ({ cls: c.className, name: c.querySelector('.pg-name').textContent, rule: (c.querySelector('.pg-rule') || {}).textContent || '', inside: inside(c), rect: r(c), font: parseFloat(getComputedStyle(c.querySelector('.pg-req')).fontSize) })), vw: innerWidth, vh: innerHeight };
	};
	const look2 = (page) => page.evaluate((src) => eval('(' + src + ')')(), LOOK2.toString());
	const plain = (t) => String(t || '').replace(/\{[^}]*\}/g, '');
	for (const vp of [{ name: 'desktop', width: 1600, height: 900 }, { name: 'phone portrait', file: 'phone_portrait', width: 390, height: 844, touch: true }, { name: 'phone landscape', file: 'phone_landscape', width: 844, height: 390, touch: true }]) {
		const tag = 'v2 ' + vp.name;
		const { page, errors, go } = await newPage({ width: vp.width, height: vp.height, touch: !!vp.touch });
		await go('/micatro/');
		await newRun(page, V2SEED.seed);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		A(await onPages(page), `${tag}: the Pages screen`);
		await sleep(700);
		const v = await V(page);
		const s = await look2(page);
		const want = v.pages.choices[V2SEED.rule];
		A(s.cards[V2SEED.rule].rule && plain(want.desc.lines[3]) === s.cards[V2SEED.rule].rule && /^Round rule: /.test(s.cards[V2SEED.rule].rule) && s.cards[V2SEED.rule].cls.includes('has-rule'), `${tag}: a Page with a Round rule shows it as a 4th line`, s.cards[V2SEED.rule].rule);
		A(s.cards[V2SEED.leg].name === 'Legendary Page' && s.cards[V2SEED.leg].cls.includes('tier-5'), `${tag}: a Legendary Page, in its own colour`, s.cards[V2SEED.leg].name);
		A(s.cards.every(c => c.inside), `${tag}: every line inside its card, nothing clipped`, JSON.stringify(s.cards.map(c => c.inside)));
		A(s.cards.every(c => c.rect.l >= -1 && c.rect.t >= -1 && c.rect.r <= s.vw + 1 && c.rect.b <= s.vh + 1) && noOverlap(s.cards.map(c => c.rect)), `${tag}: the 3 Pages on screen, side by side`);
		await shot(page, `pages2_offer_${vp.file || vp.name}.png`);
		await page.evaluate((i) => window.__micatro.act({ type: 'pick_page', index: i }), V2SEED.rule);
		await waitFor(async () => (await V(page)).state === 'SELECTING_HAND', 10000); await idle(page); await sleep(300);
		const badge = await page.evaluate(() => { const b = document.querySelector('.hb-page'); const r = b.querySelector('.hp-rule'); return { shown: !b.hidden, rule: r ? r.textContent : '' }; });
		A(badge.shown && badge.rule === plain(want.desc.lines[3]), `${tag}: the round's badge shows the Round rule`, badge.rule);
		const vr = await V(page);
		A(vr.page && vr.page.rule === want.rule, `${tag}: the round plays the rule`, vr.page && vr.page.rule);
		await shot(page, `pages2_round_${vp.file || vp.name}.png`);
		A(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}
	for (const vp of [{ name: 'desktop', width: 1600, height: 900 }, { name: 'phone portrait', file: 'phone_portrait', width: 390, height: 844, touch: true }, { name: 'phone landscape', file: 'phone_landscape', width: 844, height: 390, touch: true }]) {
		const tag = 'v2 remove ' + vp.name;
		const { page, errors, go } = await newPage({ width: vp.width, height: vp.height, touch: !!vp.touch });
		await go('/micatro/');
		await newRun(page, RMSEED.seed);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		A(await onPages(page), `${tag}: the Pages screen`);
		await page.evaluate((i) => window.__micatro.act({ type: 'pick_page', index: i }), RMSEED.index);
		await waitFor(async () => (await V(page)).state === 'SELECTING_HAND', 10000); await idle(page);
		// (the test wins this Blind with any hand: its requirement set to 1 in the page's engine)
		await page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.blind.chips = 1; });
		await page.evaluate(() => { const v = window.__micatro.view(); window.__micatro.act({ type: 'highlight', ids: [v.areas.hand[0].id] }); return window.__micatro.act({ type: 'play' }); });
		A(await waitFor(async () => (await V(page)).state === 'ROUND_EVAL', 20000), `${tag}: the Blind is beaten`);
		await idle(page); await sleep(300);
		const prize = await page.evaluate(() => [...document.querySelectorAll('.eval-row')].map(r => r.textContent).find(t => /Page prize/.test(t)) || '');
		A(/Remove a card/.test(prize), `${tag}: the cash-out names the prize`, prize);
		await page.evaluate(() => document.querySelector('.b-cashout').click());
		A(await waitFor(async () => (await V(page)).state === 'PAGE_REMOVE', 20000), `${tag}: after the cash-out, the remove screen`);
		await idle(page); await sleep(500);
		const rm = await page.evaluate(() => {
			const cs = [...document.querySelectorAll('.overlay .premove-card')];
			const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
			const go = document.querySelector('.overlay .b-page-remove');
			return { n: cs.length, rects: cs.map(r), go: go ? r(go) : null, goOn: !!(go && !go.disabled), vw: innerWidth, vh: innerHeight, hud: document.querySelector('.hb-name').textContent, skip: !!document.querySelector('.overlay .b-skip-pack, .overlay .b-next') };
		});
		A(rm.n === 52 && rm.hud === 'Remove a card', `${tag}: the whole deck (52 cards)`, rm.n);
		A(rm.rects.every(x => x.l >= -1 && x.t >= -1 && x.r <= rm.vw + 1 && x.b <= rm.vh + 1) && rm.go && rm.go.b <= rm.vh + 1 && rm.go.r <= rm.vw + 1, `${tag}: every card and Remove on screen`, JSON.stringify(rm.go) + ` ${rm.vw}x${rm.vh}`);
		A(!rm.goOn && !rm.skip, `${tag}: Remove waits for a card; no Skip`);
		await shot(page, `pages2_remove_${vp.file || vp.name}.png`);
		const pickAt = rm.rects[5];
		if (vp.touch) await page.touchscreen.tap((pickAt.l + pickAt.r) / 2, pickAt.t + 8); else await page.mouse.click((pickAt.l + pickAt.r) / 2, pickAt.t + 8);
		await sleep(250);
		const sel = await page.evaluate(() => { const c = document.querySelector('.overlay .premove-card.sel'); return c ? +c.dataset.card : null; });
		A(sel != null && await page.evaluate(() => !document.querySelector('.overlay .b-page-remove').disabled), `${tag}: a ${vp.touch ? 'tap' : 'click'} raises a card`);
		await shot(page, `pages2_remove_${vp.file || vp.name}_raised.png`);
		await page.evaluate(() => document.querySelector('.overlay .b-page-remove').click());
		A(await waitFor(async () => (await V(page)).state === 'SHOP', 20000), `${tag}: Remove -> the shop`);
		const after = await V(page);
		A(after.deck_list.length === 51, `${tag}: the card is gone from the deck`, after.deck_list.length);
		A(errors.length === 0, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}
} catch (e) {
	fail++; console.log('FAIL: threw', e && e.stack || e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
