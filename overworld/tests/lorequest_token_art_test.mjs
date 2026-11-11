// lorequest_token_art_test.mjs — Lorequest tokens show their art on the board.
//
// bug:1794267812239 (Evidence B): Gimli's Swarming of Moria made three Goblin of Moria
// tokens that stayed purple placeholders for over a minute; bug:1794272972983 / 1794273394890:
// Bolg's Gundabad Goblins and the Dol Guldur Wraiths from Sauron the Necromancer's Relic,
// the same. Those token ids (token_<slug of name>) had no art at all, so the board drew the
// procedural fallback for good. They now have art; a token whose creature an existing card
// already pictures wears that card's art (ART_ALIASES) and must REPAINT when that art lands
// (every board listener used to match the card id, not the art id).
//
// A real ?middleearth=1 fight: play Gimli's Swarming of Moria (the real card) and summon a
// Wild Warg (an aliased token) with the art responses HELD for a few seconds, so each token
// is first painted procedurally — then its art must arrive and repaint the board face.
//
//   node overworld/tests/lorequest_token_art_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['/opt/chrome/chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9283;
const CDN = 'https://magepunk-cardart.pages.dev/';
const SHOTS = process.env.SHOTS_DIR || os.tmpdir();
const HOLD_MS = 3000;   // art for these ids is held back, so the first paint is the fallback
const HELD = /^(token_goblin_of_moria|me_cw_snarling)\.jpg$/;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }
const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', gold: 3000, dust: 0, packs: 0, collection: {}, decks: [], stats: null };

// battlecards/art is gitignored (CI has none): serve the local copy, else the CDN's
async function artBytes(name) {
	const local = path.join(ROOT, 'battlecards/art', name);
	if (fs.existsSync(local)) return fs.readFileSync(local);
	const r = await fetch(CDN + name);
	return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

async function clickInOverlay(page, textIncludes, ms = 20000) {
	return waitFor(() => page.evaluate(t => {
		const box = document.querySelector('#dungeon-overlay'); if (!box || getComputedStyle(box).display === 'none') return false;
		const b = [...box.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().includes(t.toLowerCase()));
		if (!b) return false; b.click(); return true;
	}, textIncludes), ms);
}

(async () => {
	const held = [];
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			const ok = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
			if (msg.action === 'run-load') return ok({ ok: true, runs: {} });
			if (msg.action === 'challenges') return ok({ challenges: [] });
			if (msg.action === 'friends') return ok({ friends: [], friendCode: 'MGIBBIE' });
			if (msg.action === 'chat-get') return ok({ messages: [] });
			return ok({ ok: true, state: STATE, runs: {}, friends: [], challenges: [], match: null, presence: null });
		}
		if (u.startsWith('/battlecards/art/')) {
			const name = u.slice('/battlecards/art/'.length);
			if (HELD.test(name)) { held.push(name); await sleep(HOLD_MS); }
			const d = await artBytes(name);
			if (!d) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(name)] || 'application/octet-stream', 'access-control-allow-origin': '*' }); res.end(d); return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		const errs = [];
		page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
		}, STATE);
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?middleearth=1`, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, 'Play this hero'), 'hero pick appears — chose a hero');
		await clickInOverlay(page, 'No anomaly', 6000);
		await waitFor(() => page.evaluate(() => { const b = [...document.querySelectorAll('#scry-modal button')].find(x => /keep hand/i.test(x.textContent)); if (b && b.offsetParent) { b.click(); return true; } return false; }), 8000);
		A(await waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); }), 30000), 'the Middle-earth fight is live', errs.slice(0, 2));
		await sleep(800);

		// my turn, an empty board, Gimli's Swarming of Moria in hand: play it for real
		const uid = await page.evaluate(() => {
			const g = window.__game, s = g.state, E = g.E, H = g.HUMAN;
			const p = s.players[H];
			p.board.length = 0; s.players[1 - H].board.length = 0;
			p.mana.cur = 30; p.mana.bonus = 0;
			const c = E.instantiate(s.cardsById.me_gimli_swarm, H); c.zone = 'hand'; p.hand.push(c);
			s.current = H; s.priority = null; s.stack = [];
			g.pump();
			return c.uid;
		});
		await page.evaluate(u => { const g = window.__game; g.E.playCard(g.state, g.HUMAN, u, null, null, 0); g.pump(); }, uid);
		// an aliased token (Wild Warg wears Snarling Warg's art)
		await page.evaluate(() => {
			const g = window.__game;
			g.E.summon(g.state, g.HUMAN, { id: 'token_wild_warg', name: 'Wild Warg', type: 'creature', cost: 0, token: true, rarity: 'common', attack: 3, health: 3, keywords: [], description: 'A 3/3 token.' });
			g.pump();
		});
		const tokens = () => page.evaluate(() => {
			const g = window.__game, H = g.HUMAN;
			return g.state.players[H].board.filter(c => c.id.startsWith('token_')).map(c => ({ uid: c.uid, id: c.id, art: g.faceArtOf(c.uid) }));
		});
		await sleep(600);
		const early = await tokens();
		const goblins0 = early.filter(t => t.id === 'token_goblin_of_moria');
		A(goblins0.length === 3, 'Swarming of Moria put three Goblin of Moria tokens on the board', early);
		A(early.some(t => t.id === 'token_wild_warg'), 'the Wild Warg token is on the board', early);
		A(early.every(t => t.art === null), 'while the art is held back they wear the fallback (the repaint is what is tested)', early);

		const settled = await waitFor(async () => {
			const t = await tokens();
			return t.length === 4 && t.filter(x => x.id === 'token_goblin_of_moria').every(x => x.art === 'token_goblin_of_moria')
				&& t.find(x => x.id === 'token_wild_warg')?.art === 'me_cw_snarling';
		}, 20000, 250);
		const late = await tokens();
		A(held.includes('token_goblin_of_moria.jpg'), 'the board asked for the Goblin of Moria art', held);
		A(late.filter(x => x.id === 'token_goblin_of_moria').length === 3 && late.filter(x => x.id === 'token_goblin_of_moria').every(x => x.art === 'token_goblin_of_moria'), 'once it lands, all three Goblin of Moria tokens repaint with their art', late);
		A(late.find(x => x.id === 'token_wild_warg')?.art === 'me_cw_snarling', 'the aliased Wild Warg repaints with Snarling Warg\'s art when THAT image lands', late);
		A(settled, 'everything settled within 20 s');
		await page.screenshot({ path: path.join(SHOTS, 'lorequest_token_art_board.png') });
		console.log('screenshot: ' + path.join(SHOTS, 'lorequest_token_art_board.png'));
		A(!errs.length, 'no page errors', errs.slice(0, 3));
	} catch (e) {
		fail++; console.log('FAIL: threw ' + (e && e.stack || e));
	} finally {
		await browser.close();
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
