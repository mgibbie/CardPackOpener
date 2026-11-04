// micatro_custom_enhancement_test.mjs — a playing card with a MOD's enhancement (Pokermon's Flower /
// Hazard, MoreFluff's, Bunco's, Þe Autumn Circus's) sits in the hand fan like any card and its tooltip
// says what the enhancement is; and the "random Enhancement" picks never roll an enhancement whose
// in_pool says no (Pokermon's Flower / Hazard come only from Shaymin / Qwilfish & co).
// A tester (iPhone): "Not sure what this is? Queen in bottom right. Appears when I get random enhanced
// cards. No tool tip." — a Flower Queen made by Familiar. Two bugs:
//   * Familiar / Grim / Incantation (engine/consumables.js, engine/customdeck.js) and a few mods' random
//     enhance (Autumn Circus, AutumnMood, Bunco, MoreFluff) drew from P_CENTER_POOLS.Enhanced unfiltered, so
//     Flower and Hazard (`in_pool() { return false }`) were rolled. Now they draw from core.js
//     enhancement_pool(), which drops what in_pool refuses.
//   * A hand card's tooltip (ui/markup.js describePlaying) knew only the base enhancements: a mod
//     enhancement's card said "Queen of Spades +10 chips" and nothing more. The view now carries the
//     enhancement's name + text (engine/view.js cardView `enh`), and a replace_base_card enhancement
//     (Hazard, Gemstone, Jewel) is named for itself with no rank / suit drawn, like a Stone card.
// Part 1 runs the engine in node (no browser): many Familiar / Grim / Incantation / MoreFluff suit
// Rotarot uses + Autumn Circus's random enhancement. Part 2 boots the real page in portrait (390x664)
// and desktop and checks every mod enhancement on a hand card: in the fan, settled, tooltip naming it,
// no orphan card element; then a real Familiar use.
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main
// checkout two levels up (MICATRO_MAIN overrides).
//   node overworld/tests/micatro_custom_enhancement_test.mjs   [SHOTS=<dir> saves screenshots]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9617;
const SHOTS = process.env.SHOTS || '';
const MODS = ['pokermon', 'morefluff', 'bunco', 'autumnmood', 'autumncircus'];
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.fs': 'text/plain' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ part 1: random picks (engine, node)
{
	globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
	const E = (p) => import(pathToFileURL(path.join(ROOT, 'micatro', p)).href);
	const C = await E('js/engine/core.js');
	const R = await E('js/engine/run.js');
	const { loadMods } = await E('js/mods/index.js');
	await loadMods(MODS);
	R.newRun({ seed: 'NOFLOWER', back: 'b_red', mods: MODS });
	R.act({ type: 'select_blind' });
	const banned = new Set(Object.values(C.P_CENTERS).filter((c) => c.set === 'Enhanced' && c.in_pool && !c.in_pool(c, { type: 'Enhanced' })).map((c) => c.key));
	A(banned.has('m_poke_flower') && banned.has('m_poke_hazard'), 'engine: Pokermon\'s Flower and Hazard say in_pool false', [...banned].join(','));
	A((C.P_CENTER_POOLS.Enhanced || []).some((c) => banned.has(c.key)), 'engine: they are in P_CENTER_POOLS.Enhanced (so a raw pick from it could roll them)');
	const rolled = {};
	const note = (src, key) => { (rolled[src] = rolled[src] || {})[key] = (rolled[src][key] || 0) + 1; };
	const useMany = (key, set, n) => {
		for (let i = 0; i < n; i++) {
			if (!C.G.hand.cards.length) C.create_playing_card({ front: C.P_CARDS.S_2, center: C.P_CENTERS.c_base }, C.G.hand);
			const before = new Set(C.G.playing_cards);
			const card = C.create_card(set, C.G.consumeables, null, null, null, null, key);
			C.G.consumeables.emplace(card);
			card.use_consumeable(C.G.consumeables);
			C.G.E_MANAGER.flush();
			C.G.consumeables.remove_card(card);
			for (const pc of C.G.playing_cards) if (!before.has(pc)) note(key, pc.config.center.key);
			// (the new cards go to the deck, so the hand never overflows)
			for (const pc of C.G.hand.cards.slice()) { C.G.hand.remove_card(pc); C.G.deck.emplace(pc); }
		}
	};
	useMany('c_familiar', 'Spectral', 40);
	useMany('c_grim', 'Spectral', 30);
	useMany('c_incantation', 'Spectral', 20);
	useMany('c_mf_rot_star', 'Rotarot', 30);
	const AC = await E('mods/autumncircus/util.js');
	for (let i = 0; i < 400; i++) note('autumncircus pseudorandom_enhancement', AC.pseudorandom_enhancement().key);
	for (const [src, keys] of Object.entries(rolled)) {
		const total = Object.values(keys).reduce((a, b) => a + b, 0);
		const bad = Object.keys(keys).filter((k) => banned.has(k));
		A(total > 0 && !bad.length, `random pick (${src}): ${total} enhancements rolled, none that in_pool refuses`, bad.map((k) => k + ' x' + keys[k]).join(', '));
		A(Object.keys(keys).some((k) => /^m_(mf|bunc|thac)_/.test(k)),
			`random pick (${src}): other mods' enhancements still roll (only in_pool refusals are dropped)`, Object.keys(keys).join(','));
	}
}

// ------------------------------------------------------------------ part 2: the hand + tooltips (browser)
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
	for (const vp of [
		{ name: 'portrait', width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
		{ name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1 },
	]) {
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); });
		await page.setViewport(vp);
		await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '2'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
		await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
		await page.evaluate(async (mods) => { await window.__micatro.loadMods(mods); await window.__micatro.newRun({ seed: 'FLOWERQ', back: 'b_red', mods }); }, MODS);
		const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(900); };
		await idle();
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle();
		const keys = await page.evaluate(async () => {
			const C = await import('/micatro/js/engine/core.js');
			const { centerActive } = await import('/micatro/js/mods/registry.js');
			return Object.values(C.P_CENTERS).filter((c) => c.set === 'Enhanced' && c.mod && centerActive(c)).map((c) => c.key);
		});
		A(keys.includes('m_poke_flower') && keys.length >= 10, `${vp.name}: the run has the mods' enhancements (${keys.length})`, keys.join(','));

		/** Every hand card: in the fan (its own slot, settled, on screen), tooltip naming its enhancement. */
		const checkHand = (label) => page.evaluate(async (label) => {
			const C = await import('/micatro/js/engine/core.js');
			const { describe } = await import('/micatro/js/engine/describe.js');
			const { composeFace, FACE_W, FACE_H } = await import('/micatro/js/ui/cardsprite.js');
			const B = window.__micatro.board, v = window.__micatro.view();
			const out = [];
			const ids = B.areas.hand;
			out.push([ids.length === v.areas.hand.length && v.areas.hand.every((c) => ids.includes(c.id)), `${label}: the board's hand is the view's hand (${ids.length})`, JSON.stringify([ids, v.areas.hand.map((c) => c.id)])]);
			const sprites = ids.map((id) => B.sprites.get(id));
			const ys = sprites.filter(Boolean).map((s) => s.tgt.y), midY = ys.sort((a, b) => a - b)[Math.floor(ys.length / 2)];
			let lastX = -Infinity;
			const stage = B.stage.getBoundingClientRect();
			for (const id of ids) {
				const s = B.sprites.get(id), card = C.G.hand.cards.find((c) => c.sort_id === id);
				if (!s || !card) { out.push([false, `${label}: card ${id} has a sprite and an engine card`]); continue; }
				const key = card.config.center.key, tag = `${label}: ${key} (${card.base.value} of ${card.base.suit})`;
				const r = s.el.getBoundingClientRect();
				const settled = Math.abs(s.T.x - s.tgt.x) < 2 && Math.abs(s.T.y - s.tgt.y) < 2 && Math.abs(s.T.r - s.tgt.r) < 0.02;
				const inFan = s.area === 'hand' && !s.leaving && !s.dragging && Math.abs(s.tgt.y - midY) < B.ch * 0.5 && s.tgt.x > lastX &&
					s.tgt.x >= B.R.hand.x - 2 && s.tgt.x <= B.R.hand.x + B.R.hand.w + 2;
				lastX = s.tgt.x;
				const onScreen = r.width > 10 && r.left >= stage.left - 4 && r.right <= stage.right + 4 && r.top >= stage.top - 4 && r.bottom <= stage.bottom + 4;
				out.push([inFan && settled && onScreen, `${tag}: laid out in its own slot of the hand fan, settled, on screen`, JSON.stringify({ area: s.area, leaving: s.leaving, T: [s.T.x, s.T.y, s.T.r].map((x) => Math.round(x * 100) / 100), tgt: [s.tgt.x, s.tgt.y, s.tgt.r].map((x) => Math.round(x * 100) / 100), midY, hand: B.R.hand })]);
				if (!/^m_/.test(key) || !card.config.center.mod) continue;
				// the tooltip (a tap on a phone, hover on desktop) names the enhancement and gives its text
				const d = describe(card);
				B.showCardTip(s, true);
				const shown = B.tip.style.display !== 'none' && B.tipFor === id;
				const text = B.tip.innerText.replace(/\s+/g, ' ');
				const firstLine = (d.lines || []).map((l) => l.replace(/\{[^}]*\}/g, '')).find((l) => l.trim()) || '';
				out.push([shown && text.includes(d.name) && text.includes(firstLine.trim().split(' ')[0]), `${tag}: its tooltip shows "${d.name}" and its text`, text.slice(0, 160)]);
				if (card.config.center.replace_base_card) {
					out.push([!/ of (Spades|Hearts|Clubs|Diamonds)/.test(text) && !/\+\d+ chips/.test(text.split(d.name)[1] || text), `${tag}: replaces the rank and suit, so the tooltip names no rank / suit and no base chips (like a Stone card)`, text.slice(0, 160)]);
					// ... and the face shows no rank / suit: the same pixels as the card composed without its front
					const vd = v.areas.hand.find((c) => c.id === id) || {};
					const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = FACE_W; a.height = b.height = FACE_H;
					composeFace(a.getContext('2d'), vd, B.backKey); composeFace(b.getContext('2d'), { ...vd, front: undefined, front_atlas: undefined }, B.backKey);
					const pa = a.getContext('2d').getImageData(0, 0, FACE_W, FACE_H).data, pb = b.getContext('2d').getImageData(0, 0, FACE_W, FACE_H).data;
					let diff = 0; for (let i = 0; i < pa.length; i += 4) if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2]) diff++;
					out.push([diff === 0, `${tag}: its face draws no rank / suit over the enhancement`, 'pixels differing: ' + diff]);
				}
				B.hideTip();
			}
			// no stray card on the table: every card element is a live sprite of a card in a shown area
			const shownIds = new Set(B.vis().flatMap((k) => B.areas[k]));
			const els = [...B.layer.querySelectorAll('.card')];
			const stray = els.filter((el) => { const s = B.sprites.get(+el.dataset.id); return !s || s.el !== el || !shownIds.has(+el.dataset.id); }).map((el) => el.dataset.id);
			out.push([!stray.length, `${label}: no stray card on the table (${els.length} card elements, all in an area)`, stray.join(',')]);
			return out;
		}, label);
		const report = (rows) => { for (const [ok, msg, extra] of rows) A(ok, msg, extra); };

		// every mod enhancement on a hand card, 8 at a time
		for (let i = 0; i < keys.length; i += 8) {
			const batch = keys.slice(i, i + 8);
			await page.evaluate(async (batch) => {
				const C = await import('/micatro/js/engine/core.js');
				batch.forEach((k, j) => { const c = C.G.hand.cards[j]; if (c) c.set_ability(C.P_CENTERS[k], null, true); });
				return window.__micatro.act({ type: 'highlight', ids: [] }); // (a no-op action: the view picks the cards up)
			}, batch);
			await idle();
			report(await checkHand(`${vp.name} [${batch.join(' ')}]`));
			if (SHOTS && batch.includes('m_poke_flower')) {
				await page.evaluate(async () => {
					const C = await import('/micatro/js/engine/core.js');
					const B = window.__micatro.board, c = C.G.hand.cards.find((x) => x.config.center.key === 'm_poke_flower');
					if (c) B.showCardTip(B.sprites.get(c.sort_id), true);
				});
				await page.screenshot({ path: path.join(SHOTS, `${vp.name}-flower-tooltip.png`) });
				await page.evaluate(() => window.__micatro.board.hideTip());
			}
		}

		// the tester's path: a real Familiar use adds three enhanced face cards to the hand
		const fam = await page.evaluate(async () => {
			const C = await import('/micatro/js/engine/core.js');
			for (const c of C.G.hand.cards) c.set_ability(C.P_CENTERS.c_base, null, true);
			const c = C.create_card('Spectral', C.G.consumeables, null, null, null, null, 'c_familiar'); C.G.consumeables.emplace(c); C.G.E_MANAGER.flush();
			const before = C.G.hand.cards.map((x) => x.sort_id);
			await window.__micatro.act({ type: 'highlight', ids: [] });
			return { id: c.sort_id, before };
		});
		await idle();
		const r = await page.evaluate((id) => window.__micatro.act({ type: 'use', id, targets: [] }), fam.id);
		A(r && r.ok, `${vp.name}: Familiar is used`, JSON.stringify(r && r.error));
		await idle();
		const made = await page.evaluate(async (before) => {
			const C = await import('/micatro/js/engine/core.js');
			return C.G.hand.cards.filter((x) => !before.includes(x.sort_id)).map((x) => x.config.center.key);
		}, fam.before);
		A(made.length === 3 && made.every((k) => k !== 'c_base'), `${vp.name}: Familiar made 3 enhanced cards in hand`, made.join(','));
		report(await checkHand(`${vp.name} after Familiar`));
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${vp.name}-after-familiar.png`) });
		A(!errors.length, `${vp.name}: no page errors`, errors.join(' | '));
		await page.close();
	}
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
