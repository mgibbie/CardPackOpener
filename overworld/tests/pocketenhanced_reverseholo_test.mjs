// pocketenhanced_reverseholo_test.mjs — a reverse holo looks like one (owner, 2026-11-18: "the reverse holos dont look
// any different than the regular card"). pocket.css `.pf .rv`, `.pf .lk-foil .art`.
// The same card drawn twice, its regular printing and its reverse holo (a Deluxe Pack foil printing, rarity ◇):
//   1. the reverse holo's body (the lower panel: attack, type, retreat) differs plainly from the regular card's
//      (mean colour difference per pixel well above what antialiasing makes)
//   2. its ART does not shine: the art window of the two is nearly the same (that is what makes it a REVERSE holo)
//   3. the art window has a foil frame; with reduced motion the bands stand still
//   node overworld/tests/pocketenhanced_reverseholo_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';

const R = makeAsserter(), A = R.A;
const foil = PRINTS.find(p => /F$/.test(p[2]) && p[1] === 'A1-001');   // (Bulbasaur's reverse holo)
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const page = await browser.newPage(); await page.setViewport({ width: 900, height: 600 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(600);
	A(!!foil, '(Bulbasaur has a reverse holo printing)', foil);
	await page.evaluate(async (fp) => {
		const M = await import('/pocketenhanced/js/cardface.js'), D = await import('/pocketenhanced/js/data/cards.js');
		document.querySelectorAll('.modal').forEach(m => m.remove());
		const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;left:10px;top:10px;display:flex;gap:20px;z-index:9999;font-size:30px'; wrap.className = 'pe rvshot';
		for (const p of ['A1-001', fp]) { const b = document.createElement('button'); const lk = M.lookOf(p); b.className = 'pe-card pf' + (lk ? ' look-' + lk : ''); b.dataset.p = p; b.style.setProperty('--c', 'var(--t-Grass)'); b.innerHTML = M.face(D.card('A1-001'), null, p); wrap.appendChild(b); }
		document.body.appendChild(wrap);
	}, foil[0]);
	await sleep(400);
	const shots = [];
	for (const p of ['A1-001', foil[0]]) { const el = await page.$(`.rvshot [data-p="${p}"]`); shots.push((await el.screenshot({ encoding: 'base64' }))); }
	// compare in the page: the art window and the lower panel, as fractions of the card
	const cmp = await page.evaluate(async (a, b) => {
		const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
		const [ia, ib] = [await load(a), await load(b)], w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
		const px = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
		const da = px(ia), db = px(ib);
		const region = (x0, y0, x1, y1) => { let s = 0, n = 0; for (let y = Math.floor(y0 * h); y < y1 * h; y++) for (let x = Math.floor(x0 * w); x < x1 * w; x++) { const k = (y * w + x) * 4; s += Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]); n++; } return s / n / 3; };
		return { body: region(0.05, 0.78, 0.95, 0.97), art: region(0.2, 0.25, 0.8, 0.55) };
	}, shots[0], shots[1]);
	A(cmp.body > 18, `the reverse holo's lower panel differs plainly from the regular card's (mean difference ${cmp.body.toFixed(1)} per channel)`, cmp);
	A(cmp.art < 6, `its art does not shine (the art windows nearly the same: ${cmp.art.toFixed(1)})`, cmp);
	const frame = await page.evaluate(fp => getComputedStyle(document.querySelector(`.rvshot [data-p="${fp}"] .art`)).boxShadow, foil[0]);
	A(/rgb\(255, 255, 255\)/.test(frame), 'the art window has a foil frame', frame);
	await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
	A(await page.evaluate(fp => getComputedStyle(document.querySelector(`.rvshot [data-p="${fp}"] .rv`)).animationName === 'none', foil[0]), 'reduced motion: the bands stand still');
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
