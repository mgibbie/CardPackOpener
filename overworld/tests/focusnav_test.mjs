// focusnav_test.mjs — site/focusnav.js + site/input.js in a real browser
// (controls sweep B1). A fixture page runs initFocusNav(); real keyboard input
// (page.keyboard: trusted events, no mouse calls) and a fake controller in
// window.__owFakePads both drive it.
//
// Covers: arrows AND WASD (also with Shift held), Z / Enter activate, X = an
// Escape for the page, Q/E = ←/→ keys, the visible ring (keyboard and pad), the
// mouse hiding it, a modal scoping focus, the typing guard (WASD typed into a
// field never moves focus; Esc leaves the field), Tab followed by arrows, the
// suspend flag an overlay uses, and a long page scrolling under W/S.
//
//   node overworld/tests/focusnav_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9187;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>focusnav fixture</title>
<style>body{font:16px sans-serif;margin:0;padding:20px;background:#111;color:#eee}
.grid{display:grid;grid-template-columns:repeat(3,120px);gap:16px;margin:20px 0}
.grid button{height:50px}#modal{position:fixed;inset:30% 30%;background:#333;padding:20px;z-index:50}
.tall{height:2600px}</style></head><body>
<nav><a href="#top" id="lnk">Home</a></nav>
<div class="grid">
 <button id="b0">b0</button><button id="b1">b1</button><button id="b2">b2</button>
 <button id="b3">b3</button><button id="b4" class="primary">b4</button><button id="b5">b5</button>
 <button id="b6">b6</button><button id="b7">b7</button><button id="open">open modal</button>
</div>
<input id="name" type="text" placeholder="name" style="width:200px">
<label><input id="chk" type="checkbox"> tick</label>
<select id="sel"><option>one</option><option>two</option></select>
<div class="tall"></div>
<button id="bottom">bottom</button>
<div id="modal" role="dialog" aria-modal="true" hidden><button id="m1">yes</button> <button id="m2">no</button></div>
<script type="module">
import { initFocusNav } from '/site/focusnav.js';
import { suspendInput } from '/site/input.js';
window.__clicks = [];
window.__keys = [];
for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => window.__clicks.push(b.id));
document.getElementById('open').addEventListener('click', () => { document.getElementById('modal').hidden = false; });
document.getElementById('m2').addEventListener('click', () => { document.getElementById('modal').hidden = true; });
addEventListener('keydown', e => { if (!e.isTrusted) window.__keys.push(e.key); if (e.key === 'Escape') document.getElementById('modal').hidden = true; });
window.__suspendInput = suspendInput;
initFocusNav();
window.__ready = true;
</script></body></html>`;

const server = await new Promise(r => {
	const s = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/fixture.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(FIXTURE); return; }
		fs.readFile(path.join(ROOT, u), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': /\.m?js$/.test(u) ? 'text/javascript' : 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1000, height: 700 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => {
		const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
		window.__owFakePads = [pad]; window.__pad = pad;
	});
	await page.goto(`http://localhost:${PORT}/fixture.html`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 50 && !(await page.evaluate(() => !!window.__ready)); i++) await sleep(100);
	const focus = () => page.evaluate(() => { const f = window.__focusnav.focused; return f ? { id: f.id, ring: f.classList.contains('focusnav-focus'), active: document.activeElement === f } : null; });
	const press = async (k, opts) => { await page.keyboard.press(k, opts); await sleep(40); };
	const clicks = () => page.evaluate(() => window.__clicks.splice(0));
	const tap = async b => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(70); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(90); };

	// ---- keyboard: the first press shows focus (the page's primary), then arrows and WASD move ----
	await press('ArrowDown');
	let f = await focus();
	A(f && f.id === 'b4' && f.ring, 'the first arrow press only SHOWS focus, on the page\'s primary stop, with the ring', JSON.stringify(f));
	A(f && f.active, '...and the real DOM focus follows (screen readers, Space)');
	await press('ArrowRight'); A((await focus()).id === 'b5', '→ moves right');
	await press('KeyA'); A((await focus()).id === 'b4', 'A moves left');
	await press('KeyW'); A((await focus()).id === 'b1', 'W moves up');
	await press('KeyS'); A((await focus()).id === 'b4', 'S moves down');
	await page.keyboard.down('Shift'); await press('KeyD'); await page.keyboard.up('Shift');
	A((await focus()).id === 'b5', 'Shift+D still moves right (matched by the physical key)');
	await press('KeyA');
	await press('KeyZ');
	A((await clicks()).join() === 'b4', 'Z activates the focused button');
	await press('Enter');
	A((await clicks()).join() === 'b4', 'Enter (Start) activates on a DOM page, exactly once (no native double click)');
	await press('Space');
	A((await clicks()).join() === 'b4', 'Space keeps its native meaning (the DOM-focused button)');
	await press('KeyQ'); await press('KeyE');
	A((await page.evaluate(() => window.__keys.splice(0))).join() === 'ArrowLeft,ArrowRight', 'Q / E send the page ← / → (tabs, pages)');

	// ---- a modal scopes focus; X backs out with the page's own Escape ----
	await press('ArrowDown'); await press('ArrowRight'); await press('ArrowRight');
	f = await focus();
	A(f.id === 'open', 'reached the "open modal" button', JSON.stringify(f));
	await press('KeyZ'); await clicks();
	await sleep(60);
	await press('ArrowRight');
	f = await focus();
	A(f && (f.id === 'm1' || f.id === 'm2'), 'with the modal open, focus lands inside it', JSON.stringify(f));
	A(await page.evaluate(() => window.__focusnav.candidates().every(el => el.closest('#modal'))), '...and every stop is scoped to the modal');
	await press('KeyX');
	A(await page.evaluate(() => document.getElementById('modal').hidden && window.__keys.splice(0).join() === 'Escape'), 'X sends the page an Escape (its own back / close): the modal closed');

	// ---- the controller drives the same navigator ----
	await page.evaluate(() => window.__focusnav.focusTo(document.getElementById('b0')));
	await tap(15); A((await focus()).id === 'b1', 'pad d-pad → moves');
	await tap(13); A((await focus()).id === 'b4', 'pad d-pad ↓ moves');
	await tap(1); A((await clicks()).join() === 'b4', 'pad A (right face, Nintendo layout) activates');

	// ---- the mouse hides the ring; the next key brings it back where it was ----
	await page.mouse.move(500, 600); await page.mouse.move(520, 620);
	A(!(await focus()).ring, 'moving the mouse hides the ring');
	await press('KeyD');
	f = await focus();
	A(f.ring && f.id === 'b5', 'the next key shows it again and acts from where focus was', JSON.stringify(f));

	// ---- the typing guard ----
	await page.evaluate(() => window.__focusnav.focusTo(document.getElementById('name')));
	A(!(await focus()).active, 'landing on a text field does NOT put the caret in it (arrows keep navigating)');
	await press('KeyZ');
	A(await page.evaluate(() => document.activeElement.id === 'name'), 'Z on a text field enters it (keyboard: just type)');
	await page.keyboard.type('wasdzx');
	A(await page.evaluate(() => document.getElementById('name').value === 'wasdzx') && (await focus()).id === 'name', 'typing WASD/Z/X into the field types letters and moves nothing');
	await press('ArrowRight');
	A((await focus()).id === 'name', 'arrows inside the field stay with the field');
	await press('Escape');
	A(await page.evaluate(() => document.activeElement.id !== 'name'), 'Esc leaves the field');
	await press('KeyD');
	A((await focus()).id !== 'name', '...and WASD navigates again');
	await page.evaluate(() => window.__focusnav.focusTo(document.getElementById('chk')));
	await press('KeyZ');
	A(await page.evaluate(() => document.getElementById('chk').checked), 'Z ticks a checkbox');
	await press('KeyD');
	A((await focus()).id !== 'chk', 'a focused checkbox is NOT typing: WASD still moves (the overworld freeze bug class)');

	// ---- Tab, then arrows continue from where Tab left you ----
	await page.evaluate(() => { window.__focusnav.focusTo(document.getElementById('b0')); });
	await press('Tab');
	const tabbed = await page.evaluate(() => document.activeElement.id);
	A((await focus()).id === tabbed && tabbed === 'b1', 'Tab moves the real focus and the navigator follows it', tabbed);
	await press('ArrowDown');
	A((await focus()).id === 'b4', '...arrows continue from the tabbed element');

	// ---- an overlay takes the input (suspend) ----
	await page.evaluate(() => { window.__resume = window.__suspendInput('test-overlay'); });
	await press('KeyD'); await tap(15); await press('KeyZ');
	A((await focus()).id === 'b4' && (await clicks()).length === 0, 'suspended: keys and pad reach nothing');
	await page.evaluate(() => window.__resume());
	await press('KeyD');
	A((await focus()).id === 'b5', 'resumed: navigation works again');

	// ---- a long page: S past the last stop that way scrolls ----
	await page.evaluate(() => window.__focusnav.focusTo(document.getElementById('sel')));
	await press('KeyS');
	A((await focus()).id === 'bottom', 'S reaches a stop far down the page (scrolled into view)');
	const y0 = await page.evaluate(() => scrollY);
	await press('KeyS');
	A(await page.evaluate(y0 => scrollY >= y0, y0), 'S with nothing further down keeps the page where it is (or scrolls on)');
	await page.evaluate(() => { scrollTo(0, 0); window.__focusnav.focusTo(document.getElementById('lnk')); });
	await press('KeyW');
	A(await page.evaluate(() => scrollY === 0), 'W at the top has nowhere to go');

	A(errors.length === 0, 'no page errors', errors.join(' | '));
	await page.screenshot({ path: path.join(process.env.SHOTS || os.tmpdir(), 'focusnav_test.png') }).catch(() => {});
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
