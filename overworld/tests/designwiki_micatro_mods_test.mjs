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
//      Sleeves (mods' sleeves.js), deck skins (mods' skins.js) and challenges are listed too; every
//      section belongs to exactly one category of the "Micatro Mods" section.
//   2. the pages in headless Chrome: the Micatro Mods overview (#/micatro-mods: a tile per category,
//      the By-mod grid), EVERY category page (exactly its generated items, each with its mod badge;
//      tabs; the mod filter + ?mod= link; search; ?item=), every mod page (all its items drawn, no raw
//      or broken text — the Pokermon "Add-ons for it: ,https://…" bug), the old #/micatro/mod(s) links
//      redirecting, the sidebar group, the vanilla Micatro pages showing no mod items, the header
//      search finding mod cards, the three feature pages, no console errors, phone layout.
//   3. art + paging + search index: every tile of both overviews (Micatro, Micatro Mods) has real game
//      art (Joker Rarities = a joker of that rarity, Challenges = the Challenge Deck); big lists draw 60
//      at a time (Show more / Show all / scrolling), a ?item= deep link to a late card still lands on it;
//      the header search reads designwiki/data/micatro_mods_search.json, never the 19 mod files; no
//      challenge page prints a raw key (Balls of Patience's "tag_holographic").
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
// deck skins: plain data in mods/<id>/skins.js (cosmetic, never registered with the mod)
const SKINS = [];
for (const m of IDX.AVAILABLE) {
	const sf = path.join(ROOT, 'micatro/mods', m.id, 'skins.js');
	if (fs.existsSync(sf)) SKINS.push(...((await import(pathToFileURL(sf).href)).SKINS || []).map(x => ({ mod: m.id, ...x })));
}
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micatro_mods.json'), 'utf8'));
const nav = fs.readFileSync(path.join(ROOT, 'designwiki/index.html'), 'utf8');
const files = {};
for (const m of IDX.AVAILABLE) {
	const f = path.join(ROOT, 'designwiki/data/micatro_mods', m.id + '.json');
	files[m.id] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
A(W.mods.length === IDX.AVAILABLE.length && IDX.AVAILABLE.every(m => W.mods.some(x => x.id === m.id)), `every mod (${IDX.AVAILABLE.length}) has a wiki section`, `wiki: ${W.mods.map(m => m.id)} — ${REGEN}`);
A(IDX.AVAILABLE.every(m => files[m.id]), 'every mod has its content file', REGEN);
A(IDX.AVAILABLE.every(m => nav.includes(`href="#/micatro-mods/mod/${m.id}"`)), 'every mod has a sidebar link', IDX.AVAILABLE.filter(m => !nav.includes(`href="#/micatro-mods/mod/${m.id}"`)).map(m => m.id).join(','));
A((W.categories || []).length >= 10 && W.categories.every(c => nav.includes(`href="#/micatro-mods/${c.id}"`)) && nav.includes('href="#/micatro-mods"'), 'sidebar: the Micatro Mods group links the overview + every category', (W.categories || []).filter(c => !nav.includes(`href="#/micatro-mods/${c.id}"`)).map(c => c.id).join(','));
const navMicatro = nav.slice(nav.indexOf('<div class="nav-group">Micatro</div>'), nav.indexOf('<div class="nav-group">Micatro Mods</div>'));
A(navMicatro.length > 0 && !/micatro-mods|micatro\/mod/.test(navMicatro), 'sidebar: the vanilla Micatro group has no mod links');

/** What the game registers for a mod: key -> {pos?, atlas?} (player-facing; Reverie's ticket shaders aren't cards). */
function registered(id) {
	const out = new Map();
	const put = (o, keyOverride) => out.set(keyOverride || o.key, o);
	for (const c of Object.values(core.P_CENTERS)) if (c.mod === id && !c.unported && !['Shader', 'Other', 'Default'].includes(c.set)) put(c);
	for (const T of [core.P_TAGS, core.P_BLINDS, core.P_STAKES, core.P_SEALS, REG.STICKERS, REG.MOD_SUITS, REG.MOD_POKER_HANDS, REG.RARITIES, ASPECTS]) for (const o of Object.values(T)) if (o.mod === id) put(o);
	for (const c of (REG.MODS[id].challenges || [])) if (c && typeof c === 'object' && (c.key || c.id)) put(c, c.key || c.id);
	for (const sl of (REG.MODS[id].sleeves || [])) if (sl && sl.key) put(sl);
	for (const sk of SKINS) if (sk.mod === id) put(sk, 'skin_' + sk.key);
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
A(SKINS.length >= 16 && Object.values(files).some(F => F && F.sections.some(x => x.id === 'sleeves')) && Object.values(files).some(F => F && F.sections.some(x => x.id === 'skins')), `sleeves and the ${SKINS.length} deck skins are listed`);
// categories: every mod section in exactly one, counts add up (overview tiles + category pages read these)
const catOf = {};
for (const c of W.categories || []) for (const x of c.sections) { A(!catOf[x.id], `section ${x.id} is in one category only`, catOf[x.id] + ' + ' + c.id); catOf[x.id] = c.id; }
const unplaced = Object.values(files).flatMap(F => F ? F.sections.map(x => x.id) : []).filter(id => !catOf[id]);
A(!unplaced.length, 'every mod section belongs to a category', [...new Set(unplaced)].join(','));
const catTotal = (W.categories || []).reduce((n, c) => n + c.count, 0);
A(catTotal === totalItems && (W.categories || []).every(c => c.count === Object.values(c.perMod).reduce((a, b) => a + b, 0)), `category counts add up to every item (${catTotal})`);
console.log('     categories: ' + (W.categories || []).map(c => c.id + ' ' + c.count).join(', '));
/** The generated items of one category: key -> {mod, sid}. */
const itemsOf = cid => { const o = new Map(); for (const m of W.mods) for (const x of files[m.id].sections) if (catOf[x.id] === cid) for (const it of x.items) o.set(it.key, { mod: m.id, sid: x.id }); return o; };
// no raw / broken text in what the pages print (a stringified array of links, a JS value, a markup leak)
const RAW = /\[object|\bundefined\b|\bNaN\b|https?:\/\/|,,|\{[A-Za-z]:[^}]*\}|(^|[^_])\bnull\b(?!_)/;
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
// every category has cover art; the rarity rows show a joker of that rarity, challenges the deck they play on
A(W.categories.every(c => c.cover && c.cover.art.length), 'every category has cover art', W.categories.filter(c => !c.cover).map(c => c.id).join(','));
A(W.categories.find(c => c.id === 'challenges').cover?.art?.[0][0] === 'centers' && JSON.stringify(W.categories.find(c => c.id === 'challenges').cover?.art?.[0][1]) === '{"x":0,"y":4}', 'Challenges cover: the Challenge Deck (Enhancers.png 0,4)');
const rarItems = Object.values(files).flatMap(F => F.sections.filter(x => x.id === 'rarities').flatMap(x => x.items));
A(rarItems.length >= 5 && rarItems.every(r => r.art && r.art.length && Object.values(files).some(F => F.sections.some(x => x.id === 'jokers' && x.items.some(j => j.rarity === r.name && JSON.stringify(j.art) === JSON.stringify(r.art))))), 'every mod rarity shows one of its own jokers', rarItems.filter(r => !r.art).map(r => r.key).join(','));
const chItems = Object.values(files).flatMap(F => F.sections.filter(x => x.id === 'challenges').flatMap(x => x.items));
const KEYRE = /\b(?:j|c|v|p|tag|bl|b|m|e)_[a-z0-9]+(?:_[a-z0-9]+)*\b/;
A(chItems.length >= 20 && chItems.every(c => c.art && c.art.length), 'every mod challenge shows its deck');
A(chItems.every(c => !KEYRE.test(JSON.stringify([c.name, c.lines, c.info]))), 'mod challenges: no raw keys in their text', chItems.map(c => JSON.stringify([c.name, c.lines, c.info]).match(KEYRE)).filter(Boolean).map(m => m[0]).join(','));
const bop = chItems.find(c => c.key === 'c_sonfive_balls_of_patience');
A(bop && bop.info.some(i => i.name === 'Banned' && i.lines.some(l => /Tags: .*Holographic Tag/.test(l))), 'Balls of Patience: bans the Holographic Tag (by name)', JSON.stringify(bop && bop.info));
// the header search's compact index: every item, nothing else
const SI = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micatro_mods_search.json'), 'utf8'));
const siKeys = new Set(SI.items.map(x => x[0]));
A(SI.items.length === totalItems && Object.values(files).every(F => F.sections.every(x => x.items.every(it => siKeys.has(it.key)))) && SI.items.every(x => SI.mods[x[2]] && SI.cats[x[3]] && SI.kinds[x[4]] != null), `search index: all ${totalItems} items with mod / category / kind`, SI.items.length);
const siSize = fs.statSync(path.join(ROOT, 'designwiki/data/micatro_mods_search.json')).size, modsSize = Object.keys(files).reduce((n, id) => n + fs.statSync(path.join(ROOT, 'designwiki/data/micatro_mods', id + '.json')).size, 0);
A(siSize < modsSize / 2, `search index (${Math.round(siSize / 1024)} KB) is well under the mod files (${Math.round(modsSize / 1024)} KB)`);
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
	// (the 'Fixed as the author intended' notes quote source code — undefined globals, raw markup — on purpose)
	const text = () => page.$eval('#content', el => { const c = el.cloneNode(true); c.querySelectorAll('.mc-fixes').forEach(x => x.remove()); return c.textContent; });
	const rawAt = t => (t.match(new RegExp('.{0,40}(' + RAW.source + ').{0,40}')) || [])[0];
	// big lists draw 60 at a time: press every "Show all" (category / mod pages)
	const showAll = () => page.$$eval('#content .mm-pager:not([hidden]) .mm-all', b => b.forEach(x => x.click()));
	// the overview: hero, one tile per category (with its count), the By-mod grid
	A(await open('micatro-mods', '.mc-modcard', W.mods.length) && await page.$$eval('#content .mc-modcard', e => e.length) === W.mods.length, `#/micatro-mods: the By-mod grid lists all ${W.mods.length} mods`);
	const tiles = await page.$$eval('#content .mc-idx[data-cat]', e => e.map(x => [x.dataset.cat, x.getAttribute('href'), x.textContent]));
	A(tiles.length === W.categories.length && W.categories.every((c, i) => tiles[i][0] === c.id && tiles[i][1] === '#/micatro-mods/' + c.id && tiles[i][2].includes(c.count.toLocaleString('en-US') + ' entries')), `#/micatro-mods: a tile per category (${W.categories.length}) with its count`, JSON.stringify(tiles.slice(0, 3)));
	A(await page.$eval('#content .mc-hero h1', e => e.textContent) === 'Micatro Mods', 'overview: its own hero');
	const ovArt = await page.$$eval('#content .mc-idx[data-cat]', t => t.map(a => { const s = a.querySelector('.mc-spr'); return [a.dataset.cat, s ? s.style.backgroundImage : '', !!a.querySelector('.mc-idx-txt')]; }));
	A(ovArt.length === W.categories.length && ovArt.every(([, img, txt]) => /url\(/.test(img) && !txt), 'overview: every category tile has real art (no ♠♥ stand-in)', JSON.stringify(ovArt.filter(([, img, txt]) => !img || txt)));
	A(/Enhancers\.png/.test((ovArt.find(x => x[0] === 'challenges') || [])[1]) && /poke_|Jokers|jokers/i.test((ovArt.find(x => x[0] === 'rarities') || [])[1]), 'overview: Challenges = the Challenge Deck, Joker Rarities = a joker', JSON.stringify(ovArt.filter(x => ['challenges', 'rarities'].includes(x[0]))));
	A(await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micatro-mods', 'nav: Micatro Mods overview is active');
	A(await page.$$eval('#content .mc-modcard', e => e.every(a => a.getAttribute('href') === '#/micatro-mods/mod/' + a.dataset.mod)), 'overview: each mod card links its mod page');
	A(!RAW.test(await text()), 'overview: no raw text', rawAt(await text()));
	// old links (Magepunk News, bookmarks) still land
	await open('micatro/mods', '.mc-modcard', 1);
	A(await page.evaluate(() => location.hash) === '#/micatro-mods', '#/micatro/mods redirects to #/micatro-mods');
	// every category page: exactly its generated items, each with its mod's badge
	for (const c of W.categories) {
		const want = itemsOf(c.id);
		await open('micatro-mods/' + c.id, '[data-key]', 1);
		const tabs = await page.$$eval('#content .mc-tabs button', b => b.map(x => x.dataset.tab));
		const seen = new Map();
		for (const t of tabs.length ? tabs : [null]) {
			if (t) await page.click(`#content .mc-tabs button[data-tab="${t}"]`);
			await showAll();
			for (const [k, mod] of await page.$$eval('#content [data-key]', e => e.map(x => [x.dataset.key, x.dataset.mod]))) seen.set(k, mod);
		}
		const missing = [...want.keys()].filter(k => !seen.has(k)), extra = [...seen.keys()].filter(k => !want.has(k));
		const wrongMod = [...want].filter(([k, v]) => seen.has(k) && seen.get(k) !== v.mod).map(([k]) => k);
		A(!missing.length && !extra.length && !wrongMod.length, `#/micatro-mods/${c.id}: exactly its ${want.size} items${tabs.length ? ' (' + tabs.length + ' tabs)' : ''}, each with its mod badge`, `missing ${missing.slice(0, 4)} extra ${extra.slice(0, 4)} wrong mod ${wrongMod.slice(0, 4)}`);
		const t = await text();
		A(!RAW.test(t), `#/micatro-mods/${c.id}: no raw text`, rawAt(t));
		if (c.id === 'challenges') {
			A(!KEYRE.test(t), '#/micatro-mods/challenges: no raw game keys (tag_holographic)', (t.match(KEYRE) || [])[0]);
			A(await page.$$eval('#content .mc-row', r => r.length && r.every(x => x.querySelector('.mc-spr'))), '#/micatro-mods/challenges: every row shows its deck');
		}
	}
	A(await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micatro-mods/' + W.categories[W.categories.length - 1].id, 'nav: the category link is active');
	// the mod filter, and its ?mod= link
	const bj = [...itemsOf('jokers')].filter(([, v]) => v.mod === 'bunco').length;
	// paging: 60 drawn, Show more adds 60, scrolling to the footer draws more, a deep link to a late card lands on it
	const allJ = [...itemsOf('jokers')];
	await open('micatro-mods/jokers', '[data-key]', 60);
	const drawn = () => page.$$eval('#content [data-key]', e => e.length);
	A(await drawn() === 60 && await page.$eval('#content .mm-pager', (e, n) => !e.hidden && e.textContent.replace(/,/g, '').includes('Showing 60 of ' + n), allJ.length), `jokers: the first 60 of ${allJ.length} drawn, with a pager`, await drawn());
	await page.click('#content .mm-pager .mm-more:not(.mm-all)').catch(() => {});
	A(await drawn() === 120, 'jokers: Show more draws 60 more', await drawn());
	await page.$eval('#content .mm-pager', e => e.scrollIntoView()).catch(() => {});
	A(await page.waitForFunction(() => document.querySelector('#content .mm-pager') && document.querySelectorAll('#content [data-key]').length > 120, { timeout: 5000 }).then(() => true, () => false), 'jokers: scrolling to the footer draws more (IntersectionObserver)', await drawn());
	const lateKey = allJ[allJ.length - 1][0];
	await open('micatro-mods/jokers?item=' + encodeURIComponent(lateKey), '.mc-hl', 1);
	const late = await page.$eval('#content .mc-hl', e => { const r = e.getBoundingClientRect(); return { key: e.dataset.key, inView: r.top >= 0 && r.bottom <= innerHeight }; }).catch(() => ({}));
	A(late.key === lateKey && late.inView, `?item= a late joker (#${allJ.length}, ${lateKey}): drawn, scrolled to and highlighted`, JSON.stringify(late));
	await open('micatro-mods/mod/pokermon?item=' + encodeURIComponent(files.pokermon.sections[0].items[440].key), '.mc-hl', 1);
	A(await page.$eval('#content .mc-hl', e => e.dataset.key).catch(() => null) === files.pokermon.sections[0].items[440].key, 'mod page ?item= a late card (Pokermon joker #441): drawn and highlighted');
	await open('micatro-mods/jokers', '[data-key]', 50);
	await page.select('#content .mm-modsel', 'bunco');
	await showAll();
	const fj = await page.$$eval('#content [data-key]', e => e.map(x => x.dataset.mod));
	A(fj.length === bj && fj.every(x => x === 'bunco') && await page.evaluate(() => location.hash) === '#/micatro-mods/jokers?mod=bunco', `mod filter: Bunco's ${bj} jokers only, and the hash says so`, fj.length + ' ' + await page.evaluate(() => location.hash));
	await open('micatro-mods/jokers?mod=morefluff', '[data-key]', 10);
	await showAll();
	const mfj = files.morefluff.sections.find(x => x.id === 'jokers').items.length;
	A(await page.$$eval('#content [data-key]', e => e.length === e.filter(x => x.dataset.mod === 'morefluff').length && e.length) === mfj && await page.$eval('#content .mm-modsel', e => e.value) === 'morefluff', `?mod=morefluff opens filtered (${mfj})`);
	await page.type('#content .mc-search', 'blahaj');
	A(await page.$$eval('#content [data-key]', e => e.map(x => x.dataset.key).join()) === 'j_mf_blahaj', 'category search narrows (Blahaj)', await page.$$eval('#content [data-key]', e => e.map(x => x.dataset.key).join()));
	// ?item= finds its tab and clears a filter that would hide it
	await open('micatro-mods/new-consumables?mod=pokermon&item=c_mf_red', '.mc-hl', 1);
	A(await page.$eval('#content .mc-hl', e => e.dataset.key).catch(() => null) === 'c_mf_red' && await page.$eval('#content .mc-tabs .active', e => e.dataset.tab) === 'consumables-colour', '?item= on a category page: the right tab, highlighted');
	// blinds: More Fluff's DX bosses under Superbosses
	await open('micatro-mods/blinds', '[data-key]', 10);
	A(await page.$eval('#content', el => { const s = [...el.querySelectorAll('section')].find(x => /Superbosses/.test(x.textContent.slice(0, 40))); return !!s && !!s.querySelector('[data-key="bl_mf_needle_dx"]') && !s.querySelector('[data-key="bl_mf_bigger_blind"]'); }), 'blinds: the DX bosses are grouped as Superbosses');
	// every mod page: all items, and no raw / broken text (e.g. the Pokermon page's add-on links)
	for (const m of W.mods) {
		const n = m.total;
		await open('micatro-mods/mod/' + m.id, '[data-section] [data-key]', 1);
		await showAll();
		const ok = await page.waitForFunction(k => document.querySelectorAll('#content [data-section] [data-key]').length >= k, { timeout: 20000 }, n).then(() => true, () => false);
		const got = await page.$$eval('#content [data-section] [data-key]', e => e.length);
		A(ok && got === n, `#/micatro-mods/mod/${m.id}: all ${n} items drawn`, `got ${got}`);
		const t = await text();
		A(!RAW.test(t), `#/micatro-mods/mod/${m.id}: no raw / broken text`, rawAt(t));
	}
	await open('micatro-mods/mod/pokermon', '[data-section] [data-key]', 10);
	const addons = await page.$$eval('#content .mc-list li', li => { const x = li.find(e => /Add-ons for it/.test(e.textContent)); return x ? { text: x.textContent, links: [...x.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.textContent]) } : null; });
	A(addons && /Add-ons for it: Nacho's Pokermon Dip, Sonfive's Pokermon\+\./.test(addons.text) && addons.links.some(([hr, tx]) => hr === '#/micatro-mods/mod/nacho' && tx === "Nacho's Pokermon Dip"), 'pokermon: "Add-ons for it" lists named links (not ",https://…,,")', JSON.stringify(addons));
	await open('micatro-mods/mod/nacho', '[data-section] [data-key]', 10);
	A(await page.$$eval('#content .mc-list li a[href="#/micatro-mods/mod/pokermon"]', a => a.some(x => x.textContent === 'Pokermon')), 'nacho: "It needs Pokermon" is a named link');
	A(await page.$eval('#navMods', d => d.open) && await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micatro-mods/mod/nacho', 'sidebar: the By-mod list opens on a mod page, its link active');
	// the vanilla Micatro pages carry no mod items
	const modKeys = new Set(Object.values(files).flatMap(F => F.sections.flatMap(x => x.items.map(i => i.key))));
	for (const r of ['micatro', 'micatro/jokers', 'micatro/consumables', 'micatro/vouchers', 'micatro/boosters', 'micatro/tags', 'micatro/blinds', 'micatro/decks', 'micatro/stakes', 'micatro/hands', 'micatro/enhancements', 'micatro/challenges']) {
		await open(r, '.mc-hero, .lp-back', 1);
		const v = await page.evaluate(() => ({ keys: [...document.querySelectorAll('#content [data-key]')].map(x => x.dataset.key), tags: document.querySelectorAll('#content .mc-modtag, #content [data-mod]').length }));
		const leak = v.keys.filter(k => modKeys.has(k));
		A(v.keys.length > 0 || r === 'micatro', `vanilla #/${r}: drawn`);
		A(!leak.length && !v.tags, `vanilla #/${r}: no mod items`, leak.slice(0, 4).join(','));
	}
	A(await open('micatro', '.mc-crosslink', 1) && await page.$$eval('#content a[href^="#/micatro-mods"]', a => a.length) === 1 && await page.$$eval('#content a[href^="#/micatro/mod"]', a => a.length) === 0, 'vanilla overview: mods only as one cross-link to Micatro Mods');
	// the header search reads the compact index, not the 19 mod files
	{
		const modFiles = [];
		const onReq = r => { if (/\/data\/micatro_mods\//.test(r.url())) modFiles.push(r.url()); };
		page.on('request', onReq);
		await page.goto('about:blank'); // (a fresh document: nothing cached from the pages above)
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/search?q=bulbasaur`, { waitUntil: 'networkidle0' });
		const found = await page.waitForFunction(() => [...document.querySelectorAll('#content [data-group="micatro-mods"] a')].some(a => a.textContent === 'Bulbasaur' && a.getAttribute('href') === '#/micatro-mods/jokers?item=j_poke_bulbasaur'), { timeout: 15000 }).then(() => true, () => false);
		A(found, 'header search: finds a mod card (Bulbasaur -> #/micatro-mods/jokers?item=j_poke_bulbasaur)');
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/search?q=blahaj`, { waitUntil: 'networkidle0' });
		A(await page.waitForFunction(() => [...document.querySelectorAll('#content [data-group="micatro-mods"] a')].some(a => a.getAttribute('href') === '#/micatro-mods/jokers?item=j_mf_blahaj'), { timeout: 15000 }).then(() => true, () => false), 'header search: accent-folded name (Blåhaj)');
		A(modFiles.length === 0, 'header search: no mod file fetched (micatro_mods_search.json only)', modFiles.slice(0, 3).join(' '));
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/search?q=${encodeURIComponent('retrigger all played')}`, { waitUntil: 'networkidle0' });
		A(await page.waitForFunction(() => document.querySelectorAll('#content [data-group="micatro-mods"] a').length > 0, { timeout: 15000 }).then(() => true, () => false), 'header search: card text matches too (index carries the text)');
		page.off('request', onReq);
		await page.$eval('#search', e => { e.value = ''; });
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/micatro`, { waitUntil: 'networkidle0' });
	}
	// the header search finds mod cards and links them to their category page
	await page.type('#search', 'fleurons');
	A(await page.waitForFunction(() => location.hash.startsWith('#/search') && document.querySelector('#content [data-group="micatro-mods"] a'), { timeout: 15000 }).then(() => true, () => false), 'header search: opens #/search with Micatro Mods results');
	const hit = await page.$$eval('#content [data-group="micatro-mods"] a', a => a.map(x => [x.textContent, x.getAttribute('href')]));
	A(hit.some(([t, hr]) => t === 'Fleurons' && hr === '#/micatro-mods/hands?item=bunc_Fleurons'), 'header search: Fleurons (Bunco suit) -> its category page', JSON.stringify(hit.slice(0, 3)));
	await page.click('#content [data-group="micatro-mods"] a[href="#/micatro-mods/hands?item=bunc_Fleurons"]');
	A(await page.waitForSelector('#content .mc-hl', { timeout: 15000 }).then(el => el.evaluate(e => e.dataset.key), () => null) === 'bunc_Fleurons', 'header search result opens the category page with the card highlighted');
	await page.goto(`http://localhost:${PORT}/designwiki/index.html#/search?q=blueprint`, { waitUntil: 'networkidle0' });
	A(await page.waitForFunction(() => [...document.querySelectorAll('#content [data-group="micatro"] a')].some(a => a.getAttribute('href') === '#/micatro/jokers?item=j_blueprint'), { timeout: 15000 }).then(() => true, () => false), 'header search: vanilla Micatro cards too (Blueprint)');
	// the mod page shows credits, toggle info, systems and its fixes
	await open('micatro-mods/mod/milatro', '[data-section] [data-key]', 30);
	const mp = await page.evaluate(() => ({ text: document.getElementById('content').textContent, fixes: document.querySelectorAll('#content .mc-fixes li').length, active: (document.querySelector('#sidebar a.active') || {}).getAttribute?.('href') }));
	A(/Milan, Emilia & Emma/.test(mp.text) && /New Run → Mods/.test(mp.text) && /Fixed as the author intended/.test(mp.text) && mp.fixes === milatro.fixes.length, 'milatro page: credits, how to turn it on, its fixes', JSON.stringify({ fixes: mp.fixes }));
	A(mp.active === '#/micatro-mods/mod/milatro', 'nav: the mod’s own link is active', mp.active);
	A(!/\bnull\b/.test(mp.text.replace(/null_/g, '')), 'no stray "null" text on the page');
	const j = files.milatro.sections[0].items[3];
	const cell = await page.$eval(`#content [data-key="${j.key}"] .mc-spr`, el => ({ img: el.style.backgroundImage, pos: el.style.backgroundPosition }));
	const at = W.atlases[j.art[0][0].slice(1)];
	A(cell.img.includes(at.src) && cell.pos === `${-j.art[0][1].x * at.cw}px ${-j.art[0][1].y * at.ch}px`, `${j.name}: the tile is its own atlas cell`, JSON.stringify(cell));
	await page.type('#content .mc-search', 'hole in one');
	A(await page.$$eval('#content [data-section] [data-key]', e => e.map(x => x.dataset.key).join()) === 'j_mlnc_hole_in_one', 'search narrows the mod page');
	// ?item= scrolls to and highlights a card (Magepunk News links the old #/micatro/mod/<id>?item= form)
	await open('micatro/mod/bunco?item=tag_bunc_breaking', '.mc-hl', 1);
	A(await page.$eval('#content .mc-hl', e => e.dataset.key) === 'tag_bunc_breaking' && await page.evaluate(() => location.hash) === '#/micatro-mods/mod/bunco?item=tag_bunc_breaking', 'old #/micatro/mod/<id>?item= link: redirected, card highlighted');
	// feature pages
	const de = W.features.deckeditor;
	A(await open('micatro/deck-editor', 'table', de.params.length + de.rules.length + 1) && await page.$eval('#content', el => /Goth Deck/.test(el.textContent) && /Deck Creator/.test(el.textContent) && !/object HTML/.test(el.textContent)), 'deck editor page: settings, rules, examples');
	A(await open('micatro/big-numbers', 'table', 1) && await page.$eval('#content', el => /9\.99e999/.test(el.textContent) && /naneinf/.test(el.textContent)), 'big-number page');
	A(await open('micatro/replays', 'table', 1) && await page.$eval('#content', el => /\/mr\/<id>/.test(el.textContent) && /whole run/.test(el.textContent)), 'replays page');
	A(await open('micatro', '.mc-featlink', 3) && await page.$$eval('#content .mc-featlink', e => e.length) === 3 && await page.$$eval('#content .mc-idx', e => e.length) === 11, 'vanilla overview: its 11 categories + the 3 built-in feature pages');
	// phone
	await page.setViewport({ width: 390, height: 844 });
	for (const r of ['micatro-mods', 'micatro-mods/jokers', 'micatro-mods/jokers?mod=bunco', 'micatro-mods/new-consumables', 'micatro-mods/blinds', 'micatro-mods/modifiers', 'micatro-mods/challenges', 'micatro-mods/skins', 'micatro-mods/mod/bunco', 'micatro-mods/mod/pokermon', 'micatro/deck-editor', 'micatro/replays', 'search?q=joker']) {
		await open(r, '.lp-back, .mc-hero, .gallery-heading', 1);
		await new Promise(res => setTimeout(res, 150));
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
