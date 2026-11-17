// pocketenhanced_deckprints_test.mjs — a deck holds a chosen PRINTING of each card, and a match draws that printing
// (owner, 2026-11-17: "i dont want your best printing to be shown in matches it is whatever printing you chose to put
// in the deck").
//   1. the rule (engine cleanPrints): a printing is kept only where it is one of that card's own and the card is in the
//      deck; saved decks keep it (decklist cleanDecks) and two decks that differ only in it are not the same deck
//   2. it changes nothing in play: the same seed and actions reach the same position with and without it; and it is in
//      every seat's view of that player (as a card across a real table is seen)
//   3. the deck builder: a card owned in more than one printing has a "printing" row; the picker lists the printings
//      owned, the standard one chosen; choosing one shows on the row; the saved deck has it; a card owned in one
//      printing has no row
//   4. a match with that deck: my hand card and my Pokémon on the mat are drawn as the printing in the deck (not the best
//      one I own); the inspect view names it; the computer player's cards are the standard ones
//   5. a printing no longer owned (traded away) goes back to the standard card; the deck is still playable
//   node overworld/tests/pocketenhanced_deckprints_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9587, SHOTS = process.env.POCKET_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const E = await imp('pocketenhanced/js/engine/engine.js'), DL = await imp('pocketenhanced/js/decklist.js'), C = await imp('pocketenhanced/js/collection.js'), { starterDeck } = await imp('pocketenhanced/js/decks.js'), { nextAction } = await imp('pocketenhanced/js/ai.js');

// ===== 1. the rule =====
const zard = starterDeck('charizard'), J = JSON.stringify;
A(J(E.cleanPrints({ 'A1-036': 'A1-284' }, zard.deck)) === '{"A1-036":"A1-284"}', "the gold printing of Charizard ex, for a deck that holds Charizard ex: kept");
A(J(E.cleanPrints({ 'A1-036': 'A1-227', 'A1-033': 'A1-284' }, zard.deck)) === '{}', "a printing of another card is dropped (Bulbasaur's art on Charizard ex; Charizard ex's on Charmander)");
A(J(E.cleanPrints({ 'A1-001': 'A1-227' }, zard.deck)) === '{}' && J(E.cleanPrints({ 'A1-036': 'A1-036' }, zard.deck)) === '{}', 'a card that is not in the deck is dropped; the standard printing needs no entry');
A(J(E.cleanPrints(null, zard.deck)) === '{}' && J(E.cleanPrints({ 'A1-036': 7, x: 'y', 'A1-037': null }, zard.deck)) === '{}' && J(E.cleanPrints({ 'A1-036': 'A1-284' }, null)) === '{}', 'nothing, nonsense, and no deck: no printings');
const d1 = { name: 'Gold', ...zard, prints: { 'A1-036': 'A1-284', 'A1-001': 'A1-227' } }, d2 = { name: 'Gold', ...zard }, kept = DL.cleanDecks([d1]);
A(kept.length === 1 && J(kept[0].prints) === '{"A1-036":"A1-284"}' && !('prints' in DL.cleanDecks([d2])[0]), 'a saved deck keeps its chosen printings (cleaned); a deck with none has no such field');
A(!DL.sameDecks(DL.cleanDecks([d1]), DL.cleanDecks([d2])) && DL.sameDecks(DL.cleanDecks([d1]), DL.cleanDecks([{ ...d1 }])), 'two decks that differ only in a chosen printing are not the same deck (the change reaches the account)');

// ===== 2. nothing in play changes; everyone sees it =====
{
	const mk = prints => ({ seed: 'prints-1', rules: E.RULES, players: [{ name: 'Ann', ai: true, ...zard, ...(prints ? { prints } : {}) }, { name: 'Ben', ai: true, ...starterDeck('blastoise') }] });
	const run = cfg => { const S = E.createGame(cfg); for (let i = 0; i < 400 && !S.over; i++) { const seat = S.phase === 'setup' ? S.players.findIndex(p => !p.setup) : S.pending ? S.pending.seat : S.current; const a = nextAction(E.view(S, seat), new Set()) || { t: 'execute', seat, commands: [null, null] }; try { E.apply(S, a); } catch (e) { if (!e || !e.refused) throw e; break; } } return S; };
	const a = run(mk({ 'A1-036': 'A1-284' })), b = run(mk(null));
	A(E.digest(a) === E.digest(b) && a.actions === b.actions && a.actions > 10, `the same match with and without a chosen printing reaches the same position (${a.actions} actions): it is how a card is drawn, nothing more`, [E.digest(a), E.digest(b)]);
	A(J(E.view(a, 0).players[0].prints) === '{"A1-036":"A1-284"}' && J(E.view(a, 1).players[0].prints) === '{"A1-036":"A1-284"}' && J(E.view(a, 0).players[1].prints) === '{}' && J(E.view(b, 1).players[0].prints) === '{}', "it is in every seat's view of that player, and nobody else's");
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	// a player who owns Charizard ex three ways: the standard card (two, in the starter deck), a full art and the gold one
	const mine = C.newCollection(); Object.assign(mine.prints, { 'A1-284': 1, 'A1-253': 1 });
	const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(col => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('magepunk_pocket_collection_v1', JSON.stringify(col)); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); }, mine);
	const boot = async () => { await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=dp`, { waitUntil: 'domcontentloaded' }); await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); };
	await boot();
	const click = async sel => { await page.evaluate(s2 => { const e = document.querySelector(s2); e.scrollIntoView({ block: 'center' }); e.click(); }, sel); await sleep(350); };
	const T = k => `.modal:last-child [data-k="${k}"]`;

	// ===== 3. the deck builder =====
	await page.evaluate(() => window.__pocket.menu()); await sleep(400); await click(T('decks'));
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.pe-db .rows')), 8000), 'the deck builder opens (on the Charizard deck, which a new player owns)');
	const rows0 = await page.evaluate(() => ({ pr: [...document.querySelectorAll('.pe-db .rows .prb')].map(e => [e.dataset.k, e.textContent.trim()]), cards: document.querySelectorAll('.pe-db .rows .rowb:not(.prb)').length }));
	A(rows0.pr.length === 1 && rows0.pr[0][0] === 'prA1-036' && /printing\s+◆◆◆◆ Standard/.test(rows0.pr[0][1]) && rows0.cards === 10, 'Charizard ex, owned in three printings, has a "printing" row (Standard); the nine cards owned in one printing have none', rows0);
	await click(T('prA1-036'));
	const pick = await page.evaluate(() => [...document.querySelectorAll('.modal:last-child .pe-printpick .pe-card')].map(e => ({ k: e.dataset.k, chosen: e.classList.contains('chosen'), look: e.dataset.look || null, label: e.querySelector('.own').textContent })));
	A(pick.length === 3 && pick.map(p => p.k).join() === 'ppA1-036,ppA1-253,ppA1-284' && pick[0].chosen && !pick[1].chosen && pick[1].look === 'full' && pick[2].look === 'gold' && /Gold/.test(pick[2].label) && /Standard/.test(pick[0].label), 'the picker shows the three printings owned, each drawn as itself, the standard one chosen', pick);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'deckprints_1_picker.png') }); }
	await click(T('ppA1-253'));
	A(await page.evaluate(() => /★★ Full art/.test(document.querySelector('.pe-db [data-k="prA1-036"]').textContent)), 'choosing the full art: the row says ★★ Full art');
	await click(T('save'));
	const saved = await page.evaluate(() => window.__pocket.decks());
	A(saved.length === 1 && J(saved[0].prints) === '{"A1-036":"A1-253"}', 'the saved deck holds the printing chosen', saved.map(d => [d.name, d.prints]));
	const deckName = saved[0].name;

	// ===== 4. a match with that deck =====
	await page.evaluate(n => { window.__pocket.start({ players: 2, deckId: 'my:' + n, seed: 'dp-1' }); }, deckName); await sleep(600);
	A(await page.evaluate(() => JSON.stringify(window.__pocket.view().players[0].prints) === '{"A1-036":"A1-253"}' && JSON.stringify(window.__pocket.view().players[1].prints) === '{}'), "the match knows it: my Charizard ex is the full art; the computer player's deck has none");
	// arrange the position: Charizard ex in my hand and Active, and one Active on the other side
	await page.evaluate(() => {
		const S = window.__pocket.engineState(), me = S.players[0], foe = S.players[1];
		const mk = id => ({ uid: ++S.uid, id, cards: [id], dmg: 0, hp: window.__pocket.engine.card ? 0 : 0, energy: [], status: [], fx: [], tool: null, turnPlayed: 0 });
		me.hand = ['A1-036', 'A1-033', ...me.hand.slice(0, 2)];
		const k = mk('A1-036'), f = mk('A1-036'); k.hp = 180; f.hp = 180;
		me.active[0] = k; foe.active[0] = f; me.setup = true; foe.setup = true; S.phase = 'main'; S.turn = 3; S.current = 0; S.order = [0, 1]; S.pending = null;
		window.__pocket.refresh();
	});
	await sleep(700);
	const tbl = await page.evaluate(() => { const g = sel => { const e = document.querySelector(sel); return e ? { cls: e.className, face: e.querySelector('.f') ? e.querySelector('.f').className : '', look: e.dataset.look || null } : null; }; return { hand0: g('[data-k="h:0"]'), hand1: g('[data-k="h:1"]'), mine: g('[data-k="p:0:active:0"]'), foe: g('[data-k="p:1:active:0"]') }; });
	A(tbl.hand0 && /look-full/.test(tbl.hand0.cls) && /lk-full/.test(tbl.hand0.face) && tbl.hand1 && !/look-|lk-/.test(tbl.hand1.cls + tbl.hand1.face), 'in my hand, Charizard ex is drawn as the full art the deck holds (not the gold one I also own); Charmander as the standard card', [tbl.hand0, tbl.hand1]);
	A(tbl.mine && /look-full/.test(tbl.mine.cls) && /lk-full/.test(tbl.mine.face) && tbl.mine.look === 'full', 'my Charizard ex on the mat is the full art too', tbl.mine);
	A(tbl.foe && !/look-/.test(tbl.foe.cls) && !/lk-full|lk-gold/.test(tbl.foe.face), "the computer player's Charizard ex is the standard card", tbl.foe);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'deckprints_2_match.png') });
	await click('[data-k="p:0:active:0"]');
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.pe-insp .big .f.lk-full') && /Full art/.test(document.querySelector('.pe-insp .info').textContent) && /A1-253/.test(document.querySelector('.pe-insp .info').textContent)), 4000), 'the inspect view shows it as the full art and names the printing (A1-253)');
	await page.keyboard.press('Escape'); await sleep(300);
	A(!errors.length, 'no page errors', errors.slice(0, 4).join(' | '));

	// ===== 5. a printing no longer owned =====
	await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('magepunk_pocket_collection_v1')); delete c.prints['A1-253']; localStorage.setItem('magepunk_pocket_collection_v1', JSON.stringify(c)); localStorage.removeItem('magepunk_pocket_run_v1'); });
	await boot();
	await page.evaluate(n => { window.__pocket.start({ players: 2, deckId: 'my:' + n, seed: 'dp-2' }); }, deckName); await sleep(600);
	A(await page.evaluate(() => JSON.stringify(window.__pocket.view().players[0].prints) === '{}' && window.__pocket.view().players[0].deck > 0), 'with the full art no longer owned, the deck still plays and Charizard ex is the standard card again');
	A(!errors.length, 'no page errors after the reload', errors.slice(0, 4).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
