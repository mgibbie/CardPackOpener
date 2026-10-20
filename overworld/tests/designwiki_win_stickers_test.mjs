// designwiki_win_stickers_test.mjs — the design wiki's Micatro pages draw the signed-in player's own WIN STICKERS
// on every joker and deck card they've won with (designwiki/app.js micatroWinStickers + style.css .mc-winstk), with
// the game's own logic and art (micatro/js/ui/stickers.js winStickerInfo / drawSpecialSticker / withoutRevoked,
// stickers.png): the priority Arceus (both) > Ambipom (mono) > Aipom (nuz) > Pikachu (poke) > the plain stake sticker,
// the stake level, the old flat record format, revocations (with the re-earn rule), base jokers and decks and a mod's
// jokers and decks. A mock /api/mp serves the `micatro-stickers-get` row (the revoked keys deliberately NOT stripped,
// so the client's own handling is what's tested) and records every call: the wiki only ever reads.
// Signed out: nothing is fetched or drawn, and no console errors.
//   node overworld/tests/designwiki_win_stickers_test.mjs
//   (WSTK_SHOTS=<dir>: also saves desktop + phone screenshots of the jokers page with stickers)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
// (mod art missing from this checkout — a worktree: gitignored — is served read-only from the main checkout; MICATRO_MAIN overrides)
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const SHOTS = process.env.WSTK_SHOTS || '';
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9583;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'stickerer', friendCode: 'STK000', decks: [], collection: {}, packs: 0, stats: {}, friends: [] };

// the account row: one key per tier, the old flat format, revocations (unstripped: the client must apply them)
const WINS = {
	j_joker: { win: 3 },                          // plain: Green
	j_droll: 6,                             // the old flat format = {win: 6}: Purple
	j_greedy_joker: { win: 8, poke: 1 },          // Pikachu beats a Gold plain sticker: poke, White
	j_lusty_joker: { poke: 5, nuz: 2 },           // Aipom: nuz, Red
	j_wrathful_joker: { nuz: 8, mono: 4 },        // Ambipom: mono, Black
	j_gluttenous_joker: { win: 2, mono: 8, both: 6 }, // Arceus: both, Purple
	j_jolly: { win: 7 },                    // revoked (every category): none
	j_zany: { win: 5, nuz: 3 },             // nuz revoked: the plain Blue shows
	j_mad: { win: 4 },                      // revoked at 1000 but re-earned at 2000: stays Black
	b_red: { win: 2 },                            // a deck: Red
	b_blue: { nuz: 7 },                           // a deck, special: Aipom, Orange
	j_poke_bulbasaur: { mono: 5 },                // a mod joker: Ambipom, Blue
	b_poke_pokemondeck: { win: 8 },               // a mod deck: Gold
};
const REVOKED = { j_jolly: true, j_zany: ['nuz'], j_mad: { cats: true, at: 1000 } };
const EARNED = { j_mad: { win: 2000 } };
const WANT = {
	j_joker: 'win:Green', j_droll: 'win:Purple', j_greedy_joker: 'poke:White', j_lusty_joker: 'nuz:Red',
	j_wrathful_joker: 'mono:Black', j_gluttenous_joker: 'both:Purple', j_zany: 'win:Blue', j_mad: 'win:Black',
};
const calls = [];

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw); } catch { }
		calls.push({ action: b.action, auth: req.headers.authorization || '' });
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'micatro-stickers-get') res.end(JSON.stringify({ v: 2, wins: WINS, rev: 3, revoked: REVOKED, earned: EARNED }));
		else res.end(JSON.stringify({ ok: true }));
		return;
	}
	if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

	// ---------- signed out: no fetch, no stickers, no errors
	{
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1400, height: 900 });
		const errors = [];
		page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro/jokers`, { waitUntil: 'networkidle0' });
		await page.waitForFunction(() => document.querySelectorAll('#content .mc-tile').length >= 150, { timeout: 15000 }).catch(() => { });
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro/decks`, { waitUntil: 'networkidle0' });
		await page.waitForFunction(() => document.querySelectorAll('#content .mc-tile').length >= 15, { timeout: 15000 }).catch(() => { });
		await new Promise(r => setTimeout(r, 500));
		A(await page.$$eval('#content .mc-tile', t => t.length) >= 15, 'signed out: the decks page renders');
		A(await page.$$eval('.mc-winstk, [data-sticker], .mc-wstk-note', e => e.length) === 0, 'signed out: no stickers and no note');
		A(calls.length === 0, 'signed out: /api/mp is never called', JSON.stringify(calls));
		A(errors.length === 0, 'signed out: no console errors', errors.join(' | '));
		await ctx.close();
	}

	// ---------- signed in
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1400, height: 900 });
	const errors = [];
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument((st) => {
		try { localStorage.setItem('magepunk_mp_token_v1', 'stk-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { }
	}, STATE);
	const stickersOn = (n) => page.waitForFunction((k) => document.querySelectorAll('#content [data-sticker]').length >= k, { timeout: 15000 }, n).then(() => true, () => false);
	const shown = () => page.$$eval('#content .mc-tile[data-sticker]', t => Object.fromEntries(t.map(x => [x.dataset.key, x.dataset.sticker])));
	/** One tile's sticker canvas: pixels + geometry against its sprite, and a reference cell of stickers.png. */
	const probe = (key) => page.evaluate(async (key) => {
		const tile = document.querySelector(`#content .mc-tile[data-key="${key}"]`);
		const spr = tile && tile.querySelector('.mc-art > .mc-spr'), cv = spr && spr.querySelector('.mc-winstk');
		if (!cv) return null;
		const S = await import('/micatro/js/ui/stickers.js');
		const a = cv.getBoundingClientRect(), b = spr.getBoundingClientRect();
		const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
		const at = (x, y) => Array.from(px.slice((y * cv.width + x) * 4, (y * cv.width + x) * 4 + 4));
		const [cat, stake] = cv.dataset.sticker.split(':');
		const out = { w: cv.width, h: cv.height, sameBox: Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5, label: cv.title, opaque: 0 };
		for (let i = 3; i < px.length; i += 4) if (px[i]) out.opaque++;
		if (cat === 'win') {
			// the plain sticker = the game's stickers.png cell, pixel for pixel
			const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = '/micatro/assets/textures/stickers.png'; });
			const ref = document.createElement('canvas'); ref.width = 142; ref.height = 190;
			const p = S.STICKER_POS[stake];
			ref.getContext('2d').drawImage(im, p.x * 142, p.y * 190, 142, 190, 0, 0, 142, 190);
			const rp = ref.getContext('2d').getImageData(0, 0, 142, 190).data;
			let diff = 0; for (let i = 0; i < rp.length; i++) if (Math.abs(rp[i] - px[i]) > 2) diff++;
			out.cellDiff = diff;
		} else {
			// a special: the ring in the stake colour at the game's spot (111, 30, r 21), the Pokémon inside
			const { x, y, r } = S.SPECIAL_SPOT;
			const ring = at(x, y - (r - 4)), col = S.STAKE_COLOURS[stake];
			out.ring = ring; out.ringOk = '#' + ring.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('') === col;
			let sprite = 0;
			for (let yy = y - 8; yy <= y + 8; yy++) for (let xx = x - 8; xx <= x + 8; xx++) { const c = at(xx, yy); if (Math.abs(c[0] - 0xf2) + Math.abs(c[1] - 0xf4) + Math.abs(c[2] - 0xf5) > 30) sprite++; }
			out.sprite = sprite;
			out.img = S.SPECIAL[cat].img;
		}
		return out;
	}, key);

	await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro/jokers`, { waitUntil: 'networkidle0' });
	A(await stickersOn(Object.keys(WANT).length), 'jokers page: stickers drawn on the won jokers');
	await page.waitForFunction(() => [...document.querySelectorAll('#content .mc-winstk')].length > 0, { timeout: 5000 }).catch(() => { });
	await new Promise(r => setTimeout(r, 600)); // (the Pokémon sprites load, then everything repaints)
	const got = await shown();
	for (const [k, want] of Object.entries(WANT)) A(got[k] === want, `${k} shows ${want}`, got[k]);
	A(!got.j_jolly && !(await page.$('#content .mc-tile[data-key="j_jolly"] .mc-winstk')), 'a fully revoked joker shows no sticker');
	A(Object.keys(got).length === Object.keys(WANT).length, 'no other joker has a sticker', JSON.stringify(got));
	// each tier: the game's art at the game's spot
	const plain = await probe('j_joker');
	A(plain && plain.w === 142 && plain.h === 190 && plain.sameBox, 'the sticker canvas is a 142x190 card face laid exactly over the sprite', JSON.stringify(plain && { w: plain.w, h: plain.h, sameBox: plain.sameBox }));
	A(plain && plain.cellDiff === 0 && plain.opaque > 200, 'plain (Green): the stickers.png Green cell, pixel for pixel', plain && plain.cellDiff);
	A(plain && /Green Stake/.test(plain.label), 'plain: labelled with its stake', plain && plain.label);
	for (const [k, img] of [['j_greedy_joker', 'pikachu'], ['j_lusty_joker', 'aipom'], ['j_wrathful_joker', 'ambipom'], ['j_gluttenous_joker', 'arceus']]) {
		const p = await probe(k);
		A(p && p.img === img && p.ringOk && p.sprite > 20, `${k}: ${img} in a ${WANT[k].split(':')[1]} ring at the game's spot`, JSON.stringify(p && { img: p.img, ring: p.ring, sprite: p.sprite }));
	}
	const zany = await probe('j_zany');
	A(zany && zany.cellDiff === 0, 'a revoked category falls back to the next one (zany: its plain Blue)');

	// the note + toggle
	const noteTxt = await page.$eval('#content .mc-wstk-note', n => n.textContent).catch(() => '');
	A(/stickerer’s Micatro win stickers/.test(noteTxt), 'the note names whose stickers they are', noteTxt);
	await page.click('#content .mc-wstk-btn');
	A(await page.$eval('#content .mc-tile[data-key="j_joker"] .mc-winstk', c => getComputedStyle(c).display) === 'none', 'Hide: the stickers hide');
	await page.click('#content .mc-wstk-btn');
	A(await page.$eval('#content .mc-tile[data-key="j_joker"] .mc-winstk', c => getComputedStyle(c).display) !== 'none', 'Show: they come back');
	// re-rendering (a filter) keeps them
	await page.type('#content .mc-search', 'gluttonous');
	A(await stickersOn(1) && (await shown()).j_gluttenous_joker === 'both:Purple', 'a filtered re-render still draws the sticker');

	if (SHOTS) {
		fs.mkdirSync(SHOTS, { recursive: true });
		await page.goto('about:blank');
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro/jokers`, { waitUntil: 'networkidle0' });
		await stickersOn(8); await new Promise(r => setTimeout(r, 800));
		await page.screenshot({ path: path.join(SHOTS, 'wiki_jokers_desktop.png') });
		await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
		await page.reload({ waitUntil: 'networkidle0' }); await stickersOn(8); await new Promise(r => setTimeout(r, 800));
		await page.screenshot({ path: path.join(SHOTS, 'wiki_jokers_phone.png') });
		await page.setViewport({ width: 1400, height: 900 });
	}

	// decks (base)
	await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro/decks`, { waitUntil: 'networkidle0' });
	A(await stickersOn(2), 'decks page: stickers drawn');
	const decks = await shown();
	A(decks.b_red === 'win:Red' && decks.b_blue === 'nuz:Orange' && Object.keys(decks).length === 2, 'Red Deck: Red; Blue Deck: an Orange Aipom; no others', JSON.stringify(decks));
	const red = await probe('b_red');
	A(red && red.cellDiff === 0 && red.sameBox, 'Red Deck: the Red stickers.png cell over the deck sprite');
	await new Promise(r => setTimeout(r, 300));
	const blue = await probe('b_blue');
	A(blue && blue.img === 'aipom' && blue.ringOk && blue.sprite > 20, 'Blue Deck: Aipom in an Orange ring', JSON.stringify(blue && { ring: blue.ring, sprite: blue.sprite }));

	// a mod's joker + deck (Pokermon)
	await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro-mods/jokers?mod=pokermon`, { waitUntil: 'networkidle0' });
	A(await stickersOn(1), 'mod jokers page: a sticker drawn');
	await new Promise(r => setTimeout(r, 300));
	A((await shown()).j_poke_bulbasaur === 'mono:Blue', 'Bulbasaur (Pokermon): Ambipom, Blue', JSON.stringify(await shown()));
	const bulb = await probe('j_poke_bulbasaur');
	A(bulb && bulb.ringOk && bulb.sprite > 20 && bulb.sameBox, 'Bulbasaur: the ring + Pokémon over its mod-atlas sprite', JSON.stringify(bulb && { ring: bulb.ring, sprite: bulb.sprite, sameBox: bulb.sameBox }));
	await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro-mods/decks?mod=pokermon`, { waitUntil: 'networkidle0' });
	A(await stickersOn(1), 'mod decks page: a sticker drawn');
	const pd = await probe('b_poke_pokemondeck');
	A((await shown()).b_poke_pokemondeck === 'win:Gold' && pd && pd.cellDiff === 0 && pd.sameBox, 'Pokémon Deck (Pokermon): the Gold cell', JSON.stringify(pd && { diff: pd.cellDiff, sameBox: pd.sameBox }));

	// the wiki only READS the account
	A(calls.length >= 1 && calls.every(c => c.action === 'micatro-stickers-get' && c.auth === 'Bearer stk-token'), 'signed in: only micatro-stickers-get, with the account token', JSON.stringify(calls.map(c => c.action)));
	A(errors.length === 0, 'signed in: no console errors', errors.join(' | '));
	await ctx.close();
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
