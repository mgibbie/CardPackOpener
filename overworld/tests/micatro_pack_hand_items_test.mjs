// micatro_pack_hand_items_test.mjs — a hand-targeting card from a pack opened in the shop is usable from
// inside the pack, on the dealt hand, with real taps (iPhone viewport). A tester: "some items from booster
// packs cannot be used in the shop … it upgrades the hand you're holding" (Pokermon's Moon Stone, from a
// Pocket pack). Use itself worked; what the tester saw was wrong:
//   - the open tooltip kept saying "(Hand: None)" after they picked their cards (it was never re-rendered
//     when the view changed), so the stone looked blind to their hand -> board.js refreshCardTip;
//   - Pocket packs had no SAVE button (Pokermon's lovely.toml reserve_and_use; the engine's 'reserve'
//     action and can_reserve hook existed, but no view ever flagged the card) -> view.js cardView.
// Also pins: Use on Moon Stone / The Magician (Arcana) / MoreFluff's Rotarot Magician inside the pack, on
// the picked hand cards; and a Moon Stone saved to the slots is refused in the shop (no hand there — as in
// Balatro). The engine-level sweep of every hand-targeting consumable x every hand-dealing pack is
// micatro/tests/mods/pack_hand_items_test.mjs.
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main
// checkout two levels up (MICATRO_MAIN overrides); a missing image is tolerated either way.
// Covers micatro/js/ui/board.js (refreshCardTip, cardButtons) and micatro/js/engine/view.js (cardView reserve).
//   node overworld/tests/micatro_pack_hand_items_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 8767;
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
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon', 'morefluff']); await window.__micatro.newRun({ seed: 'PACKHAND', back: 'b_red', mods: ['pokermon', 'morefluff'] }); });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(300); };
	const V = () => page.evaluate(() => window.__micatro.view());
	const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
	const tap = async (sel) => { await page.tap(sel); await sleep(400); };
	// the toasts the board shows (a refused action says why)
	await page.evaluate(() => { const b = window.__micatro.board; const o = b.toast.bind(b); window.__toasts = []; b.toast = (m) => { window.__toasts.push(m); return o(m); }; });
	const toasts = () => page.evaluate(() => window.__toasts.splice(0));

	// win the first blind and cash out into the shop
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle();
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; return window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();

	/** Buy (open) a pack from the shop and put `card` in it (the pack's own roll stays): -> the card's id. */
	const openWith = async (pack, card, set) => {
		const r = await page.evaluate(async (pack) => {
			const C = await import('/micatro/js/engine/core.js');
			C.G.GAME.dollars = 100;
			const p = C.create_card('Booster', C.G.shop_booster, null, null, null, null, pack); C.G.shop_booster.emplace(p); C.G.E_MANAGER.flush();
			return window.__micatro.act({ type: 'buy', id: p.sort_id });
		}, pack);
		await idle();
		const id = await page.evaluate(async (card, set) => {
			const C = await import('/micatro/js/engine/core.js');
			const c = C.create_card(set, C.G.pack_cards, null, null, true, true, card, null); C.G.pack_cards.emplace(c); C.G.E_MANAGER.flush();
			return c.sort_id;
		}, card, set);
		await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [] })); // (a no-op action: the view picks the card up)
		await idle();
		const v = await V();
		A(r.ok && v.areas.pack_cards.some((c) => c.id === id) && v.areas.hand.length >= 5, `${pack} opens from the shop with ${card} in it and the hand dealt`, JSON.stringify({ ok: r.ok, err: r.error, s: v.state, hand: v.areas.hand.length }));
		return id;
	};
	const tipText = () => page.evaluate(() => { const t = document.querySelector('.tip'); return t && t.style.display !== 'none' ? (t.querySelector('.tip-main') || {}).textContent || '' : ''; });
	const btns = (id) => page.evaluate((id) => [...document.querySelectorAll(`.card[data-id="${id}"] .card-btns .btn`)].map((b) => b.textContent.trim()), id);
	const hands = () => page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); return Object.fromEntries(Object.entries(C.G.GAME.hands).map(([k, h]) => [k, h.level])); });
	const tapBtn = async (id, label) => {
		const found = await page.evaluate((id, label) => { const b = [...document.querySelectorAll(`.card[data-id="${id}"] .card-btns .btn`)].find((x) => x.textContent.trim() === label); if (b) b.setAttribute('data-t', label); return !!b; }, id, label);
		if (found) await tap(`.card[data-id="${id}"] .card-btns .btn[data-t="${label}"]`);
		return found;
	};

	// ---- 1. Moon Stone in a Pocket pack: tap it, tap two hand cards, Use
	let ms = await openWith('p_poke_pokepack_normal_1', 'c_poke_moonstone', 'Item');
	let v = await V();
	A(v.state === 'MOD_PACK_HAND', 'a Pocket pack is a hand-dealing pack (MOD_PACK_HAND)', v.state);
	await tap(`.card[data-id="${ms}"]`);
	A(/Hand:\s*None/.test(await tipText()), 'tapping the Moon Stone shows its tooltip: "(Hand: None)" with nothing picked', await tipText());
	const hand = v.areas.hand.map((c) => c.id);
	await tap(`.card[data-id="${hand[0]}"]`);
	await tap(`.card[data-id="${hand[1]}"]`);
	const picked = await page.evaluate(() => window.__micatro.board.handHighlighted());
	A(picked.length === 2 && picked.includes(hand[0]) && picked.includes(hand[1]), 'the two tapped hand cards are picked while the Moon Stone stays chosen', JSON.stringify(picked));
	const tip = await tipText();
	A(/Hand:/.test(tip) && !/Hand:\s*None/.test(tip), 'the open tooltip now names the picked poker hand (it said "None" until re-opened)', tip);
	const b1 = await btns(ms);
	A(b1.includes('Use') && b1.includes('Save'), 'the Pocket pack card offers Use and Save (Pokermon reserve_and_use)', JSON.stringify(b1));
	await shot('1-moonstone-pocket-pack-picked.png');
	const lv0 = await hands();
	await toasts();
	await tapBtn(ms, 'Use');
	await idle();
	v = await V();
	const t1 = await toasts(), lv1 = await hands();
	const up = Object.keys(lv1).filter((k) => lv1[k] > lv0[k]);
	A(!t1.length && v.state === 'SHOP' && !v.areas.pack_cards.some((c) => c.id === ms) && !v.areas.consumeables.some((c) => c.id === ms),
		'Use goes through: the Moon Stone is consumed and the pack closes (1-in-2: the hand levels up or "Nope!")', JSON.stringify({ toasts: t1, s: v.state, up }));
	await shot('2-moonstone-used.png');

	// ---- 2. Save: a second Pocket pack, keep the Moon Stone
	ms = await openWith('p_poke_pokepack_normal_1', 'c_poke_moonstone', 'Item');
	await tap(`.card[data-id="${ms}"]`);
	const saved = await tapBtn(ms, 'Save');
	if (saved) await idle();
	v = await V();
	A(saved && v.state === 'SHOP' && v.areas.consumeables.some((c) => c.id === ms), 'Save puts the Moon Stone in the consumable slots and closes the pack', JSON.stringify({ saved, s: v.state, cons: v.areas.consumeables.map((c) => c.center) }));

	// ---- 3. in the shop with no pack open there is no hand: Use is refused (as in Balatro)
	if (saved) {
		await toasts();
		await tap(`.card[data-id="${ms}"]`);
		await tap(`.card[data-id="${ms}"] .card-btns .use`);
		await idle();
		v = await V();
		const t3 = await toasts();
		A(t3.some((m) => /Can't use that right now/.test(m)) && v.areas.consumeables.some((c) => c.id === ms) && !v.areas.hand.length,
			'a Moon Stone in the slots is refused in the shop (no hand there), and it stays', JSON.stringify({ toasts: t3, hand: v.areas.hand.length }));
		await page.evaluate(() => { const b = window.__micatro.board; b.sel = null; b.hideTip(); b.refreshSelection(); });
	}

	// ---- 4. baseline: The Magician in a vanilla Arcana pack, on two picked cards
	const mag = await openWith('p_arcana_normal_1', 'c_magician', 'Tarot');
	v = await V();
	A(v.state === 'TAROT_PACK', 'an Arcana pack opens (TAROT_PACK)', v.state);
	await tap(`.card[data-id="${mag}"]`);
	const h4 = v.areas.hand.map((c) => c.id);
	await tap(`.card[data-id="${h4[2]}"]`);
	await tap(`.card[data-id="${h4[3]}"]`);
	await shot('3-magician-arcana-picked.png');
	await toasts();
	await tapBtn(mag, 'Use');
	await idle();
	const lucky = await page.evaluate(async (ids) => { const C = await import('/micatro/js/engine/core.js'); return ids.map((id) => { const c = C.G.playing_cards.find((x) => x.sort_id === id); return c && c.config.center.key; }); }, [h4[2], h4[3]]);
	A(lucky.every((k) => k === 'm_lucky') && !(await toasts()).length, 'The Magician turns the two picked hand cards Lucky from inside the pack', JSON.stringify(lucky));

	// ---- 5. another mod: MoreFluff's Rotarot Magician in a Rotarot pack
	const rot = await openWith('p_mf_rotarot_normal_1', 'c_mf_rot_magician', 'Rotarot');
	v = await V();
	await tap(`.card[data-id="${rot}"]`);
	const h5 = v.areas.hand.map((c) => c.id);
	await tap(`.card[data-id="${h5[0]}"]`);
	await toasts();
	await tapBtn(rot, 'Use');
	await idle();
	const conv = await page.evaluate(async (id) => { const C = await import('/micatro/js/engine/core.js'); const c = C.G.playing_cards.find((x) => x.sort_id === id); return { got: c && c.config.center.key, want: C.P_CENTERS.c_mf_rot_magician.config.mod_conv }; }, h5[0]);
	A(conv.got === conv.want && !(await toasts()).length, `the Rotarot Magician converts the picked hand card (${conv.want}) from inside a Rotarot pack`, JSON.stringify(conv));
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
