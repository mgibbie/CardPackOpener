// micatro_keyboard_test.mjs — Micatro's desktop keyboard + mouse shortcuts. A tester (desktop): "I like to use
// the numbers to select my cards normally, and right click unselects chosen cards. Reset run is R. Nice for
// mono runs."
//   - 1–9 and 0 (the 10th card) pick hand cards, again lets go; also in a pack that deals the hand;
//   - a right-click anywhere on the board lets go of every chosen card (hand picks + the picked joker) and keeps
//     the browser menu away, but a right-click on a Pokermon joker still opens its Pokédex (and changes nothing);
//   - a touch long-press (Android fires contextmenu for it) does not;
//   - a quick tap of R still sorts by rank / rerolls the shop — on the key-up, so a hold never also does;
//   - holding R ~1 s restarts the run: a new random seed, the same deck + stake, unseeded, and the run left behind
//     is backed up (micatro_run_backup_v1); a seeded run restarts on its seed; letting go early does nothing.
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main checkout
// two levels up (MICATRO_MAIN overrides); a missing image is tolerated either way.
// Covers micatro/js/ui/main.js (onKey / onKeyUp / stateKey, startRHold, restartRun, abandonSaved) and
// micatro/js/ui/board.js (keyPick, clearSelection, the stage contextmenu handler, onDown's button check).
//   node overworld/tests/micatro_keyboard_test.mjs
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
const PORT = 8769;
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
	await page.setViewport({ width: 1280, height: 800 });
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(300); };
	const V = () => page.evaluate(() => window.__micatro.view());
	const hl = () => page.evaluate(() => window.__micatro.view().areas.hand.filter((c) => c.hl).map((c) => c.id));
	const handIds = () => page.evaluate(() => window.__micatro.view().areas.hand.map((c) => c.id));
	const recipe = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__micatro.session.recipe)));
	const lastAct = async () => { const r = await recipe(); return r.actions[r.actions.length - 1] || null; };
	const backup = () => page.evaluate(() => JSON.parse(localStorage.getItem('micatro_run_backup_v1') || 'null'));
	const key = async (k) => { await page.keyboard.press(k); await sleep(150); await idle(); };
	// every contextmenu: was the browser's menu kept away? (a window listener runs after the board's)
	await page.evaluate(() => { window.__ctx = []; addEventListener('contextmenu', (e) => window.__ctx.push(e.defaultPrevented)); });
	const ctxLog = () => page.evaluate(() => window.__ctx.splice(0));
	const centre = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
	const cardAt = (id) => page.evaluate((id) => { const s = window.__micatro.board.sprites.get(id); const r = s.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
	const rightClick = async (p) => { await page.mouse.click(p.x, p.y, { button: 'right' }); await sleep(250); await idle(); };

	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ back: 'b_blue', stake: 2, mods: ['pokermon'] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SELECTING_HAND', { timeout: 30000 });
	await idle();

	// ---- 1. number keys: 0 = the 10th card (hand grown to 10)
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.hand.change_size(2); window.__micatro.act({ type: 'highlight', ids: [] }); });
	await idle();
	let ids = await handIds();
	A(ids.length === 10, 'the hand is grown to 10 cards', ids.length);
	await key('0');
	A(JSON.stringify(await hl()) === JSON.stringify([ids[9]]), '0 picks the 10th hand card', JSON.stringify(await hl()));
	await key('0');
	A((await hl()).length === 0, '0 again lets it go (toggle)');
	await key('1'); await key('3');
	A(JSON.stringify((await hl()).sort()) === JSON.stringify([ids[0], ids[2]].sort()), '1 and 3 pick the 1st and 3rd cards', JSON.stringify(await hl()));

	// ---- 2. right-click lets go of every chosen card
	await rightClick({ x: 640, y: 120 }); // (empty table, top middle)
	A((await hl()).length === 0, 'a right-click on the empty table lets go of the hand picks');
	A(JSON.stringify(await ctxLog()) === '[true]', 'and keeps the browser menu away');
	await key('2'); await key('4');
	const c5 = await cardAt(ids[4]);
	await rightClick(c5);
	A((await hl()).length === 0, 'a right-click on a hand card lets go of the picks (and does not pick that card)', JSON.stringify(await hl()));
	await ctxLog();
	// a picked joker lets go too
	await page.evaluate(async () => { const { G, add_joker } = await import('/micatro/js/engine/core.js'); add_joker('j_joker'); add_joker('j_poke_bulbasaur'); G.E_MANAGER.flush(); window.__micatro.act({ type: 'highlight', ids: [] }); });
	await idle();
	const jokers = await page.evaluate(() => { const b = window.__micatro.board; return b.areas.jokers.map((id) => ({ id, center: b.sprites.get(id).d.center })); });
	const jj = jokers.find((j) => j.center === 'j_joker'), bulba = jokers.find((j) => j.center === 'j_poke_bulbasaur');
	A(!!jj && !!bulba, 'a Joker and a Bulbasaur are on the table', JSON.stringify(jokers));
	await page.mouse.click((await cardAt(jj.id)).x, (await cardAt(jj.id)).y); await sleep(250);
	await key('1');
	A(await page.evaluate(() => window.__micatro.board.sel) === jj.id && (await hl()).length === 1, 'the Joker is picked, and a hand card');
	await rightClick({ x: 640, y: 120 });
	A(await page.evaluate(() => window.__micatro.board.sel == null && window.__micatro.board.jsel == null), 'a right-click lets go of the picked joker');
	A((await hl()).length === 0, '... and of the hand pick');
	await ctxLog();

	// ---- 3. a right-click on a Pokermon joker still opens the Pokédex (and lets go of nothing)
	await key('1'); await key('2');
	const before = await hl();
	await rightClick(await cardAt(bulba.id));
	A(await page.waitForFunction(() => document.querySelectorAll('.dex-modal .dex-card').length > 0, { timeout: 5000 }).then(() => true, () => false), 'a right-click on Bulbasaur opens the Pokédex');
	A(JSON.stringify(await hl()) === JSON.stringify(before) && before.length === 2, 'the Pokédex right-click lets go of nothing', JSON.stringify([before, await hl()]));
	A(JSON.stringify(await ctxLog()) === '[true]', 'and no browser menu');
	await page.evaluate(() => { while (document.querySelector('.dex-modal')) { const b = document.querySelector('.dex-modal .b-back'); if (!b) break; b.click(); } });
	await sleep(300);
	A(!(await page.evaluate(() => !!document.querySelector('.modal-layer.open'))), 'the Pokédex closes');

	// ---- 4. a touch long-press does nothing (Android: contextmenu after the press)
	const t = await cardAt(ids[6]);
	const touch = await page.evaluate(async (t) => {
		const el = document.elementFromPoint(t.x, t.y);
		const o = { bubbles: true, cancelable: true, clientX: t.x, clientY: t.y, pointerType: 'touch', pointerId: 31, isPrimary: true, button: 0, buttons: 1 };
		el.dispatchEvent(new PointerEvent('pointerdown', o));
		await new Promise((r) => setTimeout(r, 550));
		const cm = new PointerEvent('contextmenu', { ...o, buttons: 0 });
		el.dispatchEvent(cm);
		el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
		return { prevented: cm.defaultPrevented, tip: getComputedStyle(document.querySelector('.tip')).display !== 'none' };
	}, t);
	await sleep(250); await idle();
	A(JSON.stringify(await hl()) === JSON.stringify(before), 'a touch long-press lets go of nothing (and picks nothing)', JSON.stringify([before, await hl()]));
	A(!touch.prevented, 'a touch long-press keeps the browser default', JSON.stringify(touch));
	await ctxLog();

	// ---- 5. a quick R still sorts by rank — on the key-up
	await key('s');
	A(JSON.stringify(await lastAct()) === JSON.stringify({ type: 'sort_hand', by: 'suit' }), 'S sorts by suit');
	await page.keyboard.down('r'); await sleep(60);
	A(JSON.stringify(await lastAct()) === JSON.stringify({ type: 'sort_hand', by: 'suit' }), 'R held down: nothing yet (the tap waits for the key-up)');
	await page.keyboard.up('r'); await sleep(150); await idle();
	A(JSON.stringify(await lastAct()) === JSON.stringify({ type: 'sort_hand', by: 'rank' }), 'a quick R sorts by rank', JSON.stringify(await lastAct()));
	A(!(await page.evaluate(() => !!document.querySelector('.restart-hold'))), 'no restart bar after a tap');

	// ---- 6. into the shop: a quick R rerolls
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.blind.chips = 1; window.__micatro.act({ type: 'highlight', ids: [window.__micatro.view().areas.hand[0].id] }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'play' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'ROUND_EVAL', { timeout: 30000 });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'cash_out' }));
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); C.G.GAME.dollars = 100; window.__micatro.act({ type: 'reorder', area: 'jokers', ids: window.__micatro.view().areas.jokers.map((c) => c.id) }); });
	await idle();
	await key('r');
	A((await lastAct()).type === 'reroll_shop', 'a quick R in the shop rerolls', JSON.stringify(await lastAct()));

	// ---- 6b. in a pack: the numbers pick the pack's own cards (a Buffoon pack: no hand), or the dealt hand's
	// cards (an Arcana pack)
	const openPack = async (pack) => {
		const r = await page.evaluate(async (pack) => {
			const C = await import('/micatro/js/engine/core.js');
			C.G.GAME.dollars = 100;
			const p = C.create_card('Booster', C.G.shop_booster, null, null, null, null, pack); C.G.shop_booster.emplace(p); C.G.E_MANAGER.flush();
			return window.__micatro.act({ type: 'buy', id: p.sort_id });
		}, pack);
		await page.waitForFunction(() => /_PACK/.test(window.__micatro.view().state), { timeout: 30000 }).catch(() => {});
		await idle();
		return r.ok;
	};
	A(await openPack('p_buffoon_normal_1'), 'a Buffoon pack opens');
	let ps = await V();
	const p0 = ps.areas.pack_cards.map((c) => c.id);
	A(ps.state === 'BUFFOON_PACK' && !ps.areas.hand.length, 'a Buffoon pack deals no hand', ps.state);
	await key('2');
	A(await page.evaluate(() => window.__micatro.board.sel) === p0[1], 'in a Buffoon pack 2 picks the 2nd pack card');
	await key('2');
	A(await page.evaluate(() => window.__micatro.board.sel) == null, '... and 2 again lets it go');
	await key('s');
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();
	A(await openPack('p_arcana_normal_1'), 'an Arcana pack opens');
	ps = await V();
	const h0 = ps.areas.hand.map((c) => c.id);
	A(ps.state === 'TAROT_PACK' && h0.length >= 5, 'an Arcana pack deals the hand', JSON.stringify([ps.state, h0.length]));
	await key('2');
	A(JSON.stringify(await hl()) === JSON.stringify([h0[1]]), 'in an Arcana pack 2 picks the 2nd hand card', JSON.stringify(await hl()));
	await key('2');
	A((await hl()).length === 0, '... and 2 again lets it go');
	await key('3'); await key('4');
	await rightClick({ x: 640, y: 120 });
	A((await hl()).length === 0, '... and a right-click lets go of the hand picks there too');
	await ctxLog();
	await key('s');
	await page.waitForFunction(() => window.__micatro.view().state === 'SHOP', { timeout: 30000 });
	await idle();

	// ---- 7. hold R ~1 s: a new run, same deck + stake, new seed, unseeded; the old one backed up
	const old = await recipe();
	const bk0 = await backup();
	await page.keyboard.down('r');
	await sleep(550);
	const bar = await page.evaluate(() => { const e = document.querySelector('.restart-hold'); return e ? { text: e.textContent, w: parseFloat(e.querySelector('.rh-fill').style.width) } : null; });
	A(bar && /Restarting/.test(bar.text) && bar.w > 10 && bar.w < 90, 'holding R shows the "Restarting…" bar filling', JSON.stringify(bar));
	await sleep(800);
	await page.keyboard.up('r');
	await sleep(300); await idle();
	const nw = await recipe(), v = await V(), bk = await backup();
	A(nw.seed !== old.seed, 'held R: a new run on a new seed', JSON.stringify([old.seed, nw.seed]));
	A(nw.back === 'b_blue' && nw.stake === 2 && v.back === 'b_blue' && v.stake === 2, '... the same deck and stake', JSON.stringify([nw.back, nw.stake]));
	A(JSON.stringify(nw.mods) === JSON.stringify(old.mods) && nw.mods.includes('pokermon'), '... the same mods', JSON.stringify(nw.mods));
	A(!nw.seeded && !(await page.evaluate(async () => (await import('/micatro/js/engine/core.js')).G.GAME.seeded)), '... unseeded (badges + stickers stay eligible)');
	A(nw.actions.length === 0 && v.state === 'BLIND_SELECT' && v.ante === 1, '... from the start (Ante 1, choosing a blind)', JSON.stringify([nw.actions.length, v.state, v.ante]));
	A(bk && bk.recipe && bk.recipe.seed === old.seed && bk.recipe.actions.length === old.actions.length && (!bk0 || bk.when > bk0.when), 'the run left behind is backed up (micatro_run_backup_v1), with all its moves', JSON.stringify(bk && { seed: bk.recipe.seed, n: bk.recipe.actions.length, want: old.actions.length, reason: bk.reason }));
	A(bk && bk.recipe.actions.filter((a) => a.type === 'reroll_shop').length === old.actions.filter((a) => a.type === 'reroll_shop').length, 'the hold never also rerolled');
	A(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('micatro_run_v1') || 'null'); return !!s && s.seed === window.__micatro.session.recipe.seed; }), 'the new run is the saved run now');
	A(!(await page.evaluate(() => !!document.querySelector('.restart-hold'))), 'the bar is gone');

	// ---- 8. letting go early does nothing
	await page.keyboard.down('r'); await sleep(600); await page.keyboard.up('r');
	await sleep(500); await idle();
	const after = await recipe(), bk2 = await backup();
	A(after.seed === nw.seed && after.actions.length === 0, 'R let go at 0.6 s: the same run, nothing done', JSON.stringify([after.seed, nw.seed, after.actions.length]));
	A(bk2 && bk2.when === bk.when, '... and no new backup');
	A(!(await page.evaluate(() => !!document.querySelector('.restart-hold'))), '... and the bar is gone');

	// ---- 9. a seeded run restarts on its seed (Balatro)
	await page.evaluate(async () => { await window.__micatro.newRun({ seed: 'KEYSEED1', back: 'b_red', stake: 1 }); });
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle();
	await page.keyboard.down('r'); await sleep(1300); await page.keyboard.up('r');
	await sleep(300); await idle();
	const sd = await recipe();
	A(sd.seed === 'KEYSEED1' && sd.seeded === true && sd.actions.length === 0, 'a seeded run restarts on its own seed (still seeded)', JSON.stringify([sd.seed, sd.seeded, sd.actions.length]));

	// ---- 10. Options lists the shortcuts
	await page.keyboard.press('Escape'); await sleep(300);
	const opt = await page.evaluate(() => { const e = document.querySelector('.opt-modal .opt-keys'); return e ? e.textContent : ''; });
	A(/Keyboard/.test(opt) && /Hold R/.test(opt) && /Right-click/.test(opt) && /1–9, 0/.test(opt), 'Options has a Keyboard section', opt.slice(0, 120));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
