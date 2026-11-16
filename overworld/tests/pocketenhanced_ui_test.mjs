// pocketenhanced_ui_test.mjs — Pocket Enhanced (/pocketenhanced/) in a real browser, desktop + phone:
// it boots to its menu, starts a 3-player match against computer players, sets up and plays turns through the page's
// own inputs (clicks / taps, the keyboard, a controller), queues an attack and commits it with the button labelled
// exactly "Execute", reads a card (Card Type, Combat Types, adapted and original text), resumes on the exact step
// after a reload, finishes the match, watches its replay, opens a shared replay link, and builds a deck.
//   node overworld/tests/pocketenhanced_ui_test.mjs      (screenshots: POCKET_SHOTS=<dir>)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.POCKET_SHOTS || null;
const PORT = 8671;
const SEEDS = (process.env.POCKET_SEED || 'ui-a').split(',');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(80); } return false; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const VIEWPORTS = [
	['desktop', { width: 1600, height: 900, deviceScaleFactor: 1 }],
	['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
try {
	for (const [name, vp] of VIEWPORTS) {
		const SEED = SEEDS[0];
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		if (+process.env.POCKET_SLOW > 1) await page.emulateCPUThrottling(+process.env.POCKET_SLOW);   // a slow machine (CI under load)
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
		await page.evaluateOnNewDocument(() => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch { /* ignore */ }
			const btn = () => ({ pressed: false, value: 0, touched: false });
			window.__fakePad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
			navigator.getGamepads = () => [window.__fakePad];
		});
		const shot = async n => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}_${n}.png`) }); };
		const ready = async () => { const ok = await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 20000); if (vp.hasTouch) await sleep(700); return ok; };   // (a tap in the first instant after load is not a person's)
		const idle = () => waitFor(() => page.evaluate(() => window.__pocket.idle()), 15000);
		const view = () => page.evaluate(() => window.__pocket.view());
		// a menu rises into place (Micatro's .modal-box animation): press a button where it comes to rest, as a person does
		// (three equal reads: on a slow machine two can match while the menu has not moved yet)
		const restBox = async sel => { let prev = null, same = 0; for (let i = 0; i < 60; i++) { const e = await page.$(sel); const b = e && await e.boundingBox(); same = b && prev && Math.abs(b.x - prev.x) < 0.5 && Math.abs(b.y - prev.y) < 0.5 ? same + 1 : 0; if (same >= 2) return b; prev = b; await sleep(40); } return prev; };
		const tap = async sel => {
			const ok = await waitFor(() => page.evaluate(s => { const e = document.querySelector(s); if (!e || e.disabled) return false; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true; }, sel), 2500); if (!ok) return false;
			let b = null;
			for (let i = 0; i < 12; i++) {
				b = await restBox(sel); if (!b) return false;
				const hit = await page.evaluate((s, x, y) => { const e = document.querySelector(s), t = document.elementFromPoint(x, y); return !!e && !!t && (t === e || e.contains(t)); }, sel, b.x + b.width / 2, b.y + b.height / 2);
				if (hit) break;
				await sleep(80);
			}
			if (vp.hasTouch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
			await sleep(vp.hasTouch ? 380 : 60);   // (touch: two quick taps would be read as a double tap)
			return true;
		};
		const K = k => `[data-k="${k}"]`;
		const padPress = async i => { await page.evaluate(n => { window.__fakePad.buttons[n] = { pressed: true, value: 1, touched: true }; window.__fakePad.timestamp++; }, i); await sleep(120); await page.evaluate(n => { window.__fakePad.buttons[n] = { pressed: false, value: 0, touched: false }; window.__fakePad.timestamp++; }, i); await sleep(120); };

		// ---------- boot ----------
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=${SEED}`, { waitUntil: "domcontentloaded" });
		A(await ready(), `[${name}] the page boots`);
		A(await page.evaluate(() => /Pocket Enhanced/.test(document.querySelector('.modal-title')?.textContent || '') && !!document.querySelector('[data-k="new"]') && !document.querySelector('[data-k="continue"]')), `[${name}] it opens on its menu: New match, no login needed`);
		await shot('1_menu');
		A(await page.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return s.left >= -1 && s.top >= -1 && s.right <= innerWidth + 1 && s.bottom <= innerHeight + 1; }), `[${name}] the table fits the screen`);

		// ---------- a 3-player match ----------
		// (each press is confirmed by what it does; a press that did not land is pressed again, as a person would)
		const press = async (sel, done, arg) => { for (let i = 0; i < 3; i++) { await tap(sel); if (await waitFor(() => page.evaluate(done, arg), 2500)) return true; } return false; };
		const steps = [
			await press(K('new'), () => [...document.querySelectorAll('.modal-title')].some(e => e.textContent === 'New match')),
			await press(K('n3'), () => document.querySelector('[data-k="n3"]')?.classList.contains('on')),
			await press(K('dcharizard'), () => document.querySelector('[data-k="dcharizard"]')?.classList.contains('on')),
			await press(K('start'), () => !!window.__pocket.view()),
		];
		A(steps.every(Boolean), `[${name}] New match → 3 players → the Charizard deck → Start`, steps);
		await page.evaluate(() => window.__pocket.fast());
		let v = await view();
		A(v && v.players.length === 3 && v.phase === 'setup' && v.players[0].hand.length === 5 && v.players[1].hand === null && v.players[1].ai, `[${name}] three players; I see my own five cards and nobody else's`);
		await idle();
		// setup: tap the Basic Pokémon in my hand, then Ready
		const basics = await page.evaluate(() => [...document.querySelectorAll('.pe-hand .pe-card.playable')].map(e => e.dataset.k));
		A(basics.length >= 1 && await page.evaluate(() => document.querySelector('[data-k="ready"]').disabled), `[${name}] setup: my Basic Pokémon are marked, and Ready waits for an Active Pokémon`);
		for (const k of basics) await tap(K(k));
		await shot('2_setup');
		A(await page.evaluate(() => /Active A/.test(document.querySelector('.pe-hand .have')?.textContent || '')), `[${name}] the first one tapped is marked Active A`);
		// the table is a playmat with every Pokémon on it, and the cards are card faces (name and HP on top, the art, the attacks)
		const look = await page.evaluate(() => { const m = document.querySelector('.pe-mat').getBoundingClientRect(), out = [...document.querySelectorAll('.pe-poke')].filter(e => { const r = e.getBoundingClientRect(); return r.left < m.left - 1 || r.right > m.right + 1 || r.top < m.top - 1 || r.bottom > m.bottom + 1; }).map(e => e.dataset.k);
			const hand = [...document.querySelectorAll('.pe-hand .pe-card')], faces = hand.filter(e => e.matches('.pf') && e.querySelector('.f .art') && (e.querySelector('.f.tr .tx') || (e.querySelector('.f.pk .hpn') && e.querySelector('.f.pk .atk')))).length;
			const r0 = hand[0].getBoundingClientRect(), inPlay = [...document.querySelectorAll('.pe-poke.pf')];
			return { out, hand: hand.length, faces, ratio: r0.width / r0.height, inPlay: inPlay.length, shown: inPlay.filter(e => e.querySelector('.f.pk .hpn') && e.querySelector('.hp i') && e.querySelector('.art img')).length }; });
		A(!look.out.length && look.inPlay > 0 && look.shown === look.inPlay, `[${name}] every Pokémon in play is a card on the playmat, with its HP and its art`, look);
		A(look.hand > 0 && look.faces === look.hand && Math.abs(look.ratio - 10 / 14) < 0.02, `[${name}] the cards in hand are card faces, in a card's proportions`, look);
		if (name === 'desktop') {	// with two opponents on a wide screen, one of them can be enlarged (and put back)
			const wOf = () => page.evaluate(() => { const e = document.querySelector('.pe-opps .pe-poke[data-k="p:1:active:0"]'), o = document.querySelector('.pe-opps .pe-poke[data-k="p:2:active:0"]'), m = document.querySelector('.pe-mat').getBoundingClientRect(); const out = [...document.querySelectorAll('.pe-opps .pe-poke')].filter(x => { const r = x.getBoundingClientRect(); return r.left < m.left - 1 || r.right > m.right + 1 || r.top < m.top - 1 || r.bottom > m.bottom + 1; }).length; return { a: e.getBoundingClientRect().width, b: o.getBoundingClientRect().width, out }; });
			const w0 = await wOf();
			await tap(K('big:1')); const w1 = await wOf();
			A(w1.a > w0.a * 1.1 && w1.b <= w0.b && w1.out === 0, `[${name}] enlarging an opponent makes their Active cards bigger, with every card still on the mat`, { w0, w1 });
			await tap(K('big:1')); const w2 = await wOf();
			A(Math.abs(w2.a - w0.a) < 1 && Math.abs(w2.b - w0.b) < 1, `[${name}] pressing it again puts everyone back`, w2);
		}
		await tap(K('ready'));
		await idle();
		v = await view();
		A(v.phase === 'main' && v.players.every(p => p.setup) && v.log.some(e => e.k === 'setup' && e.seat === 0 && /Active/.test(e.msg)), `[${name}] Ready: everyone has set up and the match starts`);

		// the computer players play until it is my turn, through the same Execute
		A(await waitFor(async () => { const x = await view(); return x.current === 0 && !x.pending; }, 20000), `[${name}] the computer players take their turns and it comes to me`);
		v = await view();
		A(v.log.some(e => e.k === 'execute') || v.first === 0, `[${name}] their turns went through Execute`);
		// make sure I can attack: one more round if this is the first player's first turn
		if (v.players[0].turns === 0 && v.first === 0) { await tap(K('exec')); await waitFor(async () => { const x = await view(); return x.current === 0 && x.turn > 1 && !x.pending; }, 20000); }
		// attach Energy until Active A can use its first attack (turns pass with Execute)
		const ready0 = () => page.evaluate(async () => { const { card } = await import('/pocketenhanced/js/data/cards.js'); const P = window.__pocket, x = P.view(), k = x.players[0].active[0]; return !!k && card(k.id).attacks.some(a => P.engine.canPay(k.energy, a.cost)) && !k.status.length; });
		let guard = 0;
		while (!(await ready0()) && guard++ < 12 && !(await view()).over) {
			v = await view();
			if (!v.players[0].active[0]) { await page.evaluate(() => { const x = window.__pocket.view(), b = x.players[0].bench.findIndex(Boolean); if (b >= 0) window.__pocket.act({ t: 'promote', slot: 0, bench: b }); }); continue; }
			if (v.players[0].zone.cur && !v.players[0].flags.attached) {
				if (guard === 1) { await tap(K('zone')); A(await page.evaluate(() => /Attach your/.test(document.querySelector('.pe-prompt')?.textContent || '') && document.querySelectorAll('.pe-poke.legal').length >= 1), `[${name}] the Energy Zone asks which of my Pokémon takes the Energy`); await tap(K('p:0:active:0')); }
				else await page.evaluate(() => window.__pocket.act({ t: 'attach', at: { seat: 0, zone: 'active', idx: 0 } }));
				if (await ready0()) break;
			}
			await page.evaluate(() => window.__pocket.act({ t: 'execute', commands: [null, null] }));
			await waitFor(async () => { const x = await view(); return x.over || (x.current === 0 && !x.pending) || (x.pending && x.pending.seat === 0); }, 20000);
			if ((await view()).pending) await page.evaluate(() => { const x = window.__pocket.view(); window.__pocket.act({ t: 'choose', pick: x.pending.options[0] }); });
		}
		v = await view();
		if (!v.over && await ready0()) {
			// ---------- read a card, then queue an attack and Execute ----------
			await tap(K('p:0:active:0'));
			const insp = await page.evaluate(() => document.querySelector('.pe-insp')?.textContent || '');
			A(/Card Type/.test(insp) && /Combat Type/.test(insp) && !/Original:/.test(insp), `[${name}] pressing my Active Pokémon shows its Card Type and its Combat Types`, insp.slice(0, 200));
			await tap(K('orig'));
			await waitFor(() => page.evaluate(() => /Hide original/.test(document.querySelector('[data-k="orig"]')?.textContent || '')), 3000);
			if (name === 'desktop') {
				// a card whose wording changed says why (Sabrina), read straight from the page's inspector
				const why = await page.evaluate(async () => { const { CARDS } = await import('/pocketenhanced/js/data/cards.js'); return CARDS.find(c => c.name === 'Sabrina').note; });
				A(/owner still chooses/.test(why || ''), '[desktop] the card data the page loads carries the adaptation notes');
			}
			A(await page.evaluate(() => /Original:/.test(document.querySelector('.pe-insp')?.textContent || '') || !document.querySelector('.pe-insp h4 ~ div')), `[${name}] the original card text can be shown beside the adapted text`);
			await shot('3_inspect');
			const atkKey = await page.evaluate(() => [...document.querySelectorAll('.modal [data-k^="atk"]')].find(e => !e.disabled)?.dataset.k || null);
			A(!!atkKey, `[${name}] its usable attack is offered`);
			await tap(K(atkKey));
			const legal = await page.evaluate(() => [...document.querySelectorAll('.pe-poke.legal')].map(e => e.dataset.k));
			const needsTarget = legal.length > 0;
			if (needsTarget) {
				A(legal.every(k => !k.startsWith('p:0:')) && new Set(legal.map(k => k.split(':')[1])).size === 2, `[${name}] the targets are opposing Pokémon of BOTH other players`, legal);
				await shot('4_target');
				await tap(K(legal[legal.length - 1]));
			}
			const q = await page.evaluate(() => ({ line: document.querySelector('.pe-cmd .q')?.textContent || '', exec: document.querySelector('[data-k="exec"]')?.textContent, n: window.__pocket.state().actions }));
			A(/Active A: .+ → (?!Pass)/.test(q.line) && q.exec === 'Execute', `[${name}] the command is queued and shown, under a button labelled exactly "Execute"`, q);
			A((await view()).current === 0, `[${name}] nothing has resolved yet: it is still my turn`);
			await shot('5_queued');
			const before = (await view()).log.length;
			await tap(K('exec'));
			if (await page.evaluate(() => !!document.querySelector('[data-k="exec2"]'))) await tap(K('exec2'));   // "B could attack and is passing": confirm
			await waitFor(async () => (await view()).log.length > before, 5000);
			v = await view();
			A(v.log.slice(before).some(e => e.k === 'execute' && /Resolved in order: A, then B/.test(e.msg)) && v.log.slice(before).some(e => e.k === 'attack' && /^Active A/.test(e.msg)), `[${name}] Execute resolves the attack and ends my turn; the log shows the order`);
			A(await page.evaluate(() => /Resolved in order/.test(document.querySelector('.pe-log').textContent)), `[${name}] the battle log is on the page`);
		} else A(false, `[${name}] could not get an Active Pokémon ready to attack`, { over: v.over, turn: v.turn });

		// ---------- a reload resumes on the exact step ----------
		await waitFor(async () => { const x = await view(); return x.over || (x.current === 0 && !x.pending) || (x.pending && x.pending.seat === 0); }, 20000);
		const mark = await page.evaluate(() => ({ n: window.__pocket.state().actions, d: window.__pocket.engine.digest(window.__pocket.state()) }));
		await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
		A(await page.evaluate(() => !!document.querySelector('[data-k="continue"]')), `[${name}] after a reload the menu offers Continue`);
		for (let i = 0; i < 4 && !(await page.evaluate(() => !!window.__pocket.state())); i++) { await sleep(400); await tap(K('continue')); await sleep(300); }
		const back = await page.evaluate(() => ({ n: window.__pocket.state().actions, d: window.__pocket.engine.digest(window.__pocket.state()) }));
		A(back.n === mark.n && back.d === mark.d, `[${name}] …and the match is exactly where it was`, [mark, back]);

		// ---------- keyboard and controller ----------
		if (!vp.hasTouch) {
			await page.evaluate(() => window.__pocket.fast());
			await waitFor(async () => { const x = await view(); return x.over || (x.current === 0 && !x.pending); }, 20000);
			if (!(await view()).over) {
				await page.keyboard.press('ArrowRight');
				A(await page.evaluate(() => !!window.__pocket.focus()), '[desktop] an arrow key shows the focus ring');
				const f1 = await page.evaluate(() => window.__pocket.focus().dataset.k); await page.keyboard.press('KeyD'); await page.keyboard.press('KeyS');
				const f2 = await page.evaluate(() => window.__pocket.focus().dataset.k);
				A(f1 !== f2, '[desktop] WASD moves it', [f1, f2]);
				await page.evaluate(() => { document.querySelector('[data-k="p:0:active:0"]')?.focus(); });
				// walk the ring to my Active A, press Z: its menu opens; X closes it
				for (let i = 0; i < 12 && await page.evaluate(() => window.__pocket.focus()?.dataset.k !== 'menu'); i++) await page.keyboard.press('ArrowRight');
				for (let i = 0; i < 12 && await page.evaluate(() => window.__pocket.focus()?.dataset.k !== 'menu'); i++) await page.keyboard.press('ArrowDown');
				await page.keyboard.press('KeyZ');
				A(await page.evaluate(() => !!document.querySelector('.modal')), '[desktop] Z presses the focused button (a menu opens)', await page.evaluate(() => window.__pocket.focus()?.dataset.k));
				await page.keyboard.press('KeyX');
				A(await page.evaluate(() => !document.querySelector('.modal')), '[desktop] X goes back');
				await page.keyboard.press('KeyV'); await page.keyboard.press('KeyX');
				// a controller: d-pad moves, A presses, B backs out
				await padPress(14); await padPress(15);
				A(await page.evaluate(() => !!window.__pocket.focus()), '[desktop] a controller\'s d-pad moves the same ring');
				for (let i = 0; i < 12 && await page.evaluate(() => window.__pocket.focus()?.dataset.k !== 'menu'); i++) await padPress(15);
				for (let i = 0; i < 12 && await page.evaluate(() => window.__pocket.focus()?.dataset.k !== 'menu'); i++) await padPress(13);
				await padPress(1);   // the confirm button (Nintendo layout, the site's standard: the right face button)
				const opened = await waitFor(() => page.evaluate(() => !!document.querySelector('.modal')), 3000);
				// (a press that a busy machine drops is pressed again, as a person would)
				let closed = false; for (let i = 0; i < 3 && !closed; i++) { await padPress(0); closed = await waitFor(() => page.evaluate(() => !document.querySelector('.modal')), 2000); }
				A(opened && closed, '[desktop] its A button presses and its B button goes back', await page.evaluate(() => window.__pocket.focus()?.dataset.k));
				// C is Execute (both pass → asks first if an attack was available, then commits)
				const t0 = (await view()).turn;
				await page.keyboard.press('KeyC');
				if (await page.evaluate(() => !!document.querySelector('[data-k="exec2"]'))) { await page.keyboard.press('KeyZ'); await page.keyboard.press('KeyZ'); }
				A(await waitFor(async () => { const x = await view(); return x.over || x.turn > t0; }, 8000), '[desktop] C executes from the keyboard');
			}
		}

		// ---------- play it out (my seat through the page's own action entry, chosen by the computer player's rules) ----------
		await page.evaluate(() => window.__pocket.fast());
		const done = await page.evaluate(async () => {
			const { nextAction } = await import('/pocketenhanced/js/ai.js');
			const P = window.__pocket, sleep = ms => new Promise(r => setTimeout(r, ms));
			for (let i = 0; i < 6000; i++) {
				const S = P.state(); if (!S || S.over) return true;
				const mineNow = (S.pending && S.pending.seat === 0) || (!S.pending && S.phase === 'main' && S.current === 0);
				if (!mineNow) { await sleep(5); continue; }
				if (S.players[0].eliminated) { await sleep(5); continue; }
				const banned = new Set(); let ok = false;
				for (let t = 0; t < 40 && !ok; t++) { const a = nextAction(P.engine.view(P.state(), 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; ok = P.act(a); if (!ok) banned.add(JSON.stringify(a)); }
				if (!ok) return 'stuck';
			}
			return 'too long';
		});
		A(done === true, `[${name}] the match plays to its end`, done);
		v = await view();
		const endInfo = await page.evaluate(() => ({ title: document.querySelector('.modal-title')?.textContent, run: !!localStorage.getItem('magepunk_pocket_run_v1'), reps: (JSON.parse(localStorage.getItem('magepunk_pocket_replays_v1') || '[]')).length, modals: document.querySelectorAll('.modal').length }));
		A(v.over && await page.evaluate(() => /Match over|You win/.test(document.querySelector('.modal-title')?.textContent || '') && !localStorage.getItem('magepunk_pocket_run_v1') && JSON.parse(localStorage.getItem('magepunk_pocket_replays_v1')).length === 1), `[${name}] the result is shown, the finished match is no longer offered, and its replay is kept`, endInfo);
		await shot('6_over');
		{	// a finished match pays packs (2 for a win, 1 otherwise), on top of a new player's 10
			const paid = await page.evaluate(() => { const v = window.__pocket.view(), c = window.__pocket.collection(); return { packs: c.packs, won: v.over.winner === 0, shown: document.querySelector('.pe-earned')?.textContent || '', btn: !!document.querySelector('[data-k="packs"]') }; });
			A(paid.packs === 10 + (paid.won ? 2 : 1) && paid.shown === `+${paid.won ? '2 packs' : '1 pack'}` && paid.btn, `[${name}] finishing the match pays packs, and says so`, paid);
		}

		// ---------- the replay ----------
		await press(K('watch'), () => window.__pocket.mode === 'replay');
		await tap(K('rb4'));
		{
			// a discard pile is public: its cards can be read
			const who = await page.evaluate(() => window.__pocket.view().players.find(p => p.discard.length)?.seat ?? -1);
			await tap(K('disc:' + who));
			const dp = await page.evaluate(s => ({ n: document.querySelectorAll('.modal .pe-grid .pe-card').length, want: window.__pocket.view().players[s].discard.length, title: document.querySelector('.modal-title')?.textContent || '' }), who);
			A(who >= 0 && dp.n === dp.want && dp.n > 0 && /discard pile/.test(dp.title), `[${name}] a player's discard pile opens and lists its ${dp.want} cards`, dp);
			await tap(K('back')); await tap(K('rb0'));
		}
		A(await page.evaluate(() => window.__pocket.mode === 'replay' && window.__pocket.state().actions === 0 && !!document.querySelector('.pe-replaybar') && !document.querySelector('[data-k="exec"]')), `[${name}] Watch the replay: read-only, from the first step`);
		await tap(K('rb3')); await tap(K('rb3'));
		A(await page.evaluate(() => window.__pocket.state().actions === 2), `[${name}] it steps forward one action at a time`);
		await tap(K('rb4'));
		const endSame = await page.evaluate(() => { const P = window.__pocket, r = P.recipe(); return P.state().over && P.engine.digest(P.state()) === P.engine.digest(P.engine.replay(r.config, r.actions)); });
		A(endSame, `[${name}] its end is the match's end`);
		await tap(K('rbpov'));
		A(await page.evaluate(() => window.__pocket.view().you === 1 && Array.isArray(window.__pocket.view().players[1].hand)), `[${name}] the replay can be watched from each player's seat`);
		await shot('7_replay');
		// a shared link
		const link = await page.evaluate(async () => { const { packString } = await import('/battlecards/codec.js'); return '/pocketenhanced/?replay=' + await packString(JSON.stringify(window.__pocket.recipe())); });
		A(link.length < 60000, `[${name}] a replay link is ${link.length} characters`);
		await page.goto(`http://localhost:${PORT}${link}`, { waitUntil: 'domcontentloaded' }); await ready();
		A(await page.evaluate(() => window.__pocket.mode === 'replay' && window.__pocket.recipe().actions.length > 10), `[${name}] opening the link plays that match`);
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?replay=G1.notareplay`, { waitUntil: 'domcontentloaded' }); await ready();
		A(await page.evaluate(() => window.__pocket.mode === 'normal' && !!document.querySelector('[data-k="new"]')), `[${name}] a broken link falls back to the menu`);

		// ---------- packs ----------
		const T = k => `.modal:last-child [data-k="${k}"]`;   // (menus stack: the button on the one in front)
		const col = () => page.evaluate(() => { const c = window.__pocket.collection(); return { packs: c.packs, points: c.points, opened: c.opened, n: Object.values(c.prints).reduce((a, b) => a + b, 0) }; });
		const c0 = await col();
		A(c0.packs >= 10 && c0.n === 14 && c0.opened === 0, `[${name}] a new player has packs to open and two of each starter Trainer`, c0);
		A(await press(T('packs'), () => document.querySelectorAll('.pe-pack').length === 4), `[${name}] Open packs offers the four boosters (Genetic Apex's three and Mythical Island's)`);
		A(await press(T('packC'), () => document.querySelectorAll('.pe-pull.down').length === 5), `[${name}] a pack is five face-down cards`);
		const c1 = await col();
		A(c1.packs === c0.packs - 1 && c1.n === c0.n + 5 && c1.points === 5 && c1.opened === 1, `[${name}] opening it adds its five cards and 5 pack points at once (closing the page loses nothing)`, c1);
		A(await press(T('pull0'), () => document.querySelectorAll('.pe-pull.down').length === 4 && document.querySelector('[data-k="pull0"]').matches('.up') && !!document.querySelector('[data-k="pull0"] .rar')), `[${name}] pressing a card turns it over and shows its rarity`);
		A(await press(T('flipall'), () => !document.querySelector('.pe-pull.down') && /new card|No new cards/.test(document.querySelector('.modal:last-child .pe-note').textContent)), `[${name}] Turn all over shows the rest and counts the new cards`);
		await shot('8_pack');
		for (let i = 0; i < 9; i++) { const want = c1.opened + i + 1; await press(T('again'), () => document.querySelectorAll('.pe-pull.down').length === 5); await press(T('flipall'), () => !document.querySelector('.pe-pull.down')); if ((await col()).opened !== want) break; }
		const c2 = await col();
		A(c2.opened === 10 && c2.n === c0.n + 50 && c2.points === 50 && c2.packs === c0.packs - 10, `[${name}] ten packs opened: fifty cards, fifty pack points`, c2);
		await tap(T('back'));
		A(await waitFor(() => page.evaluate(n => new RegExp('^' + n + ' pack').test(document.querySelector('.modal:last-child .pe-note b')?.textContent || ''), c2.packs), 3000), `[${name}] back on the packs screen the count is current`);
		// ---------- the collection ----------
		A(await press(T('collection'), () => document.querySelectorAll('.pe-col .pe-card').length === 298), `[${name}] the Collection lists all 298 cards`);
		const owned = await page.evaluate(() => ({ head: document.querySelector('.pe-colhead').textContent, lack: document.querySelectorAll('.pe-col .pe-card.lack').length, uniq: document.querySelectorAll('.pe-col .pe-card:not(.lack)').length }));
		A(owned.uniq > 15 && owned.lack === 298 - owned.uniq && owned.head.startsWith(`${owned.uniq} / 298 cards`), `[${name}] owned cards show their count, the rest are greyed`, owned);
		A(await press(T('sown'), () => document.querySelectorAll('.pe-col .pe-card').length > 0 && !document.querySelector('.pe-col .pe-card.lack')), `[${name}] the Owned filter shows only owned cards`);
		await press(T('slack'), () => document.querySelectorAll('.pe-col .pe-card.lack').length === document.querySelectorAll('.pe-col .pe-card').length);
		// exchange pack points for a card not owned (a one-diamond card costs 35)
		const want = await page.evaluate(() => [...document.querySelectorAll('.pe-col .pe-card.lack')].map(e => e.dataset.k.slice(1)).find(id => /^A1-0(0[1-9]|1[0-9])$/.test(id) && window.__pocket.engine && true));
		await press(T('c' + want), () => !!document.querySelector('.modal:last-child [data-k="exchange"]'));
		const offer = await page.evaluate(() => { const b = document.querySelector('.modal:last-child [data-k="exchange"]'); return { text: b.textContent, off: b.disabled }; });
		if (!offer.off) {
			A(await press(T('exchange'), id => window.__pocket.owned(id) === 1, want) || (await page.evaluate(id => window.__pocket.owned(id), want)) === 1, `[${name}] pack points buy a card that is not owned`, offer);
			const c3 = await col();
			A(c3.points < c2.points && c3.n === c2.n + 1, `[${name}] the exchange takes its pack points`, c3);
		} else { A(/pack points/.test(offer.text), `[${name}] a card that costs more points than you have says so`, offer); await tap(T('back')); }
		await shot('9_collection');
		await tap(T('back')); await tap(T('back'));
		// ---------- the deck builder ----------
		A(await press(T('decks'), () => document.querySelectorAll('.pe-db .pool .pe-card').length === 298), `[${name}] the deck builder lists all 298 cards`);
		{	// every card carries all its rules text, and it fits on the card (all 298, at the builder's card size)
			const fitCheck = () => page.evaluate(async () => {
				const { CARDS } = await import('/pocketenhanced/js/data/cards.js');
				const norm = t => t.replace(/\{ex\}/g, 'ex').replace(/\{[A-Z]\}/g, '').replace(/\s+/g, ' ').trim();
				const over = [], missing = [];
				for (const c of CARDS) {
					const e = document.querySelector(`.pe-db .pool [data-k="c${c.id}"]`), face = e.querySelector('.f'), text = norm(face.textContent);
					const box = face.getBoundingClientRect();
					if (face.scrollHeight > face.clientHeight + 1 || [...face.querySelectorAll('.fx, .tx, .atk, .ft')].some(x => { const r = x.getBoundingClientRect(); return r.bottom > box.bottom + 1 || r.right > box.right + 1; })) over.push(c.name);
					const want = c.kind === 'pokemon' ? [...c.attacks.map(a => a.adapted || a.text), c.ability ? c.ability.adapted || c.ability.text : ''] : [c.adapted || c.text];
					if (want.filter(Boolean).some(w => !text.includes(norm(w))) || (c.kind === 'pokemon' && c.attacks.some(a => !text.includes(a.name)))) missing.push(c.name);
				}
				return { over, missing };
			});
			const fit = await fitCheck();
			A(fit.missing.length === 0, `[${name}] every card shows all its rules text: each attack, what it does, and its Ability`, fit.missing.slice(0, 8));
			A(fit.over.length === 0, `[${name}] and all of it fits on the card`, fit.over.slice(0, 12));
			// a device whose font runs wide (CI's Linux has no Segoe UI: Victreebel's text ran off its card there): still all on the card
			await page.addStyleTag({ content: '.pe .pf { font-family: Verdana, "DejaVu Sans", sans-serif !important; letter-spacing: .04em !important; }' });
			await tap(T('fGrass')); await tap(T('fAll'));
			await waitFor(() => page.evaluate(() => document.querySelectorAll('.pe-db .pool .pe-card').length === 298), 4000);
			const wide = await fitCheck();
			A(wide.over.length === 0 && wide.missing.length === 0, `[${name}] in a wider font too: the text is set tighter until it fits`, { over: wide.over.slice(0, 12), missing: wide.missing.slice(0, 4) });
			await page.evaluate(() => { [...document.querySelectorAll('style')].filter(x => /Verdana/.test(x.textContent)).forEach(x => x.remove()); });
			await tap(T('fGrass')); await tap(T('fAll'));
		}
		const lackCard = await page.evaluate(() => document.querySelector('.pe-db .pool .pe-card.lack').dataset.k), before = await page.evaluate(() => document.querySelector('.pe-db .mine .pe-note').textContent);
		await tap(T(lackCard));
		A(await page.evaluate(b => document.querySelector('.pe-db .mine .pe-note').textContent === b && /do not own/.test(document.querySelector('.pe-banner').textContent), before), `[${name}] a card you do not own cannot go in a deck, and the game says why`);
		A(await press(T('mine'), () => document.querySelectorAll('.pe-db .pool .pe-card').length > 0 && !document.querySelector('.pe-db .pool .pe-card.lack')), `[${name}] "Showing: owned" leaves only your cards`);
		for (let i = 0; i < 40; i++) {
			const next = await page.evaluate(() => { if (/^20 \/ 20/.test(document.querySelector('.pe-db .mine .pe-note').textContent)) return null; const e = [...document.querySelectorAll('.pe-db .pool .pe-card')].find(x => +(x.querySelector('.have')?.textContent || 0) < Math.min(2, +x.querySelector('.own').textContent.replace(/\D/g, ''))); return e ? e.dataset.k : null; });
			if (!next) break;
			const had = await page.evaluate(() => document.querySelector('.pe-db .mine .pe-note').textContent);
			await press(T(next), h => document.querySelector('.pe-db .mine .pe-note').textContent !== h, had);
		}
		const built = await page.evaluate(() => ({ note: document.querySelector('.pe-db .mine .pe-note').textContent, save: !document.querySelector('[data-k="save"]').disabled }));
		A(/^20 \/ 20 cards/.test(built.note), `[${name}] twenty of your own cards make a deck`, built);
		if (built.save) {
			await tap(T('save')); await tap(T('back')); await tap(T('new'));
			A(await waitFor(() => page.evaluate(() => !!document.querySelector('[data-k="dmy:My deck"]')), 3000), `[${name}] the saved deck can be chosen for a new match`);
		} else A(/class="red"/.test(await page.evaluate(() => document.querySelector('.pe-db .mine').innerHTML)), `[${name}] a deck that is not legal says why`, built);
		await shot('10_decks');
		A(errors.length === 0, `[${name}] no page errors`, errors.slice(0, 4));
		await ctx.close();
	}
	{	// ---------- your own card pictures (artconfig.js): shown where the folder has one, the default art everywhere else ----------
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(e.message));
		const asked = []; page.on('request', r => { if (/\/pocketenhanced\/art\//.test(r.url())) asked.push(r.url().split('/').pop()); });
		await page.evaluateOnNewDocument(() => { window.POCKET_ART = { base: '/pocketenhanced/art/example', ext: 'png' }; try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch (e) { /* no storage */ } });
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=art`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__pocket && window.__pocket.ready, { timeout: 30000 });
		await page.evaluate(() => { [...document.querySelectorAll('.modal [data-k="collection"]')].pop().click(); });
		// (pictures load as their cards come on screen: the first Pokémon is at the top of the list, the Trainers are behind their filter)
		const art = id => page.evaluate(k => { const a = document.querySelector(`.pe-col [data-k="c${k}"] .art`); if (!a) return null; a.scrollIntoView({ block: 'center' }); const own = a.querySelector('img.own');
			return { own: !!own && own.complete && own.naturalWidth > 0, pending: !!own && !(own.complete && own.naturalWidth > 0), fills: !!own && Math.abs(own.getBoundingClientRect().width - a.getBoundingClientRect().width) < 2, base: !!a.querySelector('img:not(.own), .person, .ph') }; }, id);
		const settle = async (id, want) => { let x = null; for (let i = 0; i < 60; i++) { x = await art(id); if (x && want(x)) break; await sleep(150); } return x; };
		const poke = await settle('A1-001', x => !x.own && !x.pending);
		await page.evaluate(() => { [...document.querySelectorAll('.modal [data-k="fTrainers"]')].pop().click(); });
		const mine = await settle('P-A-001', x => x.own), other = await settle('P-A-002', x => !x.own && !x.pending);
		const got = { own: !!mine && mine.own, fills: !!mine && mine.fills, trainerFallback: !!other && !other.own && !other.pending && other.base, pokeFallback: !!poke && !poke.own && !poke.pending && poke.base };
		A(got && got.own && got.fills, '[art] a card with a picture in the folder shows it, filling its art window', got);
		A(got && got.trainerFallback && got.pokeFallback && errors.length === 0, '[art] a card with no picture there keeps its default art, with no page errors', { got, errors });
		A(asked.includes('P-A-001.png') && asked.every(x => /^[A-Za-z0-9-]+\.png$/.test(x)), '[art] pictures are asked for by card id from that folder only', asked.slice(0, 4));
		await ctx.close();
		// and with no folder set (the default), no picture is requested at all
		const ctx2 = await browser.createBrowserContext(), p2 = await ctx2.newPage(); const asked2 = []; p2.on('request', r => { if (/\/pocketenhanced\/art\//.test(r.url())) asked2.push(r.url()); });
		await p2.goto(`http://localhost:${PORT}/pocketenhanced/?seed=art`, { waitUntil: 'domcontentloaded' });
		await p2.waitForFunction(() => window.__pocket && window.__pocket.ready, { timeout: 30000 });
		await p2.evaluate(() => { [...document.querySelectorAll('.modal [data-k="collection"]')].pop().click(); }); await sleep(800);
		A(asked2.length === 0 && await p2.evaluate(() => document.querySelectorAll('.pe-col .pe-card').length === 298 && !document.querySelector('img.own') && !!document.querySelector('.pe-col .art.bg-Fire') && !!document.querySelector('.pe-col .art.bg-Water')), '[art] by default nothing is requested, and each card has the painted background of its type');
		await ctx2.close();
	}
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
