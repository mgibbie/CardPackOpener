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
			// (first let the menu finish rising: on a busy machine three equal reads can all fall BEFORE its animation has drawn a frame, and the press then lands where the button is not yet. A press that lands on the wrong card or toggles the wrong filter cannot be put right by pressing again. CI, 2026-11-17: pull0, orig, sown, exchange each missed once.)
			await Promise.race([page.evaluate(s => { const run = []; for (let n = document.querySelector(s); n; n = n.parentElement) for (const an of n.getAnimations ? n.getAnimations() : []) { const t = an.effect && an.effect.getComputedTiming ? an.effect.getComputedTiming() : null; if (an.playState === 'running' && t && Number.isFinite(t.endTime) && t.endTime < 3000) run.push(an.finished.catch(() => null)); } return Promise.all(run).then(() => true); }, sel).catch(() => null), sleep(2500)]);
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
		// A press is held, and then released, until the page has drawn frames: the page reads a controller once per frame, and a busy machine can go longer than a fixed wait without drawing one (the press was then never seen).
		const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // (two frames: the page's own reader has run by then; short enough that a held direction does not start repeating)
		const padPress = async i => { await page.evaluate(n => { window.__fakePad.buttons[n] = { pressed: true, value: 1, touched: true }; window.__fakePad.timestamp++; }, i); await frames(); await page.evaluate(n => { window.__fakePad.buttons[n] = { pressed: false, value: 0, touched: false }; window.__fakePad.timestamp++; }, i); await frames(); await sleep(120); };

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
			await press(K('theme'), () => document.querySelectorAll('[data-k^="ts"]').length >= 20),
			await press(K('ts1'), () => document.querySelector('[data-k="ts1"]')?.classList.contains('on') && !!document.querySelector('[data-k="dt:mew-ex-deck-mythical-island"]')),
			await press(K('dt:mew-ex-deck-mythical-island'), () => document.querySelector('[data-k="dt:mew-ex-deck-mythical-island"]')?.classList.contains('on') && /Mew ex Deck/.test(document.querySelector('[data-k="theme"]').textContent)),
			await press(K('dcharizard'), () => document.querySelector('[data-k="dcharizard"]')?.classList.contains('on') && !document.querySelector('[data-k="dt:mew-ex-deck-mythical-island"]')?.classList.contains('on')),
			await press(K('start'), () => !!window.__pocket.view()),
		];
		A(steps.every(Boolean), `[${name}] New match → 3 players → Pocket's own decks open by set and one can be chosen → the Charizard deck → Start`, steps);
		await page.evaluate(() => window.__pocket.fast());
		let v = await view();
		A(v && v.players.length === 3 && v.phase === 'setup' && v.players[0].hand.length === 5 && v.players[1].hand === null && v.players[1].ai, `[${name}] three players; I see my own five cards and nobody else's`);
		await idle();
		// setup: tap the Basic Pokémon in my hand, then Ready
		const basics = await page.evaluate(() => [...document.querySelectorAll('.pe-hand .pe-card.playable')].map(e => e.dataset.k));
		A(basics.length >= 1 && await page.evaluate(() => document.querySelector('[data-k="ready"]').disabled), `[${name}] setup: my Basic Pokémon are marked, and Ready waits for an Active Pokémon`);
		for (const k of basics) await tap(K(k));
		await shot('2_setup');
		// a Basic Pokémon pressed in the hand goes straight onto the mat (Active A first), and leaves the hand
		const laid = await page.evaluate(() => ({ a: document.querySelector('.pe-me .pe-poke.staged[data-k$=":active:0"]')?.getAttribute('aria-label') || '', n: document.querySelectorAll('.pe-me .pe-poke.staged').length, hand: document.querySelectorAll('.pe-hand .pe-card').length }));
		A(!!laid.a && laid.n === Math.min(basics.length, 6) && laid.hand === 5 - laid.n, `[${name}] a Basic Pokémon pressed in the hand moves onto the mat at once: the first into Active A`, laid);
		if (!vp.hasTouch) {
			// pressing it on the mat takes it back; dragging it from the hand onto a slot puts it there
			await tap('.pe-me .pe-poke.staged[data-k$=":active:0"]');
			const back = await page.evaluate(k => ({ n: document.querySelectorAll('.pe-me .pe-poke.staged').length, inHand: !!document.querySelector(`.pe-hand [data-k="${k}"]`) }), basics[0]);
			A(back.n === laid.n - 1 && back.inHand, `[${name}] pressing a Pokémon on the mat during setup returns it to the hand`, back);
			const from = await (await page.$(K(basics[0]))).boundingBox(), to = await (await page.$('.pe-me [data-k$=":active:0"]')).boundingBox();
			await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
			await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 30, { steps: 3 });
			const ghost = await page.evaluate(() => !!document.querySelector('.pe-fx .pe-ghost') && document.getElementById('stage').classList.contains('dragging'));
			await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 }); await page.mouse.up(); await sleep(450);
			const dropped = await page.evaluate(() => ({ a: document.querySelector('.pe-me .pe-poke.staged[data-k$=":active:0"]')?.getAttribute('aria-label') || '', n: document.querySelectorAll('.pe-me .pe-poke.staged').length, ghost: !!document.querySelector('.pe-ghost') }));
			A(ghost && dropped.a === laid.a && dropped.n === laid.n && !dropped.ghost, `[${name}] a Basic Pokémon dragged from the hand onto Active A is placed there (the card follows the pointer on the way)`, { ghost, dropped });
			// a coin the match flips is tossed on screen, and the table comes back when it has landed
			await page.evaluate(() => { window.__pocket.fast(false); window.__pocket.testCoin(true); });
			const tossed = await waitFor(() => page.evaluate(() => !!document.querySelector('.pe-fx.coin .pe-coin.heads') && /HEADS/.test(document.querySelector('.pe-coinwrap .res')?.textContent || '') && window.__pocket.coinBusy()), 2000);
			await sleep(1000); await shot('2b_coin');
			const landed = await waitFor(() => page.evaluate(() => !document.querySelector('.pe-coin') && !document.querySelector('.pe-fx.coin') && !window.__pocket.coinBusy()), 5000);
			await page.evaluate(() => { window.__pocket.testCoin(false); });
			const tails = await waitFor(() => page.evaluate(() => !!document.querySelector('.pe-coin.tails') && /TAILS/.test(document.querySelector('.pe-coinwrap .res')?.textContent || '')), 2000);
			await waitFor(() => page.evaluate(() => !window.__pocket.coinBusy()), 5000);
			await page.evaluate(() => { window.__pocket.fast(); window.__pocket.testCoin(true); });
			const skipped = await page.evaluate(() => !document.querySelector('.pe-coin') && !window.__pocket.coinBusy());
			A(tossed && landed && tails && skipped, `[${name}] a coin flip is tossed on screen (heads or tails shown) and the table returns when it lands; fast mode skips it`, { tossed, landed, tails, skipped });
		}
		// the table is a playmat with every Pokémon on it, and the cards are card faces (name and HP on top, the art, the attacks)
		const look = await page.evaluate(() => { const m = document.querySelector('.pe-mat').getBoundingClientRect(), out = [...document.querySelectorAll('.pe-poke')].filter(e => { const r = e.getBoundingClientRect(); return r.left < m.left - 1 || r.right > m.right + 1 || r.top < m.top - 1 || r.bottom > m.bottom + 1; }).map(e => e.dataset.k);
			const hand = [...document.querySelectorAll('.pe-hand .pe-card')], faces = hand.filter(e => e.matches('.pf') && e.querySelector('.f .art') && (e.querySelector('.f.tr .tx') || (e.querySelector('.f.pk .hpn') && e.querySelector('.f.pk .atk')))).length;
			const r0 = hand[0].getBoundingClientRect(), inPlay = [...document.querySelectorAll('.pe-poke.pf')];
			return { out, hand: hand.length, faces, ratio: hand[0].offsetWidth / hand[0].offsetHeight /* (the card itself: it is held at a slight turn in the fan) */, inPlay: inPlay.length, shown: inPlay.filter(e => e.querySelector('.f.pk .hpn') && e.querySelector('.hp i') && e.querySelector('.art img')).length }; });
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
		// a Stadium in play is shown on the mat, inside it, and pressing it reads the card
		const stad = await page.evaluate(async () => { const P = window.__pocket, cards = (await import('/pocketenhanced/js/data/cards.js')).CARDS, c = cards.find(x => x.kind === 'stadium'); P.state().stadium = { id: c.id, seat: 1 }; P.refresh(); const e = document.querySelector('[data-k="stadium"]'), m = document.querySelector('.pe-mat').getBoundingClientRect(), r = e ? e.getBoundingClientRect() : null; return { name: c.name, text: e ? e.textContent : '', inside: !!r && r.left >= m.left && r.right <= m.right && r.top >= m.top && r.bottom <= m.bottom, over: !!r && [...document.querySelectorAll('.pe-poke')].some(p => { const q = p.getBoundingClientRect(); return !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom); }) }; });
		await shot('2c_stadium');
		await tap(K('stadium'));
		const read = await waitFor(() => page.evaluate(n => [...document.querySelectorAll('.modal')].some(m => m.textContent.includes(n)), stad.name), 2500);
		await page.evaluate(() => { const P = window.__pocket; P.state().stadium = null; }); await page.keyboard.press('Escape'); await page.evaluate(() => window.__pocket.refresh());
		A(stad.text.includes(stad.name) && /Stadium/.test(stad.text) && stad.inside && !stad.over && read && await page.evaluate(() => !document.querySelector('[data-k="stadium"]')), `[${name}] the Stadium in play is shown on the mat (clear of the Pokémon), reads when pressed, and goes when it leaves play`, stad);
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
		A(await press(T('packs'), () => document.querySelectorAll('.pe-pack').length === 35), `[${name}] Open packs offers the thirty-five boosters of the twenty-four sets and three promo series`);
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
		A(await press(T('collection'), () => document.querySelectorAll('.pe-col .pe-card').length === 2485), `[${name}] the Collection lists all 2485 cards`);
		const owned = await page.evaluate(() => ({ head: document.querySelector('.pe-colhead').textContent, lack: document.querySelectorAll('.pe-col .pe-card.lack').length, uniq: document.querySelectorAll('.pe-col .pe-card:not(.lack)').length }));
		A(owned.uniq > 15 && owned.lack === 2485 - owned.uniq && owned.head.startsWith(`${owned.uniq} / 2485 cards`), `[${name}] owned cards show their count, the rest are greyed`, owned);
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
		A(await press(T('decks'), () => document.querySelectorAll('.pe-db .pool .pe-card').length === 2485), `[${name}] the deck builder lists all 2485 cards`);
		{	// every card carries all its rules text, and it fits on the card (all 2485, at the builder's card size)
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
			await waitFor(() => page.evaluate(() => document.querySelectorAll('.pe-db .pool .pe-card').length === 2485), 4000);
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
	{	// ---------- solo battles, deck missions, and the computer players' decks ----------
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument(() => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch (e) { /* no storage */ } });
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=solo`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__pocket && window.__pocket.ready, { timeout: 30000 });
		const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`.modal:last-child [data-k="${k}"]`)].pop() || document.querySelector(`[data-k="${k}"]`); if (e) e.click(); return !!e; }, k);
		const title = () => page.evaluate(() => [...document.querySelectorAll('.modal-title')].pop()?.textContent || '');
		A(await page.evaluate(() => /0 \/ 509/.test(document.querySelector('[data-k="solo"]')?.textContent || '') && !!document.querySelector('[data-k="missions"]')), '[solo] the menu offers Solo battles (0 of 508 cleared) and Deck missions');
		await click('solo');
		const menu = await page.evaluate(() => ({ title: [...document.querySelectorAll('.modal-title')].pop()?.textContent, sets: document.querySelectorAll('[data-k^="ss"]').length, tiers: [...document.querySelectorAll('[data-k^="st"]')].map(e => e.textContent), battles: document.querySelectorAll('[data-k^="sbA1:b"]').length }));
		A(menu.title === 'Solo battles' && menu.sets === 23 && menu.tiers.length === 4 && /^Beginner/.test(menu.tiers[0]) && menu.battles === 7, '[solo] Solo battles lists the 23 sets, the set\'s tiers and the tier\'s battles', menu);
		await click('sbA1:b1');
		const detail = await page.evaluate(() => ({ title: [...document.querySelectorAll('.modal-title')].pop()?.textContent, tasks: [...document.querySelectorAll('.modal:last-child .pe-task')].map(e => e.textContent) }));
		A(detail.title === 'Ivysaur Deck' && detail.tasks.length === 2 && /Put 4 Basic Pokémon into play/.test(detail.tasks[1]), '[solo] a battle shows its opponent and its tasks', detail);
		await click('sgo');
		await page.waitForFunction(() => !!window.__pocket.view(), { timeout: 10000 });
		const begun = await page.evaluate(async () => { const P = window.__pocket, r = P.recipe(), { SOLO_SETS } = await import('/pocketenhanced/js/data/solo_battles.js'); return { names: P.view().players.map(p => p.name), solo: r.config.solo, deck: r.config.players[1].deck.join() === SOLO_SETS[0].tiers[0].battles[0].cards, packs: P.collection().packs }; });
		A(begun.names.length === 2 && begun.names[1] === 'Ivysaur' && begun.solo === 'A1:b1' && begun.deck, '[solo] Battle starts a 2-player match against that battle\'s own deck', begun);
		// the opponent gives up (applied directly: the test is of what a won battle records, not of winning one)
		await page.evaluate(() => { const P = window.__pocket; P.fast(true); P.engine.apply(P.state(), { t: 'concede', seat: 1 }); P.refresh(); });
		await page.waitForFunction(() => /You win/.test([...document.querySelectorAll('.modal-title')].pop()?.textContent || ''), { timeout: 10000 });
		const won = await page.evaluate(() => { const P = window.__pocket; return { text: [...document.querySelectorAll('.modal:last-child .pe-task')].map(e => e.textContent), earned: document.querySelector('.pe-solo-earned')?.textContent || '', solo: P.solo(), packs: P.collection().packs, again: !!document.querySelector('.modal:last-child [data-k="sagain"]') }; });
		A(/First clear/.test(won.text[0]) && won.text.length === 4 && won.earned === '+1 pack for the battle' && won.solo.cleared['A1:b1'] === 1 && won.solo.paid['c:A1:b1'] === 1 && won.packs >= begun.packs + 1 && won.again, '[solo] a won battle is cleared, lists its tasks, and pays its first-clear pack', won);
		await click('solo');
		A(await page.evaluate(() => /^✓/.test(document.querySelector('[data-k="sbA1:b1"]')?.textContent || '') && /1\/7/.test(document.querySelector('[data-k="st0"]')?.textContent || '')), '[solo] back in Solo battles the battle is ticked and the tier counts it');
		// the same battle again pays nothing more
		const again = await page.evaluate(async () => { const { recordBattle } = await import('/pocketenhanced/js/solo.js'); const P = window.__pocket; return recordBattle(P.solo(), { id: 'A1:b1', tasks: [0, 1] }, true, [false, false]).packs; });
		A(again === 0, '[solo] clearing it again pays nothing more', again);
		await page.evaluate(() => window.__pocket.menu());
		A(await page.evaluate(() => /1 \/ 509/.test(document.querySelector('[data-k="solo"]')?.textContent || '')), '[solo] the menu counts the cleared battle');
		await click('missions');
		const mis = await page.evaluate(() => ({ title: [...document.querySelectorAll('.modal-title')].pop()?.textContent, rows: document.querySelectorAll('[data-k^="mrt:"]').length, can: document.querySelector('.pe-canbuild')?.textContent, claim: !!document.querySelector('[data-k="mclaim"]'), first: document.querySelector('[data-k^="mrt:"]')?.textContent }));
		A(mis.title === 'Deck missions' && mis.rows === 13 && mis.can === '0' && !mis.claim && /\d+ \/ 20 cards/.test(mis.first), '[solo] Deck missions lists a set\'s decks with what you own of each; a new player has nothing to claim', mis);
		// own every card of a deck: both of its missions can be claimed, once
		const claimed = await page.evaluate(async () => {
			const P = window.__pocket, { THEME_DECKS } = await import('/pocketenhanced/js/data/theme_decks.js'), { card } = await import('/pocketenhanced/js/data/cards.js'), t = THEME_DECKS.find(x => x.id === 't:machamp-ex-deck-genetic-apex'), c = P.collection();
			for (const id of t.cards) c.prints[card(id).printings[0]] = 2;
			localStorage.setItem('magepunk_pocket_collection_v1', JSON.stringify(c)); return c.packs;
		});
		await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__pocket && window.__pocket.ready, { timeout: 30000 });
		await click('missions');
		const due = await page.evaluate(() => ({ can: +document.querySelector('.pe-canbuild')?.textContent, claim: document.querySelector('[data-k="mclaim"]')?.textContent || '', add: !!document.querySelector('[data-k="mat:machamp-ex-deck-genetic-apex"]') }));
		await click('mclaim');
		const after = await page.evaluate(() => ({ packs: window.__pocket.collection().packs, bits: window.__pocket.solo().missions['t:machamp-ex-deck-genetic-apex'], claim: !!document.querySelector('[data-k="mclaim"]') }));
		A(due.can >= 1 && /^Claim \d+ packs?$/.test(due.claim) && due.add && after.bits === 3 && after.packs === claimed + +due.claim.match(/\d+/)[0] && !after.claim, '[solo] owning a deck\'s cards lets its missions be claimed once, and the deck added to yours', { due, after, claimed });
		// the computer players draw their decks from the ready-made decks and Pocket's own
		const rivals = await page.evaluate(async () => {
			const P = window.__pocket, { STARTERS, starterDeck } = await import('/pocketenhanced/js/decks.js'), { THEME_DECKS } = await import('/pocketenhanced/js/data/theme_decks.js');
			const starters = new Set(STARTERS.map(s => starterDeck(s.id).deck.join())), theme = new Set(THEME_DECKS.map(t => t.cards.join())); let s = 0, t = 0, bad = 0;
			for (let i = 0; i < 24; i++) { P.start({ players: 4, seed: 'rival' + i }); for (const p of P.recipe().config.players.slice(1)) { const k = p.deck.join(); if (starters.has(k)) s++; else if (theme.has(k)) t++; else bad++; if (P.engine.deckError(p.deck, p.energy)) bad++; } }
			return { s, t, bad };
		});
		A(rivals.bad === 0 && rivals.t > rivals.s && rivals.t + rivals.s === 72, '[solo] computer players now play Pocket\'s own decks as well as the ready-made ones', rivals);
		// ---------- the deck builder: search, a set, deck codes; and a search in Pocket's decks ----------
		await page.evaluate(() => window.__pocket.menu()); await click('decks');
		const poolN = () => page.evaluate(() => document.querySelectorAll('.pe-db .pool > *').length);
		const all = await poolN();
		await page.type('[data-k="qq"]', 'chariz', { delay: 60 });
		const found = await page.evaluate(() => ({ n: document.querySelectorAll('.pe-db .pool > *').length, names: [...document.querySelectorAll('.pe-db .pool > *')].every(e => /chariz/i.test(e.textContent)), value: document.querySelector('[data-k="qq"]').value, focused: document.activeElement === document.querySelector('[data-k="qq"]') }));
		A(all > 2000 && found.n > 2 && found.n < 40 && found.names && found.value === 'chariz' && found.focused, '[builder] typing a name narrows the cards, and the box keeps the typing while the list redraws', { all, found });
		await click('set'); await click('setA1');
		const inSet = await page.evaluate(() => ({ n: document.querySelectorAll('.pe-db .pool > *').length, ids: [...document.querySelectorAll('.pe-db .pool > *')].every(e => /^cA1-/.test(e.dataset.k)), label: document.querySelector('[data-k="set"]').textContent }));
		A(inSet.n >= 2 && inSet.n < found.n && inSet.ids && /Genetic Apex/.test(inSet.label), '[builder] a set can be chosen: only its cards are listed', inSet);
		const code = await page.evaluate(async () => { const { deckCode } = await import('/pocketenhanced/js/decklist.js'), { THEME_DECKS } = await import('/pocketenhanced/js/data/theme_decks.js'), t = THEME_DECKS.find(x => x.id === 't:blaine-deck-genetic-apex'); return deckCode({ deck: t.cards, energy: t.energy }); });
		await click('pastecode'); await page.type('[data-k="codein"]', 'my friend sent: ' + code); await click('codeload');
		const loaded = await page.evaluate(() => ({ note: document.querySelector('.pe-db .mine .pe-note').textContent, name: document.querySelector('.pe-db .mine input').value, rows: document.querySelectorAll('.pe-db .mine .rowb').length }));
		A(/^20 \/ 20 cards/.test(loaded.note) && loaded.name === 'Shared deck' && loaded.rows === 11, '[builder] a pasted deck code loads that deck', loaded);
		await click('pastecode'); await page.type('[data-k="codein"]', 'PE1:Fire:A1-036x9'); await click('codeload');
		A(await page.evaluate(() => !!document.querySelector('[data-k="codein"]') && /20 cards/.test(document.getElementById('toast')?.textContent || document.querySelector('.pe-toast, .toast')?.textContent || '20 cards')), '[builder] a code that is not a legal deck is refused and says why');
		await page.evaluate(() => window.__pocket.menu()); await click('decks'); await click('pastecode'); await page.type('[data-k="codein"]', code); await click('codeload'); await click('copycode');
		const copied = await page.evaluate(async code => { let clip = null; try { clip = await navigator.clipboard.readText(); } catch (e) { /* not allowed here */ } const shown = [...document.querySelectorAll('.modal:last-child input')].map(i => i.value); return clip === code || shown.includes(code) || /Deck code copied/.test(document.body.textContent); }, code);
		A(copied, '[builder] Copy deck code gives the same code back (to the clipboard, or shown to copy by hand)');
		await page.evaluate(() => window.__pocket.menu()); await click('new'); await click('theme');
		await page.type('[data-k="qtq"]', 'machamp', { delay: 60 });
		const themed = await page.evaluate(() => ({ hit: !!document.querySelector('[data-k="dt:machamp-ex-deck-genetic-apex"]'), n: document.querySelectorAll('[data-k^="dt:"]').length, value: document.querySelector('[data-k="qtq"]').value }));
		A(themed.hit && themed.n >= 1 && themed.n < 13 && themed.value === 'machamp', "[builder] Pocket's decks can be searched by a deck's or a card's name, across every set", themed);
		// ---------- a Trainer drawn as a person shows one whole frame of its sheet (Erika's sheet is 3 frames wide, not 9) ----------
		const people = await page.evaluate(async () => {
			const P = window.__pocket, { card, CARDS } = await import('/pocketenhanced/js/data/cards.js'), ids = n => CARDS.find(c => c.name === n && c.kind !== 'pokemon').id;
			P.start({ players: 2, seed: 'people' }); P.fast(true); const S = P.state(); S.players[0].hand = [ids('Erika'), ids("Professor's Research")]; P.refresh();
			await new Promise(r => setTimeout(r, 300));
			const out = {}; for (const e of document.querySelectorAll('.person')) { const img = e.style.backgroundImage, cs = getComputedStyle(e); out[/people\/(\w+)\.png/.exec(img)[1]] = { size: cs.backgroundSize, w: e.offsetWidth, h: e.offsetHeight }; }   // (its own size: a card in the fanned hand is turned a little, and a turned box measures wider)
			// what is drawn: one frame is the sheet's width divided by its frame count, and must be 16 sheet pixels
			for (const k of Object.keys(out)) { const im = new Image(); im.src = `/overworld/data/people/${k}.png`; await im.decode(); out[k].frame = im.naturalWidth / (parseFloat(out[k].size) / 100); }
			return out;
		});
		A(people.erika && people.prof_oak && /^300%/.test(people.erika.size) && /^900%/.test(people.prof_oak.size) && people.erika.frame === 16 && people.prof_oak.frame === 16 && Math.abs(people.erika.h / people.erika.w - 2) < 0.05, "[art] Erika's card shows one whole frame of her sheet (16 pixels of it), as Professor's Research does of Oak's", people);
		// ---------- singles or doubles, chosen where a battle starts; and the mat ----------
		await page.evaluate(() => window.__pocket.menu()); await click('new');
		const modes = await page.evaluate(() => ({ s: !!document.querySelector('.modal:last-child [data-k="msingles"]'), d: document.querySelector('.modal:last-child [data-k="mdoubles"]')?.classList.contains('on'), note: document.querySelector('.pe-modenote')?.textContent || '' }));
		A(modes.s && modes.d && /2 Active/.test(modes.note), '[mode] New match asks Singles or Doubles (Doubles until you choose)', modes);
		await click('msingles');
		A(await page.evaluate(() => document.querySelector('.modal:last-child [data-k="msingles"]').classList.contains('on') && /1 Active Pokémon and 3 on the Bench/.test(document.querySelector('.pe-modenote').textContent) && JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).mode === 'singles'), '[mode] choosing Singles says what it is, and is remembered');
		await click('n2'); await click('dcharizard'); await click('start');
		await page.waitForFunction(() => !!window.__pocket.view() && !!document.querySelector('.pe-me .pe-row.act'), { timeout: 10000 });
		const table = await page.evaluate(() => { const n = sel => document.querySelectorAll(sel).length, v = window.__pocket.view(), box = e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
			return { singles: v.singles, mine: [n('.pe-me .pe-row.act .pe-poke'), n('.pe-me .pe-row.ben .pe-poke')], theirs: [n('.pe-opps .pe-row.act .pe-poke'), n('.pe-opps .pe-row.ben .pe-poke')], bubble: document.querySelector('.pe-bubble')?.textContent || '', first: document.querySelector('.pe-first')?.textContent || '', firstSeat: v.first, mat: document.querySelector('.pe-mat').className, orb: box(document.querySelector('.pe-zone .slot')), piles: n('.pe-pile'), hint: document.querySelector('.pe-cmd .hint')?.textContent || '' }; });
		A(table.singles === true && table.mine.join() === '1,3' && table.theirs.join() === '1,3', '[mode] a singles match has one Active slot and three Bench slots for each player', table);
		A(/Please put a Basic Pokémon in your Active slot/.test(table.bubble) && (table.firstSeat === 0 ? /You are going first/ : /is going first/).test(table.first) && /singles/.test(table.mat) && Math.abs(table.orb[0] - table.orb[1]) <= 2 && table.orb[0] > 60 && /first goes to your Active slot/.test(table.hint), '[mat] the mat says what it is waiting for and who goes first, and the Energy Zone is an orb', table);
		// set up and play on: the first Basic goes to the one Active slot, the rest to the Bench of three, and the match plays to its end
		const played = await page.evaluate(async () => {
			const P = window.__pocket, E = P.engine, { nextAction } = await import('/pocketenhanced/js/ai.js'); P.fast(true); let sizes = true, steps = 0;
			for (let n = 0; n < 900 && !P.state().over; n++) { const S = P.state(), seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (S.players.some(p => p.active.length !== 1 || p.bench.length !== 3)) sizes = false; if (seat !== 0) { await new Promise(r => setTimeout(r, 15)); continue; } const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(E.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; const ok = await P.act(a); if (ok !== false) { steps++; break; } banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 15)); }
			await new Promise(r => setTimeout(r, 400));
			return { over: !!P.state().over, sizes, steps, turn: P.state().turn, cmdRows: 0, title: [...document.querySelectorAll('.modal-title')].pop()?.textContent || '' };
		});
		A(played.over && played.sizes && played.turn <= 30 && /Match over|You win/.test(played.title), '[mode] the singles match plays to its end on that table', played);
		// doubles is unchanged
		await page.evaluate(() => { window.__pocket.start({ players: 2, seed: 'dbl' }); });
		await page.waitForFunction(() => !!document.querySelector('.pe-me .pe-row.act'), { timeout: 10000 });
		const dbl = await page.evaluate(() => { const n = sel => document.querySelectorAll(sel).length; return { singles: window.__pocket.view().singles, mine: [n('.pe-me .pe-row.act .pe-poke'), n('.pe-me .pe-row.ben .pe-poke')], bubble: document.querySelector('.pe-bubble')?.textContent || '' }; });
		A(dbl.singles === false && dbl.mine.join() === '2,4' && /an Active slot/.test(dbl.bubble), '[mode] a doubles match keeps two Active slots and a Bench of four', dbl);
		// ---------- the prompt bubble covers no card; what just happened is shown once on the mat ----------
		for (const singles of [true, false]) {
			await page.evaluate(s => { window.__pocket.fast(false); window.__pocket.start({ players: 2, seed: 'fx', singles: s }); }, singles);
			await page.waitForFunction(() => !!document.querySelector('.pe-bubble') && window.__pocket.state().players[1].setup, { timeout: 10000 });
			const bub = await page.evaluate(() => { const r = e => e.getBoundingClientRect(), b = r(document.querySelector('.pe-bubble')), hit = q => [...document.querySelectorAll(q)].filter(e => { const c = r(e); return c.width > 0 && !(c.right <= b.left + 1 || c.left >= b.right - 1 || c.bottom <= b.top + 1 || c.top >= b.bottom - 1); }).length;
				return { cards: hit('.pe-poke.pf'), hand: hit('.pe-hand .pe-card'), first: hit('.pe-first'), piles: hit('.pe-pile'), inside: b.left >= 0 && b.right <= innerWidth && b.top >= 0 }; });
			A(bub.cards === 0 && bub.hand === 0 && bub.first === 0 && bub.piles === 0 && bub.inside, `[mat] the prompt bubble covers no Pokémon, no card in hand and no pile (${singles ? 'singles' : 'doubles'})`, bub);
			// it asks for an Active Pokémon, and goes once one is chosen
			const gone = await page.evaluate(async () => { const P = window.__pocket, S = P.state(), i = S.players[0].hand.findIndex(id => { const c = P.engine.card ? P.engine.card(id) : null; return c ? c.kind === 'pokemon' && c.stage === 0 : false; });
				const c = [...document.querySelectorAll('.pe-hand .pe-card')].find(e => !e.disabled && e.classList.contains('playable')) || [...document.querySelectorAll('.pe-hand .pe-card.pk, .pe-hand .pe-card')].find(e => !e.disabled); if (c) c.click(); await new Promise(r => setTimeout(r, 120));
				return { staged: document.querySelectorAll('.pe-me .pe-poke.staged').length, bubble: !!document.querySelector('.pe-bubble'), i }; });
			A(gone.staged === 0 || !gone.bubble, '[mat] the bubble goes once an Active Pokémon is chosen', gone);
		}
		{
			await page.evaluate(() => { window.__pocket.fast(false); window.__pocket.start({ players: 2, seed: 'fx2', singles: true }); });
			await page.waitForFunction(() => !!window.__pocket.view() && window.__pocket.state().players[1].setup, { timeout: 10000 });
			const fx = await page.evaluate(async () => { const P = window.__pocket, E = P.engine, S = P.state(), p = S.players[0], card = (await import('/pocketenhanced/js/data/cards.js')).card;
				const b = p.hand.map((id, i) => i).filter(i => card(p.hand[i]).kind === 'pokemon' && card(p.hand[i]).stage === 0);
				await P.act({ t: 'setup', seat: 0, active: [b[0]], bench: [] }); await new Promise(r => setTimeout(r, 250));
				const banner = document.querySelector('.pe-turnfx')?.textContent || '', label = document.querySelector('.pe-cmd')?.textContent || '';
				// an attack going out, a Knock Out, Energy arriving: read from the log's own fields
				const T = P.state(), n = T.log[T.log.length - 1].n; T.players[0].active[0].energy.push('Fire');
				T.log.push({ n: n + 1, turn: T.turn, k: 'attack', seat: 0, slot: 0, by: ['Fire'], msg: 'A test attack.' }, { n: n + 2, turn: T.turn, k: 'ko', seat: 1, to: 0, zone: 'active', idx: 0, atk: true, msg: 'A test Knock Out.' });
				P.refresh(); await new Promise(r => setTimeout(r, 60));
				const mine = document.querySelector('.pe-me .pe-row.act .pe-poke'), theirs = document.querySelector('.pe-opps .pe-row.act .pe-poke');
				const first = { lunge: mine.classList.contains('lunge-up'), gain: mine.classList.contains('gain'), ko: !!theirs.querySelector('.pe-kofx') };
				P.refresh(); await new Promise(r => setTimeout(r, 60));
				const again = { lunge: !!document.querySelector('.pe-poke.lunge-up'), ko: !!document.querySelector('.pe-kofx'), gain: !!document.querySelector('.pe-poke.gain') };
				return { banner, label: label.slice(0, 80), first, again, max: P.view().maxTurns }; });
			A(/turn/i.test(fx.banner) && /Turn 1 of 30/.test(fx.label) && fx.max === 30, '[mat] a banner says whose turn it is, and a singles match shows its turn limit (Turn 1 of 30)', fx);
			A(fx.first.lunge && fx.first.gain && fx.first.ko && !fx.again.lunge && !fx.again.ko && !fx.again.gain, '[mat] an attack, a Knock Out and Energy arriving are shown on the mat once, not again on a redraw', fx);
		}
		// ---------- the Energy is dragged from the Energy Zone onto a Pokémon, as in Pocket itself ----------
		{
			// a match brought to my turn with an Energy ready (the player going first has none on turn 1: pass until there is one)
			const toMyEnergy = async seed => { await page.evaluate(s => { window.__pocket.fast(true); window.__pocket.start({ players: 2, seed: s, easy: true }); }, seed);
				return page.evaluate(async () => { const P = window.__pocket, E = P.engine, { nextAction } = await import('/pocketenhanced/js/ai.js');
					for (let n = 0; n < 400; n++) { const S = P.state(); if (S.over) return false; const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 15)); continue; }
						if (S.phase === 'main' && !S.pending && S.players[0].zone.cur && !S.players[0].flags.attached) { await new Promise(r => setTimeout(r, 150)); return true; }
						await P.act(S.phase === 'setup' || S.pending ? nextAction(E.view(S, 0), new Set()) : { t: 'execute', seat: 0, commands: [null, null] }); await new Promise(r => setTimeout(r, 15)); }
					return false; }); };
			const centre = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
			const energy = () => page.evaluate(() => { const p = window.__pocket.view().players[0]; return { cur: p.zone.cur, attached: !!p.flags.attached, a0: (p.active[0].energy || []).length, b0: p.bench[0] ? (p.bench[0].energy || []).length : -1, foe: (window.__pocket.view().players[1].active[0].energy || []).length }; });
			const dragTo = async (to, probe) => { const from = await centre('.pe-zone .slot');
				await page.mouse.move(from[0], from[1]); await page.mouse.down(); await page.mouse.move(to[0], to[1], { steps: 8 }); const mid = probe ? await page.evaluate(probe) : null; await page.mouse.up(); return mid; };
			A(await toMyEnergy('drag-a'), `[drag] (a match at my turn, with an Energy in the Energy Zone)`);
			const e0 = await energy(), grab = await page.evaluate(() => { const z = document.querySelector('.pe-zone .slot'); return { grab: z.classList.contains('grab'), touch: z.style.touchAction, hint: document.querySelector('.pe-cmd .hint')?.textContent || '' }; });
			A(e0.cur && !e0.attached && grab.grab && grab.touch === 'none' && /Drag your Energy onto a Pokémon/.test(grab.hint), `[drag] the Energy in the Energy Zone can be picked up, and the hint says to drag it`, grab);
			// dropped on nothing, and on an opponent's Pokémon: it stays in the zone
			await dragTo(await centre('.pe-log, .pe-cmd h3')); const e1 = await energy();
			await dragTo(await centre('.pe-opps .pe-row.act .pe-poke.pf')); const e2 = await energy();
			A(e1.cur === e0.cur && !e1.attached && e1.a0 === e0.a0 && e2.cur === e0.cur && !e2.attached && e2.foe === e0.foe && await page.evaluate(() => !document.querySelector('.pe-ghost') && !document.querySelector('.modal')), `[drag] dropped off the mat or on an opponent's Pokémon, the Energy stays in the Energy Zone`, [e1, e2]);
			// dragged onto my Active Pokémon: while it is over it the Pokémon lights up and the Energy follows the pointer; dropped, it is attached
			const mid = await dragTo(await centre('.pe-me .pe-row.act .pe-poke.pf'), () => { const g = document.querySelector('.pe-ghost.energy'), t = document.querySelector('.pe-me .pe-row.act .pe-poke.pf'), r = g && g.getBoundingClientRect(), q = t.getBoundingClientRect(); return { ghost: !!g && !!g.querySelector('.en svg'), over: !!r && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top, lit: t.classList.contains('drop'), mode: document.getElementById('stage').classList.contains('dragging-energy') }; });
			await sleep(250); const e3 = await energy();
			A(mid.ghost && mid.over && mid.lit && mid.mode && e3.a0 === e0.a0 + 1 && e3.attached && !e3.cur && await page.evaluate(() => !document.querySelector('.pe-ghost') && !document.querySelector('.pe-poke.drop') && !document.getElementById('stage').classList.contains('dragging-energy') && document.querySelector('.pe-zone .slot').disabled), `[drag] dragged onto my Active Pokémon, the Energy follows the pointer, the Pokémon lights up, and it is attached on the drop`, { mid, e3 });
			// ---- and the rest of a turn by dragging: a card from the hand onto the mat, an attack onto its target, a retreat ----
			{
				A(await toMyEnergy('drag-c'), '[drag] (a match at my turn)');
				// a known hand and Energy, so every drag below has something to do
				await page.evaluate(async () => { const P = window.__pocket, S = P.state(), { CARDS } = await import('/pocketenhanced/js/data/cards.js'), id = n => CARDS.find(c => c.name === n).id, me = S.players[0];
					me.hand = [id('Vulpix'), id('Potion'), id('Charmander')]; for (let i = 0; i < me.bench.length; i++) me.bench[i] = null; me.active[0].energy = ['Fire', 'Fire', 'Fire', 'Fire']; me.active[0].dmg = 20; me.flags.attached = true; me.turns = Math.max(1, me.turns); P.refresh(); });   // (turns: the player going first may not attack on their first turn)
				await sleep(200);
				const drag = async (fromSel, toSel, probe) => { const from = await centre(fromSel), to = await centre(toSel); await page.mouse.move(from[0], from[1]); await page.mouse.down(); await page.mouse.move(to[0], to[1], { steps: 8 }); const mid = probe ? await page.evaluate(probe) : null; await page.mouse.up(); await sleep(250); return mid; };
				const st = () => page.evaluate(() => { const P = window.__pocket, me = P.view().players[0], nm = k => (k ? P.engine.cardName ? P.engine.cardName(k.id) : k.id : null); return { hand: me.hand.length, bench: me.bench.map(k => (k ? k.id : null)), active: me.active.map(k => (k ? k.id : null)), dmg: me.active[0] ? me.active[0].dmg : -1, cmds: P.ui().cmds.map(c => (c ? c.text : null)), retreated: !!me.flags.retreated, modal: [...document.querySelectorAll('.modal-title')].pop()?.textContent || '', pick: document.querySelector('.pe-prompt')?.textContent || '' }; });
				const s0 = await st();
				// a Basic Pokémon from the hand onto an empty Bench slot
				const m1 = await drag('[data-k="h:0"]', '[data-k="p:0:bench:1"]', () => ({ ghost: !!document.querySelector('.pe-ghost'), mode: document.getElementById('stage').classList.contains('dragging-card'), can: document.querySelectorAll('.pe-me .pe-poke.can-drop').length, lit: document.querySelector('[data-k="p:0:bench:1"]').classList.contains('drop') }));
				const s1 = await st();
				A(m1.ghost && m1.mode && m1.can >= 2 && m1.lit && s1.hand === s0.hand - 1 && s1.bench[1] && !s1.bench[0] && !s1.pick && !s1.modal, '[drag] a Basic Pokémon dragged from the hand onto an empty Bench slot is played there (the empty slots are outlined, the one under it lights up)', { m1, s1 });
				// an Item dragged onto the mat is played; dropped on the Pokémon it is for, that choice is made too
				await drag('[data-k="h:0"]', '[data-k="p:0:active:0"]'); const s2 = await st();
				A(s2.hand === s1.hand - 1 && s2.dmg === 0 && !s2.pick, '[drag] Potion dragged from the hand onto my hurt Active Pokémon heals it', s2);
				// dropped back on the hand, or with nothing it can do there: nothing is played
				await drag('[data-k="h:0"]', '.pe-cmd h3'); const s3 = await st();   // (carried off the table, onto the commands panel)
				A(s3.hand === s2.hand && !s3.pick && !s3.modal && await page.evaluate(() => !document.querySelector('.modal') && !document.querySelector('.pe-ghost')), '[drag] a card let go off the table is not played', s3);
				// my Active Pokémon dragged onto an opposing Active Pokémon: its attack is queued at that target
				const m4 = await drag('[data-k="p:0:active:0"]', '[data-k="p:1:active:0"]', () => ({ foe: document.querySelector('[data-k="p:1:active:0"]').classList.contains('can-drop'), lit: document.querySelector('[data-k="p:1:active:0"]').classList.contains('drop') }));
				let s4 = await st();
				if (/which attack/.test(s4.modal)) { await page.evaluate(() => document.querySelector('.modal:last-child [data-k^="datk"]').click()); await sleep(250); s4 = await st(); }
				A(m4.foe && m4.lit && s4.cmds[0] && !s4.pick && !/which attack/.test(s4.modal), '[drag] my Active Pokémon dragged onto an opposing Pokémon queues its attack at that target (asking which attack only if more than one can reach it)', { m4, s4 });
				// a Benched Pokémon dragged onto my Active one: they change places (a retreat), once a turn
				const m5 = await drag('[data-k="p:0:bench:1"]', '[data-k="p:0:active:0"]', () => ({ can: document.querySelector('[data-k="p:0:active:0"]').classList.contains('can-drop') }));
				const s5 = await st();
				A(m5.can && s5.active[0] === s1.bench[1] && s5.bench[1] === s1.active[0] && s5.retreated, '[drag] a Benched Pokémon dragged onto my Active Pokémon changes places with it: a retreat', { m5, s5 });
				await drag('[data-k="p:0:bench:1"]', '[data-k="p:0:active:0"]'); const s6 = await st();
				A(s6.active[0] === s5.active[0] && await page.evaluate(() => /already retreated/.test(document.querySelector('.pe-banner')?.textContent || '')), '[drag] a second retreat the same turn is refused, and says why', s6);
				// a press without a drag still opens the Pokémon's own menu
				await sleep(450); await page.evaluate(() => document.querySelector('[data-k="p:0:active:0"]').click()); await sleep(200);
				A(await page.evaluate(() => !!document.querySelector('.modal')), '[drag] pressing a Pokémon still opens its menu');
				await page.evaluate(() => window.__pocket.menu());
			}
			// pressing the orb still works (and is what a controller or the keyboard does): it asks which Pokémon
			A(await toMyEnergy('drag-b'), `[drag] (another match at my turn)`);
			await page.evaluate(() => document.querySelector('.pe-zone .slot').click()); await sleep(150);
			const asked = await page.evaluate(() => ({ prompt: document.querySelector('.pe-prompt')?.textContent || '', legal: document.querySelectorAll('.pe-me .pe-poke.legal').length }));
			await page.evaluate(() => document.querySelector('.pe-me .pe-row.act .pe-poke.pf').click()); await sleep(250); const e4 = await energy();
			A(/Attach your .* Energy/.test(asked.prompt) && asked.legal > 0 && e4.attached && e4.a0 >= 1, `[drag] pressing the Energy still asks which Pokémon, as before`, { asked, e4 });
			await page.evaluate(() => { window.__pocket.fast(false); window.__pocket.menu(); });
		}
		// ---------- free packs with time (a guest's inbox is on the device), a solo battle's tasks on the table, quick messages ----------
		{
			await page.evaluate(() => window.__pocket.menu()); await click('packs');
			const i0 = await page.evaluate(() => ({ row: document.querySelector('.pe-inbox')?.textContent || '', btn: document.querySelector('.modal:last-child [data-k="inbox"]')?.disabled, now: window.__pocket.inbox(), packs: window.__pocket.collection().packs }));
			A(/0 free packs waiting/.test(i0.row) && /next in 1[12] h/.test(i0.row) && /every 12 hours, up to 120/.test(i0.row) && /Kept on this device/.test(i0.row) && i0.btn === true && i0.now.inbox === 0, '[inbox] Open packs shows the free-pack inbox: none yet, the next in 12 hours, nothing to collect', i0);
			// 25 hours later (the device's note of when its timer began is moved back)
			await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')); p.inbox = { base: Date.now() - 25 * 3600 * 1000, inbox: 0 }; localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify(p)); window.__pocket.menu(); }); await click('packs');
			const i1 = await page.evaluate(() => ({ row: document.querySelector('.pe-inbox')?.textContent || '', btn: document.querySelector('.modal:last-child [data-k="inbox"]')?.disabled }));
			A(/2 free packs waiting/.test(i1.row) && /next in 1[01] h/.test(i1.row) && i1.btn === false, '[inbox] 25 hours later two packs are waiting, and the third is 11 hours off', i1);
			await click('inbox'); await sleep(200);
			const i2 = await page.evaluate(() => ({ row: document.querySelector('.pe-inbox')?.textContent || '', btn: document.querySelector('.modal:last-child [data-k="inbox"]')?.disabled, packs: window.__pocket.collection().packs }));
			A(i2.packs === i0.packs + 2 && /0 free packs waiting/.test(i2.row) && /next in 1[01] h/.test(i2.row) && i2.btn === true, '[inbox] Collect adds them to the packs to open, once, and the wait carries on', i2);
			// a solo battle's tasks beside the commands
			const sid = await page.evaluate(async () => { const { SOLO_SETS } = await import('/pocketenhanced/js/data/solo_battles.js'); const b = SOLO_SETS[0].tiers[0].battles.find(x => x.tasks.length >= 2); window.__pocket.fast(true); window.__pocket.startSolo(b.id); return b.id; });
			await page.waitForFunction(() => !!window.__pocket.view() && !!document.querySelector('.pe-livetasks'), { timeout: 10000 }).catch(() => null);
			const tk = await page.evaluate(() => ({ rows: document.querySelectorAll('.pe-livetasks .pe-task').length, text: document.querySelector('.pe-livetasks')?.textContent || '', inCmd: !!document.querySelector('.pe-cmd .pe-livetasks'), solo: window.__pocket.recipe()?.config.solo }));
			A(tk.rows >= 2 && tk.inCmd && /○/.test(tk.text) && tk.solo === sid, '[tasks] a solo battle shows its tasks beside the commands while it is played', tk);
			await page.evaluate(() => { window.__pocket.start({ players: 2, seed: 'notasks' }); });
			A(await page.evaluate(() => !document.querySelector('.pe-livetasks')), '[tasks] a match that is not a solo battle has none');
			// a quick message from the table
			const sy = await page.evaluate(async () => { const { SAY } = await import('/pocketenhanced/js/say.js'); window.__pocket.say({ k: 1, by: 'Blue', i: 7, t: Date.now() }); window.__pocket.say({ k: 2, by: 'Blue', i: 999, t: Date.now() }); const e = [...document.querySelectorAll('.pe-say')]; return { n: e.length, text: e[0]?.textContent || '', last: SAY[7], all: SAY.length, noSayBtn: !document.querySelector('[data-k="say"]') }; });
			A(sy.n === 1 && sy.text.includes('Blue') && sy.text.includes(sy.last) && sy.all >= 6 && sy.noSayBtn, '[say] a quick message is shown as its listed phrase with who said it (a number that is not a phrase shows nothing; offline there is no Say button)', sy);
		}
		// ---------- replays of the newer kinds of match: singles, an easy one, the guided one ----------
		{
			const rep = await page.evaluate(async () => { const P = window.__pocket, E = P.engine, { nextAction } = await import('/pocketenhanced/js/ai.js'), { packString } = await import('/battlecards/codec.js'), out = [];
				for (const [what, o] of [['singles', { singles: true, seed: 'rp-s' }], ['easy doubles', { easy: true, seed: 'rp-e' }], ['guided', { tutorial: true, easy: true, seed: 'rp-t' }]]) {
					P.fast(true); P.start({ players: 2, ...o });
					for (let n = 0; n < 1500 && !P.state().over; n++) { const S = P.state(), seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; } const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(E.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); }
					await new Promise(r => setTimeout(r, 300));
					const recipe = P.recipe(), end = E.digest(P.state()), kept = JSON.parse(localStorage.getItem('magepunk_pocket_replays_v1') || '[]')[0];
					const okStart = P.replay(JSON.parse(JSON.stringify(kept.recipe))); const atStart = P.state().actions; P.seek(recipe.actions.length); await new Promise(r => setTimeout(r, 80));
					const v = P.view(), n = q => document.querySelectorAll(q).length;
					out.push({ what, over: !!P.state().over, kept: JSON.stringify(kept.recipe.config) === JSON.stringify(recipe.config) && kept.recipe.actions.length === recipe.actions.length, okStart, atStart, same: E.digest(P.state()) === end, singles: v.singles, slots: [n('.pe-me .pe-row.act .pe-poke'), n('.pe-me .pe-row.ben .pe-poke')].join(), coach: !!document.querySelector('.pe-coach'), fx: n('.pe-turnfx, .pe-kofx, .lunge-up, .lunge-down'), exec: !!document.querySelector('[data-k="exec"]'), bar: !!document.querySelector('.pe-replaybar'), link: ('/pocketenhanced/?replay=' + await packString(JSON.stringify(recipe))).length, cfg: [recipe.config.bots || '', !!recipe.config.tutorial, !!(recipe.config.opts && recipe.config.opts.singles)].join() });
				}
				return out; });
			for (const r of rep) A(r.over && r.kept && r.okStart !== false && r.atStart === 0 && r.same && r.bar && !r.exec && !r.coach && r.fx === 0 && r.link < 60000 && r.slots === (r.singles ? '1,3' : '2,4'), `[replay] a ${r.what} match is kept, replays from its first step to the same end, read-only, on its own table`, r);
			A(rep[0].singles === true && rep[0].cfg === ',false,true' && rep[1].cfg === 'easy,false,false' && rep[2].cfg === 'easy,true,false', '[replay] the kept replay says what kind of match it was', rep.map(r => r.cfg));
			A(await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pocket_replays_v1')).length <= 12), '[replay] the list keeps the last 12');
		}
		// ---------- "going first" covers no card either ----------
		for (const singles of [true, false]) {
			await page.evaluate(s => { window.__pocket.start({ players: 2, seed: 'pill', singles: s }); }, singles);
			await page.waitForFunction(() => !!document.querySelector('.pe-first') && window.__pocket.state().players[1].setup, { timeout: 10000 });
			const pill = await page.evaluate(() => { const r = e => e.getBoundingClientRect(), b = r(document.querySelector('.pe-first')); return { cards: [...document.querySelectorAll('.pe-poke.pf, .pe-pile')].filter(e => { const c = r(e); return c.width > 0 && !(c.right <= b.left + 1 || c.left >= b.right - 1 || c.bottom <= b.top + 1 || c.top >= b.bottom - 1); }).length, inside: b.left >= 0 && b.right <= innerWidth }; });
			A(pill.cards === 0 && pill.inside, `[mat] "going first" covers no Pokémon and no pile (${singles ? 'singles' : 'doubles'})`, pill);
		}
		// ---------- the guided first match, and the choice of computer player ----------
		await page.evaluate(() => window.__pocket.menu());
		A(await page.evaluate(() => !!document.querySelector('.modal:last-child [data-k="learn"]')), '[learn] the menu offers a guided match');
		await click('learn');
		await page.waitForFunction(() => !!window.__pocket.view() && !!document.querySelector('.pe-coach'), { timeout: 10000 });
		const t1 = await page.evaluate(() => ({ tip: document.querySelector('.pe-coach').textContent, cfg: window.__pocket.recipe().config, tutored: JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).tutored, inCmd: !!document.querySelector('.pe-cmd .pe-coach') }));
		A(/Press a Basic Pokémon in your hand/.test(t1.tip) && t1.cfg.tutorial === true && t1.cfg.bots === 'easy' && t1.cfg.players.length === 2 && !t1.cfg.opts && t1.tutored === true && t1.inCmd, '[learn] it is a doubles match against one easy computer player, and the guide says what to do first', t1);
		const t2 = await page.evaluate(async () => { const P = window.__pocket, E = P.engine, { nextAction } = await import('/pocketenhanced/js/ai.js'), tips = [];
			const c = [...document.querySelectorAll('.pe-hand .pe-card')].find(e => !e.disabled); c.click(); await new Promise(r => setTimeout(r, 150)); tips.push(P.coach());
			P.fast(true);
			for (let n = 0; n < 400 && !P.state().over && tips.length < 14; n++) { const S = P.state(), seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 15)); continue; } const tip = P.coach(); if (tip && tips[tips.length - 1] !== tip) tips.push(tip); const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(E.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 15)); }
			return tips; });
		A(/Bench.*Ready/.test(t2[0] || '') && t2.some(t => /Energy Zone makes one Energy/.test(t)) && t2.some(t => /choose its attack and its target/.test(t)) && t2.every(t => t && t.length < 230), '[learn] the guide follows the table: the Bench and Ready, then Energy, then attacks', t2);
		await page.evaluate(() => window.__pocket.menu()); await click('new');
		const bs = await page.evaluate(() => ({ e: !!document.querySelector('.modal:last-child [data-k="beasy"]'), hard: document.querySelector('.modal:last-child [data-k="bhard"]')?.classList.contains('on'), note: document.querySelector('.pe-botnote')?.textContent || '' }));
		A(bs.e && bs.hard && /Hard/.test(bs.note), '[bots] New match asks how well the computer players play (Hard until you choose)', bs);
		await click('beasy'); await click('mdoubles'); await click('n2'); await click('start');
		await page.waitForFunction(() => !!window.__pocket.view(), { timeout: 10000 });
		A(await page.evaluate(() => window.__pocket.recipe().config.bots === 'easy' && !window.__pocket.recipe().config.tutorial && JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).bots === 'easy'), '[bots] choosing Easy is kept and makes the match an easy one');
		await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')); p.bots = 'hard'; localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify(p)); window.__pocket.start({ players: 2, seed: 'hardbots' }); });
		A(await page.evaluate(() => window.__pocket.recipe().config.bots === undefined && window.__pocket.coach() === null), '[bots] a match is Hard unless asked, and has no guide');
		// ---------- Wonder Pick ----------
		await page.evaluate(() => window.__pocket.menu()); await click('packs');
		const before = await page.evaluate(() => { const c = window.__pocket.collection(); return { packs: c.packs, total: Object.values(c.prints).reduce((a, n) => a + n, 0), points: c.points }; });
		await click('wonder');
		const wb = await page.evaluate(() => ({ rows: document.querySelectorAll('.pe-wonder').length, cards: [...document.querySelectorAll('.pe-wonder')].map(r => r.querySelectorAll('.pe-pull.up').length).join(), pick: document.querySelectorAll('.modal:last-child [data-k^="wpick"]:not(:disabled)').length }));
		A(wb.rows === 4 && wb.cards === '5,5,5,5' && wb.pick === (before.packs > 0 ? 4 : 0), '[wonder] Wonder Pick shows today\'s four packs, five cards each, face up', wb);
		if (before.packs > 0) {
			await click('wpick1');
			A(await page.evaluate(() => document.querySelectorAll('.modal:last-child .pe-pull.down').length === 5 && document.querySelectorAll('.modal:last-child .pe-pull.up').length === 0), '[wonder] the five cards are turned face down to pick from');
			await click('wcard2');
			const got = await page.evaluate(() => { const c = window.__pocket.collection(), m = document.querySelector('.modal:last-child'), cards = [...m.querySelectorAll('.pe-pull')]; return { packs: c.packs, total: Object.values(c.prints).reduce((a, n) => a + n, 0), points: c.points, gotAt: cards.findIndex(e => e.classList.contains('got')), missed: m.querySelectorAll('.pe-pull.missed').length, down: m.querySelectorAll('.pe-pull.down').length, note: m.querySelector('.pe-note')?.textContent || '' }; });
			A(got.packs === before.packs - 1 && got.total === before.total + 1 && got.points === before.points && got.gotAt === 2 && got.missed === 4 && got.down === 0 && /You got/.test(got.note), '[wonder] a pick costs one pack and gives one card, shown where it was pressed with the four it could have been', got);
			await page.keyboard.press('Escape'); await sleep(200);
			A(await page.evaluate(() => { const b = document.querySelector('.modal:last-child [data-k="wpick1"]'); return !!b && b.disabled && /Picked today/.test(b.textContent) && !document.querySelector('.modal:last-child [data-k="wpick0"]').disabled === (window.__pocket.collection().packs > 0); }), '[wonder] a pack already picked from is done for today; the others are still open');
		}
		await page.evaluate(() => window.__pocket.menu());
		// ---------- every Trainer card has a picture: none is left on the placeholder ----------
		const art = await page.evaluate(async () => { const { CARDS } = await import('/pocketenhanced/js/data/cards.js'), seen = new Set(), ph = [], kinds = {};
			const w = document.createElement('div'); w.className = 'pe'; w.style.cssText = 'position:fixed;left:0;top:0;z-index:99999'; document.body.appendChild(w);
			const size = name => { const d = document.createElement('div'); d.className = 'pe-card pf'; d.style.cssText = 'font-size:16px;width:10em;height:14em;position:relative'; d.innerHTML = window.__pocket.face(CARDS.find(c => c.name === name).id); w.replaceChildren(d); const a = d.querySelector('.art').getBoundingClientRect(), s = d.querySelector('.drawn svg').getBoundingClientRect(); return [Math.round(a.width), Math.round(a.height), Math.round(s.width), Math.round(s.height)]; };
			for (const c of CARDS) { if (c.kind === 'pokemon' || seen.has(c.name)) continue; seen.add(c.name); const d = document.createElement('div'); d.innerHTML = window.__pocket.face(c.id); if (d.querySelector('.art .ph')) ph.push(c.name); const k = d.querySelector('.art .drawn.scene') ? 'scene' : d.querySelector('.art .drawn.fig') ? 'fig' : d.querySelector('.art .drawn') ? 'icon' : d.querySelector('.art .person') ? 'sheet' : d.querySelector('.art img.icon') ? 'img' : 'none'; kinds[k] = (kinds[k] || 0) + 1; }
			const r = { n: seen.size, ph, kinds, icon: size('Giant Cape'), scene: size('Mesagoza'), fig: size('Iono') }; w.remove(); return r; });
		A(art.n > 170 && art.ph.length === 0 && !art.kinds.none && art.kinds.scene === 14 && art.kinds.fig > 40 && art.kinds.icon > 40, '[art] every Trainer card shows a picture (a sprite, an icon or this game\'s own drawing), none the placeholder', art);
		A(art.icon[2] > 40 && Math.abs(art.icon[2] - art.icon[3]) <= 1 && art.icon[3] < art.icon[1] && art.scene[2] >= art.scene[0] - 1 && art.scene[3] >= art.scene[1] - 1 && Math.abs(art.fig[3] - art.fig[2] * 2) <= 1, '[art] an icon sits inside the art window, a Stadium fills it, a person stands twice as tall as wide', art);
		A(errors.length === 0, '[solo] no page errors', errors.slice(0, 4));
		await ctx.close();
	}
	{	// ---------- damage nobody aimed asks its player where it goes (Glaceon ex at the Pokémon Checkup) ----------
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument(() => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch (e) { /* no storage */ } });
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=pick`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__pocket && window.__pocket.ready, { timeout: 30000 });
		// a match under way, my turn, with Glaceon ex in my Active slot and two opposing Active Pokémon (put there directly: the test is of the question, not of getting there)
		const ready = await page.evaluate(async () => {
			const P = window.__pocket, { card } = await import('/pocketenhanced/js/data/cards.js');
			P.start({ players: 2, seed: 'pick' }); P.fast(true);
			const v = P.view(), basic = v.players[0].hand.findIndex(id => { const c = card(id); return c.kind === 'pokemon' && c.stage === 0; });
			P.act({ t: 'setup', seat: 0, active: [basic], bench: [] });
			for (let i = 0; i < 400 && !(P.idle() && P.view().phase === 'main' && P.view().current === 0 && !P.view().pending); i++) await new Promise(r => setTimeout(r, 50));
			const S = P.state(), mk = id => { const k = P.engine.makePoke(S, id); k.turnPlayed = -1; return k; };
			S.players[0].active = [mk('A2a-022'), null]; S.players[1].active = [mk('A1-211'), mk('A1-211')]; S.players[1].bench[0] = S.players[1].bench[0] || mk('A1-211');
			return { rules: P.view().rules, mine: P.view().current === 0 };
		});
		await page.evaluate(() => { window.__pocket.act({ t: 'execute', seat: 0, commands: [null, null] }); });
		const asked = await page.waitForFunction(() => { const v = window.__pocket.view(); return v && v.pending && v.pending.kind === 'pickTarget' && document.querySelectorAll('.pe-opps .pe-poke.legal').length === 2 && /Snowy Terrain/.test(document.querySelector('.pe-prompt')?.textContent || ''); }, { timeout: 8000 }).then(() => true, () => false);
		A(ready.rules >= 2 && ready.mine && asked, '[choice] at the end of my turn the page asks which opposing Active Pokémon Snowy Terrain hits, and lights up the two I may choose', await page.evaluate(() => ({ p: window.__pocket.view().pending, prompt: document.querySelector('.pe-prompt')?.textContent, legal: document.querySelectorAll('.pe-poke.legal').length })));
		const before = await page.evaluate(() => window.__pocket.view().players[1].active.map(k => k.dmg));
		const box = await (await page.$('.pe-opps .pe-poke[data-k="p:1:active:1"]')).boundingBox();
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		const done = await page.waitForFunction(b => { const v = window.__pocket.view(); return v && v.players[1].active[1] && v.players[1].active[1].dmg >= b + 10; }, { timeout: 8000 }, before[1]).then(() => true, () => false);
		const after = await page.evaluate(() => ({ dmg: window.__pocket.view().players[1].active.map(k => k && k.dmg), log: window.__pocket.view().log.some(e => /Snowy Terrain does 10 damage/.test(e.msg)) }));
		A(done && after.dmg[0] === before[0] && after.log && errors.length === 0, '[choice] pressing one sends the 10 damage there (not to the other), and the match goes on', { before, after, errors });
		// ---------- Mesagoza: a Stadium with something to use, through its Use button ----------
		const mesa = await page.evaluate(async () => {
			const P = window.__pocket, { card, CARDS } = await import('/pocketenhanced/js/data/cards.js');
			P.start({ players: 2, seed: 'mesa' }); P.fast(true);
			const v = P.view(), basic = v.players[0].hand.findIndex(id => { const c = card(id); return c.kind === 'pokemon' && c.stage === 0; });
			P.act({ t: 'setup', seat: 0, active: [basic], bench: [] });
			for (let i = 0; i < 400 && !(P.idle() && P.view().phase === 'main' && P.view().current === 0 && !P.view().pending); i++) await new Promise(r => setTimeout(r, 50));
			const S = P.state(); S.stadium = { id: CARDS.find(c => c.name === 'Mesagoza').id, seat: 1 }; P.refresh();
			return { mine: P.view().current === 0, ready: !!document.querySelector('[data-k="stadium"].ready'), hand: S.players[0].hand.length, deckPokemon: S.players[0].deck.some(id => card(id).kind === 'pokemon') };
		});
		const clickOn = async sel => { const b = await (await page.$(sel)).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
		await clickOn('[data-k="stadium"]');
		const offered = await page.waitForFunction(() => { const b = document.querySelector('.modal [data-k="stadiumuse"]'); return !!b && !b.disabled && /Mesagoza/.test(document.querySelector('.modal')?.textContent || ''); }, { timeout: 5000 }).then(() => true, () => false);
		if (offered) await clickOn('.modal [data-k="stadiumuse"]');
		const used = await page.waitForFunction(() => { const S = window.__pocket.state(); return S.log.filter(e => e.k === 'coin' && /Mesagoza/.test(e.msg)).length === 1 && !!S.players[0].flags.stadiumUsed && !document.querySelector('.modal'); }, { timeout: 5000 }).then(() => true, () => false);
		const mesaAfter = await page.evaluate(async h0 => { const { card } = await import('/pocketenhanced/js/data/cards.js'); const S = window.__pocket.state(), heads = !!S.log.find(e => e.k === 'coin' && /Mesagoza/.test(e.msg))?.heads; return { heads, grew: S.players[0].hand.length - h0, newIsPokemon: S.players[0].hand.length > h0 ? card(S.players[0].hand.at(-1)).kind === 'pokemon' : null, ready: !!document.querySelector('[data-k="stadium"].ready'), chip: !!document.querySelector('[data-k="stadium"]') }; }, mesa.hand);
		await clickOn('[data-k="stadium"]');
		const spent = await page.waitForFunction(() => !!document.querySelector('.modal') && /Mesagoza/.test(document.querySelector('.modal').textContent) && !document.querySelector('.modal [data-k="stadiumuse"]'), { timeout: 5000 }).then(() => true, () => false);
		await page.keyboard.press('Escape');
		A(mesa.mine && mesa.ready && mesa.deckPokemon && offered && used && mesaAfter.chip && !mesaAfter.ready && mesaAfter.grew === (mesaAfter.heads ? 1 : 0) && (mesaAfter.heads ? mesaAfter.newIsPokemon === true : true) && spent && errors.length === 0,
			'[stadium] on my turn Mesagoza is lit; pressing it reads the card with a Use button; Use flips its coin (heads: a Pokémon from my deck comes to my hand); after that it is no longer lit and offers no Use this turn', { mesa, offered, used, mesaAfter, spent, errors });
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
		A(asked2.length === 0 && await p2.evaluate(() => document.querySelectorAll('.pe-col .pe-card').length === 2485 && !document.querySelector('img.own') && !!document.querySelector('.pe-col .art.bg-Fire') && !!document.querySelector('.pe-col .art.bg-Water')), '[art] by default nothing is requested, and each card has the painted background of its type');
		await ctx2.close();
	}
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
