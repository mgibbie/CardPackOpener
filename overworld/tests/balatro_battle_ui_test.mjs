// balatro_battle_ui_test.mjs — the Pokémon battle screens in the site's Balatro-style kit (site/ui/canvas.js +
// site/ui/sfx.js), in a real browser, desktop landscape + phone portrait:
//   - a wild battle boots with no errors; the bottom bar and the info panels are kit panels (the --bal-panel grey),
//     FIGHT / BAG / PKMN / RUN are kit buttons in the kit's red / orange / green / blue, a move button wears its
//     type's colour, BACK is the kit's orange, and the labels are drawn in the m6x11 font;
//   - the kit's button sounds: nothing before a gesture; a key press (Z) and a tap play Micatro's button.ogg, X plays
//     cancel.ogg (spied at AudioBufferSourceNode.start and the .ogg fetches);
//   - the old paths still work: Z / X / arrows drive the menu, a tap on a button acts on it (FIGHT opens the moves,
//     BACK returns, a tapped BAG opens the bag list), and every button's hit box is unchanged;
//   - a live PvP battle (pvp.js) draws the same kit panel + buttons and its menu presses with a sound.
//   node overworld/tests/balatro_battle_ui_test.mjs        (screenshots: SHOTS=<dir>)
// Covers overworld/battleui.js, overworld/battle.js (draw / key / tap), overworld/pvp.js (draw / key).
import fs from 'fs';
import path from 'path';
import { makeAsserter, startServer, launch, sleep, waitFor, openOverworld, canvasToClient } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const SHOTS = process.env.SHOTS || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const KIT = { panel: [0x3a, 0x4b, 0x4f], red: [0xfe, 0x5f, 0x55], orange: [0xfd, 0xa2, 0x00], green: [0x4b, 0xc2, 0x92], blue: [0x00, 0x9d, 0xff], water: [0x68, 0x90, 0xf0] };
const near = (px, c, tol = 10) => !!px && Math.abs(px[0] - c[0]) <= tol && Math.abs(px[1] - c[1]) <= tol && Math.abs(px[2] - c[2]) <= tol;

// Spy on WebAudio before any page script (as site_ui_kit_test does): AudioContexts made, sources started, .ogg fetched.
const SPY = () => {
	window.__au = { ctx: 0, starts: 0, fetched: [] };
	const AC = window.AudioContext;
	if (AC) {
		window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__au.ctx++; } };
		const st = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts++; return st.apply(this, a); };
	}
	const f = window.fetch;
	window.fetch = function (u, ...a) { const s = String(u && u.url || u); if (/\.ogg/.test(s)) window.__au.fetched.push(s.split('/').pop().split('?')[0]); return f.call(this, u, ...a); };
	// the fonts every label is drawn in (CanvasRenderingContext2D.fillText)
	window.__fonts = {};
	const ft = CanvasRenderingContext2D.prototype.fillText;
	CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__fonts[String(t)] = this.font; return ft.call(this, t, ...a); };
};

// a pixel of the game canvas (canvas px)
const px = (page, x, y) => page.evaluate((x, y) => Array.from(document.getElementById('screen').getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data), x, y);
// a button's box from the battle's hit list, and a point on its face clear of the label
const box = (page, id, which = 'battle') => page.evaluate((id, which) => {
	const ui = which === 'pvp' ? window.__pvpCore?.pvp.active?.ui : window.__ow.battle.ui;
	const b = (ui || []).find(b => b.id === id); return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
}, id, which);
const facePt = (b) => ({ x: b.x + b.w * 0.08, y: b.y + b.h * 0.3 });
const phase = (page) => page.evaluate(() => window.__ow.battle.active?.phase || null);
const waitPhase = (page, p, ms = 8000) => waitFor(async () => (await phase(page)) === p, ms);
const au = (page) => page.evaluate(() => ({ ...window.__au, fetched: [...window.__au.fetched] }));

async function startWild(page) {
	await page.evaluate(() => { window.__done = null; window.__ow.battle.start(window.__ow.party, 'pidgey', 5, r => { window.__done = r; }); });
	// let the intro messages play out to the command menu
	for (let i = 0; i < 80 && (await phase(page)) !== 'menu'; i++) { await page.evaluate(() => window.__ow.battle.fastForward()); await sleep(120); }
	await sleep(300);
}

const { server, port } = await startServer();
const browser = await launch();
try {
	// ------------------------------------------------------------------ desktop landscape: a wild battle
	{
		const o = await openOverworld(browser, port, { viewport: { width: 1280, height: 860 } });
		const { page, errors } = o;
		await page.evaluateOnNewDocument(SPY);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)), 45000);
		await sleep(1200);
		for (let i = 0; i < 10 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.evaluate(() => window.__ow.dialog.key('x')); await sleep(80); }
		A((await au(page)).ctx === 0, 'desktop: no AudioContext before a user gesture');
		await startWild(page);
		A((await phase(page)) === 'menu', 'desktop: a wild battle reaches the command menu', await phase(page));
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'battle_menu_desktop.png') });

		// the bottom bar: a kit panel
		const geo = await page.evaluate(async () => {
			const UI = await import('/overworld/battleui.js');
			const c = document.getElementById('screen');
			return UI.layout(c.width, c.height);
		});
		const W = await page.evaluate(() => document.getElementById('screen').width);
		const barPx = await px(page, W * 0.45, geo.barY + (geo.barH - 8 * geo.ubar) * 0.9);
		A(near(barPx, KIT.panel), 'desktop: the bottom bar is a kit panel (--bal-panel #3a4b4f)', JSON.stringify(barPx));
		const foePanelPx = await px(page, 14 * geo.u + 120 * geo.u, 14 * geo.u + 70 * geo.u);
		A(near(foePanelPx, KIT.panel), "desktop: the foe's info panel is a kit panel", JSON.stringify(foePanelPx));

		// the four commands: kit buttons in red / orange / green / blue
		const want = [['menu:0', KIT.red, 'FIGHT red'], ['menu:1', KIT.orange, 'BAG orange'], ['menu:2', KIT.green, 'PKMN green'], ['menu:3', KIT.blue, 'RUN blue']];
		for (const [id, col, what] of want) {
			// (the selected one wears the white cursor ring and a lighter face: select another first)
			await page.evaluate((i) => { window.__ow.battle.active.menuIdx = (i + 1) % 4; }, +id.split(':')[1]);
			await sleep(150);
			const b = await box(page, id);
			const p = b && await px(page, facePt(b).x, facePt(b).y);
			A(b && near(p, col), `desktop: ${what} is a kit button face`, JSON.stringify(p));
		}
		const fights = await page.evaluate(() => window.__fonts.FIGHT || '');
		A(/m6x11/.test(fights), 'desktop: the button labels are drawn in m6x11 (the kit font)', fights);
		A(await page.evaluate(() => document.fonts.check('16px m6x11plus')), 'desktop: the m6x11 font is loaded');

		// keyboard: Z on FIGHT opens the moves, with the kit's button sound (a real keydown is the gesture)
		await page.evaluate(() => { window.__ow.battle.active.menuIdx = 0; });
		await page.keyboard.press('z');
		A(await waitPhase(page, 'moves'), 'desktop: Z on FIGHT opens the moves (keyboard path kept)', await phase(page));
		A(await waitFor(async () => { const s = await au(page); return s.fetched.includes('button.ogg') && s.starts > 0; }, 6000),
			'desktop: the press plays the kit button sound (button.ogg through WebAudio)', JSON.stringify(await au(page)));
		await sleep(300);
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'battle_moves_desktop.png') });
		await page.evaluate(() => { window.__ow.battle.active.moveIdx = 1; });
		await sleep(150);
		const mv = await box(page, 'move:0');
		const mvPx = mv && await px(page, mv.x + mv.w * 0.45, mv.y + mv.h * 0.1);
		A(mv && near(mvPx, KIT.water, 14), "desktop: a move button wears its type's colour (SURF = Water)", JSON.stringify(mvPx));
		const back = await box(page, 'back');
		const backPx = back && await px(page, facePt(back).x, facePt(back).y);
		A(back && near(backPx, KIT.orange), 'desktop: BACK is the kit orange', JSON.stringify(backPx));

		// X goes back, with the cancel sound
		const before = (await au(page)).starts;
		await page.keyboard.press('x');
		A(await waitPhase(page, 'menu'), 'desktop: X returns to the command menu', await phase(page));
		await sleep(250);
		A(await waitFor(async () => { const s = await au(page); return s.fetched.includes('cancel.ogg') && s.starts > before; }, 6000),
			'desktop: X plays the kit back sound (cancel.ogg)', JSON.stringify(await au(page)));

		// a tap (mouse click on the canvas) on BAG opens the bag list and sounds (one mon: PKMN has no list)
		const pk = await box(page, 'menu:1');
		const s0 = (await au(page)).starts;
		const pt = await canvasToClient(page, pk.x + pk.w / 2, pk.y + pk.h / 2);
		await page.mouse.click(pt.x, pt.y);
		A(await waitPhase(page, 'bag'), 'desktop: tapping BAG opens the bag list (tap path kept)', await phase(page));
		await sleep(250);
		A(await waitFor(async () => (await au(page)).starts > s0, 4000), 'desktop: the tap plays a press sound');
		const bk = await box(page, 'back');
		const pt2 = await canvasToClient(page, bk.x + bk.w / 2, bk.y + bk.h / 2);
		await page.mouse.click(pt2.x, pt2.y);
		A(await waitPhase(page, 'menu'), 'desktop: tapping BACK returns to the menu');

		// sound off (Micatro's setting) is silence
		await page.evaluate(() => localStorage.setItem('micatro_sfx', '0'));
		const s1 = (await au(page)).starts;
		await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
		await sleep(500);
		A((await au(page)).starts === s1, "desktop: with Micatro's sound setting off the menu is silent");
		await page.evaluate(() => localStorage.removeItem('micatro_sfx'));

		// the message box: text in m6x11 with the kit look, the tap-anywhere advance kept
		await page.evaluate(() => { const b = window.__ow.battle, a = b.active; a.phase = 'msg'; a.msg = 'A wild test message!'; a.msgT = 0; });
		await sleep(250);
		A(/m6x11/.test(await page.evaluate(() => window.__fonts['A wild test message!'] || '')), 'desktop: the message box text is m6x11');
		A(await page.evaluate(() => window.__ow.battle.ui.some(b => b.id === 'advance')), 'desktop: the message box keeps its tap-to-advance area');
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'battle_msg_desktop.png') });
		await page.evaluate(() => { window.__ow.battle.active.phase = 'menu'; });

		A(errors.length === 0, 'desktop: no page errors', errors.slice(0, 3).join(' | '));
		await o.ctx.close();
	}

	// ------------------------------------------------------------------ phone portrait: the thumb deck
	{
		const o = await openOverworld(browser, port, { viewport: { width: 390, height: 844 }, touch: true });
		const { page, errors } = o;
		await startWild(page);
		await sleep(400);
		A((await phase(page)) === 'menu', 'phone: the battle reaches the command menu');
		await page.evaluate(() => { window.__ow.battle.active.menuIdx = 1; });   // (the cursor off FIGHT: its face is then plain)
		await sleep(200);
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'battle_menu_phone.png') });
		const f = await box(page, 'menu:0');
		const fp = f && await px(page, facePt(f).x, facePt(f).y);
		A(f && near(fp, KIT.red), 'phone: FIGHT is the kit red button', JSON.stringify(fp));
		const cssW = f && await page.evaluate((w) => w * document.getElementById('screen').getBoundingClientRect().width / document.getElementById('screen').width, f.w);
		A(cssW >= 44, 'phone: the command buttons stay finger-sized (>= 44 CSS px)', cssW);
		const pt = await canvasToClient(page, f.x + f.w / 2, f.y + f.h / 2);
		await page.touchscreen.tap(pt.x, pt.y);
		A(await waitPhase(page, 'moves'), 'phone: a tap on FIGHT opens the moves');
		await sleep(300);
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'battle_moves_phone.png') });
		A(errors.length === 0, 'phone: no page errors', errors.slice(0, 3).join(' | '));
		await o.ctx.close();
	}

	// ------------------------------------------------------------------ live PvP (pvp.js): the same kit chrome
	{
		const o = await openOverworld(browser, port, { viewport: { width: 1280, height: 860 } });
		const { page, errors } = o;
		await page.evaluate(async () => {
			const core = await import('/overworld/ow_core.js');
			window.__pvpCore = core;
			const mon = (name, sp, types, mv) => ({ name, speciesId: sp, level: 50, types, curHP: 150, maxHP: 150, sprite: 's131.png', boosts: {},
				moves: mv.map(([n, t, p]) => ({ name: n, type: t, power: p, category: 'Special', pp: 10, maxPp: 10 })) });
			const match = { seq: 1, events: [], over: false, sides: [
				{ name: 'ME', active: 0, party: [mon('LAPRAS', 'lapras', ['Water', 'Ice'], [['Surf', 'Water', 90], ['Ice Beam', 'Ice', 90]]), mon('EEVEE', 'eevee', ['Normal'], [['Tackle', 'Normal', 40]])] },
				{ name: 'YOU', active: 0, party: [mon('LAPRAS', 'lapras', ['Water', 'Ice'], [['Surf', 'Water', 90]])] }] };
			core.pvp.start('balatro-ui', match, 0, false, () => { });
			await new Promise(r => setTimeout(r, 300));
			if (core.pvp.active) { core.pvp.active.polling = false; core.pvp.active.menuIdx = 3; }   // no server here: hold the menu still; cursor on FORFEIT
			// count WebAudio sources started from here on (the AudioContext is only made at the first gesture)
			window.__starts = 0;
			const st = AudioBufferSourceNode.prototype.start;
			AudioBufferSourceNode.prototype.start = function (...a) { window.__starts++; return st.apply(this, a); };
		});
		await sleep(600);
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'pvp_menu_desktop.png') });
		const W = await page.evaluate(() => document.getElementById('screen').width);
		const geo = await page.evaluate(async () => { const UI = await import('/overworld/battleui.js'); const c = document.getElementById('screen'); return UI.layout(c.width, c.height); });
		const barPx = await px(page, W * 0.45, geo.barY + (geo.barH - 8 * geo.ubar) * 0.9);
		A(near(barPx, KIT.panel), 'pvp: the bottom bar is a kit panel', JSON.stringify(barPx));
		const fb = await box(page, 'menu:0', 'pvp'), sb = await box(page, 'menu:1', 'pvp');
		const fpx = fb && await px(page, facePt(fb).x, facePt(fb).y), spx = sb && await px(page, facePt(sb).x, facePt(sb).y);
		A(fb && near(fpx, KIT.red) && sb && near(spx, KIT.green), 'pvp: FIGHT / SWITCH are the kit red / green buttons', JSON.stringify([fpx, spx]));
		const pt = await canvasToClient(page, fb.x + fb.w / 2, fb.y + fb.h / 2);
		await page.mouse.click(pt.x, pt.y);
		A(await waitFor(() => page.evaluate(() => window.__pvpCore.pvp.active?.phase === 'moves'), 4000), 'pvp: tapping FIGHT opens the moves (tap path kept)');
		A(await waitFor(() => page.evaluate(() => window.__starts > 0), 6000), 'pvp: the press plays the kit button sound (a WebAudio source started)',
			await page.evaluate(() => window.__starts));
		await page.keyboard.press('x');
		A(await waitFor(() => page.evaluate(() => window.__pvpCore.pvp.active?.phase === 'menu'), 4000), 'pvp: X returns to the menu (keyboard path kept)');
		await page.evaluate(() => { const p = window.__pvpCore.pvp; if (p.active) { p.active.polling = false; p.active = null; } });
		A(errors.length === 0, 'pvp: no page errors', errors.slice(0, 3).join(' | '));
		await o.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
