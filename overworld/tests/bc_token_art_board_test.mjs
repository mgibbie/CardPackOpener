// bc_token_art_board_test.mjs — tokens made outside Lorequest show their art on the board.
//
// bug:1794331480267 (instinctgauntlet, Final Fantasy run): the Bloodhounds Bubba summons and
// Rattlegore resummoned by its own Deathrattle kept a spiral placeholder while their neighbours
// had art. Bubba's token_bloodhound had no art at all; Rattlegore's -1/-1 copy is a NEW id
// (token_rattlegore) that had lost its link to Rattlegore's art. Now the hounds have art and
// every copy of a real card carries `artFrom` — and must REPAINT when that art lands.
//
// A real ?finalfantasy=1 fight: Bubba is played for real at an enemy creature, and Rattlegore
// dies twice for real (two resummons), with both images HELD for a few seconds so the first
// paint is the fallback — then the art must arrive and repaint every face.
//
//   node overworld/tests/bc_token_art_board_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['/opt/chrome/chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9287;
const CDN = 'https://magepunk-cardart.pages.dev/';
const SHOTS = process.env.SHOTS_DIR || os.tmpdir();
const HOLD_MS = 3000;   // art for these ids is held back, so the first paint is the fallback
const HELD = /^(token_bloodhound|rattlegore)\.jpg$/;
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
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?finalfantasy=1`, { waitUntil: 'domcontentloaded' });
		// hero select -> anomaly -> first fight
		const inFight = () => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && g.state.players.length === 2 && !g.state.over); });
		A(await waitFor(async () => {
			if (await inFight()) return true;
			await page.evaluate(() => {
				const o = document.getElementById('dungeon-overlay');
				if (o && getComputedStyle(o).display !== 'none') { const b = [...o.querySelectorAll('button')].find(x => /^(Play this hero|No anomaly|Continue|Fight|Start|Skip)/i.test(x.textContent.trim())); if (b) b.click(); }
				const k = [...document.querySelectorAll('#scry-modal button')].find(x => /keep hand/i.test(x.textContent)); if (k && k.offsetParent) k.click();
			}).catch(() => {});
			return false;
		}, 45000, 400), 'the Final Fantasy fight is live', errs.slice(0, 2));
		await sleep(800);

		// my turn, empty boards; a 0-Attack enemy for the hounds to pile onto; Bubba in hand
		const ids = await page.evaluate(() => {
			const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, O = 1 - H;
			const p = s.players[H];
			p.board.length = 0; s.players[O].board.length = 0;
			p.mana.cur = 30; p.mana.bonus = 0;
			const foe = E.instantiate(s.cardsById.rattlegore, O); foe.zone = 'board'; foe.attack = 0; foe.maxHealth = 99; s.players[O].board.push(foe);
			const bubba = E.instantiate(s.cardsById.duels_bubba, H); bubba.zone = 'hand'; p.hand.push(bubba);
			s.current = H; s.priority = null; s.stack = [];
			g.pump();
			return { bubba: bubba.uid, foe: foe.uid, O };
		});
		await page.evaluate(x => { const g = window.__game; g.E.playCard(g.state, g.HUMAN, x.bubba, { type: 'creature', uid: x.foe, player: x.O }, null, 0); g.pump(); }, ids);
		// Rattlegore on my side, killed twice: each death resummons a -1/-1 copy (a new id)
		for (let k = 0; k < 3; k++) {
			await page.evaluate(first => {
				const g = window.__game, s = g.state, E = g.E, H = g.HUMAN;
				if (first) { const r = E.instantiate(s.cardsById.rattlegore, H); r.zone = 'board'; s.players[H].board.push(r); }
				else { const cur = s.players[H].board.find(c => c.name === 'Rattlegore' && !E.isDead(c)); if (cur) { cur.damage = 999; E.sweepDeaths(s); } }
				g.pump();
			}, k === 0);
			await sleep(250);
		}
		const faces = () => page.evaluate(() => {
			const g = window.__game, H = g.HUMAN;
			return g.state.players[H].board.filter(c => c.id === 'token_bloodhound' || c.name === 'Rattlegore').map(c => ({ uid: c.uid, id: c.id, at: c.attack, art: g.faceArtOf(c.uid) }));
		});
		await sleep(600);
		const early = await faces();
		const hounds0 = early.filter(t => t.id === 'token_bloodhound');
		const rg0 = early.filter(t => t.id !== 'token_bloodhound');
		A(hounds0.length >= 1, 'Bubba put Bloodhounds on the board', early);
		A(rg0.length === 1 && rg0[0].id !== 'rattlegore' && rg0[0].at === 7, 'Rattlegore came back twice: a 7/7 copy under a new id', rg0);
		A(early.every(t => t.art === null), 'while the art is held back they wear the fallback (the repaint is what is tested)', early);

		const settled = await waitFor(async () => {
			const t = await faces();
			return t.length === early.length && t.every(x => x.art === (x.id === 'token_bloodhound' ? 'token_bloodhound' : 'rattlegore'));
		}, 20000, 250);
		const late = await faces();
		A(held.includes('token_bloodhound.jpg') && held.includes('rattlegore.jpg'), 'the board asked for the Bloodhound and Rattlegore art', held);
		A(late.filter(x => x.id === 'token_bloodhound').length === hounds0.length && late.filter(x => x.id === 'token_bloodhound').every(x => x.art === 'token_bloodhound'), 'once it lands, every Bloodhound repaints with its art', late);
		A(late.filter(x => x.id !== 'token_bloodhound').every(x => x.art === 'rattlegore'), 'the resummoned Rattlegore copy repaints with Rattlegore\'s art', late);
		A(settled, 'everything settled within 20 s');
		await page.screenshot({ path: path.join(SHOTS, 'bc_token_art_board.png') });
		console.log('screenshot: ' + path.join(SHOTS, 'bc_token_art_board.png'));
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
