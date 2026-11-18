// pocketenhanced_deckhelp_test.mjs — the deck builder's help (owner's second improvement list, 2026-11-18, "yes to all":
// "'Finish this deck for me' fills a half-built deck from cards you own, and a deck screen warns you about problems like too
// few Basic Pokémon or Energy that doesn't match the deck"). pocketenhanced/js/deckhelp.js, main.js deckBuilder.
//   1. deckAdvice: too few Basics; an evolution without what it evolves from; a Pokémon the deck's Energy cannot pay for;
//      an Energy type nothing uses; no Trainers. A good deck: nothing
//   2. finishDeck from a starter collection: a lone Charizard ex becomes a legal 20 of Fire with Charmander and Charmeleon,
//      only cards owned (never more than owned, two of a name at most); an empty deck becomes a legal deck too;
//      a full deck is left alone
//   3. the builder: the warnings show under the deck; "Finish this deck" fills it, says how many were added, and the
//      deck can be saved; with a full deck the button is not there
//   node overworld/tests/pocketenhanced_deckhelp_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import { deckAdvice, finishDeck } from '../../pocketenhanced/js/deckhelp.js';
import { CARDS, card } from '../../pocketenhanced/js/data/cards.js';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import * as COLL from '../../pocketenhanced/js/collection.js';

const R = makeAsserter(), A = R.A;
const id = n => CARDS.find(c => c.name === n).id;
// ===== 1. advice =====
{
	const a = deckAdvice([id('Charizard ex'), id('Pikachu ex')], ['Fire', 'Water']);
	A(a.some(t => /Only 1 Basic/.test(t)), 'one Basic Pokémon: "aim for 5 or more"', a);
	A(deckAdvice([id('Charizard ex')], ['Fire']).some(t => /No Basic Pokémon yet/.test(t)), 'no Basic at all: "No Basic Pokémon yet"');
	A(a.some(t => /Charizard ex evolves from Charmeleon, which is not in the deck/.test(t)), 'an evolution without what it evolves from', a);
	A(a.some(t => /Pikachu ex's attacks need Lightning Energy, and this deck makes Fire, Water/.test(t)), 'a Pokémon the Energy cannot pay for', a);
	A(a.some(t => /No Pokémon here uses Water Energy/.test(t)), 'an Energy type nothing uses', a);
	const noT = deckAdvice(Array(10).fill(id('Charmander')).map((x, i) => i < 2 ? x : CARDS.filter(c => c.kind === 'pokemon' && c.stage === 0 && c.cardType === 'Fire')[i].id), ['Fire']);
	A(noT.some(t => /No Trainer cards/.test(t)), '10 cards and no Trainers: says so', noT);
}
// ===== 2. finish =====
const col = COLL.newCollection(), owned = x => COLL.ownedByName(col, x);
{
	const r = finishDeck([id('Charizard ex')], [], owned), names = r.deck.map(x => card(x).name);
	const over = Object.entries(names.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {})).filter(([n, k]) => k > 2 || k > owned(id(n)));
	A(r.deck.length === 20 && !E.deckError(r.deck, r.energy) && r.energy.join() === 'Fire' && names.includes('Charmander') && names.includes('Charmeleon'), 'a lone Charizard ex: a legal 20 of Fire, with Charmander and Charmeleon', { e: r.energy, names });
	A(!over.length && r.deck.every(x => owned(x) > 0), 'only cards owned, never more than owned, two of a name at most', over);
	A(!deckAdvice(r.deck, r.energy).length, 'and the help finds nothing to say about it', deckAdvice(r.deck, r.energy));
	const e = finishDeck([], [], owned);
	A(e.deck.length === 20 && !E.deckError(e.deck, e.energy), 'an empty deck: a legal deck from the collection', { e: e.energy, n: e.deck.length, err: E.deckError(e.deck, e.energy) });
	const full = finishDeck(r.deck, r.energy, owned);
	A(!full.added.length && full.deck.join() === r.deck.join(), 'a full deck is left alone');
	const none = finishDeck([], ['Fire'], () => 0);
	A(!none.added.length, 'owning nothing: nothing added');
}
// ===== 3. the builder =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	await page.evaluate(() => document.querySelector('[data-k="decks"]').click()); await sleep(400);
	await page.evaluate(() => document.querySelector('[data-k="clear"]').click()); await sleep(200);
	await page.evaluate(cid => document.querySelector(`[data-k="c${cid}"]`).click(), id('Charizard ex')); await sleep(200);
	const warn = await page.evaluate(() => ({ adv: (document.querySelector('.pe-advice') || {}).textContent || '', legal: (document.querySelector('.pe-db .mine .pe-note') || {}).textContent || '' }));
	A(/No Basic Pokémon yet/.test(warn.adv) && /evolves from Charmeleon/.test(warn.adv), 'the builder: the warnings show under the deck (no Basic yet; what Charizard ex evolves from)', JSON.stringify(warn));
	A(await page.evaluate(() => !!document.querySelector('[data-k="finish"]')), '"Finish this deck" is there');
	await page.evaluate(() => document.querySelector('[data-k="finish"]').click()); await sleep(300);
	const after = await page.evaluate(() => ({ n: (document.querySelector('.pe-db .mine .pe-note') || {}).textContent || '', toast: document.querySelector('.pe-banner').textContent, save: !document.querySelector('[data-k="save"]').disabled, finish: !!document.querySelector('[data-k="finish"]'), warn: !!document.querySelector('.pe-advice') }));
	A(/^20 \/ 20 cards · legal/.test(after.n) && /Added 19 cards from your collection/.test(after.toast) && after.save && !after.finish && !after.warn, 'it fills the deck: "Added 19 cards…", legal, can be saved, no warnings, no button any more', after);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
