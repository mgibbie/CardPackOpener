// TEMP (debug, removed before review): why the Battlecards board suites stall in CI
import fs from 'fs';
import path from 'path';
import http from 'http';
import puppeteer from 'puppeteer-core';
const ROOT = path.resolve('.');
const PORT = 9399;
const STATE = { username: 'bryan', friendCode: 'BRYAN0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
page.on('pageerror', e => console.log('pageerror', e.message));
page.on('console', m => { if (/error|warn/i.test(m.type())) console.log('console.' + m.type(), m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'bryan'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
const T0 = Date.now();
await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
const snap = async (tag) => {
	const r = await page.evaluate(() => {
		const g = window.__game;
		const vis = e => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
		const modals = [...document.querySelectorAll('.modal, [class*=modal], [id*=modal], dialog, [role=dialog]')].filter(vis).map(e => (e.id || e.className) + ': ' + e.textContent.trim().slice(0, 80));
		const btns = [...document.querySelectorAll('button')].filter(vis).map(b => b.textContent.trim().slice(0, 30)).slice(0, 15);
		let fps = null;
		return { ready: !!(g && g.state && g.targeting), over: g?.state?.over, cur: g?.state?.current, busy: g?.busy?.(), turn: g?.state?.turn, modals, btns, el: (document.elementFromPoint(683, 700) || {}).id || (document.elementFromPoint(683, 700) || {}).className };
	}).catch(e => ({ err: e.message }));
	console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${tag}`, JSON.stringify(r));
};
for (let i = 0; i < 12; i++) { await snap('t'); await sleep(1500); }
const fr = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('fps', fr);
await page.screenshot({ path: 'overworld/tests/ci-bc-debug.png' });
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
for (let i = 0; i < 4; i++) { await sleep(1000); await snap('after keep'); }
await page.screenshot({ path: 'overworld/tests/ci-bc-debug2.png' });
await browser.close(); server.close();
