// pocketenhanced_site_test.mjs — Pocket Enhanced on the rest of the site:
//   1. the design wiki's page (#/pocket-enhanced): its numbers and tables are the game's own (LIMITS, the type chart
//      from matchup(), the pack odds, the exchange, every booster); the sidebar link; no overflow on a phone
//   2. the profile page: a Pocket Enhanced section read from the account's collection (and "no cards yet" without one);
//      the page asks the server only to READ it
//   3. the bug report form offers Pocket Enhanced as an area, and the server keeps that area
//   4. the Battlecards learn page points to Pocket Enhanced's own teaching
//   node overworld/tests/pocketenhanced_site_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9581;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const E = await imp('pocketenhanced/js/engine/engine.js'), T = await imp('pocketenhanced/js/engine/types.js'), C = await imp('pocketenhanced/js/collection.js'), D = await imp('pocketenhanced/js/data/cards.js');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const STATE = { username: 'sitetester', friendCode: 'SITE01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
let pkcol = null; const asked = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch { }
		asked.push(b.action);
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'pkcol-get') return res.end(JSON.stringify({ rev: pkcol ? 3 : 0, col: pkcol, ids: [] }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], rows: [], gifts: [], messages: [] }));
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	const page = await browser.newPage(); await page.setViewport({ width: 1200, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'site-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);

	// ===== 1. the design wiki =====
	await page.goto(`http://localhost:${PORT}/designwiki/#/pocket-enhanced`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.pk-wiki-boosters')), 30000), 'the wiki page opens');
	const w = await page.evaluate(() => {
		const rows = sel => [...document.querySelectorAll(sel + ' tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
		return { text: document.getElementById('content').innerText, chart: rows('.pk-wiki-chart'), odds: rows('.pk-wiki-odds'), exch: rows('.pk-wiki-exchange'), boosters: rows('.pk-wiki-boosters'),
			nav: !!document.querySelector('nav a[href="#/pocket-enhanced"]'), play: !!document.querySelector('#content a[href="../pocketenhanced/"]') };
	});
	const L = E.LIMITS;
	A(w.text.includes(`${L.deck} cards, at most ${L.copies} of a name`) && w.text.includes(`${L.actives} Active slots and ${L.bench} Bench slots`) && w.text.includes(`for ${L.players[0]} to ${L.players[1]} players`) && w.text.includes(`${D.CARDS.length.toLocaleString()} cards`), "the match rules are stated with the engine's own limits and the card list's own size");
	A(w.chart.length === T.COMBAT_TYPES.length && T.COMBAT_TYPES.every((a, i) => w.chart[i][0] === a && w.chart[i][1] === (T.COMBAT_TYPES.filter(d => T.matchup(a, d) > 0).join(', ') || '—') && w.chart[i][2] === (T.COMBAT_TYPES.filter(d => T.matchup(a, d) < 0).join(', ') || '—')), `the type chart has all ${T.COMBAT_TYPES.length} types, each row the game's own matchups`);
	A(w.chart.find(r => r[0] === 'Fire')[1] === 'Grass, Ice, Bug, Steel' && w.chart.find(r => r[0] === 'Electric')[3] === 'Ground' && w.text.includes('+20 damage') && w.text.includes('-20 damage'), '(Fire is super effective into Grass, Ice, Bug and Steel; Electric into Ground is neutral; +20 and -20)');
	A(w.odds.length === Object.keys(C.SLOT_ODDS[5]).length && w.odds[0][1] === '90%' && w.odds[0][2] === '60%' && w.exch.length === Object.keys(C.EXCHANGE).length && w.exch.every(r => C.EXCHANGE[Object.keys(C.RARITY).find(k => C.RARITY[k] === r[0])] === +r[1]), "the pack odds and the exchange prices are the game's", [w.odds[0], w.exch]);
	A(w.boosters.length === C.BOOSTERS.length && C.BOOSTERS.every((x, i) => w.boosters[i][0] === x.name && w.boosters[i][1] === x.set), `every booster is listed (${C.BOOSTERS.length})`);
	A(w.nav && w.play, 'the sidebar links to the page, and the page to the game');
	await page.setViewport({ width: 390, height: 800 }); await sleep(300);
	A(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'on a phone the page does not overflow sideways', String(await page.evaluate(() => document.documentElement.scrollWidth)));
	await page.setViewport({ width: 1200, height: 900 });

	// ===== 1b. the rest of the wiki's section: cards, a card, printings, economy, decks =====
	const PK = await imp('pocketenhanced/js/data/packs.js'), LK = await imp('pocketenhanced/js/data/looks.js'), DK = await imp('pocketenhanced/js/decks.js'), TD = await imp('pocketenhanced/js/data/theme_decks.js'), ST = await imp('site/stars.js');
	const go = async (hash, sel) => { await page.evaluate(h2 => { location.hash = h2; }, hash); return waitFor(() => page.evaluate(sel2 => !!document.querySelector(sel2), sel), 20000); };
	const rowsOf = sel => page.evaluate(sel2 => [...document.querySelectorAll(sel2 + ' tbody tr')].map(tr => [...tr.children].map(td => td.textContent)), sel);
	A(await page.evaluate(() => ['', '/cards', '/printings', '/economy', '/decks'].every(p => !!document.querySelector(`nav a[href="#/pocket-enhanced${p}"]`)) && document.querySelectorAll('.pk-wiki-nav a').length === 4), 'the sidebar and the overview link to its five pages: how it works, cards, printings, economy, decks');
	// ---- the cards are a binder: pages of nine pockets, each holding a card drawn as the game draws it
	A(await go('#/pocket-enhanced/cards', '.pkb .pkb-page .pf .f'), 'the Cards page opens as a binder');
	await page.evaluate(() => document.fonts.ready); await sleep(900);
	const binder = () => page.evaluate(() => ({ pages: document.querySelectorAll('.pkb-page').length, cards: [...document.querySelectorAll('.pkb-page a.pkb-slot')].map(a => a.dataset.card), pockets: document.querySelectorAll('.pkb-page .pkb-slot').length, where: document.querySelector('.pkb-where').textContent, count: document.querySelector('.pkb-find .muted').textContent, prev: document.querySelector('[data-turn="prev"]').disabled, next: document.querySelector('[data-turn="next"]').disabled, rings: !!document.querySelector('.pkb-rings') }));
	let bd = await binder();
	const ids = D.CARDS.map(c => c.id), pagesWide = Math.ceil(ids.length / 18);
	A(bd.pages === 2 && bd.rings && bd.pockets === 18 && bd.cards.join() === ids.slice(0, 18).join() && bd.where === `Page 1 of ${pagesWide}` && bd.count === '2,485 cards' && bd.prev && !bd.next, `on a wide screen the binder lies open at two pages of nine pockets, rings between them: the first eighteen cards, page 1 of ${pagesWide}`, bd);
	const drawn = await page.evaluate(() => { const e = document.querySelector('.pkb-page a.pkb-slot[data-card="A1-001"]'), pf = e.querySelector('.pf'), f = pf.querySelector('.f.pk'), r = pf.getBoundingClientRect(), q = e.getBoundingClientRect(); return { name: f.querySelector('.hd .n').textContent, hp: f.querySelector('.hpn').textContent, atk: f.querySelector('.atk .an').textContent, ty: f.querySelector('.atk .tyl .ty').textContent, font: getComputedStyle(pf).fontFamily, fits: Math.abs(r.width - q.width) < 1.5 && Math.abs(r.height - q.height) < 2.5, ratio: +(r.height / r.width).toFixed(2), href: e.getAttribute('href'), over: f.scrollHeight > f.clientHeight + 1 }; });
	A(drawn.name === 'Bulbasaur' && drawn.hp === '70' && drawn.atk === 'Vine Whip' && drawn.ty === 'Grass' && /Cabin/.test(drawn.font) && drawn.fits && drawn.ratio === 1.4 && !drawn.over && drawn.href === '#/pocket-enhanced/cards/A1-001', "a pocket holds the card as the game draws it (Bulbasaur: name, HP, Vine Whip and its Grass tab, in the card font), filling its sleeve; it links to the card's page", drawn);
	await page.click('[data-turn="next"]'); await sleep(500); bd = await binder();
	A(bd.where === `Page 2 of ${pagesWide}` && bd.cards.join() === ids.slice(18, 36).join() && !bd.prev, 'the next arrow turns the page: the next eighteen cards');
	await page.keyboard.press('ArrowRight'); await sleep(450); await page.keyboard.press('ArrowLeft'); await sleep(450); await page.keyboard.press('ArrowLeft'); await sleep(450); bd = await binder();
	A(bd.where === `Page 1 of ${pagesWide}` && bd.prev, 'the arrow keys turn pages too (right, then left twice: back at the first)');
	await page.type('#content input[type=search]', 'charizard'); await sleep(500); bd = await binder();
	const zards = D.CARDS.filter(c => c.name.toLowerCase().includes('charizard'));
	A(bd.cards.join() === zards.slice(0, 18).map(c => c.id).join() && bd.count === `${zards.length} cards` && bd.pockets === 18 && bd.where === `Page 1 of ${Math.ceil(zards.length / 18)}`, `searching "charizard" fills the binder with the ${zards.length} Charizard cards (the pockets left over stay empty)`, bd);
	await page.evaluate(() => { const i2 = document.querySelector('#content input[type=search]'); i2.value = ''; i2.dispatchEvent(new Event('input')); const s2 = document.querySelector('#content select'); s2.value = 'Darkness'; s2.dispatchEvent(new Event('change')); }); await sleep(500); bd = await binder();
	const dark = D.CARDS.filter(c => c.cardType === 'Darkness' || c.cardType2 === 'Darkness');
	A(bd.count === `${dark.length} cards` && bd.cards.join() === dark.slice(0, 18).map(c => c.id).join() && dark.some(c => c.id === 'C1-042') && D.card('C1-042').cardType === 'Water', `the type filter: the ${dark.length} Darkness cards (Mega Greninja ex, printed Water and Darkness, among them)`);
	await page.evaluate(() => { const s2 = document.querySelector('#content select'); s2.value = ''; s2.dispatchEvent(new Event('change')); }); await sleep(400);
	await page.click('.pkb-page a.pkb-slot[data-card="A1-004"]');
	A(await waitFor(() => page.evaluate(() => location.hash === '#/pocket-enhanced/cards/A1-004' && !!document.querySelector('.pkb-shelf .pf .f')), 8000), "pressing a card in the binder opens that card's page");
	// one page at a time on a phone, and a swipe turns it
	await page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true }); await go('#/pocket-enhanced/cards', '.pkb .pkb-page .pf .f'); await sleep(900); bd = await binder();
	A(bd.pages === 1 && !bd.rings && bd.pockets === 9 && bd.cards.join() === ids.slice(0, 9).join() && bd.where === `Page 1 of ${Math.ceil(ids.length / 9)}` && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'on a phone the binder shows one page of nine, and nothing overflows sideways', bd);
	const bx = await page.evaluate(() => { const e = document.querySelector('.pkb'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
	const swipe = async (x0, x1) => { const y = bx[1] + bx[3] / 2; await page.touchscreen.touchStart(x0, y); for (let k = 1; k <= 6; k++) { await page.touchscreen.touchMove(x0 + (x1 - x0) * k / 6, y); await sleep(20); } await page.touchscreen.touchEnd(); await sleep(500); };
	await swipe(bx[0] + bx[2] * 0.8, bx[0] + bx[2] * 0.2); bd = await binder();
	A(/^Page 2 of/.test(bd.where) && bd.cards.join() === ids.slice(9, 18).join(), 'a swipe to the left turns to the next page');
	await swipe(bx[0] + bx[2] * 0.2, bx[0] + bx[2] * 0.8); bd = await binder();
	A(/^Page 1 of/.test(bd.where), 'and a swipe to the right turns back');
	await page.setViewport({ width: 1200, height: 900 });
	A(await go('#/pocket-enhanced/cards/A1-036', '.pk-wiki-prints tbody tr'), "a card's page opens");
	const zard = { text: await page.evaluate(() => document.getElementById('content').innerText), moves: await rowsOf('.pk-wiki-moves'), prints: await rowsOf('.pk-wiki-prints') }, zc = D.card('A1-036');
	A(/Stage 2, evolves from Charmeleon/.test(zard.text) && /HP: 180/.test(zard.text) && /Combat Types: Fire, Flying/.test(zard.text) && /worth 2 points/.test(zard.text) && /Printed Weakness: Water \(not used in this game\)/.test(zard.text), 'Charizard ex: its stage, HP, types, points, and that its printed Weakness is not used', zard.text.slice(0, 300));
	A(zard.moves.length === 2 && zard.moves[0].join('|') === 'Slash|Fire, Colorless, Colorless|60|Normal|' && zard.moves[1][0] === 'Crimson Storm' && zard.moves[1][2] === '200' && zard.moves[1][3] === 'Fire' && zard.moves[1][4] === 'Discard 2 Fire Energy from this Pokémon.', "its attacks as they play here: cost, damage, Combat Type and text (Energy written out)", zard.moves);
	A(zard.prints.length === zc.printings.length && zard.prints.map(r => r[0]).join() === zc.printings.join() && zard.prints.find(r => r[0] === 'A1-280')[2] === 'Immersive' && zard.prints.find(r => r[0] === 'A1-284')[2] === 'Gold' && zard.prints.find(r => r[0] === 'A1-284')[1] === '♛' && zard.prints[0][2] === 'Standard' && /Charizard \(Genetic Apex\)/.test(zard.prints[0][3]), `every printing of it (${zc.printings.length}): its rarity, how it is drawn and which booster holds it`, zard.prints);
	const shelf = await page.evaluate(() => [...document.querySelectorAll('.pkb-shelf figure')].map(g => ({ id: g.querySelector('.pkb-slot').dataset.print, face: g.querySelector('.f').className, cap: g.querySelector('figcaption').textContent })));
	A(shelf.length === zc.printings.length && shelf.map(x => x.id).join() === zc.printings.join() && !/lk-/.test(shelf[0].face) && /lk-immersive/.test(shelf.find(x => x.id === 'A1-280').face) && /lk-gold/.test(shelf.find(x => x.id === 'A1-284').face) && /Gold/.test(shelf.find(x => x.id === 'A1-284').cap), `its ${zc.printings.length} printings side by side, each drawn as itself (the standard card, the immersive one, the gold one)`, shelf.map(x => x.id + ' ' + x.face));
	A(await go('#/pocket-enhanced/cards/A1-223', '.pk-wiki-text') && await page.evaluate(() => /\+10 damage/.test(document.querySelector('.pk-wiki-text').textContent) && /Kind: Supporter/.test(document.getElementById('content').innerText)), "a Trainer's page: its kind and what it does");
	await page.evaluate(() => { location.hash = '#/pocket-enhanced/cards/NOPE-999'; }); await sleep(500);
	A(await page.evaluate(() => /Not found/.test(document.getElementById('content').textContent)), 'a card that does not exist: Not found');
	A(await go('#/pocket-enhanced/printings', '.pk-wiki-kinds tbody tr'), 'the Printings page opens');
	const kinds = await rowsOf('.pk-wiki-kinds'), count = k => PK.PRINTS.filter(p => (LK.LOOKS[p[0]] || (/F$/.test(p[2]) ? 'foil' : 'standard')) === k).length;
	const KN = { Standard: 'standard', 'Reverse holo': 'foil', Illustration: 'art', 'Full art': 'full', Rainbow: 'rainbow', Immersive: 'immersive', Gold: 'gold', Shiny: 'shiny', 'Shiny full art': 'shinyfull', Anomaly: 'anomaly' };
	A(kinds.length === 10 && kinds.every(r => KN[r[0]] && +r[2].replace(/,/g, '') === count(KN[r[0]])) && kinds.reduce((a, r) => a + +r[2].replace(/,/g, ''), 0) === PK.PRINTS.length, `the ten kinds of printing, each with the game's own count (they add up to all ${PK.PRINTS.length.toLocaleString()} printings)`, kinds.map(r => r[0] + ' ' + r[2]));
	A(await go('#/pocket-enhanced/economy', '.pk-wiki-pays tbody tr'), 'the Economy page opens');
	const eco = await page.evaluate(() => document.getElementById('content').innerText), pays = await rowsOf('.pk-wiki-pays'), n0 = C.newCollection();
	A(eco.includes(`a pack costs ${ST.STARS_PER_PACK} ★`) && pays.some(r => r[0] === 'Winning a match' && r[1] === `${C.PACK_FOR_WIN * ST.STARS_PER_PACK} ★`) && pays.length === 6, 'stars: what a pack costs and what pays them, from the game', pays);
	A(eco.includes(`${C.START_OF_EACH} of each of the ${C.BOOSTERS.length} boosters (${C.ownPacks(n0)} packs)`) && eco.includes('Charizard, Blastoise, Venusaur and Pikachu decks (80 cards)') && /1 in 10/.test(eco) && /Vermilion Pokémon Fan Club/.test(eco), 'a new player (four decks, five packs of each booster), the catch card (1 in 10) and the way in from the overworld');
	const { CATCH_CARD_CHANCE } = await (async () => { globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => { }, removeItem: () => { } }; return imp('overworld/ow_pocketcard.js'); })();
	A(CATCH_CARD_CHANCE === 0.1, "(the game's own chance is 1 in 10)");
	A(await go('#/pocket-enhanced/decks', '.pk-wiki-theme tbody tr'), 'the Decks page opens');
	const ready = await rowsOf('.pk-wiki-ready'), theme = await rowsOf('.pk-wiki-theme');
	A(ready.length === DK.STARTERS.length && ready.filter(r => r[1] === 'Always playable').map(r => r[0]).sort().join() === 'Blastoise,Charizard,Pikachu,Venusaur' && /2× Charmander/.test(ready.find(r => r[0] === 'Charizard')[3]) && await page.evaluate(() => !!document.querySelector('.pk-wiki-ready a[href^="#/pocket-enhanced/cards/"]')), `the ${DK.STARTERS.length} ready-made decks with their cards (linked), the four starter decks marked always playable`);
	A(theme.reduce((a, r) => a + +r[1], 0) === TD.THEME_DECKS.length && theme.length === new Set(TD.THEME_DECKS.map(t => t.set)).size, `Pocket's own ${TD.THEME_DECKS.length} decks, by set`);
	await page.setViewport({ width: 390, height: 800 }); await sleep(300);
	for (const hsh of ['#/pocket-enhanced/cards', '#/pocket-enhanced/cards/A1-036', '#/pocket-enhanced/printings', '#/pocket-enhanced/economy', '#/pocket-enhanced/decks']) { await page.evaluate(h2 => { location.hash = h2; }, hsh); await sleep(700); A(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `on a phone ${hsh} does not overflow sideways`, String(await page.evaluate(() => document.documentElement.scrollWidth))); }
	await page.setViewport({ width: 1200, height: 900 });

	// ===== 2. the profile =====
	asked.length = 0;
	await page.goto(`http://localhost:${PORT}/profile/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => /No cards yet/.test(document.getElementById('pocket-stats')?.textContent || '')), 20000), 'a player with no Pocket Enhanced collection: "No cards yet", with a link to play');
	const start = C.newCollection(), mine = { ...start, opened: 4, packs: 2, prints: { ...start.prints, 'A1-036': 1 } };
	pkcol = mine;
	await page.reload({ waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => document.querySelectorAll('#pocket-stats .stat').length === 4), 30000), 'with a collection: four figures');
	const tiles = await page.evaluate(() => [...document.querySelectorAll('#pocket-stats .stat .v')].map(x => x.textContent));
	const clean = C.cleanCollection(mine), total = Object.values(clean.prints).reduce((a, b) => a + b, 0);
	A(tiles[0] === C.uniqueOwned(clean).toLocaleString() && tiles[1] === total.toLocaleString() && tiles[2] === '4' && tiles[3] === '2', 'different cards, total copies, packs opened and unopened, from the account', tiles);
	A(asked.includes('pkcol-get') && !asked.some(a => /^pk.*-put$/.test(a || '')), 'the profile only reads the collection', asked.filter(a => /^pk/.test(a || '')));

	// ===== 3. bug reports =====
	await page.goto(`http://localhost:${PORT}/bugs/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => [...document.querySelectorAll('#area option')].some(o => o.value === 'pocketenhanced' && o.textContent === 'Pocket Enhanced')), 10000), 'the bug report form offers Pocket Enhanced');
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'latin1');
	A(/\['overworld', 'battlecards', 'pocketenhanced', 'site'\]\.includes\(body\.area\)/.test(src), 'and the server keeps that area (it used to file any other area as "overworld")');

	// ===== 4. the learn page =====
	await page.goto(`http://localhost:${PORT}/learnmagepunk/`, { waitUntil: 'domcontentloaded' });
	A(await page.evaluate(() => { const p = document.querySelector('.pk-pointer'); return !!p && !!p.querySelector('a[href="/pocketenhanced/"]') && !!p.querySelector('a[href="/designwiki/#/pocket-enhanced"]'); }), "the learn page points to Pocket Enhanced's own teaching and its wiki page");
	A(!errors.length, 'no page errors', errors.slice(0, 4).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
