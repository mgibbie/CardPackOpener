// rainbowpets_ui_test.mjs — RAINBOW PETS in a real browser, as a GUEST (every account call refused): the menu, a Quick
// Match set up through the screens, and a turn played four ways: with the MOUSE on a desktop, by TOUCH on a phone held
// upright and on its side, with the KEYBOARD only (arrows + Z / X / C / Enter) and with a CONTROLLER only (d-pad + A / B /
// X / Start). Then the Newspaper question, a win paying stars, the replay of it, and a reload resuming the match.
//   node overworld/tests/rainbowpets_ui_test.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as R from '../../rainbowpets/js/rules.js';
import { QUICK_WIN } from '../../rainbowpets/js/solo.js';
import * as SVm from '../../rainbowpets/js/save.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 9841;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { for await (const _ of req) { /* drain */ } res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"not logged in"}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

// a seed where I (seat a) go first, with my Sunset (red + yellow = orange) able to move at once
const MINE = ['p10', 'p3', 'p5', 'p4'], THEIRS = ['p2', 'p6', 'p11'];
let SEED = null;
for (let i = 0; i < 200 && !SEED; i++) { const S = R.newMatch({ seed: 'ui' + i, seats: [{ pets: MINE }, { pets: THEIRS, cpu: 'easy' }] }); if (S.cur === 0 && S.players[0].hand.some((c) => S.cards[c].c !== 'N')) SEED = 'ui' + i; }
const SETUP = { seed: SEED, seats: [{ name: 'You', pets: MINE }, { name: 'Pip', pets: THEIRS, cpu: 'easy' }] };

let browser;
async function open(vp, { pad = false } = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.evaluateOnNewDocument((pad) => {
		try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch { /* ignore */ }
		const p = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
		window.__owFakePads = pad ? [p] : []; window.__pad = p;
		window.__mouse = 0;
		for (const t of ['mousedown', 'click']) addEventListener(t, (e) => { if (e.isTrusted && e.pointerType !== 'touch' && !(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) window.__mouse++; }, true);
	}, pad);
	await page.goto(`http://localhost:${PORT}/rainbowpets/`, { waitUntil: 'domcontentloaded' });
	const t = { ctx, page, errors };
	t.ready = () => waitFor(() => page.evaluate(() => !!(window.__rpets && window.__rpets.ready)), 25000);
	t.V = () => page.evaluate(() => { const V = window.__rpets.view(); return V && { cur: V.cur, me: V.me, used: V.used, n: V.n, turn: V.turn, pending: V.pending, over: V.over, hand: V.players[0].hand, canvas: V.canvas, palette: V.players[0].palette, pets: Object.fromEntries(Object.entries(V.pets).map(([k, p]) => [k, { colors: p.colors, stacks: p.stacks }])) }; });
	t.has = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; }, sel);
	t.center = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
	t.click = async (sel) => { const c = await t.center(sel); if (!c) return false; await sleep(60); const c2 = await t.center(sel); if (vp.hasTouch) await page.touchscreen.tap(c2[0], c2[1]); else await page.mouse.click(c2[0], c2[1]); await sleep(250); return true; };
	t.key = async (k, ms = 120) => { await page.keyboard.press(k); await sleep(ms); };
	t.focused = () => page.evaluate(() => { const e = document.querySelector('[data-focus]'); return e ? { cls: e.className, card: e.dataset.card || null, sym: e.dataset.sym || null, uid: e.dataset.uid || null, target: e.classList.contains('is-target'), text: e.textContent.trim().slice(0, 30) } : null; });
	t.hold = (b, on) => page.evaluate((b, on) => { window.__pad.buttons[b] = { pressed: on, value: on ? 1 : 0, touched: on }; window.__pad.timestamp++; }, b, on);
	t.frames = () => page.evaluate(() => Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 1000))])).catch(() => {});
	t.tap = async (b) => { await t.hold(b, true); await sleep(90); await t.frames(); await t.hold(b, false); await t.frames(); await sleep(160); };
	/** Move the focus ring (keys, or the pad's d-pad) until `want(focused)` holds; then press confirm. */
	t.walkTo = async (want, how = 'key') => {
		const DIRS = how === 'pad' ? [15, 13, 14, 12] : ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
		const step = (d) => (how === 'pad' ? t.tap(d) : t.key(d, 60));
		for (let sweep = 0; sweep < 4; sweep++) {
			for (const d of [DIRS[3], DIRS[3], DIRS[3], DIRS[3], DIRS[3], DIRS[3], DIRS[2], DIRS[2], DIRS[2], DIRS[2]]) await step(d);   // (to the top-left corner)
			for (let row = 0; row < 16; row++) {
				for (let col = 0; col < 10; col++) { const f = await t.focused(); if (f && want(f)) return true; const before = JSON.stringify(f); await step(DIRS[0]); if (JSON.stringify(await t.focused()) === before) break; }
				for (let col = 0; col < 10; col++) await step(DIRS[2]);
				const before = JSON.stringify(await t.focused()); await step(DIRS[1]);
				if (JSON.stringify(await t.focused()) === before) break;
			}
		}
		return false;
	};
	return t;
}
const start = (t) => t.page.evaluate((setup) => { localStorage.removeItem('magepunk_rpets_v1'); window.__rpets.startLocal(setup, { mode: 'quick' }); }, SETUP);
const myTurnAgain = (t, n0) => waitFor(async () => { const v = await t.V(); return v && v.cur === 'a' && v.n > n0 && !v.pending; }, 20000);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
	A(!!SEED, 'a seed where I move first: ' + SEED);

	// ---------------- the menu, and a Quick Match through the screens (mouse, desktop)
	{
		const t = await open({ width: 1280, height: 760, deviceScaleFactor: 1 });
		A(await t.ready(), 'the page boots as a guest');
		const labels = await t.page.evaluate(() => [...document.querySelectorAll('.rp-menu .btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
		A(labels.length === 5 && /^Quick Match/.test(labels[0]) && /^Painter's Path/.test(labels[1]) && /^Play Online.*sign in/.test(labels[2]) && /^Replays/.test(labels[3]) && /^How to Play/.test(labels[4]), 'the menu: Quick Match, Painter\'s Path, Play Online (sign in first), Replays, How to Play', labels);
		A(await t.page.evaluate(() => /Daniel Espinoza/.test(document.body.textContent)), 'it credits Daniel Espinoza');
		await t.click('.b-quick');
		A(await t.has('.rp-picker') && (await t.page.evaluate(() => document.querySelectorAll('.rp-pick').length)) === 42, 'Quick Match: the 42 Pets to pick from');
		await t.click('.b-random');
		A(await t.page.evaluate(() => document.querySelectorAll('.rp-pick.is-sel').length === 4 && !document.querySelector('.b-start').disabled), 'Random picks 4; Start is ready');
		await t.click('.b-start');
		A(await waitFor(() => t.has('.rp-canvas'), 4000) && (await t.page.evaluate(() => document.querySelectorAll('.rp-cspot').length)) === 6, 'the table: the Canvas with its 6 spots');
		A(await t.page.evaluate(() => window.__rpets.view().players.length === 2 && window.__rpets.view().players[1].cpu === 'normal'), 'against 1 computer painter (normal), as chosen');

		// ---------------- a turn with the mouse: move, paint, throw (3 actions end the turn), the computer plays
		await start(t); await sleep(400);
		let v = await t.V();
		A(v.cur === 'a' && v.n === 0, 'my turn first');
		await t.click('.rp-pet[data-uid="a0"]');
		A(await t.has('.b-move'), 'clicking Sunset (red + yellow = orange) offers Move to the Canvas');
		await t.click('.b-move');
		v = await t.V();
		A(v.used.move && v.canvas.O.join() === 'a0', 'Move: Sunset is on the orange spot');
		const card = v.hand.find((c) => c.c !== 'N');
		await t.click(`.rp-card[data-card="${card.id}"]`);
		const targets = await t.page.evaluate(() => [...document.querySelectorAll('.rp-sym.is-target')].map((s) => s.dataset.sym));
		A(targets.length > 0 && await t.page.evaluate(() => /color symbol/.test(document.querySelector('.rp-hint').textContent)), 'a card picked: the symbols it can be painted on are ringed, and the hint says so', targets);
		const tgt = targets.find((x) => x.startsWith('a1')) || targets[0];
		await t.click(`.rp-sym[data-sym="${tgt}"]`);
		v = await t.V();
		const [pu, ps] = tgt.split(':');
		A(v.used.paint && v.pets[pu].stacks[+ps] === 1 && v.pets[pu].colors[+ps] === card.c, `Paint: the ${card.c} card is on that symbol`, v.pets[pu]);
		const srcs = await t.page.evaluate(() => [...document.querySelectorAll('.rp-sym.is-src')].map((s) => s.dataset.sym));
		if (srcs.length) {
			await t.click(`.rp-sym[data-sym="${srcs[0]}"]`);
			const tt = await t.page.evaluate(() => [...document.querySelectorAll('.rp-sym.is-target')].map((s) => s.dataset.sym));
			A(tt.length > 0, 'a loaded symbol picked: where it can be thrown is ringed', tt);
			const n0 = (await t.V()).n;
			await t.click(`.rp-sym[data-sym="${tt[0]}"]`);
			A(await waitFor(async () => { const x = await t.V(); return x.n > n0 && (x.cur !== 'a' || x.used.throw); }, 4000), 'Throw: thrown; all 3 actions used, the turn passes');
		} else A(false, 'after painting, a loaded symbol can throw');
		const n1 = (await t.V()).n;
		A(await myTurnAgain(t, n1 - 1), 'the computer plays its turn, and it is mine again');
		// pass with C
		const n2 = (await t.V()).n;
		await t.key('KeyC', 300);
		A(await waitFor(async () => (await t.V()).n > n2, 3000), 'C passes my turn');
		A(!t.errors.length, 'no page errors (mouse)', t.errors.slice(0, 3));
		await t.ctx.close();
	}

	// ---------------- Tag-Team (2v2) against the computer: the screens, a partner's Pets played as mine, 1 move a team, the team's win
	{
		const t = await open({ width: 1280, height: 760, deviceScaleFactor: 1 });
		await t.ready();
		await t.click('.b-quick');
		const tagB = await t.page.evaluate(() => { const b = [...document.querySelectorAll('.rp-chooser .btn')].find((x) => /Tag-Team 2v2/.test(x.textContent)); if (b) b.classList.add('t-tag'); return !!b; });
		A(tagB, 'Quick Match offers Tag-Team 2v2');
		await t.click('.t-tag'); await t.click('.b-random'); await t.click('.b-start');
		A(await waitFor(() => t.has('.rp-canvas'), 4000) && await t.page.evaluate(() => { const V = window.__rpets.view(); return V.players.length === 4 && JSON.stringify(V.teams) === '[["a","b"],["c","d"]]' && V.players.slice(1).every((p) => p.cpu); }), 'Tag-Team: 4 painters, you and a computer partner against 2');
		A(await t.page.evaluate(() => /Tag-Team · .*You &/.test(document.querySelector('.rp-teams').textContent) && document.querySelectorAll('.rp-board.is-partner').length === 1 && /your partner/.test(document.querySelector('.rp-board.is-partner').textContent) && document.querySelector('.rp-rivals .rp-board').classList.contains('is-partner')), 'the team line on top, and the partner\'s board first, marked "your partner"');
		// a set match where I go first
		const TSET = (seed) => ({ seed, tagTeam: true, seats: [{ name: 'You', pets: ['p10', 'p3', 'p5', 'p4'] }, { name: 'Wren', pets: ['p2', 'p6', 'p11'], cpu: 'normal' }, { name: 'Pip', pets: ['p13', 'p14', 'p15'], cpu: 'easy' }, { name: 'Ivy', pets: ['p16', 'p17', 'p18'], cpu: 'easy' }] });
		let TSEED = null;
		for (let i = 0; i < 200 && !TSEED; i++) { const S = R.newMatch(TSET('tt' + i)); if (S.cur === 0 && S.players[0].hand.some((c) => S.cards[c].c !== 'N' && c)) TSEED = 'tt' + i; }
		await t.page.evaluate((setup) => { localStorage.removeItem('magepunk_rpets_v1'); window.__rpets.startLocal(setup, { mode: 'quick' }); }, TSET(TSEED));
		await sleep(400);
		let v = await t.V();
		A(v.cur === 'a', 'my team\'s turn first, mine to start: ' + TSEED);
		const card = v.hand.find((c) => c.c !== 'N');
		await t.click(`.rp-card[data-card="${card.id}"]`);
		const tg = await t.page.evaluate(() => [...document.querySelectorAll('.rp-sym.is-target')].map((s) => s.dataset.sym));
		A(tg.some((x) => x.startsWith('b')) && !tg.some((x) => /^[cd]/.test(x)), 'a card picked: my partner\'s Pets are ringed to paint too (a Rival\'s are not)', tg);
		await t.click(`.rp-sym[data-sym="${tg.find((x) => x.startsWith('b'))}"]`);
		v = await t.V();
		A(v.used.paint && Object.entries(v.pets).some(([u, p]) => u.startsWith('b') && p.stacks.some((n) => n === 1)), 'I paint my partner\'s Pet');
		await t.click('.rp-pet[data-uid="a0"]'); await t.click('.b-move');
		A((await t.V()).canvas.O.join() === 'a0', 'and move my Sunset to the Canvas');
		const nPass = (await t.V()).n;
		await t.key('KeyC', 200);
		A(await waitFor(() => t.page.evaluate(() => window.__rpets.view().cur !== 'a'), 3000), 'I pass: my partner plays');
		A(await waitFor(() => t.page.evaluate(() => window.__rpets.view().cur === 'c' || window.__rpets.view().over), 15000), 'my partner\'s turn ends, then the Rivals play');
		A(await t.page.evaluate((n0) => !window.__rpets.view().log.some((e) => e.n > n0 && e.t === 'move' && e.seat === 'b'), nPass), 'my partner did not move a Pet: our team had moved its 1');
		A(await myTurnAgain(t, nPass), 'round again to me');
		// the team's win: 2 of our Pets already on the Canvas (1 mine, 1 my partner's), my Move makes 3
		const ok = await t.page.evaluate(() => {
			const S = window.__rpets.M.S, R_ = window.__rpets.R;
			const lift = (u) => { for (const P of S.players) { for (const st of P.palette) { const k = st.indexOf(u); if (k >= 0) st.splice(k, 1); } for (const l of [P.extra, P.wiped]) { const k = l.indexOf(u); if (k >= 0) l.splice(k, 1); } } for (const c of R_.WHEEL) { const k = S.canvas[c].indexOf(u); if (k >= 0) S.canvas[c].splice(k, 1); } S.pets[u].slots = [[], []]; };
			const onC = R_.sideOnCanvas(S, 'a');
			for (const u of onC) { lift(u); R_.playerOf(S, S.pets[u].owner).extra.push(u); }   // (a clean board: none of ours on the Canvas)
			lift('b2'); S.canvas.G.push('b2'); lift('a2'); S.canvas.P.push('a2'); lift('a0'); S.players[0].palette[0].push('a0');   // (Narbubble green, Poppy purple; Sunset, unpainted, on top of my first spot)
			S.used = {}; S.tmove = false;
			window.__rpets.refresh();
			return R_.sideOnCanvas(S, 'a').length === 2 && R_.trueColor(S, 'a0').c === 'O' && R_.inPlay(S, 'a0') && R_.whereIs(S, 'a0').zone === 'palette';
		});
		A(ok, 'set up: our team has 2 on the Canvas, my Sunset is orange on my Palette');
		const w0 = await t.page.evaluate(() => window.__rpets.wallet());
		await t.click('.rp-pet[data-uid="a0"]'); await t.click('.b-move');
		A(await waitFor(() => t.has('.b-watch'), 5000), 'the third Pet moves: the end screen');
		const end = await t.page.evaluate(() => document.querySelector('.rp-modal h3').textContent);
		const w1 = await t.page.evaluate(() => window.__rpets.wallet());
		A(/^You and Wren win!$/.test(end), 'it says the team won: "You and Wren win!"', end);
		A(w1 - w0 === QUICK_WIN.easy * 2, `the stars are for the 2 Rivals beaten (easy + easy = ${QUICK_WIN.easy * 2}); a partner adds nothing`, w1 - w0);
		const rp = await t.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_rpets_replays_v1') || '[]')[0]);
		const back = SVm.unpackReplay(rp && rp.p);
		A(back && back.setup.tagTeam === true && back.setup.seats.length === 4, 'its replay is kept as a Tag-Team match');
		A(!t.errors.length, 'no page errors (Tag-Team)', t.errors.slice(0, 3));
		await t.ctx.close();
	}
	// ---------------- Tag-Team on a phone held upright: 4 boards, no sideways scroll
	{
		const t = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await t.ready();
		await t.page.evaluate(() => { localStorage.removeItem('magepunk_rpets_v1'); window.__rpets.startLocal({ seed: 'ttphone', tagTeam: true, seats: [{ name: 'You', pets: ['p10', 'p3', 'p5'] }, { name: 'Wren', pets: ['p2', 'p6', 'p11'], cpu: 'normal' }, { name: 'Pip', pets: ['p13', 'p14', 'p15'], cpu: 'easy' }, { name: 'Ivy', pets: ['p16', 'p17', 'p18'], cpu: 'easy' }] }, { mode: 'quick' }); });
		await sleep(600);
		A(!(await t.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) && (await t.page.evaluate(() => document.querySelectorAll('.rp-board').length)) === 4, 'portrait Tag-Team: 4 boards, no sideways scroll');
		await t.ctx.close();
	}

	// ---------------- touch: a phone held upright, then on its side
	for (const [name, vp] of [['portrait', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['landscape', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const t = await open(vp);
		await t.ready(); await start(t); await sleep(500);
		A(!(await t.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${name}: no sideways scroll`);
		const v = await t.V(), card = v.hand.find((c) => c.c !== 'N');
		await t.click(`.rp-card[data-card="${card.id}"]`);
		const tg = await t.page.evaluate(() => [...document.querySelectorAll('.rp-sym.is-target')].map((s) => s.dataset.sym).filter((x) => !x.startsWith('a0:')));   // (not on Sunset: it moves next)
		await t.click(`.rp-sym[data-sym="${tg[0]}"]`);
		A((await t.V()).used.paint, `${name}: tap a card, tap a ringed symbol: painted`);
		await t.click('.rp-pet[data-uid="a0"]');
		await t.click('.b-move');
		A((await t.V()).used.move, `${name}: tap Sunset, tap Move: on the Canvas`);
		const n0 = (await t.V()).n;
		await t.click('.b-pass');
		A(await myTurnAgain(t, n0), `${name}: tap Pass; the computer plays; my turn again`);
		A(!t.errors.length, `${name}: no page errors`, t.errors.slice(0, 3));
		await t.ctx.close();
	}

	// ---------------- keyboard only, then controller only
	for (const how of ['key', 'pad']) {
		const t = await open({ width: 1280, height: 760, deviceScaleFactor: 1 }, { pad: how === 'pad' });
		await t.ready(); await start(t); await sleep(500);
		const press = (k) => (how === 'pad' ? t.tap({ confirm: 1, cancel: 0, secondary: 3, menu: 9 }[k])   /* (the owner's Nintendo layout: the right face button confirms) */ : t.key({ confirm: 'KeyZ', cancel: 'KeyX', secondary: 'KeyC', menu: 'Enter' }[k], 200));
		A(await t.walkTo((f) => !!f.card && !/news/.test(f.cls), how), `${how}: the focus ring reaches a card in my hand`);
		await press('confirm');
		A(!!(await t.page.evaluate(() => window.__rpets.sel && window.__rpets.sel.k === 'card')), `${how}: ${how === 'pad' ? 'A' : 'Z'} picks it`);
		A(await t.walkTo((f) => !!f.sym && f.target && !f.sym.startsWith('a0:'), how), `${how}: the ring reaches a ringed symbol`);
		await press('confirm');
		A((await t.V()).used.paint, `${how}: ${how === 'pad' ? 'A' : 'Z'} paints it`);
		// X steps back from a pick
		A(await t.walkTo((f) => f.uid === 'a0' && /rp-pet/.test(f.cls), how), `${how}: the ring reaches Sunset`);
		await press('confirm');
		A(await t.page.evaluate(() => !!window.__rpets.sel), `${how}: Sunset picked`);
		await press('cancel');
		A(await t.page.evaluate(() => !window.__rpets.sel), `${how}: ${how === 'pad' ? 'B' : 'X'} puts the pick down`);
		await press('menu');
		A(await t.has('.b-giveup'), `${how}: ${how === 'pad' ? 'Start' : 'Enter'} opens the menu`);
		await press('cancel');
		A(!(await t.has('.b-giveup')), `${how}: and ${how === 'pad' ? 'B' : 'X'} closes it`);
		const n0 = (await t.V()).n;
		await press('secondary');
		A(await waitFor(async () => (await t.V()).n > n0, 3000), `${how}: ${how === 'pad' ? 'X' : 'C'} passes`);
		A(await t.page.evaluate(() => window.__mouse) === 0, `${how}: no mouse was used`);
		A(!t.errors.length, `${how}: no page errors`, t.errors.slice(0, 3));
		await t.ctx.close();
	}

	// ---------------- the Newspaper question, a win, stars, the replay, resuming
	{
		const t = await open({ width: 1280, height: 760, deviceScaleFactor: 1 });
		await t.ready(); await start(t); await sleep(400);
		// a throw at my Pet by the computer, with a Newspaper in my hand: I am asked
		await t.page.evaluate(() => {
			const { M, R } = window.__rpets, S = M.S, me = R.playerOf(S, 'a'), them = R.playerOf(S, 'b');
			const n = me.deck.findIndex((c) => S.cards[c].c === 'N'); if (n >= 0) me.hand.push(me.deck.splice(n, 1)[0]);
			const red = them.deck.findIndex((c) => S.cards[c].c === 'R'); S.pets.b0.slots[0].push(them.deck.splice(red, 1)[0]);
			S.canvas.O = ['a0']; me.palette[0] = [];
			S.cur = 1; S.used = {};
			R.act(S, 'b', { t: 'throw', from: 'b0', slot: 0, to: 'a0', toSlot: 1 });
			window.__rpets.refresh();
		});
		A(await waitFor(() => t.has('.b-paper'), 3000) && await t.page.evaluate(() => /A throw is coming/.test(document.body.textContent)), 'a throw at my Pet while I hold a Newspaper: I am asked, "Not so fast!" or let it land');
		await t.click('.b-paper');
		const v = await t.V();
		A(!v.pending && v.pets.a0.colors.join() === 'R,Y', 'Not so fast!: my Sunset is not splatted');
		// a win: two of mine on the Canvas, the third moves
		await t.page.evaluate(() => {
			const { M, R } = window.__rpets, S = M.S, me = R.playerOf(S, 'a');
			S.cur = 0; S.used = {}; S.pending = null; S.phase = 'play';
			S.canvas.O = ['a0']; S.canvas.P = ['a2']; me.palette = [[], ['a1'], []]; me.extra = ['a3'];
			const g = me.deck.findIndex((c) => S.cards[c].c === 'G'); S.pets.a1.slots[1].push(me.deck.splice(g, 1)[0]);   // Furball green + green
			window.__rpets.refresh();
		});
		const before = await t.page.evaluate(() => window.__rpets.wallet());
		await t.click('.rp-pet[data-uid="a1"]'); await t.click('.b-move');
		A(await waitFor(() => t.has('.b-watch'), 5000) && await t.page.evaluate(() => /You win!/.test(document.querySelector('.rp-modal').textContent)), 'three of mine on the Canvas: "You win!"');
		const after = await t.page.evaluate(() => window.__rpets.wallet());
		A(after === before + QUICK_WIN.easy && QUICK_WIN.easy > 0, `a Quick Match win against one easy painter pays its stars (${before} to ${after})`, [before, after]);
		const reps = await t.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_rpets_replays_v1') || '[]'));
		A(reps.length === 1 && reps[0].won && reps[0].p.length > 20, 'the match is kept in Replays');
		A(await t.page.evaluate(() => !JSON.parse(localStorage.getItem('magepunk_rpets_v1')).run), 'a finished match is not offered to Continue');
		const lib = await t.page.evaluate(async () => { const L = await import('/site/replaylib.js'); return L.deviceReplays().filter((r) => r.game === 'rpets').map((r) => ({ id: r.id, label: r.label, href: L.replayHref(r.game, r.id) })); });
		A(lib.length === 1 && lib[0].id === reps[0].p && /^Rainbow Pets · You vs Pip · won$/.test(lib[0].label) && lib[0].href === '/rainbowpets/?replay=' + reps[0].p, 'the site replay library lists it, and opens it on the Rainbow Pets page', lib);
		await t.click('.b-watch');
		A(await waitFor(() => t.page.evaluate(() => /replay=/.test(location.search) && window.__rpets && window.__rpets.ready && window.__rpets.replayTotal > 0), 15000), 'Watch the replay: the replay page opens');
		const tot = await t.page.evaluate(() => window.__rpets.replayTotal);
		await t.page.evaluate(() => window.__rpets.replayTo(1));
		A(await t.page.evaluate(() => window.__rpets.replayAt()) === 1 && await t.has('.b-rp-clip') && await t.has('.b-rp-play'), `the replay steps (${tot} moves) and offers a link to the moment`);
		A(!t.errors.length, 'no page errors (newspaper, win, replay)', t.errors.slice(0, 3));
		await t.ctx.close();
	}
	{
		const t = await open({ width: 1280, height: 760, deviceScaleFactor: 1 });
		await t.ready(); await start(t); await sleep(400);
		await t.click('.rp-pet[data-uid="a0"]'); await t.click('.b-move');
		const n0 = (await t.V()).n;
		await t.page.reload({ waitUntil: 'domcontentloaded' }); await t.ready();
		A(await t.has('.b-resume'), 'after a reload the menu offers Continue');
		await t.click('.b-resume');
		const v = await t.V();
		A(v && v.n === n0 && v.canvas.O.join() === 'a0' && v.used.move, 'Continue: the match exactly where it was');
		await t.ctx.close();
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
