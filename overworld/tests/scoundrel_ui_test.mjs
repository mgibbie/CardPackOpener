// scoundrel_ui_test.mjs — the web-native Scoundrel (/scoundrel/) in a real browser, desktop + phone:
// it boots on Micatro's UI (the card sprites, font, panels), plays a whole dungeon through the
// page's own inputs (card clicks / taps, the Run! and fight buttons, the keyboard, a controller),
// resumes on the exact frame after a reload (mid-room AND mid fight choice), descends into
// dungeon 2 with max HP 19, then dies, and watches the run's replay.
//   node overworld/tests/scoundrel_ui_test.mjs      (screenshots: SCOUNDREL_SHOTS=<dir>)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as E from '../../scoundrel/js/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const SHOTS = process.env.SCOUNDREL_SHOTS || null;
const PORT = 8656;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }
// the real clear of dungeon 1 on seed3 (scoundrel_engine_test.mjs)
const SEED = 'seed3';
const RECIPE = '10br2w111w0r0w0w1wr1w1w1r010w320w1r1r1w1w1w0r1w01w2wr20w00w1w0r30w0w20w1w00w0w';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const VIEWPORTS = [
	['desktop', { width: 1600, height: 900, deviceScaleFactor: 1 }],
	['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
try {
	for (const [name, vp] of VIEWPORTS) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
		await page.evaluateOnNewDocument(() => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch { /* ignore */ }
			// a controller the test can press (site/gamepad.js reads navigator.getGamepads)
			const btn = () => ({ pressed: false, value: 0, touched: false });
			window.__fakePad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
			navigator.getGamepads = () => [window.__fakePad];
		});
		const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}_${n}.png`) }); };
		const ready = () => waitFor(() => page.evaluate(() => !!(window.__scoundrel && window.__scoundrel.ready)), 20000);
		const idle = () => waitFor(() => page.evaluate(() => window.__scoundrel.idle()), 8000);
		const view = () => page.evaluate(() => window.__scoundrel.view());
		const nActs = async () => (await view()).n;

		await page.goto(`http://localhost:${PORT}/scoundrel/`, { waitUntil: 'domcontentloaded' });
		A(await ready(), `${name}: the page boots`);
		const boot = await page.evaluate(() => ({
			menu: !!document.querySelector('.menu-modal .b-new'),
			font: getComputedStyle(document.body).fontFamily,
			micatroCss: [...document.styleSheets].some((s) => /micatro\/css\/micatro\.css/.test(s.href || '')),
			love: !!document.querySelector('script[src*="love.js"]') || !!window.Module,
		}));
		A(boot.menu && boot.micatroCss && /m6x11/.test(boot.font) && !boot.love, `${name}: main menu on Micatro's look (micatro.css, the m6x11 font), no love.js`, JSON.stringify(boot));
		await shot('menu');

		// start the seeded run from the menu: ?seed= starts it straight away
		await page.goto(`http://localhost:${PORT}/scoundrel/?seed=${SEED}`, { waitUntil: 'domcontentloaded' });
		await ready(); await idle();
		let v = await view();
		A(v && v.dungeon === 1 && v.hp === 20 && v.maxHp === 20 && v.room.length === 4 && v.seed === SEED, `${name}: a seeded run starts: dungeon 1, 20/20 HP, a room of 4`);
		const cards = await page.evaluate(() => [...document.querySelectorAll('.cards-layer .card')].map((e) => ({ id: +e.dataset.id, face: !!e.querySelector('canvas.card-face') })));
		A(cards.length === 4 && cards.every((c) => c.face) && v.room.every((c) => cards.some((x) => x.id === c.id)), `${name}: the room is drawn with Micatro's card sprites (canvas faces)`);
		const hud = await page.evaluate(() => document.querySelector('.sc-hp-v').textContent + '|' + document.querySelector('.sc-dname').textContent);
		A(hud === '20 / 20|Dungeon 1', `${name}: HUD shows health and the dungeon`, hud);
		// the stage fits the screen (no horizontal scroll), every room card on screen
		const fit = await page.evaluate(() => {
			const st = document.getElementById('stage').getBoundingClientRect();
			const cs = [...document.querySelectorAll('.cards-layer .card')].map((e) => e.getBoundingClientRect());
			return { st: [st.left, st.right, st.top, st.bottom], vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, cards: cs.every((r) => r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1) };
		});
		A(fit.st[0] >= -1 && fit.st[1] <= fit.vw + 1 && fit.sw <= fit.vw && fit.cards, `${name}: the table fits the screen, no horizontal scroll`, JSON.stringify(fit));
		A(await page.evaluate(() => document.getElementById('stage').classList.contains(innerWidth < innerHeight ? 'portrait' : 'landscape')), `${name}: ${vp.width < vp.height ? 'portrait (phone)' : 'landscape'} layout`);
		await shot('room');

		// --- play the recipe through the page's own inputs ---
		const clickCard = async (i) => {
			await idle();
			const id = (await view()).room[i].id;
			const r = await page.evaluate((id) => { const e = document.querySelector(`.cards-layer .card[data-id="${id}"]`); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
			if (vp.hasTouch) await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y);
		};
		const clickSel = async (sel) => { await idle(); await page.evaluate((s) => document.querySelector(s).click(), sel); };
		const key = (k) => page.keyboard.press(k);
		// the owner's scheme (controls sweep B7): Z = the Weapon in a fight, C (or B) bare-handed, V (or Space) run
		let alt = 0;
		const KEY = { r: () => (alt++ % 2 ? 'KeyV' : 'Space'), w: () => 'KeyZ', b: () => (alt++ % 2 ? 'KeyC' : 'b'), c: () => 'Escape', d: () => 'Enter' };
		async function play(a, how) {
			const before = await nActs();
			if (how === 'ui') {
				if (/[0-3]/.test(a)) await clickCard(+a);
				else if (a === 'r') await clickSel('.b-run');
				else if (a === 'w') await clickSel('.b-weapon');
				else if (a === 'b') await clickSel('.b-unarmed');
				else if (a === 'd') await clickSel('.b-descend');
			} else if (/[0-3]/.test(a)) await key(String(+a + 1));
			else await key(KEY[a]());
			return waitFor(async () => (await nActs()) === before + 1, 4000);
		}
		let okAll = true;
		// the first room by clicks / taps (+ a fight choice), then a mix
		for (let i = 0; i < 12; i++) okAll = (await play(RECIPE[i], 'ui')) && okAll;
		A(okAll, `${name}: 12 actions through ${vp.hasTouch ? 'taps' : 'clicks'} (cards, Run!, Weapon / Unarmed buttons)`);

		// --- resume mid-room: reload, Continue, same frame ---
		// stop where a room is half played
		let k = 12;
		while (k < RECIPE.length) {
			const s = E.replay(SEED, RECIPE.slice(0, k));
			if (s.state === E.STATE.CHOOSING && s.resolved > 0) break;
			okAll = (await play(RECIPE[k], 'key')) && okAll; k++;
		}
		const before = JSON.stringify(await view());
		A(JSON.parse(before).resolved > 0, `${name}: stopped mid-room (${JSON.parse(before).resolved}/3 played)`);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await ready();
		A(await page.evaluate(() => !!document.querySelector('.b-continue')), `${name}: after a reload the menu offers Continue`);
		await page.evaluate(() => document.querySelector('.b-continue').click());
		await idle();
		A(JSON.stringify(await view()) === before, `${name}: Continue resumes the exact frame (mid-room)`);
		const cards2 = await page.evaluate(() => [...document.querySelectorAll('.cards-layer .card')].length);
		A(cards2 === JSON.parse(before).room.length + (JSON.parse(before).weapon ? 1 + JSON.parse(before).weaponKills.length : 0), `${name}: the resumed table draws every card`, cards2);

		// --- resume mid fight choice ---
		while (k < RECIPE.length) {
			const s = E.replay(SEED, RECIPE.slice(0, k));
			if (s.state === E.STATE.FIGHT_CHOICE) break;
			okAll = (await play(RECIPE[k], 'key')) && okAll; k++;
		}
		v = await view();
		A(v.state === 'fight_choice', `${name}: a fight choice is open`);
		const fb = await page.evaluate(() => ({ w: getComputedStyle(document.querySelector('.sc-fight')).display, wt: document.querySelector('.b-weapon').textContent, bt: document.querySelector('.b-unarmed').textContent }));
		const pm = v.room[v.pending];
		A(fb.w === 'flex' && fb.wt.includes('-' + Math.max(0, pm.value - v.weapon.value) + ' HP') && fb.bt.includes('-' + pm.value + ' HP'), `${name}: the fight choice shows Weapon / Unarmed with their damage`, JSON.stringify(fb));
		await shot('fight');
		const fbefore = JSON.stringify(v);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await ready();
		await page.evaluate(() => document.querySelector('.b-continue').click());
		await idle();
		A(JSON.stringify(await view()) === fbefore && await page.evaluate(() => getComputedStyle(document.querySelector('.sc-fight')).display === 'flex'), `${name}: a reload mid fight choice comes back to the same choice`);

		// --- a controller: confirm on the focused button (the fight choice's Weapon) ---
		const press = async (idx) => {
			await page.evaluate((i) => { window.__fakePad.buttons[i] = { pressed: true, value: 1, touched: true }; window.__fakePad.timestamp++; }, idx);
			await sleep(120);
			await page.evaluate((i) => { window.__fakePad.buttons[i] = { pressed: false, value: 0, touched: false }; window.__fakePad.timestamp++; }, idx);
			await sleep(120);
		};
		if (RECIPE[k] === 'w') {
			const n0 = await nActs();
			await press(15); // a d-pad press: the reticle appears on the fight's natural stop, Weapon
			const focusOk = await page.evaluate(() => { const r = document.querySelector('.pad-reticle'); return r && r.style.display !== 'none'; });
			await press(1);  // the confirm button (Nintendo layout: the right face button)
			const moved = await waitFor(async () => (await nActs()) === n0 + 1, 3000);
			const vv = await view();
			A(focusOk && moved && vv.actions !== '' && E.replay(SEED, RECIPE.slice(0, k + 1)).hp === vv.hp, `${name}: a controller moves the focus reticle and confirms the Weapon fight`, JSON.stringify({ focusOk, moved }));
			k++;
		}
		// the rest of dungeon 1
		while (k < RECIPE.length) { okAll = (await play(RECIPE[k], k % 5 === 0 ? 'ui' : 'key')) && okAll; k++; }
		A(okAll, `${name}: every action of the recipe went through`);
		await idle();
		v = await view();
		A(v.state === 'cleared' && v.cleared === 1, `${name}: dungeon 1 cleared through the UI`, v.state);
		A(await page.evaluate(() => /Dungeon 1 cleared/.test(document.querySelector('.sc-cleared').textContent) && /Max HP\s*19/.test(document.querySelector('.sc-cleared').textContent)), `${name}: the cleared panel says the next dungeon has max HP 19`);
		await shot('cleared');
		// resume on the cleared screen too
		const cbefore = JSON.stringify(v);
		await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
		await page.evaluate(() => document.querySelector('.b-continue').click()); await idle();
		A(JSON.stringify(await view()) === cbefore, `${name}: a reload on the "dungeon cleared" screen resumes there`);
		A(await play('d', 'ui'), `${name}: Descend`);
		await idle();
		v = await view();
		A(v.dungeon === 2 && v.maxHp === 19 && v.hp === 19 && v.room.length === 4 && !v.weapon, `${name}: dungeon 2 at max HP 19, full health, a fresh room`, JSON.stringify({ d: v.dungeon, max: v.maxHp, hp: v.hp }));
		A(await page.evaluate(() => document.querySelector('.sc-hp-v').textContent === '19 / 19' && document.querySelector('.sc-maxhp').textContent === '19' && document.querySelector('.sc-ncleared').textContent === '1'), `${name}: the HUD shows 19 / 19, max HP 19, 1 dungeon cleared`);
		await shot('dungeon2');

		// --- die: bare-handed into everything ---
		for (let g = 0; g < 200; g++) {
			v = await view();
			if (v.over) break;
			const a = v.state === 'fight_choice' ? 'b' : String(v.room.findIndex((c) => c.enabled && c.kind === 'monster') >= 0 ? v.room.findIndex((c) => c.enabled && c.kind === 'monster') : v.room.findIndex((c) => c.enabled));
			await page.evaluate((a) => window.__scoundrel.act(a), a);
		}
		v = await view();
		A(v.over && v.result.reason === 'dead' && v.result.dungeons === 1, `${name}: the run ends at 0 HP with 1 dungeon cleared`, JSON.stringify(v.result));
		const over = await waitFor(() => page.evaluate(() => !!document.querySelector('.sc-over-modal') && /DEFEATED/.test(document.querySelector('.sc-over-modal').textContent)), 5000);
		A(over, `${name}: the game-over screen (DEFEATED, the score)`);
		await shot('over');
		const saved = await page.evaluate(() => ({ run: localStorage.getItem('scoundrel_run_v1'), rp: JSON.parse(localStorage.getItem('scoundrel_replays_v1') || '[]') }));
		A(!saved.run && saved.rp.length >= 1 && saved.rp[0].seed === SEED, `${name}: the finished run left the save slot and is kept as a replay`);
		// watch the replay: it rebuilds the same final state
		const final = JSON.stringify(v);
		await page.evaluate(() => document.querySelector('.b-watch-replay').click());
		await page.waitForFunction(() => location.search.includes('replay='), { timeout: 8000 });
		await ready();
		const total = await page.evaluate(() => window.__scoundrel.replayTotal);
		await page.evaluate((t) => window.__scoundrel.replayTo(t), total);
		await idle();
		A(JSON.stringify(await view()) === final, `${name}: the replay re-simulates the run to the same final state (${total} moves)`);
		await page.evaluate(() => window.__scoundrel.replayTo(12));
		await idle();
		A((await view()).n === 12 && await page.evaluate(() => !!document.querySelector('.sc-replay-bar')), `${name}: the replay steps to any move`);
		await shot('replay');
		A(!errors.length, `${name}: no page errors`, errors.slice(0, 3).join(' | '));
		await ctx.close();
	}
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
