// micasurvivor_matchup_2d_test.mjs — the 2D game tells you about a matchup before it hurts, in a real browser
// (Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, part A: A3; the 3D modes have had it since #1197).
// With the games' own type chart a bad matchup can be "nothing happens", so:
//   * a move's level-up card says how its type does against the kinds of enemy here: Strong vs N, Weak vs N, No effect on N,
//     N kinds here (each species counted once; in English through the page's translator); an upgrade card says nothing
//   * an enemy none of your moves can hurt wears a grey bead; with one move that can, it does not
//   node overworld/tests/micasurvivor_matchup_2d_test.mjs     (MICASURVIVOR_SHOTS=<dir> for a screenshot)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8841;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const E = (fn, ...a) => page.evaluate(fn, ...a);

	// boot -> guest -> a run (Pikachu), paused: the test lays the field out by hand
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden')), 30000), 'the 2D game boots', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-login'), 10000);
	await page.click('#btn-guest');
	await waitFor(() => visible('scr-starters'), 8000);
	await E(() => { const c = document.querySelector('#starter-grid .cell[data-dex="25"]') || document.querySelector('#starter-grid .cell'); if (c) c.click(); }); await sleep(250);
	await page.click('#starter-ok');
	await waitFor(() => visible('scr-menu'), 10000);
	await page.click('#scr-menu [data-go=play]');
	await E(() => { for (const s of ['[data-cat=survival]', '[data-var=normal]', '[data-players=solo]', '#mx-start']) document.querySelector('#scr-play ' + s).click(); });
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'a run starts');
	await sleep(400);
	const set = await E(() => {
		G.Game.togglePause(); G.UI.hide('scr-pause');
		const pl = G.Game.player; pl.invuln = 1e9;
		G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields();
		const mk = (dex, dx, dy) => { const def = { dex, name: 'T' + dex, hp: 1e6, spd: 0, dmg: 0, xp: 1, behavior: 'chaser' }; const e = new G.Enemy(def, pl.x + dx, pl.y + dy, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); return e; };
		const m = G.Moves.instance('thunder-shock', 1); pl.moves = [m]; pl.slots = [[m]]; pl.active = 0;
		const g = mk(27, 60, 0), wa = mk(7, -60, 0), gr = mk(1, 0, 60), g2 = mk(27, 0, -60);   // (Sandshrew: Ground, twice; Squirtle: Water; Bulbasaur: Grass / Poison)
		G.EnemyMgr.rebuildGrid();
		return { g: g.types, wa: wa.types, gr: gr.types, lang: G.I18n.lang };
	});
	const q = await E(() => G.Types.matchup('electric', G.EnemyMgr.all()));
	A(q.n === 3 && q.strong === 1 && q.weak === 1 && q.immune === 1, 'Electric against the 3 kinds here (two Sandshrew count once): strong vs Squirtle, weak vs Bulbasaur, no effect on Sandshrew', { q, set });

	// the grey bead: drawn over the Ground ones (the enemy's own draw asks G.Types.noAnswer)
	const bead = await E(() => { const pl = G.Game.player; return G.EnemyMgr.all().map((e) => [e.dex, G.Types.noAnswer(pl.moves, e.types, e.dex)]); });
	A(bead.filter((b) => b[0] === 27).every((b) => b[1]) && bead.filter((b) => b[0] !== 27).every((b) => !b[1]), 'the two Sandshrew wear the grey bead (none of your moves can hurt them); the others do not', bead);
	const drawn = await E(() => { const e = G.EnemyMgr.all().find((q) => q.dex === 27), c = document.createElement('canvas'); c.width = c.height = 400; const ctx = c.getContext('2d'), calls = [], fill = ctx.fill.bind(ctx); ctx.fill = (...a) => { calls.push(ctx.fillStyle); return fill(...a); }; try { e.draw(ctx); } catch (err) { return { err: String(err).slice(0, 120), calls }; } return { calls }; });   // (a real canvas, its fill watched: the bead's colour is drawn)
	A(drawn.calls && drawn.calls.includes('#b9c2cf'), 'the enemy\'s own draw puts the bead on it', drawn);

	// a level-up: the card for a move carries the line, in English; an upgrade card has none
	await E(() => { const pl = G.Game.player; let list = null; for (let i = 0; i < 300 && !list; i++) { const o = G.LevelUp.offer(pl); if (o.some((c) => c.type === 'up') && o.some((c) => c.type === 'stat')) list = o; } if (!list) list = G.LevelUp.offer(pl); G.RunUI.showLevelUp(pl.level, list, (card) => card.apply(pl)); });
	await waitFor(() => visible('scr-levelup'), 5000);
	await sleep(500);
	const cards = await E(() => [...document.querySelectorAll('#cards .card')].map((c) => ({ key: (G.RunUI.offers[[...c.parentNode.children].indexOf(c)] || {}).key, mu: (c.querySelector('.mu') || {}).innerText || null })));
	const up = cards.find((c) => /^up:thunder-shock/.test(c.key || '')), other = cards.filter((c) => !/^(new|up|swap):/.test(c.key || ''));
	A(!!up && /Strong vs\s*1/.test(up.mu) && /Weak vs\s*1/.test(up.mu) && /No effect on\s*1/.test(up.mu) && /3\s*kinds here/.test(up.mu), `Thunder Shock's card says it, in English ("${up && up.mu && up.mu.replace(/\s+/g, ' ')}")`, cards);
	A(other.length > 0 && other.every((c) => c.mu === null), 'a card that is not a move says nothing about types', cards);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'matchup_2d_cards.png') }); }
	// one move that can hurt Ground: the bead goes
	await E(() => { const pl = G.Game.player; pl.moves.push(G.Moves.instance('water-gun', 1)); });
	A(await E(() => G.EnemyMgr.all().every((e) => !G.Types.noAnswer(G.Game.player.moves, e.types, e.dex))), 'with Water Gun as well, nobody wears the bead');
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 4));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
