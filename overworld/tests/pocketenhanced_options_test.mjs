// pocketenhanced_options_test.mjs — Pocket Enhanced's Options: text size and reduce motion (owner's second improvement
// list, 2026-11-18, "yes to all": accessibility, "a larger-text option for phones"). pocketenhanced/js/main.js
// settingsMenu/applyA11y, css .text-l/.text-xl/.calm.
//   1. the main menu and the in-match menu both have Options
//   2. Larger: menus are drawn bigger (zoom 1.36), and it is remembered after a reload; Normal puts it back
//   3. Reduce motion: animations stop (an attack's effect is not shown), and it is remembered; the device's own
//      reduce-motion setting still counts when it is off
//   4. the Options buttons are reached by keyboard (arrows + Z) as every other menu
//   node overworld/tests/pocketenhanced_options_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	const boot = async () => { await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' }); await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500); };
	await boot();
	const has = k => page.evaluate(k => !!document.querySelector(`[data-k="${k}"]`), k);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); e && e.click(); return !!e; }, k);
	const zoom = () => page.evaluate(() => { const b = document.querySelector('.modal-box'); return b ? parseFloat(getComputedStyle(b).zoom) : null; });
	const cls = () => page.evaluate(() => document.getElementById('stage').className);
	// ===== 1 =====
	A(await has('options'), 'the main menu has Options');
	await click('options'); await sleep(300);
	A(await has('text-xl') && await has('calm'), 'Options: the text sizes and Reduce motion');
	A(await zoom() === 1, 'Normal text: menus at their size', await zoom());
	// ===== 2 =====
	await click('text-xl'); await sleep(200);
	A(/\btext-xl\b/.test(await cls()) && await zoom() === 1.36, 'Larger: menus drawn at 1.36×', [await cls(), await zoom()]);
	await boot();
	A(/\btext-xl\b/.test(await cls()) && await zoom() === 1.36, 'and remembered after a reload', [await cls(), await zoom()]);
	await click('options'); await sleep(300); await click('text-m'); await sleep(200);
	A(!/\btext-/.test(await cls()) && await zoom() === 1, 'Normal puts it back');
	// ===== 3 =====
	const anim = () => page.evaluate(() => { const st = document.getElementById('stage'), i = document.createElement('div'); i.className = 'pe-hitfx burst'; st.appendChild(i); const cs = getComputedStyle(i), r = { shown: cs.display !== 'none', dur: cs.animationDuration }; i.remove(); return r; });
	const before = await anim();
	await click('calm'); await sleep(200);
	const after = await anim();
	A(before.shown && /\bcalm\b/.test(await cls()) && !after.shown, "Reduce motion: an attack's effect is not shown (it was)", [before, after]);
	await boot();
	A(/\bcalm\b/.test(await cls()), 'and remembered after a reload');
	await click('options'); await sleep(300); await click('calm'); await sleep(200);
	A(!/\bcalm\b/.test(await cls()) && (await anim()).shown, 'off again: effects back');
	await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
	A(!(await anim()).shown, "off, with the device's reduce-motion setting on: still no effects (the device's setting counts)");
	await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
	await page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } }); await sleep(300);
	// ===== 1b: in a match =====
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'opts' })); await sleep(800);
	await page.evaluate(() => { const m = document.querySelector('[data-k="menu"]') || document.querySelector('.pe-menu'); m && m.click(); }); await sleep(300);
	A(await has('options'), 'the in-match menu has Options too');
	await page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } });
	// ===== 4: keyboard =====
	await page.evaluate(() => window.__pocket.leave ? window.__pocket.leave() : null);
	await boot();
	let reached = false;
	for (let i = 0; i < 25 && !reached; i++) { await page.keyboard.press('ArrowDown'); await sleep(90); reached = await page.evaluate(() => { const f = window.__pocket.focus(); return !!f && !!(f.closest && f.closest('[data-k="options"]')); }); }
	if (reached) { await page.keyboard.press('KeyZ'); await sleep(300); }
	A(reached && await has('text-xl'), 'the keyboard reaches Options (arrows) and opens it (Z)', reached);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
