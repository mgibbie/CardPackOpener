// micatro_winstickers_test.mjs — per-joker win stickers (micatro/js/ui/stickers.js initWinStickers / recordWin /
// winSticker, cardsprite.js composeFace, board.js showCardTip + onWinStickers, main.js afterAct, screens.js Options
// "Stake stickers"), in headless Chrome: winning a real run (the engine's `win` event: run.js joker_win_keys,
// Pokermon's previous-evolution keys) stores every joker key -> the highest stake won, per player; the jokers then
// wear the stake's sticker (stickers.png cell; pixels change), the tooltip explains it (Balatro's <colour>_sticker),
// the Pokédex (a collection view) shows it too; the Options toggle hides it on the table; a lower-stake win never
// downgrades it; a seeded run records nothing (Balatro's win_game).
//   node overworld/tests/micatro_winstickers_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9532;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'stickerer', friendCode: 'STK000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, top: [], messages: [] })); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
	await page.evaluateOnNewDocument((st) => {
		try {
			localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
			if (!sessionStorage.getItem('stk_init')) { sessionStorage.setItem('stk_init', '1'); localStorage.removeItem('micatro_joker_wins_v1:stickerer'); localStorage.removeItem('micatro_stake_stickers'); localStorage.removeItem('micatro_run_v1'); }
			localStorage.setItem('magepunk_mp_token_v1', 'stk'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
	const idle = () => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);

	/** Play a real run to its win: jump to the last ante, then beat Small, Big and the Boss (the engine's own win). */
	const winRun = async (opts) => {
		await page.evaluate((o) => window.__micatro.newRun(o), opts);
		await waitFor(() => page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 40000);
		await page.evaluate(async (keys) => {
			const { G, add_joker } = await import('/micatro/js/engine/core.js');
			for (const k of keys) add_joker(k);
			G.E_MANAGER.flush();
			G.GAME.round_resets.ante = G.GAME.win_ante;
		}, opts.jokers || []);
		const act = async (a) => { await idle(); const r = await page.evaluate((a) => window.__micatro.act(a), a); await idle(); return r; };
		for (let b = 0; b < 3; b++) {
			await act({ type: 'select_blind' });
			const ids = await page.evaluate(async () => { const { G } = await import('/micatro/js/engine/core.js'); G.GAME.chips = G.GAME.blind.chips; return [G.hand.cards[0].sort_id]; });
			await act({ type: 'highlight', ids });
			await act({ type: 'play' });
			if (b < 2) { await act({ type: 'cash_out' }); await act({ type: 'next_round' }); }
		}
		await idle();
		return page.evaluate(() => window.__micatro.events.filter((e) => e.type === 'win').slice(-1)[0] || null);
	};

	// 1. a Red Stake win with a Joker and Ivysaur (Pokermon: Bulbasaur earns it too)
	const ev = await winRun({ stake: 2, mods: ['pokermon'], jokers: ['j_joker', 'j_poke_ivysaur'] });
	A(ev && ev.stake === 2 && ev.jokers.includes('j_joker') && ev.jokers.includes('j_poke_ivysaur') && ev.jokers.includes('j_poke_bulbasaur'), 'the engine reports the win with the jokers (and the previous evolution)', JSON.stringify(ev));
	await waitFor(() => page.evaluate(() => !!document.querySelector('.go-modal')), 10000);
	const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_joker_wins_v1:stickerer') || '{}'));
	A(stored.j_joker === 2 && stored.j_poke_ivysaur === 2 && stored.j_poke_bulbasaur === 2, 'the win is stored per player: joker key -> highest stake (Red = 2)', JSON.stringify(stored));

	// 2. a new run: the Joker wears the Red sticker, the tooltip says so; Options can hide it
	await page.evaluate(() => { const b = document.querySelector('.go-modal .b-newrun'); if (b) b.click(); document.querySelectorAll('.modal .b-back').forEach((x) => x.click()); });
	await page.evaluate(() => window.__micatro.newRun({ stake: 1 }));
	await waitFor(() => page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 20000);
	await page.evaluate(async () => {
		const { G, add_joker } = await import('/micatro/js/engine/core.js');
		add_joker('j_joker'); add_joker('j_greedy_joker'); G.E_MANAGER.flush();
	});
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle();
	const px = (center) => page.evaluate((center) => {
		const b = window.__micatro.board;
		for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s && s.d.center === center) { const c = s.base.getContext('2d'); return [...c.getImageData(100, 4, 40, 40).data].reduce((a, x) => a + x, 0); } }
		return null;
	}, center);
	const withSticker = await px('j_joker');
	const sticker = await page.evaluate(async () => (await import('/micatro/js/ui/stickers.js')).winSticker('j_joker'));
	A(sticker === 'Red', 'the Joker has the Red Stake sticker', sticker);
	const tip = await page.evaluate(() => { const b = window.__micatro.board; for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s.d.center === 'j_joker') b.showCardTip(s, true); } return b.tip.textContent; });
	A(/Red Sticker/.test(tip) && /to win on/.test(tip), 'its tooltip explains the sticker', tip.slice(0, 160));
	A(!(await page.evaluate(async () => (await import('/micatro/js/ui/stickers.js')).winSticker('j_greedy_joker'))), 'a joker never won with has none');
	await page.evaluate(() => document.querySelector('.b-options').click());
	await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.opt-l')].some((x) => /Stake stickers/.test(x.textContent))), 5000);
	await page.evaluate(() => { const r = [...document.querySelectorAll('.opt-row')].find((x) => /Stake stickers/.test(x.textContent)); [...r.querySelectorAll('.btn')].find((b) => b.textContent === 'Off').click(); });
	await sleep(300);
	const without = await px('j_joker');
	A(withSticker != null && without != null && withSticker !== without, 'the sticker is drawn on the card (Options > Stake stickers Off removes it)', JSON.stringify([withSticker, without]));
	await page.evaluate(() => { const r = [...document.querySelectorAll('.opt-row')].find((x) => /Stake stickers/.test(x.textContent)); [...r.querySelectorAll('.btn')].find((b) => b.textContent === 'On').click(); document.querySelector('.opt-modal .b-back').click(); });
	await sleep(300);
	A(await px('j_joker') === withSticker, 'and On brings it back');

	// 3. the Pokédex (a collection view) shows Bulbasaur's sticker
	await page.evaluate(() => window.__micatro.newRun({ mods: ['pokermon'] }));
	await waitFor(() => page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 30000);
	await page.evaluate(async () => {
		const { G, add_joker } = await import('/micatro/js/engine/core.js');
		add_joker('j_poke_bulbasaur'); G.E_MANAGER.flush();
	});
	await idle();
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await idle();
	await page.evaluate(() => { const b = window.__micatro.board; const s = b.sprites.get(b.areas.jokers[0]); s.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
	await waitFor(() => page.evaluate(() => document.querySelectorAll('.dex-card').length === 4), 5000);
	const dex = await page.evaluate(async () => {
		const S = await import('/micatro/js/ui/stickers.js');
		return { b: S.winSticker('j_poke_bulbasaur', true), v: S.winSticker('j_poke_venusaur', true) };
	});
	A(dex.b === 'Red' && !dex.v, 'Bulbasaur (a previous evolution of the winner) has the sticker; Venusaur does not', JSON.stringify(dex));
	await page.evaluate(() => document.querySelector('.dex-modal .b-back').click());

	// 4. a lower stake never downgrades; a seeded run records nothing
	await winRun({ stake: 1, jokers: ['j_joker', 'j_greedy_joker'] });
	let st = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_joker_wins_v1:stickerer') || '{}'));
	A(st.j_joker === 2 && st.j_greedy_joker === 1, 'a White win keeps the Joker\'s Red and gives Greedy Joker White', JSON.stringify(st));
	await page.evaluate(() => document.querySelectorAll('.modal').forEach(() => { const b = document.querySelector('.go-modal .b-newrun'); if (b) b.click(); }));
	await winRun({ stake: 8, seed: 'SEEDED1', jokers: ['j_joker', 'j_lusty_joker'] });
	st = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_joker_wins_v1:stickerer') || '{}'));
	A(st.j_joker === 2 && !st.j_lusty_joker, 'a seeded run\'s win records no stickers', JSON.stringify(st));
	A(errors.length === 0, 'no console errors', errors.join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
