// micatro_pokermon_regional_ui_test.mjs — the regional pill on screen (Pokermon regional batch A, the Alolan forms; the engine side is
// micatro/tests/mods/pokermon_alolan_test.mjs). Real taps, iPhone viewport, Pokermon + Nacho on:
//   - an Alolan joker's tooltip carries its rarity pill, then "Alolan" (#C2410C, white text), then its type pill;
//   - the retrofitted regional forms show theirs: Pokermon's Hisuian Qwilfish "Hisuian", Nacho's Galarian Meowth "Galarian";
//   - a Kanto joker has no region pill;
//   - the Alolan card draws its 3.9.1 Gen 1 sheet cell (the atlas is loaded).
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main checkout two levels up
// (MICATRO_MAIN overrides).
//   node overworld/tests/micatro_pokermon_regional_ui_test.mjs   [SHOTS=<dir> saves screenshots]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9673;
const SHOTS = process.env.SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.fs': 'text/plain' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const served = new Set();

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { served.add(f); res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); });
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await page.evaluateOnNewDocument(() => { localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon', 'nacho']); await window.__micatro.newRun({ seed: 'ALOLAUI', back: 'b_red', mods: ['pokermon', 'nacho'] }); });
	const idle = async () => { await page.waitForFunction(() => window.__micatro.idle(), { timeout: 30000 }); await sleep(300); };
	const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
	const tap = async (sel) => { await page.tap(sel); await sleep(400); };
	const core = (fn, ...args) => page.evaluate(async (src, args) => { const C = await import('/micatro/js/engine/core.js'); return (0, eval)('(' + src + ')')(C, ...args); }, fn.toString(), args);
	const tipBadges = () => page.evaluate(() => { const t = document.querySelector('.tip'); return t && t.style.display !== 'none' ? [...t.querySelectorAll('.tip-badges .badge')].filter((x) => !x.classList.contains('mod-badge')).map((x) => ({ text: x.textContent.trim(), bg: x.style.background, fg: getComputedStyle(x).color })) : []; });
	const clearTip = () => page.evaluate(() => { const b = window.__micatro.board; b.sel = null; b.jsel = null; b.hideTip(); b.refreshSelection(); });
	await idle();

	const KEYS = ['j_poke_alolan_vulpix', 'j_poke_alolan_marowak', 'j_poke_hisuian_qwilfish', 'j_nacho_galarian_meowth', 'j_poke_vulpix'];
	const ids = await core((C, keys) => {
		C.G.jokers.config.card_limit = 8;
		const out = [];
		for (const k of keys) { const c = C.add_joker(k); out.push(c.sort_id); }
		C.G.E_MANAGER.flush();
		return out;
	}, KEYS);
	await page.evaluate(async () => { const C = await import('/micatro/js/engine/core.js'); return window.__micatro.act({ type: 'reorder', area: 'jokers', ids: C.G.jokers.cards.map((c) => c.sort_id) }); });
	await idle(); await sleep(1200); // (the mod atlases load)
	const WANT = [
		['Alolan Vulpix', 'Common', 'Alolan', 'rgb(194, 65, 12)', 'Water'],
		['Alolan Marowak', 'Safari', 'Alolan', 'rgb(194, 65, 12)', 'Fire'],
		['Hisuian Qwilfish', 'Uncommon', 'Hisuian', 'rgb(85, 107, 47)', 'Dark'],
		['Galarian Meowth', 'Common', 'Galarian', 'rgb(53, 87, 166)', 'Metal'],
	];
	for (let i = 0; i < WANT.length; i++) {
		await tap(`.card[data-id="${ids[i]}"]`);
		const bd = await tipBadges();
		const [name, rar, region, col, type] = WANT[i];
		A(bd.length === 3 && bd[0].text === rar && bd[1].text === region && bd[1].bg === col && bd[1].fg === 'rgb(255, 255, 255)' && bd[2].text === type,
			`${name}: the tooltip's pills are ${rar}, ${region} (${col}, white text), ${type}`, JSON.stringify(bd));
		await shot(`${i + 1}-${region.toLowerCase()}-pill.png`);
		await clearTip();
	}
	await tap(`.card[data-id="${ids[4]}"]`);
	const kb = await tipBadges();
	A(kb.length === 2 && !kb.some((b) => /Alolan|Galarian|Hisuian|Paldean/.test(b.text)), 'Kanto Vulpix: no region pill', JSON.stringify(kb));
	await clearTip();
	A([...served].some((f) => /AtlasJokersBasicGen01-391(\.png$|\/)/.test(f)), 'the Alolan cards\' Gen 1 sheet is loaded', [...served].filter((f) => /Gen01/.test(f)).join(','));
	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
