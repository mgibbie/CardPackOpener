// micatro_regressions_1019_test.mjs — two Micatro regressions the owner hit on an iPhone (2026-10-19):
//   1. a Standard Pack card's tooltip title read "{C:light_black}6 of {V:1}Hearts" (6 of Hearts, Holographic,
//      Purple Seal, a Pokermon run). A playing card's name is Balatro's loc playing_card, " {C:light_black}#1# of
//      {V:1}#2# " (engine/describe.js); the board put every title in escaped, so the codes showed. The title
//      now runs through markup (ui/markup.js titleHtml) on Balatro's white name pill, the suit in its colour —
//      in a pack, in the hand, with and without mods; the other titles (jokers, consumables, a mod enhancement,
//      a mod seal and the info boxes) carry no codes either.
//   2. after buying a shop Reroll, the jokers and the shop cards showed only their Pokermon type pill over an
//      empty card (the face canvas blank) for the rest of the run. Nothing redrew a face that once drew
//      nothing (faces are cached), one throwing overlay aborted the whole compose (and, inside a flip, the
//      render loop), and a lost WebGL context drew every shaded card empty. Checked here: after rerolls (API
//      and fast taps, 1x and 4x, win stickers on the jokers) every joker and shop card has a face with pixels
//      and the page logs no errors — also while a win-sticker sprite throws when drawn, while the Pokermon
//      atlas can't be drawn for a moment (the face recovers once it can), and after the card shaders' WebGL
//      context is lost (a holo joker still shows its face).
// Mod art missing from this checkout (a worktree) is served read-only from the main checkout two levels up
// (MICATRO_MAIN overrides), like micatro_pack_hand_items_test.mjs.
// Covers micatro/js/ui/markup.js (titleHtml, describePlaying), micatro/js/ui/board.js (renderTip, frame),
// micatro/js/ui/cardsprite.js (composeFace layers, compose retry, renderFx), micatro/js/ui/gl.js (CardFX context loss).
//   node overworld/tests/micatro_regressions_1019_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 9643;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

// the win stickers the owner's jokers wear (a special Pokermon sticker each, and a plain stake one)
const WINS = { j_poke_fidough: { mono: 5 }, j_poke_clefable: { nuz: 3 }, j_poke_granbull: { both: 2, win: 4 }, j_poke_snubbull: { win: 6 } };
const FAIRY = ['j_poke_fidough', 'j_poke_clefable', 'j_poke_granbull'];

/** A fresh page on a phone viewport at `speed`: the board's errors are collected (page errors + console errors). */
async function openPage(speed) {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
	page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await page.evaluateOnNewDocument((speed, wins) => {
		localStorage.setItem('micatro_speed', String(speed)); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
		localStorage.setItem('micatro_joker_wins_v1:guest', JSON.stringify(wins));
		// fault injection, off unless a step turns it on: a sprite that throws when drawn / an image that draws nothing
		window.__fault = { throwSrc: null, blankSrc: null };
		const di = CanvasRenderingContext2D.prototype.drawImage;
		CanvasRenderingContext2D.prototype.drawImage = function (im, ...rest) {
			const src = (im && im.src) || '';
			if (window.__fault.throwSrc && src.includes(window.__fault.throwSrc)) throw new DOMException('The image is in the broken state.', 'InvalidStateError');
			if (window.__fault.blankSrc && src.includes(window.__fault.blankSrc)) return undefined; // (not decodable right now: draws nothing)
			return di.call(this, im, ...rest);
		};
		// the WebGL contexts the page makes (the card shaders' is the 142x190 one)
		window.__gl = [];
		const gc = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
			const c = gc.call(this, type, ...rest);
			if (c && /webgl/.test(type) && !window.__gl.includes(c)) window.__gl.push(c);
			return c;
		};
	}, speed, WINS);
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	return { page, errors };
}
const idle = async (page) => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(250); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
/** Start a run, win the first blind and cash out into the shop. */
async function toShop(page, mods) {
	await page.evaluate(async (mods) => { if (mods.length) await window.__micatro.loadMods(mods); await window.__micatro.newRun({ seed: 'REG1019', back: 'b_red', mods }); }, mods);
	await idle(page);
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle(page);
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; return window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }); });
	await idle(page);
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
	await idle(page);
	await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle(page);
}
/** The open tooltip's title: its text, its HTML, and the colour of each coloured run in it. */
const tipTitle = (page) => page.evaluate(() => {
	const t = document.querySelector('.tip');
	if (!t || t.style.display === 'none') return null;
	const n = t.querySelector('.tip-name');
	const pill = n.querySelector('.tip-pc');
	return {
		text: n.textContent.trim(), html: n.innerHTML, info: [...t.querySelectorAll('.ti-name')].map((x) => x.textContent),
		runs: [...n.querySelectorAll('.mk')].map((x) => [x.textContent.trim(), getComputedStyle(x).color]),
		pill: pill ? getComputedStyle(pill).backgroundColor : null,
	};
});
const showTip = (page, id) => page.evaluate((id) => { const B = window.__micatro.board, s = B.sprites.get(id); if (!s) return false; B.showCardTip(s, true); return true; }, id);
const hideTip = (page) => page.evaluate(() => window.__micatro.board.hideTip());
const noCodes = (t) => !!t && !/[{}]/.test(t.text) && !/\{[A-Za-z]:/.test(t.html) && t.info.every((x) => !/[{}]/.test(x));

/** Open a Standard Pack from the shop with the 6 of Hearts (Holographic, Purple Seal) as its first card -> its id. */
async function standardPackSixOfHearts(page) {
	await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		C.G.GAME.dollars = 100;
		const p = C.create_card('Booster', C.G.shop_booster, null, null, null, null, 'p_standard_normal_1'); C.G.shop_booster.emplace(p); C.G.E_MANAGER.flush();
		return window.__micatro.act({ type: 'buy', id: p.sort_id });
	});
	await idle(page);
	const id = await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const c = C.G.pack_cards.cards[0];
		if (!c) return null;
		c.set_base(C.P_CARDS.H_6); c.set_ability(C.P_CENTERS.c_base); c.set_edition({ holo: true }, true, true); c.set_seal('Purple', true);
		return c.sort_id;
	});
	await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [] })); // (a no-op action: the view picks the card up)
	await idle(page);
	return id;
}

// ============================================================ 1. playing-card tooltip titles
async function titles(mods, label) {
	const { page, errors } = await openPage(4);
	try {
		await toShop(page, mods);
		const id = await standardPackSixOfHearts(page);
		A(id != null && (await page.evaluate(() => window.__micatro.view().areas.pack_cards.length)) > 0, `${label}: a Standard Pack opens with the 6 of Hearts in it`);
		await page.tap(`.card[data-id="${id}"]`); await sleep(400);
		let t = await tipTitle(page);
		await shot(page, `${label}-1-standard-pack-6-of-hearts.png`);
		A(t && t.text === '6 of Hearts' && noCodes(t), `${label}: the pack card's tooltip title reads "6 of Hearts" (no markup codes)`, JSON.stringify(t));
		const hearts = t && t.runs.find((r) => r[0] === 'Hearts');
		A(hearts && hearts[1] === 'rgb(240, 52, 100)', `${label}: "Hearts" is in the Hearts colour`, JSON.stringify(t && t.runs));
		const six = t && t.runs.find((r) => /^6 of$/.test(r[0]));
		A(six && six[1] === 'rgb(79, 99, 103)' && t.pill === 'rgb(255, 255, 255)', `${label}: "6 of" is light_black on Balatro's white playing-card name pill`, JSON.stringify(t && { runs: t.runs, pill: t.pill }));
		// every card in the pack
		const packIds = await page.evaluate(() => window.__micatro.view().areas.pack_cards.map((c) => c.id));
		const bad = [];
		for (const pid of packIds) { await showTip(page, pid); const tt = await tipTitle(page); if (!noCodes(tt) || !/ of /.test(tt.text) && !/Stone Card/.test(tt.text)) bad.push(JSON.stringify(tt && tt.text)); }
		A(!bad.length, `${label}: every Standard Pack card's title is plain "<rank> of <suit>" (${packIds.length} cards)`, bad.join(' | '));
		await hideTip(page);
		// pick it into the deck, close the pack, play the next blind: the same card in the hand
		await page.evaluate((id) => window.__micatro.act({ type: 'use', id }), id); await idle(page);
		const st = await page.evaluate(() => window.__micatro.view().state);
		if (st !== 'SHOP') { await page.evaluate(() => window.__micatro.act({ type: 'skip_booster' })); await idle(page); }
		// a joker and a consumable to check their titles too
		const extra = mods.length ? ['j_poke_clefable', 'c_poke_moonstone'] : ['j_joker', 'c_jupiter'];
		await page.evaluate(async (extra) => {
			const C = await import('/micatro/js/engine/core.js');
			const j = C.create_card('Joker', C.G.jokers, null, null, null, null, extra[0]); j.add_to_deck(); C.G.jokers.emplace(j);
			const k = C.create_card(/^c_poke/.test(extra[1]) ? 'Item' : 'Planet', C.G.consumeables, null, null, null, null, extra[1]); k.add_to_deck(); C.G.consumeables.emplace(k);
			C.G.E_MANAGER.flush();
		}, extra);
		await page.evaluate(() => window.__micatro.act({ type: 'next_round' })); await idle(page);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' })); await idle(page);
		// put the 6 of Hearts in the hand (the engine card), plus a mod enhancement and a mod seal in a Pokermon run
		const hand = await page.evaluate(async (id, modded) => {
			const C = await import('/micatro/js/engine/core.js');
			const six = C.G.playing_cards.find((c) => c.sort_id === id);
			if (six && six.area !== C.G.hand) { six.area.remove_card(six); C.G.hand.emplace(six); }
			const others = C.G.hand.cards.filter((c) => c !== six);
			if (modded) {
				if (C.P_CENTERS.m_poke_flower && others[0]) others[0].set_ability(C.P_CENTERS.m_poke_flower, null, true);
				const pink = Object.keys(C.P_SEALS).find((k) => /pink/i.test(k));
				if (pink && others[1]) others[1].set_seal(pink, true);
			}
			C.G.E_MANAGER.flush();
			return { six: six && six.sort_id, others: C.G.hand.cards.map((c) => c.sort_id) };
		}, id, mods.length > 0);
		await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [] })); await idle(page);
		await showTip(page, hand.six);
		t = await tipTitle(page);
		await shot(page, `${label}-2-hand-6-of-hearts.png`);
		A(t && t.text === '6 of Hearts' && noCodes(t) && (t.runs.find((r) => r[0] === 'Hearts') || [])[1] === 'rgb(240, 52, 100)', `${label}: in the hand, the same card's title is "6 of Hearts", Hearts in its colour`, JSON.stringify(t));
		const badHand = [];
		for (const hid of hand.others) { await showTip(page, hid); const tt = await tipTitle(page); if (!noCodes(tt)) badHand.push(JSON.stringify(tt && tt.text)); }
		A(!badHand.length, `${label}: no hand card's title or info box shows markup codes (${hand.others.length} cards${mods.length ? ', incl. a Flower card and a Pink Seal' : ''})`, badHand.join(' | '));
		// jokers and consumables: their titles are unchanged plain names
		const row = await page.evaluate(() => { const v = window.__micatro.view(); return [...v.areas.jokers, ...v.areas.consumeables].map((c) => c.id); });
		const badRow = [];
		for (const rid of row) { await showTip(page, rid); const tt = await tipTitle(page); if (!tt || !noCodes(tt) || !tt.text || tt.pill) badRow.push(JSON.stringify(tt)); }
		A(row.length >= 2 && !badRow.length, `${label}: joker and consumable titles are plain names, no pill, no codes (${row.length} cards)`, badRow.join(' | '));
		await hideTip(page);
		A(!errors.length, `${label}: no page errors`, errors.slice(0, 3).join(' | '));
	} finally { await page.close(); }
}

// ============================================================ 2. faces after rerolls
/** Every joker and shop card: a sprite whose face canvas has pixels (count of non-transparent pixels). */
const faces = (page) => page.evaluate(() => {
	const B = window.__micatro.board, v = window.__micatro.view(), out = [];
	for (const a of ['jokers', 'shop_jokers']) for (const c of v.areas[a]) {
		const s = B.sprites.get(c.id);
		let n = -1;
		if (s) { try { const d = s.face.getContext('2d').getImageData(0, 0, s.face.width, s.face.height).data; n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; } catch (e) { n = -2; } }
		out.push({ area: a, key: c.center, id: c.id, px: n, el: !!(s && s.el.isConnected) });
	}
	return out;
});
const allDrawn = (fs0) => fs0.length > 0 && fs0.every((f) => f.el && f.px > 5000);
const fmtFaces = (fs0) => fs0.map((f) => `${f.area}:${f.key}=${f.px}`).join(' ');

async function buyFairies(page) {
	for (const key of FAIRY) {
		const id = await page.evaluate(async (key) => {
			const { G, create_card } = await import('/micatro/js/engine/core.js');
			const c = create_card('Joker', G.shop_jokers, null, null, null, null, key);
			G.shop_jokers.emplace(c); G.GAME.dollars = 1000;
			return c.sort_id;
		}, key);
		await page.evaluate((id) => window.__micatro.act({ type: 'buy', id }), id);
		await idle(page);
	}
}
/** n rerolls: alternately through the API and as two fast taps on the Reroll button. */
async function rerolls(page, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.dollars = 1000; });
		if (i % 2) { await page.tap('.b-reroll').catch(() => {}); await sleep(40); await page.tap('.b-reroll').catch(() => {}); }
		else await page.evaluate(() => window.__micatro.act({ type: 'reroll_shop' }));
		await sleep(120);
	}
	// (the game settles: a board that threw mid-animation never goes idle again)
	const settled = await idle(page).then(() => true, () => false);
	await sleep(1200);
	return settled;
}

async function rerollFaces(speed) {
	const label = `${speed}x`;
	const { page, errors } = await openPage(speed);
	try {
		await toShop(page, ['pokermon']);
		await buyFairies(page);
		let f = await faces(page);
		A(f.filter((x) => x.area === 'jokers').length === 3 && allDrawn(f), `${label}: Fidough, Clefable and Granbull (win stickers) and the shop cards are drawn`, fmtFaces(f));
		A(await rerolls(page, 6), `${label}: the game settles after 6 rerolls`);
		f = await faces(page);
		await shot(page, `reroll-${label}-1-after-rerolls.png`);
		A(allDrawn(f), `${label}: after 6 rerolls (API + fast taps) every joker and shop card face has pixels`, fmtFaces(f));
		A(!errors.length, `${label}: no page errors after the rerolls`, errors.slice(0, 3).join(' | '));

		// a win-sticker sprite that throws when drawn (a broken / undecodable image): the jokers recompose (the
		// sticker option bumps them) and a reroll brings new cards: every face still draws, only the sticker is skipped
		await page.evaluate(async () => {
			window.__fault.throwSrc = '/winstickers/';
			const S = await import('/micatro/js/ui/stickers.js'); S.setStickersShown(false); S.setStickersShown(true);
		});
		A(await rerolls(page, 2), `${label}: with the win-sticker sprite throwing, the game still settles after 2 rerolls`);
		f = await faces(page);
		await shot(page, `reroll-${label}-2-sticker-sprite-throws.png`);
		A(allDrawn(f), `${label}: with the win-sticker sprite throwing, every joker and shop card face still draws (after a recompose + 2 rerolls)`, fmtFaces(f));
		A(!errors.length, `${label}: ... and no page errors (the failed sticker is a logged warning)`, errors.slice(0, 3).join(' | '));
		await page.evaluate(() => { window.__fault.throwSrc = null; });

		// the Pokermon atlas can't be drawn for a moment (an iPhone under memory pressure: the image draws nothing):
		// rerolls and a recompose land then; once it draws again the faces come back on their own
		await page.evaluate(() => { window.__fault.blankSrc = 'AtlasJokersBasicNatdex'; window.__micatro.board.refreshModArt(); });
		A(await rerolls(page, 2), `${label}: with the atlas undrawable, the game still settles after 2 rerolls`);
		const during = await faces(page);
		await shot(page, `reroll-${label}-3-atlas-undrawable.png`);
		A(during.some((x) => x.px < 5000), `${label}: (the fault bites: some Pokermon faces are empty while the atlas can't be drawn)`, fmtFaces(during));
		await page.evaluate(() => { window.__fault.blankSrc = null; });
		await sleep(5000);
		f = await faces(page);
		await shot(page, `reroll-${label}-4-atlas-back.png`);
		A(allDrawn(f), `${label}: once the atlas draws again, every joker and shop card face recovers (no new action needed)`, fmtFaces(f));

		// the card shaders' WebGL context is lost: a Holographic joker (drawn through the shaders every frame)
		// still shows its face, and so do cards materializing after a reroll
		await page.evaluate(async () => {
			const C = await import('/micatro/js/engine/core.js');
			C.G.jokers.cards[0].set_edition({ holo: true }, true, true);
			return window.__micatro.act({ type: 'highlight', ids: [] });
		});
		await idle(page).catch(() => {}); await sleep(500);
		const lost = await page.evaluate(() => {
			const gl = window.__gl.find((g) => g.canvas && g.canvas.width === 142 && g.canvas.height === 190);
			const ext = gl && gl.getExtension('WEBGL_lose_context');
			if (!ext) return false;
			ext.loseContext();
			return true;
		});
		await sleep(600);
		A(await rerolls(page, 2), `${label}: with the WebGL context lost, the game still settles after 2 rerolls`);
		f = await faces(page);
		await shot(page, `reroll-${label}-5-webgl-lost.png`);
		A(lost && allDrawn(f), `${label}: after the card shaders' WebGL context is lost, the holo joker and every other face still draws`, (lost ? '' : 'no lose_context; ') + fmtFaces(f));
		A(!errors.length, `${label}: no page errors at the end`, errors.slice(0, 3).join(' | '));
	} finally { await page.close(); }
}

try {
	await titles(['pokermon'], 'pokermon');
	await titles([], 'vanilla');
	await rerollFaces(1);
	await rerollFaces(4);
} catch (e) {
	fail++; console.log('FAIL: test crashed: ' + (e && e.stack || e));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
