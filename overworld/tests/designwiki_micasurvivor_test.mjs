// designwiki_micasurvivor_test.mjs — the design wiki's MicaSurvivor section (designwiki/app.js
// micasurvivorRoute + micasurvivor*View, designwiki/style.css .ms-*, designwiki/index.html nav,
// designwiki/data/micasurvivor.json from tools/micasurvivor/gen_designwiki.mjs).
//   1. micasurvivor.json is exactly what the generator builds from micasurvivor/js/data today
//      (every Pokémon with its ability, starter, move, item, upgrade and the 54 abilities of M5
//      batch 2; English names). On drift, regenerate:
//        node tools/micasurvivor/gen_designwiki.mjs
//   2. Every #/micasurvivor route renders in headless Chrome with no console errors: the overview
//      (how to play, the Pewter Museum cabinet, accounts + leaderboard, the controller table, the
//      credits / PolyForm Noncommercial notice), all 966 Pokémon with their ability (+ the filter,
//      also by ability), the abilities list, every move, every
//      item and upgrade; the sidebar links them; the phone layout (390 px) has no horizontal overflow.
//   node overworld/tests/designwiki_micasurvivor_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9521;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

// ---------- 1. data parity (node only)
const { build } = await import(pathToFileURL(path.join(ROOT, 'tools/micasurvivor/gen_designwiki.mjs')).href);
const fresh = build();
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micasurvivor.json'), 'utf8'));
A(JSON.stringify(fresh) === JSON.stringify(W), 'micasurvivor.json matches the game data', 'regen: node tools/micasurvivor/gen_designwiki.mjs');
A(W.pokemon.length === 966 && W.counts.pokemon === 966 && W.starters.length === 29 && W.moves.length >= 60 && W.items.length >= 10 && W.upgrades.length >= 10, 'counts: 966 Pokémon, 29 starters, the moves, items and upgrades', JSON.stringify(W.counts));
A(W.moves.find(m => m.id === 'ember')?.name === 'Ember' && W.items.find(i => i.id === 'leftovers')?.name === 'Leftovers' && W.upgrades.find(u => u.id === 'hp')?.name === 'Vitality', 'names are in English (the game translates from Spanish)');
A(W.moves.find(m => m.id === 'flamethrower')?.evo?.name === 'Overheat', 'move evolutions are listed (Flamethrower -> Overheat)');
// MicaSurvivor M5 batch 2: abilities
const ABI = new Map((W.abilities || []).map(a => [a.id, a]));
A(W.counts.abilities === 54 && ABI.size === 54 && W.abilities.every(a => a.name && a.desc && !/[¡¿ñáíóú]/.test(a.desc.replace(/Poké/g, ''))), '54 abilities, each with an English name and description', JSON.stringify(W.counts));
A(W.pokemon.every(p => ABI.has(p[6])) && W.abilities.reduce((s, a) => s + a.pokemon, 0) === 966, 'every Pokémon has its ability (the counts add up to 966)');
A(W.pokemon.find(p => p[0] === 4)[6] === 'blaze' && ABI.get('blaze').name === 'Blaze' && ABI.get('sturdy').desc === 'A hit that would KO you leaves you at 1 HP (every 90 s).', 'Charmander has Blaze; Sturdy is described with the port\'s numbers');

// ---------- 2. the pages
const server = http.createServer((req, res) => {
	let u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
	if (u.endsWith('/')) u += 'index.html';
	fs.readFile(path.join(ROOT, u), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(u)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 1400, height: 900 });
	const errors = [], failed = [];
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', e => errors.push(e.message));
	page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
	const go = async (route, sel, n) => {
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/${route}`, { waitUntil: 'networkidle0' });
		const ok = await page.waitForFunction((s, k) => document.querySelectorAll('#content ' + s).length >= k, { timeout: 15000 }, sel, n).then(() => true, () => false);
		const got = await page.$$eval('#content ' + sel, els => els.length);
		A(ok && got === n, `#/${route} renders ${n} × ${sel}`, `got ${got}`);
	};
	const nav = fs.readFileSync(path.join(ROOT, 'designwiki/index.html'), 'utf8');
	A(['#/micasurvivor', '#/micasurvivor/pokemon', '#/micasurvivor/moves', '#/micasurvivor/items'].every(hh => nav.includes(`href="${hh}"`)) && nav.includes('<div class="nav-group">MicaSurvivor</div>'), 'sidebar: a MicaSurvivor group with every page');

	await go('micasurvivor', '.ms-idx', 3);
	const ov = await page.$eval('#content', el => ({ text: el.textContent, play: !!el.querySelector('a[href="/micasurvivor/"]'), art: el.querySelector('img.ms-hero-art')?.naturalWidth || 0, tables: el.querySelectorAll('table').length }));
	A(ov.play && ov.art === 96, 'overview: the play link and the tile art', JSON.stringify({ play: ov.play, art: ov.art }));
	A(/How to play/.test(ov.text) && /Pewter Museum/.test(ov.text) && /best survival time/.test(ov.text) && /Magepunk/.test(ov.text), 'overview: how to play, the Pewter Museum cabinet, accounts + the leaderboard');
	A(/Required Notice: Copyright 2026 JPTER78 \(https:\/\/github\.com\/JPTER78\/pokesurvivor\)/.test(ov.text) && /PolyForm Noncommercial/.test(ov.text) && /CC BY-NC 4\.0/.test(ov.text) && /JayElDragon/.test(ov.text) && /never gets ads, paid items/.test(ov.text), 'overview: credits + the licence notice (Required Notice, PolyForm NC, CC BY-NC, JayElDragon, never sold)');
	A(ov.tables === 2 && /Nintendo/.test(ov.text), 'overview: the keyboard and controller tables');
	A(await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micasurvivor', 'nav: Overview is active');

	await go('micasurvivor/pokemon', '.ms-pokemon tbody tr', 966);
	await go('micasurvivor/pokemon', '.ms-abilities tbody tr', 54);
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => /Blaze/.test(r[3].textContent) && r.every(x => x.querySelector('.ms-ab'))), 'pokemon: every row shows its ability (Charmander: Blaze)');
	A(await page.$$eval('#content .ms-starter', s => s.length) === 29, 'pokemon: the 29 starters');
	await page.type('#content .ms-filter', 'pikachu');
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => r.length === 1 && /Pikachu/.test(r[0].textContent) && /Static/.test(r[0].textContent)), 'pokemon: the filter finds Pikachu (Static)');
	await page.$eval('#content .ms-filter', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
	await page.type('#content .ms-filter', 'dragon');
	const dragons = W.pokemon.filter(p => p[2].includes('dragon') || p[1].toLowerCase().includes('dragon')).length;
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => r.length) === dragons, `pokemon: filtering by type (dragon: ${dragons})`);
	await page.$eval('#content .ms-abilities tbody tr:nth-child(19) a', a => a.click());   // Sturdy
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => r.length) === ABI.get('sturdy').pokemon, `pokemon: clicking an ability's count lists its Pokémon (Sturdy: ${ABI.get('sturdy').pokemon})`);
	await go('micasurvivor/moves', 'tbody tr', W.moves.length);
	A(await page.$eval('#content', el => /Overheat/.test(el.textContent) && /Reflexes/.test(el.textContent)), 'moves: evolutions and their stat');
	await go('micasurvivor/items', 'tbody tr', W.items.length + W.upgrades.length);

	// phone
	await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
	for (const r of ['micasurvivor', 'micasurvivor/pokemon', 'micasurvivor/moves', 'micasurvivor/items']) {
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/${r}`, { waitUntil: 'networkidle0' });
		await page.waitForFunction(() => document.querySelectorAll('#content table, #content .ms-idx').length > 0, { timeout: 15000 }).catch(() => { });
		const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		A(over <= 1, `phone: #/${r} has no horizontal overflow`, String(over));
	}
	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
	A(failed.length === 0, 'no failed requests', failed.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
