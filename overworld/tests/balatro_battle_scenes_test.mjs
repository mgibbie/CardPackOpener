// balatro_battle_scenes_test.mjs — the battle-like screens around the Pokémon battles in the site's Balatro-style kit
// (site/ui/canvas.js + sfx.js), in the real overworld page:
//   - the battle spectator / replay board (factoryspec.js drawBattleBoard): the kit's felt, the title / facility /
//     message / hint in m6x11; the replay controls press with the kit's sounds (Z button.ogg, X cancel.ogg) and still
//     play / pause / step / leave;
//   - the "N watching" badge (ow_frontier.js): a kit panel chip;
//   - the evolution screen: its message box is a kit panel drawn at full resolution, the text in m6x11;
//   - a Pokémon Contest (contest_ui.js): the MC's text box is a kit panel with white m6x11 text; on the move select
//     each move is a kit button (the chosen one blue), a tap on a move's row still picks it, and the pick presses
//     with the kit's button sound; the stage art stays.
//   node overworld/tests/balatro_battle_scenes_test.mjs        (screenshots: SHOTS=<dir>)
// Covers overworld/factoryspec.js, overworld/ow_frontier.js (drawWatchingBadge), overworld/evolution.js + ow_loop.js
// (drawHi), overworld/contest_ui.js (drawContest, contestKey).
import fs from 'fs';
import path from 'path';
import { makeAsserter, startServer, launch, sleep, waitFor, openOverworld, canvasToClient } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const SHOTS = process.env.SHOTS || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const near = (p, c, tol = 10) => !!p && Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;
const PANEL = hex('#3a4b4f');

const SPY = () => {
	window.__au = { starts: 0, fetched: [] };
	const AC = window.AudioContext;
	if (AC) {
		const st = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts++; return st.apply(this, a); };
	}
	const f = window.fetch;
	window.fetch = function (u, ...a) { const s = String(u && u.url || u); if (/\.ogg/.test(s)) window.__au.fetched.push(s.split('/').pop().split('?')[0]); return f.call(this, u, ...a); };
	window.__fonts = {};
	const ft = CanvasRenderingContext2D.prototype.fillText;
	CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__fonts[String(t)] = this.font; return ft.call(this, t, ...a); };
};
const px = (page, x, y) => page.evaluate((x, y) => Array.from(document.getElementById('screen').getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data), x, y);
const au = (page) => page.evaluate(() => ({ ...window.__au, fetched: [...window.__au.fetched] }));
const heard = (page, file, after) => waitFor(async () => { const s = await au(page); return s.fetched.includes(file) && s.starts > after; }, 6000);
const fontOf = (page, re) => page.evaluate((src) => { const r = new RegExp(src); const k = Object.keys(window.__fonts).find((t) => r.test(t)); return k ? window.__fonts[k] : null; }, re);

const { server, port } = await startServer();
const browser = await launch();
try {
	const o = await openOverworld(browser, port, { viewport: { width: 1280, height: 860 } });
	const { page, errors } = o;
	await page.evaluateOnNewDocument(SPY);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data && window.__ow.factorySpec)), 45000);
	await sleep(1200);
	for (let i = 0; i < 10 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.evaluate(() => window.__ow.dialog.key('x')); await sleep(80); }
	await page.keyboard.press('Shift');   // a user gesture: the kit's sounds may play from here on
	const W = await page.evaluate(() => document.getElementById('screen').width), H = await page.evaluate(() => document.getElementById('screen').height);

	// ------------------------------------------------------------------ the battle spectator board
	await page.evaluate(() => {
		const v = window.__ow.factorySpec;
		v.start('friendo'); v.active.polling = false;
		const mon = (name) => ({ name, level: 50, types: ['Water'], curHP: 80, maxHP: 120 });
		v.ingest({ snapshot: { kind: 'battle', facility: 'Wild battle', me: mon('LAPRAS'), foe: mon('DEWGONG'), msg: 'LAPRAS used SURF!' }, seq: 1, watchers: 2, over: false });
	});
	await sleep(400);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'scenes_spectator.png') });
	const corner = await px(page, 3, H * 0.45);
	A(corner[1] > corner[0] + 10 && corner[1] > corner[2], 'spectator: the board stands on the kit felt (green)', JSON.stringify(corner));
	A(/m6x11/.test(await fontOf(page, 'Watching friendo') || ''), 'spectator: the title is drawn in m6x11');
	A(/m6x11/.test(await fontOf(page, '^Wild battle') || ''), 'spectator: the facility line is drawn in m6x11');
	await page.evaluate(() => window.__ow.factorySpec.quit());
	await sleep(200);

	// a replay tape: the controls sound like kit buttons and still work
	await page.evaluate(() => {
		const mon = (name, hp) => ({ name, level: 50, types: ['Water'], curHP: hp, maxHP: 120 });
		const fr = (t, hp, msg) => ({ t, s: { kind: 'battle', facility: 'Replay test', me: mon('LAPRAS', 120), foe: mon('DEWGONG', hp), msg } });
		window.__ow.factorySpec.playTape({ label: 'Test replay', frames: [fr(0, 120, 'Go!'), fr(4000, 90, 'Hit!'), fr(8000, 60, 'Hit again!')] }, () => { window.__tapeDone = true; });
	});
	await sleep(300);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'scenes_replay.png') });
	A(/m6x11/.test(await fontOf(page, 'Z = pause') || ''), 'replay: the controls hint is drawn in m6x11');
	let s0 = (await au(page)).starts;
	await page.keyboard.press('z');
	A(await page.evaluate(() => window.__ow.factorySpec.active.playing === false), 'replay: Z pauses (key kept)');
	A(await heard(page, 'button.ogg', s0), 'replay: Z presses with the kit button sound (button.ogg)', JSON.stringify(await au(page)));
	await page.keyboard.press('ArrowRight');
	A(await page.evaluate(() => window.__ow.factorySpec.active.i === 1), 'replay: → steps a frame');
	s0 = (await au(page)).starts;
	await page.keyboard.press('x');
	A(await waitFor(() => page.evaluate(() => !window.__ow.factorySpec.blocking && window.__tapeDone === true), 3000), 'replay: X leaves');
	A(await heard(page, 'cancel.ogg', s0), 'replay: X plays the kit back sound (cancel.ogg)');

	// ------------------------------------------------------------------ the "N watching" badge
	const badge = await page.evaluate(async () => {
		const F = await import('/overworld/ow_frontier.js');
		return new Promise((res) => requestAnimationFrame(() => {   // (after the game loop's own frame)
			const c = document.getElementById('screen'), u = c.height / 480;
			F.drawWatchingBadge(c.width, c.height, 3);
			const g = c.getContext('2d');
			// the badge's right part: clear of the label, inside the outline
			res(Array.from(g.getImageData(Math.round(c.width - 12 * u - 8 * u), Math.round(12 * u + 13 * u), 1, 1).data));
		}));
	});
	A(near(badge, PANEL), 'badge: the "N watching" chip is a kit panel', JSON.stringify(badge));

	// ------------------------------------------------------------------ the evolution screen
	await page.evaluate(() => { const O = window.__ow; O.evolution.evolveNow(O.party[0], 'dewgong', O.battle.data); });
	A(await waitFor(() => page.evaluate(() => !!window.__ow.evolution.cur), 5000), 'evolution: the sequence starts');
	await sleep(400);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'scenes_evolution.png') });
	const evo = await page.evaluate(() => ({ font: Object.entries(window.__fonts).find(([t]) => /is evolving/.test(t))?.[1] || null, w: document.getElementById('screen').width }));
	A(/m6x11/.test(evo.font || ''), 'evolution: the message is drawn in m6x11 at full resolution', evo.font);
	const k = W / 240;
	const evoPx = await px(page, 7 * k, (160 - 8) * k);
	A(near(evoPx, PANEL), 'evolution: the message box is a kit panel', JSON.stringify(evoPx));
	await page.evaluate(() => { const E = window.__ow.evolution; E.cur = null; E.queue = []; });
	await sleep(200);

	// ------------------------------------------------------------------ a Pokémon Contest
	const started = await page.evaluate(async () => {
		const C = await import('/overworld/contest_ui.js');
		C.contestMenu.fast = true; C.contestMenu.seed = 7;
		window.__contestErr = null;
		C.runContest(window.__ow.party[0], 0, 0).catch((e) => { window.__contestErr = String(e && e.stack || e).slice(0, 300); });
		for (let i = 0; i < 100 && !/Hello/.test(C.contestView().text || ''); i++) await new Promise((r) => setTimeout(r, 50));
		return { text: C.contestView().text, err: window.__contestErr };
	});
	A(/Hello/.test(started.text || ''), 'contest: the MC opens the contest', JSON.stringify(started));
	await sleep(300);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'scenes_contest_stage.png') });
	const view = () => page.evaluate(async () => { const C = await import('/overworld/contest_ui.js'); return { v: C.contestView(), at: C.contestTapView() }; });
	let cv = await view();
	const gb = (gx, gy) => [cv.at.ox + gx * cv.at.k, cv.at.oy + gy * cv.at.k];
	const box = await px(page, ...gb(8, 152));
	A(near(box, PANEL), "contest: the MC's text box is a kit panel", JSON.stringify(box));
	const hello = await page.evaluate(() => Object.entries(window.__fonts).find(([t]) => /Hello/.test(t)));
	A(hello && /m6x11/.test(hello[1]), "contest: the MC's text is m6x11", JSON.stringify(hello));
	// to the move select
	for (let i = 0; i < 200; i++) {
		cv = await view();
		if (cv.v.phase === 'select' && cv.v.waiting) break;
		if (cv.v.waiting) await page.keyboard.press('z');
		await sleep(60);
	}
	A(cv.v.phase === 'select', 'contest: the move select opens', cv.v.phase);
	await sleep(300);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'scenes_contest_select.png') });
	const b0 = await px(page, ...gb(9, 87 + 3)), b1 = await px(page, ...gb(9, 87 + 16 + 3));
	A(near(b0, hex('#009dff')) && near(b1, hex('#5f7377')), 'contest: the moves are kit buttons (the chosen one blue, the others grey)', JSON.stringify([b0, b1]));
	const desc = await px(page, ...gb(88, 154));
	A(near(desc, PANEL), "contest: the move's description box is a kit panel", JSON.stringify(desc));
	// a tap on the second move's row picks it, with the kit's button sound
	const s1 = (await au(page)).starts;
	const [tx, ty] = gb(40, 87 + 16 + 8);
	const pt = await canvasToClient(page, tx, ty);
	await page.mouse.click(pt.x, pt.y);
	A(await waitFor(async () => { const v = (await view()).v; return v.choice === 1 && !(v.phase === 'select' && v.waiting); }, 3000), 'contest: a tap on a move\'s row picks it (tap path kept)', JSON.stringify((await view()).v.choice));
	A(await heard(page, 'button.ogg', s1), 'contest: the pick presses with the kit button sound');
	await page.evaluate(async () => { const C = await import('/overworld/contest_ui.js'); C.contestMenu.open = false; });

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
	await o.ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
