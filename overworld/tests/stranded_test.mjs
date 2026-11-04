// stranded_test.mjs — the player must never be boxed in on a tile they cannot
// stand on.
//
// Two softlocks reported the same afternoon, by different routes:
//   * the S.S. Anne departure walked the player 9 tiles south onto open ocean
//     and the scene ended there — surfing=false, every direction bumping;
//   * the Slateport Harbor exit landed them on the harbor roof at (32,22),
//     walled on three sides with water north.
// In both, the only escape was Fly, which a player may not have.
//
// NEITHER REPRODUCES FROM THE MAP DATA, and I would rather say so than invent a
// cause. The harbor's exit warp resolves to the correct door in both region
// copies (warp 8 -> 28,12), and the S.S. Anne departure runs to completion when
// traced live: down 9, back up 9, vars 1->2, warp to Vermilion.
//
// So this catches the CLASS instead. A scripted walk ignores collision by
// design, which means any script, warp or ferry can leave the player on a tile
// the rules forbid — and today that is unrecoverable on foot.
//
// WATCHDOG 4 is deliberately timid: it acts only when the player is on an
// illegal tile AND cannot move in any direction AND nothing else owns the screen
// (no cutscene mid-walk, no menu, no battle), for two full seconds. The second
// case below is the one that matters for trust — a surfing player is on water on
// purpose and must be left alone.
//
//   node overworld/tests/stranded_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- live: win the fight, watch the beat ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 9103;
	const STATE = { username: 'strand', friendCode: 'POSTB0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let b = {}; try { b = JSON.parse(raw); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
			if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
			return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'strand-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'JOHTO');
			if (!localStorage.getItem('magepunk_story'))
				localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'cyndaquil', name: 'CYNDAQUIL', level: 60, gender: 'M', friend: 70, types: ['Fire'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 200, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 200, curHP: 200,
				exp: 200000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's155.png', num: 155,
			}]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SlowpokeWellB1F`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(1500);
		// ===== WATCHDOG 4: stranded on a tile you cannot stand on =====
		// Reproduces both reported softlocks directly: put the player on water with
		// surfing off, boxed in, and see whether the game gets them out.
		const water = await page.evaluate(() => {
			const W = window.__ow;
			// find a water tile whose neighbours are all water — open ocean, exactly
			// where the S.S. Anne departure left the reporter
			for (let y = 2; y < 60; y++) for (let x = 2; x < 60; x++) {
				if (!W.world.isSurfable(x, y)) continue;
				const boxed = [[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy]) => W.world.isSurfable(x+dx, y+dy));
				if (boxed) return { x, y };
			}
			return null;
		});
		A(!!water, 'found open water to strand the player in', JSON.stringify(water));
		if (water) {
			await page.evaluate(w => {
				const W = window.__ow, p = W.player;
				p.surfing = false; p.moving = false; p.moveFrom = null; p.moveTo = null;
				p.tx = w.x; p.ty = w.y; p.px = w.x * 16; p.py = w.y * 16;
			}, water);
			const before = await page.evaluate(() => ({ at: [window.__ow.player.tx, window.__ow.player.ty] }));
            A(before.at[0] === water.x && before.at[1] === water.y, 'the player is stranded on open water', JSON.stringify(before));

			// the watchdog needs 2s of genuinely stuck before it acts
			await sleep(3500);
			const after = await page.evaluate(() => {
				const W = window.__ow;
				return { at: [W.player.tx, W.player.ty],
					standable: W.world.isPassable(W.player.tx, W.player.ty) && !W.world.isSurfable(W.player.tx, W.player.ty) };
			});
			A(after.at[0] !== water.x || after.at[1] !== water.y, 'the watchdog moved them off it', JSON.stringify(after));
			A(after.standable, 'and onto a tile they can actually stand on', JSON.stringify(after));
		}

		// ===== ...but it must NOT argue with legitimate surfing =====
		if (water) {
			await page.evaluate(w => {
				const W = window.__ow, p = W.player;
				p.surfing = true; p.moving = false;
				p.tx = w.x; p.ty = w.y; p.px = w.x * 16; p.py = w.y * 16;
			}, water);
			await sleep(3200);
			const surf = await page.evaluate(() => ({ at: [window.__ow.player.tx, window.__ow.player.ty], surfing: !!window.__ow.player.surfing }));
			A(surf.at[0] === water.x && surf.at[1] === water.y, 'a surfing player is left exactly where they are', JSON.stringify(surf));
		}
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
