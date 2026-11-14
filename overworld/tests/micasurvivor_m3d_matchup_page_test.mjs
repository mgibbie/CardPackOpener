// micasurvivor_m3d_matchup_page_test.mjs — MicaSurvivor 3D: the player is told about a matchup before it hurts, in a real
// browser (Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, part A: A3).
//
// With the games' own type chart (2026-11-13) a bad matchup is no longer "slower": it can be "nothing happens". So:
//   * a move's level-up card says how its type does against the kinds of enemy alive now: strong vs N, weak vs N, no
//     effect on N (each species counted once); a card that is not a damaging move says nothing
//   * an enemy that NONE of your moves can hurt (your hits on it are a Struggle) wears a grey bead; with one move that
//     can hurt it, it does not
//   node overworld/tests/micasurvivor_m3d_matchup_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9921;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"no"}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };
	const M = (f, ...a) => page.evaluate(f, ...a);

	// a fight as Pikachu with one Electric move; you cannot fall, and nobody can
	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?gen=5&fight=1&dex=25&moves=thunder-shock`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => M(() => !!(window.__m3d && window.__m3d.ready)), 30000), 'a fight boots (Pikachu, Thunder Shock)');
	await M(() => { const m = window.__m3d; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	// three kinds of enemy alive, given the types this needs: one Ground (immune), one Water (weak to it), one Grass (resists)
	const three = await waitFor(() => M(() => new Set(window.__m3d.world.enemies.filter((e) => !e.dead).map((e) => e.dex)).size >= 3), 40000);
	const set = () => M(() => { const m = window.__m3d, ty = [['ground'], ['water', 'flying'], ['grass']], by = new Map(); for (const e of m.world.enemies) { if (e.dead) continue; if (!by.has(e.dex)) by.set(e.dex, ty[by.size] || ['normal']); e.types = by.get(e.dex); e.hp = e.maxHp = 1e9; } return by.size; });
	const kinds = await set();
	const q = await M(() => window.__m3d.matchup('electric'));
	A(three && q.n === kinds && q.strong === 1 && q.weak === 1 && q.immune === 1, `Electric against the ${kinds} kinds here: strong vs 1 (Water / Flying), weak vs 1 (Grass), no effect on 1 (Ground)`, q);

	// the grey bead: Thunder Shock alone cannot hurt the Ground ones
	const groundN = await M(() => window.__m3d.world.enemies.filter((e) => !e.dead && e.types[0] === 'ground').length), w1 = await M(() => window.__m3d.walled());
	A(groundN > 0 && w1 === groundN, `the ${groundN} Ground enemy(ies) wear the grey bead: none of your moves can hurt them`, { groundN, w1 });
	await shot('matchup-bead.png');

	// level up until a damaging move's card is on offer: it carries the line, and the line is the count
	let seen = null;
	for (let k = 0; k < 14 && !seen; k++) {
		await M(() => { const m = window.__m3d, s = m.state; m.drop('xp', s.x, s.z, 400); });
		if (!(await waitFor(() => M(() => document.querySelectorAll('#cards button[data-i]').length >= 3), 10000))) break;
		await set();
		// (the cards are drawn when the level comes up: read them against the enemies as they are then)
		seen = await M(() => {
			const m = window.__m3d, cs = m.world.pl.choices || [], bs = [...document.querySelectorAll('#cards button[data-i]')], out = [];
			cs.forEach((c, i) => { const mu = bs[i] && bs[i].querySelector('.mu'); out.push({ type: c.type, mtype: c.mtype || null, id: c.id, mu: mu ? mu.textContent : null }); });
			return out.some((c) => c.mu) ? out : null;
		});
		if (!seen) await M(() => window.__m3d.pickCard(0));
	}
	const mv = seen && seen.find((c) => c.mu), plain = seen ? seen.filter((c) => !c.mtype) : [];
	A(!!mv && /(strong vs|weak vs|no effect on) \d/.test(mv.mu) && /of \d+ here/.test(mv.mu), `a move's card says how it does against the enemies here ("${mv && mv.mu}")`, seen);
	A(!!seen && plain.every((c) => c.mu === null), 'a card that is not a move says nothing about types', seen);
	await shot('matchup-cards.png');

	// a second move that CAN hurt Ground: the bead goes
	await M(() => { const m = window.__m3d; while (m.world.pl.choices) m.pickCard(0); m.world.pl.moves.push({ id: 'x', type: 'water', kind: 'projectile', cd: 1e9, t: 0 }); });
	const w2 = await M(() => window.__m3d.walled());
	A(w2 === 0, 'with one move that can hurt them (a Water move), nobody wears the bead', w2);
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 4));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
