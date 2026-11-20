// micasurvivor_m3d_sandbox_balatro_test.mjs — the 3D page's own chrome when no run is on it, in the site's Balatro kit
// (owner, 2026-11-19: every UI a visitor can reach in the Balatro style). A run's screen is runui.js (already the kit);
// without a run (the bare /micasurvivor/m3d/, a watch link before its run is known, ?gen / ?fight / ?host) the page
// showed its test-room readout, help line, map legend and pick-a-card screen in a system monospace on navy boxes.
// Desktop (1600x900) + phone (390x844):
//   - the page loads its 3D view with no errors, and the readout (#hud) is m6x11 (loaded) on the kit's panel colour;
//   - desktop: the help line too (a phone hides it, as before);
//   - the map legend and the pick-a-card screen (shown on demand: checked by their computed style) are kit panels with
//     the light outline, in m6x11; a card's tool buttons are kit grey on their darker lip.
//   node overworld/tests/micasurvivor_m3d_sandbox_balatro_test.mjs
// Covers micasurvivor/m3d/index.html.
import { makeAsserter, startServer, launch, waitFor, sleep, TOK, rgb, VIEWPORTS } from './bc_balatro_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
const browser = await launch();
const PANEL = rgb(TOK.panel).replace('rgb(', '').replace(')', '');   // "58, 75, 79"
try {
	for (const vp of ['desktop', 'phone']) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(VIEWPORTS[vp]);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(`http://localhost:${port}/micasurvivor/m3d/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
		const up = await waitFor(() => page.evaluate(() => (document.getElementById('hud').textContent || '').length > 10), 40000);
		A(up, `${vp}: the 3D test room draws and fills its readout`);
		await page.evaluate(() => document.fonts.ready.then(() => true)); await sleep(300);
		const L = await page.evaluate(() => {
			const cs = (s) => getComputedStyle(document.querySelector(s));
			// the on-demand screens: give each something to show, then read its look
			const cards = document.getElementById('cards'), h2 = document.createElement('h2'), card = document.createElement('button'), tools = document.createElement('div'), tool = document.createElement('button');
			h2.textContent = 'Pick one'; card.textContent = 'A card'; tools.className = 'tools'; tool.textContent = 'Reroll'; tools.appendChild(tool);
			cards.append(h2, card, tools);
			const c = getComputedStyle(card), t = getComputedStyle(tool), h = getComputedStyle(h2), lg = cs('#maplegend');
			const out = { hud: [cs('#hud').fontFamily, cs('#hud').backgroundColor], help: [cs('#help').fontFamily, cs('#help').backgroundColor, cs('#help').display],
				legend: [lg.fontFamily, lg.backgroundColor, lg.boxShadow], card: [c.fontFamily, c.backgroundColor, c.boxShadow], tool: [t.backgroundColor, t.boxShadow], h2: h.fontFamily,
				font: document.fonts.check('16px m6x11') };
			h2.remove(); card.remove(); tools.remove();
			return out;
		});
		A(/m6x11/.test(L.hud[0]) && L.font && L.hud[1].includes(PANEL), `${vp}: the readout is m6x11 on the kit panel`, JSON.stringify(L.hud));
		if (vp === 'desktop') A(/m6x11/.test(L.help[0]) && L.help[1].includes(PANEL), `${vp}: the help line is m6x11 on the kit panel`, JSON.stringify(L.help));
		else A(L.help[2] === 'none', `${vp}: a phone still hides the help line`, L.help[2]);
		A(/m6x11/.test(L.legend[0]) && L.legend[1] === rgb(TOK.panel) && L.legend[2].includes(rgb(TOK['outline-light'])), `${vp}: the map legend is a kit panel with the light outline, in m6x11`, JSON.stringify(L.legend));
		A(/m6x11/.test(L.card[0]) && L.card[1] === rgb(TOK.panel) && L.card[2].includes(rgb(TOK['outline-light'])) && L.card[2].includes(rgb(TOK['panel-dd'])), `${vp}: a pick-a-card choice is a kit panel on its lip with the light outline, in m6x11`, JSON.stringify(L.card));
		A(L.tool[0] === rgb(TOK.grey) && L.tool[1].includes(rgb(TOK['grey-d'])), `${vp}: a card screen's tool button is kit grey on its lip`, JSON.stringify(L.tool));
		A(/m6x11/.test(L.h2), `${vp}: the card screen's title is m6x11`, L.h2);
		A(!errors.length, `${vp}: no page errors`, errors.slice(0, 3).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'threw ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
