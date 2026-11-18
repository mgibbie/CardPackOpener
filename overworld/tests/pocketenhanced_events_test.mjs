// pocketenhanced_events_test.mjs — the weekly event (owner's second improvement list, 2026-11-18, "yes to all": "Weekly
// events. One special rule each week ... Solo event battles would pay a special reward"). events.js, main.js eventMenu.
//   1. the week: Monday to Sunday (UTC); seven weeks in a row show the seven rules, then they come round again
//   2. the rules: Basic only refuses an evolution, one type refuses two Energy, Genetic Apex refuses another set, no
//      Trainers refuses a Trainer, no ex refuses an ex; Sprint plays to 2 points
//   3. every week of the next 70 has three opponents, each a legal deck that keeps the week's rule
//   4. paid once: the paid note survives the progress's cleaning and a merge, and paid on two devices counts one pack
//   5. the page (its clock set to a Sprint week): the main menu's Weekly event (0 / 3); the screen's rule and three
//      battles; battle 1 plays to 2 points; a win pays a pack's stars and marks it ✓ (1 / 3); a second win of it pays
//      nothing; a loss says try again. An Apex-only week: a deck built from my cards, or the reason there is none
//   node overworld/tests/pocketenhanced_events_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import * as EV from '../../pocketenhanced/js/events.js';
import * as SO from '../../pocketenhanced/js/solo.js';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import { CARDS } from '../../pocketenhanced/js/data/cards.js';

const R = makeAsserter(), A = R.A;
const MON = Date.UTC(2026, 10, 16);   // a Monday
const weekWith = id => { for (let n = 0; n < 7; n++) { const t = MON + n * 7 * 86400000 + 3600000; if (EV.eventOf(t).id === id) return t; } return null; };
// ===== 1 =====
A(EV.weekOf(MON).key === EV.weekOf(MON + 7 * 86400000 - 1).key && EV.weekOf(MON).key !== EV.weekOf(MON - 1).key, 'a week runs Monday to Sunday (UTC)');
A(new Set(Array.from({ length: 7 }, (_, n) => EV.eventOf(MON + n * 7 * 86400000).id)).size === 7 && EV.eventOf(MON).id === EV.eventOf(MON + 49 * 86400000).id, 'seven weeks: the seven rules, then round again');
// ===== 2 =====
{
	const id = n => CARDS.find(c => c.name === n).id, ev = x => EV.EVENTS.find(e => e.id === x);
	A(!!EV.eventDeckError(ev('basics'), [id('Charmeleon')], ['Fire']) && !EV.eventDeckError(ev('basics'), [id('Charmander')], ['Fire']), 'Basic only: an evolution refused, a Basic kept');
	A(!!EV.eventDeckError(ev('mono'), [], ['Fire', 'Water']) && !EV.eventDeckError(ev('mono'), [], ['Fire']), 'one type: two Energy types refused');
	A(!!EV.eventDeckError(ev('apex'), [CARDS.find(c => c.set === 'A2').id], ['Fire']) && !EV.eventDeckError(ev('apex'), [id('Charmander')], ['Fire']), 'Genetic Apex: another set refused');
	A(!!EV.eventDeckError(ev('notrainer'), [id('Poké Ball')], ['Fire']), 'no Trainers: a Trainer refused');
	A(!!EV.eventDeckError(ev('noex'), [id('Charizard ex')], ['Fire']), 'no ex: an ex refused');
	A(EV.eventOpts(ev('sprint')).points === 2 && EV.eventOpts(ev('solo')).singles === true, 'Sprint plays to 2 points; One on One is singles');
}
// ===== 3 =====
{
	const bad = [];
	for (let n = 0; n < 70; n++) { const t = MON + n * 7 * 86400000, ev = EV.eventOf(t), o = EV.eventOpponents(ev, EV.weekOf(t)); if (o.length !== 3 || o.some(d => E.deckError(d.deck, d.energy) || EV.eventDeckError(ev, d.deck, d.energy))) bad.push(EV.weekOf(t).key + ':' + ev.id); }
	A(!bad.length, 'the next 70 weeks: three legal opponents each, keeping the rule', bad);
}
// ===== 4 =====
{
	const k = EV.eventKey(EV.weekOf(MON), 1), p = { ...SO.newProgress(), paid: { [k]: 1 } };
	A(SO.cleanProgress(p).paid[k] === 1 && SO.mergeProgress(p, SO.newProgress()).paid[k] === 1, 'the paid note survives cleaning and a merge', k);
	A(SO.paidTwice(SO.newProgress(), p, p) === 1, 'paid on two devices at once: one pack counted to take back');
}
// ===== 5. the page =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const at = async t => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
		await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument(t => { Date.now = () => t + (performance.now() | 0); if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); }, t);
		await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
		return { ctx, page, errors };
	};
	const sprint = weekWith('sprint');
	const { page, errors, ctx } = await at(sprint);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e && !e.disabled) { e.click(); return true; } return false; }, k);
	const menu = () => page.evaluate(() => (document.querySelector('[data-k="event"]') || {}).textContent || '');
	A(/Weekly event: Sprint \(0 \/ 3\)/.test(await menu()), 'the main menu: "Weekly event: Sprint (0 / 3)"', await menu());
	await click('event'); await sleep(300);
	const scr = await page.evaluate(() => ({ text: document.querySelector('.modal:last-child').textContent, battles: [0, 1, 2].map(i => !!document.querySelector(`[data-k="eb${i}"]`)) }));
	A(/first to 2 points/.test(scr.text) && scr.battles.every(Boolean), 'the screen: the rule and three battles', scr);
	const playTo = win => page.evaluate(async win => {
		const P = window.__pocket; P.fast && P.fast(true);
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		for (let n = 0; n < 3000 && !P.state().over; n++) { const S = P.state();
			if (S.phase === 'main' && S.turn >= 3) { await P.act({ t: 'concede', seat: win ? 1 : 0 }); continue; }
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); }
		return P.state().over && P.state().over.winner; }, win);
	const s0 = await page.evaluate(() => window.__pocket.stars());
	await click('eb0'); await sleep(600);
	A(await page.evaluate(() => { const c = window.__pocket.recipe().config; return c.event && c.event.i === 0 && c.opts && c.opts.points === 2 && window.__pocket.state().opts.points === 2; }), 'battle 1: an event match, played to 2 points');
	await playTo(true); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	const n1 = await page.evaluate(() => (document.querySelector('.pe-eventnote') || {}).textContent || ''), s1 = await page.evaluate(() => window.__pocket.stars());
	A(/Event battle 1 won: \+100 ★/.test(n1) && s1 - s0 >= 100, 'a win: "Event battle 1 won: +100 ★", the stars paid', { n1, s0, s1 });
	await click('eventback'); await sleep(300);
	A(await page.evaluate(() => /✓ Battle 1/.test(document.querySelector('[data-k="eb0"]').textContent)), 'battle 1 marked ✓');
	await click('eb0'); await sleep(600); await playTo(true); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	A(/Won again/.test(await page.evaluate(() => document.querySelector('.pe-eventnote').textContent)), 'a second win of it: "Won again", nothing paid');
	await click('eventback'); await sleep(300); await click('eb1'); await sleep(600); await playTo(false); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	A(/Not this time/.test(await page.evaluate(() => document.querySelector('.pe-eventnote').textContent)), 'a loss: "Not this time: try again"');
	await page.evaluate(() => { while (document.querySelector('.modal')) { const l = document.querySelector('.modal [data-k="leave"]'); if (l) { l.click(); break; } const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } }); await sleep(400);
	A(/\(1 \/ 3\)/.test(await menu()), 'the main menu: (1 / 3)', await menu());
	A(!errors.length, 'no page errors', errors.slice(0, 3));
	await ctx.close();
	// an Apex-only week
	const apex = await at(weekWith('apex'));
	await apex.page.evaluate(() => document.querySelector('[data-k="event"]').click()); await sleep(400);
	const ap = await apex.page.evaluate(() => ({ built: !!document.querySelector('[data-k="edbuilt"]'), none: /None of your decks keeps this rule/.test(document.querySelector('.modal:last-child').textContent) }));
	A(ap.built || ap.none, 'an Apex-only week: a deck built from my cards, or the reason there is none', ap);
	A(!apex.errors.length, 'no page errors (Apex week)', apex.errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
