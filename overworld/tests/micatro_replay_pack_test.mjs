// micatro_replay_pack_test.mjs — a Micatro REPLAY shows a booster pack on the pack screen, as live play does
// (the owner: "replays don't go to the separate pack open screen, they sort of do it over the shop").
// The board switched overlays only at the END of an action's animation, so a pack's cards were dealt in over the
// shop (or the blind choice); live play then sat on the pack screen while the player chose, but a replay moved on
// to the pick at once, so the pack screen only flashed. Now the table switches to the pack screen as the pack
// opens (ui/board.js enterPackView, on open_booster / the first card dealt into the pack) and the replay holds
// on it (ui/replayview.js STEP_PAUSE.pack).
//   1. every pack a vanilla run opens (Arcana, Celestial, Spectral, Standard, Buffoon from the shop; skip-tag
//      packs from the blind choice): stepping onto the open never shows a pack card with the shop / blind choice
//      overlay up; it ends on the pack screen (pack head names the pack, shop slid away, the hand for Arcana /
//      Spectral packs); a seek and a scrub land on the pack screen; a step back from the pick returns to it;
//      the pack closing returns to the shop (or the blind choice)
//   2. the same for a Pokermon run (its Energy mod packs, from the shop and from a tag)
//   3. autoplay holds on an open pack (as a player choosing would) before the pick
//   4. live play and a spectator (same board, same event stream) switch to the pack screen as it opens
//   5. a pack that shows the hand (Arcana, Spectral, Pokermon's Energy) keeps its bar (name / Choose N / Skip) clear of
//      the hand: desktop + phone portrait / landscape, replay, live (a 12-card hand, picked cards, Skip tapped), spectator
//      (the hand row covered the bar; ui/board.js renderPack places pack cards / bar / hand like vanilla)
// Covers micatro/js/ui/board.js (enterPackView, applyEvent open_booster / move), micatro/js/ui/replayview.js
// (STEP_PAUSE.pack), micatro/js/ui/player.js, micatro/tests/pack_bot.mjs.
//   node overworld/tests/micatro_replay_pack_test.mjs        (MICATRO_SHOTS=<dir> saves screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8753;
const SHOTS = process.env.MICATRO_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'packwatcher', friendCode: 'MICPK0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// ---- recipes made by the engine in node
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
const { packRun, PACK_STATES, RICH_DECK } = await import(pathToFileURL(path.join(ROOT, 'micatro/tests/pack_bot.mjs')).href);
const RPm = await import(pathToFileURL(path.join(ROOT, 'micatro/js/replays.js')).href);
const { Session } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/session.js')).href);
/** the view's state after each action (index 0 = the start) + the open's view/events for the spectator */
function walk(recipe) {
	const st = Session.stepper(recipe);
	const states = [st.view().state], steps = [null], views = [st.view()];
	while (!st.done) { const r = st.step(); if (!r || !r.ok) break; const v = st.view(); states.push(v.state); views.push(v); steps.push(r.events); }
	return { states, steps, views };
}
const VAN = packRun({ seed: 'PACKS2', back: 'b_red', stake: 1, customDeck: RICH_DECK });
const vanKinds = new Set(VAN.opened.map(o => o.kind));
if (!['Arcana', 'Celestial', 'Spectral', 'Standard', 'Buffoon'].every(k => vanKinds.has(k)) || !VAN.opened.some(o => o.via === 'skip_blind'))
	throw new Error('the vanilla pack fixture must open every vanilla pack kind and a skip-tag pack: ' + JSON.stringify(VAN.opened));
const vanWalk = walk(VAN.recipe);
const { loadMods } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/mods/index.js')).href);
await loadMods(['pokermon']);
// (seed PKP6 since Pokermon r78: the Ancient / Future Packs joined the shop's booster roll, so PKP5's shops changed)
const POK = packRun({ seed: 'PKP6', back: 'b_red', stake: 1, mods: ['pokermon'], modOptions: {}, customDeck: RICH_DECK }, { antes: 4 });
if (!POK.opened.some(o => /^MOD_PACK/.test(o.state) && o.via === 'buy') || !POK.opened.some(o => /^MOD_PACK/.test(o.state) && o.via === 'skip_blind'))
	throw new Error('the Pokermon pack fixture must open a mod pack from the shop and from a tag: ' + JSON.stringify(POK.opened));
const pokWalk = walk(POK.recipe);
const SERVER = {
	aaaa0001: { code: await RPm.packRecipe(VAN.recipe), meta: RPm.buildMeta(VAN.recipe, vanWalk.views[vanWalk.views.length - 1], { username: 'bob' }), by: 'bob', when: Date.now() },
	aaaa0002: { code: await RPm.packRecipe(POK.recipe), meta: RPm.buildMeta(POK.recipe, pokWalk.views[pokWalk.views.length - 1], { username: 'bob' }), by: 'bob', when: Date.now() },
};
// the spectator's feed (micatro-state): a snapshot the test swaps
let SPEC = null;

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE };
		const a = body.action;
		if (a === 'micatro-replay-get') {
			const r = SERVER[body.id];
			out = r ? { code: r.code, meta: r.meta, by: r.by, when: r.when } : { error: 'not found' };
		} else if (a === 'micatro-state') {
			out = !SPEC ? { snapshot: null, seq: 0 } : body.seq === SPEC.seq ? { unchanged: true, seq: SPEC.seq, label: 'Ante 1', watchers: 1, watcherNames: ['packwatcher'] }
				: { snapshot: SPEC.snapshot, seq: SPEC.seq, label: 'Ante 1', room: 'u:bob', over: false, won: false, watchers: 1, watcherNames: ['packwatcher'] };
		} else if (a === 'chat-get') out = { messages: [] };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

// in the page: what the table shows
const SAMPLER = () => {
	const M = window.__micatro, B = M.board;
	const ov = document.querySelector('.overlay');
	const cls = ov ? ov.className : '';
	const shopSprites = ['shop_jokers', 'shop_vouchers', 'shop_booster'].flatMap(k => B.areas[k] || []).map(id => B.sprites.get(id)).filter(Boolean);
	return {
		state: B.view && B.view.state, ov: cls, pack: (B.areas.pack_cards || []).length, hand: (B.areas.hand || []).length,
		shopPanel: !!document.querySelector('.overlay .shop-panel'), blindRow: !!document.querySelector('.overlay .blind-row'),
		packName: (document.querySelector('.overlay .pack-name') || {}).textContent || '',
		shopOnScreen: shopSprites.filter(s => s.tgt.y < B.SH).length,
		idle: M.idle(), index: M.replay && M.replay.ready ? M.replay.index : null, t: performance.now(),
	};
};
const startSampling = (page) => page.evaluate((src) => {
	const f = eval('(' + src + ')');
	window.__samples = []; window.__sampling = true;
	const tick = () => { if (!window.__sampling) return; try { window.__samples.push(f()); } catch (e) { } requestAnimationFrame(tick); };
	tick();
}, SAMPLER.toString());
const stopSampling = (page) => page.evaluate(() => { window.__sampling = false; return window.__samples; });
const look = (page) => page.evaluate((src) => eval('(' + src + ')')(), SAMPLER.toString());
const KIND_NAME = { Arcana: 'Arcana Pack', Celestial: 'Celestial Pack', Spectral: 'Spectral Pack', Standard: 'Standard Pack', Buffoon: 'Buffoon Pack' };
const HAND_PACK = (o) => o.state === 'MOD_PACK_HAND' || o.kind === 'Arcana' || o.kind === 'Spectral';
/** pack cards drawn over the shop / blind choice: the bug */
const overShop = (samples) => samples.filter(s => s.pack > 0 && (!/ov-pack/.test(s.ov) || s.shopPanel || s.blindRow));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const newPage = async (speed = 4) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st, speed) => {
			try {
				localStorage.setItem('micatro_speed', String(speed)); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.removeItem('micatro_run_v1');
				localStorage.setItem('magepunk_mp_token_v1', 'pk-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { }
		}, STATE, speed);
		const go = async (url) => {
			await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
			await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		};
		return { ctx, page, errors, go };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
	const replayReady = (page) => waitFor(() => page.evaluate(() => !!(window.__micatro.replay && window.__micatro.replay.ready)), 60000);
	const seek = async (page, i) => { await page.evaluate((i) => window.__micatro.replay.seekTo(i, { keepPlaying: false }), i); await idle(page); await sleep(150); };

	/** every pack a recipe opens, through the replay player's step / seek / scrub / step back */
	async function checkReplay(label, id, run, w) {
		const { page, errors, go } = await newPage(4);
		await go(`/micatro/?replay=${id}&autoplay=0`);
		A(await replayReady(page), `${label}: the replay loads`, JSON.stringify(await page.evaluate(() => window.__micatro.replay && window.__micatro.replay.error)));
		let shotMid = false;
		for (const o of run.opened) {
			const tag = `${label}: ${o.kind} pack (${o.via === 'buy' ? 'from the shop' : 'from a tag, at the blind choice'}, move ${o.index})`;
			// --- step forward onto the open, animated: the cards deal into the pack screen, never over the shop
			await seek(page, o.index - 1);
			const before = await look(page);
			A(before.state === o.from && (o.from === 'SHOP' ? before.shopPanel : before.blindRow), `${tag}: before the open the table is on ${o.from}`, JSON.stringify(before));
			await startSampling(page);
			await page.evaluate(() => window.__micatro.replay.stepForward());
			let midShot = null;
			if (!shotMid && SHOTS) { await waitFor(() => page.evaluate(() => (window.__micatro.board.areas.pack_cards || []).length > 0), 5000); midShot = `replay_${label}_${o.kind}_opening.png`; await shot(page, midShot); shotMid = true; }
			await idle(page); await sleep(120);
			const samples = await stopSampling(page);
			const bad = overShop(samples);
			A(samples.some(s => s.pack > 0) && bad.length === 0, `${tag}: no frame of the opening draws the pack's cards over the ${o.from === 'SHOP' ? 'shop' : 'blind choice'}`, bad.length ? `${bad.length}/${samples.length} frames, e.g. ${JSON.stringify(bad[0])}` : `${samples.length} frames`);
			const at = await look(page);
			const name = KIND_NAME[o.kind] || '';
			A(at.index === o.index && at.state === o.state && /ov-pack/.test(at.ov) && !at.shopPanel && !at.blindRow && at.pack > 0 && at.shopOnScreen === 0 && (!name || at.packName === name),
				`${tag}: it lands on the pack screen (pack head, the shop slid away)`, JSON.stringify(at));
			if (HAND_PACK(o)) A(at.hand > 0, `${tag}: the pack's hand is dealt`, JSON.stringify(at));
			if (o === run.opened[0]) await shot(page, `replay_${label}_${o.kind}_pack.png`);
			// --- a seek straight to it
			await seek(page, 0); await seek(page, o.index);
			const sk = await look(page);
			A(/ov-pack/.test(sk.ov) && sk.state === o.state && sk.pack > 0 && !sk.shopPanel && sk.shopOnScreen === 0, `${tag}: a seek lands on the pack screen`, JSON.stringify(sk));
			// --- the scrubber
			await seek(page, 0);
			await page.evaluate((i) => { const r = document.querySelector('.rb-range'); r.value = String(i); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }, o.index);
			await idle(page); await sleep(200);
			const sc = await look(page);
			A(sc.index === o.index && /ov-pack/.test(sc.ov) && sc.pack > 0 && !sc.shopPanel, `${tag}: scrubbing to it shows the pack screen`, JSON.stringify(sc));
			// --- the pack closes: back to where it opened (step forward until the state leaves the pack)
			let j = o.index; while (j < w.states.length - 1 && PACK_STATES.includes(w.states[j])) j++;
			await seek(page, j - 1);
			await page.evaluate(() => window.__micatro.replay.stepForward());
			await idle(page); await sleep(150);
			const after = await look(page);
			const back = w.states[j];
			A(after.state === back && !/ov-pack/.test(after.ov) && after.pack === 0 && (back !== 'SHOP' || (after.shopPanel && after.shopOnScreen > 0)) && (back !== 'BLIND_SELECT' || after.blindRow),
				`${tag}: when it closes the table is back on ${back}`, JSON.stringify(after));
			if (o === run.opened[0]) await shot(page, `replay_${label}_${o.kind}_closed.png`);
			// --- a step back from there returns to the open pack (or the pick before it)
			await page.evaluate(() => window.__micatro.replay.stepBack());
			await idle(page); await sleep(150);
			const sb = await look(page);
			A(PACK_STATES.includes(sb.state) && /ov-pack/.test(sb.ov) && !sb.shopPanel, `${tag}: a step back from the close returns to the pack screen`, JSON.stringify(sb));
		}
		A(errors.length === 0, `${label}: no page errors`, errors.slice(0, 3).join(' | '));
		return page;
	}

	// ======================================================= 1. vanilla: every pack kind + skip-tag packs
	{
		const page = await checkReplay('vanilla', 'aaaa0001', VAN, vanWalk);
		// ======================================================= 3. autoplay holds on the open pack
		const o = VAN.opened[0];
		await page.evaluate(() => window.__micatro.replay.setSpeed(2));
		await seek(page, o.index - 1);
		await startSampling(page);
		await page.evaluate(() => window.__micatro.replay.play());
		await waitFor(() => page.evaluate((i) => window.__micatro.replay.index > i, o.index), 20000);
		await sleep(200);
		await page.evaluate(() => window.__micatro.replay.pause());
		const s = await stopSampling(page);
		const settled = s.find(x => x.index === o.index && x.idle && PACK_STATES.includes(x.state));
		const left = s.find(x => x.index > o.index);
		const dwell = settled && left ? left.t - settled.t : -1;
		A(dwell >= 450, `autoplay (2×) holds on the open ${o.kind} pack before the pick (as a player choosing would)`, `${Math.round(dwell)} ms`);
		A(overShop(s).length === 0, 'autoplay: no frame draws the pack over the shop', JSON.stringify(overShop(s)[0] || null));
		await page.browserContext().close();
	}
	// ======================================================= 2. Pokermon's mod packs
	{
		const page = await checkReplay('pokermon', 'aaaa0002', POK, pokWalk);
		await page.browserContext().close();
	}
	// ======================================================= 4a. live play: the same open, played
	{
		const { page, errors, go } = await newPage(1);
		await go('/micatro/');
		const o = VAN.opened.find(x => x.kind === 'Arcana' && x.via === 'buy') || VAN.opened[0];
		await page.evaluate((deck) => window.__micatro.newRun({ seed: 'PACKS2', back: 'b_red', stake: 1, customDeck: deck }), RICH_DECK);
		await idle(page);
		let okRun = true;
		for (let i = 0; i < o.index - 1; i++) {
			const r = await page.evaluate((a) => window.__micatro.act(a), VAN.recipe.actions[i]);
			if (!r.ok) { okRun = false; console.log('live: rejected', i, r.error); break; }
			await idle(page);
		}
		A(okRun && (await look(page)).state === 'SHOP', 'live: the same run reaches the shop before the pack');
		await startSampling(page);
		await page.evaluate((a) => window.__micatro.act(a), VAN.recipe.actions[o.index - 1]);
		await waitFor(() => page.evaluate(() => (window.__micatro.board.areas.pack_cards || []).length > 0), 5000);
		await shot(page, `live_${o.kind}_opening.png`);
		await idle(page); await sleep(120);
		const s = await stopSampling(page);
		A(s.some(x => x.pack > 0) && overShop(s).length === 0, `live: the ${o.kind} pack opens on the pack screen (not over the shop)`, JSON.stringify(overShop(s)[0] || null));
		const at = await look(page);
		A(/ov-pack/.test(at.ov) && at.hand > 0 && at.packName === KIND_NAME[o.kind], 'live: the Arcana pack screen with its hand', JSON.stringify(at));
		await shot(page, `live_${o.kind}_pack.png`);
		A(errors.length === 0, 'live: no page errors', errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}
	// ======================================================= 4b. a spectator sees the open on the pack screen
	{
		const o = VAN.opened.find(x => x.via === 'skip_blind') || VAN.opened[0];
		const v0 = vanWalk.views[o.index - 1], v1 = vanWalk.views[o.index];
		SPEC = { seq: 1, snapshot: { view: v0, events: [] } };
		const { page, errors, go } = await newPage(1);
		await go('/micatro/?spectate=bob');
		A(await waitFor(() => page.evaluate((st) => window.__micatro.board.view && window.__micatro.board.view.state === st, o.from), 15000), `spectator: showing the runner's ${o.from}`);
		await idle(page);
		await startSampling(page);
		SPEC = { seq: 2, snapshot: { view: v1, events: vanWalk.steps[o.index] } };
		A(await waitFor(() => page.evaluate((st) => window.__micatro.board.view.state === st && window.__micatro.idle(), o.state), 15000), `spectator: the ${o.kind} pack arrives`);
		await sleep(150);
		const s = await stopSampling(page);
		A(s.some(x => x.pack > 0) && overShop(s).length === 0, `spectator: the ${o.kind} pack opens on the pack screen (not over the ${o.from === 'SHOP' ? 'shop' : 'blind choice'})`, JSON.stringify(overShop(s)[0] || null));
		const at = await look(page);
		A(/ov-pack/.test(at.ov) && at.pack > 0, 'spectator: the pack screen', JSON.stringify(at));
		await shot(page, `spectate_${o.kind}_pack.png`);
		A(errors.length === 0, 'spectator: no page errors', errors.slice(0, 3).join(' | '));
		await page.browserContext().close();
	}
	// ======================================================= 5. the pack's bar (name / Choose N / Skip) clears the hand
	// (the owner: on Arcana and Spectral packs the hand row covered the "… Pack / Choose N / Skip" bar). At desktop and
	// phone sizes, in a replay, in live play (a 12-card hand, picked cards raised; Skip tapped) and for a spectator:
	// the bar and Skip overlap no hand card (nor a pack card), sit on screen, and Skip is what a tap at its centre hits.
	{
		const VIEWPORTS = [
			{ name: 'desktop', width: 1600, height: 900, hasTouch: true },
			{ name: 'phone-portrait', width: 390, height: 844, hasTouch: true },
			{ name: 'phone-landscape', width: 844, height: 390, hasTouch: true },
			{ name: 'small-portrait', width: 375, height: 667, hasTouch: true },
		];
		const GEOM = () => {
			const B = window.__micatro.board;
			const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
			const cards = (k) => (B.areas[k] || []).map((id) => B.sprites.get(id)).filter(Boolean).map((s) => box(s.el));
			const head = document.querySelector('.overlay .pack-head'), skip = document.querySelector('.overlay .b-skip-pack');
			let skipHit = false;
			if (skip) { const r = box(skip); const el = document.elementFromPoint((r.l + r.r) / 2, (r.t + r.b) / 2); skipHit = !!el && (el === skip || skip.contains(el)); }
			return { state: B.view && B.view.state, head: head && box(head), skip: skip && box(skip), skipHit, hand: cards('hand'), pack: cards('pack_cards'), vw: innerWidth, vh: innerHeight };
		};
		// (a replay's transport panel, which tucks away while it plays, is set aside while measuring the table)
		const geom = (page) => page.evaluate((src) => { const rb = document.querySelector('.replay-bar'); if (rb) rb.style.visibility = 'hidden'; try { return eval('(' + src + ')')(); } finally { if (rb) rb.style.visibility = ''; } }, GEOM.toString());
		// (every page here starts with touch on: changing a viewport's touch / mobile flags makes puppeteer reload the page)
		const touchPage = async () => { const p = await newPage(4); await p.page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1, hasTouch: true }); return p; };
		const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
		const onScreen = (a, g) => a.l >= -1 && a.t >= -1 && a.r <= g.vw + 1 && a.b <= g.vh + 1;
		const settle = async (page) => { await idle(page); await sleep(700); };
		const resize = async (page, vp) => { const { name, ...o } = vp; await page.setViewport({ deviceScaleFactor: 1, ...o }); await sleep(250); await settle(page); };
		function checkBar(tag, g, { hand = 0 } = {}) {
			if (!g.head || !g.skip) { A(false, `${tag}: the pack bar is up`, JSON.stringify(g)); return; }
			if (hand) A(g.hand.length >= hand, `${tag}: the pack's hand is shown (${g.hand.length} cards)`, JSON.stringify(g.hand.length));
			const overH = g.hand.filter((c) => hit(c, g.head) || hit(c, g.skip));
			A(overH.length === 0, `${tag}: no hand card overlaps the pack bar or Skip`, overH.length ? `bar ${JSON.stringify(g.head)} card ${JSON.stringify(overH[0])}` : '');
			const overP = g.pack.filter((c) => hit(c, g.head));
			A(g.pack.length > 0 && overP.length === 0 && g.pack.every((c) => onScreen(c, g)), `${tag}: the pack's cards are on screen, clear of the bar`, JSON.stringify({ bar: g.head, pack: g.pack }));
			A(onScreen(g.head, g) && g.skipHit, `${tag}: the bar is on screen and a tap on Skip hits Skip`, JSON.stringify({ bar: g.head, skip: g.skip, hit: g.skipHit, vw: g.vw, vh: g.vh }));
		}
		// --- a replay: Arcana, Spectral and (no hand) Celestial, vanilla; Pokermon's Energy pack (it shows the hand)
		const cases = [
			['vanilla', 'aaaa0001', VAN.opened.find((x) => x.kind === 'Arcana' && x.via === 'buy')],
			['vanilla', 'aaaa0001', VAN.opened.find((x) => x.kind === 'Spectral')],
			['vanilla', 'aaaa0001', VAN.opened.find((x) => x.kind === 'Celestial' && x.via === 'buy')],
			['pokermon', 'aaaa0002', POK.opened.find((x) => x.state === 'MOD_PACK_HAND')],
		];
		for (const id of ['aaaa0001', 'aaaa0002']) {
			const { page, errors, go } = await touchPage();
			await go(`/micatro/?replay=${id}&autoplay=0`);
			A(await replayReady(page), `bar: replay ${id} loads`);
			for (const vp of VIEWPORTS) {
				await resize(page, vp);
				for (const [label, cid, o] of cases) {
					if (cid !== id) continue;
					if (!o) { A(false, `bar: the ${label} fixture opens the pack`); continue; }
					await seek(page, o.index); await settle(page);
					const g = await geom(page);
					checkBar(`bar, replay ${vp.name}: ${label} ${o.kind} pack`, g, { hand: HAND_PACK(o) ? 5 : 0 });
					await shot(page, `bar_replay_${vp.name}_${label}_${o.kind}.png`);
				}
			}
			A(errors.length === 0, `bar: replay ${id} no page errors`, errors.slice(0, 3).join(' | '));
			await page.browserContext().close();
		}
		// --- live play: an Arcana pack dealt into a 12-card hand (Pokermon's hand-size jokers reach that); picked cards raised;
		// then a real tap on Skip leaves the pack
		{
			const o = VAN.opened.find((x) => x.kind === 'Arcana' && x.via === 'buy');
			const { page, errors, go } = await touchPage();
			await go('/micatro/');
			await page.evaluate((deck) => window.__micatro.newRun({ seed: 'PACKS2', back: 'b_red', stake: 1, customDeck: deck }), RICH_DECK);
			await idle(page);
			let okRun = true;
			for (let i = 0; i < o.index - 1; i++) {
				const r = await page.evaluate((a) => window.__micatro.act(a), VAN.recipe.actions[i]);
				if (!r.ok) { okRun = false; console.log('bar live: rejected', i, r.error); break; }
				await idle(page);
			}
			A(okRun && (await look(page)).state === 'SHOP', 'bar live: the run reaches the shop before the Arcana pack');
			await page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.hand.config.card_limit = 12; G.hand.config.real_card_limit = 12; });
			await page.evaluate((a) => window.__micatro.act(a), VAN.recipe.actions[o.index - 1]);
			await settle(page);
			for (const vp of VIEWPORTS) {
				await resize(page, vp);
				checkBar(`bar, live ${vp.name}: Arcana pack, 12-card hand`, await geom(page), { hand: 12 });
				await shot(page, `bar_live_${vp.name}_Arcana_12.png`);
			}
			// picked hand cards rise toward the bar: still clear of it
			const ids = await page.evaluate(() => window.__micatro.board.areas.hand.slice(4, 7));
			const r = await page.evaluate((ids) => window.__micatro.act({ type: 'highlight', ids }), ids);
			A(r && r.ok, 'bar live: three hand cards picked', JSON.stringify(r));
			for (const vp of VIEWPORTS) {
				await resize(page, vp);
				checkBar(`bar, live ${vp.name}: Arcana pack, 3 cards picked`, await geom(page), { hand: 12 });
				await shot(page, `bar_live_${vp.name}_Arcana_picked.png`);
			}
			// a tap on Skip (small portrait phone) closes the pack
			const g = await geom(page);
			if (g.skip) await page.touchscreen.tap((g.skip.l + g.skip.r) / 2, (g.skip.t + g.skip.b) / 2);
			A(await waitFor(() => page.evaluate(() => window.__micatro.board.view.state === 'SHOP'), 10000), 'bar live: tapping Skip leaves the pack for the shop', JSON.stringify(await look(page)));
			A(errors.length === 0, 'bar live: no page errors', errors.slice(0, 3).join(' | '));
			await page.browserContext().close();
		}
		// --- a spectator: an Arcana pack from a skip tag, on a phone held sideways and upright
		{
			const o = VAN.opened.find((x) => x.kind === 'Arcana' && x.via === 'skip_blind') || VAN.opened.find((x) => x.kind === 'Arcana');
			SPEC = { seq: 11, snapshot: { view: vanWalk.views[o.index - 1], events: [] } };
			const { page, errors, go } = await touchPage();
			await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
			await go('/micatro/?spectate=bob');
			A(await waitFor(() => page.evaluate((st) => window.__micatro.board.view && window.__micatro.board.view.state === st, o.from), 15000), `bar spectator: showing the runner's ${o.from}`);
			await idle(page);
			SPEC = { seq: 12, snapshot: { view: vanWalk.views[o.index], events: vanWalk.steps[o.index] } };
			A(await waitFor(() => page.evaluate((st) => window.__micatro.board.view.state === st && window.__micatro.idle(), o.state), 15000), 'bar spectator: the Arcana pack arrives');
			for (const vp of [VIEWPORTS[2], VIEWPORTS[1]]) {
				await resize(page, vp);
				checkBar(`bar, spectator ${vp.name}: Arcana pack`, await geom(page), { hand: 5 });
				await shot(page, `bar_spectate_${vp.name}_Arcana.png`);
			}
			A(errors.length === 0, 'bar spectator: no page errors', errors.slice(0, 3).join(' | '));
			await page.browserContext().close();
		}
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
