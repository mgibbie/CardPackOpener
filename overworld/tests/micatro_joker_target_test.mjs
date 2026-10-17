// micatro_joker_target_test.mjs — "use on the selected joker" consumables work from the UI.
// A tester's cousin couldn't use a Dawn Stone on Charcadet: picking the stone moved the UI's only
// selection off the joker, and Use never told the engine which joker (joker_targets), so every
// Pokermon item that acts on the selected joker (evolution stones, Energy, Berry Juice, TM machine)
// was refused. The joker now stays picked (raised) while a consumable / pack card is chosen, and
// Use sends it. Covers micatro/js/ui/board.js (jsel, act -> joker_targets).
//   node overworld/tests/micatro_joker_target_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8764;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.fs': 'text/plain' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'JTARGET', back: 'b_red', mods: ['pokermon'] }); });
	await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		C.add_joker('j_joker'); C.add_joker('j_poke_charcadet'); // Charcadet is NOT leftmost
		const s = C.create_card('Item', C.G.consumeables, null, null, null, null, 'c_poke_dawnstone'); C.G.consumeables.emplace(s);
		C.G.E_MANAGER.flush();
		await window.__micatro.act({ type: 'select_blind' });
	});
	await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 });
	await sleep(500);
	const ids = await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); return { char: C.G.jokers.cards.find((c) => c.config.center.key === 'j_poke_charcadet').sort_id, stone: C.G.consumeables.cards[0].sort_id }; });
	const tap = async (id) => { await page.tap(`.card[data-id="${id}"]`); await sleep(350); };

	// pick Charcadet, then the Dawn Stone: Charcadet stays picked
	await tap(ids.char);
	await tap(ids.stone);
	const st = await page.evaluate((ids) => ({ jsel: window.__micatro.board.jsel, sel: window.__micatro.board.sel, use: !!document.querySelector(`.card[data-id="${ids.stone}"] .card-btns .use`) }), ids);
	A(st.jsel === ids.char && st.sel === ids.stone && st.use, 'Charcadet stays picked while the Dawn Stone is chosen (its Use button shows)', JSON.stringify(st));

	// Use -> accepted, the stone is consumed and Charcadet is queued to evolve (Armarouge at round end)
	await page.tap(`.card[data-id="${ids.stone}"] .card-btns .use`);
	await page.waitForFunction(() => window.__micatro.idle(), { timeout: 20000 });
	const after = await page.evaluate(async () => {
		const C = await import('/micatro/js/engine/core.js');
		const ch = C.G.jokers.cards.find((c) => c.config.center.key === 'j_poke_charcadet');
		return { stoneLeft: C.G.consumeables.cards.length, toast: (document.querySelector('.toast') || {}).textContent || '', evo: ch && JSON.stringify(ch.ability).includes('dawnstone') && ch.ability };
	});
	A(after.stoneLeft === 0, 'the Dawn Stone was used on the picked joker (not refused)', JSON.stringify({ left: after.stoneLeft, toast: after.toast }));

	// and with NO joker picked it is still refused (no target), as in Pokermon
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); const s = C.create_card('Item', C.G.consumeables, null, null, null, null, 'c_poke_dawnstone'); C.G.consumeables.emplace(s); C.G.E_MANAGER.flush(); });
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); const v = window.__micatro; v.board.jsel = null; v.board.sel = null; });
	const r = await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); const id = C.G.consumeables.cards[0].sort_id; return window.__micatro.act({ type: 'use', id }); });
	A(r && r.ok === false, 'without a picked joker the stone is refused (Pokermon rule)', JSON.stringify(r && { ok: r.ok, error: r.error }));
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
