// micatro_energy_target_test.mjs — Pokermon Energy (and the other "selected or leftmost joker" items)
// hit the right joker from Buy & Use, from the consumable slots and from inside a pack, with real taps
// (iPhone viewport). A tester with 3 jokers (one Grass) had a Grass Energy refused on Buy & Use AND
// from the slot with no joker picked; it worked only once they picked the Grass joker. Causes:
//   - engine (run.js): G.jokers.highlighted was only written when a Use carried joker_targets, so a pick
//     left over from an earlier Use (one that was refused, or a joker since un-picked) stayed highlighted
//     in the engine and aimed every later Energy at it -> set_joker_targets() on every Use / Buy & Use;
//   - board.js: Buy & Use never sent the picked joker (joker_targets), so it ignored the pick;
//   - board.js: tapping the picked joker again (with a consumable chosen) re-picked it instead of letting
//     it go, so a joker tapped just to read it could not be un-picked.
// Rule (Pokermon functions/energyfunctions.lua): nothing picked -> the leftmost joker the Energy can go
// on; a picked joker -> that joker, and a picked joker it can't go on REFUSES the Energy (no fallback).
// A refused Use / Buy & Use consumes nothing and charges nothing. The engine sweep at the end checks
// every Energy, Colorless (half effect off-type), Double Rainbow, Bird, Berry Juice Energy (owner house
// rule: leftmost VALID, like the Energies; the Lua takes the plain leftmost),
// Transformation, Tera Orb, Leftovers, Dragon Scale, the Rotom appliances and an evolution item, each
// from the slots, Buy & Use and a pack, each against its own Lua rule.
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main
// checkout two levels up (MICATRO_MAIN overrides); a missing image is tolerated either way.
//   node overworld/tests/micatro_energy_target_test.mjs   [SHOTS=<dir> saves screenshots]
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
const PORT = 8768;
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
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'ENERGYTGT', back: 'b_red', mods: ['pokermon'] }); });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(300); };
	const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
	const tap = async (sel) => { await page.tap(sel); await sleep(400); };
	const tapCard = (id) => tap(`.card[data-id="${id}"]`);
	const tapBtn = async (id, cls) => {
		const sel = `.card[data-id="${id}"] .card-btns .${cls}`;
		if (!(await page.$(sel))) { console.log(`  (no ${cls} button on card ${id}: the UI selection is not what the step expects)`); return; }
		await tap(sel); await idle();
	};
	// (each section starts from nothing chosen in the UI; the engine keeps whatever it kept)
	const unchoose = async () => { await page.evaluate(() => { const b = window.__micatro.board; b.sel = null; b.jsel = null; b.refreshSelection(); b.hideTip(); }); await sleep(200); };
	const redraw = async () => { await page.evaluate(() => window.__micatro.act({ type: 'sort_hand', by: 'rank' })); await idle(); }; // (a no-op action: the board picks engine changes up)
	await page.evaluate(() => { const b = window.__micatro.board; const o = b.toast.bind(b); window.__toasts = []; b.toast = (m) => { window.__toasts.push(m); return o(m); }; });

	// win the first blind and cash out into the shop
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle();
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; return window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 60000 }).catch(() => {});
	if ((await page.evaluate(() => window.__micatro.view().state)) !== 'SHOP') {
		await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
		await idle();
		await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
		await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	}
	await idle();

	// Fire (Charmander), Colorless (Rattata: nothing an Energy can scale), Grass (Bulbasaur) — Grass NOT leftmost
	const J = await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		for (const j of C.G.jokers.cards.slice()) { j.remove_from_deck(); C.G.jokers.remove_card(j); }
		for (const k of ['j_poke_charmander', 'j_poke_rattata', 'j_poke_bulbasaur']) C.add_joker(k);
		C.G.E_MANAGER.flush();
		C.G.GAME.dollars = 200;
		const [char, rat, bulb] = C.G.jokers.cards.map((c) => c.sort_id);
		return { char, rat, bulb };
	});
	const stockShop = () => page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const c = C.create_card('Energy', C.G.shop_jokers, null, null, true, true, 'c_poke_grass_energy', null); C.G.shop_jokers.emplace(c); C.G.E_MANAGER.flush();
		return c.sort_id;
	});
	const st = () => page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const e = (c) => (c.ability.extra.energy_count || 0) + (c.ability.extra.c_energy_count || 0);
		return { dollars: C.G.GAME.dollars, e: Object.fromEntries(C.G.jokers.cards.map((c) => [c.sort_id, e(c)])),
			shop: C.G.shop_jokers.cards.map((c) => c.sort_id), cons: C.G.consumeables.cards.map((c) => c.sort_id), toasts: window.__toasts.splice(0) };
	});
	const resetEnergy = () => page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); for (const j of C.G.jokers.cards) { j.ability.extra.energy_count = 0; j.ability.extra.c_energy_count = 0; } });
	const gained = (a, b, id) => (b.e[id] || 0) - (a.e[id] || 0);
	const lbl = (s) => JSON.stringify({ $: s.dollars, e: s.e, toasts: s.toasts });

	// ---- 0. the tester's lead-up: a Grass Energy in the slots, Charmander picked -> Use is refused (Lua rule)
	let card = await stockShop(); await redraw();
	await tapCard(card); await tapBtn(card, 'buy');
	let s0 = await st();
	A(s0.cons.includes(card), 'a Grass Energy bought into the consumable slots');
	await tapCard(J.char); await tapCard(card); await tapBtn(card, 'use');
	let s1 = await st();
	A(s1.cons.includes(card) && Object.values(s1.e).every((n) => n === 0) && s1.toasts.length === 1,
		'(c) Charmander picked: the Grass Energy is refused and stays in the slot (a picked joker it cannot go on blocks it, as in the Lua)', lbl(s1));
	// let Charmander go by tapping it again (it used to re-pick it)
	await tapCard(J.char);
	const jsel = await page.evaluate(() => ({ jsel: window.__micatro.board.jsel, sel: window.__micatro.board.sel }));
	A(jsel.jsel == null && jsel.sel === card, 'tapping the picked Charmander again un-picks it (the Energy stays chosen)', JSON.stringify(jsel));
	await tapCard(card); // (close the Energy too: nothing chosen at all)

	// ---- (a) Buy & Use with nothing picked -> the leftmost Grass joker (Bulbasaur), $4 charged
	const e2 = await stockShop(); await redraw();
	await tapCard(e2);
	await shot('a-1-buyuse-nothing-picked.png');
	let b = await st();
	await tapBtn(e2, 'buyuse');
	let a = await st();
	await shot('a-2-after.png');
	A(gained(b, a, J.bulb) === 1 && gained(b, a, J.char) === 0 && !a.shop.includes(e2) && b.dollars - a.dollars === 4 && !a.toasts.length,
		'(a) Buy & Use, nothing picked: Bulbasaur (leftmost Grass, not leftmost) is energized and $4 is charged', lbl(a));

	// ---- (b) Use from the slot with nothing picked -> Bulbasaur
	await tapCard(card);
	await shot('b-1-slot-use-nothing-picked.png');
	b = await st();
	await tapBtn(card, 'use');
	a = await st();
	await shot('b-2-after.png');
	A(gained(b, a, J.bulb) === 1 && !a.cons.includes(card) && !a.toasts.length, '(b) Use from the slot, nothing picked: Bulbasaur is energized and the Energy consumed', lbl(a));

	await unchoose();
	// ---- a joker tapped just to read it, then let go -> still the leftmost Grass
	await resetEnergy();
	let e3 = await stockShop(); await redraw();
	await tapCard(J.rat); await tapCard(J.rat);
	await tapCard(e3);
	b = await st(); await tapBtn(e3, 'buyuse'); a = await st();
	A(gained(b, a, J.bulb) === 1 && !a.toasts.length, 'Rattata tapped (tooltip) then tapped off: Buy & Use energizes Bulbasaur', lbl(a));
	e3 = await stockShop(); await redraw();
	await tapCard(J.char); await tapCard(e3); await tapCard(J.char); // (picked, Energy chosen, picked joker tapped off)
	b = await st(); await tapBtn(e3, 'buyuse'); a = await st();
	A(gained(b, a, J.bulb) === 1 && !a.toasts.length, 'Charmander picked, Energy chosen, Charmander tapped off: Buy & Use energizes Bulbasaur', lbl(a));

	await unchoose();
	// ---- (c) Buy & Use with Charmander picked -> refused, NOT charged, the card stays in the shop
	e3 = await stockShop(); await redraw();
	await tapCard(J.char); await tapCard(e3);
	b = await st(); await tapBtn(e3, 'buyuse'); a = await st();
	A(Object.keys(a.e).every((id) => gained(b, a, id) === 0) && a.shop.includes(e3) && a.dollars === b.dollars && a.toasts.length === 1,
		'(c) Buy & Use with Charmander picked: refused, nothing charged, the Energy stays in the shop', lbl(a));
	// it used to ignore the pick here and energize Bulbasaur anyway

	await unchoose();
	// ---- (d) Bulbasaur picked -> Bulbasaur, from Buy & Use and from the slot
	await tapCard(J.bulb); await tapCard(e3);
	b = await st(); await tapBtn(e3, 'buyuse'); a = await st();
	A(gained(b, a, J.bulb) === 1 && !a.toasts.length, '(d) Buy & Use with Bulbasaur picked: Bulbasaur is energized', lbl(a));
	await resetEnergy();
	card = await stockShop(); await redraw();
	await tapCard(card); await tapBtn(card, 'buy');
	await tapCard(J.bulb); await tapCard(card);
	b = await st(); await tapBtn(card, 'use'); a = await st();
	A(gained(b, a, J.bulb) === 1 && !a.cons.includes(card) && !a.toasts.length, '(d) slot Use with Bulbasaur picked: Bulbasaur is energized', lbl(a));

	await unchoose();
	// ---- two Grass jokers: nothing picked -> the leftmost one
	await resetEnergy();
	const odd = await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.add_joker('j_poke_oddish'); C.G.E_MANAGER.flush(); return C.G.jokers.cards[C.G.jokers.cards.length - 1].sort_id; });
	await redraw();
	e3 = await stockShop(); await redraw();
	await tapCard(e3); b = await st(); await tapBtn(e3, 'buyuse'); a = await st();
	A(gained(b, a, J.bulb) === 1 && gained(b, a, odd) === 0, 'Bulbasaur and Oddish (right of it): nothing picked -> the leftmost, Bulbasaur', lbl(a));
	await page.evaluate((ids) => window.__micatro.act({ type: 'reorder', area: 'jokers', ids }), [odd, J.char, J.rat, J.bulb]); await idle();
	e3 = await stockShop(); await redraw();
	await tapCard(e3); b = await st(); await tapBtn(e3, 'buyuse'); a = await st();
	A(gained(b, a, odd) === 1 && gained(b, a, J.bulb) === 0, 'Oddish moved leftmost: nothing picked -> Oddish', lbl(a));

	await unchoose();
	// ---- no valid target (both Grass jokers full) -> refused, nothing consumed or charged
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); for (const j of C.G.jokers.cards) if (j.ability.extra.ptype === 'Grass') j.ability.extra.energy_count = 3; });
	e3 = await stockShop(); await redraw();
	await tapCard(e3); b = await st(); await tapBtn(e3, 'buyuse'); a = await st();
	A(a.shop.includes(e3) && a.dollars === b.dollars && a.toasts.length === 1 && /can.t use/i.test(a.toasts[0] || ''), 'no joker can take it: Buy & Use is refused ("Can\'t use that right now") and charges nothing', lbl(a));
	await tapBtn(e3, 'buy'); // (still chosen after the refusal)
	await tapCard(e3); b = await st(); await tapBtn(e3, 'use'); a = await st();
	A(a.cons.includes(e3) && a.toasts.length === 1, 'no joker can take it: slot Use is refused and the Energy stays', lbl(a));
	await page.evaluate((id) => window.__micatro.act({ type: 'sell', id }), e3); await idle();

	await unchoose();
	// ---- inside a pack (Pocket pack opened in the shop): nothing picked -> leftmost valid; picked -> it
	await resetEnergy();
	const openWith = async (key) => {
		await page.evaluate(async () => {
			const C = await import('/micatro/js/engine/core.js');
			C.G.GAME.dollars = 200;
			const p = C.create_card('Booster', C.G.shop_booster, null, null, null, null, 'p_poke_pokepack_normal_1'); C.G.shop_booster.emplace(p); C.G.E_MANAGER.flush();
			return window.__micatro.act({ type: 'buy', id: p.sort_id });
		});
		await idle();
		const id = await page.evaluate(async (key) => {
			const C = await import('/micatro/js/engine/core.js');
			const c = C.create_card('Energy', C.G.pack_cards, null, null, true, true, key, null); C.G.pack_cards.emplace(c); C.G.E_MANAGER.flush();
			return c.sort_id;
		}, key);
		await redraw();
		return id;
	};
	const closePack = async () => { if ((await page.evaluate(() => window.__micatro.view().state)) !== 'SHOP') { await page.evaluate(() => window.__micatro.act({ type: 'skip_booster' })); await idle(); } };
	let pk = await openWith('c_poke_grass_energy');
	await tapCard(pk); b = await st(); await tapBtn(pk, 'buy'); a = await st();
	A(gained(b, a, odd) === 1 && !a.toasts.length, 'pack: Use with nothing picked -> the leftmost Grass joker (Oddish)', lbl(a));
	await closePack();
	pk = await openWith('c_poke_grass_energy');
	await tapCard(J.bulb); await tapCard(pk); b = await st(); await tapBtn(pk, 'buy'); a = await st();
	A(gained(b, a, J.bulb) === 1 && gained(b, a, odd) === 0 && !a.toasts.length, 'pack: Use with Bulbasaur picked -> Bulbasaur', lbl(a));
	await closePack();
	pk = await openWith('c_poke_grass_energy');
	await tapCard(J.char); await tapCard(pk); b = await st(); await tapBtn(pk, 'buy'); a = await st();
	A(Object.keys(a.e).every((id) => gained(b, a, id) === 0) && a.toasts.length === 1, 'pack: Use with Charmander picked -> refused (Lua rule)', lbl(a));
	await closePack();

	// ---------------------------------------------------------------- engine sweep
	// Each trial: a fresh joker row, the item in the slots / the shop (Buy & Use) / a pack, a picked joker
	// (or none) sent as joker_targets the way the board sends it, then which joker changed. Before each
	// trial a refused Use with a picked joker runs first (the stale-highlight trap), except where noted.
	const sweep = await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const G = C.G, S = window.__micatro.session;
		const out = [];
		const sig = (c) => {
			const a = c.ability, ex = a.extra && typeof a.extra === 'object' ? a.extra : {};
			const st = Object.keys(a).filter((k) => k.endsWith('_sticker') && a[k]).join(',');
			return [c.config.center.key, (ex.energy_count || 0) + (ex.c_energy_count || 0), a.extra_value || 0, st, ex.evolve ? 'evo:' + ex.evolve : ''].join('|');
		};
		const setJokers = (keys) => {
			for (const j of G.jokers.cards.slice()) { j.remove_from_deck(); G.jokers.remove_card(j); }
			for (const k of keys) C.add_joker(k);
			G.E_MANAGER.flush();
			return G.jokers.cards.slice();
		};
		const inShop = () => G.STATE === G.STATES.SHOP;
		const leavePack = () => { if (!inShop()) S.act({ type: 'skip_booster' }); };
		// -> {ok, err, changed: [row indices], consumed, charged}
		const trial = (item, set, keys, pick, via, opts = {}) => {
			leavePack();
			for (const c of G.consumeables.cards.slice()) { c.remove_from_deck(); G.consumeables.remove_card(c); }
			const row = setJokers(keys);
			if (opts.prep) opts.prep(row);
			G.GAME.dollars = 200;
			if (via === 'pack') {
				const p = C.create_card('Booster', G.shop_booster, null, null, null, null, 'p_poke_pokepack_normal_1'); G.shop_booster.emplace(p); G.E_MANAGER.flush();
				const r = S.act({ type: 'buy', id: p.sort_id });
				if (!r.ok) return { err: 'pack: ' + r.error };
			}
			const area = via === 'slot' ? G.consumeables : via === 'buy' ? G.shop_jokers : G.pack_cards;
			const c = C.create_card(set, area, null, null, true, true, item, null); area.emplace(c); G.E_MANAGER.flush();
			const before = row.map(sig), $0 = G.GAME.dollars;
			if (opts.stale !== false && opts.staleTarget != null) {
				// an earlier Use aimed at another joker (refused) — must not leak into this one
				const t = C.create_card(set, G.consumeables, null, null, true, true, item, null); G.consumeables.emplace(t); G.E_MANAGER.flush();
				S.act({ type: 'use', id: t.sort_id, joker_targets: [row[opts.staleTarget].sort_id] });
				t.remove_from_deck(); if (t.area) t.area.remove_card(t);
				for (let i = 0; i < row.length; i++) if (sig(row[i]) !== before[i]) return { err: 'stale setup changed joker ' + i };
			}
			const jt = pick != null ? [row[pick].sort_id] : undefined;
			const r = via === 'buy' ? S.act({ type: 'buy', id: c.sort_id, use: true, joker_targets: jt }) : S.act({ type: 'use', id: c.sort_id, joker_targets: jt });
			G.E_MANAGER.flush();
			const changed = row.map((j, i) => (sig(j) !== before[i] ? i : -1)).filter((i) => i >= 0);
			const res = { ok: !!r.ok, err: r.error, changed, charged: $0 - G.GAME.dollars };
			leavePack();
			return res;
		};
		const check = (name, res, want) => {
			// want: an index (that joker changed, only it) or 'refused'
			let good;
			if (res.err && res.ok === undefined) good = false;
			else if (want === 'refused') good = !res.ok && res.changed.length === 0 && res.charged === 0;
			else good = res.ok && res.changed.length === 1 && res.changed[0] === want;
			out.push({ name, good, got: res.ok === undefined ? res.err : (res.ok ? 'changed ' + JSON.stringify(res.changed) + ' $' + res.charged : 'refused: ' + res.err + ' $' + res.charged) });
		};
		const VIAS = ['slot', 'buy', 'pack'];

		// a typed Basic joker the Energy can scale, per type (first two in center order)
		const ENERGY_FIELDS = Object.keys((await import('/micatro/mods/pokermon/data.js')).default.globals.energy_values);
		const byType = {};
		for (const [k, ctr] of Object.entries(C.P_CENTERS)) {
			if (!k.startsWith('j_poke_') || !['Basic', 'One'].includes(ctr.stage) || !ctr.ptype || ctr.aux_poke) continue;
			const ex = (ctr.config && ctr.config.extra) || {};
			if (typeof ex !== 'object' || !ENERGY_FIELDS.some((f) => typeof ex[f] === 'number')) continue;
			if (ex.item_req || ctr.megas) continue;
			(byType[ctr.ptype] = byType[ctr.ptype] || []).push(k);
		}
		for (const t in byType) byType[t].sort((x, y) => (C.P_CENTERS[x].stage === 'Basic' ? 0 : 1) - (C.P_CENTERS[y].stage === 'Basic' ? 0 : 1)); // (Basics first; Dragon has one Basic)
		const ENERGY = { grass: 'Grass', fire: 'Fire', water: 'Water', lightning: 'Lightning', psychic: 'Psychic', fighting: 'Fighting', colorless: 'Colorless', darkness: 'Dark', metal: 'Metal', fairy: 'Fairy', dragon: 'Dragon', earth: 'Earth' };
		for (const [e, T] of Object.entries(ENERGY)) {
			const mine = byType[T] || [];
			const other = Object.keys(byType).find((t) => t !== T && t !== 'Colorless');
			if (mine.length < 2) { out.push({ name: e + ' energy: two ' + T + ' jokers exist', good: false, got: JSON.stringify(mine) }); continue; }
			const key = 'c_poke_' + e + '_energy';
			const vias = e === 'grass' || e === 'colorless' ? VIAS : ['slot', 'buy']; // (all 3 for two of them, keeps it quick)
			for (const via of vias) {
				if (e === 'colorless') {
					// Colorless goes on ANY Pokémon: [vanilla Joker, Fire, Grass]
					const keys = ['j_joker', byType.Fire[0], byType.Grass[0]];
					check(`${e} ${via}: nothing picked -> leftmost Pokemon`, trial(key, 'Energy', keys, null, via, { staleTarget: 0 }), 1);
					check(`${e} ${via}: Grass picked -> it`, trial(key, 'Energy', keys, 2, via, { staleTarget: 0 }), 2);
					check(`${e} ${via}: vanilla Joker picked -> refused`, trial(key, 'Energy', keys, 0, via), 'refused');
					continue;
				}
				const keys = [byType[other][0], mine[0], mine[1]];
				check(`${e} ${via}: nothing picked -> leftmost ${T}`, trial(key, 'Energy', keys, null, via, { staleTarget: 0 }), 1);
				check(`${e} ${via}: second ${T} picked -> it`, trial(key, 'Energy', keys, 2, via, { staleTarget: 0 }), 2);
				check(`${e} ${via}: ${other} picked -> refused`, trial(key, 'Energy', keys, 0, via), 'refused');
				check(`${e} ${via}: no ${T} joker -> refused`, trial(key, 'Energy', [byType[other][0]], null, via), 'refused');
			}
		}
		// Colorless counts half on a non-Colorless joker
		{
			const f = byType.Fire[0];
			const field = (c) => { const ex = c.ability.extra; const n = ENERGY_FIELDS.find((x) => typeof ex[x] === 'number' && typeof c.config.center.config.extra[x] === 'number' && c.config.center.config.extra[x] !== 0); return [n, ex[n]]; };
			let row = setJokers([f]); const [n, v0] = field(row[0]);
			trial('c_poke_fire_energy', 'Energy', [f], null, 'slot', { prep: (r) => { row = r; } }); const full = field(row[0])[1] - v0;
			trial('c_poke_colorless_energy', 'Energy', [f], null, 'slot', { prep: (r) => { row = r; } }); const half = field(row[0])[1] - v0;
			out.push({ name: `Colorless on a Fire joker adds half of a Fire Energy (${n}: +${half} vs +${full})`, good: full > 0 && Math.abs(half * 2 - full) < 1e-9, got: JSON.stringify({ n, full, half }) });
		}
		// Double Rainbow / Bird: any Pokémon; Rainbow = 2 energies, Bird fills to the max
		const G2 = byType.Grass, F2 = byType.Fire;
		for (const via of VIAS) {
			const keys = ['j_joker', F2[0], G2[0]];
			for (const it of ['c_poke_double_rainbow_energy', 'c_poke_bird_energy']) {
				const set = it.includes('rainbow') ? 'Spectral' : 'Energy';
				check(`${it} ${via}: nothing picked -> leftmost Pokemon`, trial(it, set, keys, null, via, { staleTarget: 0 }), 1);
				check(`${it} ${via}: Grass picked -> it`, trial(it, set, keys, 2, via, { staleTarget: 0 }), 2);
			}
			// Berry Juice Energy — OWNER HOUSE RULE (the Lua takes the plain leftmost joker): like every Energy,
			// the picked joker if it can take it (else refused), else the leftmost one that can, skipping
			// non-Pokémon and capped ones; none -> refused, nothing consumed or charged
			{
				const it = 'c_poke_berry_juice_energy', set = 'Item';
				const cap = (i) => ({ prep: (r) => { r[i].ability.extra.energy_count = 3; } });
				check(`${it} ${via}: nothing picked, [Joker, Fire, Grass] -> leftmost valid (Fire)`, trial(it, set, keys, null, via, { staleTarget: 0 }), 1);
				check(`${it} ${via}: nothing picked, Fire capped -> skips it to Grass`, trial(it, set, keys, null, via, cap(1)), 2);
				check(`${it} ${via}: Grass picked -> it`, trial(it, set, keys, 2, via, { staleTarget: 0 }), 2);
				check(`${it} ${via}: vanilla Joker picked -> refused`, trial(it, set, keys, 0, via), 'refused');
				check(`${it} ${via}: capped Fire picked -> refused`, trial(it, set, keys, 1, via, cap(1)), 'refused');
				check(`${it} ${via}: only a vanilla Joker and a capped Fire -> refused`, trial(it, set, ['j_joker', F2[0]], null, via, cap(1)), 'refused');
			}
			// Transformation — OWNER HOUSE RULE (the Lua takes the plain leftmost joker): the picked joker if it
			// can act on it (else refused), else the leftmost Pokémon that can still evolve, skipping non-Pokémon
			// and fully evolved ones; none -> refused, nothing consumed or charged
			{
				const it = 'c_poke_transformation', set = 'Spectral';
				const row = ['j_joker', 'j_poke_charizard', 'j_poke_bulbasaur', 'j_poke_charmander'];
				const tr = (keys, pick, opts) => trial(it, set, keys, pick, via, opts);
				check(`${it} ${via}: nothing picked, [Joker, Charizard, Bulbasaur, Charmander] -> leftmost valid (Bulbasaur)`, tr(row, null, { staleTarget: 1 }), 2);
				check(`${it} ${via}: nothing picked, a Basic leftmost -> it`, tr(['j_poke_charmander', 'j_joker', 'j_poke_bulbasaur'], null, { staleTarget: 1 }), 0);
				check(`${it} ${via}: Charmander picked -> it`, tr(row, 3, { staleTarget: 1 }), 3);
				check(`${it} ${via}: fully evolved Charizard picked -> refused`, tr(row, 1), 'refused');
				check(`${it} ${via}: vanilla Joker picked -> refused`, tr(row, 0), 'refused');
				check(`${it} ${via}: only a Joker and Charizard -> refused`, tr(['j_joker', 'j_poke_charizard'], null), 'refused');
			}
			{
				// the evolved card is really the highest stage (Charmander -> Charizard) and was energized
				const r = trial('c_poke_transformation', 'Spectral', ['j_joker', 'j_poke_charmander'], null, via);
				const j = G.jokers.cards[1];
				out.push({ name: `c_poke_transformation ${via}: Charmander becomes Charizard with 1 Energy`, good: r.ok && j && j.config.center.key === 'j_poke_charizard' && (j.ability.extra.energy_count || 0) === 1, got: JSON.stringify({ ok: r.ok, k: j && j.config.center.key, e: j && j.ability.extra.energy_count }) });
			}
			// Tera Orb / Leftovers / Dragon Scale: the picked joker, else the leftmost (any joker)
			for (const [it, set] of [['c_poke_teraorb', 'Item'], ['c_poke_leftovers', 'Item'], ['c_poke_dragonscale', 'Item']]) {
				if (via === 'buy' && it === 'c_poke_leftovers') { check(`${it} buy: Buy & Use is refused (a held item: the Lua's can_use says no in the shop)`, trial(it, set, keys, null, via), 'refused'); continue; }
				check(`${it} ${via}: nothing picked -> leftmost`, trial(it, set, keys, null, via), 0);
				check(`${it} ${via}: Grass picked -> it`, trial(it, set, keys, 2, via), 2);
			}
			// Rotom appliances: the picked Rotom, else the first Rotom not already in that form; a picked non-Rotom refuses
			for (const it of ['oven', 'washing_machine', 'fridge', 'fan', 'lawn_mower']) {
				const rk = ['j_poke_charmander', 'j_poke_rotom', 'j_poke_rotom'];
				check(`${it} ${via}: nothing picked -> first Rotom`, trial('c_poke_' + it, 'Item', rk, null, via, { staleTarget: 0 }), 1);
				check(`${it} ${via}: second Rotom picked -> it`, trial('c_poke_' + it, 'Item', rk, 2, via, { staleTarget: 0 }), 2);
				check(`${it} ${via}: Charmander picked -> refused`, trial('c_poke_' + it, 'Item', rk, 0, via), 'refused');
			}
			// an evolution item: acts on the picked joker that needs it (else it wants a hand selection)
			if (via !== 'pack') {
				const ek = ['j_poke_charmander', 'j_poke_vulpix', 'j_poke_vulpix'];
				check(`firestone ${via}: second Vulpix picked -> it`, trial('c_poke_firestone', 'Item', ek, 2, via, { staleTarget: 0 }), 2);
				check(`firestone ${via}: nothing picked, no hand -> refused`, trial('c_poke_firestone', 'Item', ek, null, via, { staleTarget: 0 }), 'refused');
			}
		}
		return out;
	});
	for (const r of sweep) A(r.good, 'sweep: ' + r.name, r.got);
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
