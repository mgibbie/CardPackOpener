// deck_codes_smoke.mjs — the deck builder boots with the deck-code wiring and the
// ?deck=<code> share links deep-link into it. If a button id is mismatched, deck.js
// throws at `$('export-code').onclick = ...` during init and the whole builder
// breaks — this catches that. Boots deck.html in LOCAL mode (no login needed).
//
// Standalone (needs headless Chrome + puppeteer-core); NOT in run-all.mjs.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8876;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; }

(async () => {
	// a valid share code for a REAL class (so loadDeckFromCode's known-class check passes)
	const classes = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards/classes.json'), 'utf8')).classes;
	const realClass = classes[0].id;
	const { encodeDeck } = await import(pathToFileURL(path.join(ROOT, 'battlecards/codec.js')).href);
	const shareCode = await encodeDeck({ classId: realClass, cards: ['__nope_a', '__nope_b'], commander: null, companion: null });

	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
		const softErrors = () => errors.filter(e => !/Failed to load resource/i.test(e));

		// --- 1) plain boot: the builder inits + the three code buttons are wired ---
		await page.goto(`http://localhost:${PORT}/battlecards/deck.html`, { waitUntil: 'domcontentloaded' });
		// deck.js fully ran iff the class dropdown got populated (that happens AFTER the
		// $('export-code').onclick assignment, so a booted builder proves the wiring loaded)
		const booted = await waitFor(() => page.evaluate(() => document.querySelector('#class-select')?.options?.length > 0), 15000);
		A(booted, 'the deck builder initialized (class-select populated ⇒ deck.js ran past the code-button wiring)');
		const buttons = await page.evaluate(() => ({ link: !!document.querySelector('#copy-link'), exp: !!document.querySelector('#export-code'), imp: !!document.querySelector('#import-code') }));
		A(buttons.link && buttons.exp && buttons.imp, 'the Copy Link + Copy Code + Import buttons all exist', JSON.stringify(buttons));
		// exporting with no deck built shows the guard message (proves the handler runs)
		await page.evaluate(() => document.querySelector('#export-code')?.click());
		await sleep(200);
		A(await page.evaluate(() => /build a deck first/i.test(document.querySelector('#status')?.textContent || '')), 'export with an empty deck shows the guard flash (handler wired + runs)');

		// --- 2) a ?deck=<code> share link deep-links straight into the builder ---
		await page.goto(`http://localhost:${PORT}/battlecards/deck.html?deck=${shareCode}`, { waitUntil: 'domcontentloaded' });
		const deepLoaded = await waitFor(() => page.evaluate(cls =>
			document.querySelector('#edit-view')?.style.display === 'flex' && document.querySelector('#class-select')?.value === cls, realClass), 15000);
		const deep = await page.evaluate(() => ({ cls: document.querySelector('#class-select')?.value, name: document.querySelector('#deck-name')?.value, search: location.search }));
		A(deepLoaded && deep.cls === realClass, 'a ?deck= share link opens the builder on the shared deck class', JSON.stringify(deep));
		A(deep.name === 'Imported deck', 'the deep-linked deck loads as an unsaved "Imported deck" to review + Save', deep.name);
		A(deep.search === '', 'the ?deck= param is stripped from the URL after loading (clean refresh state)', deep.search);

		// --- 3) a bad ?deck= link falls back to a fresh blank deck, no crash ---
		const preBadErrors = softErrors().length;
		await page.goto(`http://localhost:${PORT}/battlecards/deck.html?deck=totally-not-a-code`, { waitUntil: 'domcontentloaded' });
		const fellBack = await waitFor(() => page.evaluate(() => document.querySelector('#edit-view')?.style.display === 'flex' && (window.__deck?.deck?.length === 0)), 15000);
		A(fellBack, 'a bad ?deck= link falls back to a fresh blank deck (no crash, empty working deck)');
		A(softErrors().length === preBadErrors, 'the bad link produced no new uncaught errors', softErrors().slice(-3).join(' | '));

		A(softErrors().length === 0, 'no uncaught client errors across all three loads', softErrors().slice(0, 4).join(' | '));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
