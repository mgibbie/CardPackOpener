// pocketenhanced_mat_test.mjs — where the Pokémon stand on the mat (pocketenhanced/js/main.js sizes(), css/pocket.css).
// Owner, 2026-11-17: the Bench is BEHIND the Active Pokémon, never beside them.
// For every shape of table (a wide screen and a phone; 2, 3 and 4 players; this game's two Active slots and Pocket's
// one), with every slot of every player filled:
//   - my Bench is a row below my Active Pokémon (further from the middle of the mat), wholly below them;
//     each opponent's Bench is a row above theirs, wholly above
//   - an Active Pokémon is larger than a Benched one, and mine still show their attacks
//   - nothing runs off the stage; my Pokémon do not cover my hand; no opponent's card reaches down onto mine
//   node overworld/tests/pocketenhanced_mat_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9591, SHOTS = process.env.POCKET_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	const WIDE = { width: 1600, height: 900 }, PHONE = { width: 412, height: 892, isMobile: true, hasTouch: true };
	const TABLES = [['a wide screen, 2 players', WIDE, { players: 2 }], ['a wide screen, 3 players', WIDE, { players: 3 }], ['a wide screen, 4 players', WIDE, { players: 4 }], ['a wide screen, singles', WIDE, { players: 2, singles: true }],
		['a phone, 2 players', PHONE, { players: 2 }], ['a phone, 4 players', PHONE, { players: 4 }], ['a phone, singles', PHONE, { players: 2, singles: true }]];
	for (const [name, vp, opts] of TABLES) {
		const page = await browser.newPage(); await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(() => localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })));
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=mat`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300; i++) { if (await page.evaluate(() => !!(window.__pocket && window.__pocket.ready)).catch(() => false)) break; await sleep(100); }
		await page.evaluate(o => { window.__pocket.start({ ...o, seed: 'mat1' }); }, opts); await sleep(600);
		// every slot of every player filled
		await page.evaluate(() => {
			const S = window.__pocket.engineState();
			for (const p of S.players) { const mk = id => ({ uid: ++S.uid, id, cards: [id], dmg: 0, hp: 100, energy: ['Fire'], status: [], fx: [], tool: null, turnPlayed: 0 }); p.active = p.active.map(() => mk('A1-036')); p.bench = p.bench.map(() => mk('A1-089')); p.setup = true; }
			S.phase = 'main'; S.turn = 3; S.current = 0; S.order = S.players.map(p => p.seat); S.pending = null; window.__pocket.refresh();
		});
		await sleep(900);
		const m = await page.evaluate(() => {
			const st = document.getElementById('stage').getBoundingClientRect(), box = e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
			const seats = {};
			for (const e of document.querySelectorAll('.pe-poke[data-k^="p:"]')) { const [, s, z] = e.dataset.k.split(':'); (seats[s] = seats[s] || { active: [], bench: [] })[z].push({ ...box(e), atk: !!e.querySelector('.atk') && getComputedStyle(e.querySelector('.atks')).display !== 'none' }); }
			const hand = document.querySelector('.pe-hand');
			return { seats, st: { l: st.left, t: st.top, r: st.right, b: st.bottom }, hand: hand ? box(hand) : null, modes: [...document.querySelectorAll('.pe-rows')].map(e => e.className) };
		});
		const seats = Object.keys(m.seats).map(Number), me = 0, n = opts.players || 2, act = opts.singles ? 1 : 2, ben = opts.singles ? 3 : 4;
		A(seats.length === n && seats.every(s => m.seats[s].active.length === act && m.seats[s].bench.length === ben) && m.modes.every(c => /\bstack\b/.test(c) && !/\b(row|grid)\b/.test(c)), `[${name}] every player's ${act} Active and ${ben} Benched Pokémon are on the mat, the Bench in a row of its own`, m.modes);
		const mine = m.seats[me];
		A(Math.min(...mine.bench.map(b => b.t)) >= Math.max(...mine.active.map(a => a.b)) - 0.5, `[${name}] my Bench is wholly below my Active Pokémon: behind them, not beside them`, [mine.active.map(a => Math.round(a.b)), mine.bench.map(b => Math.round(b.t))]);
		const opps = seats.filter(s => s !== me);
		A(opps.every(s => Math.max(...m.seats[s].bench.map(b => b.b)) <= Math.min(...m.seats[s].active.map(a => a.t)) + 0.5), `[${name}] each opponent's Bench is wholly above their Active Pokémon (behind them, from where I sit)`, opps.map(s => [m.seats[s].bench.map(b => Math.round(b.b)), m.seats[s].active.map(a => Math.round(a.t))]));
		A(seats.every(s => m.seats[s].active.every(a => m.seats[s].bench.every(b => a.w > b.w))) && mine.active.every(a => a.atk), `[${name}] an Active Pokémon is larger than a Benched one, and mine still show their attacks`);
		const all = seats.flatMap(s => [...m.seats[s].active, ...m.seats[s].bench]);
		A(all.every(c => c.l >= m.st.l - 1 && c.r <= m.st.r + 1 && c.t >= m.st.t - 1 && c.b <= m.st.b + 1), `[${name}] nothing runs off the stage`);
		A(!m.hand || [...mine.active, ...mine.bench].every(c => c.b <= m.hand.t + 4), `[${name}] my Pokémon do not cover my hand`, m.hand && [Math.round(Math.max(...mine.bench.map(b => b.b))), Math.round(m.hand.t)]);
		A(opps.every(s => [...m.seats[s].active, ...m.seats[s].bench].every(c => c.b <= Math.min(...mine.active.map(a => a.t)) + 0.5)), `[${name}] no opponent's card reaches down onto mine`);
		A(!errors.length, `[${name}] no page errors`, errors.slice(0, 3).join(' | '));
		if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'mat_' + name.replace(/[^a-z0-9]+/gi, '_') + '.png') }); }
		await page.close();
	}
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
