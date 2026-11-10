// bc_keyboard_pages_test.mjs — Battlecards' DOM screens on the KEYBOARD alone
// (controls sweep B3: battlecards/padnav.js on site/input.js + site/focusnav.js).
//
// Real key presses only (page.keyboard), never a mouse event:
//   * the hub (start.html): arrows reach the Quick Match tile, Z opens it;
//   * the deck builder: Z opens a card page, V too, Esc / X close it and STAY on
//     the page (regression: Esc in the zoom also fired nav.js Back and left);
//     Q / E turn the page; typing in the search box moves nothing;
//   * the gallery: typing ← / → in the search box does NOT flip pages
//     (regression: viewer.js flipped on every arrow, even while typing); Q / E
//     flip; Esc in the zoom stays on the page (regression, as the deck builder);
//   * packs: Z opens a pack and turns the cards, V reads one;
//   * every run mode's first screen (dungeon, heist, tombs, duels, arena and the
//     Lorequest worlds): an arrow shows focus inside the overlay and Z moves the run on;
//   * the boards page and /collection/ (no keyboard / controller before): arrows +
//     Z / E switch boards, Esc goes back; collection cards show their text on focus,
//     V toggles it, and no <button> sits inside an <a> any more.
//
//   node overworld/tests/bc_keyboard_pages_test.mjs
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
const PORT = 9172;
const CARDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards/cards.json'), 'utf8')).cards;
const POOL = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/pool-rarity.json'), 'utf8'));
const owned = Object.keys(POOL).filter(id => CARDS.some(c => c.id === id)).slice(0, 30);
const STATE = { username: 'bcpages', friendCode: 'BCPAG0', decks: [], collection: Object.fromEntries(owned.map(id => [id, 2])), dust: 0, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let action = ''; try { action = JSON.parse(body).action || ''; } catch (e) {}
			const out = /leaderboard/.test(action) ? { ok: true, top: [{ name: 'alice', rating: 1200, wins: 5, losses: 1, hero: 'Jaina' }], you: null }
				: { ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null };
			res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
		}
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const open = async (url, signedIn = false) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, signedIn) => {
			window.__owFakePads = [];
			if (signedIn) { localStorage.setItem('magepunk_mp_token_v1', 'bcpages-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			window.__realMouse = 0;
			for (const t of ['pointerdown', 'pointermove', 'mousedown', 'touchstart']) addEventListener(t, e => { if (e.isTrusted) window.__realMouse++; }, true);
		}, STATE, signedIn);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const key = async (k, ms = 150) => { await page.keyboard.press(k); await sleep(ms); };
		const ring = () => page.evaluate(() => { const f = document.querySelector('.padnav-focus, .focusnav-focus'); return f ? { tag: f.tagName, id: f.id, href: f.getAttribute('href') || '', text: (f.textContent || '').trim().slice(0, 40), cls: String(f.className) } : null; });
		return { ctx, page, errors, key, ring };
	};
	const mouseFree = async (t, where) => A(await t.page.evaluate(() => window.__realMouse) === 0, `${where}: no real mouse / pointer event was used`);

	// ===== the hub =====
	{
		const t = await open('/battlecards/start.html');
		await t.page.waitForSelector('a.primary', { timeout: 15000 });
		await sleep(1200);
		// the first-run tour: Z walks it to the end (Next ... Done)
		const tour = () => t.page.evaluate(() => { const o = document.getElementById('onboard'); return !!o && !o.hidden && getComputedStyle(o).display !== 'none'; });
		if (await tour()) {
			for (let i = 0; i < 12 && await tour(); i++) await t.key('KeyZ', 250);
			A(!(await tour()), 'hub: Z walks the first-run tour to its end');
		}
		await t.key('ArrowDown');
		A(!!(await t.ring()), 'hub: an arrow key shows the focus ring');
		const onQuick = async () => { const r = await t.ring(); return /primary/.test(r?.cls || '') && r.href === 'index.html'; };
		for (let i = 0; i < 25 && !(await onQuick()); i++) await t.key(i < 12 ? 'ArrowUp' : 'ArrowLeft');
		A(await onQuick(), 'hub: the arrows reach the Quick Match tile', JSON.stringify(await t.ring()));
		await Promise.all([t.page.waitForNavigation({ timeout: 15000 }).catch(() => {}), t.key('KeyZ', 50)]);
		A(decodeURIComponent(t.page.url()).includes('/battlecards/index.html'), 'hub: Z opens it (a guest goes by the login page)', t.page.url());
		await t.ctx.close();
	}

	// ===== the deck builder =====
	{
		const t = await open('/battlecards/deck.html');
		await t.page.waitForFunction(() => document.querySelectorAll('#grid .tile').length > 0, { timeout: 20000 }).catch(() => {});
		await sleep(600);
		const url0 = t.page.url();
		const zoomOpen = () => t.page.evaluate(() => !!document.getElementById('zoom')?.classList.contains('open')).catch(() => false);
		deck: {
		await t.key('ArrowDown');
		for (let i = 0; i < 12 && !/tile/.test((await t.ring())?.cls || ''); i++) await t.key('ArrowDown');
		A(/tile/.test((await t.ring())?.cls || ''), 'deck builder: the arrows reach a card tile', JSON.stringify(await t.ring()));
		await t.key('KeyZ', 400);
		A(await zoomOpen(), 'deck builder: Z opens the card page');
		await t.key('Escape', 600);
		await sleep(300);
		A(!(await zoomOpen()) && t.page.url() === url0, 'deck builder: Esc closes the card page and STAYS on the page (regression)', t.page.url());
		if (t.page.url() !== url0) break deck;
		A(/tile/.test((await t.ring())?.cls || ''), 'deck builder: the ring is back on the card that opened it', JSON.stringify(await t.ring()));
		await t.key('KeyV', 400);
		A(await zoomOpen(), 'deck builder: V (inspect) opens the focused card page too');
		await t.key('KeyX', 600);
		A(!(await zoomOpen()) && t.page.url() === url0, 'deck builder: X closes it, still on the page', t.page.url());
		// the deck list: a card added there is a stop too
		await t.key('KeyZ', 400);
		const added = await t.page.evaluate(() => { const b = document.getElementById('zoom-add'); return !!b && !b.disabled && b.getBoundingClientRect().width > 0; });
		if (added) {
			for (let i = 0; i < 8 && (await t.ring())?.id !== 'zoom-add'; i++) await t.key('ArrowDown');
			await t.key('KeyZ', 400);
			await t.key('KeyX', 400);
			A(await t.page.evaluate(() => [...document.querySelectorAll('.deck-row')].some(r => r.tabIndex === 0)), 'deck builder: Z on "Add" puts it in the deck, and its deck row is a keyboard stop');
		}
		// Q / E turn the page
		const pg = () => t.page.evaluate(() => (document.getElementById('pageinfo').textContent.match(/Page (\d+)/) || [])[1] || '?');
		// show All cards (several pages): the DOM focus on the toggle (as Tab puts it there), then Enter
		const pages = () => t.page.evaluate(() => +((document.getElementById('pageinfo').textContent.match(/\/ (\d+)/) || [])[1] || 1));
		await t.page.focus('.tab[data-tab="neutral"]'); await t.key('Enter', 500);
		A(await t.page.evaluate(() => document.querySelector('.tab.on')?.dataset.tab) === 'neutral', 'deck builder: Enter on a Tab-focused button presses it (the NEUTRAL tab)');
		for (let i = 0; i < 3 && await pages() < 2; i++) { await t.page.focus('#owned-toggle'); await t.key('Enter', 500); }
		A(await pages() > 1, 'deck builder: setup: several pages of cards', String(await pages()));
		const p0 = await pg();
		await t.key('KeyE', 400);
		A(await pg() !== p0, 'deck builder: E turns to the next page', `${p0} -> ${await pg()}`);
		await t.key('KeyQ', 400);
		A(await pg() === p0, 'deck builder: Q turns back');
		// typing in the search box moves nothing
		await t.page.focus('#search');
		const f0 = await t.ring();
		await t.page.keyboard.type('wasd');
		await t.key('ArrowLeft'); await t.key('ArrowRight'); await t.key('KeyQ');
		A(await t.page.evaluate(() => document.getElementById('search').value) === 'wasdq' && JSON.stringify(await t.ring()) === JSON.stringify(f0),
			'deck builder: typing WASD / arrows / Q in the search box only types (the focus ring stays put)', JSON.stringify({ v: await t.page.evaluate(() => document.getElementById('search').value), f0, r: await t.ring(), p0, p: await pg() }));
		await mouseFree(t, 'deck builder');
		A(t.errors.length === 0, 'deck builder: no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
		}
		await t.ctx.close();
	}

	// ===== the gallery =====
	{
		const t = await open('/battlecards/viewer.html');
		await t.page.waitForFunction(() => document.querySelectorAll('#grid > *').length > 0 && document.getElementById('page-jump'), { timeout: 25000 }).catch(() => {});
		await sleep(600);
		const url0 = t.page.url();
		const pg = () => t.page.evaluate(() => document.getElementById('page-jump')?.value);
		const p0 = await pg();
		// regression: ← / → typed in the search box flipped the pages under it
		await t.page.focus('#search');
		await t.key('ArrowRight', 300); await t.key('ArrowRight', 300);
		A(await pg() === p0, 'gallery: → in the search box does NOT flip the page (regression)', `${p0} -> ${await pg()}`);
		await t.key('ArrowLeft', 300);
		A(await pg() === p0, 'gallery: ← in the search box does NOT flip the page either');
		await t.key('Escape', 300);            // leave the field (focusnav), back to arrow navigation
		await t.page.evaluate(() => document.activeElement && document.activeElement.blur());
		await t.key('KeyE', 500);
		A(await pg() !== p0, 'gallery: E flips to the next page', `${p0} -> ${await pg()}`);
		await t.key('KeyQ', 500);
		A(await pg() === p0, 'gallery: Q flips back');
		const zoomOpen = () => t.page.evaluate(() => !!document.getElementById('zoom')?.classList.contains('open')).catch(() => false);
		gallery: {
		for (let i = 0; i < 12 && !/#grid/.test(await t.page.evaluate(() => document.querySelector('.padnav-focus')?.closest('#grid') ? '#grid' : '')); i++) await t.key('ArrowDown');
		A(await t.page.evaluate(() => !!document.querySelector('.padnav-focus')?.closest('#grid')), 'gallery: the arrows reach a card', JSON.stringify(await t.ring()));
		A(await t.page.evaluate(() => getComputedStyle(document.getElementById('tip')).display !== 'none'), 'gallery: a focused card shows its rules text (hover-only before)');
		await t.key('KeyZ', 500);
		A(await zoomOpen(), 'gallery: Z opens the zoom');
		await t.key('Escape', 600);
		await sleep(300);
		A(!(await zoomOpen()) && t.page.url() === url0, 'gallery: Esc closes the zoom and STAYS on the page (regression)', t.page.url());
		if (t.page.url() !== url0) break gallery;
		await t.key('KeyV', 400);
		A(await zoomOpen(), 'gallery: V opens the zoom too');
		await t.key('KeyX', 600);
		A(!(await zoomOpen()) && t.page.url() === url0, 'gallery: X closes it, still on the page');
		// with nothing open, Esc is still Back (to the Battlecards hub)
		await Promise.all([t.page.waitForNavigation({ timeout: 10000 }).catch(() => {}), t.key('Escape', 50)]);
		A(/\/battlecards\/start\.html/.test(t.page.url()), 'gallery: Esc with nothing open goes Back, to the Battlecards hub', t.page.url());
		}
		await t.ctx.close();
	}

	// ===== packs =====
	{
		const t = await open('/battlecards/packs.html');
		await t.page.evaluateOnNewDocument(() => localStorage.setItem('magepunk_cardgold_v1', '5000'));
		await t.page.reload({ waitUntil: 'domcontentloaded' });
		await sleep(3500);
		const hint = () => t.page.evaluate(() => document.getElementById('hint').textContent);
		await t.key('KeyZ', 2500);
		A(/reveal|left/i.test(await hint()), 'packs: Z opens a pack', await hint());
		for (let i = 0; i < 2; i++) await t.key('KeyZ', 450);
		A(/reveal \(\d+ left\)/i.test(await hint()) && await t.page.evaluate(() => true), 'packs: Z turns the cards one by one', await hint());
		await sleep(400);
		await t.key('KeyV', 300);
		A(await t.page.evaluate(() => getComputedStyle(document.getElementById('card-tip')).display === 'block'), 'packs: V reads a revealed card (its rules tip)');
		A(!(await t.ring()), 'packs: Z never pulled the focus ring onto the page links');
		await mouseFree(t, 'packs');
		A(t.errors.length === 0, 'packs: no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===== every run mode's first screen =====
	for (const mode of ['dungeon', 'heist', 'tombs', 'duels', 'arena', 'lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse']) {
		const t = await open(`/battlecards/index.html?${mode}=1`, true);
		const t0 = Date.now();
		while (Date.now() - t0 < 30000 && !(await t.page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); return !!o && getComputedStyle(o).display !== 'none' && o.querySelectorAll('button').length > 0; }).catch(() => false))) await sleep(250);
		await sleep(400);
		const html0 = await t.page.evaluate(() => document.getElementById('dungeon-overlay')?.innerHTML || '');
		await t.key('ArrowDown');
		const r = await t.page.evaluate(() => !!document.querySelector('.padnav-focus')?.closest('#dungeon-overlay'));
		await t.key('KeyZ', 900);
		const html1 = await t.page.evaluate(() => document.getElementById('dungeon-overlay')?.innerHTML || '');
		A(html0.length > 0 && r && html1 !== html0, `${mode}: an arrow shows focus in the run's first screen and Z moves the run on`, JSON.stringify({ had: html0.length, r }));
		A(t.errors.length === 0, `${mode}: no uncaught page error`, JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===== the boards page (no keyboard / controller before) =====
	{
		const t = await open('/battlecards/boards.html', true);
		await t.page.waitForFunction(() => window.__boards && document.querySelectorAll('#tabs button').length > 3, { timeout: 15000 });
		await sleep(500);
		await t.key('ArrowDown');
		A(!!(await t.ring()), 'boards: an arrow key shows a focus ring');
		const cur = () => t.page.evaluate(() => window.__boards.current);
		const c0 = await cur();
		await t.key('KeyE', 400);
		A(await cur() !== c0, 'boards: E switches to the next board', `${c0} -> ${await cur()}`);
		await t.key('KeyQ', 400);
		A(await cur() === c0, 'boards: Q switches back');
		for (let i = 0; i < 10 && !/arena/i.test((await t.ring())?.text || ''); i++) await t.key(i < 4 ? 'ArrowUp' : 'ArrowRight');
		await t.key('KeyZ', 400);
		A(await cur() === 'arena', 'boards: the arrows + Z pick a tab (Arena)', await cur());
		await Promise.all([t.page.waitForNavigation({ timeout: 10000 }).catch(() => {}), t.key('KeyX', 50)]);
		A(/\/battlecards\/start\.html/.test(t.page.url()), 'boards: X goes back to the Battlecards hub', t.page.url());
		await t.ctx.close();
	}

	// ===== /collection/ =====
	{
		const t = await open('/collection/', true);
		await t.page.waitForFunction(() => document.querySelectorAll('#grid .wiki-card').length > 0, { timeout: 25000 }).catch(() => {});
		await sleep(500);
		A(await t.page.evaluate(() => document.querySelectorAll('#grid .wiki-card').length > 0 && !document.querySelector('a button, a .craft-btn')), 'collection: the cards render, and no <button> sits inside an <a>');
		await t.key('ArrowDown');
		for (let i = 0; i < 20 && !(await t.page.evaluate(() => !!document.activeElement?.closest?.('#grid .wiki-card'))); i++) await t.key('ArrowDown');
		A(await t.page.evaluate(() => !!document.activeElement?.closest?.('#grid .wiki-card')), 'collection: the arrows reach a card', JSON.stringify(await t.ring()));
		const tip = () => t.page.evaluate(() => { const e = document.getElementById('tip'); return e.style.display === 'block' ? e.textContent : ''; });
		const name = await t.page.evaluate(() => document.activeElement.closest('.wiki-card').querySelector('img').alt);
		A((await tip()).includes(name), 'collection: a focused card shows its text (hover-only before)', JSON.stringify({ name, tip: (await tip()).slice(0, 60) }));
		await t.key('KeyV', 200);
		A(!(await tip()), 'collection: V hides it');
		await t.key('KeyV', 200);
		A((await tip()).includes(name), 'collection: V shows it again');
		await t.key('ArrowRight', 300);
		const name2 = await t.page.evaluate(() => document.activeElement.closest('.wiki-card')?.querySelector('img').alt);
		A(name2 && name2 !== name && (await tip()).includes(name2), 'collection: moving on shows the next card\'s text', JSON.stringify({ name, name2 }));
		await mouseFree(t, 'collection');
		A(t.errors.length === 0, 'collection: no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
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
