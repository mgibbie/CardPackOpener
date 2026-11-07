// micatro_pokermon_paradox_ui_test.mjs — the owner's Paradox content on screen (Pokermon Gen 9 batch 3, contentRev 78; the engine side is
// micatro/tests/mods/pokermon_gen9_paradox_test.mjs). Real taps, iPhone viewport:
//   - a Paradox joker's tooltip carries the "Paradox" pill (the rarity, purple) and its era pill ("Ancient" amber / "Future" steel blue),
//     in that order, before the type pill;
//   - the Paradox Ball's card draws its composed art (assets/2x/paradox_ball.png) and Use makes a Paradox joker;
//   - an Ancient and a Future Pack (each size) open on the pack screen: the header names the pack, its cards are that era's jokers,
//     the screen takes the pack's colours, and tapping Select puts one in the Joker row.
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main checkout two levels up
// (MICATRO_MAIN overrides).
//   node overworld/tests/micatro_pokermon_paradox_ui_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 9671;
const SHOTS = process.env.SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.fs': 'text/plain' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const served = new Set();

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { served.add(f); res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
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
	const errors = [];
	page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); });
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'PARADOXUI', back: 'b_red', mods: ['pokermon'] }); });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(300); };
	const V = () => page.evaluate(() => window.__micatro.view());
	const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
	const tap = async (sel) => { await page.tap(sel); await sleep(400); };
	const core = (fn, ...args) => page.evaluate(async (src, args) => { const C = await import('/micatro/js/engine/core.js'); return (0, eval)('(' + src + ')')(C, ...args); }, fn.toString(), args);
	const tipBadges = () => page.evaluate(() => { const t = document.querySelector('.tip'); return t && t.style.display !== 'none' ? [...t.querySelectorAll('.tip-badges .badge')].filter((x) => !x.classList.contains('mod-badge')).map((x) => ({ text: x.textContent.trim(), bg: x.style.background })) : []; });
	const clearTip = () => page.evaluate(() => { const b = window.__micatro.board; b.sel = null; b.jsel = null; b.hideTip(); b.refreshSelection(); });
	/** Re-sync the board after a direct engine change (a harmless action: the joker row re-ordered as it is). */
	const sync = async () => { await page.evaluate(() => { const v = window.__micatro.view(); return window.__micatro.act({ type: 'reorder', area: 'jokers', ids: v.areas.jokers.map((c) => c.id) }); }); await idle(); };
	const tapBtn = async (id, label) => {
		const found = await page.evaluate((id, label) => { const b = [...document.querySelectorAll(`.card[data-id="${id}"] .card-btns .btn`)].find((x) => x.textContent.trim() === label); if (b) b.setAttribute('data-t', label); return !!b; }, id, label);
		if (found) await tap(`.card[data-id="${id}"] .card-btns .btn[data-t="${label}"]`);
		return found;
	};

	// into the shop
	await page.evaluate(() => window.__micatro.selectBlind());
	await idle();
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; return window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();

	// ---- 1. the pills: two Paradox jokers in the row, a tap shows the tooltip
	const ids = await core((C) => {
		C.G.jokers.config.card_limit = 8;
		const out = [];
		for (const k of ['j_poke_roaring_moon', 'j_poke_iron_valiant']) { const c = C.add_joker(k); out.push(c.sort_id); }
		C.G.E_MANAGER.flush();
		return out;
	});
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); const ids = C.G.jokers.cards.map((c) => c.sort_id); return window.__micatro.act({ type: 'reorder', area: 'jokers', ids }); });
	await idle(); await sleep(1200); // (the mod atlas loads)
	const WANT = [['Roaring Moon', 'Ancient', 'rgb(154, 91, 30)', 'Dark'], ['Iron Valiant', 'Future', 'rgb(31, 122, 153)', 'Fairy']];
	for (let i = 0; i < 2; i++) {
		await tap(`.card[data-id="${ids[i]}"]`);
		const bd = await tipBadges();
		const [name, era, col, type] = WANT[i];
		A(bd.length >= 3 && bd[0].text === 'Paradox' && bd[0].bg === 'rgb(123, 63, 191)' && bd[1].text === era && bd[1].bg === col && bd[2].text === type,
			`${name}: the tooltip's pills are Paradox (purple), ${era}, ${type}`, JSON.stringify(bd));
		await shot(`1-${era.toLowerCase()}-pills.png`);
		await clearTip();
	}

	// ---- 2. the Paradox Ball: its art is drawn, Use makes a Paradox joker
	const ballId = await core((C) => { const c = C.create_card('Item', C.G.consumeables, null, null, null, null, 'c_poke_paradoxball'); C.G.consumeables.emplace(c); C.G.E_MANAGER.flush(); return c.sort_id; });
	await sync(); await sleep(800);
	A(served.has('/micatro/mods/pokermon/assets/2x/paradox_ball.png'), 'the Paradox Ball\'s composed art is loaded');
	await tap(`.card[data-id="${ballId}"]`);
	await shot('2-paradox-ball.png');
	const n0 = (await V()).areas.jokers.length;
	await tapBtn(ballId, 'Use');
	await idle();
	const made = await core((C) => { const j = C.G.jokers.cards[C.G.jokers.cards.length - 1]; return [C.G.jokers.cards.length, j.config.center.rarity]; });
	A(made[0] === n0 + 1 && made[1] === 'poke_paradox', 'Use: a Paradox joker joins the row', JSON.stringify(made));

	// ---- 3. the packs on the pack screen
	for (const [era, v, size] of [['ancient', 'normal', 2], ['future', 'jumbo', 4], ['ancient', 'mega', 4], ['future', 'normal_2', 2]]) {
		const pid = await core((C, key) => {
			C.G.GAME.dollars = 100;
			for (const c of C.G.jokers.cards.slice(4)) { c.remove_from_deck(); C.G.jokers.remove_card(c); c.remove(); }
			const p = C.create_card('Booster', C.G.shop_booster, null, null, null, null, key); C.G.shop_booster.emplace(p); C.G.E_MANAGER.flush();
			return p.sort_id;
		}, `p_poke_pokepack_${era}_${v}`);
		await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); return window.__micatro.act({ type: 'reorder', area: 'jokers', ids: C.G.jokers.cards.map((c) => c.sort_id) }); });
		await idle(); await sleep(500);
		await shot(`3-${era}-${v}-in-shop.png`);
		await page.evaluate((id) => window.__micatro.act({ type: 'buy', id }), pid);
		await idle(); await sleep(900);
		const vw = await V();
		const head = await page.evaluate(() => { const e = document.querySelector('.pack-name'); return e ? e.textContent.trim() : ''; });
		const Era = era[0].toUpperCase() + era.slice(1);
		const keys = await core((C) => C.G.pack_cards.cards.map((c) => [c.config.center.rarity, c.config.center.poke_paradox]));
		A(/^MOD_PACK/.test(vw.state) && head === Era + ' Pack' && keys.length === size && keys.every(([r, e]) => r === 'poke_paradox' && e === era),
			`${Era} ${v}: the pack screen ("${head}") shows ${size} ${era} Paradox jokers`, JSON.stringify({ s: vw.state, head, keys }));
		A(vw.pack_colours && vw.pack_colours.colour, `${Era} ${v}: the screen takes the pack's colours`, JSON.stringify(vw.pack_colours));
		await shot(`3-${era}-${v}-pack-screen.png`);
		const first = vw.areas.pack_cards[0].id;
		const before = vw.areas.jokers.length;
		await tap(`.card[data-id="${first}"]`);
		const took = (await tapBtn(first, 'Select')) || (await tapBtn(first, 'Use')) || (await tapBtn(first, 'Take'));
		await idle();
		const after = await V();
		A(took && after.areas.jokers.length === before + 1, `${Era} ${v}: Select puts it in the Joker row`, JSON.stringify({ took, j: after.areas.jokers.length, s: after.state }));
		if (/^MOD_PACK/.test(after.state)) { await page.evaluate(() => window.__micatro.act({ type: 'skip_booster' })); await idle(); }
	}
	A(served.has('/micatro/mods/pokermon/assets/2x/paradox_packs.png'), 'the packs\' composed art is loaded');
	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
