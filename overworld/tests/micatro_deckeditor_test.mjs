// micatro_deckeditor_test.mjs — the native deck editor (Deck Creator rebuilt) in headless Chrome.
//   - New Run has a "Custom deck" row; Decks opens the list (the owner's Goth Deck example included)
//   - the editor builds a deck with real mouse clicks: name, starting money (typed), back art,
//     a card preset, a card edited (Glass, 2 copies), a starting joker picked from the picker
//     (Eternal), a rule toggled in a collapsed group; Save writes the server row (micatro-decks-put)
//   - Save & use -> New Run shows the custom deck; Play starts a run built from it
//     (view.custom_deck, $20, 41 cards, the Eternal Joker, Aces are faces); Continue resumes it
//   - share code: Share makes an MCD1. code; Import code turns it back into the same deck
//   - phone portrait (390 px): no horizontal overflow, every control on screen when scrolled to;
//     the controller reticle reaches the tabs, steppers, rule toggles and Save
//   - a guest's decks live in localStorage; the Modded leaderboard row says "Custom deck: <name>";
//     a spectator sees the custom deck; no console errors anywhere
// Covers micatro/js/ui/deckeditor.js, micatro/js/engine/customdeck.js, micatro/js/ui/screens.js (newRunScreen,
// leaderboard), micatro/js/ui/main.js (startRun, submit), micatro/js/net.js (fetchDecks, saveDecks, submitScore),
// micatro/css/micatro.css — named here so `run-all.mjs --changed` selects this suite.
//   node overworld/tests/micatro_deckeditor_test.mjs
import http from 'http';
import fs from 'fs';
import os from 'os';
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
const PORT = 8751;
const SHOTS = process.env.MICATRO_SHOTS || path.join(os.tmpdir(), 'micatro-deckeditor-shots');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'deckui', friendCode: 'DECK00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---- a spectator snapshot: a real custom-deck run, in node
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
const { Session } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/session.js')).href);
const sess = new Session();
sess.start({ seed: 'DECKSPEC', customDeck: { name: 'Spec Deck', back: 'b_green', jokers: [{ key: 'j_joker' }] } });
sess.act({ type: 'select_blind' });
const SNAP = { view: sess.view(), events: [] };

// ---- server: static files + an /api/mp stub (the deck row behaves like server/mp.mjs: rev-guarded)
const seen = { puts: [], score: [] };
let deckRow = { rev: 0, decks: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE }, status = 200;
		if (body.action === 'publish-micatro') out = { ok: true, watchers: 0, watcherNames: [] };
		else if (body.action === 'micatro-state') out = { snapshot: SNAP, seq: 1, label: 'Ante 1', room: 'u:bob', over: false, watchers: 1, watcherNames: ['deckui'] };
		else if (body.action === 'micatro-decks-get') out = { rev: deckRow.rev, decks: deckRow.decks };
		else if (body.action === 'micatro-decks-put') {
			seen.puts.push(body);
			if ((+body.rev || 0) !== deckRow.rev) { status = 409; out = { error: 'stale', rev: deckRow.rev, decks: deckRow.decks }; }
			else { deckRow = { rev: deckRow.rev + 1, decks: body.decks }; out = { ok: true, rev: deckRow.rev, count: body.decks.length }; }
		} else if (body.action === 'run-score') { seen.score.push(body); out = { ok: true, rank: 1 }; }
		else if (body.action === 'run-leaderboard') {
			out = body.mode === 'micatro_modded'
				? { top: [{ name: 'bob', score: 999999, ante: 6, back: 'b_red', stake: 1, mods: [], customDeck: 'Goth Deck' }], you: null }
				: { top: [], you: null };
		}
		else if (body.action === 'chat-get') out = { messages: [] };
		res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async ({ url, w = 1600, h = 900, guest = false, scale = 1 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: w, height: h, deviceScaleFactor: scale, isMobile: w < 600, hasTouch: w < 600 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st, guest) => {
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				if (!sessionStorage.getItem('deckui_init')) { sessionStorage.setItem('deckui_init', '1'); for (const k of ['micatro_run_v1', 'micatro_mods', 'micatro_cdeck_sel', 'micatro_decks_v1']) localStorage.removeItem(k); }
				if (!guest) { localStorage.setItem('magepunk_mp_token_v1', 'deck-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			} catch { }
		}, STATE, guest);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		return { page, errors, ctx };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const V = (page) => page.evaluate(() => window.__micatro.view());
	// Click like a player: scroll the target into view, check nothing covers its centre, then a real
	// mouse click (or a touch tap on the phone page) at that point.
	const tap = async (page, sel, { touch = false } = {}) => {
		await page.waitForSelector(sel, { visible: true, timeout: 8000 });
		// a modal that is still sliding in (risein) would move the target under the pointer: let it settle
		await waitFor(() => page.evaluate((s) => { const m = document.querySelector(s).closest('.modal'); return !m || m.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'); }, sel), 2000);
		const hit = await page.evaluate((s) => {
			const el = document.querySelector(s);
			el.scrollIntoView({ block: 'center', behavior: 'instant' });
			const r = el.getBoundingClientRect();
			const x = r.left + r.width / 2, y = r.top + r.height / 2;
			const at = document.elementFromPoint(x, y);
			return { ok: !!at && (at === el || el.contains(at)), x, y, at: at ? String(at.className || at.tagName) : 'nothing' };
		}, sel);
		A(hit.ok, `"${sel}" is reachable (not covered)`, hit.at);
		if (!hit.ok) return false;
		if (touch) await page.touchscreen.tap(hit.x, hit.y); else await page.mouse.click(hit.x, hit.y);
		await sleep(60);
		return true;
	};
	const typeInto = async (page, sel, text, { enter = true } = {}) => {
		await tap(page, sel);
		await page.evaluate((s) => { const el = document.querySelector(s); el.select && el.select(); }, sel);
		await page.keyboard.type(String(text));
		if (enter) await page.keyboard.press('Enter');
		await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.blur(); }, sel);
		await sleep(80);
	};
	const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
	const shot = async (page, name) => { await sleep(450); const p = path.join(SHOTS, name + '.png'); await page.screenshot({ path: p }); console.log('  shot: ' + p); };

	// ============================================================== the editor, desktop
	{
		const { page, errors } = await open({ url: '/micatro/' });
		await tap(page, '.b-menu-play');
		await page.waitForSelector('.new-run', { visible: true });
		A(/Off/.test(await text(page, '.nr-cdeck-sum')) && await page.$('.b-cdecks'), 'New Run has a Custom deck row (off)');
		await tap(page, '.b-cdecks');
		await page.waitForSelector('.cd-list', { visible: true, timeout: 10000 });
		await waitFor(() => page.evaluate(() => /account/.test(document.querySelector('.cd-status').textContent)), 5000);
		const ex = await page.evaluate(() => [...document.querySelectorAll('.cd-row')].map(r => r.textContent));
		A(ex.some(t => /Goth Deck/.test(t) && /by mgibbie/.test(t) && /Pokermon/.test(t)), 'the list shows the Goth Deck example (by mgibbie, needs Pokermon)', JSON.stringify(ex));
		A(/Saved to your account/.test(await text(page, '.cd-status')), 'a logged-in player\'s decks live on the account');
		await shot(page, 'decklist-desktop');

		// ---- new deck
		await tap(page, '.b-cd-new');
		await page.waitForSelector('.cd-editor', { visible: true });
		await typeInto(page, '.cd-name', 'Test Deck', { enter: false });
		await typeInto(page, '[data-k="p:dollars:v"]', '20');
		A(await page.evaluate(() => document.querySelector('[data-k="p:dollars:v"]').value) === '20', 'starting money typed into its stepper');
		await tap(page, '[data-k="p:hands:+"]');
		A(await page.evaluate(() => document.querySelector('[data-k="p:hands:v"]').value) === '5', 'the + button raises Hands to 5');
		await tap(page, '.b-cd-back-next');
		A(/Blue Deck/.test(await text(page, '.cd-art-n')), 'the back art cycles (Red -> Blue)', await text(page, '.cd-art-n'));
		await shot(page, 'editor-deck-desktop');
		// ---- cards: a preset, then one card edited
		await tap(page, '.b-cd-tab-cards');
		await tap(page, '[data-k="preset:no_faces"]');
		A(/^40 cards/.test(await text(page, '.cd-sec-t')), 'the No face cards preset: 40 cards', await text(page, '.cd-sec-t'));
		await tap(page, '.cd-pc[data-card="H_A"]');
		await page.waitForSelector('.cd-carddlg', { visible: true });
		for (let i = 0; i < 4 && !/Glass/.test(await text(page, '[data-k="cd:enh"]')); i++) await tap(page, '[data-k="cd:enh"]');
		A(/Glass/.test(await text(page, '[data-k="cd:enh"]')), 'the card\'s enhancement cycles to Glass');
		await tap(page, '[data-k="cd:n:+"]');
		await shot(page, 'card-dialog-desktop');
		await tap(page, '.b-cd-carddone');
		A(/^41 cards/.test(await text(page, '.cd-sec-t')) && /×2/.test(await text(page, '.cd-pc[data-card="H_A"]')), 'the Ace of Hearts is now Glass x2 (41 cards)');
		await shot(page, 'editor-cards-desktop');
		// ---- items: a starting Joker from the picker
		await tap(page, '.b-cd-tab-items');
		await tap(page, '.b-cd-add-joker');
		await page.waitForSelector('.cd-picker', { visible: true });
		await typeInto(page, '.cd-search', 'Joker', { enter: false });
		await tap(page, '.cd-tile[data-key="j_joker"]');
		A(/Added Joker/.test(await text(page, '.cd-pick-note')), 'the picker adds the Joker (and stays open for more)');
		await shot(page, 'picker-desktop');
		await tap(page, '.cd-pick-modal .b-back');
		A(await page.evaluate(() => !!document.querySelector('.cd-item[data-item="joker:j_joker"]')), 'the Joker is listed under Starting Jokers');
		await tap(page, '[data-k="j:0:eternal"]');
		A(await page.evaluate(() => document.querySelector('[data-k="j:0:eternal"]').classList.contains('on')), 'it is made Eternal');
		// ---- rules: a collapsed group opens, a toggle flips
		await tap(page, '.b-cd-tab-rules');
		A(await page.evaluate(() => !document.querySelector('[data-k="r:aces_are_faces"]')), 'rule groups start collapsed');
		await tap(page, '[data-k="rg:Gameplay"]');
		await tap(page, '[data-k="r:aces_are_faces"]');
		A(await page.evaluate(() => document.querySelector('[data-k="r:aces_are_faces"]').classList.contains('on') && /1 changed/.test(document.querySelector('[data-k="rg:Gameplay"]').textContent)), 'Aces are faces: On (the group header counts 1 changed)');
		await shot(page, 'editor-rules-desktop');
		// ---- save
		await tap(page, '.b-cd-save');
		await waitFor(() => page.evaluate(() => /Saved/.test(document.querySelector('.cd-editor .cd-msg').textContent)), 5000);
		const put = seen.puts[seen.puts.length - 1];
		A(put && put.rev === 0 && put.decks.length === 1 && put.decks[0].def.name === 'Test Deck' && put.decks[0].def.params.dollars === 20 && put.decks[0].def.rules.aces_are_faces === true, 'Save writes the deck to the account (micatro-decks-put, rev 0)', JSON.stringify(put && put.decks[0].def).slice(0, 200));
		// ---- share code from the Share tab
		await tap(page, '.b-cd-tab-share');
		await tap(page, '.b-cd-makecode');
		await waitFor(() => page.evaluate(() => /^MCD1\./.test(document.querySelector('.cd-export').value)), 5000);
		const code = await page.evaluate(() => document.querySelector('.cd-export').value);
		A(/^MCD1\.[A-Za-z0-9_-]+$/.test(code), 'Share makes an MCD1. code', code.slice(0, 40));
		// ---- Save & use -> New Run with the custom deck
		await tap(page, '.b-cd-saveuse');
		await waitFor(() => page.evaluate(() => !document.querySelector('.cd-list')), 5000);
		A(/Test Deck/.test(await text(page, '.nr-cdeck-sum')) && /Test Deck/.test(await text(page, '.nr-info .nr-name')) && await page.evaluate(() => document.querySelector('.nr-deck .arrow').disabled), 'Save & use: New Run shows the custom deck (the base deck picker is off)');
		A(seen.puts.length === 2 && seen.puts[1].rev === 1 && seen.puts[1].decks.length === 1, 'the second save updates the same deck at rev 1');
		await shot(page, 'newrun-custom-desktop');
		await tap(page, '.b-start');
		await waitFor(() => page.evaluate(() => window.__micatro.session && window.__micatro.view().state === 'BLIND_SELECT'), 15000);
		await idle(page);
		let v = await V(page);
		const rec = await page.evaluate(() => window.__micatro.session.recipe);
		A(v.custom_deck && v.custom_deck.name === 'Test Deck' && v.back === 'b_blue' && rec.customDeck && rec.customDeck.name === 'Test Deck', 'the run starts with the custom deck (view + recipe)', JSON.stringify(v.custom_deck));
		A(v.dollars === 20 && v.deck_total === 41 && v.areas.jokers.length === 1 && v.areas.jokers[0].center === 'j_joker' && v.areas.jokers[0].eternal, '$20, 41 cards, an Eternal Joker', JSON.stringify({ d: v.dollars, n: v.deck_total, j: v.areas.jokers }));
		A(v.deck_list.filter(x => x[0] === 'H_A' && x[1] === 'm_glass').length === 2, 'two Glass Aces of Hearts in the deck');
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page);
		A(await page.evaluate(() => { const G = window.__micatro.session && window.__micatro.view(); return G.hands_left === 5; }), 'Hands: 5');
		A(await page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); const ace = G.playing_cards.find(c => c.base.value === 'Ace'); return !!ace && ace.is_face(); }), 'the rule plays: Aces are face cards');
		await shot(page, 'run-custom-desktop');
		// resume
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		await tap(page, '.b-continue');
		await waitFor(() => page.evaluate(() => !!window.__micatro.session), 15000);
		await idle(page);
		v = await V(page);
		A(v.custom_deck && v.custom_deck.name === 'Test Deck' && v.state === 'SELECTING_HAND' && v.deck_total === 41, 'Continue resumes the custom-deck run', JSON.stringify({ cd: v.custom_deck, s: v.state }));
		await page.keyboard.press('i');
		A(await waitFor(() => page.evaluate(() => /Test Deck/.test((document.querySelector('.ri-cdeck') || {}).textContent || '')), 3000), 'Run Info names the custom deck');
		await page.keyboard.press('Escape');
		// a score from it is filed as modded with the deck's name
		await page.evaluate(async () => { const n = await import('/micatro/js/net.js'); await n.submitScore({ score: 5, ante: 1, mods: [], customDeck: window.__micatro.view().custom_deck.name }); });
		A(seen.score.length && seen.score[seen.score.length - 1].mode === 'micatro_modded' && seen.score[seen.score.length - 1].customDeck === 'Test Deck', 'its score goes to the Modded board with the deck name');

		// ---- import the share code as a new deck
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		await tap(page, '.b-menu-play');
		await tap(page, '.b-cdecks');
		await page.waitForSelector('.cd-row[data-deck^="d"]', { visible: true, timeout: 8000 });
		A(await page.evaluate(() => [...document.querySelectorAll('.cd-row')].filter(r => /Test Deck/.test(r.textContent)).length === 1), 'the saved deck is listed (read back from the account)');
		await tap(page, '.b-cd-import');
		await tap(page, '.cd-import-in');
		await page.evaluate((c) => { const i = document.querySelector('.cd-import-in'); i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })); }, code);
		await tap(page, '.b-cd-doimport');
		await page.waitForSelector('.cd-editor', { visible: true });
		A(await page.evaluate(() => document.querySelector('.cd-name').value) === 'Test Deck', 'Import code opens the editor with the shared deck');
		await typeInto(page, '.cd-name', 'Imported Deck', { enter: false });
		await tap(page, '.b-cd-tab-cards');
		A(/^41 cards/.test(await text(page, '.cd-sec-t')), 'the imported deck has the same 41 cards');
		await tap(page, '.b-cd-save');
		await waitFor(() => page.evaluate(() => /Saved/.test(document.querySelector('.cd-editor .cd-msg').textContent)), 5000);
		await tap(page, '.cd-editor-modal .b-back');
		await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.cd-row')].some(r => /Imported Deck/.test(r.textContent))), 5000);
		A(deckRow.decks.length === 2 && deckRow.decks.some(d => d.def.name === 'Imported Deck'), 'it saves as a second deck', deckRow.decks.map(d => d.def.name).join());
		// delete it again
		const impId = deckRow.decks.find(d => d.def.name === 'Imported Deck').id;
		await tap(page, `[data-k="del:${impId}"]`);
		await tap(page, '.b-cd-yes');
		await waitFor(() => page.evaluate(() => ![...document.querySelectorAll('.cd-row')].some(r => /Imported Deck/.test(r.textContent))), 5000);
		A(deckRow.decks.length === 1, 'Delete removes it from the account');
		// ---- the Goth Deck example: Use -> its run turns on Pokermon
		await tap(page, '[data-k="use:ex-goth"]');
		A(/Goth Deck/.test(await text(page, '.nr-cdeck-sum')), 'Use picks the Goth Deck');
		await tap(page, '.b-start');
		await waitFor(() => page.evaluate(() => window.__micatro.session && window.__micatro.view().custom_deck && window.__micatro.view().state === 'BLIND_SELECT'), 60000);
		await idle(page);
		v = await V(page);
		A(v.custom_deck.name === 'Goth Deck' && v.mods.includes('pokermon') && v.areas.jokers.map(j => j.center).join() === 'j_poke_gothitelle,j_poke_xatu,j_poke_arcanine', 'the Goth Deck run: Pokermon on, Gothitelle / Xatu / Arcanine', JSON.stringify({ mods: v.mods, j: v.areas.jokers.map(j => j.center) }));
		await sleep(1500);
		await shot(page, 'run-goth-desktop');
		A(errors.length === 0, 'no console errors (desktop)', errors.join(' | '));
	}

	// ============================================================== phone portrait + controller
	{
		const { page, errors } = await open({ url: '/micatro/', w: 390, h: 844, scale: 2 });
		await tap(page, '.b-menu-play', { touch: true });
		await page.waitForSelector('.new-run', { visible: true });
		await tap(page, '.b-cdecks', { touch: true });
		await page.waitForSelector('.cd-list', { visible: true });
		await waitFor(() => page.evaluate(() => document.querySelectorAll('.cd-row').length >= 2), 5000);
		const fit = (sel) => page.evaluate((s) => {
			const box = document.querySelector(s).closest('.modal-box');
			const bad = [...box.querySelectorAll('button, input')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map(e => e.className + ':' + Math.round(e.getBoundingClientRect().right));
			return { over: box.scrollWidth - box.clientWidth, bad, vw: innerWidth };
		}, sel);
		let f = await fit('.cd-list');
		A(f.over <= 1 && f.bad.length === 0, 'phone: the deck list fits 390 px (no sideways overflow)', JSON.stringify(f));
		await shot(page, 'decklist-phone');
		await tap(page, '.b-cd-new', { touch: true });
		await page.waitForSelector('.cd-editor', { visible: true });
		for (const t of ['deck', 'cards', 'items', 'bans', 'rules', 'share']) {
			await tap(page, '.b-cd-tab-' + t, { touch: true });
			if (t === 'rules') await tap(page, '[data-k="rg:Shop"]', { touch: true });
			f = await fit('.cd-editor');
			A(f.over <= 1 && f.bad.length === 0, `phone: the ${t} tab fits 390 px`, JSON.stringify(f));
			await page.evaluate(() => { document.querySelector('.cd-editor').closest('.modal-box').scrollTop = 0; });
			await shot(page, 'editor-' + t + '-phone');
		}
		// touch: a stepper works with taps
		await tap(page, '.b-cd-tab-rules', { touch: true });
		await tap(page, '[data-k="r:shop_slots:+"]', { touch: true });
		A(await page.evaluate(() => document.querySelector('[data-k="r:shop_slots:v"]').value) === '3', 'phone: tapping + raises Joker slots in the shop to 3');
		// controller: the reticle reaches tabs, steppers, toggles and Save
		const reach = await page.evaluate(() => {
			const P = window.__micatroPad; if (!P) return 'no pad';
			P.ensure();
			const seen = new Set();
			const trail = [];
			for (let i = 0; i < 120; i++) {
				const f = P.focus;
				if (f && f.el) { const k = f.el.dataset && f.el.dataset.k; const tag = k ? k.split(':')[0] : f.cls.split(' ').slice(0, 3).join('.'); seen.add(tag); trail.push(k || tag); }
				P.move(i < 100 ? 'up' : 'down');
			}
			window.__padTrail = trail;
			return [...seen].join('|');
		});
		A(/tab/.test(reach) && /r\b|r\|/.test(reach + '|') && /save/.test(reach) && /rg/.test(reach), 'controller: the reticle reaches tabs, rule groups, rule controls and Save', reach + ' ' + JSON.stringify(await page.evaluate(() => (window.__padTrail || []).slice(0, 60))));
		await shot(page, 'editor-pad-phone');
		A(errors.length === 0, 'no console errors (phone)', errors.join(' | '));
	}

	// ============================================================== guest: decks in this browser
	{
		const { page, errors } = await open({ url: '/micatro/', guest: true });
		await tap(page, '.b-menu-play');
		await tap(page, '.b-cdecks');
		await page.waitForSelector('.cd-list', { visible: true });
		await waitFor(() => page.evaluate(() => /browser/.test(document.querySelector('.cd-status').textContent)), 5000);
		A(/Saved in this browser/.test(await text(page, '.cd-status')), 'a guest\'s decks are kept in this browser');
		await tap(page, '.b-cd-new');
		await typeInto(page, '.cd-name', 'Guest Deck', { enter: false });
		const puts0 = seen.puts.length;
		await tap(page, '.b-cd-save');
		await waitFor(() => page.evaluate(() => /Saved/.test(document.querySelector('.cd-editor .cd-msg').textContent)), 5000);
		const local = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_decks_v1') || 'null'));
		A(local && local.decks.length === 1 && local.decks[0].def.name === 'Guest Deck' && seen.puts.length === puts0, 'saved to localStorage (no server write)', JSON.stringify(local).slice(0, 120));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		await tap(page, '.b-menu-play');
		await tap(page, '.b-cdecks');
		A(await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.cd-row')].some(r => /Guest Deck/.test(r.textContent))), 5000), 'and it is there after a reload');
		A(errors.length === 0, 'no console errors (guest)', errors.join(' | '));
	}

	// ============================================================== leaderboard + spectator
	{
		const { page, errors } = await open({ url: '/micatro/' });
		await tap(page, '.b-leaders');
		await tap(page, '.b-lb-modded');
		A(await waitFor(() => page.evaluate(() => /Custom deck: Goth Deck/.test(document.querySelector('.lb-body').textContent)), 6000), 'the Modded leaderboard row says "Custom deck: Goth Deck"');
		await shot(page, 'leaderboard-modded');
		A(errors.length === 0, 'no console errors (leaderboard)', errors.join(' | '));
	}
	{
		const { page, errors } = await open({ url: '/micatro/?spectate=bob' });
		A(await waitFor(() => page.evaluate(() => (window.__micatro.board.view || {}).state === 'SELECTING_HAND'), 15000), 'the spectator renders the custom-deck snapshot');
		const sp = await page.evaluate(() => { const v = window.__micatro.board.view; return { cd: v.custom_deck, back: v.back }; });
		A(sp.cd && sp.cd.name === 'Spec Deck' && sp.back === 'b_green', 'it carries the custom deck name + back art', JSON.stringify(sp));
		await tap(page, '.b-runinfo');
		A(await waitFor(() => page.evaluate(() => /Spec Deck/.test((document.querySelector('.ri-cdeck') || {}).textContent || '')), 3000), 'the spectator\'s Run Info names it');
		A(errors.length === 0, 'no console errors (spectator)', errors.join(' | '));
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
