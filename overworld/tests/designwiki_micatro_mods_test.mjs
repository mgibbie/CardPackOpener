// designwiki_micatro_mods_test.mjs — the design wiki's Micatro MOD sections and feature pages
// (designwiki/app.js micatroModsView / micatroModView / micatroBigNumbersView / micatroDeckEditorView /
// micatroReplaysView, designwiki/index.html nav, designwiki/data/micatro_mods*.json from
// tools/micatro/gen_designwiki_mods.mjs).
//   1. data parity (node): every mod the game ships (micatro/js/mods/index.js AVAILABLE) has a wiki
//      section and a nav link, and EVERY item it registers (jokers, consumables of every type, vouchers,
//      packs, decks, enhancements, editions, tags, blinds, stakes, seals/stamps, aspects, stickers,
//      suits, poker hands, rarities) is listed in it — nothing missing, nothing stale — with its sprite
//      cell; mods whose source documents intended-design fixes show them; the feature pages' data is
//      there. On drift, regenerate:  node tools/micatro/gen_designwiki.mjs
//   2. the pages in headless Chrome: the mods index, every mod page (all its items drawn), a sprite
//      cell, ?item= highlighting, search, the three feature pages, no console errors, phone layout.
//   node overworld/tests/designwiki_micatro_mods_test.mjs
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
const PORT = 9519;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const REGEN = 'regen: node tools/micatro/gen_designwiki.mjs';
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);

// ---------- 1. data parity
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() { }, removeItem() { } };
const core = await imp('micatro/js/engine/core.js');
const IDX = await imp('micatro/js/mods/index.js');
const REG = await imp('micatro/js/mods/registry.js');
await IDX.loadMods(IDX.AVAILABLE.map(m => m.id));
let ASPECTS = {};
try { ASPECTS = (await imp('micatro/mods/autumnmood/api.js')).ASPECTS || {}; } catch { }
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micatro_mods.json'), 'utf8'));
const nav = fs.readFileSync(path.join(ROOT, 'designwiki/index.html'), 'utf8');
const files = {};
for (const m of IDX.AVAILABLE) {
	const f = path.join(ROOT, 'designwiki/data/micatro_mods', m.id + '.json');
	files[m.id] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
A(W.mods.length === IDX.AVAILABLE.length && IDX.AVAILABLE.every(m => W.mods.some(x => x.id === m.id)), `every mod (${IDX.AVAILABLE.length}) has a wiki section`, `wiki: ${W.mods.map(m => m.id)} — ${REGEN}`);
A(IDX.AVAILABLE.every(m => files[m.id]), 'every mod has its content file', REGEN);
A(IDX.AVAILABLE.every(m => nav.includes(`href="#/micatro/mod/${m.id}"`)), 'every mod has a sidebar link', IDX.AVAILABLE.filter(m => !nav.includes(`href="#/micatro/mod/${m.id}"`)).map(m => m.id).join(','));

/** What the game registers for a mod: key -> {pos?, atlas?} (player-facing; Reverie's ticket shaders aren't cards). */
function registered(id) {
	const out = new Map();
	const put = (o, keyOverride) => out.set(keyOverride || o.key, o);
	for (const c of Object.values(core.P_CENTERS)) if (c.mod === id && !c.unported && !['Shader', 'Other', 'Default'].includes(c.set)) put(c);
	for (const T of [core.P_TAGS, core.P_BLINDS, core.P_STAKES, core.P_SEALS, REG.STICKERS, REG.MOD_SUITS, REG.MOD_POKER_HANDS, REG.RARITIES, ASPECTS]) for (const o of Object.values(T)) if (o.mod === id) put(o);
	for (const c of (REG.MODS[id].challenges || [])) if (c && typeof c === 'object' && c.key) put(c);
	return out;
}
let totalItems = 0;
const counts = [];
for (const m of IDX.AVAILABLE) {
	const F = files[m.id]; if (!F) continue;
	const listed = new Map();
	for (const s of F.sections) for (const it of s.items) listed.set(it.key, { ...it, section: s.id });
	const game = registered(m.id);
	const missing = [...game.keys()].filter(k => !listed.has(k));
	const stale = [...listed.keys()].filter(k => !game.has(k));
	A(!missing.length && !stale.length, `${m.id}: all ${game.size} items listed (no stale ones)`, `missing ${missing.slice(0, 6)} stale ${stale.slice(0, 6)} — ${REGEN}`);
	// sprite cells: a center's art layer is its own atlas cell (soul on top)
	const badArt = [];
	for (const [k, o] of game) {
		const it = listed.get(k); if (!it || !o.pos || !o.set || !core.P_CENTERS[k] || !o.atlas || !REG.ATLASES[o.atlas]) continue;
		const base = it.art && it.art[it.art.length - 1];
		if (!it.edition && (!base || base[0] !== '@' + o.atlas || base[1].x !== (o.pos.x || 0) || base[1].y !== (o.pos.y || 0))) badArt.push(k);
		if (o.soul_pos && !it.edition && !(it.art && it.art.length === 2 && it.art[0][1].x === o.soul_pos.x && it.art[0][1].y === o.soul_pos.y)) badArt.push(k + '(soul)');
	}
	A(!badArt.length, `${m.id}: every card's sprite cell matches its atlas pos`, badArt.slice(0, 6).join(','));
	const named = [...listed.values()].filter(it => !it.name || /^undefined|^null/.test(it.name));
	A(!named.length, `${m.id}: every item has a name`, named.slice(0, 4).map(i => i.key).join(','));
	const idx = W.mods.find(x => x.id === m.id);
	A(idx && idx.total === listed.size && idx.by && idx.description, `${m.id}: index entry (credits, description, count ${listed.size})`, JSON.stringify(idx && { by: idx.by, total: idx.total }));
	totalItems += listed.size;
	counts.push(m.id + ' ' + listed.size);
}
console.log('     items per mod: ' + counts.join(', ') + ` (total ${totalItems})`);
// intended-design fixes are surfaced wherever the source documents them
for (const m of IDX.AVAILABLE) {
	const dir = path.join(ROOT, 'micatro/mods', m.id);
	const src = fs.readdirSync(dir, { recursive: true }).filter(f => String(f).endsWith('.js') && !String(f).includes('assets')).map(f => fs.readFileSync(path.join(dir, String(f)), 'utf8')).join('\n');
	const documented = /INTENDED-DESIGN FIX|Intended-design fix|FIX \(intended design|evidently intended/.test(src);
	const idx = W.mods.find(x => x.id === m.id) || { fixes: [] };
	if (documented) A(idx.fixes.length > 0, `${m.id}: its documented intended-design fixes are listed (${idx.fixes.length})`);
}
const milatro = W.mods.find(x => x.id === 'milatro');
A(milatro && milatro.fixes.length >= 4 && milatro.fixes.some(f => /Colorblindness/.test(f.text)) && milatro.fixes.some(f => /Hole in One/.test(f.text)), 'Milatro: its 4 header fixes (Colorblindness ... Hole in One)', JSON.stringify(milatro && milatro.fixes.map(f => f.text.slice(0, 30))));
const bunco = W.mods.find(x => x.id === 'bunco');
A(bunco && bunco.options.some(o => o.key === 'gameplay_reworks' && o.default === true && o.desc), 'Bunco: its options with defaults and descriptions');
const tags = files.bunco && files.bunco.sections.find(s => s.id === 'tags');
A(tags && tags.items.every(t => t.name !== t.key && t.lines.length), 'Bunco tags: real names and text (not the raw key)', tags && tags.items.filter(t => t.name === t.key).map(t => t.key).slice(0, 3).join(','));
const F = W.features || {};
A(F.bignum && F.bignum.maxExp === 1000 && F.bignum.examples.some(x => x.shown === 'naneinf') && F.bignum.examples.some(x => /e450$/.test(x.shown)), 'feature data: big numbers (formatter examples)');
A(F.deckeditor && F.deckeditor.params.length >= 3 && F.deckeditor.rules.length >= 1 && F.deckeditor.examples.some(x => x.name === 'Goth Deck') && F.deckeditor.fixes.length >= 3, 'feature data: deck editor (settings, rules, Goth Deck, fixes)');
A(F.replays && F.replays.localMax > 0 && F.replays.actionsMax > 0, 'feature data: replays');

// ---------- 2. the pages
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
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
	page.on('pageerror', e => errors.push(e.message));
	// mod art is gitignored (its own Pages project): a 404 for art that isn't on this disk isn't a wiki bug
	page.on('response', r => {
		if (r.status() < 400) return;
		const u = decodeURIComponent(new URL(r.url()).pathname);
		if (/^\/micatro\/mods\/[^/]+\/assets\//.test(u) && !fs.existsSync(path.join(ROOT, u))) return;
		failed.push(r.status() + ' ' + r.url());
	});
	const open = async (route, sel, n) => {
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/${route}`, { waitUntil: 'networkidle0' });
		return page.waitForFunction((s, k) => document.querySelectorAll('#content ' + s).length >= k, { timeout: 20000 }, sel, n).then(() => true, () => false);
	};
	A(await open('micatro/mods', '.mc-modcard', W.mods.length) && await page.$$eval('#content .mc-modcard', e => e.length) === W.mods.length, `#/micatro/mods lists all ${W.mods.length} mods`);
	A(await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micatro/mods', 'nav: All Mods is active');
	for (const m of W.mods) {
		const n = m.total;
		const ok = await open('micatro/mod/' + m.id, '[data-section] [data-key]', n);
		const got = await page.$$eval('#content [data-section] [data-key]', e => e.length);
		A(ok && got === n, `#/micatro/mod/${m.id}: all ${n} items drawn`, `got ${got}`);
	}
	// the mod page shows credits, toggle info, systems and its fixes
	await open('micatro/mod/milatro', '[data-section] [data-key]', 30);
	const mp = await page.evaluate(() => ({ text: document.getElementById('content').textContent, fixes: document.querySelectorAll('#content .mc-fixes li').length, active: (document.querySelector('#sidebar a.active') || {}).getAttribute?.('href') }));
	A(/Milan, Emilia & Emma/.test(mp.text) && /New Run → Mods/.test(mp.text) && /Fixed as the author intended/.test(mp.text) && mp.fixes === milatro.fixes.length, 'milatro page: credits, how to turn it on, its fixes', JSON.stringify({ fixes: mp.fixes }));
	A(mp.active === '#/micatro/mod/milatro', 'nav: the mod’s own link is active', mp.active);
	A(!/\bnull\b/.test(mp.text.replace(/null_/g, '')), 'no stray "null" text on the page');
	const j = files.milatro.sections[0].items[3];
	const cell = await page.$eval(`#content [data-key="${j.key}"] .mc-spr`, el => ({ img: el.style.backgroundImage, pos: el.style.backgroundPosition }));
	const at = W.atlases[j.art[0][0].slice(1)];
	A(cell.img.includes(at.src) && cell.pos === `${-j.art[0][1].x * at.cw}px ${-j.art[0][1].y * at.ch}px`, `${j.name}: the tile is its own atlas cell`, JSON.stringify(cell));
	await page.type('#content .mc-search', 'hole in one');
	A(await page.$$eval('#content [data-section] [data-key]', e => e.map(x => x.dataset.key).join()) === 'j_mlnc_hole_in_one', 'search narrows the mod page');
	// ?item= scrolls to and highlights a card (Magepunk News links here)
	await open('micatro/mod/bunco?item=tag_bunc_breaking', '.mc-hl', 1);
	A(await page.$eval('#content .mc-hl', e => e.dataset.key) === 'tag_bunc_breaking', '?item= highlights that card');
	// feature pages
	const de = W.features.deckeditor;
	A(await open('micatro/deck-editor', 'table', de.params.length + de.rules.length + 1) && await page.$eval('#content', el => /Goth Deck/.test(el.textContent) && /Deck Creator/.test(el.textContent) && !/object HTML/.test(el.textContent)), 'deck editor page: settings, rules, examples');
	A(await open('micatro/big-numbers', 'table', 1) && await page.$eval('#content', el => /9\.99e999/.test(el.textContent) && /naneinf/.test(el.textContent)), 'big-number page');
	A(await open('micatro/replays', 'table', 1) && await page.$eval('#content', el => /\/mr\/<id>/.test(el.textContent) && /whole run/.test(el.textContent)), 'replays page');
	A(await open('micatro', '.mc-featlink', 4) && await page.$$eval('#content .mc-idx', e => e.length) === 10, 'overview links the mods + feature pages (base index untouched)');
	// phone
	await page.setViewport({ width: 390, height: 844 });
	for (const r of ['micatro/mods', 'micatro/mod/bunco', 'micatro/mod/pokermon', 'micatro/deck-editor', 'micatro/replays']) {
		await open(r, '.lp-back', 1);
		const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		A(ov <= 0, `390px #/${r}: no horizontal overflow`, ov);
	}
	A(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '));
	A(failed.length === 0, 'no failed requests', failed.slice(0, 3).join(' | '));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
