// pocketenhanced_attackfx_test.mjs — an attack's type shown where it lands (owner's improvement list, 2026-11-18: "attack
// animations by type", "yes to all"). pocketenhanced/js/main.js HIT_FX, css/pocket.css .pe-hitfx.
//   1. every attack type the cards use has a shape and a colour; seven shapes in all
//   2. a damage line in a player's view of the log says where it landed and the attack's type
//   3. in play: when my attack lands, the Pokémon it hit shows the effect in that attack's shape and colour, once (a
//      redraw does not play it again); the attacker lunges as before
//   4. with reduced motion, nothing is shown
//   node overworld/tests/pocketenhanced_attackfx_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { CARDS } from '../../pocketenhanced/js/data/cards.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9602, SHOTS = process.env.POCKET_SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const open = async calm => {
		const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
		if (calm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(() => localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })));
		await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300; i++) { if (await page.evaluate(() => !!(window.__pocket && window.__pocket.ready)).catch(() => false)) break; await sleep(100); }
		return { page, errors };
	};
	// ===== 1. every type =====
	const types = [...new Set(CARDS.flatMap(c => (c.attacks || []).flatMap(a => [a.combatType, a.typeWas]).filter(Boolean)))];
	const { page, errors } = await open(false);
	const table = await page.evaluate(async () => { const src = await (await fetch('/pocketenhanced/js/main.js')).text(), m = /const HIT_FX = (\{[\s\S]*?\});/.exec(src); return m ? m[1] : null; });
	const HIT = table ? Function('return ' + table)() : {};
	A(types.length >= 18 && types.every(t => Array.isArray(HIT[t]) && /^#[0-9a-f]{6}$/i.test(HIT[t][1])), `each of the ${types.length} attack types the cards use has a shape and a colour`, types.filter(t => !HIT[t]));
	const shapes = [...new Set(Object.values(HIT).map(x => x[0]))];
	A(shapes.length === 7, `seven shapes: ${shapes.join(', ')}`);
	const css = fs.readFileSync(path.join(ROOT, 'pocketenhanced/css/pocket.css'), 'utf8');
	A(shapes.every(sh => css.includes(`.pe-hitfx.${sh} i {`)) && /prefers-reduced-motion: reduce\) \{ \.pe-hitfx \{ display: none; \}/.test(css), 'each shape is drawn in the style sheet, and none with reduced motion');

	// ===== 2 + 3. in play =====
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'fx1', singles: true }));
	const ready = await page.evaluate(async () => { const P = window.__pocket, { nextAction } = await import('/pocketenhanced/js/ai.js');
		for (let n = 0; n < 2000; n++) { const S = P.state(); if (S.over) return 'over'; if (S.phase === 'main' && S.current === 0 && !S.pending && S.turn >= 3) return 'ready';
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 30)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 30)); }
		return 'gave up'; });
	A(ready === 'ready', '(a match at my turn)', ready);
	// my Active Pokémon has the Energy for its attacks, and the opposing one plenty of HP (so it is hit, not Knocked Out)
	const info = await page.evaluate(() => { const P = window.__pocket, S = P.engineState(), k = S.players[0].active[0], foe = S.players[1].active[0]; k.energy = Array(6).fill('Fire'); foe.hp = 9999; foe.dmg = 0; P.refresh(); return { foe: foe.uid }; });
	await sleep(300);
	// (the effect lives until the next redraw: it is caught as it appears)
	await page.evaluate(() => { window.__hits = []; new MutationObserver(() => { for (const f of document.querySelectorAll('.pe-poke .pe-hitfx')) if (!f.dataset.seen) { f.dataset.seen = 1; window.__hits.push({ at: f.parentElement.dataset.k, type: f.dataset.type, shape: f.className.replace('pe-hitfx ', ''), col: f.style.getPropertyValue('--hc') }); } }).observe(document.body, { subtree: true, childList: true }); });
	await page.evaluate(() => document.querySelector('[data-k="p:0:active:0"]').click()); await sleep(250);
	const atkType = await page.evaluate(async () => { const { CARDS } = await import('/pocketenhanced/js/data/cards.js'), P = window.__pocket, k = P.view().players[0].active[0], c = CARDS.find(x => x.id === k.id);
		const b = [...document.querySelectorAll('.modal [data-k^="atk"]')].find(x => !x.disabled && (c.attacks[+x.dataset.k.slice(3)].damage | 0) > 0); if (!b) return null; b.click(); return c.attacks[+b.dataset.k.slice(3)].name; });   // (an attack that does damage)
	if (await page.evaluate(() => !!window.__pocket.ui().pick)) await page.evaluate(() => { const t = document.querySelector('.pe-poke.legal'); if (t) t.click(); });
	await sleep(200);
	if (await page.evaluate(() => !!document.querySelector('[data-k="exec"]') && !document.querySelector('[data-k="exec"]').disabled && window.__pocket.view().current === 0)) { await page.evaluate(() => document.querySelector('[data-k="exec"]').click()); await sleep(200); await page.evaluate(() => { const b = document.querySelector('.modal [data-k="exec2"]'); if (b) b.click(); }); }
	let seen = null; for (let i = 0; i < 100 && !seen; i++) { seen = await page.evaluate(() => window.__hits[0] || null); if (!seen) await sleep(60); }
	const hitsSeen = await page.evaluate(() => window.__hits.length);
	const dmg = await page.evaluate(() => { const L = window.__pocket.view().log, d = [...L].reverse().find(e => e.k === 'damage' && e.to && e.seat === 0); return d ? { to: d.to, type: d.type } : null; });
	A(!!dmg && dmg.to && dmg.to.seat === 1 && dmg.to.zone === 'active' && typeof dmg.type === 'string', "a damage line in my view of the log says where it landed and the attack's type", dmg);
	A(!!seen && seen.at === 'p:1:active:0' && seen.type === dmg.type && seen.shape === HIT[dmg.type][0] && seen.col === HIT[dmg.type][1], `the opposing Active Pokémon shows the ${dmg && dmg.type} effect where my attack landed: the ${seen && seen.shape} shape in its colour`, seen);
	if (SHOTS && seen) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'attackfx.png') }); }
	await sleep(1200); await page.evaluate(() => window.__pocket.refresh()); await sleep(150);
	A(!(await page.evaluate(() => document.querySelector('.pe-hitfx'))) && hitsSeen === 1, 'it was shown once, and a redraw does not play it again', hitsSeen);
	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
	// ===== 4. reduced motion =====
	const calm = await open(true);
	A(await calm.page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--x') === '' && matchMedia('(prefers-reduced-motion: reduce)').matches), '(a page with reduced motion)');
	await calm.page.evaluate(() => window.__pocket.start({ players: 2, seed: 'fx1', singles: true }));
	await calm.page.evaluate(async () => { const P = window.__pocket, { nextAction } = await import('/pocketenhanced/js/ai.js'); let saw = false; const mo = new MutationObserver(() => { if (document.querySelector('.pe-hitfx')) saw = true; }); mo.observe(document.body, { subtree: true, childList: true }); window.__sawHit = () => saw;
		for (let n = 0; n < 600 && !P.state().over; n++) { const S = P.state(); const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 20)); continue; } const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 20)); } });
	const attacked = await calm.page.evaluate(() => window.__pocket.view().log.some(e => e.k === 'damage' && e.to));
	A(attacked && !(await calm.page.evaluate(() => window.__sawHit())), 'with reduced motion, attacks land and no effect is ever shown');
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
