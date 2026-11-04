// micatro_enhance_refresh_test.mjs — a card changed in place in the hand shows its new face right away,
// as in Balatro: The Empress / Justice / The Hierophant / The Star / Strength flip the picked cards over,
// change them and flip them back showing Mult / Glass / Bonus / Diamonds / the next rank; Talisman's seal,
// Aura's edition and Pokermon's Water Stone (Bonus) land on the card in hand. A tester (iPhone): "Adding
// mult or glass or chips to a card ... it doesn't show when you add it but it shows next time you see
// that card."
// Root cause: card events ('card_changed' / 'edition' / 'seal' / 'flip') carried only the card's id, and
// the board redrew the card from the END-of-action view. A card that has left the table by then (the hand
// dealt for an Arcana / Spectral / Pocket pack goes back to the deck when the pack closes) was never
// redrawn: it flipped back still plain, and its Mult showed only the next time it was drawn. Now each card
// event carries the card's view at that moment (engine/core.js emit + engine/view.js), the board redraws
// from it (ui/board.js), and a flip asked for mid-flip waits its turn (ui/cardsprite.js startFlip /
// updateData), so the flip-change-flip plays through at every speed.
// Each case checks what the card sprite actually composed (its visKey + face canvas), frame by frame,
// BEFORE the end-of-action setView (which is held back while the table is inspected), so a redraw from
// the final view can't mask the bug.
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main
// checkout two levels up (MICATRO_MAIN overrides).
//   node overworld/tests/micatro_enhance_refresh_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 9601;
const SHOTS = process.env.SHOTS || '';
const SPEED = process.env.SPEED || '1';
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
	await page.evaluateOnNewDocument((sp) => { localStorage.setItem('micatro_speed', sp); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); }, SPEED);
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'ENHANCE', back: 'b_red', mods: ['pokermon'] }); });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(300); };
	const V = () => page.evaluate(() => window.__micatro.view());
	const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
	await idle();

	// The recorder: each frame, what every watched card's sprite has actually composed (visKey fields:
	// center, front, edition, seal, facing) and whether it's mid-flip, plus how many end-of-action setViews
	// have run. setView is held back while __hold is set, so the table can be inspected before it.
	await page.evaluate(() => {
		const B = window.__micatro.board;
		const orig = B.setView.bind(B);
		window.__sv = 0; window.__hold = false; window.__held = null;
		B.setView = (view, opts) => { if (window.__hold) { window.__held = [view, opts]; return; } window.__sv++; return orig(view, opts); };
		window.__release = () => { const h = window.__held; window.__hold = false; window.__held = null; if (h) B.setView(h[0], h[1]); };
		window.__watch = []; window.__rec = [];
		const last = new Map();
		const tick = () => {
			for (const id of window.__watch) {
				const s = B.sprites.get(id);
				if (!s) continue;
				const f = s.vkey.split('|'); // (visKey: skin, sticker, center, front, edition, seal, facing, ...)
				const r = { id, sv: window.__sv, center: f[2] || '', front: f[3] || '', edition: f[4] || '', seal: f[5] || '', facing: f[6] || 'front', flipping: !!(s.flipAnim || s.flipNext), flip: s.flipAnim ? Math.round(s.flipAnim.start * 1000) : 0, leaving: !!s.leaving };
				const sig = JSON.stringify(r);
				if (last.get(id) !== sig) { last.set(id, sig); window.__rec.push({ t: Math.round(performance.now()), ...r }); }
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});

	const engineCard = (id) => page.evaluate(async (id) => {
		const C = await import('/micatro/js/engine/core.js');
		const c = C.G.playing_cards.find((x) => x.sort_id === id);
		return c ? { center: c.config.center.key, front: c.config.card.key, edition: (c.edition && c.edition.type) || '', seal: c.seal || '', area: c.area === C.G.hand ? 'hand' : c.area === C.G.deck ? 'deck' : '?' } : null;
	}, id);
	/** Put consumable `key` (set `set`) in `area` ('consumeables' | 'pack_cards') -> its id. */
	const give = (set, key, area) => page.evaluate(async (set, key, area) => {
		const C = await import('/micatro/js/engine/core.js');
		const c = area === 'pack_cards' ? C.create_card(set, C.G.pack_cards, null, null, true, true, key, null) : C.create_card(set, C.G.consumeables, null, null, null, null, key);
		C.G[area].emplace(c); C.G.E_MANAGER.flush();
		return c.sort_id;
	}, set, key, area);
	/** n hand cards that `ok` accepts (plain, no seal/edition, by default). */
	const pick = async (n, ok = (c) => c.center === 'c_base' && !c.seal && !c.edition) => {
		const v = await V();
		return v.areas.hand.filter(ok).slice(0, n).map((c) => c.id);
	};

	/** Use consumable `cid` on `targets` and check each target's sprite shows `expect(before, after)`'s state
	 *  before the end-of-action redraw. flips: the card must be seen face down in between (the tarot flip). */
	const useAndCheck = async (label, cid, targets, { flips, inPack, file }) => {
		const before = {};
		for (const id of targets) before[id] = await engineCard(id);
		await page.evaluate((ids) => { window.__rec.length = 0; window.__watch = ids; window.__hold = true; }, targets);
		const sv0 = await page.evaluate(() => window.__sv);
		if (SHOTS) await shot(`${file}-0-before.png`);
		const r = await page.evaluate((cid, ids) => window.__micatro.act({ type: 'use', id: cid, targets: ids }), cid, targets);
		A(r && r.ok, `${label}: Use goes through`, JSON.stringify(r && r.error));
		if (!(r && r.ok)) { await page.evaluate(() => window.__release()); await idle(); return []; }
		// in a pack the hand returns to the deck at the end: catch the screenshot as the new faces turn up
		if (SHOTS && inPack) {
			// (each card's latest record is face up, still and changed — after it was seen face down, for a flip)
			await page.waitForFunction((ids, flips) => ids.every((id) => {
				const mine = window.__rec.filter((x) => x.id === id), last = mine[mine.length - 1];
				return last && last.facing === 'front' && !last.flipping && (flips ? mine.some((y) => y.facing === 'back') : true) && ['center', 'front', 'edition', 'seal'].some((k) => last[k] !== mine[0][k]);
			}) || !!window.__held, { timeout: 30000, polling: 'raf' }, targets, !!flips).catch(() => {});
			await shot(`${file}-1-revealed.png`);
		}
		await page.waitForFunction(() => !!window.__held, { timeout: 30000 });
		await sleep(700); // (any flip still turning settles)
		const rec = await page.evaluate(() => window.__rec.slice());
		// in the round the cards are still on the table: the face canvas really shows the composed face
		const canvas = inPack ? null : await page.evaluate((ids) => {
			const B = window.__micatro.board;
			return ids.map((id) => {
				const s = B.sprites.get(id);
				if (!s) return null;
				if (s.needsFx()) return 'fx'; // (an edition draws through the GL pass)
				const a = s.face.getContext('2d').getImageData(0, 0, s.face.width, s.face.height).data, b = s.base.getContext('2d').getImageData(0, 0, s.base.width, s.base.height).data;
				let diff = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diff++;
				return diff === 0 ? 'same' : 'diff:' + diff;
			});
		}, targets);
		if (SHOTS && !inPack) await shot(`${file}-1-after.png`);
		for (const [i, id] of targets.entries()) {
			const want = await engineCard(id), was = before[id];
			const changed = want && was && (want.center !== was.center || want.front !== was.front || want.edition !== was.edition || want.seal !== was.seal);
			A(changed, `${label}: card ${id} changed in the engine (${was && [was.center, was.front, was.seal, was.edition].join('/')} -> ${want && [want.center, want.front, want.seal, want.edition].join('/')})`);
			const mine = rec.filter((x) => x.id === id && x.sv === sv0);
			const shows = mine.find((x) => x.facing === 'front' && !x.flipping && x.center === want.center && x.front === want.front && x.edition === want.edition && x.seal === want.seal);
			A(!!shows, `${label}: card ${id} is drawn with its new face in the hand before the end-of-action redraw`, JSON.stringify(mine.slice(-4).map(({ t, sv, ...x }) => x)));
			if (flips) {
				const down = mine.findIndex((x) => x.facing === 'back');
				A(down >= 0 && shows && mine.indexOf(shows) > down, `${label}: card ${id} flips over and back (face down, then up showing the change)`, JSON.stringify(mine.map((x) => x.facing + ':' + x.center).join(' ')));
				// Balatro's order: the change happens while the card is face down and shows only as it turns back
				// up — not face up during the flip that turns it down (it did, from the end-of-action view)
				const isNew = (x) => x.center === want.center && x.front === want.front && x.edition === want.edition && x.seal === want.seal;
				const early = mine.find((x) => x.facing === 'front' && isNew(x));
				A(down >= 0 && early && mine.indexOf(early) > down && early.flip !== mine[down].flip, `${label}: card ${id}'s new face shows only on the flip back up (not while it turns face down)`, JSON.stringify(mine.map((x) => x.facing + ':' + x.center + '@' + x.flip).join(' ')));
			}
			if (canvas) A(canvas[i] === 'same' || canvas[i] === 'fx', `${label}: card ${id}'s face canvas is the composed new face`, canvas[i]);
		}
		await page.evaluate(() => window.__release());
		await idle();
		return rec;
	};

	// ---------------------------------------------------------------- in a round
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle();
	const vkeyProbe = await page.evaluate(() => { const B = window.__micatro.board; const s = [...B.sprites.values()].find((x) => x.d && x.d.front); return s ? [s.vkey, s.d.center, s.d.front] : []; });
	A(vkeyProbe[0] && vkeyProbe[0].split('|')[2] === vkeyProbe[1] && vkeyProbe[0].split('|')[3] === vkeyProbe[2], 'probe: a card sprite\'s visKey carries its center and front where the recorder reads them', JSON.stringify(vkeyProbe));
	const roundCase = async (label, set, key, n, flips, file, ok) => {
		// a fresh hand for each case: discard the cards earlier cases changed (discards topped up)
		const used = await pick(5, (c) => c.center !== 'c_base' || c.seal || c.edition);
		if (used.length) {
			await page.evaluate(async (ids) => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.current_round.discards_left = 99; await window.__micatro.act({ type: 'highlight', ids }); }, used);
			await idle();
			await page.evaluate(() => window.__micatro.act({ type: 'discard' }));
			await idle();
		}
		const cid = await give(set, key, 'consumeables');
		const targets = await pick(n, ok);
		A(targets.length === n, `${label}: ${n} hand card(s) to use it on`, JSON.stringify(targets));
		await useAndCheck(label, cid, targets, { flips, file });
	};
	await roundCase('The Empress (Mult)', 'Tarot', 'c_empress', 2, true, 'r1-empress');
	await roundCase('Justice (Glass)', 'Tarot', 'c_justice', 1, true, 'r2-justice');
	await roundCase('The Hierophant (Bonus)', 'Tarot', 'c_heirophant', 2, true, 'r3-hierophant');
	await roundCase('Talisman (Gold Seal)', 'Spectral', 'c_talisman', 1, false, 'r4-talisman');
	await roundCase('Aura (edition)', 'Spectral', 'c_aura', 1, false, 'r5-aura');
	await roundCase('The Star (Diamonds)', 'Tarot', 'c_star', 3, true, 'r6-star', (c) => c.center === 'c_base' && !c.seal && !c.edition && !/^D_/.test(c.front));
	await roundCase('Strength (rank up)', 'Tarot', 'c_strength', 2, true, 'r7-strength');
	await roundCase('Water Stone (Bonus)', 'Item', 'c_poke_waterstone', 1, false, 'r8-waterstone');
	let v = await V();
	A(v.state === 'SELECTING_HAND', 'still selecting a hand after the in-round uses', v.state);

	// ---------------------------------------------------------------- in packs (the hand goes back to the deck)
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; return window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();
	const packCase = async (label, pack, set, key, n, flips, file) => {
		const r = await page.evaluate(async (pack) => {
			const C = await import('/micatro/js/engine/core.js');
			C.G.GAME.dollars = 100;
			const p = C.create_card('Booster', C.G.shop_booster, null, null, null, null, pack); C.G.shop_booster.emplace(p); C.G.E_MANAGER.flush();
			return window.__micatro.act({ type: 'buy', id: p.sort_id });
		}, pack);
		await idle();
		const cid = await give(set, key, 'pack_cards');
		await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [] })); // (a no-op action: the view picks the card up)
		await idle();
		const targets = await pick(n);
		v = await V();
		A(r.ok && targets.length === n && v.areas.pack_cards.some((c) => c.id === cid), `${label}: the pack opens with ${key} in it and a hand dealt`, JSON.stringify({ ok: r.ok, s: v.state, n: targets.length }));
		await useAndCheck(label, cid, targets, { flips, inPack: true, file });
		v = await V();
		A(v.state === 'SHOP', `${label}: the pack closes back to the shop`, v.state);
		for (const id of targets) { const c = await engineCard(id); A(c && c.area === 'deck', `${label}: card ${id} went back to the deck (where the stale face used to hide)`, JSON.stringify(c)); }
	};
	await packCase('The Empress in an Arcana pack', 'p_arcana_normal_1', 'Tarot', 'c_empress', 2, true, 'p1-empress-arcana');
	await packCase('Talisman in a Spectral pack', 'p_spectral_normal_1', 'Spectral', 'c_talisman', 1, false, 'p2-talisman-spectral');
	await packCase('Water Stone in a Pocket pack', 'p_poke_pokepack_normal_1', 'Item', 'c_poke_waterstone', 1, false, 'p3-waterstone-pocket');
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
