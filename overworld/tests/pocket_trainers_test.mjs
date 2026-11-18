// pocket_trainers_test.mjs — the overworld's Gym Leaders as Pocket Enhanced opponents (owner's improvement list,
// 2026-11-18: "card-playing trainers in the overworld: Gym Leaders ... could challenge you to a Pocket match and pay
// stars. This ties the two games together", "yes to all"). overworld/ow_screens.js CARD TRAINERS, pocketenhanced/js/trainers.js.
//   1. every Gym Leader of the three regions has a card deck of their type (Pocket's own deck in their name where there is one)
//   2. the overworld, by keyboard: START > CARDS > CARD TRAINERS lists this region's eight leaders; one whose badge is
//      earned says CARD MATCH, the others which badge to earn; a locked one says so and stays; Brock opens Pocket Enhanced
//      with ?trainer=KANTO:boulder (the position saved first)
//   3. Pocket Enhanced: a match against "Brock" with Brock's deck. A win pays 150 stars and says so; a second win the
//      same day pays nothing and says why; a loss pays nothing. The end screen has "Back to the overworld"
//   node overworld/tests/pocket_trainers_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor } from './ow_controls_lib.mjs';
import { TRAINERS, trainerDeck, TRAINER_STARS } from '../../pocketenhanced/js/trainers.js';
import { BADGES } from '../badges.js';

const R = makeAsserter(), A = R.A;
// ===== 1. decks =====
{
	const leaders = ['KANTO', 'JOHTO', 'HOENN'].flatMap(r => BADGES[r].map(b => r + ':' + b.id));
	const missing = leaders.filter(k => !TRAINERS.find(t => t.key === k));
	A(!missing.length && TRAINERS.length === 24, 'every Gym Leader of Kanto, Johto and Hoenn is a card trainer', missing);
	const bad = TRAINERS.filter(t => { const d = trainerDeck(t); return !d || !d.cards.length || (!d.name.toLowerCase().startsWith(t.name.toLowerCase()) && !d.energy.includes(t.type)); });
	A(!bad.length && trainerDeck(TRAINERS.find(t => t.name === 'Brock')).name === 'Brock Deck', "each plays a deck of their type; Brock plays Pocket's Brock Deck", bad.map(t => t.name));
}
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	// ===== 2. the overworld =====
	const t = await openOverworld(browser, port);
	const { page } = t;
	await page.evaluate(() => { localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true } }, champion: {} })); });
	await page.evaluate(async () => (await import('./badges.js'))._reset());
	const press = async (k, ms = 160) => { await page.keyboard.press(k); await sleep(ms); };
	const menu = () => page.evaluate(async () => { const M = await import('./ow_screens.js'), S = await import('./ow_menustate.js'); return { cards: S.cardsMenu.open, tr: M.trainerMenu.open, idx: M.trainerMenu.idx, flash: M.trainerMenu.flash, rows: M.cardTrainerRows().map(r => r.leader + (r.earned ? '+' : '-')), items: M.cardsItems(), any: (await import('./ow_menus.js')).anyMenuOpen(), drawn: (await import('./ow_menukeys.js')).DRAW_ORDER.includes('trainerMenu') }; });
	await press('Enter');
	const startItems = await page.evaluate(() => window.__ow.startMenu.open);
	A(startItems, '(Enter: the start menu)');
	// to CARDS: the cursor walks down the start menu to it, Z opens it
	const cardsAt = await page.evaluate(async () => (await import('./ow_screens.js')).startItems().indexOf('CARDS'));
	for (let k = 0; k < cardsAt; k++) await press('ArrowDown', 90);
	await press('KeyZ');
	const m0 = await menu();
	A(m0.cards && m0.items.includes('CARD TRAINERS'), 'START > CARDS has CARD TRAINERS', m0.items);
	for (let i = 0; i < 10 && (await menu()).items[await page.evaluate(async () => (await import('./ow_menustate.js')).cardsMenu.idx)] !== 'CARD TRAINERS'; i++) await press('ArrowDown', 90);
	await press('KeyZ');
	const m1 = await menu();
	A(m1.tr && m1.rows.join() === 'Brock+,Misty-,Lt. Surge-,Erika-,Koga-,Sabrina-,Blaine-,Giovanni-', "CARD TRAINERS lists Kanto's eight leaders: Brock (Boulder Badge earned) open, the rest locked", m1.rows);
	A(m1.any && m1.drawn, 'the open CARD TRAINERS list counts as a menu (the one table, CANVAS_MENUS), so nothing pops up over it', m1);
	await press('ArrowDown'); await press('KeyZ');
	const m2 = await menu();
	A(m2.tr && /Earn the Cascade Badge first/.test(m2.flash), 'Misty is locked: "Earn the Cascade Badge first." and the menu stays', m2.flash);
	await press('ArrowUp');
	const nav = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
	await press('KeyZ', 50);
	await nav;
	A(/\/pocketenhanced\/\?trainer=KANTO%3Aboulder$/.test(page.url()), 'Brock: Pocket Enhanced opens with ?trainer=KANTO:boulder', page.url());

	// ===== 3. Pocket Enhanced =====
	await page.evaluateOnNewDocument(() => localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ ...(JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1') || '{}')), tutored: true })));
	await page.goto(`http://localhost:${port}/pocketenhanced/?trainer=KANTO:boulder&seed=brk1`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(600);
	const cfg = await page.evaluate(() => { const c = window.__pocket.recipe() && window.__pocket.recipe().config; return c ? { trainer: c.trainer, opp: c.players[1].name, ai: c.players[1].ai, deck: c.players[1].deck.join() } : null; });
	const brockDeck = trainerDeck(TRAINERS.find(x => x.name === 'Brock')).cards.join();
	A(cfg && cfg.trainer === 'KANTO:boulder' && cfg.opp === 'Brock' && cfg.ai && cfg.deck === brockDeck, 'a match against Brock, playing the Brock Deck', cfg);
	const stars0 = await page.evaluate(() => window.__pocket.stars());
	const winAs = async seat => page.evaluate(async s => { const P = window.__pocket, { nextAction } = await import('/pocketenhanced/js/ai.js'); P.fast(true);
		for (let n = 0; n < 3000 && !P.state().over; n++) { const S = P.state(); if (S.phase === 'main' && S.turn >= 2) { await P.act({ t: 'concede', seat: 1 - s }); continue; }
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); }
		return P.state().over && P.state().over.winner; }, seat);
	const w1 = await winAs(0);
	await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	const e1 = await page.evaluate(() => ({ note: (document.querySelector('.pe-trainer') || {}).textContent || '', back: !!document.querySelector('[data-k="toworld"]'), stars: window.__pocket.stars() }));
	A(w1 === 0 && /Brock: \+150 ★/.test(e1.note) && e1.stars - stars0 >= TRAINER_STARS && e1.back, `I win: "Brock: +150 ★", ${TRAINER_STARS} stars more, and a "Back to the overworld" button`, [w1, e1, stars0]);
	await page.evaluate(() => document.querySelector('.modal [data-k="rematch"]').click()); await sleep(500);
	const w2 = await winAs(0);
	await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	const e2 = await page.evaluate(() => ({ note: (document.querySelector('.pe-trainer') || {}).textContent || '', stars: window.__pocket.stars(), trainer: window.__pocket.recipe().config.trainer }));
	A(w2 === 0 && e2.trainer === 'KANTO:boulder' && /Brock has paid today/.test(e2.note) && e2.stars - e1.stars < TRAINER_STARS, 'a rematch is against Brock again; a second win the same day pays nothing and says so', { ...e2, w2, e1s: e1.stars });
	await page.evaluate(() => document.querySelector('.modal [data-k="rematch"]').click()); await sleep(500);
	const w3 = await winAs(1);
	await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	const e3 = await page.evaluate(() => ({ note: (document.querySelector('.pe-trainer') || {}).textContent || '', stars: window.__pocket.stars() }));
	A(w3 === 1 && /Brock wins this time/.test(e3.note) && e3.stars - e2.stars < TRAINER_STARS, 'a loss pays nothing: "Brock wins this time."', { ...e3, w3, e2s: e2.stars });
	const nav2 = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
	await page.evaluate(() => document.querySelector('.modal [data-k="toworld"]').click()); await nav2;
	A(/\/overworld\/$/.test(page.url()), '"Back to the overworld" goes back', page.url());
	A(!t.errors.length, 'no page errors', t.errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
