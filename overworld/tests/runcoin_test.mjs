// runcoin_test.mjs — the boss gets its opening Coin in every run mode.
//
// Bot testing, 2026-09-28: "the coin doesn't work" in the Lorequest runs. A
// normal game deals The Coin to everyone after the first player (createGame).
// Every run mode then swaps the boss's deck in with resetDeckAndHand(), which
// clears the hand — and none of the ten (dungeon, heist, tombs, duels,
// lorequest, middle-earth, sword coast, final fantasy, multiverse, arena)
// dealt the Coin back, so the boss (who always goes second) never had one.
// Multiplayer's seat deal already re-adds it; the run modes now do too.
//
//   node overworld/tests/runcoin_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9152;
const STATE = { username: 'runcoin', friendCode: 'RCOIN0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- source: every run mode's boss deal re-adds the Coin ----------
{
	const src = fs.readFileSync(path.join(ROOT, 'battlecards/game.js'), 'utf8');
	// (game.js may be checked out with CRLF line endings)
	const deals = [...src.matchAll(/\r?\n\tE\.resetDeckAndHand\(state, 1, [^\r\n]*\);\r?\n\tE\.drawCards\(state, 1, 4\);\r?\n([^\r\n]*)\r?\n/g)];
	A(deals.length === 10, 'all ten run modes deal the boss a fresh hand', String(deals.length));
	const missing = deals.filter(m => !/E\.addCoin\(state, 1\)/.test(m[1])).length;
	A(deals.length && missing === 0, '...and every one deals the boss its Coin right after', `${missing} missing`);
}

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	for (const mode of ['dungeon', 'heist', 'lorequest', 'middleearth', 'multiverse']) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'runcoin'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?${mode}=1`, { waitUntil: 'domcontentloaded' });
		// click through the run's opening screens (class / hero / power picks) to the first fight
		let live = false;
		for (let i = 0; i < 40 && !live; i++) {
			await sleep(800);
			live = await page.evaluate(() => {
				const o = document.getElementById('dungeon-overlay');
				const up = o && getComputedStyle(o).display !== 'none';
				const s = window.__game && window.__game.state;
				if (!up && s && s.players && s.players.length === 2 && !s.over) return true;
				if (up) { const b = [...o.querySelectorAll('button')].find(x => !/replay|copy|watch|abandon|quit|leaderboard/i.test(x.textContent)); if (b) b.click(); }
				return false;
			}).catch(() => false);
		}
		await sleep(1500);
		const r = await page.evaluate(() => {
			const g = window.__game, s = g.state, H = g.HUMAN;
			return { first: s.current === H && s.turnNumber <= 1, coins: s.players.map(p => p.hand.filter(c => c.id === 'coin').length) };
		}).catch(e => ({ error: String(e.message) }));
		A(live && !r.error, `[${mode}] a run fight starts`, JSON.stringify(r));
		const boss = 1 - (await page.evaluate(() => window.__game.HUMAN).catch(() => 0));
		A(r.first && r.coins && r.coins[boss] === 1, `[${mode}] the boss (going second) opens with exactly one Coin`, JSON.stringify(r));
		A(r.coins && r.coins[1 - boss] === 0, `[${mode}] ...and the player (going first) has none`, JSON.stringify(r));
		A(errors.length === 0, `[${mode}] no uncaught page error`, JSON.stringify(errors.slice(0, 2)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
