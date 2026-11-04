// micatro_foresight_test.mjs — Pokermon's scry view ("Foresight") is drawn on the table. The owner (iPhone):
// "Foresight doesn't seem to be visible above the deck like it was in the real game." In Pokermon
// (functions/uifunctions.lua create_scry_cardarea / update_scry_cardarea) the top G.GAME.scry_amount deck
// cards — the next cards to be drawn — sit face up in a small card area on top of the deck while a round is
// played, and during scoring they are evaluated like held cards (Hoothoot / Noctowl give their chips, the
// "+chips" popup lands on the scry card). The engine computed it (mods/pokermon/systems/scry.js) and the view
// carried view.areas.scry, but the board never drew it -> board.js renders 'scry' (scryRect + layout).
// Pins, with Hoothoot owned (+2) and then 6 Foresight cards:
//   - exactly N face-up cards, the deck's top N in draw order (rank + suit);
//   - inside the visible viewport at 1280x720, 390x664 (iPhone with toolbars) and 844x390, clear of the
//     hand, Play / Discard, the deck count and the consumables row (bounding boxes);
//   - after a discard + draw it shows the new top cards; hidden in the shop;
//   - a scored hand puts Hoothoot's "+chips" popup on a scry card (at that card, not the deck / play area).
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main
// checkout two levels up (MICATRO_MAIN overrides); a missing image is tolerated either way.
//   node overworld/tests/micatro_foresight_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 9613;
const SHOTS = process.env.SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.fs': 'text/plain' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
	const page = await browser.newPage();
	page.on('pageerror', (e) => console.log('pageerror', e.message));
	await page.setViewport({ width: 1280, height: 720 });
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'FORESIGHT', back: 'b_red', mods: ['pokermon'] }); });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(900); };
	const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const refresh = async () => { await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [] })); await idle(); }; // (a no-op action: a fresh view)

	// Hoothoot (+2 Foresight) in the jokers, then into the first blind
	await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const c = C.create_card('Joker', C.G.jokers, null, null, true, true, 'j_poke_hoothoot', null);
		c.add_to_deck(); C.G.jokers.emplace(c); C.G.E_MANAGER.flush();
	});
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle();

	/** What the board draws in the scry area vs the engine's deck top. */
	const scryState = () => page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const b = window.__micatro.board;
		const want = []; for (let i = 1; i <= (C.G.GAME.scry_amount || 0) && i <= C.G.deck.cards.length; i++) want.push(C.G.deck.cards[C.G.deck.cards.length - i]);
		const ids = (b.areas.scry || []).slice();
		const shown = ids.map((id) => { const s = b.sprites.get(id); const el = document.querySelector(`.card[data-id="${id}"]`); return { id, front: s && s.d && s.d.front, back: !!(s && s.d && s.d.facing === 'back'), area: s && s.area, el: !!el }; });
		return { amount: C.G.GAME.scry_amount, state: C.G.STATE, ids, shown, want: want.map((c) => ({ id: c.sort_id, key: c.config.card.key, value: c.base.value, suit: c.base.suit })) };
	});
	const checkMatches = async (label) => {
		const st = await scryState();
		A(st.ids.length === st.amount && st.amount > 0, `${label}: the scry area holds exactly ${st.amount} cards`, JSON.stringify({ n: st.ids.length, amount: st.amount }));
		A(st.shown.length > 0 && st.shown.every((x) => x.el && x.area === 'scry' && !x.back && x.front), `${label}: each is a face-up card sprite on the table`, JSON.stringify(st.shown));
		A(st.want.length === st.ids.length && st.want.every((w, i) => w.id === st.ids[i] && w.key === st.shown[i].front),
			`${label}: they are the top of the deck in draw order (rank + suit)`, JSON.stringify({ want: st.want.map((w) => w.key), shown: st.shown.map((x) => x.front) }));
		return st;
	};
	/** Bounding boxes (CSS px) of the scry cards and what they must not cover. */
	const boxes = () => page.evaluate(() => {
		const b = window.__micatro.board;
		const r = (el) => { if (!el) return null; const q = el.getBoundingClientRect(); return q.width && q.height ? { l: q.left, t: q.top, r: q.right, b: q.bottom } : null; };
		const cardR = (id) => r(document.querySelector(`.card[data-id="${id}"] .card-inner`) || document.querySelector(`.card[data-id="${id}"]`));
		const vv = window.visualViewport;
		return {
			vw: vv ? vv.width : innerWidth, vh: vv ? vv.height : innerHeight,
			scry: (b.areas.scry || []).map(cardR).filter(Boolean),
			hand: b.areas.hand.map(cardR).filter(Boolean),
			other: { play: r(b.C.play), discard: r(b.C.discard), deckCount: r(b.deckEl.querySelector('.deck-count')), consumables: r(b.areaBoxC), consLabel: r(b.lblCons), handLabel: r(b.lblHand) },
		};
	});
	const hit = (a, c) => a && c && a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1;
	const checkLayout = async (label) => {
		const B = await boxes();
		A(B.scry.length > 0 && B.scry.every((q) => q.l >= 0 && q.t >= 0 && q.r <= B.vw + 0.5 && q.b <= B.vh + 0.5), `${label}: every scry card is inside the visible viewport`, JSON.stringify({ vw: B.vw, vh: B.vh, scry: B.scry }));
		const handHits = B.scry.filter((q) => B.hand.some((hq) => hit(q, hq)));
		A(B.scry.length > 0 && !handHits.length, `${label}: the scry cards don't overlap the hand`, JSON.stringify({ handHits, hand: B.hand.slice(-2) }));
		const otherHits = Object.entries(B.other).filter(([, o]) => B.scry.some((q) => hit(q, o))).map(([k]) => k);
		A(B.scry.length > 0 && !otherHits.length, `${label}: they clear Play / Discard, the deck count and the consumables row`, JSON.stringify({ otherHits, other: B.other, scry: B.scry }));
	};
	// (width / height only: changing isMobile / hasTouch makes puppeteer reload the page)
	const SIZES = [
		{ name: 'desktop', vp: { width: 1280, height: 720 } },
		{ name: 'portrait', vp: { width: 390, height: 664 } },
		{ name: 'landscape', vp: { width: 844, height: 390 } },
	];
	const allSizes = async (tag) => {
		for (const S of SIZES) {
			await page.setViewport(S.vp); await sleep(1200);
			await checkLayout(`${S.name} ${S.vp.width}x${S.vp.height}, ${tag}`);
			await shot(`${tag}-${S.name}-${S.vp.width}x${S.vp.height}.png`);
		}
		await page.setViewport(SIZES[0].vp); await sleep(800);
	};

	// ---- 1. two Foresight cards (Hoothoot) in the round
	let st = await checkMatches('Hoothoot, round start');
	A(st.amount === 2, 'Hoothoot gives 2 Foresight', st.amount);
	await allSizes('foresight2');

	// ---- 2. a discard draws: the scry area shows the NEW top of the deck
	const before = st.ids;
	await page.evaluate(() => { const v = window.__micatro.view(); return window.__micatro.act({ type: 'highlight', ids: v.areas.hand.slice(0, 3).map((c) => c.id) }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'discard' }));
	await idle();
	st = await checkMatches('after a discard + draw');
	const hand = await page.evaluate(() => window.__micatro.board.areas.hand.slice());
	A(before.every((id) => hand.includes(id)) && !st.ids.some((id) => before.includes(id)), 'the two foreseen cards were the ones drawn, and the area moved on to the next two', JSON.stringify({ before, now: st.ids, hand }));

	// ---- 3. six Foresight cards (Future deck +4 on top of Hoothoot): it compresses, still clear of everything
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.scry_amount = 6; });
	await refresh();
	st = await checkMatches('6 Foresight');
	await allSizes('foresight6');

	// ---- 4. scoring: Hoothoot's "+chips" popup lands on a scry card
	await page.evaluate(() => {
		const b = window.__micatro.board; const o = b.popup.bind(b); window.__pops = [];
		b.popup = (id, text, ...rest) => {
			const s = b.sprites.get(id); const r = o(id, text, ...rest); const p = b.popLayer.lastElementChild;
			window.__pops.push({ id, text, area: s ? s.area : null, sx: s ? s.T.x : null, sy: s ? s.T.y : null, ss: s ? s.T.s : null, px: p ? parseFloat(p.style.left) : null, py: p ? parseFloat(p.style.top) : null, inScry: (b.areas.scry || []).includes(id) });
			return r;
		};
	});
	const scryAtPlay = (await scryState()).ids;
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1e9; const v = window.__micatro.view(); return window.__micatro.act({ type: 'highlight', ids: [v.areas.hand[0].id] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	// a moment of the scoring sequence, with popups on the scry cards
	let shotTaken = false;
	for (let i = 0; i < 200 && !shotTaken; i++) {
		const n = await page.evaluate(() => window.__pops.filter((p) => p.inScry).length);
		if (n >= 2) { await shot('scoring-desktop-1280x720.png'); shotTaken = true; }
		else await sleep(25);
	}
	await idle();
	const pops = await page.evaluate(() => window.__pops);
	const onScry = pops.filter((p) => scryAtPlay.includes(p.id));
	A(onScry.length >= 1 && onScry.every((p) => p.area === 'scry' && p.inScry), 'scoring puts popups on the scry cards (their sprites, in the scry area)', JSON.stringify(pops));
	A(onScry.some((p) => /^\+\d/.test(p.text)), 'a scry card shows Hoothoot\'s "+chips" popup', JSON.stringify(onScry.map((p) => p.text)));
	A(onScry.every((p) => Math.abs(p.px - p.sx) < 2 && p.py < p.sy && p.sy - p.py < 140), 'each popup sits at its scry card (above it), not on the deck or the play area', JSON.stringify(onScry));

	// ---- 5. hidden in the shop
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; C.G.GAME.chips = 0; });
	await page.evaluate(() => { const v = window.__micatro.view(); return window.__micatro.act({ type: 'highlight', ids: [v.areas.hand[0].id] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();
	const shop = await page.evaluate(() => { const b = window.__micatro.board; return { scry: (b.areas.scry || []).length, sprites: [...b.sprites.values()].filter((s) => s.area === 'scry' && !s.leaving).length, view: !!(window.__micatro.view().areas.scry) }; });
	A(shop.scry === 0 && shop.sprites === 0 && !shop.view, 'the scry area is hidden in the shop', JSON.stringify(shop));
	await shot('shop-desktop-1280x720.png');
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
