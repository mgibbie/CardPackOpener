// padnav_test.mjs — controller navigation for Battlecards' DOM screens
// (battlecards/padnav.js, Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 3).
//
// Fake pads ride in window.__owFakePads through the real site/gamepad.js poller
// (headless Chrome has no controllers). Covers the in-match modals — whose
// buttons listen on POINTERDOWN, which is why activation replays a full mouse
// click — a run-mode overlay, the deck builder's text field and dropdown, the
// signed-in rule, and the mouse hiding the focus ring.
//
//   node overworld/tests/padnav_test.mjs
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
].find(p => fs.existsSync(p));
const PORT = 9143;
const STATE = { username: 'padnav', friendCode: 'PADNV0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, decks: [] })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

// Standard mapping by position; Nintendo layout = RIGHT face confirms, BOTTOM cancels.
const BTN = { bottom: 0, right: 1, up: 12, down: 13, left: 14, rightD: 15, start: 9 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const open = async (url, signedIn = true) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, signedIn) => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			localStorage.setItem('magepunk_mp_token_v1', 'padnav-token');
			if (signedIn) localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			else localStorage.removeItem('magepunk_mp_state_v1');
		}, STATE, signedIn);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const tap = async b => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(70); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(120); };
		const focus = () => page.evaluate(() => {
			const f = window.__padnav?.focused;
			return f ? { tag: f.tagName, text: (f.textContent || '').trim().slice(0, 40), id: f.id, cls: f.className, inModal: !!f.closest('#scry-modal'), ring: f.classList.contains('padnav-focus') } : null;
		});
		return { ctx, page, errors, tap, focus };
	};
	const bootMatch = async t => {
		const t0 = Date.now();
		while (Date.now() - t0 < 45000 && !(await t.page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
		await sleep(2200);
	};

	// ===== the mulligan: pointerdown-only cells and button, reached by the pad =====
	{
		const t = await open('/battlecards/index.html?players=2');
		await bootMatch(t);
		A(await t.page.evaluate(() => !!window.__padnav), 'signed in: the navigator runs on the match page');
		const modalUp = () => t.page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display !== 'none');
		for (let i = 0; i < 40 && !(await modalUp()); i++) await sleep(250);
		A(await modalUp(), 'setup: the mulligan modal is up');
		const scoped = await t.page.evaluate(() => window.__padnav.candidates().every(el => el.closest('#scry-modal')));
		A(scoped, 'with a modal up, every stop is inside it (the board behind is out of reach)');
		await t.tap(BTN.right);                                   // first press only shows where you are
		const f0 = await t.focus();
		A(f0 && f0.inModal && f0.ring, 'the first press puts a visible focus ring inside the modal', JSON.stringify(f0));
		// walk to a card cell and mark it for replacement (its handler is pointerdown-only)
		for (let i = 0; i < 6 && !/scry-cell/.test((await t.focus())?.cls || ''); i++) await t.tap(BTN.up);
		const onCell = await t.focus();
		A(onCell && /scry-cell/.test(onCell.cls), 'the d-pad reaches the mulligan card cells', JSON.stringify(onCell));
		await t.tap(BTN.right);
		const marked = await t.page.evaluate(() => document.querySelectorAll('#scry-modal .mull-swap').length);
		A(marked === 1, 'confirm on a cell marks it to replace (a pointerdown-only handler)', String(marked));
		A((await t.focus())?.inModal, 'after the modal re-renders, focus stays in it');
		// down to the confirm button: "Mulligan 1"
		for (let i = 0; i < 6 && !/Mulligan|Keep hand/i.test((await t.focus())?.text || ''); i++) await t.tap(BTN.down);
		A(/Mulligan 1/i.test((await t.focus())?.text || ''), 'the d-pad reaches the confirm button', JSON.stringify(await t.focus()));
		await t.tap(BTN.right);
		await sleep(900);
		A(!(await modalUp()), 'confirming it closes the mulligan');

		// ===== a forced discard, the same way =====
		const setup = await t.page.evaluate(() => {
			const g = window.__game, s = g.state, E = g.E;
			const p = s.players[g.HUMAN];
			s.current = g.HUMAN; s.priority = null; s.stack = [];
			const pick = Object.values(s.cardsById).find(c => c && c.type === 'creature' && c.cost <= 3);
			p.hand.length = 0;
			for (let i = 0; i < 4; i++) { const c = E.instantiate(pick, g.HUMAN); c.zone = 'hand'; p.hand.push(c); }
			s.discardQueue.push({ player: g.HUMAN, count: 1 });
			g.pump();
			return E.hasPendingDecision(s, g.HUMAN);
		});
		await sleep(1200);
		A(setup && await modalUp(), 'setup: a forced discard is owed');
		const handBefore = await t.page.evaluate(() => window.__game.state.players[window.__game.HUMAN].hand.length);
		// two steps, as with a mouse: mark a card's Keep -> Discard, then the "Discard (1/1)" button
		for (let i = 0; i < 3 && !(await t.focus())?.inModal; i++) await t.tap(BTN.right);
		if (!/^(Keep|Discard)$/.test((await t.focus())?.text || '')) for (let i = 0; i < 4 && !/^Keep$/.test((await t.focus())?.text || ''); i++) await t.tap(BTN.up);
		await t.tap(BTN.right);
		A(/^Discard$/.test((await t.focus())?.text || ''), 'confirm marks the focused card to discard', JSON.stringify(await t.focus()));
		for (let i = 0; i < 4 && !/Discard \(1\/1\)/.test((await t.focus())?.text || ''); i++) await t.tap(BTN.down);
		A(/Discard \(1\/1\)/.test((await t.focus())?.text || ''), '...the submit button became reachable once enabled', JSON.stringify(await t.focus()));
		await t.tap(BTN.right);
		await sleep(600);
		const handAfter = await t.page.evaluate(() => window.__game.state.players[window.__game.HUMAN].hand.length);
		A(!(await modalUp()) && handAfter === handBefore - 1, 'the discard is chosen and confirmed on the pad', `${handBefore} -> ${handAfter}`);
		A(t.errors.length === 0, 'no uncaught page error in the match', JSON.stringify(t.errors.slice(0, 2)));

		// the mouse takes over: the ring hides
		await t.page.mouse.move(200, 200); await t.page.mouse.move(260, 240);
		A(!(await t.page.evaluate(() => !!document.querySelector('.padnav-focus'))), 'moving the mouse hides the focus ring');
		await t.ctx.close();
	}

	// ===== a run-mode overlay (click handlers) =====
	{
		const t = await open('/battlecards/index.html?dungeon=1');
		const t0 = Date.now();
		while (Date.now() - t0 < 30000 && !(await t.page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); return !!o && getComputedStyle(o).display !== 'none' && o.querySelectorAll('button').length > 0; }).catch(() => false))) await sleep(250);
		const before = await t.page.evaluate(() => document.getElementById('dungeon-overlay')?.innerHTML.length || 0);
		A(before > 0, 'setup: the dungeon run opens on an overlay screen');
		const scoped = await t.page.evaluate(() => { const c = window.__padnav.candidates(); return c.length > 0 && c.every(el => el.closest('#dungeon-overlay')); });
		A(scoped, 'the overlay scopes focus to its own buttons');
		await t.tap(BTN.right);                                   // show focus
		const chosen = (await t.focus())?.text;
		const html0 = await t.page.evaluate(() => document.getElementById('dungeon-overlay').innerHTML);
		await t.tap(BTN.right);                                   // activate
		await sleep(700);
		const html1 = await t.page.evaluate(() => document.getElementById('dungeon-overlay')?.innerHTML || '');
		A(html1 !== html0, `confirm activates the focused overlay button ("${chosen}") and the run moves on`);
		A(t.errors.length === 0, 'no uncaught page error in the run', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===== the deck builder: a text field opens the on-screen keyboard, a dropdown cycles =====
	{
		const t = await open('/battlecards/deck.html');
		await sleep(3500);
		const got = await t.page.evaluate(async () => {
			const name = document.getElementById('deck-name'), sel = document.getElementById('class-select');
			const out = {};
			// focus the name field directly (the walk to it is layout-dependent), then confirm
			window.__padnav.move('down');
			const list = window.__padnav.candidates();
			out.nameReachable = list.includes(name);
			out.selReachable = list.includes(sel);
			return out;
		});
		A(got.nameReachable && got.selReachable, 'the deck builder\'s name field and class dropdown are stops', JSON.stringify(got));
		// (walking is covered by the modal checks above; here, focus the field and confirm)
		await t.page.evaluate(() => window.__padnav.focusTo(document.getElementById('deck-name')));
		A((await t.focus())?.id === 'deck-name', 'the deck name field takes focus', JSON.stringify(await t.focus()));
		await t.tap(BTN.right);
		await sleep(200);
		A(await t.page.evaluate(() => !!document.querySelector('#osk')), 'confirm on a text field opens the on-screen keyboard');
		await t.page.evaluate(() => { const f = document.querySelector('#osk input'); f.value = 'Pad Deck'; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
		await sleep(200);
		A(await t.page.evaluate(() => document.getElementById('deck-name').value) === 'Pad Deck', '...and what is typed there lands in the field');
		const sel0 = await t.page.evaluate(() => document.getElementById('class-select').selectedIndex);
		const cycled = await t.page.evaluate(async () => {
			const s = document.getElementById('class-select');
			if (s.options.length < 2) return 'n/a';
			let changed = false; s.addEventListener('change', () => { changed = true; }, { once: true });
			window.__padnav.focusTo(s);
			await window.__padnav.activate();
			return changed && s.selectedIndex !== 0 ? true : changed;
		});
		A(cycled === true || cycled === 'n/a', 'confirm on the class dropdown cycles to the next option', String(cycled) + ' from ' + sel0);
		A(t.errors.length === 0, 'no uncaught page error in the deck builder', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===== not signed in: no navigator =====
	{
		const t = await open('/battlecards/deck.html', false);
		await sleep(2500);
		A(await t.page.evaluate(() => !window.__padnav), 'without a loaded account, no controller navigation runs');
		await t.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
