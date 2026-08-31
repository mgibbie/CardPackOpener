// deck_craft_smoke.mjs — the collection endgame, from inside the deck builder.
//
// Two things used to dead-end here:
//
//   1. Duplicates. Nothing capped ownership, but nothing paid you for extras
//      either, so a pack of cards you already had felt like it did nothing.
//      Ownership is now an explicit ceiling (999) with overflow auto-dusted,
//      and "Dust extras" trades everything past a PLAYSET (2, legendaries 1)
//      for dust. Those two caps are deliberately different numbers and the
//      easiest way to break this is to conflate them — so both are asserted.
//
//   2. Crafting. The `craft` action existed but the only button for it lived on
//      the separate collection page. Hitting a card you don't own mid-build
//      meant leaving the deck. Now the builder carries the dust balance, a
//      Missing filter, and a Craft button in the inspect panel.
//
// Runs the REAL dev server on a throwaway sqlite, so the dust ledger, the
// playset cap and the craft cost are the actual ones, not stubs.
//
//   node battlecards/tests/integration/deck_craft_smoke.mjs
import { spawn } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8927;
const BASE = `http://localhost:${PORT}`;
const PLAYSET = 2, LEGENDARY_PLAYSET = 1, CEILING = 999;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());
async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deckcraft-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	let browser;
	try {
		A(await waitFor(() => fetch(BASE + '/battlecards/deck.html').then(r => r.ok), 20000), 'dev server is up');
		const reg = await api('register', { username: 'crafter', password: 'localdev1' });
		const token = reg.token;
		if (!token) throw new Error('auth failed: ' + JSON.stringify(reg).slice(0, 120));

		// ---- duplicates accumulate: a pack is never wasted ----
		for (let i = 0; i < 25; i++) await api('open-pack', {}, token);
		const stocked = (await api('state', {}, token)).state;
		const counts = Object.values(stocked.collection);
		A(counts.some(n => n > PLAYSET),
			'copies pile up past a playset instead of being thrown away',
			`highest count ${Math.max(...counts)}`);
		A(counts.every(n => n <= CEILING), 'and stay under the ownership ceiling', `max ${Math.max(...counts)}`);

		// ---- the ceiling pays dust rather than dropping the card ----
		// Park the WHOLE pool at the ceiling so the next pack is guaranteed to
		// overflow — waiting for a random duplicate made this check skip itself.
		const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards/cards.json'), 'utf8')).cards;
		const db = new DatabaseSync(dbFile);
		const blob = JSON.parse(db.prepare('SELECT value FROM mp_store WHERE key = ?').get('crafter').value);
		for (const c of pool) if (c && c.id) blob.collection[c.id] = CEILING;
		const dustBefore = blob.dust || 0;
		db.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(blob), 'crafter');
		db.close();

		const overflowed = await api('open-pack', {}, token);
		const capped = (await api('state', {}, token)).state;
		A((overflowed.cards || []).length > 0, 'a pack opens against a maxed-out collection');
		A(Object.values(capped.collection).every(n => n <= CEILING),
			'nothing climbs past the ownership ceiling', `max ${Math.max(...Object.values(capped.collection))}`);
		A(capped.dust > dustBefore,
			'and every overflow copy is refunded as dust, not dropped', `dust ${dustBefore} -> ${capped.dust}`);

		// put the account back to a normal shape for the UI half of the test
		const db2 = new DatabaseSync(dbFile);
		const restored = JSON.parse(db2.prepare('SELECT value FROM mp_store WHERE key = ?').get('crafter').value);
		restored.collection = stocked.collection;
		// A known float above the dearest card (legendary, 1600) so the craft leg
		// tests the BUTTON rather than pack luck — earning dust is asserted above.
		restored.dust = 2000;
		db2.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(restored), 'crafter');
		db2.close();

		// ---- the builder ----
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1400, height: 900 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument(t => { localStorage.setItem('magepunk_mp_token_v1', t); }, token);
		await page.goto(`${BASE}/battlecards/deck.html?mp=1`, { waitUntil: 'domcontentloaded' });
		const booted = await waitFor(() => page.evaluate(() => !document.getElementById('dust-bal').hidden), 120000);
		A(booted, 'the builder boots and shows a dust balance in the top bar');
		if (!booted) throw new Error('boot failed');

		// ---- dusting extras, without leaving the deck ----
		const beforeDust = await page.evaluate(() => ({
			dust: document.getElementById('dust-bal').textContent,
			offer: document.getElementById('dust-extras').hidden ? null : document.getElementById('dust-extras').textContent,
		}));
		A(/^♻️ Dust extras \+[\d,]+$/.test(beforeDust.offer || ''),
			'and offers to dust the extras, previewing the payout', JSON.stringify(beforeDust));

		await page.click('#dust-extras');
		const paid = await waitFor(() => page.evaluate(() => document.getElementById('dust-extras').hidden), 30000);
		A(paid, 'dusting clears the offer once there is nothing left over');
		const afterDust = await page.evaluate(() => document.getElementById('dust-bal').textContent);
		const dustAmount = +afterDust.replace(/[^\d]/g, '');
		A(dustAmount > 0, 'and the balance goes up', afterDust);

		// the server agrees — the readout is not a local fiction
		A((await api('state', {}, token)).state.dust === dustAmount,
			'the server holds the same dust the builder is showing', String(dustAmount));

		// dusting stops at a PLAYSET, not at the ownership ceiling
		const post = (await api('state', {}, token)).state.collection;
		A(Object.values(post).every(n => n <= PLAYSET),
			'dusting trims to a playset — the deck cap, not the 999 ownership cap',
			`max ${Math.max(...Object.values(post))}`);

		// ---- Owned -> All -> Missing ----
		const cycle = [];
		for (let i = 0; i < 3; i++) {
			await page.click('#owned-toggle');
			await new Promise(r => setTimeout(r, 400));
			cycle.push(await page.evaluate(() => document.getElementById('owned-toggle').textContent));
		}
		A(cycle.join(',') === 'All,Missing,Owned', 'the filter cycles Owned -> All -> Missing', cycle.join(','));

		// land on Missing and confirm it only lists cards short of a playset
		await page.click('#owned-toggle'); await page.click('#owned-toggle');
		await waitFor(() => page.evaluate(() => document.getElementById('owned-toggle').textContent === 'Missing'), 8000);
		await new Promise(r => setTimeout(r, 900));
		const missing = await page.evaluate(() => ({
			mode: document.getElementById('owned-toggle').textContent,
			tiles: document.querySelectorAll('#grid .tile').length,
		}));
		A(missing.mode === 'Missing' && missing.tiles > 0,
			'the Missing view lists cards you are short of', JSON.stringify(missing));

		// ---- crafting one, in place ----
		await page.evaluate(() => document.querySelector('#grid .tile').click());
		await waitFor(() => page.evaluate(() => document.getElementById('zoom').classList.contains('open')), 8000);
		const btn = await page.evaluate(() => {
			const b = document.getElementById('zoom-craft');
			return { hidden: b.hidden, disabled: b.disabled, text: b.textContent };
		});
		A(!btn.hidden, 'a card you are missing offers a Craft button', JSON.stringify(btn));
		A(/^⚒ (Craft|Need) 💎[\d,]+$/.test(btn.text), 'labelled with the price, short enough not to wrap', btn.text);

		if (!btn.disabled) {
			const owedBefore = await page.evaluate(() => document.querySelector('.z-owned').textContent);
			await page.click('#zoom-craft');
			const done = await waitFor(() => page.evaluate(t =>
				document.querySelector('.z-owned').textContent !== t, owedBefore), 30000);
			A(done, 'crafting updates the copies you own without leaving the deck');
			const end = await page.evaluate(() => ({
				owned: document.querySelector('.z-owned').textContent,
				dust: +document.getElementById('dust-bal').textContent.replace(/[^\d]/g, ''),
				status: document.getElementById('status').textContent,
			}));
			A(end.dust < dustAmount, 'and spends the dust', `${dustAmount} -> ${end.dust}`);
			A(/^Crafted /.test(end.status), 'confirming which card was crafted', end.status);
			// the balance on screen is the server's, not an optimistic guess
			A((await api('state', {}, token)).state.dust === end.dust,
				'the server charged exactly what the builder showed', String(end.dust));
		} else {
			A(false, 'expected enough dust to craft after dusting extras', btn.text);
		}

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
