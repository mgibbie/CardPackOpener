// gym_cardmatch_test.mjs — a beaten Gym Leader, talked to in their gym, offers a card match (owner's second improvement
// list, 2026-11-18, "yes to all": "Gym Leaders in their gyms ... challenge you at cards"). overworld/ow_screens.js
// offerCardMatch/goCardMatch, ow_input.js interact.
//   1. Brock beaten and the Boulder Badge earned: talking to him (Z) asks "Up for a card match?" with CARD MATCH / TALK
//   1b. TALK is the one highlighted (A pressed through his lines talks; a card match is chosen on purpose)
//   2. TALK: talking to him goes on as it always did (his own line), and the question is not asked again on top of it
//   3. B closes the question: nothing else happens
//   4. CARD MATCH (Up, then A): the game is saved and Pocket Enhanced opens with ?trainer=KANTO:boulder
//   5. not asked: Brock beaten but no badge on this device; an ordinary beaten trainer (Liam)
//   node overworld/tests/gym_cardmatch_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const setup = async ({ badge = true } = {}) => {
		const t = await openOverworld(browser, port, { url: '/overworld/index.html?map=PewterCity_Gym&x=6&y=7' });
		await t.page.evaluate(async badge => {
			const W = window.__ow, B = W.Badges;
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: badge ? { KANTO: { boulder: true } } : {}, champion: {} })); B._reset && B._reset();
			for (const k of ['PewterCity_Gym_EventScript_Brock', 'PewterCity_Gym_EventScript_Liam']) { const tr = W.trainers.list.find(x => x.ev && x.ev.script === k); if (tr) W.trainers.markDefeated(tr); }
		}, badge);
		return t;
	};
	// face a trainer and talk (Z): stand on the tile below them, facing up
	const faceAndTalk = async (page, script) => page.evaluate(s => {
		const W = window.__ow, tr = W.trainers.list.find(x => x.ev && x.ev.script === s); if (!tr) return null;
		W.player.tx = tr.tx; W.player.ty = tr.ty + 1; W.player.x = tr.tx * 16; W.player.y = (tr.ty + 1) * 16; W.player.facing = 'up'; W.player.moving = false;
		W.interact(); return { tx: tr.tx, ty: tr.ty };
	}, script);
	const menuOf = page => page.evaluate(() => { const L = window.__owChoiceLog || []; const last = L[L.length - 1]; return last && last.list === 'gym_cardmatch' ? last : null; });
	const open = page => page.evaluate(async () => (await import('./choice.js')).choiceMenu.open);
	const prompt = page => page.evaluate(async () => (await import('./choice.js')).choiceMenu.prompt);
	// ===== 1 =====
	const t = await setup(); const { page } = t;
	const at = await faceAndTalk(page, 'PewterCity_Gym_EventScript_Brock');
	await sleep(200);
	const m1 = await menuOf(page);
	A(!!at && await open(page) && m1 && m1.options.join() === 'CARD MATCH,TALK' && /Brock: Up for a card match\?/.test(await prompt(page)), 'Brock beaten, Boulder Badge earned: "Brock: Up for a card match?" — CARD MATCH / TALK', { at, m1, prompt: await prompt(page) });
	// ===== 2. TALK =====
	A(await page.evaluate(async () => (await import('./choice.js')).choiceMenu.idx) === 1, 'TALK is the one highlighted: pressing A through his lines never leaves for Pocket Enhanced');
	await page.keyboard.press('KeyZ'); await sleep(400);
	const talk = await page.evaluate(async () => ({ menu: (await import('./choice.js')).choiceMenu.open, dialog: !!window.__ow.dialog.blocking || !!(window.__ow.cutscene && window.__ow.cutscene.active), text: (window.__ow.dialog.pages || []).flat().join(' ') }));
	A(!talk.menu && talk.dialog, 'TALK: he talks as he always did, no second question', talk);
	for (let i = 0; i < 30 && await page.evaluate(() => window.__ow.dialog.blocking || (window.__ow.cutscene && window.__ow.cutscene.active)); i++) { await page.keyboard.press('KeyX'); await sleep(120); }
	// ===== 3. B =====
	await faceAndTalk(page, 'PewterCity_Gym_EventScript_Brock'); await sleep(200);
	await page.keyboard.press('KeyX'); await sleep(300);
	const b = await page.evaluate(async () => ({ menu: (await import('./choice.js')).choiceMenu.open, dialog: !!window.__ow.dialog.blocking, url: location.pathname }));
	A(!b.menu && !b.dialog && /overworld/.test(b.url), 'B closes the question: nothing else happens', b);
	// ===== 4. CARD MATCH =====
	await faceAndTalk(page, 'PewterCity_Gym_EventScript_Brock'); await sleep(200);
	const nav = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
	await page.keyboard.press('ArrowUp'); await sleep(120); await page.keyboard.press('KeyZ'); await nav;
	A(/\/pocketenhanced\/\?trainer=KANTO%3Aboulder$/.test(page.url()), 'CARD MATCH: Pocket Enhanced opens with ?trainer=KANTO:boulder', page.url());
	A(!t.errors.length, 'no page errors', t.errors.slice(0, 3));
	await t.ctx.close();
	// ===== 5 =====
	const u = await setup({ badge: false });
	await faceAndTalk(u.page, 'PewterCity_Gym_EventScript_Brock'); await sleep(300);
	A(!(await menuOf(u.page)), 'no Boulder Badge on this device: no card-match question');
	for (let i = 0; i < 30 && await u.page.evaluate(() => window.__ow.dialog.blocking || (window.__ow.cutscene && window.__ow.cutscene.active)); i++) { await u.page.keyboard.press('KeyX'); await sleep(100); }
	await u.ctx.close();
	const v = await setup();
	await faceAndTalk(v.page, 'PewterCity_Gym_EventScript_Liam'); await sleep(300);
	A(!(await menuOf(v.page)), 'an ordinary beaten trainer (Liam): no card-match question');
	await v.ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
