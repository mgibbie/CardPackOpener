// micatro_mods_ui_test.mjs — the player-facing side of Micatro mods, in headless Chrome.
// A small test mod (micatro/tests/fixtures/testmod/: a joker with its own atlas + soul layer,
// an atlas-less joker, a "Gizmo" consumable type, a draw_hand "Gizmo Box" pack, a bool + a
// choice option) is injected into the manifest via window.__micatroExtraMods. Checks:
//   - New Run shows a Mods row; the Mods panel lists the mod (name/author/size/description),
//     toggling it on shows its options, options + selection persist in localStorage
//   - dependency auto-enable / auto-disable with a note (a second fake add-on requiring tmui)
//   - the controller reticle can reach the Mods panel toggles
//   - a run starts with the mod active (view.mods, recipe modOptions), the mod joker is drawn
//     from its atlas cell (pixel sample: magenta base + cyan floating soul), the atlas-less
//     joker gets a placeholder face, tooltips carry the small mod badge
//   - Options / Run Info show the active mods; Continue restores the mods after a reload
//   - a MOD_PACK_HAND pack opens as "Gizmo Pack" with the hand shown and the Gizmo badge in
//     the type's colour; taking a card works
//   - submitScore files a modded run under micatro_modded with its mods; the leaderboard
//     has Vanilla / Modded tabs with mod badges on modded rows
//   - a spectator loads the runner's mods from view.mods (art resolves), unknown ids are
//     skipped gracefully; no console errors anywhere
//   node overworld/tests/micatro_mods_ui_test.mjs
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
const PORT = 8746;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'modsui', friendCode: 'MODUI0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---- a real modded engine run, in node, for the spectator snapshot
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
await import(pathToFileURL(path.join(ROOT, 'micatro/tests/fixtures/testmod/index.js')).href);
const { Session } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/session.js')).href);
const sess = new Session();
sess.start({ seed: 'MODSPEC', back: 'b_red', stake: 1, mods: ['tmui'] });
sess.act({ type: 'select_blind' });
const specView = sess.view();
specView.mods = [...specView.mods, 'nosuchmod'];   // a mod this site doesn't ship: skipped gracefully
const SNAP = { view: specView, events: [] };

// ---- server: static files + /api/mp stub
const seen = { score: [], lb: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE };
		if (body.action === 'publish-micatro') out = { ok: true, watchers: 0, watcherNames: [] };
		else if (body.action === 'micatro-state') out = { snapshot: SNAP, seq: 1, label: 'Ante 1', room: 'u:bob', over: false, watchers: 1, watcherNames: ['modsui'] };
		else if (body.action === 'run-score') { seen.score.push(body); out = { ok: true, rank: 1 }; }
		else if (body.action === 'run-leaderboard') {
			seen.lb.push(body.mode);
			out = body.mode === 'micatro_modded'
				? { top: [{ name: 'bob', score: 999999, ante: 6, back: 'b_red', stake: 1, mods: ['tmui'] }], you: null }
				: { top: [{ name: 'amy', score: 4321, ante: 3, back: 'b_blue', stake: 1 }], you: null };
		}
		else if (body.action === 'chat-get') out = { messages: [] };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async ({ url, w = 1600, h = 900 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st) => {
			// the test mod + a fake add-on that requires it (never loaded: only toggled)
			window.__micatroExtraMods = [
				{ id: 'tmui', name: 'UI Test Mod', by: 'Tester', size: '1 KB', description: 'A tiny mod for the Mods UI test.', requires: [], load: () => import('/micatro/tests/fixtures/testmod/index.js') },
				{ id: 'tmaddon', name: 'Test Add-on', by: 'Tester', description: 'Needs the UI Test Mod.', requires: ['tmui'], load: () => import('/micatro/tests/fixtures/testmod/index.js').then(async () => { (await import('/micatro/js/mods/registry.js')).registerMod({ id: 'tmaddon', name: 'Test Add-on', requires: ['tmui'] }); }) },
			];
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				if (!sessionStorage.getItem('modsui_init')) { sessionStorage.setItem('modsui_init', '1'); localStorage.removeItem('micatro_run_v1'); localStorage.removeItem('micatro_mods'); }
				localStorage.setItem('magepunk_mp_token_v1', 'mods-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { }
		}, STATE);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		return { page, errors, ctx };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const V = (page) => page.evaluate(() => window.__micatro.view());
	const clickSel = async (page, sel) => { await page.waitForSelector(sel, { visible: true, timeout: 8000 }); await page.click(sel); };
	// Panel rows can sit below the fold (the site's real mods are listed first): scroll the
	// target into place instantly, then click, so the click can't land mid-scroll.
	const tap = async (page, sel) => {
		await page.waitForSelector(sel, { visible: true, timeout: 8000 });
		await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), sel);
		await page.click(sel);
	};
	// pixel at (fx, fy) (fractions) of a card's face / soul canvas
	const cardPixel = (page, center, which = 'face', fx = 0.5, fy = 0.5) => page.evaluate((center, which, fx, fy) => {
		const b = window.__micatro.board;
		for (const [id, s] of b.sprites) {
			if (s.leaving || !s.d || s.d.center !== center) continue;
			const c = which === 'soul' ? s.soul : which === 'base' ? s.base : s.face;
			if (!c) return null;
			return [...c.getContext('2d').getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data];
		}
		return null;
	}, center, which, fx, fy);
	const near = (px, rgb, tol = 30) => !!px && px[3] > 200 && rgb.every((v, i) => Math.abs(px[i] - v) <= tol);

	{
		const { page, errors } = await open({ url: '/micatro/' });
		// ----- New Run -> Mods panel
		await clickSel(page, '.b-menu-play');
		await page.waitForSelector('.new-run', { visible: true });
		A(await page.evaluate(() => !!document.querySelector('.nr-mods .b-mods') && /vanilla/i.test(document.querySelector('.nr-mods-sum').textContent)), 'New Run has a Mods row (none on = vanilla)');
		await clickSel(page, '.b-mods');
		await page.waitForSelector('.mods-panel', { visible: true });
		const rows = await page.evaluate(() => [...document.querySelectorAll('.mod-row')].map(r => ({ id: r.dataset.mod, text: r.textContent })));
		// rows are found by id: the site's real mods (e.g. Pokermon) are listed too
		const rUi = rows.find((r) => r.id === 'tmui'), rAdd = rows.find((r) => r.id === 'tmaddon');
		A(rUi && rAdd && /UI Test Mod/.test(rUi.text) && /Tester/.test(rUi.text) && /1 KB/.test(rUi.text) && /tiny mod/.test(rUi.text), 'the panel lists each mod with name, author, size and description', JSON.stringify(rows));
		A(rAdd && /Requires\s*UI Test Mod/.test(rAdd.text), 'an add-on lists what it requires', rAdd && rAdd.text);

		// controller: the reticle reaches the toggles (d-pad moves through the panel)
		const padReach = await page.evaluate(() => {
			const P = window.__micatroPad; if (!P) return 'no pad';
			P.ensure();
			const seen = new Set();
			for (let i = 0; i < 12; i++) { const f = P.focus; if (f && f.cls) seen.add(f.cls); P.move(i < 6 ? 'up' : 'down'); }
			return [...seen].join('|');
		});
		A(/mod-toggle/.test(padReach), 'the controller focus can land on a Mods panel toggle', padReach);

		// dependency: turning on the add-on turns on its requirement (with a note)
		await tap(page, '.mod-row[data-mod="tmaddon"] .mod-toggle');
		await waitFor(() => page.evaluate(() => document.querySelector('.mod-row[data-mod="tmui"]').classList.contains('on') && !!document.querySelector('.mod-row[data-mod="tmui"] .mod-opt')), 8000);
		let st = await page.evaluate(() => ({ on: [...document.querySelectorAll('.mod-row.on')].map(r => r.dataset.mod), note: document.querySelector('.mods-note').textContent }));
		A(st.on.join() === 'tmui,tmaddon' && /Also turned on UI Test Mod/.test(st.note), 'turning on an add-on turns on what it requires, with a note', JSON.stringify(st));
		// turning the requirement off turns the add-on off too
		await tap(page, '.mod-row[data-mod="tmui"] .mod-toggle');
		st = await page.evaluate(() => ({ on: [...document.querySelectorAll('.mod-row.on')].map(r => r.dataset.mod), note: document.querySelector('.mods-note').textContent }));
		A(st.on.length === 0 && /Also turned off Test Add-on/.test(st.note), 'turning off a requirement turns off its dependents, with a note', JSON.stringify(st));
		// on again (just tmui) -> its options render
		await tap(page, '.mod-row[data-mod="tmui"] .mod-toggle');
		await waitFor(() => page.evaluate(() => document.querySelectorAll('.mod-row[data-mod="tmui"] .mod-opt').length === 2), 8000);
		const opts = await page.evaluate(() => [...document.querySelectorAll('.mod-row[data-mod="tmui"] .mod-opt')].map(r => r.textContent));
		A(opts.length === 2 && /Start with Adder\s*On/.test(opts[0]) && /Flavor\s*mild\s*hot/.test(opts[1]), 'the mod\'s options render (bool as a toggle, choice as buttons)', JSON.stringify(opts));
		await tap(page, '.mod-row[data-mod="tmui"] .mod-opt-c[data-val="hot"]');
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_mods') || 'null'));
		A(saved && saved.ids.join() === 'tmui' && saved.options.tmui.flavor === 'hot', 'selection + options persist in localStorage', JSON.stringify(saved));
		A(await page.evaluate(() => document.querySelector('.mod-row[data-mod="tmui"] .mod-opt-c.on').dataset.val === 'hot'), 'the chosen option is shown as on');
		await page.click('.mods-modal .b-back');
		A(await page.evaluate(() => /UI Test Mod/.test(document.querySelector('.nr-mods-sum').textContent)), 'the New Run summary shows the active mod badge');

		// ----- start the modded run
		await clickSel(page, '.b-start');
		await waitFor(() => page.evaluate(() => window.__micatro.session && window.__micatro.view().state === 'BLIND_SELECT'), 15000);
		await idle(page);
		let v = await V(page);
		const rec = await page.evaluate(() => window.__micatro.session.recipe);
		A(v.mods.join() === 'tmui' && rec.mods.join() === 'tmui' && rec.modOptions.tmui.flavor === 'hot' && rec.modOptions.tmui.starter === true, 'the run starts with the mod active + its options in the recipe', JSON.stringify({ mods: v.mods, o: rec.modOptions }));
		A(v.areas.jokers.map(j => j.center).join() === 'j_tmui_adder,j_tmui_ghost', 'the mod hook gave the starter jokers', v.areas.jokers.map(j => j.center).join());
		A(await waitFor(async () => near(await cardPixel(page, 'j_tmui_adder', 'base'), [255, 0, 255]), 8000), 'the mod joker is drawn from its atlas cell (magenta)', JSON.stringify(await cardPixel(page, 'j_tmui_adder', 'base')));
		A(near(await cardPixel(page, 'j_tmui_adder', 'soul'), [0, 255, 255]) && (await cardPixel(page, 'j_tmui_adder', 'soul', 0.05, 0.05))[3] === 0, 'its soul layer floats over it (cyan square, transparent around)');
		const gp = await cardPixel(page, 'j_tmui_ghost', 'base', 0.5, 0.1);
		A(gp && gp[3] > 200 && !near(gp, [255, 0, 255]) && near(gp, [191, 199, 213], 20), 'an atlas-less mod joker gets a clean placeholder face', JSON.stringify(gp));
		const tip = await page.evaluate(() => {
			const b = window.__micatro.board; const id = b.areas.jokers[0]; b.showCardTip(b.sprites.get(id), true);
			const t = document.querySelector('.tip-main');
			const mb = t.querySelector('.tip-modbadges .mod-badge');
			return { name: t.querySelector('.tip-name').textContent, body: t.querySelector('.tip-body').textContent, mod: mb && mb.textContent, col: mb && getComputedStyle(mb).backgroundColor, rare: t.querySelector('.tip-badges .badge').textContent };
		});
		A(tip.name === 'Adder' && /X1000/.test(tip.body) && tip.rare === 'Common' && tip.mod === 'UI Test Mod' && tip.col === 'rgb(138, 43, 226)', 'the tooltip has the mod text + a small mod badge under the rarity', JSON.stringify(tip));
		await page.evaluate(() => window.__micatro.board.hideTip());

		// Options + Run Info show the active mods
		await page.keyboard.press('Escape');
		await page.waitForSelector('.opt-modal .active-mods', { visible: true, timeout: 5000 }).catch(() => { });
		const am = await page.evaluate(() => { const e = document.querySelector('.active-mods'); return e ? e.textContent : ''; });
		A(/UI Test Mod/.test(am) && /Flavor: hot/.test(am) && /Start with Adder: On/.test(am), 'Options lists the active mods with their options', am);
		await page.click('.opt-modal .b-back');
		await page.keyboard.press('i');
		A(await waitFor(() => page.evaluate(() => /UI Test Mod/.test((document.querySelector('.ri-mods') || {}).textContent || '')), 3000), 'Run Info shows the active mod badges');
		await page.click('.ri-modal .b-back');

		// select the blind, then reload and Continue: the mods come back
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		await clickSel(page, '.b-continue');
		await waitFor(() => page.evaluate(() => !!window.__micatro.session), 15000);
		await idle(page);
		v = await V(page);
		A(v.mods.join() === 'tmui' && v.state === 'SELECTING_HAND' && v.areas.jokers[0].center === 'j_tmui_adder', 'Continue reloads the mods and resumes the run', JSON.stringify({ mods: v.mods, state: v.state }));
		A(await waitFor(async () => near(await cardPixel(page, 'j_tmui_adder', 'base'), [255, 0, 255]), 8000), 'the resumed mod joker still has its art');

		// play a hand (X1000 clears the blind), cash out, open the Gizmo Box
		await page.evaluate(() => { const v = window.__micatro.view(); window.__micatro.act({ type: 'highlight', ids: [v.areas.hand[0].id] }); });
		await idle(page);
		await page.evaluate(() => window.__micatro.act({ type: 'play' }));
		await idle(page);
		await waitFor(() => page.evaluate(() => window.__micatro.view().state === 'ROUND_EVAL'), 15000);
		await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
		await idle(page);
		v = await V(page);
		const box = v.areas.shop_booster.find(c => c.center === 'p_tmui_box');
		A(v.state === 'SHOP' && !!box, 'the mod pack is in the shop', JSON.stringify(v.areas.shop_booster.map(c => c.center)));
		const r = await page.evaluate((id) => window.__micatro.act({ type: 'buy', id }), box.id);
		await idle(page); await sleep(400);
		v = await V(page);
		A(r.ok && v.state === 'MOD_PACK_HAND' && v.pack_kind === 'Gizmo', 'buying it opens a MOD_PACK_HAND pack of kind Gizmo', JSON.stringify({ ok: r.ok, s: v.state, k: v.pack_kind }));
		const packUi = await page.evaluate(() => {
			const b = window.__micatro.board;
			const vis = b.areas.hand.filter(id => { const s = b.sprites.get(id); if (!s) return false; const r = s.el.getBoundingClientRect(); return r.width > 10 && r.bottom > 0 && r.top < innerHeight; }).length;
			return { name: (document.querySelector('.pack-name') || {}).textContent, hand: vis, skip: !!document.querySelector('.b-skip-pack'), lbl: document.querySelector('.hand-lbl').textContent };
		});
		A(packUi.name === 'Gizmo Pack' && packUi.hand >= 5 && packUi.skip && /\/\d/.test(packUi.lbl), 'the pack is labelled "Gizmo Pack" and shows the hand for targeting', JSON.stringify(packUi));
		A(await waitFor(async () => near(await cardPixel(page, 'c_tmui_wrench', 'base'), [255, 255, 0]), 6000), 'the mod consumable is drawn from its atlas (yellow)');
		const gtip = await page.evaluate(() => {
			const b = window.__micatro.board; const id = b.areas.pack_cards[0]; b.showCardTip(b.sprites.get(id), true);
			const bs = [...document.querySelectorAll('.tip-main .tip-badges .badge')].map(x => [x.textContent, getComputedStyle(x).backgroundColor]);
			return { bs, mod: (document.querySelector('.tip-main .tip-modbadges .mod-badge') || {}).textContent };
		});
		A(gtip.bs.some(([t, c]) => t === 'Gizmo' && c === 'rgb(255, 140, 0)') && gtip.mod === 'UI Test Mod', 'the mod consumable type badge uses the type colour; the mod badge sits under it', JSON.stringify(gtip));
		await page.evaluate(() => window.__micatro.board.hideTip());
		// pick a card with the UI's own button
		await page.evaluate(() => { const b = window.__micatro.board; b.clickCard(b.sprites.get(b.areas.pack_cards[0]), 'mouse'); });
		A(await page.evaluate(() => /Use/.test((document.querySelector('.card-btns .btn') || {}).textContent || '')), 'a mod consumable in a pack offers Use');
		const d0 = (await V(page)).dollars;
		await page.click('.card-btns .btn');
		await idle(page);
		v = await V(page);
		A(v.state === 'SHOP' && v.dollars === d0 + 7, 'using it applies the mod effect and closes the pack', JSON.stringify({ s: v.state, d0, d: v.dollars }));

		// score submission files a modded run on the Modded board
		await page.evaluate(async () => { const n = await import('/micatro/js/net.js'); await n.submitScore({ score: 1234, ante: 1, seed: 'X', back: 'b_red', stake: 1, mods: ['tmui', 'aaa', 'tmui'] }); await n.submitScore({ score: 5, ante: 1 }); });
		A(seen.score.length === 2 && seen.score[0].mode === 'micatro_modded' && seen.score[0].mods.join() === 'aaa,tmui' && seen.score[1].mode === 'micatro' && !seen.score[1].mods, 'submitScore sends modded runs as micatro_modded with sorted mods; vanilla stays micatro', JSON.stringify(seen.score));

		// leaderboard tabs
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		await clickSel(page, '.b-leaders');
		await waitFor(() => page.evaluate(() => document.querySelectorAll('.lb-table .lb-row').length > 1), 6000);
		let lb = await page.evaluate(() => ({ on: document.querySelector('.lb-tabs .on').textContent, rows: [...document.querySelectorAll('.lb-row:not(.lb-h)')].map(r => r.textContent) }));
		A(lb.on === 'Vanilla' && lb.rows.length === 1 && /amy/.test(lb.rows[0]), 'the leaderboard opens on the Vanilla tab', JSON.stringify(lb));
		await page.click('.b-lb-modded');
		await waitFor(() => page.evaluate(() => /bob/.test(document.querySelector('.lb-body').textContent)), 6000);
		lb = await page.evaluate(() => ({ on: document.querySelector('.lb-tabs .on').textContent, badges: [...document.querySelectorAll('.lb-row .lb-mods .mod-badge')].map(b => b.textContent) }));
		A(lb.on === 'Modded' && lb.badges.join() === 'UI Test Mod' && seen.lb.includes('micatro_modded'), 'the Modded tab reads micatro_modded and shows mod badges on rows', JSON.stringify(lb));

		A(errors.length === 0, 'no console errors (player)', errors.join(' | '));
	}

	// ================================================================ spectator
	{
		const { page, errors } = await open({ url: '/micatro/?spectate=bob' });
		A(await waitFor(() => page.evaluate(() => (window.__micatro.board.view || {}).state === 'SELECTING_HAND'), 15000), 'the spectator renders the modded snapshot');
		A(await waitFor(async () => near(await cardPixel(page, 'j_tmui_adder', 'base'), [255, 0, 255]), 10000), 'the spectator loads the runner\'s mods from view.mods: the mod joker art resolves', JSON.stringify(await cardPixel(page, 'j_tmui_adder', 'base')));
		const sp = await page.evaluate(async () => {
			const M = await import('/micatro/js/mods/index.js');
			const b = window.__micatro.board; b.showCardTip(b.sprites.get(b.areas.jokers[0]), true);
			return { reg: Object.keys(M.MODS).join(), mod: (document.querySelector('.tip-modbadges .mod-badge') || {}).textContent, engine: !!window.__micatro.session };
		});
		A(sp.reg.includes('tmui') && !sp.reg.includes('nosuchmod') && sp.mod === 'UI Test Mod' && !sp.engine, 'mod metadata is registered (unknown ids skipped), tooltips show the mod badge, no engine session', JSON.stringify(sp));
		A(errors.length === 0, 'no console errors (spectator)', errors.join(' | '));
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
