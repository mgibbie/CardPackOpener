// pocketenhanced_packopen_test.mjs — opening a pack, after the Battlecards pack screen (pocketenhanced/js/main.js openOne):
//   1. choosing a booster shows its sealed pack beside a ring; nothing is opened or spent
//   2. a press on the pack does nothing; a drag that misses the ring springs back and spends nothing
//   3. dragging it over the ring lights the ring and the pack; the DROP opens it: the pack is used, its cards are dealt
//      face down
//   4. a face-down card under the mouse glows in the colour of its rarity; pressing it turns it over
//   5. Space keeps the rhythm: it turns the next card, and once all are turned it brings the next sealed pack, then
//      opens that; Space on the sealed pack opens it
//   6. a star card throws a ring of light and sparks when it is turned (First Partners: one card, always a star)
//   7. with no pack and no stars the booster cannot be chosen; a pack bought with stars is paid for at the drop, not before
//   8. by finger on a phone: the drag opens the pack; a drag that misses does not
//   node overworld/tests/pocketenhanced_packopen_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9585, SHOTS = process.env.POCKET_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }
const C = await import(pathToFileURL(path.join(ROOT, 'pocketenhanced/js/collection.js')).href);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	const open = async (vp, col) => {
		const page = await browser.newPage(); await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(c => { localStorage.setItem('magepunk_pocket_collection_v1', JSON.stringify(c)); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); }, col);
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=open`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
		const st = () => page.evaluate(() => { const c = window.__pocket.collection(); return { opened: c.opened, packs: c.packs, C: (c.own || {}).C || 0, six: (c.own || {})['6'] || 0, stars: window.__pocket.stars(), n: Object.values(c.prints).reduce((a, b) => a + b, 0), sealed: !!document.querySelector('.modal:last-child .pe-sealed'), ring: !!document.querySelector('.modal:last-child .pe-ring'), down: document.querySelectorAll('.pe-pull.down').length, up: document.querySelectorAll('.pe-pull.up').length }; });
		const at = sel => page.evaluate(sel2 => { const e = document.querySelector(sel2); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; }, sel);
		const toPacks = async () => { await page.evaluate(() => window.__pocket.menu()); await sleep(500); await page.evaluate(() => document.querySelector('.modal:last-child [data-k="packs"]').click()); await waitFor(() => page.evaluate(() => document.querySelectorAll('.pe-pack').length >= 35), 8000); await sleep(400); };
		const choose = async k => { await page.evaluate(k2 => document.querySelector(`.modal:last-child [data-k="pack${k2}"]`).click(), k); return waitFor(() => page.evaluate(() => !!document.querySelector('.modal:last-child .pe-sealed')), 5000); };
		return { page, errors, st, at, toPacks, choose };
	};

	// ================= a mouse, on a wide screen =================
	const d = await open({ width: 1600, height: 900, deviceScaleFactor: 1 }, C.newCollection());
	const { page } = d;
	await d.toPacks();
	const s0 = await d.st();
	A(await d.choose('C') && (await d.st()).sealed && (await d.st()).ring && (await d.st()).opened === s0.opened && (await d.st()).C === 5 && (await d.st()).down === 0, 'choosing the Charizard booster shows its sealed pack beside the ring: nothing opened, all five packs still in hand', await d.st());
	await sleep(400);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'open_1_sealed.png') }); }
	// a press without a drag
	let p = await d.at('.pe-sealed'), r = await d.at('.pe-ring');
	await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.up(); await sleep(700);
	A((await d.st()).sealed && (await d.st()).opened === 0 && (await d.st()).C === 5, 'a press on the pack opens nothing (a stray click spends nothing)');
	// a drag that misses
	await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.move(p[0] + 40, p[1] - 120, { steps: 6 }); await sleep(120);
	const mid = await page.evaluate(() => ({ armed: document.querySelector('.pe-ring').classList.contains('armed'), moved: document.querySelector('.pe-sealed').style.transform }));
	await page.mouse.up(); await sleep(700);
	const back = await d.at('.pe-sealed');
	A(!mid.armed && /translate/.test(mid.moved) && Math.abs(back[0] - p[0]) < 3 && Math.abs(back[1] - p[1]) < 3 && (await d.st()).opened === 0 && (await d.st()).C === 5, 'a drag that misses the ring: the pack follows the mouse, then springs back; nothing is opened or spent', { mid, back, p });
	// over the ring, then the drop
	await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.move(r[0], r[1], { steps: 10 }); await sleep(150);
	const armed = await page.evaluate(() => ({ ring: document.querySelector('.pe-ring').classList.contains('armed'), pack: document.querySelector('.pe-sealed').classList.contains('armed') }));
	A(armed.ring && armed.pack && (await d.st()).opened === 0, 'held over the ring, the ring and the pack light up (and it is not open yet: the drop opens it)', armed);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'open_2_armed.png') });
	await page.mouse.up();
	A(await waitFor(async () => (await d.st()).down === 5, 5000), 'the drop opens it: five cards are dealt face down');
	const s1 = await d.st();
	A(s1.opened === 1 && s1.C === 4 && s1.n === s0.n + 5 && s1.stars === s0.stars && !s1.sealed, 'one Charizard pack is used (four left), its five cards are in the collection, no stars are spent', s1);
	// the glow of a face-down card, and turning it
	await sleep(700);
	const c0 = await d.at('[data-k="pull0"]'); await page.mouse.move(c0[0], c0[1]); await sleep(300);
	const glow = await page.evaluate(() => { const e = document.querySelector('[data-k="pull0"]'); return { rc: e.style.getPropertyValue('--rc'), shadow: getComputedStyle(e).boxShadow, rar: [...e.classList].find(x => /^r[0-9A-Z]/.test(x)) }; });
	A(/^#[0-9a-f]{6}$/.test(glow.rc) && glow.shadow.split('rgb').length >= 4, 'a face-down card under the mouse glows in the colour of its rarity', glow);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'open_3_dealt.png') });
	await page.mouse.down(); await page.mouse.up(); await sleep(300);
	A((await d.st()).down === 4 && (await d.st()).up === 1, 'pressing it turns it over');
	// Space: the next card, each in turn
	for (let i = 0; i < 4; i++) { await page.keyboard.press('Space'); await sleep(220); }
	A((await d.st()).down === 0 && (await d.st()).up === 5 && await page.evaluate(() => /Space opens another/.test(document.querySelector('.modal:last-child .pe-note').textContent)), 'Space turns the next card each time; when all five are turned the note says Space opens another');
	await page.keyboard.press('Space');
	A(await waitFor(async () => (await d.st()).sealed && (await d.st()).down === 0, 4000) && (await d.st()).opened === 1, 'Space then brings the next sealed pack (not yet opened)');
	await sleep(300); await page.keyboard.press('Space');
	A(await waitFor(async () => (await d.st()).down === 5, 5000) && (await d.st()).opened === 2 && (await d.st()).C === 3, 'and Space on the sealed pack opens it');
	await page.evaluate(() => document.querySelector('.modal:last-child [data-k="flipall"]').click()); await sleep(300);
	// a star card: First Partners (one card a pack, always a star)
	await d.toPacks();
	A(await d.choose('6') && await page.evaluate(() => /1 card/.test(document.querySelector('.pe-sealed .n5').textContent)), 'a First Partners pack says it holds one card');
	await page.evaluate(() => document.querySelector('.modal:last-child [data-k="open"]').click());
	A(await waitFor(async () => (await d.st()).down === 1, 5000), 'the Open button opens it too: one card, face down');
	await sleep(600); await page.keyboard.press('Space');
	const fx = await waitFor(() => page.evaluate(() => document.querySelectorAll('.pe-shock').length >= 1 && document.querySelectorAll('.pe-spark').length >= 10), 1500);
	A(fx && await page.evaluate(() => { const e = document.querySelector('[data-k="pull0"]'); return e.classList.contains('up') && /^r(1S|2S|3S)$/.test([...e.classList].find(x => /^r\d/.test(x))); }), 'turning its star card throws a ring of light and sparks');
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'open_4_star.png') });
	A(await waitFor(() => page.evaluate(() => !document.querySelector('.pe-shock') && !document.querySelector('.pe-spark')), 3000), 'which clear away by themselves');
	A(!d.errors.length, 'no page errors (mouse)', d.errors.slice(0, 3).join(' | '));
	await page.close();

	// ================= no packs: stars pay at the drop =================
	const none = C.newCollection(); delete none.own;
	const e = await open({ width: 1600, height: 900, deviceScaleFactor: 1 }, none);
	await e.toPacks();
	A(await e.page.evaluate(() => document.querySelector('.modal:last-child [data-k="packC"]').disabled), 'with no pack in hand and no stars the booster cannot be chosen');
	await e.page.evaluate(() => window.__pocket.earnStars(100)); await e.toPacks();
	A(await e.choose('C') && (await e.st()).stars === 100 && /costs 100/.test(await e.page.evaluate(() => document.querySelector('.modal:last-child .pe-note').textContent)), 'with 100 stars it can: the sealed pack is shown with its price, and the stars are not taken yet', await e.st());
	await e.page.keyboard.press('Escape'); await sleep(300);
	A((await e.st()).stars === 100 && (await e.st()).opened === 0, 'backing out of the sealed pack costs nothing');
	await e.toPacks(); await e.choose('C'); await sleep(300);
	const pp = await e.at('.pe-sealed'), rr = await e.at('.pe-ring');
	await e.page.mouse.move(pp[0], pp[1]); await e.page.mouse.down(); await e.page.mouse.move(rr[0], rr[1], { steps: 8 }); await e.page.mouse.up();
	A(await waitFor(async () => (await e.st()).down === 5, 5000) && (await e.st()).stars === 0 && (await e.st()).opened === 1, 'the drop pays the 100 stars and opens it');
	A(await e.page.evaluate(() => document.querySelector('.modal:last-child [data-k="again"]').disabled) && !e.errors.length, 'with nothing left there is no other pack to open; no page errors', e.errors.slice(0, 3).join(' | '));
	await e.page.close();

	// ================= a finger, on a phone =================
	const ph = await open({ width: 412, height: 892, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, C.newCollection());
	await ph.toPacks(); await ph.page.evaluate(() => document.querySelector('.modal:last-child [data-k="packC"]').scrollIntoView({ block: 'center' })); await sleep(300);
	A(await ph.choose('C'), 'on a phone the sealed pack and the ring are shown (the ring above the pack)');
	await sleep(500);
	const fp = await ph.at('.pe-sealed'), fr = await ph.at('.pe-ring');
	A(fr[1] < fp[1] && fr[0] > 0 && fp[0] > 0 && fr[0] < 412 && fp[0] < 412, 'both are on the screen', [fp, fr]);
	const finger = async (from, to) => { await ph.page.touchscreen.touchStart(from[0], from[1]); await sleep(40); for (let i = 1; i <= 8; i++) { await ph.page.touchscreen.touchMove(from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8); await sleep(25); } await ph.page.touchscreen.touchEnd(); };
	await finger(fp, [fp[0] + 120, fp[1] + 20]); await sleep(700);
	A((await ph.st()).sealed && (await ph.st()).opened === 0 && (await ph.st()).C === 5, 'a finger drag that misses the ring opens nothing');
	const fp2 = await ph.at('.pe-sealed'); await finger(fp2, fr);
	A(await waitFor(async () => (await ph.st()).down === 5, 5000) && (await ph.st()).opened === 1 && (await ph.st()).C === 4, 'a finger drag onto the ring opens the pack');
	await sleep(700);
	const t0 = await ph.at('[data-k="pull0"]'); await ph.page.touchscreen.tap(t0[0], t0[1]); await sleep(400);
	A((await ph.st()).up === 1 && await ph.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && !ph.errors.length, 'a tap turns a card; nothing overflows sideways; no page errors', ph.errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
