// site_ui_wiki_learn_test.mjs — the design wiki (designwiki/) and Learn Magepunk (learnmagepunk/) in the site's Balatro look
// (the kit: site/ui/balatro.css + site/ui/sfx.js; owner 2026-11-19 "redo every UI ... into the balatro style").
//   KIT    every page adopts the kit: <body class="bal-page"> (the felt, the m6x11 font), the kit's stylesheet loaded, and its
//          colours come from the --bal-* tokens (read from site/ui/balatro.css itself): the page background, the header, the
//          nav panel, the chosen nav tab (red), tiles (the panel), table rows, fields (the dark well), the buttons (.bal-btn in
//          their colour), Micatro's card text on white, the owner's tools (the purple-rimmed panel, a green Submit)
//   SOUND  the main buttons press with a sound (WebAudio spied at AudioBufferSourceNode.start): the gallery's Clear filters, a
//          size tab, the owner's "File for next version", the joker page's Show Shiny / Submit design, Learn's Play button and
//          a contents link; nothing plays before the first press (no music, no autoplay)
//   STILL  what the pages did before still works: the wiki routes render (index, Pokédex, moves, card gallery + a card page,
//          the Pokermon joker list + a card page with the owner-only box, Micatro jokers + consumable tabs, search), a size tab
//          still switches, Show Shiny still swaps the art, the owner box shows only for the owner; no page errors; no
//          sideways scroll at 390 px; Learn's sections and glossary are all there
//   node overworld/tests/site_ui_wiki_learn_test.mjs      (SHOTS=<dir>: desktop + 390 px screenshots of every page)
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const SHOTS = process.env.SHOTS || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(80); } return false; }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const API = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) {
		let body = ''; for await (const c of req) body += c;
		try { API.push(JSON.parse(body || '{}').action); } catch { API.push('?'); }
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, designs: [], stickers: {}, state: { username: 'mgibbie' } }));
	}
	const f = u === '/' ? '/index.html' : u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// the kit's tokens, from the file itself
const KIT = (() => { try { return fs.readFileSync(path.join(ROOT, 'site/ui/balatro.css'), 'utf8'); } catch { return ''; } })();
const TOK = {}; for (const m of KIT.matchAll(/--bal-([a-z0-9-]+):\s*(#[0-9a-f]{3,8})/gi)) TOK[m[1]] = m[2].toLowerCase();
const rgb = (hex) => { const h = (hex || '#000000').slice(1); const n = (i) => parseInt(h.slice(i, i + 2), 16); return `rgb(${n(0)}, ${n(2)}, ${n(4)})`; };
A(TOK.panel && TOK.bg && TOK.red, 'the kit (site/ui/balatro.css) is there with its tokens', Object.keys(TOK).length);
const T = k => rgb(TOK[k]);

// spy on WebAudio before any page script (the kit plays its .ogg through AudioBufferSourceNode.start)
const SPY = (owner) => {
	window.__au = { starts: 0 };
	const st = AudioBufferSourceNode.prototype.start;
	AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts++; return st.apply(this, a); };
	if (owner) { localStorage.setItem('magepunk_mp_token_v1', 'tok'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'mgibbie', collection: {} })); }
	// a pressed link must not leave the page under test
	addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href]'); if (a && !a.getAttribute('href').startsWith('#')) e.preventDefault(); });
};

const DESK = { width: 1600, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(url, { vp = DESK, owner = false } = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.setRequestInterception(true);
	// nothing leaves the test server; the gallery's card faces (battlecards/cardart.js) import three from the CDN only for
	// textures, so a stub stands in for it
	page.on('request', r => {
		const u = new URL(r.url());
		if (/\/three@[^/]+\/build\/three\.module\.js$/.test(u.pathname)) return r.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: 'export class CanvasTexture {}; export const SRGBColorSpace = "srgb";' }).catch(() => {});
		if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') r.abort().catch(() => {}); else r.continue().catch(() => {});
	});
	await page.evaluateOnNewDocument(SPY, owner);
	await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => document.fonts.ready);
	return { ctx, page, errors };
}
const starts = page => page.evaluate(() => window.__au.starts);
// press: a real click (a user gesture), then wait for the sound to start (the kit decodes its .ogg first)
async function pressSounds(page, sel, label) {
	const before = await starts(page);
	const el = await page.$(sel);
	if (!el) { A(false, label + ': the button is there', sel); return false; }
	await el.click();
	const ok = await waitFor(async () => (await starts(page)) > before, 4000);
	A(ok, label + ' presses with a sound');
	return ok;
}
const look = (page, sel, props) => page.evaluate((sel, props) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return Object.fromEntries(props.map(p => [p, cs[p]])); }, sel, props);
async function kitPage(page, tag) {
	const k = await page.evaluate(() => ({
		cls: document.body.classList.contains('bal-page'),
		sheet: [...document.styleSheets].some(s => /\/site\/ui\/balatro\.css/.test(s.href || '')),
		font: getComputedStyle(document.body).fontFamily,
		loaded: document.fonts.check('20px m6x11'),
		bg: getComputedStyle(document.body).backgroundColor,
		img: getComputedStyle(document.body).backgroundImage,
		wide: document.documentElement.scrollWidth - innerWidth,
		sounds: window.__au.starts,
	}));
	A(k.cls && k.sheet, `${tag}: adopts the kit (body.bal-page, site/ui/balatro.css loaded)`, JSON.stringify({ cls: k.cls, sheet: k.sheet }));
	A(/m6x11/.test(k.font) && k.loaded, `${tag}: set in the Balatro font (m6x11)`, k.font);
	A(k.bg === T('bg') && /radial-gradient/.test(k.img), `${tag}: the felt background (--bal-bg + the felt gradient)`, k.bg);
	A(k.sounds === 0, `${tag}: no sound before a press (no music, nothing on load)`, k.sounds);
	return k;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };

try {
	// ============================================================ the wiki shell + index
	for (const [vname, vp] of [['desktop', DESK], ['phone', PHONE]]) {
		const t = await open('/designwiki/#/', { vp });
		await waitFor(() => t.page.evaluate(() => document.querySelector('#content') && !/Loading/.test(document.querySelector('#content').textContent)), 15000);
		const k = await kitPage(t.page, `wiki ${vname}`);
		A(k.wide <= 1, `wiki ${vname}: no sideways scroll`, k.wide);
		const hd = await look(t.page, 'header', ['backgroundColor']);
		A(hd && hd.backgroundColor === T('panel-dd'), `wiki ${vname}: the header is the dark panel (--bal-panel-dd)`, hd && hd.backgroundColor);
		const sb = await look(t.page, '#sidebar', ['backgroundColor']);
		A(sb && sb.backgroundColor === T('panel'), `wiki ${vname}: the nav is the kit's panel (--bal-panel)`, sb && sb.backgroundColor);
		const se = await look(t.page, '#search', ['backgroundColor', 'fontFamily']);
		A(se && se.backgroundColor === T('panel-dd') && /m6x11/.test(se.fontFamily), `wiki ${vname}: the search box is the kit's field (the dark well)`, JSON.stringify(se));
		await shot(t.page, `wiki_index_${vname}`);
		if (vname === 'phone') {
			const tg = await look(t.page, '#navToggle', ['backgroundColor', 'display']);
			A(tg && tg.display !== 'none' && tg.backgroundColor === T('orange'), 'wiki phone: the menu button is an orange kit button', JSON.stringify(tg));
			await pressSounds(t.page, '#navToggle', 'wiki phone: the menu button');
			A(await waitFor(() => t.page.evaluate(() => document.body.classList.contains('nav-open')), 2000), 'wiki phone: ...and still opens the nav drawer');
			await sleep(300); await shot(t.page, 'wiki_drawer_phone');
		}
		await t.ctx.close();
		A(!t.errors.length, `wiki ${vname}: no page errors`, t.errors.join(' | '));
	}

	// ============================================================ lists: Pokédex, moves; nav tab; search
	{
		const t = await open('/designwiki/#/pokemon');
		A(await waitFor(() => t.page.$('.dex-tile'), 20000), 'Pokédex: the national dex tiles render');
		const tile = await look(t.page, '.dex-tile', ['backgroundColor', 'boxShadow']);
		A(tile && tile.backgroundColor === T('panel') && /\d+px/.test(tile.boxShadow), 'Pokédex: a tile is the kit panel (--bal-panel, a lip under it)', JSON.stringify(tile));
		const act = await look(t.page, '#sidebar a.active', ['backgroundColor', 'color']);
		A(act && act.backgroundColor === T('red'), 'nav: the page you are on is the chosen (red) tab', JSON.stringify(act));
		const n0 = await starts(t.page);
		await t.page.click('#sidebar a[href="#/moves"]');
		A(await waitFor(async () => (await starts(t.page)) > n0, 4000), 'nav: a nav link presses with a sound');
		A(await waitFor(() => t.page.$('#content a.card'), 20000), 'Moves: the moves list renders');
		const mv = await look(t.page, '#content a.card', ['backgroundColor']);
		A(mv && mv.backgroundColor === T('panel'), 'Moves: a move is a kit panel tile', mv && mv.backgroundColor);
		await t.page.goto(`http://localhost:${PORT}/designwiki/#/controls`, { waitUntil: 'domcontentloaded' });
		A(await waitFor(() => t.page.$('#content table td'), 20000), 'Controls: its tables render');
		const td = await look(t.page, '#content table td', ['backgroundColor']);
		const th = await look(t.page, '#content table th', ['backgroundColor']);
		A(td && td.backgroundColor === T('panel-d') && th && th.backgroundColor === T('panel-dd'), 'Controls: table rows are the kit\'s rows (--bal-panel-d, headings --bal-panel-dd)', JSON.stringify([td, th]));
		await shot(t.page, 'wiki_controls_desktop');
		await shot(t.page, 'wiki_moves_desktop');
		await t.page.goto(`http://localhost:${PORT}/designwiki/#/search?q=pika`, { waitUntil: 'domcontentloaded' });
		A(await waitFor(() => t.page.evaluate(() => /Pikachu/.test(document.querySelector('#content').textContent)), 20000), 'search: #/search?q=pika finds Pikachu');
		await shot(t.page, 'wiki_search_desktop');
		await t.ctx.close();
		A(!t.errors.length, 'lists: no page errors', t.errors.join(' | '));
	}

	// ============================================================ card gallery + a card page with the owner's note box
	{
		const t = await open('/designwiki/#/cards?class=paladin', { owner: true });
		A(await waitFor(() => t.page.$('.clear-filters'), 25000), 'Card Gallery: renders with its filters');
		const cf = await look(t.page, '.filter-actions .clear-filters, .clear-filters', ['backgroundColor', 'fontFamily']);
		A(cf && cf.backgroundColor === T('red') && /m6x11/.test(cf.fontFamily), 'Card Gallery: Clear all filters is a red kit button', JSON.stringify(cf));
		const sel = await look(t.page, '.adv-select', ['backgroundColor']);
		A(sel && sel.backgroundColor === T('panel-dd'), 'Card Gallery: the filter selects are kit fields (the dark well)', sel && sel.backgroundColor);
		await shot(t.page, 'wiki_cards_desktop');
		await pressSounds(t.page, '.clear-filters', 'Card Gallery: Clear all filters');
		A(await waitFor(() => t.page.evaluate(() => !/class=/.test(location.hash)), 3000), 'Card Gallery: ...and still clears the filters', await t.page.evaluate(() => location.hash));
		await t.page.goto(`http://localhost:${PORT}/designwiki/#/cards/white_knight`, { waitUntil: 'domcontentloaded' });
		A(await waitFor(() => t.page.$('.owner-todo .todo-submit'), 20000), 'card page: the owner sees the New Version box');
		const box = await look(t.page, '.owner-todo', ['backgroundColor', 'boxShadow']);
		A(box && box.backgroundColor === T('panel') && box.boxShadow.includes(T('purple')), 'card page: the owner box is the kit panel with a purple rim', JSON.stringify(box));
		const sub = await look(t.page, '.owner-todo .todo-submit', ['backgroundColor']);
		A(sub && sub.backgroundColor === T('green'), 'card page: "File for next version" is a green kit button', sub && sub.backgroundColor);
		const kw = await look(t.page, '.card-page a.tag-chip', ['backgroundColor', 'color']);
		A(kw && kw.color === 'rgb(255, 255, 255)' && kw.backgroundColor !== 'rgba(0, 0, 0, 0)', 'card page: its tags are kit badges (a coloured block, white text)', JSON.stringify(kw));
		const ta = await look(t.page, '.owner-todo .todo-text', ['backgroundColor']);
		A(ta && ta.backgroundColor === T('panel-dd'), 'card page: the note field is a kit field', ta && ta.backgroundColor);
		await shot(t.page, 'wiki_card_owner_desktop');
		await pressSounds(t.page, '.owner-todo .todo-submit', 'card page: File for next version');
		A(await t.page.evaluate(() => /write the note first/.test(document.querySelector('.owner-todo').textContent)), 'card page: ...and an empty note is still refused (nothing filed)');
		await t.ctx.close();
		A(!t.errors.length, 'cards: no page errors', t.errors.join(' | '));
	}

	// ============================================================ Pokermon joker list + a card page with "Submit design"
	for (const [vname, vp] of [['desktop', DESK], ['phone', PHONE]]) {
		const t = await open('/designwiki/#/pokermon-jokers', { vp, owner: true });
		A(await waitFor(() => t.page.$('.pj-tile'), 20000), `jokers ${vname}: the list renders`);
		const pt = await look(t.page, '.pj-tile', ['backgroundColor']);
		A(pt && pt.backgroundColor === T('panel'), `jokers ${vname}: a joker tile is the kit panel`, pt && pt.backgroundColor);
		await shot(t.page, `wiki_jokers_${vname}`);
		await t.page.goto(`http://localhost:${PORT}/designwiki/#/pokermon-jokers/-1`, { waitUntil: 'domcontentloaded' });
		A(await waitFor(() => t.page.$('#pjSubmit'), 20000), `jokers ${vname}: a card page shows the owner's Submit design box`);
		const sb = await look(t.page, '#pjSubmit', ['backgroundColor']);
		A(sb && sb.backgroundColor === T('green'), `jokers ${vname}: Submit design is a green kit button`, sb && sb.backgroundColor);
		const rs = await look(t.page, '#pjRarity', ['backgroundColor', 'fontFamily']);
		A(rs && rs.backgroundColor === T('panel-dd'), `jokers ${vname}: the rarity select is a kit field`, JSON.stringify(rs));
		const k = await t.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		A(k <= 1, `jokers ${vname}: no sideways scroll`, k);
		await shot(t.page, `wiki_joker_owner_${vname}`);
		const src0 = await t.page.$eval('.pj-art-big', i => i.src);
		await pressSounds(t.page, '.pj-flip', `jokers ${vname}: Show Shiny`);
		A(await waitFor(() => t.page.$eval('.pj-art-big', (i, s) => i.src !== s && /shiny/.test(i.src), src0), 2000), `jokers ${vname}: ...and still swaps to the Shiny art`);
		await t.ctx.close();
		A(!t.errors.length, `jokers ${vname}: no page errors`, t.errors.join(' | '));
	}
	{	// not the owner: no box (unchanged)
		const t = await open('/designwiki/#/pokermon-jokers/-1');
		A(await waitFor(() => t.page.$('.pj-art-big'), 20000) && !(await t.page.$('#pjSubmit')), 'jokers: signed out, no Submit design box');
		await t.ctx.close();
	}

	// ============================================================ Micatro: tiles with card text on white; consumable tabs
	{
		const t = await open('/designwiki/#/micatro/consumables');
		A(await waitFor(() => t.page.$('.mc-tile .mc-desc'), 20000), 'Micatro consumables: render');
		const d = await look(t.page, '.mc-tile .mc-desc', ['backgroundColor', 'color']);
		A(d && d.backgroundColor === 'rgb(255, 255, 255)' && d.color === T('text-dark'), 'Micatro: card text sits on white in the kit\'s dark text (as the game\'s tooltips)', JSON.stringify(d));
		const tabs = await t.page.$$('.lq-sizebtn[data-tab]');
		A(tabs.length >= 2, 'Micatro: the Tarot / Planet / Spectral tabs are there', tabs.length);
		const on = await look(t.page, '.lq-sizebtn.active', ['backgroundColor']);
		A(on && on.backgroundColor === T('red'), 'Micatro: the chosen tab is red (the kit\'s chosen segment)', on && on.backgroundColor);
		const off = await look(t.page, '.lq-sizebtn:not(.active)', ['backgroundColor']);
		A(off && off.backgroundColor === T('grey'), 'Micatro: the other tabs are grey kit buttons', off && off.backgroundColor);
		const key = await t.page.$eval('.lq-sizebtn:not(.active)', b => b.dataset.tab);
		await pressSounds(t.page, '.lq-sizebtn:not(.active)', 'Micatro: a consumable tab');
		A(await waitFor(() => t.page.$eval(`.lq-sizebtn[data-tab="${key}"]`, b => b.classList.contains('active')), 2000), 'Micatro: ...and the tab still switches');
		await shot(t.page, 'wiki_micatro_desktop');
		await t.ctx.close();
		A(!t.errors.length, 'micatro: no page errors', t.errors.join(' | '));
	}

	// ============================================================ Learn Magepunk
	for (const [vname, vp] of [['desktop', DESK], ['phone', PHONE]]) {
		const t = await open('/learnmagepunk/', { vp });
		await sleep(300);
		const k = await kitPage(t.page, `learn ${vname}`);
		A(k.wide <= 1, `learn ${vname}: no sideways scroll`, k.wide);
		const L = await t.page.evaluate(() => ({
			sections: document.querySelectorAll('main section').length,
			kws: document.querySelectorAll('.kw-grid .kw').length,
			toc: document.querySelectorAll('nav.toc a').length,
			play: (() => { const b = document.querySelector('.cta.primary'); if (!b) return null; const c = getComputedStyle(b); return { btn: b.classList.contains('bal-btn'), bg: c.backgroundColor, font: c.fontFamily, color: c.color }; })(),
			panel: (() => { const p = document.querySelector('.panel'); return p && getComputedStyle(p).backgroundColor; })(),
			toc0: getComputedStyle(document.querySelector('nav.toc')).backgroundColor,
			td: (() => { const d = document.querySelector('main table td'); return d && getComputedStyle(d).backgroundColor; })(),
			kwdd: (() => { const d = document.querySelector('.kw dd'); return d && [getComputedStyle(d).backgroundColor, getComputedStyle(d).color]; })(),
		}));
		A(L.sections >= 14 && L.kws > 100 && L.toc >= 14, `learn ${vname}: every section, the contents and the glossary are there`, JSON.stringify({ s: L.sections, k: L.kws, t: L.toc }));
		A(L.play && L.play.btn && L.play.bg === T('blue') && L.play.color === 'rgb(255, 255, 255)' && /m6x11/.test(L.play.font), `learn ${vname}: Play Battlecards is a blue kit button (white text)`, JSON.stringify(L.play));
		A(L.panel === T('panel') && L.toc0 === T('panel'), `learn ${vname}: panels and the contents are the kit panel`, L.panel + ' / ' + L.toc0);
		A(L.td === T('panel-d'), `learn ${vname}: table rows are the kit's rows`, L.td);
		A(L.kwdd && L.kwdd[0] === 'rgb(255, 255, 255)' && L.kwdd[1] === T('text-dark'), `learn ${vname}: a keyword's text is on white (the kit's tooltip)`, JSON.stringify(L.kwdd));
		await shot(t.page, `learn_${vname}`);
		await pressSounds(t.page, '.cta.primary', `learn ${vname}: Play Battlecards`);
		await pressSounds(t.page, 'nav.toc a[href="#glossary"]', `learn ${vname}: a contents link`);
		A(await waitFor(() => t.page.evaluate(() => location.hash === '#glossary'), 2000), `learn ${vname}: ...and the contents link still jumps to its section`);
		await t.ctx.close();
		A(!t.errors.length, `learn ${vname}: no page errors`, t.errors.join(' | '));
	}
} catch (e) {
	A(false, 'the run threw', e && e.stack);
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
