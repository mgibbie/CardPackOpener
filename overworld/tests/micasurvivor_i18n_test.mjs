// micasurvivor_i18n_test.mjs — MicaSurvivor in English shows no Spanish.
// Owner bug (2026-10-17): the personality test result showed the trait name in Spanish ("Leal")
// in English mode — the names were never in the dictionary. This pins every trait name and then
// sweeps the screens a player reaches (personality test, result, starters, menu, Pokédex, upgrades,
// gacha, goals/missions/achievements/profile, every Settings tab, credits, a run's HUD, level-up,
// pause and the run summary) for leftover Spanish text.
// Covers micasurvivor/js/data/lang-en.js, micasurvivor/js/core/i18n.js, micasurvivor/js/ui/test.js.
//   node overworld/tests/micasurvivor_i18n_test.mjs
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
const PORT = 8794;
const DUMP = process.argv.includes('--dump');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

// Spanish tells: ¿ ¡ ñ, accented vowels (outside names), and common Spanish words.
const SPANISH = /[¿¡ñÑ]|(?<![\p{L}])(?:el|los|las|del|una|unos|para|pero|con|sin|por|que|tus|tu|su|sus|más|muy|cuando|también|está|están|tienes|puedes|pulsa|elige|volver|cerrar|salir|jugar|partida|mejoras|ajustes|sonido|música|logros|misiones|objetivos|recompensa|nivel|tiempo|derrotados|monedas|tickets? del|compañero|cuenta|idioma|pantalla|ataque|daño|vida|velocidad)(?![\p{L}])/iu;
// proper names / intentional non-English text allowed to appear
const ALLOW = [/Pokémon/g, /PokéSurvivor/g, /Pokédex/g, /Pokémonedas?/g, /Español/g, /Flabébé/g, /\bPoké\b/g];
function spanishLines(text) {
	const out = [];
	for (const raw of String(text || '').split(/\n+/)) {
		let l = raw.trim(); if (!l) continue;
		for (const a of ALLOW) l = l.replace(a, '');
		if (SPANISH.test(l) || /[áéíóú]/i.test(l)) out.push(raw.trim());
	}
	return out;
}

let browser;
const found = new Map(); // line -> screen
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--lang=es-ES'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const sweep = async (label, sel) => {
		await sleep(250);
		const text = await page.evaluate(sel => { const el = sel ? document.querySelector(sel) : document.body; return el ? el.innerText : ''; }, sel);
		for (const l of spanishLines(text)) if (!found.has(l)) found.set(l, label);
	};

	if (process.argv.includes('--es')) await page.evaluateOnNewDocument(() => localStorage.setItem('micasurvivor_lang', 'es')); // detector self-check
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => document.getElementById('boot').classList.contains('hidden')), 30000);
	A(await page.evaluate(() => G.I18n.lang) === 'en', 'English mode');
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-login'), 10000);
	await sweep('title', '#scr-login');

	// 1. every personality trait name has an English name
	const traits = await page.evaluate(() => Object.keys(G.TRAIT_TEXT).map(k => { const name = k.charAt(0).toUpperCase() + k.slice(1); return [name, G.I18n.t(name), G.I18n.t(G.TRAIT_TEXT[k])]; }));
	const untranslated = traits.filter(([es, en]) => es === en);
	A(traits.length >= 16 && untranslated.length === 0, `all ${traits.length} personality trait names are translated (e.g. Leal -> ${traits.find(t => t[0] === 'Leal')?.[1]})`, JSON.stringify(untranslated));
	A(traits.every(([, , d]) => !spanishLines(d).length), 'every trait description is translated');

	// 2. the test result screen shows the trait in English
	await page.click('#btn-guest');
	await waitFor(() => visible('scr-test'), 8000);
	await sweep('personality test', '#scr-test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) {
		await page.evaluate(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); });
		await sleep(120);
		if (i === 2) await sweep('personality test (question)', '#scr-test');
	}
	await waitFor(() => visible('scr-result'), 8000);
	await sleep(300);
	const res = await page.evaluate(() => ({ shown: document.getElementById('res-trait').innerText.trim(), key: G.DB.save?.personality?.trait || null }));
	const english = new Set(traits.map(t => t[1]));
	A(english.has(res.shown) && !traits.some(t => t[0] === res.shown), `the result screen shows the trait in English ("${res.shown}")`, JSON.stringify(res));
	await sweep('personality result', '#scr-result');
	// "choose another" -> starters list
	const other = await page.$('#res-other, #res-change, [data-starters]');
	if (other) { await other.click(); await sleep(500); if (await visible('scr-starters')) { await sweep('starters', '#scr-starters'); await page.evaluate(() => { const b = document.querySelector('#scr-starters [data-back], #scr-starters .close, #starters-back'); if (b) b.click(); }); await sleep(300); } }
	if (await visible('scr-result')) await page.click('#res-ok');
	else if (await visible('scr-starters')) await page.evaluate(() => { const b = document.querySelector('#scr-starters button'); if (b) b.click(); });
	await waitFor(() => visible('scr-menu'), 10000);
	await sleep(600);
	await sweep('main menu', '#scr-menu');

	// 3. every menu screen + every tab inside it
	for (const go of ['dex', 'upgrades', 'gacha', 'goals']) {
		await page.evaluate(go => document.querySelector(`#scr-menu [data-go=${go}]`).click(), go);
		await sleep(700);
		const scr = '#scr-' + go;
		await sweep(go, scr);
		const tabs = await page.$$(`${scr} .gen-tab, ${scr} [data-tab], ${scr} .tab`);
		for (let i = 0; i < tabs.length; i++) { try { await tabs[i].click(); await sweep(`${go} tab ${i + 1}`, scr); } catch { } }
		await page.evaluate(scr => { const b = document.querySelector(`${scr} [data-back]`); if (b) b.click(); }, scr);
		await sleep(400);
		if (!(await visible('scr-menu'))) await page.keyboard.press('Escape');
		await sleep(300);
	}
	// settings: every tab
	await page.evaluate(() => document.getElementById('btn-settings').click());
	for (const t of ['sound', 'gfx', 'ctl', 'acc', 'about']) { await page.evaluate(t => document.querySelector(`#set-tabs [data-t=${t}]`).click(), t); await sweep(`settings ${t}`, '#scr-settings'); }
	await page.evaluate(() => document.getElementById('set-close').click());
	await sleep(300);

	// 4. a run: HUD, level-up, pause, summary
	await page.evaluate(() => document.querySelector('#scr-menu [data-go=play]').click());
	await sleep(1500);
	await waitFor(() => page.evaluate(() => !!(window.G && G.Game && G.Game.running)), 15000).catch(() => {});
	await sweep('run HUD', 'body');
	// force a level-up
	await page.evaluate(() => { try { const p = G.Game.player || G.Game.p; if (p && G.LevelUp && G.LevelUp.open) G.LevelUp.open(); else if (p && p.addXp) p.addXp(9999); } catch (e) { } });
	await sleep(800);
	if (await visible('scr-levelup')) { await sweep('level-up', '#scr-levelup'); await page.keyboard.press('1'); await sleep(400); }
	await page.keyboard.press('Escape');
	await sleep(600);
	if (await visible('scr-pause')) await sweep('pause', '#scr-pause');
	await page.evaluate(() => { const b = document.querySelector('#scr-pause [data-quit], #pause-quit, #btn-quit'); if (b) b.click(); });
	await sleep(800);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^(Yes|Quit|Leave)/i.test(x.innerText.trim()) && x.offsetParent); if (b) b.click(); });
	await sleep(1200);
	if (await visible('scr-over')) await sweep('run summary', '#scr-over');

	if (DUMP) { const screens = new Set(found.values()); console.log(`  ${found.size} lines on ${screens.size} screens:`, [...screens].join(', ')); for (const [l, where] of [...found].slice(0, 15)) console.log(`  [${where}] ${l}`); }
	A(found.size === 0, `no Spanish text on any screen in English mode (${found.size} lines)`, [...found].slice(0, 12).map(([l, w]) => `[${w}] ${l}`).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
