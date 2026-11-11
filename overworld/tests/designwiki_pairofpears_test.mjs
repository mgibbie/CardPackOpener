// designwiki_pairofpears_test.mjs — the design wiki's Pair of Pears page (designwiki/app.js pairOfPearsView,
// #/pair-of-pears): how the game works, every condition, every charm.
//   1. The page's "Exactly" notes are written from the rules' code (pairofpears/js/pear.js). Each claim is PLAYED
//      here on the real engine, so a rules change that makes a note wrong fails this suite:
//        base pair +2 Berries · mismatch -½ Heart · level clear +2 Hearts · the Pears end the level at once
//        Golden +100 Stars a pair · Fresh +20 Berries · Tart +20 Berries +1 Heart for the first 3 pairs, nothing after
//        Juicy triples · Rotten pays nothing and removes the pair for good · a second copy of a condition adds nothing
//        Sticky stays up and pairs by itself · charms sell for half (6 -> 3, 20 -> 10) · the Egg grows by 5
//        a covered mismatch uses Coconut, then Lime, then Rhubarb · the Olive Charm reads the Hearts the level was finished with
//        Eggplant's 4 Tart Kiwis stay after it is sold · Persimmon saves the run once
//   2. The page in headless Chrome: every condition and every charm of the engine is listed with the game's own
//      name, text, cost and sell value; the 13 levels; the sidebar link; in-page jumps; no console errors; and the
//      phone layout (390 px) has no horizontal overflow.
//   node overworld/tests/designwiki_pairofpears_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9577;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

// ---------- 1. the rules the page states, played on the engine ----------
const P = await import(pathToFileURL(path.join(ROOT, 'pairofpears/js/pear.js')).href);
// a run with exactly these cards (ids 1..n), these charms and these numbers
const C = (fruit, conds = {}) => ({ fruit, conditions: { ...conds } });
function run({ cards, charms = [], hearts = 3, berries = 0, pairsMatched = 0, level = 3, deckConditions = {} }) {
	P.startNewRun();
	const s = P.serialize();
	s.level = level; s.hearts = hearts; s.berries = berries; s.stars = 0;
	s.cards = cards.map((c, i) => ({ id: i + 1, fruit: c.fruit, conditions: c.conditions, faceUp: false, matched: false }));
	s.nextId = cards.length + 1; s.first = null; s.flipBackTimer = 0;
	s.round = { mismatchCount: 0, mismatchesByFruit: {}, fruitMatches: {}, pairsMatched, fruitsRevealed: {}, coconut: 0, lime: 0 };
	s.charm.inventory = [0, 1, 2, 3].map(i => (charms[i] ? { id: charms[i], name: P.CHARMS[charms[i]].name, sellValue: Math.max(1, Math.floor(P.CHARMS[charms[i]].cost * 0.5 + 0.5)) } : null));
	s.charm.deckConditions = deckConditions;
	P.reset();
	if (!P.restore(s)) throw new Error('restore refused');
	return () => P.view();
}
const flip = (...ids) => { for (const id of ids) { P.reveal(id); } };
const settle = () => P.update(1);   // (past the ¾ s flip-back)
const filler = [C('orange'), C('orange'), C('kiwi'), C('kiwi')];   // keeps a level from ending on the pair under test

{ const v = run({ cards: [C('apple'), C('apple'), ...filler] }); flip(1, 2);
	A(v().berries === 2 && v().pairs === 1, 'a plain pair pays +2 Berries', JSON.stringify([v().berries, v().pairs])); }
{ const v = run({ cards: [C('apple'), C('orange'), C('apple'), C('orange')] }); flip(1, 2);
	A(v().hearts === 2.5 && v().busy, 'a mismatch costs ½ Heart and the cards are busy turning back', JSON.stringify([v().hearts, v().busy]));
	A(P.revealRefusal(3) !== null, '...and nothing can be flipped while they turn');
	settle();
	A(v().cards.every(c => !c.up) && P.revealRefusal(3) === null, '...then both are face down again'); }
{ const v = run({ cards: [C('apple'), C('apple')], hearts: 3 }); flip(1, 2);
	A(v().phase === 'clear' && v().hearts === 5, 'clearing a level gives +2 Hearts', JSON.stringify([v().phase, v().hearts])); }
{ const v = run({ cards: [C('pear', { special: 1 }), C('pear', { special: 1 }), C('apple', { fresh: 1 }), C('apple', { fresh: 1 })] }); flip(1, 2);
	A(v().phase === 'clear' && v().berries === 2, 'matching the Pears ends the level at once; the pairs left on the table pay nothing', JSON.stringify([v().phase, v().berries])); }
{ const v = run({ cards: [C('apple', { golden: 1 }), C('apple', { golden: 1 }), ...filler] }); flip(1, 2);
	A(v().stars === 100, 'a Golden pair (both cards Golden) is worth +100 Stars: +50 a card', String(v().stars));
	A(P.COND_INFO.golden.desc === 'Matching this pair grants +50 Stars per card.', '...and its text says per card, as Fresh\'s does', P.COND_INFO.golden.desc); }
{ const v = run({ cards: [C('apple', { fresh: 1 }), C('apple', { fresh: 1 }), ...filler] }); flip(1, 2);
	A(v().berries === 22, 'a Fresh pair pays +20 Berries on top of the +2', String(v().berries)); }
{ const v = run({ cards: [C('apple', { fresh: 2 }), C('apple', { fresh: 2 }), ...filler] }); flip(1, 2);
	A(v().berries === 22, 'a second copy of a condition (×2) adds nothing', String(v().berries)); }
{ const v = run({ cards: [C('apple', { tart: 1 }), C('apple', { tart: 1 }), ...filler], pairsMatched: 2 }); flip(1, 2);
	A(v().berries === 22 && v().hearts === 4, 'Tart, as the 3rd pair of the level: +20 Berries and +1 Heart', JSON.stringify([v().berries, v().hearts])); }
{ const v = run({ cards: [C('apple', { tart: 1 }), C('apple', { tart: 1 }), ...filler], pairsMatched: 3 }); flip(1, 2);
	A(v().berries === 2 && v().hearts === 3, 'Tart, as the 4th pair: nothing', JSON.stringify([v().berries, v().hearts])); }
{ const v = run({ cards: [C('apple', { juicy: 1, fresh: 1 }), C('apple', { juicy: 1, fresh: 1 }), ...filler] }); flip(1, 2);
	A(v().berries === 66, 'Juicy triples what its card earns: (1 + 10) × 3 a card = 66 for a Juicy Fresh pair', String(v().berries)); }
{ const v = run({ cards: [C('apple', { rotten: 1, fresh: 1, golden: 1 }), C('apple', { rotten: 1, fresh: 1, golden: 1 }), ...filler] }); flip(1, 2);
	A(v().berries === 0 && v().stars === 0 && P.serialize().charm.rottenRemoved.apple === 2, 'Rotten: the pair pays nothing, whatever else it carries, and its two cards are removed for the rest of the run', JSON.stringify([v().berries, v().stars, P.serialize().charm.rottenRemoved])); }
{ const v = run({ cards: [C('apple', { sticky: 1 }), C('orange'), C('apple', { sticky: 1 }), C('orange'), C('kiwi'), C('kiwi')] }); flip(1, 2); settle();
	A(v().cards.find(c => c.id === 1).up && !v().cards.find(c => c.id === 2).up, 'a Sticky card stays face up after a mismatch');
	flip(3);
	A(v().pairs === 1 && v().cards.find(c => c.id === 3).m, '...and pairs by itself when its partner is flipped (one flip, no guess)', JSON.stringify(v().pairs)); }
{ const v = run({ cards: [C('apple', { flutter: 1 }), C('apple', { flutter: 1 }), ...filler] }); flip(1, 2);
	const peeked = v().cards.filter(c => c.peek);
	A(peeked.length === 1 && P.serialize().cards.find(c => c.id === peeked[0].id).faceUp === false, 'Flutter shows one face-down card as a peek (it is not face up)', JSON.stringify(peeked));
	settle();
	A(v().cards.every(c => !c.peek), '...for about a second'); }
// charms
{ const v = run({ cards: [C('apple'), C('apple'), ...filler], charms: ['grape'] }); flip(1, 2);
	A(v().berries === 4, 'Grape: +4 Berries a pair', String(v().berries)); }
{ const v = run({ cards: [C('apple'), C('apple'), ...filler], charms: ['manzana'] }); flip(1, 2);
	A(v().hearts === 4.5, 'Manzana: an Apple pair gives +1½ Hearts', String(v().hearts)); }
{ const v = run({ cards: [C('lemon'), C('orange'), C('lemon'), C('orange'), C('kiwi'), C('apple'), C('kiwi'), C('apple')], charms: ['coconut', 'lime', 'rhubarb'], berries: 30 });
	flip(1, 2); settle(); flip(1, 2); settle();
	A(v().hearts === 3 && v().berries === 30, 'covered mismatches use Coconut first: the first 2 of a level are free', JSON.stringify([v().hearts, v().berries]));
	flip(1, 2); settle();
	A(v().hearts === 3 && v().berries === 29, '...then Lime (a Lemon is involved): 1 Berry', JSON.stringify([v().hearts, v().berries]));
	flip(5, 6); settle(); flip(5, 6); settle(); flip(5, 6); settle();   // Kiwi: Lime's 2nd-4th
	flip(2, 8);   // Orange + Apple: Lime no longer applies to them -> Rhubarb (more than 15 Berries)
	A(v().hearts === 3 && v().berries === 21, '...then Rhubarb: 5 Berries', JSON.stringify([v().hearts, v().berries])); }
{ const v = run({ cards: [C('apple'), C('orange'), C('apple'), C('orange')], charms: ['onion'] }); flip(1, 2);
	A(v().hearts === 2.5 && v().berries === 4, 'Onion: +4 Berries for the ½ Heart lost', JSON.stringify([v().hearts, v().berries])); }
{ const v = run({ cards: [C('orange'), C('orange')], charms: ['pumpkin', 'egg', 'crabapple'] }); flip(1, 2);
	A(v().hearts === 6, 'Pumpkin: +1 Heart on top of the +2', String(v().hearts));
	A(v().charms[1].sell === 8, 'Egg: bought at sell value 3, +5 a cleared level', String(v().charms[1].sell));
	A(v().berries === 12, 'Crabapple: +10 Berries when no Apple was flipped', String(v().berries)); }
// Olive reads the Hearts the level was FINISHED with (it used to look after the +2 for clearing, and never triggered)
for (const [h0, on] of [[0.5, true], [1, true], [1.5, false], [3, false]]) {
	const v = run({ cards: [C('orange'), C('orange')], charms: ['olive'], hearts: h0 }); flip(1, 2);
	A(v().hearts === h0 + 2 + (on ? 3 : 0) && v().berries === 2 + (on ? 15 : 0), `Olive: finishing a level on ${h0} Heart${h0 === 1 ? '' : 's'} ${on ? 'gives +3 Hearts and +15 Berries on top of the +2' : 'does not trigger it'}`, JSON.stringify([v().hearts, v().berries])); }
{ const v = run({ cards: [C('orange'), C('orange')], charms: ['olive', 'pumpkin'], hearts: 1 }); flip(1, 2);
	A(v().hearts === 1 + 2 + 1 + 3, 'Olive is not put off by Pumpkin\'s Heart either', String(v().hearts)); }
{ const v = run({ cards: [C('apple'), C('orange'), C('apple'), C('orange')], charms: ['persimmon'], hearts: 0.5, berries: 9 }); flip(1, 2);
	A(v().hearts === 1 && v().berries === 0 && !v().charms.some(Boolean), 'Persimmon: at 0 Hearts you are set to 1 Heart, lose your Berries, and the charm is gone', JSON.stringify([v().hearts, v().berries]));
	settle(); flip(1, 2); flip(1); settle(); flip(1, 2); settle();
	A(v().phase === 'over' || v().hearts === 0, '...once: the next time at 0 Hearts the run is over', JSON.stringify([v().phase, v().hearts])); }
{ // the shop: half price back; Eggplant's Kiwis outlive the charm; a bought condition marks every card of its fruit
	const v = run({ cards: [C('orange'), C('orange')], berries: 60, level: 2 }); flip(1, 2);
	P.continueClear();
	const s = P.serialize();
	s.shop.offers = [{ kind: 'charm', id: 'eggplant', cost: 6 }, { kind: 'charm', id: 'persimmon', cost: 20 }, { kind: 'condition', fruit: 'apple', cond: 'tart', cost: P.CONDITION_COST }, { kind: 'sell' }];
	P.reset(); P.restore(s);
	const b0 = v().berries;
	A(P.buy(0) && P.buy(1) && P.buy(2) && v().berries === b0 - 6 - 20 - 15, 'the shop: a charm costs its price, a condition 15 Berries', String(v().berries));
	A(v().charms[0].sell === 3 && v().charms[1].sell === 10, 'charms sell for half their price (6 -> 3, 20 -> 10)', JSON.stringify(v().charms));
	P.pickCharm(0); P.sellHeld();
	P.nextLevel();
	const deck = P._cards();
	A(deck.filter(c => c.fruit === 'kiwi').length === 2 + 4 && deck.filter(c => c.fruit === 'kiwi' && c.conditions.tart).length === 4, 'Eggplant: 4 Tart Kiwis join every later level, even after the charm is sold', JSON.stringify(deck.filter(c => c.fruit === 'kiwi').map(c => c.conditions)));
	A(deck.filter(c => c.fruit === 'apple').length === 2 && deck.filter(c => c.fruit === 'apple').every(c => c.conditions.tart), 'a bought condition is on every card of its fruit from the next level on');
	A(deck.filter(c => c.fruit === 'pear').every(c => c.conditions.special), 'every Pear is Special'); }
A(P.MAX_LEVEL === 13 && P.MAX_HEARTS === 15 && P.CONDITION_COST === 15 && P.LEVEL_DECKS[0].length === 3, 'the numbers the page quotes: 13 levels, 15 Hearts at most, conditions 15 Berries, level 1 is 3 fruits');
P.reset();

// ---------- 2. the page ----------
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }
try {
	for (const [name, vp] of [['desktop', { width: 1400, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
		const page = await browser.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
		await page.goto(`http://localhost:${PORT}/designwiki/#/pair-of-pears`, { waitUntil: 'domcontentloaded' });
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('#pp-charms table tbody tr')), 20000), `${name}: the page renders`);
		const got = await page.evaluate(() => {
			const rows = sel => [...document.querySelectorAll(sel)].map(tr => ({ key: tr.dataset.cond || tr.dataset.charm, cells: [...tr.children].map(td => td.textContent.trim()), img: (tr.querySelector('img') || {}).naturalWidth || 0 }));
			return {
				h1: document.querySelector('#content h1').textContent,
				sections: [...document.querySelectorAll('#content section')].map(s => s.id),
				conds: rows('#pp-conditions tbody tr'), charms: rows('#pp-charms tbody tr'),
				levels: [...document.querySelectorAll('#pp-levels tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())),
				nav: [...document.querySelectorAll('#sidebar a')].filter(a => a.getAttribute('href') === '#/pair-of-pears').map(a => ({ text: a.textContent, active: a.classList.contains('active') })),
				text: document.getElementById('content').innerText,
				overflow: document.documentElement.scrollWidth - innerWidth,
			};
		});
		A(got.h1 === 'Pair of Pears' && ['pp-run', 'pp-turn', 'pp-numbers', 'pp-levels', 'pp-conditions', 'pp-shop', 'pp-charms', 'pp-controls'].every(s => got.sections.includes(s)), `${name}: every section is there (a run, a turn, the numbers, levels, conditions, the shop, charms, controls)`, got.sections.join(','));
		const condOk = P.COND_ORDER.every((k, i) => { const r = got.conds[i]; return r && r.key === k && r.cells[0] === P.COND_INFO[k].name && r.cells[1] === P.COND_INFO[k].desc && r.cells[2].length > 30; });
		A(got.conds.length === P.COND_ORDER.length && condOk, `${name}: all ${P.COND_ORDER.length} conditions, each with the game's own name and text and an exact note`, JSON.stringify(got.conds.map(r => r.cells[0])));
		const sell = c => String(Math.max(1, Math.floor(c * 0.5 + 0.5)));
		const charmOk = P.CHARM_ORDER.every((id, i) => { const r = got.charms[i], c = P.CHARMS[id]; return r && r.key === id && r.cells[0] === c.name && r.cells[1] === String(c.cost) && r.cells[2] === sell(c.cost) && r.cells[3] === c.desc && r.cells[4].length > 30; });
		A(got.charms.length === P.CHARM_ORDER.length && charmOk, `${name}: all ${P.CHARM_ORDER.length} charms, each with the game's own name, cost, sell value and text and an exact note`, JSON.stringify(got.charms.map(r => r.cells.slice(0, 3))));
		A(await waitFor(() => page.evaluate(() => [...document.querySelectorAll('#pp-conditions tbody img, #pp-charms tbody img')].every(i => i.complete && i.naturalWidth > 0)), 8000), `${name}: every condition and charm shows the game's own icon`);
		A(got.levels.length === P.MAX_LEVEL && got.levels[0][3] === '6' && got.levels[0][4] === '3 × 2' && got.levels[12][1] === 'Potato' && got.levels[12][3] === '30', `${name}: the ${P.MAX_LEVEL} levels (level 1: 6 cards on 3 × 2; level 13 adds Potato: 30 cards)`, JSON.stringify([got.levels[0], got.levels[12]]));
		A(/Golden has it on both cards, so its pair is worth \+100 Stars/.test(got.text) && /A second copy does nothing/.test(got.text) && /Coconut is used first, then Lime, then Rhubarb/.test(got.text) && /It reads the Hearts you finished the level with, before the \+2 for clearing/.test(got.text), `${name}: the notes the engine checks above are on the page (Golden +100, no stacking, the mismatch order, Olive)`);
		A(got.nav.length === 1 && got.nav[0].active, `${name}: the sidebar has its link, lit up`, JSON.stringify(got.nav));
		A(got.overflow <= 1, `${name}: no horizontal overflow`, String(got.overflow));
		if (name === 'desktop') {
			await page.evaluate(() => [...document.querySelectorAll('#content a')].find(a => a.getAttribute('href') === '#pp-charms').click());
			await sleep(900);
			const j = await page.evaluate(() => ({ hash: location.hash, top: document.getElementById('pp-charms').getBoundingClientRect().top, h1: document.querySelector('#content h1').textContent }));
			A(j.hash === '#/pair-of-pears' && j.h1 === 'Pair of Pears' && j.top < 400, `${name}: the "charms" link jumps down the page without leaving it`, JSON.stringify(j));
		}
		A(errors.length === 0, `${name}: no console errors`, errors.slice(0, 3).join(' | '));
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
