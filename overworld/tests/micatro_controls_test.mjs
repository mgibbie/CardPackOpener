// micatro_controls_test.mjs — controls sweep B5: Micatro is playable with the KEYBOARD ALONE (no mouse event at all) and with
// TOUCH on a phone (390×844 portrait and 844×390 landscape). The controller's flows are micatro_gamepad_test.mjs (and the
// Multiplayer lobby's: micatro_pvp_e2e_test.mjs).
//
// Keyboard (site/input.js -> micatro/js/ui/pad.js, the controller's reticle and actions):
//   arrows / WASD move · Z confirm (hold Z + ←/→ moves a card) · X cancel · C secondary · V context · Q / E = LB / RB ·
//   Enter = Start (pause) · Backspace = Select (deck). Hotkeys that stay: digits, P, Delete, R, N, I, Space, Esc.
//   - the main menu: the Joker collection (its search field takes typing: the cursor never moves while typing; Esc leaves
//     it), the Games switcher (`), New Run: a seed typed in, the Mods panel (Joker Toggle on, its options opened, a switch
//     flipped, then off again), Play;
//   - blind select: E skips, Z selects; Pages (if dealt): a digit raises, E takes;
//   - a round: moving / info / deck view / pause record NOTHING; hold Z + → reorders a hand card; C sorts; Z picks, E
//     discards, X lets go, Q plays; the recorded run replays (Session.fromRecipe, a fresh engine) to the SAME end state;
//   - cash out (Q), the shop: hold Z + → reorders a joker, C sells one, Z Z uses a Planet, Z buys a shop card and redeems a
//     voucher, E rerolls, Z opens a pack (Z takes / E skips), Q leaves; pause -> Main Menu (solo: straight to the menu);
//   - the old letter hotkeys are gone: S / D / C / V never sort, discard, clear or open the deck any more.
// Touch: menu -> New Run -> Play -> (Pages) -> Select -> tap cards -> Discard / Play -> Cash Out -> shop: Buy / Sell ->
//   Reroll -> Next Round, and the ⚙️ opens the Games switcher; the page never scrolls sideways.
//   node overworld/tests/micatro_controls_test.mjs        (SHOTS=<dir> saves screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { keyWalk, keyFocus } from './micatro_keys_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8772;
const SHOTS = process.env.SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.fs': 'text/plain' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise((r) => server.listen(PORT, r));

const BOT = `
window.__bestHand = async function () {
	const R = await import('/micatro/js/engine/run.js');
	const G = R.G, hand = G.hand.cards, n = hand.length, combos = [];
	const rec = (s, p) => { if (p.length === Math.min(5, n)) { combos.push(p.slice()); return; } for (let i = s; i < n; i++) { p.push(i); rec(i + 1, p); p.pop(); } };
	rec(0, []);
	let best = null, bestScore = -1;
	for (const c of combos) {
		const cards = c.map(i => hand[i]); const info = R.pokerInfo(cards); const h = G.GAME.hands[info.text]; if (!h) continue;
		let chips = h.chips; for (const sc of info.scoring_hand) chips += sc.get_chip_bonus();
		if (chips * h.mult > bestScore) { bestScore = chips * h.mult; best = cards.map(x => x.sort_id); }
	}
	return { best, bestScore, all: hand.map(x => x.sort_id) };
};`;

let browser;
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); };
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const open = async (url, vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument(() => {
			try { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.removeItem('micatro_run_v1'); } catch { }
			// every mouse-type pointer / mouse event the page sees (the keyboard pass must never make one)
			window.__mouse = 0;
			for (const t of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointermove']) addEventListener(t, (e) => { if (e.isTrusted && (!e.pointerType || e.pointerType === 'mouse')) window.__mouse++; }, true);
		});
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready && window.__micatroPad)), 60000);
		await sleep(400);
		await page.evaluate(BOT);
		return { page, ctx, errors };
	};

	// ================================================================ keyboard only
	{
		const { page, ctx, errors } = await open('/micatro/', { width: 1280, height: 800 });
		const idle = async () => { await waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000); await sleep(200); };
		const V = () => page.evaluate(() => window.__micatro.view());
		const acts = () => page.evaluate(() => (window.__micatro.session ? window.__micatro.session.recipe.actions.slice() : []));
		const last = async () => { const a = await acts(); return a[a.length - 1] || null; };
		const key = async (code, ms = 180) => { await page.keyboard.press(code); await sleep(ms); };
		const modal = (cls) => page.evaluate((c) => !!document.querySelector('.modal-layer .' + c), cls);
		const hl = async () => (await V()).areas.hand.filter((c) => c.hl).map((c) => c.id);
		const walk = async (t, msg) => { const ok = await keyWalk(page, t); if (msg) A(ok, msg, JSON.stringify(await keyFocus(page))); return ok; };

		// ---- the main menu
		await key('ArrowRight');
		let f = await keyFocus(page);
		const ui = await page.evaluate(() => ({ ring: document.querySelector('.pad-reticle').style.display !== 'none', hints: getComputedStyle(document.getElementById('pad-hints')).display !== 'none', text: document.getElementById('pad-hints').textContent }));
		A(ui.ring && f && /b-menu-play/.test(f.cls), 'a key press shows the reticle, on the menu\'s Play', JSON.stringify([ui, f]));
		A(ui.hints && /Z/.test(ui.text) && /X/.test(ui.text), 'the hint bar shows the KEYS while the keyboard drives', ui.text);
		await shot(page, 'kb_menu');

		// the Joker collection: its search field takes typing, and the cursor never moves while typing
		await walk('.b-joker-collection', 'the arrows reach the Joker collection');
		await key('KeyZ', 400);
		A(await page.evaluate(() => !!document.querySelector('.joker-collection')), 'Z opens the Joker collection');
		await walk('.joker-collection-search', 'the reticle reaches its search field');
		await key('KeyZ');
		A(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('joker-collection-search')), 'Z puts the keyboard in the search field');
		const f0 = await keyFocus(page);
		await page.keyboard.type('wasd zxqe');
		await key('ArrowDown'); await key('Backspace'); await key('Enter');
		const typed = await page.evaluate(() => ({ v: document.querySelector('.joker-collection-search').value, open: !!document.querySelector('.joker-collection'), pause: !!document.querySelector('.pause-modal') }));
		A(typed.v === 'wasd zxq' && typed.open && !typed.pause && JSON.stringify(await keyFocus(page)) === JSON.stringify(f0), 'typing in the field moves nothing: WASD / Z / X / Q / E / arrows / Backspace / Enter are text there', JSON.stringify(typed));
		await key('Escape', 300);
		A(await page.evaluate(() => !(document.activeElement && document.activeElement.classList.contains('joker-collection-search')) && !!document.querySelector('.joker-collection')), 'Esc leaves the field (the collection stays open)');
		await key('KeyX', 300);
		A(!(await page.evaluate(() => !!document.querySelector('.joker-collection'))), 'X closes the collection');

		// the Games switcher opens from the game, and closes back into it
		await key('Backquote', 300);
		A(await page.evaluate(() => !!document.getElementById('mpsw')), '` opens the Games switcher');
		await key('KeyX', 300);
		A(await page.evaluate(() => !document.getElementById('mpsw') && !!document.querySelector('.menu-modal')), 'X closes it, back on the menu');

		// New Run: a seed typed in, the Mods panel, Play
		await walk('.b-menu-play');
		await key('KeyZ', 400);
		A(await page.evaluate(() => !!document.querySelector('.new-run')), 'Z on Play opens the New Run screen');
		await walk('.seed-on', 'the reticle reaches "Seeded run"');
		await key('KeyZ');
		A(await page.evaluate(() => document.querySelector('.seed-on').checked && document.activeElement === document.querySelector('.seed-in')), 'Z ticks it, and the seed field takes the keyboard');
		await page.keyboard.type('kbseed1');
		await key('Escape', 250);
		A(await page.evaluate(() => document.querySelector('.seed-in').value === 'KBSEED1' && document.activeElement !== document.querySelector('.seed-in') && !!document.querySelector('.new-run')), 'the seed is typed in; Esc leaves the field');
		await walk('.b-mods', 'the reticle reaches Mods');
		await key('KeyZ', 400);
		A(await page.evaluate(() => !!document.querySelector('.mods-modal')), 'Z opens the Mods panel');
		await walk('[data-k="toggle:jokertoggle"]', 'the reticle reaches Joker Toggle\'s switch');
		await key('KeyZ', 500);
		A(await page.evaluate(() => document.querySelector('[data-k="toggle:jokertoggle"]').getAttribute('aria-pressed') === 'true'), 'Z turns Joker Toggle on');
		await waitFor(() => page.evaluate(() => !!document.querySelector('[data-k="opts:jokertoggle"]')), 5000);
		await walk('[data-k="opts:jokertoggle"]', 'the reticle reaches its Options');
		await key('KeyZ', 300);
		A(await page.evaluate(() => !!document.querySelector('[data-k="opt:jokertoggle:pages"]')), 'Z opens its options');
		await walk('[data-k="opt:jokertoggle:pages"]', 'the reticle reaches the Pages switch');
		await key('KeyZ', 300);
		A(await page.evaluate(() => document.querySelector('[data-k="opt:jokertoggle:pages"]').getAttribute('aria-pressed') === 'false'), 'Z flips it');
		await key('KeyZ', 300);
		await walk('[data-k="toggle:jokertoggle"]');
		await key('KeyZ', 400);
		A(await page.evaluate(() => document.querySelector('[data-k="toggle:jokertoggle"]').getAttribute('aria-pressed') === 'false'), 'and Z turns Joker Toggle off again');
		await shot(page, 'kb_mods');
		await key('KeyX', 300);
		A(await page.evaluate(() => !document.querySelector('.mods-modal') && !!document.querySelector('.new-run')), 'X closes the Mods panel');
		await walk('.b-start', 'the reticle reaches Play');
		await key('KeyZ');
		await idle();
		let v = await V();
		A(v && v.state === 'BLIND_SELECT' && v.seed === 'KBSEED1', 'Z starts the seeded run', JSON.stringify(v && { state: v.state, seed: v.seed }));

		// ---- blind select: E skips, Z selects
		await sleep(300);
		await key('KeyE', 400); await idle();
		v = await V();
		if (/_PACK/.test(v.state)) { await key('KeyE', 400); await idle(); v = await V(); }   // (a skip's Tag may open a pack: E skips it)
		A(v.state === 'BLIND_SELECT' && v.blind_on_deck === 'Big' && (await acts()).some((a) => a.type === 'skip_blind'), 'E skips the Small blind', JSON.stringify({ s: v.state, d: v.blind_on_deck }));
		f = await keyFocus(page);
		A(f && /b-select/.test(f.cls), 'the reticle homes on Select', JSON.stringify(f));
		await key('KeyZ', 400); await idle();
		v = await V();
		if (v.state === 'PAGES') {
			const i = await page.evaluate(async () => (await import('/micatro/js/engine/pages.js')).quietPageIndex(window.__micatro.view().pages.choices));
			await key('Digit' + (i + 1)); await key('KeyE', 400); await idle();
			v = await V();
			A(v.state === 'SELECTING_HAND' && (await acts()).some((a) => a.type === 'pick_page'), 'Pages: a digit raises one, E takes it');
		}
		A(v.state === 'SELECTING_HAND', 'Z selects the Big blind: the round starts', v.state);
		await sleep(300);

		// ---- a round: navigation records nothing
		let n0 = (await acts()).length;
		await key('ArrowLeft'); await key('ArrowRight'); await key('KeyD'); await key('KeyA'); await key('KeyW'); await key('KeyS');
		await key('KeyV', 250);
		A(await page.evaluate(() => window.__micatroPad.tipsOn && getComputedStyle(document.querySelector('.tip')).display !== 'none'), 'V shows the focused card\'s info');
		await key('KeyV');
		await key('Backspace', 300);
		A(await modal('dv-modal'), 'Backspace opens the deck view');
		await key('Backspace', 300);
		A(!(await modal('dv-modal')), 'Backspace again closes it');
		await key('Enter', 300);
		A(await modal('pause-modal'), 'Enter opens the pause menu');
		f = await keyFocus(page);
		A(f && /b-resume/.test(f.cls), 'focused on Resume', JSON.stringify(f));
		await key('KeyX', 300);
		A(!(await modal('pause-modal')), 'X closes it');
		await key('KeyI', 300);
		A(await modal('ri-modal'), 'I opens Run Info');
		await key('KeyX', 300);
		A((await acts()).length === n0, 'moving, card info, the deck view, the pause menu and Run Info recorded no action', JSON.stringify((await acts()).slice(n0)));
		// the old hotkeys are gone (S / D / C / V moved to the cursor)
		await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }));
		await idle();
		n0 = (await acts()).length;
		const d0 = (await V()).discards_left;
		await page.keyboard.press('ArrowLeft'); await sleep(100);   // (the reticle shows: the keys below then act on it)
		for (const k of ['KeyS', 'KeyD', 'KeyW', 'KeyA']) await key(k, 120);
		v = await V();
		A(v.discards_left === d0 && (await hl()).length === 1 && (await acts()).length === n0, 'S / D no longer sort or discard (they move the cursor)', JSON.stringify((await acts()).slice(n0)));
		await key('KeyX'); await idle();
		A((await hl()).length === 0 && JSON.stringify(await last()) === JSON.stringify({ type: 'highlight', ids: [] }), 'X lets go of the chosen cards');

		// hold Z + → moves a hand card
		let order = (await V()).areas.hand.map((c) => c.id);
		await walk(order[0], 'the reticle reaches the first hand card');
		await page.keyboard.down('KeyZ'); await sleep(120);
		await key('ArrowRight');
		await page.keyboard.up('KeyZ'); await sleep(200); await idle();
		v = await V();
		A(v.areas.hand[1].id === order[0] && v.areas.hand[0].id === order[1] && !v.areas.hand.some((c) => c.hl) && (await last()).type === 'reorder', 'hold Z + → moves the card (and does not select it)', JSON.stringify(v.areas.hand.slice(0, 2).map((c) => c.id)));
		order = v.areas.hand.map((c) => c.id).join();
		await key('KeyC'); await idle();
		A((await last()).type === 'sort_hand' && (await V()).areas.hand.map((c) => c.id).join() !== order, 'C sorts the hand', JSON.stringify(await last()));
		// pick two, E discards
		v = await V();
		const two = v.areas.hand.slice(-2).map((c) => c.id);
		for (const id of two) { await walk(id); await key('KeyZ'); await idle(); }
		A(JSON.stringify((await hl()).sort()) === JSON.stringify(two.slice().sort()), 'arrows + Z pick exactly the chosen cards');
		await key('KeyE', 400); await idle();
		v = await V();
		A(v.discards_left === d0 - 1 && !v.areas.hand.some((c) => two.includes(c.id)) && (await last()).type === 'discard', 'E discards them', JSON.stringify(await last()));
		// pick the best hand, Q plays
		const bh = await page.evaluate(() => window.__bestHand());
		for (const id of bh.best) { await walk(id); await key('KeyZ'); await idle(); }
		const c0 = (await V()).chips;
		await key('KeyQ', 400); await idle();
		v = await V();
		A((await last()).type === 'play' && (v.chips > c0 || v.state !== 'SELECTING_HAND'), 'Q plays the hand', JSON.stringify({ chips: v.chips, state: v.state }));
		await shot(page, 'kb_round');

		// ---- replay determinism: the recorded run, re-simulated in a fresh engine, ends where the live game is
		const recipe = await page.evaluate(() => JSON.parse(JSON.stringify(window.__micatro.session.recipe)));
		const liveSum = await page.evaluate(async (recipe) => { const S = await import('/micatro/js/engine/session.js'); return S.viewChecksum(window.__micatro.session.view()); }, recipe);
		const known = new Set(['skip_blind', 'skip_booster', 'select_blind', 'pick_page', 'highlight', 'reorder', 'sort_hand', 'discard', 'play']);
		A(recipe.actions.every((a) => known.has(a.type)), 'the recipe holds only game moves (nothing input-only)', JSON.stringify([...new Set(recipe.actions.map((a) => a.type))]));
		{
			const c2 = await browser.createBrowserContext();
			const p2 = await c2.newPage();
			await p2.goto(`http://localhost:${PORT}/micatro/js/engine/session.js`, { waitUntil: 'domcontentloaded' });
			const re = await p2.evaluate(async (recipe) => { const S = await import('/micatro/js/engine/session.js'); const s = S.Session.fromRecipe(recipe); return { sum: S.viewChecksum(s.view()), stopped: s.stoppedAt, n: s.recipe.actions.length }; }, recipe);
			A(!re.stopped && re.n === recipe.actions.length && re.sum === liveSum, 'the keyboard-played run replays move for move to the same end state', JSON.stringify({ re, liveSum, n: recipe.actions.length }));
			await c2.close();
		}

		// ---- win the round (the target lowered: not a recorded move, so after the replay check), cash out with Q
		if ((await V()).state === 'SELECTING_HAND') {
			await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; });
			await key('Digit1'); await idle();
			await key('KeyP', 400); await idle();
		}
		await waitFor(async () => (await V()).state === 'ROUND_EVAL', 15000); await idle();
		A((await V()).state === 'ROUND_EVAL', 'the round is won (P plays the picked card)', (await V()).state);
		await sleep(300);
		await key('KeyQ', 400); await idle();
		v = await V();
		A(v.state === 'SHOP' && (await last()).type === 'cash_out', 'Q cashes out into the shop', v.state);

		// ---- the shop: jokers and consumables (reorder, sell, use), buy, redeem, reroll, a pack
		await page.evaluate(async () => {
			const C = await import('/micatro/js/engine/core.js');
			C.G.GAME.dollars = 300;
			C.add_joker('j_joker'); C.add_joker('j_greedy_joker');
			const pl = C.create_card('Planet', C.G.consumeables, null, null, null, null, 'c_pluto'); C.G.consumeables.emplace(pl);
			C.G.E_MANAGER.flush();
			window.__micatro.act({ type: 'reorder', area: 'jokers', ids: window.__micatro.view().areas.jokers.map((c) => c.id) });
		});
		await idle();
		v = await V();
		const j = v.areas.jokers.map((c) => c.id);
		A(j.length === 2 && v.areas.consumeables.length === 1, 'two jokers and a Planet on the table');
		await walk(j[0], 'the reticle reaches a joker');
		await page.keyboard.down('KeyZ'); await sleep(120);
		await key('ArrowRight');
		await page.keyboard.up('KeyZ'); await sleep(200); await idle();
		v = await V();
		A(v.areas.jokers[0].id === j[1] && v.areas.jokers[1].id === j[0] && JSON.stringify(await last()) === JSON.stringify({ type: 'reorder', area: 'jokers', ids: [j[1], j[0]] }), 'hold Z + → reorders the jokers', JSON.stringify(await last()));
		const $0 = v.dollars;
		await key('KeyC'); await idle();
		v = await V();
		A(v.areas.jokers.length === 1 && v.areas.jokers[0].id === j[1] && v.dollars > $0 && (await last()).type === 'sell', 'C sells the focused joker', JSON.stringify(await last()));
		const planet = v.areas.consumeables[0].id;
		await walk(planet, 'the reticle reaches the Planet');
		await key('KeyZ'); await idle();
		A(await page.evaluate(() => window.__micatro.board.sel) === planet, 'Z chooses it');
		await key('KeyZ', 400); await idle();
		v = await V();
		{ const u = await last(); A(!v.areas.consumeables.length && u.type === 'use' && u.id === planet, 'Z again uses it', JSON.stringify(u)); }
		const sj = v.areas.shop_jokers[0];
		if (sj) {
			await walk(sj.id, 'the reticle reaches a shop card');
			await key('KeyZ', 400); await idle();
			A(JSON.stringify(await last()) === JSON.stringify({ type: 'buy', id: sj.id }), 'Z buys it', JSON.stringify(await last()));
		} else A(false, 'the shop has a card (seed choice)');
		v = await V();
		const vo = v.areas.shop_vouchers[0];
		if (vo) {
			await walk(vo.id, 'the reticle reaches the voucher');
			await key('KeyZ', 400); await idle();
			A(JSON.stringify(await last()) === JSON.stringify({ type: 'buy', id: vo.id }) && !(await V()).areas.shop_vouchers.some((c) => c.id === vo.id), 'Z redeems it', JSON.stringify(await last()));
		} else A(false, 'the shop has a voucher (seed choice)');
		await key('KeyE', 400); await idle();
		A((await last()).type === 'reroll_shop', 'E rerolls', JSON.stringify(await last()));
		v = await V();
		const bo = v.areas.shop_booster[0];
		if (bo) {
			await walk(bo.id, 'the reticle reaches a booster');
			await key('KeyZ', 600); await idle();
			v = await V();
			A(!!v.pack_kind, 'Z opens it', JSON.stringify({ kind: v.pack_kind }));
			await sleep(300);
			f = await keyFocus(page);
			A(f && f.area === 'pack_cards', 'the reticle homes on the pack\'s cards', JSON.stringify(f));
			await key('KeyZ', 400); await idle();
			if ((await V()).pack_kind) { await key('KeyE', 400); await idle(); }   // (a card that needs targets: E skips)
			v = await V();
			A(v.state === 'SHOP' && !v.pack_kind && ['use', 'skip_booster'].includes((await last()).type), 'Z takes a card (or E skips): back in the shop', JSON.stringify(await last()));
		} else A(false, 'the shop has a booster (seed choice)');
		await shot(page, 'kb_shop');
		await sleep(200);
		await key('KeyQ', 400); await idle();
		v = await V();
		A(v.state === 'BLIND_SELECT' && (await last()).type === 'next_round', 'Q leaves the shop', JSON.stringify({ s: v.state, a: await last() }));

		// ---- pause -> Main Menu (a solo run: straight to the menu, the run kept)
		await key('Enter', 300);
		await walk('.b-pause-main', 'the reticle reaches the pause menu\'s Main Menu');
		await key('KeyZ', 500);
		A(await page.evaluate(() => !!document.querySelector('.menu-modal .b-continue')), 'Z on Main Menu: the main menu, with Continue');
		A(await page.evaluate(() => window.__mouse) === 0, 'the whole keyboard pass made no mouse event', await page.evaluate(() => window.__mouse));
		A(errors.length === 0, 'no errors during keyboard play', errors.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ touch (phone, both orientations)
	for (const [name, vp] of [['portrait', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }], ['landscape', { width: 844, height: 390, isMobile: true, hasTouch: true, isLandscape: true, deviceScaleFactor: 1 }]]) {
		const { page, ctx, errors } = await open('/micatro/?seed=TOUCH1', vp);
		const idle = async () => { await waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000); await sleep(250); };
		const V = () => page.evaluate(() => window.__micatro.view());
		const last = () => page.evaluate(() => { const a = window.__micatro.session.recipe.actions; return a[a.length - 1] || null; });
		// tap an element where nothing covers it (a card: avoiding its own buttons)
		const tap = async (target, { btns = false } = {}) => {
			for (let tries = 0; tries < 4; tries++) {
				const p = await page.evaluate((t, btns) => {
					const el = typeof t === 'number' ? document.querySelector(`.card[data-id="${t}"]`) : document.querySelector(t);
					if (!el) return null;
					const r = el.getBoundingClientRect();
					for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.25, 0.75]) {
						const x = r.left + r.width * fx, y = r.top + r.height * fy, hit = document.elementFromPoint(x, y);
						if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
						if (hit && (hit === el || el.contains(hit)) && (btns || !hit.closest('.card-btns'))) return { x, y };
					}
					return null;
				}, target, btns);
				if (p) { await page.touchscreen.tap(p.x, p.y); await sleep(250); return true; }
				await sleep(250);
			}
			return false;
		};
		const pages = async () => {
			if ((await V()).state !== 'PAGES') return;
			const i = await page.evaluate(async () => (await import('/micatro/js/engine/pages.js')).quietPageIndex(window.__micatro.view().pages.choices));
			await tap(`.page-card[data-page="${i}"]`); await tap('.b-pick-page'); await idle();
		};
		A(await tap('.b-menu-play'), `${name}: tap Play`);
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('.new-run')), 3000), `${name}: the New Run screen`);
		A(await tap('.b-start'), `${name}: tap Play (New Run)`);
		await idle();
		A((await V()).state === 'BLIND_SELECT', `${name}: blind select`);
		A(await tap('.b-select'), `${name}: tap Select`);
		await idle(); await pages();
		let v = await V();
		A(v.state === 'SELECTING_HAND', `${name}: the round starts`, v.state);
		const h = v.areas.hand.map((c) => c.id);
		await tap(h[0]); await tap(h[1]); await idle();
		A((await V()).areas.hand.filter((c) => c.hl).length === 2, `${name}: tapping cards picks them`);
		await tap('.b-discard'); await idle();
		A((await last()).type === 'discard', `${name}: tap Discard`);
		await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; });
		await tap((await V()).areas.hand[0].id); await idle();
		await tap('.b-play'); await idle();
		await waitFor(async () => (await V()).state === 'ROUND_EVAL', 15000); await idle();
		A((await last()).type === 'play' && (await V()).state === 'ROUND_EVAL', `${name}: tap Play Hand wins the round`);
		await sleep(300);
		await tap('.b-cashout'); await idle();
		A((await V()).state === 'SHOP', `${name}: tap Cash Out`);
		await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.dollars = 200; window.__micatro.act({ type: 'reorder', area: 'jokers', ids: [] }); });
		await idle();
		v = await V();
		const sj = v.areas.shop_jokers[0];
		await tap(sj.id);
		A(await tap(`.card[data-id="${sj.id}"] .card-btns .buy`, { btns: true }), `${name}: a tapped shop card shows Buy, on screen`);
		await idle();
		A(JSON.stringify(await last()) === JSON.stringify({ type: 'buy', id: sj.id }), `${name}: tap Buy`);
		v = await V();
		const own = [...v.areas.jokers, ...v.areas.consumeables][0];
		if (own) {
			await tap(own.id);
			A(await tap(`.card[data-id="${own.id}"] .card-btns .sell`, { btns: true }), `${name}: an owned card shows Sell, on screen`);
			await idle();
			A((await last()).type === 'sell', `${name}: tap Sell`);
		}
		await tap('.b-reroll'); await idle();
		A((await last()).type === 'reroll_shop', `${name}: tap Reroll`);
		await shot(page, 'touch_shop_' + name);
		await tap('.b-next'); await idle();
		A((await V()).state === 'BLIND_SELECT', `${name}: tap Next Round`);
		// the ⚙️ opens the Games switcher
		const gear = await page.evaluate(() => { const g = [...document.querySelectorAll('[data-mp-switcher]')].find((e) => e.getBoundingClientRect().width > 4); return g ? (g.setAttribute('data-t', '1'), true) : false; });
		if (gear) {
			await tap('[data-mp-switcher][data-t="1"]', { btns: true });
			A(await waitFor(() => page.evaluate(() => !!document.getElementById('mpsw')), 3000), `${name}: tapping ⚙️ opens the Games switcher`);
			await page.touchscreen.tap(4, Math.round(vp.height / 2)); await sleep(300);
			A(await page.evaluate(() => !document.getElementById('mpsw')), `${name}: a tap on the veil closes it`);
		} else A(false, `${name}: the page has a ⚙️ (Games)`);
		const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
		A(lay.sw <= lay.iw, `${name}: no sideways scroll`, JSON.stringify(lay));
		A(errors.length === 0, `${name}: no errors during touch play`, errors.slice(0, 4).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
