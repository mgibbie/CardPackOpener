// pocketenhanced_setuptap_test.mjs — setting up a match on a phone (pocketenhanced/js/main.js onHand / onPoke).
// Owner, 2026-11-18, after playing on a phone: "I don't like how tapping the card puts it in a active slots it should
// only be drag and tapping a card should let me read it more up close like select it".
//   - a TAP on a Basic Pokémon in my hand during setup opens it to read; nothing goes onto the mat
//   - DRAGGING it to a slot puts it there
//   - a tap on a Pokémon I have placed reads it too; it stays where it is. Dragged to the hand, it goes back
//   - a keyboard or a gamepad cannot drag: the buttons under the opened card place it and take it back
//   - the hint and the guide say drag, not press
// On a phone-sized touch screen (fingers) and on a wide screen (mouse). The keyboard and the gamepad press a button with
// the same click the page's own focus ring makes (element.click()).
//   node overworld/tests/pocketenhanced_setuptap_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9593, SHOTS = process.env.POCKET_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	for (const [tag, vp, touch] of [['phone', { width: 412, height: 892, isMobile: true, hasTouch: true }, true], ['wide screen', { width: 1600, height: 900 }, false]]) {
		const page = await browser.newPage(); await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(() => localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })));
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=tap`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300; i++) { if (await page.evaluate(() => !!(window.__pocket && window.__pocket.ready)).catch(() => false)) break; await sleep(100); }
		await page.evaluate(() => { window.__pocket.start({ players: 2, seed: 'tap1' }); }); await sleep(500);
		// my hand: three Basic Pokémon and two Trainers, whatever the deck dealt
		await page.evaluate(async () => { const P = window.__pocket, S = P.engineState(), { CARDS } = await import('/pocketenhanced/js/data/cards.js'), id = n => CARDS.find(c => c.name === n).id; S.players[0].hand = [id('Vulpix'), id('Potion'), id('Charmander'), id('Growlithe'), id('Poké Ball')]; P.refresh(); });
		await sleep(400);
		const centre = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
		const state = () => page.evaluate(() => ({ phase: window.__pocket.view().phase, staged: [...document.querySelectorAll('.pe-me .pe-poke.staged')].map(e => e.dataset.k.split(':').slice(2).join(':') + '=' + ((e.getAttribute('aria-label') || '').match(/Vulpix|Charmander|Growlithe/) || ['?'])[0]), hand: document.querySelectorAll('.pe-hand .pe-card').length, modals: document.querySelectorAll('.modal').length, read: (document.querySelector('.modal .pe-insp .big') || {}).textContent || '', mtext: (document.querySelector('.modal') || {}).textContent || '', opts: [...document.querySelectorAll('.modal .pe-opt')].map(o => [o.dataset.k, o.disabled]), ready: document.querySelector('[data-k="ready"]') ? !document.querySelector('[data-k="ready"]').disabled : null }));
		const press = async sel => { const c = await centre(sel); if (touch) await page.touchscreen.tap(c[0], c[1]); else await page.mouse.click(c[0], c[1]); await sleep(450); };
		const dragTo = async (a, z) => { const from = await centre(a), to = await centre(z);
			if (touch) { await page.touchscreen.touchStart(from[0], from[1]); await sleep(30); for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8); await sleep(22); } await page.touchscreen.touchEnd(); }
			else { await page.mouse.move(from[0], from[1]); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8); await sleep(22); } await page.mouse.up(); }
			await sleep(400); };
		const close = async () => { await page.keyboard.press('Escape'); await sleep(250); };

		const s0 = await state();
		A(s0.phase === 'setup' && s0.hand === 5 && !s0.staged.length && s0.ready === false, `[${tag}] (setup: five cards in my hand, nothing on the mat, Ready waits)`, s0);
		// ---- a tap reads
		await press('[data-k="h:0"]'); const s1 = await state();
		A(s1.modals === 1 && /Vulpix/.test(s1.read) && !s1.staged.length && s1.hand === 5, `[${tag}] a ${touch ? 'tap' : 'click'} on Vulpix in my hand opens it to read; nothing goes onto the mat`, s1);
		A(JSON.stringify(s1.opts.filter(o => /^stage:/.test(o[0] || ''))) === '[["stage:active",false],["stage:bench",false]]', `[${tag}] under the card: "Put in an Active slot" and "Put on my Bench" (for a keyboard or a gamepad)`, s1.opts);
		if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `setuptap_${touch ? 'phone' : 'wide'}_1_read.png`) }); }
		await close();
		await press('[data-k="h:1"]'); const s1b = await state();
		A(s1b.modals === 1 && /Potion/.test(s1b.read) && !s1b.opts.some(o => /^stage:/.test(o[0] || '')), `[${tag}] a Trainer card opens to read too, with nothing to place`, s1b.opts);
		await close();
		// ---- a drag places
		await dragTo('[data-k="h:0"]', '[data-k="p:0:active:0"]'); const s2 = await state();
		A(s2.staged.join() === 'active:0=Vulpix' && s2.hand === 4 && s2.modals === 0 && s2.ready === true, `[${tag}] dragged to Active A, Vulpix stands there and has left my hand; Ready is lit`, s2);
		await dragTo('[data-k="h:2"]', '[data-k="p:0:bench:0"]'); const s3 = await state();
		A(s3.staged.join() === 'active:0=Vulpix,bench:0=Charmander' && s3.hand === 3, `[${tag}] Charmander dragged to the Bench stands on the Bench`, s3);
		// ---- a tap on a placed Pokémon reads it; it stays
		await press('[data-k="p:0:active:0"]'); const s4 = await state();
		A(s4.modals === 1 && /Vulpix/.test(s4.read) && s4.staged.length === 2 && s4.opts.some(o => o[0] === 'stage:back'), `[${tag}] a ${touch ? 'tap' : 'click'} on Vulpix on the mat reads it; it stays where it is`, s4);
		await close();
		// ---- dragged back to the hand
		await dragTo('[data-k="p:0:bench:0"]', '.pe-hand'); const s5 = await state();
		A(s5.staged.join() === 'active:0=Vulpix' && s5.hand === 4, `[${tag}] Charmander dragged back onto my hand is in my hand again`, s5);
		// ---- the buttons, for a keyboard or a gamepad
		await page.evaluate(() => document.querySelector('[data-k="h:3"]').click()); await sleep(350);
		const s6 = await state();
		A(s6.modals === 1 && /Growlithe/.test(s6.read) && s6.staged.length === 1, `[${tag}] the press a keyboard or a gamepad makes on Growlithe opens it (they cannot drag)`, s6);
		await page.evaluate(() => document.querySelector('.modal [data-k="stage:active"]').click()); await sleep(350);
		const s7 = await state();
		A(s7.staged.join() === 'active:0=Vulpix,active:1=Growlithe' && s7.modals === 0 && s7.hand === 3, `[${tag}] "Put in an Active slot" puts it in Active B`, s7);
		await page.evaluate(() => document.querySelector('[data-k="h:2"]').click()); await sleep(350);
		const s8 = await state();
		A(JSON.stringify(s8.opts.filter(o => /^stage:/.test(o[0] || ''))) === '[["stage:active",true],["stage:bench",false]]', `[${tag}] with both Active slots taken, Charmander can only be put on the Bench`, s8.opts);
		await page.evaluate(() => document.querySelector('.modal [data-k="stage:bench"]').click()); await sleep(350);
		await page.evaluate(() => document.querySelector('[data-k="p:0:active:1"]').click()); await sleep(350);
		await page.evaluate(() => document.querySelector('.modal [data-k="stage:back"]').click()); await sleep(350);
		const s9 = await state();
		A(s9.staged.join() === 'active:0=Vulpix,bench:0=Charmander' && s9.hand === 3, `[${tag}] "Take back into my hand" on Growlithe takes it off the mat`, s9);
		// ---- the words
		const words = await page.evaluate(() => (document.querySelector('.pe-cmd .hint') || {}).textContent || '');
		A(/^Drag a Basic Pokémon from your hand/.test(words) && /Press a card to read it/.test(words) && !/Press a Basic/.test(words), `[${tag}] the hint says to drag, and that a press reads`, words);
		// ---- and the match starts with what was laid out
		await page.evaluate(() => document.querySelector('[data-k="ready"]').click());
		let began = null; for (let i = 0; i < 80 && !began; i++) { began = await page.evaluate(() => { const v = window.__pocket.view(), me = v.players[0]; return me.setup ? { a: me.active.map(k => (k ? k.id : 0)), b: me.bench.filter(Boolean).length } : null; }); if (!began) await sleep(100); }
		A(began && began.a[0] && !began.a[1] && began.b === 1, `[${tag}] Ready: Vulpix is my Active Pokémon and Charmander is on my Bench`, began);
		A(!errors.length, `[${tag}] no page errors`, errors.slice(0, 3).join(' | '));
		await page.close();
	}
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
