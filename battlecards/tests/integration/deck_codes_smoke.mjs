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
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
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
		// grant clipboard so the "copy link" success path (flash) runs; dismiss any prompt fallback so nothing hangs
		try { await browser.defaultBrowserContext().overridePermissions(`http://localhost:${PORT}`, ['clipboard-read', 'clipboard-write']); } catch {}
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 900 }); // desktop layout so slot controls are hit-testable
		// capture the prompt-fallback default (the share link) so the test works whether or not headless clipboard resolves
		let lastDialog = null;
		page.on('dialog', d => { lastDialog = { msg: d.message(), def: d.type() === 'prompt' ? d.defaultValue() : '' }; d.dismiss().catch(() => {}); });
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

		// --- 1b) card-grid keyboard accessibility: tiles are focusable buttons, Enter opens the card ---
		await page.evaluate(() => document.querySelector('#owned-toggle')?.click()); // "All" so tiles render even with no collection
		const haveTile = await waitFor(() => page.evaluate(() => !!document.querySelector('#grid .tile')), 10000);
		A(haveTile, 'the collection grid renders card tiles (All view)');
		const tileA11y = await page.evaluate(() => { const t = document.querySelector('#grid .tile'); return t ? { role: t.getAttribute('role'), tabindex: t.getAttribute('tabindex'), label: !!t.getAttribute('aria-label') } : null; });
		A(tileA11y && tileA11y.role === 'button' && tileA11y.tabindex === '0' && tileA11y.label, 'a card tile is a keyboard-operable button (role/tabindex/aria-label)', JSON.stringify(tileA11y));
		// Enter on a focused tile opens the card detail (query+focus+dispatch atomically to avoid a re-render race)
		await sleep(400); // let any in-flight grid re-render settle
		await page.evaluate(() => { const t = document.querySelector('#grid .tile'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
		A(await waitFor(() => page.evaluate(() => document.querySelector('#zoom')?.classList.contains('open')), 4000), 'pressing Enter on a focused tile opens the card detail (keyboard path to Add)');
		await page.evaluate(() => document.querySelector('#zoom')?.classList.remove('open')); // close for later steps

		// --- 1c) starter deck templates: the section renders + clicking one loads a 40-card deck ---
		await page.evaluate(() => { const b = document.querySelector('#back-to-decks'); if (b) b.click(); }); // to the My Decks view
		const haveStarters = await waitFor(() => page.evaluate(() => { const s = document.querySelector('#starter-section'); return !!(s && s.style.display !== 'none' && document.querySelectorAll('#starter-list .starter-row').length >= 5); }), 10000);
		A(haveStarters, 'the "Start from a template" section lists starter decks (one per class)');
		await page.evaluate(() => document.querySelector('#starter-list .starter-row')?.click());
		await sleep(300);
		const loaded = await page.evaluate(() => ({ editing: document.querySelector('#edit-view')?.style.display === 'flex', n: window.__deck?.deck?.length }));
		A(loaded.editing && loaded.n === 40, 'clicking a starter loads a full 40-card deck into the editor', JSON.stringify(loaded));

		// --- 1d) deck analytics: the loaded 40-card deck shows a mana curve + breakdown ---
		const stats = await page.evaluate(() => {
			const s = document.querySelector('#deck-stats');
			const bars = document.querySelectorAll('#ds-curve .ds-bar');
			let sum = 0; bars.forEach(b => { sum += +(b.querySelector('.ds-n')?.textContent || 0); });
			return { shown: !!(s && s.style.display !== 'none'), bars: bars.length, barSum: sum, types: document.querySelector('#ds-types')?.textContent || '', rarity: document.querySelector('#ds-rarity')?.textContent || '' };
		});
		A(stats.shown && stats.bars === 8 && stats.barSum === 40, 'the deck analytics panel shows an 8-bucket mana curve summing to 40 cards', JSON.stringify({ shown: stats.shown, bars: stats.bars, barSum: stats.barSum }));
		A(/avg/i.test(stats.types) && /creature|spell/i.test(stats.types) && stats.rarity.length > 0, 'it shows avg cost + a type + rarity breakdown', JSON.stringify({ types: stats.types, rarity: stats.rarity }));

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

		// --- 4) share a SAVED deck straight from the My Decks list (no need to open it) ---
		const seed = JSON.stringify([{ id: 'd_share', name: 'Aggro Test', classId: realClass, cards: ['a', 'b', 'c'], commander: null, companion: null }]);
		await page.goto(`http://localhost:${PORT}/battlecards/deck.html`, { waitUntil: 'domcontentloaded' });
		await page.evaluate(s => localStorage.setItem('magepunk_decks_v1', s), seed); // seed a saved deck
		await page.reload({ waitUntil: 'domcontentloaded' });
		// wait until deck.js has booted AND loaded the seeded slot (the element is static HTML, so it exists before boot)
		await waitFor(() => page.evaluate(() => window.__deck?.slots?.length > 0), 15000);
		await page.evaluate(() => document.querySelector('#back-to-decks').click()); // boot opens on the blank editor; go to the list
		const onList = await waitFor(() => page.evaluate(() => document.querySelector('#decks-view')?.style.display !== 'none' && !!document.querySelector('#slot-list .s-share')), 10000);
		A(onList, 'saved decks in the My Decks list show a 🔗 share button');
		lastDialog = null;
		// fire the handler in-page (reliably hits the element) — an untrusted click means
		// clipboard.writeText rejects (no user gesture), so shareSlot deterministically
		// falls back to prompt() whose default value is the ?deck= share link
		await page.evaluate(() => document.querySelector('#slot-list .s-share')?.click());
		await waitFor(() => !!lastDialog, 3000).catch(() => {});
		const stillList = await page.evaluate(() => document.querySelector('#decks-view')?.style.display !== 'none' && document.querySelector('#edit-view')?.style.display === 'none');
		A(stillList, 'clicking a slot 🔗 does NOT open the editor (stopPropagation holds)');
		A(/deck\.html\?deck=MPCK/i.test(lastDialog?.def || ''), 'clicking a slot 🔗 produces its ?deck= share link', JSON.stringify({ dialog: lastDialog?.def?.slice(0, 60) }));

		A(softErrors().length === 0, 'no uncaught client errors across all loads', softErrors().slice(0, 4).join(' | '));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { if (browser) await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
