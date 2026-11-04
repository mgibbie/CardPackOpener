// micatro_deck_record_test.mjs — the Achievements screen's DECKS tab (a tester's idea: "a view like [the Record] but for decks";
// micatro/js/ui/screens.js decksPanel), in headless Chrome against a stub /api/mp:
//   * one tile per deck: the 15 vanilla decks, then the decks of the mods turned on (Pokermon here); each with its back, its name,
//     and its best stake won (data-stake, a ring in that stake's colour and the deck's own win sticker drawn on the back)
//   * the data is the account's EXISTING deck win stickers (micatro-stickers-get), old flat-format records included: a seeded
//     account's wins show at once, nothing new is stored
//   * never-won decks are dimmed; the header says decks won (N / total), won on Gold or higher, the best stake won
//   * a won deck whose mod is off is counted in a note, not drawn
//   * paged: every deck on exactly one page (Prev / Next and a controller's LB / RB)
//   * fits a phone both ways up (390x844, 844x390): no sideways scroll, every tile inside the modal, the modal doesn't scroll
//   node overworld/tests/micatro_deck_record_test.mjs   [SHOTS=<dir> saves screenshots]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9767;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const B = { LB: 4, RB: 5, right: 15 };

// the seeded account: wins on several decks and stakes, a mod deck, an old flat-format record, a deck of a mod that is off
const WINS = {
	b_red: { win: 8 },                      // Gold
	b_blue: { win: 2 },                     // Red
	b_yellow: { win: 9, poke: 9 },          // Elite (a Pokermon run: the Pikachu sticker)
	b_green: 5,                             // the OLD flat format: Blue
	b_poke_pokemondeck: { win: 3, nuz: 3 }, // a Pokermon deck, Green (Aipom)
	b_othermod_testdeck: { win: 4 },        // a deck whose mod isn't on: counted, not drawn
	j_joker: { win: 8 },                    // a joker: never a deck
};
const EXPECT = { b_red: 'Gold', b_blue: 'Red', b_yellow: 'Elite', b_green: 'Blue', b_poke_pokemondeck: 'Green' };
const ACCTS = { tok_dk: { user: 'deckfan', wins: WINS } };
const stateOf = (user) => ({ username: user, friendCode: 'DKR000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: [] });
let puts = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
		const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || body.token || '';
		const acct = ACCTS[tok];
		let out;
		if (body.action === 'micatro-stickers-get' && acct) out = { v: 2, wins: acct.wins, rev: 1, revoked: {}, earned: {} };
		else if (body.action === 'micatro-stickers-put' && acct) { puts++; out = { ok: true, wins: { ...acct.wins, ...(body.wins || {}) }, rev: 2, changed: false, revoked: {}, earned: {} }; }
		else out = { ok: true, state: acct ? stateOf(acct.user) : null, top: [], messages: [] };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));   // gitignored art: the main checkout
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const open = async ({ token = null, mods = [], vp = { width: 1600, height: 900 }, touch = false } = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ ...vp, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((token, st, mods) => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad];
			let polls = 0;
			Object.defineProperty(pad, 'connected', { get() { polls++; return true; }, enumerable: true });
			const until = (f, ms = 10000) => new Promise((r) => { const t0 = performance.now(); const k = () => (f() || performance.now() - t0 > ms ? r() : setTimeout(k, 4)); k(); });
			const set = (b, on) => { pad.buttons[b] = on ? { pressed: true, value: 1 } : { pressed: false, value: 0 }; };
			window.__padTap = async (b, hold = 70) => { const t0 = performance.now(); set(b, true); const n = polls; await until(() => polls > n && performance.now() - t0 >= hold); set(b, false); const m = polls; await until(() => polls > m + 1); };
			try {
				if (sessionStorage.getItem('dk_init')) return;
				sessionStorage.setItem('dk_init', '1');
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.setItem('micatro_joker_wins_guest_carried', '1');
				if (token) { localStorage.setItem('magepunk_mp_token_v1', token); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				if (mods.length) localStorage.setItem('micatro_mods', JSON.stringify({ ids: mods, options: {} }));
				else localStorage.removeItem('micatro_mods');
			} catch { }
		}, token, token ? stateOf(ACCTS[token].user) : null, mods);
		await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready && document.querySelector('.b-achievements'))), 40000);
		await waitFor(() => page.evaluate(async () => { const s = (await import('/micatro/js/ui/stickers.js')).stickerSyncState(); return !s || s.synced; }), 10000);
		const tap = async (b) => { await page.evaluate(b => window.__padTap(b, 70), b); await sleep(200); };
		return { page, ctx, errors, tap };
	};
	const openDecks = async (page, wantMod) => {
		await page.evaluate(() => document.querySelector('.b-achievements').click());
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-ach-deck')), 5000);
		await page.evaluate(() => document.querySelector('.b-ach-deck').click());
		await waitFor(() => page.evaluate((m) => !!document.querySelector('.dk-tile') && (!m || !!document.querySelector('.dk-tile[data-mod]') || [...document.querySelectorAll('.dk-page-ind')].some((e) => /\/ [2-9]/.test(e.textContent))), wantMod), 15000);
		await sleep(400);   // (the mod's decks arrive, the page re-fits)
	};
	/** The current page: [{back, stake, best, off, mod, name, small, ring, sticker, filter}] + the pager + the header. */
	const state = (page) => page.evaluate(() => {
		const tiles = [...document.querySelectorAll('.dk-tile')].filter((t) => !t.hidden).map((t) => ({
			back: t.dataset.back, stake: t.dataset.stake, best: +t.dataset.best, off: t.classList.contains('off'), mod: t.dataset.mod || null,
			name: t.querySelector('.dk-name').textContent, small: t.querySelector('.dk-best').textContent,
			ring: getComputedStyle(t.querySelector('.dk-art')).getPropertyValue('--ring').trim(),
			sticker: t.querySelector('canvas').dataset.sticker || null, filter: getComputedStyle(t.querySelector('canvas')).filter,
		}));
		const stat = (c) => { const e = document.querySelector(`.dk-sum .rec-stat[data-cat="${c}"]`); return e ? [...e.children].map((x) => x.textContent).join(' ').replace(/\s+/g, ' ').trim() : null; };
		const pg = document.querySelector('.dk-pager');
		return {
			tiles, ind: document.querySelector('.dk-page-ind').textContent, pager: !!pg && pg.style.display !== 'none',
			prevOff: document.querySelector('.b-dk-prev').disabled, nextOff: document.querySelector('.b-dk-next').disabled,
			won: stat('won'), gold: stat('gold'), best: stat('best'),
			offNote: (document.querySelector('.dk-off') || {}).textContent || '', note: (document.querySelector('.dk-note') || {}).textContent || '',
			legend: (document.querySelector('.dk-legend') || {}).textContent || '',
		};
	});
	/** Walk every page with Next (or `step`), back to page 1 first; -> all the tiles seen + the page count. */
	const allPages = async (page, step) => {
		for (let i = 0; i < 30 && !(await state(page)).prevOff; i++) await page.evaluate(() => document.querySelector('.b-dk-prev').click());
		const seen = [];
		let s = await state(page), n = 0;
		for (;;) {
			seen.push(...s.tiles); n++;
			if (s.nextOff || n > 30) break;
			if (step) await step(); else await page.evaluate(() => document.querySelector('.b-dk-next').click());
			await sleep(80);
			s = await state(page);
		}
		return { seen, n, ind: s.ind };
	};
	const fits = (page) => page.evaluate(() => {
		const R = (e) => e.getBoundingClientRect();
		const boxEl = document.querySelector('.ach-modal .modal-box'), box = R(boxEl);
		const bad = [];
		const inside = (r, o, s) => { if (r.left < o.left - 0.5 || r.right > o.right + 0.5 || r.top < o.top - 0.5 || r.bottom > o.bottom + 0.5) bad.push(s + ' ' + [r.left, r.right, r.top, r.bottom].map(Math.round).join(',')); };
		for (const t of document.querySelectorAll('.dk-tile:not([hidden]), .dk-sum .rec-stat, .dk-pager .btn, .ach-modal .tabs .btn')) inside(R(t), box, t.className);
		for (const t of document.querySelectorAll('.dk-tile:not([hidden])')) { inside(R(t.querySelector('canvas')), R(t), 'art in ' + t.dataset.back); }
		const se = document.scrollingElement;
		return {
			bad, hscroll: se.scrollWidth > innerWidth + 1 || boxEl.scrollWidth > boxEl.clientWidth + 1,
			boxScrolls: boxEl.scrollHeight > boxEl.clientHeight + 1, over: boxEl.scrollHeight - boxEl.clientHeight, inView: box.left >= -0.5 && box.right <= innerWidth + 0.5,
			tiles: document.querySelectorAll('.dk-tile:not([hidden])').length,
		};
	});
	const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

	// ---------------- 1. desktop, signed in, Pokermon on
	{
		const { page, ctx, errors, tap } = await open({ token: 'tok_dk', mods: ['pokermon'] });
		await openDecks(page, true);
		let s = await state(page);
		await shot(page, 'decks_desktop_mods.png');
		const { seen, n, ind } = await allPages(page);
		const keys = seen.map((t) => t.back);
		if (SHOTS) { // the page holding the Pokermon deck (its Aipom sticker comes from the mod's own sprite)
			for (let i = 0; i < 8 && !(await page.evaluate(() => !!document.querySelector('[data-back="b_poke_pokemondeck"]:not([hidden])'))); i++) await page.evaluate(() => document.querySelector('.b-dk-prev').click());
			await shot(page, 'decks_desktop_mods_pokermon_page.png');
		}
		const by = Object.fromEntries(seen.map((t) => [t.back, t]));
		const vanilla = await page.evaluate(async () => (await import('/micatro/js/ui/assets.js')).BACK_LIST.map((b) => b.key));
		const pokeBacks = await page.evaluate(async () => (await import('/micatro/js/mods/index.js')).modBacks(['pokermon'], {}).map((b) => b.key));
		A(vanilla.length === 15 && vanilla.every((k) => keys.includes(k)), 'every vanilla deck has a tile', JSON.stringify(vanilla.filter((k) => !keys.includes(k))));
		A(pokeBacks.length > 0 && pokeBacks.every((k) => keys.includes(k)) && keys.length === vanilla.length + pokeBacks.length, `... and every Pokermon deck (${pokeBacks.length}): ${keys.length} tiles`, JSON.stringify([keys.length, vanilla.length, pokeBacks.length]));
		A(new Set(keys).size === keys.length && !keys.includes('j_joker') && !keys.includes('b_othermod_testdeck'), 'each deck on exactly one page; no joker, no deck of a mod that is off', JSON.stringify(keys));
		A(n > 1 && ind === `Page ${n} / ${n}` && s.pager, `paged: ${n} pages (Prev / Next, "Page ${n} / ${n}" on the last)`, JSON.stringify([n, ind]));
		for (const [k, stake] of Object.entries(EXPECT)) {
			const t = by[k] || {};
			A(t.stake === stake && !t.off && t.small === 'Won · ' + stake && t.ring && t.ring !== 'transparent' && t.sticker && t.sticker.endsWith(':' + stake), `${k}: best stake ${stake} (ring ${t.ring}, sticker ${t.sticker})`, JSON.stringify(t));
		}
		A(by.b_yellow && by.b_yellow.sticker === 'poke:Elite' && by.b_poke_pokemondeck.sticker === 'nuz:Green', '... the deck\'s own win sticker: Pikachu (a Pokermon win) on Yellow, Aipom (a Nuzlocke) on the Pokémon deck', JSON.stringify([by.b_yellow && by.b_yellow.sticker, by.b_poke_pokemondeck && by.b_poke_pokemondeck.sticker]));
		A(by.b_poke_pokemondeck && by.b_poke_pokemondeck.mod === 'pokermon', '... the mod deck is tagged with its mod');
		const ringOf = (k) => (by[k] || {}).ring.toLowerCase();
		A(ringOf('b_red') === '#eac058' && ringOf('b_yellow') === '#ba8514' && ringOf('b_blue') === '#fe5f55', 'rings use the stake colours (Gold #eac058, Elite #ba8514, Red #fe5f55)', JSON.stringify([ringOf('b_red'), ringOf('b_yellow'), ringOf('b_blue')]));
		const unwon = seen.filter((t) => !EXPECT[t.back]);
		A(unwon.length === keys.length - 5 && unwon.every((t) => t.off && t.stake === 'none' && t.best === 0 && t.small === 'Not won' && /grayscale/.test(t.filter) && !t.sticker), `the ${unwon.length} never-won decks are dimmed (greyscale, "Not won", no sticker)`, JSON.stringify(unwon.filter((t) => !(t.off && /grayscale/.test(t.filter))).slice(0, 3)));
		s = await state(page);
		A(s.won === `5 / ${keys.length} Decks won`, 'header: decks won N / total', s.won);
		A(/^2 Won on Gold Stake or higher$/.test(s.gold), 'header: 2 won on Gold or higher (Red Deck Gold, Yellow Elite)', s.gold);
		A(s.best === 'Elite Best stake won', 'header: the best stake won (Elite)', s.best);
		A(/1 more won deck from mods that are off/.test(s.offNote), 'a won deck of a mod that is off is counted in a note', s.offNote);
		A(/best stake/i.test(s.legend) && /not a win count/.test(s.note) && /Seeded, challenge and custom-deck runs do not count/.test(s.note), 'the legend + explanation line', s.legend + ' | ' + s.note);
		// the controller: LB / RB turn the page
		await page.evaluate(() => { for (let i = 0; i < 30; i++) { const b = document.querySelector('.b-dk-prev'); if (b.disabled) break; b.click(); } });
		await tap(B.right);   // (wakes the reticle)
		const before = (await state(page)).ind;
		await tap(B.RB);
		const afterRB = (await state(page)).ind;
		await tap(B.LB);
		const afterLB = (await state(page)).ind;
		A(before === `Page 1 / ${n}` && afterRB === `Page 2 / ${n}` && afterLB === `Page 1 / ${n}`, 'a controller\'s RB / LB turn the page', JSON.stringify([before, afterRB, afterLB]));
		const f = await fits(page);
		A(!f.bad.length && !f.hscroll && !f.boxScrolls, `desktop: a page (${f.tiles} tiles) fits the box, no scrolling`, JSON.stringify(f));
		// the other tabs still work, and the Decks tab comes back
		await page.evaluate(() => document.querySelector('.b-ach-rec').click());
		A(await page.evaluate(() => !!document.querySelector('.rec-types') && !document.querySelector('.dk-rec')), 'the Record tab still shows the type grid');
		await page.evaluate(() => document.querySelector('.b-ach-deck').click());
		A(await page.evaluate(() => document.querySelectorAll('.dk-tile:not([hidden])').length > 0), '... and back to Decks');
		A(!errors.length, 'no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---------------- 2. vanilla (no mods): 15 decks, the Pokermon win counted as a mod that is off
	{
		const { page, ctx, errors } = await open({ token: 'tok_dk' });
		await openDecks(page, false);
		await shot(page, 'decks_desktop_vanilla.png');
		const { seen } = await allPages(page);
		const s = await state(page);
		A(seen.length === 15 && !seen.some((t) => t.mod), 'mods off: the 15 vanilla decks', seen.length);
		A(s.won === '4 / 15 Decks won' && /^2 Won on Gold/.test(s.gold), 'header: 4 / 15 won, 2 on Gold or higher', JSON.stringify([s.won, s.gold]));
		A(/2 more won decks from mods that are off/.test(s.offNote), '... the Pokermon deck\'s win and the other mod\'s: "2 more won decks"', s.offNote);
		A(!errors.length, 'no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---------------- 3. phones, both ways up (Pokermon on)
	for (const [label, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
		const { page, ctx, errors } = await open({ token: 'tok_dk', mods: ['pokermon'], vp, touch: true });
		await openDecks(page, true);
		await shot(page, `decks_phone_${label}.png`);
		const f = await fits(page);
		A(!f.bad.length && !f.hscroll && f.inView, `${label} ${vp.width}x${vp.height}: every tile, total and button inside the modal; no sideways scroll`, JSON.stringify(f));
		A(!f.boxScrolls && f.tiles >= 4, `${label}: one page is one screen (${f.tiles} tiles, the modal doesn't scroll)`, JSON.stringify(f));
		const { seen, n } = await allPages(page);
		A(new Set(seen.map((t) => t.back)).size === seen.length && seen.length > 15 && n > 1, `${label}: paging shows every deck once (${seen.length} over ${n} pages)`, JSON.stringify([seen.length, n]));
		const last = await fits(page);
		A(!last.bad.length && !last.hscroll, `${label}: the last page fits too`, JSON.stringify(last));
		A(!errors.length, 'no page errors', errors.join(' | '));
		await ctx.close();
	}
} catch (e) {
	fail++;
	console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
