// route_cardmatch_test.mjs — route trainers at cards (owner's third improvement list, 2026-11-18, "yes to all": "Some
// beaten trainers on routes (Cooltrainers, Gamers, Super Nerds) offer a card match with a deck of their type, for smaller
// once-a-day stars than a Gym Leader"). overworld/ow_screens.js offerRouteMatch, ow_input.js; pocketenhanced/js/trainers.js
// routeTrainer, main.js.
//   1. a beaten Cooltrainer (Route 111, Brooke) talked to: "Fancy a game of cards?" with CARD MATCH / TALK, TALK
//      highlighted; TALK talks as always
//   2. CARD MATCH (Up, then A): Pocket Enhanced opens against them, ?trainer=route:<type>:<their name>
//   3. not asked: a beaten Youngster (not a card-playing class)
//   4. Pocket: the match is against "Cooltrainer Brooke" with a deck of that Energy type; a win pays 25 stars once a day;
//      route wins do not count toward the Gym Leader emblems
//   5. a key that is not a trainer's is not a match (the main menu instead)
//   node overworld/tests/route_cardmatch_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor } from './ow_controls_lib.mjs';
import { routeTrainer, trainerByKey, trainerDeck, ROUTE_STARS } from '../../pocketenhanced/js/trainers.js';

const R = makeAsserter(), A = R.A;
// ===== keys =====
A(routeTrainer('route:Fire:Cooltrainer Brooke')?.name === 'Cooltrainer Brooke' && routeTrainer('route:Fire:Cooltrainer Brooke').stars === ROUTE_STARS && !routeTrainer('route:Plasma:X') && !routeTrainer('route:Fire:<script>') && !trainerByKey('route:Fire:Cooltrainer Brooke') && !!trainerByKey('route:Fire:Cooltrainer Brooke', true), 'route keys: a name and a type; a bad type or name is none; only read where route trainers are wanted');
{ const d = trainerDeck(routeTrainer('route:Water:Cooltrainer Brooke')); A(d && d.energy.join() === 'Water', "a route trainer's deck is of their type (Water)", d && d.energy); }
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const setup = async (map, x, y, scripts) => {
		const t = await openOverworld(browser, port, { url: `/overworld/index.html?map=${map}&x=${x}&y=${y}` });
		await t.page.evaluate(ss => { const W = window.__ow; for (const k of ss) { const tr = W.trainers.list.find(x => x.ev && x.ev.script === k); if (tr) W.trainers.markDefeated(tr); } }, scripts);
		return t;
	};
	const faceAndTalk = (page, script) => page.evaluate(s => {
		const W = window.__ow, tr = W.trainers.list.find(x => x.ev && x.ev.script === s); if (!tr) return null;
		W.player.tx = tr.tx; W.player.ty = tr.ty + 1; W.player.x = tr.tx * 16; W.player.y = (tr.ty + 1) * 16; W.player.facing = 'up'; W.player.moving = false;
		W.interact(); return { tx: tr.tx, ty: tr.ty };
	}, script);
	const asked = page => page.evaluate(async () => { const M = (await import('./choice.js')).choiceMenu, L = window.__owChoiceLog || [], last = L[L.length - 1]; return { open: M.open, idx: M.idx, prompt: M.prompt, list: last && last.list, options: last && last.options }; });
	// ===== 1 =====
	const t = await setup('Route111', 10, 10, ['Route111_EventScript_Brooke']);
	const at = await faceAndTalk(t.page, 'Route111_EventScript_Brooke'); await sleep(250);
	const q = await asked(t.page);
	A(!!at && q.open && q.list === 'route_cardmatch' && q.options.join() === 'CARD MATCH,TALK' && q.idx === 1 && /Brooke: Fancy a game of cards\?/.test(q.prompt), 'a beaten Cooltrainer: "Fancy a game of cards?", CARD MATCH / TALK, TALK highlighted', { at, q });
	await t.page.keyboard.press('KeyZ'); await sleep(400);
	const talk = await t.page.evaluate(async () => ({ menu: (await import('./choice.js')).choiceMenu.open, dialog: !!window.__ow.dialog.blocking }));
	A(!talk.menu && talk.dialog, 'TALK (A): she talks as always', talk);
	for (let i = 0; i < 30 && await t.page.evaluate(() => window.__ow.dialog.blocking || (window.__ow.cutscene && window.__ow.cutscene.active)); i++) { await t.page.keyboard.press('KeyX'); await sleep(100); }
	// ===== 2 =====
	await faceAndTalk(t.page, 'Route111_EventScript_Brooke'); await sleep(250);
	const nav = t.page.waitForNavigation({ timeout: 15000 }).catch(() => null);
	await t.page.keyboard.press('ArrowUp'); await sleep(120); await t.page.keyboard.press('KeyZ'); await nav;
	const url = decodeURIComponent(t.page.url());
	A(/\/pocketenhanced\/\?trainer=route:[A-Za-z]+:Cooltrainer Brooke$/.test(url), 'CARD MATCH: Pocket Enhanced opens against her (?trainer=route:<type>:Cooltrainer Brooke)', url);
	// ===== 4. Pocket =====
	const key = url.split('trainer=')[1];
	await t.page.evaluateOnNewDocument(() => { try { const p = JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1') || '{}'); p.tutored = true; localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify(p)); } catch (e) { /* */ } });
	await t.page.goto(`http://localhost:${port}/pocketenhanced/?trainer=${encodeURIComponent(key)}&seed=rt1`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => t.page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(600);
	const cfg = await t.page.evaluate(() => { const c = window.__pocket.recipe() && window.__pocket.recipe().config; return c ? { trainer: c.trainer, opp: c.players[1].name, energy: c.players[1].energy } : null; });
	const type = key.split(':')[1];
	A(cfg && cfg.trainer === key && cfg.opp === 'Cooltrainer Brooke' && cfg.energy.join() === type, `a match against Cooltrainer Brooke, a ${type} deck`, cfg);
	const s0 = await t.page.evaluate(() => window.__pocket.stars());
	await t.page.evaluate(async () => { const P = window.__pocket, { nextAction } = await import('/pocketenhanced/js/ai.js'); P.fast && P.fast(true);
		for (let n = 0; n < 3000 && !P.state().over; n++) { const S = P.state(); if (S.phase === 'main' && S.turn >= 2) { await P.act({ t: 'concede', seat: 1 }); continue; }
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); } });
	await waitFor(() => t.page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	const end = await t.page.evaluate(() => ({ note: (document.querySelector('.pe-trainer') || {}).textContent || '', stars: window.__pocket.stars(), paid: JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).trainerPaid || {} }));
	A(/Cooltrainer Brooke: \+25 ★/.test(end.note) && end.stars - s0 >= ROUTE_STARS && end.stars - s0 < 150 && end.paid[key], 'a win: "Cooltrainer Brooke: +25 ★" (less than a Gym Leader), noted paid today', { ...end, s0 });
	const gyms = await t.page.evaluate(async () => { const T = await import('/pocketenhanced/js/trainers.js'); return Object.keys(JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).trainerPaid || {}).filter(k => T.trainerByKey(k)).length; });
	A(gyms === 0, 'route wins do not count as Gym Leaders beaten (the Badge Case / Card Champion emblems)', gyms);
	A(!t.errors.length, 'no page errors', t.errors.slice(0, 3));
	await t.ctx.close();
	// ===== 3 =====
	const y = await setup('Route102', 10, 10, ['Route102_EventScript_Allen']);
	await faceAndTalk(y.page, 'Route102_EventScript_Allen'); await sleep(300);
	A((await asked(y.page)).list !== 'route_cardmatch', 'a beaten Youngster: no card-match question');
	await y.ctx.close();
	// ===== 5 =====
	const z = await browser.createBrowserContext(), zp = await z.newPage();
	await zp.goto(`http://localhost:${port}/pocketenhanced/?trainer=${encodeURIComponent('route:Plasma:Nobody')}`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => zp.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	A(await zp.evaluate(() => !window.__pocket.recipe() && !!document.querySelector('[data-k="online"]')), 'a key that is not a trainer: no match, the main menu');
	await z.close();
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
