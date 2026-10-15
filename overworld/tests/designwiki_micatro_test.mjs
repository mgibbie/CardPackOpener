// designwiki_micatro_test.mjs — the design wiki's Micatro section (designwiki/app.js
// micatroRoute + micatro*View, designwiki/style.css .mc-*, designwiki/index.html nav,
// designwiki/data/micatro.json from tools/micatro/gen_designwiki.mjs).
//   1. micatro.json is in sync with the game data (micatro/data/balatro_data.js):
//      every joker / consumable / voucher / pack / tag / blind / deck / stake / hand
//      is listed, and the sprite cells (pos / soul_pos) match. On drift, regenerate:
//        node tools/micatro/gen_designwiki.mjs
//   2. Every #/micatro route renders its N items in headless Chrome with no console
//      errors, a joker tile's CSS background-position points at its atlas cell, a
//      legendary carries its soul layer on top, the sprite atlases load, and the
//      phone layout (390 px) has no horizontal overflow.
//   node overworld/tests/designwiki_micatro_test.mjs
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
const PORT = 9517;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

// ---------- 1. data parity (node only)
const DATA = (await import(pathToFileURL(path.join(ROOT, 'micatro/data/balatro_data.js')).href)).default;
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micatro.json'), 'utf8'));
const setOf = s => Object.entries(DATA.centers).filter(([, v]) => v.set === s);
const REGEN = 'regen: node tools/micatro/gen_designwiki.mjs';
for (const [set, list] of [['Joker', W.jokers], ['Tarot', W.tarots], ['Planet', W.planets], ['Spectral', W.spectrals], ['Voucher', W.vouchers], ['Booster', W.boosters]]) {
	const game = setOf(set);
	A(game.length === list.length, `${set}: wiki lists all ${game.length}`, `wiki has ${list.length} — ${REGEN}`);
	const bad = game.filter(([k, v]) => { const w = list.find(x => x.key === k); return !w || JSON.stringify(w.pos) !== JSON.stringify(v.pos) || JSON.stringify(w.soul || null) !== JSON.stringify(v.soul_pos || null) || !w.lines.length; });
	A(bad.length === 0, `${set}: every entry has its sprite cell and text`, bad.slice(0, 5).map(([k]) => k).join(','));
}
A(W.jokers.length === 150, '150 jokers');
A(W.tags.length === Object.keys(DATA.tags).length, 'every tag is listed');
A(W.blinds.length === Object.keys(DATA.blinds).length, 'every blind is listed');
A(W.decks.length === setOf('Back').length - 1, 'every deck (minus the Challenge Deck) is listed');
A(W.stakes.length === Object.keys(DATA.stakes).length, 'every stake is listed');
A(W.hands.length === Object.keys(DATA.hands).length, 'every poker hand is listed');
const misprint = W.jokers.find(j => j.key === 'j_misprint');
A(misprint && /\+0-23/.test(misprint.lines.join(' ')), 'Misprint carries its main_start text (+0-23 Mult)');
A(!JSON.stringify(W).match(/#\d+#/), 'no unfilled #n# placeholders');

// ---------- 2. the pages, in headless Chrome
const server = http.createServer((req, res) => {
	let u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
	if (u.endsWith('/')) u += 'index.html';
	fs.readFile(path.join(ROOT, u), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(u)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 1400, height: 900 });
	const errors = [], failed = [];
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', e => errors.push(e.message));
	page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
	const go = async (route, sel, n) => {
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/${route}`, { waitUntil: 'networkidle0' });
		const ok = await page.waitForFunction((s, k) => document.querySelectorAll('#content ' + s).length >= k, { timeout: 15000 }, sel, n).then(() => true, () => false);
		const got = await page.$$eval('#content ' + sel, els => els.length);
		A(ok && got === n, `#/${route} renders ${n} × ${sel}`, `got ${got}`);
	};
	await go('micatro', '.mc-idx', 10);
	A(await page.$eval('#content', el => /Celadon City Game Corner/.test(el.textContent) && /best single hand/.test(el.textContent) && !!el.querySelector('a[href="/micatro/"]')), 'overview: play link, arcade cabinet, leaderboard');
	A(await page.$$eval('#content table', t => t.length) === 3, 'overview: mouse/touch, keyboard and controller tables');
	A(await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micatro', 'nav: Overview is active');
	await go('micatro/jokers', '.mc-tile', 150);
	A(await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micatro/jokers' && await page.$$eval('#sidebar a.active', a => a.length) === 1, 'nav: only Jokers is active on #/micatro/jokers');
	// sprite cells: background-position = -(x*142) -(y*190) into Jokers.png (2x atlas, 142×190 cells)
	const cell = async key => page.$eval(`#content .mc-tile[data-key="${key}"] .mc-spr`, el => ({ img: el.style.backgroundImage, pos: el.style.backgroundPosition, w: el.style.width, h: el.style.height }));
	for (const key of ['j_joker', 'j_blueprint', 'j_idol']) {
		const j = W.jokers.find(x => x.key === key), c = await cell(key);
		A(c.pos === `${-j.pos.x * 142}px ${-j.pos.y * 190}px` && /Jokers\.png/.test(c.img) && c.w === '142px' && c.h === '190px', `${key} tile shows Jokers.png cell (${j.pos.x},${j.pos.y})`, JSON.stringify(c));
	}
	const pk = W.jokers.find(x => x.key === 'j_perkeo'), cp = await cell('j_perkeo');
	A(cp.pos === `${-pk.soul.x * 142}px ${-pk.soul.y * 190}px, ${-pk.pos.x * 142}px ${-pk.pos.y * 190}px`, 'Perkeo: soul layer drawn over its base cell', cp.pos);
	A(await page.$eval('#content .mc-tile[data-key="j_joker"] .mc-desc', el => { const s = el.querySelector('.mk'); return /\+4/.test(el.textContent) && s && getComputedStyle(s).color === 'rgb(254, 95, 85)'; }), 'Joker text is colourised ({C:red}+4 in mult red)');
	// filters
	await page.select('#content .mc-select', 'Legendary');
	A(await page.$$eval('#content .mc-tile', t => t.length) === 5, 'rarity filter: 5 Legendary');
	await page.select('#content .mc-select', 'all');
	await page.type('#content .mc-search', 'blueprint');
	A(await page.$$eval('#content .mc-tile', t => t.map(x => x.dataset.key).join()) === 'j_blueprint', 'search: "blueprint" finds Blueprint');
	// the atlases really load (a wrong path would leave every sprite blank)
	const atlasOk = await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth === 1420 && i.naturalHeight === 3040); i.onerror = () => r(false); i.src = src; }), '../micatro/assets/textures/Jokers.png');
	A(atlasOk, 'Jokers.png atlas loads from ../micatro/assets/textures (1420×3040)');

	await go('micatro/consumables', '.mc-tile', W.tarots.length);
	await page.click('#content .mc-tabs button[data-tab="planets"]');
	A(await page.$$eval('#content .mc-tile', t => t.length) === W.planets.length, `consumables: Planet tab shows ${W.planets.length}`);
	await page.click('#content .mc-tabs button[data-tab="spectrals"]');
	A(await page.$$eval('#content .mc-tile', t => t.length) === W.spectrals.length, `consumables: Spectral tab shows ${W.spectrals.length}`);
	await page.click('#content .mc-tabs button[data-tab="tarots"]');
	await go('micatro/vouchers', '.mc-tile', W.vouchers.length);
	await go('micatro/boosters', '.mc-tile', W.boosters.length);
	await go('micatro/tags', '.mc-row', W.tags.length);
	await go('micatro/blinds', '.mc-blind', W.blinds.length);
	const hook = W.blinds.find(b => b.key === 'bl_hook');
	A(await page.$eval('#content .mc-blind[data-key="bl_hook"] .mc-spr', el => el.style.backgroundPosition) === `0px ${-hook.pos.y * 68}px`, 'The Hook shows BlindChips.png frame 0 of its row');
	await go('micatro/decks', '.mc-tile', W.decks.length);
	await go('micatro/stakes', '.mc-row', W.stakes.length);
	await go('micatro/hands', '.mc-hand', W.hands.length);
	A(await page.$$eval('#content .mc-hand .mc-pc', p => p.length) === W.hands.reduce((n, h) => n + h.example.length, 0), 'hands: every example card is drawn');
	await go('micatro/enhancements', '.mc-tile', W.enhancements.length + W.editions.length + W.seals.length + W.stickers.length);

	// phone: the drawer nav + no sideways scroll
	await page.setViewport({ width: 390, height: 844 });
	for (const r of ['micatro', 'micatro/jokers', 'micatro/blinds', 'micatro/hands']) {
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/${r}`, { waitUntil: 'networkidle0' });
		await page.waitForSelector('#content .lp-back, #content .mc-hero', { timeout: 10000 }).catch(() => {});
		const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		A(ov <= 0, `390px #/${r}: no horizontal overflow`, ov);
	}
	A(await page.$eval('#sidebar', el => getComputedStyle(el).position) === 'fixed', '390px: the sidebar is the off-canvas drawer');

	A(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '));
	A(failed.length === 0, 'no failed requests', failed.slice(0, 3).join(' | '));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
