// pocketenhanced_dust_page_test.mjs — dust on Pocket Enhanced's Collection screen, in the page, against the real
// collection and dust handlers (server/pocket_collection.mjs) over an in-memory row store.
//   1. a signed-in player's Collection shows the account's dust; a guest's shows none and offers no dust buttons
//   2. a card's page lists each of its printings with its price; one she can afford is made: the dust goes down, the
//      printing is hers, on the account and on the page; one she cannot afford is greyed and says what she has
//   3. "Break down N spare copies" asks first, then breaks them down: the dust goes up, two of each are kept
//   4. a single spare copy can be broken down from its card's page
//   node overworld/tests/pocketenhanced_dust_page_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as C from '../../pocketenhanced/js/collection.js';
import { CARDS } from '../../pocketenhanced/js/data/cards.js';
import { handlePkcol, handlePkdust } from '../../server/pocket_collection.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9597, SHOTS = process.env.POCKET_SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; };

const rows = new Map();
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setJSON: async (k, v) => { rows.set(k, JSON.stringify(v)); },
	setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; },
	getWithLength: async k => (rows.has(k) ? { value: JSON.parse(rows.get(k)), n: rows.get(k).length } : { value: null, n: null }),
	setIfLength: async (k, v, n) => { const cur = rows.has(k) ? rows.get(k).length : null; if (cur !== n) return false; rows.set(k, JSON.stringify(v)); return true; },
};
// a card with at least two printings of different prices: its cheapest and its dearest
const multi = CARDS.find(c => c.kind === 'pokemon' && (c.printings || []).filter(p => C.craftCost(p)).length >= 2 && Math.min(...c.printings.filter(p => C.craftCost(p)).map(p => C.craftCost(p))) <= 400);
const priced = multi.printings.filter(p => C.craftCost(p)).sort((a, b) => C.craftCost(a) - C.craftCost(b)), CHEAP = priced[0], DEAR = priced[priced.length - 1];
const spareCard = CARDS.find(c => c.id !== multi.id && c.kind === 'pokemon' && C.craftCost(c.id) === 40);
const start = { ...C.newCollection(), prints: { ...C.newCollection().prints, [spareCard.id]: 5 } };
rows.set('ann', JSON.stringify({ username: 'ann', dust: C.craftCost(CHEAP) + 10, collection: {}, packs: 0, friends: [] }));
rows.set('pkcol:ann', JSON.stringify({ rev: 1, col: start, at: 1, ids: [] }));
const acct = () => JSON.parse(rows.get('ann')), col = () => JSON.parse(rows.get('pkcol:ann')).col;
const json = (o, status) => ({ ...o, status: status || 200 });
async function api(b) {
	const user = b.token === 'ta' ? 'ann' : null, action = b.action, now = Date.now();
	if (action.startsWith('pkdust-')) return handlePkdust({ action, body: b, store, username: user, json, now });
	if (/^pk(col|deck|solo)-/.test(action)) return handlePkcol({ action, body: b, store, username: user, json, now });
	return { ok: true, state: user ? acct() : null, friends: [], challenges: [], live: [] };
}
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { /* not JSON */ }
		b.token = String(req.headers.authorization || '').replace(/^Bearer /, '') || b.token;
		try { const r = await api(b); res.writeHead(r.status || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); } catch (e) { res.destroy(); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const open = async signedIn => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((tok, st) => { localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } }, signedIn ? 'ta' : null, signedIn ? acct() : null);
		await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
		const click = async sel => { const ok = await page.evaluate(s => { const e = [...document.querySelectorAll(s)].filter(x => x.offsetWidth > 3).pop(); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; }, sel); await sleep(350); return ok; };
		return { page, errors, click, q: (fn, ...a) => page.evaluate(fn, ...a) };
	};
	// ===== 1. a guest =====
	const guest = await open(false);
	await guest.click('[data-k="collection"]'); await sleep(600);
	await guest.click(`[data-k="c${multi.id}"]`);
	A(await guest.q(() => !document.querySelector('[data-k="dust"]') && !document.querySelector('[data-k="breakall"]') && !document.querySelector('.modal [data-k^="craft:"]')), "a guest's Collection shows no dust and offers no dust buttons (dust is the account's)");
	await guest.page.close();

	// ===== 2. making a printing =====
	const ann = await open(true);
	await waitFor(() => ann.q(() => window.__pocket.sync() === 'synced'), 15000);
	await ann.click('[data-k="collection"]');
	const have = C.craftCost(CHEAP) + 10;
	A(await waitFor(() => ann.q(n => (document.querySelector('[data-k="dust"]') || {}).textContent === `${n.toLocaleString()} dust`, have), 8000), `the Collection shows the account's dust (${have})`, await ann.q(() => (document.querySelector('[data-k="dust"]') || {}).textContent));
	await ann.click(`[data-k="c${multi.id}"]`);
	const opts = await ann.q(() => [...document.querySelectorAll('.modal [data-k^="craft:"]')].map(b => [b.dataset.k.slice(6), b.disabled, b.textContent.replace(/\s+/g, ' ').trim()]));
	A(opts.length === priced.length && opts.find(o => o[0] === CHEAP) && !opts.find(o => o[0] === CHEAP)[1] && new RegExp(`\\(${C.craftCost(CHEAP).toLocaleString()} dust`).test(opts.find(o => o[0] === CHEAP)[2]) && (DEAR === CHEAP || (opts.find(o => o[0] === DEAR)[1] && /you have/.test(opts.find(o => o[0] === DEAR)[2]))), `${multi.name}'s page lists each of its ${priced.length} printings with its price; the one she can afford can be pressed, the dear one is greyed and says what she has`, opts);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await ann.page.screenshot({ path: path.join(SHOTS, 'dust_1_card.png') }); }
	const before = col().prints[CHEAP] || 0;
	await ann.click(`.modal [data-k="craft:${CHEAP}"]`);
	A(await waitFor(() => acct().dust === 10 && col().prints[CHEAP] === before + 1, 8000), 'she makes the cheap printing: on the account the dust is 10 and the printing is hers', [acct().dust, col().prints[CHEAP]]);
	A(await waitFor(() => ann.q((p, n) => (window.__pocket.collection().prints[p] || 0) === n && (document.querySelector('[data-k="dust"]') || {}).textContent === '10 dust', CHEAP, before + 1), 8000) && !acct().pkCraft, 'and on the page: the printing is in her collection and the header says 10 dust', await ann.q(() => (document.querySelector('[data-k="dust"]') || {}).textContent));

	// ===== 3. every spare copy =====
	const sp = C.spares(col()), copies = sp.list.reduce((a, x) => a + x[1], 0);
	const label = await ann.q(() => (document.querySelector('[data-k="breakall"]') || {}).textContent || '');
	A(copies >= 3 && new RegExp(`Break down ${copies} spare cop`).test(label) && label.includes(`+${sp.dust.toLocaleString()} dust`), `the Collection offers "Break down ${copies} spare copies (+${sp.dust} dust)"`, label);
	await ann.click('[data-k="breakall"]');
	A(await ann.q(() => /cannot be undone/.test((document.querySelector('.modal:last-of-type') || {}).textContent || '')) && col().prints[spareCard.id] === 5, 'it asks first (it cannot be undone); nothing has gone yet');
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'dust_2_breakall.png') });
	await ann.click('[data-k="breakall-yes"]');
	A(await waitFor(() => acct().dust === 10 + sp.dust && col().prints[spareCard.id] === 2 && !C.spares(col()).list.length, 8000), `yes: the dust is ${10 + sp.dust}, and two of each printing are kept`, [acct().dust, col().prints[spareCard.id]]);
	A(await waitFor(() => ann.q(n => (document.querySelector('[data-k="dust"]') || {}).textContent === `${n.toLocaleString()} dust` && !document.querySelector('[data-k="breakall"]'), 10 + sp.dust), 8000), 'the page shows the new dust, and the button is gone (no spare copies left)');

	// ===== 4. one spare copy from its card =====
	{ const r = JSON.parse(rows.get('pkcol:ann')); r.col.prints[spareCard.id] = 3; r.rev++; rows.set('pkcol:ann', JSON.stringify(r)); }
	await ann.q(() => window.__pocket.syncNow && window.__pocket.syncNow());
	await ann.page.reload({ waitUntil: 'domcontentloaded' }); await waitFor(() => ann.q(() => !!(window.__pocket && window.__pocket.ready) && window.__pocket.sync() === 'synced'), 30000); await sleep(400);
	await ann.click('[data-k="collection"]'); await waitFor(() => ann.q(() => /\d dust/.test((document.querySelector('[data-k="dust"]') || {}).textContent || '')), 8000);
	await ann.click(`[data-k="c${spareCard.id}"]`);
	const d0 = acct().dust;
	A(await ann.click(`.modal [data-k="break:${spareCard.id}"]`) && await waitFor(() => acct().dust === d0 + 5 && col().prints[spareCard.id] === 2, 8000), 'a third copy of a ◆: "Break down a spare" on its card gives 5 dust and leaves two', [acct().dust, d0, col().prints[spareCard.id]]);
	A(!ann.errors.length, 'no page errors', ann.errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
