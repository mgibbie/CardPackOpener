// micatro_pokermon_spectrals_test.mjs — Pokermon's Spectral cards and its two seals, with real taps (iPhone
// viewport). The owner, on a Spectral pack holding Revenant / Wraith / Nightmare: "I'm pretty sure these don't
// work. No tool tip either." The Use effects worked; what was broken was everything the player SEES:
//   - Revenant's tooltip had no Silver Seal box: it queued {key = 'poke_silver'} (the seal's key) where the Lua
//     queues 'poke_silver_seal' (descriptions.Other) -> consumables/mart1.js;
//   - a Pokermon seal never drew on its card: the view carried seal_atlas / seal_pos, the card face only drew the
//     4 vanilla seals -> ui/cardsprite.js composeFace (+ modAtlasesOf, so it redraws once the atlas loads);
//   - a sealed hand card's tooltip said nothing about its seal (describePlaying only read the base game's loc)
//     -> ui/markup.js (+ the mod loc / seal colour through ui/assets.js MODREG, js/mods/index.js);
//   - describe() (a sealed card in a Standard pack / a mod-enhanced card) showed the seal's raw badge and no
//     seal tooltip -> engine/describe.js (SMODS: a mod seal's badge queues its Other.<key>_seal box).
// Pins: Revenant + Obituary from inside a Spectral pack on 1 tapped hand card (Use refused with 0 or 2 picked),
// the seal drawn on the card (its face differs from the unsealed face) and named in a long-press tooltip; both
// seals trigger in one played hand (Pink scored in the round's first hand -> an Energy; Silver held -> an Item,
// then the card is discarded); Nightmare on a tapped typed joker from inside the pack (2 Negative Fire Energies),
// refused with no joker picked; Transformation + Double Rainbow Energy from the pack; every Pokermon Spectral's
// info_queue tooltip resolves to real text.
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main
// checkout two levels up (MICATRO_MAIN overrides).
//   node overworld/tests/micatro_pokermon_spectrals_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 9611;
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
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'SPECTRALS', back: 'b_red', mods: ['pokermon'] }); });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(300); };
	const V = () => page.evaluate(() => window.__micatro.view());
	const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
	const tap = async (sel) => { await page.tap(sel); await sleep(400); };
	await page.evaluate(() => { const b = window.__micatro.board; const o = b.toast.bind(b); window.__toasts = []; b.toast = (m) => { window.__toasts.push(m); return o(m); }; });
	const toasts = () => page.evaluate(() => window.__toasts.splice(0));
	const core = (fn, ...args) => page.evaluate(async (src, args) => { const C = await import('/micatro/js/engine/core.js'); return (0, eval)('(' + src + ')')(C, ...args); }, fn.toString(), args);
	const tipText = () => page.evaluate(() => { const t = document.querySelector('.tip'); return t && t.style.display !== 'none' ? t.textContent.replace(/\s+/g, ' ') : ''; });
	const tipInfo = () => page.evaluate(() => { const t = document.querySelector('.tip'); return t && t.style.display !== 'none' ? [...t.querySelectorAll('.tip-info')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()) : []; });
	const tipBadges = () => page.evaluate(() => { const t = document.querySelector('.tip'); return t && t.style.display !== 'none' ? [...t.querySelectorAll('.tip-badges .badge')].map((x) => ({ text: x.textContent.trim(), bg: x.style.background })) : []; });
	const tapBtn = async (id, label) => {
		const found = await page.evaluate((id, label) => { const b = [...document.querySelectorAll(`.card[data-id="${id}"] .card-btns .btn`)].find((x) => x.textContent.trim() === label); if (b) b.setAttribute('data-t', label); return !!b; }, id, label);
		if (found) await tap(`.card[data-id="${id}"] .card-btns .btn[data-t="${label}"]`);
		return found;
	};
	/** Hold a finger on a card (the touch tooltip: board.js onDown's 420 ms timer): -> the tooltip's text + badges while held. */
	const longPress = async (id, shotName) => {
		const r = await page.evaluate((id) => { const e = document.querySelector(`.card[data-id="${id}"]`); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, id);
		await page.touchscreen.touchStart(r.x, r.y); await sleep(700);
		const out = { text: await tipText(), badges: await tipBadges() };
		if (shotName) await shot(shotName);
		await page.touchscreen.touchEnd(); await sleep(250);
		return out;
	};
	const flat = (s) => String(s).replace(/\s+/g, '');
	const sel = () => page.evaluate(() => window.__micatro.board.sel);
	const pick = async (id) => { if ((await sel()) !== id) await tap(`.card[data-id="${id}"]`); };
	const clearTip = () => page.evaluate(() => { const b = window.__micatro.board; b.sel = null; b.jsel = null; b.hideTip(); b.refreshSelection(); });

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

	/** Buy (open) a Spectral pack and put `card` in it: -> its id. */
	const openWith = async (card) => {
		await core((C) => {
			C.G.GAME.dollars = 100;
			const p = C.create_card('Booster', C.G.shop_booster, null, null, null, null, 'p_spectral_normal_1'); C.G.shop_booster.emplace(p); C.G.E_MANAGER.flush();
			return window.__micatro.act({ type: 'buy', id: p.sort_id });
		});
		await idle();
		const id = await core((C, card) => {
			const c = C.create_card('Spectral', C.G.pack_cards, null, null, true, true, card, null); C.G.pack_cards.emplace(c); C.G.E_MANAGER.flush();
			return c.sort_id;
		}, card);
		await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [] }));
		await idle();
		const v = await V();
		A(v.state === 'SPECTRAL_PACK' && v.areas.pack_cards.some((c) => c.id === id) && v.areas.hand.length >= 5, `a Spectral pack opens with ${card} in it and the hand dealt`, JSON.stringify({ s: v.state, hand: v.areas.hand.length }));
		return id;
	};
	const sealOf = (id) => core((C, id) => { const c = C.G.playing_cards.find((x) => x.sort_id === id); return c ? c.seal || null : 'gone'; }, id);
	const inPack = (id) => page.evaluate((id) => window.__micatro.view().areas.pack_cards.some((c) => c.id === id), id);

	// ---- 1. Revenant / Obituary: tooltip, refused with 0 or 2 picked, Use on 1 tapped hand card
	const SEALS = {
		c_poke_revenant: { seal: 'poke_silver', name: 'Silver Seal', text: 'Creates an Item card and is discarded if held in hand when cards are scored', colour: 'rgb(154, 164, 183)' },
		c_poke_obituary: { seal: 'poke_pink_seal', name: 'Pink Seal', text: "Creates an Energy card matching an owned Joker's type if it scores in first hand of round", colour: 'rgb(255, 122, 191)' },
	};
	const sealed = {};
	for (const [key, S] of Object.entries(SEALS)) {
		const id = await openWith(key);
		const v = await V();
		await tap(`.card[data-id="${id}"]`);
		const info = await tipInfo();
		A(info.some((t) => flat(t).startsWith(flat(S.name)) && flat(t).includes(flat(S.text))), `${key}: its tooltip explains the ${S.name} (info_queue box)`, JSON.stringify(info));
		await shot(`1-${key}-tooltip.png`);
		const h = v.areas.hand.map((c) => c.id);
		await toasts();
		await tapBtn(id, 'Use');
		await idle();
		A(await inPack(id) && (await toasts()).length > 0, `${key}: Use with no hand card picked is refused`);
		await tap(`.card[data-id="${h[0]}"]`); await tap(`.card[data-id="${h[1]}"]`);
		await pick(id);
		A((await page.evaluate(() => window.__micatro.board.handHighlighted())).length === 2, `${key}: two hand cards picked`);
		await tapBtn(id, 'Use');
		await idle();
		A(await inPack(id) && (await toasts()).length > 0, `${key}: Use with 2 hand cards picked is refused (max_highlighted 1)`);
		await tap(`.card[data-id="${h[1]}"]`);
		const target = h[0];
		await pick(id);
		await tapBtn(id, 'Use');
		await idle();
		const v2 = await V();
		A(!(await inPack(id)) && v2.state === 'SHOP' && (await sealOf(target)) === S.seal && !(await toasts()).length,
			`${key}: Use on 1 picked hand card from inside the pack gives it the ${S.name} (${S.seal})`, JSON.stringify({ s: v2.state, seal: await sealOf(target) }));
		sealed[key] = target;
	}

	// ---- 2. next round: the sealed cards in hand — the seal is drawn and named in the tooltip
	await page.evaluate(() => window.__micatro.act({ type: 'next_round' })); await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' })); await idle();
	await core((C, ids) => {
		for (const id of ids) { const c = C.G.playing_cards.find((x) => x.sort_id === id); if (c.area !== C.G.hand) { c.area.remove_card(c); C.G.hand.emplace(c); } }
		for (const c of C.G.consumeables.cards.slice()) { c.remove_from_deck(); C.G.consumeables.remove_card(c); c.remove(); }
		C.G.E_MANAGER.flush();
	}, Object.values(sealed));
	await page.evaluate(() => window.__micatro.act({ type: 'highlight', ids: [] }));
	await idle();
	await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, { timeout: 10000 });
	await sleep(1500); // (the mod atlas loads, the faces redraw)
	let v = await V();
	for (const [key, S] of Object.entries(SEALS)) {
		const id = sealed[key];
		const cv = v.areas.hand.find((c) => c.id === id);
		A(cv && cv.seal === S.seal, `${S.name}: the card is in hand with its seal in the view`, JSON.stringify(cv && cv.seal));
		const px = await page.evaluate(async (cv) => {
			const S = await import('/micatro/js/ui/cardsprite.js');
			const mk = (d) => { const c = document.createElement('canvas'); c.width = S.FACE_W; c.height = S.FACE_H; S.composeFace(c.getContext('2d'), d, 'b_red'); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
			const a = mk(cv), b = mk({ ...cv, seal: undefined, seal_atlas: undefined, seal_pos: undefined });
			let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
			return n;
		}, cv);
		A(px > 500, `${S.name}: the seal is drawn on the card face (${px} pixels differ from the unsealed face)`, px);
		const { text: t, badges: bd } = await longPress(id, `2-${key}-sealed-card-tooltip.png`);
		A(flat(t).includes(flat(S.name)) && flat(t).includes(flat(S.text)), `${S.name}: a long press on the card shows the seal's text in its tooltip`, t);
		A(bd.some((b) => b.text === S.name && b.bg === S.colour), `${S.name}: the tooltip carries the seal's badge in its colour`, JSON.stringify(bd));
		await clearTip();
	}

	// ---- 3. both seals trigger in one hand: play the Pink-sealed card alone (first hand, scored), Silver held
	const silver = sealed.c_poke_revenant, pink = sealed.c_poke_obituary;
	await core((C) => { C.G.GAME.blind.chips = 1e9; });
	const before = await core((C) => ({ hands: C.G.GAME.current_round.hands_played, n: C.G.consumeables.cards.length, disc: C.G.GAME.round_scores.cards_discarded.amt }));
	await tap(`.card[data-id="${pink}"]`);
	await shot('3-before-play-pink-played-silver-held.png');
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await sleep(900);
	await shot('3-seals-triggering.png');
	await idle();
	const after = await core((C, silver) => {
		const s = C.G.playing_cards.find((x) => x.sort_id === silver);
		return { cons: C.G.consumeables.cards.map((c) => ({ key: c.config.center.key, set: c.ability.set })), silverArea: s && s.area && s.area.name, inDiscard: !!(s && C.G.discard.cards.includes(s)), disc: C.G.GAME.round_scores.cards_discarded.amt };
	}, silver);
	A(before.hands === 0 && after.cons.some((c) => c.set === 'Energy'), 'Pink Seal: scored in the round\'s first hand -> an Energy card', JSON.stringify(after.cons));
	A(after.cons.some((c) => c.set === 'Item'), 'Silver Seal: held in hand when the hand is played -> an Item card', JSON.stringify(after.cons));
	A(after.inDiscard && after.disc === before.disc + 1, 'Silver Seal: ... and the card goes through the discard pipeline (in the discard pile, counted as discarded)', JSON.stringify(after));
	await shot('3-seals-triggered.png');

	// ---- 4. Nightmare: needs a picked typed joker (from inside the pack), destroys it, 2 Negative Energies of its type
	await core((C) => { C.G.GAME.chips = C.G.GAME.blind.chips = 1; });
	await page.evaluate(() => { window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }); return window.__micatro.act({ type: 'play' }); });
	await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();
	const charm = await core((C) => {
		for (const c of C.G.consumeables.cards.slice()) { c.remove_from_deck(); C.G.consumeables.remove_card(c); c.remove(); }
		const j = C.add_joker('j_poke_charmander'); C.G.E_MANAGER.flush(); return j.sort_id;
	});
	const nm = await openWith('c_poke_nightmare');
	await tap(`.card[data-id="${nm}"]`);
	const ninfo = await tipInfo();
	A(ninfo.some((t) => /^Negative/.test(t) && /\+1 consumable slot/i.test(t)), 'Nightmare: its tooltip explains Negative (+1 consumable slot)', JSON.stringify(ninfo));
	await toasts();
	await tapBtn(nm, 'Use');
	await idle();
	A(await inPack(nm) && (await toasts()).length > 0, 'Nightmare: refused with no joker picked');
	await tap(`.card[data-id="${charm}"]`);
	await tap(`.card[data-id="${nm}"]`);
	await shot('4-nightmare-joker-picked.png');
	await tapBtn(nm, 'Use');
	await idle();
	const nmr = await core((C, charm) => ({ joker: C.G.jokers.cards.some((j) => j.sort_id === charm), cons: C.G.consumeables.cards.map((c) => ({ key: c.config.center.key, neg: !!(c.edition && c.edition.negative) })) }), charm);
	A(!nmr.joker && nmr.cons.length === 2 && nmr.cons.every((c) => c.key === 'c_poke_fire_energy' && c.neg) && !(await toasts()).length,
		'Nightmare: on the picked Charmander from inside the pack -> it is destroyed, 2 Negative Fire Energies', JSON.stringify(nmr));
	await shot('4-nightmare-used.png');

	// ---- 5. Transformation and Double Rainbow Energy from inside the pack, on the picked Pokémon
	const bulba = await core((C) => { for (const c of C.G.consumeables.cards.slice()) { c.remove_from_deck(); C.G.consumeables.remove_card(c); c.remove(); } const j = C.add_joker('j_poke_bulbasaur'); C.G.E_MANAGER.flush(); return j.sort_id; });
	const tf = await openWith('c_poke_transformation');
	await tap(`.card[data-id="${bulba}"]`);
	await tap(`.card[data-id="${tf}"]`);
	A((await tipInfo()).some((t) => /^Energize/.test(t)), 'Transformation: its tooltip explains Energize');
	await tapBtn(tf, 'Use');
	await idle(); await sleep(800); await idle();
	const tfr = await core((C) => C.G.jokers.cards.map((j) => ({ key: j.config.center.key, e: (j.ability.extra && j.ability.extra.energy_count) || 0 })));
	A(tfr.some((j) => j.key === 'j_poke_venusaur' && j.e >= 1) && !(await toasts()).length, 'Transformation: Bulbasaur evolves to Venusaur and is Energized', JSON.stringify(tfr));
	const venu = (await V()).areas.jokers.find((c) => c.center === 'j_poke_venusaur');
	const dre = await openWith('c_poke_double_rainbow_energy');
	const e0 = await core((C) => { const j = C.G.jokers.cards.find((x) => x.config.center.key === 'j_poke_venusaur'); return j.ability.extra.energy_count || 0; });
	if (venu) await tap(`.card[data-id="${venu.id}"]`);
	await tap(`.card[data-id="${dre}"]`);
	await tapBtn(dre, 'Use');
	await idle();
	const e1 = await core((C) => { const j = C.G.jokers.cards.find((x) => x.config.center.key === 'j_poke_venusaur'); return { e: j.ability.extra.energy_count || 0, noi: !!C.G.GAME.modifiers.no_interest }; });
	A(e1.e === e0 + 2 && e1.noi && !(await toasts()).length, 'Double Rainbow Energy: Energizes the picked Pokémon twice, no interest this round', JSON.stringify({ e0, ...e1 }));

	// ---- 6. every Pokermon Spectral's info_queue resolves to a real tooltip (no key left unexplained)
	const unresolved = await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const D = await import('/micatro/js/engine/describe.js');
		const out = [];
		for (const ctr of Object.values(C.P_CENTERS)) {
			if (ctr.mod !== 'pokermon' || ctr.set !== 'Spectral' || !ctr.loc_vars) continue;
			const c = C.create_card('Spectral', C.G.consumeables, null, null, true, true, ctr.key, null);
			const iq = []; try { ctr.loc_vars(ctr, iq, c); } catch (e) { out.push(ctr.key + ': ' + e.message); }
			const d = D.describe(c);
			const keys = iq.filter(Boolean).map((q) => q.key);
			const shown = (d.info || []).filter((x) => x.lines && x.lines.length).map((x) => x.key);
			for (const k of keys) if (!shown.includes(k)) out.push(ctr.key + ' -> ' + k);
			c.remove();
		}
		return out;
	});
	A(!unresolved.length, 'every Pokermon Spectral\'s info_queue key shows a tooltip box', JSON.stringify(unresolved));
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
