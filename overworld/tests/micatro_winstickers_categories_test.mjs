// micatro_winstickers_categories_test.mjs — the per-category win stickers (micatro/js/ui/stickers.js), in
// headless Chrome against the real game page (a guest: browser-only, no account sync involved):
//   * the record is {jokerKey: {win, nuz, mono, both}} (win = any win; nuz = Nuzlocke; mono = Monotype;
//     both = the two in one run), each the highest stake level 1..8; recordWin({jokers, stake, categories})
//     (categories default ['win']) raises each listed category independently and never lowers one
//   * the old flat cache {jokerKey: level} reads as {win: level} (and is rewritten in the new form)
//   * winRecord(key) returns the full record
//   * ONE sticker shows: both (Arceus) > mono (Ambipom) > nuz (Aipom) > win (the plain stake sticker); any
//     special beats a plain one whatever the stakes (a White Aipom over a Gold plain sticker)
//   * a special is drawn on the card face as a ring in its stake's colour (Balatro's G.C.STAKES) with the
//     Pokémon sprite inside; the tooltip says e.g. "Nuzlocke win — Gold Stake"
//   node overworld/tests/micatro_winstickers_categories_test.mjs
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
const PORT = 9534;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, top: [], messages: [] })); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1280, height: 800 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	// (a missing file is reported by URL below: Chrome's own "Failed to load resource" line has none)
	page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const notFound = [];
	page.on('response', r => { if (r.status() >= 400 && !/\/nothing\.txt$|favicon/.test(r.url())) notFound.push(r.status() + ' ' + r.url()); });
	// a guest whose cache is still in the OLD flat form
	await page.goto(`http://localhost:${PORT}/micatro/nothing.txt`);
	await page.evaluate(() => {
		localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
		localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); localStorage.removeItem('micatro_run_v1');
		localStorage.setItem('micatro_joker_wins_v1:guest', JSON.stringify({ j_joker: 3, j_greedy_joker: 8, j_bad_level: 11, 'bad key': 2 }));
	});
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000), 'game ready (a guest with an old-format sticker cache)');
	const S = (fn, ...args) => page.evaluate(async (src, args) => { const M = await import('/micatro/js/ui/stickers.js'); return new Function('M', 'args', 'return (' + src + ')(M, ...args)')(M, args); }, fn.toString(), args);
	const local = () => page.evaluate(() => JSON.parse(localStorage.getItem('micatro_joker_wins_v1:guest') || '{}'));

	// ----- old-format migration -----
	A(JSON.stringify(await S((M) => M.winRecord('j_joker'))) === '{"win":3}' && JSON.stringify(await S((M) => M.winRecord('j_greedy_joker'))) === '{"win":8}', 'an old flat level reads as {win: level}');
	A(JSON.stringify(await S((M) => M.winRecord('j_bad_level'))) === '{}' && JSON.stringify(await S((M) => M.winRecord('j_never'))) === '{}', 'junk levels are dropped; a joker never won with has an empty record');
	A(await S((M) => M.winSticker('j_joker', true)) === 'Green', 'the migrated Joker still wears its Green (3) plain sticker');

	// ----- category merge (recordWin) -----
	A(await S((M) => M.recordWin({ jokers: ['j_joker'], stake: 1, categories: ['win', 'nuz'] })) === 1, 'a White Nuzlocke win improves the Joker (a new category)');
	A(JSON.stringify(await S((M) => M.winRecord('j_joker'))) === '{"win":3,"nuz":1}', '...win stays Green (3), nuz becomes White (1)', JSON.stringify(await S((M) => M.winRecord('j_joker'))));
	A(await S((M) => M.recordWin({ jokers: ['j_joker'], stake: 1, categories: ['nuz'] })) === 0, 'a repeat at the same stake changes nothing');
	await S((M) => M.recordWin({ jokers: ['j_joker', 'j_mime'], stake: 6, categories: ['mono', 'bogus'] }));
	A(JSON.stringify(await S((M) => M.winRecord('j_joker'))) === '{"win":3,"nuz":1,"mono":6}' && JSON.stringify(await S((M) => M.winRecord('j_mime'))) === '{"mono":6}', 'categories are independent (a Purple Monotype win only raises mono; unknown categories are ignored)', JSON.stringify(await S((M) => [M.winRecord('j_joker'), M.winRecord('j_mime')])));
	await S((M) => M.recordWin({ jokers: ['j_joker'], stake: 2, categories: ['win', 'nuz', 'mono'] }));
	A(JSON.stringify(await S((M) => M.winRecord('j_joker'))) === '{"win":3,"nuz":2,"mono":6}', 'a later win raises only the categories it beats (nuz 1 -> 2; win 3 and mono 6 kept)', JSON.stringify(await S((M) => M.winRecord('j_joker'))));
	await S((M) => M.recordWin({ jokers: ['j_scholar'], stake: 4 }));
	A(JSON.stringify(await S((M) => M.winRecord('j_scholar'))) === '{"win":4}', 'no categories -> the plain win category');
	const cached = await local();
	A(JSON.stringify(cached.j_joker) === '{"win":3,"nuz":2,"mono":6}' && JSON.stringify(cached.j_greedy_joker) === '{"win":8}' && !('j_bad_level' in cached), 'the cache is rewritten in the new form', JSON.stringify(cached));

	// ----- priority -----
	const pick = (rec) => S((M, rec) => { const i = M.stickerFor(rec); return i && [i.category, i.stake, i.special && i.special.pokemon, i.label, i.colour]; }, rec);
	A(JSON.stringify(await pick({ win: 8 })) === JSON.stringify(['win', 'Gold', null, 'Win — Gold Stake', '#eac058']), 'win only: the plain stake sticker', JSON.stringify(await pick({ win: 8 })));
	A((await pick({ win: 8, nuz: 1 })).join('|') === 'nuz|White|Aipom|Nuzlocke win — White Stake|#ffffff', 'nuz beats win — even a White Aipom over a Gold plain sticker', JSON.stringify(await pick({ win: 8, nuz: 1 })));
	A((await pick({ win: 8, nuz: 8, mono: 2 })).join('|') === 'mono|Red|Ambipom|Monotype win — Red Stake|#fe5f55', 'mono beats nuz and win (Ambipom)', JSON.stringify(await pick({ win: 8, nuz: 8, mono: 2 })));
	A((await pick({ win: 8, nuz: 8, mono: 8, both: 5 })).join('|') === 'both|Blue|Arceus|Nuzlocke Monotype win — Blue Stake|#009dff', 'both beats everything (Arceus)', JSON.stringify(await pick({ win: 8, nuz: 8, mono: 8, both: 5 })));
	A((await pick(7))[0] === 'win' && (await pick(7))[1] === 'Orange', 'an old flat level picks the plain sticker');
	// poke (Pikachu: any Pokermon win) ranks between Aipom and the plain sticker
	A((await pick({ win: 8, poke: 1 })).join('|') === 'poke|White|Pikachu|Pokermon win — White Stake|#ffffff', 'poke beats a higher-stake plain sticker (a White Pikachu over Gold)', JSON.stringify(await pick({ win: 8, poke: 1 })));
	A((await pick({ win: 8, poke: 8, nuz: 1 })).join('|') === 'nuz|White|Aipom|Nuzlocke win — White Stake|#ffffff', 'Aipom (nuz) beats a Gold Pikachu', JSON.stringify(await pick({ win: 8, poke: 8, nuz: 1 })));
	A(JSON.stringify(await S((M) => [M.CATEGORIES, M.PRIORITY])) === JSON.stringify([['win', 'poke', 'nuz', 'mono', 'both'], ['both', 'mono', 'nuz', 'poke', 'win']]), 'the five categories and their priority', JSON.stringify(await S((M) => [M.CATEGORIES, M.PRIORITY])));
	A(await S((M) => M.recordWin({ jokers: ['j_poke_rec'], stake: 3, categories: ['win', 'poke'] })) === 1 && JSON.stringify(await S((M) => M.winRecord('j_poke_rec'))) === '{"win":3,"poke":3}', 'recordWin stores poke like the others', JSON.stringify(await S((M) => M.winRecord('j_poke_rec'))));
	const cols = await S((M) => [1, 2, 3, 4, 5, 6, 7, 8].map((lv) => M.stickerFor({ nuz: lv }).colour));
	A(cols.join() === '#ffffff,#fe5f55,#4bc292,#374244,#009dff,#8867a5,#fda200,#eac058', 'ring colours are Balatro\'s stake colours (White..Gold)', cols.join());
	const info = await S((M) => { const i = M.winStickerInfo('j_joker', true); return [i.category, i.stake, i.special.pokemon]; });
	A(info.join() === 'mono,Purple,Ambipom', 'the Joker ({win:3, nuz:2, mono:6}) shows the Purple Ambipom', info.join());
	A(await S((M) => M.winSticker('j_joker', true)) === 'Purple', 'winSticker names the shown sticker\'s stake');

	// ----- drawing: the ring in the stake's colour + the sprite -----
	await S((M) => M.recordWin({ jokers: ['j_gold_nuz'], stake: 8, categories: ['nuz'] }));
	const drawn = async (centerKey, winKey) => page.evaluate(async (centerKey, winKey) => {
		const CS = await import('/micatro/js/ui/cardsprite.js');
		const M = await import('/micatro/js/ui/stickers.js');
		const c = document.createElement('canvas'); c.width = CS.FACE_W; c.height = CS.FACE_H;
		const ctx = c.getContext('2d');
		CS.composeFace(ctx, { center: centerKey, win_key: winKey, set: 'Joker' }, 'b_red', { collection: true });
		const { x, y, r } = M.SPECIAL_SPOT;
		const px = (X, Y) => [...ctx.getImageData(X, Y, 1, 1).data];
		// sample the ring band (between r-7 and r-2) on the left, right and bottom; and the centre (the sprite)
		const ring = [px(x - r + 4, y), px(x + r - 4, y), px(x, y + r - 4)];
		let sprite = 0; const d = ctx.getImageData(x - 8, y - 8, 16, 16).data;
		for (let i = 0; i < d.length; i += 4) if (!(d[i] === 0xf2 && d[i + 1] === 0xf4 && d[i + 2] === 0xf5)) sprite++;
		return { ring, sprite };
	}, centerKey, winKey);
	// wait for the sprites to load (the first draw starts loading them)
	await drawn('j_joker', 'j_gold_nuz');
	await waitFor(async () => (await drawn('j_joker', 'j_gold_nuz')).sprite > 20, 8000);
	const g = await drawn('j_joker', 'j_gold_nuz');
	const near = (p, hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return v.every((c, i) => Math.abs(c - p[i]) <= 6) && p[3] > 240; };
	A(g.ring.every((p) => near(p, '#eac058')), 'a Gold Nuzlocke sticker is ringed in Gold (#eac058)', JSON.stringify(g.ring));
	A(g.sprite > 20, 'the Pokémon sprite is drawn inside the ring', 'pixels=' + g.sprite);
	await S((M) => M.recordWin({ jokers: ['j_red_both'], stake: 2, categories: ['both'] }));
	const rb = await drawn('j_joker', 'j_red_both');
	A(rb.ring.every((p) => near(p, '#fe5f55')), 'a Red Arceus sticker is ringed in Red (#fe5f55)', JSON.stringify(rb.ring));
	await S((M) => M.recordWin({ jokers: ['j_purple_poke'], stake: 6, categories: ['win', 'poke'] }));
	await drawn('j_joker', 'j_purple_poke');
	await waitFor(async () => (await drawn('j_joker', 'j_purple_poke')).sprite > 20, 8000);
	const pp = await drawn('j_joker', 'j_purple_poke');
	A(pp.ring.every((p) => near(p, '#8867a5')) && pp.sprite > 20, 'a Purple Pikachu sticker is ringed in Purple (#8867a5), with the sprite inside', JSON.stringify(pp));
	const plain = await drawn('j_joker', 'j_greedy_joker');
	A(!plain.ring.every((p) => near(p, '#eac058')), 'a plain (win-only) Gold sticker draws the stake chip, not a ring', JSON.stringify(plain.ring));
	const sprites = await page.evaluate(async () => {
		const out = {};
		for (const n of ['aipom', 'ambipom', 'arceus', 'pikachu']) out[n] = await new Promise((res) => { const im = new Image(); im.onload = () => res(im.width > 0); im.onerror = () => res(false); im.src = '/micatro/assets/textures/winstickers/' + n + '.png'; });
		return out;
	});
	A(sprites.aipom && sprites.ambipom && sprites.arceus && sprites.pikachu, 'the four sticker sprites ship with Micatro', JSON.stringify(sprites));

	// ----- the tooltip -----
	await page.evaluate(() => window.__micatro.newRun({ stake: 1 }));
	await waitFor(() => page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 30000);
	await S((M) => M.recordWin({ jokers: ['j_greedy_joker'], stake: 8, categories: ['nuz'] }));
	await page.evaluate(async () => { const { G, add_joker } = await import('/micatro/js/engine/core.js'); add_joker('j_greedy_joker'); add_joker('j_scholar'); G.E_MANAGER.flush(); });
	await waitFor(() => page.evaluate(() => window.__micatro.idle()), 20000);
	await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
	await waitFor(() => page.evaluate(() => window.__micatro.idle()), 20000);
	const tip = (center) => page.evaluate((center) => { const b = window.__micatro.board; for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s.d.center === center) b.showCardTip(s, true); } return b.tip ? b.tip.textContent : ''; }, center);
	const tg = await tip('j_greedy_joker');
	A(/Nuzlocke win — Gold Stake/.test(tg) && /Aipom/.test(tg), 'the tooltip says "Nuzlocke win — Gold Stake"', tg.slice(0, 200));
	const ts = await tip('j_scholar');
	A(/Black Sticker/.test(ts) && !/Nuzlocke/.test(ts), 'a plain sticker keeps Balatro\'s tooltip', ts.slice(0, 200));
	A(errors.length === 0, 'no console errors', errors.join(' | '));
	A(notFound.length === 0, 'no missing files', notFound.join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
