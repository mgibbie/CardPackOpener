// deck_codes_smoke.mjs — the deck builder still boots with the deck-code wiring.
// If a button id is mismatched, deck.js throws at `$('export-code').onclick = ...`
// during init and the whole builder breaks — this catches that. Boots deck.html in
// LOCAL mode (no login needed), confirms it initialized (class-select populated) and
// the code buttons exist, with no uncaught errors.
//
// Standalone (needs headless Chrome + puppeteer-core); NOT in run-all.mjs.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
		await page.goto(`http://localhost:${PORT}/battlecards/deck.html`, { waitUntil: 'domcontentloaded' });

		// deck.js fully ran iff the class dropdown got populated (that happens AFTER the
		// $('export-code').onclick assignment, so a booted builder proves the wiring loaded)
		const booted = await waitFor(() => page.evaluate(() => document.querySelector('#class-select')?.options?.length > 0), 15000);
		A(booted, 'the deck builder initialized (class-select populated ⇒ deck.js ran past the code-button wiring)');

		const buttons = await page.evaluate(() => ({ exp: !!document.querySelector('#export-code'), imp: !!document.querySelector('#import-code') }));
		A(buttons.exp && buttons.imp, 'the Copy Code + Import Code buttons exist', JSON.stringify(buttons));

		// exporting with no deck built shows the guard message (proves the handler runs)
		await page.evaluate(() => document.querySelector('#export-code')?.click());
		await sleep(200);
		const guarded = await page.evaluate(() => /build a deck first/i.test(document.querySelector('#status')?.textContent || ''));
		A(guarded, 'export with an empty deck shows the guard flash (handler wired + runs)');

		A(errors.filter(e => !/Failed to load resource/i.test(e)).length === 0, 'no uncaught client errors on boot', errors.slice(0, 4).join(' | '));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
